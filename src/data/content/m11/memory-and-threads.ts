import type { ModuleContent } from '../../../types';
import {
  bullets, code, dedent, diagram, flow, interviewTip, note, section, steps, table, text, warn,
} from '../helpers';

const content: Partial<ModuleContent> = {
  // ───────────────────────────────────────────────────────────
  'memory-leaks': {
    summary: 'A memory leak in Node is memory that stays reachable after you stop needing it — usually globals, unbounded caches, forgotten listeners, closures or timers — found by comparing heap snapshots.',
    topics: ['memory leak', 'unbounded cache', 'event listener leak', 'closures', 'timers', 'heap snapshot', 'v8.writeHeapSnapshot', '--inspect', 'retainers', 'WeakRef', 'FinalizationRegistry'],
    sections: [
      section('introduction', undefined,
        text("GC frees only *unreachable* objects. If something still points at your data — a global map, an event emitter, a running interval — it is kept forever. In a long-running server, a few KB per request becomes an OOM crash after a few days."),
      ),
      section('definition', 'Definition',
        text("A leak is **unintended retention**: objects that are logically dead but still reachable from a GC root, so the heap's baseline after each major GC keeps rising."),
        table('Classic leak sources', ['Source', 'How it retains', 'Fix'], [
          ['Globals / module-level arrays', 'Module scope lives for the whole process', 'Avoid accumulating in module scope; bound or persist elsewhere'],
          ['Unbounded caches (Map/object)', 'Keys added per request, never evicted', 'LRU with max size + TTL'],
          ['Event listeners', "emitter.on() per request on a long-lived emitter", 'once(), removeListener, AbortSignal option'],
          ['Closures', 'A small callback captures a large outer variable', 'Capture only what you need; null out big refs'],
          ['Timers', 'setInterval callback (and its closure) live until cleared', 'clearInterval / unref / AbortController'],
          ['Promises never settled', 'Pending promise keeps its handlers + closures', 'Timeouts on every awaited I/O'],
        ]),
      ),
      section('why', 'Why it matters',
        bullets(
          "Leaks cause slow degradation: more GC time → higher latency → eventually `heap out of memory` or OOM-kill.",
          "Restarts hide leaks; they come back at peak traffic.",
        ),
      ),
      section('internals', 'Finding a leak with heap snapshots',
        steps(
          "Confirm the pattern: `heapUsed` *after major GC* trends upward under steady load (sawtooth with rising floor).",
          "Start the app with `node --inspect` (or on a staging box) and open `chrome://inspect` → Memory tab.",
          "Warm up, take **snapshot 1**. Run load (e.g. `autocannon`) for a few minutes. Take **snapshot 2**, then **snapshot 3**.",
          "Use the **Comparison** view (snapshot 3 vs 1): sort by `# Delta` / `Size Delta` to see which constructors keep growing.",
          "Select an instance and read its **Retainers** path up to the root (e.g. `system / Context` → `cache` → `Map`). That path names the leaking code.",
          "In production without DevTools: `v8.writeHeapSnapshot()` from an admin endpoint/signal, or `--heapsnapshot-signal=SIGUSR2`, or `--heapsnapshot-near-heap-limit=2`.",
        ),
        warn("Taking a heap snapshot pauses the process and can need memory roughly equal to the heap size. Take it on one instance removed from the load balancer."),
        flow(['Snapshot 1: baseline after warm-up', 'Load test: N minutes', 'Snapshot 2', 'More load', 'Snapshot 3', 'Compare 3 vs 1: growing constructors', 'Retainers: path to root'], { title: 'Three-snapshot technique', direction: 'horizontal' }),
      ),
      section('example', 'Leaks and fixes',
        code({
          title: 'Listener leak on a long-lived emitter',
          code: dedent(`
            import { EventEmitter } from 'node:events';
            const bus = new EventEmitter();          // lives for the whole process

            // Wrong: every request adds a listener that is never removed
            function handlerLeaky(req, res) {
              bus.on('config-changed', () => res.locals.reload = true);
              res.end('ok');
            }

            // Right: remove it when the request finishes
            function handlerFixed(req, res) {
              const onChange = () => { res.locals.reload = true; };
              bus.on('config-changed', onChange);
              res.on('close', () => bus.off('config-changed', onChange));
              res.end('ok');
            }
          `),
          expectedOutput: "(node:4242) MaxListenersExceededWarning: Possible EventEmitter memory leak detected. 11 config-changed listeners added to [EventEmitter]. MaxListeners is 10. Use emitter.setMaxListeners() to increase limit\n(printed by the leaky version after the 11th request)",
          explanation: [
            'Each listener closes over `res`, so every response object stays reachable from `bus`.',
            'Node warns after 10 listeners for the same event — treat that warning as a bug report, not noise to silence with `setMaxListeners(0)`.',
            'The fix removes the listener on `close`; `events.once(bus, name, { signal })` is another clean option.',
          ],
        }),
        code({
          title: 'Programmatic snapshot',
          code: dedent(`
            import v8 from 'node:v8';
            process.on('SIGUSR2', () => {
              const file = v8.writeHeapSnapshot();   // blocks; writes Heap-<date>-<pid>-<n>.heapsnapshot
              console.log('heap snapshot written to', file);
            });
          `),
          expectedOutput: 'heap snapshot written to Heap.20261108.101500.4242.0.001.heapsnapshot',
          explanation: [
            '`v8.writeHeapSnapshot()` (Node 11.13+) writes to the cwd and returns the filename.',
            'Load the file in Chrome DevTools → Memory → Load. SIGUSR2 is not available on Windows.',
          ],
        }),
      ),
      section('real-world', 'Real-world backend usage',
        bullets(
          "Per-user caches built as `const cache = {}` in a module — replace with an LRU (`lru-cache` package, third-party) with `max` and `ttl`.",
          "`setInterval` started in a request handler or class instance never cleared on shutdown/disconnect.",
          "WebSocket connection objects kept in a `Set` without removal on `close`.",
          "Logging context (e.g. request objects) stored in AsyncLocalStorage and accidentally referenced from a global.",
        ),
        note("`WeakMap`/`WeakSet` are safe for attaching metadata to objects you don't own. `WeakRef` and `FinalizationRegistry` exist, but GC timing is unspecified: never use them for correctness (e.g. closing file handles or releasing locks) — finalizers may run late or never."),
      ),
      section('mistakes', 'Common mistakes',
        code({
          title: 'Wrong vs right: unbounded memoization',
          code: dedent(`
            // Wrong: grows with every distinct userId forever
            const profileCache = new Map();
            async function getProfile(id) {
              if (!profileCache.has(id)) profileCache.set(id, await db.profile(id));
              return profileCache.get(id);
            }

            // Right: bounded LRU with TTL (lru-cache — third-party)
            import { LRUCache } from 'lru-cache';
            const profileCache2 = new LRUCache({ max: 10_000, ttl: 60_000 });
          `),
        }),
        bullets(
          "Increasing `--max-old-space-size` as the fix — it only delays the crash.",
          "Comparing snapshots without a warm-up — lazy caches and JIT code look like leaks.",
          "Silencing `MaxListenersExceededWarning` globally.",
        ),
      ),
      section('interview', 'Interview angle',
        interviewTip("Answer leak questions as a procedure: confirm with metrics → reproduce under load → three snapshots → comparison → retainer path → fix → verify the floor stays flat."),
      ),
      section('practice', 'Practice',
        text("Write an Express route that pushes `req.headers` into a module array. Load-test it, take two snapshots, and find the array through the retainers panel."),
      ),
      section('summary', 'Summary',
        bullets(
          "Leak = still reachable, not \"GC failed\".",
          "Top causes: globals, unbounded caches, listeners, closures, timers, never-settling promises.",
          "Detect with rising post-GC heap floor; locate with heap snapshot comparison + retainers.",
          "Weak references are not a resource-management tool.",
        ),
      ),
    ],
    revisionNotes: [
      'Leak = unintended retention from a GC root.',
      'Causes: globals, unbounded Map caches, listeners, closures, intervals, pending promises.',
      'MaxListenersExceededWarning after >10 listeners on one event.',
      'Tools: --inspect + DevTools Memory, v8.writeHeapSnapshot(), --heapsnapshot-signal, --heapsnapshot-near-heap-limit.',
      'Comparison view (# Delta) + Retainers path.',
      'WeakRef/FinalizationRegistry timing is non-deterministic.',
    ],
    quiz: [
      {
        kind: 'find-bug', difficulty: 'intermediate',
        prompt: 'Why does memory grow with every connection?',
        code: "const clients = new Set();\nwss.on('connection', (ws) => {\n  clients.add(ws);\n  ws.on('message', (m) => broadcast(m));\n});",
        options: ['Set cannot hold objects', "Sockets are never removed from the Set on 'close'", 'broadcast is synchronous', 'ws.on should be ws.once'],
        answer: 1,
        explanation: "Closed sockets stay reachable from the module-level Set, along with their buffers. Add ws.on('close', () => clients.delete(ws)). Using once would break message handling.",
      },
      {
        kind: 'mcq', difficulty: 'advanced',
        prompt: 'In the heap snapshot Comparison view, what tells you which code is responsible for a leaking object?',
        options: ['Shallow size', 'The Retainers path from the object to a GC root', 'The Statistics pie chart', 'The object id'],
        answer: 1,
        explanation: 'Retainers show who holds the object (e.g. a closure context or a Map in a module). Shallow size only says how big the object itself is.',
      },
      {
        kind: 'scenario', difficulty: 'advanced',
        prompt: 'A teammate proposes using FinalizationRegistry to close DB connections when request objects are collected. Your response?',
        options: ['Great idea — it guarantees cleanup', 'Reject: finalizers may run late or never; close connections explicitly (try/finally, pool release)', 'Use WeakRef instead, which is synchronous', 'Only do it in cluster mode'],
        answer: 1,
        explanation: 'GC timing is unspecified, so finalizers are not reliable for releasing resources. WeakRef has the same non-determinism.',
      },
    ],
    interview: [
      {
        category: 'advanced', kind: 'concept', difficulty: 'intermediate', topic: 'Memory leaks',
        question: 'What are the most common causes of memory leaks in a Node.js server?',
        shortAnswer: 'Objects that stay reachable: module-level collections and caches without eviction, event listeners added per request on long-lived emitters, closures capturing large data, timers that are never cleared, and promises that never settle.',
        detailedAnswer: [
          'Unbounded Map/object caches keyed by user/request input.',
          'emitter.on in a handler without off → MaxListenersExceededWarning.',
          'setInterval/setTimeout chains holding closures.',
          'Sets of sockets not cleaned on close.',
          'Pending promises (no timeout) retaining their continuation closures.',
        ],
        followUp: 'How would you prove which of these is happening?',
        trap: 'Saying "the garbage collector failed" — GC is doing its job; your code keeps references.',
      },
      {
        category: 'advanced', kind: 'scenario', difficulty: 'advanced', topic: 'Memory leaks',
        question: 'Heap usage grows about 50 MB per hour in production until the service crashes. Walk through how you find the leak.',
        shortAnswer: 'Confirm a rising post-GC floor in metrics, reproduce under load in staging, take three heap snapshots over time, compare them to find constructors with growing counts, follow the retainer path to the owning code, fix and verify.',
        detailedAnswer: [
          'Graph heapUsed after major GCs; a rising floor means retention, not just high allocation.',
          'Reproduce with a load generator replaying realistic traffic.',
          'Snapshots via --inspect/DevTools or v8.writeHeapSnapshot on an instance out of rotation.',
          'Comparison view sorted by size delta; inspect retainers to the GC root.',
          'Short term: --heapsnapshot-near-heap-limit to capture evidence on the crashing instance.',
        ],
        followUp: 'What are the risks of taking a heap snapshot in production?',
        trap: 'Just raising --max-old-space-size or adding a nightly restart and calling it fixed.',
      },
    ],
  },

  // ───────────────────────────────────────────────────────────
  'heap-and-stack': {
    summary: 'The call stack holds function frames and is small and fixed; the heap holds objects and closures and is garbage collected — deep recursion overflows the stack with "RangeError: Maximum call stack size exceeded".',
    topics: ['call stack', 'stack frames', 'heap', 'primitives vs objects', 'stack overflow', 'RangeError', '--stack-size', 'recursion to iteration'],
    sections: [
      section('introduction', undefined,
        text("Two memory regions, two very different failure modes: the stack overflows quickly and loudly on deep recursion; the heap grows slowly until GC can't keep up."),
      ),
      section('definition', 'Definition',
        table('Stack vs heap', ['', 'Call stack', 'Heap'], [
          ['Holds', 'Frames: return address, arguments, locals (or pointers to heap)', 'Objects, arrays, closures, strings, contexts'],
          ['Size', 'Small, fixed per thread (V8 default ~984 KB on 64-bit)', 'Large, grows up to heap limit'],
          ['Managed by', 'Push/pop on call/return', 'Garbage collector'],
          ['Access', 'Very fast, LIFO', 'Via pointers'],
          ['Failure', 'RangeError: Maximum call stack size exceeded', 'JavaScript heap out of memory'],
          ['Per thread?', 'Yes — each worker thread has its own stack', 'Each isolate (worker) has its own heap'],
        ]),
        note("In V8, small integers (Smis) can be stored directly in a slot; most other values are heap objects referenced by pointers. Closure variables captured by inner functions live in a heap-allocated **Context**, not on the stack."),
      ),
      section('why', 'Why it matters',
        bullets(
          "Recursive algorithms (tree walks, deep JSON, parsers) can crash on adversarial input — a DoS vector.",
          "Understanding closures-on-heap explains why a returned callback keeps big data alive.",
        ),
      ),
      section('internals', 'What happens on a call',
        steps(
          "Calling a function pushes a frame onto the stack.",
          "Locals that don't escape can stay in the frame/registers; captured ones move to a heap Context.",
          "`new`, object/array literals and string concatenations allocate on the heap; the frame holds references (roots for GC).",
          "Returning pops the frame; any heap object no longer referenced becomes garbage.",
          "When frames exceed the stack limit, V8 throws a `RangeError` you can catch — but the process is near its limit.",
        ),
        diagram('heap-stack', 'Stack frames hold references into the heap; GC roots start from the stack.'),
      ),
      section('example', 'Stack overflow and the fix',
        code({
          title: 'Unbounded recursion',
          code: dedent(`
            function depth(n) { return depth(n + 1); }
            try {
              depth(0);
            } catch (e) {
              console.log(e.name + ': ' + e.message);
            }
          `),
          expectedOutput: 'RangeError: Maximum call stack size exceeded',
          explanation: [
            'Every call adds a frame and nothing ever returns.',
            'V8 detects the limit and throws a catchable `RangeError`.',
            'JavaScript engines do not perform tail-call optimization in practice (only Safari does), so even a tail call grows the stack.',
          ],
          runnable: true,
        }),
        code({
          title: 'Iterative traversal with an explicit stack (heap-backed)',
          code: dedent(`
            // Build a linked list 100k deep — recursion would overflow
            let node = null;
            for (let i = 0; i < 100000; i++) node = { value: i, next: node };

            function sumIterative(head) {
              let total = 0;
              const stack = [head];               // lives on the heap, can grow large
              while (stack.length) {
                const n = stack.pop();
                if (!n) continue;
                total += n.value;
                stack.push(n.next);
              }
              return total;
            }
            console.log(sumIterative(node));
          `),
          expectedOutput: '4999950000',
          explanation: [
            'An array used as an explicit stack is limited by heap size, not the ~1 MB call stack.',
            'Sum of 0..99999 = 99999 × 100000 / 2 = 4999950000.',
          ],
          runnable: true,
        }),
      ),
      section('real-world', 'Real-world backend usage',
        bullets(
          "Limit nesting depth when parsing user-supplied JSON/XML/GraphQL queries (depth-limit rules) to avoid stack-overflow DoS.",
          "Convert recursive tree walks (category trees, comment threads) to iterative ones when depth is unbounded.",
          "`--stack-size` exists but raising it can segfault if it exceeds the real thread stack — prefer fixing the algorithm.",
        ),
      ),
      section('mistakes', 'Common mistakes',
        code({
          title: 'Wrong vs right: recursion on untrusted depth',
          code: dedent(`
            // Wrong: attacker sends {"a":{"a":{"a": ... 100k levels }}}
            function countKeys(obj) {
              return Object.values(obj).reduce((n, v) => n + (typeof v === 'object' && v ? countKeys(v) : 1), 0);
            }

            // Right: enforce a depth limit (or iterate)
            function countKeysSafe(obj, depth = 0) {
              if (depth > 64) throw new Error('too deep');
              return Object.values(obj).reduce((n, v) => n + (typeof v === 'object' && v ? countKeysSafe(v, depth + 1) : 1), 0);
            }
          `),
        }),
        bullets(
          "Believing primitives are \"always on the stack\" — in JS the engine decides; closures and boxed numbers live on the heap.",
          "Catching `RangeError` and continuing as if nothing happened in a deep library call — state may be half-updated.",
        ),
      ),
      section('interview', 'Interview angle',
        interviewTip("Mention that captured variables live in heap Contexts, and that each worker thread has its own stack *and* heap (separate isolate)."),
      ),
      section('practice', 'Practice',
        text("Rewrite a recursive `flatten(arr)` for deeply nested arrays into an iterative version using an explicit stack, then test with nesting depth 50 000."),
      ),
      section('summary', 'Summary',
        bullets(
          "Stack: frames, small, fixed, LIFO. Heap: objects, GC-managed, large.",
          "Deep recursion → `RangeError: Maximum call stack size exceeded`.",
          "Fix with iteration + explicit stack, or depth limits.",
          "Closures put captured variables on the heap.",
        ),
      ),
    ],
    revisionNotes: [
      'Stack overflow → RangeError: Maximum call stack size exceeded.',
      'Default V8 stack ~984 KB (64-bit); --stack-size is risky.',
      'No practical TCO in V8.',
      'Captured closure variables live in heap-allocated Contexts.',
      'Each worker thread = own isolate = own stack + heap.',
    ],
    quiz: [
      {
        kind: 'predict-output', difficulty: 'beginner',
        prompt: 'What is logged?',
        code: "function f() { return f(); }\ntry { f(); } catch (e) { console.log(e.constructor.name); }",
        options: ['Error', 'StackOverflowError', 'RangeError', 'Nothing — the process hangs'],
        answer: 2,
        explanation: 'V8 throws a RangeError ("Maximum call stack size exceeded"). JavaScript has no StackOverflowError type, and the recursion does not hang because the stack limit is hit quickly.',
      },
      {
        kind: 'mcq', difficulty: 'intermediate',
        prompt: 'Where does a variable captured by a returned closure live?',
        options: ['On the stack frame of the outer function', 'In a heap-allocated context object', 'In the libuv thread pool', 'In a CPU register until GC'],
        answer: 1,
        explanation: 'The outer frame is popped when it returns, so captured variables must live in a heap Context that the closure references.',
      },
    ],
    interview: [
      {
        category: 'javascript', kind: 'concept', difficulty: 'beginner', topic: 'Stack vs heap',
        question: 'What is the difference between the call stack and the heap in a JavaScript engine?',
        shortAnswer: 'The call stack is a small LIFO region of function frames that grows and shrinks with calls; the heap is a large GC-managed region where objects, arrays, strings and closures live.',
        detailedAnswer: [
          'Stack frames hold arguments, locals and references to heap objects.',
          'Stack size is fixed (about 1 MB); overflow throws RangeError.',
          'Heap objects are freed by GC when unreachable.',
          'Stack references act as GC roots.',
        ],
        followUp: 'What error do you get when the stack overflows?',
        trap: 'Saying all primitives always live on the stack — engines decide (closures, Contexts).',
      },
      {
        category: 'nodejs', kind: 'scenario', difficulty: 'intermediate', topic: 'Stack overflow',
        question: 'An endpoint that processes nested comment threads crashes with "Maximum call stack size exceeded" for one customer. How do you fix it?',
        shortAnswer: 'The thread depth exceeds the stack; convert the recursive traversal to an iterative one with an explicit array stack or queue, and add a depth limit for untrusted input.',
        detailedAnswer: [
          'Each recursion level adds a frame; ~1 MB stack allows roughly 10k frames depending on frame size.',
          'An explicit stack lives on the heap and can hold millions of entries.',
          'Validate/limit depth at input time to prevent DoS.',
          'Avoid raising --stack-size — it can cause segfaults.',
        ],
        followUp: 'Does JavaScript tail-call optimization help here?',
        trap: 'Assuming TCO will save you — V8 does not implement it.',
      },
    ],
  },

  // ───────────────────────────────────────────────────────────
  'worker-threads': {
    summary: 'Worker threads run JavaScript in separate V8 isolates in the same process — the tool for CPU-bound work — communicating by structured-clone messages, transferable ArrayBuffers, or SharedArrayBuffer + Atomics.',
    topics: ['worker_threads', 'workerData', 'postMessage', 'structured clone', 'transferList', 'MessageChannel', 'SharedArrayBuffer', 'Atomics', 'worker pool', 'piscina', 'resourceLimits'],
    sections: [
      section('introduction', undefined,
        text("Module 3 introduced `new Worker()`. Here the focus is *performance*: when a worker actually helps, how to move data without copying, and why you should always use a **pool** in a server."),
      ),
      section('definition', 'Definition',
        bullets(
          "A **worker** is an OS thread with its own V8 isolate, event loop and heap — but the same process (shares the libuv thread pool and file descriptors).",
          "**workerData** — a structured-clone copy of initial data passed to the constructor.",
          "**postMessage** — copies values with the **structured clone** algorithm (Maps, Sets, Dates, typed arrays OK; functions and class prototypes are lost).",
          "**transferList** — moves `ArrayBuffer`/`MessagePort` ownership with zero copy; the sender's buffer becomes detached (length 0).",
          "**SharedArrayBuffer** — memory visible to multiple threads at once; coordinate with **Atomics**.",
        ),
      ),
      section('why', 'Why workers (and when not)',
        table('Should this go in a worker?', ['Workload', 'Worker helps?', 'Why'], [
          ['Image resizing, PDF render, compression in JS', 'Yes', 'Pure CPU on the main thread blocks the loop'],
          ['bcrypt/argon2 hashing via async API', 'Usually no', 'Native async APIs already use the libuv pool'],
          ['Database / HTTP calls', 'No', 'I/O is already non-blocking; a worker adds overhead'],
          ['Parsing a 50 MB JSON payload', 'Maybe', 'Parse cost moves off-loop, but the result must be cloned back'],
          ['Tiny tasks (< 1 ms)', 'No', 'Message passing + clone overhead exceeds the work'],
        ]),
      ),
      section('internals', 'How messaging works',
        steps(
          "Starting a worker costs tens of ms and several MB (new isolate, bootstrap) — so reuse workers.",
          "`postMessage(value)` serializes `value` with V8's serializer, enqueues it on a MessagePort, and the other side deserializes on its own loop.",
          "With `postMessage(value, [buf])` the ArrayBuffer's backing store is handed over — no copy, original detached.",
          "SharedArrayBuffer is not transferred or copied — both threads see the same bytes; races are your problem, so use `Atomics.add`, `Atomics.wait/notify`.",
          "`resourceLimits: { maxOldGenerationSizeMb }` caps a worker's heap; exceeding it terminates the worker, not the process.",
        ),
        diagram('thread-pool', 'Workers are separate JS threads; the libuv thread pool is a different, C++-level pool shared by the process.'),
      ),
      section('example', 'A minimal worker pool',
        code({
          title: 'pool.js — fixed-size pool with a task queue',
          code: dedent(`
            import { Worker } from 'node:worker_threads';
            import { availableParallelism } from 'node:os';

            export class WorkerPool {
              #idle = []; #queue = [];
              constructor(file, size = Math.max(1, availableParallelism() - 1)) {
                for (let i = 0; i < size; i++) this.#idle.push(new Worker(file));
              }
              run(task, transfer = []) {
                return new Promise((resolve, reject) => {
                  this.#queue.push({ task, transfer, resolve, reject });
                  this.#drain();
                });
              }
              #drain() {
                while (this.#idle.length && this.#queue.length) {
                  const w = this.#idle.pop();
                  const { task, transfer, resolve, reject } = this.#queue.shift();
                  const done = (fn) => (v) => { w.off('message', onMsg); w.off('error', onErr); this.#idle.push(w); this.#drain(); fn(v); };
                  const onMsg = done(resolve), onErr = done(reject);
                  w.once('message', onMsg); w.once('error', onErr);
                  w.postMessage(task, transfer);
                }
              }
            }
          `),
          explanation: [
            'Workers are created once; tasks queue when all are busy — this bounds CPU and memory.',
            '`availableParallelism()` (Node 18.14+) gives the usable core count; leave one core for the main loop.',
            'A real pool must also replace workers that crash (`error` → worker exits) — production code should use **piscina** (third-party), which handles this, plus cancellation and task timeouts.',
          ],
        }),
        code({
          title: 'Zero-copy transfer vs clone',
          code: dedent(`
            import { Worker } from 'node:worker_threads';

            const w = new Worker(new URL('./hash-worker.js', import.meta.url));
            const buf = new Uint8Array(64 * 1024 * 1024).buffer;  // 64 MB

            w.postMessage({ buf }, [buf]);          // transfer, not copy
            console.log('after transfer byteLength =', buf.byteLength);
          `),
          expectedOutput: 'after transfer byteLength = 0',
          explanation: [
            'Ownership moved to the worker; the sender sees a **detached** buffer of length 0.',
            'Without the transfer list, 64 MB would be copied — doubling memory and costing CPU on the main thread.',
          ],
        }),
        code({
          title: 'SharedArrayBuffer + Atomics counter',
          code: dedent(`
            // main.js
            import { Worker } from 'node:worker_threads';
            const shared = new SharedArrayBuffer(4);
            const counter = new Int32Array(shared);
            const workers = Array.from({ length: 4 }, () =>
              new Worker('./inc.js', { workerData: { shared } }));
            await Promise.all(workers.map((w) => new Promise((r) => w.on('exit', r))));
            console.log(Atomics.load(counter, 0));

            // inc.js
            import { workerData } from 'node:worker_threads';
            const c = new Int32Array(workerData.shared);
            for (let i = 0; i < 1_000_000; i++) Atomics.add(c, 0, 1);
          `),
          expectedOutput: '4000000',
          explanation: [
            'All four threads write the same memory; `Atomics.add` makes each increment indivisible.',
            'With `c[0]++` instead, increments race and the result would usually be less than 4,000,000.',
          ],
        }),
      ),
      section('real-world', 'Real-world backend usage',
        bullets(
          "Thumbnail generation in pure JS, report/PDF rendering, CSV → XLSX conversion, server-side syntax highlighting, ML inference in JS.",
          "Create the pool at startup, size it to cores, and put a **bounded queue** in front (reject with 503 when full).",
          "Set per-task timeouts; terminate and replace stuck workers (`worker.terminate()`).",
          "Pass IDs/paths instead of huge objects; let the worker read the file itself.",
        ),
      ),
      section('mistakes', 'Common mistakes',
        code({
          title: 'Wrong vs right: worker per request',
          code: dedent(`
            // Wrong: spawns a new isolate for every request: ~30ms + MBs each, unbounded under load
            app.post('/resize', (req, res) => {
              const w = new Worker('./resize.js', { workerData: req.body });
              w.once('message', (out) => res.send(out));
            });

            // Right: shared pool (piscina — third-party)
            import Piscina from 'piscina';
            const pool = new Piscina({ filename: new URL('./resize.js', import.meta.url).href });
            app.post('/resize', async (req, res) => res.send(await pool.run(req.body)));
          `),
        }),
        bullets(
          "Using workers for I/O-bound work — they don't make `await fetch()` faster.",
          "Posting class instances and expecting methods on the other side (structured clone drops prototypes).",
          "Sharing a SharedArrayBuffer without Atomics → data races.",
        ),
      ),
      section('interview', 'Interview angle',
        interviewTip("Contrast **copy** (structured clone), **transfer** (move ownership) and **share** (SharedArrayBuffer). Then say you'd use a pool sized to cores with a bounded queue."),
      ),
      section('practice', 'Practice',
        text("Move a `fib(40)` endpoint into a piscina pool. Load test both versions with `autocannon -c 50` and compare p99 of a separate `/health` route."),
      ),
      section('summary', 'Summary',
        bullets(
          "Workers = separate isolates in one process; for CPU-bound JS only.",
          "Messages are structured-cloned; transfer ArrayBuffers to avoid copies; share with SAB + Atomics.",
          "Always pool workers; bound the queue; handle crashes and timeouts.",
        ),
      ),
    ],
    revisionNotes: [
      'Worker = own isolate, heap, event loop; same process.',
      'postMessage uses structured clone; functions/prototypes lost.',
      'transferList moves ArrayBuffer (sender becomes detached, byteLength 0).',
      'SharedArrayBuffer shared memory → use Atomics.',
      'Pool workers (piscina, third-party); startup cost tens of ms.',
      'resourceLimits caps a worker heap.',
    ],
    quiz: [
      {
        kind: 'predict-output', difficulty: 'intermediate',
        prompt: 'What does the main thread log?',
        code: "const ab = new ArrayBuffer(8);\nworker.postMessage(ab, [ab]);\nconsole.log(ab.byteLength);",
        options: ['8', '0', 'undefined', 'TypeError'],
        answer: 1,
        explanation: 'Transferring detaches the ArrayBuffer in the sender, so byteLength becomes 0. It would stay 8 if it had been cloned (no transfer list).',
      },
      {
        kind: 'scenario', difficulty: 'advanced',
        prompt: 'An API spends 300 ms of CPU per request generating PDFs. Traffic is 20 req/s on an 8-core machine. Best design?',
        options: ['A new Worker per request', 'A worker pool of ~7 threads with a bounded queue and timeouts', 'Increase UV_THREADPOOL_SIZE to 64', 'Wrap the generator in an async function'],
        answer: 1,
        explanation: '20 × 0.3 s = 6 CPU-seconds per second, which fits ~7 pooled workers. Per-request workers add startup cost and are unbounded; UV_THREADPOOL_SIZE only affects libuv C++ tasks, not your JS.',
      },
      {
        kind: 'complete-code', difficulty: 'advanced',
        prompt: 'Fill in the call so the four threads increment the shared counter safely.',
        code: "const c = new Int32Array(workerData.shared);\nfor (let i = 0; i < 1e6; i++) /* ??? */;",
        options: ['c[0]++', 'Atomics.add(c, 0, 1)', 'c[0] = c[0] + 1', 'Atomics.store(c, 0, c[0] + 1)'],
        answer: 1,
        explanation: 'Atomics.add performs an atomic read-modify-write. Atomics.store(c, 0, c[0] + 1) still reads non-atomically first, so increments can be lost.',
      },
    ],
    interview: [
      {
        category: 'advanced', kind: 'concept', difficulty: 'intermediate', topic: 'Worker threads',
        question: 'When should you use worker threads in a Node.js server, and when are they the wrong tool?',
        shortAnswer: 'Use them for CPU-bound JavaScript that would block the event loop (image processing, parsing, compression in JS); they are the wrong tool for I/O-bound work, which is already non-blocking, and for tiny tasks where messaging overhead dominates.',
        detailedAnswer: [
          'Each worker has its own isolate and event loop; work there does not block the main loop.',
          'Startup costs tens of ms and MBs — use a pool.',
          'Data crosses via structured clone unless transferred or shared.',
          'Native async APIs (crypto.pbkdf2, zlib) already run on the libuv pool.',
        ],
        followUp: 'How do you avoid copying a large buffer to a worker?',
        trap: 'Thinking workers speed up database or HTTP calls.',
      },
      {
        category: 'advanced', kind: 'concept', difficulty: 'advanced', topic: 'Worker threads',
        question: 'Compare structured clone, transferable objects and SharedArrayBuffer for passing data to workers.',
        shortAnswer: 'Structured clone copies the data; transferring moves ownership of an ArrayBuffer with no copy and detaches it in the sender; SharedArrayBuffer lets both threads access the same memory concurrently, requiring Atomics for safe coordination.',
        detailedAnswer: [
          'Clone: safe and simple, O(size) CPU and memory, prototypes/functions lost.',
          'Transfer: O(1), but sender can no longer use the buffer.',
          'Share: zero-copy and concurrent, but you must handle races (Atomics.add, wait/notify).',
          'Choose clone for small messages, transfer for big one-way payloads, share for high-frequency shared state.',
        ],
        followUp: 'What happens if two workers do counter[0]++ on a shared Int32Array?',
        trap: 'Believing SharedArrayBuffer is "transferred" — it is shared, not moved.',
      },
    ],
  },

  // ───────────────────────────────────────────────────────────
  'child-processes': {
    summary: 'Child processes give full isolation — separate memory, crash domain and even language — at higher cost than workers; fork() adds an IPC channel for Node-to-Node messaging.',
    topics: ['child_process', 'fork', 'IPC', 'spawn', 'execFile', 'process isolation', 'serialization advanced', 'crash isolation', 'shell injection'],
    sections: [
      section('introduction', undefined,
        text("Workers share a process; if a native addon segfaults or a library leaks, everything dies together. A child process is a separate OS process: it can crash, leak or be killed without taking your API down."),
      ),
      section('definition', 'Definition',
        table('Choosing an API', ['API', 'Runs', 'Shell?', 'Output', 'Use for'], [
          ['spawn(cmd, args)', 'Any binary', 'No (unless shell: true)', 'Streams', 'Long-running tools, large output (ffmpeg)'],
          ['execFile(file, args)', 'Any binary', 'No', 'Buffered (maxBuffer)', 'Short commands with small output'],
          ['exec(cmd)', 'Shell command string', 'Yes', 'Buffered', 'Avoid with user input (injection)'],
          ['fork(module)', 'A Node script', 'No', 'Streams + IPC channel', 'Node workers needing isolation'],
        ]),
        table('Worker thread vs child process', ['', 'Worker thread', 'Child process'], [
          ['Memory', 'Separate heap, same process', 'Fully separate process'],
          ['Startup cost', '~tens of ms', '~50–100+ ms, more RAM (~30 MB+)'],
          ['Crash isolation', 'Native crash kills whole process', 'Only the child dies'],
          ['Data passing', 'Clone / transfer / SharedArrayBuffer', 'IPC serialization (JSON or advanced), stdio'],
          ['Other languages', 'No', 'Yes (Python, ffmpeg, ...)'],
        ]),
      ),
      section('why', 'Why for performance and isolation',
        bullets(
          "Run untrusted or leak-prone code (e.g. a rendering library) and recycle the process every N jobs.",
          "Use battle-tested native tools (ffmpeg, ImageMagick, git) that are faster than JS reimplementations.",
          "Hard kill on timeout: `child.kill('SIGKILL')` always works; a stuck worker thread running a tight native loop can be harder to stop.",
        ),
      ),
      section('internals', 'How fork + IPC works',
        steps(
          "`fork('job.js')` spawns a new `node` process with an extra IPC pipe (fd 3 in the child, `NODE_CHANNEL_FD`).",
          "`child.send(msg)` serializes `msg` (JSON by default, or V8 structured clone with `serialization: 'advanced'`) and writes it to the pipe.",
          "The child receives it via `process.on('message')` and replies with `process.send()`.",
          "An open IPC channel keeps both event loops alive; call `process.disconnect()` / `child.disconnect()` when finished.",
          "`'exit'` gives `(code, signal)`; a non-null `signal` means it was killed (e.g. `SIGKILL` from your timeout or the OOM killer).",
        ),
        flow(['Parent: fork(job.js)', 'OS: new process + IPC pipe', 'Parent: child.send(task)', 'Child: process.on(message) → work', 'Child: process.send(result)', 'Parent: on(message) / on(exit)'], { title: 'fork + IPC', direction: 'horizontal' }),
      ),
      section('example', 'Isolated job runner with timeout and recycling',
        code({
          title: 'parent.js',
          code: dedent(`
            import { fork } from 'node:child_process';

            export function runIsolated(task, { timeoutMs = 10_000 } = {}) {
              return new Promise((resolve, reject) => {
                const child = fork(new URL('./render.js', import.meta.url), {
                  serialization: 'advanced',               // supports Map, Date, Buffer...
                  execArgv: ['--max-old-space-size=256'],   // cap the child's heap
                });
                const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs);
                child.once('message', (result) => { clearTimeout(timer); resolve(result); child.disconnect(); });
                child.once('exit', (code, signal) => {
                  clearTimeout(timer);
                  if (code !== 0) reject(new Error(\`render failed code=\${code} signal=\${signal}\`));
                });
                child.send(task);
              });
            }
          `),
          expectedOutput: '(on timeout) Error: render failed code=null signal=SIGKILL',
          explanation: [
            'Each job gets a fresh process with a 256 MB heap cap — a leak or crash cannot affect the API process.',
            "`serialization: 'advanced'` (Node 12.16+) uses structured clone over IPC instead of JSON.",
            'When killed by a signal, `code` is `null` and `signal` names it.',
            'For throughput, keep a small pool of long-lived children and recycle each after N jobs instead of forking per job.',
          ],
        }),
        code({
          title: 'render.js (child)',
          code: dedent(`
            process.on('message', async (task) => {
              const pdf = await renderPdf(task);       // heavy / leak-prone library
              process.send({ id: task.id, size: pdf.length });
            });
          `),
        }),
      ),
      section('real-world', 'Real-world backend usage',
        bullets(
          "Video transcoding: `spawn('ffmpeg', [...args])` and stream stdout to S3 — never buffer with `exec`.",
          "Headless browser/PDF rendering in a recycled child pool.",
          "Running user-submitted code (with OS-level sandboxing — a child process alone is **not** a security sandbox).",
        ),
      ),
      section('mistakes', 'Common mistakes',
        code({
          title: 'Wrong vs right: shell injection',
          code: dedent(`
            // Wrong: filename "x.png; rm -rf /" runs in a shell
            exec(\`convert \${req.query.file} out.webp\`);

            // Right: no shell, arguments passed as an array
            execFile('convert', [req.query.file, 'out.webp']);
          `),
        }),
        bullets(
          "Forgetting `maxBuffer` limits on `exec`/`execFile` — large output throws `ERR_CHILD_PROCESS_STDIO_MAXBUFFER`.",
          "Forking a child per HTTP request with no concurrency limit — fork bombs your own server.",
          "Not handling `'error'` (e.g. binary not found → `ENOENT`).",
        ),
      ),
      section('interview', 'Interview angle',
        interviewTip("The key trade-off sentence: *workers are cheaper and share memory; child processes cost more but give crash and memory isolation and can run any binary.*"),
      ),
      section('practice', 'Practice',
        text("Build a pool of 3 forked children that each process at most 50 jobs before being replaced. Kill any job exceeding 5 s."),
      ),
      section('summary', 'Summary',
        bullets(
          "spawn/execFile for binaries; fork for Node children with IPC.",
          "Child processes = isolation (memory, crashes, heap caps) at higher cost.",
          "Use timeouts with SIGKILL, recycle long-lived children, bound concurrency.",
          "Never build shell commands from user input.",
        ),
      ),
    ],
    revisionNotes: [
      'fork() = node child + IPC channel; send()/on("message").',
      "serialization: 'advanced' → structured clone over IPC.",
      'exit event: (code, signal); killed → code null.',
      'exec uses a shell → injection risk; prefer execFile/spawn with args array.',
      'Child processes isolate crashes and memory; workers do not.',
    ],
    quiz: [
      {
        kind: 'mcq', difficulty: 'intermediate',
        prompt: 'A native image library occasionally segfaults. Which isolation keeps your API alive?',
        options: ['A worker thread', 'A child process', 'A setImmediate wrapper', 'try/catch around the call'],
        answer: 1,
        explanation: 'A segfault kills the whole OS process, including all its worker threads. Only a separate process contains it. try/catch cannot catch native crashes.',
      },
      {
        kind: 'find-bug', difficulty: 'intermediate',
        prompt: 'What is wrong with this endpoint?',
        code: "app.get('/thumb', (req, res) => {\n  exec(`convert ${req.query.src} -resize 200 out.png`, () => res.sendFile('out.png'));\n});",
        options: ['exec is deprecated', 'Command injection through req.query.src (and a shared output file)', 'convert must be spawned with fork', 'It should use execSync'],
        answer: 1,
        explanation: 'exec runs a shell, so shell metacharacters in src execute arbitrary commands; concurrent requests also overwrite the same out.png. execSync would additionally block the loop.',
      },
    ],
    interview: [
      {
        category: 'nodejs', kind: 'concept', difficulty: 'intermediate', topic: 'Child processes',
        question: 'Compare spawn, exec, execFile and fork.',
        shortAnswer: 'spawn streams I/O of any command without a shell; exec runs a command string in a shell and buffers output; execFile runs a binary without a shell and buffers output; fork spawns a Node script with an IPC channel.',
        detailedAnswer: [
          'spawn suits long-running processes and large output.',
          'exec is convenient but vulnerable to injection and limited by maxBuffer.',
          'execFile avoids the shell — safer for arguments from users.',
          'fork enables send()/message between Node processes.',
        ],
        followUp: 'How do you pass a Map or Date over fork IPC?',
        trap: 'Saying fork shares memory with the parent — it is a fully separate process.',
      },
      {
        category: 'advanced', kind: 'concept', difficulty: 'advanced', topic: 'Process isolation',
        question: 'When would you choose a child process over a worker thread for CPU-heavy work?',
        shortAnswer: 'When you need crash or memory isolation (native code that may segfault or leak), a hard kill on timeout, a non-Node binary, or per-job heap limits — accepting higher startup cost and serialization over IPC.',
        detailedAnswer: [
          'A worker crash in native code kills the whole process; a child crash does not.',
          'Children can be recycled after N jobs to reset leaks.',
          'execArgv lets you cap the child heap independently.',
          'IPC is slower than worker messaging and there is no shared memory.',
          'Workers win for frequent, small, pure-JS CPU tasks.',
        ],
        followUp: 'How do you detect that a child was killed by the OOM killer?',
        trap: 'Assuming a child process is a security sandbox by itself.',
      },
    ],
  },
};

export default content;
