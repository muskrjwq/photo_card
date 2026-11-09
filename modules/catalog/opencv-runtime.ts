"use client";

import cvModule from "@techstark/opencv-js";

let resolvedRuntime: Promise<any> | null = null;

/**
 * OpenCV's default export is either an initialized module, a module waiting for
 * onRuntimeInitialized, or a real Promise depending on the selected build.
 * This module is itself dynamically imported so the 15 MB OpenCV chunk remains
 * lazy without wrapping OpenCV's Promise export in a bundler namespace proxy.
 */
export function getOpenCvRuntime() {
  if (!resolvedRuntime) {
    const candidate: any = cvModule;
    resolvedRuntime = (async () => {
      if (candidate instanceof Promise) return await candidate;
      if (candidate.Mat) return candidate;
      await new Promise<void>((resolve) => { candidate.onRuntimeInitialized = () => resolve(); });
      return candidate;
    })();
  }
  return resolvedRuntime;
}
