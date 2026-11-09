import { CalibrationConfig } from '../types/exam';
import { calculateOptotypeHeightPx } from './acuityMath';

export const FULL_CHART_PAGES = {
  LOW_VISION: [1.3, 1.2, 1.1, 1.0, 0.8, 0.6],
  SCREENING: [1.0, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3],
  REFRACTION: [0.4, 0.3, 0.2, 0.1, 0.0, -0.1, -0.2, -0.3],
} as const;

export interface FullChartLayoutConfig {
  calibration: CalibrationConfig;
  scaleFactor: number;
  containerHeight: number; // in pixels
  targetLogMAR: number;
  hasPatientNotation?: boolean;
  currentWindow?: {
    pageLogMARs: readonly number[];
    startIndex: number;
    endIndex: number;
  };
}

export interface FullChartLayoutResult {
  pageLogMARs: readonly number[];
  visibleLogMARs: readonly number[];
  startIndex: number;
  endIndex: number;
  targetIndexInVisible: number;
  rowGap: number;
  totalBlockHeight: number;
  availableHeight: number;
}

/**
 * Determine the clinical page for a given target LogMAR, preserving
 * the current page if target is within overlapping boundary lines (e.g. 0.4 or 0.3).
 */
export function getChartPageForLogMAR(
  targetLogMAR: number,
  currentPage?: readonly number[]
): readonly number[] {
  if (targetLogMAR > 1.0) {
    return FULL_CHART_PAGES.LOW_VISION;
  }

  // If already on a page that contains this targetLogMAR, keep it to avoid abrupt page flipping
  if (currentPage && currentPage.some((lm) => Math.abs(lm - targetLogMAR) < 0.01)) {
    return currentPage;
  }

  if (targetLogMAR >= 0.4) {
    return FULL_CHART_PAGES.SCREENING;
  }
  return FULL_CHART_PAGES.REFRACTION;
}

/**
 * Physical pixel height consumed by an optotype row including vertical padding and active underline headroom.
 */
export function calculateRowHeightPx(
  calibration: CalibrationConfig,
  logMAR: number,
  scaleFactor: number,
  isSelected: boolean
): number {
  const linePx = Math.max(4, calculateOptotypeHeightPx(calibration, logMAR) * scaleFactor);
  const verticalPadding = Math.max(4, Math.round(8 * scaleFactor));
  const underlineExtra = isSelected ? Math.max(4, Math.round(6 * scaleFactor)) : 0;
  return linePx + verticalPadding + underlineExtra;
}

export function calculateRowGapPx(scaleFactor: number): number {
  return Math.max(6, Math.round(12 * scaleFactor));
}

/**
 * Total pixel height consumed by a contiguous slice of rows [startIdx ... endIdx].
 */
export function calculateBlockHeight(
  pageLogMARs: readonly number[],
  startIdx: number,
  endIdx: number,
  targetIndex: number,
  calibration: CalibrationConfig,
  scaleFactor: number
): number {
  if (startIdx > endIdx || startIdx < 0 || endIdx >= pageLogMARs.length) {
    return 0;
  }
  let total = 0;
  const gap = calculateRowGapPx(scaleFactor);
  for (let i = startIdx; i <= endIdx; i++) {
    total += calculateRowHeightPx(
      calibration,
      pageLogMARs[i],
      scaleFactor,
      i === targetIndex
    );
  }
  const count = endIdx - startIdx + 1;
  if (count > 1) {
    total += (count - 1) * gap;
  }
  return total;
}

/**
 * Compute the visible window of rows such that NO row is cut off by the screen edge,
 * while maximizing the number of rows displayed and keeping the view stationary
 * as the active red underline moves up and down.
 */
export function computeFullChartWindow(
  config: FullChartLayoutConfig
): FullChartLayoutResult {
  const {
    calibration,
    scaleFactor,
    containerHeight,
    targetLogMAR,
    hasPatientNotation = false,
    currentWindow,
  } = config;

  // Determine safety vertical margins so letters never clip against the top or bottom screen bezels
  const topMargin = Math.max(16, Math.round(24 * scaleFactor));
  const bottomMargin = hasPatientNotation
    ? Math.max(28, Math.round(44 * scaleFactor))
    : Math.max(16, Math.round(24 * scaleFactor));
  const availableHeight = Math.max(60, (containerHeight > 0 ? containerHeight : 800) - (topMargin + bottomMargin));

  const pageLogMARs = getChartPageForLogMAR(targetLogMAR, currentWindow?.pageLogMARs);

  // Find target row index within this page
  let targetIndex = pageLogMARs.findIndex((lm) => Math.abs(lm - targetLogMAR) < 0.01);
  if (targetIndex === -1) {
    let closestIdx = 0;
    let minDiff = 999;
    pageLogMARs.forEach((lm, i) => {
      const diff = Math.abs(lm - targetLogMAR);
      if (diff < minDiff) {
        minDiff = diff;
        closestIdx = i;
      }
    });
    targetIndex = closestIdx;
  }

  // Check if the entire page fits completely without any clipping
  const fullPageHeight = calculateBlockHeight(
    pageLogMARs,
    0,
    pageLogMARs.length - 1,
    targetIndex,
    calibration,
    scaleFactor
  );

  if (fullPageHeight <= availableHeight) {
    return {
      pageLogMARs,
      visibleLogMARs: pageLogMARs,
      startIndex: 0,
      endIndex: pageLogMARs.length - 1,
      targetIndexInVisible: targetIndex,
      rowGap: calculateRowGapPx(scaleFactor),
      totalBlockHeight: fullPageHeight,
      availableHeight,
    };
  }

  // Not all rows fit on screen. We must determine the optimal stationary slice [start ... end]
  // that contains targetIndex and strictly satisfies totalBlockHeight <= availableHeight.

  let startIndex = 0;
  let endIndex = 0;

  // Test if currentWindow is still valid on this page and completely fits without clipping
  const isSamePage = currentWindow?.pageLogMARs === pageLogMARs;
  if (
    isSamePage &&
    currentWindow &&
    currentWindow.startIndex <= targetIndex &&
    targetIndex <= currentWindow.endIndex
  ) {
    const curHeight = calculateBlockHeight(
      pageLogMARs,
      currentWindow.startIndex,
      currentWindow.endIndex,
      targetIndex,
      calibration,
      scaleFactor
    );
    if (curHeight <= availableHeight) {
      // Retain the exact same stationary window; only the red line moves!
      return {
        pageLogMARs,
        visibleLogMARs: pageLogMARs.slice(currentWindow.startIndex, currentWindow.endIndex + 1),
        startIndex: currentWindow.startIndex,
        endIndex: currentWindow.endIndex,
        targetIndexInVisible: targetIndex - currentWindow.startIndex,
        rowGap: calculateRowGapPx(scaleFactor),
        totalBlockHeight: curHeight,
        availableHeight,
      };
    }
  }

  // Need to compute new window:
  if (isSamePage && currentWindow && targetIndex > currentWindow.endIndex) {
    // User navigated downwards past the bottom visible row:
    // Anchor the new row at the bottom and expand upwards
    endIndex = targetIndex;
    startIndex = targetIndex;
    while (
      startIndex - 1 >= 0 &&
      calculateBlockHeight(pageLogMARs, startIndex - 1, endIndex, targetIndex, calibration, scaleFactor) <= availableHeight
    ) {
      startIndex--;
    }
    // Also expand downwards if there is remaining space
    while (
      endIndex + 1 < pageLogMARs.length &&
      calculateBlockHeight(pageLogMARs, startIndex, endIndex + 1, targetIndex, calibration, scaleFactor) <= availableHeight
    ) {
      endIndex++;
    }
  } else if (isSamePage && currentWindow && targetIndex < currentWindow.startIndex) {
    // User navigated upwards past the top visible row:
    // Anchor the new row at the top and expand downwards
    startIndex = targetIndex;
    endIndex = targetIndex;
    while (
      endIndex + 1 < pageLogMARs.length &&
      calculateBlockHeight(pageLogMARs, startIndex, endIndex + 1, targetIndex, calibration, scaleFactor) <= availableHeight
    ) {
      endIndex++;
    }
    // Also expand upwards if remaining space
    while (
      startIndex - 1 >= 0 &&
      calculateBlockHeight(pageLogMARs, startIndex - 1, endIndex, targetIndex, calibration, scaleFactor) <= availableHeight
    ) {
      startIndex--;
    }
  } else {
    // Default / initial anchor for this page:
    // First try top-anchored window starting from index 0
    startIndex = 0;
    endIndex = 0;
    while (
      endIndex + 1 < pageLogMARs.length &&
      calculateBlockHeight(pageLogMARs, startIndex, endIndex + 1, targetIndex, calibration, scaleFactor) <= availableHeight
    ) {
      endIndex++;
    }

    if (targetIndex > endIndex) {
      // Target isn't in top slice; center around targetIndex
      startIndex = targetIndex;
      endIndex = targetIndex;
      let expanded = true;
      while (expanded) {
        expanded = false;
        // Expand downwards first
        if (
          endIndex + 1 < pageLogMARs.length &&
          calculateBlockHeight(pageLogMARs, startIndex, endIndex + 1, targetIndex, calibration, scaleFactor) <= availableHeight
        ) {
          endIndex++;
          expanded = true;
        }
        // Expand upwards
        if (
          startIndex - 1 >= 0 &&
          calculateBlockHeight(pageLogMARs, startIndex - 1, endIndex, targetIndex, calibration, scaleFactor) <= availableHeight
        ) {
          startIndex--;
          expanded = true;
        }
      }
    }
  }

  const finalHeight = calculateBlockHeight(
    pageLogMARs,
    startIndex,
    endIndex,
    targetIndex,
    calibration,
    scaleFactor
  );

  return {
    pageLogMARs,
    visibleLogMARs: pageLogMARs.slice(startIndex, endIndex + 1),
    startIndex,
    endIndex,
    targetIndexInVisible: targetIndex - startIndex,
    rowGap: calculateRowGapPx(scaleFactor),
    totalBlockHeight: finalHeight,
    availableHeight,
  };
}
