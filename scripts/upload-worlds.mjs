#!/usr/bin/env node
/**
 * Uploads worlds from the forupload/ folder to Supabase Storage and inserts
 * rows into the `worlds` table.
 *
 * For each .spz file it:
 *   1. Finds the matching _collider.glb file
 *   2. Slugifies the name for clean URLs
 *   3. Uploads  <slug>.spz  and  <slug>.glb  to the `assets` bucket under worlds/
 *   4. Upserts a row in the `worlds` table
 *
 * Usage:
 *   node scripts/upload-worlds.mjs                    # dry-run (list what would happen)
 *   node scripts/upload-worlds.mjs --upload           # upload files + upsert DB rows
 *   node scripts/upload-worlds.mjs --upload --force   # re-upload even if file exists
 *
 * Env vars (reads from .env.local automatically):
 *   NEXT_PUBLIC_SUPABASE_URL   — Supabase project URL
 *   SUPABASE_SERVICE_ROLE_KEY  — service role key (needed for storage uploads + DB writes)
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync, readdirSync, existsSync } from 'fs';
import { join, basename } from 'path';

// ─── Load .env.local ────────────────────────────────────────
function loadEnv() {
  const envPath = join(process.cwd(), '.env.local');
  if (!existsSync(envPath)) return;
  const lines = readFileSync(envPath, 'utf-8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim();
    if (!process.env[key]) process.env[key] = val;
  }
}
loadEnv();

// ─── Config ─────────────────────────────────────────────────
const FOLDER = join(process.cwd(), 'forupload');
const BUCKET = 'assets';
const STORAGE_PREFIX = 'worlds'; // files go into assets/worlds/<slug>.spz

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const args = process.argv.slice(2);
const doUpload = args.includes('--upload');
const force = args.includes('--force');

// ─── Helpers ────────────────────────────────────────────────

/** Turn a display name into a URL-safe slug. */
function slugify(name) {
  return name
    .toLowerCase()
    .replace(/['']/g, '')          // remove apostrophes
    .replace(/[^a-z0-9]+/g, '-')   // non-alphanum → dash
    .replace(/^-+|-+$/g, '');      // trim leading/trailing dashes
}

/**
 * Parse a .spz filename into { displayName, slug, variant }.
 * "Rustic Farmhouse Kitchen Interior (1).spz"
 *   → { displayName: "Rustic Farmhouse Kitchen Interior 1", slug: "rustic-farmhouse-kitchen-interior-1", variant: " (1)" }
 * "Cozy Winter Cabin Interior.spz"
 *   → { displayName: "Cozy Winter Cabin Interior", slug: "cozy-winter-cabin-interior", variant: "" }
 */
function parseSPZ(filename) {
  const withoutExt = filename.replace(/\.spz$/, '');
  const variantMatch = withoutExt.match(/\s*\((\d+)\)$/);
  const variant = variantMatch ? variantMatch[0] : '';
  const baseName = variantMatch ? withoutExt.slice(0, -variant.length) : withoutExt;
  const displayName = variantMatch
    ? `${baseName} ${variantMatch[1]}`
    : baseName;
  return {
    displayName,
    slug: slugify(displayName),
    variant,
    baseName,
  };
}

/**
 * Derive the expected collider filename from a .spz filename.
 * "Name (1).spz" → "Name_collider (1).glb"
 * "Name.spz" → "Name_collider.glb"
 */
function colliderFilename(spzFilename) {
  const withoutExt = spzFilename.replace(/\.spz$/, '');
  const variantMatch = withoutExt.match(/(\s*\(\d+\))$/);
  if (variantMatch) {
    const base = withoutExt.slice(0, -variantMatch[1].length);
    return `${base}_collider${variantMatch[1]}.glb`;
  }
  return `${withoutExt}_collider.glb`;
}

// ─── Scan folder ────────────────────────────────────────────
const allFiles = readdirSync(FOLDER);
const spzFiles = allFiles
  .filter((f) => f.endsWith('.spz'))
  .sort((a, b) => a.localeCompare(b));

console.log(`Found ${spzFiles.length} .spz files in forupload/\n`);

// Build the plan
const plan = [];
const seenSlugs = new Set();

for (const spzFile of spzFiles) {
  const parsed = parseSPZ(spzFile);
  const collider = colliderFilename(spzFile);
  const hasCollider = allFiles.includes(collider);

  // Handle slug collisions (shouldn't happen but just in case)
  let slug = parsed.slug;
  if (seenSlugs.has(slug)) {
    let i = 2;
    while (seenSlugs.has(`${slug}-v${i}`)) i++;
    slug = `${slug}-v${i}`;
  }
  seenSlugs.add(slug);

  plan.push({
    spzFile,
    colliderFile: hasCollider ? collider : null,
    displayName: parsed.displayName,
    slug,
    storageSPZ: `${STORAGE_PREFIX}/${slug}.spz`,
    storageGLB: hasCollider ? `${STORAGE_PREFIX}/${slug}.glb` : null,
  });
}

// ─── Dry-run output ─────────────────────────────────────────
if (!doUpload) {
  console.log('DRY RUN — pass --upload to actually upload\n');
  const missing = plan.filter((p) => !p.colliderFile);
  if (missing.length) {
    console.log(`⚠ ${missing.length} worlds missing collider files:`);
    missing.forEach((p) => console.log(`  - ${p.spzFile}`));
    console.log('');
  }
  for (const p of plan) {
    console.log(`${p.displayName}`);
    console.log(`  id:      ${p.slug}`);
    console.log(`  spz:     ${p.spzFile}  →  ${p.storageSPZ}`);
    if (p.storageGLB) {
      console.log(`  collider: ${p.colliderFile}  →  ${p.storageGLB}`);
    } else {
      console.log(`  collider: MISSING`);
    }
    console.log('');
  }
  console.log(`Total: ${plan.length} worlds`);
  process.exit(0);
}

// ─── Upload ─────────────────────────────────────────────────
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  console.error('Set them in .env.local or as env vars.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false },
});

async function uploadFile(localPath, storagePath, contentType) {
  const buffer = readFileSync(localPath);

  if (!force) {
    // Check if file already exists
    const { data: existing } = await supabase.storage
      .from(BUCKET)
      .list(STORAGE_PREFIX, {
        search: basename(storagePath),
      });
    if (existing && existing.some((f) => f.name === basename(storagePath))) {
      console.log(`  ⏭  ${storagePath} (already exists, use --force to overwrite)`);
      return true;
    }
  }

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, buffer, {
      contentType,
      upsert: force,
    });

  if (error) {
    // If it's a duplicate error and we're not forcing, treat as skip
    if (error.message?.includes('already exists') || error.statusCode === '409' || error.message?.includes('Duplicate')) {
      console.log(`  ⏭  ${storagePath} (already exists)`);
      return true;
    }
    console.error(`  ✗  ${storagePath}: ${error.message}`);
    return false;
  }

  console.log(`  ✓  ${storagePath}`);
  return true;
}

let uploaded = 0;
let failed = 0;
const dbRows = [];

for (let i = 0; i < plan.length; i++) {
  const p = plan[i];
  console.log(`\n[${i + 1}/${plan.length}] ${p.displayName}`);

  // Upload .spz
  const spzOk = await uploadFile(
    join(FOLDER, p.spzFile),
    p.storageSPZ,
    'application/octet-stream'
  );

  // Upload collider .glb
  let glbOk = true;
  if (p.colliderFile && p.storageGLB) {
    glbOk = await uploadFile(
      join(FOLDER, p.colliderFile),
      p.storageGLB,
      'model/gltf-binary'
    );
  }

  if (spzOk) {
    uploaded++;
    dbRows.push({
      id: p.slug,
      name: p.displayName,
      splat_file: p.storageSPZ,
      image_file: '',  // no thumbnails yet
      music_file: null, // random from pool
      collider_file: p.storageGLB || null,
      guide: '',
      sort_order: 100 + i, // after the original 6 worlds (0-5)
    });
  } else {
    failed++;
  }
}

console.log(`\n─── Storage upload complete ───`);
console.log(`  Uploaded: ${uploaded}    Failed: ${failed}\n`);

// ─── Upsert DB rows ────────────────────────────────────────
if (dbRows.length > 0) {
  console.log(`Upserting ${dbRows.length} worlds into DB...`);

  // Supabase has a row limit per request; batch in groups of 50
  const BATCH = 50;
  let dbOk = 0;
  let dbFail = 0;

  for (let i = 0; i < dbRows.length; i += BATCH) {
    const batch = dbRows.slice(i, i + BATCH);
    const { data, error } = await supabase
      .from('worlds')
      .upsert(batch, { onConflict: 'id' })
      .select('id');

    if (error) {
      console.error(`  DB batch ${i}-${i + batch.length}: ${error.message}`);
      dbFail += batch.length;
    } else {
      dbOk += data.length;
    }
  }

  console.log(`  DB rows upserted: ${dbOk}    Failed: ${dbFail}`);
}

console.log('\nDone!');
