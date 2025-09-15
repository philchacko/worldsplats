'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useThree } from '@react-three/fiber';
import type { SplatMesh } from '@sparkjsdev/spark';

type Props = {
  url: string;
  position?: [number, number, number];
  quaternion?: [number, number, number, number]; // x,y,z,w
  scale?: number;
  onLoadingChange?: (isLoading: boolean, error?: string) => void;
};

/**
 * Imperatively adds a SplatMesh to the scene (simplest interop).
 * You could also "extend" Spark classes to use JSX <primitive />, but this is robust & minimal.
 */
export default function SplatWorld({ url, position = [0, 0, 0], quaternion, scale = 1, onLoadingChange }: Props) {
  const { scene } = useThree();
  const meshRef = useRef<SplatMesh | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadSplatMesh = useCallback(async () => {
    // token to ignore stale async completions
    const loadToken = crypto.randomUUID();
    (loadSplatMesh as unknown as { currentToken?: string }).currentToken = loadToken;

    setLoadError(null);
    setIsLoading(true);

    // Clean up existing mesh first
    if (meshRef.current) {
      scene.remove(meshRef.current);
      try { 
        meshRef.current.dispose?.(); 
      } catch (error) {
        console.warn('Error disposing existing splat mesh:', error);
      }
      meshRef.current = null;
    }
    
    try {
      const t0 = performance.now();
      console.log(`Loading splat mesh from: ${url}`);
        
        // Check if URL is accessible (for local files)
        let abortController: AbortController | null = null;
        if (url.startsWith('/')) {
          try {
            abortController = new AbortController();
            const response = await fetch(url, { method: 'HEAD', signal: abortController.signal });
            if (!response.ok) {
              throw new Error(`Failed to load ${url}: ${response.status} ${response.statusText}`);
            }
          } catch (fetchError) {
            console.error('Failed to fetch splat file:', fetchError);
            setLoadError(`Failed to load splat file: ${url}`);
            setIsLoading(false);
            return;
          }
        }

        // If a newer call started, bail out before heavy work
        if ((loadSplatMesh as unknown as { currentToken?: string }).currentToken !== loadToken) {
          abortController?.abort();
          return;
        }

        const { SplatMesh } = await import('@sparkjsdev/spark');
        const mesh = new SplatMesh({ url });
        meshRef.current = mesh;
        const t1 = performance.now();
        // Wait for mesh to be initialized before setting transform
        try {
          await mesh.initialized;
          const t2 = performance.now();
          
          // If a newer load started or component unmounted, dispose and stop
          if ((loadSplatMesh as unknown as { currentToken?: string }).currentToken !== loadToken || !meshRef.current) {
            try { mesh.dispose?.(); } catch {}
            return;
          }
          
          console.log('Splat mesh initialized successfully', { createMs: Math.round(t1 - t0), initMs: Math.round(t2 - t1) });
          
          mesh.position.set(...position);
          if (quaternion) {
            mesh.quaternion.set(quaternion[0], quaternion[1], quaternion[2], quaternion[3]);
          }
          if (scale !== 1) {
            mesh.scale.setScalar(scale);
          }
          
          scene.add(mesh);
          setIsLoading(false);
          
        } catch (initError) {
          console.error('Failed to initialize splat mesh:', initError);
          setLoadError(`Failed to initialize splat mesh: ${initError instanceof Error ? initError.message : 'Unknown error'}`);
          setIsLoading(false);
          try { mesh.dispose?.(); } catch {}
        }
        
      } catch (error) {
        console.error('Error creating splat mesh:', error);
        setLoadError(`Error loading splat: ${error instanceof Error ? error.message : 'Unknown error'}`);
        setIsLoading(false);
      }
    }, [scene, url, position, quaternion, scale]);

  useEffect(() => {
    loadSplatMesh();

    // Listen for WebGL context restoration
    const handleContextRestored = () => {
      console.log('SplatWorld: WebGL context restored, reloading splat mesh');
      setTimeout(() => {
        loadSplatMesh();
      }, 200); // Small delay to ensure SparkRenderer is ready
    };

    window.addEventListener('webgl-context-restored', handleContextRestored);

    return () => {
      // Invalidate any in-flight load calls by bumping the token
      (loadSplatMesh as unknown as { currentToken?: string }).currentToken = crypto.randomUUID();
      window.removeEventListener('webgl-context-restored', handleContextRestored);
      if (meshRef.current) {
        scene.remove(meshRef.current);
        // Free GPU memory
        try { 
          meshRef.current.dispose?.(); 
        } catch (error) {
          console.warn('Error disposing splat mesh:', error);
        }
        meshRef.current = null;
      }
    };
  }, [loadSplatMesh, scene]);

  // Log loading state for debugging and notify parent
  useEffect(() => {
    if (loadError) {
      console.error('SplatWorld load error:', loadError);
    } else if (!isLoading) {
      console.log('SplatWorld loaded successfully');
    }
    
    // Notify parent component about loading state changes
    onLoadingChange?.(isLoading, loadError || undefined);
  }, [loadError, isLoading, onLoadingChange]);

  return null;
}
