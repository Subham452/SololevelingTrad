import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import mongoSanitize from 'express-mongo-sanitize';
import compression from 'compression';
import env from './config/env.js';
import { connectDB, gracefulShutdown } from './config/database.js';
import { logger } from './utils/logger.js';
import routes from './routes/index.js';
import { notFound, errorHandler } from './middleware/errorMiddleware.js';
import { generalLimiter } from './middleware/rateLimitMiddleware.js';
import { requestContext } from './middleware/requestContext.js';
import http from 'http';
import { startJobs } from './jobs/cleanup.js';
import { initSocket } from './socket.js';
import groups from './routes/groupRoutes.js';
import algo from './routes/algoRoutes.js';
import community from './routes/communityRoutes.js';
import calls from './routes/callRoutes.js';
import rooms from './routes/roomRoutes.js';
import live from './routes/liveRoutes.js';
import { startAlgoWorker } from './jobs/algoWorker.js';

// ---------------------------------------------------------------------------
// Fail fast on insecure production configuration. Booting with the built-in
// dev JWT secrets in production would let anyone forge sessions.
// ---------------------------------------------------------------------------
function assertProductionConfig() {
  if (env.NODE_ENV !== 'production') return;
  const problems = [];
  if (!process.env.JWT_ACCESS_SECRET || env.JWT_ACCESS_SECRET === 'dev-access-secret') problems.push('JWT_ACCESS_SECRET');
  if (!process.env.JWT_REFRESH_SECRET || env.JWT_REFRESH_SECRET === 'dev-refresh-secret') problems.push('JWT_REFRESH_SECRET');
  if (!env.MONGODB_URI) problems.push('MONGODB_URI');
  if (problems.length) {
    logger.error(`Refusing to start: production requires secure values for ${problems.join(', ')}`);
    process.exit(1);
  }
}

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);

// Narrow CORS: only the configured frontend origin(s) may call the API with
// credentials. Requests with no Origin (server-to-server, webhooks, native
// tools) are allowed through and still subject to auth.
const allowedOrigins = new Set([env.CLIENT_URL, ...env.CORS_ORIGINS].filter(Boolean));
app.use(cors({
  origin(origin, cb) {
    if (!origin || allowedOrigins.has(origin)) return cb(null, true);
    return cb(Object.assign(new Error('Origin not allowed by CORS'), { statusCode: 403 }));
  },
  credentials: true,
}));
app.use(helmet());
app.use(compression({ threshold: 1024 })); // ~70% smaller JSON (45KB list -> ~12KB)
app.set('etag', true);
// Correlation id + privacy-safe access log (no bodies/queries/cookies logged).
app.use(requestContext);
app.use('/api/webhooks', express.raw({ type: '*/*', limit: '1mb' }));
app.use(express.json({ limit: '10kb' }));
app.use(cookieParser()); app.use(mongoSanitize());
app.use('/uploads', express.static('uploads'));
app.use('/api/', generalLimiter);
app.use('/api', routes);
app.use('/api/groups', groups);
app.use('/api/algo', algo);
app.use('/api/community', community);
app.use('/api/calls', calls);
app.use('/api/rooms', rooms);
app.use('/api/live', live);
app.use(notFound); app.use(errorHandler);
const port = env.PORT;
if (process.env.NODE_ENV !== 'test') {
  assertProductionConfig();
  if (env.MONGODB_URI) {
    connectDB()
      // Idempotent: creates the five launch plans only if their slug is
      // missing. Never duplicates and never overwrites admin price edits.
      .then(async () => {
        try {
          const { ensureSeedPlans } = await import('./services/planService.js');
          const { created, skipped } = await ensureSeedPlans();
          if (created) logger.info(`Pricing plans seeded: ${created} created, ${skipped} existing left untouched`);
        } catch (e) { logger.error('Plan seed failed: ' + e.message); }
      })
      .catch(e => logger.error('DB failed: ' + e.message));
  } else logger.warn('MONGODB_URI not set — running without DB');
  startJobs();
  try { const { startMarketWarmup } = await import('./jobs/marketWarmup.js'); startMarketWarmup(); } catch {}
  try { const { startAnnouncementScheduler } = await import('./jobs/announcementScheduler.js'); startAnnouncementScheduler(); } catch {}
  const server = http.createServer(app);
  const io = initSocket(server, env.CLIENT_URL);
  app.set('io', io);
  startAlgoWorker();
  server.listen(port, () => logger.info(`API on :${port}`));
  gracefulShutdown(server);
}
export default app;
