'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { CameraControls } from '@react-three/drei';
import { Physics, CuboidCollider, RigidBody } from '@react-three/rapier';
import * as THREE from 'three';

import SparkLayer from '@/components/spark/SparkLayer';
import SplatWorld from '@/components/spark/SplatWorld';
import { Projectile } from '@/components/physics/Projectile';
import type { WorldDef, ObjectDef } from '@/data/presets';

export type ShootHandle = {
  shoot: () => void;
  clear: () => void;
};

type Props = {
  world: WorldDef;
  object: ObjectDef;
  shootSink: React.RefObject<ShootHandle | null>; // parent can call shoot/clear
  projectileSpeed?: number;
};

type Spawned = {
  id: string;
  def: ObjectDef;
  t: number;
  startPos: THREE.Vector3;
  velocity: THREE.Vector3;
};

function SceneInner({
  world,
  object,
  shootSink,
  projectileSpeed = 18 }: Props) {
  const { camera } = useThree();
  const controls = useRef<CameraControls>(null);
  const [spawned, setSpawned] = useState<Spawned[]>([]);
  const speedRef = useRef(projectileSpeed);

  useEffect(() => {
    speedRef.current = projectileSpeed;
  }, [projectileSpeed]);

  // Keyboard nudges (WASD = truck/dolly)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!controls.current) return;
      const c = controls.current;
      const step = (e.shiftKey ? 1.0 : 0.4);
      if (e.key === 'w') c.forward(step, true);
      if (e.key === 's') c.forward(-step, true);
      if (e.key === 'a') c.truck(-step, 0, true);
      if (e.key === 'd') c.truck(step, 0, true);
      if (e.key === 'q') c.dolly(-step, true);
      if (e.key === 'e') c.dolly(step, true);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const shoot = useCallback(() => {
    // Spawn from camera with initial velocity along forward
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir).normalize();
    const origin = camera.getWorldPosition(new THREE.Vector3());
    const start = origin.clone().add(dir.clone().multiplyScalar(0.8)); // just in front of camera
    const vel = dir.clone().multiplyScalar(speedRef.current);

    setSpawned((arr) => [
      ...arr,
      { id: crypto.randomUUID(), def: object, t: performance.now(), startPos: start, velocity: vel },
    ]);
  }, [camera, object]);

  const clear = useCallback(() => setSpawned([]), []);

  // expose to parent
  // useEffect(() => {
  //   shootSink.current = { shoot, clear };
  //   return () => { shootSink.current = null; };
  // }, [shoot, clear, shootSink]);

  // Small ambient move to show motion
  useFrame(() => {
    // could do any per-frame logic here
  });

  return (
    <>
      {/* DCC-style navigation */}
      <CameraControls ref={controls} makeDefault dollyToCursor={true} smoothTime={0.15} />

      {/* Spark renderer + the current Splat world */}
      <SparkLayer />
      <SplatWorld url={world.url} position={world.position} quaternion={world.quaternion} scale={world.scale} />

      {/* Usual lighting for mesh-based objects */}
      <ambientLight intensity={0.5} />
      <directionalLight position={[5, 10, 5]} intensity={0.8} />

      {/* Note: Environment removed to reduce GPU pressure while debugging context loss */}

      {/* Physics world */}
      <Physics gravity={[0, -9.81, 0]}>
        {/* A big invisible ground so things don’t fall forever */}
        <RigidBody type="fixed" colliders={false}>
          <CuboidCollider args={[200, 0.1, 200]} position={[0, -2, 0]} />
        </RigidBody>

        {/* Render all spawned projectiles */}
        {spawned.map((s) => (
          <Projectile
            key={s.id}
            def={s.def}
            initialPosition={s.startPos}
            initialVelocity={s.velocity}
          />
        ))}
      </Physics>

      {/* Optional helpers */}
      {/* <gridHelper args={[100, 100]} /> */}
      {/* <axesHelper scale={2} /> */}
    </>
  );
}

export default function WorldScene({
  world,
  object,
  shootSink, projectileSpeed }: Props) {
  return (
    <Canvas
      // Spark guidance: leave antialias off for better performance with splats
      gl={{ 
        antialias: false,
        // Avoid preserveDrawingBuffer; it increases memory pressure
        preserveDrawingBuffer: false,
        // Enable context loss recovery
        failIfMajorPerformanceCaveat: false,
        // Power preference for better compatibility
        powerPreference: "high-performance"
      }}
      dpr={[1, Math.min(1.5, window.devicePixelRatio || 1)]}
      // Disable shadows for now to reduce GPU pressure
      shadows={false}
      camera={{ fov: 60, near: 0.1, far: 1000, position: [0, 1.2, 3] }}
      // Add error boundary handling
      onCreated={(state) => {
        const gl = state.gl.getContext();
        const dbg = {
          webglVersion: gl?.getParameter?.(0x1F02 /* VERSION */),
          shadingLanguageVersion: gl?.getParameter?.(0x8B8C /* SHADING_LANGUAGE_VERSION */),
          rendererInfo: state.gl.info,
          capabilities: state.gl.capabilities,
          maxTextureSize: state.gl.capabilities.maxTextureSize,
          precision: state.gl.capabilities.precision,
          floatTextures: state.gl.capabilities.isWebGL2 || !!state.gl.extensions.get('OES_texture_float'),
        };
        console.log('Three.js Canvas created successfully', dbg);
      }}
    >
      <SceneInner
        world={world}
        object={object}
        shootSink={shootSink} projectileSpeed={projectileSpeed} />
    </Canvas>
  );
}
