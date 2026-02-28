import { CellState, SemanticLabel, type AgentConfig, type GridCoord } from './types';

/**
 * 2D occupancy grid for the XZ plane. Each cell stores UNKNOWN, EMPTY, or OCCUPIED.
 * Also maintains a height map (floor Y per cell) for surface-following visualization,
 * and a semantic label layer populated by SAM-3 segmentation splash projection.
 * Uses flat typed arrays for memory efficiency.
 */
export class OccupancyGrid {
  readonly width: number;
  readonly height: number;
  readonly cellSize: number;
  readonly cells: Uint8Array;
  /** Floor Y height per cell (parallel to cells array). */
  readonly heights: Float32Array;
  /** Semantic label per cell (SemanticLabel enum, 0 = NONE). */
  readonly semantics: Uint8Array;
  /** World X of grid cell (0, 0) bottom-left corner */
  originX: number;
  /** World Z of grid cell (0, 0) bottom-left corner */
  originZ: number;

  constructor(
    config: Pick<AgentConfig, 'gridWidth' | 'gridHeight' | 'cellSize'>,
    originX: number,
    originZ: number,
  ) {
    this.width = config.gridWidth;
    this.height = config.gridHeight;
    this.cellSize = config.cellSize;
    this.cells = new Uint8Array(this.width * this.height); // all UNKNOWN (0)
    this.heights = new Float32Array(this.width * this.height); // all 0
    this.semantics = new Uint8Array(this.width * this.height); // all NONE (0)
    this.originX = originX;
    this.originZ = originZ;
  }

  /** Convert world XZ coordinates to grid coordinates. */
  worldToGrid(wx: number, wz: number): GridCoord {
    return {
      gx: Math.floor((wx - this.originX) / this.cellSize),
      gz: Math.floor((wz - this.originZ) / this.cellSize),
    };
  }

  /** Convert grid coordinates to world XZ center of the cell. */
  gridToWorld(gx: number, gz: number): { wx: number; wz: number } {
    return {
      wx: this.originX + (gx + 0.5) * this.cellSize,
      wz: this.originZ + (gz + 0.5) * this.cellSize,
    };
  }

  inBounds(gx: number, gz: number): boolean {
    return gx >= 0 && gx < this.width && gz >= 0 && gz < this.height;
  }

  get(gx: number, gz: number): CellState {
    if (!this.inBounds(gx, gz)) return CellState.UNKNOWN;
    return this.cells[gz * this.width + gx] as CellState;
  }

  set(gx: number, gz: number, state: CellState): void {
    if (!this.inBounds(gx, gz)) return;
    this.cells[gz * this.width + gx] = state;
  }

  getHeight(gx: number, gz: number): number {
    if (!this.inBounds(gx, gz)) return 0;
    return this.heights[gz * this.width + gx];
  }

  setHeight(gx: number, gz: number, y: number): void {
    if (!this.inBounds(gx, gz)) return;
    this.heights[gz * this.width + gx] = y;
  }

  getSemantic(gx: number, gz: number): SemanticLabel {
    if (!this.inBounds(gx, gz)) return SemanticLabel.NONE;
    return this.semantics[gz * this.width + gx] as SemanticLabel;
  }

  setSemantic(gx: number, gz: number, label: SemanticLabel): void {
    if (!this.inBounds(gx, gz)) return;
    this.semantics[gz * this.width + gx] = label;
  }

  /**
   * Mark cells along a ray from (fromWx, fromWz) to (toWx, toWz).
   * All cells along the ray become EMPTY. If hitOccluder is true,
   * the endpoint cell becomes OCCUPIED.
   * Heights are linearly interpolated from fromY to toY along the ray.
   * Uses Bresenham's line algorithm in grid space.
   */
  markRay(
    fromWx: number, fromWz: number, fromY: number,
    toWx: number, toWz: number, toY: number,
    hitOccluder: boolean,
  ): void {
    const g0 = this.worldToGrid(fromWx, fromWz);
    const g1 = this.worldToGrid(toWx, toWz);

    let { gx: x0, gz: z0 } = g0;
    const { gx: x1, gz: z1 } = g1;

    const dx = Math.abs(x1 - x0);
    const dz = Math.abs(z1 - z0);
    const sx = x0 < x1 ? 1 : -1;
    const sz = z0 < z1 ? 1 : -1;
    let err = dx - dz;

    // Total steps for height interpolation
    const totalSteps = Math.max(dx, dz) || 1;
    let step = 0;

    // Walk the line, marking cells as EMPTY (except the last one)
    while (true) {
      const isEnd = x0 === x1 && z0 === z1;
      const t = step / totalSteps;
      const cellY = fromY + (toY - fromY) * t;

      if (isEnd) {
        // Endpoint: occupied if ray hit something, else empty
        if (hitOccluder) {
          this.set(x0, z0, CellState.OCCUPIED);
        } else if (this.get(x0, z0) === CellState.UNKNOWN) {
          this.set(x0, z0, CellState.EMPTY);
        }
        this.setHeight(x0, z0, toY);
        break;
      }

      // Intermediate cells are always free space
      if (this.get(x0, z0) !== CellState.OCCUPIED) {
        this.set(x0, z0, CellState.EMPTY);
      }
      this.setHeight(x0, z0, cellY);

      step++;
      const e2 = 2 * err;
      if (e2 > -dz) {
        err -= dz;
        x0 += sx;
      }
      if (e2 < dx) {
        err += dx;
        z0 += sz;
      }
    }
  }

  /**
   * Find a good exploration target — the direction with the most frontier cells
   * (UNKNOWN cells adjacent to EMPTY/OCCUPIED). Returns [wx, wz] or null.
   */
  findExplorationTarget(agentWx: number, agentWz: number, maxDist: number): [number, number] | null {
    const ag = this.worldToGrid(agentWx, agentWz);
    const maxCells = Math.ceil(maxDist / this.cellSize);

    // Count frontier cells in 8 angular sectors
    const SECTORS = 8;
    const counts = new Array(SECTORS).fill(0);
    const sumGx = new Array(SECTORS).fill(0);
    const sumGz = new Array(SECTORS).fill(0);

    const minGx = Math.max(0, ag.gx - maxCells);
    const maxGx = Math.min(this.width - 1, ag.gx + maxCells);
    const minGz = Math.max(0, ag.gz - maxCells);
    const maxGz = Math.min(this.height - 1, ag.gz + maxCells);

    for (let gz = minGz; gz <= maxGz; gz++) {
      for (let gx = minGx; gx <= maxGx; gx++) {
        const idx = gz * this.width + gx;
        if (this.cells[idx] !== CellState.UNKNOWN) continue;

        // Must be adjacent to a known cell (frontier edge)
        if (!this._isFrontier(gx, gz)) continue;

        const dx = gx - ag.gx;
        const dz = gz - ag.gz;
        const dist = Math.sqrt(dx * dx + dz * dz);
        if (dist < 3 || dist > maxCells) continue;

        const angle = Math.atan2(dx, dz); // -PI to PI
        const sector = Math.floor(((angle + Math.PI) / (2 * Math.PI)) * SECTORS) % SECTORS;
        counts[sector]++;
        sumGx[sector] += gx;
        sumGz[sector] += gz;
      }
    }

    // Pick sector with most frontier cells
    let best = -1, bestCount = 0;
    for (let i = 0; i < SECTORS; i++) {
      if (counts[i] > bestCount) {
        bestCount = counts[i];
        best = i;
      }
    }

    if (best < 0 || bestCount < 5) return null;

    // Target is the centroid of frontier cells in that sector
    const cx = sumGx[best] / counts[best];
    const cz = sumGz[best] / counts[best];
    const { wx, wz } = this.gridToWorld(Math.round(cx), Math.round(cz));
    return [wx, wz];
  }

  /** Check if a cell is on the frontier (UNKNOWN but adjacent to known). */
  private _isFrontier(gx: number, gz: number): boolean {
    const offsets = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    for (const [dx, dz] of offsets) {
      const nx = gx + dx;
      const nz = gz + dz;
      if (nx >= 0 && nx < this.width && nz >= 0 && nz < this.height) {
        const state = this.cells[nz * this.width + nx];
        if (state === CellState.EMPTY || state === CellState.OCCUPIED) return true;
      }
    }
    return false;
  }

  /** Reset all cells to UNKNOWN and clear semantic labels. */
  reset(): void {
    this.cells.fill(CellState.UNKNOWN);
    this.heights.fill(0);
    this.semantics.fill(SemanticLabel.NONE);
  }

  /** Count cells by state for statistics. */
  stats(): { unknown: number; empty: number; occupied: number; totalKnown: number; labeled: number } {
    let unknown = 0;
    let empty = 0;
    let occupied = 0;
    let labeled = 0;
    const len = this.cells.length;
    for (let i = 0; i < len; i++) {
      switch (this.cells[i]) {
        case CellState.UNKNOWN: unknown++; break;
        case CellState.EMPTY: empty++; break;
        case CellState.OCCUPIED: occupied++; break;
      }
      if (this.semantics[i] !== SemanticLabel.NONE) labeled++;
    }
    return { unknown, empty, occupied, totalKnown: empty + occupied, labeled };
  }
}
