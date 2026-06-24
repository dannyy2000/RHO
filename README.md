# Rho Protocol

> The first interest rate swap protocol for Bitcoin PoX yield on Stacks.

[![Clarinet](https://img.shields.io/badge/Clarinet-3.11.0-orange)](https://github.com/hirosystems/clarinet)
[![Tests](https://img.shields.io/badge/tests-7%20passing-brightgreen)](#testing)
[![Clarity](https://img.shields.io/badge/Clarity-v2-blue)](https://docs.stacks.co/clarity)
[![Network](https://img.shields.io/badge/network-Stacks%20Testnet-purple)](https://explorer.hiro.so)
[![License](https://img.shields.io/badge/license-MIT-lightgrey)](LICENSE)

---

Bitcoin miners pay real BTC to STX stackers every two weeks through Proof of Transfer (PoX). The rate changes every cycle depending on miner competition. Nobody can plan around it, hedge against it, or price it into a deal — because there has never been a product that lets you trade it.

**Rho fixes that.** It lets one party lock in a guaranteed fixed BTC yield rate while a counterparty takes the floating PoX rate — all settled automatically on-chain through Clarity smart contracts, with no custodian, no off-chain settlement, and no external price oracle.

---

## Table of Contents

- [Background — What is PoX yield?](#background--what-is-pox-yield)
- [The Problem](#the-problem)
- [The Solution](#the-solution)
- [How the Rate is Calculated](#how-the-rate-is-calculated)
- [Mechanism Walkthrough](#mechanism-walkthrough)
- [Settlement Examples](#settlement-examples)
- [Contract Architecture](#contract-architecture)
- [Contract Reference](#contract-reference)
- [Frontend](#frontend)
- [Development Setup](#development-setup)
- [Testing](#testing)
- [Deployment](#deployment)
- [Security Considerations](#security-considerations)
- [Roadmap](#roadmap)
- [Why Stacks](#why-stacks)
- [Grant Context](#grant-context)
- [License](#license)

---

## Background — What is PoX yield?

Stacks uses **Proof of Transfer (PoX)** as its consensus mechanism. Instead of burning electricity or tokens, Bitcoin miners who want to mine Stacks blocks must pay **real BTC** to a pool of STX stackers. This creates a native Bitcoin yield for anyone who holds and stacks STX — not a new token, not a synthetic — real, on-chain Bitcoin.

The yield is determined entirely by miner competition:

- More miners competing → more BTC paid → higher yield
- Fewer miners competing → less BTC paid → lower yield

PoX cycles run every **2,100 Bitcoin blocks** (approximately two weeks). At the end of each cycle, the total BTC paid by all miners is distributed proportionally to all STX stackers for that cycle.

Over the lifetime of PoX, more than **$500 million in BTC** has been paid out to stackers. The yield is real, Bitcoin-native, and directly observable on-chain.

---

## The Problem

The PoX yield rate is variable. It changes every two weeks. One cycle you earn 4%, the next 2.5%, the cycle after that 3.8%. The rate is entirely driven by how many miners are competing in any given two-week window — a number that no one can predict with certainty.

For individual stackers, this is inconvenient. For institutions committing large amounts of capital to the Stacks ecosystem through the new PoX-5 program, it is a dealbreaker. You cannot underwrite a financial product, plan a treasury strategy, or make a capital commitment without knowing what yield you will receive.

**There is currently no product on any Bitcoin Layer 2 that solves this.**

Ethereum solved the equivalent problem for its native yield (ETH staking rate) through protocols like Pendle Finance and Notional Finance, which now manage billions in TVL. The Stacks ecosystem has the underlying yield primitive — and no derivative layer on top of it.

---

## The Solution

Rho is an **interest rate swap protocol** built entirely on Stacks using Clarity smart contracts.

### How it actually fixes the rate

Here is the key insight people miss: Rho does not intercept your PoX yield. You still stack STX and Bitcoin still goes directly to your wallet from PoX each cycle. What Rho does is run a **separate settlement alongside your stacking** that mathematically cancels out the rate variability.

Every cycle, the contract calculates two numbers on a shared reference amount (the notional):

```
what the fixed party is owed  = notional × fixed_rate  ÷ 1,000,000
what the variable party is owed = notional × actual_rate ÷ 1,000,000
```

Only the **net difference** between these two numbers moves — out of the collateral of whichever party owes more.

**When the actual PoX rate is LOWER than the fixed rate:**

The variable party pays the gap into the fixed party's collateral. The fixed party's PoX earnings were low this cycle, but the swap compensates them for exactly the missing amount. Their combined position (PoX yield + swap top-up) equals the fixed rate they agreed to.

**When the actual PoX rate is HIGHER than the fixed rate:**

The fixed party pays the excess into the variable party's collateral. The fixed party earned more from PoX this cycle, but they pass the excess on. Their combined position (PoX yield minus swap payment) still equals the fixed rate they agreed to.

**The result:** No matter what miners pay this cycle — high competition, low competition, anything in between — the fixed party's net yield is always the rate they locked in. The swap compensates for every deviation, in either direction, automatically.

**A concrete example with numbers:**

```
Agreed fixed rate:  80 bps  (80 sats per 1,000,000 uSTX per cycle)
Notional:           10,000,000 uSTX

Cycle A — miners are aggressive, actual rate = 100 bps:
  Fixed party earns from PoX:      1,000 sats
  Fixed party owes to swap:        200 sats  (100 - 80 = 20 bps × notional)
  Fixed party net:                 800 sats  ← exactly 80 bps

Cycle B — miners pull back, actual rate = 55 bps:
  Fixed party earns from PoX:       550 sats
  Fixed party receives from swap:   250 sats  (80 - 55 = 25 bps × notional)
  Fixed party net:                  800 sats  ← exactly 80 bps

In both cycles, the fixed party nets exactly what they agreed to.
The variable party absorbs all the rate movement — profiting when rates rise, paying when they fall.
```

Two parties agree on terms. A smart contract holds their collateral and enforces these settlement rules automatically every cycle. Neither party needs to trust the other. The contract is deterministic — its full behaviour is knowable before either party signs a transaction.

### The two sides of a swap

**Fixed side — the hedger**

You stack STX and want certainty about your BTC yield. You post a swap offer specifying the fixed rate you want, a notional amount, and a duration. You deposit sBTC as collateral. Every cycle, the swap settles — compensating you when rates fall, passing your excess to the variable party when rates rise. Your effective yield always equals the fixed rate you agreed to.

**Variable side — the speculator**

You believe PoX rates are rising, or you want direct exposure to PoX yield without stacking STX yourself. You accept a fixed-rate offer and deposit sBTC collateral. Every cycle you collect the excess when rates beat the fixed rate, and you cover the gap when they fall below it. You profit from rate volatility — the exact risk the fixed party is hedging away.

**Neither party moves principal.** Only the net difference in yield calculations transfers between collateral balances each cycle. This is the defining feature of an interest rate swap.

---

## How the Rate is Calculated

The PoX yield rate is derived from two numbers, both observable on-chain, requiring no external price feed or oracle operator:

| Input | Source |
|-------|--------|
| Total BTC paid by miners in the cycle | Bitcoin blockchain (submitted to oracle in Phase 1; Bitcoin tx proofs in Phase 2) |
| Total uSTX stacked in the cycle | Stacks blockchain — readable from PoX-4 contract directly |

**Oracle formula — rate per cycle:**

```
rate_bps = (btc_reward_sats × 1,000,000) ÷ total_ustx_stacked
```

This gives the rate in **basis points (bps)**: satoshis earned per 1,000,000 uSTX stacked per cycle. It is a self-contained unit that requires no BTC/STX price feed to interpret.

**Settlement formula — payment per cycle:**

```
payment_sats = notional_ustx × rate_bps ÷ 1,000,000
```

Run once for the fixed rate, once for the actual rate. The net difference is the transfer between parties.

### Why no external oracle?

The Ethereum equivalent (Pendle Boros) depends on Chainlink to report the staking rate. If Chainlink fails, goes stale, or reports incorrect data, every settlement on the protocol is wrong. Rho reads from the blockchain itself. The oracle in Phase 1 is admin-assisted but the rate calculation happens inside the contract — an admin cannot fabricate a rate without submitting numbers that contradict on-chain PoX data. Phase 2 replaces admin submission entirely with Clarity's native `get-burn-block-info?` to verify Bitcoin transaction proofs.

---

## Mechanism Walkthrough

### Step 1 — Fixed party posts an offer

```clarity
(post-offer
  notional-ustx:     u10000000      ;; 10 STX notional
  fixed-rate-bps:    u80            ;; 80 sats per 1M uSTX per cycle
  duration-cycles:   u6             ;; runs for 6 PoX cycles (~12 weeks)
  collateral-sats:   u5000000       ;; 0.05 BTC deposited as collateral
)
```

The contract locks the fixed party's sBTC collateral immediately. The offer becomes visible on the market. It remains open until accepted or cancelled.

### Step 2 — Variable party accepts the offer

```clarity
(accept-offer
  offer-id:                 u1
  variable-collateral-sats: u7500000   ;; must meet 110% maintenance margin
)
```

The variable party's sBTC is locked. An active swap is created starting from the current PoX cycle. The offer is marked accepted and can no longer be cancelled.

### Step 3 — Oracle posts the cycle rate

After a PoX cycle completes, the oracle admin submits the BTC rewards paid and the total STX stacked:

```clarity
(submit-cycle-rate
  cycle:              u85
  btc-reward-sats:    u800000000     ;; 8 BTC paid by miners this cycle
  total-ustx-stacked: u10000000000000 ;; 10 billion STX stacked
)
```

The contract calculates and stores the rate: `800,000,000 × 1,000,000 ÷ 10,000,000,000,000 = 80 bps`.

### Step 4 — Settlement runs (anyone can call)

```clarity
(settle-cycle
  swap-id: u1
  cycle:   u85
)
```

The contract:
1. Reads the oracle rate for cycle 85
2. Calculates the fixed payment: `notional × fixed_rate ÷ 1,000,000`
3. Calculates the variable payment: `notional × actual_rate ÷ 1,000,000`
4. Computes the net difference and moves it between internal collateral balances
5. Checks the variable party's maintenance margin — if below 110% of remaining obligation, triggers automatic liquidation
6. Emits a `cycle-settled` event with the full breakdown

No wallet needs to sign this transaction. Any address on Stacks can call it. In production, the Rho oracle bot calls it automatically after each cycle.

### Step 5 — Swap closes

Once all cycles are settled, either party can call `close-swap`. The contract releases the remaining collateral balances back to each party's wallet.

```clarity
(close-swap swap-id: u1)
```

The swap lifecycle is complete. All state is final and on-chain.

---

## Settlement Examples

**Example A — Variable party wins (actual rate > fixed rate)**

```
Notional:      10,000,000 uSTX
Fixed rate:    80 bps
Actual rate:   95 bps (miners were more competitive this cycle)

Fixed payment  = 10,000,000 × 80  ÷ 1,000,000 = 800 sats
Variable payment = 10,000,000 × 95 ÷ 1,000,000 = 950 sats

Net = 950 - 800 = 150 sats transferred from fixed collateral → variable collateral

Variable party profited 150 sats this cycle.
Fixed party received their guaranteed 800 sats equivalent (collateral adjusted).
```

**Example B — Fixed party wins (actual rate < fixed rate)**

```
Notional:      10,000,000 uSTX
Fixed rate:    80 bps
Actual rate:   55 bps (miners were less competitive this cycle)

Fixed payment  = 10,000,000 × 80  ÷ 1,000,000 = 800 sats
Variable payment = 10,000,000 × 55 ÷ 1,000,000 = 550 sats

Net = 800 - 550 = 250 sats transferred from variable collateral → fixed collateral

Fixed party received their guaranteed 800 sats equivalent.
Variable party paid 250 sats from their collateral.
```

**Example C — Liquidation triggered**

If the variable party's collateral falls below 110% of their remaining obligation across future cycles, the contract liquidates immediately. All accumulated collateral is returned to both parties at their current correct balances. The swap terminates with status `liquidated`.

```
Maintenance margin check:
  remaining_obligation = remaining_cycles × notional × fixed_rate ÷ 1,000,000
  min_collateral = remaining_obligation × 110 ÷ 100

  If variable_collateral < min_collateral → liquidate
```

---

## Contract Architecture

```
contracts/
├── sip-010-trait.clar      Standard SIP-010 fungible token interface
├── mock-sbtc.clar          Testnet mock sBTC (freely mintable, same interface)
├── pox-rate-oracle.clar    Stores and calculates PoX yield rates per cycle
└── rho-core.clar           Core swap protocol — full lifecycle management
```

**Deployment order matters.** Contracts must be deployed in this sequence:

```
1. sip-010-trait    (no dependencies)
2. mock-sbtc        (implements sip-010-trait)
3. pox-rate-oracle  (no dependencies)
4. rho-core         (calls mock-sbtc and pox-rate-oracle)
```

---

## Contract Reference

### `sip-010-trait.clar`

Defines the standard SIP-010 fungible token interface for Stacks. All token interactions in Rho go through this trait, making the collateral token swappable — replace `mock-sbtc` with real sBTC for mainnet by updating a single contract address.

**Trait functions:**

| Function | Parameters | Returns |
|----------|-----------|---------|
| `transfer` | `amount uint`, `sender principal`, `recipient principal`, `memo (optional (buff 34))` | `(response bool uint)` |
| `get-name` | — | `(response (string-ascii 32) uint)` |
| `get-symbol` | — | `(response (string-ascii 32) uint)` |
| `get-decimals` | — | `(response uint uint)` |
| `get-balance` | `who principal` | `(response uint uint)` |
| `get-total-supply` | — | `(response uint uint)` |
| `get-token-uri` | — | `(response (optional (string-utf8 256)) uint)` |

---

### `mock-sbtc.clar`

A SIP-010 compliant fungible token for testnet use. Freely mintable — anyone can call `mint` to get tokens for testing without needing the sBTC bridge.

**Replace with** `SM3VDXK3WZZSA84xxFkqHC4MZafEMoz4G9DLMZS.sbtc-token` on mainnet.

| Function | Access | Description |
|----------|--------|-------------|
| `transfer` | Public | Transfer tokens between principals |
| `mint` | Public (testnet only) | Mint tokens to any address |
| `get-name` | Read-only | Returns "Mock sBTC" |
| `get-symbol` | Read-only | Returns "msBTC" |
| `get-decimals` | Read-only | Returns `u8` |
| `get-balance` | Read-only | Returns balance for any principal |
| `get-total-supply` | Read-only | Returns total supply |

---

### `pox-rate-oracle.clar`

Stores verified PoX yield rates for each cycle. The admin (contract deployer) submits the raw BTC reward and total STX stacked after each cycle. The contract calculates and stores the rate.

**Data stored per cycle:**

```clarity
{
  btc-reward-sats:     uint,   ;; total BTC paid by miners
  total-ustx-stacked:  uint,   ;; total uSTX stacked that cycle
  rate-bps:            uint,   ;; calculated rate in bps
  submitted-at:        uint    ;; burn block height at submission
}
```

**Public functions:**

| Function | Access | Parameters | Description |
|----------|--------|-----------|-------------|
| `submit-cycle-rate` | Admin only | `cycle uint`, `btc-reward-sats uint`, `total-ustx-stacked uint` | Submit data for a completed cycle; calculates and stores rate |

**Read-only functions:**

| Function | Parameters | Returns |
|----------|-----------|---------|
| `get-cycle-rate` | `cycle uint` | Full rate data for the given cycle, or `none` |
| `get-latest-rate` | — | Rate data for the most recently submitted cycle |
| `get-current-pox-cycle` | — | Current cycle derived from `burn-block-height ÷ 2100` |
| `get-contract-owner` | — | The admin principal |

**Error codes:**

| Code | Constant | Meaning |
|------|----------|---------|
| `u200` | `ERR-NOT-AUTHORIZED` | Caller is not the contract owner |
| `u201` | `ERR-CYCLE-RATE-EXISTS` | Rate for this cycle already submitted |
| `u203` | `ERR-ZERO-STACKED` | `total-ustx-stacked` cannot be zero |

---

### `rho-core.clar`

The core swap protocol. Manages the complete lifecycle of offers and swaps. Holds all collateral in escrow. Enforces maintenance margin rules. Settles each cycle based on oracle data.

**Offer status values:**

| Value | Meaning |
|-------|---------|
| `u0` | Open — waiting for a variable party to accept |
| `u1` | Accepted — swap has been created |
| `u2` | Cancelled — fixed party cancelled, collateral returned |

**Swap status values:**

| Value | Meaning |
|-------|---------|
| `u0` | Active — cycles are settling |
| `u1` | Completed — all cycles settled, collateral released |
| `u2` | Liquidated — variable party's margin breached |

**Public functions:**

| Function | Caller | Parameters | Description |
|----------|--------|-----------|-------------|
| `post-offer` | Fixed party | `notional-ustx uint`, `fixed-rate-bps uint`, `duration-cycles uint`, `collateral-sats uint` | Post a fixed-rate offer and lock sBTC collateral |
| `accept-offer` | Variable party | `offer-id uint`, `variable-collateral-sats uint` | Accept an open offer, lock collateral, create swap |
| `settle-cycle` | Anyone | `swap-id uint`, `cycle uint` | Settle one cycle using the oracle rate |
| `close-swap` | Anyone | `swap-id uint` | Release remaining collateral after all cycles settle |
| `cancel-offer` | Fixed party only | `offer-id uint` | Cancel an open (unaccepted) offer and reclaim collateral |

**Read-only functions:**

| Function | Parameters | Returns |
|----------|-----------|---------|
| `get-offer` | `offer-id uint` | Full offer data or `none` |
| `get-swap` | `swap-id uint` | Full swap data or `none` |
| `get-cycle-settlement` | `swap-id uint`, `cycle uint` | Settlement record for one cycle or `none` |
| `get-offer-count` | — | Total number of offers created |
| `get-swap-count` | — | Total number of swaps created |
| `get-current-pox-cycle` | — | Current PoX cycle |

**Error codes:**

| Code | Constant | Meaning |
|------|----------|---------|
| `u100` | `ERR-NOT-AUTHORIZED` | Caller does not have permission |
| `u101` | `ERR-OFFER-NOT-FOUND` | Offer ID does not exist |
| `u102` | `ERR-OFFER-NOT-OPEN` | Offer is not in open status |
| `u103` | `ERR-SWAP-NOT-FOUND` | Swap ID does not exist |
| `u104` | `ERR-SWAP-NOT-ACTIVE` | Swap is not in active status |
| `u105` | `ERR-CYCLE-ALREADY-SETTLED` | This cycle has already been settled |
| `u106` | `ERR-CYCLE-OUT-OF-RANGE` | Cycle is outside the swap's duration |
| `u107` | `ERR-ORACLE-RATE-NOT-FOUND` | Oracle has no rate for this cycle |
| `u109` | `ERR-ALL-CYCLES-NOT-SETTLED` | Cannot close swap — cycles remain |
| `u110` | `ERR-INVALID-PARAMS` | A parameter is zero or invalid |

---

## Frontend

A clean Next.js 16 frontend with four pages. Designed to explain the protocol clearly to any visitor — no prior DeFi knowledge assumed. Every form field has a plain-English explanation. Every page has an FAQ section.

```
frontend/
├── app/
│   ├── page.tsx              Landing page — explains Rho, how PoX works, FAQ
│   ├── market/page.tsx       Browse open offers, accept flow with margin calculator
│   ├── create/page.tsx       Post a fixed-rate offer with live payment preview
│   └── dashboard/page.tsx    Active positions, open offers, settlement history
├── components/
│   ├── ClientShell.tsx       SSR-safe wrapper for wallet context
│   ├── WalletProvider.tsx    Xverse + Leather wallet connection via @stacks/connect v8
│   └── Nav.tsx               Navigation bar with connect/disconnect
└── lib/
    └── stacks.ts             Network config and contract addresses
```

**Technology stack:**

| Package | Version | Purpose |
|---------|---------|---------|
| Next.js | 16.2.9 | App framework (App Router) |
| TypeScript | 5.x | Type safety |
| Tailwind CSS | 4.x | Styling |
| @stacks/connect | 8.x | Wallet connection (Xverse, Leather) |
| @stacks/transactions | 7.x | ClarityValue serialization |
| @stacks/network | 7.x | Testnet / mainnet network config |

**Pages overview:**

| Page | Route | Purpose |
|------|-------|---------|
| Landing | `/` | Explains PoX, the swap mechanism, rate formula, FAQ |
| Market | `/market` | Table of open offers with accept modal and margin calculator |
| Create | `/create` | Form to post a fixed-rate offer with live payment preview |
| Dashboard | `/dashboard` | Connected wallet's active positions, open offers, and settlement history |

---

## Development Setup

### Prerequisites

| Tool | Version |
|------|---------|
| [Clarinet](https://github.com/hirosystems/clarinet) | v3.11.0+ |
| Node.js | v20+ |
| npm | v10+ |

### Clone and install

```bash
git clone https://github.com/dannyy2000/rho.git
cd rho
npm install
```

### Check contracts

```bash
clarinet check
```

Expected output:
```
✔ 4 contracts checked
```

### Run tests

```bash
npm test
```

Expected output:
```
Test Files  4 passed (4)
     Tests  7 passed (7)
```

### Start the frontend

```bash
cd frontend
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

### Environment variables (optional)

Copy `.env.example` to `.env.local` in the `frontend/` directory to override defaults:

```bash
# Network: "testnet" (default) or "mainnet"
NEXT_PUBLIC_NETWORK=testnet

# Contract addresses (defaults to Clarinet deployer address for local dev)
NEXT_PUBLIC_CORE_CONTRACT=ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.rho-core
NEXT_PUBLIC_ORACLE_CONTRACT=ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.pox-rate-oracle
NEXT_PUBLIC_SBTC_CONTRACT=ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.mock-sbtc
```

---

## Testing

The test suite covers the full swap lifecycle and all error paths. Tests run against a local Clarinet simnet using `@stacks/clarinet-sdk` and `vitest`.

**Test coverage:**

| Test | File | What it verifies |
|------|------|-----------------|
| Full lifecycle | `rho-core.test.ts` | post-offer → accept → oracle submit → settle → close with correct balance movements |
| Cancel offer | `rho-core.test.ts` | Fixed party cancels unaccepted offer, full collateral returned |
| Double settlement rejection | `rho-core.test.ts` | Attempting to settle the same cycle twice returns `ERR-CYCLE-ALREADY-SETTLED` |
| Oracle rate not found | `rho-core.test.ts` | Attempting to settle before oracle submits returns `ERR-ORACLE-RATE-NOT-FOUND` |
| SIP-010 compliance | `mock-sbtc.test.ts` | Token transfer, mint, balance checks |
| Oracle submission | `pox-rate-oracle.test.ts` | Rate calculation, duplicate rejection, admin check |
| Trait conformance | `sip-010-trait.test.ts` | Trait definition loads correctly |

**Verified lifecycle values (from main test):**

```
Notional:         1,000,000 uSTX
Fixed rate:       100 bps
Actual rate:      200 bps (oracle submits: 200 sats / 1,000,000 uSTX)
Duration:         1 cycle

Fixed payment:    1,000,000 × 100 ÷ 1,000,000 = 100 sats
Variable payment: 1,000,000 × 200 ÷ 1,000,000 = 200 sats
Net to variable:  100 sats (moves from fixed_collateral → variable_collateral)

Fixed party final balance:    9,999,900 msBTC sats  (10M minted - 1M locked + 999,900 returned)
Variable party final balance: 10,000,100 msBTC sats  (10M minted - 2M locked + 2,000,100 returned)
```

---

## Deployment

### Testnet

```bash
clarinet deployments apply --testnet
```

Clarinet will deploy all four contracts in the correct dependency order and output their addresses.

Update the frontend's `.env.local` with the new addresses, then deploy the frontend to Vercel:

1. Import `dannyy2000/rho` in [vercel.com/new](https://vercel.com/new)
2. Set **Root Directory** to `frontend`
3. Add the `NEXT_PUBLIC_*` environment variables
4. Deploy

### Mainnet

Replace `mock-sbtc` with real sBTC:

```clarity
;; In rho-core.clar, replace all references to:
.mock-sbtc
;; with:
SM3VDXK3WZZSA84xxFkqHC4MZafEMoz4G9DLMZS.sbtc-token
```

Update the oracle contract owner to a multisig before mainnet deployment.

---

## Security Considerations

**Collateral custody**
All sBTC collateral is held in the `rho-core` contract using Clarity's native `as-contract` pattern. Funds never leave without an explicit settlement, close, cancel, or liquidation call. No admin key can drain collateral.

**Maintenance margin**
The variable party must maintain collateral above 110% of their remaining obligation at all times. The margin check runs automatically at the end of every `settle-cycle` call. If breached, liquidation is immediate and trustless.

```
remaining_obligation = remaining_cycles × notional × fixed_rate ÷ 1,000,000
minimum_collateral   = remaining_obligation × 110 ÷ 100
```

**Oracle risk (Phase 1)**
The oracle is admin-controlled in Phase 1. An admin cannot submit a rate that is mathematically impossible, but they could submit a rate that favours one side. Acknowledged limitation of the POC phase. Mitigation: multi-sig oracle key, public rate data posted with each submission. Phase 2 removes admin dependency entirely using Bitcoin transaction proofs.

**Clarity safety**
Clarity is a decidable language — its execution is fully predictable and analysable before deployment. There are no reentrancy vulnerabilities (no callback mechanism), no integer overflow (Clarity natively bounds arithmetic), and no hidden state (all state is on-chain and readable). Clarity's `check_checker` static analysis pass runs on every contract on every `clarinet check`.

**No upgrade keys**
The contracts have no upgrade mechanism. What is deployed is what runs. This is intentional — predictability over flexibility.

---

## Roadmap

### Phase 1 — Bilateral (Grant scope, now)

- Peer-to-peer offer matching
- Fixed party posts, variable party accepts
- Admin oracle submits rates per cycle
- Automatic settlement and liquidation
- Testnet with mock sBTC → mainnet with real sBTC

### Phase 2 — Trustless Oracle

- Replace admin oracle with Bitcoin transaction proof verification
- Use Clarity's `get-burn-block-info?` to read Bitcoin block data natively
- Anyone can submit a cycle rate with a Bitcoin proof — no trusted party required

### Phase 3 — Liquidity Pool

- LP-backed pool automatically takes the variable side for all fixed-rate offers
- No counterparty matching required — post an offer, it fills immediately from the pool
- AMM-style rate pricing based on pool utilisation

### Phase 4 — PoX-6 Integration

- When Stacks launches PoX-6 (permissionless sealed-bid clearing auction for yield rates), Rho becomes the primary infrastructure for rate discovery and institutional hedging
- On-chain rate forward curve derived from active swap positions
- Integration with Stacks liquid stacking protocols

---

## Why Stacks

PoX yield exists only on Stacks. Bitcoin miners paying real BTC to STX stackers is a mechanism unique to this ecosystem — it does not exist on Ethereum, Solana, or any other Bitcoin Layer 2. The yield is not synthetic and does not depend on a token price.

Rho is not portable. It specifically requires:

1. **PoX yield** — the underlying rate being swapped. Only exists on Stacks.
2. **sBTC** — 1:1 Bitcoin-backed collateral. Stacks' native Bitcoin asset.
3. **Clarity** — deterministic execution, native Bitcoin block reading, and decidable analysis. No other smart contract language provides all three.
4. **Stacks Bitcoin oracle** — `get-burn-block-info?` allows the Phase 2 oracle to read Bitcoin block data without trusting any external party.

This protocol makes sense precisely because Stacks is the only chain where you can swap a Bitcoin yield rate, collateralise in Bitcoin, settle on Bitcoin block timing, and verify everything against the Bitcoin chain natively.

---

## Grant Context

Rho was built for the **Stacks Endowment Q2 2026 Getting Started Grant** ($10,000 — DeFi & Perps theme).

| Milestone | Amount | Target | Deliverable |
|-----------|--------|--------|-------------|
| M1 | $2,000 | Now | Contracts deployed on Stacks testnet. All tests passing. Public repo. Frontend live on Vercel. |
| M2 | $3,000 | ~6 weeks | Mainnet deployment with real sBTC. 5 verified end-to-end swaps on mainnet with transaction hashes. |
| M3 | $5,000 | ~12 weeks | 3 real STX stackers with active mainnet positions. $5,000 notional in active swaps. Community write-up published. |

---

## License

MIT — see [LICENSE](LICENSE)

---

<p align="center">
  Built on Stacks. Settled in Bitcoin.
</p>
