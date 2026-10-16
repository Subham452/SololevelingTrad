// Permanent invariant tests for the admin Neon Glow stylesheet.
//
// These encode the two guarantees that make the ON/OFF toggle trustworthy:
//   1. OFF is clean by construction — every decorative declaration is gated
//      behind `.admin-shell[data-glow="on"]`, so disabling the effect needs no
//      overrides and cannot leave stray shadows behind.
//   2. The trader dashboard is unaffected — every glow rule is scoped to
//      `.admin-shell`, which only AdminLayout applies.
// Plus a typo guard so a class used in JSX can never silently miss its CSS.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const raw = readFileSync("src/index.css", "utf8");
// Comments are stripped before parsing so selectors never pick up comment
// text. The section anchor is located in the raw source first, since the
// marker itself lives inside a comment.
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "");
const MARKER = "ADMIN CONTROL CENTER";
const markerAt = raw.indexOf(MARKER);
const css = stripComments(raw);
const section = stripComments(raw.slice(markerAt));
const DECOR = /(box-shadow|text-shadow|drop-shadow)\s*:/;

/** Tokenise CSS into { selector, decls } for every block (nesting-aware). */
function blocks(source) {
  const out = [];
  const stack = [];
  let buf = "";
  for (const ch of source) {
    if (ch === "{") { stack.push(buf.replace(/\s+/g, " ").trim()); buf = ""; }
    else if (ch === "}") {
      const decls = buf.trim();
      if (decls) out.push({ selector: stack.join(" ").replace(/\s+/g, " ").trim(), decls });
      stack.pop();
      buf = "";
    } else buf += ch;
  }
  return out;
}

const all = blocks(css);
const glowSection = blocks(section);
const GLOW_CLASS = /\bglow-[a-z0-9-]+|\bnav-glow\b/;

test("the glow section exists", () => {
  assert.ok(markerAt !== -1, "glow section marker missing from src/index.css");
  assert.ok(glowSection.length > 0, "no CSS blocks found after the glow marker");
});

test("every decorative declaration is gated behind [data-glow=\"on\"]", () => {
  const decorative = glowSection.filter((b) => DECOR.test(b.decls));
  assert.ok(decorative.length > 0, "no decorative declarations found — parser or CSS broke");
  const ungated = decorative.filter((b) => !b.selector.includes('[data-glow="on"]'));
  assert.deepEqual(ungated, [], `ungated decorative rules would leak into the OFF state: ${ungated.map((b) => b.selector).join(", ")}`);
});

test("there is no [data-glow=\"off\"] override block (OFF needs no overrides)", () => {
  assert.equal(glowSection.filter((b) => b.selector.includes('[data-glow="off"]')).length, 0);
  assert.ok(!section.includes('[data-glow="off"]'));
});

test("every glow rule is scoped to .admin-shell (dashboard isolation)", () => {
  const offenders = all.filter((b) => GLOW_CLASS.test(b.selector) && !b.selector.includes(".admin-shell"));
  assert.deepEqual(offenders, [], `unscoped glow rules: ${offenders.map((b) => b.selector).join(", ")}`);
});

test("every JSX glow class has a matching CSS rule (typo guard)", () => {
  const files = [];
  (function walk(dir) {
    for (const entry of readdirSync(dir)) {
      const p = join(dir, entry);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.(jsx?|tsx?)$/.test(p)) files.push(p);
    }
  })("src");

  const used = new Set();
  for (const f of files) {
    for (const m of readFileSync(f, "utf8").matchAll(/glow-[a-z0-9-]+|\bnav-glow\b/g)) {
      // `glow-btn-${variant}` / `glow-badge-${tone}` appear as a truncated stem.
      used.add(m[0].replace(/-$/, ""));
    }
  }
  assert.ok(used.size > 0, "no glow classes found in src — expected some");
  const missing = [...used].filter((c) => !css.includes(c));
  assert.deepEqual(missing, [], `glow classes used in JSX but absent from CSS: ${missing.join(", ")}`);
});

test("the ambient layer is hidden by default and revealed only when ON", () => {
  const base = all.find((b) => b.selector === ".admin-shell .glow-ambient");
  assert.ok(base, "missing .admin-shell .glow-ambient base rule");
  assert.match(base.decls, /opacity:\s*0\b/, "ambient base must be transparent");

  const on = all.find((b) => b.selector.includes('.glow-ambient') && b.selector.includes('[data-glow="on"]') && !b.selector.includes("__drift"));
  assert.ok(on, "missing ON-state ambient rule");
  assert.match(on.decls, /opacity:\s*1\b/, "ambient must be visible when ON");
});

test("decorative motion is neutered for reduced-motion users", () => {
  assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)/, "global reduced-motion block missing");
});

test("AdminLayout actually applies the shell class and data-glow attribute", () => {
  const layout = readFileSync("src/layouts/AdminLayout.jsx", "utf8");
  assert.match(layout, /admin-shell/, "AdminLayout does not apply .admin-shell");
  assert.match(layout, /data-glow=\{/, "AdminLayout does not set data-glow");
  assert.match(layout, /useAdminGlow/, "AdminLayout does not read the glow preference");
});

test(".admin-shell is applied by AdminLayout alone (not by other layouts)", () => {
  const others = ["src/layouts/DashboardLayout.jsx", "src/layouts/MarketingLayout.jsx"];
  for (const f of others) {
    assert.ok(!readFileSync(f, "utf8").includes("admin-shell"), `${f} must not opt into the admin glow scope`);
  }
});
