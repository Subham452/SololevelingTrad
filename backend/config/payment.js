import Razorpay from 'razorpay';
import Stripe from 'stripe';
import env from './env.js';
export function paymentProvider() { return env.PAYMENT_PROVIDER === 'stripe' ? 'stripe' : 'razorpay'; }
export function razorpayClient() { return new Razorpay({ key_id: env.RAZORPAY_KEY_ID, key_secret: env.RAZORPAY_KEY_SECRET }); }
export function stripeClient() { return new Stripe(env.STRIPE_SECRET_KEY); }
