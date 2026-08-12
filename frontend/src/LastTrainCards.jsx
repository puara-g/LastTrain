import { resolveTargetDate, formatRemaining } from "./weekday";

const SOURCE_NOTE = {
  sample: "⚠️ 샘플 데이터 (실제 시각 아님)",
};

// 두 방향이 서로 다른 출처(official/sample/estimated)를 가질 수 있어서(예: 한쪽만 실제
// 공식 데이터가 잡히고 다른 쪽은 추정인 경우), 출처 안내는 카드마다 따로 보여줍니다.
export default function LastTrainCards({ result, now }) {
  return (
    <div className="cards">
      {result.directions.map((d) => {
        if (!d.time) {
          return (
            <div className="card" key={d.label}>
              <p className="direction">{d.label}</p>
              <p className="note">{d.note || "이 방향은 정보가 없어요."}</p>
            </div>
          );
        }
        const target = resolveTargetDate(d.time, now);
        return (
          <div className="card" key={d.label}>
            <p className="direction">{d.label}</p>
            <p className="time">{d.time}</p>
            <p className="remaining">{formatRemaining(target.getTime() - now.getTime())}</p>
            {d.source === "estimated" && (
              <p className="note">
                ⚠️ {d.basedOn.name}역 샘플 값 기준 {d.basedOn.hops}개 역 차이로 추정 (실제 시각 아님)
              </p>
            )}
            {d.source === "sample" && <p className="note">{SOURCE_NOTE.sample}</p>}
          </div>
        );
      })}
    </div>
  );
}
