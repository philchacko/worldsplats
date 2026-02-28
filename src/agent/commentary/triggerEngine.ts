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

    // Gather nearby objects (within ~3m = 30 cells at 0.1m/cell)
    const nearbyObjects = this.getNearbyObjects(grid, vizData.agentPos[0], vizData.agentPos[2], 30);

    // Exploration percentage
    const stats = grid.stats();
    const totalCells = grid.width * grid.height;
    const explorationPercent = (stats.totalKnown / totalCells) * 100;

    // Base context builder
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
    });

    // ── Check triggers in priority order ──

    // 1. World first look (priority 9) — once, ~5s after enable
    if (!this.emittedFirstLook && now - this.enabledAt > 5000 && stats.totalKnown > 30) {
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

    // 2. Deep scan complete (priority 8) — new labels appeared
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

        if (newLabels.length > 0) {
          const event: CommentaryEvent = {
            type: 'deep_scan_complete',
            priority: 8,
            context: makeContext(
              `Deep scan revealed new objects: ${newLabels.join(', ')}`,
              newLabels,
            ),
            timestamp: now,
          };
          if (this.shouldEmit(event)) {
            this.lastCommentPos = [vizData.agentPos[0], vizData.agentPos[2]];
            return event;
          }
        }
      }
    }

    // 3. Exploration milestone (priority 6) — crossing 25%, 50%, 75%
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

    // 4. New area entered (priority 5) — moved >3m from last comment position
    const dx = vizData.agentPos[0] - this.lastCommentPos[0];
    const dz = vizData.agentPos[2] - this.lastCommentPos[1];
    const distFromLastComment = Math.sqrt(dx * dx + dz * dz);

    if (distFromLastComment > 3 && nearbyObjects.length > 0) {
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

    // 5. Idle observation (priority 3) — idle 15+ seconds
    if (this.wasIdle && now - this.idleStartTime > 15_000 && nearbyObjects.length > 0) {
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

  /** Find distinct semantic labels near the agent position. */
  private getNearbyObjects(grid: OccupancyGrid, wx: number, wz: number, radius: number): string[] {
    const center = grid.worldToGrid(wx, wz);
    const found = new Set<string>();
    const minGx = Math.max(0, center.gx - radius);
    const maxGx = Math.min(grid.width - 1, center.gx + radius);
    const minGz = Math.max(0, center.gz - radius);
    const maxGz = Math.min(grid.height - 1, center.gz + radius);

    for (let gz = minGz; gz <= maxGz; gz++) {
      for (let gx = minGx; gx <= maxGx; gx++) {
        const sem = grid.getSemantic(gx, gz);
        if (sem !== SemanticLabel.NONE && LABEL_NAMES[sem]) {
          found.add(LABEL_NAMES[sem]);
        }
      }
    }

    // Exclude floor/ceiling/wall — they're everywhere and not interesting
    found.delete('floor');
    found.delete('ceiling');
    found.delete('wall');
    return Array.from(found);
  }
}
