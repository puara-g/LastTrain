const express = require("express");
const quickExitApi = require("../services/quickExitApi");
const { getMainLineStations } = require("../services/routeFinder");

const router = express.Router();

// direction("forward"|"backward")이 오면, 노선 배열에서 그 방면 역과 현재 역의 인덱스를
// 비교해서 상행/하행 중 실제로 그 방향에 해당하는 쪽만 걸러준다.
function filterByDirection(byDirection, line, stationName, direction) {
  if (!direction) return byDirection;
  const stations = getMainLineStations(line);
  const stationIndex = stations ? stations.indexOf(stationName) : -1;
  if (!stations || stationIndex === -1) return byDirection;

  const filtered = {};
  Object.entries(byDirection).forEach(([label, info]) => {
    const destIndex = stations.indexOf(info.destination);
    if (destIndex === -1) {
      // 방면 역이 이 노선 배열 밖(예: 코레일 직결 구간)이면 판단할 수 없으니 일단 포함.
      filtered[label] = info;
      return;
    }
    const groupDirection = destIndex > stationIndex ? "forward" : "backward";
    if (groupDirection === direction) filtered[label] = info;
  });
  return Object.keys(filtered).length > 0 ? filtered : byDirection;
}

router.get("/quick-exit", async (req, res) => {
  const { name, line, direction } = req.query;
  if (!name || !line) {
    return res.status(400).json({ error: "name, line 파라미터가 필요합니다." });
  }
  if (!quickExitApi.isConfigured()) {
    return res.status(404).json({ error: "API 키가 설정되지 않았어요." });
  }

  try {
    const byDirection = await quickExitApi.getQuickExitInfo(name, line);
    if (!byDirection) {
      return res.status(404).json({ error: "이 역의 빠른하차 정보가 없어요." });
    }
    res.json({ name, line, byDirection: filterByDirection(byDirection, line, name, direction) });
  } catch (err) {
    console.error("[quick-exit]", err.message);
    res.status(502).json({ error: "빠른하차 정보를 불러오지 못했어요." });
  }
});

module.exports = router;
