import * as THREE from 'three';
import { captureSnapshot } from './captureSnapshot';
import type { SegmentationMask, SegmentationResult } from './types';

/** Default concept groups for a structural deep scan. */
export const DEFAULT_CONCEPTS = [
  'floor',
  'wall',
  'ceiling',
  'doorway',
  'furniture',
  'window',
];

/**
 * Capture the current scene and run SAM-3 segmentation via the /api/segment proxy.
 *
 * Returns labelled masks + the camera's view-projection matrix
 * (stored for future 3D "splash" projection onto the occupancy grid).
 */
export async function segmentScene(
  gl: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
  concepts: string[] = DEFAULT_CONCEPTS,
): Promise<SegmentationResult> {
  // 1. Capture a JPEG data URI from the renderer
  const imageBase64 = captureSnapshot(gl, scene, camera);

  // 2. Store the view-projection matrix for future 3D projection
  const projMatrix = new THREE.Matrix4();
  if (camera instanceof THREE.PerspectiveCamera || camera instanceof THREE.OrthographicCamera) {
    projMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
  }

  // 3. Call our server-side proxy
  const res = await fetch('/api/segment', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ imageBase64, concepts }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Segmentation failed (${res.status}): ${body}`);
  }

  const { masks } = (await res.json()) as { masks: SegmentationMask[] };

  // Derive image dimensions from the renderer
  const w = gl.domElement.width;
  const h = gl.domElement.height;

  return {
    masks,
    imageWidth: w,
    imageHeight: h,
    viewProjectionMatrix: projMatrix.elements as unknown as number[],
  };
}
