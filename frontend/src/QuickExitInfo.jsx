import { useEffect, useState } from "react";
import { getQuickExit } from "./api";

// 문번호들을 승강설비 종류별로 묶는다: { "에스컬레이터": ["2-3","2-2"], ... }
function groupByFacility(spots) {
  const groups = {};
  spots.forEach((s) => {
    if (!groups[s.facility]) groups[s.facility] = [];
    groups[s.facility].push(s.doorNo);
  });
  return groups;
}

// 계단은 대부분 역에 흔하니 뒤로 미루고, 에스컬레이터/엘리베이터를 먼저 보여준다.
const FACILITY_ORDER = ["에스컬레이터", "엘리베이터", "계단"];

export default function QuickExitInfo({ name, line, direction }) {
  const [state, setState] = useState({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });
    getQuickExit({ name, line, direction })
      .then((result) => !cancelled && setState({ status: "done", result }))
      .catch((err) => !cancelled && setState({ status: "error", message: err.message }));
    return () => {
      cancelled = true;
    };
  }, [name, line, direction]);

  if (state.status === "loading") {
    return <p className="note">빠른하차 정보 불러오는 중...</p>;
  }
  if (state.status === "error") {
    return null; // API 키 없음/역 정보 없음 등은 조용히 숨김 (핵심 기능이 아니므로)
  }

  const entries = Object.entries(state.result.byDirection);
  if (entries.length === 0) return null;

  return (
    <div className="quick-exit">
      <p className="note quick-exit-title">🚪 빠른하차 정보</p>
      {entries.map(([dirLabel, info]) => {
        const groups = groupByFacility(info.spots);
        const facilities = FACILITY_ORDER.filter((f) => groups[f]);
        return (
          <div className="quick-exit-block" key={dirLabel}>
            <p className="quick-exit-direction">
              {dirLabel}({info.destination} 방면)
            </p>
            {facilities.map((f) => (
              <p className="quick-exit-facility" key={f}>
                <span className="quick-exit-facility-name">{f}</span>
                <span className="quick-exit-doors">{groups[f].join(", ")}호차</span>
              </p>
            ))}
          </div>
        );
      })}
    </div>
  );
}
