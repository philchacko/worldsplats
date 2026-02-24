import { CellState, type GridCoord, type PathResult } from './types';
import type { OccupancyGrid } from './OccupancyGrid';

const SQRT2 = Math.SQRT2;

// 8-directional neighbors: [dx, dz, cost]
const NEIGHBORS: [number, number, number][] = [
  [-1, 0, 1], [1, 0, 1], [0, -1, 1], [0, 1, 1],            // cardinal
  [-1, -1, SQRT2], [-1, 1, SQRT2], [1, -1, SQRT2], [1, 1, SQRT2], // diagonal
];

/** Octile distance heuristic (consistent with 8-directional movement). */
function heuristic(ax: number, az: number, bx: number, bz: number): number {
  const dx = Math.abs(ax - bx);
  const dz = Math.abs(az - bz);
  return Math.max(dx, dz) + (SQRT2 - 1) * Math.min(dx, dz);
}

/** Simple binary min-heap keyed by f-score. */
class MinHeap {
  private data: { key: number; f: number }[] = [];

  get length() { return this.data.length; }

  push(key: number, f: number) {
    this.data.push({ key, f });
    this.siftUp(this.data.length - 1);
  }

  pop(): number {
    const top = this.data[0].key;
    const last = this.data.pop()!;
    if (this.data.length > 0) {
      this.data[0] = last;
      this.siftDown(0);
    }
    return top;
  }

  private siftUp(i: number) {
    const d = this.data;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (d[parent].f <= d[i].f) break;
      [d[parent], d[i]] = [d[i], d[parent]];
      i = parent;
    }
  }

  private siftDown(i: number) {
    const d = this.data;
    const n = d.length;
    while (true) {
      let smallest = i;
      const l = 2 * i + 1;
      const r = 2 * i + 2;
      if (l < n && d[l].f < d[smallest].f) smallest = l;
      if (r < n && d[r].f < d[smallest].f) smallest = r;
      if (smallest === i) break;
      [d[smallest], d[i]] = [d[i], d[smallest]];
      i = smallest;
    }
  }
}

/**
 * A* pathfinder on a 2D occupancy grid.
 * Only walks on EMPTY cells; treats UNKNOWN and OCCUPIED as impassable.
 */
export class AStarPathfinder {
  /**
   * Find the shortest path from start to goal.
   * Returns null if no path exists within maxIterations.
   */
  static findPath(
    grid: OccupancyGrid,
    start: GridCoord,
    goal: GridCoord,
    maxIterations = 5000,
  ): PathResult | null {
    const { width, height } = grid;

    // Ensure goal is reachable (must be EMPTY or at least in-bounds)
    if (!grid.inBounds(goal.gx, goal.gz)) return null;
    // Allow navigating to the closest EMPTY cell near the goal
    const actualGoal = grid.get(goal.gx, goal.gz) === CellState.EMPTY
      ? goal
      : AStarPathfinder.findNearestEmpty(grid, goal);
    if (!actualGoal) return null;

    const toKey = (gx: number, gz: number) => gz * width + gx;
    const startKey = toKey(start.gx, start.gz);
    const goalKey = toKey(actualGoal.gx, actualGoal.gz);

    if (startKey === goalKey) {
      return { path: [start], worldPath: [AStarPathfinder.toWorld(grid, start)], cost: 0 };
    }

    const gScore = new Float32Array(width * height).fill(Infinity);
    const cameFrom = new Int32Array(width * height).fill(-1);
    const inOpen = new Uint8Array(width * height); // 1 = in open set

    gScore[startKey] = 0;
    inOpen[startKey] = 1;

    const open = new MinHeap();
    open.push(startKey, heuristic(start.gx, start.gz, actualGoal.gx, actualGoal.gz));

    let iterations = 0;

    while (open.length > 0 && iterations < maxIterations) {
      iterations++;
      const currentKey = open.pop();
      if (currentKey === goalKey) {
        return AStarPathfinder.reconstructPath(grid, cameFrom, currentKey, width, gScore[goalKey]);
      }

      inOpen[currentKey] = 0;
      const cx = currentKey % width;
      const cz = (currentKey - cx) / width;

      for (const [dx, dz, cost] of NEIGHBORS) {
        const nx = cx + dx;
        const nz = cz + dz;
        if (nx < 0 || nx >= width || nz < 0 || nz >= height) continue;
        if (grid.get(nx, nz) !== CellState.EMPTY) continue;

        // For diagonal moves, check that both cardinal neighbors are passable
        // (prevents cutting corners through walls)
        if (dx !== 0 && dz !== 0) {
          if (grid.get(cx + dx, cz) !== CellState.EMPTY) continue;
          if (grid.get(cx, cz + dz) !== CellState.EMPTY) continue;
        }

        const nKey = toKey(nx, nz);
        const tentG = gScore[currentKey] + cost;
        if (tentG < gScore[nKey]) {
          cameFrom[nKey] = currentKey;
          gScore[nKey] = tentG;
          const f = tentG + heuristic(nx, nz, actualGoal.gx, actualGoal.gz);
          // Always push (may create duplicates, but they'll have higher f and be ignored)
          open.push(nKey, f);
        }
      }
    }

    return null; // No path found
  }

  /** Find the nearest EMPTY cell to a given coordinate using BFS. */
  private static findNearestEmpty(grid: OccupancyGrid, from: GridCoord): GridCoord | null {
    const { width, height } = grid;
    const visited = new Uint8Array(width * height);
    const queue: GridCoord[] = [from];
    visited[from.gz * width + from.gx] = 1;
    let head = 0;

    while (head < queue.length && head < 1000) {
      const { gx, gz } = queue[head++];
      if (grid.get(gx, gz) === CellState.EMPTY) return { gx, gz };

      for (const [dx, dz] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) {
        const nx = gx + dx;
        const nz = gz + dz;
        if (nx < 0 || nx >= width || nz < 0 || nz >= height) continue;
        const ni = nz * width + nx;
        if (visited[ni]) continue;
        visited[ni] = 1;
        queue.push({ gx: nx, gz: nz });
      }
    }
    return null;
  }

  /** Reconstruct path from cameFrom array and convert to world coordinates. */
  private static reconstructPath(
    grid: OccupancyGrid,
    cameFrom: Int32Array,
    goalKey: number,
    width: number,
    cost: number,
  ): PathResult {
    const path: GridCoord[] = [];
    let key = goalKey;
    while (key !== -1) {
      const gx = key % width;
      const gz = (key - gx) / width;
      path.push({ gx, gz });
      key = cameFrom[key];
    }
    path.reverse();

    // Smooth path: remove waypoints with clear line-of-sight
    const smoothed = AStarPathfinder.smoothPath(grid, path);

    const worldPath = smoothed.map(c => AStarPathfinder.toWorld(grid, c));
    return { path: smoothed, worldPath, cost };
  }

  /** Remove intermediate waypoints where direct line-of-sight exists. */
  private static smoothPath(grid: OccupancyGrid, path: GridCoord[]): GridCoord[] {
    if (path.length <= 2) return path;
    const result: GridCoord[] = [path[0]];
    let anchor = 0;

    while (anchor < path.length - 1) {
      let farthest = anchor + 1;
      for (let i = anchor + 2; i < path.length; i++) {
        if (AStarPathfinder.hasLineOfSight(grid, path[anchor], path[i])) {
          farthest = i;
        }
      }
      result.push(path[farthest]);
      anchor = farthest;
    }
    return result;
  }

  /** Check if there's a clear line between two grid cells (Bresenham). */
  private static hasLineOfSight(grid: OccupancyGrid, a: GridCoord, b: GridCoord): boolean {
    let { gx: x0, gz: z0 } = a;
    const { gx: x1, gz: z1 } = b;

    const dx = Math.abs(x1 - x0);
    const dz = Math.abs(z1 - z0);
    const sx = x0 < x1 ? 1 : -1;
    const sz = z0 < z1 ? 1 : -1;
    let err = dx - dz;

    while (true) {
      if (grid.get(x0, z0) !== CellState.EMPTY) return false;
      if (x0 === x1 && z0 === z1) return true;

      const e2 = 2 * err;
      if (e2 > -dz) { err -= dz; x0 += sx; }
      if (e2 < dx) { err += dx; z0 += sz; }
    }
  }

  private static toWorld(grid: OccupancyGrid, c: GridCoord): [number, number] {
    const { wx, wz } = grid.gridToWorld(c.gx, c.gz);
    return [wx, wz];
  }
}
