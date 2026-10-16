import mongoose from 'mongoose';
const s = new mongoose.Schema({
  title: { type: String, required: true, maxlength: 160 },
  body: { type: String, required: true, maxlength: 5000 },
  severity: { type: String, enum: ['info', 'success', 'warning', 'critical'], default: 'info' },
  audience: { type: String, enum: ['all', 'authenticated', 'staff'], default: 'authenticated' },
  actionUrl: { type: String, default: '' },
  pinned: { type: Boolean, default: false },
  status: { type: String, enum: ['draft', 'scheduled', 'published', 'archived', 'withdrawn'], default: 'draft', index: true },
  publishAt: { type: Date, default: null, index: true },
  expiresAt: { type: Date, default: null, index: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });
s.index({ status: 1, publishAt: 1, expiresAt: 1 });
export default mongoose.models.Announcement || mongoose.model('Announcement', s);
