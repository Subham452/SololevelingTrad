import mongoose from 'mongoose';
const s = new mongoose.Schema({ userId:{type:mongoose.Schema.Types.ObjectId,ref:'User',index:true}, title:String, body:String, read:{type:Boolean,default:false} },{timestamps:true});
s.index({ userId:1, read:1 });
export default mongoose.model('Notification', s);