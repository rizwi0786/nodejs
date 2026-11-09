import type { ModuleContent } from '../../../types';
import {
  bullets, code, dedent, diagram, flow, interviewTip, note, section, steps, table, text,
} from '../helpers';

const content: Partial<ModuleContent> = {
  // ───────────────────────────────────────────────────────────
  'socket-io': {
    summary: 'Socket.IO (third-party) is a real-time framework on top of Engine.IO that adds rooms, namespaces, acknowledgements, automatic reconnection and fallbacks — it is not plain WebSocket and needs its own client, plus the Redis adapter to scale.',
    topics: ['Socket.IO', 'Engine.IO', 'rooms', 'namespaces', 'acknowledgements', 'emitWithAck', 'broadcast', 'middleware', 'Redis adapter', 'sticky sessions', 'reconnection', 'connection state recovery'],
    sections: [
      section('introduction', undefined,
        text("Raw WebSockets give you a pipe; you build rooms, reconnection, request/response and fallbacks yourself. Socket.IO ships all of that — at the price of its own protocol."),
      ),
      section('definition', 'Definition',
        bullets(
          "Server package `socket.io`, client `socket.io-client` — both third-party.",
          "**Engine.IO** handles transport: starts with HTTP long-polling, upgrades to WebSocket when possible (or WebTransport).",
          "A plain WebSocket client **cannot** talk to a Socket.IO server (and vice versa) — packets carry Socket.IO framing.",
          "**Namespace** (`io.of('/admin')`) — a separate communication channel with its own middleware and events over the same connection.",
          "**Room** — a server-side group of sockets inside a namespace (`socket.join('order:42')`); clients don't see rooms.",
          "**Acknowledgement** — a callback (or promise via `emitWithAck`) for request/response over events.",
        ),
        table('ws vs Socket.IO', ['', 'ws', 'Socket.IO'], [
          ['Protocol', 'Standard WebSocket', 'Custom on top of Engine.IO'],
          ['Client', 'Any WebSocket client / browser API', 'socket.io-client required'],
          ['Rooms / namespaces', 'Build yourself', 'Built in'],
          ['Acks', 'Build yourself', 'Built in'],
          ['Reconnect + buffering', 'Build yourself', 'Built in'],
          ['Fallback when WS blocked', 'No', 'HTTP long-polling'],
          ['Overhead', 'Minimal', 'Higher (framing, heartbeats)'],
          ['Multi-node', 'Your own pub/sub', 'Adapters (Redis, cluster, Postgres...)'],
        ]),
      ),
      section('why', 'Why',
        bullets(
          "Fast development of chat, notifications, collaborative features with rooms and acks.",
          "Works behind restrictive proxies thanks to polling fallback.",
          "Adapters make broadcasting across many server instances a one-line change.",
        ),
      ),
      section('internals', 'Connection and scaling',
        steps(
          "Client sends `GET /socket.io/?EIO=4&transport=polling` → server returns a session id (`sid`).",
          "Further polling requests carry the `sid`; then the client attempts a WebSocket upgrade with the same `sid`.",
          "If those requests hit **different** server instances, the `sid` is unknown → handshake fails. Hence **sticky sessions** (or `transports: ['websocket']` only).",
          "`io.to(room).emit()` asks the **adapter** to deliver. The default in-memory adapter only knows local sockets.",
          "`@socket.io/redis-adapter` publishes each broadcast over Redis Pub/Sub; every instance delivers to its local sockets in that room.",
        ),
        flow(['Instance A: io.to(room).emit(msg)', 'Redis adapter: PUBLISH', 'Instances B, C: receive via SUBSCRIBE', 'Each: emit to local sockets in room'], { title: 'Redis adapter fan-out', direction: 'horizontal' }),
      ),
      section('example', 'Rooms, acks and the Redis adapter',
        code({
          title: 'server.js',
          code: dedent(`
            import { createServer } from 'node:http';
            import { Server } from 'socket.io';                          // third-party
            import { createAdapter } from '@socket.io/redis-adapter';   // third-party
            import { createClient } from 'redis';

            const httpServer = createServer();
            const io = new Server(httpServer, { cors: { origin: 'https://app.example.com' } });

            const pub = createClient({ url: process.env.REDIS_URL });
            const sub = pub.duplicate();
            await Promise.all([pub.connect(), sub.connect()]);
            io.adapter(createAdapter(pub, sub));                       // broadcasts reach all instances

            io.use(async (socket, next) => {                           // auth middleware
              try { socket.data.user = await verifyToken(socket.handshake.auth.token); next(); }
              catch { next(new Error('unauthorized')); }
            });

            io.on('connection', (socket) => {
              socket.join(\`user:\${socket.data.user.id}\`);

              socket.on('order:subscribe', async (orderId, ack) => {
                if (!(await canView(socket.data.user, orderId))) return ack({ ok: false });
                socket.join(\`order:\${orderId}\`);
                ack({ ok: true });
              });
            });

            // anywhere (e.g. a BullMQ worker with @socket.io/redis-emitter, or this server):
            export const notifyOrder = (orderId, status) => io.to(\`order:\${orderId}\`).emit('order:status', { orderId, status });

            const admin = io.of('/admin');                             // namespace with its own middleware
            admin.use(requireAdmin);

            httpServer.listen(3000);
          `),
          explanation: [
            'Middleware with `io.use` runs once per connection — reject unauthenticated clients there.',
            'A personal room `user:<id>` makes "send to this user on all devices" trivial.',
            'The ack callback lets the client know whether the subscription was allowed.',
            'With the Redis adapter, `io.to(room).emit` reaches sockets connected to any instance.',
          ],
          versionNote: 'Socket.IO v4. emitWithAck (promise-based acks) since 4.6.',
        }),
        code({
          title: 'client.js',
          code: dedent(`
            import { io } from 'socket.io-client';
            const socket = io('https://api.example.com', { auth: { token }, transports: ['websocket'] });

            const res = await socket.timeout(5000).emitWithAck('order:subscribe', 42);
            console.log('subscribed:', res.ok);
            socket.on('order:status', ({ orderId, status }) => console.log(orderId, status));
          `),
          expectedOutput: 'subscribed: true\n42 shipped',
          explanation: [
            "`transports: ['websocket']` skips polling, which removes the sticky-session requirement (but loses the fallback).",
            '`timeout(5000)` rejects if the server never acknowledges.',
          ],
        }),
      ),
      section('real-world', 'Real-world backend usage',
        bullets(
          "Order/delivery tracking, chat, live comments, collaborative editing presence.",
          "Emit from background workers using `@socket.io/redis-emitter` (third-party) without running a Socket.IO server there.",
          "Behind nginx/ALB with multiple instances: sticky sessions (cookie or IP hash) unless you force WebSocket transport.",
          "Connection state recovery (v4.6+) can restore rooms and missed events after brief disconnects.",
        ),
      ),
      section('mistakes', 'Common mistakes',
        code({
          title: 'Wrong vs right: trusting client-chosen rooms',
          code: dedent(`
            // Wrong: any user can join any order room and read its events
            socket.on('join', (room) => socket.join(room));

            // Right: authorize every join
            socket.on('order:subscribe', async (orderId, ack) => {
              if (!(await canView(socket.data.user, orderId))) return ack({ ok: false });
              socket.join(\`order:\${orderId}\`); ack({ ok: true });
            });
          `),
        }),
        bullets(
          "Connecting with a plain `WebSocket` to a Socket.IO server and wondering why it fails.",
          "Scaling to several instances without an adapter → users only receive events from their own instance.",
          "Using polling + round-robin load balancing without stickiness → `Session ID unknown`.",
          "Emitting huge payloads to big rooms — fan-out cost multiplies.",
        ),
      ),
      section('interview', 'Interview angle',
        interviewTip("Clarify that Socket.IO ≠ WebSocket, then explain rooms vs namespaces, acks, and the two scaling requirements: sticky sessions (for polling) and an adapter (for broadcasts)."),
      ),
      section('practice', 'Practice',
        text("Run two Socket.IO instances on ports 3001/3002 with the Redis adapter. Connect one client to each, join the same room and verify a broadcast from instance A reaches the client on B."),
      ),
      section('summary', 'Summary',
        bullets(
          "Third-party framework over Engine.IO; not interoperable with plain WebSocket.",
          "Rooms (server-side groups), namespaces (channels), acks (request/response).",
          "Scale with the Redis adapter; sticky sessions if polling is enabled.",
          "Authorize connections and every room join.",
        ),
      ),
    ],
    revisionNotes: [
      'Socket.IO = Engine.IO transport (polling → websocket upgrade) + its own protocol.',
      'Plain WebSocket clients cannot connect.',
      'Namespaces: io.of(path); rooms: socket.join(name), io.to(name).emit().',
      'Acks: callback or emitWithAck (4.6+).',
      '@socket.io/redis-adapter for multi-instance broadcasts.',
      'Sticky sessions required with polling.',
    ],
    quiz: [
      {
        kind: 'mcq', difficulty: 'intermediate',
        prompt: 'What is the difference between a room and a namespace in Socket.IO?',
        options: ['They are the same', 'A namespace is a separate channel with its own middleware/events that clients connect to; a room is a server-side group of sockets within a namespace', 'Rooms are client-side only', 'Namespaces require Redis'],
        answer: 1,
        explanation: 'Clients explicitly connect to namespaces (io("/admin")); rooms are joined only by the server and are invisible to clients.',
      },
      {
        kind: 'scenario', difficulty: 'advanced',
        prompt: 'With 3 Socket.IO instances behind a round-robin load balancer and the Redis adapter, clients log "Session ID unknown" during connection. Fix?',
        options: ['Add a second Redis', 'Enable sticky sessions (or restrict transports to websocket)', 'Increase pingTimeout', 'Use namespaces'],
        answer: 1,
        explanation: 'The adapter handles broadcasts, not the Engine.IO handshake. Polling requests must reach the instance that created the session.',
      },
    ],
    interview: [
      {
        category: 'advanced', kind: 'concept', difficulty: 'advanced', topic: 'Socket.IO',
        question: 'What does the Socket.IO Redis adapter do, and what does it not solve?',
        shortAnswer: 'It forwards broadcasts (io.to(room).emit, io.emit) through Redis Pub/Sub so every instance delivers them to its local sockets; it does not route the initial HTTP long-polling handshake, so you still need sticky sessions if polling is enabled.',
        detailedAnswer: [
          'The default adapter keeps rooms in memory per process.',
          'Redis adapter publishes packets with room metadata; subscribers filter locally.',
          'Also supports fetchSockets/serverSideEmit across nodes.',
          'Does not persist messages: offline clients miss them.',
          'Sticky sessions or websocket-only transport for handshakes.',
        ],
        followUp: 'How would a background worker emit to a room without running a Socket.IO server?',
        trap: 'Believing the adapter removes the need for sticky sessions.',
      },
      {
        category: 'advanced', kind: 'concept', difficulty: 'intermediate', topic: 'Socket.IO',
        question: 'Is Socket.IO a WebSocket implementation? What are the practical consequences?',
        shortAnswer: 'No — it is a framework with its own protocol that uses WebSocket (or HTTP long-polling) as a transport, so you must use the Socket.IO client on both ends, and you gain rooms, acks, reconnection and fallbacks at some overhead.',
        detailedAnswer: [
          'Engine.IO negotiates transport and heartbeats.',
          'Packets have Socket.IO framing (event name + args + ack id).',
          'Plain WebSocket clients and Socket.IO servers are not interoperable.',
          'Pick ws for raw performance or interoperability; Socket.IO for features.',
        ],
        followUp: 'When would you choose plain ws instead?',
        trap: 'Saying any browser WebSocket can connect to a Socket.IO server.',
      },
    ],
  },

  // ───────────────────────────────────────────────────────────
  'graceful-shutdown': {
    summary: 'Graceful shutdown handles SIGTERM/SIGINT by failing readiness, stopping new connections with server.close(), draining in-flight requests (closing idle keep-alive sockets), closing DB pools and queue workers, and force-exiting after a timeout.',
    topics: ['SIGTERM', 'SIGINT', 'server.close', 'closeIdleConnections', 'closeAllConnections', 'keep-alive', 'in-flight requests', 'readiness probe', 'terminationGracePeriodSeconds', 'force exit timeout', 'zero-downtime deploy'],
    sections: [
      section('introduction', undefined,
        text("Every deploy, autoscale-in and node drain kills your process. If you exit immediately, in-flight requests fail and half-done jobs are lost. If you never exit, the orchestrator SIGKILLs you anyway. Graceful shutdown is the controlled path in between."),
      ),
      section('definition', 'Definition',
        bullets(
          "**SIGTERM** — polite termination request (Kubernetes, Docker stop, systemd, PM2 on some platforms). **SIGINT** — Ctrl+C.",
          "**SIGKILL** — cannot be caught; sent after the grace period (Kubernetes default `terminationGracePeriodSeconds: 30`).",
          "`server.close(cb)` — stop accepting **new** connections; `cb` runs when all existing connections have closed.",
          "`server.closeIdleConnections()` — close keep-alive sockets not serving a request; `server.closeAllConnections()` — close all (use as last resort).",
        ),
        note("closeIdleConnections/closeAllConnections were added in Node 18.2. Since Node 19, `server.close()` also closes idle connections automatically."),
      ),
      section('why', 'Why',
        bullets(
          "Zero failed requests during rolling deploys.",
          "No lost/stalled jobs (BullMQ marks them stalled, they re-run later).",
          "Clean DB disconnects instead of connection resets and aborted transactions.",
        ),
      ),
      section('internals', 'Shutdown sequence',
        steps(
          "Receive SIGTERM → set `shuttingDown = true`; readiness endpoint starts returning **503** so the load balancer stops sending traffic.",
          "Optionally wait a few seconds for the LB / endpoints to propagate (Kubernetes removes the pod asynchronously).",
          "`server.close()` → no new connections. Responses in progress complete; set `Connection: close` on them so keep-alive sockets don't linger.",
          "Close idle keep-alive sockets (`closeIdleConnections`, automatic in Node 19+).",
          "Stop consumers: `await worker.close()` (BullMQ), stop Kafka/RabbitMQ consumers, close WebSockets with code 1001.",
          "Close resources: DB pools (`pool.end()`), Redis (`quit()`), flush logs/metrics/traces.",
          "Exit with `process.exitCode = 0`; a **force-exit timer** (`unref`'d) kills the process if something hangs, before SIGKILL arrives.",
        ),
        flow(['SIGTERM', 'Readiness → 503', 'server.close(): no new conns', 'Drain in-flight requests', 'Close workers, WS, DB, Redis', 'Exit 0', 'Timeout?: force exit 1'], { title: 'Graceful shutdown', direction: 'horizontal' }),
      ),
      section('example', 'A complete shutdown handler',
        code({
          title: 'shutdown.js',
          code: dedent(`
            import http from 'node:http';

            let shuttingDown = false;
            const server = http.createServer(app);
            app.get('/readyz', (req, res) => res.status(shuttingDown ? 503 : 200).end());
            app.use((req, res, next) => { if (shuttingDown) res.set('Connection', 'close'); next(); });
            server.listen(3000);

            async function shutdown(signal) {
              if (shuttingDown) return;                  // ignore repeated signals
              shuttingDown = true;
              console.log(\`\${signal} received, draining\`);

              const force = setTimeout(() => {
                console.error('forced exit after timeout');
                server.closeAllConnections();
                process.exit(1);
              }, 25_000);
              force.unref();                             // don't keep the process alive just for this

              await new Promise((r) => setTimeout(r, 5_000)); // let the LB observe readiness=503
              await new Promise((resolve) => {
                server.close(resolve);                   // resolves when in-flight requests finish
                server.closeIdleConnections();           // Node 18.2+ (automatic in 19+)
              });
              await worker?.close();                      // BullMQ: finish active jobs
              await db.end();
              await redis.quit();
              console.log('clean shutdown');
              process.exitCode = 0;                       // let the loop empty and exit naturally
            }

            process.on('SIGTERM', () => shutdown('SIGTERM'));
            process.on('SIGINT', () => shutdown('SIGINT'));
          `),
          expectedOutput: 'SIGTERM received, draining\nclean shutdown',
          explanation: [
            'The force timer (25 s) is shorter than Kubernetes\' 30 s grace period, so we exit on our terms.',
            '`unref()` ensures the timer itself doesn\'t keep the process alive after a clean shutdown.',
            '`Connection: close` on in-flight responses prevents clients reusing sockets that are about to close.',
            'Setting `process.exitCode` instead of calling `process.exit()` lets pending writes (logs) flush.',
          ],
          versionNote: 'closeIdleConnections / closeAllConnections: Node 18.2+.',
        }),
        code({
          title: 'Kubernetes settings that pair with it',
          language: 'yaml',
          code: dedent(`
            spec:
              terminationGracePeriodSeconds: 30
              containers:
                - name: api
                  readinessProbe:
                    httpGet: { path: /readyz, port: 3000 }
                    periodSeconds: 2
                  lifecycle:
                    preStop:
                      exec: { command: ['sleep', '5'] }   # alternative to the in-app delay
          `),
          explanation: ['Run `node` as PID 1 directly (or with `tini`/`--init`) — `npm start` as PID 1 may not forward SIGTERM to Node.'],
        }),
      ),
      section('real-world', 'Real-world backend usage',
        bullets(
          "Docker: `CMD [\"node\", \"server.js\"]` (exec form) so Node receives signals; shell form wraps it in `/bin/sh -c` which may swallow SIGTERM.",
          "Long requests (uploads, SSE, WebSockets) need explicit handling: notify clients and close them, or they will block `server.close()` until the force timeout.",
          "Libraries like `http-terminator` or `@godaddy/terminus` (third-party) package this logic.",
        ),
      ),
      section('mistakes', 'Common mistakes',
        code({
          title: 'Wrong vs right',
          code: dedent(`
            // Wrong: kills in-flight requests and DB transactions
            process.on('SIGTERM', () => process.exit(0));

            // Wrong: never exits if keep-alive sockets or WebSockets stay open (Node < 19)
            process.on('SIGTERM', () => server.close(() => process.exit(0)));

            // Right: close, drain idle sockets, clean up, with a force timeout
            process.on('SIGTERM', () => shutdown('SIGTERM'));
          `),
        }),
        bullets(
          "No force-exit timer → SIGKILL after the grace period, losing logs.",
          "Readiness keeps returning 200 during shutdown → LB keeps routing to a closing server.",
          "Running via `npm start` in containers so the signal never reaches Node.",
          "Forgetting to stop queue workers → their jobs become stalled and re-run.",
        ),
      ),
      section('interview', 'Interview angle',
        interviewTip("Give the order: readiness off → stop accepting → drain → close consumers and pools → exit, with a timeout below the orchestrator's grace period. Mention keep-alive connections and `closeIdleConnections`."),
      ),
      section('practice', 'Practice',
        text("Add a `/slow` route that takes 10 s. Start a request, send SIGTERM, and verify the request completes, new requests are refused, and the process exits 0."),
      ),
      section('summary', 'Summary',
        bullets(
          "Handle SIGTERM and SIGINT once; flip readiness to 503.",
          "`server.close()` + close idle keep-alive sockets; drain in-flight requests.",
          "Close workers, sockets, DB and Redis; flush telemetry.",
          "Force-exit timer shorter than the grace period; prefer `process.exitCode`.",
        ),
      ),
    ],
    revisionNotes: [
      'SIGTERM = polite; SIGKILL after grace period (K8s default 30 s).',
      'server.close() stops new connections; callback after all close.',
      'closeIdleConnections/closeAllConnections Node 18.2+; close() closes idle in Node 19+.',
      'Readiness 503 before closing.',
      'Force-exit timer with unref().',
      'Exec-form CMD / node as PID 1 to receive signals.',
    ],
    quiz: [
      {
        kind: 'mcq', difficulty: 'intermediate',
        prompt: 'What does server.close() do in Node.js?',
        options: ['Immediately destroys all sockets', 'Stops accepting new connections; its callback fires once existing connections end', 'Exits the process', 'Pauses the event loop'],
        answer: 1,
        explanation: 'It only stops listening. In-flight requests continue; keep-alive sockets may keep it open (Node 19+ closes idle ones automatically).',
      },
      {
        kind: 'find-bug', difficulty: 'advanced',
        prompt: 'In Kubernetes, this pod always takes the full 30 s to stop and logs are lost. Why?',
        code: "// Dockerfile: CMD npm start\nprocess.on('SIGTERM', async () => {\n  await new Promise((r) => server.close(r));\n  process.exit(0);\n});",
        options: ['server.close is synchronous', 'npm (shell form) as PID 1 may not forward SIGTERM to node, and open keep-alive connections can block close without a timeout', 'process.exit is async', 'SIGTERM cannot be caught'],
        answer: 1,
        explanation: 'Use exec-form CMD ["node", "server.js"], close idle connections, and add a force-exit timer below the grace period.',
      },
      {
        kind: 'scenario', difficulty: 'advanced',
        prompt: 'During rolling deploys a few requests fail with connection refused right after SIGTERM. What is missing?',
        options: ['A larger heap', 'Failing readiness and waiting briefly before server.close(), so the load balancer stops routing first', 'More replicas', 'closeAllConnections immediately'],
        answer: 1,
        explanation: 'Endpoint removal is asynchronous; if the server stops listening first, the LB still sends traffic for a moment. closeAllConnections would make it worse.',
      },
    ],
    interview: [
      {
        category: 'advanced', kind: 'scenario', difficulty: 'advanced', topic: 'Graceful shutdown',
        question: 'Design graceful shutdown for a Node API that also runs BullMQ workers and holds a Postgres pool, deployed on Kubernetes.',
        shortAnswer: 'On SIGTERM, flip readiness to 503 and wait briefly, call server.close() and close idle keep-alive connections, await worker.close() so active jobs finish, end the DB pool and Redis connections, flush telemetry, and exit 0 — with an unref\'d force-exit timer shorter than terminationGracePeriodSeconds.',
        detailedAnswer: [
          'Idempotent shutdown function guarded against repeated signals.',
          'Connection: close on in-flight responses.',
          'WebSockets/SSE closed explicitly (code 1001) or they block the drain.',
          'Exec-form CMD so node receives the signal.',
          'Force exit with code 1 and closeAllConnections if the drain hangs.',
        ],
        followUp: 'What happens to a BullMQ job if the worker is SIGKILLed mid-processing?',
        trap: 'Calling process.exit(0) immediately in the SIGTERM handler.',
      },
      {
        category: 'nodejs', kind: 'concept', difficulty: 'advanced', topic: 'Graceful shutdown',
        question: 'Why might server.close() never call its callback, and how do you fix it?',
        shortAnswer: 'Because existing connections are still open — typically idle HTTP keep-alive sockets, long-polling/SSE responses or WebSockets; close idle connections (closeIdleConnections, automatic since Node 19), send Connection: close, close long-lived streams explicitly, and use closeAllConnections after a timeout.',
        detailedAnswer: [
          'close() only stops the listener; it waits for every socket to end.',
          'Keep-alive sockets can stay idle for keepAliveTimeout (default 5 s) or longer from clients.',
          'Upgraded WebSocket sockets are not tracked as HTTP requests — close them via your ws server.',
          'A force timer guarantees exit before SIGKILL.',
        ],
        followUp: 'What is the difference between closeIdleConnections and closeAllConnections?',
        trap: 'Assuming server.close() terminates active requests.',
      },
    ],
  },

  // ───────────────────────────────────────────────────────────
  'process-management': {
    summary: 'Production Node processes need a supervisor, meaningful exit codes, and crash handlers that log and exit (never continue) on uncaughtException or unhandledRejection, letting the supervisor restart a clean process.',
    topics: ['exit codes', 'process.exitCode', 'process.exit', 'uncaughtException', 'unhandledRejection', 'crash-only design', 'supervisor', 'systemd', 'Docker restart policy', 'signals', 'beforeExit', 'exit event'],
    sections: [
      section('introduction', undefined,
        text("Processes crash. The question is whether they crash *loudly and cleanly* and get restarted, or limp along in a corrupted state. Process management is the set of conventions that make crashes boring."),
      ),
      section('definition', 'Definition',
        table('Common Node exit codes', ['Code', 'Meaning'], [
          ['0', 'Success'],
          ['1', 'Uncaught fatal exception (also default for unhandled rejections since Node 15)'],
          ['5', 'Fatal V8 error (e.g. heap out of memory → abort; often reported by the OS as 134/SIGABRT)'],
          ['9', 'Invalid argument (unknown CLI option)'],
          ['13', 'Unsettled top-level await (ESM entry never finished)'],
          ['128 + n', 'Killed by signal n as reported by shells/orchestrators: 130 = SIGINT, 137 = SIGKILL (OOM-kill), 143 = SIGTERM'],
        ]),
        bullets(
          "**Supervisor** — something that restarts the process: Kubernetes, Docker `--restart`, systemd `Restart=always`, PM2.",
          "`process.exitCode = n` sets the code used when the loop empties; `process.exit(n)` exits immediately (pending async writes may be lost).",
        ),
      ),
      section('why', 'Why log-and-exit',
        bullets(
          "After an uncaught exception, invariants may be broken: half-written state, leaked locks, open transactions. Node's docs explicitly say it is not safe to resume normal operation.",
          "A clean restart (crash-only design) is cheap; a zombie serving wrong data is expensive.",
          "Exit codes tell the orchestrator (and you) *why* it died.",
        ),
      ),
      section('internals', 'Process lifecycle events',
        steps(
          "Uncaught throw in any callback → `'uncaughtException'` listeners run; with none, Node prints the stack and exits with 1.",
          "Rejected promise with no handler by end of the microtask drain → `'unhandledRejection'`; default mode `throw` (Node 15+) turns it into an uncaught exception.",
          "`'beforeExit'` fires when the loop empties (not on explicit `process.exit` or crashes) — you may schedule more work there.",
          "`'exit'` fires on every exit; handlers must be **synchronous** (the loop is gone).",
          "Signals (`SIGTERM`, `SIGINT`, `SIGHUP`) are delivered as events if you add listeners; otherwise the default action terminates the process.",
        ),
      ),
      section('example', 'Crash handlers done right',
        code({
          title: 'process-handlers.js',
          code: dedent(`
            import { logger } from './logger.js';

            process.on('uncaughtException', (err, origin) => {
              logger.fatal({ err, origin }, 'uncaught exception — exiting');
              // flush logs, then exit; don't try to keep serving
              logger.flush?.();
              process.exit(1);
            });

            process.on('unhandledRejection', (reason) => {
              // rethrow so it goes through the single fatal path above
              throw reason instanceof Error ? reason : new Error(String(reason));
            });

            process.on('exit', (code) => {
              console.log(\`exiting with code \${code}\`);   // sync only
            });

            Promise.reject(new Error('db connection lost'));
          `),
          expectedOutput: '{"level":60,"msg":"uncaught exception — exiting","origin":"uncaughtException","err":{"message":"db connection lost",...}}\nexiting with code 1',
          explanation: [
            'The rejection is rethrown inside the handler, so it reaches `uncaughtException` with origin `uncaughtException`.',
            'We log with full context (structured logger such as pino — third-party) and exit 1; the supervisor restarts us.',
            'The `exit` handler runs synchronously as the last step.',
            'If you need cleanup, do it with a short timeout — never wait indefinitely in a crash handler.',
          ],
        }),
        code({
          title: 'Exit codes in shell and Docker',
          language: 'bash',
          code: dedent(`
            node -e "process.exitCode = 3"; echo $?
            node -e "throw new Error('boom')" 2>/dev/null; echo $?
            docker run --memory=64m node:22 node -e "const a=[]; for(;;) a.push(new Array(1e6))"; echo $?
          `),
          expectedOutput: '3\n1\n137\n(the last may also be 134 if V8 aborts before the OOM killer acts)',
          explanation: [
            '`exitCode` is used when the process ends naturally.',
            'An uncaught throw exits 1.',
            '137 = 128 + 9 (SIGKILL) — the kernel/cgroup OOM killer.',
          ],
        }),
      ),
      section('real-world', 'Real-world backend usage',
        bullets(
          "Kubernetes restarts the container (`restartPolicy: Always`) and backs off on crash loops (`CrashLoopBackOff`).",
          "systemd unit: `Restart=on-failure`, `RestartSec=2`, `KillSignal=SIGTERM`, `TimeoutStopSec=30`.",
          "Alert on restart counts and on exit code 137 (memory) vs 1 (bug).",
          "Use `--unhandled-rejections=strict` in tests to catch sloppy promise handling early.",
        ),
        table('--unhandled-rejections modes', ['Mode', 'Behaviour'], [
          ['throw (default, Node 15+)', "Emit 'unhandledRejection'; if no listener, raise as uncaught exception"],
          ['strict', 'Raise as uncaught exception immediately'],
          ['warn', 'Print a warning only'],
          ['none', 'Silence'],
          ['warn-with-error-code', 'Warning + exit code 1 at exit'],
        ]),
      ),
      section('mistakes', 'Common mistakes',
        code({
          title: 'Wrong vs right: swallowing fatal errors',
          code: dedent(`
            // Wrong: keeps a possibly corrupted process alive
            process.on('uncaughtException', (err) => console.error(err));

            // Right: log with context, exit non-zero, let the supervisor restart
            process.on('uncaughtException', (err) => { logger.fatal(err); process.exit(1); });
          `),
        }),
        bullets(
          "Using the deprecated `domain` module for error isolation.",
          "Async work in `'exit'` handlers (it never runs).",
          "Calling `process.exit()` right after `console.log` to a pipe — output may be truncated; prefer `process.exitCode`.",
          "Running without any supervisor (a bare `node server.js &` on a VM).",
        ),
      ),
      section('interview', 'Interview angle',
        interviewTip("The expected answer to \"what do you do in uncaughtException?\" is: log, flush, exit non-zero, and rely on a supervisor — plus prevent it by handling errors at the source."),
      ),
      section('practice', 'Practice',
        text("Write a script that exits with 0, 1, 13 (top-level await on a never-resolving promise) and 130 (Ctrl+C with no handler). Check each with `echo $?`."),
      ),
      section('summary', 'Summary',
        bullets(
          "Always run under a supervisor.",
          "uncaughtException / unhandledRejection: log and exit, never continue.",
          "Know exit codes: 0, 1, 13, 137, 143.",
          "Prefer `process.exitCode`; `exit` handlers are sync only.",
        ),
      ),
    ],
    revisionNotes: [
      'Exit 1 = uncaught exception; 13 = unsettled top-level await.',
      '137 = SIGKILL (OOM), 143 = SIGTERM, 130 = SIGINT.',
      'Unhandled rejections crash by default since Node 15 (mode throw).',
      'uncaughtException: log + exit(1), never resume.',
      "'exit' handlers synchronous only; 'beforeExit' when loop empties.",
      'process.exitCode preferred over process.exit().',
    ],
    quiz: [
      {
        kind: 'mcq', difficulty: 'intermediate',
        prompt: 'Since Node 15, what happens by default when a promise rejection is never handled?',
        options: ['A warning is printed and the process continues', 'It is raised as an uncaught exception and the process exits with code 1', 'Nothing', 'The promise retries'],
        answer: 1,
        explanation: "The default --unhandled-rejections mode is 'throw'. Before Node 15 it was only a warning, which is the tempting wrong answer.",
      },
      {
        kind: 'predict-output', difficulty: 'advanced',
        prompt: 'What is printed?',
        code: "process.on('exit', () => {\n  setTimeout(() => console.log('later'), 0);\n  console.log('exit');\n});",
        options: ['exit then later', 'exit', 'later then exit', 'Nothing'],
        answer: 1,
        explanation: "In the 'exit' event the event loop no longer runs, so the timer never fires. Only synchronous code executes.",
      },
      {
        kind: 'scenario', difficulty: 'intermediate',
        prompt: 'Pods restart with exit code 137 under load. What does that point to?',
        options: ['A JavaScript bug throwing an error', 'The process was SIGKILLed — usually the container OOM killer', 'A syntax error', 'Graceful shutdown worked'],
        answer: 1,
        explanation: '137 = 128 + 9 (SIGKILL). Check memory limits/leaks. A thrown error would exit 1.',
      },
    ],
    interview: [
      {
        category: 'nodejs', kind: 'concept', difficulty: 'intermediate', topic: 'Process management',
        question: 'What should an uncaughtException handler do in a production Node.js server?',
        shortAnswer: 'Log the error with context, flush logs/telemetry quickly, and exit with a non-zero code so a supervisor restarts a clean process — never continue serving traffic.',
        detailedAnswer: [
          'Application state may be inconsistent after an unexpected throw.',
          'Node docs: not safe to resume normal operation.',
          'Keep the handler synchronous-ish with a short timeout for cleanup.',
          'Route unhandledRejection to the same path.',
          'Fix the root cause: handle errors at the source.',
        ],
        followUp: 'How does the default behaviour for unhandled rejections differ between Node 14 and Node 15+?',
        trap: 'Using it as a global try/catch to keep the server alive.',
      },
      {
        category: 'advanced', kind: 'concept', difficulty: 'advanced', topic: 'Process management',
        question: 'What is the difference between process.exit() and setting process.exitCode, and when does it matter?',
        shortAnswer: 'process.exit() terminates synchronously right away, dropping pending async work such as buffered writes to pipes; process.exitCode only sets the code and lets the event loop finish naturally, so logs and responses flush.',
        detailedAnswer: [
          'stdout/stderr to pipes are async on POSIX — process.exit can truncate output.',
          "'exit' listeners still run with either approach.",
          'Use exitCode in CLIs and normal shutdown; process.exit only when you must stop (fatal handler, force timer).',
          'Handles that remain open (servers, timers) keep the process alive when using exitCode.',
        ],
        followUp: 'Why might a process with exitCode set never exit?',
        trap: 'Believing process.exit waits for pending promises.',
      },
    ],
  },

  // ───────────────────────────────────────────────────────────
  pm2: {
    summary: 'PM2 (third-party) is a process manager for Node: it keeps apps alive, runs them in cluster mode across cores, does zero-downtime reloads, manages logs and starts apps at boot — configured with ecosystem.config.js.',
    topics: ['PM2', 'ecosystem.config.js', 'cluster mode', 'pm2 reload', 'zero-downtime', 'pm2 logs', 'pm2 monit', 'pm2 startup', 'pm2 save', 'max_memory_restart', 'wait_ready', 'pm2-runtime', 'pm2-logrotate'],
    sections: [
      section('introduction', undefined,
        text("On a plain VM, someone has to restart your app when it crashes, run it on all cores, rotate logs and bring it back after a reboot. PM2 does all of that with one config file."),
      ),
      section('definition', 'Definition',
        bullets(
          "PM2 is an npm package (`npm i -g pm2`), not part of Node.",
          "**fork mode** — one process per app instance (default).",
          "**cluster mode** — PM2 uses `node:cluster` to run N instances sharing one port.",
          "**ecosystem.config.js** — declarative config for apps, env per environment, restart policy.",
        ),
        table('Essential commands', ['Command', 'Does'], [
          ['pm2 start ecosystem.config.js --env production', 'Start apps with env_production'],
          ['pm2 reload api', 'Zero-downtime rolling restart (cluster mode)'],
          ['pm2 restart api', 'Kill and restart (brief downtime)'],
          ['pm2 logs api --lines 100', 'Tail logs'],
          ['pm2 monit / pm2 ls', 'Live CPU/memory dashboard / process list'],
          ['pm2 startup && pm2 save', 'Generate boot script (systemd etc.) and save process list'],
          ['pm2 install pm2-logrotate', 'Rotate log files'],
        ]),
      ),
      section('why', 'Why',
        bullets(
          "Auto-restart on crash with backoff, and on memory threshold.",
          "Use all cores without writing cluster code.",
          "Zero-downtime deploys on a single VM.",
        ),
        note("In Docker/Kubernetes you usually don't need PM2 — the orchestrator restarts containers and you scale replicas. If you do use it in a container, use `pm2-runtime` (foreground) instead of `pm2 start` (daemon)."),
      ),
      section('internals', 'How reload achieves zero downtime',
        steps(
          "In cluster mode, `pm2 reload` restarts instances **one at a time**.",
          "For each instance: start a new worker → wait until it is ready → send the old one a shutdown signal (`SIGINT` by default) → wait up to `kill_timeout` → `SIGKILL` if still alive.",
          "\"Ready\" means *listening* by default, or an explicit `process.send('ready')` when `wait_ready: true` (useful if you must connect to the DB first).",
          "Because at least N−1 instances are always serving, users see no downtime — provided your app handles the shutdown signal gracefully.",
        ),
        diagram('cluster', 'PM2 cluster mode is built on node:cluster: one port, many workers.'),
      ),
      section('example', 'ecosystem.config.js',
        code({
          title: 'ecosystem.config.js',
          code: dedent(`
            module.exports = {
              apps: [
                {
                  name: 'api',
                  script: './dist/server.js',
                  instances: 'max',               // one per CPU (or a number)
                  exec_mode: 'cluster',
                  max_memory_restart: '512M',     // restart if RSS exceeds this
                  kill_timeout: 10000,            // ms to wait after SIGINT before SIGKILL
                  wait_ready: true,               // wait for process.send('ready')
                  listen_timeout: 15000,          // give up waiting for ready after 15 s
                  env: { NODE_ENV: 'development', PORT: 3000 },
                  env_production: { NODE_ENV: 'production', PORT: 8080 },
                  out_file: './logs/api.out.log',
                  error_file: './logs/api.err.log',
                  merge_logs: true,
                },
                {
                  name: 'worker',
                  script: './dist/worker.js',      // BullMQ consumer
                  instances: 2,
                  exec_mode: 'fork',
                },
              ],
            };
          `),
          explanation: [
            '`instances: \'max\'` + `exec_mode: \'cluster\'` = one worker per core sharing the port.',
            '`kill_timeout` must exceed your graceful-shutdown drain time.',
            'Separate app entries let API and queue workers scale independently.',
          ],
        }),
        code({
          title: 'Signalling readiness and handling shutdown',
          code: dedent(`
            // server.js
            await db.connect();
            server.listen(process.env.PORT, () => process.send?.('ready'));  // PM2 wait_ready

            process.on('SIGINT', async () => {      // PM2 sends SIGINT by default
              await new Promise((r) => server.close(r));
              await db.end();
              process.exit(0);
            });
          `),
          explanation: ['`process.send` exists only when started by a parent with IPC (PM2), hence the optional call.'],
        }),
        code({
          title: 'Deploy flow on a VM',
          language: 'bash',
          code: dedent(`
            pm2 start ecosystem.config.js --env production
            pm2 save                     # remember the process list
            pm2 startup                  # prints a command to install a systemd unit — run it
            # later, after git pull && npm ci && npm run build:
            pm2 reload ecosystem.config.js --env production --update-env
            pm2 ls
          `),
          expectedOutput: "┌────┬─────────┬─────────┬──────┬────────┬─────────┬──────────┐\n│ id │ name    │ mode    │ ↺    │ status │ cpu     │ memory   │\n├────┼─────────┼─────────┼──────┼────────┼─────────┼──────────┤\n│ 0  │ api     │ cluster │ 1    │ online │ 0%      │ 61.2mb   │\n│ 1  │ api     │ cluster │ 1    │ online │ 0%      │ 60.8mb   │\n│ 2  │ worker  │ fork    │ 1    │ online │ 0%      │ 55.1mb   │\n└────┴─────────┴─────────┴──────┴────────┴─────────┴──────────┘\n(abridged)",
          explanation: [
            '`--update-env` makes reload pick up changed environment variables.',
            '↺ counts restarts — a rising number signals crashes or memory restarts.',
          ],
        }),
      ),
      section('real-world', 'Real-world backend usage',
        bullets(
          "Small/medium deployments on EC2/DigitalOcean VMs: PM2 + nginx reverse proxy.",
          "`max_memory_restart` as a safety net for slow leaks (while you fix them).",
          "Ship logs to a central system (or use pm2-logrotate) — local log files fill disks.",
        ),
      ),
      section('mistakes', 'Common mistakes',
        code({
          title: 'Wrong vs right in a container',
          language: 'dockerfile',
          code: dedent(`
            # Wrong: pm2 daemonizes and the container exits immediately (PID 1 ends)
            CMD ["pm2", "start", "ecosystem.config.js"]

            # Right: foreground runtime (or simply: CMD ["node", "dist/server.js"])
            CMD ["pm2-runtime", "ecosystem.config.js", "--env", "production"]
          `),
        }),
        bullets(
          "Using `pm2 restart` for deploys instead of `pm2 reload` → brief downtime.",
          "In-memory sessions/caches with cluster mode (instances don't share memory).",
          "`kill_timeout` shorter than the drain time → in-flight requests killed.",
          "Forgetting `pm2 save` after changes → old process list resurrected on reboot.",
        ),
      ),
      section('interview', 'Interview angle',
        interviewTip("Explain reload vs restart, cluster mode built on node:cluster, wait_ready/kill_timeout tuning, and when you would *not* use PM2 (containers/orchestrators)."),
      ),
      section('practice', 'Practice',
        text("Write an ecosystem file with `instances: 2`, `wait_ready: true`. Run `autocannon` during `pm2 reload` and confirm zero non-2xx responses."),
      ),
      section('summary', 'Summary',
        bullets(
          "Third-party process manager: restarts, cluster mode, logs, startup scripts.",
          "ecosystem.config.js with env per environment.",
          "`pm2 reload` = rolling zero-downtime restart; needs graceful shutdown.",
          "In containers prefer the orchestrator, or `pm2-runtime`.",
        ),
      ),
    ],
    revisionNotes: [
      'PM2 = third-party; cluster mode built on node:cluster.',
      "instances: 'max', exec_mode: 'cluster'.",
      'reload = one-by-one zero downtime; restart = all at once.',
      "wait_ready + process.send('ready'); kill_timeout before SIGKILL.",
      'pm2 startup + pm2 save for boot persistence.',
      'Containers: pm2-runtime or plain node.',
    ],
    quiz: [
      {
        kind: 'mcq', difficulty: 'beginner',
        prompt: 'Which PM2 command performs a zero-downtime restart of a cluster-mode app?',
        options: ['pm2 restart api', 'pm2 stop api && pm2 start api', 'pm2 reload api', 'pm2 delete api'],
        answer: 2,
        explanation: 'reload replaces instances one at a time, waiting for readiness. restart kills all instances and starts them again, causing a gap.',
      },
      {
        kind: 'scenario', difficulty: 'intermediate',
        prompt: 'During pm2 reload, requests fail because new instances accept traffic before the DB is connected. Fix?',
        options: ['Increase instances', "Set wait_ready: true and call process.send('ready') after the DB connects and the server listens", 'Use fork mode', 'Lower kill_timeout'],
        answer: 1,
        explanation: 'By default PM2 considers an instance ready when it listens. wait_ready lets the app decide, so old instances are only stopped once the new one is really ready.',
      },
    ],
    interview: [
      {
        category: 'nodejs', kind: 'concept', difficulty: 'beginner', topic: 'PM2',
        question: 'What is PM2 and what problems does it solve?',
        shortAnswer: 'PM2 is a third-party process manager for Node.js that keeps applications running (auto-restart on crash), runs them across all CPU cores in cluster mode, provides zero-downtime reloads, log management and startup-on-boot scripts.',
        detailedAnswer: [
          'Configured via ecosystem.config.js.',
          'pm2 logs/monit for observability.',
          'max_memory_restart as a safety net.',
          'pm2 startup + save for persistence across reboots.',
        ],
        followUp: 'Would you use PM2 inside Kubernetes?',
        trap: 'Thinking PM2 is part of Node.js core.',
      },
      {
        category: 'advanced', kind: 'concept', difficulty: 'advanced', topic: 'PM2',
        question: 'How does pm2 reload achieve zero downtime, and what must the application do for it to work?',
        shortAnswer: 'In cluster mode PM2 replaces workers one by one: it starts a new instance, waits until it is ready (listening or process.send("ready") with wait_ready), then sends the old one SIGINT and SIGKILLs it after kill_timeout; the app must signal readiness correctly and drain in-flight requests on the shutdown signal within kill_timeout.',
        detailedAnswer: [
          'At least N−1 instances serve traffic throughout.',
          'Works because node:cluster lets the primary route connections to the remaining workers.',
          'Handle SIGINT: server.close, close DB, exit.',
          'kill_timeout > drain time; listen_timeout bounds waiting for ready.',
          'Fork mode apps cannot reload without downtime in the same way.',
        ],
        followUp: 'What changes if the app runs in fork mode with one instance?',
        trap: 'Assuming reload works without graceful shutdown handling in the app.',
      },
    ],
  },
};

export default content;
