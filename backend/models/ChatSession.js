import mongoose from 'mongoose';
const s = new mongoose.Schema({ userId:{type:mongoose.Schema.Types.ObjectId,ref:'User',index:true}, title:String },{timestamps:true});
export default mongoose.model('ChatSession', s);