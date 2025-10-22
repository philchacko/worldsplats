'use client';

import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import type { PointerLockControls } from 'three/examples/jsm/controls/PointerLockControls.js';

type PublicAPI = {
  isLocked: boolean;
  lock: (opts?: { unadjustedMovement?: boolean }) => void;
  unlock: () => void;
};

type InternalAPI = {
  /** Called by the Canvas bridge to register/unregister actual controls */
  register: (controls: PointerLockControls | null) => void;
};

const PointerLockPublicCtx = createContext<PublicAPI | null>(null);
const PointerLockInternalCtx = createContext<InternalAPI | null>(null);

export function PointerLockProvider({ children }: { children: React.ReactNode }) {
  const controlsRef = useRef<PointerLockControls | null>(null);
  const [isLocked, setLocked] = useState(false);

  const lock = useCallback((opts?: { unadjustedMovement?: boolean }) => {
    controlsRef.current?.lock(opts?.unadjustedMovement ?? false);
  }, []);
  const unlock = useCallback(() => controlsRef.current?.unlock(), []);

  const register = useCallback((controls: PointerLockControls | null) => {
    // detach old
    if (controlsRef.current) {
      controlsRef.current.removeEventListener('lock', onLock);
      controlsRef.current.removeEventListener('unlock', onUnlock);
    }
    controlsRef.current = controls ?? null;
    if (controls) {
      controls.addEventListener('lock', onLock);
      controls.addEventListener('unlock', onUnlock);
    }
    function onLock()  { setLocked(true); }
    function onUnlock(){ setLocked(false); }
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

/** Used only inside Canvas to supply the actual controls instance */
export function usePointerLockRegistration(): InternalAPI {
  const ctx = useContext(PointerLockInternalCtx);
  if (!ctx) throw new Error('usePointerLockRegistration must be used within PointerLockProvider');
  return ctx;
}
