"use client";

import { useState, useEffect } from "react";
import { useWallet } from "@/components/WalletProvider";
import { CONTRACTS } from "@/lib/stacks";
import { fetchSwaps, fetchOpenOffers, fetchSettlements,
         type Swap, type Offer, type Settlement } from "@/lib/contract";

const STATUS = ["Active", "Completed", "Liquidated"] as const;

function fmt(n: number) {
  return n.toLocaleString();
}

function Badge({ text, color }: { text: string; color: "green" | "amber" | "slate" }) {
  const cls = {
    green: "bg-green-50 text-green-700 border-green-200",
    amber: "bg-amber-50 text-amber-700 border-amber-200",
    slate: "bg-slate-100 text-slate-600 border-slate-200",
  }[color];
  return (
    <span className={`text-xs font-medium border px-2 py-0.5 rounded ${cls}`}>
      {text}
    </span>
  );
}

function ConnectPrompt({ onConnect }: { onConnect: () => void }) {
  return (
    <div className="border border-slate-200 rounded-lg p-10 text-center max-w-sm mx-auto mt-16">
      <h2 className="text-base font-semibold text-slate-900 mb-2">Connect your wallet</h2>
      <p className="text-sm text-slate-500 mb-5">
        Connect with Xverse or Leather to view your active positions and open offers.
      </p>
      <button
        onClick={onConnect}
        className="bg-slate-900 text-white text-sm font-medium px-5 py-2 rounded-md hover:bg-slate-700 transition-colors"
      >
        Connect wallet
      </button>
    </div>
  );
}

export default function DashboardPage() {
  const { connected, address, connect } = useWallet();
  const [swaps, setSwaps] = useState<Swap[] | null>(null);
  const [offers, setOffers] = useState<Offer[] | null>(null);
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!connected || !address) return;
    let live = true;
    (async () => {
      try {
        const [allSwaps, allOffers] = await Promise.all([fetchSwaps(), fetchOpenOffers()]);
        const mine = allSwaps.filter(
          (w) => w.fixedParty === address || w.variableParty === address);
        if (!live) return;
        setSwaps(mine);
        setOffers(allOffers.filter((o) => o.fixedParty === address));
        const rows = await Promise.all(mine.map(fetchSettlements));
        if (live) setSettlements(rows.flat().sort((a, b) => b.cycle - a.cycle));
      } catch (e: any) {
        if (live) setLoadError(String(e?.message ?? e));
      }
    })();
    return () => { live = false; };
  }, [connected, address]);

  const activeSwaps = (swaps ?? []).filter((w) => w.status === 0);
  const totalNotional = (swaps ?? []).reduce((t, w) => t + w.notionalUstx, 0);
  const loading = connected && swaps === null && !loadError;

  if (!connected) {
    return (
      <div className="max-w-6xl mx-auto px-6 py-12">
        <h1 className="text-3xl font-semibold text-slate-900 mb-2">Dashboard</h1>
        <p className="text-sm text-slate-500 mb-6">Your active swaps, open offers, and settlement history.</p>
        <ConnectPrompt onConnect={connect} />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-6 py-12 space-y-14">

      <div>
        <h1 className="text-3xl font-semibold text-slate-900 mb-1">Dashboard</h1>
        <p className="text-sm text-slate-400 font-mono">{address}</p>
      </div>

      {/* Summary cards */}
      <div className="grid sm:grid-cols-3 gap-4">
        <div className="border border-slate-200 rounded-lg p-5">
          <p className="text-xs text-slate-400 uppercase tracking-widest font-semibold mb-1">Active swaps</p>
          <p className="text-3xl font-semibold text-slate-900">{activeSwaps.length}</p>
        </div>
        <div className="border border-slate-200 rounded-lg p-5">
          <p className="text-xs text-slate-400 uppercase tracking-widest font-semibold mb-1">Open offers</p>
          <p className="text-3xl font-semibold text-slate-900">{(offers ?? []).length}</p>
        </div>
        <div className="border border-slate-200 rounded-lg p-5">
          <p className="text-xs text-slate-400 uppercase tracking-widest font-semibold mb-1">Total notional</p>
          <p className="text-3xl font-semibold text-slate-900">{fmt(totalNotional)}<span className="text-base text-slate-400 ml-1">uSTX</span></p>
        </div>
      </div>

      {/* Active positions */}
      <section>
        <h2 className="text-lg font-semibold text-slate-900 mb-1">Active positions</h2>
        <p className="text-sm text-slate-500 mb-4">
          Swaps that are currently running. Collateral balances update after each settled cycle.
        </p>
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Swap</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Role</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Notional</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Rate</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Progress</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Your collateral</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Status</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading && (
                <tr><td colSpan={8} className="px-4 py-10 text-center text-sm text-slate-400">Reading {CONTRACTS.core}…</td></tr>
              )}
              {loadError && (
                <tr><td colSpan={8} className="px-4 py-10 text-center text-sm text-red-600">Could not reach the contract: {loadError}</td></tr>
              )}
              {swaps !== null && swaps.length === 0 && (
                <tr><td colSpan={8} className="px-4 py-10 text-center text-sm text-slate-400">No positions for this address on chain yet.</td></tr>
              )}
              {(swaps ?? []).map((w) => {
                const role = w.fixedParty === address ? "Fixed" : "Variable";
                const pos = {
                  swapId: w.id, role,
                  notionalUstx: w.notionalUstx, fixedRate: w.fixedRate,
                  durationCycles: w.durationCycles, cyclesSettled: w.cyclesSettled,
                  fixedCollateral: w.fixedCollateral, variableCollateral: w.variableCollateral,
                  status: STATUS[w.status] ?? "Unknown",
                };
                return (
                <tr key={pos.swapId} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3.5 font-mono text-slate-500">#{pos.swapId}</td>
                  <td className="px-4 py-3.5">
                    <Badge
                      text={pos.role}
                      color={pos.role === "Fixed" ? "amber" : "slate"}
                    />
                  </td>
                  <td className="px-4 py-3.5 text-right font-mono text-slate-800">{fmt(pos.notionalUstx)} uSTX</td>
                  <td className="px-4 py-3.5 text-right font-mono text-slate-800">{pos.fixedRate.toLocaleString()}</td>
                  <td className="px-4 py-3.5 text-right">
                    <span className="text-slate-700 font-mono">
                      {pos.cyclesSettled}/{pos.durationCycles}
                    </span>
                    <div className="w-16 h-1 bg-slate-200 rounded-full mt-1.5 ml-auto">
                      <div
                        className="h-1 bg-slate-600 rounded-full"
                        style={{ width: `${(pos.cyclesSettled / pos.durationCycles) * 100}%` }}
                      />
                    </div>
                  </td>
                  <td className="px-4 py-3.5 text-right font-mono text-slate-800">
                    {fmt(pos.role === "Fixed" ? pos.fixedCollateral : pos.variableCollateral)} sats
                  </td>
                  <td className="px-4 py-3.5 text-right">
                    <Badge
                      text={pos.status}
                      color={pos.status === "Liquidated" ? "amber" : "slate"}
                    />
                  </td>
                  <td className="px-4 py-3.5 text-right">
                    {pos.status === "Active" && pos.cyclesSettled === pos.durationCycles ? (
                      <button className="text-xs bg-green-600 text-white font-medium px-3 py-1.5 rounded hover:bg-green-700 transition-colors">
                        Close swap
                      </button>
                    ) : (
                      <span className="text-xs text-slate-400">
                        {pos.status === "Active" ? "Settling…" : "—"}
                      </span>
                    )}
                  </td>
                </tr>
              );})}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-slate-400 mt-2">
          P&L is the cumulative net of settlements so far. Positive = you have received more than you paid. The final balance is realised when you close the swap.
        </p>
      </section>

      {/* Open offers */}
      <section>
        <h2 className="text-lg font-semibold text-slate-900 mb-1">Your open offers</h2>
        <p className="text-sm text-slate-500 mb-4">
          Offers you posted that are waiting for a variable party to accept. You can cancel any of these and reclaim your collateral.
        </p>
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Offer ID</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Notional</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Fixed rate</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Duration</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Collateral locked</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Posted</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {offers !== null && offers.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-10 text-center text-sm text-slate-400">No open offers posted from this address.</td></tr>
              )}
              {(offers ?? []).map((o) => {
                const offer = { offerId: o.id, notionalUstx: o.notionalUstx, fixedRate: o.fixedRate,
                                durationCycles: o.durationCycles, collateralSats: o.collateralSats };
                return (
                <tr key={offer.offerId} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3.5 font-mono text-slate-500">#{offer.offerId}</td>
                  <td className="px-4 py-3.5 text-right font-mono text-slate-800">{fmt(offer.notionalUstx)} uSTX</td>
                  <td className="px-4 py-3.5 text-right">
                    <span className="bg-amber-50 text-amber-700 font-mono font-semibold text-xs px-2 py-0.5 rounded border border-amber-200">
                      {offer.fixedRate.toLocaleString()}
                    </span>
                  </td>
                  <td className="px-4 py-3.5 text-right text-slate-600">
                    {offer.durationCycles} cycle{offer.durationCycles > 1 ? "s" : ""}
                  </td>
                  <td className="px-4 py-3.5 text-right font-mono text-slate-800">{fmt(offer.collateralSats)} sats</td>
                  <td className="px-4 py-3.5 text-slate-500">Open</td>
                  <td className="px-4 py-3.5 text-right">
                    <button className="text-xs text-red-500 hover:text-red-700 font-medium transition-colors">
                      Cancel &amp; reclaim
                    </button>
                  </td>
                </tr>
              );})}
            </tbody>
          </table>
        </div>
      </section>

      {/* Settlement history */}
      <section>
        <h2 className="text-lg font-semibold text-slate-900 mb-1">Settlement history</h2>
        <p className="text-sm text-slate-500 mb-4">
          Every cycle that has been settled. Each row is a single on-chain transaction — anyone can verify these on the Stacks Explorer.
        </p>
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Swap</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Cycle</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Fixed payment</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Variable payment</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Net</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Settled at</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {settlements.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-10 text-center text-sm text-slate-400">No settled cycles yet.</td></tr>
              )}
              {settlements.map((r, i) => {
                const net = Math.abs(r.fixedPayment - r.variablePayment);
                const s = { swapId: r.swapId, cycle: r.cycle,
                            fixedPayment: r.fixedPayment, variablePayment: r.variablePayment,
                            netWinner: r.variablePayment >= r.fixedPayment ? "Variable" : "Fixed",
                            net, settledAt: `Burn block ${fmt(r.settledAt)}` };
                return (
                <tr key={i} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3.5 font-mono text-slate-500">#{s.swapId}</td>
                  <td className="px-4 py-3.5 text-right font-mono text-slate-600">{s.cycle}</td>
                  <td className="px-4 py-3.5 text-right font-mono text-slate-800">{fmt(s.fixedPayment)} sats</td>
                  <td className="px-4 py-3.5 text-right font-mono text-slate-800">{fmt(s.variablePayment)} sats</td>
                  <td className="px-4 py-3.5 text-right">
                    <span className={`font-mono font-semibold text-xs ${s.netWinner === "Fixed" ? "text-green-600" : "text-slate-500"}`}>
                      {s.netWinner} +{fmt(s.net)} sats
                    </span>
                  </td>
                  <td className="px-4 py-3.5 font-mono text-xs text-slate-400">{s.settledAt}</td>
                </tr>
              );})}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-slate-400 mt-2">
          Fixed payment = notional &times; fixed rate / 1,000,000.
          Variable payment = notional &times; actual PoX rate / 1,000,000.
          The net winner receives the difference.
        </p>
      </section>

    </div>
  );
}
