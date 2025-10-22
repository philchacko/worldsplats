// components/controls/TouchLookController.tsx
'use client';
import { useEffect, useMemo, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { usePointerLock } from '@/providers/pointerLock';

export default function TouchLookController({
  enabled = true,
  sensitivity = 0.18, // degrees per pixel
  maxPitch = 89,
}: { enabled?: boolean; sensitivity?: number; maxPitch?: number }) {
  const { camera, gl } = useThree();
  const { isLocked } = usePointerLock();

  // Only enable on touch devices
  const isTouch = useMemo(
    () => typeof window !== 'undefined' && matchMedia('(pointer: coarse)').matches,
    []
  );

  const active = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);
  const yawPitch = useRef({ yaw: 0, pitch: 0 });

  // Keep canvas from scrolling when in play mode on touch
  useEffect(() => {
    if (!isTouch) return;
    const el = gl.domElement as HTMLCanvasElement;
    el.style.touchAction = isLocked ? 'none' : 'auto';
    (el.style as CSSStyleDeclaration & { webkitUserSelect?: string }).webkitUserSelect = 'none';
    return () => { el.style.touchAction = 'auto'; };
  }, [gl, isLocked, isTouch]);

  // Initialize yaw/pitch from current camera direction whenever we (re)enter play
  useEffect(() => {
    if (!isTouch) return;
    const fwd = new THREE.Vector3(); camera.getWorldDirection(fwd);
    yawPitch.current.yaw = Math.atan2(fwd.x, fwd.z);
    yawPitch.current.pitch = Math.asin(THREE.MathUtils.clamp(fwd.y, -1, 1));
  }, [camera, isTouch, isLocked]);

  useEffect(() => {
    if (!enabled || !isTouch) return;
    const el = gl.domElement as HTMLCanvasElement;

    const onStart = (e: TouchEvent) => {
      if (!isLocked) return;
      const t = e.touches[0]; if (!t) return;
      active.current = true;
      last.current = { x: t.clientX, y: t.clientY };
      e.preventDefault();
    };
    const onMove = (e: TouchEvent) => {
      if (!isLocked || !active.current) return;
      const t = e.touches[0]; if (!t || !last.current) return;
      const dx = t.clientX - last.current.x;
      const dy = t.clientY - last.current.y;
      last.current = { x: t.clientX, y: t.clientY };

      const S = (sensitivity * Math.PI) / 180; // to radians
      const yp = yawPitch.current;
      yp.yaw   -= dx * S; // typical FPS invert X
      yp.pitch -= dy * S;

      const max = (maxPitch * Math.PI) / 180;
      yp.pitch = THREE.MathUtils.clamp(yp.pitch, -max, max);

      // apply to camera
      const c = Math.cos(yp.pitch), s = Math.sin(yp.pitch);
      const dir = new THREE.Vector3(Math.sin(yp.yaw) * c, s, Math.cos(yp.yaw) * c);
      const pos = camera.position.clone();
      camera.lookAt(pos.clone().add(dir));

      e.preventDefault();
    };
    const onEnd = () => { active.current = false; last.current = null; };

    // Non-passive so preventDefault works on iOS
    el.addEventListener('touchstart', onStart, { passive: false });
    el.addEventListener('touchmove',  onMove,  { passive: false });
    el.addEventListener('touchend',   onEnd,   { passive: true  });
    el.addEventListener('touchcancel',onEnd,   { passive: true  });
    return () => {
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchmove',  onMove);
      el.removeEventListener('touchend',   onEnd);
      el.removeEventListener('touchcancel',onEnd);
    };
  }, [gl, camera, isLocked, enabled, isTouch, sensitivity, maxPitch]);

  return null;
}
