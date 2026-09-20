import { describe, expect, it } from "vitest";
import { Cl } from "@stacks/transactions";

const accounts = simnet.getAccounts();
const deployer = accounts.get("deployer")!;
const wallet1 = accounts.get("wallet_1")!;  // fixed party
const wallet2 = accounts.get("wallet_2")!;  // variable party

function realRate(cycle: number) {
  // cycle-142 actuals -> 679,497
  simnet.callPublicFn("pox-rate-oracle-v2", "submit-cycle-rate",
    [Cl.uint(cycle), Cl.uint(383_000_000), Cl.uint(30_000_000), Cl.uint(441_576_024_000_000)], deployer);
}

describe("audit: fixed-party insolvency", () => {
  it("shows what happens when the fixed party cannot cover what it owes", () => {
    simnet.callPublicFn("mock-sbtc", "mint", [Cl.uint(100_000_000), Cl.principal(wallet1)], deployer);
    simnet.callPublicFn("mock-sbtc", "mint", [Cl.uint(100_000_000), Cl.principal(wallet2)], deployer);

    // Fixed party posts only 200,000 sats against a 1M STX notional at a low
    // fixed rate. When the actual rate comes in far above, it owes 579,497 but
    // holds only 200,000.
    simnet.callPublicFn("rho-core-v3", "post-offer",
      [Cl.uint(1_000_000_000_000), Cl.uint(100_000), Cl.uint(2), Cl.uint(200_000)], wallet1);
    simnet.callPublicFn("rho-core-v3", "accept-offer",
      [Cl.uint(1), Cl.uint(10_000_000)], wallet2);
    realRate(0);

    const { result } = simnet.callPublicFn("rho-core-v3", "settle-cycle",
      [Cl.uint(1), Cl.uint(0)], deployer);

    // The settlement record says the variable party is owed 679,497.
    expect(result).toBeOk(Cl.tuple({
      "fixed-payment": Cl.uint(100_000),
      "variable-payment": Cl.uint(679_497),
    }));

    const swap = simnet.callReadOnlyFn("rho-core-v3", "get-swap", [Cl.uint(1)], deployer).result;
    const f = (swap as any).value.value;

    // Fixed collateral is drained to zero...
    expect(f["fixed-collateral"]).toBeUint(0);
    // ...but the variable party only received the 200,000 that existed,
    // not the 579,497 net it was owed. Shortfall: 379,497.
    expect(f["variable-collateral"]).toBeUint(10_200_000);
    // And the swap is still ACTIVE - no liquidation, no margin call on the
    // fixed side. It continues with a counterparty holding nothing.
    expect(f["status"]).toBeUint(0);
  });

  it("lets a second cycle settle against a fixed party holding nothing", () => {
    simnet.callPublicFn("mock-sbtc", "mint", [Cl.uint(100_000_000), Cl.principal(wallet1)], deployer);
    simnet.callPublicFn("mock-sbtc", "mint", [Cl.uint(100_000_000), Cl.principal(wallet2)], deployer);

    simnet.callPublicFn("rho-core-v3", "post-offer",
      [Cl.uint(1_000_000_000_000), Cl.uint(100_000), Cl.uint(2), Cl.uint(200_000)], wallet1);
    simnet.callPublicFn("rho-core-v3", "accept-offer",
      [Cl.uint(1), Cl.uint(10_000_000)], wallet2);
    realRate(0);
    realRate(1);

    simnet.callPublicFn("rho-core-v3", "settle-cycle", [Cl.uint(1), Cl.uint(0)], deployer);
    simnet.callPublicFn("rho-core-v3", "settle-cycle", [Cl.uint(1), Cl.uint(1)], deployer);

    const swap = simnet.callReadOnlyFn("rho-core-v3", "get-swap", [Cl.uint(1)], deployer).result;
    const f = (swap as any).value.value;
    // Second cycle transfers nothing at all - the variable party is owed
    // another 579,497 and receives zero.
    expect(f["variable-collateral"]).toBeUint(10_200_000);
    expect(f["cycles-settled"]).toBeUint(2);
  });
});

describe("audit: pilot cap enforcement", () => {
  it("rejects a fixed rate above the sanity bound", () => {
    simnet.callPublicFn("mock-sbtc", "mint", [Cl.uint(100_000_000), Cl.principal(wallet1)], deployer);
    const { result } = simnet.callPublicFn("rho-core-v3", "post-offer",
      [Cl.uint(1_000_000), Cl.uint(1_000_000_001), Cl.uint(1), Cl.uint(1_000_000)], wallet1);
    expect(result).toBeErr(Cl.uint(113)); // ERR-EXCEEDS-RATE-CAP
  });

  it("rejects accepting past the protocol-wide notional cap", () => {
    simnet.callPublicFn("mock-sbtc", "mint", [Cl.uint(1_000_000_000), Cl.principal(wallet1)], deployer);
    simnet.callPublicFn("mock-sbtc", "mint", [Cl.uint(1_000_000_000), Cl.principal(wallet2)], deployer);

    // Five swaps at the 1M STX per-swap cap fill the 5M STX protocol cap.
    for (let i = 1; i <= 5; i++) {
      simnet.callPublicFn("rho-core-v3", "post-offer",
        [Cl.uint(1_000_000_000_000), Cl.uint(500_000), Cl.uint(1), Cl.uint(1_000_000)], wallet1);
      simnet.callPublicFn("rho-core-v3", "accept-offer", [Cl.uint(i), Cl.uint(1_000_000)], wallet2);
    }
    // A sixth must be refused.
    simnet.callPublicFn("rho-core-v3", "post-offer",
      [Cl.uint(1_000_000_000_000), Cl.uint(500_000), Cl.uint(1), Cl.uint(1_000_000)], wallet1);
    const { result } = simnet.callPublicFn("rho-core-v3", "accept-offer",
      [Cl.uint(6), Cl.uint(1_000_000)], wallet2);
    expect(result).toBeErr(Cl.uint(114)); // ERR-EXCEEDS-TOTAL-NOTIONAL-CAP
  });
});
