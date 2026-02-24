'use client';

import React, { createContext, useCallback, useContext, useRef, useState } from 'react';
import { AgentState, DEFAULT_AGENT_CONFIG, type AgentConfig, type LidarHit } from '@/agent/types';
import type { OccupancyGrid } from '@/agent/OccupancyGrid';

/** Data written each frame by AgentController, read by AgentVisualizer. */
export type VizData = {
  agentPos: [number, number, number];
  state: AgentState;
  lidarHits: LidarHit[] | null;
  currentPath: [number, number][] | null;
  grid: OccupancyGrid;
};

type AgentAPI = {
  enabled: boolean;
  setEnabled: (v: boolean) => void;
  showViz: boolean;
  setShowViz: (v: boolean) => void;
  config: AgentConfig;
  vizDataRef: React.MutableRefObject<VizData | null>;
};

const AgentCtx = createContext<AgentAPI | null>(null);

export function AgentProvider({ children }: { children: React.ReactNode }) {
  const [enabled, setEnabled] = useState(false);
  const [showViz, setShowViz] = useState(true);
  const vizDataRef = useRef<VizData | null>(null);

  const stableSetEnabled = useCallback((v: boolean) => {
    setEnabled(v);
    if (!v) vizDataRef.current = null;
  }, []);

  const api = React.useMemo<AgentAPI>(() => ({
    enabled,
    setEnabled: stableSetEnabled,
    showViz,
    setShowViz,
    config: DEFAULT_AGENT_CONFIG,
    vizDataRef,
  }), [enabled, stableSetEnabled, showViz]);

  return <AgentCtx.Provider value={api}>{children}</AgentCtx.Provider>;
}

export function useAgent(): AgentAPI {
  const ctx = useContext(AgentCtx);
  if (!ctx) throw new Error('useAgent must be used within AgentProvider');
  return ctx;
}
