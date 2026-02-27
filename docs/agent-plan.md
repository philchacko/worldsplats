# Virtual Agent Plan

## Vision

A virtual companion that inhabits the 3D worlds alongside the user. The agent explores autonomously, discovers things, and interacts with the user — not just a bot walking around, but a presence that makes the world feel alive.

## Current State (as of 2025-02-27)

### What's built

**Core SLAM loop** (`src/agent/`): The agent can autonomously explore a world using a robotics-inspired stack:

| Module | What it does |
|---|---|
| `LidarScanner` | Simulates 72-ray 360° horizontal LiDAR using Rapier raycasts |
| `OccupancyGrid` | 200×200 grid (0.1m cells = 20m coverage), Bresenham ray marking, height map + semantic labels |
| `FrontierDetector` | Finds boundaries between mapped/unmapped space, clusters them via BFS |
| `AStarPathfinder` | 8-directional A* with octile heuristic, path smoothing, fallback search |
| `AgentStateMachine` | FSM: IDLE → SCANNING → PLANNING → MOVING → SCANNING → ... |

**Semantic perception** (`src/agent/`, new):

| Module | What it does |
|---|---|
| `segmentation.ts` | Captures canvas snapshot, sends to fal.ai SAM-3 `image-rle` endpoint, returns labeled masks with view-projection matrix |
| `rleDecoder.ts` | Decodes COCO binary RLE masks (variable-length ASCII with delta encoding + sign extension) |
| `semanticSplash.ts` | Projects 2D masks → 3D grid: unproject pixels through inverse VP matrix, intersect floor plane, tag grid cells |
| `captureSnapshot.ts` | Renders scene to JPEG data URI via WebGL readPixels (with PBO unbind fix for Spark.js) |

**React integration** (`src/components/agent/`, `src/providers/agent.tsx`):

- `AgentController` — R3F component, creates a Rapier capsule body, calls `tick()` per frame, auto-triggers deep scans every 20s
- `AgentVisualizer` — Two-layer InstancedMesh: thin red outlines for occupied cells, bright filled squares for semantically labeled cells. LiDAR rays, path line, agent marker.
- `AgentHud` — Start/Stop, Show/Hide Map, Deep Scan button, live stats (state, % explored, labeled cell count, last splash stats)
- `AgentProvider` — Context with ref-based viz data, shared gridRef for splash projection, triggerDeepScan API
- `R3FBridge` — Captures gl/scene/camera refs from inside the R3F Canvas for use by segmentation

### What works

- Agent spawns at player position, autonomously explores via frontier detection
- Visualization shows occupancy grid, LiDAR rays, planned path in real-time
- Stuck detection triggers re-planning
- HUD shows state and exploration progress at 2Hz
- **SAM-3 segmentation**: Canvas snapshot → fal.ai SAM-3 → labeled RLE masks (floor, wall, sofa, etc.)
- **Semantic splash**: 2D masks projected onto 3D occupancy grid for floor-level concepts (floor, rug, table, chair, sofa, lamp, bookshelf)
- **Semantic visualization**: Bright colored filled squares distinguish semantic cells from plain occupied outlines
- **Auto deep scan**: Agent triggers SAM-3 segmentation every 20s to accumulate semantic labels over time
- **Semantic persistence**: Labels survive across LiDAR re-scans (markRay only touches cells/heights, not semantics)

### Known issues / gaps

- **No world-switch reset**: Agent state (grid, body) persists across world changes
- **No reactive obstacle avoidance**: Pure waypoint following; if a new obstacle appears mid-path, agent walks into it until stuck detection fires
- **2D only**: LiDAR is horizontal. Multi-level geometry (stairs, ramps) not handled
- **No interaction with user**: Agent explores silently. No communication, no shared awareness
- **Collider dependency**: LiDAR raycasts require a physics collider. Currently only the generic floor.glb exists — the agent only "sees" the floor, not walls/furniture from the splat worlds. Per-world colliders would dramatically improve exploration quality.
- **Camera vs agent mismatch**: Segmentation captures the player's camera view, but the occupancy grid is built from the agent's LiDAR position. Cells visible to the player but unexplored by LiDAR are rejected as UNKNOWN. Future: use the agent's own camera view for segmentation.
- **Floor-plane-only projection**: Vertical surfaces (walls, doors, windows, paintings, ceilings) are skipped because projecting them onto a horizontal plane produces scattered/smeared results. Needs depth-based projection or vertical plane intersection.
- **RLE count sum mismatch**: The COCO binary RLE decoder produces count sums that don't always match `width × height`. Delta decoding and sign extension are implemented but may need further verification against edge cases.
- **Sparse coverage**: With stride=4 sampling, only a fraction of mask pixels are projected. Floor-level objects that are small in screen space (distant tables, chairs) may tag very few grid cells per scan. Accumulation over multiple scans helps.
- **$0.005 per concept per scan**: Each deep scan calls fal.ai once per concept (~$0.06/scan for 12 concepts). Auto-scan every 20s costs ~$0.18/minute. Batch call support would reduce this to ~$0.005/scan.

## Roadmap

### Phase 1: Robustness

Get the existing exploration loop working reliably across all worlds.

- [ ] Reset agent state (grid, body, FSM) on world switch
- [ ] Handle edge cases: agent falling off floor, exploration complete state
- [ ] Tune config per-world or auto-adapt (grid size, scan range, speed)

### Phase 2: Semantic perception ← IN PROGRESS

The agent needs to understand *what* it's looking at, not just where obstacles are.

**Done:**
- [x] SAM-3 plumbing: capture canvas → fal.ai SAM-3 image-rle → labeled RLE masks
- [x] API route proxying to fal.ai with per-concept calls and batch fallback
- [x] COCO binary RLE decoder (variable-length ASCII + delta decoding + sign extension)
- [x] Semantic label system: `SemanticLabel` enum, `CONCEPT_TO_LABEL` mapping, parallel `semantics` Uint8Array on OccupancyGrid
- [x] Splash projection: unproject 2D mask pixels through inverse VP matrix → floor plane intersection → tag grid cells
- [x] Two-layer visualization: thin red outlines (occupied) + bright filled squares (semantic)
- [x] Auto deep scan timer (20s interval) with guard against overlapping scans
- [x] WebGL PBO unbind fix for Spark.js canvas capture
- [x] Diagnostic logging: per-mask pixel counts, hit/miss/OOB/unknown breakdown, sample hit positions, per-frame instance counts

**Remaining:**
- [ ] **Depth-based projection** (biggest accuracy win): Instead of intersecting all rays with a fixed floor plane, render a depth pass and read per-pixel depth to get true 3D positions. Would fix vertical surface projection and parallax errors for furniture. Challenges: Spark.js Gaussian splats don't write to the standard depth buffer; may need a custom depth pass or Spark-provided depth.
- [ ] **Agent-camera segmentation**: Currently uses the player's camera. Should capture from the agent's viewpoint (e.g. a virtual camera following the agent) so the segmentation aligns with the areas the agent's LiDAR has actually explored.
- [ ] **RLE decoder verification**: Count sums don't always match `width × height`. May need to handle edge cases in the COCO binary format (very long runs, boundary conditions). Test against known-good pycocotools output.
- [ ] **Reduce API cost**: Batch call (`return_multiple_masks: true`) returns a union mask, not per-concept masks. Investigate if SAM-3 has a mode that returns separate masks per prompt in a single call. Or reduce concept list to essentials.
- [ ] **Lower stride for small objects**: stride=4 misses small masks entirely. Could use adaptive stride (smaller for small bounding boxes) or stride=2 for furniture concepts.
- [ ] **Vertical surface handling**: Walls, doors, windows need a different projection strategy. Options: (a) intersect with vertical planes inferred from OCCUPIED cell positions, (b) use depth buffer, (c) project onto nearest occupied grid cell in the ray direction.

### Phase 3: Companion character — "The Curious Pal"

Transform from autonomous mapper to an interactive companion with personality.

**Concept**: A small robotic creature that's curious about architecture and materials. It explores spaces with visible excitement, pauses to examine things, and shares observations with the user. The experience should feel "automagical" — the agent HUD is dev/debugging only.

- [ ] **Visual design**: Simple 3D model or animated sprite. Robotic but expressive (think Wall-E vibes).
- [ ] **Awareness of user**: Track player position, maintain comfortable distance
- [ ] **Following mode**: Agent follows player at a configurable distance
- [ ] **Point of interest discovery**: Agent notices semantically interesting areas and moves toward them
- [ ] **Communication**: Speech bubbles with observations ("Oh, a bookshelf! I wonder what's on it")
- [ ] **LLM integration**: Use semantic map context to generate observations via language model
- [ ] **Personality/reactions**: Different behaviors in different environments (cautious in dark worlds, excited in colorful ones)

### Phase 4: Interaction

Agent and user actively collaborate.

- [ ] **Go-to command**: User points somewhere, agent goes there
- [ ] **Describe command**: User asks agent about what it sees
- [ ] **Shared map**: User can see what agent has explored (minimap?)
- [ ] **Gestures/animation**: Visual indication of agent's "mood" or attention

## Architecture Notes

### Performance budget

The agent runs in the main rendering loop. Key constraints:
- `tick()` must be fast (<1ms). Heavy work (A*, frontier detection) should be amortized or done off-frame.
- Visualization uses InstancedMesh (single draw call for grid) and imperative Three.js updates.
- Viz data flows through refs, not React state, to avoid per-frame re-renders.
- HUD polls at 2Hz, not per-frame.

### State flow

```
AgentProvider (React Context)
  |
  +-- AgentController (R3F useFrame)
  |     +-- AgentStateMachine.tick()
  |     |     +-- LidarScanner.scan()
  |     |     +-- OccupancyGrid.markRay()
  |     |     +-- FrontierDetector.detect()
  |     |     +-- AStarPathfinder.findPath()
  |     +-- Apply velocity to Rapier body
  |     +-- Write viz data to vizDataRef
  |
  +-- AgentVisualizer (R3F useFrame)
  |     +-- Read vizDataRef
  |     +-- Update Three.js objects imperatively
  |
  +-- AgentHud (React, polls at 2Hz)
        +-- Read vizDataRef for stats
        +-- Start/Stop/ShowMap controls
```

### Key design decisions

1. **Separate physics body**: Agent has its own Rapier capsule, independent of player. Both coexist.
2. **Ref-based data**: `vizDataRef` is a mutable ref, not React state. This is critical — writing to state every frame would tank performance.
3. **Grid-based planning**: The 2D occupancy grid is simple and fast but limits vertical awareness. Moving to a 3D representation (octree, voxel grid) would be a bigger architectural change.
4. **Modular core**: The agent logic (`src/agent/`) has no React dependency. It could be tested independently or run in a web worker.

## Files

```
src/agent/
  types.ts              - Shared types (CellState, AgentState, AgentConfig, SemanticLabel, SegmentationResult, etc.)
  OccupancyGrid.ts      - 2D grid: cells + heights + semantics arrays, Bresenham ray marking
  LidarScanner.ts       - Simulated 360° LiDAR via Rapier raycasts
  FrontierDetector.ts   - Find/cluster frontier cells
  AStarPathfinder.ts    - A* pathfinding with smoothing
  AgentStateMachine.ts  - FSM orchestrating the exploration loop
  segmentation.ts       - Canvas capture → fal.ai SAM-3 → SegmentationResult
  captureSnapshot.ts    - WebGL readPixels with PBO unbind for Spark.js
  rleDecoder.ts         - COCO binary RLE decoder (delta + sign extension)
  semanticSplash.ts     - Project 2D masks onto 3D grid via inverse VP + floor plane intersection

src/app/api/segment/
  route.ts              - Next.js API route proxying to fal.ai SAM-3 image-rle

src/components/agent/
  AgentController.tsx   - Per-frame tick, physics body, auto deep scan timer
  AgentVisualizer.tsx   - Two-layer InstancedMesh (outlines + semantic fills), LiDAR, path, marker
  AgentHud.tsx          - UI controls, stats, Deep Scan button, labeled cell count

src/components/scene/
  WorldScene.tsx        - Contains R3FBridge (captures gl/scene/camera for segmentation)

src/providers/
  agent.tsx             - React Context: gridRef, r3fRef, triggerDeepScan, lastSplashRef
```
