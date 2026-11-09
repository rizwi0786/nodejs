import type { CodingChallenge } from '../../types';
import { js, md, t } from './helpers';

/** JavaScript fundamentals: data manipulation, closures, higher-order functions. */
export const javascriptChallenges: CodingChallenge[] = [
  {
    id: 'ch-001',
    title: 'Chunk an array',
    difficulty: 'beginner',
    topic: 'Arrays',
    category: 'javascript',
    prompt: md(
      "Write `chunk(arr, size)` that splits `arr` into groups of `size` elements. The last group holds whatever is left.",
      '',
      "- `chunk([1, 2, 3, 4, 5], 2)` → `[[1, 2], [3, 4], [5]]`",
      "- `chunk([], 3)` → `[]`",
      '',
      'Constraints:',
      '- Do not mutate the input array.',
      "- If `size` is less than 1, throw a `RangeError`.",
    ),
    starterCode: js`
      function chunk(arr, size) {
        // TODO: return a new array of groups of length "size"
      }
    `,
    solution: js`
      function chunk(arr, size) {
        if (!(size >= 1)) throw new RangeError('size must be >= 1');
        const out = [];
        for (let i = 0; i < arr.length; i += size) {
          out.push(arr.slice(i, i + size));
        }
        return out;
      }
    `,
    tests: [
      t('chunk([1, 2, 3, 4, 5], 2)', [[1, 2], [3, 4], [5]]),
      t('chunk([], 3)', []),
      t('chunk([1, 2, 3], 5)', [[1, 2, 3]]),
      t('chunk([1, 2, 3, 4], 1)', [[1], [2], [3], [4]]),
      t("(() => { try { chunk([1], 0); return 'no error'; } catch (e) { return e instanceof RangeError; } })()", true),
      t('(() => { const a = [1, 2, 3]; const c = chunk(a, 2); return [a, c.length]; })()', [[1, 2, 3], 2]),
    ],
    hints: [
      'Step through the array with `i += size`.',
      '`arr.slice(i, i + size)` never reads past the end — it just returns fewer items.',
    ],
    explanation: md(
      'Walk the array in steps of `size` and push `slice(i, i + size)` for each step. `slice` copies, so the input is untouched, and it clamps at the end, so the last group is naturally shorter.',
      '',
      'Validate `size` first: with `size = 0` the loop would never advance (infinite loop) — a classic interview follow-up.',
      '',
      'Complexity: O(n) time, O(n) extra space for the output.',
    ),
    relatedLessonIds: ['m01-arrays-and-array-methods'],
  },
  {
    id: 'ch-002',
    title: 'Flatten a nested array',
    difficulty: 'beginner',
    topic: 'Recursion',
    category: 'javascript',
    prompt: md(
      'Write `flatten(arr, depth = Infinity)` that flattens nested arrays up to `depth` levels — like `Array.prototype.flat`, but **without using `flat`/`flatMap`**.',
      '',
      "- `flatten([1, [2, [3, [4]]]])` → `[1, 2, 3, 4]`",
      "- `flatten([1, [2, [3, [4]]]], 1)` → `[1, 2, [3, [4]]]`",
      "- `flatten([1, [2]], 0)` → `[1, [2]]`",
    ),
    starterCode: js`
      function flatten(arr, depth = Infinity) {
        // TODO: flatten without Array.prototype.flat
      }
    `,
    solution: js`
      function flatten(arr, depth = Infinity) {
        const out = [];
        for (const item of arr) {
          if (Array.isArray(item) && depth > 0) {
            out.push(...flatten(item, depth - 1));
          } else {
            out.push(item);
          }
        }
        return out;
      }
    `,
    tests: [
      t('flatten([1, [2, [3, [4]]]])', [1, 2, 3, 4]),
      t('flatten([1, [2, [3, [4]]]], 1)', [1, 2, [3, [4]]]),
      t('flatten([[], [[]]])', []),
      t('flatten([1, [2]], 0)', [1, [2]]),
      t("flatten(['a', ['b', ['c']]], 2)", ['a', 'b', 'c']),
      t('(() => { const f = Array.prototype.flat; Array.prototype.flat = undefined; try { return flatten([1, [2, [3]]]); } finally { Array.prototype.flat = f; } })()', [1, 2, 3]),
    ],
    hints: [
      'Use `Array.isArray` to decide whether to recurse.',
      'Pass `depth - 1` into the recursive call and stop recursing when depth hits 0.',
    ],
    explanation: md(
      'Recursive descent: for each element, if it is an array and we still have depth budget, flatten it with `depth - 1` and spread the result; otherwise push it as-is.',
      '',
      'An iterative version uses an explicit stack of `[item, depth]` pairs — useful for extremely deep nesting where recursion could overflow the call stack.',
      '',
      'Complexity: O(n) where n is the total number of elements across all levels.',
    ),
    relatedLessonIds: ['m01-arrays-and-array-methods', 'm01-spread-and-rest-operators'],
  },
  {
    id: 'ch-003',
    title: 'Group by key',
    difficulty: 'beginner',
    topic: 'Arrays',
    category: 'javascript',
    prompt: md(
      'Write `groupBy(items, keyOrFn)` that returns an object mapping each group key to an array of items.',
      '',
      '- `keyOrFn` is either a property name (string) or a function `item => key`.',
      '- Items keep their original order inside each group.',
      "- The result must be safe for any key, including `'__proto__'` (hint: `Object.create(null)`).",
      '',
      "- `groupBy([1.1, 2.3, 1.9], Math.floor)` → `{ 1: [1.1, 1.9], 2: [2.3] }`",
      "- `groupBy([{ t: 'a' }, { t: 'b' }, { t: 'a' }], 't')` → `{ a: [{ t: 'a' }, { t: 'a' }], b: [{ t: 'b' }] }`",
    ),
    starterCode: js`
      function groupBy(items, keyOrFn) {
        // TODO: build { [key]: item[] }
      }
    `,
    solution: js`
      function groupBy(items, keyOrFn) {
        const getKey = typeof keyOrFn === 'function' ? keyOrFn : (item) => item[keyOrFn];
        const groups = Object.create(null);
        for (const item of items) {
          const key = getKey(item);
          (groups[key] || (groups[key] = [])).push(item);
        }
        return groups;
      }
    `,
    tests: [
      t('groupBy([1.1, 2.3, 1.9], Math.floor)', { 1: [1.1, 1.9], 2: [2.3] }),
      t("groupBy([{ t: 'a', v: 1 }, { t: 'b', v: 2 }, { t: 'a', v: 3 }], 't')", { a: [{ t: 'a', v: 1 }, { t: 'a', v: 3 }], b: [{ t: 'b', v: 2 }] }),
      t("groupBy([], 'x')", {}),
      t("groupBy(['one', 'two', 'three'], (s) => s.length)", { 3: ['one', 'two'], 5: ['three'] }),
      t("Object.keys(groupBy([{ k: '__proto__' }, { k: 'x' }], 'k'))", ['__proto__', 'x']),
    ],
    hints: [
      'Normalise `keyOrFn` into a function first so the loop has one code path.',
      'A plain `{}` has a prototype — assigning `obj["__proto__"]` changes the prototype instead of adding a key.',
    ],
    explanation: md(
      'Turn the key argument into a function, then do one pass: look up (or create) the bucket array for each key and push the item.',
      '',
      'Using `Object.create(null)` avoids prototype keys such as `__proto__`, `constructor` or `toString` colliding with data. In modern runtimes `Object.groupBy` (ES2024, Node 21+) does exactly this and also returns a null-prototype object.',
      '',
      'Complexity: O(n) time and space.',
    ),
    relatedLessonIds: ['m01-arrays-and-array-methods', 'm01-objects-and-prototypes'],
  },
  {
    id: 'ch-004',
    title: 'Dedupe by key',
    difficulty: 'beginner',
    topic: 'Map and Set',
    category: 'javascript',
    prompt: md(
      'Write `uniqueBy(items, keyOrFn)` that removes duplicates, keeping the **first** occurrence of each key.',
      '',
      '- `keyOrFn` is a property name or a function `item => key`.',
      '- Keys are compared like `Set` does (SameValueZero): `NaN` equals `NaN`, `1` and `"1"` are different.',
      '',
      "- `uniqueBy([{ id: 1, n: 'a' }, { id: 2, n: 'b' }, { id: 1, n: 'c' }], 'id')` → `[{ id: 1, n: 'a' }, { id: 2, n: 'b' }]`",
      "- `uniqueBy(['a', 'A', 'b'], s => s.toLowerCase())` → `['a', 'b']`",
    ),
    starterCode: js`
      function uniqueBy(items, keyOrFn) {
        // TODO: keep the first item for every distinct key
      }
    `,
    solution: js`
      function uniqueBy(items, keyOrFn) {
        const getKey = typeof keyOrFn === 'function' ? keyOrFn : (item) => item[keyOrFn];
        const seen = new Set();
        return items.filter((item) => {
          const key = getKey(item);
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
      }
    `,
    tests: [
      t("uniqueBy([{ id: 1, n: 'a' }, { id: 2, n: 'b' }, { id: 1, n: 'c' }], 'id')", [{ id: 1, n: 'a' }, { id: 2, n: 'b' }]),
      t("uniqueBy(['a', 'A', 'b'], (s) => s.toLowerCase())", ['a', 'b']),
      t("uniqueBy([], 'id')", []),
      t("uniqueBy([{ v: NaN }, { v: NaN }, { v: 0 }, { v: -0 }], 'v').length", 2),
      t("uniqueBy([{ id: 1 }, { id: '1' }], 'id').length", 2),
    ],
    hints: ['A `Set` gives O(1) membership checks.', '`filter` keeps order for free.'],
    explanation: md(
      'One pass with a `Set` of keys already seen. `filter` returns `true` only the first time a key appears.',
      '',
      'Avoid the O(n²) `items.findIndex(...) === index` trick on large inputs. Using an object as the "seen" map would wrongly merge `1` and `"1"` because object keys are strings.',
      '',
      'Complexity: O(n) time, O(k) space for k distinct keys.',
    ),
    relatedLessonIds: ['m01-map-set-weakmap-and-weakset'],
  },
  {
    id: 'ch-005',
    title: 'Sum nested numbers',
    difficulty: 'beginner',
    topic: 'Recursion',
    category: 'javascript',
    prompt: md(
      'Write `sumNested(value)` that adds up every **finite number** found anywhere inside nested arrays and plain objects.',
      '',
      '- Ignore strings (even numeric ones), booleans, `null`, `undefined`, `NaN` and `Infinity`.',
      '- A bare number is its own sum.',
      '',
      "- `sumNested([1, [2, [3]], { a: 4, b: { c: 5 } }])` → `15`",
      "- `sumNested({ a: '10', b: null, c: [true, NaN, 2] })` → `2`",
    ),
    starterCode: js`
      function sumNested(value) {
        // TODO: recurse into arrays and objects
      }
    `,
    solution: js`
      function sumNested(value) {
        if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
        if (value === null || typeof value !== 'object') return 0;
        let total = 0;
        for (const child of Object.values(value)) total += sumNested(child);
        return total;
      }
    `,
    tests: [
      t('sumNested([1, [2, [3]], { a: 4, b: { c: 5 } }])', 15),
      t("sumNested({ a: '10', b: null, c: [true, NaN, 2] })", 2),
      t('sumNested([])', 0),
      t('sumNested(7)', 7),
      t('sumNested({ x: [{ y: [{ z: 1.5 }] }], w: -0.5, inf: Infinity })', 1),
    ],
    hints: ['`Object.values` works for arrays and objects alike.', 'Handle the base cases (number / non-object) first.'],
    explanation: md(
      'Base cases: a finite number returns itself; anything that is not an object returns 0. Otherwise recurse over `Object.values(value)` — which covers both arrays and objects — and add the results.',
      '',
      '`Number.isFinite` (unlike global `isFinite`) does not coerce, so `"10"` is rejected.',
      '',
      'Complexity: O(n) over all nested values; recursion depth equals nesting depth.',
    ),
    relatedLessonIds: ['m01-functions', 'm01-type-coercion'],
  },
  {
    id: 'ch-006',
    title: 'Balanced brackets',
    difficulty: 'beginner',
    topic: 'Stacks',
    category: 'javascript',
    prompt: md(
      'Write `isBalanced(str)` that returns `true` when every `(`, `[` and `{` is closed by the matching bracket in the right order. Other characters are ignored.',
      '',
      "- `isBalanced('({[]})')` → `true`",
      "- `isBalanced('([)]')` → `false`",
      "- `isBalanced('fn(a[0], { b: 1 })')` → `true`",
      "- `isBalanced('')` → `true`",
    ),
    starterCode: js`
      function isBalanced(str) {
        // TODO: use a stack
      }
    `,
    solution: js`
      function isBalanced(str) {
        const pairs = { ')': '(', ']': '[', '}': '{' };
        const stack = [];
        for (const ch of str) {
          if (ch === '(' || ch === '[' || ch === '{') stack.push(ch);
          else if (ch in pairs) {
            if (stack.pop() !== pairs[ch]) return false;
          }
        }
        return stack.length === 0;
      }
    `,
    tests: [
      t("isBalanced('({[]})')", true),
      t("isBalanced('([)]')", false),
      t("isBalanced('')", true),
      t("isBalanced('((')", false),
      t("isBalanced('fn(a[0], { b: 1 })')", true),
      t("isBalanced(')(')", false),
      t("isBalanced('}')", false),
    ],
    hints: ['Push openers; on a closer, pop and compare.', 'At the end the stack must be empty.'],
    explanation: md(
      'Classic stack problem. Push every opening bracket. For a closing bracket, pop the top and check it is the matching opener — popping an empty stack returns `undefined`, which also fails the check. When the input ends, leftover openers mean it is unbalanced.',
      '',
      'Complexity: O(n) time, O(n) space in the worst case.',
    ),
    relatedLessonIds: ['m01-arrays-and-array-methods'],
  },
  {
    id: 'ch-007',
    title: 'Binary search (leftmost)',
    difficulty: 'beginner',
    topic: 'Searching',
    category: 'javascript',
    prompt: md(
      'Write `binarySearch(sorted, target)` that returns the index of `target` in an ascending array, or `-1` if it is missing.',
      '',
      'If the value appears several times, return the **leftmost** index. Must be O(log n).',
      '',
      "- `binarySearch([1, 3, 5, 7, 9], 7)` → `3`",
      "- `binarySearch([2, 2, 2, 3], 2)` → `0`",
      "- `binarySearch([1, 3, 5], 4)` → `-1`",
    ),
    starterCode: js`
      function binarySearch(sorted, target) {
        // TODO: O(log n)
      }
    `,
    solution: js`
      function binarySearch(sorted, target) {
        let lo = 0;
        let hi = sorted.length;
        while (lo < hi) {
          const mid = (lo + hi) >>> 1;
          if (sorted[mid] < target) lo = mid + 1;
          else hi = mid;
        }
        return lo < sorted.length && sorted[lo] === target ? lo : -1;
      }
    `,
    tests: [
      t('binarySearch([1, 3, 5, 7, 9], 7)', 3),
      t('binarySearch([1, 3, 5], 4)', -1),
      t('binarySearch([], 1)', -1),
      t('binarySearch([2, 2, 2, 3], 2)', 0),
      t('binarySearch([1, 2, 4, 4, 4, 5], 4)', 2),
      t('(() => { const a = Array.from({ length: 100000 }, (_, i) => i * 2); return [binarySearch(a, 199998), binarySearch(a, 3), binarySearch(a, 0)]; })()', [99999, -1, 0]),
    ],
    hints: [
      'Search for the first index whose value is `>= target` (a "lower bound").',
      'Use a half-open range `[lo, hi)` to avoid off-by-one bugs.',
    ],
    explanation: md(
      'Lower-bound binary search: keep `[lo, hi)`. If `sorted[mid] < target` the answer is to the right (`lo = mid + 1`), otherwise it is `mid` or to the left (`hi = mid`). When the loop ends, `lo` is the first position where the value could be — check it actually equals `target`.',
      '',
      '`(lo + hi) >>> 1` is an integer midpoint that never produces a fraction.',
      '',
      'Complexity: O(log n) time, O(1) space.',
    ),
  },
  {
    id: 'ch-008',
    title: 'Safe deep get by path',
    difficulty: 'beginner',
    topic: 'Objects',
    category: 'javascript',
    prompt: md(
      'Write `getPath(obj, path, defaultValue)` — a tiny `lodash.get`.',
      '',
      "- `path` is a string like `'a.b[0].c'` **or** an array of keys like `['a', 'x.y']` (array keys are used verbatim).",
      '- If any step hits `null`/`undefined`, or the final value is `undefined`, return `defaultValue`.',
      '- Falsy values such as `0`, `false` or `""` must be returned as-is.',
      '',
      "- `getPath({ a: { b: [{ c: 42 }] } }, 'a.b[0].c')` → `42`",
      "- `getPath({ a: { b: null } }, 'a.b.c', 'def')` → `'def'`",
    ),
    starterCode: js`
      function getPath(obj, path, defaultValue) {
        // TODO: support 'a.b[0].c' and ['a', 'b', 0, 'c']
      }
    `,
    solution: js`
      function getPath(obj, path, defaultValue) {
        const keys = Array.isArray(path)
          ? path
          : path.replace(/\[(\w+)\]/g, '.$1').split('.').filter(Boolean);
        let current = obj;
        for (const key of keys) {
          if (current == null) return defaultValue;
          current = current[key];
        }
        return current === undefined ? defaultValue : current;
      }
    `,
    tests: [
      t("getPath({ a: { b: [{ c: 42 }] } }, 'a.b[0].c')", 42),
      t("getPath({ a: { b: null } }, 'a.b.c', 'def')", 'def'),
      t("getPath({ a: 1 }, ['a'])", 1),
      t("getPath({ a: { 'x.y': 2 } }, ['a', 'x.y'])", 2),
      t("getPath({ a: 0 }, 'a', 5)", 0),
      t("getPath({ a: { b: undefined } }, 'a.b', 'd')", 'd'),
      t("getPath(null, 'a', 'none')", 'none'),
    ],
    hints: [
      'Normalise `[0]` into `.0` with a regex, then split on dots.',
      '`current == null` catches both `null` and `undefined`.',
    ],
    explanation: md(
      'Normalise the path to an array of keys, then walk the object one key at a time. Stop early on `null`/`undefined`. Only `undefined` at the end triggers the default — so `0` and `false` survive (a common bug is `return value || defaultValue`).',
      '',
      'Optional chaining (`a?.b?.[0]?.c`) solves the static case; this function is for paths known only at runtime (config lookups, error mapping, query projections).',
      '',
      'Complexity: O(k) for k path segments.',
    ),
    relatedLessonIds: ['m01-objects-and-prototypes', 'm01-es6-plus-features'],
  },
  {
    id: 'ch-009',
    title: 'Implement once()',
    difficulty: 'beginner',
    topic: 'Closures',
    category: 'javascript',
    prompt: md(
      'Write `once(fn)` that returns a wrapper which calls `fn` only the first time. Every later call returns the **first result** without calling `fn` again.',
      '',
      '- Forward `this` and all arguments on the first call.',
      '- Works even when the first result is `undefined`.',
      '',
      'Typical use: initialising a DB connection or a config loader exactly once.',
    ),
    starterCode: js`
      function once(fn) {
        // TODO: remember whether fn ran and what it returned
      }
    `,
    solution: js`
      function once(fn) {
        let called = false;
        let result;
        return function (...args) {
          if (!called) {
            called = true;
            result = fn.apply(this, args);
          }
          return result;
        };
      }
    `,
    tests: [
      t('(() => { let n = 0; const f = once((a, b) => { n++; return a + b; }); return [f(1, 2), f(5, 5), n]; })()', [3, 3, 1]),
      t('(() => { const o = { x: 10, get: once(function () { return this.x; }) }; return o.get(); })()', 10),
      t('(() => { let n = 0; const f = once(() => { n++; }); f(); f(); f(); return n; })()', 1),
      t('(() => { const f = once((x) => ({ x })); return [f(1) === f(2), f(3).x]; })()', [true, 1]),
    ],
    hints: [
      'Use a boolean flag, not `result === undefined`, to know whether `fn` already ran.',
      'Return a regular `function` (not an arrow) so `this` can be forwarded.',
    ],
    explanation: md(
      'A closure keeps two variables: `called` and `result`. The first call flips the flag and stores the result; later calls just return it.',
      '',
      'Using a flag instead of checking `result` matters when `fn` legitimately returns `undefined`. `fn.apply(this, args)` preserves the method receiver.',
      '',
      'Complexity: O(1) per call.',
    ),
    relatedLessonIds: ['m01-scope-and-closures', 'm01-this-keyword'],
  },
  {
    id: 'ch-010',
    title: 'pipe and compose',
    difficulty: 'beginner',
    topic: 'Functional programming',
    category: 'javascript',
    prompt: md(
      'Write two functions:',
      '',
      '- `pipe(...fns)` — runs functions **left to right**: `pipe(f, g)(x) === g(f(x))`.',
      '- `compose(...fns)` — runs functions **right to left**: `compose(f, g)(x) === f(g(x))`.',
      '',
      'The first function to run receives **all** arguments; the others receive the previous result. With no functions, return the first argument unchanged.',
      '',
      "- `pipe(x => x + 1, x => x * 2)(3)` → `8`",
      "- `compose(x => x + 1, x => x * 2)(3)` → `7`",
    ),
    starterCode: js`
      function pipe(...fns) {
        // TODO: left to right
      }

      function compose(...fns) {
        // TODO: right to left
      }
    `,
    solution: js`
      function pipe(...fns) {
        return (...args) => {
          if (fns.length === 0) return args[0];
          const [first, ...rest] = fns;
          return rest.reduce((acc, fn) => fn(acc), first(...args));
        };
      }

      function compose(...fns) {
        return pipe(...fns.slice().reverse());
      }
    `,
    tests: [
      t('pipe((x) => x + 1, (x) => x * 2)(3)', 8),
      t('compose((x) => x + 1, (x) => x * 2)(3)', 7),
      t('pipe()(5)', 5),
      t("compose()('a')", 'a'),
      t('pipe((a, b) => a + b, (x) => x * 10)(2, 3)', 50),
      t('compose((x) => x * 10, (a, b) => a + b)(2, 3)', 50),
    ],
    hints: ['`Array.prototype.reduce` threads a value through a list of functions.', '`compose` is just `pipe` with the list reversed.'],
    explanation: md(
      '`pipe` calls the first function with all arguments, then `reduce`s the remaining functions over the result. `compose` reuses `pipe` on a reversed copy (do not `reverse()` in place — it would mutate the caller\'s array).',
      '',
      'This is the same idea as Express/Koa middleware chains and Redux `compose`, minus the async part.',
      '',
      'Complexity: O(k) calls for k functions.',
    ),
    relatedLessonIds: ['m01-functions', 'm01-arrow-functions'],
  },
  {
    id: 'ch-011',
    title: 'Aggregate orders per customer',
    difficulty: 'beginner',
    topic: 'Data aggregation',
    category: 'javascript',
    prompt: md(
      'You receive orders `{ customerId, amount, status }` from a database. Write `totalsByCustomer(orders)` returning an array of `{ customerId, orderCount, total }`:',
      '',
      "- Skip orders with `status === 'cancelled'`.",
      '- `total` is rounded to 2 decimals (avoid `0.30000000000000004`).',
      '- Sort by `total` descending, then by `customerId` ascending.',
      '',
      "Example: two paid orders of `10.5` and `4.5` for `c1` → `{ customerId: 'c1', orderCount: 2, total: 15 }`.",
    ),
    starterCode: js`
      function totalsByCustomer(orders) {
        // TODO: one pass with a Map, then sort
      }
    `,
    solution: js`
      function totalsByCustomer(orders) {
        const byCustomer = new Map();
        for (const { customerId, amount, status } of orders) {
          if (status === 'cancelled') continue;
          const row = byCustomer.get(customerId) || { customerId, orderCount: 0, total: 0 };
          row.orderCount += 1;
          row.total += amount;
          byCustomer.set(customerId, row);
        }
        return [...byCustomer.values()]
          .map((row) => ({ ...row, total: Math.round(row.total * 100) / 100 }))
          .sort((a, b) => b.total - a.total || (a.customerId < b.customerId ? -1 : a.customerId > b.customerId ? 1 : 0));
      }
    `,
    tests: [
      t("totalsByCustomer([{ customerId: 'c1', amount: 10.5, status: 'paid' }, { customerId: 'c2', amount: 5, status: 'paid' }, { customerId: 'c1', amount: 4.5, status: 'paid' }, { customerId: 'c2', amount: 100, status: 'cancelled' }])",
        [{ customerId: 'c1', orderCount: 2, total: 15 }, { customerId: 'c2', orderCount: 1, total: 5 }]),
      t('totalsByCustomer([])', []),
      t("totalsByCustomer([{ customerId: 'a', amount: 0.1, status: 'paid' }, { customerId: 'a', amount: 0.2, status: 'paid' }])", [{ customerId: 'a', orderCount: 2, total: 0.3 }]),
      t("totalsByCustomer([{ customerId: 'b', amount: 5, status: 'paid' }, { customerId: 'a', amount: 5, status: 'paid' }]).map((r) => r.customerId)", ['a', 'b']),
      t("totalsByCustomer([{ customerId: 'x', amount: 9, status: 'cancelled' }])", []),
    ],
    hints: ['A `Map` keyed by `customerId` keeps one accumulator row per customer.', 'Chain comparators with `||`: a non-zero first result wins.'],
    explanation: md(
      'One pass builds an accumulator per customer in a `Map` (O(1) lookups). Rounding happens once at the end so errors do not accumulate per row. The sort uses a compound comparator: total descending, then id ascending as a stable tie-breaker.',
      '',
      'In production you would push this into SQL (`GROUP BY customer_id ... ORDER BY total DESC`) or a MongoDB `$group` stage — and store money as integer cents.',
      '',
      'Complexity: O(n + k log k) for n orders and k customers.',
    ),
    relatedLessonIds: ['m01-map-set-weakmap-and-weakset', 'm09-aggregation'],
  },
  {
    id: 'ch-012',
    title: 'Top-K frequent words',
    difficulty: 'intermediate',
    topic: 'Hash maps',
    category: 'javascript',
    prompt: md(
      'Write `topKWords(text, k)` that returns the `k` most frequent words as `[word, count]` pairs.',
      '',
      '- A word is a run of letters/digits `[a-z0-9]`, case-insensitive (lowercase the output).',
      '- Sort by count descending, then alphabetically for ties.',
      '- Return fewer than `k` pairs if there are fewer distinct words.',
      '',
      "- `topKWords('the cat and the hat and the bat', 2)` → `[['the', 3], ['and', 2]]`",
      "- `topKWords('Hello, hello! HELLO?', 1)` → `[['hello', 3]]`",
    ),
    starterCode: js`
      function topKWords(text, k) {
        // TODO: count, sort, slice
      }
    `,
    solution: js`
      function topKWords(text, k) {
        const counts = new Map();
        for (const word of text.toLowerCase().match(/[a-z0-9]+/g) || []) {
          counts.set(word, (counts.get(word) || 0) + 1);
        }
        return [...counts.entries()]
          .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
          .slice(0, k);
      }
    `,
    tests: [
      t("topKWords('the cat and the hat and the bat', 2)", [['the', 3], ['and', 2]]),
      t("topKWords('', 3)", []),
      t("topKWords('B a b A c', 5)", [['a', 2], ['b', 2], ['c', 1]]),
      t("topKWords('Hello, hello! HELLO?', 1)", [['hello', 3]]),
      t("topKWords('x y z', 0)", []),
    ],
    hints: ['`String.prototype.match` with `/g` returns `null` when nothing matches.', 'Sort entries with a two-key comparator.'],
    explanation: md(
      'Tokenise with a regex, count with a `Map`, sort entries by `(count desc, word asc)` and slice. Guard the `null` result of `match` for empty input.',
      '',
      'For huge vocabularies with small k, a size-k min-heap gives O(n log k) instead of sorting everything (O(n log n)).',
      '',
      'Complexity: O(n + m log m) for n characters and m distinct words.',
    ),
    relatedLessonIds: ['m01-map-set-weakmap-and-weakset'],
  },
  {
    id: 'ch-013',
    title: 'Deep equality',
    difficulty: 'intermediate',
    topic: 'Objects',
    category: 'javascript',
    prompt: md(
      'Write `deepEqual(a, b)` that compares two values structurally.',
      '',
      '- Primitives: `===`, except `NaN` equals `NaN`.',
      '- Arrays: same length and deep-equal elements in order. An array never equals a plain object.',
      '- Plain objects: same set of own enumerable keys (order does not matter) with deep-equal values. `{ a: undefined }` does **not** equal `{ b: undefined }`.',
      '- `Date`s are equal when their timestamps are equal.',
      '',
      "- `deepEqual({ a: [1, { b: 2 }] }, { a: [1, { b: 2 }] })` → `true`",
      "- `deepEqual([], {})` → `false`",
    ),
    starterCode: js`
      function deepEqual(a, b) {
        // TODO
      }
    `,
    solution: js`
      function deepEqual(a, b) {
        if (a === b) return true;
        if (Number.isNaN(a) && Number.isNaN(b)) return true;
        if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
        if (a instanceof Date || b instanceof Date) {
          return a instanceof Date && b instanceof Date && a.getTime() === b.getTime();
        }
        if (Array.isArray(a) !== Array.isArray(b)) return false;
        const keysA = Object.keys(a);
        const keysB = Object.keys(b);
        if (keysA.length !== keysB.length) return false;
        for (const key of keysA) {
          if (!Object.prototype.hasOwnProperty.call(b, key)) return false;
          if (!deepEqual(a[key], b[key])) return false;
        }
        return true;
      }
    `,
    tests: [
      t('deepEqual({ a: [1, { b: 2 }] }, { a: [1, { b: 2 }] })', true),
      t('deepEqual([1, 2], [1, 2, 3])', false),
      t('deepEqual(NaN, NaN)', true),
      t('deepEqual({ a: undefined }, { b: undefined })', false),
      t('deepEqual([], {})', false),
      t('[deepEqual(new Date(0), new Date(0)), deepEqual(new Date(0), new Date(1))]', [true, false]),
      t('[deepEqual(null, {}), deepEqual(null, null), deepEqual(1, "1")]', [false, true, false]),
      t('deepEqual({ a: 1, b: 2 }, { b: 2, a: 1 })', true),
    ],
    hints: [
      'Handle identical references and primitives first; only then recurse.',
      'Comparing key counts plus `hasOwnProperty` catches `{ a: undefined }` vs `{ b: undefined }`.',
    ],
    explanation: md(
      'Short-circuit on `===` and the NaN special case. Anything that is not a non-null object at this point is unequal. Dates compare by `getTime()`. Then make sure both are arrays or both are not, compare key counts, and recurse per key using `hasOwnProperty` so a missing key is not confused with an `undefined` value.',
      '',
      'Extensions interviewers ask about: Maps/Sets, cycles (track visited pairs in a `WeakMap`), and prototype checks. Node ships `util.isDeepStrictEqual` and `assert.deepStrictEqual`.',
      '',
      'Complexity: O(n) over the total number of nested values.',
    ),
    relatedLessonIds: ['m01-primitive-and-reference-types', 'm03-util-module'],
  },
  {
    id: 'ch-014',
    title: 'Debounce',
    difficulty: 'intermediate',
    topic: 'Timers and closures',
    category: 'javascript',
    prompt: md(
      'Write `debounce(fn, wait)` that returns a function which delays calling `fn` until `wait` ms have passed **since the last call**.',
      '',
      '- `fn` receives the arguments and `this` of the **last** call.',
      '- The returned function has a `cancel()` method that drops any pending call.',
      '',
      'Example: with `wait = 30`, calls at 0 ms, 5 ms and 10 ms result in **one** call of `fn` at ~40 ms with the third call\'s arguments.',
    ),
    starterCode: js`
      function debounce(fn, wait) {
        // TODO: return a debounced function with a cancel() method
      }
    `,
    solution: js`
      function debounce(fn, wait) {
        let timer = null;
        function debounced(...args) {
          clearTimeout(timer);
          timer = setTimeout(() => {
            timer = null;
            fn.apply(this, args);
          }, wait);
        }
        debounced.cancel = () => {
          clearTimeout(timer);
          timer = null;
        };
        return debounced;
      }
    `,
    tests: [
      t('(async () => { const calls = []; const d = debounce((x) => calls.push(x), 30); d(1); d(2); setTimeout(() => d(3), 10); await new Promise((r) => setTimeout(r, 80)); return calls; })()', [3]),
      t("(async () => { const calls = []; const d = debounce((x) => calls.push(x), 20); d('a'); await new Promise((r) => setTimeout(r, 45)); d('b'); await new Promise((r) => setTimeout(r, 45)); return calls; })()", ['a', 'b']),
      t('(async () => { const calls = []; const d = debounce((x) => calls.push(x), 10); d(1); d.cancel(); await new Promise((r) => setTimeout(r, 30)); return calls; })()', []),
      t('(async () => { const calls = []; const o = { v: 7, f: debounce(function (a, b) { calls.push(this.v + a + b); }, 10) }; o.f(1, 2); await new Promise((r) => setTimeout(r, 30)); return calls; })()', [10]),
      t('(() => { const calls = []; const d = debounce((x) => calls.push(x), 10); d(1); const sync = calls.length; d.cancel(); return sync; })()', 0),
    ],
    hints: [
      'Keep the timer id in a closure; every call clears it and starts a new one.',
      'Use a regular `function` for the wrapper and an arrow inside `setTimeout` so `this` is preserved.',
    ],
    explanation: md(
      'Each call clears the previous timer and schedules a new one, so only the last call in a burst survives. The arrow function inside `setTimeout` captures the wrapper\'s `this` and `args`. `cancel` just clears the pending timer.',
      '',
      'Backend uses: coalescing file-watcher events, batching cache invalidations, delaying a search-index rebuild until writes go quiet.',
      '',
      'Complexity: O(1) per call.',
    ),
    relatedLessonIds: ['m01-scope-and-closures', 'm05-settimeout'],
  },
  {
    id: 'ch-015',
    title: 'Throttle (leading + trailing)',
    difficulty: 'intermediate',
    topic: 'Timers and closures',
    category: 'javascript',
    prompt: md(
      'Write `throttle(fn, wait)` so that `fn` runs **at most once per `wait` ms**.',
      '',
      '- **Leading edge:** the first call runs immediately.',
      '- **Trailing edge:** if more calls arrive during the window, `fn` runs once more at the end of the window with the **latest** arguments.',
      '',
      'Example with `wait = 40`: calls at 0 ms (`1`), 0 ms (`2`) and 10 ms (`3`) → `fn(1)` immediately, `fn(3)` at ~40 ms.',
    ),
    starterCode: js`
      function throttle(fn, wait) {
        // TODO: leading call + one trailing call per window
      }
    `,
    solution: js`
      function throttle(fn, wait) {
        let last = 0;
        let timer = null;
        let pendingArgs = null;
        let pendingThis = null;

        function invoke(ctx, args) {
          last = Date.now();
          fn.apply(ctx, args);
        }

        return function throttled(...args) {
          const remaining = wait - (Date.now() - last);
          if (remaining <= 0 && timer === null) {
            invoke(this, args);
            return;
          }
          pendingArgs = args;
          pendingThis = this;
          if (timer === null) {
            timer = setTimeout(() => {
              timer = null;
              if (pendingArgs) {
                const a = pendingArgs;
                const c = pendingThis;
                pendingArgs = pendingThis = null;
                invoke(c, a);
              }
            }, Math.max(remaining, 0));
          }
        };
      }
    `,
    tests: [
      t('(async () => { const calls = []; const f = throttle((x) => calls.push(x), 40); f(1); f(2); setTimeout(() => f(3), 10); await new Promise((r) => setTimeout(r, 90)); return calls; })()', [1, 3]),
      t('(async () => { const calls = []; const f = throttle((x) => calls.push(x), 30); f(1); await new Promise((r) => setTimeout(r, 50)); return calls; })()', [1]),
      t('(async () => { const calls = []; const f = throttle((x) => calls.push(x), 20); f(1); await new Promise((r) => setTimeout(r, 40)); f(2); await new Promise((r) => setTimeout(r, 5)); return calls; })()', [1, 2]),
      t('(() => { const calls = []; const f = throttle((x) => calls.push(x), 1000); f(1); f(2); f(3); return calls; })()', [1]),
    ],
    hints: [
      'Track the time of the last real invocation.',
      'Only one trailing timer per window; later calls just overwrite the pending arguments.',
    ],
    explanation: md(
      'Record `last` (the time `fn` actually ran). If the window has passed and no trailing timer is pending, run immediately. Otherwise remember the latest arguments and, if not already scheduled, set one timer for the remaining time of the window. When it fires, it runs with the newest arguments and resets `last`.',
      '',
      '**Debounce vs throttle:** debounce waits for silence (one call after a burst); throttle guarantees a steady maximum rate (progress logs, metrics flushes, scroll handlers).',
      '',
      'Complexity: O(1) per call.',
    ),
    relatedLessonIds: ['m01-scope-and-closures', 'm05-settimeout'],
  },
  {
    id: 'ch-016',
    title: 'Memoize with a cache key resolver',
    difficulty: 'intermediate',
    topic: 'Caching',
    category: 'javascript',
    prompt: md(
      'Write `memoize(fn, resolver?)` that caches results.',
      '',
      '- The cache key is `resolver(...args)` if given, otherwise the first argument.',
      '- Expose the cache as `memoized.cache` (a `Map`).',
      '- Cache **every** result, including `undefined`.',
      '- For async functions, concurrent calls with the same key must share the same promise.',
      '',
      "- `const sq = memoize(x => x * x); sq(4); sq(4);` → `fn` runs once.",
    ),
    starterCode: js`
      function memoize(fn, resolver) {
        // TODO: return a memoized function with a .cache Map
      }
    `,
    solution: js`
      function memoize(fn, resolver) {
        function memoized(...args) {
          const key = resolver ? resolver.apply(this, args) : args[0];
          if (memoized.cache.has(key)) return memoized.cache.get(key);
          const result = fn.apply(this, args);
          memoized.cache.set(key, result);
          return result;
        }
        memoized.cache = new Map();
        return memoized;
      }
    `,
    tests: [
      t('(() => { let n = 0; const sq = memoize((x) => { n++; return x * x; }); return [sq(4), sq(4), sq(5), n]; })()', [16, 16, 25, 2]),
      t("(() => { let n = 0; const add = memoize((a, b) => { n++; return a + b; }, (a, b) => a + ',' + b); return [add(1, 2), add(1, 3), add(1, 2), n]; })()", [3, 4, 3, 2]),
      t("(() => { let n = 0; const f = memoize(() => { n++; }); f('k'); f('k'); return n; })()", 1),
      t("(() => { const f = memoize((x) => x); f('a'); f('b'); f('a'); return [f.cache instanceof Map, f.cache.size]; })()", [true, 2]),
      t('(async () => { let n = 0; const get = memoize(async (id) => { n++; return { id }; }); const [a, b] = await Promise.all([get(1), get(1)]); return [a === b, n]; })()', [true, 1]),
    ],
    hints: [
      'Use `cache.has(key)` rather than checking the value, so `undefined` results are cached too.',
      'Caching the returned promise (not the resolved value) dedupes in-flight async calls for free.',
    ],
    explanation: md(
      'Compute a key, return the cached value when `has(key)`, otherwise call through and store. Storing the promise returned by an async function means a second caller during the first request gets the same promise — a simple form of request coalescing.',
      '',
      'Caveats to mention: unbounded growth (use an LRU or TTL in servers), object arguments compared by reference, and cached rejected promises (often you want to `delete` the key on failure).',
      '',
      'Complexity: O(1) average per call plus the cost of `resolver`.',
    ),
    relatedLessonIds: ['m01-scope-and-closures', 'm11-caching'],
  },
  {
    id: 'ch-017',
    title: 'Curry',
    difficulty: 'intermediate',
    topic: 'Functional programming',
    category: 'javascript',
    prompt: md(
      'Write `curry(fn)` that lets you supply `fn`\'s arguments across several calls. Once at least `fn.length` arguments have been collected, call `fn` with them.',
      '',
      "- `const add3 = curry((a, b, c) => a + b + c)`",
      "- `add3(1)(2)(3)`, `add3(1, 2)(3)`, `add3(1)(2, 3)` and `add3(1, 2, 3)` all return `6`.",
      '- Partially applied functions are reusable: `const add1 = add3(1); add1(2)(3); add1(10)(20);`',
    ),
    starterCode: js`
      function curry(fn) {
        // TODO: collect arguments until fn.length is reached
      }
    `,
    solution: js`
      function curry(fn) {
        return function curried(...args) {
          if (args.length >= fn.length) return fn.apply(this, args);
          return (...more) => curried.apply(this, [...args, ...more]);
        };
      }
    `,
    tests: [
      t('(() => { const add3 = curry((a, b, c) => a + b + c); return [add3(1)(2)(3), add3(1, 2)(3), add3(1)(2, 3), add3(1, 2, 3)]; })()', [6, 6, 6, 6]),
      t('(() => { const add3 = curry((a, b, c) => a + b + c); const add1 = add3(1); return [add1(2)(3), add1(10)(20)]; })()', [6, 31]),
      t("curry(() => 'x')()", 'x'),
      t('curry((a, b) => [a, b])(1)(2, 3)', [1, 2]),
      t("(() => { const fmt = curry((sep, a, b) => a + sep + b); const dash = fmt('-'); return [dash('a', 'b'), dash('x')('y')]; })()", ['a-b', 'x-y']),
    ],
    hints: ['`fn.length` is the number of declared parameters.', 'Never mutate the collected `args` — create a new array for each partial call.'],
    explanation: md(
      '`curried` compares the collected argument count with `fn.length`. If enough, call `fn`; otherwise return a new function that concatenates the next arguments and calls `curried` again. Building a fresh array each time is what makes partial applications reusable.',
      '',
      'Note: `fn.length` ignores rest parameters and parameters with defaults, so currying such functions needs an explicit arity.',
      '',
      'Complexity: O(n) argument copying across n partial calls.',
    ),
    relatedLessonIds: ['m01-functions', 'm01-scope-and-closures'],
  },
  {
    id: 'ch-018',
    title: 'Deep set by path (no prototype pollution)',
    difficulty: 'intermediate',
    topic: 'Objects and security',
    category: 'javascript',
    prompt: md(
      'Write `setPath(obj, path, value)` — a tiny `lodash.set` that **mutates** and returns `obj`.',
      '',
      "- `path` is a string (`'a.b[0].c'`) or an array of keys.",
      '- Missing containers are created: an **array** if the next key is a non-negative integer, otherwise an object.',
      "- Security: if any key is `'__proto__'`, `'constructor'` or `'prototype'`, throw `Error('Unsafe key: <key>')` and change nothing.",
      '',
      "- `setPath({}, 'users[0].name', 'Ann')` → `{ users: [{ name: 'Ann' }] }`",
    ),
    starterCode: js`
      function setPath(obj, path, value) {
        // TODO: create missing objects/arrays along the way
      }
    `,
    solution: js`
      const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

      function setPath(obj, path, value) {
        const keys = Array.isArray(path)
          ? path.map(String)
          : path.replace(/\[(\w+)\]/g, '.$1').split('.').filter(Boolean);
        for (const key of keys) {
          if (UNSAFE_KEYS.has(key)) throw new Error('Unsafe key: ' + key);
        }
        let current = obj;
        keys.forEach((key, i) => {
          if (i === keys.length - 1) {
            current[key] = value;
            return;
          }
          if (current[key] === null || typeof current[key] !== 'object') {
            current[key] = /^\d+$/.test(keys[i + 1]) ? [] : {};
          }
          current = current[key];
        });
        return obj;
      }
    `,
    tests: [
      t("setPath({}, 'a.b.c', 1)", { a: { b: { c: 1 } } }),
      t("setPath({}, 'users[0].name', 'Ann')", { users: [{ name: 'Ann' }] }),
      t("setPath({ a: { x: 1 } }, 'a.y', 2)", { a: { x: 1, y: 2 } }),
      t("setPath({}, ['a', '0'], 'v')", { a: ['v'] }),
      t("setPath({}, 'list.2', 'z')", { list: [null, null, 'z'] }),
      t("(() => { try { setPath({}, '__proto__.polluted', true); return 'no error'; } catch (e) { return [e.message, ({}).polluted === undefined]; } })()", ['Unsafe key: __proto__', true]),
      t("(() => { const o = {}; try { setPath(o, ['constructor', 'prototype', 'x'], 1); } catch (e) {} return [Object.keys(o), ({}).x === undefined]; })()", [[], true]),
    ],
    hints: [
      'Validate every key before writing anything.',
      'Look ahead at `keys[i + 1]` to choose between `[]` and `{}`.',
    ],
    explanation: md(
      'Normalise the path, reject dangerous keys up front, then walk the object creating containers where needed. The last key receives the value.',
      '',
      'Why the guard matters: `setPath({}, "__proto__.isAdmin", true)` on an unguarded implementation sets `isAdmin` on `Object.prototype` for **every** object in the process — a real vulnerability class (prototype pollution) in query-string parsers and deep-merge utilities.',
      '',
      'Complexity: O(k) for k path segments.',
    ),
    relatedLessonIds: ['m01-objects-and-prototypes', 'm12-input-validation'],
  },
  {
    id: 'ch-019',
    title: 'Deep freeze',
    difficulty: 'intermediate',
    topic: 'Immutability',
    category: 'javascript',
    prompt: md(
      'Write `deepFreeze(value)` that recursively applies `Object.freeze` to an object, its nested objects and arrays, and returns the same reference.',
      '',
      '- Must handle circular references without infinite recursion.',
      '- Primitives are returned unchanged.',
      '',
      'Typical use: freezing a config object loaded at startup so no module can mutate it.',
    ),
    starterCode: js`
      function deepFreeze(value) {
        // TODO: freeze recursively, survive cycles
      }
    `,
    solution: js`
      function deepFreeze(value, seen = new WeakSet()) {
        if (value === null || typeof value !== 'object' || seen.has(value)) return value;
        seen.add(value);
        for (const key of Reflect.ownKeys(value)) {
          deepFreeze(value[key], seen);
        }
        return Object.freeze(value);
      }
    `,
    tests: [
      t('(() => { const o = deepFreeze({ a: { b: [1, 2] } }); return [Object.isFrozen(o), Object.isFrozen(o.a), Object.isFrozen(o.a.b)]; })()', [true, true, true]),
      t('(() => { const o = deepFreeze({ a: { b: 1 } }); try { o.a.b = 2; } catch (e) {} return o.a.b; })()', 1),
      t("(() => { const o = { name: 'x' }; o.self = o; deepFreeze(o); return Object.isFrozen(o); })()", true),
      t('(() => { const o = {}; return deepFreeze(o) === o; })()', true),
      t('deepFreeze(5)', 5),
      t("(() => { const a = deepFreeze([1, [2]]); try { a[1].push(3); return 'pushed'; } catch (e) { return e instanceof TypeError; } })()", true),
    ],
    hints: [
      '`Object.freeze` is shallow.',
      'A `WeakSet` of visited objects breaks cycles.',
    ],
    explanation: md(
      'Recurse into every own property (`Reflect.ownKeys` also includes symbol keys), tracking visited objects in a `WeakSet` so cycles terminate, then freeze the object itself.',
      '',
      'In strict mode (ES modules, classes) writing to a frozen object throws a `TypeError`; in sloppy mode it fails silently. Freezing has no effect on `Map`/`Set` contents, which are not properties.',
      '',
      'Complexity: O(n) over all reachable objects.',
    ),
    relatedLessonIds: ['m01-objects-and-prototypes', 'm01-map-set-weakmap-and-weakset'],
  },
  {
    id: 'ch-020',
    title: 'Merge overlapping intervals',
    difficulty: 'intermediate',
    topic: 'Sorting',
    category: 'javascript',
    prompt: md(
      'Write `mergeIntervals(intervals)` that merges overlapping or touching `[start, end]` ranges and returns them sorted by start.',
      '',
      '- `[1, 3]` and `[3, 5]` touch → `[1, 5]`.',
      '- Input may be unsorted. Do not mutate it.',
      '',
      "- `mergeIntervals([[1, 3], [2, 6], [8, 10], [15, 18]])` → `[[1, 6], [8, 10], [15, 18]]`",
      '',
      'Backend flavour: merging booked time slots or maintenance windows.',
    ),
    starterCode: js`
      function mergeIntervals(intervals) {
        // TODO: sort, then sweep
      }
    `,
    solution: js`
      function mergeIntervals(intervals) {
        const sorted = intervals.map(([s, e]) => [s, e]).sort((a, b) => a[0] - b[0]);
        const merged = [];
        for (const current of sorted) {
          const last = merged[merged.length - 1];
          if (last && current[0] <= last[1]) {
            last[1] = Math.max(last[1], current[1]);
          } else {
            merged.push(current);
          }
        }
        return merged;
      }
    `,
    tests: [
      t('mergeIntervals([[1, 3], [2, 6], [8, 10], [15, 18]])', [[1, 6], [8, 10], [15, 18]]),
      t('mergeIntervals([[1, 4], [4, 5]])', [[1, 5]]),
      t('mergeIntervals([])', []),
      t('mergeIntervals([[5, 7], [1, 2], [2, 3]])', [[1, 3], [5, 7]]),
      t('mergeIntervals([[1, 10], [2, 3], [4, 5]])', [[1, 10]]),
      t('(() => { const a = [[3, 4], [1, 2]]; mergeIntervals(a); return a; })()', [[3, 4], [1, 2]]),
    ],
    hints: ['Sort by start first.', 'Compare each interval only with the last merged one; remember to take the max end.'],
    explanation: md(
      'After sorting by start, overlapping intervals are adjacent. Sweep once: if the current interval starts before (or at) the end of the last merged one, extend that end with `Math.max` (the current one may be fully contained); otherwise start a new merged interval.',
      '',
      'Copy each pair before sorting so neither the outer array nor the inner pairs of the input are mutated.',
      '',
      'Complexity: O(n log n) for the sort, O(n) for the sweep.',
    ),
    relatedLessonIds: ['m01-arrays-and-array-methods'],
  },
  {
    id: 'ch-021',
    title: 'Convert keys to camelCase (deep)',
    difficulty: 'intermediate',
    topic: 'Data transformation',
    category: 'javascript',
    prompt: md(
      'Database rows often come back as `snake_case`. Write `camelCaseKeys(value)` that deeply converts object keys written in `snake_case` or `kebab-case` to `camelCase`.',
      '',
      '- Recurse into nested objects and arrays.',
      '- Only **keys** change — string values stay as they are.',
      '- Primitives and `null` are returned unchanged.',
      '',
      "- `camelCaseKeys({ user_id: 1, order_items: [{ unit_price: 5 }] })` → `{ userId: 1, orderItems: [{ unitPrice: 5 }] }`",
    ),
    starterCode: js`
      function camelCaseKeys(value) {
        // TODO
      }
    `,
    solution: js`
      function toCamel(key) {
        return key.replace(/[_-]+([a-z0-9])/gi, (_, ch) => ch.toUpperCase());
      }

      function camelCaseKeys(value) {
        if (Array.isArray(value)) return value.map(camelCaseKeys);
        if (value === null || typeof value !== 'object') return value;
        const out = {};
        for (const [key, child] of Object.entries(value)) {
          out[toCamel(key)] = camelCaseKeys(child);
        }
        return out;
      }
    `,
    tests: [
      t("camelCaseKeys({ user_id: 1, first_name: 'A' })", { userId: 1, firstName: 'A' }),
      t("camelCaseKeys({ order_items: [{ unit_price: 5, 'sku-code': 'x' }] })", { orderItems: [{ unitPrice: 5, skuCode: 'x' }] }),
      t("camelCaseKeys({ some_key: 'snake_value' })", { someKey: 'snake_value' }),
      t('camelCaseKeys({ alreadyCamel: true, nested: { deep_er: { deep_est: null } } })', { alreadyCamel: true, nested: { deepEr: { deepEst: null } } }),
      t("[camelCaseKeys(null), camelCaseKeys(3), camelCaseKeys([1, 'a_b'])]", [null, 3, [1, 'a_b']]),
    ],
    hints: ['A regex replace with a callback can upper-case the character after `_` or `-`.', 'Check `Array.isArray` before the generic object branch.'],
    explanation: md(
      'Recursive transform: arrays map over their elements, objects rebuild with converted keys, everything else passes through. The key conversion is a single `replace(/[_-]+([a-z0-9])/gi, ...)` that upper-cases the character following the separator.',
      '',
      'Many ORMs (Sequelize `underscored`, Prisma `@map`, Knex `wrapIdentifier`) do this mapping for you; when they do not, a helper like this sits in the repository layer.',
      '',
      'Complexity: O(n) over all keys and values.',
    ),
    relatedLessonIds: ['m09-repository-pattern', 'm01-arrays-and-array-methods'],
  },
  {
    id: 'ch-022',
    title: 'Deep clone with cycles, Date, Map and Set',
    difficulty: 'advanced',
    topic: 'Objects',
    category: 'javascript',
    prompt: md(
      'Write `deepClone(value)` **without** `structuredClone` or `JSON`.',
      '',
      'Support:',
      '- primitives, arrays and plain objects',
      '- `Date` (new Date with the same time), `Map` and `Set` (keys/values cloned too)',
      '- circular references and shared references: if the same object appears twice in the input, it appears as the same (cloned) object twice in the output.',
    ),
    starterCode: js`
      function deepClone(value) {
        // TODO: track already-cloned objects to handle cycles
      }
    `,
    solution: js`
      function deepClone(value, seen = new WeakMap()) {
        if (value === null || typeof value !== 'object') return value;
        if (seen.has(value)) return seen.get(value);

        if (value instanceof Date) return new Date(value.getTime());

        if (value instanceof Map) {
          const copy = new Map();
          seen.set(value, copy);
          for (const [k, v] of value) copy.set(deepClone(k, seen), deepClone(v, seen));
          return copy;
        }

        if (value instanceof Set) {
          const copy = new Set();
          seen.set(value, copy);
          for (const v of value) copy.add(deepClone(v, seen));
          return copy;
        }

        const copy = Array.isArray(value) ? [] : Object.create(Object.getPrototypeOf(value));
        seen.set(value, copy);
        for (const key of Object.keys(value)) copy[key] = deepClone(value[key], seen);
        return copy;
      }
    `,
    tests: [
      t('(() => { const o = { a: [1, { b: 2 }] }; const c = deepClone(o); c.a[1].b = 99; return [o.a[1].b, c.a[1].b, c !== o, c.a !== o.a]; })()', [2, 99, true, true]),
      t('(() => { const d = new Date(5); const c = deepClone({ d }); return [c.d instanceof Date, c.d.getTime(), c.d !== d]; })()', [true, 5, true]),
      t("(() => { const m = new Map([['k', { v: 1 }]]); const s = new Set([1, 2]); const c = deepClone({ m, s }); c.m.get('k').v = 2; return [m.get('k').v, c.m instanceof Map, [...c.s], c.s !== s]; })()", [1, true, [1, 2], true]),
      t("(() => { const o = { name: 'root' }; o.self = o; o.list = [o]; const c = deepClone(o); return [c.self === c, c.list[0] === c, c !== o, c.name]; })()", [true, true, true, 'root']),
      t("[deepClone(null), deepClone(5), deepClone('s')]", [null, 5, 's']),
      t('(() => { const shared = { x: 1 }; const c = deepClone({ a: shared, b: shared }); return [c.a === c.b, c.a !== shared]; })()', [true, true]),
      t('(() => { const sc = globalThis.structuredClone; const j = JSON.parse; globalThis.structuredClone = undefined; JSON.parse = undefined; try { const c = deepClone({ x: [1] }); return [c.x[0], Array.isArray(c.x)]; } finally { globalThis.structuredClone = sc; JSON.parse = j; } })()', [1, true]),
    ],
    hints: [
      'A `WeakMap` from original → clone handles both cycles and shared references.',
      'Register the clone in the map **before** recursing into its children.',
    ],
    explanation: md(
      'Recursive copy with a `WeakMap` memo. The crucial detail is to store the new container in the memo *before* cloning its children — otherwise a child that points back to the parent recurses forever. Dates are copied by timestamp; Maps and Sets are rebuilt entry by entry.',
      '',
      '`JSON.parse(JSON.stringify(x))` loses Dates (become strings), `undefined`, Maps/Sets and throws on cycles. In Node 17+ the built-in `structuredClone` handles most of this (but not functions or class prototypes).',
      '',
      'Complexity: O(n) time and space over all reachable values.',
    ),
    relatedLessonIds: ['m01-primitive-and-reference-types', 'm01-map-set-weakmap-and-weakset'],
  },
];
