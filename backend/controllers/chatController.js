import ChatSession from '../models/ChatSession.js';
import ChatMessage from '../models/ChatMessage.js';
import Usage from '../models/Usage.js';
import User from '../models/User.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ok } from '../utils/apiResponse.js';
import { checkUsageLimit } from '../config/plans.js';
export const listSessions = asyncHandler(async (req, res) => { const items = await ChatSession.find({ userId: req.user.sub }).sort({ updatedAt: -1 }).limit(50); return ok(res, 'OK', { items }); });
export const createSession = asyncHandler(async (req, res) => { const s = await ChatSession.create({ userId: req.user.sub, title: req.body.title || 'New chat' }); return ok(res, 'Created', { session: s }, 201); });
export const getSession = asyncHandler(async (req, res) => {
  const s = await ChatSession.findOne({ _id: req.params.id, userId: req.user.sub }); if (!s) return res.status(404).json({ success: false, message: 'Not found' });
  const messages = await ChatMessage.find({ sessionId: s._id }).sort({ createdAt: 1 }).limit(200);
  return ok(res, 'OK', { session: s, messages });
});
export const sendMessage = asyncHandler(async (req, res) => {
  const s = await ChatSession.findOne({ _id: req.params.id, userId: req.user.sub }); if (!s) return res.status(404).json({ success: false, message: 'Not found' });
  const user = await User.findById(req.user.sub);
  const period = new Date().toISOString().slice(0, 7);
  let usage = await Usage.findOne({ userId: req.user.sub });
  if (!usage || usage.period !== period) { usage = await Usage.findOneAndUpdate({ userId: req.user.sub }, { period, aiCalls: 0 }, { upsert: true, new: true }); }
  const check = checkUsageLimit(user.plan || 'FREE', usage.aiCalls);
  if (!check.allowed) return res.status(429).json({ success: false, message: 'AI usage limit reached for your plan' });
  await ChatMessage.create({ sessionId: s._id, userId: req.user.sub, role: 'user', content: req.body.content });
  const reply = `Echo (${user.plan}): ${req.body.content}`;
  const m = await ChatMessage.create({ sessionId: s._id, userId: req.user.sub, role: 'assistant', content: reply });
  usage.aiCalls += 1; await usage.save();
  return ok(res, 'OK', { message: m, usage: { used: usage.aiCalls, limit: check.limit } }, 201);
});
