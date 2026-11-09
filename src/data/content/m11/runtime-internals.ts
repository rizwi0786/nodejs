import type { ModuleContent } from '../../../types';
import {
  bullets, code, dedent, diagram, flow, interviewTip, note, section, steps, table, text,
} from '../helpers';

const content: Partial<ModuleContent> = {
  // ───────────────────────────────────────────────────────────
  'deep-understanding-of-event-loop': {
    summary: "The event loop is libuv's `uv_run` cycle — timers, pending, idle/prepare, poll, check, close — and its health (loop lag) decides your server's latency.",
    topics: ['uv_run', 'libuv phases', 'idle/prepare', 'poll timeout', 'event loop lag', 'monitorEventLoopDelay', 'eventLoopUtilization', 'blocked event loop'],
    sections: [
      section('introduction', undefined,
        text("Module 5 showed the phase names and the nextTick/promise ordering. This lesson opens libuv itself: what `uv_run` does on each iteration, how it decides how long to sleep, and how to **measure** when your loop is sick."),
        text("For a backend engineer the event loop is not trivia — every millisecond the loop is busy is a millisecond every in-flight request waits."),
      ),
      section('definition', 'Definition',
        text("The event loop is the `uv_run(loop, UV_RUN_DEFAULT)` call that Node enters after your entry script finishes. It repeatedly runs due callbacks and blocks in the OS polling API (`epoll`, `kqueue`, IOCP) until there is more work."),
        bullets(
          "**Loop alive** — the loop keeps running while there are active, *ref'd* handles (servers, timers, sockets) or pending requests (fs, dns).",
          "**Loop lag / delay** — how late a callback runs compared to when it *could* have run. The key health metric.",
          "**Loop utilization (ELU)** — fraction of time the loop spent running JS/callbacks vs. idle in poll.",
        ),
      ),
      section('why', 'Why go deeper',
        bullets(
          "p99 latency spikes are very often a blocked loop, not a slow database.",
          "Understanding poll timeout explains why `setImmediate` vs `setTimeout(0)` order differs inside vs outside I/O callbacks.",
          "Autoscaling and health checks should use loop delay / ELU, not just CPU %.",
        ),
      ),
      section('internals', 'What one uv_run iteration does',
        steps(
          "**Update loop time** — libuv caches `now` once per iteration (`uv_update_time`), so all timers in a batch compare against the same clock.",
          "**Timers** — run every timer whose threshold `<= now` (min-heap ordered by expiry). This is `setTimeout`/`setInterval`.",
          "**Pending callbacks** — I/O callbacks deferred from the previous iteration (e.g. some TCP errors, write completions).",
          "**Idle handles** — run every iteration *before* polling. Node uses an idle handle to force a zero poll timeout while immediates are queued.",
          "**Prepare handles** — run right before blocking for I/O. Node uses prepare/check for loop-timing instrumentation.",
          "**Poll** — compute a timeout, then block in `epoll_wait`/`kevent`/`GetQueuedCompletionStatus`. Ready I/O callbacks (socket data, thread-pool completions) run here.",
          "**Check** — `setImmediate` callbacks run here, right after poll.",
          "**Close callbacks** — `'close'` handlers for handles closed with `uv_close` (e.g. `socket.destroy()`).",
          "Between **every** callback Node drains `process.nextTick` then the promise microtask queue.",
        ),
        table('How the poll timeout is calculated (uv_backend_timeout)', ['Condition', 'Poll timeout', 'Effect'], [
          ['Loop is stopping or has no active handles/requests', '0', 'Return immediately; loop may exit'],
          ['Idle handles active (Node: pending setImmediate)', '0', "Don't sleep — check phase must run soon"],
          ['Pending callbacks or closing handles queued', '0', "Don't sleep — there is work"],
          ['Timers exist', 'time until nearest timer', 'Sleep exactly until the next timer is due'],
          ['No timers, only I/O handles (e.g. a listening server)', '-1 (infinite)', 'Sleep until the OS reports I/O'],
        ]),
        note("Since libuv 1.45 (Node 20+) `uv_run` runs timers once before entering the loop and then at the *end* of each iteration (after close callbacks). The cyclic order timers → pending → idle/prepare → poll → check → close is unchanged."),
        diagram('event-loop-phases', 'Phases of one iteration; nextTick + microtasks drain between every callback.'),
      ),
      section('visual', 'Step through it',
        diagram('event-loop-simulator', 'Step through call stack, microtasks and macrotasks to see why a long sync task delays every queued callback.'),
      ),
      section('example', 'Seeing and measuring loop lag',
        code({
          title: 'A blocked loop makes timers late',
          code: dedent(`
            const start = Date.now();
            setTimeout(() => {
              const late = Date.now() - start;
              console.log('timer wanted 10ms, fired late:', late >= 200);
            }, 10);

            // Simulate a CPU-heavy request handler (JSON parse, regex, crypto...)
            while (Date.now() - start < 200) {}
            console.log('sync work done');
          `),
          expectedOutput: 'sync work done\ntimer wanted 10ms, fired late: true',
          explanation: [
            'The timer is due after 10 ms, but the loop cannot reach the timers phase while the `while` loop owns the thread.',
            'Only after ~200 ms of sync work does the stack empty and the loop run the timer.',
            'Every HTTP request arriving during those 200 ms waits too — that is the "blocked loop" symptom.',
          ],
          runnable: true,
        }),
        code({
          title: 'Production metric: monitorEventLoopDelay + ELU',
          code: dedent(`
            import { monitorEventLoopDelay, performance } from 'node:perf_hooks';

            const h = monitorEventLoopDelay({ resolution: 20 }); // sample every 20ms
            h.enable();
            let lastElu = performance.eventLoopUtilization();

            setInterval(() => {
              const elu = performance.eventLoopUtilization(lastElu); // delta since last call
              lastElu = performance.eventLoopUtilization();
              console.log({
                p50ms: (h.percentile(50) / 1e6).toFixed(1),   // values are nanoseconds
                p99ms: (h.percentile(99) / 1e6).toFixed(1),
                maxms: (h.max / 1e6).toFixed(1),
                elu: elu.utilization.toFixed(2),
              });
              h.reset();
            }, 10_000).unref();
          `),
          expectedOutput: "{ p50ms: '20.1', p99ms: '21.3', maxms: '24.8', elu: '0.07' }\n(numbers vary — a healthy idle loop shows p99 close to the resolution)",
          explanation: [
            '`monitorEventLoopDelay` uses a libuv timer internally and records how late it fires into an HDR histogram.',
            'Values are in **nanoseconds**; divide by `1e6` for ms. The baseline is roughly the `resolution`.',
            '`eventLoopUtilization()` returns `{ idle, active, utilization }`; passing a previous reading gives the delta.',
            '`.unref()` keeps the metrics interval from holding the process open.',
          ],
          versionNote: 'monitorEventLoopDelay: Node 11.10+. performance.eventLoopUtilization: Node 14.10+ / 12.19+.',
        }),
      ),
      section('real-world', 'Real-world backend usage',
        bullets(
          "Export `p99` loop delay and ELU to Prometheus; alert when p99 delay > 100 ms.",
          "Use loop delay as a **load-shedding** signal: return `503` early when lag is high instead of queueing more work (libraries such as `under-pressure` for Fastify do this — third-party).",
          "Symptoms of a blocked loop: health checks time out while CPU is at 100% on one core, all endpoints slow down at once (even trivial ones), timers and keep-alive pings fire late, WebSocket clients disconnect.",
          "Usual culprits: `JSON.parse`/`stringify` of multi-MB payloads, sync `fs`/`crypto`/`zlib` calls, catastrophic regex backtracking, huge array sorts, `bcrypt` sync hashing.",
        ),
        table('Health signals compared', ['Signal', 'Tells you', 'Blind spot'], [
          ['CPU %', 'Process is busy', "Can't tell useful work from a stuck loop; multi-core averages hide one hot core"],
          ['Event loop delay (p99)', 'How long callbacks wait', 'Needs sampling resolution tuned'],
          ['ELU', 'Fraction of time loop is busy', 'Saturation, not latency'],
          ['Request latency', 'User impact', "Doesn't explain the cause"],
        ]),
      ),
      section('mistakes', 'Common mistakes',
        bullets(
          "Thinking `setTimeout(fn, 10)` means *exactly* 10 ms — it means *at least* 10 ms, then whenever the loop gets there.",
          "Measuring lag with a hand-rolled `setInterval` drift calculation and no histogram — you lose p99 spikes.",
          "Assuming more `async` keywords make CPU work non-blocking. `async` functions still run synchronously until the first `await`.",
        ),
        code({
          title: 'Wrong vs right: wrapping CPU work in a promise',
          code: dedent(`
            // Wrong: Still blocks: the executor runs synchronously on the main thread
            app.get('/report', async (req, res) => {
              const result = await new Promise((resolve) => resolve(buildHugeReport()));
              res.json(result);
            });

            // Right: Move the CPU work off the loop (worker thread / pool)
            app.get('/report', async (req, res) => {
              const result = await pool.run({ month: req.query.month }); // e.g. piscina worker pool
              res.json(result);
            });
          `),
          explanation: ['A Promise executor is synchronous; the promise only changes *when* the result is delivered, not *where* the CPU work runs.'],
        }),
      ),
      section('interview', 'Interview angle',
        interviewTip("Draw the phases and then say what *your* code would hit: an HTTP request callback runs in **poll**, its `await db.query()` continuation is a **microtask**, `setImmediate` in **check**. Then explain how you would *measure* loop health in production."),
      ),
      section('practice', 'Practice',
        steps(
          "Add `monitorEventLoopDelay` logging to an Express app and hit it with `autocannon`.",
          "Add a route that does `crypto.pbkdf2Sync(...)` and watch p99 delay jump for **all** routes.",
          "Replace it with the async `crypto.pbkdf2` and compare.",
        ),
      ),
      section('summary', 'Summary',
        bullets(
          "One iteration: timers → pending → idle → prepare → poll → check → close (microtasks between callbacks).",
          "Poll blocks for: 0 if immediates/pending work exist, time-to-next-timer if timers exist, otherwise indefinitely.",
          "Loop delay p99 and ELU are the right health metrics; CPU % alone is misleading.",
          "Any synchronous CPU work delays every concurrent request.",
        ),
      ),
    ],
    revisionNotes: [
      'uv_run phases: timers, pending, idle, prepare, poll, check, closing.',
      'Poll timeout: 0 (immediates/pending/closing), next timer delta, or -1 (block indefinitely).',
      'Node starts an idle handle while setImmediate callbacks are queued so poll does not block.',
      'monitorEventLoopDelay returns an HDR histogram in nanoseconds; percentile(99) for p99.',
      'performance.eventLoopUtilization() → { idle, active, utilization }.',
      'Blocked loop symptoms: all routes slow, health checks fail, timers late, one core pegged.',
    ],
    quiz: [
      {
        kind: 'mcq', difficulty: 'advanced',
        prompt: 'A server has only a listening socket and no timers or immediates. What poll timeout does libuv use?',
        options: ['0 ms — it busy-spins', '-1 — block until the OS reports I/O', '4 ms minimum clamp', '1 ms, the timer granularity'],
        answer: 1,
        explanation: 'With no timers, no idle handles and no pending callbacks, uv_backend_timeout returns -1 so epoll/kqueue blocks indefinitely — the process uses no CPU while idle. Busy-spinning (0) only happens when there is queued work like setImmediate.',
      },
      {
        kind: 'predict-output', difficulty: 'advanced',
        prompt: 'Inside an fs.readFile callback, what is printed?',
        code: "fs.readFile(__filename, () => {\n  setTimeout(() => console.log('timeout'), 0);\n  setImmediate(() => console.log('immediate'));\n});",
        options: ['timeout immediate', 'Non-deterministic', 'immediate timeout', 'Only immediate'],
        answer: 2,
        explanation: 'The callback runs in the poll phase; the next phase is check, so setImmediate always wins. The non-deterministic order only happens in the main module, where it depends on whether 1 ms has elapsed before the first timers phase.',
      },
      {
        kind: 'scenario', difficulty: 'intermediate',
        prompt: 'CPU is 25% on a 4-core box, yet every endpoint (even /health) has p99 latency of 900 ms. What do you check first?',
        options: ['Add more database connections', 'Increase UV_THREADPOOL_SIZE', 'Event loop delay — one core is likely pegged by sync work', 'Switch from HTTP/1.1 to HTTP/2'],
        answer: 2,
        explanation: '25% on 4 cores is exactly one core at 100% — the single JS thread. Uniform slowness across trivial routes points to a blocked loop. More DB connections would not help a loop that cannot run callbacks.',
      },
    ],
    interview: [
      {
        category: 'nodejs', kind: 'concept', difficulty: 'advanced', topic: 'Event loop',
        question: 'How does libuv decide how long to block in the poll phase?',
        shortAnswer: 'It computes a timeout: 0 if there is immediate work (pending callbacks, idle handles such as queued setImmediate, closing handles), the time until the nearest timer if timers exist, or infinite (-1) if only I/O handles are active.',
        detailedAnswer: [
          'uv_backend_timeout() is evaluated just before uv__io_poll().',
          'Node starts an idle handle when the immediate queue is non-empty, forcing a 0 timeout.',
          'Timers live in a min-heap; the next expiry minus loop time gives the sleep duration.',
          'With no timers the process sleeps in epoll_wait/kqueue until a socket or thread-pool completion wakes it.',
          'This is why an idle Node server uses ~0% CPU.',
        ],
        followUp: 'Why can setTimeout(0) and setImmediate fire in either order from the main module?',
        trap: 'Saying the event loop "polls continuously" or busy-waits — it blocks in the kernel.',
      },
      {
        category: 'advanced', kind: 'scenario', difficulty: 'advanced', topic: 'Event loop lag',
        question: 'How would you detect and alert on a blocked event loop in production?',
        shortAnswer: 'Record event loop delay with perf_hooks.monitorEventLoopDelay (p99/max) and eventLoopUtilization, export them as metrics, alert on sustained high p99, and capture a CPU profile when it fires.',
        detailedAnswer: [
          'monitorEventLoopDelay({ resolution }) samples timer lateness into a histogram (nanoseconds).',
          'ELU shows saturation; delay shows user-visible waiting.',
          'Correlate with request latency: uniform slowdown across endpoints = loop blocked.',
          'Use the signal for load shedding (503) to protect the process.',
          'Then find the culprit with --cpu-prof or an on-demand inspector profile.',
        ],
        followUp: 'Which operations commonly block the loop in an Express app?',
        trap: 'Relying only on CPU % — one pegged core looks like 12% on an 8-core machine.',
      },
    ],
  },

  // ───────────────────────────────────────────────────────────
  'v8-internals': {
    summary: 'V8 parses JS to bytecode (Ignition), then tiers hot code up through Sparkplug, Maglev and TurboFan using type feedback; stable object shapes keep that optimized code fast.',
    topics: ['Ignition', 'bytecode', 'Sparkplug', 'Maglev', 'TurboFan', 'JIT tiers', 'hidden classes', 'shapes', 'inline caches', 'deoptimization'],
    sections: [
      section('introduction', undefined,
        text("Your JavaScript is not interpreted line by line forever. V8 watches which functions are hot and what types flow through them, then compiles them to machine code. Code that keeps types predictable stays fast; code that surprises V8 gets thrown back to slower tiers."),
      ),
      section('definition', 'Definition',
        bullets(
          "**Ignition** — V8's interpreter. Compiles the AST to compact **bytecode** and runs it, collecting type feedback.",
          "**Sparkplug** — non-optimizing *baseline* compiler: translates bytecode to machine code quickly, no speculation.",
          "**Maglev** — mid-tier optimizing compiler: fast to compile, uses feedback for good-enough code.",
          "**TurboFan** — top-tier optimizing compiler: speculative, aggressive (inlining, escape analysis), slowest to compile.",
          "**Hidden class / shape (V8: Map)** — internal description of an object's layout: property names, order and offsets.",
          "**Inline cache (IC)** — per-call-site cache remembering which shapes were seen and where the property lives.",
        ),
        table('V8 execution tiers', ['Tier', 'Kind', 'Compile speed', 'Code speed', 'Speculates?'], [
          ['Ignition', 'Interpreter (bytecode)', 'Fastest', 'Slowest', 'No (collects feedback)'],
          ['Sparkplug', 'Baseline compiler', 'Very fast', 'Better', 'No'],
          ['Maglev', 'Mid-tier optimizer', 'Fast', 'Good', 'Yes'],
          ['TurboFan', 'Top-tier optimizer', 'Slow', 'Best', 'Yes, heavily'],
        ]),
        note("Sparkplug shipped in V8 9.1; Maglev was enabled in V8 11.7 / Chrome 117 and is on in Node 22 (V8 12.4). Node 18/20 run Ignition → Sparkplug → TurboFan."),
      ),
      section('why', 'Why backend engineers care',
        bullets(
          "Hot paths (serializers, validators, routers) run millions of times; a deopt there costs measurable throughput.",
          "Libraries like Fastify and fast JSON serializers are designed around stable shapes.",
          "Understanding deopts explains \"it got slower after I added one optional field\".",
        ),
      ),
      section('internals', 'Pipeline and feedback',
        flow([
          'Source: JS text',
          'Parser: AST (lazy parsing of inner functions)',
          'Ignition: bytecode + feedback vector',
          'Sparkplug: baseline machine code',
          'Maglev: optimized using feedback',
          'TurboFan: peak optimized code',
        ], { title: 'V8 tiering', direction: 'horizontal', caption: 'A failed speculative assumption sends execution back to bytecode (deoptimization).' }),
        bullets(
          "Each function has a **feedback vector**. Inline caches at each property access / call record the shapes and types seen.",
          "IC states: **monomorphic** (1 shape — fastest), **polymorphic** (2–4 shapes), **megamorphic** (more — falls back to a generic slow lookup).",
          "Optimizing compilers emit code that assumes the observed shapes and inserts cheap **checks** (guards).",
          "If a guard fails (new shape, `undefined` where a number was seen, array became holey), V8 **deoptimizes**: it reconstructs the interpreter frame and continues in bytecode. Repeated deopts can stop re-optimization of that function.",
        ),
        bullets(
          "Objects created by the same constructor with properties added **in the same order** share a hidden class.",
          "Adding a property creates a **transition** to a new hidden class; adding them in different orders creates different shapes.",
          "`delete obj.prop` usually moves the object into slow **dictionary mode**.",
          "Arrays have **elements kinds** (SMI → DOUBLE → generic, packed → holey). Transitions only go one way toward more generic.",
        ),
      ),
      section('example', 'Shapes in practice',
        code({
          title: 'Same properties, different order = different shapes',
          code: dedent(`
            // run with: node --allow-natives-syntax shapes.js
            function Point(x, y) { this.x = x; this.y = y; }
            const a = new Point(1, 2);
            const b = new Point(3, 4);

            const c = { x: 1, y: 2 };
            const d = { y: 2, x: 1 };      // different insertion order

            const e = new Point(5, 6);
            e.z = 7;                      // transition to a new shape

            console.log(%HaveSameMap(a, b)); // true
            console.log(%HaveSameMap(c, d)); // false
            console.log(%HaveSameMap(a, e)); // false
          `),
          expectedOutput: 'true\nfalse\nfalse',
          explanation: [
            '`%HaveSameMap` is a V8 intrinsic only available with `--allow-natives-syntax` (never use it in production).',
            '`a` and `b` were built identically → same hidden class → a call site seeing both stays monomorphic.',
            '`c` and `d` contain the same keys but in a different order → different maps.',
            'Adding `z` later moves `e` to a new map, making `Point` call sites polymorphic.',
          ],
        }),
        code({
          title: 'Watch optimization and deoptimization',
          language: 'bash',
          code: dedent(`
            node --trace-opt --trace-deopt app.js | grep -E "marking|deoptimizing" | head
          `),
          expectedOutput: "[marking 0x... <JSFunction sum> for optimization to TURBOFAN, ConcurrencyMode::kConcurrent, reason: hot and stable]\n[bailout (kind: deopt-eager, reason: wrong map): begin. deoptimizing 0x... <JSFunction sum> ...]\n(exact format varies by V8 version)",
          explanation: [
            '`--trace-opt` logs when functions are queued for Maglev/TurboFan.',
            '`--trace-deopt` logs bailouts with a reason such as `wrong map` or `not a Smi`.',
            'Use these to confirm a suspicion from a profile — not as a day-to-day tool.',
          ],
        }),
      ),
      section('real-world', 'Real-world backend usage',
        bullets(
          "Construct DTOs with all fields initialized (use `null`, not missing) so response objects share one shape.",
          "Prefer classes or factory functions that assign every property in the constructor.",
          "Avoid `delete` on hot objects — set the field to `undefined` or build a new object.",
          "Keep hot functions type-stable: don't pass numbers sometimes and strings other times.",
          "Use `Map` for dictionaries with arbitrary/dynamic keys instead of turning objects into hash tables.",
        ),
      ),
      section('mistakes', 'Common mistakes',
        code({
          title: 'Wrong vs right: unstable shapes',
          code: dedent(`
            // Wrong: Shape depends on data: some users get 'email' first, some 'phone'
            function toDto(u) {
              const dto = {};
              if (u.email) dto.email = u.email;
              if (u.phone) dto.phone = u.phone;
              dto.id = u.id;
              return dto;
            }

            // Right: Same keys, same order, every time
            function toDto(u) {
              return { id: u.id, email: u.email ?? null, phone: u.phone ?? null };
            }
          `),
          explanation: ['The first version produces up to four different hidden classes, making every consumer call site polymorphic or megamorphic.'],
        }),
        bullets(
          "Micro-optimizing based on folklore without a profile — modern V8 handles `try/catch`, closures and `arguments` well.",
          "Using `%OptimizeFunctionOnNextCall` style tricks in benchmarks and assuming production behaves the same.",
        ),
      ),
      section('interview', 'Interview angle',
        interviewTip("Explain the tiering + feedback loop in one breath, then give one concrete rule: \"initialize all properties in the constructor, in the same order\". Interviewers like hearing *monomorphic vs megamorphic* and *deoptimization* used correctly."),
      ),
      section('practice', 'Practice',
        steps(
          "Write a loop that sums `obj.value` over 1e7 objects of one shape; time it.",
          "Repeat with objects of 6 different shapes and compare — that is megamorphic access.",
          "Run with `--trace-deopt` after passing a string into a function that only saw numbers.",
        ),
      ),
      section('summary', 'Summary',
        bullets(
          "Ignition (bytecode) → Sparkplug (baseline) → Maglev (mid-tier) → TurboFan (peak).",
          "Optimizing tiers speculate based on feedback from inline caches.",
          "Hidden classes depend on property set **and** insertion order.",
          "Broken assumptions trigger deoptimization back to bytecode.",
        ),
      ),
    ],
    revisionNotes: [
      'Ignition = interpreter/bytecode; Sparkplug = baseline JIT; Maglev = mid-tier; TurboFan = top-tier.',
      'Hidden class (V8 "Map") = layout; same props in same order → shared shape.',
      'IC states: monomorphic (1), polymorphic (2–4), megamorphic (>4, slow generic path).',
      'Deopt: failed guard → back to interpreter; trace with --trace-deopt.',
      'delete obj.x → dictionary mode; init all fields in constructor instead.',
      'Array elements kinds transition one way: packed SMI → double → generic, packed → holey.',
    ],
    quiz: [
      {
        kind: 'mcq', difficulty: 'intermediate',
        prompt: 'Which V8 component produces and executes bytecode?',
        options: ['TurboFan', 'Sparkplug', 'Orinoco', 'Ignition'],
        answer: 3,
        explanation: 'Ignition is the interpreter that compiles the AST to bytecode and runs it. Sparkplug compiles that bytecode to baseline machine code; Orinoco is the garbage collector project.',
      },
      {
        kind: 'find-bug', difficulty: 'advanced',
        prompt: 'This hot function got 3x slower after a refactor. What is the most likely V8-level cause?',
        code: "function total(items) {\n  let s = 0;\n  for (const it of items) s += it.price;\n  return s;\n}\n// items now come from 6 different factories, each adding fields in a different order",
        options: ['for...of is not optimizable', 'The it.price access site became megamorphic', 'let should be var', 'The function is too small to inline'],
        answer: 1,
        explanation: 'Six different hidden classes at one property access exceed the polymorphic limit, so the IC goes megamorphic and uses a slow generic lookup. for...of is optimized fine by modern V8.',
      },
      {
        kind: 'mcq', difficulty: 'advanced',
        prompt: 'What happens when optimized code observes a type it did not speculate on?',
        options: ['The process crashes with a TypeError', 'V8 deoptimizes: rebuilds the interpreter frame and continues in bytecode', 'V8 recompiles synchronously with TurboFan before continuing', 'The value is coerced to the expected type'],
        answer: 1,
        explanation: 'A failed guard triggers a deoptimization (bailout) to Ignition; the function may be re-optimized later with broader feedback. There is no crash or silent coercion.',
      },
    ],
    interview: [
      {
        category: 'advanced', kind: 'concept', difficulty: 'advanced', topic: 'V8',
        question: 'Describe V8\'s compilation tiers and how code moves between them.',
        shortAnswer: 'Code starts in the Ignition interpreter as bytecode, hot functions get baseline code from Sparkplug, then optimized code from Maglev and finally TurboFan based on type feedback; failed speculation deoptimizes back to bytecode.',
        detailedAnswer: [
          'Parser builds an AST (lazily for inner functions); Ignition generates bytecode.',
          'Feedback vectors and inline caches record shapes and types per site.',
          'Sparkplug is non-speculative and very cheap to compile.',
          'Maglev and TurboFan speculate using feedback and insert guards.',
          'Guard failure → deoptimization; repeated deopts may prevent re-optimization.',
        ],
        followUp: 'What can you do in application code to avoid deopts on a hot path?',
        trap: 'Saying V8 "interprets JavaScript" or "compiles everything to machine code up front".',
      },
      {
        category: 'advanced', kind: 'concept', difficulty: 'advanced', topic: 'V8',
        question: 'What are hidden classes and inline caches, and why does property insertion order matter?',
        shortAnswer: 'A hidden class (shape) records an object\'s property layout; inline caches remember the shapes seen at a property access so it can be a fixed-offset load. Different insertion orders create different shapes, making access sites polymorphic or megamorphic.',
        detailedAnswer: [
          'Each added property transitions the object to a new hidden class in a transition tree.',
          '{x, y} and {y, x} end on different leaves of that tree.',
          'Monomorphic IC = one shape = fastest; 2–4 = polymorphic; more = megamorphic generic lookup.',
          'delete usually converts the object to dictionary mode.',
          'Fix: initialize every field in the constructor in a fixed order.',
        ],
        followUp: 'When would you choose a Map over a plain object?',
        trap: 'Thinking only the set of keys matters, not their order.',
      },
    ],
  },

  // ───────────────────────────────────────────────────────────
  'garbage-collection': {
    summary: "V8's GC is generational: short-lived objects die cheaply in new space (Scavenge), survivors are promoted to old space (Mark-Sweep-Compact), and Orinoco runs most of it in parallel, incrementally and concurrently.",
    topics: ['generational hypothesis', 'new space', 'semi-space', 'Scavenge', 'old space', 'Mark-Sweep-Compact', 'Orinoco', 'incremental marking', 'concurrent marking', '--max-old-space-size', '--trace-gc'],
    sections: [
      section('introduction', undefined,
        text("JavaScript has no `free()`. V8 finds objects that are no longer reachable and reclaims them. How it does that determines your pause times and memory ceiling."),
      ),
      section('definition', 'Definition',
        bullets(
          "**Reachability** — an object is live if it can be reached from a root (stack, globals, handles held by Node/C++).",
          "**Generational hypothesis** — most objects die young; a few live for a long time.",
          "**Young generation (new space)** — small area split into two semi-spaces; collected by the **Scavenger** (minor GC).",
          "**Old generation (old space)** — objects that survived two scavenges; collected by **Mark-Sweep-Compact** (major GC).",
          "**Orinoco** — V8's GC project making collection parallel, incremental and concurrent to cut main-thread pauses.",
        ),
      ),
      section('why', 'Why it matters',
        bullets(
          "GC pauses add directly to request latency (they stop JS on the main thread).",
          "High allocation rate → frequent scavenges → more CPU spent in GC.",
          "Heap limit reached → `FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory` and a crash.",
        ),
      ),
      section('internals', 'How each collector works',
        table('Minor vs major GC', ['', 'Scavenge (minor)', 'Mark-Sweep-Compact (major)'], [
          ['Space', 'New space (semi-spaces, a few MB to tens of MB)', 'Old space (most of the heap)'],
          ['Algorithm', 'Copying (Cheney): copy live objects from from-space to to-space', 'Mark live objects, sweep dead ones to free lists, compact fragmented pages'],
          ['Cost proportional to', 'Number of **live** objects', 'Heap size / live set'],
          ['Frequency', 'Very frequent', 'Rare'],
          ['Pause', 'Short; parallel across helper threads', 'Mostly concurrent/incremental; short final pause'],
          ['Promotion', 'Survive twice → move to old space', '—'],
        ]),
        steps(
          "**Allocation** is a pointer bump in new space — very cheap.",
          "When new space fills, the **Scavenger** copies live objects to the other semi-space (or promotes them). Dead objects cost nothing: they're simply left behind.",
          "A **write barrier** records old→new pointers in a remembered set so scavenges need not scan the whole old space.",
          "When old space grows past a limit, **marking** starts: **incremental** (small steps interleaved with JS) and **concurrent** (helper threads mark while JS runs).",
          "A short **atomic pause** finalizes marking; **sweeping** runs concurrently; **compaction** moves objects off fragmented pages (parallel).",
          "Idle-time GC: V8 can schedule work when the embedder reports idle time.",
        ),
        diagram('heap-stack', 'Stack roots point into new space and old space; survivors are promoted.'),
      ),
      section('example', 'Observing GC',
        code({
          title: '--trace-gc output',
          language: 'bash',
          code: dedent(`
            node --trace-gc server.js
          `),
          expectedOutput: "[12345:0x...]      48 ms: Scavenge 6.1 (7.3) -> 5.4 (8.3) MB, 0.9 / 0.0 ms  (average mu = 1.000, current mu = 1.000) allocation failure;\n[12345:0x...]    2210 ms: Mark-Compact 210.4 (230.1) -> 120.7 (180.3) MB, 4.2 / 0.0 ms  (+ 85.1 ms in 312 steps since start of marking, biggest step 1.8 ms, walltime since start of marking 410 ms) finalize incremental marking via stack guard;\n(format varies by version)",
          explanation: [
            '`Scavenge 6.1 (7.3) -> 5.4 (8.3) MB` — used (committed) before → after; minor GC took ~1 ms.',
            '`allocation failure` just means new space was full — normal, not an error.',
            'The Mark-Compact line shows most marking happened incrementally (312 small steps) with only a ~4 ms final pause.',
          ],
        }),
        code({
          title: 'Sizing the heap',
          language: 'bash',
          code: dedent(`
            # Old-space limit in MB (leave headroom below the container limit for RSS overhead)
            node --max-old-space-size=1536 server.js

            # Check the effective limit
            node -e "console.log(require('v8').getHeapStatistics().heap_size_limit / 1024 / 1024)"
          `),
          expectedOutput: '1584\n(≈ old-space limit plus young generation; value varies)',
          explanation: [
            '`--max-old-space-size` caps old space; the default depends on Node version and available memory.',
            'In a 2 GiB container, ~1.5 GiB for old space leaves room for new space, code, buffers and native memory.',
            '`--max-semi-space-size` (MB) can enlarge new space to reduce scavenge frequency for allocation-heavy services.',
          ],
          versionNote: 'NODE_OPTIONS="--max-old-space-size=1536" also works and applies to child processes.',
        }),
      ),
      section('real-world', 'Real-world backend usage',
        bullets(
          "Reduce allocation in hot paths: reuse buffers, stream instead of building giant strings, avoid needless `.map().filter().map()` chains on huge arrays.",
          "Set `--max-old-space-size` explicitly in containers so Node fails predictably before the OOM killer sends SIGKILL.",
          "Watch GC pause time via `perf_hooks` `PerformanceObserver` with `entryTypes: ['gc']`.",
          "A heap that never shrinks after major GCs and keeps growing is a **leak**, not a GC problem.",
        ),
        code({
          title: 'Recording GC pauses',
          code: dedent(`
            import { PerformanceObserver } from 'node:perf_hooks';

            new PerformanceObserver((list) => {
              for (const e of list.getEntries()) {
                // e.detail.kind: 1 = minor, 4 = major, 8 = incremental, 16 = weakcb
                if (e.duration > 50) console.warn('long GC', e.detail.kind, e.duration.toFixed(1), 'ms');
              }
            }).observe({ entryTypes: ['gc'] });
          `),
          expectedOutput: 'long GC 4 61.3 ms\n(only printed when a pause exceeds 50 ms)',
          explanation: ['GC entries expose `duration` and `detail.kind` (constants in `perf_hooks.constants`, e.g. `NODE_PERFORMANCE_GC_MAJOR`).'],
          versionNote: '`entry.detail` for GC entries: Node 16+.',
        }),
      ),
      section('mistakes', 'Common mistakes',
        bullets(
          "Calling `global.gc()` (needs `--expose-gc`) in production to \"fix\" memory — it only hides leaks and adds pauses.",
          "Setting `--max-old-space-size` equal to the container limit — RSS also includes new space, code, stacks and native buffers, so the container gets OOM-killed.",
          "Assuming `null`-ing a variable frees memory immediately — it only makes the object unreachable; GC decides when.",
        ),
        code({
          title: 'Wrong vs right: heap limit in a 1 GiB container',
          language: 'bash',
          code: dedent(`
            # Wrong: no headroom: kernel OOM-kills the process (exit 137) instead of a clean V8 error
            NODE_OPTIONS=--max-old-space-size=1024 node server.js

            # Right: ~75% of the container limit
            NODE_OPTIONS=--max-old-space-size=768 node server.js
          `),
        }),
      ),
      section('interview', 'Interview angle',
        interviewTip("Name both collectors and *why* there are two: copying is cheap when few objects survive (young), mark-sweep scales for long-lived data (old). Mention Orinoco making marking concurrent so pauses are short."),
      ),
      section('practice', 'Practice',
        text("Run a script that allocates 1e6 short-lived objects per tick with `--trace-gc` and count scavenges. Then keep every 100th object in an array and watch Mark-Compact lines appear and old space grow."),
      ),
      section('summary', 'Summary',
        bullets(
          "New space + Scavenge for young objects; old space + Mark-Sweep-Compact for survivors.",
          "Scavenge cost depends on survivors, not garbage.",
          "Orinoco: parallel scavenging, incremental + concurrent marking, concurrent sweeping.",
          "Tune with `--max-old-space-size` (and rarely `--max-semi-space-size`); observe with `--trace-gc`.",
        ),
      ),
    ],
    revisionNotes: [
      'Generational: new space (semi-spaces, Scavenger) and old space (Mark-Sweep-Compact).',
      'Objects surviving two scavenges are promoted to old space.',
      'Write barrier + remembered set track old→new pointers.',
      'Orinoco = parallel + incremental + concurrent GC to shorten pauses.',
      '--max-old-space-size=<MB>; leave headroom under container memory limit.',
      'OOM: "JavaScript heap out of memory"; container kill shows exit 137 (SIGKILL).',
    ],
    quiz: [
      {
        kind: 'mcq', difficulty: 'intermediate',
        prompt: 'Why is the young-generation Scavenge cheap even when it runs very often?',
        options: ['It runs on the GPU', 'Its cost depends on live (surviving) objects, and most young objects are already dead', 'It never pauses JavaScript', 'It only frees strings'],
        answer: 1,
        explanation: 'A copying collector only touches live objects; dead ones are reclaimed by simply reusing the semi-space. It does pause JS briefly (parallelized), so "never pauses" is wrong.',
      },
      {
        kind: 'scenario', difficulty: 'advanced',
        prompt: 'A pod with a 1 GiB memory limit keeps restarting with exit code 137 and no JS stack trace. What is the best first fix?',
        options: ['Set --max-old-space-size to about 700–768 MB and investigate heap growth', 'Call global.gc() every minute', 'Increase UV_THREADPOOL_SIZE', 'Switch to cluster mode'],
        answer: 0,
        explanation: '137 = SIGKILL from the OOM killer: the container limit was hit before V8 hit its own heap limit. Capping old space below the limit gives a clean, diagnosable failure (or GC pressure) and you then look for the leak. Forcing GC hides nothing and adds pauses.',
      },
    ],
    interview: [
      {
        category: 'advanced', kind: 'concept', difficulty: 'intermediate', topic: 'Garbage collection',
        question: 'Explain V8\'s generational garbage collection.',
        shortAnswer: 'The heap is split into a young generation collected by a fast copying Scavenger and an old generation collected by Mark-Sweep-Compact; objects that survive two scavenges are promoted.',
        detailedAnswer: [
          'Based on the generational hypothesis: most objects die young.',
          'New space has two semi-spaces; live objects are copied between them.',
          'Old space uses marking from roots, sweeping into free lists, and compaction to fight fragmentation.',
          'Write barriers keep a remembered set of old→new references.',
          'Major GC work is largely incremental and concurrent (Orinoco).',
        ],
        followUp: 'What determines the cost of a scavenge?',
        trap: 'Describing reference counting — V8 uses tracing GC, so cycles are collected fine.',
      },
      {
        category: 'advanced', kind: 'concept', difficulty: 'advanced', topic: 'Garbage collection',
        question: 'What did the Orinoco project change about V8\'s garbage collector?',
        shortAnswer: 'It moved GC work off the main thread and split it up: parallel scavenging and compaction, incremental and concurrent marking, and concurrent sweeping, so stop-the-world pauses are short.',
        detailedAnswer: [
          'Parallel: multiple helper threads work during a pause (scavenge, compaction).',
          'Incremental: marking is done in small slices interleaved with JS.',
          'Concurrent: helper threads mark/sweep while JS keeps running; write barriers keep it correct.',
          'Only the final marking step needs an atomic pause.',
          'Result: major GC pauses typically in single-digit milliseconds for normal heaps.',
        ],
        followUp: 'Why does concurrent marking need a write barrier?',
        trap: 'Claiming V8 GC is fully pause-free.',
      },
    ],
  },

  // ───────────────────────────────────────────────────────────
  'memory-management': {
    summary: 'A Node process uses V8 heap memory plus off-heap memory (Buffers, native addons, stacks); process.memoryUsage() breaks it into rss, heapTotal, heapUsed, external and arrayBuffers.',
    topics: ['process.memoryUsage', 'rss', 'heapTotal', 'heapUsed', 'external', 'arrayBuffers', 'v8.getHeapStatistics', 'off-heap memory', 'Buffer pooling'],
    sections: [
      section('introduction', undefined,
        text("\"The process uses 1.2 GB\" — but where? Heap objects, Buffers, compiled code and native libraries are all counted differently. You need the breakdown before you can fix anything."),
      ),
      section('definition', 'Definition',
        table('process.memoryUsage() fields', ['Field', 'Meaning', 'Grows when'], [
          ['rss', 'Resident Set Size: all memory the OS has in RAM for the process (heap + code + stacks + native + buffers)', 'Anything grows; also what container limits measure'],
          ['heapTotal', 'Memory V8 has reserved/committed for the JS heap', 'Heap expands after GC decides it needs more room'],
          ['heapUsed', 'Bytes actually occupied by JS objects in the heap', 'You allocate and retain objects'],
          ['external', 'Memory of C++ objects bound to JS objects (includes ArrayBuffer/Buffer backing stores)', 'Buffers, native addons'],
          ['arrayBuffers', 'Subset of external: ArrayBuffer + SharedArrayBuffer backing stores (incl. Buffers)', 'Reading files/sockets into Buffers'],
        ]),
      ),
      section('why', 'Why it matters',
        bullets(
          "Containers are killed on **RSS**, but `--max-old-space-size` only limits the **JS heap**.",
          "A growing `heapUsed` after GC suggests a JS-object leak; growing `external`/`arrayBuffers` suggests retained Buffers; growing RSS with flat heap suggests native memory (addons, fragmentation).",
        ),
      ),
      section('internals', 'Where memory lives',
        flow([
          'RSS: everything resident',
          'V8 heap: new space, old space, code space, large-object space',
          'Off-heap: Buffer/ArrayBuffer backing stores',
          'Native: libuv, OpenSSL, addons, thread stacks',
        ], { title: 'Node process memory', direction: 'vertical' }),
        bullets(
          "V8 heap spaces: `new_space`, `old_space`, `code_space`, `large_object_space` (objects larger than a page), `map_space` merged into old in recent V8 — inspect with `v8.getHeapSpaceStatistics()`.",
          "`Buffer.allocUnsafe(size)` for small sizes (< `Buffer.poolSize >>> 1`, i.e. 4 KiB) slices from a shared 8 KiB pool — one retained small slice can keep the whole pool alive.",
          "Large strings are on-heap; a 100 MB `JSON.stringify` result needs heap headroom for the string *and* the object.",
          "`heapTotal` rarely shrinks back to the OS immediately; RSS staying high after a spike is normal.",
        ),
      ),
      section('example', 'Reading memory',
        code({
          title: 'Human-readable memory report',
          code: dedent(`
            const mb = (n) => (n / 1024 / 1024).toFixed(1) + ' MB';
            const report = () => {
              const m = process.memoryUsage();
              return { rss: mb(m.rss), heapTotal: mb(m.heapTotal), heapUsed: mb(m.heapUsed),
                       external: mb(m.external), arrayBuffers: mb(m.arrayBuffers) };
            };

            console.log('before', report());
            const big = Buffer.alloc(200 * 1024 * 1024);   // 200 MB off-heap
            console.log('after ', report());
          `),
          expectedOutput: "before { rss: '42.3 MB', heapTotal: '5.9 MB', heapUsed: '4.1 MB', external: '1.6 MB', arrayBuffers: '0.0 MB' }\nafter  { rss: '242.6 MB', heapTotal: '5.9 MB', heapUsed: '4.2 MB', external: '201.6 MB', arrayBuffers: '200.0 MB' }\n(numbers vary by machine/version)",
          explanation: [
            'The 200 MB Buffer lives **outside** the V8 heap: `heapUsed` barely moves.',
            '`external` and `arrayBuffers` jump by 200 MB, and so does `rss` (Buffer.alloc zero-fills, so pages are touched).',
            'So `--max-old-space-size` would not have protected you from this allocation.',
          ],
        }),
        code({
          title: 'Cheap RSS + heap limits',
          code: dedent(`
            import v8 from 'node:v8';

            console.log(process.memoryUsage.rss());   // fast: no heap walk
            const s = v8.getHeapStatistics();
            console.log((s.heap_size_limit / 2 ** 20).toFixed(0), 'MB limit');
            console.log((s.used_heap_size / s.heap_size_limit * 100).toFixed(1), '% of heap limit used');
          `),
          expectedOutput: '44138496\n4144 MB limit\n0.1 % of heap limit used\n(values vary)',
          explanation: [
            '`process.memoryUsage.rss()` (Node 15.6+ / 14.18+) avoids computing heap stats — good for frequent sampling.',
            '`heap_size_limit` is the effective ceiling (defaults scale with system memory, or your flag).',
          ],
        }),
      ),
      section('real-world', 'Real-world backend usage',
        bullets(
          "Export `rss`, `heapUsed`, `external` as gauges; alert on `heapUsed / heap_size_limit > 85%`.",
          "Stream large files and responses — never `fs.readFile` a 2 GB export into one Buffer.",
          "Paginate DB results instead of loading 1M rows into an array.",
          "If you keep a small slice of a big Buffer, copy it (`Buffer.from(slice)`) so the large backing store can be freed.",
        ),
      ),
      section('mistakes', 'Common mistakes',
        bullets(
          "Watching only `heapUsed` and missing a Buffer leak in `external`.",
          "Panicking because RSS did not drop after a spike — V8 and the allocator keep pages for reuse.",
          "Calling `process.memoryUsage()` (which walks heap stats) on every request — use `.rss()` or sample on an interval.",
        ),
        code({
          title: 'Wrong vs right: retaining a slice of a big buffer',
          code: dedent(`
            // Wrong: header keeps the whole 50 MB file buffer alive
            const file = await fs.readFile('upload.bin');
            cache.set(id, file.subarray(0, 64));

            // Right: copy the 64 bytes; the big buffer can be collected
            cache.set(id, Buffer.from(file.subarray(0, 64)));
          `),
          explanation: ['`subarray`/`slice` on a Buffer creates a **view** sharing the same memory.'],
        }),
      ),
      section('interview', 'Interview angle',
        interviewTip("Be able to say which field to watch for which leak type: heapUsed → JS objects, external/arrayBuffers → Buffers, RSS-only growth → native memory or fragmentation."),
      ),
      section('practice', 'Practice',
        text("Log `process.memoryUsage()` every second while an endpoint builds a 50 MB JSON string vs. streams the same rows with a cursor. Compare peak `heapUsed`."),
      ),
      section('summary', 'Summary',
        bullets(
          "RSS = everything; heapUsed = live JS objects; external/arrayBuffers = Buffers and native backing stores.",
          "Heap flags limit only the V8 heap, not Buffers or native memory.",
          "Buffer views share memory — copy small slices you retain.",
          "Stream and paginate to keep peak memory flat.",
        ),
      ),
    ],
    revisionNotes: [
      'memoryUsage: rss, heapTotal, heapUsed, external, arrayBuffers.',
      'Buffers live off-heap → counted in external/arrayBuffers and rss, not heapUsed.',
      'process.memoryUsage.rss() is the cheap variant.',
      'v8.getHeapStatistics().heap_size_limit = effective heap ceiling.',
      'Small Buffer.allocUnsafe slices come from an 8 KiB shared pool.',
      'Containers kill on RSS; keep heap limit below container limit.',
    ],
    quiz: [
      {
        kind: 'mcq', difficulty: 'intermediate',
        prompt: 'An app reads many files into Buffers and keeps them in a Map. Which field grows the most?',
        options: ['heapUsed', 'heapTotal', 'arrayBuffers / external', 'None — Buffers are freed immediately'],
        answer: 2,
        explanation: 'Buffer contents are off-heap backing stores, reported in external and arrayBuffers (and rss). heapUsed only grows by the small JS wrapper objects.',
      },
      {
        kind: 'predict-output', difficulty: 'advanced',
        prompt: 'Approximately how does heapUsed change after this line?',
        code: 'const b = Buffer.alloc(100 * 1024 * 1024);',
        options: ['+100 MB', 'Roughly unchanged (a few hundred bytes)', '+200 MB because of copying', 'It decreases'],
        answer: 1,
        explanation: 'The 100 MB lives outside the V8 heap. heapUsed increases only for the Buffer object header; external, arrayBuffers and rss grow by ~100 MB.',
      },
    ],
    interview: [
      {
        category: 'nodejs', kind: 'concept', difficulty: 'intermediate', topic: 'Memory',
        question: 'What is the difference between rss, heapTotal, heapUsed and external in process.memoryUsage()?',
        shortAnswer: 'rss is all memory resident for the process; heapTotal is what V8 reserved for the JS heap; heapUsed is what live JS objects occupy; external is memory for C++ objects tied to JS, mainly Buffer/ArrayBuffer backing stores.',
        detailedAnswer: [
          'rss includes heap, code, stacks, native libs and Buffers — container limits measure this.',
          'heapUsed ≤ heapTotal; the gap is free space inside reserved heap pages.',
          'arrayBuffers is the ArrayBuffer/SharedArrayBuffer portion of external.',
          'Heap limit flags only cap old space, not external memory.',
        ],
        followUp: 'RSS keeps growing but heapUsed is flat. Where do you look?',
        trap: 'Assuming --max-old-space-size limits total process memory.',
      },
      {
        category: 'advanced', kind: 'scenario', difficulty: 'advanced', topic: 'Memory',
        question: 'RSS of your service grows steadily while heapUsed stays flat. How do you investigate?',
        shortAnswer: 'The growth is off-heap: check external/arrayBuffers for retained Buffers (e.g. slices of large buffers, unconsumed streams), then native addons and allocator fragmentation; heap snapshots alone will not show it.',
        detailedAnswer: [
          'Plot external and arrayBuffers alongside rss to confirm Buffer growth.',
          'Look for retained Buffer views keeping large backing stores alive, or streams paused with full buffers.',
          'Check native addons (image processing, DB drivers) and their versions for known leaks.',
          'glibc malloc fragmentation with many threads can inflate RSS; trying MALLOC_ARENA_MAX or jemalloc is a known mitigation.',
          'Heap snapshots show Buffer JS objects but not always their native size — compare counts of ArrayBuffer/Buffer objects.',
        ],
        followUp: 'How would a Buffer view keep a large allocation alive?',
        trap: 'Taking only heap snapshots and concluding "no leak".',
      },
    ],
  },
};

export default content;
