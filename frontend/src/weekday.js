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

// "00:12" 같은 막차 시각 문자열을 실제 Date로 변환한다. 지하철 막차는 자정을 넘기는
// 경우가 흔해서 날짜를 잘못 붙이면 "이미 지난 막차"가 "아직 안 온 미래"로 계산되기
// 쉽다. 두 시각(막차 시각, 지금 시각)이 각각 새벽대(0~4시)인지 저녁~밤(5시 이후)인지
// 비교해서, 서로 다른 하루에 걸쳐 있을 때만 날짜를 하루 밀거나 뺀다.
export function resolveTargetDate(timeStr, now) {
  const [h, m] = timeStr.split(":").map(Number);
  const candidate = new Date(now);
  candidate.setHours(h, m, 0, 0);
  if (h < 5 && now.getHours() >= 5) {
    // 막차 시각이 새벽대인데 지금은 아직 저녁~밤이면, 그 새벽은 오늘 밤이 지나야 오는 미래다.
    candidate.setDate(candidate.getDate() + 1);
  } else if (h >= 5 && now.getHours() < 5) {
    // 반대로 막차 시각이 저녁~밤인데 지금이 새벽대면, 그 시각은 이미 지나간 어젯밤이다.
    candidate.setDate(candidate.getDate() - 1);
  }
  return candidate;
}

export function formatRemaining(ms) {
  if (ms <= 0) return "오늘 막차는 끝났어요";
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}시간 ${minutes}분 ${seconds}초 남음`;
  return `${minutes}분 ${seconds}초 남음`;
}
