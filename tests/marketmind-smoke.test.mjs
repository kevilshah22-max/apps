import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pagePath = path.join(root, "site/marketmind/index.html");

test("MarketMind page has its core workflow and parses inline JavaScript", async () => {
  const html = await readFile(pagePath, "utf8");
  assert.match(html, /<!doctype html>/i);
  assert.ok(html.includes('src="./modules/unified-workbench.js"'), "Unified workbench module must be wired into the page");
  for (const marker of ["MarketMind", "OHLCV CSV", "Analyse candles", "Specialist branches", "No live feed"]) {
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
