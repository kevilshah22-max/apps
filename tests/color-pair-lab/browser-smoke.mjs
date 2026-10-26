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
    res.writeHead(200, { "content-type": mime[path.extname(filePath)] ?? "application/octet-stream" });
    res.end(await readFile(filePath));
  } catch {
    res.writeHead(404).end("Not found");
  }
});

await new Promise((resolve, reject) => {
  server.once("error", reject);
  server.listen(0, "127.0.0.1", resolve);
});

const address = server.address();
const baseUrl = "http://127.0.0.1:" + address.port;
const browser = await chromium.launch({ headless: true });
const pageErrors = [];

try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
  const page = await context.newPage();
  page.on("pageerror", error => pageErrors.push(error.message));

  await page.goto(baseUrl + "/color-pair-lab/", { waitUntil: "networkidle" });
  assert.match(await page.locator("h1").innerText(), /Good colour/);
  assert.match(await page.locator("#verdict").innerText(), /AA NORMAL PASS/);

  await page.locator("#foreground-hex").fill("#777777");
  await page.locator("#background-hex").fill("#ffffff");
  assert.equal(await page.locator("#ratio").innerText(), "4.48:1");
  assert.equal(await page.locator("#verdict").innerText(), "AA NORMAL FAIL");
  assert.equal(await page.locator(".check-row").nth(1).locator("span").innerText(), "PASS");

  await page.locator("#apply-recommendation").click();
  assert.equal(await page.locator("#foreground-hex").inputValue(), "#000000");
  assert.equal(await page.locator("#ratio").innerText(), "21.00:1");
  assert.equal(await page.locator("#verdict").innerText(), "AA NORMAL PASS");

  await page.locator("#pair-name").fill("Readable light theme");
  await page.locator("#save-pair").click();
  assert.equal(await page.locator(".saved-card").count(), 1);
  assert.match(await page.locator("#saved-list").innerText(), /Readable light theme/);

  const [exportDownload] = await Promise.all([
    page.waitForEvent("download"),
    page.locator("#export-json").click(),
  ]);
  const exportPath = await exportDownload.path();
  assert.ok(exportPath);
  const exported = JSON.parse(await readFile(exportPath, "utf8"));
  assert.equal(exported.savedPairs.length, 1);
  assert.equal(exported.savedPairs[0].name, "Readable light theme");

  await page.evaluate(() => localStorage.setItem("nexa-color-pair-lab-v1", "{not-json"));
  await page.reload({ waitUntil: "networkidle" });
  assert.equal(await page.locator("#recovery-banner").isVisible(), true);
  await page.locator("#save-pair").click();
  assert.match(await page.locator("#status").innerText(), /recovery warning/);

  const [recoveryDownload] = await Promise.all([
    page.waitForEvent("download"),
    page.locator("#download-recovery").click(),
  ]);
  const recoveryPath = await recoveryDownload.path();
  assert.ok(recoveryPath);
  assert.equal(await readFile(recoveryPath, "utf8"), "{not-json");

  page.once("dialog", dialog => dialog.accept());
  await page.locator("#discard-recovery").click();
  assert.equal(await page.locator("#recovery-banner").isVisible(), false);
  await page.locator("#save-pair").click();
  assert.equal(await page.locator(".saved-card").count(), 1);

  await page.setViewportSize({ width: 390, height: 844 });
  const noHorizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
  assert.equal(noHorizontalOverflow, true, "Mobile layout should not overflow horizontally");
  assert.deepEqual(pageErrors, [], "Browser should not report uncaught page errors");

  console.log("Color Pair Lab browser smoke tests passed: contrast interaction, recommendation, saved pairs, JSON export, corrupt-storage recovery, reset, and mobile overflow.");
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
