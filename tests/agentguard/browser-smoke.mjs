import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const here = path.dirname(fileURLToPath(import.meta.url));
const siteRoot = path.resolve(here, "../../site");
const mime = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    let pathname = decodeURIComponent(url.pathname);
    if (pathname.endsWith("/")) pathname += "index.html";
    const filePath = path.resolve(siteRoot, "." + pathname);
    if (filePath !== siteRoot && !filePath.startsWith(siteRoot + path.sep)) {
      res.writeHead(403).end("Forbidden");
      return;
    }
    const info = await stat(filePath);
    if (!info.isFile()) {
      res.writeHead(404).end("Not found");
      return;
    }
    const body = await readFile(filePath);
    res.writeHead(200, { "content-type": mime[path.extname(filePath)] ?? "application/octet-stream" });
    res.end(body);
  } catch {
    res.writeHead(404).end("Not found");
  }
});

await new Promise((resolve, reject) => {
  server.once("error", reject);
  server.listen(0, "127.0.0.1", resolve);
});

const address = server.address();
const baseUrl = `http://127.0.0.1:${address.port}`;
const browser = await chromium.launch({ headless: true });
const pageErrors = [];

try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.on("pageerror", error => pageErrors.push(error.message));

  await page.goto(`${baseUrl}/agentguard/`, { waitUntil: "networkidle" });
  assert.match(await page.locator("#status").innerText(), /Paste a plan/);

  await page.locator("#sample").click();
  assert.match(await page.locator("#status").innerText(), /Preflight complete/);
  assert.match(await page.locator("#report").innerText(), /Credential or secret access/);
  assert.equal(await page.locator("#report").getAttribute("class"), "report-content");

  await page.locator("#plan").fill("Email the report to an external address");
  assert.equal(await page.locator("#score").innerText(), "— / 100");
  assert.equal(await page.locator("#report").getAttribute("class"), "report-empty");
  await page.locator("#export").click();
  assert.match(await page.locator("#status").innerText(), /Run preflight before exporting/);

  await page.locator("#scan").click();
  assert.equal(await page.locator("#score").innerText(), "18 / 100");
  assert.match(await page.locator("#report").innerText(), /REVIEW REQUIRED/);

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.locator("#export").click(),
  ]);
  const downloadedPath = await download.path();
  assert.ok(downloadedPath, "Expected the report download to be available");
  const exportedText = await readFile(downloadedPath, "utf8");
  const exported = JSON.parse(exportedText);
  assert.equal(exported.score, 18);
  assert.equal(exported.humanReviewRequired, true);
  assert.equal(Object.hasOwn(exported, "plan"), false);
  assert.equal(exportedText.includes("Email the report to an external address"), false);

  await page.locator("#clear").click();
  assert.equal(await page.locator("#score").innerText(), "— / 100");
  assert.equal(await page.locator("#report").getAttribute("class"), "report-empty");

  await page.setViewportSize({ width: 390, height: 844 });
  const noHorizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
  assert.equal(noHorizontalOverflow, true, "Mobile layout should not overflow horizontally");
  assert.deepEqual(pageErrors, [], "Browser should not report uncaught page errors");

  console.log("AgentGuard browser smoke tests passed: sample scan, stale-result invalidation, risk threshold, privacy-safe export, clear/reset, and mobile overflow.");
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
