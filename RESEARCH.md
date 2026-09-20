# The Subordination of STX-Only Stackers Under PoX-5

**2026-09-20**

PoX-5 restructured how Bitcoin miner revenue reaches STX stackers. The change is documented, but its arithmetic consequence does not appear to have been published: at the Bitcoin Staking program's own stated capacity target, STX-only stackers receive **nothing**.

This document shows the working. Every input is public and every step is reproducible.

---

## 1. What changed

Before PoX-5, miner BTC was distributed proportionally: a stacker holding 1% of stacked STX received 1% of the BTC that miners paid that cycle.

PoX-5 (activated 2026-07-30, [SIP-045](https://github.com/stacksgov/sips/blob/main/sips/sip-045/sip-045-pox-5-bitcoin-staking.md)) replaced that with a three-tranche waterfall, paid **in order**:

| Tranche | Who | Claim |
|---|---|---|
| 1 | Protocol bonds (Genesis Bond) — paired BTC + STX | A **guaranteed target rate**, paid first |
| 2 | STX-only stackers | **85%** of whatever remains |
| 3 | Reserve fund | The other 15%, buffering Tranche 1 in weak cycles |

The official Stacks documentation describes Tranche 2's yield as [**"residual"**](https://docs.stacks.co/pox-5/actors/stx-only-stakers) — received "after paired BTC obligations are handled."

Two consequences follow, and they are independent:

- **Tranche 2 no longer receives the whole pot**, even when no bonds exist, because the reserve takes 15%.
- **Tranche 2 is subordinated.** Tranche 1's claim is fixed and senior, so any shortfall in miner revenue is absorbed entirely by Tranche 2 before Tranche 1 is touched.

---

## 2. The pot is much smaller than it was

Miner BTC payments have fallen sharply. Recent completed cycles, from [Stacking Tracker](https://www.stacking-tracker.com/):

| Cycle | BTC paid to stackers |
|---|---|
| 138 | 2.89 |
| 139 | 2.79 |
| 140 | 2.72 |
| 141 | 2.98 |
| 142 | 3.83 |

That averages **~3 BTC per cycle**. A PoX cycle is 2,100 Bitcoin blocks (~14.6 days), so roughly 25 cycles a year:

```
3 BTC/cycle x 25 cycles = ~75 BTC/year in total miner revenue
```

For comparison, cycles 95–109 paid **31–44 BTC each** — an **85–90% decline**. Stacked supply has fallen too, from roughly 610M STX to **441,576,024 STX**.

> **Estimate, not an audited figure.** 75 BTC/year is extrapolated from five completed cycles. It cross-checks against the observable yield: 441.6M STX at ~$135.1M and a gross APY of 3.76–5.25% implies roughly $6.1M/year, which at ~$81,772/BTC is ~75 BTC. The two methods agree.

---

## 3. What this costs stackers today

Genesis Bond opened enrolment 2026-09-10. Four institutions locked approximately **250 BTC** at the published **3% BTC APY** target.

```
Tranche 1 obligation  = 250 BTC x 3%       =  7.5 BTC/year
Miner revenue                              = 75.0 BTC/year
Excess after Tranche 1                     = 67.5 BTC/year
  -> Tranche 2 (85%)                       = 57.4 BTC/year
  -> Reserve    (15%)                      = 10.1 BTC/year
```

Against the pre-PoX-5 baseline of 75 BTC/year, STX-only stackers now receive **57.4 — a 23.5% reduction.**

**That 23.5% has two distinct causes, and they should not be conflated:**

| Cause | Effect |
|---|---|
| Reserve fund's 15% share | −15.0 points — applies even with zero bonds outstanding |
| Genesis Bond's senior claim at 250 BTC | −8.5 points — grows with every BTC bonded |

Only the second part scales. That distinction is what makes the next section matter.

---

## 4. Where it goes as the programme grows

Tranche 1's claim is `bonded BTC x 3%`. Holding miner revenue at 75 BTC/year:

| BTC bonded | Tranche 1 owed | Excess | **Tranche 2 receives** | vs. 75 baseline |
|---|---|---|---|---|
| 0 | 0.0 | 75.0 | 63.75 | −15.0% |
| **250** (today) | 7.5 | 67.5 | **57.38** | **−23.5%** |
| 500 | 15.0 | 60.0 | 51.00 | −32.0% |
| 1,000 | 30.0 | 45.0 | 38.25 | −49.0% |
| 1,500 | 45.0 | 30.0 | 25.50 | −66.0% |
| 2,000 | 60.0 | 15.0 | 12.75 | −83.0% |
| **2,500** | **75.0** | **0.0** | **0.00** | **−100%** |
| 3,000 (target) | 90.0 | — | 0.00 | unpayable |

**Tranche 2 reaches zero at 2,500 BTC bonded:**

```
75 BTC/year ÷ 3% = 2,500 BTC
```

The Bitcoin Staking programme's stated capacity target is **3,000 BTC**. At that level the Tranche 1 obligation is 90 BTC/year against 75 BTC/year of revenue — a claim exceeding the entire pot, before Tranche 2 receives anything at all.

---

## 5. What that implies

At current miner revenue, the programme's published target and a non-zero residual for STX-only stackers **cannot both hold**. One of the following has to give:

1. **Miner revenue rises substantially.** Miner BTC spend would need to roughly double to serve 3,000 BTC of bonds while leaving stackers a meaningful residual. Miner spend is driven by the value of STX block rewards, so this is not within the Endowment's direct control.
2. **Bonded capacity stays well below target.** Plausible during the whitelisted bootstrap, but PoX-6 opens capacity to a permissionless auction.
3. **The reserve absorbs the gap.** It accrues from cycle excess — precisely the quantity that shrinks to zero in this scenario. SIP-045 also places the reserve in accrual-only mode during PoX-5, spendable only through a consensus path.
4. **Stacker yield goes to zero.** The default outcome if none of the above changes.

SIP-045 anticipates the stress: under a sustained shortfall, returns "compress first for STX-only stakers and later for protocol-bond holders." This analysis quantifies when that begins — and finds it begins below the programme's own target, not beyond it.

---

## 6. Why this creates demand for a hedging instrument

Two properties of the new structure make STX-only stacker yield harder to plan around than it was before PoX-5:

- **It is residual.** Stacker yield is now the *remainder* after a fixed senior claim, so it is more volatile than the underlying miner revenue. A 10% fall in miner revenue produces a larger than 10% fall in stacker yield once Tranche 1 is subtracted.
- **It has a second driver.** Yield previously moved only with miner competition. It now also moves with the size of the bond pool — a quantity set by Endowment policy and, later, by auction.

Neither is a defect in PoX-5. Seniority is how a guaranteed rate gets funded, and the guarantee is the point of the product. But the party whose yield absorbs that variance has no instrument to transfer it, while the senior tranche has a guaranteed rate by construction.

That asymmetry is the gap [Rho Protocol](./README.md) addresses: a fixed-for-floating swap on the Tranche 2 residual rate, letting a stacker convert a residual claim into a fixed one, and letting a counterparty take the floating side deliberately.

**Rho's position improves as the programme succeeds.** Every additional BTC bonded enlarges the senior claim sitting ahead of Tranche 2 and increases the variance stackers carry. The instrument becomes more useful precisely as Bitcoin Staking grows.

---

## 7. Method, sources, and caveats

**Reproduce the table:**

```python
REV, RATE = 75.0, 0.03          # BTC/year miner revenue; Genesis Bond target
for x in (0, 250, 500, 1000, 1500, 2000, 2500, 3000):
    t1 = x * RATE
    t2 = 0 if t1 >= REV else (REV - t1) * 0.85
    print(x, round(t1, 1), round(t2, 2), f"{(t2/REV - 1) * 100:.1f}%")
```

**Caveats, stated plainly:**

- **75 BTC/year is an extrapolation** from five completed cycles, not an audited annual figure. Miner revenue is volatile; the conclusion's *timing* moves with it, though its *direction* does not.
- **The table holds miner revenue constant** while bonded capacity grows. Both move in reality.
- **~250 BTC bonded** comes from press reporting of the Genesis Bond launch, not an on-chain census.
- **3% is the published target**, not a guarantee. SIP-045 permits compression under sustained shortfall, which is the mechanism this analysis describes.
- The reserve fund may hold backstops not visible in the sources consulted. The full whitepaper PDF could not be parsed in preparation of this document.

**Sources:**

- [SIP-045: PoX-5 Bitcoin Staking](https://github.com/stacksgov/sips/blob/main/sips/sip-045/sip-045-pox-5-bitcoin-staking.md) — tranche waterfall, reserve mechanics, compression order
- [STX-Only Stakers, PoX-5 documentation](https://docs.stacks.co/pox-5/actors/stx-only-stakers) — "residual" characterisation
- [Bitcoin Staking Genesis Bond: How It Works](https://www.stacks.co/blog/bitcoin-staking-genesis-bond-how-it-works) — 3% target, 6-month term, whitelist, PoX-6 path
- [Stacking Tracker](https://www.stacking-tracker.com/) — per-cycle BTC payouts, stacked supply, APY
- [Stacks launches Genesis Bond](https://cryptobriefing.com/stacks-genesis-bond-bitcoin-staking/) — enrolment date, allocation
- [Stacks PoX Upgrade — Castle Labs](https://research.castlelabs.io/p/stacks-pox-upgrade-solving-btc-capital) — senior/junior tranche framing

*Corrections welcome. If any input here is wrong, the conclusion should change with it — the arithmetic is deliberately simple so that it can be checked.*
