import { fal } from '@fal-ai/client';
import { NextResponse } from 'next/server';

fal.config({ credentials: process.env.FAL_KEY ?? '' });

type FalResult = {
  rle?: string;
  metadata?: unknown[];
  scores?: number[];
  boxes?: [number, number, number, number][];
};

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

    // Upload the data URI to fal.ai CDN (once, shared across all concept calls)
    const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');
    const blob = new Blob([buffer], { type: 'image/jpeg' });
    const file = new File([blob], 'snapshot.jpg', { type: 'image/jpeg' });
    const imageUrl = await fal.storage.upload(file);

    console.log('[segment] uploaded image:', imageUrl);
    console.log('[segment] concepts:', concepts);

    // SAM-3 prompt is for a SINGLE concept — run one call per concept in parallel
    const results = await Promise.allSettled(
      concepts.map(async (concept) => {
        const result = await fal.subscribe('fal-ai/sam-3/image-rle', {
          input: { image_url: imageUrl, prompt: concept },
        });
        const data = result.data as FalResult;
        console.log(`[segment] "${concept}" →`, JSON.stringify(data).slice(0, 200));
        return { concept, data };
      }),
    );

    // Collect successful masks
    const masks: { label: string; rle: string; score: number; box: [number, number, number, number] }[] = [];

    for (const r of results) {
      if (r.status === 'rejected') {
        // 422 "no masks" is expected for concepts not present in the image
        const err = r.reason as { status?: number; body?: { detail?: string } };
        if (err.status === 422) {
          console.log(`[segment] no mask for concept (expected):`, err.body?.detail);
          continue;
        }
        console.error('[segment] unexpected error for concept:', err);
        continue;
      }

      const { concept, data } = r.value;
      // RLE response: data.rle is a string (single mask per concept call)
      if (typeof data.rle === 'string') {
        masks.push({
          label: concept,
          rle: data.rle,
          score: data.scores?.[0] ?? 1,
          box: data.boxes?.[0] ?? [0, 0, 0, 0],
        });
      }
    }

    console.log(`[segment] ${masks.length}/${concepts.length} concepts matched`);

    return NextResponse.json({ masks });
  } catch (err: unknown) {
    const errObj = err as { message?: string; body?: { detail?: string }; status?: number };
    console.error('[segment] fal.ai error:', {
      message: errObj.message,
      status: errObj.status,
      body: errObj.body,
    });
    return NextResponse.json(
      { error: errObj.message ?? String(err), body: errObj.body },
      { status: 502 },
    );
  }
}
