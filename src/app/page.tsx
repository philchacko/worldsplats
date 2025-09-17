'use client';

import React, { useRef, useState } from 'react';
import { RapierProvider } from '@/physics';
import { NavHeader } from "@/components/hud/NavHeader";
import { Spinner } from "@/icons";

import WorldScene from "@/components/scene/WorldScene";
import { VRButtonComponent, XRProvider, useXRSupport } from "@/components/scene/XR";
//const WorldScene = dynamic(() => import('@/components/scene/WorldScene'), { ssr: false });
type ShootHandle = { shoot: () => void; clear: () => void; };
import { WORLDS, OBJECTS, type WorldDef, type ObjectDef } from '@/data/presets';

const Divider = () => {
  return (
    <div className="h-0.5 w-full bg-zinc-700"></div>
  );
};

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

  // XR handled within the 3D Canvas via components under `components/scene`.

  return (
    <XRProvider>
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
      <div className="pointer-events-auto absolute left-4 top-4 space-y-4 flex w-[400px] flex-col rounded-lg border border-normal bg-zinc-900/70 p-4 bg-root backdrop-blur">
        <NavHeader
          title={world.name}
          detail={`${currentIndex + 1} of ${WORLDS.length}`}
          onBack={handleBack}
          onForward={handleForward}
        />

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

        <div className="flex justify-between gap-2">
          <p className="text-xs text-secondary">
            Movement: W/A/S/D + mouse.
            <br />
            Navigation: ←/→ or Q/E.
          </p>

          <VRSupportAndButton />
        </div>

        <Divider />
        <div className="space-y-1">
          <p className="text-xs text-secondary">Prompt image</p>
          <img src={world.imageUrl} alt="Prompt image" className="w-fit h-40 rounded-lg pt-2" />
        </div>
        <div className="space-y-1">
          <p className="text-xs text-secondary">World guide</p>
          <p className="text-xs text-zinc-200 max-h-40 overflow-y-auto">{world.guide}</p>
        </div>
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
    </XRProvider>
  );
}
function VRSupportAndButton() {
  const { hasXR } = useXRSupport();
  const enabled = hasXR !== false; // allow clicking even if hand-tracking is missing
  return (
    <VRButtonComponent className="w-full" enabled={enabled} />
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
