import test from "node:test";
import assert from "node:assert/strict";
import { screenStrategyCandidates, candidateFamilies } from "../research-engine/candidate-lab.mjs";

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

test("candidate lab generates bounded deterministic strategy hypotheses", async () => {
  const input = { bars: bars(), feeBps: 5, slippageBps: 5 };
  const first = await screenStrategyCandidates(input);
  const second = await screenStrategyCandidates(input);
  assert.deepEqual(first, second);
  assert.equal(first.status, "COMPLETED_RESEARCH_SCREEN");
  assert.equal(first.candidateCount, 21);
  assert.deepEqual(new Set(first.ranking.map(item => item.family)), new Set(candidateFamilies));
  assert.ok(first.ranking.every(item => item.researchStage === "IN_SAMPLE_SCREEN_ONLY"));
  assert.ok(first.ranking.every(item => item.promotionEligible === false));
  assert.ok(first.ranking.every(item => item.dataset.sha256.length === 64));
});

test("candidate lab limits trial count and rejects invalid inputs", async () => {
  const limited = await screenStrategyCandidates({ bars: bars(), maxCandidates: 3 });
  assert.equal(limited.candidateCount, 3);
  await assert.rejects(() => screenStrategyCandidates({ bars: bars(), maxCandidates: 101 }), /1 to 100/);
  await assert.rejects(() => screenStrategyCandidates({ bars: [] }), /at least two/);
});

test("candidate lab explicitly discloses multiple-testing and no-promotion safeguards", async () => {
  const result = await screenStrategyCandidates({ bars: bars(), maxCandidates: 2 });
  assert.ok(result.warnings.some(item => item.includes("multiple-testing")));
  assert.ok(result.warnings.some(item => item.includes("not a probability")));
  assert.ok(result.warnings.some(item => item.includes("No candidate is promotion-eligible")));
});
