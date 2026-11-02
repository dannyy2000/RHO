import { fetchCallReadOnlyFunction, cvToValue, uintCV } from "@stacks/transactions";
import { NETWORK, CONTRACTS, API_URL } from "./stacks";

async function readOnly(functionName: string, functionArgs: any[] = [], contract = CONTRACTS.core) {
  const [addr, name] = contract.split(".") as [string, string];
  const cv = await fetchCallReadOnlyFunction({
    contractAddress: addr,
    contractName: name,
    functionName,
    functionArgs,
    senderAddress: addr,
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
  fixedCallDeadline: number;     // burn height; 0 = no margin call open
  variableCallDeadline: number;
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
        fixedCallDeadline: n(w["fixed-call-deadline"]),
        variableCallDeadline: n(w["variable-call-deadline"]),
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
  actualRate: number;
  settlementRate: number;
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
        actualRate: n(r["actual-rate"]),
        settlementRate: n(r["settlement-rate"]),
        fixedPayment: n(r["fixed-payment"]),
        variablePayment: n(r["variable-payment"]),
        settledAt: n(r["settled-at"]),
      } as Settlement;
    })
  );
  return rows.filter((r): r is Settlement => r !== null);
}

/** The trustless oracle's rate for a cycle, or null until PoX-5 can no longer credit it. */
export async function fetchCycleRate(cycle: number): Promise<number | null> {
  const raw = await readOnly("get-cycle-rate", [uintCV(cycle)], CONTRACTS.oracle);
  if (!raw) return null;
  return n(unwrap(raw)["rate-sats-per-mstx"]);
}

/** Current Bitcoin (burn) block height, used for margin-call deadlines. */
export async function fetchBurnHeight(): Promise<number> {
  const info = await (await fetch(`${API_URL}/v2/info`)).json();
  return Number(info.burn_block_height);
}

export type TxOutcome = { ok: boolean; result: string };

/** Polls the API until a broadcast transaction is mined, then reports its result. */
export async function waitForTx(txid: string, everyMs = 10_000): Promise<TxOutcome> {
  const id = txid.startsWith("0x") ? txid : `0x${txid}`;
  for (;;) {
    try {
      const tx = await (await fetch(`${API_URL}/extended/v1/tx/${id}`)).json();
      if (tx.tx_status && tx.tx_status !== "pending") {
        return { ok: tx.tx_status === "success", result: tx.tx_result?.repr ?? tx.tx_status };
      }
    } catch {
      // Not indexed yet, or a network blip: keep polling.
    }
    await new Promise((r) => setTimeout(r, everyMs));
  }
}
