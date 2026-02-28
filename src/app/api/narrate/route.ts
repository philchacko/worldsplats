import Anthropic from '@anthropic-ai/sdk';
import type { CommentaryContext } from '@/agent/commentary/types';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY ?? '',
});

const CURATOR_SYSTEM_PROMPT = `You are The Curator — a small, floating robot companion exploring 3D virtual worlds alongside a human visitor. You have a deep, genuine passion for interior design and architectural history. You're whimsical, inquisitive, and possess a dry, understated humor.

Your observations should be:
- SHORT: 1-2 sentences. You're making offhand remarks, not giving lectures.
- SPECIFIC: Only reference objects your scanner has actually detected (provided in context). Don't invent objects that aren't listed.
- NATURAL: Speak as if thinking aloud. You're discovering this space in real time.
- VARIED: Don't repeat observations. Check your recent comments for variety.
- CHARACTER-DRIVEN: Let your personality shine through. You might be delighted by a well-placed lamp, skeptical of a rug choice, or fascinated by an unusual pairing of objects.

CRITICAL FORMAT RULE: Your output will be spoken aloud via text-to-speech. Write ONLY the words to be spoken. Never include:
- Stage directions or actions in asterisks (*looks around*, *drifts closer*)
- Parenthetical notes or asides in parentheses
- Quotation marks around your own speech
- Any non-speech text whatsoever

You have two information sources:
1. SCANNER DATA: semantic labels and cell counts of objects your scanner has detected (e.g. lamp, sofa, table).
2. VISION ANALYSIS: a rich description from your visual processor that picks up colors, materials, architectural style, and spatial details your scanner labels can't capture.

Use both sources together. The scanner tells you WHAT objects are present; the vision analysis tells you HOW they look. Reference specific details from the vision analysis — colors, materials, design era — to make your observations vivid and grounded. When you mention objects, use natural language, not technical labels.

Never break character. Never explain that you're an AI. Never use emoji.`;

function buildPrompt(ctx: CommentaryContext): string {
  const parts: string[] = [];

  parts.push(`Location: ${ctx.worldName}`);
  parts.push(`Exploration progress: ${ctx.explorationPercent.toFixed(0)}% mapped`);

  // Nearby objects with density info — higher cell counts = more prominent objects
  if (ctx.nearbyObjectCounts && Object.keys(ctx.nearbyObjectCounts).length > 0) {
    const sorted = Object.entries(ctx.nearbyObjectCounts)
      .sort(([, a], [, b]) => b - a);
    const detail = sorted.map(([k, v]) => {
      if (v > 100) return `${k} (dominant, ${v} cells)`;
      if (v > 30) return `${k} (prominent, ${v} cells)`;
      return `${k} (${v} cells)`;
    });
    parts.push(`Scanner detects nearby: ${detail.join(', ')}`);
  } else if (ctx.nearbyObjects.length > 0) {
    parts.push(`Scanner detects nearby: ${ctx.nearbyObjects.join(', ')}`);
  }

  if (ctx.recentDiscoveries.length > 0) {
    parts.push(`Just discovered: ${ctx.recentDiscoveries.join(', ')}`);
  }
  if (Object.keys(ctx.totalObjectsFound).length > 0) {
    const summary = Object.entries(ctx.totalObjectsFound)
      .filter(([, v]) => v > 0)
      .sort(([, a], [, b]) => b - a)
      .map(([k, v]) => `${k}(${v})`)
      .join(', ');
    if (summary) parts.push(`All objects found so far: ${summary}`);
  }
  // Rich vision analysis from Gemini (colors, materials, architectural detail)
  if (ctx.sceneDescription) {
    parts.push(`Vision analysis: ${ctx.sceneDescription}`);
  }

  parts.push(`Trigger: ${ctx.triggerReason}`);

  if (ctx.previousComments.length > 0) {
    parts.push(`Your recent remarks (don't repeat): ${ctx.previousComments.join(' | ')}`);
  }

  // Tailor the final instruction to the trigger type
  if (ctx.triggerReason.startsWith('First look')) {
    parts.push(`Give a brief, curious first reaction to arriving in this space. 1 sentence. Base it only on what your scanner shows, not background knowledge.`);
  } else {
    parts.push(`Make a brief, in-character observation (1-2 sentences). React to what your scanner has picked up — comment on placement, style, or how objects relate to each other. Only spoken words, no stage directions.`);
  }

  return parts.join('\n');
}

export async function POST(request: Request) {
  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      return new Response(JSON.stringify({ error: 'ANTHROPIC_API_KEY not configured' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const { context } = (await request.json()) as { context: CommentaryContext };
    if (!context) {
      return new Response(JSON.stringify({ error: 'context is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const userMessage = buildPrompt(context);

    const stream = anthropic.messages.stream({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 120,
      system: CURATOR_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage }],
    });

    // Stream text chunks back to client
    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        try {
          for await (const event of stream) {
            if (
              event.type === 'content_block_delta' &&
              event.delta.type === 'text_delta'
            ) {
              controller.enqueue(encoder.encode(event.delta.text));
            }
          }
          controller.close();
        } catch (err) {
          console.error('[narrate] stream error:', err);
          controller.close();
        }
      },
    });

    return new Response(readable, {
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  } catch (err: unknown) {
    const errObj = err as { message?: string };
    console.error('[narrate] error:', errObj.message ?? err);
    return new Response(
      JSON.stringify({ error: errObj.message ?? String(err) }),
      { status: 502, headers: { 'Content-Type': 'application/json' } },
    );
  }
}
