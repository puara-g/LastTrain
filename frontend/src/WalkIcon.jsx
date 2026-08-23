// 환승 칩에 쓰는 도보 이동 아이콘. frontend/public/transfer.png(파란 배지 + 흰색 보행자
// 아이콘) 실사진을 그대로 쓴다.
export default function WalkIcon({ size = 18 }) {
  return (
    <img
      className="transfer-chip-icon icon-badge"
      src="/transfer.png"
      alt=""
      width={size}
      height={size}
    />
  );
}
