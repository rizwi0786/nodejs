import type { ModuleContent } from '../../../types';
import {
  bullets, code, dedent, diagram, flow, interviewTip, section, steps, table, text,
} from '../helpers';

const content: Partial<ModuleContent> = {
  // ───────────────────────────────────────────────────────────
  controllers: {
    summary: 'A controller is the HTTP adapter of a feature: it reads input from `req`, calls a service, and maps the result to a status code and response body — nothing more.',
    topics: ['controller', 'thin controllers', 'HTTP layer', 'separation of concerns', 'MVC', 'dependency injection'],
    sections: [
      section('introduction', undefined,
        text('When route files contain SQL, password hashing and email sending, they become impossible to test or reuse. Controllers pull the HTTP handling into one small, predictable layer.'),
      ),
      section('definition', 'Definition',
        bullets(
          'A **controller** is a set of handler functions `(req, res)` for one resource (users, orders).',
          'Its job: **extract** input → **call** a service → **translate** the result into HTTP.',
          'It knows about HTTP (status codes, headers, cookies); it does **not** know about SQL or business rules.',
        ),
        table('Who does what', ['Layer', 'Knows HTTP?', 'Knows DB?', 'Example'], [
          ['Route', 'Paths + middleware', 'No', '`router.post("/", validate(schema), ctrl.create)`'],
          ['Controller', 'Yes', 'No', '`res.status(201).json(await svc.create(req.body))`'],
          ['Service', 'No', 'Via repository', '`if (await repo.emailTaken(email)) throw new ConflictError()`'],
          ['Repository', 'No', 'Yes', '`db.query("INSERT ...")`'],
        ]),
      ),
      section('why', 'Why thin controllers',
        bullets(
          'Business logic can be reused by a CLI, a queue worker or a GraphQL resolver.',
          'Services are unit-testable without fake `req`/`res`.',
          'Controllers become boring and uniform — easy to review.',
        ),
      ),
      section('visual', 'Where controllers sit',
        diagram('layered-architecture', 'Route → controller → service → repository → database.'),
      ),
      section('example', 'A users controller',
        code({
          title: 'users/users.controller.js',
          code: dedent(`
            function createUsersController(usersService) {
              return {
                async list(req, res) {
                  const users = await usersService.list({ page: res.locals.query.page });
                  res.json({ data: users });
                },
                async getById(req, res) {
                  const user = await usersService.getById(Number(req.params.id));
                  res.json({ data: user });               // NotFoundError thrown by service → 404 in error handler
                },
                async create(req, res) {
                  const user = await usersService.register(req.body);
                  res.status(201).location('/users/' + user.id).json({ data: user });
                },
                async remove(req, res) {
                  await usersService.remove(Number(req.params.id), req.user);
                  res.sendStatus(204);
                },
              };
            }

            module.exports = { createUsersController };
          `),
          explanation: [
            'Each method is 1–3 lines: read input, call service, respond.',
            'No try/catch — Express 5 forwards rejections to the central error handler.',
            'The service is injected, so tests can pass a fake.',
          ],
        }),
        code({
          title: 'users/users.routes.js',
          code: dedent(`
            const express = require('express');

            function createUsersRouter(controller, { requireAuth, validate, schemas }) {
              const router = express.Router();
              router.get('/', validate({ query: schemas.listQuery }), controller.list);
              router.get('/:id', validate({ params: schemas.idParam }), controller.getById);
              router.post('/', validate({ body: schemas.createUser }), controller.create);
              router.delete('/:id', requireAuth, controller.remove);
              return router;
            }

            module.exports = { createUsersRouter };
          `),
        }),
        code({
          title: 'Responses',
          language: 'http',
          code: 'POST /users HTTP/1.1\nContent-Type: application/json\n\n{"email":"ada@example.com","name":"Ada"}\n\nGET /users/999 HTTP/1.1',
          expectedOutput: 'HTTP/1.1 201 Created\nLocation: /users/7\n\n{"data":{"id":7,"email":"ada@example.com","name":"Ada"}}\n\nHTTP/1.1 404 Not Found\n\n{"error":{"code":"NOT_FOUND","message":"User 999 not found"}}',
        }),
      ),
      section('real-world', 'Real-world notes',
        bullets(
          'Controllers often map service DTOs to response shapes (hide `passwordHash`).',
          'Cookies, redirects and headers are controller concerns — e.g. login controller sets the refresh cookie.',
          'Frameworks like NestJS formalise this with `@Controller` classes; in Express it is a convention.',
        ),
      ),
      section('mistakes', 'Common mistakes',
        code({
          title: 'Wrong vs right: fat controller',
          code: dedent(`
            // ✗ controller does validation, SQL, hashing and email
            async function register(req, res) {
              if (!req.body.email.includes('@')) return res.status(400).send('bad email');
              const exists = await db.query('SELECT 1 FROM users WHERE email = $1', [req.body.email]);
              const hash = await bcrypt.hash(req.body.password, 12);
              await db.query('INSERT INTO users ...', [req.body.email, hash]);
              await mailer.send(req.body.email, 'Welcome');
              res.status(201).json({ ok: true });
            }

            // ✓ thin controller
            async function register(req, res) {
              const user = await usersService.register(req.body);
              res.status(201).json({ data: user });
            }
          `),
        }),
        bullets(
          'Passing `req` or `res` into services — couples business logic to HTTP.',
          'Catching every error in the controller and responding ad hoc — inconsistent error shapes.',
        ),
      ),
      section('interview', 'Interview angle',
        interviewTip('Say "controllers translate between HTTP and the domain". Mention testability and reuse from non-HTTP entry points as the reason.'),
      ),
      section('practice', 'Practice',
        text('Refactor a route that queries the DB directly into route → controller → service → repository. Write a unit test for the service with an in-memory fake repository.'),
      ),
      section('summary', 'Summary',
        bullets(
          'Controller = HTTP in, HTTP out.',
          'Keep business rules and SQL out.',
          'Inject services; let errors bubble to the central handler.',
        ),
      ),
    ],
    revisionNotes: [
      'Controller: extract input → call service → map to status/body.',
      'Controllers know HTTP; services do not; repositories know the DB.',
      'No try/catch needed in Express 5 controllers — errors bubble to the error handler.',
      'Hide internal fields (password hashes) when shaping responses.',
    ],
    quiz: [
      {
        kind: 'mcq', difficulty: 'beginner',
        prompt: 'Which responsibility belongs in a controller?',
        options: ['Writing SQL queries', 'Choosing the HTTP status code for a successful create', 'Hashing the password', 'Deciding whether an email is already taken'],
        answer: 1,
        explanation: 'Status codes are HTTP concerns. SQL belongs in repositories; hashing and uniqueness rules belong in services.',
      },
      {
        kind: 'scenario', difficulty: 'intermediate',
        prompt: 'You need the same "register user" logic from an HTTP endpoint and a CSV import worker. What design helps most?',
        options: [
          'Call the Express route from the worker with fetch',
          'Put the logic in a service that takes plain data; both the controller and the worker call it',
          'Copy the controller code into the worker',
          'Pass a fake `req` object into the controller',
        ],
        answer: 1,
        explanation: 'Services without HTTP dependencies are reusable. Faking `req` or calling your own API adds coupling and overhead.',
      },
    ],
    interview: [
      {
        category: 'express-backend', kind: 'concept', difficulty: 'intermediate', topic: 'Layered architecture',
        question: 'What should and should not go into an Express controller?',
        shortAnswer: 'A controller should only translate HTTP to a service call and the result back to HTTP (status, headers, body); validation rules belong in middleware/schemas, business logic in services and data access in repositories.',
        detailedAnswer: [
          'Should: read params/query/body, call one service method, choose status, set cookies/headers, shape the response.',
          'Should not: SQL, transactions, hashing, sending emails, authorization rules on domain data.',
          'Errors are thrown as typed errors and mapped centrally.',
          'Benefit: services are reusable from workers/CLIs and testable without HTTP.',
        ],
        followUp: 'Where would you put the check "only the owner can delete this post"?',
        trap: 'Saying controllers should catch every error and format responses individually.',
      },
    ],
  },

  // ───────────────────────────────────────────────────────────
  services: {
    summary: 'Services hold business logic: they take plain inputs, enforce rules, coordinate repositories and external APIs, and throw domain errors — with no knowledge of Express.',
    topics: ['service layer', 'business logic', 'domain errors', 'dependency injection', 'transactions', 'testability'],
    sections: [
      section('introduction', undefined,
        text('Rules like "an email can only register once" or "orders over $10k need approval" are the heart of your app. Services keep them in one place, independent of HTTP.'),
      ),
      section('definition', 'Definition',
        bullets(
          'A **service** is a module/class with methods named after use cases: `register`, `placeOrder`, `cancelSubscription`.',
          'Inputs and outputs are plain objects — no `req`, no `res`.',
          'Failures are signalled by throwing domain errors (`ConflictError`, `NotFoundError`).',
          'Dependencies (repositories, mailer, clock) are injected.',
        ),
      ),
      section('why', 'Why a service layer',
        table('Logic in controller vs service', ['', 'In controller', 'In service'], [
          ['Unit test', 'Needs fake req/res', 'Call a function'],
          ['Reuse from worker/CLI', 'Hard', 'Easy'],
          ['Transactions across repos', 'Mixed with HTTP code', 'One method owns it'],
          ['Swap DB/mailer', 'Touch every route', 'Swap injected dependency'],
        ]),
      ),
      section('internals', 'Typical service method flow',
        flow(['Validate business rules', 'Load data via repositories', 'Apply domain logic', 'Persist (inside a transaction if multi-step)', 'Emit side effects (email, events)', 'Return a plain DTO'], { direction: 'vertical' }),
      ),
      section('example', 'A users service with injected dependencies',
        code({
          title: 'users/users.service.js',
          code: dedent(`
            const { ConflictError, NotFoundError } = require('../errors');

            function createUsersService({ usersRepo, hasher, mailer }) {
              return {
                async register({ email, name, password }) {
                  const normalized = email.trim().toLowerCase();
                  if (await usersRepo.findByEmail(normalized)) {
                    throw new ConflictError('Email already registered');
                  }
                  const passwordHash = await hasher.hash(password);
                  const user = await usersRepo.insert({ email: normalized, name, passwordHash });
                  await mailer.sendWelcome(user.email);
                  return { id: user.id, email: user.email, name: user.name };
                },

                async getById(id) {
                  const user = await usersRepo.findById(id);
                  if (!user) throw new NotFoundError('User ' + id + ' not found');
                  return { id: user.id, email: user.email, name: user.name };
                },
              };
            }

            module.exports = { createUsersService };
          `),
          explanation: [
            'No Express import anywhere — this runs in tests, workers and scripts.',
            'Returns a DTO without `passwordHash`.',
            'Errors carry meaning; the HTTP layer maps them to 409/404.',
          ],
        }),
        code({
          title: 'Pure-JS unit test with fakes',
          runnable: true,
          code: dedent(`
            class ConflictError extends Error { constructor(m) { super(m); this.name = 'ConflictError'; } }

            function createUsersService({ usersRepo, hasher }) {
              return {
                async register({ email, password }) {
                  const e = email.trim().toLowerCase();
                  if (await usersRepo.findByEmail(e)) throw new ConflictError('Email already registered');
                  const user = await usersRepo.insert({ email: e, passwordHash: await hasher.hash(password) });
                  return { id: user.id, email: user.email };
                },
              };
            }

            const rows = [];
            const usersRepo = {
              findByEmail: async (e) => rows.find((r) => r.email === e),
              insert: async (u) => { const row = { id: rows.length + 1, ...u }; rows.push(row); return row; },
            };
            const hasher = { hash: async (p) => 'hashed:' + p };
            const svc = createUsersService({ usersRepo, hasher });

            (async () => {
              console.log(await svc.register({ email: ' Ada@Example.com ', password: 'pw' }));
              try {
                await svc.register({ email: 'ada@example.com', password: 'x' });
              } catch (e) {
                console.log(e.name + ': ' + e.message);
              }
              console.log(rows.length, rows[0].passwordHash);
            })();
          `),
          expectedOutput: "{ id: 1, email: 'ada@example.com' }\nConflictError: Email already registered\n1 hashed:pw",
          explanation: [
            'In-memory fakes replace the DB and bcrypt — tests run in milliseconds.',
            'Email normalisation means the second registration conflicts.',
            'Only one row was inserted.',
          ],
        }),
      ),
      section('real-world', 'Real-world concerns',
        bullets(
          'Transactions: the service starts one when a use case touches several tables (`order` + `inventory`).',
          'Side effects after commit: send emails / publish events only once the transaction succeeds (or use an outbox table).',
          'Authorization on domain data ("is this user the owner?") often lives in services, because it needs the data.',
        ),
      ),
      section('mistakes', 'Common mistakes',
        code({
          title: 'Wrong vs right: HTTP leaking into services',
          code: dedent(`
            // ✗ service depends on Express
            async function getUser(req, res) {
              const user = await repo.findById(req.params.id);
              if (!user) return res.status(404).end();
              return user;
            }

            // ✓ plain inputs, domain errors
            async function getUser(id) {
              const user = await repo.findById(id);
              if (!user) throw new NotFoundError('User not found');
              return user;
            }
          `),
        }),
        bullets(
          'Services that `require` a global DB singleton — hard to test; inject instead.',
          'Sending an email before the DB transaction commits — the user gets an email for a rolled-back signup.',
          '"Anemic" services that are just pass-throughs to repositories — fine for CRUD, but do not invent layers you do not need.',
        ),
      ),
      section('interview', 'Interview angle',
        interviewTip('Explain the dependency direction: controllers depend on services, services depend on repository **interfaces**. Mention transactions and side effects after commit for seniority.'),
      ),
      section('practice', 'Practice',
        text('Write `ordersService.place({ userId, items })` that checks stock via `inventoryRepo`, creates the order, decrements stock in one transaction, and only then calls `mailer.sendReceipt`. Unit test the out-of-stock path with fakes.'),
      ),
      section('summary', 'Summary',
        bullets(
          'Services = use cases with business rules, free of HTTP.',
          'Inject dependencies; throw domain errors; return DTOs.',
          'Own transactions and order side effects after commit.',
        ),
      ),
    ],
    revisionNotes: [
      'Services take plain data, never `req`/`res`.',
      'Throw domain errors (NotFound, Conflict); map to HTTP centrally.',
      'Inject repositories/mailer/clock for testability.',
      'Transactions belong in the service; send emails/events after commit (outbox pattern).',
    ],
    quiz: [
      {
        kind: 'find-bug', difficulty: 'intermediate',
        prompt: 'What design problem does this service have?',
        code: "async function cancelOrder(req, res) {\n  const order = await ordersRepo.find(req.params.id);\n  if (order.userId !== req.user.id) return res.sendStatus(403);\n  await ordersRepo.cancel(order.id);\n  res.sendStatus(204);\n}",
        options: [
          'It should use PUT instead of DELETE',
          'It mixes HTTP (req/res) into business logic, so it cannot be reused or tested without Express',
          'ordersRepo.find must be synchronous',
          'Nothing — this is a correct service',
        ],
        answer: 1,
        explanation: 'This is a controller pretending to be a service. Take `(orderId, actor)` and throw `ForbiddenError`/`NotFoundError` instead.',
      },
      {
        kind: 'mcq', difficulty: 'advanced',
        prompt: 'A signup service inserts the user, sends a welcome email, then inserts a profile row which fails and rolls back. What is the best fix?',
        options: [
          'Send the email first so it is never lost',
          'Send the email only after the transaction commits (or write an outbox row inside the transaction)',
          'Catch the error and ignore it',
          'Move the email to the controller before calling the service',
        ],
        answer: 1,
        explanation: 'Side effects outside the DB must follow a successful commit; an outbox makes it reliable even if the process crashes right after commit.',
      },
    ],
    interview: [
      {
        category: 'express-backend', kind: 'concept', difficulty: 'intermediate', topic: 'Service layer',
        question: 'Why should services in an Express app not depend on req and res?',
        shortAnswer: 'So business logic is independent of the transport: it can be unit tested with plain inputs and reused by workers, CLIs or other protocols, while the controller handles HTTP specifics.',
        detailedAnswer: [
          'HTTP objects are large, mutable and hard to fake correctly.',
          'Business rules should not change because you add a queue consumer or GraphQL.',
          'Errors become domain errors mapped to status codes in one place.',
          'It makes the dependency direction clear: HTTP → service → repository.',
        ],
        followUp: 'How do you pass the authenticated user to a service then?',
        trap: 'Passing `req.user` is fine as plain data — passing `req` itself is the problem.',
      },
      {
        category: 'express-backend', kind: 'scenario', difficulty: 'advanced', topic: 'Transactions and side effects',
        question: 'A "place order" use case writes to orders and inventory tables and sends a confirmation email. How do you structure it so data stays consistent?',
        shortAnswer: 'The service runs both writes in one DB transaction and triggers the email only after commit — ideally via an outbox row written in the same transaction and delivered by a background worker.',
        detailedAnswer: [
          'Service method opens the transaction (or uses a unit-of-work) and passes it to repositories.',
          'Use row locks or conditional updates (`UPDATE ... WHERE stock >= qty`) to avoid overselling.',
          'Never call external APIs inside a long-held transaction — it holds locks.',
          'Outbox: insert an `outbox` event inside the transaction; a worker sends the email and marks it done (at-least-once, so make it idempotent).',
          'Controllers stay unaware of transactions.',
        ],
        followUp: 'How would you make the email sending idempotent?',
        trap: 'Sending the email in the middle of the transaction, so a rollback still emails the customer.',
      },
    ],
  },

  // ───────────────────────────────────────────────────────────
  'route-organization': {
    summary: 'Organize a growing Express codebase by feature (users/, orders/) with a routes, controller, service and repository file each, wired together in a composition root and mounted under versioned prefixes.',
    topics: ['folder structure', 'feature folders', 'layer folders', 'composition root', 'API versioning', 'routes index'],
    sections: [
      section('introduction', undefined,
        text('Express gives no folder structure. Without a convention, every developer invents one. A predictable layout makes the codebase navigable.'),
      ),
      section('definition', 'Two common layouts',
        table('Layer-first vs feature-first', ['', 'Layer-first', 'Feature-first'], [
          ['Shape', '`controllers/`, `services/`, `routes/`', '`modules/users/`, `modules/orders/`'],
          ['Finding a feature', 'Open 4 folders', 'Open 1 folder'],
          ['Scales to', 'Small apps', 'Medium/large apps, team ownership'],
          ['Extracting a microservice', 'Hard', 'Move one folder'],
        ]),
      ),
      section('why', 'Why feature-first',
        bullets(
          'Code that changes together lives together.',
          'Clear ownership and smaller merge conflicts.',
          'Cross-cutting code (`middleware/`, `errors/`, `config/`) stays in shared folders.',
        ),
      ),
      section('example', 'A feature-first structure',
        code({
          title: 'Folder layout',
          language: 'text',
          code: dedent(`
            src/
              app.js                  # builds express app, mounts /api/v1
              server.js               # listen + graceful shutdown
              config/index.js         # env parsing/validation
              container.js            # composition root: creates repos, services, controllers
              middleware/
                requireAuth.js
                validate.js
                errorHandler.js
                notFound.js
              errors/AppError.js
              modules/
                users/
                  users.routes.js
                  users.controller.js
                  users.service.js
                  users.repository.js
                  users.schemas.js
                  users.test.js
                orders/
                  ...
              routes.js               # mounts every module router
          `),
        }),
        code({
          title: 'src/routes.js and src/app.js',
          code: dedent(`
            // routes.js
            const express = require('express');

            function createApiRouter(c) {
              const api = express.Router();
              api.use('/users', c.usersRouter);
              api.use('/orders', c.ordersRouter);
              return api;
            }
            module.exports = { createApiRouter };

            // app.js
            const express = require('express');
            const { createApiRouter } = require('./routes');
            const { buildContainer } = require('./container');
            const { notFound } = require('./middleware/notFound');
            const { errorHandler } = require('./middleware/errorHandler');

            function createApp(deps = buildContainer()) {
              const app = express();
              app.use(express.json());
              app.get('/health', (req, res) => res.json({ status: 'ok' }));
              app.use('/api/v1', createApiRouter(deps));
              app.use(notFound);
              app.use(errorHandler);
              return app;
            }
            module.exports = { createApp };
          `),
          explanation: [
            '`container.js` is the only place that knows how pieces are wired — tests pass a different container.',
            'All feature routers are mounted under `/api/v1` in one place.',
          ],
        }),
        code({
          title: 'Listing registered routes (debug helper)',
          code: dedent(`
            // GET /api/v1/users, POST /api/v1/users ...
            console.log('GET    /health');
            console.log('GET    /api/v1/users');
            console.log('POST   /api/v1/users');
            console.log('GET    /api/v1/orders/:id');
          `),
          expectedOutput: 'GET    /health\nGET    /api/v1/users\nPOST   /api/v1/users\nGET    /api/v1/orders/:id',
          explanation: ['Express has no public route-listing API; many teams keep an explicit route table or generate OpenAPI docs instead.'],
        }),
      ),
      section('real-world', 'Real-world tips',
        bullets(
          'Version at the router level: `/api/v1`, `/api/v2` mount different routers that may share services.',
          'Keep `routes` files declarative: path + middleware + controller method, nothing else.',
          'Co-locate schemas and tests with the feature.',
        ),
      ),
      section('mistakes', 'Common mistakes',
        code({
          title: 'Wrong vs right: requiring everything everywhere',
          code: dedent(`
            // ✗ every file creates its own DB pool
            // users.repository.js
            const pool = new Pool({ connectionString: process.env.DATABASE_URL });

            // ✓ create once in the composition root and inject
            // container.js
            const pool = new Pool({ connectionString: config.databaseUrl });
            const usersRepo = createUsersRepository(pool);
          `),
        }),
        bullets(
          'Circular imports between feature modules — talk through services, not each other\'s repositories.',
          'Giant `utils/` folders that become a dumping ground.',
        ),
      ),
      section('interview', 'Interview angle',
        interviewTip('Sketch the folder tree from memory, explain feature-first vs layer-first, and mention a composition root for dependency injection.'),
      ),
      section('practice', 'Practice',
        text('Take an app with all routes in `app.js` and split it into `modules/products` and `modules/reviews` with nested routing for `/products/:id/reviews`.'),
      ),
      section('summary', 'Summary',
        bullets(
          'Feature-first folders scale better than layer-first.',
          'One composition root wires dependencies.',
          'Mount all routers under a versioned prefix in one file.',
        ),
      ),
    ],
    revisionNotes: [
      'Feature folder = routes + controller + service + repository + schemas + tests.',
      'Composition root (`container.js`) creates singletons (DB pool) once and injects them.',
      'Mount routers in one `routes.js` under `/api/v1`.',
      'Avoid cross-feature repository imports; go through services.',
    ],
    quiz: [
      {
        kind: 'mcq', difficulty: 'beginner',
        prompt: 'What is the main benefit of a feature-first folder structure?',
        options: ['Faster request handling', 'Code that changes together lives together, making features easy to find and own', 'It is required by Express', 'It removes the need for tests'],
        answer: 1,
        explanation: 'Structure has no runtime effect in Express; it is about maintainability and ownership.',
      },
      {
        kind: 'scenario', difficulty: 'intermediate',
        prompt: 'Integration tests are slow because each repository file opens its own database pool at import time. What change helps?',
        options: [
          'Increase the pool size',
          'Create the pool once in a composition root and inject it into repositories',
          'Use a global variable in each file',
          'Disconnect after every query',
        ],
        answer: 1,
        explanation: 'A single injected pool is shared, closable in teardown and replaceable in tests.',
      },
    ],
    interview: [
      {
        category: 'express-backend', kind: 'concept', difficulty: 'intermediate', topic: 'Project structure',
        question: 'How would you structure routes and files in a large Express application?',
        shortAnswer: 'Feature-first modules (each with routes, controller, service, repository, schemas, tests), shared middleware/errors/config folders, a composition root that wires dependencies, and one place that mounts all routers under a versioned prefix.',
        detailedAnswer: [
          'Routers per feature, mounted via `api.use("/users", usersRouter)`.',
          'Routes files are declarative: path, middleware, controller method.',
          'Composition root creates the DB pool, repositories and services once.',
          'Versioning: `/api/v1` and `/api/v2` routers can share services.',
          'Enforce boundaries with lint rules (no importing another module\'s repository).',
        ],
        followUp: 'When would layer-first be fine?',
        trap: 'Describing only folders without how modules are wired and mounted.',
      },
    ],
  },

  // ───────────────────────────────────────────────────────────
  'request-validation': {
    summary: 'Validate every request input (body, params, query, headers) at the HTTP boundary with a schema — e.g. zod or express-validator (both third-party) — and return a consistent 400 with field errors.',
    topics: ['zod', 'express-validator', 'safeParse', 'schema validation', 'coercion', '400 Bad Request', '422', 'whitelisting'],
    sections: [
      section('introduction', undefined,
        text('Clients send anything: missing fields, wrong types, extra properties, 10 MB strings. Validation rejects bad input before it reaches your business logic or database.'),
      ),
      section('definition', 'Definition',
        bullets(
          '**Validation** checks shape and constraints; **coercion** converts types (`"5"` → `5`); **sanitization** strips or normalises (trim, lowercase).',
          'Express itself has **no validator**. Popular choices: `zod` (schema-first, TypeScript inference), `express-validator` (chainable middleware), `joi`, `ajv` (JSON Schema).',
          'Validate in middleware, before controllers, and pass the **parsed** data forward.',
        ),
        table('zod vs express-validator', ['', 'zod (third-party)', 'express-validator (third-party)'], [
          ['Style', 'Schema object, `safeParse`', 'Chain per field: `body("email").isEmail()`'],
          ['Types', 'Infers TS types from schemas', 'Manual types'],
          ['Reuse outside Express', 'Yes (any data)', 'Express-specific'],
          ['Unknown keys', 'Stripped by default on objects', 'Kept unless you use `matchedData()`'],
        ]),
      ),
      section('why', 'Why at the boundary',
        bullets(
          'Fail fast with a helpful 400 instead of a 500 from the DB.',
          'Defence against injection and mass assignment (`{ "role": "admin" }` in a signup body).',
          'Services can trust their inputs and stay simple.',
        ),
      ),
      section('internals', 'A validate middleware',
        steps(
          'Accept schemas for `body`, `params`, `query`.',
          'Run `schema.safeParse(req[part])` for each.',
          'On failure, respond 400 (or forward a `ValidationError`) with `issues` mapped to `{ path, message }`.',
          'On success, store parsed values: `req.body` can be replaced; `req.query` cannot in Express 5 — use `res.locals` or `req.validated`.',
        ),
      ),
      section('example', 'Validation with zod',
        code({
          title: 'middleware/validate.js + schemas',
          code: dedent(`
            const { z } = require('zod');

            const createUser = z.object({
              email: z.string().trim().toLowerCase().email(),
              name: z.string().trim().min(1).max(100),
              password: z.string().min(12).max(128),
            });

            const listQuery = z.object({
              page: z.coerce.number().int().min(1).default(1),
              limit: z.coerce.number().int().min(1).max(100).default(20),
            });

            function validate(schemas) {
              return (req, res, next) => {
                const errors = [];
                const parsed = {};
                for (const part of ['params', 'query', 'body']) {
                  if (!schemas[part]) continue;
                  const result = schemas[part].safeParse(req[part] ?? {});
                  if (result.success) parsed[part] = result.data;
                  else errors.push(...result.error.issues.map((i) => ({ in: part, path: i.path.join('.'), message: i.message })));
                }
                if (errors.length) return res.status(400).json({ error: { code: 'VALIDATION_FAILED', details: errors } });
                if (parsed.body) req.body = parsed.body;          // body is a plain writable property
                res.locals.query = parsed.query;                   // req.query is a getter in Express 5
                res.locals.params = parsed.params;
                next();
              };
            }

            module.exports = { validate, createUser, listQuery };
          `),
          explanation: [
            '`safeParse` never throws; it returns `{ success, data }` or `{ success, error }`.',
            'zod object schemas strip unknown keys by default — `role` in the body disappears (mass-assignment defence).',
            '`z.coerce.number()` turns query strings into numbers.',
          ],
          versionNote: 'zod v4 also offers top-level `z.email()`; `z.string().email()` still works. Messages below are zod v4 defaults and may differ by version.',
        }),
        code({
          title: 'Responses',
          language: 'http',
          code: 'POST /users HTTP/1.1\nContent-Type: application/json\n\n{"email":"not-an-email","name":"","password":"short","role":"admin"}\n\nPOST /users HTTP/1.1\nContent-Type: application/json\n\n{"email":" ADA@Example.com ","name":"Ada","password":"correct-horse-battery","role":"admin"}',
          expectedOutput: 'HTTP/1.1 400 Bad Request\n{"error":{"code":"VALIDATION_FAILED","details":[{"in":"body","path":"email","message":"Invalid email address"},{"in":"body","path":"name","message":"Too small: expected string to have >=1 characters"},{"in":"body","path":"password","message":"Too small: expected string to have >=12 characters"}]}}\n\nHTTP/1.1 201 Created\n{"data":{"id":8,"email":"ada@example.com","name":"Ada"}}',
          explanation: [
            'All field errors are returned at once, not one per request.',
            'The valid request has been trimmed/lowercased and `role` was stripped before reaching the service.',
          ],
        }),
        code({
          title: 'Same rules with express-validator',
          code: dedent(`
            const { body, validationResult, matchedData } = require('express-validator');

            app.post('/users',
              body('email').trim().isEmail().normalizeEmail(),
              body('name').trim().isLength({ min: 1, max: 100 }),
              body('password').isLength({ min: 12, max: 128 }),
              (req, res, next) => {
                const result = validationResult(req);
                if (!result.isEmpty()) return res.status(400).json({ errors: result.array() });
                req.body = matchedData(req, { locations: ['body'] }); // only validated fields
                next();
              },
              usersController.create,
            );
          `),
          explanation: ['`matchedData` returns only declared fields — the equivalent of zod\'s key stripping.'],
        }),
      ),
      section('real-world', 'Real-world practice',
        bullets(
          'Share schemas with the frontend (monorepo) or generate OpenAPI docs from them.',
          'Validate env config at startup with the same library.',
          'Choose 400 vs 422 once and use it consistently (422 Unprocessable Content for semantically invalid but well-formed JSON is common).',
        ),
      ),
      section('mistakes', 'Common mistakes',
        code({
          title: 'Wrong vs right: mass assignment',
          code: dedent(`
            // ✗ spreads whatever the client sent into the DB
            await usersRepo.insert({ ...req.body });

            // ✓ only validated, whitelisted fields
            const { email, name, password } = createUser.parse(req.body);
            await usersService.register({ email, name, password });
          `),
        }),
        bullets(
          'Validating only `body` and forgetting `params`/`query`.',
          'Using `.passthrough()`/keeping unknown keys without a reason.',
          'Trying `req.query = parsed` in Express 5 — it is a getter; store parsed data elsewhere.',
          'Treating validation as authorization — a valid `userId` is not proof the caller may access it.',
        ),
      ),
      section('interview', 'Interview angle',
        interviewTip('Mention: validate at the boundary, return all errors in a stable shape, strip unknown fields (mass assignment), coerce query strings, and that Express 5 makes `req.query` read-only.'),
      ),
      section('practice', 'Practice',
        text('Write a zod schema for `PATCH /users/:id` where all fields are optional but at least one must be present (`.partial().refine(...)`), and the `id` param must be a positive integer.'),
      ),
      section('summary', 'Summary',
        bullets(
          'Express has no validator — use zod, express-validator, joi or ajv.',
          'Validate params, query and body in middleware before controllers.',
          'Strip unknown keys; coerce query types; return 400 with field details.',
          'Validated ≠ authorized.',
        ),
      ),
    ],
    revisionNotes: [
      'zod `safeParse` → `{ success, data | error.issues }`; object schemas strip unknown keys by default.',
      '`z.coerce.number()` for query/params strings.',
      'express-validator: chains + `validationResult(req)` + `matchedData(req)`.',
      'Express 5 `req.query` is a getter — store validated query in `res.locals`/custom property.',
      'Whitelisting fields prevents mass assignment (`role: "admin"`).',
    ],
    quiz: [
      {
        kind: 'scenario', difficulty: 'intermediate',
        prompt: 'A signup body includes `"isAdmin": true`, and the new user becomes an admin. What is the root cause?',
        options: [
          'JSON parsing is insecure',
          'The handler passes the raw body into the insert — mass assignment; whitelist fields via a schema',
          'Passwords were not hashed',
          'The route should use PUT',
        ],
        answer: 1,
        explanation: 'Validation should define which fields are accepted; anything else is stripped or rejected before reaching the DB.',
      },
      {
        kind: 'complete-code', difficulty: 'intermediate',
        prompt: 'Make `?limit=50` arrive as the number 50 in a zod schema.',
        code: "const q = z.object({ limit: /* ??? */ });",
        options: ['z.number().max(100)', 'z.coerce.number().int().max(100)', 'z.string().max(100)', 'z.parseInt(100)'],
        answer: 1,
        explanation: 'Query values are strings; `z.number()` would reject `"50"`. `z.coerce.number()` converts first, then validates.',
      },
      {
        kind: 'find-bug', difficulty: 'advanced',
        prompt: 'Express 5: after validation, the controller still sees `req.query.page` as the string "2". Why?',
        code: "function validateQuery(schema) {\n  return (req, res, next) => {\n    req.query = schema.parse(req.query);\n    next();\n  };\n}",
        options: [
          'schema.parse is async',
          '`req.query` is a getter in Express 5, so the assignment does not replace it; store parsed data elsewhere',
          'zod cannot parse query strings',
          'next() must be called before parse',
        ],
        answer: 1,
        explanation: 'Express 5 defines `req.query` as a getter computed from the URL. Put the parsed object in `res.locals.query` or a custom `req.validatedQuery`.',
      },
    ],
    interview: [
      {
        category: 'express-backend', kind: 'concept', difficulty: 'intermediate', topic: 'Validation',
        question: 'Where and how should you validate incoming requests in an Express API?',
        shortAnswer: 'At the HTTP boundary, in middleware that runs before the controller, using a schema library to validate and coerce params, query and body, returning a 400 with all field errors and passing only whitelisted data onward.',
        detailedAnswer: [
          'Schema libraries (zod, joi, ajv, express-validator) are third-party; Express has none built in.',
          'Validate every input source, not just the body.',
          'Strip unknown fields to prevent mass assignment.',
          'Business-rule validation (email already taken) still happens in the service.',
          'Consistent error format helps clients render field errors.',
        ],
        followUp: 'What is the difference between input validation and business validation?',
        trap: 'Validating only on the frontend.',
      },
      {
        category: 'express-backend', kind: 'concept', difficulty: 'advanced', topic: 'Validation in Express 5',
        question: 'In Express 5, how do you pass validated and coerced query parameters to a controller, given req.query cannot be reassigned?',
        shortAnswer: 'Store the parsed result somewhere you control — `res.locals.query`, a custom `req.validated` object, or a typed wrapper — because Express 5 defines `req.query` as a getter that re-parses the raw URL.',
        detailedAnswer: [
          'Express 4 allowed `req.query = parsed` (it was a plain property).',
          'In Express 5 the getter means assignment is ignored (or throws in strict mode for getter-only).',
          '`req.body` is a normal property and can still be replaced.',
          'TypeScript: augment `Request` with `validated: { query: ...; params: ... }` for type safety.',
          'Alternatively validate inside the controller with a helper that returns typed data.',
        ],
        followUp: 'How would you type `res.locals` in TypeScript?',
        trap: 'Assuming Express 4 middleware like old validators that mutate `req.query` still works unchanged.',
      },
    ],
  },
};

export default content;
