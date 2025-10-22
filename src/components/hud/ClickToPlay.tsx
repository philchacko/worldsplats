'use client';

import { useCallback } from 'react';
import { usePointerLock } from '@/providers/pointerLock';
import { useAudio } from '@/providers/audio';
import { Button } from '@/components/hud/Button';

export function ClickToPlayOverlay({ visible }: { visible: boolean }) {
  const { lock } = usePointerLock();
  const { init } = useAudio();

  const onClick = useCallback(async () => {
    // Start audio & request pointer lock in the same user gesture
    try { await init(); } catch {}
    lock({ unadjustedMovement: false });
  }, [init, lock]);

  if (!visible) return null;

  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none">
      <Button
        className="pointer-events-auto px-6 py-3 rounded-md border border-zinc-700 bg-zinc-900/80 text-base font-medium hover:bg-zinc-800 hover:border-zinc-600 transition-colors"
        onClick={onClick}
        label="Click to play"
      />
    </div>
  );
}

export function Reticle({ visible }: { visible: boolean }) {
  if (!visible) return null;
  return (
    <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10 opacity-85">
      <div className="relative w-[18px] h-[18px]">
        <div className="absolute left-1/2 top-0 w-[2px] h-full -translate-x-1/2 bg-white/90" />
        <div className="absolute top-1/2 left-0 h-[2px] w-full -translate-y-1/2 bg-white/90" />
      </div>
    </div>
  );
}
