import { describe, expect, it } from "vitest";
import { Cl } from "@stacks/transactions";

const deployer = simnet.getAccounts().get("deployer")!;
const POX5 = "ST000000000000000000002AMW42H.pox-5";

function oracle(fn: string, args: any[] = []) {
  return simnet.callReadOnlyFn("pox-rate-oracle-trustless", fn, args, deployer).result;
}

// Simnet has no distributed cycles, so every pox-5 entry here is zero. These
// tests cover agreement with the pox-5 interface, the unit conversion against
// real recorded entries, and the finality boundary. That a real cycle returns
// a rate within the read budget is verified on testnet; see README.md.
describe("trustless oracle: agreement with the live PoX-5 interface", () => {
  it("reads the same Tranche 2 entry PoX-5 reports", () => {
    for (const cycle of [0, 1, 5]) {
      const fromPox = simnet.callReadOnlyFn(
        POX5, "get-rewards-per-token-for-cycle", [Cl.uint(cycle), Cl.none()], deployer).result;
      expect(oracle("tranche-2-rpt", [Cl.uint(cycle)])).toStrictEqual(fromPox);
    }
  });
});

describe("trustless oracle: per-cycle entry is the rate", () => {
  // Entries recorded from pox-5 get-rewards-per-token-for-cycle(cycle, none).
  // Each is that cycle's own value, not a running total: mainnet cycle 143 is
  // lower than 142, which a cumulative reading would turn into a zero rate.
  it("converts real mainnet entries to sats per 1M STX", () => {
    expect(oracle("rate-from-rpt", [Cl.uint(758607677183n)])).toBeUint(758607);  // cycle 141
    expect(oracle("rate-from-rpt", [Cl.uint(909456324512n)])).toBeUint(909456);  // cycle 142
    expect(oracle("rate-from-rpt", [Cl.uint(903631748280n)])).toBeUint(903631);  // cycle 143
  });

  it("converts a real testnet entry to sats per 1M STX", () => {
    expect(oracle("rate-from-rpt", [Cl.uint(6162564939956n)])).toBeUint(6162564); // cycle 20
  });
});

describe("trustless oracle: a cycle is final only once pox-5 can no longer credit it", () => {
  it("places finality at the start of the second half of the next cycle", () => {
    // Testnet: 900-block cycles from height 0. Cycle 25 spans 22,500-23,399;
    // its last credit can happen until 23,850, the midpoint of cycle 26.
    expect(oracle("cycle-final-height", [Cl.uint(25)])).toBeUint(23850);
    expect(oracle("cycle-final-height", [Cl.uint(0)])).toBeUint(1350);
  });

  it("is not final one block before that height, and final at it", () => {
    const target = 1350;
    const now = simnet.burnBlockHeight;
    if (now < target - 1) simnet.mineEmptyBurnBlocks(target - 1 - now);
    expect(oracle("is-cycle-final", [Cl.uint(0)])).toBeBool(false);
    simnet.mineEmptyBurnBlock();
    expect(oracle("is-cycle-final", [Cl.uint(0)])).toBeBool(true);
  });

  it("returns none for a cycle that is not yet final", () => {
    // A partial entry would let a swap settle on half a cycle's rewards.
    expect(oracle("get-cycle-rate", [Cl.uint(9999)])).toBeNone();
  });

  it("returns none rather than a zero rate for a final cycle with no entry", () => {
    // some(0) would settle as though the cycle paid nothing. none surfaces as
    // ERR-ORACLE-RATE-NOT-FOUND in rho-core instead.
    const target = 1350;
    const now = simnet.burnBlockHeight;
    if (now < target) simnet.mineEmptyBurnBlocks(target - now);
    expect(oracle("is-cycle-final", [Cl.uint(0)])).toBeBool(true);
    expect(oracle("get-cycle-rate", [Cl.uint(0)])).toBeNone();
  });
});

describe("trustless oracle: no admin surface", () => {
  it("exposes no public function that can submit, set, or transfer anything", () => {
    const iface = simnet.getContractsInterfaces().get(`${deployer}.pox-rate-oracle-trustless`)!;
    const publicFns = iface.functions.filter((f: any) => f.access === "public").map((f: any) => f.name);
    expect(publicFns).toStrictEqual([]);
  });
});
