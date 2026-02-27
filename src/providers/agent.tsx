'use client';

import React, { createContext, useCallback, useContext, useRef, useState } from 'react';
import * as THREE from 'three';
import { AgentState, DEFAULT_AGENT_CONFIG, type AgentConfig, type LidarHit, type SegmentationResult } from '@/agent/types';
import type { OccupancyGrid } from '@/agent/OccupancyGrid';
import { segmentScene, DEFAULT_CONCEPTS } from '@/agent/segmentation';
import { splashSegmentation } from '@/agent/semanticSplash';

/** Data written each frame by AgentController, read by AgentVisualizer. */
export type VizData = {
  agentPos: [number, number, number];
  state: AgentState;
  lidarHits: LidarHit[] | null;
  currentPath: [number, number][] | null;
  grid: OccupancyGrid;
};

/** R3F renderer context — set by a bridge component inside the Canvas. */
export type R3FContext = {
  gl: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.Camera;
};

/** Stats from the last splash projection. */
export type SplashStats = {
  totalTagged: number;
  perLabel: Record<string, number>;
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
  /** R3F renderer context, written from inside the Canvas. */
  r3fRef: React.MutableRefObject<R3FContext | null>;
  /** The occupancy grid, shared between AgentController and splash projector. */
  gridRef: React.MutableRefObject<OccupancyGrid | null>;
  /** Send the agent to a world-space target. Auto-enables the agent on first call. */
  issueCommand: (target: [number, number, number]) => void;
  /** Clear the current command (agent stops). */
  clearCommand: () => void;
  /** Run SAM-3 segmentation + splash projection onto the occupancy grid. */
  triggerDeepScan: (concepts?: string[]) => Promise<SegmentationResult>;
  /** Stats from the most recent splash projection. */
  lastSplashRef: React.MutableRefObject<SplashStats | null>;
  /** Increments each time a deep scan starts — audio/FX can watch for changes. */
  deepScanSignalRef: React.MutableRefObject<number>;
};

const AgentCtx = createContext<AgentAPI | null>(null);

export function AgentProvider({ children }: { children: React.ReactNode }) {
  const [enabled, setEnabled] = useState(false);
  const [showViz, setShowViz] = useState(true);
  const vizDataRef = useRef<VizData | null>(null);
  const commandTargetRef = useRef<[number, number, number] | null>(null);
  const r3fRef = useRef<R3FContext | null>(null);
  const gridRef = useRef<OccupancyGrid | null>(null);
  const lastSplashRef = useRef<SplashStats | null>(null);
  const deepScanSignalRef = useRef(0);
  // Ref mirror of enabled to avoid stale closures in issueCommand
  const enabledRef = useRef(false);
  enabledRef.current = enabled;

  const stableSetEnabled = useCallback((v: boolean) => {
    setEnabled(v);
    if (!v) {
      vizDataRef.current = null;
      commandTargetRef.current = null;
      gridRef.current = null;
      lastSplashRef.current = null;
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

  const triggerDeepScan = useCallback(async (concepts?: string[]) => {
    const ctx = r3fRef.current;
    if (!ctx) throw new Error('R3F context not available — is the Canvas mounted?');
    deepScanSignalRef.current++;
    const result = await segmentScene(ctx.gl, ctx.scene, ctx.camera, concepts ?? DEFAULT_CONCEPTS);
    console.log(
      `[DeepScan] ${result.masks.length} masks:`,
      result.masks.map((m) => `${m.label} (${(m.score * 100).toFixed(0)}%)`),
    );

    // Splash: project 2D masks onto the 3D occupancy grid
    const grid = gridRef.current;
    if (grid && result.masks.length > 0) {
      const stats = splashSegmentation(result, grid);
      lastSplashRef.current = stats;
      console.log(`[DeepScan] splashed ${stats.totalTagged} cells onto grid`);
    } else if (!grid) {
      console.warn('[DeepScan] no occupancy grid available — enable the agent first');
    }

    return result;
  }, []);

  const api = React.useMemo<AgentAPI>(() => ({
    enabled,
    setEnabled: stableSetEnabled,
    showViz,
    setShowViz,
    config: DEFAULT_AGENT_CONFIG,
    vizDataRef,
    commandTargetRef,
    r3fRef,
    gridRef,
    issueCommand,
    clearCommand,
    triggerDeepScan,
    lastSplashRef,
    deepScanSignalRef,
  }), [enabled, stableSetEnabled, showViz, issueCommand, clearCommand, triggerDeepScan]);

  return <AgentCtx.Provider value={api}>{children}</AgentCtx.Provider>;
}

export function useAgent(): AgentAPI {
  const ctx = useContext(AgentCtx);
  if (!ctx) throw new Error('useAgent must be used within AgentProvider');
  return ctx;
}
