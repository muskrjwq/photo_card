"use client";

import type { CatalogCard } from "./types";
import { extractXFeat, XFEAT_DESCRIPTOR_SIZE, XFEAT_GLOBAL_SIZE, XFEAT_SIZE } from "./xfeat-core.mjs";

type XFeatMeta = { url?: string; urls?: string[]; modelUrl: string; version: number; idSize?: number; descriptorSize: number; globalSize: number; featuresPerCard: number; cards: number };
type StoredFeatures = { points: Uint16Array; descriptors: Int8Array; global: Int8Array; count: number };
type QueryFeatures = { points: Uint16Array; descriptors: Float32Array; global: Float32Array; count: number };

let runtime: Promise<typeof import("onnxruntime-web")> | null = null;
const sessionCache = new Map<string, Promise<any>>();
const indexCache = new Map<string, Promise<Map<string, StoredFeatures>>>();

export interface MatchResult {
  card: CatalogCard;
  confidence: number;
  goodMatches: number;
  inlierRatio: number;
  spatialCoverage: number;
  coarseScore: number;
  rankingScore: number;
}

export interface MatchResponse { match: MatchResult }

async function getRuntime() {
  if (!runtime) runtime = import("onnxruntime-web").then((ort) => { ort.env.wasm.numThreads = 1; return ort; });
  return runtime;
}

async function getSession(meta: XFeatMeta) {
  let pending = sessionCache.get(meta.modelUrl);
  if (!pending) {
    pending = getRuntime().then((ort) => ort.InferenceSession.create(meta.modelUrl, { executionProviders: ["wasm"] }));
    sessionCache.set(meta.modelUrl, pending);
  }
  return pending;
}

function loadIndex(meta: XFeatMeta) {
  const urls = meta.urls ?? (meta.url ? [meta.url] : []); const cacheKey = urls.join("|");
  let pending = indexCache.get(cacheKey);
  if (pending) return pending;
  pending = Promise.all(urls.map((url) => fetch(url, { cache: "force-cache" }).then(async (response) => {
    if (!response.ok) throw new Error(`XFeat index download failed: ${response.status}`);
    const buffer = await response.arrayBuffer(); const view = new DataView(buffer); const bytes = new Uint8Array(buffer);
    const magic = new TextDecoder("ascii").decode(bytes.slice(0, 4));
    const version = view.getUint32(4, true); const total = view.getUint32(8, true); const descriptorSize = view.getUint16(12, true); const globalSize = view.getUint16(16, true); const idSize = view.getUint16(18, true) || 8;
    if (magic !== "XFIX" || version !== meta.version || descriptorSize !== XFEAT_DESCRIPTOR_SIZE || globalSize !== XFEAT_GLOBAL_SIZE) throw new Error("XFeat index format mismatch");
    const decoder = new TextDecoder("ascii"); const records = new Map<string, StoredFeatures>(); let offset = 20;
    for (let record = 0; record < total; record += 1) {
      const id = decoder.decode(bytes.slice(offset, offset + idSize)).replace(/\0+$/, ""); const count = view.getUint16(offset + idSize, true); offset += idSize + 4;
      const global = new Int8Array(buffer, offset, globalSize); offset += globalSize;
      const points = new Uint16Array(count * 2); const descriptors = new Int8Array(count * descriptorSize);
      for (let feature = 0; feature < count; feature += 1) {
        points[feature * 2] = view.getUint16(offset, true); points[feature * 2 + 1] = view.getUint16(offset + 2, true); offset += 4;
        descriptors.set(new Int8Array(buffer, offset, descriptorSize), feature * descriptorSize); offset += descriptorSize;
      }
      records.set(id, { points, descriptors, global, count });
    }
    if (offset !== buffer.byteLength) throw new Error("XFeat index is corrupt");
    return records;
  }))).then((shards) => { const records = new Map<string, StoredFeatures>(); for (const shard of shards) for (const [id, features] of shard) records.set(id, features); return records; });
  indexCache.set(cacheKey, pending); return pending;
}

async function fileToTensor(file: File) {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const canvas = document.createElement("canvas"); canvas.width = XFEAT_SIZE; canvas.height = XFEAT_SIZE;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Canvas is unavailable");
  context.drawImage(bitmap, 0, 0, XFEAT_SIZE, XFEAT_SIZE); bitmap.close();
  const pixels = context.getImageData(0, 0, XFEAT_SIZE, XFEAT_SIZE).data;
  const values = new Float32Array(3 * XFEAT_SIZE * XFEAT_SIZE);
  for (let pixel = 0; pixel < XFEAT_SIZE * XFEAT_SIZE; pixel += 1) for (let channel = 0; channel < 3; channel += 1) values[channel * XFEAT_SIZE * XFEAT_SIZE + pixel] = pixels[pixel * 4 + channel] / 255;
  return values;
}

async function extract(file: File, meta: XFeatMeta): Promise<QueryFeatures> {
  const [ort, session, values] = await Promise.all([getRuntime(), getSession(meta), fileToTensor(file)]);
  return extractXFeat(await session.run({ input: new ort.Tensor("float32", values, [1, 3, XFEAT_SIZE, XFEAT_SIZE]) }), 256);
}

function globalSimilarity(query: Float32Array, reference: Int8Array) {
  let dot = 0;
  for (let index = 0; index < XFEAT_GLOBAL_SIZE; index += 1) dot += query[index] * reference[index] / 127;
  return Math.max(-1, Math.min(1, dot));
}

function solveLinear(matrix: number[][], values: number[]) {
  const n = values.length;
  for (let pivot = 0; pivot < n; pivot += 1) {
    let row = pivot;
    for (let candidate = pivot + 1; candidate < n; candidate += 1) if (Math.abs(matrix[candidate][pivot]) > Math.abs(matrix[row][pivot])) row = candidate;
    if (Math.abs(matrix[row][pivot]) < 1e-8) return null;
    [matrix[pivot], matrix[row]] = [matrix[row], matrix[pivot]]; [values[pivot], values[row]] = [values[row], values[pivot]];
    const divisor = matrix[pivot][pivot];
    for (let column = pivot; column < n; column += 1) matrix[pivot][column] /= divisor; values[pivot] /= divisor;
    for (let other = 0; other < n; other += 1) if (other !== pivot) {
      const factor = matrix[other][pivot];
      for (let column = pivot; column < n; column += 1) matrix[other][column] -= factor * matrix[pivot][column]; values[other] -= factor * values[pivot];
    }
  }
  return values;
}

function homography(matches: number[][], indexes: number[]) {
  const matrix: number[][] = []; const values: number[] = [];
  for (const index of indexes) {
    const [x, y, u, v] = matches[index];
    matrix.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); values.push(u);
    matrix.push([0, 0, 0, x, y, 1, -v * x, -v * y]); values.push(v);
  }
  const result = solveLinear(matrix, values); return result ? [...result, 1] : null;
}

function verifyGeometry(matches: number[][]) {
  if (matches.length < 4) return { inliers: 0, ratio: 0, coverage: 0 };
  let best: number[] = []; let seed = matches.length * 2654435761;
  const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  for (let iteration = 0; iteration < 220; iteration += 1) {
    const sample = new Set<number>(); while (sample.size < 4) sample.add(Math.floor(random() * matches.length));
    const h = homography(matches, [...sample]); if (!h) continue;
    const inliers: number[] = [];
    for (let index = 0; index < matches.length; index += 1) {
      const [x, y, u, v] = matches[index]; const denominator = h[6] * x + h[7] * y + 1;
      if (Math.abs(denominator) < 1e-6) continue;
      const px = (h[0] * x + h[1] * y + h[2]) / denominator; const py = (h[3] * x + h[4] * y + h[5]) / denominator;
      if ((px - u) ** 2 + (py - v) ** 2 <= 64) inliers.push(index);
    }
    if (inliers.length > best.length) best = inliers;
  }
  if (best.length < 4) return { inliers: best.length, ratio: best.length / matches.length, coverage: 0 };
  const coverage = (query: boolean) => {
    const xs = best.map(index => matches[index][query ? 0 : 2]); const ys = best.map(index => matches[index][query ? 1 : 3]);
    return (Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys)) / (XFEAT_SIZE * XFEAT_SIZE);
  };
  return { inliers: best.length, ratio: best.length / matches.length, coverage: Math.min(coverage(true), coverage(false)) };
}

function compare(query: QueryFeatures, reference: StoredFeatures) {
  const bestReference = new Int16Array(query.count).fill(-1); const bestScore = new Float32Array(query.count).fill(-1); const secondScore = new Float32Array(query.count).fill(-1);
  const bestQuery = new Int16Array(reference.count).fill(-1); const referenceBest = new Float32Array(reference.count).fill(-1);
  for (let queryIndex = 0; queryIndex < query.count; queryIndex += 1) {
    for (let referenceIndex = 0; referenceIndex < reference.count; referenceIndex += 1) {
      let dot = 0; const queryOffset = queryIndex * XFEAT_DESCRIPTOR_SIZE; const referenceOffset = referenceIndex * XFEAT_DESCRIPTOR_SIZE;
      for (let channel = 0; channel < XFEAT_DESCRIPTOR_SIZE; channel += 1) dot += query.descriptors[queryOffset + channel] * reference.descriptors[referenceOffset + channel] / 127;
      if (dot > bestScore[queryIndex]) { secondScore[queryIndex] = bestScore[queryIndex]; bestScore[queryIndex] = dot; bestReference[queryIndex] = referenceIndex; }
      else if (dot > secondScore[queryIndex]) secondScore[queryIndex] = dot;
      if (dot > referenceBest[referenceIndex]) { referenceBest[referenceIndex] = dot; bestQuery[referenceIndex] = queryIndex; }
    }
  }
  const matches: number[][] = [];
  for (let queryIndex = 0; queryIndex < query.count; queryIndex += 1) {
    const referenceIndex = bestReference[queryIndex];
    if (referenceIndex >= 0 && bestQuery[referenceIndex] === queryIndex && bestScore[queryIndex] >= 0.72 && bestScore[queryIndex] - secondScore[queryIndex] >= 0.015) {
      matches.push([query.points[queryIndex * 2], query.points[queryIndex * 2 + 1], reference.points[referenceIndex * 2], reference.points[referenceIndex * 2 + 1]]);
    }
  }
  return { matches, geometry: verifyGeometry(matches) };
}

export async function matchPhotoCard(file: File, cards: CatalogCard[], meta: XFeatMeta, onProgress?: (done: number, total: number) => void): Promise<MatchResponse | null> {
  const [query, stored] = await Promise.all([extract(file, meta), loadIndex(meta)]); onProgress?.(1, 81);
  const shortlist = cards.map(card => ({ card, reference: stored.get(card.id), coarse: stored.has(card.id) ? globalSimilarity(query.global, stored.get(card.id)!.global) : -1 }))
    .filter(item => item.reference).sort((a, b) => b.coarse - a.coarse).slice(0, 80);
  const possible: MatchResult[] = [];
  for (let index = 0; index < shortlist.length; index += 1) {
    const item = shortlist[index]; const result = compare(query, item.reference!); const { inliers, ratio, coverage } = result.geometry;
    const geometryScore = Math.min(1, inliers / 28) * 0.5 + ratio * 0.3 + Math.min(1, coverage / 0.18) * 0.2;
    const rankingScore = geometryScore * 0.85 + Math.max(0, item.coarse) * 0.15;
    if (inliers >= 7 && ratio >= 0.28 && coverage >= 0.025) possible.push({ card: item.card, confidence: geometryScore, goodMatches: inliers, inlierRatio: ratio, spatialCoverage: coverage, coarseScore: item.coarse, rankingScore });
    onProgress?.(index + 2, 81); if (index % 4 === 3) await new Promise<void>(resolve => window.setTimeout(resolve, 0));
  }
  const ranked = possible.sort((a, b) => b.rankingScore - a.rankingScore);
  if (!ranked.length) return null;
  const primary = ranked[0];
  const margin = primary.rankingScore - (ranked[1]?.rankingScore ?? 0);
  const confident = primary.goodMatches >= 18 && primary.inlierRatio >= 0.45 && primary.spatialCoverage >= 0.06 && margin >= 0.035;
  return confident ? { match: primary } : null;
}
