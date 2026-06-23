"use client";

import { useState } from "react";
import { useWallet } from "@/components/WalletProvider";
import { request } from "@stacks/connect";
import { uintCV } from "@stacks/transactions";
import { NETWORK, CONTRACTS } from "@/lib/stacks";

const MOCK_OFFERS = [
  {
    id: 1,
    fixedParty: "ST1SJ3...YPD5",
    notionalUstx: 10_000_000,
    fixedRateBps: 80,
    durationCycles: 3,
    collateralSats: 5_000_000,
    postedAt: "Cycle 84",
  },
  {
    id: 2,
    fixedParty: "ST2CY5...K9AG",
    notionalUstx: 25_000_000,
    fixedRateBps: 95,
    durationCycles: 6,
    collateralSats: 12_000_000,
    postedAt: "Cycle 84",
  },
  {
    id: 3,
    fixedParty: "ST3NBRSFKX28FQ2ZBA4RQE...H2T",
    notionalUstx: 5_000_000,
    fixedRateBps: 110,
    durationCycles: 1,
    collateralSats: 2_000_000,
    postedAt: "Cycle 85",
  },
];

function fmt(n: number) {
  return n.toLocaleString();
}

function AcceptModal({
  offer,
  onClose,
}: {
  offer: (typeof MOCK_OFFERS)[0];
  onClose: () => void;
}) {
  const { connected, connect } = useWallet();
  const [collateral, setCollateral] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const satRequired = Math.ceil(
    (offer.notionalUstx * offer.fixedRateBps * offer.durationCycles) / 1_000_000 * 1.1
  );

  async function handleAccept() {
    if (!connected) { connect(); return; }
    const sats = parseInt(collateral, 10);
    if (!sats || sats < satRequired) return;
    setSubmitting(true);
    try {
      await request("stx_callContract", {
        contract: CONTRACTS.core,
        functionName: "accept-offer",
        functionArgs: [uintCV(offer.id), uintCV(sats)],
        network: NETWORK,
      });
      setSubmitting(false);
      onClose();
    } catch {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 px-4">
      <div className="bg-white rounded-xl border border-slate-200 p-6 max-w-md w-full shadow-xl">
        <h2 className="text-base font-semibold text-slate-900 mb-1">Accept offer #{offer.id}</h2>
        <p className="text-sm text-slate-500 mb-5">
          You are taking the variable side. You will receive the actual PoX rate each cycle and pay the fixed rate of{" "}
          <strong>{offer.fixedRateBps} bps</strong>.
        </p>

        <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 mb-5 space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-slate-500">Notional</span>
            <span className="font-mono text-slate-800">{fmt(offer.notionalUstx)} uSTX</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Fixed rate you owe</span>
            <span className="font-mono text-slate-800">{offer.fixedRateBps} bps / cycle</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Duration</span>
            <span className="font-mono text-slate-800">{offer.durationCycles} cycle{offer.durationCycles > 1 ? "s" : ""}</span>
          </div>
          <div className="flex justify-between border-t border-slate-200 pt-2 mt-1">
            <span className="text-slate-500">Min. collateral (110% margin)</span>
            <span className="font-mono font-semibold text-slate-900">{fmt(satRequired)} sats</span>
          </div>
        </div>

        <label className="block text-xs font-medium text-slate-700 mb-1.5">
          Your collateral (sBTC sats)
        </label>
        <input
          type="number"
          min={satRequired}
          value={collateral}
          onChange={(e) => setCollateral(e.target.value)}
          placeholder={String(satRequired)}
          className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-slate-400 mb-1"
        />
        <p className="text-xs text-slate-400 mb-5">
          Minimum {fmt(satRequired)} sats to meet the 110% maintenance margin requirement.
        </p>

        <div className="flex gap-3">
          <button
            onClick={handleAccept}
            disabled={submitting || (!!collateral && parseInt(collateral) < satRequired)}
            className="flex-1 bg-slate-900 text-white text-sm font-medium py-2 rounded-md hover:bg-slate-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {submitting ? "Confirming…" : connected ? "Accept swap" : "Connect wallet to accept"}
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-slate-500 hover:text-slate-900 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

const faqs = [
  {
    q: "What does it mean to be the variable party?",
    a: "When you accept an offer, you take the variable side of the swap. Each cycle you receive a payment based on the actual PoX rate and owe a payment at the fixed rate. If the actual rate is higher than the fixed rate, you profit the difference. If lower, you pay the difference.",
  },
  {
    q: "What is the minimum collateral I need to deposit?",
    a: "Rho requires the variable party to maintain collateral of at least 110% of their total remaining obligation (calculated at the fixed rate). This is the maintenance margin. The modal shows you the exact minimum for each offer.",
  },
  {
    q: "What happens to my collateral during the swap?",
    a: "Your sBTC collateral is held in the Rho smart contract. After each cycle settles, your collateral balance adjusts up or down based on the net payment. When the swap closes, the remaining balance is returned to your wallet.",
  },
  {
    q: "Can I exit a swap before it ends?",
    a: "Not in v1 — positions run until all cycles are settled or a liquidation is triggered. Secondary market transfers and early exit are planned for a future version.",
  },
];

export default function MarketPage() {
  const [selected, setSelected] = useState<(typeof MOCK_OFFERS)[0] | null>(null);

  return (
    <div className="max-w-6xl mx-auto px-6 py-12">
      <div className="mb-10">
        <h1 className="text-3xl font-semibold text-slate-900 mb-2">Open offers</h1>
        <p className="text-slate-500 text-sm max-w-xl">
          Each offer below is posted by a STX stacker who wants to lock in a fixed PoX yield rate.
          By accepting, you take the variable side — you benefit if rates rise above the fixed rate,
          and you owe the difference if rates fall below it.
        </p>
      </div>

      {/* Offers table */}
      <div className="overflow-x-auto rounded-lg border border-slate-200 mb-14">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50">
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">ID</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Posted by</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Notional (uSTX)</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Fixed rate</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Duration</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wider">Collateral (sats)</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {MOCK_OFFERS.map((offer) => (
              <tr key={offer.id} className="hover:bg-slate-50 transition-colors">
                <td className="px-4 py-3.5 font-mono text-slate-500">#{offer.id}</td>
                <td className="px-4 py-3.5 font-mono text-slate-600">{offer.fixedParty}</td>
                <td className="px-4 py-3.5 text-right font-mono text-slate-800">{fmt(offer.notionalUstx)}</td>
                <td className="px-4 py-3.5 text-right">
                  <span className="bg-amber-50 text-amber-700 font-mono font-semibold text-xs px-2 py-0.5 rounded">
                    {offer.fixedRateBps} bps
                  </span>
                </td>
                <td className="px-4 py-3.5 text-right text-slate-600">
                  {offer.durationCycles} cycle{offer.durationCycles > 1 ? "s" : ""}
                </td>
                <td className="px-4 py-3.5 text-right font-mono text-slate-800">{fmt(offer.collateralSats)}</td>
                <td className="px-4 py-3.5 text-right">
                  <button
                    onClick={() => setSelected(offer)}
                    className="bg-slate-900 text-white text-xs font-medium px-3 py-1.5 rounded hover:bg-slate-700 transition-colors"
                  >
                    Accept
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* What does bps mean — inline explainer */}
      <div className="bg-slate-50 border border-slate-200 rounded-lg p-5 mb-14 max-w-2xl">
        <h2 className="text-sm font-semibold text-slate-900 mb-2">What does the fixed rate mean?</h2>
        <p className="text-sm text-slate-500 leading-relaxed mb-3">
          Rates on Rho are expressed in <strong>bps (basis points)</strong>, where 1 bps = sats earned per 1,000,000 uSTX stacked per cycle.
          This avoids any dependency on an external STX/BTC price feed.
        </p>
        <p className="text-sm text-slate-500 leading-relaxed">
          Example: a fixed rate of 100 bps on a notional of 1,000,000 uSTX means a fixed payment of{" "}
          <code className="font-mono bg-white border border-slate-200 px-1 rounded">
            1,000,000 × 100 ÷ 1,000,000 = 100 sats
          </code>{" "}
          per cycle.
        </p>
      </div>

      {/* FAQ */}
      <section>
        <h2 className="text-xl font-semibold text-slate-900 mb-6">Questions about accepting a swap</h2>
        <div className="divide-y divide-slate-100 max-w-2xl">
          {faqs.map((faq, i) => (
            <div key={i} className="py-5">
              <h3 className="text-sm font-semibold text-slate-900 mb-2">{faq.q}</h3>
              <p className="text-sm text-slate-500 leading-relaxed">{faq.a}</p>
            </div>
          ))}
        </div>
      </section>

      {selected && (
        <AcceptModal offer={selected} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}
