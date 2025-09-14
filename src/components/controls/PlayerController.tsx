'use client';

import React, { useEffect, useMemo, useRef } from 'react';
import { PointerLockControls } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useRapierWorld, RapierRigidBody } from '@/physics';

type Props = {
  onLockChange?: (locked: boolean) => void;
  radius?: number;
  halfHeight?: number;
  eyeHeight?: number;
  moveSpeed?: number;
  sprintSpeed?: number;
  jumpSpeed?: number;
  start?: [number, number, number];
};

export default function PlayerController({
  onLockChange,
  radius = 0.33,
  halfHeight = 0.55,
  eyeHeight = 1.0,
  moveSpeed = 3.5,
  sprintSpeed = 6.0,
  jumpSpeed = 6.0,
  start = [0, 1.4, 0],
}: Props) {
  const { camera } = useThree();
  const { world, rapier, playerBody } = useRapierWorld();
  const bodyRef = useRef<RapierRigidBody | null>(playerBody);
  const key = useRef<Record<string, boolean>>({});
  const jumpRequested = useRef(false);
  const forward = useMemo(() => new THREE.Vector3(), []);
  const right = useMemo(() => new THREE.Vector3(), []);

  // Sync to provider-owned body
  useEffect(() => {
    bodyRef.current = playerBody;
  }, [playerBody]);

  // Input
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      key.current[e.code] = true;
      if (e.code === 'Space') {
        jumpRequested.current = true;
        e.preventDefault();
      }
    };
    const up = (e: KeyboardEvent) => { key.current[e.code] = false; };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);

  const isGrounded = () => {
    if (!rapier || !world) return false;
    const rb = bodyRef.current;
    if (!rb) return false;
    const p = rb.translation();
    const ray = new rapier.Ray({ x: p.x, y: p.y, z: p.z }, { x: 0, y: -1, z: 0 });
    const maxToi = halfHeight + radius + 0.15;
    const hit = world.castRayAndGetNormal(ray, maxToi, true);
    if (!hit) return false;
    const normalY = hit.normal ? hit.normal.y : 1;
    return hit.toi <= maxToi && normalY > 0.3;
  };

  useFrame(() => {
    const rb = bodyRef.current;
    if (!rb) return;

    camera.getWorldDirection(forward);
    forward.y = 0; forward.normalize();
    right.crossVectors(forward, camera.up).normalize();

    const z = (key.current['KeyW'] ? 1 : 0) - (key.current['KeyS'] ? 1 : 0);
    const x = (key.current['KeyD'] ? 1 : 0) - (key.current['KeyA'] ? 1 : 0);

    const dir = new THREE.Vector3();
    if (z) dir.addScaledVector(forward, z);
    if (x) dir.addScaledVector(right, x);
    if (dir.lengthSq() > 0) dir.normalize();

    const speed = (key.current['ShiftLeft'] || key.current['ShiftRight']) ? sprintSpeed : moveSpeed;
    const cur = rb.linvel();
    const target = { x: dir.x * speed, y: cur.y, z: dir.z * speed };

    // Jump only when grounded
    if (jumpRequested.current && isGrounded()) {
      target.y = jumpSpeed;
      jumpRequested.current = false;
    }

    rb.setLinvel(target, true);

    // Camera at eye height above feet
    const p = rb.translation();
    const feetY = p.y - (halfHeight + radius);
    camera.position.set(p.x, feetY + eyeHeight, p.z);
  });

  return (
    <PointerLockControls
      makeDefault
      onLock={() => onLockChange?.(true)}
      onUnlock={() => onLockChange?.(false)}
    />
  );
}
