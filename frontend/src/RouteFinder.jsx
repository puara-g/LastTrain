import { useState } from "react";
import StationPicker from "./StationPicker";
import QuickExitInfo from "./QuickExitInfo";
import { getRoute, searchAllStations } from "./api";
import { WEEKDAY_OPTIONS, detectWeekdayType, resolveTargetDate, formatRemaining } from "./weekday";
import WalkIcon from "./WalkIcon";
import LineBadge from "./LineBadge";

// 이 구간이 실제로 향하는 "그 방향"의 마지노선(=사실상 막차 시각)만 보여준다.
// "이 구간 마지노선"을 별도 줄로 또 적지 않고, 표시하는 시각 자체가 곧 마지노선이 되도록
// (환승 연결 때문에 당겨진 경우엔 그 계산값을) 한 곳에만 보여준다.
function LegOwnLastTrain({ legInfo, now }) {
  const own = legInfo?.own;
  if (!own) return null;
  if (!own.available) {
    return <p className="note">막차 정보 없음: {own.reason}</p>;
  }

  const time = legInfo.deadline || own.time;
  const target = resolveTargetDate(time, now);
  const remainingMs = target.getTime() - now.getTime();
  const label =
    own.source === "official" && own.destination
      ? `${own.destination} 방면 마지노선`
      : own.source === "estimated"
      ? `${own.basedOn.name}역 기준 추정 마지노선`
      : "마지노선";

  return (
    <div className="leg-own-last-train">
      <div className="mini-card">
        <span>{label}</span>
        <span className={remainingMs <= 0 ? "ended" : ""}>
          {time} · {formatRemaining(remainingMs)}
        </span>
      </div>
      {own.source === "sample" && <p className="note">⚠️ 샘플 데이터 (실제 시각 아님)</p>}
      {own.source === "estimated" && (
        <p className="note">
          ⚠️ {own.basedOn.name}역 샘플 값 기준 {own.basedOn.hops}개 역 차이로 추정 (실제 시각 아님)
        </p>
      )}
    </div>
  );
}

export default function RouteFinder({ now }) {
  const [from, setFrom] = useState(null);
  const [to, setTo] = useState(null);
  const [weekdaySetting, setWeekdaySetting] = useState("auto");
  const [route, setRoute] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const effectiveWeekdayType = weekdaySetting === "auto" ? detectWeekdayType(now) : weekdaySetting;

  function handleSearch() {
    if (!from || !to) return;
    setLoading(true);
    setError("");
    setRoute(null);
    getRoute({ from: from.name, to: to.name, weekdayType: effectiveWeekdayType })
      .then(setRoute)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }

  const deadline = route?.deadline;

  return (
    <div className="route-finder">
      <div className="route-inputs">
        <StationPicker placeholder="출발역" value={from} onSelect={setFrom} searchFn={searchAllStations} />
        <StationPicker placeholder="도착역" value={to} onSelect={setTo} searchFn={searchAllStations} />
      </div>

      <div className="weekday-select">
        {WEEKDAY_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            className={weekdaySetting === opt.value ? "active" : ""}
            onClick={() => setWeekdaySetting(opt.value)}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <button className="primary-button" disabled={!from || !to} onClick={handleSearch}>
        경로 찾기
      </button>

      {loading && <p className="status">경로를 찾는 중...</p>}
      {error && <p className="status error">{error}</p>}

      {route && (
        <div className="route-result">
          <p className="total-estimate">
            총 예상 소요시간 약 {route.totalEstimatedMinutes}분 (환승 {route.transferStations.length}회
            포함)
          </p>
          <p className="arrival-estimate">
            도착 예정 약{" "}
            {new Date(now.getTime() + route.totalEstimatedMinutes * 60000).toLocaleTimeString("ko-KR", {
              hour: "2-digit",
              minute: "2-digit",
              hour12: false,
            })}
          </p>

          {deadline && (
            <div className={`deadline-box ${deadline.reachable ? "" : "unreachable"}`}>
              {deadline.reachable ? (
                (() => {
                  const remainingMs = resolveTargetDate(deadline.deadline, now).getTime() - now.getTime();
                  const timeP = <p className="deadline-time">{deadline.deadline}</p>;
                  const remainingP = (
                    <p className={remainingMs <= 0 ? "remaining ended" : "remaining"}>
                      {formatRemaining(remainingMs)}
                    </p>
                  );
                  // 막차가 끝났으면 "오늘 막차는 끝났어요"가 먼저 보이도록 순서를 뒤집는다.
                  return (
                    <>
                      <p className="deadline-label">환승 포함, 늦어도 이 시간까지 첫 구간을 타야 해요</p>
                      {remainingMs <= 0 ? (
                        <>
                          {remainingP}
                          {timeP}
                        </>
                      ) : (
                        <>
                          {timeP}
                          {remainingP}
                        </>
                      )}
                    </>
                  );
                })()
              ) : (
                <p className="note">⚠️ 전체 마지노선을 계산할 수 없어요: {deadline.reason}</p>
              )}
            </div>
          )}

          {route.legs.map((leg, idx) => {
            const legInfo = deadline?.perLeg?.[idx];
            return (
              <div key={idx}>
                <div className="card leg-card">
                  <p className="direction leg-direction">
                    <LineBadge line={leg.line} />
                    {idx === 0 ? `${leg.line} 타기` : `${leg.line}으로 환승`}
                  </p>
                  <p className="time route-leg">
                    {leg.from} → {leg.to}
                  </p>
                  <p className="note">
                    정차역 {leg.stopCount}개 구간 · 약 {leg.estimatedMinutes}분 추정
                  </p>
                  <LegOwnLastTrain legInfo={legInfo} now={now} />
                  <QuickExitInfo name={leg.from} line={leg.line} direction={legInfo?.direction} />
                </div>
                {idx < route.transferStations.length && (
                  <div className="transfer-chip-wrap">
                    <div className="transfer-chip">
                      <WalkIcon />
                      <span className="transfer-chip-station">{route.transferStations[idx]}</span>
                      <span className="transfer-chip-dot">·</span>
                      <span className="transfer-chip-walk">
                        도보 {route.transferMinutesEstimate[idx].minutes}분
                      </span>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
