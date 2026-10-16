import mongoose from 'mongoose';
const s = new mongoose.Schema({ userId:{type:mongoose.Schema.Types.ObjectId,ref:'User',index:true}, action:String, meta:Object, ip:String },{timestamps:true});
s.index({ createdAt:-1 });
export default mongoose.model('ActivityLog', s);