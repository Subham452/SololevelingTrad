import mongoose from 'mongoose';
const s = new mongoose.Schema({
  announcementId: { type: mongoose.Schema.Types.ObjectId, ref: 'Announcement', index: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
  read: { type: Boolean, default: false },
  readAt: { type: Date, default: null },
}, { timestamps: true });
s.index({ userId: 1, announcementId: 1 }, { unique: true });
s.index({ userId: 1, read: 1 });
export default mongoose.models.AnnouncementRead || mongoose.model('AnnouncementRead', s);
