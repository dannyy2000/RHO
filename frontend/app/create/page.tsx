"use client";

import { useState } from "react";
import Link from "next/link";
import { useWallet } from "@/components/WalletProvider";
import { NETWORK, CONTRACTS } from "@/lib/stacks";
import FAQAccordion from "@/components/FAQAccordion";
import { USTX_PER_STX, fixedPayment, worstCasePerCycle, initialMargin, maxCollateral,
         offerErrors, fmt } from "@/lib/margin";

const faqs = [
  {
    q: "What is notional?",
    a: "Notional is the reference amount used to calculate payments, like the face value of a bond. It never moves between wallets. Each cycle's payment is notional × rate ÷ 1,000,000 STX. A notional of 100,000 STX at a rate of 6,000,000 is a payment of 600,000 sats per cycle.",
  },
  {
    q: "How do I choose the right fixed rate?",
    a: "Look at what recent cycles have paid. On testnet, PoX-5 has been paying around 6,000,000 sats per 1M STX per cycle; on mainnet, around 750,000–910,000. A rate near recent cycles gives the variable side a fair bet, so it is more likely to be accepted.",
  },
  {
    q: "How much do I have to deposit?",
    a: "At least 110% of two cycles of your worst case. The rate used for settlement is capped at 2× your fixed rate, so in one cycle you can owe at most one fixed payment. You may deposit up to 110% of the whole swap's worst case. Both sides follow the same rule.",
  },
  {
    q: "What if a cycle goes against me?",
    a: "After every settlement, each side must still hold at least two cycles of worst case (or what is left, if fewer). If you fall below, you get a margin call and about 144 Bitcoin blocks (roughly a day on mainnet) to top up from your dashboard. If you don't, anyone can liquidate the swap and you lose one cycle of worst case to the other side.",
  },
  {
    q: "What is a PoX cycle?",
    a: "On mainnet a cycle is about two weeks (2,100 Bitcoin blocks). On testnet it is about 2.5 days (900 blocks). A swap starts at the next full cycle after it is accepted.",
  },
  {
    q: "Can I cancel after posting?",
    a: "Yes, as long as nobody has accepted it. Cancel it from your dashboard and your deposit is returned.",
  },
];

export default function CreatePage() {
  const { address, connected, connect } = useWallet();

  const [notional, setNotional] = useState("");
  const [rate, setRate] = useState("");
  const [duration, setDuration] = useState("");
  const [collateral, setCollateral] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const toBig = (v: string) => (/^\d+$/.test(v.trim()) ? BigInt(v.trim()) : BigInt(0));
  const nStx = toBig(notional);
  const n = nStx * USTX_PER_STX;                 // the contract takes uSTX
  const r = toBig(rate);
  const d = toBig(duration);
  const c = toBig(collateral);
  const termsEntered = nStx > BigInt(0) && r > BigInt(0) && d > BigInt(0);

  const errors = termsEntered ? offerErrors(n, r, d) : [];
  const termsOk = termsEntered && errors.length === 0;
  const perCycle = termsOk ? fixedPayment(n, r) : null;
  const worst = termsOk ? worstCasePerCycle(n, r) : null;
  const minDeposit = termsOk ? initialMargin(n, r, d) : null;
  const maxDeposit = termsOk ? maxCollateral(n, r, d) : null;
  const depositOk = minDeposit !== null && maxDeposit !== null && c >= minDeposit && c <= maxDeposit;
  const isValid = termsOk && depositOk;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!connected) { connect(); return; }
    if (!isValid) return;
    setSubmitting(true);
    try {
      const { request } = await import("@stacks/connect");
      const { uintCV, Pc } = await import("@stacks/transactions");
      // See accept-offer in market/page.tsx: the collateral transfer needs a
      // post-condition or deny mode aborts the transaction.
      await request("stx_callContract", {
        contract: CONTRACTS.core,
        functionName: "post-offer",
        functionArgs: [uintCV(n), uintCV(r), uintCV(d), uintCV(c)],
        network: NETWORK,
        postConditionMode: "deny",
        postConditions: [Pc.principal(address!).willSendEq(c).ft(CONTRACTS.sbtc, "mock-sbtc")],
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
                Notional amount <span className="text-slate-400 normal-case font-normal tracking-normal">(STX — never moves)</span>
              </label>
              <input
                type="number"
                min={10000}
                max={1000000}
                value={notional}
                onChange={(e) => setNotional(e.target.value)}
                placeholder="100000"
                className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-slate-900 bg-white"
              />
              <p className="text-xs text-slate-400 mt-2">
                The reference amount used to calculate payments. It never moves.
                Between 10,000 and 1,000,000 STX per swap.
              </p>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-widest mb-2">
                Fixed rate <span className="text-slate-400 normal-case font-normal tracking-normal">(sats per 1,000,000 STX per cycle)</span>
              </label>
              <input
                type="number"
                min={1}
                max={20000000}
                value={rate}
                onChange={(e) => setRate(e.target.value)}
                placeholder="6000000"
                className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-slate-900 bg-white"
              />
              <p className="text-xs text-slate-400 mt-2">
                The BTC yield you want to lock in. Testnet PoX-5 has been paying around 6,000,000 on this basis; mainnet around 750,000–910,000. Maximum 20,000,000.
              </p>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-widest mb-2">
                Duration <span className="text-slate-400 normal-case font-normal tracking-normal">(PoX cycles — ~2 weeks on mainnet, ~2.5 days on testnet)</span>
              </label>
              <input
                type="number"
                min={1}
                max={13}
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
                placeholder="3"
                className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-slate-900 bg-white"
              />
              <p className="text-xs text-slate-400 mt-2">
                How many cycles the swap runs, starting at the next full cycle. Maximum 13.
              </p>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-widest mb-2">
                Your collateral <span className="text-slate-400 normal-case font-normal tracking-normal">(sBTC sats — locked until swap closes)</span>
              </label>
              <input
                type="number"
                min={minDeposit !== null ? String(minDeposit) : "1"}
                max={maxDeposit !== null ? String(maxDeposit) : undefined}
                value={collateral}
                onChange={(e) => setCollateral(e.target.value)}
                placeholder={minDeposit !== null ? String(minDeposit) : "Enter the terms above first"}
                className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-slate-900 bg-white"
              />
              <p className="text-xs text-slate-400 mt-2">
                {minDeposit !== null && maxDeposit !== null
                  ? `Between ${fmt(minDeposit)} and ${fmt(maxDeposit)} sats. The minimum covers two cycles of your worst case plus 10%.`
                  : "Locked in the contract. Returned when the swap closes."}
              </p>
              {minDeposit !== null && collateral === "" && (
                <button type="button" onClick={() => setCollateral(String(minDeposit))}
                  className="text-xs text-slate-600 underline mt-1">Use the minimum ({fmt(minDeposit)} sats)</button>
              )}
              {errors.length > 0 && (
                <ul className="text-xs text-red-600 mt-3 space-y-1">{errors.map((er) => <li key={er}>{er}</li>)}</ul>
              )}
              {termsOk && collateral !== "" && !depositOk && (
                <p className="text-xs text-red-600 mt-3">The deposit must be between {fmt(minDeposit!)} and {fmt(maxDeposit!)} sats.</p>
              )}
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
                  { label: "Fixed payment / cycle", value: perCycle !== null ? `${fmt(perCycle)} sats` : "—" },
                  { label: "Most either side can owe in a cycle", value: worst !== null ? `${fmt(worst)} sats` : "—" },
                  { label: "Rate counts as at most", value: termsOk ? `${fmt(r * BigInt(2))} (2× fixed)` : "—" },
                  { label: "Minimum deposit", value: minDeposit !== null ? `${fmt(minDeposit)} sats` : "—" },
                  { label: "Maximum deposit", value: maxDeposit !== null ? `${fmt(maxDeposit)} sats` : "—" },
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
                  When the actual rate is above your fixed rate, you pay the difference (counted up to 2× fixed). When it is below, the variable party pays you. Either way you net your fixed rate.
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
                  <p>Adjusts each cycle based on who won the settlement. If it drops below two cycles of worst case, top it up from your dashboard.</p>
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
