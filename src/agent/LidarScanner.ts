import type * as RAPIER from '@dimforge/rapier3d-compat';
import type { AgentConfig, LidarHit } from './types';

/** Box-Muller transform for Gaussian noise. */
function randn(): number {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

/**
 * Elevation angles (degrees) for the vertical fan per azimuth.
 * Negative = downward, positive = upward.
 *
 *  -25° : steep down — detects nearby low furniture (coffee tables, couch bases)
 *  -12° : moderate down — detects floor at ~4 m, mid-height furniture
 *   -5° : shallow down — detects floor at ~10 m
 *    0° : horizontal — primary wall/obstacle detection
 *   +5° : slight up — catches tall furniture, upper walls
 *  +12° : upward — catches high walls, doorways
 */
const ELEVATION_DEG = [-25, -12, -5, 0, 5, 12];
const ELEVATION_COS = ELEVATION_DEG.map(d => Math.cos(d * Math.PI / 180));
const ELEVATION_SIN = ELEVATION_DEG.map(d => Math.sin(d * Math.PI / 180));

/**
 * Vertical-fan LiDAR sensor.
 *
 * For each of N azimuth directions, casts rays at multiple elevation angles
 * and synthesises a single 2D result per azimuth:
 *
 *   1. The closest WALL hit (|normal.y| ≤ 0.7) caps the walkable distance.
 *   2. Floor hits (normal.y > 0.7) and misses extend the known-clear area.
 *   3. Ceiling hits (normal.y < -0.7) are ignored.
 *
 * This ensures cells behind obstacles are never marked walkable — the wall
 * distance always wins over a floor hit that "flew over" the obstacle.
 *
 * Returns exactly `rayCount` LidarHit entries (one per azimuth).
 * Total raycasts = rayCount × len(ELEVATION_DEG).
 */
export class LidarScanner {
  private rayCount: number;
  private maxRange: number;
  private yOffset: number;
  private noiseStdDev: number;

  constructor(config: AgentConfig) {
    this.rayCount = config.lidarRayCount;
    this.maxRange = config.lidarMaxRange;
    this.yOffset = config.lidarYOffset;
    this.noiseStdDev = config.noiseStdDev;
  }

  scan(
    rapier: typeof RAPIER,
    world: RAPIER.World,
    posX: number, posY: number, posZ: number,
    excludeBody?: RAPIER.RigidBody,
  ): LidarHit[] {
    const hits: LidarHit[] = [];
    const sensorY = posY + this.yOffset;
    const angleStep = (2 * Math.PI) / this.rayCount;

    for (let i = 0; i < this.rayCount; i++) {
      const azimuth = i * angleStep;
      const sinAz = Math.sin(azimuth);
      const cosAz = Math.cos(azimuth);

      // Per-azimuth aggregates across all elevation rays
      let closestWallDist = this.maxRange; // horizontal distance to closest wall
      let wallHit = false;
      let farthestClearDist = 0;           // farthest known-clear horizontal distance

      for (let e = 0; e < ELEVATION_DEG.length; e++) {
        const cosEl = ELEVATION_COS[e];
        const sinEl = ELEVATION_SIN[e];

        // Direction: azimuth rotates in XZ, elevation tilts in Y
        const dirX = sinAz * cosEl;
        const dirY = sinEl; // negative for downward angles
        const dirZ = cosAz * cosEl;

        const ray = new rapier.Ray(
          { x: posX, y: sensorY, z: posZ },
          { x: dirX, y: dirY, z: dirZ },
        );

        const result = world.castRayAndGetNormal(
          ray, this.maxRange, false,
          undefined, undefined, undefined, excludeBody,
        );

        if (result && result.toi < this.maxRange) {
          const horizDist = result.toi * cosEl;

          // Classify by surface normal
          if (Math.abs(result.normal.y) <= 0.7) {
            // Wall / furniture — obstacle
            if (horizDist < closestWallDist) {
              closestWallDist = horizDist;
              wallHit = true;
            }
          } else if (result.normal.y > 0) {
            // Floor — walkable surface
            farthestClearDist = Math.max(farthestClearDist, horizDist);
          }
          // Ceiling hits (normal.y < -0.7) are ignored for 2D navigation
        } else {
          // Miss — direction is clear to max range (horizontal projection)
          farthestClearDist = Math.max(farthestClearDist, this.maxRange * cosEl);
        }
      }

      // Synthesise one hit per azimuth:
      //   Wall found → effective distance = wall distance (caps everything)
      //   No wall    → effective distance = farthest clear distance
      let effectiveDist: number;
      if (wallHit) {
        effectiveDist = closestWallDist;
      } else {
        effectiveDist = farthestClearDist > 0 ? farthestClearDist : this.maxRange;
      }

      // Add noise to wall-hit distances
      if (this.noiseStdDev > 0 && wallHit) {
        effectiveDist = Math.max(0.1, effectiveDist + randn() * this.noiseStdDev);
      }

      hits.push({
        angle: azimuth,
        distance: effectiveDist,
        worldX: posX + sinAz * effectiveDist,
        worldZ: posZ + cosAz * effectiveDist,
        hit: wallHit,
      });
    }

    return hits;
  }
}
