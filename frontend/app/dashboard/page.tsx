"use client";

import { useWallet } from "@/components/WalletProvider";

const MOCK_POSITIONS = [
  {
    swapId: 1,
    role: "Fixed",
    notionalUstx: 10_000_000,
    fixedRateBps: 80,
    durationCycles: 3,
    cyclesSettled: 1,
    startCycle: 82,
    fixedCollateral: 3_680_000,
    variableCollateral: 1_920_000,
    status: "Active",
    pnl: +20_000,
  },
];

const MOCK_OFFERS = [
  {
    offerId: 2,
    notionalUstx: 5_000_000,
    fixedRateBps: 110,
    durationCycles: 1,
    collateralSats: 2_000_000,
    status: "Open",
    postedAt: "Cycle 85",
  },
];

const MOCK_SETTLEMENTS = [
  {
    swapId: 1,
    cycle: 82,
    fixedPayment: 800,
    variablePayment: 900,
    netWinner: "Variable",
    net: 100,
    settledAt: "Block 890,234",
  },
];

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
          <p className="text-3xl font-semibold text-slate-900">{MOCK_POSITIONS.length}</p>
        </div>
        <div className="border border-slate-200 rounded-lg p-5">
          <p className="text-xs text-slate-400 uppercase tracking-widest font-semibold mb-1">Open offers</p>
          <p className="text-3xl font-semibold text-slate-900">{MOCK_OFFERS.length}</p>
        </div>
        <div className="border border-slate-200 rounded-lg p-5">
          <p className="text-xs text-slate-400 uppercase tracking-widest font-semibold mb-1">Cumulative P&L</p>
          <p className={`text-3xl font-semibold ${MOCK_POSITIONS[0].pnl >= 0 ? "text-green-600" : "text-red-500"}`}>
            {MOCK_POSITIONS[0].pnl >= 0 ? "+" : ""}{fmt(MOCK_POSITIONS[0].pnl)} sats
          </p>
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
                <th className="text-right px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">P&L</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {MOCK_POSITIONS.map((pos) => (
                <tr key={pos.swapId} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3.5 font-mono text-slate-500">#{pos.swapId}</td>
                  <td className="px-4 py-3.5">
                    <Badge
                      text={pos.role}
                      color={pos.role === "Fixed" ? "amber" : "slate"}
                    />
                  </td>
                  <td className="px-4 py-3.5 text-right font-mono text-slate-800">{fmt(pos.notionalUstx)} uSTX</td>
                  <td className="px-4 py-3.5 text-right font-mono text-slate-800">{pos.fixedRateBps} bps</td>
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
                    <span className={`font-mono font-semibold text-sm ${pos.pnl >= 0 ? "text-green-600" : "text-red-500"}`}>
                      {pos.pnl >= 0 ? "+" : ""}{fmt(pos.pnl)}
                    </span>
                  </td>
                  <td className="px-4 py-3.5 text-right">
                    {pos.cyclesSettled === pos.durationCycles ? (
                      <button className="text-xs bg-green-600 text-white font-medium px-3 py-1.5 rounded hover:bg-green-700 transition-colors">
                        Close swap
                      </button>
                    ) : (
                      <span className="text-xs text-slate-400">Settling…</span>
                    )}
                  </td>
                </tr>
              ))}
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
              {MOCK_OFFERS.map((offer) => (
                <tr key={offer.offerId} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3.5 font-mono text-slate-500">#{offer.offerId}</td>
                  <td className="px-4 py-3.5 text-right font-mono text-slate-800">{fmt(offer.notionalUstx)} uSTX</td>
                  <td className="px-4 py-3.5 text-right">
                    <span className="bg-amber-50 text-amber-700 font-mono font-semibold text-xs px-2 py-0.5 rounded border border-amber-200">
                      {offer.fixedRateBps} bps
                    </span>
                  </td>
                  <td className="px-4 py-3.5 text-right text-slate-600">
                    {offer.durationCycles} cycle{offer.durationCycles > 1 ? "s" : ""}
                  </td>
                  <td className="px-4 py-3.5 text-right font-mono text-slate-800">{fmt(offer.collateralSats)} sats</td>
                  <td className="px-4 py-3.5 text-slate-500">{offer.postedAt}</td>
                  <td className="px-4 py-3.5 text-right">
                    <button className="text-xs text-red-500 hover:text-red-700 font-medium transition-colors">
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
              {MOCK_SETTLEMENTS.map((s, i) => (
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
              ))}
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
