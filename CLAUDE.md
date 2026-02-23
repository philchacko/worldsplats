# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

- `npm run dev` - Start development server with Turbopack
- `npm run build` - Build production version with Turbopack
- `npm run start` - Start production server
- `npm run lint` - Run ESLint

## Architecture Overview

This is a Next.js 15 app using React 19 that implements a 3D world exploration experience using Gaussian Splatting (via Spark.js) with physics simulation, dynamic audio, and full mobile support. Users navigate through immersive 3D environments with world-specific background music.

### Key Dependencies

- **@sparkjsdev/spark** - Core Gaussian Splatting renderer
- **@react-three/fiber** - React Three.js renderer
- **@react-three/drei** - Three.js helpers (CameraControls, Environment)
- **@react-three/rapier** - Physics engine integration
- **three** - 3D graphics library

### Project Structure

#### Core Application
- `src/app/page.tsx` - Main page with world navigation, audio integration, and layout management
- `src/components/scene/WorldScene.tsx` - 3D canvas setup with camera controls and physics
- `src/components/scene/PointerLockBridge.tsx` - Bridges pointer lock state between React and R3F

#### 3D Rendering (Spark/Three.js)
- `src/components/spark/SparkLayer.tsx` - Spark renderer integration (attached to camera)
- `src/components/spark/SplatWorld.tsx` - Loads and displays .spz/.ply splat files with loading states
- `src/components/environment/Floor.tsx` - Visual collider mesh for debugging (not rendered in production)

#### Controls & Input
- `src/components/controls/PlayerController.tsx` - WASD camera movement with mobile input support
- `src/components/controls/TouchLookController.tsx` - Touch-based camera rotation for mobile
- `src/components/controls/VirtualStick.tsx` - On-screen joystick for mobile movement
- `src/components/controls/MobileHud.tsx` - Container for mobile-specific UI elements

#### UI & HUD
- `src/components/hud/NavHeader.tsx` - World navigation header with back/forward buttons
- `src/components/hud/Button.tsx` - Reusable button components (Button, IconButton)
- `src/components/hud/ClickToPlay.tsx` - Reticle component for pointer lock mode

#### State Management (Providers)
- `src/providers/audio.tsx` - AudioContext singleton with buffer caching and music switching
- `src/providers/pointerLock.tsx` - Pointer Lock API state management
- `src/physics/RapierProvider.tsx` - Physics engine context provider

#### Configuration & Data
- `src/data/presets.ts` - World and object definitions (WorldDef, ObjectDef)
- `src/config/audio.ts` - Audio configuration constants

### Core Concepts

**Spark Integration**: The SparkRenderer is attached to the camera for better float16 precision across large scenes. Custom webpack config disables URL parsing for WASM compatibility.

**World/Object System**:
- `WorldDef` defines splat worlds (.spz/.ply files) with position, rotation, scale, music URL, and metadata
- **Dual asset mode** controlled by `NEXT_PUBLIC_ASSET_MODE` env var (or `ASSET_MODE` in presets.ts):
  - `'local'` (default) — serve from `/public` (no network dependency, good for dev)
  - `'supabase'` — stream from Supabase Storage (`NEXT_PUBLIC_SUPABASE_STORAGE_BASE`)
- Each world has its own `.glb` collider mesh, co-located with the `.spz` file (same base name, `.glb` extension)
- `colliderUrlFromSplatUrl()` helper derives the collider URL from the splat URL by convention
- `ObjectDef` defines shootable objects (primitives or GLTF models) with physics properties

**Physics**: Uses Rapier for realistic physics simulation with configurable mass, colliders, and gravity. Environment colliders are loaded per-world via `RapierProvider`'s `colliderUrl` prop — when the world changes, old colliders are removed and new ones are loaded. Player position resets to spawn on world switch.

**Camera Controls**:
- Desktop: Pointer lock mode with WASD movement and mouse look
- Mobile: Touch-based camera rotation with virtual joystick for movement

**Audio System**: Singleton AudioContext managed via React Context provider:
- Automatic music switching when world changes
- Buffer caching to avoid re-downloading
- Support for queuing music before user interaction
- Master gain node for mute/unmute control
- Fade transitions between tracks
- iOS Safari compatibility with context resume

**Layout Architecture**: Layered approach with pointer-events management:
1. **3D Canvas** (background) - RapierProvider + WorldScene fill entire viewport
2. **Overlay UI** (top) - Positioned absolutely at top center, hidden during pointer lock except NavHeader
3. **Mobile Controls** (overlay) - Virtual joystick and buttons
4. **HUD Elements** (overlay) - Reticle, mute button, loading states

### Key Features

- Real-time Gaussian Splat rendering via Spark.js
- 6 unique world environments with individual music tracks
- World-specific background music with automatic switching
- Full mobile support with touch controls and virtual joystick
- Physics simulation with Rapier
- Configurable projectile speed
- Keyboard navigation (WASD movement, Q/E or ←/→ world navigation, Space shoot)
- Responsive UI that adapts to mobile/desktop
- Loading states and error handling

### Configuration Notes

#### Adding New Worlds

1. Upload assets to Supabase Storage (public bucket):
   - `.spz` splat file → `worlds/myworld.spz`
   - `.glb` collider mesh → `worlds/myworld.glb` (same base name as splat)
   - `.jpg` thumbnail → `worlds/myworld.jpg`
   - `.mp3` music → `music/myworld.mp3`

2. Add entry to `src/data/presets.ts`:

```typescript
{
  id: 'my-world',
  name: 'My World',
  url: assetUrl('/worlds/myworld.spz', 'worlds/myworld.spz'),
  imageUrl: assetUrl('/worlds/myworld.jpg', 'worlds/myworld.jpg'),
  musicUrl: assetUrl('/music/myworld.mp3', 'music/myworld.mp3'),
  // colliderUrl is derived automatically from url (.spz → .glb)
  // Override with colliderUrl if the collider is at a different path
  position: [0, 0, 0],
  quaternion: [0, 0, 0, 1],
  scale: 1,
  guide: 'Description of your world...',
  imageCredit: 'Photo credit (optional)'
}
```

The `assetUrl(localPath, remotePath)` helper resolves to a local `/public` path or Supabase Storage URL depending on `ASSET_MODE`.

#### Asset Mode Configuration

| Env var | Values | Default | Purpose |
|---------|--------|---------|---------|
| `NEXT_PUBLIC_ASSET_MODE` | `local` / `supabase` | `local` | Where to load assets from |
| `NEXT_PUBLIC_SUPABASE_STORAGE_BASE` | URL | — | Supabase Storage base URL (required for `supabase` mode) |

For local development, keep the default `local` mode and place assets in `/public/worlds/` and `/public/music/`. For production with Supabase, set both env vars in `.env.local` or your hosting provider.

#### Performance Settings

- Canvas uses `antialias: false` for better splat performance
- Mobile DPR capped at 1.0, desktop at 1.5
- Shadows disabled to reduce GPU pressure
- Audio buffers cached in Map to avoid re-downloading
- Touch event listeners use `passive: true` for better scroll performance

### Important Architectural Patterns

#### Provider Placement

**Critical**: AudioProvider must live OUTSIDE the R3F Canvas to maintain singleton behavior:

```typescript
// ✅ Correct - Provider outside Canvas
<PointerLockProvider>
  <AudioProvider>
    <PageContent>
      <RapierProvider>
        <WorldScene />  {/* Inside Canvas */}
      </RapierProvider>
    </PageContent>
  </AudioProvider>
</PointerLockProvider>
```

React Three Fiber creates separate render contexts, so placing providers inside Canvas can cause re-instantiation issues.

#### Layout Pattern

```typescript
<div className="relative h-dvh w-dvw">
  {/* Background: 3D Canvas fills viewport */}
  <RapierProvider>
    <WorldScene />
  </RapierProvider>

  {/* Foreground: UI overlays with pointer-events management */}
  <div className="absolute inset-0 flex flex-col pointer-events-none">
    <div className="flex justify-center p-4">
      <OverlayUI className="pointer-events-auto" />
    </div>
  </div>
</div>
```

This ensures the 3D scene is always explorable while UI sits on top.

#### Mobile Input Pattern

PlayerController accepts optional `mobileInputRef` that overrides keyboard input:

```typescript
// Parent component
const mobileInputRef = useRef<{x:number;y:number}>({x:0,y:0});

// VirtualStick updates this ref
<VirtualStick onChange={(v) => {
  mobileInputRef.current.x = v.x;
  mobileInputRef.current.y = v.y;
}} />

// PlayerController reads from ref
<PlayerController mobileInputRef={mobileInputRef} />
```

This decouples touch input from keyboard input cleanly.

### Browser Compatibility

- Requires WebGL 2.0 support
- Pointer Lock API (desktop browsers)
- Web Audio API (all modern browsers)
- Touch Events API (mobile browsers)
- iOS Safari special handling:
  - Motion permission request in user gesture
  - AudioContext resume on visibility change

### Common Development Tasks

**Running the dev server:**
```bash
npm run dev
```

**Building for production:**
```bash
npm run build
npm start
```

**Testing mobile:**
- Use browser dev tools device emulation
- Test on actual mobile devices for touch behavior
- Check iOS Safari specifically for audio/motion permissions

**Debugging audio issues:**
- Check browser console for audio initialization errors
- Verify music URLs resolve on Supabase Storage (check CORS and bucket visibility)
- Ensure user interaction occurred before audio.init()
- Check AudioContext state (running vs suspended)

**Debugging collider issues:**
- Check console for `✓ Environment collision mesh loaded: <url>` on world switch
- If player falls through, verify the `.glb` file exists at the derived URL
- Use `<Floor url={colliderUrl} visible={true} />` in WorldScene to visualize the collider mesh
- Check Network tab for 404s on `.glb` requests

### Code Style Notes

- Use TypeScript for all new files
- Prefer functional components with hooks
- Use `useCallback` for event handlers passed to children
- Use `useMemo` for expensive computations
- Keep providers outside R3F Canvas context
- Use passive event listeners for touch events
- Prefer pointer-events CSS for click-through overlays
