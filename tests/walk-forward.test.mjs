import test from "node:test";
import assert from "node:assert/strict";
import { evaluateWalkForward } from "../research-engine/walk-forward.mjs";

const bars = () => {
  const result = [];
  let close = 100;
  for (let i = 0; i < 140; i += 1) {
    const open = close;
    close = Math.max(1, close + Math.sin(i / 4) * 1.4 + (i % 19 < 10 ? 0.3 : -0.2));
    result.push({
      timestamp: new Date(Date.UTC(2026, 0, 1 + i)).toISOString(),
      open, high: Math.max(open, close) + 0.8, low: Math.min(open, close) - 0.8,
      close, volume: 1000 + i * 10
    });
  }
  return result;
};

test("walk-forward selects on past data and reports separate OOS folds", async () => {
  const result = await evaluateWalkForward({ bars: bars(), trainWindow: 80, testWindow: 20, step: 20, maxCandidates: 3 });
  assert.equal(result.status, "COMPLETED_WALK_FORWARD_RESEARCH");
  assert.equal(result.foldCount, 3);
  assert.ok(result.folds.every(fold => Date.parse(fold.training.end) < Date.parse(fold.outOfSample.end)));
  assert.ok(result.folds.every(fold => Date.parse(fold.training.end) < Date.parse(fold.outOfSample.start)));
  assert.ok(result.folds.every(fold => fold.outOfSample.barCount === 20));
  assert.equal(result.promotionEligible, false);
  assert.ok(result.warnings.some(item => item.includes("multiple-testing")));
});

test("walk-forward is deterministic and prior folds cannot see later bars", async () => {
  const original = bars(), changed = bars();
  const a = await evaluateWalkForward({ bars: original, trainWindow: 80, testWindow: 20, step: 20, maxCandidates: 3 });
  changed[139] = { ...changed[139], open: 180, high: 190, low: 170, close: 185, volume: 9999 };
  const b = await evaluateWalkForward({ bars: changed, trainWindow: 80, testWindow: 20, step: 20, maxCandidates: 3 });
  assert.deepEqual(a.folds[0], b.folds[0]);
});

test("walk-forward rejects insufficient data and invalid windows", async () => {
  await assert.rejects(() => evaluateWalkForward({ bars: bars().slice(0, 90) }), /Insufficient bars/);
  await assert.rejects(() => evaluateWalkForward({ bars: bars(), trainWindow: 20 }), /at least 80/);
  await assert.rejects(() => evaluateWalkForward({ bars: bars(), step: 0 }), /positive integer/);
});
