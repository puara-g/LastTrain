const mockStations = require("../data/mockStations");
const seoulMetroApi = require("./seoulMetroApi");
const { resolveExternalCode } = require("./stationCodeResolver");
const { getMainLineStations } = require("./routeFinder");
const { AVG_MINUTES_PER_STOP } = require("../data/estimate");

function timeToMinutes(timeStr) {
  const [h, m] = timeStr.split(":").map(Number);
  return h * 60 + m;
}

function minutesToTime(totalMinutes) {
  const normalized = ((totalMinutes % 1440) + 1440) % 1440;
  const h = Math.floor(normalized / 60);
  const m = Math.round(normalized % 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

const NO_TRAIN_REASON = "이 역은 이 방향으로 가는 열차가 없어요(종점이거나 단방향 구간).";

// mockStations에 손으로 등록해둔 15개 역이 아니어도, "역명으로 역외부코드 찾기" API로
// 즉석에서 코드를 찾아 공식 막차 API를 바로 호출해본다. 상행/하행 중 어느 쪽이 요청받은
// forward/backward에 해당하는지는 API가 돌려주는 종착역명을 노선 배열에서의 위치와
// 비교해서 판단한다(미리 손으로 태깅해둔 값이 없으므로).
async function lookupOfficialDynamic({ name, line, weekdayType, direction }) {
  if (!seoulMetroApi.isConfigured()) return null;

  const frCode = await resolveExternalCode(name, line);
  if (!frCode) return null;

  const stations = getMainLineStations(line);
  const stationIndex = stations ? stations.indexOf(name) : -1;
  if (!stations || stationIndex === -1) return null;

  function classify(result) {
    if (!result) return null;
    const destIndex = stations.indexOf(result.destination);
    if (destIndex === -1) return null; // 종착역이 이 배열 밖(코레일 직결 구간 등)이면 판단 불가
    return destIndex > stationIndex ? "forward" : "backward";
  }

  let up;
  let down;
  try {
    [up, down] = await Promise.all([
      seoulMetroApi.fetchLastTrain({ stationExternalCode: frCode, weekdayType, direction: "up" }),
      seoulMetroApi.fetchLastTrain({ stationExternalCode: frCode, weekdayType, direction: "down" }),
    ]);
  } catch (err) {
    console.error("[lastTrainLookup] 동적 조회 실패:", err.message);
    return null;
  }

  const upDir = classify(up);
  const downDir = classify(down);
  if (upDir === direction) return { available: true, time: up.time, source: "official", destination: up.destination };
  if (downDir === direction) return { available: true, time: down.time, source: "official", destination: down.destination };
  if (up === null && down === null) {
    // 두 방향 다 데이터가 없음 → 이 역 자체에 이 API 데이터가 없는 것으로 보고 추정으로 폴백
    return null;
  }
  // 데이터는 있는데 방향 판단이 안 되거나(종착역이 배열 밖) 요청한 방향과 안 맞는 경우
  return { available: false, reason: NO_TRAIN_REASON };
}

// 특정 역+노선의 "한쪽 방향"(direction: "forward"|"backward" — lineStations.json 배열
// 인덱스가 증가/감소하는 쪽) 막차를 조회합니다. official > sample > estimated 순으로 시도하고,
// 어느 것도 안 되면 available:false를 돌려줍니다. 막차 시각 계산(구간별/환승 포함 마지노선
// 계산)에 재사용하기 위해 routes/lastTrain.js와는 별도의 내부 서비스로 뺐습니다.
async function lookupDirectional({ name, line, weekdayType, direction }) {
  const key = weekdayType === "weekday" ? "weekday" : "weekend";
  const station = mockStations.find((s) => s.name === name && s.line === line);

  if (station) {
    const dirIndex = station.directions.findIndex((d) => d.dir === direction);
    if (dirIndex === -1) {
      return { available: false, reason: "이 역에는 이 방향 데이터 자체가 없어요." };
    }
    const dirEntry = station.directions[dirIndex];

    if (seoulMetroApi.isConfigured()) {
      try {
        // mockStations의 directions 배열은 항상 [상행(API 코드1) 성격, 하행(API 코드2) 성격]
        // 순서로 채워뒀으므로, 배열 위치로 상행/하행 API 파라미터를 정한다.
        const apiDirection = dirIndex === 0 ? "up" : "down";
        const result = await seoulMetroApi.fetchLastTrain({
          stationExternalCode: station.externalCode,
          weekdayType,
          direction: apiDirection,
        });
        if (result) {
          return { available: true, time: result.time, source: "official", destination: result.destination };
        }
        // result가 null이면 "이 방향엔 이 API에 데이터가 없다"는 뜻인데, 종점이라 정말
        // 없는 경우도 있지만 2호선처럼 노선 전체가 이 API에 없는 경우도 있다. 여기서
        // 바로 실패 처리하지 않고, 아래 샘플 값(있다면)으로 폴백한다.
      } catch (err) {
        console.error("[lastTrainLookup] 실 API 호출 실패, 샘플/추정으로 대체합니다:", err.message);
        // 아래에서 샘플로 폴백
      }
    }

    if (dirEntry.unavailable || !dirEntry[key]) {
      return { available: false, reason: NO_TRAIN_REASON };
    }
    return { available: true, time: dirEntry[key], source: "sample" };
  }

  // 표본 15개 역에 없는 역: 우선 역명 검색 API로 코드를 찾아 공식 API를 직접 호출해본다.
  // 이러면 표본에 없는 역도 진짜 데이터를 받을 수 있다. 실패할 때만(코드 못 찾음, 그
  // 방향 판단 불가 등) 아래의 "가까운 표본역 기준 보간"으로 넘어간다.
  const dynamicOfficial = await lookupOfficialDynamic({ name, line, weekdayType, direction });
  if (dynamicOfficial) return dynamicOfficial;

  const stations = getMainLineStations(line);
  if (!stations) return { available: false, reason: "이 노선은 표본 데이터가 없어요." };
  const targetIndex = stations.indexOf(name);
  if (targetIndex === -1) return { available: false, reason: "이 역을 이 노선에서 찾을 수 없어요." };

  const candidates = mockStations
    .filter((s) => s.line === line && stations.includes(s.name))
    .map((s) => ({ ...s, index: stations.indexOf(s.name) }))
    .sort((a, b) => Math.abs(a.index - targetIndex) - Math.abs(b.index - targetIndex));
  if (candidates.length === 0) {
    return { available: false, reason: "이 노선은 표본 데이터가 없어요." };
  }

  const base = candidates[0];
  const hops = targetIndex - base.index;
  const baseDirEntry = base.directions.find((d) => d.dir === direction);
  if (!baseDirEntry || baseDirEntry.unavailable || !baseDirEntry[key]) {
    return {
      available: false,
      reason: `${base.name}역 기준으로 보면 이 방향은 운행 정보가 없어요.`,
    };
  }

  const offsetMinutes = (direction === "forward" ? hops : -hops) * AVG_MINUTES_PER_STOP;
  const estimatedTime = minutesToTime(timeToMinutes(baseDirEntry[key]) + offsetMinutes);
  return {
    available: true,
    time: estimatedTime,
    source: "estimated",
    basedOn: { name: base.name, hops: Math.abs(hops) },
  };
}

// 어느 역에서 어느 역으로 가는지를 보고, 같은 노선 배열에서 forward/backward 중
// 어느 방향인지 판단합니다.
function directionBetween(line, fromStation, toStation) {
  const stations = getMainLineStations(line);
  if (!stations) return null;
  const fromIndex = stations.indexOf(fromStation);
  const toIndex = stations.indexOf(toStation);
  if (fromIndex === -1 || toIndex === -1) return null;
  return toIndex > fromIndex ? "forward" : "backward";
}

module.exports = { lookupDirectional, directionBetween, timeToMinutes, minutesToTime };
