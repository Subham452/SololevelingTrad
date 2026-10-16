// Real-browser verification of the admin Neon Glow contract.
//
// Loads the actual built stylesheet (dist/assets/*.css) into Chromium and
// asserts computed styles, so the ON/OFF guarantee is checked by a real CSS
// engine rather than by string matching:
//   ON  -> decorative shadows/filters are present
//   OFF -> those properties compute to `none` (nothing to override)
//   either way -> elements outside `.admin-shell` are never affected
//
// Run `npm run build` before this spec.
import { test, expect } from "@playwright/test";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const ASSETS = "dist/assets";

function builtCss() {
  if (!existsSync(ASSETS)) return null;
  const file = readdirSync(ASSETS).find((n) => n.endsWith(".css"));
  return file ? readFileSync(join(ASSETS, file), "utf8") : null;
}

const CSS = builtCss();
test.skip(!CSS, "No built CSS found — run `npm run build` first.");

const fixture = (glow) => `<!doctype html>
<html><head><meta charset="utf-8"><style>${CSS}</style></head>
<body style="background:#070a12">
  <div class="admin-shell" data-glow="${glow}" id="shell">
    <h1 class="glow-title" id="title">Executive overview</h1>
    <p class="glow-value" id="value">1,234,567</p>
    <div class="glow-card" id="card">revenue panel</div>
    <span class="glow-badge glow-badge-success" id="ok">paid</span>
    <span class="glow-badge glow-badge-danger" id="bad">failed</span>
    <span class="glow-icon" id="icon"><svg width="10" height="10"></svg></span>
    <div class="glow-ambient" id="ambient"><div class="glow-ambient__drift" id="drift"></div></div>
  </div>
  <!-- Outside the admin scope: trader dashboard / marketing must never glow. -->
  <div class="glow-card" id="outside-card">dashboard card</div>
  <h1 class="glow-title" id="outside-title">dashboard title</h1>
</body></html>`;

const style = (page, id, prop) =>
  page.$eval(`#${id}`, (el, p) => getComputedStyle(el)[p], prop);

async function load(page, glow) {
  await page.setContent(fixture(glow), { waitUntil: "load" });
}

for (const glow of ["on", "off"]) {
  test.describe(`data-glow="${glow}"`, () => {
    test(`shadow state is correct when glow is ${glow}`, async ({ page }) => {
      await load(page, glow);
      const on = glow === "on";

      // Page title + KPI value: text glow only when ON.
      expect(await style(page, "title", "textShadow")).toEqual(on ? expect.not.stringMatching(/^none$/) : "none");
      expect(await style(page, "value", "textShadow")).toEqual(on ? expect.not.stringMatching(/^none$/) : "none");

      // Surfaces: card glow only when ON.
      expect(await style(page, "card", "boxShadow")).toEqual(on ? expect.not.stringMatching(/^none$/) : "none");

      // Status badges: tone-appropriate glow only when ON.
      expect(await style(page, "ok", "boxShadow")).toEqual(on ? expect.not.stringMatching(/^none$/) : "none");
      expect(await style(page, "bad", "boxShadow")).toEqual(on ? expect.not.stringMatching(/^none$/) : "none");

      // Icons: drop-shadow filter only when ON.
      expect(await style(page, "icon", "filter")).toEqual(on ? expect.not.stringMatching(/^none$/) : "none");

      // Ambient wash: transparent when OFF, visible when ON.
      expect(await style(page, "ambient", "opacity")).toBe(on ? "1" : "0");
    });

    test(`elements outside .admin-shell never glow when glow is ${glow}`, async ({ page }) => {
      await load(page, glow);
      // Same classes as the admin panel, but rendered outside the shell.
      expect(await style(page, "outside-card", "boxShadow")).toBe("none");
      expect(await style(page, "outside-title", "textShadow")).toBe("none");
    });
  });
}

test("ON keeps positive/negative money colours independent of the glow", async ({ page }) => {
  await load(page, "on");
  // The glow layer must not recolour financial values.
  const color = await style(page, "value", "color");
  expect(color).toBe("rgb(255, 255, 255)");
});

test("reduced-motion collapses the glow transitions", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await load(page, "on");
  const duration = await style(page, "card", "transitionDuration");
  const seconds = Math.max(...duration.split(",").map((d) => parseFloat(d)));
  expect(seconds).toBeLessThan(0.01);
});

test("the ambient drift layer is only promoted to its own GPU layer when ON", async ({ page }) => {
  await load(page, "on");
  expect(await style(page, "drift", "willChange")).toContain("transform");
  await load(page, "off");
  expect(await style(page, "drift", "willChange")).toBe("auto");
});
