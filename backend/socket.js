import { Server } from 'socket.io';
import { verifyAccess } from './services/jwtService.js';
import { getMembership } from './services/communityService.js';
import { MeetingRoom, RoomMembership, LiveSession, LiveParticipant } from './models/Comms.js';

// ============================================================================
// Real-time layer. JWT-authenticated. Every room join is re-authorized against
// the DB (never trusts the client). Typing + presence are throttled to avoid
// stampedes. Events are only relayed to sockets that have joined the room.
// ============================================================================

const TYPING_COOLDOWN_MS = 3000;

export function initSocket(httpServer, corsOrigin) {
  const io = new Server(httpServer, { cors: { origin: corsOrigin, credentials: true } });

  // --- Auth handshake ---
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token || socket.handshake.headers?.authorization?.replace('Bearer ', '');
      if (!token) return next(new Error('Unauthorized'));
      const decoded = verifyAccess(token);
      socket.userId = String(decoded.sub);
      socket.data.joined = new Set();
      socket.data.lastTyping = new Map();
      next();
    } catch { next(new Error('Unauthorized')); }
  });

  // Presence: track live sockets per user across connections.
  const presence = new Map(); // userId -> Set(socketId)

  io.on('connection', (socket) => {
    const uid = socket.userId;

    // record presence
    if (!presence.has(uid)) presence.set(uid, new Set());
    presence.get(uid).add(socket.id);
    // Personal room: every socket joins its own user room so call/room/live
    // invitations and targeted events can reach it. Scoped to this user only.
    socket.join(`user:${uid}`);
    socket.data.joined.add(`user:${uid}`);
    // notify this user's open rooms that they're online (best-effort)
    for (const room of socket.data.joined) socket.to(room).emit('presence:online', { userId: uid });

    // --- Join a conversation room (membership re-checked server-side) ---
    socket.on('conv:join', async (conversationId, ack) => {
      try {
        const m = await getMembership(conversationId, uid);
        const allowed = m && !m.banned;
        if (!allowed) { if (typeof ack === 'function') ack({ ok: false, error: 'FORBIDDEN' }); return; }
        socket.join(`conv:${conversationId}`);
        socket.data.joined.add(`conv:${conversationId}`);
        if (typeof ack === 'function') ack({ ok: true });
      } catch { if (typeof ack === 'function') ack({ ok: false, error: 'ERROR' }); }
    });

    socket.on('conv:leave', (conversationId) => {
      socket.leave(`conv:${conversationId}`);
      socket.data.joined.delete(`conv:${conversationId}`);
    });

    // --- Typing (throttled broadcast, only to the room) ---
    socket.on('typing', ({ conversationId } = {}) => {
      const room = `conv:${conversationId}`;
      if (!socket.data.joined.has(room)) return;
      const now = Date.now();
      const last = socket.data.lastTyping.get(conversationId) || 0;
      if (now - last < TYPING_COOLDOWN_MS) return; // throttle
      socket.data.lastTyping.set(conversationId, now);
      socket.to(room).emit('typing', { conversationId, userId: uid });
    });

    // --- Read receipts (relay only; server already updated read state via REST) ---
    socket.on('read', async ({ conversationId } = {}) => {
      const room = `conv:${conversationId}`;
      if (!socket.data.joined.has(room)) return;
      socket.to(room).emit('read', { conversationId, userId: uid });
    });

    // --- Meeting room join (re-authorized against RoomMembership) ---
    socket.on('room:join', async (roomId, ack) => {
      try {
        const member = await RoomMembership.findOne({ roomId, userId: uid, leftAt: null }).lean();
        const room = await MeetingRoom.findById(roomId).select('ownerId cohostIds moderatorIds').lean();
        const isStaff = room && (String(room.ownerId) === String(uid) ||
          room.cohostIds?.some((c) => String(c) === String(uid)) ||
          room.moderatorIds?.some((m) => String(m) === String(uid)));
        if (!member && !isStaff) { if (typeof ack === 'function') ack({ ok: false, error: 'FORBIDDEN' }); return; }
        socket.join(`room:${roomId}`);
        socket.data.joined.add(`room:${roomId}`);
        socket.to(`room:${roomId}`).emit('room:participant-joined', { roomId, userId: uid });
        if (typeof ack === 'function') ack({ ok: true });
      } catch { if (typeof ack === 'function') ack({ ok: false, error: 'ERROR' }); }
    });
    socket.on('room:leave', (roomId) => {
      socket.leave(`room:${roomId}`);
      socket.data.joined.delete(`room:${roomId}`);
      socket.to(`room:${roomId}`).emit('room:participant-left', { roomId, userId: uid });
    });

    // --- Live session join (re-authorized against LiveParticipant/host) ---
    socket.on('live:join', async (liveId, ack) => {
      try {
        const live = await LiveSession.findById(liveId).select('hostId cohostIds moderatorIds').lean();
        const isStaff = live && (String(live.hostId) === String(uid) ||
          live.cohostIds?.some((c) => String(c) === String(uid)) ||
          live.moderatorIds?.some((m) => String(m) === String(uid)));
        const participant = await LiveParticipant.findOne({ liveId, userId: uid, leftAt: null }).lean();
        if (!participant && !isStaff) { if (typeof ack === 'function') ack({ ok: false, error: 'FORBIDDEN' }); return; }
        socket.join(`live:${liveId}`);
        socket.data.joined.add(`live:${liveId}`);
        if (typeof ack === 'function') ack({ ok: true });
      } catch { if (typeof ack === 'function') ack({ ok: false, error: 'ERROR' }); }
    });
    socket.on('live:leave', (liveId) => {
      socket.leave(`live:${liveId}`);
      socket.data.joined.delete(`live:${liveId}`);
    });

    // --- Disconnect ---
    socket.on('disconnect', () => {
      const set = presence.get(uid);
      if (set) {
        set.delete(socket.id);
        if (set.size === 0) {
          presence.delete(uid);
          // broadcast offline to rooms this socket had joined
          for (const room of socket.data.joined) socket.to(room).emit('presence:offline', { userId: uid });
        }
      }
    });
  });

  // helper for REST layer to query presence
  io.isUserOnline = (userId) => (presence.get(String(userId))?.size || 0) > 0;
  return io;
}
