import type { ModuleContent } from '../../../types';
import {
  bullets, code, dedent, diagram, flow, interviewTip, note, section, steps, table, text, warn,
} from '../helpers';

const schedulerTable = table('Scheduling APIs compared', ['API', 'Queue', 'Runs', 'Standard?'], [
  ['`process.nextTick(fn)`', 'nextTick queue', 'Right after the current callback, before promises', 'Node only'],
  ['`queueMicrotask(fn)` / `.then`', 'V8 microtask queue', 'After the nextTick queue', 'ECMAScript / Web'],
  ['`setTimeout(fn, 0)`', 'timers phase', 'Next timers phase once ≥ 1 ms has passed', 'Web + Node'],
  ['`setImmediate(fn)`', 'check phase', 'After the poll phase of the current/next iteration', 'Node only'],
]);

const content: Partial<ModuleContent> = {
  // ───────────────────────────────────────────────────────────
  'process-nexttick': {
    summary: 'Schedules a callback to run right after the current operation, before promise microtasks and before the event loop continues.',
    topics: ['process.nextTick', 'nextTick queue', 'microtasks', 'starvation', 'ESM vs CommonJS', 'emit after constructor'],
    sections: [
      section('introduction', undefined,
        text('Sometimes you need code to run *after* the current function finishes but *before* any I/O, timer, or even promise callback. `process.nextTick` does exactly that — it is the "as soon as possible, but not now" queue.'),
      ),
      section('definition', 'Definition',
        bullets(
          '`process.nextTick(callback, ...args)` adds `callback` to Node\'s **nextTick queue**.',
          'The queue is drained after the current JavaScript operation completes — after the main script and after every individual event-loop callback.',
          'In CommonJS it runs **before** promise microtasks. It is Node-only (not in browsers).',
          'Despite the name, it does **not** wait for the next loop iteration — `setImmediate` does that. The names are historically backwards.',
        ),
        schedulerTable,
      ),
      section('why', 'Why it exists',
        bullets(
          'Making APIs consistently async: call back on a cache hit without being synchronous.',
          'Letting the caller finish setting up — e.g. attach event listeners — before an event is emitted.',
          'Deferring error emission until after the constructor returns.',
          'Node core uses it internally (streams, net, EventEmitter-based APIs).',
        ),
      ),
      section('internals', 'How it works',
        bullets(
          'Node keeps a dedicated **nextTick queue**, separate from V8\'s promise microtask queue.',
          'After each macrotask callback, Node runs `processTicksAndRejections`: drain the whole nextTick queue, then run V8 microtasks, and repeat while either has work.',
          'Ticks added while draining run in the same drain — so recursive `nextTick` can starve I/O.',
          'Once the microtask queue starts draining, it finishes completely; a nextTick scheduled from a promise callback waits until that drain ends.',
          'In an **ES module** entry point, your top-level code runs inside a promise job, so promise callbacks can run *before* nextTick callbacks scheduled at top level.',
        ),
        diagram('event-loop-phases', 'nextTick and microtasks run between every phase callback.'),
        diagram('event-loop-simulator', 'Step through the nextTick queue draining before promise microtasks.'),
      ),
      section('example', 'Examples',
        code({
          title: 'nextTick beats Promise.then (CommonJS)',
          code: dedent(`
            console.log('start');
            setTimeout(() => console.log('timeout'), 0);
            Promise.resolve().then(() => console.log('promise'));
            process.nextTick(() => console.log('nextTick'));
            console.log('end');
          `),
          expectedOutput: 'start\nend\nnextTick\npromise\ntimeout',
          explanation: [
            'Synchronous logs run first: `start`, `end`.',
            'When the main script finishes, Node drains the nextTick queue → `nextTick`.',
            'Then the promise microtask queue → `promise`.',
            'Only then does the event loop reach the timers phase → `timeout`.',
          ],
          versionNote: 'CommonJS entry (`.js` without `"type": "module"`, or `.cjs`). See the ESM example below.',
        }),
        code({
          title: 'In an ES module, promises can run first',
          code: dedent(`
            // order.mjs
            process.nextTick(() => console.log('nextTick'));
            Promise.resolve().then(() => console.log('promise'));
            console.log('sync');
          `),
          expectedOutput: 'sync\npromise\nnextTick',
          explanation: [
            'ESM evaluation is itself asynchronous: the module body runs inside a promise job.',
            'When the body ends, V8 keeps draining the *current* microtask queue (including `promise`) before Node gets a chance to process ticks.',
            'Do not write code whose correctness depends on nextTick-vs-promise order.',
          ],
          versionNote: 'Observed on current Node versions for `.mjs` / `"type": "module"` entry points.',
        }),
        code({
          title: 'nextTick scheduled from inside a promise callback',
          code: dedent(`
            Promise.resolve()
              .then(() => {
                console.log('promise 1');
                process.nextTick(() => console.log('nextTick scheduled inside promise'));
              })
              .then(() => console.log('promise 2'));
          `),
          expectedOutput: 'promise 1\npromise 2\nnextTick scheduled inside promise',
          explanation: [
            'Once V8 starts draining microtasks, it drains them all — `promise 2` is queued during that drain.',
            'Node only checks the nextTick queue again after the microtask drain ends.',
          ],
        }),
        code({
          title: 'Emitting after the constructor returns',
          code: dedent(`
            const EventEmitter = require('node:events');

            class Job extends EventEmitter {
              constructor() {
                super();
                // this.emit('ready') here would fire before anyone could listen
                process.nextTick(() => this.emit('ready'));
              }
            }

            const job = new Job();
            job.on('ready', () => console.log('ready received'));
          `),
          expectedOutput: 'ready received',
          explanation: ['The listener is attached synchronously after `new Job()`; the deferred emit runs after that.'],
        }),
        code({
          title: 'Passing arguments',
          code: dedent(`
            function done(err, value) {
              console.log(err, value);
            }
            process.nextTick(done, null, 42);
          `),
          expectedOutput: 'null 42',
          explanation: ['Extra arguments are forwarded to the callback — no wrapper closure needed.'],
        }),
      ),
      section('real-world', 'Real-world backend usage',
        bullets(
          'Library code: `if (cached) return process.nextTick(cb, null, cached)` to keep callbacks always async.',
          'Custom streams/emitters: emit `error` in nextTick so callers can attach an `\'error\'` handler first.',
          'Application code rarely needs it — prefer `queueMicrotask` (standard) or `setImmediate` (yields to I/O).',
        ),
      ),
      section('mistakes', 'Common mistakes',
        warn('Recursive `process.nextTick` never yields to the event loop — timers and I/O starve.'),
        code({
          title: 'Wrong vs right: recursive scheduling',
          code: dedent(`
            // Wrong: starves the event loop
            function poll() {
              if (!queue.length) return process.nextTick(poll);
              handle(queue.shift());
              process.nextTick(poll);
            }

            // Right: yield to I/O between iterations
            function pollFair() {
              if (queue.length) handle(queue.shift());
              setImmediate(pollFair);
            }
          `),
          explanation: ['With nextTick, the loop never reaches poll, so new items can never even arrive.'],
        }),
        bullets(
          'Assuming nextTick means "next loop iteration".',
          'Depending on nextTick vs promise order — it differs between CommonJS and ESM.',
          'Using it for CPU-heavy deferral — it delays everything else just as much.',
        ),
      ),
      section('interview', 'Interview angle',
        interviewTip('The trap is in the names: `nextTick` runs sooner than `setImmediate`. Mention that the Node docs recommend `setImmediate` for most deferral and `queueMicrotask` when you need microtask timing.'),
      ),
      section('practice', 'Practice',
        steps(
          'Run the first example as `order.cjs` and as `order.mjs`. Explain the difference.',
          'Build an emitter that validates options in its constructor and emits `\'error\'` via nextTick when they are invalid.',
        ),
      ),
      section('summary', 'Summary',
        table('nextTick vs Promise.then', ['', 'process.nextTick', 'Promise.then'],
          [['Queue', 'nextTick queue', 'Promise microtask queue'], ['Runs (CommonJS)', 'First', 'After nextTick queue'], ['Standard', 'Node only', 'ECMAScript']]),
        bullets(
          'Runs after the current operation, before promises (CommonJS) and before the loop continues.',
          'Drains completely — recursion starves I/O.',
          'Use it to keep APIs async and to emit after constructors.',
        ),
      ),
    ],
    revisionNotes: [
      'nextTick queue drains before the promise queue (CommonJS).',
      'Both drain completely before the loop moves on.',
      'In ESM entry points, top-level promise callbacks may run before nextTick.',
      'nextTick from inside a promise callback runs after the whole microtask drain.',
      'Recursive nextTick starves timers and I/O.',
      '`process.nextTick(fn, ...args)` forwards arguments.',
    ],
    quiz: [
      {
        kind: 'predict-output', difficulty: 'intermediate',
        prompt: 'What does this print (CommonJS)?',
        code: "setTimeout(() => console.log('A'));\nprocess.nextTick(() => console.log('B'));\nPromise.resolve().then(() => console.log('C'));",
        options: ['A B C', 'B C A', 'C B A', 'B A C'],
        answer: 1,
        explanation: 'nextTick queue first (B), then promise microtasks (C), then the timers phase (A).',
      },
      {
        kind: 'predict-output', difficulty: 'advanced',
        prompt: 'What does this print (CommonJS)?',
        code: "Promise.resolve().then(() => {\n  console.log('p1');\n  process.nextTick(() => console.log('tick'));\n}).then(() => console.log('p2'));",
        options: ['p1 tick p2', 'tick p1 p2', 'p1 p2 tick', 'p1 p2 (tick never runs)'],
        answer: 2,
        explanation: 'Once the microtask queue is draining it runs to completion, so `p2` (queued during the drain) runs before Node checks the nextTick queue again.',
      },
      {
        kind: 'mcq', difficulty: 'intermediate',
        prompt: 'A function keeps calling `process.nextTick(itself)`. What happens to an HTTP server in the same process?',
        options: [
          'Nothing — nextTick yields to I/O every iteration',
          'Requests are served slower but still served',
          'It stops serving requests: the event loop never gets past the nextTick queue',
          'Node throws a RangeError after 1000 ticks',
        ],
        answer: 2,
        explanation: 'The nextTick queue is drained completely, including ticks added during the drain, so the loop never reaches the poll phase. There is no built-in limit.',
      },
    ],
    interview: [
      {
        category: 'nodejs', kind: 'concept', difficulty: 'intermediate', topic: 'Event loop',
        question: 'What is the difference between process.nextTick and setImmediate?',
        shortAnswer: 'nextTick runs before the event loop continues (even before promises); setImmediate runs in the check phase of the next loop iteration.',
        detailedAnswer: [
          'nextTick: Node\'s own queue, drained after the current callback, before promise microtasks.',
          'setImmediate: a macrotask in the check phase, right after poll.',
          'Recursive nextTick starves I/O; recursive setImmediate does not (new immediates wait for the next iteration).',
          'Node docs recommend setImmediate for most "defer" use-cases.',
          'Both are Node-specific APIs.',
        ],
        followUp: 'Can process.nextTick starve the event loop?',
        trap: 'The names are backwards: "nextTick" runs sooner than "immediate".',
      },
      {
        category: 'nodejs', kind: 'concept', difficulty: 'advanced', topic: 'Event loop',
        question: 'Why do Node core APIs and EventEmitter-based libraries defer callbacks and events with process.nextTick?',
        shortAnswer: 'To guarantee asynchronous behaviour without waiting for I/O: the caller can finish its synchronous setup — attach listeners, assign variables — before the callback or event fires, and the API never mixes sync and async invocation.',
        detailedAnswer: [
          'Emitting in a constructor would fire before `.on()` is attached; nextTick fixes that.',
          'Validation errors passed to callbacks are deferred so the callback is always async.',
          'nextTick is faster than setImmediate for this because it does not wait for a loop iteration.',
          'Streams use it to emit `error`/`end`/`close` in a predictable order.',
          'Application code can usually use `queueMicrotask` instead (standard API).',
        ],
        followUp: 'When would setImmediate be the better choice?',
        trap: 'Claiming nextTick is used "to run code in parallel".',
      },
      {
        category: 'nodejs', kind: 'output', difficulty: 'advanced', topic: 'Event loop',
        question: 'In an ES module entry file, top-level code schedules a nextTick and then a promise callback. Which runs first, and why does it differ from CommonJS?',
        shortAnswer: 'The promise callback runs first. ESM evaluation happens inside a promise job, so when the module body finishes V8 is still draining microtasks; Node processes the nextTick queue only after that drain.',
        detailedAnswer: [
          'CommonJS: the main script runs synchronously; afterwards Node drains nextTicks, then microtasks.',
          'ESM: module loading is async; the body runs as part of a microtask chain.',
          'Microtasks queued in the body join the current drain and run before the tick queue is checked.',
          'Never rely on nextTick-vs-promise ordering in portable code.',
        ],
        code: {
          id: 'm05-int-esm-tick',
          language: 'javascript',
          code: "// main.mjs\nprocess.nextTick(() => console.log('nextTick'));\nPromise.resolve().then(() => console.log('promise'));\nconsole.log('sync');",
          expectedOutput: 'sync\npromise\nnextTick',
        },
        followUp: 'Inside a setTimeout callback in that same ESM file, which runs first?',
        trap: 'Answering "nextTick always runs before promises".',
      },
    ],
  },

  // ───────────────────────────────────────────────────────────
  setimmediate: {
    summary: 'setImmediate schedules a callback for the check phase, right after the poll phase; inside an I/O callback it always runs before setTimeout(fn, 0).',
    topics: ['setImmediate', 'check phase', 'clearImmediate', 'setTimeout vs setImmediate', 'yielding', 'timers/promises'],
    sections: [
      section('introduction', undefined,
        text('`setImmediate` means "run this as soon as the current batch of I/O callbacks is done". It is Node\'s tool for yielding to the event loop without an artificial delay.'),
      ),
      section('definition', 'Definition',
        bullets(
          '`setImmediate(fn, ...args)` queues `fn` in the **check** phase; returns an `Immediate` object.',
          '`clearImmediate(immediate)` cancels it.',
          'Immediates queued **during** the check phase run in the **next** loop iteration.',
          'Promise version: `const { setImmediate } = require(\'node:timers/promises\')` → `await setImmediate()`.',
          'Node-only; not a web standard.',
        ),
        schedulerTable,
      ),
      section('why', 'Why use it',
        bullets(
          'Yield in long-running work so I/O callbacks (requests, DB replies) get a turn.',
          'Run code after the current I/O callbacks complete.',
          'Unlike `setTimeout(fn, 0)`, it has no 1 ms minimum and no timer-list bookkeeping.',
        ),
      ),
      section('internals', 'setTimeout(0) vs setImmediate',
        bullets(
          '**Inside an I/O callback** (poll phase): the next phase is check, so `setImmediate` **always** runs before `setTimeout(fn, 0)`.',
          '**In the main module**: the order is **non-deterministic**. `setTimeout(fn, 0)` becomes 1 ms; whether 1 ms has elapsed when the loop first reaches the timers phase depends on process start-up speed and system load.',
          '**Inside a timer callback**: `setImmediate` runs first too — check comes before the next timers phase.',
        ),
        table('Is the order guaranteed?', ['Scheduled from', 'Order', 'Guaranteed?'], [
          ['Main module', 'timeout / immediate', '**No** — varies per run'],
          ['I/O callback (`fs.readFile`)', 'immediate, then timeout', 'Yes'],
          ['setTimeout callback', 'immediate, then timeout', 'Yes'],
          ['setImmediate callback', 'timeout first only if ≥ 1 ms passed before the next timers phase', '**No**'],
        ]),
        diagram('event-loop-phases', 'poll → check (immediate) → close → timers (timeout).'),
      ),
      section('example', 'Examples',
        code({
          title: 'Main module: order is not guaranteed',
          code: dedent(`
            setTimeout(() => console.log('timeout'), 0);
            setImmediate(() => console.log('immediate'));
          `),
          expectedOutput: 'timeout\nimmediate',
          explanation: [
            'This is *one* possible output. Run it several times — you may also get `immediate` then `timeout`.',
            'It depends on whether 1 ms passed before the loop\'s first timers phase.',
          ],
        }),
        code({
          title: 'Inside an I/O callback: immediate always first',
          code: dedent(`
            const fs = require('node:fs');

            fs.readFile(__filename, () => {
              setTimeout(() => console.log('timeout'), 0);
              setImmediate(() => console.log('immediate'));
            });
          `),
          expectedOutput: 'immediate\ntimeout',
          explanation: ['The callback runs in poll → check (immediate) → … → next timers phase (timeout). Deterministic.'],
        }),
        code({
          title: 'Immediates scheduled during check wait for the next iteration',
          code: dedent(`
            setImmediate(() => {
              console.log('immediate 1');
              setImmediate(() => console.log('immediate 3 (next iteration)'));
              process.nextTick(() => console.log('nextTick after immediate 1'));
            });
            setImmediate(() => console.log('immediate 2'));
          `),
          expectedOutput: 'immediate 1\nnextTick after immediate 1\nimmediate 2\nimmediate 3 (next iteration)',
          explanation: [
            'nextTick drains after each immediate callback.',
            '`immediate 3` was added during the check phase, so it waits for the next iteration — this is why recursive setImmediate cannot starve I/O.',
          ],
        }),
        code({
          title: 'Promise form with timers/promises',
          code: dedent(`
            const { setImmediate: nextTurn } = require('node:timers/promises');

            async function processRows(rows) {
              let done = 0;
              for (const row of rows) {
                transform(row);
                if (++done % 10_000 === 0) await nextTurn(); // let I/O run
              }
              console.log('processed', done);
            }
            const transform = () => {};
            processRows(new Array(50_000).fill(0));
          `),
          expectedOutput: 'processed 50000',
          explanation: ['Every 10 000 rows the function yields to the check phase, so pending requests are served in between.'],
          versionNote: '`timers/promises` is stable since Node 16.',
        }),
      ),
      section('real-world', 'Real-world backend usage',
        bullets(
          'Chunking CPU work (CSV transform, report generation) in a request so other requests stay responsive.',
          'Deferring follow-up work until the current batch of I/O callbacks finishes.',
          'For truly heavy CPU work, worker threads are still better: chunking only interleaves, it does not parallelise.',
        ),
      ),
      section('mistakes', 'Common mistakes',
        bullets(
          'Writing tests that assume `setTimeout(0)` runs before `setImmediate` in the main module (flaky).',
          'Using `process.nextTick` for yielding — it starves I/O; `setImmediate` does not.',
          'Assuming `setImmediate` exists in browsers.',
        ),
        code({
          title: 'Wrong vs right: deterministic ordering in a test',
          code: dedent(`
            // Wrong: flaky in the main module
            setTimeout(stepA, 0);
            setImmediate(stepB);

            // Right: chain explicitly when order matters
            setImmediate(() => {
              stepA();
              setImmediate(stepB);
            });
          `),
        }),
      ),
      section('interview', 'Interview angle',
        interviewTip('Classic question: "setTimeout(0) or setImmediate first?" The complete answer has two parts — non-deterministic in the main module, deterministic (immediate first) inside an I/O callback — plus the reason (1 ms clamp and phase order).'),
      ),
      section('practice', 'Practice',
        steps(
          'Run the main-module example 20 times in a shell loop and count each order.',
          'Move it into an `fs.readFile` callback and run it 20 times again.',
        ),
      ),
      section('summary', 'Summary',
        bullets(
          'setImmediate → check phase, after poll.',
          'Main module: order vs setTimeout(0) is non-deterministic.',
          'Inside I/O or timer callbacks: immediate first, guaranteed.',
          'Immediates added during check run next iteration — safe for yielding.',
        ),
      ),
    ],
    revisionNotes: [
      'setImmediate runs in the check phase (after poll).',
      'Main module: setTimeout(0) vs setImmediate order is non-deterministic.',
      'Inside an I/O callback: setImmediate always first.',
      'Recursive setImmediate does not starve I/O; recursive nextTick does.',
      '`clearImmediate` cancels; `timers/promises` has a promise form.',
    ],
    quiz: [
      {
        kind: 'mcq', difficulty: 'intermediate',
        prompt: 'In the main module, `setTimeout(() => log(\'T\'), 0); setImmediate(() => log(\'I\'));` — which is true?',
        options: [
          'The order is non-deterministic and can vary between runs',
          'T always prints first',
          'I always prints first',
          'Only I prints',
        ],
        answer: 0,
        explanation: 'setTimeout(0) is really 1 ms. Whether that 1 ms has passed when the loop first checks timers depends on process performance, so either order is possible.',
      },
      {
        kind: 'predict-output', difficulty: 'intermediate',
        prompt: 'What is the output?',
        code: "setTimeout(() => {\n  setTimeout(() => console.log('timeout'), 0);\n  setImmediate(() => console.log('immediate'));\n}, 10);",
        options: ['timeout, immediate', 'Either order', 'immediate only', 'immediate, timeout'],
        answer: 3,
        explanation: 'The outer callback runs in the timers phase. The loop then reaches check (immediate) before the next timers phase (timeout). Deterministic.',
      },
      {
        kind: 'predict-output', difficulty: 'advanced',
        prompt: 'What is the output?',
        code: "setImmediate(() => {\n  console.log('A');\n  setImmediate(() => console.log('B'));\n  Promise.resolve().then(() => console.log('C'));\n});\nsetImmediate(() => console.log('D'));",
        options: ['A B C D', 'A C B D', 'A D C B', 'A C D B'],
        answer: 3,
        explanation: 'After A\'s callback the microtask C runs (Node 11+). D was already queued in this check phase. B was added during check, so it runs in the next iteration.',
      },
    ],
    interview: [
      {
        category: 'nodejs', kind: 'output', difficulty: 'advanced', topic: 'Event loop',
        question: 'Is the order of setTimeout(fn, 0) and setImmediate(fn) deterministic? Explain both the main-module case and the I/O-callback case.',
        shortAnswer: 'In the main module it is not deterministic — it depends on whether 1 ms elapsed before the first timers phase. Inside an I/O callback setImmediate always runs first, because check follows poll before the loop wraps around to timers.',
        detailedAnswer: [
          'setTimeout delays below 1 are clamped to 1 ms.',
          'Main module: if start-up took ≥ 1 ms, the timer is due at the first timers phase → timeout first; otherwise immediate first.',
          'I/O callback (poll) → check → close → timers: immediate always wins.',
          'The same holds inside a setTimeout callback (timers → … → check → next timers).',
          'Never encode a dependency on the main-module order.',
        ],
        code: {
          id: 'm05-int-timeout-vs-immediate',
          language: 'javascript',
          code: "const fs = require('node:fs');\nfs.readFile(__filename, () => {\n  setTimeout(() => console.log('timeout'), 0);\n  setImmediate(() => console.log('immediate'));\n});",
          expectedOutput: 'immediate\ntimeout',
        },
        followUp: 'Why can recursive setImmediate not starve I/O while recursive nextTick can?',
        trap: 'Answering "setTimeout(0) always runs first because it was scheduled first".',
      },
      {
        category: 'nodejs', kind: 'concept', difficulty: 'intermediate', topic: 'Event loop',
        question: 'Why is setImmediate a better choice than process.nextTick or a resolved promise for breaking a long task into chunks?',
        shortAnswer: 'Because setImmediate is a macrotask in the check phase: between chunks the loop runs poll, so pending I/O and requests are processed. nextTick and microtasks drain completely before the loop continues, so they never let I/O in.',
        detailedAnswer: [
          'Immediates queued during check run in the next iteration — guaranteed progress for other work.',
          'nextTick/microtask recursion keeps the loop stuck between callbacks.',
          'setTimeout(fn, 0) also yields but adds ≥ 1 ms per chunk.',
          'Chunking keeps latency low but does not use extra cores — use worker threads for heavy CPU.',
        ],
        followUp: 'How would you choose the chunk size?',
        trap: 'Saying any async API "yields to the event loop".',
      },
    ],
  },

  // ───────────────────────────────────────────────────────────
  settimeout: {
    summary: 'setTimeout schedules a callback for the timers phase after at least the given delay (minimum 1 ms); in Node it returns a Timeout object with ref/unref/refresh.',
    topics: ['setTimeout', 'clearTimeout', 'setInterval', 'Timeout object', 'unref', 'refresh', 'timers/promises', 'minimum delay', 'drift'],
    sections: [
      section('introduction', undefined,
        text('Retries with backoff, request timeouts, debouncing, cache expiry, scheduled cleanup — backends use timers everywhere. The key thing to remember: the delay is a **minimum**, never a guarantee.'),
      ),
      section('definition', 'Definition',
        bullets(
          '`setTimeout(fn, delay, ...args)` runs `fn(...args)` in a future **timers phase**, no sooner than `delay` ms.',
          'Delays `< 1` (including `0`) or `> 2147483647` are set to **1 ms** (the latter with a `TimeoutOverflowWarning`).',
          'In Node it returns a **`Timeout` object** (browsers return a number). It has `ref()`, `unref()`, `hasRef()`, `refresh()` and converts to a numeric id.',
          '`setInterval` repeats; `clearTimeout`/`clearInterval` cancel.',
          'Promise forms: `require(\'node:timers/promises\')` → `setTimeout(ms, value, { signal })`, `setInterval` async iterator.',
        ),
      ),
      section('why', 'Why it matters',
        bullets(
          'Correct timeout and retry logic depends on understanding the minimum-delay semantics.',
          'Leaked timers keep processes alive and leak memory.',
          '`unref()` is how background timers avoid blocking shutdown.',
        ),
      ),
      section('internals', 'How Node stores timers',
        bullets(
          'Timers with the same duration share a linked list; lists are ordered in a priority queue by next expiry.',
          'libuv runs one underlying timer for the soonest expiry; in the timers phase Node runs every expired timer in order.',
          'A timer fires only when the loop reaches the timers phase — if a callback blocks for 300 ms, a 10 ms timer fires ~300 ms late.',
          'Since Node 11, microtasks drain after **each** timer callback.',
          '`setInterval` schedules the next run relative to when the callback *started*; if callbacks are slow, runs can bunch up or drift.',
        ),
        flow(['setTimeout(fn, 50)', 'inserted in the 50 ms list', 'loop: poll waits until the nearest expiry', 'timers phase: expired → fn runs', 'microtasks drain'], { direction: 'horizontal' }),
      ),
      section('example', 'Examples',
        code({
          title: '0 is clamped to 1 ms',
          code: dedent(`
            setTimeout(() => console.log('scheduled first with 1ms'), 1);
            setTimeout(() => console.log('scheduled second with 0ms'), 0);
          `),
          expectedOutput: 'scheduled first with 1ms\nscheduled second with 0ms',
          explanation: [
            'Both become 1 ms timers in the same list, so they fire in creation order.',
            'If 0 were truly "0", the second would run first.',
          ],
          runnable: true,
        }),
        code({
          title: 'The delay is a minimum',
          code: dedent(`
            const start = Date.now();
            setTimeout(() => {
              const waited = Date.now() - start;
              console.log('asked for 20ms, waited at least 150ms:', waited >= 150);
            }, 20);
            while (Date.now() - start < 150) {} // busy main thread
          `),
          expectedOutput: 'asked for 20ms, waited at least 150ms: true',
          explanation: ['The timer expired at 20 ms but could only run once the stack was free.'],
          runnable: true,
        }),
        code({
          title: 'Debounce with clearTimeout',
          code: dedent(`
            function debounce(fn, ms) {
              let timer;
              return (...args) => {
                clearTimeout(timer);
                timer = setTimeout(() => fn(...args), ms);
              };
            }

            const save = debounce((v) => console.log('saving', v), 30);
            save('a');
            save('ab');
            save('abc');
            setTimeout(() => save('abcd'), 100);
          `),
          expectedOutput: 'saving abc\nsaving abcd',
          explanation: ['Each call cancels the pending timer; only the last call in a burst fires.'],
          runnable: true,
        }),
        code({
          title: 'Recursive setTimeout instead of setInterval',
          code: dedent(`
            let runs = 0;
            function poll() {
              runs++;
              console.log('poll', runs);
              if (runs < 3) setTimeout(poll, 20); // next run starts 20ms AFTER this one finished
            }
            poll();
          `),
          expectedOutput: 'poll 1\npoll 2\npoll 3',
          explanation: ['With async work inside, recursive timeouts never overlap; `setInterval` would fire again even if the previous run is still awaiting.'],
          runnable: true,
        }),
        code({
          title: 'timers/promises with AbortSignal',
          code: dedent(`
            const { setTimeout: sleep } = require('node:timers/promises');

            (async () => {
              console.log('waiting...');
              const value = await sleep(100, 'done');
              console.log(value);

              const ac = new AbortController();
              const pending = sleep(1000, null, { signal: ac.signal });
              ac.abort();
              try {
                await pending;
              } catch (err) {
                console.log(err.name);
              }
            })();
          `),
          expectedOutput: 'waiting...\ndone\nAbortError',
          explanation: ['`sleep(ms, value)` resolves with `value`.', 'Aborting rejects with an `AbortError` and clears the timer.'],
          versionNote: 'Stable since Node 16.',
        }),
        code({
          title: 'The Timeout object: unref and refresh',
          code: dedent(`
            const t = setTimeout(() => console.log('idle timeout!'), 1000);
            console.log(typeof t, t.hasRef());
            t.unref();
            console.log(t.hasRef());
            // t.refresh() would restart the countdown (e.g. on activity) without a new object
          `),
          expectedOutput: 'object true\nfalse',
          explanation: ['Node returns an object, not a number.', 'After `unref()` nothing else keeps the loop alive, so the process exits and the callback never runs.'],
        }),
      ),
      section('real-world', 'Real-world backend usage',
        bullets(
          'Retry with exponential backoff: `await sleep(base * 2 ** attempt + jitter)`.',
          'Idle-connection timeouts: `timer.refresh()` on each activity instead of clear + set.',
          'Periodic jobs (metrics flush, cache cleanup) with `unref()` so they do not block shutdown.',
          'For real scheduling (cron, "every day at 02:00"), use a job scheduler — timers are lost when the process restarts.',
        ),
      ),
      section('mistakes', 'Common mistakes',
        bullets(
          'Expecting exact timing; timers can be late under load (never early).',
          'Not clearing timeouts after the work completes (leaks, process stays alive).',
          '`setInterval` with async callbacks that take longer than the interval → overlapping runs.',
          'Passing a string as the callback (works in browsers via eval, throws in Node).',
          'Delays over ~24.8 days (2^31-1 ms) silently become 1 ms.',
        ),
        code({
          title: 'Wrong vs right: overlapping intervals',
          code: dedent(`
            // Wrong: if syncInventory takes 8 s, runs overlap
            setInterval(async () => {
              await syncInventory();
            }, 5000);

            // Right: schedule the next run after the current one finishes
            async function loop() {
              try {
                await syncInventory();
              } catch (err) {
                logger.error(err);
              } finally {
                setTimeout(loop, 5000).unref();
              }
            }
            loop();
          `),
          explanation: ['The `try/finally` also ensures one failed run does not stop future runs or crash with an unhandled rejection.'],
        }),
      ),
      section('interview', 'Interview angle',
        interviewTip('Mention three Node specifics: 1 ms minimum, the `Timeout` object with `unref()`, and `timers/promises`. Then explain why a timer can fire late (blocked loop).'),
      ),
      section('practice', 'Practice',
        steps(
          'Write `retry(fn, { retries, baseMs })` with exponential backoff using `timers/promises`.',
          'Write an idle-timeout helper that uses `refresh()` and cleans up with `clearTimeout`.',
        ),
      ),
      section('summary', 'Summary',
        bullets(
          'Delay is a minimum; 0 → 1 ms; very large values → 1 ms.',
          'Runs in the timers phase; late if the loop is busy.',
          'Node returns a `Timeout` object (`ref`/`unref`/`refresh`).',
          'Prefer recursive setTimeout for async polling.',
          'Use `timers/promises` + `AbortSignal` in async code.',
        ),
      ),
    ],
    revisionNotes: [
      'Minimum delay 1 ms; delay is a lower bound, not exact.',
      'Delays > 2147483647 ms → 1 ms + TimeoutOverflowWarning.',
      'Returns `Timeout` object; `unref()` lets the process exit.',
      'Same-duration timers fire in creation order.',
      '`setInterval` + slow async callback → overlap; use recursive setTimeout.',
      '`timers/promises` setTimeout supports AbortSignal (rejects with AbortError).',
    ],
    quiz: [
      {
        kind: 'predict-output', difficulty: 'intermediate',
        prompt: 'What is the output?',
        code: "setTimeout(() => console.log('one'), 1);\nsetTimeout(() => console.log('zero'), 0);",
        options: ['zero, one', 'one, zero', 'Random order', 'Only zero'],
        answer: 1,
        explanation: 'A 0 ms delay is clamped to 1 ms, so both timers have the same duration and fire in creation order.',
      },
      {
        kind: 'mcq', difficulty: 'beginner',
        prompt: '`setTimeout(fn, 1000)` guarantees that `fn` runs...',
        options: [
          'exactly 1000 ms later',
          'no sooner than ~1000 ms later, possibly later if the loop is busy',
          'within 1000 ms',
          'after 1000 ms of idle CPU time',
        ],
        answer: 1,
        explanation: 'The delay is a minimum. The callback runs in the first timers phase after it expires, which may be later if other callbacks are running.',
      },
      {
        kind: 'predict-output', difficulty: 'intermediate',
        prompt: 'What is the output?',
        code: "const t = setTimeout(() => console.log('A'), 10);\nsetTimeout(() => console.log('B'), 20);\nclearTimeout(t);\nsetTimeout(() => console.log('C'), 5);",
        options: ['A C B', 'C B', 'C A B', 'B C'],
        answer: 1,
        explanation: '`A` is cancelled before it can fire. The remaining timers fire by expiry: C (5 ms), then B (20 ms).',
      },
    ],
    interview: [
      {
        category: 'nodejs', kind: 'concept', difficulty: 'beginner', topic: 'Timers',
        question: 'Does setTimeout(fn, 1000) run fn after exactly one second?',
        shortAnswer: 'No. The delay is a minimum: `fn` runs in the first timers phase after 1000 ms have passed, which can be later if the event loop is busy with other callbacks.',
        detailedAnswer: [
          'Timers never fire early, but can fire late.',
          'A blocking callback delays all timers.',
          'Delays below 1 ms become 1 ms.',
          'For precise scheduling you need a different design (e.g. a scheduler or comparing timestamps).',
        ],
        followUp: 'How would you measure how late timers are firing in production?',
        trap: 'Answering "yes, unless you call clearTimeout".',
      },
      {
        category: 'nodejs', kind: 'concept', difficulty: 'intermediate', topic: 'Timers',
        question: 'What does setTimeout return in Node.js, and what are unref() and refresh() for?',
        shortAnswer: 'A `Timeout` object (not a number as in browsers). `unref()` stops the timer from keeping the process alive; `refresh()` restarts its countdown with the same callback, useful for idle timeouts.',
        detailedAnswer: [
          '`clearTimeout` accepts the object (or its numeric primitive).',
          '`unref()` is used for background jobs, so shutdown is not blocked.',
          '`hasRef()` tells you whether it is ref\'d; `ref()` reverses `unref()`.',
          '`refresh()` avoids allocating a new timer on every activity event.',
          'The object converts to a number via `Symbol.toPrimitive`, so it can be stored as an id.',
        ],
        followUp: 'Why might a CLI tool never exit even though its work is done?',
        trap: 'Assuming the browser behaviour (numeric id) in TypeScript types — Node\'s type is `NodeJS.Timeout`.',
      },
      {
        category: 'nodejs', kind: 'scenario', difficulty: 'intermediate', topic: 'Timers',
        question: 'You need to poll an external API every 5 seconds, and each call can take up to 10 seconds. Would you use setInterval or recursive setTimeout?',
        shortAnswer: 'Recursive setTimeout: schedule the next poll after the current one finishes. setInterval fires on schedule regardless, so slow calls would overlap, pile up and multiply load.',
        detailedAnswer: [
          'setInterval does not wait for async work inside the callback.',
          'Recursive setTimeout gives a fixed gap between runs (not a fixed rate).',
          'Wrap in try/catch/finally so a failure does not stop the loop or cause unhandled rejections.',
          'Add jitter and backoff on errors; `unref()` the timer so shutdown is not blocked.',
          'Or use `for await (const _ of setInterval(5000))` from timers/promises, which also waits for each iteration.',
        ],
        followUp: 'How would you stop the poller cleanly during graceful shutdown?',
        trap: 'Using setInterval with an `isRunning` flag but forgetting to reset it on errors.',
      },
    ],
  },

  // ───────────────────────────────────────────────────────────
  'execution-order': {
    summary: 'Node runs the synchronous script first, then the nextTick queue, then promise microtasks, then loop phases (timers → poll → check → close) — draining nextTick and microtasks again after every single callback.',
    topics: ['execution order', 'output questions', 'call stack', 'nextTick', 'microtasks', 'timers', 'setImmediate', 'async/await order'],
    sections: [
      section('introduction', undefined,
        text('"Predict the output" is the most common Node interview question. With five rules you can solve almost any of them.'),
      ),
      section('definition', 'The rules',
        steps(
          '**Synchronous code** runs first, top to bottom (including the body of `new Promise` executors and async functions up to their first `await`).',
          'When the stack empties: drain the **nextTick queue** completely.',
          'Then drain the **promise microtask queue** completely (`then`, `await` continuations, `queueMicrotask`). If it schedules nextTicks, go back to step 2.',
          'Then the event loop: **timers → pending → poll → check → close**, one callback at a time.',
          'After **each** callback, repeat steps 2–3 (Node 11+).',
        ),
        note('Caveats: in an ES module entry, top-level promise callbacks can run before nextTick callbacks. In the main module, `setTimeout(0)` vs `setImmediate` is non-deterministic.'),
      ),
      section('why', 'Why it matters',
        bullets(
          'Ordering bugs are real: emitting before listeners attach, reading state before it is set, flaky tests.',
          'You can only reason about latency (what waits for what) if you know the order.',
        ),
      ),
      section('internals', 'Visualise it',
        diagram('event-loop-simulator', 'Load the puzzle below into the simulator and step through each queue.'),
        flow([
          'Call stack: sync code',
          'nextTick queue: drained',
          'Microtask queue: drained',
          'Timers phase',
          'Poll phase (I/O)',
          'Check phase (setImmediate)',
          'Close callbacks',
        ], { title: 'One full pass', direction: 'vertical', caption: 'After every callback in any phase: nextTick queue → microtask queue.' }),
      ),
      section('example', 'Examples',
        code({
          title: 'Pure JavaScript: sync, await, then, timer',
          code: dedent(`
            console.log('1');
            setTimeout(() => console.log('6'), 0);

            (async () => {
              console.log('2');
              await null;
              console.log('4');
            })();

            Promise.resolve().then(() => console.log('5'));
            console.log('3');
          `),
          expectedOutput: '1\n2\n3\n4\n5\n6',
          explanation: [
            'Sync: 1, 2 (async body before await), 3.',
            'Microtasks in queue order: the await continuation (4) was queued before the `.then` (5).',
            'Timers phase: 6.',
          ],
          runnable: true,
        }),
        code({
          title: 'Full Node puzzle (CommonJS)',
          code: dedent(`
            console.log('1 sync');

            setTimeout(() => {
              console.log('5 timeout');
              setImmediate(() => console.log('8 immediate (check phase)'));
              setTimeout(() => console.log('9 timeout (next loop iteration)'), 0);
              process.nextTick(() => console.log('6 nextTick inside timeout'));
              Promise.resolve().then(() => console.log('7 promise inside timeout'));
            }, 0);

            Promise.resolve().then(() => console.log('4 promise'));
            process.nextTick(() => console.log('3 nextTick'));
            console.log('2 sync');
          `),
          expectedOutput: '1 sync\n2 sync\n3 nextTick\n4 promise\n5 timeout\n6 nextTick inside timeout\n7 promise inside timeout\n8 immediate (check phase)\n9 timeout (next loop iteration)',
          explanation: [
            'Sync: 1, 2. Then nextTick (3) before promise (4), even though the promise was scheduled first.',
            'Timers phase: 5. After that callback: its nextTick (6), then its promise (7).',
            'From the timers phase, the loop reaches check (8) before the next timers phase (9).',
          ],
        }),
        code({
          title: 'Inside an I/O callback',
          code: dedent(`
            const fs = require('node:fs');

            fs.readFile(__filename, () => {
              console.log('A readFile callback (poll)');
              setTimeout(() => console.log('E timeout'), 0);
              setImmediate(() => console.log('D immediate'));
              Promise.resolve().then(() => console.log('C promise'));
              process.nextTick(() => console.log('B nextTick'));
            });
          `),
          expectedOutput: 'A readFile callback (poll)\nB nextTick\nC promise\nD immediate\nE timeout',
          explanation: ['After the poll callback: nextTick, promise, then check (immediate), then timers on the next iteration.'],
        }),
        code({
          title: 'Chains, nested timers and microtasks',
          code: dedent(`
            setTimeout(() => console.log('timeout A'), 0);

            Promise.resolve()
              .then(() => {
                console.log('then 1');
                setTimeout(() => console.log('timeout B'), 0);
                queueMicrotask(() => console.log('microtask inside then 1'));
              })
              .then(() => console.log('then 2'));

            console.log('sync');
          `),
          expectedOutput: 'sync\nthen 1\nmicrotask inside then 1\nthen 2\ntimeout A\ntimeout B',
          explanation: [
            '`then 1` queues a microtask; then its promise settles and queues `then 2` behind it.',
            'Timer A was created before timer B, so it fires first.',
          ],
          runnable: true,
        }),
      ),
      section('real-world', 'Real-world backend usage',
        bullets(
          'Logging and tracing: a log inside `.then` appears before a timer-based retry even if scheduled later.',
          'Event emitters: listeners attached synchronously after creating an object will catch events emitted via nextTick or later.',
          'Tests: prefer `await` on explicit promises over guessing timing with `setTimeout(0)`.',
        ),
      ),
      section('mistakes', 'Common mistakes',
        bullets(
          'Thinking `setTimeout(0)` runs immediately after the current line.',
          'Forgetting that the executor and the async body before `await` are synchronous.',
          'Treating nextTick and promises as one queue.',
          'Assuming main-module `setTimeout(0)` vs `setImmediate` order.',
          'Applying CommonJS rules blindly to ESM entry files.',
        ),
        code({
          title: 'Wrong vs right: relying on timing instead of awaiting',
          code: dedent(`
            // Wrong: hopes the write finished "by the next tick"
            cache.set('user:1', user);
            setTimeout(() => readFromCache('user:1'), 0);

            // Right: wait for the operation itself
            await cache.set('user:1', user);
            await readFromCache('user:1');
          `),
        }),
      ),
      section('interview', 'Interview angle',
        interviewTip('Talk through the queues out loud as you solve: "sync: …; nextTick: …; microtasks: …; timers: …". Interviewers grade the reasoning more than the final line.'),
      ),
      section('practice', 'Practice',
        steps(
          'Write a puzzle with 2 timers, 2 promises, 1 nextTick and 1 async function. Predict, then run.',
          'Paste it into the simulator and verify each step.',
          'Run the same file as `.mjs` and explain any difference.',
        ),
      ),
      section('summary', 'Summary',
        bullets(
          'Sync → nextTick → microtasks → timers → poll → check → close.',
          'After every callback: nextTick → microtasks.',
          'Executors and pre-await code are sync.',
          'Inside I/O: immediate before timeout; main module: undefined order.',
          'ESM entry: promises may beat nextTick.',
        ),
      ),
    ],
    revisionNotes: [
      'Order: sync, nextTick, microtasks, then phases; repeat micro-drain after each callback.',
      'Await continuation queued at the `await`; `.then` queued when its promise settles.',
      'From a timer or I/O callback: setImmediate before the next setTimeout(0).',
      'Main module setTimeout(0) vs setImmediate: non-deterministic.',
      'ESM top level: promise callbacks can run before nextTick.',
    ],
    quiz: [
      {
        kind: 'predict-output', difficulty: 'intermediate',
        prompt: 'What is the output (CommonJS)?',
        code: "console.log('A');\nsetTimeout(() => console.log('B'), 0);\nPromise.resolve().then(() => console.log('C'));\nprocess.nextTick(() => console.log('D'));\n(async () => { console.log('E'); await null; console.log('F'); })();\nconsole.log('G');",
        options: ['A E G D C F B', 'A G E D C F B', 'A E G C F D B', 'A E D G C F B'],
        answer: 0,
        explanation: 'Sync: A, E (async body before await), G. nextTick: D. Microtasks in queue order: C, then F. Timers: B.',
      },
      {
        kind: 'predict-output', difficulty: 'advanced',
        prompt: 'What is the output (CommonJS)?',
        code: "setTimeout(() => {\n  console.log('t1');\n  process.nextTick(() => console.log('n1'));\n  Promise.resolve().then(() => console.log('p1'));\n}, 0);\nsetTimeout(() => console.log('t2'), 0);",
        options: ['t1 t2 n1 p1', 't1 p1 n1 t2', 't1 n1 p1 t2', 'n1 p1 t1 t2'],
        answer: 2,
        explanation: 'After t1\'s callback Node drains nextTick (n1) and then promises (p1) before running t2 (Node 11+).',
      },
      {
        kind: 'predict-output', difficulty: 'advanced',
        prompt: 'What is the output?',
        code: "const fs = require('node:fs');\nfs.readFile(__filename, () => {\n  setTimeout(() => console.log('T'), 0);\n  setImmediate(() => console.log('I'));\n  process.nextTick(() => console.log('N'));\n});\nPromise.resolve().then(() => console.log('P'));",
        options: ['P N I T', 'N P I T', 'P N T I', 'P I N T'],
        answer: 0,
        explanation: 'P runs right after the main script. Later, in poll, the readFile callback queues work: nextTick N first, then check phase I, then the next timers phase T.',
      },
      {
        kind: 'predict-output', difficulty: 'intermediate',
        prompt: 'What is the output?',
        code: "async function a() {\n  console.log(1);\n  await b();\n  console.log(2);\n}\nasync function b() {\n  console.log(3);\n  await null;\n  console.log(4);\n}\na();\nPromise.resolve().then(() => console.log(6));\nconsole.log(5);",
        options: ['1 3 5 4 2 6', '1 3 5 6 4 2', '1 3 5 4 6 2', '1 3 4 5 6 2'],
        answer: 2,
        explanation: 'Sync: 1, 3 (b runs until its await), 5. Microtask queue: [b resumes, log 6]. b logs 4 and finishes; only now is a\'s continuation queued — behind 6. So 6 comes before 2.',
      },
    ],
    interview: [
      {
        category: 'nodejs', kind: 'output', difficulty: 'advanced', topic: 'Execution order',
        question: 'Walk through the output of a script mixing sync logs, process.nextTick, a promise, setTimeout and a setImmediate scheduled from inside the timer.',
        code: {
          id: 'm05-int-full-order',
          language: 'javascript',
          code: "console.log('a');\nsetTimeout(() => {\n  console.log('b');\n  setImmediate(() => console.log('c'));\n  process.nextTick(() => console.log('d'));\n}, 0);\nPromise.resolve().then(() => console.log('e'));\nprocess.nextTick(() => console.log('f'));\nconsole.log('g');",
          expectedOutput: 'a\ng\nf\ne\nb\nd\nc',
        },
        shortAnswer: '`a g f e b d c`: sync first, then nextTick (f) before the promise (e), then the timer (b), its nextTick (d), and finally the immediate in the check phase (c).',
        detailedAnswer: [
          'Sync: a, g.',
          'End of main script: nextTick queue (f) then microtasks (e).',
          'Timers phase: b; after the callback, nextTick d.',
          'The loop continues to check: c.',
          'Scheduling setImmediate from a timer makes its order deterministic.',
        ],
        followUp: 'What changes if this file is an ES module?',
        trap: 'Putting e before f because the promise was scheduled first.',
      },
      {
        category: 'javascript', kind: 'output', difficulty: 'intermediate', topic: 'Execution order',
        question: 'When an async function awaits another async function that itself awaits, in what order do the logs before and after each await appear relative to synchronous code?',
        code: {
          id: 'm05-int-nested-await',
          language: 'javascript',
          code: "async function a() {\n  console.log(1);\n  await b();\n  console.log(2);\n}\nasync function b() {\n  console.log(3);\n  await null;\n  console.log(4);\n}\na();\nconsole.log(5);",
          expectedOutput: '1\n3\n5\n4\n2',
          runnable: true,
        },
        shortAnswer: '`1 3 5 4 2`. Both functions run synchronously up to their first await; the caller continues (5); then b resumes (4), resolving its promise, which finally lets a resume (2).',
        detailedAnswer: [
          'Calling `a()` runs `console.log(1)` and then calls `b()` synchronously.',
          '`b` logs 3 and suspends at `await null`, returning a pending promise.',
          '`a` suspends waiting for that promise; control returns to the top level → 5.',
          'Microtask: b resumes → 4 → b\'s promise fulfills → a\'s continuation is queued → 2.',
        ],
        followUp: 'Where would a Promise.resolve().then(() => log(6)) placed after a() appear?',
        trap: 'Assuming `a` continues as soon as `b` reaches its await.',
      },
    ],
  },
};

export default content;
