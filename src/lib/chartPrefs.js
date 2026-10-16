import { api, getAccessToken } from "./api.js";

// Persists chart UI settings (range / mode / indicators / grid) to the user's
// `preferences` doc in MongoDB. Only meaningful for signed-in users; the caller
// should no-op when there's no access token so we never trigger auth side
// effects (like a logout dispatch) on public pages.

const DEFAULTS = { chartRange: "1M", chartMode: "candle", chartIndicators: [], chartShowGrid: true };

export const CHART_PREF_DEFAULTS = DEFAULTS;

export async function loadChartPrefs() {
  if (!getAccessToken()) return null; // not signed in — use defaults, don't hit API
  try {
    const { user } = await api.get("/users/me");
    const p = user?.preferences || {};
    return {
      chartRange: p.chartRange || DEFAULTS.chartRange,
      chartMode: p.chartMode || DEFAULTS.chartMode,
      chartIndicators: Array.isArray(p.chartIndicators) ? p.chartIndicators : [],
      chartShowGrid: typeof p.chartShowGrid === "boolean" ? p.chartShowGrid : DEFAULTS.chartShowGrid,
    };
  } catch {
    return null; // silent — settings just won't persist this session
  }
}

// Debounced save: coalesce rapid changes (e.g. toggling indicators) into one write.
let _timer = null;
let _pending = null;
export function saveChartPrefs(partial) {
  if (!getAccessToken()) return;
  _pending = { ..._pending, ...partial };
  clearTimeout(_timer);
  _timer = setTimeout(() => {
    const body = { preferences: _pending };
    _pending = null;
    api.patch("/users/me/preferences", body).catch(() => {});
  }, 600);
}
