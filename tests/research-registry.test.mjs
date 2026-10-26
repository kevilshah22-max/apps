import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { ResearchRegistry } from "../research-engine/registry.mjs";

const spec = () => ({
  strategy_id: "demo-ema-trend", version: "0.1.0", name: "Demo EMA trend",
  hypothesis: "A predefined trend filter may improve risk-adjusted returns in selected markets.",
  markets: ["equities"], timeframes: ["1d"],
  data_requirements: [{ field: "OHLCV", frequency: "daily", point_in_time_required: true }],
  rules: { entry: ["close above EMA"], exit: ["close below EMA"], invalidation: ["data stale"], sizing: "fixed risk budget", no_trade_conditions: ["missing bars"] },
  execution_assumptions: { fill_model: "next-bar-open", fees_model: "fixed bps", spread_slippage_model: "fixed bps" },
  validation_plan: { benchmark: "buy-and-hold", train_window: "train", validation_window: "validation", test_window: "test", walk_forward: true },
  risk_limits: { max_position_pct_equity: 10, max_portfolio_drawdown_pct: 15 },
  failure_modes: ["trend reversals", "costs exceed assumptions"]
});

test("register strategy version immutably and reject duplicate version", async () => {
  const registry = new ResearchRegistry({ clock: () => new Date("2026-01-01T00:00:00Z") });
  const registered = await registry.registerStrategy(spec());
  assert.equal(registered.payload.stage, "IDEA");
  assert.equal(registered.payload.spec_hash.length, 64);
  await assert.rejects(() => registry.registerStrategy(spec()), /already registered/);
  const altered = spec(); altered.hypothesis = "changed";
  await assert.rejects(() => registry.registerStrategy({ ...altered, strategy_id: "" }), /strategy_id/);
});

test("block promotion when validation evidence is missing or failed", async () => {
  const registry = new ResearchRegistry();
  const registered = await registry.registerStrategy(spec());
  const key = registered.payload.key;
  await registry.transition(key, "SPECIFIED", { rationale: "Rules are explicit." });
  await registry.transition(key, "DATA_VALIDATED", { rationale: "Dataset passed quality checks." });
  await assert.rejects(() => registry.transition(key, "BACKTESTED", { rationale: "No evidence yet." }), /experiment evidence/);
  const experiment = await registry.recordExperiment({
    strategyKey: key, datasetId: "dataset-hash-1", codeVersion: "git-sha-1",
    config: { feeBps: 5, slippageBps: 5 }, metrics: { tradeCount: 100, maxDrawdownPct: 8 },
    gate: "backtest", passed: true
  });
  await registry.transition(key, "BACKTESTED", { evidenceRecordIds: [experiment.record_id], rationale: "Backtest completed with costs." });
  await assert.rejects(() => registry.transition(key, "OUT_OF_SAMPLE", { evidenceRecordIds: [experiment.record_id], rationale: "Trying to skip validation." }), /Out-of-sample gate has not passed/);
});

test("persist append-only records and detect a modified record", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "bright-future-registry-"));
  const filePath = path.join(dir, "ledger.jsonl");
  try {
    const registry = new ResearchRegistry({ filePath });
    await registry.registerStrategy(spec());
    await registry.recordExperiment({ strategyKey: "demo-ema-trend@0.1.0", datasetId: "data-1", codeVersion: "sha-1", config: { a: 1 }, metrics: { n: 20 }, gate: "backtest", passed: false });
    const reloaded = new ResearchRegistry({ filePath });
    assert.equal((await reloaded.load()).length, 2);
    const lines = (await readFile(filePath, "utf8")).trim().split("\n");
    const record = JSON.parse(lines[0]); record.payload.spec.name = "tampered";
    lines[0] = JSON.stringify(record);
    const { writeFile } = await import("node:fs/promises");
    await writeFile(filePath, lines.join("\n") + "\n");
    await assert.rejects(() => new ResearchRegistry({ filePath }).load(), /hash mismatch/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
