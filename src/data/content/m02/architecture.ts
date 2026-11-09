import type { ModuleContent } from '../../../types';
import { bullets, code, dedent, diagram, flow, interviewTip, note, section, steps, table, text, warn } from '../helpers';

const content: Partial<ModuleContent> = {
  'node-js-architecture': {
    summary: 'Node is layered: your JS → Node standard library (JS) → C++ bindings → V8 (execution) and libuv (event loop, async I/O, thread pool) → the operating system.',
    topics: ['architecture', 'bindings', 'V8', 'libuv', 'thread pool', 'event loop', 'llhttp', 'OpenSSL', 'c-ares', 'Node-API'],
    sections: [
      section('introduction', undefined,
        text("When you call `fs.readFile`, at least four layers cooperate before the OS reads a byte. Knowing those layers explains Node's performance profile and its failure modes."),
      ),
      section('definition', 'The layers',
        table('Node.js layers', ['Layer', 'Language', 'Responsibility'], [
          ['Application code', 'JS/TS', 'Your handlers, business logic'],
          ['Node standard library (`lib/`)', 'JavaScript', '`fs`, `http`, `net`, `stream`, `events` — validation, ergonomics'],
          ['Bindings (`src/`)', 'C++', 'Translate JS calls to C/C++ calls; wrap handles (`internalBinding`)'],
          ['V8', 'C++', 'Execute JS, JIT, garbage collection, microtask queue'],
          ['libuv', 'C', 'Event loop, non-blocking sockets, file I/O via thread pool, timers, signals, child processes'],
          ['Other C/C++ deps', 'C/C++', 'llhttp (HTTP parsing), OpenSSL (TLS/crypto), zlib, c-ares (async DNS), ICU (Intl), nghttp2'],
          ['Operating system', '—', 'epoll (Linux), kqueue (macOS/BSD), IOCP (Windows), file system, threads'],
        ]),
      ),
      section('why', 'Why this design',
        bullets(
          "JavaScript gets C-level performance for parsing, crypto and compression without writing C.",
          "libuv hides OS differences, so the same code runs on Linux, macOS and Windows.",
          "Keeping JS on one thread avoids locks in user code; parallelism lives in libuv and native libraries.",
        ),
      ),
      section('internals', 'Journey of an async call',
        diagram('node-architecture', 'JS → standard library → C++ bindings → libuv → OS, and back through a callback.'),
        steps(
          "Your code calls `fs.readFile('a.txt', cb)`.",
          "`lib/fs.js` validates arguments and calls the C++ binding (`binding.open`, then reads).",
          "The binding creates a libuv request (`uv_fs_t`) and submits it; file operations go to the **libuv thread pool**.",
          "The JS call returns immediately — the main thread continues running other code.",
          "A pool thread performs the blocking `read()` syscall.",
          "When done, libuv queues the completion; in the **poll phase** the event loop picks it up.",
          "The binding converts the result into JS values and V8 invokes your callback.",
        ),
        flow(['Network call (http.get)', 'libuv registers socket with epoll/kqueue/IOCP', 'OS notifies readiness', 'Callback on main thread'], { title: 'Network I/O path — no thread pool involved', direction: 'horizontal' }),
        note("Native addons extend this architecture: **Node-API (N-API)** gives C/C++ addons an ABI-stable interface across Node versions (used by `sharp`, `bcrypt`, `better-sqlite3`)."),
      ),
      section('visual', 'Threads in a running Node process',
        table('Threads you will find', ['Thread', 'Purpose'], [
          ['Main thread', 'Runs all your JavaScript and the event loop'],
          ['libuv thread pool (4 by default)', 'fs, dns.lookup, crypto (pbkdf2, scrypt, randomBytes), zlib'],
          ['V8 background threads', 'Concurrent/parallel GC, background compilation'],
          ['Inspector / signal / platform threads', 'Debugger, internal tasks'],
        ]),
        diagram('thread-pool', 'Main thread offloads specific blocking operations to libuv workers.'),
      ),
      section('example', 'Seeing the layers',
        code({
          title: 'Bundled components',
          code: dedent(`
            const { versions } = process;
            console.log({
              node: versions.node,
              v8: versions.v8,
              uv: versions.uv,
              openssl: versions.openssl,
              llhttp: versions.llhttp,
            });
          `),
          expectedOutput: "{\n  node: '22.11.0',\n  v8: '12.4.254.21-node.21',\n  uv: '1.48.0',\n  openssl: '3.0.15+quic',\n  llhttp: '9.2.1'\n}",
          explanation: [
            "Every Node release bundles exact versions of these libraries.",
            "Security advisories often target a dependency (e.g. OpenSSL) — upgrading Node upgrades them.",
          ],
        }),
      ),
      section('real-world', 'Why architecture knowledge pays off',
        bullets(
          "Slow `bcrypt`/`fs` calls under load → thread-pool saturation; raising `UV_THREADPOOL_SIZE` may help.",
          "High latency with idle CPU on one core → event loop blocked by synchronous JS.",
          "Native addon crashes after an upgrade → addon not built with Node-API or needs rebuild.",
        ),
      ),
      section('mistakes', 'Common mistakes',
        bullets(
          "Saying 'all async I/O uses the thread pool' — network sockets do not.",
          "Saying 'Node has one thread' — it has several; only JS execution is single-threaded.",
          "Thinking V8 provides the event loop — libuv does.",
        ),
      ),
      section('interview', 'Interview angle',
        interviewTip("Draw the stack: JS → lib → bindings → V8 + libuv → OS. Then trace one call (fs vs http) through it — that differentiates you."),
      ),
      section('practice', 'Practice',
        text("Run `node -p process.versions` and identify which library handles HTTP parsing, TLS, DNS and compression."),
      ),
      section('summary', 'Summary',
        bullets(
          "Layers: app → stdlib (JS) → bindings (C++) → V8 + libuv → OS.",
          "V8 executes JS; libuv does the event loop and async I/O.",
          "File I/O uses the thread pool; network I/O uses OS async notification.",
          "Node-API gives addons a stable ABI.",
        ),
      ),
    ],
    revisionNotes: [
      "V8: JS execution + GC. libuv: event loop + I/O + thread pool.",
      "Bindings = C++ glue (internalBinding).",
      "llhttp parses HTTP, OpenSSL does TLS, c-ares async DNS, zlib compression.",
      "Thread pool default 4 (UV_THREADPOOL_SIZE, max 1024).",
      "Network I/O: epoll/kqueue/IOCP, not the pool.",
    ],
    quiz: [
      {
        kind: 'mcq', difficulty: 'intermediate',
        prompt: 'Which layer translates a JavaScript call like `fs.open()` into a libuv request?',
        options: ["V8","npm","The C++ bindings","The OS kernel"],
        answer: 2,
        explanation: "Bindings are the C++ glue between JS and libuv/native libraries. V8 only executes JS; it knows nothing about files.",
      },
      {
        kind: 'mcq', difficulty: 'intermediate',
        prompt: 'Which library parses incoming HTTP requests in modern Node.js?',
        options: ['libuv', 'llhttp', 'c-ares', 'zlib'],
        answer: 1,
        explanation: "llhttp is Node's HTTP parser. libuv delivers the bytes from the socket; c-ares is for DNS; zlib for compression.",
      },
      {
        kind: 'scenario', difficulty: 'advanced',
        prompt: 'An API that hashes passwords with `crypto.pbkdf2` gets slow under load while CPU usage of the main thread stays low. Most likely cause?',
        options: ["The libuv thread pool (4 threads by default) is saturated","The event loop is blocked by synchronous JS","V8 is stuck in garbage collection","Too many open sockets"],
        answer: 0,
        explanation: "Async pbkdf2 runs on the libuv pool. With 4 threads, extra hashes queue up. Raise UV_THREADPOOL_SIZE (before the pool is first used) or scale out. A blocked event loop would show high main-thread CPU instead.",
      },
    ],
    interview: [
      {
        category: 'nodejs', kind: 'concept', difficulty: 'intermediate', topic: 'Architecture',
        question: 'Describe the layers of the Node.js architecture.',
        shortAnswer: 'Application JS sits on Node’s JavaScript standard library, which calls C++ bindings; the bindings use V8 to execute JavaScript and libuv for the event loop and asynchronous I/O, which in turn uses OS facilities.',
        detailedAnswer: [
          "Standard library (`lib/*.js`): user-facing APIs like fs, http, stream.",
          "Bindings (C++): expose native functionality to JS.",
          "V8: compiles/executes JS, manages heap and GC.",
          "libuv: event loop, sockets via epoll/kqueue/IOCP, thread pool for fs/dns.lookup/crypto/zlib.",
          "Other deps: llhttp, OpenSSL, zlib, c-ares, ICU.",
        ],
        followUp: 'Trace what happens when you call fs.readFile.',
      },
      {
        category: 'nodejs', kind: 'concept', difficulty: 'advanced', topic: 'Architecture',
        question: 'How does an asynchronous call like fs.readFile travel from JavaScript to the OS and back?',
        shortAnswer: 'lib/fs validates the call and invokes a C++ binding, which submits a libuv fs request to the thread pool; a worker performs the blocking syscall, libuv queues the completion, and the event loop runs the JS callback on the main thread.',
        detailedAnswer: [
          "JS call returns immediately; nothing blocks the main thread.",
          "libuv worker threads execute blocking file syscalls (open/read/close).",
          "Completion is signalled to the loop (via an async handle) and processed in the poll phase.",
          "The binding converts results to JS values; V8 calls the callback.",
          "readFile actually does several fs ops (open, fstat, read chunks, close), each a pool request.",
        ],
        followUp: 'Why does http.get not use the thread pool?',
        trap: "Saying the OS kernel 'calls back' JavaScript directly, or that V8 does the file read.",
      },
      {
        category: 'nodejs', kind: 'concept', difficulty: 'beginner', topic: 'Architecture',
        question: 'Which parts of Node.js are written in C/C++ and which in JavaScript?',
        shortAnswer: 'V8, libuv, the bindings and libraries like OpenSSL and llhttp are C/C++; the public standard library modules such as fs, http and events are mostly JavaScript built on those bindings.',
        detailedAnswer: [
          "`lib/` folder in the Node repo: JavaScript modules.",
          "`src/` folder: C++ bindings and runtime setup.",
          "`deps/`: V8, libuv, OpenSSL, zlib, llhttp, c-ares, ICU.",
        ],
      },
    ],
  },

  'v8-engine': {
    summary: 'V8 is Google’s open-source JS/Wasm engine: it parses source to an AST, Ignition interprets bytecode, Sparkplug/Maglev/TurboFan compile hot code using type feedback, and an generational GC (Orinoco) manages memory.',
    topics: ['V8', 'Ignition', 'TurboFan', 'Sparkplug', 'Maglev', 'JIT', 'hidden classes', 'inline caches', 'deoptimization', 'garbage collection'],
    sections: [
      section('introduction', undefined,
        text("V8 is the engine inside Chrome and Node. It turns your JavaScript into machine code fast enough that Node can compete with compiled languages for many workloads."),
      ),
      section('definition', 'What V8 is (and is not)',
        bullets(
          "An open-source **JavaScript and WebAssembly engine** written in C++.",
          "Implements ECMAScript: syntax, built-ins (`Array`, `Promise`, `Map`), the microtask queue.",
          "Manages the **heap** and **garbage collection**.",
          "Does **not** provide timers, file system, network or an event loop — those come from the embedder (Node/Chrome).",
        ),
      ),
      section('why', 'Why a JIT pipeline',
        text("Pure interpretation starts fast but runs slowly; full compilation runs fast but starts slowly. V8 starts by interpreting, watches which functions are hot and which types they see, then compiles those with optimising compilers."),
      ),
      section('internals', 'The compilation pipeline',
        flow([
          'Parser: source → AST (lazy parsing skips inner functions until called)',
          'Ignition: AST → bytecode, interpreted; collects type feedback',
          'Sparkplug: fast baseline compiler, bytecode → machine code without optimisation',
          'Maglev: mid-tier optimising compiler (V8 11.7+)',
          'TurboFan: top-tier optimising compiler using type feedback',
          'Deopt: assumptions broken → back to bytecode',
        ], { title: 'V8 tiers', direction: 'vertical' }),
        table('Optimisation techniques', ['Technique', 'What it does'], [
          ['Hidden classes (Maps/shapes)', 'Objects created with the same properties in the same order share a shape, enabling fixed-offset property access'],
          ['Inline caches (ICs)', 'Each property access site remembers the shapes it has seen; monomorphic sites are fastest'],
          ['Speculative optimisation', 'TurboFan assumes the types seen so far (e.g. always small integers)'],
          ['Inlining', 'Small hot functions are copied into the caller'],
          ['Deoptimisation', 'If an assumption fails (a string arrives), V8 discards optimised code and returns to Ignition'],
        ]),
        table('Garbage collection (Orinoco)', ['Space', 'Collector', 'Notes'], [
          ['Young generation (new space)', 'Scavenger (semi-space copying)', 'Most objects die young; fast, frequent minor GCs'],
          ['Old generation', 'Mark-compact (Mark-Sweep-Compact)', 'Concurrent and incremental marking reduce pauses'],
        ]),
        note("Default old-space limit depends on system memory and Node version. Raise it with `node --max-old-space-size=4096 app.js` (MB). Deep dive in Module 11 (V8 internals, GC)."),
      ),
      section('example', 'Shapes and type stability',
        code({
          title: 'Keep object shapes consistent',
          runnable: true,
          code: dedent(`
            class Point {
              constructor(x, y) {
                this.x = x; // same order every time → same hidden class
                this.y = y;
              }
            }

            function lengthSq(p) {
              return p.x * p.x + p.y * p.y; // monomorphic: always sees Point
            }

            let total = 0;
            for (let i = 0; i < 1000; i++) total += lengthSq(new Point(i, i));
            console.log(total);
          `),
          expectedOutput: '665667000',
          explanation: [
            "Every `Point` gets the same shape because properties are assigned in the same order.",
            "The `p.x` access site only ever sees one shape → monomorphic inline cache → fast.",
            "After enough calls, `lengthSq` becomes hot and is optimised.",
            "Sum of 2·i² for i < 1000 is 665,667,000.",
          ],
        }),
        code({
          title: 'Observing optimisation (V8 flags)',
          language: 'bash',
          code: dedent(`
            node --trace-opt --trace-deopt hot.js | grep lengthSq
          `),
          expectedOutput: "[marking 0x2f1e... <JSFunction lengthSq> for optimization to TURBOFAN, ConcurrencyMode::kConcurrent, reason: hot and stable]\n[completed optimizing 0x2f1e... <JSFunction lengthSq> (target TURBOFAN)]",
          explanation: [
            "Node forwards V8 flags; `--trace-opt` logs optimisations, `--trace-deopt` logs bailouts.",
            "Exact log text varies between V8 versions — use it for learning, not for parsing.",
          ],
        }),
      ),
      section('real-world', 'Practical takeaways',
        bullets(
          "Initialise all properties in the constructor; avoid adding properties later or `delete`.",
          "Keep hot functions type-stable (do not mix numbers and strings).",
          "Out-of-memory crashes (`JavaScript heap out of memory`) → check leaks first, then `--max-old-space-size`.",
          "Use `--cpu-prof` or `--inspect` to profile before micro-optimising.",
        ),
      ),
      section('mistakes', 'Common mistakes',
        bullets(
          "Calling V8 an interpreter only — it is a multi-tier JIT.",
          "Micro-optimising for a specific V8 version; heuristics change often.",
          "Using `delete obj.prop` in hot paths — changes the shape and can slow access (set to `undefined` instead).",
        ),
        warn("`JavaScript heap out of memory` is usually a leak or loading too much data at once. Raising the heap limit only buys time."),
      ),
      section('interview', 'Interview angle',
        interviewTip("Name the tiers (Ignition → Sparkplug → Maglev → TurboFan), explain type feedback and deoptimisation, and mention hidden classes. That is the depth most interviews expect."),
      ),
      section('practice', 'Practice',
        text("Write a hot function that receives numbers for 10,000 calls, then a string once. Run with `--trace-deopt` and find the deopt reason."),
      ),
      section('summary', 'Summary',
        bullets(
          "V8 = JS/Wasm engine in C++; also does GC.",
          "Parse → Ignition bytecode → baseline/optimising JIT tiers.",
          "Hidden classes + inline caches make property access fast.",
          "Type changes cause deoptimisation.",
          "Generational GC: scavenger for young, mark-compact for old.",
        ),
      ),
    ],
    revisionNotes: [
      "Ignition = interpreter (bytecode). TurboFan = optimising JIT.",
      "Sparkplug = baseline compiler; Maglev = mid-tier optimiser.",
      "Type feedback drives speculation; broken assumptions → deopt.",
      "Same property order → same hidden class.",
      "Young gen: scavenger; old gen: mark-compact, concurrent marking.",
      "--max-old-space-size sets the old-space limit (MB).",
    ],
    quiz: [
      {
        kind: 'mcq', difficulty: 'intermediate',
        prompt: 'What is the role of Ignition in V8?',
        options: ["Optimising compiler for hot functions","The event loop implementation","Garbage collector for the young generation","Bytecode interpreter that also collects type feedback"],
        answer: 3,
        explanation: "Ignition generates and interprets bytecode, recording types seen. TurboFan (not Ignition) is the optimising compiler; the event loop is libuv's.",
      },
      {
        kind: 'find-bug', difficulty: 'advanced',
        prompt: 'This hot function was fast, then suddenly became slower in production. What likely happened?',
        code: "function add(a, b) { return a + b; }\nfor (let i = 0; i < 1e6; i++) add(i, i);\n// later, from a request:\nadd('5', 10);",
        options: ["V8 ran out of stack","Strings are not allowed with +","Passing a string broke TurboFan’s numeric assumption, causing deoptimisation","The GC freed the function"],
        answer: 2,
        explanation: "The optimised code assumed numbers. A string invalidates that assumption, V8 deoptimises and the call site becomes polymorphic.",
      },
      {
        kind: 'mcq', difficulty: 'beginner',
        prompt: 'Which feature is NOT provided by V8?',
        options: ["Garbage collection","setTimeout","Promise","JIT compilation"],
        answer: 1,
        explanation: "Timers are host APIs provided by Node (or the browser). V8 implements the language, GC and JIT.",
      },
    ],
    interview: [
      {
        category: 'nodejs', kind: 'concept', difficulty: 'intermediate', topic: 'V8',
        question: 'How does V8 execute JavaScript — is it interpreted or compiled?',
        shortAnswer: 'Both: V8 parses code into an AST, the Ignition interpreter runs bytecode while gathering type feedback, and hot functions are JIT-compiled to machine code by Sparkplug, Maglev and TurboFan.',
        detailedAnswer: [
          "Lazy parsing: inner functions are pre-parsed and fully parsed when first called.",
          "Ignition bytecode starts quickly with low memory.",
          "Sparkplug compiles bytecode quickly without optimisation.",
          "Maglev and TurboFan optimise using observed types.",
          "If assumptions break, code deoptimises back to bytecode.",
        ],
        followUp: 'What is deoptimisation and what triggers it?',
        trap: "Saying JavaScript is 'just interpreted'.",
      },
      {
        category: 'nodejs', kind: 'concept', difficulty: 'advanced', topic: 'V8',
        question: 'What are hidden classes and inline caches, and how can code defeat them?',
        shortAnswer: 'Hidden classes (shapes) describe an object’s layout so properties sit at fixed offsets; inline caches remember shapes seen at each property access. Adding properties in varying orders, deleting properties or passing many shapes to one site makes access polymorphic or megamorphic and slower.',
        detailedAnswer: [
          "Each property addition transitions an object to a new shape.",
          "Objects built the same way share a shape chain.",
          "Monomorphic IC (one shape) is fastest; megamorphic (>4 shapes) falls back to slow lookups.",
          "`delete` can move an object to dictionary mode.",
          "Initialise all fields in the constructor in a fixed order.",
        ],
        followUp: 'How would you verify whether a function was optimised?',
      },
      {
        category: 'nodejs', kind: 'concept', difficulty: 'beginner', topic: 'V8',
        question: 'What does V8 provide to Node.js, and what does it not provide?',
        shortAnswer: 'V8 provides JavaScript execution — parsing, JIT compilation, built-in objects, the microtask queue and garbage collection. It does not provide I/O, timers or the event loop; Node and libuv add those.',
        detailedAnswer: [
          "Node embeds V8 through its C++ API (isolates, contexts, handles).",
          "Node bindings register native functions V8 can call.",
          "Chrome embeds the same V8 but adds DOM and browser APIs instead.",
        ],
      },
    ],
  },

  'libuv': {
    summary: 'libuv is the C library behind Node’s event loop: it multiplexes sockets with epoll/kqueue/IOCP, runs timers, and uses a thread pool (default 4, UV_THREADPOOL_SIZE) for file system, dns.lookup, some crypto and zlib.',
    topics: ['libuv', 'event loop', 'epoll', 'kqueue', 'IOCP', 'thread pool', 'UV_THREADPOOL_SIZE', 'handles', 'requests'],
    sections: [
      section('introduction', undefined,
        text("libuv is the reason one JavaScript thread can handle thousands of sockets. It was written for Node to abstract async I/O across Linux, macOS and Windows."),
      ),
      section('definition', 'What libuv provides',
        bullets(
          "The **event loop** (timers → pending → idle/prepare → poll → check → close).",
          "Non-blocking **TCP/UDP sockets, pipes, TTYs** using the OS readiness/completion APIs.",
          "A **thread pool** for operations without a usable async OS API.",
          "Timers, signals, child processes, file watching, async handles to wake the loop from other threads.",
        ),
        table('Two kinds of objects', ['', 'Handles', 'Requests'], [
          ['Lifetime', 'Long-lived', 'Short-lived, one operation'],
          ['Examples', 'TCP server, timer, signal watcher', 'fs read, write request, DNS lookup'],
          ['Keeps loop alive?', 'Yes while active and ref’d (`unref()` opts out)', 'Yes until complete'],
        ]),
      ),
      section('why', 'Why two strategies (OS async vs thread pool)',
        bullets(
          "Sockets: every OS has an efficient readiness/completion API — one thread can watch thousands.",
          "Regular files: on Linux/macOS, `epoll`/`kqueue` cannot make disk reads non-blocking in a portable way, so libuv runs blocking syscalls on worker threads.",
          "`dns.lookup` uses the system resolver (`getaddrinfo`), which is blocking → thread pool. `dns.resolve*` uses c-ares over sockets → no pool.",
        ),
      ),
      section('internals', 'Thread pool details',
        table('What uses what', ['Operation', 'Mechanism'], [
          ['`net`, `http`, `https` sockets', 'OS async: epoll / kqueue / IOCP'],
          ['`fs.*` (async)', 'Thread pool'],
          ['`dns.lookup` (and `http.get` hostname resolution by default)', 'Thread pool'],
          ['`dns.resolve4` etc.', 'c-ares, OS sockets'],
          ['`crypto.pbkdf2`, `scrypt`, `randomBytes`, `randomFill`, keygen (async)', 'Thread pool'],
          ['`zlib` async (gzip, deflate, brotli)', 'Thread pool'],
          ['Timers, `setImmediate`', 'Event loop itself'],
        ]),
        bullets(
          "Default size **4**; set `UV_THREADPOOL_SIZE` (max 1024) as an environment variable before the pool is first used — in practice before starting Node.",
          "The pool is **shared** by all those operation types: slow DNS lookups can delay file reads.",
          "The pool is created lazily on first use.",
        ),
        diagram('thread-pool', 'Main thread submits work; pool threads run blocking syscalls; results return via the poll phase.'),
        diagram('event-loop-phases', 'libuv runs these phases on each loop iteration; Module 5 covers them in depth.'),
      ),
      section('example', 'Observing the 4-thread limit',
        code({
          title: 'Six pbkdf2 calls with the default pool',
          code: dedent(`
            const crypto = require('node:crypto');
            const start = Date.now();

            for (let i = 1; i <= 6; i++) {
              crypto.pbkdf2('secret', 'salt', 200_000, 64, 'sha512', () => {
                console.log('hash ' + i + ': ' + (Date.now() - start) + 'ms');
              });
            }
          `),
          expectedOutput: 'hash 1: 210ms\nhash 3: 212ms\nhash 2: 213ms\nhash 4: 215ms\nhash 5: 420ms\nhash 6: 423ms',
          explanation: [
            "Four hashes run in parallel on the four pool threads and finish around the same time (order among them may vary).",
            "Hashes 5 and 6 wait in the queue for a free thread, so they take roughly twice as long.",
            "Run with `UV_THREADPOOL_SIZE=6 node hash.js` and all six finish together (if you have ≥6 cores).",
            "Timings are illustrative and depend on your CPU.",
          ],
        }),
      ),
      section('real-world', 'Real-world tuning',
        bullets(
          "Services doing many async `bcrypt`/`pbkdf2`/`fs` operations may benefit from a larger pool (e.g. 8–16) — measure first.",
          "Bigger pools do not help pure network services.",
          "A slow DNS server can starve the pool via `dns.lookup`; consider caching or `dns.resolve`.",
        ),
      ),
      section('mistakes', 'Common mistakes',
        bullets(
          "Believing HTTP requests consume pool threads.",
          "Setting `process.env.UV_THREADPOOL_SIZE` deep inside the app after the pool already started — it has no effect.",
          "Raising the pool far above core count for CPU-bound crypto — threads just compete for CPUs.",
        ),
      ),
      section('interview', 'Interview angle',
        interviewTip("The classic follow-ups: 'default pool size?' (4), 'what uses it?' (fs, dns.lookup, crypto, zlib), 'does HTTP use it?' (no — epoll/kqueue/IOCP)."),
      ),
      section('practice', 'Practice',
        text("Run the pbkdf2 example with UV_THREADPOOL_SIZE set to 1, 2, 4 and 8. Plot completion times against pool size."),
      ),
      section('summary', 'Summary',
        bullets(
          "libuv = event loop + cross-platform async I/O.",
          "Sockets use OS async APIs; files/dns.lookup/crypto/zlib use the pool.",
          "Pool default 4, configurable via UV_THREADPOOL_SIZE (max 1024).",
          "Handles keep the loop alive; `unref()` lets the process exit.",
        ),
      ),
    ],
    revisionNotes: [
      "epoll (Linux), kqueue (macOS/BSD), IOCP (Windows).",
      "Pool: fs, dns.lookup, crypto pbkdf2/scrypt/randomBytes, zlib.",
      "UV_THREADPOOL_SIZE default 4, max 1024, set before first use.",
      "dns.resolve uses c-ares (no pool); dns.lookup uses getaddrinfo (pool).",
      "Handles = long-lived; requests = one-shot.",
    ],
    quiz: [
      {
        kind: 'mcq', difficulty: 'intermediate',
        prompt: 'Which of these operations does NOT use the libuv thread pool?',
        options: ["Reading from a TCP socket","crypto.scrypt","fs.readFile","zlib.gzip"],
        answer: 0,
        explanation: "Socket I/O uses the OS readiness/completion APIs (epoll/kqueue/IOCP). The others run blocking work on pool threads.",
      },
      {
        kind: 'predict-output', difficulty: 'advanced',
        prompt: 'With the default thread pool, eight async pbkdf2 calls (each ~100 ms of CPU) start at once on an 8-core machine. Roughly when do they finish?',
        code: "for (let i = 0; i < 8; i++) crypto.pbkdf2('p', 's', 100_000, 64, 'sha512', done);",
        options: ["All eight at ~100 ms","All eight at ~800 ms","One every 100 ms, up to ~800 ms","Four at ~100 ms, four at ~200 ms"],
        answer: 3,
        explanation: "Only 4 pool threads exist by default, so work runs in two batches of four. Core count does not matter unless UV_THREADPOOL_SIZE is raised.",
      },
      {
        kind: 'mcq', difficulty: 'intermediate',
        prompt: 'What is the default size of the libuv thread pool?',
        options: ["1","Number of CPU cores","4","128"],
        answer: 2,
        explanation: "It is 4 regardless of core count. Change it with the UV_THREADPOOL_SIZE environment variable.",
      },
    ],
    interview: [
      {
        category: 'nodejs', kind: 'concept', difficulty: 'intermediate', topic: 'libuv',
        question: 'What is libuv and what does it provide to Node.js?',
        shortAnswer: 'libuv is a cross-platform C library that implements Node’s event loop and asynchronous I/O: non-blocking sockets via OS APIs, timers, signals, child processes and a thread pool for blocking operations.',
        detailedAnswer: [
          "Abstracts epoll (Linux), kqueue (macOS/BSD) and IOCP (Windows).",
          "Runs the event loop phases: timers, pending callbacks, poll, check, close.",
          "Thread pool (default 4) for fs, dns.lookup, crypto and zlib.",
          "Handles (long-lived) and requests (one-shot) keep the loop alive.",
        ],
        followUp: 'Which operations use the thread pool?',
      },
      {
        category: 'nodejs', kind: 'concept', difficulty: 'intermediate', topic: 'libuv',
        question: 'Which Node operations use the libuv thread pool, and how do you change its size?',
        shortAnswer: 'Async file system calls, dns.lookup, CPU-heavy crypto like pbkdf2/scrypt/randomBytes, and async zlib. Its default size is 4 and you change it with the UV_THREADPOOL_SIZE environment variable before the pool is first used.',
        detailedAnswer: [
          "Maximum is 1024 threads.",
          "The pool is shared across all those operation types.",
          "Network sockets and timers do not use it.",
          "Set it when launching: `UV_THREADPOOL_SIZE=8 node app.js`.",
        ],
        trap: "Setting it in code after an fs or crypto call already started the pool.",
      },
      {
        category: 'nodejs', kind: 'concept', difficulty: 'advanced', topic: 'libuv',
        question: 'Why does network I/O not use the libuv thread pool while file I/O does?',
        shortAnswer: 'Operating systems offer scalable non-blocking APIs for sockets (epoll, kqueue, IOCP), so one thread can watch thousands. For regular files there is no portable readiness-based non-blocking API, so libuv performs blocking file syscalls on worker threads.',
        detailedAnswer: [
          "Regular files are always 'ready' for epoll/kqueue, so readiness tells you nothing; reads can still block on disk.",
          "Windows IOCP can do async file I/O, but libuv keeps one consistent model across platforms.",
          "libuv added experimental io_uring support for some Linux fs operations, but Node currently keeps it disabled by default.",
          "Practical result: sockets scale with no extra threads; heavy fs load can saturate the pool.",
        ],
        followUp: 'Does dns.lookup use the pool? What about dns.resolve?',
      },
    ],
  },
};

export default content;
