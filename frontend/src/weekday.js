export const WEEKDAY_OPTIONS = [
  { value: "auto", label: "자동 감지" },
  { value: "weekday", label: "평일" },
  { value: "saturday", label: "토요일" },
  { value: "sunday", label: "일요일 · 공휴일" },
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

// "00:12" 같은 막차 시각 문자열을, 지금 시각 기준 가장 가까운 미래(또는 방금 지난) 실제 Date로 변환.
export function resolveTargetDate(timeStr, now) {
  const [h, m] = timeStr.split(":").map(Number);
  const candidate = new Date(now);
  candidate.setHours(h, m, 0, 0);
  if (candidate.getTime() <= now.getTime()) {
    candidate.setDate(candidate.getDate() + 1);
  }
  return candidate;
}

export function formatRemaining(ms) {
  if (ms <= 0) return "방금 출발했어요";
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}시간 ${minutes}분 ${seconds}초 남음`;
  return `${minutes}분 ${seconds}초 남음`;
}
