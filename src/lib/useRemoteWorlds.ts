'use client';

import { useEffect, useState } from 'react';
import { supabase } from './supabase';
import {
  SUPABASE_STORAGE_BASE,
  MUSIC_POOL,
  type WorldDef,
} from '@/data/presets';

/** Row shape returned from the `worlds` table. */
type WorldRow = {
  id: string;
  name: string;
  splat_file: string;
  image_file: string;
  music_file: string | null;
  collider_file: string | null;
  guide: string;
  image_credit: string | null;
  position_x: number;
  position_y: number;
  position_z: number;
  quaternion_x: number;
  quaternion_y: number;
  quaternion_z: number;
  quaternion_w: number;
  scale: number;
  spawn_x: number | null;
  spawn_y: number | null;
  spawn_z: number | null;
  sort_order: number;
};

/** Build a full storage URL from a relative file path. */
function storageUrl(filePath: string): string {
  return `${SUPABASE_STORAGE_BASE}/${filePath}`;
}

/** Pick a music track — use the world's own if set, otherwise pick from pool. */
function pickMusic(musicFile: string | null, index: number): string {
  if (musicFile) return storageUrl(musicFile);
  return storageUrl(MUSIC_POOL[index % MUSIC_POOL.length]);
}

/** Map a DB row to a WorldDef. */
function rowToWorldDef(row: WorldRow, index: number): WorldDef {
  const splatUrl = storageUrl(row.splat_file);
  return {
    id: row.id,
    name: row.name,
    url: splatUrl,
    imageUrl: row.image_file ? storageUrl(row.image_file) : '',
    musicUrl: pickMusic(row.music_file, index),
    colliderUrl: row.collider_file
      ? storageUrl(row.collider_file)
      : undefined, // derived from splat URL at consumption time
    guide: row.guide,
    imageCredit: row.image_credit ?? undefined,
    position: [row.position_x, row.position_y, row.position_z],
    quaternion: [row.quaternion_x, row.quaternion_y, row.quaternion_z, row.quaternion_w],
    scale: row.scale,
    spawn: row.spawn_x != null ? [row.spawn_x, row.spawn_y ?? 0, row.spawn_z ?? 0] : undefined,
  };
}

/**
 * Fetch worlds from the Supabase `worlds` table.
 * Returns { worlds, loading, error }.
 * If supabase client is not configured, returns empty array immediately.
 */
export function useRemoteWorlds() {
  const [worlds, setWorlds] = useState<WorldDef[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    (async () => {
      const { data, error: fetchError } = await supabase
        .from('worlds')
        .select('*')
        .order('sort_order', { ascending: true });

      if (cancelled) return;

      if (fetchError) {
        console.error('Failed to fetch worlds from Supabase:', fetchError.message);
        setError(fetchError.message);
        setLoading(false);
        return;
      }

      const mapped = (data as WorldRow[]).map(rowToWorldDef);
      setWorlds(mapped);
      setLoading(false);
    })();

    return () => { cancelled = true; };
  }, []);

  return { worlds, loading, error };
}
