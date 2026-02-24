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

    // Create dynamic capsule body (same shape as player)
    const bodyDesc = rapier
      .RigidBodyDesc.dynamic()
      .setTranslation(spawnX, spawnY, spawnZ)
      .lockRotations()
      .setLinearDamping(4.0)
      .setCcdEnabled(true);
    const body = world.createRigidBody(bodyDesc);

    const colDesc = rapier
      .ColliderDesc.capsule(0.55, 0.33)
      .setFriction(0.9)
      .setRestitution(0.0);
    world.createCollider(colDesc, body);
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
    );

    // Apply horizontal velocity, keep vertical from physics (gravity)
    const cur = bodyRef.current.linvel();
    bodyRef.current.setLinvel(
      { x: result.velocityX, y: cur.y, z: result.velocityZ },
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
