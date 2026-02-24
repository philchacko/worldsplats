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
 * Simulates a horizontal LiDAR sensor by casting a fan of rays
 * using Rapier's WASM-accelerated raycasting.
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

  /**
   * Cast a 360-degree fan of rays from the agent position.
   * Rays are evenly spaced around the full circle.
   *
   * @param rapier  The RAPIER module (for Ray constructor)
   * @param world   The RAPIER.World (for castRayAndGetNormal)
   * @param posX    Agent rigid body X
   * @param posY    Agent rigid body Y
   * @param posZ    Agent rigid body Z
   * @returns Array of LidarHit results, one per ray
   */
  scan(
    rapier: typeof RAPIER,
    world: RAPIER.World,
    posX: number, posY: number, posZ: number,
  ): LidarHit[] {
    const hits: LidarHit[] = [];
    const sensorY = posY + this.yOffset;
    const angleStep = (2 * Math.PI) / this.rayCount;

    for (let i = 0; i < this.rayCount; i++) {
      const angle = i * angleStep;
      const dirX = Math.sin(angle);
      const dirZ = Math.cos(angle);

      const ray = new rapier.Ray(
        { x: posX, y: sensorY, z: posZ },
        { x: dirX, y: 0, z: dirZ },
      );

      const result = world.castRayAndGetNormal(ray, this.maxRange, true);

      if (result && result.toi < this.maxRange) {
        // Ray hit a surface
        let distance = result.toi;
        // Add Gaussian noise
        if (this.noiseStdDev > 0) {
          distance = Math.max(0.1, distance + randn() * this.noiseStdDev);
        }
        hits.push({
          angle,
          distance,
          worldX: posX + dirX * distance,
          worldZ: posZ + dirZ * distance,
          hit: true,
        });
      } else {
        // Ray reached max range without hitting anything
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
