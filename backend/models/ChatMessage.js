import mongoose from 'mongoose';
const s = new mongoose.Schema({ sessionId:{type:mongoose.Schema.Types.ObjectId,ref:'ChatSession',index:true}, userId:{type:mongoose.Schema.Types.ObjectId,ref:'User',index:true}, role:{type:String,enum:['user','assistant']}, content:String },{timestamps:true});
export default mongoose.model('ChatMessage', s);