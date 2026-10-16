import { api } from "./api.js";

export const tradingApi = {
  pairs: () => api.get("/trading/pairs"),
  place: (body) => api.post("/trading/orders", body),
  orders: (params = "") => api.get(`/trading/orders${params}`),
  order: (id) => api.get(`/trading/orders/${id}`),
  cancel: (id) => api.del(`/trading/orders/${id}`),
  trades: (params = "") => api.get(`/trading/trades${params}`),
  book: (pair) => api.get(`/trading/orderbook/${encodeURIComponent(pair)}`),
  recentTrades: (pair) => api.get(`/trading/recent-trades/${encodeURIComponent(pair)}`),
  wallet: () => api.get("/trading/wallet"),
  txns: (params = "") => api.get(`/trading/wallet/transactions${params}`),
  portfolio: () => api.get("/trading/portfolio"),
  portfolioHistory: () => api.get("/trading/portfolio/history"),
};
