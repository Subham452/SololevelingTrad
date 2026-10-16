import { getAuth } from '../config/firebase.js';
export async function verifyIdToken(idToken) { const auth = getAuth(); return auth.verifyIdToken(idToken); }
export async function getUser(uid) { return getAuth().getUser(uid); }
export async function createUser({ email, password, displayName }) { return getAuth().createUser({ email, password, displayName, emailVerified: false }); }
export async function setEmailVerified(uid) { return getAuth().updateUser(uid, { emailVerified: true }); }
export async function sendPasswordReset(email) { return getAuth().generatePasswordResetLink(email); }
