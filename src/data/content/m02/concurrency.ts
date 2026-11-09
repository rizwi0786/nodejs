import type { ModuleContent } from '../../../types';
import { bullets, code, dedent, diagram, flow, interviewTip, note, section, steps, table, text, warn } from '../helpers';

const content: Partial<ModuleContent> = {
  'single-threaded-architecture': {
    summary: 'Node runs all your JavaScript on one main thread with one call stack and one event loop; I/O, GC and some crypto run on other threads, and you add parallelism with worker_threads, child processes or cluster.',
    topics: ['single-threaded', 'main thread', 'call stack', 'run-to-completion', 'concurrency vs parallelism', 'worker_threads', 'cluster'],
    sections: [
      section('introduction', undefined,
        text("'Node is single-threaded' is half true. Your JavaScript runs on one thread — but the process uses several. Getting this nuance right is a core interview skill."),
      ),
      section('definition', 'What exactly is single-threaded',
        bullets(
          "**One main thread** executes all JavaScript callbacks, with one call stack and one V8 isolate.",
          "**Run-to-completion**: a callback is never interrupted by another JS callback.",
          "**Not single-threaded overall**: libuv's pool (default 4), V8 GC/compiler threads and internal threads run alongside.",
        ),
        table('Concurrency vs parallelism', ['', 'Concurrency', 'Parallelism'], [
          ['Meaning', 'Many tasks in progress, interleaved', 'Many tasks executing at the same instant'],
          ['In Node', 'Event loop interleaves thousands of requests', 'Thread pool, worker_threads, cluster, child processes'],
          ['Your JS on main thread', 'Yes', 'No'],
        ]),
      ),
      section('why', 'Why single-threaded JS',
        bullets(
          "No locks, mutexes or data races in ordinary code — shared state is safe between callbacks.",
          "Low memory per connection: no thread stack per request.",
          "Simpler mental model; the cost is that one slow callback stalls everything.",
        ),
      ),
      section('internals', 'How one thread serves many clients',
        steps(
          "Request A's handler runs, starts a DB query, and returns — the query is now pending in the OS/driver.",
          "The event loop picks up Request B's data and runs its handler.",
          "A's DB response arrives; its callback is queued and runs when the stack is empty.",
          "Every handler holds the thread only for its CPU time, not its waiting time.",
        ),
        diagram('node-architecture', 'One JS thread on top; libuv and the OS do the waiting.'),
        table('Ways to use more cores', ['Tool', 'What it creates', 'Memory sharing', 'Use for'], [
          ['`worker_threads`', 'Threads with separate V8 isolates in the same process', '`SharedArrayBuffer`, transfer of ArrayBuffers', 'CPU-heavy tasks'],
          ['`child_process`', 'Separate OS processes', 'None (IPC/pipes)', 'Running other programs, isolation'],
          ['`cluster`', 'Multiple Node processes sharing a port', 'None', 'Scaling an HTTP server across cores'],
          ['Containers / PM2', 'Many instances behind a load balancer', 'None', 'Production horizontal scaling'],
        ]),
      ),
      section('example', 'No data races between callbacks',
        code({
          title: 'Shared counter is safe',
          runnable: true,
          code: dedent(`
            let counter = 0;
            const increment = () =>
              new Promise((resolve) => setTimeout(() => { counter++; resolve(); }, 0));

            Promise.all(Array.from({ length: 1000 }, increment)).then(() => {
              console.log('counter =', counter);
            });
          `),
          expectedOutput: 'counter = 1000',
          explanation: [
            "1000 callbacks modify the same variable, yet the result is always exactly 1000.",
            "Each `counter++` runs to completion on the single JS thread — no two callbacks overlap.",
            "In a multi-threaded language this would need a lock or an atomic.",
          ],
        }),
        code({
          title: 'Proof that other threads exist',
          code: dedent(`
            // Linux: count OS threads of the current process
            const fs = require('node:fs');
            const status = fs.readFileSync('/proc/self/status', 'utf8');
            console.log(status.match(/Threads:\\s+(\\d+)/)[1]);
          `),
          expectedOutput: '7',
          explanation: [
            "Even an idle Node process has several threads (V8 platform workers, signal/inspector threads).",
            "After the first fs/crypto async call, the 4 libuv pool threads add to the count.",
            "Exact number varies by version and platform.",
          ],
        }),
      ),
      section('real-world', 'Production implications',
        bullets(
          "Run one Node process per core (cluster, PM2 or multiple containers) to use the whole machine.",
          "Monitor event-loop delay; p99 latency spikes often mean a blocking callback.",
          "Move image processing, PDF generation, large JSON transforms to worker threads or a queue.",
        ),
      ),
      section('mistakes', 'Common mistakes',
        bullets(
          "Saying 'Node is single-threaded so it cannot do parallel work'.",
          "Assuming async code is free from logical races — interleaving across `await` points can still cause check-then-act bugs.",
          "Spawning a worker per request — workers are heavy; use a pool (e.g. Piscina).",
        ),
        warn("Race conditions still exist *across* awaits: `if (!(await exists(id))) await create(id)` can create duplicates under concurrent requests. Use DB constraints or transactions."),
      ),
      section('interview', 'Interview angle',
        interviewTip("Best phrasing: 'JavaScript execution is single-threaded; Node itself is multi-threaded.' Then explain concurrency vs parallelism and how to get parallelism."),
      ),
      section('practice', 'Practice',
        text("Create a worker with `worker_threads` that computes the 40th Fibonacci number while the main thread logs a tick every 100 ms. Compare with computing it on the main thread."),
      ),
      section('summary', 'Summary',
        bullets(
          "One thread runs all JS; callbacks run to completion.",
          "Node has other threads for I/O, GC and compilation.",
          "Concurrency via event loop; parallelism via workers/processes.",
          "Blocking the main thread blocks everything.",
        ),
      ),
    ],
    revisionNotes: [
      "JS execution: single thread, one call stack.",
      "Process: multi-threaded (libuv pool, V8 helpers).",
      "No data races between callbacks; logical races across awaits still possible.",
      "worker_threads = CPU parallelism; cluster = multi-core HTTP.",
    ],
    quiz: [
      {
        kind: 'mcq', difficulty: 'beginner',
        prompt: 'Which statement about Node.js threading is accurate?',
        options: ["Node.js uses exactly one OS thread","JavaScript runs on one main thread, but Node uses additional threads internally","Each HTTP request runs on its own thread","Node runs JavaScript on all CPU cores automatically"],
        answer: 1,
        explanation: "JS is single-threaded; libuv's pool and V8's helpers are other threads. Requests do not get their own threads, and multi-core use requires cluster or workers.",
      },
      {
        kind: 'scenario', difficulty: 'intermediate',
        prompt: 'Your 8-core server runs a single Node process at 100% of one core while the others idle. What is the best first step to use all cores for HTTP traffic?',
        options: ["Run 8 instances with cluster/PM2 or containers behind a load balancer","Raise UV_THREADPOOL_SIZE to 8","Convert all handlers to async functions","Increase --max-old-space-size"],
        answer: 0,
        explanation: "Your JS executes on one thread per process. Multiple processes are the standard way to use all cores. The thread pool does not run your JS.",
      },
    ],
    interview: [
      {
        category: 'nodejs', kind: 'concept', difficulty: 'beginner', topic: 'Threading',
        question: 'Is Node.js single-threaded?',
        shortAnswer: 'JavaScript execution in Node is single-threaded — one main thread runs all callbacks — but the Node process is multi-threaded: libuv’s thread pool, V8’s GC and compiler threads run alongside.',
        detailedAnswer: [
          "One call stack, one event loop per main thread.",
          "libuv pool (default 4) handles fs, dns.lookup, crypto, zlib.",
          "V8 uses background threads for GC and compilation.",
          "worker_threads let you run JS on extra threads explicitly.",
        ],
        followUp: 'How does it handle thousands of concurrent requests then?',
        trap: "Answering a flat 'yes' or 'no' without the nuance.",
      },
      {
        category: 'nodejs', kind: 'concept', difficulty: 'intermediate', topic: 'Threading',
        question: 'How can a single-threaded Node process handle thousands of concurrent connections?',
        shortAnswer: 'Because each request holds the thread only while its JavaScript runs; while waiting on I/O it is just a registered callback, and libuv uses the OS (epoll/kqueue/IOCP) to watch all sockets and wake the loop when data is ready.',
        detailedAnswer: [
          "Concurrency comes from interleaving, not parallel execution.",
          "Idle sockets cost a file descriptor and some memory, not a thread.",
          "Handlers must be short; CPU time per request bounds throughput.",
          "Scale across cores with multiple processes.",
        ],
        followUp: 'What breaks this model?',
      },
      {
        category: 'nodejs', kind: 'output', difficulty: 'advanced', topic: 'Threading',
        question: 'With the default thread pool, you start 8 async crypto.pbkdf2 calls and 1 HTTP request at the same time. How do their completion times behave?',
        shortAnswer: 'The hashes complete in two waves of four because only four pool threads exist; the HTTP request is unaffected by the pool because sockets use OS async I/O — though its DNS lookup via dns.lookup would queue behind the hashes.',
        detailedAnswer: [
          "Pool size 4 → hashes 1–4 run in parallel, 5–8 wait.",
          "Socket reads/writes use epoll/kqueue/IOCP, not pool threads.",
          "`http.get('https://host')` resolves the hostname with `dns.lookup` by default — that DOES use the pool.",
          "Using an IP address, a cached lookup or a custom `lookup` avoids that contention.",
          "Raising UV_THREADPOOL_SIZE changes the wave size.",
        ],
        trap: "Forgetting that hostname resolution goes through the pool.",
      },
    ],
  },

  'non-blocking-i-o': {
    summary: 'Non-blocking I/O means Node starts an I/O operation and continues immediately; the result arrives later via callback, promise or event, so the thread never sits idle waiting.',
    topics: ['blocking', 'non-blocking', 'asynchronous I/O', 'readFileSync', 'fs/promises', 'callbacks', 'promises', 'epoll'],
    sections: [
      section('introduction', undefined,
        text("Reading a file or querying a database takes milliseconds — millions of CPU cycles. Non-blocking I/O lets Node use those cycles for other work instead of waiting."),
      ),
      section('definition', 'Blocking vs non-blocking',
        table('Blocking vs non-blocking', ['', 'Blocking', 'Non-blocking'], [
          ['Call returns', 'After the operation completes', 'Immediately'],
          ['Result delivered', 'As the return value', 'Later: callback / promise / event'],
          ['Thread while waiting', 'Idle, cannot run other JS', 'Free to run other callbacks'],
          ['Node example', '`fs.readFileSync`', '`fs.promises.readFile`, `fs.readFile`'],
          ['Use when', 'Startup, CLIs, scripts', 'Servers, anything concurrent'],
        ]),
        note("Strictly, *non-blocking* describes the call (it does not wait) and *asynchronous* describes how you get the result (notification later). In Node they go together."),
      ),
      section('why', 'Why it matters for servers',
        text("If a handler blocks for 20 ms on a sync file read, a single process can serve at most 50 such requests per second. With non-blocking reads, the waits overlap and throughput is limited by CPU and the disk, not by waiting."),
      ),
      section('internals', 'How Node achieves it',
        diagram('blocking-vs-nonblocking', 'Blocking serialises waits; non-blocking overlaps them.'),
        flow(['JS calls fs.promises.readFile → returns a pending Promise', 'libuv submits the work to a pool thread', 'Main thread runs other callbacks', 'Pool thread finishes; completion queued', 'Poll phase: Promise resolves, await continues'], { title: 'Non-blocking file read', direction: 'vertical' }),
        bullets(
          "Sockets: set to non-blocking mode; libuv waits for readiness with epoll/kqueue or completion with IOCP.",
          "Files, `dns.lookup`, some crypto: blocking syscalls moved to the thread pool so the main thread never blocks.",
          "Either way, the JS callback always runs on the main thread.",
        ),
      ),
      section('example', 'Sync vs async in Node',
        code({
          title: 'Order of execution',
          code: dedent(`
            const fs = require('node:fs');
            const { readFile } = require('node:fs/promises');

            console.log('1: start');
            const cfg = fs.readFileSync('config.json', 'utf8'); // blocks
            console.log('2: sync read done,', cfg.length, 'chars');

            readFile('config.json', 'utf8').then((data) => {
              console.log('4: async read done,', data.length, 'chars');
            });
            console.log('3: async read started, not finished yet');
          `),
          expectedOutput: '1: start\n2: sync read done, 42 chars\n3: async read started, not finished yet\n4: async read done, 42 chars',
          explanation: [
            "`readFileSync` returns only after the read — line 2 waits for it.",
            "`readFile` from `fs/promises` returns a pending promise instantly, so line 3 prints before the data arrives.",
            "The `.then` callback runs in a later loop iteration once the pool thread finishes.",
          ],
        }),
        code({
          title: 'Simulated: waits overlap',
          runnable: true,
          code: dedent(`
            function blockingWait(ms) {
              const end = Date.now() + ms;
              while (Date.now() < end) {} // holds the thread
            }
            const nonBlockingWait = (ms) => new Promise((r) => setTimeout(r, ms));

            let t = Date.now();
            blockingWait(50);
            blockingWait(50);
            console.log('blocking total >= 100ms:', Date.now() - t >= 100);

            t = Date.now();
            Promise.all([nonBlockingWait(50), nonBlockingWait(50)]).then(() => {
              console.log('non-blocking total < 90ms:', Date.now() - t < 90);
            });
          `),
          expectedOutput: 'blocking total >= 100ms: true\nnon-blocking total < 90ms: true',
          explanation: [
            "Two blocking waits run back to back: ~100 ms.",
            "Two non-blocking waits overlap: ~50 ms total.",
            "Real I/O behaves like the non-blocking version when you use async APIs.",
          ],
        }),
      ),
      section('real-world', 'Real-world usage',
        bullets(
          "Request handlers: always `await` async DB/file/HTTP calls.",
          "Startup: `readFileSync` for config or certificates is fine — nothing else is waiting yet.",
          "Large files: use streams (`fs.createReadStream` + `pipeline`) to keep memory flat.",
        ),
      ),
      section('mistakes', 'Common mistakes',
        bullets(
          "Using `*Sync` APIs inside request handlers.",
          "Forgetting `await` and using a pending Promise as if it were data.",
          "Thinking non-blocking makes CPU work non-blocking — it applies to I/O only.",
        ),
        code({
          title: 'Wrong vs right in a handler',
          code: dedent(`
            // Wrong: blocks every other request during the read
            app.get('/report', (req, res) => {
              res.send(fs.readFileSync('./big-report.csv'));
            });

            // Right: non-blocking, streams the file
            const { pipeline } = require('node:stream/promises');
            app.get('/report', async (req, res, next) => {
              try {
                await pipeline(fs.createReadStream('./big-report.csv'), res);
              } catch (err) { next(err); }
            });
          `),
          explanation: [
            "The sync version freezes the event loop for the duration of the read.",
            "The stream version reads in chunks and respects backpressure (Express is a third-party framework; `pipeline` is Node core).",
          ],
        }),
      ),
      section('interview', 'Interview angle',
        interviewTip("Explain *who* does the waiting: the OS for sockets, the libuv pool for files. The main thread only runs callbacks."),
      ),
      section('practice', 'Practice',
        text("Write a server with two routes that read the same 50 MB file — one with `readFileSync`, one with a stream. Load-test both with `autocannon` and compare latency."),
      ),
      section('summary', 'Summary',
        bullets(
          "Non-blocking call returns immediately; result comes later.",
          "Sockets use OS async; files use the thread pool.",
          "Sync APIs are OK at startup and in scripts, not in handlers.",
          "Callbacks always run on the main thread.",
        ),
      ),
    ],
    revisionNotes: [
      "Blocking = waits; non-blocking = returns immediately.",
      "*Sync APIs block the event loop.",
      "Use fs/promises or streams in servers.",
      "Non-blocking I/O does not help CPU-bound code.",
    ],
    quiz: [
      {
        kind: 'predict-output', difficulty: 'beginner',
        prompt: 'What is the output order?',
        code: "const { readFile } = require('node:fs/promises');\nconsole.log('A');\nreadFile(__filename).then(() => console.log('B'));\nconsole.log('C');",
        options: ["A B C","C A B","B A C","A C B"],
        answer: 3,
        explanation: "readFile returns a pending promise immediately; synchronous logs A and C finish first, then B when the read completes.",
      },
      {
        kind: 'complete-code', difficulty: 'intermediate',
        prompt: 'Fill the blank so the handler does not block the event loop.',
        code: "app.get('/data', async (req, res) => {\n  const text = /* ??? */;\n  res.json(JSON.parse(text));\n});",
        options: ["fs.readFileSync('data.json', 'utf8')","fs.readFile('data.json', 'utf8')","await fs.promises.readFile('data.json', 'utf8')","await fs.readFileSync('data.json', 'utf8')"],
        answer: 2,
        explanation: "fs.promises.readFile is non-blocking and awaitable. Callback-style fs.readFile without a callback returns undefined (and throws for a missing callback); awaiting a sync call still blocks.",
      },
    ],
    interview: [
      {
        category: 'nodejs', kind: 'concept', difficulty: 'beginner', topic: 'Non-blocking I/O',
        question: 'What is the difference between blocking and non-blocking I/O?',
        shortAnswer: 'A blocking call waits until the operation completes before returning; a non-blocking call returns immediately and delivers the result later, so the thread can do other work meanwhile.',
        detailedAnswer: [
          "Blocking: `fs.readFileSync` — returns data, thread idle while waiting.",
          "Non-blocking: `fs.promises.readFile` — returns a promise right away.",
          "Node uses non-blocking I/O by default for scalability.",
          "The result is delivered via callback, promise or event on the main thread.",
        ],
        followUp: 'Who does the waiting in Node?',
      },
      {
        category: 'nodejs', kind: 'scenario', difficulty: 'intermediate', topic: 'Non-blocking I/O',
        question: 'Why should you avoid fs.readFileSync in a request handler, yet it is acceptable at startup?',
        shortAnswer: 'In a handler it blocks the event loop for every concurrent request while the read happens; at startup no requests are being served yet, so blocking briefly is harmless and simpler.',
        detailedAnswer: [
          "Sync reads hold the only JS thread until the data arrives.",
          "Under load, each blocked read adds latency to all other requests.",
          "At startup (loading config, TLS certs) there is no concurrent work to delay.",
          "CLIs and build scripts can also use sync APIs freely.",
        ],
        trap: "Saying sync APIs are always wrong — they are fine where there is no concurrency.",
      },
    ],
  },

  'event-driven-architecture': {
    summary: 'Node’s runtime is event-driven: libuv detects events (data arrived, timer due, connection opened), the event loop dispatches callbacks, and core objects like servers and streams expose them as EventEmitter events.',
    topics: ['event-driven', 'event loop', 'EventEmitter', 'callbacks', 'observer pattern', 'emit is synchronous', 'reactor pattern'],
    sections: [
      section('introduction', undefined,
        text("Instead of asking 'is the data here yet?' in a loop, Node says 'call me when it happens'. Everything — sockets, timers, streams, process signals — is modelled as events."),
        note("Scope: this lesson covers how the **Node runtime** is event-driven. The `EventEmitter` API in depth is in Module 6; event-driven *system* architecture (brokers, pub/sub between services) is in Module 15."),
      ),
      section('definition', 'Two levels of events',
        table('Event levels in Node', ['Level', 'Who produces events', 'How you consume them'], [
          ['Low level (libuv)', 'OS notifications, timers, thread-pool completions', 'Event loop runs the registered callback'],
          ['High level (JS)', '`EventEmitter` objects: `http.Server`, `net.Socket`, streams, `process`', '`.on("request")`, `.on("data")`, `.on("SIGTERM")`'],
        ]),
        text("This is the **reactor pattern**: a demultiplexer (epoll/kqueue/IOCP via libuv) waits for events, and a dispatcher (the event loop) invokes the handler associated with each event."),
      ),
      section('why', 'Why event-driven',
        bullets(
          "No polling or idle threads — code runs only when something happens.",
          "Natural fit for servers: a request, a chunk of data and a closed connection are all events.",
          "Loose coupling: emitters do not know who listens.",
        ),
      ),
      section('internals', 'From OS event to your callback',
        flow(['OS: socket readable', 'libuv (poll phase): reads bytes', 'Node C++: llhttp parses HTTP', 'http.Server emits "request"', 'Your listener runs (req, res)'], { title: 'An HTTP request as events', direction: 'horizontal' }),
        diagram('event-loop-phases', 'The loop cycles through phases, dispatching ready callbacks in each.'),
        bullets(
          "Most core classes extend `EventEmitter` (`net.Server`, `http.IncomingMessage`, `fs.ReadStream`, `process`).",
          "`emitter.emit()` calls listeners **synchronously**, in registration order, on the current stack.",
          "The *asynchrony* comes from the event loop deciding *when* the native event fires — not from `emit` itself.",
        ),
      ),
      section('example', 'Event-driven HTTP server',
        code({
          title: 'Server events',
          code: dedent(`
            const http = require('node:http');
            const server = http.createServer();

            server.on('request', (req, res) => res.end('ok'));
            server.on('listening', () => console.log('listening on', server.address().port));
            server.on('connection', () => console.log('new TCP connection'));
            process.on('SIGINT', () => server.close(() => console.log('closed')));

            server.listen(3000);
          `),
          expectedOutput: 'listening on 3000\nnew TCP connection\nclosed',
          explanation: [
            "`createServer()` returns an EventEmitter; nothing runs until events occur.",
            "`listening` fires once the socket is bound; `connection` per TCP connection (after a client connects).",
            "Pressing Ctrl+C emits `SIGINT` on `process`; `close` stops accepting connections.",
          ],
        }),
        code({
          title: 'emit is synchronous (minimal emitter)',
          runnable: true,
          code: dedent(`
            class MiniEmitter {
              #listeners = new Map();
              on(event, fn) {
                if (!this.#listeners.has(event)) this.#listeners.set(event, []);
                this.#listeners.get(event).push(fn);
                return this;
              }
              emit(event, ...args) {
                for (const fn of this.#listeners.get(event) ?? []) fn(...args);
                return this.#listeners.has(event);
              }
            }

            const orders = new MiniEmitter();
            orders.on('created', (id) => console.log('send email for', id));
            orders.on('created', (id) => console.log('update stats for', id));

            console.log('before emit');
            orders.emit('created', 42);
            console.log('after emit');
          `),
          expectedOutput: 'before emit\nsend email for 42\nupdate stats for 42\nafter emit',
          explanation: [
            "This mirrors how Node’s `EventEmitter` dispatches: a loop over listeners.",
            "Listeners run in registration order, immediately, before `emit` returns.",
            "That is why 'after emit' prints last — emit does not schedule anything.",
          ],
        }),
      ),
      section('real-world', 'Real-world usage',
        bullets(
          "Graceful shutdown: listen for `SIGTERM`, stop the server, close DB pools.",
          "Streams: `data`, `end`, `error`, `drain` events drive file and network pipelines.",
          "Domain events inside one service (`orderCreated`) — use with care; for cross-service events use a message broker (Module 15).",
        ),
      ),
      section('mistakes', 'Common mistakes',
        bullets(
          "Assuming `emit` is asynchronous — a slow listener blocks the emitter.",
          "Not handling `'error'` events: an emitted `error` with no listener throws and can crash the process.",
          "Adding listeners per request without removing them → `MaxListenersExceededWarning` and leaks.",
        ),
        warn("An `'error'` event with no listener is thrown as an exception. Always attach error handlers to sockets, streams and servers."),
      ),
      section('interview', 'Interview angle',
        interviewTip("Connect the two levels: libuv + event loop deliver OS events; EventEmitter is the JS-level API. Then drop the 'emit is synchronous' fact — it is a frequent trap."),
      ),
      section('practice', 'Practice',
        text("Build a tiny TCP echo server with `net.createServer` and log `connection`, `data`, `end` and `close` events. Connect with `nc localhost 4000` and watch the order."),
      ),
      section('summary', 'Summary',
        bullets(
          "Node reacts to events instead of polling (reactor pattern).",
          "libuv detects events; the event loop dispatches callbacks.",
          "Core objects expose events through EventEmitter.",
          "emit calls listeners synchronously.",
          "Unhandled 'error' events crash the process.",
        ),
      ),
    ],
    revisionNotes: [
      "Reactor pattern: demultiplexer (libuv) + dispatcher (event loop).",
      "http.Server, streams, sockets, process are EventEmitters.",
      "emit() is synchronous, listeners in registration order.",
      "'error' without listener → thrown.",
      "EventEmitter API depth: Module 6; system-level EDA: Module 15.",
    ],
    quiz: [
      {
        kind: 'predict-output', difficulty: 'intermediate',
        prompt: 'What does this print?',
        code: "const { EventEmitter } = require('node:events');\nconst e = new EventEmitter();\ne.on('x', () => console.log('listener'));\nconsole.log('A');\ne.emit('x');\nconsole.log('B');",
        options: ['A B listener', 'A listener B', 'listener A B', 'A B (listener never runs)'],
        answer: 1,
        explanation: "emit() invokes listeners synchronously, so 'listener' prints between A and B. It is not deferred to the event loop.",
      },
      {
        kind: 'mcq', difficulty: 'intermediate',
        prompt: 'In the reactor pattern as implemented by Node, what plays the role of the event demultiplexer?',
        options: ["libuv using epoll/kqueue/IOCP","EventEmitter","V8’s microtask queue","The npm registry"],
        answer: 0,
        explanation: "libuv waits on many I/O sources at once through the OS and reports which are ready. EventEmitter is the JS-level notification API, not the demultiplexer.",
      },
      {
        kind: 'find-bug', difficulty: 'beginner',
        prompt: 'Why can this server crash the whole process?',
        code: "const sock = net.connect(5432, 'db.internal');\nsock.on('data', handle);\n// no other listeners",
        options: ["net.connect needs await","Port 5432 is reserved","'data' is not a valid event","There is no 'error' listener, so a connection error is thrown as an exception"],
        answer: 3,
        explanation: "An emitted 'error' with no listener becomes an uncaught exception. Add sock.on('error', …).",
      },
    ],
    interview: [
      {
        category: 'nodejs', kind: 'concept', difficulty: 'beginner', topic: 'Event-driven',
        question: "What does 'event-driven' mean in the context of the Node.js runtime?",
        shortAnswer: 'Code runs in response to events — an incoming connection, data arriving, a timer firing — instead of polling. libuv detects the events and the event loop invokes the callbacks registered for them.',
        detailedAnswer: [
          "You register handlers (`server.on('request')`, callbacks, promises).",
          "The thread is idle or busy with other callbacks until an event fires.",
          "Core objects (servers, sockets, streams, process) are EventEmitters.",
          "This is the reactor pattern.",
        ],
        followUp: 'Is EventEmitter.emit asynchronous?',
      },
      {
        category: 'nodejs', kind: 'concept', difficulty: 'intermediate', topic: 'Event-driven',
        question: 'How do the event loop and EventEmitter relate, and is emit asynchronous?',
        shortAnswer: 'The event loop delivers low-level events from libuv by running callbacks; inside those callbacks Node core often calls emitter.emit() to notify JS listeners. emit itself is synchronous — it calls every listener immediately in order.',
        detailedAnswer: [
          "Example: poll phase reads socket data → C++ → JS callback → `socket.emit('data', chunk)`.",
          "Listeners run on the current call stack before `emit` returns.",
          "A slow listener delays the emitter and the loop.",
          "To defer work inside a listener use `setImmediate` or `queueMicrotask`.",
        ],
        trap: "Saying emit queues listeners for the next tick.",
      },
    ],
  },
};

export default content;
