import { resolveTargetDate, formatRemaining } from "./weekday";
import QuickExitInfo from "./QuickExitInfo";

const SOURCE_NOTE = {
  sample: "⚠️ 샘플 데이터 (실제 시각 아님)",
};

// 백엔드가 항상 [forward, backward] 순서로 내려주므로 인덱스로 방향을 알 수 있다.
const DIRECTION_BY_INDEX = ["forward", "backward"];

// 두 방향이 서로 다른 출처(official/sample/estimated)를 가질 수 있어서(예: 한쪽만 실제
// 공식 데이터가 잡히고 다른 쪽은 추정인 경우), 출처 안내는 카드마다 따로 보여줍니다.
// 빠른하차 정보도 방향별 네모 안에 같이 넣어서, 그 방향으로 탈 때 바로 참고할 수 있게 합니다.
export default function LastTrainCards({ result, now }) {
  return (
    <div className="cards">
      {result.directions.map((d, idx) => {
        const direction = DIRECTION_BY_INDEX[idx];
        if (!d.time) {
          return (
            <div className="card" key={d.label}>
              <p className="direction">
                {d.label}
                {d.destinationLabel && <span className="destination-tag">{d.destinationLabel}</span>}
              </p>
              <p className="note">{d.note || "이 방향은 정보가 없어요."}</p>
              <QuickExitInfo name={result.name} line={result.line} direction={direction} />
            </div>
          );
        }
        const target = resolveTargetDate(d.time, now);
        const remainingMs = target.getTime() - now.getTime();
        return (
          <div className="card" key={d.label}>
            <p className="direction">
              {d.label}
              {d.destinationLabel && <span className="destination-tag">{d.destinationLabel}</span>}
            </p>
            <p className="time">{d.time}</p>
            <p className={remainingMs <= 0 ? "remaining ended" : "remaining"}>{formatRemaining(remainingMs)}</p>
            {d.source === "estimated" && (
              <p className="note">
                ⚠️ {d.basedOn.name}역 샘플 값 기준 {d.basedOn.hops}개 역 차이로 추정 (실제 시각 아님)
              </p>
            )}
            {d.source === "sample" && <p className="note">{SOURCE_NOTE.sample}</p>}
            <QuickExitInfo name={result.name} line={result.line} direction={direction} />
          </div>
        );
      })}
    </div>
  );
}
