'use client';

import React, { useRef, useState } from 'react';
import { RapierProvider } from '@/physics';
import { NavHeader } from "@/components/hud/NavHeader";

import WorldScene from "@/components/scene/WorldScene";
//const WorldScene = dynamic(() => import('@/components/scene/WorldScene'), { ssr: false });
type ShootHandle = { shoot: () => void; clear: () => void; };
import { WORLDS, OBJECTS, type WorldDef, type ObjectDef } from '@/data/presets';

export default function Page() {
  const [world, setWorld] = useState<WorldDef>(WORLDS[0]);
  const [object, setObject] = useState<ObjectDef>(OBJECTS[0]);
  const [speed, setSpeed] = useState<number>(14);
  const shootRef = useRef<ShootHandle | null>(null);

  // Return current index of world in WORLDS
  const currentIndex = WORLDS.findIndex((w) => w.id === world.id);

  const handleBack = () => {
    if (currentIndex > 0) {
      setWorld(WORLDS[currentIndex - 1]);
    } else {
      setWorld(WORLDS[0]);
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

  return (
    <div className="relative h-dvh w-dvw bg-black text-white font-sans">
      {/* 3D */}
      <RapierProvider>
        <WorldScene
          world={world}
          object={object}
          shootSink={shootRef} projectileSpeed={speed}
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

        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs uppercase text-zinc-400">World</span>
            <select
              className="rounded bg-zinc-800 px-2 py-1 outline-none"
              value={world.id}
              onChange={(e) => {
                const w = WORLDS.find((x) => x.id === e.target.value)!;
                setWorld(w);
              }}
            >
              {WORLDS.map((w) => (
                <option key={w.id} value={w.id}>{w.name}</option>
              ))}
            </select>
          </label>

          {/* <label className="flex flex-col gap-1">
            <span className="text-xs uppercase text-zinc-400">Object</span>
             <select
              className="rounded bg-zinc-800 px-2 py-1 outline-none"
              value={object.id}
              onChange={(e) => {
                const o = OBJECTS.find((x) => x.id === e.target.value)!;
                setObject(o);
              }}
            >
              {OBJECTS.map((o) => (
                <option key={o.id} value={o.id}>{o.name}</option>
              ))}
            </select> 
          </label> */}
        </div>

        <label className="flex items-center gap-3">
          <span className="text-xs uppercase text-zinc-400">Speed</span>
          <input
            type="range" min={2} max={40} step={1}
            value={speed}
            onChange={(e) => setSpeed(Number(e.target.value))}
            className="w-full"
          />
          <span className="w-10 text-right tabular-nums">{speed}</span>
        </label>

        <div className="flex gap-3">
          <button
            className="rounded bg-emerald-600 px-3 py-2 text-sm font-medium hover:bg-emerald-500"
            onClick={() => shootRef.current?.shoot()}
          >
            Shoot (Space)
          </button>
          <button
            className="rounded bg-zinc-800 px-3 py-2 text-sm hover:bg-zinc-700"
            onClick={() => shootRef.current?.clear()}
          >
            Clear
          </button>
        </div>

        <p className="text-xs text-zinc-400">
          Mouse: Look around.
          <br />
          Keyboard: W/A/S/D truck/forward.
        </p>
      </div>

      {/* keyboard shortcut for shoot */}
      <ShootHotkey shootRef={shootRef} />
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
