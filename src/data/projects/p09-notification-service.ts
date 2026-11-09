import type { Project } from '../../types';
import { dedent, entity } from './shared';

export const p09: Project = {
  id: 'p09',
  number: 9,
  level: 'advanced',
  title: 'Notification Service',
  status: 'ready',
  summary: 'A standalone service that accepts notification events, applies user preferences, fans out to email / SMS / push queues and delivers through pluggable channel strategies with retries, backoff, a dead-letter queue and end-to-end idempotency.',
  skills: ['Message queues (BullMQ)', 'Strategy pattern', 'Retries + exponential backoff', 'Idempotency keys', 'Dead-letter queue', 'Fan-out', 'Provider rate limits'],
  estHours: 16,
  prerequisites: [
    'm11-message-queues',
    'm11-bullmq',
    'm11-background-jobs',
    'm11-redis',
    'm15-strategy-pattern',
    'm15-message-driven-architecture',
    'm15-distributed-systems-fundamentals',
    'm13-mocking',
  ],
  requirements: {
    functional: [
      '`POST /v1/notifications` with a required `Idempotency-Key`: `{ userId, type, data }` → `202 { id }`.',
      'Each notification `type` (e.g. `order_shipped`) has a category, default channels and templates per channel.',
      'User preferences per category + channel (e.g. marketing email off); `security` category cannot be disabled.',
      'One delivery per (notification, channel); each delivered by its channel strategy (email, SMS, push).',
      'Transient failures retried with exponential backoff (6 attempts); permanent failures (invalid number, 4xx) fail immediately.',
      'Exhausted/permanent failures land in a dead-letter queue and can be replayed from an admin endpoint.',
      '`GET /v1/notifications/:id` returns per-channel status (`queued | sending | sent | failed | skipped`).',
      'Quiet hours: non-urgent deliveries are delayed until the user\'s quiet window ends.',
    ],
    nonFunctional: [
      'At-least-once processing, effectively-once delivery: idempotent ingest, idempotent workers, provider idempotency keys.',
      'A slow SMS provider must not delay emails → one queue + worker pool per channel.',
      'Respect provider limits with BullMQ\'s worker `limiter` (e.g. 50 SMS/s).',
      'Horizontal scale: API and workers are separate processes; add workers without code changes.',
      'Redis configured for queues: AOF persistence, `maxmemory-policy noeviction`.',
      'Graceful shutdown: workers finish in-flight jobs before exit.',
    ],
  },
  architecture: {
    diagramId: 'queue-worker',
    flow: [
      { label: 'Producer service', detail: 'POST /v1/notifications + Idempotency-Key' },
      { label: 'Ingest (txn)', detail: 'notification + deliveries rows' },
      { label: 'Enqueue', detail: 'notify-email / notify-sms / notify-push (jobId = deliveryId)' },
      { label: 'Channel worker', detail: 'load delivery → render → strategy.send()' },
      { label: 'Provider', detail: 'SMTP / SMS API / FCM, with idempotency key' },
      { label: 'Result', detail: 'sent ✓ | retry with backoff | DLQ' },
    ],
    notes: [
      '**Strategy pattern**: every channel implements `send(recipient, message, ctx)` and `isRetryable(err)`. The processor only knows the interface; adding WhatsApp = one new class + registry entry.',
      'Jobs are enqueued **after** the DB transaction commits, so a worker never reads a row that does not exist yet. A sweeper re-enqueues `queued` deliveries older than 5 min (covers a crash between commit and enqueue); `jobId = deliveryId` makes that safe.',
      'Three idempotency layers: `UNIQUE (source, idempotency_key)` on ingest, the worker skips `sent` deliveries, and providers receive `deliveryId` as their idempotency key.',
      'BullMQ (third-party) stores jobs in Redis and handles retries, backoff, delays and rate limits.',
    ],
  },
  folderStructure: dedent(`
    notification-service/
    ├── migrations/001_notifications.sql
    ├── src/
    │   ├── api/
    │   │   ├── server.js
    │   │   ├── notifications.routes.js
    │   │   └── admin.routes.js        # DLQ list / replay
    │   ├── core/
    │   │   ├── ingest.service.js      # idempotent ingest + fan-out
    │   │   ├── preferences.js         # resolveTargets()
    │   │   ├── templates.js           # render()
    │   │   └── deliveries.repository.js
    │   ├── queues/
    │   │   ├── connection.js
    │   │   └── queues.js              # notify-email, notify-sms, notify-push, notify-dlq
    │   ├── channels/
    │   │   ├── channel-error.js
    │   │   ├── email.channel.js
    │   │   ├── sms.channel.js
    │   │   ├── push.channel.js
    │   │   └── index.js               # registry (strategy lookup)
    │   └── worker/
    │       ├── processor.js           # createProcessor({ channels, deliveries, render })
    │       ├── worker.js              # starts one Worker per channel
    │       └── sweeper.js
    └── test/processor.test.js
  `),
  databaseDesign: [
    entity('notifications', [
      ['id', 'UUID', 'PK DEFAULT gen_random_uuid()', ''],
      ['source', 'TEXT', 'NOT NULL', 'Calling service (from its API key)'],
      ['idempotency_key', 'TEXT', 'NOT NULL, UNIQUE (source, idempotency_key)', 'From the header'],
      ['request_hash', 'TEXT', 'NOT NULL', 'sha256 of body — same key + different body → 422'],
      ['user_id', 'TEXT', 'NOT NULL', 'Index'],
      ['type', 'TEXT', 'NOT NULL FK notification_types(key)', ''],
      ['data', 'JSONB', 'NOT NULL', 'Template variables'],
      ['created_at', 'TIMESTAMPTZ', 'DEFAULT now()', ''],
    ]),
    entity('deliveries', [
      ['id', 'UUID', 'PK', 'Also BullMQ jobId + provider idempotency key'],
      ['notification_id', 'UUID', 'FK notifications ON DELETE CASCADE', 'UNIQUE (notification_id, channel)'],
      ['channel', 'TEXT', "CHECK IN ('email','sms','push')", ''],
      ['recipient', 'TEXT', 'NOT NULL', 'Email / E.164 phone / push token'],
      ['status', 'TEXT', "DEFAULT 'queued'", 'queued | sending | sent | failed | skipped; Index (status, updated_at)'],
      ['attempts', 'INT', 'DEFAULT 0', ''],
      ['last_error', 'TEXT', 'NULL', ''],
      ['provider_message_id', 'TEXT', 'NULL', 'For delivery-receipt webhooks'],
      ['send_after', 'TIMESTAMPTZ', 'NULL', 'Quiet-hours delay'],
      ['sent_at / updated_at', 'TIMESTAMPTZ', '', ''],
    ]),
    entity('notification_types', [
      ['key', 'TEXT', 'PK', 'e.g. order_shipped, password_reset'],
      ['category', 'TEXT', 'NOT NULL', 'transactional | marketing | security'],
      ['channels', 'TEXT[]', 'NOT NULL', 'Default channels'],
      ['urgent', 'BOOLEAN', 'DEFAULT false', 'Ignores quiet hours'],
      ['templates', 'JSONB', 'NOT NULL', '{ email: { subject, html, text }, sms: { text }, push: { title, body } }'],
    ]),
    entity('user_contacts', [
      ['user_id', 'TEXT', 'PK', 'Synced from the user service'],
      ['email / phone / push_token', 'TEXT', 'NULL', ''],
      ['timezone', 'TEXT', "DEFAULT 'UTC'", 'IANA name'],
      ['quiet_start / quiet_end', 'TIME', 'NULL', 'e.g. 22:00 – 07:00 local'],
    ]),
    entity('user_preferences', [
      ['user_id', 'TEXT', 'PK (user_id, category, channel)', ''],
      ['category', 'TEXT', '', ''],
      ['channel', 'TEXT', '', ''],
      ['enabled', 'BOOLEAN', 'NOT NULL', 'Missing row = enabled'],
    ]),
  ],
  endpoints: [
    { method: 'POST', path: '/v1/notifications', description: 'Ingest an event (Idempotency-Key required) → 202, or 200 with the original id on replay.', auth: 'service API key' },
    { method: 'GET', path: '/v1/notifications/:id', description: 'Status per channel.', auth: 'service API key' },
    { method: 'GET', path: '/v1/users/:userId/preferences', description: 'Read preferences.', auth: 'service API key' },
    { method: 'PUT', path: '/v1/users/:userId/preferences', description: 'Update preferences (security category locked).', auth: 'service API key' },
    { method: 'GET', path: '/v1/admin/dlq?channel=sms', description: 'Dead-lettered deliveries.', auth: 'admin' },
    { method: 'POST', path: '/v1/admin/dlq/:deliveryId/replay', description: 'Reset to queued and re-enqueue.', auth: 'admin' },
    { method: 'POST', path: '/v1/webhooks/:provider', description: 'Delivery receipts (signature verified).', auth: 'provider signature' },
    { method: 'GET', path: '/health', description: 'API + Redis + DB checks.', auth: 'public' },
  ],
  steps: [
    {
      title: 'Queues and Redis connection',
      bullets: [
        'Install `bullmq` and `ioredis` (third-party). Workers need `maxRetriesPerRequest: null` on their connection.',
        'Default job options: 6 attempts, exponential backoff from 2 s (2, 4, 8, 16, 32 s), auto-clean old jobs.',
        'One queue per channel isolates providers from each other.',
      ],
      code: {
        id: 'p09-s1',
        title: 'src/queues/queues.js',
        language: 'javascript',
        code: dedent(`
          import { Queue } from 'bullmq';
          import IORedis from 'ioredis';
          import { config } from '../config.js';

          export const connection = new IORedis(config.REDIS_URL, { maxRetriesPerRequest: null });

          export const CHANNELS = ['email', 'sms', 'push'];

          const defaultJobOptions = {
            attempts: 6,
            backoff: { type: 'exponential', delay: 2_000 },
            removeOnComplete: { age: 24 * 3600, count: 10_000 },
            removeOnFail: { age: 7 * 24 * 3600 },
          };

          export const queues = Object.fromEntries(
            CHANNELS.map((channel) => [channel, new Queue(\`notify-\${channel}\`, { connection, defaultJobOptions })]),
          );

          export const deadLetterQueue = new Queue('notify-dlq', { connection });

          export function enqueueDelivery({ id, channel, delayMs = 0 }) {
            // jobId = delivery id → adding the same delivery twice is a no-op while the job exists
            return queues[channel].add('deliver', { deliveryId: id }, { jobId: id, delay: delayMs });
          }
        `),
        versionNote: 'BullMQ 5.x. Queue names must not contain ":".',
      },
    },
    {
      title: 'Idempotent ingest with fan-out',
      bullets: [
        '`INSERT ... ON CONFLICT (source, idempotency_key) DO NOTHING` — the second request finds the existing row.',
        'Same key with a different body is a client bug → `422`, never a silent overwrite.',
        'Create all delivery rows in the same transaction; enqueue only **after** commit.',
      ],
      code: {
        id: 'p09-s2',
        title: 'src/core/ingest.service.js',
        language: 'javascript',
        code: dedent(`
          import { createHash } from 'node:crypto';
          import { withTransaction } from '../db/transaction.js';
          import { resolveTargets } from './preferences.js';
          import { enqueueDelivery } from '../queues/queues.js';
          import { AppError } from '../errors.js';

          const hashBody = (body) => createHash('sha256').update(JSON.stringify(body)).digest('hex');

          export async function ingest({ source, idempotencyKey, body }) {
            const requestHash = hashBody(body);

            const result = await withTransaction(async (client) => {
              const inserted = await client.query(
                \`INSERT INTO notifications (source, idempotency_key, request_hash, user_id, type, data)
                 VALUES ($1, $2, $3, $4, $5, $6)
                 ON CONFLICT (source, idempotency_key) DO NOTHING
                 RETURNING id\`,
                [source, idempotencyKey, requestHash, body.userId, body.type, body.data],
              );

              if (!inserted.rows[0]) {
                const { rows } = await client.query(
                  'SELECT id, request_hash FROM notifications WHERE source = $1 AND idempotency_key = $2',
                  [source, idempotencyKey],
                );
                if (rows[0].request_hash !== requestHash) {
                  throw new AppError(422, 'IDEMPOTENCY_MISMATCH', 'Idempotency-Key reused with a different body');
                }
                return { id: rows[0].id, replayed: true, deliveries: [] };
              }

              const notificationId = inserted.rows[0].id;
              const targets = await resolveTargets(client, body.userId, body.type);
              const deliveries = [];
              for (const t of targets) {
                const { rows } = await client.query(
                  \`INSERT INTO deliveries (notification_id, channel, recipient, send_after)
                   VALUES ($1, $2, $3, $4) RETURNING id, channel\`,
                  [notificationId, t.channel, t.recipient, t.sendAfter],
                );
                deliveries.push({ ...rows[0], delayMs: t.sendAfter ? t.sendAfter - Date.now() : 0 });
              }
              return { id: notificationId, replayed: false, deliveries };
            });

            // after COMMIT: a crash here is repaired by the sweeper (queued + old -> re-enqueue)
            await Promise.all(result.deliveries.map(enqueueDelivery));
            return result;
          }
        `),
      },
    },
    {
      title: 'Resolve channels from preferences and quiet hours',
      bullets: [
        'Start from the type\'s default channels, drop disabled ones and ones without a recipient.',
        '`security` notifications ignore opt-outs (password reset must always arrive).',
        'Quiet hours compute a `sendAfter` in the user\'s timezone with `Intl.DateTimeFormat`.',
      ],
      code: {
        id: 'p09-s3',
        title: 'src/core/preferences.js',
        language: 'javascript',
        code: dedent(`
          import { AppError } from '../errors.js';

          function localMinutes(date, timeZone) {
            const parts = new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
              .formatToParts(date);
            const get = (type) => Number(parts.find((p) => p.type === type).value);
            return get('hour') * 60 + get('minute');
          }

          const toMinutes = (hhmm) => {
            const [h, m] = hhmm.split(':').map(Number);
            return h * 60 + m;
          };

          /** Returns a Date when quiet hours end, or null if we may send now. */
          export function quietUntil(now, { timezone, quiet_start, quiet_end }) {
            if (!quiet_start || !quiet_end) return null;
            const nowMin = localMinutes(now, timezone);
            const start = toMinutes(quiet_start);
            const end = toMinutes(quiet_end);
            const inQuiet = start <= end ? nowMin >= start && nowMin < end : nowMin >= start || nowMin < end;
            if (!inQuiet) return null;
            const wait = (end - nowMin + 24 * 60) % (24 * 60);
            return new Date(now.getTime() + wait * 60_000);
          }

          export async function resolveTargets(db, userId, type) {
            const { rows: [nt] } = await db.query('SELECT category, channels, urgent FROM notification_types WHERE key = $1', [type]);
            if (!nt) throw new AppError(400, 'UNKNOWN_TYPE', \`Unknown notification type \${type}\`);

            const { rows: [contact] } = await db.query('SELECT * FROM user_contacts WHERE user_id = $1', [userId]);
            if (!contact) throw new AppError(404, 'UNKNOWN_USER', 'No contact details for user');

            const { rows: prefs } = await db.query(
              'SELECT channel FROM user_preferences WHERE user_id = $1 AND category = $2 AND enabled = false',
              [userId, nt.category],
            );
            const optedOut = nt.category === 'security' ? new Set() : new Set(prefs.map((p) => p.channel));
            const recipient = { email: contact.email, sms: contact.phone, push: contact.push_token };
            const sendAfter = nt.urgent ? null : quietUntil(new Date(), contact);

            return nt.channels
              .filter((channel) => !optedOut.has(channel) && recipient[channel])
              .map((channel) => ({ channel, recipient: recipient[channel], sendAfter }));
          }
        `),
      },
    },
    {
      title: 'Channel strategies',
      bullets: [
        'Common contract: `send(recipient, message, { idempotencyKey }) → { providerMessageId }` and `isRetryable(err)`.',
        'Classify errors: network errors, timeouts, `429` and `5xx` are retryable; other `4xx` (bad number, unsubscribed token) are permanent.',
        'Below, the SMS provider is a generic HTTP API called with global `fetch` (Node 18+); swap in Twilio/SNS/etc. SDKs the same way.',
        'Email uses `nodemailer` (third-party) SMTP; push uses FCM/APNs or `web-push` (third-party).',
      ],
      code: {
        id: 'p09-s4',
        title: 'src/channels/*.js',
        language: 'javascript',
        code: dedent(`
          // channel-error.js
          export class ChannelError extends Error {
            constructor(message, { status, retryable = true } = {}) {
              super(message);
              this.name = 'ChannelError';
              this.status = status;
              this.retryable = retryable;
            }
          }

          // sms.channel.js
          export class SmsChannel {
            name = 'sms';

            constructor({ apiUrl, apiKey, from, fetchImpl = fetch }) {
              Object.assign(this, { apiUrl, apiKey, from, fetchImpl });
            }

            async send(to, message, { idempotencyKey }) {
              const res = await this.fetchImpl(\`\${this.apiUrl}/messages\`, {
                method: 'POST',
                headers: {
                  authorization: \`Bearer \${this.apiKey}\`,
                  'content-type': 'application/json',
                  'idempotency-key': idempotencyKey,
                },
                body: JSON.stringify({ from: this.from, to, text: message.text }),
                signal: AbortSignal.timeout(10_000),
              });
              if (!res.ok) {
                throw new ChannelError(\`SMS provider responded \${res.status}\`, {
                  status: res.status,
                  retryable: res.status === 429 || res.status >= 500,
                });
              }
              const body = await res.json();
              return { providerMessageId: body.id };
            }

            isRetryable(err) {
              return err instanceof ChannelError ? err.retryable : true; // fetch/network/timeout errors: retry
            }
          }

          // email.channel.js
          export class EmailChannel {
            name = 'email';

            constructor({ transporter, from }) {
              Object.assign(this, { transporter, from }); // nodemailer.createTransport({...})
            }

            async send(to, { subject, html, text }, { idempotencyKey }) {
              const info = await this.transporter.sendMail({
                from: this.from,
                to,
                subject,
                html,
                text,
                headers: { 'X-Idempotency-Key': idempotencyKey },
              });
              return { providerMessageId: info.messageId };
            }

            isRetryable(err) {
              // SMTP 5xx response codes are permanent (e.g. 550 mailbox unavailable)
              return !(err.responseCode >= 500 && err.responseCode < 600);
            }
          }

          // index.js — the strategy registry
          export function createChannels(config) {
            return {
              email: new EmailChannel({ transporter: config.mailTransport, from: config.MAIL_FROM }),
              sms: new SmsChannel({ apiUrl: config.SMS_API_URL, apiKey: config.SMS_API_KEY, from: config.SMS_FROM }),
              push: config.pushChannel, // e.g. new PushChannel({ fcm })
            };
          }
        `),
      },
    },
    {
      title: 'The processor (idempotent, error-classifying)',
      bullets: [
        'Re-load the delivery from the DB — job data holds only the id, so the DB is the source of truth.',
        'Already `sent` → return early: BullMQ guarantees at-least-once, so a job can run twice after a stalled worker.',
        'Permanent errors become `UnrecoverableError` → BullMQ skips the remaining attempts.',
        'Pure function of its dependencies → unit-testable without Redis.',
      ],
      code: {
        id: 'p09-s5',
        title: 'src/worker/processor.js',
        language: 'javascript',
        code: dedent(`
          import { UnrecoverableError } from 'bullmq';

          export function createProcessor({ channels, deliveries, render }) {
            return async function processDelivery(job) {
              const delivery = await deliveries.findById(job.data.deliveryId);
              if (!delivery) throw new UnrecoverableError(\`Delivery \${job.data.deliveryId} not found\`);
              if (delivery.status === 'sent' || delivery.status === 'skipped') return { skipped: true };

              const channel = channels[delivery.channel];
              if (!channel) throw new UnrecoverableError(\`No strategy for channel \${delivery.channel}\`);

              const message = await render(delivery); // template + data -> { subject, html, text } / { text } / { title, body }
              await deliveries.markSending(delivery.id, job.attemptsMade + 1);

              try {
                const { providerMessageId } = await channel.send(delivery.recipient, message, { idempotencyKey: delivery.id });
                await deliveries.markSent(delivery.id, providerMessageId);
                return { providerMessageId };
              } catch (err) {
                await deliveries.recordError(delivery.id, err.message);
                if (!channel.isRetryable(err)) throw new UnrecoverableError(err.message);
                throw err; // BullMQ schedules the next attempt with backoff
              }
            };
          }
        `),
      },
    },
    {
      title: 'Workers, dead-letter queue and graceful shutdown',
      bullets: [
        'One `Worker` per channel with its own `concurrency` and provider `limiter`.',
        'The `failed` event fires after **every** failed attempt — check whether it was the last one before dead-lettering.',
        '`worker.close()` stops taking new jobs and waits for active ones; call it on `SIGTERM`.',
      ],
      code: {
        id: 'p09-s6',
        title: 'src/worker/worker.js',
        language: 'javascript',
        code: dedent(`
          import { Worker } from 'bullmq';
          import { connection, CHANNELS, deadLetterQueue } from '../queues/queues.js';
          import { createProcessor } from './processor.js';
          import { createChannels } from '../channels/index.js';
          import * as deliveries from '../core/deliveries.repository.js';
          import { render } from '../core/templates.js';
          import { config } from '../config.js';

          const LIMITS = {
            email: { concurrency: 20, limiter: { max: 100, duration: 1_000 } },
            sms: { concurrency: 10, limiter: { max: 50, duration: 1_000 } },
            push: { concurrency: 50, limiter: { max: 500, duration: 1_000 } },
          };

          const processor = createProcessor({ channels: createChannels(config), deliveries, render });

          const workers = CHANNELS.map((channel) => {
            const worker = new Worker(\`notify-\${channel}\`, processor, { connection, ...LIMITS[channel] });

            worker.on('failed', async (job, err) => {
              if (!job) return;
              const exhausted = err.name === 'UnrecoverableError' || job.attemptsMade >= (job.opts.attempts ?? 1);
              if (!exhausted) return;
              await deliveries.markFailed(job.data.deliveryId, err.message);
              await deadLetterQueue.add('dead', { deliveryId: job.data.deliveryId, channel, error: err.message });
            });
            worker.on('error', (err) => console.error(\`[\${channel}] worker error\`, err));
            return worker;
          });

          async function shutdown(signal) {
            console.log(\`\${signal}: draining workers...\`);
            await Promise.all(workers.map((w) => w.close()));
            await connection.quit();
            process.exit(0);
          }
          process.once('SIGTERM', shutdown);
          process.once('SIGINT', shutdown);
        `),
      },
    },
    {
      title: 'API route',
      bullets: [
        'Authenticate calling services with per-service API keys (hash stored in DB); the key determines `source`.',
        'Validate the body with zod; `Idempotency-Key` is required (`400` if missing).',
        '`202 Accepted` for new notifications, `200` with the same id for replays.',
      ],
      code: {
        id: 'p09-s7',
        title: 'src/api/notifications.routes.js',
        language: 'javascript',
        code: dedent(`
          import { Router } from 'express';
          import { z } from 'zod';
          import { ingest } from '../core/ingest.service.js';
          import { requireServiceKey } from './service-auth.js';

          const Body = z.object({
            userId: z.string().min(1).max(64),
            type: z.string().regex(/^[a-z_]{3,50}$/),
            data: z.record(z.string(), z.unknown()).default({}),
          });

          export const notificationsRouter = Router();

          notificationsRouter.post('/', requireServiceKey, async (req, res) => {
            const idempotencyKey = req.get('idempotency-key');
            if (!idempotencyKey || idempotencyKey.length > 200) {
              return res.status(400).json({ error: { code: 'IDEMPOTENCY_KEY_REQUIRED' } });
            }
            const parsed = Body.safeParse(req.body);
            if (!parsed.success) return res.status(400).json({ error: { code: 'VALIDATION_ERROR', details: parsed.error.issues } });

            const result = await ingest({ source: req.service.name, idempotencyKey, body: parsed.data });
            res.status(result.replayed ? 200 : 202).json({ id: result.id, replayed: result.replayed });
          });
        `),
      },
    },
    {
      title: 'Sweeper and DLQ replay',
      bullets: [
        'Every minute: `SELECT id, channel FROM deliveries WHERE status = \'queued\' AND updated_at < now() - interval \'5 minutes\' AND (send_after IS NULL OR send_after < now())` → `enqueueDelivery` (jobId dedupes).',
        'Run the sweeper as a BullMQ repeatable job so only one instance executes it.',
        'Replay endpoint: set the delivery back to `queued`, `attempts = 0`, enqueue with a new jobId (`<id>:replay:<n>`) because the old failed job may still exist.',
      ],
    },
  ],
  testing: {
    bullets: [
      'Unit-test the processor with fake channels/repositories using `node:test` `mock.fn()` — no Redis needed.',
      'Cover: success path, skip already-sent, permanent error → `UnrecoverableError`, transient error rethrown.',
      'Unit-test `quietUntil` across midnight windows and timezones.',
      'Integration: Supertest the ingest endpoint twice with the same key → same id, one set of deliveries; different body → 422.',
    ],
    code: {
      id: 'p09-test',
      title: 'test/processor.test.js (node:test)',
      language: 'javascript',
      code: dedent(`
        import { test, mock } from 'node:test';
        import assert from 'node:assert/strict';
        import { UnrecoverableError } from 'bullmq';
        import { createProcessor } from '../src/worker/processor.js';
        import { ChannelError } from '../src/channels/channel-error.js';
        import { quietUntil } from '../src/core/preferences.js';

        function setup({ status = 'queued', send } = {}) {
          const delivery = { id: 'd-1', channel: 'sms', recipient: '+15550001111', status };
          const deliveries = {
            findById: mock.fn(async () => delivery),
            markSending: mock.fn(async () => {}),
            markSent: mock.fn(async () => {}),
            recordError: mock.fn(async () => {}),
          };
          const sms = {
            send: mock.fn(send ?? (async () => ({ providerMessageId: 'prov-1' }))),
            isRetryable: (err) => (err instanceof ChannelError ? err.retryable : true),
          };
          const processDelivery = createProcessor({ channels: { sms }, deliveries, render: async () => ({ text: 'Shipped!' }) });
          return { processDelivery, deliveries, sms };
        }

        const job = { data: { deliveryId: 'd-1' }, attemptsMade: 0 };

        test('sends with the delivery id as idempotency key and marks sent', async () => {
          const { processDelivery, deliveries, sms } = setup();
          assert.deepEqual(await processDelivery(job), { providerMessageId: 'prov-1' });
          assert.equal(sms.send.mock.calls[0].arguments[2].idempotencyKey, 'd-1');
          assert.deepEqual(deliveries.markSent.mock.calls[0].arguments, ['d-1', 'prov-1']);
        });

        test('skips a delivery that was already sent', async () => {
          const { processDelivery, sms } = setup({ status: 'sent' });
          assert.deepEqual(await processDelivery(job), { skipped: true });
          assert.equal(sms.send.mock.callCount(), 0);
        });

        test('permanent provider errors are unrecoverable', async () => {
          const { processDelivery } = setup({
            send: async () => {
              throw new ChannelError('invalid number', { status: 400, retryable: false });
            },
          });
          await assert.rejects(processDelivery(job), UnrecoverableError);
        });

        test('transient errors are rethrown so BullMQ retries', async () => {
          const { processDelivery, deliveries } = setup({
            send: async () => {
              throw new ChannelError('provider down', { status: 503 });
            },
          });
          await assert.rejects(processDelivery(job), (err) => err instanceof ChannelError && !(err instanceof UnrecoverableError));
          assert.equal(deliveries.recordError.mock.callCount(), 1);
        });

        test('quiet hours across midnight delay until the end of the window', () => {
          const now = new Date('2026-01-10T23:30:00Z');
          const until = quietUntil(now, { timezone: 'UTC', quiet_start: '22:00', quiet_end: '07:00' });
          assert.equal(until.toISOString(), '2026-01-11T07:00:00.000Z');
          assert.equal(quietUntil(new Date('2026-01-10T12:00:00Z'), { timezone: 'UTC', quiet_start: '22:00', quiet_end: '07:00' }), null);
        });
      `),
    },
  },
  security: [
    'Service-to-service auth: per-caller API keys (stored hashed) or mTLS; the key sets `source`, so callers cannot collide on idempotency keys.',
    'Template rendering escapes HTML for email bodies; never let callers send raw HTML or arbitrary recipients.',
    'Recipients come from `user_contacts`, not from the request — prevents using the service as an open spam relay.',
    'Provider credentials only in the worker\'s environment/secret store; the API process does not need them.',
    'Verify provider webhook signatures (HMAC with timing-safe compare) before trusting delivery receipts.',
    'Do not log full phone numbers / emails / message bodies (PII) — mask them (`+1555***1111`).',
    'Redis: private network, `requirepass`/ACL, TLS in managed setups.',
  ],
  deployment: {
    bullets: [
      'API and workers are separate containers from the same image (different `command`); scale workers independently.',
      'Redis needs persistence (`appendonly yes`) and `maxmemory-policy noeviction` — evicting queue keys loses jobs.',
      'Monitor queue depth, failed count and DLQ size; alert when DLQ grows. Bull Board (third-party) gives a UI.',
    ],
    code: {
      id: 'p09-deploy',
      title: 'docker-compose.yml',
      language: 'yaml',
      code: dedent(`
        services:
          api:
            build: .
            command: ["node", "src/api/server.js"]
            environment: &env
              DATABASE_URL: postgres://notify:notify@db:5432/notify
              REDIS_URL: redis://redis:6379
            ports: ["3000:3000"]
            depends_on: [db, redis]
          worker:
            build: .
            command: ["node", "src/worker/worker.js"]
            environment:
              <<: *env
              SMS_API_URL: \${SMS_API_URL}
              SMS_API_KEY: \${SMS_API_KEY}
            deploy:
              replicas: 3
            stop_grace_period: 30s
            depends_on: [db, redis]
          redis:
            image: redis:7-alpine
            command: ["redis-server", "--appendonly", "yes", "--maxmemory-policy", "noeviction"]
            volumes: [redisdata:/data]
          db:
            image: postgres:17-alpine
            environment:
              POSTGRES_USER: notify
              POSTGRES_PASSWORD: notify
              POSTGRES_DB: notify
        volumes:
          redisdata:
      `),
    },
  },
  extensions: [
    'Digest mode: batch low-priority notifications into one daily email (BullMQ repeatable job per timezone).',
    'Fallback chain: if push fails permanently, send SMS (strategy composition).',
    'Per-user rate limit (max N marketing messages per day).',
    'In-app notification inbox channel with WebSocket delivery via p08.',
    'Template versioning + preview endpoint.',
    'Replace post-commit enqueue with a transactional outbox table + relay for stronger guarantees.',
  ],
};
