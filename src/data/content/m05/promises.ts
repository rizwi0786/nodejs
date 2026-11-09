import type { ModuleContent } from '../../../types';
import {
  bullets, code, dedent, diagram, flow, interviewTip, section, steps, table, text,
} from '../helpers';

const content: Partial<ModuleContent> = {
  // ───────────────────────────────────────────────────────────
  promises: {
    summary: 'A Promise is an object representing the eventual result of an async operation: pending, then fulfilled with a value or rejected with a reason — exactly once.',
    topics: ['Promise', 'pending', 'fulfilled', 'rejected', 'executor', 'then', 'catch', 'finally', 'thenable', 'fs/promises'],
    sections: [
      section('introduction', undefined,
        text('Callbacks hand control of your code to someone else. A **promise** flips that: the async function hands *you* an object, and you decide what to do with its result — attach handlers, combine it with other promises, or `await` it.'),
      ),
      section('definition', 'Definition',
        bullets(
          'A **Promise** is a placeholder for a value that will be available later.',
          'States: **pending** → **fulfilled** (has a value) or **rejected** (has a reason). Fulfilled or rejected = **settled**.',
          'A promise settles **once**. Later `resolve`/`reject` calls are ignored.',
          '`.then(onFulfilled, onRejected)`, `.catch(onRejected)` and `.finally(fn)` register reactions and each return a **new** promise.',
        ),
        table('Promise vs callback', ['', 'Callback', 'Promise'], [
          ['Who controls the continuation', 'The called function', 'You (the caller)'],
          ['Called how many times', 'Whatever the library does', 'Exactly once'],
          ['Error handling', '`err` argument per call', 'Propagates to the next `.catch`'],
          ['Composition', 'Manual nesting', '`Promise.all`, chaining, `await`'],
          ['Timing', 'May be sync or async', 'Handlers are always async (microtasks)'],
        ]),
      ),
      section('why', 'Why promises exist',
        bullets(
          'They fix callback problems: double calls, sync/async inconsistency, scattered error handling.',
          'They are composable — run many in parallel, race them, chain them.',
          'They are the foundation of `async`/`await`.',
          'Modern Node core is promise-based: `fs/promises`, `timers/promises`, `stream/promises`, `dns/promises`, `readline/promises`, `fetch`.',
        ),
      ),
      section('internals', 'How a promise works',
        steps(
          '`new Promise(executor)` calls `executor(resolve, reject)` **synchronously**, right away.',
          'The executor starts async work and later calls `resolve(value)` or `reject(reason)`.',
          'Each `.then` stores a reaction. When the promise settles, V8 queues one **microtask** per reaction.',
          'Microtasks run after the current JavaScript finishes, before the event loop moves on — so `.then` callbacks are never synchronous, even for already-resolved promises.',
          'If `resolve` is given another promise (or any thenable), the outer promise **adopts** its state.',
          'If a rejected promise has no handler when the microtask queue drains, Node fires `unhandledRejection` — and by default (Node 15+) crashes.',
        ),
        flow(['pending', 'resolve(value): fulfilled → .then handlers queued as microtasks', 'reject(reason): rejected → .catch handlers queued as microtasks'], { title: 'Promise states', direction: 'vertical' }),
      ),
      section('example', 'Examples',
        code({
          title: 'The executor runs synchronously; then runs later',
          code: dedent(`
            console.log('1');
            const p = new Promise((resolve) => {
              console.log('2 executor runs synchronously');
              resolve('value');
              console.log('3 still in executor');
            });
            p.then((v) => console.log('5 then:', v));
            console.log('4');
          `),
          expectedOutput: '1\n2 executor runs synchronously\n3 still in executor\n4\n5 then: value',
          explanation: [
            'The executor runs immediately inside `new Promise`.',
            '`resolve` does not stop the executor — line 3 still runs.',
            'Even though `p` is already fulfilled, the `.then` callback waits for the microtask queue, after the script.',
          ],
          runnable: true,
        }),
        code({
          title: 'A promise settles only once',
          code: dedent(`
            const p = new Promise((resolve, reject) => {
              resolve('first');
              resolve('second');           // ignored
              reject(new Error('ignored')); // ignored
            });
            p.then((v) => console.log(v));
          `),
          expectedOutput: 'first',
          explanation: ['After the first settle call, the state is locked. This guarantee is what callbacks lacked.'],
          runnable: true,
        }),
        code({
          title: 'Promisifying a timer, with finally',
          code: dedent(`
            const delay = (ms, value) => new Promise((resolve) => setTimeout(() => resolve(value), ms));

            delay(20, 'ready')
              .then((v) => console.log('got', v))
              .finally(() => console.log('cleanup'));

            delay(10, 'x')
              .then(() => { throw new Error('failed'); })
              .catch((err) => console.log('caught', err.message))
              .finally(() => console.log('cleanup 2'));
          `),
          expectedOutput: 'caught failed\ncleanup 2\ngot ready\ncleanup',
          explanation: [
            'The 10 ms chain settles first: the throw becomes a rejection handled by `.catch`.',
            '`finally` runs on success and failure; it receives no value and passes the original result through.',
          ],
          runnable: true,
        }),
        code({
          title: 'Promise-based core API',
          code: dedent(`
            const { readFile } = require('node:fs/promises');

            readFile('package.json', 'utf8')
              .then((text) => JSON.parse(text).name)
              .then((name) => console.log('package:', name))
              .catch((err) => console.log('failed:', err.code ?? err.message));
          `),
          expectedOutput: 'package: my-app',
          explanation: ['`fs/promises` returns promises directly — no promisify needed.', 'A missing file prints `failed: ENOENT`; invalid JSON prints the `SyntaxError` message.'],
        }),
      ),
      section('real-world', 'Real-world backend usage',
        bullets(
          'DB drivers (`pg`, `mysql2/promise`, Mongoose), HTTP clients (`fetch`, axios) and cloud SDKs all return promises.',
          'Services return promises so controllers can `await` them and centralise error handling.',
          'Caching a promise (not the value) deduplicates concurrent requests for the same key.',
        ),
        code({
          title: 'Request coalescing: cache the promise',
          code: dedent(`
            const inFlight = new Map();
            let dbCalls = 0;
            const fetchUserFromDb = (id) => new Promise((r) => setTimeout(() => { dbCalls++; r({ id }); }, 20));

            function getUser(id) {
              if (!inFlight.has(id)) {
                const p = fetchUserFromDb(id).finally(() => inFlight.delete(id));
                inFlight.set(id, p);
              }
              return inFlight.get(id);
            }

            Promise.all([getUser(1), getUser(1), getUser(1)]).then((users) => {
              console.log(users.length, 'results,', dbCalls, 'db call');
            });
          `),
          expectedOutput: '3 results, 1 db call',
          explanation: ['Three concurrent callers share one in-flight promise, so the DB is hit once.', '`finally` removes the entry once it settles, so later calls fetch fresh data.'],
          runnable: true,
        }),
      ),
      section('mistakes', 'Common mistakes',
        bullets(
          'The **explicit construction anti-pattern**: wrapping an existing promise in `new Promise`.',
          'Forgetting to `return` a promise from a function, so callers cannot wait for it.',
          'No `.catch` at the end of a chain → unhandled rejection → process crash (Node 15+).',
          'Throwing inside a `setTimeout` *within* an executor: that throw is not converted into a rejection.',
        ),
        code({
          title: 'Wrong vs right: explicit construction',
          code: dedent(`
            // Wrong: pointless wrapper, easy to forget reject
            function getUser(id) {
              return new Promise((resolve, reject) => {
                db.findUser(id).then(resolve).catch(reject);
              });
            }

            // Right: just return the promise
            function getUser(id) {
              return db.findUser(id);
            }
          `),
          explanation: ['Only use `new Promise` to wrap APIs that are *not* promise-based (timers, events, callback libraries).'],
        }),
        code({
          title: 'Throw in executor vs throw in a nested callback',
          code: dedent(`
            new Promise(() => { throw new Error('sync throw'); })
              .catch((e) => console.log('converted to rejection:', e.message));

            new Promise((resolve, reject) => {
              setTimeout(() => {
                try { throw new Error('async throw'); }
                catch (e) { reject(e); } // must reject manually
              }, 0);
            }).catch((e) => console.log('manual reject:', e.message));
          `),
          expectedOutput: 'converted to rejection: sync throw\nmanual reject: async throw',
          explanation: ['A synchronous throw in the executor is caught and becomes a rejection.', 'A throw inside a later callback escapes the promise entirely — you must call `reject`.'],
          runnable: true,
        }),
      ),
      section('interview', 'Interview angle',
        interviewTip('Two facts that catch candidates out: the executor runs **synchronously**, and `.then` on an already-resolved promise is still **asynchronous**.'),
      ),
      section('practice', 'Practice',
        steps(
          'Write `delay(ms)` and `timeoutAfter(ms)` helpers using `new Promise`.',
          'Write `readJson(path)` that returns a promise for the parsed contents using `fs/promises`.',
          'Implement a tiny `getConfig()` that caches its promise so the file is read only once.',
        ),
      ),
      section('summary', 'Summary',
        bullets(
          'Promise = eventual value; pending → fulfilled/rejected, once.',
          'Executor is sync; reactions are microtasks.',
          '`then`/`catch`/`finally` each return a new promise.',
          'Return promises; always end chains with a handler.',
          'Use `new Promise` only to wrap non-promise APIs.',
        ),
      ),
    ],
    revisionNotes: [
      'States: pending, fulfilled, rejected; "settled" = not pending; settles once.',
      'Executor runs synchronously inside `new Promise`.',
      '`.then` callbacks always run as microtasks, even on resolved promises.',
      'Resolving with a thenable adopts its state.',
      'Sync throw in executor → rejection; throw in a nested async callback → uncaught exception.',
      'Unhandled rejection → crash by default since Node 15.',
    ],
    quiz: [
      {
        kind: 'predict-output', difficulty: 'beginner',
        prompt: 'What is the output order?',
        code: "const p = new Promise((res) => { console.log('A'); res(); console.log('B'); });\np.then(() => console.log('C'));\nconsole.log('D');",
        options: ['A B D C', 'A D B C', 'D A B C', 'A B C D'],
        answer: 0,
        explanation: 'The executor runs synchronously (A, B — `res()` does not exit it), then D, then the `.then` microtask C. "A B C D" assumes `.then` is synchronous for resolved promises — it never is.',
      },
      {
        kind: 'predict-output', difficulty: 'beginner',
        prompt: 'What does this print?',
        code: "new Promise((res, rej) => { rej(new Error('x')); res('y'); })\n  .then((v) => console.log('then', v))\n  .catch((e) => console.log('catch', e.message));",
        options: ['then y', 'then y, then catch x', 'catch x', 'Nothing'],
        answer: 2,
        explanation: 'The first settle call (`rej`) wins; `res(\'y\')` is ignored. The rejection skips `.then` and is handled by `.catch`.',
      },
      {
        kind: 'mcq', difficulty: 'intermediate',
        prompt: 'Which statement about promises is FALSE?',
        options: [
          'A promise can be fulfilled or rejected only once',
          '`.then` returns a new promise',
          'Calling `.then` on an already-fulfilled promise runs the callback synchronously',
          'A synchronous throw inside the executor rejects the promise',
        ],
        answer: 2,
        explanation: 'Reactions are always queued as microtasks, so they run after the current synchronous code — even if the promise was already fulfilled.',
      },
    ],
    interview: [
      {
        category: 'javascript', kind: 'concept', difficulty: 'beginner', topic: 'Promises',
        question: 'What are the possible states of a Promise, and can a promise change state after it settles?',
        shortAnswer: 'Pending, fulfilled and rejected. Once fulfilled or rejected (settled), the state and value are permanent; later resolve/reject calls are ignored.',
        detailedAnswer: [
          'Pending: work in progress, no value yet.',
          'Fulfilled: has a value; `.then` success handlers run.',
          'Rejected: has a reason (ideally an `Error`); `.catch` handlers run.',
          'Immutability after settling is what makes promises safer than callbacks (no double calls).',
          '"Resolved" is not a state: a promise resolved with another pending promise is still pending.',
        ],
        followUp: 'What is the difference between "resolved" and "fulfilled"?',
        trap: 'Saying "resolved" is a fourth state, or that `resolve(promise)` immediately fulfills.',
      },
      {
        category: 'javascript', kind: 'output', difficulty: 'intermediate', topic: 'Promises',
        question: 'Predict the output, and explain when the Promise executor and the then callback run.',
        code: {
          id: 'm05-int-executor-sync',
          language: 'javascript',
          code: "console.log('start');\nconst p = new Promise((resolve) => {\n  console.log('executor');\n  resolve(1);\n});\np.then((v) => console.log('then', v));\nconsole.log('end');",
          expectedOutput: 'start\nexecutor\nend\nthen 1',
          runnable: true,
        },
        shortAnswer: '`start`, `executor`, `end`, `then 1`. The executor runs synchronously during `new Promise`; the `.then` callback is a microtask that runs after the current script.',
        detailedAnswer: [
          '`new Promise` invokes the executor immediately with `resolve` and `reject`.',
          '`resolve(1)` fulfills the promise but does not run handlers inline.',
          'Attaching `.then` to a fulfilled promise queues a microtask job.',
          'Microtasks drain once the call stack is empty, before timers or I/O.',
        ],
        followUp: 'Where would a setTimeout(..., 0) callback print in this sequence?',
        trap: 'Assuming the executor is deferred like the `.then` callback.',
      },
    ],
  },

  // ───────────────────────────────────────────────────────────
  'promise-chaining': {
    summary: 'Every then/catch/finally returns a new promise, so you can chain steps: return a value to pass it on, return a promise to wait for it, throw to jump to the next catch.',
    topics: ['promise chaining', 'then returns a promise', 'error propagation', 'recovery', 'thenable adoption', 'microtask ordering'],
    sections: [
      section('introduction', undefined,
        text('Chaining turns a list of dependent async steps into a flat pipeline. Each step receives the previous result, and any error skips straight to the nearest `.catch`.'),
      ),
      section('definition', 'Rules of a chain',
        table('What the handler does → what the next promise does', ['Handler...', 'Next promise'], [
          ['returns a value `v`', 'fulfills with `v`'],
          ['returns nothing', 'fulfills with `undefined`'],
          ['returns a promise / thenable', 'adopts its state (waits for it)'],
          ['throws `err`', 'rejects with `err`'],
          ['(no handler for this outcome)', 'passes the value/reason through unchanged'],
        ]),
        bullets(
          '`.catch(fn)` is `.then(undefined, fn)`. If `fn` returns normally, the chain **recovers** and continues as fulfilled.',
          '`.finally(fn)` passes the original outcome through unless `fn` throws or returns a rejected promise.',
        ),
      ),
      section('why', 'Why chaining matters',
        bullets(
          'One error handler for many steps instead of one per callback.',
          'You can recover with defaults (`.catch(() => cachedValue)`) and keep going.',
          'Understanding chain timing explains many "predict the output" questions.',
        ),
      ),
      section('internals', 'How chain timing works',
        bullets(
          'Each `.then` in a chain is only queued when the *previous* promise settles — so one chain advances **one microtask per step**.',
          'Two independent chains therefore **interleave**: step 1 of A, step 1 of B, step 2 of A, step 2 of B.',
          'Returning a native promise from a handler costs **two extra microtask ticks** (a `PromiseResolveThenableJob` plus the inner `.then`) before the outer promise settles.',
        ),
        flow(['p1.then(a)', 'returns p2', 'p2.then(b)', 'returns p3', 'p3.catch(c)', 'returns p4'], { title: 'Each call returns a new promise', direction: 'horizontal' }),
        diagram('event-loop-simulator', 'Step through how each .then is queued as a microtask only when the previous one settles.'),
      ),
      section('example', 'Examples',
        code({
          title: 'Values, promises and async steps in one chain',
          code: dedent(`
            Promise.resolve(2)
              .then((n) => n * 3)
              .then((n) => {
                console.log('value:', n);
                return new Promise((resolve) => setTimeout(() => resolve(n + 1), 10));
              })
              .then((n) => console.log('after async step:', n));
          `),
          expectedOutput: 'value: 6\nafter async step: 7',
          explanation: ['Returning a value passes it straight on.', 'Returning a promise makes the next `.then` wait 10 ms for it.'],
          runnable: true,
        }),
        code({
          title: 'Errors skip ahead; catch can recover',
          code: dedent(`
            Promise.resolve(1)
              .then(() => { throw new Error('step 2 failed'); })
              .then(() => console.log('step 3 skipped'))
              .catch((err) => {
                console.log('caught:', err.message);
                return 'fallback';
              })
              .then((v) => console.log('continues with:', v));
          `),
          expectedOutput: 'caught: step 2 failed\ncontinues with: fallback',
          explanation: ['The throw rejects the chain; step 3 has no rejection handler, so it is skipped.', '`.catch` returns a value, so the chain is fulfilled again.'],
          runnable: true,
        }),
        code({
          title: 'Two chains interleave',
          code: dedent(`
            Promise.resolve()
              .then(() => console.log('A1'))
              .then(() => console.log('A2'));

            Promise.resolve()
              .then(() => console.log('B1'))
              .then(() => console.log('B2'));
          `),
          expectedOutput: 'A1\nB1\nA2\nB2',
          explanation: [
            'Both first steps are queued immediately: A1, B1.',
            'A2 is queued only when A1\'s promise settles, which is after B1 was already queued.',
          ],
          runnable: true,
        }),
        code({
          title: 'Returning a promise costs extra ticks',
          code: dedent(`
            Promise.resolve()
              .then(() => Promise.resolve('inner'))  // returns a promise
              .then((v) => console.log('A got', v));

            Promise.resolve()
              .then(() => console.log('B1'))
              .then(() => console.log('B2'))
              .then(() => console.log('B3'));
          `),
          expectedOutput: 'B1\nB2\nB3\nA got inner',
          explanation: [
            'Tick 1: A\'s handler returns a promise; B1 logs.',
            'Adopting the returned promise needs a `PromiseResolveThenableJob` (tick 2) and then the inner `.then` reaction (tick 3) — two extra ticks.',
            'Only in tick 4 does `A got inner` run, after B2 (tick 2) and B3 (tick 3). Had the handler returned a plain value, it would have logged right after B1.',
          ],
          runnable: true,
        }),
      ),
      section('real-world', 'Real-world backend usage',
        code({
          title: 'A service pipeline with fallback',
          code: dedent(`
            function getProfile(userId) {
              return fetchUser(userId)
                .then((user) => fetchAvatar(user.avatarId).catch(() => DEFAULT_AVATAR).then((avatar) => ({ ...user, avatar })))
                .then((profile) => cache.set(\`profile:\${userId}\`, profile).then(() => profile));
            }
          `),
          explanation: [
            'A missing avatar is recovered locally with `.catch` so the whole profile does not fail.',
            '`cache.set(...).then(() => profile)` waits for the write but passes the profile on.',
            'Most teams would write this with async/await — but it compiles to exactly this chain.',
          ],
        }),
      ),
      section('mistakes', 'Common mistakes',
        bullets(
          'Forgetting `return` inside `.then` — the next step runs immediately and gets `undefined`.',
          'Nesting `.then` inside `.then` instead of returning.',
          'Using `.then(success, failure)` and expecting `failure` to catch errors thrown in `success`.',
          'Putting `.catch` in the middle and forgetting the chain continues afterwards.',
        ),
        code({
          title: 'Wrong: forgotten return breaks the sequence',
          code: dedent(`
            function step(v) {
              return new Promise((r) => setTimeout(() => { console.log('step', v); r(v); }, 10));
            }

            Promise.resolve()
              .then(() => { step(1); })          // no return!
              .then(() => console.log('next'));
          `),
          expectedOutput: 'next\nstep 1',
          explanation: ['The handler returns `undefined`, so the chain does not wait for `step(1)`. Fix: `.then(() => step(1))`.', 'Any rejection from `step(1)` would also be unhandled.'],
          runnable: true,
        }),
        code({
          title: 'Wrong vs right: then(success, failure)',
          code: dedent(`
            Promise.resolve('data')
              .then(
                () => { throw new Error('bug in success handler'); },
                () => console.log('never: only handles errors from BEFORE this then'),
              )
              .catch((e) => console.log('trailing catch got:', e.message));
          `),
          expectedOutput: 'trailing catch got: bug in success handler',
          explanation: ['The second argument only handles rejection of the *previous* promise. Use a trailing `.catch` to cover the handler too.'],
          runnable: true,
        }),
      ),
      section('interview', 'Interview angle',
        interviewTip('When asked to predict output with multiple chains, count microtask "rounds": each `.then` is queued only after the previous one in its chain ran.'),
      ),
      section('practice', 'Practice',
        steps(
          'Predict the output of three chains with 1, 2 and 3 `.then` calls each, then run it.',
          'Write a chain: read a file → parse JSON → fall back to `{}` on any error → log the keys.',
        ),
      ),
      section('summary', 'Summary',
        bullets(
          '`then`/`catch`/`finally` always return new promises.',
          'Return value → passed on; return promise → awaited; throw → rejection.',
          '`.catch` recovers the chain unless it rethrows.',
          'Chains advance one microtask per step, so independent chains interleave.',
        ),
      ),
    ],
    revisionNotes: [
      'Return values flow down the chain; thrown errors skip to the next rejection handler.',
      '`.catch` that returns normally → chain is fulfilled again.',
      '`.then(a, b)`: `b` does NOT catch errors thrown by `a`.',
      'Forgetting `return` in `.then` = the chain does not wait.',
      'Independent chains interleave step by step (A1 B1 A2 B2).',
      'Returning a promise from a handler adds 2 microtask ticks.',
    ],
    quiz: [
      {
        kind: 'predict-output', difficulty: 'intermediate',
        prompt: 'What is the output order?',
        code: "Promise.resolve().then(() => console.log(1)).then(() => console.log(2));\nPromise.resolve().then(() => console.log(3)).then(() => console.log(4));",
        options: ['1 2 3 4', '1 3 2 4', '3 4 1 2', '1 3 4 2'],
        answer: 1,
        explanation: 'Both first handlers are queued immediately (1, 3). Each second handler is queued only after its predecessor runs (2, 4). "1 2 3 4" assumes a chain runs to the end before the next one starts.',
      },
      {
        kind: 'predict-output', difficulty: 'beginner',
        prompt: 'What does this print?',
        code: "Promise.reject(new Error('boom'))\n  .then(() => console.log('A'))\n  .catch(() => console.log('B'))\n  .then(() => console.log('C'));",
        options: ['A C', 'B', 'A B C', 'B C'],
        answer: 3,
        explanation: 'The rejection skips `A`, is handled by the catch (`B`), and because the catch returns normally the chain continues to `C`.',
      },
      {
        kind: 'find-bug', difficulty: 'intermediate',
        prompt: 'The function sometimes returns before the audit log is written, and audit failures are never reported. Why?',
        code: "function deleteUser(id) {\n  return db.deleteUser(id)\n    .then(() => { audit.write('deleted ' + id); })\n    .then(() => ({ ok: true }));\n}",
        options: [
          '`db.deleteUser` must be awaited',
          'The arrow function with braces does not return `audit.write(...)`, so the chain does not wait for it',
          '`.then` cannot return objects',
          'The chain needs `.finally`',
        ],
        answer: 1,
        explanation: 'With braces, the arrow body needs an explicit `return`. Without it, the promise from `audit.write` is ignored: the chain continues immediately and its rejection is unhandled.',
      },
    ],
    interview: [
      {
        category: 'javascript', kind: 'concept', difficulty: 'intermediate', topic: 'Promises',
        question: 'What happens when a .then handler returns another promise instead of a plain value?',
        shortAnswer: 'The promise returned by `.then` adopts the returned promise: it stays pending until that inner promise settles, then fulfills or rejects with the same result.',
        detailedAnswer: [
          'Any thenable is adopted, not just native promises.',
          'This is what lets chains express sequential async steps without nesting.',
          'Adoption is done via a `PromiseResolveThenableJob`, costing extra microtask ticks.',
          'If the inner promise rejects, the outer chain rejects and skips to the next `.catch`.',
        ],
        followUp: 'Why might two chains that look equivalent produce interleaved output in a different order?',
        trap: 'Thinking the next `.then` receives the promise object itself as its value.',
      },
      {
        category: 'javascript', kind: 'concept', difficulty: 'intermediate', topic: 'Promises',
        question: 'What is the difference between promise.then(onSuccess, onError) and promise.then(onSuccess).catch(onError)?',
        shortAnswer: 'With two arguments, `onError` only handles a rejection of the original promise. With a trailing `.catch`, it also handles errors thrown or rejected inside `onSuccess`.',
        detailedAnswer: [
          '`.then(a, b)` registers both reactions on the same promise; only one of them runs.',
          '`.then(a).catch(b)` attaches `b` to the promise returned by `.then(a)`.',
          'A bug in `a` therefore escapes form 1 (possibly as an unhandled rejection) but is caught in form 2.',
          'Form 1 is useful when you deliberately want to distinguish "fetch failed" from "processing failed".',
        ],
        followUp: 'How does .finally differ from .then(fn, fn)?',
        trap: 'Assuming they are interchangeable.',
      },
    ],
  },
};

export default content;
