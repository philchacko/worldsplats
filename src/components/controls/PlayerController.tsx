'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { usePointerLock } from '@/providers/pointerLock';
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
  mobileInputRef?: React.MutableRefObject<{x:number;y:number}>;
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
  mobileInputRef,
}: Props) {
  const { camera } = useThree();
  const { world, rapier, playerBody } = useRapierWorld();
  const { isLocked } = usePointerLock();
  const bodyRef = useRef<RapierRigidBody | null>(playerBody);
  const key = useRef<Record<string, boolean>>({});
  const jumpRequested = useRef(false);
  const forward = useMemo(() => new THREE.Vector3(), []);
  const right = useMemo(() => new THREE.Vector3(), []);
  const localMobileVec = useRef<{x:number;y:number}>({x:0,y:0});
  const mobileVec = mobileInputRef || localMobileVec;

  // Sync to provider-owned body
  useEffect(() => {
    bodyRef.current = playerBody;
  }, [playerBody]);

  // Input
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      key.current[e.code] = true;
      if (e.code === 'KeyP') {
        const rb = bodyRef.current;
        if (rb) {
          const p = rb.translation();
          const fwd = new THREE.Vector3();
          camera.getWorldDirection(fwd).normalize();
          const yaw = Math.atan2(fwd.x, fwd.z) * 180 / Math.PI;
          const pitch = Math.asin(THREE.MathUtils.clamp(fwd.y, -1, 1)) * 180 / Math.PI;
          console.log(`[Player] pos=(${p.x.toFixed(2)}, ${p.y.toFixed(2)}, ${p.z.toFixed(2)}) yaw=${yaw.toFixed(1)} pitch=${pitch.toFixed(1)}`);
        } else {
          console.warn('[Player] body not initialized yet');
        }
      }
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
    if (!isLocked) return;  

    camera.getWorldDirection(forward);
    forward.y = 0; forward.normalize();
    right.crossVectors(forward, camera.up).normalize();

    // Keyboard input
    const z = (key.current['KeyW'] ? 1 : 0) - (key.current['KeyS'] ? 1 : 0);
    const xk = (key.current['KeyD'] ? 1 : 0) - (key.current['KeyA'] ? 1 : 0);

    // Mobile joystick input (override keyboard if non-zero)
    const xm = mobileVec.current.x;
    const zm = -mobileVec.current.y; // invert: up is negative y
    const x = Math.abs(xm) > 0.01 ? xm : xk;
    const zFinal = Math.abs(zm) > 0.01 ? zm : z;

    const dir = new THREE.Vector3();
    if (zFinal) dir.addScaledVector(forward, zFinal);
    if (x) dir.addScaledVector(right, x);
    if (dir.lengthSq() > 0) dir.normalize();

    const speed = (key.current['ShiftLeft'] || key.current['ShiftRight']) ? sprintSpeed : moveSpeed;
    const cur = rb.linvel();
    const target = { x: dir.x * speed, y: cur.y, z: dir.z * speed };
    if (dir.lengthSq() > 0 && !Number.isFinite(target.x + target.y + target.z)) {
      console.warn('[Player] non-finite velocity target', target);
    }

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

  return null;
}
