import * as THREE from 'three';

/**
 * Capture a JPEG snapshot from the R3F main canvas.
 *
 * Renders to the default framebuffer (which includes SparkRenderer's
 * Gaussian splats) then reads pixels synchronously before the buffer
 * is cleared. Works even with `preserveDrawingBuffer: false`.
 *
 * Returns a data-URI string: "data:image/jpeg;base64,..."
 */
export function captureSnapshot(
  gl: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
): string {
  const w = gl.domElement.width;
  const h = gl.domElement.height;

  // Render to the main canvas — triggers Spark's splat pass since
  // SparkRenderer is a child of the camera in the scene graph.
  gl.setRenderTarget(null);
  gl.render(scene, camera);

  // Read pixels synchronously from the default framebuffer.
  // This is valid even with preserveDrawingBuffer:false because
  // we're in the same synchronous call stack as render().
  const glCtx = gl.getContext() as WebGL2RenderingContext;
  const pixels = new Uint8Array(w * h * 4);
  glCtx.readPixels(0, 0, w, h, glCtx.RGBA, glCtx.UNSIGNED_BYTE, pixels);

  // WebGL origin is bottom-left; canvas origin is top-left → flip Y
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  const imageData = ctx.createImageData(w, h);

  for (let row = 0; row < h; row++) {
    const srcOffset = (h - 1 - row) * w * 4;
    const dstOffset = row * w * 4;
    imageData.data.set(pixels.subarray(srcOffset, srcOffset + w * 4), dstOffset);
  }

  ctx.putImageData(imageData, 0, 0);
  return canvas.toDataURL('image/jpeg', 0.85);
}
