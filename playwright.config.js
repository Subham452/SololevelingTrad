import { defineConfig, devices } from "@playwright/test";

/**
 * Browser-level verification for the admin Neon Glow layer.
 *
 * These tests do not need a server, a database or an authenticated session:
 * they load the REAL built stylesheet into a browser and assert computed
 * styles, which is what actually implements the ON/OFF behaviour. Run
 * `npm run build` first (the spec skips itself with a clear message if the
 * built CSS is missing).
 */
export default defineConfig({
  testDir: "tests/browser",
  fullyParallel: true,
  reporter: [["list"]],
  use: {
    ...devices["Desktop Chrome"],
    headless: true,
  },
});
