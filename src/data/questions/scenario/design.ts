import type { InterviewQuestion } from '../../../types';
import { sc } from './helpers';

/** Scenario questions: data, caching, scaling and system design. */
export const designScenarioQuestions: InterviewQuestion[] = [
  sc({
    id: 'sc-045',
    category: 'javascript',
    difficulty: 'beginner',
    topic: 'Dates and time zones',
    question: 'Users in India and the US see bookings on the wrong day, and a report "for March 1" misses some orders. Dates are stored as strings like `"2025-03-01 10:00"`. How do you fix date handling?',
    shortAnswer: 'Store instants in UTC (`timestamptz` / ISO 8601 with `Z`), keep the user\'s IANA time zone separately, and convert only at the edges (input parsing and display); compute "a day" in the relevant time zone.',
    detailedAnswer: [
      'A string without an offset is ambiguous — `new Date("2025-03-01 10:00")` is parsed as *local* time of whatever server runs it.',
      'Store timestamps as UTC instants (PostgreSQL `timestamptz`, ISO strings like `2025-03-01T04:30:00Z`).',
      'Store each user\'s or business\'s IANA zone (`Asia/Kolkata`) and convert for display with `Intl.DateTimeFormat` or a library (Luxon, date-fns-tz).',
      'For reports, define the day boundaries in the business\'s zone, convert them to UTC, then query the range `[start, end)`.',
      'Run servers in UTC and add tests around DST transitions; pure dates (birthdays) can stay as `date` without a time.',
    ],
    code: {
      language: 'javascript',
      code: `
        const d = new Date('2025-03-01T04:30:00Z');
        console.log(d.toISOString()); // 2025-03-01T04:30:00.000Z
        console.log(new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' }).format(d));
      `,
    },
    followUp: 'Why are fixed offsets like `+05:30` not a substitute for IANA zone names?',
    trap: 'Setting the server time zone to match one region\'s users.',
    relatedLessonIds: ['m01-es6-plus-features', 'm09-database-fundamentals'],
  }),
  sc({
    id: 'sc-046',
    category: 'express-backend',
    difficulty: 'intermediate',
    topic: 'Background jobs',
    question: 'Signup takes 3–5 s because the handler sends a welcome email and creates a CRM contact before responding; when the email provider is down, signups fail. How do you restructure it?',
    shortAnswer: 'Respond after the core write (the user row) and move side effects to a background queue with retries; a provider outage then delays emails instead of breaking signups.',
    detailedAnswer: [
      'Decide what is essential to the response (creating the user) and what is a side effect (email, CRM, analytics).',
      'Enqueue jobs (BullMQ/SQS/RabbitMQ) after the user is committed; return 201 immediately.',
      'Workers retry with exponential backoff and jitter, and send exhausted jobs to a dead-letter queue for inspection.',
      'Jobs must be idempotent (e.g. "welcome email sent" flag) because queues deliver at least once.',
      'To avoid "user saved but job never enqueued", use the transactional outbox pattern or enqueue in the same transaction boundary.',
      'Monitor queue depth, failures and job age.',
    ],
    followUp: 'Why not just call the email API without awaiting it (fire and forget)?',
    trap: 'Running the side effects with a non-awaited promise inside the API process — they are lost on crash or deploy.',
    relatedLessonIds: ['m11-message-queues', 'm11-background-jobs', 'm11-bullmq'],
  }),
  sc({
    id: 'sc-047',
    category: 'express-backend',
    difficulty: 'intermediate',
    topic: 'Slow queries and indexes',
    question: 'A search endpoint `GET /orders?customerEmail=...&status=paid` got slower as the table grew to 20 million rows; it now takes 4 s. How do you fix it?',
    shortAnswer: 'Run `EXPLAIN ANALYZE` to confirm a sequential scan, then add an index that matches the filter and sort (e.g. a composite index on `(customer_email, status, created_at)`), and verify the plan uses it.',
    detailedAnswer: [
      'Get the exact SQL the ORM generates and run `EXPLAIN (ANALYZE, BUFFERS)` against production-like data.',
      'A `Seq Scan` over millions of rows means no usable index; create one that matches equality filters first, then the sort column.',
      'Build it without locking writes: `CREATE INDEX CONCURRENTLY` in PostgreSQL.',
      'Watch for things that prevent index use: functions on the column (`lower(email)` needs an expression index), leading wildcards (`LIKE "%x"`), type mismatches.',
      'Indexes cost write performance and storage — do not index every column; drop unused ones.',
      'Prevent: slow-query logging (`log_min_duration_statement`) and query performance dashboards.',
    ],
    code: {
      language: 'sql',
      code: `
        EXPLAIN ANALYZE
        SELECT id, total, created_at FROM orders
        WHERE customer_email = 'a@example.com' AND status = 'paid'
        ORDER BY created_at DESC LIMIT 20;

        CREATE INDEX CONCURRENTLY idx_orders_email_status_created
          ON orders (customer_email, status, created_at DESC);
      `,
    },
    followUp: 'Why does column order matter in a composite index?',
    trap: 'Adding separate single-column indexes on every filtered column and assuming the planner will combine them efficiently.',
    relatedLessonIds: ['m09-indexes', 'm09-sql-queries', 'm11-performance-optimization'],
  }),
  sc({
    id: 'sc-048',
    category: 'advanced',
    difficulty: 'intermediate',
    topic: 'Cache invalidation',
    question: 'You added Redis caching (cache-aside, TTL 1 hour) to product pages. Now merchants complain that price changes take up to an hour to appear. How do you fix it without losing the cache benefits?',
    shortAnswer: 'Invalidate (delete) the cache key when the product is updated — after the DB commit — and keep a TTL only as a safety net; for multi-key data, use versioned keys or events to invalidate.',
    detailedAnswer: [
      'Cache-aside: read → miss → load from DB → set with TTL. Writes go to the DB, so the cache must be told.',
      'On update, commit to the DB first, then `DEL product:<id>`; the next read repopulates it. Deleting is safer than writing the new value (avoids racing writers).',
      'If many keys depend on one product (listings, search pages), use versioned keys (`product:<id>:v<version>`) or publish an invalidation event that all instances handle.',
      'Keep a shorter TTL as a backstop for missed invalidations.',
      'Beware in-process caches on multiple instances — they need pub/sub invalidation too.',
      'For critical fields like price, consider not caching them, or validating price at checkout from the DB.',
    ],
    code: {
      language: 'javascript',
      code: `
        async function getProduct(id) {
          const cached = await redis.get('product:' + id);
          if (cached) return JSON.parse(cached);
          const product = await repo.findProduct(id);
          await redis.set('product:' + id, JSON.stringify(product), 'EX', 3600);
          return product;
        }

        async function updateProduct(id, changes) {
          const product = await repo.updateProduct(id, changes); // commit first
          await redis.del('product:' + id);                       // then invalidate
          return product;
        }
      `,
    },
    followUp: 'What race condition can still serve stale data with delete-on-write, and how do you mitigate it?',
    trap: 'Lowering the TTL to 10 seconds, which mostly destroys the cache hit rate.',
    relatedLessonIds: ['m11-caching', 'm11-redis'],
  }),
  sc({
    id: 'sc-049',
    category: 'advanced',
    difficulty: 'intermediate',
    topic: 'SQL vs NoSQL',
    question: 'You are starting an order-management service: customers, orders, line items, payments, and reporting by finance. A teammate wants MongoDB "because it is faster and schemaless". How do you decide?',
    shortAnswer: 'Choose from access patterns and consistency needs, not hype: relational, transactional data with ad-hoc reporting fits PostgreSQL well; a document store fits self-contained aggregates with flexible shape. Here, SQL is the safer default.',
    detailedAnswer: [
      'List the access patterns: joins across customers/orders/payments, multi-row transactions, finance reports with aggregates and filters.',
      'Relational strengths: constraints (foreign keys, unique), ACID transactions, SQL for reporting, mature tooling. PostgreSQL also has `jsonb` for flexible fields.',
      'Document strengths: storing an aggregate together (an order with its items), flexible schemas, horizontal scaling patterns; MongoDB supports multi-document transactions but they are not its natural model.',
      '"Schemaless" still means a schema — it just lives in application code (and Mongoose schemas).',
      'Performance depends on modelling and indexes far more than on the engine.',
      'Consider team expertise and operations; you can add a specialized store (search index, cache) later.',
    ],
    followUp: 'What would make you pick a document database for this service after all?',
    trap: 'Declaring one universally faster or better.',
    relatedLessonIds: ['m09-nosql-fundamentals', 'm09-database-fundamentals', 'm09-database-architecture'],
  }),
  sc({
    id: 'sc-050',
    category: 'advanced',
    difficulty: 'advanced',
    topic: 'Scaling WebSockets',
    question: 'Your chat app uses Socket.IO on one server. After scaling to 4 instances behind a load balancer, users in the same room stop receiving each other\'s messages, and some connections fail during the handshake. How do you fix it?',
    shortAnswer: 'Each instance only knows its own sockets: add a pub/sub layer (e.g. the Socket.IO Redis adapter) so broadcasts reach all instances, and enable sticky sessions (or WebSocket-only transport) so the HTTP long-polling handshake hits one instance.',
    detailedAnswer: [
      'Room membership lives in each process\'s memory; a message emitted on instance A never reaches clients on instance B.',
      'The Redis adapter (or Redis Streams/NATS) publishes every broadcast so all instances deliver to their local sockets.',
      'Socket.IO starts with HTTP long-polling requests that must reach the same instance — configure sticky sessions on the LB, or force `transports: ["websocket"]`.',
      'Keep application state (presence, history) in Redis/DB, not in process memory.',
      'Plan capacity: open file descriptor limits, memory per connection, heartbeat intervals, and LB idle timeouts.',
      'On deploys, connections drop — clients must reconnect with backoff and resync missed messages (store messages durably with IDs).',
    ],
    code: {
      language: 'javascript',
      code: `
        const { createAdapter } = require('@socket.io/redis-adapter');
        const { createClient } = require('redis');

        const pub = createClient({ url: process.env.REDIS_URL });
        const sub = pub.duplicate();
        await Promise.all([pub.connect(), sub.connect()]);
        io.adapter(createAdapter(pub, sub));
      `,
    },
    followUp: 'How would you deliver a message to a specific user who may have tabs open on different instances?',
    trap: 'Only adding sticky sessions — that fixes the handshake but not cross-instance broadcasts.',
    relatedLessonIds: ['m11-websockets', 'm11-socket-io', 'm14-horizontal-scaling'],
  }),
  sc({
    id: 'sc-051',
    category: 'advanced',
    difficulty: 'advanced',
    topic: 'Cache stampede',
    question: 'A homepage query is cached in Redis with a 5-minute TTL. Every time the key expires, the database CPU spikes to 100% for a few seconds and the site slows down. What is happening and how do you prevent it?',
    shortAnswer: 'A cache stampede: thousands of concurrent requests miss at the same moment and all recompute. Ensure only one recomputation happens (request coalescing / lock), serve stale data while refreshing, and add TTL jitter.',
    detailedAnswer: [
      'At expiry, every in-flight request sees a miss and runs the expensive query in parallel.',
      'In-process coalescing: keep a Map of in-flight promises so concurrent misses on one instance share one DB call.',
      'Across instances: a short Redis lock (`SET lock:key NX PX 10000`); the winner recomputes, others wait briefly or serve stale.',
      'Stale-while-revalidate: store the value with a soft expiry; after it, serve the old value and refresh in the background.',
      'Add random jitter to TTLs so many keys do not expire together; pre-warm hot keys after deploys.',
      'Probabilistic early refresh (XFetch) spreads recomputation before the hard expiry.',
    ],
    code: {
      language: 'javascript',
      code: `
        const inFlight = new Map();
        async function cached(key, ttlSec, load) {
          const hit = await redis.get(key);
          if (hit) return JSON.parse(hit);
          if (inFlight.has(key)) return inFlight.get(key); // coalesce on this instance
          const p = (async () => {
            try {
              const value = await load();
              const jitter = Math.floor(Math.random() * 30);
              await redis.set(key, JSON.stringify(value), 'EX', ttlSec + jitter);
              return value;
            } finally {
              inFlight.delete(key);
            }
          })();
          inFlight.set(key, p);
          return p;
        }
      `,
    },
    followUp: 'What is the difference between a cache stampede, cache penetration (missing keys) and cache avalanche?',
    trap: 'Increasing the TTL — it only makes the stampede less frequent.',
    relatedLessonIds: ['m11-caching', 'm11-redis', 'm11-performance-optimization'],
  }),
  sc({
    id: 'sc-052',
    category: 'advanced',
    difficulty: 'advanced',
    topic: 'Zero-downtime migrations',
    question: 'You must rename the column `users.name` to `full_name` (and later split it). Instances of the old and new app version run side by side during rolling deploys. How do you migrate with zero downtime?',
    shortAnswer: 'Use expand/contract: add the new column, deploy code that writes both and reads new-with-fallback, backfill in batches, switch reads, then stop writing the old column and drop it in a later release.',
    detailedAnswer: [
      'A direct `RENAME COLUMN` breaks whichever app version still uses the old name during the rollout.',
      'Expand: `ALTER TABLE users ADD COLUMN full_name text` (nullable, no default rewrite — fast).',
      'Deploy v2: write to both columns, read `full_name ?? name`.',
      'Backfill existing rows in small batches (`UPDATE ... WHERE id BETWEEN ...`) to avoid long locks and replication lag.',
      'Deploy v3: read only `full_name`, still write both (so a rollback to v2 is safe); then v4 stops writing `name`.',
      'Contract: drop `name` in a later migration once nothing uses it. Use `lock_timeout` on DDL and test migrations against a production-sized copy.',
    ],
    code: {
      language: 'sql',
      code: `
        -- Release 1 (expand)
        ALTER TABLE users ADD COLUMN full_name text;
        -- Backfill in batches
        UPDATE users SET full_name = name WHERE full_name IS NULL AND id BETWEEN 1 AND 10000;
        -- Release N (contract), after all code reads/writes full_name only
        ALTER TABLE users DROP COLUMN name;
      `,
    },
    followUp: 'How would you add a `NOT NULL` constraint to a huge table without a long lock? (Add a `CHECK ... NOT VALID`, then `VALIDATE CONSTRAINT`.)',
    trap: 'Running the rename and the code deploy "at the same time" and assuming there is no overlap.',
    relatedLessonIds: ['m14-database-migrations', 'm14-ci-cd'],
  }),
  sc({
    id: 'sc-053',
    category: 'advanced',
    difficulty: 'advanced',
    topic: 'Splitting a monolith',
    question: 'Your Node monolith has 40 developers committing to it, deploys take an hour, and one bad module can take down everything. Leadership wants microservices. How do you approach it?',
    shortAnswer: 'Split incrementally along business boundaries, not technical layers: first modularize inside the monolith, then extract one well-bounded, high-value domain at a time behind an API/gateway (strangler fig), giving each service its own data.',
    detailedAnswer: [
      'Check the real pain first — slow deploys or tight coupling might be fixed with a modular monolith, better CI and feature flags.',
      'Identify bounded contexts (billing, catalog, notifications) and enforce module boundaries inside the monolith (no cross-module DB access).',
      'Extract the first service where the boundary is clear and the benefit high (independent scaling or release cadence).',
      'Use the strangler fig pattern: route its endpoints through a gateway/proxy to the new service while the rest stays in the monolith.',
      'Each service owns its data; replace shared tables with APIs or events (outbox, CDC) and accept eventual consistency.',
      'Invest up front in platform basics: CI/CD per service, tracing, centralized logs, contracts, and on-call ownership.',
    ],
    followUp: 'How do you handle a business transaction that spans two services after the split?',
    trap: 'Splitting into many tiny services that still share one database — a distributed monolith.',
    relatedLessonIds: ['m11-message-queues', 'm14-horizontal-scaling', 'm08-route-organization'],
  }),
  sc({
    id: 'sc-054',
    category: 'advanced',
    difficulty: 'advanced',
    topic: 'Design: URL shortener',
    question: 'Design a URL shortener: `POST /links` creates a short code, `GET /:code` redirects. Expect 100 M redirects per day and 1 M new links per day.',
    shortAnswer: 'A read-heavy key-value lookup: generate unique short codes (base62 of a distributed ID or random with collision check), store code → URL in a durable store, cache hot codes in Redis/CDN, redirect with 301/302, and record analytics asynchronously.',
    detailedAnswer: [
      'Scale: ~1,200 redirects/s on average (peaks several times higher) and ~12 writes/s — optimise reads.',
      'Codes: base62 encoding of an ID from a sequence/Snowflake-style generator (7 chars ≈ 3.5 trillion codes), or random codes with a unique constraint and retry on collision. Avoid predictable sequential codes if links should not be enumerable.',
      'Storage: a table `links(code PK, url, owner_id, created_at, expires_at)` in PostgreSQL or a key-value store like DynamoDB.',
      'Read path: CDN/edge cache → Redis → DB; most traffic hits the cache. Use 302 if you need analytics on every hit, 301 for maximum caching.',
      'Analytics: emit click events to a queue/stream and aggregate offline; never block the redirect on writes.',
      'Abuse: validate URLs, scan against malware lists, rate-limit creation, support takedowns and expiry.',
    ],
    code: {
      language: 'javascript',
      code: `
        const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
        function toBase62(n) {
          let s = '';
          do {
            s = ALPHABET[Number(n % 62n)] + s;
            n /= 62n;
          } while (n > 0n);
          return s;
        }
        console.log(toBase62(125n)); // '21'
      `,
    },
    followUp: 'How would you support custom aliases and prevent two users claiming the same one concurrently?',
    trap: 'Hashing the long URL with MD5 and truncating it, without handling collisions.',
    relatedLessonIds: ['m11-caching', 'm07-rest-api-design', 'm09-indexes'],
  }),
  sc({
    id: 'sc-055',
    category: 'advanced',
    difficulty: 'advanced',
    topic: 'Design: notification system',
    question: 'Design a notification service that sends email, SMS and push notifications for many product teams, with user preferences, retries and no duplicate sends.',
    shortAnswer: 'An API accepts notification requests and writes them durably, a queue fans out to per-channel workers that apply preferences/templates and call providers with retries, idempotency keys prevent duplicates, and status/events are tracked per message.',
    detailedAnswer: [
      'API: `POST /notifications` with `userId`, `type`, `data` and an idempotency key; validates and stores a record, then enqueues it (outbox to avoid lost messages).',
      'Routing worker: loads user preferences (opt-outs, quiet hours, channels) and templates, then enqueues per-channel jobs.',
      'Channel workers (email/SMS/push) call providers with timeouts, retries with exponential backoff and jitter, and a dead-letter queue.',
      'Deduplicate with the idempotency key and per-channel delivery records (unique constraint), since queues are at-least-once.',
      'Rate-limit per provider and per user (no 50 SMS in a minute); prioritise transactional (password reset) over marketing via separate queues.',
      'Track status (queued, sent, delivered, failed) via provider webhooks; expose metrics and an audit log; support provider failover.',
    ],
    followUp: 'How would you implement a daily digest that batches many events into one email per user?',
    trap: 'Sending notifications synchronously from each product service\'s request handlers.',
    relatedLessonIds: ['m11-message-queues', 'm11-bullmq', 'm11-background-jobs'],
  }),
  sc({
    id: 'sc-056',
    category: 'advanced',
    difficulty: 'advanced',
    topic: 'Race conditions and overselling',
    question: 'During a flash sale, 120 orders were accepted for a product with 100 units in stock. The code reads the stock, checks `stock > 0`, then updates it. How do you fix it?',
    shortAnswer: 'The read-check-write is not atomic, so concurrent requests all see stock available. Make the check and decrement a single atomic operation (conditional `UPDATE ... WHERE stock >= qty` and check affected rows), or lock the row inside a transaction.',
    detailedAnswer: [
      'Node being single-threaded does not help: between `await` points, other requests run, and multiple instances run truly in parallel.',
      'Atomic conditional update: `UPDATE products SET stock = stock - $1 WHERE id = $2 AND stock >= $1` and treat `rowCount = 0` as sold out.',
      'Alternatively `SELECT ... FOR UPDATE` in a transaction to lock the row, or optimistic locking with a `version` column and retry.',
      'Put the stock decrement and order insert in the same transaction so they commit or fail together.',
      'Add a `CHECK (stock >= 0)` constraint as a final safety net.',
      'For extreme contention, use reservations in Redis (atomic `DECR`/Lua) or a queue that serialises orders per product.',
    ],
    code: {
      language: 'javascript',
      code: `
        const { rowCount } = await client.query(
          'UPDATE products SET stock = stock - $1 WHERE id = $2 AND stock >= $1',
          [qty, productId],
        );
        if (rowCount === 0) throw new SoldOutError(productId);
      `,
    },
    followUp: 'What isolation level does PostgreSQL use by default, and would `SERIALIZABLE` alone solve this?',
    trap: 'Saying it cannot happen because "Node is single-threaded".',
    relatedLessonIds: ['m09-transactions', 'm09-sql-queries', 'm11-redis'],
  }),
  sc({
    id: 'sc-057',
    category: 'advanced',
    difficulty: 'advanced',
    topic: 'Noisy neighbour in multi-tenant SaaS',
    question: 'In your multi-tenant SaaS, one large customer runs huge exports and bulk API imports, and every other tenant\'s requests slow down. How do you protect the platform?',
    shortAnswer: 'Add per-tenant fairness and isolation: per-tenant rate limits and concurrency caps, separate queues or weighted fair scheduling for heavy jobs, query limits/timeouts, and for the largest tenants, dedicated capacity.',
    detailedAnswer: [
      'Measure per tenant: requests, DB time, queue usage — tag metrics and traces with `tenantId`.',
      'Rate-limit and cap concurrent requests per tenant (token bucket in Redis), returning 429 with `Retry-After`.',
      'Move bulk work to background queues with per-tenant concurrency limits so one tenant\'s 10,000 jobs do not block others.',
      'Protect the DB: statement timeouts, pagination limits, read replicas for exports, and indexes for tenant-scoped queries.',
      'Bulkheads: separate worker pools/instances for heavy job types; consider a dedicated "large tenant" shard or plan tier.',
      'Make limits part of the product (plans, quotas) and communicate them in the API docs.',
    ],
    followUp: 'How would you implement fair scheduling across tenants in a single job queue?',
    trap: 'Scaling everything up for all tenants to absorb one customer\'s load.',
    relatedLessonIds: ['m07-rate-limiting', 'm11-message-queues', 'm14-horizontal-scaling'],
  }),
  sc({
    id: 'sc-058',
    category: 'advanced',
    difficulty: 'advanced',
    topic: 'Transactional outbox',
    question: 'The order service saves an order to PostgreSQL and then publishes `OrderCreated` to a message broker. Occasionally the order exists but downstream services never hear about it. Why, and how do you guarantee delivery?',
    shortAnswer: 'The DB write and the publish are two separate systems with no shared transaction — a crash or broker error between them loses the event. Write the event to an outbox table in the same DB transaction, and have a relay publish it with retries (consumers deduplicate).',
    detailedAnswer: [
      'Dual write problem: "commit then publish" loses events on failure; "publish then commit" can announce orders that never existed.',
      'Outbox: in the same transaction insert the order and a row in `outbox(id, type, payload, published_at)`.',
      'A relay process polls unpublished rows (`FOR UPDATE SKIP LOCKED`) or uses change data capture (Debezium) and publishes them, marking them done.',
      'Delivery becomes at-least-once — consumers must be idempotent (store processed event IDs).',
      'Monitor outbox lag; clean up old rows.',
      'The same pattern solves "user saved but welcome email job never enqueued".',
    ],
    code: {
      language: 'javascript',
      code: `
        await client.query('BEGIN');
        const { rows } = await client.query('INSERT INTO orders (customer_id, total) VALUES ($1, $2) RETURNING id', [customerId, total]);
        await client.query(
          'INSERT INTO outbox (type, payload) VALUES ($1, $2)',
          ['OrderCreated', JSON.stringify({ orderId: rows[0].id, customerId, total })],
        );
        await client.query('COMMIT'); // both or neither
      `,
    },
    followUp: 'How does a saga coordinate a multi-step business process across services without distributed transactions?',
    trap: 'Wrapping the broker publish in the DB transaction and believing that makes it atomic.',
    relatedLessonIds: ['m11-message-queues', 'm09-transactions'],
  }),
  sc({
    id: 'sc-059',
    category: 'advanced',
    difficulty: 'advanced',
    topic: 'Read replica lag',
    question: 'You moved reads to a PostgreSQL read replica. Now users sometimes update their profile and, on the redirect, see the old data — then it fixes itself a second later. How do you handle this?',
    shortAnswer: 'Replication is asynchronous, so the replica lags the primary. Provide read-your-writes consistency: route a user\'s reads to the primary for a short time after they write (or for that request flow), and use replicas for lag-tolerant reads.',
    detailedAnswer: [
      'Measure lag (`pg_last_xact_replay_timestamp()` on the replica) and confirm it matches the symptom.',
      'After a write, mark the session (cookie/Redis) with a "read from primary until T" timestamp of a few seconds.',
      'Or return the updated entity from the write endpoint so the client does not need to re-read it.',
      'Classify queries: profile and checkout flows need fresh data (primary); feeds, search and reports tolerate lag (replica).',
      'Advanced: track the WAL position (LSN) of the write and only use a replica that has replayed past it.',
      'Alert on replica lag and remove lagging replicas from rotation.',
    ],
    followUp: 'Would synchronous replication fix this, and what does it cost?',
    trap: 'Adding a `setTimeout` delay before the redirect.',
    relatedLessonIds: ['m09-database-architecture', 'm14-horizontal-scaling'],
  }),
  sc({
    id: 'sc-060',
    category: 'advanced',
    difficulty: 'advanced',
    topic: 'Cascading failures from a slow dependency',
    question: 'A third-party shipping-rates API started responding in 30 s instead of 200 ms. Within minutes your whole API was down, including endpoints that do not use shipping. What happened and how do you make the system resilient?',
    shortAnswer: 'Requests waiting on the slow dependency piled up and exhausted shared resources (sockets, DB connections, memory). Add tight timeouts, a circuit breaker, bounded concurrency (bulkhead) for that dependency, and fallbacks.',
    detailedAnswer: [
      'Without a timeout, each request holds resources for 30 s; at 100 req/s that is thousands of concurrent in-flight requests.',
      'Set explicit timeouts on every outbound call: `fetch(url, { signal: AbortSignal.timeout(2000) })` (Node 18+).',
      'Circuit breaker (e.g. opossum): after a failure threshold, fail fast for a cool-down period instead of calling the dependency, then probe with half-open requests.',
      'Bulkhead: cap concurrent calls to that dependency (a semaphore/separate agent pool) so it cannot consume everything.',
      'Fallbacks: cached rates, default flat-rate shipping, or a clear 503 for that feature only.',
      'Retries only with backoff + jitter and a retry budget, or they amplify the outage. Alert on dependency latency.',
    ],
    code: {
      language: 'javascript',
      code: `
        async function getRates(order) {
          try {
            const res = await fetch(RATES_URL, {
              method: 'POST',
              body: JSON.stringify(order),
              headers: { 'content-type': 'application/json' },
              signal: AbortSignal.timeout(2000),
            });
            if (!res.ok) throw new Error('rates ' + res.status);
            return await res.json();
          } catch (err) {
            logger.warn({ err }, 'shipping rates unavailable, using fallback');
            return fallbackRates(order);
          }
        }
      `,
    },
    followUp: 'Explain the three states of a circuit breaker.',
    trap: 'Adding automatic retries, which multiplies load on the already-struggling dependency.',
    relatedLessonIds: ['m11-performance-optimization', 'm05-error-handling-in-asynchronous-code', 'm05-promise-race'],
  }),
];
