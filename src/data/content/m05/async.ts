import type { ModuleContent } from '../../../types';
import {
  bullets, code, dedent, diagram, flow, interviewTip, note, section, steps, table, text,
} from '../helpers';

const content: Partial<ModuleContent> = {
  // ───────────────────────────────────────────────────────────
  'async-await': {
    summary: 'async functions always return a promise; await pauses only the current function until a promise settles, resuming it later as a microtask — it never blocks the thread.',
    topics: ['async', 'await', 'async function returns promise', 'sequential vs parallel', 'return await', 'top-level await', 'for...of', 'forEach'],
    sections: [
      section('introduction', undefined,
        text('`async`/`await` lets you write promise code that reads like synchronous code: top to bottom, with `try/catch` for errors. It is how almost all modern Node backends are written.'),
      ),
      section('definition', 'Definition',
        bullets(
          '`async function` **always returns a promise**. A returned value fulfills it; a thrown error rejects it.',
          '`await expr` pauses the **current async function** until `expr` (a promise, thenable or plain value) settles, then resumes with its value — or throws its reason.',
          'While paused, the call stack unwinds and the event loop keeps running other work.',
          'Top-level `await` works only in **ES modules** (`.mjs` or `"type": "module"`), not in CommonJS.',
        ),
      ),
      section('why', 'Why it matters',
        bullets(
          'Sequential async logic without nesting or long `.then` chains.',
          'Normal `try/catch/finally`, loops and conditionals work across async steps.',
          'Stack traces include async frames (V8 zero-cost async stack traces) when you use `await`.',
        ),
      ),
      section('internals', 'What await really does',
        steps(
          'The function runs synchronously until the first `await`.',
          '`await v` converts `v` with `PromiseResolve` (native promises are used as-is) and attaches a continuation.',
          'The function returns its own pending promise to the caller; the caller keeps running.',
          'When `v` settles, the continuation is queued as a **microtask**; the function resumes there with its locals intact.',
          'Each `await` of an already-resolved native promise costs exactly **one** microtask tick (since V8 7.2 / Node 12).',
          '`return` resolves the function\'s promise; returning a promise adopts it (extra ticks); `throw` rejects it.',
        ),
        diagram('event-loop-simulator', 'Step through: the code after each await is queued as a microtask, not run inline.'),
      ),
      section('example', 'Examples',
        code({
          title: 'An async function always returns a promise',
          code: dedent(`
            async function getNumber() {
              return 42;
            }
            const result = getNumber();
            console.log(result instanceof Promise);
            result.then((v) => console.log('resolved with', v));
          `),
          expectedOutput: 'true\nresolved with 42',
          explanation: ['Even a plain `return 42` is wrapped in a promise.', 'Callers must `await` or `.then` to get the value.'],
          runnable: true,
        }),
        code({
          title: 'await pauses the function, not the program',
          code: dedent(`
            async function task() {
              console.log('2. task starts (sync part)');
              await null;
              console.log('4. task resumes (microtask)');
            }

            console.log('1. before');
            task();
            console.log('3. after call');
          `),
          expectedOutput: '1. before\n2. task starts (sync part)\n3. after call\n4. task resumes (microtask)',
          explanation: [
            'Code before the first `await` runs synchronously, inside the call.',
            'At `await`, `task` returns a pending promise and the caller continues (`3`).',
            'The continuation runs once the stack is empty.',
          ],
          runnable: true,
        }),
        code({
          title: 'Ordering with nested async calls',
          code: dedent(`
            async function a() {
              console.log('a1');
              await b();
              console.log('a2');
            }
            async function b() {
              console.log('b');
            }

            console.log('start');
            a();
            Promise.resolve().then(() => console.log('p'));
            console.log('end');
          `),
          expectedOutput: 'start\na1\nb\nend\na2\np',
          explanation: [
            '`b()` runs synchronously and returns an already-fulfilled promise.',
            '`await` on a fulfilled native promise queues the continuation immediately — before the `.then` registered on the next line.',
            'So `a2` beats `p` by one position in the microtask queue.',
          ],
          runnable: true,
        }),
        code({
          title: 'Sequential vs parallel awaits',
          code: dedent(`
            const delay = (ms, v) => new Promise((r) => setTimeout(() => r(v), ms));

            async function sequential() {
              const start = Date.now();
              const a = await delay(100, 'a'); // waits 100ms
              const b = await delay(100, 'b'); // then another 100ms
              return [a, b, Date.now() - start >= 180];
            }
            async function parallel() {
              const start = Date.now();
              const pa = delay(100, 'a');     // both timers start now
              const pb = delay(100, 'b');
              const [a, b] = await Promise.all([pa, pb]);
              return [a, b, Date.now() - start < 180];
            }

            (async () => {
              console.log('sequential', await sequential());
              console.log('parallel', await parallel());
            })();
          `),
          expectedOutput: "sequential [ 'a', 'b', true ]\nparallel [ 'a', 'b', true ]",
          explanation: ['Start independent operations first, then await them together.', 'Sequential awaits are only right when step 2 needs step 1\'s result.'],
          runnable: true,
        }),
        code({
          title: 'return vs return await inside try/catch',
          code: dedent(`
            const failing = () => Promise.reject(new Error('db down'));

            async function withoutAwait() {
              try {
                return failing();          // promise escapes the try block
              } catch {
                return 'handled inside';
              }
            }
            async function withAwait() {
              try {
                return await failing();    // rejection is thrown here, inside try
              } catch {
                return 'handled inside';
              }
            }

            (async () => {
              console.log('without await ->', await withoutAwait().catch((e) => 'escaped: ' + e.message));
              console.log('with await    ->', await withAwait().catch((e) => 'escaped: ' + e.message));
            })();
          `),
          expectedOutput: 'without await -> escaped: db down\nwith await    -> handled inside',
          explanation: [
            'Without `await`, the function returns before the promise rejects, so the local `catch` never runs.',
            'Inside `try/catch`, `return await` is required. Outside `try`, `return await` is just style (and keeps the function in async stack traces).',
          ],
          runnable: true,
        }),
      ),
      section('real-world', 'Real-world backend usage',
        code({
          title: 'A typical service method',
          code: dedent(`
            async function placeOrder(userId, items) {
              const [user, stock] = await Promise.all([users.findById(userId), inventory.check(items)]);
              if (!user) throw new NotFoundError('user');
              if (!stock.ok) throw new ConflictError('out of stock');

              const client = await pool.connect();
              try {
                await client.query('BEGIN');
                const order = await orders.insert(client, userId, items);
                await inventory.reserve(client, items);
                await client.query('COMMIT');
                return order;
              } catch (err) {
                await client.query('ROLLBACK');
                throw err;
              } finally {
                client.release(); // always return the connection to the pool
              }
            }
          `),
          explanation: [
            'Independent reads run in parallel; dependent writes run in sequence.',
            '`try/catch/finally` gives transactional cleanup that would be awkward with callbacks.',
          ],
        }),
        code({
          title: 'Top-level await (ES modules only)',
          code: dedent(`
            // server.mjs
            import { readFile } from 'node:fs/promises';

            const config = JSON.parse(await readFile('./config.json', 'utf8'));
            console.log('port', config.port);
          `),
          expectedOutput: 'port 3000',
          explanation: ['Allowed at module top level in ESM. In CommonJS it is a `SyntaxError` — wrap the code in an async `main()` instead.'],
          versionNote: 'Top-level await: Node 14.8+ in ES modules.',
        }),
      ),
      section('mistakes', 'Common mistakes',
        bullets(
          '**Forgotten `await`**: you get a pending promise instead of a value, and errors become unhandled rejections.',
          '**`async` callback in `forEach`**: `forEach` ignores the returned promises, so nothing waits.',
          'Accidental serialisation: awaiting independent calls one by one.',
          '`return` without `await` inside `try/catch`.',
          'Calling an async function from top-level CommonJS without `.catch`.',
        ),
        code({
          title: 'Wrong: forgotten await',
          code: dedent(`
            async function getUser() { return { name: 'Ada', isAdmin: false }; }

            async function handler() {
              const user = getUser();          // missing await
              if (user.isAdmin) console.log('admin!');
              console.log('name:', user.name);
              console.log('is a promise:', user instanceof Promise);
            }
            handler();
          `),
          expectedOutput: 'name: undefined\nis a promise: true',
          explanation: ['`user` is a Promise; its `.name` and `.isAdmin` are `undefined`. Lint with `@typescript-eslint/no-floating-promises` or `require-await` to catch this.'],
          runnable: true,
        }),
        code({
          title: 'Wrong vs right: async in forEach',
          code: dedent(`
            const delay = (ms) => new Promise((r) => setTimeout(r, ms));

            async function wrong(ids) {
              ids.forEach(async (id) => {
                await delay(10);
                console.log('processed', id);
              });
              console.log('wrong: all done?');
            }

            async function right(ids) {
              for (const id of ids) {          // sequential; use Promise.all(ids.map(...)) for parallel
                await delay(10);
                console.log('processed', id);
              }
              console.log('right: all done');
            }

            wrong([1, 2]).then(() => delay(50)).then(() => right([3, 4]));
          `),
          expectedOutput: 'wrong: all done?\nprocessed 1\nprocessed 2\nprocessed 3\nprocessed 4\nright: all done',
          explanation: [
            '`forEach` calls each async callback and throws the returned promise away — "all done?" prints first.',
            'Errors inside those callbacks would also be unhandled rejections.',
            '`for...of` with `await` processes items in order; `Promise.all(ids.map(...))` processes them in parallel.',
          ],
          runnable: true,
        }),
      ),
      section('interview', 'Interview angle',
        interviewTip('Interviewers love asking "what does `await` actually do?". Answer: it splits the function into a synchronous part and continuations scheduled as microtasks; the thread is never blocked.'),
        table('await in loops', ['Pattern', 'Waits?', 'Concurrency'], [
          ['`for...of` + `await`', 'Yes', 'One at a time'],
          ['`await Promise.all(arr.map(fn))`', 'Yes', 'All at once'],
          ['`arr.forEach(async ...)`', '**No**', 'All at once, unobserved'],
          ['`for await...of`', 'Yes', 'One at a time over an async iterable (streams)'],
        ]),
      ),
      section('practice', 'Practice',
        steps(
          'Rewrite a three-step `.then` chain using `async`/`await` with one `try/catch`.',
          'Write `retry(fn, attempts, delayMs)` that awaits `fn()` and retries with exponential backoff.',
        ),
      ),
      section('summary', 'Summary',
        bullets(
          'async functions always return promises.',
          'await suspends the function, not the thread; resumption is a microtask.',
          'Start independent work first, then `await Promise.all`.',
          'Never use `forEach` with async callbacks.',
          'Use `return await` inside `try/catch`.',
        ),
      ),
    ],
    revisionNotes: [
      'async function → always a promise; `throw` → rejection.',
      'Code before the first await runs synchronously.',
      'await on a resolved native promise = 1 microtask tick.',
      'Top-level await only in ESM.',
      '`forEach(async ...)` does not wait — use `for...of` or `Promise.all(map)`.',
      '`return await` matters inside try/catch.',
    ],
    quiz: [
      {
        kind: 'predict-output', difficulty: 'intermediate',
        prompt: 'What is the output?',
        code: "async function f() {\n  console.log('f1');\n  await null;\n  console.log('f2');\n}\nconsole.log('s');\nf();\nPromise.resolve().then(() => console.log('p'));\nconsole.log('e');",
        options: ['s f1 f2 p e', 's f1 e f2 p', 's f1 e p f2', 's e f1 f2 p'],
        answer: 1,
        explanation: '`f1` is synchronous. At `await null`, `f` suspends and its continuation is queued first; then `p` is queued; `e` prints; then microtasks run in order: `f2`, `p`.',
      },
      {
        kind: 'predict-output', difficulty: 'beginner',
        prompt: 'What does this log?',
        code: "async function load() { return 'data'; }\nconsole.log(load());",
        options: ["'data'", 'undefined', "Promise { 'data' }", 'SyntaxError'],
        answer: 2,
        explanation: 'An async function returns a promise. Node\'s `console.log` shows an already-fulfilled promise as `Promise { \'data\' }`. To get the string you must `await load()`.',
      },
      {
        kind: 'find-bug', difficulty: 'intermediate',
        prompt: 'The endpoint responds with `{ saved: 3 }` before any row is written, and DB errors crash the process. Why?',
        code: "app.post('/bulk', async (req, res) => {\n  req.body.rows.forEach(async (row) => {\n    await db.insert(row);\n  });\n  res.json({ saved: req.body.rows.length });\n});",
        options: [
          '`db.insert` should be called without `await`',
          '`forEach` does not await async callbacks; their promises (and rejections) are dropped',
          '`res.json` must be awaited',
          'Arrow functions cannot be async',
        ],
        answer: 1,
        explanation: 'Use `await Promise.all(rows.map((r) => db.insert(r)))` or a `for...of` loop. With `forEach`, inserts run unobserved and any rejection is unhandled (crash on Node 15+).',
      },
      {
        kind: 'predict-output', difficulty: 'advanced',
        prompt: 'What is logged?',
        code: "async function f() {\n  try {\n    return Promise.reject(new Error('x'));\n  } catch {\n    return 'caught';\n  }\n}\nf().then((v) => console.log('ok', v), (e) => console.log('err', e.message));",
        options: ['ok caught', 'err x', 'ok undefined', 'Nothing — it is an unhandled rejection'],
        answer: 1,
        explanation: 'The promise is returned (not awaited) so it rejects after `f` has left the `try`. The caller\'s rejection handler receives it. With `return await`, the local `catch` would have produced `ok caught`.',
      },
    ],
    interview: [
      {
        category: 'javascript', kind: 'concept', difficulty: 'beginner', topic: 'async/await',
        question: 'What does an async function return, and what happens if it throws?',
        shortAnswer: 'It always returns a promise. A returned value fulfills that promise; a thrown error rejects it instead of throwing to the caller synchronously.',
        detailedAnswer: [
          '`async function f() { return 1 }` → `f()` is `Promise<1>`.',
          'Returning a promise makes the outer promise adopt it.',
          'A throw anywhere in the body (even before any await) becomes a rejection.',
          'So a sync `try/catch` around `f()` without `await` will not catch it.',
        ],
        followUp: 'How do you call an async function from top-level CommonJS code safely?',
        trap: 'Thinking that an async function without any `await` returns a plain value.',
      },
      {
        category: 'javascript', kind: 'output', difficulty: 'intermediate', topic: 'async/await',
        question: 'Predict the output of nested async calls mixed with a promise callback.',
        code: {
          id: 'm05-int-async-order',
          language: 'javascript',
          code: "async function outer() {\n  console.log('outer start');\n  await inner();\n  console.log('outer end');\n}\nasync function inner() {\n  console.log('inner');\n}\nsetTimeout(() => console.log('timeout'), 0);\nouter();\nPromise.resolve().then(() => console.log('then'));\nconsole.log('sync');",
          expectedOutput: 'outer start\ninner\nsync\nouter end\nthen\ntimeout',
          runnable: true,
        },
        shortAnswer: '`outer start`, `inner`, `sync`, `outer end`, `then`, `timeout`. Everything up to the first await is sync; the await continuation is queued before the `.then`; the timer runs last.',
        detailedAnswer: [
          '`outer()` runs synchronously into `inner()`, which logs and returns a fulfilled promise.',
          '`await` queues `outer`\'s continuation as a microtask immediately.',
          'The `.then` callback is queued after it.',
          'After `sync`, microtasks drain in FIFO order, then the timers phase runs `timeout`.',
        ],
        followUp: 'How would the order change if inner() itself contained an await?',
        trap: 'Putting `outer end` immediately after `inner`, as if `await` on a resolved promise continued synchronously.',
      },
      {
        category: 'javascript', kind: 'concept', difficulty: 'advanced', topic: 'async/await',
        question: 'Is `return await promise` redundant inside an async function?',
        shortAnswer: 'Not always. Inside a `try/catch`/`finally` it is required, otherwise rejections escape the try block and `finally` runs before the promise settles. Elsewhere it is mostly stylistic, but it keeps the function in async stack traces.',
        detailedAnswer: [
          'Without await, the function returns immediately and the promise is adopted by the outer promise.',
          'Rejections then occur outside the try block, so local catch/finally logic is skipped or runs too early.',
          'With await, the rejection is thrown at that line, inside the try.',
          'Modern V8 makes `return await` cheap; older lint rules (`no-return-await`) were deprecated for this reason.',
          'It also improves stack traces, since the frame stays on the async stack.',
        ],
        followUp: 'Why might a connection be released to the pool too early when using `return` without await inside try/finally?',
        trap: 'Repeating the old advice "`return await` is always redundant".',
      },
    ],
  },

  // ───────────────────────────────────────────────────────────
  'error-handling-in-asynchronous-code': {
    summary: 'Each async style has its own error channel — err arguments, promise rejections, try/catch around await, error events — and unhandled rejections crash the process by default since Node 15.',
    topics: ['error handling', 'try/catch', 'unhandledRejection', 'uncaughtException', 'error-first', 'rejection', 'Node 15', 'callbackify', 'Express async errors'],
    sections: [
      section('introduction', undefined,
        text('A synchronous `try/catch` only catches errors thrown **while it is on the call stack**. Async work finishes later, on a fresh stack, so errors must travel through a dedicated channel — or they crash your server.'),
      ),
      section('definition', 'Error channels by style',
        table('Where async errors go', ['Style', 'Error channel', 'How you handle it'], [
          ['Callback', 'First argument `err`', '`if (err) return ...`'],
          ['Promise', 'Rejection', '`.catch()` or second arg of `.then`'],
          ['async/await', 'Thrown at the `await`', '`try/catch` around the `await`'],
          ['EventEmitter / stream', '`\'error\'` event', '`emitter.on(\'error\', fn)` (unhandled `error` event throws)'],
          ['Anything missed', 'Process events', '`unhandledRejection`, `uncaughtException` (log + exit)'],
        ]),
      ),
      section('why', 'Why it matters',
        bullets(
          '**Since Node 15**, an unhandled promise rejection is raised as an uncaught exception: the process prints the error and exits with code 1.',
          'An uncaught exception leaves the process in an unknown state — the only safe action is to log and restart.',
          'Lost errors (swallowed `.catch(() => {})`) are worse: the system silently does the wrong thing.',
        ),
      ),
      section('internals', 'What happens to an unhandled error',
        steps(
          'A promise rejects with no handler attached.',
          'After the microtask queue drains, Node checks its list of "pending unhandled rejections".',
          'It emits `process.on(\'unhandledRejection\', (reason, promise))` if you listen.',
          'With the default mode `--unhandled-rejections=throw`, if no listener handled it, the rejection is thrown as an uncaught exception.',
          'If no `uncaughtException` handler exists, Node prints the stack and exits with code 1.',
        ),
        flow(['Promise rejects, no handler', 'microtasks drain', 'unhandledRejection event', 'no listener: thrown as uncaught exception', 'process exits (code 1)'], { title: 'Default behaviour (Node 15+)', direction: 'vertical' }),
        note('Modes for `--unhandled-rejections`: `throw` (default since Node 15), `strict`, `warn`, `warn-with-error-code`, `none`. Before Node 15 the default only printed a warning.'),
      ),
      section('example', 'Examples',
        code({
          title: 'try/catch does not reach into a later callback',
          code: dedent(`
            try {
              setTimeout(() => {
                try {
                  throw new Error('inside timer');
                } catch (e) {
                  console.log('caught inside the callback:', e.message);
                }
              }, 0);
            } catch (e) {
              console.log('outer catch never sees it');
            }
            console.log('outer try finished');
          `),
          expectedOutput: 'outer try finished\ncaught inside the callback: inside timer',
          explanation: [
            'The outer try block finishes before the timer fires.',
            'Error handling must live **inside** the callback (or the error must be passed/rejected).',
          ],
          runnable: true,
        }),
        code({
          title: 'Without the inner try/catch the process crashes',
          code: dedent(`
            try {
              setTimeout(() => { throw new Error('boom'); }, 0);
            } catch (e) {
              console.log('caught', e.message); // never runs
            }
          `),
          expectedOutput: dedent(`
            /app/crash.js:2
              setTimeout(() => { throw new Error('boom'); }, 0);
                                 ^

            Error: boom
                at Timeout._onTimeout (/app/crash.js:2:28)
                at listOnTimeout (node:internal/timers:581:17)
                at process.processTimers (node:internal/timers:519:7)

            Node.js v20.20.2
          `),
          explanation: ['The throw happens in the timers phase with no try/catch on the stack → uncaught exception → exit code 1.', 'Paths, line numbers and the version line depend on your machine.'],
        }),
        code({
          title: 'try/catch works with await',
          code: dedent(`
            const findUser = async (id) => {
              if (id !== 1) throw new Error('user ' + id + ' not found');
              return { id, name: 'Ada' };
            };

            async function main() {
              for (const id of [1, 2]) {
                try {
                  const user = await findUser(id);
                  console.log('found', user.name);
                } catch (err) {
                  console.log('error:', err.message);
                } finally {
                  console.log('done with', id);
                }
              }
            }
            main();
          `),
          expectedOutput: 'found Ada\ndone with 1\nerror: user 2 not found\ndone with 2',
          explanation: ['The rejection is re-thrown at the `await` line, inside the try block.', '`finally` runs for both outcomes — ideal for releasing resources.'],
          runnable: true,
        }),
        code({
          title: 'Unhandled rejection crashes the process (Node 15+)',
          code: dedent(`
            Promise.reject(new Error('db connection lost'));
            setTimeout(() => console.log('never printed'), 100);
          `),
          expectedOutput: dedent(`
            /app/unhandled.js:1
            Promise.reject(new Error('db connection lost'));
                           ^

            Error: db connection lost
                at Object.<anonymous> (/app/unhandled.js:1:16)
                ...

            Node.js v20.20.2
          `),
          explanation: [
            'No handler is attached by the time the microtask queue drains, so Node throws it.',
            'The timer never fires; exit code is 1.',
            'Rejecting with a non-Error (e.g. a string) produces `UnhandledPromiseRejection: ... The promise rejected with the reason "..."` with `code: \'ERR_UNHANDLED_REJECTION\'` — another reason to always reject with `Error` objects.',
          ],
          versionNote: 'Node 15+ default. Node ≤14 printed `UnhandledPromiseRejectionWarning` and kept running.',
        }),
        code({
          title: 'Last-resort process handlers',
          code: dedent(`
            process.on('unhandledRejection', (reason) => {
              logger.error({ err: reason }, 'unhandledRejection');
              throw reason; // escalate to uncaughtException → one shutdown path
            });

            process.on('uncaughtException', (err, origin) => {
              logger.fatal({ err, origin }, 'uncaughtException — shutting down');
              server.close(() => process.exit(1)); // stop accepting, finish in-flight requests
              setTimeout(() => process.exit(1), 10_000).unref(); // hard deadline
            });
          `),
          explanation: [
            'These handlers are for **logging and graceful shutdown**, not for "keep running".',
            'A process manager (systemd, Docker, Kubernetes, PM2) restarts the process.',
          ],
        }),
      ),
      section('real-world', 'Real-world backend usage',
        bullets(
          '**Express 4** does not catch rejected promises from async handlers — wrap them or call `next(err)` in a `catch`. **Express 5** forwards rejected promises to the error middleware automatically. (Express behaviour, not Node core.)',
          'Use typed errors (`class NotFoundError extends Error`) and map them to HTTP status codes in one error middleware.',
          'Attach `cause`: `throw new Error(\'failed to load profile\', { cause: err })` keeps the original error (Node 16.9+).',
          'Always add an `\'error\'` listener to streams, sockets and emitters — an unhandled `\'error\'` event throws.',
        ),
        code({
          title: 'Express 4 async wrapper',
          code: dedent(`
            const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

            app.get('/users/:id', asyncHandler(async (req, res) => {
              const user = await users.findById(req.params.id);
              if (!user) throw new NotFoundError('user');
              res.json(user);
            }));

            app.use((err, req, res, next) => {
              res.status(err.status ?? 500).json({ error: err.message });
            });
          `),
          explanation: ['Any throw or rejection inside the handler reaches the error middleware instead of becoming an unhandled rejection.'],
        }),
      ),
      section('mistakes', 'Common mistakes',
        bullets(
          'Wrapping an async call in try/catch **without** `await`.',
          'Swallowing errors: `.catch(() => {})` or `catch (e) {}` with no logging.',
          'Mixing callbacks and promises: calling a callback inside `.then` so the callback\'s own errors are caught by the promise and the callback runs twice.',
          'Rejecting with strings instead of `Error` objects (no stack trace).',
          'Using `uncaughtException` to keep a broken process alive.',
        ),
        code({
          title: 'Wrong: callback inside a promise chain is called twice',
          code: dedent(`
            function getUser(id, cb) {
              Promise.resolve({ id })
                .then((user) => cb(null, user))
                .catch((err) => cb(err)); // also catches errors thrown BY cb!
            }

            getUser(1, (err, user) => {
              console.log('callback called, err =', err ? err.message : null);
              if (!err) throw new Error('bug in caller');
            });
          `),
          expectedOutput: 'callback called, err = null\ncallback called, err = bug in caller',
          explanation: ['The caller\'s bug is caught by `.catch` and fed back into the same callback.', 'Fix: use `.then(onOk, onErr)` and call the callback outside the promise chain, e.g. `process.nextTick(cb, null, user)`, or use `util.callbackify`.'],
          runnable: true,
        }),
        code({
          title: 'Right: bridge with util.callbackify',
          code: dedent(`
            const { callbackify } = require('node:util');

            async function getUserAsync(id) {
              return { id };
            }
            const getUser = callbackify(getUserAsync);

            getUser(1, (err, user) => {
              console.log(err, user);
            });
          `),
          expectedOutput: 'null { id: 1 }',
          explanation: ['`callbackify` calls the callback via `process.nextTick`, outside the promise chain, so a throw in the callback surfaces as a normal uncaught exception instead of a second call.'],
        }),
        code({
          title: 'Wrong vs right: try/catch without await',
          code: dedent(`
            const save = async () => { throw new Error('disk full'); };

            async function wrong() {
              try {
                return save().catch(() => 'caught by .catch, not by try');
              } catch {
                return 'never';
              }
            }
            async function right() {
              try {
                await save();
              } catch (err) {
                return 'try/catch caught: ' + err.message;
              }
            }

            wrong().then(console.log);
            right().then(console.log);
          `),
          expectedOutput: 'try/catch caught: disk full\ncaught by .catch, not by try',
          explanation: [
            'In `wrong`, the try block finishes synchronously; only the chained `.catch` saves it (without it, the rejection would be unhandled).',
            '`right` awaits inside try, so the rejection is thrown into the catch.',
            '`right` logs first because its rejection reaches `catch` in fewer microtask ticks than `wrong` adopting a returned promise.',
          ],
          runnable: true,
        }),
      ),
      section('interview', 'Interview angle',
        interviewTip('State the Node 15 change precisely: unhandled rejections now crash the process (default `--unhandled-rejections=throw`). Then explain why `uncaughtException` handlers should log and exit, not resume.'),
      ),
      section('practice', 'Practice',
        steps(
          'Write a script with one unhandled rejection. Run it with default flags, then with `--unhandled-rejections=warn`, and compare exit codes (`echo $?`).',
          'Add a global handler that logs the error with its `cause` chain and exits with code 1.',
        ),
      ),
      section('summary', 'Summary',
        bullets(
          'try/catch only catches errors from code on the current stack — or from `await`.',
          'Callbacks: `err` argument. Promises: `.catch`. await: try/catch. Emitters: `\'error\'` event.',
          'Unhandled rejections crash the process by default (Node 15+).',
          'Process-level handlers are for logging and graceful shutdown.',
          'Reject with `Error` objects; use `cause` to chain.',
        ),
      ),
    ],
    revisionNotes: [
      'Sync try/catch cannot catch errors thrown in later callbacks.',
      'try/catch + `await` catches rejections.',
      'Node 15+: unhandled rejection → uncaught exception → exit code 1 (`--unhandled-rejections=throw`).',
      '`process.on(\'unhandledRejection\')` / `\'uncaughtException\'`: log, then exit.',
      'Unhandled `\'error\'` event on an EventEmitter throws.',
      'Express 4 needs a wrapper for async handlers; Express 5 handles rejections.',
      'Never call a callback inside `.then` that is followed by `.catch` (double call).',
    ],
    quiz: [
      {
        kind: 'predict-output', difficulty: 'intermediate',
        prompt: 'What happens when this CommonJS script runs on Node 20?',
        code: "async function fail() { throw new Error('nope'); }\ntry {\n  fail();\n  console.log('no error thrown synchronously');\n} catch (e) {\n  console.log('caught', e.message);\n}",
        options: [
          "Prints 'caught nope'",
          "Prints 'no error thrown synchronously' and exits normally",
          "Prints 'no error thrown synchronously', then the process crashes with the unhandled rejection 'nope'",
          'Nothing is printed',
        ],
        answer: 2,
        explanation: '`fail()` returns a rejected promise instead of throwing, so the catch block never runs. Nobody handles the rejection, so on Node 15+ it is raised as an uncaught exception and the process exits with code 1.',
      },
      {
        kind: 'predict-output', difficulty: 'beginner',
        prompt: 'What is printed?',
        code: "async function fail() { throw new Error('nope'); }\n(async () => {\n  try {\n    await fail();\n    console.log('after');\n  } catch (e) {\n    console.log('caught', e.message);\n  }\n})();",
        options: ['after', 'caught nope', 'after, then caught nope', 'Unhandled rejection crash'],
        answer: 1,
        explanation: 'With `await`, the rejection is thrown at that line, so `after` is skipped and the catch block runs.',
      },
      {
        kind: 'mcq', difficulty: 'intermediate',
        prompt: 'What is the default behaviour of an unhandled promise rejection in Node.js 15 and later?',
        options: [
          'A deprecation warning is printed and the process continues',
          'It is silently ignored',
          'It is raised as an uncaught exception; without a handler the process exits with code 1',
          'The promise is automatically retried',
        ],
        answer: 2,
        explanation: 'Node 15 changed the default `--unhandled-rejections` mode to `throw`. Older versions printed `UnhandledPromiseRejectionWarning` and kept running.',
      },
      {
        kind: 'find-bug', difficulty: 'advanced',
        prompt: 'Users report the callback sometimes runs twice. What is the bug?',
        code: "function loadConfig(cb) {\n  readFile('config.json', 'utf8')   // fs/promises\n    .then((text) => cb(null, JSON.parse(text)))\n    .catch(cb);\n}",
        options: [
          '`readFile` needs a callback',
          'If `JSON.parse` throws or `cb` itself throws, `.catch(cb)` calls `cb` a second time',
          '`cb` must be called with `await`',
          '`.catch` must come before `.then`',
        ],
        answer: 1,
        explanation: 'The `.catch` covers everything above it — including the success callback. Parse first, then call the callback outside the chain (`.then(onOk, onErr)` + `process.nextTick`), or use `util.callbackify`.',
      },
    ],
    interview: [
      {
        category: 'javascript', kind: 'concept', difficulty: 'intermediate', topic: 'Async errors',
        question: 'Why can\'t a try/catch around setTimeout catch an error thrown inside the timer callback?',
        shortAnswer: 'Because the try block has already finished when the callback runs. The callback is invoked later by the event loop on a new call stack where no try/catch is active.',
        detailedAnswer: [
          'try/catch is lexical and synchronous: it only covers code executing while it is on the stack.',
          '`setTimeout` just registers the callback and returns.',
          'The throw happens during the timers phase → uncaught exception → crash.',
          'Fix: handle errors inside the callback, pass them to a callback, or wrap in a promise and use `await`.',
        ],
        followUp: 'Why does try/catch work with `await` then?',
        trap: 'Saying it is because of "different threads" — it is the same thread, a different stack.',
      },
      {
        category: 'nodejs', kind: 'concept', difficulty: 'advanced', topic: 'Async errors',
        question: 'What happens to an unhandled promise rejection in modern Node.js, and how should a production service handle it?',
        shortAnswer: 'Since Node 15 it is raised as an uncaught exception and the process exits with code 1. Production services should register handlers that log with context, shut down gracefully, and let a process manager restart them.',
        detailedAnswer: [
          'Default mode `--unhandled-rejections=throw`: emit `unhandledRejection`; if unhandled, throw as uncaught exception.',
          'Before Node 15, only a warning was printed — bugs went unnoticed.',
          'Handlers: log the reason (with `cause`), stop accepting traffic, finish in-flight requests, exit non-zero.',
          'Do not "resume" after `uncaughtException`: state may be corrupt (half-applied updates, leaked locks).',
          'Prevent: lint for floating promises, always `await` or `.catch`, wrap Express 4 handlers.',
        ],
        followUp: 'What is the `rejectionhandled` event, and when does it fire?',
        trap: 'Suggesting `process.on(\'uncaughtException\', () => {})` to keep the server alive.',
      },
      {
        category: 'nodejs', kind: 'concept', difficulty: 'advanced', topic: 'Async errors',
        question: 'What goes wrong when you mix callbacks and promises in one API, and how do you bridge the two styles safely?',
        shortAnswer: 'Calling a callback inside a `.then` that is followed by `.catch` makes the promise catch the callback\'s own errors and call it again, or swallows them. Bridge with `util.promisify`/`util.callbackify`, or invoke the callback outside the chain via `process.nextTick`.',
        detailedAnswer: [
          'Double invocation: `.then(v => cb(null, v)).catch(cb)` → a throw in `cb` triggers `cb(err)`.',
          'Swallowed errors: without `.catch`, a throw in the callback becomes an unhandled rejection instead of a normal exception.',
          'Zalgo: some paths call back synchronously, others asynchronously.',
          '`util.callbackify` calls the callback via `process.nextTick`, so callback errors surface as uncaught exceptions as expected.',
          'Pick one style per layer: promises internally, adapters at the edges.',
        ],
        followUp: 'How does callbackify handle a promise rejected with a falsy value like null?',
        trap: 'Thinking "just add a .catch at the end" fixes it — that is what causes the double call.',
      },
    ],
  },
};

export default content;
