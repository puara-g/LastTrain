// 샘플(더미) 막차 데이터입니다. weekday/weekend 시각 자체는 실제 운행 시각이 아니지만,
// externalCode(역외부코드/FR_CODE)는 "서울교통공사_역명으로 지하철역 검색"
// (SearchInfoBySubwayNameService) API로 직접 조회해서 확인한 진짜 값입니다. 그래서
// SEOUL_API_KEY가 설정돼 있으면 여기 있는 15개 역 전부 공식 API(source: "official")로
// 자동 대체됩니다. 여기 적힌 weekday/weekend 값은 키가 없거나 API 호출이 실패했을 때의
// 폴백, 그리고 주변 역을 보간(추정)할 때의 기준으로만 쓰입니다.
//
// 각 방향의 dir 필드는 backend/data/lineStations.json에 있는 해당 호선 역 배열의 순서를
// 기준으로 합니다: "forward"는 배열 순서가 증가하는 방향, "backward"는 감소하는 방향입니다.
// (예: 1호선 배열은 도봉산→...→구로 순서이므로, "상행(소요산 방면)"은 도봉산 쪽 = backward)
// routes/lastTrain.js가 이 표본역을 기준으로 다른 역의 막차 시각을 보간(추정)할 때 씁니다.

const mockStations = [
  {
    line: "1호선",
    name: "서울역",
    externalCode: "133",
    directions: [
      { label: "상행(소요산·의정부 방면)", weekday: "00:12", weekend: "00:05", dir: "backward" },
      { label: "하행(인천·신창 방면)", weekday: "00:20", weekend: "00:10", dir: "forward" },
    ],
  },
  {
    line: "1호선",
    name: "종로3가",
    externalCode: "130",
    directions: [
      { label: "상행(소요산 방면)", weekday: "00:15", weekend: "00:08", dir: "backward" },
      { label: "하행(인천 방면)", weekday: "00:18", weekend: "00:09", dir: "forward" },
    ],
  },
  {
    line: "2호선",
    name: "강남",
    externalCode: "222",
    directions: [
      { label: "내선순환(교대·서초 방면)", weekday: "00:33", weekend: "00:30", dir: "forward" },
      { label: "외선순환(역삼·삼성 방면)", weekday: "00:31", weekend: "00:28", dir: "backward" },
    ],
  },
  {
    line: "2호선",
    name: "홍대입구",
    externalCode: "239",
    directions: [
      { label: "내선순환(신촌 방면)", weekday: "00:28", weekend: "00:25", dir: "forward" },
      { label: "외선순환(합정 방면)", weekday: "00:30", weekend: "00:27", dir: "backward" },
    ],
  },
  {
    line: "2호선",
    name: "잠실",
    externalCode: "216",
    directions: [
      { label: "내선순환(종합운동장 방면)", weekday: "00:32", weekend: "00:29", dir: "forward" },
      { label: "외선순환(잠실나루 방면)", weekday: "00:34", weekend: "00:31", dir: "backward" },
    ],
  },
  {
    line: "3호선",
    name: "충무로",
    externalCode: "331",
    directions: [
      { label: "상행(대화 방면)", weekday: "00:10", weekend: "00:03", dir: "backward" },
      { label: "하행(오금 방면)", weekday: "00:12", weekend: "00:05", dir: "forward" },
    ],
  },
  {
    line: "4호선",
    name: "동대문",
    externalCode: "421",
    directions: [
      { label: "상행(당고개 방면)", weekday: "00:14", weekend: "00:07", dir: "backward" },
      { label: "하행(오이도 방면)", weekday: "00:16", weekend: "00:09", dir: "forward" },
    ],
  },
  {
    line: "5호선",
    name: "여의도",
    externalCode: "526",
    directions: [
      { label: "상행(방화 방면)", weekday: "00:22", weekend: "00:18", dir: "backward" },
      { label: "하행(마천·상일동 방면)", weekday: "00:24", weekend: "00:20", dir: "forward" },
    ],
  },
  {
    line: "6호선",
    name: "합정",
    externalCode: "622",
    directions: [
      { label: "상행(응암 방면)", weekday: "00:20", weekend: "00:15", dir: "forward" },
      { label: "하행(봉화산 방면)", weekday: "00:22", weekend: "00:17", dir: "backward" },
    ],
  },
  {
    line: "7호선",
    name: "건대입구",
    externalCode: "727",
    directions: [
      { label: "상행(장암 방면)", weekday: "00:25", weekend: "00:20", dir: "backward" },
      { label: "하행(부평구청 방면)", weekday: "00:27", weekend: "00:22", dir: "forward" },
    ],
  },
  {
    line: "8호선",
    name: "잠실",
    externalCode: "814",
    directions: [
      { label: "상행(암사 방면)", weekday: "00:15", weekend: "00:10", dir: "backward" },
      { label: "하행(모란 방면)", weekday: "00:17", weekend: "00:12", dir: "forward" },
    ],
  },
  {
    line: "9호선",
    name: "고속터미널",
    externalCode: "923",
    directions: [
      { label: "상행(개화 방면)", weekday: "00:26", weekend: "00:22", dir: "backward" },
      { label: "하행(중앙보훈병원 방면)", weekday: "00:28", weekend: "00:24", dir: "forward" },
    ],
  },
  {
    line: "1호선",
    name: "외대앞",
    externalCode: "122",
    directions: [
      { label: "상행(광운대 방면)", weekday: "00:24", weekend: "00:24", dir: "backward" },
      { label: "하행(서울역 방면)", weekday: "00:06", weekend: "23:43", dir: "forward" },
    ],
  },
  {
    line: "7호선",
    name: "온수",
    externalCode: "750",
    directions: [
      { label: "상행(내방 방면)", weekday: "00:25", weekend: "23:32", dir: "backward" },
      { label: "하행(석남 방면)", weekday: "00:40", weekend: "23:47", dir: "forward" },
    ],
  },
  {
    line: "3호선",
    name: "오금",
    externalCode: "352",
    directions: [
      { label: "상행(압구정 방면)", weekday: "00:27", weekend: "23:27", dir: "backward" },
      // 오금은 3호선의 남쪽 종점이라 "하행" 방향으로 더 가는 열차 자체가 없다(실제 API도
      // 이 방향엔 의미 없는 더미 값을 돌려준다). weekday/weekend를 비워 이 사실을 그대로 반영한다.
      { label: "하행", weekday: null, weekend: null, dir: "forward", unavailable: true },
    ],
  },
  {
    // 6호선 응암순환(단방향) 지선. 실제로 한쪽 방향(응암→역촌→불광→독바위→연신내→구산→응암)
    // 으로만 운행하는 구간이라 "상행" 자체가 존재하지 않는다(API도 해당 방향엔 데이터가 없다).
    line: "6호선 응암순환(단방향)",
    name: "연신내",
    externalCode: "614",
    directions: [
      { label: "상행", weekday: null, weekend: null, dir: "backward", unavailable: true },
      { label: "응암 방면", weekday: "00:49", weekend: "23:50", dir: "forward" },
    ],
  },
];

module.exports = mockStations;
