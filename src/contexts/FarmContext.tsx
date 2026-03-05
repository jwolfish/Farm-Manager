import { createContext, useContext, useState, useCallback, useMemo, ReactNode } from 'react';
import { Farm } from '../lib/farms';

export interface ActiveFarm {
  farmId: string | null;
  ownerId: string;
  ownerName: string | null;
  farmName: string | null;
  role: 'admin' | 'editor' | 'viewer';
  isOwn: boolean;
}

interface FarmContextValue {
  activeFarm: ActiveFarm | null;
  ownedFarms: Farm[];
  setOwnedFarms: (farms: Farm[]) => void;
  setOwnFarm: (userId: string, farmId: string | null, farmName: string | null) => void;
  setOwnFarmById: (userId: string, farm: Farm) => void;
  setSharedFarm: (farm: { farmId: string; ownerId: string; ownerName: string | null; farmName: string | null; role: 'editor' | 'viewer' }) => void;
  effectiveUserId: string | null;
  activeFarmId: string | null;
}

const FarmContext = createContext<FarmContextValue | null>(null);

export function FarmProvider({ children, currentUserId }: { children: ReactNode; currentUserId: string | null }) {
  const [activeFarm, setActiveFarm] = useState<ActiveFarm | null>(null);
  const [ownedFarms, setOwnedFarms] = useState<Farm[]>([]);

  const setOwnFarm = useCallback((userId: string, farmId: string | null, farmName: string | null) => {
    setActiveFarm({
      farmId,
      ownerId: userId,
      ownerName: null,
      farmName,
      role: 'admin',
      isOwn: true,
    });
  }, []);

  const setOwnFarmById = useCallback((userId: string, farm: Farm) => {
    setActiveFarm({
      farmId: farm.id,
      ownerId: userId,
      ownerName: null,
      farmName: farm.farmName,
      role: 'admin',
      isOwn: true,
    });
  }, []);

  const setSharedFarm = useCallback((farm: { farmId: string; ownerId: string; ownerName: string | null; farmName: string | null; role: 'editor' | 'viewer' }) => {
    setActiveFarm({
      farmId: farm.farmId,
      ownerId: farm.ownerId,
      ownerName: farm.ownerName,
      farmName: farm.farmName,
      role: farm.role,
      isOwn: false,
    });
  }, []);

  const effectiveUserId = activeFarm ? activeFarm.ownerId : currentUserId;
  const activeFarmId = activeFarm?.farmId ?? null;

  const value = useMemo(() => ({
    activeFarm,
    ownedFarms,
    setOwnedFarms,
    setOwnFarm,
    setOwnFarmById,
    setSharedFarm,
    effectiveUserId,
    activeFarmId,
  }), [activeFarm, ownedFarms, setOwnedFarms, setOwnFarm, setOwnFarmById, setSharedFarm, effectiveUserId, activeFarmId]);

  return (
    <FarmContext.Provider value={value}>
      {children}
    </FarmContext.Provider>
  );
}

export function useFarm(): FarmContextValue {
  const ctx = useContext(FarmContext);
  if (!ctx) throw new Error('useFarm must be used within FarmProvider');
  return ctx;
}
