import { MCA_DOMAIN, MCA_K, MCA_N, MCA_PRESETS, MCA_Q } from './agreement';
import { linearCodewords } from './linearCombination';
import { mod } from './math';

export const PRIZE_Q = MCA_Q;
export const PRIZE_DOMAIN = MCA_DOMAIN;
export const PRIZE_N = MCA_N;
export const PRIZE_K = MCA_K;
export const PRIZE_TARGET_COUNT = 2;
export type PrizeSettings = {
  f: number[];
  g: number[];
  alpha: number;
  radius: number;
};
export const DEFAULT_PRIZE: PrizeSettings = {
  f: [...MCA_PRESETS.article.f],
  g: [...MCA_PRESETS.article.g],
  alpha: 3,
  radius: 2,
};
export const prizeCodewords = linearCodewords;
const indices = PRIZE_DOMAIN.map((_, i) => i);
const fullSupport = (1 << PRIZE_N) - 1;
const maskSize = Array.from(
  { length: 1 << PRIZE_N },
  (_, mask) => indices.filter((i) => mask & (1 << i)).length,
);
const supportMask = (word: readonly number[], codeword: readonly number[]) =>
  word.reduce((mask, value, i) => mask | (value === codeword[i] ? 1 << i : 0), 0);

function validateWord(word: readonly number[]) {
  if (word.length !== PRIZE_N || word.some((v) => !Number.isInteger(v) || v < 0 || v >= PRIZE_Q))
    throw new RangeError('Use eight field elements in F₁₇.');
}

function inputExplanations(word: readonly number[]) {
  const ranked = prizeCodewords
    .map((c) => {
      const mask = supportMask(word, c.word);
      return { ...c, mask, distance: PRIZE_N - maskSize[mask] };
    })
    .sort((a, b) => a.distance - b.distance);
  const best = (support: number) => {
    let match = ranked[0];
    let supportErrors = maskSize[support & ~match.mask];
    for (const candidate of ranked) {
      if (supportErrors === 0) break;
      const errors = maskSize[support & ~candidate.mask];
      if (errors < supportErrors) {
        match = candidate;
        supportErrors = errors;
      }
    }
    return { ...match, supportErrors };
  };
  const cache = new Map<number, ReturnType<typeof best>>();
  return (support: number) => {
    if (!cache.has(support)) cache.set(support, best(support));
    return cache.get(support)!;
  };
}

/** Exact analysis for the displayed pair: all 17 challenges and all 289 codewords.
 * Every full agreement set is checked, including non-nearest codewords. Explanations
 * on a full set also explain all its subsets, so this covers every qualifying S.
 * This does not enumerate or maximize over the 17^16 possible input pairs.
 */
export function analyzePrize(f: readonly number[], g: readonly number[], radius: number) {
  validateWord(f);
  validateWord(g);
  if (!Number.isInteger(radius) || radius < 0 || radius > PRIZE_N)
    throw new RangeError('Use an integer radius from 0 to 8.');
  const explain = [inputExplanations(f), inputExplanations(g)] as const;
  const nearestInputs = [explain[0](fullSupport), explain[1](fullSupport)] as const;
  const profile = Array<number>(PRIZE_N + 1).fill(0);
  const challenges = Array.from({ length: PRIZE_Q }, (_, alpha) => {
    const word = f.map((v, i) => mod(v + alpha * g[i], PRIZE_Q));
    let firstFailure = PRIZE_N + 1;
    const candidates = prizeCodewords
      .map((c, codewordIndex) => {
        const mask = supportMask(word, c.word);
        const support = indices.filter((i) => mask & (1 << i));
        const inputs = [explain[0](mask), explain[1](mask)] as const;
        const distance = PRIZE_N - support.length;
        const unexplained = inputs.some((u) => u.supportErrors > 0);
        if (unexplained) firstFailure = Math.min(firstFailure, distance);
        return {
          c: { ...c, distance },
          codewordIndex,
          support,
          inputs,
          qualifies: distance <= radius,
          bad: distance <= radius && unexplained,
        };
      })
      .sort((a, b) => a.c.distance - b.c.distance || a.codewordIndex - b.codewordIndex);
    for (let r = firstFailure; r <= PRIZE_N; r++) profile[r]++;
    const nearest = candidates[0].c;
    const selected = candidates.find((c) => c.bad) ?? candidates[0];
    return {
      alpha,
      word,
      nearest,
      candidates,
      ...selected,
      qualifyingCount: candidates.filter((c) => c.qualifies).length,
    };
  });
  return {
    nearestInputs,
    challenges,
    profile,
    badCount: profile[radius],
  };
}
