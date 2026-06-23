import { describe, expect, it } from "vitest";
import { Cl } from "@stacks/transactions";

const accounts = simnet.getAccounts();
const deployer = accounts.get("deployer")!;
const wallet1 = accounts.get("wallet_1")!;  // fixed party
const wallet2 = accounts.get("wallet_2")!;  // variable party

describe("Rho Protocol", () => {
  it("executes a full swap lifecycle: post → accept → oracle → settle → close", () => {
    // ── Setup: mint mock-sbtc for both parties ──────────────────────────
    simnet.callPublicFn("mock-sbtc", "mint", [Cl.uint(10_000_000), Cl.principal(wallet1)], deployer);
    simnet.callPublicFn("mock-sbtc", "mint", [Cl.uint(10_000_000), Cl.principal(wallet2)], deployer);

    // ── Step 1: wallet1 (fixed party) posts an offer ────────────────────
    // notional = 1,000,000 uSTX, fixed-rate = 100 (sats per 1M uSTX),
    // duration = 1 cycle, collateral = 1,000,000 sats
    const { result: postResult } = simnet.callPublicFn(
      "rho-core",
      "post-offer",
      [Cl.uint(1_000_000), Cl.uint(100), Cl.uint(1), Cl.uint(1_000_000)],
      wallet1
    );
    expect(postResult).toBeOk(Cl.uint(1)); // offer-id = 1

    // Verify wallet1 collateral was locked
    const w1BalAfterPost = simnet.callReadOnlyFn("mock-sbtc", "get-balance", [Cl.principal(wallet1)], wallet1).result;
    expect(w1BalAfterPost).toBeOk(Cl.uint(9_000_000)); // 10M - 1M

    // ── Step 2: wallet2 (variable party) accepts ────────────────────────
    const { result: acceptResult } = simnet.callPublicFn(
      "rho-core",
      "accept-offer",
      [Cl.uint(1), Cl.uint(2_000_000)],
      wallet2
    );
    expect(acceptResult).toBeOk(Cl.uint(1)); // swap-id = 1

    // Verify offer is marked accepted (full tuple required for exact match)
    const offer = simnet.callReadOnlyFn("rho-core", "get-offer", [Cl.uint(1)], deployer).result;
    expect(offer).toBeSome(Cl.tuple({
      "fixed-party": Cl.principal(wallet1),
      "notional-ustx": Cl.uint(1_000_000),
      "fixed-rate-bps": Cl.uint(100),
      "duration-cycles": Cl.uint(1),
      "collateral-sats": Cl.uint(1_000_000),
      "status": Cl.uint(1),
    }));

    // ── Step 3: oracle admin submits cycle 0 rate ────────────────────────
    // btc-reward = 200 sats, total-ustx = 1,000,000 → rate = 200
    // (highly simplified testnet values — real PoX uses billions of uSTX)
    const { result: oracleResult } = simnet.callPublicFn(
      "pox-rate-oracle",
      "submit-cycle-rate",
      [Cl.uint(0), Cl.uint(200), Cl.uint(1_000_000)],
      deployer
    );
    expect(oracleResult).toBeOk(Cl.uint(200)); // rate-bps = 200

    // ── Step 4: settle cycle 0 (anyone can call) ─────────────────────────
    // fixed-pmt  = 1,000,000 × 100 / 1,000,000 = 100 sats
    // actual-pmt = 1,000,000 × 200 / 1,000,000 = 200 sats
    // variable wins: net = 100 sats moves from fixed_collateral → variable_collateral
    const { result: settleResult } = simnet.callPublicFn(
      "rho-core",
      "settle-cycle",
      [Cl.uint(1), Cl.uint(0)],
      deployer
    );
    expect(settleResult).toBeOk(
      Cl.tuple({ "fixed-payment": Cl.uint(100), "variable-payment": Cl.uint(200) })
    );

    // Verify collateral balances shifted (full tuple required for exact match)
    const swapAfter = simnet.callReadOnlyFn("rho-core", "get-swap", [Cl.uint(1)], deployer).result;
    expect(swapAfter).toBeSome(
      Cl.tuple({
        "offer-id": Cl.uint(1),
        "fixed-party": Cl.principal(wallet1),
        "variable-party": Cl.principal(wallet2),
        "notional-ustx": Cl.uint(1_000_000),
        "fixed-rate-bps": Cl.uint(100),
        "duration-cycles": Cl.uint(1),
        "start-cycle": Cl.uint(0),
        "cycles-settled": Cl.uint(1),
        "fixed-collateral": Cl.uint(999_900),
        "variable-collateral": Cl.uint(2_000_100),
        "status": Cl.uint(0),
      })
    );

    // ── Step 5: close swap — releases collateral to both parties ─────────
    const { result: closeResult } = simnet.callPublicFn(
      "rho-core",
      "close-swap",
      [Cl.uint(1)],
      deployer
    );
    expect(closeResult).toBeOk(Cl.bool(true));

    // ── Verify final balances ─────────────────────────────────────────────
    // wallet1: 10M minted − 1M locked + 999,900 returned = 9,999,900
    const w1Final = simnet.callReadOnlyFn("mock-sbtc", "get-balance", [Cl.principal(wallet1)], wallet1).result;
    expect(w1Final).toBeOk(Cl.uint(9_999_900));

    // wallet2: 10M minted − 2M locked + 2,000,100 returned = 10,000,100
    const w2Final = simnet.callReadOnlyFn("mock-sbtc", "get-balance", [Cl.principal(wallet2)], wallet2).result;
    expect(w2Final).toBeOk(Cl.uint(10_000_100));
  });

  it("cancel-offer returns collateral to fixed party", () => {
    simnet.callPublicFn("mock-sbtc", "mint", [Cl.uint(5_000_000), Cl.principal(wallet1)], deployer);

    simnet.callPublicFn(
      "rho-core",
      "post-offer",
      [Cl.uint(1_000_000), Cl.uint(50), Cl.uint(3), Cl.uint(500_000)],
      wallet1
    );

    const balBefore = simnet.callReadOnlyFn("mock-sbtc", "get-balance", [Cl.principal(wallet1)], wallet1).result;
    expect(balBefore).toBeOk(Cl.uint(4_500_000)); // 5M - 500K

    const { result: cancelResult } = simnet.callPublicFn(
      "rho-core",
      "cancel-offer",
      [Cl.uint(1)],
      wallet1
    );
    expect(cancelResult).toBeOk(Cl.bool(true));

    const balAfter = simnet.callReadOnlyFn("mock-sbtc", "get-balance", [Cl.principal(wallet1)], wallet1).result;
    expect(balAfter).toBeOk(Cl.uint(5_000_000)); // 500K returned
  });

  it("rejects double-settlement of the same cycle", () => {
    simnet.callPublicFn("mock-sbtc", "mint", [Cl.uint(5_000_000), Cl.principal(wallet1)], deployer);
    simnet.callPublicFn("mock-sbtc", "mint", [Cl.uint(5_000_000), Cl.principal(wallet2)], deployer);

    simnet.callPublicFn("rho-core", "post-offer",
      [Cl.uint(1_000_000), Cl.uint(100), Cl.uint(2), Cl.uint(1_000_000)], wallet1);
    simnet.callPublicFn("rho-core", "accept-offer", [Cl.uint(1), Cl.uint(1_000_000)], wallet2);
    simnet.callPublicFn("pox-rate-oracle", "submit-cycle-rate",
      [Cl.uint(0), Cl.uint(100), Cl.uint(1_000_000)], deployer);

    simnet.callPublicFn("rho-core", "settle-cycle", [Cl.uint(1), Cl.uint(0)], deployer);

    // Second settle of same cycle must fail
    const { result } = simnet.callPublicFn("rho-core", "settle-cycle", [Cl.uint(1), Cl.uint(0)], deployer);
    expect(result).toBeErr(Cl.uint(105)); // ERR-CYCLE-ALREADY-SETTLED
  });

  it("rejects settlement when oracle has no data for the cycle", () => {
    simnet.callPublicFn("mock-sbtc", "mint", [Cl.uint(5_000_000), Cl.principal(wallet1)], deployer);
    simnet.callPublicFn("mock-sbtc", "mint", [Cl.uint(5_000_000), Cl.principal(wallet2)], deployer);

    simnet.callPublicFn("rho-core", "post-offer",
      [Cl.uint(1_000_000), Cl.uint(100), Cl.uint(1), Cl.uint(1_000_000)], wallet1);
    simnet.callPublicFn("rho-core", "accept-offer", [Cl.uint(1), Cl.uint(1_000_000)], wallet2);

    // No oracle submission — settle must fail
    const { result } = simnet.callPublicFn("rho-core", "settle-cycle", [Cl.uint(1), Cl.uint(0)], deployer);
    expect(result).toBeErr(Cl.uint(107)); // ERR-ORACLE-RATE-NOT-FOUND
  });
});
