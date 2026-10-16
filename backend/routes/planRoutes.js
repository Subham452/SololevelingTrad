import { Router } from 'express';
import * as c from '../controllers/planController.js';

// Public pricing catalogue — no auth required. Only *published* plans are
// ever returned, so draft/archived tiers are invisible to visitors.
const r = Router();
r.get('/', c.publicPlans);
r.get('/:slug', c.publicPlanBySlug);
export default r;
