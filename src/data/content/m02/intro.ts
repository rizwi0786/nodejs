import type { ModuleContent } from '../../../types';
import { bullets, code, dedent, diagram, flow, interviewTip, note, section, steps, table, text } from '../helpers';

const content: Partial<ModuleContent> = {
  'what-is-node-js': {
    summary: 'Node.js is an open-source JavaScript runtime built on V8 and libuv that runs JavaScript outside the browser, mainly for servers, CLIs and tooling.',
    topics: ['Node.js', 'JavaScript runtime', 'V8', 'libuv', 'server-side JavaScript', 'OpenJS Foundation'],
    sections: [
      section('introduction', undefined,
        text("JavaScript was born inside the browser. Node.js takes the same language and lets you run it on a server, a laptop terminal or a container — anywhere there is an operating system."),
      ),
      section('definition', 'Definition',
        text("**Node.js is a JavaScript runtime**: a program that executes JavaScript and gives it access to the operating system (files, network, processes)."),
        bullets(
          "Not a language — the language is JavaScript (ECMAScript).",
          "Not a framework — Express, Fastify and NestJS are frameworks that *run on* Node.",
          "Built from **V8** (Google's JS engine, C++), **libuv** (cross-platform async I/O, C) and Node's own C++ bindings and JavaScript standard library.",
          "Open source, cross-platform (Linux, macOS, Windows), governed by the **OpenJS Foundation**.",
        ),
      ),
      section('why', 'Why it exists',
        bullets(
          "Servers spend most of their time **waiting** on I/O (databases, disks, other APIs).",
          "Ryan Dahl (2009) wanted a server where waiting does not block a thread, so one process can juggle thousands of connections.",
          "JavaScript already had a callback/event culture and no blocking I/O APIs — a natural fit.",
        ),
      ),
      section('internals', 'What is inside the node binary',
        table('Building blocks', ['Part', 'Written in', 'Job'], [
          ['V8', 'C++', 'Parses, compiles and runs JavaScript; manages the heap and GC'],
          ['libuv', 'C', 'Event loop, async file/network I/O, thread pool, timers'],
          ['Node bindings', 'C++', 'Glue that exposes libuv/OS/OpenSSL/zlib to JavaScript'],
          ['Node standard library', 'JavaScript', '`fs`, `http`, `path`, `events`, `stream`…'],
          ['Other deps', 'C/C++', 'OpenSSL (crypto/TLS), zlib, llhttp (HTTP parser), c-ares (DNS), ICU'],
        ]),
        diagram('node-architecture', 'Your JS calls the standard library, which calls C++ bindings, which use libuv and the OS.'),
      ),
      section('example', 'Your first Node program',
        code({
          title: 'hello.js',
          code: dedent(`
            // hello.js — run with: node hello.js
            const os = require('node:os');

            console.log('Hello from Node', process.version);
            console.log('Platform:', process.platform);
            console.log('CPU cores:', os.cpus().length);
          `),
          expectedOutput: 'Hello from Node v22.11.0\nPlatform: linux\nCPU cores: 8',
          explanation: [
            "`process` is a Node global describing the running process — it does not exist in browsers.",
            "`process.version` prints the Node version (your number will differ).",
            "`require('node:os')` loads a core module; the `node:` prefix makes it explicit that this is built in.",
            "Platform and core count depend on your machine.",
          ],
        }),
      ),
      section('real-world', 'Where you meet Node',
        bullets(
          "REST/GraphQL APIs and backend-for-frontend layers.",
          "Build tools you already use: Vite, webpack, ESLint, TypeScript compiler, Prettier.",
          "CLIs (`npm`, `create-react-app`, `vercel`), serverless functions, real-time chat servers.",
        ),
      ),
      section('mistakes', 'Common misconceptions',
        bullets(
          "\"Node is a framework\" — it is a runtime; frameworks sit on top.",
          "\"Node is single-threaded, period\" — **your JavaScript** runs on one main thread, but libuv uses a thread pool and V8 runs GC/compiler threads.",
          "\"Node is only for web servers\" — tooling and CLIs are an equally big use.",
        ),
      ),
      section('interview', 'Interview angle',
        interviewTip("Answer in one line first: 'A JavaScript runtime built on V8 and libuv with an event-driven, non-blocking I/O model.' Then mention what each part does."),
      ),
      section('practice', 'Practice',
        steps(
          "Create `hello.js` printing `process.version`, `process.platform` and `process.arch`.",
          "Run it with `node hello.js`.",
          "Run `node -p \"process.versions\"` and find the versions of V8 and libuv bundled in your Node.",
        ),
      ),
      section('summary', 'Summary',
        bullets(
          "Node.js = JavaScript runtime, not a language or framework.",
          "V8 executes JS; libuv provides the event loop and async I/O.",
          "Gives JS access to files, network and processes.",
          "Designed for I/O-heavy, highly concurrent workloads.",
        ),
      ),
    ],
    revisionNotes: [
      "Runtime = engine (V8) + APIs + event loop (libuv).",
      "Created by Ryan Dahl in 2009; governed by the OpenJS Foundation.",
      "`process.versions` lists bundled V8, libuv, OpenSSL versions.",
      "JS runs on one main thread; Node as a whole is multi-threaded.",
    ],
    quiz: [
      {
        kind: 'mcq', difficulty: 'beginner',
        prompt: 'Which statement best describes Node.js?',
        options: ["A JavaScript runtime built on V8 and libuv","A new programming language derived from JavaScript","A JavaScript framework for building web servers","A browser engine without a UI"],
        answer: 0,
        explanation: "Node is a runtime: it executes JS (via V8) and adds OS APIs and an event loop (via libuv). Express is the framework that sits on top — a common confusion.",
      },
      {
        kind: 'mcq', difficulty: 'beginner',
        prompt: 'Which component of Node.js actually compiles and executes your JavaScript?',
        options: ["libuv","npm","OpenSSL","V8"],
        answer: 3,
        explanation: "V8 parses, compiles and runs JS. libuv handles the event loop and I/O, but never executes JavaScript itself.",
      },
    ],
    interview: [
      {
        category: 'nodejs', kind: 'concept', difficulty: 'beginner', topic: 'Node.js basics',
        question: 'What is Node.js and what is it built on?',
        shortAnswer: 'Node.js is a cross-platform JavaScript runtime that runs JS outside the browser. It is built on the V8 engine for executing JavaScript and libuv for the event loop and asynchronous I/O.',
        detailedAnswer: [
          "V8 (C++) compiles JS to machine code and manages memory/GC.",
          "libuv (C) provides the event loop, non-blocking network I/O and a thread pool for file system and some crypto work.",
          "C++ bindings connect JS APIs like `fs` and `http` to libuv and libraries such as OpenSSL and zlib.",
          "The result is an event-driven, non-blocking model suited to I/O-heavy servers.",
        ],
        followUp: 'Is Node.js single-threaded?',
        trap: "Calling Node a framework or a language. Express is the framework; JavaScript is the language.",
      },
    ],
  },

  'why-node-js': {
    summary: 'Node.js is chosen for I/O-heavy, high-concurrency services, one language across the stack, a huge npm ecosystem and fast startup.',
    topics: ['I/O-bound workloads', 'concurrency', 'full-stack JavaScript', 'npm ecosystem', 'when not to use Node'],
    sections: [
      section('introduction', undefined,
        text("Plenty of languages can build a backend. Teams pick Node when their service mostly waits on I/O and when sharing JavaScript/TypeScript across frontend and backend saves real time."),
      ),
      section('definition', 'The core value proposition',
        bullets(
          "**Non-blocking I/O**: one process serves many concurrent connections without a thread per request.",
          "**One language**: JS/TS on client and server — shared types, validation schemas and developers.",
          "**Ecosystem**: npm is the largest package registry in the world.",
          "**Fast iteration**: quick startup, no compile step needed for JS, good for serverless and CLIs.",
        ),
      ),
      section('why', 'When Node is a strong choice',
        table('Fit by workload', ['Workload', 'Fit', 'Reason'], [
          ['REST/GraphQL APIs over a DB', 'Excellent', 'Mostly waiting on I/O'],
          ['Real-time (chat, notifications, WebSockets)', 'Excellent', 'Many long-lived idle connections are cheap'],
          ['API gateway / BFF / proxy', 'Excellent', 'Streams data between services'],
          ['CLIs and build tooling', 'Excellent', 'Fast start, npm distribution'],
          ['Video encoding, ML training, heavy math', 'Poor (on the main thread)', 'CPU-bound work blocks the event loop'],
        ]),
      ),
      section('internals', 'Why waiting is cheap in Node',
        text("In a thread-per-request server, a request waiting 50 ms on the DB still holds a thread (and its stack memory). In Node, the waiting request is just a callback registered with libuv — the main thread is free to serve others."),
        diagram('blocking-vs-nonblocking', 'Blocking waits sequentially; non-blocking overlaps many waits on one thread.'),
      ),
      section('example', 'Concurrency without threads',
        code({
          title: 'Three slow "queries" overlap',
          runnable: true,
          code: dedent(`
            const fakeQuery = (name, ms) =>
              new Promise((resolve) => setTimeout(() => resolve(name), ms));

            const start = Date.now();
            Promise.all([
              fakeQuery('users', 100),
              fakeQuery('orders', 100),
              fakeQuery('stock', 100),
            ]).then((results) => {
              const elapsed = Date.now() - start;
              console.log(results.join(', '));
              console.log(elapsed < 250 ? 'took ~100ms, not ~300ms' : 'ran sequentially');
            });
          `),
          expectedOutput: 'users, orders, stock\ntook ~100ms, not ~300ms',
          explanation: [
            "Each `fakeQuery` starts a timer and returns immediately — nothing blocks.",
            "All three waits overlap, so the total is about the longest wait (100 ms), not the sum.",
            "Real DB/HTTP calls behave the same way: Node starts them and gets notified on completion.",
          ],
        }),
      ),
      section('real-world', 'Real-world usage',
        bullets(
          "Backend-for-frontend layers that fan out to several microservices and merge JSON.",
          "Notification/WebSocket gateways holding tens of thousands of idle sockets per instance.",
          "Serverless functions where cold-start time matters.",
        ),
      ),
      section('mistakes', 'Common mistakes',
        bullets(
          "Choosing Node for CPU-heavy pipelines without planning for `worker_threads` or a separate service.",
          "Assuming 'non-blocking' makes slow code fast — it only stops *waiting* from blocking others.",
          "Picking Node only because 'everyone uses it' without checking the workload profile.",
        ),
      ),
      section('interview', 'Interview angle',
        interviewTip("Good answers are balanced: name the I/O-concurrency strength *and* the CPU-bound weakness, plus how you would mitigate it (worker threads, job queues, a service in another language)."),
      ),
      section('practice', 'Practice',
        text("Take a service you know (e.g. an e-commerce checkout). List its operations and mark each as I/O-bound or CPU-bound. Decide which parts suit Node and how you would offload the rest."),
      ),
      section('summary', 'Summary',
        bullets(
          "Node shines when work is mostly waiting on I/O.",
          "Shared language and npm speed up full-stack teams.",
          "CPU-heavy work needs offloading (worker threads, queues, other services).",
        ),
      ),
    ],
    revisionNotes: [
      "Best fit: I/O-bound, high-concurrency, real-time, BFF/gateway, CLIs.",
      "Weak fit: CPU-bound work on the main thread.",
      "Concurrency comes from non-blocking I/O, not from many threads.",
      "Mitigate CPU work with worker_threads, child processes or job queues.",
    ],
    quiz: [
      {
        kind: 'scenario', difficulty: 'beginner',
        prompt: 'Which service is the WEAKEST fit for running entirely on the Node.js main thread?',
        options: ['A chat server with 20,000 WebSocket connections', 'A REST API that reads and writes PostgreSQL', 'A service that transcodes 4K video frames in JavaScript', 'An API gateway that proxies requests to microservices'],
        answer: 2,
        explanation: "Video transcoding is CPU-bound and would block the event loop for every other request. The others are I/O-bound — exactly what Node is good at.",
      },
      {
        kind: 'mcq', difficulty: 'intermediate',
        prompt: 'Why can one Node process hold many idle WebSocket connections cheaply?',
        options: ['Each connection gets its own lightweight thread', 'An idle connection is just a registered socket watched by the OS, not a blocked thread', 'V8 compresses idle sockets in memory', 'npm installs a connection pool automatically'],
        answer: 1,
        explanation: "libuv registers sockets with the OS notification mechanism (epoll/kqueue/IOCP). No thread waits per connection — that is the key difference from thread-per-request servers.",
      },
    ],
    interview: [
      {
        category: 'nodejs', kind: 'concept', difficulty: 'beginner', topic: 'Why Node.js',
        question: 'Why is Node.js a good fit for I/O-heavy applications?',
        shortAnswer: 'Because I/O is non-blocking: Node starts an operation, registers a callback and keeps serving other work, so one thread can overlap thousands of waits.',
        detailedAnswer: [
          "Most backend time is spent waiting on databases, disks and other services.",
          "Node delegates the wait to the OS (sockets) or libuv's thread pool (files) and is notified on completion.",
          "No thread is parked per request, so memory per connection stays small.",
          "Result: high concurrency with modest hardware for I/O-bound workloads.",
        ],
        followUp: 'What happens if the work is CPU-bound instead?',
        trap: "Saying Node is 'faster' in general. It is efficient at waiting, not at raw computation.",
      },
      {
        category: 'nodejs', kind: 'scenario', difficulty: 'intermediate', topic: 'Why Node.js',
        question: 'When would you NOT choose Node.js for a backend service?',
        shortAnswer: 'When the core workload is CPU-bound (heavy computation, image/video processing, ML) and cannot be easily offloaded, or when the team needs strong multi-core parallelism inside one process.',
        detailedAnswer: [
          "CPU work on the main thread blocks every other request on that process.",
          "worker_threads help but add complexity (message passing, no shared closures).",
          "Languages with native threads/goroutines (Go, Java, Rust) handle in-process parallel CPU work more naturally.",
          "A hybrid is common: Node for the API, a separate service or queue worker for heavy jobs.",
        ],
        followUp: 'How would you keep a Node API responsive if it must resize images?',
        trap: "Answering 'never use Node for anything big' — large companies run Node at scale for I/O-heavy services.",
      },
    ],
  },

  'node-js-vs-browser-javascript': {
    summary: 'Same language, different hosts: browsers provide the DOM and Web APIs in a sandbox; Node provides OS access (fs, net, process) and a module system for servers.',
    topics: ['globalThis', 'window', 'process', 'DOM', 'Web APIs', 'CommonJS', 'ES modules', 'sandbox'],
    sections: [
      section('introduction', undefined,
        text("The JavaScript language (ECMAScript) is identical. What differs is the **host environment**: the objects and APIs available around the language."),
      ),
      section('definition', 'Host environments',
        bullets(
          "**ECMAScript** defines syntax, `Promise`, `Array`, `Map`, classes… — available in both.",
          "**Browser host** adds `window`, `document` (DOM), `localStorage`, `fetch`, user events.",
          "**Node host** adds `process`, `Buffer`, `require`, `fs`, `net`, `child_process`, `worker_threads`.",
        ),
      ),
      section('why', 'Why the difference matters',
        bullets(
          "Code that touches `document` crashes in Node with `ReferenceError: document is not defined`.",
          "Code that uses `fs` cannot run in a browser — browsers sandbox file access for security.",
          "Libraries meant for both (\"isomorphic\") must avoid host-specific APIs or feature-detect them.",
        ),
      ),
      section('internals', 'Side-by-side comparison',
        table('Browser vs Node.js', ['Aspect', 'Browser', 'Node.js'], [
          ['Global object', '`window` (also `globalThis`)', '`global` (also `globalThis`)'],
          ['DOM', 'Yes', 'No'],
          ['File system', 'No (sandboxed)', 'Yes — `fs`'],
          ['Modules', 'ES modules (`<script type="module">`)', 'CommonJS and ES modules'],
          ['Top-level `this` (script / CJS)', '`window`', '`module.exports` (`{}`)'],
          ['Security model', 'Sandboxed per origin', 'Full OS permissions of the user (opt-in permission model Node 20+)'],
          ['Event loop', 'HTML spec (tasks, rendering)', 'libuv phases + nextTick/microtasks'],
          ['Version control', 'Users pick the browser', 'You pick the Node version'],
          ['Shared Web APIs', '`fetch`, `URL`, `TextEncoder`, `AbortController`, `setTimeout`', 'Same APIs available (fetch global since Node 18)'],
        ]),
        note("Node has steadily adopted Web-standard APIs: `fetch`, `WebStreams`, `structuredClone`, `BroadcastChannel`, `Blob`, Web Crypto. Prefer them when you write code shared with the browser."),
      ),
      section('example', 'Detecting the environment',
        code({
          title: 'Feature detection',
          code: dedent(`
            const isNode = typeof process !== 'undefined' && !!process.versions?.node;
            const isBrowser = typeof window !== 'undefined' && typeof document !== 'undefined';

            console.log({ isNode, isBrowser });
            console.log(globalThis === global); // Node only
          `),
          expectedOutput: '{ isNode: true, isBrowser: false }\ntrue',
          explanation: [
            "`typeof` on an undeclared identifier returns `'undefined'` instead of throwing — safe for detection.",
            "`process.versions.node` exists only in Node.",
            "`globalThis` is the standard name for the global object in every environment; in Node it equals `global`.",
          ],
        }),
        code({
          title: 'Top-level this differs',
          code: dedent(`
            // file: this.cjs (CommonJS)
            console.log(this === module.exports);

            // file: this.mjs (ES module)
            console.log(this);
          `),
          expectedOutput: 'true\nundefined',
          explanation: [
            "In CommonJS, Node wraps your file in a function and calls it with `this = module.exports`.",
            "In ES modules, top-level `this` is `undefined` (both in Node and browsers).",
          ],
        }),
      ),
      section('real-world', 'Real-world usage',
        bullets(
          "Server-side rendering (Next.js, Remix) runs React in Node — components must not touch `window` during render.",
          "Shared validation libraries (e.g. Zod schemas) used on both client and API.",
          "Testing frontend code in Node with a fake DOM (jsdom) because Node has no real one.",
        ),
      ),
      section('mistakes', 'Common mistakes',
        bullets(
          "Using `window` in shared code — use `globalThis` instead.",
          "Assuming browser-style security: a Node script can delete any file the user can.",
          "Expecting the browser event loop's rendering steps or `requestAnimationFrame` in Node.",
        ),
      ),
      section('interview', 'Interview angle',
        interviewTip("Frame the answer as 'same language, different host APIs', then give 3–4 concrete differences (global object, DOM, file system, modules, security)."),
      ),
      section('practice', 'Practice',
        text("Write `env.js` that prints which environment it runs in using only `typeof` checks. Run it with Node and paste it into a browser console."),
      ),
      section('summary', 'Summary',
        bullets(
          "Language is shared; host APIs differ.",
          "Browser: DOM, sandbox, `window`. Node: `process`, `fs`, `global`.",
          "`globalThis` works everywhere.",
          "Node increasingly ships Web-standard APIs like `fetch`.",
        ),
      ),
    ],
    revisionNotes: [
      "`globalThis` = universal global (ES2020).",
      "Node has no DOM; browsers have no fs.",
      "CJS top-level `this` = `module.exports`; ESM top-level `this` = undefined.",
      "Global `fetch` stable in Node 21+, available (experimental flag-free) since Node 18.",
    ],
    quiz: [
      {
        kind: 'predict-output', difficulty: 'beginner',
        prompt: 'Run with `node app.js` (CommonJS). What prints?',
        code: "console.log(typeof window, typeof globalThis);",
        options: ["undefined object","object object","undefined undefined","ReferenceError"],
        answer: 0,
        explanation: "Node has no `window`, and `typeof` on an undeclared name returns 'undefined' rather than throwing. `globalThis` exists in every modern environment.",
      },
      {
        kind: 'find-bug', difficulty: 'intermediate',
        prompt: 'This helper is shared between a React app and a Node API. What breaks on the server?',
        code: "export function saveDraft(d) {\n  window.localStorage.setItem('draft', JSON.stringify(d));\n}",
        options: ["JSON.stringify is not available in Node","export syntax is browser-only","Nothing — Node polyfills localStorage","window and localStorage do not exist in Node, so it throws a ReferenceError"],
        answer: 3,
        explanation: "`window` is a browser global. Calling this in Node throws. Guard with `typeof window !== 'undefined'` or keep browser storage out of shared code.",
      },
    ],
    interview: [
      {
        category: 'nodejs', kind: 'concept', difficulty: 'beginner', topic: 'Node vs browser',
        question: 'What are the main differences between JavaScript running in Node.js and in a browser?',
        shortAnswer: 'The language is the same; the host APIs differ. Browsers expose the DOM and Web APIs inside a sandbox, while Node exposes OS-level APIs like fs, net and process, and supports CommonJS.',
        detailedAnswer: [
          "Global object: `window` vs `global` (both have `globalThis`).",
          "Browser has `document`/DOM; Node has none.",
          "Node can read/write files, spawn processes and open raw TCP sockets.",
          "Browser code is sandboxed per origin; Node runs with the user's OS permissions.",
          "You control the Node version; you do not control users' browsers.",
        ],
        followUp: 'How would you write a library that runs in both?',
        trap: "Saying Node uses a different language or that `fetch` is browser-only — Node 18+ has global `fetch`.",
      },
      {
        category: 'nodejs', kind: 'concept', difficulty: 'beginner', topic: 'Node vs browser',
        question: 'What is globalThis and why was it introduced?',
        shortAnswer: 'globalThis is the ES2020 standard reference to the global object in every JavaScript environment, replacing environment-specific names like window, self and global.',
        detailedAnswer: [
          "Browsers use `window` (main thread) or `self` (workers); Node uses `global`.",
          "Shared code previously needed fragile checks to find the global object.",
          "`globalThis` works identically in browsers, workers, Node, Deno and Bun.",
        ],
        followUp: 'What is the value of top-level this in a CommonJS module?',
        trap: "Thinking top-level `this` in a Node module is the global object — in CJS it is `module.exports`.",
      },
    ],
  },

  'node-js-vs-other-backend-technologies': {
    summary: 'Node uses one event-loop thread with non-blocking I/O; Java, .NET, Go, Python and PHP use other concurrency models, each with different strengths for CPU and I/O work.',
    topics: ['thread-per-request', 'event loop', 'goroutines', 'Java', 'Go', 'Python', 'PHP', 'Deno', 'Bun'],
    sections: [
      section('introduction', undefined,
        text("Choosing a backend stack is mostly about the **concurrency model**, the ecosystem and the team. Comparing Node to its alternatives makes Node's design trade-offs clear."),
      ),
      section('definition', 'Concurrency models in one line each',
        bullets(
          "**Node.js** — one JS thread + event loop; I/O delegated to the OS/libuv.",
          "**Classic Java/Spring MVC, .NET** — thread pool, often a thread per in-flight request (Java 21 virtual threads make threads cheap).",
          "**Go** — goroutines multiplexed onto OS threads by the Go scheduler; blocking-style code, parallel by default.",
          "**Python (Django/Flask)** — multiple worker processes (GIL limits threads); asyncio for event-loop style.",
          "**PHP-FPM** — a process per request from a pool, shared-nothing.",
        ),
      ),
      section('why', 'Why the model matters',
        bullets(
          "It decides how much memory each concurrent connection costs.",
          "It decides whether CPU-heavy code hurts other requests.",
          "It shapes the code style: callbacks/async-await vs blocking calls.",
        ),
      ),
      section('internals', 'Comparison table',
        table('Backend options', ['', 'Node.js', 'Java / .NET', 'Go', 'Python', 'PHP-FPM'], [
          ['Concurrency', 'Event loop, async I/O', 'Thread pool (or virtual threads)', 'Goroutines (M:N)', 'Processes / asyncio', 'Process per request'],
          ['CPU parallelism in one process', 'Only via worker_threads', 'Yes', 'Yes', 'Limited by GIL', 'No'],
          ['Cost of an idle connection', 'Very low', 'A thread (low with virtual threads)', 'A small goroutine stack', 'A process/worker or coroutine', 'A whole process'],
          ['Typing', 'Dynamic (TypeScript optional)', 'Static', 'Static', 'Dynamic (type hints)', 'Dynamic'],
          ['Strength', 'I/O concurrency, full-stack JS, npm', 'Enterprise tooling, performance', 'Simple concurrency, single binary', 'Data/ML ecosystem', 'Simple hosting, WordPress'],
        ]),
        flow(['Thread-per-request: request → dedicated thread → blocks on DB → reply', 'Node: request → callback registered → thread serves others → DB done → callback runs'], { title: 'Waiting on the database', direction: 'vertical' }),
        note("**Deno** and **Bun** are newer JavaScript runtimes. Deno (V8 + Rust, by Node's creator) focuses on security permissions and web standards; Bun (JavaScriptCore + Zig) focuses on speed and all-in-one tooling. Both aim for Node/npm compatibility."),
      ),
      section('example', 'The same endpoint, two styles',
        code({
          title: 'Node: non-blocking (async/await)',
          code: dedent(`
            import { createServer } from 'node:http';
            import { readFile } from 'node:fs/promises';

            createServer(async (req, res) => {
              const data = await readFile('./data.json', 'utf8'); // thread is NOT blocked here
              res.setHeader('content-type', 'application/json');
              res.end(data);
            }).listen(3000, () => console.log('listening on 3000'));
          `),
          expectedOutput: 'listening on 3000',
          explanation: [
            "`await` pauses only this handler; the event loop keeps serving other requests.",
            "In a thread-per-request server the equivalent blocking read would hold a whole thread while waiting.",
            "Go code looks blocking too, but the Go runtime parks the goroutine instead of the OS thread.",
          ],
        }),
      ),
      section('real-world', 'Real-world usage',
        bullets(
          "Polyglot systems are normal: Node for the API/BFF, Go or Java for high-throughput internal services, Python for ML.",
          "Teams already strong in TypeScript often choose Node (NestJS/Fastify) to share types with the frontend.",
        ),
      ),
      section('mistakes', 'Common mistakes',
        bullets(
          "Benchmark wars — 'X req/s hello world' says little about your DB-bound service.",
          "Claiming Node cannot use multiple cores — use `cluster`, multiple containers or `worker_threads`.",
          "Ignoring team expertise; it usually matters more than raw runtime speed.",
        ),
      ),
      section('interview', 'Interview angle',
        interviewTip("Avoid tribalism. Compare concurrency models and fit for workload, and mention that the bottleneck is usually the database, not the runtime."),
      ),
      section('practice', 'Practice',
        text("For a chat app, a payroll batch job and a recommendation engine, pick a stack for each and justify it in two sentences using concurrency model and ecosystem."),
      ),
      section('summary', 'Summary',
        bullets(
          "Node: cheap concurrency for I/O, weak for in-process CPU parallelism.",
          "Go/Java/.NET: real multi-core parallelism inside one process.",
          "Python: rich data ecosystem; PHP: simple shared-nothing hosting.",
          "Deno and Bun are alternative JS runtimes.",
        ),
      ),
    ],
    revisionNotes: [
      "Node = event loop + non-blocking I/O, one JS thread.",
      "Thread-per-request = one blocked thread per waiting request.",
      "Go = goroutines on an M:N scheduler.",
      "Scale Node across cores with cluster/containers; CPU work with worker_threads.",
    ],
    quiz: [
      {
        kind: 'mcq', difficulty: 'intermediate',
        prompt: 'In a classic thread-per-request server, what happens while a request waits 200 ms for a database?',
        options: ["The request is paused and its thread serves other requests","The database pushes the result into the event loop","Its thread is blocked and unavailable for other work","The JVM automatically converts the call to non-blocking"],
        answer: 2,
        explanation: "With blocking I/O the thread sits idle until the DB replies. Node instead registers a callback and keeps its single thread busy with other requests. (Java 21 virtual threads change this cost, but classic platform threads block.)",
      },
      {
        kind: 'mcq', difficulty: 'beginner',
        prompt: 'Which runtime is NOT built on the V8 engine?',
        options: ["Node.js","Bun","Deno","Chrome"],
        answer: 1,
        explanation: "Bun uses Apple's JavaScriptCore. Node, Deno and Chrome all use V8.",
      },
    ],
    interview: [
      {
        category: 'nodejs', kind: 'concept', difficulty: 'intermediate', topic: 'Concurrency models',
        question: "How does Node's concurrency model differ from a thread-per-request server?",
        shortAnswer: 'Thread-per-request servers dedicate a thread to each in-flight request, which blocks during I/O. Node runs all JS on one thread and uses non-blocking I/O, so waiting requests are just pending callbacks.',
        detailedAnswer: [
          "Threads cost memory (stacks) and context switches; thousands of blocked threads are expensive.",
          "Node registers I/O with the OS (epoll/kqueue/IOCP) or libuv's thread pool and continues.",
          "Node's idle connection cost is tiny, enabling high concurrency on one core.",
          "Trade-off: one long CPU task in Node blocks everyone; in a threaded server it blocks only its own thread.",
        ],
        followUp: 'How do you use all CPU cores with Node?',
        trap: "Saying Node handles requests 'in parallel' — it handles them concurrently on one JS thread.",
      },
      {
        category: 'nodejs', kind: 'concept', difficulty: 'beginner', topic: 'Concurrency models',
        question: 'Why might a team choose Go or Java over Node.js for a CPU-heavy service?',
        shortAnswer: 'Because Go and Java run code in parallel across all cores inside one process, while Node executes JavaScript on a single thread and needs worker threads or extra processes for parallel CPU work.',
        detailedAnswer: [
          "CPU-bound code in Node blocks the event loop and delays every other request.",
          "Go goroutines and Java threads are scheduled across cores by the runtime/OS.",
          "Static typing and ahead-of-time compilation can also help predictable performance.",
        ],
        followUp: 'What Node feature would you use if you had to do CPU work anyway?',
        trap: "Claiming Node is always slower — V8's JIT is fast; the issue is parallelism and blocking, not raw speed.",
      },
    ],
  },
};

export default content;
