// backend/data/*.csv (서울교통공사 "서울 도시철도 열차운행시각표" 원본, CP949 인코딩)를
// 읽어서 두 가지 결과물을 만든다.
//
// 1. backend/data/timetableLastTrain.json — "역+방향+요일유형별 막차 시각" 인덱스.
//    SEOUL_API_KEY가 없거나 API 호출이 실패했을 때, 15개 표본역 기준 추정치 대신 이
//    실제 시각표 데이터를 우선 참고하기 위함.
// 2. backend/data/segmentTravelTimes.json — "역과 바로 다음 역 사이 실제 이동시간(분)"
//    인덱스. routeFinder.js가 경로의 예상 소요시간을 계산할 때, 역당 평균 2.5분이라는
//    획일적인 추정치 대신 이 실측값을 우선 참고하기 위함. 같은 열차코드로 묶인 행들을
//    시각 순으로 정렬하면 그 열차가 실제로 어느 역, 어느 역을 연달아 지났는지 알 수
//    있고, 그 사이의 시간차가 곧 구간 이동시간이다.
//
// 원본 CSV들은 서로 데이터가 겹친다(예: [7호선] 파일은 사실상 전체 노선 데이터를 다
// 포함하고 있다). 그래서 파일 이름이 아니라 각 행의 "호선" 컬럼 값을 기준으로 묶고,
// 중복 행이 있어도 결과(막차는 최댓값, 구간시간은 중앙값)에는 영향이 없도록 계산한다.
//
// 사용법: backend 폴더에서 `node scripts/buildTimetable.js`

const fs = require("fs");
const path = require("path");
const iconv = require("iconv-lite");

const DATA_DIR = path.join(__dirname, "..", "data");
const LAST_TRAIN_OUTPUT_PATH = path.join(DATA_DIR, "timetableLastTrain.json");
const SEGMENT_TIMES_OUTPUT_PATH = path.join(DATA_DIR, "segmentTravelTimes.json");
const lineStations = require("../data/lineStations.json");

const DAY_CODE_MAP = { DAY: "weekday", SAT: "saturday", END: "sunday" };

// 구간 이동시간으로 인정할 값의 범위. 이 밖의 값은 급행이 중간역을 건너뛰었거나 데이터
// 오류일 가능성이 높아 제외한다(서울 도시철도 역간 이동시간은 실제로 거의 항상 1~10분
// 사이다).
const MIN_SEGMENT_MINUTES = 1;
const MAX_SEGMENT_MINUTES = 15;

// 호선번호(1~9)별로 "이 CSV 역명이 실제로 무슨 역인지" 판단할 후보 역명 목록(본선+지선
// 전부)을 만든다. CSV 역명은 lineStations.json 표기와 괄호 유무가 다를 수 있다
// (예: "불암산" vs "불암산(당고개)", "이수" vs "총신대입구(이수)").
function buildCandidatesByLineNum() {
  const map = new Map(); // lineNum(string) -> Set(canonical station names)
  lineStations.forEach((entry) => {
    const lineNum = entry.line.match(/^(\d+)호선/)?.[1];
    if (!lineNum) return;
    if (!map.has(lineNum)) map.set(lineNum, new Set());
    entry.stations.forEach((s) => map.get(lineNum).add(s));
    (entry.branches || []).forEach((b) => b.stations.forEach((s) => map.get(lineNum).add(s)));
  });
  return map;
}

// 호선번호별로 "실제로 바로 옆 역인 쌍"의 집합을 만든다. 열차의 연속된 두 정차역이라도
// 이 집합에 없으면(=급행이 중간역을 건너뛴 경우) 구간 이동시간 계산에서 제외한다.
function buildAdjacentPairsByLineNum() {
  const map = new Map(); // lineNum(string) -> Set("역A::역B")
  function addPairs(set, stations, loop) {
    for (let i = 0; i < stations.length - 1; i++) {
      set.add(`${stations[i]}::${stations[i + 1]}`);
      set.add(`${stations[i + 1]}::${stations[i]}`);
    }
    if (loop) {
      set.add(`${stations[stations.length - 1]}::${stations[0]}`);
      set.add(`${stations[0]}::${stations[stations.length - 1]}`);
    }
  }
  lineStations.forEach((entry) => {
    const lineNum = entry.line.match(/^(\d+)호선/)?.[1];
    if (!lineNum) return;
    if (!map.has(lineNum)) map.set(lineNum, new Set());
    const set = map.get(lineNum);
    addPairs(set, entry.stations, entry.type === "loop");
    (entry.branches || []).forEach((b) => addPairs(set, b.stations, false));
  });
  return map;
}

function resolveCanonicalName(candidates, csvName) {
  if (candidates.has(csvName)) return csvName;
  for (const c of candidates) {
    const base = c.replace(/\([^)]*\)$/, "");
    if (base === csvName) return c;
    const paren = c.match(/\(([^)]+)\)$/)?.[1];
    if (paren === csvName) return c;
  }
  return null;
}

// "00:xx"~"03:xx"는 자정을 넘긴 다음날 새벽으로 보고 24~27시대로 취급해야 진짜
// 마지막 열차(가장 늦은 시각)나 열차의 실제 정차 순서를 정확히 계산할 수 있다.
function timeToSortableMinutes(timeStr) {
  const [hh, mm] = timeStr.split(":").map(Number);
  const h = hh < 4 ? hh + 24 : hh;
  return h * 60 + mm;
}

function toDisplayTime(sortableMinutes) {
  const normalized = sortableMinutes % (24 * 60);
  const h = Math.floor(normalized / 60);
  const m = normalized % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function median(numbers) {
  const sorted = [...numbers].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function parseCsv(filePath) {
  const buf = fs.readFileSync(filePath);
  const text = iconv.decode(buf, "cp949");
  const lines = text.split(/\r\n|\n/);
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    const cols = line.split(",");
    if (cols.length < 12) continue;
    rows.push({
      lineNum: cols[1],
      stationName: cols[3],
      dayCode: cols[4],
      direction: cols[5],
      trainCode: cols[7],
      arrivalTime: cols[8],
      departTime: cols[9],
      destination: cols[11],
    });
  }
  return rows;
}

function buildLastTrainIndex(allRows, candidatesByLineNum) {
  // index[lineNum][canonicalName][direction][weekdayType] = { destination: sortableMinutes }
  const index = {};
  let skippedNoDepart = 0;
  let skippedUnresolved = 0;
  const unresolvedNames = new Set();

  for (const row of allRows) {
    if (!row.departTime) {
      skippedNoDepart++;
      continue;
    }
    const weekdayType = DAY_CODE_MAP[row.dayCode];
    if (!weekdayType) continue;

    const candidates = candidatesByLineNum.get(row.lineNum);
    if (!candidates) continue;
    const canonicalName = resolveCanonicalName(candidates, row.stationName);
    if (!canonicalName) {
      skippedUnresolved++;
      unresolvedNames.add(`${row.lineNum}호선:${row.stationName}`);
      continue;
    }

    const sortableMinutes = timeToSortableMinutes(row.departTime);

    // 강동(5호선/마천지선 분기점)처럼, 같은 물리적 방향(UP/DOWN)이라도 역에 따라 서로
    // 다른 종착역(본선 계속 vs 지선 진입)으로 갈라지는 경우가 있다. 시각이 가장 늦은
    // 딱 한 건만 남기면 그중 하나의 종착역 정보가 통째로 사라지므로, 종착역별로
    // 각각의 막차를 따로 남긴다.
    const lineKey = `${row.lineNum}호선`;
    index[lineKey] ??= {};
    index[lineKey][canonicalName] ??= {};
    index[lineKey][canonicalName][row.direction] ??= {};
    index[lineKey][canonicalName][row.direction][weekdayType] ??= {};
    const byDestination = index[lineKey][canonicalName][row.direction][weekdayType];
    const existing = byDestination[row.destination];
    if (!existing || sortableMinutes > existing.sortableMinutes) {
      byDestination[row.destination] = { sortableMinutes };
    }
  }

  // 최종 결과 파일에는 목적지별 "시:분" 표시 시각만 남긴다(비교용 sortableMinutes는 제외).
  for (const lineKey of Object.keys(index)) {
    for (const stationName of Object.keys(index[lineKey])) {
      for (const direction of Object.keys(index[lineKey][stationName])) {
        for (const weekdayType of Object.keys(index[lineKey][stationName][direction])) {
          const byDestination = index[lineKey][stationName][direction][weekdayType];
          for (const destination of Object.keys(byDestination)) {
            byDestination[destination] = toDisplayTime(byDestination[destination].sortableMinutes);
          }
        }
      }
    }
  }

  return { index, skippedNoDepart, skippedUnresolved, unresolvedNames };
}

function buildSegmentTimes(allRows, candidatesByLineNum, adjacentPairsByLineNum) {
  // 같은 열차(호선+열차코드+요일유형)가 하루 동안 정차한 역들을 모은다.
  const trainRuns = new Map(); // "lineNum::trainCode::dayCode" -> [{ stationName, arrivalMin, departMin }]
  for (const row of allRows) {
    if (!row.trainCode) continue;
    const key = `${row.lineNum}::${row.trainCode}::${row.dayCode}`;
    if (!trainRuns.has(key)) trainRuns.set(key, []);
    trainRuns.get(key).push({
      lineNum: row.lineNum,
      stationName: row.stationName,
      arrivalMin: row.arrivalTime ? timeToSortableMinutes(row.arrivalTime) : null,
      departMin: row.departTime ? timeToSortableMinutes(row.departTime) : null,
    });
  }

  // "lineNum::from::to" -> [분 표본들]
  const samplesByPair = new Map();

  for (const stops of trainRuns.values()) {
    if (stops.length < 2) continue;
    stops.sort((a, b) => (a.departMin ?? a.arrivalMin) - (b.departMin ?? b.arrivalMin));

    const candidates = candidatesByLineNum.get(stops[0].lineNum);
    const adjacentPairs = adjacentPairsByLineNum.get(stops[0].lineNum);
    if (!candidates || !adjacentPairs) continue;

    for (let i = 0; i < stops.length - 1; i++) {
      const from = stops[i];
      const to = stops[i + 1];
      if (from.departMin == null) continue;
      const toTime = to.arrivalMin ?? to.departMin;
      if (toTime == null) continue;

      const fromCanonical = resolveCanonicalName(candidates, from.stationName);
      const toCanonical = resolveCanonicalName(candidates, to.stationName);
      if (!fromCanonical || !toCanonical) continue;
      if (!adjacentPairs.has(`${fromCanonical}::${toCanonical}`)) continue; // 급행이 건너뛴 구간 등 제외

      const delta = toTime - from.departMin;
      if (delta < MIN_SEGMENT_MINUTES || delta > MAX_SEGMENT_MINUTES) continue;

      const pairKey = `${stops[0].lineNum}::${fromCanonical}::${toCanonical}`;
      if (!samplesByPair.has(pairKey)) samplesByPair.set(pairKey, []);
      samplesByPair.get(pairKey).push(delta);
    }
  }

  const segmentTimes = {};
  let pairCount = 0;
  for (const [pairKey, samples] of samplesByPair) {
    const [lineNum, from, to] = pairKey.split("::");
    const lineKey = `${lineNum}호선`;
    segmentTimes[lineKey] ??= {};
    segmentTimes[lineKey][`${from}::${to}`] = Math.round(median(samples) * 10) / 10;
    pairCount++;
  }

  return { segmentTimes, pairCount };
}

function main() {
  const candidatesByLineNum = buildCandidatesByLineNum();
  const adjacentPairsByLineNum = buildAdjacentPairsByLineNum();
  const files = fs.readdirSync(DATA_DIR).filter((f) => f.endsWith(".csv") && f.includes("호선"));

  const allRows = files.flatMap((file) => parseCsv(path.join(DATA_DIR, file)));

  const lastTrainResult = buildLastTrainIndex(allRows, candidatesByLineNum);
  fs.writeFileSync(LAST_TRAIN_OUTPUT_PATH, JSON.stringify(lastTrainResult.index));
  console.log(`${LAST_TRAIN_OUTPUT_PATH} 생성 완료`);
  console.log(`- 출발시각 없어서 제외한 행: ${lastTrainResult.skippedNoDepart}`);
  console.log(
    `- 역명 매칭 실패로 제외한 행: ${lastTrainResult.skippedUnresolved} (고유 역명 ${lastTrainResult.unresolvedNames.size}개)`
  );

  const segmentResult = buildSegmentTimes(allRows, candidatesByLineNum, adjacentPairsByLineNum);
  fs.writeFileSync(SEGMENT_TIMES_OUTPUT_PATH, JSON.stringify(segmentResult.segmentTimes));
  console.log(`${SEGMENT_TIMES_OUTPUT_PATH} 생성 완료`);
  console.log(`- 실제 구간 이동시간을 계산한 역 쌍: ${segmentResult.pairCount}개`);
}

main();
