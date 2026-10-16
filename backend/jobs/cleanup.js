import { logger } from '../utils/logger.js';
import { expireDueSubscriptions } from '../services/subscriptionService.js';
export function startJobs() {
  setInterval(async () => { try { const r = await expireDueSubscriptions(); logger.info(`expire job: ${r.modifiedCount}`); } catch (e) { logger.error(e.message); } }, 60 * 60e3);
}
