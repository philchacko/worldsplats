'use client';

import { useMemo } from 'react';
import React from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

export default function Floor({ url = '/colliders/floor.glb', visible = false }: { url?: string; visible?: boolean }) {
  const scene = useMemo(() => new THREE.Group(), []);
  // Visuals only – physics created in RapierProvider
  new GLTFLoader().load(url, (gltf) => {
    const root = gltf.scene;
    scene.add(root);
  });
  return <primitive object={scene} visible={visible} />;
}
