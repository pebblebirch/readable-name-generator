import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateName, NameGenError } from '../index';

// These exercise parsePattern and sanitizeWordList indirectly through the
// public API - neither is exported, and testing through generateName also
// pins down the behavior callers actually see.

test('pattern: empty string throws', () => {
  assert.throws(() => generateName({ pattern: '' }), NameGenError);
});

test('pattern: literal-only pattern throws in strict mode', () => {
  assert.throws(() => generateName({ pattern: 'no-placeholders-here' }), NameGenError);
});

test('pattern: literal-only pattern is allowed when lenient', () => {
  assert.equal(generateName({ pattern: 'static-name', lenient: true }), 'static-name');
});

test('pattern: unknown placeholder throws in strict mode with the placeholder name in the message', () => {
  assert.throws(
    () => generateName({ pattern: '{adjective}-{color}' }),
    (err: unknown) => err instanceof NameGenError && err.message.includes('{color}'),
  );
});

test('pattern: unknown placeholder is dropped when lenient', () => {
  const name = generateName({ pattern: '{unknown}-fixed', lenient: true });
  assert.equal(name, '-fixed');
});

test('pattern: placeholder names are case-insensitive', () => {
  const name = generateName({
    pattern: '{Color}',
    wordLists: { color: ['red'] },
  });
  assert.equal(name, 'red');
});

test('pattern: number placeholder resolves without a matching word list', () => {
  const name = generateName({ pattern: '{number}', numberRange: [7, 7] });
  assert.equal(name, '7');
});

test('pattern: literals surrounding and between placeholders are preserved', () => {
  const name = generateName({
    pattern: '>>{color}<>{color}<<',
    wordLists: { color: ['x'] },
  });
  assert.equal(name, '>>x<>x<<');
});

test('wordList: empty custom list throws in strict mode', () => {
  assert.throws(() => generateName({ pattern: '{color}', wordLists: { color: [] } }), NameGenError);
});

test('wordList: entry with uppercase or punctuation throws in strict mode', () => {
  assert.throws(
    () => generateName({ pattern: '{color}', wordLists: { color: ['Red'] } }),
    NameGenError,
  );
  assert.throws(
    () => generateName({ pattern: '{color}', wordLists: { color: ['red!'] } }),
    NameGenError,
  );
});

test('wordList: duplicate entry throws in strict mode', () => {
  assert.throws(
    () => generateName({ pattern: '{color}', wordLists: { color: ['red', 'red'] } }),
    NameGenError,
  );
});

test('wordList: lenient mode trims, lowercases and joins whitespace with hyphens', () => {
  const name = generateName({
    pattern: '{color}',
    lenient: true,
    wordLists: { color: [' Deep Blue '] },
  });
  assert.equal(name, 'deep-blue');
});

test('wordList: lenient mode drops blank entries and dedupes case-insensitively', () => {
  const name = generateName({
    pattern: '{color}',
    lenient: true,
    seed: 1,
    wordLists: { color: ['red', 'Red', '', '   '] },
  });
  assert.equal(name, 'red');
});

test('wordList: lenient mode still throws if nothing usable remains', () => {
  assert.throws(
    () => generateName({ pattern: '{color}', lenient: true, wordLists: { color: ['', '   '] } }),
    NameGenError,
  );
});
