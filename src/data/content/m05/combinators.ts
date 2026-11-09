import type { ModuleContent } from '../../../types';
import {
  bullets, code, dedent, flow, interviewTip, section, steps, table, text, warn,
} from '../helpers';

const combinatorTable = table('The four promise combinators', ['', 'Resolves when', 'Rejects when', 'Result'], [
  ['`Promise.all`', 'all fulfill', 'the first one rejects (fail-fast)', 'array of values, input order'],
  ['`Promise.allSettled`', 'all settle', 'never', 'array of `{ status, value | reason }`'],
  ['`Promise.race`', 'the first one settles (fulfill **or** reject)', 'the first one settles by rejecting', 'that single value / reason'],
  ['`Promise.any`', 'the first one fulfills', 'all reject', 'that value, or `AggregateError`'],
]);

const content: Partial<ModuleContent> = {
  // ───────────────────────────────────────────────────────────
  'promise-all': {
    summary: 'Promise.all waits for every promise to fulfill and gives you their values in input order — or rejects as soon as any one of them rejects.',
    topics: ['Promise.all', 'parallel', 'fail-fast', 'concurrency', 'concurrency limit', 'input order'],
    sections: [
      section('introduction', undefined,
        text('A dashboard needs the user, their orders and their notifications. These requests are independent — running them one after another wastes time. `Promise.all` lets you wait for all of them at once.'),
      ),
      section('definition', 'Definition',
        bullets(
          '`Promise.all(iterable)` returns a promise that fulfills with an **array of values in the same order as the input** once every element fulfills.',
          'It **rejects immediately** with the reason of the first element to reject (fail-fast).',
          'Non-promise values are treated as already-fulfilled (`Promise.resolve(value)`).',
          '`Promise.all([])` fulfills with `[]`.',
        ),
        combinatorTable,
      ),
      section('why', 'Why use it',
        bullets(
          'Total time ≈ the **slowest** operation instead of the **sum** of all operations.',
          'You get a single promise to await and a single error path.',
          'Fail-fast is right when you need *every* result to continue (e.g. building one response).',
        ),
      ),
      section('internals', 'How it works',
        steps(
          'For each element, `Promise.all` calls `Promise.resolve(element).then(onFulfilled, onRejected)`.',
          'Each `onFulfilled` writes its value into `results[index]` and decrements a counter.',
          'When the counter reaches zero, the outer promise fulfills with `results`.',
          'The first `onRejected` call rejects the outer promise. Later results/rejections are ignored.',
          '`Promise.all` **does not cancel** anything. The other operations keep running — promises are not cancellable.',
          'Because it attaches handlers to every element, later rejections do not become unhandled rejections.',
        ),
        warn('`Promise.all` does not *start* work. Promises start running when they are created; `Promise.all` only waits for them. That is why `Promise.all(ids.map(fetchUser))` starts every request at once.'),
      ),
      section('example', 'Examples',
        code({
          title: 'Parallel waits, ordered results',
          code: dedent(`
            const finished = [];
            const delay = (ms, v) => new Promise((r) => setTimeout(() => { finished.push(v); r(v); }, ms));

            Promise.all([delay(60, 'users'), delay(20, 'orders'), 42]).then((results) => {
              console.log('results:', results);
              console.log('completion order:', finished);
            });
          `),
          expectedOutput: "results: [ 'users', 'orders', 42 ]\ncompletion order: [ 'orders', 'users' ]",
          explanation: [
            '`orders` finishes first, but results keep the **input** order.',
            '`42` is not a promise; it is wrapped and counts as fulfilled.',
            'Both timers run at the same time, so the total time is the slowest item (~60 ms), not the sum (80 ms).',
          ],
          runnable: true,
        }),
        code({
          title: 'Fail-fast — but the others keep running',
          code: dedent(`
            const delay = (ms, v) => new Promise((r) => setTimeout(() => r(v), ms));
            const fail = (ms, msg) => new Promise((_, reject) => setTimeout(() => reject(new Error(msg)), ms));

            Promise.all([
              delay(50, 'a'),
              fail(10, 'b failed'),
              delay(30, 'c').then((v) => { console.log('c still finished'); return v; }),
            ])
              .then((r) => console.log('results', r))
              .catch((e) => console.log('Promise.all rejected:', e.message));
          `),
          expectedOutput: 'Promise.all rejected: b failed\nc still finished',
          explanation: [
            'At 10 ms `b` rejects and `Promise.all` rejects immediately.',
            'At 30 ms `c` still completes — nothing was cancelled. In a real app this could be a DB write that still happens.',
          ],
          runnable: true,
        }),
        code({
          title: 'Sequential await vs Promise.all',
          code: dedent(`
            const delay = (ms, v) => new Promise((r) => setTimeout(() => r(v), ms));

            async function sequential() {
              const start = Date.now();
              await delay(100, 'user');
              await delay(100, 'orders');
              return Date.now() - start >= 180;
            }
            async function parallel() {
              const start = Date.now();
              await Promise.all([delay(100, 'user'), delay(100, 'orders')]);
              return Date.now() - start < 180;
            }

            (async () => {
              console.log('sequential ~200ms:', await sequential());
              console.log('parallel ~100ms:', await parallel());
            })();
          `),
          expectedOutput: 'sequential ~200ms: true\nparallel ~100ms: true',
          explanation: ['Each `await` in `sequential` waits before the next request even starts.', 'In `parallel`, both timers start immediately, so they overlap.'],
          runnable: true,
        }),
        code({
          title: 'Limiting concurrency (a worker-pool helper)',
          code: dedent(`
            async function mapLimit(items, limit, fn) {
              const results = new Array(items.length);
              let next = 0;
              async function worker() {
                while (next < items.length) {
                  const i = next++;              // claim an index synchronously
                  results[i] = await fn(items[i]);
                }
              }
              const workers = Array.from({ length: Math.min(limit, items.length) }, worker);
              await Promise.all(workers);
              return results;
            }

            let active = 0;
            let peak = 0;
            const task = async (n) => {
              active++;
              peak = Math.max(peak, active);
              await new Promise((r) => setTimeout(r, 10));
              active--;
              return n * 2;
            };

            mapLimit([1, 2, 3, 4, 5, 6], 2, task).then((r) => console.log(r, 'peak concurrency:', peak));
          `),
          expectedOutput: '[ 2, 4, 6, 8, 10, 12 ] peak concurrency: 2',
          explanation: [
            'Only `limit` workers exist; each pulls the next index when it finishes.',
            'Results still land in input order.',
            'Use this (or the `p-limit` package) when the input list can be large.',
          ],
          runnable: true,
        }),
      ),
      section('real-world', 'Real-world backend usage',
        code({
          title: 'Building one API response from independent queries',
          code: dedent(`
            app.get('/dashboard', async (req, res, next) => {
              try {
                const [user, orders, unread] = await Promise.all([
                  users.findById(req.userId),
                  orders.recentFor(req.userId, 10),
                  notifications.countUnread(req.userId),
                ]);
                res.json({ user, orders, unread });
              } catch (err) {
                next(err); // any one failing → 500 (Express)
              }
            });
          `),
          explanation: ['Array destructuring maps results back to names.', 'If partial data is acceptable, use `Promise.allSettled` instead.'],
        }),
      ),
      section('mistakes', 'Common mistakes',
        bullets(
          'Awaiting independent calls one by one (`await a(); await b();`) — needlessly slow.',
          '`Promise.all(hugeArray.map(callApi))` with 10 000 items — opens 10 000 connections, hits rate limits or exhausts the DB pool.',
          'Assuming a rejection stops the other operations.',
          'Passing promise-returning *functions* instead of promises: `Promise.all([fetchA, fetchB])` resolves with the functions themselves.',
          'Using `forEach(async ...)` and expecting it to wait — collect promises with `map` and `Promise.all` instead.',
        ),
        code({
          title: 'Wrong vs right: forEach does not wait',
          code: dedent(`
            const save = (n) => new Promise((r) => setTimeout(() => r(n), 10));

            async function wrong(items) {
              const saved = [];
              items.forEach(async (n) => saved.push(await save(n)));
              return saved;                       // returns before anything is saved
            }
            async function right(items) {
              return Promise.all(items.map((n) => save(n)));
            }

            (async () => {
              console.log('wrong:', await wrong([1, 2, 3]));
              console.log('right:', await right([1, 2, 3]));
            })();
          `),
          expectedOutput: 'wrong: []\nright: [ 1, 2, 3 ]',
          explanation: ['`forEach` ignores the promises returned by the async callback.', '`map` collects them so `Promise.all` can wait for every one.'],
          runnable: true,
        }),
      ),
      section('interview', 'Interview angle',
        interviewTip('Expect follow-ups: "what if one fails?" (fail-fast, no cancellation), "what if there are 10 000?" (limit concurrency), "what if partial results are fine?" (allSettled).'),
      ),
      section('practice', 'Practice',
        steps(
          'Fetch three JSON files with `fs/promises` in parallel and merge them into one object.',
          'Write `mapLimit` yourself and test it with 20 tasks and a limit of 3, logging the peak concurrency.',
        ),
      ),
      section('summary', 'Summary',
        bullets(
          'Waits for all; results keep input order.',
          'Fail-fast on first rejection; nothing is cancelled.',
          'Total time ≈ slowest task.',
          'Limit concurrency for large inputs.',
        ),
      ),
    ],
    revisionNotes: [
      '`Promise.all` → values in input order, or first rejection reason.',
      'Fail-fast; other operations keep running (no cancellation).',
      'Non-promises are wrapped; `Promise.all([])` → `[]`.',
      'Work starts when promises are created, not when passed to `all`.',
      'Unbounded `Promise.all(bigList.map(...))` can overload downstream systems — use a concurrency limit.',
    ],
    quiz: [
      {
        kind: 'predict-output', difficulty: 'intermediate',
        prompt: 'What is logged?',
        code: "const delay = (ms, v) => new Promise((r) => setTimeout(() => r(v), ms));\nPromise.all([delay(30, 'a'), delay(10, 'b'), 'c']).then(console.log);",
        options: ["[ 'b', 'a', 'c' ]", "[ 'c', 'b', 'a' ]", "[ 'a', 'b', 'c' ]", 'It rejects because `c` is not a promise'],
        answer: 2,
        explanation: 'Results are stored by input index, not completion order. Plain values are wrapped with `Promise.resolve`.',
      },
      {
        kind: 'predict-output', difficulty: 'intermediate',
        prompt: 'What is logged?',
        code: "Promise.all([\n  Promise.resolve(1),\n  Promise.reject(new Error('x')),\n  Promise.resolve(3),\n])\n  .then((v) => console.log('then', v))\n  .catch((e) => console.log('catch', e.message));",
        options: ['then [ 1, 3 ]', 'catch x', 'then [ 1, undefined, 3 ]', 'catch x, then then [ 1, 3 ]'],
        answer: 1,
        explanation: 'One rejection rejects the whole `Promise.all`; you get no partial array. Use `allSettled` if you want the fulfilled values too.',
      },
      {
        kind: 'scenario', difficulty: 'advanced',
        prompt: 'You must call a partner API for 20 000 order ids. The partner allows 10 concurrent requests. What should you do?',
        options: [
          '`await Promise.all(ids.map(callPartner))`',
          'A `for...of` loop with `await` on each call (one at a time)',
          'Process the ids with a concurrency limit of 10 (worker pool / `p-limit`), collecting results',
          '`ids.forEach(async (id) => await callPartner(id))`',
        ],
        answer: 2,
        explanation: 'Unbounded `Promise.all` fires 20 000 requests at once and breaks the rate limit. Strictly sequential is safe but ~10× slower than allowed. `forEach(async)` is unbounded *and* not awaited. A bounded pool is the right trade-off.',
      },
    ],
    interview: [
      {
        category: 'javascript', kind: 'concept', difficulty: 'intermediate', topic: 'Promise combinators',
        question: 'If one promise passed to Promise.all rejects, what happens to the others?',
        shortAnswer: '`Promise.all` rejects immediately with that reason, but the other operations keep running — promises cannot be cancelled. Their results are simply ignored.',
        detailedAnswer: [
          'Promise.all attaches handlers to every input, so later rejections are handled silently (no unhandledRejection).',
          'Side effects (DB writes, emails) of the other operations still happen.',
          'To actually stop work, pass an `AbortSignal` to the underlying APIs and abort it in the catch.',
          'If you need every outcome, use `Promise.allSettled`.',
        ],
        followUp: 'How would you abort the remaining fetch requests when one fails?',
        trap: 'Saying Promise.all "cancels" or "stops" the remaining promises.',
      },
      {
        category: 'nodejs', kind: 'scenario', difficulty: 'advanced', topic: 'Promise combinators',
        question: 'How would you process 10,000 async jobs with at most N running at once, keeping results in order?',
        shortAnswer: 'Start N worker loops that each claim the next index synchronously, await the job, and store the result at that index; then `await Promise.all(workers)`. Libraries like `p-limit` implement the same idea.',
        detailedAnswer: [
          'Claiming `const i = next++` is safe without locks because JS runs one callback at a time.',
          'Writing to `results[i]` preserves input order regardless of completion order.',
          'Decide error policy: fail-fast (let it throw) or collect errors per item (like allSettled).',
          'Batching in fixed chunks of N is simpler but slower: each batch waits for its slowest job.',
          'For durable or very large workloads, use a job queue (BullMQ etc.) instead of in-process concurrency.',
        ],
        code: {
          id: 'm05-int-maplimit',
          language: 'javascript',
          code: "async function mapLimit(items, limit, fn) {\n  const results = new Array(items.length);\n  let next = 0;\n  const worker = async () => {\n    while (next < items.length) {\n      const i = next++;\n      results[i] = await fn(items[i], i);\n    }\n  };\n  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));\n  return results;\n}",
        },
        followUp: 'Why is chunking into fixed batches of N less efficient than a worker pool?',
        trap: 'Using `Promise.all` on chunks and calling it "concurrency limiting" without noting the head-of-line blocking per batch.',
      },
    ],
  },

  // ───────────────────────────────────────────────────────────
  'promise-allsettled': {
    summary: 'Promise.allSettled waits for every promise to settle and never rejects; it returns an array of { status: "fulfilled", value } or { status: "rejected", reason } objects.',
    topics: ['Promise.allSettled', 'partial failure', 'status', 'fulfilled', 'rejected', 'batch processing'],
    sections: [
      section('introduction', undefined,
        text('Sometimes partial success is fine: send 100 notifications and report which failed, or show a dashboard where one widget is down. `Promise.allSettled` waits for everything and tells you the outcome of each.'),
      ),
      section('definition', 'Definition',
        bullets(
          '`Promise.allSettled(iterable)` fulfills once **every** input has settled.',
          'It **never rejects** (except for invalid input, e.g. a non-iterable).',
          'Each result is `{ status: \'fulfilled\', value }` or `{ status: \'rejected\', reason }`, in input order.',
        ),
        combinatorTable,
      ),
      section('why', 'Why use it',
        bullets(
          'Batch jobs where one failure must not hide the other results.',
          'Aggregating optional data sources (recommendations, ads, widgets).',
          'Cleanup tasks — close every connection even if some fail to close.',
        ),
      ),
      section('internals', 'How it works',
        bullets(
          'Like `Promise.all`, it subscribes to each input — but both the fulfill and reject handlers *record* a result instead of rejecting.',
          'The outer promise fulfills when the counter of pending inputs reaches zero.',
          'Total time ≈ the slowest input, including slow failures.',
        ),
        flow(['inputs start', 'each settles → recorded as { status, value | reason }', 'last one settles', 'array fulfilled'], { direction: 'horizontal' }),
      ),
      section('example', 'Examples',
        code({
          title: 'The result shape',
          code: dedent(`
            Promise.allSettled([Promise.resolve(1), Promise.reject('nope'), 3]).then((results) => {
              console.log(results);
            });
          `),
          expectedOutput: "[\n  { status: 'fulfilled', value: 1 },\n  { status: 'rejected', reason: 'nope' },\n  { status: 'fulfilled', value: 3 }\n]",
          explanation: ['Fulfilled entries have `value`; rejected entries have `reason`.', 'Order matches the input.'],
          runnable: true,
        }),
        code({
          title: 'Reporting partial failures',
          code: dedent(`
            const sendEmail = (to) =>
              to.endsWith('@bad.test')
                ? Promise.reject(new Error('mailbox not found: ' + to))
                : Promise.resolve('sent to ' + to);

            const recipients = ['a@ok.test', 'b@bad.test', 'c@ok.test'];

            Promise.allSettled(recipients.map(sendEmail)).then((results) => {
              const failed = results
                .map((r, i) => ({ r, to: recipients[i] }))
                .filter(({ r }) => r.status === 'rejected');
              console.log('sent:', results.length - failed.length, 'failed:', failed.length);
              for (const { r, to } of failed) console.log(to, '->', r.reason.message);
            });
          `),
          expectedOutput: 'sent: 2 failed: 1\nb@bad.test -> mailbox not found: b@bad.test',
          explanation: ['Index `i` links each result back to its input.', '`reason` holds the `Error`, so read `.message` for logging.'],
          runnable: true,
        }),
        code({
          title: 'Splitting values and errors',
          code: dedent(`
            async function settle(promises) {
              const results = await Promise.allSettled(promises);
              return {
                values: results.filter((r) => r.status === 'fulfilled').map((r) => r.value),
                errors: results.filter((r) => r.status === 'rejected').map((r) => r.reason.message),
              };
            }

            settle([Promise.resolve('a'), Promise.reject(new Error('b broke')), Promise.resolve('c')])
              .then((out) => console.log(out));
          `),
          expectedOutput: "{ values: [ 'a', 'c' ], errors: [ 'b broke' ] }",
          explanation: ['A small helper keeps call sites clean.'],
          runnable: true,
        }),
      ),
      section('real-world', 'Real-world backend usage',
        code({
          title: 'Graceful shutdown: close everything, report failures',
          code: dedent(`
            async function shutdown() {
              const results = await Promise.allSettled([
                server.close(),          // stop accepting HTTP connections
                db.end(),                // drain the DB pool
                redis.quit(),
                queue.close(),
              ]);
              const failures = results.filter((r) => r.status === 'rejected');
              for (const f of failures) logger.error({ err: f.reason }, 'shutdown step failed');
              process.exit(failures.length ? 1 : 0);
            }
          `),
          explanation: ['With `Promise.all`, a failing `redis.quit()` would skip waiting for the DB to drain.'],
        }),
      ),
      section('mistakes', 'Common mistakes',
        bullets(
          'Treating results as raw values (`results[0].name`) instead of reading `.value`.',
          'Adding a `.catch` and expecting it to fire for failed items — it never will.',
          'Silently ignoring rejected entries: always log or surface them.',
          'Using it when you actually need all-or-nothing semantics (use `Promise.all`).',
        ),
        code({
          title: 'Wrong vs right: reading results',
          code: dedent(`
            Promise.allSettled([Promise.resolve({ name: 'Ada' })]).then((results) => {
              console.log('wrong:', results[0].name);
              console.log('right:', results[0].status === 'fulfilled' ? results[0].value.name : null);
            });
          `),
          expectedOutput: 'wrong: undefined\nright: Ada',
          explanation: ['Each entry is a wrapper object; the actual value lives in `.value`.'],
          runnable: true,
        }),
      ),
      section('interview', 'Interview angle',
        interviewTip('Know the exact result shape (`status` + `value` or `reason`) and that allSettled never rejects. Then contrast it with `Promise.all` using a concrete example (dashboard vs payment).'),
      ),
      section('practice', 'Practice',
        steps(
          'Check the health of three URLs with `fetch` and `Promise.allSettled`; print `UP`/`DOWN` per URL.',
          'Extend it so a request taking more than 2 s counts as `DOWN` (`AbortSignal.timeout(2000)`).',
        ),
      ),
      section('summary', 'Summary',
        bullets(
          'Waits for all, never rejects.',
          'Result: `{ status: \'fulfilled\', value }` or `{ status: \'rejected\', reason }`.',
          'Use for partial-failure tolerant batches, aggregation and cleanup.',
          'Always inspect and report the rejected entries.',
        ),
      ),
    ],
    revisionNotes: [
      'Shape: `{ status: \'fulfilled\', value }` | `{ status: \'rejected\', reason }`.',
      'Never rejects; fulfills after the slowest input settles.',
      'Order matches input; use the index to map back.',
      'Added in ES2020 (Node 12.9+).',
      'Use `Promise.all` for all-or-nothing, `allSettled` for partial success.',
    ],
    quiz: [
      {
        kind: 'predict-output', difficulty: 'intermediate',
        prompt: 'What is logged?',
        code: "Promise.allSettled([Promise.reject(new Error('x')), Promise.resolve(2)])\n  .then((r) => console.log(r.map((x) => x.status).join(',')))\n  .catch(() => console.log('rejected'));",
        options: ['rejected', 'fulfilled,rejected', 'rejected,fulfilled', 'fulfilled,fulfilled'],
        answer: 2,
        explanation: 'allSettled never rejects, so `.catch` does not run. Statuses are in input order: the first input rejected, the second fulfilled.',
      },
      {
        kind: 'mcq', difficulty: 'beginner',
        prompt: 'Which property holds the error of a failed entry in a Promise.allSettled result?',
        options: ['`error`', '`value`', '`message`', '`reason`'],
        answer: 3,
        explanation: 'Rejected entries are `{ status: \'rejected\', reason }`. `value` exists only on fulfilled entries.',
      },
      {
        kind: 'scenario', difficulty: 'intermediate',
        prompt: 'A product page loads price, reviews and recommendations. Reviews and recommendations are optional; the price is required. Best approach?',
        options: [
          '`Promise.all` on all three',
          'Await price normally, and load reviews + recommendations with `Promise.allSettled`, rendering what succeeded',
          '`Promise.race` on all three',
          '`Promise.any` on all three',
        ],
        answer: 1,
        explanation: 'Required data should fail the request; optional data should degrade gracefully. `Promise.all` would fail the whole page for a broken reviews service; race/any return only one result.',
      },
    ],
    interview: [
      {
        category: 'javascript', kind: 'concept', difficulty: 'intermediate', topic: 'Promise combinators',
        question: 'When would you choose Promise.allSettled over Promise.all, and what does its result look like?',
        shortAnswer: 'When partial failure is acceptable and you need every outcome. It never rejects and returns an array of `{ status: \'fulfilled\', value }` or `{ status: \'rejected\', reason }` in input order.',
        detailedAnswer: [
          'Batch notifications, multi-service health checks, optional dashboard widgets, graceful shutdown.',
          'Unlike `all`, it waits for slow failures too — total time = slowest input.',
          'You must filter rejected entries yourself and report them.',
          'For all-or-nothing operations (charge + reserve stock), `Promise.all` or a transaction is correct.',
        ],
        followUp: 'How would you implement allSettled using only Promise.all?',
        trap: 'Expecting a `.catch` on allSettled to receive the failures.',
      },
    ],
  },

  // ───────────────────────────────────────────────────────────
  'promise-race': {
    summary: 'Promise.race settles with the first input to settle — whether it fulfills or rejects. It is the building block for timeouts.',
    topics: ['Promise.race', 'timeout', 'first settled', 'AbortSignal.timeout', 'clearTimeout', 'cancellation'],
    sections: [
      section('introduction', undefined,
        text('A downstream service sometimes hangs. You want to give up after 2 seconds. `Promise.race` lets you race the real call against a timer and take whichever finishes first.'),
      ),
      section('definition', 'Definition',
        bullets(
          '`Promise.race(iterable)` settles the same way as the **first** input to settle — fulfill *or* reject.',
          'The losers keep running; their results are ignored.',
          '`Promise.race([])` stays **pending forever**.',
        ),
        combinatorTable,
      ),
      section('why', 'Why use it',
        bullets(
          'Timeouts around operations that do not support one natively.',
          '"First response wins" between equivalent sources — though `Promise.any` is usually better there.',
          'Racing work against a shutdown signal.',
        ),
      ),
      section('internals', 'How it works',
        bullets(
          'It calls `.then(resolve, reject)` on every input with the **same** outer `resolve`/`reject`.',
          'Because a promise settles once, only the first call has an effect.',
          'Nothing is cancelled: a timed-out DB query still runs, and a pending timer still keeps the process alive unless cleared.',
        ),
        flow(['race starts', 'operation vs timer', 'first to settle decides the result', 'clear the timer in finally'], { direction: 'horizontal' }),
      ),
      section('example', 'Examples',
        code({
          title: 'The first to settle wins',
          code: dedent(`
            const delay = (ms, v) => new Promise((r) => setTimeout(() => r(v), ms));
            Promise.race([delay(30, 'slow'), delay(10, 'fast')]).then((v) => console.log('winner:', v));
          `),
          expectedOutput: 'winner: fast',
          runnable: true,
          explanation: ['`fast` settles first at 10 ms, so the race fulfills with it.'],
        }),
        code({
          title: 'A rejection can win too',
          code: dedent(`
            const delay = (ms, v) => new Promise((r) => setTimeout(() => r(v), ms));
            const fail = (ms) => new Promise((_, rej) => setTimeout(() => rej(new Error('failed at ' + ms + 'ms')), ms));

            Promise.race([delay(30, 'ok'), fail(10)])
              .then((v) => console.log('value', v))
              .catch((e) => console.log('race rejected:', e.message));
          `),
          expectedOutput: 'race rejected: failed at 10ms',
          explanation: ['`race` does not prefer successes — the first settlement of any kind decides. That is the key difference from `Promise.any`.'],
          runnable: true,
        }),
        code({
          title: 'A correct timeout helper',
          code: dedent(`
            const delay = (ms, v) => new Promise((r) => setTimeout(() => r(v), ms));

            function withTimeout(promise, ms) {
              let timer;
              const timeout = new Promise((_, reject) => {
                timer = setTimeout(() => reject(new Error('Timed out after ' + ms + 'ms')), ms);
              });
              return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
            }

            withTimeout(delay(10, 'data'), 50).then((v) => console.log('ok:', v));
            withTimeout(delay(100, 'late'), 20).catch((e) => console.log('error:', e.message));
          `),
          expectedOutput: 'ok: data\nerror: Timed out after 20ms',
          explanation: [
            '`finally(clearTimeout)` removes the timer when the operation wins, so it does not fire later or keep the process alive.',
            'The "late" operation still completes at 100 ms; only its result is discarded.',
          ],
          runnable: true,
        }),
        code({
          title: 'Prefer real cancellation when the API supports it',
          code: dedent(`
            // Node 18+: fetch accepts an AbortSignal
            async function getJson(url) {
              const res = await fetch(url, { signal: AbortSignal.timeout(2000) });
              if (!res.ok) throw new Error('HTTP ' + res.status);
              return res.json();
            }

            getJson('https://10.255.255.1/slow').catch((err) => console.log(err.name));
          `),
          expectedOutput: 'TimeoutError',
          explanation: ['`AbortSignal.timeout` actually aborts the request (closing the socket), unlike a race that only ignores it.', 'Node rejects with a `DOMException` named `TimeoutError`.'],
          versionNote: '`fetch` is stable in Node 21+ (available since Node 18); `AbortSignal.timeout` since Node 17.3.',
        }),
      ),
      section('real-world', 'Real-world backend usage',
        bullets(
          'Wrapping a legacy SDK call that has no timeout option.',
          'Bounding how long a request waits for a cache before falling back to the DB.',
          'Racing graceful shutdown against a hard deadline: `Promise.race([drainConnections(), delay(10_000)])`.',
        ),
      ),
      section('mistakes', 'Common mistakes',
        bullets(
          'Not clearing the timeout timer — it fires later and may keep the process alive.',
          'Believing the slower operation is cancelled.',
          'Using `race` when you want "first success" — a fast failure wins the race. Use `Promise.any`.',
          'Calling `Promise.race([])` with a possibly empty list — it never settles.',
        ),
        code({
          title: 'Wrong: leaking timers',
          code: dedent(`
            // Wrong: each call leaves a 30 s timer behind
            const timeout = (ms) => new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms));
            const user = await Promise.race([db.findUser(id), timeout(30_000)]);
          `),
          explanation: ['Under load this creates thousands of pending timers. Clear them in `finally` (see `withTimeout`) or use `AbortSignal.timeout` with an API that supports signals.'],
        }),
      ),
      section('interview', 'Interview angle',
        interviewTip('If you implement a timeout with `Promise.race`, volunteer the two caveats yourself: clear the timer, and the underlying operation is not cancelled — use `AbortController` where possible.'),
      ),
      section('practice', 'Practice',
        steps(
          'Implement `withTimeout(promise, ms)` and test both paths.',
          'Change it to accept an `AbortController` and abort the controller when the timeout wins.',
        ),
      ),
      section('summary', 'Summary',
        bullets(
          'First to settle wins — success or failure.',
          'Losers are ignored, not cancelled.',
          'Timeout pattern: race + `clearTimeout` in `finally`.',
          'Prefer `AbortSignal.timeout` for real cancellation.',
          '`Promise.race([])` never settles.',
        ),
      ),
    ],
    revisionNotes: [
      '`race` settles with the first settled input (fulfilled or rejected).',
      '`Promise.race([])` → pending forever.',
      'No cancellation: the losing operation keeps running.',
      'Clear timeout timers in `finally`.',
      '`AbortSignal.timeout(ms)` gives real cancellation for fetch/fs/timers APIs that accept a signal.',
    ],
    quiz: [
      {
        kind: 'predict-output', difficulty: 'intermediate',
        prompt: 'What is logged?',
        code: "const delay = (ms, v) => new Promise((r) => setTimeout(() => r(v), ms));\nconst fail = (ms) => new Promise((_, j) => setTimeout(() => j(new Error('E')), ms));\nPromise.race([delay(20, 'A'), fail(5), delay(1, 'B')])\n  .then((v) => console.log('then', v))\n  .catch((e) => console.log('catch', e.message));",
        options: ['then A', 'catch E', 'then B', 'then B, then catch E'],
        answer: 2,
        explanation: '`B` settles first (1 ms), so the race fulfills with `B`. The later rejection is ignored because the outer promise is already settled.',
      },
      {
        kind: 'mcq', difficulty: 'intermediate',
        prompt: 'What does `Promise.race([])` do?',
        options: ['Fulfills with `undefined`', 'Rejects with `AggregateError`', 'Fulfills with `[]`', 'Stays pending forever'],
        answer: 3,
        explanation: 'With no inputs, nothing can ever settle it. Contrast: `Promise.all([])` → `[]`, `Promise.any([])` → rejects with `AggregateError`.',
      },
      {
        kind: 'find-bug', difficulty: 'advanced',
        prompt: 'A CLI using this helper finishes its work but the process hangs for 60 seconds before exiting. Why?',
        code: "function withTimeout(p, ms) {\n  return Promise.race([\n    p,\n    new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms)),\n  ]);\n}\nawait withTimeout(doWork(), 60_000);",
        options: [
          'Promise.race waits for all inputs before settling',
          'The 60 s timer is never cleared; an active timer keeps the event loop (and process) alive',
          '`doWork()` runs twice',
          '`await` cannot be used with `Promise.race`',
        ],
        answer: 1,
        explanation: 'The race settles as soon as `doWork` finishes, but the timer is still scheduled. Node exits only when no ref\'d handles remain. Clear it in `finally` or `unref()` it.',
      },
    ],
    interview: [
      {
        category: 'nodejs', kind: 'concept', difficulty: 'advanced', topic: 'Promise combinators',
        question: 'Implement a timeout for an arbitrary promise. What are the pitfalls of doing it with Promise.race?',
        shortAnswer: 'Race the promise against a timer promise that rejects, and clear the timer in `finally`. Pitfalls: the original operation is not cancelled, and an uncleared timer leaks and keeps the process alive.',
        detailedAnswer: [
          'Race semantics: whichever settles first decides; the other is ignored.',
          'Clear the timer (`clearTimeout`) when the operation wins to avoid thousands of dangling timers.',
          'The timed-out operation still consumes resources (socket, DB connection) and may still have side effects.',
          'Prefer APIs that accept an `AbortSignal` (`fetch`, `fs.readFile`, `timers/promises`, many DB clients) and use `AbortSignal.timeout(ms)`.',
          'Use an `Error` subclass or `code` (e.g. `ETIMEDOUT`) so callers can distinguish timeouts.',
        ],
        code: {
          id: 'm05-int-with-timeout',
          language: 'javascript',
          code: "function withTimeout(promise, ms) {\n  let timer;\n  const timeout = new Promise((_, reject) => {\n    timer = setTimeout(() => reject(Object.assign(new Error('Timed out'), { code: 'ETIMEDOUT' })), ms);\n  });\n  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));\n}",
        },
        followUp: 'How would you propagate cancellation to the underlying operation?',
        trap: 'Claiming the race "cancels" the slow promise.',
      },
    ],
  },

  // ───────────────────────────────────────────────────────────
  'promise-any': {
    summary: 'Promise.any fulfills with the first input that fulfills, ignoring rejections; only if every input rejects does it reject — with an AggregateError listing all reasons.',
    topics: ['Promise.any', 'AggregateError', 'first success', 'fallback', 'redundant requests'],
    sections: [
      section('introduction', undefined,
        text('You have three mirrors of the same file, or three replicas of a cache. You do not care which answers — you want the **first successful** answer, and you only fail if all of them fail. That is `Promise.any`.'),
      ),
      section('definition', 'Definition',
        bullets(
          '`Promise.any(iterable)` fulfills with the value of the first input to **fulfill**.',
          'Rejections are ignored unless **all** inputs reject.',
          'If all reject, it rejects with an **`AggregateError`** whose `.errors` array holds every reason in input order and whose `message` is `All promises were rejected`.',
          '`Promise.any([])` rejects immediately with an `AggregateError` (empty `errors`).',
        ),
        combinatorTable,
      ),
      section('why', 'Why use it',
        bullets(
          'Redundancy: query several equivalent sources, use the fastest healthy one.',
          'Fallback chains where order does not matter.',
          'It is `race` that skips failures — a fast error no longer wins.',
        ),
      ),
      section('internals', 'How it works',
        bullets(
          'It is the mirror image of `Promise.all`: `all` fails fast on the first rejection; `any` succeeds fast on the first fulfillment.',
          'It records rejection reasons by index; when the pending counter hits zero with no success, it builds the `AggregateError`.',
          'As with the others, nothing is cancelled — the slower requests still complete.',
        ),
      ),
      section('example', 'Examples',
        code({
          title: 'First success wins, failures are skipped',
          code: dedent(`
            const delay = (ms, v) => new Promise((r) => setTimeout(() => r(v), ms));
            const fail = (ms, msg) => new Promise((_, rej) => setTimeout(() => rej(new Error(msg)), ms));

            Promise.any([fail(10, 'mirror A down'), delay(30, 'mirror B'), delay(50, 'mirror C')])
              .then((v) => console.log('first success:', v));
          `),
          expectedOutput: 'first success: mirror B',
          explanation: ['A rejects first, but `any` ignores it.', 'B is the first to fulfill. With `Promise.race`, the result would have been the A error.'],
          runnable: true,
        }),
        code({
          title: 'All rejected → AggregateError',
          code: dedent(`
            const fail = (ms, msg) => new Promise((_, rej) => setTimeout(() => rej(new Error(msg)), ms));

            Promise.any([fail(20, 'A down'), fail(10, 'B down')]).catch((e) => {
              console.log(e instanceof AggregateError, e.name);
              console.log(e.message);
              console.log(e.errors.map((x) => x.message));
            });
          `),
          expectedOutput: "true AggregateError\nAll promises were rejected\n[ 'A down', 'B down' ]",
          explanation: [
            '`errors` keeps **input** order (A first) even though B rejected first.',
            'Log `e.errors` — the top-level message alone hides the real causes.',
          ],
          runnable: true,
        }),
        code({
          title: 'Empty input',
          code: dedent(`
            Promise.any([]).catch((e) => console.log(e.name, e.errors));
          `),
          expectedOutput: 'AggregateError []',
          explanation: ['Nothing can fulfill, so it rejects immediately. Guard against empty lists if that is a valid state.'],
          runnable: true,
        }),
      ),
      section('real-world', 'Real-world backend usage',
        code({
          title: 'Read from the fastest healthy replica',
          code: dedent(`
            async function getCached(key) {
              try {
                return await Promise.any(replicas.map((r) => r.get(key).then((v) => {
                  if (v == null) throw new Error('miss on ' + r.name); // treat a miss as failure
                  return v;
                })));
              } catch (err) {
                if (err instanceof AggregateError) {
                  logger.warn({ causes: err.errors.map((e) => e.message) }, 'all replicas failed');
                  return loadFromDb(key);
                }
                throw err;
              }
            }
          `),
          explanation: ['Converting a "miss" into a rejection lets `any` skip it.', 'The fallback runs only when every replica failed.'],
        }),
      ),
      section('mistakes', 'Common mistakes',
        bullets(
          'Logging only `err.message` ("All promises were rejected") and losing the real causes in `err.errors`.',
          'Confusing it with `race` — `race` lets a fast failure win.',
          'Firing many redundant requests for every call — it multiplies load on downstream services.',
          'Calling it with an empty array and being surprised by an immediate rejection.',
        ),
        code({
          title: 'Wrong vs right: logging the causes',
          code: dedent(`
            Promise.any([Promise.reject(new Error('dns failed')), Promise.reject(new Error('tls failed'))])
              .catch((err) => {
                console.log('wrong:', err.message);
                console.log('right:', err.errors.map((e) => e.message).join('; '));
              });
          `),
          expectedOutput: 'wrong: All promises were rejected\nright: dns failed; tls failed',
          runnable: true,
          explanation: ['The aggregate message is generic; the actionable details are in `errors`.'],
        }),
      ),
      section('interview', 'Interview angle',
        interviewTip('Be ready to compare all four combinators in one table — "what resolves/rejects when" is a very common question. Mention that `any` was added in ES2021 (Node 15+).'),
      ),
      section('practice', 'Practice',
        steps(
          'Implement `promiseAny(promises)` yourself using `new Promise`, a counter and an errors array.',
          'Write `fetchFromMirrors(urls)` with `Promise.any` and abort the remaining requests once one succeeds (one `AbortController` per request).',
        ),
      ),
      section('summary', 'Summary',
        bullets(
          'First fulfillment wins; rejections are skipped.',
          'All rejected (or empty input) → `AggregateError` with `.errors`.',
          '`any` vs `race`: `race` lets a failure win, `any` does not.',
          'Nothing is cancelled — abort explicitly if needed.',
        ),
      ),
    ],
    revisionNotes: [
      '`Promise.any` → first fulfilled value; rejects only if all reject.',
      'Rejection: `AggregateError`, message `All promises were rejected`, `.errors` in input order.',
      '`Promise.any([])` rejects immediately.',
      'ES2021, Node 15+.',
      'all ↔ any are mirror images (fail-fast vs succeed-fast).',
    ],
    quiz: [
      {
        kind: 'predict-output', difficulty: 'intermediate',
        prompt: 'What is logged?',
        code: "const delay = (ms, v) => new Promise((r) => setTimeout(() => r(v), ms));\nconst fail = (ms) => new Promise((_, j) => setTimeout(() => j(new Error('E' + ms)), ms));\nPromise.any([fail(5), delay(20, 'slow'), fail(1)])\n  .then((v) => console.log('then', v))\n  .catch((e) => console.log('catch', e.message));",
        options: ['catch E1', 'catch All promises were rejected', 'catch E5', 'then slow'],
        answer: 3,
        explanation: 'Both failures are ignored because one input eventually fulfills. `Promise.race` would have rejected with `E1`.',
      },
      {
        kind: 'predict-output', difficulty: 'advanced',
        prompt: 'What is logged?',
        code: "Promise.any([\n  Promise.reject(new Error('x')),\n  Promise.reject(new Error('y')),\n]).catch((e) => console.log(e.constructor.name, e.errors.length, e.message));",
        options: ['Error 1 x', 'AggregateError 2 All promises were rejected', 'AggregateError 2 x, y', 'Error 2 y'],
        answer: 1,
        explanation: 'When every input rejects, `any` rejects with an `AggregateError` whose generic message is "All promises were rejected" and whose `errors` array has both reasons.',
      },
      {
        kind: 'mcq', difficulty: 'beginner',
        prompt: 'You call three CDN mirrors and want the first one that responds successfully, failing only if all fail. Which combinator?',
        options: ['`Promise.all`', '`Promise.race`', '`Promise.any`', '`Promise.allSettled`'],
        answer: 2,
        explanation: '`any` = first success. `race` would return a fast failure; `all` needs all three; `allSettled` waits for all.',
      },
    ],
    interview: [
      {
        category: 'javascript', kind: 'concept', difficulty: 'intermediate', topic: 'Promise combinators',
        question: 'How does Promise.any differ from Promise.race?',
        shortAnswer: '`race` settles with the first input to settle, even if it is a rejection. `any` waits for the first input to fulfill and only rejects — with an `AggregateError` — if every input rejects.',
        detailedAnswer: [
          'race: first settlement of any kind wins.',
          'any: first fulfillment wins; rejections are collected.',
          'Empty input: race stays pending forever; any rejects immediately.',
          'Use race for timeouts, any for redundancy/fallback.',
          'Neither cancels the remaining operations.',
        ],
        followUp: 'What is inside the AggregateError and how should you log it?',
        trap: 'Saying they are the same except for naming.',
      },
      {
        category: 'javascript', kind: 'scenario', difficulty: 'advanced', topic: 'Promise combinators',
        question: 'For each case choose a combinator and justify it: (a) render a page needing three required queries, (b) health-check ten services, (c) a 2-second deadline on a call, (d) read from whichever of three replicas answers first successfully.',
        shortAnswer: '(a) `Promise.all` — all required, fail fast. (b) `Promise.allSettled` — need every outcome. (c) `Promise.race` with a timer (or `AbortSignal.timeout`). (d) `Promise.any` — first success, fail only if all fail.',
        detailedAnswer: [
          'all: values in order; first rejection rejects; nothing cancelled.',
          'allSettled: never rejects; `{ status, value | reason }` per input.',
          'race: first settlement wins, including failures; clear the timer.',
          'any: skips failures; `AggregateError` with `.errors` if all fail.',
          'Combine them: `Promise.all` of several `withTimeout(...)` calls is common.',
        ],
        followUp: 'Which of these leaves work running in the background, and how would you stop it?',
        trap: 'Using `race` for (d), where a fast connection error from one replica would fail the whole read.',
      },
    ],
  },
};

export default content;
