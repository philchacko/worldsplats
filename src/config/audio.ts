// Audio configuration
export const AUDIO_CONFIG = {
  MUSIC_VOLUME: 0.3, // 0.0 to 1.0
  MUSIC_FILES: {
    SUNLIT_GROVE: '/music/Sunlit_Grove_Ambient.mp3',
  },
  // Add more configuration as needed
  FADE_DURATION: 1.0, // seconds for fade in/out
} as const;

export type MusicTrack = keyof typeof AUDIO_CONFIG.MUSIC_FILES;
