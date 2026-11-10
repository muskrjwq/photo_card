"use client";

import type { CatalogCard } from "./types";
import type { RecognitionIndexEntry } from "./generated-data";

type Cv = any;
type FeatureSet = { keypoints: any; descriptors: any; coarse: RecognitionIndexEntry; cleanup: () => void };
type StoredFeatures = { points: Uint16Array; descriptors: Uint8Array; count: number; descriptorSize: number };
type DescriptorIndexMeta = { url: string; version: number; descriptorSize: number };

let runtime: Promise<Cv> | null = null;
const descriptorIndexCache = new Map<string, Promise<Map<string, StoredFeatures>>>();

export interface MatchResult {
  card: CatalogCard;
  confidence: number;
  goodMatches: number;
  inlierRatio: number;
  spatialCoverage: number;
  coarseScore: number;
  rankingScore: number;
}

export interface MatchResponse {
  candidates: MatchResult[];
  confident: boolean;
}

async function getOpenCv(): Promise<Cv> {
  if (!runtime) {
    runtime = import("./opencv-runtime").then((module) => module.getOpenCvRuntime());
  }
  return runtime;
}

function loadDescriptorIndex(meta: DescriptorIndexMeta) {
  let pending = descriptorIndexCache.get(meta.url);
  if (pending) return pending;
  pending = fetch(meta.url, { cache: "force-cache" }).then(async (response) => {
    if (!response.ok) throw new Error(`Recognition index download failed: ${response.status}`);
    const buffer = await response.arrayBuffer(); const view = new DataView(buffer); const bytes = new Uint8Array(buffer);
    const magic = String.fromCharCode(...bytes.slice(0, 4)); const version = view.getUint32(4, true); const total = view.getUint32(8, true);
    if (magic !== "PCIX" || version !== meta.version) throw new Error("Recognition index version mismatch");
    const decoder = new TextDecoder("ascii"); const records = new Map<string, StoredFeatures>(); let offset = 12;
    for (let recordIndex = 0; recordIndex < total; recordIndex += 1) {
      const id = decoder.decode(bytes.slice(offset, offset + 8)); const count = view.getUint16(offset + 8, true); const descriptorSize = view.getUint16(offset + 10, true); offset += 12;
      if (descriptorSize !== meta.descriptorSize) throw new Error("Recognition descriptor size mismatch");
      const points = new Uint16Array(count * 2); const descriptors = new Uint8Array(count * descriptorSize);
      for (let pointIndex = 0; pointIndex < count; pointIndex += 1) {
        points[pointIndex * 2] = view.getUint16(offset, true); points[pointIndex * 2 + 1] = view.getUint16(offset + 2, true); offset += 4;
        descriptors.set(bytes.slice(offset, offset + descriptorSize), pointIndex * descriptorSize); offset += descriptorSize;
      }
      records.set(id, { points, descriptors, count, descriptorSize });
    }
    if (offset !== buffer.byteLength) throw new Error("Recognition index is corrupt");
    return records;
  });
  descriptorIndexCache.set(meta.url, pending); return pending;
}

function loadImage(source: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new window.Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("이미지를 읽을 수 없습니다."));
    image.src = source;
  });
}

function orderCorners(points: { x: number; y: number }[]) {
  const sum = points.map((point) => point.x + point.y);
  const diff = points.map((point) => point.x - point.y);
  return [
    points[sum.indexOf(Math.min(...sum))],
    points[diff.indexOf(Math.max(...diff))],
    points[sum.indexOf(Math.max(...sum))],
    points[diff.indexOf(Math.min(...diff))],
  ];
}

function distance(a: { x: number; y: number }, b: { x: number; y: number }) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Detects the largest card-like quadrilateral and warps it to a canonical 2:3 frame. */
function normalizeCard(cv: Cv, source: any) {
  const maxSide = 1200;
  const scale = Math.min(1, maxSide / Math.max(source.cols, source.rows));
  const resized = new cv.Mat();
  cv.resize(source, resized, new cv.Size(Math.round(source.cols * scale), Math.round(source.rows * scale)), 0, 0, cv.INTER_AREA);
  const gray = new cv.Mat(); const blurred = new cv.Mat(); const edges = new cv.Mat();
  cv.cvtColor(resized, gray, cv.COLOR_RGBA2GRAY);
  cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0);
  cv.Canny(blurred, edges, 30, 105);
  const closeKernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(17, 17));
  const dilateKernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(3, 3));
  cv.morphologyEx(edges, edges, cv.MORPH_CLOSE, closeKernel);
  cv.dilate(edges, edges, dilateKernel);
  const contours = new cv.MatVector(); const hierarchy = new cv.Mat();
  cv.findContours(edges, contours, hierarchy, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE);

  const frameArea = resized.rows * resized.cols; let bestPoints: { x: number; y: number }[] | null = null; let bestArea = 0;
  for (let index = 0; index < contours.size(); index += 1) {
    const contour = contours.get(index); const contourArea = Math.abs(cv.contourArea(contour)); const perimeter = cv.arcLength(contour, true); const approx = new cv.Mat();
    cv.approxPolyDP(contour, approx, perimeter * 0.025, true);
    const area = Math.abs(cv.contourArea(approx));
    if (approx.rows === 4 && cv.isContourConvex(approx) && area > bestArea && area > frameArea * 0.035 && area < frameArea * 0.94) {
      const raw = Array.from(approx.data32S as Int32Array);
      const corners = orderCorners([{ x: raw[0], y: raw[1] }, { x: raw[2], y: raw[3] }, { x: raw[4], y: raw[5] }, { x: raw[6], y: raw[7] }]);
      const width = (distance(corners[0], corners[1]) + distance(corners[3], corners[2])) / 2;
      const height = (distance(corners[0], corners[3]) + distance(corners[1], corners[2])) / 2;
      const aspect = Math.min(width, height) / Math.max(width, height);
      if (aspect >= 0.56 && aspect <= 0.76) { bestPoints = corners; bestArea = area; }
    }
    if (contourArea > frameArea * 0.035 && contourArea < frameArea * 0.94) {
      const rotated = cv.minAreaRect(contour); const box = cv.boxPoints(rotated) as { x: number; y: number }[];
      const corners = orderCorners(box); const width = (distance(corners[0], corners[1]) + distance(corners[3], corners[2])) / 2; const height = (distance(corners[0], corners[3]) + distance(corners[1], corners[2])) / 2; const boxArea = width * height; const aspect = Math.min(width, height) / Math.max(width, height); const rectangularity = contourArea / Math.max(1, boxArea);
      if (aspect >= 0.54 && aspect <= 0.78 && rectangularity >= 0.58 && boxArea > bestArea) { bestPoints = corners; bestArea = boxArea; }
    }
    approx.delete(); contour.delete();
  }

  // Low-quality photos can lose a continuous outer edge. In that case, isolate a
  // card-shaped foreground region whose colour differs from the four corners.
  {
    const foreground = new cv.Mat(resized.rows, resized.cols, cv.CV_8UC1);
    const rgba = resized.data as Uint8Array; const maskData = foreground.data as Uint8Array;
    const sampleAt = (x: number, y: number) => { const offset = (y * resized.cols + x) * 4; return [rgba[offset], rgba[offset + 1], rgba[offset + 2]]; };
    const insetX = Math.max(2, Math.round(resized.cols * 0.025)); const insetY = Math.max(2, Math.round(resized.rows * 0.025));
    const backgrounds = [sampleAt(insetX, insetY), sampleAt(resized.cols - insetX - 1, insetY), sampleAt(insetX, resized.rows - insetY - 1), sampleAt(resized.cols - insetX - 1, resized.rows - insetY - 1)];
    let cornerSpread = 0;
    for (const first of backgrounds) for (const second of backgrounds) cornerSpread = Math.max(cornerSpread, Math.hypot(first[0] - second[0], first[1] - second[1], first[2] - second[2]));
    for (let pixel = 0; pixel < resized.rows * resized.cols; pixel += 1) {
      const offset = pixel * 4; let nearest = Number.POSITIVE_INFINITY;
      for (const color of backgrounds) { const red = rgba[offset] - color[0]; const green = rgba[offset + 1] - color[1]; const blue = rgba[offset + 2] - color[2]; nearest = Math.min(nearest, red * red + green * green + blue * blue); }
      maskData[pixel] = nearest > 42 * 42 ? 255 : 0;
    }
    const foregroundClose = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(21, 21)); const foregroundOpen = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(7, 7));
    if (cornerSpread <= 72) { cv.morphologyEx(foreground, foreground, cv.MORPH_CLOSE, foregroundClose); cv.morphologyEx(foreground, foreground, cv.MORPH_OPEN, foregroundOpen); }
    const foregroundContours = new cv.MatVector(); const foregroundHierarchy = new cv.Mat();
    if (cornerSpread <= 72) cv.findContours(foreground, foregroundContours, foregroundHierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);
    for (let index = 0; cornerSpread <= 72 && index < foregroundContours.size(); index += 1) {
      const contour = foregroundContours.get(index); const area = Math.abs(cv.contourArea(contour));
      if (area > frameArea * 0.025 && area < frameArea * 0.9) {
        const rotated = cv.minAreaRect(contour); const box = cv.boxPoints(rotated) as { x: number; y: number }[]; const corners = orderCorners(box);
        const width = (distance(corners[0], corners[1]) + distance(corners[3], corners[2])) / 2; const height = (distance(corners[0], corners[3]) + distance(corners[1], corners[2])) / 2; const boxArea = width * height; const aspect = Math.min(width, height) / Math.max(width, height); const rectangularity = area / Math.max(1, boxArea);
        if (aspect >= 0.52 && aspect <= 0.8 && rectangularity >= 0.48 && boxArea > bestArea) { bestPoints = corners; bestArea = boxArea; }
      }
      contour.delete();
    }
    foreground.delete(); foregroundClose.delete(); foregroundOpen.delete(); foregroundContours.delete(); foregroundHierarchy.delete();
  }

  const output = new cv.Mat();
  if (new URLSearchParams(window.location.search).has("recognitionDebug")) console.info("NORMALIZE_DEBUG", JSON.stringify({ source: { width: source.cols, height: source.rows }, resized: { width: resized.cols, height: resized.rows }, corners: bestPoints, areaRatio: bestArea / frameArea }));
  if (bestPoints) {
    const src = cv.matFromArray(4, 1, cv.CV_32FC2, bestPoints.flatMap((point) => [point.x, point.y]));
    const dst = cv.matFromArray(4, 1, cv.CV_32FC2, [0, 0, 399, 0, 399, 599, 0, 599]);
    const transform = cv.getPerspectiveTransform(src, dst);
    cv.warpPerspective(resized, output, transform, new cv.Size(400, 600), cv.INTER_LINEAR, cv.BORDER_REPLICATE);
    src.delete(); dst.delete(); transform.delete();
  } else {
    cv.resize(resized, output, new cv.Size(400, 600), 0, 0, cv.INTER_AREA);
  }
  gray.delete(); blurred.delete(); edges.delete(); closeKernel.delete(); dilateKernel.delete(); contours.delete(); hierarchy.delete(); resized.delete();
  return output;
}

function extractFeatures(cv: Cv, image: HTMLImageElement, normalizePerspective = true, smooth = false): FeatureSet {
  const source = cv.imread(image); const normalized = new cv.Mat(); const gray = new cv.Mat();
  if (normalizePerspective) {
    const corrected = normalizeCard(cv, source); corrected.copyTo(normalized); corrected.delete();
  } else cv.resize(source, normalized, new cv.Size(400, 600), 0, 0, cv.INTER_AREA);
  if (smooth) {
    const small = new cv.Mat();
    cv.resize(normalized, small, new cv.Size(150, 225), 0, 0, cv.INTER_AREA);
    cv.resize(small, normalized, new cv.Size(400, 600), 0, 0, cv.INTER_CUBIC);
    small.delete();
  }
  cv.cvtColor(normalized, gray, cv.COLOR_RGBA2GRAY); cv.equalizeHist(gray, gray);
  const keypoints = new cv.KeyPointVector(); const descriptors = new cv.Mat(); const mask = new cv.Mat(600, 400, cv.CV_8UC1, new cv.Scalar(0));
  cv.rectangle(mask, new cv.Point(24, 36), new cv.Point(375, 563), new cv.Scalar(255), -1);
  const orb = new cv.ORB(800, 1.2, 8, 24, 0, 2, cv.ORB_HARRIS_SCORE, 31, 12);
  orb.detectAndCompute(gray, mask, keypoints, descriptors);
  const hashMat = new cv.Mat(); const histogramMat = new cv.Mat();
  cv.resize(gray, hashMat, new cv.Size(9, 8), 0, 0, cv.INTER_AREA);
  cv.resize(gray, histogramMat, new cv.Size(64, 96), 0, 0, cv.INTER_AREA);
  let hash = 0n;
  for (let y = 0; y < 8; y += 1) for (let x = 0; x < 8; x += 1) hash = (hash << 1n) | BigInt(hashMat.data[y * 9 + x] > hashMat.data[y * 9 + x + 1] ? 1 : 0);
  const histogram = Array(16).fill(0);
  for (const value of histogramMat.data as Uint8Array) histogram[Math.min(15, Math.floor(value / 16))] += 1;
  const total = histogramMat.data.length;
  const appearanceMat = new cv.Mat();
  cv.resize(gray, appearanceMat, new cv.Size(16, 24), 0, 0, cv.INTER_AREA);
  const coarse = { dHash: hash.toString(16).padStart(16, "0"), histogram: histogram.map((count) => count / total), appearance: Array.from(appearanceMat.data as Uint8Array) };
  appearanceMat.delete();
  source.delete(); normalized.delete(); gray.delete(); mask.delete(); orb.delete(); hashMat.delete(); histogramMat.delete();
  return { keypoints, descriptors, coarse, cleanup: () => { keypoints.delete(); descriptors.delete(); } };
}

function hammingHex(a: string, b: string) {
  let value = BigInt(`0x${a}`) ^ BigInt(`0x${b}`); let count = 0;
  while (value) { count += Number(value & 1n); value >>= 1n; }
  return count;
}

function coarseSimilarity(query: RecognitionIndexEntry, reference: RecognitionIndexEntry) {
  if (query.appearance && reference.appearance) return appearanceSimilarity(query.appearance, reference.appearance);
  const hashScore = 1 - hammingHex(query.dHash, reference.dHash) / 64;
  const histogramScore = query.histogram.reduce((sum, value, index) => sum + Math.min(value, reference.histogram[index] ?? 0), 0);
  // Exposure changes alter the histogram even when the card is identical.
  return hashScore * 0.95 + histogramScore * 0.05;
}

// Normalized correlation ignores overall exposure; small offsets tolerate imperfect framing.
function appearanceSimilarity(a: number[], b: number[]) {
  let best = 0;
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    let sa = 0, sb = 0, aa = 0, bb = 0, ab = 0, n = 0;
    for (let y = 2; y < 22; y++) for (let x = 2; x < 14; x++) {
      const av = a[(y + dy) * 16 + x + dx], bv = b[y * 16 + x];
      sa += av; sb += bv; aa += av * av; bb += bv * bv; ab += av * bv; n++;
    }
    best = Math.max(best, (ab - sa * sb / n) / Math.sqrt(Math.max(1, (aa - sa * sa / n) * (bb - sb * sb / n))));
  }
  return best;
}

function compareFeatures(cv: Cv, query: FeatureSet, stored: StoredFeatures) {
  if (!query.descriptors.rows || !stored.count) return { score: 0, good: 0, inlierRatio: 0, spatialCoverage: 0 };
  const referenceDescriptors = cv.matFromArray(stored.count, stored.descriptorSize, cv.CV_8U, stored.descriptors);
  const matcher = new cv.BFMatcher(cv.NORM_HAMMING, false); const matches = new cv.DMatchVectorVector();
  matcher.knnMatch(query.descriptors, referenceDescriptors, matches, 2);
  const queryPoints: number[] = []; const referencePoints: number[] = []; let good = 0;
  // Repeated print patterns must not count multiple times against one reference point.
  const unique = new Map<number, { queryIdx: number; distance: number }>();
  for (let index = 0; index < matches.size(); index += 1) {
    const pair = matches.get(index);
    if (pair.size() >= 2) {
      const first = pair.get(0); const second = pair.get(1);
      if (first.distance < second.distance * 0.75) {
        if (!unique.has(first.trainIdx) || first.distance < unique.get(first.trainIdx)!.distance)
          unique.set(first.trainIdx, { queryIdx: first.queryIdx, distance: first.distance });
      }
    }
    pair.delete();
  }
  for (const [trainIdx, match] of unique) {
    const point = query.keypoints.get(match.queryIdx).pt;
    queryPoints.push(point.x, point.y); referencePoints.push(stored.points[trainIdx * 2], stored.points[trainIdx * 2 + 1]); good += 1;
  }
  let inlierRatio = 0; let spatialCoverage = 0;
  if (good >= 8) {
    const src = cv.matFromArray(good, 1, cv.CV_32FC2, queryPoints); const dst = cv.matFromArray(good, 1, cv.CV_32FC2, referencePoints); const inlierMask = new cv.Mat();
    const homography = cv.findHomography(src, dst, cv.RANSAC, 4, inlierMask);
    const maskValues = Array.from(inlierMask.data as Uint8Array); const inliers = maskValues.reduce((sum: number, value: number) => sum + (value ? 1 : 0), 0);
    let plausible = false;
    if (!homography.empty()) {
      const corners = cv.matFromArray(4, 1, cv.CV_32FC2, [0, 0, 399, 0, 399, 599, 0, 599]);
      const projected = new cv.Mat(); cv.perspectiveTransform(corners, projected, homography);
      const p = projected.data32F as Float32Array;
      let area = 0; let convex = true;
      for (let i = 0; i < 4; i++) {
        const j = (i + 1) % 4, k = (i + 2) % 4;
        area += p[i * 2] * p[j * 2 + 1] - p[j * 2] * p[i * 2 + 1];
        convex &&= (p[j * 2] - p[i * 2]) * (p[k * 2 + 1] - p[j * 2 + 1]) - (p[j * 2 + 1] - p[i * 2 + 1]) * (p[k * 2] - p[j * 2]) > 0;
      }
      plausible = convex && area / 480000 > 0.15 && area / 480000 < 6 && Array.from(p).every(Number.isFinite);
      corners.delete(); projected.delete();
    }
    inlierRatio = plausible ? inliers / good : 0; src.delete(); dst.delete(); inlierMask.delete(); homography.delete();
    if (plausible && inliers >= 4) {
      const queryInliers: number[] = []; const referenceInliers: number[] = [];
      for (let index = 0; index < maskValues.length; index += 1) if (maskValues[index]) { queryInliers.push(queryPoints[index * 2], queryPoints[index * 2 + 1]); referenceInliers.push(referencePoints[index * 2], referencePoints[index * 2 + 1]); }
      const coverage = (points: number[]) => { const xs = points.filter((_, index) => index % 2 === 0); const ys = points.filter((_, index) => index % 2 === 1); return ((Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys))) / (400 * 600); };
      spatialCoverage = Math.min(coverage(queryInliers), coverage(referenceInliers));
    }
  }
  matches.delete(); matcher.delete(); referenceDescriptors.delete();
  const score = Math.min(1, good * inlierRatio / 30) * 0.55 + inlierRatio * 0.3 + Math.min(1, spatialCoverage / 0.18) * 0.15;
  return { score, good, inlierRatio, spatialCoverage };
}

export async function matchPhotoCard(file: File, cards: CatalogCard[], index: Record<string, RecognitionIndexEntry>, descriptorMeta: DescriptorIndexMeta, onProgress?: (done: number, total: number) => void): Promise<MatchResponse | null> {
  const [cv, storedIndex] = await Promise.all([getOpenCv(), loadDescriptorIndex(descriptorMeta)]); const objectUrl = URL.createObjectURL(file);
  try {
    const queryImage = await loadImage(objectUrl); const possibleMatches: MatchResult[] = [];
    let completedComparisons = 0;
    // Keep the full frame as well: contour detection can mistake clothing for the card edge.
    for (const [normalizePerspective, smooth] of [[false, false], [true, false], [false, true], [true, true]]) {
    if (smooth || normalizePerspective) {
      const ranked = [...possibleMatches].sort((a, b) => b.rankingScore - a.rankingScore);
      const runnerUp = ranked.find(item => item.card.id !== ranked[0]?.card.id);
      if (ranked[0]?.rankingScore >= 0.8 && ranked[0].rankingScore - (runnerUp?.rankingScore ?? 0) >= 0.08) break;
    }
    const query = extractFeatures(cv, queryImage, normalizePerspective, smooth);
    const rankedCandidates = cards.map((card) => ({ card, score: index[card.id] ? coarseSimilarity(query.coarse, index[card.id]) : 0 })).sort((a, b) => b.score - a.score);
    const shortlist = rankedCandidates.slice(0, smooth ? 300 : 100).map((item) => item.card); const diagnosticResults: Array<{ id: string; score: number; good: number; inlierRatio: number; spatialCoverage: number }> = [];
    try {
      for (let candidateIndex = 0; candidateIndex < shortlist.length; candidateIndex += 1) {
        const reference = storedIndex.get(shortlist[candidateIndex].id); if (!reference) continue;
        const result = compareFeatures(cv, query, reference);
        diagnosticResults.push({ id: shortlist[candidateIndex].id, score: result.score, good: result.good, inlierRatio: result.inlierRatio, spatialCoverage: result.spatialCoverage });
        const coarseScore = rankedCandidates[candidateIndex].score; const rankingScore = result.score * 0.5 + coarseScore * 0.5;
        const minimumInliers = coarseScore >= 0.85 || result.inlierRatio >= 0.7 ? 6 : 8;
        const eligible = result.good * result.inlierRatio >= minimumInliers && result.inlierRatio >= 0.35 && result.spatialCoverage >= 0.025 && result.score >= (coarseScore >= 0.85 ? 0.3 : 0.35);
        if (eligible) possibleMatches.push({ card: shortlist[candidateIndex], confidence: result.score, goodMatches: result.good, inlierRatio: result.inlierRatio, spatialCoverage: result.spatialCoverage, coarseScore, rankingScore });
        onProgress?.(++completedComparisons, 800);
        if (candidateIndex % 5 === 4) await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
      }
    } finally { query.cleanup(); }
    if (new URLSearchParams(window.location.search).has("recognitionDebug")) console.info("RECOGNITION_DEBUG", JSON.stringify({ coarse: rankedCandidates.map((item, rank) => ({ id: item.card.id, rank: rank + 1, score: item.score })), verified: diagnosticResults.sort((a, b) => b.score - a.score) }));
    }
    onProgress?.(800, 800);
    const candidates = possibleMatches.sort((a, b) => b.rankingScore - a.rankingScore)
      .filter((result, position, all) => all.findIndex(other => other.card.id === result.card.id) === position).slice(0, 4);
    if (!candidates.length) return null;
    const primary = candidates[0]; const margin = primary.rankingScore - (candidates[1]?.rankingScore ?? 0);
    const strongGeometry = primary.goodMatches >= 35 && primary.inlierRatio >= 0.5 && primary.spatialCoverage >= 0.06 && primary.confidence >= 0.65;
    const abundantEvidence = primary.goodMatches >= 60 && primary.inlierRatio >= 0.42 && primary.spatialCoverage >= 0.05;
    return { candidates, confident: (strongGeometry || abundantEvidence) && margin >= 0.04 };
  } finally { URL.revokeObjectURL(objectUrl); }
}
