import mongoose from 'mongoose';
const s = new mongoose.Schema({ userId:{type:mongoose.Schema.Types.ObjectId,ref:'User',index:true}, email:{type:String,required:true,index:true}, otpHash:{type:String,required:true}, expiresAt:{type:Date,required:true}, attempts:{type:Number,default:0}, maxAttempts:{type:Number,default:5}, verified:{type:Boolean,default:false} },{timestamps:true});
s.index({ expiresAt:1 }, { expireAfterSeconds:0 }); s.index({ email:1, verified:1 });
export default mongoose.model('OTP', s);