import Link from "next/link";
import FAQAccordion from "@/components/FAQAccordion";

const faqs = [
  {
    q: "What is PoX yield?",
    a: "PoX stands for Proof of Transfer. Bitcoin miners who want to produce Stacks blocks must pay real BTC to STX stackers every two weeks. This is not a new token or synthetic reward — it is real Bitcoin going into your wallet, paid by miners as the cost of mining.",
  },
  {
    q: "Why does the rate keep changing?",
    a: "The rate is driven entirely by miner competition. More miners competing means more BTC paid, which means a higher yield. Fewer miners means a lower yield. The rate changes every two-week cycle with no way to predict it in advance.",
  },
  {
    q: "What is an interest rate swap?",
    a: "A contract between two parties where one always pays a fixed rate and the other always pays the floating (actual) rate on the same notional amount. Only the difference between the two payments moves each period — nobody exchanges the full notional. One party gets certainty. The other gets exposure to rate movement.",
  },
  {
    q: "What is the oracle and why is it needed?",
    a: "The Rho smart contract cannot automatically read Bitcoin transaction data. The oracle is the bridge — it reads how much BTC miners paid each cycle and posts that number into the Stacks contract. The contract then does all the math itself. In Phase 1 the Rho team runs the oracle. Phase 2 replaces this with cryptographic Bitcoin proofs anyone can submit.",
  },
  {
    q: "What is sBTC?",
    a: "sBTC is a 1:1 Bitcoin-backed asset on Stacks. One sBTC always equals one BTC. Rho uses sBTC for collateral because the swap exposure is denominated in BTC — sBTC is the natural collateral asset. On testnet we use a freely mintable mock token so anyone can test without the bridge.",
  },
  {
    q: "What happens if collateral runs out?",
    a: "Rho enforces a maintenance margin — the variable party's collateral must stay above 110% of their remaining obligation at all times. If a settlement pushes them below that threshold, the contract immediately liquidates the position and returns the correct amounts to both parties. No manual action required from anyone.",
  },
  {
    q: "Do I need to take action every cycle?",
    a: "No. Settlement is permissionless and the Rho oracle bot triggers it automatically. You only need to act when you want to close the swap after all cycles complete.",
  },
];

export default function HomePage() {
  return (
    <div className="bg-white">

      {/* ── Hero ─────────────────────────────────────────── */}
      <section className="border-b border-slate-100">
        <div className="max-w-6xl mx-auto px-5 py-24 md:py-32">
          <div className="max-w-2xl">
            <span className="inline-flex items-center gap-2 text-xs font-semibold text-amber-600 bg-amber-50 border border-amber-200 px-3 py-1.5 rounded-full mb-8 uppercase tracking-wider">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 inline-block" />
              Live on Stacks Testnet
            </span>
            <h1 className="text-4xl md:text-5xl font-bold text-slate-900 leading-tight tracking-tight mb-5">
              The first interest rate swap for Bitcoin PoX yield.
            </h1>
            <p className="text-lg text-slate-500 leading-relaxed mb-8">
              STX stackers earn real Bitcoin every two weeks — but the rate changes with every cycle.
              Rho lets you lock in a fixed rate, or take the floating rate and profit when it rises.
              All on-chain. No middleman.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link href="/market" className="bg-slate-900 text-white font-semibold px-6 py-3 rounded-xl text-sm hover:bg-slate-700 transition-colors">
                Browse open offers
              </Link>
              <Link href="/create" className="bg-white text-slate-800 font-semibold px-6 py-3 rounded-xl text-sm border border-slate-200 hover:border-slate-300 hover:bg-slate-50 transition-colors">
                Post a fixed-rate offer
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ── Why Rho exists ───────────────────────────────── */}
      <section className="border-b border-slate-100 bg-slate-50">
        <div className="max-w-6xl mx-auto px-5 py-16 grid md:grid-cols-3 gap-8">
          {[
            {
              label: "The yield is real",
              body: "Bitcoin miners pay actual BTC to STX stackers every two weeks through Proof of Transfer. This is not a token reward — it is real Bitcoin. Over $500M has been paid out since PoX launched.",
            },
            {
              label: "The problem is real",
              body: "The rate changes every cycle based on miner competition. One cycle 4%, the next 2.5%, the cycle after 3.8%. There is no way to plan around it — until now.",
            },
            {
              label: "Nobody built this yet",
              body: "Pendle Finance built the same mechanism for ETH staking yield on Ethereum and manages over $4 billion. The equivalent on Stacks does not exist. Rho is first.",
            },
          ].map((c) => (
            <div key={c.label} className="bg-white rounded-2xl border border-slate-200 p-6">
              <h3 className="text-sm font-bold text-slate-900 mb-2">{c.label}</h3>
              <p className="text-sm text-slate-500 leading-relaxed">{c.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── How it works ─────────────────────────────────── */}
      <section className="border-b border-slate-100 bg-white">
        <div className="max-w-6xl mx-auto px-5 py-20">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-slate-900 mb-3">How a swap works</h2>
            <p className="text-slate-500 text-sm max-w-lg mx-auto">
              Two parties. One fixed rate. One floating rate. The contract handles everything automatically.
            </p>
          </div>

          {/* Party comparison */}
          <div className="grid md:grid-cols-2 gap-6 mb-16">
            <div className="rounded-2xl border-2 border-amber-200 bg-amber-50 p-8">
              <div className="inline-block bg-amber-100 border border-amber-300 text-amber-800 text-xs font-bold uppercase tracking-widest px-3 py-1 rounded-full mb-5">
                Fixed party — the hedger
              </div>
              <h3 className="text-xl font-bold text-slate-900 mb-3">You want certainty.</h3>
              <p className="text-slate-600 text-sm leading-relaxed mb-4">
                You stack STX and earn PoX yield — but you hate not knowing how much you'll earn.
                You post a swap offer with a fixed rate you're happy with.
              </p>
              <p className="text-slate-600 text-sm leading-relaxed mb-4">
                Every cycle the swap tops you up if rates fall below your fixed rate, and passes your excess to the variable party if rates rise above it.
              </p>
              <div className="bg-white rounded-xl border border-amber-200 px-4 py-3">
                <p className="text-xs font-semibold text-amber-700">Your outcome every cycle:</p>
                <p className="text-sm font-bold text-slate-900 mt-1">Exactly the fixed rate — no matter what PoX pays.</p>
              </div>
            </div>

            <div className="rounded-2xl border-2 border-slate-200 bg-slate-50 p-8">
              <div className="inline-block bg-slate-200 border border-slate-300 text-slate-700 text-xs font-bold uppercase tracking-widest px-3 py-1 rounded-full mb-5">
                Variable party — the speculator
              </div>
              <h3 className="text-xl font-bold text-slate-900 mb-3">You want exposure.</h3>
              <p className="text-slate-600 text-sm leading-relaxed mb-4">
                You think PoX rates are going up, or you want leveraged exposure to Bitcoin yield without needing to stack STX yourself.
                You accept an open offer and deposit collateral.
              </p>
              <p className="text-slate-600 text-sm leading-relaxed mb-4">
                When rates beat the fixed rate you pocket the difference. When they fall below it, you cover the gap from your collateral.
              </p>
              <div className="bg-white rounded-xl border border-slate-200 px-4 py-3">
                <p className="text-xs font-semibold text-slate-500">Your outcome every cycle:</p>
                <p className="text-sm font-bold text-slate-900 mt-1">The actual PoX rate minus the fixed rate. You win when rates rise.</p>
              </div>
            </div>
          </div>

          {/* Step-by-step timeline */}
          <div className="max-w-2xl mx-auto">
            <h3 className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-8 text-center">The lifecycle — step by step</h3>
            <div className="relative">
              <div className="absolute left-5 top-0 bottom-0 w-px bg-slate-200" />
              {[
                {
                  step: "01",
                  title: "Fixed party posts an offer",
                  body: "Sets the fixed rate, notional amount, and duration. Deposits sBTC as collateral — locked in the contract, not transferable until the swap closes.",
                },
                {
                  step: "02",
                  title: "Variable party accepts",
                  body: "Deposits their own sBTC collateral (must cover 110% of remaining obligation). A live swap is created starting from the current PoX cycle.",
                },
                {
                  step: "03",
                  title: "Oracle posts the cycle rate",
                  body: "After each two-week cycle completes, the oracle submits the BTC paid by miners and the total STX stacked. The contract calculates the rate — the oracle cannot manipulate the math.",
                },
                {
                  step: "04",
                  title: "Contract settles automatically",
                  body: "Anyone can trigger settlement. The contract compares fixed vs actual rate on the notional, moves only the difference between collateral balances, and checks the variable party's margin.",
                },
                {
                  step: "05",
                  title: "Swap closes — collateral returned",
                  body: "After all cycles settle, either party calls close-swap. Each wallet receives their remaining collateral balance. The lifecycle is complete.",
                },
              ].map((s, i) => (
                <div key={i} className="relative flex gap-6 pb-10 last:pb-0">
                  <div className="flex-shrink-0 w-10 h-10 rounded-full bg-white border-2 border-slate-200 flex items-center justify-center relative z-10">
                    <span className="text-xs font-bold text-slate-500">{s.step}</span>
                  </div>
                  <div className="pt-1.5 pb-2">
                    <h4 className="text-sm font-bold text-slate-900 mb-1">{s.title}</h4>
                    <p className="text-sm text-slate-500 leading-relaxed">{s.body}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── The math ─────────────────────────────────────── */}
      <section className="border-b border-slate-100 bg-slate-50">
        <div className="max-w-6xl mx-auto px-5 py-20">
          <div className="grid md:grid-cols-2 gap-16 items-start">
            <div>
              <h2 className="text-3xl font-bold text-slate-900 mb-4">Every number is on-chain.</h2>
              <p className="text-slate-500 text-sm leading-relaxed mb-8">
                Rho uses no external price feed. The rate comes from two numbers that are publicly readable on Bitcoin and Stacks — and the contract calculates everything itself.
              </p>
              <div className="space-y-4">
                <div className="bg-white rounded-xl border border-slate-200 p-5">
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Rate formula</p>
                  <code className="block text-sm font-mono text-slate-900 mb-2">
                    rate_bps = btc_reward_sats × 1,000,000<br />
                    &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;÷ total_ustx_stacked
                  </code>
                  <p className="text-xs text-slate-400">Sats earned per 1,000,000 uSTX stacked per cycle.</p>
                </div>
                <div className="bg-white rounded-xl border border-slate-200 p-5">
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Settlement formula</p>
                  <code className="block text-sm font-mono text-slate-900 mb-2">
                    payment_sats = notional_ustx × rate_bps<br />
                    &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;÷ 1,000,000
                  </code>
                  <p className="text-xs text-slate-400">Run at fixed rate and actual rate. Only the net difference moves.</p>
                </div>
              </div>
            </div>

            <div>
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-5">Worked example</h3>
              <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                <div className="px-6 py-4 bg-slate-50 border-b border-slate-200">
                  <p className="text-sm font-semibold text-slate-700">Fixed rate: 80 bps · Notional: 10,000,000 uSTX</p>
                </div>
                <div className="divide-y divide-slate-100">
                  <div className="px-6 py-5">
                    <div className="flex items-start justify-between gap-4 mb-3">
                      <div>
                        <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Cycle A — miners compete hard</p>
                        <p className="text-sm text-slate-700">Actual rate: <span className="font-mono font-bold">100 bps</span></p>
                      </div>
                      <span className="flex-shrink-0 text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200 px-2.5 py-1 rounded-full">Variable wins</span>
                    </div>
                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div className="bg-slate-50 rounded-lg p-3">
                        <p className="text-slate-400 mb-1">Fixed payment owed</p>
                        <p className="font-mono font-bold text-slate-800">800 sats</p>
                      </div>
                      <div className="bg-slate-50 rounded-lg p-3">
                        <p className="text-slate-400 mb-1">Variable receives</p>
                        <p className="font-mono font-bold text-slate-800">+200 sats net</p>
                      </div>
                    </div>
                  </div>
                  <div className="px-6 py-5">
                    <div className="flex items-start justify-between gap-4 mb-3">
                      <div>
                        <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Cycle B — miners pull back</p>
                        <p className="text-sm text-slate-700">Actual rate: <span className="font-mono font-bold">55 bps</span></p>
                      </div>
                      <span className="flex-shrink-0 text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200 px-2.5 py-1 rounded-full">Fixed wins</span>
                    </div>
                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div className="bg-slate-50 rounded-lg p-3">
                        <p className="text-slate-400 mb-1">Fixed receives top-up</p>
                        <p className="font-mono font-bold text-slate-800">+250 sats net</p>
                      </div>
                      <div className="bg-slate-50 rounded-lg p-3">
                        <p className="text-slate-400 mb-1">Variable pays gap</p>
                        <p className="font-mono font-bold text-slate-800">-250 sats</p>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="px-6 py-4 bg-amber-50 border-t border-amber-100">
                  <p className="text-xs text-amber-800">
                    In both cycles the fixed party nets exactly <strong>800 sats</strong> — their agreed rate — regardless of what miners paid.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── CTA ──────────────────────────────────────────── */}
      <section className="border-b border-slate-100 bg-slate-900">
        <div className="max-w-6xl mx-auto px-5 py-16 flex flex-col md:flex-row items-center justify-between gap-6">
          <div>
            <h2 className="text-2xl font-bold text-white mb-1">Ready to try it?</h2>
            <p className="text-slate-400 text-sm">Connect a Stacks wallet. It takes under two minutes.</p>
          </div>
          <div className="flex gap-3">
            <Link href="/market" className="bg-white text-slate-900 font-semibold px-6 py-3 rounded-xl text-sm hover:bg-slate-100 transition-colors">
              View market
            </Link>
            <Link href="/create" className="border border-slate-600 text-slate-300 font-semibold px-6 py-3 rounded-xl text-sm hover:border-slate-400 hover:text-white transition-colors">
              Post offer
            </Link>
          </div>
        </div>
      </section>

      {/* ── FAQ ──────────────────────────────────────────── */}
      <section className="bg-white">
        <div className="max-w-6xl mx-auto px-5 py-20">
          <div className="grid md:grid-cols-3 gap-16">
            <div>
              <h2 className="text-2xl font-bold text-slate-900 mb-3">Common questions</h2>
              <p className="text-sm text-slate-500 leading-relaxed">
                Everything you need to understand before your first swap. Click any question to expand.
              </p>
            </div>
            <div className="md:col-span-2">
              <FAQAccordion items={faqs} />
            </div>
          </div>
        </div>
      </section>

    </div>
  );
}
