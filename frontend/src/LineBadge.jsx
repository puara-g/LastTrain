import { getLineColor, getLineNumber } from "./lineColors";

// 호선 원형 배지. 숫자 노선은 "2"처럼 한 글자, 경의중앙선/공항철도처럼 숫자가 없는
// 노선은 getLineNumber가 돌려주는 두 글자("경의", "공항")를 쓰는데, 이땐 기본 폰트
// 크기로 두면 20px 원 안에서 잘려 보이므로 글자 수에 따라 폰트를 줄인다.
export default function LineBadge({ line }) {
  const label = getLineNumber(line);
  return (
    <span
      className={`line-badge${label.length > 1 ? " two-chars" : ""}`}
      style={{ backgroundColor: getLineColor(line) }}
    >
      {label}
    </span>
  );
}
