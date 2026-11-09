import type { ModuleContent } from '../../../types';
import { bullets, code, dedent, interviewTip, note, section, steps, table, text, tip, warn } from '../helpers';

const content: Partial<ModuleContent> = {
  // ───────────────────────────────────────────────────────────
  'map-set-weakmap-and-weakset': {
    summary: 'Map is a key/value collection that accepts any key type and keeps insertion order; Set stores unique values; WeakMap/WeakSet hold object keys weakly so entries disappear when the object is garbage-collected.',
    topics: ['Map', 'Set', 'WeakMap', 'WeakSet', 'SameValueZero', 'iteration order', 'deduplication', 'Object vs Map', 'garbage collection', 'caching', 'private data'],
    sections: [
      section('introduction', undefined,
        text('Plain objects are often used as dictionaries, but they only allow string/symbol keys and inherit properties like `toString`. ES2015 added dedicated collections: **Map**, **Set**, and their "weak" versions for memory-sensitive caches.'),
      ),
      section('definition', 'The four collections',
        table('Map / Set / WeakMap / WeakSet', ['', 'Map', 'Set', 'WeakMap', 'WeakSet'], [
          ['Stores', 'key → value', 'unique values', 'object key → value', 'unique objects'],
          ['Key types', 'Any (objects, NaN, functions…)', 'Any', 'Objects (and non-registered symbols, Node 20+)', 'Objects (and non-registered symbols)'],
          ['Iterable / `.size`', 'Yes', 'Yes', 'No', 'No'],
          ['Holds keys strongly?', 'Yes (prevents GC)', 'Yes', 'No — weak', 'No — weak'],
          ['Typical use', 'Caches, lookups, counters', 'Dedup, membership', 'Per-object metadata', 'Marking/visited objects'],
        ]),
        table('Object vs Map', ['', 'Object', 'Map'], [
          ['Keys', 'Strings and symbols (others coerced to string)', 'Any value, no coercion'],
          ['Inherited keys', 'Yes (`toString`, `__proto__`…)', 'None'],
          ['Size', '`Object.keys(o).length` (O(n))', '`map.size`'],
          ['Order', 'Integer keys first (ascending), then insertion order', 'Insertion order'],
          ['Iteration', 'Via `Object.entries`', 'Directly iterable'],
          ['JSON', 'Native', 'Needs conversion (`Object.fromEntries`)'],
          ['Frequent add/delete', 'Slower (shape changes)', 'Optimised for it'],
        ]),
      ),
      section('why', 'Why use them',
        bullets(
          'Map: user-supplied keys are safe (no `__proto__` collisions), object keys are possible, and `size` is O(1).',
          'Set: deduplicate IDs/tags in one line; O(1) average `has` instead of O(n) `array.includes`.',
          'WeakMap: attach data to objects you do not own (request objects, sockets) without causing memory leaks.',
        ),
      ),
      section('internals', 'How they work',
        bullets(
          'Map and Set are implemented as hash tables in V8 (deterministic ordered hash tables), giving average O(1) `get`/`set`/`has`/`delete` while preserving insertion order.',
          'Key equality uses **SameValueZero**: like `===`, except `NaN` equals `NaN` (and `+0` equals `-0`). Objects are compared by identity.',
          'WeakMap keys are held **weakly**: if the only reference to a key object is the WeakMap, the garbage collector may remove the object and its entry (implemented with ephemeron tables).',
          'Because entries can vanish at any time, WeakMap/WeakSet cannot be iterated and have no `size` — the result would be non-deterministic.',
        ),
      ),
      section('example', 'Map',
        code({
          title: 'Basic Map operations',
          code: dedent(`
            const sessions = new Map();
            sessions.set('abc', { userId: 1 });
            sessions.set('def', { userId: 2 });
            console.log(sessions.get('abc'));
            console.log(sessions.has('xyz'), sessions.size);
            sessions.delete('def');
            console.log(sessions);

            const objKey = { id: 1 };
            const meta = new Map([[objKey, 'object as key'], [1, 'number key'], ['1', 'string key']]);
            console.log(meta.get(objKey), '|', meta.get(1), '|', meta.get('1'));
          `),
          expectedOutput: "{ userId: 1 }\nfalse 2\nMap(1) { 'abc' => { userId: 1 } }\nobject as key | number key | string key",
          explanation: [
            '`set` / `get` / `has` / `delete` / `size` are the core API.',
            'A Map can be built from an array of `[key, value]` pairs.',
            '`1` and `"1"` are different keys in a Map — no coercion.',
          ],
          runnable: true,
        }),
        code({
          title: 'Why not a plain object? Keys get stringified',
          code: dedent(`
            const obj = {};
            const k1 = { id: 1 };
            const k2 = { id: 2 };
            obj[k1] = 'first';
            obj[k2] = 'second';
            console.log(Object.keys(obj), obj[k1]);
          `),
          expectedOutput: "[ '[object Object]' ] second",
          explanation: [
            'Both object keys are converted to the string `"[object Object]"`, so the second write overwrites the first.',
            'A Map would keep two separate entries.',
          ],
          runnable: true,
        }),
        code({
          title: 'Iterating and converting a Map',
          code: dedent(`
            const m = new Map([['b', 2], ['a', 1]]);
            for (const [key, value] of m) {
              console.log(key, value);
            }
            console.log([...m.keys()], Object.fromEntries(m));
            console.log(JSON.stringify(m), JSON.stringify(Object.fromEntries(m)));
          `),
          expectedOutput: "b 2\na 1\n[ 'b', 'a' ] { b: 2, a: 1 }\n{} {\"b\":2,\"a\":1}",
          explanation: [
            'Maps iterate in insertion order as `[key, value]` pairs.',
            '`JSON.stringify(map)` gives `{}` — convert with `Object.fromEntries` first (string keys only).',
          ],
          runnable: true,
        }),
      ),
      section('example', 'Set',
        code({
          title: 'Uniqueness and membership',
          code: dedent(`
            const tags = ['node', 'js', 'node', 'api', 'js'];
            const unique = [...new Set(tags)];
            console.log(unique);
            const s = new Set([1, 2, 3]);
            s.add(2).add(4);
            console.log(s, s.has(4), s.size);
            const a = new Set([1, 2, 3]);
            const b = new Set([2, 3, 4]);
            console.log([...a].filter((x) => b.has(x)));
            console.log(new Set([NaN, NaN, 0, -0]).size);
            console.log(new Set([{}, {}]).size);
          `),
          expectedOutput: "[ 'node', 'js', 'api' ]\nSet(4) { 1, 2, 3, 4 } true 4\n[ 2, 3 ]\n2\n2",
          explanation: [
            '`[...new Set(arr)]` is the idiomatic dedupe, keeping first-seen order.',
            'Adding an existing value does nothing; `add` returns the Set so calls chain.',
            'Intersection via `filter` + `has` (newer runtimes also have `a.intersection(b)`).',
            'SameValueZero: `NaN` is deduped and `0`/`-0` are equal → 2 values. Two `{}` literals are different objects → 2.',
          ],
          runnable: true,
        }),
      ),
      section('example', 'WeakMap and WeakSet',
        code({
          title: 'Per-object private data',
          code: dedent(`
            const privateData = new WeakMap();
            class ApiRequest {
              constructor(id) {
                privateData.set(this, { startedAt: 100 + id });
                this.id = id;
              }
              startedAt() {
                return privateData.get(this).startedAt;
              }
            }
            const r = new ApiRequest(1);
            console.log(r.startedAt(), privateData.has(r));
            console.log(privateData);
            try {
              privateData.set('string-key', 1);
            } catch (e) {
              console.log(e.name + ': ' + e.message);
            }
            const seen = new WeakSet();
            seen.add(r);
            console.log(seen.has(r), seen.has({}));
          `),
          expectedOutput: "101 true\nWeakMap { <items unknown> }\nTypeError: Invalid value used as weak map key\ntrue false",
          explanation: [
            'When `r` is no longer referenced anywhere else, its WeakMap entry can be garbage-collected automatically.',
            'WeakMaps cannot be listed, so util.inspect shows `<items unknown>`.',
            'Primitive keys are rejected — a weak reference to a string makes no sense.',
            'WeakSet is useful for "have I seen this object?" checks (e.g. cycle detection) without leaking.',
          ],
          runnable: true,
        }),
      ),
      section('real-world', 'Caching in a Node service',
        code({
          title: 'A tiny TTL cache built on Map',
          code: dedent(`
            function createCache(ttlMs) {
              const store = new Map();
              return {
                set(key, value, now) {
                  store.set(key, { value, expires: now + ttlMs });
                },
                get(key, now) {
                  const hit = store.get(key);
                  if (!hit) return undefined;
                  if (hit.expires <= now) {
                    store.delete(key);
                    return undefined;
                  }
                  return hit.value;
                },
                size: () => store.size,
              };
            }
            const cache = createCache(1000);
            cache.set('user:1', { name: 'ana' }, 0);
            console.log(cache.get('user:1', 500));
            console.log(cache.get('user:1', 1500), cache.size());
          `),
          expectedOutput: "{ name: 'ana' }\nundefined 0",
          explanation: [
            'Map gives O(1) lookups and safe arbitrary keys.',
            'Time is passed in (`now`) so the cache is deterministic and testable.',
            'A Map cache in a long-running process must evict entries (TTL/LRU), otherwise it grows forever. For multi-instance apps use Redis (Module 11).',
          ],
          runnable: true,
        }),
      ),
      section('mistakes', 'Common mistakes',
        bullets(
          'Using `map[key] = value` on a Map — that sets a normal object property, not a Map entry.',
          'Expecting `JSON.stringify` to serialise a Map or Set.',
          'Using a Map as an unbounded cache — memory leak.',
          'Expecting a WeakMap to free memory while you still hold the key elsewhere.',
          'Using objects as Set members and expecting structural equality (`new Set([{a:1},{a:1}]).size === 2`).',
        ),
        code({
          title: 'Wrong vs right',
          code: dedent(`
            const m = new Map();
            m['x'] = 1;
            console.log(m.size, m.get('x'));
            m.set('x', 1);
            console.log(m.size, m.get('x'));
          `),
          expectedOutput: '0 undefined\n1 1',
          explanation: ['Bracket assignment creates a plain property on the Map object; only `set` adds an entry.'],
          runnable: true,
        }),
      ),
      section('interview', 'Interview tips',
        interviewTip('Compare Map vs Object along keys, order, size, prototype and performance — a table-style answer works well.'),
        interviewTip('For WeakMap, explain *why* it is not iterable: GC timing would make the output non-deterministic.'),
      ),
      section('practice', 'Practice',
        steps(
          'Count word frequency in a sentence with a Map and print the top 3.',
          'Implement an LRU cache with a Map (hint: delete and re-set a key to move it to the end; evict `map.keys().next().value`).',
        ),
      ),
      section('summary', 'Summary',
        bullets(
          'Map: any key type, insertion order, `size`, safe for user keys.',
          'Set: unique values via SameValueZero, fast membership.',
          'WeakMap/WeakSet: object keys held weakly, no iteration or size.',
          'Convert Map → JSON with `Object.fromEntries`.',
        ),
      ),
    ],
    revisionNotes: [
      'Map keys: any type, compared with SameValueZero (NaN === NaN).',
      'Object keys coerce to strings: obj[{}] → "[object Object]".',
      '[...new Set(arr)] dedupes preserving order.',
      'WeakMap keys must be objects; not iterable; no size.',
      'JSON.stringify(new Map()) → "{}".',
      'map["k"] = v is NOT map.set.',
    ],
    quiz: [
      {
        kind: 'predict-output', difficulty: 'beginner',
        prompt: 'What does this print?',
        code: "console.log(new Set([1, '1', 1, 2]).size);",
        options: ['2', '3', '4', '1'],
        answer: 1,
        explanation: 'Set uses SameValueZero (no coercion): the values are `1`, `"1"` and `2` → 3 distinct values.',
      },
      {
        kind: 'mcq', difficulty: 'intermediate',
        prompt: 'Why can\'t you iterate over a WeakMap?',
        options: [
          'Because its keys are symbols',
          'Because entries can be garbage-collected at any time, so iteration would be non-deterministic',
          'Because it is implemented in C++',
          'Because WeakMap only stores one entry',
        ],
        answer: 1,
        explanation: 'Weak references mean the GC decides when entries disappear. Exposing iteration or size would leak GC timing.',
      },
      {
        kind: 'scenario', difficulty: 'intermediate',
        prompt: 'You need to store a per-connection metadata object for socket objects created by a library, without modifying the sockets and without leaking memory after they close. What should you use?',
        options: ['A plain object keyed by socket', 'A Map keyed by socket', 'A WeakMap keyed by socket', 'An array of [socket, meta] pairs'],
        answer: 2,
        explanation: 'A WeakMap lets the metadata be collected together with the socket. A Map or array would hold the socket alive forever; a plain object would stringify every socket to the same key.',
      },
    ],
    interview: [
      {
        category: 'javascript', kind: 'concept', difficulty: 'beginner', topic: 'Collections',
        question: 'When would you use a Map instead of a plain object?',
        shortAnswer: 'When keys are not strings (objects, numbers without coercion), come from user input, change frequently, or you need insertion order and a cheap size.',
        detailedAnswer: [
          'Maps accept any key type with no string coercion.',
          'No inherited keys — `__proto__`/`constructor` are safe as keys.',
          '`size` is O(1); iteration is built in and ordered by insertion.',
          'Better performance for frequent additions/removals.',
          'Objects remain better for fixed-shape records and JSON.',
        ],
        followUp: 'How do you serialise a Map to JSON?',
      },
      {
        category: 'javascript', kind: 'concept', difficulty: 'beginner', topic: 'Collections',
        question: 'How do you remove duplicates from an array in JavaScript?',
        shortAnswer: 'For primitives, `[...new Set(arr)]` — it keeps the first occurrence and the original order. For objects, dedupe by a key using a Map or a Set of seen keys.',
        detailedAnswer: [
          'Set uses SameValueZero so NaN is deduped too.',
          'Objects are compared by reference, so equal-looking objects are not deduped.',
          'By key: `[...new Map(arr.map((o) => [o.id, o])).values()]` (keeps the last occurrence).',
          '`filter((v, i) => arr.indexOf(v) === i)` works but is O(n²).',
        ],
        followUp: 'How would you keep the first occurrence when deduping objects by id?',
      },
      {
        category: 'javascript', kind: 'concept', difficulty: 'intermediate', topic: 'Collections',
        question: 'What are WeakMap and WeakSet, and when are they useful in Node.js?',
        shortAnswer: 'Collections whose object keys are held weakly: they do not prevent garbage collection, so entries vanish with their key. They are useful for attaching metadata or caches to objects you do not own without leaking memory.',
        detailedAnswer: [
          'Keys must be objects (or non-registered symbols in newer engines).',
          'No iteration, no `size`, no `clear` — only `get/set/has/delete` (WeakSet: `add/has/delete`).',
          'Use cases: per-request/per-socket metadata, memoizing results per object, private data for classes, cycle detection.',
          'Values are held strongly while the key is alive — a value referencing its own key is still collectable (ephemeron semantics).',
          'Related: `WeakRef` and `FinalizationRegistry` for advanced cases.',
        ],
        followUp: 'What is the difference between a WeakMap and a WeakRef?',
        trap: 'Thinking WeakMap values are weak — it is the keys that are weak.',
      },
    ],
  },

  // ───────────────────────────────────────────────────────────
  'error-handling': {
    summary: 'Errors are objects thrown with `throw` and caught with `try/catch/finally`; built-in types (TypeError, RangeError…) and custom subclasses of Error carry name, message, stack and cause so failures can be handled precisely.',
    topics: ['try', 'catch', 'finally', 'throw', 'Error', 'TypeError', 'ReferenceError', 'RangeError', 'SyntaxError', 'custom errors', 'error.cause', 'stack trace', 'operational vs programmer errors', 'async errors'],
    sections: [
      section('introduction', undefined,
        text('Things go wrong: bad JSON, missing records, network timeouts. Good error handling means **failing loudly, with useful information, at the right layer** — and never crashing a server because one request had bad input.'),
      ),
      section('definition', 'Building blocks',
        bullets(
          '`throw value` stops the current function and unwinds the call stack until a matching `catch` is found.',
          '`try { } catch (err) { } finally { }` — `catch` runs on error, `finally` runs **always** (success, error, or `return`).',
          '`Error` objects have `name`, `message`, `stack`, and optionally `cause` (ES2022).',
        ),
        table('Built-in error types', ['Type', 'Thrown when', 'Example'], [
          ['`TypeError`', 'A value has the wrong type for an operation', '`undefined.x`, calling a non-function'],
          ['`ReferenceError`', 'A name cannot be resolved (or TDZ)', '`notDefined`, `let` before init'],
          ['`RangeError`', 'A number is out of an allowed range', '`new Array(-1)`, stack overflow'],
          ['`SyntaxError`', 'Code or data cannot be parsed', '`JSON.parse("{")`'],
          ['`URIError`, `EvalError`', 'Rare', '`decodeURIComponent("%")`'],
          ['`AggregateError`', 'Several errors at once', '`Promise.any` all rejected'],
        ]),
      ),
      section('why', 'Why structured errors matter in backends',
        bullets(
          '**Operational errors** (expected: invalid input, not found, timeout) should become proper HTTP responses (400, 404, 503).',
          '**Programmer errors** (bugs: `undefined is not a function`) should be logged with stack traces and fixed — often the process should restart.',
          'Custom error classes let a central handler map errors to status codes without string-matching messages.',
        ),
      ),
      section('internals', 'What happens when you throw',
        steps(
          '`new Error(msg)` captures the **stack trace** at construction time (V8 `Error.captureStackTrace`), not at `throw` time.',
          '`throw` begins **stack unwinding**: the engine pops frames until it finds one inside a `try` block.',
          'Before leaving each `try`, its `finally` block runs.',
          'If no `catch` is found, the error is **uncaught**: in Node.js the process prints it and exits with code 1 (`uncaughtException`).',
          '`try/catch` only catches errors thrown **synchronously** during the `try` block. A callback that runs later (timer, I/O) is on a new call stack — the original `try` is long gone.',
          'Promise rejections travel through the promise chain instead (`.catch`, or `try/catch` around `await`).',
        ),
        note('You can throw any value (`throw "oops"`), but only `Error` objects carry a stack trace. Always throw `Error` instances.'),
      ),
      section('example', 'try / catch / finally',
        code({
          title: 'Parsing user input safely',
          code: dedent(`
            function parseConfig(json) {
              try {
                const cfg = JSON.parse(json);
                console.log('parsed', cfg);
                return cfg;
              } catch (err) {
                console.log('caught', err.name);
                return null;
              } finally {
                console.log('finally always runs');
              }
            }
            parseConfig('{"port":3000}');
            parseConfig('{bad json');
          `),
          expectedOutput: 'parsed { port: 3000 }\nfinally always runs\ncaught SyntaxError\nfinally always runs',
          explanation: [
            'Valid JSON: the try block returns, but `finally` still runs before the function actually returns.',
            'Invalid JSON: `JSON.parse` throws a `SyntaxError`, `catch` handles it, then `finally` runs.',
          ],
          runnable: true,
        }),
        code({
          title: 'finally can override a return',
          code: dedent(`
            function f() {
              try {
                return 'from try';
              } finally {
                console.log('cleanup');
              }
            }
            function g() {
              try {
                return 'from try';
              } finally {
                return 'from finally';
              }
            }
            console.log(f());
            console.log(g());
          `),
          expectedOutput: 'cleanup\nfrom try\nfrom finally',
          explanation: [
            'In `f`, the return value is remembered, `finally` runs, then the value is returned.',
            'In `g`, a `return` inside `finally` **replaces** the pending return (it would also swallow a thrown error). Avoid returning from `finally`.',
          ],
          runnable: true,
        }),
        code({
          title: 'Throwing non-errors loses the stack',
          code: dedent(`
            try {
              throw 'just a string';
            } catch (e) {
              console.log(typeof e, e.stack);
            }
            try {
              null.length;
            } catch (e) {
              console.log(e instanceof TypeError, typeof e.stack);
            }
          `),
          expectedOutput: 'string undefined\ntrue string',
          explanation: [
            'A thrown string has no `stack`, so logs cannot tell you where it came from.',
            'Engine-thrown errors are proper `Error` subclasses with stacks.',
          ],
          runnable: true,
        }),
      ),
      section('example', 'Custom errors and causes',
        code({
          title: 'An error hierarchy for an API',
          code: dedent(`
            class AppError extends Error {
              constructor(message, statusCode, options) {
                super(message, options);
                this.name = this.constructor.name;
                this.statusCode = statusCode;
              }
            }
            class NotFoundError extends AppError {
              constructor(resource) {
                super(resource + ' not found', 404);
              }
            }
            try {
              throw new NotFoundError('User');
            } catch (err) {
              console.log(err instanceof NotFoundError, err instanceof AppError, err instanceof Error);
              console.log(err.name, err.statusCode, err.message);
            }
          `),
          expectedOutput: 'true true true\nNotFoundError 404 User not found',
          explanation: [
            'Extending `Error` keeps `stack` and `instanceof` working.',
            '`this.constructor.name` sets `name` automatically for every subclass.',
            'A central handler can check `err instanceof AppError` and use `err.statusCode`.',
          ],
          runnable: true,
        }),
        code({
          title: 'Wrapping with error.cause',
          code: dedent(`
            function loadUser() {
              try {
                JSON.parse('not json');
              } catch (err) {
                throw new Error('Failed to load user', { cause: err });
              }
            }
            try {
              loadUser();
            } catch (err) {
              console.log(err.message);
              console.log(err.cause.name);
            }
          `),
          expectedOutput: 'Failed to load user\nSyntaxError',
          explanation: [
            'Add context at each layer without losing the original error.',
            'Node prints the cause chain when logging the error.',
          ],
          versionNote: '`error.cause` needs Node 16.9+.',
          runnable: true,
        }),
      ),
      section('example', 'try/catch does not cross async boundaries',
        code({
          title: 'An error inside a timer callback',
          code: dedent(`
            try {
              setTimeout(() => {
                try {
                  throw new Error('inside timer');
                } catch (e) {
                  console.log('caught inside:', e.message);
                }
              }, 0);
            } catch (e) {
              console.log('outer catch never sees it');
            }
            console.log('outer try finished');
          `),
          expectedOutput: 'outer try finished\ncaught inside: inside timer',
          explanation: [
            'The outer `try` only covers the synchronous `setTimeout(...)` call, which succeeds.',
            'The callback runs later on a fresh call stack; only a `try` **inside** the callback can catch its errors.',
            'Without the inner `try`, this would be an uncaught exception that crashes a Node process.',
          ],
          runnable: true,
        }),
      ),
      section('real-world', 'Central error handling in a Node API',
        code({
          title: 'Mapping errors to HTTP responses (Express-style)',
          code: dedent(`
            // Express error-handling middleware has 4 parameters
            app.use((err, req, res, next) => {
              if (err instanceof AppError) {
                return res.status(err.statusCode).json({ error: err.message });
              }
              logger.error({ err }, 'unexpected error');   // programmer error: log the stack
              res.status(500).json({ error: 'Internal Server Error' });
            });

            // last-resort safety nets (Node core)
            process.on('unhandledRejection', (reason) => { logger.fatal(reason); process.exit(1); });
            process.on('uncaughtException', (err) => { logger.fatal(err); process.exit(1); });
          `),
          explanation: [
            'Operational errors become clean responses; unknown errors become 500 without leaking internals.',
            'After an `uncaughtException` the process state is unknown — log and exit, and let a supervisor (PM2, Kubernetes) restart it.',
            'Express error middleware is covered in Module 8.',
          ],
        }),
      ),
      section('mistakes', 'Common mistakes',
        bullets(
          'Empty `catch {}` blocks that swallow errors silently.',
          'Throwing strings or plain objects instead of `Error` instances.',
          'Wrapping async callbacks in an outer `try` and expecting it to catch.',
          'Sending `err.stack` or raw DB messages to API clients (information leak).',
          'Catching too broadly and turning bugs into "400 Bad Request".',
          '`return` inside `finally`, which swallows errors.',
        ),
        warn('Never use `try/catch` as flow control for expected cases you can check up front (e.g. `if (!user) return res.status(404)...`).'),
      ),
      section('interview', 'Interview tips',
        interviewTip('Distinguish operational vs programmer errors — it is a classic Node.js interview theme.'),
        interviewTip('Explain why `try/catch` cannot catch an error thrown inside a `setTimeout` callback (different call stack).'),
      ),
      section('practice', 'Practice',
        text('Create `ValidationError` (400) and `ConflictError` (409) subclasses of `AppError`. Write `toHttpResponse(err)` that returns `{ status, body }` for app errors and `{ status: 500, body: { error: "Internal Server Error" } }` for anything else.'),
      ),
      section('summary', 'Summary',
        bullets(
          '`throw` unwinds the stack to the nearest `catch`; `finally` always runs.',
          'Always throw `Error` objects; subclass them for domain errors.',
          'Use `cause` to wrap errors with context.',
          '`try/catch` is synchronous; async errors need promise handling.',
          'Operational errors → responses; programmer errors → log, fix, restart.',
        ),
      ),
    ],
    revisionNotes: [
      'finally runs always; return in finally overrides try/catch result.',
      'Stack trace is captured when the Error is created.',
      'Custom errors: class X extends Error { constructor(m) { super(m); this.name = "X"; } }',
      'new Error(msg, { cause }) — Node 16.9+.',
      'try/catch does not catch errors in later callbacks (timers, I/O).',
      'Uncaught exception in Node → exit code 1.',
      'Optional catch binding: catch { } (ES2019).',
    ],
    quiz: [
      {
        kind: 'predict-output', difficulty: 'beginner',
        prompt: 'What does this print?',
        code: dedent(`
          function test() {
            try {
              throw new Error('x');
            } catch (e) {
              return 'catch';
            } finally {
              console.log('finally');
            }
          }
          console.log(test());
        `),
        options: ['catch finally', 'finally catch', 'finally', 'catch'],
        answer: 1,
        explanation: '`finally` runs before the function actually returns, so it logs first; then the caller logs the returned "catch".',
      },
      {
        kind: 'find-bug', difficulty: 'intermediate',
        prompt: 'The server crashes on bad data despite the try/catch. Why?',
        code: dedent(`
          try {
            fs.readFile('data.json', 'utf8', (err, text) => {
              const data = JSON.parse(text);
              console.log(data);
            });
          } catch (e) {
            console.error('bad file', e);
          }
        `),
        options: [
          'fs.readFile is synchronous',
          'JSON.parse runs later inside the callback, outside the try block',
          'console.error throws',
          'The callback should not have parameters',
        ],
        answer: 1,
        explanation: 'The `try` only covers scheduling `readFile`. The callback runs on a later call stack; the parse error is uncaught. Put `try/catch` inside the callback (and check `err`), or use `fs/promises` with `await`.',
      },
      {
        kind: 'mcq', difficulty: 'intermediate',
        prompt: 'Why should a custom error set `this.name`?',
        options: [
          'Otherwise instanceof fails',
          'So logs and stack traces show the specific error type instead of "Error"',
          'It is required by the Error constructor',
          'To make the error serialisable with JSON.stringify',
        ],
        answer: 1,
        explanation: '`instanceof` works without it (prototype chain), but `name` defaults to "Error", which makes logs and `toString()` less informative.',
      },
    ],
    interview: [
      {
        category: 'javascript', kind: 'concept', difficulty: 'beginner', topic: 'Errors',
        question: 'How does try/catch/finally work, and when does finally run?',
        shortAnswer: '`try` runs code; if it throws, control jumps to `catch` with the error; `finally` runs afterwards in every case — success, error, or an early return.',
        detailedAnswer: [
          'An error thrown in `try` unwinds the stack to the nearest enclosing `catch`.',
          '`finally` is used for cleanup: closing files, releasing DB connections, stopping timers.',
          'A `return` or `throw` inside `finally` overrides whatever `try`/`catch` produced.',
          'The catch parameter is optional since ES2019: `catch { }`.',
        ],
        followUp: 'What happens if catch itself throws?',
      },
      {
        category: 'javascript', kind: 'concept', difficulty: 'intermediate', topic: 'Errors',
        question: 'Why create custom error classes, and how do you implement one correctly?',
        shortAnswer: 'They let you distinguish failure types with instanceof and attach data such as HTTP status codes; implement by extending Error, calling super(message, options) and setting name.',
        detailedAnswer: [
          'Central handlers can map `NotFoundError` → 404 without parsing messages.',
          '`class AppError extends Error { constructor(msg, status, opts) { super(msg, opts); this.name = new.target.name; this.status = status; } }`.',
          'Passing `options` forwards `cause`.',
          'Stack traces are preserved automatically with `extends Error`.',
          'Add an `isOperational` flag or error codes for machine-readable handling.',
        ],
        followUp: 'How do you distinguish operational errors from programmer errors?',
      },
      {
        category: 'javascript', kind: 'concept', difficulty: 'intermediate', topic: 'Errors',
        question: 'Why can\'t a surrounding try/catch catch an error thrown inside a setTimeout or I/O callback?',
        shortAnswer: 'Because the callback runs later on a new call stack, after the try block has already finished; try/catch only catches errors thrown synchronously while it is on the stack.',
        detailedAnswer: [
          'Scheduling (`setTimeout(...)`) succeeds immediately, so the try exits normally.',
          'When the event loop later runs the callback, the original frames are gone.',
          'Handle errors inside the callback, via error-first callback arguments, or via promises.',
          'With `async/await`, a `try` around `await` does work, because the function resumes inside the same try.',
          'Uncaught errors in callbacks trigger `uncaughtException` and crash Node.',
        ],
        followUp: 'Why does try/catch work around await but not around a callback API?',
      },
    ],
  },

  // ───────────────────────────────────────────────────────────
  'es6-plus-features': {
    summary: 'ES2015 and later editions added the features modern Node code relies on: let/const, arrows, classes, template literals, destructuring, spread, modules, iterators/generators, symbols, Map/Set, promises/async, optional chaining, BigInt and more.',
    topics: ['ES2015', 'template literals', 'tagged templates', 'for...of', 'for...in', 'iterators', 'generators', 'Symbol', 'Symbol.iterator', 'numeric separators', 'BigInt', 'Object.entries', 'Object.fromEntries', 'optional catch binding', 'ES modules', 'ECMAScript versions'],
    sections: [
      section('introduction', undefined,
        text('"ES6" (officially **ES2015**) was the biggest update in JavaScript history, and new editions arrive every year. This lesson collects the features not covered elsewhere and gives you a map of which version added what — useful when reading older code or checking Node support.'),
      ),
      section('definition', 'What came when',
        table('Notable features by edition', ['Edition', 'Features (Node support)'], [
          ['ES2015 (ES6)', '`let`/`const`, arrows, classes, template literals, destructuring, default/rest/spread, modules, Promise, Map/Set/WeakMap, Symbol, iterators, generators, `for...of`'],
          ['ES2016–2017', '`Array.prototype.includes`, `**`, `async`/`await`, `Object.entries`/`values`, `padStart`'],
          ['ES2018–2019', 'Object rest/spread, `Promise.prototype.finally`, async iteration (`for await`), `flat`/`flatMap`, `Object.fromEntries`, optional catch binding'],
          ['ES2020', 'Optional chaining `?.`, nullish `??`, BigInt, `Promise.allSettled`, `globalThis`, dynamic `import()`'],
          ['ES2021', '`replaceAll`, logical assignment `??=`, numeric separators `1_000`, `Promise.any`'],
          ['ES2022', 'Class fields, `#private`, static blocks, top-level `await` (modules), `.at()`, `Object.hasOwn`, `error.cause`'],
          ['ES2023', '`findLast`, `toSorted`/`toReversed`/`toSpliced`/`with` (Node 20)'],
          ['ES2024+', '`Object.groupBy`, `Promise.withResolvers` (Node 21/22), Set methods like `union` (Node 22)'],
        ]),
      ),
      section('why', 'Why it matters for Node developers',
        bullets(
          'Node versions map to V8 versions, which decide which features you can use without a transpiler.',
          'Knowing the old way (callbacks, `var`, IIFEs, `arguments`) helps when maintaining legacy code.',
          'ES modules (`import`/`export`) are now first-class in Node — covered in depth in Module 3.',
        ),
      ),
      section('internals', 'Iterators, generators and symbols under the hood',
        bullets(
          'An **iterable** is any object with a `[Symbol.iterator]()` method that returns an **iterator**: an object with `next()` returning `{ value, done }`.',
          '`for...of`, spread, array destructuring, `Array.from`, `new Map(iterable)` and `Promise.all` all consume this protocol.',
          'A **generator** function (`function*`) returns an iterator. Each `yield` **suspends** the function, saving its execution context; `next()` resumes it. This suspension mechanism is what async functions are built on.',
          'A **Symbol** is a unique, non-string property key. Well-known symbols (`Symbol.iterator`, `Symbol.toPrimitive`, `Symbol.asyncIterator`) let objects plug into language features.',
          'Tagged templates call your function with the static string parts (frozen array, with `.raw`) and the interpolated values separately — the basis of safe SQL builders and `String.raw`.',
        ),
      ),
      section('example', 'Template literals and tagged templates',
        code({
          title: 'Interpolation, multi-line strings and a tag function',
          code: dedent(`
            const user = 'ana';
            const count = 3;
            console.log(\`\${user} has \${count * 2} points\`);
            console.log(\`line1
            line2\`);
            function sql(strings, ...values) {
              const text = strings.reduce((acc, part, i) => acc + '$' + i + part);
              return { text, values };
            }
            const q = sql\`SELECT * FROM users WHERE id = \${42} AND role = \${'admin'}\`;
            console.log(q.text);
            console.log(q.values);
          `),
          expectedOutput: "ana has 6 points\nline1\nline2\nSELECT * FROM users WHERE id = $1 AND role = $2\n[ 42, 'admin' ]",
          explanation: [
            '`${expr}` evaluates any expression and converts it to a string.',
            'Template literals can span lines (the newline is part of the string).',
            'A tag function receives `["SELECT … id = ", " AND role = ", ""]` and `[42, "admin"]` separately.',
            'Here it builds a parameterised query (`$1`, `$2`) so values are never concatenated into SQL — exactly what libraries like `postgres` and `slonik` do.',
          ],
          runnable: true,
        }),
      ),
      section('example', 'Iteration',
        code({
          title: 'for...in vs for...of',
          code: dedent(`
            const arr = ['a', 'b'];
            arr.extra = 'x';
            for (const i in arr) {
              console.log('in:', i);
            }
            for (const v of arr) {
              console.log('of:', v);
            }
          `),
          expectedOutput: 'in: 0\nin: 1\nin: extra\nof: a\nof: b',
          explanation: [
            '`for...in` iterates **enumerable property keys** (as strings), including non-index and inherited ones.',
            '`for...of` iterates **values** from the iterator — for arrays, just the elements.',
            'Use `for...of` for arrays, Maps, Sets and strings; `Object.entries` + `for...of` for objects.',
          ],
          runnable: true,
        }),
        code({
          title: 'Generators and custom iterables',
          code: dedent(`
            function* idGenerator(prefix) {
              let id = 1;
              while (true) {
                yield prefix + '-' + id++;
              }
            }
            const ids = idGenerator('order');
            console.log(ids.next().value, ids.next().value);

            const range = {
              from: 1,
              to: 3,
              *[Symbol.iterator]() {
                for (let i = this.from; i <= this.to; i++) yield i;
              },
            };
            console.log([...range]);
            const it = [10, 20][Symbol.iterator]();
            console.log(it.next(), it.next(), it.next());
          `),
          expectedOutput: 'order-1 order-2\n[ 1, 2, 3 ]\n{ value: 10, done: false } { value: 20, done: false } { value: undefined, done: true }',
          explanation: [
            'The infinite `while (true)` is fine: the generator pauses at each `yield` until `next()` is called (lazy evaluation).',
            'Defining `[Symbol.iterator]` as a generator makes any object work with spread and `for...of`.',
            'Calling `next()` manually shows the raw iterator protocol.',
          ],
          runnable: true,
        }),
      ),
      section('example', 'Symbols',
        code({
          title: 'Unique keys that stay out of the way',
          code: dedent(`
            const ID = Symbol('id');
            const user = { name: 'ana', [ID]: 123 };
            console.log(user[ID], Object.keys(user), JSON.stringify(user));
            console.log(Symbol('id') === Symbol('id'), Symbol.for('app') === Symbol.for('app'));
            console.log(user);
          `),
          expectedOutput: "123 [ 'name' ] {\"name\":\"ana\"}\nfalse true\n{ name: 'ana', [Symbol(id)]: 123 }",
          explanation: [
            'Symbol keys are skipped by `Object.keys`, `for...in` and `JSON.stringify` — handy for metadata that must not leak into API responses.',
            'Every `Symbol()` is unique; `Symbol.for(key)` returns a shared, registered symbol.',
            'Node uses symbols internally, e.g. `util.inspect.custom` to customise how objects print.',
          ],
          runnable: true,
        }),
      ),
      section('example', 'Smaller modern conveniences',
        code({
          title: 'Grab bag of ES2017–ES2023 features',
          code: dedent(`
            const budget = 1_000_000;
            console.log(budget);
            console.log(2n ** 64n);
            console.log(Number.MAX_SAFE_INTEGER + 2);
            console.log('a-b-c'.replaceAll('-', '/'));
            console.log('7'.padStart(3, '0'));
            console.log([1, 2, 3, 4].findLast((n) => n % 2 === 1));
            const prices = { apple: 1, pear: 2 };
            console.log(Object.fromEntries(Object.entries(prices).map(([k, v]) => [k, v * 10])));
            try {
              JSON.parse('{');
            } catch {
              console.log('optional catch binding');
            }
          `),
          expectedOutput: "1000000\n18446744073709551616n\n9007199254740992\na/b/c\n007\n3\n{ apple: 10, pear: 20 }\noptional catch binding",
          explanation: [
            'Numeric separators are just for readability.',
            'BigInt handles arbitrarily large integers; plain numbers lose precision past 2^53 − 1 (the `+ 2` result is wrong by 1).',
            '`Object.entries` → transform → `Object.fromEntries` is the idiom for mapping over an object.',
            '`catch { }` without a parameter when you do not need the error.',
          ],
          runnable: true,
        }),
      ),
      section('real-world', 'Modules in Node.js (preview)',
        code({
          title: 'ES module syntax',
          code: dedent(`
            // math.mjs  (or .js with "type": "module" in package.json)
            export const add = (a, b) => a + b;
            export default function multiply(a, b) { return a * b; }

            // app.mjs
            import multiply, { add } from './math.mjs';
            import { readFile } from 'node:fs/promises';

            const config = JSON.parse(await readFile('./config.json', 'utf8')); // top-level await
            console.log(add(2, 3), multiply(2, 3));
          `),
          expectedOutput: '5 6',
          explanation: [
            'ES modules are static, strict by default, and support top-level `await`.',
            'Node still supports CommonJS (`require`) — the differences are covered in Module 3.',
          ],
          versionNote: 'Top-level await in ES modules: Node 14.8+.',
        }),
      ),
      section('mistakes', 'Common mistakes',
        bullets(
          'Using `for...in` over arrays (string keys, extra properties, inherited keys).',
          'Mixing BigInt and Number in arithmetic: `1n + 1` throws a TypeError.',
          'Building SQL with plain template literals: `` `... WHERE id = ${id}` `` is an injection risk — use parameters or a tagged template that does.',
          'Assuming a feature exists in your Node version — check node.green or the Node changelog.',
        ),
      ),
      section('interview', 'Interview tips',
        interviewTip('If asked "what changed in ES6", group the answer: syntax (let/const, arrows, classes, destructuring, spread, templates), data structures (Map/Set/Symbol), async (Promise), modules, and iteration (iterators/generators).'),
        tip('Generators are rare in app code but explaining "suspendable function" makes async/await internals easy to justify in an interview.'),
      ),
      section('practice', 'Practice',
        text('Write a generator `paginate(items, pageSize)` that yields pages (arrays) of the input, and use it with `for...of` to print each page. Then write a tag `currency` that formats interpolated numbers with two decimals.'),
      ),
      section('summary', 'Summary',
        bullets(
          'ES2015 introduced most modern syntax; yearly editions keep adding features.',
          'Template literals interpolate; tagged templates process parts and values separately.',
          '`for...of` iterates values via the iterator protocol; `for...in` iterates keys.',
          'Generators pause at `yield` — the foundation of async functions.',
          'Symbols create unique, hidden-from-JSON property keys.',
        ),
      ),
    ],
    revisionNotes: [
      'ES2015 = ES6: let/const, arrows, classes, modules, Promise, Map/Set, Symbol, generators.',
      'Iterable: has [Symbol.iterator]() returning { next() → { value, done } }.',
      'for...in → keys (incl. inherited enumerable); for...of → values.',
      'Tagged template: tag(strings, ...values).',
      'Symbol keys are skipped by Object.keys and JSON.stringify.',
      '1n + 1 → TypeError (no mixing BigInt and Number).',
    ],
    quiz: [
      {
        kind: 'predict-output', difficulty: 'beginner',
        prompt: 'What does this print?',
        code: "const list = ['x', 'y'];\nfor (const item in list) console.log(item);",
        options: ['x y', '0 1', "'0' '1'", 'undefined undefined'],
        answer: 1,
        explanation: '`for...in` yields keys (as strings "0" and "1", printed without quotes). `for...of` would yield `x` and `y`.',
      },
      {
        kind: 'predict-output', difficulty: 'intermediate',
        prompt: 'What does this print?',
        code: dedent(`
          function* gen() {
            const x = yield 1;
            yield x * 2;
          }
          const g = gen();
          console.log(g.next().value, g.next(5).value, g.next().done);
        `),
        options: ['1 2 true', '1 10 true', '1 NaN false', '1 10 false'],
        answer: 1,
        explanation: 'The first `next()` runs to `yield 1`. `next(5)` resumes with `x = 5` and yields 10. The third `next()` finishes the function → `done: true`.',
      },
      {
        kind: 'mcq', difficulty: 'intermediate',
        prompt: 'What does a tag function receive for tag`a${1}b${2}c`?',
        options: [
          "('a1b2c')",
          "(['a', 'b', 'c'], 1, 2)",
          "([1, 2], 'a', 'b', 'c')",
          "(['a', 'b', 'c'], [1, 2])",
        ],
        answer: 1,
        explanation: 'The first argument is the array of static string parts; each interpolated value is passed as a separate argument (collect them with `...values`).',
      },
    ],
    interview: [
      {
        category: 'javascript', kind: 'concept', difficulty: 'beginner', topic: 'ES6+',
        question: 'What is the difference between for...in and for...of?',
        shortAnswer: '`for...in` loops over the enumerable property keys of an object (including inherited ones) as strings; `for...of` loops over the values produced by an iterable such as an array, string, Map or Set.',
        detailedAnswer: [
          '`for...in` on an array gives "0", "1"… plus any extra enumerable properties.',
          '`for...of` uses `[Symbol.iterator]`; plain objects are not iterable, so it throws on them.',
          'For objects use `for (const [k, v] of Object.entries(obj))`.',
          '`for...of` works with `await` inside async functions; `for await...of` consumes async iterables (e.g. streams).',
        ],
        followUp: 'How do you make a custom object iterable?',
      },
      {
        category: 'javascript', kind: 'concept', difficulty: 'beginner', topic: 'ES6+',
        question: 'What are template literals and tagged templates used for?',
        shortAnswer: 'Template literals are backtick strings supporting `${}` interpolation and multiple lines; tagged templates pass the string parts and values to a function, which can escape, format or parameterise them.',
        detailedAnswer: [
          'Interpolation converts expressions to strings (ToString).',
          'Tagged: `tag(strings, ...values)` where `strings.raw` holds unprocessed text.',
          'Uses: SQL builders that produce parameterised queries, `String.raw`, i18n, CSS-in-JS, GraphQL `gql`.',
          'Plain interpolation into SQL or HTML is unsafe — tags can make it safe.',
        ],
        followUp: 'How would a sql tag prevent SQL injection?',
      },
      {
        category: 'javascript', kind: 'concept', difficulty: 'intermediate', topic: 'ES6+',
        question: 'What are Symbols and what are they used for?',
        shortAnswer: 'Symbols are unique primitive values usable as property keys; they avoid name collisions, are hidden from Object.keys/JSON, and well-known symbols let objects customise language behaviour.',
        detailedAnswer: [
          '`Symbol("desc") !== Symbol("desc")`; `Symbol.for(key)` uses a global registry.',
          'Symbol-keyed properties are skipped by `for...in`, `Object.keys`, `JSON.stringify` (but visible via `Object.getOwnPropertySymbols`).',
          'Well-known symbols: `Symbol.iterator`, `Symbol.asyncIterator`, `Symbol.toPrimitive`, `Symbol.hasInstance`.',
          'Node uses symbols like `util.inspect.custom` and many internal keys.',
          'They are not truly private — reflection can find them; use `#fields` for privacy.',
        ],
        followUp: 'How is a Symbol property different from a #private field?',
      },
      {
        category: 'javascript', kind: 'concept', difficulty: 'intermediate', topic: 'ES6+',
        question: 'What are iterators and generators, and how do they relate?',
        shortAnswer: 'An iterator is an object with a next() method returning { value, done }; a generator function (function*) is a convenient way to create one — it pauses at each yield and resumes on next().',
        detailedAnswer: [
          'The iterable protocol (`[Symbol.iterator]`) powers `for...of`, spread and destructuring.',
          'Generators keep their execution context alive between `yield`s — lazy, potentially infinite sequences.',
          '`next(value)` sends a value back into the generator as the result of `yield`.',
          'Async generators (`async function*`) + `for await...of` are used for paginated APIs and Node streams.',
          'Async/await is conceptually a generator that yields promises and is resumed by the promise resolution.',
        ],
        followUp: 'How would you write a lazy paginator over a REST API with an async generator?',
      },
    ],
  },
};

export default content;
