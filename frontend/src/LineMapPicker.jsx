import { useState } from "react";
import { getLineDiagram } from "./api";
import { LINE_COLORS, getLineColor, getLineNumber } from "./lineColors";

const LINES = Object.keys(LINE_COLORS);

// [{name, branch}, ...]를 "연속된 같은 branch" 단위로 묶는다. branch가 null이면 본선
// 구간, 문자열이면 그 이름의 지선 구간이다. 지선 구간 앞에 갈림 표시를 넣기 위해 나눈다.
function groupSegments(stations) {
  const segments = [];
  stations.forEach((s) => {
    const last = segments[segments.length - 1];
    if (last && last.branch === s.branch) {
      last.stations.push(s);
    } else {
      segments.push({ branch: s.branch, stations: [s] });
    }
  });
  return segments;
}

// 검색창에 타이핑하지 않고도, 호선을 먼저 고르고 그 호선의 역을 순서대로 훑어보며
// 고를 수 있게 하는 노선도 형태의 역 선택기.
export default function LineMapPicker({ onSelect }) {
  const [activeLine, setActiveLine] = useState(null);
  const [diagram, setDiagram] = useState(null);
  const [loading, setLoading] = useState(false);

  function handlePickLine(line) {
    if (activeLine === line) {
      setActiveLine(null);
      setDiagram(null);
      return;
    }
    setActiveLine(line);
    setLoading(true);
    getLineDiagram(line)
      .then(setDiagram)
      .catch(() => setDiagram(null))
      .finally(() => setLoading(false));
  }

  // 지선 역은 "본선명 + 지선명"이 실제 노선 라벨이라 그래야 막차 방향 판별이 된다
  // (예: 성수지선의 "용답"은 line: "2호선 성수지선"으로 조회해야 함).
  function handlePickStation(name, branch) {
    onSelect({ name, line: branch ? `${activeLine} ${branch}` : activeLine });
  }

  const segments = diagram ? groupSegments(diagram.stations) : [];

  return (
    <div className="line-map-picker">
      <div className="line-map-line-buttons">
        {LINES.map((line) => {
          const label = getLineNumber(line);
          return (
            <button
              key={line}
              type="button"
              className={`line-map-line-btn${label.length > 1 ? " two-chars" : ""}${
                activeLine === line ? " active" : ""
              }`}
              style={{ backgroundColor: getLineColor(line) }}
              onClick={() => handlePickLine(line)}
            >
              {label}
            </button>
          );
        })}
      </div>

      {activeLine && (
        <div className="line-map-strip-wrap">
          {loading ? (
            <p className="note">{activeLine} 역 목록 불러오는 중...</p>
          ) : !diagram ? (
            <p className="note">노선 정보를 불러오지 못했어요.</p>
          ) : (
            <div className="line-map-strip" style={{ "--line-color": getLineColor(activeLine) }}>
              {segments.map((seg, segIdx) => (
                <div className={`line-map-segment${seg.branch ? " branch" : ""}`} key={segIdx}>
                  {seg.branch && <span className="line-map-branch-label">↳ {seg.branch}</span>}
                  <div className="line-map-segment-track">
                    {seg.stations.map((s) => (
                      <button
                        type="button"
                        key={`${s.branch || "main"}-${s.name}`}
                        className="line-map-station"
                        onClick={() => handlePickStation(s.name, s.branch)}
                      >
                        <span className="line-map-station-dot" />
                        <span className="line-map-station-name">{s.name}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
              {diagram.loop && (
                <span className="line-map-loop-note">↩ {diagram.stations[0].name} 방면 (순환)</span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
