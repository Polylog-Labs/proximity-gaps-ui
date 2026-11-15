import { describe, expect, it } from 'vitest';
import {
  analyzePrize,
  DEFAULT_PRIZE,
  PRIZE_DOMAIN,
  PRIZE_K,
  PRIZE_Q,
  prizeCodewords,
} from '../src/core/proximityPrize';
import { analyzeMca, MCA_PRESETS } from '../src/core/agreement';
import {
  defaultExperiment,
  experimentUrl,
  readLocation,
  validExperiment,
} from '../src/state/model';

// Independent definition: enumerate every subset and every linear polynomial,
// rather than reducing the check to the implementation's full agreement masks.
function directProfile(f: number[], g: number[]) {
  const domain = [1, 2, 4, 8, 16, 15, 13, 9];
  const book = Array.from({ length: 289 }, (_, i) =>
    domain.map((x) => ((i % 17) + Math.floor(i / 17) * x) % 17),
  );
  const supports = Array.from({ length: 256 }, (_, mask) =>
    domain.flatMap((_, i) => (mask & (1 << i) ? [i] : [])),
  );
  const fits = (word: number[], s: number[]) => book.some((c) => s.every((i) => c[i] === word[i]));
  const unexplained = supports.filter((s) => !fits(f, s) || !fits(g, s));
  const counts = Array<number>(9).fill(0);
  for (let alpha = 0; alpha < 17; alpha++) {
    const h = f.map((v, i) => (v + alpha * g[i]) % 17);
    const firstFailure = Math.min(
      9,
      ...unexplained.filter((s) => fits(h, s)).map((s) => 8 - s.length),
    );
    for (let r = firstFailure; r <= 8; r++) counts[r]++;
  }
  return counts;
}

describe('eight-position Proximity Prize', () => {
  it('uses the MCA code and opens a qualifying seven-position failure', () => {
    expect(PRIZE_Q).toBe(17);
    expect(PRIZE_K).toBe(2);
    expect(PRIZE_DOMAIN).toEqual(Array.from({ length: 8 }, (_, i) => 2 ** i % 17));
    expect(prizeCodewords).toHaveLength(289);
    const { f, g, radius, alpha } = DEFAULT_PRIZE;
    const result = analyzePrize(f, g, radius);
    expect(result.badCount).toBe(2);
    expect(result.profile).toEqual([0, 2, 2, 2, 2, 8, 8, 8, 8]);
    expect(result.challenges[alpha]).toMatchObject({
      bad: true,
      qualifies: true,
      support: [0, 1, 2, 3, 4, 5, 7],
    });
    expect(result.challenges.map((c) => c.bad)).toEqual(
      analyzeMca(f, g).challenges.map((c) => c.bad),
    );
  });

  it('matches all-subset enumeration at every threshold for codewords, cancellation, and custom inputs', () => {
    for (const { f, g } of [
      DEFAULT_PRIZE,
      MCA_PRESETS.code,
      MCA_PRESETS.cancellation,
      { f: [1, 4, 0, 8, 12, 5, 3, 2], g: [5, 6, 8, 15, 2, 0, 1, 4] },
    ]) {
      const expected = directProfile(f, g);
      for (let radius = 0; radius <= 8; radius++) {
        const result = analyzePrize(f, g, radius);
        expect(result.profile).toEqual(expected);
        expect(result.badCount).toBe(result.challenges.filter((c) => c.bad).length);
        expect(result.badCount).toBe(expected[radius]);
      }
    }
  });

  it('shows a failing witness even when the nearest codeword succeeds', () => {
    const { f, g } = DEFAULT_PRIZE;
    const selected = analyzePrize(f, g, 5).challenges[5];
    expect(selected.candidates[0]).toMatchObject({ bad: false, c: { distance: 2 } });
    expect(selected).toMatchObject({
      bad: true,
      c: { coefficients: [5, 11], distance: 5 },
      support: [5, 6, 7],
    });
    expect(selected.inputs.some((u) => u.supportErrors > 0)).toBe(true);
  });

  it('rejects invalid field elements, lengths, and radii', () => {
    const { f, g } = DEFAULT_PRIZE;
    for (const invalid of [[0], Array(8).fill(17), Array(8).fill(-1), Array(8).fill(1.5)])
      expect(() => analyzePrize(invalid, g, 2)).toThrow(RangeError);
    for (const radius of [-1, 9, 1.5, NaN])
      expect(() => analyzePrize(f, g, radius)).toThrow(RangeError);
  });

  it('round trips all eight symbols and keeps Prize settings independent of MCA', () => {
    const e = {
      ...defaultExperiment(),
      prize: { ...DEFAULT_PRIZE, radius: 8, alpha: 16 },
      mca: MCA_PRESETS.code,
    };
    const url = new URL(experimentUrl('proximity-prize', e), 'https://example.test');
    expect(readLocation(url.pathname, url.search)).toMatchObject({
      lesson: 'proximity-prize',
      experiment: e,
      notice: '',
    });
    for (const prize of [
      null,
      { ...e.prize, f: [0] },
      { ...e.prize, g: Array(8).fill(17) },
      { ...e.prize, alpha: 17 },
      { ...e.prize, radius: 9 },
      { ...e.prize, radius: -1 },
    ])
      expect(validExperiment({ ...e, prize })).toBe(false);
  });

  it('migrates old F5 links without reinterpreting their vectors or discarding other lessons', () => {
    const e = {
      ...defaultExperiment(7),
      prize: { f: [0, 1, 0, 0], g: [0, 2, 1, 0], alpha: 3, radius: 1, followWorst: true },
      mca: MCA_PRESETS.code,
    };
    const query = '?' + new URLSearchParams({ s: JSON.stringify({ v: 1, ...e }) });
    const result = readLocation('/visuals/proximity-prize', query);
    expect(result.experiment).toEqual({ ...e, prize: DEFAULT_PRIZE, v: 1 });
    expect(result.notice).toContain('eight-point F₁₇');
    expect(readLocation('/visuals/mutual-correlated-agreement', query).notice).toBe('');
  });
});
