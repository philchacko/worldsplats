import type { AgentState } from '../types';

/* ── Commentary event types ── */

export type CommentaryEventType =
  | 'world_first_look'
  | 'deep_scan_complete'
  | 'exploration_milestone'
  | 'new_area_entered'
  | 'idle_observation';

/** Context snapshot sent to the LLM for generating commentary. */
export type CommentaryContext = {
  worldName: string;
  worldGuide: string;
  agentState: AgentState;
  /** Percentage of the occupancy grid that has been explored. */
  explorationPercent: number;
  /** Semantic labels of objects within ~3m of the agent. */
  nearbyObjects: string[];
  /** Labels from the most recent deep scan. */
  recentDiscoveries: string[];
  /** Cumulative per-label cell counts (all scans). */
  totalObjectsFound: Record<string, number>;
  /** Last 3 comments for continuity/variety. */
  previousComments: string[];
  /** Human-readable reason this event was triggered. */
  triggerReason: string;
  /** For future conversation mode: the user's spoken message. */
  userMessage?: string;
};

/** A commentary event emitted by the trigger engine. */
export type CommentaryEvent = {
  type: CommentaryEventType;
  /** 0-10, higher = more interesting. */
  priority: number;
  context: CommentaryContext;
  timestamp: number;
};

/* ── Rate-limiting config ── */

export const RATE_CONFIG = {
  /** Minimum milliseconds between commentary. */
  minIntervalMs: 25_000,
  /** Hard cap on comments per minute. */
  maxPerMinute: 3,
  /** Extra cooldown (ms) after TTS finishes before another can start. */
  cooldownAfterSpeaking: 5_000,
  /** Priority >= this value can override minIntervalMs (but not maxPerMinute). */
  priorityOverrideThreshold: 9,
} as const;
