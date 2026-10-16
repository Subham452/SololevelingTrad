import { api } from "./api.js";

// Calls / Rooms / Live API client. All identity comes from the verified JWT —
// never send userId/role/host fields; the server derives them.
export const callApi = {
  start: (conversationId, type = "video") => api.post("/calls", { conversationId, type }),
  accept: (callId) => api.post(`/calls/${callId}/accept`, {}),
  reject: (callId) => api.post(`/calls/${callId}/reject`, {}),
  cancel: (callId) => api.post(`/calls/${callId}/cancel`, {}),
  end: (callId) => api.post(`/calls/${callId}/end`, {}),
  token: (callId) => api.get(`/calls/${callId}/token`),
  get: (callId) => api.get(`/calls/${callId}`),
  history: (limit = 30) => api.get(`/calls/history?limit=${limit}`),
};

export const roomApi = {
  list: (scope = "mine", q) => api.get(`/rooms?scope=${scope}${q ? `&q=${encodeURIComponent(q)}` : ""}`),
  create: (body) => api.post("/rooms", body),
  get: (roomId) => api.get(`/rooms/${roomId}`),
  update: (roomId, body) => api.patch(`/rooms/${roomId}`, body),
  remove: (roomId) => api.del(`/rooms/${roomId}`),
  join: (roomId, password) => api.post(`/rooms/${roomId}/join`, { password }),
  leave: (roomId) => api.post(`/rooms/${roomId}/leave`, {}),
  end: (roomId) => api.post(`/rooms/${roomId}/end`, {}),
  participants: (roomId) => api.get(`/rooms/${roomId}/participants`),
  invite: (roomId, body) => api.post(`/rooms/${roomId}/invitations`, body || {}),
  joinRequests: (roomId) => api.get(`/rooms/${roomId}/join-requests`),
  approve: (roomId, requestId) => api.post(`/rooms/${roomId}/join-requests/${requestId}/approve`, {}),
  reject: (roomId, requestId) => api.post(`/rooms/${roomId}/join-requests/${requestId}/reject`, {}),
  joinByToken: (token) => api.post(`/rooms/join/${token}`, {}),
};

export const liveApi = {
  list: (scope = "live", { q, category } = {}) =>
    api.get(`/live?scope=${scope}${q ? `&q=${encodeURIComponent(q)}` : ""}${category ? `&category=${encodeURIComponent(category)}` : ""}`),
  create: (body) => api.post("/live", body),
  get: (liveId) => api.get(`/live/${liveId}`),
  update: (liveId, body) => api.patch(`/live/${liveId}`, body),
  start: (liveId) => api.post(`/live/${liveId}/start`, {}),
  end: (liveId) => api.post(`/live/${liveId}/end`, {}),
  join: (liveId) => api.post(`/live/${liveId}/join`, {}),
  leave: (liveId) => api.post(`/live/${liveId}/leave`, {}),
  cancel: (liveId) => api.del(`/live/${liveId}`),
  chat: (liveId, before) => api.get(`/live/${liveId}/chat${before ? `?before=${encodeURIComponent(before)}` : ""}`),
  sendChat: (liveId, body) => api.post(`/live/${liveId}/chat`, body),
  moderate: (liveId, body) => api.post(`/live/${liveId}/moderation`, body),
  follow: (liveId) => api.post(`/live/${liveId}/follow`, {}),
};
