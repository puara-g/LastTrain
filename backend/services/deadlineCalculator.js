const { lookupDirectional, directionBetween, timeToMinutes, minutesToTime } = require("./lastTrainLookup");

// 막차 시각들은 자정을 넘기면(예: "00:12") 사실상 전날 밤이 이어지는 시각이라, 그대로
// 분(minute)으로 바꾸면 큰 값(밤 11시대)보다 작아져서 뺄셈/비교가 꼬인다. 그래서 새벽
// 4시 이전 시각은 24시간을 더해 "그날 밤이 계속되는 시각"으로 취급한다.
function toExtendedMinutes(timeStr) {
  const [h] = timeStr.split(":").map(Number);
  const mins = timeToMinutes(timeStr);
  return h < 4 ? mins + 1440 : mins;
}

const SOURCE_RANK = { official: 3, sample: 2, estimated: 1 };

// 환승을 포함한 전체 경로를, 도착지에 가장 가까운 구간부터 거꾸로 훑으며
// "이 구간에서 이 시각까지는 타야 다음 연결(환승 또는 최종 도착)을 놓치지 않는다"를 계산합니다.
// 각 구간마다 그 구간의 실제(혹은 표본 기반 추정) 막차가 다음 연결에 늦지 않는지 확인하고,
// 늦는다면 "실제 열차 시각은 아니지만 계산상 이 시각까지는 타야 한다"는 값으로 대체합니다.
//
// 구간 하나에 데이터가 없어도(예: 표본이 없는 노선) 나머지 구간의 정보는 최대한 보여주기
// 위해, 각 구간의 "이 방향 막차 자체"는 항상 조회를 시도하고, "환승까지 고려한 마지노선"만
// 데이터가 끊긴 지점부터 앞쪽(더 이른 구간)으로는 계산을 멈춥니다.
async function computeDeadline({ legs, transferStations, transferMinutesEstimate, weekdayType }) {
  const perLeg = new Array(legs.length);

  // 1단계: 각 구간의 "그 방향" 막차 자체를 순서 상관없이 전부 조회.
  for (let i = 0; i < legs.length; i++) {
    const leg = legs[i];
    const direction = directionBetween(leg.line, leg.from, leg.to);
    if (!direction) {
      perLeg[i] = {
        line: leg.line,
        from: leg.from,
        to: leg.to,
        own: { available: false, reason: "진행 방향을 판단할 수 없어요." },
      };
      continue;
    }
    const lookup = await lookupDirectional({ name: leg.from, line: leg.line, weekdayType, direction });
    perLeg[i] = { line: leg.line, from: leg.from, to: leg.to, direction, own: lookup };
  }

  // 2단계: 마지막 구간부터 거꾸로 마지노선 계산. 데이터가 없는 구간을 만나면 그 지점에서
  // 체인이 끊기므로, 그보다 앞쪽 구간들은 "deadline"(환승 고려 마지노선)을 계산하지 않는다.
  let nextDeadlineExt = null;
  let weakestSource = "official";
  let anyCalculated = false;
  let brokenAt = null;

  for (let i = legs.length - 1; i >= 0; i--) {
    if (brokenAt !== null) break;
    const leg = legs[i];
    const lookup = perLeg[i].own;
    if (!lookup.available) {
      brokenAt = i;
      break;
    }

    if (SOURCE_RANK[lookup.source] < SOURCE_RANK[weakestSource]) {
      weakestSource = lookup.source;
    }

    const ownDeadlineExt = toExtendedMinutes(lookup.time);
    let effectiveDeadlineExt;
    let achievedVia;

    if (nextDeadlineExt === null) {
      effectiveDeadlineExt = ownDeadlineExt;
      achievedVia = "real";
    } else {
      const requiredArrivalExt = nextDeadlineExt - transferMinutesEstimate[i].minutes;
      const ownArrivalExt = ownDeadlineExt + leg.estimatedMinutes;
      if (ownArrivalExt <= requiredArrivalExt) {
        effectiveDeadlineExt = ownDeadlineExt;
        achievedVia = "real";
      } else {
        effectiveDeadlineExt = requiredArrivalExt - leg.estimatedMinutes;
        achievedVia = "calculated";
        anyCalculated = true;
      }
    }

    perLeg[i].deadline = minutesToTime(effectiveDeadlineExt);
    perLeg[i].achievedVia = achievedVia;
    nextDeadlineExt = effectiveDeadlineExt;
  }

  if (brokenAt !== null) {
    return {
      reachable: false,
      reason: `${legs[brokenAt].from}역(${legs[brokenAt].line}) 막차 정보가 없어서 전체 마지노선을 계산할 수 없어요. (${perLeg[brokenAt].own.reason})`,
      perLeg,
    };
  }

  return {
    reachable: true,
    deadline: minutesToTime(nextDeadlineExt),
    perLeg,
    weakestSource,
    anyCalculated,
  };
}

module.exports = { computeDeadline };
