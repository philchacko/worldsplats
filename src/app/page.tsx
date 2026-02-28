'use client';

import React, { useEffect, useRef, useState } from 'react';

/**
 * Suppress the React DevTools + R3F reconciler crash.
 * DevTools tries to parse R3F's empty version string as semver and throws
 * an uncaught error that triggers Next.js's dev error overlay (black screen).
 * This is a known compatibility issue — not caused by our code.
 */
function DevToolsErrorSuppressor() {
  useEffect(() => {
    const handler = (event: ErrorEvent) => {
      if (
        event.error?.message?.includes('not valid semver') &&
        event.filename?.includes('react_devtools')
      ) {
        event.preventDefault();
        console.warn('[Suppressed] React DevTools / R3F version compatibility error');
      }
    };
    window.addEventListener('error', handler);
    return () => window.removeEventListener('error', handler);
  }, []);
  return null;
}
import { RapierProvider } from '@/physics';
import { NavHeader } from "@/components/hud/NavHeader";
import { Spinner, VolumeMaxLine, VolumeXLine, HomeLine } from "@/icons";

import WorldScene from "@/components/scene/WorldScene";
import { PointerLockProvider, usePointerLock } from '@/providers/pointerLock';
import { AudioProvider, useAudio } from '@/providers/audio';
import { AgentProvider, useAgent } from '@/providers/agent';
//const WorldScene = dynamic(() => import('@/components/scene/WorldScene'), { ssr: false });
type ShootHandle = { shoot: () => void; clear: () => void; };
import { WORLDS, OBJECTS, ASSET_MODE, type WorldDef, type ObjectDef } from '@/data/presets';
import { useRemoteWorlds } from '@/lib/useRemoteWorlds';
import { Reticle } from '@/components/hud/ClickToPlay';
import { IconButton, Button } from '@/components/hud/Button';
import MobileHud from '@/components/controls/MobileHud';
import AgentHud from '@/components/agent/AgentHud';
import CuratorAudio from '@/components/agent/CuratorAudio';
import CuratorNarration from '@/components/agent/CuratorNarration';
import SemanticTooltip from '@/components/agent/SemanticTooltip';
import SubtitleDisplay from '@/components/agent/SubtitleDisplay';

function OverlayUI({
  world,
  currentIndex,
  totalWorlds,
  speed,
  setSpeed,
  onBack,
  onForward,
  isLoading,
  loadError,
}: {
  world: WorldDef;
  currentIndex: number;
  totalWorlds: number;
  speed: number;
  setSpeed: (speed: number) => void;
  onBack: () => void;
  onForward: () => void;
  isLoading: boolean;
  loadError?: string;
}) {
  const { isLocked, lock } = usePointerLock();
  const { init } = useAudio();
  const { setEnabled: setAgentEnabled } = useAgent();

  const handleClickToPlay = React.useCallback(async () => {
    try {
      await init();
    } catch (e) {
      console.error('Failed to initialize audio:', e);
    }

    // iOS motion permission (optional)
    try {
      if (typeof DeviceMotionEvent !== 'undefined' &&
          // @ts-expect-error - DeviceMotionEvent.requestPermission is iOS-specific
          typeof DeviceMotionEvent.requestPermission === 'function') {
        // @ts-expect-error - DeviceMotionEvent.requestPermission is iOS-specific
        const res = await DeviceMotionEvent.requestPermission();
        console.log('Motion permission:', res);
      }
    } catch (e) {
      console.log('Motion permission not available or denied:', e);
    }

    // Start the Curator — deep scan auto-fires from AgentController's timer
    setAgentEnabled(true);

    lock({ unadjustedMovement: false });
  }, [init, lock, setAgentEnabled]);

  return (
    <div className="pointer-events-auto flex w-full sm:w-[480px] max-h-[80vh] flex-col rounded-lg border border-normal bg-zinc-900/70 bg-root backdrop-blur overflow-hidden">
      {/* NavHeader - always visible */}
      <div className="p-4 flex-shrink-0">
        <NavHeader
          title={world.name}
          detail={`${currentIndex + 1} of ${totalWorlds}`}
          onBack={onBack}
          onForward={onForward}
        />
      </div>

      {/* Additional UI - hidden when locked */}
      <div className={`px-4 pb-4 space-y-4 overflow-y-auto flex-1 ${isLocked ? 'hidden' : ''}`}>
        <Divider />

        <label className="flex items-center gap-3 text-xs">
          <span className="pr-4">Speed</span>
          <input
            type="range" min={2} max={40} step={1}
            value={speed}
            onChange={(e) => setSpeed(Number(e.target.value))}
            className="w-full"
          />
          <span className="w-10 text-right tabular-nums">{speed}</span>
        </label>

        <p className="text-xs text-secondary">
          Movement: W/A/S/D + mouse. Shift to sprint. Space to jump.
          <br />
          Navigation: ←/→ or Q/E. V for vision scan. F to direct agent. Esc to exit.
        </p>

        <Divider />
        {world.imageUrl && <div className="space-y-1">
          <p className="text-xs text-secondary">Prompt image</p>
          <img src={world.imageUrl} alt="Prompt image" className="w-fit h-40 rounded-lg pt-2" />
        </div>}
        {world.guide && <div className="space-y-1">
          <p className="text-xs text-secondary">World guide</p>
          <p className="text-xs text-zinc-200 max-h-40 overflow-y-auto">{world.guide}</p>
        </div>}
        {world.imageCredit && <div className="space-y-1">
          <p className="text-xs text-secondary">Image credit</p>
          <p className="text-xs text-zinc-200 max-h-40 overflow-y-auto">{world.imageCredit}</p>
        </div>}
      </div>

      {/* Click to Play Footer - always visible when not locked */}
      {!isLocked && !isLoading && !loadError && (
        <div className="p-4 border-t border-normal">
          <Button
            className="w-full px-6 py-3 rounded-md border border-zinc-700 bg-zinc-800 text-base font-medium hover:bg-zinc-700 hover:border-zinc-600 transition-colors"
            onClick={handleClickToPlay}
            label="Click to play"
          />
        </div>
      )}
    </div>
  );
}

function RootUIOverlays({
  isLoading,
  loadError,
}: {
  isLoading: boolean; loadError?: string;
}) {
  const { isLocked, unlock } = usePointerLock();
  const { muted, setMuted } = useAudio();

  return (
    <>
      <Reticle visible={isLocked && !isLoading && !loadError} />

      {/* Mute button - top-right on desktop, bottom-right on mobile */}
      <IconButton
        aria-label="Toggle volume"
        onClick={() => setMuted(!muted)}
        className="absolute top-4 right-4 sm:top-4 sm:right-4 max-sm:top-auto max-sm:bottom-4 z-10 stroke-secondary"
        icon={muted ? <VolumeXLine /> : <VolumeMaxLine />}
      />

      {/* Exit play button - mobile only, above mute button */}
      {isLocked && (
        <IconButton
          aria-label="Exit play"
          onClick={unlock}
          className="absolute bottom-20 right-4 sm:hidden z-10 stroke-secondary"
          icon={<HomeLine />}
        />
      )}

      {/* Loading overlay (kept from your code) */}
      {(isLoading || loadError) && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/50 backdrop-blur-sm z-10">
          <div className="flex flex-col items-center gap-4 p-6 rounded-xl bg-zinc-900/90 border border-zinc-800">
            {isLoading ? (
              <>
                <Spinner size={32} className="text-white" />
                <p className="text-white text-sm">Loading world...</p>
              </>
            ) : (
              <>
                <div className="w-8 h-8 rounded-full bg-red-500 flex items-center justify-center">
                  <span className="text-white text-sm font-bold">!</span>
                </div>
                <div className="text-center">
                  <p className="text-red-400 text-sm font-medium">Failed to load world</p>
                  <p className="text-zinc-400 text-xs mt-1 max-w-xs">{loadError}</p>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}

const Divider = () => {
  return (
    <div className="h-0.5 w-full bg-zinc-700"></div>
  );
};

function PageContent() {
  // Fetch worlds from Supabase (returns [] if not configured)
  const { worlds: remoteWorlds, loading: remoteLoading } = useRemoteWorlds();

  // Merge: in supabase mode, prefer remote worlds; in local mode, use static.
  // Remote worlds that share an id with static ones replace them; others are appended.
  const allWorlds = React.useMemo<WorldDef[]>(() => {
    if (ASSET_MODE === 'local' || remoteWorlds.length === 0) return WORLDS;
    const remoteIds = new Set(remoteWorlds.map((w) => w.id));
    const staticOnly = WORLDS.filter((w) => !remoteIds.has(w.id));
    return [...remoteWorlds, ...staticOnly];
  }, [remoteWorlds]);

  const [world, setWorld] = useState<WorldDef>(WORLDS[0]);
  const [object, setObject] = useState<ObjectDef>(OBJECTS[0]);
  const [speed, setSpeed] = useState<number>(14);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | undefined>();
  const shootRef = useRef<ShootHandle | null>(null);
  const mobileInputRef = useRef<{x:number;y:number}>({x:0,y:0});
  const { setMusic } = useAudio();

  // When remote worlds finish loading, reset to the first world from the merged list
  React.useEffect(() => {
    if (!remoteLoading && allWorlds.length > 0) {
      setWorld(allWorlds[0]);
    }
  }, [remoteLoading, allWorlds]);

  // Return current index of world in the merged list
  const currentIndex = allWorlds.findIndex((w) => w.id === world.id);

  // Switch music when world changes. This is safe before/after init().
  React.useEffect(() => {
    if (world.musicUrl) {
      setMusic(world.musicUrl);
    }
  }, [world.musicUrl, setMusic]);

  const handleBack = () => {
    if (currentIndex > 0) {
      setWorld(allWorlds[currentIndex - 1]);
    } else {
      setWorld(allWorlds[allWorlds.length - 1]);
    }
  };

  const handleForward = () => {
    const idx = allWorlds.findIndex((w) => w.id === world.id);
    if (idx < allWorlds.length - 1) {
      setWorld(allWorlds[idx + 1]);
    } else {
      setWorld(allWorlds[0]);
    }
  };

  const handleLoadingChange = (loading: boolean, error?: string) => {
    setIsLoading(loading);
    setLoadError(error);
  };

  return (
    <div className="relative h-dvh w-dvw bg-black text-white font-sans">
      {/* 3D Canvas - fills entire viewport */}
      <RapierProvider colliderUrl={world.colliderUrl} colliderRotation={world.colliderUrl ? (world.colliderQuaternion ?? world.quaternion) : undefined} colliderScale={world.colliderUrl ? world.scale : undefined} spawnPosition={world.spawn}>
        <WorldScene
          world={world}
          object={object}
          shootSink={shootRef}
          playerMoveSpeed={speed}
          onLoadingChange={handleLoadingChange}
          mobileInputRef={mobileInputRef}
        />
      </RapierProvider>

      {/* Overlay UI - positioned at top with pointer-events-none on container */}
      <div className="absolute inset-0 flex flex-col pointer-events-none">
        <div className="flex justify-center p-4 sm:px-4 sm:pt-4">
          <OverlayUI
            world={world}
            currentIndex={currentIndex}
            totalWorlds={allWorlds.length}
            speed={speed}
            setSpeed={setSpeed}
            onBack={handleBack}
            onForward={handleForward}
            isLoading={isLoading || remoteLoading}
            loadError={loadError}
          />
        </div>
      </div>

      {/* Reticle + loading overlays + mute button */}
      <RootUIOverlays isLoading={isLoading} loadError={loadError} />

      {/* Agent HUD - bottom-left (hidden — enable for debugging) */}
      {/* <div className="absolute bottom-4 left-4 z-10 pointer-events-none">
        <AgentHud />
      </div> */}

      {/* Curator ambient sounds */}
      <CuratorAudio />

      {/* Curator voice narration */}
      <CuratorNarration world={world} />

      {/* Curator subtitles — bottom-center */}
      <SubtitleDisplay />

      {/* Semantic label tooltip — shows label under reticle */}
      <SemanticTooltip />

      {/* Mobile controls */}
      <MobileHud mobileInputRef={mobileInputRef} />

      {/* ─── Keyboard shortcuts ──────────────────────────────────
       * Movement (PlayerController):
       *   W / A / S / D       — Move forward / left / backward / right
       *   Shift               — Sprint
       *   Space               — Jump
       *   Mouse               — Look around (pointer lock)
       *
       * World navigation (WorldNavigationHotkeys):
       *   ← or Q              — Previous world
       *   → or E              — Next world
       *
       * Actions (ShootHotkey, PlayerController, AgentController):
       *   Space               — Shoot projectile
       *   F                   — Command agent to move to look target
       *   V                   — Manual Gemini vision scan
       *   P                   — Debug: print player position & yaw/pitch
       *
       * System:
       *   Esc                 — Exit pointer lock (return to menu)
       * ──────────────────────────────────────────────────────── */}
      <ShootHotkey shootRef={shootRef} />
      <WorldNavigationHotkeys onBack={handleBack} onForward={handleForward} />
    </div>
  );
}

export default function Page() {
  return (
    <>
      <DevToolsErrorSuppressor />
      <PointerLockProvider>
        <AudioProvider>
          <AgentProvider>
            <PageContent />
          </AgentProvider>
        </AudioProvider>
      </PointerLockProvider>
    </>
  );
}

function ShootHotkey({ shootRef }: { shootRef: React.RefObject<ShootHandle | null> }) {
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        e.preventDefault();
        shootRef.current?.shoot();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [shootRef]);
  return null;
}

function WorldNavigationHotkeys({ onBack, onForward }: { onBack: () => void; onForward: () => void }) {
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'ArrowLeft' || e.key === 'q' || e.key === 'Q') {
        e.preventDefault();
        onBack();
      } else if (e.code === 'ArrowRight' || e.key === 'e' || e.key === 'E') {
        e.preventDefault();
        onForward();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onBack, onForward]);
  return null;
}
