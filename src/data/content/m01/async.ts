import type { ModuleContent } from '../../../types';
import { bullets, code, dedent, diagram, flow, interviewTip, note, section, steps, table, text, warn } from '../helpers';

const content: Partial<ModuleContent> = {
  // ───────────────────────────────────────────────────────────
  promises: {
    summary: 'A Promise is an object representing the eventual result of an asynchronous operation; it starts pending and settles exactly once as fulfilled (with a value) or rejected (with a reason), and `.then/.catch/.finally` register handlers that always run asynchronously as microtasks.',
    topics: ['Promise', 'pending', 'fulfilled', 'rejected', 'settled', 'executor', 'resolve', 'reject', 'then', 'catch', 'finally', 'chaining', 'microtask', 'promisify', 'thenable', 'unhandled rejection'],
    sections: [
      section('introduction', undefined,
        text('Reading a file, querying a database or calling an API takes time. Instead of blocking, Node returns immediately and gives you a **promise**: an IOU for a value that will arrive later. Promises replaced deeply nested callbacks and are the foundation of `async/await`.'),
        note('This lesson is the JavaScript-language introduction. Promise combinators (`all`, `allSettled`, `race`, `any`) and Node-specific scheduling are covered in depth in Module 5.'),
      ),
      section('definition', 'Definition',
        bullets(
          'A **Promise** is an object with an internal **state** and **result**.',
          '**pending** → initial state, no result yet.',
          '**fulfilled** → the operation succeeded; result is the value.',
          '**rejected** → the operation failed; result is the reason (usually an `Error`).',
          'Once fulfilled or rejected it is **settled** and can never change again.',
        ),
        flow([
          'pending: created, waiting',
          'fulfilled: resolve(value)',
          'rejected: reject(error)',
        ], { title: 'Promise states', direction: 'horizontal', caption: 'A promise moves from pending to exactly one of the settled states, once.' }),
        table('Promise API (instance)', ['Method', 'Runs when', 'Returns'], [
          ['`.then(onFulfilled, onRejected?)`', 'Fulfilled (or rejected, if 2nd arg)', 'A **new** promise'],
          ['`.catch(onRejected)`', 'Rejected — shorthand for `.then(undefined, fn)`', 'A new promise'],
          ['`.finally(fn)`', 'Either way; receives no value', 'A new promise that passes the original result through'],
        ]),
      ),
      section('why', 'Why promises',
        bullets(
          'Callbacks nest ("callback hell") and every level must handle errors manually.',
          'Promises are **values**: you can return them, store them, pass them, combine them.',
          'Errors propagate down the chain automatically to the nearest `.catch`.',
          'Promise handlers are guaranteed to run asynchronously, avoiding "sometimes sync, sometimes async" bugs.',
          'Modern Node APIs (`fs/promises`, `fetch`, `timers/promises`) return promises.',
        ),
      ),
      section('internals', 'How promises work inside the engine',
        steps(
          '`new Promise(executor)` creates the promise and **immediately, synchronously** calls `executor(resolve, reject)`.',
          'The promise keeps a list of **reactions** (handlers registered with `then`/`catch`/`finally`).',
          'When `resolve(value)` or `reject(reason)` is called the first time, the state is fixed and each reaction is queued as a **microtask** (a "promise job"). Later calls are ignored.',
          'If `then` is called on an already-settled promise, its handler is queued as a microtask right away — still never synchronous.',
          'Each `then` returns a new promise that is resolved with the handler\'s return value, or rejected if the handler throws.',
          'If a handler returns a promise (or any **thenable**), the new promise **adopts** its state — this is how chains wait for inner async work.',
          'The microtask queue is drained completely after the current synchronous code finishes, before timers or I/O callbacks run.',
        ),
        warn('A rejected promise with no handler triggers an `unhandledRejection`. Since Node 15 this **crashes the process** by default.'),
      ),
      section('example', 'Creating and consuming promises',
        code({
          title: 'The executor runs synchronously, handlers asynchronously',
          code: dedent(`
            console.log('1: before');
            const p = new Promise((resolve) => {
              console.log('2: executor runs synchronously');
              resolve('done');
            });
            console.log('3: after constructor', p);
            p.then((v) => console.log('5: then got', v));
            console.log('4: end of script');
          `),
          expectedOutput: "1: before\n2: executor runs synchronously\n3: after constructor Promise { 'done' }\n4: end of script\n5: then got done",
          explanation: [
            'The executor function is called immediately inside the constructor.',
            '`resolve("done")` fulfils the promise synchronously — util.inspect shows `Promise { \'done\' }`.',
            'Even though it is already fulfilled, the `then` handler waits for the microtask queue, after all synchronous code.',
          ],
          runnable: true,
        }),
        code({
          title: 'Pending → fulfilled over time',
          code: dedent(`
            const delay = (ms, value) =>
              new Promise((resolve) => setTimeout(() => resolve(value), ms));
            const p = delay(50, 'ready');
            console.log(p);
            p.then((v) => {
              console.log(v);
              console.log(p);
            });
          `),
          expectedOutput: "Promise { <pending> }\nready\nPromise { 'ready' }",
          explanation: [
            '`delay` wraps `setTimeout` in a promise — the classic way to promisify a callback API.',
            'Right after creation the promise is pending.',
            'After 50 ms the timer calls `resolve`, the state becomes fulfilled, and the handler runs.',
          ],
          runnable: true,
        }),
        code({
          title: 'A promise settles only once',
          code: dedent(`
            const p = new Promise((resolve, reject) => {
              resolve('first');
              resolve('second');
              reject(new Error('ignored'));
            });
            p.then((v) => console.log(v));
          `),
          expectedOutput: 'first',
          explanation: [
            'The first `resolve` wins; later `resolve`/`reject` calls are silently ignored.',
            'Note: the code after `resolve` still runs — `resolve` is not `return`.',
          ],
          runnable: true,
        }),
      ),
      section('example', 'Chaining and error propagation',
        code({
          title: 'Values flow down, errors skip to catch',
          code: dedent(`
            Promise.resolve(1)
              .then((v) => v + 1)
              .then((v) => {
                console.log('got', v);
                return Promise.resolve(v * 10);
              })
              .then((v) => {
                console.log('got', v);
                throw new Error('boom');
              })
              .then(() => console.log('skipped'))
              .catch((err) => {
                console.log('caught', err.message);
                return 'recovered';
              })
              .then((v) => console.log('after catch:', v))
              .finally(() => console.log('finally'));
          `),
          expectedOutput: 'got 2\ngot 20\ncaught boom\nafter catch: recovered\nfinally',
          explanation: [
            'Returning a plain value passes it to the next `then`.',
            'Returning a promise makes the chain wait for it and pass its value (`20`).',
            'Throwing rejects the next promise; fulfilment handlers are skipped until a `catch`.',
            '`catch` returning a value **recovers** the chain — the next `then` receives it.',
            '`finally` runs regardless and does not receive or change the value.',
          ],
          runnable: true,
        }),
        code({
          title: 'Forgetting to return breaks the chain',
          code: dedent(`
            const delay = (ms, v) => new Promise((r) => setTimeout(() => r(v), ms));
            Promise.resolve()
              .then(() => {
                delay(20, 'A').then((v) => console.log('inner', v));
              })
              .then((v) => console.log('outer got', v));
          `),
          expectedOutput: 'outer got undefined\ninner A',
          explanation: [
            'The first handler starts `delay` but does not `return` it, so it returns `undefined`.',
            'The chain does not wait: the next `then` runs immediately with `undefined`.',
            'Fix: `return delay(20, "A")`. Floating promises also escape error handling.',
          ],
          runnable: true,
        }),
      ),
      section('real-world', 'Promisifying a callback API',
        code({
          title: 'Wrapping an error-first callback',
          code: dedent(`
            function readUser(id, callback) {
              setTimeout(() => {
                if (id <= 0) callback(new Error('invalid id'));
                else callback(null, { id, name: 'user' + id });
              }, 10);
            }
            function readUserAsync(id) {
              return new Promise((resolve, reject) => {
                readUser(id, (err, user) => (err ? reject(err) : resolve(user)));
              });
            }
            readUserAsync(1)
              .then((user) => console.log('ok', user))
              .then(() => readUserAsync(0))
              .catch((err) => console.log('error', err.message));
          `),
          expectedOutput: "ok { id: 1, name: 'user1' }\nerror invalid id",
          explanation: [
            'Node callbacks follow the **error-first** convention `(err, result)`.',
            'In real Node code use `util.promisify(fn)` or the built-in promise APIs (`fs/promises`).',
            'One `catch` at the end handles a failure from any step.',
          ],
          runnable: true,
        }),
        code({
          title: 'The real thing in Node (not runnable here)',
          code: dedent(`
            const { readFile } = require('node:fs/promises');

            readFile('./config.json', 'utf8')
              .then((text) => JSON.parse(text))
              .then((config) => console.log('port', config.port))
              .catch((err) => console.error('failed to load config:', err.message));
          `),
          explanation: ['A read error and a JSON parse error both land in the same `catch`.'],
        }),
      ),
      section('mistakes', 'Common mistakes',
        bullets(
          'Not returning inner promises inside `then` (chain does not wait, errors escape).',
          'Nesting `then` inside `then` instead of chaining (callback hell with extra steps).',
          'No `.catch` at the end — unhandled rejections crash Node 15+.',
          'Wrapping an API that already returns a promise in `new Promise(...)` (the "explicit construction anti-pattern").',
          'Expecting `.then` handlers to run synchronously when the promise is already resolved.',
          'Thinking `finally` can change the result — it only can by throwing.',
        ),
      ),
      section('interview', 'Interview tips',
        interviewTip('State the three states and the "settles once" rule, then explain that `then` returns a **new** promise — that single fact explains chaining, value passing and error propagation.'),
        interviewTip('Expect output puzzles mixing `new Promise` executors, `then` and `console.log`. Remember: executor = sync, handlers = microtasks.'),
      ),
      section('practice', 'Practice',
        steps(
          'Write `delay(ms)` and use it to log "a", wait 100 ms, log "b", wait 100 ms, log "c" with a single chain.',
          'Write `timeout(promise, ms)` that rejects with `new Error("timeout")` if `promise` does not settle in time (hint: a second promise and `Promise.race` — see Module 5).',
        ),
      ),
      section('summary', 'Summary',
        bullets(
          'Promise = pending → fulfilled | rejected, settles once.',
          'Executor runs synchronously; handlers always run as microtasks.',
          '`then` returns a new promise: return values flow, throws reject, returned promises are adopted.',
          '`catch` handles any earlier rejection and can recover.',
          'Always handle rejections; always return promises inside handlers.',
        ),
      ),
    ],
    revisionNotes: [
      'States: pending, fulfilled, rejected (settled = not pending). Settles once.',
      'Executor runs synchronously inside new Promise().',
      'then/catch/finally callbacks are microtasks — never synchronous.',
      'then returns a new promise; throw → rejection; return promise → adoption.',
      'catch(fn) === then(undefined, fn); returning from catch recovers.',
      'Unhandled rejection crashes Node 15+ by default.',
      'Combinators (all/allSettled/race/any) → Module 5.',
    ],
    quiz: [
      {
        kind: 'predict-output', difficulty: 'beginner',
        prompt: 'What does this print?',
        code: dedent(`
          console.log('A');
          new Promise((resolve) => {
            console.log('B');
            resolve();
          }).then(() => console.log('C'));
          console.log('D');
        `),
        options: ['A B C D', 'A D B C', 'A B D C', 'B A D C'],
        answer: 2,
        explanation: 'The executor runs synchronously (B right after A). The `then` handler is a microtask, so it runs after the synchronous `D`.',
      },
      {
        kind: 'predict-output', difficulty: 'intermediate',
        prompt: 'What does this print?',
        code: dedent(`
          Promise.reject(new Error('fail'))
            .then(() => console.log('then 1'))
            .catch((e) => { console.log('catch', e.message); return 42; })
            .then((v) => console.log('then 2', v));
        `),
        options: ['then 1 / catch fail / then 2 42', 'catch fail', 'catch fail / then 2 42', 'catch fail / then 2 undefined'],
        answer: 2,
        explanation: 'The rejection skips `then 1`. The `catch` handles it and returns 42, which fulfils the next promise.',
      },
      {
        kind: 'find-bug', difficulty: 'intermediate',
        prompt: '`saveAll` resolves before the records are saved. Why?',
        code: dedent(`
          function saveAll(records) {
            return db.connect()
              .then(() => {
                db.insertMany(records); // returns a promise
              })
              .then(() => 'saved');
          }
        `),
        options: [
          'db.connect must be awaited',
          'The handler does not return db.insertMany(...), so the chain does not wait for it',
          'then cannot return strings',
          'insertMany needs a callback',
        ],
        answer: 1,
        explanation: 'Without `return`, the handler returns `undefined` and the next step runs immediately. Its rejection would also be unhandled.',
      },
      {
        kind: 'mcq', difficulty: 'beginner',
        prompt: 'What happens if you call resolve() twice in an executor?',
        options: ['The second value replaces the first', 'An error is thrown', 'Only the first call has an effect', 'The promise becomes rejected'],
        answer: 2,
        explanation: 'A promise settles exactly once; subsequent resolve/reject calls are ignored silently.',
      },
    ],
    interview: [
      {
        category: 'javascript', kind: 'concept', difficulty: 'beginner', topic: 'Promises',
        question: 'What is a Promise and what states can it be in?',
        shortAnswer: 'A Promise is an object representing the eventual result of an async operation; it is pending until it settles once as either fulfilled with a value or rejected with a reason.',
        detailedAnswer: [
          'Created with `new Promise((resolve, reject) => {})` or returned by async APIs.',
          'Settled promises never change state again.',
          'Consume with `.then`, `.catch`, `.finally` or `await`.',
          'Handlers always run asynchronously as microtasks.',
          'Unhandled rejections are reported (and crash Node 15+ by default).',
        ],
        followUp: 'Is the executor function synchronous or asynchronous?',
        trap: 'Listing "resolved" as a state — "resolved" means locked in (possibly to another pending promise), not the same as fulfilled.',
      },
      {
        category: 'javascript', kind: 'concept', difficulty: 'intermediate', topic: 'Promises',
        question: 'What happens when a then handler returns a value, returns a promise, or throws?',
        shortAnswer: 'The promise returned by then is fulfilled with a returned value, adopts the state of a returned promise (waiting for it), or is rejected with the thrown error.',
        detailedAnswer: [
          'Return value `v` → next `then` receives `v`.',
          'Return promise/thenable → chain waits; its result or rejection flows on.',
          'Throw → next promise rejects; subsequent `then` fulfilment handlers are skipped until a `catch`.',
          'Returning nothing → next handler gets `undefined` (and does not wait for any inner async work).',
          'This is why each step should `return` its async work.',
        ],
        followUp: 'What is the difference between .then(a, b) and .then(a).catch(b)?',
        trap: 'Thinking `.then(a, b)` catches errors thrown by `a` — it does not; `.catch(b)` after it does.',
      },
      {
        category: 'javascript', kind: 'concept', difficulty: 'advanced', topic: 'Promises',
        question: 'What is a thenable, and what happens when you resolve a promise with another promise?',
        shortAnswer: 'A thenable is any object with a then method; resolving a promise with a thenable makes it adopt that thenable\'s eventual state by calling its then in a separate microtask, so it stays pending until the inner one settles.',
        detailedAnswer: [
          '`resolve(x)` checks whether `x` is an object/function with a `then` method.',
          'If so, the engine queues a "PromiseResolveThenableJob" that calls `x.then(resolve, reject)` — costing extra microtask ticks.',
          'That is why returning a promise from `then` delays the chain by a couple of ticks compared to returning a plain value.',
          '"Resolved" (locked in) is therefore different from "fulfilled".',
          '`Promise.resolve(p)` returns `p` itself if it is already a native promise of the same constructor.',
          'Thenables let libraries (old Bluebird, query builders like Knex) interoperate with `await`.',
        ],
        followUp: 'Why can `await somePromise` take fewer ticks than `return somePromise` in an async function?',
        trap: 'Assuming resolve(promise) fulfils with the promise object as the value.',
      },
    ],
  },

  // ───────────────────────────────────────────────────────────
  'async-await': {
    summary: '`async` functions always return a promise; `await` pauses the async function (not the thread) until a promise settles, then resumes it with the value or throws the rejection — letting asynchronous code read like synchronous code with normal try/catch.',
    topics: ['async function', 'await', 'try/catch with await', 'sequential vs parallel', 'Promise.all', 'return await', 'for...of with await', 'top-level await', 'error handling', 'suspension'],
    sections: [
      section('introduction', undefined,
        text('Promise chains work, but long `.then` sequences get hard to read. `async/await` (ES2017) is syntax on top of promises: you write steps top to bottom, use normal variables, `if`, loops and `try/catch` — and the engine handles the waiting.'),
        note('This lesson covers the language feature. Advanced patterns (concurrency limits, cancellation, combinators) are covered in depth in Module 5.'),
      ),
      section('definition', 'Definition',
        bullets(
          '`async function f() {}` — calling it **always** returns a promise. A `return v` fulfils it with `v`; a `throw` rejects it.',
          '`await expr` — only valid inside async functions (or at the top level of ES modules). It waits for `expr` (a promise or any value) to settle.',
          'If the promise fulfils, `await` evaluates to its value. If it rejects, `await` **throws** the reason at that line.',
          'Arrow functions, methods and class methods can be async: `async (x) => {}`, `async save() {}`.',
        ),
        table('Promise chain vs async/await', ['Promise chain', 'async/await'], [
          ['`getUser(id).then((u) => getOrders(u.id))`', '`const u = await getUser(id); const orders = await getOrders(u.id);`'],
          ['`.catch((err) => ...)`', '`try { ... } catch (err) { ... }`'],
          ['`.finally(() => ...)`', '`finally { ... }`'],
          ['Values passed between handlers', 'Normal local variables'],
        ]),
      ),
      section('why', 'Why use it',
        bullets(
          'Readability: async code looks sequential.',
          'Unified error handling: one `try/catch` covers sync and async failures.',
          'Easier debugging: modern V8 keeps "async stack traces" across awaits.',
          'Loops and conditionals with async steps become trivial (`for...of` + `await`).',
        ),
      ),
      section('internals', 'What really happens at an await',
        steps(
          'Calling an async function creates its result promise and starts running the body **synchronously**, like a normal function.',
          'At `await x`, the engine converts `x` to a promise (`Promise.resolve(x)`-like) and registers a continuation on it.',
          'The async function is **suspended**: its execution context (locals, position) is saved on the heap and popped off the call stack. Control returns to the caller, which receives the pending promise.',
          'Other code keeps running — the thread is not blocked.',
          'When the awaited promise settles, a **microtask** is queued to resume the function from where it left off, restoring its context.',
          'On fulfilment `await` produces the value; on rejection it throws inside the function, where `try/catch` can handle it.',
          'When the body finishes, the function\'s promise settles with the return value (or the uncaught error).',
        ),
        note('Conceptually an async function is a generator that yields promises, driven by a runner that calls `next(value)` when each promise fulfils — that is how Babel used to transpile it.'),
      ),
      section('example', 'Basics',
        code({
          title: 'async functions always return promises',
          code: dedent(`
            async function getNumber() {
              return 42;
            }
            const result = getNumber();
            console.log(result);
            result.then((v) => console.log('resolved with', v));
            console.log(getNumber() instanceof Promise);
          `),
          expectedOutput: 'Promise { 42 }\ntrue\nresolved with 42',
          explanation: [
            'The return value is wrapped in a promise automatically.',
            'You must use `await` or `.then` to get `42` out.',
            'The `then` handler runs after the synchronous logs (microtask).',
          ],
          runnable: true,
        }),
        code({
          title: 'Execution order around await',
          code: dedent(`
            async function task() {
              console.log('2: task starts (sync part)');
              await null;
              console.log('4: after await (microtask)');
            }
            console.log('1: script start');
            task();
            console.log('3: script continues');
          `),
          expectedOutput: '1: script start\n2: task starts (sync part)\n3: script continues\n4: after await (microtask)',
          explanation: [
            'Code before the first `await` runs synchronously when `task()` is called.',
            '`await null` still suspends the function, even though `null` is not a promise.',
            'The caller continues (`3`), then the microtask resumes `task` (`4`).',
          ],
          runnable: true,
        }),
        code({
          title: 'Error handling with try/catch/finally',
          code: dedent(`
            const fetchUser = (id) =>
              new Promise((resolve, reject) =>
                setTimeout(() => (id === 0 ? reject(new Error('User not found')) : resolve({ id })), 10));

            async function handler(id) {
              try {
                const user = await fetchUser(id);
                console.log('found', user);
              } catch (err) {
                console.log('error:', err.message);
              } finally {
                console.log('request done', id);
              }
            }
            handler(1).then(() => handler(0));
          `),
          expectedOutput: 'found { id: 1 }\nrequest done 1\nerror: User not found\nrequest done 0',
          explanation: [
            'A rejected awaited promise throws at the `await` line, jumping to `catch`.',
            '`finally` runs in both cases — ideal for releasing a DB connection or lock.',
          ],
          runnable: true,
        }),
      ),
      section('example', 'Sequential vs parallel',
        code({
          title: 'Do not await independent work one by one',
          code: dedent(`
            const wait = (ms, v) => new Promise((r) => setTimeout(() => r(v), ms));

            async function sequential() {
              const start = Date.now();
              const a = await wait(100, 'a');
              const b = await wait(100, 'b');
              console.log('sequential', a, b, Date.now() - start >= 190);
            }
            async function parallel() {
              const start = Date.now();
              const [a, b] = await Promise.all([wait(100, 'a'), wait(100, 'b')]);
              console.log('parallel', a, b, Date.now() - start < 190);
            }
            sequential().then(parallel);
          `),
          expectedOutput: 'sequential a b true\nparallel a b true',
          explanation: [
            'Sequential: the second wait does not start until the first finishes → ~200 ms.',
            'Parallel: both timers start immediately; `Promise.all` waits for both → ~100 ms.',
            'If the operations are independent (two DB queries, two API calls), start them together.',
            'Use sequential awaits only when a step needs the previous result.',
          ],
          runnable: true,
        }),
        code({
          title: 'Sequential loop when order matters',
          code: dedent(`
            const wait = (ms, v) => new Promise((r) => setTimeout(() => r(v), ms));
            async function migrate(steps) {
              for (const step of steps) {
                const done = await wait(5, step);
                console.log('applied', done);
              }
              return 'all applied';
            }
            migrate(['001-users', '002-orders']).then(console.log);
          `),
          expectedOutput: 'applied 001-users\napplied 002-orders\nall applied',
          explanation: [
            '`for...of` + `await` runs one step at a time, in order — right for migrations or rate-limited APIs.',
            'Do not use `forEach` for this (it does not await).',
          ],
          runnable: true,
        }),
      ),
      section('example', 'return vs return await',
        code({
          title: 'Inside try, return await matters',
          code: dedent(`
            const failing = () => Promise.reject(new Error('db down'));
            async function withoutAwait() {
              try {
                return failing();
              } catch (e) {
                return 'caught inside';
              }
            }
            async function withAwait() {
              try {
                return await failing();
              } catch (e) {
                return 'caught inside';
              }
            }
            withoutAwait()
              .catch((e) => console.log('withoutAwait rejected:', e.message))
              .then(() => withAwait())
              .then((v) => console.log('withAwait:', v));
          `),
          expectedOutput: 'withoutAwait rejected: db down\nwithAwait: caught inside',
          explanation: [
            '`return failing()` hands the promise out; the function exits the `try` before the rejection happens, so its `catch` never runs.',
            '`return await failing()` waits inside the `try`, so the rejection is thrown there and caught.',
            'Outside a try block, `return await` and `return` behave the same (modern V8 makes both cheap).',
          ],
          runnable: true,
        }),
      ),
      section('real-world', 'An async route handler in Node',
        code({
          title: 'Typical service code',
          code: dedent(`
            // Express 5 forwards rejected promises to the error handler automatically;
            // in Express 4 wrap handlers (asyncHandler) or call next(err) yourself.
            app.get('/users/:id/dashboard', async (req, res, next) => {
              try {
                const user = await userRepo.findById(req.params.id);
                if (!user) return res.status(404).json({ error: 'Not found' });

                // independent queries → run in parallel
                const [orders, notifications] = await Promise.all([
                  orderRepo.findByUser(user.id),
                  notificationRepo.unread(user.id),
                ]);
                res.json({ user, orders, notifications });
              } catch (err) {
                next(err);
              }
            });
          `),
          explanation: [
            'Sequential where needed (user first), parallel where possible (orders + notifications).',
            'Errors from any await land in the same `catch`.',
          ],
        }),
        code({
          title: 'Top-level await (ES modules only)',
          code: dedent(`
            // server.mjs
            import { readFile } from 'node:fs/promises';
            const config = JSON.parse(await readFile('./config.json', 'utf8'));
            console.log('starting on', config.port);
          `),
          expectedOutput: 'starting on 3000',
          explanation: [
            'Allowed at module top level in ES modules (Node 14.8+); a SyntaxError in CommonJS files.',
            'In CommonJS, wrap startup code in `async function main() {}` and call `main().catch(...)`.',
          ],
        }),
      ),
      section('mistakes', 'Common mistakes',
        bullets(
          'Forgetting `await`: you get a Promise object instead of the value (`if (await isValid())` vs `if (isValid())` — the latter is always truthy!).',
          'Awaiting independent operations sequentially (slow endpoints).',
          'Using `await` inside `forEach`/`map` callbacks and expecting the outer function to wait.',
          '`return promise` inside `try` when you meant to catch its rejection.',
          'Calling an async function without awaiting or catching it (floating promise → unhandled rejection).',
          '`Promise.all` fails fast — if you need every result regardless of failures, use `Promise.allSettled` (Module 5).',
        ),
        code({
          title: 'The missing await bug',
          code: dedent(`
            async function isAllowed(user) {
              return user.role === 'admin';
            }
            async function check() {
              const user = { role: 'guest' };
              if (isAllowed(user)) console.log('without await: allowed?!');
              if (await isAllowed(user)) console.log('with await: allowed');
              else console.log('with await: denied');
            }
            check();
          `),
          expectedOutput: 'without await: allowed?!\nwith await: denied',
          explanation: ['A Promise object is always truthy — a security bug if used for authorization checks.'],
          runnable: true,
        }),
      ),
      section('interview', 'Interview tips',
        interviewTip('Say clearly: "`await` pauses the async function, not the thread. The rest of the program keeps running."'),
        interviewTip('Be ready to refactor sequential awaits into `Promise.all` and to explain `return await` inside `try`.'),
      ),
      section('practice', 'Practice',
        steps(
          'Convert a `.then` chain that loads a user, then their orders, then sums totals, into async/await with one try/catch.',
          'Write `retry(fn, attempts, delayMs)` with async/await that retries a failing async function.',
        ),
      ),
      section('summary', 'Summary',
        bullets(
          'async functions return promises; `return` fulfils, `throw` rejects.',
          '`await` suspends the function until the promise settles; the thread stays free.',
          'Rejections throw at the `await` — use try/catch/finally.',
          'Parallelise independent work with `Promise.all`; use `for...of` for ordered steps.',
          'Use `return await` inside try blocks.',
        ),
      ),
    ],
    revisionNotes: [
      'async fn → always returns a Promise.',
      'Code before the first await runs synchronously.',
      'await suspends the function; continuation is a microtask.',
      'Rejected await → throws; catch with try/catch.',
      'Independent awaits → Promise.all; ordered → for...of.',
      'return await inside try to catch rejections.',
      'Top-level await: ES modules only.',
    ],
    quiz: [
      {
        kind: 'predict-output', difficulty: 'beginner',
        prompt: 'What does this print?',
        code: "async function f() { return 'x'; }\nconsole.log(typeof f(), f() instanceof Promise);",
        options: ['string false', 'object true', 'function true', 'object false'],
        answer: 1,
        explanation: 'Calling an async function returns a Promise (an object), even when you return a plain string.',
      },
      {
        kind: 'predict-output', difficulty: 'intermediate',
        prompt: 'What does this print?',
        code: dedent(`
          async function run() {
            console.log('A');
            await Promise.resolve();
            console.log('B');
          }
          run();
          console.log('C');
        `),
        options: ['A B C', 'A C B', 'C A B', 'A B'],
        answer: 1,
        explanation: '`A` logs synchronously during the call. `await` suspends `run`, so `C` logs next; `B` runs in a microtask afterwards.',
      },
      {
        kind: 'scenario', difficulty: 'intermediate',
        prompt: 'An endpoint awaits three independent database queries one after another; each takes ~100 ms. How do you reduce latency?',
        options: [
          'Wrap each query in setTimeout',
          'Start all three and await Promise.all([...]) — total ~100 ms',
          'Use await inside forEach',
          'Remove await so they run synchronously',
        ],
        answer: 1,
        explanation: 'Independent operations can run concurrently. `Promise.all` waits for all of them, so the total time is roughly the slowest one, not the sum.',
      },
      {
        kind: 'complete-code', difficulty: 'intermediate',
        prompt: 'Fill the blank so the rejection of `load()` is caught by this function\'s catch block.',
        code: dedent(`
          async function safeLoad() {
            try {
              /* ??? */
            } catch {
              return 'fallback';
            }
          }
        `),
        options: ['return load();', 'load();', 'return await load();', 'return load().then();'],
        answer: 2,
        explanation: 'Only `await` makes the rejection surface inside the `try`. `return load()` exits the try with a pending promise, so its later rejection bypasses the catch.',
      },
    ],
    interview: [
      {
        category: 'javascript', kind: 'concept', difficulty: 'beginner', topic: 'Async/await',
        question: 'What does an async function return, and what does await do?',
        shortAnswer: 'An async function always returns a promise (fulfilled with its return value or rejected with its thrown error); await pauses that function until a promise settles and then gives its value or throws its error.',
        detailedAnswer: [
          'Returning a non-promise wraps it: `return 1` → `Promise<1>`.',
          'Throwing inside → the returned promise rejects.',
          '`await` works on any value; non-promises are wrapped and still cause a (microtask) pause.',
          'Only the async function pauses — the event loop keeps processing other work.',
        ],
        followUp: 'Can you use await outside an async function?',
      },
      {
        category: 'javascript', kind: 'concept', difficulty: 'beginner', topic: 'Async/await',
        question: 'How do you handle errors with async/await?',
        shortAnswer: 'Wrap awaits in try/catch (with finally for cleanup); a rejected promise throws at the await line. Alternatively attach .catch to the call of the async function.',
        detailedAnswer: [
          '`try { await op(); } catch (err) { ... } finally { release(); }`.',
          'Callers can handle errors with `await fn()` in their own try or `fn().catch(...)`.',
          'Without any handler the rejection is unhandled and crashes Node 15+.',
          'Use `return await` inside try blocks when returning a promise you want to catch.',
          'In Express 4, forward errors with `next(err)` or a wrapper; Express 5 handles rejected handlers natively.',
        ],
        followUp: 'What is the difference between return and return await inside a try block?',
      },
      {
        category: 'javascript', kind: 'concept', difficulty: 'intermediate', topic: 'Async/await',
        question: 'How do you run multiple awaits in parallel instead of sequentially, and when should you not?',
        shortAnswer: 'Start the operations first and await them together with Promise.all (or allSettled); keep sequential awaits only when each step depends on the previous result or concurrency must be limited.',
        detailedAnswer: [
          'Sequential: `const a = await f(); const b = await g();` → time = f + g.',
          'Parallel: `const [a, b] = await Promise.all([f(), g()]);` → time ≈ max(f, g).',
          '`Promise.all` rejects on the first failure; use `allSettled` to collect all outcomes.',
          'Unbounded parallelism (thousands of DB calls) can exhaust connection pools — batch or limit concurrency.',
          'Order-sensitive steps (migrations, dependent requests) must stay sequential.',
        ],
        followUp: 'How would you process 10,000 items with at most 5 concurrent requests?',
        trap: 'Thinking `const p1 = f(); const p2 = g(); await p1; await p2;` is sequential — both already started, so it is parallel (but p2\'s rejection may be unhandled while awaiting p1).',
      },
      {
        category: 'javascript', kind: 'concept', difficulty: 'advanced', topic: 'Async/await',
        question: 'What actually happens to the execution context when an async function hits await?',
        shortAnswer: 'The function is suspended: its execution context is saved off the call stack, a reaction is registered on the awaited promise, and control returns to the caller; when the promise settles, a microtask restores the context and resumes execution at the await.',
        detailedAnswer: [
          'The body runs synchronously until the first `await`.',
          'The awaited value is coerced to a promise; V8 (since 7.2) avoids extra wrapper promises for native promises, reducing ticks.',
          'The suspended frame (locals, program counter) lives on the heap as part of the generator-like async function object.',
          'The caller gets the pending result promise immediately.',
          'Resumption happens as a microtask after the current stack empties.',
          'This is the same mechanism generators use for `yield` — async/await is essentially generators + promises.',
        ],
        followUp: 'Why does an await inside a loop not block the event loop?',
        trap: 'Saying await blocks the thread like a synchronous sleep.',
      },
    ],
  },

  // ───────────────────────────────────────────────────────────
  'event-loop-fundamentals': {
    summary: 'The event loop lets single-threaded JavaScript handle async work: synchronous code runs on the call stack, then all microtasks (promise callbacks, queueMicrotask) are drained, then the next macrotask (timer, I/O callback) runs — repeating forever.',
    topics: ['event loop', 'call stack', 'task queue', 'macrotask', 'microtask', 'microtask queue', 'setTimeout', 'queueMicrotask', 'Promise.then', 'run-to-completion', 'blocking', 'starvation'],
    sections: [
      section('introduction', undefined,
        text('JavaScript can do one thing at a time, yet a Node.js server handles thousands of connections. The trick is the **event loop**: long operations are handed to the runtime, and their callbacks are queued and run one by one when the call stack is free.'),
        note('This is the language-level model shared by browsers and Node. Node\'s specific loop **phases** (timers, poll, check…), `process.nextTick` and `setImmediate` are covered in depth in Module 5.'),
      ),
      section('definition', 'The pieces',
        table('Event loop components', ['Component', 'What it holds', 'Examples'], [
          ['Call stack', 'The function frames running right now', 'Your synchronous code'],
          ['Runtime APIs', 'Work happening outside JS (timers, network, file system)', 'libuv in Node, Web APIs in browsers'],
          ['Macrotask (task) queue', 'Callbacks ready to run, one per loop turn', '`setTimeout`, `setInterval`, I/O callbacks, `setImmediate` (Node)'],
          ['Microtask queue', 'High-priority jobs, drained completely after each task', '`Promise.then/catch/finally`, `await` continuations, `queueMicrotask`'],
          ['Event loop', 'The scheduler', 'Moves callbacks from queues to the stack when it is empty'],
        ]),
      ),
      section('why', 'Why this model',
        bullets(
          'No locks, no race conditions inside your JS: a callback is never interrupted by another callback.',
          'Waiting (I/O) costs nothing — the thread is free to run other callbacks meanwhile.',
          'Understanding the queues lets you predict output order — a favourite interview topic.',
          'It explains why CPU-heavy code hurts every request: the loop cannot pick the next callback.',
        ),
      ),
      section('internals', 'One turn of the loop',
        steps(
          'Run the current task (at startup: the whole script) until the call stack is empty.',
          'Drain the **microtask queue**: run every microtask, including microtasks added while draining.',
          'Pick the **next macrotask** whose time has come (e.g. an expired timer or a completed I/O callback) and run it.',
          'Drain microtasks again. (Since Node 11 this happens after **each** timer/immediate callback, matching browsers.)',
          'Repeat. If no work is pending, Node exits; a browser waits for events.',
        ),
        diagram('event-loop-simulator', 'Step through the call stack, microtask queue and macrotask queue.'),
        bullets(
          '`setTimeout(fn, 0)` means "at least 0 ms, then queue it" — it always waits for the stack to empty and all microtasks to drain. Node clamps 0 to 1 ms.',
          'Timers are a **minimum** delay, not exact: a busy stack delays them.',
        ),
      ),
      section('example', 'Predicting output order',
        code({
          title: 'Sync → microtasks → macrotasks',
          code: dedent(`
            console.log('1 sync');
            setTimeout(() => console.log('5 timeout (macrotask)'), 0);
            Promise.resolve().then(() => console.log('3 promise (microtask)'));
            queueMicrotask(() => console.log('4 queueMicrotask'));
            console.log('2 sync');
          `),
          expectedOutput: '1 sync\n2 sync\n3 promise (microtask)\n4 queueMicrotask\n5 timeout (macrotask)',
          explanation: [
            'Both `console.log` calls run first — they are synchronous.',
            'The `then` callback and the `queueMicrotask` callback are microtasks, run in the order they were queued.',
            'The timer callback is a macrotask, so it waits until all microtasks are done.',
          ],
          runnable: true,
        }),
        code({
          title: 'Microtasks run between macrotasks',
          code: dedent(`
            setTimeout(() => {
              console.log('timeout 1');
              Promise.resolve().then(() => console.log('microtask inside timeout 1'));
            }, 0);
            setTimeout(() => console.log('timeout 2'), 0);
            Promise.resolve().then(() => {
              console.log('microtask 1');
              setTimeout(() => console.log('timeout 3 (scheduled by microtask)'), 0);
            });
          `),
          expectedOutput: 'microtask 1\ntimeout 1\nmicrotask inside timeout 1\ntimeout 2\ntimeout 3 (scheduled by microtask)',
          explanation: [
            'After the script: drain microtasks → `microtask 1` (which schedules timeout 3 at the back of the timer queue).',
            'Macrotask: `timeout 1`. It queues a microtask, which runs **before** `timeout 2`.',
            'Then `timeout 2`, then `timeout 3`.',
          ],
          runnable: true,
        }),
        code({
          title: 'async/await mixed in',
          code: dedent(`
            async function a() {
              console.log('A1');
              await b();
              console.log('A2');
            }
            async function b() {
              console.log('B');
            }
            console.log('start');
            setTimeout(() => console.log('timeout'), 0);
            a();
            Promise.resolve().then(() => console.log('then'));
            console.log('end');
          `),
          expectedOutput: 'start\nA1\nB\nend\nA2\nthen\ntimeout',
          explanation: [
            '`a()` runs synchronously until its `await`: logs `A1`, calls `b()` which logs `B` and returns an already-fulfilled promise.',
            '`await` queues the continuation of `a` as a microtask; then `.then` queues another microtask after it.',
            'Sync `end`, then microtasks in FIFO order: `A2`, `then`. Finally the macrotask `timeout`.',
          ],
          runnable: true,
        }),
      ),
      section('example', 'Blocking and starvation',
        code({
          title: 'A busy call stack delays timers',
          code: dedent(`
            const start = Date.now();
            setTimeout(() => {
              const waited = Date.now() - start;
              console.log('timer fired after', waited >= 200 ? '>= 200ms' : '< 200ms');
            }, 10);
            while (Date.now() - start < 200) {}
            console.log('blocking loop done');
          `),
          expectedOutput: 'blocking loop done\ntimer fired after >= 200ms',
          explanation: [
            'The timer expired after 10 ms, but its callback can only run when the stack is empty.',
            'The `while` loop kept the stack busy for 200 ms — in a server, every request would wait too.',
          ],
          runnable: true,
        }),
        code({
          title: 'Microtasks added while draining run before any timer',
          code: dedent(`
            let count = 0;
            function spin() {
              if (count++ < 3) {
                console.log('microtask', count);
                queueMicrotask(spin);
              }
            }
            setTimeout(() => console.log('timeout finally runs'), 0);
            queueMicrotask(spin);
          `),
          expectedOutput: 'microtask 1\nmicrotask 2\nmicrotask 3\ntimeout finally runs',
          explanation: [
            'Each microtask queues another; the loop keeps draining until the queue is empty.',
            'Here it stops after 3. If it never stopped, the timer — and all I/O — would **starve** forever.',
          ],
          runnable: true,
        }),
      ),
      section('real-world', 'What this means for a Node server',
        bullets(
          'An HTTP request arrives → libuv notices the socket is readable → your handler is queued as a callback.',
          'Your handler awaits a DB query → the function suspends, the thread serves other requests.',
          'The DB reply arrives → the continuation is queued → your handler resumes and sends the response.',
          'A synchronous CPU-heavy step (big `JSON.stringify`, sync crypto, a regex with catastrophic backtracking) blocks all of this. Measure event-loop lag in production (`perf_hooks.monitorEventLoopDelay`).',
        ),
        code({
          title: 'Yielding to the event loop during a long job',
          code: dedent(`
            const { setImmediate: yieldToLoop } = require('node:timers/promises');

            async function processAll(items) {
              for (let i = 0; i < items.length; i++) {
                heavyWork(items[i]);
                if (i % 1000 === 0) await yieldToLoop(); // let other callbacks run
              }
            }
          `),
          explanation: [
            'Splitting work into chunks keeps the server responsive.',
            'For truly CPU-bound work, use worker threads (Module 11).',
          ],
        }),
      ),
      section('mistakes', 'Common mistakes',
        bullets(
          'Believing `setTimeout(fn, 0)` runs before promise callbacks.',
          'Thinking `await` blocks the whole program.',
          'Using recursive microtasks / promise loops that never yield (starves I/O).',
          'Assuming timers are exact — they are minimum delays.',
          'Doing heavy synchronous work in request handlers.',
        ),
      ),
      section('interview', 'Interview tips',
        interviewTip('Narrate output puzzles with three columns: call stack, microtask queue, macrotask queue. Move each callback explicitly.'),
        interviewTip('Name examples of each queue: microtasks = promise reactions, await continuations, queueMicrotask; macrotasks = timers, I/O, setImmediate. Mention that `process.nextTick` runs even before promise microtasks in Node (details in Module 5).'),
      ),
      section('practice', 'Practice',
        text('Predict, then run: a script that logs "sync", schedules two timeouts, two promise callbacks, and inside the first promise callback schedules a `queueMicrotask` and a `setTimeout`. Write down the queue contents after each step.'),
      ),
      section('summary', 'Summary',
        bullets(
          'One call stack; the event loop feeds it callbacks when it is empty.',
          'Order: synchronous code → all microtasks → one macrotask → all microtasks → …',
          'Microtasks: promise callbacks, await continuations, queueMicrotask.',
          'Macrotasks: timers, I/O callbacks (and setImmediate in Node).',
          'Blocking the stack blocks everything; endless microtasks starve the loop.',
        ),
      ),
    ],
    revisionNotes: [
      'Sync first, then drain microtasks, then next macrotask.',
      'Microtasks: then/catch/finally, await continuation, queueMicrotask.',
      'Macrotasks: setTimeout/setInterval, I/O callbacks, setImmediate.',
      'Microtask queue drained fully (including newly added) between macrotasks.',
      'Node 11+: microtasks run after each timer callback (same as browsers).',
      'setTimeout delay is a minimum; 0 is clamped to 1 ms in Node.',
      'Phases, nextTick, setImmediate → Module 5.',
    ],
    quiz: [
      {
        kind: 'predict-output', difficulty: 'beginner',
        prompt: 'What does this print?',
        code: dedent(`
          setTimeout(() => console.log('T'), 0);
          Promise.resolve().then(() => console.log('P'));
          console.log('S');
        `),
        options: ['T P S', 'S T P', 'S P T', 'P S T'],
        answer: 2,
        explanation: 'Synchronous `S` first, then the promise microtask `P`, then the timer macrotask `T`.',
      },
      {
        kind: 'predict-output', difficulty: 'intermediate',
        prompt: 'What does this print?',
        code: dedent(`
          setTimeout(() => console.log(1), 0);
          Promise.resolve()
            .then(() => console.log(2))
            .then(() => console.log(3));
          queueMicrotask(() => console.log(4));
          console.log(5);
        `),
        options: ['5 2 3 4 1', '5 2 4 3 1', '5 4 2 3 1', '1 5 2 4 3'],
        answer: 1,
        explanation: 'Sync 5. Microtask queue initially: [then→2, 4]. Running 2 queues then→3 at the end: [4, 3]. So 2, 4, 3, then the timer 1.',
      },
      {
        kind: 'mcq', difficulty: 'intermediate',
        prompt: 'A route handler runs a 3-second synchronous loop. What happens to other incoming requests during those 3 seconds?',
        options: [
          'They are handled by another JS thread',
          'They wait — the event loop cannot run their callbacks until the stack is empty',
          'They are rejected with 503 automatically',
          'They run as microtasks in between loop iterations',
        ],
        answer: 1,
        explanation: 'There is a single JS call stack. Nothing interrupts running synchronous code; other callbacks queue up until it finishes.',
      },
    ],
    interview: [
      {
        category: 'javascript', kind: 'concept', difficulty: 'beginner', topic: 'Event loop',
        question: 'What is the event loop in JavaScript?',
        shortAnswer: 'The mechanism that lets single-threaded JavaScript handle asynchronous work: when the call stack is empty, it runs all pending microtasks and then takes the next callback from the task queue, repeatedly.',
        detailedAnswer: [
          'Async operations are delegated to the runtime (libuv in Node, Web APIs in browsers).',
          'When they complete, their callbacks are queued.',
          'The loop only moves a callback to the stack when the stack is empty (run-to-completion).',
          'Microtasks (promises) are drained before the next macrotask (timers, I/O).',
          'This gives concurrency without multiple JS threads.',
        ],
        followUp: 'Where do the callbacks wait while the stack is busy?',
        trap: 'Saying the event loop is part of V8 — in Node it is provided by libuv; V8 only runs the JS and microtasks.',
      },
      {
        category: 'javascript', kind: 'concept', difficulty: 'intermediate', topic: 'Event loop',
        question: 'What is the difference between microtasks and macrotasks? Give examples of each.',
        shortAnswer: 'Microtasks (promise callbacks, await continuations, queueMicrotask) are drained completely after the current task and before the next one; macrotasks (setTimeout, setInterval, I/O callbacks, setImmediate) run one per loop step.',
        detailedAnswer: [
          'After every macrotask the engine empties the microtask queue, including microtasks added during draining.',
          'So a `then` always beats a `setTimeout(fn, 0)` scheduled at the same time.',
          'Microtasks are good for "right after this, before anything else" work.',
          'Too many chained microtasks can starve timers and I/O.',
          'Node adds `process.nextTick`, a queue that runs even before promise microtasks (Module 5).',
        ],
        code: {
          id: 'm01-micro-macro', language: 'javascript', runnable: true,
          code: dedent(`
            setTimeout(() => console.log('macro'), 0);
            queueMicrotask(() => console.log('micro'));
            console.log('sync');
          `),
          expectedOutput: 'sync\nmicro\nmacro',
        },
        followUp: 'Where does an await continuation go?',
      },
      {
        category: 'javascript', kind: 'output', difficulty: 'intermediate', topic: 'Event loop',
        question: 'Why does Promise.resolve().then(fn) run before setTimeout(fn, 0) even if the timeout was scheduled first?',
        shortAnswer: 'Because promise callbacks are microtasks, which are drained as soon as the current synchronous code finishes, while setTimeout callbacks are macrotasks that run only in a later loop step.',
        detailedAnswer: [
          'Scheduling order does not matter across queues — queue priority does.',
          'After the script ends: microtask queue first, fully drained.',
          'Then the loop reaches the timers and runs the expired timeout.',
          'Within the same queue, callbacks run in FIFO order.',
        ],
        followUp: 'What if the promise callback itself schedules another promise callback?',
      },
      {
        category: 'javascript', kind: 'concept', difficulty: 'advanced', topic: 'Event loop',
        question: 'Can microtasks starve the event loop? How would you detect and avoid it?',
        shortAnswer: 'Yes — the microtask queue is drained to empty before any macrotask, so code that keeps queueing microtasks (recursive promises, endless await loops without real I/O) prevents timers and I/O from ever running.',
        detailedAnswer: [
          'Example: `function loop() { Promise.resolve().then(loop); }` never yields to timers or sockets.',
          'Symptoms: timers never fire, health checks time out, but CPU is at 100%.',
          'Detect with event-loop delay monitoring (`perf_hooks.monitorEventLoopDelay`) and CPU profiles.',
          'Avoid by yielding with a macrotask (`setImmediate`/`setTimeout`) in long loops, batching, or moving CPU work to worker threads.',
          'The same applies even more strongly to recursive `process.nextTick` in Node.',
        ],
        followUp: 'Why is `await` inside a CPU loop not enough to keep a server responsive?',
        trap: 'Assuming `await Promise.resolve()` yields to I/O — it only yields to other microtasks.',
      },
    ],
  },
};

export default content;
