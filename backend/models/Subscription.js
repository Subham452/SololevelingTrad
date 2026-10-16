import mongoose from 'mongoose';
const s = new mongoose.Schema({ userId:{type:mongoose.Schema.Types.ObjectId,ref:'User',required:true,index:true}, plan:{type:String,required:true}, status:{type:String,enum:['active','cancelled','expired','past_due'],default:'active'}, startedAt:{type:Date,default:Date.now}, expiresAt:Date, paymentId:{type:mongoose.Schema.Types.ObjectId,ref:'Payment'} },{timestamps:true});
s.index({ status:1, expiresAt:1 });
// Entitlement lookups: currentSubscription() filters userId + status and sorts
// by createdAt. Single-field indexes exist for userId and {status,expiresAt},
// but this compound matches the real query shape far more selectively.
s.index({ userId:1, status:1, createdAt:-1 });
export default mongoose.model('Subscription', s);