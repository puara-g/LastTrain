const express = require("express");
const { findRoute, searchAllStations, getLineDiagram } = require("../services/routeFinder");
const { computeDeadline } = require("../services/deadlineCalculator");
const { parseLineQuery } = require("../utils/chosung");

const router = express.Router();

router.get("/all-stations", (req, res) => {
  const q = (req.query.q || "").trim();
  // "2호선"처럼 노선 전체를 보려는 검색이면 다 보여주고, 일반 이름 검색은 20개로 제한.
  const limit = parseLineQuery(q) ? 100 : 20;
  const results = searchAllStations(q).slice(0, limit);
  res.json({ results });
});

// LineMapPicker(노선도로 역 고르기) 전용: 지선이 어느 역에서 갈라지는지, 순환선인지까지
// 함께 내려준다. 일반 자동완성용 /all-stations와 달리 노선 하나만 받는다.
router.get("/line-map", (req, res) => {
  const line = parseLineQuery((req.query.line || "").trim());
  if (!line) {
    return res.status(400).json({ error: "line 파라미터가 올바른 노선명이 아니에요." });
  }
  const diagram = getLineDiagram(line);
  if (!diagram) {
    return res.status(404).json({ error: "이 노선 정보를 찾을 수 없어요." });
  }
  res.json(diagram);
});

router.get("/route", async (req, res) => {
  const { from, to, weekdayType } = req.query;
  if (!from || !to) {
    return res.status(400).json({ error: "from, to 파라미터가 필요합니다." });
  }
  if (from === to) {
    return res.status(400).json({ error: "출발역과 도착역이 같습니다." });
  }

  const result = findRoute(from, to);
  if (result.error) {
    return res.status(404).json(result);
  }

  // weekdayType이 있으면 "환승 포함 최소 몇 시까지 타야 하는지"도 같이 계산해준다.
  if (["weekday", "saturday", "sunday"].includes(weekdayType)) {
    try {
      result.deadline = await computeDeadline({
        legs: result.legs,
        transferStations: result.transferStations,
        transferMinutesEstimate: result.transferMinutesEstimate,
        weekdayType,
      });
    } catch (err) {
      console.error("[route] 마지노선 계산 실패:", err.message);
      result.deadline = { reachable: false, reason: "마지노선을 계산하는 중 오류가 발생했어요." };
    }
  }

  res.json(result);
});

module.exports = router;
