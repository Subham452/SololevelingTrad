import mongoose from 'mongoose';

const groupSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 60 },
  description: { type: String, maxlength: 300, default: '' },
  avatar: String,
  ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  isPublic: { type: Boolean, default: false },
  inviteCode: { type: String, unique: true, sparse: true },
}, { timestamps: true });
groupSchema.index({ name: 1 });

const membershipSchema = new mongoose.Schema({
  groupId: { type: mongoose.Schema.Types.ObjectId, ref: 'Group', index: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
  role: { type: String, enum: ['owner', 'admin', 'member'], default: 'member' },
  muted: { type: Boolean, default: false },
  lastReadAt: { type: Date, default: Date.now },
}, { timestamps: true });
membershipSchema.index({ groupId: 1, userId: 1 }, { unique: true });

const messageSchema = new mongoose.Schema({
  groupId: { type: mongoose.Schema.Types.ObjectId, ref: 'Group', index: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
  content: { type: String, required: true, maxlength: 2000 },
  replyTo: { type: mongoose.Schema.Types.ObjectId, ref: 'Message' },
  edited: { type: Boolean, default: false },
  deleted: { type: Boolean, default: false },
  reactions: [{ type: String }],
}, { timestamps: true });
messageSchema.index({ groupId: 1, createdAt: -1 });

const invitationSchema = new mongoose.Schema({
  groupId: { type: mongoose.Schema.Types.ObjectId, ref: 'Group', index: true },
  invitedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  email: String,
  code: { type: String, unique: true, sparse: true },
  status: { type: String, enum: ['pending', 'accepted', 'declined', 'expired'], default: 'pending' },
}, { timestamps: true });

export const Group = mongoose.model('Group', groupSchema);
export const GroupMembership = mongoose.model('GroupMembership', membershipSchema);
export const GroupMessage = mongoose.model('GroupMessage', messageSchema);
export const GroupInvitation = mongoose.model('GroupInvitation', invitationSchema);
