const fetch = require("node-fetch");

// 서울교통공사_빠른하차정보(getFstExit). 역명으로 필터하는 파라미터가 없어서, 전체
// 데이터(약 2300여 건, 한 번에 최대 1000건)를 가져와 메모리에 캐시해두고 여기서 걸러 쓴다.
// crtrYmd(기준일자)가 고정된 정적 데이터라 서버가 켜져있는 동안은 다시 받아올 필요가 없다.
const BASE_URL = process.env.SEOUL_API_BASE || "http://openapi.seoul.go.kr:8088";
const SERVICE_NAME = process.env.SEOUL_API_QUICK_EXIT_SERVICE || "getFstExit";
const PAGE_SIZE = 1000;

let cachedItems = null; // Promise<Array> | null

function isConfigured() {
  return Boolean(process.env.SEOUL_API_KEY);
}

async function fetchPage(start, end) {
  const apiKey = process.env.SEOUL_API_KEY;
  const url = `${BASE_URL}/${apiKey}/json/${SERVICE_NAME}/${start}/${end}/`;
  const res = await fetch(url, { timeout: 8000 });
  if (!res.ok) {
    throw new Error(`빠른하차정보 API 오류: HTTP ${res.status}`);
  }
  const data = await res.json();
  const header = data?.response?.header;
  if (header?.resultCode !== "00") {
    throw new Error(`빠른하차정보 API 응답 오류: ${header?.resultMsg || "알 수 없는 오류"}`);
  }
  const body = data.response.body;
  const items = body?.items?.item;
  const rows = Array.isArray(items) ? items : items ? [items] : [];
  return { rows, totalCount: body.totalCount };
}

async function loadAll() {
  const first = await fetchPage(1, PAGE_SIZE);
  let all = first.rows;
  let start = PAGE_SIZE + 1;
  while (all.length < first.totalCount) {
    const end = Math.min(start + PAGE_SIZE - 1, first.totalCount);
    const page = await fetchPage(start, end);
    all = all.concat(page.rows);
    start = end + 1;
  }
  return all;
}

function getAllItems() {
  if (!cachedItems) {
    cachedItems = loadAll().catch((err) => {
      cachedItems = null; // 실패하면 다음 요청에서 다시 시도
      throw err;
    });
  }
  return cachedItems;
}

// 역명+호선으로 빠른하차 정보를 찾아 방향(상행/하행)별로 묶어서 돌려준다.
async function getQuickExitInfo(stationName, lineLabel) {
  const items = await getAllItems();
  const matches = items.filter((r) => r.stnNm === stationName && r.lineNm === lineLabel);
  if (matches.length === 0) return null;

  const byDirection = {};
  matches.forEach((r) => {
    const dir = r.upbdnbSe || "정보없음";
    if (!byDirection[dir]) byDirection[dir] = { destination: r.drtnInfo, spots: [] };
    byDirection[dir].spots.push({
      doorNo: r.qckgffVhclDoorNo,
      facility: r.plfmCmgFac,
      location: r.fwkPstnNm,
    });
  });

  return byDirection;
}

// 서버 기동 시 미리 불러와서 캐시를 데워둔다(첫 요청자가 7초 넘게 기다리지 않도록).
function warmUp() {
  if (isConfigured()) {
    getAllItems().catch((err) => console.error("[quickExitApi] 초기 로드 실패:", err.message));
  }
}

module.exports = { isConfigured, getQuickExitInfo, warmUp };
