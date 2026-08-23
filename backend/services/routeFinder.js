const fs = require("fs");
const path = require("path");
const { getTransferMinutes } = require("../data/transferTimes");
const { AVG_MINUTES_PER_STOP } = require("../data/estimate");
const { matchesQuery, parseLineQuery } = require("../utils/chosung");
const segmentTravelTimes = require("../data/segmentTravelTimes.json");

const LINE_DATA_PATH = path.join(__dirname, "..", "data", "lineStations.json");

// backend/scripts/buildTimetable.js가 실제 열차운행시각표에서 뽑아낸, 바로 옆 역까지의
// 실측 이동시간(분)이다. 데이터가 없는 구간(신규 구간 등 극히 일부)만 역당 평균값으로
// 대체한다.
function getSegmentMinutes(lineLabel, from, to) {
  // lineLabel은 지선이면 "6호선 응암순환(단방향)"처럼 본선명 뒤에 지선명이 붙어있을 수
  // 있는데, segmentTravelTimes.json은 본선 단위로만 키가 있으므로 앞부분만 뗀다.
  const baseLine = lineLabel.split(" ")[0];
  const minutes = segmentTravelTimes[baseLine]?.[`${from}::${to}`];
  return minutes ?? AVG_MINUTES_PER_STOP;
}

// 노선 간 환승은 정차역 몇 개를 더 타는 것과 비슷한 "번거로움"으로 취급해 경로 탐색 시
// 불필요한 환승을 피하도록 하는 가중치입니다. 실제 소요시간(분)이 아니라 경로 우선순위를
// 정하기 위한 상대적인 값입니다.
const TRANSFER_HOP_PENALTY = 6;

let cachedGraph = null;

function loadLineData() {
  if (!fs.existsSync(LINE_DATA_PATH)) {
    return null;
  }
  const raw = fs.readFileSync(LINE_DATA_PATH, "utf-8");
  return JSON.parse(raw);
}

// 그래프 노드는 "역이름::호선(또는 지선)이름" 형태의 문자열입니다.
// 같은 역이라도 호선이 다르면 다른 노드로 취급하고, 그 사이를 "환승 간선"으로 연결합니다.
function buildGraph() {
  const lineData = loadLineData();
  if (!lineData) return null;

  const adjacency = new Map(); // nodeId -> [{ to, weight, kind, station, line }]
  const stationToLines = new Map(); // stationName -> Set(lineLabel)

  function addEdge(nodeA, nodeB, weight, kind, station, line) {
    if (!adjacency.has(nodeA)) adjacency.set(nodeA, []);
    adjacency.get(nodeA).push({ to: nodeB, weight, kind, station, line });
  }

  // 6호선 응암순환처럼 이름에 "단방향"이 붙은 지선은 정방향으로만 운행하는 일방통행
  // 순환 구간이라, 역순 간선을 만들면 실제로는 갈 수 없는 경로를 추천하게 됩니다.
  function isUnidirectional(label) {
    return label.includes("단방향");
  }

  function registerLine(lineLabel, stations, { directed = false, loop = false } = {}) {
    stations.forEach((station) => {
      if (!stationToLines.has(station)) stationToLines.set(station, new Set());
      stationToLines.get(station).add(lineLabel);
    });
    const pairs = [];
    for (let i = 0; i < stations.length - 1; i++) {
      pairs.push([stations[i], stations[i + 1]]);
    }
    // 2호선처럼 실제로는 원형으로 이어지는 노선은 배열의 마지막 역과 첫 역도 연결해줘야
    // "충정로 -> 시청"처럼 바로 이어지는 실제 구간을 먼 길로 돌아가는 것으로 착각하지 않는다.
    if (loop) {
      pairs.push([stations[stations.length - 1], stations[0]]);
    }
    pairs.forEach(([from, to]) => {
      const a = `${from}::${lineLabel}`;
      const b = `${to}::${lineLabel}`;
      addEdge(a, b, 1, "ride", to, lineLabel);
      if (!directed) {
        addEdge(b, a, 1, "ride", from, lineLabel);
      }
    });
  }

  lineData.forEach((entry) => {
    registerLine(entry.line, entry.stations, { loop: entry.type === "loop" });
    (entry.branches || []).forEach((branch) => {
      const label = `${entry.line} ${branch.name}`;
      registerLine(label, branch.stations, { directed: isUnidirectional(label) });
    });
  });

  // 같은 역에서 서로 다른 호선 노드끼리 환승 간선 연결
  stationToLines.forEach((lines, station) => {
    const lineList = [...lines];
    for (let i = 0; i < lineList.length; i++) {
      for (let j = 0; j < lineList.length; j++) {
        if (i === j) continue;
        const from = `${station}::${lineList[i]}`;
        const to = `${station}::${lineList[j]}`;
        addEdge(from, to, TRANSFER_HOP_PENALTY, "transfer", station, lineList[j]);
      }
    }
  });

  return { adjacency, stationToLines };
}

function getGraph() {
  if (!cachedGraph) {
    cachedGraph = buildGraph();
  }
  return cachedGraph;
}

// 특정 호선(본선 또는 지선)의 역 순서 배열을 돌려줍니다. 막차 시각을 표본역 기준으로
// 보간(추정)할 때, 두 역 사이의 "정차역 몇 개 차이"를 계산하는 데 씁니다.
// lineLabel은 본선이면 "6호선"처럼, 지선이면 buildGraph와 동일하게
// "6호선 응암순환(단방향)"처럼 "본선명 + 공백 + 지선명" 형태로 들어온다.
function getMainLineStations(lineLabel) {
  const lineData = loadLineData();
  if (!lineData) return null;

  const mainEntry = lineData.find((e) => e.line === lineLabel);
  if (mainEntry) return mainEntry.stations;

  for (const entry of lineData) {
    const branch = (entry.branches || []).find((b) => `${entry.line} ${b.name}` === lineLabel);
    if (branch) return branch.stations;
  }
  return null;
}

// "2호선" 같은 노선명을 검색했을 때 역 전체를 보여줄 순서를 정한다. 본선 역은 배열
// 순서 그대로 두고, 지선 역(예: 성수지선의 용답·신답·용두·신설동)은 갈라지는 역(분기역,
// 지선 배열의 첫 역) 바로 뒤에 지선 내부 순서대로 끼워 넣는다. 그래야 실제 노선도처럼
// "본선을 타고 가다가 분기역에서 지선이 갈라지는" 순서로 자연스럽게 보인다.
function buildLineStationOrder(lineLabel) {
  const lineData = loadLineData();
  const entry = lineData?.find((e) => e.line === lineLabel);
  if (!entry) return new Map();

  const order = new Map();
  entry.stations.forEach((s, i) => order.set(s, i));
  (entry.branches || []).forEach((branch) => {
    const junctionPos = order.get(branch.stations[0]) ?? entry.stations.length;
    branch.stations.forEach((s, i) => {
      if (i === 0 || order.has(s)) return; // 분기역 자신, 이미 자리가 있는 역은 건너뜀
      order.set(s, junctionPos + i / 1000); // 분기역 바로 뒤, 지선 내부 순서 유지
    });
  });
  return order;
}

// LineMapPicker(프론트) 전용: buildLineStationOrder와 같은 순서로 역을 배치하되, 화면에
// 바로 그릴 수 있게 각 역이 본선인지 어느 지선인지, 그리고 순환선이라 마지막 역이 첫
// 역으로 다시 이어지는지까지 함께 돌려준다.
function getLineDiagram(lineLabel) {
  const lineData = loadLineData();
  const entry = lineData?.find((e) => e.line === lineLabel);
  if (!entry) return null;

  const stations = entry.stations.map((name) => ({ name, branch: null }));
  const seen = new Set(entry.stations);
  (entry.branches || []).forEach((branch) => {
    const junctionIndex = stations.findIndex((s) => s.name === branch.stations[0]);
    if (junctionIndex === -1) return;
    const toInsert = branch.stations
      .filter((name, i) => i > 0 && !seen.has(name))
      .map((name) => {
        seen.add(name);
        return { name, branch: branch.name };
      });
    stations.splice(junctionIndex + 1, 0, ...toInsert);
  });

  return { stations, loop: entry.type === "loop" };
}

function stationExists(stationName) {
  const graph = getGraph();
  if (!graph) return false;
  return graph.stationToLines.has(stationName);
}

// 노선도 전체(약 300개 역)에서 이름으로 검색합니다. 환승역이면 역이 속한 노선(지선 포함)
// 각각을 별도 항목으로 반환합니다. 검색어가 "2호선"처럼 노선을 가리키면 역 이름 대신
// 그 노선에 속하는지로 걸러서, 노선 순서대로 역 전체를 보여줍니다. 경로 찾기 화면의
// 출발역/도착역 자동완성에 씁니다.
function searchAllStations(query) {
  const graph = getGraph();
  if (!graph) return [];
  const lineQuery = parseLineQuery(query);
  const results = [];
  graph.stationToLines.forEach((lines, name) => {
    if (lineQuery) {
      const onThisLine = [...lines].some((line) => line.split(" ")[0] === lineQuery);
      if (!onThisLine) return;
    } else if (!matchesQuery(name, query)) {
      return;
    }
    lines.forEach((line) => {
      const base = line.split(" ")[0];
      if (lineQuery && base !== lineQuery) return; // 지선 등 다른 노선 라벨은 제외
      // 본선에도 있는 역(분기역 자신 등)은 본선 라벨을 쓰고, 지선에만 있는 역(예:
      // 성수지선의 용답)은 지선 전체 라벨을 그대로 써야 막차 조회에서 그 역을 올바른
      // 배열(지선)에서 찾아 방향을 판별할 수 있다.
      const effectiveLine = lines.has(base) ? base : line;
      results.push({ name, line: effectiveLine });
    });
  });
  // 같은 (name, line) 중복 제거
  const seen = new Set();
  const deduped = results.filter((r) => {
    const key = `${r.name}::${r.line}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  if (lineQuery) {
    const order = buildLineStationOrder(lineQuery);
    deduped.sort((a, b) => (order.get(a.name) ?? Infinity) - (order.get(b.name) ?? Infinity));
  } else {
    deduped.sort((a, b) => a.name.localeCompare(b.name, "ko"));
  }
  return deduped;
}

// 다익스트라: origin역이 속한 모든 호선 노드를 시작점으로, destination역에 속한
// 아무 호선 노드에나 도달하면 종료.
function findRoute(originStation, destinationStation) {
  const graph = getGraph();
  if (!graph) {
    return { error: "노선도 데이터가 아직 준비되지 않았습니다." };
  }
  const { adjacency, stationToLines } = graph;

  if (!stationToLines.has(originStation)) {
    return { error: `"${originStation}" 역 정보를 찾을 수 없습니다.` };
  }
  if (!stationToLines.has(destinationStation)) {
    return { error: `"${destinationStation}" 역 정보를 찾을 수 없습니다.` };
  }

  const dist = new Map();
  const prev = new Map();
  const visited = new Set();

  // 매우 작은 그래프이므로 별도 우선순위 큐 없이 선형 탐색으로 충분합니다.
  const queue = [];
  stationToLines.get(originStation).forEach((line) => {
    const node = `${originStation}::${line}`;
    dist.set(node, 0);
    queue.push(node);
  });

  while (queue.length > 0) {
    queue.sort((a, b) => (dist.get(a) ?? Infinity) - (dist.get(b) ?? Infinity));
    const current = queue.shift();
    if (visited.has(current)) continue;
    visited.add(current);

    const [currentStation] = current.split("::");
    if (currentStation === destinationStation) break;

    const neighbors = adjacency.get(current) || [];
    neighbors.forEach((edge) => {
      const newDist = (dist.get(current) ?? Infinity) + edge.weight;
      if (newDist < (dist.get(edge.to) ?? Infinity)) {
        dist.set(edge.to, newDist);
        prev.set(edge.to, { node: current, edge });
        queue.push(edge.to);
      }
    });
  }

  let bestNode = null;
  let bestDist = Infinity;
  stationToLines.get(destinationStation).forEach((line) => {
    const node = `${destinationStation}::${line}`;
    if ((dist.get(node) ?? Infinity) < bestDist) {
      bestDist = dist.get(node);
      bestNode = node;
    }
  });

  if (!bestNode || bestDist === Infinity) {
    return { error: "두 역을 연결하는 경로를 찾지 못했습니다." };
  }

  // 경로 역추적
  const path = [];
  let cursor = bestNode;
  while (cursor) {
    const step = prev.get(cursor);
    path.unshift({ node: cursor, edge: step?.edge || null });
    cursor = step?.node;
  }

  // 연속된 같은 호선 구간을 하나의 "leg"로 묶기
  const legs = [];
  let current = null;
  path.forEach((step, idx) => {
    const [station, line] = step.node.split("::");
    if (idx === 0) {
      current = { line, stations: [station] };
      return;
    }
    if (step.edge.kind === "transfer") {
      legs.push(current);
      current = { line, stations: [station] };
    } else {
      current.stations.push(station);
      current.line = line;
    }
  });
  if (current) legs.push(current);

  const transferStations = legs.slice(0, -1).map((leg) => leg.stations[leg.stations.length - 1]);
  const transferMinutesEstimate = transferStations.map((s, i) => ({
    station: s,
    minutes: getTransferMinutes(s, legs[i].line, legs[i + 1].line),
  }));

  const legResults = legs.map((leg) => {
    const stopCount = leg.stations.length - 1;
    let estimatedMinutes = 0;
    for (let i = 0; i < leg.stations.length - 1; i++) {
      estimatedMinutes += getSegmentMinutes(leg.line, leg.stations[i], leg.stations[i + 1]);
    }
    return {
      line: leg.line,
      from: leg.stations[0],
      to: leg.stations[leg.stations.length - 1],
      stopCount,
      stations: leg.stations,
      estimatedMinutes: Math.round(estimatedMinutes),
    };
  });

  const totalEstimatedMinutes =
    legResults.reduce((sum, leg) => sum + leg.estimatedMinutes, 0) +
    transferMinutesEstimate.reduce((sum, t) => sum + t.minutes, 0);

  return {
    legs: legResults,
    transferStations,
    transferMinutesEstimate,
    totalEstimatedMinutes,
  };
}

module.exports = { findRoute, stationExists, searchAllStations, getGraph, getMainLineStations, getLineDiagram };
