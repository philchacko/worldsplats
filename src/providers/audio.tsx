'use client';

import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';

type AudioAPI = {
  audioContext: AudioContext | null;
  init: () => Promise<AudioContext>;   // must be called from a user gesture
  muted: boolean;
  setMuted: (m: boolean) => void;
};

const AudioCtx = createContext<AudioAPI | null>(null);

export function AudioProvider({ children }: { children: React.ReactNode }) {
  const ctxRef = useRef<AudioContext | null>(null);
  const [muted, setMuted] = useState(false);

  const init = useCallback(async () => {
    if (ctxRef.current) return ctxRef.current;
    const AC = (window as typeof window & { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).AudioContext || 
               (window as typeof window & { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    const ac: AudioContext = new AC();
    // You can pre-create a master gain for global mute if you want
    ctxRef.current = ac;
    return ac;
  }, []);

  const api = useMemo<AudioAPI>(() => ({
    audioContext: ctxRef.current,
    init,
    muted,
    setMuted
  }), [init, muted]);

  return <AudioCtx.Provider value={api}>{children}</AudioCtx.Provider>;
}

export function useAudio(): AudioAPI {
  const ctx = useContext(AudioCtx);
  if (!ctx) throw new Error('useAudio must be used within AudioProvider');
  return ctx;
}
