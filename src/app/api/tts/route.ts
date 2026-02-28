/**
 * ElevenLabs TTS streaming proxy.
 * Accepts text + voiceId, returns streamed MP3 audio.
 * API key stays server-side.
 */
export async function POST(request: Request) {
  try {
    if (!process.env.ELEVENLABS_API_KEY) {
      return new Response(JSON.stringify({ error: 'ELEVENLABS_API_KEY not configured' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const { text, voiceId } = (await request.json()) as {
      text: string;
      voiceId: string;
    };

    if (!text || !voiceId) {
      return new Response(JSON.stringify({ error: 'text and voiceId are required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const elevenResponse = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'xi-api-key': process.env.ELEVENLABS_API_KEY,
        },
        body: JSON.stringify({
          text,
          model_id: 'eleven_turbo_v2_5',
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
            style: 0.3,
          },
          output_format: 'mp3_44100_128',
        }),
      },
    );

    if (!elevenResponse.ok) {
      const errText = await elevenResponse.text();
      console.error('[tts] ElevenLabs error:', elevenResponse.status, errText);
      return new Response(
        JSON.stringify({ error: `ElevenLabs returned ${elevenResponse.status}`, detail: errText }),
        { status: 502, headers: { 'Content-Type': 'application/json' } },
      );
    }

    // Pipe the audio stream directly to the client
    return new Response(elevenResponse.body, {
      headers: {
        'Content-Type': 'audio/mpeg',
        'Cache-Control': 'no-cache',
      },
    });
  } catch (err: unknown) {
    const errObj = err as { message?: string };
    console.error('[tts] error:', errObj.message ?? err);
    return new Response(
      JSON.stringify({ error: errObj.message ?? String(err) }),
      { status: 502, headers: { 'Content-Type': 'application/json' } },
    );
  }
}
