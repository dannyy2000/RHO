"use client";

import React, { createContext, useContext, useState, useCallback, useEffect } from "react";

interface WalletState {
  address: string | null;
  connected: boolean;
  connect: () => Promise<void>;
  disconnect: () => void;
}

const WalletContext = createContext<WalletState>({
  address: null,
  connected: false,
  connect: async () => {},
  disconnect: () => {},
});

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [address, setAddress] = useState<string | null>(null);

  useEffect(() => {
    import("@stacks/connect").then(({ isConnected, getLocalStorage }) => {
      try {
        if (isConnected()) {
          const data = getLocalStorage();
          const addr = data?.addresses?.stx?.[0]?.address ?? null;
          setAddress(addr);
        }
      } catch {
        // wallet not available
      }
    }).catch(() => {});
  }, []);

  const handleConnect = useCallback(async () => {
    try {
      const { connect } = await import("@stacks/connect");
      await connect();
      const { getLocalStorage } = await import("@stacks/connect");
      const data = getLocalStorage();
      const addr = data?.addresses?.stx?.[0]?.address ?? null;
      setAddress(addr);
    } catch {
      // user cancelled or wallet unavailable
    }
  }, []);

  const handleDisconnect = useCallback(async () => {
    try {
      const { disconnect } = await import("@stacks/connect");
      disconnect();
    } catch {
      // ignore
    }
    setAddress(null);
  }, []);

  return (
    <WalletContext.Provider
      value={{
        address,
        connected: !!address,
        connect: handleConnect,
        disconnect: handleDisconnect,
      }}
    >
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet() {
  return useContext(WalletContext);
}
