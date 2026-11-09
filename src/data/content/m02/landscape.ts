import type { ModuleContent } from '../../../types';
import { bullets, code, dedent, flow, interviewTip, note, section, steps, table, text, warn } from '../helpers';

const content: Partial<ModuleContent> = {
  'history-and-evolution': {
    summary: 'Created by Ryan Dahl in 2009, Node went through npm (2010), the io.js fork (2014), the Node.js Foundation merge (2015) and now ships yearly even-numbered LTS releases under the OpenJS Foundation.',
    topics: ['Ryan Dahl', 'io.js', 'OpenJS Foundation', 'LTS', 'Current', 'release schedule', 'ES modules'],
    sections: [
      section('introduction', undefined,
        text("Knowing Node's history explains today's quirks — why CommonJS and ES modules coexist, and why only even-numbered versions are used in production."),
      ),
      section('definition', 'Timeline',
        table('Key milestones', ['Year', 'Event'], [
          ['2009', 'Ryan Dahl presents Node.js at JSConf EU: V8 + an event loop for non-blocking servers'],
          ['2010', 'npm created by Isaac Schlueter; Express released'],
          ['2011', 'Windows support via libuv (replacing libev/libeio)'],
          ['2014', 'io.js fork over governance and slow V8 upgrades'],
          ['2015', 'Node.js Foundation formed; io.js merges back as Node 4'],
          ['2017', 'Node 8: async/await, N-API'],
          ['2019', 'OpenJS Foundation formed (Node.js + JS Foundation)'],
          ['2020', 'ES modules unflagged (Node 12.17 / 14)'],
          ['2022–2024', 'Global fetch, built-in test runner, `--watch`, `--env-file`, permission model'],
        ]),
      ),
      section('why', 'Why the release schedule matters',
        bullets(
          "New **major** versions ship every April and October.",
          "**Even-numbered** majors (18, 20, 22, 24…) become **LTS** in October after release.",
          "**Odd-numbered** majors (19, 21, 23…) are Current-only and never get LTS — fine for experiments, not for production.",
        ),
      ),
      section('internals', 'Release lifecycle',
        flow(['Current: about 6 months of active feature work', 'Active LTS: about 12 months of bug and security fixes', 'Maintenance LTS: critical fixes until end of life', 'End-of-life: no more security patches'], { title: 'Lifecycle of an even-numbered major', direction: 'horizontal' }),
        table('LTS vs Current', ['', 'Current', 'LTS'], [
          ['Who it is for', 'Library authors, early adopters', 'Production applications'],
          ['Versions', 'Every new major for ~6 months', 'Even majors only'],
          ['Support length', 'Short', 'About 30 months total'],
        ]),
        note("LTS lines get codenames (Hydrogen = 18, Iron = 20, Jod = 22). Check nodejs.org/en/about/previous-releases for current end-of-life dates."),
      ),
      section('example', 'Checking your version',
        code({
          title: 'Inspect versions',
          language: 'bash',
          code: dedent(`
            node --version
            node -p "process.release.lts"
          `),
          expectedOutput: "v22.11.0\nJod",
          explanation: [
            "`node --version` prints the installed version.",
            "`process.release.lts` holds the LTS codename, or `undefined` on a Current release.",
          ],
        }),
      ),
      section('real-world', 'In practice',
        bullets(
          "Production teams upgrade from one LTS to the next, typically yearly.",
          "CI matrices test supported LTS lines (e.g. 20 and 22) for libraries.",
          "Running an end-of-life version means no security patches — a compliance finding in audits.",
        ),
      ),
      section('mistakes', 'Common mistakes',
        bullets(
          "Deploying an odd-numbered release to production.",
          "Staying on an EOL version because 'it still works'.",
        ),
      ),
      section('interview', 'Interview angle',
        interviewTip("Interviewers rarely want dates — they want you to know LTS vs Current and why the io.js split led to open governance."),
      ),
      section('practice', 'Practice',
        text("Look up which Node LTS lines are currently supported and which version your current project's Docker image uses."),
      ),
      section('summary', 'Summary',
        bullets(
          "2009 Ryan Dahl; 2010 npm; 2015 io.js merged; 2019 OpenJS Foundation.",
          "Even majors become LTS; odd majors never do.",
          "Use Active or Maintenance LTS in production.",
        ),
      ),
    ],
    revisionNotes: [
      "Even = LTS, odd = Current only.",
      "Majors released April and October; LTS promotion in October.",
      "io.js fork (2014) → merged as Node 4 (2015).",
      "`process.release.lts` shows the codename.",
    ],
    quiz: [
      {
        kind: 'mcq', difficulty: 'beginner',
        prompt: 'Which Node.js major version will NEVER become an LTS release?',
        options: ["23","22","20","24"],
        answer: 0,
        explanation: "Only even-numbered majors are promoted to LTS. 23 is odd, so it stays a short-lived Current release.",
      },
      {
        kind: 'scenario', difficulty: 'beginner',
        prompt: 'Your production API runs a Node version that reached end-of-life. What is the main risk?',
        options: ["It will stop running immediately","npm will refuse to install packages","V8 stops optimising code","It no longer receives security patches"],
        answer: 3,
        explanation: "EOL versions keep running, but newly discovered vulnerabilities are not fixed. Upgrade to a supported LTS.",
      },
    ],
    interview: [
      {
        category: 'nodejs', kind: 'concept', difficulty: 'beginner', topic: 'Release schedule',
        question: 'What is the difference between an LTS and a Current Node.js release?',
        shortAnswer: 'Current is the newest major with active feature work for about six months; LTS (even-numbered majors only) receives bug and security fixes for about 30 months and is intended for production.',
        detailedAnswer: [
          "New majors ship in April and October.",
          "Even majors move to Active LTS in October, then Maintenance LTS, then EOL.",
          "Odd majors are never LTS.",
          "Production should run Active or Maintenance LTS.",
        ],
        followUp: 'How do you make sure everyone on a team uses the same Node version?',
        trap: "Thinking 'latest' is the best choice for production.",
      },
      {
        category: 'nodejs', kind: 'concept', difficulty: 'beginner', topic: 'History',
        question: 'What was io.js and why does it matter to Node.js today?',
        shortAnswer: 'io.js was a 2014 community fork of Node created over slow releases and corporate governance; it merged back in 2015 under the Node.js Foundation, giving Node open governance and a regular release cadence.',
        detailedAnswer: [
          "Contributors wanted faster V8 upgrades and modern JS features.",
          "The fork shipped quickly and gained momentum.",
          "Merge produced Node 4 and a foundation-based, open governance model.",
          "Today's predictable LTS schedule traces back to that reunion.",
        ],
        trap: "Confusing io.js with Deno — Deno is a separate runtime created later (2018) by Ryan Dahl.",
      },
    ],
  },

  'node-js-use-cases': {
    summary: 'Node.js is used for APIs, real-time services, BFFs and gateways, streaming, serverless functions, CLIs and frontend tooling — anywhere work is mostly I/O.',
    topics: ['REST API', 'real-time', 'WebSockets', 'BFF', 'serverless', 'CLI tools', 'streaming', 'microservices'],
    sections: [
      section('introduction', undefined,
        text("Node's sweet spot is coordinating I/O: accepting requests, calling databases and other services, and streaming data back."),
      ),
      section('definition', 'Main use cases',
        table('Use case → why Node fits', ['Use case', 'Why it fits', 'Typical tools'], [
          ['REST / GraphQL APIs', 'DB-bound handlers, JSON native', 'Express, Fastify, NestJS, Apollo'],
          ['Real-time apps', 'Cheap long-lived connections', 'ws, Socket.IO'],
          ['BFF / API gateway', 'Fan-out to services, merge JSON', 'Fastify, http-proxy'],
          ['Streaming / file uploads', 'Streams with backpressure', '`node:stream`, busboy'],
          ['Serverless', 'Fast cold start', 'AWS Lambda, Vercel, Cloudflare (workers runtime)'],
          ['CLIs and dev tooling', 'npm distribution, cross-platform', 'commander, Vite, ESLint'],
          ['Background workers', 'Queue consumers doing I/O', 'BullMQ, Kafka clients'],
          ['SSR web apps', 'Run React/Vue on the server', 'Next.js, Nuxt, Remix'],
        ]),
      ),
      section('why', 'Where Node is not the first choice',
        bullets(
          "Heavy numeric computing / ML training (Python ecosystem dominates).",
          "Long CPU-bound batch processing — possible with worker threads, but other runtimes are simpler.",
          "Very low-latency systems needing manual memory control (C++, Rust).",
        ),
      ),
      section('internals', 'A typical Node service',
        flow(['Client: HTTP / WebSocket', 'Node API: validate, authorise', 'Fan-out: DB + cache + other services (concurrently)', 'Node API: merge and respond', 'Queue: heavy job sent to a worker'], { title: 'I/O orchestration', direction: 'horizontal' }),
      ),
      section('example', 'A tiny CLI tool',
        code({
          title: 'count-lines.js — CLI that streams a file',
          code: dedent(`
            #!/usr/bin/env node
            import { createReadStream } from 'node:fs';
            import { createInterface } from 'node:readline';

            const file = process.argv[2];
            const rl = createInterface({ input: createReadStream(file) });
            let lines = 0;
            rl.on('line', () => lines++);
            rl.on('close', () => console.log(file + ': ' + lines + ' lines'));
          `),
          expectedOutput: 'server.log: 120394 lines',
          explanation: [
            "`process.argv[2]` is the first user argument (`node count-lines.js server.log`).",
            "The file is streamed line by line — memory stays flat even for multi-GB logs.",
            "The shebang line lets it run directly as `./count-lines.js` once executable, or via a `bin` entry in package.json.",
          ],
        }),
      ),
      section('real-world', 'Scenario: image processing API',
        bullets(
          "The API accepts the upload and streams it to object storage (I/O — great in Node).",
          "It enqueues a resize job (BullMQ/SQS) and replies `202 Accepted`.",
          "A worker process (Node with `sharp`, which uses native threads, or another language) does the CPU work.",
        ),
      ),
      section('mistakes', 'Common mistakes',
        bullets(
          "Doing CPU-heavy work inside request handlers.",
          "Loading whole large files into memory instead of streaming.",
        ),
      ),
      section('interview', 'Interview angle',
        interviewTip("Give use cases *with the reason*: 'real-time chat because idle sockets are cheap', not just a list."),
      ),
      section('practice', 'Practice',
        text("Pick three apps you use daily and guess which parts could run on Node and which would be better elsewhere."),
      ),
      section('summary', 'Summary',
        bullets(
          "APIs, real-time, BFF/gateways, streaming, serverless, CLIs, SSR.",
          "Common pattern: Node for I/O orchestration, offload CPU jobs.",
        ),
      ),
    ],
    revisionNotes: [
      "Use Node for I/O-bound, high-concurrency work.",
      "Offload CPU jobs to queues/workers.",
      "Stream large data instead of buffering.",
      "Frontend tooling (Vite, ESLint, tsc) all run on Node.",
    ],
    quiz: [
      {
        kind: 'scenario', difficulty: 'intermediate',
        prompt: 'Your Node API must generate PDF reports that take ~3 s of CPU each. What is the best design?',
        options: ['Generate the PDF in the request handler and await it', 'Wrap the generation in a Promise so it becomes non-blocking', 'Enqueue a job, reply 202, and have a worker process generate it', 'Increase UV_THREADPOOL_SIZE to 64'],
        answer: 2,
        explanation: "Wrapping CPU work in a Promise does NOT move it off the main thread. A queue + worker keeps the API responsive. UV_THREADPOOL_SIZE only affects libuv's own tasks (fs, crypto, zlib, dns.lookup), not your JS.",
      },
      {
        kind: 'mcq', difficulty: 'beginner',
        prompt: 'Why is Node popular for real-time chat servers?',
        options: ['It has a built-in chat protocol', 'Many idle long-lived connections cost very little', 'It runs each socket on its own CPU core', 'It disables garbage collection for sockets'],
        answer: 1,
        explanation: "Idle sockets are just OS handles watched by the event loop — no thread per connection.",
      },
    ],
    interview: [
      {
        category: 'nodejs', kind: 'concept', difficulty: 'beginner', topic: 'Use cases',
        question: 'What kinds of applications is Node.js commonly used for?',
        shortAnswer: 'I/O-heavy services: REST/GraphQL APIs, real-time apps with WebSockets, API gateways and BFFs, streaming, serverless functions, CLIs and frontend build tooling.',
        detailedAnswer: [
          "APIs: handlers mostly wait on databases.",
          "Real-time: thousands of idle connections per process.",
          "Gateways/BFFs: fan out to services concurrently.",
          "Tooling: npm distribution makes CLIs easy to ship.",
        ],
        followUp: 'Which workloads would you avoid putting in Node?',
      },
      {
        category: 'nodejs', kind: 'scenario', difficulty: 'intermediate', topic: 'Use cases',
        question: 'You need an image-resizing feature in a Node API. How do you keep the API responsive?',
        shortAnswer: 'Keep the request path I/O-only: accept and store the upload, enqueue a resize job and return quickly; process it in a separate worker (or use a native library that works off the main thread).',
        detailedAnswer: [
          "Pure-JS resizing on the main thread would block all requests.",
          "Libraries like `sharp` run work in native threads, but heavy volume still belongs in workers.",
          "Use a job queue (BullMQ, SQS) for retries and back-pressure.",
          "Notify the client via polling, webhooks or WebSockets when done.",
        ],
        trap: "Saying 'just make it async' — async syntax does not move CPU work off the event loop.",
      },
    ],
  },

  'advantages-and-limitations': {
    summary: 'Node offers cheap I/O concurrency, one language across the stack, a vast ecosystem and fast startup; its limits are CPU-bound work on the main thread, callback/async complexity and dependency risk.',
    topics: ['advantages', 'limitations', 'CPU-bound', 'event loop blocking', 'npm supply chain', 'worker_threads'],
    sections: [
      section('introduction', undefined,
        text("Every runtime trades something. Knowing Node's limits — and their mitigations — is what separates a senior answer from a fan answer."),
      ),
      section('definition', 'Advantages vs limitations',
        table('Trade-offs', ['Advantage', 'Matching limitation', 'Mitigation'], [
          ['Non-blocking I/O, high concurrency', 'One JS thread: CPU work blocks everyone', 'worker_threads, job queues, separate services'],
          ['Same language front and back', 'Dynamic typing errors at runtime', 'TypeScript, schema validation'],
          ['Huge npm ecosystem', 'Supply-chain and quality risk', 'Lockfiles, `npm audit`, careful selection'],
          ['Fast startup, small footprint', 'Single process uses one core', 'cluster, multiple containers, load balancer'],
          ['V8 JIT is fast', 'GC pauses, memory limits per heap', '`--max-old-space-size`, streaming, profiling'],
        ]),
      ),
      section('why', 'Why the limitation exists',
        text("Your JavaScript runs on one thread, and the event loop can only dispatch the next callback after the current one returns. A 2-second loop is 2 seconds of total unavailability for that process."),
      ),
      section('internals', 'Blocking in action',
        steps(
          "Request A arrives and its handler starts a CPU-heavy loop.",
          "Request B's socket becomes readable — libuv notices, but cannot run B's callback.",
          "Timers due during the loop are late; health checks may fail.",
          "When A finishes, queued callbacks run in a burst.",
        ),
      ),
      section('example', 'A busy loop delays a timer',
        code({
          title: 'CPU work blocks callbacks',
          runnable: true,
          code: dedent(`
            const start = Date.now();
            setTimeout(() => {
              const late = Date.now() - start;
              console.log('timer fired', late >= 200 ? 'late (>=200ms)' : 'on time');
            }, 10);

            // Simulate CPU-heavy work for ~200ms
            while (Date.now() - start < 200) {}
            console.log('busy loop done');
          `),
          expectedOutput: 'busy loop done\ntimer fired late (>=200ms)',
          explanation: [
            "The timer is due after 10 ms, but the thread is stuck in the `while` loop.",
            "Callbacks cannot interrupt running synchronous code.",
            "Only after the loop ends does the event loop run the overdue timer.",
          ],
        }),
      ),
      section('real-world', 'Real-world impact',
        bullets(
          "A big `JSON.parse` of a 200 MB payload freezes an API for hundreds of ms.",
          "A catastrophic regular expression (ReDoS) on user input can stall a server.",
          "Mitigations: input size limits, streaming parsers, worker threads, monitoring event-loop lag (`perf_hooks.monitorEventLoopDelay`).",
        ),
      ),
      section('mistakes', 'Common mistakes',
        bullets(
          "Believing `async function` makes CPU work non-blocking.",
          "Installing many tiny packages without review — each is a supply-chain risk.",
          "Running one Node process on a 16-core box and wondering why CPU is at 6%.",
        ),
        warn("Unhandled promise rejections crash the process by default since Node 15. Always handle errors."),
      ),
      section('interview', 'Interview angle',
        interviewTip("Pair every limitation with a mitigation. That shows you have run Node in production rather than read a list."),
      ),
      section('practice', 'Practice',
        text("Write a small HTTP server with a `/slow` route that busy-waits 3 s and a `/fast` route. Hit `/slow` then `/fast` in two terminals and observe `/fast` waiting."),
      ),
      section('summary', 'Summary',
        bullets(
          "Strengths: I/O concurrency, one language, ecosystem, startup.",
          "Weakness: CPU-bound work on the main thread blocks all requests.",
          "Mitigate with workers, queues, clustering and TypeScript.",
        ),
      ),
    ],
    revisionNotes: [
      "Blocking the event loop = blocking every request.",
      "async/await does not offload CPU work.",
      "Use cluster/containers for multi-core; worker_threads for CPU tasks.",
      "Unhandled rejections crash by default since Node 15.",
    ],
    quiz: [
      {
        kind: 'predict-output', difficulty: 'intermediate',
        prompt: 'What is printed first?',
        code: "setTimeout(() => console.log('timeout'), 0);\nfor (let i = 0; i < 1e8; i++) {}\nconsole.log('loop done');",
        options: ["loop done","timeout","It depends on CPU speed","Nothing — the loop throws"],
        answer: 0,
        explanation: "Synchronous code always finishes before any timer callback can run, regardless of how long it takes.",
      },
      {
        kind: 'find-bug', difficulty: 'intermediate',
        prompt: 'A developer says this is non-blocking. What is wrong?',
        code: "app.get('/hash', async (req, res) => {\n  const result = await new Promise((resolve) => {\n    resolve(slowHashInPureJs(req.query.input)); // ~2s CPU\n  });\n  res.send(result);\n});",
        options: ["await cannot be used in Express handlers","res.send must be awaited","resolve must be called inside setTimeout","The Promise executor runs synchronously, so the 2 s of CPU still blocks the event loop"],
        answer: 3,
        explanation: "A Promise executor runs immediately on the current thread. Wrapping CPU work in a Promise changes nothing; move it to a worker thread or use a native async API.",
      },
    ],
    interview: [
      {
        category: 'nodejs', kind: 'concept', difficulty: 'beginner', topic: 'Advantages and limitations',
        question: 'What are the main advantages of Node.js?',
        shortAnswer: 'Efficient non-blocking I/O for high concurrency, one language (JS/TS) across frontend and backend, the npm ecosystem, and fast startup with a small footprint.',
        detailedAnswer: [
          "Event loop + async I/O handles many connections per process.",
          "Shared code and types between client and server.",
          "npm offers packages for almost anything.",
          "Quick startup suits serverless and CLIs.",
        ],
        followUp: 'And its biggest limitation?',
      },
      {
        category: 'nodejs', kind: 'scenario', difficulty: 'intermediate', topic: 'Event loop blocking',
        question: 'What happens to all other requests if one request handler runs a 2-second synchronous loop?',
        shortAnswer: 'They all wait. The event loop cannot run any other callback until the loop finishes, so every request on that process is delayed by up to 2 seconds.',
        detailedAnswer: [
          "JavaScript execution is single-threaded; callbacks run to completion.",
          "Incoming connections are accepted by the OS but their handlers are not run.",
          "Timers and health checks fire late; load balancers may mark the instance unhealthy.",
          "Fix: move the work to worker_threads, a child process or a queue worker.",
        ],
        followUp: 'How would you detect event-loop blocking in production?',
        trap: "Thinking other requests run on other threads meanwhile — they do not.",
      },
    ],
  },
};

export default content;
