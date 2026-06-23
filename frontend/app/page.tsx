import Link from "next/link";

const steps = [
  {
    number: "01",
    title: "Fixed party posts an offer",
    body: "A STX stacker specifies a notional amount, a fixed rate they want to lock in, and a duration. They deposit sBTC as collateral — this secures their obligation to pay the variable party if the actual PoX rate exceeds the fixed rate.",
  },
  {
    number: "02",
    title: "Variable party accepts the offer",
    body: "Any wallet can accept an open offer by depositing their own sBTC collateral. From this point, a live swap is active. The variable party will receive the actual PoX rate each cycle and pay the fixed rate.",
  },
  {
    number: "03",
    title: "Oracle posts the cycle rate",
    body: "After each two-week PoX cycle, the Rho oracle submits the total BTC rewards paid and the total STX stacked. The contract calculates the rate: rate = BTC rewards × 1,000,000 ÷ total STX stacked.",
  },
  {
    number: "04",
    title: "Settlement runs on-chain, automatically",
    body: "Anyone can call settle-cycle once the oracle rate is posted. The contract calculates who owes whom, adjusts collateral balances, and checks the variable party's maintenance margin. No manual action required from either party.",
  },
  {
    number: "05",
    title: "Swap closes — collateral returned",
    body: "After all cycles settle, either party calls close-swap. Remaining sBTC collateral returns to each party, net of accumulated settlements. The lifecycle is complete.",
  },
];

const faqs = [
  {
    q: "What is PoX yield?",
    a: "PoX stands for Proof of Transfer, the consensus mechanism that Stacks uses to anchor to Bitcoin. Bitcoin miners who want to produce Stacks blocks must pay real BTC to a pool of STX stackers. This creates a native Bitcoin yield for anyone holding and stacking STX — currently around 6–12% APY paid in BTC, not a new token.",
  },
  {
    q: "Why does the rate change?",
    a: "The PoX rate is determined by miner competition. When more miners compete to mine Stacks blocks, they pay more BTC, raising the rate. When competition drops, so does the rate. This makes PoX yield variable — similar to how floating interest rates work in traditional finance.",
  },
  {
    q: "What is an interest rate swap?",
    a: "An interest rate swap is a contract between two parties where one pays a fixed rate and the other pays a floating rate on the same notional amount. They exchange the difference each period. If the actual rate is higher than the fixed rate, the variable party profits. If lower, the fixed party profits. No principal changes hands — only the net difference each period.",
  },
  {
    q: "What is sBTC?",
    a: "sBTC is a 1:1 Bitcoin-backed asset on Stacks. One sBTC always equals one BTC — it is not synthetic or algorithmic. Rho uses sBTC for collateral because the underlying exposure in a PoX swap is denominated in BTC, making sBTC the natural settlement asset.",
  },
  {
    q: "What happens if a party cannot cover a settlement?",
    a: "Rho uses a maintenance margin system. The variable party's collateral must always exceed 110% of their remaining obligation. If a settlement pushes them below this threshold, the contract automatically liquidates the position — distributing remaining collateral to both parties at the correct amounts. This happens on-chain with no manual intervention.",
  },
  {
    q: "Is this protocol audited?",
    a: "The protocol is currently on testnet. All Clarity contracts are open-source and fully verifiable on-chain — Clarity's deterministic design means every execution rule is readable before you sign anything. A formal audit is planned before mainnet launch with real sBTC collateral.",
  },
  {
    q: "Do I need to do anything each cycle?",
    a: "No. Settlement is permissionless — any wallet can call settle-cycle once the oracle has posted the rate for that cycle. In practice, the Rho oracle bot calls it automatically. You only need to act to close the swap after all cycles complete.",
  },
];

export default function HomePage() {
  return (
    <div className="max-w-6xl mx-auto px-6">

      {/* Hero */}
      <section className="pt-20 pb-16 border-b border-slate-100">
        <div className="max-w-2xl">
          <div className="inline-flex items-center gap-2 bg-amber-50 border border-amber-200 text-amber-700 text-xs font-medium px-3 py-1 rounded-full mb-6">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 inline-block" />
            Live on Stacks Testnet
          </div>
          <h1 className="text-4xl sm:text-5xl font-semibold text-slate-900 leading-tight tracking-tight mb-5">
            Lock in a fixed Bitcoin yield.<br />
            Or trade the floating rate.
          </h1>
          <p className="text-lg text-slate-500 leading-relaxed mb-8">
            Rho Protocol is the first interest rate swap for PoX yield on Stacks.
            STX stackers earn real BTC every two weeks — but the rate fluctuates.
            Rho lets you fix it, or speculate on it.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/market"
              className="bg-slate-900 text-white font-medium px-5 py-2.5 rounded-md hover:bg-slate-700 transition-colors text-sm"
            >
              Browse open offers
            </Link>
            <Link
              href="/create"
              className="border border-slate-300 text-slate-700 font-medium px-5 py-2.5 rounded-md hover:border-slate-400 hover:bg-slate-50 transition-colors text-sm"
            >
              Post a fixed-rate offer
            </Link>
          </div>
        </div>
      </section>

      {/* Three-column explainer */}
      <section className="py-16 border-b border-slate-100">
        <div className="grid sm:grid-cols-3 gap-10">
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-3">The context</p>
            <h3 className="text-base font-semibold text-slate-900 mb-2">Bitcoin miners pay STX stackers every cycle</h3>
            <p className="text-sm text-slate-500 leading-relaxed">
              Stacks uses Proof of Transfer. Miners pay BTC to win the right to produce Stacks blocks. That BTC flows to STX stackers — real Bitcoin, paid every two weeks, with no new token inflation.
            </p>
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-3">The problem</p>
            <h3 className="text-base font-semibold text-slate-900 mb-2">The rate changes every cycle with no hedge available</h3>
            <p className="text-sm text-slate-500 leading-relaxed">
              When miner competition is high, the yield is high. When it drops, so does your BTC income. Until now there has been no on-chain way to hedge this risk or lock in a guaranteed return.
            </p>
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-3">The solution</p>
            <h3 className="text-base font-semibold text-slate-900 mb-2">Swap the floating rate for a fixed one</h3>
            <p className="text-sm text-slate-500 leading-relaxed">
              Rho lets two parties agree on a fixed BTC yield rate. Net payments settle on-chain each cycle using sBTC collateral. One party is protected from rate drops. The other profits when rates rise.
            </p>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="py-16 border-b border-slate-100">
        <h2 className="text-2xl font-semibold text-slate-900 mb-2">How a swap works, step by step</h2>
        <p className="text-sm text-slate-500 mb-10">
          Every step happens on-chain through Clarity smart contracts. No custodian, no off-chain settlement.
        </p>
        <div className="space-y-0 max-w-2xl">
          {steps.map((step, i) => (
            <div key={i} className="flex gap-6 pb-8">
              <div className="flex-shrink-0 pt-0.5 w-7">
                <span className="text-xs font-mono font-bold text-slate-300">{step.number}</span>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-slate-900 mb-1">{step.title}</h3>
                <p className="text-sm text-slate-500 leading-relaxed">{step.body}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* The math */}
      <section className="py-16 border-b border-slate-100">
        <div className="max-w-2xl">
          <h2 className="text-2xl font-semibold text-slate-900 mb-2">The math, openly</h2>
          <p className="text-sm text-slate-500 mb-8">
            No black boxes. Every settlement number is derived from two public on-chain inputs.
          </p>
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-6 space-y-6">
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-2">
                Step 1 — Oracle computes the rate
              </p>
              <div className="font-mono text-sm text-slate-800 bg-white border border-slate-200 px-4 py-3 rounded">
                rate_bps = btc_reward_sats &times; 1,000,000 &divide; total_ustx_stacked
              </div>
              <p className="text-xs text-slate-400 mt-2">
                Result: sats earned per 1,000,000 uSTX stacked per cycle.
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-2">
                Step 2 — Contract settles each party
              </p>
              <div className="font-mono text-sm text-slate-800 bg-white border border-slate-200 px-4 py-3 rounded">
                payment_sats = notional_ustx &times; rate_bps &divide; 1,000,000
              </div>
              <p className="text-xs text-slate-400 mt-2">
                Run once for the fixed rate, once for the actual rate. The net difference transfers between collateral balances.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-16">
        <h2 className="text-2xl font-semibold text-slate-900 mb-10">Frequently asked questions</h2>
        <div className="divide-y divide-slate-100 max-w-3xl">
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
