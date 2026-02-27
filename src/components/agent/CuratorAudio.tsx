'use client';

import { useEffect, useRef } from 'react';
import { useAudio } from '@/providers/audio';
import { useAgent } from '@/providers/agent';
import { AgentState } from '@/agent/types';

// Sound asset paths
const SFX_IDLE = '/characters/idling.mp3';
const SFX_MOVING = '/characters/moving.mp3';
const SFX_DEEP_SCAN = '/characters/deepscan.mp3';

/** Volume relative to the master gain (0–1). */
const CURATOR_VOLUME = 1.0;
/** Crossfade duration in seconds when switching between idle ↔ moving. */
const CROSSFADE_SEC = 0.4;
/** Poll interval (ms) for checking agent state changes. */
const POLL_MS = 100;

/**
 * Manages the Curator's ambient sounds — loops for idle/moving states
 * and a one-shot for deep scan events. Runs outside the R3F Canvas.
 *
 * Loops crossfade smoothly on state transitions. Both loops stay
 * loaded and "playing" with gain at 0 when inactive, so transitions
 * are instant (no load delay).
 */
export default function CuratorAudio() {
  const { context, masterGain, ready } = useAudio();
  const { enabled, vizDataRef, deepScanSignalRef } = useAgent();

  // Audio nodes
  const curatorGainRef = useRef<GainNode | null>(null);
  const idleSrcRef = useRef<AudioBufferSourceNode | null>(null);
  const idleGainRef = useRef<GainNode | null>(null);
  const movingSrcRef = useRef<AudioBufferSourceNode | null>(null);
  const movingGainRef = useRef<GainNode | null>(null);
  const bufferCacheRef = useRef(new Map<string, AudioBuffer>());

  // Tracking
  const currentStateRef = useRef<AgentState | null>(null);
  const lastDeepScanRef = useRef(0);
  const activeRef = useRef(false);

  // Load a buffer (with cache)
  const loadBuffer = async (ac: AudioContext, url: string): Promise<AudioBuffer> => {
    const cached = bufferCacheRef.current.get(url);
    if (cached) return cached;
    const res = await fetch(url);
    const arr = await res.arrayBuffer();
    const buf = await ac.decodeAudioData(arr);
    bufferCacheRef.current.set(url, buf);
    return buf;
  };

  // Start a looping source at gain 0
  const startLoop = (ac: AudioContext, buffer: AudioBuffer, parent: GainNode): {
    src: AudioBufferSourceNode;
    gain: GainNode;
  } => {
    const gain = ac.createGain();
    gain.gain.setValueAtTime(0, ac.currentTime);
    gain.connect(parent);

    const src = ac.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    src.connect(gain);
    src.start();

    return { src, gain };
  };

  // Bootstrap loops when audio is ready and agent is enabled
  useEffect(() => {
    if (!ready || !context || !masterGain || !enabled) {
      // Tear down if disabled
      if (activeRef.current) {
        try { idleSrcRef.current?.stop(); } catch {}
        try { movingSrcRef.current?.stop(); } catch {}
        idleSrcRef.current = null;
        idleGainRef.current = null;
        movingSrcRef.current = null;
        movingGainRef.current = null;
        curatorGainRef.current = null;
        currentStateRef.current = null;
        activeRef.current = false;
      }
      return;
    }
    if (activeRef.current) return; // already running

    let cancelled = false;

    (async () => {
      const ac = context;
      const [idleBuf, movingBuf] = await Promise.all([
        loadBuffer(ac, SFX_IDLE),
        loadBuffer(ac, SFX_MOVING),
      ]);
      // Also preload deep scan buffer
      loadBuffer(ac, SFX_DEEP_SCAN).catch(() => {});

      if (cancelled) return;

      // Create a sub-gain for all curator sounds under the master
      const curatorGain = ac.createGain();
      curatorGain.gain.setValueAtTime(CURATOR_VOLUME, ac.currentTime);
      curatorGain.connect(masterGain);
      curatorGainRef.current = curatorGain;

      // Start both loops silently
      const idle = startLoop(ac, idleBuf, curatorGain);
      idleSrcRef.current = idle.src;
      idleGainRef.current = idle.gain;

      const moving = startLoop(ac, movingBuf, curatorGain);
      movingSrcRef.current = moving.src;
      movingGainRef.current = moving.gain;

      // Default to idle
      idle.gain.gain.setValueAtTime(1, ac.currentTime);
      currentStateRef.current = AgentState.IDLE;
      activeRef.current = true;
    })();

    return () => {
      cancelled = true;
    };
  }, [ready, context, masterGain, enabled]);

  // Poll agent state + deep scan signal
  useEffect(() => {
    if (!ready || !context || !enabled) return;

    const interval = setInterval(() => {
      if (!activeRef.current || !context) return;
      const ac = context;
      const now = ac.currentTime;

      // State-based crossfade
      const state = vizDataRef.current?.state ?? AgentState.IDLE;
      if (state !== currentStateRef.current) {
        const idleGain = idleGainRef.current;
        const movingGain = movingGainRef.current;
        if (idleGain && movingGain) {
          idleGain.gain.cancelScheduledValues(now);
          movingGain.gain.cancelScheduledValues(now);
          idleGain.gain.setValueAtTime(idleGain.gain.value, now);
          movingGain.gain.setValueAtTime(movingGain.gain.value, now);

          if (state === AgentState.MOVING) {
            idleGain.gain.linearRampToValueAtTime(0, now + CROSSFADE_SEC);
            movingGain.gain.linearRampToValueAtTime(1, now + CROSSFADE_SEC);
          } else {
            movingGain.gain.linearRampToValueAtTime(0, now + CROSSFADE_SEC);
            idleGain.gain.linearRampToValueAtTime(1, now + CROSSFADE_SEC);
          }
        }
        currentStateRef.current = state;
      }

      // Deep scan one-shot
      const signal = deepScanSignalRef.current;
      if (signal > lastDeepScanRef.current) {
        lastDeepScanRef.current = signal;
        const cached = bufferCacheRef.current.get(SFX_DEEP_SCAN);
        if (cached && curatorGainRef.current) {
          const src = ac.createBufferSource();
          src.buffer = cached;
          src.connect(curatorGainRef.current);
          src.start();
        }
      }
    }, POLL_MS);

    return () => clearInterval(interval);
  }, [ready, context, enabled, vizDataRef, deepScanSignalRef]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      try { idleSrcRef.current?.stop(); } catch {}
      try { movingSrcRef.current?.stop(); } catch {}
    };
  }, []);

  return null;
}
