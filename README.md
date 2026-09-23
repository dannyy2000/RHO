# Rho Protocol

> The hedge for Stacks' junior tranche — fixed-rate protection for STX-only stackers against the yield volatility PoX-5's Bitcoin Staking bonds created.

[![Clarinet](https://img.shields.io/badge/Clarinet-3.11.0-orange)](https://github.com/hirosystems/clarinet)
[![Tests](https://img.shields.io/badge/tests-35%20passing-brightgreen)](#testing)
[![Clarity](https://img.shields.io/badge/Clarity-v2-blue)](https://docs.stacks.co/clarity)
[![Network](https://img.shields.io/badge/network-Stacks%20Testnet-purple)](https://explorer.hiro.so)
[![License](https://img.shields.io/badge/license-MIT-lightgrey)](LICENSE)

---

Since PoX-5 activated on July 30, 2026, miner BTC no longer splits proportionally across all STX stackers. It flows through a waterfall: Genesis Bond holders (paired BTC+STX, "Tranche 1") get a guaranteed target rate first; STX-only stackers — the vast majority of the network, "Tranche 2" — split whatever's left. Stacks' own documentation calls this **residual** yield. The senior tranche is fixed. The junior tranche absorbs all the variability, now on top of a guaranteed obligation sitting ahead of it in line.

**Rho fixes that for the junior tranche.** It lets one party lock in a guaranteed fixed BTC yield rate on their STX-only stacking position while a counterparty takes the floating residual rate — all settled automatically on-chain through Clarity smart contracts, with no custodian, no off-chain settlement, and no external price oracle.

---

## Deployed Contracts — Stacks Testnet

All contracts are live and independently verifiable, deployed from `ST14V779KZH7Q62TXJ1G6HZBP23PJT6CE25RFESB7`.

**Current contracts — use these:**

| Contract | Explorer | Deployment tx |
|----------|----------|---------------|
| `rho-core-v4` | [view contract](https://explorer.hiro.so/txid/ST14V779KZH7Q62TXJ1G6HZBP23PJT6CE25RFESB7.rho-core-v4?chain=testnet) | [`014d109e…`](https://explorer.hiro.so/txid/0x014d109e5486f8261cb179e1ce4473bdbe63b727227ea8f3eea427e73450e854?chain=testnet) |
| `pox-rate-oracle-v2` | [view contract](https://explorer.hiro.so/txid/ST14V779KZH7Q62TXJ1G6HZBP23PJT6CE25RFESB7.pox-rate-oracle-v2?chain=testnet) | [`ac0e8ff2…`](https://explorer.hiro.so/txid/0xac0e8ff21ce2dfec2339ee27aeb9eb8a561b21dfc12926d07ac5b68d93e300a5?chain=testnet) |
| `mock-sbtc` | [view contract](https://explorer.hiro.so/txid/ST14V779KZH7Q62TXJ1G6HZBP23PJT6CE25RFESB7.mock-sbtc?chain=testnet) | [`ecf23cd2…`](https://explorer.hiro.so/txid/0xecf23cd2f3cd15904b5c8cd11bacea1f9b6eef3e814c0a25b71fb38a3161d82b?chain=testnet) |
| `sip-010-trait` | [view contract](https://explorer.hiro.so/txid/ST14V779KZH7Q62TXJ1G6HZBP23PJT6CE25RFESB7.sip-010-trait?chain=testnet) | [`2f936d9b…`](https://explorer.hiro.so/txid/0x2f936d9b2d62a810cc8dbb29833fc81776d03fcda22ef806fbc451416d355001?chain=testnet) |

### Version history — three defects found and fixed

Clarity contracts are immutable and Stacks contract names cannot be reused, so each fix ships under a new name. Superseded versions remain on chain and are deliberately not linked above. `mock-sbtc` and `sip-010-trait` were unaffected throughout.

**v1 → v2: rate-precision defect.** Found by running live PoX-5 figures through the contract instead of the toy values the unit tests used.

The rate unit was *sats per 1,000,000 uSTX* — per 1 STX. Real PoX yield is roughly **0.5 sats per STX per cycle**, so under Clarity's integer division every real cycle truncated to a rate of **0**. Every settlement would have moved zero sats and the protocol would have been inert against real data — while passing every test, because the tests staked 1,000,000 uSTX against a real stacked supply of 441 billion. `RATE-SCALAR` is now `1e12`; cycle 142 yields **679,497** instead of 0. Pinned by `tests/real-data-check.test.ts`.

**v2 → v3: capacity release written twice in the liquidation branch.** Found by auditing the liquidation path specifically, because no test or simulation had ever entered it.

The branch decremented `active-notional-ustx` and `active-swap-count` twice. With a single active swap the first decrement reaches zero and the second **underflows**, aborting the whole call. The consequences compound:

1. Liquidation could never fire — the collateral safety mechanism was dead
2. `settle-cycle` failed permanently for the affected swap
3. `close-swap` requires every cycle settled, so **both parties' collateral was trapped**

Nothing caught it because every test and the first simulation sized collateral comfortably and never breached the margin. The bug lived only in the path nobody had exercised. `tests/liquidation.test.ts` now covers that branch end to end, and the fix is [demonstrated on chain](#testnet-evidence--full-lifecycle-and-liquidation).

**v3 → v4: cycle numbering did not match real PoX cycles.** Found by comparing the contract's output against the network's own `reward_cycle_id`.

`get-current-pox-cycle` derived the cycle as `burn-block-height / 2100`. That is wrong on every network. It ignores `first-burnchain-block-height` — 666,050 on mainnet, so every cycle number was offset by **317** — and hardcodes a 2,100 block cycle when testnet's reward cycle is **900** blocks. On testnet the contract reported cycle 8 while the network was on cycle **20**.

Settlement arithmetic stayed correct, because the oracle and core used the same number as a shared key. But the numbers bore no relationship to real PoX cycles, so a swap could not be mapped to the cycles it was meant to cover — and on testnet a "cycle" ran 2.33× longer than a real one.

v4 reads the cycle from the PoX-5 boot contract instead of deriving it, which removes both assumptions and cannot drift from consensus. Verified live: the network reports cycle 20, v3 reports 8, v4 reports **20**.

All three defects were found and fixed before any mainnet exposure, which is the argument for the capped, staged rollout in [Capped Pilot Design](#capped-pilot-design) rather than an argument against it.

**Verify the deployed behaviour without trusting this README.** The pilot caps are readable directly off chain:

```bash
curl -s -X POST \
  "https://api.testnet.hiro.so/v2/contracts/call-read/ST14V779KZH7Q62TXJ1G6HZBP23PJT6CE25RFESB7/rho-core-v4/get-pilot-caps" \
  -H "Content-Type: application/json" \
  -d '{"sender":"ST14V779KZH7Q62TXJ1G6HZBP23PJT6CE25RFESB7","arguments":[]}'
```

The oracle's live signature confirms the PoX-5 waterfall inputs are in force, not the pre-PoX-5 pro-rata formula:

```bash
curl -s "https://api.testnet.hiro.so/v2/contracts/interface/ST14V779KZH7Q62TXJ1G6HZBP23PJT6CE25RFESB7/pox-rate-oracle-v2" \
  | grep -o '"name":"submit-cycle-rate".*total-ustx-stacked'
# → args: cycle, miner-revenue-sats, tranche-1-obligation-sats, total-ustx-stacked
```

> **Note on the earlier deployment.** These contracts were first deployed on 2026-06-24. Stacks testnet was reset in the interim, which cleared that deployment along with the deployer's balance and transaction history. The addresses above are the current, live deployment and reflect the post-PoX-5 contracts.

---

## Testnet Evidence — Full Lifecycle and Liquidation

Two swaps were executed against the live `rho-core-v4` contract on **2026-09-19**, driven by **real observed PoX-5 figures** rather than invented numbers. Every transaction is on chain and independently checkable.

Cycle inputs come from mainnet cycles 140-142 applied to testnet cycles 8-10. Miner revenue and the Genesis Bond obligation are the real amounts; 441,576,024 STX is the actual stacked supply. Rates were derived by the oracle on chain, not supplied:

| Testnet cycle | Real source | Miner revenue | Tranche 1 owed | Rate derived on chain |
|---|---|---|---|---|
| 8 | mainnet 142 | 3.83 BTC | 0.3 BTC | **679,497** |
| 9 | mainnet 141 | 2.98 BTC | 0.3 BTC | **515,879** |
| 10 | mainnet 140 | 2.72 BTC | 0.3 BTC | **465,831** |

### Swap 1 — healthy swap, runs to completion

1,000,000 STX notional (the per-swap pilot cap), fixed at 500,000 per cycle, 3 cycles, 10,000,000 sats collateral each side.

| Step | Settlement | Transaction |
|---|---|---|
| Post offer | — | [`357caea6…`](https://explorer.hiro.so/txid/0x357caea632dade13d86214c68f60a803dd9788a6a216cc24a9857cd839224c46?chain=testnet) |
| Accept offer | — | [`cd6f1496…`](https://explorer.hiro.so/txid/0xcd6f1496f92cb9b90a2d2f2c12fe0944091c8509f3d9e4e49b3cad7863f25837?chain=testnet) |
| Settle cycle 8 | fixed 500,000 / variable 679,497 | [`420bd994…`](https://explorer.hiro.so/txid/0x420bd994da3676fb7c87ab20ba094a53bc70b97f36d1190f94c308b67a252323?chain=testnet) |
| Settle cycle 9 | fixed 500,000 / variable 515,879 | [`154f604c…`](https://explorer.hiro.so/txid/0x154f604c0f9f0f6fa78fc91b2b28781d656898c666f33be5c159b0a6e717a13c?chain=testnet) |
| Settle cycle 10 | fixed 500,000 / variable 465,831 | [`c85a9746…`](https://explorer.hiro.so/txid/0xc85a97460736b731b7d903cd874bfff3ab64b7780c245a8b086debccaaf4c7b9?chain=testnet) |
| Close swap | status 1, both balances released | [`f229c03e…`](https://explorer.hiro.so/txid/0xf229c03e45206036ffdcacba89a7f63d37eb25cf1b915719f738df1b4d7b3e06?chain=testnet) |

Cycle 10 is the load-bearing case: the actual rate lands *below* the fixed rate, so the reverse settlement direction is exercised rather than only the profitable one. Final state confirmed `cycles-settled: 3`, `status: 1` (completed), both collateral balances zero.

### Swap 2 — deliberately under-margined, must liquidate

Same notional, fixed at 600,000 per cycle over 3 cycles, but the variable party posts only **700,000 sats**: enough to pay cycle 10's 134,169 shortfall, nowhere near the 110% margin required against the two cycles that would remain.

| Step | Transaction |
|---|---|
| Post offer | [`52d5cfa1…`](https://explorer.hiro.so/txid/0x52d5cfa1d683f9ccf675c28f3e85dc23ddfd86f9fc63e615e34acd0a0a945067?chain=testnet) |
| Accept offer (under-margined) | [`d23d0a08…`](https://explorer.hiro.so/txid/0xd23d0a08eca9f7c27a6c239c2e2b22a78bd394da7cc2d2c1b314f14cdb5fb10f?chain=testnet) |
| Settle cycle 10 → **liquidation** | [`6746b274…`](https://explorer.hiro.so/txid/0x6746b274782a92be11a9f4f061c8d6a4440f0c549f80a13337e80883ff363bd7?chain=testnet) |

That transaction emitted both events:

```
(tuple (cycle u10) (event "liquidation") (swap-id u2))
(tuple (cycle u10) (event "cycle-settled") (fixed-payment u600000) (swap-id u2) (variable-payment u465831))
```

Final state `status: 2` (liquidated) after 1 of 3 cycles, both collateral balances released to their owners. **This same transaction would have aborted with an arithmetic underflow on v2** — it is the direct proof that the v3 fix works under real conditions.

### Verified outcomes

Read back from chain rather than asserted here:

- Settlement records hold the expected pairs for all three cycles
- Swap 1 closed `status: 1`; swap 2 liquidated `status: 2`
- `get-pilot-utilisation` returned `0` active notional and `0` active swaps with full headroom after both swaps ended — capacity released exactly once on each path, including liquidation
- The `rho-core-v4` escrow received exactly **30,700,000** sats and sent exactly **30,700,000**, holding zero. No value created, lost, or stranded across either swap

### Honest limitations

Both legs were signed by the same principal, so this exercises contract behaviour rather than counterparty dynamics or price discovery. Testnet cycle numbers (8-10) are not the mainnet cycles the data came from; only the economic inputs are real. Collateral is `mock-sbtc`, not bridged sBTC. Reproduce with `deployments/simulation-v3.testnet-plan.yaml`.

---

## Table of Contents

- [Testnet Evidence](#testnet-evidence--full-lifecycle-and-liquidation)
- [Deployed Contracts](#deployed-contracts--stacks-testnet)
- [Background — What is PoX yield?](#background--what-is-pox-yield)
- [The Problem](#the-problem)
- [Research: PoX-5 subordination analysis](./RESEARCH.md)
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
- [Known Limitations](#known-limitations)
- [Security Considerations](#security-considerations)
- [Roadmap](#roadmap)
- [Why Stacks](#why-stacks)
- [Grant Context](#grant-context)
- [License](#license)

---

## Background — What is PoX yield?

Stacks uses **Proof of Transfer (PoX)** as its consensus mechanism. Bitcoin miners who want to mine Stacks blocks must pay **real BTC** to STX stackers. This creates a native Bitcoin yield for anyone who holds and stacks STX — not a new token, not a synthetic — real, on-chain Bitcoin.

Until PoX-5, that BTC was split proportionally: every stacker received a share of the pot equal to their share of all stacked STX. Simple, but the *total* pot still moved every cycle based on miner competition, so individual yield floated cycle to cycle.

### What changed on July 30, 2026

PoX-5 introduced **Bitcoin Staking** — a second way to earn PoX yield, via protocol bonds branded "Genesis Bond." Participants pair BTC held on Bitcoin L1 with STX and receive a **guaranteed target rate** (3% BTC APY at launch) for a fixed 6-month term. To fund that guarantee, PoX-5 restructured the entire payout waterfall into three tranches, paid **in order**, not proportionally:

1. **Tranche 1 — Protocol bonds.** Paid their target rate first, off the top of miner revenue.
2. **Tranche 2 — STX-only stackers.** Everyone stacking STX without a paired bond. Receives 85% of whatever miner revenue remains *after* Tranche 1 is paid — the official Stacks docs describe this explicitly as "residual" yield.
3. **Tranche 3 — Reserve fund.** The remaining 15%, held to buffer Tranche 1 in low-revenue cycles.

Genesis Bond is currently whitelisted to vetted institutional "anchor participants" during a roughly 12-month bootstrap; Stacks' own roadmap has PoX-6 opening it to a permissionless auction, expected 6–12 months out. Until then, Tranche 2 — everyone who isn't a whitelisted anchor — is where nearly all STX stackers sit.

Over the lifetime of PoX, more than **$500 million in BTC** has been paid out to stackers. The yield is real, Bitcoin-native, and directly observable on-chain.

---

## The Problem

Tranche 2 yield is now **structurally more volatile than it was before PoX-5**, for a reason that has nothing to do with miner competition: it's paid last.

If miner revenue dips in a cycle, Tranche 1 still receives its guaranteed rate — that is the entire point of the guarantee. Tranche 2 absorbs the *entire* shortfall, because it only ever receives what's left over. As the Genesis Bond allocation grows, so does the size of the guaranteed claim sitting ahead of Tranche 2 in the payout line — meaning Tranche 2's exposure gets *worse* the more successful Genesis Bond becomes, not better.

Nobody in Tranche 2 has a way to hedge this. You cannot underwrite a treasury strategy, plan around a capital commitment, or offer STX-only stacking as a predictable product to anyone else — because the rate you actually receive now depends on both miner competition *and* how large the bond pool is that cycle, and no product exists to separate that risk from your position.

**There is currently no hedging product for Tranche 2 stackers on any Bitcoin Layer 2.** This problem is roughly two months old — it did not exist before PoX-5 activated on July 30, 2026 — which is a direct answer to "why doesn't this already exist."

**The scale, quantified.** Miner revenue is running at roughly 3 BTC per cycle (~75 BTC/year), down 85–90% from cycles 95–109. Against that pot, STX-only stackers now receive about 57.4 BTC/year instead of 75 — a **23.5% reduction**, of which 15 points come from the reserve fund's share and 8.5 points from Genesis Bond's senior claim at ~250 BTC bonded. Only the second part scales with the bond pool, and it scales hard: **Tranche 2 reaches zero at ~2,500 BTC bonded, below the programme's own 3,000 BTC capacity target.** Full working, sources and caveats in [RESEARCH.md](./RESEARCH.md).

Ethereum solved the equivalent problem for its native yield (ETH staking rate) through protocols like Pendle Finance, which now manages billions in TVL hedging validator yield variance. Stacks now has an analogous — arguably sharper, since it's a two-sided tranche structure rather than a single floating rate — problem, and no derivative layer on top of it.

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

The Tranche 2 residual rate is a function of three on-chain quantities:

```
tranche_2_pool_sats = (miner_revenue_sats − tranche_1_obligation_sats) × 0.85
rate                = (tranche_2_pool_sats × 1e12) ÷ total_ustx_stacked_tranche_2
```

where `tranche_1_obligation_sats` is the guaranteed payout owed to active protocol bonds that cycle (bonded BTC × each bond's target rate).

**The rate unit is sats per 1,000,000 STX stacked, per cycle.** The `1e12` scalar is load-bearing, not cosmetic: real PoX yield is roughly 0.5 sats per STX per cycle, so a per-1-STX scalar truncates every real cycle to zero under Clarity's integer division. See [Version history](#version-history--three-defects-found-and-fixed).

Worked against live cycle-142 figures — miners paid 3.83 BTC, about 0.3 BTC owed to Tranche 1, 441,576,024 STX stacked:

```
pool = (383,000,000 - 30,000,000) × 0.85       = 300,050,000 sats
rate = 300,050,000 × 1e12 ÷ 441,576,024,000,000 = 679,497
```

**Resolved 2026-09-23 — correcting an earlier claim in this README.** This section previously stated that the published spec does not document read functions for bond capacity or target rate, and that trustless sourcing was therefore blocked. That was wrong. It was written from the SIP text rather than from the deployed contract. Querying `pox-5` directly, the required reads are live:

| Function | Returns |
|---|---|
| `get-protocol-bond(bond-index)` | tuple including `target-rate` |
| `get-total-sbtc-staked-for-bond(bond-index)` | bonded sBTC for that bond period |
| `is-bond-active-at-height(bond-index, height)` | whether a bond counts at a given height |
| `assert-all-active-bonds-included(bond-periods, height)` | has PoX-5 itself confirm no active bond was omitted |
| `get-reserve-balance()` | current reserve balance |

Tranche 1's obligation is therefore `Σ(bonded sBTC × target-rate)` across active bonds, computable entirely on chain. `assert-all-active-bonds-included` is what makes this trustless rather than merely automated: without it a submitter could omit bonds to understate the senior claim and inflate the residual; with it, the chain rejects an incomplete set.

The admin-submitted oracle currently deployed predates this finding. Replacing it is the first deliverable of the current grant scope.

The previous version of this oracle computed a naive pro-rata share across *all* stacked STX — the correct formula before PoX-5, and no longer the correct formula after it. That calculation is being replaced, not patched, precisely because it silently overstates Tranche 2 yield by the full size of the Tranche 1 obligation.

**Settlement formula — payment per cycle (unchanged by the above):**

```
payment_sats = notional_ustx × rate ÷ 1e12
```

Run once for the fixed rate, once for the actual Tranche 2 rate. The net difference is the transfer between parties.

### Why no external oracle?

The Ethereum equivalent (Pendle Boros) depends on Chainlink to report the staking rate. If Chainlink fails, goes stale, or reports incorrect data, every settlement on the protocol is wrong. Rho reads from the blockchain itself. The oracle in Phase 1 is admin-assisted but the rate calculation happens inside the contract — an admin cannot fabricate a rate without submitting numbers that contradict on-chain PoX-5 data. Phase 2 replaces admin submission entirely with Clarity's native `get-burn-block-info?` to verify Bitcoin transaction proofs.

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

After a PoX cycle completes, the oracle admin submits the raw waterfall inputs — total miner revenue, the amount already owed to Tranche 1 (Genesis Bond) holders, and total Tranche 2 (STX-only) stacked STX. The contract derives the pool and rate on-chain, so the submission is auditable against the formula rather than trusted directly:

```clarity
(submit-cycle-rate
  cycle:                      u85
  miner-revenue-sats:         u800000000      ;; 8 BTC paid by miners this cycle
  tranche-1-obligation-sats:  u300000000      ;; 3 BTC owed to Genesis Bond holders this cycle
  total-ustx-stacked:         u10000000000000 ;; 10 billion uSTX held by Tranche 2 stackers
)
```

The contract derives: post-Tranche-1 = `800,000,000 − 300,000,000 = 500,000,000` sats → Tranche 2 pool = `500,000,000 × 85 ÷ 100 = 425,000,000` sats → rate = `425,000,000 × 1,000,000 ÷ 10,000,000,000,000 = 42.5`, floored by Clarity's integer division to **42 bps**.

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

Defines the standard SIP-010 fungible token interface for Stacks. `mock-sbtc` implements it, so any SIP-010 token can stand in during testing.

**Note:** `rho-core` calls `.mock-sbtc` directly rather than dispatching through this trait. That is deliberate — a hardcoded token cannot be swapped for a malicious one by a caller — but it does mean changing the collateral asset is a source edit and redeploy, not a configuration change. See [Mainnet](#mainnet).

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

**Replace with** `'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token` on mainnet — verified to resolve and expose SIP-010. See [Mainnet](#mainnet) for the full change list.

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

### `pox-rate-oracle.clar` — deployed as `pox-rate-oracle-v2`

Stores verified PoX-5 Tranche 2 (STX-only staker) yield rates for each cycle. The admin (contract deployer) submits the raw waterfall inputs after each cycle; the contract derives the Tranche 2 pool and rate on-chain, so the submission is auditable against the formula rather than trusted directly. See [How the Rate is Calculated](#how-the-rate-is-calculated).

**Data stored per cycle:**

```clarity
{
  miner-revenue-sats:        uint,   ;; total BTC paid by miners
  tranche-1-obligation-sats: uint,   ;; guaranteed payout owed to Genesis Bond holders
  tranche-2-pool-sats:       uint,   ;; derived: (miner-revenue - tranche-1-obligation) × 85%
  total-ustx-stacked:        uint,   ;; total uSTX held by Tranche 2 (STX-only) stackers
  rate-sats-per-mstx:        uint,   ;; derived: sats per 1,000,000 STX per cycle
  submitted-at:               uint   ;; burn block height at submission
}
```

**Public functions:**

| Function | Access | Parameters | Description |
|----------|--------|-----------|-------------|
| `submit-cycle-rate` | Admin only | `cycle uint`, `miner-revenue-sats uint`, `tranche-1-obligation-sats uint`, `total-ustx-stacked uint` | Submit raw inputs for a completed cycle; derives and stores the Tranche 2 pool and rate |

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
| `u204` | `ERR-OBLIGATION-EXCEEDS-REVENUE` | `tranche-1-obligation-sats` cannot exceed `miner-revenue-sats` |

---

### `rho-core.clar` — deployed as `rho-core-v4`

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
| `get-pilot-caps` | — | The five enforced pilot limits (see [Capped Pilot Design](#capped-pilot-design)) |
| `get-pilot-utilisation` | — | Active notional, active swap count, and remaining headroom on both |

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
| `u111` | `ERR-EXCEEDS-NOTIONAL-CAP` | Notional exceeds the per-swap pilot cap |
| `u112` | `ERR-EXCEEDS-DURATION-CAP` | Duration exceeds the pilot cap |
| `u113` | `ERR-EXCEEDS-RATE-CAP` | Quoted fixed rate exceeds the sanity bound |
| `u114` | `ERR-EXCEEDS-TOTAL-NOTIONAL-CAP` | Would push protocol-wide notional past the cap |
| `u115` | `ERR-EXCEEDS-ACTIVE-SWAP-CAP` | Would exceed the concurrent active swap cap |

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
Test Files  8 passed (8)
     Tests  35 passed (35)
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
| Notional cap enforced | `rho-core.test.ts` | Offer above the per-swap notional cap returns `ERR-EXCEEDS-NOTIONAL-CAP` |
| Duration cap enforced | `rho-core.test.ts` | Offer above 13 cycles returns `ERR-EXCEEDS-DURATION-CAP` |
| Pilot capacity released | `rho-core.test.ts` | Notional and slot return to the pool after a swap closes |
| Margin breach settles | `liquidation.test.ts` | An under-margined swap settles rather than aborting — the v2 defect |
| Liquidation pays out | `liquidation.test.ts` | Swap marks liquidated, both parties receive their correct balances |
| Capacity released once | `liquidation.test.ts` | Liquidation restores full headroom instead of underflowing |
| Fixed-party insolvency | `audit.test.ts` | Documents the uncollateralised shortfall the variable party absorbs — see [Known Limitations](#known-limitations) |
| Rate cap enforced | `audit.test.ts` | Rate above the sanity bound returns `ERR-EXCEEDS-RATE-CAP` |
| Protocol notional cap | `audit.test.ts` | A sixth swap past the 5M STX ceiling returns `ERR-EXCEEDS-TOTAL-NOTIONAL-CAP` |
| Waterfall rate derivation | `pox-rate-oracle.test.ts` | Tranche 2 rate = (miner revenue − Tranche 1 obligation) × 85%, per PoX-5 |
| Tranche 1 subtracted first | `pox-rate-oracle.test.ts` | Same revenue with zero bonds yields a higher Tranche 2 rate — the gap Genesis Bond growth takes |
| Obligation bound | `pox-rate-oracle.test.ts` | Obligation exceeding miner revenue returns `ERR-OBLIGATION-EXCEEDS-REVENUE` rather than underflowing |
| Duplicate cycle rejected | `pox-rate-oracle.test.ts` | A cycle's rate cannot be resubmitted or overwritten |
| Admin-only submission | `pox-rate-oracle.test.ts` | Non-owner callers are rejected |
| Zero stacked rejected | `pox-rate-oracle.test.ts` | Guards the rate division against a zero denominator |
| Inputs stored for audit | `pox-rate-oracle.test.ts` | Raw inputs persist alongside the derived pool so the rate can be recomputed independently |
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

Mainnet is **not yet deployed**. Three source changes are required, and all three are blocking:

**1. Swap the collateral token.** `rho-core.clar` references `.mock-sbtc` in seven places. Replace each with the real sBTC token:

```clarity
;; replace every .mock-sbtc reference with:
'SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token
```

> Verified 2026-09-20: that principal resolves on mainnet and exposes the SIP-010 interface. An earlier revision of this README carried a malformed address that does not exist on chain; anyone who had followed it would have deployed a contract that could not move collateral.

**2. Swap the PoX boot contract.** `get-current-pox-cycle` reads `'ST000000000000000000002AMW42H.pox-5`, which is the testnet principal. Mainnet is `'SP000000000000000000002Q6VF98.pox-5`. The line is commented in source.

**3. Deploy the oracle from the intended key.** `pox-rate-oracle` fixes its owner to `tx-sender` at deployment and exposes **no** function to change it — so the owner must be correct at deploy time, not corrected afterwards. Deploy from a multisig if a multisig is wanted. See [Known Limitations](#known-limitations).

---

## Capped Pilot Design

Rho's pilot runs inside hard bounds that are **enforced in the contract as constants, not documented as intentions**. They cannot be raised by the deployer, an admin key, or a governance call. Lifting any cap requires deploying a new contract — a visible, auditable on-chain event.

| Cap | Value | Purpose |
|-----|-------|---------|
| Per-swap notional | 1,000,000 STX | No single position can dominate the pilot |
| Protocol-wide notional | 5,000,000 STX | Ceiling on total simultaneous exposure |
| Swap duration | 13 cycles (~6 months) | Matches the Genesis Bond term; bounds oracle dependence |
| Fixed rate | 10,000 bps | Rejects fat-finger and nonsense quotes |
| Concurrent active swaps | 25 | Keeps the pilot small enough to monitor manually |

**Sizing rationale.** Total PoX miner revenue is currently running at roughly 3 BTC per cycle (~75 BTC/year — see [The Problem](#the-problem)). The caps are set so that the maximum obligation across every open swap stays a small fraction of a single cycle's real yield. A total failure of the pilot is bounded to an amount that cannot be systemically meaningful to any participant or to the wider ecosystem.

**Capacity is released, not consumed permanently.** When a swap closes or is liquidated, its notional and slot return to the available pool. Both exit paths are covered by tests, because a counter that only increments would silently brick the protocol after 25 swaps had ever existed.

**Live utilisation is publicly readable.** Anyone — a reviewer, the frontend, a counterparty — can call `get-pilot-caps` and `get-pilot-utilisation` to see the limits and exactly how full the pilot is, without trusting a dashboard or a claim in this README.

---

## Known Limitations

Documented because a reader will find them anyway, and because they shape what the pilot caps are for.

### Margining is one-sided

The maintenance margin and automatic liquidation protect the **fixed** party only. The variable party has no equivalent protection, and the asymmetry runs the wrong way relative to risk:

| | Maximum obligation | Margin requirement |
|---|---|---|
| Variable party | **Bounded** — at most the fixed rate, when the actual rate is zero | 110% of remaining obligation, liquidated on breach |
| Fixed party | **Unbounded** — owes `actual − fixed`, and the actual rate has no ceiling | None |

When the actual rate rises above the fixed rate by more than the fixed party's collateral covers, `settle-cycle` pays out whatever collateral exists, truncates the rest, and **the swap continues**. There is no liquidation and no margin call on that side. The variable party absorbs the shortfall.

`tests/audit.test.ts` demonstrates this concretely: a fixed party holding 200,000 sats against a net obligation of 579,497 pays 200,000, the variable party absorbs a 379,497 shortfall, the swap stays active, and the next cycle transfers nothing at all.

This is inherent to collateralising an obligation with no upper bound — you cannot fully margin it in advance. Real interest-rate swap markets handle it with variation margin posted by both sides as rates move.

**Today's mitigation is disclosure, not enforcement.** A fixed party's posted collateral is visible via `get-offer` before anyone accepts, so a counterparty can assess coverage. The contract does not require it to be adequate. Two-sided variation margin is M2 work.

### The oracle is trusted in Phase 1

Cycle rates are submitted by the contract deployer. The raw inputs are stored on chain so the derived rate is independently recomputable, but an admin could submit inputs that are internally consistent and still wrong. Phase 2 replaces this with Bitcoin proof verification.

### Tranche 1 obligations are not yet read from chain

The Genesis Bond obligation fed to the deployed oracle is still computed off chain and submitted by the contract owner, so this input is currently asserted rather than verified.

This is an implementation gap, not a protocol one. PoX-5 does expose the necessary reads — see [How the Rate is Calculated](#how-the-rate-is-calculated) for the specific functions and the completeness check that makes trustless sourcing possible. An earlier version of this document claimed otherwise; that claim was made from the SIP text rather than the deployed contract and was incorrect.

### The oracle owner cannot be changed

`pox-rate-oracle` sets `contract-owner` to `tx-sender` at deployment and provides no function to transfer it. If that key is lost, no further cycle rates can ever be submitted. Every active swap then becomes unsettleable, and because `close-swap` requires all cycles settled, collateral in those swaps would be stranded.

There is no recovery path in the current contract. The mitigation is operational: deploy from a key with a custody model appropriate to the value at risk, which the pilot caps deliberately bound. An owner-transfer function is M2 work.

### Testing used a single principal

Both legs of the on-chain runs were signed by the same address. This exercises contract behaviour, not counterparty dynamics, price discovery, or adversarial participants.

### Collateral is mock sBTC

Testnet uses a freely mintable `mock-sbtc`. Mainnet requires real sBTC, and that substitution is untested.

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
- **Oracle formula updated from pre-PoX-5 pro-rata to Tranche 2 residual calculation** (in progress — see [How the Rate is Calculated](#how-the-rate-is-calculated))
- Admin oracle submits rates per cycle
- Automatic settlement and liquidation
- **Capped pilot design — done, enforced as contract constants** (see [Capped Pilot Design](#capped-pilot-design))
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

Rho applied for the **Stacks Endowment Q2 2026 Getting Started Grant** (DeFi & Perps theme) and was **not funded**. The review feedback (July 7, 2026) was specific: the contracts, testing history, deployment status, and PoX-related assumptions weren't mature enough to fund a mainnet-bound interest rate swap product, given the risk profile of a collateralized product with oracle inputs and sBTC settlement. The feedback asked for: verifiable deployed contracts, meaningful testnet usage or simulation history, updated PoX assumptions based on the current protocol roadmap, a clearly documented oracle and settlement model, a capped pilot design with risk controls, and evidence of sustained development.

Since that rejection, PoX-5 activated (July 30, 2026) and restructured PoX yield into the three-tranche waterfall described above — which changed Rho's own thesis, not just its technical assumptions. The Q2 pitch targeted generic "PoX yield is floating" risk; Stacks' own Genesis Bond product now addresses a version of that for whitelisted anchors. Rho's Q3 application targets the risk Genesis Bond's launch *created* rather than solved: Tranche 2 (STX-only stacker) yield, now residual and structurally more volatile than before PoX-5, with no hedging instrument available to the stackers who bear it.

This is Rho's response to the Q2 feedback, applying to the **Stacks Endowment Q3 2026 grant cycle** (Bitcoin Staking & sBTC Utility track).

### Status against each point of the Q2 review

| Q2 review asked for | Status |
|---|---|
| Verifiable deployed contracts | **Done.** Live on testnet with explorer links and read-only calls anyone can run — see [Deployed Contracts](#deployed-contracts--stacks-testnet). |
| Meaningful testnet usage or simulation history | **Done.** Full three-cycle lifecycle executed on chain against real PoX-5 figures, with transaction hashes and verified outcomes — see [Testnet Evidence](#testnet-evidence--full-lifecycle-and-liquidation). |
| Updated PoX assumptions | **Done.** Rewritten around the PoX-5 three-tranche waterfall; the pre-PoX-5 pro-rata formula is gone. |
| Documented oracle and settlement model | **Done.** Raw inputs stored on chain so the rate is independently recomputable, plus dedicated oracle tests. One dependency remains open and is disclosed rather than assumed — see [How the Rate is Calculated](#how-the-rate-is-calculated). |
| Capped pilot design with risk controls | **Done.** Enforced as contract constants no key holder can raise — see [Capped Pilot Design](#capped-pilot-design). |
| Evidence of sustained development | **Partial, and stated plainly.** Development stopped after the June submission and resumed in September. That gap is real and cannot be retroactively filled. What can be shown is the work itself: a rate-precision defect found by testing against live data and fixed, contract-enforced risk caps, and a verified on-chain lifecycle. |

### Proposed milestones

$8,000 requested, split 20/30/50. Every milestone covers forward work; the testnet deployment and evidence above are supporting evidence, not funded deliverables.

Structured around Rho's mechanics rather than a generic launch sequence. A swap settles per PoX cycle — roughly two weeks on mainnet — and needs two parties wanting opposite exposure, so transaction counts measure progress poorly. Completed settlement cycles and a two-sided book are the real tests.

**M1 — Make it safe to custody collateral — 20% / $1,600**
- Two-sided variation margining, closing the unbounded fixed-party obligation in [Known Limitations](#known-limitations)
- Trustless oracle sourcing Tranche 1 obligations directly from PoX-5
- Oracle-owner transfer and recovery path
- Fuzzing targeted at settlement, liquidation and margin math
- Peer review of those paths, with named reviewers and published notes
- At least one non-deployer wallet transacting on testnet
- Release candidate ready for mainnet

**M2 — Mainnet, real counterparty, one complete cycle — 30% / $2,400**
- Verified contracts on mainnet, production frontend live against them
- At least one swap opened with a non-deployer counterparty
- At least one full PoX cycle settled on mainnet, oracle submitting on schedule, collateral moving correctly against real sBTC

The unit is a completed settlement cycle, not a swap count: several swaps that haven't reached a settlement boundary demonstrate less than one that has.

**M3 — Sustained operation and a two-sided book — 50% / $4,000**
- Oracle operated across at least 4 consecutive PoX cycles with no missed settlement
- At least 3 distinct non-deployer wallets, including at least one taking the variable side
- At least 300,000 STX total notional under hedge across settled mainnet swaps, reported alongside net sats actually settled

The variable-side requirement is deliberate. The hard problem is not finding stackers who want rate certainty — it is finding participants willing to take the floating side of a yield stream that is structurally declining.

---

## License

MIT — see [LICENSE](LICENSE)

---

<p align="center">
  Built on Stacks. Settled in Bitcoin.
</p>
