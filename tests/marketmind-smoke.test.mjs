import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { runBacktest } from "../site/marketmind/modules/backtest-engine.mjs";
import { runPortfolioBacktest } from "../site/marketmind/modules/portfolio-backtest.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pagePath = path.join(root, "site/marketmind/index.html");

test("MarketMind page has its core workflow and parses inline JavaScript", async () => {
  const html = await readFile(pagePath, "utf8");
  assert.match(html, /<!doctype html>/i);
  assert.ok(html.includes('src="./modules/unified-workbench.js"'), "Unified workbench module must be wired into the page");
  for (const marker of ["MarketMind", "OHLCV CSV", "Analyse candles", "Specialist branches", "No live feed", "Multi-asset portfolio lab", "Run multi-asset backtest"]) {
    assert.ok(html.includes(marker), "Missing MarketMind marker: " + marker);
  }
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/gi)];
  assert.ok(scripts.length > 0, "Expected inline JavaScript");
  for (const match of scripts) assert.doesNotThrow(() => new vm.Script(match[1]), "Inline JavaScript must parse");
});

test("every present specialist module parses", async () => {
  const dir = path.join(root, "site/marketmind/modules");
  let files = [];
  try { files = (await readdir(dir)).filter(f => f.endsWith(".js")); } catch {}
  for (const file of files) {
    const src = await readFile(path.join(dir, file), "utf8");
    const cjsParseable = src.replace(/^import .*;\s*$/gm, "").replace(/\bexport\s+(?=(function|const|class)\b)/g, "");
    assert.doesNotThrow(() => new vm.Script(cjsParseable), file + " must parse after stripping ESM import/export declarations");
  }
});

const backtestBars = () => [
  { timestamp: "2026-01-01T00:00:00Z", open: 100, high: 102, low: 99, close: 101, volume: 1000 },
  { timestamp: "2026-01-02T00:00:00Z", open: 102, high: 104, low: 101, close: 103, volume: 1100 },
  { timestamp: "2026-01-03T00:00:00Z", open: 104, high: 105, low: 102, close: 103, volume: 900 },
  { timestamp: "2026-01-04T00:00:00Z", open: 101, high: 102, low: 98, close: 99, volume: 1200 }
];

test("browser backtest engine is deterministic and cost-aware", async () => {
  const input = { bars: backtestBars(), onBar: ({ index }) => ({ targetPosition: index < 2 ? 1 : 0 }), initialCash: 1000, feeBps: 10, slippageBps: 20 };
  const first = await runBacktest(input);
  const second = await runBacktest(input);
  assert.deepEqual(first, second);
  assert.equal(first.dataset.sha256.length, 64);
  assert.equal(first.assumptions.fillModel, "next-bar-open");
  assert.ok(first.metrics.totalFees > 0);
  assert.ok(first.metrics.totalSlippageCost > 0);
  assert.ok(first.benchmark.definition.includes("Buy one unit"));
});

test("browser backtest engine rejects timestamps without explicit timezone", async () => {
  const invalid = backtestBars();
  invalid[0].timestamp = "2026-01-01T00:00:00";
  await assert.rejects(() => runBacktest({ bars: invalid, onBar: () => ({ targetPosition: 0 }) }), /explicit timezone/);
});

test("browser backtest strategy history cannot see future bars", async () => {
  const firstBars = backtestBars();
  const changedFuture = backtestBars();
  changedFuture[3] = { ...changedFuture[3], open: 180, high: 190, low: 170, close: 185, volume: 9999 };
  const strategy = ({ history }) => ({ targetPosition: history.length > 1 && history.at(-1).close > history[0].close ? 1 : 0 });
  const first = await runBacktest({ bars: firstBars, onBar: strategy });
  const second = await runBacktest({ bars: changedFuture, onBar: strategy });
  assert.deepEqual(first.equityCurve.slice(0, 3), second.equityCurve.slice(0, 3));
});

test("multi-asset portfolio engine is wired to the workbench and runs equal-weight baseline", async () => {
  const series = {
    AAA: [
      { timestamp: "2026-01-01T00:00:00Z", open: 100, high: 102, low: 99, close: 101, volume: 1000 },
      { timestamp: "2026-01-02T00:00:00Z", open: 102, high: 104, low: 101, close: 103, volume: 1100 }
    ],
    BBB: [
      { timestamp: "2026-01-01T00:00:00Z", open: 50, high: 51, low: 49, close: 50, volume: 2000 },
      { timestamp: "2026-01-02T00:00:00Z", open: 51, high: 53, low: 50, close: 52, volume: 2100 }
    ]
  };
  const result = await runPortfolioBacktest({
    series, onBar: () => ({ weights: { AAA: 0.5, BBB: 0.5 } }),
    initialCash: 10000, feeBps: 5, slippageBps: 5
  });
  assert.equal(result.status, "COMPLETED");
  assert.equal(result.dataset.symbols.length, 2);
  assert.equal(result.orders.length, 2);
  assert.equal(result.assumptions.fillModel, "next-bar-open");
});
