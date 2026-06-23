"use client";

import { useState } from "react";
import { useWallet } from "@/components/WalletProvider";
import { request } from "@stacks/connect";
import { uintCV } from "@stacks/transactions";
import { NETWORK, CONTRACTS } from "@/lib/stacks";

const faqs = [
  {
    q: "What is notional?",
    a: "Notional is the reference amount used to calculate payments — similar to the face value of a bond. It never changes hands. Payments are calculated as notional × rate / 1,000,000 each cycle.",
  },
  {
    q: "What is the fixed rate in bps?",
    a: "The fixed rate is expressed in basis points (bps), where 1 bps = sats earned per 1,000,000 uSTX per cycle. A rate of 100 bps on 1,000,000 uSTX notional = 100 sats per cycle. Set it at the yield you want to guarantee — if the actual PoX rate falls below this, the variable party pays you the difference.",
  },
  {
    q: "How do I know what fixed rate to set?",
    a: "Look at recent PoX cycle data on the Stacks explorer to see the current market rate. Set your fixed rate slightly below the recent average if you want an easy fill, or at the current rate if you want full protection. Rates typically range from 50–200 bps depending on miner competition.",
  },
  {
    q: "How much collateral do I need?",
    a: "As the fixed party, your collateral covers your obligation to pay the variable party when the actual rate exceeds your fixed rate. The required amount depends on your notional, rate, and duration. A safe rule of thumb: deposit enough to cover 150% of your maximum obligation (notional × fixed rate × duration / 1,000,000).",
  },
  {
    q: "What is a cycle?",
    a: "A PoX cycle is approximately two weeks (2,100 Bitcoin blocks). The duration field sets how many cycles your swap runs for. A duration of 3 cycles = roughly 6 weeks.",
  },
  {
    q: "Can I cancel after posting?",
    a: "Yes — as long as the offer has not been accepted yet. You can cancel from your Dashboard and your collateral will be returned in full.",
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
  const durationWeeks = d ? d * 2 : null;

  const isValid = n > 0 && r > 0 && d > 0 && c > 0;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!connected) { connect(); return; }
    if (!isValid) return;
    setSubmitting(true);
    try {
      await request("stx_callContract", {
        contract: CONTRACTS.core,
        functionName: "post-offer",
        functionArgs: [uintCV(n), uintCV(r), uintCV(d), uintCV(c)],
        network: NETWORK,
      });
      setSubmitting(false);
      setSubmitted(true);
    } catch {
      setSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <div className="max-w-6xl mx-auto px-6 py-12">
        <div className="max-w-md">
          <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center mb-4">
            <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-2xl font-semibold text-slate-900 mb-2">Offer posted</h1>
          <p className="text-sm text-slate-500 mb-6">
            Your fixed-rate offer is now live on Rho. Once a variable party accepts it, a swap will be created and settlement will begin at the next PoX cycle.
          </p>
          <div className="flex gap-3">
            <a href="/market" className="bg-slate-900 text-white text-sm font-medium px-4 py-2 rounded-md hover:bg-slate-700 transition-colors">
              View market
            </a>
            <a href="/dashboard" className="border border-slate-300 text-slate-700 text-sm font-medium px-4 py-2 rounded-md hover:bg-slate-50 transition-colors">
              Go to dashboard
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-6 py-12">
      <div className="mb-10">
        <h1 className="text-3xl font-semibold text-slate-900 mb-2">Post a fixed-rate offer</h1>
        <p className="text-sm text-slate-500 max-w-xl">
          You are taking the fixed side. You will receive the actual PoX rate each cycle and owe the fixed rate you set below.
          If the actual rate falls below your fixed rate, the variable party pays you the difference.
        </p>
      </div>

      <div className="grid lg:grid-cols-2 gap-12 items-start">

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-6">

          <div>
            <label className="block text-sm font-medium text-slate-900 mb-1">
              Notional amount <span className="text-slate-400 font-normal">(uSTX)</span>
            </label>
            <input
              type="number"
              min={1}
              value={notional}
              onChange={(e) => setNotional(e.target.value)}
              placeholder="e.g. 10000000"
              className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-slate-400"
            />
            <p className="text-xs text-slate-400 mt-1.5">
              The reference amount for calculating payments. 1,000,000 uSTX = 1 STX. This never moves — only the net payment does.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-900 mb-1">
              Fixed rate <span className="text-slate-400 font-normal">(bps — sats per 1,000,000 uSTX per cycle)</span>
            </label>
            <input
              type="number"
              min={1}
              value={rate}
              onChange={(e) => setRate(e.target.value)}
              placeholder="e.g. 100"
              className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-slate-400"
            />
            <p className="text-xs text-slate-400 mt-1.5">
              The BTC yield rate you want to lock in. Current PoX rates are typically 50–200 bps. Check recent cycle data on the Stacks Explorer.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-900 mb-1">
              Duration <span className="text-slate-400 font-normal">(PoX cycles)</span>
            </label>
            <input
              type="number"
              min={1}
              max={52}
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              placeholder="e.g. 3"
              className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-slate-400"
            />
            <p className="text-xs text-slate-400 mt-1.5">
              How many PoX cycles this swap runs for. 1 cycle ≈ 2 weeks (2,100 Bitcoin blocks).
              {durationWeeks ? ` ${d} cycle${d > 1 ? "s" : ""} = ~${durationWeeks} weeks.` : ""}
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-900 mb-1">
              Your collateral <span className="text-slate-400 font-normal">(sBTC sats)</span>
            </label>
            <input
              type="number"
              min={1}
              value={collateral}
              onChange={(e) => setCollateral(e.target.value)}
              placeholder={recommendedCollateral ? String(recommendedCollateral) : "e.g. 500000"}
              className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-slate-400"
            />
            <p className="text-xs text-slate-400 mt-1.5">
              sBTC deposited as security for the variable party.
              {recommendedCollateral
                ? ` Recommended: ${recommendedCollateral.toLocaleString()} sats (150% of max obligation).`
                : " Deposited to the contract until the swap closes."}
            </p>
          </div>

          <button
            type="submit"
            disabled={submitting || (!connected ? false : !isValid)}
            className="w-full bg-slate-900 text-white text-sm font-medium py-2.5 rounded-md hover:bg-slate-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {submitting ? "Confirming in wallet…" : connected ? "Post offer" : "Connect wallet to post"}
          </button>
        </form>

        {/* Live preview */}
        <div className="space-y-4">
          <h2 className="text-sm font-semibold text-slate-900">Payment preview</h2>
          <div className="bg-slate-50 border border-slate-200 rounded-lg divide-y divide-slate-200">
            <div className="px-4 py-3 flex justify-between text-sm">
              <span className="text-slate-500">Your fixed payment / cycle</span>
              <span className="font-mono font-semibold text-slate-900">
                {fixedPaymentPerCycle !== null ? `${fixedPaymentPerCycle.toLocaleString()} sats` : "—"}
              </span>
            </div>
            <div className="px-4 py-3 flex justify-between text-sm">
              <span className="text-slate-500">Total fixed obligation</span>
              <span className="font-mono text-slate-800">
                {totalFixedObligation !== null ? `${totalFixedObligation.toLocaleString()} sats` : "—"}
              </span>
            </div>
            <div className="px-4 py-3 flex justify-between text-sm">
              <span className="text-slate-500">Duration</span>
              <span className="font-mono text-slate-800">
                {d > 0 ? `${d} cycle${d > 1 ? "s" : ""} (~${durationWeeks} weeks)` : "—"}
              </span>
            </div>
            <div className="px-4 py-3 flex justify-between text-sm">
              <span className="text-slate-500">Recommended collateral</span>
              <span className="font-mono text-slate-800">
                {recommendedCollateral !== null ? `${recommendedCollateral.toLocaleString()} sats` : "—"}
              </span>
            </div>
            <div className="px-4 py-3 bg-amber-50 rounded-b-lg">
              <p className="text-xs text-amber-700">
                If the actual PoX rate every cycle is higher than your fixed rate, the variable party profits and your collateral reduces. If lower, you profit the spread.
              </p>
            </div>
          </div>

          <div className="border border-slate-200 rounded-lg p-4">
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-2">How your collateral is used</h3>
            <p className="text-sm text-slate-500 leading-relaxed">
              Your sBTC collateral is locked in the Rho contract when you post the offer. If a variable party accepts, it secures their claim against you.
              Each cycle, the collateral balance adjusts based on who won that cycle. When the swap closes, the remaining balance returns to your wallet.
            </p>
          </div>
        </div>
      </div>

      {/* FAQ */}
      <section className="mt-16 pt-10 border-t border-slate-100">
        <h2 className="text-xl font-semibold text-slate-900 mb-6">Before you post — common questions</h2>
        <div className="divide-y divide-slate-100 max-w-2xl">
          {faqs.map((faq, i) => (
            <div key={i} className="py-5">
              <h3 className="text-sm font-semibold text-slate-900 mb-2">{faq.q}</h3>
              <p className="text-sm text-slate-500 leading-relaxed">{faq.a}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
