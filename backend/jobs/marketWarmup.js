// Proactive warmup: refresh hot market keys so user polls hit L1/L2, never CoinGecko.
//
// Requests are issued SEQUENTIALLY with a gap between them. CoinGecko's free
// tier allows only a handful of calls per minute, and firing six at once (the
// previous behaviour) could spend the entire budget on the first run — leaving
// real users with 429s. We also back off entirely while the service reports an
// active rate-limit cooldown, and abort the run as soon as anything fails so a
// limited window is never made worse.
import { listCoins, marketOverview, coinDetail, cgRateLimited, cgRetryInMs } from '../services/marketService.js';
import { logger } from '../utils/logger.js';

const HOT = ['bitcoin', 'ethereum'];
const GAP_MS = 1500; // spacing between upstream calls within one warmup run

export function startMarketWarmup(intervalMs = 180e3) {
  let running = false;

  const run = async () => {
    if (running) return;
    if (cgRateLimited()) {
      // Respect the provider's window — the cache will keep serving what it has.
      logger.warn(`market warmup skipped: provider rate-limited, retry in ${Math.ceil(cgRetryInMs() / 1000)}s`);
      return;
    }
    running = true;
    try {
      const tasks = [
        () => listCoins({ page: 1, perPage: 100 }),
        () => marketOverview(),
        ...HOT.map((id) => () => coinDetail(id)),
      ];
      for (const task of tasks) {
        if (cgRateLimited()) break; // a call just hit the limit — stop here
        try {
          await task();
        } catch (e) {
          logger.warn('market warmup entry failed: ' + e.message);
          break; // do not burn the remaining budget on known-failing calls
        }
        await new Promise((r) => setTimeout(r, GAP_MS));
      }
    } finally {
      running = false;
    }
  };

  run();
  const t = setInterval(run, intervalMs);
  t.unref?.();
}
