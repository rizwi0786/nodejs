import type { InterviewQuestion } from '../../../types';
import { out } from './helpers';

/** Output questions: promises, async/await, generators, microtasks vs timers. All runnable (pure JS). */
export const asyncOutputQuestions: InterviewQuestion[] = [
  out({
    id: 'out-038',
    category: 'javascript',
    difficulty: 'beginner',
    topic: 'Promise vs setTimeout order',
    question: 'What does this print?',
    code: `
      console.log('1');
      setTimeout(() => console.log('2'), 0);
      Promise.resolve().then(() => console.log('3'));
      console.log('4');
    `,
    expectedOutput: '1\n4\n3\n2',
    runnable: true,
    shortAnswer: '`1 4 3 2` — synchronous code first, then microtasks (promise callbacks), then macrotasks (timers).',
    detailedAnswer: [
      '`1` and `4` are logged synchronously while the script runs.',
      '`setTimeout` schedules a macrotask; `.then` on a resolved promise schedules a microtask.',
      'When the call stack empties, the microtask queue is drained completely → `3`.',
      'Only then does the event loop move on to timers → `2`.',
    ],
    followUp: 'Where does `process.nextTick` fit in this order?',
    trap: 'Thinking `setTimeout(fn, 0)` runs before the promise because it was scheduled first.',
    relatedLessonIds: ['m01-event-loop-fundamentals', 'm05-microtask-queue'],
  }),
  out({
    id: 'out-039',
    category: 'javascript',
    difficulty: 'beginner',
    topic: 'Promise executor runs synchronously',
    question: 'What does this print?',
    code: `
      console.log('A');
      const p = new Promise((resolve) => {
        console.log('B');
        resolve('C');
        console.log('D');
      });
      p.then((v) => console.log(v));
      console.log('E');
    `,
    expectedOutput: 'A\nB\nD\nE\nC',
    runnable: true,
    shortAnswer: '`A B D E C` — the executor runs synchronously; only the `.then` callback is async.',
    detailedAnswer: [
      'The function passed to `new Promise` is called immediately, during the constructor.',
      '`resolve(...)` does not stop the executor, so `D` still logs.',
      '`.then` callbacks always run asynchronously as microtasks, even if the promise is already resolved.',
      'So `E` (synchronous) prints before `C`.',
    ],
    followUp: 'What happens if the executor calls `resolve` twice, or throws after resolving? (Both are ignored — a promise settles once.)',
    trap: 'Thinking the whole executor body runs asynchronously.',
    relatedLessonIds: ['m01-promises', 'm05-promises'],
  }),
  out({
    id: 'out-040',
    category: 'javascript',
    difficulty: 'intermediate',
    topic: 'Promises settle once',
    question: 'What does this print? The executors call resolve/reject more than once.',
    code: `
      new Promise((resolve, reject) => {
        resolve('first');
        resolve('second');
        reject(new Error('late'));
      }).then((v) => console.log('then', v), (e) => console.log('catch', e.message));

      new Promise((resolve) => {
        resolve('ok');
        throw new Error('ignored');
      }).then((v) => console.log('then', v), (e) => console.log('catch', e.message));

      new Promise(() => {
        throw new Error('sync throw');
      }).catch((e) => console.log('catch', e.message));
    `,
    expectedOutput: 'then first\nthen ok\ncatch sync throw',
    runnable: true,
    shortAnswer: '`then first`, `then ok`, `catch sync throw` — the first settle wins; a throw in the executor rejects only if the promise has not settled yet.',
    detailedAnswer: [
      'A promise moves from pending to fulfilled or rejected exactly once; later `resolve`/`reject` calls are no-ops.',
      'An exception thrown inside the executor is caught by the constructor and turned into `reject(err)`.',
      'In the second promise that implicit reject comes after `resolve`, so it is ignored as well.',
      'In the third promise nothing settled first, so the throw becomes a rejection handled by `.catch`.',
      'All three callbacks are microtasks queued in order, so they print top to bottom.',
    ],
    followUp: 'Is an error thrown inside a `setTimeout` callback within the executor also converted to a rejection? (No — it is thrown later, outside the constructor, and becomes an uncaught exception.)',
    trap: 'Expecting `then second` or a rejection after the promise already resolved.',
    relatedLessonIds: ['m05-promises', 'm01-promises'],
  }),
  out({
    id: 'out-041',
    category: 'javascript',
    difficulty: 'intermediate',
    topic: 'async/await ordering',
    question: 'What does this print?',
    code: `
      async function run() {
        console.log('2');
        await null;
        console.log('4');
      }
      console.log('1');
      run().then(() => console.log('5'));
      console.log('3');
    `,
    expectedOutput: '1\n2\n3\n4\n5',
    runnable: true,
    shortAnswer: '`1 2 3 4 5` — an async function runs synchronously until its first `await`.',
    detailedAnswer: [
      'Calling `run()` executes its body synchronously, so `2` logs right after `1`.',
      '`await null` wraps the value in a resolved promise and suspends `run`, scheduling the rest as a microtask.',
      'Control returns to the caller, which logs `3`.',
      'The microtask resumes `run` → `4`; the function then returns, resolving its promise, and the `.then` → `5`.',
    ],
    followUp: 'Does `await` on a non-promise still yield? (Yes — it always takes at least one microtask turn.)',
    trap: 'Thinking `2` is delayed because "async functions run asynchronously".',
    relatedLessonIds: ['m05-async-await', 'm01-async-await'],
  }),
  out({
    id: 'out-042',
    category: 'javascript',
    difficulty: 'advanced',
    topic: 'await and microtask interleaving',
    question: 'What does this print?',
    code: `
      async function a() {
        console.log('a1');
        await b();
        console.log('a2');
      }
      async function b() {
        console.log('b');
      }
      setTimeout(() => console.log('timeout'), 0);
      a();
      Promise.resolve().then(() => console.log('p'));
      console.log('sync');
    `,
    expectedOutput: 'a1\nb\nsync\na2\np\ntimeout',
    runnable: true,
    shortAnswer: '`a1 b sync a2 p timeout`.',
    detailedAnswer: [
      '`a()` runs synchronously: logs `a1`, calls `b()` which logs `b` and returns an already-resolved promise.',
      '`await` on a native promise schedules the continuation of `a` as a microtask (one tick since V8 7.2 / Node 12).',
      'Next, `Promise.resolve().then(...)` queues `p` *after* that continuation; then `sync` logs.',
      'Microtasks drain in FIFO order: `a2`, then `p`.',
      'The timer is a macrotask, so `timeout` is last.',
    ],
    followUp: 'Why did older Node versions (before 12) print `p` before `a2`?',
    trap: 'Putting `p` before `a2` because "await takes three ticks" — outdated behaviour.',
    relatedLessonIds: ['m05-execution-order', 'm05-async-await'],
  }),
  out({
    id: 'out-043',
    category: 'javascript',
    difficulty: 'intermediate',
    topic: 'Interleaved promise chains',
    question: 'What does this print? Two independent chains start at the same time.',
    code: `
      Promise.resolve()
        .then(() => console.log('a1'))
        .then(() => console.log('a2'))
        .then(() => console.log('a3'));
      Promise.resolve()
        .then(() => console.log('b1'))
        .then(() => console.log('b2'));
    `,
    expectedOutput: 'a1\nb1\na2\nb2\na3',
    runnable: true,
    shortAnswer: '`a1 b1 a2 b2 a3` — each `.then` step is queued only when the previous step finishes, so the chains alternate.',
    detailedAnswer: [
      'Initially only `a1` and `b1` are queued (their source promises are already resolved).',
      'Running `a1` resolves the next promise in chain A, which queues `a2` behind `b1`.',
      'Running `b1` queues `b2` behind `a2`, and so on.',
      'Chains are not run to completion one at a time; they interleave one step per microtask.',
    ],
    followUp: 'How would the order change if `a1` returned a promise?',
    trap: 'Expecting the whole A chain to run before the B chain.',
    relatedLessonIds: ['m05-promise-chaining', 'm05-microtask-queue'],
  }),
  out({
    id: 'out-044',
    category: 'javascript',
    difficulty: 'advanced',
    topic: 'Returning a promise from then',
    question: 'What does this print? Chain A returns a promise from its first callback.',
    code: `
      Promise.resolve()
        .then(() => {
          console.log('A1');
          return Promise.resolve('x');
        })
        .then(() => console.log('A2'));
      Promise.resolve()
        .then(() => console.log('B1'))
        .then(() => console.log('B2'))
        .then(() => console.log('B3'))
        .then(() => console.log('B4'));
    `,
    expectedOutput: 'A1\nB1\nB2\nB3\nA2\nB4',
    runnable: true,
    shortAnswer: '`A1 B1 B2 B3 A2 B4` — resolving with a promise (a thenable) costs two extra microtask ticks.',
    detailedAnswer: [
      'When a `then` callback returns a promise, the derived promise must *adopt* its state.',
      'Adoption queues a NewPromiseResolveThenableJob (tick 1), which calls `x.then(resolve)` — and that reaction runs on tick 2.',
      'Only then is chain A\'s next promise fulfilled and `A2` queued (tick 3).',
      'Meanwhile chain B advances one step per tick: `B1`, `B2`, `B3` run first, then `A2`, then `B4`.',
      'Returning a plain value would have printed `A1 B1 A2 B2 B3 B4`.',
    ],
    followUp: 'Does `return await promise` in an async function have the same cost?',
    trap: 'Assuming returning a promise is equivalent to returning its value, timing-wise.',
    relatedLessonIds: ['m05-promise-chaining', 'm05-microtask-queue'],
  }),
  out({
    id: 'out-045',
    category: 'javascript',
    difficulty: 'advanced',
    topic: 'async return vs return await',
    question: 'What does this print? Three async functions produce their value in different ways.',
    code: `
      async function viaReturn() {
        return Promise.resolve('return-promise');
      }
      async function viaAwait() {
        return await Promise.resolve('return-await');
      }
      async function plain() {
        return 'plain';
      }
      viaReturn().then((v) => console.log(v));
      viaAwait().then((v) => console.log(v));
      plain().then((v) => console.log(v));
    `,
    expectedOutput: 'plain\nreturn-await\nreturn-promise',
    runnable: true,
    shortAnswer: '`plain`, `return-await`, `return-promise` — returning a promise from an async function needs extra ticks to adopt it.',
    detailedAnswer: [
      '`plain()` fulfils its promise immediately, so its `.then` runs on the first microtask tick.',
      '`viaAwait` spends one tick on `await`, then returns a plain value — its `.then` runs on tick 2.',
      '`viaReturn` resolves the async function\'s promise *with a promise*, triggering thenable adoption (two extra ticks) → tick 3.',
      'The ordering is the reverse of the call order, which surprises people.',
      'Beyond timing, `return await` inside `try` is what makes a rejection catchable by that `try`/`catch`.',
    ],
    followUp: 'Why does `return await` matter for error handling inside `try/catch`?',
    trap: 'Assuming the call order determines the output order.',
    relatedLessonIds: ['m05-async-await', 'm05-error-handling-in-asynchronous-code'],
  }),
  out({
    id: 'out-046',
    category: 'javascript',
    difficulty: 'advanced',
    topic: 'Awaiting a thenable',
    question: 'What does this print? A plain object with a `then` method is awaited.',
    code: `
      const thenable = {
        then(resolve) {
          console.log('then called');
          resolve('from thenable');
        },
      };
      (async () => {
        console.log('before');
        const v = await thenable;
        console.log(v);
      })();
      console.log('after');
    `,
    expectedOutput: 'before\nafter\nthen called\nfrom thenable',
    runnable: true,
    shortAnswer: '`before`, `after`, `then called`, `from thenable` — `await` treats any object with `then` as a promise, but calls `then` asynchronously.',
    detailedAnswer: [
      '`await thenable` wraps it via `Promise.resolve`, which detects the `then` method.',
      'The spec does not call `then` synchronously; it queues a job that calls it — so `after` prints first.',
      'Inside that job `then called` logs and `resolve` fulfils the wrapper promise.',
      'The async function resumes on a later microtask and logs the value.',
      'This duck typing is why query builders (e.g. Knex, Mongoose queries) can be awaited directly.',
    ],
    followUp: 'What goes wrong if an object accidentally has a `then` property (e.g. a DB row with a column named `then`)?',
    trap: 'Expecting `await` to return the object itself because it is not a real Promise.',
    relatedLessonIds: ['m05-async-await', 'm05-promises'],
  }),
  out({
    id: 'out-047',
    category: 'javascript',
    difficulty: 'intermediate',
    topic: 'Microtasks between timers',
    question: 'What does this print?',
    code: `
      setTimeout(() => {
        console.log('t1');
        Promise.resolve().then(() => console.log('p-in-t1'));
      }, 0);
      setTimeout(() => console.log('t2'), 0);
      queueMicrotask(() => console.log('micro'));
    `,
    expectedOutput: 'micro\nt1\np-in-t1\nt2',
    runnable: true,
    shortAnswer: '`micro t1 p-in-t1 t2` — the microtask queue is drained after *each* macrotask callback.',
    detailedAnswer: [
      'After the script, the microtask queue drains first → `micro`.',
      'The first timer runs → `t1`, and schedules a promise microtask.',
      'Before the second timer runs, Node drains microtasks → `p-in-t1`.',
      'Then the second timer → `t2`.',
      'Since Node 11 this matches browsers; Node 10 and earlier ran all expired timers first.',
    ],
    followUp: 'What is the difference between `queueMicrotask` and `process.nextTick`?',
    trap: 'Answering `micro t1 t2 p-in-t1` — old Node 10 behaviour.',
    relatedLessonIds: ['m05-macrotasks-and-task-queues', 'm05-microtask-queue'],
    versionNote: 'Node 11+ drains microtasks between individual timer callbacks.',
  }),
  out({
    id: 'out-048',
    category: 'javascript',
    difficulty: 'intermediate',
    topic: 'Promise.all',
    question: 'What does this print? One `Promise.all` succeeds slowly, another has a fast rejection.',
    code: `
      const delay = (ms, v, fail) =>
        new Promise((res, rej) => setTimeout(() => (fail ? rej(new Error(v)) : res(v)), ms));

      Promise.all([delay(30, 'slow'), delay(10, 'fast'), 42]).then((v) => console.log(v));
      Promise.all([delay(20, 'ok'), delay(5, 'boom', true)]).then(
        (v) => console.log('then', v),
        (e) => console.log('catch', e.message),
      );
    `,
    expectedOutput: "catch boom\n[ 'slow', 'fast', 42 ]",
    runnable: true,
    shortAnswer: "`catch boom` (after ~5 ms), then `[ 'slow', 'fast', 42 ]` (after ~30 ms) — results keep input order; the first rejection fails fast.",
    detailedAnswer: [
      '`Promise.all` resolves with an array in the order of the *inputs*, not completion order.',
      'Non-promise values like `42` are treated as already-resolved promises.',
      'It rejects as soon as any input rejects (here at 5 ms) — it does not wait for the others.',
      'The other input (`ok`) still runs to completion; `Promise.all` does not cancel anything.',
    ],
    followUp: 'How would you cancel the remaining work when one request fails? (Share an `AbortController` and abort on failure.)',
    trap: "Expecting `[ 'fast', 'slow', 42 ]` (completion order).",
    relatedLessonIds: ['m05-promise-all'],
  }),
  out({
    id: 'out-049',
    category: 'javascript',
    difficulty: 'intermediate',
    topic: 'Promise.allSettled',
    question: 'What does this print?',
    code: `
      Promise.allSettled([Promise.resolve(1), Promise.reject(new Error('nope')), 3]).then((results) => {
        for (const r of results) {
          console.log(r.status, r.status === 'fulfilled' ? r.value : r.reason.message);
        }
      });
    `,
    expectedOutput: 'fulfilled 1\nrejected nope\nfulfilled 3',
    runnable: true,
    shortAnswer: '`fulfilled 1`, `rejected nope`, `fulfilled 3` — `allSettled` never rejects; it reports each outcome.',
    detailedAnswer: [
      '`allSettled` waits for every input to settle, whether fulfilled or rejected.',
      'Each result is `{ status: "fulfilled", value }` or `{ status: "rejected", reason }`.',
      'Results are in input order; non-promises count as fulfilled.',
      'Because `allSettled` attaches handlers, the rejected input does not trigger an unhandled rejection.',
    ],
    followUp: 'When would you pick `allSettled` over `all` in a backend? (Fan-out to optional services where partial results are acceptable.)',
    trap: 'Expecting the chain to reject because one input rejected.',
    relatedLessonIds: ['m05-promise-allsettled'],
  }),
  out({
    id: 'out-050',
    category: 'javascript',
    difficulty: 'intermediate',
    topic: 'Promise.race vs Promise.any',
    question: 'What does this print?',
    code: `
      const wait = (ms, v, ok = true) =>
        new Promise((res, rej) => setTimeout(() => (ok ? res(v) : rej(new Error(v))), ms));

      Promise.race([wait(20, 'A'), wait(10, 'B', false)]).then(
        (v) => console.log('race', v),
        (e) => console.log('race err', e.message),
      );
      Promise.any([wait(20, 'A'), wait(10, 'B', false)]).then((v) => console.log('any', v));
      Promise.any([wait(5, 'X', false), wait(6, 'Y', false)]).catch((e) =>
        console.log(e.constructor.name, e.errors.map((x) => x.message)),
      );
    `,
    expectedOutput: "AggregateError [ 'X', 'Y' ]\nrace err B\nany A",
    runnable: true,
    shortAnswer: "`AggregateError [ 'X', 'Y' ]`, `race err B`, `any A` — `race` settles with the first settlement of any kind; `any` waits for the first fulfilment.",
    detailedAnswer: [
      '`Promise.race` adopts whichever input settles first — here the rejection of `B` at 10 ms.',
      '`Promise.any` ignores rejections and resolves with the first *fulfilled* value — `A` at 20 ms.',
      'If every input rejects, `any` rejects with an `AggregateError` whose `errors` array lists all reasons.',
      'Output is ordered by time: 6 ms (AggregateError), 10 ms (race), 20 ms (any).',
    ],
    followUp: 'How do you implement a request timeout with `race`, and why is `AbortSignal.timeout()` better in Node 18+?',
    trap: 'Thinking `race` returns the first *successful* result.',
    relatedLessonIds: ['m05-promise-race', 'm05-promise-any'],
  }),
  out({
    id: 'out-051',
    category: 'javascript',
    difficulty: 'advanced',
    topic: 'Combinators with empty arrays',
    question: 'What does this print?',
    code: `
      Promise.all([]).then((v) => console.log('all', v));
      Promise.any([]).catch((e) => console.log('any', e.name));
      Promise.race([]).then(() => console.log('race'));
      Promise.allSettled([]).then((v) => console.log('allSettled', v));
      setTimeout(() => console.log('done'), 10);
    `,
    expectedOutput: 'all []\nany AggregateError\nallSettled []\ndone',
    runnable: true,
    shortAnswer: '`all []`, `any AggregateError`, `allSettled []`, `done` — `race([])` stays pending forever.',
    detailedAnswer: [
      '`Promise.all([])` and `Promise.allSettled([])` resolve immediately with `[]` (vacuous success).',
      '`Promise.any([])` rejects immediately with an `AggregateError` — there is nothing that could fulfil.',
      '`Promise.race([])` has nothing to race, so it never settles and its callback never runs.',
      'The three settled callbacks are microtasks in registration order; the timer runs after them.',
    ],
    followUp: 'Why can a forever-pending promise be a bug in a request handler? (The request hangs until the client or proxy times out.)',
    trap: 'Expecting `race([])` to resolve with `undefined`.',
    relatedLessonIds: ['m05-promise-race', 'm05-promise-any', 'm05-promise-all'],
  }),
  out({
    id: 'out-052',
    category: 'javascript',
    difficulty: 'intermediate',
    topic: 'Error propagation in promise chains',
    question: 'What does this print?',
    code: `
      Promise.resolve(1)
        .then((v) => {
          throw new Error('fail at ' + v);
        })
        .then(() => console.log('skipped'))
        .catch((e) => {
          console.log('caught:', e.message);
          return 'recovered';
        })
        .then((v) => console.log('after catch:', v))
        .finally(() => console.log('finally'));
    `,
    expectedOutput: 'caught: fail at 1\nafter catch: recovered\nfinally',
    runnable: true,
    shortAnswer: '`caught: fail at 1`, `after catch: recovered`, `finally` — a throw skips fulfilment handlers until a `catch`, which can recover the chain.',
    detailedAnswer: [
      'Throwing inside `.then` rejects the promise returned by that `.then`.',
      'Rejections skip every fulfilment handler (`skipped` never logs) until a rejection handler.',
      '`.catch` handles it; returning a value fulfils the next promise, so the chain is back on the happy path.',
      '`.finally` runs regardless of outcome and passes the previous result through.',
    ],
    followUp: 'What if the `.catch` handler itself throws?',
    trap: 'Expecting nothing after `.catch` to run, as if the chain "stops" on error.',
    relatedLessonIds: ['m05-promise-chaining', 'm05-error-handling-in-asynchronous-code'],
  }),
  out({
    id: 'out-053',
    category: 'javascript',
    difficulty: 'advanced',
    topic: 'Promise.prototype.finally semantics',
    question: 'What does this print? Each `finally` callback returns, throws, or just logs.',
    code: `
      async function main() {
        const v1 = await Promise.resolve('original').finally(() => 'ignored');
        console.log('1:', v1);
        try {
          await Promise.reject(new Error('original')).finally(() => {
            throw new Error('from finally');
          });
        } catch (e) {
          console.log('2:', e.message);
        }
        const v3 = await Promise.reject(new Error('kept'))
          .finally(() => console.log('cleanup'))
          .catch((e) => e.message);
        console.log('3:', v3);
      }
      main();
    `,
    expectedOutput: '1: original\n2: from finally\ncleanup\n3: kept',
    runnable: true,
    shortAnswer: '`1: original`, `2: from finally`, `cleanup`, `3: kept` — `finally` passes the outcome through unless its callback throws or rejects.',
    detailedAnswer: [
      'The `finally` callback receives no arguments and its return value is ignored → `original` passes through.',
      'If the callback throws (or returns a rejected promise), that new error replaces the original outcome.',
      'A callback that completes normally leaves the rejection untouched, so `.catch` still sees `kept`.',
      'This differs from `try/finally`, where a `return` in `finally` *does* override the result.',
    ],
    followUp: 'What happens if the `finally` callback returns a promise that resolves after 1 s? (The chain waits for it, then passes the original value.)',
    trap: 'Thinking `finally(() => "ignored")` changes the resolved value.',
    relatedLessonIds: ['m05-promise-chaining', 'm01-error-handling'],
  }),
  out({
    id: 'out-054',
    category: 'javascript',
    difficulty: 'intermediate',
    topic: 'try/catch and un-awaited promises',
    question: 'What does this print? One call to an async function is not awaited inside `try`.',
    code: `
      async function fail() {
        throw new Error('boom');
      }
      async function main() {
        let p;
        try {
          p = fail();
          console.log('try finished');
        } catch {
          console.log('sync catch');
        }
        p.catch((e) => console.log('promise catch:', e.message));
        try {
          await fail();
        } catch (e) {
          console.log('await catch:', e.message);
        }
      }
      main();
    `,
    expectedOutput: 'try finished\npromise catch: boom\nawait catch: boom',
    runnable: true,
    shortAnswer: '`try finished`, `promise catch: boom`, `await catch: boom` — an async function never throws synchronously; it returns a rejected promise.',
    detailedAnswer: [
      'Calling an async function that throws returns a rejected promise; nothing is thrown at the call site.',
      'So the first `try` completes normally and `sync catch` never logs.',
      'The rejection is handled by attaching `.catch` to the returned promise.',
      '`await` unwraps the rejection and rethrows it inside `main`, where `try/catch` works.',
      'Without the `.catch` (and without `await`), Node 15+ would crash the process with an unhandled rejection.',
    ],
    followUp: 'What is a "floating promise" and how do lint rules (`@typescript-eslint/no-floating-promises`) help?',
    trap: 'Expecting `sync catch` because the call is inside a `try` block.',
    relatedLessonIds: ['m05-error-handling-in-asynchronous-code', 'm05-async-await'],
  }),
  out({
    id: 'out-055',
    category: 'javascript',
    difficulty: 'advanced',
    topic: 'async callbacks in forEach',
    question: 'What does this print?',
    code: `
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      async function main() {
        const out = [];
        [30, 10, 20].forEach(async (ms) => {
          await sleep(ms);
          out.push(ms);
        });
        console.log('after forEach', out);
        const results = await Promise.all(
          [30, 10, 20].map(async (ms) => {
            await sleep(ms);
            return ms;
          }),
        );
        console.log('Promise.all', results);
        console.log('out now', out);
      }
      main();
    `,
    expectedOutput: 'after forEach []\nPromise.all [ 30, 10, 20 ]\nout now [ 10, 20, 30 ]',
    runnable: true,
    shortAnswer: '`after forEach []`, `Promise.all [ 30, 10, 20 ]`, `out now [ 10, 20, 30 ]` — `forEach` ignores the promises its callback returns.',
    detailedAnswer: [
      '`forEach` calls the async callback three times and discards the returned promises — it does not wait.',
      'So right after `forEach`, nothing has been pushed yet: `[]`.',
      '`map` + `Promise.all` keeps the promises and awaits them all; results follow input order.',
      'By the time `Promise.all` resolves (~30 ms), the forEach callbacks have finished in completion order: 10, 20, 30.',
      'Use `for...of` with `await` for sequential work and `Promise.all(map(...))` for parallel work.',
    ],
    followUp: 'How would you limit concurrency to 2 at a time for 1,000 items?',
    trap: 'Expecting `after forEach [ 10, 20, 30 ]` because the callback is marked `async`.',
    relatedLessonIds: ['m05-async-await', 'm01-arrays-and-array-methods'],
  }),
  out({
    id: 'out-056',
    category: 'javascript',
    difficulty: 'intermediate',
    topic: 'Generators',
    question: 'What does this print? Values are passed into the generator with `next`.',
    code: `
      function* gen() {
        console.log('start');
        const x = yield 1;
        console.log('got', x);
        yield x * 2;
        return 'done';
      }
      const it = gen();
      console.log('created');
      console.log(it.next('ignored'));
      console.log(it.next(5));
      console.log(it.next());
      console.log(it.next());
    `,
    expectedOutput: "created\nstart\n{ value: 1, done: false }\ngot 5\n{ value: 10, done: false }\n{ value: 'done', done: true }\n{ value: undefined, done: true }",
    runnable: true,
    shortAnswer: "`created`, `start`, `{ value: 1, done: false }`, `got 5`, `{ value: 10, done: false }`, `{ value: 'done', done: true }`, `{ value: undefined, done: true }`.",
    detailedAnswer: [
      'Calling `gen()` only creates the iterator; no body code runs yet, so `created` is first.',
      'The first `next()` runs until the first `yield`; its argument has no `yield` to receive it and is discarded.',
      'The second `next(5)` resumes the paused `yield`, which evaluates to `5`.',
      '`return` produces `{ value: "done", done: true }`; after that every `next()` gives `{ value: undefined, done: true }`.',
      '`for...of` would skip the `return` value — it stops at the first `done: true`.',
    ],
    followUp: 'How do async generators relate to Node streams (`for await (const chunk of stream)`)?',
    trap: 'Expecting `start` before `created`, or `got ignored`.',
    relatedLessonIds: ['m01-es6-plus-features'],
  }),
  out({
    id: 'out-057',
    category: 'javascript',
    difficulty: 'advanced',
    topic: 'Generator return and finally',
    question: 'What does this print? The generator has a `finally` block and is closed early.',
    code: `
      function* g() {
        try {
          yield 1;
          yield 2;
        } finally {
          console.log('cleanup');
        }
      }
      const it = g();
      console.log(it.next().value);
      console.log(it.return(99));
      console.log(it.next());
      for (const v of g()) {
        console.log('loop', v);
        break;
      }
    `,
    expectedOutput: '1\ncleanup\n{ value: 99, done: true }\n{ value: undefined, done: true }\nloop 1\ncleanup',
    runnable: true,
    shortAnswer: '`1`, `cleanup`, `{ value: 99, done: true }`, `{ value: undefined, done: true }`, `loop 1`, `cleanup`.',
    detailedAnswer: [
      '`it.return(99)` resumes the paused generator as if a `return 99` happened at the `yield`.',
      'That triggers the `finally` block (`cleanup`) before the result `{ value: 99, done: true }`.',
      'The generator is now closed; further `next()` calls report `done: true`.',
      '`break` in `for...of` automatically calls the iterator\'s `return()`, so cleanup runs again for the second generator.',
      'This is how `for await` over a stream destroys the stream when you break early.',
    ],
    followUp: 'What happens if you call `it.throw(new Error())` instead?',
    trap: 'Thinking `break` leaves the generator suspended without running `finally`.',
    relatedLessonIds: ['m01-es6-plus-features', 'm01-error-handling'],
  }),
  out({
    id: 'out-058',
    category: 'javascript',
    difficulty: 'intermediate',
    topic: 'for await...of',
    question: 'What does this print?',
    code: `
      async function* ticker() {
        yield 1;
        yield 2;
      }
      (async () => {
        for await (const v of ticker()) {
          console.log('got', v);
        }
        console.log('done');
      })();
      console.log('sync');
    `,
    expectedOutput: 'sync\ngot 1\ngot 2\ndone',
    runnable: true,
    shortAnswer: '`sync`, `got 1`, `got 2`, `done` — every iteration of `for await` awaits, so the loop body never runs synchronously.',
    detailedAnswer: [
      'The async IIFE starts and reaches `for await`, which calls `next()` on the async generator and awaits the promise.',
      'That await yields control back, so `sync` prints first.',
      'Each subsequent value arrives through a resolved promise; the loop logs `got 1`, `got 2`.',
      'When the generator returns, the loop ends and `done` logs.',
    ],
    followUp: 'Why is `for await (const line of rl)` with `readline` a good way to read a large file line by line?',
    trap: 'Expecting `got 1` before `sync` because the generator yields immediately.',
    relatedLessonIds: ['m05-async-await', 'm01-es6-plus-features'],
  }),
];
