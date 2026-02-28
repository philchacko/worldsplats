'use client';

import { useEffect, useRef, useState } from 'react';
import { useAudio } from '@/providers/audio';
import { useAgent } from '@/providers/agent';
import type { WorldDef } from '@/data/presets';
import { CommentaryTriggerEngine, type TriggerInput } from '@/agent/commentary/triggerEngine';
import { TTSPlayer } from '@/agent/commentary/ttsPlayer';
import type { CommentaryContext, CommentaryEvent } from '@/agent/commentary/types';

/** Poll interval (ms) for checking trigger conditions. */
const POLL_MS = 500;

/**
 * Orchestrates The Curator's voice narration pipeline.
 * Watches agent state for interesting events, generates commentary
 * via Claude API, and plays it via ElevenLabs TTS.
 *
 * Placement: outside R3F Canvas, sibling to CuratorAudio.
 */
export default function CuratorNarration({ world }: { world: WorldDef }) {
  const { context: audioContext, masterGain, ready: audioReady } = useAudio();
  const {
    enabled,
    vizDataRef,
    lastSplashRef,
    deepScanSignalRef,
    narrationStateRef,
    sceneDescriptionRef,
    narrationTextRef,
  } = useAgent();

  const triggerEngineRef = useRef<CommentaryTriggerEngine | null>(null);
  const ttsPlayerRef = useRef<TTSPlayer | null>(null);
  const previousCommentsRef = useRef<string[]>([]);
  const totalObjectsRef = useRef<Record<string, number>>({});
  const [, setVersion] = useState(0); // force re-render if needed

  const voiceId = process.env.NEXT_PUBLIC_ELEVENLABS_VOICE_ID ?? '';

  // Reset trigger engine and all narration context when enabled changes or world changes
  useEffect(() => {
    if (!enabled) {
      triggerEngineRef.current = null;
      previousCommentsRef.current = [];
      totalObjectsRef.current = {};
      sceneDescriptionRef.current = '';
      return;
    }
    triggerEngineRef.current = new CommentaryTriggerEngine();
    previousCommentsRef.current = [];
    totalObjectsRef.current = {};
    sceneDescriptionRef.current = '';
  }, [enabled, world.id]);

  // Initialize/dispose TTS player with AudioContext
  useEffect(() => {
    if (!audioReady || !audioContext || !masterGain) {
      ttsPlayerRef.current?.dispose();
      ttsPlayerRef.current = null;
      return;
    }
    ttsPlayerRef.current = new TTSPlayer(audioContext, masterGain);
    return () => {
      ttsPlayerRef.current?.dispose();
      ttsPlayerRef.current = null;
    };
  }, [audioReady, audioContext, masterGain]);

  // Cancel in-flight speech and clear narration state on world switch.
  // cancel() is called both in the effect body (immediate on new world)
  // AND in cleanup (covers unmount / re-render edge cases).
  useEffect(() => {
    ttsPlayerRef.current?.cancel();
    narrationStateRef.current = { speaking: false, lastCommentTime: 0 };
    narrationTextRef.current = '';
    return () => {
      ttsPlayerRef.current?.cancel();
    };
  }, [world.id]);

  // Main poll loop
  useEffect(() => {
    if (!enabled || !audioReady || !voiceId) return;

    const interval = setInterval(async () => {
      const engine = triggerEngineRef.current;
      const player = ttsPlayerRef.current;
      if (!engine || !player || player.isSpeaking) return;

      const vizData = vizDataRef.current;
      if (!vizData) return;

      // Accumulate total objects from splash results
      const splash = lastSplashRef.current;
      if (splash) {
        for (const [k, v] of Object.entries(splash.perLabel)) {
          totalObjectsRef.current[k] = (totalObjectsRef.current[k] ?? 0) + v;
        }
      }

      // Build trigger input
      const triggerInput: TriggerInput = {
        vizData,
        lastSplash: splash,
        deepScanSignal: deepScanSignalRef.current,
        totalObjects: totalObjectsRef.current,
        worldName: world.name,
        worldGuide: '',
        previousComments: previousCommentsRef.current,
      };

      // Check for an interesting event
      const event = engine.evaluate(triggerInput);
      if (!event) return;

      // Inject latest Gemini scene description into the event context
      const desc = sceneDescriptionRef.current;
      if (desc) {
        event.context.sceneDescription = desc;
      }

      // Run the narration pipeline
      await runNarration(event, player, engine);
    }, POLL_MS);

    return () => clearInterval(interval);
  }, [enabled, audioReady, voiceId, world, vizDataRef, lastSplashRef, deepScanSignalRef]);

  /** Generate text via Claude, then speak it via ElevenLabs. */
  async function runNarration(
    event: CommentaryEvent,
    player: TTSPlayer,
    engine: CommentaryTriggerEngine,
  ): Promise<void> {
    // Mark as speaking
    narrationStateRef.current = { speaking: true, lastCommentTime: Date.now() };
    setVersion((v) => v + 1);

    try {
      // 1. Stream text from Claude
      console.log(`[CuratorNarration] trigger: ${event.type} (priority ${event.priority})`);
      const text = await fetchNarrationText(event.context);
      if (!text) {
        console.warn('[CuratorNarration] empty text from Claude');
        return;
      }
      console.log(`[CuratorNarration] text: "${text}"`);

      // 2. Expose text for subtitles
      narrationTextRef.current = text;
      setVersion((v) => v + 1);

      // 3. Speak it via ElevenLabs
      const spoken = await player.speak(text, voiceId);
      if (spoken) {
        previousCommentsRef.current = [
          ...previousCommentsRef.current.slice(-2),
          spoken,
        ];
      }
    } catch (err) {
      console.warn('[CuratorNarration] pipeline error:', err);
    } finally {
      narrationStateRef.current = { speaking: false, lastCommentTime: Date.now() };
      narrationTextRef.current = '';
      engine.recordCompletion();
      setVersion((v) => v + 1);
    }
  }

  return null; // No UI — subtitles can be added later
}

/**
 * Strip stage directions and non-speech artifacts so only spoken words reach TTS.
 * Removes: *actions*, (parentheticals), "quoted speech wrappers", leading/trailing whitespace.
 */
function cleanForTTS(raw: string): string {
  let text = raw;
  // Remove *stage directions* (including multi-word)
  text = text.replace(/\*[^*]+\*/g, '');
  // Remove (parenthetical asides)
  text = text.replace(/\([^)]*\)/g, '');
  // Remove wrapping quotation marks if the entire text is quoted
  text = text.replace(/^["\u201C](.+)["\u201D]$/, '$1');
  // Collapse multiple spaces / newlines into single space
  text = text.replace(/\s+/g, ' ');
  return text.trim();
}

/** Fetch streaming text from the /api/narrate route and collect it. */
async function fetchNarrationText(context: CommentaryContext): Promise<string> {
  const response = await fetch('/api/narrate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ context }),
  });

  if (!response.ok) {
    console.warn('[CuratorNarration] narrate API error:', response.status);
    return '';
  }

  const reader = response.body?.getReader();
  if (!reader) return '';

  const decoder = new TextDecoder();
  let fullText = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    fullText += decoder.decode(value, { stream: true });
  }

  return cleanForTTS(fullText);
}
