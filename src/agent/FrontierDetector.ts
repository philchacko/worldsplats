import { CellState, type GridCoord, type FrontierCluster } from './types';
import type { OccupancyGrid } from './OccupancyGrid';

// 4-connected neighbors for frontier check
const N4 = [[-1, 0], [1, 0], [0, -1], [0, 1]] as const;

/**
 * Detects frontier cells (EMPTY cells adjacent to UNKNOWN) and groups
 * them into connected clusters using BFS flood-fill.
 */
export class FrontierDetector {
  // Reusable visited bitmap to avoid GC churn
  private visited: Uint8Array;
  private gridSize: number;

  constructor(gridWidth: number, gridHeight: number) {
    this.gridSize = gridWidth * gridHeight;
    this.visited = new Uint8Array(this.gridSize);
  }

  /**
   * Find all frontier clusters sorted by size (largest first).
   * A frontier cell is an EMPTY cell with at least one UNKNOWN 4-neighbor.
   */
  detect(grid: OccupancyGrid): FrontierCluster[] {
    const { width, height } = grid;

    // Pass 1: identify frontier cells and mark in visited bitmap
    // We repurpose visited: 0 = not frontier, 1 = frontier (unvisited), 2 = frontier (visited/clustered)
    this.visited.fill(0);

    const frontierIndices: number[] = [];
    for (let gz = 0; gz < height; gz++) {
      for (let gx = 0; gx < width; gx++) {
        if (grid.get(gx, gz) !== CellState.EMPTY) continue;
        let isFrontier = false;
        for (const [dx, dz] of N4) {
          const nx = gx + dx;
          const nz = gz + dz;
          if (grid.inBounds(nx, nz) && grid.get(nx, nz) === CellState.UNKNOWN) {
            isFrontier = true;
            break;
          }
        }
        if (isFrontier) {
          const idx = gz * width + gx;
          this.visited[idx] = 1; // mark as frontier
          frontierIndices.push(idx);
        }
      }
    }

    if (frontierIndices.length === 0) return [];

    // Pass 2: BFS flood-fill to cluster connected frontier cells
    const clusters: FrontierCluster[] = [];
    const queue: number[] = [];

    for (const startIdx of frontierIndices) {
      if (this.visited[startIdx] !== 1) continue; // already clustered

      // BFS from this frontier cell
      const cells: GridCoord[] = [];
      let sumGx = 0;
      let sumGz = 0;
      queue.length = 0;
      queue.push(startIdx);
      this.visited[startIdx] = 2;

      let head = 0;
      while (head < queue.length) {
        const idx = queue[head++];
        const gx = idx % width;
        const gz = (idx - gx) / width;
        cells.push({ gx, gz });
        sumGx += gx;
        sumGz += gz;

        // Check 4-neighbors for connected frontier cells
        for (const [dx, dz] of N4) {
          const nx = gx + dx;
          const nz = gz + dz;
          if (nx < 0 || nx >= width || nz < 0 || nz >= height) continue;
          const ni = nz * width + nx;
          if (this.visited[ni] === 1) {
            this.visited[ni] = 2;
            queue.push(ni);
          }
        }
      }

      const size = cells.length;
      clusters.push({
        cells,
        centroid: {
          gx: Math.round(sumGx / size),
          gz: Math.round(sumGz / size),
        },
        size,
      });
    }

    // Sort by size descending
    clusters.sort((a, b) => b.size - a.size);
    return clusters;
  }
}
