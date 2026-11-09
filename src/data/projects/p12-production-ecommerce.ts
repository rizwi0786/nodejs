import type { Project } from '../../types';
import { dedent, entity } from './shared';

export const p12: Project = {
  id: 'p12',
  number: 12,
  level: 'advanced',
  title: 'Production-ready E-commerce Backend',
  status: 'ready',
  summary: 'Everything together: a modular Express 5 + PostgreSQL + Redis backend with Stripe payments and idempotent webhooks, a transactional outbox feeding BullMQ workers, structured logs, metrics and traces, hardened security, a multi-stage Docker image and a CI/CD pipeline with zero-downtime deploys.',
  skills: ['Docker multi-stage', 'CI/CD (GitHub Actions)', 'Observability (pino, Prometheus, OpenTelemetry)', 'Payment webhooks + idempotency', 'Transactional outbox', 'Security hardening', 'Graceful shutdown', 'Zero-downtime migrations'],
  estHours: 30,
  prerequisites: [
    'm14-dockerizing-node-js-applications',
    'm14-github-actions',
    'm14-logging-and-observability',
    'm14-health-checks',
    'm14-zero-downtime-deployment',
    'm12-secure-api-design',
    'm12-helmet',
    'm15-event-driven-architecture',
  ],
  requirements: {
    functional: [
      'Auth (p05), catalogue, cart and orders (p07 domain, now on PostgreSQL).',
      '`POST /api/v1/checkout` with `Idempotency-Key`: reserve stock, create order `pending_payment`, create a Stripe PaymentIntent, return its `client_secret`.',
      '`POST /webhooks/stripe`: verify signature, process each event **once**, mark orders `paid` / `payment_failed`.',
      'Side effects (confirmation email, analytics, fulfilment) triggered from an outbox table, processed by BullMQ workers.',
      'Unpaid orders auto-cancel and restock after 30 minutes (scheduled job).',
      'Admin: order search, refunds (Stripe refund API, webhook-confirmed), sales dashboard data.',
    ],
    nonFunctional: [
      'Availability: health/readiness probes, graceful shutdown, rolling deploys with no dropped requests.',
      'Observability: JSON logs with request ids, RED metrics per route, distributed traces (HTTP → DB → Redis → Stripe).',
      'Security: OWASP-aligned — helmet headers, strict CORS, Redis-backed rate limits, zod validation, secrets from a secret store, non-root read-only container, dependency scanning in CI.',
      'Correctness: no double charges (Stripe idempotency keys), no double fulfilment (webhook event dedupe), no lost side effects (outbox).',
      'Delivery: every push runs lint, tests (real Postgres + Redis), audit and image build; `main` deploys automatically after migrations.',
      'Performance targets: p95 < 200 ms for catalogue reads, < 800 ms for checkout (Stripe call included).',
    ],
  },
  architecture: {
    diagramId: 'ci-cd-pipeline',
    flow: [
      { label: 'Client', detail: 'HTTPS' },
      { label: 'Nginx / LB', detail: 'TLS, gzip, readiness-based routing' },
      { label: 'API pods', detail: 'helmet → cors → rate limit → auth → zod → handlers' },
      { label: 'Postgres + Redis', detail: 'orders, stock, outbox · cache, limits, queues' },
      { label: 'Stripe', detail: 'PaymentIntent → webhook back to /webhooks/stripe' },
      { label: 'Outbox relay → BullMQ', detail: 'workers: email, fulfilment, cleanup' },
    ],
    notes: [
      'Modular monolith: modules (`auth`, `catalog`, `cart`, `orders`, `payments`, `notifications`) with clear boundaries — split into services only when a team or scaling need demands it.',
      'Never call external APIs inside a DB transaction: commit the order first, then call Stripe with an idempotency key derived from the order id.',
      'The webhook handler is the **source of truth** for payment state; the client\'s "payment succeeded" screen is only UX.',
      'Transactional outbox: business change + outbox row commit together; a relay publishes to BullMQ (`FOR UPDATE SKIP LOCKED`, `jobId = outbox-<id>`). Consumers stay idempotent.',
      'Third-party packages used: express, pg, ioredis, bullmq, zod, helmet, cors, express-rate-limit, rate-limit-redis, pino, pino-http, prom-client, @opentelemetry/*, stripe.',
    ],
  },
  folderStructure: dedent(`
    shop/
    ├── Dockerfile
    ├── docker-compose.yml           # local: api, worker, postgres, redis, otel-collector, prometheus
    ├── .github/workflows/ci-cd.yml
    ├── migrations/                  # numbered SQL, expand/contract style
    ├── src/
    │   ├── instrumentation.js       # OpenTelemetry SDK (loaded with --import)
    │   ├── server.js                # listen, health state, graceful shutdown
    │   ├── worker.js                # BullMQ workers + outbox relay
    │   ├── app.js                   # middleware stack + routers
    │   ├── config.js                # zod env schema (fail fast)
    │   ├── infra/
    │   │   ├── db.js  redis.js  logger.js  metrics.js  stripe.js
    │   │   └── transaction.js
    │   ├── middleware/
    │   │   ├── idempotency.js  require-auth.js  validate.js  error-handler.js
    │   ├── modules/
    │   │   ├── auth/  catalog/  cart/  orders/
    │   │   ├── payments/
    │   │   │   ├── checkout.service.js
    │   │   │   ├── webhook.routes.js
    │   │   │   └── stripe-events.js
    │   │   └── notifications/       # consumers of outbox topics
    │   └── outbox/relay.js
    └── test/
        ├── webhook.test.js
        └── checkout.test.js
  `),
  databaseDesign: [
    entity('orders', [
      ['id', 'BIGINT', 'PK identity', ''],
      ['user_id', 'UUID', 'NOT NULL FK users', 'Index (user_id, created_at DESC)'],
      ['status', 'TEXT', 'CHECK IN (pending_payment, paid, payment_failed, cancelled, fulfilled, refunded)', 'Index (status, created_at) for the cleanup job'],
      ['total_cents', 'INT', 'NOT NULL CHECK (>= 0)', 'Compared with amount_received in the webhook'],
      ['currency', 'CHAR(3)', "NOT NULL DEFAULT 'usd'", ''],
      ['payment_intent_id', 'TEXT', 'UNIQUE NULL', 'Stripe PaymentIntent id'],
      ['shipping_address', 'JSONB', 'NOT NULL', 'Snapshot'],
      ['paid_at / created_at / updated_at', 'TIMESTAMPTZ', '', ''],
    ]),
    entity('order_items', [
      ['order_id', 'BIGINT', 'FK orders ON DELETE CASCADE', 'PK (order_id, product_id)'],
      ['product_id', 'BIGINT', 'FK products', ''],
      ['name', 'TEXT', 'NOT NULL', 'Snapshot'],
      ['unit_price_cents', 'INT', 'NOT NULL', 'Snapshot'],
      ['quantity', 'INT', 'NOT NULL CHECK (> 0)', ''],
    ]),
    entity('products', [
      ['id', 'BIGINT', 'PK identity', ''],
      ['sku', 'TEXT', 'UNIQUE NOT NULL', ''],
      ['name', 'TEXT', 'NOT NULL', ''],
      ['price_cents', 'INT', 'NOT NULL CHECK (>= 0)', ''],
      ['stock', 'INT', 'NOT NULL CHECK (stock >= 0)', 'Conditional UPDATE guards overselling'],
      ['active', 'BOOLEAN', 'DEFAULT true', ''],
    ]),
    entity('idempotency_keys', [
      ['user_id', 'UUID', 'NOT NULL', 'PK (user_id, key)'],
      ['key', 'TEXT', 'NOT NULL, ≤ 200', 'Idempotency-Key header'],
      ['request_hash', 'TEXT', 'NOT NULL', 'Same key + different body → 422'],
      ['response_status', 'INT', 'NULL', 'NULL = in progress'],
      ['response_body', 'JSONB', 'NULL', 'Replayed verbatim'],
      ['created_at', 'TIMESTAMPTZ', 'DEFAULT now()', 'Purged after 24 h'],
    ]),
    entity('webhook_events', [
      ['provider', 'TEXT', 'NOT NULL', 'PK (provider, event_id)'],
      ['event_id', 'TEXT', 'NOT NULL', 'e.g. evt_1P…'],
      ['type', 'TEXT', 'NOT NULL', ''],
      ['received_at', 'TIMESTAMPTZ', 'DEFAULT now()', 'Inserted in the same transaction as the effect'],
    ]),
    entity('outbox', [
      ['id', 'BIGINT', 'PK identity', 'Ordering'],
      ['topic', 'TEXT', 'NOT NULL', 'order.paid, order.cancelled, …'],
      ['payload', 'JSONB', 'NOT NULL', 'Ids only, no PII'],
      ['created_at', 'TIMESTAMPTZ', 'DEFAULT now()', ''],
      ['published_at', 'TIMESTAMPTZ', 'NULL', 'Partial index WHERE published_at IS NULL'],
    ]),
  ],
  endpoints: [
    { method: 'POST', path: '/api/v1/auth/login · /refresh · /logout', description: 'From p05.', auth: 'public / cookie' },
    { method: 'GET', path: '/api/v1/products?q=&category=&page=', description: 'Catalogue (Redis-cached 30 s).', auth: 'public' },
    { method: 'PUT', path: '/api/v1/cart/items/:productId', description: 'Set quantity.', auth: 'customer' },
    { method: 'POST', path: '/api/v1/checkout', description: 'Idempotency-Key required → { orderId, clientSecret }.', auth: 'customer' },
    { method: 'GET', path: '/api/v1/orders · /orders/:id', description: 'Own orders.', auth: 'customer' },
    { method: 'POST', path: '/api/v1/admin/orders/:id/refund', description: 'Create Stripe refund (state changes on webhook).', auth: 'admin' },
    { method: 'POST', path: '/webhooks/stripe', description: 'Signed Stripe events (raw body).', auth: 'Stripe signature' },
    { method: 'GET', path: '/livez', description: 'Process is alive.', auth: 'public' },
    { method: 'GET', path: '/readyz', description: 'DB + Redis reachable and not draining.', auth: 'public' },
    { method: 'GET', path: ':9464/metrics', description: 'Prometheus metrics on an internal port.', auth: 'internal network' },
  ],
  steps: [
    {
      title: 'Fail-fast configuration',
      bullets: [
        'One zod schema for every env var; the process refuses to start with a missing secret.',
        'Secrets are injected by the platform (Kubernetes secrets, AWS Secrets Manager, Doppler…), never baked into the image or committed.',
      ],
      code: {
        id: 'p12-s1',
        title: 'src/config.js',
        language: 'javascript',
        code: dedent(`
          import { z } from 'zod';

          const Env = z.object({
            NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
            PORT: z.coerce.number().default(3000),
            METRICS_PORT: z.coerce.number().default(9464),
            LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
            DATABASE_URL: z.string().url(),
            REDIS_URL: z.string().url(),
            JWT_ACCESS_SECRET: z.string().min(32),
            STRIPE_SECRET_KEY: z.string().startsWith('sk_'),
            STRIPE_WEBHOOK_SECRET: z.string().startsWith('whsec_'),
            CORS_ORIGINS: z.string().transform((s) => s.split(',').map((o) => o.trim())),
            DRAIN_DELAY_MS: z.coerce.number().default(5_000),
          });

          const result = Env.safeParse(process.env);
          if (!result.success) {
            console.error('Invalid configuration:', result.error.issues.map((i) => \`\${i.path.join('.')}: \${i.message}\`));
            process.exit(1);
          }
          export const config = Object.freeze(result.data);
        `),
      },
    },
    {
      title: 'Observability bootstrap: traces, logs, request ids',
      bullets: [
        'OpenTelemetry must load **before** the app so it can patch `http`, `pg`, `ioredis`: `node --import ./src/instrumentation.js src/server.js`.',
        'For ES modules also register the OTel loader hook (`--experimental-loader=@opentelemetry/instrumentation/hook.mjs`) — check the OTel JS docs for your version.',
        '`pino-http` logs one JSON line per request with a request id (taken from `X-Request-Id` or generated) and redacts secrets.',
        'With OTel active, pino logs can carry `trace_id` so you can jump from a log line to its trace.',
      ],
      code: {
        id: 'p12-s2',
        title: 'src/instrumentation.js + src/infra/logger.js',
        language: 'javascript',
        code: dedent(`
          // instrumentation.js
          import { NodeSDK } from '@opentelemetry/sdk-node';
          import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
          import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';

          export const otelSdk = new NodeSDK({
            serviceName: 'shop-api',
            traceExporter: new OTLPTraceExporter(), // reads OTEL_EXPORTER_OTLP_ENDPOINT
            instrumentations: [getNodeAutoInstrumentations({ '@opentelemetry/instrumentation-fs': { enabled: false } })],
          });
          otelSdk.start();

          // infra/logger.js
          import { randomUUID } from 'node:crypto';
          import pino from 'pino';
          import { pinoHttp } from 'pino-http';
          import { config } from '../config.js';

          export const logger = pino({
            level: config.LOG_LEVEL,
            redact: {
              paths: ['req.headers.authorization', 'req.headers.cookie', 'req.headers["stripe-signature"]', '*.password', '*.token'],
              censor: '[redacted]',
            },
          });

          const REQUEST_ID = /^[\\w-]{8,64}$/;

          export const httpLogger = pinoHttp({
            logger,
            genReqId(req, res) {
              const incoming = req.headers['x-request-id'];
              const id = typeof incoming === 'string' && REQUEST_ID.test(incoming) ? incoming : randomUUID();
              res.setHeader('X-Request-Id', id);
              return id;
            },
            customLogLevel: (req, res, err) => (err || res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info'),
            autoLogging: { ignore: (req) => req.url === '/livez' || req.url === '/readyz' },
          });
        `),
      },
    },
    {
      title: 'Hardened middleware stack',
      bullets: [
        'Order matters: logging/metrics first, security headers, CORS, **webhooks with `express.raw` before `express.json`** (signature is computed over raw bytes), then rate limits, auth, routes, 404, error handler.',
        '`trust proxy` = number of proxies in front, so `req.ip` and `req.secure` are correct (rate limits, secure cookies).',
        'Rate-limit state in Redis (`rate-limit-redis`) so limits hold across all pods.',
      ],
      code: {
        id: 'p12-s3',
        title: 'src/app.js',
        language: 'javascript',
        code: dedent(`
          import express from 'express';
          import helmet from 'helmet';
          import cors from 'cors';
          import cookieParser from 'cookie-parser';
          import { rateLimit } from 'express-rate-limit';
          import { RedisStore } from 'rate-limit-redis';
          import { config } from './config.js';
          import { httpLogger } from './infra/logger.js';
          import { metricsMiddleware } from './infra/metrics.js';
          import { redis } from './infra/redis.js';
          import { healthRouter } from './health.js';
          import { webhookRouter } from './modules/payments/webhook.routes.js';
          import { apiRouter } from './api-router.js';
          import { notFound, errorHandler } from './middleware/error-handler.js';

          export const app = express();
          app.set('trust proxy', 1);
          app.disable('x-powered-by');

          app.use(httpLogger);
          app.use(metricsMiddleware);
          app.use(helmet());
          app.use(healthRouter); // /livez, /readyz — before rate limits

          app.use('/webhooks', webhookRouter); // uses express.raw() internally

          app.use(cors({ origin: config.CORS_ORIGINS, credentials: true, maxAge: 600 }));
          app.use(express.json({ limit: '100kb' }));
          app.use(cookieParser());
          app.use(
            '/api',
            rateLimit({
              windowMs: 60_000,
              limit: 300,
              standardHeaders: 'draft-7',
              legacyHeaders: false,
              store: new RedisStore({ sendCommand: (command, ...args) => redis.call(command, ...args), prefix: 'rl:api:' }),
            }),
          );
          app.use('/api/v1', apiRouter);

          app.use(notFound);
          app.use(errorHandler);
        `),
      },
    },
    {
      title: 'HTTP idempotency middleware for checkout',
      bullets: [
        'First request with a key inserts a row (`response_status = NULL`, "in progress"); the response is captured and stored.',
        'Retry with the same key → stored response replayed with `Idempotent-Replayed: true`. Concurrent duplicate → `409`. Different body → `422`.',
        '5xx responses delete the key so the client may retry for real.',
      ],
      code: {
        id: 'p12-s4',
        title: 'src/middleware/idempotency.js',
        language: 'javascript',
        code: dedent(`
          import { createHash } from 'node:crypto';
          import { pool as db } from '../infra/db.js';

          export function idempotent() {
            return async function idempotency(req, res, next) {
              const key = req.get('idempotency-key');
              if (!key || key.length > 200) {
                return res.status(400).json({ error: { code: 'IDEMPOTENCY_KEY_REQUIRED' } });
              }
              const userId = req.user.id;
              const requestHash = createHash('sha256').update(JSON.stringify(req.body ?? {})).digest('hex');

              const inserted = await db.query(
                \`INSERT INTO idempotency_keys (user_id, key, request_hash) VALUES ($1, $2, $3)
                 ON CONFLICT (user_id, key) DO NOTHING RETURNING key\`,
                [userId, key, requestHash],
              );

              if (inserted.rowCount === 0) {
                const { rows: [existing] } = await db.query(
                  'SELECT request_hash, response_status, response_body FROM idempotency_keys WHERE user_id = $1 AND key = $2',
                  [userId, key],
                );
                if (existing.request_hash !== requestHash) {
                  return res.status(422).json({ error: { code: 'IDEMPOTENCY_KEY_REUSED', message: 'Key was used with a different request' } });
                }
                if (existing.response_status === null) {
                  return res.status(409).json({ error: { code: 'REQUEST_IN_PROGRESS' } });
                }
                return res.status(existing.response_status).set('Idempotent-Replayed', 'true').json(existing.response_body);
              }

              const sendJson = res.json.bind(res);
              res.json = (body) => {
                const status = res.statusCode;
                const persist =
                  status >= 500
                    ? db.query('DELETE FROM idempotency_keys WHERE user_id = $1 AND key = $2', [userId, key])
                    : db.query(
                        'UPDATE idempotency_keys SET response_status = $3, response_body = $4 WHERE user_id = $1 AND key = $2',
                        [userId, key, status, JSON.stringify(body)],
                      );
                persist.catch((err) => req.log.error({ err }, 'failed to persist idempotent response'));
                return sendJson(body);
              };
              next();
            };
          }
        `),
      },
    },
    {
      title: 'Checkout: reserve stock, commit, then create the PaymentIntent',
      bullets: [
        'Stock is reserved with a conditional `UPDATE ... WHERE stock >= $qty` inside one transaction (all lines or none).',
        'Stripe is called **after** commit — never hold DB locks while waiting on a third-party API.',
        'Stripe `idempotencyKey: order-<id>` means a retry never creates a second PaymentIntent (no double charge).',
        'If Stripe is down, the order stays `pending_payment`; the client can retry `POST /orders/:id/payment-intent`, and the cleanup job cancels + restocks after 30 min.',
      ],
      code: {
        id: 'p12-s5',
        title: 'src/modules/payments/checkout.service.js',
        language: 'javascript',
        code: dedent(`
          import { pool as db } from '../../infra/db.js';
          import { withTransaction } from '../../infra/transaction.js';
          import { stripe } from '../../infra/stripe.js';
          import { BadRequestError, ConflictError } from '../../errors.js';

          export async function checkout(user, { shippingAddress }) {
            const order = await withTransaction(async (client) => {
              const { rows: items } = await client.query(
                \`SELECT ci.product_id, ci.quantity, p.name, p.price_cents
                 FROM cart_items ci JOIN products p ON p.id = ci.product_id AND p.active
                 WHERE ci.user_id = $1
                 ORDER BY ci.product_id\`, // consistent lock order -> fewer deadlocks
                [user.id],
              );
              if (items.length === 0) throw new BadRequestError('Cart is empty');

              for (const item of items) {
                const reserved = await client.query(
                  'UPDATE products SET stock = stock - $2 WHERE id = $1 AND stock >= $2',
                  [item.product_id, item.quantity],
                );
                if (reserved.rowCount === 0) throw new ConflictError(\`Out of stock: \${item.name}\`);
              }

              const totalCents = items.reduce((sum, i) => sum + i.price_cents * i.quantity, 0);
              const { rows: [created] } = await client.query(
                \`INSERT INTO orders (user_id, status, total_cents, currency, shipping_address)
                 VALUES ($1, 'pending_payment', $2, 'usd', $3) RETURNING id, total_cents, currency\`,
                [user.id, totalCents, shippingAddress],
              );
              await client.query(
                \`INSERT INTO order_items (order_id, product_id, name, unit_price_cents, quantity)
                 SELECT $1::bigint, * FROM unnest($2::bigint[], $3::text[], $4::int[], $5::int[])\`,
                [
                  created.id,
                  items.map((i) => i.product_id),
                  items.map((i) => i.name),
                  items.map((i) => i.price_cents),
                  items.map((i) => i.quantity),
                ],
              );
              await client.query('DELETE FROM cart_items WHERE user_id = $1', [user.id]);
              return created;
            });

            const intent = await stripe.paymentIntents.create(
              {
                amount: order.total_cents,
                currency: order.currency,
                metadata: { orderId: String(order.id) },
                automatic_payment_methods: { enabled: true },
              },
              { idempotencyKey: \`order-\${order.id}\` },
            );
            await db.query('UPDATE orders SET payment_intent_id = $2, updated_at = now() WHERE id = $1', [order.id, intent.id]);

            return { orderId: order.id, totalCents: order.total_cents, clientSecret: intent.client_secret };
          }
        `),
      },
    },
    {
      title: 'Stripe webhook: verify, dedupe, apply, outbox — in one transaction',
      bullets: [
        '`stripe.webhooks.constructEvent(rawBody, signature, secret)` verifies the HMAC and timestamp (replay protection). Any parsing of the body before this breaks the signature.',
        'Stripe delivers **at least once** and may retry for days: insert `event.id` into `webhook_events`; `rowCount === 0` → already processed → return `200`.',
        'Dedupe row, order update and outbox row commit together. If anything throws, everything rolls back and Stripe retries.',
        'Cross-check `amount_received` with the order total; guard the state change with `WHERE status = \'pending_payment\'`.',
        'Answer quickly (`2xx` within seconds); slow work goes through the outbox.',
      ],
      code: {
        id: 'p12-s6',
        title: 'webhook.routes.js + stripe-events.js',
        language: 'javascript',
        code: dedent(`
          // modules/payments/stripe-events.js
          import { withTransaction } from '../../infra/transaction.js';
          import { ordersPaid } from '../../infra/metrics.js';

          export async function handleStripeEvent(event, log) {
            await withTransaction(async (client) => {
              const fresh = await client.query(
                'INSERT INTO webhook_events (provider, event_id, type) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
                ['stripe', event.id, event.type],
              );
              if (fresh.rowCount === 0) {
                log.info({ eventId: event.id }, 'duplicate webhook ignored');
                return;
              }

              switch (event.type) {
                case 'payment_intent.succeeded': {
                  const intent = event.data.object;
                  const { rows: [order] } = await client.query(
                    \`UPDATE orders SET status = 'paid', paid_at = now(), updated_at = now()
                     WHERE id = $1 AND status = 'pending_payment' AND total_cents = $2
                     RETURNING id, user_id\`,
                    [intent.metadata.orderId, intent.amount_received],
                  );
                  if (!order) {
                    log.error({ eventId: event.id, orderId: intent.metadata.orderId }, 'paid intent does not match a pending order');
                    return; // keep the dedupe row; alert + manual review
                  }
                  await client.query("INSERT INTO outbox (topic, payload) VALUES ('order.paid', $1)", [
                    { orderId: order.id, userId: order.user_id },
                  ]);
                  ordersPaid.inc();
                  break;
                }
                case 'payment_intent.payment_failed': {
                  const intent = event.data.object;
                  await client.query(
                    "UPDATE orders SET status = 'payment_failed', updated_at = now() WHERE id = $1 AND status = 'pending_payment'",
                    [intent.metadata.orderId],
                  );
                  break;
                }
                default:
                  log.debug({ type: event.type }, 'unhandled stripe event type');
              }
            });
          }

          // modules/payments/webhook.routes.js
          import express, { Router } from 'express';
          import { stripe } from '../../infra/stripe.js';
          import { config } from '../../config.js';

          export const webhookRouter = Router();

          webhookRouter.post('/stripe', express.raw({ type: 'application/json', limit: '1mb' }), async (req, res) => {
            let event;
            try {
              event = stripe.webhooks.constructEvent(req.body, req.get('stripe-signature'), config.STRIPE_WEBHOOK_SECRET);
            } catch (err) {
              req.log.warn({ reason: err.message }, 'rejected webhook signature');
              return res.status(400).send('Invalid signature');
            }
            await handleStripeEvent(event, req.log);
            res.json({ received: true });
          });
        `),
        versionNote: 'stripe-node v14+. Express 5: a rejected handler promise becomes a 500 → Stripe retries the event.',
      },
    },
    {
      title: 'Outbox relay → BullMQ consumers',
      bullets: [
        '`FOR UPDATE SKIP LOCKED` lets several relay instances run without picking the same rows.',
        '`jobId: outbox-<id>` makes a re-publish (crash after `add`, before `UPDATE`) a no-op.',
        'Consumers (`order.paid` → email, fulfilment) are idempotent: check state before acting.',
        'A BullMQ job scheduler runs `cancel-unpaid-orders` every minute: cancel `pending_payment` older than 30 min and restock.',
      ],
      code: {
        id: 'p12-s7',
        title: 'src/outbox/relay.js',
        language: 'javascript',
        code: dedent(`
          import { setTimeout as sleep } from 'node:timers/promises';
          import { withTransaction } from '../infra/transaction.js';
          import { eventsQueue } from '../infra/queues.js';
          import { logger } from '../infra/logger.js';

          export async function relayBatch(limit = 100) {
            return withTransaction(async (client) => {
              const { rows } = await client.query(
                \`SELECT id, topic, payload FROM outbox
                 WHERE published_at IS NULL
                 ORDER BY id
                 LIMIT $1
                 FOR UPDATE SKIP LOCKED\`,
                [limit],
              );
              if (rows.length === 0) return 0;
              await eventsQueue.addBulk(rows.map((r) => ({ name: r.topic, data: r.payload, opts: { jobId: \`outbox-\${r.id}\` } })));
              await client.query('UPDATE outbox SET published_at = now() WHERE id = ANY($1::bigint[])', [rows.map((r) => r.id)]);
              return rows.length;
            });
          }

          export async function runRelay(signal) {
            while (!signal.aborted) {
              try {
                const published = await relayBatch();
                if (published === 0) await sleep(500, undefined, { signal }).catch(() => {});
              } catch (err) {
                logger.error({ err }, 'outbox relay failed');
                await sleep(2_000, undefined, { signal }).catch(() => {});
              }
            }
          }
        `),
      },
    },
    {
      title: 'Metrics (RED) with prom-client',
      bullets: [
        'Histogram of request duration labelled by method, **route template** and status — never the raw URL (`/orders/123` would create unbounded label values).',
        'Business counters (`orders_paid_total`) next to technical ones; default process metrics (heap, event-loop lag).',
        'Expose `/metrics` on a separate internal port so it is not publicly reachable.',
      ],
      code: {
        id: 'p12-s8',
        title: 'src/infra/metrics.js',
        language: 'javascript',
        code: dedent(`
          import http from 'node:http';
          import client from 'prom-client';

          export const registry = new client.Registry();
          client.collectDefaultMetrics({ register: registry });

          const httpDuration = new client.Histogram({
            name: 'http_request_duration_seconds',
            help: 'HTTP request duration',
            labelNames: ['method', 'route', 'status'],
            buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5],
            registers: [registry],
          });

          export const ordersPaid = new client.Counter({
            name: 'orders_paid_total',
            help: 'Orders confirmed as paid by the payment webhook',
            registers: [registry],
          });

          export function metricsMiddleware(req, res, next) {
            const stop = httpDuration.startTimer();
            res.on('finish', () => {
              const route = req.route ? req.baseUrl + req.route.path : 'unmatched';
              stop({ method: req.method, route, status: String(res.statusCode) });
            });
            next();
          }

          export function startMetricsServer(port) {
            return http
              .createServer(async (req, res) => {
                if (req.url !== '/metrics') return res.writeHead(404).end();
                res.writeHead(200, { 'Content-Type': registry.contentType });
                res.end(await registry.metrics());
              })
              .listen(port);
          }
        `),
      },
    },
    {
      title: 'Health checks and graceful shutdown',
      bullets: [
        '`/livez`: the process responds (restart if not). `/readyz`: dependencies reachable **and** not draining (remove from load balancer if not).',
        'On `SIGTERM`: flip readiness to 503 → wait for the LB to notice (`DRAIN_DELAY_MS`) → `server.close()` → close pools → flush traces → exit.',
        'Use `tini` (or `--init`) as PID 1 in Docker so signals are forwarded and zombies reaped.',
      ],
      code: {
        id: 'p12-s9',
        title: 'src/health.js + src/server.js',
        language: 'javascript',
        code: dedent(`
          // health.js
          import { Router } from 'express';
          import { pool as db } from './infra/db.js';
          import { redis } from './infra/redis.js';

          export const lifecycle = { draining: false };
          export const healthRouter = Router();

          healthRouter.get('/livez', (req, res) => res.json({ status: 'ok' }));
          healthRouter.get('/readyz', async (req, res) => {
            if (lifecycle.draining) return res.status(503).json({ status: 'draining' });
            try {
              await Promise.all([db.query('SELECT 1'), redis.ping()]);
              res.json({ status: 'ready' });
            } catch (err) {
              res.status(503).json({ status: 'unavailable', reason: err.message });
            }
          });

          // server.js
          import { setTimeout as sleep } from 'node:timers/promises';
          import { app } from './app.js';
          import { config } from './config.js';
          import { logger } from './infra/logger.js';
          import { startMetricsServer } from './infra/metrics.js';
          import { otelSdk } from './instrumentation.js';

          const server = app.listen(config.PORT, () => logger.info({ port: config.PORT }, 'api listening'));
          server.keepAliveTimeout = 65_000; // longer than the LB idle timeout
          server.headersTimeout = 66_000;
          const metricsServer = startMetricsServer(config.METRICS_PORT);

          async function shutdown(signal) {
            if (lifecycle.draining) return;
            lifecycle.draining = true;
            logger.info({ signal }, 'draining');
            setTimeout(() => {
              logger.error('forced shutdown');
              process.exit(1);
            }, 25_000).unref();

            await sleep(config.DRAIN_DELAY_MS); // let the LB see /readyz = 503
            await new Promise((resolve) => {
              server.close(resolve);
              server.closeIdleConnections();
            });
            metricsServer.close();
            await Promise.allSettled([db.end(), redis.quit(), otelSdk.shutdown()]);
            logger.info('shutdown complete');
            process.exit(0);
          }
          process.once('SIGTERM', shutdown);
          process.once('SIGINT', shutdown);

          process.on('unhandledRejection', (reason) => {
            logger.fatal({ reason }, 'unhandled rejection');
            shutdown('unhandledRejection');
          });
        `),
      },
    },
    {
      title: 'Multi-stage, non-root Docker image',
      bullets: [
        '`deps` stage installs production dependencies with a build cache; the runtime stage copies only what is needed.',
        'Run as `node` (non-root); in Kubernetes add `readOnlyRootFilesystem: true` and drop all capabilities.',
        'Pin the base image (and ideally its digest); rebuild weekly for OS patches.',
      ],
      code: {
        id: 'p12-s10',
        title: 'Dockerfile',
        language: 'dockerfile',
        code: dedent(`
          # syntax=docker/dockerfile:1
          FROM node:22-alpine AS base
          WORKDIR /app
          ENV NODE_ENV=production

          FROM base AS deps
          COPY package.json package-lock.json ./
          RUN --mount=type=cache,target=/root/.npm npm ci --omit=dev --ignore-scripts

          FROM base AS runtime
          RUN apk add --no-cache tini
          COPY --from=deps --chown=node:node /app/node_modules ./node_modules
          COPY --chown=node:node package.json ./
          COPY --chown=node:node src ./src
          COPY --chown=node:node migrations ./migrations
          USER node
          EXPOSE 3000 9464
          HEALTHCHECK --interval=15s --timeout=3s --start-period=20s \\
            CMD wget -qO- http://127.0.0.1:3000/livez || exit 1
          ENTRYPOINT ["/sbin/tini", "--"]
          CMD ["node", "--import", "./src/instrumentation.js", "src/server.js"]
        `),
        explanation: [
          '`--ignore-scripts` blocks install-time scripts from dependencies; drop it if a package with native bindings needs its install script.',
        ],
      },
    },
    {
      title: 'Zero-downtime database migrations',
      bullets: [
        'Old and new code run side by side during a rolling deploy, so every migration must be compatible with **both** versions.',
        '**Expand → migrate → contract**: add a nullable column / new table (deploy N), backfill in batches and write both (deploy N+1), drop the old column (deploy N+2).',
        'Create indexes with `CREATE INDEX CONCURRENTLY` (outside a transaction) to avoid locking writes.',
        'Set `lock_timeout = \'5s\'` in migration sessions so a blocked `ALTER TABLE` fails fast instead of queueing all traffic behind it.',
        'Migrations run as a separate CI/CD step (or Kubernetes Job) **before** the rollout; app pods never run migrations on boot.',
      ],
    },
  ],
  testing: {
    bullets: [
      'Pyramid: unit (services with fakes), integration (Supertest + real Postgres/Redis in CI), a few end-to-end checkout flows with Stripe test mode.',
      'Webhook tests sign payloads with `stripe.webhooks.generateTestHeaderString` — no network needed.',
      'Idempotency: same `Idempotency-Key` twice → one order, second response has `Idempotent-Replayed: true`.',
      'Load test checkout (k6/Artillery) to check pool sizing and p95; chaos test by killing a pod mid-traffic and asserting zero 5xx at the LB.',
      'Run `npm audit --omit=dev` and a container scan (e.g. Trivy) in CI.',
    ],
    code: {
      id: 'p12-test',
      title: 'test/webhook.test.js (Vitest + Supertest)',
      language: 'javascript',
      code: dedent(`
        import { describe, it, expect, beforeEach, afterAll } from 'vitest';
        import request from 'supertest';
        import Stripe from 'stripe';
        import { app } from '../src/app.js';
        import { pool as db } from '../src/infra/db.js';
        import { createPendingOrder } from './fixtures.js';

        const stripe = new Stripe('sk_test_dummy');
        const secret = process.env.STRIPE_WEBHOOK_SECRET;

        function signed(event) {
          const payload = JSON.stringify(event);
          return { payload, header: stripe.webhooks.generateTestHeaderString({ payload, secret }) };
        }

        const succeeded = (orderId, amount, id = 'evt_test_1') => ({
          id,
          object: 'event',
          type: 'payment_intent.succeeded',
          data: { object: { id: 'pi_test_1', object: 'payment_intent', amount_received: amount, metadata: { orderId: String(orderId) } } },
        });

        const post = ({ payload, header }) =>
          request(app).post('/webhooks/stripe').set('Content-Type', 'application/json').set('Stripe-Signature', header).send(payload);

        beforeEach(() => db.query('TRUNCATE webhook_events, outbox, order_items, orders RESTART IDENTITY CASCADE'));
        afterAll(() => db.end());

        describe('POST /webhooks/stripe', () => {
          it('marks the order paid exactly once when Stripe retries the same event', async () => {
            const order = await createPendingOrder({ totalCents: 3097 });
            const delivery = signed(succeeded(order.id, 3097));

            await post(delivery).expect(200);
            await post(delivery).expect(200);

            const { rows: [row] } = await db.query('SELECT status FROM orders WHERE id = $1', [order.id]);
            expect(row.status).toBe('paid');
            const { rows: [outbox] } = await db.query("SELECT count(*)::int AS n FROM outbox WHERE topic = 'order.paid'");
            expect(outbox.n).toBe(1);
          });

          it('ignores an amount that does not match the order', async () => {
            const order = await createPendingOrder({ totalCents: 3097 });
            await post(signed(succeeded(order.id, 1))).expect(200);
            const { rows: [row] } = await db.query('SELECT status FROM orders WHERE id = $1', [order.id]);
            expect(row.status).toBe('pending_payment');
          });

          it('rejects an invalid signature', async () => {
            const order = await createPendingOrder({ totalCents: 100 });
            const { payload } = signed(succeeded(order.id, 100));
            await post({ payload, header: 't=1,v1=deadbeef' }).expect(400);
          });
        });
      `),
    },
  },
  security: [
    'Transport: TLS everywhere (LB terminates, HSTS via helmet), `Secure` + `HttpOnly` + `SameSite` cookies.',
    'Input: zod on every route, `express.json({ limit })`, parameterised SQL only.',
    'AuthZ: deny-by-default routers, ownership checks in services, admin routes behind role check and separate rate limits.',
    'Payments: never trust client-side "success"; verify webhook signatures over the raw body; idempotency keys on every Stripe write; compare amounts.',
    'Abuse: Redis-backed global + per-route rate limits (login, checkout), bot protection on checkout.',
    'Secrets: from a secret manager, rotated; `.env` only for local dev and in `.gitignore`; logs redact auth headers, cookies, tokens.',
    'Supply chain: lockfile + `npm ci`, Dependabot/Renovate, `npm audit` and image scanning in CI, minimal base image, `--ignore-scripts` where possible.',
    'Container: non-root user, read-only root FS, no shell tools needed at runtime, resource limits.',
    'Operational: error responses never leak stack traces; security-relevant events (login failures, refunds, role changes) go to an audit log.',
  ],
  deployment: {
    bullets: [
      'CI on every push/PR: lint → tests with Postgres + Redis services → `npm audit` → image build.',
      'CD on `main`: push the image tagged with the commit SHA → run migrations as a one-off job → rolling update (`maxUnavailable: 0`) gated on `/readyz` → automatic rollback if the rollout fails.',
      'Workers deploy from the same image with a different command; scale them on queue depth.',
      'Dashboards: RED per route, queue depth, DB pool usage, event-loop lag; alerts on error rate, p95 and DLQ growth.',
    ],
    code: {
      id: 'p12-deploy',
      title: '.github/workflows/ci-cd.yml',
      language: 'yaml',
      code: dedent(`
        name: ci-cd
        on:
          push:
            branches: [main]
          pull_request:

        permissions:
          contents: read
          packages: write

        env:
          IMAGE: ghcr.io/\${{ github.repository }}

        jobs:
          test:
            runs-on: ubuntu-latest
            services:
              postgres:
                image: postgres:17
                env:
                  POSTGRES_PASSWORD: postgres
                  POSTGRES_DB: shop_test
                ports: ["5432:5432"]
                options: --health-cmd pg_isready --health-interval 5s --health-retries 10
              redis:
                image: redis:7
                ports: ["6379:6379"]
            env:
              NODE_ENV: test
              DATABASE_URL: postgresql://postgres:postgres@localhost:5432/shop_test
              REDIS_URL: redis://localhost:6379
              JWT_ACCESS_SECRET: test-secret-test-secret-test-secret-123
              STRIPE_SECRET_KEY: sk_test_dummy
              STRIPE_WEBHOOK_SECRET: whsec_test_secret
              CORS_ORIGINS: http://localhost:5173
            steps:
              - uses: actions/checkout@v4
              - uses: actions/setup-node@v4
                with:
                  node-version: 22
                  cache: npm
              - run: npm ci
              - run: npm run lint
              - run: npm audit --omit=dev --audit-level=high
              - run: npm run migrate
              - run: npm test -- --coverage

          build:
            needs: test
            if: github.ref == 'refs/heads/main'
            runs-on: ubuntu-latest
            steps:
              - uses: actions/checkout@v4
              - uses: docker/setup-buildx-action@v3
              - uses: docker/login-action@v3
                with:
                  registry: ghcr.io
                  username: \${{ github.actor }}
                  password: \${{ secrets.GITHUB_TOKEN }}
              - uses: docker/build-push-action@v6
                with:
                  push: true
                  tags: \${{ env.IMAGE }}:\${{ github.sha }}
                  cache-from: type=gha
                  cache-to: type=gha,mode=max

          deploy:
            needs: build
            runs-on: ubuntu-latest
            environment: production
            steps:
              - uses: actions/checkout@v4
              - name: Run migrations
                run: ./deploy/migrate.sh "\${{ env.IMAGE }}:\${{ github.sha }}"
                env:
                  DATABASE_URL: \${{ secrets.PROD_DATABASE_URL }}
              - name: Rolling update
                run: |
                  kubectl set image deployment/shop-api api="\${{ env.IMAGE }}:\${{ github.sha }}"
                  kubectl set image deployment/shop-worker worker="\${{ env.IMAGE }}:\${{ github.sha }}"
                  kubectl rollout status deployment/shop-api --timeout=5m || (kubectl rollout undo deployment/shop-api && exit 1)
      `),
      explanation: [
        'The deploy job assumes a cluster context configured for the runner (e.g. via an OIDC-based cloud login step) and a `deploy/migrate.sh` script that runs the migration command inside the new image.',
      ],
    },
  },
  extensions: [
    'Blue/green or canary releases with automated rollback on error-rate SLO breach.',
    'Read replicas for catalogue queries; Redis cache with event-based invalidation from the outbox.',
    'Split `notifications` into the p09 service, consuming outbox events through a broker (Kafka/NATS/RabbitMQ).',
    'Search with OpenSearch/Meilisearch fed by outbox events.',
    'Feature flags for risky changes (e.g. a new payment flow).',
    'SLOs + error budgets, synthetic checkout probes, on-call runbooks.',
  ],
};
