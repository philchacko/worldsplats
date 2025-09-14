'use client';

import { useEffect, useRef, useCallback } from 'react';
import { useThree } from '@react-three/fiber';
import { SparkRenderer } from '@sparkjsdev/spark';

/**
 * Adds a SparkRenderer and parents it to the camera.
 * Per docs, putting SparkRenderer under the camera improves precision across large scenes.
 */
export default function SparkLayer() {
  const { gl, camera, scene, invalidate } = useThree();
  const sparkRef = useRef<SparkRenderer | null>(null);
  // Keep a symbol on WebGLRenderer to avoid double SparkRenderer attachment
  const SPARK_TAG = '__spark_attached__' as const;
  const contextLostRef = useRef(false);

  const initializeSparkRenderer = useCallback(() => {
    try {
      // Clean up existing renderer if it exists
      if (sparkRef.current) {
        camera.remove(sparkRef.current);
        sparkRef.current = null;
      }

      // Ensure we only attach one SparkRenderer per WebGLRenderer
      if ((gl as unknown as Record<string, unknown>)[SPARK_TAG]) {
        console.log('SparkRenderer already attached to this WebGLRenderer');
        return;
      }

      // Create SparkRenderer with the existing WebGL context (conservative settings)
      const spark = new SparkRenderer({
        renderer: gl,
        // Lower splat pixel radius to reduce overdraw and memory pressure
        maxPixelRadius: 256,
        // Slightly reduce kernel width to limit very large splats
        maxStdDev: Math.sqrt(6),
        // Keep alpha threshold modest to limit long tails
        minAlpha: 1 / 255,
      });
      
      sparkRef.current = spark;
      camera.add(spark); // follows camera; improves float16 locality
      (gl as unknown as Record<string, unknown>)[SPARK_TAG] = true;
      
      // ensure camera is in the scene graph
      if (!camera.parent) scene.add(camera);
      
      console.log('SparkRenderer initialized successfully');
      // Log GL caps/extensions for diagnostics
      try {
        const webgl2 = (gl.domElement as HTMLCanvasElement).getContext('webgl2') as WebGL2RenderingContext | null;
        const webgl = webgl2 ?? ((gl.domElement as HTMLCanvasElement).getContext('webgl') as WebGLRenderingContext | null);
        const glCtx: WebGLRenderingContext | WebGL2RenderingContext | null = webgl;
        const debugInfo = glCtx ? {
          version: glCtx.getParameter(glCtx.VERSION),
          shadingLanguageVersion: glCtx.getParameter(glCtx.SHADING_LANGUAGE_VERSION),
          vendor: glCtx.getParameter(glCtx.VENDOR),
          renderer: glCtx.getParameter(glCtx.RENDERER),
          maxTextureSize: gl.capabilities.maxTextureSize,
          isWebGL2: 'bindBufferBase' in glCtx,
        } : null;
        console.log('GL diagnostics', debugInfo);
      } catch {}
      contextLostRef.current = false;
      
    } catch (error) {
      console.error('Failed to initialize SparkRenderer:', error);
    }
  }, [gl, camera, scene]);

  useEffect(() => {
    initializeSparkRenderer();

    // Add WebGL context loss handlers
    const handleContextLost = (event: Event) => {
      console.warn('WebGL context lost, preventing default behavior');
      contextLostRef.current = true;
      event.preventDefault();
    };

    const handleContextRestored = () => {
      console.log('WebGL context restored, reinitializing...');
      // Small delay to ensure context is fully restored
      setTimeout(() => {
        initializeSparkRenderer();
        invalidate(); // Force a re-render
        // Dispatch a custom event to notify other components
        window.dispatchEvent(new CustomEvent('webgl-context-restored'));
      }, 100);
    };

    gl.domElement.addEventListener('webglcontextlost', handleContextLost);
    gl.domElement.addEventListener('webglcontextrestored', handleContextRestored);

    return () => {
      gl.domElement.removeEventListener('webglcontextlost', handleContextLost);
      gl.domElement.removeEventListener('webglcontextrestored', handleContextRestored);
      
      if (sparkRef.current) {
        camera.remove(sparkRef.current);
        sparkRef.current = null;
      }
      // Clear the tag so a new SparkRenderer can be attached after dispose
      delete (gl as unknown as Record<string, unknown>)[SPARK_TAG];
    };
  }, [gl, camera, scene, initializeSparkRenderer, invalidate]);

  return null;
}
