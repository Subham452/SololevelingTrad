import mongoose from 'mongoose';
const s = new mongoose.Schema({ userId:{type:mongoose.Schema.Types.ObjectId,ref:'User',index:true}, ip:String, userAgent:String, success:Boolean },{timestamps:true});
s.index({ createdAt:-1 });
// Security centre groups failed logins by day/IP (adminService.securityOverview).
s.index({ success:1, createdAt:-1 });
export default mongoose.model('LoginHistory', s);