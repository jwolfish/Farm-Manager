import { createContext, useContext, useState, ReactNode } from 'react';

export interface ActiveFarm {
  ownerId: string;
  ownerName: string | null;
  farmName: string | null;
  role: 'admin' | 'editor' | 'viewer';
  isOwn: boolean;
}

interface FarmContextValue {
  activeFarm: ActiveFarm | null;
  setOwnFarm: (userId: string, farmName: string | null) => void;
  setSharedFarm: (farm: { ownerId: string; ownerName: string | null; farmName: string | null; role: 'editor' | 'viewer' }) => void;
  effectiveUserId: string | null;
}

const FarmContext = createContext<FarmContextValue | null>(null);

export function FarmProvider({ children, currentUserId }: { children: ReactNode; currentUserId: string | null }) {
  const [activeFarm, setActiveFarm] = useState<ActiveFarm | null>(null);

  const setOwnFarm = (userId: string, farmName: string | null) => {
    setActiveFarm({
      ownerId: userId,
      ownerName: null,
      farmName,
      role: 'admin',
      isOwn: true,
    });
  };

  const setSharedFarm = (farm: { ownerId: string; ownerName: string | null; farmName: string | null; role: 'editor' | 'viewer' }) => {
    setActiveFarm({
      ownerId: farm.ownerId,
      ownerName: farm.ownerName,
      farmName: farm.farmName,
      role: farm.role,
      isOwn: false,
    });
  };

  const effectiveUserId = activeFarm ? activeFarm.ownerId : currentUserId;

  return (
    <FarmContext.Provider value={{ activeFarm, setOwnFarm, setSharedFarm, effectiveUserId }}>
      {children}
    </FarmContext.Provider>
  );
}

export function useFarm(): FarmContextValue {
  const ctx = useContext(FarmContext);
  if (!ctx) throw new Error('useFarm must be used within FarmProvider');
  return ctx;
}
