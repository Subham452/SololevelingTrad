# Wallet (real money)

Real-money wallet: deposits, an immutable ledger, transaction history, reconciliation and audited corrections. **Paper trading balances are a different, unrelated system** (`Balance`/`LedgerTxn`) and are never touched by anything here.

## ⚠️ Eligibility gate — deposits are OFF by default
`WALLET_DEPOSITS_ENABLED=false` (default). The `Add money` UI reports `NOT_APPROVED` with a plain-language reason instead of pretending to work.

Reason, from Whop's *Trust & Safety → What is not allowed* (docs.whop.com):
- **"Non-fiat currencies and digital assets"** — prohibited; covers selling crypto, NFTs, staking, cloud mining.
- **"Unregistered Financial Services"** — prohibited; covers escrow, payment facilitation and investment products without licensing.

Funding a stored-value wallet reads as payment facilitation, and the app's subject matter is digital assets. **Whop is therefore used for subscription checkout** (SaaS is an explicitly supported model), **not** for wallet top-ups.

Turn on real top-ups only when **all** are true:
1. Whop confirms support for this merchant + product in writing, **and**
2. money-services/licensing obligations are resolved for the deployment's jurisdictions, **and**
3. `WHOP_*` credentials, a checkout link per amount and a verified webhook exist, **and**
4. `WALLET_DEPOSITS_ENABLED=true` is set deliberately.

Crypto trading remains **simulated/paper and clearly labelled**; wallet funds are never wired to trading.

## Data model (integer minor units only)
- **`WalletAccount`** — projection: `availableMinor`, `pendingMinor`, `lifetimeDepositsMinor`, `lifetimeWithdrawalsMinor`, `discrepancyAt/Note`. Unique `(userId, currency)`. Mutated only by atomic `$inc`.
- **`WalletLedger`** — append-only. `type`, `direction`, `amountMinor`, `deltaAvailableMinor`, `deltaPendingMinor`, `availableAfterMinor`, `pendingAfterMinor`, **unique `idemKey`**, `reference`. Rows are never updated or deleted; refunds are *new* rows.
- **`WalletDeposit`** — one attempt: `reference` (unique), `idempotencyKey` (unique per user), `amountMinor`, `status`, `providerPlanId`, `providerPaymentId`, `expiresAt`. Status: `pending → paid | failed | expired | refunded`.
- **`WhopEvent`** — event journal; **unique `eventId`**; `processed | failed | unmatched | ignored`.

**Invariant** (checked by `reconcileAccount`): replaying every ledger row's deltas must equal the projection.

## Money rules (`services/walletService.js`)
1. No float math — integer cents everywhere.
2. Balances move only via atomic `$inc`; debits are guarded by `availableMinor: { $gte }` so concurrent spends cannot overspend or go negative.
3. **Exactly-once** = conditional status claim on the deposit **+** unique ledger `idemKey`, with an explicit compensating rollback on the loser of a race.
4. `pending` is never spendable; only a verified confirmation moves it to `available`.
5. Corrections are new `adjustment` rows requiring a reason (10+ chars) and, for credits, an evidence reference — plus an `AuditLog` row.

## What counts as proof of payment
- ✅ signature-verified Whop webhook (primary)
- ✅ authenticated server-to-server `payments.retrieve` (`POST /wallet/deposits/:ref/verify`), which must be `paid`, match our `order_reference` metadata and match the amount
- ❌ the return URL's `?payment=&status=…` — **display only**, never fulfilment
- ❌ anything the browser submits

## API
| Method | Route | Notes |
|---|---|---|
| GET | `/api/wallet` | summary: available, pending, totals, limits, availability |
| GET | `/api/wallet/config` | presets + provider presence/mode (no secrets) |
| GET | `/api/wallet/transactions` | search `q`, filters `type/status/provider/from/to`, `page/limit` (max 100) |
| GET | `/api/wallet/transactions/:id` | ownership-scoped |
| POST | `/api/wallet/deposits` | `{amountMinor, idempotencyKey?}` — preset allow-list only |
| GET | `/api/wallet/deposits/:reference` | polling; also reconciles late events |
| POST | `/api/wallet/deposits/:reference/verify` | server-side confirmation |

Writes are rate-limited (`walletWriteLimiter`, 20/15min); reads 400/15min. Every route requires auth and is scoped to `req.user.sub`.

Admin (all behind `authenticate + requireStaff + adminLimiter` **and** `requirePerm`): `GET /api/admin/wallet/{overview,config,deposits,transactions,accounts,reconciliation,webhooks}`, `GET .../accounts/:userId/reconcile`, `POST .../deposits/:reference/refund` (`finance:wallet_refund`), `POST /api/admin/wallet/adjustments` (`wallet:adjust`, superadmin only).

**There is deliberately no "mark as paid" endpoint.** An admin cannot credit funds that were never received.

## Frontend
- `/wallet` — real funds (available, pending, totals, limits, availability, recent txns, Add money) **and** the paper trading wallet, visually separated with `Real funds` / `Paper` badges.
- `/wallet/add` — preset picker → Whop hosted checkout → poll for confirmation. Honest `unavailable` state.
- `/wallet/transactions` — search, type/status filters, date range, pagination; `?deposit=REF` opens one deposit.
- `/admin/wallet` — overview + alerts + reconciliation, deposits, ledger, webhook deliveries, audited refund/adjustment.

## Verified in this environment
`tests/wallet.test.js` — 19 tests against a **real in-memory MongoDB**: pending≠available, idempotent creation, exactly-once sequential and concurrent confirmation, unique `idemKey` rejection, amount-mismatch hold, expiry, **10 concurrent debits cannot overspend**, single-intent spend, no negative balance under any correction, refund idempotency + history preservation, refund blocked after funds spent, cross-user isolation, summary isolation, reconciliation catching injected drift, adjustment reason/evidence/audit, unique event id.
