'use client';

import React, { useRef, useState } from 'react';
import { RapierProvider } from '@/physics';
import { NavHeader } from "@/components/hud/NavHeader";
import { Spinner } from "@/icons";

import WorldScene from "@/components/scene/WorldScene";
//const WorldScene = dynamic(() => import('@/components/scene/WorldScene'), { ssr: false });
type ShootHandle = { shoot: () => void; clear: () => void; };
import { WORLDS, OBJECTS, type WorldDef, type ObjectDef } from '@/data/presets';

export default function Page() {
  const [world, setWorld] = useState<WorldDef>(WORLDS[0]);
  const [object, setObject] = useState<ObjectDef>(OBJECTS[0]);
  const [speed, setSpeed] = useState<number>(14);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | undefined>();
  const shootRef = useRef<ShootHandle | null>(null);

  // Return current index of world in WORLDS
  const currentIndex = WORLDS.findIndex((w) => w.id === world.id);

  const handleBack = () => {
    if (currentIndex > 0) {
      setWorld(WORLDS[currentIndex - 1]);
    } else {
      setWorld(WORLDS[WORLDS.length - 1]);
    }
  };

  const handleForward = () => {
    const currentIndex = WORLDS.findIndex((w) => w.id === world.id);
    if (currentIndex < WORLDS.length - 1) {
      setWorld(WORLDS[currentIndex + 1]);
    } else {
      setWorld(WORLDS[0]);
    }
  };

  const handleLoadingChange = (loading: boolean, error?: string) => {
    setIsLoading(loading);
    setLoadError(error);
  };

  return (
    <div className="relative h-dvh w-dvw bg-black text-white font-sans">
      {/* 3D */}
      <RapierProvider>
        <WorldScene
          world={world}
          object={object}
          shootSink={shootRef} 
          projectileSpeed={speed}
          onLoadingChange={handleLoadingChange}
        />
      </RapierProvider>

      {/* Overlay UI */}
      <div className="pointer-events-auto absolute left-4 top-4 flex w-[400px] flex-col gap-3 rounded-xl border border-normal bg-zinc-900/70 p-4 bg-root backdrop-blur">
        <NavHeader
          title={world.name}
          detail={`${currentIndex + 1} of ${WORLDS.length}`}
          onBack={handleBack}
          onForward={handleForward}
        />

        <label className="flex items-center gap-3">
          <span className="text-xs pr-2">Speed</span>
          <input
            type="range" min={2} max={40} step={1}
            value={speed}
            onChange={(e) => setSpeed(Number(e.target.value))}
            className="w-full"
          />
          <span className="w-10 text-right tabular-nums">{speed}</span>
        </label>

        {/* <div className="flex gap-3">
          <Button
            className="rounded bg-elevated px-3 py-2 text-primary text-sm font-medium"
            label="Shoot (Space)"
            prominence={ButtonProminence.Primary}
            onClick={() => shootRef.current?.shoot()}
          />
          <Button
            className="rounded bg-action-primary px-3 py-2 text-sm hover:bg-action-primary-hover"
            label="Clear"
            prominence={ButtonProminence.Primary}
            onClick={() => shootRef.current?.clear()}
          />
        </div> */}

        <p className="text-xs text-zinc-400">
          Mouse: Look around.
          <br />
          Keyboard: W/A/S/D forward, backward, strafe.
          <br />
          ←/→ or Q/E: Navigate worlds.
        </p>
      </div>

      {/* Loading overlay */}
      {(isLoading || loadError) && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/50 backdrop-blur-sm z-10">
          <div className="flex flex-col items-center gap-4 p-6 rounded-xl bg-zinc-900/90 border border-zinc-800">
            {isLoading ? (
              <>
                <Spinner size={32} className="text-white" />
                <p className="text-white text-sm">Loading world...</p>
              </>
            ) : loadError ? (
              <>
                <div className="w-8 h-8 rounded-full bg-red-500 flex items-center justify-center">
                  <span className="text-white text-sm font-bold">!</span>
                </div>
                <div className="text-center">
                  <p className="text-red-400 text-sm font-medium">Failed to load world</p>
                  <p className="text-zinc-400 text-xs mt-1 max-w-xs">{loadError}</p>
                </div>
              </>
            ) : null}
          </div>
        </div>
      )}

      {/* keyboard shortcuts */}
      <ShootHotkey shootRef={shootRef} />
      <WorldNavigationHotkeys onBack={handleBack} onForward={handleForward} />
    </div>
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
