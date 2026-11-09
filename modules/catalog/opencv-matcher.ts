"use client";

import type { CatalogCard } from "./types";

type Cv = any;
type FeatureSet = { keypoints: any; descriptors: any; cleanup: () => void };

let runtime: Promise<Cv> | null = null;

export interface MatchResult {
  card: CatalogCard;
  confidence: number;
  goodMatches: number;
  inlierRatio: number;
}

async function getOpenCv(): Promise<Cv> {
  if (!runtime) {
    runtime = import("@techstark/opencv-js").then(async (module) => {
      const candidate: any = module.default;
      if (candidate instanceof Promise) return candidate;
      if (candidate.Mat) return candidate;
      await new Promise<void>((resolve) => { candidate.onRuntimeInitialized = () => resolve(); });
      return candidate;
    });
  }
  return runtime;
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

/** Detects the largest card-like quadrilateral and warps it to a canonical 2:3 frame. */
function normalizeCard(cv: Cv, source: any) {
  const maxSide = 900;
  const scale = Math.min(1, maxSide / Math.max(source.cols, source.rows));
  const resized = new cv.Mat();
  cv.resize(source, resized, new cv.Size(Math.round(source.cols * scale), Math.round(source.rows * scale)), 0, 0, cv.INTER_AREA);
  const gray = new cv.Mat(); const blurred = new cv.Mat(); const edges = new cv.Mat();
  cv.cvtColor(resized, gray, cv.COLOR_RGBA2GRAY);
  cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0);
  cv.Canny(blurred, edges, 45, 135);
  const contours = new cv.MatVector(); const hierarchy = new cv.Mat();
  cv.findContours(edges, contours, hierarchy, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE);

  let best: any = null; let bestArea = 0;
  for (let index = 0; index < contours.size(); index += 1) {
    const contour = contours.get(index); const perimeter = cv.arcLength(contour, true); const approx = new cv.Mat();
    cv.approxPolyDP(contour, approx, perimeter * 0.025, true);
    const area = Math.abs(cv.contourArea(approx));
    if (approx.rows === 4 && cv.isContourConvex(approx) && area > bestArea && area > resized.rows * resized.cols * 0.12) {
      best?.delete(); best = approx.clone(); bestArea = area;
    }
    approx.delete(); contour.delete();
  }

  const output = new cv.Mat();
  if (best) {
    const raw = Array.from(best.data32S as Int32Array);
    const points = orderCorners([
      { x: raw[0], y: raw[1] }, { x: raw[2], y: raw[3] },
      { x: raw[4], y: raw[5] }, { x: raw[6], y: raw[7] },
    ]);
    const src = cv.matFromArray(4, 1, cv.CV_32FC2, points.flatMap((point) => [point.x, point.y]));
    const dst = cv.matFromArray(4, 1, cv.CV_32FC2, [0, 0, 399, 0, 399, 599, 0, 599]);
    const transform = cv.getPerspectiveTransform(src, dst);
    cv.warpPerspective(resized, output, transform, new cv.Size(400, 600), cv.INTER_LINEAR, cv.BORDER_REPLICATE);
    src.delete(); dst.delete(); transform.delete(); best.delete();
  } else {
    cv.resize(resized, output, new cv.Size(400, 600), 0, 0, cv.INTER_AREA);
  }
  gray.delete(); blurred.delete(); edges.delete(); contours.delete(); hierarchy.delete(); resized.delete();
  return output;
}

function extractFeatures(cv: Cv, image: HTMLImageElement): FeatureSet {
  const source = cv.imread(image); const normalized = normalizeCard(cv, source); const gray = new cv.Mat();
  cv.cvtColor(normalized, gray, cv.COLOR_RGBA2GRAY); cv.equalizeHist(gray, gray);
  const keypoints = new cv.KeyPointVector(); const descriptors = new cv.Mat(); const mask = new cv.Mat();
  const orb = new cv.ORB(800, 1.2, 8, 24, 0, 2, cv.ORB_HARRIS_SCORE, 31, 12);
  orb.detectAndCompute(gray, mask, keypoints, descriptors);
  source.delete(); normalized.delete(); gray.delete(); mask.delete(); orb.delete();
  return { keypoints, descriptors, cleanup: () => { keypoints.delete(); descriptors.delete(); } };
}

function compareFeatures(cv: Cv, query: FeatureSet, reference: FeatureSet) {
  if (!query.descriptors.rows || !reference.descriptors.rows) return { score: 0, good: 0, inlierRatio: 0 };
  const matcher = new cv.BFMatcher(cv.NORM_HAMMING, false); const matches = new cv.DMatchVectorVector();
  matcher.knnMatch(query.descriptors, reference.descriptors, matches, 2);
  const queryPoints: number[] = []; const referencePoints: number[] = []; let good = 0;
  for (let index = 0; index < matches.size(); index += 1) {
    const pair = matches.get(index);
    if (pair.size() >= 2) {
      const first = pair.get(0); const second = pair.get(1);
      if (first.distance < second.distance * 0.75) {
        const queryPoint = query.keypoints.get(first.queryIdx).pt; const referencePoint = reference.keypoints.get(first.trainIdx).pt;
        queryPoints.push(queryPoint.x, queryPoint.y); referencePoints.push(referencePoint.x, referencePoint.y); good += 1;
      }
    }
    pair.delete();
  }
  let inlierRatio = 0;
  if (good >= 8) {
    const src = cv.matFromArray(good, 1, cv.CV_32FC2, queryPoints); const dst = cv.matFromArray(good, 1, cv.CV_32FC2, referencePoints); const inlierMask = new cv.Mat();
    const homography = cv.findHomography(src, dst, cv.RANSAC, 4, inlierMask);
    const inliers = Array.from(inlierMask.data as Uint8Array).reduce((sum: number, value: number) => sum + (value ? 1 : 0), 0);
    inlierRatio = inliers / good; src.delete(); dst.delete(); inlierMask.delete(); homography.delete();
  }
  matches.delete(); matcher.delete();
  const score = Math.min(1, good / 42) * 0.35 + inlierRatio * 0.65;
  return { score, good, inlierRatio };
}

export async function matchPhotoCard(file: File, cards: CatalogCard[], onProgress?: (done: number, total: number) => void): Promise<MatchResult | null> {
  const cv = await getOpenCv(); const objectUrl = URL.createObjectURL(file);
  try {
    const queryImage = await loadImage(objectUrl); const query = extractFeatures(cv, queryImage); let best: MatchResult | null = null;
    try {
      for (let index = 0; index < cards.length; index += 1) {
        const image = await loadImage(cards[index].image); const reference = extractFeatures(cv, image);
        try {
          const result = compareFeatures(cv, query, reference);
          if (!best || result.score > best.confidence) best = { card: cards[index], confidence: result.score, goodMatches: result.good, inlierRatio: result.inlierRatio };
        } finally { reference.cleanup(); }
        onProgress?.(index + 1, cards.length);
        await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
      }
    } finally { query.cleanup(); }
    return best && best.goodMatches >= 10 && best.inlierRatio >= 0.28 && best.confidence >= 0.3 ? best : null;
  } finally { URL.revokeObjectURL(objectUrl); }
}
