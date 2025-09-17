'use client';

import { useEffect, useState, createContext, useContext, useRef } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { ButtonProminence, ButtonSize, ButtonStyle, buttonStyleClass } from '@/components/hud/Button';
// Dynamic import for Spark.js to avoid SSR issues
// import { VRButton } from '@sparkjsdev/spark';

// Context to share WebGL renderer and XR state outside of Canvas
type XRContextType = {
  gl: THREE.WebGLRenderer | null;
  hasXR: boolean | null;
  hasXRHand: boolean | null;
  vrButton: HTMLElement | null;
};

const XRContext = createContext<XRContextType>({
  gl: null,
  hasXR: null,
  hasXRHand: null,
  vrButton: null
});

// Provider that goes OUTSIDE the Canvas
export function XRProvider({ children }: { children: React.ReactNode }) {
  const [gl, setGl] = useState<THREE.WebGLRenderer | null>(null);
  const [hasXR, setHasXR] = useState<boolean | null>(null);
  const [hasXRHand, setHasXRHand] = useState<boolean | null>(null);
  const [vrButton, setVRButton] = useState<HTMLElement | null>(null);

  // Detect XR support once on mount (browser only)
  useEffect(() => {
    if (typeof window === 'undefined' || typeof navigator === 'undefined') return;

    const xr = 'xr' in navigator;
    const hand = typeof (globalThis as unknown as { XRHand?: unknown }).XRHand !== 'undefined';
    setHasXR(xr);
    setHasXRHand(hand);
  }, []);

  // Create VR button when renderer is available
  useEffect(() => {
    if (typeof window === 'undefined' || !hasXR) return;

    // Poll for renderer since it's set asynchronously
    const pollForRenderer = () => {
      const renderer = (window as unknown as { _xrRenderer?: THREE.WebGLRenderer })?._xrRenderer;
      if (!renderer) {
        // Try again in 100ms
        setTimeout(pollForRenderer, 100);
        return;
      }

      const initVRButton = async () => {
        try {
          const { VRButton } = await import('@sparkjsdev/spark');
          const button = VRButton.createButton(renderer, {
            optionalFeatures: ['hand-tracking']
          });
          setVRButton(button);
          setGl(renderer);
        } catch (err) {
          console.warn('[XR] Failed to create VR button:', err);
        }
      };

      initVRButton();
    };

    pollForRenderer();
  }, [hasXR]);

  return (
    <XRContext.Provider value={{ gl, hasXR, hasXRHand, vrButton }}>
      {children}
    </XRContext.Provider>
  );
}

/**
 * Component that captures the renderer from inside the Canvas
 * This must be placed inside the Canvas component
 */
export function XRRendererCapture() {
  const { gl } = useThree();

  useEffect(() => {
    // We need to update the context, but context is read-only
    // So we'll use a different approach - store in a ref that can be accessed
    if (typeof window !== 'undefined') {
      (window as unknown as { _xrRenderer?: THREE.WebGLRenderer })._xrRenderer = gl;
    }
  }, [gl]);

  return null;
}


/**
 * XR Setup component that manages the local frame and hands
 * This should be placed inside the Canvas
 */
export function XRSetup() {
  const { scene, camera, gl } = useThree();
  const localFrameRef = useRef<THREE.Group | null>(null);
  const xrHandsRef = useRef<{ makeGhostMesh: () => THREE.Object3D; update: (params: { xr: THREE.WebXRManager; xrFrame: XRFrame }) => void } | null>(null);
  const lastCameraPosRef = useRef(new THREE.Vector3(0, 0, 0));
  const cameraParentRef = useRef<THREE.Object3D | null>(null);
  const { hasXR, hasXRHand } = useContext(XRContext);

  // Create local frame for XR positioning
  useEffect(() => {
    if (!hasXR) return;

    const localFrame = new THREE.Group();
    localFrameRef.current = localFrame;
    scene.add(localFrame);

    // Store camera's original parent so we can restore it
    cameraParentRef.current = camera.parent;

    return () => {
      // Restore camera to original parent when cleaning up
      if (cameraParentRef.current && camera.parent === localFrame) {
        cameraParentRef.current.add(camera);
      }
      scene.remove(localFrame);
    };
  }, [scene, camera, hasXR]);

  // Setup XR hands when supported
  useEffect(() => {
    if (!hasXR || !hasXRHand || !localFrameRef.current) return;

    const initializeXRHands = async () => {
      if (typeof window === 'undefined') return;

      try {
        const { XrHands } = await import('@sparkjsdev/spark');

        const xrHands = new XrHands();
        xrHandsRef.current = xrHands;

        const handMesh = xrHands.makeGhostMesh();
        try {
          (handMesh as THREE.Object3D & { editable?: boolean }).editable = false;
        } catch {
          // Ignore if editable property doesn't exist
        }

        if (handMesh && localFrameRef.current) {
          localFrameRef.current.add(handMesh);
        }
      } catch (err) {
        console.warn('[XR] Failed to initialize XrHands:', err);
      }
    };

    initializeXRHands();
  }, [hasXR, hasXRHand]);

  // Animation loop for XR positioning and hand tracking
  useFrame((_state, _delta, xrFrame) => {
    const localFrame = localFrameRef.current;
    const xrHands = xrHandsRef.current;

    if (!localFrame || !hasXR) return;

    // Only do XR positioning when actually in XR mode
    const isInXR = gl.xr?.isPresenting;
    if (isInXR) {
      // Move camera into local frame only when in XR
      if (camera.parent !== localFrame) {
        localFrame.add(camera);
      }

      // Handle local frame positioning (from sample code)
      // This is a hack to make a "local" frame work reliably across
      // Quest 3 and Vision Pro. Any big discontinuity in the camera
      // results in a reverse shift of the local frame to compensate.
      if (lastCameraPosRef.current.distanceTo(camera.position) > 0.5) {
        localFrame.position.copy(camera.position).multiplyScalar(-1);
      }
      lastCameraPosRef.current.copy(camera.position);
    } else {
      // When not in XR, restore camera to original parent so PlayerController can work
      if (camera.parent === localFrame && cameraParentRef.current) {
        cameraParentRef.current.add(camera);
      }
    }

    // Update XR hands if available
    if (xrHands && gl.xr && xrFrame) {
      try {
        xrHands.update({ xr: gl.xr, xrFrame });
      } catch {
        // Silently handle XR update errors
      }
    }
  });

  return null;
}

/**
 * VR Button component that renders a VR button when XR is supported
 */
export function VRButtonComponent({ className = '', enabled = true }: { className?: string; enabled?: boolean }) {
  const { gl, hasXR, hasXRHand, vrButton } = useContext(XRContext);
  // Track if XR is supported for potential future use
  // const isSupported = hasXR === true;

  // Style the VR button when it's available
  useEffect(() => {
    if (!vrButton) return;

    // Apply our styling to the Spark VR button
    const base = buttonStyleClass(
      ButtonStyle.Rounded,
      ButtonProminence.Primary,
      ButtonSize.Large,
      false
    );
    vrButton.className = `${base} ${className}`;
  }, [vrButton, className]);

  // Show debug button if VR button isn't ready yet
  if (!vrButton) {
    const debugStatus = !enabled ? 'Disabled'
      : hasXR === false ? 'Not Supported'
      : hasXR === null ? 'Checking...'
      : !gl ? 'No Renderer'
      : 'Loading...';

    return (
      <button
        onClick={() => console.log('[VR Debug] Button clicked', { enabled, isSupported: hasXR, hasGL: !!gl, hasXR, hasXRHand })}
        disabled={!enabled}
        className={`${className} px-4 py-2 text-white rounded font-bold ${
          hasXR === false ? 'bg-gray-500' : 'bg-blue-500'
        }`}
        style={{ minHeight: '40px', minWidth: '120px' }}
      >
        Enter VR ({debugStatus})
      </button>
    );
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
 * Use this inside the Canvas
 */
export default function XR() {
  return <XRSetup />;
}

export function useXRSupport() {
  const { hasXR, hasXRHand } = useContext(XRContext);
  return { hasXR, hasXRHand };
}


