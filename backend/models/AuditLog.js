import mongoose from 'mongoose';
const s = new mongoose.Schema({ actorId:{type:mongoose.Schema.Types.ObjectId,ref:'User'}, action:String, target:String, meta:Object },{timestamps:true});
s.index({ createdAt:-1 });
export default mongoose.model('AuditLog', s);