# Philc Worlds

A 3D world exploration experience using Gaussian Splatting technology. Navigate through multiple immersive environments with real-time physics and dynamic background music.

Thank you to World Labs for beta access to their world generator, and @bmild for sample code to bootstrap Spark.js with React Three Fiber.

## Features

- **Gaussian Splat Rendering** - Real-time rendering of photorealistic 3D environments using Spark.js
- **Multiple Worlds** - 6 unique environments to explore, each with its own atmosphere and music
- **Dynamic Audio System** - Automatic background music switching with fade transitions
- **Mobile Support** - Touch controls with virtual joystick for mobile devices
- **Physics Simulation** - Rapier physics engine for realistic interactions
- **Responsive UI** - Adaptive interface that works on desktop and mobile

## Getting Started

### Prerequisites

- Node.js 18+
- npm, yarn, pnpm, or bun

### Installation

```bash
npm install
```

### Development

Run the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to view the app.

### Build

Create an optimized production build:

```bash
npm run build
```

Start the production server:

```bash
npm start
```

## Controls

### Desktop

- **WASD** - Move camera (forward/left/back/right)
- **Mouse** - Look around (pointer lock mode)
- **Q/E or ←/→** - Navigate between worlds
- **Space** - Shoot projectile (when implemented)
- **ESC** - Exit pointer lock mode

### Mobile

- **Virtual Joystick** - Move camera (bottom-left)
- **Touch Drag** - Look around
- **UI Buttons** - Navigate between worlds

## Audio System

The app features an automatic background music system:

- Each world has its own unique music track
- Music fades smoothly when switching between worlds
- Audio is initialized on first user interaction (browser requirement)
- Mute/unmute toggle available in top-right corner
- Audio context automatically resumes on mobile Safari

## Project Structure

```
src/
├── app/
│   └── page.tsx                    # Main page with layout and state
├── components/
│   ├── scene/
│   │   ├── WorldScene.tsx          # 3D canvas and scene setup
│   │   └── PointerLockBridge.tsx   # Pointer lock integration
│   ├── spark/
│   │   ├── SparkLayer.tsx          # Spark renderer integration
│   │   └── SplatWorld.tsx          # Splat file loader
│   ├── controls/
│   │   ├── PlayerController.tsx    # WASD camera movement
│   │   ├── TouchLookController.tsx # Touch-based camera rotation
│   │   ├── VirtualStick.tsx        # Mobile joystick
│   │   └── MobileHud.tsx           # Mobile control overlay
│   ├── hud/
│   │   ├── NavHeader.tsx           # World navigation UI
│   │   ├── Button.tsx              # Button components
│   │   └── ClickToPlay.tsx         # Reticle component
│   └── environment/
│       └── Floor.tsx               # Collision floor
├── providers/
│   ├── audio.tsx                   # Audio context provider
│   └── pointerLock.tsx             # Pointer lock provider
├── data/
│   └── presets.ts                  # World and object definitions
├── config/
│   └── audio.ts                    # Audio configuration
└── physics/
    └── RapierProvider.tsx          # Physics context provider
```

## Tech Stack

- **Next.js 15** - React framework with Turbopack
- **React 19** - UI library
- **Three.js** - 3D graphics library
- **@react-three/fiber** - React renderer for Three.js
- **@react-three/rapier** - Physics engine integration
- **@sparkjsdev/spark** - Gaussian Splatting renderer
- **Tailwind CSS** - Utility-first CSS framework
- **TypeScript** - Type-safe JavaScript

## Architecture

### Audio System

The audio system uses React Context to provide a singleton AudioContext:

- `AudioProvider` manages audio state and playback
- Buffer caching for efficient loading
- Automatic music switching based on current world
- Support for queuing music before user interaction
- Master gain node for mute/unmute control

### Layout

The layout uses a layered approach:

1. **3D Canvas** (background layer) - Fills entire viewport for immersive exploration
2. **Overlay UI** (top layer) - Positioned at top center with pointer-events management
3. **Mobile Controls** (overlay layer) - Virtual joystick and buttons
4. **HUD Elements** - Reticle, mute button, loading states

### Mobile Support

Touch controls are implemented separately from pointer lock:

- `TouchLookController` - Touch-based camera rotation
- `VirtualStick` - On-screen joystick for movement
- `MobileHud` - Container for mobile-specific UI
- Touch-action CSS prevents page scrolling during gameplay

## Configuration

### Adding New Worlds

1. Add `.spz` or `.ply` file to `/public/worlds/`
2. Add preview image to `/public/worlds/`
3. Add music file to `/public/music/`
4. Update `src/data/presets.ts`:

```typescript
{
  id: 'my-world',
  name: 'My World',
  url: '/worlds/myworld.spz',
  imageUrl: '/worlds/myworld.jpg',
  musicUrl: '/music/myworld.mp3',
  position: [0, 0, 0],
  quaternion: [0, 0, 0, 1],
  scale: [1, 1, 1],
  guide: 'Description of your world...',
  imageCredit: 'Photo credit (optional)'
}
```

## Performance

- Mobile DPR capped at 1.0 for better performance
- Desktop DPR capped at 1.5
- Antialiasing disabled for splat rendering
- Audio buffers cached to avoid re-downloading
- Passive event listeners for touch events

## Browser Support

- Modern browsers with WebGL 2.0 support
- Pointer Lock API (desktop)
- Web Audio API
- Touch Events API (mobile)
- iOS Safari with motion permission handling

## Contributing

This is a personal project, but feel free to fork and adapt for your own use.

## License

MIT License - see [LICENSE](LICENSE) file for details.

## Credits

- Gaussian Splatting technology via [Spark.js](https://sparkjs.dev)
- Demo worlds from Spark.js examples
- Music tracks (see individual world credits in app)
