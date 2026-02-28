/**
 * TTSPlayer — plays streamed MP3 audio through the Web Audio API.
 *
 * Integrates with the app's existing AudioContext + masterGain
 * so the mute button and gain controls work for narration too.
 */
export class TTSPlayer {
  private audioContext: AudioContext;
  private speechGain: GainNode;
  private _speaking = false;
  private abortController: AbortController | null = null;
  /** Currently-playing source node — tracked so cancel() can stop mid-sentence audio. */
  private activeSource: AudioBufferSourceNode | null = null;

  constructor(audioContext: AudioContext, masterGain: GainNode) {
    this.audioContext = audioContext;
    this.speechGain = audioContext.createGain();
    this.speechGain.gain.setValueAtTime(1.0, audioContext.currentTime);
    this.speechGain.connect(masterGain);
  }

  get isSpeaking(): boolean {
    return this._speaking;
  }

  /**
   * Play an MP3 ArrayBuffer through the Web Audio API.
   * Resolves when playback finishes.
   */
  async playChunk(mp3Data: ArrayBuffer): Promise<void> {
    // decodeAudioData consumes the buffer, so slice a copy
    const buffer = await this.audioContext.decodeAudioData(mp3Data.slice(0));
    const source = this.audioContext.createBufferSource();
    source.buffer = buffer;
    source.connect(this.speechGain);

    this.activeSource = source;
    return new Promise<void>((resolve) => {
      source.onended = () => {
        if (this.activeSource === source) this.activeSource = null;
        resolve();
      };
      source.start();
    });
  }

  /**
   * Speak a full narration: fetches TTS for each sentence and plays sequentially.
   * Returns the full text that was spoken.
   */
  async speak(text: string, voiceId: string): Promise<string> {
    if (this._speaking) return '';

    this._speaking = true;
    this.abortController = new AbortController();
    const signal = this.abortController.signal;

    try {
      // Split into sentences
      const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];

      for (const sentence of sentences) {
        if (signal.aborted) break;
        const trimmed = sentence.trim();
        if (!trimmed) continue;

        const response = await fetch('/api/tts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: trimmed, voiceId }),
          signal,
        });

        if (!response.ok) {
          console.warn('[TTSPlayer] TTS request failed:', response.status);
          continue;
        }

        const audioData = await response.arrayBuffer();
        if (signal.aborted) break;

        await this.playChunk(audioData);
      }

      return text;
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        console.log('[TTSPlayer] speech cancelled');
        return '';
      }
      throw err;
    } finally {
      this._speaking = false;
      this.abortController = null;
    }
  }

  /** Cancel any in-flight speech and stop audio that's currently playing. */
  cancel(): void {
    this.abortController?.abort();
    // Stop the active audio source mid-playback so narration cuts immediately
    if (this.activeSource) {
      try { this.activeSource.stop(); } catch { /* already stopped */ }
      this.activeSource = null;
    }
  }

  dispose(): void {
    this.cancel();
    this.speechGain.disconnect();
  }
}
