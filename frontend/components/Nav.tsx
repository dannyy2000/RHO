"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useWallet } from "@/components/WalletProvider";
import { useState } from "react";

const links = [
  { href: "/market", label: "Market" },
  { href: "/create", label: "Post Offer" },
  { href: "/dashboard", label: "Dashboard" },
];

export default function Nav() {
  const pathname = usePathname();
  const { address, connected, connect, disconnect } = useWallet();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="border-b border-slate-100 bg-white sticky top-0 z-30">
      <div className="max-w-6xl mx-auto px-5 h-16 flex items-center justify-between">

        {/* Logo */}
        <Link href="/" className="flex items-center gap-2.5 group">
          <div className="w-7 h-7 rounded-md bg-slate-900 flex items-center justify-center group-hover:bg-slate-700 transition-colors">
            <span className="text-white text-xs font-bold tracking-tight">ρ</span>
          </div>
          <span className="font-semibold text-slate-900 text-sm tracking-tight">Rho Protocol</span>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-1">
          {links.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                pathname === href
                  ? "bg-slate-100 text-slate-900"
                  : "text-slate-500 hover:text-slate-900 hover:bg-slate-50"
              }`}
            >
              {label}
            </Link>
          ))}
        </nav>

        {/* Wallet + mobile toggle */}
        <div className="flex items-center gap-3">
          {connected ? (
            <div className="hidden md:flex items-center gap-3">
              <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500 flex-shrink-0" />
                <span className="text-xs font-mono text-slate-600">
                  {address?.slice(0, 6)}…{address?.slice(-4)}
                </span>
              </div>
              <button
                onClick={disconnect}
                className="text-xs text-slate-400 hover:text-slate-900 transition-colors font-medium"
              >
                Disconnect
              </button>
            </div>
          ) : (
            <button
              onClick={connect}
              className="hidden md:block bg-slate-900 text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-slate-700 transition-colors"
            >
              Connect Wallet
            </button>
          )}

          {/* Mobile menu button */}
          <button
            className="md:hidden p-2 rounded-lg hover:bg-slate-50 transition-colors"
            onClick={() => setMenuOpen(!menuOpen)}
          >
            <div className="w-5 space-y-1.5">
              <span className={`block h-0.5 bg-slate-700 transition-all duration-200 ${menuOpen ? "rotate-45 translate-y-2" : ""}`} />
              <span className={`block h-0.5 bg-slate-700 transition-all duration-200 ${menuOpen ? "opacity-0" : ""}`} />
              <span className={`block h-0.5 bg-slate-700 transition-all duration-200 ${menuOpen ? "-rotate-45 -translate-y-2" : ""}`} />
            </div>
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {menuOpen && (
        <div className="md:hidden border-t border-slate-100 bg-white px-5 py-4 space-y-1">
          {links.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              onClick={() => setMenuOpen(false)}
              className={`block px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
                pathname === href ? "bg-slate-100 text-slate-900" : "text-slate-600 hover:bg-slate-50"
              }`}
            >
              {label}
            </Link>
          ))}
          <div className="pt-2 border-t border-slate-100 mt-2">
            {connected ? (
              <div className="flex items-center justify-between px-4 py-2">
                <span className="text-xs font-mono text-slate-500">{address?.slice(0, 10)}…</span>
                <button onClick={disconnect} className="text-xs text-red-500 font-medium">Disconnect</button>
              </div>
            ) : (
              <button
                onClick={() => { connect(); setMenuOpen(false); }}
                className="w-full bg-slate-900 text-white text-sm font-semibold px-4 py-3 rounded-lg"
              >
                Connect Wallet
              </button>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
