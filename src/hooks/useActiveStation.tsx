import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { STATIONS, type StationId } from '../data/content';
import {
  getStationSnapshot,
  startStationTicker,
  subscribeActiveStation,
} from './useActiveStationStore';

/**
 * The React half of the station store: one ticker, one context, one discrete
 * snapshot. The continuous values live in `useActiveStationStore` and are read
 * imperatively, so this file re-renders a component only when the active station
 * actually changes.
 */

export interface ActiveStationContextValue {
  activeId: StationId;
  activeIndex: number;
}

const ActiveStationContext = createContext<ActiveStationContextValue>({
  activeId: STATIONS[0]?.id ?? 'hero',
  activeIndex: 0,
});

const SERVER_SNAPSHOT = { activeId: STATIONS[0]?.id ?? 'hero', activeIndex: 0 } as const;

/**
 * Mounts the store's rAF ticker and publishes the active station to React.
 */
export function ActiveStationProvider({ children }: { children: ReactNode }) {
  useEffect(() => startStationTicker(), []);

  const value = useSyncExternalStore(
    subscribeActiveStation,
    getStationSnapshot,
    // Server/prerender snapshot: never active, so nothing claims to be.
    () => SERVER_SNAPSHOT,
  );

  const contextValue = useMemo(
    () => ({ activeId: value.activeId, activeIndex: value.activeIndex }),
    [value.activeId, value.activeIndex],
  );

  return <ActiveStationContext.Provider value={contextValue}>{children}</ActiveStationContext.Provider>;
}

/** The active station id and index. Re-renders only when the station changes. */
export function useActiveStation(): ActiveStationContextValue {
  return useContext(ActiveStationContext);
}
