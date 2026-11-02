import { describe, expect, it } from "vitest";
import { Cl } from "@stacks/transactions";

// Randomized lifecycle testing for rho-core-v5. Each run opens a swap with
// random terms, then applies a random sequence of settlements, top-ups,
// elapsed blocks and liquidation attempts, checking the invariants below after
// every step. Runs are seeded so a failure can be replayed exactly.
//
//   1. Conservation: sats held by both parties and the contract never change.
//   2. Escrow: the contract holds exactly both sides' collateral.
//   3. Ceiling: no settlement moves more than one cycle of worst case.
//   4. Calls: a side has an open margin call if and only if it is below
//      maintenance after a settlement or top-up.
//   5. Liquidation succeeds only after an expired call.
//   6. A top-up succeeds only if it leaves the side at or below the
//      full-term worst case + 10%, and fails with u118 otherwise.
//   7. Every swap can always be driven to an end, leaving nothing in escrow.

const accounts = simnet.getAccounts();
const deployer = accounts.get("deployer")!;
const fixedParty = accounts.get("wallet_1")!;
const variableParty = accounts.get("wallet_2")!;
const keeper = accounts.get("wallet_3")!;
const CORE = "rho-core-v5";
const CORE_ID = `${deployer}.${CORE}`;

const SCALAR = 1_000_000_000_000n;
const MIN_N = 10_000_000_000n;
const MAX_N = 1_000_000_000_000n;
const MAX_F = 20_000_000n;
const GRACE = 144;

const RUNS = Number(process.env.FUZZ_RUNS ?? 150);
const SEED = Number(process.env.FUZZ_SEED ?? 20261024);

// mulberry32: small, fast, seedable.
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const between = (r: () => number, lo: bigint, hi: bigint) =>
  lo + BigInt(Math.floor(r() * Number(hi - lo + 1n)));

const balance = (who: string): bigint =>
  BigInt((simnet.callReadOnlyFn("mock-sbtc", "get-balance", [Cl.principal(who)], deployer).result as any).value.value);
const swapOf = (id: number): any =>
  (simnet.callReadOnlyFn(CORE, "get-swap", [Cl.uint(id)], deployer).result as any).value.value;
const big = (cv: any) => BigInt(cv.value);
const min = (a: bigint, b: bigint) => (a < b ? a : b);

describe("rho-core-v5 fuzz", () => {
  it(`keeps every invariant across ${RUNS} random swaps (seed ${SEED})`, () => {
    const r = rng(SEED);
    simnet.callPublicFn("mock-sbtc", "mint", [Cl.uint(10n ** 15n), Cl.principal(fixedParty)], deployer);
    simnet.callPublicFn("mock-sbtc", "mint", [Cl.uint(10n ** 15n), Cl.principal(variableParty)], deployer);
    const total = () => balance(fixedParty) + balance(variableParty) + balance(CORE_ID);
    const TOTAL = total();
    const stats = { settles: 0, calls: 0, topups: 0, liquidations: 0, closes: 0, shortfalls: 0 };

    for (let run = 1; run <= RUNS; run++) {
      const ctx = `run ${run} (seed ${SEED})`;
      const N = between(r, MIN_N, MAX_N);
      const minF = (SCALAR + N - 1n) / N;               // smallest rate with a non-zero payment
      const F = between(r, minF, MAX_F);
      const D = between(r, 1n, 13n);
      const W = (N * F + SCALAR - 1n) / SCALAR;      // rounded up, as in the contract
      const initial = (W * min(D, 2n) * 110n) / 100n;
      const maxCol = (W * D * 110n) / 100n;
      // Half the swaps start at the minimum deposit, where margin calls,
      // liquidations and shortfalls actually happen.
      const fixedCol = r() < 0.5 ? initial : between(r, initial, maxCol);
      const varCol = r() < 0.5 ? initial : between(r, initial, maxCol);
      const maint = (remaining: bigint) => W * min(remaining, 2n);

      expect(simnet.callPublicFn(CORE, "post-offer", [Cl.uint(N), Cl.uint(F), Cl.uint(D), Cl.uint(fixedCol)], fixedParty).result,
        ctx).toBeOk(Cl.uint(run));
      expect(simnet.callPublicFn(CORE, "accept-offer", [Cl.uint(run), Cl.uint(varCol)], variableParty).result,
        ctx).toBeOk(Cl.uint(run));

      const checkLive = (label: string) => {
        const s = swapOf(run);
        const fc = big(s["fixed-collateral"]), vc = big(s["variable-collateral"]);
        expect(total(), `${ctx} ${label}: conservation`).toBe(TOTAL);
        if (big(s.status) === 0n) {
          expect(balance(CORE_ID), `${ctx} ${label}: escrow`).toBe(fc + vc);
        } else {
          expect(balance(CORE_ID), `${ctx} ${label}: escrow after end`).toBe(0n);
        }
        return s;
      };
      const checkCalls = (label: string) => {
        const s = swapOf(run);
        if (big(s.status) !== 0n) return;
        const req = maint(D - big(s["cycles-settled"]));
        for (const side of ["fixed", "variable"] as const) {
          const below = big(s[`${side}-collateral`]) < req;
          expect(big(s[`${side}-call-deadline`]) > 0n, `${ctx} ${label}: ${side} call iff below maintenance`).toBe(below);
        }
      };

      const steps = Number(between(r, 1n, 12n));
      for (let step = 0; step < steps; step++) {
        const before = swapOf(run);
        if (big(before.status) !== 0n) break;
        const pick = r();
        if (pick < 0.5) {
          if (big(before["cycles-settled"]) >= D) continue;
          // Rates: zero, at fixed, at the ceiling, random up to 2x, or far above it.
          const mode = r();
          const rate = mode < 0.15 ? 0n : mode < 0.3 ? F : mode < 0.4 ? 2n * F
            : mode < 0.8 ? between(r, 0n, 2n * F) : between(r, 2n * F, 50n * F + 1n);
          const fc0 = big(before["fixed-collateral"]), vc0 = big(before["variable-collateral"]);
          simnet.callPrivateFn(CORE, "apply-settlement", [Cl.uint(run), Cl.uint(rate)], keeper);
          stats.settles++;
          const s = checkLive(`settle@${rate}`);
          if (big(s.status) === 0n) {
            const moved = fc0 > big(s["fixed-collateral"]) ? fc0 - big(s["fixed-collateral"]) : vc0 - big(s["variable-collateral"]);
            expect(moved <= W, `${ctx}: settlement moved ${moved} > W ${W}`).toBe(true);
            checkCalls(`settle@${rate}`);
            if (big(s["fixed-call-deadline"]) > 0n || big(s["variable-call-deadline"]) > 0n) stats.calls++;
          } else stats.shortfalls++;
        } else if (pick < 0.62) {
          const who = r() < 0.5 ? fixedParty : variableParty;
          const side = who === fixedParty ? "fixed" : "variable";
          const cur = big(before[`${side}-collateral`]);
          const room = maxCol > cur ? maxCol - cur : 0n;  // winnings can already exceed the limit
          const amount = between(r, 1n, room + 2n);       // occasionally over the limit
          const res = simnet.callPublicFn(CORE, "top-up", [Cl.uint(run), Cl.uint(amount)], who).result;
          if (amount <= room) { expect(res, `${ctx}: top-up ${amount}`).toBeOk(Cl.uint(big(before[`${side}-collateral`]) + amount)); stats.topups++; }
          else expect(res, `${ctx}: over-limit top-up`).toBeErr(Cl.uint(118));
          checkLive("top-up"); checkCalls("top-up");
        } else if (pick < 0.75) {
          simnet.mineEmptyBurnBlocks(Number(between(r, 1n, 200n)));
        } else {
          // Usually let an open call expire first, so liquidation is exercised.
          if ((big(before["fixed-call-deadline"]) > 0n || big(before["variable-call-deadline"]) > 0n) && r() < 0.7)
            simnet.mineEmptyBurnBlocks(GRACE + 1);
          const h = BigInt(simnet.burnBlockHeight);
          const fd = big(before["fixed-call-deadline"]), vd = big(before["variable-call-deadline"]);
          const due = (fd > 0n && h + 1n > fd) || (vd > 0n && h + 1n > vd);
          const res = simnet.callPublicFn(CORE, "liquidate", [Cl.uint(run)], keeper).result;
          if (due) { expect(res, `${ctx}: due liquidation`).toHaveProperty("type", "ok"); stats.liquidations++; }
          else expect(res, `${ctx}: premature liquidation`).toBeErr(Cl.uint(120));
          checkLive("liquidate");
        }
      }

      // Invariant 7: drive the swap to an end, settling at random rates and
      // liquidating any expired call, and confirm nothing is left behind.
      for (let guard = 0; guard < 40 && big(swapOf(run).status) === 0n; guard++) {
        const s = swapOf(run);
        if (big(s["cycles-settled"]) < D) {
          simnet.callPrivateFn(CORE, "apply-settlement", [Cl.uint(run), Cl.uint(between(r, 0n, 3n * F))], keeper);
          checkLive("drive-settle");
        } else if (big(s["fixed-call-deadline"]) > 0n || big(s["variable-call-deadline"]) > 0n) {
          simnet.mineEmptyBurnBlocks(GRACE + 1);
          expect(simnet.callPublicFn(CORE, "liquidate", [Cl.uint(run)], keeper).result).toHaveProperty("type", "ok");
          stats.liquidations++;
        } else {
          expect(simnet.callPublicFn(CORE, "close-swap", [Cl.uint(run)], keeper).result, `${ctx}: close`).toHaveProperty("type", "ok");
          stats.closes++;
        }
      }
      const end = checkLive("end");
      expect(big(end.status) === 1n || big(end.status) === 2n, `${ctx}: swap ended`).toBe(true);
      expect(balance(CORE_ID), `${ctx}: nothing left in escrow`).toBe(0n);
    }

    const u = (simnet.callReadOnlyFn(CORE, "get-pilot-utilisation", [], deployer).result as any).value;
    expect(big(u["active-notional-ustx"])).toBe(0n);
    expect(big(u["active-swap-count"])).toBe(0n);
    console.log(`fuzz seed ${SEED}: ${RUNS} swaps`, stats);
  }, 600_000);
});
