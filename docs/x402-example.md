# x402 Payment — Example Walkthrough

## What is x402?

x402 is an HTTP-layer micropayment standard that lets an API endpoint
respond with `HTTP 402 Payment Required` and a machine-readable payment
descriptor. The client pays (typically a small stablecoin amount) and
retries — the endpoint then fulfills the request.

Binance Skills Hub supports x402 for premium signal endpoints; this
document walks through how Aether would handle such a payment end-to-end
while keeping the trust boundary intact.

## The flow

```
Orchestrating Agent                Aether Engine             Binance Skills Hub
       |                                 |                           |
       | 1. Discovers premium signal URL  |                           |
       | (e.g. via Skills Hub catalog)    |                           |
       |                                 |                           |
       | 2. Calls proposePayment({...})   |                           |
       |    ─────────────────────────────>|                           |
       |    engine creates PendingAction  |                           |
       |    in audit log (status:pending) |                           |
       |<─────────────────────────────────|                           |
       |                                 |                           |
       | 3. Shows PendingAction summary   |                           |
       |    to USER verbatim             |                           |
       |                                 |                           |
       | 4. USER confirms                 |                           |
       |    ─────────────────────────────>|                           |
       |    confirmPayment(id) returns    |                           |
       |    PaymentInstruction           |                           |
       |<─────────────────────────────────|                           |
       |                                 |                           |
       | 5. Agent reads instruction,      |                           |
       |    builds X-PAYMENT header from  |                           |
       |    Agentic Wallet balance and    |                           |
       |    calls the Skills Hub endpoint ────────────────────────────>
       |                                 |                           |
       | 6. Endpoint returns signal JSON  <────────────────────────────
       |                                 |                           |
       | 7. Agent passes signal into      |                           |
       |    StrategyInput and calls score |                           |
       |    ─────────────────────────────>|                           |
```

## Code example

```typescript
import { proposePayment, confirmPayment } from "./src/execution/x402Payment";

// Step 2: agent calls this after discovering the endpoint requires payment
const pending = proposePayment({
  signalDescription: "Premium momentum signal for BTC/ETH pairs (1h resolution)",
  endpoint: "https://skills.binance.com/premium/momentum-signal",
  currency: "USDC",
  amountUsd: 0.5,
  targetStrategy: "momentum",
});

// ↑ This creates a PendingAction in data/pending_actions.json.
//   The agent shows pending.summary to the USER and waits for approval.
//   It is a DEMO / PAPER action unless an explicit live PaymentContext is provided.

// Step 4: after user confirms in the dashboard, the agent retrieves the instruction:
// (Run `aether instruction --id <action-id>` or via local API)
// instruction.route === "x402"
// instruction.endpoint === "https://skills.binance.com/premium/momentum-signal"
// instruction.amountUsd === 0.50

// Step 5: agent uses instruction to build the actual HTTP call:
// fetch(instruction.endpoint, {
//   headers: {
//     "X-PAYMENT": buildPaymentHeader(agenticWalletBalance, instruction),
//   },
// })
```

## Trust boundary

- `proposePayment` and `confirmPayment` are in `src/execution/` and
  have **zero network access** — they manipulate `pending_actions.json`
  exactly like a trade would.
- The action carries the real Agent OS context and cannot be confirmed if it
  has been migrated to demo/paper or lacks that provenance.
- The actual HTTP call is made by the orchestrating agent after reading
  the `PaymentInstruction`.
- The payment appears in the full audit log like any other confirmed
  action, satisfying the audit trail requirement.

## Canned demo path

Because no real x402 call is made, this works fully offline as a `DEMO / PAPER` action.
The dashboard will allow you to inspect the proposal, but will block confirmation.
In a live session with an Agent OS Wallet, the proposal requires a fresh wallet attestation
(a `PaymentContext`) before it can become a `LIVE AGENT OS WALLET / SKILLS` action
that is eligible for confirmation.
