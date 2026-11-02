import { describe, expect, it } from "vitest";
import { Cl } from "@stacks/transactions";
import { worstCasePerCycle, initialMargin, maintenanceMargin, maxCollateral, offerErrors,
         MIN_NOTIONAL_USTX, MAX_NOTIONAL_USTX, MAX_FIXED_RATE } from "../frontend/lib/margin";

// The website computes deposit requirements itself so it can show them before
// a transaction is sent. If its arithmetic drifts from the contract's, users
// get told one number and rejected for another. This pins them together.
const deployer = simnet.getAccounts().get("deployer")!;
const ro = (fn: string, args: any[]) =>
  BigInt((simnet.callReadOnlyFn("rho-core-v5", fn, args, deployer).result as any).value);

describe("frontend margin maths matches rho-core-v5", () => {
  it("agrees on 500 random sets of terms", () => {
    let seed = 7;
    const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
    for (let i = 0; i < 500; i++) {
      const N = MIN_NOTIONAL_USTX + BigInt(Math.floor(rnd() * Number(MAX_NOTIONAL_USTX - MIN_NOTIONAL_USTX)));
      const F = BigInt(1 + Math.floor(rnd() * Number(MAX_FIXED_RATE)));
      const D = BigInt(1 + Math.floor(rnd() * 13));
      const R = BigInt(Math.floor(rnd() * 14));
      expect(worstCasePerCycle(N, F)).toBe(ro("worst-case-per-cycle", [Cl.uint(N), Cl.uint(F)]));
      expect(initialMargin(N, F, D)).toBe(ro("initial-margin", [Cl.uint(N), Cl.uint(F), Cl.uint(D)]));
      expect(maintenanceMargin(N, F, R)).toBe(ro("maintenance-margin", [Cl.uint(N), Cl.uint(F), Cl.uint(R)]));
      expect(maxCollateral(N, F, D)).toBe(ro("max-collateral", [Cl.uint(N), Cl.uint(F), Cl.uint(D)]));
    }
  }, 60_000);

  it("rejects the same terms the contract rejects", () => {
    expect(offerErrors(MIN_NOTIONAL_USTX - BigInt(1), BigInt(500000), BigInt(3))).toContain("Minimum swap size is 10,000 STX.");
    expect(offerErrors(MAX_NOTIONAL_USTX, MAX_FIXED_RATE + BigInt(1), BigInt(3))).toContain("Maximum fixed rate is 20,000,000.");
    expect(offerErrors(MIN_NOTIONAL_USTX, BigInt(1), BigInt(3))).toContain("The fixed rate is too low to produce a payment.");
    expect(offerErrors(MAX_NOTIONAL_USTX, BigInt(500000), BigInt(14))).toContain("Maximum duration is 13 cycles.");
    expect(offerErrors(MAX_NOTIONAL_USTX, BigInt(500000), BigInt(3))).toStrictEqual([]);
  });
});
