// 정차역 하나를 지나는 데 걸리는 평균 시간(분, 정차 포함) 추정치입니다. 서울 지하철은
// 보통 역간 2~3분 정도라고 알려져 있어 중간값을 썼습니다. 실제 역간거리/소요시간 데이터로
// 교체하면 더 정확해집니다(README 참고).
const AVG_MINUTES_PER_STOP = 2.5;

module.exports = { AVG_MINUTES_PER_STOP };
