import mongoose from 'mongoose';

// ============================================================================
// Communications data layer: 1:1 calls, meeting rooms, and live sessions.
// Provider (VideoSDK) room/stream ids live here; app-level access control is
// enforced in the service layer against these records — never against the
// provider alone. Timestamps are UTC (mongoose default).
// ============================================================================

const { Schema, model, Types } = mongoose;

// --- Call (1:1 audio/video + group call record) ----------------------------
const callSchema = new Schema({
  type: { type: String, enum: ['audio', 'video'], required: true },
  conversationId: { type: Types.ObjectId, ref: 'Conversation', default: null, index: true },
  initiatorId: { type: Types.ObjectId, ref: 'User', required: true, index: true },
  participantIds: [{ type: Types.ObjectId, ref: 'User' }],
  providerRoomId: { type: String, default: null, index: true },
  status: {
    type: String,
    enum: ['ringing', 'accepted', 'rejected', 'cancelled', 'missed', 'ended', 'failed'],
    default: 'ringing',
    index: true,
  },
  endReason: { type: String, default: null }, // declined, cancelled, hangup, timeout, failed, ended_by_host
  ringStartedAt: { type: Date, default: Date.now },
  acceptedAt: { type: Date, default: null },
  endedAt: { type: Date, default: null },
  durationSeconds: { type: Number, default: 0 },
}, { timestamps: true });
callSchema.index({ participantIds: 1, createdAt: -1 });

// --- MeetingRoom -----------------------------------------------------------
const roomSchema = new Schema({
  ownerId: { type: Types.ObjectId, ref: 'User', required: true, index: true },
  name: { type: String, required: true, trim: true, maxlength: 100 },
  description: { type: String, maxlength: 1000, default: '' },
  coverImage: String,
  roomType: { type: String, enum: ['audio', 'video', 'meeting'], default: 'meeting' },
  access: { type: String, enum: ['private', 'invite', 'discoverable'], default: 'invite', index: true },
  providerRoomId: { type: String, default: null, index: true },
  // scheduling
  scheduledStartAt: { type: Date, default: null, index: true },
  scheduledEndAt: { type: Date, default: null },
  startedAt: { type: Date, default: null },
  endedAt: { type: Date, default: null },
  // lifecycle
  status: { type: String, enum: ['scheduled', 'waiting', 'active', 'ended', 'cancelled', 'archived'], default: 'scheduled', index: true },
  // capacity & access
  capacity: { type: Number, default: 20, min: 2, max: 200 },
  passwordHash: { type: String, default: null }, // optional access code (hashed)
  waitingRoom: { type: Boolean, default: false },
  requireApproval: { type: Boolean, default: false },
  // participant permissions
  permissions: {
    allowScreenShare: { type: Boolean, default: true },
    allowCam: { type: Boolean, default: true },
    joinMuted: { type: Boolean, default: true },
    allowChat: { type: Boolean, default: true },
    allowRecording: { type: Boolean, default: false },
    allowInvite: { type: Boolean, default: false },
  },
  cohostIds: [{ type: Types.ObjectId, ref: 'User' }],
  moderatorIds: [{ type: Types.ObjectId, ref: 'User' }],
  conversationId: { type: Types.ObjectId, ref: 'Conversation', default: null }, // linked group chat
  memberCount: { type: Number, default: 0 },
}, { timestamps: true });
roomSchema.index({ name: 'text', description: 'text' });
roomSchema.index({ access: 1, status: 1, scheduledStartAt: 1 });

// --- RoomMembership --------------------------------------------------------
const roomMemberSchema = new Schema({
  roomId: { type: Types.ObjectId, ref: 'MeetingRoom', index: true },
  userId: { type: Types.ObjectId, ref: 'User', index: true },
  role: { type: String, enum: ['host', 'cohost', 'moderator', 'participant'], default: 'participant' },
  joinedAt: { type: Date, default: null },
  leftAt: { type: Date, default: null },
  lastSeenAt: { type: Date, default: Date.now },
}, { timestamps: true });
roomMemberSchema.index({ roomId: 1, userId: 1 }, { unique: true });

// --- RoomInvitation --------------------------------------------------------
const roomInviteSchema = new Schema({
  roomId: { type: Types.ObjectId, ref: 'MeetingRoom', index: true },
  token: { type: String, required: true, unique: true, index: true }, // hashed
  invitedById: { type: Types.ObjectId, ref: 'User' },
  inviteeId: { type: Types.ObjectId, ref: 'User', default: null, index: true },
  expiresAt: { type: Date, default: null },
  revokedAt: { type: Date, default: null },
  acceptedAt: { type: Date, default: null },
}, { timestamps: true });

// --- RoomJoinRequest -------------------------------------------------------
const roomJoinReqSchema = new Schema({
  roomId: { type: Types.ObjectId, ref: 'MeetingRoom', index: true },
  userId: { type: Types.ObjectId, ref: 'User', index: true },
  message: { type: String, maxlength: 300, default: '' },
  status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending', index: true },
  reviewedBy: { type: Types.ObjectId, ref: 'User', default: null },
  reviewedAt: { type: Date, default: null },
}, { timestamps: true });
roomJoinReqSchema.index({ roomId: 1, userId: 1 }, { unique: true });

// --- LiveSession -----------------------------------------------------------
const liveSchema = new Schema({
  hostId: { type: Types.ObjectId, ref: 'User', required: true, index: true },
  title: { type: String, required: true, trim: true, maxlength: 120 },
  description: { type: String, maxlength: 2000, default: '' },
  category: { type: String, default: 'General', maxlength: 60 },
  coverImage: String,
  access: { type: String, enum: ['public', 'unlisted', 'private', 'premium'], default: 'public', index: true },
  requiredPlan: { type: String, default: null },
  providerRoomId: { type: String, default: null, index: true },
  broadcastMode: { type: String, enum: ['rtc', 'hls', 'rtmp'], default: 'hls' },
  rtmpUrl: { type: String, default: null }, // host-configured push target (never sent to audience)
  status: { type: String, enum: ['scheduled', 'live', 'ended', 'cancelled'], default: 'scheduled', index: true },
  scheduledStartAt: { type: Date, default: null, index: true },
  startedAt: { type: Date, default: null },
  endedAt: { type: Date, default: null },
  viewerCount: { type: Number, default: 0 },
  peakViewers: { type: Number, default: 0 },
  capacity: { type: Number, default: 500 },
  chatEnabled: { type: Boolean, default: true },
  questionsEnabled: { type: Boolean, default: true },
  reactionsEnabled: { type: Boolean, default: true },
  cohostIds: [{ type: Types.ObjectId, ref: 'User' }],
  moderatorIds: [{ type: Types.ObjectId, ref: 'User' }],
  recordingEnabled: { type: Boolean, default: false },
  replayUrl: { type: String, default: null },
  hlsUrl: { type: String, default: null },
  followerIds: [{ type: Types.ObjectId, ref: 'User' }], // reminders / following
}, { timestamps: true });
liveSchema.index({ title: 'text', description: 'text', category: 'text' });
liveSchema.index({ status: 1, scheduledStartAt: -1 });

// --- LiveParticipant (hosts/cohosts/audience presence) ---------------------
const liveParticipantSchema = new Schema({
  liveId: { type: Types.ObjectId, ref: 'LiveSession', index: true },
  userId: { type: Types.ObjectId, ref: 'User', index: true },
  role: { type: String, enum: ['host', 'cohost', 'moderator', 'audience'], default: 'audience' },
  joinedAt: { type: Date, default: Date.now },
  leftAt: { type: Date, default: null },
}, { timestamps: true });
liveParticipantSchema.index({ liveId: 1, userId: 1 }, { unique: true });

// --- LiveChatMessage -------------------------------------------------------
const liveChatSchema = new Schema({
  liveId: { type: Types.ObjectId, ref: 'LiveSession', index: true },
  userId: { type: Types.ObjectId, ref: 'User', index: true },
  type: { type: String, enum: ['message', 'question', 'announcement'], default: 'message' },
  content: { type: String, maxlength: 1000, required: true },
  pinned: { type: Boolean, default: false },
  deletedAt: { type: Date, default: null },
  clientKey: { type: String, default: null },
}, { timestamps: true });
liveChatSchema.index({ liveId: 1, createdAt: -1 });
liveChatSchema.index({ liveId: 1, clientKey: 1 }, { unique: true, partialFilterExpression: { clientKey: { $ne: null } } });

// --- ModerationAction ------------------------------------------------------
const moderationSchema = new Schema({
  actorId: { type: Types.ObjectId, ref: 'User', index: true },
  targetType: { type: String, enum: ['room', 'live', 'user', 'message'], required: true },
  targetId: { type: Types.ObjectId, required: true, index: true },
  action: { type: String, enum: ['mute', 'unmute', 'remove', 'ban', 'end', 'delete_message', 'pin', 'unpin'], required: true },
  reason: { type: String, maxlength: 300, default: '' },
}, { timestamps: true });

// --- SessionRecording ------------------------------------------------------
const recordingSchema = new Schema({
  liveId: { type: Types.ObjectId, ref: 'LiveSession', index: true },
  roomId: { type: Types.ObjectId, ref: 'MeetingRoom', default: null, index: true },
  providerId: { type: String, default: null },
  status: { type: String, enum: ['starting', 'started', 'stopping', 'stopped', 'failed'], default: 'starting' },
  url: { type: String, default: null },
  startedAt: { type: Date, default: null },
  stoppedAt: { type: Date, default: null },
}, { timestamps: true });

export const Call = model('Call', callSchema);
export const MeetingRoom = model('MeetingRoom', roomSchema);
export const RoomMembership = model('RoomMembership', roomMemberSchema);
export const RoomInvitation = model('RoomInvitation', roomInviteSchema);
export const RoomJoinRequest = model('RoomJoinRequest', roomJoinReqSchema);
export const LiveSession = model('LiveSession', liveSchema);
export const LiveParticipant = model('LiveParticipant', liveParticipantSchema);
export const LiveChatMessage = model('LiveChatMessage', liveChatSchema);
export const ModerationAction = model('ModerationAction', moderationSchema);
export const SessionRecording = model('SessionRecording', recordingSchema);
