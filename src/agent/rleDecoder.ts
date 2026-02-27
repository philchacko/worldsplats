/**
 * Decode SAM-3 / COCO-style RLE masks to binary Uint8Array.
 *
 * fal.ai's SAM-3 `image-rle` endpoint returns masks in COCO binary RLE format:
 * a variable-length encoded string where each character encodes 6 bits (ASCII
 * offset 48). The decoded counts alternate between background (0) and foreground
 * (1), starting with background. The mask is column-major (Fortran order):
 * pixel (x, y) → index y + x * height.
 *
 * This module decodes that format and returns a **row-major** Uint8Array
 * (pixel (x, y) → index y * width + x) for convenient iteration.
 */

/**
 * Decode COCO binary RLE string into run-length counts.
 *
 * Each character in the string contributes 5 data bits + 1 continuation bit.
 * Characters are ASCII value - 48. When the continuation bit (bit 5) is set,
 * the next character continues the current count value.
 */
function decodeCountsFromRLE(encoded: string): number[] {
  const counts: number[] = [];
  let p = 0;

  while (p < encoded.length) {
    let x = 0;
    let shift = 0;
    let more = true;

    while (more && p < encoded.length) {
      const c = encoded.charCodeAt(p) - 48;
      x |= (c & 0x1f) << (5 * shift);
      more = (c & 0x20) !== 0;
      p++;
      shift++;
    }

    counts.push(x);
  }

  return counts;
}

/**
 * Try to parse as simple comma/space-separated integer counts.
 * Returns null if the string doesn't look like that format.
 */
function tryParseSimpleCounts(encoded: string): number[] | null {
  // If every character is a digit, comma, space, or newline → simple format
  if (!/^[\d\s,]+$/.test(encoded)) return null;
  const counts = encoded.trim().split(/[\s,]+/).map(Number);
  if (counts.some(isNaN)) return null;
  return counts;
}

/**
 * Decode an RLE string from fal.ai SAM-3 into a row-major binary mask.
 *
 * Auto-detects format:
 * 1. Simple comma/space-separated integer counts
 * 2. COCO binary RLE (variable-length ASCII encoding)
 *
 * @param rle    The RLE string from the API response
 * @param width  Image width in pixels
 * @param height Image height in pixels
 * @returns Row-major Uint8Array where 1 = foreground, 0 = background
 */
export function decodeRLE(rle: string, width: number, height: number): Uint8Array {
  const total = width * height;
  const mask = new Uint8Array(total);

  // Try simple format first
  let counts = tryParseSimpleCounts(rle);
  if (!counts) {
    // Fall back to COCO binary RLE
    counts = decodeCountsFromRLE(rle);
  }

  if (counts.length === 0) {
    console.warn('[rleDecoder] empty counts from RLE string of length', rle.length);
    return mask;
  }

  // COCO RLE is column-major. Build a column-major buffer first,
  // then transpose to row-major for easier iteration.
  const colMajor = new Uint8Array(total);
  let idx = 0;
  let value = 0; // Start with background (0)

  for (const count of counts) {
    for (let i = 0; i < count && idx < total; i++) {
      colMajor[idx++] = value;
    }
    value = 1 - value; // Toggle 0 ↔ 1
  }

  // Transpose: column-major (x, y) → y + x * height
  //         → row-major   (x, y) → y * width + x
  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) {
      mask[y * width + x] = colMajor[y + x * height];
    }
  }

  return mask;
}

/**
 * Count the number of foreground (1) pixels in a decoded mask.
 * Useful for logging / debugging.
 */
export function countMaskPixels(mask: Uint8Array): number {
  let count = 0;
  for (let i = 0; i < mask.length; i++) {
    if (mask[i]) count++;
  }
  return count;
}
