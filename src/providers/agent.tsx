'use client';

import React, { createContext, useCallback, useContext, useRef, useState } from 'react';
import * as THREE from 'three';
import { AgentState, DEFAULT_AGENT_CONFIG, type AgentConfig, type LidarHit, type SegmentationResult } from '@/agent/types';
import type { OccupancyGrid } from '@/agent/OccupancyGrid';
import { segmentScene, DEFAULT_CONCEPTS } from '@/agent/segmentation';
import { splashSegmentation } from '@/agent/semanticSplash';
import { captureSnapshot } from '@/agent/captureSnapshot';

/** Data written each frame by AgentController, read by AgentVisualizer. */
export type VizData = {
  agentPos: [number, number, number];
  heading: number;
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
  config: AgentConfig;
  vizDataRef: React.MutableRefObject<VizData | null>;
  /** World-space target [x, y, z] the agent should move toward. Null = no command. */
  commandTargetRef: React.MutableRefObject<[number, number, number] | null>;
  /** R3F renderer context, written from inside the Canvas. */
  r3fRef: React.MutableRefObject<R3FContext | null>;
  /** The occupancy grid, shared between AgentController and splash projector. */
  gridRef: React.MutableRefObject<OccupancyGrid | null>;
  /** Send the agent to a world-space target. */
  issueCommand: (target: [number, number, number]) => void;
  /** Clear the current command (agent stops). */
  clearCommand: () => void;
  /** Run SAM-3 segmentation + splash projection onto the occupancy grid. */
  triggerDeepScan: (concepts?: string[]) => Promise<SegmentationResult>;
  /** Stats from the most recent splash projection. */
  lastSplashRef: React.MutableRefObject<SplashStats | null>;
  /** Increments each time a deep scan starts — audio/FX can watch for changes. */
  deepScanSignalRef: React.MutableRefObject<number>;
  /** Semantic label name at the reticle center, null if none. Updated per-frame inside Canvas. */
  hoveredLabelRef: React.MutableRefObject<string | null>;
  /** Narration speaking state — written by CuratorNarration, read by audio/HUD. */
  narrationStateRef: React.MutableRefObject<{ speaking: boolean; lastCommentTime: number }>;
  /** Latest scene description from Gemini vision model. */
  sceneDescriptionRef: React.MutableRefObject<string>;
  /** Capture a screenshot and send it to Gemini for a rich scene description. */
  triggerSceneDescription: (worldName?: string) => Promise<string>;
};

const AgentCtx = createContext<AgentAPI | null>(null);

export function AgentProvider({ children }: { children: React.ReactNode }) {
  const [enabled, setEnabled] = useState(false);
  const vizDataRef = useRef<VizData | null>(null);
  const commandTargetRef = useRef<[number, number, number] | null>(null);
  const r3fRef = useRef<R3FContext | null>(null);
  const gridRef = useRef<OccupancyGrid | null>(null);
  const lastSplashRef = useRef<SplashStats | null>(null);
  const deepScanSignalRef = useRef(0);
  const hoveredLabelRef = useRef<string | null>(null);
  const narrationStateRef = useRef<{ speaking: boolean; lastCommentTime: number }>({ speaking: false, lastCommentTime: 0 });
  const sceneDescriptionRef = useRef<string>('');

  const stableSetEnabled = useCallback((v: boolean) => {
    setEnabled(v);
    if (!v) {
      vizDataRef.current = null;
      commandTargetRef.current = null;
      gridRef.current = null;
      lastSplashRef.current = null;
      hoveredLabelRef.current = null;
      sceneDescriptionRef.current = '';
    }
  }, []);

  const issueCommand = useCallback((target: [number, number, number]) => {
    commandTargetRef.current = target;
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

  const triggerSceneDescription = useCallback(async (worldName?: string) => {
    const ctx = r3fRef.current;
    if (!ctx) throw new Error('R3F context not available — is the Canvas mounted?');

    const imageBase64 = captureSnapshot(ctx.gl, ctx.scene, ctx.camera);
    console.log('[SceneDescription] captured screenshot, sending to Gemini...');

    const res = await fetch('/api/describe-scene', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageBase64, worldName }),
    });

    if (!res.ok) {
      console.warn('[SceneDescription] API error:', res.status);
      return '';
    }

    const { description } = (await res.json()) as { description: string };
    sceneDescriptionRef.current = description;
    console.log(`[SceneDescription] "${description}"`);
    return description;
  }, []);

  const api = React.useMemo<AgentAPI>(() => ({
    enabled,
    setEnabled: stableSetEnabled,
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
    hoveredLabelRef,
    narrationStateRef,
    sceneDescriptionRef,
    triggerSceneDescription,
  }), [enabled, stableSetEnabled, issueCommand, clearCommand, triggerDeepScan, triggerSceneDescription]);

  return <AgentCtx.Provider value={api}>{children}</AgentCtx.Provider>;
}

export function useAgent(): AgentAPI {
  const ctx = useContext(AgentCtx);
  if (!ctx) throw new Error('useAgent must be used within AgentProvider');
  return ctx;
}
