# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

- `npm run dev` - Start development server with Turbopack
- `npm run build` - Build production version with Turbopack
- `npm run start` - Start production server
- `npm run lint` - Run ESLint

## Architecture Overview

This is a Next.js 15 app using React 19 that implements a 3D "Splat Shooter" using Gaussian Splatting (via Spark.js) with physics simulation. The app allows users to shoot objects into 3D splat worlds.

### Key Dependencies

- **@sparkjsdev/spark** - Core Gaussian Splatting renderer
- **@react-three/fiber** - React Three.js renderer
- **@react-three/drei** - Three.js helpers (CameraControls, Environment)
- **@react-three/rapier** - Physics engine integration
- **three** - 3D graphics library

### Project Structure

- `src/app/page.tsx` - Main UI with world/object selectors and 3D canvas
- `src/components/scene/WorldScene.tsx` - Main 3D scene with camera controls and physics
- `src/components/spark/SparkLayer.tsx` - Spark renderer integration (attached to camera)
- `src/components/spark/SplatWorld.tsx` - Loads and displays .spz/.ply splat files
- `src/components/physics/Projectile.tsx` - Physics-enabled projectile objects
- `src/data/presets.ts` - Configuration for worlds and shootable objects
- `src/data/universeconfig.ts` - Global physics and gameplay constants
- `src/physics/` - Physics system with Rapier integration and type definitions

### Core Concepts

**Spark Integration**: The SparkRenderer is attached to the camera for better float16 precision across large scenes. Custom webpack config disables URL parsing for WASM compatibility.

**World/Object System**:
- `WorldDef` defines splat worlds (.spz/.ply files) with position, rotation, scale, and descriptive guide text
- `ObjectDef` defines shootable objects (primitives or GLTF models) with physics properties
- Worlds include detailed prompt descriptions for context and immersion

**Physics**: Uses Rapier for realistic projectile physics with configurable mass, colliders, and gravity. Global constants in `universeconfig.ts` control physics parameters.

**Camera Controls**: DCC-style navigation (orbit/pan/dolly) with WASD keyboard shortcuts for movement.

**XR Support**: Includes VR/AR capabilities with hand tracking detection and WebXR integration.

### Key Features

- Real-time Gaussian Splat rendering via Spark.js
- Physics-based projectile shooting (Space bar or UI button)
- Multiple world environments and projectile types
- Configurable projectile speed and physics properties
- Keyboard navigation (WASD movement, Q/E dolly, Space shoot)

### Configuration Notes

- Worlds are loaded from URLs (currently using Spark demo assets)
- Objects can be Three.js primitives or GLTF models with physics colliders
- Canvas uses `antialias: false` for better splat performance
- Physics ground plane prevents infinite falling