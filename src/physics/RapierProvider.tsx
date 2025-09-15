'use client';

import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import * as RAPIER from '@dimforge/rapier3d-compat';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as THREE from 'three';
import { CONFIG as UNIVERSE_CONFIG } from '@/data/universeconfig'

type RapierCtx = {
  rapier: typeof RAPIER | null;
  world: RAPIER.World | null;
  playerBody: RAPIER.RigidBody | null;
};
const Ctx = createContext<RapierCtx>({ rapier: null, world: null, playerBody: null });

const FIXED_DT = 1 / 60;
const MAX_STEPS = 5;

export function RapierProvider({
  gravity = UNIVERSE_CONFIG.GRAVITY,
  children,
}: {
  gravity?: { x: number; y: number; z: number };
  children: React.ReactNode;
}) {
  const [rapierReady, setRapierReady] = useState(false);
  const worldRef = useRef<RAPIER.World | null>(null);
  const rapierRef = useRef<typeof RAPIER | null>(null);
  const accRef = useRef(0);
  const prevRef = useRef<number>(performance.now());
  const envBodyRef = useRef<RAPIER.RigidBody | null>(null);
  const envCollidersRef = useRef<RAPIER.Collider[]>([]);
  const playerBodyRef = useRef<RAPIER.RigidBody | null>(null);
  const [playerBodyState, setPlayerBodyState] = useState<RAPIER.RigidBody | null>(null);

  // init once
  useEffect(() => {
    let cancelled = false;
    (async () => {
      await RAPIER.init();
      if (cancelled) return;
      rapierRef.current = RAPIER;
      worldRef.current = new RAPIER.World(gravity);
      setRapierReady(true);
    })();
    return () => {
      cancelled = true;
      // dispose world on unmount
      if (worldRef.current) {
        worldRef.current.free();
        worldRef.current = null;
      }
    };
  }, [gravity.x, gravity.y, gravity.z]);

  // fixed-step stepping loop (piggybacks on r3f’s render loop if present)
  useEffect(() => {
    if (!rapierReady) return;
    let mounted = true;
    const loop = (t: number) => {
      if (!mounted) return;
      const world = worldRef.current;
      if (world) {
        const dt = Math.min((t - prevRef.current) / 1000, 0.1);
        prevRef.current = t;
        accRef.current += dt;
        let steps = 0;
        while (accRef.current >= FIXED_DT && steps < MAX_STEPS) {
          world.step();
          accRef.current -= FIXED_DT;
          steps++;
        }
      }
      requestAnimationFrame(loop);
    };
    prevRef.current = performance.now();
    requestAnimationFrame(loop);
    return () => { mounted = false; };
  }, [rapierReady]);

  // Load environment collision mesh and build fixed trimesh colliders
  useEffect(() => {
    if (!rapierReady) return;
    const world = worldRef.current;
    const rapier = rapierRef.current;
    if (!world || !rapier) return;
    let disposed = false;
    const loader = new GLTFLoader();
    const url = UNIVERSE_CONFIG.ENVIRONMENT.MESH;
    loader.load(url, (gltf) => {
      if (disposed) return;
      const body = world.createRigidBody(rapier.RigidBodyDesc.fixed());
      envBodyRef.current = body;
      const created: RAPIER.Collider[] = [];
      gltf.scene.updateMatrixWorld(true);
      gltf.scene.traverse((child: THREE.Object3D) => {
        // @ts-expect-error narrow at runtime
        if (!(child as THREE.Object3D).isMesh || !(child as THREE.Object3D).geometry) return;
        const mesh = child as THREE.Object3D;
        // @ts-expect-error narrow at runtime
        const geom = child.geometry;
        mesh.updateWorldMatrix(true, false);
        geom.applyMatrix4(mesh.matrixWorld);
        const posAttr = geom.getAttribute('position') as THREE.BufferAttribute | null;
        if (!posAttr) return;
        const vertices = new Float32Array(posAttr.array);
        let indices: Uint32Array;
        if (geom.index) indices = new Uint32Array((geom.index as THREE.BufferAttribute).array as ArrayLike<number>);
        else {
          const count = posAttr.count;
          indices = new Uint32Array(count);
          for (let i = 0; i < count; i++) indices[i] = i;
        }
        const colDesc = rapier
          .ColliderDesc.trimesh(vertices, indices)
          .setRestitution(UNIVERSE_CONFIG.ENVIRONMENT_RESTITUTION);
        const col = world.createCollider(colDesc, body);
        created.push(col);
      });
      envCollidersRef.current = created;
      // eslint-disable-next-line no-console
      console.log('✓ Environment collision mesh loaded');
    });
    return () => {
      disposed = true;
      const world = worldRef.current;
      if (!world) return;
      for (const c of envCollidersRef.current) world.removeCollider(c, true);
      envCollidersRef.current = [];
      if (envBodyRef.current) {
        world.removeRigidBody(envBodyRef.current);
        envBodyRef.current = null;
      }
    };
  }, [rapierReady]);

  // Create player rigid body and capsule collider
  useEffect(() => {
    if (!rapierReady) return;
    const world = worldRef.current;
    const rapier = rapierRef.current;
    if (!world || !rapier) return;
    // Remove existing if any
    if (playerBodyRef.current) {
      world.removeRigidBody(playerBodyRef.current);
      playerBodyRef.current = null;
      setPlayerBodyState(null);
    }
    const { RADIUS, HALF_HEIGHT, START, FRICTION, RESTI, LINEAR_DAMPING } = UNIVERSE_CONFIG.PLAYER;
    const bodyDesc = rapier
      .RigidBodyDesc.dynamic()
      .setTranslation(START[0], START[1], START[2])
      .lockRotations()
      .setLinearDamping(LINEAR_DAMPING)
      .setCcdEnabled(true);
    const body = world.createRigidBody(bodyDesc);
    const colDesc = rapier
      .ColliderDesc.capsule(HALF_HEIGHT, RADIUS)
      .setFriction(FRICTION)
      .setRestitution(RESTI);
    world.createCollider(colDesc, body);
    playerBodyRef.current = body;
    setPlayerBodyState(body);
    return () => {
      const w = worldRef.current;
      if (w && playerBodyRef.current) {
        w.removeRigidBody(playerBodyRef.current);
        playerBodyRef.current = null;
        setPlayerBodyState(null);
      }
    };
  }, [rapierReady]);

  const value = useMemo<RapierCtx>(
    () => ({ rapier: rapierRef.current, world: worldRef.current, playerBody: playerBodyState }),
    [rapierReady, playerBodyState]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useRapierWorld() {
  const ctx = useContext(Ctx);
  if (!ctx.world || !ctx.rapier) throw new Error('Rapier not ready yet.');
  return ctx as Required<RapierCtx>;
}
