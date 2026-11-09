import type { Project } from '../../types';
import { dedent, entity } from './shared';

export const p10: Project = {
  id: 'p10',
  number: 10,
  level: 'advanced',
  title: 'Background Job Processing System',
  status: 'ready',
  summary: 'Schedule, run and monitor report-generation jobs with BullMQ: an API that enqueues and tracks jobs, cron schedulers, live progress over SSE, a worker that offloads CPU-heavy work to a worker_threads pool, timeouts, and graceful shutdown.',
  skills: ['BullMQ', 'Redis', 'Worker threads pool', 'Transferable buffers', 'Job schedulers (cron)', 'Server-Sent Events', 'Graceful shutdown', 'PM2'],
  estHours: 16,
  prerequisites: [
    'm11-bullmq',
    'm11-background-jobs',
    'm11-worker-threads',
    'm11-cpu-bound-vs-i-o-bound-tasks',
    'm11-graceful-shutdown',
    'm11-pm2',
    'm03-worker-threads-module',
    'm11-redis',
  ],
  requirements: {
    functional: [
      '`POST /api/v1/reports` `{ type: "sales-summary", from, to }` → `202 { reportId, jobId }`.',
      '`GET /api/v1/jobs/:id` → state (`waiting | active | completed | failed | delayed`), progress %, result, failure reason.',
      '`GET /api/v1/jobs/:id/events` streams progress and completion via Server-Sent Events.',
      'Cancel a job that has not started yet (`DELETE /api/v1/jobs/:id`).',
      'Cron schedules (e.g. daily 06:00 Europe/London) created/updated/removed through the API.',
      'Download finished reports (`GET /api/v1/reports/:id/download`).',
      'Failed jobs retried 3× with exponential backoff; final failures visible in the API.',
    ],
    nonFunctional: [
      'The event loop of the worker process is never blocked: CPU-heavy aggregation runs in a fixed-size `worker_threads` pool.',
      'Large arrays move to threads as transferable `ArrayBuffer`s (zero-copy) instead of being structured-cloned.',
      'Each CPU task has a timeout; a stuck thread is terminated and replaced.',
      'Graceful shutdown on `SIGTERM`: stop taking jobs, finish active ones (≤ 30 s), then exit. Interrupted jobs are picked up again as *stalled* jobs.',
      'Processors are idempotent (re-running a job overwrites the same file and row).',
      'API and workers scale independently (PM2 / containers).',
    ],
  },
  architecture: {
    diagramId: 'queue-worker',
    flow: [
      { label: 'API', detail: 'insert report row → queue.add(jobId = reportId)' },
      { label: 'Redis (BullMQ)', detail: 'waiting → active, locks, retries, schedulers' },
      { label: 'Worker process', detail: 'I/O: query DB, update progress' },
      { label: 'Thread pool', detail: 'CPU: sort, percentiles, CSV' },
      { label: 'Storage', detail: 'write file, mark report completed' },
      { label: 'QueueEvents → SSE', detail: 'progress / completed pushed to browser' },
    ],
    notes: [
      'Split by work type: the worker\'s main thread does I/O (DB, Redis, files) with high concurrency; threads do CPU work with concurrency = cores − 1.',
      'Hand-rolled pool shown here for learning; `piscina` (third-party) is the production-grade equivalent. BullMQ can also run processors in sandboxed threads (`useWorkerThreads: true`).',
      'BullMQ keeps a lock per active job; if a worker dies the lock expires and the job is moved back to waiting (stalled-job check). That is why processors must be idempotent.',
      'Job schedulers (`upsertJobScheduler`, BullMQ 5.16+) replace the older "repeatable jobs" API.',
    ],
  },
  folderStructure: dedent(`
    jobs/
    ├── ecosystem.config.cjs        # PM2: api (cluster) + worker (fork)
    ├── migrations/001_reports.sql
    ├── src/
    │   ├── config.js
    │   ├── redis.js                # createConnection()
    │   ├── queues.js               # reportsQueue, QueueEvents
    │   ├── api/
    │   │   ├── server.js
    │   │   ├── reports.routes.js
    │   │   ├── jobs.routes.js      # status, SSE, cancel
    │   │   └── schedules.routes.js
    │   ├── worker/
    │   │   ├── worker.js           # BullMQ Worker + graceful shutdown
    │   │   ├── report.processor.js
    │   │   ├── worker-pool.js      # fixed-size worker_threads pool
    │   │   └── tasks/sales-summary.task.js   # runs inside a thread
    │   └── storage.js              # local disk (swap for S3)
    └── test/
        ├── worker-pool.test.js
        └── report.processor.test.js
  `),
  databaseDesign: [
    entity('reports', [
      ['id', 'UUID', 'PK DEFAULT gen_random_uuid()', 'Also the BullMQ jobId'],
      ['type', 'TEXT', 'NOT NULL', 'sales-summary, …'],
      ['params', 'JSONB', 'NOT NULL', '{ from, to }'],
      ['status', 'TEXT', "DEFAULT 'queued'", 'queued | active | completed | failed | cancelled'],
      ['requested_by', 'TEXT', 'NULL', 'User id, or schedule id for cron runs'],
      ['attempts', 'INT', 'DEFAULT 0', ''],
      ['file_path', 'TEXT', 'NULL', 'Storage key of the CSV'],
      ['row_count', 'INT', 'NULL', ''],
      ['error', 'TEXT', 'NULL', 'Last failure reason'],
      ['created_at / started_at / finished_at', 'TIMESTAMPTZ', '', 'Index (status, created_at)'],
    ]),
    entity('sales (source data)', [
      ['id', 'BIGINT', 'PK', ''],
      ['region', 'TEXT', 'NOT NULL', ''],
      ['amount_cents', 'BIGINT', 'NOT NULL', ''],
      ['sold_at', 'TIMESTAMPTZ', 'NOT NULL', 'Index (sold_at)'],
    ]),
    entity('Redis (managed by BullMQ)', [
      ['bull:reports:wait / active / delayed / completed / failed', 'lists / sorted sets', '', 'Job states'],
      ['bull:reports:<jobId>', 'hash', '', 'Data, progress, return value, stack traces'],
      ['bull:reports:repeat:*', 'hash / zset', '', 'Job schedulers'],
    ]),
  ],
  endpoints: [
    { method: 'POST', path: '/api/v1/reports', description: 'Request a report → 202 { reportId, jobId }.', auth: 'user' },
    { method: 'GET', path: '/api/v1/reports/:id', description: 'Report metadata.', auth: 'owner' },
    { method: 'GET', path: '/api/v1/reports/:id/download', description: 'Stream the CSV.', auth: 'owner' },
    { method: 'GET', path: '/api/v1/jobs/:id', description: 'Job state, progress, result.', auth: 'owner' },
    { method: 'GET', path: '/api/v1/jobs/:id/events', description: 'SSE: progress / completed / failed.', auth: 'owner' },
    { method: 'DELETE', path: '/api/v1/jobs/:id', description: 'Cancel if waiting/delayed; 409 if active.', auth: 'owner' },
    { method: 'PUT', path: '/api/v1/schedules/:name', description: 'Create/update a cron schedule { pattern, tz, type, params }.', auth: 'admin' },
    { method: 'GET', path: '/api/v1/schedules', description: 'List schedulers with next run time.', auth: 'admin' },
    { method: 'DELETE', path: '/api/v1/schedules/:name', description: 'Remove a schedule.', auth: 'admin' },
    { method: 'GET', path: '/api/v1/queues/stats', description: 'Counts per state (waiting, active, failed…).', auth: 'admin' },
  ],
  steps: [
    {
      title: 'Queue, connections and events',
      bullets: [
        'Install `bullmq` + `ioredis` (third-party). Each `Worker` / `QueueEvents` uses blocking Redis commands, so give it its own connection.',
        '`maxRetriesPerRequest: null` is required for worker connections.',
      ],
      code: {
        id: 'p10-s1',
        title: 'src/redis.js + src/queues.js',
        language: 'javascript',
        code: dedent(`
          // redis.js
          import IORedis from 'ioredis';
          import { config } from './config.js';

          export const createConnection = () => new IORedis(config.REDIS_URL, { maxRetriesPerRequest: null });

          // queues.js
          import { Queue, QueueEvents } from 'bullmq';

          export const REPORTS = 'reports';

          export const reportsQueue = new Queue(REPORTS, {
            connection: createConnection(),
            defaultJobOptions: {
              attempts: 3,
              backoff: { type: 'exponential', delay: 5_000 },
              removeOnComplete: { age: 7 * 24 * 3600 },
              removeOnFail: { age: 30 * 24 * 3600 },
            },
          });

          export const reportEvents = new QueueEvents(REPORTS, { connection: createConnection() });
        `),
      },
    },
    {
      title: 'Enqueue from the API',
      bullets: [
        'Insert the `reports` row first, then `add` with `jobId = reportId` — duplicates are impossible and status lookups need only one id.',
        'Use `priority` (lower = sooner) for interactive requests vs. bulk/cron jobs.',
      ],
      code: {
        id: 'p10-s2',
        title: 'src/api/reports.routes.js',
        language: 'javascript',
        code: dedent(`
          import { Router } from 'express';
          import { z } from 'zod';
          import { pool as db } from '../db.js';
          import { reportsQueue } from '../queues.js';

          const CreateReport = z
            .object({ type: z.literal('sales-summary'), from: z.coerce.date(), to: z.coerce.date() })
            .refine((r) => r.to > r.from, { message: '"to" must be after "from"' })
            .refine((r) => r.to - r.from <= 366 * 24 * 3600 * 1000, { message: 'Range is limited to one year' });

          export const reportsRouter = Router();

          reportsRouter.post('/', async (req, res) => {
            const parsed = CreateReport.safeParse(req.body);
            if (!parsed.success) return res.status(400).json({ error: parsed.error.issues });
            const { type, from, to } = parsed.data;

            const { rows } = await db.query(
              "INSERT INTO reports (type, params, requested_by) VALUES ($1, $2, $3) RETURNING id",
              [type, { from, to }, req.user.id],
            );
            const reportId = rows[0].id;

            await reportsQueue.add(type, { reportId, from: from.toISOString(), to: to.toISOString() }, { jobId: reportId, priority: 1 });
            res.status(202).location(\`/api/v1/jobs/\${reportId}\`).json({ reportId, jobId: reportId });
          });
        `),
      },
    },
    {
      title: 'A fixed-size worker_threads pool',
      bullets: [
        'Threads are created lazily up to `size` (default: cores − 1) and reused — spawning a thread per task costs ~10–30 ms and memory.',
        'Tasks queue when all threads are busy; results/errors come back as messages.',
        'An `AbortSignal` (e.g. `AbortSignal.timeout(ms)`) terminates the stuck thread and replaces it.',
        'Pass `transferList` to move `ArrayBuffer`s without copying.',
      ],
      code: {
        id: 'p10-s3',
        title: 'src/worker/worker-pool.js',
        language: 'javascript',
        code: dedent(`
          import { Worker } from 'node:worker_threads';
          import { availableParallelism } from 'node:os';

          export class WorkerPool {
            #file;
            #size;
            #idle = [];
            #all = new Set();
            #queue = [];
            #closed = false;

            constructor(file, size = Math.max(1, availableParallelism() - 1)) {
              this.#file = file;
              this.#size = size;
            }

            run(payload, { signal, transferList } = {}) {
              if (this.#closed) return Promise.reject(new Error('Pool is closed'));
              if (signal?.aborted) return Promise.reject(signal.reason);
              return new Promise((resolve, reject) => {
                this.#queue.push({ payload, transferList, signal, resolve, reject });
                this.#drain();
              });
            }

            #drain() {
              while (this.#queue.length > 0) {
                let worker = this.#idle.pop();
                if (!worker) {
                  if (this.#all.size >= this.#size) return; // all busy: wait
                  worker = new Worker(this.#file);
                  this.#all.add(worker);
                }
                this.#execute(worker, this.#queue.shift());
              }
            }

            #execute(worker, task) {
              const cleanup = () => {
                worker.off('message', onMessage);
                worker.off('error', onError);
                task.signal?.removeEventListener('abort', onAbort);
              };
              const onMessage = (msg) => {
                cleanup();
                this.#idle.push(worker);
                this.#drain();
                if (msg.error) task.reject(Object.assign(new Error(msg.error.message), { name: msg.error.name }));
                else task.resolve(msg.result);
              };
              const onError = (err) => {
                cleanup();
                this.#replace(worker);
                task.reject(err);
              };
              const onAbort = () => {
                cleanup();
                this.#replace(worker); // a busy thread cannot be interrupted, only terminated
                task.reject(task.signal.reason);
              };

              worker.on('message', onMessage);
              worker.on('error', onError);
              task.signal?.addEventListener('abort', onAbort, { once: true });
              worker.postMessage(task.payload, task.transferList ?? []);
            }

            #replace(worker) {
              this.#all.delete(worker);
              worker.terminate();
              this.#drain();
            }

            async destroy() {
              this.#closed = true;
              for (const task of this.#queue.splice(0)) task.reject(new Error('Pool destroyed'));
              await Promise.all([...this.#all].map((w) => w.terminate()));
              this.#all.clear();
              this.#idle = [];
            }
          }
        `),
      },
    },
    {
      title: 'The CPU task (runs inside a thread)',
      bullets: [
        'Receives typed arrays (already transferred), groups by region, sorts, computes total / average / p50 / p95 and builds the CSV.',
        'Never throw across the boundary — post `{ error }` so the pool can reject cleanly and keep the thread.',
      ],
      code: {
        id: 'p10-s4',
        title: 'src/worker/tasks/sales-summary.task.js',
        language: 'javascript',
        code: dedent(`
          import { parentPort } from 'node:worker_threads';

          function percentile(sorted, p) {
            if (sorted.length === 0) return 0;
            const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
            return sorted[Math.max(0, idx)];
          }

          function salesSummary({ amounts, regions, regionNames }) {
            const buckets = regionNames.map(() => []);
            for (let i = 0; i < amounts.length; i++) buckets[regions[i]].push(amounts[i]);

            const lines = ['region,orders,total_cents,avg_cents,p50_cents,p95_cents'];
            buckets.forEach((values, r) => {
              const sorted = Float64Array.from(values).sort();
              const total = sorted.reduce((a, b) => a + b, 0);
              const avg = sorted.length ? Math.round(total / sorted.length) : 0;
              lines.push([regionNames[r], sorted.length, total, avg, percentile(sorted, 50), percentile(sorted, 95)].join(','));
            });
            return lines.join('\\n') + '\\n';
          }

          parentPort.on('message', (msg) => {
            try {
              if (msg.type !== 'sales-summary') throw new Error(\`Unknown task type: \${msg.type}\`);
              parentPort.postMessage({ result: salesSummary(msg) });
            } catch (err) {
              parentPort.postMessage({ error: { name: err.name, message: err.message } });
            }
          });
        `),
        explanation: [
          '`Float64Array.prototype.sort()` sorts numerically (unlike `Array.prototype.sort`, which compares strings by default).',
        ],
      },
    },
    {
      title: 'The report processor',
      bullets: [
        'I/O on the main thread, CPU in the pool. Report progress with `job.updateProgress()`.',
        'Copy rows into `Float64Array`/`Uint16Array` and **transfer** their buffers — after transfer they are unusable in the sender (length 0).',
        'Scheduled runs have no pre-created row: the processor creates it, keyed by the job id, so retries reuse it.',
        'Idempotent: same file key and `UPDATE` on every attempt.',
      ],
      code: {
        id: 'p10-s5',
        title: 'src/worker/report.processor.js',
        language: 'javascript',
        code: dedent(`
          function yesterdayUtc(now = new Date()) {
            const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
            return { from: new Date(to.getTime() - 24 * 3600 * 1000), to };
          }

          export function createReportProcessor({ pool, db, storage, taskTimeoutMs = 120_000 }) {
            return async function processReport(job) {
              const range = job.data.range === 'yesterday' ? yesterdayUtc() : { from: new Date(job.data.from), to: new Date(job.data.to) };

              let reportId = job.data.reportId;
              if (!reportId) {
                const { rows } = await db.query(
                  \`INSERT INTO reports (id, type, params, requested_by)
                   VALUES (md5($1)::uuid, $2, $3, $4)
                   ON CONFLICT (id) DO UPDATE SET status = 'queued'
                   RETURNING id\`,
                  [job.id, job.name, range, job.data.scheduleId ?? 'schedule'],
                );
                reportId = rows[0].id;
              }

              await db.query(
                "UPDATE reports SET status = 'active', started_at = now(), attempts = attempts + 1 WHERE id = $1",
                [reportId],
              );

              const { rows } = await db.query(
                'SELECT region, amount_cents FROM sales WHERE sold_at >= $1 AND sold_at < $2',
                [range.from, range.to],
              );
              await job.updateProgress(30);

              const regionNames = [...new Set(rows.map((r) => r.region))];
              const regionIndex = new Map(regionNames.map((name, i) => [name, i]));
              const amounts = new Float64Array(rows.length);
              const regions = new Uint16Array(rows.length);
              rows.forEach((r, i) => {
                amounts[i] = Number(r.amount_cents);
                regions[i] = regionIndex.get(r.region);
              });

              const csv = await pool.run(
                { type: 'sales-summary', amounts, regions, regionNames },
                { transferList: [amounts.buffer, regions.buffer], signal: AbortSignal.timeout(taskTimeoutMs) },
              );
              await job.updateProgress(80);

              const filePath = await storage.write(\`reports/\${reportId}.csv\`, csv);
              await db.query(
                "UPDATE reports SET status = 'completed', file_path = $2, row_count = $3, error = NULL, finished_at = now() WHERE id = $1",
                [reportId, filePath, rows.length],
              );
              await job.updateProgress(100);
              return { reportId, filePath, rows: rows.length };
            };
          }
        `),
      },
    },
    {
      title: 'Worker process with graceful shutdown',
      bullets: [
        '`worker.close()` stops fetching new jobs and resolves once active jobs finish.',
        'Mark the report `failed` only when retries are exhausted (`attemptsMade >= attempts`).',
        'A hard-exit timer guarantees the process ends before the orchestrator\'s kill timeout (PM2 `kill_timeout`, Docker `stop_grace_period`).',
      ],
      code: {
        id: 'p10-s6',
        title: 'src/worker/worker.js',
        language: 'javascript',
        code: dedent(`
          import { Worker } from 'bullmq';
          import { createConnection } from '../redis.js';
          import { REPORTS } from '../queues.js';
          import { WorkerPool } from './worker-pool.js';
          import { createReportProcessor } from './report.processor.js';
          import { pool as db } from '../db.js';
          import { storage } from '../storage.js';

          const threads = new WorkerPool(new URL('./tasks/sales-summary.task.js', import.meta.url));
          const connection = createConnection();

          const worker = new Worker(REPORTS, createReportProcessor({ pool: threads, db, storage }), {
            connection,
            concurrency: 4, // I/O-bound part; CPU part is bounded by the pool size
            lockDuration: 60_000,
          });

          worker.on('completed', (job, result) => console.log(\`job \${job.id} done: \${result.rows} rows\`));
          worker.on('failed', async (job, err) => {
            if (!job) return;
            const final = job.attemptsMade >= (job.opts.attempts ?? 1);
            console.error(\`job \${job.id} attempt \${job.attemptsMade} failed: \${err.message}\`);
            if (final && job.data.reportId) {
              await db.query("UPDATE reports SET status = 'failed', error = $2, finished_at = now() WHERE id = $1", [
                job.data.reportId,
                err.message,
              ]);
            }
          });
          worker.on('error', (err) => console.error('worker error', err));

          let shuttingDown = false;
          async function shutdown(signal) {
            if (shuttingDown) return;
            shuttingDown = true;
            console.log(\`\${signal}: waiting for active jobs...\`);
            setTimeout(() => {
              console.error('Shutdown timed out, exiting; unfinished jobs will be retried as stalled');
              process.exit(1);
            }, 30_000).unref();

            await worker.close();
            await threads.destroy();
            await db.end();
            await connection.quit();
            process.exit(0);
          }
          process.on('SIGTERM', shutdown);
          process.on('SIGINT', shutdown);
        `),
      },
    },
    {
      title: 'Cron schedules',
      bullets: [
        '`upsertJobScheduler(id, { pattern, tz }, template)` is idempotent — call it on every deploy or from the API.',
        'Only one job is produced per tick no matter how many API/worker instances exist.',
      ],
      code: {
        id: 'p10-s7',
        title: 'src/api/schedules.routes.js',
        language: 'javascript',
        code: dedent(`
          import { Router } from 'express';
          import { z } from 'zod';
          import { reportsQueue } from '../queues.js';

          const Schedule = z.object({
            pattern: z.string().min(9).max(100), // cron, e.g. "0 6 * * *"
            tz: z.string().default('UTC'),
            type: z.literal('sales-summary'),
          });

          export const schedulesRouter = Router();

          schedulesRouter.put('/:name', async (req, res) => {
            const { pattern, tz, type } = Schedule.parse(req.body);
            await reportsQueue.upsertJobScheduler(
              req.params.name,
              { pattern, tz },
              { name: type, data: { range: 'yesterday', scheduleId: req.params.name }, opts: { priority: 10 } },
            );
            res.status(204).end();
          });

          schedulesRouter.get('/', async (req, res) => {
            res.json({ data: await reportsQueue.getJobSchedulers(0, 100, true) });
          });

          schedulesRouter.delete('/:name', async (req, res) => {
            const removed = await reportsQueue.removeJobScheduler(req.params.name);
            res.status(removed ? 204 : 404).end();
          });
        `),
        versionNote: 'Job schedulers need BullMQ 5.16+; older code uses `queue.add(name, data, { repeat: { pattern } })`.',
      },
    },
    {
      title: 'Job status, cancel and live progress over SSE',
      bullets: [
        '`QueueEvents` receives events from **all** workers through Redis streams — the API does not need to be the process running the job.',
        'Send the current state first (the job may already be done), then stream updates; remove listeners when the client disconnects.',
        'Only `waiting`/`delayed` jobs can be removed; cancelling an `active` job needs cooperative checks inside the processor.',
      ],
      code: {
        id: 'p10-s8',
        title: 'src/api/jobs.routes.js',
        language: 'javascript',
        code: dedent(`
          import { Router } from 'express';
          import { reportsQueue, reportEvents } from '../queues.js';

          export const jobsRouter = Router();

          jobsRouter.get('/:id', async (req, res) => {
            const job = await reportsQueue.getJob(req.params.id);
            if (!job) return res.status(404).json({ error: 'Job not found' });
            res.json({
              id: job.id,
              state: await job.getState(),
              progress: job.progress,
              attemptsMade: job.attemptsMade,
              result: job.returnvalue ?? null,
              failedReason: job.failedReason ?? null,
            });
          });

          jobsRouter.delete('/:id', async (req, res) => {
            const job = await reportsQueue.getJob(req.params.id);
            if (!job) return res.status(404).end();
            const state = await job.getState();
            if (!['waiting', 'delayed', 'prioritized'].includes(state)) {
              return res.status(409).json({ error: \`Cannot cancel a job that is \${state}\` });
            }
            await job.remove();
            res.status(204).end();
          });

          jobsRouter.get('/:id/events', async (req, res) => {
            const id = req.params.id;
            const job = await reportsQueue.getJob(id);
            if (!job) return res.status(404).end();

            res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' });
            const send = (event, data) => res.write(\`event: \${event}\\ndata: \${JSON.stringify(data)}\\n\\n\`);

            const state = await job.getState();
            send('state', { state, progress: job.progress });
            if (state === 'completed' || state === 'failed') return res.end();

            const onProgress = ({ jobId, data }) => jobId === id && send('progress', data);
            const onCompleted = ({ jobId, returnvalue }) => {
              if (jobId !== id) return;
              send('completed', returnvalue);
              res.end();
            };
            const onFailed = ({ jobId, failedReason }) => jobId === id && send('failed', { failedReason });

            reportEvents.on('progress', onProgress);
            reportEvents.on('completed', onCompleted);
            reportEvents.on('failed', onFailed);
            res.on('close', () => {
              reportEvents.off('progress', onProgress);
              reportEvents.off('completed', onCompleted);
              reportEvents.off('failed', onFailed);
            });
          });
        `),
      },
    },
  ],
  testing: {
    bullets: [
      'Test the pool with an inline `data:` URL worker — real threads, no fixture files.',
      'Cover: parallel results, error propagation, timeout terminates a busy thread and the pool still works afterwards.',
      'Unit-test the processor with a fake `job` (`{ id, data, updateProgress: mock.fn() }`), fake `db` and the real pool.',
      'Shutdown test: start a slow job, send `SIGTERM` to a child process running `worker.js`, assert it exits 0 after the job completes.',
    ],
    code: {
      id: 'p10-test',
      title: 'test/worker-pool.test.js (node:test)',
      language: 'javascript',
      code: dedent(`
        import { test, after } from 'node:test';
        import assert from 'node:assert/strict';
        import { WorkerPool } from '../src/worker/worker-pool.js';

        const source = \`
          import { parentPort } from 'node:worker_threads';
          parentPort.on('message', ({ op, value, ms }) => {
            if (op === 'spin') { const end = Date.now() + ms; while (Date.now() < end); }
            if (op === 'fail') return parentPort.postMessage({ error: { name: 'Error', message: 'boom' } });
            parentPort.postMessage({ result: value * 2 });
          });
        \`;
        const workerUrl = new URL('data:text/javascript,' + encodeURIComponent(source));
        const pool = new WorkerPool(workerUrl, 2);
        after(() => pool.destroy());

        test('runs more tasks than threads and returns every result', async () => {
          const results = await Promise.all([1, 2, 3, 4].map((value) => pool.run({ op: 'double', value })));
          assert.deepEqual(results, [2, 4, 6, 8]);
        });

        test('propagates task errors', async () => {
          await assert.rejects(pool.run({ op: 'fail' }), /boom/);
        });

        test('timeout terminates a stuck thread and the pool recovers', async () => {
          await assert.rejects(
            pool.run({ op: 'spin', ms: 5_000, value: 1 }, { signal: AbortSignal.timeout(100) }),
            (err) => err.name === 'TimeoutError',
          );
          assert.equal(await pool.run({ op: 'double', value: 21 }), 42);
        });
      `),
      versionNote: '`data:` URLs for `new Worker()` and `AbortSignal.timeout` are available in Node 18+.',
    },
  },
  security: [
    'Validate report parameters (types, max date range) — an unbounded range is a denial-of-service vector on DB and CPU.',
    'Authorise job/report access by owner; job ids are UUIDs but still check `requested_by`.',
    'Downloads: stream files by storage key from the DB row, never from a user-supplied path (path traversal).',
    'Keep job payloads small and free of secrets/PII — they are stored in Redis and visible in dashboards.',
    'Protect Bull Board / queue admin routes with admin auth; they can retry/delete jobs.',
    'Per-user rate limit on `POST /reports` to stop queue flooding.',
  ],
  deployment: {
    bullets: [
      'PM2 runs the API in cluster mode (one per core) and workers in fork mode; `kill_timeout` must exceed the shutdown timer.',
      'In containers: separate `api` and `worker` services, `stop_grace_period: 40s`; scale workers on queue depth.',
      'Redis with AOF and `noeviction`; monitor `waiting`, `active`, `failed` counts and job duration.',
    ],
    code: {
      id: 'p10-deploy',
      title: 'ecosystem.config.cjs (PM2)',
      language: 'javascript',
      code: dedent(`
        module.exports = {
          apps: [
            {
              name: 'jobs-api',
              script: 'src/api/server.js',
              exec_mode: 'cluster',
              instances: 'max',
              env: { NODE_ENV: 'production' },
            },
            {
              name: 'jobs-worker',
              script: 'src/worker/worker.js',
              exec_mode: 'fork',
              instances: 2,
              kill_timeout: 40_000, // > 30 s shutdown timer in worker.js
              max_memory_restart: '1G',
              env: { NODE_ENV: 'production' },
            },
          ],
        };
      `),
    },
  },
  extensions: [
    'Swap the hand-rolled pool for `piscina` and compare throughput.',
    'Stream rows with a server-side cursor (`pg-cursor`) and process in chunks to bound memory.',
    'Flows (parent/child jobs): split a yearly report into 12 monthly children and merge results.',
    'Cooperative cancellation of active jobs via a Redis flag checked between chunks.',
    'Upload results to S3 and return pre-signed download URLs.',
    'Prometheus metrics: job duration histogram and queue depth gauges.',
  ],
};
