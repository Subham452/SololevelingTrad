// Admin Control Center API client. Every call goes through the shared `api`
// fetch wrapper (token refresh, JSON handling, offline detection) — no mock
// data paths exist here on purpose.
import { api } from "./api.js";

const qs = (params = {}) => {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === "") continue;
    u.set(k, v);
  }
  const s = u.toString();
  return s ? `?${s}` : "";
};

export const adminApi = {
  // --- Real-money wallet ----------------------------------------------------
  // Overview: deposits, reconciliation, webhook health, provider mode, alerts.
  walletOverview: () => api.get("/admin/wallet/overview"),
  walletConfig: () => api.get("/admin/wallet/config"),
  walletDeposits: (p = {}) => api.get(`/admin/wallet/deposits${qs(p)}`),
  walletTransactions: (p = {}) => api.get(`/admin/wallet/transactions${qs(p)}`),
  walletAccounts: (p = {}) => api.get(`/admin/wallet/accounts${qs(p)}`),
  walletReconcile: () => api.get("/admin/wallet/reconciliation"),
  walletReconcileOne: (userId) => api.get(`/admin/wallet/accounts/${userId}/reconcile`),
  walletWebhooks: (p = {}) => api.get(`/admin/wallet/webhooks${qs(p)}`),
  // Audited refund: provider-side refund FIRST, then a reversal ledger entry.
  walletRefund: (reference, reason) => api.post(`/admin/wallet/deposits/${encodeURIComponent(reference)}/refund`, { reason }),
  // Superadmin-only correction. Credits require an evidence reference.
  walletAdjust: (payload) => api.post("/admin/wallet/adjustments", payload),

  // Pricing & Plans management
  plans: (p = {}) => api.get(`/admin/plans${qs(p)}`),
  createPlan: (payload) => api.post("/admin/plans", payload),
  updatePlan: (id, patch) => api.patch(`/admin/plans/${id}`, patch),
  setPlanStatus: (id, status) => api.patch(`/admin/plans/${id}/status`, { status }),
  reorderPlans: (plans) => api.post("/admin/plans/reorder", { plans }),
  planImpact: (id) => api.get(`/admin/plans/${id}/impact`),
  planAudit: (p = {}) => api.get(`/admin/plans/audit${qs(p)}`),
  planPreview: (plans) => api.post("/admin/plans/preview", plans ? { plans } : {}),

  // Executive dashboard
  overview: (p = {}) => api.get(`/admin/overview${qs(p)}`),

  // Users
  users: (p = {}) => api.get(`/admin/users${qs(p)}`),
  user: (id) => api.get(`/admin/users/${id}`),
  updateUser: (id, patch) => api.patch(`/admin/users/${id}`, patch),
  moderate: (id, status, reason) => api.post(`/admin/users/${id}/moderate`, { status, reason }),
  setRole: (id, role) => api.post(`/admin/users/${id}/role`, { role }),
  action: (id, action, body = {}) => api.post(`/admin/users/${id}/${action}`, body),
  deleteUser: (id) => api.del(`/admin/users/${id}`),

  // Transactions / refunds
  transactions: (p = {}) => api.get(`/admin/transactions${qs(p)}`),
  refund: (paymentId, reason) => api.post(`/admin/payments/${paymentId}/refund`, { reason }),

  // Subscriptions & revenue
  subscriptions: (p = {}) => api.get(`/admin/subscriptions${qs(p)}`),
  subscriptionStats: (p = {}) => api.get(`/admin/subscriptions/analytics${qs(p)}`),
  revenue: () => api.get("/admin/revenue"),
  analytics: () => api.get("/admin/analytics"),

  // Activity / audit
  activity: (p = {}) => api.get(`/admin/activity${qs(p)}`),
  audit: (p = {}) => api.get(`/admin/audit-logs${qs(p)}`),

  // Security
  security: (p = {}) => api.get(`/admin/security${qs(p)}`),
  health: () => api.get("/admin/health"),

  // Messaging (support inbox)
  conversations: (p = {}) => api.get(`/admin/messages/conversations${qs(p)}`),
  thread: (conversationId, p = {}) => api.get(`/admin/messages/conversations/${conversationId}${qs(p)}`),
  sendMessage: (payload) => api.post("/admin/messages/send", payload),

  // Calls & live sessions
  calls: (p = {}) => api.get(`/admin/calls${qs(p)}`),
  callInvite: (userId, type = "video") => api.post("/admin/calls/invite", { userId, type }),
  lives: (p = {}) => api.get(`/admin/lives${qs(p)}`),
  endLive: (liveId, reason) => api.post(`/admin/lives/${liveId}/end`, { reason }),

  // Moderation
  reports: (p = {}) => api.get(`/admin/moderation/reports${qs(p)}`),
  resolveReport: (reportId, status, actionTaken) =>
    api.post(`/admin/moderation/reports/${reportId}`, { status, actionTaken }),
  hideMessage: (messageId, reason) => api.post(`/admin/moderation/messages/${messageId}/hide`, { reason }),

  // Notifications & legacy
  sendNotification: (payload) => api.post("/admin/notifications/send", payload),
  dashboard: () => api.get("/admin/dashboard"),
};
