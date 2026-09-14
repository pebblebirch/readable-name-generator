import { createRng, type Rng } from './rng';
import { ADJECTIVES, NOUNS } from './wordlists';

export type WordList = readonly string[];

export interface GenerateOptions {
  /** Template like "{adjective}-{noun}-{number}". Defaults to that. */
  pattern?: string;
  /** Extra or overriding word lists, keyed by placeholder name. */
  wordLists?: Readonly<Record<string, WordList>>;
  /** Inclusive [min, max] range for the {number} placeholder. */
  numberRange?: readonly [number, number];
  /** Deterministic output for a given seed. Omit for real randomness. */
  seed?: number;
  /**
   * Relax input validation instead of throwing: sanitize malformed word
   * lists, drop unknown placeholders, clamp bad ranges. Off by default -
   * a malformed pattern or word list is almost always a bug you want to
   * hear about immediately, not silently paper over.
   */
  lenient?: boolean;
}

export class NameGenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NameGenError';
  }
}

export const builtinWordLists: Readonly<Record<string, WordList>> = {
  adjective: ADJECTIVES,
  noun: NOUNS,
};

const DEFAULT_PATTERN = '{adjective}-{noun}-{number}';
const DEFAULT_NUMBER_RANGE: readonly [number, number] = [0, 999];

// Lowercase letters/digits, optionally hyphen-joined. No whitespace or
// punctuation that would break a generated identifier.
const WORD_PATTERN = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;
const PLACEHOLDER_PATTERN = /\{([a-zA-Z][a-zA-Z0-9]*)\}/g;

type Token = { type: 'literal'; value: string } | { type: 'placeholder'; key: string };

export function generateName(options: GenerateOptions = {}): string {
  return new NameGenerator(options).next();
}

export class NameGenerator {
  private readonly tokens: readonly Token[];
  private readonly wordLists: Readonly<Record<string, readonly string[]>>;
  private readonly numberRange: readonly [number, number];
  private readonly rng: Rng;

  constructor(options: GenerateOptions = {}) {
    const lenient = options.lenient ?? false;
    const wordLists = resolveWordLists(options.wordLists, lenient);
    const numberRange = resolveNumberRange(options.numberRange ?? DEFAULT_NUMBER_RANGE, lenient);
    const seed = resolveSeed(options.seed, lenient);

    this.tokens = parsePattern(options.pattern ?? DEFAULT_PATTERN, wordLists, lenient);
    this.wordLists = wordLists;
    this.numberRange = numberRange;
    this.rng = createRng(seed);
  }

  /** Produce one name. Call repeatedly for a stream of names. */
  next(): string {
    let out = '';
    for (const token of this.tokens) {
      out += token.type === 'literal' ? token.value : this.resolvePlaceholder(token.key);
    }
    return out;
  }

  private resolvePlaceholder(key: string): string {
    if (key === 'number') {
      const [min, max] = this.numberRange;
      return String(this.rng.int(min, max));
    }
    const list = this.wordLists[key];
    // Only reachable when lenient dropped an unresolvable placeholder
    // upstream but a token for it slipped through; render nothing rather
    // than throw mid-generation.
    if (list === undefined || list.length === 0) {
      return '';
    }
    return this.rng.pick(list);
  }
}

function resolveWordLists(
  custom: Readonly<Record<string, WordList>> | undefined,
  lenient: boolean,
): Record<string, string[]> {
  const merged: Record<string, string[]> = {};
  for (const [key, words] of Object.entries(builtinWordLists)) {
    merged[key] = [...words];
  }
  if (custom === undefined) {
    return merged;
  }
  for (const [key, words] of Object.entries(custom)) {
    merged[key] = sanitizeWordList(key, words, lenient);
  }
  return merged;
}

function sanitizeWordList(key: string, words: WordList, lenient: boolean): string[] {
  if (!lenient) {
    if (words.length === 0) {
      throw new NameGenError(`word list "${key}" is empty`);
    }
    const seen = new Set<string>();
    for (const word of words) {
      if (!WORD_PATTERN.test(word)) {
        throw new NameGenError(
          `word list "${key}" contains an invalid entry: ${JSON.stringify(word)} ` +
            '(expected lowercase letters, digits and hyphens only; pass { lenient: true } to relax this)',
        );
      }
      if (seen.has(word)) {
        throw new NameGenError(`word list "${key}" contains a duplicate entry: "${word}"`);
      }
      seen.add(word);
    }
    return [...words];
  }

  const cleaned = new Set<string>();
  for (const word of words) {
    const trimmed = word.trim().toLowerCase().replace(/\s+/g, '-');
    if (trimmed.length > 0) {
      cleaned.add(trimmed);
    }
  }
  if (cleaned.size === 0) {
    throw new NameGenError(`word list "${key}" has no usable entries after sanitizing`);
  }
  return [...cleaned];
}

function resolveNumberRange(
  range: readonly [number, number],
  lenient: boolean,
): readonly [number, number] {
  const [min, max] = range;
  const isValid = Number.isInteger(min) && Number.isInteger(max) && min >= 0 && max >= min;
  if (isValid) {
    return [min, max];
  }
  if (!lenient) {
    throw new NameGenError(
      `numberRange must be [min, max] integers with 0 <= min <= max, got [${min}, ${max}] ` +
        '(pass { lenient: true } to relax this)',
    );
  }
  const safeMin = Number.isFinite(min) ? Math.max(0, Math.floor(min)) : 0;
  const safeMax = Number.isFinite(max) ? Math.max(0, Math.floor(max)) : safeMin;
  return safeMin <= safeMax ? [safeMin, safeMax] : [safeMax, safeMin];
}

function resolveSeed(seed: number | undefined, lenient: boolean): number | undefined {
  if (seed === undefined || Number.isInteger(seed)) {
    return seed;
  }
  if (!lenient) {
    throw new NameGenError(`seed must be an integer, got ${seed} (pass { lenient: true } to relax this)`);
  }
  return Math.floor(seed);
}

function parsePattern(
  pattern: string,
  wordLists: Readonly<Record<string, readonly string[]>>,
  lenient: boolean,
): Token[] {
  if (pattern.length === 0) {
    throw new NameGenError('pattern must not be empty');
  }

  const tokens: Token[] = [];
  let lastIndex = 0;
  let sawPlaceholder = false;

  for (const match of pattern.matchAll(PLACEHOLDER_PATTERN)) {
    const raw = match[1] as string;
    const key = raw.toLowerCase();
    const index = match.index ?? 0;

    if (index > lastIndex) {
      tokens.push({ type: 'literal', value: pattern.slice(lastIndex, index) });
    }

    const known = key === 'number' || key in wordLists;
    if (!known) {
      if (!lenient) {
        throw new NameGenError(
          `pattern references unknown placeholder "{${raw}}" ` +
            `(known: ${['number', ...Object.keys(wordLists)].join(', ')}; ` +
            'pass { lenient: true } to drop unknown placeholders instead)',
        );
      }
      // lenient: drop the placeholder, contributing nothing to the output
    } else {
      tokens.push({ type: 'placeholder', key });
      sawPlaceholder = true;
    }

    lastIndex = index + match[0].length;
  }

  if (lastIndex < pattern.length) {
    tokens.push({ type: 'literal', value: pattern.slice(lastIndex) });
  }

  if (!sawPlaceholder && !lenient) {
    throw new NameGenError('pattern must contain at least one known placeholder');
  }

  return tokens;
}
