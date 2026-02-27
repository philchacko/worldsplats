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
 *   2. Floor hits (horizontal surface BELOW the sensor) and misses extend
 *      the known-clear area.
 *   3. Ceiling hits (horizontal surface ABOVE the sensor) are ignored.
 *
 * Classification uses hit-point Y relative to the sensor, not normal direction,
 * so it works correctly regardless of triangle winding / collider rotation.
 *
 * Each hit includes a worldY (floor height at the endpoint) for surface-following
 * visualization. Also provides agentFloorY via a downward probe.
 *
 * Returns exactly `rayCount` LidarHit entries (one per azimuth).
 * Total raycasts = rayCount × len(ELEVATION_DEG) + 1 (floor probe).
 */
export class LidarScanner {
  private rayCount: number;
  private maxRange: number;
  private yOffset: number;
  private noiseStdDev: number;

  /** Floor Y at the agent's position from the most recent scan. */
  agentFloorY = 0;

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
  ): LidarHit[] {
    const hits: LidarHit[] = [];
    const sensorY = posY + this.yOffset;
    const angleStep = (2 * Math.PI) / this.rayCount;

    // ── Downward probe: find floor Y directly below the agent ─────────
    // Start from just below the sensor to skip the ceiling.
    const probeRay = new rapier.Ray(
      { x: posX, y: sensorY, z: posZ },
      { x: 0, y: -1, z: 0 },
    );
    const probeResult = world.castRayAndGetNormal(
      probeRay, 10, false,
      undefined, undefined, undefined, undefined,
    );
    this.agentFloorY = probeResult
      ? sensorY - probeResult.toi
      : posY;

    // ── Per-azimuth vertical fan ──────────────────────────────────────
    for (let i = 0; i < this.rayCount; i++) {
      const azimuth = i * angleStep;
      const sinAz = Math.sin(azimuth);
      const cosAz = Math.cos(azimuth);

      // Per-azimuth aggregates across all elevation rays
      let closestWallDist = this.maxRange;
      let wallHit = false;
      let farthestClearDist = 0;
      let floorY = this.agentFloorY; // default to agent's floor height

      for (let e = 0; e < ELEVATION_DEG.length; e++) {
        const cosEl = ELEVATION_COS[e];
        const sinEl = ELEVATION_SIN[e];

        const dirX = sinAz * cosEl;
        const dirY = sinEl;
        const dirZ = cosAz * cosEl;

        const ray = new rapier.Ray(
          { x: posX, y: sensorY, z: posZ },
          { x: dirX, y: dirY, z: dirZ },
        );

        const result = world.castRayAndGetNormal(
          ray, this.maxRange, false,
          undefined, undefined, undefined, undefined,
        );

        if (result && result.toi < this.maxRange) {
          const horizDist = result.toi * cosEl;
          const hitY = sensorY + dirY * result.toi;

          if (Math.abs(result.normal.y) <= 0.7) {
            // Wall / furniture — obstacle (roughly vertical surface)
            if (horizDist < closestWallDist) {
              closestWallDist = horizDist;
              wallHit = true;
            }
          } else if (hitY < sensorY) {
            // Horizontal surface BELOW sensor → floor (walkable)
            // Uses position, not normal direction, so it's rotation-agnostic.
            if (horizDist > farthestClearDist) {
              farthestClearDist = horizDist;
              floorY = hitY;
            }
          }
          // Horizontal surface ABOVE sensor → ceiling → ignored
        } else {
          farthestClearDist = Math.max(farthestClearDist, this.maxRange * cosEl);
        }
      }

      // Synthesise one hit per azimuth
      let effectiveDist: number;
      if (wallHit) {
        effectiveDist = closestWallDist;
      } else {
        effectiveDist = farthestClearDist > 0 ? farthestClearDist : this.maxRange;
      }

      if (this.noiseStdDev > 0 && wallHit) {
        effectiveDist = Math.max(0.1, effectiveDist + randn() * this.noiseStdDev);
      }

      hits.push({
        angle: azimuth,
        distance: effectiveDist,
        worldX: posX + sinAz * effectiveDist,
        worldZ: posZ + cosAz * effectiveDist,
        worldY: floorY,
        hit: wallHit,
      });
    }

    return hits;
  }
}
