import { fetchCallReadOnlyFunction, cvToValue, uintCV } from "@stacks/transactions";
import { NETWORK, CONTRACTS } from "./stacks";

const [CORE_ADDR, CORE_NAME] = CONTRACTS.core.split(".") as [string, string];

async function readOnly(functionName: string, functionArgs: any[] = []) {
  const cv = await fetchCallReadOnlyFunction({
    contractAddress: CORE_ADDR,
    contractName: CORE_NAME,
    functionName,
    functionArgs,
    senderAddress: CORE_ADDR,
    network: NETWORK,
  });
  return cvToValue(cv, true);
}

export type Offer = {
  id: number;
  fixedParty: string;
  notionalUstx: number;
  fixedRate: number;
  durationCycles: number;
  collateralSats: number;
  status: number;
};

export type Swap = {
  id: number;
  fixedParty: string;
  variableParty: string;
  notionalUstx: number;
  fixedRate: number;
  durationCycles: number;
  startCycle: number;
  cyclesSettled: number;
  fixedCollateral: number;
  variableCollateral: number;
  status: number;
};

// Read-only results arrive in mixed shapes: bare scalars come back as strings,
// tuples nest each field under { type, value }, and an optional `none` is null.
const unwrap = (v: any): any =>
  v && typeof v === "object" && "value" in v ? (v as any).value : v;
const n = (v: any) => Number(unwrap(v));
const str = (v: any) => String(unwrap(v));

/** Open offers (status 0) currently on chain, newest first. */
export async function fetchOpenOffers(): Promise<Offer[]> {
  const count = n(await readOnly("get-offer-count"));
  if (!count) return [];

  const ids = Array.from({ length: count }, (_, i) => count - i); // newest first
  const rows = await Promise.all(
    ids.map(async (id) => {
      const raw = await readOnly("get-offer", [uintCV(id)]);
      if (!raw) return null;
      const o = unwrap(raw);
      return {
        id,
        fixedParty: str(o["fixed-party"]),
        notionalUstx: n(o["notional-ustx"]),
        fixedRate: n(o["fixed-rate-sats-per-mstx"]),
        durationCycles: n(o["duration-cycles"]),
        collateralSats: n(o["collateral-sats"]),
        status: n(o["status"]),
      } as Offer;
    })
  );
  return rows.filter((o): o is Offer => o !== null && o.status === 0);
}

/** Every swap on chain, newest first. */
export async function fetchSwaps(): Promise<Swap[]> {
  const count = n(await readOnly("get-swap-count"));
  if (!count) return [];

  const ids = Array.from({ length: count }, (_, i) => count - i);
  const rows = await Promise.all(
    ids.map(async (id) => {
      const raw = await readOnly("get-swap", [uintCV(id)]);
      if (!raw) return null;
      const w = unwrap(raw);
      return {
        id,
        fixedParty: str(w["fixed-party"]),
        variableParty: str(w["variable-party"]),
        notionalUstx: n(w["notional-ustx"]),
        fixedRate: n(w["fixed-rate-sats-per-mstx"]),
        durationCycles: n(w["duration-cycles"]),
        startCycle: n(w["start-cycle"]),
        cyclesSettled: n(w["cycles-settled"]),
        fixedCollateral: n(w["fixed-collateral"]),
        variableCollateral: n(w["variable-collateral"]),
        status: n(w["status"]),
      } as Swap;
    })
  );
  return rows.filter((s): s is Swap => s !== null);
}

export type PilotUsage = {
  activeNotionalUstx: number;
  activeSwapCount: number;
  notionalHeadroomUstx: number;
  swapHeadroom: number;
};

export async function fetchPilotUsage(): Promise<PilotUsage> {
  const u = unwrap(await readOnly("get-pilot-utilisation"));
  return {
    activeNotionalUstx: n(u["active-notional-ustx"]),
    activeSwapCount: n(u["active-swap-count"]),
    notionalHeadroomUstx: n(u["notional-headroom-ustx"]),
    swapHeadroom: n(u["swap-headroom"]),
  };
}

export async function fetchCurrentCycle(): Promise<number> {
  return n(await readOnly("get-current-pox-cycle"));
}

export type Settlement = {
  swapId: number;
  cycle: number;
  fixedPayment: number;
  variablePayment: number;
  settledAt: number;
};

/** Settlement records for one swap, across the cycles it covers. */
export async function fetchSettlements(swap: Swap): Promise<Settlement[]> {
  const cycles = Array.from({ length: swap.durationCycles }, (_, i) => swap.startCycle + i);
  const rows = await Promise.all(
    cycles.map(async (cycle) => {
      const raw = await readOnly("get-cycle-settlement", [uintCV(swap.id), uintCV(cycle)]);
      if (!raw) return null;
      const r = unwrap(raw);
      return {
        swapId: swap.id,
        cycle,
        fixedPayment: n(r["fixed-payment"]),
        variablePayment: n(r["variable-payment"]),
        settledAt: n(r["settled-at"]),
      } as Settlement;
    })
  );
  return rows.filter((r): r is Settlement => r !== null);
}
