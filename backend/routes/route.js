const express = require("express");
const { findRoute, searchAllStations } = require("../services/routeFinder");
const { computeDeadline } = require("../services/deadlineCalculator");

const router = express.Router();

router.get("/all-stations", (req, res) => {
  const q = (req.query.q || "").trim();
  const results = searchAllStations(q).slice(0, 20);
  res.json({ results });
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
