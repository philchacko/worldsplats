'use client';

import { useEffect, useState, createContext, useContext } from 'react';
import { useThree } from '@react-three/fiber';
import type * as THREE from 'three';

// Context to share WebGL renderer outside of Canvas
type XRContextType = {
  gl: THREE.WebGLRenderer | null;
  setGl?: (gl: THREE.WebGLRenderer) => void;
};

const XRContext = createContext<XRContextType>({ gl: null });

export function XRProvider({ children }: { children: React.ReactNode }) {
  const [gl, setGl] = useState<THREE.WebGLRenderer | null>(null);
  
  return (
    <XRContext.Provider value={{ gl, setGl }}>
      {children}
    </XRContext.Provider>
  );
}

export function XRRendererCapture() {
  const { gl } = useThree();
  const { setGl } = useContext(XRContext);
  
  useEffect(() => {
    if (setGl) {
      setGl(gl);
    }
  }, [gl, setGl]);
  
  return null;
}

/**
 * XR helper that adds ghost hand meshes to the scene when XR is supported
 */
export function XRHands() {
  const { scene } = useThree();

  useEffect(() => {
    // SSR guard - only run in browser
    if (typeof window === 'undefined' || typeof navigator === 'undefined') {
      return;
    }

    let handMesh: THREE.Object3D | null = null;
    let xrHands: { makeGhostMesh: () => THREE.Object3D } | null = null;

    const hasXR = 'xr' in navigator;
    const hasXRHand = typeof (globalThis as unknown as { XRHand?: unknown }).XRHand !== 'undefined';

    // Guard: need WebXR and hand tracking capability
    if (!hasXR || !hasXRHand) {
      return;
    }

    // Dynamic import to avoid SSR issues
    const initializeXRHands = async () => {
      try {
        const { XrHands } = await import('@sparkjsdev/spark');
        
        xrHands = new XrHands();
        handMesh = xrHands.makeGhostMesh();
        // Some engines mark helper meshes as non-editable; keep if available
        try { (handMesh as unknown as { editable?: boolean }).editable = false; } catch {}
        if (handMesh) {
          scene.add(handMesh);
        }
      } catch (err) {
        console.warn('[XR] Failed to initialize XrHands', err);
      }
    };

    initializeXRHands();

    return () => {
      if (handMesh) {
        scene.remove(handMesh);
      }
    };
  }, [scene]);

  return null;
}

/**
 * VR Button component that renders a VR button when XR is supported
 */
export function VRButtonComponent({ className = '' }: { className?: string }) {
  const { gl } = useContext(XRContext);
  const [vrButton, setVRButton] = useState<HTMLElement | null>(null);
  const [isSupported, setIsSupported] = useState(false);

  useEffect(() => {
    // SSR guard - only run in browser
    if (typeof window === 'undefined' || typeof navigator === 'undefined') {
      return;
    }

    const hasXR = 'xr' in navigator;
    const hasXRHand = typeof (globalThis as unknown as { XRHand?: unknown }).XRHand !== 'undefined';

    setIsSupported(hasXR && hasXRHand);
  }, []);

  useEffect(() => {
    if (!isSupported || !gl) return;

    // Dynamic import to avoid SSR issues
    const initializeVRButton = async () => {
      try {
        const { VRButton } = await import('@sparkjsdev/spark');
        
        const button = VRButton.createButton(gl, { optionalFeatures: ['hand-tracking'] });
        if (button) {
          // Apply custom styling to the Spark VR button
          button.className = `px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded font-medium ${className}`;
          setVRButton(button);
        }
      } catch (err) {
        console.warn('[VR] Failed to initialize VRButton', err);
      }
    };

    initializeVRButton();
  }, [isSupported, gl, className]);

  if (!isSupported || !vrButton) {
    return null;
  }

  return (
    <div 
      ref={(div) => {
        if (div && vrButton && !div.contains(vrButton)) {
          div.appendChild(vrButton);
        }
      }}
    />
  );
}

/**
 * Combined XR component (for backwards compatibility)
 */
export default function XR() {
  return <XRHands />;
}


