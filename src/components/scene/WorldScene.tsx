'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import Floor from '@/components/environment/Floor';
import * as THREE from 'three';

import SparkLayer from '@/components/spark/SparkLayer';
import SplatWorld from '@/components/spark/SplatWorld';
import PlayerController from '@/components/controls/PlayerController';
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
  onLoadingChange?: (isLoading: boolean, error?: string) => void;
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
  projectileSpeed = 18,
  onLoadingChange }: Props) {
  const { camera } = useThree();
  const [spawned, setSpawned] = useState<Spawned[]>([]);
  const speedRef = useRef(projectileSpeed);

  useEffect(() => {
    speedRef.current = projectileSpeed;
  }, [projectileSpeed]);

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

  const handleLoadingChange = useCallback((loading: boolean, error?: string) => {
    onLoadingChange?.(loading, error);
  }, [onLoadingChange]);

  // expose to parent
  useEffect(() => {
    shootSink.current = { shoot, clear };
    return () => { shootSink.current = null; };
  }, [shoot, clear, shootSink]);

  // Small ambient move to show motion
  useFrame(() => {
    // could do any per-frame logic here
  });

  return (
    <>
      {/* FPS-style player controls */}
      <PlayerController />

      {/* Environment collision mesh (visuals only, physics in provider) */}
      <Floor visible={false} />

      {/* Spark renderer + the current Splat world */}
      <SparkLayer />
      <SplatWorld 
        key={world.url} 
        url={world.url} 
        position={world.position} 
        quaternion={world.quaternion} 
        scale={world.scale}
        onLoadingChange={handleLoadingChange}
      />

      {/* Usual lighting for mesh-based objects */}
      <ambientLight intensity={0.5} />
      <directionalLight position={[5, 10, 5]} intensity={0.8} />

      {/* TODO: Re-add projectiles using provider-backed physics */}

      {/* Optional helpers */}
      {/* <gridHelper args={[100, 100]} /> */}
      {/* <axesHelper scale={2} /> */}
    </>
  );
}

export default function WorldScene({
  world,
  object,
  shootSink, 
  projectileSpeed,
  onLoadingChange }: Props) {
  const handleLoadingChange = useCallback((loading: boolean, error?: string) => {
    onLoadingChange?.(loading, error);
  }, [onLoadingChange]);

  return (
    <>
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
      dpr={[1, Math.min(1.5, typeof window !== 'undefined' ? (window.devicePixelRatio || 1) : 1)]}
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
        shootSink={shootSink} 
        projectileSpeed={projectileSpeed}
        onLoadingChange={handleLoadingChange}
      />
    </Canvas>
    </>
  );
}
