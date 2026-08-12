// 역 이름으로 서울교통공사 역외부코드(FR_CODE)를 찾는 도구.
// mockStations.js에 새 역을 추가할 때, 여기서 코드를 확인해서 넣으면 된다.
//
// 사용법: backend 폴더에서
//   node scripts/lookupStationCode.js 잠실

require("dotenv").config();
const fetch = require("node-fetch");

const BASE_URL = process.env.SEOUL_API_BASE || "http://openapi.seoul.go.kr:8088";
const SERVICE_NAME = process.env.SEOUL_API_STATION_SEARCH_SERVICE || "SearchInfoBySubwayNameService";

async function main() {
  const name = process.argv[2];
  const apiKey = process.env.SEOUL_API_KEY;

  if (!name) {
    console.error("사용법: node scripts/lookupStationCode.js <역이름>");
    process.exit(1);
  }
  if (!apiKey) {
    console.error("backend/.env에 SEOUL_API_KEY가 설정돼 있어야 합니다.");
    process.exit(1);
  }

  const url = `${BASE_URL}/${apiKey}/json/${SERVICE_NAME}/1/10/${encodeURIComponent(name)}/`;
  const res = await fetch(url);
  const data = await res.json();
  const root = data[SERVICE_NAME] || data;

  if (root?.RESULT?.CODE === "INFO-200") {
    console.log(`"${name}" 역을 찾지 못했습니다.`);
    return;
  }
  if (root?.RESULT?.CODE !== "INFO-000") {
    console.error("API 오류:", root?.RESULT?.MESSAGE);
    return;
  }

  const rows = Array.isArray(root.row) ? root.row : [root.row];
  rows.forEach((r) => {
    console.log(`${r.LINE_NUM}\t${r.STATION_NM}\tFR_CODE=${r.FR_CODE}\tSTATION_CD=${r.STATION_CD}`);
  });
}

main();
