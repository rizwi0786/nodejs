import type { InterviewQuestion } from '../../../types';
import { sc } from './helpers';

/** Scenario questions: Node runtime, performance, operations and deployment. */
export const runtimeScenarioQuestions: InterviewQuestion[] = [
  sc({
    id: 'sc-021',
    category: 'nodejs',
    difficulty: 'beginner',
    topic: 'EADDRINUSE',
    question: 'You run `npm run dev` and the server crashes with `Error: listen EADDRINUSE: address already in use :::3000`. What is happening and how do you fix it?',
    shortAnswer: 'Another process (often an old instance of the same app) is already listening on port 3000 — find and stop it, or run on a different port taken from configuration.',
    detailedAnswer: [
      'Find the owner: `lsof -i :3000` (macOS/Linux) or `netstat -ano | findstr :3000` (Windows), then stop that process.',
      'Common causes: a previous `node` process still running in another terminal, a watcher that did not kill the child, or two services configured with the same port.',
      'Read the port from config: `const port = Number(process.env.PORT) || 3000` so environments can choose.',
      'Handle the `error` event on the server to log a clear message and exit non-zero instead of an unhandled stack trace.',
      'In production, a process manager or orchestrator should own the port — not two copies of the app.',
    ],
    code: {
      language: 'javascript',
      code: `
        const server = app.listen(port, () => console.log('listening on', port));
        server.on('error', (err) => {
          if (err.code === 'EADDRINUSE') console.error('Port ' + port + ' is already in use');
          process.exit(1);
        });
      `,
    },
    followUp: 'How does the cluster module let several processes share one port?',
    trap: 'Assuming a code bug — it is an environment/port conflict.',
    relatedLessonIds: ['m03-http-module', 'm14-environment-configuration'],
  }),
  sc({
    id: 'sc-022',
    category: 'nodejs',
    difficulty: 'beginner',
    topic: 'dependencies vs devDependencies',
    question: 'The app runs locally but crashes on the production server with `Error: Cannot find module \'dotenv\'`. The deploy runs `npm ci --omit=dev`. What went wrong?',
    shortAnswer: 'A package used at runtime is listed under `devDependencies`, so production installs skip it. Move it to `dependencies` (or stop needing it in production).',
    detailedAnswer: [
      'Check `package.json`: anything `require`d by production code must be in `dependencies`.',
      '`npm ci --omit=dev` (or `NODE_ENV=production npm ci`) installs only `dependencies`.',
      'Locally it worked because a full install includes dev dependencies.',
      'For `dotenv` specifically, Node 20.6+ can load env files with `--env-file`, and production usually injects real environment variables instead.',
      'Prevent: run the production image/install in CI and start the app as a smoke test.',
    ],
    followUp: 'Which packages belong in `devDependencies`? (Test runners, linters, type definitions, build tools.)',
    trap: 'Fixing it by installing all dev dependencies in production images.',
    relatedLessonIds: ['m04-dependencies', 'm04-devdependencies', 'm14-production-builds'],
  }),
  sc({
    id: 'sc-023',
    category: 'nodejs',
    difficulty: 'beginner',
    topic: 'Blocking I/O in handlers',
    question: 'A teammate reads a template file with `fs.readFileSync` inside an Express handler. It works in testing. Should you approve the PR?',
    shortAnswer: 'No — synchronous I/O blocks the single JavaScript thread, so every other request waits while the file is read. Use `fs/promises` or, better, read it once at startup and cache it.',
    detailedAnswer: [
      'Node handles all requests on one main thread; a sync call stops the event loop until it finishes.',
      'On a fast local SSD it looks harmless, but under load or on slow network disks latency rises for *all* requests.',
      'If the file never changes, read it once at startup (sync is fine there) and keep it in memory.',
      'Otherwise use `await fs.promises.readFile(...)` so the read happens in libuv\'s thread pool.',
      'Sync APIs are fine in CLIs, build scripts and startup code — not in request paths.',
    ],
    code: {
      language: 'javascript',
      code: `
        const { readFile } = require('node:fs/promises');
        const templatePromise = readFile('./templates/email.html', 'utf8'); // read once

        app.get('/preview', async (req, res) => {
          res.type('html').send(await templatePromise);
        });
      `,
    },
    followUp: 'How would you measure whether the event loop is being blocked? (`perf_hooks.monitorEventLoopDelay`.)',
    trap: '"It is only a few milliseconds" — multiplied by concurrent requests it adds up.',
    relatedLessonIds: ['m05-blocking-vs-non-blocking-code', 'm03-fs-module'],
  }),
  sc({
    id: 'sc-024',
    category: 'nodejs',
    difficulty: 'beginner',
    topic: 'Crash recovery and alerting',
    question: 'Your Node API crashed at 3 a.m. from an uncaught exception and stayed down until someone noticed at 9 a.m. What should be in place?',
    shortAnswer: 'A supervisor that restarts the process automatically (Kubernetes, systemd, Docker restart policy or PM2), health checks, error tracking and alerting — plus fixing the root cause from the captured stack trace.',
    detailedAnswer: [
      'Run under a supervisor with a restart policy so a crash means seconds of downtime, not hours.',
      'Run more than one instance behind a load balancer so a single crash does not cause an outage.',
      'Configure health checks and uptime monitoring that page someone.',
      'Send uncaught errors to an error tracker (e.g. Sentry) with stack traces and release versions.',
      'In `uncaughtException`, log and exit — do not keep running in an unknown state; let the supervisor restart.',
      'Then fix the actual bug and add a test for it.',
    ],
    followUp: 'Why is it unsafe to continue running after an `uncaughtException`?',
    trap: 'Adding `process.on("uncaughtException", () => {})` to swallow errors.',
    relatedLessonIds: ['m11-process-management', 'm11-pm2', 'm13-error-monitoring'],
  }),
  sc({
    id: 'sc-025',
    category: 'nodejs',
    difficulty: 'beginner',
    topic: 'Reproducible installs',
    question: 'A build passes locally but fails in CI because a dependency resolved to a newer minor version with a bug. How do you make installs reproducible?',
    shortAnswer: 'Commit `package-lock.json` and use `npm ci` in CI and Docker, which installs exactly the locked versions and fails if the lock and `package.json` disagree.',
    detailedAnswer: [
      'Caret ranges like `^1.4.0` allow any 1.x ≥ 1.4.0, so a fresh `npm install` can pick a new version.',
      '`package-lock.json` pins the full dependency tree, including transitive packages.',
      '`npm ci` deletes `node_modules` and installs exactly from the lockfile; it never updates it.',
      'Pin the Node version too (`.nvmrc`, `engines`, Docker base image tag).',
      'Update dependencies deliberately (Dependabot/Renovate PRs) so CI tests each change.',
    ],
    followUp: 'Should a published library commit its lockfile? (It can, but consumers ignore it.)',
    trap: 'Pinning every version in `package.json` exactly but still running `npm install` without a lockfile — transitive deps still drift.',
    relatedLessonIds: ['m04-package-lock-json', 'm04-semantic-versioning', 'm14-ci-cd'],
  }),
  sc({
    id: 'sc-026',
    category: 'nodejs',
    difficulty: 'intermediate',
    topic: 'Unhandled promise rejections',
    question: 'After upgrading from Node 14 to Node 20, the server now crashes occasionally with an "unhandled promise rejection" that used to be just a warning. How do you deal with it?',
    shortAnswer: 'Since Node 15 an unhandled rejection crashes the process by default. Find the floating promise from the stack trace and handle it; keep a top-level `unhandledRejection` handler only to log and exit cleanly.',
    detailedAnswer: [
      'The default `--unhandled-rejections=throw` turns an unhandled rejection into an uncaught exception.',
      'Find the source: the error\'s stack trace, then look for promises that are neither awaited nor `.catch`-ed (fire-and-forget calls, `async` callbacks in `forEach`/event listeners, Express 4 async handlers).',
      'Fix each site: `await` it inside `try/catch`, add `.catch`, or forward to `next(err)` in Express.',
      'Add a process-level handler that logs with context and triggers graceful shutdown — not one that silently swallows.',
      'Prevent with lint rules (`no-floating-promises`, `no-misused-promises`) and tests for error paths.',
    ],
    code: {
      language: 'javascript',
      code: `
        process.on('unhandledRejection', (reason) => {
          logger.fatal({ err: reason }, 'unhandled rejection');
          shutdown(1); // close server, drain, then exit
        });
      `,
    },
    followUp: 'Why is `emitter.on("event", async () => { ... })` a common source of unhandled rejections?',
    trap: 'Running with `--unhandled-rejections=warn` to make the crashes go away.',
    relatedLessonIds: ['m05-error-handling-in-asynchronous-code', 'm03-process-module'],
  }),
  sc({
    id: 'sc-027',
    category: 'express-backend',
    difficulty: 'intermediate',
    topic: 'Database connection limits',
    question: 'After scaling from 2 to 12 API pods, PostgreSQL starts rejecting connections with "sorry, too many clients already". What happened and what do you change?',
    shortAnswer: 'Each pod opens its own pool, so total connections = pods × pool size, which exceeded `max_connections`. Size pools from a connection budget, add a pooler like PgBouncer, and make sure connections are released.',
    detailedAnswer: [
      'Compute the budget: 12 pods × pool `max: 20` = 240 connections, plus workers and migrations — above the default `max_connections` of 100.',
      'Lower per-pod pool size (often 5–10 is plenty for async Node) so the total fits with headroom.',
      'Check for leaks: `pool.connect()` clients that are not `release()`d in a `finally`, or one pool created per request.',
      'Put PgBouncer (transaction pooling) or a managed proxy (e.g. RDS Proxy) in front of the DB when instance counts vary with autoscaling.',
      'Set `connectionTimeoutMillis` and `idleTimeoutMillis`; monitor pool wait time and active connections.',
    ],
    code: {
      language: 'javascript',
      code: `
        const { Pool } = require('pg');
        const pool = new Pool({ max: 8, idleTimeoutMillis: 30_000, connectionTimeoutMillis: 2_000 });

        async function transfer() {
          const client = await pool.connect();
          try {
            await client.query('BEGIN');
            // ...
            await client.query('COMMIT');
          } catch (err) {
            await client.query('ROLLBACK');
            throw err;
          } finally {
            client.release(); // always release
          }
        }
      `,
    },
    followUp: 'Why can raising `max_connections` to 2,000 make the database slower?',
    trap: 'Simply raising `max_connections` or the pool size.',
    relatedLessonIds: ['m09-connection-pooling', 'm09-node-js-postgresql-integration', 'm14-horizontal-scaling'],
  }),
  sc({
    id: 'sc-028',
    category: 'nodejs',
    difficulty: 'intermediate',
    topic: 'CPU-bound work',
    question: 'An endpoint resizes uploaded images in pure JavaScript. When several users upload at once, all other endpoints become slow. How do you fix it?',
    shortAnswer: 'CPU work on the main thread blocks the event loop. Move it off the request path: use a native library (sharp) that works on the thread pool, a worker-thread pool, or better, a background job queue with separate worker processes.',
    detailedAnswer: [
      'Confirm with event-loop delay metrics or a CPU profile (`--cpu-prof`) showing the resize function hot on the main thread.',
      'Quick win: `sharp` (libvips) does the heavy lifting in native threads, not on the JS thread.',
      'For pure-JS CPU work, use a pool of `worker_threads` (e.g. Piscina) sized to the CPU cores.',
      'For best isolation, enqueue a job and process images in dedicated worker services; the API returns 202 and the client gets the result later.',
      'Limit concurrency and input size (max dimensions/megapixels) to avoid decompression-bomb images.',
    ],
    followUp: 'When would you choose `worker_threads` over `child_process` or a separate service?',
    trap: 'Wrapping the CPU work in a Promise or `async` function and expecting it to stop blocking.',
    relatedLessonIds: ['m11-cpu-bound-vs-i-o-bound-tasks', 'm11-worker-threads', 'm11-background-jobs'],
  }),
  sc({
    id: 'sc-029',
    category: 'nodejs',
    difficulty: 'intermediate',
    topic: 'Docker images',
    question: 'Your Node Docker image is 1.4 GB, rebuilds take 6 minutes even for one-line changes, and a scanner flags hundreds of OS vulnerabilities. How do you improve it?',
    shortAnswer: 'Use a slim/alpine (or distroless) base, a multi-stage build that installs production deps only, order layers so `package*.json` + `npm ci` are cached before copying source, add a `.dockerignore`, and run as a non-root user.',
    detailedAnswer: [
      'Base image: `node:22-slim` or `node:22-alpine` instead of the full Debian image; fewer packages, fewer CVEs.',
      'Copy `package.json` and `package-lock.json` first and run `npm ci` — this layer is cached until dependencies change.',
      'Multi-stage: build/compile in one stage, copy only `dist` and production `node_modules` into the final stage.',
      '`.dockerignore` excludes `node_modules`, `.git`, tests and local `.env` files.',
      'Run as the built-in `node` user, start with `node dist/server.js` (not `npm start`) so signals reach Node.',
    ],
    code: {
      language: 'dockerfile',
      code: `
        FROM node:22-slim AS build
        WORKDIR /app
        COPY package*.json ./
        RUN npm ci
        COPY . .
        RUN npm run build && npm prune --omit=dev

        FROM node:22-slim
        ENV NODE_ENV=production
        WORKDIR /app
        COPY --from=build /app/node_modules ./node_modules
        COPY --from=build /app/dist ./dist
        USER node
        CMD ["node", "dist/server.js"]
      `,
    },
    followUp: 'Why can `CMD ["npm", "start"]` break graceful shutdown?',
    trap: 'Copying the whole source before `npm ci`, which invalidates the dependency cache on every change.',
    relatedLessonIds: ['m14-dockerizing-node-js-applications', 'm14-docker-fundamentals'],
  }),
  sc({
    id: 'sc-030',
    category: 'nodejs',
    difficulty: 'intermediate',
    topic: 'Configuration validation',
    question: 'A deploy went out with `PAYMENT_API_URL` missing. The app started fine and only failed hours later when the first payment was attempted. How do you prevent this class of bug?',
    shortAnswer: 'Validate all configuration at startup against a schema and fail fast (exit non-zero) if anything is missing or malformed, so the deploy fails its health checks instead of the first customer.',
    detailedAnswer: [
      'Centralize config in one module that reads `process.env` once; the rest of the code imports typed config, never `process.env` directly.',
      'Validate with a schema (zod, envalid, joi): required keys, URL formats, numeric ports, enum values.',
      'Exit with a clear error on failure; the orchestrator will not route traffic to a pod that never becomes ready.',
      'Keep a documented `.env.example`; in CI, validate config for each environment.',
      'Remember env vars are strings: `"false"` is truthy, so parse booleans and numbers explicitly.',
    ],
    code: {
      language: 'javascript',
      code: `
        const { z } = require('zod');
        const schema = z.object({
          NODE_ENV: z.enum(['development', 'test', 'production']),
          PORT: z.coerce.number().int().default(3000),
          PAYMENT_API_URL: z.string().url(),
        });
        const parsed = schema.safeParse(process.env);
        if (!parsed.success) {
          console.error('Invalid configuration', parsed.error.flatten().fieldErrors);
          process.exit(1);
        }
        module.exports = parsed.data;
      `,
    },
    followUp: 'How do you handle secrets that rotate while the process is running?',
    trap: 'Providing silent defaults for required production settings.',
    relatedLessonIds: ['m14-environment-configuration', 'm12-environment-variables'],
  }),
  sc({
    id: 'sc-031',
    category: 'nodejs',
    difficulty: 'intermediate',
    topic: 'Streaming downloads',
    question: 'A `GET /exports/:id` endpoint reads a 2 GB file with `fs.readFile` and sends it. Under a few concurrent downloads the process is OOM-killed. How do you fix it?',
    shortAnswer: 'Stream the file: `pipeline(fs.createReadStream(path), res)` sends it in chunks with backpressure, so memory stays roughly constant regardless of file size or concurrency.',
    detailedAnswer: [
      '`readFile` loads the whole file into a Buffer (and Buffers have a maximum size), multiplied by concurrent requests.',
      'A read stream reads 64 KiB chunks; `pipeline` pauses reading when the client is slow (backpressure) and cleans up on errors or client aborts.',
      'Set `Content-Type`, `Content-Length` (from `stat`) and `Content-Disposition` headers; support `Range` if clients resume downloads.',
      'Better still, serve large files from object storage/CDN via a signed URL so Node is not in the data path.',
      'Test with a slow client to confirm memory stays flat.',
    ],
    code: {
      language: 'javascript',
      code: `
        const { createReadStream } = require('node:fs');
        const { stat } = require('node:fs/promises');
        const { pipeline } = require('node:stream/promises');

        app.get('/exports/:id', async (req, res, next) => {
          try {
            const path = await exportPathFor(req.params.id, req.user);
            const { size } = await stat(path);
            res.set({ 'Content-Type': 'text/csv', 'Content-Length': size });
            await pipeline(createReadStream(path), res);
          } catch (err) {
            if (!res.headersSent) next(err);
          }
        });
      `,
    },
    followUp: 'What happens with `readable.pipe(res)` if the read stream errors halfway?',
    trap: 'Raising `--max-old-space-size` — Buffers live outside the V8 heap and concurrency still multiplies memory.',
    relatedLessonIds: ['m06-practical-file-streaming', 'm06-backpressure', 'm06-piping'],
  }),
  sc({
    id: 'sc-032',
    category: 'nodejs',
    difficulty: 'intermediate',
    topic: 'Dependency vulnerabilities',
    question: '`npm audit` reports a critical vulnerability in a transitive dependency four levels deep. The direct dependency has no update yet. What do you do?',
    shortAnswer: 'Assess real exposure first, then fix with the least risky option: update the parent if possible, otherwise force a patched version with `overrides`, and test; document and track anything you accept.',
    detailedAnswer: [
      'Read the advisory: is the vulnerable code path reachable in your app (e.g. a CLI-only or dev-only dependency)? Severity alone is not exposure.',
      'Run `npm ls <pkg>` to see who pulls it in; check whether a newer parent version already fixes it.',
      'If not, add an `overrides` entry in `package.json` pinning the patched version, then run tests.',
      'Avoid `npm audit fix --force` blindly — it can jump major versions and break the app.',
      'Open an issue/PR upstream; if you accept the risk temporarily, record it with an expiry date.',
      'Automate: Dependabot/Renovate, audits in CI with a severity threshold.',
    ],
    code: {
      language: 'json',
      code: `
        {
          "overrides": {
            "vulnerable-lib": "2.4.3"
          }
        }
      `,
    },
    followUp: 'How do you protect against a malicious package being published (supply-chain attack)?',
    trap: 'Ignoring all audit output because "it is always noisy".',
    relatedLessonIds: ['m04-npm-audit', 'm12-dependency-vulnerabilities'],
  }),
  sc({
    id: 'sc-033',
    category: 'nodejs',
    difficulty: 'intermediate',
    topic: 'Liveness vs readiness',
    question: 'During a short database outage, Kubernetes restarted every API pod repeatedly, turning a 1-minute DB blip into a 15-minute outage. The liveness probe checks the database. What is wrong?',
    shortAnswer: 'Liveness should only answer "is this process healthy/not stuck?"; dependency checks belong in readiness. Restarting pods does not fix a database, it just adds cold starts and reconnection storms.',
    detailedAnswer: [
      'Liveness failure → container restart; readiness failure → removed from load balancing but kept running.',
      'Make `/livez` cheap and local (event loop responsive, not deadlocked).',
      'Make `/readyz` check critical dependencies (DB pool, cache) with short timeouts, and flip it to failing during shutdown.',
      'Tune probe periods/thresholds so brief blips do not cause flapping; add a startup probe for slow boots.',
      'Degrade gracefully when dependencies are down (cached responses, 503 with `Retry-After`) and reconnect with backoff + jitter.',
    ],
    code: {
      language: 'javascript',
      code: `
        let shuttingDown = false;
        app.get('/livez', (req, res) => res.sendStatus(200));
        app.get('/readyz', async (req, res) => {
          if (shuttingDown) return res.sendStatus(503);
          try {
            await pool.query('SELECT 1');
            res.sendStatus(200);
          } catch {
            res.sendStatus(503);
          }
        });
      `,
    },
    followUp: 'Should readiness fail if a non-critical dependency (e.g. recommendations service) is down?',
    trap: 'Putting every dependency into the liveness probe "to be safe".',
    relatedLessonIds: ['m14-health-checks', 'm11-graceful-shutdown'],
  }),
  sc({
    id: 'sc-034',
    category: 'nodejs',
    difficulty: 'intermediate',
    topic: 'Request correlation',
    question: 'A user reports a failed checkout. Logs from three services are full of interleaved lines from concurrent requests, and you cannot tell which lines belong to that checkout. How do you make this debuggable?',
    shortAnswer: 'Assign each request a correlation/trace ID at the edge, propagate it in headers to downstream services, and attach it to every log line automatically using `AsyncLocalStorage` (or OpenTelemetry context).',
    detailedAnswer: [
      'Generate or accept an ID (`X-Request-Id` or W3C `traceparent`) in the first middleware and return it in the response headers.',
      'Store it in `AsyncLocalStorage` so any code in that request\'s async chain can read it without passing it through every function.',
      'Use a structured logger whose child logger/mixin adds `requestId`, `userId` and route to each JSON line.',
      'Forward the header on outgoing HTTP calls and queue messages.',
      'Ship logs to a central store (ELK, Loki, Datadog) and search by ID; OpenTelemetry tracing adds timing per hop.',
      'Show the request ID in error responses so users and support can quote it.',
    ],
    code: {
      language: 'javascript',
      code: `
        const { AsyncLocalStorage } = require('node:async_hooks');
        const { randomUUID } = require('node:crypto');
        const als = new AsyncLocalStorage();

        app.use((req, res, next) => {
          const requestId = req.get('x-request-id') ?? randomUUID();
          res.set('x-request-id', requestId);
          als.run({ requestId }, next);
        });

        const log = (msg, extra = {}) =>
          logger.info({ ...als.getStore(), ...extra }, msg);
      `,
    },
    followUp: 'What is the difference between logs, metrics and traces?',
    trap: 'Passing a `requestId` parameter manually through every function signature.',
    relatedLessonIds: ['m14-logging-and-observability', 'm13-logging', 'm14-application-monitoring'],
  }),
  sc({
    id: 'sc-035',
    category: 'nodejs',
    difficulty: 'intermediate',
    topic: 'Upgrading Node versions',
    question: 'Your services run Node 18, which is end-of-life. How do you plan and execute the upgrade to Node 22 LTS safely?',
    shortAnswer: 'Treat it as a normal change: read the changelogs for breaking changes, upgrade in CI first, update native dependencies and the Docker base image, canary in production while watching metrics, and keep a quick rollback.',
    detailedAnswer: [
      'Read the migration notes for 20 and 22 (removed/deprecated APIs, OpenSSL and V8 changes, default behaviour changes).',
      'Run the test suite on the new version in CI (matrix build); fix deprecation warnings (`--throw-deprecation` helps surface them).',
      'Rebuild native addons (bcrypt, sharp, etc.) and update packages whose `engines` field excludes the new version.',
      'Pin the version everywhere: `.nvmrc`, `engines`, Docker `FROM node:22-...`, CI config.',
      'Roll out to one service/canary first; compare latency, memory, GC and error rates; roll back by redeploying the previous image if needed.',
      'Adopt new built-ins afterwards (`node --test`, `--env-file`, `fetch`) as separate changes.',
    ],
    followUp: 'What is the Node release schedule — what do "Current", "Active LTS" and "Maintenance" mean?',
    trap: 'Upgrading only the developer machines and leaving CI/Docker on the old version.',
    relatedLessonIds: ['m02-installing-node-js', 'm02-history-and-evolution', 'm14-ci-cd'],
  }),
  sc({
    id: 'sc-036',
    category: 'express-backend',
    difficulty: 'intermediate',
    topic: 'Flaky integration tests',
    question: 'Integration tests pass alone but fail randomly when the whole suite runs in parallel. They all use the same test database. How do you stabilise them?',
    shortAnswer: 'Tests are sharing mutable state. Isolate each test (transaction rollback, unique data per test, or a separate database/schema per worker), remove order dependencies, and control time and randomness.',
    detailedAnswer: [
      'Confirm by running with a fixed seed/order and in parallel; flaky failures usually involve "unique" values, counts, or leftover rows.',
      'Per-test isolation: wrap each test in a transaction and roll back, or truncate between tests when running serially.',
      'With parallel workers, give each worker its own database or schema (e.g. `test_db_<workerId>`), or use Testcontainers.',
      'Generate unique data (random emails) instead of relying on global fixtures; never assert on global counts.',
      'Replace real time/sleeps with fake timers or polling helpers; await all async work before the test ends.',
      'Track flaky tests and fix them rather than adding retries.',
    ],
    followUp: 'Which parts of an Express app would you test with Supertest versus unit tests?',
    trap: 'Adding automatic retries to the test runner and moving on.',
    relatedLessonIds: ['m13-integration-testing', 'm13-supertest', 'm13-testing-fundamentals'],
  }),
  sc({
    id: 'sc-037',
    category: 'advanced',
    difficulty: 'advanced',
    topic: 'Latency spikes',
    question: 'The API\'s p50 is a steady 20 ms, but p99 spikes to 2 s every few minutes. CPU averages look normal. How do you investigate?',
    shortAnswer: 'Correlate the spikes in time with event-loop delay, GC pauses, CPU per core, DB/downstream latency and periodic jobs — then capture a CPU profile or trace during a spike to find the blocking code or dependency.',
    detailedAnswer: [
      'Look at the pattern: regular intervals suggest a timer/cron, cache expiry, GC or log rotation; per-instance vs fleet-wide narrows it down.',
      'Export event-loop delay (`perf_hooks.monitorEventLoopDelay`) and GC metrics; spikes in loop delay mean something blocks the main thread (large JSON, sync crypto, a big sort, regex backtracking).',
      'Check dependencies in traces: slow queries, connection pool waits, DNS lookups, or a downstream service.',
      'Averages hide this — check per-core CPU and container CPU throttling (CFS quotas cause periodic stalls).',
      'Capture evidence during a spike: `--cpu-prof`, `0x`/clinic flame graph, or the inspector; heap snapshots if GC is the cause.',
      'Fix the cause (move work off the loop, add indexes, stagger cache TTLs, tune limits), then add alerting on p99 and loop delay.',
    ],
    code: {
      language: 'javascript',
      code: `
        const { monitorEventLoopDelay } = require('node:perf_hooks');
        const h = monitorEventLoopDelay({ resolution: 20 });
        h.enable();
        setInterval(() => {
          logger.info({ p99ms: h.percentile(99) / 1e6, maxms: h.max / 1e6 }, 'event loop delay');
          h.reset();
        }, 10_000).unref();
      `,
    },
    followUp: 'How does Kubernetes CPU throttling show up in a Node service, and how would you confirm it?',
    trap: 'Looking only at average latency and average CPU, which smooth the spikes away.',
    relatedLessonIds: ['m11-performance-profiling', 'm11-deep-understanding-of-event-loop', 'm14-application-monitoring'],
  }),
  sc({
    id: 'sc-038',
    category: 'advanced',
    difficulty: 'advanced',
    topic: 'Blocking JSON.parse',
    question: 'A webhook endpoint receives JSON payloads of up to 50 MB. While one is being processed, every other request on that instance stalls for ~1 s. What is going on and how do you fix it?',
    shortAnswer: '`JSON.parse`/`JSON.stringify` are synchronous and run on the main thread, so a 50 MB parse blocks the event loop. Limit body size, and for legitimately large payloads accept them asynchronously: stream to storage and parse in a worker or with a streaming parser.',
    detailedAnswer: [
      'Confirm: event-loop delay spikes match large webhook requests; a CPU profile shows `JSON.parse`.',
      'First question the payload: can the sender paginate, compress, or send a reference (URL to a file) instead?',
      'Enforce a body limit on normal endpoints (`express.json({ limit: "1mb" })`) so this cannot happen accidentally.',
      'For the big webhook: stream the raw body to object storage, acknowledge fast (202), and process it in a background worker.',
      'If it must be parsed in-process, do it in a `worker_thread`, or use a streaming JSON parser to handle records incrementally.',
      'Remember the result also costs memory (often several times the raw size) — watch heap limits.',
    ],
    followUp: 'Does moving `JSON.parse` to a worker thread have a cost? (Yes — the result must be serialized/cloned back unless you process it in the worker.)',
    trap: 'Wrapping `JSON.parse` in `async` or a Promise and thinking it no longer blocks.',
    relatedLessonIds: ['m11-cpu-bound-vs-i-o-bound-tasks', 'm11-worker-threads', 'm05-blocking-vs-non-blocking-code'],
  }),
  sc({
    id: 'sc-039',
    category: 'advanced',
    difficulty: 'advanced',
    topic: 'Memory leak',
    question: 'The service\'s memory climbs steadily over two days until the container is OOM-killed, then the cycle repeats. How do you find and fix the leak?',
    shortAnswer: 'Confirm it is a real leak (heap keeps growing after GC), take heap snapshots at two points under load and compare retained objects, follow their retainer chains to the code holding references, fix it, and add memory alerts.',
    detailedAnswer: [
      'Check which memory grows: `process.memoryUsage()` — `heapUsed` (JS objects) vs `external`/`arrayBuffers` (Buffers) vs RSS (native).',
      'Reproduce under load locally or on a canary; take heap snapshots (`--heapsnapshot-signal=SIGUSR2` or `v8.writeHeapSnapshot()`) some time apart.',
      'In Chrome DevTools, use the comparison view to see which constructors grow, and the retainers panel to see who keeps them alive.',
      'Common causes: unbounded in-memory caches/Maps keyed by user or request, listeners added per request and never removed (`MaxListenersExceededWarning`), timers/intervals not cleared, closures capturing large objects, global arrays of requests.',
      'Fix: bounded LRU caches with TTL, remove listeners, use `WeakMap` for object-keyed metadata, move caches to Redis.',
      'Prevent: dashboards and alerts on heap after GC, load tests that run long enough to show growth; set `--max-old-space-size` to fit the container limit.',
    ],
    code: {
      language: 'javascript',
      code: `
        // Leak: grows forever, one entry per user ever seen
        const cache = new Map();
        app.get('/profile/:id', async (req, res) => {
          if (!cache.has(req.params.id)) cache.set(req.params.id, await loadProfile(req.params.id));
          res.json(cache.get(req.params.id));
        });
        // Fix: a bounded LRU with TTL (e.g. the lru-cache package) or Redis
      `,
    },
    followUp: 'How does V8\'s generational GC work, and why can a leak make GC pauses longer too?',
    trap: 'Just raising the memory limit or scheduling daily restarts as the "fix".',
    relatedLessonIds: ['m11-memory-leaks', 'm11-garbage-collection', 'm11-memory-management'],
  }),
  sc({
    id: 'sc-040',
    category: 'advanced',
    difficulty: 'advanced',
    topic: 'Graceful shutdown in Kubernetes',
    question: 'Every deploy causes a burst of 502 errors and some half-finished jobs. Pods are Node servers in Kubernetes. How do you make deploys lossless?',
    shortAnswer: 'Handle `SIGTERM`: fail readiness, keep serving while the load balancer stops routing to the pod, stop accepting new connections, let in-flight requests and jobs finish, close keep-alive connections and pools, then exit — all within `terminationGracePeriodSeconds`.',
    detailedAnswer: [
      'Make sure Node actually receives `SIGTERM`: run `node` as PID 1 (or via `tini`), not behind `npm start` / a shell script that swallows signals.',
      'On `SIGTERM`, mark readiness as failing and wait a few seconds (or use a `preStop` sleep) — endpoints take time to be removed from load balancers.',
      'Call `server.close()` to stop accepting connections; idle keep-alive sockets must be closed too (`server.closeIdleConnections()` in Node 18.2+).',
      'Let in-flight requests finish; stop queue consumers from taking new jobs and let current jobs complete or be re-queued.',
      'Close DB pools, Redis, and flush logs/telemetry; then `process.exit(0)`. Add a hard timeout below the grace period.',
      'Test it: run a load test during a rolling deploy and require zero 5xx.',
    ],
    code: {
      language: 'javascript',
      code: `
        process.on('SIGTERM', async () => {
          shuttingDown = true;                        // /readyz now returns 503
          setTimeout(() => process.exit(1), 25_000).unref(); // hard stop
          await new Promise((r) => setTimeout(r, 5_000)); // let LB deregister
          server.close(async () => {
            await Promise.allSettled([worker.close(), pool.end(), redis.quit()]);
            process.exit(0);
          });
          server.closeIdleConnections();
        });
      `,
    },
    followUp: 'Why can keep-alive connections keep a server from closing, and how did Node 19+ change `server.close()`?',
    trap: 'Calling `process.exit()` immediately on SIGTERM.',
    relatedLessonIds: ['m11-graceful-shutdown', 'm14-health-checks', 'm11-process-management'],
  }),
  sc({
    id: 'sc-041',
    category: 'advanced',
    difficulty: 'advanced',
    topic: 'libuv thread pool saturation',
    question: 'During a signup surge, unrelated endpoints that read files and resolve hostnames also get slow, though CPU is not maxed. Signup hashes passwords with async bcrypt. What could link them?',
    shortAnswer: 'They share libuv\'s thread pool (4 threads by default): async bcrypt/`crypto.pbkdf2`/`scrypt`, `fs`, `dns.lookup` and zlib all queue on it, so expensive hashes starve file and DNS work.',
    detailedAnswer: [
      'Async does not mean free: those APIs offload to a fixed-size pool, and jobs queue when all threads are busy.',
      'Measure: latency of `fs`/DNS calls rises with signup rate while the main thread is mostly idle.',
      'Raise `UV_THREADPOOL_SIZE` (set before the pool is first used — env var at startup) to roughly the number of cores, keeping in mind it is per process.',
      'Reduce pressure: pick a sane hash cost, rate-limit signup/login, cache DNS or use `dns.resolve` (which uses c-ares, not the pool) where appropriate.',
      'Isolate: move password hashing to a separate service/worker pool so auth spikes cannot degrade the rest.',
    ],
    followUp: 'Which Node APIs use the thread pool and which use the OS\'s async mechanisms (epoll/kqueue/IOCP)? (Network sockets do not use the pool.)',
    trap: 'Assuming the server cannot be blocked because "it only uses async APIs".',
    relatedLessonIds: ['m11-thread-pool', 'm05-libuv-thread-pool', 'm02-libuv'],
  }),
  sc({
    id: 'sc-042',
    category: 'advanced',
    difficulty: 'advanced',
    topic: 'Keep-alive timeouts behind a load balancer',
    question: 'A small fraction of requests fail with 502 from the cloud load balancer, randomly and mostly at low traffic. Node logs show no errors for them. What is a likely cause?',
    shortAnswer: 'A keep-alive race: Node closes idle connections after `server.keepAliveTimeout` (5 s by default), but the load balancer reuses connections for longer (often 60 s) and sends a request on a socket Node just closed. Set Node\'s keep-alive timeout above the LB\'s idle timeout.',
    detailedAnswer: [
      'The pattern — no app error, random, worse at low traffic (more idle sockets) — points to the connection layer.',
      'Check LB logs for "backend connection closed/reset" and compare the LB idle timeout with Node\'s `keepAliveTimeout`.',
      'Set `server.keepAliveTimeout` higher than the LB idle timeout (e.g. 65 s for a 60 s ALB), and `server.headersTimeout` slightly higher still.',
      'The same race exists for outgoing calls: configure HTTP agents/undici pools with idle timeouts shorter than the upstream\'s.',
      'Add retries for idempotent upstream requests on `ECONNRESET`, and monitor 502 rates per target.',
    ],
    code: {
      language: 'javascript',
      code: `
        const server = app.listen(port);
        server.keepAliveTimeout = 65_000; // > load balancer idle timeout (60 s)
        server.headersTimeout = 66_000;   // must exceed keepAliveTimeout
      `,
    },
    followUp: 'What do `server.requestTimeout` and `server.headersTimeout` protect against?',
    trap: 'Blaming the application code and adding more instances.',
    relatedLessonIds: ['m14-load-balancing', 'm07-request-and-response-lifecycle', 'm03-http-module'],
  }),
  sc({
    id: 'sc-043',
    category: 'nodejs',
    difficulty: 'advanced',
    topic: 'Processing a huge CSV',
    question: 'You need to import a 5 GB CSV (40 million rows) into PostgreSQL nightly, validating and transforming each row. The first version used `readFile` + `split("\\n")` and crashed. How do you build it?',
    shortAnswer: 'Stream it: read stream → CSV parser → transform/validate → batched inserts (or `COPY`), all in a `pipeline` with backpressure, so memory stays flat; make it resumable and idempotent and run it as a background job.',
    detailedAnswer: [
      'A 5 GB string exceeds V8\'s maximum string length, and the whole file in memory would not fit anyway.',
      'Use `fs.createReadStream` → a streaming CSV parser (e.g. csv-parse, which handles quoted newlines) → an async transform.',
      'Batch rows (e.g. 1,000–5,000) per insert, or stream into `COPY ... FROM STDIN` (pg-copy-streams) for the fastest load.',
      'Backpressure matters: `pipeline` / `for await` waits for the DB before reading more.',
      'Write bad rows to a rejects file with line numbers instead of failing the whole import.',
      'Load into a staging table and swap/merge in a transaction; track progress (byte offset or batch number) so a crash can resume; use upserts so re-runs are safe.',
    ],
    code: {
      language: 'javascript',
      code: `
        const { createReadStream } = require('node:fs');
        const { parse } = require('csv-parse');

        async function importCsv(path) {
          const parser = createReadStream(path).pipe(parse({ columns: true }));
          let batch = [];
          for await (const row of parser) {           // pauses reading while we await
            const valid = validate(row);
            if (valid) batch.push(valid);
            if (batch.length === 2000) {
              await insertBatch(batch);
              batch = [];
            }
          }
          if (batch.length) await insertBatch(batch);
        }
      `,
    },
    followUp: 'How would you parallelise the import across multiple workers without breaking ordering guarantees?',
    trap: 'Increasing `--max-old-space-size` to 8 GB to make `readFile` work.',
    relatedLessonIds: ['m06-streaming-large-files', 'm06-backpressure', 'm06-transform-streams'],
  }),
  sc({
    id: 'sc-044',
    category: 'advanced',
    difficulty: 'advanced',
    topic: 'Scheduled jobs with multiple instances',
    question: 'A `node-cron` job that sends a daily invoice email runs inside the API process. After scaling to 3 instances, customers receive the email three times. How do you fix it?',
    shortAnswer: 'Every instance runs its own scheduler. Run the schedule in exactly one place (a platform cron like a Kubernetes CronJob, or a queue with repeatable jobs), and make the job itself idempotent with a lock or a unique "already sent" record.',
    detailedAnswer: [
      'Move scheduling out of the web tier: a Kubernetes CronJob / cloud scheduler triggers one run, or BullMQ repeatable jobs (deduplicated in Redis) are processed by workers.',
      'If it must stay in-process, take a distributed lock (Redis `SET key value NX PX ttl`, or PostgreSQL advisory locks) so only one instance runs.',
      'Locks can fail (expiry during long runs, clock issues), so also make the work idempotent: record `(invoice_id, sent_at)` with a unique constraint and skip already-sent ones.',
      'Process in batches with checkpoints so a crash can resume rather than restart from scratch.',
      'Monitor: alert if the job did not run or ran more than once.',
    ],
    followUp: 'What happens with a CronJob if a run takes longer than the interval? (`concurrencyPolicy: Forbid`.)',
    trap: 'Using an environment variable like `IS_PRIMARY=true` on one pod — it breaks when that pod is rescheduled or scaled.',
    relatedLessonIds: ['m11-background-jobs', 'm11-bullmq', 'm14-horizontal-scaling'],
  }),
];
