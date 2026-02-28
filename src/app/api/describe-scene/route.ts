/**
 * Scene description API route — sends a screenshot to Gemini 3.1 Flash Image
 * via Vertex AI and returns a rich natural-language description of the scene.
 *
 * Uses Application Default Credentials (ADC) for Vertex AI auth.
 * Requires: GOOGLE_CLOUD_PROJECT, optionally GOOGLE_CLOUD_LOCATION.
 */
import { GoogleGenAI } from '@google/genai';

const MODEL_ID = 'gemini-3.1-flash-image-preview';

const SCENE_ANALYSIS_PROMPT = `You are an expert interior design analyst with deep knowledge of architectural history, furniture styles, and spatial composition. Analyze this screenshot of a 3D virtual space.

Describe what you see in 2-4 concise sentences, focusing on:
- Specific furniture and objects (style, material, color, era)
- Architectural features (ceiling height, windows, doors, floor material)
- Spatial composition and layout (symmetry, flow, focal points)
- Lighting quality and atmosphere
- Design style or era (mid-century modern, art deco, minimalist, etc.)
- Any notable or unusual details

Be specific and observational — mention actual colors, materials, and spatial relationships. Don't be generic. Write as factual notes, not flowery prose.`;

let _client: GoogleGenAI | null = null;

function getClient(): GoogleGenAI | null {
  if (_client) return _client;

  const project = process.env.GOOGLE_CLOUD_PROJECT;
  if (!project) return null;

  _client = new GoogleGenAI({
    vertexai: true,
    project,
    location: process.env.GOOGLE_CLOUD_LOCATION || 'us-central1',
  });
  return _client;
}

export async function POST(request: Request) {
  try {
    const client = getClient();
    if (!client) {
      return new Response(
        JSON.stringify({ error: 'GOOGLE_CLOUD_PROJECT not configured' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } },
      );
    }

    const { imageBase64, worldName } = (await request.json()) as {
      imageBase64: string;
      worldName?: string;
    };

    if (!imageBase64) {
      return new Response(
        JSON.stringify({ error: 'imageBase64 is required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } },
      );
    }

    // Strip data URI prefix if present
    const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '');

    const locationHint = worldName ? `\nThis space is called "${worldName}".` : '';

    const response = await client.models.generateContent({
      model: MODEL_ID,
      contents: [
        {
          role: 'user',
          parts: [
            {
              inlineData: {
                mimeType: 'image/jpeg',
                data: base64Data,
              },
            },
            {
              text: SCENE_ANALYSIS_PROMPT + locationHint,
            },
          ],
        },
      ],
      config: {
        maxOutputTokens: 300,
        temperature: 0.4,
      },
    });

    const description = response.text?.trim() ?? '';

    return new Response(
      JSON.stringify({ description }),
      { headers: { 'Content-Type': 'application/json' } },
    );
  } catch (err: unknown) {
    const errObj = err as { message?: string };
    console.error('[describe-scene] error:', errObj.message ?? err);
    return new Response(
      JSON.stringify({ error: errObj.message ?? String(err) }),
      { status: 502, headers: { 'Content-Type': 'application/json' } },
    );
  }
}
