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
 * Simulates a downward-tilted LiDAR sensor by casting a fan of rays
 * using Rapier's WASM-accelerated raycasting.
 *
 * Rays are tilted slightly downward (configurable via lidarTiltDeg) so they
 * can detect the floor surface. Surface normals are used to distinguish:
 *   - Floor hits (normal.y > 0.7) → marked as open/walkable space
 *   - Wall hits  (normal.y ≤ 0.7) → marked as obstacles
 */
export class LidarScanner {
  private rayCount: number;
  private maxRange: number;
  private yOffset: number;
  private noiseStdDev: number;
  private cosTilt: number;
  private sinTilt: number;

  constructor(config: AgentConfig) {
    this.rayCount = config.lidarRayCount;
    this.maxRange = config.lidarMaxRange;
    this.yOffset = config.lidarYOffset;
    this.noiseStdDev = config.noiseStdDev;

    const tiltRad = (config.lidarTiltDeg ?? 10) * (Math.PI / 180);
    this.cosTilt = Math.cos(tiltRad);
    this.sinTilt = Math.sin(tiltRad);
  }

  /**
   * Cast a 360-degree fan of rays from the agent position.
   * Rays are evenly spaced around the full circle, tilted slightly downward.
   *
   * @param rapier  The RAPIER module (for Ray constructor)
   * @param world   The RAPIER.World (for castRayAndGetNormal)
   * @param posX    Agent rigid body X
   * @param posY    Agent rigid body Y
   * @param posZ    Agent rigid body Z
   * @param excludeBody  Optional rigid body to exclude from raycasts (agent's own body)
   * @returns Array of LidarHit results, one per ray
   */
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
      const angle = i * angleStep;
      // Horizontal components scaled by cos(tilt), vertical component tilted down
      const dirX = Math.sin(angle) * this.cosTilt;
      const dirY = -this.sinTilt;
      const dirZ = Math.cos(angle) * this.cosTilt;

      const ray = new rapier.Ray(
        { x: posX, y: sensorY, z: posZ },
        { x: dirX, y: dirY, z: dirZ },
      );

      // solid=false: ignore shapes containing the ray origin (our own capsule).
      // excludeRigidBody: also exclude the agent body for rays that exit and re-enter.
      const result = world.castRayAndGetNormal(
        ray, this.maxRange, false,
        undefined, undefined, undefined, excludeBody,
      );

      if (result && result.toi < this.maxRange) {
        // Ray hit a surface
        let distance = result.toi;
        // Add Gaussian noise
        if (this.noiseStdDev > 0) {
          distance = Math.max(0.1, distance + randn() * this.noiseStdDev);
        }

        // Project hit point onto XZ plane for grid mapping
        const hitWorldX = posX + dirX * distance;
        const hitWorldZ = posZ + dirZ * distance;

        // Use surface normal to distinguish floor from walls:
        //   normal.y > 0.7  → floor/ground (mostly horizontal surface)
        //   normal.y ≤ 0.7  → wall/obstacle (mostly vertical surface)
        // Floor hits are treated as open walkable space, NOT obstacles.
        const isFloor = result.normal.y > 0.7;

        hits.push({
          angle,
          distance,
          worldX: hitWorldX,
          worldZ: hitWorldZ,
          hit: !isFloor, // only walls are occluders
        });
      } else {
        // Ray reached max range without hitting anything —
        // use the XZ projection of the max-range endpoint
        hits.push({
          angle,
          distance: this.maxRange,
          worldX: posX + dirX * this.maxRange,
          worldZ: posZ + dirZ * this.maxRange,
          hit: false,
        });
      }
    }

    return hits;
  }
}
