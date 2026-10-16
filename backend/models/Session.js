import mongoose from 'mongoose';
const s = new mongoose.Schema({ userId:{type:mongoose.Schema.Types.ObjectId,ref:'User',required:true,index:true}, refreshTokenHash:{type:String,required:true}, device:String, ipAddress:String, userAgent:String, expiresAt:{type:Date,required:true}, revoked:{type:Boolean,default:false} },{timestamps:true});
s.index({ expiresAt:1 }, { expireAfterSeconds:0 }); s.index({ userId:1, revoked:1 });
export default mongoose.model('Session', s);