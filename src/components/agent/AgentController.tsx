'use client';

import { useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useRapierWorld } from '@/physics';
import { useAgent } from '@/providers/agent';
import { AgentState } from '@/agent/types';
import { LidarScanner } from '@/agent/LidarScanner';
import { OccupancyGrid } from '@/agent/OccupancyGrid';

/**
 * Drives the agent companion. Moves directly toward a commanded target
 * (set by the player pressing F) while scanning the environment with
 * LiDAR to build an occupancy grid. No autonomous pathfinding — just
 * straight-line movement + SLAM.
 */
export default function AgentController() {
  const { world, rapier, playerBody } = useRapierWorld();
  const { enabled, config, vizDataRef, commandTargetRef, clearCommand } = useAgent();

  const posRef = useRef(new THREE.Vector3());
  const scannerRef = useRef<LidarScanner | null>(null);
  const gridRef = useRef<OccupancyGrid | null>(null);
  const scanTimerRef = useRef(0);
  const stateRef = useRef<AgentState>(AgentState.IDLE);
  const initializedRef = useRef(false);

  // Initialize/reset when enabled state changes
  useEffect(() => {
    if (!enabled || !world || !rapier) {
      scannerRef.current = null;
      gridRef.current = null;
      vizDataRef.current = null;
      initializedRef.current = false;
      stateRef.current = AgentState.IDLE;
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

    // Center grid on spawn
    const halfW = (config.gridWidth * config.cellSize) / 2;
    const halfH = (config.gridHeight * config.cellSize) / 2;
    gridRef.current = new OccupancyGrid(config, spawnX - halfW, spawnZ - halfH);

    scanTimerRef.current = config.scanInterval; // trigger immediate first scan
    stateRef.current = AgentState.IDLE;
    initializedRef.current = true;

    return () => {
      scannerRef.current = null;
      gridRef.current = null;
      initializedRef.current = false;
    };
  }, [enabled, world, rapier, playerBody, config, vizDataRef]);

  useFrame((_, delta) => {
    if (!enabled || !initializedRef.current || !rapier || !world) return;
    const scanner = scannerRef.current;
    const grid = gridRef.current;
    if (!scanner || !grid) return;

    const pos = posRef.current;
    const target = commandTargetRef.current;

    // ── Movement toward command target ──
    if (target) {
      const dx = target[0] - pos.x;
      const dz = target[2] - pos.z;
      const dist = Math.sqrt(dx * dx + dz * dz);

      if (dist < config.arrivalThreshold) {
        // Arrived
        clearCommand();
        stateRef.current = AgentState.IDLE;
      } else {
        stateRef.current = AgentState.MOVING;
        const step = Math.min(config.moveSpeed * delta, dist); // don't overshoot
        pos.x += (dx / dist) * step;
        pos.z += (dz / dist) * step;
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
  });

  return null;
}
