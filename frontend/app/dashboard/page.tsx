"use client";

import { useState, useEffect, useCallback } from "react";
import { useWallet } from "@/components/WalletProvider";
import { NETWORK, CONTRACTS } from "@/lib/stacks";
import { fetchSwaps, fetchOpenOffers, fetchSettlements, fetchCycleRate, fetchBurnHeight, waitForTx,
         type Swap, type Offer, type Settlement } from "@/lib/contract";
import { maintenanceMargin, maxCollateral, ustxToStx, fmt } from "@/lib/margin";

const STATUS = ["Active", "Completed", "Liquidated"] as const;

function Badge({ text, color }: { text: string; color: "green" | "amber" | "slate" | "red" }) {
  const cls = {
    green: "bg-green-50 text-green-700 border-green-200",
    amber: "bg-amber-50 text-amber-700 border-amber-200",
    slate: "bg-slate-100 text-slate-600 border-slate-200",
    red: "bg-red-50 text-red-700 border-red-200",
  }[color];
  return <span className={`text-xs font-medium border px-2 py-0.5 rounded ${cls}`}>{text}</span>;
}

function ConnectPrompt({ onConnect }: { onConnect: () => void }) {
  return (
    <div className="border border-slate-200 rounded-lg p-10 text-center max-w-sm mx-auto mt-16">
      <h2 className="text-base font-semibold text-slate-900 mb-2">Connect your wallet</h2>
      <p className="text-sm text-slate-500 mb-5">
        Connect with Xverse or Leather to view your positions and open offers.
      </p>
      <button onClick={onConnect}
        className="bg-slate-900 text-white text-sm font-medium px-5 py-2 rounded-md hover:bg-slate-700 transition-colors">
        Connect wallet
      </button>
    </div>
  );
}

type Row = {
  swap: Swap;
  role: "Fixed" | "Variable";
  nextCycle: number;
  nextRateReady: boolean;
  myCollateral: number;
  myDeadline: number;
  otherDeadline: number;
  shortfall: number;   // sats this wallet must add to clear its call
};

const btn = "text-xs font-medium px-3 py-1.5 rounded transition-colors disabled:opacity-40";

export default function DashboardPage() {
  const { connected, address, connect } = useWallet();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [offers, setOffers] = useState<Offer[] | null>(null);
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [height, setHeight] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!address) return;
    try {
      const [allSwaps, allOffers, h] = await Promise.all([fetchSwaps(), fetchOpenOffers(), fetchBurnHeight()]);
      const mine = allSwaps.filter((w) => w.fixedParty === address || w.variableParty === address);
      const built = await Promise.all(mine.map(async (w): Promise<Row> => {
        const role = w.fixedParty === address ? "Fixed" : "Variable";
        const nextCycle = w.startCycle + w.cyclesSettled;
        const nextRateReady = w.status === 0 && w.cyclesSettled < w.durationCycles
          && (await fetchCycleRate(nextCycle)) !== null;
        const myCollateral = role === "Fixed" ? w.fixedCollateral : w.variableCollateral;
        const myDeadline = role === "Fixed" ? w.fixedCallDeadline : w.variableCallDeadline;
        const otherDeadline = role === "Fixed" ? w.variableCallDeadline : w.fixedCallDeadline;
        const N = BigInt(w.notionalUstx), F = BigInt(w.fixedRate);
        const required = maintenanceMargin(N, F, BigInt(w.durationCycles - w.cyclesSettled));
        const room = maxCollateral(N, F, BigInt(w.durationCycles)) - BigInt(myCollateral);
        let need = required - BigInt(myCollateral);
        if (need < BigInt(0)) need = BigInt(0);
        if (need > room) need = room > BigInt(0) ? room : BigInt(0);
        return { swap: w, role, nextCycle, nextRateReady, myCollateral, myDeadline, otherDeadline, shortfall: Number(need) };
      }));
      setRows(built);
      setOffers(allOffers.filter((o) => o.fixedParty === address));
      setHeight(h);
      const hist = await Promise.all(mine.map(fetchSettlements));
      setSettlements(hist.flat().sort((a, b) => b.cycle - a.cycle));
      setLoadError(null);
    } catch (e: any) {
      setLoadError(String(e?.message ?? e));
    }
  }, [address]);

  useEffect(() => { if (connected) load(); }, [connected, load]);

  // Every call names the exact sBTC that may move, or the wallet's default
  // deny mode aborts it.
  async function call(label: string, functionName: string, args: number[],
                      pc: { from: "me" | "contract"; amount: number; exact: boolean }) {
    setBusy(label);
    setNotice(null);
    try {
      const { request } = await import("@stacks/connect");
      const { uintCV, Pc } = await import("@stacks/transactions");
      const who = Pc.principal(pc.from === "me" ? address! : CONTRACTS.core);
      const cond = (pc.exact ? who.willSendEq(pc.amount) : who.willSendLte(pc.amount)).ft(CONTRACTS.sbtc, "mock-sbtc");
      const res = await request("stx_callContract", {
        contract: CONTRACTS.core,
        functionName,
        functionArgs: args.map((a) => uintCV(a)),
        network: NETWORK,
        postConditionMode: "deny",
        postConditions: [cond],
      });
      setBusy(null);
      setNotice(`${label}: waiting for confirmation. Testnet blocks take a few minutes; this page updates by itself.`);
      if (res.txid) {
        const o = await waitForTx(res.txid);
        setNotice(o.ok ? `${label}: confirmed.` : `${label}: failed on-chain with ${o.result}.`);
        await load();
      }
    } catch {
      setNotice(null);
    } finally {
      setBusy(null);
    }
  }

  if (!connected) {
    return (
      <div className="max-w-6xl mx-auto px-6 py-12">
        <h1 className="text-3xl font-semibold text-slate-900 mb-2">Dashboard</h1>
        <p className="text-sm text-slate-500 mb-6">Your swaps, open offers, and settlement history.</p>
        <ConnectPrompt onConnect={connect} />
      </div>
    );
  }

  const active = (rows ?? []).filter((r) => r.swap.status === 0);
  const loading = rows === null && !loadError;

  return (
    <div className="max-w-6xl mx-auto px-6 py-12 space-y-14">

      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold text-slate-900 mb-1">Dashboard</h1>
          <p className="text-sm text-slate-400 font-mono break-all">{address}</p>
        </div>
        <button onClick={() => load()} className="text-sm border border-slate-200 rounded-md px-3 py-1.5 hover:bg-slate-50">
          Refresh
        </button>
      </div>

      {notice && (
        <div className="border border-green-200 bg-green-50 text-green-800 text-sm rounded-lg px-4 py-3">{notice}</div>
      )}

      <div className="grid sm:grid-cols-3 gap-4">
        <div className="border border-slate-200 rounded-lg p-5">
          <p className="text-xs text-slate-400 uppercase tracking-widest font-semibold mb-1">Active swaps</p>
          <p className="text-3xl font-semibold text-slate-900">{active.length}</p>
        </div>
        <div className="border border-slate-200 rounded-lg p-5">
          <p className="text-xs text-slate-400 uppercase tracking-widest font-semibold mb-1">Open offers</p>
          <p className="text-3xl font-semibold text-slate-900">{(offers ?? []).length}</p>
        </div>
        <div className="border border-slate-200 rounded-lg p-5">
          <p className="text-xs text-slate-400 uppercase tracking-widest font-semibold mb-1">Margin calls on you</p>
          <p className="text-3xl font-semibold text-slate-900">{active.filter((r) => r.myDeadline > 0).length}</p>
        </div>
      </div>

      {/* Positions */}
      <section>
        <h2 className="text-lg font-semibold text-slate-900 mb-1">Your swaps</h2>
        <p className="text-sm text-slate-500 mb-4">
          Collateral moves after each settled cycle. If yours falls below two cycles of worst case, you get a margin call
          and about {144} Bitcoin blocks to top up. Current Bitcoin block: {height ? fmt(height) : "…"}.
        </p>
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                {["Swap", "Role", "Notional", "Fixed rate", "Progress", "Your collateral", "Status", ""].map((h, i) => (
                  <th key={i} className={`${i < 2 ? "text-left" : "text-right"} px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading && <tr><td colSpan={8} className="px-4 py-10 text-center text-sm text-slate-400">Reading {CONTRACTS.core}…</td></tr>}
              {loadError && <tr><td colSpan={8} className="px-4 py-10 text-center text-sm text-red-600">Could not reach the contract: {loadError}</td></tr>}
              {rows !== null && rows.length === 0 && (
                <tr><td colSpan={8} className="px-4 py-10 text-center text-sm text-slate-400">No swaps for this address yet.</td></tr>
              )}
              {(rows ?? []).map((r) => {
                const w = r.swap;
                const status = STATUS[w.status] ?? "Unknown";
                const escrow = w.fixedCollateral + w.variableCollateral;
                const anyExpired = (w.fixedCallDeadline > 0 && height > w.fixedCallDeadline)
                  || (w.variableCallDeadline > 0 && height > w.variableCallDeadline);
                const allSettled = w.cyclesSettled === w.durationCycles;
                let statusBadge = <Badge text={status} color={w.status === 2 ? "amber" : "slate"} />;
                if (w.status === 0 && r.myDeadline > 0) {
                  statusBadge = height > r.myDeadline
                    ? <Badge text="Margin call overdue" color="red" />
                    : <Badge text={`Margin call: top up by block ${fmt(r.myDeadline)}`} color="amber" />;
                } else if (w.status === 0 && r.otherDeadline > 0) {
                  statusBadge = <Badge text="Counterparty margin-called" color="slate" />;
                }
                return (
                  <tr key={w.id} className="hover:bg-slate-50 transition-colors align-top">
                    <td className="px-4 py-3.5 font-mono text-slate-500">#{w.id}</td>
                    <td className="px-4 py-3.5"><Badge text={r.role} color={r.role === "Fixed" ? "amber" : "slate"} /></td>
                    <td className="px-4 py-3.5 text-right font-mono text-slate-800">{ustxToStx(w.notionalUstx)} STX</td>
                    <td className="px-4 py-3.5 text-right font-mono text-slate-800">{fmt(w.fixedRate)}</td>
                    <td className="px-4 py-3.5 text-right font-mono text-slate-700">{w.cyclesSettled}/{w.durationCycles}</td>
                    <td className="px-4 py-3.5 text-right font-mono text-slate-800">{fmt(r.myCollateral)} sats</td>
                    <td className="px-4 py-3.5 text-right">{statusBadge}</td>
                    <td className="px-4 py-3.5 text-right space-y-1.5 min-w-[11rem]">
                      {w.status !== 0 && <span className="text-xs text-slate-400">—</span>}
                      {w.status === 0 && r.myDeadline > 0 && r.shortfall > 0 && (
                        <button disabled={!!busy} className={`${btn} bg-amber-600 text-white hover:bg-amber-700 block ml-auto`}
                          onClick={() => call(`Top up swap #${w.id}`, "top-up", [w.id, r.shortfall],
                                               { from: "me", amount: r.shortfall, exact: true })}>
                          Top up {fmt(r.shortfall)} sats
                        </button>
                      )}
                      {w.status === 0 && anyExpired && (
                        <button disabled={!!busy} className={`${btn} bg-red-600 text-white hover:bg-red-700 block ml-auto`}
                          onClick={() => call(`Liquidate swap #${w.id}`, "liquidate", [w.id],
                                               { from: "contract", amount: escrow, exact: true })}>
                          Liquidate
                        </button>
                      )}
                      {w.status === 0 && !allSettled && (r.nextRateReady ? (
                        <button disabled={!!busy} className={`${btn} bg-slate-900 text-white hover:bg-slate-700 block ml-auto`}
                          onClick={() => call(`Settle swap #${w.id}`, "settle-cycle", [w.id],
                                               { from: "contract", amount: escrow, exact: false })}>
                          Settle cycle {r.nextCycle}
                        </button>
                      ) : (
                        <span className="text-xs text-slate-400 block">Cycle {r.nextCycle}: rate not final yet</span>
                      ))}
                      {w.status === 0 && allSettled && (
                        <button disabled={!!busy} className={`${btn} bg-green-600 text-white hover:bg-green-700 block ml-auto`}
                          onClick={() => call(`Close swap #${w.id}`, "close-swap", [w.id],
                                               { from: "contract", amount: escrow, exact: true })}>
                          Close swap
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-slate-400 mt-2">
          Anyone can settle, liquidate or close a swap; the buttons appear here for convenience. Rates come from PoX-5 through the trustless oracle once a cycle can no longer change.
        </p>
      </section>

      {/* Open offers */}
      <section>
        <h2 className="text-lg font-semibold text-slate-900 mb-1">Your open offers</h2>
        <p className="text-sm text-slate-500 mb-4">
          Offers waiting for a variable party. Cancelling returns your deposit.
        </p>
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                {["Offer", "Notional", "Fixed rate", "Duration", "Deposit", ""].map((h, i) => (
                  <th key={i} className={`${i === 0 ? "text-left" : "text-right"} px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {offers !== null && offers.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-10 text-center text-sm text-slate-400">No open offers from this address.</td></tr>
              )}
              {(offers ?? []).map((o) => (
                <tr key={o.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3.5 font-mono text-slate-500">#{o.id}</td>
                  <td className="px-4 py-3.5 text-right font-mono text-slate-800">{ustxToStx(o.notionalUstx)} STX</td>
                  <td className="px-4 py-3.5 text-right font-mono text-slate-800">{fmt(o.fixedRate)}</td>
                  <td className="px-4 py-3.5 text-right text-slate-600">{o.durationCycles} cycle{o.durationCycles > 1 ? "s" : ""}</td>
                  <td className="px-4 py-3.5 text-right font-mono text-slate-800">{fmt(o.collateralSats)} sats</td>
                  <td className="px-4 py-3.5 text-right">
                    <button disabled={!!busy} className="text-xs text-red-500 hover:text-red-700 font-medium disabled:opacity-40"
                      onClick={() => call(`Cancel offer #${o.id}`, "cancel-offer", [o.id],
                                           { from: "contract", amount: o.collateralSats, exact: true })}>
                      Cancel &amp; reclaim
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Settlement history */}
      <section>
        <h2 className="text-lg font-semibold text-slate-900 mb-1">Settlement history</h2>
        <p className="text-sm text-slate-500 mb-4">
          Every settled cycle on your swaps. Each is an on-chain transaction anyone can verify.
        </p>
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                {["Swap", "Cycle", "PoX-5 rate", "Rate used", "Fixed payment", "Variable payment", "Net"].map((h, i) => (
                  <th key={i} className={`${i === 0 ? "text-left" : "text-right"} px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {settlements.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-10 text-center text-sm text-slate-400">No settled cycles yet.</td></tr>
              )}
              {settlements.map((s, i) => {
                const winner = s.variablePayment >= s.fixedPayment ? "Variable" : "Fixed";
                return (
                  <tr key={i} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3.5 font-mono text-slate-500">#{s.swapId}</td>
                    <td className="px-4 py-3.5 text-right font-mono text-slate-600">{s.cycle}</td>
                    <td className="px-4 py-3.5 text-right font-mono text-slate-800">{fmt(s.actualRate)}</td>
                    <td className="px-4 py-3.5 text-right font-mono text-slate-800">
                      {fmt(s.settlementRate)}{s.settlementRate < s.actualRate && <span className="text-xs text-amber-600 ml-1">(capped)</span>}
                    </td>
                    <td className="px-4 py-3.5 text-right font-mono text-slate-800">{fmt(s.fixedPayment)} sats</td>
                    <td className="px-4 py-3.5 text-right font-mono text-slate-800">{fmt(s.variablePayment)} sats</td>
                    <td className="px-4 py-3.5 text-right font-mono text-xs font-semibold text-slate-600">
                      {winner} +{fmt(Math.abs(s.variablePayment - s.fixedPayment))} sats
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-slate-400 mt-2">
          Payments are notional × rate ÷ 1,000,000 STX. The rate used is PoX-5's rate, capped at 2× the fixed rate.
        </p>
      </section>
    </div>
  );
}
