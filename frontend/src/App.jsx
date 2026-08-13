import { useEffect, useState } from "react";
import { getLastTrain, searchAllStations } from "./api";
import StationPicker from "./StationPicker";
import RouteFinder from "./RouteFinder";
import LastTrainCards from "./LastTrainCards";
import { WEEKDAY_OPTIONS, detectWeekdayType } from "./weekday";
import { getLineColor, getLineNumber } from "./lineColors";
import "./App.css";

function SingleStationLookup({ now }) {
  const [selectedStation, setSelectedStation] = useState(null);
  const [weekdaySetting, setWeekdaySetting] = useState("auto");
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const effectiveWeekdayType = weekdaySetting === "auto" ? detectWeekdayType(now) : weekdaySetting;

  useEffect(() => {
    if (!selectedStation) return;
    setLoading(true);
    setError("");
    getLastTrain({
      name: selectedStation.name,
      line: selectedStation.line,
      weekdayType: effectiveWeekdayType,
    })
      .then(setResult)
      .catch((err) => {
        setError(err.message);
        setResult(null);
      })
      .finally(() => setLoading(false));
  }, [selectedStation, effectiveWeekdayType]);

  return (
    <>
      <StationPicker
        placeholder="역 이름을 입력하세요 (예: 강남)"
        value={selectedStation}
        onSelect={setSelectedStation}
        searchFn={searchAllStations}
      />

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

      {loading && <p className="status">불러오는 중...</p>}
      {error && <p className="status error">{error}</p>}

      {result && (
        <div className="result">
          <div className="station-strip">
            {result.prevStation ? (
              <button
                className="station-strip-side station-strip-prev"
                onClick={() => setSelectedStation({ name: result.prevStation, line: result.line })}
              >
                ← {result.prevStation}
              </button>
            ) : (
              <span className="station-strip-side station-strip-prev" />
            )}
            <h2 className="result-title">
              <span className="line-badge" style={{ backgroundColor: getLineColor(result.line) }}>
                {getLineNumber(result.line)}
              </span>
              {result.name} <span className="line-tag">{result.line}</span>
            </h2>
            {result.nextStation ? (
              <button
                className="station-strip-side station-strip-next"
                onClick={() => setSelectedStation({ name: result.nextStation, line: result.line })}
              >
                {result.nextStation} →
              </button>
            ) : (
              <span className="station-strip-side station-strip-next" />
            )}
          </div>
          <p className="weekday-badge">
            적용 기준: {WEEKDAY_OPTIONS.find((o) => o.value === effectiveWeekdayType)?.label}
          </p>

          <LastTrainCards result={result} now={now} />
        </div>
      )}
    </>
  );
}

export default function App() {
  const [tab, setTab] = useState("single"); // single | route
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="page">
      <header className="header">
        <h1>지하철 막차 계산기</h1>
        <p className="subtitle">역을 검색하면 오늘 막차 시각과 남은 시간을 알려드려요.</p>
      </header>

      <div className="tabs">
        <button className={tab === "single" ? "active" : ""} onClick={() => setTab("single")}>
          역 막차 조회
        </button>
        <button className={tab === "route" ? "active" : ""} onClick={() => setTab("route")}>
          환승 경로 찾기
        </button>
      </div>

      {tab === "single" ? <SingleStationLookup now={now} /> : <RouteFinder now={now} />}
    </div>
  );
}
