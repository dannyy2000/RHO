import { describe, expect, it } from "vitest";
import { Cl, ClarityType } from "@stacks/transactions";

const accounts = simnet.getAccounts();
const deployer = accounts.get("deployer")!;
const fixedParty = accounts.get("wallet_1")!;
const variableParty = accounts.get("wallet_2")!;
const keeper = accounts.get("wallet_3")!;

const CORE = "rho-core-v5";
const CORE_ID = `${deployer}.${CORE}`;

// One example throughout: 1M STX notional, fixed 500,000 sats per 1M STX,
// 3 cycles. The worst case per cycle for either side is 500,000 sats.
const N = 1_000_000_000_000;
const F = 500_000;
const D = 3;
const W = 500_000;
const INITIAL = 1_100_000;   // W x 2 cycles x 110%
const MAX_COL = 1_650_000;   // W x 3 cycles x 110%
const GRACE = 144;

function mint(who: string, amount = 100_000_000) {
  simnet.callPublicFn("mock-sbtc", "mint", [Cl.uint(amount), Cl.principal(who)], deployer);
}

function balance(who: string): bigint {
  const r = simnet.callReadOnlyFn("mock-sbtc", "get-balance", [Cl.principal(who)], deployer).result as any;
  return BigInt(r.value.value);
}

function openSwap(fixedCol = INITIAL, varCol = INITIAL) {
  mint(fixedParty);
  mint(variableParty);
  simnet.callPublicFn(CORE, "post-offer", [Cl.uint(N), Cl.uint(F), Cl.uint(D), Cl.uint(fixedCol)], fixedParty);
  const { result } = simnet.callPublicFn(CORE, "accept-offer", [Cl.uint(1), Cl.uint(varCol)], variableParty);
  expect(result).toBeOk(Cl.uint(1));
}

// Applies the settlement rules at a chosen actual rate. In simnet PoX-5 never
// distributes, so the oracle has no rates; this exercises the same code path
// settle-cycle runs after its oracle read.
function settleAt(rate: number) {
  return simnet.callPrivateFn(CORE, "apply-settlement", [Cl.uint(1), Cl.uint(rate)], keeper).result;
}

function swap(): any {
  const r = simnet.callReadOnlyFn(CORE, "get-swap", [Cl.uint(1)], deployer).result as any;
  return r.value.value;
}
const num = (cv: any) => Number(cv.value);

describe("v5 offers: deposits are checked by the contract", () => {
  it("rejects a swap below the minimum size", () => {
    mint(fixedParty);
    const { result } = simnet.callPublicFn(CORE, "post-offer",
      [Cl.uint(9_999_000_000), Cl.uint(F), Cl.uint(D), Cl.uint(INITIAL)], fixedParty);
    expect(result).toBeErr(Cl.uint(121));
  });

  it("rejects a zero fixed rate, so slots can't be filled for free", () => {
    mint(fixedParty);
    const { result } = simnet.callPublicFn(CORE, "post-offer",
      [Cl.uint(N), Cl.uint(0), Cl.uint(D), Cl.uint(1)], fixedParty);
    expect(result).toBeErr(Cl.uint(110));
  });

  it("rejects a fixed deposit below initial margin", () => {
    mint(fixedParty);
    const { result } = simnet.callPublicFn(CORE, "post-offer",
      [Cl.uint(N), Cl.uint(F), Cl.uint(D), Cl.uint(INITIAL - 1)], fixedParty);
    expect(result).toBeErr(Cl.uint(117));
  });

  it("rejects a fixed deposit above the full-term worst case", () => {
    mint(fixedParty);
    const { result } = simnet.callPublicFn(CORE, "post-offer",
      [Cl.uint(N), Cl.uint(F), Cl.uint(D), Cl.uint(MAX_COL + 1)], fixedParty);
    expect(result).toBeErr(Cl.uint(118));
  });

  it("rejects a variable deposit below initial margin", () => {
    mint(fixedParty); mint(variableParty);
    simnet.callPublicFn(CORE, "post-offer", [Cl.uint(N), Cl.uint(F), Cl.uint(D), Cl.uint(INITIAL)], fixedParty);
    const { result } = simnet.callPublicFn(CORE, "accept-offer", [Cl.uint(1), Cl.uint(INITIAL - 1)], variableParty);
    expect(result).toBeErr(Cl.uint(117));
  });

  it("rejects accepting your own offer", () => {
    mint(fixedParty);
    simnet.callPublicFn(CORE, "post-offer", [Cl.uint(N), Cl.uint(F), Cl.uint(D), Cl.uint(INITIAL)], fixedParty);
    const { result } = simnet.callPublicFn(CORE, "accept-offer", [Cl.uint(1), Cl.uint(INITIAL)], fixedParty);
    expect(result).toBeErr(Cl.uint(116));
  });

  it("starts the swap at the next full cycle", () => {
    openSwap();
    const current = simnet.callReadOnlyFn(CORE, "get-current-pox-cycle", [], deployer).result as any;
    expect(num(swap()["start-cycle"])).toBe(Number(current.value) + 1);
  });
});

describe("v5 settlement: rates come from the trustless oracle", () => {
  it("refuses to settle a cycle the oracle has not reported", () => {
    openSwap();
    const { result } = simnet.callPublicFn(CORE, "settle-cycle", [Cl.uint(1)], keeper);
    expect(result).toBeErr(Cl.uint(107));
  });
});

describe("v5 settlement: the 2x ceiling", () => {
  it("pays the variable side the difference when the rate is above fixed", () => {
    openSwap();
    // actual 700,000: variable receives (700,000 - 500,000) on 1M STX = 200,000.
    expect(settleAt(700_000)).toBeOk(Cl.tuple({
      "fixed-payment": Cl.uint(F), "variable-payment": Cl.uint(700_000) }));
    expect(num(swap()["fixed-collateral"])).toBe(INITIAL - 200_000);
    expect(num(swap()["variable-collateral"])).toBe(INITIAL + 200_000);
  });

  it("counts any rate above 2x fixed as exactly 2x", () => {
    openSwap();
    // actual 5,000,000 is capped at 1,000,000, so the fixed side pays W.
    expect(settleAt(5_000_000)).toBeOk(Cl.tuple({
      "fixed-payment": Cl.uint(F), "variable-payment": Cl.uint(1_000_000) }));
    expect(num(swap()["fixed-collateral"])).toBe(INITIAL - W);
    const rec = (simnet.callReadOnlyFn(CORE, "get-cycle-settlement",
      [Cl.uint(1), swap()["start-cycle"]], deployer).result as any).value.value;
    expect(num(rec["actual-rate"])).toBe(5_000_000);
    expect(num(rec["settlement-rate"])).toBe(1_000_000);
  });

  it("charges the variable side the full fixed payment when the rate is zero", () => {
    openSwap();
    expect(settleAt(0)).toBeOk(Cl.tuple({ "fixed-payment": Cl.uint(F), "variable-payment": Cl.uint(0) }));
    expect(num(swap()["variable-collateral"])).toBe(INITIAL - W);
    expect(num(swap()["fixed-collateral"])).toBe(INITIAL + W);
  });

  it("settles cycles in order and stops after the last one", () => {
    openSwap(MAX_COL, MAX_COL);
    const start = num(swap()["start-cycle"]);
    settleAt(500_000); settleAt(500_000); settleAt(500_000);
    expect(num(swap()["cycles-settled"])).toBe(3);
    for (const c of [start, start + 1, start + 2]) {
      const r = simnet.callReadOnlyFn(CORE, "get-cycle-settlement", [Cl.uint(1), Cl.uint(c)], deployer).result;
      expect(r).toHaveClarityType(ClarityType.OptionalSome);
    }
    expect(settleAt(500_000)).toBeErr(Cl.uint(122));
  });
});

describe("v5 margin calls: both sides are margined", () => {
  it("opens no call while a side stays at or above maintenance", () => {
    openSwap();
    // variable pays 100,000: 1,000,000 left, exactly the 2-cycle requirement.
    settleAt(400_000);
    expect(num(swap()["variable-call-deadline"])).toBe(0);
    expect(num(swap()["fixed-call-deadline"])).toBe(0);
  });

  it("calls a side that is one sat below maintenance", () => {
    openSwap();
    // variable pays 100,001: 999,999 left vs 1,000,000 required.
    settleAt(399_999);
    expect(num(swap()["variable-collateral"])).toBe(999_999);
    expect(num(swap()["variable-call-deadline"])).toBe(simnet.burnBlockHeight + GRACE);
  });

  it("calls the variable side when a bad cycle takes it below maintenance", () => {
    openSwap();
    settleAt(0); // variable pays 500,000, 600,000 left vs 1,000,000 required
    expect(num(swap()["variable-call-deadline"])).toBe(simnet.burnBlockHeight + GRACE);
    expect(num(swap()["fixed-call-deadline"])).toBe(0);
  });

  it("calls the fixed side too: the fixed obligation is now bounded and margined", () => {
    openSwap();
    settleAt(5_000_000); // capped: fixed pays 500,000, 600,000 left
    expect(num(swap()["fixed-call-deadline"])).toBe(simnet.burnBlockHeight + GRACE);
    expect(num(swap()["variable-call-deadline"])).toBe(0);
  });

  it("clears a call when the side tops up to maintenance", () => {
    openSwap();
    settleAt(0);
    const { result } = simnet.callPublicFn(CORE, "top-up", [Cl.uint(1), Cl.uint(400_000)], variableParty);
    expect(result).toBeOk(Cl.uint(1_000_000));
    expect(num(swap()["variable-call-deadline"])).toBe(0);
  });

  it("keeps the call open after a partial top-up", () => {
    openSwap();
    settleAt(0);
    const deadline = num(swap()["variable-call-deadline"]);
    simnet.callPublicFn(CORE, "top-up", [Cl.uint(1), Cl.uint(100_000)], variableParty);
    expect(num(swap()["variable-call-deadline"])).toBe(deadline);
  });

  it("does not let an outsider top up a swap", () => {
    openSwap();
    mint(keeper);
    const { result } = simnet.callPublicFn(CORE, "top-up", [Cl.uint(1), Cl.uint(1)], keeper);
    expect(result).toBeErr(Cl.uint(119));
  });

  it("does not let a top-up exceed the full-term worst case", () => {
    openSwap();
    const { result } = simnet.callPublicFn(CORE, "top-up", [Cl.uint(1), Cl.uint(MAX_COL - INITIAL + 1)], variableParty);
    expect(result).toBeErr(Cl.uint(118));
  });
});

describe("v5 liquidation", () => {
  it("cannot liquidate before the deadline", () => {
    openSwap();
    settleAt(0);
    simnet.mineEmptyBurnBlocks(GRACE - 1);
    const { result } = simnet.callPublicFn(CORE, "liquidate", [Cl.uint(1)], keeper);
    expect(result).toBeErr(Cl.uint(120));
  });

  it("cannot liquidate a swap with no open call", () => {
    openSwap();
    settleAt(500_000);
    simnet.mineEmptyBurnBlocks(GRACE + 1);
    const { result } = simnet.callPublicFn(CORE, "liquidate", [Cl.uint(1)], keeper);
    expect(result).toBeErr(Cl.uint(120));
  });

  it("after the deadline, the defaulter forfeits one cycle of worst case", () => {
    openSwap();
    settleAt(0); // fixed 1,600,000, variable 600,000 and called
    simnet.mineEmptyBurnBlocks(GRACE + 1);
    const fixedBefore = balance(fixedParty);
    const varBefore = balance(variableParty);
    const { result } = simnet.callPublicFn(CORE, "liquidate", [Cl.uint(1)], keeper);
    // penalty = W = 500,000 moves from variable to fixed.
    expect(result).toBeOk(Cl.tuple({
      "fixed-payment": Cl.uint(1_600_000 + W), "variable-payment": Cl.uint(600_000 - W) }));
    expect(balance(fixedParty) - fixedBefore).toBe(2_100_000n);
    expect(balance(variableParty) - varBefore).toBe(100_000n);
    expect(num(swap()["status"])).toBe(2);
  });

  it("a topped-up side can no longer be liquidated", () => {
    openSwap();
    settleAt(0);
    simnet.callPublicFn(CORE, "top-up", [Cl.uint(1), Cl.uint(400_000)], variableParty);
    simnet.mineEmptyBurnBlocks(GRACE + 1);
    const { result } = simnet.callPublicFn(CORE, "liquidate", [Cl.uint(1)], keeper);
    expect(result).toBeErr(Cl.uint(120));
  });

  it("ends the swap when the paying side cannot cover a cycle", () => {
    openSwap();
    settleAt(0); // variable 600,000 (called, ignored)
    settleAt(0); // variable 100,000
    // third cycle: owes 500,000, has 100,000, so all of it moves and the swap ends.
    settleAt(0);
    const s = swap();
    expect(num(s["status"])).toBe(2);
    expect(num(s["variable-collateral"])).toBe(0);
  });
});

describe("v5 closing and accounting", () => {
  it("returns both balances after the last cycle", () => {
    openSwap(MAX_COL, MAX_COL);
    settleAt(600_000); settleAt(400_000); settleAt(500_000);
    const fixedBefore = balance(fixedParty);
    const varBefore = balance(variableParty);
    expect(simnet.callPublicFn(CORE, "close-swap", [Cl.uint(1)], keeper).result).toBeOk(Cl.tuple({
      "fixed-payment": Cl.uint(MAX_COL), "variable-payment": Cl.uint(MAX_COL) }));
    expect(balance(fixedParty) - fixedBefore).toBe(BigInt(MAX_COL));
    expect(balance(variableParty) - varBefore).toBe(BigInt(MAX_COL));
  });

  it("refuses to close before every cycle is settled", () => {
    openSwap();
    settleAt(500_000);
    expect(simnet.callPublicFn(CORE, "close-swap", [Cl.uint(1)], keeper).result).toBeErr(Cl.uint(109));
  });

  it("holds nothing and releases capacity once every swap has ended", () => {
    openSwap();
    settleAt(0);
    simnet.mineEmptyBurnBlocks(GRACE + 1);
    simnet.callPublicFn(CORE, "liquidate", [Cl.uint(1)], keeper);
    expect(balance(CORE_ID)).toBe(0n);
    const u = (simnet.callReadOnlyFn(CORE, "get-pilot-utilisation", [], deployer).result as any).value;
    expect(num(u["active-notional-ustx"])).toBe(0);
    expect(num(u["active-swap-count"])).toBe(0);
  });

  it("has no admin surface beyond the swap lifecycle", () => {
    const iface = simnet.getContractsInterfaces().get(CORE_ID)!;
    const publicFns = iface.functions.filter((f: any) => f.access === "public").map((f: any) => f.name).sort();
    expect(publicFns).toStrictEqual(
      ["accept-offer", "cancel-offer", "close-swap", "liquidate", "post-offer", "settle-cycle", "top-up"]);
  });
});
