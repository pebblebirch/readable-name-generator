import { randomInt } from 'node:crypto';

export interface Rng {
  int(min: number, max: number): number;
  pick<T>(items: readonly T[]): T;
}

// Deterministic PRNG used only when a seed is supplied. Not cryptographic;
// that's fine, seeded output exists for reproducible tests, not security.
function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createRng(seed?: number): Rng {
  const next = seed === undefined ? undefined : mulberry32(seed);

  const int = (min: number, max: number): number => {
    if (next === undefined) {
      // node:crypto's randomInt takes an exclusive upper bound.
      return randomInt(min, max + 1);
    }
    return min + Math.floor(next() * (max - min + 1));
  };

  return {
    int,
    pick<T>(items: readonly T[]): T {
      if (items.length === 0) {
        throw new RangeError('cannot pick from an empty list');
      }
      return items[int(0, items.length - 1)] as T;
    },
  };
}
