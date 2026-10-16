import { z } from 'zod';
export const createOrderSchema = z.object({ plan: z.string().min(1), provider: z.enum(['razorpay','stripe']).optional() });
export const verifyPaymentSchema = z.object({ orderId: z.string().min(1), razorpay_payment_id: z.string().optional(), razorpay_signature: z.string().optional(), stripe_payment_intent_id: z.string().optional() });
