import type * as RAPIER from '@dimforge/rapier3d-compat';
import { AgentState, type AgentConfig, type LidarHit } from './types';
import { OccupancyGrid } from './OccupancyGrid';
import { LidarScanner } from './LidarScanner';
import { FrontierDetector } from './FrontierDetector';
import { AStarPathfinder } from './AStarPathfinder';

export type AgentTickResult = {
  state: AgentState;
  lidarHits: LidarHit[] | null;
  currentPath: [number, number][] | null;
  targetFrontier: [number, number] | null;
  velocityX: number;
  velocityZ: number;
};

/**
 * Finite state machine driving the autonomous agent.
 *
 * States: IDLE → SCANNING → PLANNING → MOVING → SCANNING → ...
 *
 * Each tick() call processes one frame of the current state and returns
 * movement velocity + visualization data.
 */
export class AgentStateMachine {
  state: AgentState = AgentState.IDLE;
  readonly grid: OccupancyGrid;
  private scanner: LidarScanner;
  private frontierDetector: FrontierDetector;
  private config: AgentConfig;

  private currentPath: [number, number][] | null = null;
  private pathIndex = 0;
  private scanTimer = 0;
  private stuckTimer = 0;
  private lastPos: [number, number] = [0, 0];
  private lastLidarHits: LidarHit[] | null = null;
  private targetFrontier: [number, number] | null = null;

  // Track how many consecutive planning failures to avoid infinite loops
  private planFailCount = 0;
  private static readonly MAX_PLAN_FAILS = 5;
  private static readonly STUCK_TIMEOUT = 3.0; // seconds
  private static readonly STUCK_THRESHOLD = 0.1; // meters

  constructor(config: AgentConfig, startX: number, startZ: number) {
    this.config = config;
    this.scanner = new LidarScanner(config);
    this.frontierDetector = new FrontierDetector(config.gridWidth, config.gridHeight);

    // Center the grid on the start position
    const halfW = (config.gridWidth * config.cellSize) / 2;
    const halfH = (config.gridHeight * config.cellSize) / 2;
    this.grid = new OccupancyGrid(config, startX - halfW, startZ - halfH);
    this.lastPos = [startX, startZ];
  }

  /** Advance one frame. Returns velocity commands and viz data. */
  tick(
    dt: number,
    rapier: typeof RAPIER,
    world: RAPIER.World,
    posX: number, posY: number, posZ: number,
    excludeBody?: RAPIER.RigidBody,
  ): AgentTickResult {
    switch (this.state) {
      case AgentState.IDLE:
        return this.tickIdle();
      case AgentState.SCANNING:
        return this.tickScanning(rapier, world, posX, posY, posZ, excludeBody);
      case AgentState.PLANNING:
        return this.tickPlanning(posX, posZ);
      case AgentState.MOVING:
        return this.tickMoving(dt, rapier, world, posX, posY, posZ, excludeBody);
      default:
        return this.result(0, 0);
    }
  }

  /** Start the exploration loop. */
  start(): void {
    if (this.state === AgentState.IDLE) {
      this.state = AgentState.SCANNING;
    }
  }

  /** Reset everything for a new world. */
  reset(startX: number, startZ: number): void {
    this.state = AgentState.IDLE;
    const halfW = (this.config.gridWidth * this.config.cellSize) / 2;
    const halfH = (this.config.gridHeight * this.config.cellSize) / 2;
    this.grid.originX = startX - halfW;
    this.grid.originZ = startZ - halfH;
    this.grid.reset();
    this.currentPath = null;
    this.pathIndex = 0;
    this.scanTimer = 0;
    this.stuckTimer = 0;
    this.lastPos = [startX, startZ];
    this.lastLidarHits = null;
    this.targetFrontier = null;
    this.planFailCount = 0;
  }

  // ─── State handlers ───────────────────────────────────────────────

  private tickIdle(): AgentTickResult {
    // Stay idle until start() is called
    return this.result(0, 0);
  }

  private tickScanning(
    rapier: typeof RAPIER, world: RAPIER.World,
    posX: number, posY: number, posZ: number,
    excludeBody?: RAPIER.RigidBody,
  ): AgentTickResult {
    // Cast LiDAR rays and update grid
    const hits = this.scanner.scan(rapier, world, posX, posY, posZ, excludeBody);
    this.lastLidarHits = hits;
    const agentFloorY = this.scanner.agentFloorY;

    const wallHits = hits.filter(h => h.hit).length;
    const missHits = hits.filter(h => !h.hit).length;
    console.log(`[Agent] SCAN pos=(${posX.toFixed(2)}, ${posY.toFixed(2)}, ${posZ.toFixed(2)}) floorY=${agentFloorY.toFixed(2)} wallHits=${wallHits} misses=${missHits}`);

    for (const hit of hits) {
      this.grid.markRay(posX, posZ, agentFloorY, hit.worldX, hit.worldZ, hit.worldY, hit.hit);
    }

    const s = this.grid.stats();
    console.log(`[Agent] Grid after scan: empty=${s.empty} occupied=${s.occupied} total=${s.totalKnown}`);

    // Transition to planning
    this.state = AgentState.PLANNING;
    return this.result(0, 0);
  }

  private tickPlanning(posX: number, posZ: number): AgentTickResult {
    // Find frontiers
    const clusters = this.frontierDetector.detect(this.grid);
    const agentGrid = this.grid.worldToGrid(posX, posZ);
    const agentCell = this.grid.get(agentGrid.gx, agentGrid.gz);
    console.log(`[Agent] PLAN agentGrid=(${agentGrid.gx},${agentGrid.gz}) cellState=${agentCell} frontierClusters=${clusters.length} sizes=[${clusters.slice(0, 5).map(c => c.size).join(',')}]`);

    if (clusters.length === 0) {
      // No more frontiers — exploration complete
      console.log('[Agent] Exploration complete — no frontiers remain');
      this.state = AgentState.IDLE;
      this.currentPath = null;
      this.targetFrontier = null;
      return this.result(0, 0);
    }

    // Try each cluster (largest first) until we find a reachable one.
    // Target the cluster cell farthest from the agent — this ensures we move
    // outward even when frontiers form a ring (whose centroid is the agent position).

    for (const cluster of clusters) {
      // Pick the cell in the cluster farthest from the agent
      let bestCell = cluster.cells[0];
      let bestDist = 0;
      for (const cell of cluster.cells) {
        const dx = cell.gx - agentGrid.gx;
        const dz = cell.gz - agentGrid.gz;
        const d = dx * dx + dz * dz;
        if (d > bestDist) {
          bestDist = d;
          bestCell = cell;
        }
      }

      const pathResult = AStarPathfinder.findPath(
        this.grid,
        agentGrid,
        bestCell,
      );

      console.log(`[Agent] A* from (${agentGrid.gx},${agentGrid.gz}) to (${bestCell.gx},${bestCell.gz}): ${pathResult ? `path len=${pathResult.worldPath.length}` : 'NO PATH'}`);

      if (pathResult && pathResult.worldPath.length > 1) {
        this.currentPath = pathResult.worldPath;
        this.pathIndex = 1; // skip the start cell (we're already there)
        this.planFailCount = 0;
        this.stuckTimer = 0;
        this.lastPos = [posX, posZ];

        const targetWorld = this.grid.gridToWorld(bestCell.gx, bestCell.gz);
        this.targetFrontier = [targetWorld.wx, targetWorld.wz];

        this.state = AgentState.MOVING;
        return this.result(0, 0);
      }
    }

    // All frontiers are unreachable — try again next scan cycle
    this.planFailCount++;
    if (this.planFailCount >= AgentStateMachine.MAX_PLAN_FAILS) {
      console.log('[Agent] Too many planning failures — stopping');
      this.state = AgentState.IDLE;
      this.currentPath = null;
      this.targetFrontier = null;
    } else {
      // Scan again to hopefully reveal new paths
      this.state = AgentState.SCANNING;
    }

    return this.result(0, 0);
  }

  private tickMoving(
    dt: number,
    rapier: typeof RAPIER, world: RAPIER.World,
    posX: number, posY: number, posZ: number,
    excludeBody?: RAPIER.RigidBody,
  ): AgentTickResult {
    // Periodic re-scan while moving
    this.scanTimer += dt;
    if (this.scanTimer >= this.config.scanInterval) {
      this.scanTimer = 0;
      const hits = this.scanner.scan(rapier, world, posX, posY, posZ, excludeBody);
      this.lastLidarHits = hits;
      const agentFloorY = this.scanner.agentFloorY;
      for (const hit of hits) {
        this.grid.markRay(posX, posZ, agentFloorY, hit.worldX, hit.worldZ, hit.worldY, hit.hit);
      }
    }

    // Stuck detection
    this.stuckTimer += dt;
    if (this.stuckTimer >= AgentStateMachine.STUCK_TIMEOUT) {
      const dx = posX - this.lastPos[0];
      const dz = posZ - this.lastPos[1];
      const moved = Math.sqrt(dx * dx + dz * dz);
      if (moved < AgentStateMachine.STUCK_THRESHOLD) {
        console.log('[Agent] Stuck — replanning');
        this.currentPath = null;
        this.state = AgentState.SCANNING;
        return this.result(0, 0);
      }
      this.stuckTimer = 0;
      this.lastPos = [posX, posZ];
    }

    if (!this.currentPath || this.pathIndex >= this.currentPath.length) {
      // Path complete — rescan
      this.state = AgentState.SCANNING;
      this.currentPath = null;
      return this.result(0, 0);
    }

    // Move toward current waypoint
    const [targetX, targetZ] = this.currentPath[this.pathIndex];
    const dx = targetX - posX;
    const dz = targetZ - posZ;
    const dist = Math.sqrt(dx * dx + dz * dz);

    if (dist < this.config.arrivalThreshold) {
      // Arrived at waypoint — advance
      this.pathIndex++;
      if (this.pathIndex >= this.currentPath.length) {
        this.state = AgentState.SCANNING;
        this.currentPath = null;
        return this.result(0, 0);
      }
    }

    // Velocity toward waypoint (normalized * speed)
    const speed = this.config.moveSpeed;
    const invDist = dist > 0.01 ? 1 / dist : 0;
    const vx = dx * invDist * speed;
    const vz = dz * invDist * speed;

    return this.result(vx, vz);
  }

  // ─── Helpers ──────────────────────────────────────────────────────

  private result(vx: number, vz: number): AgentTickResult {
    return {
      state: this.state,
      lidarHits: this.lastLidarHits,
      currentPath: this.currentPath,
      targetFrontier: this.targetFrontier,
      velocityX: vx,
      velocityZ: vz,
    };
  }
}
