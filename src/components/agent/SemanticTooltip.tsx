'use client';

import { useEffect, useState } from 'react';
import { useAgent } from '@/providers/agent';

/**
 * 2D DOM overlay that shows the semantic label when the reticle
 * points at a labeled occupancy grid cell. Positioned just below
 * the reticle (screen center).
 */
export default function SemanticTooltip() {
  const { enabled, hoveredLabelRef } = useAgent();
  const [label, setLabel] = useState<string | null>(null);

  // Poll the ref at ~15 Hz to avoid per-frame React re-renders
  useEffect(() => {
    if (!enabled) {
      setLabel(null);
      return;
    }
    const id = setInterval(() => {
      setLabel(hoveredLabelRef.current);
    }, 66);
    return () => clearInterval(id);
  }, [enabled, hoveredLabelRef]);

  if (!label) return null;

  return (
    <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
      <div className="mt-12 px-3 py-1 rounded border border-zinc-600 bg-zinc-900/80 backdrop-blur-sm">
        <span className="text-xs font-mono tracking-wider text-amber-300 uppercase">
          {label}
        </span>
      </div>
    </div>
  );
}
