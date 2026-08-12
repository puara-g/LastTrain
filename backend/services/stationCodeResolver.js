const fetch = require("node-fetch");

// 역명으로 역외부코드(FR_CODE)를 찾는 API. mockStations에 없는 역이라도, 이 API로
// 즉석에서 코드를 찾아 공식 막차 API를 바로 호출할 수 있다. 같은 결과를 반복 조회하지
// 않도록 (역명::호선) -> FR_CODE 맵으로 캐시한다(역 코드는 바뀌지 않으니 서버 수명 동안 유지).
const BASE_URL = process.env.SEOUL_API_BASE || "http://openapi.seoul.go.kr:8088";
const SERVICE_NAME = process.env.SEOUL_API_STATION_SEARCH_SERVICE || "SearchInfoBySubwayNameService";

const cache = new Map(); // `${name}::${baseLine}` -> code(string) | null

// "02호선" -> "1호선".."9호선" 형식으로 맞춘다 (lineStations.json 표기와 일치시키기 위함).
function normalizeLineNum(lineNum) {
  return lineNum.replace(/^0/, "");
}

async function queryRows(name) {
  const apiKey = process.env.SEOUL_API_KEY;
  const url = `${BASE_URL}/${apiKey}/json/${SERVICE_NAME}/1/10/${encodeURIComponent(name)}/`;
  const res = await fetch(url, { timeout: 5000 });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  const root = data[SERVICE_NAME] || data;
  if (root?.RESULT?.CODE !== "INFO-000") return [];
  const rows = Array.isArray(root.row) ? root.row : root.row ? [root.row] : [];
  return rows;
}

// "총신대입구(이수)"처럼 병기명이 붙은 역은, 실제 역명 검색 API에는 노선마다 다른
// 이름으로 등록돼 있는 경우가 있다(예: 4호선엔 "총신대입구"만, 7호선엔 "이수"만 있고
// 합쳐진 "총신대입구(이수)"로는 검색이 안 됨). 그래서 원래 이름이 안 되면 괄호를 뗀
// 이름과, 괄호 안 내용만으로도 순서대로 다시 시도한다.
function nameVariants(name) {
  const variants = [name];
  const parenMatch = name.match(/^(.+?)\(([^)]+)\)$/);
  if (parenMatch) {
    variants.push(parenMatch[1].trim()); // 괄호 앞부분 ("총신대입구")
    variants.push(parenMatch[2].trim()); // 괄호 안 내용 ("이수")
  }
  return variants;
}

// line은 "6호선" 같은 본선일 수도, "6호선 응암순환(단방향)" 같은 지선일 수도 있다.
// 역명 검색 API는 본선/지선을 구분하지 않으므로 본선 이름만 떼어서 비교한다.
async function resolveExternalCode(name, line) {
  const baseLine = line.split(" ")[0];
  const cacheKey = `${name}::${baseLine}`;
  if (cache.has(cacheKey)) return cache.get(cacheKey);

  const apiKey = process.env.SEOUL_API_KEY;
  if (!apiKey) return null;

  try {
    for (const variant of nameVariants(name)) {
      const rows = await queryRows(variant);
      const match = rows.find((r) => normalizeLineNum(r.LINE_NUM) === baseLine);
      if (match) {
        cache.set(cacheKey, match.FR_CODE);
        return match.FR_CODE;
      }
    }
    cache.set(cacheKey, null);
    return null;
  } catch (err) {
    console.error("[stationCodeResolver] 조회 실패:", err.message);
    return null; // 실패는 캐시하지 않음 (다음에 다시 시도)
  }
}

module.exports = { resolveExternalCode };
