// providers/pointerLock.tsx
'use client';

import React, {
  createContext, useCallback, useContext, useEffect,
  useMemo, useRef, useState
} from 'react';
import type { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js';

type PublicAPI = {
  isLocked: boolean;
  lock: (opts?: { unadjustedMovement?: boolean }) => void;
  unlock: () => void;
};
type InternalAPI = { register: (controls: PointerLockControls | null) => void };

const PointerLockPublicCtx = createContext<PublicAPI | null>(null);
const PointerLockInternalCtx = createContext<InternalAPI | null>(null);

export function PointerLockProvider({ children }: { children: React.ReactNode }) {
  const controlsRef = useRef<PointerLockControls | null>(null);
  const [isLocked, setLocked] = useState(false);

  // Feature detection for Pointer Lock
  const canPLRef = useRef(false);
  useEffect(() => {
    if (typeof document !== 'undefined' && document.body) {
      // requestPointerLock is undefined on iOS Safari
      canPLRef.current = typeof (document.body as HTMLElement & { requestPointerLock?: () => void }).requestPointerLock === 'function';
    }
  }, []);

  // Stable handlers for add/removeEventListener
  const onLockRef = useRef<() => void>(() => setLocked(true));
  const onUnlockRef = useRef<() => void>(() => setLocked(false));
  useEffect(() => {
    onLockRef.current = () => setLocked(true);
    onUnlockRef.current = () => setLocked(false);
  }, []);

  const lock = useCallback((opts?: { unadjustedMovement?: boolean }) => {
    const c = controlsRef.current;
    if (c && canPLRef.current) {
      c.lock(opts?.unadjustedMovement ?? false);
    } else {
      // Mobile/touch fallback: enter play mode without Pointer Lock
      setLocked(true);
    }
  }, []);

  const unlock = useCallback(() => {
    const c = controlsRef.current;
    if (c && canPLRef.current) c.unlock();
    else setLocked(false);
  }, []);

  const register = useCallback((controls: PointerLockControls | null) => {
    if (controlsRef.current) {
      controlsRef.current.removeEventListener('lock', onLockRef.current);
      controlsRef.current.removeEventListener('unlock', onUnlockRef.current);
    }
    controlsRef.current = controls ?? null;
    if (controls) {
      controls.addEventListener('lock', onLockRef.current);
      controls.addEventListener('unlock', onUnlockRef.current);
    }
  }, []);

  const pub = useMemo<PublicAPI>(() => ({ isLocked, lock, unlock }), [isLocked, lock, unlock]);
  const internal = useMemo<InternalAPI>(() => ({ register }), [register]);

  return (
    <PointerLockInternalCtx.Provider value={internal}>
      <PointerLockPublicCtx.Provider value={pub}>{children}</PointerLockPublicCtx.Provider>
    </PointerLockInternalCtx.Provider>
  );
}

export function usePointerLock(): PublicAPI {
  const ctx = useContext(PointerLockPublicCtx);
  if (!ctx) throw new Error('usePointerLock must be used within PointerLockProvider');
  return ctx;
}
export function usePointerLockRegistration(): InternalAPI {
  const ctx = useContext(PointerLockInternalCtx);
  if (!ctx) throw new Error('usePointerLockRegistration must be used within PointerLockProvider');
  return ctx;
}
