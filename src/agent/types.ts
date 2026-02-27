export enum CellState {
  UNKNOWN = 0,
  EMPTY = 1,
  OCCUPIED = 2,
}

export enum AgentState {
  IDLE = 'IDLE',
  SCANNING = 'SCANNING',
  PLANNING = 'PLANNING',
  MOVING = 'MOVING',
}

export type GridCoord = { gx: number; gz: number };

export type AgentConfig = {
  cellSize: number;           // meters per grid cell (default 0.5)
  gridWidth: number;          // cells in X (default 200 = 100m)
  gridHeight: number;         // cells in Z (default 200 = 100m)
  lidarRayCount: number;      // rays per scan (default 72 = 5-degree increments)
  lidarMaxRange: number;      // max ray distance in meters (default 15)
  lidarYOffset: number;       // sensor height relative to body center (default 0)
  moveSpeed: number;          // agent walk speed m/s (default 3.0)
  scanInterval: number;       // seconds between scans while moving (default 0.25)
  noiseStdDev: number;        // LiDAR distance noise std dev in meters (default 0.02)
  arrivalThreshold: number;   // distance to waypoint = "arrived" (default 0.3)
};

export const DEFAULT_AGENT_CONFIG: AgentConfig = {
  cellSize: 0.1,
  gridWidth: 200,
  gridHeight: 200,
  lidarRayCount: 72,
  lidarMaxRange: 15,
  lidarYOffset: 0,
  moveSpeed: 3.0,
  scanInterval: 0.25,
  noiseStdDev: 0.02,
  arrivalThreshold: 0.3,
};

export type LidarHit = {
  angle: number;        // radians (absolute world angle)
  distance: number;     // measured distance (with noise if enabled)
  worldX: number;       // hit point X in world space
  worldZ: number;       // hit point Z in world space
  worldY: number;       // floor/surface Y at hit point (for height map)
  hit: boolean;         // true = ray hit surface, false = reached max range
};

export type PathResult = {
  path: GridCoord[];
  worldPath: [number, number][];  // [x, z] world coords
  cost: number;
};

export type FrontierCluster = {
  cells: GridCoord[];
  centroid: GridCoord;
  size: number;
};

/* ── Semantic Labels ── */

export enum SemanticLabel {
  NONE = 0,
  FLOOR = 1,
  WALL = 2,
  CEILING = 3,
  DOOR = 4,
  WINDOW = 5,
  SOFA = 6,
  TABLE = 7,
  CHAIR = 8,
  RUG = 9,
  LAMP = 10,
  BOOKSHELF = 11,
  PAINTING = 12,
}

/** Map concept strings (from SAM-3 prompts) to semantic label IDs. */
export const CONCEPT_TO_LABEL: Record<string, SemanticLabel> = {
  floor: SemanticLabel.FLOOR,
  wall: SemanticLabel.WALL,
  ceiling: SemanticLabel.CEILING,
  door: SemanticLabel.DOOR,
  window: SemanticLabel.WINDOW,
  sofa: SemanticLabel.SOFA,
  table: SemanticLabel.TABLE,
  chair: SemanticLabel.CHAIR,
  rug: SemanticLabel.RUG,
  lamp: SemanticLabel.LAMP,
  bookshelf: SemanticLabel.BOOKSHELF,
  painting: SemanticLabel.PAINTING,
};

/* ── Segmentation (SAM-3 via fal.ai) ── */

export type SegmentationMask = {
  label: string;
  rle: string;
  score: number;
  box: [number, number, number, number]; // cx, cy, w, h (normalized)
};

export type SegmentationResult = {
  masks: SegmentationMask[];
  imageWidth: number;
  imageHeight: number;
  viewProjectionMatrix: number[]; // 16 floats, column-major
  cameraPosition: [number, number, number]; // world-space camera origin
};
