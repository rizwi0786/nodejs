import type { ModuleContent } from '../../../types';
import { bullets, code, dedent, diagram, flow, interviewTip, section, steps, table, text, warn } from '../helpers';

const content: Partial<ModuleContent> = {
  'monolithic-architecture': {
    summary: 'A monolith deploys the whole application as one unit with one codebase and usually one database; a modular monolith keeps that simplicity while enforcing strong internal module boundaries — often the best starting architecture.',
    topics: ['monolith', 'modular monolith', 'module boundaries', 'single deployment', 'big ball of mud', 'strangler fig', 'shared database'],
    sections: [
      section('introduction', undefined,
        text('"Monolith" is often used as an insult, but most successful products started as one. The real problem is not one deployable — it is a monolith without internal boundaries.'),
      ),
      section('definition', 'Kinds of monolith',
        table('Monolith styles', ['Style', 'Description', 'Risk'], [
          ['Single-module monolith', 'One codebase, layers but no domain boundaries', 'Turns into a "big ball of mud"'],
          ['Modular monolith', 'One deployable split into modules (orders, billing, catalog) with explicit public APIs and owned tables', 'Needs discipline/tooling to keep boundaries'],
          ['Distributed monolith', 'Many services that must deploy together and share a DB', 'Costs of microservices + coupling of a monolith (worst of both)'],
        ]),
      ),
      section('why', 'Strengths and weaknesses',
        table('Monolith trade-offs', ['Strengths', 'Weaknesses'], [
          ['Simple to develop, run, debug locally', 'Whole app redeployed for any change'],
          ['In-process calls: fast, no network failures', 'Scaling is all-or-nothing (cannot scale one hot module alone)'],
          ['ACID transactions across features', 'Large teams step on each other without boundaries'],
          ['One pipeline, one set of dashboards', 'A memory leak or crash in one module takes everything down'],
          ['Easy refactoring across modules', 'Technology choices are shared'],
        ]),
      ),
      section('internals', 'Building a modular monolith',
        steps(
          'Organise by **domain module**: `src/modules/{orders,billing,catalog}`, each with its own layers.',
          'Each module exposes a **public API** (`index.js`); other modules may import only that.',
          'Each module **owns its tables**; no cross-module joins or writes — ask the owning module.',
          'Cross-module reactions via in-process domain events (EventEmitter/bus) to reduce coupling.',
          'Enforce boundaries with lint rules (dependency-cruiser, eslint-plugin-boundaries, Nx module boundaries).',
          'If a module later needs independent scaling or ownership, it can be extracted into a service along its existing boundary (strangler fig).',
        ),
      ),
      section('visual', 'Modular monolith',
        flow(['HTTP layer', 'orders module (public API)', 'catalog module (public API)', 'billing module (public API)', 'One DB, schema per module'],
          { title: 'One deployable, strong internal boundaries' }),
      ),
      section('example', 'Modules talking through public APIs',
        code({
          title: 'Modular monolith in miniature (runnable)',
          code: dedent(`
            // catalog module: owns products; exposes a small API
            function createCatalogModule() {
              const products = new Map([['p1', { id: 'p1', price: 25, stock: 3 }]]); // private
              return {
                getPrice: (id) => products.get(id).price,
                reserve(id, qty) {
                  const p = products.get(id);
                  if (p.stock < qty) throw new Error('out of stock');
                  p.stock -= qty;
                  return p.stock;
                },
              };
            }

            // orders module: depends on catalog's public API only
            function createOrdersModule({ catalog }) {
              const orders = [];
              return {
                place(productId, qty) {
                  const total = catalog.getPrice(productId) * qty;
                  const left = catalog.reserve(productId, qty);
                  orders.push({ productId, qty, total });
                  return { total, left };
                },
              };
            }

            const catalog = createCatalogModule();
            const orders = createOrdersModule({ catalog });
            console.log(JSON.stringify(orders.place('p1', 2)));
            try { orders.place('p1', 2); } catch (e) { console.log(e.message); }
          `),
          expectedOutput: '{"total":50,"left":1}\nout of stock',
          explanation: [
            'Orders never touches the `products` map directly — the catalog owns its data.',
            'The call is in-process: no network, no serialisation, no partial failure.',
            'If catalog becomes a service later, only the `catalog` dependency implementation changes.',
          ],
          runnable: true,
        }),
        code({
          title: 'Folder layout + boundary rule',
          language: 'text',
          code: dedent(`
            src/
              modules/
                orders/   index.js  (public)  internal/{service,repository}.js
                catalog/  index.js  (public)  internal/...
                billing/  index.js  (public)  internal/...
              shared/     (logger, config, errors — no business logic)
              main.js     (composition root)

            rule: modules/*/internal/** may only be imported from inside the same module
          `),
          explanation: ['Tooling turns the convention into a CI failure when someone imports another module\'s internals.'],
        }),
      ),
      section('real-world', 'In a real backend',
        bullets(
          'Start with a modular monolith; extract a service only for a clear reason (independent scaling, separate team, different tech/runtime needs).',
          'Run the same image in different roles (`ROLE=api`, `ROLE=worker`) to scale workloads separately without splitting the code.',
          'Use separate Postgres schemas per module to make ownership visible.',
        ),
      ),
      section('mistakes', 'Common mistakes',
        code({
          title: 'Cross-module table access',
          language: 'sql',
          code: dedent(`
            -- ❌ orders module queries billing's tables directly
            SELECT o.*, i.status FROM orders o JOIN billing.invoices i ON i.order_id = o.id;
            -- ✅ orders asks billing's public API: billing.getInvoiceStatus(orderId)
          `),
          explanation: ['Shared tables are the strongest coupling; they make later extraction very hard.'],
        }),
        bullets(
          'Splitting into microservices to "fix" a messy monolith — you get a distributed mess.',
          'Shared "utils" module that slowly accumulates business logic.',
          'No module ownership: everyone edits everything.',
        ),
      ),
      section('interview', 'Interview angle',
        interviewTip('Defend the modular monolith as a sensible default, list concrete triggers for extracting services, and name the "distributed monolith" anti-pattern.'),
      ),
      section('practice', 'Practice',
        text('Take an Express app organised by technical layers and reorganise it into three domain modules with public `index.js` APIs. Add a lint rule that forbids importing another module\'s `internal/` folder.'),
      ),
      section('summary', 'Summary',
        bullets(
          'Monolith = one deployable; simplest to build and operate.',
          'Modular monolith = strong internal boundaries + module-owned data.',
          'Scale workloads by role before splitting code.',
          'Extract services along existing module boundaries when justified.',
        ),
      ),
    ],
    revisionNotes: [
      'Monolith ≠ bad; unbounded monolith = big ball of mud.',
      'Modular monolith: public module APIs, module-owned tables, lint-enforced boundaries.',
      'Distributed monolith: lockstep deploys + shared DB across services.',
      'Strangler fig: extract incrementally behind a facade/router.',
      'In-process calls → ACID transactions, no network failures.',
    ],
    quiz: [
      {
        kind: 'mcq', difficulty: 'beginner',
        prompt: 'What characterises a modular monolith?',
        options: [
          'Many independently deployed services sharing one database',
          'One deployable application divided into modules with explicit public APIs and owned data',
          'A monolith with no folders',
          'A frontend-only application',
        ],
        answer: 1,
        explanation: 'It keeps single-deployment simplicity while enforcing internal boundaries. Option A describes a distributed monolith.',
      },
      {
        kind: 'scenario', difficulty: 'intermediate',
        prompt: 'A 6-developer team with one product wants to move to 12 microservices because the codebase is messy. What do you recommend first?',
        options: [
          'Split immediately into 12 services',
          'Introduce module boundaries inside the monolith (modular monolith), then extract only modules with a clear need',
          'Rewrite in another language',
          'Add more developers',
        ],
        answer: 1,
        explanation: 'Microservices do not fix poor boundaries — they make them more expensive. Fix boundaries in-process first.',
      },
    ],
    interview: [
      {
        category: 'advanced', kind: 'concept', difficulty: 'beginner', topic: 'Architecture',
        question: 'What are the advantages and disadvantages of a monolithic architecture?',
        shortAnswer: 'A monolith is simple to build, test, deploy and debug with fast in-process calls and ACID transactions, but it scales and deploys as one unit, couples teams, and one fault can take down everything.',
        detailedAnswer: [
          'Pros: one codebase/pipeline, easy local dev, transactions, refactoring.',
          'Cons: all-or-nothing scaling and deploys.',
          'Cons: risk of a big ball of mud without boundaries.',
          'Modular monolith mitigates coupling while keeping simplicity.',
        ],
        followUp: 'When would you start splitting a monolith?',
        trap: 'Claiming monoliths cannot scale — they can scale horizontally as whole units.',
      },
      {
        category: 'advanced', kind: 'scenario', difficulty: 'advanced', topic: 'Architecture',
        question: 'How would you migrate a large Node.js monolith to services without a big-bang rewrite?',
        shortAnswer: 'Use the strangler fig pattern: carve out module boundaries in the monolith first, put a routing layer in front, extract one well-bounded capability at a time with its own data, and route its traffic to the new service while the rest stays in the monolith.',
        detailedAnswer: [
          'Identify seams via domain analysis and coupling metrics.',
          'Modularise in-process; give the module its own tables.',
          'Introduce gateway/proxy routing by path.',
          'Extract: new service owns data; sync via events/CDC during transition.',
          'Shift traffic gradually (canary), keep rollback.',
          'Repeat only where there is a clear benefit.',
        ],
        followUp: 'How do you migrate data ownership for the extracted service without downtime?',
        trap: 'Extracting services that still read the monolith\'s tables directly.',
      },
    ],
  },

  'microservices': {
    summary: 'Microservices split a system into small, independently deployable services, each owning its data and communicating over the network synchronously (HTTP/gRPC) or asynchronously (messages); they buy team autonomy and independent scaling at the cost of distributed-systems complexity.',
    topics: ['microservices', 'bounded context', 'database per service', 'sync vs async communication', 'independent deployment', 'service discovery', 'when not to use'],
    sections: [
      section('introduction', undefined,
        text('When dozens of teams work on one product, a single deployable becomes a bottleneck. Microservices let each team own, deploy and scale its part independently — if the boundaries are right.'),
      ),
      section('definition', 'Key properties',
        bullets(
          '**Independently deployable**: a service can ship without coordinating with others.',
          '**Organised around business capabilities** (bounded contexts): orders, payments, catalog.',
          '**Owns its data**: database per service; others access it only through the service\'s API or events.',
          '**Owned by one team** ("you build it, you run it").',
          '**Smart endpoints, dumb pipes**: logic in services, not in the messaging layer.',
        ),
      ),
      section('why', 'Pros and cons',
        table('Microservices trade-offs', ['Benefit', 'Cost'], [
          ['Independent deploys per team', 'Network calls fail, are slow, and need timeouts/retries'],
          ['Scale hot services independently', 'No cross-service ACID transactions → sagas, eventual consistency'],
          ['Fault isolation (if designed for it)', 'Cascading failures if not (need circuit breakers, bulkheads)'],
          ['Technology freedom per service', 'Operational overhead: CI/CD, monitoring, on-call per service'],
          ['Smaller codebases, clearer ownership', 'Distributed tracing and debugging are harder'],
          ['', 'Data duplication and contract versioning'],
        ]),
        warn('When NOT to use: small team, early product with unclear domain boundaries, no CI/CD and observability maturity, or tight latency budgets across many hops. A modular monolith is usually better there.'),
      ),
      section('internals', 'Communication and data',
        table('Sync vs async', ['', 'Synchronous (HTTP/REST, gRPC)', 'Asynchronous (events/commands via broker)'], [
          ['Coupling', 'Temporal: caller needs callee up now', 'Decoupled in time'],
          ['Latency', 'Adds up along the call chain', 'Caller returns quickly; work happens later'],
          ['Failure mode', 'Cascading failures, need timeouts/circuit breakers', 'Messages queue up; consumers catch up'],
          ['Consistency', 'Immediate response', 'Eventual consistency'],
          ['Use for', 'Queries needing an answer now', 'State changes others react to, long workflows'],
        ]),
        steps(
          '**Database per service**: no shared tables. Other services keep local read models built from events.',
          '**Service discovery**: DNS (Kubernetes Services), service mesh or registry.',
          '**Contracts**: OpenAPI/protobuf schemas, versioned; consumer-driven contract tests.',
          '**Observability**: trace ids across all hops (OpenTelemetry).',
        ),
      ),
      section('visual', 'Microservice system',
        diagram('microservices', 'Gateway → services, each with its own database, connected by a message broker.'),
      ),
      section('example', 'Data ownership and eventual consistency',
        code({
          title: 'Read model updated by events (runnable simulation)',
          code: dedent(`
            const bus = {
              handlers: {},
              subscribe(topic, fn) { (this.handlers[topic] ??= []).push(fn); },
              publish(topic, msg) { for (const fn of this.handlers[topic] ?? []) queueMicrotask(() => fn(msg)); },
            };

            // customers service owns customer data
            const customersDb = new Map();
            function renameCustomer(id, name) {
              customersDb.set(id, { id, name });
              bus.publish('customer.renamed', { id, name });
            }

            // orders service keeps its own copy of what it needs
            const orderCustomerNames = new Map();
            bus.subscribe('customer.renamed', (e) => orderCustomerNames.set(e.id, e.name));

            renameCustomer('c1', 'Ada');
            console.log('orders view now:', orderCustomerNames.get('c1'));
            setTimeout(() => console.log('orders view later:', orderCustomerNames.get('c1')), 0);
          `),
          expectedOutput: 'orders view now: undefined\norders view later: Ada',
          explanation: [
            'The orders service never queries the customers database.',
            'Delivery is asynchronous, so for a moment the read model is stale — eventual consistency.',
            'In production the bus is Kafka/RabbitMQ/SNS+SQS and publishing uses an outbox (see message-driven architecture).',
          ],
          runnable: true,
        }),
        code({
          title: 'Synchronous call with a timeout',
          code: dedent(`
            async function getCustomer(id) {
              const res = await fetch('http://customers.internal/customers/' + id, {
                signal: AbortSignal.timeout(800),          // never wait forever on another service
                headers: { 'x-request-id': ctx.requestId }, // propagate correlation id
              });
              if (res.status === 404) return null;
              if (!res.ok) throw new Error('customers service ' + res.status);
              return res.json();
            }
          `),
          expectedOutput: '{"id":"c1","name":"Ada"}',
          explanation: [
            '`AbortSignal.timeout` (Node 17.3+) bounds latency.',
            'Unexpected statuses become errors the caller can handle (fallback, circuit breaker).',
            '`ctx.requestId` stands for the current request context (e.g. from AsyncLocalStorage).',
          ],
        }),
      ),
      section('real-world', 'In a real backend',
        bullets(
          'Each Node service has its own repo or monorepo package, Dockerfile, pipeline and dashboard.',
          'Shared libraries only for cross-cutting concerns (logging, tracing, auth verification), never shared domain models.',
          'Platform team provides templates so a new service starts with health checks, metrics and CI out of the box.',
        ),
      ),
      section('mistakes', 'Common mistakes',
        bullets(
          'Shared database between services — a distributed monolith.',
          'Chatty sync chains: A → B → C → D for every request, multiplying latency and failure probability.',
          'Services too small ("nanoservices") that always change together.',
          'No timeouts, retries without backoff, no idempotency.',
          'Lockstep releases because contracts are not versioned.',
        ),
        code({
          title: 'Reaching into another service\'s DB',
          code: dedent(`
            // ❌ orders service reads the payments database
            const paid = await paymentsDb.query('SELECT status FROM payments WHERE order_id = $1', [id]);
            // ✅ ask the owner, or consume its events into a local read model
            const paid = await paymentsClient.getStatus(id); // or: localPaymentStatus.get(id)
          `),
          explanation: ['Direct DB access couples schemas and deployments across teams.'],
        }),
      ),
      section('interview', 'Interview angle',
        interviewTip('Give balanced pros/cons, say when you would *not* use microservices, and explain database-per-service plus sync vs async communication with failure handling.'),
      ),
      section('practice', 'Practice',
        text('Split an e-commerce domain into services (catalog, orders, payments, notifications). For each, list the data it owns, the events it publishes and the synchronous APIs it exposes.'),
      ),
      section('summary', 'Summary',
        bullets(
          'Independently deployable services around business capabilities.',
          'Each service owns its data.',
          'Sync for queries; async events for state changes.',
          'Pay for it with network failures, eventual consistency and ops overhead.',
          'Not a default — earn it.',
        ),
      ),
    ],
    revisionNotes: [
      'Database per service; no shared tables.',
      'Sync = temporal coupling; async = eventual consistency.',
      'Timeouts, retries with backoff, circuit breakers, idempotency are mandatory.',
      'Distributed monolith = shared DB / lockstep deploys.',
      'Avoid for small teams, unclear domains, immature ops.',
      'Trace ids across services (OpenTelemetry).',
    ],
    quiz: [
      {
        kind: 'predict-output', difficulty: 'intermediate',
        prompt: 'What does this print?',
        code: "const view = new Map();\nconst publish = (m) => queueMicrotask(() => view.set(m.id, m.name));\npublish({ id: 1, name: 'Ada' });\nconsole.log(view.get(1));\nsetTimeout(() => console.log(view.get(1)), 0);",
        options: ['Ada then Ada', 'undefined then Ada', 'undefined then undefined', 'Ada then undefined'],
        answer: 1,
        explanation: 'The update is queued, so the synchronous read sees nothing; after the microtask runs, the timer sees Ada.',
      },
      {
        kind: 'mcq', difficulty: 'intermediate',
        prompt: 'Which situation is the strongest signal that microservices are NOT a good fit yet?',
        options: [
          'Many teams need to deploy independently',
          'One hot component needs 20× the capacity of the rest',
          'A small team building a new product with unclear domain boundaries',
          'Parts of the system need different runtimes',
        ],
        answer: 2,
        explanation: 'Unclear boundaries plus a small team means you pay the distributed-systems cost without the autonomy benefits.',
      },
      {
        kind: 'find-bug', difficulty: 'advanced',
        prompt: 'What is the architectural problem?',
        code: "// shipping-service\nconst order = await ordersDb.query('SELECT * FROM orders WHERE id = $1', [id]);\nawait ordersDb.query('UPDATE orders SET status = $1 WHERE id = $2', ['shipped', id]);",
        options: [
          'Missing await',
          'The shipping service reads and writes the orders service\'s database, breaking data ownership and creating a distributed monolith',
          'SQL injection',
          'UPDATE must come before SELECT',
        ],
        answer: 1,
        explanation: 'Only the orders service should change orders. Shipping should call its API or publish an event (e.g. shipment.dispatched).',
      },
    ],
    interview: [
      {
        category: 'advanced', kind: 'concept', difficulty: 'intermediate', topic: 'Microservices',
        question: 'What are the main benefits and costs of a microservices architecture?',
        shortAnswer: 'Benefits are independent deployment, team autonomy, independent scaling and fault isolation; costs are network unreliability, eventual consistency without cross-service transactions, and much higher operational and debugging complexity.',
        detailedAnswer: [
          'Autonomy: teams own services end to end.',
          'Scaling: only hot services get more replicas.',
          'Costs: timeouts, retries, partial failures.',
          'Sagas instead of ACID transactions.',
          'Per-service pipelines, dashboards, on-call; distributed tracing required.',
        ],
        followUp: 'What organisational conditions make microservices succeed?',
        trap: 'Listing only benefits, or claiming microservices are inherently faster.',
      },
      {
        category: 'advanced', kind: 'concept', difficulty: 'advanced', topic: 'Microservices',
        question: 'Why should each microservice own its database, and how do other services get the data they need?',
        shortAnswer: 'Owning its data lets a service change its schema and deploy independently; others get data through its API for real-time queries or by consuming its events into their own local read models.',
        detailedAnswer: [
          'Shared tables couple schemas, deployments and teams.',
          'API calls: simple, but add runtime coupling and latency.',
          'Event-carried state transfer: local copies, resilient to owner outages, eventually consistent.',
          'CDC (e.g. Debezium) can publish changes from legacy databases.',
          'Reporting: stream data into a warehouse rather than cross-service joins.',
        ],
        followUp: 'How do you handle a query that needs data joined from three services?',
        trap: 'Allowing "read-only" access to another service\'s database as harmless.',
      },
      {
        category: 'advanced', kind: 'scenario', difficulty: 'advanced', topic: 'Microservices',
        question: 'A request fans out synchronously through five services and p99 latency and error rates are poor. How do you improve it?',
        shortAnswer: 'Reduce synchronous depth: parallelise independent calls, cache or replicate data locally via events, move non-essential work to async messages, and add timeouts, retries with jittered backoff and circuit breakers to contain failures.',
        detailedAnswer: [
          'Availability multiplies: five 99.9% services in series ≈ 99.5%.',
          'Tail latency compounds along the chain.',
          'Use `Promise.all` for independent calls; aggregate at a BFF.',
          'Local read models from events remove runtime dependencies.',
          'Async for side effects (emails, analytics).',
          'Reconsider boundaries if services always change and call together.',
        ],
        followUp: 'How would you decide which calls can become asynchronous?',
        trap: 'Only adding retries, which increases load and latency during incidents.',
      },
    ],
  },

  'api-gateway': {
    summary: 'An API gateway is the single entry point in front of backend services that handles routing, authentication, rate limiting, TLS, request aggregation and protocol translation; the Backend-for-Frontend (BFF) variant gives each client type its own tailored gateway.',
    topics: ['API gateway', 'routing', 'authentication at the edge', 'rate limiting', 'aggregation', 'BFF', 'cross-cutting concerns', 'single point of failure'],
    sections: [
      section('introduction', undefined,
        text('Without a gateway, every client must know every service\'s address and every service must re-implement auth, rate limiting and CORS. A gateway centralises those edge concerns.'),
      ),
      section('definition', 'Responsibilities',
        table('What a gateway does', ['Concern', 'Example'], [
          ['Routing', '`/orders/*` → orders service, `/users/*` → users service'],
          ['Authentication', 'Verify JWT/session once; forward identity headers (`x-user-id`) to services'],
          ['Rate limiting / quotas', 'Per API key or user, often backed by Redis'],
          ['Aggregation / composition', '`GET /me/dashboard` combines users + orders + recommendations'],
          ['Protocol translation', 'REST/JSON outside, gRPC inside; WebSocket termination'],
          ['Cross-cutting', 'TLS, CORS, request ids, logging, caching, request size limits'],
        ]),
        bullets(
          'Products (third-party/managed): Kong, Tyk, KrakenD, Envoy-based gateways, AWS API Gateway, Azure API Management, Google API Gateway/Apigee; or a custom Node gateway (Express/Fastify + http-proxy).',
        ),
      ),
      section('why', 'Gateway vs BFF',
        table('Single gateway vs Backend-for-Frontend', ['', 'General API gateway', 'BFF'], [
          ['Clients served', 'All', 'One client type (web, iOS, partner API)'],
          ['Shapes responses for', 'Generic', 'That client\'s screens'],
          ['Owned by', 'Platform team', 'The frontend/client team'],
          ['Risk', 'Bloats with client-specific logic', 'Duplication across BFFs'],
        ]),
      ),
      section('internals', 'Request path',
        steps(
          'Client calls `https://api.example.com/orders/42` with a bearer token.',
          'Gateway terminates TLS, assigns a request id, checks CORS.',
          'Authenticates the token (signature, expiry) and applies rate limits.',
          'Matches a route and proxies to the orders service (with timeout and retry policy).',
          'Optionally aggregates several backend calls in parallel and shapes the response.',
          'Returns the response, logging latency and status.',
        ),
        warn('Keep business logic out of the gateway. It should route and enforce edge policies; domain rules belong in services. Also run it redundantly — it is on every request path.'),
      ),
      section('visual', 'Gateway in front of services',
        diagram('microservices', 'Clients → gateway (auth, rate limit, routing) → services.'),
      ),
      section('example', 'A miniature gateway',
        code({
          title: 'Auth, rate limit, routing and aggregation (runnable simulation)',
          code: dedent(`
            const services = {
              users: async () => ({ id: 7, name: 'Ada' }),
              orders: async () => [{ id: 1, total: 30 }, { id: 2, total: 12 }],
            };
            const routes = [{ prefix: '/users', service: 'users' }, { prefix: '/orders', service: 'orders' }];
            const hits = new Map();

            async function gateway(req) {
              if (req.headers.authorization !== 'Bearer good') return { status: 401 };   // auth
              const n = (hits.get(req.ip) ?? 0) + 1;                                   // rate limit
              hits.set(req.ip, n);
              if (n > 3) return { status: 429 };

              if (req.path === '/me/dashboard') {                                      // aggregation
                const [user, orders] = await Promise.all([services.users(), services.orders()]);
                return { status: 200, body: { name: user.name, orderCount: orders.length } };
              }
              const route = routes.find((r) => req.path.startsWith(r.prefix));         // routing
              if (!route) return { status: 404 };
              return { status: 200, body: await services[route.service](req.path) };
            }

            (async () => {
              const req = (path, auth = 'Bearer good') => ({ path, ip: '1.2.3.4', headers: { authorization: auth } });
              console.log((await gateway(req('/users/7', 'Bearer bad'))).status);
              console.log(JSON.stringify(await gateway(req('/me/dashboard'))));
              console.log((await gateway(req('/nope'))).status);
              await gateway(req('/users/7'));
              console.log((await gateway(req('/users/7'))).status);
            })();
          `),
          expectedOutput: '401\n{"status":200,"body":{"name":"Ada","orderCount":2}}\n404\n429',
          explanation: [
            'Unauthenticated requests are rejected before counting toward the limit.',
            'The dashboard call fans out in parallel and returns a client-shaped response.',
            'The 4th authenticated request from the same IP is throttled (429).',
          ],
          runnable: true,
        }),
        code({
          title: 'Proxying with Express + http-proxy-middleware (third-party)',
          code: dedent(`
            const express = require('express');
            const { createProxyMiddleware } = require('http-proxy-middleware');

            const app = express();
            app.use(requestId, verifyJwt, rateLimit({ windowMs: 60_000, limit: 100 }));

            app.use('/orders', createProxyMiddleware({ target: 'http://orders:3000', changeOrigin: true, proxyTimeout: 2000 }));
            app.use('/users', createProxyMiddleware({ target: 'http://users:3000', changeOrigin: true, proxyTimeout: 2000 }));

            app.listen(8080);
          `),
          expectedOutput: '$ curl -s -H "Authorization: Bearer $TOKEN" localhost:8080/orders/42\n{"id":42,"status":"paid"}',
          explanation: [
            'Edge middleware runs once for every route.',
            '`proxyTimeout` prevents the gateway from hanging on a slow service.',
            'Express mounting strips `/orders` from the forwarded path unless you rewrite it — check the library\'s path options.',
          ],
        }),
      ),
      section('real-world', 'In a real backend',
        bullets(
          'Web BFF aggregates five services for the home page; mobile BFF returns smaller payloads.',
          'Gateway validates JWTs; services still authorise (zero trust) using forwarded claims or by re-verifying.',
          'Kubernetes: an Ingress or Gateway API implementation (Envoy, Nginx) does routing; a dedicated gateway adds API keys and quotas.',
        ),
      ),
      section('mistakes', 'Common mistakes',
        bullets(
          'Business logic accumulating in the gateway ("just one more rule").',
          'Single gateway instance — a single point of failure.',
          'Services trusting any `x-user-id` header even from internal callers that bypass the gateway.',
          'Sequential aggregation calls instead of parallel.',
        ),
        code({
          title: 'Sequential vs parallel aggregation',
          code: dedent(`
            // ❌ latency = sum of calls
            const user = await users.get(id);
            const orders = await orders.list(id);
            // ✅ latency ≈ slowest call
            const [user, orders] = await Promise.all([users.get(id), orders.list(id)]);
          `),
          explanation: ['Independent backend calls should run concurrently; consider `Promise.allSettled` for optional parts.'],
        }),
      ),
      section('interview', 'Interview angle',
        interviewTip('List gateway responsibilities, warn against business logic in it, and explain the BFF variant and why services should still authorise.'),
      ),
      section('practice', 'Practice',
        text('Build a small Express gateway that verifies a JWT, adds `x-request-id`, rate-limits by user id with an in-memory store, and proxies `/users` and `/orders` to two stub services.'),
      ),
      section('summary', 'Summary',
        bullets(
          'Single entry point: routing, auth, rate limits, TLS, aggregation.',
          'BFF = one gateway per client type.',
          'No business logic at the edge.',
          'Run redundantly; set timeouts to backends.',
          'Services still authorise requests.',
        ),
      ),
    ],
    revisionNotes: [
      'Gateway concerns: routing, authN, rate limiting, aggregation, protocol translation, TLS, CORS.',
      'BFF: per-client gateway owned by the client team.',
      'Keep domain logic in services.',
      'Gateway must be highly available and have backend timeouts.',
      'Zero trust: services verify identity/authorisation too.',
    ],
    quiz: [
      {
        kind: 'mcq', difficulty: 'intermediate',
        prompt: 'Which responsibility does NOT belong in an API gateway?',
        options: ['JWT validation', 'Rate limiting per API key', 'Calculating order discounts based on loyalty tier', 'Routing /orders to the orders service'],
        answer: 2,
        explanation: 'Discount rules are domain logic and belong in a service. The others are edge concerns.',
      },
      {
        kind: 'scenario', difficulty: 'intermediate',
        prompt: 'The mobile app needs a compact home-screen payload combining 4 services, while the web app needs a richer one. What pattern fits?',
        options: [
          'Make every service return both formats',
          'Backend-for-Frontend: a mobile BFF and a web BFF, each aggregating and shaping responses',
          'Let the mobile app call all 4 services directly',
          'One generic gateway endpoint with a ?format= flag for every screen',
        ],
        answer: 1,
        explanation: 'BFFs let each client team tailor aggregation without bloating a shared gateway or the services.',
      },
    ],
    interview: [
      {
        category: 'advanced', kind: 'concept', difficulty: 'intermediate', topic: 'Microservices',
        question: 'What is an API gateway and what problems does it solve in a microservices system?',
        shortAnswer: 'It is a single entry point that routes requests to services and centralises cross-cutting edge concerns such as authentication, rate limiting, TLS, CORS, logging and response aggregation.',
        detailedAnswer: [
          'Clients see one host; internal topology can change freely.',
          'Auth and quotas implemented once.',
          'Aggregation reduces client round trips.',
          'Protocol translation (REST ↔ gRPC).',
          'Must be highly available and free of domain logic.',
        ],
        followUp: 'How does a BFF differ from a general gateway?',
        trap: 'Treating the gateway as the place to implement business workflows.',
      },
      {
        category: 'advanced', kind: 'scenario', difficulty: 'advanced', topic: 'Microservices',
        question: 'The gateway validates JWTs and forwards an x-user-id header. Is it safe for services to trust that header? How would you harden this?',
        shortAnswer: 'Only if nothing can reach the services except the gateway; otherwise an attacker or misbehaving internal caller can forge it. Harden with network policies or mTLS so only the gateway can call, forward a signed token instead of a bare header, and keep authorisation checks in services.',
        detailedAnswer: [
          'Strip incoming identity headers at the gateway before setting them.',
          'Network isolation: services not publicly reachable; mTLS via service mesh.',
          'Forward the original JWT or a short-lived internal token that services verify.',
          'Services enforce resource-level authorisation (ownership checks).',
          'Audit logs include the verified subject.',
        ],
        followUp: 'How would you propagate end-user identity through asynchronous messages?',
        trap: 'Assuming "internal network" means trusted.',
      },
    ],
  },
};

export default content;
