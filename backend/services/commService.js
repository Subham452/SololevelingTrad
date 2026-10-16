import crypto from 'crypto';
import mongoose from 'mongoose';
import env from '../config/env.js';
import { Call, MeetingRoom, RoomMembership, RoomInvitation, RoomJoinRequest, LiveSession, LiveParticipant, LiveChatMessage, ModerationAction } from '../models/Comms.js';
import { Conversation, ConversationMember } from '../models/Community.js';
import User from '../models/User.js';
import { PERMS, isConfigured } from './videoSdkService.js';

// ============================================================================
// Communications service (calls / rooms / live). Security model:
//  - Identity always comes from the verified JWT (userId params are ignored).
//  - Roles (host/cohost/moderator) are re-read from the DB — never trusted
//    from the client.
//  - A provider (VideoSDK) token is only minted after app-level authorization.
// ============================================================================

const { Types } = mongoose;
const err = (msg, status = 400, code) => { const e = new Error(msg); e.statusCode = status; if (code) e.code = code; return e; };
const oid = (id) => Types.ObjectId.isValid(id);
const sha = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');
const USER_FIELDS = 'firstName lastName username avatar plan role';

// ---------------------------------------------------------------------------
// Helper: is this user a participant of a direct/group conversation?
// ---------------------------------------------------------------------------
async function assertConversationAccess(conversationId, userId) {
  if (!oid(conversationId)) throw err('Invalid conversation', 400, 'INVALID');
  const conv = await Conversation.findOne({ _id: conversationId, deletedAt: null }).lean();
  if (!conv) throw err('Conversation not found', 404, 'NOT_FOUND');
  if (conv.type === 'direct') {
    if (!conv.directMembers.some((m) => String(m) === String(userId))) throw err('Not a participant', 403, 'FORBIDDEN');
    return conv;
  }
  const m = await ConversationMember.findOne({ conversationId, userId }).lean();
  if (!m || m.banned) throw err('Not a member of this conversation', 403, 'FORBIDDEN');
  return conv;
}

// ===========================================================================
// CALLS (1:1 audio/video + group)
// ===========================================================================

// Start a 1:1 call in a direct conversation. Creates a ringing Call record and
// returns the provider room id + a token for the initiator.
export async function createCall(userId, { conversationId, type = 'video' }) {
  const conv = await assertConversationAccess(conversationId, userId);
  if (conv.type !== 'direct') throw err('Start calls from a direct conversation or use a room', 400, 'INVALID');
  const other = conv.directMembers.find((m) => String(m) !== String(userId));
  if (!other) throw err('No recipient', 400, 'INVALID');

  // Prevent duplicate ringing calls between the same pair.
  const existing = await Call.findOne({
    conversationId, status: 'ringing',
    $or: [{ initiatorId: userId }, { initiatorId: other }],
  }).lean();
  if (existing) throw err('A call is already in progress', 409, 'CALL_EXISTS');

  // Provider room is created lazily at accept time to avoid orphan rooms for
  // missed/rejected calls. We store status=ringing first.
  const call = await Call.create({
    type, conversationId, initiatorId: userId, participantIds: [userId, other], status: 'ringing',
  });
  return call;
}

// Resolve a call and assert the user is a party to it.
async function getCallForUser(callId, userId) {
  if (!oid(callId)) throw err('Invalid call', 400, 'INVALID');
  const call = await Call.findById(callId).lean();
  if (!call) throw err('Call not found', 404, 'NOT_FOUND');
  if (!call.participantIds.some((p) => String(p) === String(userId))) throw err('Not a participant of this call', 403, 'FORBIDDEN');
  return call;
}

// Accept: mark accepted + mint a VideoSDK token scoped to this call's room.
export async function acceptCall(userId, callId) {
  const call = await getCallForUser(callId, userId);
  if (call.status !== 'ringing') throw err('Call is no longer ringing', 409, 'INVALID_STATE');
  if (String(call.initiatorId) === String(userId)) throw err('Initiator cannot accept', 400, 'INVALID');

  // Lazily create a provider room for the accepted call.
  const { createRoom } = await import('./videoSdkService.js');
  let providerRoomId = call.providerRoomId;
  if (!providerRoomId) {
    const room = await createRoom({ customRoomId: `call-${String(call._id)}` });
    providerRoomId = room.roomId;
  }
  const updated = await Call.findOneAndUpdate(
    { _id: callId, status: 'ringing' },
    { $set: { status: 'accepted', acceptedAt: new Date(), providerRoomId } },
    { new: true },
  ).lean();
  if (!updated) throw err('Call state changed', 409, 'INVALID_STATE');
  return updated;
}

export async function rejectCall(userId, callId) {
  const call = await getCallForUser(callId, userId);
  if (call.status !== 'ringing') throw err('Call is no longer ringing', 409, 'INVALID_STATE');
  if (String(call.initiatorId) === String(userId)) throw err('Use cancel for your own outgoing call', 400, 'INVALID');
  return Call.findOneAndUpdate(
    { _id: callId, status: 'ringing' },
    { $set: { status: 'rejected', endReason: 'declined', endedAt: new Date() } },
    { new: true },
  ).lean();
}

export async function cancelCall(userId, callId) {
  const call = await getCallForUser(callId, userId);
  if (String(call.initiatorId) !== String(userId)) throw err('Only the initiator can cancel', 403, 'FORBIDDEN');
  if (call.status !== 'ringing') throw err('Call is no longer ringing', 409, 'INVALID_STATE');
  // A cancelled outgoing call shows as missed to the recipient.
  return Call.findOneAndUpdate(
    { _id: callId, status: 'ringing' },
    { $set: { status: 'missed', endReason: 'cancelled', endedAt: new Date() } },
    { new: true },
  ).lean();
}

export async function endCall(userId, callId) {
  const call = await getCallForUser(callId, userId);
  if (!['accepted', 'ringing'].includes(call.status)) throw err('Call already ended', 409, 'INVALID_STATE');
  const endedAt = new Date();
  const duration = call.acceptedAt ? Math.max(0, Math.round((endedAt - new Date(call.acceptedAt)) / 1000)) : 0;
  const status = call.status === 'ringing' ? (String(call.initiatorId) === String(userId) ? 'missed' : 'rejected') : 'ended';
  return Call.findOneAndUpdate(
    { _id: callId },
    { $set: { status, endReason: 'hangup', endedAt, durationSeconds: duration } },
    { new: true },
  ).lean();
}

// Mint a scoped provider token for an accepted call (after authorization).
export async function callToken(userId, callId) {
  const call = await getCallForUser(callId, userId);
  if (call.status !== 'accepted') throw err('Call is not active', 409, 'INVALID_STATE');
  if (!call.providerRoomId) throw err('Call has no active room', 409, 'INVALID_STATE');
  const { generateToken } = await import('./videoSdkService.js');
  const token = generateToken({ permissions: PERMS.participant, roomId: call.providerRoomId, participantId: userId });
  return { token, roomId: call.providerRoomId, participantId: String(userId) };
}

export async function callHistory(userId, { limit = 30 } = {}) {
  const calls = await Call.find({ participantIds: userId })
    .sort({ createdAt: -1 }).limit(Math.min(Number(limit) || 30, 100)).lean();
  // enrich counterpart
  const ids = [...new Set(calls.flatMap((c) => c.participantIds.map(String)))].filter((id) => id !== String(userId));
  const users = await User.find({ _id: { $in: ids } }).select(USER_FIELDS).lean();
  const byId = Object.fromEntries(users.map((u) => [String(u._id), u]));
  return calls.map((c) => ({
    ...c,
    counterpart: byId[String(c.participantIds.find((p) => String(p) !== String(userId)))] || null,
  }));
}

export async function getCall(userId, callId) {
  return getCallForUser(callId, userId);
}

// ===========================================================================
// ROOMS (meetings)
// ===========================================================================

function hashPw(pw) { return sha(`${pw}:${env.JWT_ACCESS_SECRET}`); }

export async function createRoom(userId, input) {
  const {
    name, description = '', coverImage, roomType = 'meeting', access = 'invite',
    scheduledStartAt, scheduledEndAt, capacity = 20, waitingRoom = false,
    requireApproval = false, password, permissions = {}, cohostIds = [], conversationId,
  } = input;
  if (!name || name.trim().length < 2) throw err('Name must be at least 2 characters');
  if (capacity > env.VIDEOSDK_MAX_PARTICIPANTS) throw err(`Capacity cannot exceed ${env.VIDEOSDK_MAX_PARTICIPANTS}`, 422, 'CAPACITY');

  // If linked to a conversation, the creator must be a member of it.
  if (conversationId) await assertConversationAccess(conversationId, userId);

  const room = await MeetingRoom.create({
    ownerId: userId, name: name.trim(), description, coverImage, roomType, access,
    scheduledStartAt: scheduledStartAt ? new Date(scheduledStartAt) : null,
    scheduledEndAt: scheduledEndAt ? new Date(scheduledEndAt) : null,
    status: scheduledStartAt ? 'scheduled' : 'waiting',
    capacity, waitingRoom, requireApproval,
    passwordHash: password ? hashPw(password) : null,
    permissions: {
      allowScreenShare: permissions.allowScreenShare !== false,
      allowCam: permissions.allowCam !== false,
      joinMuted: permissions.joinMuted !== false,
      allowChat: permissions.allowChat !== false,
      allowRecording: !!permissions.allowRecording,
      allowInvite: !!permissions.allowInvite,
    },
    cohostIds: cohostIds.slice(0, 10),
    conversationId: conversationId || null,
    memberCount: 1,
  });
  await RoomMembership.create({ roomId: room._id, userId, role: 'host' });
  return room;
}

async function getRoomForView(roomId, userId) {
  if (!oid(roomId)) throw err('Invalid room', 400, 'INVALID');
  const room = await MeetingRoom.findById(roomId).lean();
  if (!room || room.status === 'archived') throw err('Room not found', 404, 'NOT_FOUND');
  const membership = await RoomMembership.findOne({ roomId, userId }).lean();
  const isOwner = String(room.ownerId) === String(userId);
  const isStaff = isOwner || !!room.cohostIds?.some((c) => String(c) === String(userId)) || !!room.moderatorIds?.some((m) => String(m) === String(userId));
  const isMember = !!membership || isStaff;
  // Access control: private/invite rooms are member/invite-only.
  if (!isMember) {
    if (room.access === 'private') throw err('This room is private', 403, 'FORBIDDEN');
    // discoverable rooms are viewable (but join may still be gated)
  }
  return { room, membership, isOwner, isStaff, isMember };
}

// Public view used by GET /rooms/:roomId (safe fields + caller's capabilities).
export async function roomView(roomId, userId) {
  const { room, isOwner, isStaff, isMember } = await getRoomForView(roomId, userId);
  const activeCount = await RoomMembership.countDocuments({ roomId, leftAt: null, joinedAt: { $ne: null } });
  return {
    room: { ...room, passwordHash: undefined },
    isOwner, isStaff, isMember, activeCount,
    myRole: isOwner ? 'host' : (isStaff ? 'cohost' : (isMember ? 'participant' : null)),
  };
}

// Authorization for actually joining media. Returns a provider token.
export async function joinRoom(userId, roomId, { password } = {}) {
  const { room, membership, isOwner, isStaff, isMember } = await getRoomForView(roomId, userId);
  if (room.status === 'ended' || room.status === 'cancelled') throw err('This room has ended', 410, 'ROOM_ENDED');

  // Password-protected rooms.
  if (room.passwordHash && !isStaff) {
    if (!password || hashPw(password) !== room.passwordHash) throw err('Incorrect room code', 403, 'BAD_PASSWORD');
  }
  // Capacity check (only non-staff count against capacity; exclude the
  // caller's own stale row so a refresh-rejoin never locks them out).
  if (!isStaff) {
    const active = await RoomMembership.countDocuments({ roomId, userId: { $ne: userId }, joinedAt: { $ne: null }, leftAt: null });
    if (active >= room.capacity) throw err('Room is full', 409, 'ROOM_FULL');
  }
  // Waiting room / approval → join as pending, no provider token yet.
  if (!isStaff && (room.waitingRoom || room.requireApproval) && !isMember) {
    await RoomJoinRequest.findOneAndUpdate(
      { roomId, userId }, { $set: { message: '' } }, { upsert: true },
    );
    return { status: 'pending_approval' };
  }

  // Record membership + mark joined.
  await RoomMembership.findOneAndUpdate(
    { roomId, userId },
    { $set: { joinedAt: new Date(), leftAt: null, lastSeenAt: new Date(), role: isOwner ? 'host' : (membership?.role === 'host' ? 'host' : membership?.role || 'participant') } },
    { upsert: true },
  );
  await MeetingRoom.updateOne({ _id: roomId, status: { $in: ['waiting', 'scheduled'] } }, { $set: { status: 'active', startedAt: room.startedAt || new Date() } });

  // Mint a scoped provider token. Hosts get host perms, others participant.
  const { generateToken } = await import('./videoSdkService.js');
  let providerRoomId = room.providerRoomId;
  if (!providerRoomId && isOwner) {
    const { createRoom: createProviderRoom } = await import('./videoSdkService.js');
    const pr = await createProviderRoom({ customRoomId: `room-${String(room._id)}` });
    providerRoomId = pr.roomId;
    await MeetingRoom.updateOne({ _id: roomId }, { $set: { providerRoomId } });
  }
  if (!providerRoomId) throw err('Room has no active session yet — the host must start it', 409, 'NOT_STARTED');
  const perms = isOwner ? PERMS.host : PERMS.participant;
  const token = generateToken({ permissions: perms, roomId: providerRoomId, participantId: userId });
  return { status: 'joined', token, roomId: providerRoomId, participantId: String(userId), role: isOwner ? 'host' : (isStaff ? 'cohost' : 'participant') };
}

export async function leaveRoom(userId, roomId) {
  await getRoomForView(roomId, userId);
  await RoomMembership.updateOne({ roomId, userId }, { $set: { leftAt: new Date() } });
  return { left: true };
}

export async function endRoom(userId, roomId) {
  const { room, isOwner, isStaff } = await getRoomForView(roomId, userId);
  if (!isOwner && !isStaff) throw err('Only the host or a co-host can end the room', 403, 'FORBIDDEN');
  await MeetingRoom.updateOne({ _id: roomId }, { $set: { status: 'ended', endedAt: new Date() } });
  // best-effort provider deactivation for one-shot rooms
  try {
    if (room.providerRoomId && isConfigured()) {
      const { deactivateRoom } = await import('./videoSdkService.js');
      await deactivateRoom(room.providerRoomId);
    }
  } catch { /* provider cleanup is best-effort */ }
  return { ended: true };
}

export async function updateRoom(userId, roomId, patch) {
  const { isOwner, isStaff } = await getRoomForView(roomId, userId);
  if (!isOwner && !isStaff) throw err('Not allowed to change room settings', 403, 'FORBIDDEN');
  const allowed = ['name', 'description', 'coverImage', 'roomType', 'access', 'scheduledStartAt', 'scheduledEndAt', 'capacity', 'waitingRoom', 'requireApproval', 'permissions', 'cohostIds', 'moderatorIds'];
  const set = {};
  for (const k of allowed) if (patch[k] !== undefined) set[k] = patch[k];
  if (set.capacity && set.capacity > env.VIDEOSDK_MAX_PARTICIPANTS) throw err(`Capacity cannot exceed ${env.VIDEOSDK_MAX_PARTICIPANTS}`, 422, 'CAPACITY');
  if (set.scheduledStartAt) set.scheduledStartAt = new Date(set.scheduledStartAt);
  if (set.scheduledEndAt) set.scheduledEndAt = new Date(set.scheduledEndAt);
  if (patch.password) { set.passwordHash = hashPw(patch.password); }
  if (patch.clearPassword) set.passwordHash = null;
  return MeetingRoom.findOneAndUpdate({ _id: roomId }, { $set: set }, { new: true }).lean();
}

export async function cancelRoom(userId, roomId) {
  const { room, isOwner } = await getRoomForView(roomId, userId);
  if (!isOwner) throw err('Only the host can cancel', 403, 'FORBIDDEN');
  if (room.status === 'active') throw err('End the active room instead', 400, 'INVALID_STATE');
  return MeetingRoom.updateOne({ _id: roomId }, { $set: { status: 'cancelled', endedAt: new Date() } });
}

export async function listRooms(userId, { scope = 'mine', q, limit = 20 } = {}) {
  const filter = { status: { $ne: 'archived' } };
  if (scope === 'mine') {
    const mine = await RoomMembership.find({ userId }).select('roomId').lean();
    filter.$or = [{ ownerId: userId }, { _id: { $in: mine.map((m) => m.roomId) } }, { access: 'discoverable' }];
  } else if (scope === 'upcoming') {
    filter.scheduledStartAt = { $gte: new Date() };
    filter.access = 'discoverable';
  } else if (scope === 'discover') {
    filter.access = 'discoverable';
  }
  if (q) filter.$text = { $search: String(q) };
  return MeetingRoom.find(filter).sort({ scheduledStartAt: -1, createdAt: -1 }).limit(Math.min(Number(limit) || 20, 50)).lean();
}

export async function roomParticipants(userId, roomId) {
  await getRoomForView(roomId, userId);
  const members = await RoomMembership.find({ roomId, leftAt: null }).populate('userId', USER_FIELDS).lean();
  return members;
}

// Invitations
export async function inviteToRoom(userId, roomId, { inviteeIds = [], expiresInHours } = {}) {
  const { room, isOwner, isStaff } = await getRoomForView(roomId, userId);
  if (!isOwner && !isStaff && !room.permissions?.allowInvite) throw err('Not allowed to invite', 403, 'FORBIDDEN');
  const tokens = [];
  for (const inviteeId of inviteeIds.slice(0, 50)) {
    if (!oid(inviteeId)) continue;
    const token = crypto.randomBytes(16).toString('hex');
    await RoomInvitation.create({
      roomId, token: sha(token), invitedById: userId, inviteeId,
      expiresAt: expiresInHours ? new Date(Date.now() + expiresInHours * 3600e3) : null,
    });
    tokens.push({ inviteeId, token });
  }
  // Also a general shareable link token (no specific invitee).
  const linkToken = crypto.randomBytes(16).toString('hex');
  await RoomInvitation.create({
    roomId, token: sha(linkToken), invitedById: userId,
    expiresAt: expiresInHours ? new Date(Date.now() + expiresInHours * 3600e3) : null,
  });
  return { invites: tokens, linkToken, url: `${env.CLIENT_URL}/rooms/join/${linkToken}` };
}

export async function acceptRoomInvite(userId, token) {
  const inv = await RoomInvitation.findOne({ token: sha(String(token || '')) }).lean();
  if (!inv) throw err('Invalid invitation', 404, 'INVALID');
  if (inv.revokedAt) throw err('Invitation revoked', 410, 'REVOKED');
  if (inv.expiresAt && inv.expiresAt < new Date()) throw err('Invitation expired', 410, 'EXPIRED');
  if (inv.inviteeId && String(inv.inviteeId) !== String(userId)) throw err('Invitation is not for you', 403, 'FORBIDDEN');
  await RoomInvitation.updateOne({ _id: inv._id }, { $set: { acceptedAt: new Date() } });
  await RoomMembership.findOneAndUpdate({ roomId: inv.roomId, userId }, { $set: { role: 'participant' } }, { upsert: true });
  const room = await MeetingRoom.findById(inv.roomId).lean();
  return room;
}

export async function roomJoinRequests(userId, roomId) {
  const { isOwner, isStaff } = await getRoomForView(roomId, userId);
  if (!isOwner && !isStaff) throw err('Not allowed', 403, 'FORBIDDEN');
  return RoomJoinRequest.find({ roomId, status: 'pending' }).populate('userId', USER_FIELDS).lean();
}

export async function reviewRoomJoin(userId, roomId, requestId, approve) {
  const { isOwner, isStaff } = await getRoomForView(roomId, userId);
  if (!isOwner && !isStaff) throw err('Not allowed', 403, 'FORBIDDEN');
  const req = await RoomJoinRequest.findOne({ _id: requestId, roomId }).lean();
  if (!req || req.status !== 'pending') throw err('Request not found or reviewed', 404, 'NOT_FOUND');
  await RoomJoinRequest.updateOne({ _id: requestId }, { $set: { status: approve ? 'approved' : 'rejected', reviewedBy: userId, reviewedAt: new Date() } });
  if (approve) await RoomMembership.findOneAndUpdate({ roomId, userId: req.userId }, { $set: { role: 'participant' } }, { upsert: true });
  return { approved: !!approve };
}

// ===========================================================================
// LIVE SESSIONS
// ===========================================================================

export async function createLive(userId, input) {
  const {
    title, description = '', category = 'General', coverImage, access = 'public',
    requiredPlan = null, broadcastMode = 'hls', scheduledStartAt, capacity = 500,
    chatEnabled = true, questionsEnabled = true, reactionsEnabled = true,
    cohostIds = [], recordingEnabled = false, rtmpUrl,
  } = input;
  if (!title || title.trim().length < 3) throw err('Title must be at least 3 characters');
  const live = await LiveSession.create({
    hostId: userId, title: title.trim(), description, category, coverImage, access,
    requiredPlan, broadcastMode, rtmpUrl: rtmpUrl || null,
    scheduledStartAt: scheduledStartAt ? new Date(scheduledStartAt) : null,
    status: scheduledStartAt ? 'scheduled' : 'scheduled',
    capacity, chatEnabled, questionsEnabled, reactionsEnabled,
    cohostIds: cohostIds.slice(0, 10), recordingEnabled,
  });
  return live;
}

async function getLiveForView(liveId, userId) {
  if (!oid(liveId)) throw err('Invalid session', 400, 'INVALID');
  const live = await LiveSession.findById(liveId).lean();
  if (!live) throw err('Live session not found', 404, 'NOT_FOUND');
  const isHost = String(live.hostId) === String(userId);
  const isStaff = isHost || !!live.cohostIds?.some((c) => String(c) === String(userId)) || !!live.moderatorIds?.some((m) => String(m) === String(userId));
  if (!isStaff) {
    if (live.access === 'private') {
      const part = await LiveParticipant.findOne({ liveId, userId }).lean();
      if (!part) throw err('This session is private', 403, 'FORBIDDEN');
    }
    if (live.access === 'premium' && live.requiredPlan) {
      const u = await User.findById(userId).select('plan').lean();
      const order = { FREE: 0, AWAKENED: 1, MONARCH: 2 };
      if ((order[u?.plan] || 0) < (order[live.requiredPlan] || 1)) throw err('This session requires a premium plan', 403, 'PREMIUM_REQUIRED');
    }
  }
  return { live, isHost, isStaff };
}

// Single source of truth for presence: active LiveParticipant rows.
// The stored viewerCount counter can drift (closed tabs, failed leaves),
// so reads always serve the real count.
async function livePresence(liveIds) {
  const ids = [...new Set((liveIds || []).map(String))].filter(oid);
  if (!ids.length) return {};
  const rows = await LiveParticipant.aggregate([
    { $match: { liveId: { $in: ids.map((id) => new Types.ObjectId(id)) }, leftAt: null } },
    { $group: { _id: '$liveId', n: { $sum: 1 } } },
  ]);
  return Object.fromEntries(rows.map((r) => [String(r._id), r.n]));
}

// Public view used by GET /live/:liveId (safe fields + caller capabilities).
export async function liveView(liveId, userId) {
  const { live, isHost, isStaff } = await getLiveForView(liveId, userId);
  // Never expose rtmp push credentials to anyone but the host.
  const safe = { ...live };
  if (!isHost) safe.rtmpUrl = undefined;
  const presence = await livePresence([liveId]);
  safe.viewerCount = presence[String(live._id)] ?? 0;
  return { live: safe, isHost, isStaff, myRole: isHost ? 'host' : (isStaff ? 'cohost' : 'audience') };
}

export async function startLive(userId, liveId) {
  const { live, isHost } = await getLiveForView(liveId, userId);
  if (!isHost) throw err('Only the host can start the session', 403, 'FORBIDDEN');
  // Idempotent for the host: a refresh mid-broadcast re-attaches instead of
  // throwing ALREADY_LIVE (the studio re-joins media only).
  if (live.status === 'live') return live;
  if (live.status === 'ended') throw err('Session already ended', 410, 'ENDED');
  const { createRoom } = await import('./videoSdkService.js');
  let providerRoomId = live.providerRoomId;
  if (!providerRoomId) {
    const room = await createRoom({ customRoomId: `live-${String(live._id)}` });
    providerRoomId = room.roomId;
  }
  const updated = await LiveSession.findOneAndUpdate(
    { _id: liveId, status: { $ne: 'live' } },
    { $set: { status: 'live', startedAt: new Date(), providerRoomId } }, { new: true },
  ).lean();
  return updated;
}

export async function endLive(userId, liveId) {
  const { live, isHost, isStaff } = await getLiveForView(liveId, userId);
  if (!isHost && !isStaff) throw err('Only the host or a co-host can end the session', 403, 'FORBIDDEN');
  const updated = await LiveSession.findOneAndUpdate(
    { _id: liveId, status: 'live' },
    { $set: { status: 'ended', endedAt: new Date(), viewerCount: 0 } }, { new: true },
  ).lean();
  if (!updated) throw err('Session is not live', 409, 'NOT_LIVE');
  try {
    if (live.providerRoomId && isConfigured()) {
      const { deactivateRoom } = await import('./videoSdkService.js');
      await deactivateRoom(live.providerRoomId);
    }
  } catch { /* best-effort */ }
  return updated;
}

// Mint a token to join live media. Hosts/cohosts get RTC producer rights;
// audience gets viewer (no host perms) — enforced by permission set.
export async function joinLive(userId, liveId) {
  const { live, isHost, isStaff } = await getLiveForView(liveId, userId);
  if (live.status === 'ended') throw err('This session has ended', 410, 'ENDED');
  if (live.status !== 'live') throw err('Session is not live yet', 409, 'NOT_LIVE');
  const active = await LiveParticipant.countDocuments({ liveId, userId: { $ne: userId }, leftAt: null });
  if (!isStaff && active >= live.capacity) throw err('Session is at capacity', 409, 'FULL');
  const alreadyIn = await LiveParticipant.findOne({ liveId, userId, leftAt: null }).lean();
  await LiveParticipant.findOneAndUpdate(
    { liveId, userId }, { $set: { joinedAt: new Date(), leftAt: null, role: isHost ? 'host' : (isStaff ? 'cohost' : 'audience') } }, { upsert: true },
  );
  // Refresh-rejoin must not inflate the viewer count.
  if (!alreadyIn) await LiveSession.updateOne({ _id: liveId }, { $inc: { viewerCount: 1 } });
  // Track peak from the true active count.
  const activeNow = await LiveParticipant.countDocuments({ liveId, leftAt: null });
  await LiveSession.updateOne({ _id: liveId, peakViewers: { $lt: activeNow } }, { $set: { peakViewers: activeNow, viewerCount: activeNow } });
  const { generateToken } = await import('./videoSdkService.js');
  if (!live.providerRoomId) throw err('Session has no active stream', 409, 'NOT_LIVE');
  const perms = isHost ? PERMS.host : (isStaff ? PERMS.host : PERMS.participant);
  const token = generateToken({ permissions: perms, roomId: live.providerRoomId, participantId: userId });
  return { status: 'joined', token, roomId: live.providerRoomId, participantId: String(userId), role: isHost ? 'host' : (isStaff ? 'cohost' : 'audience') };
}

export async function leaveLive(userId, liveId) {
  await LiveParticipant.updateOne({ liveId, userId }, { $set: { leftAt: new Date() } });
  await LiveSession.updateOne({ _id: liveId, viewerCount: { $gt: 0 } }, { $inc: { viewerCount: -1 } });
  return { left: true };
}

export async function updateLive(userId, liveId, patch) {
  const { live, isHost, isStaff } = await getLiveForView(liveId, userId);
  if (!isHost && !isStaff) throw err('Not allowed', 403, 'FORBIDDEN');
  if (live.status === 'ended' || live.status === 'cancelled') throw err('Session is over and can no longer be edited', 410, 'ENDED');
  const allowed = ['title', 'description', 'category', 'coverImage', 'access', 'requiredPlan', 'scheduledStartAt', 'capacity', 'chatEnabled', 'questionsEnabled', 'reactionsEnabled', 'cohostIds', 'moderatorIds', 'recordingEnabled', 'rtmpUrl'];
  const set = {};
  for (const k of allowed) if (patch[k] !== undefined) set[k] = patch[k];
  if (set.scheduledStartAt) set.scheduledStartAt = new Date(set.scheduledStartAt);
  return LiveSession.findOneAndUpdate({ _id: liveId }, { $set: set }, { new: true }).lean();
}

export async function listLive(userId, { scope = 'live', q, category, limit = 20 } = {}) {
  const filter = {};
  if (scope === 'live') filter.status = 'live';
  else if (scope === 'upcoming') filter.status = 'scheduled';
  else if (scope === 'ended') filter.status = 'ended';
  else if (scope === 'mine') filter.hostId = userId;
  else if (scope === 'following') {
    const joined = await LiveParticipant.find({ userId }).select('liveId').lean();
    filter.$or = [{ hostId: userId }, { _id: { $in: joined.map((p) => p.liveId) } }];
  }
  // Non-staff never see private sessions in public listings.
  if (scope !== 'mine') filter.access = { $in: ['public', 'unlisted', 'premium'] };
  if (category) filter.category = category;
  if (q) filter.$text = { $search: String(q) };
  const items = await LiveSession.find(filter).sort({ startedAt: -1, scheduledStartAt: -1 }).limit(Math.min(Number(limit) || 20, 50)).lean();
  // Serve true presence so cards never show drifted counters.
  const presence = await livePresence(items.map((l) => String(l._id)));
  return items.map((l) => ({ ...l, viewerCount: presence[String(l._id)] ?? 0 }));
}

export async function liveChat(userId, liveId, { before, limit = 50 } = {}) {
  await getLiveForView(liveId, userId);
  const q = { liveId, deletedAt: null };
  if (before) q.createdAt = { $lt: new Date(before) };
  return LiveChatMessage.find(q).sort({ createdAt: -1 }).limit(Math.min(Number(limit) || 50, 100)).populate('userId', USER_FIELDS).lean();
}

export async function sendLiveChat(userId, liveId, { content, type = 'message', clientKey }) {
  const { live, isStaff } = await getLiveForView(liveId, userId);
  if (live.status !== 'live' && live.status !== 'scheduled') throw err('Session is not active', 409, 'NOT_LIVE');
  if (type === 'announcement' && !isStaff) throw err('Only hosts can post announcements', 403, 'FORBIDDEN');
  if (type === 'question' && !live.questionsEnabled) throw err('Questions are disabled', 403, 'DISABLED');
  if (type === 'message' && !live.chatEnabled) throw err('Chat is disabled', 403, 'DISABLED');
  const trimmed = String(content || '').trim();
  if (!trimmed) throw err('Message cannot be empty');
  if (clientKey) {
    const existing = await LiveChatMessage.findOne({ liveId, clientKey }).lean();
    if (existing) return existing;
  }
  return LiveChatMessage.create({ liveId, userId, type, content: trimmed.slice(0, 1000), clientKey: clientKey || null });
}

export async function moderateLive(userId, liveId, { action, targetUserId, messageId, reason = '' }) {
  const { isStaff } = await getLiveForView(liveId, userId);
  if (!isStaff) throw err('Only hosts and moderators can moderate', 403, 'FORBIDDEN');
  if (['remove', 'mute', 'ban'].includes(action) && targetUserId) {
    await LiveParticipant.updateOne({ liveId, userId: targetUserId }, { $set: { leftAt: new Date() } });
    await LiveSession.updateOne({ _id: liveId, viewerCount: { $gt: 0 } }, { $inc: { viewerCount: -1 } });
  }
  if (action === 'delete_message' && messageId) {
    await LiveChatMessage.updateOne({ _id: messageId, liveId }, { $set: { deletedAt: new Date() } });
  }
  return ModerationAction.create({ actorId: userId, targetType: 'live', targetId: liveId, action, reason });
}

export async function cancelLive(userId, liveId) {
  const { live, isHost } = await getLiveForView(liveId, userId);
  if (!isHost) throw err('Only the host can cancel the session', 403, 'FORBIDDEN');
  if (live.status === 'live') throw err('End the live broadcast first', 400, 'INVALID_STATE');
  if (live.status === 'ended' || live.status === 'cancelled') throw err('Session is already over', 410, 'ENDED');
  const updated = await LiveSession.findOneAndUpdate(
    { _id: liveId, status: 'scheduled' },
    { $set: { status: 'cancelled', endedAt: new Date() } }, { new: true },
  ).lean();
  return updated;
}

export async function toggleFollow(userId, liveId) {
  const { live } = await getLiveForView(liveId, userId);
  const has = (live.followerIds || []).some((f) => String(f) === String(userId));
  await LiveSession.updateOne({ _id: liveId }, has ? { $pull: { followerIds: userId } } : { $addToSet: { followerIds: userId } });
  return { following: !has };
}
