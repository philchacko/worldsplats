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
const DEEP_SCAN_INTERVAL = 20;

/**
 * Drives the Curator companion. Moves toward a commanded target
 * (set by the player pressing F) with sinusoidal perpendicular
 * drift for a curious, organic feel. Scans with LiDAR to build
 * the occupancy grid as it explores.
 *
 * A range leash keeps the agent within MAX_RANGE of the player —
 * if it exceeds the limit, the command is cleared and it idles.
 */
export default function AgentController() {
  const { world, rapier, playerBody } = useRapierWorld();
  const { enabled, config, vizDataRef, commandTargetRef, clearCommand, gridRef, triggerDeepScan } = useAgent();

  const posRef = useRef(new THREE.Vector3());
  const scannerRef = useRef<LidarScanner | null>(null);
  const scanTimerRef = useRef(0);
  const deepScanTimerRef = useRef(0);
  const deepScanInFlightRef = useRef(false);
  const stateRef = useRef<AgentState>(AgentState.IDLE);
  const initializedRef = useRef(false);

  // Drift clock — accumulates time while moving for the sine oscillation.
  const driftClockRef = useRef(0);

  // Initialize/reset when enabled state changes
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
    stateRef.current = AgentState.IDLE;
    initializedRef.current = true;

    return () => {
      scannerRef.current = null;
      gridRef.current = null;
      initializedRef.current = false;
    };
  }, [enabled, world, rapier, playerBody, config, vizDataRef, gridRef]);

  useFrame((_, delta) => {
    if (!enabled || !initializedRef.current || !rapier || !world) return;
    const scanner = scannerRef.current;
    const grid = gridRef.current;
    if (!scanner || !grid) return;

    const pos = posRef.current;
    const target = commandTargetRef.current;

    // ── Range leash — cancel command if agent is too far from the player ──
    if (playerBody && target) {
      const pp = playerBody.translation();
      const dx = pos.x - pp.x;
      const dz = pos.z - pp.z;
      if (Math.sqrt(dx * dx + dz * dz) > MAX_RANGE) {
        clearCommand();
      }
    }

    // ── Movement toward command target ──
    const cmd = commandTargetRef.current; // re-read after possible leash clear
    if (cmd) {
      const dx = cmd[0] - pos.x;
      const dz = cmd[2] - pos.z;
      const dist = Math.sqrt(dx * dx + dz * dz);

      if (dist < config.arrivalThreshold) {
        clearCommand();
        stateRef.current = AgentState.IDLE;
      } else {
        stateRef.current = AgentState.MOVING;
        const step = Math.min(config.moveSpeed * delta, dist);

        // Main heading
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
    } else if (stateRef.current === AgentState.MOVING) {
      stateRef.current = AgentState.IDLE;
    }

    // ── Periodic LiDAR scanning ──
    scanTimerRef.current += delta;
    if (scanTimerRef.current >= config.scanInterval) {
      scanTimerRef.current = 0;
      const hits = scanner.scan(rapier, world, pos.x, pos.y, pos.z);
      const agentFloorY = scanner.agentFloorY;

      for (const hit of hits) {
        grid.markRay(pos.x, pos.z, agentFloorY, hit.worldX, hit.worldZ, hit.worldY, hit.hit);
      }

      // Write viz data with fresh scan
      vizDataRef.current = {
        agentPos: [pos.x, pos.y, pos.z],
        state: stateRef.current,
        lidarHits: hits,
        currentPath: null,
        grid,
      };
    } else if (vizDataRef.current) {
      // Update position every frame even without a scan
      vizDataRef.current.agentPos = [pos.x, pos.y, pos.z];
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
  });

  return null;
}
