// Firebase client SDK (identity only). All secrets stay on the backend.
// Active only when VITE_FIREBASE_* env vars are set; otherwise auth falls
// back to backend-direct calls (register/OTP) or demo mode (offline).
import { initializeApp, getApps } from "firebase/app";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, signInWithPopup, GoogleAuthProvider, isSignInWithEmailLink, sendSignInLinkToEmail, signInWithEmailLink } from "firebase/auth";

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
};

export const firebaseConfigured = Boolean(config.apiKey && config.authDomain && config.projectId);

let auth = null;
function getClientAuth() {
  if (!firebaseConfigured) throw new Error("Firebase is not configured. Set VITE_FIREBASE_* vars or run the backend register flow.");
  if (!auth) {
    if (!getApps().length) initializeApp(config);
    auth = getAuth();
  }
  return auth;
}

export async function firebaseEmailLogin(email, password) {
  const a = getClientAuth();
  const cred = await signInWithEmailAndPassword(a, email, password);
  return cred.user.getIdToken();
}

export async function firebaseEmailRegister(email, password) {
  const a = getClientAuth();
  const cred = await createUserWithEmailAndPassword(a, email, password);
  return cred.user.getIdToken();
}

export async function firebaseGoogleLogin() {
  const a = getClientAuth();
  const cred = await signInWithPopup(a, new GoogleAuthProvider());
  return { idToken: await cred.user.getIdToken(), email: cred.user.email, name: cred.user.displayName };
}

const LINK_KEY = "slt_email_for_link";

// Passwordless email-link sign-in. Link returns to /login where it is completed.
export async function firebaseSendLoginLink(email) {
  const a = getClientAuth();
  await sendSignInLinkToEmail(a, email, { url: `${window.location.origin}/login`, handleCodeInApp: true });
  localStorage.setItem(LINK_KEY, email);
}

export function isLoginLinkHref(href = window.location.href) {
  if (!firebaseConfigured) return false;
  try { return isSignInWithEmailLink(getClientAuth(), href); } catch { return false; }
}

export async function firebaseCompleteLoginLink() {
  const a = getClientAuth();
  let email = localStorage.getItem(LINK_KEY) || "";
  if (!email) email = window.prompt("Confirm your email to finish signing in:") || "";
  if (!email) throw new Error("Email is required to complete sign-in.");
  const cred = await signInWithEmailLink(a, email, window.location.href);
  localStorage.removeItem(LINK_KEY);
  return cred.user.getIdToken();
}
