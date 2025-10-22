'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AUDIO_CONFIG, type MusicTrack } from '@/config/audio';

type AudioAPI = {
  audioContext: AudioContext | null;
  init: () => Promise<AudioContext>;
  muted: boolean;
  setMuted: (m: boolean) => void;
  playMusic: (track: MusicTrack) => Promise<void>;
  stopMusic: () => void;
  isLoading: boolean;
  currentTrack: MusicTrack | null;
};

const AudioCtx = createContext<AudioAPI | null>(null);

export function AudioProvider({ children }: { children: React.ReactNode }) {
  const ctxRef = useRef<AudioContext | null>(null);
  const [muted, setMuted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [currentTrack, setCurrentTrack] = useState<MusicTrack | null>(null);
  const [initialized, setInitialized] = useState(false);
  const autoplayAttempted = useRef(false);

  // Audio buffer cache
  const buffersRef = useRef<Map<string, AudioBuffer>>(new Map());

  // Current music playback
  const musicSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const musicGainRef = useRef<GainNode | null>(null);

  const init = useCallback(async () => {
    if (ctxRef.current) {
      // Resume context if suspended (mobile Safari)
      if (ctxRef.current.state === 'suspended') {
        await ctxRef.current.resume();
      }
      return ctxRef.current;
    }

    const AC = (window as typeof window & { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).AudioContext ||
               (window as typeof window & { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    const ac: AudioContext = new AC();
    ctxRef.current = ac;
    setInitialized(true);
    console.log('✓ Audio context initialized');
    return ac;
  }, []);

  // Load an audio file and cache it
  const loadAudioBuffer = useCallback(async (url: string): Promise<AudioBuffer> => {
    const cached = buffersRef.current.get(url);
    if (cached) return cached;

    const ctx = ctxRef.current;
    if (!ctx) throw new Error('Audio context not initialized');

    console.log(`Loading audio: ${url}`);
    const response = await fetch(url);
    const arrayBuffer = await response.arrayBuffer();
    const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
    buffersRef.current.set(url, audioBuffer);
    console.log(`✓ Audio loaded: ${url}`);
    return audioBuffer;
  }, []);

  // Stop current music
  const stopMusic = useCallback(() => {
    if (musicSourceRef.current) {
      try {
        musicSourceRef.current.stop();
      } catch {
        // Already stopped
      }
      musicSourceRef.current = null;
    }
    setCurrentTrack(null);
  }, []);

  // Play background music (looping)
  const playMusic = useCallback(async (track: MusicTrack) => {
    const ctx = ctxRef.current;
    if (!ctx) {
      console.warn('Audio context not initialized. Call init() first.');
      return;
    }

    // Stop current music if playing
    stopMusic();

    setIsLoading(true);
    try {
      const url = AUDIO_CONFIG.MUSIC_FILES[track];
      const buffer = await loadAudioBuffer(url);

      // Create audio nodes
      const source = ctx.createBufferSource();
      const gain = ctx.createGain();

      source.buffer = buffer;
      source.loop = true;
      source.connect(gain);
      gain.connect(ctx.destination);

      // Set initial volume
      gain.gain.value = muted ? 0 : AUDIO_CONFIG.MUSIC_VOLUME;

      // Start playback
      source.start(0);

      // Store references
      musicSourceRef.current = source;
      musicGainRef.current = gain;
      setCurrentTrack(track);

      console.log(`✓ Playing music: ${track}`);
    } catch (error) {
      console.error('Failed to play music:', error);
    } finally {
      setIsLoading(false);
    }
  }, [loadAudioBuffer, stopMusic, muted]);

  // Update gain when muted state changes
  useEffect(() => {
    if (musicGainRef.current) {
      musicGainRef.current.gain.value = muted ? 0 : AUDIO_CONFIG.MUSIC_VOLUME;
    }
  }, [muted]);

  // Attempt auto-play on mount (will be blocked by browser without user gesture)
  useEffect(() => {
    if (!autoplayAttempted.current) {
      autoplayAttempted.current = true;
      // Try to initialize and play music on load
      init().then(() => {
        console.log('Audio auto-initialized on page load');
      }).catch((e) => {
        console.log('Auto-play blocked (expected behavior):', e);
      });
    }
  }, [init]);

  // Auto-play background music when audio context is initialized
  useEffect(() => {
    if (initialized && !currentTrack) {
      // Start playing default music
      playMusic('SUNLIT_GROVE').catch((e) => {
        console.error('Failed to auto-play music:', e);
      });
    }
  }, [initialized, currentTrack, playMusic]);

  // Resume audio context on visibility change (mobile Safari)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        const ac = ctxRef.current;
        if (ac && ac.state !== 'running') {
          ac.resume().catch(() => {});
        }
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

  const api = useMemo<AudioAPI>(() => ({
    audioContext: ctxRef.current,
    init,
    muted,
    setMuted,
    playMusic,
    stopMusic,
    isLoading,
    currentTrack,
  }), [init, muted, playMusic, stopMusic, isLoading, currentTrack]);

  return <AudioCtx.Provider value={api}>{children}</AudioCtx.Provider>;
}

export function useAudio(): AudioAPI {
  const ctx = useContext(AudioCtx);
  if (!ctx) throw new Error('useAudio must be used within AudioProvider');
  return ctx;
}
