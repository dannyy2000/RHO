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
          <footer className="border-t border-slate-200 py-8 mt-16">
            <div className="max-w-6xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-slate-400">
              <span>Rho Protocol &mdash; PoX Interest Rate Swaps on Stacks</span>
              <div className="flex gap-6">
                <a
                  href="https://github.com/libby-coder/rho"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-slate-900 transition-colors"
                >
                  GitHub
                </a>
                <a
                  href="https://explorer.hiro.so"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-slate-900 transition-colors"
                >
                  Explorer
                </a>
              </div>
            </div>
          </footer>
        </ClientShell>
      </body>
    </html>
  );
}
