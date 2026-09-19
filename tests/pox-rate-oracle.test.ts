import { describe, expect, it } from "vitest";
import { Cl } from "@stacks/transactions";

const accounts = simnet.getAccounts();
const deployer = accounts.get("deployer")!;
const wallet1 = accounts.get("wallet_1")!;

describe("PoX-5 rate oracle", () => {
  it("derives the Tranche 2 rate from the PoX-5 waterfall", () => {
    // miner revenue 1000 sats, of which 200 is owed to Tranche 1 (protocol bonds).
    // post-Tranche-1 = 800. Tranche 2 receives 85% = 680. Reserve takes the other 15%.
    // rate = 680 × 1,000,000 ÷ 1,000,000 = 680 bps
    const { result } = simnet.callPublicFn(
      "pox-rate-oracle",
      "submit-cycle-rate",
      [Cl.uint(5), Cl.uint(1000), Cl.uint(200), Cl.uint(1_000_000)],
      deployer
    );
    expect(result).toBeOk(Cl.uint(680));
  });

  it("subtracts the Tranche 1 obligation before Tranche 2's share", () => {
    // Same miner revenue as above but zero bonds outstanding: Tranche 2 receives
    // 85% of the full 1000 = 850. This is the pre-PoX-5 case, and the gap between
    // 850 and 680 is exactly what Genesis Bond growth takes from STX-only stackers.
    const { result } = simnet.callPublicFn(
      "pox-rate-oracle",
      "submit-cycle-rate",
      [Cl.uint(6), Cl.uint(1000), Cl.uint(0), Cl.uint(1_000_000)],
      deployer
    );
    expect(result).toBeOk(Cl.uint(850));
  });

  it("rejects an obligation larger than miner revenue", () => {
    // Tranche 1 cannot be owed more than miners actually paid. Without this guard
    // the subtraction would underflow and abort with an opaque runtime error.
    const { result } = simnet.callPublicFn(
      "pox-rate-oracle",
      "submit-cycle-rate",
      [Cl.uint(7), Cl.uint(500), Cl.uint(501), Cl.uint(1_000_000)],
      deployer
    );
    expect(result).toBeErr(Cl.uint(204)); // ERR-OBLIGATION-EXCEEDS-REVENUE
  });

  it("rejects a second submission for the same cycle", () => {
    simnet.callPublicFn("pox-rate-oracle", "submit-cycle-rate",
      [Cl.uint(8), Cl.uint(1000), Cl.uint(200), Cl.uint(1_000_000)], deployer);

    const { result } = simnet.callPublicFn("pox-rate-oracle", "submit-cycle-rate",
      [Cl.uint(8), Cl.uint(9999), Cl.uint(0), Cl.uint(1_000_000)], deployer);
    expect(result).toBeErr(Cl.uint(201)); // ERR-CYCLE-RATE-EXISTS
  });

  it("rejects submissions from a non-admin caller", () => {
    const { result } = simnet.callPublicFn("pox-rate-oracle", "submit-cycle-rate",
      [Cl.uint(9), Cl.uint(1000), Cl.uint(200), Cl.uint(1_000_000)], wallet1);
    expect(result).toBeErr(Cl.uint(200)); // ERR-NOT-AUTHORIZED
  });

  it("rejects a cycle with zero stacked STX", () => {
    const { result } = simnet.callPublicFn("pox-rate-oracle", "submit-cycle-rate",
      [Cl.uint(10), Cl.uint(1000), Cl.uint(200), Cl.uint(0)], deployer);
    expect(result).toBeErr(Cl.uint(203)); // ERR-ZERO-STACKED
  });

  it("stores the derived pool alongside the raw inputs for auditability", () => {
    simnet.callPublicFn("pox-rate-oracle", "submit-cycle-rate",
      [Cl.uint(11), Cl.uint(1000), Cl.uint(200), Cl.uint(1_000_000)], deployer);

    const stored = simnet.callReadOnlyFn(
      "pox-rate-oracle", "get-cycle-rate", [Cl.uint(11)], deployer
    ).result;

    // The raw inputs are kept so anyone can recompute the rate from the formula
    // rather than trusting the submitted number.
    const fields = (stored as any).value.value;
    expect(fields["miner-revenue-sats"]).toBeUint(1000);
    expect(fields["tranche-1-obligation-sats"]).toBeUint(200);
    expect(fields["tranche-2-pool-sats"]).toBeUint(680);
    expect(fields["total-ustx-stacked"]).toBeUint(1_000_000);
    expect(fields["rate-bps"]).toBeUint(680);
  });
});
