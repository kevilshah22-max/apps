import test from "node:test";
import assert from "node:assert/strict";
import {
  bestTextColor,
  contrastRatio,
  evaluateContrast,
  formatRatio,
  normalizeHex,
  relativeLuminance,
} from "../app/color-pair-lab/contrast.ts";

test("normalizes three-digit and six-digit hex colours", () => {
  assert.equal(normalizeHex("#AbC"), "#aabbcc");
  assert.equal(normalizeHex("AABBCC"), "#aabbcc");
});

test("rejects malformed and non-hex input", () => {
  assert.equal(normalizeHex("#12"), null);
  assert.equal(normalizeHex("#gggggg"), null);
  assert.equal(normalizeHex("red"), null);
  assert.equal(normalizeHex("#12345678"), null);
});

test("black and white produce the maximum 21:1 ratio", () => {
  assert.equal(contrastRatio("#000", "#fff"), 21);
});

test("identical colours produce a 1:1 ratio", () => {
  assert.equal(contrastRatio("#123456", "#123456"), 1);
});

test("contrast ratio is symmetric", () => {
  assert.equal(contrastRatio("#ffffff", "#777777"), contrastRatio("#777777", "#ffffff"));
});

test("relative luminance is zero for black and one for white", () => {
  assert.equal(relativeLuminance("#000000"), 0);
  assert.equal(relativeLuminance("#ffffff"), 1);
});

test("AA normal text threshold is applied at 4.5:1", () => {
  assert.equal(evaluateContrast("#767676", "#ffffff").aaNormal, true);
  assert.equal(evaluateContrast("#777777", "#ffffff").aaNormal, false);
});

test("large-text and AAA thresholds remain distinct", () => {
  const checks = evaluateContrast("#777777", "#ffffff");
  assert.equal(checks.aaLarge, true);
  assert.equal(checks.aaaNormal, false);
  assert.equal(checks.aaaLarge, false);
  assert.equal(checks.nonText, true);
});

test("best text colour chooses black or white by actual ratio", () => {
  assert.deepEqual(bestTextColor("#ffffff"), { color: "#000000", ratio: 21 });
  assert.deepEqual(bestTextColor("#000000"), { color: "#ffffff", ratio: 21 });
  const middle = bestTextColor("#808080");
  assert.ok(middle.color === "#000000" || middle.color === "#ffffff");
  assert.ok(middle.ratio > 1);
});

test("ratio formatting is stable for the UI", () => {
  assert.equal(formatRatio(4.499), "4.50:1");
});
