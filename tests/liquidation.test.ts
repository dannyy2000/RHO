import { describe, expect, it } from "vitest";
import { Cl } from "@stacks/transactions";

const accounts = simnet.getAccounts();
const deployer = accounts.get("deployer")!;
const wallet1 = accounts.get("wallet_1")!;  // fixed party
const wallet2 = accounts.get("wallet_2")!;  // variable party

// The liquidation branch releases pilot capacity. That release was once written
// twice, which underflowed active-notional-ustx to abort the whole call: the
// position could never be liquidated, settle-cycle failed permanently, and
// because close-swap requires every cycle settled, both parties' collateral was
// trapped. These cases exercise the branch end to end so it stays covered.
describe("liquidation path", () => {
  function openUnderMarginedSwap() {
    simnet.callPublicFn("mock-sbtc", "mint", [Cl.uint(100_000_000), Cl.principal(wallet1)], deployer);
    simnet.callPublicFn("mock-sbtc", "mint", [Cl.uint(100_000_000), Cl.principal(wallet2)], deployer);

    // 1M STX notional, fixed 600,000/cycle, 3 cycles. The variable party posts
    // 700,000 sats: enough for this cycle's 134,169, but far under the 110%
    // margin required against the two cycles still to run.
    simnet.callPublicFn("rho-core-v3", "post-offer",
      [Cl.uint(1_000_000_000_000), Cl.uint(600_000), Cl.uint(3), Cl.uint(10_000_000)], wallet1);
    simnet.callPublicFn("rho-core-v3", "accept-offer",
      [Cl.uint(1), Cl.uint(700_000)], wallet2);
    // Real cycle-140 data: rate 465,831, below the fixed rate, so the variable
    // party owes the difference.
    simnet.callPublicFn("pox-rate-oracle-v2", "submit-cycle-rate",
      [Cl.uint(0), Cl.uint(272_000_000), Cl.uint(30_000_000), Cl.uint(441_576_024_000_000)], deployer);
  }

  it("settles rather than aborting when the margin is breached", () => {
    openUnderMarginedSwap();
    const { result } = simnet.callPublicFn("rho-core-v3", "settle-cycle",
      [Cl.uint(1), Cl.uint(0)], deployer);

    // fixed owed 600,000, actual 465,831 -> variable pays 134,169.
    expect(result).toBeOk(Cl.tuple({
      "fixed-payment": Cl.uint(600_000),
      "variable-payment": Cl.uint(465_831),
    }));
  });

  it("marks the swap liquidated and returns both balances", () => {
    openUnderMarginedSwap();
    simnet.callPublicFn("rho-core-v3", "settle-cycle", [Cl.uint(1), Cl.uint(0)], deployer);

    const swap = simnet.callReadOnlyFn("rho-core-v3", "get-swap", [Cl.uint(1)], deployer).result;
    const f = (swap as any).value.value;
    expect(f["status"]).toBeUint(2);              // liquidated
    expect(f["fixed-collateral"]).toBeUint(0);    // paid out
    expect(f["variable-collateral"]).toBeUint(0);

    // Fixed party: 10,000,000 posted + 134,169 received = 10,134,169.
    // Variable party: 700,000 posted - 134,169 paid = 565,831.
    const w1 = simnet.callReadOnlyFn("mock-sbtc", "get-balance", [Cl.principal(wallet1)], wallet1).result;
    const w2 = simnet.callReadOnlyFn("mock-sbtc", "get-balance", [Cl.principal(wallet2)], wallet2).result;
    expect(w1).toBeOk(Cl.uint(100_000_000 - 10_000_000 + 10_134_169));
    expect(w2).toBeOk(Cl.uint(100_000_000 - 700_000 + 565_831));
  });

  it("releases pilot capacity exactly once on liquidation", () => {
    openUnderMarginedSwap();
    simnet.callPublicFn("rho-core-v3", "settle-cycle", [Cl.uint(1), Cl.uint(0)], deployer);

    // A double release underflows here instead of returning full headroom.
    const util = simnet.callReadOnlyFn("rho-core-v3", "get-pilot-utilisation", [], deployer).result;
    expect(util).toBeTuple({
      "active-notional-ustx": Cl.uint(0),
      "active-swap-count": Cl.uint(0),
      "notional-headroom-ustx": Cl.uint(5_000_000_000_000),
      "swap-headroom": Cl.uint(25),
    });
  });
});
