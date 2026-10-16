// Permanent tests for the admin "Neon Glow" preference store.
//
// Runs on plain node:test with stubbed browser globals — no test framework or
// DOM library required. Each case re-imports the module with a cache-busting
// query so it gets a genuinely fresh instance (simulating a page reload).
import test from "node:test";
import assert from "node:assert/strict";

const KEY = "slt_admin_glow";
const store = new Map();

globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
  clear: () => store.clear(),
};
globalThis.window = { addEventListener() {}, removeEventListener() {} };

let n = 0;
const fresh = () => import(`../src/lib/glow.js?case=${++n}`);

test("defaults to ON when the preference was never set", async () => {
  store.clear();
  const glow = await fresh();
  assert.equal(glow.getGlow(), true);
});

test("setGlow(false) updates state and persists the literal '0'", async () => {
  store.clear();
  const glow = await fresh();
  glow.setGlow(false);
  assert.equal(glow.getGlow(), false);
  assert.equal(store.get(KEY), "0");
});

test("toggleGlow() flips from the ON default and persists '0' then '1'", async () => {
  store.clear();
  const glow = await fresh();
  // Default is ON, so the first toggle turns the effect OFF.
  glow.toggleGlow();
  assert.equal(glow.getGlow(), false);
  assert.equal(store.get(KEY), "0");
  glow.toggleGlow();
  assert.equal(glow.getGlow(), true);
  assert.equal(store.get(KEY), "1");
});

test("getGlow() returns a real boolean (stable for useSyncExternalStore)", async () => {
  store.clear();
  const glow = await fresh();
  assert.equal(typeof glow.getGlow(), "boolean");
  // Repeated reads must be referentially stable (===), not just equal.
  assert.ok(glow.getGlow() === glow.getGlow());
});

test("persists only the single admin-scoped key — no sensitive data", async () => {
  store.clear();
  const glow = await fresh();
  glow.setGlow(false);
  glow.setGlow(true);
  assert.deepEqual([...store.keys()], [KEY]);
  assert.ok(["0", "1"].includes(store.get(KEY)));
});

test("a fresh load reads the persisted value (survives refresh)", async () => {
  store.set(KEY, "0");
  const off = await fresh();
  assert.equal(off.getGlow(), false);

  store.set(KEY, "1");
  const on = await fresh();
  assert.equal(on.getGlow(), true);
});

test("tolerates unavailable localStorage (private mode) without throwing", async () => {
  const saved = globalThis.localStorage;
  delete globalThis.localStorage;
  try {
    const glow = await fresh();
    assert.equal(glow.getGlow(), true, "falls back to the ON default");
    assert.doesNotThrow(() => glow.setGlow(false));
    assert.equal(glow.getGlow(), false, "the choice is held for this session");
    assert.doesNotThrow(() => glow.toggleGlow());
    assert.equal(glow.getGlow(), true, "toggling still works without storage");
  } finally {
    globalThis.localStorage = saved;
  }
});
