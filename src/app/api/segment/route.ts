import { fal } from '@fal-ai/client';
import { NextResponse } from 'next/server';

fal.config({ credentials: process.env.FAL_KEY ?? '' });

type FalResult = {
  rle?: string;
  metadata?: unknown[];
  scores?: number[];
  boxes?: [number, number, number, number][];
};

type MaskOut = {
  label: string;
  rle: string;
  score: number;
  box: [number, number, number, number];
};

/**
 * Try a single comma-separated prompt with return_multiple_masks.
 * This costs $0.005 total vs $0.005 × N for per-concept calls.
 * Returns null if SAM-3 rejects it (422) so caller can fall back.
 */
async function tryBatchCall(
  imageUrl: string,
  concepts: string[],
): Promise<MaskOut[] | null> {
  try {
    const result = await fal.subscribe('fal-ai/sam-3/image-rle', {
      input: {
        image_url: imageUrl,
        prompt: concepts.join(', '),
        return_multiple_masks: true,
        max_masks: concepts.length,
        include_scores: true,
        include_boxes: true,
      },
    });
    const data = result.data as FalResult;
    console.log('[segment:batch] raw response keys:', Object.keys(data));
    console.log('[segment:batch] rle type:', typeof data.rle, 'scores:', data.scores?.length, 'boxes:', data.boxes?.length);

    // Batch mode returns a single RLE string (union mask) — not per-concept.
    // If we got scores/boxes arrays, those correspond to individual detections.
    if (typeof data.rle === 'string' && data.scores && data.boxes) {
      const masks: MaskOut[] = [];
      const count = Math.min(data.scores.length, data.boxes.length);
      for (let i = 0; i < count; i++) {
        masks.push({
          // Batch mode doesn't label which concept each mask belongs to.
          // Use box position + score; we'll refine labeling later.
          label: `detection_${i}`,
          rle: data.rle, // single union RLE for now
          score: data.scores[i],
          box: data.boxes[i],
        });
      }
      if (masks.length > 0) return masks;
    }
    return null;
  } catch (err: unknown) {
    const e = err as { status?: number; body?: { detail?: string } };
    if (e.status === 422) {
      console.log('[segment:batch] batch call returned 422, falling back to per-concept');
      return null;
    }
    throw err;
  }
}

/**
 * Per-concept calls — reliable but costs $0.005 × N.
 * Each concept gets its own labeled mask.
 */
async function perConceptCalls(
  imageUrl: string,
  concepts: string[],
): Promise<MaskOut[]> {
  const results = await Promise.allSettled(
    concepts.map(async (concept) => {
      const result = await fal.subscribe('fal-ai/sam-3/image-rle', {
        input: { image_url: imageUrl, prompt: concept },
      });
      const data = result.data as FalResult;
      console.log(`[segment:per] "${concept}" → rle:${typeof data.rle === 'string' ? data.rle.length + 'chars' : 'none'}`);
      return { concept, data };
    }),
  );

  const masks: MaskOut[] = [];
  for (const r of results) {
    if (r.status === 'rejected') {
      const err = r.reason as { status?: number; body?: { detail?: string } };
      if (err.status === 422) continue; // concept not in image
      console.error('[segment:per] unexpected error:', err);
      continue;
    }
    const { concept, data } = r.value;
    if (typeof data.rle === 'string') {
      masks.push({
        label: concept,
        rle: data.rle,
        score: data.scores?.[0] ?? 1,
        box: data.boxes?.[0] ?? [0, 0, 0, 0],
      });
    }
  }
  return masks;
}

export async function POST(request: Request) {
  try {
    const { imageBase64, concepts } = (await request.json()) as {
      imageBase64: string;
      concepts: string[];
    };

    if (!imageBase64 || !concepts?.length) {
      return NextResponse.json(
        { error: 'imageBase64 and concepts[] are required' },
        { status: 400 },
      );
    }

    if (!process.env.FAL_KEY) {
      return NextResponse.json(
        { error: 'FAL_KEY not configured on server' },
        { status: 500 },
      );
    }

    // Upload once, shared across all calls
    const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');
    const blob = new Blob([buffer], { type: 'image/jpeg' });
    const file = new File([blob], 'snapshot.jpg', { type: 'image/jpeg' });
    const imageUrl = await fal.storage.upload(file);
    console.log('[segment] uploaded:', imageUrl, 'concepts:', concepts);

    // Strategy: try batch first ($0.005), fall back to per-concept ($0.005 × N)
    let masks = await tryBatchCall(imageUrl, concepts);
    const strategy = masks ? 'batch' : 'per-concept';

    if (!masks) {
      masks = await perConceptCalls(imageUrl, concepts);
    }

    console.log(`[segment] ${masks.length}/${concepts.length} masks via ${strategy}`);
    return NextResponse.json({ masks, strategy });
  } catch (err: unknown) {
    const errObj = err as { message?: string; body?: { detail?: string }; status?: number };
    console.error('[segment] error:', errObj.message, errObj.body);
    return NextResponse.json(
      { error: errObj.message ?? String(err), body: errObj.body },
      { status: 502 },
    );
  }
}
