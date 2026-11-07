import test from "node:test";
import assert from "node:assert/strict";
import { runBacktest } from "../research-engine/backtest.mjs";

const bars = () => [
  { timestamp: "2026-01-01T00:00:00Z", open: 100, high: 102, low: 99, close: 101, volume: 1000 },
  { timestamp: "2026-01-02T00:00:00Z", open: 102, high: 104, low: 101, close: 103, volume: 1100 },
  { timestamp: "2026-01-03T00:00:00Z", open: 104, high: 105, low: 102, close: 103, volume: 900 },
  { timestamp: "2026-01-04T00:00:00Z", open: 101, high: 102, low: 98, close: 99, volume: 1200 }
];

test("next-bar-open fills only after a signal and never fills a final-bar signal", async () => {
  const result = await runBacktest({
    bars: bars(),
    onBar: ({ index }) => ({ targetPosition: index < 2 ? 1 : 0 }),
    initialCash: 1000
  });
  assert.equal(result.orders.length, 2);
  assert.equal(result.orders[0].signalTimestamp, "2026-01-01T00:00:00.000Z");
  assert.equal(result.orders[0].timestamp, "2026-01-02T00:00:00.000Z");
  assert.equal(result.orders[0].referencePrice, 102);
  assert.equal(result.orders[1].side, "sell");
  assert.equal(result.metrics.tradeCount, 1);
});

test("strategy receives immutable history ending at the current bar only", async () => {
  const result = await runBacktest({
    bars: bars(),
    onBar: ({ bar, index, history }) => {
      assert.equal(history.length, index + 1);
      assert.equal(history.at(-1).timestamp, bar.timestamp);
      assert.equal(Object.isFrozen(history), true);
      assert.equal(Object.isFrozen(bar), true);
      assert.equal("futureBars" in bar, false);
      return { targetPosition: 0 };
    }
  });
  assert.equal(result.equityCurve.length, 4);
});

test("mutating future bars cannot change earlier equity observations", async () => {
  const original = bars();
  const altered = bars();
  altered[3] = { ...altered[3], open: 180, high: 190, low: 170, close: 185, volume: 9999 };
  const strategy = ({ history }) => ({
    targetPosition: history.length >= 2 && history.at(-1).close > history[0].close ? 1 : 0
  });
  const first = await runBacktest({ bars: original, onBar: strategy });
  const second = await runBacktest({ bars: altered, onBar: strategy });
  assert.deepEqual(first.equityCurve.slice(0, 3), second.equityCurve.slice(0, 3));
});

test("fees and slippage reduce net equity and are recorded separately", async () => {
  const strategy = ({ index }) => ({ targetPosition: index === 0 ? 1 : 0 });
  const clean = await runBacktest({ bars: bars(), onBar: strategy, initialCash: 1000 });
  const costly = await runBacktest({ bars: bars(), onBar: strategy, initialCash: 1000, feeBps: 10, slippageBps: 20 });
  assert.ok(costly.metrics.finalEquity < clean.metrics.finalEquity);
  assert.ok(costly.metrics.totalFees > 0);
  assert.ok(costly.metrics.totalSlippageCost > 0);
  assert.ok(costly.metrics.grossReturnPct > costly.metrics.totalReturnPct);
});

test("same-bar-close execution is explicit and uses the current close", async () => {
  const result = await runBacktest({
    bars: bars(),
    fillModel: "same-bar-close",
    onBar: ({ index }) => ({ targetPosition: index === 0 ? 1 : 0 })
  });
  assert.equal(result.orders[0].timestamp, "2026-01-01T00:00:00.000Z");
  assert.equal(result.orders[0].referencePrice, 101);
  assert.equal(result.assumptions.fillModel, "same-bar-close");
});

test("rejects unsorted, duplicate, timezone-ambiguous and malformed OHLCV", async () => {
  const valid = bars();
  await assert.rejects(() => runBacktest({ bars: [valid[1], valid[0]], onBar: () => ({ targetPosition: 0 }) }), /strictly chronological/);
  await assert.rejects(() => runBacktest({ bars: [valid[0], valid[0]], onBar: () => ({ targetPosition: 0 }) }), /strictly chronological/);
  const noZone = bars(); noZone[0].timestamp = "2026-01-01T00:00:00";
  await assert.rejects(() => runBacktest({ bars: noZone, onBar: () => ({ targetPosition: 0 }) }), /explicit timezone/);
  const invalid = bars(); invalid[1].low = 105;
  await assert.rejects(() => runBacktest({ bars: invalid, onBar: () => ({ targetPosition: 0 }) }), /inconsistent OHLC/);
});

test("rejects invalid strategy output, async strategy and position-limit breach", async () => {
  await assert.rejects(() => runBacktest({ bars: bars(), onBar: () => ({}) }), /finite number/);
  await assert.rejects(() => runBacktest({ bars: bars(), onBar: async () => ({ targetPosition: 1 }) }), /synchronous/);
  await assert.rejects(() => runBacktest({ bars: bars(), onBar: () => ({ targetPosition: 2 }) }), /maxPositionUnits/);
});

test("is deterministic and reports dataset provenance plus a defined baseline", async () => {
  const input = { bars: bars(), onBar: ({ index }) => ({ targetPosition: index % 2 ? 0 : 1 }), feeBps: 5, slippageBps: 3 };
  const first = await runBacktest(input);
  const second = await runBacktest(input);
  assert.deepEqual(first, second);
  assert.equal(first.dataset.sha256.length, 64);
  assert.equal(first.dataset.barCount, 4);
  assert.match(first.benchmark.definition, /Buy one unit at first bar open/);
  assert.equal(first.metrics.maxDrawdownPct >= 0, true);
});
