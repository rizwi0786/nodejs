import type { ModuleContent } from '../../../types';
import { bullets, code, dedent, diagram, flow, interviewTip, note, section, steps, table, text, warn } from '../helpers';

const content: Partial<ModuleContent> = {
  'event-driven-architecture': {
    summary: 'In event-driven architecture, services publish facts about things that happened ("OrderPlaced") to an event bus and other services react independently, giving loose coupling and scalability at the price of eventual consistency; event sourcing and CQRS take the idea further.',
    topics: ['domain events', 'event bus', 'choreography', 'eventual consistency', 'event-carried state transfer', 'event sourcing', 'CQRS', 'Kafka'],
    sections: [
      section('introduction', undefined,
        text('Module 2 introduced event-driven *programming* inside Node (the event loop, EventEmitter). This lesson is about the *system-level* style: whole services communicating through events.'),
      ),
      section('definition', 'Core concepts',
        bullets(
          '**Event**: an immutable fact in the past tense — `OrderPlaced`, `PaymentCaptured` — with an id, timestamp, type and payload.',
          '**Producer** publishes without knowing who listens; **consumers** subscribe and react.',
          '**Event bus / broker**: Kafka, RabbitMQ, AWS SNS/SQS/EventBridge, Google Pub/Sub, NATS.',
          '**Choreography**: no central coordinator; each service reacts to events and emits new ones.',
        ),
        table('Event styles', ['Style', 'Payload', 'Trade-off'], [
          ['Event notification', 'Minimal: `{ orderId }`', 'Small events; consumers call back for details (coupling)'],
          ['Event-carried state transfer', 'Full relevant state', 'Consumers keep local copies; bigger events, schema care'],
          ['Event sourcing', 'Events *are* the source of truth', 'Full history/audit; replay complexity'],
        ]),
      ),
      section('why', 'Why event-driven',
        bullets(
          'Loose coupling: add a new consumer (fraud check, analytics) without touching the producer.',
          'Resilience: if a consumer is down, events wait in the broker.',
          'Scalability: consumers scale independently; work is absorbed by the broker.',
          'Responsiveness: the API returns `202 Accepted` and the rest happens asynchronously.',
          'Cost: **eventual consistency**, harder debugging, need for idempotency and ordering strategy.',
        ),
      ),
      section('internals', 'Event sourcing and CQRS (briefly)',
        steps(
          '**Event sourcing**: store every state change as an event in an append-only log; current state = fold (reduce) over events.',
          'Benefits: complete audit trail, temporal queries ("balance as of last Tuesday"), rebuildable projections.',
          'Costs: event schema evolution, snapshots for long streams, harder ad-hoc queries.',
          '**CQRS** (Command Query Responsibility Segregation): separate write model (commands → events) from read models (projections optimised for queries).',
          'They are often combined but independent — you can use CQRS without event sourcing.',
        ),
        warn('Event sourcing is a big commitment. Use it for domains where history is the product (ledgers, audit-heavy workflows), not as a default persistence strategy.'),
      ),
      section('visual', 'Choreography',
        flow(['Orders: publish OrderPlaced', 'Inventory: reserve → StockReserved', 'Payments: charge → PaymentCaptured', 'Orders: mark paid', 'Email: send receipt'],
          { title: 'Services react to each other\'s events', direction: 'horizontal' }),
        diagram('microservices', 'Services connected through a message broker.'),
      ),
      section('example', 'Choreography and event sourcing',
        code({
          title: 'Choreographed workflow on an async bus (runnable)',
          code: dedent(`
            const subscribers = {};
            const on = (type, fn) => (subscribers[type] ??= []).push(fn);
            const publish = (type, payload) =>
              setTimeout(() => (subscribers[type] ?? []).forEach((fn) => fn(payload)), 0);

            on('order.placed', (o) => { console.log('inventory: reserve', o.id); publish('stock.reserved', o); });
            on('order.placed', (o) => console.log('email: thanks for order', o.id));
            on('stock.reserved', (o) => { console.log('payments: charge', o.id); publish('payment.captured', o); });
            on('payment.captured', (o) => console.log('orders: mark paid', o.id));

            publish('order.placed', { id: 'o1' });
            console.log('order API returned 202');
          `),
          expectedOutput: 'order API returned 202\ninventory: reserve o1\nemail: thanks for order o1\npayments: charge o1\norders: mark paid o1',
          explanation: [
            'The API responds before any consumer runs — work continues asynchronously.',
            'No service calls another directly; each only knows event types.',
            'Adding a fraud check = one more `on(\'order.placed\')`, zero changes elsewhere.',
          ],
          runnable: true,
        }),
        code({
          title: 'Event sourcing: state is a fold over events (runnable)',
          code: dedent(`
            const events = [
              { type: 'AccountOpened', owner: 'Ada' },
              { type: 'MoneyDeposited', amount: 100 },
              { type: 'MoneyWithdrawn', amount: 30 },
              { type: 'MoneyDeposited', amount: 5 },
            ];

            function apply(state, e) {
              switch (e.type) {
                case 'AccountOpened': return { owner: e.owner, balance: 0, version: 1 };
                case 'MoneyDeposited': return { ...state, balance: state.balance + e.amount, version: state.version + 1 };
                case 'MoneyWithdrawn': return { ...state, balance: state.balance - e.amount, version: state.version + 1 };
                default: return state;
              }
            }

            console.log(JSON.stringify(events.reduce(apply, null)));
            console.log('balance after 2 events:', events.slice(0, 2).reduce(apply, null).balance);
          `),
          expectedOutput: '{"owner":"Ada","balance":75,"version":4}\nbalance after 2 events: 100',
          explanation: [
            'Current state is derived, never stored directly.',
            'Replaying a prefix gives historical state for free.',
            '`version` supports optimistic concurrency when appending new events.',
          ],
          runnable: true,
        }),
        code({
          title: 'Event envelope',
          language: 'json',
          code: dedent(`
            {
              "id": "0b6f5c6e-6a43-4bd7-9a7e-2a5d0c4f1d11",
              "type": "order.placed",
              "version": 2,
              "occurredAt": "2025-03-01T12:00:00.000Z",
              "source": "orders-service",
              "traceparent": "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01",
              "data": { "orderId": "o1", "customerId": "c7", "totalCents": 4500 }
            }
          `),
          explanation: [
            '`id` enables deduplication; `version` enables schema evolution.',
            '`traceparent` continues the distributed trace across the broker.',
            'Standards like CloudEvents define similar envelope fields.',
          ],
        }),
      ),
      section('real-world', 'In a real backend',
        bullets(
          'Kafka topics per domain (`orders.events`) with partition key = aggregate id to preserve per-order ordering.',
          'Read models (search index, dashboards) built by consumers from events.',
          'A schema registry or versioned JSON Schemas so consumers survive producer changes.',
          'Choreography for simple flows; an orchestrator (saga) when the workflow has many steps and compensations.',
        ),
      ),
      section('mistakes', 'Common mistakes',
        bullets(
          'Commands disguised as events (`SendEmail`) — events state facts, not instructions.',
          'Assuming global ordering — most brokers order only within a partition/queue.',
          'Non-idempotent consumers (duplicates are normal with at-least-once delivery).',
          'Publishing an event and writing the DB separately (dual-write) — use an outbox.',
          'Huge choreographies nobody can trace — add correlation ids and consider orchestration.',
        ),
        code({
          title: 'Event naming',
          code: dedent(`
            // ❌ imperative: couples producer to a specific consumer
            publish('send-welcome-email', { userId });
            // ✅ past-tense fact: any number of consumers may react
            publish('user.registered', { userId, email, registeredAt });
          `),
          explanation: ['Facts let the producer stay ignorant of consumers.'],
        }),
      ),
      section('interview', 'Interview angle',
        interviewTip('Define events as immutable facts, explain eventual consistency with a concrete example, and briefly position event sourcing and CQRS with their costs.'),
      ),
      section('practice', 'Practice',
        text('Model a "cancel order" flow with events. Which services react to `order.cancelled`, what compensations happen (release stock, refund), and how do you make each consumer idempotent?'),
      ),
      section('summary', 'Summary',
        bullets(
          'Events = immutable past-tense facts.',
          'Producers do not know consumers → loose coupling.',
          'Eventual consistency, idempotency and ordering per key are the costs.',
          'Event sourcing: state = fold over events. CQRS: separate read/write models.',
          'Use outbox for reliable publishing.',
        ),
      ),
    ],
    revisionNotes: [
      'Event = fact (past tense); command = request (imperative).',
      'Choreography = react to events; orchestration = central coordinator.',
      'Event notification vs event-carried state transfer vs event sourcing.',
      'Ordering usually per partition/key only.',
      'CQRS ≠ event sourcing; often combined.',
      'System-level EDA ≠ Node event loop (Module 2).',
    ],
    quiz: [
      {
        kind: 'predict-output', difficulty: 'intermediate',
        prompt: 'What does this print?',
        code: "const events = [{ d: 10 }, { d: -3 }, { d: 5 }];\nconst balance = events.reduce((s, e) => s + e.d, 0);\nconsole.log(balance, events.slice(0, 2).reduce((s, e) => s + e.d, 0));",
        options: ['12 7', '12 10', '18 7', '7 12'],
        answer: 0,
        explanation: 'Full fold: 10 − 3 + 5 = 12. Prefix of two events: 10 − 3 = 7 — historical state by replay.',
      },
      {
        kind: 'mcq', difficulty: 'intermediate',
        prompt: 'Which is a well-named domain event?',
        options: ['SendInvoiceEmail', 'invoice.generate', 'InvoiceIssued', 'ProcessInvoiceNow'],
        answer: 2,
        explanation: 'Events are past-tense facts. The others are commands telling someone what to do.',
      },
      {
        kind: 'scenario', difficulty: 'advanced',
        prompt: 'After placing an order the user is redirected to "My orders", which reads from a projection updated by events — and the new order is missing for a second. Best response?',
        options: [
          'Switch everything back to synchronous calls',
          'Accept eventual consistency and design the UI for it (show the order from the command response, or read-your-writes from the write model briefly)',
          'Add a sleep of 2 seconds before redirecting',
          'Disable the projection',
        ],
        answer: 1,
        explanation: 'Eventual consistency is inherent. Read-your-own-writes techniques or optimistic UI hide the lag without losing the benefits.',
      },
    ],
    interview: [
      {
        category: 'advanced', kind: 'concept', difficulty: 'advanced', topic: 'Event-driven architecture',
        question: 'What is event-driven architecture at the system level and what trade-offs does it introduce?',
        shortAnswer: 'Services publish immutable facts to a broker and others react independently, which decouples and scales the system but introduces eventual consistency, duplicate and out-of-order delivery, and harder end-to-end debugging.',
        detailedAnswer: [
          'Producers do not know consumers; new consumers add features without changes.',
          'Broker buffers load and outages.',
          'Consumers must be idempotent (at-least-once delivery).',
          'Ordering only per partition/key.',
          'Need correlation ids, tracing, schema versioning, dead-letter queues.',
        ],
        followUp: 'How do you guarantee an event is published if and only if the database write succeeds?',
        trap: 'Confusing system-level EDA with Node\'s event loop or EventEmitter.',
      },
      {
        category: 'advanced', kind: 'concept', difficulty: 'advanced', topic: 'Event-driven architecture',
        question: 'Explain event sourcing and CQRS. Are they the same thing?',
        shortAnswer: 'Event sourcing stores state changes as an append-only sequence of events and derives current state by replaying them; CQRS separates the write model from read models. They complement each other but are independent patterns.',
        detailedAnswer: [
          'Event sourcing: audit trail, temporal queries, rebuildable projections.',
          'Costs: schema evolution of old events, snapshots, eventual read models.',
          'CQRS: commands update the write side; queries hit denormalised read stores.',
          'CQRS without event sourcing: write to Postgres, project to Elasticsearch.',
          'Use where history/audit or very different read/write loads justify the complexity.',
        ],
        followUp: 'How would you change the shape of an event type that already has millions of stored instances?',
        trap: 'Saying CQRS requires event sourcing.',
      },
    ],
  },

  'message-driven-architecture': {
    summary: 'Message-driven architecture connects components through asynchronous messages on a broker — commands to one handler, events to many — and relies on the transactional outbox for reliable publishing and idempotent consumers to survive at-least-once delivery.',
    topics: ['commands vs events', 'message broker', 'queues and topics', 'at-least-once delivery', 'transactional outbox', 'idempotent consumer', 'dead-letter queue', 'ack/nack'],
    sections: [
      section('introduction', undefined,
        text('Event-driven architecture talks about *what* is communicated (facts). Message-driven architecture is about *how*: durable messages, queues, acknowledgements, retries — and the two classic reliability problems: publishing reliably and consuming safely.'),
      ),
      section('definition', 'Commands vs events',
        table('Commands vs events', ['', 'Command', 'Event'], [
          ['Meaning', 'Request to do something', 'Fact that something happened'],
          ['Naming', 'Imperative: `ChargeCard`, `SendEmail`', 'Past tense: `CardCharged`, `EmailSent`'],
          ['Receivers', 'Exactly one logical handler', 'Zero or many subscribers'],
          ['Can be rejected?', 'Yes (validation, business rules)', 'No — it already happened'],
          ['Channel', 'Point-to-point queue', 'Topic / exchange / fan-out'],
        ]),
        table('Broker examples (third-party/managed)', ['Broker', 'Model', 'Typical use'], [
          ['RabbitMQ', 'Exchanges → queues, acks, routing keys', 'Task queues, commands, flexible routing'],
          ['Apache Kafka', 'Partitioned append-only log, consumer groups, offsets', 'High-throughput event streams, replay'],
          ['AWS SQS / SNS', 'Managed queue / fan-out topic', 'Serverless and AWS-native workloads'],
          ['Redis Streams / BullMQ', 'Streams with consumer groups / job queue on Redis', 'Background jobs in Node (Module 11)'],
          ['NATS / Google Pub/Sub', 'Lightweight messaging / managed pub-sub', 'Low-latency messaging, GCP workloads'],
        ]),
      ),
      section('why', 'Delivery guarantees',
        bullets(
          '**At-most-once**: may lose messages, never duplicates (fire-and-forget, Redis pub/sub).',
          '**At-least-once**: never lost (with acks + persistence), but may be **redelivered** — the common default.',
          '**Exactly-once** end-to-end is not something a broker can give your side effects for free; you achieve *effectively-once* processing with idempotent consumers (Kafka offers exactly-once semantics within Kafka transactions, not for external side effects like emails).',
        ),
      ),
      section('internals', 'Outbox and idempotent consumer',
        steps(
          '**Dual-write problem**: `INSERT order` then `publish OrderPlaced` — if the process dies between them, the DB and the world disagree.',
          '**Transactional outbox**: in the *same DB transaction* insert the order and a row in an `outbox` table.',
          'A **relay** (polling job or CDC like Debezium) reads unsent outbox rows, publishes them, marks them sent.',
          'The relay can crash after publishing but before marking → the message is published again → **duplicates are normal**.',
          '**Idempotent consumer**: record processed message ids (unique constraint) in the same transaction as the side effect, and skip already-processed ids.',
          'Failures: nack/retry with backoff; after N attempts move to a **dead-letter queue (DLQ)** for inspection.',
        ),
        note('The inbox pattern is the consumer-side mirror of the outbox: store incoming message ids in an `inbox` table to deduplicate.'),
      ),
      section('visual', 'Reliable messaging',
        diagram('queue-worker', 'Producer → broker queue → workers with retries and a dead-letter queue.'),
        flow(['Tx: INSERT order + INSERT outbox', 'Relay: publish unsent rows', 'Broker: at-least-once delivery', 'Consumer: check processed ids → act → record id'],
          { title: 'Outbox + idempotent consumer', direction: 'horizontal' }),
      ),
      section('example', 'Outbox and idempotency',
        code({
          title: 'Outbox relay + idempotent consumer (runnable simulation)',
          code: dedent(`
            const db = { orders: [], outbox: [] };
            function placeOrder(id) {
              // imagine BEGIN ... COMMIT around both inserts
              db.orders.push({ id, status: 'placed' });
              db.outbox.push({ msgId: 'm-' + id, type: 'OrderPlaced', orderId: id, sent: false });
            }

            const broker = [];
            function relay() {
              for (const m of db.outbox.filter((x) => !x.sent)) { broker.push(m); m.sent = true; }
            }

            const processed = new Set(); // in reality: table with UNIQUE(msg_id)
            let emails = 0;
            function handle(msg) {
              if (processed.has(msg.msgId)) return 'duplicate ignored';
              processed.add(msg.msgId);
              emails += 1;
              return 'email sent for ' + msg.orderId;
            }

            placeOrder('o1');
            relay();
            broker.push(broker[0]);            // at-least-once: the same message is redelivered
            for (const m of broker) console.log(handle(m));
            console.log('emails:', emails);
          `),
          expectedOutput: 'email sent for o1\nduplicate ignored\nemails: 1',
          explanation: [
            'Order and outbox row are written atomically — no lost events.',
            'Redelivery happens (crash before ack, relay retry, rebalancing).',
            'The consumer\'s processed-id check makes the side effect happen once.',
          ],
          runnable: true,
        }),
        code({
          title: 'Outbox in Postgres (node-postgres)',
          code: dedent(`
            async function placeOrder(pool, order) {
              const client = await pool.connect();
              try {
                await client.query('BEGIN');
                await client.query('INSERT INTO orders (id, customer_id, total_cents) VALUES ($1, $2, $3)',
                  [order.id, order.customerId, order.totalCents]);
                await client.query('INSERT INTO outbox (id, type, payload) VALUES (gen_random_uuid(), $1, $2)',
                  ['order.placed', JSON.stringify(order)]);
                await client.query('COMMIT');
              } catch (e) {
                await client.query('ROLLBACK');
                throw e;
              } finally {
                client.release();
              }
            }

            // relay (separate worker): FOR UPDATE SKIP LOCKED lets several relays run safely
            // SELECT * FROM outbox WHERE sent_at IS NULL ORDER BY created_at LIMIT 100 FOR UPDATE SKIP LOCKED;
          `),
          expectedOutput: 'BEGIN\nINSERT 0 1\nINSERT 0 1\nCOMMIT',
          explanation: [
            'Both rows commit or neither does.',
            '`SKIP LOCKED` lets multiple relay instances share the work without double-processing rows they have locked.',
            '`gen_random_uuid()` is built into Postgres 13+.',
          ],
        }),
        code({
          title: 'Idempotent consumer with a unique constraint',
          language: 'sql',
          code: dedent(`
            CREATE TABLE processed_messages (
              message_id uuid PRIMARY KEY,
              processed_at timestamptz NOT NULL DEFAULT now()
            );

            -- inside the consumer's transaction:
            INSERT INTO processed_messages (message_id) VALUES ($1) ON CONFLICT DO NOTHING RETURNING message_id;
            -- no row returned → already processed → ack and skip
          `),
          explanation: ['Recording the id and performing the DB side effect in one transaction makes processing effectively-once.'],
        }),
      ),
      section('real-world', 'In a real backend',
        bullets(
          'Commands like `GenerateInvoicePdf` go to a work queue consumed by a worker pool; events like `invoice.generated` fan out to many services.',
          'DLQ alerts page the owning team; messages are replayed after a fix.',
          'Message schemas are versioned; consumers ignore unknown fields.',
          'Poison messages (always failing) must not block a queue forever — cap retries.',
        ),
      ),
      section('mistakes', 'Common mistakes',
        code({
          title: 'Dual write',
          code: dedent(`
            // ❌ crash between these lines → order saved, event never published (or vice versa)
            await db.orders.insert(order);
            await broker.publish('order.placed', order);
            // ✅ outbox row in the same transaction; a relay publishes it
            await db.tx(async (t) => { await t.orders.insert(order); await t.outbox.insert(event); });
          `),
          explanation: ['Only one system (the DB) is written in the request; publishing becomes retryable.'],
        }),
        bullets(
          'Acking before processing → message lost on crash.',
          'Non-idempotent handlers ("send email" on every delivery).',
          'Infinite retries without backoff or DLQ.',
          'Using commands where many services should react (fan-out belongs to events).',
        ),
      ),
      section('interview', 'Interview angle',
        interviewTip('Expect "how do you avoid losing or duplicating messages?" — answer: outbox for publishing, at-least-once delivery, idempotent consumers with stored message ids, retries with backoff and a DLQ.'),
      ),
      section('practice', 'Practice',
        text('Implement an outbox table and a polling relay with BullMQ or RabbitMQ, kill the relay mid-batch, and prove the consumer still sends each email once.'),
      ),
      section('summary', 'Summary',
        bullets(
          'Commands → one handler; events → many subscribers.',
          'At-least-once delivery is the realistic default.',
          'Outbox solves dual writes on the producer side.',
          'Idempotent consumers solve duplicates on the consumer side.',
          'Retries with backoff + DLQ for failures.',
        ),
      ),
    ],
    revisionNotes: [
      'Command: imperative, one receiver, can fail. Event: past tense, many receivers.',
      'At-most-once / at-least-once / effectively-once (idempotency).',
      'Outbox: business row + outbox row in one transaction; relay publishes.',
      'Relay may republish → consumers dedupe by message id.',
      'Ack after processing; DLQ after N failures.',
      'FOR UPDATE SKIP LOCKED for concurrent relays.',
    ],
    quiz: [
      {
        kind: 'scenario', difficulty: 'advanced',
        prompt: 'Your service saves an order and then publishes `order.placed`. Occasionally orders exist without the event ever being published. Best fix?',
        options: [
          'Publish first, then save',
          'Wrap both calls in try/catch and log errors',
          'Use a transactional outbox: insert the event row in the same DB transaction and publish it from a relay',
          'Use a faster broker',
        ],
        answer: 2,
        explanation: 'Two separate systems cannot be updated atomically without coordination. Publishing first just reverses the inconsistency.',
      },
      {
        kind: 'mcq', difficulty: 'intermediate',
        prompt: 'With at-least-once delivery, what must consumers be?',
        options: ['Fast', 'Stateless', 'Idempotent', 'Single-threaded'],
        answer: 2,
        explanation: 'Messages can be delivered more than once, so processing the same message twice must have the same effect as once.',
      },
      {
        kind: 'predict-output', difficulty: 'intermediate',
        prompt: 'What does this print?',
        code: "const seen = new Set();\nlet n = 0;\nconst handle = (id) => { if (seen.has(id)) return; seen.add(id); n++; };\n['a', 'b', 'a', 'c', 'b'].forEach(handle);\nconsole.log(n);",
        options: ['5', '2', '3', '1'],
        answer: 2,
        explanation: 'Only unique ids a, b, c are processed → 3.',
      },
    ],
    interview: [
      {
        category: 'advanced', kind: 'concept', difficulty: 'advanced', topic: 'Messaging',
        question: 'What is the transactional outbox pattern and what problem does it solve?',
        shortAnswer: 'It solves the dual-write problem: the service writes business data and an outbox row in one database transaction, and a separate relay publishes outbox rows to the broker, so an event is published if and only if the transaction committed.',
        detailedAnswer: [
          'DB and broker cannot share one transaction (2PC is impractical).',
          'Outbox row committed atomically with the business change.',
          'Relay: polling with SKIP LOCKED, or CDC (Debezium reading the WAL).',
          'Relay may publish twice → consumers must be idempotent.',
          'Preserve order per aggregate by ordering rows and using the aggregate id as partition key.',
        ],
        followUp: 'What are the trade-offs between a polling relay and CDC?',
        trap: 'Proposing "publish, and if it fails, roll back the DB" — the publish can succeed and the commit fail.',
      },
      {
        category: 'advanced', kind: 'concept', difficulty: 'advanced', topic: 'Messaging',
        question: 'Explain at-most-once, at-least-once and exactly-once delivery. How do you get exactly-once effects in practice?',
        shortAnswer: 'At-most-once may lose messages, at-least-once may duplicate them, and true end-to-end exactly-once is not available for external side effects; you get effectively-once processing by combining at-least-once delivery with idempotent consumers.',
        detailedAnswer: [
          'At-most-once: ack before processing / no persistence.',
          'At-least-once: ack after processing; crashes cause redelivery.',
          'Kafka transactions give exactly-once within Kafka (read-process-write), not for emails or HTTP calls.',
          'Idempotency: dedupe table keyed by message id, natural idempotent operations (upserts), idempotency keys to downstream APIs.',
          'Store the dedupe record in the same transaction as the side effect.',
        ],
        followUp: 'How would you make sending an email idempotent?',
        trap: 'Claiming a broker setting makes your whole pipeline exactly-once.',
      },
    ],
  },

  'distributed-systems-fundamentals': {
    summary: 'Distributed systems must assume the network is unreliable: CAP/PACELC frame consistency-availability-latency trade-offs, and practical defences are timeouts, retries with exponential backoff and jitter, circuit breakers, idempotency keys and sagas instead of distributed transactions.',
    topics: ['CAP theorem', 'PACELC', 'consistency models', 'fallacies of distributed computing', 'timeouts', 'exponential backoff', 'jitter', 'circuit breaker', 'idempotency keys', 'sagas'],
    sections: [
      section('introduction', undefined,
        text('As soon as a request crosses a network — to a database, a cache or another service — it can be slow, fail, or succeed without you knowing. Distributed-systems fundamentals are the toolkit for building correct behaviour on top of that uncertainty.'),
      ),
      section('definition', 'CAP and PACELC',
        bullets(
          '**CAP**: during a network **P**artition, a system must choose between **C**onsistency (every read sees the latest write or errors) and **A**vailability (every request gets a non-error response, possibly stale).',
          'Partitions are not optional in real networks, so the real choice is CP vs AP *during a partition*.',
          '**PACELC**: if **P**artition → choose **A** or **C**; **E**lse (normal operation) → choose **L**atency or **C**onsistency. Example: synchronous replication = more consistency, more latency.',
        ),
        table('Consistency models (strongest → weakest)', ['Model', 'Guarantee', 'Example'], [
          ['Linearizable (strong)', 'Reads see the latest committed write, as if one copy', 'Single Postgres primary, etcd, ZooKeeper'],
          ['Sequential / causal', 'Everyone sees causally related writes in order', 'Some geo-distributed databases, collaborative apps'],
          ['Read-your-writes', 'A client always sees its own writes', 'Routing a user\'s reads to the primary after a write'],
          ['Eventual', 'Replicas converge if writes stop', 'DNS, read replicas, event-driven read models, Cassandra/DynamoDB defaults'],
        ]),
      ),
      section('why', 'The fallacies of distributed computing',
        bullets(
          'The network is reliable. · Latency is zero. · Bandwidth is infinite. · The network is secure.',
          'Topology doesn\'t change. · There is one administrator. · Transport cost is zero. · The network is homogeneous.',
          'Every one of these assumptions causes real outages; each defence below exists because one of them is false.',
        ),
      ),
      section('internals', 'Defensive toolkit',
        table('Patterns and what they solve', ['Pattern', 'Solves', 'Key detail'], [
          ['Timeouts', 'Waiting forever on a slow dependency', 'Every network call (`AbortSignal.timeout`), budget < caller\'s timeout'],
          ['Retries + exponential backoff + jitter', 'Transient failures', 'Retry only idempotent/safe operations; jitter avoids synchronized retry storms'],
          ['Circuit breaker', 'Hammering a failing dependency; cascading failure', 'CLOSED → OPEN after N failures → HALF_OPEN trial → CLOSED'],
          ['Bulkhead', 'One dependency exhausting all resources', 'Separate pools/concurrency limits per dependency'],
          ['Idempotency keys', 'Duplicate side effects from retries', 'Client sends a unique key; server stores the result per key'],
          ['Saga', 'Multi-service workflows without distributed transactions', 'Sequence of local transactions + compensating actions'],
          ['Rate limiting / load shedding', 'Overload', 'Reject early with 429/503 instead of collapsing'],
        ]),
        steps(
          '**Timeout ambiguity**: a timeout does not mean the operation failed — it may have succeeded. That is why idempotency matters.',
          '**Backoff**: wait `base × 2^attempt` (capped); **full jitter**: wait `random(0, that)`.',
          '**Saga orchestration**: a coordinator tells each service what to do and triggers compensations on failure. **Choreography**: services react to each other\'s events.',
          '**Two-phase commit (2PC)** exists but blocks on coordinator failure and couples services — rarely used across microservices.',
        ),
      ),
      section('visual', 'Saga with compensation',
        flow(['Reserve stock (Inventory)', 'Charge card (Payments) → fails', 'Compensate: release stock', 'Mark order failed'],
          { title: 'Orchestrated saga', direction: 'horizontal', caption: 'Each step is a local transaction; failures trigger compensations in reverse order.' }),
      ),
      section('example', 'Retries, circuit breaker, idempotency',
        code({
          title: 'Retry with exponential backoff and full jitter (runnable)',
          code: dedent(`
            async function retry(fn, { retries = 4, baseMs = 10, capMs = 100, random = Math.random } = {}) {
              for (let attempt = 0; ; attempt++) {
                try {
                  return await fn(attempt);
                } catch (e) {
                  if (attempt >= retries) throw e;
                  const exp = Math.min(capMs, baseMs * 2 ** attempt);
                  const delay = Math.round(random() * exp);          // full jitter
                  console.log('attempt ' + (attempt + 1) + ' failed, retry in ' + delay + 'ms');
                  await new Promise((r) => setTimeout(r, delay));
                }
              }
            }

            let calls = 0;
            const flaky = async () => {
              calls += 1;
              if (calls < 3) throw new Error('503');
              return 'ok after ' + calls + ' calls';
            };

            retry(flaky, { random: () => 0.5 }).then((r) => console.log(r)); // fixed random for a deterministic demo
          `),
          expectedOutput: 'attempt 1 failed, retry in 5ms\nattempt 2 failed, retry in 10ms\nok after 3 calls',
          explanation: [
            'Backoff ceiling doubles: 10 → 20 → 40 ms (capped at 100).',
            'Full jitter picks a random point below the ceiling (0.5 here) so many clients do not retry in lockstep.',
            'Only retry errors that are transient (timeouts, 503, connection resets), and only for idempotent operations.',
          ],
          runnable: true,
        }),
        code({
          title: 'Circuit breaker state machine (runnable)',
          code: dedent(`
            class CircuitBreaker {
              constructor(fn, { failureThreshold = 3, resetMs = 50 } = {}) {
                Object.assign(this, { fn, failureThreshold, resetMs, state: 'CLOSED', failures: 0, openedAt: 0 });
              }
              async call(...args) {
                if (this.state === 'OPEN') {
                  if (Date.now() - this.openedAt < this.resetMs) throw new Error('circuit open');
                  this.state = 'HALF_OPEN';                       // allow one trial call
                }
                try {
                  const result = await this.fn(...args);
                  this.state = 'CLOSED';
                  this.failures = 0;
                  return result;
                } catch (e) {
                  this.failures += 1;
                  if (this.state === 'HALF_OPEN' || this.failures >= this.failureThreshold) {
                    this.state = 'OPEN';
                    this.openedAt = Date.now();
                  }
                  throw e;
                }
              }
            }

            let healthy = false;
            const breaker = new CircuitBreaker(async () => {
              if (!healthy) throw new Error('timeout');
              return 'ok';
            }, { failureThreshold: 2, resetMs: 30 });

            (async () => {
              for (let i = 0; i < 3; i++) {
                try { await breaker.call(); } catch (e) { console.log(e.message, '-', breaker.state); }
              }
              healthy = true;
              await new Promise((r) => setTimeout(r, 40));
              console.log(await breaker.call(), '-', breaker.state);
            })();
          `),
          expectedOutput: 'timeout - CLOSED\ntimeout - OPEN\ncircuit open - OPEN\nok - CLOSED',
          explanation: [
            'After 2 failures the breaker opens and fails fast without calling the dependency.',
            'After `resetMs` it lets one trial through (HALF_OPEN); success closes it.',
            'Production libraries (third-party): opossum, cockatiel — with metrics, fallbacks and rolling windows.',
          ],
          runnable: true,
        }),
        code({
          title: 'Idempotency keys on a payment endpoint (runnable)',
          code: dedent(`
            const results = new Map(); // in production: Redis/DB with TTL, keyed per user + key
            let charges = 0;

            async function createCharge(req) {
              const key = req.headers['idempotency-key'];
              if (!key) return { status: 400, body: { error: 'Idempotency-Key required' } };
              if (results.has(key)) return results.get(key);       // replay stored response
              charges += 1;                                        // the real side effect
              const response = { status: 201, body: { chargeId: 'ch_' + charges, amount: req.body.amount } };
              results.set(key, response);
              return response;
            }

            (async () => {
              const req = { headers: { 'idempotency-key': 'k-123' }, body: { amount: 4500 } };
              const first = await createCharge(req);
              const retry = await createCharge(req);               // client retried after a timeout
              console.log(JSON.stringify(first.body), JSON.stringify(retry.body), 'charges=' + charges);
            })();
          `),
          expectedOutput: '{"chargeId":"ch_1","amount":4500} {"chargeId":"ch_1","amount":4500} charges=1',
          explanation: [
            'The retry returns the original response instead of charging again.',
            'Real implementations also lock the key while the first request is in progress and reject a reused key with a different body.',
          ],
          runnable: true,
        }),
      ),
      section('real-world', 'In a real backend',
        bullets(
          'Every outgoing HTTP call has a timeout, limited retries with jitter, and a breaker per dependency.',
          'Payment APIs (e.g. Stripe-style) accept an `Idempotency-Key` header; your own POST endpoints can too.',
          'Checkout saga: reserve stock → charge → confirm; on charge failure, release stock.',
          'Read replicas = eventual consistency: route read-after-write to the primary for that user.',
          'Retry budgets: cap retries to a percentage of traffic to avoid amplifying outages.',
        ),
      ),
      section('mistakes', 'Common mistakes',
        code({
          title: 'Retry storm',
          code: dedent(`
            // ❌ immediate, unlimited, synchronized retries at every layer
            while (true) { try { return await callPayments(); } catch {} }
            // ✅ bounded, backed off, jittered, at one layer, only for idempotent calls
            return retry(() => callPayments({ idempotencyKey }), { retries: 3, baseMs: 100, capMs: 2000 });
          `),
          explanation: ['Retrying at every layer multiplies load: 3 layers × 3 retries = 27 calls per user request.'],
        }),
        bullets(
          'No timeouts (Node `fetch` has no default request timeout).',
          'Retrying non-idempotent POSTs without idempotency keys.',
          'Using distributed transactions/2PC across microservices.',
          'Treating a timeout as a definite failure.',
          'Assuming clocks are synchronised across machines for ordering.',
        ),
      ),
      section('interview', 'Interview angle',
        interviewTip('Explain CAP correctly (choice only during partitions), then show the practical toolkit: timeouts → retries with backoff + jitter → circuit breaker → idempotency keys → sagas. Interviewers often probe "what if the timeout happened after the charge succeeded?"'),
      ),
      section('practice', 'Practice',
        text('Wrap a flaky HTTP dependency with: a 500 ms timeout, 3 retries with full jitter, and a circuit breaker. Simulate 50% failures and log how many calls reach the dependency with and without the breaker.'),
      ),
      section('summary', 'Summary',
        bullets(
          'Network calls fail, stall and are ambiguous.',
          'CAP: during partitions pick C or A; PACELC adds latency vs consistency.',
          'Timeouts everywhere; retries with exponential backoff + jitter.',
          'Circuit breakers stop cascading failures.',
          'Idempotency keys make retries safe; sagas replace distributed transactions.',
        ),
      ),
    ],
    revisionNotes: [
      'CAP: under partition, choose consistency or availability.',
      'PACELC: else, latency vs consistency.',
      'Consistency: linearizable > causal > read-your-writes > eventual.',
      'Backoff: min(cap, base·2^n); full jitter: random(0, that).',
      'Breaker: CLOSED → OPEN → HALF_OPEN → CLOSED.',
      'Timeout ≠ failure → idempotency keys.',
      'Saga = local transactions + compensations (orchestration or choreography).',
      '8 fallacies: reliable network, zero latency, infinite bandwidth, secure, fixed topology, one admin, zero transport cost, homogeneous.',
    ],
    quiz: [
      {
        kind: 'mcq', difficulty: 'advanced',
        prompt: 'Which statement about the CAP theorem is accurate?',
        options: [
          'You can pick any two of C, A and P at design time and ignore the third',
          'During a network partition, a system must choose between consistency and availability',
          'CAP says distributed databases cannot be consistent',
          'CAP is about CPU, availability and performance',
        ],
        answer: 1,
        explanation: 'Partitions happen regardless; CAP describes the forced choice while one is occurring. Outside partitions, PACELC describes the latency/consistency trade-off.',
      },
      {
        kind: 'complete-code', difficulty: 'intermediate',
        prompt: 'Complete the delay calculation for exponential backoff with full jitter.',
        code: "const ceiling = Math.min(capMs, baseMs * 2 ** attempt);\nconst delay = /* ??? */;",
        options: ['ceiling', 'Math.random() * ceiling', 'baseMs + attempt', 'ceiling * 2'],
        answer: 1,
        explanation: 'Full jitter picks a random delay between 0 and the exponential ceiling, spreading retries out. Using the ceiling alone keeps clients synchronised.',
      },
      {
        kind: 'scenario', difficulty: 'advanced',
        prompt: 'A client\'s POST /payments times out after 5 s and it retries. The first request actually succeeded. How should the API prevent a double charge?',
        options: [
          'Increase the timeout to 60 s',
          'Require an Idempotency-Key header and return the stored result for repeated keys',
          'Tell clients never to retry',
          'Use GET instead of POST',
        ],
        answer: 1,
        explanation: 'Timeouts are ambiguous; only idempotency makes retries safe. Longer timeouts reduce but never remove the ambiguity.',
      },
      {
        kind: 'predict-output', difficulty: 'intermediate',
        prompt: 'With baseMs = 100 and capMs = 1000, what are the backoff ceilings for attempts 0–4?',
        code: "const c = [0, 1, 2, 3, 4].map((a) => Math.min(1000, 100 * 2 ** a));\nconsole.log(c.join(' '));",
        options: ['100 200 300 400 500', '100 200 400 800 1000', '100 200 400 800 1600', '200 400 800 1600 3200'],
        answer: 1,
        explanation: 'Doubling from 100 gives 100, 200, 400, 800, then 1600 is capped to 1000.',
      },
    ],
    interview: [
      {
        category: 'advanced', kind: 'concept', difficulty: 'advanced', topic: 'Distributed systems',
        question: 'Explain the CAP theorem and PACELC. How do they influence the choice of a database for a service?',
        shortAnswer: 'CAP says that during a network partition you must choose consistency or availability; PACELC adds that even without partitions you trade latency against consistency. The choice depends on whether stale reads or unavailability is worse for that data.',
        detailedAnswer: [
          'Balances, inventory, uniqueness: prefer CP (reject writes rather than diverge).',
          'Feeds, counters, carts: AP with eventual consistency is often fine.',
          'Postgres primary: strongly consistent, unavailable for writes if the primary is unreachable.',
          'Dynamo-style stores: tunable consistency (quorums) trading latency.',
          'Synchronous replication raises consistency and latency (PACELC "EC").',
        ],
        followUp: 'What does read-your-writes consistency mean and how do you provide it with read replicas?',
        trap: 'Saying "pick two of three" as a static design choice, or claiming you can give up partition tolerance.',
      },
      {
        category: 'advanced', kind: 'concept', difficulty: 'advanced', topic: 'Distributed systems',
        question: 'How does a circuit breaker work and how does it differ from retries?',
        shortAnswer: 'Retries handle brief transient failures by trying again; a circuit breaker tracks failures and, past a threshold, opens to fail fast without calling the dependency, then half-opens to test recovery — protecting both the caller and the struggling service.',
        detailedAnswer: [
          'States: CLOSED (normal), OPEN (fail fast), HALF_OPEN (limited trial calls).',
          'Thresholds over rolling windows (error % or consecutive failures).',
          'Fallbacks while open: cached data, defaults, degraded features.',
          'Retries without a breaker amplify load on a failing service.',
          'Combine: timeout → retry (few, jittered) → breaker around the whole thing.',
        ],
        followUp: 'Where should the breaker live — per instance, per dependency, per endpoint?',
        trap: 'Treating a circuit breaker as just "a retry with a delay".',
      },
      {
        category: 'advanced', kind: 'scenario', difficulty: 'advanced', topic: 'Distributed systems',
        question: 'Design a checkout that reserves inventory, charges payment and creates a shipment across three services without a distributed transaction.',
        shortAnswer: 'Use a saga: each step is a local transaction in its service, driven by an orchestrator or by events; if a later step fails, run compensating actions (refund, release stock) in reverse, with idempotent steps, retries and an outbox for reliable messaging.',
        detailedAnswer: [
          'Orchestrator (e.g. checkout service or a workflow engine) tracks saga state.',
          'Steps: reserve stock → charge (idempotency key) → create shipment.',
          'Failure after charge → refund + release stock; failure after reserve → release stock.',
          'Compensations are business operations, not rollbacks (a refund, not "un-charge").',
          'Outbox + idempotent consumers for every message; timeouts on every step.',
          'Expose order status (pending/confirmed/failed) to clients — eventual consistency.',
        ],
        followUp: 'When would you choose choreography over orchestration for this saga?',
        trap: 'Proposing two-phase commit across the three services.',
      },
    ],
  },
};

export default content;
