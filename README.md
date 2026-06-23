# Rho Protocol

**The first interest rate swap protocol for Bitcoin PoX yield on Stacks.**

Bitcoin miners pay real BTC to STX stackers every two weeks through Proof of Transfer (PoX). The rate changes every cycle. Nobody can plan around it. Rho fixes that — it lets you lock in a fixed BTC yield rate while counterparties take the variable side, all settled automatically on-chain with no middleman.

---

## The Problem

Stacks' Proof of Transfer (PoX) is unique in all of crypto: Bitcoin miners literally pay BTC to STX stackers as the cost of mining. Over $500M has been paid out this way. The yield is real, on-chain, and Bitcoin-native.

But the rate changes every 2-week cycle depending on how many miners are competing. One cycle you earn 4%. Next cycle 2.5%. The cycle after that, 3.8%. You never know what you're going to earn.

For individuals, this is inconvenient. For institutions locking large amounts of BTC in Stacks' new PoX-5 program, it's a dealbreaker — they can't commit capital without rate certainty.

There is currently no product on any Bitcoin L2 that solves this.

---

## The Solution

Rho is an interest rate swap protocol. Two parties agree on terms and a smart contract enforces everything automatically.

**Fixed side (the hedger):**
You have STX stacked and want to know exactly what you'll earn. You post a swap offer: "I want 3.5% BTC yield for the next 6 months." You lock sBTC as collateral. Every 2 weeks, you receive exactly 3.5% — regardless of what the actual PoX rate does.

**Variable side (the speculator):**
You believe PoX rates are rising. You accept the offer, lock your sBTC collateral, and collect the actual on-chain PoX rate every cycle. If the real rate is 5%, you keep the 1.5% difference. If it drops to 2%, you cover the 1.5% gap from your collateral.

Every PoX cycle, anyone can call `settle-cycle`. The contract reads the on-chain rate from the oracle, calculates who owes what, and moves sBTC between collateral balances automatically.

---

## How the Rate Is Calculated

The PoX yield rate is derived from two numbers that live on-chain:

1. **Total STX stacked that cycle** — readable directly from the Stacks PoX-4 contract (`SP000000000000000000002Q6VF78.pox-4`) with no external dependency
2. **Total BTC paid by miners that cycle** — actual Bitcoin transactions recorded on the Bitcoin blockchain, which Stacks can read natively through Clarity's built-in Bitcoin oracle

**Rate formula:**
```
rate = (btc_paid_sats × 1_000_000) ÷ total_ustx_stacked
```

Expressed as: satoshis earned per 1,000,000 uSTX stacked per cycle.

**POC oracle approach:** In Phase 1, an admin submits the BTC amount paid each cycle. The contract reads STX stacked directly from PoX-4 and calculates the rate itself. Phase 2 replaces admin submission with Bitcoin transaction proof verification using Clarity's `get-burn-block-info?`.

**Why no external oracle:** Pendle Boros (the Ethereum equivalent) relies on Chainlink to report the rate. If Chainlink fails or reports wrong data, settlements are wrong. Rho reads from the blockchain itself. Nothing can be manipulated.

---

## Architecture

### Contracts

```
contracts/
├── sip-010-trait.clar       Standard SIP-010 fungible token interface
├── mock-sbtc.clar           Testnet-only mock sBTC (free mint, same interface as real sBTC)
├── pox-rate-oracle.clar     Stores verified PoX yield rates per cycle
└── rho-core.clar            Core swap protocol
```

### `pox-rate-oracle.clar`

Stores the BTC yield rate for each completed PoX cycle. Reads total STX stacked directly from the Stacks PoX-4 contract. Admin submits BTC amount paid per cycle (Phase 1). Anyone can read historical rates.

Key functions:
- `submit-cycle-rate (cycle uint) (btc-reward-sats uint)` — admin submits BTC paid for a completed cycle
- `get-cycle-rate (cycle uint)` — read rate data for any cycle
- `get-latest-rate ()` — read the most recently settled cycle rate
- `get-current-pox-cycle ()` — read current cycle from PoX-4

### `rho-core.clar`

The swap protocol. Handles the full lifecycle: offer creation, acceptance, per-cycle settlement, and position closing.

Key functions:
- `post-offer (notional-ustx uint) (fixed-rate-bps uint) (duration-cycles uint) (collateral-sats uint)` — fixed party posts a rate offer
- `accept-offer (offer-id uint) (variable-collateral-sats uint)` — variable party accepts and creates an active swap
- `settle-cycle (swap-id uint) (cycle uint)` — anyone calls this after a cycle; contract reads oracle rate and settles
- `close-swap (swap-id uint)` — called after all cycles complete; releases remaining collateral to both parties
- `cancel-offer (offer-id uint)` — fixed party cancels an unfilled offer and reclaims collateral

### `mock-sbtc.clar`

SIP-010 compliant token for testnet only. Freely mintable so testnet testing requires no bridge. Replace with real sBTC (`SM3VDXK3WZZSA84xxFkqHC4MZafEMoz4G9DLMZS.sbtc-token`) on mainnet.

---

### Frontend

```
frontend/
├── src/
│   ├── app/
│   │   ├── page.tsx              Landing page — explains Rho, shows live PoX rate
│   │   ├── app/
│   │   │   ├── page.tsx          Dashboard — active positions, P&L, settlement history
│   │   │   ├── market/
│   │   │   │   └── page.tsx      Market — browse open offers, accept flow
│   │   │   └── create/
│   │   │       └── page.tsx      Create — post a new fixed-rate offer
│   │   └── layout.tsx
│   ├── components/
│   │   ├── ui/                   Base UI components
│   │   ├── wallet/               Wallet connection (Xverse, Leather)
│   │   ├── rate-display/         Live PoX rate ticker
│   │   ├── offer-card/           Swap offer display and accept flow
│   │   ├── position-card/        Active position with settlement history
│   │   └── create-offer-form/    Offer creation form with rate preview
│   └── lib/
│       ├── contracts.ts          All contract read/write calls
│       ├── stacks.ts             Network config and wallet connection
│       ├── oracle.ts             PoX rate data fetching and formatting
│       └── store.ts              Zustand global state
```

**Stack:**
- Next.js 16
- TypeScript
- Tailwind CSS 4
- @stacks/connect — wallet connection
- @stacks/transactions — contract calls
- @stacks/stacking — PoX cycle data
- @tanstack/react-query — data fetching and caching
- Zustand — global state (wallet, network)
- framer-motion — transitions
- lucide-react — icons

---

## Mechanism Walkthrough

### Step 1 — Fixed party posts an offer

```
post-offer(
  notional-ustx: 10_000_000_000,   // 10,000 STX worth of exposure
  fixed-rate-bps: 13,              // 13 basis points per cycle ≈ 3.38% APY over 26 cycles
  duration-cycles: 13,             // 13 PoX cycles ≈ 6 months
  collateral-sats: 5_000_000       // 0.05 BTC as collateral
)
```

The contract locks their sBTC collateral. Offer appears on the market page.

### Step 2 — Variable party accepts

```
accept-offer(
  offer-id: 1,
  variable-collateral-sats: 7_500_000   // 150% of notional exposure as collateral
)
```

Variable party's sBTC is locked. Active swap is created. Starts from next PoX cycle.

### Step 3 — Cycle settles (anyone can call)

```
settle-cycle(swap-id: 1, cycle: 85)
```

Contract:
1. Reads oracle rate for cycle 85
2. Calculates fixed payment = `notional × fixed-rate-bps ÷ 10_000`
3. Calculates variable payment = `notional × actual-rate-bps ÷ 10_000`
4. Net difference moves between collateral balances
5. Emits settlement event with full breakdown

### Step 4 — Swap completes

After all 13 cycles settle, `close-swap` releases remaining collateral to both parties.

---

## Example Settlement

Cycle 85 PoX rate comes in at 18 basis points (higher than the agreed 13):

```
Fixed party owed:   notional × 13 bps = 1,300 sats (they receive this)
Variable party owes: notional × 13 bps = 1,300 sats (they pay this)
Variable party gets: notional × 18 bps = 1,800 sats (actual rate)
Net to variable:    1,800 - 1,300 = 500 sats profit
```

Cycle 86 rate comes in at 9 basis points (lower than agreed):

```
Fixed party owed:   notional × 13 bps = 1,300 sats
Variable party gets: notional × 9 bps = 900 sats
Net to variable:    900 - 1,300 = -400 sats (pays from collateral)
```

Settlement is fully automatic. No claiming. No manual action from either party.

---

## Why Stacks

PoX is unique to Stacks. Bitcoin miners paying real BTC to STX stackers happens on no other chain. The yield rate is derived from actual Bitcoin transactions and observable directly from the Stacks blockchain — a Clarity contract can read this data natively without any external price oracle. This protocol is not portable to Ethereum, Solana, or any other Bitcoin L2. It only makes sense here.

The Stacks Endowment published a Bitcoin staking whitepaper in May 2026 introducing a new institutional staking program (PoX-5) and a future permissionless clearing auction (PoX-6) that will create an on-chain variable rate determined by open market bidding. Rho is the rate hedging infrastructure that program needs.

---

## Development Setup

### Prerequisites

- [Clarinet](https://github.com/hirosystems/clarinet) v3.11.0+
- Node.js v20+
- npm v10+

### Install and Test Contracts

```bash
cd /path/to/rho
npm install
npm test
```

### Run Contract Checks

```bash
clarinet check
```

### Start Frontend

```bash
cd frontend
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

### Testnet Deployment

```bash
clarinet deployments apply --testnet
```

---

## Grant Context

Rho was built for the Stacks Endowment Q2 2026 Getting Started grant ($10,000, 3 milestones).

**Milestone 1 ($2,000):** Contracts fully tested on Stacks testnet. Complete test suite covering all paths. Security review notes published. Public repo live.

**Milestone 2 ($3,000):** Mainnet deployment with real sBTC. Production frontend live. 5 verified end-to-end swaps on mainnet (offer → accept → oracle → settle → close).

**Milestone 3 ($5,000):** 3 real STX stackers with active mainnet swap positions. Dashboard showing live PoX rate, open positions, settlement history. $5,000 notional in active positions.

---

## Roadmap

**Phase 1 — Bilateral (Grant scope)**
Peer-to-peer offer matching. Fixed party posts, variable party accepts. Oracle submits rates per cycle. Automatic settlement. Mainnet with real sBTC.

**Phase 2 — Rate Liquidity Pool**
LP-backed pool that automatically takes the variable side for all fixed-party offers. No need to find a specific counterparty. Deeper liquidity. AMM-style rate pricing.

**Phase 3 — PoX-6 Integration**
When Stacks launches PoX-6 (permissionless sealed-bid clearing auction for yield rates), Rho becomes the primary infrastructure for rate discovery and hedging at scale. Institutional grade. Open market rate determination.

---

## Security Considerations

- All collateral held in contract escrow until swap completes or is cancelled
- Maintenance margin: variable party auto-liquidated if collateral falls below 110% of remaining obligation
- Oracle is admin-controlled in Phase 1 (acknowledged POC limitation). Phase 2 uses Bitcoin transaction proofs via Clarity's `get-burn-block-info?`
- Clarity's decidability guarantees: contract behaviour is fully knowable before deployment. No reentrancy vulnerabilities by language design.
- Position limits enforced during initial launch period

---

## License

MIT
