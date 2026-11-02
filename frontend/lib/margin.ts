// Mirrors the margin arithmetic in contracts/rho-core-v5.clar exactly, so the
// site shows the same requirements the contract enforces. BigInt throughout:
// notional (up to 1e12 uSTX) times rate (up to 2e7) exceeds 2^53.

export const USTX_PER_STX = BigInt(1000000);
export const RATE_SCALAR = BigInt(1000000000000);
export const CEILING_MULTIPLIER = BigInt(2);
export const MARGIN_CYCLES = BigInt(2);
export const MARGIN_CALL_GRACE = 144;

export const MIN_NOTIONAL_USTX = BigInt(10000000000);     // 10,000 STX
export const MAX_NOTIONAL_USTX = BigInt(1000000000000);  // 1M STX
export const MAX_DURATION_CYCLES = BigInt(13);
export const MAX_FIXED_RATE = BigInt(20000000);

const min = (a: bigint, b: bigint) => (a < b ? a : b);

/** Fixed payment per cycle, rounded down, as settlement computes it. */
export function fixedPayment(notionalUstx: bigint, fixedRate: bigint): bigint {
  return (notionalUstx * fixedRate) / RATE_SCALAR;
}

/** The most either side can owe in one cycle under the 2x ceiling, rounded up. */
export function worstCasePerCycle(notionalUstx: bigint, fixedRate: bigint): bigint {
  return (notionalUstx * fixedRate + RATE_SCALAR - BigInt(1)) / RATE_SCALAR;
}

/** Minimum deposit for either side: 110% of two cycles of worst case. */
export function initialMargin(notionalUstx: bigint, fixedRate: bigint, duration: bigint): bigint {
  return (worstCasePerCycle(notionalUstx, fixedRate) * min(duration, MARGIN_CYCLES) * BigInt(110)) / BigInt(100);
}

/** Collateral a side must keep: 100% of the next two cycles of worst case. */
export function maintenanceMargin(notionalUstx: bigint, fixedRate: bigint, remaining: bigint): bigint {
  return worstCasePerCycle(notionalUstx, fixedRate) * min(remaining, MARGIN_CYCLES);
}

/** Deposits and top-ups may not take a side above this. */
export function maxCollateral(notionalUstx: bigint, fixedRate: bigint, duration: bigint): bigint {
  return (worstCasePerCycle(notionalUstx, fixedRate) * duration * BigInt(110)) / BigInt(100);
}

/** Problems with a set of offer terms, in the order the contract checks them. */
export function offerErrors(notionalUstx: bigint, fixedRate: bigint, duration: bigint): string[] {
  const e: string[] = [];
  if (duration < BigInt(1)) e.push("Duration must be at least 1 cycle.");
  if (notionalUstx < MIN_NOTIONAL_USTX) e.push("Minimum swap size is 10,000 STX.");
  if (notionalUstx > MAX_NOTIONAL_USTX) e.push("Maximum swap size is 1,000,000 STX.");
  if (duration > MAX_DURATION_CYCLES) e.push("Maximum duration is 13 cycles.");
  if (fixedRate > MAX_FIXED_RATE) e.push("Maximum fixed rate is 20,000,000.");
  if (fixedPayment(notionalUstx, fixedRate) === BigInt(0)) e.push("The fixed rate is too low to produce a payment.");
  return e;
}

export const fmt = (n: bigint | number) => n.toLocaleString("en-US");
export const ustxToStx = (u: bigint | number) => fmt(BigInt(u) / USTX_PER_STX);
