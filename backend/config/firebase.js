import admin from 'firebase-admin';
import env from './env.js';
export let firebaseReady = false;
try {
  if (env.FIREBASE_PROJECT_ID && env.FIREBASE_CLIENT_EMAIL && env.FIREBASE_PRIVATE_KEY) {
    if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert({ projectId: env.FIREBASE_PROJECT_ID, clientEmail: env.FIREBASE_CLIENT_EMAIL, privateKey: env.FIREBASE_PRIVATE_KEY }) });
    firebaseReady = true;
  }
} catch { firebaseReady = false; }
export function getAuth() {
  if (!firebaseReady) { const e = new Error('Firebase Admin not configured'); e.statusCode = 503; throw e; }
  return admin.auth();
}
export default admin;
