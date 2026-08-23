// 로컬 개발에서는 vite.config.js의 프록시가 "/api"를 백엔드(localhost:4000)로 넘겨줘서
// 빈 문자열(상대경로)로 충분하지만, 배포 환경(예: Vercel)에서는 프론트와 백엔드가 서로
// 다른 도메인에 있으므로 실제 백엔드 주소가 필요하다. Vercel 프로젝트 설정의 환경변수에
// VITE_API_BASE_URL=https://your-backend.onrender.com 처럼 등록해두면 된다.
const API_BASE = import.meta.env.VITE_API_BASE_URL || "";

export async function searchStations(query) {
  const res = await fetch(`${API_BASE}/api/stations?q=${encodeURIComponent(query)}`);
  if (!res.ok) throw new Error("역 검색에 실패했습니다.");
  const data = await res.json();
  return data.results;
}

export async function getLastTrain({ name, line, weekdayType }) {
  const params = new URLSearchParams({ name, line, weekdayType });
  const res = await fetch(`${API_BASE}/api/last-train?${params.toString()}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "막차 정보를 불러오지 못했습니다.");
  }
  return res.json();
}

export async function searchAllStations(query) {
  const res = await fetch(`${API_BASE}/api/all-stations?q=${encodeURIComponent(query)}`);
  if (!res.ok) throw new Error("역 검색에 실패했습니다.");
  const data = await res.json();
  return data.results;
}

export async function getLineDiagram(line) {
  const res = await fetch(`${API_BASE}/api/line-map?line=${encodeURIComponent(line)}`);
  if (!res.ok) throw new Error("노선도 정보를 불러오지 못했습니다.");
  return res.json();
}

export async function getQuickExit({ name, line, direction }) {
  const params = new URLSearchParams({ name, line });
  if (direction) params.set("direction", direction);
  const res = await fetch(`${API_BASE}/api/quick-exit?${params.toString()}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "빠른하차 정보를 불러오지 못했습니다.");
  }
  return res.json();
}

export async function getRoute({ from, to, weekdayType }) {
  const params = new URLSearchParams({ from, to, weekdayType });
  const res = await fetch(`${API_BASE}/api/route?${params.toString()}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "경로를 찾지 못했습니다.");
  }
  return res.json();
}
