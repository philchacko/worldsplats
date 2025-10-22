'use client';

import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js';
import { usePointerLockRegistration } from '@/providers/pointerLock';

export default function PointerLockBridge() {
  const { camera, gl } = useThree();
  const { register } = usePointerLockRegistration();

  useEffect(() => {
    const controls = new PointerLockControls(camera, gl.domElement);

    // optional tuning
    controls.pointerSpeed = 1.0;
    controls.minPolarAngle = 0;           // looking straight up/down clamp
    controls.maxPolarAngle = Math.PI;     // leave default free

    register(controls);
    return () => {
      register(null);
      controls.dispose();
    };
  }, [camera, gl, register]);

  return null;
}
