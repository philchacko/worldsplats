'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useAgent } from '@/providers/agent';
import { AgentState } from '@/agent/types';
import { Button } from '@/components/hud/Button';

/**
 * DOM overlay HUD for controlling the autonomous agent.
 * Shows start/stop, visualization toggle, and live stats.
 */
export default function AgentHud() {
  const { enabled, setEnabled, showViz, setShowViz, vizDataRef } = useAgent();
  const [stats, setStats] = useState({ state: AgentState.IDLE, explored: 0, total: 0 });

  const handleToggle = useCallback(() => setEnabled(!enabled), [enabled, setEnabled]);
  const handleViz = useCallback(() => setShowViz(!showViz), [showViz, setShowViz]);

  // Poll stats from vizDataRef at 2 Hz (no per-frame React re-renders)
  useEffect(() => {
    if (!enabled) return;
    const id = setInterval(() => {
      const data = vizDataRef.current;
      if (!data) return;
      const s = data.grid.stats();
      setStats({ state: data.state, explored: s.totalKnown, total: s.totalKnown + s.unknown });
    }, 500);
    return () => clearInterval(id);
  }, [enabled, vizDataRef]);

  const pct = stats.total > 0 ? ((stats.explored / stats.total) * 100).toFixed(1) : '0.0';

  return (
    <div className="pointer-events-auto flex flex-col gap-2 rounded-lg border border-zinc-700 bg-zinc-900/70 backdrop-blur p-3 text-xs">
      <div className="flex items-center gap-2">
        <Button
          onClick={handleToggle}
          label={enabled ? 'Stop Agent' : 'Start Agent'}
          className="px-3 py-1.5 rounded border border-zinc-600 bg-zinc-800 hover:bg-zinc-700 transition-colors text-xs"
        />
        {enabled && (
          <Button
            onClick={handleViz}
            label={showViz ? 'Hide Map' : 'Show Map'}
            className="px-3 py-1.5 rounded border border-zinc-600 bg-zinc-800 hover:bg-zinc-700 transition-colors text-xs"
          />
        )}
      </div>

      {enabled && (
        <div className="text-secondary space-y-0.5">
          <p>State: <span className="text-zinc-200">{stats.state}</span></p>
          <p>Mapped: <span className="text-zinc-200">{stats.explored.toLocaleString()} cells ({pct}%)</span></p>
        </div>
      )}
    </div>
  );
}
