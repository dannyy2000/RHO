"use client";

import React, { createContext, useContext, useState, useCallback, useEffect } from "react";
import { connect, disconnect as stacksDisconnect, isConnected, getLocalStorage } from "@stacks/connect";

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
    if (isConnected()) {
      const data = getLocalStorage();
      const addr = data?.addresses?.stx?.[0]?.address ?? null;
      setAddress(addr);
    }
  }, []);

  const handleConnect = useCallback(async () => {
    try {
      await connect();
      const data = getLocalStorage();
      const addr = data?.addresses?.stx?.[0]?.address ?? null;
      setAddress(addr);
    } catch {
      // user cancelled
    }
  }, []);

  const handleDisconnect = useCallback(() => {
    stacksDisconnect();
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
