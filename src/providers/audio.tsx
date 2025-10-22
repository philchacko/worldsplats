// providers/audio.tsx
'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AUDIO_CONFIG } from '@/config/audio';

type AudioAPI = {
  /** true if we have an AudioContext */
  ready: boolean;
  /** Must be called in a user gesture (Click-to-Play). Safe to call multiple times. */
  init: () => Promise<void>;
  muted: boolean;
  setMuted: (m: boolean) => void;

  /** Set/replace the looping background music for the app (null = stop). Safe to call anytime. */
  setMusic: (url: string | null, opts?: { fadeMs?: number; loop?: boolean }) => Promise<void>;
  /** Stop background music (with an optional quick fade). */
  stop: (fadeMs?: number) => void;

  isLoading: boolean;
  currentUrl: string | null;
};

const AudioCtx = createContext<AudioAPI | null>(null);
const DEFAULT_VOL = AUDIO_CONFIG?.MUSIC_VOLUME ?? 0.15;

export function AudioProvider({ children }: { children: React.ReactNode }) {
  // Core nodes
  const ctxRef = useRef<AudioContext | null>(null);
  const masterGainRef = useRef<GainNode | null>(null);

  // Current music chain
  const musicSrcRef = useRef<AudioBufferSourceNode | null>(null);
  const musicGainRef = useRef<GainNode | null>(null);

  // State
  const [muted, setMutedState] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [currentUrl, setCurrentUrl] = useState<string | null>(null);

  // Support calling setMusic() before init()
  const wantedUrlRef = useRef<string | null>(null);

  // Cancel/ignore stale async decodes
  const requestIdRef = useRef(0);

  // Buffer cache
  const cacheRef = useRef(new Map<string, AudioBuffer>());

  const ready = !!ctxRef.current;

  const ensureNodes = useCallback(async () => {
    if (ctxRef.current) {
      if (ctxRef.current.state === 'suspended') await ctxRef.current.resume();
      return;
    }

    const AC = (window as typeof window & { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).AudioContext ||
               (window as typeof window & { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    const ac: AudioContext = new AC();

    const master = ac.createGain();
    master.gain.setValueAtTime(muted ? 0 : 1, ac.currentTime);
    master.connect(ac.destination);

    ctxRef.current = ac;
    masterGainRef.current = master;

    // If there was a queued music URL set before init(), apply it now
    if (wantedUrlRef.current) {
      // fire and forget (no await)
      _switchTo(wantedUrlRef.current).catch(() => {});
    }
  }, [muted]);

  const init = useCallback(async () => {
    await ensureNodes();
  }, [ensureNodes]);

  const setMuted = useCallback((m: boolean) => {
    setMutedState(m);
    const ac = ctxRef.current;
    const master = masterGainRef.current;
    if (ac && master) {
      const now = ac.currentTime;
      master.gain.cancelScheduledValues(now);
      master.gain.linearRampToValueAtTime(m ? 0 : 1, now + 0.05);
    }
  }, []);

  const loadBuffer = useCallback(async (url: string) => {
    const cached = cacheRef.current.get(url);
    if (cached) return cached;
    const ac = ctxRef.current;
    if (!ac) throw new Error('Audio not initialized');
    const res = await fetch(url);
    const arr = await res.arrayBuffer();
    const buf = await ac.decodeAudioData(arr);
    cacheRef.current.set(url, buf);
    return buf;
  }, []);

  const stop = useCallback((fadeMs: number = 100) => {
    const ac = ctxRef.current;
    if (!ac) return;
    const src = musicSrcRef.current;
    const gain = musicGainRef.current;
    if (!src || !gain) return;

    const t = ac.currentTime;
    const fade = Math.max(0, fadeMs) / 1000;

    gain.gain.cancelScheduledValues(t);
    gain.gain.setValueAtTime(gain.gain.value, t);
    gain.gain.linearRampToValueAtTime(0, t + fade);

    // Slight delay before stopping to avoid clicks
    try { src.stop(t + fade + 0.01); } catch {}

    musicSrcRef.current = null;
    musicGainRef.current = null;
    setCurrentUrl(null);
  }, []);

  // Internal: switch to a new URL (atomically)
  const _switchTo = useCallback(async (url: string, opts?: { fadeMs?: number; loop?: boolean }) => {
    const ac = ctxRef.current;
    if (!ac) {
      // queue until init()
      wantedUrlRef.current = url;
      return;
    }

    const myId = ++requestIdRef.current;
    setIsLoading(true);

    let buffer: AudioBuffer | null = null;
    try {
      buffer = await loadBuffer(url);
    } catch (e) {
      if (myId !== requestIdRef.current) return; // superseded
      setIsLoading(false);
      console.error('Audio load failed:', e);
      return;
    }
    if (myId !== requestIdRef.current) return; // superseded while decoding

    // Stop any current track (short fade)
    if (musicSrcRef.current) stop(opts?.fadeMs ?? 120);

    // Build new chain: source -> musicGain -> masterGain -> destination
    const src = ac.createBufferSource();
    src.buffer = buffer!;
    src.loop = opts?.loop ?? true;

    const mg = ac.createGain();
    mg.gain.setValueAtTime(0, ac.currentTime); // fade in
    src.connect(mg);
    mg.connect(masterGainRef.current!);

    src.start();

    musicSrcRef.current = src;
    musicGainRef.current = mg;
    setCurrentUrl(url);

    // fade in to content volume (master handles mute)
    const t = ac.currentTime;
    mg.gain.linearRampToValueAtTime(DEFAULT_VOL, t + (opts?.fadeMs ?? 120) / 1000);

    setIsLoading(false);
  }, [loadBuffer, stop]);

  const setMusic = useCallback(async (url: string | null, opts?: { fadeMs?: number; loop?: boolean }) => {
    wantedUrlRef.current = url;
    if (!url) {
      stop(opts?.fadeMs ?? 120);
      return;
    }
    // If not ready yet, we just record wantedUrl; _switchTo runs after init()
    if (!ctxRef.current) return;
    await _switchTo(url, opts);
  }, [_switchTo, stop]);

  // Resume audio when tab becomes visible (iOS/Safari behavior)
  useEffect(() => {
    const onVis = () => {
      const ac = ctxRef.current;
      if (document.visibilityState === 'visible' && ac && ac.state !== 'running') {
        ac.resume().catch(() => {});
      }
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  const api = useMemo<AudioAPI>(() => ({
    ready,
    init,
    muted,
    setMuted,
    setMusic,
    stop,
    isLoading,
    currentUrl,
  }), [ready, init, muted, setMuted, setMusic, stop, isLoading, currentUrl]);

  return <AudioCtx.Provider value={api}>{children}</AudioCtx.Provider>;
}

export function useAudio(): AudioAPI {
  const ctx = useContext(AudioCtx);
  if (!ctx) throw new Error('useAudio must be used within AudioProvider');
  return ctx;
}
