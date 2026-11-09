import type { ModuleContent } from '../../../types';
import {
  bullets, code, dedent, diagram, flow, interviewTip, note, section, steps, table, text, warn,
} from '../helpers';

const content: Partial<ModuleContent> = {
  // ───────────────────────────────────────────────────────────
  'message-queues': {
    summary: 'A message queue decouples producers from consumers through a durable broker, giving buffering, retries and independent scaling — at the price of at-least-once delivery, which makes consumers idempotent by design.',
    topics: ['message queue', 'broker', 'producer', 'consumer', 'at-least-once', 'at-most-once', 'exactly-once', 'idempotency', 'acknowledgement', 'dead-letter queue', 'RabbitMQ', 'Kafka', 'SQS', 'outbox pattern'],
    sections: [
      section('introduction', undefined,
        text("When the checkout API calls email, analytics and invoicing services directly, one slow dependency slows checkout down. Put a message on a queue instead and return — consumers process it at their own pace."),
      ),
      section('definition', 'Definition',
        bullets(
          "**Producer** publishes messages; **broker** stores them; **consumer** receives, processes and **acknowledges** them.",
          "**At-most-once** — ack before processing (or fire-and-forget): no duplicates, but crashes lose messages.",
          "**At-least-once** — ack after processing: nothing lost, but a crash after work and before ack causes **redelivery** (duplicates).",
          "**Exactly-once** — only achievable *effectively*: at-least-once delivery + **idempotent** processing (or transactional systems within one platform).",
          "**Dead-letter queue (DLQ)** — where messages go after exceeding retry attempts, for inspection.",
        ),
      ),
      section('why', 'Why queues',
        bullets(
          "**Decoupling**: producers don't know or wait for consumers.",
          "**Load leveling**: spikes queue up instead of overloading downstream systems.",
          "**Reliability**: retries with backoff; failures don't lose work.",
          "**Scaling**: add consumers independently of the API.",
        ),
      ),
      section('internals', 'Delivery and acknowledgement',
        diagram('queue-worker', 'Producer → broker → competing consumers; failed messages retry, then go to a DLQ.'),
        steps(
          "Consumer receives a message; the broker marks it in-flight (RabbitMQ unacked, SQS invisible for the visibility timeout, Kafka uncommitted offset).",
          "Consumer processes it and then acks (RabbitMQ `ack`, SQS `DeleteMessage`, Kafka offset commit).",
          "If the consumer dies or times out before ack, the message becomes visible again → redelivered.",
          "After N failures it moves to a DLQ (RabbitMQ dead-letter exchange, SQS redrive policy, Kafka: an app-level retry/DLT topic).",
        ),
        table('RabbitMQ vs Kafka vs SQS', ['', 'RabbitMQ', 'Kafka', 'Amazon SQS'], [
          ['Model', 'Broker with exchanges → queues (AMQP)', 'Distributed, partitioned append-only log', 'Managed queue service'],
          ['Consumption', 'Push to consumers, ack removes message', 'Consumers pull and track offsets; data retained', 'Poll (long polling), delete after processing'],
          ['Ordering', 'Per queue (with one consumer)', 'Per partition (by key)', 'Standard: best-effort; FIFO queues: per message group'],
          ['Replay', 'No (once acked, gone)', 'Yes — rewind offsets within retention', 'No'],
          ['Throughput', 'High', 'Very high (streaming)', 'High, scales automatically'],
          ['Routing', 'Rich (direct, topic, fanout, headers)', 'Topics + partitions', 'Simple; fan-out via SNS'],
          ['Ops', 'Self-host or managed', 'Heavier to operate (or managed)', 'Zero ops (AWS)'],
          ['Typical use', 'Task queues, RPC, routing', 'Event streaming, analytics, event sourcing', 'Serverless/AWS task queues'],
        ]),
        note("Node clients are third-party: `amqplib` (RabbitMQ), `kafkajs` or `@confluentinc/kafka-javascript` (Kafka), `@aws-sdk/client-sqs` (SQS). For Redis-backed job queues see BullMQ."),
      ),
      section('example', 'Idempotent consumer',
        code({
          title: 'Duplicates are skipped by message id',
          code: dedent(`
            const processed = new Set();     // in production: a DB table with a unique key
            let balance = 0;

            function handle(msg) {
              if (processed.has(msg.id)) { console.log('skip duplicate', msg.id); return; }
              balance += msg.amount;
              processed.add(msg.id);
              console.log('applied', msg.id, 'balance', balance);
            }

            // the broker redelivers m1 after a consumer crash
            [{ id: 'm1', amount: 10 }, { id: 'm2', amount: 5 }, { id: 'm1', amount: 10 }].forEach(handle);
          `),
          expectedOutput: 'applied m1 balance 10\napplied m2 balance 15\nskip duplicate m1',
          explanation: [
            'At-least-once delivery means `m1` can arrive twice.',
            'Recording the message id makes the handler idempotent: applying twice has the same effect as once.',
            'In a real system, write the side effect and the processed id in the **same DB transaction** (or use a unique constraint).',
          ],
          runnable: true,
        }),
        code({
          title: 'RabbitMQ consumer with manual ack (amqplib — third-party)',
          code: dedent(`
            import amqp from 'amqplib';
            const conn = await amqp.connect(process.env.AMQP_URL);
            const ch = await conn.createChannel();
            await ch.assertQueue('emails', { durable: true, deadLetterExchange: 'dlx' });
            ch.prefetch(10);                                   // at most 10 unacked per consumer

            ch.consume('emails', async (msg) => {
              try {
                await sendEmail(JSON.parse(msg.content.toString()));
                ch.ack(msg);                                   // at-least-once: ack after work
              } catch (err) {
                ch.nack(msg, false, false);                    // reject → dead-letter exchange
              }
            });
          `),
          explanation: [
            '`prefetch` bounds in-flight work per consumer (backpressure).',
            '`durable` queue + persistent messages survive broker restarts.',
            'nack with requeue=false routes to the DLX; use a retry queue with TTL for delayed retries.',
          ],
        }),
      ),
      section('real-world', 'Real-world backend usage',
        bullets(
          "Order placed → `order.created` event → email, invoicing, analytics consume independently.",
          "**Transactional outbox**: write the event to an `outbox` table in the same DB transaction as the order; a relay publishes it. Avoids \"DB committed but publish failed\".",
          "Webhooks delivery with retries and DLQ.",
          "Kafka for clickstream/event pipelines where multiple teams replay history.",
        ),
      ),
      section('mistakes', 'Common mistakes',
        code({
          title: 'Wrong vs right: dual write',
          code: dedent(`
            // Wrong: if publish fails (or process crashes) the order exists but no event is sent
            await db.orders.insert(order);
            await broker.publish('order.created', order);

            // Right: outbox: one transaction, then a relay publishes pending rows
            await db.tx(async (t) => {
              await t.orders.insert(order);
              await t.outbox.insert({ topic: 'order.created', payload: order });
            });
          `),
        }),
        bullets(
          "Assuming exactly-once delivery and writing non-idempotent consumers (double charges, double emails).",
          "Acking before processing — silent message loss.",
          "No DLQ: a poison message retries forever and blocks the queue.",
          "Expecting global ordering from Kafka across partitions or from SQS standard queues.",
        ),
      ),
      section('interview', 'Interview angle',
        interviewTip("Say \"at-least-once + idempotent consumers\" early. Then compare one broker pair (RabbitMQ vs Kafka) on model, ordering and replay."),
      ),
      section('practice', 'Practice',
        text("Design the consumer for `payment.captured` so that redelivery never double-credits a wallet. Specify the DB table, unique key and transaction boundaries."),
      ),
      section('summary', 'Summary',
        bullets(
          "Queues decouple, buffer, retry and scale work.",
          "At-most-once loses; at-least-once duplicates → make consumers idempotent.",
          "RabbitMQ = routing broker; Kafka = replayable log; SQS = managed queue.",
          "Use DLQs and the outbox pattern.",
        ),
      ),
    ],
    revisionNotes: [
      'At-most-once: ack first (may lose). At-least-once: ack after (may duplicate).',
      'Effectively-once = at-least-once + idempotency.',
      'DLQ for poison messages.',
      'Kafka: partitions, offsets, ordering per partition, replay.',
      'RabbitMQ: exchanges/queues, ack removes, prefetch.',
      'SQS: visibility timeout, FIFO per message group.',
      'Outbox pattern avoids DB/broker dual writes.',
    ],
    quiz: [
      {
        kind: 'mcq', difficulty: 'intermediate',
        prompt: 'A consumer acks a message only after successfully processing it. Which guarantee is that?',
        options: ['At-most-once', 'At-least-once', 'Exactly-once', 'Best-effort ordering'],
        answer: 1,
        explanation: 'If the consumer crashes after processing but before acking, the message is redelivered — so it may be processed more than once, but never lost.',
      },
      {
        kind: 'scenario', difficulty: 'advanced',
        prompt: 'Analytics, fraud and billing teams each need to read every order event, and fraud wants to reprocess the last 7 days after a model change. Which fits best?',
        options: ['A single RabbitMQ queue', 'Kafka topic with a consumer group per team and 7+ days retention', 'Redis Pub/Sub', 'SQS standard queue'],
        answer: 1,
        explanation: 'Kafka keeps the log; each consumer group tracks its own offsets and can rewind. A single queue delivers each message to only one consumer and cannot replay.',
      },
      {
        kind: 'find-bug', difficulty: 'intermediate',
        prompt: 'What is the reliability bug?',
        code: "channel.consume('jobs', async (msg) => {\n  channel.ack(msg);\n  await process(msg);\n});",
        options: ['ack must be awaited', 'Acking before processing loses the job if process() throws or the worker crashes', 'consume should be get', 'Missing prefetch makes it at-most-once'],
        answer: 1,
        explanation: 'Early ack converts the flow to at-most-once. Ack after success; nack on failure.',
      },
    ],
    interview: [
      {
        category: 'advanced', kind: 'concept', difficulty: 'advanced', topic: 'Message queues',
        question: 'Explain at-most-once, at-least-once and exactly-once delivery. Which do you design for?',
        shortAnswer: 'At-most-once may lose messages but never duplicates; at-least-once never loses but may duplicate; exactly-once is generally achieved as at-least-once delivery plus idempotent processing — so you design consumers to be idempotent.',
        detailedAnswer: [
          'The difference is when the ack happens relative to the side effect.',
          'Network failures make true end-to-end exactly-once impossible without cooperation from the side-effect store.',
          'Idempotency key / processed-message table / unique constraints.',
          'Kafka transactions give exactly-once within Kafka read-process-write, not for external side effects like emails.',
        ],
        followUp: 'How do you make sending an email idempotent?',
        trap: 'Claiming a broker "guarantees exactly-once" for all side effects.',
      },
      {
        category: 'advanced', kind: 'concept', difficulty: 'advanced', topic: 'Message queues',
        question: 'Compare RabbitMQ, Kafka and SQS for a Node.js backend.',
        shortAnswer: 'RabbitMQ is a routing message broker that deletes messages after ack — great for task queues; Kafka is a partitioned, retained log with offsets and replay — great for event streaming and multiple consumers; SQS is a fully managed AWS queue with visibility timeouts and minimal operations.',
        detailedAnswer: [
          'Ordering: RabbitMQ per queue, Kafka per partition key, SQS FIFO per message group.',
          'Replay: only Kafka.',
          'Routing: RabbitMQ exchanges are richest.',
          'Ops: SQS none, RabbitMQ moderate, Kafka highest (unless managed).',
          'Pick by access pattern: work distribution vs event log vs serverless simplicity.',
        ],
        followUp: 'How does Kafka scale consumers, and what limits it?',
        trap: 'Saying Kafka preserves order across a whole topic.',
      },
    ],
  },

  // ───────────────────────────────────────────────────────────
  'background-jobs': {
    summary: 'Background jobs move slow or unreliable work (emails, reports, image processing, webhooks) out of the request: the API enqueues and responds immediately, separate workers process with retries, backoff and monitoring.',
    topics: ['background jobs', 'job queue', '202 Accepted', 'retries', 'exponential backoff', 'jitter', 'idempotent jobs', 'cron jobs', 'scheduled jobs', 'worker processes', 'job status'],
    sections: [
      section('introduction', undefined,
        text("Users shouldn't wait 8 seconds for a PDF or a third-party email API. Do the minimum in the request, enqueue the rest, and let workers finish it."),
      ),
      section('definition', 'Definition',
        bullets(
          "A **job** is a serializable description of work (`{ type: 'send-welcome', userId: 42 }`).",
          "A **queue** stores jobs durably (Redis, a DB table, a broker).",
          "**Workers** are separate processes that pull and execute jobs.",
          "Lifecycle: waiting → active → completed | failed → (retry after delay) → … → dead/failed permanently.",
        ),
        table('In-request vs background', ['Work', 'Keep in request?', 'Why'], [
          ['Validate + save order', 'Yes', 'User needs the result'],
          ['Send confirmation email', 'No', 'Slow, external, retryable'],
          ['Generate invoice PDF', 'No', 'CPU-heavy'],
          ['Charge card', 'Usually yes (or async with status)', 'User needs to know if it failed'],
          ['Recompute recommendations', 'No', 'Not user-facing; batchable'],
        ]),
      ),
      section('why', 'Why',
        bullets(
          "Faster responses and fewer timeouts.",
          "Automatic retries for flaky dependencies.",
          "Independent scaling: 2 API pods, 10 worker pods during a batch.",
          "Failures are visible and replayable instead of lost in a request log.",
        ),
      ),
      section('internals', 'Request → queue → worker',
        flow(['Client: POST /reports', 'API: validate, enqueue job, return 202 + jobId', 'Queue: job waiting', 'Worker: process, update progress', 'Worker: store result, mark completed', 'Client: GET /reports/:jobId or webhook/WebSocket notification'], { title: 'Async job pattern', direction: 'vertical' }),
        bullets(
          "**Exponential backoff**: wait `base × 2^(attempt-1)` between retries; add **jitter** to avoid thundering herds.",
          "**Idempotent jobs**: retries and stalled-job recovery mean a job can run more than once.",
          "**Timeouts**: a job without a timeout can hang a worker forever.",
          "**Scheduling**: cron-like repeatable jobs belong in the queue system, not `setInterval` in every API instance (which would run N times).",
        ),
      ),
      section('example', 'Retry delays and the 202 pattern',
        code({
          title: 'Exponential backoff schedule',
          code: dedent(`
            function backoff(attempt, base = 1000, cap = 30000) {
              return Math.min(cap, base * 2 ** (attempt - 1));
            }
            for (let attempt = 1; attempt <= 6; attempt++) {
              console.log(\`attempt \${attempt} failed -> retry in \${backoff(attempt)} ms\`);
            }
          `),
          expectedOutput: 'attempt 1 failed -> retry in 1000 ms\nattempt 2 failed -> retry in 2000 ms\nattempt 3 failed -> retry in 4000 ms\nattempt 4 failed -> retry in 8000 ms\nattempt 5 failed -> retry in 16000 ms\nattempt 6 failed -> retry in 30000 ms',
          explanation: [
            'Delay doubles each attempt: 1 s, 2 s, 4 s, 8 s, 16 s.',
            'The cap stops it at 30 s (instead of 32 s).',
            'In production add jitter, e.g. `delay * (0.5 + Math.random() / 2)`.',
          ],
          runnable: true,
        }),
        code({
          title: 'API side: enqueue and respond 202',
          code: dedent(`
            app.post('/reports', async (req, res) => {
              const job = await reportQueue.add('monthly', { userId: req.user.id, month: req.body.month },
                { jobId: \`monthly:\${req.user.id}:\${req.body.month}\` });   // dedupe identical requests
              res.status(202).location(\`/reports/\${job.id}\`).json({ jobId: job.id, status: 'queued' });
            });

            app.get('/reports/:id', async (req, res) => {
              const job = await reportQueue.getJob(req.params.id);
              if (!job) return res.sendStatus(404);
              res.json({ status: await job.getState(), progress: job.progress, result: job.returnvalue ?? null });
            });
          `),
          expectedOutput: 'HTTP/1.1 202 Accepted\nLocation: /reports/monthly:42:2026-10\n\n{"jobId":"monthly:42:2026-10","status":"queued"}',
          explanation: [
            '`202 Accepted` signals "received, not done yet".',
            'A deterministic `jobId` makes enqueueing idempotent: double-clicks don\'t create two reports.',
            'The queue API shown is BullMQ (next lesson).',
          ],
        }),
      ),
      section('real-world', 'Real-world backend usage',
        bullets(
          "Emails/SMS/push, webhook delivery, image/video processing, report exports, search indexing, data imports, nightly cleanups.",
          "Run workers as a separate deployment from the API so heavy jobs never affect request latency.",
          "Monitor queue depth, job age (oldest waiting), failure rate; alert on growth.",
          "Tools: BullMQ (Redis), pg-boss / Graphile Worker (PostgreSQL), Agenda (MongoDB), SQS + Lambda — all third-party.",
        ),
      ),
      section('mistakes', 'Common mistakes',
        code({
          title: 'Wrong vs right: fire-and-forget promise',
          code: dedent(`
            // Wrong: lost on crash/deploy; no retries; unhandled rejection may kill the process
            app.post('/signup', async (req, res) => {
              const user = await createUser(req.body);
              sendWelcomeEmail(user);        // not awaited, not durable
              res.status(201).json(user);
            });

            // Right: durable job with retries
            app.post('/signup', async (req, res) => {
              const user = await createUser(req.body);
              await emailQueue.add('welcome', { userId: user.id }, { attempts: 5, backoff: { type: 'exponential', delay: 1000 } });
              res.status(201).json(user);
            });
          `),
        }),
        bullets(
          "Putting whole objects in job payloads — they go stale; pass IDs and reload.",
          "`setInterval` cron inside API pods → runs once per pod.",
          "Infinite retries for permanent errors (validation, 4xx) — mark them as non-retryable.",
        ),
      ),
      section('interview', 'Interview angle',
        interviewTip("Describe the 202 + job id + status endpoint pattern, then talk retries with exponential backoff + jitter and idempotent jobs."),
      ),
      section('practice', 'Practice',
        text("Convert a synchronous `POST /import` (CSV of 100k rows) into an async job with progress reporting and a status endpoint."),
      ),
      section('summary', 'Summary',
        bullets(
          "Request does the minimum; workers do the rest.",
          "Durable queue + retries with backoff + jitter + DLQ/failed set.",
          "Idempotent jobs; pass IDs not snapshots.",
          "Separate worker deployment; monitor depth and age.",
        ),
      ),
    ],
    revisionNotes: [
      '202 Accepted + jobId + status endpoint.',
      'Backoff: base × 2^(attempt-1), capped, with jitter.',
      'Jobs may run more than once → idempotent.',
      'Deterministic jobId to dedupe.',
      'No setInterval cron in multi-instance APIs.',
    ],
    quiz: [
      {
        kind: 'scenario', difficulty: 'intermediate',
        prompt: 'A nightly cleanup is implemented with setInterval in the API. After scaling to 6 pods, rows are deleted 6 times and DB load spikes. Fix?',
        options: ['Increase the interval', 'Move it to a single repeatable job in the queue system (or a scheduled job runner)', 'Run it in cluster mode', 'Use setTimeout instead'],
        answer: 1,
        explanation: 'Each pod runs its own interval. A repeatable queue job (or one scheduled CronJob) runs once per schedule regardless of replicas.',
      },
      {
        kind: 'mcq', difficulty: 'intermediate',
        prompt: 'With base 500 ms exponential backoff and no cap, what is the delay before the 4th attempt (after 3 failures)?',
        options: ['1500 ms', '2000 ms', '4000 ms', '1000 ms'],
        answer: 1,
        explanation: 'Delay after failure n = 500 × 2^(n-1): 500, 1000, 2000. The third failure waits 2000 ms before attempt 4.',
      },
    ],
    interview: [
      {
        category: 'advanced', kind: 'scenario', difficulty: 'intermediate', topic: 'Background jobs',
        question: 'A signup endpoint takes 4 seconds because it sends a welcome email and syncs to a CRM. How do you redesign it?',
        shortAnswer: 'Create the user synchronously, enqueue durable background jobs for the email and CRM sync with retries and backoff, and return 201 immediately; workers process the jobs separately.',
        detailedAnswer: [
          'Only work the user must wait for stays in the request.',
          'Jobs survive crashes and deploys, unlike fire-and-forget promises.',
          'Retries with exponential backoff + jitter for flaky providers.',
          'Idempotent handlers (dedupe on userId) because jobs may run twice.',
          'Consider the outbox pattern so the job is enqueued if and only if the user commit succeeded.',
        ],
        followUp: 'What if the enqueue call fails after the user was saved?',
        trap: 'Just removing await from sendEmail().',
      },
      {
        category: 'advanced', kind: 'concept', difficulty: 'advanced', topic: 'Background jobs',
        question: 'Why add jitter to retry backoff, and what other safeguards should a retry policy have?',
        shortAnswer: 'Without jitter, many jobs that failed together retry at the same instants and overload the recovering dependency (thundering herd); jitter spreads them out. Also cap the delay and attempts, distinguish retryable from permanent errors, and send exhausted jobs to a failed/DLQ set.',
        detailedAnswer: [
          'Full jitter: random(0, base × 2^n).',
          'Cap max delay so jobs are not delayed for hours unintentionally.',
          'Do not retry 4xx/validation errors.',
          'Circuit breaker when a dependency is down.',
          'Alert on DLQ growth.',
        ],
        followUp: 'How would you replay jobs from the DLQ safely?',
        trap: 'Retrying immediately in a tight loop.',
      },
    ],
  },

  // ───────────────────────────────────────────────────────────
  bullmq: {
    summary: 'BullMQ (third-party) is a Redis-backed job queue for Node: Queue to add jobs, Worker to process them with concurrency, retries/backoff, delayed and repeatable jobs, and QueueEvents to observe progress.',
    topics: ['BullMQ', 'Queue', 'Worker', 'QueueEvents', 'attempts', 'backoff', 'delayed jobs', 'repeatable jobs', 'job schedulers', 'concurrency', 'rate limiter', 'stalled jobs', 'FlowProducer', 'Redis'],
    sections: [
      section('introduction', undefined,
        text("BullMQ is the most common way to run background jobs in Node when you already have Redis. It is a third-party package (successor to Bull), not part of Node core."),
      ),
      section('definition', 'Definition',
        table('BullMQ building blocks', ['Class', 'Role'], [
          ['Queue', 'Add jobs (`add`, `addBulk`), inspect counts, pause, clean'],
          ['Worker', 'Process jobs with an async function; concurrency, limiter, lock renewal'],
          ['QueueEvents', 'Listen to global events (completed, failed, progress) across all workers via Redis Streams'],
          ['FlowProducer', 'Parent/child job trees (parent runs after children)'],
          ['Job', 'Data, options, progress, return value, attempts'],
        ]),
        warn("BullMQ requires **Redis** (or a compatible server). Use a Redis with `maxmemory-policy noeviction` — eviction would delete job keys. When you pass your own ioredis instance to a Worker, set `maxRetriesPerRequest: null`."),
      ),
      section('why', 'Why BullMQ',
        bullets(
          "Retries, exponential backoff, delayed and repeatable jobs out of the box.",
          "Horizontal scaling: start more Worker processes; Redis coordinates locks.",
          "Rate limiting per queue, priorities, job dependencies, progress reporting.",
        ),
      ),
      section('internals', 'How it works on Redis',
        steps(
          "`queue.add` stores the job hash and pushes its id to the **wait** list (or the **delayed** sorted set when `delay` is set; **prioritized** set when `priority` is set).",
          "A Worker atomically moves a job wait → **active** with a Lua script and takes a **lock** that it renews periodically.",
          "On success: job → **completed** with `returnvalue`; on throw: if attempts remain → **delayed** with backoff, else → **failed**.",
          "If a worker dies, its lock expires; the job is detected as **stalled** and moved back to wait (up to `maxStalledCount`) → jobs are at-least-once, so processors must be idempotent.",
          "Events are written to a Redis Stream that `QueueEvents` instances read.",
        ),
        diagram('queue-worker', 'Producers add to Redis; workers lock, process, retry or fail jobs.'),
      ),
      section('example', 'Queue, Worker, QueueEvents',
        code({
          title: 'queue.js — producer',
          code: dedent(`
            import { Queue } from 'bullmq';
            const connection = { host: 'localhost', port: 6379 };
            export const emailQueue = new Queue('email', { connection });

            await emailQueue.add('welcome', { userId: 42 }, {
              attempts: 5,
              backoff: { type: 'exponential', delay: 1000 },   // 1s, 2s, 4s, 8s
              removeOnComplete: 1000,                            // keep last 1000 completed
              removeOnFail: 5000,
            });

            await emailQueue.add('reminder', { userId: 42 }, { delay: 24 * 60 * 60 * 1000 }); // run in 24h

            // repeatable (cron) job — v5.16+ API; older versions: add(name, data, { repeat: { pattern } })
            await emailQueue.upsertJobScheduler('digest', { pattern: '0 8 * * *' }, { name: 'daily-digest', data: {} });
          `),
          explanation: [
            'Exponential backoff in BullMQ: `delay × 2^(attemptsMade - 1)`.',
            '`removeOnComplete/removeOnFail` keep Redis memory bounded — without them completed jobs accumulate forever.',
            'Job schedulers / repeatable jobs are stored once, so they run once per schedule no matter how many producers start.',
          ],
          versionNote: 'BullMQ v5. upsertJobScheduler added in v5.16; the repeat option still works but is deprecated in newer releases.',
        }),
        code({
          title: 'worker.js — consumer (separate process)',
          code: dedent(`
            import { Worker } from 'bullmq';
            const worker = new Worker('email', async (job) => {
              if (job.name === 'welcome') {
                await job.updateProgress(10);
                const user = await db.users.findById(job.data.userId);
                await mailer.send(user.email, 'Welcome!');
                return { sentTo: user.email };          // becomes job.returnvalue
              }
            }, {
              connection: { host: 'localhost', port: 6379 },
              concurrency: 20,                           // 20 jobs in parallel in this process (I/O-bound)
              limiter: { max: 100, duration: 1000 },     // max 100 jobs/s across the queue
            });

            worker.on('failed', (job, err) => console.error(\`job \${job?.id} failed (attempt \${job?.attemptsMade}): \${err.message}\`));

            process.on('SIGTERM', async () => { await worker.close(); process.exit(0); }); // finish active jobs
          `),
          expectedOutput: 'job 17 failed (attempt 1): SMTP timeout\njob 17 failed (attempt 2): SMTP timeout\n(then succeeds on attempt 3 — no further output)',
          explanation: [
            '`concurrency` is per Worker instance; for CPU-heavy jobs keep it ~1 and run more processes or use sandboxed processors.',
            "The worker's 'failed' event fires for each failed attempt, including ones that will be retried.",
            '`worker.close()` stops taking new jobs and waits for active ones — essential for graceful deploys.',
          ],
        }),
        code({
          title: 'Observing from the API with QueueEvents',
          code: dedent(`
            import { QueueEvents } from 'bullmq';
            const events = new QueueEvents('email', { connection: { host: 'localhost', port: 6379 } });
            events.on('completed', ({ jobId, returnvalue }) => console.log('done', jobId, returnvalue));
            events.on('failed', ({ jobId, failedReason }) => console.log('failed', jobId, failedReason));
          `),
          expectedOutput: 'done 17 {"sentTo":"ada@example.com"}',
          explanation: ['QueueEvents receives events from **all** workers (via a Redis Stream), unlike Worker events which are local.'],
        }),
      ),
      section('real-world', 'Real-world backend usage',
        bullets(
          "Email/notification queues with `limiter` matching the provider's rate limit.",
          "Image pipelines with sandboxed processors (a file path instead of a function runs the processor in a child process/worker thread).",
          "Bull Board / Taskforce.sh dashboards (third-party) for inspecting and retrying failed jobs.",
          "Throw `UnrecoverableError` for permanent failures so BullMQ skips remaining attempts.",
        ),
      ),
      section('mistakes', 'Common mistakes',
        code({
          title: 'Wrong vs right: CPU work with high concurrency',
          code: dedent(`
            // Wrong: 50 concurrent CPU-heavy jobs on one event loop: lock renewals starve → jobs marked stalled
            new Worker('thumbs', async (job) => resizeSync(job.data.path), { connection, concurrency: 50 });

            // Right: sandboxed processor runs in a separate process/thread
            new Worker('thumbs', new URL('./resize-processor.js', import.meta.url), { connection, concurrency: 4 });
          `),
          explanation: ['A blocked event loop cannot renew job locks, so BullMQ thinks the worker died and re-runs the job elsewhere — duplicated work.'],
        }),
        bullets(
          "No `removeOnComplete` → Redis memory grows unbounded.",
          "Using an eviction policy on the Redis instance.",
          "Non-idempotent processors (stalled jobs and retries re-run them).",
          "Not closing workers on SIGTERM → active jobs become stalled during every deploy.",
        ),
      ),
      section('interview', 'Interview angle',
        interviewTip("Know the lifecycle (wait → active → completed/failed, delayed for retries), that stalled jobs make processing at-least-once, and why Redis must not evict keys."),
      ),
      section('practice', 'Practice',
        text("Build an `email` queue with 5 attempts and exponential backoff. Make the processor fail randomly 50% of the time and watch attempts in QueueEvents. Add a daily scheduler and confirm it runs once with 3 worker processes."),
      ),
      section('summary', 'Summary',
        bullets(
          "Queue adds, Worker processes, QueueEvents observes — all over Redis (third-party lib).",
          "Retries with attempts + backoff; delayed and repeatable/scheduled jobs.",
          "Concurrency per worker; limiter per queue.",
          "Stalled-job recovery ⇒ idempotent processors; graceful `worker.close()`.",
        ),
      ),
    ],
    revisionNotes: [
      'BullMQ = third-party, requires Redis (noeviction).',
      'Queue.add(name, data, { attempts, backoff, delay, jobId, removeOnComplete }).',
      'Worker(name, processor, { concurrency, limiter, connection }).',
      'QueueEvents for global completed/failed/progress.',
      'Exponential backoff: delay × 2^(attemptsMade-1).',
      'Stalled jobs re-run → idempotency; blocked loop → stalls.',
      'upsertJobScheduler (v5.16+) for cron; earlier: repeat option.',
    ],
    quiz: [
      {
        kind: 'mcq', difficulty: 'intermediate',
        prompt: 'Which BullMQ class should an API process use to be notified when any worker completes a job?',
        options: ['Worker', 'QueueEvents', 'FlowProducer', 'Queue.on("completed")'],
        answer: 1,
        explanation: 'QueueEvents reads the global event stream in Redis. Worker events only fire in the process running that worker.',
      },
      {
        kind: 'scenario', difficulty: 'advanced',
        prompt: 'Image jobs are frequently processed twice and logs show "job stalled". The worker runs sharp-like sync CPU code with concurrency 30. Best fix?',
        options: ['Increase attempts', 'Use a sandboxed processor / worker threads and lower concurrency so the event loop can renew locks', 'Set removeOnComplete: true', 'Switch Redis to allkeys-lru'],
        answer: 1,
        explanation: 'A blocked loop misses lock renewals, so jobs are declared stalled and re-run. Moving CPU work off the worker\'s loop fixes it; eviction would make things worse.',
      },
      {
        kind: 'complete-code', difficulty: 'intermediate',
        prompt: 'Complete the options so the job retries up to 5 times waiting 1s, 2s, 4s, 8s.',
        code: "await queue.add('sync', data, { attempts: 5, /* ??? */ });",
        options: ["backoff: { type: 'fixed', delay: 1000 }", "backoff: { type: 'exponential', delay: 1000 }", 'delay: 1000', "repeat: { every: 1000 }"],
        answer: 1,
        explanation: "Exponential backoff doubles the base delay per attempt. 'fixed' would wait 1s every time; delay only postpones the first run; repeat creates a recurring job.",
      },
    ],
    interview: [
      {
        category: 'advanced', kind: 'concept', difficulty: 'advanced', topic: 'BullMQ',
        question: 'What is a stalled job in BullMQ and why does it force you to write idempotent processors?',
        shortAnswer: 'A job is stalled when its worker stops renewing the job lock (crash, kill, or blocked event loop); BullMQ moves it back to waiting so another worker processes it, which means a job can execute more than once.',
        detailedAnswer: [
          'Workers hold a lock per active job and renew it on a timer.',
          'Lock expiry → stalled checker moves the job back (up to maxStalledCount, then failed).',
          'A long sync CPU task blocks renewal even though the worker is alive.',
          'Hence at-least-once semantics → idempotent side effects.',
          'Mitigate with sandboxed processors and graceful worker.close() on shutdown.',
        ],
        followUp: 'How do you make a "charge customer" job idempotent?',
        trap: 'Assuming each job runs exactly once because it has a unique id.',
      },
      {
        category: 'advanced', kind: 'concept', difficulty: 'intermediate', topic: 'BullMQ',
        question: 'How do you configure retries, delays and recurring jobs in BullMQ?',
        shortAnswer: 'Pass attempts and backoff ({ type: "exponential", delay }) when adding a job, use the delay option for one-off delayed jobs, and use job schedulers (upsertJobScheduler, or the older repeat option) with a cron pattern or interval for recurring jobs.',
        detailedAnswer: [
          'Failed attempts move the job to delayed until the backoff elapses.',
          'Delayed jobs live in a Redis sorted set keyed by timestamp.',
          'Schedulers are stored once, so multiple producers do not duplicate them.',
          'UnrecoverableError skips remaining attempts.',
        ],
        followUp: 'What Redis configuration must you check before running BullMQ in production?',
        trap: 'Implementing retries with setTimeout inside the processor.',
      },
    ],
  },

  // ───────────────────────────────────────────────────────────
  websockets: {
    summary: 'WebSocket upgrades an HTTP/1.1 connection (101 Switching Protocols) into a persistent full-duplex channel; in Node you serve it with the ws package (third-party) and Node 22+ ships a global WebSocket client.',
    topics: ['WebSocket', 'upgrade handshake', '101 Switching Protocols', 'Sec-WebSocket-Key', 'Sec-WebSocket-Accept', 'ws package', 'ping/pong heartbeat', 'backpressure', 'bufferedAmount', 'SSE', 'long polling', 'global WebSocket'],
    sections: [
      section('introduction', undefined,
        text("HTTP is request/response: the server can't speak first. Chat, live dashboards and multiplayer games need the server to push instantly. WebSocket keeps one TCP connection open in both directions."),
      ),
      section('definition', 'Definition',
        bullets(
          "WebSocket (RFC 6455) is a protocol that starts as an HTTP GET with `Upgrade: websocket` and, after `101 Switching Protocols`, exchanges framed messages (text/binary, ping/pong, close).",
          "URLs use `ws://` and `wss://` (TLS — always use in production).",
          "Node core has no WebSocket **server**; use `ws` (third-party). Node 22 exposes a browser-compatible global `WebSocket` **client** (enabled by default in v22, stable since v22.4).",
        ),
        table('Real-time options', ['', 'Short polling', 'Long polling', 'SSE', 'WebSocket'], [
          ['Direction', 'Client pulls', 'Client pulls, server holds', 'Server → client', 'Both ways'],
          ['Transport', 'Repeated HTTP', 'HTTP held open', 'One HTTP response stream', 'Upgraded TCP connection'],
          ['Latency', 'Up to interval', 'Low', 'Low', 'Lowest'],
          ['Reconnect', 'N/A', 'Manual', 'Built-in (EventSource)', 'Manual (or library)'],
          ['Binary', 'Yes', 'Yes', 'No (text)', 'Yes'],
          ['Proxies/CDN', 'Easy', 'Easy', 'Easy (plain HTTP)', 'Needs upgrade support'],
          ['Best for', 'Rare updates', 'Fallback', 'Notifications, feeds, LLM token streams', 'Chat, collaboration, games'],
        ]),
      ),
      section('why', 'Why',
        bullets(
          "Server push without polling overhead (no headers per message).",
          "Low-latency bidirectional messaging.",
          "But: stateful connections complicate scaling, deploys and load balancing.",
        ),
      ),
      section('internals', 'The upgrade handshake',
        steps(
          "Client sends `GET /chat HTTP/1.1` with `Connection: Upgrade`, `Upgrade: websocket`, `Sec-WebSocket-Version: 13` and a random base64 `Sec-WebSocket-Key`.",
          "Server computes `Sec-WebSocket-Accept = base64(SHA-1(key + \"258EAFA5-E914-47DA-95CA-C5AB0DC85B11\"))`.",
          "Server replies `HTTP/1.1 101 Switching Protocols` with that accept value; from now on the socket carries WebSocket frames.",
          "In Node, `http.Server` emits `'upgrade'` (req, socket, head) instead of `'request'` — this is where `ws` hooks in and where you authenticate.",
          "Client→server frames are masked; control frames: ping, pong, close (with status code, e.g. 1000 normal, 1001 going away).",
        ),
        flow(['Client: GET + Upgrade: websocket + Sec-WebSocket-Key', 'Server: verify origin/auth in upgrade event', 'Server: 101 + Sec-WebSocket-Accept', 'Both: framed messages, ping/pong', 'Either: close frame (code, reason)'], { title: 'WebSocket lifecycle', direction: 'horizontal' }),
      ),
      section('example', 'Handshake math and a ws server',
        code({
          title: 'Computing Sec-WebSocket-Accept',
          code: dedent(`
            import { createHash } from 'node:crypto';
            const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
            const key = 'dGhlIHNhbXBsZSBub25jZQ==';            // example key from RFC 6455
            console.log(createHash('sha1').update(key + GUID).digest('base64'));
          `),
          expectedOutput: 's3pPLMBiTxaQ9kYGzzhZRbK+xOo=',
          explanation: [
            'This proves the server understood the WebSocket handshake (not a cache or misconfigured proxy).',
            'It is not security — authentication must be done separately.',
          ],
        }),
        code({
          title: 'ws server with auth on upgrade and heartbeat',
          code: dedent(`
            import http from 'node:http';
            import { WebSocketServer } from 'ws';          // third-party

            const server = http.createServer(app);
            const wss = new WebSocketServer({ noServer: true });

            server.on('upgrade', async (req, socket, head) => {
              const user = await authenticate(req);         // e.g. token in cookie / query
              if (!user) { socket.write('HTTP/1.1 401 Unauthorized\\r\\n\\r\\n'); return socket.destroy(); }
              wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req, user));
            });

            wss.on('connection', (ws, req, user) => {
              ws.isAlive = true;
              ws.on('pong', () => { ws.isAlive = true; });
              ws.on('message', (data, isBinary) => {
                for (const client of wss.clients) {
                  if (client.readyState === client.OPEN && client.bufferedAmount < 1_000_000) {
                    client.send(data, { binary: isBinary });   // skip slow consumers (backpressure)
                  }
                }
              });
            });

            // heartbeat: drop dead connections that never answered
            const interval = setInterval(() => {
              for (const ws of wss.clients) {
                if (!ws.isAlive) { ws.terminate(); continue; }
                ws.isAlive = false; ws.ping();
              }
            }, 30_000);
            wss.on('close', () => clearInterval(interval));
            server.listen(3000);
          `),
          explanation: [
            '`noServer` + `handleUpgrade` lets you authenticate before accepting the connection.',
            'Ping/pong detects half-open TCP connections (mobile networks, NAT timeouts) and frees memory.',
            '`bufferedAmount` shows bytes queued but not yet sent — a guard against one slow client bloating memory.',
          ],
        }),
        code({
          title: 'Node 22+ global WebSocket client',
          code: dedent(`
            const ws = new WebSocket('wss://echo.websocket.org');
            ws.addEventListener('open', () => ws.send('hello'));
            ws.addEventListener('message', (e) => { console.log('got:', e.data); ws.close(); });
          `),
          expectedOutput: 'got: hello\n(the first message may be a server greeting, depending on the echo service)',
          explanation: ['Same API as browsers (EventTarget-based); no package needed in Node 22+. Node 21 needed `--experimental-websocket`.'],
          versionNote: 'Global WebSocket client: enabled by default in Node 22.0, marked stable in 22.4.',
        }),
      ),
      section('real-world', 'Real-world backend usage',
        bullets(
          "Scaling: each instance holds its own connections → broadcast across instances via Redis Pub/Sub (or use Socket.IO with the Redis adapter).",
          "Load balancers must support upgrade and long idle timeouts (nginx: `proxy_set_header Upgrade $http_upgrade; proxy_set_header Connection \"upgrade\"; proxy_read_timeout 3600s;`).",
          "Deploys drop connections — clients must reconnect with exponential backoff and resync state.",
          "Prefer SSE when updates only flow server → client (simpler, plain HTTP, auto-reconnect).",
        ),
      ),
      section('mistakes', 'Common mistakes',
        code({
          title: 'Wrong vs right: no authentication / origin check',
          code: dedent(`
            // Wrong: accepts any connection from any site (cross-site WebSocket hijacking with cookies)
            const wss = new WebSocketServer({ server });

            // Right: check Origin and credentials during the upgrade
            server.on('upgrade', (req, socket, head) => {
              if (!ALLOWED_ORIGINS.has(req.headers.origin)) return socket.destroy();
              // ...authenticate, then wss.handleUpgrade(...)
            });
          `),
        }),
        bullets(
          "No heartbeat → thousands of dead connections leak memory.",
          "Keeping connections in a Set and never deleting them on `close`.",
          "Assuming messages from a client are trustworthy — validate every message like an HTTP body.",
          "Using WebSockets for simple notifications that SSE handles more cheaply.",
        ),
      ),
      section('interview', 'Interview angle',
        interviewTip("Walk through the upgrade (headers → 101), then focus on operations: auth on upgrade, heartbeats, backpressure, and horizontal scaling via Pub/Sub. Compare with SSE and polling."),
      ),
      section('practice', 'Practice',
        text("Build a chat with `ws`: authenticate with a JWT during upgrade, broadcast to rooms kept in a `Map<room, Set<ws>>`, add a 30 s heartbeat, and clean up on close."),
      ),
      section('summary', 'Summary',
        bullets(
          "HTTP GET + Upgrade → 101 → full-duplex frames.",
          "Server: `ws` (third-party); client: global WebSocket in Node 22+.",
          "Authenticate in the `upgrade` handler; check Origin.",
          "Heartbeats, backpressure, cleanup, cross-instance fan-out.",
          "SSE for one-way push; WebSocket for two-way.",
        ),
      ),
    ],
    revisionNotes: [
      'Handshake: Upgrade: websocket, Sec-WebSocket-Key → 101 + Sec-WebSocket-Accept.',
      'Accept = base64(sha1(key + 258EAFA5-E914-47DA-95CA-C5AB0DC85B11)).',
      "Node http 'upgrade' event; ws.handleUpgrade for auth.",
      'Ping/pong heartbeat, terminate dead sockets.',
      'bufferedAmount for backpressure.',
      'Node 22: global WebSocket client.',
      'SSE = text, one-way, auto-reconnect.',
    ],
    quiz: [
      {
        kind: 'mcq', difficulty: 'intermediate',
        prompt: 'Which HTTP status code completes a successful WebSocket handshake?',
        options: ['200 OK', '101 Switching Protocols', '426 Upgrade Required', '204 No Content'],
        answer: 1,
        explanation: '101 means the server agrees to switch to the WebSocket protocol. 426 is what a server returns when it requires an upgrade the client did not request.',
      },
      {
        kind: 'scenario', difficulty: 'intermediate',
        prompt: 'A dashboard only needs the server to push price updates every second; clients never send data. Simplest robust choice?',
        options: ['WebSocket with Socket.IO', 'Server-Sent Events', 'Short polling every 100 ms', 'Long polling with custom reconnect'],
        answer: 1,
        explanation: 'SSE is one-way server push over plain HTTP with built-in reconnection; WebSockets work but add upgrade, heartbeat and scaling complexity you do not need.',
      },
      {
        kind: 'find-bug', difficulty: 'advanced',
        prompt: 'Memory grows steadily on a WebSocket server even though active users are stable. Most likely cause?',
        code: "wss.on('connection', (ws) => {\n  ws.on('message', handle);\n});",
        options: ['message handler is synchronous', 'No heartbeat: half-open connections from vanished clients are never detected and terminated', 'ws should be cloned', 'wss.clients is a Set'],
        answer: 1,
        explanation: 'Clients that lose network without a close frame leave half-open TCP connections. Ping/pong with terminate() cleans them up.',
      },
    ],
    interview: [
      {
        category: 'advanced', kind: 'concept', difficulty: 'intermediate', topic: 'WebSockets',
        question: 'Explain the WebSocket upgrade handshake.',
        shortAnswer: 'The client sends an HTTP/1.1 GET with Upgrade: websocket, Connection: Upgrade, Sec-WebSocket-Version: 13 and a random Sec-WebSocket-Key; the server responds 101 Switching Protocols with Sec-WebSocket-Accept (base64 SHA-1 of the key plus a fixed GUID), after which the connection carries WebSocket frames.',
        detailedAnswer: [
          'Node emits the upgrade event with the raw socket.',
          'The accept hash proves protocol awareness, not identity.',
          'Authentication and Origin checks happen during the upgrade.',
          'Frames: text, binary, ping, pong, close; client frames are masked.',
        ],
        followUp: 'How do you authenticate a WebSocket connection?',
        trap: 'Thinking Sec-WebSocket-Key provides security.',
      },
      {
        category: 'advanced', kind: 'concept', difficulty: 'advanced', topic: 'WebSockets',
        question: 'How do you scale a WebSocket server to multiple instances?',
        shortAnswer: 'Each instance holds its own connections, so put a pub/sub layer (Redis, NATS) between instances to fan out messages, use a load balancer that supports upgrades with long timeouts, keep connection state external, and make clients reconnect and resync.',
        detailedAnswer: [
          'Publish events to a channel; each instance delivers to its local sockets.',
          'Sticky sessions are only required for multi-request handshakes (e.g. Socket.IO polling).',
          'Heartbeats and backpressure per connection.',
          'Graceful deploys: send close 1001 and let clients reconnect elsewhere.',
          'Capacity planning: memory per connection and file-descriptor limits (ulimit).',
        ],
        followUp: 'When would you choose SSE instead?',
        trap: 'Assuming the load balancer will broadcast to all instances for you.',
      },
    ],
  },
};

export default content;
