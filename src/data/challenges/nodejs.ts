import type { CodingChallenge } from '../../types';
import { js, md, t } from './helpers';

/** Asynchronous Node.js patterns: promises, concurrency, events. */
export const nodejsChallenges: CodingChallenge[] = [
  {
    id: 'ch-023',
    title: 'Promise-based sleep',
    difficulty: 'beginner',
    topic: 'Promises and timers',
    category: 'nodejs',
    prompt: md(
      'Write `sleep(ms, value)` that returns a promise which resolves with `value` after `ms` milliseconds.',
      '',
      "- `await sleep(100)` pauses an async function for ~100 ms.",
      "- `await sleep(10, 'done')` → `'done'`",
      '',
      '(Node 16+ ships this as `setTimeout` from `node:timers/promises` — here you build it yourself.)',
    ),
    starterCode: js`
      function sleep(ms, value) {
        // TODO: wrap setTimeout in a Promise
      }
    `,
    solution: js`
      function sleep(ms, value) {
        return new Promise((resolve) => setTimeout(() => resolve(value), ms));
      }
    `,
    tests: [
      t('(async () => { const start = Date.now(); await sleep(30); return Date.now() - start >= 25; })()', true),
      t("sleep(10, 'done')", 'done'),
      t("(async () => { const log = []; sleep(20).then(() => log.push('slow')); sleep(5).then(() => log.push('fast')); await sleep(40); return log; })()", ['fast', 'slow']),
      t('sleep(0) instanceof Promise', true),
    ],
    hints: ['`new Promise(resolve => ...)` and call `resolve` from inside `setTimeout`.'],
    explanation: md(
      'Wrap the callback API in a promise: `setTimeout` calls `resolve(value)` when the timer fires. This "promisify a timer" pattern is the building block for retries, back-off and timeouts in later challenges.',
      '',
      'A sleeping `await` does **not** block the event loop — other callbacks keep running in the meantime.',
      '',
      'Complexity: O(1).',
    ),
    relatedLessonIds: ['m05-settimeout', 'm05-promises'],
  },
  {
    id: 'ch-024',
    title: 'Implement Promise.all',
    difficulty: 'intermediate',
    topic: 'Promises',
    category: 'nodejs',
    prompt: md(
      'Write `promiseAll(iterable)` that behaves like `Promise.all` — **without calling `Promise.all`**.',
      '',
      '- Resolves with an array of results **in input order** (not completion order).',
      '- Non-promise values are treated as already resolved.',
      '- Rejects as soon as any input rejects, with that reason.',
      '- An empty input resolves to `[]`. Accept any iterable (arrays, Sets…).',
    ),
    starterCode: js`
      function promiseAll(iterable) {
        // TODO
      }
    `,
    solution: js`
      function promiseAll(iterable) {
        return new Promise((resolve, reject) => {
          const items = Array.from(iterable);
          const results = new Array(items.length);
          let remaining = items.length;
          if (remaining === 0) {
            resolve(results);
            return;
          }
          items.forEach((item, i) => {
            Promise.resolve(item).then((value) => {
              results[i] = value;
              remaining -= 1;
              if (remaining === 0) resolve(results);
            }, reject);
          });
        });
      }
    `,
    tests: [
      t('promiseAll([1, Promise.resolve(2), new Promise((r) => setTimeout(() => r(3), 10))])', [1, 2, 3]),
      t("promiseAll([new Promise((r) => setTimeout(() => r('a'), 30)), new Promise((r) => setTimeout(() => r('b'), 5))])", ['a', 'b']),
      t('promiseAll([])', []),
      t("promiseAll([Promise.resolve(1), Promise.reject(new Error('boom')), new Promise(() => {})]).catch((e) => 'rejected: ' + e.message)", 'rejected: boom'),
      t('promiseAll(new Set([1, 2]))', [1, 2]),
      t("(async () => { const orig = Promise.all; Promise.all = () => { throw new Error('do not use Promise.all'); }; try { return await promiseAll([1, Promise.resolve(2)]); } finally { Promise.all = orig; } })()", [1, 2]),
    ],
    hints: [
      'Store each result at its index `i`, not with `push`.',
      'Count remaining promises instead of checking `results.length` (a sparse array has the full length already).',
      '`Promise.resolve(item)` normalises plain values and thenables.',
    ],
    explanation: md(
      'Create the outer promise, then subscribe to every input via `Promise.resolve(item).then(...)`. Each fulfilment writes into `results[i]` and decrements a counter; the last one resolves the outer promise. Passing `reject` as the error handler makes the first rejection win (later settlements are ignored because a promise settles only once).',
      '',
      'Edge cases interviewers check: empty input (must resolve, not hang), order preservation and non-promise values.',
      '',
      'Complexity: O(n) work; total time equals the slowest input.',
    ),
    relatedLessonIds: ['m05-promise-all', 'm05-promises'],
  },
  {
    id: 'ch-025',
    title: 'Implement Promise.allSettled',
    difficulty: 'intermediate',
    topic: 'Promises',
    category: 'nodejs',
    prompt: md(
      'Write `promiseAllSettled(iterable)` that behaves like `Promise.allSettled` without calling it.',
      '',
      '- Never rejects. Resolves once **every** input has settled.',
      "- Each result is `{ status: 'fulfilled', value }` or `{ status: 'rejected', reason }`, in input order.",
      '',
      'Use case: firing notifications to several services where one failure must not hide the others.',
    ),
    starterCode: js`
      function promiseAllSettled(iterable) {
        // TODO
      }
    `,
    solution: js`
      function promiseAllSettled(iterable) {
        const wrap = (item) =>
          Promise.resolve(item).then(
            (value) => ({ status: 'fulfilled', value }),
            (reason) => ({ status: 'rejected', reason }),
          );
        return new Promise((resolve) => {
          const items = Array.from(iterable);
          const results = new Array(items.length);
          let remaining = items.length;
          if (remaining === 0) {
            resolve(results);
            return;
          }
          items.forEach((item, i) => {
            wrap(item).then((outcome) => {
              results[i] = outcome;
              remaining -= 1;
              if (remaining === 0) resolve(results);
            });
          });
        });
      }
    `,
    tests: [
      t("promiseAllSettled([Promise.resolve(1), Promise.reject(new Error('x')), 3]).then((r) => r.map((s) => (s.status === 'fulfilled' ? s.value : s.reason.message)))", [1, 'x', 3]),
      t("promiseAllSettled([Promise.reject('no'), 'ok'])", [{ status: 'rejected', reason: 'no' }, { status: 'fulfilled', value: 'ok' }]),
      t('promiseAllSettled([])', []),
      t('(async () => { const start = Date.now(); await promiseAllSettled([new Promise((r) => setTimeout(r, 30)), Promise.reject(1)]); return Date.now() - start >= 25; })()', true),
      t("(async () => { const orig = Promise.allSettled; Promise.allSettled = () => { throw new Error('nope'); }; try { const r = await promiseAllSettled([Promise.reject(2)]); return r[0].status; } finally { Promise.allSettled = orig; } })()", 'rejected'),
    ],
    hints: ['Turn every input into a promise that always fulfils with a status object.', 'Then it is the same counting logic as `Promise.all`.'],
    explanation: md(
      'Map each input to a promise that **always fulfils** — `.then(onFulfilled, onRejected)` converts both outcomes to status objects. After that, the collector is the same index-plus-counter logic as `Promise.all`, and since nothing rejects, the outer promise only resolves.',
      '',
      'Complexity: O(n); total time equals the slowest input.',
    ),
    relatedLessonIds: ['m05-promise-allsettled'],
  },
  {
    id: 'ch-026',
    title: 'Implement Promise.race',
    difficulty: 'intermediate',
    topic: 'Promises',
    category: 'nodejs',
    prompt: md(
      'Write `promiseRace(iterable)` that settles the same way as the **first** input to settle — fulfil or reject.',
      '',
      '- Non-promise values settle "immediately" (on the next microtask).',
      '- An empty iterable returns a promise that stays pending forever (same as the built-in).',
      '- Do not call `Promise.race`.',
    ),
    starterCode: js`
      function promiseRace(iterable) {
        // TODO
      }
    `,
    solution: js`
      function promiseRace(iterable) {
        return new Promise((resolve, reject) => {
          for (const item of iterable) {
            Promise.resolve(item).then(resolve, reject);
          }
        });
      }
    `,
    tests: [
      t("promiseRace([new Promise((r) => setTimeout(() => r('slow'), 30)), new Promise((r) => setTimeout(() => r('fast'), 5))])", 'fast'),
      t("promiseRace([new Promise((r) => setTimeout(() => r('slow'), 30)), new Promise((_, rej) => setTimeout(() => rej(new Error('fail')), 5))]).catch((e) => e.message)", 'fail'),
      t('promiseRace([new Promise(() => {}), 42])', 42),
      t("(async () => { const settled = promiseRace([]).then(() => 'settled'); const timer = new Promise((r) => setTimeout(() => r('pending'), 20)); const orig = Promise.race; const winner = await orig.call(Promise, [settled, timer]); return winner; })()", 'pending'),
      t("(async () => { const orig = Promise.race; Promise.race = () => { throw new Error('nope'); }; try { return await promiseRace([Promise.resolve('x')]); } finally { Promise.race = orig; } })()", 'x'),
    ],
    hints: ['Subscribe every input to the same `resolve` and `reject`.', 'A promise can only settle once — later calls are no-ops.'],
    explanation: md(
      'Because a promise ignores every settle call after the first, wiring all inputs to the outer `resolve`/`reject` is enough: whoever settles first wins.',
      '',
      'The classic application is a timeout: `race([work, rejectAfter(ms)])`. Note that the losing promises keep running — `race` does not cancel them, so real code should also clear timers or abort the work (`AbortController`).',
      '',
      'Complexity: O(n) subscriptions.',
    ),
    relatedLessonIds: ['m05-promise-race'],
  },
  {
    id: 'ch-027',
    title: 'Implement Promise.any',
    difficulty: 'intermediate',
    topic: 'Promises',
    category: 'nodejs',
    prompt: md(
      'Write `promiseAny(iterable)` like `Promise.any` (without calling it).',
      '',
      '- Resolves with the **first fulfilled** value; rejections are ignored while others are pending.',
      "- If **all** inputs reject (or the input is empty), reject with `new AggregateError(errors, 'All promises were rejected')` where `errors` is in **input order**.",
      '',
      'Use case: query several replicas / mirrors and take the first successful answer.',
    ),
    starterCode: js`
      function promiseAny(iterable) {
        // TODO
      }
    `,
    solution: js`
      function promiseAny(iterable) {
        return new Promise((resolve, reject) => {
          const items = Array.from(iterable);
          const errors = new Array(items.length);
          let remaining = items.length;
          if (remaining === 0) {
            reject(new AggregateError([], 'All promises were rejected'));
            return;
          }
          items.forEach((item, i) => {
            Promise.resolve(item).then(resolve, (err) => {
              errors[i] = err;
              remaining -= 1;
              if (remaining === 0) reject(new AggregateError(errors, 'All promises were rejected'));
            });
          });
        });
      }
    `,
    tests: [
      t("promiseAny([Promise.reject(1), new Promise((r) => setTimeout(() => r('b'), 10)), new Promise((r) => setTimeout(() => r('c'), 20))])", 'b'),
      t("promiseAny([Promise.reject(new Error('a')), Promise.reject(new Error('b'))]).catch((e) => [e instanceof AggregateError, e.message, e.errors.map((x) => x.message)])", [true, 'All promises were rejected', ['a', 'b']]),
      t("promiseAny([new Promise((_, rej) => setTimeout(() => rej('first'), 20)), new Promise((_, rej) => setTimeout(() => rej('second'), 5))]).catch((e) => e.errors)", ['first', 'second']),
      t('promiseAny([]).catch((e) => e instanceof AggregateError)', true),
      t("promiseAny([Promise.reject('x'), 'plain'])", 'plain'),
    ],
    hints: ['It is the mirror image of `Promise.all`: count rejections instead of fulfilments.', 'Store each error at its index.'],
    explanation: md(
      'Wire every input\'s fulfilment straight to `resolve` (first one wins). Rejections are stored at their index and counted; only when the last one rejects do we reject with an `AggregateError` listing all reasons in input order.',
      '',
      '`any` vs `race`: `race` settles with the first *settled* input (could be a rejection); `any` waits for the first *success*.',
      '',
      'Complexity: O(n).',
    ),
    relatedLessonIds: ['m05-promise-any', 'm05-promise-race'],
  },
  {
    id: 'ch-028',
    title: 'promisify a callback API',
    difficulty: 'intermediate',
    topic: 'Callbacks to promises',
    category: 'nodejs',
    prompt: md(
      'Write `promisify(fn)` — like `util.promisify` — for functions that take an **error-first callback** as their last argument: `fn(...args, (err, result) => {})`.',
      '',
      '- The returned function returns a promise: rejects with `err` if truthy, otherwise resolves with `result`.',
      '- Preserve `this` (so promisified methods still work).',
      '- If `fn` throws synchronously, the promise rejects.',
    ),
    starterCode: js`
      function promisify(fn) {
        // TODO: return (...args) => Promise
      }
    `,
    solution: js`
      function promisify(fn) {
        return function (...args) {
          return new Promise((resolve, reject) => {
            fn.call(this, ...args, (err, result) => {
              if (err) reject(err);
              else resolve(result);
            });
          });
        };
      }
    `,
    tests: [
      t('(() => { const add = (a, b, cb) => setTimeout(() => cb(null, a + b), 5); return promisify(add)(2, 3); })()', 5),
      t("(() => { const fail = (cb) => cb(new Error('nope')); return promisify(fail)().catch((e) => e.message); })()", 'nope'),
      t('(() => { const obj = { base: 10, get(x, cb) { cb(null, this.base + x); } }; obj.getAsync = promisify(obj.get); return obj.getAsync(5); })()', 15),
      t("promisify(() => { throw new Error('sync'); })().catch((e) => 'caught ' + e.message)", 'caught sync'),
      t('promisify((cb) => { cb(null, 1); cb(null, 2); })()', 1),
    ],
    hints: [
      'Append your own callback to the argument list.',
      'A throw inside the `new Promise` executor automatically becomes a rejection.',
    ],
    explanation: md(
      'Return a regular function (to keep `this`) that creates a promise and calls `fn` with the original arguments plus a callback that maps `(err, result)` onto `reject`/`resolve`. Throwing inside the executor rejects the promise, so synchronous errors are covered for free. Calling the callback twice is harmless because promises settle once.',
      '',
      'Node\'s real `util.promisify` also honours a `util.promisify.custom` symbol for APIs with non-standard callbacks (e.g. `setTimeout`, `dns.lookup` with multiple results).',
      '',
      'Complexity: O(1) overhead per call.',
    ),
    relatedLessonIds: ['m05-callbacks', 'm03-util-module'],
  },
  {
    id: 'ch-029',
    title: 'Timeout wrapper',
    difficulty: 'intermediate',
    topic: 'Promises and timers',
    category: 'nodejs',
    prompt: md(
      "Write `withTimeout(promise, ms, message = 'Timed out')`.",
      '',
      '- If `promise` settles within `ms`, settle the same way (value or original error).',
      "- Otherwise reject with an `Error(message)` whose `code` is `'ETIMEDOUT'`.",
      '- **Clear the timer** once the promise settles, so a fast success does not leave a pending timer keeping the process alive.',
    ),
    starterCode: js`
      function withTimeout(promise, ms, message = 'Timed out') {
        // TODO
      }
    `,
    solution: js`
      function withTimeout(promise, ms, message = 'Timed out') {
        let timer;
        const timeout = new Promise((_, reject) => {
          timer = setTimeout(() => {
            const err = new Error(message);
            err.code = 'ETIMEDOUT';
            reject(err);
          }, ms);
        });
        return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
      }
    `,
    tests: [
      t("withTimeout(new Promise((r) => setTimeout(() => r('ok'), 5)), 50)", 'ok'),
      t("withTimeout(new Promise((r) => setTimeout(() => r('late'), 50)), 10).catch((e) => [e.message, e.code])", ['Timed out', 'ETIMEDOUT']),
      t("withTimeout(new Promise(() => {}), 5, 'DB query timed out').catch((e) => e.message)", 'DB query timed out'),
      t("withTimeout(Promise.reject(new Error('db down')), 50).catch((e) => e.message)", 'db down'),
      t('(async () => { const orig = globalThis.clearTimeout; let cleared = 0; globalThis.clearTimeout = (id) => { cleared++; return orig(id); }; try { await withTimeout(Promise.resolve(1), 1000); } finally { globalThis.clearTimeout = orig; } return cleared > 0; })()', true),
    ],
    hints: ['Race the input against a promise that rejects after `ms`.', '`.finally()` runs on both outcomes — a good place for `clearTimeout`.'],
    explanation: md(
      'Build a "timeout promise" that rejects after `ms`, race it against the work, and clear the timer in `finally`. Without the `clearTimeout`, every fast call would leave a live timer behind — in Node that keeps the event loop alive and holds closures in memory.',
      '',
      'Remember that timing out does not stop the underlying work. For `fetch` and many Node APIs, pass `AbortSignal.timeout(ms)` so the operation is actually cancelled.',
      '',
      'Complexity: O(1).',
    ),
    relatedLessonIds: ['m05-promise-race', 'm05-error-handling-in-asynchronous-code'],
  },
  {
    id: 'ch-030',
    title: 'Sequential async map',
    difficulty: 'intermediate',
    topic: 'Async iteration',
    category: 'nodejs',
    prompt: md(
      'Write `mapSeries(items, fn)` that calls `fn(item, index)` for each item **one at a time** (the next call starts only after the previous promise resolves) and resolves with the results in order.',
      '',
      '- `fn` may return a value or a promise.',
      '- If any call rejects, stop immediately and reject with that error (later items are not processed).',
      '',
      'Use case: running DB migrations or paginated API calls that must not overlap.',
    ),
    starterCode: js`
      async function mapSeries(items, fn) {
        // TODO: one at a time
      }
    `,
    solution: js`
      async function mapSeries(items, fn) {
        const results = [];
        for (let i = 0; i < items.length; i++) {
          results.push(await fn(items[i], i));
        }
        return results;
      }
    `,
    tests: [
      t("(async () => { let active = 0; let max = 0; const r = await mapSeries([30, 10, 20], async (ms, i) => { active++; max = Math.max(max, active); await new Promise((res) => setTimeout(res, ms)); active--; return i + ':' + ms; }); return [r, max]; })()", [['0:30', '1:10', '2:20'], 1]),
      t('mapSeries([], async (x) => x)', []),
      t("(async () => { const seen = []; try { await mapSeries([1, 2, 3], async (x) => { seen.push(x); if (x === 2) throw new Error('bad ' + x); return x; }); return 'resolved'; } catch (e) { return [e.message, seen]; } })()", ['bad 2', [1, 2]]),
      t('mapSeries([1, 2], (x) => x * 2)', [2, 4]),
    ],
    hints: ['A plain `for` loop with `await` inside is sequential.', '`items.map(async ...)` would start everything at once — that is the bug to avoid.'],
    explanation: md(
      '`await` inside a `for` loop suspends the loop until each promise settles, so calls never overlap and a rejection propagates out of the loop, skipping the rest.',
      '',
      'Common mistake: `forEach(async ...)` — `forEach` ignores returned promises, so all calls run concurrently and errors become unhandled rejections.',
      '',
      'Complexity: O(n) calls; total time is the sum of all durations.',
    ),
    relatedLessonIds: ['m05-async-await', 'm01-async-await'],
  },
  {
    id: 'ch-031',
    title: 'Build an EventEmitter',
    difficulty: 'intermediate',
    topic: 'Events',
    category: 'nodejs',
    prompt: md(
      'Implement a minimal `EventEmitter` class:',
      '',
      '- `on(event, listener)` and `once(event, listener)` — both return `this` for chaining.',
      '- `off(event, listener)` — removes a listener (also works for one registered with `once`).',
      '- `emit(event, ...args)` — calls listeners **synchronously in registration order**; returns `true` if there were listeners, else `false`.',
      '- `listenerCount(event)`.',
      "- Like Node: emitting `'error'` with no listener **throws** the error argument.",
      '- Removing a listener while an emit is running must not skip the next listener.',
    ),
    starterCode: js`
      class EventEmitter {
        on(event, listener) {
          // TODO
        }
        once(event, listener) {
          // TODO
        }
        off(event, listener) {
          // TODO
        }
        emit(event, ...args) {
          // TODO
        }
        listenerCount(event) {
          // TODO
        }
      }
    `,
    solution: js`
      class EventEmitter {
        constructor() {
          this.events = new Map();
        }

        on(event, listener) {
          if (!this.events.has(event)) this.events.set(event, []);
          this.events.get(event).push(listener);
          return this;
        }

        once(event, listener) {
          const wrapper = (...args) => {
            this.off(event, wrapper);
            listener.apply(this, args);
          };
          wrapper.listener = listener;
          return this.on(event, wrapper);
        }

        off(event, listener) {
          const list = this.events.get(event);
          if (!list) return this;
          const i = list.findIndex((l) => l === listener || l.listener === listener);
          if (i !== -1) list.splice(i, 1);
          if (list.length === 0) this.events.delete(event);
          return this;
        }

        emit(event, ...args) {
          const list = this.events.get(event);
          if (!list || list.length === 0) {
            if (event === 'error') throw args[0] instanceof Error ? args[0] : new Error('Unhandled error event');
            return false;
          }
          for (const listener of [...list]) listener.apply(this, args);
          return true;
        }

        listenerCount(event) {
          const list = this.events.get(event);
          return list ? list.length : 0;
        }
      }
    `,
    tests: [
      t("(() => { const e = new EventEmitter(); const log = []; e.on('x', (a, b) => log.push(a + b)); e.on('x', () => log.push('second')); const r = e.emit('x', 1, 2); return [r, log]; })()", [true, [3, 'second']]),
      t("new EventEmitter().emit('nothing')", false),
      t("(() => { const e = new EventEmitter(); let n = 0; e.once('t', () => n++); e.emit('t'); e.emit('t'); return [n, e.listenerCount('t')]; })()", [1, 0]),
      t("(() => { const e = new EventEmitter(); let n = 0; const fn = () => n++; e.on('t', fn); e.off('t', fn); e.once('u', fn); e.off('u', fn); e.emit('t'); e.emit('u'); return [n, e.listenerCount('t'), e.listenerCount('u')]; })()", [0, 0, 0]),
      t("(() => { const e = new EventEmitter(); const f = () => {}; return e.on('a', f).once('b', f) === e; })()", true),
      t("(() => { const e = new EventEmitter(); const log = []; const a = () => { log.push('a'); e.off('x', a); }; e.on('x', a); e.on('x', () => log.push('b')); e.emit('x'); e.emit('x'); return log; })()", ['a', 'b', 'b']),
      t("(() => { const e = new EventEmitter(); try { e.emit('error', new Error('bad')); return 'no throw'; } catch (err) { return err.message; } })()", 'bad'),
    ],
    hints: [
      'Store listeners in a `Map<event, Function[]>`.',
      'For `once`, register a wrapper that removes itself, and remember the original on `wrapper.listener` so `off(original)` finds it.',
      'Iterate over a **copy** of the listener array during `emit`.',
    ],
    explanation: md(
      'A `Map` from event name to an array of listeners. `once` wraps the listener in a self-removing function and tags it with the original so `off` can match either. `emit` loops over a snapshot (`[...list]`) — mutating the live array while iterating would skip elements when a listener removes itself.',
      '',
      'Node specifics worth mentioning: listeners run synchronously, the special `error` event throws if unhandled (crashing the process), and the `maxListeners` warning (default 10) flags likely leaks.',
      '',
      'Complexity: `on` O(1), `off` O(k), `emit` O(k) for k listeners.',
    ),
    relatedLessonIds: ['m06-eventemitter', 'm03-events-module', 'm06-error-events'],
  },
  {
    id: 'ch-032',
    title: 'Streaming word counter',
    difficulty: 'intermediate',
    topic: 'Streams and chunking',
    category: 'nodejs',
    prompt: md(
      'Data from a stream arrives in **arbitrary chunks** — a word can be split across two chunks. Write `createWordCounter()` returning `{ write(chunk), end() }`:',
      '',
      '- Words are runs of `[A-Za-z0-9]`, counted case-insensitively (keys lowercase).',
      '- `end()` flushes any partial word and returns an object `{ word: count }` (keys in first-seen order).',
      "- `write` after `end` throws `Error('write after end')`.",
      '',
      "Example: `write('hel'); write('lo wor'); write('ld hello'); end()` → `{ hello: 2, world: 1 }`",
    ),
    starterCode: js`
      function createWordCounter() {
        // TODO: keep the unfinished word between writes
        return {
          write(chunk) {},
          end() {},
        };
      }
    `,
    solution: js`
      function createWordCounter() {
        const counts = Object.create(null);
        let carry = '';
        let ended = false;
        const add = (word) => {
          const key = word.toLowerCase();
          counts[key] = (counts[key] || 0) + 1;
        };
        return {
          write(chunk) {
            if (ended) throw new Error('write after end');
            const parts = (carry + chunk).split(/[^A-Za-z0-9]+/);
            carry = parts.pop();
            parts.filter(Boolean).forEach(add);
          },
          end() {
            if (!ended) {
              ended = true;
              if (carry) add(carry);
              carry = '';
            }
            return counts;
          },
        };
      }
    `,
    tests: [
      t("(() => { const c = createWordCounter(); c.write('hel'); c.write('lo wor'); c.write('ld hello'); return c.end(); })()", { hello: 2, world: 1 }),
      t("(() => { const c = createWordCounter(); c.write('a '); c.write('b'); return c.end(); })()", { a: 1, b: 1 }),
      t("(() => { const c = createWordCounter(); c.write('Node, node! NODE.'); return c.end(); })()", { node: 3 }),
      t('createWordCounter().end()', {}),
      t("(() => { const c = createWordCounter(); c.end(); try { c.write('x'); return 'no error'; } catch (e) { return e.message; } })()", 'write after end'),
      t("(() => { const c = createWordCounter(); 'ab cd ab'.split('').forEach((ch) => c.write(ch)); return c.end(); })()", { ab: 2, cd: 1 }),
    ],
    hints: [
      'After splitting `carry + chunk`, the **last** piece may be an unfinished word — keep it as the new carry.',
      'Only flush the carry in `end()`.',
    ],
    explanation: md(
      'Prepend the leftover from the previous chunk, split on non-word characters, and hold back the last fragment (it might continue in the next chunk). Everything before it is a complete word. `end()` counts the final fragment.',
      '',
      'This "carry the remainder" technique is exactly how line splitters (`readline`, NDJSON parsers) and Transform streams handle chunk boundaries — and it keeps memory O(longest word), not O(file size).',
      '',
      'Complexity: O(total characters).',
    ),
    relatedLessonIds: ['m06-streams-introduction', 'm06-transform-streams', 'm06-streaming-large-files'],
  },
  {
    id: 'ch-033',
    title: 'Retry with exponential backoff',
    difficulty: 'advanced',
    topic: 'Resilience',
    category: 'nodejs',
    prompt: md(
      'Write `retry(fn, options)` that calls async `fn(attempt)` and retries on failure.',
      '',
      'Options (all optional):',
      '- `retries` (default 3) — retries **after** the first attempt, so up to `retries + 1` calls.',
      '- `baseDelay` (default 100 ms), `factor` (default 2), `maxDelay` (default `Infinity`). The delay before retry *n* (1-based) is `min(baseDelay * factor^(n-1), maxDelay)`.',
      '- `shouldRetry(err)` — return `false` to fail fast (e.g. on a 400).',
      '- `onRetry(err, attempt, delay)` — called just before each wait.',
      '',
      'Resolve with the first successful result; otherwise reject with the **last** error.',
    ),
    starterCode: js`
      async function retry(fn, options = {}) {
        // TODO
      }
    `,
    solution: js`
      async function retry(fn, options = {}) {
        const {
          retries = 3,
          baseDelay = 100,
          factor = 2,
          maxDelay = Infinity,
          shouldRetry = () => true,
          onRetry,
        } = options;

        for (let attempt = 0; ; attempt++) {
          try {
            return await fn(attempt);
          } catch (err) {
            if (attempt >= retries || !shouldRetry(err)) throw err;
            const delay = Math.min(baseDelay * factor ** attempt, maxDelay);
            if (onRetry) onRetry(err, attempt + 1, delay);
            await new Promise((resolve) => setTimeout(resolve, delay));
          }
        }
      }
    `,
    tests: [
      t("(async () => { let calls = 0; const r = await retry(async () => { calls++; if (calls < 3) throw new Error('flaky'); return 'ok'; }, { retries: 5, baseDelay: 5 }); return [r, calls]; })()", ['ok', 3]),
      t("(async () => { let calls = 0; try { await retry(async () => { calls++; throw new Error('down #' + calls); }, { retries: 2, baseDelay: 1 }); return 'resolved'; } catch (e) { return [e.message, calls]; } })()", ['down #3', 3]),
      t("(async () => { const delays = []; try { await retry(async () => { throw new Error('x'); }, { retries: 4, baseDelay: 2, factor: 3, maxDelay: 20, onRetry: (e, n, d) => delays.push(d) }); } catch (e) {} return delays; })()", [2, 6, 18, 20]),
      t("(async () => { let calls = 0; try { await retry(async () => { calls++; const e = new Error('bad request'); e.status = 400; throw e; }, { retries: 5, baseDelay: 1, shouldRetry: (e) => e.status !== 400 }); return 'resolved'; } catch (e) { return [e.message, calls]; } })()", ['bad request', 1]),
      t("(async () => { const start = Date.now(); let c = 0; await retry(async () => { if (c++ < 2) throw new Error('x'); return 1; }, { retries: 3, baseDelay: 10 }); return Date.now() - start >= 25; })()", true),
      t("(async () => { let calls = 0; try { await retry(async () => { calls++; throw new Error('once'); }, { retries: 0 }); } catch (e) { return [e.message, calls]; } })()", ['once', 1]),
    ],
    hints: [
      'An infinite `for` loop with `try { return await fn() } catch` is the cleanest shape.',
      'Decide whether to rethrow **before** sleeping.',
      'Note the `return await` — without `await` the `catch` would not see the rejection.',
    ],
    explanation: md(
      'Loop forever; `return await fn(attempt)` exits on success. In `catch`, rethrow if retries are exhausted or `shouldRetry` says no; otherwise compute the capped exponential delay, notify `onRetry`, sleep and loop.',
      '',
      'Production additions: **jitter** (randomise the delay so many clients do not retry in lockstep — the "thundering herd"), only retrying idempotent operations, and honouring `Retry-After` headers.',
      '',
      'Complexity: at most `retries + 1` calls; worst-case wait is the sum of the capped delays.',
    ),
    relatedLessonIds: ['m05-error-handling-in-asynchronous-code', 'm05-async-await'],
  },
  {
    id: 'ch-034',
    title: 'Async pool (concurrency limiter)',
    difficulty: 'advanced',
    topic: 'Concurrency',
    category: 'nodejs',
    prompt: md(
      'Write `asyncPool(limit, items, iteratorFn)` that runs `iteratorFn(item, index)` for every item with **at most `limit` running at the same time**.',
      '',
      '- Resolve with results in **input order**.',
      '- Start a new task as soon as one finishes (do not wait for a whole "batch").',
      '- Reject with the first error.',
      '',
      'Use case: calling a rate-limited API for 10,000 users without opening 10,000 sockets at once.',
    ),
    starterCode: js`
      async function asyncPool(limit, items, iteratorFn) {
        // TODO: never more than "limit" in flight
      }
    `,
    solution: js`
      async function asyncPool(limit, items, iteratorFn) {
        const results = new Array(items.length);
        let next = 0;

        async function worker() {
          while (next < items.length) {
            const i = next++;
            results[i] = await iteratorFn(items[i], i);
          }
        }

        const workerCount = Math.min(limit, items.length);
        await Promise.all(Array.from({ length: workerCount }, () => worker()));
        return results;
      }
    `,
    tests: [
      t('(async () => { let active = 0; let max = 0; const r = await asyncPool(2, [30, 10, 20, 10], async (ms) => { active++; max = Math.max(max, active); await new Promise((res) => setTimeout(res, ms)); active--; return ms; }); return [r, max]; })()', [[30, 10, 20, 10], 2]),
      t('asyncPool(10, [1, 2, 3], async (x) => x * 2)', [2, 4, 6]),
      t('asyncPool(3, [], async (x) => x)', []),
      t("asyncPool(2, [1, 2, 3], async (x) => { if (x === 2) throw new Error('fail ' + x); return x; }).catch((e) => e.message)", 'fail 2'),
      t('(async () => { let active = 0; let max = 0; await asyncPool(1, [5, 5, 5], async (ms) => { active++; max = Math.max(max, active); await new Promise((res) => setTimeout(res, ms)); active--; }); return max; })()', 1),
      t("(async () => { const starts = []; const t0 = Date.now(); await asyncPool(2, [40, 10, 10], async (ms, i) => { starts.push(i); await new Promise((res) => setTimeout(res, ms)); }); return [starts, Date.now() - t0 < 60]; })()", [[0, 1, 2], true]),
    ],
    hints: [
      'Spawn `limit` workers that each pull the next index from a shared counter.',
      'JavaScript is single-threaded, so `next++` between awaits is race-free.',
    ],
    explanation: md(
      'The worker-pool pattern: start `min(limit, n)` async workers. Each loops, claims the next index (`next++` is atomic between awaits on a single thread), awaits the task and stores the result at that index. `Promise.all` over the workers resolves when the queue drains and rejects on the first error.',
      '',
      'This is a sliding window, not batches: with `[40, 10, 10]` and limit 2, task 2 starts at ~10 ms, not after the 40 ms task. Libraries: `p-limit`, `p-map` (with `concurrency`).',
      '',
      'Complexity: O(n) scheduling; wall time ≈ total work / limit.',
    ),
    relatedLessonIds: ['m05-promise-all', 'm11-performance-optimization'],
  },
  {
    id: 'ch-035',
    title: 'Priority task queue with concurrency',
    difficulty: 'advanced',
    topic: 'Job queues',
    category: 'nodejs',
    prompt: md(
      'Implement `class TaskQueue` with constructor `new TaskQueue({ concurrency = 1 })`.',
      '',
      '- `add(taskFn, priority = 0)` — `taskFn` returns a promise. Returns a promise for that task\'s result (or error).',
      '- If a slot is free, the task starts **synchronously inside `add`**. Otherwise it waits.',
      '- Waiting tasks start by **highest priority first**; equal priorities run **FIFO**.',
      '- `size` — number of waiting tasks; `pending` — number running.',
      '- `onIdle()` — promise that resolves when nothing is waiting or running.',
      '- A failing task rejects its own promise but does not stop the queue.',
    ),
    starterCode: js`
      class TaskQueue {
        constructor({ concurrency = 1 } = {}) {
          // TODO
        }
        get size() {
          // TODO
        }
        add(taskFn, priority = 0) {
          // TODO
        }
        onIdle() {
          // TODO
        }
      }
    `,
    solution: js`
      class TaskQueue {
        constructor({ concurrency = 1 } = {}) {
          this.concurrency = concurrency;
          this.queue = [];
          this.pending = 0;
          this.seq = 0;
          this.idleWaiters = [];
        }

        get size() {
          return this.queue.length;
        }

        add(taskFn, priority = 0) {
          return new Promise((resolve, reject) => {
            const entry = { taskFn, priority, seq: this.seq++, resolve, reject };
            // keep the queue sorted: higher priority first, FIFO within a priority
            const at = this.queue.findIndex((e) => e.priority < priority);
            if (at === -1) this.queue.push(entry);
            else this.queue.splice(at, 0, entry);
            this._drain();
          });
        }

        _drain() {
          while (this.pending < this.concurrency && this.queue.length > 0) {
            const { taskFn, resolve, reject } = this.queue.shift();
            this.pending++;
            Promise.resolve()
              .then(taskFn)
              .then(resolve, reject)
              .then(() => {
                this.pending--;
                this._drain();
              });
          }
          if (this.pending === 0 && this.queue.length === 0) {
            this.idleWaiters.splice(0).forEach((done) => done());
          }
        }

        onIdle() {
          if (this.pending === 0 && this.queue.length === 0) return Promise.resolve();
          return new Promise((resolve) => this.idleWaiters.push(resolve));
        }
      }
    `,
    tests: [
      t("(async () => { const q = new TaskQueue({ concurrency: 1 }); const order = []; const job = (name, ms) => () => new Promise((r) => setTimeout(() => { order.push(name); r(name); }, ms)); q.add(job('first', 10)); q.add(job('low', 1), 1); q.add(job('high', 1), 10); q.add(job('mid', 1), 5); q.add(job('high2', 1), 10); await q.onIdle(); return order; })()", ['first', 'high', 'high2', 'mid', 'low']),
      t('(async () => { const q = new TaskQueue({ concurrency: 2 }); let active = 0; let max = 0; const results = await Promise.all([1, 2, 3, 4].map((n) => q.add(async () => { active++; max = Math.max(max, active); await new Promise((r) => setTimeout(r, 10)); active--; return n * 10; }))); return [results, max]; })()', [[10, 20, 30, 40], 2]),
      t("(async () => { const q = new TaskQueue(); const failed = q.add(async () => { throw new Error('job failed'); }).catch((e) => e.message); const ok = q.add(async () => 'next ran'); return [await failed, await ok]; })()", ['job failed', 'next ran']),
      t("(async () => { const q = new TaskQueue(); await q.onIdle(); return 'idle'; })()", 'idle'),
      t('(async () => { const q = new TaskQueue({ concurrency: 1 }); const slow = () => new Promise((r) => setTimeout(r, 10)); q.add(slow); q.add(slow); q.add(slow); const snapshot = [q.size, q.pending]; await q.onIdle(); return [snapshot, q.size, q.pending]; })()', [[2, 1], 0, 0]),
    ],
    hints: [
      'Keep waiting tasks sorted on insert: find the first entry with a lower priority and insert before it — that keeps FIFO order for equal priorities.',
      'Increment `pending` synchronously when a task starts, decrement when it settles, then try to start more.',
      'Resolve `onIdle` waiters when both counters are zero.',
    ],
    explanation: md(
      'Sorted insertion (O(n)) keeps "highest priority first, FIFO within a priority" without a separate tie-breaker sort. `_drain` starts tasks while there are free slots; each task\'s settlement frees its slot and calls `_drain` again. Starting synchronously matters: the first `add` must occupy the slot before later, higher-priority `add` calls arrive.',
      '',
      'For large queues swap the array for a binary heap (O(log n) insert/remove). Real systems: `p-queue` in-process; BullMQ / RabbitMQ when jobs must survive restarts or be shared across workers.',
      '',
      'Complexity: `add` O(n) (heap: O(log n)), start O(1).',
    ),
    relatedLessonIds: ['m11-background-jobs', 'm11-message-queues', 'm11-bullmq'],
  },
  {
    id: 'ch-036',
    title: 'Request batching loader (DataLoader-lite)',
    difficulty: 'advanced',
    topic: 'Batching and N+1',
    category: 'nodejs',
    prompt: md(
      'Solve the N+1 query problem. Write `createLoader(batchFn)` returning `load(key) → Promise`.',
      '',
      '- All `load` calls made in the **same synchronous run** (before the microtask queue drains) are collected and sent as **one** `batchFn(keys)` call.',
      '- Duplicate keys are sent once; every `load` for a key returns the cached promise (also across later ticks).',
      '- `batchFn` resolves to an array of the **same length** as `keys`. An element that is an `Error` rejects only that key.',
      "- If `batchFn` rejects, or returns a wrong-length array (`Error('batchFn must return an array of the same length as keys')`), every key in the batch rejects and is **removed from the cache** so it can be retried.",
    ),
    starterCode: js`
      function createLoader(batchFn) {
        // TODO: queue keys, schedule one dispatch per tick, cache promises
        return function load(key) {};
      }
    `,
    solution: js`
      function createLoader(batchFn) {
        const cache = new Map();
        let queue = [];

        function dispatch() {
          const batch = queue;
          queue = [];
          const keys = batch.map((item) => item.key);
          Promise.resolve()
            .then(() => batchFn(keys))
            .then((values) => {
              if (!Array.isArray(values) || values.length !== keys.length) {
                throw new Error('batchFn must return an array of the same length as keys');
              }
              batch.forEach((item, i) => {
                const value = values[i];
                if (value instanceof Error) {
                  cache.delete(item.key);
                  item.reject(value);
                } else {
                  item.resolve(value);
                }
              });
            })
            .catch((err) => {
              batch.forEach((item) => {
                cache.delete(item.key);
                item.reject(err);
              });
            });
        }

        return function load(key) {
          if (cache.has(key)) return cache.get(key);
          const promise = new Promise((resolve, reject) => {
            queue.push({ key, resolve, reject });
            if (queue.length === 1) queueMicrotask(dispatch);
          });
          cache.set(key, promise);
          return promise;
        };
      }
    `,
    tests: [
      t("(async () => { const calls = []; const load = createLoader(async (keys) => { calls.push(keys); return keys.map((k) => 'user' + k); }); const r = await Promise.all([load(1), load(2), load(1)]); return [r, calls]; })()", [['user1', 'user2', 'user1'], [[1, 2]]]),
      t('(async () => { const calls = []; const load = createLoader(async (keys) => { calls.push(keys); return keys; }); await load(1); await Promise.all([load(1), load(3)]); return calls; })()', [[1], [3]]),
      t("(async () => { const load = createLoader(async (keys) => keys.map((k) => (k < 0 ? new Error('bad ' + k) : k))); const r = await Promise.allSettled([load(1), load(-1)]); return r.map((s) => (s.status === 'fulfilled' ? s.value : s.reason.message)); })()", [1, 'bad -1']),
      t("(async () => { let n = 0; const load = createLoader(async (keys) => { n++; if (n === 1) throw new Error('db down'); return keys; }); const first = await Promise.allSettled([load('a'), load('b')]); const second = await load('a'); return [first.map((s) => s.reason && s.reason.message), second, n]; })()", [['db down', 'db down'], 'a', 2]),
      t("(async () => { const load = createLoader(async () => [1]); return Promise.all([load('x'), load('y')]).catch((e) => e.message); })()", 'batchFn must return an array of the same length as keys'),
    ],
    hints: [
      'Schedule the dispatch with `queueMicrotask` when the first key of a new batch is queued.',
      'Cache the **promise** per key, not the value — that dedupes in-flight requests.',
    ],
    explanation: md(
      'Each `load` creates (or reuses) a promise per key and pushes its resolvers into the current batch. The first key in a batch schedules one `dispatch` on the microtask queue, so every `load` in the same synchronous run lands in the same batch. `dispatch` calls `batchFn` once and fans the results back out by index.',
      '',
      'This is how GraphQL resolvers avoid N+1 queries: 100 `load(userId)` calls become one `SELECT ... WHERE id IN (...)`. The real `dataloader` package adds per-request caches, `maxBatchSize` and `cacheKeyFn`.',
      '',
      'Complexity: O(n) per batch plus one backend round-trip instead of n.',
    ),
    relatedLessonIds: ['m05-microtask-queue', 'm09-database-architecture'],
  },
  {
    id: 'ch-037',
    title: 'Compare semantic versions',
    difficulty: 'advanced',
    topic: 'Semver',
    category: 'nodejs',
    prompt: md(
      'Write `compareSemver(a, b)` returning `-1`, `0` or `1`, following the SemVer 2.0 precedence rules:',
      '',
      '- Optional leading `v`; build metadata after `+` is **ignored**.',
      '- Compare `MAJOR.MINOR.PATCH` numerically (`1.2.10 > 1.2.9`).',
      '- A version **with** a pre-release (`1.0.0-rc.1`) is lower than the same version without one.',
      '- Pre-release identifiers are compared dot by dot: numeric ones numerically, numeric < alphanumeric, alphanumerics by ASCII order, and a shorter list is lower when all shared ones are equal.',
      "- Invalid input throws `TypeError('Invalid version: <input>')`.",
      '',
      'Spec order: `1.0.0-alpha < 1.0.0-alpha.1 < 1.0.0-alpha.beta < 1.0.0-beta < 1.0.0-beta.2 < 1.0.0-beta.11 < 1.0.0-rc.1 < 1.0.0`.',
    ),
    starterCode: js`
      function compareSemver(a, b) {
        // TODO: parse, compare core, then pre-release identifiers
      }
    `,
    solution: js`
      function parseSemver(version) {
        const m = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/.exec(version);
        if (!m) throw new TypeError('Invalid version: ' + version);
        return {
          core: [Number(m[1]), Number(m[2]), Number(m[3])],
          pre: m[4] ? m[4].split('.') : [],
        };
      }

      function compareIdentifier(x, y) {
        const xNum = /^\d+$/.test(x);
        const yNum = /^\d+$/.test(y);
        if (xNum && yNum) return Number(x) === Number(y) ? 0 : Number(x) < Number(y) ? -1 : 1;
        if (xNum) return -1;
        if (yNum) return 1;
        return x === y ? 0 : x < y ? -1 : 1;
      }

      function compareSemver(a, b) {
        const A = parseSemver(a);
        const B = parseSemver(b);
        for (let i = 0; i < 3; i++) {
          if (A.core[i] !== B.core[i]) return A.core[i] < B.core[i] ? -1 : 1;
        }
        if (!A.pre.length && !B.pre.length) return 0;
        if (!A.pre.length) return 1;
        if (!B.pre.length) return -1;
        const len = Math.max(A.pre.length, B.pre.length);
        for (let i = 0; i < len; i++) {
          if (A.pre[i] === undefined) return -1;
          if (B.pre[i] === undefined) return 1;
          const c = compareIdentifier(A.pre[i], B.pre[i]);
          if (c !== 0) return c;
        }
        return 0;
      }
    `,
    tests: [
      t("compareSemver('1.2.3', '1.2.10')", -1),
      t("compareSemver('v2.0.0', '2.0.0')", 0),
      t("compareSemver('1.0.0', '1.0.0-rc.1')", 1),
      t("['1.0.0', '1.0.0-rc.1', '1.0.0-beta.11', '1.0.0-beta.2', '1.0.0-beta', '1.0.0-alpha.beta', '1.0.0-alpha.1', '1.0.0-alpha'].sort(compareSemver)",
        ['1.0.0-alpha', '1.0.0-alpha.1', '1.0.0-alpha.beta', '1.0.0-beta', '1.0.0-beta.2', '1.0.0-beta.11', '1.0.0-rc.1', '1.0.0']),
      t("compareSemver('1.0.0+build.5', '1.0.0+build.9')", 0),
      t("compareSemver('10.0.0', '9.99.99')", 1),
      t("(() => { try { compareSemver('1.2', '1.2.0'); return 'no error'; } catch (e) { return [e instanceof TypeError, e.message]; } })()", [true, 'Invalid version: 1.2']),
    ],
    hints: [
      'Parse with one regex into numeric core parts and a list of pre-release identifiers.',
      '"No pre-release" beats "has pre-release" when the cores are equal.',
      'String comparison of `"11"` and `"2"` gives the wrong answer — compare numeric identifiers as numbers.',
    ],
    explanation: md(
      'Parse each version with a regex, compare the three core numbers, then handle pre-releases: absent > present; otherwise walk identifiers pairwise with the numeric/alphanumeric rules, and if one list runs out first it is lower.',
      '',
      'This is what npm does when resolving `^1.2.0` or `~1.2.0` ranges — and why `1.3.0-beta` is **not** matched by `^1.2.0` by default (pre-releases are opt-in). The `semver` package is the reference implementation.',
      '',
      'Complexity: O(k) in the number of identifiers.',
    ),
    relatedLessonIds: ['m04-semantic-versioning', 'm04-package-json'],
  },
];
