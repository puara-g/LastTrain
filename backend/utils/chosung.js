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

module.exports = { toChosungString, matchesQuery };
