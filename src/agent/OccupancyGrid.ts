import { CellState, type AgentConfig, type GridCoord } from './types';

/**
 * 2D occupancy grid for the XZ plane. Each cell stores UNKNOWN, EMPTY, or OCCUPIED.
 * Uses a flat Uint8Array for memory efficiency.
 */
export class OccupancyGrid {
  readonly width: number;
  readonly height: number;
  readonly cellSize: number;
  readonly cells: Uint8Array;
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

  /**
   * Mark cells along a ray from (fromWx, fromWz) to (toWx, toWz).
   * All cells along the ray become EMPTY. If hitOccluder is true,
   * the endpoint cell becomes OCCUPIED.
   * Uses Bresenham's line algorithm in grid space.
   */
  markRay(
    fromWx: number, fromWz: number,
    toWx: number, toWz: number,
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

    // Walk the line, marking cells as EMPTY (except the last one)
    while (true) {
      const isEnd = x0 === x1 && z0 === z1;
      if (isEnd) {
        // Endpoint: occupied if ray hit something, else empty
        if (hitOccluder) {
          this.set(x0, z0, CellState.OCCUPIED);
        } else if (this.get(x0, z0) === CellState.UNKNOWN) {
          this.set(x0, z0, CellState.EMPTY);
        }
        break;
      }

      // Intermediate cells are always free space
      if (this.get(x0, z0) !== CellState.OCCUPIED) {
        this.set(x0, z0, CellState.EMPTY);
      }

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

  /** Reset all cells to UNKNOWN. */
  reset(): void {
    this.cells.fill(CellState.UNKNOWN);
  }

  /** Count cells by state for statistics. */
  stats(): { unknown: number; empty: number; occupied: number; totalKnown: number } {
    let unknown = 0;
    let empty = 0;
    let occupied = 0;
    const len = this.cells.length;
    for (let i = 0; i < len; i++) {
      switch (this.cells[i]) {
        case CellState.UNKNOWN: unknown++; break;
        case CellState.EMPTY: empty++; break;
        case CellState.OCCUPIED: occupied++; break;
      }
    }
    return { unknown, empty, occupied, totalKnown: empty + occupied };
  }
}
