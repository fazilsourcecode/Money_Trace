# MoneyTrace

**Follow every payment. Explain every discrepancy.**

MoneyTrace is a dual-experience demo built for the Razorpay AI Buildathon (Open track).

- **Aria storefront (customer):** an agent shops hands-free. You set a budget and must-haves, then watch it search, compare candidates, pick the best match (with a reason for every product it *didn't* pick), and pay — with a live coin animation over a real Razorpay test payment.
- **MoneyTrace console (merchant):** a financial control center that follows that same payment from capture → settlement → bank credit, reconciles it, and surfaces exactly what needs review — with evidence, confidence and an immutable audit trail.

The two sides share one localStorage ledger, so an order the agent places shows up live in the merchant console.

## Run it

```bash
npm install
npm run dev
# open http://localhost:3000
```

Sign in with the pre-filled demo credentials:

| Role     | Email                  | Password     |
|----------|------------------------|--------------|
| Shopper  | shopper@aria.store     | shop123      |
| Merchant | ops@ariacommerce.in    | merchant123  |

## Demo flow

1. **Sign in as Shopper.** Edit the request or the budget/rating/delivery/ANC controls.
2. Pick an outcome in the **Test lab** (clean payment, refund-after-reconcile, partial capture, delayed bank, duplicate webhook, failed-then-retried) and choose **Auto** or **Real Razorpay window**.
3. **Run the agent** and watch it work, then let it pay hands-free.
4. Open **Orders** to see your money's journey.
5. **Sign out, sign in as Merchant.** The order is already there — open it to trace the money, see why it reconciled (or didn't), and take action (introduce a refund, resolve after review).

## Payments

Auto-checkout creates a **real Razorpay test order** server-side and completes with a simulated, auto-filled capture surface (so the whole flow can run hands-free — the real hosted Razorpay modal is a locked iframe that can't be auto-filled). Flip the payment toggle to **Real Razorpay window** to open Razorpay's actual test checkout.

Add your Razorpay **test** keys to `.env.local` (see `.env.example`) to enable real test orders and the real modal. Without keys, the app still runs end to end using an offline test order.

## Stack

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind v4 · lucide-react. State lives in `localStorage`; scenario logic in `lib/scenarios.ts`, agent logic in `lib/agent.ts`.
