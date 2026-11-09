/**
 * Browser-only, token-free matching pipeline.
 * Production indexing stores pHash + HSV histogram + ORB descriptors once.
 * Query photos are perspective-normalized, shortlisted with cheap features,
 * then verified with ORB/Hamming and a RANSAC homography in OpenCV.js.
 */
export interface ImageFingerprint {
  pHash: bigint;
  histogram: Float32Array;
  width: number;
  height: number;
}

export function hammingDistance(a: bigint, b: bigint): number {
  let value = a ^ b;
  let count = 0;
  while (value) { count += Number(value & 1n); value >>= 1n; }
  return count;
}

export function histogramSimilarity(a: Float32Array, b: Float32Array): number {
  const size = Math.min(a.length, b.length);
  let intersection = 0;
  let total = 0;
  for (let index = 0; index < size; index += 1) {
    intersection += Math.min(a[index], b[index]);
    total += Math.max(a[index], b[index]);
  }
  return total === 0 ? 0 : intersection / total;
}

export function coarseScore(query: ImageFingerprint, reference: ImageFingerprint): number {
  const hashScore = 1 - hammingDistance(query.pHash, reference.pHash) / 64;
  return hashScore * 0.7 + histogramSimilarity(query.histogram, reference.histogram) * 0.3;
}
