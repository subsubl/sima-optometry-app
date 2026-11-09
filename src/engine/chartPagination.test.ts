import { describe, expect, it } from 'vitest';
import { CalibrationConfig } from '../types/exam';
import {
  computeFullChartWindow,
  FULL_CHART_PAGES,
  calculateBlockHeight,
} from './chartPagination';

const mockCalibration: CalibrationConfig = {
  directDistanceMeters: 3.0,
  referenceBarPixels: 100,
  measuredBarMm: 26.46,
  isMirroredRoom: false,
  patientToMirrorMeters: 1.5,
  mirrorToScreenMeters: 1.5,
  distanceUnit: 'meters',
};

describe('Full Chart Viewport & Row Clipping Prevention', () => {
  it('displays all rows of the page when container height is generous (1080px)', () => {
    const res = computeFullChartWindow({
      calibration: mockCalibration,
      scaleFactor: 1.0,
      containerHeight: 1080,
      targetLogMAR: 0.2, // Refraction page
    });

    expect(res.pageLogMARs).toEqual(FULL_CHART_PAGES.REFRACTION);
    expect(res.visibleLogMARs.length).toBe(FULL_CHART_PAGES.REFRACTION.length);
    expect(res.totalBlockHeight).toBeLessThanOrEqual(res.availableHeight);
    expect(res.visibleLogMARs).toContain(0.2);
    expect(res.targetIndexInVisible).toBe(2); // 0.4, 0.3, 0.2
  });

  it('guarantees no row is cut off when container height is short (e.g. 350px)', () => {
    const containerHeight = 350;
    const res = computeFullChartWindow({
      calibration: mockCalibration,
      scaleFactor: 1.0,
      containerHeight,
      targetLogMAR: 0.1,
    });

    // Content height must never exceed availableHeight
    expect(res.totalBlockHeight).toBeLessThanOrEqual(res.availableHeight);
    // Active row must be visible
    expect(res.visibleLogMARs).toContain(0.1);
    // Must display as many rows as can fit without cutting off
    expect(res.visibleLogMARs.length).toBeGreaterThan(0);
    expect(res.visibleLogMARs.length).toBeLessThan(FULL_CHART_PAGES.REFRACTION.length);
  });

  it('keeps the view stationary and moves only the red underline when target stays inside visible window', () => {
    const containerHeight = 380;
    // Step 1: Initial render with targetLogMAR 0.3
    const step1 = computeFullChartWindow({
      calibration: mockCalibration,
      scaleFactor: 1.0,
      containerHeight,
      targetLogMAR: 0.3,
    });

    expect(step1.visibleLogMARs).toContain(0.3);
    const initialWindow = {
      pageLogMARs: step1.pageLogMARs,
      startIndex: step1.startIndex,
      endIndex: step1.endIndex,
    };

    // Pick another row that is already visible in step1
    const nextLogMAR = step1.visibleLogMARs[step1.targetIndexInVisible + 1];
    if (nextLogMAR !== undefined) {
      // Step 2: Move red line to next row
      const step2 = computeFullChartWindow({
        calibration: mockCalibration,
        scaleFactor: 1.0,
        containerHeight,
        targetLogMAR: nextLogMAR,
        currentWindow: initialWindow,
      });

      // Window indices and visible list MUST BE EXACTLY THE SAME (stationary page)
      expect(step2.startIndex).toBe(step1.startIndex);
      expect(step2.endIndex).toBe(step1.endIndex);
      expect(step2.visibleLogMARs).toEqual(step1.visibleLogMARs);
      // But the active target index within the visible list moves
      expect(step2.targetIndexInVisible).toBe(step1.targetIndexInVisible + 1);
      expect(step2.totalBlockHeight).toBeLessThanOrEqual(step2.availableHeight);
    }
  });

  it('shifts the visible window cleanly when navigating past the boundary without cutting off rows', () => {
    const containerHeight = 300;
    // Step 1: Target at top of page (0.4)
    const topStep = computeFullChartWindow({
      calibration: mockCalibration,
      scaleFactor: 1.0,
      containerHeight,
      targetLogMAR: 0.4,
    });

    expect(topStep.visibleLogMARs).toContain(0.4);

    // Step 2: Jump to smallest acuity at bottom of page (-0.3)
    const bottomStep = computeFullChartWindow({
      calibration: mockCalibration,
      scaleFactor: 1.0,
      containerHeight,
      targetLogMAR: -0.3,
      currentWindow: {
        pageLogMARs: topStep.pageLogMARs,
        startIndex: topStep.startIndex,
        endIndex: topStep.endIndex,
      },
    });

    expect(bottomStep.visibleLogMARs).toContain(-0.3);
    expect(bottomStep.totalBlockHeight).toBeLessThanOrEqual(bottomStep.availableHeight);
    expect(bottomStep.startIndex).toBeGreaterThanOrEqual(0);
    expect(bottomStep.endIndex).toBe(FULL_CHART_PAGES.REFRACTION.length - 1);
  });

  it('handles Low Vision page (LogMAR > 1.0) and respects available height', () => {
    const res = computeFullChartWindow({
      calibration: mockCalibration,
      scaleFactor: 1.0,
      containerHeight: 600,
      targetLogMAR: 1.2,
    });

    expect(res.pageLogMARs).toEqual(FULL_CHART_PAGES.LOW_VISION);
    expect(res.visibleLogMARs).toContain(1.2);
    expect(res.totalBlockHeight).toBeLessThanOrEqual(res.availableHeight);
  });

  it('works correctly with scaled previews (scaleFactor = 0.44 for Doctor Console)', () => {
    const previewHeight = 240;
    const res = computeFullChartWindow({
      calibration: mockCalibration,
      scaleFactor: 0.44,
      containerHeight: previewHeight,
      targetLogMAR: 0.0,
    });

    expect(res.totalBlockHeight).toBeLessThanOrEqual(res.availableHeight);
    expect(res.visibleLogMARs).toContain(0.0);
  });
});
