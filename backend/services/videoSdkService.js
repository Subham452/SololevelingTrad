import jwt from 'jsonwebtoken';
import env from '../config/env.js';

// ============================================================================
// VideoSDK service. The ONLY place that touches VideoSDK credentials.
//  - Signs short-lived HS256 JWTs (apikey + permissions + version 2).
//  - Wraps the documented REST endpoints (create/fetch/deactivate room).
//  - `fetchImpl` is injectable so automated tests can mock the network.
//  - Secrets never leave this module; nothing here is exposed to the client.
// ============================================================================

// Least-privilege permission sets (VideoSDK `permissions` claim).
export const PERMS = {
  host: ['allow_join', 'allow_mod'],
  participant: ['allow_join'],
  gated: ['ask_join'],
};

export function isConfigured() {
  return !!(env.VIDEOSDK_API_KEY && env.VIDEOSDK_SECRET_KEY);
}

// Sign a VideoSDK auth token. Never log the returned value.
export function generateToken({
  permissions = PERMS.participant,
  roomId,
  participantId,
  expiresIn = env.VIDEOSDK_TOKEN_TTL_SECONDS,
} = {}) {
  if (!isConfigured()) {
    const e = new Error('VideoSDK is not configured (missing API key/secret)');
    e.statusCode = 503;
    e.code = 'VIDEOSDK_NOT_CONFIGURED';
    throw e;
  }
  const payload = {
    apikey: env.VIDEOSDK_API_KEY,
    permissions,
    version: 2,
  };
  if (roomId) payload.roomId = roomId;
  if (participantId) payload.participantId = String(participantId);
  return jwt.sign(payload, env.VIDEOSDK_SECRET_KEY, { algorithm: 'HS256', expiresIn });
}

// Default transport. Tests replace this via setFetch().
let fetchImpl = globalThis.fetch;
export function setFetch(fn) { fetchImpl = fn; }
export function resetFetch() { fetchImpl = globalThis.fetch; }

// Low-level REST call. Token is passed WITHOUT any "Bearer"/"Basic" prefix,
// per the documented Authorization requirement.
async function call(method, path, body) {
  if (!isConfigured()) {
    const e = new Error('VideoSDK is not configured');
    e.statusCode = 503;
    e.code = 'VIDEOSDK_NOT_CONFIGURED';
    throw e;
  }
  const token = generateToken({ permissions: PERMS.host });
  const res = await fetchImpl(`${env.VIDEOSDK_API_BASE_URL}${path}`, {
    method,
    headers: { Authorization: token, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await res.json(); } catch { data = null; }
  if (!res.ok) {
    const e = new Error(data?.error?.message || data?.message || `VideoSDK ${method} ${path} failed (${res.status})`);
    e.statusCode = res.status >= 500 ? 502 : res.status;
    e.code = 'VIDEOSDK_ERROR';
    e.detail = data;
    throw e;
  }
  return data;
}

// POST /v2/rooms — create a unique meetingId.
export function createRoom({ customRoomId, webhook, autoCloseConfig, autoStartConfig } = {}) {
  const body = {};
  if (customRoomId) body.customRoomId = String(customRoomId);
  if (webhook) body.webhook = webhook;
  if (autoCloseConfig) body.autoCloseConfig = autoCloseConfig;
  if (autoStartConfig) body.autoStartConfig = autoStartConfig;
  return call('POST', '/v2/rooms', body);
}

// GET /v2/rooms — list rooms.
export function listRooms(page = 1, perPage = 20) {
  return call('GET', `/v2/rooms?page=${encodeURIComponent(page)}&perPage=${encodeURIComponent(perPage)}`);
}

// GET /v2/rooms/{roomId} — fetch one (also accepts customRoomId).
export function getRoom(roomId) {
  return call('GET', `/v2/rooms/${encodeURIComponent(roomId)}`);
}

// POST /v2/rooms/deactivate — permanently disable a roomId.
export function deactivateRoom(roomId) {
  return call('POST', '/v2/rooms/deactivate', { roomId });
}

export default {
  PERMS, isConfigured, generateToken, setFetch, resetFetch,
  createRoom, listRooms, getRoom, deactivateRoom,
};
