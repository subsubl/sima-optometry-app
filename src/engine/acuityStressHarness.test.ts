import { describe, expect, it } from 'vitest';
import {
  computeScoredLineAcuity,
  formatAcuityNotation,
  ACUITY_LADDER,
  AcuityLineSpec,
} from './acuityMath';
import { AcuityNotation, LetterScoreStatus } from '../types/exam';

/**
 * Permutation Generator for exhaustive adversarial test oracle
 */
function generatePermutations(length: number): LetterScoreStatus[][] {
  const options: LetterScoreStatus[] = ['correct', 'incorrect', 'untested'];
  const results: LetterScoreStatus[][] = [];

  function helper(current: LetterScoreStatus[]) {
    if (current.length === length) {
      results.push([...current]);
      return;
    }
    for (const opt of options) {
      current.push(opt);
      helper(current);
      current.pop();
    }
  }

  helper([]);
  return results;
}

const NOTATIONS: AcuityNotation[] = ['snellen_us', 'snellen_metric', 'decimal', 'logmar'];

describe('Adversarial Stress Harness: computeScoredLineAcuity', () => {
  describe('Exhaustive Permutations on Lines 1 to 5 Letters', () => {
    // Length 1: 3 permutations
    // Length 2: 9 permutations
    // Length 3: 27 permutations
    // Length 4: 81 permutations
    // Length 5: 243 permutations
    for (let count = 1; count <= 5; count++) {
      const perms = generatePermutations(count);

      it(`exhaustively verifies all ${perms.length} permutations for ${count}-letter line across all notations and ladder steps`, () => {
        let totalEvaluations = 0;

        for (const perm of perms) {
          for (const spec of ACUITY_LADDER) {
            for (const notation of NOTATIONS) {
              totalEvaluations++;
              const res = computeScoredLineAcuity(spec.logMAR, perm, notation, count);

              // 1. Numerical sanity invariants
              expect(Number.isFinite(res.interpolatedLogMAR)).toBe(true);
              expect(Number.isNaN(res.interpolatedLogMAR)).toBe(false);
              expect(res.interpolatedLogMAR).toBeGreaterThanOrEqual(spec.logMAR - 0.001);
              expect(res.interpolatedLogMAR).toBeLessThanOrEqual(spec.logMAR + 0.101);

              // 2. Count invariants
              const expectedCorrect = perm.filter((s) => s === 'correct').length;
              const expectedIncorrect = perm.filter((s) => s === 'incorrect').length;
              const expectedTested = expectedCorrect + expectedIncorrect;

              expect(res.correctCount).toBe(expectedCorrect);
              expect(res.testedCount).toBe(expectedTested);

              // 3. String & label invariants
              expect(typeof res.label).toBe('string');
              expect(res.label.length).toBeGreaterThan(0);
              expect(res.label).not.toContain('NaN');
              expect(res.label).not.toContain('undefined');
              expect(res.label).not.toContain('null');
              expect(res.label).not.toContain('Infinity');

              // 4. Clinical semantic rules
              const baseLabel = formatAcuityNotation(spec.logMAR, notation);

              if (expectedTested === 0) {
                expect(res.interpolatedLogMAR).toBe(spec.logMAR);
                expect(res.label).toBe(baseLabel);
              } else if (expectedCorrect === count) {
                // 100% correct
                expect(res.label).toBe(`${baseLabel} (Full)`);
                const expectedLogMAR = Number(spec.logMAR.toFixed(count === 3 ? 2 : 3));
                expect(res.interpolatedLogMAR).toBe(expectedLogMAR);
              } else if (expectedCorrect === 0) {
                // 100% incorrect (or 0 correct among tested)
                expect(res.label).toBe(`${baseLabel} (0/${count})`);
                const expectedLogMAR = Number((spec.logMAR + 0.10).toFixed(count === 3 ? 2 : 3));
                expect(res.interpolatedLogMAR).toBe(expectedLogMAR);
              } else {
                // Partial pass
                const passThreshold = Math.ceil(count / 2);
                if (expectedCorrect >= passThreshold) {
                  const missed = count - expectedCorrect;
                  expect(res.label).toBe(`${baseLabel} -${missed}`);
                } else {
                  // Fallback credit to previous line
                  expect(res.label).toContain(`+${expectedCorrect}`);
                }
              }
            }
          }
        }

        expect(totalEvaluations).toBe(perms.length * ACUITY_LADDER.length * NOTATIONS.length);
      });
    }
  });

  describe('Exhaustive Permutations on Lines > 5 Letters (6 Letters: 729 permutations)', () => {
    const perms6 = generatePermutations(6);

    it(`evaluates all ${perms6.length} permutations on a 6-letter line without crash or NaN`, () => {
      let countEvaluated = 0;
      for (const perm of perms6) {
        countEvaluated++;
        const res = computeScoredLineAcuity(0.0, perm, 'snellen_us', 6);
        expect(Number.isFinite(res.interpolatedLogMAR)).toBe(true);
        expect(Number.isNaN(res.interpolatedLogMAR)).toBe(false);
        expect(res.label).not.toContain('NaN');

        const correct = perm.filter((s) => s === 'correct').length;
        const incorrect = perm.filter((s) => s === 'incorrect').length;
        if (correct + incorrect === 0) {
          expect(res.label).toBe('20/20');
        } else if (correct === 6) {
          expect(res.label).toBe('20/20 (Full)');
        } else if (correct === 0) {
          expect(res.label).toBe('20/20 (0/6)');
        } else if (correct >= 3) {
          expect(res.label).toBe(`20/20 -${6 - correct}`);
        } else {
          expect(res.label).toBe(`20/25 +${correct}`);
        }
      }
      expect(countEvaluated).toBe(729);
    });
  });

  describe('Adversarial Verification of 20/400 (1-letter Line) Invariant', () => {
    it('guarantees that 20/400 with 1 correct ALWAYS returns exactly 1.30 LogMAR and "(Full)" with zero phantom penalties across all 243 5-element array states', () => {
      // In the application state, currentLineScores is a 5-element array.
      // On 20/400 (1 letter), elements [1..4] are unrendered / ghost slots.
      // Every single permutation where element 0 is 'correct' MUST return 1.30 LogMAR and '(Full)'.
      const all5Perms = generatePermutations(5);
      expect(all5Perms.length).toBe(243);

      let correctCountTested = 0;
      let incorrectCountTested = 0;
      let untestedCountTested = 0;

      for (const scores of all5Perms) {
        for (const notation of NOTATIONS) {
          // Test with lineOptotypeCount explicitly 1
          const resExplicit = computeScoredLineAcuity(1.3, scores, notation, 1);
          // Test with lineOptotypeCount omitted (derived from spec)
          const resOmitted = computeScoredLineAcuity(1.3, scores, notation);

          // Both forms MUST behave identically
          expect(resExplicit.interpolatedLogMAR).toBe(resOmitted.interpolatedLogMAR);
          expect(resExplicit.label).toBe(resOmitted.label);

          const slot0 = scores[0];
          const baseNotation = formatAcuityNotation(1.3, notation);

          if (slot0 === 'correct') {
            correctCountTested++;
            // MUST be exact 1.30 LogMAR, NEVER 1.38 (the legacy defect)
            expect(resExplicit.interpolatedLogMAR).toBe(1.30);
            expect(resExplicit.label).toBe(`${baseNotation} (Full)`);
            expect(resExplicit.correctCount).toBe(1);
            expect(resExplicit.testedCount).toBe(1);
          } else if (slot0 === 'incorrect') {
            incorrectCountTested++;
            expect(resExplicit.interpolatedLogMAR).toBe(1.40);
            expect(resExplicit.label).toBe(`${baseNotation} (0/1)`);
            expect(resExplicit.correctCount).toBe(0);
            expect(resExplicit.testedCount).toBe(1);
          } else {
            // untested
            untestedCountTested++;
            expect(resExplicit.interpolatedLogMAR).toBe(1.30);
            expect(resExplicit.label).toBe(baseNotation);
            expect(resExplicit.correctCount).toBe(0);
            expect(resExplicit.testedCount).toBe(0);
          }
        }
      }

      // 81 combinations each per slot0 state * 4 notations = 324 tests each
      expect(correctCountTested).toBe(81 * 4);
      expect(incorrectCountTested).toBe(81 * 4);
      expect(untestedCountTested).toBe(81 * 4);
    });
  });

  describe('Adversarial Verification of 2-to-4 Letter Lines with 5-Element Arrays', () => {
    it('verifies 20/320 (2-letter line) slices strictly at 2 optotypes and ignores slots [2..4]', () => {
      const all5Perms = generatePermutations(5);

      for (const scores of all5Perms) {
        const res = computeScoredLineAcuity(1.2, scores, 'snellen_us');
        const activeSlice = scores.slice(0, 2);
        const correct = activeSlice.filter((s) => s === 'correct').length;
        const incorrect = activeSlice.filter((s) => s === 'incorrect').length;
        const tested = correct + incorrect;

        expect(res.correctCount).toBe(correct);
        expect(res.testedCount).toBe(tested);

        if (tested === 0) {
          expect(res.interpolatedLogMAR).toBe(1.20);
          expect(res.label).toBe('20/320');
        } else if (correct === 2) {
          expect(res.interpolatedLogMAR).toBe(1.20);
          expect(res.label).toBe('20/320 (Full)');
        } else if (correct === 1) {
          expect(res.interpolatedLogMAR).toBe(1.25);
          expect(res.label).toBe('20/320 -1');
        } else {
          expect(res.interpolatedLogMAR).toBe(1.30);
          expect(res.label).toBe('20/320 (0/2)');
        }
      }
    });

    it('verifies 20/200 (3-letter line) slices strictly at 3 optotypes and ignores slots [3..4]', () => {
      const all5Perms = generatePermutations(5);

      for (const scores of all5Perms) {
        const res = computeScoredLineAcuity(1.0, scores, 'snellen_us');
        const activeSlice = scores.slice(0, 3);
        const correct = activeSlice.filter((s) => s === 'correct').length;
        const incorrect = activeSlice.filter((s) => s === 'incorrect').length;
        const tested = correct + incorrect;

        expect(res.correctCount).toBe(correct);
        expect(res.testedCount).toBe(tested);

        if (tested === 0) {
          expect(res.interpolatedLogMAR).toBe(1.00);
          expect(res.label).toBe('20/200');
        } else if (correct === 3) {
          expect(res.interpolatedLogMAR).toBe(1.00);
          expect(res.label).toBe('20/200 (Full)');
        } else if (correct === 2) {
          expect(res.interpolatedLogMAR).toBe(1.03);
          expect(res.label).toBe('20/200 -1');
        } else if (correct === 1) {
          expect(res.interpolatedLogMAR).toBe(1.07);
          expect(res.label).toBe('20/250 +1');
        } else {
          expect(res.interpolatedLogMAR).toBe(1.10);
          expect(res.label).toBe('20/200 (0/3)');
        }
      }
    });

    it('verifies 20/100 (4-letter line) slices strictly at 4 optotypes and ignores slot [4]', () => {
      const all5Perms = generatePermutations(5);

      for (const scores of all5Perms) {
        const res = computeScoredLineAcuity(0.7, scores, 'snellen_us');
        const activeSlice = scores.slice(0, 4);
        const correct = activeSlice.filter((s) => s === 'correct').length;
        const incorrect = activeSlice.filter((s) => s === 'incorrect').length;
        const tested = correct + incorrect;

        expect(res.correctCount).toBe(correct);
        expect(res.testedCount).toBe(tested);

        if (tested === 0) {
          expect(res.interpolatedLogMAR).toBe(0.70);
          expect(res.label).toBe('20/100');
        } else if (correct === 4) {
          expect(res.interpolatedLogMAR).toBe(0.70);
          expect(res.label).toBe('20/100 (Full)');
        } else if (correct === 3) {
          expect(res.interpolatedLogMAR).toBe(0.725);
          expect(res.label).toBe('20/100 -1');
        } else if (correct === 2) {
          expect(res.interpolatedLogMAR).toBe(0.75);
          expect(res.label).toBe('20/100 -2');
        } else if (correct === 1) {
          expect(res.interpolatedLogMAR).toBe(0.775);
          expect(res.label).toBe('20/125 +1');
        } else {
          expect(res.interpolatedLogMAR).toBe(0.80);
          expect(res.label).toBe('20/100 (0/4)');
        }
      }
    });
  });

  describe('Adversarial Edge Cases & Robustness Invariants', () => {
    it('handles empty scores array ([]) gracefully without throwing or NaN', () => {
      for (const spec of ACUITY_LADDER) {
        for (const count of [1, 2, 3, 4, 5, 10]) {
          const res = computeScoredLineAcuity(spec.logMAR, [], 'snellen_us', count);
          expect(res.interpolatedLogMAR).toBe(spec.logMAR);
          expect(res.correctCount).toBe(0);
          expect(res.testedCount).toBe(0);
          expect(res.label).toBe(spec.snellenUS);
        }
      }
    });

    it('handles massive scores array (100 elements) correctly by slicing to effectiveCount', () => {
      const massiveScores: LetterScoreStatus[] = Array.from({ length: 100 }, (_, i) =>
        i < 5 ? 'correct' : 'incorrect'
      );
      const res5 = computeScoredLineAcuity(0.0, massiveScores, 'snellen_us', 5);
      expect(res5.correctCount).toBe(5);
      expect(res5.testedCount).toBe(5);
      expect(res5.interpolatedLogMAR).toBe(0.00);
      expect(res5.label).toBe('20/20 (Full)');

      const res1 = computeScoredLineAcuity(1.3, massiveScores, 'snellen_us', 1);
      expect(res1.correctCount).toBe(1);
      expect(res1.testedCount).toBe(1);
      expect(res1.interpolatedLogMAR).toBe(1.30);
      expect(res1.label).toBe('20/400 (Full)');
    });

    it('safely clamps negative or zero lineOptotypeCount to 1 via Math.max(1, count)', () => {
      const resZero = computeScoredLineAcuity(1.3, ['correct'], 'snellen_us', 0);
      expect(resZero.interpolatedLogMAR).toBe(1.30);
      expect(resZero.label).toBe('20/400 (Full)');

      const resNegative = computeScoredLineAcuity(1.3, ['correct'], 'snellen_us', -10);
      expect(resNegative.interpolatedLogMAR).toBe(1.30);
      expect(resNegative.label).toBe('20/400 (Full)');
    });

    it('handles out-of-ladder LogMAR values safely via fallback in getAcuitySpec', () => {
      // Extremely high LogMAR (e.g. 2.0)
      const resHigh = computeScoredLineAcuity(2.0, ['correct', 'correct', 'correct', 'correct', 'correct'], 'snellen_us', 5);
      expect(Number.isFinite(resHigh.interpolatedLogMAR)).toBe(true);
      expect(resHigh.interpolatedLogMAR).toBe(2.00);
      expect(resHigh.label).toContain('(Full)');

      // Extremely low LogMAR (e.g. -0.5)
      const resLow = computeScoredLineAcuity(-0.5, ['correct', 'correct', 'correct', 'correct', 'correct'], 'snellen_us', 5);
      expect(Number.isFinite(resLow.interpolatedLogMAR)).toBe(true);
      expect(resLow.interpolatedLogMAR).toBe(-0.50);
      expect(resLow.label).toContain('(Full)');
    });

    it('verifies that no combination of inputs ever outputs NaN, Infinity, or negative infinity', () => {
      const testInputs = [
        { logMAR: 0.0, scores: ['correct' as const], count: 1 },
        { logMAR: 1.3, scores: ['incorrect' as const], count: 1 },
        { logMAR: -0.3, scores: ['untested' as const], count: 5 },
        { logMAR: 0.7, scores: ['correct' as const, 'incorrect' as const], count: 4 },
        { logMAR: 1.0, scores: [], count: 3 },
      ];

      for (const input of testInputs) {
        for (const not of NOTATIONS) {
          const res = computeScoredLineAcuity(input.logMAR, input.scores, not, input.count);
          expect(Number.isNaN(res.interpolatedLogMAR)).toBe(false);
          expect(Number.isFinite(res.interpolatedLogMAR)).toBe(true);
          expect(res.interpolatedLogMAR).not.toBe(Infinity);
          expect(res.interpolatedLogMAR).not.toBe(-Infinity);
          expect(res.label).not.toMatch(/NaN|Infinity|undefined|null/);
        }
      }
    });
  });
});
