import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";
import ClientShell from "@/components/ClientShell";

const geist = Geist({ subsets: ["latin"], variable: "--font-geist-sans" });

export const metadata: Metadata = {
  title: "Rho Protocol — PoX Interest Rate Swaps on Stacks",
  description:
    "Hedge or gain exposure to Bitcoin PoX yield. Rho Protocol lets STX stackers lock in a fixed BTC rate or take the floating PoX rate through on-chain interest rate swaps.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${geist.variable} h-full`}>
      <body className="min-h-full flex flex-col bg-white text-slate-900">
        <ClientShell>
          <main className="flex-1">{children}</main>
          <footer className="border-t border-slate-100 bg-white">
            <div className="max-w-6xl mx-auto px-5 py-8 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-2.5">
                <div className="w-6 h-6 rounded-md bg-slate-900 flex items-center justify-center">
                  <span className="text-white text-xs font-bold">ρ</span>
                </div>
                <span className="text-sm text-slate-500 font-medium">Rho Protocol</span>
                <span className="text-slate-300 text-sm">—</span>
                <span className="text-xs text-slate-400">PoX interest rate swaps on Stacks</span>
              </div>
              <div className="flex gap-5 text-xs text-slate-400">
                <a href="https://github.com/dannyy2000/rho" target="_blank" rel="noopener noreferrer" className="hover:text-slate-900 transition-colors font-medium">GitHub</a>
                <a href="https://explorer.hiro.so" target="_blank" rel="noopener noreferrer" className="hover:text-slate-900 transition-colors font-medium">Explorer</a>
                <span>Testnet</span>
              </div>
            </div>
          </footer>
        </ClientShell>
      </body>
    </html>
  );
}
