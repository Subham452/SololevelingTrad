import mongoose from 'mongoose';
const s = new mongoose.Schema({ userId:{type:mongoose.Schema.Types.ObjectId,ref:'User',unique:true}, period:String, aiCalls:{type:Number,default:0} },{timestamps:true});
export default mongoose.model('Usage', s);