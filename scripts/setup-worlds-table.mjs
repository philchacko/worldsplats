#!/usr/bin/env node
/**
 * Sets up the `worlds` table in Supabase and seeds it with existing world data.
 *
 * Step 1 (manual): Copy the SQL printed by --schema and run it in Supabase SQL Editor
 * Step 2 (this script): Seed the table with data
 *
 * Usage:
 *   # Print the CREATE TABLE SQL to paste into Supabase SQL Editor:
 *   node scripts/setup-worlds-table.mjs --schema
 *
 *   # Seed data (after table exists):
 *   SUPABASE_URL=https://xxx.supabase.co SUPABASE_SERVICE_ROLE_KEY=ey... node scripts/setup-worlds-table.mjs --seed
 */

import { createClient } from '@supabase/supabase-js';

const command = process.argv[2];

// ─── --schema: Print SQL for table creation ─────────────────
if (command === '--schema') {
  console.log(`
-- Run this in Supabase Dashboard → SQL Editor

create table if not exists public.worlds (
  id text primary key,
  name text not null,
  splat_file text not null,         -- filename in storage, e.g. 'worlds/foresthouse.spz'
  image_file text not null,         -- e.g. 'worlds/foresthouse.jpg'
  music_file text,                  -- e.g. 'music/Sunlit_Grove_Ambient.mp3' (nullable)
  collider_file text,               -- e.g. 'worlds/foresthouse.glb' (nullable, derived from splat_file if null)
  guide text not null default '',
  image_credit text,
  position_x real not null default 0,
  position_y real not null default 0,
  position_z real not null default 0,
  quaternion_x real not null default 0,
  quaternion_y real not null default 0,
  quaternion_z real not null default 0,
  quaternion_w real not null default 1,
  scale real not null default 1,
  spawn_x real,                     -- player spawn position (nullable = use default)
  spawn_y real,
  spawn_z real,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

alter table public.worlds enable row level security;

create policy "Anyone can read worlds"
  on public.worlds for select
  using (true);
`);
  process.exit(0);
}

// ─── --seed: Insert world data ──────────────────────────────
if (command === '--seed') {
  const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('Missing env vars. Example:');
    console.error('  SUPABASE_URL=https://xxx.supabase.co SUPABASE_SERVICE_ROLE_KEY=ey... node scripts/setup-worlds-table.mjs --seed');
    process.exit(1);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false },
  });

  const seedWorlds = [
    {
      id: 'forest-retreat',
      name: 'Forest Retreat',
      splat_file: 'worlds/foresthouse.spz',
      image_file: 'worlds/foresthouse.jpg',
      music_file: 'music/Sunlit_Grove_Ambient.mp3',
      image_credit: 'Kyra_Starr (Pixabay)',
      guide: 'A lush, vibrant natural environment surrounding a rustic wooden house, captured in a painting-like style. A large multi-story wooden house with a weathered roof stands amidst abundant green foliage, with tall trees forming a dense canopy. A pathway winds through the foreground, surrounded by green plants and scattered rocks.',
      sort_order: 0,
    },
    {
      id: 'lofi-seaview',
      name: 'Lofi Seaview',
      splat_file: 'worlds/lofistudy_sunset.spz',
      image_file: 'worlds/lofistudy_sunset.jpg',
      music_file: 'music/Sunset_Focus.mp3',
      guide: 'A cozy, highly detailed anime-style room bathed in sunset hues over a cityscape. A large window offers a panoramic view of a metropolis across water. Bookshelves, computer desk, and a blue sofa create an atmosphere of study and relaxation.',
      sort_order: 1,
    },
    {
      id: 'mainstreet-night',
      name: 'Mainstreet (Night)',
      splat_file: 'worlds/mainstreet_night.spz',
      image_file: 'worlds/mainstreet_night.jpg',
      music_file: 'music/Neon_Night_Reverie.mp3',
      guide: 'A nocturnal city street with vibrant, exaggerated colors. A full moon casts an ethereal glow. Illuminated shop windows and neon signs reflect on wet asphalt. Power lines crisscross the sky between utility poles.',
      sort_order: 2,
    },
    {
      id: 'rural-retreat',
      name: 'Rural Retreat',
      splat_file: 'worlds/paddies.spz',
      image_file: 'worlds/paddies.jpg',
      music_file: 'music/Tranquil_Fields.mp3',
      image_credit: 'Kyra_Starr (Pixabay)',
      guide: 'A tranquil rural landscape in anime style with vibrant colors and soft lighting. A traditional farmhouse stands amid verdant rice paddies. Mountains draped in mist create a majestic backdrop. A winding dirt path meanders through bright green fields.',
      sort_order: 3,
    },
    {
      id: 'simpsons',
      name: 'Simpsons World',
      splat_file: 'worlds/simpsons.spz',
      image_file: 'worlds/simpsons.jpeg',
      music_file: 'music/Cartoon_Cozy_Theme.mp3',
      image_credit: 'Disney',
      guide: 'A cartoon-style domestic interior evoking a classic animated sitcom. An orange three-seater sofa sits centrally with a sailboat painting above. Purple end tables, a turquoise telephone, and arched doorways lead to a yellow kitchen and dining room.',
      sort_order: 4,
    },
    {
      id: 'european-city-sunset',
      name: 'European City (Sunset)',
      splat_file: 'worlds/europeanurban_sunset.spz',
      image_file: 'worlds/europeanurban_sunset.jpg',
      music_file: 'music/Sunset_Boulevard_Serenade.mp3',
      guide: 'A lively urban street in warm sunset glow, rendered in anime style. Buildings with ornate balconies line the street. Power lines crisscross the sky. Green trees and bushes provide vibrant color against warm architectural tones.',
      sort_order: 5,
    },
  ];

  console.log(`Upserting ${seedWorlds.length} worlds...`);

  const { data, error } = await supabase
    .from('worlds')
    .upsert(seedWorlds, { onConflict: 'id' })
    .select('id, name');

  if (error) {
    console.error('Seed failed:', error.message);
    console.error('');
    console.error('If the table does not exist yet, run:');
    console.error('  node scripts/setup-worlds-table.mjs --schema');
    console.error('and paste the output into Supabase SQL Editor first.');
    process.exit(1);
  }

  console.log(`Done! Seeded ${data.length} worlds:`);
  data.forEach((w) => console.log(`  - ${w.id} (${w.name})`));
  console.log('');
  console.log('Next: add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to .env.local');
  process.exit(0);
}

// ─── No command given ───────────────────────────────────────
console.log('Usage:');
console.log('  node scripts/setup-worlds-table.mjs --schema   Print CREATE TABLE SQL');
console.log('  node scripts/setup-worlds-table.mjs --seed     Seed the table with world data');
