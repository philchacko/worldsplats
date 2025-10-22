# Audio System Documentation

## Overview

The audio system is built using React Context/Provider architecture to manage Web Audio API as a singleton. It handles background music loading, playback, and volume control.

## Architecture

### Components

1. **AudioProvider** (`src/providers/audio.tsx`)
   - Manages AudioContext singleton
   - Handles audio buffer caching
   - Provides music playback API
   - Handles mobile Safari audio quirks

2. **Audio Config** (`src/config/audio.ts`)
   - Centralized audio configuration
   - Music file paths
   - Volume settings

## Usage

### Playing Music

```tsx
import { useAudio } from '@/providers/audio';

function MyComponent() {
  const { init, playMusic, stopMusic, muted, setMuted } = useAudio();

  const handlePlay = async () => {
    // Must call init() in a user gesture first (browser requirement)
    await init();
    // Then play any track
    await playMusic('SUNLIT_GROVE');
  };

  return (
    <button onClick={handlePlay}>Play Music</button>
  );
}
```

### API Reference

```typescript
type AudioAPI = {
  audioContext: AudioContext | null;
  init: () => Promise<AudioContext>;      // Initialize audio (call in user gesture)
  muted: boolean;                         // Current mute state
  setMuted: (m: boolean) => void;        // Toggle mute
  playMusic: (track: MusicTrack) => Promise<void>; // Play background music
  stopMusic: () => void;                  // Stop current music
  isLoading: boolean;                     // Music loading state
  currentTrack: MusicTrack | null;       // Currently playing track
};
```

### Adding New Music Tracks

1. Add MP3 file to `/public/music/`
2. Update `src/config/audio.ts`:

```typescript
export const AUDIO_CONFIG = {
  MUSIC_FILES: {
    SUNLIT_GROVE: '/music/Sunlit_Grove_Ambient.mp3',
    NEW_TRACK: '/music/new_track.mp3', // Add here
  },
  // ...
} as const;
```

3. Use the new track:

```typescript
await playMusic('NEW_TRACK');
```

## Features

- ✅ Automatic buffer caching (files load only once)
- ✅ Looping background music
- ✅ Volume control via mute toggle
- ✅ Mobile Safari support (context resume on visibility change)
- ✅ Graceful error handling
- ✅ TypeScript type safety for track names

## Current Implementation

- **Audio initialization is independent of pointer lock** - music can play while browsing UI
- **Music attempts to auto-play on page load**
  - Modern browsers typically block auto-play without user interaction
  - If blocked, music will start when user clicks "Click to play" or any other user interaction
  - Once initialized, music plays automatically
- Music auto-plays when audio context is initialized
- Mute button in top-right controls volume (toggles mute/unmute)
- Music loops continuously until stopped
- Default volume: 0.3 (30%)

## Mobile Considerations

- AudioContext must be initialized in a user gesture (handled in ClickToPlay)
- iOS Safari requires context resume after tab switches (handled automatically)
- Context state is checked and resumed when needed

## Future Enhancements

- Sound effects API (bounce sounds, voice samples, etc.)
- Volume slider (not just mute/unmute)
- Fade in/out transitions
- Multiple simultaneous sounds with mixing
- Audio visualization
