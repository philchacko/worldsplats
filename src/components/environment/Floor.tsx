'use client';

import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

/**
 * Visual-only collider mesh (for debugging). Physics colliders are built in RapierProvider.
 * Not rendered in production (visible={false} or omitted from scene).
 */
export default function Floor({ url, visible = false }: { url?: string; visible?: boolean }) {
  const group = useMemo(() => new THREE.Group(), []);

  useEffect(() => {
    if (!url) return;
    let disposed = false;
    const loader = new GLTFLoader();
    loader.load(url, (gltf) => {
      if (disposed) return;
      group.add(gltf.scene);
    });
    return () => {
      disposed = true;
      while (group.children.length > 0) {
        group.remove(group.children[0]);
      }
    };
  }, [url, group]);

  return <primitive object={group} visible={visible} />;
}
