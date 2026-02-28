import { AgentState, SemanticLabel } from '../types';
import type { OccupancyGrid } from '../OccupancyGrid';
import type { VizData } from '@/providers/agent';
import type { SplashStats } from '@/providers/agent';
import {
  RATE_CONFIG,
  type CommentaryEvent,
  type CommentaryContext,
} from './types';

/** Human-readable semantic label names (for LLM context). */
const LABEL_NAMES: Record<number, string> = {
  [SemanticLabel.FLOOR]: 'floor',
  [SemanticLabel.WALL]: 'wall',
  [SemanticLabel.CEILING]: 'ceiling',
  [SemanticLabel.DOOR]: 'door',
  [SemanticLabel.WINDOW]: 'window',
  [SemanticLabel.SOFA]: 'sofa',
  [SemanticLabel.TABLE]: 'table',
  [SemanticLabel.CHAIR]: 'chair',
  [SemanticLabel.RUG]: 'rug',
  [SemanticLabel.LAMP]: 'lamp',
  [SemanticLabel.BOOKSHELF]: 'bookshelf',
  [SemanticLabel.PAINTING]: 'painting',
};

/** Interesting labels (furniture/decor) — excludes structural ones. */
const INTERESTING_LABELS = new Set([
  'door', 'window', 'sofa', 'table', 'chair',
  'rug', 'lamp', 'bookshelf', 'painting',
]);

/** Minimum cell growth from a single deep scan to trigger a "significant growth" comment. */
const SIGNIFICANT_CELL_GROWTH = 40;

/** Minimum distinct interesting objects nearby to fire a semantic_cluster trigger. */
const MIN_CLUSTER_SIZE = 2;

/** Input snapshot for the trigger engine. */
export type TriggerInput = {
  vizData: VizData;
  lastSplash: SplashStats | null;
  deepScanSignal: number;
  totalObjects: Record<string, number>;
  worldName: string;
  worldGuide: string;
  previousComments: string[];
};

/**
 * Detects interesting moments in the Curator's exploration
 * and emits CommentaryEvent objects with rich context for the LLM.
 */
export class CommentaryTriggerEngine {
  // ── Internal tracking ──
  private lastDeepScanSignal = 0;
  private lastSplashLabels = new Set<string>();
  private lastCommentPos: [number, number] = [0, 0];
  private lastCommentTime = 0;
  private recentTimestamps: number[] = [];
  private emittedFirstLook = false;
  private enabledAt = 0;
  private idleStartTime = 0;
  private wasIdle = false;
  private milestonesCrossed = new Set<number>();

  /** Total tagged cells at last deep scan (for detecting significant growth). */
  private lastTotalTagged = 0;

  /** The nearby-object set we last commented about (serialised). */
  private lastCommentedCluster = '';

  constructor() {
    this.enabledAt = Date.now();
  }

  reset(): void {
    this.lastDeepScanSignal = 0;
    this.lastSplashLabels.clear();
    this.lastCommentPos = [0, 0];
    this.lastCommentTime = 0;
    this.recentTimestamps = [];
    this.emittedFirstLook = false;
    this.enabledAt = Date.now();
    this.idleStartTime = 0;
    this.wasIdle = false;
    this.milestonesCrossed.clear();
    this.lastTotalTagged = 0;
    this.lastCommentedCluster = '';
  }

  /** Called after narration finishes to update cooldown tracking. */
  recordCompletion(): void {
    this.lastCommentTime = Date.now();
    this.recentTimestamps.push(Date.now());
    // Keep only timestamps from the last 60 seconds
    const cutoff = Date.now() - 60_000;
    this.recentTimestamps = this.recentTimestamps.filter((t) => t > cutoff);
  }

  /**
   * Evaluate the current state and return a CommentaryEvent if something
   * interesting is happening, or null if it's not time to comment.
   */
  evaluate(input: TriggerInput): CommentaryEvent | null {
    const { vizData, lastSplash, deepScanSignal, totalObjects, worldName, worldGuide, previousComments } = input;
    const now = Date.now();
    const grid = vizData.grid;

    // Track idle time
    if (vizData.state === AgentState.IDLE) {
      if (!this.wasIdle) {
        this.idleStartTime = now;
        this.wasIdle = true;
      }
    } else {
      this.wasIdle = false;
      this.idleStartTime = 0;
    }

    // Gather nearby objects with per-label cell counts (within ~3m = 30 cells)
    const nearbyDetail = this.getNearbyObjectsDetailed(grid, vizData.agentPos[0], vizData.agentPos[2], 30);
    const nearbyObjects = Object.keys(nearbyDetail);

    // Exploration percentage
    const stats = grid.stats();
    const totalCells = grid.width * grid.height;
    const explorationPercent = (stats.totalKnown / totalCells) * 100;

    // Base context builder — now includes nearby cell counts
    const makeContext = (triggerReason: string, recentDiscoveries: string[] = []): CommentaryContext => ({
      worldName,
      worldGuide,
      agentState: vizData.state,
      explorationPercent,
      nearbyObjects,
      recentDiscoveries,
      totalObjectsFound: { ...totalObjects },
      previousComments,
      triggerReason,
      nearbyObjectCounts: nearbyDetail,
    });

    // ── Check triggers in priority order ──

    // 1. World first look (priority 9) — once, ~3s after enable
    if (!this.emittedFirstLook && now - this.enabledAt > 3000 && stats.totalKnown > 20) {
      this.emittedFirstLook = true;
      const discoveries = Object.keys(totalObjects).filter((k) => totalObjects[k] > 0);
      const event: CommentaryEvent = {
        type: 'world_first_look',
        priority: 9,
        context: makeContext('First look at a new world', discoveries),
        timestamp: now,
      };
      if (this.shouldEmit(event)) {
        this.lastCommentPos = [vizData.agentPos[0], vizData.agentPos[2]];
        return event;
      }
    }

    // 2. Deep scan complete (priority 8) — new labels OR significant cell growth
    if (deepScanSignal > this.lastDeepScanSignal) {
      this.lastDeepScanSignal = deepScanSignal;

      if (lastSplash && lastSplash.totalTagged > 0) {
        const newLabels = Object.keys(lastSplash.perLabel).filter(
          (k) => lastSplash.perLabel[k] > 0 && !this.lastSplashLabels.has(k),
        );
        // Update tracking
        for (const k of Object.keys(lastSplash.perLabel)) {
          if (lastSplash.perLabel[k] > 0) this.lastSplashLabels.add(k);
        }

        // Calculate cell growth since last scan
        const cellGrowth = lastSplash.totalTagged;
        const significantGrowth = cellGrowth >= SIGNIFICANT_CELL_GROWTH;

        // Determine the most prominent objects in this scan
        const scanBreakdown = Object.entries(lastSplash.perLabel)
          .filter(([, v]) => v > 0)
          .sort(([, a], [, b]) => b - a)
          .map(([k, v]) => `${k} (${v} cells)`);

        if (newLabels.length > 0) {
          // New labels discovered — highest priority scan event
          const event: CommentaryEvent = {
            type: 'deep_scan_complete',
            priority: 8,
            context: makeContext(
              `Deep scan revealed new objects: ${newLabels.join(', ')}. Scan breakdown: ${scanBreakdown.join(', ')}`,
              newLabels,
            ),
            timestamp: now,
          };
          if (this.shouldEmit(event)) {
            this.lastCommentPos = [vizData.agentPos[0], vizData.agentPos[2]];
            this.lastTotalTagged += cellGrowth;
            return event;
          }
        } else if (significantGrowth) {
          // No new labels, but lots of cells were tagged — scanner found more of what we know
          const topLabels = scanBreakdown.slice(0, 3);
          const event: CommentaryEvent = {
            type: 'deep_scan_complete',
            priority: 6,
            context: makeContext(
              `Deep scan tagged ${cellGrowth} cells — mostly ${topLabels.join(', ')}. The space is filling out.`,
            ),
            timestamp: now,
          };
          if (this.shouldEmit(event)) {
            this.lastCommentPos = [vizData.agentPos[0], vizData.agentPos[2]];
            this.lastTotalTagged += cellGrowth;
            return event;
          }
        }

        this.lastTotalTagged += cellGrowth;
      }
    }

    // 3. Semantic cluster (priority 7) — 3+ distinct interesting objects nearby
    {
      const interestingNearby = nearbyObjects.filter((k) => INTERESTING_LABELS.has(k));
      const clusterKey = interestingNearby.sort().join(',');

      if (
        interestingNearby.length >= MIN_CLUSTER_SIZE &&
        clusterKey !== this.lastCommentedCluster
      ) {
        const event: CommentaryEvent = {
          type: 'semantic_cluster',
          priority: 7,
          context: makeContext(
            `Surrounded by an interesting cluster of objects: ${interestingNearby.join(', ')}`,
            interestingNearby,
          ),
          timestamp: now,
        };
        if (this.shouldEmit(event)) {
          this.lastCommentPos = [vizData.agentPos[0], vizData.agentPos[2]];
          this.lastCommentedCluster = clusterKey;
          return event;
        }
      }
    }

    // 4. Exploration milestone (priority 6) — crossing 25%, 50%, 75%
    for (const threshold of [25, 50, 75]) {
      if (explorationPercent >= threshold && !this.milestonesCrossed.has(threshold)) {
        this.milestonesCrossed.add(threshold);
        const event: CommentaryEvent = {
          type: 'exploration_milestone',
          priority: 6,
          context: makeContext(`Reached ${threshold}% of the area mapped`),
          timestamp: now,
        };
        if (this.shouldEmit(event)) {
          this.lastCommentPos = [vizData.agentPos[0], vizData.agentPos[2]];
          return event;
        }
      }
    }

    // 5. New area entered (priority 5) — moved >2m from last comment position
    const dx = vizData.agentPos[0] - this.lastCommentPos[0];
    const dz = vizData.agentPos[2] - this.lastCommentPos[1];
    const distFromLastComment = Math.sqrt(dx * dx + dz * dz);

    if (distFromLastComment > 2 && nearbyObjects.length > 0) {
      const event: CommentaryEvent = {
        type: 'new_area_entered',
        priority: 5,
        context: makeContext(`Moved to a new area with: ${nearbyObjects.join(', ')}`),
        timestamp: now,
      };
      if (this.shouldEmit(event)) {
        this.lastCommentPos = [vizData.agentPos[0], vizData.agentPos[2]];
        return event;
      }
    }

    // 6. Idle observation (priority 3) — idle 10+ seconds
    if (this.wasIdle && now - this.idleStartTime > 10_000 && nearbyObjects.length > 0) {
      this.idleStartTime = now; // reset so it doesn't fire every tick
      const event: CommentaryEvent = {
        type: 'idle_observation',
        priority: 3,
        context: makeContext('Taking a moment to observe the surroundings'),
        timestamp: now,
      };
      if (this.shouldEmit(event)) {
        this.lastCommentPos = [vizData.agentPos[0], vizData.agentPos[2]];
        return event;
      }
    }

    return null;
  }

  /** Rate-limit check: returns true if the event can be emitted. */
  private shouldEmit(event: CommentaryEvent): boolean {
    const now = Date.now();

    // Hard cap: max N comments per minute
    const cutoff = now - 60_000;
    const recentCount = this.recentTimestamps.filter((t) => t > cutoff).length;
    if (recentCount >= RATE_CONFIG.maxPerMinute) return false;

    // Min interval (unless high priority)
    const elapsed = now - this.lastCommentTime;
    if (
      elapsed < RATE_CONFIG.minIntervalMs &&
      event.priority < RATE_CONFIG.priorityOverrideThreshold
    ) {
      return false;
    }

    return true;
  }

  /**
   * Find distinct semantic labels near the agent with per-label cell counts.
   * Excludes floor/ceiling/wall — they're structural and not interesting for commentary.
   */
  private getNearbyObjectsDetailed(
    grid: OccupancyGrid,
    wx: number,
    wz: number,
    radius: number,
  ): Record<string, number> {
    const center = grid.worldToGrid(wx, wz);
    const counts: Record<string, number> = {};
    const minGx = Math.max(0, center.gx - radius);
    const maxGx = Math.min(grid.width - 1, center.gx + radius);
    const minGz = Math.max(0, center.gz - radius);
    const maxGz = Math.min(grid.height - 1, center.gz + radius);

    for (let gz = minGz; gz <= maxGz; gz++) {
      for (let gx = minGx; gx <= maxGx; gx++) {
        const sem = grid.getSemantic(gx, gz);
        if (sem !== SemanticLabel.NONE && LABEL_NAMES[sem]) {
          const name = LABEL_NAMES[sem];
          counts[name] = (counts[name] ?? 0) + 1;
        }
      }
    }

    // Exclude floor/ceiling/wall — they're everywhere
    delete counts['floor'];
    delete counts['ceiling'];
    delete counts['wall'];
    return counts;
  }
}
