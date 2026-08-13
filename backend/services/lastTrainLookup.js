const mockStations = require("../data/mockStations");
const timetableIndex = require("../data/timetableLastTrain.json");
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

// 실제 API가 돌려주는 종착역명은 "불암산(당고개)" 대신 "불암산"만 오는 것처럼, 우리
// lineStations.json의 병기 표기와 정확히 안 맞을 수 있다. 그럴 땐 괄호 앞부분/괄호 안
// 내용으로도 찾아본다("총신대입구(이수)" 같은 역도 같은 문제).
function findStationIndex(stations, name) {
  const exact = stations.indexOf(name);
  if (exact !== -1) return exact;
  return stations.findIndex((s) => {
    const base = s.replace(/\([^)]*\)$/, "");
    if (base === name) return true;
    const paren = s.match(/\(([^)]+)\)$/)?.[1];
    return paren === name;
  });
}

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
    const destIndex = findStationIndex(stations, result.destination);
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

// backend/scripts/buildTimetable.js가 서울교통공사 "열차운행시각표" 원본 CSV(backend/data/*.csv)
// 로 미리 만들어둔 실제 시각표 데이터. 15개 표본역(mockStations)의 weekday/weekend 값은
// 더미이지만, 이 데이터는 실제 공개된 운행 스케줄이라 SEOUL_API_KEY가 없거나 실시간 API
// 호출이 실패했을 때 표본/보간 추정보다 먼저 참고한다. 시각표 원본은 UP/DOWN(또는
// IN/OUT) 같은 물리적 진행방향으로 기록돼 있어서, lookupOfficialDynamic과 동일하게
// "그 방향 열차의 종착역이 lineStations.json 배열에서 앞/뒤 중 어디에 있는지"로
// forward/backward를 판단한다.
function lookupFromTimetable({ name, line, weekdayType, direction }) {
  const lineNum = line.match(/^(\d+)호선/)?.[1];
  if (!lineNum) return null;
  const entries = timetableIndex[`${lineNum}호선`]?.[name];
  if (!entries) return null;

  const stations = getMainLineStations(line);
  const stationIndex = stations ? stations.indexOf(name) : -1;
  if (!stations || stationIndex === -1) return null;

  // 같은 물리적 방향(UP/DOWN 등)이라도 분기역에서는 종착역이 갈릴 수 있어서, 종착역별
  // 막차가 여러 건 있을 수 있다. 그중 요청한 forward/backward로 분류되는 것들 중
  // 가장 늦은 시각을 고른다.
  let best = null;
  for (const rawDirection of Object.keys(entries)) {
    const byDestination = entries[rawDirection]?.[weekdayType];
    if (!byDestination) continue;
    for (const [destination, time] of Object.entries(byDestination)) {
      const destIndex = findStationIndex(stations, destination);
      if (destIndex === -1) continue;
      const classified = destIndex > stationIndex ? "forward" : "backward";
      if (classified !== direction) continue;
      // "00:xx"는 자정을 넘긴 같은 서비스일이라 "23:xx"보다 문자열로는 작아 보여도
      // 실제로는 더 늦은 시각이다. 새벽 4시 이전은 24시간을 더해 비교해야 진짜
      // 막차(가장 늦은 시각)를 고를 수 있다.
      const extendedMinutes = timeToMinutes(time) + (Number(time.split(":")[0]) < 4 ? 1440 : 0);
      if (!best || extendedMinutes > best.extendedMinutes) {
        best = { time, destination, extendedMinutes };
      }
    }
  }
  if (best) {
    return { available: true, time: best.time, source: "timetable", destination: best.destination };
  }
  // 이 역의 시각표 데이터 자체는 있는데, 요청한 방향으로 분류되는 열차가 하나도 없다면
  // (예: 종점역에서 그 이상 진행하는 방향) 실제로 그 방향 운행이 없는 것으로 본다.
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

    // 실 API를 못 쓰거나 실패했으면, 더미인 표본값보다 실제 시각표 데이터를 먼저 참고한다.
    const timetableResult = lookupFromTimetable({ name, line, weekdayType, direction });
    if (timetableResult) return timetableResult;

    if (dirEntry.unavailable || !dirEntry[key]) {
      return { available: false, reason: NO_TRAIN_REASON };
    }
    return { available: true, time: dirEntry[key], source: "sample" };
  }

  // 표본 15개 역에 없는 역: 우선 역명 검색 API로 코드를 찾아 공식 API를 직접 호출해본다.
  // 이러면 표본에 없는 역도 진짜 데이터를 받을 수 있다. 실패할 때만(코드 못 찾음, 그
  // 방향 판단 불가 등) 아래로 넘어간다.
  const dynamicOfficial = await lookupOfficialDynamic({ name, line, weekdayType, direction });
  if (dynamicOfficial) return dynamicOfficial;

  // 실 API로도 안 되면, 다음으로는 실제 시각표 데이터를 참고한다. 그마저 이 역/노선
  // 데이터가 없을 때만(이름 매칭 실패 등) 가까운 표본역 기준 보간으로 넘어간다.
  const timetableResult = lookupFromTimetable({ name, line, weekdayType, direction });
  if (timetableResult) return timetableResult;

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
