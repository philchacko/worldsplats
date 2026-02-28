'use client';

import { useEffect, useState } from 'react';
import { useAgent } from '@/providers/agent';

/** How long (ms) to keep the subtitle visible after speech ends. */
const LINGER_MS = 2500;

/**
 * Displays the Curator's current narration text as a subtitle overlay
 * at the bottom-center of the viewport. Fades in when speaking,
 * lingers briefly after speech ends, then fades out.
 */
export default function SubtitleDisplay() {
  const { narrationStateRef, narrationTextRef } = useAgent();
  const [text, setText] = useState('');
  const [visible, setVisible] = useState(false);

  // Poll the refs at ~10 Hz to pick up changes without per-frame React renders
  useEffect(() => {
    let lingerTimeout: ReturnType<typeof setTimeout> | null = null;

    const interval = setInterval(() => {
      const currentText = narrationTextRef.current;
      const speaking = narrationStateRef.current.speaking;

      if (currentText && speaking) {
        // New text arriving — show immediately
        if (lingerTimeout) {
          clearTimeout(lingerTimeout);
          lingerTimeout = null;
        }
        setText(currentText);
        setVisible(true);
      } else if (!speaking && text && !lingerTimeout) {
        // Speech just ended — start linger timer
        lingerTimeout = setTimeout(() => {
          setVisible(false);
          // Clear text after fade-out transition completes
          setTimeout(() => setText(''), 500);
          lingerTimeout = null;
        }, LINGER_MS);
      }
    }, 100);

    return () => {
      clearInterval(interval);
      if (lingerTimeout) clearTimeout(lingerTimeout);
    };
  }, [narrationStateRef, narrationTextRef, text]);

  if (!text) return null;

  return (
    <div
      className={`
        absolute bottom-16 left-1/2 -translate-x-1/2 z-20
        max-w-lg w-[90vw] pointer-events-none
        transition-opacity duration-500 ease-in-out
        ${visible ? 'opacity-100' : 'opacity-0'}
      `}
    >
      <p className="text-center text-sm sm:text-base text-white leading-relaxed px-4 py-3 rounded-lg bg-black/60 backdrop-blur-sm">
        {text}
      </p>
    </div>
  );
}
