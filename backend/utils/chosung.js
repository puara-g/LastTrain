// 한글 초성(자음)만으로 검색할 수 있게 해주는 유틸. 완성형 한글 음절(가~힣)은 유니코드
// 오프셋으로 초성/중성/종성을 계산할 수 있다: 코드 = (초성 * 21 + 중성) * 28 + 종성.
const CHOSUNG_LIST = [
  "ㄱ", "ㄲ", "ㄴ", "ㄷ", "ㄸ", "ㄹ", "ㅁ", "ㅂ", "ㅃ", "ㅅ",
  "ㅆ", "ㅇ", "ㅈ", "ㅉ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ",
];

const HANGUL_BASE = 0xac00;
const HANGUL_LAST = 0xd7a3;
const CHOSUNG_UNIT = 21 * 28;

function getChosung(char) {
  const code = char.charCodeAt(0);
  if (code < HANGUL_BASE || code > HANGUL_LAST) return char;
  const index = Math.floor((code - HANGUL_BASE) / CHOSUNG_UNIT);
  return CHOSUNG_LIST[index];
}

function toChosungString(str) {
  return [...str].map(getChosung).join("");
}

// 완성형 음절을 원래 글자 그대로 두고, 이름이나 초성 검색어 둘 중 하나라도 포함되면 매치.
function matchesQuery(name, query) {
  if (!query) return true;
  if (name.includes(query)) return true;
  return toChosungString(name).includes(query);
}

// 숫자가 아닌 이름을 쓰는 노선들("2호선"처럼 숫자+호선 패턴이 아닌 노선). 새 노선이
// lineStations.json에 추가되면 여기에도 이름을 더해야 "경의중앙선"처럼 노선명 그대로
// 검색했을 때 전체 역이 나온다.
const NAMED_LINES = ["경의중앙선", "공항철도"];

// 검색어가 "2", "2호선", "02호선"처럼 노선을 가리키면 "2호선" 형태로 정규화해서 돌려주고,
// "경의중앙선"/"공항철도"처럼 노선명 자체를 그대로 쳐도 그 노선으로 인식한다. 둘 다
// 아니면 null. 이걸로 노선명을 검색하면 그 노선의 역 전체가 뜨게 할 수 있다.
function parseLineQuery(query) {
  const trimmed = query.trim();
  const match = trimmed.match(/^0?([1-9])(호선)?$/);
  if (match) return `${match[1]}호선`;
  return NAMED_LINES.includes(trimmed) ? trimmed : null;
}

module.exports = { toChosungString, matchesQuery, parseLineQuery };
