import test from "node:test";
import assert from "node:assert/strict";

class MockElement {
  constructor(name = "") {
    this.name = name;
    this.value = "";
    this.textContent = "";
    this.className = "";
    this.dataset = {};
    this.children = [];
    this.listeners = {};
  }
  addEventListener(type, callback) {
    this.listeners[type] = callback;
  }
  append(...children) {
    this.children.push(...children);
  }
  replaceChildren(...children) {
    this.children = [...children];
  }
  remove() {}
  click() {}
}

const elements = new Map();
globalThis.document = {
  querySelector(selector) {
    if (!elements.has(selector)) elements.set(selector, new MockElement(selector));
    return elements.get(selector);
  },
  createElement(tag) {
    return new MockElement(tag);
  }
};

await import("../app.js");

test("editing a scanned plan invalidates the old result and blocks stale export", () => {
  const plan = elements.get("#plan");
  const scan = elements.get("#scan");
  const exportButton = elements.get("#export");
  const score = elements.get("#score");
  const report = elements.get("#report");
  const status = elements.get("#status");

  plan.value = "Delete all records in the workspace";
  scan.listeners.click();

  assert.equal(score.textContent, "25 / 100");
  assert.ok(report.children.length > 0);

  plan.value = "Write a harmless summary";
  plan.listeners.input();

  assert.equal(score.textContent, "— / 100");
  assert.equal(score.dataset.level, undefined);
  assert.match(status.textContent, /Previous results cleared/);
  assert.match(report.children[0].children[1].textContent, /No scan yet/);

  exportButton.listeners.click();
  assert.equal(status.textContent, "Run preflight before exporting a report.");
});
