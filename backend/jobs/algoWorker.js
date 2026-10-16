import { runAllBots } from '../services/algoEngine.js';
import { logger } from '../utils/logger.js';

let timer = null;
export function startAlgoWorker(intervalMs = 300e3) {
  if (timer) return;
  timer = setInterval(async () => {
    try { const n = await runAllBots(); if (n > 0) logger.info(`Algo tick: ${n} bot(s)`); }
    catch (e) { logger.warn(`Algo worker error: ${e.message}`); }
  }, intervalMs);
  timer.unref?.();
}
export function stopAlgoWorker() { if (timer) clearInterval(timer); timer = null; }
