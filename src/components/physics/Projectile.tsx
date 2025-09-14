'use client';

import { RigidBody, type RapierRigidBody } from '@react-three/rapier';
import { useGLTF } from '@react-three/drei';
import React, { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { ObjectDef } from '@/data/presets';

type CommonProps = {
  def: ObjectDef;
  initialPosition: THREE.Vector3;
  initialVelocity: THREE.Vector3;
};

function PrimitiveProjectile({ def, initialPosition, initialVelocity }: { def: ObjectDef & { kind: 'primitive' }, initialPosition: THREE.Vector3, initialVelocity: THREE.Vector3 }) {
  const body = useRef<RapierRigidBody>(null);

  useEffect(() => {
    body.current?.setTranslation(initialPosition, true);
    body.current?.setLinvel(initialVelocity, true);
  }, [initialPosition, initialVelocity]);

  const geom = useMemo(() => {
    switch (def.shape) {
      case 'sphere': return new THREE.SphereGeometry(0.5, 16, 16);
      case 'box': return new THREE.BoxGeometry(1, 1, 1);
      case 'icosahedron': return new THREE.IcosahedronGeometry(0.5, 0);
    }
  }, [def.shape]);

  const s = def.scale ?? 1;
  const collider = def.collider ?? 'ball';
  const mass = def.mass ?? 1;

  return (
    <RigidBody ref={body} colliders={collider} mass={mass} linearDamping={0.05} angularDamping={0.05}>
      <mesh geometry={geom} castShadow receiveShadow scale={s}>
        <meshStandardMaterial metalness={0.1} roughness={0.7} />
      </mesh>
    </RigidBody>
  );
}

function GltfProjectile({ def, initialPosition, initialVelocity }: { def: ObjectDef & { kind: 'gltf' }, initialPosition: THREE.Vector3, initialVelocity: THREE.Vector3 }) {
  const body = useRef<RapierRigidBody>(null);
  const gltf = useGLTF(def.url);
  
  useEffect(() => {
    body.current?.setTranslation(initialPosition, true);
    body.current?.setLinvel(initialVelocity, true);
  }, [initialPosition, initialVelocity]);

  const scene = useMemo(() => gltf.scene.clone(true), [gltf.scene]);
  const s = def.scale ?? 1;
  const mass = def.mass ?? 2;

  return (
    <RigidBody ref={body} colliders="hull" mass={mass} linearDamping={0.05} angularDamping={0.05}>
      <primitive object={scene} scale={s} />
    </RigidBody>
  );
}

export function Projectile({ def, initialPosition, initialVelocity }: CommonProps) {
  if (def.kind === 'primitive') {
    return <PrimitiveProjectile def={def} initialPosition={initialPosition} initialVelocity={initialVelocity} />;
  }

  return <GltfProjectile def={def} initialPosition={initialPosition} initialVelocity={initialVelocity} />;
}

// optional: prefetch small GLBs you use often
useGLTF.preload('https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/master/2.0/Duck/glTF-Binary/Duck.glb');
