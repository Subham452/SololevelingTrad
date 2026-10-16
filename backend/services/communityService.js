import crypto from 'crypto';
import mongoose from 'mongoose';
import { Conversation, ConversationMember, Message, Topic, InviteLink, JoinRequest, CommunityReport } from '../models/Community.js';
import User from '../models/User.js';

// ============================================================================
// Community service. Security model:
//  - Every permission check re-reads ConversationMember from the DB.
//  - Roles/permissions sent by the client are NEVER trusted.
//  - Private conversations leak nothing to non-members (403/404).
// ============================================================================

const { Types } = mongoose;

const err = (msg, status = 400, code) => { const e = new Error(msg); e.statusCode = status; if (code) e.code = code; return e; };
const oid = (id) => (Types.ObjectId.isValid(id) ? String(id) : null);
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');

// Public-safe user projection (never expose email/phone in lists/search).
const USER_FIELDS = 'firstName lastName username avatar role plan';

// --- Membership / permission helpers ---------------------------------------

export async function getMembership(conversationId, userId) {
  if (!oid(conversationId) || !oid(userId)) return null;
  return ConversationMember.findOne({ conversationId, userId }).lean();
}

export async function isMember(conversationId, userId) {
  const m = await getMembership(conversationId, userId);
  return !!(m && !m.banned);
}

// Effective permission resolution. Owner > admin > moderator > member, plus
// per-member granular overrides for admins/mods.
export function can(membership, perm) {
  if (!membership || membership.banned) return false;
  const { role, permissions = {} } = membership;
  if (role === 'owner') return true;
  if (role === 'admin') {
    if (permissions[perm] === false) return false;
    return true;
  }
  if (role === 'moderator') {
    if (permissions[perm] === true) return true;
    // moderators can delete messages and approve joins by default
    return perm === 'canDeleteMessages' || perm === 'canApproveJoins';
  }
  return false;
}

// Can this (non-banned) member post a message right now?
export function canSend(membership, conversation) {
  if (!membership || membership.banned) return false;
  const s = conversation.settings || {};
  if (conversation.archived || s.readOnly) return false;
  if (membership.restrictedUntil && membership.restrictedUntil > new Date()) return false;
  if (s.whoCanSend === 'admins') return ['owner', 'admin', 'moderator'].includes(membership.role);
  return true;
}

// --- Conversation access guard ---------------------------------------------

// Returns the conversation if the user may view it; throws otherwise.
// Public + discoverable conversations are viewable by anyone signed-in;
// everything else requires membership.
export async function assertCanView(conversationId, userId) {
  const conv = await Conversation.findOne({ _id: conversationId, deletedAt: null }).lean();
  if (!conv) throw err('Conversation not found', 404, 'NOT_FOUND');
  if (conv.type === 'direct') {
    if (!conv.directMembers.some((m) => String(m) === String(userId))) throw err('Not a participant', 403, 'FORBIDDEN');
    return conv;
  }
  const m = await getMembership(conversationId, userId);
  if (m && !m.banned) return conv;
  if (conv.isPublic && conv.discoverable) return conv; // public preview allowed
  throw err('Not a member', 403, 'FORBIDDEN');
}

// Stricter guard for actions (post/manage) — requires active membership.
export async function assertCanAct(conversationId, userId) {
  const conv = await Conversation.findOne({ _id: conversationId, deletedAt: null }).lean();
  if (!conv) throw err('Conversation not found', 404, 'NOT_FOUND');
  const m = await getMembership(conversationId, userId);
  if (!m) throw err('Not a member', 403, 'FORBIDDEN');
  if (m.banned) throw err('You are banned from this conversation', 403, 'BANNED');
  return { conv, membership: m };
}

// --- Create -----------------------------------------------------------------

// Create a group or channel conversation with the creator as owner.
export async function createConversation(userId, input) {
  const {
    type = 'group', name, description = '', bio = '', avatar, coverImage,
    isPublic = false, discoverable = true, joinPolicy = 'open', category, tags = [],
    language = 'en', isPremium = false, requiredPlan = null, settings = {},
  } = input;

  if (!['group', 'channel'].includes(type)) throw err('Type must be group or channel');
  if (!name || name.trim().length < 2) throw err('Name must be at least 2 characters');

  // Channels default to admin-only posting.
  const baseSettings = {
    whoCanSend: type === 'channel' ? 'admins' : 'everyone',
    whoCanSendMedia: type === 'channel' ? 'admins' : 'everyone',
  };

  const conv = await Conversation.create({
    type, name: name.trim(), description, bio, avatar, coverImage,
    ownerId: userId, isPublic, discoverable, joinPolicy, category,
    tags: tags.slice(0, 10), language, isPremium, requiredPlan,
    settings: { ...baseSettings, ...settings },
    memberCount: 1,
  });

  await ConversationMember.create({
    conversationId: conv._id, userId, role: 'owner',
    permissions: {
      canChangeInfo: true, canManageMembers: true, canDeleteMessages: true,
      canPinMessages: true, canInvite: true, canApproveJoins: true,
      canManageTopics: true, canManageInvites: true,
    },
  });

  return conv;
}

// Create (or reuse) a direct conversation between two users.
export async function createDirect(userId, otherUserId) {
  const a = oid(userId), b = oid(otherUserId);
  if (!a || !b || a === b) throw err('Invalid recipient');
  const other = await User.findById(b).select('_id status').lean();
  if (!other) throw err('Recipient not found', 404, 'NOT_FOUND');

  // Reuse existing DM if present (order-insensitive lookup).
  const existing = await Conversation.findOne({
    type: 'direct',
    directMembers: { $all: [a, b], $size: 2 },
    deletedAt: null,
  }).lean();
  if (existing) return existing;

  const conv = await Conversation.create({
    type: 'direct', name: null, ownerId: a, directMembers: [a, b], memberCount: 2, joinPolicy: 'invite',
  });
  await ConversationMember.insertMany([
    { conversationId: conv._id, userId: a, role: 'owner' },
    { conversationId: conv._id, userId: b, role: 'member' },
  ]);
  return conv;
}

// --- Listing / inbox --------------------------------------------------------

// Conversations the user belongs to, sorted by recent activity, with unread.
export async function listConversations(userId, { filter = 'all', limit = 50 } = {}) {
  const memberships = await ConversationMember.find({ userId, banned: false })
    .sort({ updatedAt: -1 }).limit(limit).lean();
  let ids = memberships.map((m) => m.conversationId);
  if (!ids.length) return [];

  let q = { _id: { $in: ids }, deletedAt: null };
  const convs = await Conversation.find(q).lean();
  const byId = Object.fromEntries(convs.map((c) => [String(c._id), c]));

  let rows = memberships
    .map((m) => ({ conv: byId[String(m.conversationId)], member: m }))
    .filter((r) => r.conv)
    .map(({ conv, member }) => ({
      _id: conv._id, type: conv.type, name: conv.name, avatar: conv.avatar,
      isPublic: conv.isPublic, category: conv.category, isOfficial: conv.isOfficial,
      lastMessageAt: conv.lastMessageAt, lastMessagePreview: conv.lastMessagePreview,
      memberCount: conv.memberCount, role: member.role,
      unreadCount: member.unreadCount || 0, muted: member.muted,
      notifyLevel: member.notifyLevel,
      // for DMs, surface the other participant
      directMembers: conv.type === 'direct' ? conv.directMembers : undefined,
    }))
    .sort((x, y) => (new Date(y.lastMessageAt || 0) - new Date(x.lastMessageAt || 0)));

  if (filter === 'unread') rows = rows.filter((r) => r.unreadCount > 0);
  else if (filter === 'groups') rows = rows.filter((r) => r.type === 'group');
  else if (filter === 'channels') rows = rows.filter((r) => r.type === 'channel');
  else if (filter === 'personal') rows = rows.filter((r) => r.type === 'direct');
  return rows;
}

// --- Messaging --------------------------------------------------------------

// Enforce slow mode: last message by this user must be older than the window.
async function enforceSlowMode(conversationId, userId, settings) {
  const win = settings?.slowModeSeconds || 0;
  if (!win) return;
  const last = await Message.findOne({ conversationId, senderId: userId, deletedAt: null })
    .sort({ createdAt: -1 }).select('createdAt').lean();
  if (last && (Date.now() - new Date(last.createdAt).getTime()) < win * 1000) {
    throw err(`Slow mode: wait ${win}s between messages`, 429, 'SLOW_MODE');
  }
}

async function extractMentions(content, memberUserIds) {
  // Matches @username tokens against current members.
  const out = [];
  if (!content) return out;
  const handles = [...String(content).matchAll(/@([a-zA-Z0-9_]{3,30})/g)].map((m) => m[1].toLowerCase());
  if (!handles.length) return out;
  const users = await User.find({ username: { $in: handles } }).select('_id username').lean();
  const byHandle = Object.fromEntries(users.map((u) => [u.username.toLowerCase(), String(u._id)]));
  for (const h of handles) { const id = byHandle[h]; if (id && memberUserIds.has(id) && !out.includes(id)) out.push(id); }
  return out;
}

function extractHashtags(content) {
  return [...new Set((String(content || '').match(/#[a-zA-Z0-9_]{2,40}/g) || []).map((t) => t.slice(1).toLowerCase()))].slice(0, 12);
}

function safeLinksAllowed(settings) { return settings?.linksAllowed !== false; }
function containsLink(text) { return /https?:\/\//i.test(text || ''); }

export async function sendMessage(conversationId, userId, input) {
  const { conv, membership } = await assertCanAct(conversationId, userId);
  if (!canSend(membership, conv)) throw err('You cannot send messages here', 403, 'CANNOT_SEND');

  const { content = '', type = 'text', attachments = [], replyTo, clientKey, tradeIdea } = input;

  if (!safeLinksAllowed(conv.settings) && containsLink(content)) throw err('Links are not allowed here', 403, 'LINKS_DISABLED');
  if (attachments?.length && conv.settings?.whoCanSendMedia === 'admins' && membership.role === 'member') {
    throw err('Only admins can send media here', 403, 'MEDIA_RESTRICTED');
  }

  const trimmed = String(content || '').trim();
  const hasAttach = attachments && attachments.length > 0;
  if (!trimmed && !hasAttach && !tradeIdea) throw err('Message cannot be empty');

  await enforceSlowMode(conversationId, userId, conv.settings);

  // Idempotency: same clientKey returns the existing message instead of duplicating.
  if (clientKey) {
    const existing = await Message.findOne({ conversationId, clientKey }).lean();
    if (existing) return existing;
  }

  // Resolve member ids for mention validation (only actual members can be mentioned).
  const memberDocs = await ConversationMember.find({ conversationId, banned: false }).select('userId').lean();
  const memberSet = new Set(memberDocs.map((m) => String(m.userId)));

  const mentions = await extractMentions(trimmed, memberSet);
  const hashtags = extractHashtags(trimmed);

  const msg = await Message.create({
    conversationId, userId, senderId: userId, type, content: trimmed.slice(0, 4000),
    attachments: (attachments || []).slice(0, 10), replyTo: replyTo || null,
    mentions, hashtags, tradeIdea: tradeIdea || undefined,
    clientKey: clientKey || null,
  });

  // Denormalize conversation + bump unread for others.
  const preview = trimmed ? trimmed.slice(0, 120) : (hasAttach ? `${attachments[0].kind} attachment` : 'Trade idea');
  await Conversation.updateOne({ _id: conversationId }, {
    $set: { lastMessage: msg._id, lastMessageAt: msg.createdAt, lastMessagePreview: preview },
    $inc: { messageCount: 1 },
  });
  const bump = { $inc: { unreadCount: 1 } };
  if (mentions.length) bump.$inc.unreadMentionCount = 1;
  await ConversationMember.updateMany(
    { conversationId, userId: { $ne: userId }, banned: false, muted: false }, bump,
  );

  return Message.findById(msg._id).lean();
}

// Cursor pagination: returns older messages before `before` (ISO) or newest page.
export async function listMessages(conversationId, userId, { before, limit = 50, topicId } = {}) {
  await assertCanView(conversationId, userId);
  const q = { conversationId };
  if (before) q.createdAt = { $lt: new Date(before) };
  if (topicId) q.topicId = topicId;
  q.hiddenFor = { $ne: userId }; // hide messages the caller deleted-for-me
  const items = await Message.find(q).sort({ createdAt: -1 }).limit(Math.min(Number(limit) || 50, 100)).lean();
  return items; // newest-first
}

export async function editMessage(userId, messageId, content) {
  const msg = await Message.findById(messageId).lean();
  if (!msg || msg.deletedAt) throw err('Message not found', 404, 'NOT_FOUND');
  const { membership } = await assertCanAct(msg.conversationId, userId);
  const isOwner = String(msg.senderId) === String(userId);
  if (!isOwner && !can(membership, 'canDeleteMessages')) throw err('Not allowed', 403, 'FORBIDDEN');
  if (msg.system?.kind) throw err('System messages cannot be edited', 400, 'IMMUTABLE');
  await Message.updateOne({ _id: messageId }, { $set: { content: String(content || '').trim().slice(0, 4000), editedAt: new Date() } });
  return Message.findById(messageId).lean();
}

// forMe=false (default) deletes for everyone (authorized users only);
// forMe=true hides it only for the caller (delete-for-me).
export async function deleteMessage(userId, messageId, { forMe = false } = {}) {
  const msg = await Message.findById(messageId).lean();
  if (!msg || msg.deletedAt) throw err('Message not found', 404, 'NOT_FOUND');
  const { membership } = await assertCanAct(msg.conversationId, userId);
  const isOwner = String(msg.senderId) === String(userId);
  if (forMe) {
    // delete-for-me: just record a tombstone for this user
    await Message.updateOne({ _id: messageId }, { $addToSet: { hiddenFor: userId } });
    return { ...msg, deleted: true };
  }
  if (!isOwner && !can(membership, 'canDeleteMessages')) throw err('Not allowed', 403, 'FORBIDDEN');
  await Message.updateOne({ _id: messageId }, { $set: { deletedAt: new Date(), deletedForEveryone: true, content: '', attachments: [], tradeIdea: undefined } });
  return Message.findById(messageId).lean();
}

// --- Reactions --------------------------------------------------------------

export async function reactToMessage(userId, messageId, emoji) {
  const msg = await Message.findById(messageId).lean();
  if (!msg || msg.deletedAt) throw err('Message not found', 404, 'NOT_FOUND');
  await assertCanAct(msg.conversationId, userId);
  const e = String(emoji || '').slice(0, 8);
  if (!e) throw err('Emoji required');
  // toggle: remove user's existing reaction to same emoji, else add
  const has = (msg.reactions || []).some((r) => String(r.user) === String(userId) && r.emoji === e);
  const update = has
    ? { $pull: { reactions: { user: userId, emoji: e } } }
    : { $addToSet: { reactions: { user: userId, emoji: e } } };
  await Message.updateOne({ _id: messageId }, update);
  return Message.findById(messageId).lean();
}

// --- Pin --------------------------------------------------------------------

export async function setPinned(userId, messageId, pinned) {
  const msg = await Message.findById(messageId).lean();
  if (!msg || msg.deletedAt) throw err('Message not found', 404, 'NOT_FOUND');
  const { membership, conv } = await assertCanAct(msg.conversationId, userId);
  const allowed = can(membership, 'canPinMessages') ||
    (membership.role === 'member' && conv.settings?.whoCanPin === 'everyone');
  if (!allowed) throw err('Not allowed to pin', 403, 'FORBIDDEN');
  await Message.updateOne(
    { _id: messageId },
    pinned ? { $set: { pinned: true, pinnedBy: userId, pinnedAt: new Date() } } : { $set: { pinned: false, pinnedBy: null, pinnedAt: null } },
  );
  return Message.findById(messageId).lean();
}

export async function listPinned(conversationId, userId) {
  await assertCanView(conversationId, userId);
  return Message.find({ conversationId, pinned: true, deletedAt: null }).sort({ pinnedAt: -1 }).limit(50).lean();
}

// --- Search -----------------------------------------------------------------

// Permission-aware message search within a conversation the user belongs to.
export async function searchMessages(conversationId, userId, { q, limit = 30 } = {}) {
  await assertCanView(conversationId, userId);
  const term = String(q || '').trim();
  if (term.length < 2) throw err('Search term too short');
  return Message.find({
    conversationId, deletedAt: null, type: 'text',
    content: { $regex: term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' },
  }).sort({ createdAt: -1 }).limit(Math.min(Number(limit) || 30, 50)).lean();
}

// --- Members / roles --------------------------------------------------------

export async function listMembers(conversationId, userId, { limit = 50, skip = 0, q } = {}) {
  await assertCanView(conversationId, userId);
  const filter = { conversationId };
  const members = await ConversationMember.find(filter)
    .populate('userId', USER_FIELDS)
    .sort({ role: 1, joinedAt: 1 }).skip(skip).limit(Math.min(Number(limit) || 50, 100)).lean();
  let rows = members;
  if (q) {
    const t = String(q).toLowerCase();
    rows = rows.filter((m) => {
      const u = m.userId || {};
      return [u.firstName, u.lastName, u.username, m.nickname].filter(Boolean)
        .some((s) => String(s).toLowerCase().includes(t));
    });
  }
  return rows;
}

// Role/permission change. Enforces hierarchy: only owner (or admins with
// canManageMembers) can act, and no one can exceed their own level.
export async function updateMember(conversationId, actorId, targetUserId, patch) {
  const { conv, membership: actor } = await assertCanAct(conversationId, actorId);
  if (!can(actor, 'canManageMembers')) throw err('Not allowed to manage members', 403, 'FORBIDDEN');

  const target = await ConversationMember.findOne({ conversationId, userId: targetUserId }).lean();
  if (!target) throw err('Target is not a member', 404, 'NOT_FOUND');

  const rank = { owner: 4, admin: 3, moderator: 2, member: 1 };
  if (String(target.userId) === String(conv.ownerId)) throw err('Cannot modify the owner', 403, 'FORBIDDEN');
  if (rank[target.role] >= rank[actor.role] && actor.role !== 'owner') {
    throw err('Insufficient role hierarchy', 403, 'HIERARCHY');
  }

  const set = {};
  if (patch.role && ['admin', 'moderator', 'member'].includes(patch.role)) {
    if (actor.role !== 'owner' && patch.role === 'admin') throw err('Only the owner can appoint admins', 403, 'FORBIDDEN');
    set.role = patch.role;
    // reset granular perms to role-appropriate defaults on promote/demote
    set.permissions = patch.role === 'admin'
      ? { canChangeInfo: true, canManageMembers: true, canDeleteMessages: true, canPinMessages: true, canInvite: true, canApproveJoins: true, canManageTopics: true, canManageInvites: true }
      : {};
  }
  if (patch.permissions && actor.role === 'owner') set.permissions = { ...(target.permissions || {}), ...patch.permissions };
  if (typeof patch.muted === 'boolean') set.muted = patch.muted;
  if (patch.restrictedUntil !== undefined) set.restrictedUntil = patch.restrictedUntil ? new Date(patch.restrictedUntil) : null;

  const updated = await ConversationMember.findOneAndUpdate(
    { conversationId, userId: targetUserId }, { $set: set }, { new: true },
  ).populate('userId', USER_FIELDS);
  return updated;
}

export async function removeMember(conversationId, actorId, targetUserId) {
  const { conv, membership: actor } = await assertCanAct(conversationId, actorId);
  const target = await ConversationMember.findOne({ conversationId, userId: targetUserId }).lean();
  if (!target) throw err('Target is not a member', 404, 'NOT_FOUND');
  const isSelf = String(targetUserId) === String(actorId);
  if (!isSelf) {
    if (!can(actor, 'canManageMembers')) throw err('Not allowed', 403, 'FORBIDDEN');
    if (String(targetUserId) === String(conv.ownerId)) throw err('Cannot remove the owner', 403, 'FORBIDDEN');
    const rank = { owner: 4, admin: 3, moderator: 2, member: 1 };
    if (rank[target.role] >= rank[actor.role] && actor.role !== 'owner') throw err('Insufficient role hierarchy', 403, 'HIERARCHY');
  } else if (String(targetUserId) === String(conv.ownerId)) {
    throw err('Owner cannot leave — transfer ownership first', 400, 'OWNER_LEAVE');
  }
  await ConversationMember.deleteOne({ conversationId, userId: targetUserId });
  await Conversation.updateOne({ _id: conversationId }, { $inc: { memberCount: -1 } });
  return { removed: true };
}

export async function banMember(conversationId, actorId, targetUserId, banned = true) {
  const { conv, membership: actor } = await assertCanAct(conversationId, actorId);
  if (!can(actor, 'canManageMembers')) throw err('Not allowed', 403, 'FORBIDDEN');
  if (String(targetUserId) === String(conv.ownerId)) throw err('Cannot ban the owner', 403, 'FORBIDDEN');
  const target = await ConversationMember.findOne({ conversationId, userId: targetUserId }).lean();
  if (!target) throw err('Target is not a member', 404, 'NOT_FOUND');
  const rank = { owner: 4, admin: 3, moderator: 2, member: 1 };
  if (rank[target.role] >= rank[actor.role] && actor.role !== 'owner') throw err('Insufficient role hierarchy', 403, 'HIERARCHY');
  await ConversationMember.updateOne({ conversationId, userId: targetUserId }, { $set: { banned } });
  return { banned };
}

// --- Join / leave / requests -----------------------------------------------

export async function joinConversation(userId, conversationId, { inviteToken } = {}) {
  const conv = await Conversation.findOne({ _id: conversationId, deletedAt: null }).lean();
  if (!conv) throw err('Conversation not found', 404, 'NOT_FOUND');
  if (conv.type === 'direct') throw err('Cannot join a direct conversation', 400, 'INVALID');

  const existing = await ConversationMember.findOne({ conversationId, userId }).lean();
  if (existing && !existing.banned) return { status: 'already_member', conversation: conv };
  if (existing?.banned) throw err('You are banned from this community', 403, 'BANNED');

  if (conv.joinPolicy === 'invite' && !inviteToken) {
    throw err('Invite required', 403, 'INVITE_REQUIRED');
  }
  if (conv.joinPolicy === 'approval' || conv.settings?.requireApprovalToJoin) {
    // create/refresh a pending request instead of joining immediately
    await JoinRequest.findOneAndUpdate(
      { conversationId, userId }, { $setOnInsert: { message: '' } }, { upsert: true },
    );
    return { status: 'pending_approval' };
  }

  await ConversationMember.create({ conversationId, userId, role: 'member', joinedAt: new Date() });
  await Conversation.updateOne({ _id: conversationId }, { $inc: { memberCount: 1 } });
  return { status: 'joined', conversation: conv };
}

export async function leaveConversation(userId, conversationId) {
  const conv = await Conversation.findOne({ _id: conversationId }).lean();
  if (!conv) throw err('Conversation not found', 404, 'NOT_FOUND');
  if (String(conv.ownerId) === String(userId)) throw err('Transfer ownership before leaving', 400, 'OWNER_LEAVE');
  const r = await ConversationMember.deleteOne({ conversationId, userId });
  if (r.deletedCount) await Conversation.updateOne({ _id: conversationId }, { $inc: { memberCount: -1 } });
  return { left: true };
}

// Join requests
export async function createJoinRequest(userId, conversationId, message = '') {
  const conv = await Conversation.findOne({ _id: conversationId, deletedAt: null }).lean();
  if (!conv) throw err('Conversation not found', 404, 'NOT_FOUND');
  const existingMember = await ConversationMember.findOne({ conversationId, userId }).lean();
  if (existingMember && !existingMember.banned) throw err('Already a member', 400, 'ALREADY_MEMBER');
  if (existingMember?.banned) throw err('You are banned', 403, 'BANNED');
  const doc = await JoinRequest.findOneAndUpdate(
    { conversationId, userId },
    { $set: { message: String(message || '').slice(0, 300), status: 'pending' } },
    { upsert: true, new: true },
  );
  return doc;
}

export async function listJoinRequests(conversationId, actorId) {
  const { membership } = await assertCanAct(conversationId, actorId);
  if (!can(membership, 'canApproveJoins')) throw err('Not allowed', 403, 'FORBIDDEN');
  return JoinRequest.find({ conversationId, status: 'pending' }).populate('userId', USER_FIELDS).sort({ createdAt: 1 }).lean();
}

export async function reviewJoinRequest(conversationId, actorId, requestId, approve) {
  const { membership } = await assertCanAct(conversationId, actorId);
  if (!can(membership, 'canApproveJoins')) throw err('Not allowed', 403, 'FORBIDDEN');
  const req = await JoinRequest.findOne({ _id: requestId, conversationId }).lean();
  if (!req) throw err('Request not found', 404, 'NOT_FOUND');
  if (req.status !== 'pending') throw err('Request already reviewed', 400, 'ALREADY_REVIEWED');
  await JoinRequest.updateOne(
    { _id: requestId }, { $set: { status: approve ? 'approved' : 'rejected', reviewedBy: actorId, reviewedAt: new Date() } },
  );
  if (approve) {
    await ConversationMember.updateOne(
      { conversationId, userId: req.userId }, { $setOnInsert: { role: 'member', joinedAt: new Date() } }, { upsert: true },
    );
    await Conversation.updateOne({ _id: conversationId }, { $inc: { memberCount: 1 } });
  }
  return { approved: !!approve };
}

// --- Invites ----------------------------------------------------------------

// Returns the plaintext token once (hashed at rest). Shareable link.
export async function createInvite(conversationId, actorId, { expiresHours, maxUses, requireApproval } = {}) {
  const { membership } = await assertCanAct(conversationId, actorId);
  if (!can(membership, 'canManageInvites') && !can(membership, 'canInvite')) throw err('Not allowed', 403, 'FORBIDDEN');
  const token = crypto.randomBytes(16).toString('hex');
  const doc = await InviteLink.create({
    conversationId, token: sha(token), createdBy: actorId,
    expiresAt: expiresHours ? new Date(Date.now() + expiresHours * 3600e3) : null,
    maxUses: maxUses || null, requireApproval: !!requireApproval,
  });
  return { token, invite: doc };
}

export async function listInvites(conversationId, actorId) {
  const { membership } = await assertCanAct(conversationId, actorId);
  if (!can(membership, 'canManageInvites')) throw err('Not allowed', 403, 'FORBIDDEN');
  return InviteLink.find({ conversationId, revokedAt: null }).sort({ createdAt: -1 }).lean();
}

export async function revokeInvite(conversationId, actorId, inviteId) {
  const { membership } = await assertCanAct(conversationId, actorId);
  if (!can(membership, 'canManageInvites')) throw err('Not allowed', 403, 'FORBIDDEN');
  await InviteLink.updateOne({ _id: inviteId, conversationId }, { $set: { revokedAt: new Date() } });
  return { revoked: true };
}

// Resolve a token -> conversation preview (public-safe).
export async function peekInvite(token) {
  const doc = await InviteLink.findOne({ token: sha(String(token || '')) }).lean();
  if (!doc) throw err('Invalid invite', 404, 'INVALID_INVITE');
  if (doc.revokedAt) throw err('Invite revoked', 410, 'INVITE_REVOKED');
  if (doc.expiresAt && doc.expiresAt < new Date()) throw err('Invite expired', 410, 'INVITE_EXPIRED');
  if (doc.maxUses && doc.uses >= doc.maxUses) throw err('Invite fully used', 410, 'INVITE_EXHAUSTED');
  const conv = await Conversation.findOne({ _id: doc.conversationId, deletedAt: null })
    .select('name description avatar type category memberCount isPublic').lean();
  if (!conv) throw err('Community unavailable', 404, 'NOT_FOUND');
  return { conversation: conv, requireApproval: doc.requireApproval };
}

export async function joinByInvite(userId, token) {
  const doc = await InviteLink.findOne({ token: sha(String(token || '')) }).lean();
  if (!doc) throw err('Invalid invite', 404, 'INVALID_INVITE');
  if (doc.revokedAt) throw err('Invite revoked', 410, 'INVITE_REVOKED');
  if (doc.expiresAt && doc.expiresAt < new Date()) throw err('Invite expired', 410, 'INVITE_EXPIRED');
  if (doc.maxUses && doc.uses >= doc.maxUses) throw err('Invite fully used', 410, 'INVITE_EXHAUSTED');

  const conv = await Conversation.findOne({ _id: doc.conversationId, deletedAt: null }).lean();
  if (!conv) throw err('Community unavailable', 404, 'NOT_FOUND');

  const existing = await ConversationMember.findOne({ conversationId: conv._id, userId }).lean();
  if (existing && !existing.banned) return { status: 'already_member', conversation: conv };
  if (existing?.banned) throw err('You are banned', 403, 'BANNED');

  if (doc.requireApproval) {
    await JoinRequest.findOneAndUpdate(
      { conversationId: conv._id, userId }, { $setOnInsert: { message: '' } }, { upsert: true },
    );
    return { status: 'pending_approval', conversation: conv };
  }

  await ConversationMember.create({ conversationId: conv._id, userId, role: 'member', invitedBy: doc.createdBy });
  await InviteLink.updateOne({ _id: doc._id }, { $inc: { uses: 1 } });
  await Conversation.updateOne({ _id: conv._id }, { $inc: { memberCount: 1 } });
  return { status: 'joined', conversation: conv };
}

// --- Discovery --------------------------------------------------------------

// Public discovery. Real member counts only; no fabricated trending scores.
export async function discover(userId, { q, category, limit = 20 } = {}) {
  const filter = { isPublic: true, discoverable: true, deletedAt: null, type: { $in: ['group', 'channel'] } };
  if (category) filter.category = category;
  if (q) filter.$text = { $search: String(q) };
  // exclude communities the user already left repeatedly? keep simple: include all public
  const convs = await Conversation.find(filter)
    .sort({ lastMessageAt: -1, memberCount: -1 })
    .limit(Math.min(Number(limit) || 20, 50))
    .select('name description avatar type category tags memberCount isOfficial isPremium lastMessageAt isPublic')
    .lean();
  return convs;
}

export async function categories() {
  return Conversation.distinct('category', { isPublic: true, discoverable: true, deletedAt: null });
}

// --- Group info / settings --------------------------------------------------

export async function updateConversation(conversationId, actorId, patch) {
  const { membership } = await assertCanAct(conversationId, actorId);
  if (!can(membership, 'canChangeInfo')) throw err('Not allowed to change info', 403, 'FORBIDDEN');
  const allowed = ['name', 'description', 'bio', 'avatar', 'coverImage', 'category', 'tags', 'language', 'discoverable', 'isPublic', 'settings'];
  const set = {};
  for (const k of allowed) if (patch[k] !== undefined) set[k] = patch[k];
  if (set.name && String(set.name).trim().length < 2) throw err('Name too short');
  if (set.tags) set.tags = set.tags.slice(0, 10);
  const conv = await Conversation.findOneAndUpdate(
    { _id: conversationId, deletedAt: null }, { $set: set }, { new: true },
  ).lean();
  return conv;
}

// Full public-safe profile for the group page.
export async function conversationProfile(conversationId, userId) {
  const conv = await Conversation.findOne({ _id: conversationId, deletedAt: null }).lean();
  if (!conv) throw err('Conversation not found', 404, 'NOT_FOUND');
  const membership = await getMembership(conversationId, userId);
  const isPrivateHidden = !(conv.isPublic && conv.discoverable) && !(membership && !membership.banned);
  if (isPrivateHidden) throw err('Not a member', 403, 'FORBIDDEN');

  const [admins, pinned] = await Promise.all([
    ConversationMember.find({ conversationId, role: { $in: ['owner', 'admin', 'moderator'] } })
      .populate('userId', USER_FIELDS).sort({ role: 1 }).limit(20).lean(),
    membership ? Message.find({ conversationId, pinned: true, deletedAt: null }).sort({ pinnedAt: -1 }).limit(10).lean() : [],
  ]);

  return {
    conversation: {
      _id: conv._id, type: conv.type, name: conv.name, description: conv.description, bio: conv.bio,
      avatar: conv.avatar, coverImage: conv.coverImage, category: conv.category, tags: conv.tags,
      isPublic: conv.isPublic, joinPolicy: conv.joinPolicy, isOfficial: conv.isOfficial,
      isPremium: conv.isPremium, memberCount: conv.memberCount, createdAt: conv.createdAt,
      settings: membership ? conv.settings : undefined, // settings only for members
    },
    admins,
    pinned,
    myRole: membership?.role || null,
    myPermissions: membership?.permissions || null,
    isMember: !!(membership && !membership.banned),
  };
}

// --- Read state -------------------------------------------------------------

export async function markRead(conversationId, userId, messageId) {
  const set = { lastReadAt: new Date() };
  if (messageId && oid(messageId)) set.lastReadMessageId = messageId;
  await ConversationMember.updateOne({ conversationId, userId }, { $set: { ...set, unreadCount: 0, unreadMentionCount: 0 } });
  return { read: true };
}

// --- Topics (forum mode) ----------------------------------------------------

export async function createTopic(conversationId, actorId, { name, description = '', icon = '', order = 0 }) {
  const { membership } = await assertCanAct(conversationId, actorId);
  if (!can(membership, 'canManageTopics')) throw err('Not allowed', 403, 'FORBIDDEN');
  return Topic.create({ conversationId, name: String(name).trim().slice(0, 60), description, icon, order, createdBy: actorId });
}

export async function listTopics(conversationId, userId) {
  await assertCanView(conversationId, userId);
  return Topic.find({ conversationId, archived: false }).sort({ order: 1, createdAt: 1 }).lean();
}

// --- Reports ----------------------------------------------------------------

export async function createReport(reporterId, { targetType, targetId, reason, details }) {
  if (!['user', 'message', 'conversation'].includes(targetType)) throw err('Invalid target type');
  const existing = await CommunityReport.findOne({ reporterId, targetType, targetId, status: 'open' }).lean();
  if (existing) throw err('You already have an open report for this', 400, 'DUPLICATE_REPORT');
  return CommunityReport.create({ reporterId, targetType, targetId, reason, details: String(details || '').slice(0, 1000) });
}

// --- User search (for DMs / mentions) --------------------------------------

export async function searchUsers(actorId, { q, limit = 10 } = {}) {
  const term = String(q || '').trim();
  if (term.length < 2) return [];
  const rx = new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  return User.find({
    _id: { $ne: actorId }, status: 'active',
    $or: [{ username: rx }, { firstName: rx }, { lastName: rx }],
  }).select(USER_FIELDS).limit(Math.min(Number(limit) || 10, 20)).lean();
}

export { USER_FIELDS };
