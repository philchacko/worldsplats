import * as THREE from 'three';
import { decodeRLE, countMaskPixels } from './rleDecoder';
import type { OccupancyGrid } from './OccupancyGrid';
import { CellState, SemanticLabel, CONCEPT_TO_LABEL } from './types';
import type { SegmentationResult } from './types';

/**
 * Project 2D segmentation masks onto the 3D occupancy grid.
 *
 * For each mask, decodes the RLE to a binary image, samples pixels at a
 * configurable stride, unprojects each sample through the camera frustum,
 * intersects with the floor plane, and tags the corresponding grid cell
 * with the mask's semantic label.
 *
 * This is the "splash" step — painting 2D knowledge onto the 3D grid.
 *
 * @param result The segmentation result from SAM-3 (masks + camera info)
 * @param grid   The occupancy grid to tag
 * @param stride Sample every Nth pixel (default 4). Lower = more accurate but slower.
 * @returns Stats about how many cells were tagged
 */
export function splashSegmentation(
  result: SegmentationResult,
  grid: OccupancyGrid,
  stride = 4,
): { totalTagged: number; perLabel: Record<string, number> } {
  const { masks, imageWidth, imageHeight, viewProjectionMatrix, cameraPosition } = result;

  // Reconstruct the inverse VP matrix for unprojection
  const vpMatrix = new THREE.Matrix4();
  vpMatrix.fromArray(viewProjectionMatrix);
  const vpInverse = vpMatrix.clone().invert();

  const camPos = new THREE.Vector3(cameraPosition[0], cameraPosition[1], cameraPosition[2]);

  // Estimate the average floor height from the grid's known cells
  const floorY = estimateFloorY(grid, camPos);

  const perLabel: Record<string, number> = {};
  let totalTagged = 0;

  // Reusable vectors (avoid per-pixel allocation)
  const ndcNear = new THREE.Vector4();
  const ndcFar = new THREE.Vector4();
  const worldNear = new THREE.Vector4();
  const worldFar = new THREE.Vector4();

  for (const mask of masks) {
    // Map concept string to semantic label
    const label = CONCEPT_TO_LABEL[mask.label.toLowerCase()] ?? SemanticLabel.NONE;
    if (label === SemanticLabel.NONE) {
      console.log(`[splash] skipping unknown concept: "${mask.label}"`);
      continue;
    }

    // Decode RLE to binary mask
    const decoded = decodeRLE(mask.rle, imageWidth, imageHeight);
    const pixelCount = countMaskPixels(decoded);
    if (pixelCount === 0) {
      console.log(`[splash] "${mask.label}" mask is empty after decode`);
      continue;
    }

    console.log(`[splash] "${mask.label}" → ${pixelCount} pixels, label=${SemanticLabel[label]}`);

    // Choose the intersection plane Y based on the concept type
    const intersectY = getIntersectY(label, floorY, camPos.y);

    let tagged = 0;

    // Sample the mask at stride intervals
    for (let py = 0; py < imageHeight; py += stride) {
      for (let px = 0; px < imageWidth; px += stride) {
        if (!decoded[py * imageWidth + px]) continue;

        // Convert pixel to NDC
        const ndcX = (2 * px / imageWidth) - 1;
        const ndcY = 1 - (2 * py / imageHeight);

        // Unproject near and far points
        ndcNear.set(ndcX, ndcY, -1, 1);
        ndcFar.set(ndcX, ndcY, 1, 1);

        worldNear.copy(ndcNear).applyMatrix4(vpInverse);
        worldFar.copy(ndcFar).applyMatrix4(vpInverse);

        // Perspective divide
        if (worldNear.w === 0 || worldFar.w === 0) continue;
        worldNear.divideScalar(worldNear.w);
        worldFar.divideScalar(worldFar.w);

        // Ray direction
        const dirX = worldFar.x - worldNear.x;
        const dirY = worldFar.y - worldNear.y;
        const dirZ = worldFar.z - worldNear.z;

        // Intersect with the horizontal plane at intersectY
        // Ray: P = worldNear + t * dir
        // Solve: worldNear.y + t * dirY = intersectY
        if (Math.abs(dirY) < 1e-6) continue; // ray nearly parallel to plane
        const t = (intersectY - worldNear.y) / dirY;
        if (t < 0) continue; // intersection behind camera

        const hitX = worldNear.x + t * dirX;
        const hitZ = worldNear.z + t * dirZ;

        // Convert to grid coordinates
        const { gx, gz } = grid.worldToGrid(hitX, hitZ);
        if (!grid.inBounds(gx, gz)) continue;

        // Only tag cells that LiDAR has already explored
        const cell = grid.get(gx, gz);
        if (cell === CellState.UNKNOWN) continue;

        // Tag with semantic label (higher-confidence labels overwrite lower)
        const existing = grid.getSemantic(gx, gz);
        if (existing === SemanticLabel.NONE || mask.score > 0.5) {
          grid.setSemantic(gx, gz, label);
          tagged++;
        }
      }
    }

    perLabel[mask.label] = tagged;
    totalTagged += tagged;
  }

  console.log(`[splash] tagged ${totalTagged} cells total:`, perLabel);
  return { totalTagged, perLabel };
}

/**
 * Estimate the floor Y from the grid's known cell heights,
 * biased toward cells near the camera.
 */
function estimateFloorY(grid: OccupancyGrid, camPos: THREE.Vector3): number {
  const agentGrid = grid.worldToGrid(camPos.x, camPos.z);
  const radius = 20; // grid cells
  const minGx = Math.max(0, agentGrid.gx - radius);
  const maxGx = Math.min(grid.width - 1, agentGrid.gx + radius);
  const minGz = Math.max(0, agentGrid.gz - radius);
  const maxGz = Math.min(grid.height - 1, agentGrid.gz + radius);

  let sumY = 0;
  let count = 0;

  for (let gz = minGz; gz <= maxGz; gz++) {
    for (let gx = minGx; gx <= maxGx; gx++) {
      if (grid.get(gx, gz) !== CellState.UNKNOWN) {
        sumY += grid.getHeight(gx, gz);
        count++;
      }
    }
  }

  return count > 0 ? sumY / count : camPos.y - 1.5; // fallback: assume camera ~1.5m above floor
}

/**
 * Choose the Y-plane to intersect based on the concept type.
 * - Floor/rug → floor plane
 * - Wall/door/window/painting → project onto floor for XZ footprint
 * - Ceiling → project onto floor for room outline
 * - Furniture → floor plane (gives XZ footprint)
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function getIntersectY(label: SemanticLabel, floorY: number, _cameraY: number): number {
  // For V1, project everything onto the floor plane.
  // This gives us the XZ footprint of every semantic region,
  // which is exactly what the 2D occupancy grid needs.
  //
  // Future: for walls, could intersect with vertical planes
  // based on the occupancy grid's OCCUPIED cells.
  switch (label) {
    case SemanticLabel.CEILING:
      return floorY; // project ceiling outline down to floor
    default:
      return floorY;
  }
}
