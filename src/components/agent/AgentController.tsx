'use client';

import { useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type * as RAPIER from '@dimforge/rapier3d-compat';
import { useRapierWorld } from '@/physics';
import { useAgent } from '@/providers/agent';
import { AgentStateMachine } from '@/agent/AgentStateMachine';

/**
 * R3F component that drives the autonomous exploration agent.
 * Creates its own Rapier rigid body and runs the state machine per frame.
 * Returns null (invisible) — visualization is handled by AgentVisualizer.
 */
export default function AgentController() {
  const { world, rapier, playerBody } = useRapierWorld();
  const { enabled, config, vizDataRef } = useAgent();
  const bodyRef = useRef<RAPIER.RigidBody | null>(null);
  const smRef = useRef<AgentStateMachine | null>(null);

  // Create/destroy agent rigid body based on enabled state
  useEffect(() => {
    if (!enabled || !world || !rapier) {
      // Clean up agent body
      if (bodyRef.current && world) {
        try { world.removeRigidBody(bodyRef.current); } catch { /* already removed */ }
        bodyRef.current = null;
      }
      smRef.current = null;
      vizDataRef.current = null;
      return;
    }

    // Spawn agent at the player's current position
    let spawnX = 0, spawnY = 1.4, spawnZ = 0;
    if (playerBody) {
      const p = playerBody.translation();
      spawnX = p.x;
      spawnY = p.y;
      spawnZ = p.z;
    }

    // Create kinematic body — "ghost" mode: the agent passes through all
    // geometry so pathfinding can be tested independently of physics collisions.
    // Raycasts still detect the environment colliders for mapping.
    const bodyDesc = rapier
      .RigidBodyDesc.kinematicVelocityBased()
      .setTranslation(spawnX, spawnY, spawnZ);
    const body = world.createRigidBody(bodyDesc);
    // No collider — ghost agent doesn't need one.
    bodyRef.current = body;

    // Initialize state machine
    const sm = new AgentStateMachine(config, spawnX, spawnZ);
    sm.start();
    smRef.current = sm;

    return () => {
      if (bodyRef.current && world) {
        try { world.removeRigidBody(bodyRef.current); } catch { /* ok */ }
        bodyRef.current = null;
      }
      smRef.current = null;
    };
  }, [enabled, world, rapier, playerBody, config, vizDataRef]);

  // Per-frame: run state machine and apply velocity
  useFrame((_, delta) => {
    if (!enabled || !bodyRef.current || !smRef.current || !rapier || !world) return;

    const pos = bodyRef.current.translation();
    const result = smRef.current.tick(
      delta, rapier, world,
      pos.x, pos.y, pos.z,
      bodyRef.current, // exclude agent's own body from LiDAR raycasts
    );

    // Apply horizontal velocity only — kinematic ghost floats at constant height
    bodyRef.current.setLinvel(
      { x: result.velocityX, y: 0, z: result.velocityZ },
      true,
    );

    // Write viz data for AgentVisualizer (ref-based, no React re-render)
    vizDataRef.current = {
      agentPos: [pos.x, pos.y, pos.z],
      state: result.state,
      lidarHits: result.lidarHits,
      currentPath: result.currentPath,
      grid: smRef.current.grid,
    };
  });

  return null;
}
