'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useSession } from 'next-auth/react';

interface GoldContextType {
  goldBalance: number | null;
  updateGoldBalance: (newBalance: number) => void;
  refreshGoldBalance: () => void;
}

const GoldContext = createContext<GoldContextType | undefined>(undefined);

export function GoldProvider({ children }: { children: ReactNode }) {
  const { data: session } = useSession();
  const [goldBalance, setGoldBalance] = useState<number | null>(null);

  const fetchGoldBalance = async () => {
    if (!session) return;
    
    try {
      const response = await fetch('/api/wallet/gold-balance');
      if (response.ok) {
        const data = await response.json();
        const n = Number(data?.balance ?? data?.goldBalance ?? 0);
        setGoldBalance(Number.isFinite(n) ? n : 0);
      }
    } catch (error) {
      console.error('Error fetching gold balance:', error);
    }
  };

  useEffect(() => {
    if (session) {
      fetchGoldBalance();
    } else {
      setGoldBalance(null);
    }
  }, [session]);

  const updateGoldBalance = (newBalance: number) => {
    setGoldBalance(newBalance);
  };

  const refreshGoldBalance = () => {
    fetchGoldBalance();
  };

  return (
    <GoldContext.Provider value={{ goldBalance, updateGoldBalance, refreshGoldBalance }}>
      {children}
    </GoldContext.Provider>
  );
}

export function useGold() {
  const context = useContext(GoldContext);
  if (context === undefined) {
    throw new Error('useGold must be used within a GoldProvider');
  }
  return context;
}
