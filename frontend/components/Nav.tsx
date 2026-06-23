"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useWallet } from "@/components/WalletProvider";

const links = [
  { href: "/", label: "Home" },
  { href: "/market", label: "Market" },
  { href: "/create", label: "Post Offer" },
  { href: "/dashboard", label: "Dashboard" },
];

export default function Nav() {
  const pathname = usePathname();
  const { address, connected, connect, disconnect } = useWallet();

  return (
    <header className="border-b border-slate-200 bg-white sticky top-0 z-30">
      <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
        <div className="flex items-center gap-8">
          <Link href="/" className="font-semibold text-slate-900 tracking-tight">
            Rho Protocol
          </Link>
          <nav className="hidden sm:flex items-center gap-1">
            {links.map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  pathname === href
                    ? "bg-slate-100 text-slate-900"
                    : "text-slate-500 hover:text-slate-900 hover:bg-slate-50"
                }`}
              >
                {label}
              </Link>
            ))}
          </nav>
        </div>

        <div className="flex items-center gap-3">
          {connected ? (
            <div className="flex items-center gap-3">
              <span className="text-xs font-mono text-slate-500 hidden sm:block">
                {address?.slice(0, 8)}…{address?.slice(-4)}
              </span>
              <button
                onClick={disconnect}
                className="text-sm text-slate-500 hover:text-slate-900 transition-colors"
              >
                Disconnect
              </button>
            </div>
          ) : (
            <button
              onClick={connect}
              className="bg-slate-900 text-white text-sm font-medium px-4 py-1.5 rounded-md hover:bg-slate-700 transition-colors"
            >
              Connect Wallet
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
