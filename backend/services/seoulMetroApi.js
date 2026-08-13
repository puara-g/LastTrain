const fetch = require("node-fetch");

// 서울 열린데이터광장(data.seoul.go.kr) API 공통 URL 규칙:
//   http://openapi.seoul.go.kr:8088/{인증키}/{xml|json}/{서비스명}/{시작인덱스}/{끝인덱스}/{추가 파라미터...}
//
// SEOUL_API_SERVICE 기본값은 사용자가 실제 발급받은 "서울교통공사_역외부코드로 지하철
// 막차 시간표 검색" API 상세페이지에서 확인한 실제 서비스명입니다:
//   SearchLastTrainTimeByFRCodeService
// 요청 형식: /{key}/json/{service}/1/5/{역외부코드(FR_CODE)}/{요일:1평일 2토 3일}/{상하행:1상행 2하행}
const BASE_URL = process.env.SEOUL_API_BASE || "http://openapi.seoul.go.kr:8088";
const SERVICE_NAME = process.env.SEOUL_API_SERVICE || "SearchLastTrainTimeByFRCodeService";

const WEEKDAY_CODE = { weekday: "1", saturday: "2", sunday: "3" };
const DIRECTION_CODE = { up: "1", down: "2" };

function isConfigured() {
  return Boolean(process.env.SEOUL_API_KEY);
}

// API가 돌려주는 LEFTTIME은 "24:24:00"처럼 자정을 넘긴 시각을 24시 이상으로 표기합니다.
// 정렬/비교는 이 표기 그대로(분 단위 총합)로 하고, 화면에 보여줄 때만 00:xx로 바꿉니다.
function leftTimeToMinutes(leftTime) {
  const [h, m] = leftTime.split(":").map(Number);
  return h * 60 + m;
}

function leftTimeToDisplay(leftTime) {
  const totalMinutes = leftTimeToMinutes(leftTime) % (24 * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

async function fetchLastTrain({ stationExternalCode, weekdayType, direction }) {
  const apiKey = process.env.SEOUL_API_KEY;
  if (!apiKey) {
    throw new Error("SEOUL_API_KEY가 설정되지 않았습니다.");
  }

  const weekdayCode = WEEKDAY_CODE[weekdayType];
  const directionCode = DIRECTION_CODE[direction];
  const url = `${BASE_URL}/${apiKey}/json/${SERVICE_NAME}/1/5/${stationExternalCode}/${weekdayCode}/${directionCode}`;

  const res = await fetch(url, { timeout: 5000 });
  if (!res.ok) {
    throw new Error(`서울 열린데이터광장 API 오류: HTTP ${res.status}`);
  }
  const data = await res.json();

  // 정상 응답은 { [서비스명]: { RESULT, row } } 형태지만, 에러/데이터없음 응답은
  // 서비스명 래핑 없이 최상위에 바로 { RESULT } 만 오는 경우가 있다.
  const root = data[SERVICE_NAME] || data;
  const resultCode = root?.RESULT?.CODE;

  if (resultCode === "INFO-200") {
    return null; // 조건에 맞는 데이터 없음 (예: 가짜/존재하지 않는 역외부코드)
  }
  if (resultCode !== "INFO-000") {
    const message = root?.RESULT?.MESSAGE || "알 수 없는 응답입니다.";
    throw new Error(`서울 열린데이터광장 API 응답 오류: ${message}`);
  }

  const allRows = Array.isArray(root.row) ? root.row : root.row ? [root.row] : [];
  if (allRows.length === 0) {
    return null; // 이 방향으로는 운행 정보가 없음 (예: 종점역)
  }

  // 종점역에서 그 이상 진행하는 방향을 물으면 API가 "LEFTTIME=00:00:00"인 의미 없는
  // 더미 행을 돌려준다(목적지가 자기 자신으로 나올 때도 있고, 아닐 때도 있어서 그
  // 필드만으로는 못 거른다 — 00:00:00은 실제 막차 시각으로는 나올 수 없는 값이라 이걸
  // 기준으로 거른다). 여러 건이 동시에 00:00:00으로 묶여있으면 그중 하나가 우연히
  // 그럴듯한 역명을 갖고 있어도 전부 더미이므로 먼저 다 제외한다.
  const rows = allRows.filter((row) => row.LEFTTIME !== "00:00:00");
  if (rows.length === 0) {
    return null;
  }

  // 여러 건(최근 몇 대의 열차)이 오므로, LEFTTIME이 가장 늦은(=마지막) 열차를 고른다.
  const last = rows.reduce((latest, row) =>
    leftTimeToMinutes(row.LEFTTIME) > leftTimeToMinutes(latest.LEFTTIME) ? row : latest
  );

  return {
    time: leftTimeToDisplay(last.LEFTTIME),
    destination: last.SUBWAYENAME,
  };
}

module.exports = { isConfigured, fetchLastTrain };
