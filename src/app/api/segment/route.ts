import { fal } from '@fal-ai/client';
import { NextResponse } from 'next/server';

fal.config({ credentials: process.env.FAL_KEY ?? '' });

type FalMask = {
  rle: string;
  score?: number;
  box?: [number, number, number, number];
};

type FalResult = {
  rle?: string | FalMask[];
  metadata?: FalMask[];
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

    // Upload the data URI to fal.ai CDN
    const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');
    const blob = new Blob([buffer], { type: 'image/jpeg' });
    const file = new File([blob], 'snapshot.jpg', { type: 'image/jpeg' });
    const imageUrl = await fal.storage.upload(file);

    // SAM-3 takes a single prompt string; join concepts with commas
    const prompt = concepts.join(', ');

    console.log('[segment] uploaded image:', imageUrl);
    console.log('[segment] prompt:', prompt);

    // Use only documented fields — extras cause 422
    const input: Record<string, unknown> = {
      image_url: imageUrl,
      prompt,
    };

    console.log('[segment] fal input:', JSON.stringify(input));

    const result = await fal.subscribe('fal-ai/sam-3/image-rle', { input });

    console.log('[segment] fal.ai raw response:', JSON.stringify(result.data).slice(0, 500));

    const data = result.data as FalResult;

    // Normalize response — fal may return masks in `rle` (array) or `metadata`
    let masks: FalMask[] = [];
    if (Array.isArray(data.rle)) {
      masks = data.rle;
    } else if (Array.isArray(data.metadata)) {
      masks = data.metadata;
    }

    // Merge top-level scores/boxes if masks don't carry them inline
    const normalized = masks.map((m, i) => ({
      label: concepts[i] ?? prompt,
      rle: typeof m === 'string' ? m : m.rle,
      score: m.score ?? data.scores?.[i] ?? 0,
      box: m.box ?? data.boxes?.[i] ?? [0, 0, 0, 0],
    }));

    return NextResponse.json({ masks: normalized, raw: data });
  } catch (err: unknown) {
    // Extract full error details from fal.ai client errors
    const errObj = err as { message?: string; body?: unknown; status?: number };
    console.error('[segment] fal.ai error:', {
      message: errObj.message,
      status: errObj.status,
      body: errObj.body,
      full: JSON.stringify(err, Object.getOwnPropertyNames(err as object)).slice(0, 1000),
    });
    return NextResponse.json(
      { error: errObj.message ?? String(err), body: errObj.body },
      { status: 502 },
    );
  }
}
