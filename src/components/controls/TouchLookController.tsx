'use client';
import { useEffect, useMemo, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { usePointerLock } from '@/providers/pointerLock';

export default function TouchLookController({
  enabled = true,
  sensitivity = 0.18,
  maxPitch = 89,
}: { enabled?: boolean; sensitivity?: number; maxPitch?: number; }) {
  const { camera, gl } = useThree();
  const { isLocked } = usePointerLock();
  const active = useRef(false);
  const last = useRef<{x:number;y:number}|null>(null);
  const yawPitch = useMemo(() => ({ yaw: 0, pitch: 0 }), []);

  useEffect(() => {
    // derive initial yaw/pitch from camera
    const fwd = new THREE.Vector3(); camera.getWorldDirection(fwd);
    yawPitch.yaw = Math.atan2(fwd.x, fwd.z);
    yawPitch.pitch = Math.asin(THREE.MathUtils.clamp(fwd.y, -1, 1));
  }, [camera, yawPitch]);

  useEffect(() => {
    if (!enabled) return;
    const el = gl.domElement;

    const onTouchStart = (e: TouchEvent) => {
      if (!isLocked) return;
      const t = e.touches[0]; if (!t) return;
      active.current = true;
      last.current = { x: t.clientX, y: t.clientY };
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!isLocked || !active.current) return;
      const t = e.touches[0]; if (!t || !last.current) return;
      const dx = t.clientX - last.current.x;
      const dy = t.clientY - last.current.y;
      last.current = { x: t.clientX, y: t.clientY };

      // update yaw/pitch
      const S = (sensitivity * Math.PI) / 180;
      yawPitch.yaw   -= dx * S;
      yawPitch.pitch -= dy * S;
      const max = (maxPitch * Math.PI) / 180;
      yawPitch.pitch = THREE.MathUtils.clamp(yawPitch.pitch, -max, max);

      // apply to camera
      const c = Math.cos(yawPitch.pitch), s = Math.sin(yawPitch.pitch);
      const dir = new THREE.Vector3(
        Math.sin(yawPitch.yaw) * c,
        s,
        Math.cos(yawPitch.yaw) * c
      );
      const pos = camera.position.clone();
      camera.lookAt(pos.clone().add(dir));
    };

    const onTouchEnd = () => { active.current = false; last.current = null; };

    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: true });
    el.addEventListener('touchend', onTouchEnd);
    el.addEventListener('touchcancel', onTouchEnd);
    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
      el.removeEventListener('touchcancel', onTouchEnd);
    };
  }, [gl, isLocked, enabled, sensitivity, maxPitch, yawPitch, camera]);

  return null;
}
