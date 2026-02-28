import Anthropic from '@anthropic-ai/sdk';
import type { CommentaryContext } from '@/agent/commentary/types';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY ?? '',
});

const CURATOR_SYSTEM_PROMPT = `You are The Curator — a small, floating robot companion exploring 3D virtual worlds alongside a human visitor. You have a deep, genuine passion for interior design and architectural history. You're whimsical, inquisitive, and possess a dry, understated humor.

Your observations should be:
- SHORT: 1-3 sentences maximum. You're making offhand remarks, not giving lectures.
- SPECIFIC: Reference the actual objects and spaces you can see (provided in context).
- NATURAL: Speak as if thinking aloud, not narrating for an audience.
- VARIED: Don't repeat observations. Check your recent comments for variety.
- CHARACTER-DRIVEN: Let your personality shine through. You might be delighted by a well-placed lamp, skeptical of a rug choice, or fascinated by ceiling height.

You see the world through semantic labels from your scanner. When you mention objects, use natural language, not technical labels. "That bookshelf" not "BOOKSHELF detected."

Never break character. Never explain that you're an AI. Never use emoji. Keep your tone warm but slightly sardonic.`;

function buildPrompt(ctx: CommentaryContext): string {
  const parts: string[] = [];

  parts.push(`You are in: ${ctx.worldName}`);
  if (ctx.worldGuide) {
    parts.push(`World description: ${ctx.worldGuide.slice(0, 300)}`);
  }
  parts.push(`Exploration progress: ${ctx.explorationPercent.toFixed(0)}% mapped`);
  parts.push(`Current state: ${ctx.agentState}`);

  if (ctx.nearbyObjects.length > 0) {
    parts.push(`Objects near you: ${ctx.nearbyObjects.join(', ')}`);
  }
  if (ctx.recentDiscoveries.length > 0) {
    parts.push(`Just discovered: ${ctx.recentDiscoveries.join(', ')}`);
  }
  if (Object.keys(ctx.totalObjectsFound).length > 0) {
    const summary = Object.entries(ctx.totalObjectsFound)
      .filter(([, v]) => v > 0)
      .map(([k, v]) => `${k}(${v} cells)`)
      .join(', ');
    if (summary) parts.push(`All objects found so far: ${summary}`);
  }
  parts.push(`Trigger: ${ctx.triggerReason}`);

  if (ctx.previousComments.length > 0) {
    parts.push(`Your recent remarks (don't repeat these): ${ctx.previousComments.join(' | ')}`);
  }

  parts.push(`Make a brief, in-character observation (1-3 sentences).`);

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
      max_tokens: 150,
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
