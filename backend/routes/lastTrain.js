const express = require("express");
const mockStations = require("../data/mockStations");
const { lookupDirectional } = require("../services/lastTrainLookup");
const { getMainLineStations } = require("../services/routeFinder");
const { matchesQuery } = require("../utils/chosung");

const router = express.Router();

// 역 이름 검색 (자동완성용, 초성 검색 지원). 현재는 샘플 역 목록 기준이며, 추후
// "역명으로 지하철역 검색" API로 대체 가능.
router.get("/stations", (req, res) => {
  const q = (req.query.q || "").trim();
  const results = mockStations
    .filter((s) => matchesQuery(s.name, q))
    .map((s) => ({ name: s.name, line: s.line }));
  res.json({ results });
});

// forward/backward 하나의 방향을 조회해서, 화면에 보여줄 라벨까지 붙여 돌려준다.
async function buildDirectionResult(name, line, weekdayType, direction) {
  const lookup = await lookupDirectional({ name, line, weekdayType, direction });
  const stations = getMainLineStations(line);
  const boundStation = stations ? (direction === "forward" ? stations[stations.length - 1] : stations[0]) : null;
  const fallbackLabel = boundStation ? `${boundStation} 방면` : direction === "forward" ? "정방향" : "역방향";

  if (!lookup.available) {
    return { label: fallbackLabel, time: null, note: lookup.reason };
  }

  let label = fallbackLabel;
  if (lookup.source === "official" && lookup.destination) {
    label = `${lookup.destination} 방면`;
  } else if (lookup.source === "sample") {
    const mockStation = mockStations.find((s) => s.name === name && s.line === line);
    const dirEntry = mockStation?.directions.find((d) => d.dir === direction);
    if (dirEntry?.label) label = dirEntry.label;
  }

  return { label, time: lookup.time, source: lookup.source, basedOn: lookup.basedOn };
}

// 특정 역의 막차 정보 조회 (표본 15개 역이 아니어도 역명 검색 API로 즉석 조회를 시도한다)
router.get("/last-train", async (req, res) => {
  const { name, line, weekdayType } = req.query;
  if (!name || !line) {
    return res.status(400).json({ error: "name, line 파라미터가 필요합니다." });
  }
  if (!["weekday", "saturday", "sunday"].includes(weekdayType)) {
    return res.status(400).json({ error: "weekdayType은 weekday/saturday/sunday 중 하나여야 합니다." });
  }

  const [forward, backward] = await Promise.all([
    buildDirectionResult(name, line, weekdayType, "forward"),
    buildDirectionResult(name, line, weekdayType, "backward"),
  ]);

  if (!forward.time && !backward.time) {
    return res.status(404).json({
      error: "이 역/노선은 표본 데이터가 없어 막차 시각을 추정할 수도 없습니다.",
    });
  }

  res.json({
    line,
    name,
    weekdayType,
    directions: [forward, backward],
  });
});

module.exports = router;
