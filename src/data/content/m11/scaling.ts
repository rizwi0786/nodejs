import type { ModuleContent } from '../../../types';
import {
  bullets, code, dedent, diagram, flow, interviewTip, section, steps, table, text, warn,
} from '../helpers';

const content: Partial<ModuleContent> = {
  // ───────────────────────────────────────────────────────────
  'cluster-module': {
    summary: 'The cluster module lets a primary process fork N worker processes that share one listening port; the primary distributes connections (round-robin by default except on Windows) and should restart workers that die.',
    topics: ['cluster', 'cluster.isPrimary', 'isMaster deprecated', 'round-robin', 'SCHED_RR', 'SCHED_NONE', 'shared port', 'sticky sessions', 'worker restart', 'availableParallelism'],
    sections: [
      section('introduction', undefined,
        text("One Node process runs your JavaScript on one core. On an 8-core server, seven cores sit idle. `node:cluster` starts several copies of your server that all accept connections on the same port."),
      ),
      section('definition', 'Definition',
        bullets(
          "**Primary** — the process you start; it forks workers with `cluster.fork()` and usually runs no HTTP server itself.",
          "**Workers** — full Node processes (via `child_process.fork`) running the same script with `cluster.isPrimary === false`.",
          "`cluster.isPrimary` (Node 16+) replaces the deprecated `cluster.isMaster`.",
          "**Scheduling** — `cluster.SCHED_RR` (primary accepts and hands sockets round-robin; default everywhere except Windows) or `cluster.SCHED_NONE` (workers accept directly; OS decides).",
        ),
        warn("Workers do **not** share memory. In-process caches, rate-limit counters, sessions and WebSocket rooms exist separately in each worker — move shared state to Redis or a database."),
      ),
      section('why', 'Why',
        bullets(
          "Use all cores for throughput with no code changes in request handlers.",
          "Process-level fault tolerance: one worker crashing does not stop the others.",
          "Rolling restarts: replace workers one at a time for zero-downtime deploys.",
        ),
      ),
      section('internals', 'How a shared port works',
        steps(
          "A worker calls `server.listen(3000)`. Instead of binding, it asks the primary over IPC for a handle.",
          "**SCHED_RR**: the primary binds and listens itself; on each new connection it picks the next worker and sends it the socket handle over IPC.",
          "**SCHED_NONE**: the primary shares the listening socket handle; all workers call `accept()` and the OS kernel decides who wins (historically unbalanced on Linux).",
          "Set policy with `cluster.schedulingPolicy = cluster.SCHED_NONE` before forking, or env `NODE_CLUSTER_SCHED_POLICY=rr|none`.",
          "The primary watches `'exit'` events and is responsible for forking replacements.",
        ),
        diagram('cluster', 'Primary distributes connections on one port to forked workers.'),
      ),
      section('example', 'Production-shaped cluster',
        code({
          title: 'server.js',
          code: dedent(`
            import cluster from 'node:cluster';
            import http from 'node:http';
            import { availableParallelism } from 'node:os';

            if (cluster.isPrimary) {
              const n = availableParallelism();
              console.log(\`primary \${process.pid} forking \${n} workers\`);
              for (let i = 0; i < n; i++) cluster.fork();

              cluster.on('exit', (worker, code, signal) => {
                if (worker.exitedAfterDisconnect) return;          // intentional (rolling restart)
                console.log(\`worker \${worker.process.pid} died (\${signal || code}); restarting\`);
                setTimeout(() => cluster.fork(), 1000);             // back off to avoid crash loops
              });
            } else {
              http.createServer((req, res) => res.end(\`handled by \${process.pid}\\n\`))
                .listen(3000, () => console.log(\`worker \${process.pid} listening\`));
            }
          `),
          expectedOutput: 'primary 5100 forking 4 workers\nworker 5101 listening\nworker 5103 listening\nworker 5102 listening\nworker 5104 listening\n(pids and order vary)',
          explanation: [
            'Each worker re-runs the file; `cluster.isPrimary` decides the role.',
            '`exitedAfterDisconnect` is true when *you* called `worker.disconnect()` — skip auto-restart then.',
            'A delayed re-fork prevents a tight crash loop from burning CPU if the app fails at boot.',
          ],
          versionNote: 'cluster.isPrimary: Node 16+. os.availableParallelism(): Node 18.14+ / 19.4+.',
        }),
        code({
          title: 'Rolling restart (zero downtime)',
          code: dedent(`
            async function rollingRestart() {
              for (const w of Object.values(cluster.workers)) {
                const fresh = cluster.fork();
                await new Promise((r) => fresh.once('listening', r));   // new one ready first
                w.disconnect();                                          // stop accepting, finish in-flight
                await new Promise((r) => w.once('exit', r));
              }
            }
            process.on('SIGHUP', rollingRestart);
          `),
          explanation: ['Capacity never drops below N: a new worker must be listening before an old one is disconnected.'],
        }),
      ),
      section('real-world', 'Real-world backend usage',
        bullets(
          "**Sticky sessions** are required for Socket.IO with HTTP long-polling (and any protocol with multi-request handshakes) — all requests of one client must reach the same worker. Use `@socket.io/sticky` (third-party) or a load balancer with IP/cookie affinity.",
          "In Kubernetes, the common choice is **one process per container** and scale with replicas — the orchestrator does what cluster does, with better isolation.",
          "PM2's cluster mode (third-party) is built on `node:cluster`.",
        ),
        table('Ways to use multiple cores', ['Approach', 'Shared port', 'Restarts', 'Best for'], [
          ['node:cluster', 'Yes (primary)', 'You write it', 'Single VM, no orchestrator'],
          ['PM2 cluster mode', 'Yes', 'Built-in', 'VMs, simple ops'],
          ['N containers + load balancer', 'LB distributes', 'Orchestrator', 'Kubernetes / ECS'],
          ['Worker threads', 'No (one server)', 'Your pool', 'CPU-bound tasks inside one service'],
        ]),
      ),
      section('mistakes', 'Common mistakes',
        code({
          title: 'Wrong vs right: per-worker state',
          code: dedent(`
            // Wrong: each worker has its own counter → limit is N times higher than intended
            const hits = new Map();
            function rateLimit(ip) { hits.set(ip, (hits.get(ip) ?? 0) + 1); return hits.get(ip) <= 100; }

            // Right: shared counter in Redis
            async function rateLimitShared(ip) {
              const n = await redis.incr(\`rl:\${ip}\`);
              if (n === 1) await redis.expire(\`rl:\${ip}\`, 60);
              return n <= 100;
            }
          `),
        }),
        bullets(
          "Using `cluster.isMaster` in new code (deprecated since Node 16).",
          "Forking more workers than cores — context switching lowers throughput.",
          "Restarting instantly in a loop when the app crashes on startup.",
          "Running cluster inside each Kubernetes pod *and* scaling replicas without accounting for CPU limits.",
        ),
      ),
      section('interview', 'Interview angle',
        interviewTip("Expect: \"How do workers share a port?\" (primary owns the socket and passes connections round-robin) and \"What breaks?\" (in-memory state, sessions, WebSockets → sticky sessions + Redis)."),
      ),
      section('practice', 'Practice',
        text("Cluster a server that returns `process.pid`. Hit it 20 times with `curl` and observe round-robin. Kill one worker with `kill -9` and confirm it respawns."),
      ),
      section('summary', 'Summary',
        bullets(
          "Primary forks workers; workers share a port via the primary.",
          "Round-robin by default (not on Windows); SCHED_NONE lets the OS choose.",
          "No shared memory — externalize state; sticky sessions for stateful protocols.",
          "Restart dead workers with backoff; roll restarts for zero downtime.",
        ),
      ),
    ],
    revisionNotes: [
      'cluster.isPrimary (Node 16+); isMaster deprecated.',
      'Default SCHED_RR except Windows; NODE_CLUSTER_SCHED_POLICY=rr|none.',
      'Workers are separate processes — no shared memory.',
      "Restart on 'exit' unless worker.exitedAfterDisconnect.",
      'Sticky sessions needed for Socket.IO polling / stateful handshakes.',
      'In Kubernetes prefer 1 process per container + replicas.',
    ],
    quiz: [
      {
        kind: 'mcq', difficulty: 'intermediate',
        prompt: 'On Linux, how does the cluster module distribute new connections by default?',
        options: ['Workers race on accept() and the kernel picks', 'The primary accepts and hands sockets to workers round-robin', 'Random selection', 'Least-connections'],
        answer: 1,
        explanation: 'SCHED_RR is the default on all platforms except Windows. Racing on accept() is SCHED_NONE, which tends to be unbalanced.',
      },
      {
        kind: 'scenario', difficulty: 'advanced',
        prompt: 'After enabling 4 cluster workers, users report being logged out randomly. Sessions use express-session with the default MemoryStore. Fix?',
        options: ['Use SCHED_NONE', 'Move sessions to a shared store such as Redis (connect-redis)', 'Increase cookie maxAge', 'Use cluster.isMaster'],
        answer: 1,
        explanation: 'Each worker has its own MemoryStore; requests hitting a different worker do not find the session. Sticky routing would mask it but a shared store is the real fix. Scheduling policy does not provide affinity.',
      },
      {
        kind: 'find-bug', difficulty: 'intermediate',
        prompt: 'What is the problem with this restart logic?',
        code: "cluster.on('exit', () => cluster.fork());",
        options: ['fork must be awaited', 'It restarts even intentional disconnects and loops tightly if the app crashes at boot', 'exit never fires for workers', 'fork is only allowed once'],
        answer: 1,
        explanation: 'Check worker.exitedAfterDisconnect to skip intentional shutdowns and add a delay/backoff to avoid a CPU-burning crash loop.',
      },
    ],
    interview: [
      {
        category: 'nodejs', kind: 'concept', difficulty: 'intermediate', topic: 'Cluster',
        question: 'How can several cluster workers listen on the same port?',
        shortAnswer: 'Workers do not bind the port themselves: their listen() call is forwarded to the primary over IPC; the primary owns the listening socket and either passes accepted connections round-robin (default) or shares the handle so workers accept directly.',
        detailedAnswer: [
          'SCHED_RR: primary accepts, sends each connection handle to the next worker.',
          'SCHED_NONE: listening handle shared; OS chooses who accepts.',
          'Default is RR except on Windows.',
          'Each worker is a separate process with its own memory and event loop.',
        ],
        followUp: 'Why was round-robin made the default on Linux?',
        trap: 'Saying the workers share memory or a single event loop.',
      },
      {
        category: 'advanced', kind: 'scenario', difficulty: 'advanced', topic: 'Cluster',
        question: 'You cluster a WebSocket + Socket.IO server across 8 workers and connections start failing during the handshake. Why, and how do you fix it?',
        shortAnswer: 'Socket.IO starts with HTTP long-polling requests that must hit the same worker, but round-robin spreads them across workers; enable sticky sessions and use the Redis adapter so broadcasts reach clients connected to other workers.',
        detailedAnswer: [
          'The session id created by worker A is unknown to worker B → 400 "Session ID unknown".',
          'Sticky routing by connection/IP/cookie (@socket.io/sticky or LB affinity) fixes the handshake.',
          'Alternatively force transports: ["websocket"] to skip polling.',
          'Cross-worker emits need @socket.io/redis-adapter (or cluster adapter).',
        ],
        followUp: 'What does the Redis adapter actually do?',
        trap: 'Thinking cluster workers share Socket.IO rooms automatically.',
      },
    ],
  },

  // ───────────────────────────────────────────────────────────
  'multi-core-processing': {
    summary: 'Node scales across cores in three ways — more processes (cluster, PM2, containers) for request throughput, worker threads for CPU-heavy tasks inside a process, and the libuv pool for native work — and you pick by workload.',
    topics: ['multi-core', 'availableParallelism', 'horizontal scaling', 'vertical scaling', 'Amdahl', 'CPU limits', 'container cpu quota', 'process vs thread'],
    sections: [
      section('introduction', undefined,
        text("\"Node is single-threaded\" is true only for *your JavaScript on one event loop*. A production Node deployment routinely keeps every core busy — the question is which mechanism you use."),
      ),
      section('definition', 'Definition',
        table('Multi-core mechanisms', ['Mechanism', 'Unit', 'Memory', 'Scales', 'Typical use'], [
          ['cluster / PM2', 'Process', 'Separate', 'Request throughput', 'Stateless HTTP APIs on one VM'],
          ['Containers / replicas', 'Process per container', 'Separate', 'Across machines too', 'Kubernetes, ECS'],
          ['worker_threads', 'Thread (isolate)', 'Separate heaps, optional SAB', 'CPU work per request', 'Image, PDF, parsing'],
          ['libuv thread pool', 'C++ thread', 'Native', 'fs, crypto, zlib, dns.lookup', 'Automatic'],
          ['child_process', 'Process', 'Separate', 'External tools', 'ffmpeg, isolation'],
        ]),
      ),
      section('why', 'Why it matters',
        bullets(
          "Cost: a 4-core VM running one Node process wastes ~75% of what you pay for.",
          "Latency: CPU-heavy requests block everyone unless offloaded.",
          "Scale-out beyond one machine requires stateless processes anyway — design for it from day one.",
        ),
      ),
      section('internals', 'Sizing the process count',
        steps(
          "Get usable cores with `os.availableParallelism()` — it respects CPU affinity, unlike `os.cpus().length`.",
          "In containers, CPU **quota** (`--cpus=2`, Kubernetes `limits.cpu`) may be lower than visible cores; base worker counts on the quota.",
          "Throughput scales roughly linearly with processes until you hit a shared bottleneck (DB, Redis, network) — **Amdahl's law**.",
          "Leave headroom: thread pool threads, GC helper threads and the OS also need CPU.",
        ),
        diagram('node-architecture', 'Each process has its own V8 + libuv; cores are used via multiple processes and threads.'),
        flow(['Is the work CPU-bound per request?: Yes → worker pool', 'Need more request throughput?: processes = cores (cluster/PM2/replicas)', 'Need isolation or another binary?: child_process', 'Mostly I/O?: one loop per core is enough'], { title: 'Decision guide', direction: 'vertical' }),
      ),
      section('example', 'Measuring the scaling',
        code({
          title: 'Benchmark one process vs cluster',
          language: 'bash',
          code: dedent(`
            # 1 process
            node server.js &
            npx autocannon -c 100 -d 20 http://localhost:3000/api/items

            # 4 workers
            WORKERS=4 node cluster.js &
            npx autocannon -c 100 -d 20 http://localhost:3000/api/items
          `),
          expectedOutput: "1 process : Req/Sec avg 11,240  Latency p99 21 ms\n4 workers : Req/Sec avg 38,900  Latency p99 7 ms\n(illustrative — ~3.5x, not 4x, because of shared overhead)",
          explanation: [
            '`autocannon` (third-party) drives load with 100 concurrent connections for 20 s.',
            'Near-linear but not perfect scaling: the kernel, autocannon itself and shared resources use CPU.',
            'If throughput stops growing, the bottleneck has moved (DB pool, Redis, network).',
          ],
        }),
        code({
          title: 'Container-aware worker count',
          code: dedent(`
            import { availableParallelism } from 'node:os';
            // Prefer an explicit setting from the deployment (matches the CPU quota)
            const workers = Number(process.env.WEB_CONCURRENCY) || availableParallelism();
            console.log('starting', workers, 'workers');
          `),
          expectedOutput: 'starting 2 workers\n(with WEB_CONCURRENCY=2 set by the deployment)',
          explanation: ['`WEB_CONCURRENCY` is a common convention (used by several PaaS platforms) for passing the right process count.'],
        }),
      ),
      section('real-world', 'Real-world backend usage',
        bullets(
          "Kubernetes: 1 Node process per pod with `requests.cpu: 1` and HPA on CPU or loop delay; scale pods, not workers.",
          "Single VM: PM2 cluster with `instances: 'max'`.",
          "Mixed workload: web processes serve HTTP; a separate worker deployment consumes a BullMQ queue for heavy jobs.",
        ),
      ),
      section('mistakes', 'Common mistakes',
        bullets(
          "Using `os.cpus().length` inside a container limited to 1 CPU → 16 workers fighting over one core.",
          "Adding processes when the database is the bottleneck — throughput stays flat and DB connections multiply (each process has its own pool).",
          "Forgetting that pool size × processes = total DB connections.",
        ),
        code({
          title: 'Wrong vs right: DB connections per process',
          code: dedent(`
            // Wrong: 16 processes × pool max 20 = 320 connections → Postgres max_connections exceeded
            const pool = new Pool({ max: 20 });

            // Right: divide a global budget across processes
            const budget = Number(process.env.DB_CONN_BUDGET ?? 100);
            const pool2 = new Pool({ max: Math.max(2, Math.floor(budget / workers)) });
          `),
        }),
      ),
      section('interview', 'Interview angle',
        interviewTip("When asked \"Node is single-threaded, so how do you use 32 cores?\" — list processes for throughput, workers for CPU tasks, libuv pool for native I/O, and mention the shared-state and DB-connection consequences."),
      ),
      section('practice', 'Practice',
        text("Run your API with 1, 2, 4 and 8 processes against the same Postgres. Plot req/s and find where it stops scaling. Identify the new bottleneck."),
      ),
      section('summary', 'Summary',
        bullets(
          "Processes for request throughput, threads for CPU tasks, libuv pool for native work.",
          "Size by `availableParallelism()` or the container's CPU quota.",
          "Watch shared bottlenecks and total DB connections.",
          "Orchestrators replace cluster in containerized deployments.",
        ),
      ),
    ],
    revisionNotes: [
      'os.availableParallelism() > os.cpus().length (respects affinity).',
      'Container CPU quota can be lower than visible cores.',
      'Throughput scaling limited by shared bottlenecks (Amdahl).',
      'Total DB connections = processes × pool size.',
      'K8s: one process per pod, scale replicas.',
    ],
    quiz: [
      {
        kind: 'scenario', difficulty: 'advanced',
        prompt: 'Going from 4 to 8 cluster workers gives no throughput gain and DB CPU is at 95%. Next step?',
        options: ['16 workers', 'Optimize queries/add caching or read replicas — the DB is the bottleneck', 'Raise UV_THREADPOOL_SIZE', 'Switch to worker threads'],
        answer: 1,
        explanation: 'The bottleneck moved to the database; more Node processes only add connections and contention.',
      },
      {
        kind: 'mcq', difficulty: 'intermediate',
        prompt: 'Why prefer os.availableParallelism() over os.cpus().length?',
        options: ['It is faster to call', 'It reflects the CPUs the process may actually use (affinity), and does not allocate CPU info objects', 'It returns the container memory', 'cpus() is removed'],
        answer: 1,
        explanation: 'availableParallelism uses libuv uv_available_parallelism, which accounts for affinity masks. Note neither reads cgroup CPU quota reliably, so container deployments should pass an explicit count.',
      },
    ],
    interview: [
      {
        category: 'advanced', kind: 'concept', difficulty: 'advanced', topic: 'Multi-core',
        question: 'Node.js runs JavaScript on a single thread — how do you fully utilize a 32-core server?',
        shortAnswer: 'Run multiple Node processes (cluster, PM2 or containers) for request throughput, offload CPU-heavy tasks to worker-thread pools, and let the libuv thread pool handle native fs/crypto/zlib work — with shared state moved to Redis/DB.',
        detailedAnswer: [
          'One event loop per process → N processes ≈ N cores for HTTP work.',
          'Worker threads for CPU-bound tasks inside a request.',
          'libuv pool sized for blocking native work.',
          'Externalize sessions, caches, rate limits; budget DB connections per process.',
          'Measure: scaling stops at shared bottlenecks.',
        ],
        followUp: 'How would this change on Kubernetes?',
        trap: 'Answering only "use worker threads" for HTTP throughput.',
      },
      {
        category: 'advanced', kind: 'scenario', difficulty: 'advanced', topic: 'Multi-core',
        question: 'A containerized service limited to 2 CPUs starts 16 cluster workers and shows high latency and CPU throttling. What went wrong?',
        shortAnswer: 'The worker count was derived from the host\'s visible cores rather than the container CPU quota, so 16 processes compete for 2 CPUs and get throttled by the CFS quota; set the count from the quota (or run one process per container and scale replicas).',
        detailedAnswer: [
          'Visible cores ≠ cgroup CPU limit.',
          'CFS throttling pauses the whole container when quota is exhausted → latency spikes.',
          'Each worker also has its own heap and DB pool → wasted memory/connections.',
          'Pass WEB_CONCURRENCY or similar from the deployment.',
        ],
        followUp: 'Which metric would show CFS throttling?',
        trap: 'Assuming more processes always means more throughput.',
      },
    ],
  },

  // ───────────────────────────────────────────────────────────
  'thread-pool': {
    summary: "libuv's thread pool (default 4 threads, max 1024) runs blocking native work — fs, dns.lookup, async crypto, zlib — and can become a hidden bottleneck; size it with UV_THREADPOOL_SIZE before the pool is first used.",
    topics: ['libuv thread pool', 'UV_THREADPOOL_SIZE', 'fs', 'dns.lookup', 'crypto.pbkdf2', 'scrypt', 'zlib', 'pool saturation', 'dns.resolve'],
    sections: [
      section('introduction', undefined,
        text("Your JS is on one thread, but `fs.readFile`, `crypto.scrypt` and `dns.lookup` don't block it — they run on a small, shared C++ thread pool. With only 4 threads, 5 slow operations means the 5th waits."),
      ),
      section('definition', 'Definition',
        table('What uses the thread pool', ['Uses the pool', 'Does NOT use the pool'], [
          ['All async fs APIs (except fs.watch-style watchers)', 'TCP/UDP sockets, HTTP (epoll/kqueue/IOCP)'],
          ['dns.lookup() — used by http.get, net.connect with hostnames', 'dns.resolve*() (c-ares, network based)'],
          ['crypto.pbkdf2, scrypt, randomBytes (async), randomFill, generateKeyPair', 'Synchronous *Sync APIs (they block the main thread instead)'],
          ['zlib async (gzip, brotli)', 'Timers, setImmediate'],
          ['Some native addons (via uv_queue_work)', 'Worker threads (own threads)'],
        ]),
        bullets(
          "Default size **4**; maximum **1024** (libuv 1.30+).",
          "Set with the `UV_THREADPOOL_SIZE` environment variable.",
          "The pool is created lazily on first use and its size is fixed for the life of the process.",
        ),
      ),
      section('why', 'Why it matters',
        bullets(
          "Login endpoints doing `scrypt`/`pbkdf2` can saturate 4 threads, delaying unrelated `fs` reads and DNS lookups.",
          "Slow network filesystems (NFS, EFS) hold threads for a long time.",
          "`dns.lookup` sharing the pool means outbound HTTP calls stall when the pool is busy.",
        ),
      ),
      section('internals', 'How a pooled operation flows',
        steps(
          "JS calls `crypto.pbkdf2(..., cb)` → Node creates a `uv_work_t` request and calls `uv_queue_work`.",
          "The request waits in libuv's queue until one of the pool threads is free.",
          "The thread runs the blocking C++ work (hashing, `read()` syscall, `getaddrinfo`).",
          "On completion it signals the loop via `uv_async_send`; the callback runs on the main thread in the **poll** phase.",
          "If all threads are busy, latency = queue wait + work time — invisible in your JS profile.",
        ),
        diagram('thread-pool', 'Main thread queues work; 4 libuv threads execute it and post completions back.'),
      ),
      section('example', 'Seeing saturation',
        code({
          title: '6 hashes on a 4-thread pool',
          code: dedent(`
            import crypto from 'node:crypto';
            const start = Date.now();
            for (let i = 1; i <= 6; i++) {
              crypto.pbkdf2('secret', 'salt', 300_000, 64, 'sha512', () => {
                console.log(\`hash \${i} done at \${Date.now() - start} ms\`);
              });
            }
          `),
          expectedOutput: 'hash 1 done at 412 ms\nhash 3 done at 415 ms\nhash 2 done at 417 ms\nhash 4 done at 419 ms\nhash 5 done at 818 ms\nhash 6 done at 821 ms\n(timings vary; note the two batches)',
          explanation: [
            'Four hashes run in parallel and finish together (~400 ms).',
            'Hashes 5 and 6 waited in the queue, so they finish at roughly double the time.',
            'With `UV_THREADPOOL_SIZE=6` (and ≥ 6 cores) all six would finish around 400 ms.',
          ],
        }),
        code({
          title: 'Setting the size correctly',
          language: 'bash',
          code: dedent(`
            # Right: Reliable: set in the environment before Node starts
            UV_THREADPOOL_SIZE=16 node server.js

            # Caution: Fragile: assigning inside JS only works if nothing has used the pool yet
            #   process.env.UV_THREADPOOL_SIZE = '16'   // at the very top of the entry file
          `),
          explanation: [
            'The pool size is read once, when the first work item is queued.',
            'Loaders, config readers or ESM resolution may touch `fs` before your line runs — then the change silently has no effect.',
            'On Windows it must be set before the process starts.',
          ],
        }),
      ),
      section('real-world', 'Real-world backend usage',
        bullets(
          "Raise the pool (e.g. 8–16) for services doing many concurrent fs operations on network storage, or heavy async crypto/zlib.",
          "Don't raise it to fix CPU-bound hashing beyond core count — threads then compete for CPU; scale processes instead.",
          "Use `dns.resolve4` or a caching resolver / keep-alive agents to reduce `dns.lookup` pressure for outbound HTTP.",
          "Prefer streaming compression at the reverse proxy (nginx/CDN) to keep zlib off the pool.",
        ),
      ),
      section('mistakes', 'Common mistakes',
        bullets(
          "Believing network I/O (HTTP, DB sockets) uses the thread pool — it uses the OS event mechanism.",
          "Setting `UV_THREADPOOL_SIZE` deep inside a module after imports have run.",
          "Setting it to 1024 \"to be safe\" — memory per thread stack (~8 MB virtual on Linux) and contention increase.",
        ),
        code({
          title: 'Wrong vs right: sync crypto in a handler',
          code: dedent(`
            // Wrong: blocks the event loop itself (not the pool)
            const hash = crypto.scryptSync(password, salt, 64);

            // Right: runs on the pool; loop stays free
            const hash2 = await promisify(crypto.scrypt)(password, salt, 64);
          `),
        }),
      ),
      section('interview', 'Interview angle',
        interviewTip("Name the four pool users (fs, dns.lookup, crypto, zlib), the default (4), and the env var — and explicitly say network sockets don't use it. Bonus: the \"set before first use\" gotcha."),
      ),
      section('practice', 'Practice',
        text("Run the 6-hash example with `UV_THREADPOOL_SIZE` = 2, 4 and 8 and graph completion times. Then add an `fs.readFile` during the hashes and measure its delay."),
      ),
      section('summary', 'Summary',
        bullets(
          "Pool: fs, dns.lookup, async crypto, zlib; default 4, max 1024.",
          "Network I/O does not use it.",
          "Saturation shows as unexplained latency for fs/DNS/crypto.",
          "Set `UV_THREADPOOL_SIZE` in the environment before start.",
        ),
      ),
    ],
    revisionNotes: [
      'Default 4 threads, max 1024.',
      'Users: fs, dns.lookup, crypto.pbkdf2/scrypt/randomBytes async, zlib async.',
      'Not users: sockets/HTTP, dns.resolve (c-ares), timers.',
      'UV_THREADPOOL_SIZE must be set before pool first used — set in env.',
      'Completions run on the main thread in the poll phase.',
    ],
    quiz: [
      {
        kind: 'mcq', difficulty: 'intermediate',
        prompt: 'Which call does NOT use the libuv thread pool?',
        options: ['fs.promises.readFile', 'crypto.scrypt', 'dns.lookup', 'http.request socket reads'],
        answer: 3,
        explanation: 'Socket I/O uses epoll/kqueue/IOCP on the main loop. The others are blocking at OS level and run on pool threads (dns.lookup wraps getaddrinfo).',
      },
      {
        kind: 'find-bug', difficulty: 'advanced',
        prompt: 'Why does the pool still have 4 threads?',
        code: "// server.js (ESM)\nimport config from './config.js';   // reads config.json with fs\nprocess.env.UV_THREADPOOL_SIZE = '16';\n// ...start server",
        options: ['The value must be a number', 'Static imports run first; config.js used fs, creating the pool with the default size', 'UV_THREADPOOL_SIZE only works on Windows', 'Max size is 8'],
        answer: 1,
        explanation: 'ES imports are evaluated before the importing module body, so the pool was created before the assignment. Set the variable in the environment instead.',
      },
      {
        kind: 'scenario', difficulty: 'advanced',
        prompt: 'During a login spike, outbound HTTP calls to a partner API (by hostname) become slow, though the partner is healthy. Likely cause?',
        options: ['TCP keep-alive is off', 'scrypt hashes saturate the thread pool and dns.lookup for the hostname queues behind them', 'The partner is rate limiting', 'Too many timers'],
        answer: 1,
        explanation: 'dns.lookup shares the 4-thread pool with crypto. Raising the pool size, caching DNS or keep-alive agents reduce the impact.',
      },
    ],
    interview: [
      {
        category: 'nodejs', kind: 'concept', difficulty: 'advanced', topic: 'Thread pool',
        question: 'What runs on the libuv thread pool, and how do you tell it is the bottleneck?',
        shortAnswer: 'Async fs operations, dns.lookup, async crypto (pbkdf2, scrypt, randomBytes) and zlib run on a default 4-thread pool; it is the bottleneck when those operations show latency growing with concurrency while the event loop itself is not blocked.',
        detailedAnswer: [
          'Network sockets do not use the pool.',
          'Symptoms: fs/crypto/DNS latency comes in "batches" of pool size; loop delay stays low.',
          'Benchmark by raising UV_THREADPOOL_SIZE and comparing.',
          'Size is fixed after first use; max 1024.',
        ],
        followUp: 'Why might raising it to 64 make things worse?',
        trap: 'Saying HTTP requests are handled by the thread pool.',
      },
      {
        category: 'advanced', kind: 'concept', difficulty: 'advanced', topic: 'Thread pool',
        question: 'Why can setting process.env.UV_THREADPOOL_SIZE inside your code fail to take effect?',
        shortAnswer: 'libuv reads the variable once when the pool is lazily initialized on the first queued work item; if any fs, crypto, DNS or zlib call ran earlier (imports, config loading, the module loader), the pool already exists with the old size.',
        detailedAnswer: [
          'ESM static imports execute before the importing module body.',
          'Some platforms (Windows) need it set before process start.',
          'Reliable options: environment, Docker ENV, PM2 env, a wrapper script.',
          'Verify by timing a batch of pbkdf2 calls.',
        ],
        followUp: 'How would you verify the effective pool size?',
        trap: 'Assuming the size can be changed at runtime.',
      },
    ],
  },

  // ───────────────────────────────────────────────────────────
  'cpu-bound-vs-i-o-bound-tasks': {
    summary: 'I/O-bound work waits on the network or disk and Node overlaps it cheaply; CPU-bound work occupies the thread and must be chunked, offloaded to workers, or moved to another service.',
    topics: ['CPU-bound', 'I/O-bound', 'concurrency vs parallelism', 'offloading', 'chunking', 'setImmediate yielding', 'decision guide'],
    sections: [
      section('introduction', undefined,
        text("Node shines when requests spend most of their time waiting. It struggles when a request spends 200 ms computing. Classifying work correctly is the first step of every Node performance decision."),
      ),
      section('definition', 'Definition',
        table('CPU-bound vs I/O-bound', ['', 'CPU-bound', 'I/O-bound'], [
          ['Time spent', 'Executing instructions', 'Waiting on DB, network, disk'],
          ['Examples', 'Hashing, image resize, big JSON, regex, sorting, compression', 'SQL queries, HTTP calls, Redis, S3, file reads'],
          ['Effect on event loop', 'Blocks it while running', 'Loop is free while waiting'],
          ['Scales with', 'More cores (parallelism)', 'More concurrency (async)'],
          ['Node tool', 'worker_threads pool, child process, separate service', 'async/await, streams, connection pools'],
          ['Symptom when overloaded', 'High loop delay, one core at 100%', 'Pool/connection exhaustion, upstream latency'],
        ]),
      ),
      section('why', 'Why it matters',
        bullets(
          "10 ms of CPU per request caps one process at ~100 req/s, no matter how fast your DB is.",
          "Pure I/O handlers can serve thousands of concurrent requests per process.",
        ),
      ),
      section('internals', 'Concurrency vs parallelism',
        bullets(
          "**Concurrency**: many tasks in progress, interleaved on one thread — what the event loop gives I/O work.",
          "**Parallelism**: tasks executing simultaneously on multiple cores — what CPU work needs.",
          "An `await` yields the thread only while the awaited operation is pending; the code between awaits runs synchronously.",
        ),
        flow([
          'Profile: where does the time go?',
          'Mostly waiting?: I/O-bound → async, pooling, caching, batching',
          'Mostly computing, < ~10 ms?: optimize algorithm / chunk with setImmediate',
          'Computing, > ~10 ms per request?: worker pool',
          'Heavy & not latency-critical?: background job queue',
        ], { title: 'Decision guide', direction: 'vertical' }),
      ),
      section('example', 'Chunking long CPU loops',
        code({
          title: 'Yielding between chunks lets other callbacks run',
          code: dedent(`
            function processInChunks(items, size, done) {
              let i = 0;
              function next() {
                const end = Math.min(i + size, items.length);
                for (; i < end; i++) { /* CPU work per item */ }
                console.log('processed up to', i);
                if (i < items.length) setTimeout(next, 0);  // yield to the loop
                else done();
              }
              next();
            }

            setTimeout(() => console.log('request handled'), 0);
            processInChunks(new Array(30).fill(1), 10, () => console.log('done'));
          `),
          expectedOutput: 'processed up to 10\nrequest handled\nprocessed up to 20\nprocessed up to 30\ndone',
          explanation: [
            'The first chunk runs synchronously.',
            'Yielding with a timer lets the already-queued "request" callback run before the next chunk.',
            'In Node, `setImmediate(next)` is the better yield (no 1 ms timer clamp); `setTimeout` is used here so it runs in the browser playground.',
            'Chunking keeps latency fair but does **not** use more cores — total CPU time is the same.',
          ],
          runnable: true,
        }),
        code({
          title: 'I/O-bound: overlap, don\'t serialize',
          code: dedent(`
            // Wrong: 3 sequential round trips: ~300 ms
            const user = await getUser(id);
            const orders = await getOrders(id);
            const prefs = await getPrefs(id);

            // Right: independent I/O in parallel: ~100 ms
            const [user2, orders2, prefs2] = await Promise.all([getUser(id), getOrders(id), getPrefs(id)]);
          `),
          explanation: ['For I/O-bound work the win is concurrency, not threads.'],
        }),
      ),
      section('real-world', 'Real-world backend usage',
        bullets(
          "Typical CRUD API → I/O-bound → one loop per core is plenty.",
          "Report export → CPU + I/O → enqueue a background job, email a link.",
          "Image upload → CPU-bound resize → worker pool or a dedicated image service.",
          "Password hashing → CPU-bound but native async (`crypto.scrypt`) → thread pool; watch pool size.",
        ),
      ),
      section('mistakes', 'Common mistakes',
        bullets(
          "Assuming `async function` makes CPU code non-blocking.",
          "Adding worker threads to an I/O-bound service.",
          "Sequential `await` in a loop for independent I/O calls (use `Promise.all` with a concurrency limit).",
        ),
        code({
          title: 'Wrong vs right: CPU in an async function',
          code: dedent(`
            // Wrong: still blocks for the whole sort
            async function topScores(rows) { return rows.sort((a, b) => b.score - a.score).slice(0, 10); }

            // Right: push the sort into the database
            const top = await db.query('SELECT * FROM scores ORDER BY score DESC LIMIT 10');
          `),
        }),
      ),
      section('interview', 'Interview angle',
        interviewTip("Give a crisp heuristic: if the request is *waiting*, use async concurrency; if it's *computing* for more than a few ms, move it off the loop (worker pool or queue)."),
      ),
      section('practice', 'Practice',
        text("Classify: (a) generating a 10k-row CSV from SQL, (b) resizing a 20 MB image, (c) calling 3 microservices, (d) validating a 5 KB JSON body. For each choose a strategy."),
      ),
      section('summary', 'Summary',
        bullets(
          "I/O-bound → concurrency on one loop; CPU-bound → parallelism on more cores.",
          "Chunking improves fairness, not throughput.",
          "Use the decision guide: profile → classify → async / chunk / worker pool / queue.",
        ),
      ),
    ],
    revisionNotes: [
      'I/O-bound = waiting; CPU-bound = computing.',
      'Async helps I/O; CPU needs workers/processes.',
      'Code between awaits is synchronous.',
      'Chunk with setImmediate for fairness.',
      'Promise.all for independent I/O.',
    ],
    quiz: [
      {
        kind: 'mcq', difficulty: 'beginner',
        prompt: 'Which task is CPU-bound?',
        options: ['Querying Postgres', 'Downloading a file from S3', 'Resizing an image with a pure-JS library', 'Waiting for a Redis reply'],
        answer: 2,
        explanation: 'Resizing executes instructions continuously on the thread. The others mostly wait for remote systems.',
      },
      {
        kind: 'predict-output', difficulty: 'intermediate',
        prompt: 'What prints first?',
        code: "setTimeout(() => console.log('timer'), 0);\n(async () => {\n  for (let i = 0; i < 3e8; i++);\n  console.log('loop');\n})();",
        options: ['timer', 'loop', 'They interleave', 'Nothing until both finish'],
        answer: 1,
        explanation: 'The async function body runs synchronously (no await), so the CPU loop finishes and logs before the event loop reaches the timer.',
      },
    ],
    interview: [
      {
        category: 'nodejs', kind: 'concept', difficulty: 'beginner', topic: 'CPU vs I/O',
        question: 'What is the difference between CPU-bound and I/O-bound work, and why does it matter in Node?',
        shortAnswer: 'CPU-bound work spends its time computing and blocks the single JS thread; I/O-bound work spends its time waiting for disks or networks, which Node handles concurrently without blocking.',
        detailedAnswer: [
          'Node is efficient for many concurrent I/O waits.',
          'CPU work stalls all other requests on that process.',
          'Fix CPU work with worker threads, child processes or a separate service.',
          'Fix I/O latency with concurrency, caching and pooling.',
        ],
        followUp: 'Does making a function async make CPU work non-blocking?',
        trap: 'Saying async/await runs code on another thread.',
      },
      {
        category: 'advanced', kind: 'scenario', difficulty: 'advanced', topic: 'CPU vs I/O',
        question: 'An endpoint takes 2 seconds: 1.6 s waiting on three microservices called sequentially and 0.4 s building a large Excel file. How do you redesign it?',
        shortAnswer: 'Parallelize the independent service calls with Promise.all (I/O-bound), and move the Excel generation off the event loop — a worker pool for interactive use, or a background job that delivers a download link.',
        detailedAnswer: [
          'Sequential awaits → total = sum; parallel → max of the three.',
          'Add timeouts and caching to the upstream calls.',
          '0.4 s of CPU blocks every other request on the process; offload it.',
          'If not needed synchronously: 202 Accepted + job id + notification.',
          'Stream the file to object storage instead of buffering in memory.',
        ],
        followUp: 'How do you limit concurrency if the service calls are per-item in a loop of 500?',
        trap: 'Putting the whole handler in a worker thread, including the I/O calls.',
      },
    ],
  },
};

export default content;
