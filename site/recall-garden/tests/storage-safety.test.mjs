import test from "node:test";
import assert from "node:assert/strict";
import { parseCardStorage, readReviewCount, canStartCorruptReset, canDiscardCorruptData } from "../storage-safety.mjs";

const validCard = {
  id: "card-1", question: "What is osmosis?", answer: "Net movement of water.",
  tag: "biology", dueAt: 1792573200000, interval: 1, ease: 2.5, reps: 0
};

test("a missing storage key opens a new empty garden", () => {
  assert.deepEqual(parseCardStorage(null), { state: "ready", cards: [], raw: null });
});

test("valid saved cards load unchanged", () => {
  const raw = JSON.stringify([validCard]);
  const result = parseCardStorage(raw);
  assert.equal(result.state, "ready");
  assert.deepEqual(result.cards, [validCard]);
  assert.equal(result.raw, raw);
});

test("malformed JSON is quarantined without replacing its original text", () => {
  const raw = "{this is not valid JSON";
  const result = parseCardStorage(raw);
  assert.equal(result.state, "corrupt");
  assert.deepEqual(result.cards, []);
  assert.equal(result.raw, raw);
});

test("an invalid card schema is treated as corrupt rather than an empty garden", () => {
  const raw = JSON.stringify([{ id: "card-1", question: "Only half a record" }]);
  const result = parseCardStorage(raw);
  assert.equal(result.state, "corrupt");
  assert.equal(result.raw, raw);
});

test("review counters are safely normalised without affecting valid cards", () => {
  assert.equal(readReviewCount(null), 0);
  assert.equal(readReviewCount("12"), 12);
  assert.equal(readReviewCount("12.9"), 12);
  assert.equal(readReviewCount("-2"), 0);
  assert.equal(readReviewCount("not-a-number"), 0);
});

test("reset confirmation can be shown only for corrupt data after a recovery download", () => {
  assert.equal(canStartCorruptReset("corrupt", false), false);
  assert.equal(canStartCorruptReset("unavailable", true), false);
  assert.equal(canStartCorruptReset("ready", true), false);
  assert.equal(canStartCorruptReset("corrupt", true), true);
});

test("discard requires corrupt state, a recovery download and explicit confirmation", () => {
  assert.equal(canDiscardCorruptData("corrupt", false, true), false);
  assert.equal(canDiscardCorruptData("corrupt", true, false), false);
  assert.equal(canDiscardCorruptData("unavailable", true, true), false);
  assert.equal(canDiscardCorruptData("corrupt", true, true), true);
});
