"use client";

import { useState } from "react";
import { useWallet } from "@/components/WalletProvider";
import { NETWORK, CONTRACTS } from "@/lib/stacks";
import FAQAccordion from "@/components/FAQAccordion";

const MOCK_OFFERS = [
  { id: 1, fixedParty: "ST1SJ3...YPD5", notionalUstx: 10_000_000, fixedRateBps: 80, durationCycles: 3, collateralSats: 5_000_000, postedAt: "Cycle 84" },
  { id: 2, fixedParty: "ST2CY5...K9AG", notionalUstx: 25_000_000, fixedRateBps: 95, durationCycles: 6, collateralSats: 12_000_000, postedAt: "Cycle 84" },
  { id: 3, fixedParty: "ST3NBR...H2T", notionalUstx: 5_000_000, fixedRateBps: 110, durationCycles: 1, collateralSats: 2_000_000, postedAt: "Cycle 85" },
];

function fmt(n: number) { return n.toLocaleString(); }

function AcceptModal({ offer, onClose }: { offer: (typeof MOCK_OFFERS)[0]; onClose: () => void }) {
  const { connected, connect } = useWallet();
  const [collateral, setCollateral] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const satRequired = Math.ceil((offer.notionalUstx * offer.fixedRateBps * offer.durationCycles) / 1_000_000 * 1.1);
  const collateralNum = parseInt(collateral, 10);
  const valid = !!collateralNum && collateralNum >= satRequired;

  async function handleAccept() {
    if (!connected) { connect(); return; }
    if (!valid) return;
    setSubmitting(true);
    try {
      const { request } = await import("@stacks/connect");
      const { uintCV } = await import("@stacks/transactions");
      await request("stx_callContract", {
        contract: CONTRACTS.core,
        functionName: "accept-offer",
        functionArgs: [uintCV(offer.id), uintCV(collateralNum)],
        network: NETWORK,
      });
      setDone(true);
    } catch {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 px-4">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-md">
        {done ? (
          <div className="p-8 text-center">
            <div className="w-12 h-12 rounded-full bg-green-50 border border-green-200 flex items-center justify-center mx-auto mb-4">
              <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-base font-bold text-slate-900 mb-2">Swap accepted</h2>
            <p className="text-sm text-slate-500 mb-5">Your transaction is submitted. Check your dashboard to track the position.</p>
            <button onClick={onClose} className="bg-slate-900 text-white font-semibold px-5 py-2.5 rounded-xl text-sm w-full hover:bg-slate-700 transition-colors">
              Close
            </button>
          </div>
        ) : (
          <div className="p-6">
            <div className="flex items-start justify-between mb-5">
              <div>
                <h2 className="text-base font-bold text-slate-900">Accept offer #{offer.id}</h2>
                <p className="text-xs text-slate-500 mt-0.5">You are taking the variable side of this swap.</p>
              </div>
              <button onClick={onClose} className="text-slate-400 hover:text-slate-900 transition-colors p-1">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="bg-slate-50 rounded-xl border border-slate-200 divide-y divide-slate-200 mb-5 text-sm">
              <div className="flex justify-between px-4 py-3">
                <span className="text-slate-500">Notional</span>
                <span className="font-mono font-semibold text-slate-800">{fmt(offer.notionalUstx)} uSTX</span>
              </div>
              <div className="flex justify-between px-4 py-3">
                <span className="text-slate-500">Fixed rate (you owe)</span>
                <span className="font-mono font-semibold text-amber-700">{offer.fixedRateBps} bps / cycle</span>
              </div>
              <div className="flex justify-between px-4 py-3">
                <span className="text-slate-500">Duration</span>
                <span className="font-mono font-semibold text-slate-800">{offer.durationCycles} cycles (~{offer.durationCycles * 2} wks)</span>
              </div>
              <div className="flex justify-between px-4 py-3 bg-white rounded-b-xl">
                <span className="text-slate-500">Min. collateral (110%)</span>
                <span className="font-mono font-bold text-slate-900">{fmt(satRequired)} sats</span>
              </div>
            </div>

            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Your collateral <span className="text-slate-400 font-normal">(sBTC sats)</span>
            </label>
            <input
              type="number"
              min={satRequired}
              value={collateral}
              onChange={(e) => setCollateral(e.target.value)}
              placeholder={String(satRequired)}
              className="w-full border border-slate-300 rounded-xl px-3 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-slate-900 mb-1"
            />
            <p className="text-xs text-slate-400 mb-5">
              Must be ≥ {fmt(satRequired)} sats to meet the 110% maintenance margin.
            </p>

            <div className="flex gap-3">
              <button
                onClick={handleAccept}
                disabled={submitting || (!!collateral && !valid)}
                className="flex-1 bg-slate-900 text-white text-sm font-semibold py-2.5 rounded-xl hover:bg-slate-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {submitting ? "Confirming…" : connected ? "Accept swap" : "Connect wallet"}
              </button>
              <button onClick={onClose} className="px-4 text-sm text-slate-400 hover:text-slate-900 transition-colors font-medium">
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const faqs = [
  {
    q: "What does it mean to be the variable party?",
    a: "You take the floating side of the swap. Each cycle you receive what the actual PoX rate earns on the notional, and you owe the fixed rate. If actual is higher than fixed — you profit. If lower — you pay the gap from your collateral.",
  },
  {
    q: "Why do I need to post collateral?",
    a: "Because you might owe a payment if rates fall below the fixed rate. The collateral (held in the Rho contract) secures the fixed party against your potential liability. You need at least 110% of your total remaining obligation to open the position.",
  },
  {
    q: "What is the maintenance margin?",
    a: "After every settlement, the contract checks that your remaining collateral is still above 110% of your remaining obligation. If it falls below, the contract liquidates — splitting the remaining collateral fairly between both parties immediately.",
  },
  {
    q: "What happens to my collateral during the swap?",
    a: "It stays locked in the smart contract. After each cycle settles, your balance adjusts up or down. When all cycles are done and the swap closes, whatever remains is returned to your wallet.",
  },
  {
    q: "Can I exit early?",
    a: "Not in v1. Positions run until all cycles settle or a liquidation is triggered. Early exit and position transfers are planned for a future version.",
  },
];

export default function MarketPage() {
  const [selected, setSelected] = useState<(typeof MOCK_OFFERS)[0] | null>(null);

  return (
    <div className="bg-white min-h-screen">

      {/* Header */}
      <div className="border-b border-slate-100">
        <div className="max-w-6xl mx-auto px-5 py-12">
          <h1 className="text-3xl font-bold text-slate-900 mb-2">Open offers</h1>
          <p className="text-slate-500 text-sm max-w-2xl">
            Each row is a fixed-party offer — someone who has locked STX and wants to lock in a fixed PoX rate.
            By accepting, you take the variable side: you benefit when rates rise above the fixed rate, and pay the gap when they fall below it.
          </p>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-5 py-10">

        {/* Rate explainer callout */}
        <div className="flex gap-4 bg-amber-50 border border-amber-200 rounded-2xl p-5 mb-8">
          <div className="flex-shrink-0 w-8 h-8 rounded-full bg-amber-100 border border-amber-300 flex items-center justify-center mt-0.5">
            <span className="text-amber-700 text-xs font-bold">i</span>
          </div>
          <div>
            <p className="text-sm font-semibold text-amber-900 mb-1">What is a basis point (bps)?</p>
            <p className="text-sm text-amber-800 leading-relaxed">
              Rates on Rho use basis points where <strong>1 bps = 1 sat earned per 1,000,000 uSTX stacked per cycle</strong>.
              Example: 80 bps on 10M uSTX = a fixed payment of 800 sats per cycle. No price feed needed.
            </p>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto rounded-2xl border border-slate-200 mb-14">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                <th className="text-left px-5 py-3.5 text-xs font-bold text-slate-400 uppercase tracking-wider">#</th>
                <th className="text-left px-5 py-3.5 text-xs font-bold text-slate-400 uppercase tracking-wider">Posted by</th>
                <th className="text-right px-5 py-3.5 text-xs font-bold text-slate-400 uppercase tracking-wider">Notional</th>
                <th className="text-right px-5 py-3.5 text-xs font-bold text-slate-400 uppercase tracking-wider">Fixed rate</th>
                <th className="text-right px-5 py-3.5 text-xs font-bold text-slate-400 uppercase tracking-wider">Duration</th>
                <th className="text-right px-5 py-3.5 text-xs font-bold text-slate-400 uppercase tracking-wider">Collateral</th>
                <th className="px-5 py-3.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {MOCK_OFFERS.map((offer) => (
                <tr key={offer.id} className="hover:bg-slate-50 transition-colors group">
                  <td className="px-5 py-4 font-mono text-slate-400 text-xs">{offer.id}</td>
                  <td className="px-5 py-4 font-mono text-slate-600 text-xs">{offer.fixedParty}</td>
                  <td className="px-5 py-4 text-right font-mono text-slate-800">{fmt(offer.notionalUstx)} <span className="text-slate-400 text-xs">uSTX</span></td>
                  <td className="px-5 py-4 text-right">
                    <span className="bg-amber-50 text-amber-700 font-mono font-bold text-xs px-2.5 py-1 rounded-full border border-amber-200">
                      {offer.fixedRateBps} bps
                    </span>
                  </td>
                  <td className="px-5 py-4 text-right text-slate-600 text-sm">
                    {offer.durationCycles} cycle{offer.durationCycles > 1 ? "s" : ""}
                    <span className="text-slate-400 text-xs ml-1">(~{offer.durationCycles * 2}w)</span>
                  </td>
                  <td className="px-5 py-4 text-right font-mono text-slate-800">{fmt(offer.collateralSats)} <span className="text-slate-400 text-xs">sats</span></td>
                  <td className="px-5 py-4 text-right">
                    <button
                      onClick={() => setSelected(offer)}
                      className="bg-slate-900 text-white text-xs font-bold px-4 py-2 rounded-lg hover:bg-slate-700 transition-colors"
                    >
                      Accept
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* FAQ */}
        <div className="border-t border-slate-100 pt-12">
          <div className="grid md:grid-cols-3 gap-12">
            <div>
              <h2 className="text-xl font-bold text-slate-900 mb-2">Questions about accepting</h2>
              <p className="text-sm text-slate-500 leading-relaxed">What to know before you take the variable side of a swap.</p>
            </div>
            <div className="md:col-span-2">
              <FAQAccordion items={faqs} />
            </div>
          </div>
        </div>
      </div>

      {selected && <AcceptModal offer={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
