'use client';

import { useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useRapierWorld } from '@/physics';
import { useAgent } from '@/providers/agent';
import { AgentState } from '@/agent/types';
import { LidarScanner } from '@/agent/LidarScanner';
import { OccupancyGrid } from '@/agent/OccupancyGrid';

/** Perpendicular sinusoidal drift while moving — gives a weaving, curious feel. */
const DRIFT_AMPLITUDE = 0.6;
const DRIFT_FREQUENCY = 0.45;
/** A secondary, slower drift layered on top for asymmetry. */
const DRIFT2_AMPLITUDE = 0.3;
const DRIFT2_FREQUENCY = 0.17;

/** Max distance (XZ) the agent is allowed to stray from the player. */
const MAX_RANGE = 12;

/** How often to auto-trigger a deep scan (seconds). */
const DEEP_SCAN_INTERVAL = 7;

/** How often to auto-trigger a Gemini scene description (seconds). */
const SCENE_DESCRIBE_INTERVAL = 15;
/** Delay after enabling before first scene description (seconds). */
const SCENE_DESCRIBE_INITIAL_DELAY = 4;

/** How often to search for a new exploration target (seconds). */
const EXPLORE_SEARCH_INTERVAL = 3;
/** How far to search for frontier cells (meters). */
const EXPLORE_SEARCH_DIST = 8;
/** Movement speed multiplier when exploring (relative to config.moveSpeed). */
const EXPLORE_SPEED_FACTOR = 0.4;
/** Slow heading rotation when idle (radians/sec) — "looking around". */
const IDLE_ROTATE_SPEED = 0.5;

/**
 * Drives the Curator companion. Moves toward a commanded target
 * (set by the player pressing F) with sinusoidal perpendicular
 * drift for a curious, organic feel. When idle, autonomously
 * explores frontier cells to expand the mapped area.
 * Scans with limited-FOV LiDAR aligned to its heading.
 *
 * A range leash keeps the agent within MAX_RANGE of the player.
 */
export default function AgentController({ worldName }: { worldName?: string }) {
  const { world, rapier, playerBody } = useRapierWorld();
  const { enabled, config, vizDataRef, commandTargetRef, clearCommand, gridRef, triggerDeepScan, triggerSceneDescription, lastSplashRef, sceneDescriptionRef } = useAgent();

  const posRef = useRef(new THREE.Vector3());
  const scannerRef = useRef<LidarScanner | null>(null);
  const scanTimerRef = useRef(0);
  const deepScanTimerRef = useRef(0);
  const deepScanInFlightRef = useRef(false);
  const stateRef = useRef<AgentState>(AgentState.IDLE);
  const initializedRef = useRef(false);

  // Heading (radians, world space: 0 = +Z, PI/2 = +X)
  const headingRef = useRef(0);

  // Drift clock — accumulates time while moving for the sine oscillation.
  const driftClockRef = useRef(0);

  // Autonomous exploration
  const exploreTargetRef = useRef<[number, number, number] | null>(null);
  const exploreTimerRef = useRef(0);

  // Scene description (Gemini vision)
  const sceneDescribeTimerRef = useRef(0);
  const sceneDescribeInFlightRef = useRef(false);
  const worldNameRef = useRef('');

  // Keep world name in sync for Gemini calls
  useEffect(() => {
    worldNameRef.current = worldName ?? '';
  }, [worldName]);

  // Initialize/reset when enabled state changes or world switches.
  // NOTE: `world` and `rapier` come from useRapierWorld() — they are the *Rapier*
  // physics engine instances, NOT the WorldDef. The Rapier world persists across
  // world switches (only colliders are swapped), so it would NOT trigger a re-init
  // on its own. We include `worldName` to ensure this effect re-runs when the
  // user navigates to a different world, flushing stale scanner data, grid,
  // scene descriptions, and splash labels from the previous world.
  useEffect(() => {
    if (!enabled || !world || !rapier) {
      scannerRef.current = null;
      gridRef.current = null;
      vizDataRef.current = null;
      initializedRef.current = false;
      stateRef.current = AgentState.IDLE;
      deepScanTimerRef.current = 0;
      deepScanInFlightRef.current = false;
      driftClockRef.current = 0;
      exploreTargetRef.current = null;
      exploreTimerRef.current = 0;
      return;
    }

    // Spawn at player position
    let spawnX = 0, spawnY = 1.4, spawnZ = 0;
    if (playerBody) {
      const p = playerBody.translation();
      spawnX = p.x;
      spawnY = p.y;
      spawnZ = p.z;
    }

    posRef.current.set(spawnX, spawnY, spawnZ);
    scannerRef.current = new LidarScanner(config);

    // Center grid on spawn — shared via provider's gridRef
    const halfW = (config.gridWidth * config.cellSize) / 2;
    const halfH = (config.gridHeight * config.cellSize) / 2;
    gridRef.current = new OccupancyGrid(config, spawnX - halfW, spawnZ - halfH);

    scanTimerRef.current = config.scanInterval; // trigger immediate first scan
    deepScanTimerRef.current = 0;
    sceneDescribeTimerRef.current = SCENE_DESCRIBE_INTERVAL - SCENE_DESCRIBE_INITIAL_DELAY; // fires ~4s after enable
    sceneDescribeInFlightRef.current = false;
    stateRef.current = AgentState.IDLE;
    initializedRef.current = true;

    // Clear stale data from previous world
    lastSplashRef.current = null;
    sceneDescriptionRef.current = '';

    console.log(`[AgentController] initialized for world: ${worldName ?? 'unknown'}`);

    return () => {
      scannerRef.current = null;
      gridRef.current = null;
      initializedRef.current = false;
    };
  }, [enabled, world, rapier, playerBody, config, vizDataRef, gridRef, worldName]);

  // 'V' key press → manual scene description
  useEffect(() => {
    if (!enabled) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'v' || e.key === 'V') {
        if (sceneDescribeInFlightRef.current) return;
        sceneDescribeInFlightRef.current = true;
        sceneDescribeTimerRef.current = 0;
        console.log('[AgentController] manual scene description (V key)');
        triggerSceneDescription(worldNameRef.current).catch((err) => {
          console.warn('[AgentController] manual scene description failed:', err);
        }).finally(() => {
          sceneDescribeInFlightRef.current = false;
        });
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [enabled, triggerSceneDescription]);

  useFrame((_, delta) => {
    if (!enabled || !initializedRef.current || !rapier || !world) return;
    const scanner = scannerRef.current;
    const grid = gridRef.current;
    if (!scanner || !grid) return;

    const pos = posRef.current;

    // ── Range leash — cancel command/exploration if agent is too far from the player ──
    if (playerBody) {
      const pp = playerBody.translation();
      const dx = pos.x - pp.x;
      const dz = pos.z - pp.z;
      if (Math.sqrt(dx * dx + dz * dz) > MAX_RANGE) {
        if (commandTargetRef.current) clearCommand();
        exploreTargetRef.current = null;
        stateRef.current = AgentState.IDLE;
      }
    }

    // ── Determine active target ──
    const cmd = commandTargetRef.current;
    let activeTarget: [number, number, number] | null = null;
    let isCommand = false;

    if (cmd) {
      activeTarget = cmd;
      isCommand = true;
      exploreTargetRef.current = null; // F-key command overrides exploration
    } else if (exploreTargetRef.current) {
      activeTarget = exploreTargetRef.current;
    }

    // ── Movement toward active target ──
    if (activeTarget) {
      const dx = activeTarget[0] - pos.x;
      const dz = activeTarget[2] - pos.z;
      const dist = Math.sqrt(dx * dx + dz * dz);

      const threshold = isCommand ? config.arrivalThreshold : config.arrivalThreshold * 2;
      const speed = isCommand ? config.moveSpeed : config.moveSpeed * EXPLORE_SPEED_FACTOR;

      if (dist < threshold) {
        if (isCommand) clearCommand();
        else exploreTargetRef.current = null;
        stateRef.current = AgentState.IDLE;
      } else {
        stateRef.current = isCommand ? AgentState.MOVING : AgentState.EXPLORING;
        const step = Math.min(speed * delta, dist);

        // Update heading to face target
        headingRef.current = Math.atan2(dx, dz);

        // Main heading direction
        const headX = dx / dist;
        const headZ = dz / dist;

        // Perpendicular direction for drift
        const perpX = -headZ;
        const perpZ = headX;

        // Accumulate drift clock
        driftClockRef.current += delta;
        const t = driftClockRef.current;

        // Two-layer sinusoidal drift scaled by remaining distance (less drift near target)
        const distFactor = Math.min(1, dist / 3);
        const drift =
          Math.sin(t * DRIFT_FREQUENCY * Math.PI * 2) * DRIFT_AMPLITUDE +
          Math.sin(t * DRIFT2_FREQUENCY * Math.PI * 2) * DRIFT2_AMPLITUDE;

        pos.x += headX * step + perpX * drift * delta * distFactor;
        pos.z += headZ * step + perpZ * drift * delta * distFactor;
      }
    } else {
      // IDLE — slowly rotate heading to "look around"
      headingRef.current += delta * IDLE_ROTATE_SPEED;

      // Search for a new exploration target periodically
      exploreTimerRef.current += delta;
      if (exploreTimerRef.current >= EXPLORE_SEARCH_INTERVAL) {
        exploreTimerRef.current = 0;
        const target = grid.findExplorationTarget(pos.x, pos.z, EXPLORE_SEARCH_DIST);
        if (target && playerBody) {
          // Ensure target is within range of the player
          const pp = playerBody.translation();
          const dx = target[0] - pp.x;
          const dz = target[1] - pp.z;
          if (Math.sqrt(dx * dx + dz * dz) < MAX_RANGE - 2) {
            exploreTargetRef.current = [target[0], pos.y, target[1]];
          }
        }
      }

      if (stateRef.current !== AgentState.IDLE) {
        stateRef.current = AgentState.IDLE;
      }
    }

    // ── Periodic LiDAR scanning (FOV-limited, aligned to heading) ──
    scanTimerRef.current += delta;
    if (scanTimerRef.current >= config.scanInterval) {
      scanTimerRef.current = 0;
      const hits = scanner.scan(rapier, world, pos.x, pos.y, pos.z, headingRef.current);
      const agentFloorY = scanner.agentFloorY;

      for (const hit of hits) {
        grid.markRay(pos.x, pos.z, agentFloorY, hit.worldX, hit.worldZ, hit.worldY, hit.hit);
      }

      // Write viz data with fresh scan
      vizDataRef.current = {
        agentPos: [pos.x, pos.y, pos.z],
        heading: headingRef.current,
        state: stateRef.current,
        lidarHits: hits,
        currentPath: null,
        grid,
      };
    } else if (vizDataRef.current) {
      // Update position every frame even without a scan
      vizDataRef.current.agentPos = [pos.x, pos.y, pos.z];
      vizDataRef.current.heading = headingRef.current;
      vizDataRef.current.state = stateRef.current;
    }

    // ── Auto deep scan (periodic SAM-3 segmentation) ──
    deepScanTimerRef.current += delta;
    if (
      deepScanTimerRef.current >= DEEP_SCAN_INTERVAL &&
      !deepScanInFlightRef.current &&
      grid.stats().totalKnown > 50 // wait for some LiDAR data first
    ) {
      deepScanTimerRef.current = 0;
      deepScanInFlightRef.current = true;
      triggerDeepScan().catch((err) => {
        console.warn('[AgentController] auto deep scan failed:', err);
      }).finally(() => {
        deepScanInFlightRef.current = false;
      });
    }

    // ── Auto scene description (periodic Gemini vision) ──
    sceneDescribeTimerRef.current += delta;
    if (
      sceneDescribeTimerRef.current >= SCENE_DESCRIBE_INTERVAL &&
      !sceneDescribeInFlightRef.current
    ) {
      sceneDescribeTimerRef.current = 0;
      sceneDescribeInFlightRef.current = true;
      triggerSceneDescription(worldNameRef.current).catch((err) => {
        console.warn('[AgentController] auto scene description failed:', err);
      }).finally(() => {
        sceneDescribeInFlightRef.current = false;
      });
    }
  });

  return null;
}
