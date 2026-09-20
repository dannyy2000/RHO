import { describe, expect, it } from "vitest";
import { Cl } from "@stacks/transactions";

const accounts = simnet.getAccounts();
const deployer = accounts.get("deployer")!;
const wallet1 = accounts.get("wallet_1")!;
const wallet2 = accounts.get("wallet_2")!;

function mint(who: string, amt = 100_000_000) {
  simnet.callPublicFn("mock-sbtc", "mint", [Cl.uint(amt), Cl.principal(who)], deployer);
}
function rate(cycle: number) {
  simnet.callPublicFn("pox-rate-oracle-v2", "submit-cycle-rate",
    [Cl.uint(cycle), Cl.uint(383_000_000), Cl.uint(30_000_000), Cl.uint(441_576_024_000_000)], deployer);
}

describe("audit: remaining untested paths", () => {
  it("cancel-offer does not touch pilot capacity", () => {
    mint(wallet1);
    simnet.callPublicFn("rho-core-v3", "post-offer",
      [Cl.uint(1_000_000_000_000), Cl.uint(500_000), Cl.uint(1), Cl.uint(1_000_000)], wallet1);
    // Capacity is consumed on accept, not on post, so cancelling an unaccepted
    // offer must not decrement - that would underflow.
    const { result } = simnet.callPublicFn("rho-core-v3", "cancel-offer", [Cl.uint(1)], wallet1);
    expect(result).toBeOk(Cl.bool(true));

    const util = simnet.callReadOnlyFn("rho-core-v3", "get-pilot-utilisation", [], deployer).result;
    expect(util).toBeTuple({
      "active-notional-ustx": Cl.uint(0),
      "active-swap-count": Cl.uint(0),
      "notional-headroom-ustx": Cl.uint(5_000_000_000_000),
      "swap-headroom": Cl.uint(25),
    });
  });

  it("a non-owner cannot cancel someone else's offer", () => {
    mint(wallet1); mint(wallet2);
    simnet.callPublicFn("rho-core-v3", "post-offer",
      [Cl.uint(1_000_000), Cl.uint(500_000), Cl.uint(1), Cl.uint(1_000_000)], wallet1);
    const { result } = simnet.callPublicFn("rho-core-v3", "cancel-offer", [Cl.uint(1)], wallet2);
    expect(result).toBeErr(Cl.uint(100)); // ERR-NOT-AUTHORIZED
  });

  it("an accepted offer cannot be cancelled", () => {
    mint(wallet1); mint(wallet2);
    simnet.callPublicFn("rho-core-v3", "post-offer",
      [Cl.uint(1_000_000), Cl.uint(500_000), Cl.uint(1), Cl.uint(1_000_000)], wallet1);
    simnet.callPublicFn("rho-core-v3", "accept-offer", [Cl.uint(1), Cl.uint(1_000_000)], wallet2);
    const { result } = simnet.callPublicFn("rho-core-v3", "cancel-offer", [Cl.uint(1)], wallet1);
    expect(result).toBeErr(Cl.uint(102)); // ERR-OFFER-NOT-OPEN
  });

  it("rejects settling a cycle outside the swap's range", () => {
    mint(wallet1); mint(wallet2);
    simnet.callPublicFn("rho-core-v3", "post-offer",
      [Cl.uint(1_000_000), Cl.uint(500_000), Cl.uint(1), Cl.uint(1_000_000)], wallet1);
    simnet.callPublicFn("rho-core-v3", "accept-offer", [Cl.uint(1), Cl.uint(1_000_000)], wallet2);
    rate(50); // well past start-cycle + duration
    const { result } = simnet.callPublicFn("rho-core-v3", "settle-cycle",
      [Cl.uint(1), Cl.uint(50)], deployer);
    expect(result).toBeErr(Cl.uint(106)); // ERR-CYCLE-OUT-OF-RANGE
  });

  it("rejects closing a swap before every cycle is settled", () => {
    mint(wallet1); mint(wallet2);
    simnet.callPublicFn("rho-core-v3", "post-offer",
      [Cl.uint(1_000_000), Cl.uint(500_000), Cl.uint(3), Cl.uint(1_000_000)], wallet1);
    simnet.callPublicFn("rho-core-v3", "accept-offer", [Cl.uint(1), Cl.uint(5_000_000)], wallet2);
    const { result } = simnet.callPublicFn("rho-core-v3", "close-swap", [Cl.uint(1)], deployer);
    expect(result).toBeErr(Cl.uint(109)); // ERR-ALL-CYCLES-NOT-SETTLED
  });

  it("rejects zero notional and zero collateral", () => {
    mint(wallet1);
    const zeroNotional = simnet.callPublicFn("rho-core-v3", "post-offer",
      [Cl.uint(0), Cl.uint(500_000), Cl.uint(1), Cl.uint(1_000_000)], wallet1).result;
    expect(zeroNotional).toBeErr(Cl.uint(110)); // ERR-INVALID-PARAMS

    const zeroCollateral = simnet.callPublicFn("rho-core-v3", "post-offer",
      [Cl.uint(1_000_000), Cl.uint(500_000), Cl.uint(1), Cl.uint(0)], wallet1).result;
    expect(zeroCollateral).toBeErr(Cl.uint(110));
  });

  it("rejects operations on a swap or offer that does not exist", () => {
    const noOffer = simnet.callPublicFn("rho-core-v3", "accept-offer",
      [Cl.uint(999), Cl.uint(1_000_000)], wallet2).result;
    expect(noOffer).toBeErr(Cl.uint(101)); // ERR-OFFER-NOT-FOUND

    const noSwap = simnet.callPublicFn("rho-core-v3", "close-swap", [Cl.uint(999)], deployer).result;
    expect(noSwap).toBeErr(Cl.uint(103)); // ERR-SWAP-NOT-FOUND
  });

  it("a liquidated swap cannot then be closed", () => {
    mint(wallet1); mint(wallet2);
    simnet.callPublicFn("rho-core-v3", "post-offer",
      [Cl.uint(1_000_000_000_000), Cl.uint(600_000), Cl.uint(3), Cl.uint(10_000_000)], wallet1);
    simnet.callPublicFn("rho-core-v3", "accept-offer", [Cl.uint(1), Cl.uint(700_000)], wallet2);
    simnet.callPublicFn("pox-rate-oracle-v2", "submit-cycle-rate",
      [Cl.uint(0), Cl.uint(272_000_000), Cl.uint(30_000_000), Cl.uint(441_576_024_000_000)], deployer);
    simnet.callPublicFn("rho-core-v3", "settle-cycle", [Cl.uint(1), Cl.uint(0)], deployer);

    const { result } = simnet.callPublicFn("rho-core-v3", "close-swap", [Cl.uint(1)], deployer);
    expect(result).toBeErr(Cl.uint(104)); // ERR-SWAP-NOT-ACTIVE
  });
});
