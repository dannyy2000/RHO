import { describe, expect, it } from "vitest";
import { Cl } from "@stacks/transactions";

const accounts = simnet.getAccounts();
const deployer = accounts.get("deployer")!;

// Regression guard for the rate-precision bug.
//
// The unit scalar was originally sats per 1,000,000 uSTX, i.e. per 1 STX. Real
// PoX yield is around 0.5 sats per STX per cycle, so under Clarity's integer
// division every real cycle floored to a rate of 0 — making every settlement a
// no-op while the toy-scale unit tests continued to pass. These cases pin the
// contract against live mainnet-scale figures so the unit cannot silently
// regress to a scalar that truncates real yield away.
describe("rate math against real observed PoX-5 data", () => {
  const STACKED_USTX = 441_576_024_000_000; // 441,576,024 STX stacked (Tranche 2)
  const TRANCHE_1_PER_CYCLE = 30_000_000;   // ~250 BTC bonded at 3%, spread over ~25 cycles

  it("produces a usable non-zero rate for a real cycle", () => {
    // Cycle 142 actual: miners paid 3.83 BTC.
    // post-Tranche-1 = 353,000,000 sats; Tranche 2's 85% share = 300,050,000 sats.
    const { result } = simnet.callPublicFn(
      "pox-rate-oracle-v2",
      "submit-cycle-rate",
      [Cl.uint(142), Cl.uint(383_000_000), Cl.uint(TRANCHE_1_PER_CYCLE), Cl.uint(STACKED_USTX)],
      deployer
    );
    expect(result).toBeOk(Cl.uint(679_497));
  });

  it("keeps real cycles distinguishable from one another", () => {
    // Cycle 140 paid 2.72 BTC against cycle 142's 3.83. Under the old scalar both
    // collapsed to 0 and were indistinguishable, which is what made the bug invisible.
    const c140 = simnet.callPublicFn("pox-rate-oracle-v2", "submit-cycle-rate",
      [Cl.uint(140), Cl.uint(272_000_000), Cl.uint(TRANCHE_1_PER_CYCLE), Cl.uint(STACKED_USTX)],
      deployer).result;
    const c141 = simnet.callPublicFn("pox-rate-oracle-v2", "submit-cycle-rate",
      [Cl.uint(141), Cl.uint(298_000_000), Cl.uint(TRANCHE_1_PER_CYCLE), Cl.uint(STACKED_USTX)],
      deployer).result;

    expect(c140).toBeOk(Cl.uint(465_831));
    expect(c141).toBeOk(Cl.uint(515_879));
  });

  it("settles a real-scale swap to a non-zero payment", () => {
    simnet.callPublicFn("mock-sbtc", "mint", [Cl.uint(100_000_000), Cl.principal(deployer)], deployer);

    // 1,000,000 STX notional — the per-swap pilot cap — at a fixed rate of
    // 500,000 sats per 1M STX per cycle, against cycle 142's actual 679,497.
    simnet.callPublicFn("rho-core-v4", "post-offer",
      [Cl.uint(1_000_000_000_000), Cl.uint(500_000), Cl.uint(1), Cl.uint(10_000_000)], deployer);
    simnet.callPublicFn("rho-core-v4", "accept-offer",
      [Cl.uint(1), Cl.uint(10_000_000)], deployer);
    simnet.callPublicFn("pox-rate-oracle-v2", "submit-cycle-rate",
      [Cl.uint(0), Cl.uint(383_000_000), Cl.uint(TRANCHE_1_PER_CYCLE), Cl.uint(STACKED_USTX)], deployer);

    const { result } = simnet.callPublicFn("rho-core-v4", "settle-cycle",
      [Cl.uint(1), Cl.uint(0)], deployer);

    // Both legs must move real sats: 1e12 uSTX x rate / 1e12 = rate.
    expect(result).toBeOk(Cl.tuple({
      "fixed-payment": Cl.uint(500_000),
      "variable-payment": Cl.uint(679_497),
    }));
  });
});
