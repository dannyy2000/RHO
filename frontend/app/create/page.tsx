"use client";

import { useState } from "react";
import Link from "next/link";
import { useWallet } from "@/components/WalletProvider";
import { NETWORK, CONTRACTS } from "@/lib/stacks";
import FAQAccordion from "@/components/FAQAccordion";

const faqs = [
  {
    q: "What is notional?",
    a: "Notional is the reference amount used to calculate payments — similar to the face value of a bond. It never actually moves between wallets. Payments are calculated each cycle as: notional × rate ÷ 1,000,000. A notional of 10,000,000 uSTX at 80 bps = 800 sats per cycle.",
  },
  {
    q: "How do I choose the right fixed rate?",
    a: "Look at recent PoX cycles on the Stacks Explorer to see where rates have been sitting. Set your rate slightly below recent averages for an easy fill, or at the current rate for full protection. Rates typically range from 50–200 bps. If you set it too high, the offer may sit unfilled.",
  },
  {
    q: "Why is there a recommended collateral amount?",
    a: "Your collateral must be large enough to cover what you might owe the variable party if the actual PoX rate beats your fixed rate every cycle for the full duration. We suggest 150% of the maximum obligation as a buffer.",
  },
  {
    q: "What is a PoX cycle?",
    a: "One cycle is approximately two weeks — 2,100 Bitcoin blocks. PoX yield is distributed once per cycle. A swap with a duration of 3 cycles runs for roughly 6 weeks.",
  },
  {
    q: "Can I cancel after posting?",
    a: "Yes — as long as the offer has not been accepted by a variable party. Go to your Dashboard and cancel it. Your full collateral is returned immediately.",
  },
];

export default function CreatePage() {
  const { connected, connect } = useWallet();

  const [notional, setNotional] = useState("");
  const [rate, setRate] = useState("");
  const [duration, setDuration] = useState("");
  const [collateral, setCollateral] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const n = parseInt(notional) || 0;
  const r = parseInt(rate) || 0;
  const d = parseInt(duration) || 0;
  const c = parseInt(collateral) || 0;

  const fixedPaymentPerCycle = n && r ? Math.floor((n * r) / 1_000_000) : null;
  const totalFixedObligation = fixedPaymentPerCycle && d ? fixedPaymentPerCycle * d : null;
  const recommendedCollateral = totalFixedObligation ? Math.ceil(totalFixedObligation * 1.5) : null;

  const isValid = n > 0 && r > 0 && d > 0 && c > 0;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!connected) { connect(); return; }
    if (!isValid) return;
    setSubmitting(true);
    try {
      const { request } = await import("@stacks/connect");
      const { uintCV } = await import("@stacks/transactions");
      await request("stx_callContract", {
        contract: CONTRACTS.core,
        functionName: "post-offer",
        functionArgs: [uintCV(n), uintCV(r), uintCV(d), uintCV(c)],
        network: NETWORK,
      });
      setSubmitted(true);
    } catch {
      setSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center px-5">
        <div className="max-w-md w-full text-center">
          <div className="w-14 h-14 rounded-full bg-green-50 border-2 border-green-200 flex items-center justify-center mx-auto mb-5">
            <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mb-2">Offer posted</h1>
          <p className="text-sm text-slate-500 leading-relaxed mb-8">
            Your fixed-rate offer is live on Rho. Once a variable party accepts, a swap starts and settlement begins from the next PoX cycle.
          </p>
          <div className="flex gap-3 justify-center">
            <Link href="/market" className="bg-slate-900 text-white font-semibold px-5 py-2.5 rounded-xl text-sm hover:bg-slate-700 transition-colors">
              View market
            </Link>
            <Link href="/dashboard" className="border border-slate-200 text-slate-700 font-semibold px-5 py-2.5 rounded-xl text-sm hover:bg-slate-50 transition-colors">
              Dashboard
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white min-h-screen">

      {/* Header */}
      <div className="border-b border-slate-100">
        <div className="max-w-6xl mx-auto px-5 py-12">
          <h1 className="text-3xl font-bold text-slate-900 mb-2">Post a fixed-rate offer</h1>
          <p className="text-sm text-slate-500 max-w-xl">
            You are taking the fixed side. You lock in a rate you are comfortable with.
            If the actual PoX rate falls below your fixed rate each cycle — the variable party tops you up.
            If it rises — you pass the excess to them. No principal changes hands.
          </p>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-5 py-10">
        <div className="grid lg:grid-cols-5 gap-10 items-start">

          {/* Form — takes 3 cols */}
          <form onSubmit={handleSubmit} className="lg:col-span-3 space-y-6">

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-widest mb-2">
                Notional amount <span className="text-slate-400 normal-case font-normal tracking-normal">(uSTX — never moves)</span>
              </label>
              <input
                type="number"
                min={1}
                value={notional}
                onChange={(e) => setNotional(e.target.value)}
                placeholder="10000000"
                className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-slate-900 bg-white"
              />
              <p className="text-xs text-slate-400 mt-2">
                The reference value used to calculate payments. 1,000,000 uSTX = 1 STX. This never actually moves.
              </p>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-widest mb-2">
                Fixed rate <span className="text-slate-400 normal-case font-normal tracking-normal">(bps — sats per 1M uSTX per cycle)</span>
              </label>
              <input
                type="number"
                min={1}
                value={rate}
                onChange={(e) => setRate(e.target.value)}
                placeholder="100"
                className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-slate-900 bg-white"
              />
              <p className="text-xs text-slate-400 mt-2">
                The BTC yield you want to lock in. Current PoX rates are typically 50–200 bps. Check the Stacks Explorer for recent cycles.
              </p>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-widest mb-2">
                Duration <span className="text-slate-400 normal-case font-normal tracking-normal">(PoX cycles — 1 cycle ≈ 2 weeks)</span>
              </label>
              <input
                type="number"
                min={1}
                max={52}
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
                placeholder="3"
                className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-slate-900 bg-white"
              />
              <p className="text-xs text-slate-400 mt-2">
                {d > 0 ? `${d} cycle${d > 1 ? "s" : ""} = ~${d * 2} weeks.` : "How many cycles this swap runs before closing."}
              </p>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-widest mb-2">
                Your collateral <span className="text-slate-400 normal-case font-normal tracking-normal">(sBTC sats — locked until swap closes)</span>
              </label>
              <input
                type="number"
                min={1}
                value={collateral}
                onChange={(e) => setCollateral(e.target.value)}
                placeholder={recommendedCollateral ? String(recommendedCollateral) : "500000"}
                className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-slate-900 bg-white"
              />
              <p className="text-xs text-slate-400 mt-2">
                {recommendedCollateral
                  ? `Recommended: ${recommendedCollateral.toLocaleString()} sats (150% of max obligation).`
                  : "Locked in the contract. Returned when the swap closes."}
              </p>
            </div>

            <button
              type="submit"
              disabled={submitting || (connected && !isValid)}
              className="w-full bg-slate-900 text-white font-bold py-3.5 rounded-xl text-sm hover:bg-slate-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {submitting ? "Confirming in wallet…" : connected ? "Post offer" : "Connect wallet to post"}
            </button>
          </form>

          {/* Live preview — takes 2 cols */}
          <div className="lg:col-span-2 space-y-4">
            <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Live payment preview</h2>

            <div className="bg-slate-50 rounded-2xl border border-slate-200 overflow-hidden">
              <div className="divide-y divide-slate-200">
                {[
                  { label: "Fixed payment / cycle", value: fixedPaymentPerCycle !== null ? `${fixedPaymentPerCycle.toLocaleString()} sats` : "—" },
                  { label: "Total fixed obligation", value: totalFixedObligation !== null ? `${totalFixedObligation.toLocaleString()} sats` : "—" },
                  { label: "Duration", value: d > 0 ? `${d} cycle${d > 1 ? "s" : ""} (~${d * 2}w)` : "—" },
                  { label: "Recommended collateral", value: recommendedCollateral !== null ? `${recommendedCollateral.toLocaleString()} sats` : "—" },
                ].map((row) => (
                  <div key={row.label} className="flex justify-between items-center px-5 py-3.5">
                    <span className="text-xs text-slate-500">{row.label}</span>
                    <span className={`text-sm font-mono font-semibold ${row.value === "—" ? "text-slate-300" : "text-slate-900"}`}>
                      {row.value}
                    </span>
                  </div>
                ))}
              </div>
              <div className="bg-amber-50 border-t border-amber-100 px-5 py-4">
                <p className="text-xs text-amber-800 leading-relaxed">
                  When actual rate &gt; fixed rate → variable party pockets the excess. When actual rate &lt; fixed rate → variable party tops you up. You always net your fixed rate.
                </p>
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 p-5">
              <h3 className="text-xs font-bold text-slate-700 uppercase tracking-widest mb-3">What happens to your collateral?</h3>
              <div className="space-y-3 text-xs text-slate-500 leading-relaxed">
                <div className="flex gap-2">
                  <span className="w-4 h-4 rounded-full bg-slate-100 flex-shrink-0 flex items-center justify-center text-slate-400 font-bold">1</span>
                  <p>Locked in the Rho contract when you post.</p>
                </div>
                <div className="flex gap-2">
                  <span className="w-4 h-4 rounded-full bg-slate-100 flex-shrink-0 flex items-center justify-center text-slate-400 font-bold">2</span>
                  <p>Adjusts each cycle based on who won the settlement.</p>
                </div>
                <div className="flex gap-2">
                  <span className="w-4 h-4 rounded-full bg-slate-100 flex-shrink-0 flex items-center justify-center text-slate-400 font-bold">3</span>
                  <p>Returned to your wallet when the swap closes.</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* FAQ */}
        <div className="mt-16 pt-10 border-t border-slate-100">
          <div className="grid md:grid-cols-3 gap-12">
            <div>
              <h2 className="text-xl font-bold text-slate-900 mb-2">Before you post</h2>
              <p className="text-sm text-slate-500 leading-relaxed">Common questions about posting a fixed-rate offer on Rho.</p>
            </div>
            <div className="md:col-span-2">
              <FAQAccordion items={faqs} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
