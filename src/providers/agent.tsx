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
  /** World-space target [x, y, z] the agent should move toward. Null = no command. */
  commandTargetRef: React.MutableRefObject<[number, number, number] | null>;
  /** Send the agent to a world-space target. Auto-enables the agent on first call. */
  issueCommand: (target: [number, number, number]) => void;
  /** Clear the current command (agent stops). */
  clearCommand: () => void;
};

const AgentCtx = createContext<AgentAPI | null>(null);

export function AgentProvider({ children }: { children: React.ReactNode }) {
  const [enabled, setEnabled] = useState(false);
  const [showViz, setShowViz] = useState(true);
  const vizDataRef = useRef<VizData | null>(null);
  const commandTargetRef = useRef<[number, number, number] | null>(null);
  // Ref mirror of enabled to avoid stale closures in issueCommand
  const enabledRef = useRef(false);
  enabledRef.current = enabled;

  const stableSetEnabled = useCallback((v: boolean) => {
    setEnabled(v);
    if (!v) {
      vizDataRef.current = null;
      commandTargetRef.current = null;
    }
  }, []);

  const issueCommand = useCallback((target: [number, number, number]) => {
    commandTargetRef.current = target;
    if (!enabledRef.current) {
      setEnabled(true);
    }
  }, []);

  const clearCommand = useCallback(() => {
    commandTargetRef.current = null;
  }, []);

  const api = React.useMemo<AgentAPI>(() => ({
    enabled,
    setEnabled: stableSetEnabled,
    showViz,
    setShowViz,
    config: DEFAULT_AGENT_CONFIG,
    vizDataRef,
    commandTargetRef,
    issueCommand,
    clearCommand,
  }), [enabled, stableSetEnabled, showViz, issueCommand, clearCommand]);

  return <AgentCtx.Provider value={api}>{children}</AgentCtx.Provider>;
}

export function useAgent(): AgentAPI {
  const ctx = useContext(AgentCtx);
  if (!ctx) throw new Error('useAgent must be used within AgentProvider');
  return ctx;
}
