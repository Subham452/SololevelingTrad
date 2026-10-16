# Architecture

## Shape
MERN monorepo. `backend/` (Node 22, Express, ESM, Mongoose) + `src/` (React 19, Vite 8, Tailwind, React Router). Root scripts: `lint`, `build`. Backend scripts: `start`, `dev`, `test` (`node --test tests/*.test.js`), `indexes`.

## Request path
`server.js` → `helmet` → CORS (`CLIENT_URL` + `CORS_ORIGINS`) → **`express.raw` on `/api/webhooks`** (signature is over raw bytes, so it must precede `express.json`) → `express.json` 10kb → `mongo-sanitize` → `requestContext` (correlation id) → privacy-safe access log → `generalLimiter` → `routes/index.js` → `errorMiddleware` (sanitised in production, echoes `requestId`).

Routers mounted at `/api`: `auth`, `users`, `plans`, `payments`, `checkout`, `orders`, **`wallet`**, `webhooks`, `trading`, `admin`, `community`, `algo`, `analytics`, `notifications`, `activity`, `security`, `announcements`, `chat`, `video`, `ops`. Health: `/health`, `/health/live`, `/health/ready`.

## Layers
- **routes** — wiring only; validation via zod `validate()` middleware.
- **middleware** — `authenticate` (JWT access cookie, 15m), `requireRoles`/`requireAdmin`/`requireStaff`, `requirePerm()` (server-side permission matrix — the frontend comparison is cosmetic), rate limiters.
- **controllers** — thin; map service results to `ok()/AppError`.
- **services** — business rules. `walletService`, `whopService`, `checkoutService`, `planService`, `paymentService`, `subscriptionService`, `paperEngine`.
- **models** — money is always **integer minor units**; strings/enum lifecycles; compound indexes declared per schema.

## Money: three separated systems (deliberately not unified)
| System | Collections | Nature |
|---|---|---|
| Subscription payments | `Payment`, `Subscription`, `Plan`, `Purchase` | Entitlement for the five monthly tiers ($20/$30/$50/$100/$150) |
| Paper trading | `Balance`, `LedgerTxn` | **Simulated only** — labelled in UI, never real money |
| **Real wallet** | `WalletAccount`, `WalletLedger`, `WalletDeposit`, `WhopEvent` | Real funds; gated off by default (see `docs/WALLET.md`) |

Ordering rule: subscription payments, wallet deposits and trades are separate flows that never share a balance.

## Webhooks
`POST /api/webhooks/payment` (Razorpay/Stripe, legacy unified) and `POST /api/webhooks/whop` (Whop, Standard Webhooks). Both: raw-body signature verification → persisted provider event id with a unique constraint → idempotent handler → fast 2xx. See `docs/WHOP.md`.

## Auth
Firebase client SDK for the browser; the backend never accepts or verifies a password. UID comes only from a verified ID token. Access cookie 15m + rotating refresh 30d, both `HttpOnly SameSite=strict`. OTPs are HMAC-hashed with the `OTP_HASH_SECRET` pepper; OTP preview is `NODE_ENV !== 'production'`.

## Testing
- `tests/api.test.js`, `security.test.js`, `checkout.test.js` — no DB.
- `tests/whop.test.js` — signature/replay/gating/allow-list/secrets, no DB.
- `tests/wallet.test.js` — **real in-memory MongoDB** (unique constraints + atomic conditional updates). If the DB cannot start the file reports SKIPPED rather than passing silently.

## Operational notes
- `npm run indexes` → `scripts/ensureIndexes.js`: create-only, idempotent, never drops or touches data. Verified twice on a fresh database (27 models).
- No secrets in code or in any client payload; provider status endpoints report presence/mode only.
