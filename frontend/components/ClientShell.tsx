"use client";

import dynamic from "next/dynamic";

const WalletProvider = dynamic(
  () => import("@/components/WalletProvider").then((m) => m.WalletProvider),
  { ssr: false }
);

const Nav = dynamic(() => import("@/components/Nav"), { ssr: false });

export default function ClientShell({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <WalletProvider>
      <Nav />
      {children}
    </WalletProvider>
  );
}
