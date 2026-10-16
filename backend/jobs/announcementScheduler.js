import Announcement from '../models/Announcement.js';
import { logger } from '../utils/logger.js';
// Server-side scheduler: flip due scheduled → published, expire stale published.
// Runs in-process every 60s; idempotent conditional updates prevent double-fire.
export function startAnnouncementScheduler(intervalMs = 60e3) {
  const tick = async () => {
    const now = new Date();
    try {
      const pub = await Announcement.updateMany({ status: 'scheduled', publishAt: { $lte: now } }, { $set: { status: 'published' } });
      const exp = await Announcement.updateMany({ status: 'published', expiresAt: { $lte: now } }, { $set: { status: 'withdrawn' } });
      if (pub.modifiedCount || exp.modifiedCount) logger.info(`announcements: +${pub.modifiedCount} published, -${exp.modifiedCount} expired`);
    } catch (e) { logger.warn('announcement scheduler: ' + e.message); }
  };
  tick();
  const t = setInterval(tick, intervalMs);
  t.unref?.();
}
