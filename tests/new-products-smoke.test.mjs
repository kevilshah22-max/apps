import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const pages = [
  { path: new URL("../site/riskdesk/index.html", import.meta.url), title: "RiskDesk", markers: ["Position sizing", "Local trade journal", "Export CSV"] },
  { path: new URL("../site/cartoonforge/index.html", import.meta.url), title: "CartoonForge", markers: ["Build storyboard", "Export project JSON", "production brief"] },
  { path: new URL("../site/marketmind/index.html", import.meta.url), title: "MarketMind", markers: ["OHLCV CSV", "Analyse candles", "Specialist branches"] }
];

for (const page of pages) {
  test(`${page.title}: inline JavaScript parses and key features exist`, async () => {
    const html = await readFile(page.path, "utf8");
    assert.match(html, /<!doctype html>/i);
    assert.match(html, new RegExp(`<title>${page.title}`));
    for (const marker of page.markers) assert.ok(html.includes(marker), `Missing feature marker: ${marker}`);
    const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/gi)];
    assert.ok(scripts.length > 0, "Expected an inline script");
    for (const match of scripts) assert.doesNotThrow(() => new vm.Script(match[1]), "Inline script must parse");
  });
}
