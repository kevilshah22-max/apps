import test from "node:test";
import assert from "node:assert/strict";
import { createSnapPersistence, readSnapsSafely, UnreadableSnapDataError } from "./storage.mjs";

const sample = { id: "snap-1", title: "Idea", body: "A useful thought", kind: "Idea", energy: "Medium energy", tags: ["work"], created: 1720000000000 };
function fakeStorage(initial = null) {
  return {
    value: initial, failWrites: false,
    async getItem() { return this.value; },
    async setItem(_key, value) { if (this.failWrites) throw new Error("disk full"); this.value = value; },
    async removeItem() { this.value = null; }
  };
}
test("missing saved data loads as an empty list", async () => assert.deepEqual(await readSnapsSafely(fakeStorage(), "snaps"), []));
test("valid saved snaps are returned unchanged", async () => assert.deepEqual(await readSnapsSafely(fakeStorage(JSON.stringify([sample])), "snaps"), [sample]));
test("malformed JSON is rejected without modifying storage", async () => {
  const storage = fakeStorage("{not json");
  await assert.rejects(readSnapsSafely(storage, "snaps"), UnreadableSnapDataError);
  assert.equal(storage.value, "{not json");
});
test("invalid structures are rejected rather than silently becoming an empty list", async () => {
  const storage = fakeStorage(JSON.stringify([{ id: "missing-required-fields" }]));
  await assert.rejects(readSnapsSafely(storage, "snaps"), UnreadableSnapDataError);
  assert.equal(JSON.parse(storage.value).length, 1);
});
test("concurrent changes are serialised and neither update is lost", async () => {
  const storage = fakeStorage(JSON.stringify([]));
  let current = [];
  const persist = createSnapPersistence({ storage, key: "snaps", getCurrent: () => current, onCommitted: (next) => { current = next; }, onError: () => {} });
  const makeSnap = (id) => ({ ...sample, id });
  await Promise.all([
    persist((items) => [...items, makeSnap("first")]),
    persist((items) => [...items, makeSnap("second")])
  ]);
  assert.deepEqual(current.map((item) => item.id), ["first", "second"]);
  assert.deepEqual(JSON.parse(storage.value).map((item) => item.id), ["first", "second"]);
});
test("failed writes do not publish in-memory state and the queue can recover", async () => {
  const storage = fakeStorage(JSON.stringify([]));
  let current = [];
  let errors = 0;
  const persist = createSnapPersistence({ storage, key: "snaps", getCurrent: () => current, onCommitted: (next) => { current = next; }, onError: () => { errors += 1; } });
  storage.failWrites = true;
  await assert.rejects(persist((items) => [...items, sample]), /disk full/);
  assert.deepEqual(current, []);
  assert.equal(errors, 1);
  storage.failWrites = false;
  await persist((items) => [...items, sample]);
  assert.deepEqual(current.map((item) => item.id), [sample.id]);
});
