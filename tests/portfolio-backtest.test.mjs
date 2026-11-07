import test from "node:test";
import assert from "node:assert/strict";
import { runPortfolioBacktest } from "../site/marketmind/modules/portfolio-backtest.mjs";

const fixture = () => ({
  AAA: [
    { timestamp: "2026-01-01T00:00:00Z", open: 100, high: 102, low: 99, close: 101, volume: 1000 },
    { timestamp: "2026-01-02T00:00:00Z", open: 102, high: 105, low: 101, close: 104, volume: 1100 },
    { timestamp: "2026-01-03T00:00:00Z", open: 105, high: 106, low: 102, close: 103, volume: 900 },
    { timestamp: "2026-01-04T00:00:00Z", open: 103, high: 104, low: 100, close: 101, volume: 1200 }
  ],
  BBB: [
    { timestamp: "2026-01-01T00:00:00Z", open: 50, high: 51, low: 49, close: 50, volume: 2000 },
    { timestamp: "2026-01-02T00:00:00Z", open: 51, high: 53, low: 50, close: 52, volume: 2100 },
    { timestamp: "2026-01-03T00:00:00Z", open: 52, high: 54, low: 51, close: 53, volume: 1900 },
    { timestamp: "2026-01-04T00:00:00Z", open: 53, high: 54, low: 50, close: 51, volume: 2200 }
  ]
});

test("portfolio engine is deterministic, cost-aware and benchmarked", async () => {
  const input = { series: fixture(), initialCash: 10000, feeBps: 10, slippageBps: 20,
    onBar: ({ index }) => ({ weights: index < 2 ? { AAA: 0.5, BBB: 0.5 } : {} }) };
  const a = await runPortfolioBacktest(input);
  const b = await runPortfolioBacktest(input);
  assert.deepEqual(a, b);
  assert.equal(a.dataset.symbols.length, 2);
  assert.equal(a.dataset.sha256.length, 64);
  assert.equal(a.assumptions.fillModel, "next-bar-open");
  assert.ok(a.metrics.totalFees > 0);
  assert.ok(a.metrics.totalSlippageCost > 0);
  assert.ok(a.benchmark.definition.includes("Equal-weight buy-and-hold"));
  assert.equal(a.equityCurve.length, 4);
  assert.equal(a.assetLedger.length, 8);
});

test("portfolio engine prevents future-bar leakage", async () => {
  const original = fixture(), changed = fixture();
  changed.AAA[3] = { ...changed.AAA[3], open: 180, high: 190, low: 170, close: 185 };
  const strategy = ({ history }) => ({ weights: { AAA: history.AAA.length > 1 && history.AAA.at(-1).close > history.AAA[0].close ? 0.5 : 0, BBB: 0.25 } });
  const a = await runPortfolioBacktest({ series: original, onBar: strategy });
  const b = await runPortfolioBacktest({ series: changed, onBar: strategy });
  assert.deepEqual(a.equityCurve.slice(0, 3), b.equityCurve.slice(0, 3));
});

test("portfolio engine rejects misaligned timestamps", async () => {
  const series = fixture();
  series.BBB[2] = { ...series.BBB[2], timestamp: "2026-01-03T01:00:00Z" };
  await assert.rejects(() => runPortfolioBacktest({ series, onBar: () => ({ weights: {} }) }), /identical aligned timestamps/);
});

test("portfolio engine enforces per-asset and gross exposure limits", async () => {
  await assert.rejects(() => runPortfolioBacktest({ series: fixture(), maxAbsWeight: 0.6,
    onBar: () => ({ weights: { AAA: 0.7 } }) }), /maxAbsWeight/);
  await assert.rejects(() => runPortfolioBacktest({ series: fixture(), maxGrossExposure: 0.8,
    onBar: () => ({ weights: { AAA: 0.5, BBB: 0.5 } }) }), /maxGrossExposure/);
});

test("portfolio engine rejects unknown symbols, malformed weights and timezone ambiguity", async () => {
  await assert.rejects(() => runPortfolioBacktest({ series: fixture(), onBar: () => ({ weights: { XYZ: 0.2 } }) }), /Unknown asset/);
  await assert.rejects(() => runPortfolioBacktest({ series: fixture(), onBar: () => ({ weights: { AAA: NaN } }) }), /finite/);
  const series = fixture(); series.AAA[0] = { ...series.AAA[0], timestamp: "2026-01-01T00:00:00" };
  await assert.rejects(() => runPortfolioBacktest({ series, onBar: () => ({ weights: {} }) }), /explicit timezone/);
});

test("portfolio engine rejects async strategy callbacks", async () => {
  await assert.rejects(() => runPortfolioBacktest({ series: fixture(), onBar: async () => ({ weights: {} }) }), /synchronous/);
});
