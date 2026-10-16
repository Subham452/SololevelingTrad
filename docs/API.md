# API
Base `/api`. Responses `{success,message,data}` / `{success:false,message,code,errors}`. Paginate `?page&limit` (default 20, max 100). Status codes 200/201/400/401/403/404/409/422/429/500.

- GET /api/health
- Auth: POST /register /verify-email /resend-otp /login /session /google /refresh /logout /logout-all /forgot-password /reset-password; GET /me
- Users: GET/PATCH/DELETE /users/me (+/activity /sessions /purchases /subscription /notifications, PATCH /notifications/:id/read)
- Subscriptions: GET /plans /current; POST / (plan,paymentId) /cancel /change
- Payments: POST /create (server-side price) /verify; GET /history /:id
- Webhooks: POST /webhooks/payment?provider=razorpay|stripe (raw body, HMAC verified, idempotent via webhookEventId)
- Admin (auth+admin): /dashboard /stats /users CRUD /users/:id/moderate /users/:id/role /activity /audit-logs /payments /subscriptions /revenue /analytics /notifications/send
- Chat: GET/POST /chat/sessions, GET /chat/sessions/:id, POST /chat/sessions/:id/messages (plan limit enforced, Usage tracked)
