import type { ModuleContent } from '../../../types';
import {
  bullets, code, dedent, diagram, flow, interviewTip, section, steps, table, text, warn,
} from '../helpers';

const content: Partial<ModuleContent> = {
  // ───────────────────────────────────────────────────────────
  'libuv-thread-pool': {
    summary: 'libuv keeps a pool of worker threads (4 by default, UV_THREADPOOL_SIZE up to 1024) for work the OS cannot do asynchronously: file system, dns.lookup, some crypto and zlib — not network sockets.',
    topics: ['libuv', 'thread pool', 'UV_THREADPOOL_SIZE', 'fs', 'dns.lookup', 'crypto.pbkdf2', 'scrypt', 'zlib', 'worker_threads'],
    sections: [
      section('introduction', undefined,
        text('"Node is single-threaded" is only half true. Behind your JavaScript, libuv runs a small **thread pool** that does blocking work — like reading files or hashing passwords — so the main thread does not have to.'),
      ),
      section('definition', 'Definition',
        bullets(
          'A fixed-size pool of native threads managed by libuv, shared by the whole process.',
          'Default size **4**. Configure with the `UV_THREADPOOL_SIZE` environment variable (max **1024**). It must be set before the pool is first used — in practice, when starting the process.',
          'Work is queued FIFO; when all threads are busy, new tasks **wait**.',
          'The pool runs **C/C++ work**, never your JavaScript. Results come back to the main thread as callbacks (poll phase).',
        ),
        table('Who uses the thread pool?', ['Uses the pool', 'Does NOT use the pool'], [
          ['All `fs` async APIs (callbacks and `fs/promises`) except `fs.watch`', 'TCP/UDP sockets, HTTP(S) servers and clients'],
          ['`dns.lookup()` (uses `getaddrinfo`) — so also `http.get(hostname)` by default', '`dns.resolve*()` (c-ares, async network)'],
          ['`crypto.pbkdf2`, `scrypt`, `randomBytes`/`randomFill` (async), `generateKeyPair`', 'Sync crypto (`pbkdf2Sync`…) — runs on the main thread'],
          ['`zlib` async APIs (`gzip`, `deflate`, streams)', 'Timers, `setImmediate`, `process.nextTick`'],
          ['Native addons that call `uv_queue_work`', 'Pipes, TTYs, child process I/O (OS async)'],
        ]),
      ),
      section('why', 'Why it exists',
        bullets(
          'Network sockets have good non-blocking OS APIs (epoll, kqueue, IOCP). Regular **files** and **getaddrinfo** do not, portably.',
          'CPU-heavy native operations (key derivation, compression) would block the main thread.',
          'The pool turns blocking calls into async ones without exposing threads to JavaScript.',
        ),
      ),
      section('internals', 'How a pool task flows',
        steps(
          'JS calls `crypto.pbkdf2(..., cb)`. Node\'s C++ binding creates a libuv work request.',
          'libuv pushes it onto the pool queue. If a thread is free it starts; otherwise it waits.',
          'A worker thread runs the native work (no JS, no V8 access).',
          'On completion libuv signals the loop (an async handle); in the poll phase the callback runs on the main thread.',
        ),
        diagram('thread-pool', 'The main thread offloads fs, dns.lookup, crypto and zlib work to libuv\'s worker threads.'),
        warn('All pool users share the same 4 threads. Slow `dns.lookup` calls or a burst of `pbkdf2` hashes can delay **unrelated** `fs` reads.'),
      ),
      section('example', 'Examples',
        code({
          title: 'Five hashes on four threads',
          code: dedent(`
            const crypto = require('node:crypto');
            const start = Date.now();

            for (let i = 1; i <= 5; i++) {
              crypto.pbkdf2('secret', 'salt', 300_000, 64, 'sha512', () => {
                console.log(\`hash \${i} done after \${Date.now() - start} ms\`);
              });
            }
          `),
          expectedOutput: 'hash 1 done after 212 ms\nhash 4 done after 215 ms\nhash 2 done after 216 ms\nhash 3 done after 218 ms\nhash 5 done after 421 ms',
          explanation: [
            'Timings and the order of the first four vary per machine; the **pattern** is what matters.',
            'The first four run in parallel on the four pool threads and finish together.',
            'The fifth waits for a free thread, so it takes about twice as long.',
            'With `UV_THREADPOOL_SIZE=5` all five finish together (given ≥ 5 CPU cores).',
          ],
        }),
        code({
          title: 'Changing the pool size',
          language: 'bash',
          code: dedent(`
            # Set it when starting the process (works on every platform)
            UV_THREADPOOL_SIZE=8 node server.js

            # Windows PowerShell
            $env:UV_THREADPOOL_SIZE=8; node server.js
          `),
          explanation: [
            'Setting `process.env.UV_THREADPOOL_SIZE` inside your code only works if it runs before anything touches the pool — fragile, avoid it.',
            'More threads than CPU cores helps for I/O-bound pool work (fs, dns.lookup) but not for CPU-bound work (hashing).',
          ],
        }),
        code({
          title: 'Network I/O is not limited by the pool',
          code: dedent(`
            const http = require('node:http');
            const crypto = require('node:crypto');

            // Saturate all 4 pool threads with long hashes (several seconds each)
            let hashesDone = 0;
            for (let i = 0; i < 4; i++) {
              crypto.pbkdf2('x', 'y', 2_000_000, 64, 'sha512', () => { hashesDone++; });
            }

            const server = http.createServer((req, res) => res.end('pong'));
            server.listen(0, () => {
              const { port } = server.address();
              http.get({ host: '127.0.0.1', port }, (res) => {   // IP address: no dns.lookup
                let body = '';
                res.on('data', (chunk) => { body += chunk; });
                res.on('end', () => {
                  console.log('response:', body, '| hashes finished so far:', hashesDone);
                  server.close();
                });
              });
            });
          `),
          expectedOutput: 'response: pong | hashes finished so far: 0',
          explanation: [
            'The full HTTP round trip completes while every pool thread is still busy hashing.',
            'Sockets use OS readiness notifications, not pool threads, so the busy pool does not block them.',
            'With `host: \'localhost\'`, Node would call `dns.lookup` first — which *does* need a pool thread and would wait behind the hashes.',
          ],
        }),
      ),
      section('real-world', 'Real-world backend usage',
        bullets(
          '**Login endpoints**: each `scrypt`/`pbkdf2` hash holds a pool thread for tens of ms. Under a login burst, file reads and DNS lookups queue behind them.',
          '**DNS-heavy services** (calling many external hosts): `dns.lookup` is pool-bound; cache results, use keep-alive agents, or `dns.resolve4` where `/etc/hosts` semantics are not needed.',
          '**File-heavy services** (uploads, static files on network storage): raise the pool size, e.g. 16–64, and measure.',
          'Pool threads are not for your JS — for CPU-bound JavaScript use `worker_threads`.',
        ),
        table('Thread pool vs worker threads', ['', 'libuv thread pool', 'worker_threads'], [
          ['Runs', 'Native C/C++ tasks', 'Your JavaScript (own V8 isolate + event loop)'],
          ['Controlled by', 'Node core APIs internally', 'You (`new Worker(...)`)'],
          ['Size', '`UV_THREADPOOL_SIZE` (default 4)', 'As many as you create'],
          ['Use for', 'fs, dns.lookup, crypto, zlib', 'CPU-heavy JS: parsing, image processing, ML'],
        ]),
      ),
      section('mistakes', 'Common mistakes',
        bullets(
          'Believing the pool handles HTTP or database sockets.',
          'Believing sync APIs (`pbkdf2Sync`, `readFileSync`) use the pool — they run on the main thread.',
          'Raising `UV_THREADPOOL_SIZE` to fix CPU-bound slowness on a 2-core machine — threads just compete for the same cores.',
          'Setting `process.env.UV_THREADPOOL_SIZE` after some `fs` call already started the pool.',
          'Assuming the pool runs JavaScript callbacks in parallel.',
        ),
        code({
          title: 'Wrong vs right: password hashing',
          code: dedent(`
            // Wrong: blocks the main thread ~100 ms per login
            const hash = crypto.scryptSync(password, salt, 64);

            // Right: runs on a pool thread; main thread stays free
            const { promisify } = require('node:util');
            const scrypt = promisify(crypto.scrypt);
            const hash = await scrypt(password, salt, 64);
          `),
          explanation: ['The async form still costs a pool thread per hash — rate-limit login attempts so hashing cannot monopolise the pool.'],
        }),
      ),
      section('interview', 'Interview angle',
        interviewTip('Name the users (fs, dns.lookup, crypto pbkdf2/scrypt/randomBytes, zlib), the default size (4), the env var and max (1024), and the key exclusion: network sockets do not use it.'),
      ),
      section('practice', 'Practice',
        steps(
          'Run the five-hash example with `UV_THREADPOOL_SIZE` of 2, 4 and 8 and record the timings.',
          'Saturate the pool with hashes, then time an `fs.promises.readFile` of a tiny file. Explain the delay.',
        ),
      ),
      section('summary', 'Summary',
        bullets(
          'libuv pool: 4 threads by default, `UV_THREADPOOL_SIZE` up to 1024.',
          'Used by fs, dns.lookup, async crypto (pbkdf2, scrypt, randomBytes), zlib.',
          'Not used by network sockets or timers.',
          'Shared FIFO: one slow user delays the others.',
          'Runs native work only; use worker_threads for JS.',
        ),
      ),
    ],
    revisionNotes: [
      'Default 4 threads; `UV_THREADPOOL_SIZE` (max 1024), set at process start.',
      'Pool: fs (except fs.watch), dns.lookup, crypto pbkdf2/scrypt/randomBytes/randomFill/generateKeyPair, zlib async.',
      'Not pool: TCP/UDP/HTTP sockets, dns.resolve*, timers, sync APIs.',
      'Fifth concurrent pbkdf2 on default pool takes ~2× as long.',
      '`http.get(\'hostname\')` uses dns.lookup → pool.',
      'Pool ≠ worker_threads: it never runs your JS.',
    ],
    quiz: [
      {
        kind: 'mcq', difficulty: 'intermediate',
        prompt: 'Which of these does NOT use the libuv thread pool?',
        options: ['Reading data from a TCP socket', '`fs.promises.readFile`', '`crypto.pbkdf2`', '`dns.lookup`'],
        answer: 0,
        explanation: 'Sockets use OS readiness APIs (epoll/kqueue/IOCP) directly on the event loop. The others are queued on the pool.',
      },
      {
        kind: 'predict-output', difficulty: 'advanced',
        prompt: 'On a machine with 8 cores and the default pool size, 6 `crypto.pbkdf2` calls start together; each takes ~100 ms on its own. Roughly when do they finish?',
        code: "for (let i = 0; i < 6; i++) {\n  crypto.pbkdf2('pw', 'salt', N, 64, 'sha512', () => log(i, elapsed()));\n}",
        options: [
          'All six at ~100 ms',
          'All six at ~600 ms',
          'Four at ~100 ms, two at ~200 ms',
          'One every ~100 ms (100, 200 … 600 ms)',
        ],
        answer: 2,
        explanation: 'Only 4 pool threads exist, so four hashes run in parallel and the remaining two wait for free threads. Spare CPU cores do not help without a bigger pool.',
      },
      {
        kind: 'scenario', difficulty: 'advanced',
        prompt: 'During login spikes, an unrelated endpoint that reads small JSON files becomes slow, while CPU is at 40%. Logins use async `crypto.scrypt`. What is the most likely cause and fix?',
        options: [
          'The event loop is blocked by `scrypt`; switch to `scryptSync`',
          'The 4 pool threads are saturated by scrypt so fs reads queue behind them; raise `UV_THREADPOOL_SIZE` (and rate-limit logins)',
          'The disk is slow; move files to an SSD',
          'JSON.parse is slow; use a streaming parser',
        ],
        answer: 1,
        explanation: 'fs and scrypt share the pool. With spare CPU, more pool threads let file reads proceed alongside hashes. `scryptSync` would block the main thread and make everything worse.',
      },
    ],
    interview: [
      {
        category: 'nodejs', kind: 'concept', difficulty: 'intermediate', topic: 'libuv',
        question: 'Which Node.js operations run on the libuv thread pool, and which do not?',
        shortAnswer: 'Pool: async fs operations, dns.lookup, async crypto like pbkdf2/scrypt/randomBytes, and zlib. Not pool: network sockets (TCP/UDP/HTTP), dns.resolve*, timers, and any sync API.',
        detailedAnswer: [
          'The pool exists for work without a portable non-blocking OS API (files, getaddrinfo) and for CPU-heavy native work.',
          'Sockets use epoll/kqueue/IOCP, so thousands can be pending with no threads.',
          'Default 4 threads; `UV_THREADPOOL_SIZE` up to 1024.',
          'Sync variants (`readFileSync`, `pbkdf2Sync`) run on the main thread.',
          'The pool never executes JavaScript.',
        ],
        followUp: 'Why does `http.get(\'http://example.com\')` touch the thread pool even though HTTP does not?',
        trap: 'Saying "all async I/O goes through the thread pool".',
      },
      {
        category: 'nodejs', kind: 'scenario', difficulty: 'advanced', topic: 'libuv',
        question: 'Five concurrent crypto.pbkdf2 calls take twice as long for the fifth one. Explain why and how you would tune it.',
        shortAnswer: 'The default pool has 4 threads, so the fifth call waits until one is free. Raise `UV_THREADPOOL_SIZE` at process start (bounded by available cores for CPU-bound work) or move hashing to a dedicated worker/service.',
        detailedAnswer: [
          'pbkdf2 is CPU-bound native work queued on the pool.',
          'Queue is FIFO and shared with fs, dns.lookup and zlib.',
          'Setting the pool larger than the core count gives no more CPU for hashing; it does help I/O-bound pool work.',
          'The env var must be set before the pool is first used — typically in the launch command or container config.',
          'Also rate-limit expensive operations and consider separating auth into its own service.',
        ],
        followUp: 'How would you detect pool saturation in production?',
        trap: 'Recommending `pbkdf2Sync` "to avoid the pool".',
      },
      {
        category: 'nodejs', kind: 'concept', difficulty: 'advanced', topic: 'libuv',
        question: 'Why is dns.lookup affected by thread pool saturation while dns.resolve4 is not?',
        shortAnswer: '`dns.lookup` calls the OS `getaddrinfo`, which is blocking, so libuv runs it on a pool thread. `dns.resolve4` uses the c-ares library, which talks to DNS servers over non-blocking sockets on the event loop.',
        detailedAnswer: [
          '`dns.lookup` honours `/etc/hosts`, nsswitch and OS resolver config — same results as other programs.',
          '`dns.resolve*` always queries DNS servers directly and ignores `/etc/hosts`.',
          'HTTP clients use `dns.lookup` by default, so slow DNS can occupy pool threads.',
          'Mitigations: DNS caching, keep-alive agents, a custom `lookup` function, or a larger pool.',
        ],
        followUp: 'What are the trade-offs of switching an HTTP agent to use dns.resolve?',
        trap: 'Assuming "DNS is network, so it never uses the pool".',
      },
    ],
  },

  // ───────────────────────────────────────────────────────────
  'asynchronous-i-o': {
    summary: 'Node performs I/O asynchronously: network sockets via OS readiness APIs (epoll, kqueue, IOCP) on the event loop, and files via the libuv thread pool — the main thread only runs the completion callbacks.',
    topics: ['asynchronous I/O', 'non-blocking I/O', 'epoll', 'kqueue', 'IOCP', 'fs/promises', 'streams', 'FileHandle', 'C10K'],
    sections: [
      section('introduction', undefined,
        text('Node\'s headline feature is **non-blocking I/O**: one process can hold tens of thousands of open connections. This lesson connects everything — event loop, thread pool and OS — into the path a single read takes.'),
      ),
      section('definition', 'Definition',
        bullets(
          '**Asynchronous I/O**: you request an I/O operation and continue; you are notified on completion.',
          '**Network I/O** in Node: sockets are non-blocking; libuv registers them with the OS event notification API (**epoll** on Linux, **kqueue** on macOS/BSD, **IOCP** on Windows) and the poll phase waits for events.',
          '**File I/O**: regular files are always "ready" to readiness APIs, so libuv performs the blocking syscalls on **thread-pool** threads.',
          'Either way, your callback/promise continuation runs on the main thread.',
        ),
        table('How each kind of I/O is made async', ['I/O', 'Mechanism', 'Threads used'], [
          ['TCP / HTTP / WebSocket / DB drivers', 'OS readiness or completion notifications', 'None extra (event loop thread)'],
          ['Files (`fs`)', 'Blocking syscalls in worker threads', 'libuv pool'],
          ['DNS `lookup`', '`getaddrinfo` in worker threads', 'libuv pool'],
          ['Child process pipes, TTY', 'OS async handles', 'None extra'],
        ]),
      ),
      section('why', 'Why it matters',
        bullets(
          'It is why Node scales for I/O-heavy APIs, proxies, chat servers and gateways.',
          'It tells you where bottlenecks hide: CPU on the main thread, or a saturated thread pool for files/DNS.',
          'It explains why streaming beats reading everything into memory.',
        ),
      ),
      section('internals', 'The path of one read',
        flow([
          'JS: await readFile(path)',
          'Node C++ binding: creates a libuv fs request',
          'libuv: queues it on the thread pool',
          'Worker thread: open/read/close syscalls',
          'libuv: signals completion to the loop',
          'Poll phase: Node resolves the promise',
          'Microtask: your code after await runs',
        ], { title: 'fs/promises readFile', direction: 'vertical' }),
        flow([
          'Socket registered with epoll/kqueue/IOCP',
          'Poll phase: OS reports "data ready"',
          'libuv reads the bytes (non-blocking)',
          'Node emits \'data\' / parses HTTP',
          'Your request handler runs',
        ], { title: 'Incoming HTTP request', direction: 'vertical' }),
        diagram('thread-pool', 'Files and DNS lookups go to the pool; sockets are watched directly by the OS.'),
      ),
      section('example', 'Examples',
        code({
          title: 'Concurrent file reads with fs/promises',
          code: dedent(`
            const { readFile } = require('node:fs/promises');

            async function loadAll(files) {
              const contents = await Promise.all(files.map((f) => readFile(f, 'utf8')));
              console.log('files read:', contents.length);
              console.log('total chars:', contents.reduce((n, c) => n + c.length, 0));
            }

            loadAll(['a.txt', 'b.txt', 'c.txt']);
          `),
          expectedOutput: 'files read: 3\ntotal chars: 42',
          explanation: [
            'The three reads run concurrently on pool threads.',
            'The count depends on your files; the point is that no read blocked the loop.',
          ],
        }),
        code({
          title: 'Streaming a large file instead of buffering it',
          code: dedent(`
            const fs = require('node:fs');
            const http = require('node:http');
            const { pipeline } = require('node:stream/promises');

            http.createServer(async (req, res) => {
              res.setHeader('Content-Type', 'text/csv');
              try {
                await pipeline(fs.createReadStream('./exports/big.csv'), res);
              } catch (err) {
                res.destroy(err); // client aborted or file missing
              }
            }).listen(3000);
          `),
          explanation: [
            'Memory stays at a few chunks (64 KiB `highWaterMark` for file streams) regardless of file size.',
            '`pipeline` handles backpressure: if the client is slow, file reading pauses.',
            '`readFile` on a 2 GB file would allocate 2 GB per request.',
          ],
        }),
        code({
          title: 'Always close FileHandles',
          code: dedent(`
            const { open } = require('node:fs/promises');

            async function firstLine(path) {
              const file = await open(path, 'r');
              try {
                for await (const line of file.readLines()) {
                  return line;
                }
                return null;
              } finally {
                await file.close(); // releases the file descriptor even on errors
              }
            }

            firstLine('package.json').then((l) => console.log(l));
          `),
          expectedOutput: '{',
          explanation: ['Leaked descriptors eventually cause `EMFILE: too many open files`.', '`filehandle.readLines()` is available since Node 18.11.'],
        }),
        code({
          title: 'Sync vs async I/O ordering',
          code: dedent(`
            const fs = require('node:fs');

            fs.readFile(__filename, () => console.log('3: async read done'));
            fs.readFileSync(__filename);
            console.log('1: sync read done');
            setImmediate(() => console.log('2: immediate'));
          `),
          expectedOutput: '1: sync read done\n2: immediate\n3: async read done',
          explanation: [
            'The sync read blocks, then logs 1.',
            'An async `readFile` needs several pool round-trips (open, stat, read, close) — several loop iterations — so the first check phase (2) runs before it completes.',
          ],
        }),
      ),
      section('real-world', 'Real-world backend usage',
        bullets(
          'API gateways and proxies hold thousands of idle keep-alive sockets cheaply — no thread per connection.',
          'File uploads: stream to disk or object storage (`pipeline(req, fs.createWriteStream(...))`) instead of buffering.',
          'DB access: drivers use sockets, so queries do not use the pool — but the DB connection pool size limits concurrency.',
          'On network file systems (NFS, EFS), fs latency is high — increase `UV_THREADPOOL_SIZE` so slow reads do not queue.',
        ),
      ),
      section('mistakes', 'Common mistakes',
        bullets(
          '`readFileSync`/`writeFileSync`/`existsSync` in request handlers.',
          'Reading huge files fully into memory (`readFile`) instead of streaming.',
          'Forgetting to close `FileHandle`s or streams → `EMFILE`.',
          'Using `fs.exists`-then-open checks (race condition) instead of opening and handling `ENOENT`.',
          'Unbounded `Promise.all` over thousands of files → pool queue and descriptor exhaustion.',
        ),
        code({
          title: 'Wrong vs right: check-then-act',
          code: dedent(`
            // Wrong: the file can disappear between the check and the read
            if (fs.existsSync(path)) {
              const data = await fs.promises.readFile(path, 'utf8');
            }

            // Right: just try it and handle the error code
            try {
              const data = await fs.promises.readFile(path, 'utf8');
            } catch (err) {
              if (err.code !== 'ENOENT') throw err;
              // handle missing file
            }
          `),
          explanation: ['Also removes one sync call from the request path.'],
        }),
      ),
      section('interview', 'Interview angle',
        interviewTip('A senior-level answer distinguishes the two mechanisms: readiness-based OS notification for sockets vs thread-pool emulation for files — and mentions that both end with a callback on the single JS thread.'),
      ),
      section('practice', 'Practice',
        steps(
          'Write a server that streams a 500 MB file; watch memory with `process.memoryUsage().rss` compared to a `readFile` version.',
          'Open 20 000 connections to a Node server with a load tool and check how many threads the process has (e.g. `ps -T` or Task Manager).',
        ),
      ),
      section('summary', 'Summary',
        bullets(
          'Sockets: non-blocking + epoll/kqueue/IOCP, no extra threads.',
          'Files and dns.lookup: libuv thread pool.',
          'Callbacks always run on the main thread (poll phase).',
          'Stream large data; close file handles; avoid sync I/O in handlers.',
        ),
      ),
    ],
    revisionNotes: [
      'Network I/O: epoll (Linux), kqueue (macOS/BSD), IOCP (Windows) — event loop thread only.',
      'File I/O: thread pool, because regular files are always "readable" to readiness APIs.',
      'Completion callbacks run in the poll phase on the main thread.',
      'Stream large files with `pipeline`; `readFile` buffers everything.',
      'Close FileHandles in `finally` to avoid EMFILE.',
      'Prefer try/catch on ENOENT over `existsSync` checks.',
    ],
    quiz: [
      {
        kind: 'mcq', difficulty: 'intermediate',
        prompt: 'How does Node.js handle 10 000 concurrent idle WebSocket connections?',
        options: [
          'Non-blocking sockets registered with the OS notification API (epoll/kqueue/IOCP) on the event loop thread',
          'One thread per connection',
          'They are spread across the 4 libuv pool threads',
          'Each connection gets its own worker thread',
        ],
        answer: 0,
        explanation: 'Sockets need no threads while idle; the OS tells the poll phase when data arrives. The pool is for files, dns.lookup, crypto and zlib.',
      },
      {
        kind: 'predict-output', difficulty: 'intermediate',
        prompt: 'What is the output?',
        code: "const fs = require('node:fs');\nfs.readFile(__filename, () => console.log('async'));\nconst data = fs.readFileSync(__filename);\nconsole.log('sync');",
        options: ['async, sync', 'sync, async', 'Either order', 'sync only'],
        answer: 1,
        explanation: 'Even though the async read was started first, its callback can only run from the event loop after the script finishes. The sync read blocks and logs first.',
      },
      {
        kind: 'scenario', difficulty: 'intermediate',
        prompt: 'An endpoint returns a 2 GB log export with `res.send(await fs.promises.readFile(path))`. Memory spikes and the process is OOM-killed under load. Best fix?',
        options: [
          'Use `readFileSync` instead',
          'Increase `UV_THREADPOOL_SIZE`',
          'Stream it: `await pipeline(fs.createReadStream(path), res)`',
          'Increase `--max-old-space-size` to 8 GB',
        ],
        answer: 2,
        explanation: 'Streaming keeps memory constant and respects backpressure. Buffers live outside the V8 heap, so `--max-old-space-size` does not even address the problem; sync reads also block the loop.',
      },
    ],
    interview: [
      {
        category: 'nodejs', kind: 'concept', difficulty: 'intermediate', topic: 'Async I/O',
        question: 'How can a single Node.js process handle tens of thousands of concurrent connections?',
        shortAnswer: 'Sockets are non-blocking and registered with the OS event notification API (epoll, kqueue, IOCP). The event loop sleeps in the poll phase until the OS reports activity, then runs short callbacks — so idle connections cost memory but no threads or CPU.',
        detailedAnswer: [
          'Thread-per-connection servers pay stack memory and context switches per client.',
          'Node keeps per-connection state as small JS objects and kernel socket buffers.',
          'Throughput depends on keeping each callback short — CPU work blocks all connections.',
          'Scale beyond one core with cluster/multiple processes behind a load balancer.',
          'Limits: file descriptors (`ulimit -n`), memory per connection, CPU per message.',
        ],
        followUp: 'What would make this model fall over?',
        trap: 'Crediting the thread pool for handling connections.',
      },
      {
        category: 'nodejs', kind: 'concept', difficulty: 'advanced', topic: 'Async I/O',
        question: 'Is file I/O in Node.js truly asynchronous at the operating-system level?',
        shortAnswer: 'Generally no. libuv performs blocking file syscalls on thread-pool threads and reports completion to the event loop, because readiness APIs like epoll treat regular files as always ready. To your JavaScript it is asynchronous; to the OS it is blocking I/O on another thread.',
        detailedAnswer: [
          'epoll/kqueue cannot meaningfully wait on regular files; Windows IOCP can, but libuv uses the pool for consistency.',
          'Every `fs` async call occupies a pool thread for its duration.',
          'A single `readFile` is several pool tasks (open, fstat, read chunks, close).',
          'Newer kernels offer io_uring; libuv has experimented with it for some fs operations on Linux, but you should not rely on it.',
          'Implication: slow disks or network file systems can saturate the 4-thread pool and delay dns.lookup and crypto too.',
        ],
        followUp: 'How would you size UV_THREADPOOL_SIZE for a service that mostly reads from NFS?',
        trap: 'Claiming the kernel notifies Node when file data is ready, as it does for sockets.',
      },
    ],
  },
};

export default content;
