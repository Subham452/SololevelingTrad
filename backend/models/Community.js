import mongoose from 'mongoose';

// ============================================================================
// Community / messaging data layer.
// One unified `Conversation` model backs direct messages, groups, and
// announcement channels. Membership + permissions live in ConversationMember.
// Messages are stored separately with pagination-friendly indexes.
// Never trust client-supplied roles/permissions — always re-read from DB.
// ============================================================================

const { Schema, model, Types } = mongoose;

// --- Conversation -----------------------------------------------------------
const conversationSchema = new Schema({
  type: { type: String, enum: ['direct', 'group', 'channel'], required: true, index: true },
  name: { type: String, trim: true, maxlength: 80 },
  description: { type: String, maxlength: 1000, default: '' },
  bio: { type: String, maxlength: 300, default: '' },
  avatar: String,
  coverImage: String,
  ownerId: { type: Types.ObjectId, ref: 'User', index: true },

  // discovery / privacy
  isPublic: { type: Boolean, default: false, index: true },
  discoverable: { type: Boolean, default: true },
  joinPolicy: { type: String, enum: ['open', 'invite', 'approval'], default: 'open' },
  category: { type: String, default: 'General Discussion', maxlength: 60 },
  tags: [{ type: String, maxlength: 30 }],
  language: { type: String, default: 'en', maxlength: 20 },
  isOfficial: { type: Boolean, default: false },
  isPremium: { type: Boolean, default: false }, // requires entitlement to join
  requiredPlan: { type: String, default: null },

  // group settings (used by group + channel)
  settings: {
    whoCanSend: { type: String, enum: ['everyone', 'admins'], default: 'everyone' },
    whoCanSendMedia: { type: String, enum: ['everyone', 'admins'], default: 'everyone' },
    whoCanInvite: { type: String, enum: ['everyone', 'admins'], default: 'everyone' },
    whoCanPin: { type: String, enum: ['everyone', 'admins'], default: 'admins' },
    whoCanManageMembers: { type: String, enum: ['everyone', 'admins'], default: 'admins' },
    membersCanInvite: { type: Boolean, default: true },
    requireApprovalToJoin: { type: Boolean, default: false },
    historyVisibleToNewMembers: { type: Boolean, default: true },
    slowModeSeconds: { type: Number, default: 0, min: 0, max: 3600 },
    linksAllowed: { type: Boolean, default: true },
    pollsAllowed: { type: Boolean, default: true },
    topicsEnabled: { type: Boolean, default: false },
    readOnly: { type: Boolean, default: false },
  },

  // direct-message specific
  directMembers: [{ type: Types.ObjectId, ref: 'User' }],

  // denormalized for fast list rendering
  lastMessage: { type: Types.ObjectId, ref: 'Message', default: null },
  lastMessageAt: { type: Date, default: null, index: true },
  lastMessagePreview: { type: String, default: '', maxlength: 120 },
  messageCount: { type: Number, default: 0 },
  memberCount: { type: Number, default: 0 },
  onlineCount: { type: Number, default: 0 },

  archived: { type: Boolean, default: false },
  deletedAt: { type: Date, default: null },
}, { timestamps: true });

conversationSchema.index({ name: 'text', description: 'text', tags: 'text' });
conversationSchema.index({ isPublic: 1, discoverable: 1, lastMessageAt: -1 });
conversationSchema.index({ type: 1, directMembers: 1 });

// --- ConversationMember -----------------------------------------------------
const memberSchema = new Schema({
  conversationId: { type: Types.ObjectId, ref: 'Conversation', index: true },
  userId: { type: Types.ObjectId, ref: 'User', index: true },
  role: { type: String, enum: ['owner', 'admin', 'moderator', 'member'], default: 'member' },
  // granular permissions (only meaningful for admin/moderator)
  permissions: {
    canChangeInfo: { type: Boolean, default: false },
    canManageMembers: { type: Boolean, default: false },
    canDeleteMessages: { type: Boolean, default: false },
    canPinMessages: { type: Boolean, default: false },
    canInvite: { type: Boolean, default: false },
    canApproveJoins: { type: Boolean, default: false },
    canManageTopics: { type: Boolean, default: false },
    canManageInvites: { type: Boolean, default: false },
  },
  nickname: { type: String, maxlength: 40, default: null },
  muted: { type: Boolean, default: false },
  banned: { type: Boolean, default: false, index: true },
  restrictedUntil: { type: Date, default: null },
  joinedAt: { type: Date, default: Date.now },
  invitedBy: { type: Types.ObjectId, ref: 'User', default: null },
  lastReadMessageId: { type: Types.ObjectId, ref: 'Message', default: null },
  lastReadAt: { type: Date, default: Date.now },
  unreadCount: { type: Number, default: 0 },
  unreadMentionCount: { type: Number, default: 0 },
  notifyLevel: { type: String, enum: ['all', 'mentions', 'none'], default: 'all' },
}, { timestamps: true });
memberSchema.index({ conversationId: 1, userId: 1 }, { unique: true });

// --- Message ----------------------------------------------------------------
const messageSchema = new Schema({
  conversationId: { type: Types.ObjectId, ref: 'Conversation', index: true },
  senderId: { type: Types.ObjectId, ref: 'User', index: true },
  type: { type: String, enum: ['text', 'image', 'document', 'audio', 'system', 'trade_idea'], default: 'text' },
  content: { type: String, maxlength: 4000, default: '' },
  attachments: [{
    kind: { type: String, enum: ['image', 'document', 'audio'] },
    url: String,
    name: String,
    size: Number,
    mime: String,
    width: Number,
    height: Number,
  }],
  replyTo: { type: Types.ObjectId, ref: 'Message', default: null },
  forwardedFrom: { type: Types.ObjectId, ref: 'Conversation', default: null },
  reactions: [{ user: { type: Types.ObjectId, ref: 'User' }, emoji: { type: String, maxlength: 8 } }],
  mentions: [{ type: Types.ObjectId, ref: 'User' }],
  hashtags: [{ type: String, maxlength: 40 }],
  // structured trade idea (clearly labeled educational, never auto-executed)
  tradeIdea: {
    symbol: String, entry: Number, stopLoss: Number, target: Number, bias: String, note: String,
  },
  system: { kind: { type: String, default: null } }, // member_joined, member_left, pinned, promoted, info_changed
  editedAt: { type: Date, default: null },
  deletedAt: { type: Date, default: null },
  deletedForEveryone: { type: Boolean, default: false },
  pinned: { type: Boolean, default: false },
  pinnedBy: { type: Types.ObjectId, ref: 'User', default: null },
  pinnedAt: { type: Date, default: null },
  clientKey: { type: String, default: null, index: true }, // idempotency, scoped per conversation below
  hiddenFor: [{ type: Types.ObjectId, ref: 'User' }], // delete-for-me tombstones
}, { timestamps: true });
messageSchema.index({ conversationId: 1, createdAt: -1 });
messageSchema.index({ conversationId: 1, clientKey: 1 }, { unique: true, partialFilterExpression: { clientKey: { $ne: null } } });
messageSchema.index({ conversationId: 1, pinned: 1, pinnedAt: -1 });

// --- Topic (forum mode) -----------------------------------------------------
const topicSchema = new Schema({
  conversationId: { type: Types.ObjectId, ref: 'Conversation', index: true },
  name: { type: String, required: true, maxlength: 60 },
  description: { type: String, maxlength: 300, default: '' },
  icon: { type: String, default: '' },
  order: { type: Number, default: 0 },
  archived: { type: Boolean, default: false },
  moderators: [{ type: Types.ObjectId, ref: 'User' }],
  createdBy: { type: Types.ObjectId, ref: 'User' },
  messageCount: { type: Number, default: 0 },
}, { timestamps: true });
topicSchema.index({ conversationId: 1, order: 1 });

// --- InviteLink -------------------------------------------------------------
const inviteSchema = new Schema({
  conversationId: { type: Types.ObjectId, ref: 'Conversation', index: true },
  token: { type: String, required: true, unique: true, index: true }, // hashed
  createdBy: { type: Types.ObjectId, ref: 'User' },
  expiresAt: { type: Date, default: null },
  maxUses: { type: Number, default: null },
  uses: { type: Number, default: 0 },
  requireApproval: { type: Boolean, default: false },
  revokedAt: { type: Date, default: null },
}, { timestamps: true });
inviteSchema.index({ conversationId: 1, createdAt: -1 });

// --- JoinRequest ------------------------------------------------------------
const joinRequestSchema = new Schema({
  conversationId: { type: Types.ObjectId, ref: 'Conversation', index: true },
  userId: { type: Types.ObjectId, ref: 'User', index: true },
  message: { type: String, maxlength: 300, default: '' },
  status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending', index: true },
  reviewedBy: { type: Types.ObjectId, ref: 'User', default: null },
  reviewedAt: { type: Date, default: null },
}, { timestamps: true });
joinRequestSchema.index({ conversationId: 1, userId: 1 }, { unique: true });

// --- Report -----------------------------------------------------------------
const reportSchema = new Schema({
  reporterId: { type: Types.ObjectId, ref: 'User', index: true },
  targetType: { type: String, enum: ['user', 'message', 'conversation'], required: true },
  targetId: { type: Types.ObjectId, required: true, index: true },
  reason: { type: String, enum: ['spam', 'scam', 'harassment', 'illegal', 'impersonation', 'other'], required: true },
  details: { type: String, maxlength: 1000, default: '' },
  status: { type: String, enum: ['open', 'reviewing', 'resolved', 'dismissed'], default: 'open' },
  moderatorId: { type: Types.ObjectId, ref: 'User', default: null },
  actionTaken: { type: String, default: '' },
}, { timestamps: true });

export const Conversation = model('Conversation', conversationSchema);
export const ConversationMember = model('ConversationMember', memberSchema);
export const Message = model('Message', messageSchema);
export const Topic = model('Topic', topicSchema);
export const InviteLink = model('InviteLink', inviteSchema);
export const JoinRequest = model('JoinRequest', joinRequestSchema);
export const CommunityReport = model('CommunityReport', reportSchema);
