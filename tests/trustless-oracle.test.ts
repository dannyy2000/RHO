import { describe, expect, it } from "vitest";
import { Cl } from "@stacks/transactions";

const deployer = simnet.getAccounts().get("deployer")!;
const POX5 = "ST000000000000000000002AMW42H.pox-5";

function oracle(fn: string, args: any[] = []) {
  return simnet.callReadOnlyFn("pox-rate-oracle-trustless", fn, args, deployer).result;
}

// Scope: these tests establish that the oracle compiles and runs against the
// PoX-5 interface actually deployed on testnet (SDK 3.24.1, epoch 4.0). They do
// not assert the per-cycle delta math. Every real-cycle read of that path
// exceeds the 200,000 read_length budget on testnet, and simnet has no
// distributed cycles to exercise it, so a passing assertion here would be
// false confidence. That path is covered once the checkpoint redesign lands.
describe("trustless oracle: agreement with the live PoX-5 interface", () => {
  it("reads the same Tranche 2 accumulator PoX-5 reports", () => {
    for (const cycle of [0, 1, 5]) {
      const fromPox = simnet.callReadOnlyFn(
        POX5, "get-rewards-per-token-for-cycle", [Cl.uint(cycle), Cl.none()], deployer).result;
      expect(oracle("tranche-2-rpt", [Cl.uint(cycle)])).toStrictEqual(fromPox);
    }
  });

  it("does not underflow at cycle zero", () => {
    // No previous cycle exists; the guard must return a value, not abort.
    expect(oracle("tranche-2-accrual", [Cl.uint(0)])).toBeUint(0);
  });
});

describe("trustless oracle: cycles PoX-5 has not distributed", () => {
  it("reports an undistributed cycle as unaccounted", () => {
    expect(oracle("is-cycle-accounted", [Cl.uint(9999)])).toBeBool(false);
  });

  it("returns none rather than a zero rate for an undistributed cycle", () => {
    // some(0) would let a swap settle as though the cycle genuinely paid
    // nothing. none surfaces as ERR-ORACLE-RATE-NOT-FOUND in rho-core instead.
    expect(oracle("get-cycle-rate", [Cl.uint(9999)])).toBeNone();
  });
});

describe("trustless oracle: no admin surface", () => {
  it("exposes no public function that can submit, set, or transfer anything", () => {
    const iface = simnet.getContractsInterfaces().get(`${deployer}.pox-rate-oracle-trustless`)!;
    const publicFns = iface.functions.filter((f: any) => f.access === "public").map((f: any) => f.name);
    expect(publicFns).toStrictEqual([]);
  });
});
