export const WEEKDAY_OPTIONS = [
  { value: "auto", label: "자동" },
  { value: "weekday", label: "평일" },
  { value: "saturday", label: "토요일" },
  { value: "sunday", label: "일·공휴일" },
];

// 지하철 운행일은 자정이 아니라 새벽 5시 무렵 바뀌므로, 새벽 0~5시 사이에는
// "어제"의 요일 기준 시간표를 그대로 따른다고 보고 자동 감지한다.
export function detectWeekdayType(now) {
  const serviceDate = new Date(now);
  if (now.getHours() < 5) {
    serviceDate.setDate(serviceDate.getDate() - 1);
  }
  const day = serviceDate.getDay();
  if (day === 0) return "sunday";
  if (day === 6) return "saturday";
  return "weekday";
}

// "00:12" 같은 막차 시각 문자열을, "오늘 밤(자정 넘김 포함) 그 시각"의 실제 Date로 변환.
// 예전엔 이미 지난 시각이면 무조건 다음날로 넘겨서 계산했는데, 그러면 "막차가 이미
// 끝났다"는 상태가 절대 나오지 않고 항상 내일 막차까지 카운트다운을 보여주는 문제가
// 있었다. 이제는 새벽 0~4시대 시각을 "지금이 그 새벽 시간대를 지나는 중"인지로만
// 판단해서 딱 한 번 계산하고, 이미 지났으면 지난 채로 둔다(호출하는 쪽에서 ms<=0을
// 보고 "막차 끝남"으로 처리하도록).
export function resolveTargetDate(timeStr, now) {
  const [h, m] = timeStr.split(":").map(Number);
  const candidate = new Date(now);
  candidate.setHours(h, m, 0, 0);
  // 막차 시각이 새벽대(0~4시)이고 지금이 아직 저녁~밤(5시 이후)이면, 그 새벽은 "오늘 밤이
  // 지나서 오는" 미래이므로 날짜를 하루 밀어야 한다. 반대로 지금도 이미 새벽대라면
  // 오늘 날짜 그대로 둬서, 이미 지났다면 지난 것으로 판단되게 한다.
  if (h < 5 && now.getHours() >= 5) {
    candidate.setDate(candidate.getDate() + 1);
  }
  return candidate;
}

export function formatRemaining(ms) {
  if (ms <= 0) return "🚫 오늘 막차는 끝났어요";
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}시간 ${minutes}분 ${seconds}초 남음`;
  return `${minutes}분 ${seconds}초 남음`;
}
