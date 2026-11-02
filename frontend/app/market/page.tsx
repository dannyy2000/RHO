"use client";

import { useState, useEffect } from "react";
import { useWallet } from "@/components/WalletProvider";
import { NETWORK, CONTRACTS } from "@/lib/stacks";
import { fetchOpenOffers, type Offer } from "@/lib/contract";
import FAQAccordion from "@/components/FAQAccordion";
import { initialMargin, maxCollateral, worstCasePerCycle, ustxToStx } from "@/lib/margin";

function shortAddr(a: string) {
  return a.length > 14 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a;
}

function fmt(n: number) { return n.toLocaleString(); }

function AcceptModal({ offer, onClose }: { offer: Offer; onClose: () => void }) {
  const { address, connected, connect } = useWallet();
  const [collateral, setCollateral] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const N = BigInt(offer.notionalUstx), F = BigInt(offer.fixedRate), D = BigInt(offer.durationCycles);
  const satRequired = Number(initialMargin(N, F, D));
  const satMax = Number(maxCollateral(N, F, D));
  const worst = Number(worstCasePerCycle(N, F));
  const collateralNum = collateral === "" ? satRequired : parseInt(collateral, 10);
  const valid = Number.isFinite(collateralNum) && collateralNum >= satRequired && collateralNum <= satMax;

  async function handleAccept() {
    if (!connected) { connect(); return; }
    if (!valid) return;
    setSubmitting(true);
    try {
      const { request } = await import("@stacks/connect");
      const { uintCV, Pc } = await import("@stacks/transactions");
      // The deposit moves mock sBTC out of the caller's wallet. Without a
      // post-condition covering it, the wallet's default deny mode aborts the
      // transaction after the contract call succeeds.
      await request("stx_callContract", {
        contract: CONTRACTS.core,
        functionName: "accept-offer",
        functionArgs: [uintCV(offer.id), uintCV(collateralNum)],
        network: NETWORK,
        postConditionMode: "deny",
        postConditions: [Pc.principal(address!).willSendEq(collateralNum).ft(CONTRACTS.sbtc, "mock-sbtc")],
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
            <h2 className="text-base font-bold text-slate-900 mb-2">Transaction submitted</h2>
            <p className="text-sm text-slate-500 mb-5">It can take a few minutes to confirm. Your position appears on the dashboard once it does.</p>
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
                <span className="font-mono font-semibold text-slate-800">{ustxToStx(offer.notionalUstx)} STX</span>
              </div>
              <div className="flex justify-between px-4 py-3">
                <span className="text-slate-500">Fixed rate (you owe)</span>
                <span className="font-mono font-semibold text-amber-700">{offer.fixedRate.toLocaleString()} / cycle</span>
              </div>
              <div className="flex justify-between px-4 py-3">
                <span className="text-slate-500">Duration</span>
                <span className="font-mono font-semibold text-slate-800">{offer.durationCycles} cycle{offer.durationCycles > 1 ? "s" : ""}</span>
              </div>
              <div className="flex justify-between px-4 py-3">
                <span className="text-slate-500">Most you can owe in a cycle</span>
                <span className="font-mono font-semibold text-slate-800">{fmt(worst)} sats</span>
              </div>
              <div className="flex justify-between px-4 py-3 bg-white rounded-b-xl">
                <span className="text-slate-500">Deposit (min – max)</span>
                <span className="font-mono font-bold text-slate-900">{fmt(satRequired)} – {fmt(satMax)} sats</span>
              </div>
            </div>

            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Your collateral <span className="text-slate-400 font-normal">(sBTC sats)</span>
            </label>
            <input
              type="number"
              min={satRequired}
              max={satMax}
              value={collateral}
              onChange={(e) => setCollateral(e.target.value)}
              placeholder={String(satRequired)}
              className="w-full border border-slate-300 rounded-xl px-3 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-slate-900 mb-1"
            />
            <p className="text-xs text-slate-400 mb-5">
              Leave blank to deposit the minimum: two cycles of your worst case plus 10%. If a cycle takes you below two cycles of worst case, you'll get a margin call to top up.
            </p>

            <div className="flex gap-3">
              <button
                onClick={handleAccept}
                disabled={submitting || !valid}
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
    a: "You take the floating side. Each cycle you receive what PoX-5 actually paid on the notional and owe the fixed rate. If the actual rate is higher, you receive the difference; if it is lower, you pay it. The actual rate counts as at most 2× the fixed rate.",
  },
  {
    q: "How much do I have to deposit?",
    a: "At least 110% of two cycles of your worst case, and at most 110% of the whole swap's worst case. Your worst case in one cycle is the full fixed payment, if PoX-5 paid nothing. The fixed party follows the same rule.",
  },
  {
    q: "What is a margin call?",
    a: "After every settlement, each side must still hold two cycles of worst case (or what is left, if fewer). If you fall below, you have about 144 Bitcoin blocks to top up from your dashboard. If you don't, anyone can liquidate the swap: you lose one cycle of worst case to the other side and get the rest back.",
  },
  {
    q: "Where does the rate come from?",
    a: "From PoX-5 itself. The trustless oracle reads the Tranche 2 rate for each cycle once PoX-5 can no longer change it. Nobody submits rates.",
  },
  {
    q: "Can I exit early?",
    a: "Not in this version. A swap runs until every cycle settles, or until it is liquidated.",
  },
];

export default function MarketPage() {
  const [selected, setSelected] = useState<Offer | null>(null);
  const [offers, setOffers] = useState<Offer[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    fetchOpenOffers()
      .then((o) => { if (live) setOffers(o); })
      .catch((e) => { if (live) setLoadError(String(e?.message ?? e)); });
    return () => { live = false; };
  }, []);

  return (
    <div className="bg-white min-h-screen">

      {/* Header */}
      <div className="border-b border-slate-100">
        <div className="max-w-6xl mx-auto px-5 py-12">
          <h1 className="text-3xl font-bold text-slate-900 mb-2">Open offers</h1>
          <p className="text-slate-500 text-sm max-w-2xl">
            Each row is a fixed-party offer: someone who wants to lock in a fixed PoX rate.
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
            <p className="text-sm font-semibold text-amber-900 mb-1">How is the rate quoted?</p>
            <p className="text-sm text-amber-800 leading-relaxed">
              Rates are quoted as <strong>sats earned per 1,000,000 STX stacked, per cycle</strong>.
              Mainnet cycle 142 paid 909,456 on that basis; testnet cycles have been paying around 6,000,000. A 6,000,000 rate on a 100,000 STX notional is a fixed payment of 600,000 sats per cycle. The rate is read from PoX-5 itself.
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
                <th className="text-right px-5 py-3.5 text-xs font-bold text-slate-400 uppercase tracking-wider">Fixed side deposit</th>
                <th className="px-5 py-3.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {offers === null && !loadError && (
                <tr><td colSpan={7} className="px-5 py-10 text-center text-sm text-slate-400">Loading offers from {CONTRACTS.core}…</td></tr>
              )}
              {loadError && (
                <tr><td colSpan={7} className="px-5 py-10 text-center text-sm text-red-600">Could not reach the contract: {loadError}</td></tr>
              )}
              {offers !== null && offers.length === 0 && (
                <tr><td colSpan={7} className="px-5 py-10 text-center text-sm text-slate-400">
                  No open offers on chain right now. Post one from the Create page and it will appear here.
                </td></tr>
              )}
              {(offers ?? []).map((offer) => (
                <tr key={offer.id} className="hover:bg-slate-50 transition-colors group">
                  <td className="px-5 py-4 font-mono text-slate-400 text-xs">{offer.id}</td>
                  <td className="px-5 py-4 font-mono text-slate-600 text-xs">{shortAddr(offer.fixedParty)}</td>
                  <td className="px-5 py-4 text-right font-mono text-slate-800">{ustxToStx(offer.notionalUstx)} <span className="text-slate-400 text-xs">STX</span></td>
                  <td className="px-5 py-4 text-right">
                    <span className="bg-amber-50 text-amber-700 font-mono font-bold text-xs px-2.5 py-1 rounded-full border border-amber-200">
                      {offer.fixedRate.toLocaleString()}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-right text-slate-600 text-sm">
                    {offer.durationCycles} cycle{offer.durationCycles > 1 ? "s" : ""}
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
