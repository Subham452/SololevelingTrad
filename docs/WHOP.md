# Whop integration

Official `@whop/sdk@2.5.0`, server-side only. Everything Whop-related lives in `backend/services/whopService.js`; no endpoint, event name, SDK method or provider id is invented.

## Environment
| Key | Notes |
|---|---|
| `WHOP_COMPANY_API_KEY` | `apik_…`, server-side only |
| `WHOP_COMPANY_ID` | `biz_…` |
| `WHOP_WEBHOOK_SECRET` | `ws_…`, used verbatim (including the `ws_` prefix) |
| `WHOP_SANDBOX` | `true` by default; remove only for verified live mode |
| `APP_URL` | public origin, no trailing slash — builds the return URL |
| `WHOP_DEPOSIT_PRODUCT_ID` | `prod_…` for top-up checkout links (only if deposits are enabled) |
| `WHOP_DEPOSIT_PLAN_IDS` | `<cents>:<plan_…>,…` — checkout links created **in the merchant dashboard** |
| `WALLET_DEPOSITS_ENABLED` | `false` — see `docs/WALLET.md` |

Client bundles receive only `planId`, `environment`, `metadata.order_reference` and `returnUrl`.

## Dashboard setup (sandbox first)
1. Work in **sandbox.whop.com** while `WHOP_SANDBOX=true`.
2. Create the products/plans for the five subscription tiers and copy each variant id into the matching `Plan.providerPriceIds.whop` (plans are managed in the existing admin Pricing screen; prices are always resolved server-side).
3. Create one checkout link per top-up amount → list as `WHOP_DEPOSIT_PLAN_IDS`.
4. **Webhooks → add endpoint**: `APP_URL + /api/webhooks/whop`, subscribing to `payment.succeeded`, `payment.failed`, `payment.pending`, `payment.requires_action`, `refund.created`, `dispute.created`, `dispute.updated`.
5. Copy the signing secret into `WHOP_WEBHOOK_SECRET`.
6. API key permissions needed: `payment:basic:read`, `payment:manage`, `plan:create`, `access_pass:create`.
7. Test cards: `4242 … 4242` succeeds · `4000 0000 0000 0002` declines · `5385 3083 6013 5181` is 3DS.

CSP, if you enable it: `frame-src https://whop.com https://*.whop.com` and `connect-src https://*.whop.com`.

## Webhook verification (Standard Webhooks)
Headers `webhook-id`, `webhook-timestamp`, `webhook-signature: v1,<base64>`.
Signature = HMAC-SHA256 over `{webhook-id}.{webhook-timestamp}.{raw body}` keyed by the `ws_` secret, base64; timestamps older than 5 minutes are rejected.

Primary path is the official `unwrapWebhook` from `@whop/sdk/helpers`; a documented manual implementation (constant-time compare, 5-minute window) runs only if the SDK helper is unavailable. An unconfigured secret returns `503` — it never degrades to trusting the body.

Flow: verify → journal `WhopEvent` (unique `eventId` makes redelivery a no-op) → dispatch → 2xx fast. `payment.succeeded` maps to a local deposit via `metadata.order_reference` (attached at checkout, copied by Whop onto the payment and every event), then the exactly-once confirmation runs. An event we cannot map is parked as `unmatched` — never dropped, never credited blindly — and is reconciled on the next deposit poll.

Delivery is at-least-once with the same `webhook-id` on retries and no ordering guarantee; both are handled. Refunds (`refund.created`) and disputes are recorded; funds only move on an actual reversal, and refunds never silently revoke access.

## Return URL
Whop appends `payment` (`pay_…`) and `status`. The app **branches on it for display only** and always re-checks with the server, which either reads the signed webhook result or performs an authenticated `payments.retrieve` lookup.

## Sandbox / live status in this build
- Signature verification is proven: round-trip accepted, and tampered body, wrong secret, missing headers, swapped event id and both stale/future timestamps are rejected (`tests/whop.test.js`, 21 tests).
- **Not yet tested: an actual checkout or real money.** No Whop credentials, products or webhook endpoint exist in this environment, so no end-to-end payment has been run. Before claiming live readiness: configure the merchant account, create products, register the webhook, verify the signature end-to-end in sandbox, run the full test matrix there, then switch to live only after all `liveBlockers` from `GET /api/admin/wallet/config` are clear.
