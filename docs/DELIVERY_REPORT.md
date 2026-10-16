# Delivery report — Whop-integrated wallet, billing & hardening

Date: 2026-10-15 · Repo: `SololevelingTrad` (MERN) · **Not a git repository — nothing is version-controlled (see Rollback).**

## 1. Summary

Delivered a Whop-integrated subscription checkout path, a real-money wallet with an immutable ledger and reconciliation, an admin wallet operations surface, and the earlier audit/optimization/hardening pass.

**One deliberate constraint:** real wallet top-ups ship **gated OFF by default** (`WALLET_DEPOSITS_ENABLED=false`). Whop's published policy prohibits *"Non-fiat currencies and digital assets"* and *"Unregistered Financial Services"* (escrow, payment facilitation) — which reads as covering funded stored-value balances. SaaS subscriptions are an explicitly supported model, so **Whop powers subscription checkout; deposits require written provider approval plus licensing before they may be enabled.** Crypto trading stays simulated and clearly labelled. Everything needed to turn deposits on safely is built, tested and waiting behind that flag.

## 2. Whop policy findings (the basis for the gate)

| Source | Finding |
|---|---|
| `trust-safety-overview/what-is-not-allowed-on-whop` | **"Non-fiat currencies and digital assets"** prohibited — selling crypto/NFTs/staking/cloud mining. |
| same | **"Unregistered Financial Services"** prohibited — escrow, payment facilitation, investment products without licensing. |
| same / `developer/guides/accept-payments` | **SaaS** is a supported business model → subscription checkout is in scope. |
| `developer/guides/webhooks` | Standard Webhooks (`webhook-id/timestamp/signature`), `unwrapWebhook`, 5-min replay window, at-least-once with retries ~71h. |
| `developer/guides/embed-checkout` | Element prices from the server-chosen variant and copies `metadata` to the payment **and every webhook** → the reconciliation key. |

## 3. Files changed

**Backend — added (13):** `models/WalletAccount.js`, `models/WalletLedger.js`, `models/WalletDeposit.js`, `models/WhopEvent.js`, `services/whopService.js`, `services/walletService.js`, `controllers/walletController.js`, `controllers/whopWebhookController.js`, `controllers/adminWalletController.js`, `routes/walletRoutes.js`, `validators/walletValidator.js`, `tests/whop.test.js`, `tests/wallet.test.js`

**Backend — modified (10):** `config/env.js` (Whop + wallet keys, gate), `.env.example`, `routes/index.js` (+`/wallet`), `routes/webhookRoutes.js` (+`POST /whop`), `routes/adminRoutes.js` (+11 wallet routes), `middleware/rateLimitMiddleware.js` (`walletWriteLimiter` 20, `walletReadLimiter` 400), `middleware/permissions.js` (`finance:wallet_refund`, `wallet:adjust`), `scripts/ensureIndexes.js` (+4 collections), `package.json`, `package-lock.json`

**Frontend — added (4):** `src/lib/wallet.js`, `src/lib/whop.js`, `src/pages/wallet/Transactions.jsx`, `src/pages/wallet/AddMoney.jsx`, `src/pages/admin/Wallet.jsx`

**Frontend — modified (5):** `src/pages/Wallet.jsx` (rewritten: real funds + paper, separated), `src/App.jsx` (+3 routes), `src/lib/admin.js` (+10 admin wallet calls), `src/layouts/AdminLayout.jsx` (+nav entry), `src/layouts/DashboardLayout.jsx` (corrected subtitles)

**Docs — added (4):** `docs/ARCHITECTURE.md`, `docs/WALLET.md`, `docs/WHOP.md`, `docs/DELIVERY_REPORT.md`

## 4. Required environment

```bash
# Whop (server-side only)
WHOP_COMPANY_API_KEY=apik_…        # sandbox key first
WHOP_COMPANY_ID=biz_…
WHOP_WEBHOOK_SECRET=ws_…           # verbatim, incl. the ws_ prefix
WHOP_SANDBOX=true                  # remove only for verified live mode
APP_URL=https://your-domain        # no trailing slash; builds the return URL

# Real wallet — stays false until provider approval + licensing
WALLET_DEPOSITS_ENABLED=false
WALLET_CURRENCY=USD
WALLET_MIN_DEPOSIT_CENTS=500
WALLET_MAX_DEPOSIT_CENTS=50000
WALLET_DEPOSIT_EXPIRY_MINUTES=30

# Only once deposits are approved
WHOP_DEPOSIT_PRODUCT_ID=prod_…
WHOP_DEPOSIT_PLAN_IDS=2500:plan_…,5000:plan_…,10000:plan_…
```

Nothing new is required for **subscription** checkout beyond the `WHOP_*` block and per-plan variant ids.

## 5. Whop dashboard & webhook setup

1. Work in **sandbox.whop.com** while `WHOP_SANDBOX=true`.
2. Create the five tier plans; put each variant id in the plan's `providerPriceIds.whop` (admin Pricing screen; prices always resolved server-side).
3. Create one checkout link per top-up amount → `WHOP_DEPOSIT_PLAN_IDS`.
4. **Webhooks → endpoint** `https://<APP_URL>/api/webhooks/whop`, subscribing to `payment.succeeded`, `payment.failed`, `payment.pending`, `payment.requires_action`, `refund.created`, `dispute.created`, `dispute.updated`.
5. Copy the signing secret to `WHOP_WEBHOOK_SECRET`.
6. Key permissions: `payment:basic:read`, `payment:manage`, `plan:create`, `access_pass:create`.
7. Test cards: `4242…4242` succeeds · `4000 0000 0000 0002` declines · `5385 3083 6013 5181` is 3DS.

Details: `docs/WHOP.md`. CSP if enabled: `frame-src https://whop.com https://*.whop.com`, `connect-src https://*.whop.com`.

## 6. Security & correctness work

**Prior pass:** OTP pepper (HMAC + `OTP_HASH_SECRET`); OTP preview production-gated; entitlement-escalation fix (`authorisePaidActivation`/`paymentMatchesPlan`); admin role-escalation + `extend` fix; subscription-expiry enforcement; `seedAdmin.js` backdoor removed (needs `ADMIN_PASSWORD`≥12); production secret fail-fast + narrow CORS; `CORS_ORIGINS`; correlation-id request context; liveness vs readiness split; privacy-safe access log replacing `morgan`'s default output; bounded concurrency + 15s pricing cache; deduped plan resolution.

**This pass:**
- Whop secrets live only in `services/whopService.js`; client payload is `planId`/`environment`/`metadata`/`returnUrl` only — asserted by test.
- Webhook: raw body, official `unwrapWebhook`, 5-minute replay window, `401` on anything invalid, **503 if the secret is unset rather than trusting the body**, unique `eventId`, status-claim exactly-once.
- Deposits: server-side preset allow-list (the browser cannot name a price), gated by eligibility flag.
- Verification binds provider payment → deposit by `metadata.order_reference` **and** amount before crediting.
- Refunds: provider refund **first**, then an explicit reversal row (never `DELETE`/`UPDATE` on history).
- Admin: `requirePerm` on every wallet route; superadmin-only adjustment requiring reason + evidence for credits; **no "mark as paid" capability exists at all**.
- Rate limits on deposit creation (20/15min).

## 7. Indexes & migrations

`npm run indexes` (`scripts/ensureIndexes.js`) is **create-only, never drops, touches no documents**. Added: `WalletAccount (userId,currency)` unique · `WalletLedger idemKey` unique+sparse · `(userId,createdAt)`, `reference` · `WalletDeposit reference` unique · `(userId,idempotencyKey)` unique+sparse · `(status,createdAt)`, `(status,expiresAt)` · `WhopEvent eventId` unique · `(provider,status,createdAt)`.

**Verified:** run twice against a fresh database → `exit=0` both times, `Index definitions ensured for 27 models (no data modified).`

## 8. Tests actually run

| Command | Result |
|---|---|
| `npm test` (backend) | **64/64 pass, 0 fail, 0 skipped** (was 15 → 24 before this phase) |
| `npm run lint` (root) | **exit 0, 0 errors**, 57 warnings (pre-existing `set-state-in-effect` style; none are errors) |
| `npm run build` (root) | **success in 10.9–11.8s** (baseline ~11s) |
| route import smoke | `ROUTES_IMPORT_OK`, no Mongoose index warnings |
| `scripts/ensureIndexes.js` ×2 | `exit=0` both runs, no data modified |

New coverage (40 tests):
- **`tests/whop.test.js` (21, no DB):** valid signature accepted *by the official SDK helper*; tampered body, wrong secret, missing headers, swapped `webhook-id`, and both past **and** future timestamps rejected; unconfigured secret refuses; gate reports `NOT_APPROVED` and `createDeposit` fails *before any DB write*; `NOT_CONFIGURED` when enabled but unconfigured; preset allow-list (unlisted / non-integer / out-of-range refused); client payload contains no `apik_`, `ws_` or env secret; provider status leaks no secret; conservative payment interpretation; unrecognised payment id never queried.
- **`tests/wallet.test.js` (19, real in-memory MongoDB):** pending ≠ available; idempotent creation (no double hold); browser cannot choose its own amount; exactly-once sequential confirmation; **concurrent confirmations credit exactly once**; DB itself rejects a duplicate `idemKey`; amount mismatch held not credited; expiry idempotent; **10 concurrent debits vs a 5000 balance → exactly 5 succeed, never negative**; one intent spends once under 5-way race; overspend refused with unchanged balance; correction cannot go negative; refund writes a new row and is idemponent + audited; refund blocked after funds spent (stays `paid`); cross-user deposit/ledger/history isolation; summary isolation; reconciliation detects injected drift and flags the account; adjustment reason/evidence/audit enforcement; unique event id.

**The suite found a real bug** (`debitAvailable` classified `AppError(LEDGER_DUPLICATE)` as a failure instead of a duplicate because `appendLedger` translates E11000); fixed via a shared `isLedgerDuplicate()` predicate applied to all four sites, then re-verified green.

## 9. Before / after

| Metric | Before | After |
|---|---|---|
| Backend tests | 15 → 24 | **64 pass, 0 skipped** |
| Lint | exit 0, warnings only | exit 0, **0 errors**, 57 warnings |
| Build | success ~11s | success **10.9–11.8s** |
| Index migration | 27 models | **27 models (+4 wallet collections)**, rerunnable, verified ×2 |

New async chunks (kept out of the main bundle): `AddMoney` ≈10.0 kB, `Wallet` (user) 11.07 kB, `Wallet` (admin) 15.90 kB, `Transactions` ≈8.0 kB.

## 10. Sandbox results — what is and is not proven

**Proven here:** signature verification round-trip and every rejection path; exactly-once/no-overspend/no-negative/isolation/reconciliation against a **real** MongoDB; migration rerunnability; lint/build/test green.

**NOT proven (no credentials in this environment):**
- ❌ No actual Whop checkout, no sandbox payment, no end-to-end webhook from Whop's servers. **No claim is made that real payments work.**
- ❌ No production/Atlas MongoDB → no index migration against production data, no load or query-timing measurements.
- ❌ Whop dashboard steps (§5) are written, not executed.

## 11. Live-mode blockers

1. Whop's **written approval** for stored-value top-ups on this merchant + product (policy in §2).
2. Money-services/licensing review for the deployment's jurisdictions.
3. Real merchant account, products/variants, and checkout links created.
4. Webhook endpoint registered and **verified end-to-end in sandbox**.
5. `WHOP_SANDBOX` removed and `WALLET_DEPOSITS_ENABLED=true` set deliberately.
6. All `liveBlockers` from `GET /api/admin/wallet/config` clear.

Subscription checkout (SaaS) is **not** blocked by items 1–2.

## 12. Deploy & rollback

**Deploy:** `npm ci` (root + `backend`) → set env (§4) → `npm run indexes` (safe to re-run) → `npm run build` → restart. Keep `WALLET_DEPOSITS_ENABLED=false` and `WHOP_SANDBOX=true` initially. Note: `mongodb-memory-server` is a **devDependency** only — no production runtime impact.

**Rollback:** ⚠️ **the repository is not under version control, so there is no `git revert`.** Rollback requires a prior artifact/backup. Practical mitigations: the new collections are strictly additive (removing the `/wallet` routes leaves existing flows untouched); nothing existing was deleted or rewritten. **Recommendation: initialize a git repository and commit before deploying.**

## 13. Risks & open items

- **Repo not versioned** (highest operational risk) — see Rollback.
- **JWT roles are not re-read from the DB until the 15m access token expires** — a just-revoked admin keeps access up to 15m. Consider a server-side role check on privileged routes.
- **Non-atomic `Purchase`/`totalSpent` creation** under concurrent verify+webhook (pre-existing, narrow window).
- **`morgan` is still an unused dependency** (kept to avoid lockfile churn; it no longer runs).
- **Frontend `set-state-in-effect` warnings** follow the existing codebase pattern; not addressed.
- **Whop Elements is loaded from the documented CDN** rather than `@whop/elements-react` (keeps Whop out of the main bundle, mirrors the existing `loadRazorpay` pattern; React 19 peer compatibility was not verified). Swappable — see `src/lib/whop.js`.
- **No withdrawal flow** exists (surfaced honestly as "not available"); it must not be added before the same provider/licensing review.

## 14. Re-run this verification

```bash
cd backend && npm test          # 64/64, 0 skipped
cd .. && npm run lint           # exit 0
npm run build                   # success
cd backend && npm run indexes   # rerunnable, no data modified
```
