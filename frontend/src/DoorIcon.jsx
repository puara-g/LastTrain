// "빠른하차 정보" 제목에 쓰는 아이콘. frontend/public/door.png(파란 배지 + 흰색 전동차
// 출입문 아이콘) 실사진을 그대로 쓴다.
export default function DoorIcon({ size = 18 }) {
  return (
    <img
      className="icon-badge door-icon"
      src="/door.png"
      alt=""
      width={size}
      height={size}
    />
  );
}
