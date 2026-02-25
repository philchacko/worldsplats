# Virtual Agent Plan

## Vision

A virtual companion that inhabits the 3D worlds alongside the user. The agent explores autonomously, discovers things, and interacts with the user — not just a bot walking around, but a presence that makes the world feel alive.

## Current State (as of 2025-02-25)

### What's built

**Core SLAM loop** (`src/agent/`): The agent can autonomously explore a world using a robotics-inspired stack:

| Module | What it does |
|---|---|
| `LidarScanner` | Simulates 72-ray 360 degree horizontal LiDAR using Rapier raycasts |
| `OccupancyGrid` | 200x200 Uint8Array grid (0.5m cells = 100m coverage), Bresenham ray marking |
| `FrontierDetector` | Finds boundaries between mapped/unmapped space, clusters them via BFS |
| `AStarPathfinder` | 8-directional A* with octile heuristic, path smoothing, fallback search |
| `AgentStateMachine` | FSM: IDLE -> SCANNING -> PLANNING -> MOVING -> SCANNING -> ... |

**React integration** (`src/components/agent/`, `src/providers/agent.tsx`):

- `AgentController` — R3F component, creates a Rapier capsule body, calls `tick()` per frame
- `AgentVisualizer` — InstancedMesh occupancy grid, LiDAR rays, path line, agent marker
- `AgentHud` — Start/Stop, Show/Hide Map, live stats (state, % explored)
- `AgentProvider` — Context with ref-based viz data to avoid re-renders

### What works

- Agent spawns at player position, autonomously explores via frontier detection
- Visualization shows occupancy grid, LiDAR rays, planned path in real-time
- Stuck detection triggers re-planning
- HUD shows state and exploration progress at 2Hz

### Known issues / gaps

- **No world-switch reset**: Agent state (grid, body) persists across world changes
- **No reactive obstacle avoidance**: Pure waypoint following; if a new obstacle appears mid-path, agent walks into it until stuck detection fires
- **2D only**: LiDAR is horizontal. Multi-level geometry (stairs, ramps) not handled
- **No interaction with user**: Agent explores silently. No communication, no shared awareness
- **Collider dependency**: LiDAR raycasts require a physics collider. Currently only the generic floor.glb exists — the agent only "sees" the floor, not walls/furniture from the splat worlds. Per-world colliders would dramatically improve exploration quality.

## Roadmap

### Phase 1: Robustness

Get the existing exploration loop working reliably across all worlds.

- [ ] Reset agent state (grid, body, FSM) on world switch
- [ ] Handle edge cases: agent falling off floor, exploration complete state
- [ ] Tune config per-world or auto-adapt (grid size, scan range, speed)

### Phase 2: Better world awareness

The agent needs to actually perceive the world geometry, not just a flat floor.

- [ ] Generate per-world collider meshes (from splat geometry or manual modeling)
- [ ] OR: use splat-based raycasting if Spark supports it (no physics collider needed)
- [ ] 3D LiDAR or multi-plane scanning for vertical structure
- [ ] Semantic understanding: identify rooms, doors, objects, boundaries

### Phase 3: Companion behavior

Transform from autonomous mapper to interactive companion.

- [ ] **Awareness of user**: Track player position, maintain comfortable distance
- [ ] **Following mode**: Agent follows player at a configurable distance
- [ ] **Point of interest discovery**: Agent notices interesting things and calls them out
- [ ] **Communication**: Speech bubbles, spatial audio cues, or text callouts
- [ ] **Personality/reactions**: Different behaviors in different environments (cautious in dark worlds, excited in colorful ones)

### Phase 4: Interaction

Agent and user actively collaborate.

- [ ] **Go-to command**: User points somewhere, agent goes there
- [ ] **Describe command**: User asks agent about what it sees
- [ ] **Shared map**: User can see what agent has explored (minimap?)
- [ ] **LLM integration**: Agent uses a language model for commentary, Q&A, personality
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
  types.ts              - Shared types (CellState, AgentState, AgentConfig, etc.)
  OccupancyGrid.ts      - 2D grid storage + Bresenham ray marking
  LidarScanner.ts       - Simulated 360deg LiDAR via Rapier raycasts
  FrontierDetector.ts   - Find/cluster frontier cells
  AStarPathfinder.ts    - A* pathfinding with smoothing
  AgentStateMachine.ts  - FSM orchestrating the exploration loop

src/components/agent/
  AgentController.tsx   - Per-frame tick, physics body management
  AgentVisualizer.tsx   - 3D visualization (grid, rays, path, marker)
  AgentHud.tsx          - UI controls and stats

src/providers/
  agent.tsx             - React Context provider
```
