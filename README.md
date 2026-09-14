# readable-name-generator

Generates short, readable random names from a template, e.g. `brave-falcon-42`.
Useful for things like temporary resource names, guest usernames, or test
fixtures where a UUID is correct but unreadable.

## The problem this solves

Most name generators either ship a fixed word list you can't extend, or they
accept whatever word list and pattern you hand them and quietly produce
broken output - empty segments, duplicate words, names that collide more
than they should because the source list had a typo'd duplicate in it.

This library validates its inputs strictly by default. A malformed pattern,
an empty or duplicate-laden word list, or a nonsensical number range throws
immediately with a message that says what's wrong. That's almost always what
you want during development.

But sometimes the input isn't yours to control - a word list loaded from a
config file, or user-submitted data - and you'd rather get a best-effort name
than crash a request. For that there's `lenient`, an explicit opt-in that
relaxes validation: it sanitizes word lists instead of rejecting them, drops
unrecognized placeholders instead of throwing, and clamps out-of-range
numbers instead of erroring.

## Usage

```ts
import { generateName, NameGenerator, NameGenError } from 'readable-name-generator';

// Default pattern: "{adjective}-{noun}-{number}"
generateName(); // "eager-heron-471"

// Custom pattern, still using the built-in word lists.
generateName({ pattern: '{adjective}_{noun}' }); // "sunny_pebble"

// A generator you can call repeatedly (parses the pattern once).
const gen = new NameGenerator({ numberRange: [1000, 9999] });
gen.next(); // "keen-willow-5820"
gen.next(); // "tidy-lagoon-2237"

// Seeded output is deterministic - handy for snapshot tests.
generateName({ seed: 42 }) === generateName({ seed: 42 }); // true

// Custom word lists plug into the same placeholder syntax.
generateName({
  pattern: '{color}-{animal}',
  wordLists: {
    color: ['red', 'blue', 'green'],
    animal: ['otter', 'falcon', 'heron'],
  },
}); // "blue-otter"
```

### Strict by default

```ts
try {
  generateName({ wordLists: { color: ['red', 'red', 'blue'] } });
} catch (err) {
  if (err instanceof NameGenError) {
    console.error(err.message); // word list "color" contains a duplicate entry: "red"
  }
}
```

### The `lenient` escape hatch

```ts
// Untrusted input: extra whitespace, mixed case, a duplicate.
generateName({
  lenient: true,
  wordLists: {
    color: [' Red ', 'red', 'Blue', ''],
  },
  pattern: '{color}-{unknownPlaceholder}-{noun}',
});
// Sanitizes the word list down to ["red", "blue"], drops the unknown
// placeholder, and still returns a usable name instead of throwing.
```

## API

- `generateName(options?): string` - generate a single name.
- `new NameGenerator(options?)` - compiles the pattern once; call `.next()`
  repeatedly.
- `NameGenError` - thrown for invalid input in strict mode.
- `builtinWordLists` - the default `adjective` / `noun` word lists.

`GenerateOptions`:

| option        | type                        | default                        |
| -------------- | --------------------------- | ------------------------------- |
| `pattern`      | `string`                    | `"{adjective}-{noun}-{number}"` |
| `wordLists`    | `Record<string, string[]>`  | `{}` (merged with the builtins) |
| `numberRange`  | `[number, number]`          | `[0, 999]`                      |
| `seed`         | `number`                    | none (uses real randomness)     |
| `lenient`      | `boolean`                   | `false`                         |

## Status

Early skeleton. The core generator and validation are in place; see the
roadmap for what's still missing.
