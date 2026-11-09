import type { ModuleContent } from '../../../types';
import {
  bullets, code, dedent, diagram, flow, interviewTip, section, steps, table, text,
} from '../helpers';

const content: Partial<ModuleContent> = {
  // ───────────────────────────────────────────────────────────
  'synchronous-vs-asynchronous-execution': {
    summary: 'Synchronous code runs line by line and waits for each step; asynchronous code starts work, moves on, and handles the result later through a callback, promise or await.',
    topics: ['synchronous', 'asynchronous', 'run-to-completion', 'call stack', 'single thread', 'non-blocking'],
    sections: [
      section('introduction', undefined,
        text('A web server spends most of its time **waiting**: for the database, the disk or another API. If JavaScript stopped and waited every time, one slow query would freeze every other user.'),
        text('Asynchronous execution lets Node start the slow work, keep serving others, and pick the result up when it is ready.'),
      ),
      section('definition', 'Definition',
        bullets(
          '**Synchronous**: each statement finishes before the next one starts. The caller gets the result as the return value.',
          '**Asynchronous**: the call *starts* an operation and returns immediately. The result arrives later via a callback, a promise, or `await`.',
          '**Run-to-completion**: once a piece of JavaScript starts running, nothing else (no callback, no timer) can interrupt it until it returns.',
        ),
        table('Synchronous vs asynchronous', ['', 'Synchronous', 'Asynchronous'], [
          ['Returns', 'The result itself', 'Nothing yet / a promise'],
          ['Caller waits?', 'Yes, the whole thread waits', 'No, it continues immediately'],
          ['Result delivered by', '`return` value', 'Callback, `.then`, or `await`'],
          ['Errors delivered by', '`throw` (catch with try/catch)', '`err` argument or rejected promise'],
          ['Node example', '`fs.readFileSync`', '`fs.readFile`, `fs.promises.readFile`'],
        ]),
      ),
      section('why', 'Why it matters in Node',
        bullets(
          'Node runs all your JavaScript on **one main thread**. If that thread waits, every request waits.',
          'I/O (disk, network, DB) is thousands of times slower than CPU work. Async lets a single thread keep thousands of I/O operations in flight.',
          'Async is not "parallel JavaScript". Your callbacks still run one at a time — only the *waiting* happens in parallel (in the OS or libuv).',
        ),
      ),
      section('internals', 'What really happens',
        steps(
          'Your script runs top to bottom on the call stack (synchronous).',
          'An async call like `fs.readFile` hands the work to libuv / the OS and returns at once.',
          'The script keeps running. When the call stack is empty, Node enters the **event loop**.',
          'When the file is read, libuv queues your callback. The event loop runs it on the main thread with a fresh call stack.',
        ),
        flow([
          'Call stack: runs your code synchronously',
          'Node APIs / libuv: does the slow work (disk, network, timers)',
          'Queue: completed callbacks wait here',
          'Event loop: pushes the next callback onto the empty stack',
        ], { title: 'Where async work goes', direction: 'horizontal' }),
      ),
      section('visual', 'Timeline',
        diagram('blocking-vs-nonblocking', 'Synchronous calls wait in line; asynchronous calls overlap their waiting time.'),
      ),
      section('example', 'Examples',
        code({
          title: 'The result arrives later',
          code: dedent(`
            console.log('1. order received');
            setTimeout(() => console.log('3. payment confirmed'), 50);
            console.log('2. send "processing" page');
          `),
          expectedOutput: '1. order received\n2. send "processing" page\n3. payment confirmed',
          explanation: [
            '`setTimeout` registers a callback and returns immediately.',
            'Line 3 runs right away — the script does not pause for 50 ms.',
            'After the script finishes and ~50 ms pass, the event loop runs the callback.',
          ],
          runnable: true,
        }),
        code({
          title: 'Run-to-completion: callbacks never interrupt running code',
          code: dedent(`
            let count = 0;
            setTimeout(() => console.log('timer sees count =', count), 0);
            for (let i = 0; i < 1e6; i++) count++;
            console.log('loop done, count =', count);
          `),
          expectedOutput: 'loop done, count = 1000000\ntimer sees count = 1000000',
          explanation: [
            'The timer is due almost immediately, but it cannot run while the loop is still on the call stack.',
            'Only when the whole script returns can the event loop run the timer, so it sees the final value.',
            'This is why you never need locks for plain variables in Node: there are no data races between callbacks.',
          ],
          runnable: true,
        }),
        code({
          title: 'Sync and async file reads side by side',
          code: dedent(`
            const fs = require('node:fs');

            console.log('A');
            const data = fs.readFileSync(__filename, 'utf8');      // thread waits here
            console.log('B: sync read', data.length > 0);

            fs.readFile(__filename, 'utf8', (err, text) => {       // returns immediately
              if (err) throw err;
              console.log('D: async read', text.length > 0);
            });
            console.log('C');
          `),
          expectedOutput: 'A\nB: sync read true\nC\nD: async read true',
          explanation: [
            '`readFileSync` blocks: `B` only prints after the disk read completes.',
            '`readFile` starts the read and returns; `C` prints before the callback.',
            'The callback (`D`) runs later from the event loop\'s poll phase.',
          ],
        }),
      ),
      section('real-world', 'Real-world backend usage',
        bullets(
          '**Startup**: synchronous reads are fine *once* at boot (e.g. loading a TLS certificate or config with `readFileSync`), because no requests are being served yet.',
          '**Request path**: always asynchronous — DB queries, HTTP calls, file reads inside a handler must not block.',
          '**CLI scripts**: sync APIs are acceptable for small one-shot tools where nothing else runs concurrently.',
        ),
        code({
          title: 'Sync at boot, async per request (Express)',
          code: dedent(`
            const fs = require('node:fs');
            const express = require('express'); // third-party

            const config = JSON.parse(fs.readFileSync('./config.json', 'utf8')); // OK: once, at startup
            const app = express();

            app.get('/report/:id', async (req, res, next) => {
              try {
                const report = await fs.promises.readFile(\`./reports/\${req.params.id}.json\`, 'utf8');
                res.type('json').send(report);
              } catch (err) {
                next(err);
              }
            });
            app.listen(config.port);
          `),
          explanation: ['The sync read happens before `listen`, so it cannot delay any user.', 'Inside the handler the async version keeps the thread free for other requests.'],
        }),
      ),
      section('mistakes', 'Common mistakes',
        bullets(
          'Expecting an async function to return its result directly (`const data = fs.readFile(...)` is `undefined`).',
          'Using the result outside the callback before it exists.',
          'Using `*Sync` APIs inside request handlers.',
          'Thinking "async" means "runs on another thread" — your callback still runs on the main thread.',
        ),
        code({
          title: 'Wrong: using the value before it arrives',
          code: dedent(`
            let user;
            setTimeout(() => { user = { name: 'Ada' }; }, 10);
            console.log(user); // runs first
          `),
          expectedOutput: 'undefined',
          explanation: ['The assignment happens 10 ms later; the log runs immediately.'],
          runnable: true,
        }),
        code({
          title: 'Right: use the value where it is delivered',
          code: dedent(`
            const getUser = () => new Promise((resolve) => setTimeout(() => resolve({ name: 'Ada' }), 10));
            getUser().then((user) => console.log(user));
          `),
          expectedOutput: "{ name: 'Ada' }",
          explanation: ['The value is consumed inside `.then`, which runs only after it exists.'],
          runnable: true,
        }),
      ),
      section('interview', 'Interview angle',
        interviewTip('Say "single-threaded **JavaScript execution**, multi-threaded **I/O**". Interviewers want to hear that the waiting is offloaded to the OS / libuv while callbacks run one at a time.'),
      ),
      section('practice', 'Practice',
        steps(
          'Write a script that logs `start`, schedules three `setTimeout`s with delays 30, 10 and 20 ms, and logs `end`. Predict the order before running.',
          'Replace one `setTimeout` with a 200 ms busy `while` loop at the end of the script. What happens to all timers?',
        ),
      ),
      section('summary', 'Summary',
        bullets(
          'Sync = wait for the result; async = start now, handle the result later.',
          'All your JS runs on one thread; async lets the *waiting* overlap.',
          'Running code is never interrupted (run-to-completion).',
          'Use sync APIs only at startup or in simple scripts.',
        ),
      ),
    ],
    revisionNotes: [
      'Node executes JavaScript on a single main thread; I/O waits happen in the OS or libuv thread pool.',
      'Async calls return immediately; results arrive via callback, promise or await.',
      'Run-to-completion: a callback never runs while other JS is on the stack.',
      '`readFileSync` in a request handler blocks every concurrent request.',
      'Async ≠ parallel JS: callbacks still run one after another.',
    ],
    quiz: [
      {
        kind: 'predict-output', difficulty: 'beginner',
        prompt: 'What does this print?',
        code: "console.log('a');\nsetTimeout(() => console.log('b'), 0);\nconsole.log('c');",
        options: ['a b c', 'b a c', 'a c b', 'c a b'],
        answer: 2,
        explanation: '`setTimeout(..., 0)` still schedules the callback for later. The synchronous `a` and `c` print first; `b` runs once the stack is empty. "a b c" is the tempting answer if you think a 0 ms delay runs inline.',
      },
      {
        kind: 'predict-output', difficulty: 'beginner',
        prompt: 'What value is logged?',
        code: 'let x = 1;\nsetTimeout(() => console.log(x), 0);\nx = 2;',
        options: ['1', 'undefined', 'ReferenceError', '2'],
        answer: 3,
        explanation: 'The callback runs after the whole script finishes, so it reads the current value of `x`, which is 2. It closes over the variable, not a snapshot of its value.',
      },
      {
        kind: 'mcq', difficulty: 'intermediate',
        prompt: 'Which statement about Node.js is correct?',
        options: [
          'Each asynchronous callback runs on its own thread',
          'JavaScript runs on one main thread, while I/O waiting is handled by the OS and libuv',
          'Node runs callbacks in parallel on all CPU cores by default',
          'Asynchronous code is always faster than synchronous code',
        ],
        answer: 1,
        explanation: 'Callbacks run one at a time on the main thread. Only the I/O waiting is concurrent. Async code is not faster per operation — it improves throughput by not wasting the thread while waiting.',
      },
    ],
    interview: [
      {
        category: 'nodejs', kind: 'concept', difficulty: 'beginner', topic: 'Async basics',
        question: 'What is the difference between synchronous and asynchronous execution in Node.js?',
        shortAnswer: 'Synchronous code blocks the thread until each operation finishes; asynchronous code starts the operation, returns immediately and delivers the result later via a callback, promise or await.',
        detailedAnswer: [
          'Sync APIs return the result (or throw); async APIs return nothing or a promise.',
          'Node has a single JavaScript thread, so a sync wait stalls every request.',
          'Async I/O is handed to the OS (sockets) or the libuv thread pool (files, DNS lookup, some crypto).',
          'When the work completes, its callback is queued and the event loop runs it on the main thread.',
          'Sync APIs are acceptable at startup or in CLI scripts, not in request handlers.',
        ],
        followUp: 'If JavaScript is single-threaded, where does the waiting actually happen?',
        trap: 'Saying async code "runs in the background" — the callback itself runs on the main thread.',
      },
      {
        category: 'nodejs', kind: 'concept', difficulty: 'intermediate', topic: 'Async basics',
        question: 'If JavaScript in Node.js is single-threaded, how can one process serve thousands of requests at the same time?',
        shortAnswer: 'Because the requests spend almost all their time waiting on I/O, and that waiting is done by the OS and libuv concurrently. The single thread only runs the short bursts of JavaScript between waits.',
        detailedAnswer: [
          'Network sockets are watched with OS readiness APIs (epoll, kqueue, IOCP), so thousands can be pending with no threads.',
          'File system, `dns.lookup` and some crypto/zlib work use the libuv thread pool (default 4 threads).',
          'The event loop dispatches completed callbacks one at a time; each runs to completion.',
          'This is concurrency, not parallelism: CPU-heavy JS still blocks everyone.',
          'For CPU parallelism use worker threads, child processes or cluster.',
        ],
        followUp: 'What kind of workload is a bad fit for this model?',
        trap: 'Claiming Node itself is single-threaded — the process has several threads (libuv pool, V8 GC/compiler threads).',
      },
    ],
  },

  // ───────────────────────────────────────────────────────────
  'blocking-vs-non-blocking-code': {
    summary: 'Blocking code keeps the main thread busy so nothing else can run; non-blocking code hands slow work off and frees the thread for other callbacks.',
    topics: ['blocking', 'non-blocking', 'event loop lag', 'sync APIs', 'CPU-bound', 'worker_threads', 'chunking'],
    sections: [
      section('introduction', undefined,
        text('In Node, one slow synchronous operation pauses **the entire server** — every request, timer and socket. Knowing what blocks and what does not is the most important performance skill in Node.'),
      ),
      section('definition', 'Definition',
        bullets(
          '**Blocking**: the main thread cannot run any other JavaScript until the operation finishes (e.g. `fs.readFileSync`, `crypto.pbkdf2Sync`, a long `for` loop, `JSON.parse` of a 200 MB string).',
          '**Non-blocking**: the call returns immediately and the result is delivered later (e.g. `fs.promises.readFile`, `crypto.pbkdf2`, socket reads).',
          'Blocking comes in two flavours: **sync I/O** (waiting) and **CPU-bound JavaScript** (computing). Async APIs only fix the first.',
        ),
        table('What blocks the event loop?', ['Operation', 'Blocks?', 'Why'], [
          ['`fs.readFileSync`, `execSync`', 'Yes', 'Sync I/O: thread waits for the OS'],
          ['`crypto.pbkdf2Sync`, `zlib.gzipSync`', 'Yes', 'CPU work on the main thread'],
          ['`JSON.parse` / `JSON.stringify` of huge data', 'Yes', 'Pure CPU, no async version'],
          ['Catastrophic regex (ReDoS)', 'Yes', 'Backtracking runs on the main thread'],
          ['`fs.promises.readFile`', 'No', 'Runs in the libuv thread pool'],
          ['`crypto.pbkdf2` (callback)', 'No', 'Runs in the libuv thread pool'],
          ['`await db.query()`', 'No', 'Network I/O handled by the OS'],
        ]),
      ),
      section('why', 'Why it matters',
        bullets(
          'Latency adds up: if a handler blocks for 200 ms, *every* concurrent request waits 200 ms longer.',
          'Timers fire late, health checks time out, and load balancers may mark the instance unhealthy.',
          'A single malicious input (huge JSON body, evil regex) can become a denial-of-service.',
        ),
      ),
      section('internals', 'Under the hood',
        bullets(
          'The event loop can only move to the next callback when the current one **returns**.',
          'While your code runs, completed I/O piles up in libuv queues but cannot be processed.',
          'Non-blocking APIs push the slow part into the kernel or the libuv thread pool; the main thread only runs the short callback at the end.',
          'CPU-bound JS has no "async version" — you must move it to a worker thread, split it into chunks, or make it cheaper.',
        ),
        diagram('blocking-vs-nonblocking', 'Blocking: requests are served one after another. Non-blocking: waits overlap.'),
      ),
      section('example', 'Examples',
        code({
          title: 'A busy loop delays a 10 ms timer',
          code: dedent(`
            const start = Date.now();
            setTimeout(() => {
              console.log('timer fired after', Date.now() - start >= 200 ? '>= 200ms' : '< 200ms');
            }, 10);

            while (Date.now() - start < 200) {} // blocks the thread for 200 ms
            console.log('blocking loop finished');
          `),
          expectedOutput: 'blocking loop finished\ntimer fired after >= 200ms',
          explanation: [
            'The timer is due after 10 ms, but the thread is stuck in the `while` loop.',
            'Timers are a *minimum* delay: the callback runs only when the loop gets control back.',
            'Every other request in a real server would have waited 200 ms the same way.',
          ],
          runnable: true,
        }),
        code({
          title: 'Same work, blocking vs non-blocking (HTTP server)',
          code: dedent(`
            const http = require('node:http');
            const crypto = require('node:crypto');

            http.createServer((req, res) => {
              if (req.url === '/hash-sync') {
                // Blocks the main thread ~1s: every other request waits
                const hash = crypto.pbkdf2Sync('pw', 'salt', 1_000_000, 64, 'sha512');
                return res.end(hash.toString('hex').slice(0, 8));
              }
              if (req.url === '/hash') {
                // Runs on a libuv pool thread: the main thread stays free
                crypto.pbkdf2('pw', 'salt', 1_000_000, 64, 'sha512', (err, hash) => {
                  if (err) { res.statusCode = 500; return res.end('error'); }
                  res.end(hash.toString('hex').slice(0, 8));
                });
                return;
              }
              res.end('ok');
            }).listen(3000);
          `),
          explanation: [
            'While `/hash-sync` computes, a request to `/` cannot even be accepted — it waits ~1 s.',
            'While `/hash` computes, `/` answers instantly because the hashing happens in the thread pool.',
            'Try it: run `curl localhost:3000/hash-sync & curl localhost:3000/` and compare with `/hash`.',
          ],
        }),
        code({
          title: 'Splitting CPU work into chunks with setImmediate',
          code: dedent(`
            function sumInChunks(n, done) {
              let i = 0;
              let total = 0;
              function chunk() {
                const end = Math.min(i + 1e6, n);
                for (; i < end; i++) total += i;
                if (i < n) setImmediate(chunk); // yield to the event loop
                else done(total);
              }
              chunk();
            }

            setTimeout(() => console.log('timer still runs'), 0);
            sumInChunks(5e6, (total) => console.log('total', total));
          `),
          expectedOutput: 'timer still runs\ntotal 12499997500000',
          explanation: [
            'Each chunk does 1 million iterations, then yields with `setImmediate`.',
            'Between chunks the loop runs timers and I/O, so the timer is not starved.',
            'Chunking keeps the server responsive but the total work takes slightly longer; for heavy CPU work prefer `worker_threads`.',
          ],
          versionNote: 'Uses `setImmediate` (Node-only), so it is not runnable in the browser playground.',
        }),
      ),
      section('real-world', 'Real-world backend usage',
        bullets(
          '**Password hashing**: use async `bcrypt`/`argon2` libraries or `crypto.scrypt` (callback), never the `*Sync` variants inside login handlers.',
          '**Large imports/exports**: stream rows (`stream.pipeline`, a streaming JSON/CSV parser) instead of loading and `JSON.parse`-ing the whole file.',
          '**Image/PDF processing, ML inference**: run in a `worker_threads` pool or a separate job queue worker.',
          '**Input limits**: cap body size (e.g. `express.json({ limit: \'1mb\' })`) so a client cannot force a huge `JSON.parse`.',
        ),
      ),
      section('mistakes', 'Common mistakes',
        bullets(
          'Calling `readFileSync`, `pbkdf2Sync`, `execSync` or `zlib.*Sync` inside a request handler.',
          '`JSON.parse` on an unbounded request body or a multi-hundred-MB file.',
          'Sorting or looping over millions of items per request.',
          'Regexes with nested quantifiers like `/(a+)+$/` on user input (ReDoS).',
          'Believing that wrapping CPU code in a `Promise` or `async` function makes it non-blocking — it does not.',
        ),
        code({
          title: 'Wrong: a promise wrapper does not make CPU work async',
          code: dedent(`
            function heavy() {
              return new Promise((resolve) => {
                const start = Date.now();
                while (Date.now() - start < 100) {} // still runs on the main thread
                resolve('done');
              });
            }
            setTimeout(() => console.log('timer'), 0);
            heavy().then((v) => console.log(v));
            console.log('after heavy()');
          `),
          expectedOutput: 'after heavy()\ndone\ntimer',
          explanation: [
            'The executor runs synchronously, so the 100 ms loop blocks before `after heavy()` prints.',
            'The `.then` callback is a microtask, so `done` still beats the timer.',
          ],
          runnable: true,
        }),
        code({
          title: 'Wrong: parsing a huge file in a handler',
          code: dedent(`
            app.post('/import', (req, res) => {
              const raw = fs.readFileSync('/data/export.json', 'utf8'); // 300 MB, sync I/O
              const rows = JSON.parse(raw);                             // seconds of CPU
              res.json({ count: rows.length });
            });
          `),
          explanation: ['Both lines freeze the whole process; every other request queues up behind them.'],
        }),
        code({
          title: 'Right: move the CPU work to a worker thread',
          code: dedent(`
            const { Worker } = require('node:worker_threads');

            app.post('/import', (req, res) => {
              const worker = new Worker('./parse-export.js', { workerData: '/data/export.json' });
              worker.once('message', (count) => res.json({ count }));
              worker.once('error', (err) => res.status(500).json({ error: err.message }));
            });
          `),
          explanation: ['The parse runs on another thread with its own event loop; the main thread keeps serving requests.', 'In production, reuse a pool of workers (e.g. the `piscina` package) instead of spawning one per request.'],
        }),
      ),
      section('interview', 'Interview angle',
        interviewTip('Distinguish **I/O-bound** blocking (fix: async API) from **CPU-bound** blocking (fix: worker threads, chunking, a job queue, or a cheaper algorithm). Mention event-loop lag monitoring as the way to detect it.'),
      ),
      section('practice', 'Practice',
        steps(
          'Create an HTTP server with `/fast` and `/slow` routes, where `/slow` runs a 2-second busy loop. Hit `/slow` then `/fast` and measure.',
          'Rewrite `/slow` using a worker thread and repeat the measurement.',
        ),
      ),
      section('summary', 'Summary',
        bullets(
          'Anything that keeps the main thread busy blocks every request.',
          'Async APIs fix blocking I/O; they do not fix CPU-heavy JavaScript.',
          'CPU work → worker threads, chunking with `setImmediate`, or a background job.',
          'Bound user input sizes so `JSON.parse`/regex cannot be abused.',
        ),
      ),
    ],
    revisionNotes: [
      'Blocking = the main thread is busy (sync I/O or CPU); nothing else runs meanwhile.',
      '`*Sync` APIs, huge `JSON.parse`/`stringify`, ReDoS regexes and big loops all block.',
      'Wrapping CPU code in a Promise does not make it non-blocking.',
      'Fixes: async APIs for I/O; worker_threads / chunking / job queues for CPU.',
      'Timers are minimum delays; blocking makes them fire late.',
    ],
    quiz: [
      {
        kind: 'predict-output', difficulty: 'beginner',
        prompt: 'What does this print?',
        code: "const start = Date.now();\nsetTimeout(() => console.log('timeout', Date.now() - start >= 100), 0);\nwhile (Date.now() - start < 100) {}\nconsole.log('done');",
        options: ['timeout true, then done', 'timeout false, then done', 'done, then timeout false', 'done, then timeout true'],
        answer: 3,
        explanation: 'The loop blocks for 100 ms and `done` prints at the end of the script. Only then can the timer run, by which time at least 100 ms have passed, so it prints `timeout true`.',
      },
      {
        kind: 'mcq', difficulty: 'beginner',
        prompt: 'Which of these does NOT block the event loop?',
        options: ['`fs.readFileSync(file)`', '`crypto.pbkdf2Sync(...)`', '`fs.promises.readFile(file)`', '`JSON.parse` of a 500 MB string'],
        answer: 2,
        explanation: '`fs.promises.readFile` runs the read in the libuv thread pool and returns a promise. The others all keep the main thread busy; `JSON.parse` has no async variant at all.',
      },
      {
        kind: 'scenario', difficulty: 'intermediate',
        prompt: 'An API\'s p99 latency jumps to 3 s whenever an admin downloads a report. The handler loads 1 M rows and calls `JSON.stringify` on them. What is the best fix?',
        options: [
          'Wrap the `JSON.stringify` call in `new Promise(...)`',
          'Increase `UV_THREADPOOL_SIZE` to 64',
          'Mark the handler `async`',
          'Stream the rows to the response (or generate the report in a worker / background job)',
        ],
        answer: 3,
        explanation: '`JSON.stringify` is CPU work on the main thread. A promise wrapper or `async` keyword still runs it on the same thread, and the thread pool is not involved. Streaming or moving the work off the main thread fixes it.',
      },
    ],
    interview: [
      {
        category: 'nodejs', kind: 'concept', difficulty: 'beginner', topic: 'Blocking',
        question: 'What does "blocking the event loop" mean, and why is it bad for a Node.js server?',
        shortAnswer: 'It means running synchronous work long enough that the event loop cannot process any other callback. In a server that delays every concurrent request, timer and health check.',
        detailedAnswer: [
          'Node runs all JS callbacks on one thread; the loop advances only when the current callback returns.',
          'Causes: sync I/O (`readFileSync`), CPU-heavy code (hashing, big loops, huge JSON), ReDoS regexes.',
          'Symptoms: rising latency for all routes, late timers, failed health checks.',
          'Fixes: async APIs for I/O, worker threads or job queues for CPU work, bounded input sizes.',
        ],
        followUp: 'How would you detect event-loop blocking in production?',
        trap: 'Thinking only "slow I/O" blocks — pure CPU work blocks just as badly, and async APIs do not help it.',
      },
      {
        category: 'nodejs', kind: 'scenario', difficulty: 'advanced', topic: 'Blocking',
        question: 'An endpoint must hash a 50 MB upload and parse a large JSON manifest. How do you implement it without hurting other requests?',
        shortAnswer: 'Stream the upload through `crypto.createHash` so hashing happens incrementally, and parse the manifest with a streaming parser or inside a worker thread so the main thread never runs a multi-second synchronous step.',
        detailedAnswer: [
          'Hashing: `pipeline(req, hash)` processes chunks as they arrive; each chunk is small, so the loop keeps turning.',
          'JSON: `JSON.parse` is synchronous and unbounded — use a streaming parser or a `worker_threads` pool (e.g. `piscina`).',
          'Enforce size limits before any work to prevent abuse.',
          'For very heavy jobs, accept the upload, enqueue a background job, and return 202 Accepted.',
          'Measure with event-loop delay monitoring to confirm the fix.',
        ],
        followUp: 'Why would increasing UV_THREADPOOL_SIZE not help with the JSON parsing?',
        trap: 'Suggesting `async`/`await` or a Promise wrapper around `JSON.parse` — it still runs on the main thread.',
      },
    ],
  },

  // ───────────────────────────────────────────────────────────
  callbacks: {
    summary: 'A callback is a function you pass to another function to be called later; Node\'s classic async APIs use error-first callbacks of the form (err, result).',
    topics: ['callback', 'error-first callback', 'continuation-passing', 'Zalgo', 'sync vs async callbacks'],
    sections: [
      section('introduction', undefined,
        text('Before promises, every async API in Node took a **callback**: "do this work, and call this function when you are done". Many core APIs and libraries still use them, so you must read and write them fluently.'),
      ),
      section('definition', 'Definition',
        bullets(
          'A **callback** is a function passed as an argument and invoked by the receiving function.',
          '**Synchronous callbacks** run before the outer function returns (`array.map`, `forEach`, `sort`).',
          '**Asynchronous callbacks** run later, from the event loop (`fs.readFile`, `setTimeout`, `server.on(\'request\')`).',
          '**Error-first convention**: `callback(err, result)` — `err` is `null` on success, an `Error` on failure. The callback is the **last** argument.',
        ),
      ),
      section('why', 'Why callbacks exist',
        bullets(
          'They are the simplest way to say "run this when the I/O finishes" without blocking.',
          'The error-first shape makes error handling uniform across all of core Node.',
          'They are still the lowest-overhead option and the basis that promises are built on.',
        ),
      ),
      section('internals', 'How an async callback is invoked',
        steps(
          '`fs.readFile(path, cb)` validates arguments and creates a libuv request that remembers `cb`.',
          'The read runs in the libuv thread pool; your code continues.',
          'When the read completes, libuv marks the request done; in the **poll** phase Node calls your `cb(err, data)`.',
          'The callback runs on a **new, empty call stack** — the function that started the read has long since returned.',
          'That is why a `try/catch` around `fs.readFile(...)` cannot catch errors thrown inside the callback.',
        ),
      ),
      section('example', 'Examples',
        code({
          title: 'Synchronous vs asynchronous callbacks',
          code: dedent(`
            console.log('start');
            [1, 2].forEach((n) => console.log('sync callback', n));
            setTimeout(() => console.log('async callback'), 0);
            console.log('end');
          `),
          expectedOutput: 'start\nsync callback 1\nsync callback 2\nend\nasync callback',
          explanation: [
            '`forEach` calls its callback immediately, before returning.',
            '`setTimeout` stores the callback and returns; it runs after the script ends.',
          ],
          runnable: true,
        }),
        code({
          title: 'Writing your own error-first API',
          code: dedent(`
            function divide(a, b, callback) {
              setTimeout(() => {
                if (b === 0) return callback(new Error('Division by zero'));
                callback(null, a / b);
              }, 0);
            }

            const handle = (err, result) => {
              if (err) return console.log('error:', err.message);
              console.log('result:', result);
            };
            divide(10, 2, handle);
            divide(1, 0, handle);
          `),
          expectedOutput: 'result: 5\nerror: Division by zero',
          explanation: [
            'Errors are passed as the first argument instead of thrown — throwing inside the timer would crash the process.',
            '`return callback(...)` guarantees the callback is called exactly once.',
            'The callback is always async (inside `setTimeout`), even for the error case.',
          ],
          runnable: true,
        }),
        code({
          title: 'Error-first callback in core Node',
          code: dedent(`
            const fs = require('node:fs');

            fs.readFile('missing.txt', 'utf8', (err, data) => {
              if (err) {
                console.log(err.code);
                return;
              }
              console.log(data);
            });
          `),
          expectedOutput: 'ENOENT',
          explanation: ['The file does not exist, so `err` is set and `data` is `undefined`.', 'Always check `err` first and `return` so the success path does not run.'],
        }),
      ),
      section('real-world', 'Real-world backend usage',
        bullets(
          'Event handlers are callbacks: `server.on(\'request\', handler)`, `stream.on(\'data\', fn)`.',
          'Express middleware is callback-style: `(req, res, next) => { ... next(err) }` (Express, not Node core).',
          'Older libraries (some DB drivers, `request`, AWS SDK v2) expose callback APIs — wrap them with `util.promisify`.',
        ),
      ),
      section('mistakes', 'Common mistakes',
        bullets(
          'Forgetting `return` after `callback(err)` → the callback runs twice.',
          'Throwing inside an async callback instead of passing the error → uncaught exception, process crash.',
          'Calling the callback sometimes synchronously and sometimes asynchronously ("releasing Zalgo").',
          'Ignoring the `err` argument.',
        ),
        code({
          title: 'Wrong: missing return calls the callback twice',
          code: dedent(`
            function load(flag, cb) {
              if (!flag) cb(new Error('bad flag')); // missing return!
              cb(null, 'data');
            }
            load(false, (err, data) => console.log(err ? 'error: ' + err.message : 'ok: ' + data));
          `),
          expectedOutput: 'error: bad flag\nok: data',
          explanation: ['Without `return`, execution falls through and the success callback also runs. In an HTTP handler this causes "Cannot set headers after they are sent".'],
          runnable: true,
        }),
        code({
          title: 'Wrong vs right: sometimes-sync callback (Zalgo)',
          code: dedent(`
            // Wrong: sync on cache hit, async on miss
            function getUser(id, cb) {
              if (cache.has(id)) return cb(null, cache.get(id));
              db.findUser(id, cb);
            }

            // Right: always async
            function getUserSafe(id, cb) {
              if (cache.has(id)) return process.nextTick(cb, null, cache.get(id));
              db.findUser(id, cb);
            }
          `),
          explanation: [
            'Callers cannot reason about ordering if the callback may run before the function returns.',
            '`process.nextTick(cb, ...args)` defers the call until the current operation finishes, making the API consistently async.',
          ],
        }),
      ),
      section('interview', 'Interview angle',
        interviewTip('Explain the error-first convention *and* the two rules of a good callback API: call it exactly once, and always asynchronously.'),
      ),
      section('practice', 'Practice',
        steps(
          'Write `readJson(path, cb)` that reads a file with `fs.readFile`, parses it, and calls `cb(err, obj)` — including a parse error (wrap `JSON.parse` in try/catch).',
          'Make sure the callback is never called twice, even if `cb` itself throws.',
        ),
      ),
      section('summary', 'Summary',
        bullets(
          'Callbacks can be sync (`map`) or async (`readFile`).',
          'Node convention: callback last, `(err, result)`, `err` null on success.',
          'Call exactly once, always async, pass errors instead of throwing.',
          'Async callbacks run on a fresh stack — outer try/catch cannot catch their errors.',
        ),
      ),
    ],
    revisionNotes: [
      'Error-first: `cb(err, value)`; `err === null` means success; callback is the last parameter.',
      '`return cb(err)` to avoid double invocation.',
      'Never mix sync and async invocation ("Zalgo"); use `process.nextTick` to defer.',
      'Throwing inside an async callback → uncaught exception → process exits.',
      'Async callbacks run from the event loop on a new stack.',
    ],
    quiz: [
      {
        kind: 'predict-output', difficulty: 'intermediate',
        prompt: 'What is printed?',
        code: "function get(cached, cb) {\n  if (cached) cb('cache');\n  else setTimeout(() => cb('db'), 0);\n}\nlet ready = false;\nget(true, (v) => console.log(v, ready));\nready = true;",
        options: ['cache true', 'db true', 'cache false', 'Nothing is printed'],
        answer: 2,
        explanation: 'On a cache hit the callback runs synchronously, before `ready = true` executes, so it logs `cache false`. This inconsistency is exactly why callback APIs should always be async.',
      },
      {
        kind: 'find-bug', difficulty: 'beginner',
        prompt: 'What is the bug?',
        code: "function readConfig(cb) {\n  fs.readFile('config.json', 'utf8', (err, text) => {\n    if (err) cb(err);\n    cb(null, JSON.parse(text));\n  });\n}",
        options: [
          'The callback should be the first argument',
          '`fs.readFile` needs `await`',
          'Missing `return` after `cb(err)`: on error the callback is called again and `JSON.parse(undefined)` throws',
          '`utf8` is not a valid encoding',
        ],
        answer: 2,
        explanation: 'After `cb(err)` execution continues, calling `JSON.parse(undefined)` which throws inside an async callback (crash). Use `return cb(err)`.',
      },
      {
        kind: 'mcq', difficulty: 'beginner',
        prompt: 'In Node\'s error-first convention, what does a successful call look like?',
        options: ['`callback(null, result)`', '`callback(result)`', '`callback(result, null)`', '`callback(true, result)`'],
        answer: 0,
        explanation: 'The first argument is reserved for an error and is `null` (or `undefined`) on success; the result comes second.',
      },
    ],
    interview: [
      {
        category: 'nodejs', kind: 'concept', difficulty: 'beginner', topic: 'Callbacks',
        question: 'What is the error-first callback convention in Node.js?',
        shortAnswer: 'Async functions take a callback as their last argument and call it as `callback(err, result)`: `err` is `null` on success or an `Error` on failure.',
        detailedAnswer: [
          'It gives every core API the same error-handling shape.',
          'The caller must check `err` first and return early.',
          'Errors are passed, not thrown, because a throw in an async callback cannot be caught by the caller.',
          '`util.promisify` relies on this exact shape to convert APIs to promises.',
        ],
        followUp: 'Why can\'t the async function just throw the error?',
        trap: 'Putting the result first or forgetting that `err` may be `undefined` rather than `null` — check with `if (err)`.',
      },
      {
        category: 'nodejs', kind: 'concept', difficulty: 'intermediate', topic: 'Callbacks',
        question: 'Why should a callback-based API never invoke its callback synchronously in some cases and asynchronously in others?',
        shortAnswer: 'Because callers then cannot predict whether code after the call runs before or after the callback, which causes subtle ordering bugs. Always defer with `process.nextTick` (or `queueMicrotask`) on the sync path.',
        detailedAnswer: [
          'Known as "releasing Zalgo" — e.g. a cache hit calls back synchronously, a miss asynchronously.',
          'State set after the call may or may not be visible inside the callback.',
          'Event emitters have the same issue: emitting inside a constructor fires before listeners attach.',
          'Node core defers with `process.nextTick` to keep the API consistently async.',
          'Promises solve this by design: `.then` callbacks are always asynchronous.',
        ],
        followUp: 'Would you defer with process.nextTick or setImmediate here, and why?',
        trap: 'Thinking "sync is faster, so it is an optimisation" — it changes observable ordering.',
      },
    ],
  },

  // ───────────────────────────────────────────────────────────
  'callback-hell': {
    summary: 'Callback hell is deeply nested, hard-to-read callback code with repeated error handling; fix it with named functions, util.promisify and async/await.',
    topics: ['callback hell', 'pyramid of doom', 'util.promisify', 'fs/promises', 'refactoring', 'inversion of control'],
    sections: [
      section('introduction', undefined,
        text('When each async step depends on the previous one, callbacks nest inside callbacks. After three or four levels the code drifts right, error handling repeats, and control flow becomes hard to follow.'),
      ),
      section('definition', 'Definition',
        bullets(
          '**Callback hell** (the "pyramid of doom"): sequential async steps written as nested callbacks.',
          'Problems: readability, duplicated `if (err) return ...`, hard to run steps in parallel, easy to forget an error path.',
          '**Inversion of control**: you hand your continuation to someone else\'s code and trust it to call it exactly once.',
        ),
      ),
      section('why', 'Why it matters',
        bullets(
          'Most legacy Node code and many interview take-home tasks contain it.',
          'Refactoring callbacks into promises is a routine backend task.',
          'Understanding the problem explains *why* promises and async/await were designed the way they are.',
        ),
      ),
      section('internals', 'Escape routes',
        table('Ways out of callback hell', ['Technique', 'What it fixes', 'Limit'], [
          ['Named functions', 'Flattens nesting', 'Still manual error passing'],
          ['Early `return` on error', 'Avoids double callbacks', 'Repetitive'],
          ['`util.promisify` / `fs/promises`', 'Turns callbacks into promises', 'Needs error-first API'],
          ['Promise chains', 'One `.catch` for all steps', 'Can still get long'],
          ['`async`/`await`', 'Reads like sync code, `try/catch` works', 'Must remember `await`'],
        ]),
        flow(['Nested callbacks', 'Named functions', 'Promises (promisify)', 'async / await'], { title: 'Refactoring path', direction: 'horizontal' }),
      ),
      section('example', 'Examples',
        code({
          title: 'The pyramid',
          code: dedent(`
            const fs = require('node:fs');

            fs.readFile('config.json', 'utf8', (err, cfg) => {
              if (err) return console.error(err);
              const { inputFile } = JSON.parse(cfg);
              fs.readFile(inputFile, 'utf8', (err, text) => {
                if (err) return console.error(err);
                fs.writeFile('out.txt', text.toUpperCase(), (err) => {
                  if (err) return console.error(err);
                  console.log('done');
                });
              });
            });
          `),
          expectedOutput: 'done',
          explanation: ['Three dependent steps, three levels of nesting, three copies of the error check.', 'A `JSON.parse` failure here would throw inside a callback and crash the process.'],
        }),
        code({
          title: 'The same logic with fs/promises and async/await',
          code: dedent(`
            const fs = require('node:fs/promises');

            async function main() {
              const { inputFile } = JSON.parse(await fs.readFile('config.json', 'utf8'));
              const text = await fs.readFile(inputFile, 'utf8');
              await fs.writeFile('out.txt', text.toUpperCase());
              console.log('done');
            }

            main().catch((err) => {
              console.error(err);
              process.exitCode = 1;
            });
          `),
          expectedOutput: 'done',
          explanation: [
            'Flat, top-to-bottom code.',
            'Any failure — including `JSON.parse` — rejects `main()` and lands in one `.catch`.',
            'Setting `process.exitCode` lets the process exit cleanly with a failure code.',
          ],
        }),
        code({
          title: 'How promisify works (hand-written)',
          code: dedent(`
            function promisify(fn) {
              return (...args) => new Promise((resolve, reject) => {
                fn(...args, (err, value) => (err ? reject(err) : resolve(value)));
              });
            }

            function legacyAdd(a, b, cb) {
              setTimeout(() => cb(null, a + b), 10);
            }

            const add = promisify(legacyAdd);
            add(2, 3)
              .then((sum) => add(sum, 10))
              .then((total) => console.log('total:', total));
          `),
          expectedOutput: 'total: 15',
          explanation: [
            'The wrapper appends its own error-first callback that settles the promise.',
            'Chaining replaces nesting: each `.then` returns the next promise.',
            'Node\'s real `util.promisify` does the same, plus support for `util.promisify.custom`.',
          ],
          runnable: true,
        }),
        code({
          title: 'util.promisify on a core API',
          code: dedent(`
            const { promisify } = require('node:util');
            const dns = require('node:dns');

            const lookup = promisify(dns.lookup);
            lookup('localhost', { family: 4 }).then(({ address, family }) => {
              console.log(address, family);
            });
          `),
          expectedOutput: '127.0.0.1 4',
          explanation: ['`dns.lookup` calls back with `(err, address, family)`; it defines a custom promisified form that resolves `{ address, family }`.'],
        }),
      ),
      section('real-world', 'Real-world backend usage',
        bullets(
          'Wrapping an old callback SDK: `const query = util.promisify(conn.query).bind(conn)` — or better, `promisify(conn.query.bind(conn))`.',
          'Migrating a legacy codebase file by file: promisify at the boundary, use async/await inside.',
          'Exposing both styles for library users: `util.callbackify(asyncFn)` gives a callback version.',
        ),
      ),
      section('mistakes', 'Common mistakes',
        bullets(
          'Promisifying a method and losing `this` (`promisify(db.query)` → `this` is undefined inside).',
          'Converting to promises but still nesting `.then` inside `.then` — "promise hell".',
          'Mixing callbacks and promises in the same function, causing double calls.',
          'Promisifying functions that do not follow the error-first convention.',
        ),
        code({
          title: 'Wrong vs right: losing this',
          code: dedent(`
            // Wrong: this inside query is undefined
            const query = util.promisify(db.query);

            // Right: bind first
            const query = util.promisify(db.query.bind(db));
          `),
          explanation: ['Extracting a method detaches it from its object; bind restores the receiver.'],
        }),
        code({
          title: 'Wrong vs right: nested promises',
          code: dedent(`
            // Wrong: nesting again
            getUser(id).then((user) => {
              getOrders(user.id).then((orders) => {
                console.log(orders.length);
              });
            });

            // Right: return and flatten
            getUser(id)
              .then((user) => getOrders(user.id))
              .then((orders) => console.log(orders.length))
              .catch(handleError);
          `),
          explanation: ['Returning the inner promise lets errors from both steps reach a single `.catch`.'],
        }),
      ),
      section('interview', 'Interview angle',
        interviewTip('Do not stop at "it looks ugly". Mention the real problems: duplicated error handling, uncaught throws inside callbacks, hard parallelism, and inversion of control (trusting a library to call you once).'),
      ),
      section('practice', 'Practice',
        steps(
          'Take the pyramid example and refactor it first with named functions, then with `fs/promises`.',
          'Add a step that reads two files in parallel and see how much easier it is with `Promise.all`.',
        ),
      ),
      section('summary', 'Summary',
        bullets(
          'Callback hell = nested dependent callbacks with repeated error handling.',
          'Prefer promise-based core APIs (`fs/promises`, `timers/promises`, `stream/promises`).',
          'Wrap legacy APIs with `util.promisify` (bind methods first).',
          'async/await + one try/catch is the modern answer.',
        ),
      ),
    ],
    revisionNotes: [
      'Callback hell problems: nesting, repeated error checks, crashes from throws in callbacks, hard parallelism.',
      '`util.promisify(fn)` needs an error-first callback API; honours `fn[util.promisify.custom]`.',
      'Bind methods before promisifying.',
      '`util.callbackify` converts the other way.',
      'Return promises from `.then` instead of nesting.',
    ],
    quiz: [
      {
        kind: 'mcq', difficulty: 'beginner',
        prompt: 'Which of these does NOT help fix callback hell?',
        options: ['Converting to `async`/`await`', 'Using `util.promisify`', 'Extracting named functions', 'Wrapping the outer call in try/catch'],
        answer: 3,
        explanation: 'A try/catch around the outermost call cannot catch errors from callbacks that run later, and it does nothing for nesting. The other three are the standard refactorings.',
      },
      {
        kind: 'find-bug', difficulty: 'intermediate',
        prompt: 'This code throws `TypeError: Cannot read properties of undefined` inside `query`. Why?',
        code: "const { promisify } = require('node:util');\nconst query = promisify(db.query);\nawait query('SELECT 1');",
        options: [
          '`promisify` only works on core modules',
          '`query` must be called with a callback too',
          '`db.query` lost its `this` binding when extracted; use `promisify(db.query.bind(db))`',
          '`await` cannot be used with promisified functions',
        ],
        answer: 2,
        explanation: 'The method uses `this` internally. Passing `db.query` detaches it from `db`, so `this` is undefined. Binding first fixes it.',
      },
      {
        kind: 'predict-output', difficulty: 'intermediate',
        prompt: 'What does this print?',
        code: "function promisify(fn) {\n  return (...a) => new Promise((res, rej) => fn(...a, (e, v) => (e ? rej(e) : res(v))));\n}\nconst legacy = (x, cb) => setTimeout(() => (x < 0 ? cb(new Error('negative')) : cb(null, x * 2)), 0);\nconst p = promisify(legacy);\np(-1).then((v) => console.log('value', v)).catch((e) => console.log('error', e.message));\np(4).then((v) => console.log('value', v));",
        options: ['value 8, then error negative', 'error negative, then value 8', 'error negative only', 'value -2, then value 8'],
        answer: 1,
        explanation: 'Both timers have the same delay and fire in creation order. The first rejects (`error negative`), the second resolves (`value 8`). The rejection takes one extra microtask hop through `.then` to reach `.catch`, but it is still processed in the first timer\'s microtask drain, before the second timer runs.',
      },
    ],
    interview: [
      {
        category: 'nodejs', kind: 'concept', difficulty: 'beginner', topic: 'Callbacks',
        question: 'What is callback hell and what are the practical ways to avoid it?',
        shortAnswer: 'It is deeply nested callback code for dependent async steps. Avoid it by using named functions, promise-based APIs (`fs/promises`, `util.promisify`) and async/await with one try/catch.',
        detailedAnswer: [
          'Symptoms: rightward drift, duplicated `if (err) return cb(err)`, unclear control flow.',
          'Real risks: a throw inside a nested callback crashes the process; a missing return calls back twice.',
          'Promises flatten the chain and centralise errors in `.catch`.',
          'async/await reads top to bottom and makes `try/catch` work again.',
          'Use `Promise.all` when steps are independent instead of nesting them.',
        ],
        followUp: 'How would you migrate a large callback-based codebase incrementally?',
        trap: 'Rewriting to promises but still nesting `.then` calls — the shape changes but the problem stays.',
      },
      {
        category: 'nodejs', kind: 'concept', difficulty: 'intermediate', topic: 'Callbacks',
        question: 'How does util.promisify work, and when does it fail to produce a correct promise API?',
        shortAnswer: 'It returns a function that calls the original with an extra error-first callback and resolves or rejects a promise from it. It fails for non error-first APIs, methods that need `this`, and callbacks with multiple result values unless `util.promisify.custom` is defined.',
        detailedAnswer: [
          'Internally: `new Promise((res, rej) => fn(...args, (err, v) => err ? rej(err) : res(v)))`.',
          'If `fn[util.promisify.custom]` exists it is returned instead (e.g. `setTimeout`, `dns.lookup`).',
          'Multiple success values are dropped except the first, unless a custom form exists.',
          'Methods must be bound: `promisify(obj.method.bind(obj))`.',
          'APIs that call back more than once (events, progress) do not fit a single promise.',
        ],
        followUp: 'How would you convert an EventEmitter-based API to promises? (hint: `events.once`)',
        trap: 'Assuming every result argument survives: for `cb(err, a, b)` only `a` is resolved unless the function defines `util.promisify.custom`.',
      },
    ],
  },
};

export default content;
