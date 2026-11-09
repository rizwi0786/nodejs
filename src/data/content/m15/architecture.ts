import type { ModuleContent } from '../../../types';
import { bullets, code, dedent, diagram, flow, interviewTip, note, section, steps, table, text, warn } from '../helpers';

const content: Partial<ModuleContent> = {
  'mvc-architecture': {
    summary: 'MVC splits an application into Model (data + rules), View (presentation) and Controller (handles input, calls the model, picks a view); in Node APIs the "view" is usually the JSON serialiser.',
    topics: ['Model', 'View', 'Controller', 'separation of concerns', 'fat model', 'thin controller', 'Express MVC', 'server-side rendering'],
    sections: [
      section('introduction', undefined,
        text('Putting SQL, validation and HTML in one route handler works for a demo and becomes unmaintainable quickly. MVC is the oldest widely used way to separate those concerns.'),
      ),
      section('definition', 'The three parts',
        table('MVC responsibilities', ['Part', 'Responsibility', 'In an Express app'], [
          ['Model', 'Data, domain rules, persistence', 'Classes/modules using an ORM or queries'],
          ['View', 'Presentation of data', 'Templates (EJS, Pug) for SSR — or JSON responses for APIs'],
          ['Controller', 'Receives input, calls models, chooses view/response', 'Route handler functions'],
        ]),
      ),
      section('why', 'Why MVC',
        bullets(
          'Each part changes for a different reason (UI redesign vs business rule vs new endpoint).',
          'Models can be tested without HTTP; views without a database.',
          'Familiar to most developers (Rails, Laravel, Django, ASP.NET MVC, Sails, NestJS-style controllers).',
        ),
        note('Express itself is unopinionated — MVC is a convention you apply, not something Express enforces.'),
      ),
      section('internals', 'Request flow',
        steps(
          'Router matches `POST /todos` and calls the controller action.',
          'Controller extracts and validates input from `req`.',
          'Controller calls the model (`Todo.create`), which applies rules and persists.',
          'Controller passes the result to a view (`res.render`) or serialises JSON (`res.status(201).json`).',
        ),
      ),
      section('visual', 'MVC flow',
        flow(['Request: POST /todos', 'Controller: parse + validate', 'Model: rules + save', 'View: render HTML / JSON', 'Response'],
          { title: 'Classic MVC in a web server', direction: 'horizontal' }),
      ),
      section('example', 'MVC without a framework',
        code({
          title: 'Model, View, Controller (runnable)',
          code: dedent(`
            class TodoModel {
              constructor() { this.todos = []; this.nextId = 1; }
              add(title) {
                if (!title) throw new Error('title required'); // domain rule lives in the model
                const todo = { id: this.nextId++, title, done: false };
                this.todos.push(todo);
                return todo;
              }
              all() { return this.todos; }
            }

            const todoView = {
              list: (todos) => todos.map((t) => '[' + (t.done ? 'x' : ' ') + '] ' + t.id + '. ' + t.title).join(' | '),
            };

            class TodoController {
              constructor(model, view) { this.model = model; this.view = view; }
              create(req) {
                try {
                  return { status: 201, body: this.model.add(req.body.title) };
                } catch (e) {
                  return { status: 400, body: { error: e.message } };
                }
              }
              index() { return { status: 200, body: this.view.list(this.model.all()) }; }
            }

            const controller = new TodoController(new TodoModel(), todoView);
            console.log(controller.create({ body: { title: 'Write tests' } }).status);
            console.log(controller.create({ body: {} }).body.error);
            controller.create({ body: { title: 'Deploy' } });
            console.log(controller.index().body);
          `),
          expectedOutput: '201\ntitle required\n[ ] 1. Write tests | [ ] 2. Deploy',
          explanation: [
            'The controller never formats output or enforces rules — it coordinates.',
            'The model rejects an empty title before allocating an id, so ids stay 1 and 2.',
            'The view only formats data; swapping it for JSON changes nothing else.',
          ],
          runnable: true,
        }),
        code({
          title: 'Express folder layout',
          language: 'text',
          code: dedent(`
            src/
              models/todo.model.js        # schema + domain methods
              views/todos/index.ejs       # SSR templates (omit for pure APIs)
              controllers/todo.controller.js
              routes/todo.routes.js       # router.post('/todos', todoController.create)
              app.js
          `),
          explanation: ['Routes map URLs to controller actions; nothing else lives in route files.'],
        }),
      ),
      section('real-world', 'In a real backend',
        bullets(
          'Server-rendered admin panels: EJS/Pug views + controllers + Mongoose/Sequelize models.',
          'APIs: "view" = response DTO/serialiser that hides internal fields (`passwordHash`).',
          'As apps grow, MVC usually evolves into layered architecture by adding a service layer between controllers and models.',
        ),
      ),
      section('mistakes', 'Common mistakes',
        code({
          title: 'Fat controller vs thin controller',
          code: dedent(`
            // ❌ business rules + SQL + formatting in the controller
            async function checkout(req, res) {
              const cart = await db.query('SELECT ...', [req.user.id]);
              if (cart.rows.length === 0) return res.status(400).send('empty');
              const total = cart.rows.reduce((s, i) => s + i.price * i.qty, 0) * 1.2;
              await db.query('INSERT INTO orders ...', [total]);
              res.send('<h1>Thanks! ' + total + '</h1>');
            }

            // ✅ controller coordinates; rules live in the model/service
            async function checkout(req, res) {
              const order = await Order.placeFromCart(req.user.id);
              res.status(201).json(toOrderDto(order));
            }
          `),
          explanation: ['Thin controllers are easy to test and reuse logic from other entry points (CLI, workers).'],
        }),
        bullets(
          'Models that import `req`/`res` — HTTP leaks into the domain.',
          'Views that run queries.',
          'Treating ORM models as the whole "model" layer and putting every rule in hooks.',
        ),
      ),
      section('interview', 'Interview angle',
        interviewTip('Describe each part\'s responsibility, then explain how MVC maps to a JSON API (view = serialiser) and why a service layer is often added.'),
      ),
      section('practice', 'Practice',
        text('Refactor a single-file Express app with inline SQL into models/, controllers/ and routes/ folders. Keep every route handler under 10 lines.'),
      ),
      section('summary', 'Summary',
        bullets(
          'Model = data + rules; View = presentation; Controller = coordination.',
          'Express does not enforce MVC — it is a convention.',
          'For APIs, the view is the response shape.',
          'Keep controllers thin.',
        ),
      ),
    ],
    revisionNotes: [
      'MVC: Model (data/rules), View (presentation), Controller (input → model → view).',
      'Express is unopinionated; MVC is a folder/responsibility convention.',
      'API view = JSON/DTO serialisation.',
      'Fat controllers are the classic smell; add a service layer as complexity grows.',
    ],
    quiz: [
      {
        kind: 'mcq', difficulty: 'beginner',
        prompt: 'In an MVC Express API, where should the rule "an order total must be positive" live?',
        options: ['In the route file', 'In the model (or domain/service layer)', 'In the view template', 'In the HTTP client'],
        answer: 1,
        explanation: 'Business rules belong to the model/domain so every entry point enforces them. Controllers coordinate; views present.',
      },
      {
        kind: 'predict-output', difficulty: 'intermediate',
        prompt: 'What does this print?',
        code: "class M { constructor() { this.n = 0; } add(x) { if (!x) throw new Error('bad'); return ++this.n; } }\nconst m = new M();\ntry { m.add(''); } catch (e) { console.log(e.message); }\nconsole.log(m.add('a'));",
        options: ['bad\n2', 'bad\n1', '1\n2', 'bad\n0'],
        answer: 1,
        explanation: 'The rule throws before incrementing, so the first successful add returns 1.',
      },
    ],
    interview: [
      {
        category: 'advanced', kind: 'concept', difficulty: 'beginner', topic: 'Architecture',
        question: 'What is MVC and how does it apply to a Node.js REST API?',
        shortAnswer: 'MVC separates data and rules (Model), presentation (View) and request coordination (Controller); in a REST API the controller handles the request, the model holds data and rules, and the view is the JSON response shape.',
        detailedAnswer: [
          'Routes map URLs to controller actions.',
          'Controllers parse input, call models, choose status codes.',
          'Models encapsulate persistence and domain rules.',
          'Views: templates for SSR, DTO/serialisers for APIs.',
        ],
        followUp: 'Why do many teams add a service layer to MVC?',
        trap: 'Saying Express is an MVC framework that enforces this structure.',
      },
      {
        category: 'advanced', kind: 'scenario', difficulty: 'intermediate', topic: 'Architecture',
        question: 'Your Express controllers are 300 lines long with SQL, validation and email sending inline. How would you restructure them?',
        shortAnswer: 'Move validation to middleware/schemas, business logic to services or domain models, data access to repositories, side effects like email behind interfaces or queues, and keep controllers as thin request-to-response adapters.',
        detailedAnswer: [
          'Validation: zod/Joi schemas in middleware.',
          'Services: one method per use case (`placeOrder`).',
          'Repositories: all SQL in one place per aggregate.',
          'Side effects: injected mailer or background job.',
          'Controllers: map req → service call → res.',
          'Add tests around the service before refactoring.',
        ],
        followUp: 'How do you refactor safely with no existing tests?',
        trap: 'Moving the same tangled code into a "utils" file.',
      },
    ],
  },

  'layered-architecture': {
    summary: 'Layered architecture organises a backend into routes → controllers → services → repositories → database, where each layer only depends on the layer below and has one kind of responsibility.',
    topics: ['presentation layer', 'service layer', 'data access layer', 'repository', 'dependency direction', 'DTO', 'n-tier'],
    sections: [
      section('introduction', undefined,
        text('Layered (n-tier) architecture is the most common structure for Node.js backends. It answers "where does this code go?" with a simple rule: by responsibility, stacked in layers.'),
      ),
      section('definition', 'The layers',
        table('Typical Node layers', ['Layer', 'Knows about', 'Must not know about'], [
          ['Routes', 'URLs, middleware, controller functions', 'Business rules, SQL'],
          ['Controller', 'HTTP req/res, status codes, DTOs', 'SQL, ORM details'],
          ['Service', 'Use cases, business rules, transactions', '`req`, `res`, HTTP status codes'],
          ['Repository', 'Queries/ORM, mapping rows ↔ objects', 'HTTP, business decisions'],
          ['Database', 'Storage', '—'],
        ]),
      ),
      section('why', 'Why layer',
        bullets(
          'Separation of concerns: change SQL without touching HTTP, change HTTP without touching rules.',
          'Services are reusable from HTTP, CLI scripts, queue workers and tests.',
          'Clear testing seams: mock the repository to unit-test a service.',
          'Easy onboarding — the structure is predictable.',
        ),
      ),
      section('internals', 'Dependency direction',
        steps(
          'Calls flow **downward**: controller → service → repository.',
          'A layer never calls upward (a repository never calls a controller).',
          'Ideally layers are not skipped (controllers do not call repositories directly) — strict vs relaxed layering is a team choice.',
          'Errors flow upward as domain errors (`NotFoundError`), translated to HTTP status codes in the controller/error middleware.',
          'Data crosses boundaries as plain objects/DTOs, not ORM instances or `req`.',
        ),
        warn('In plain layered architecture the service depends on the concrete data layer. Clean architecture inverts this so the domain depends only on interfaces — see the next lesson.'),
      ),
      section('visual', 'Layers',
        diagram('layered-architecture', 'route → controller → service → repository → DB; dependencies point down.'),
      ),
      section('example', 'Four layers in miniature',
        code({
          title: 'Route → controller → service → repository (runnable)',
          code: dedent(`
            class NotFoundError extends Error {}

            // Repository: data access only
            class UserRepository {
              constructor() { this.rows = new Map([[1, { id: 1, email: 'ada@example.com', password_hash: 'x' }]]); }
              async findById(id) { return this.rows.get(id) ?? null; }
            }

            // Service: business rules, no HTTP
            class UserService {
              constructor(repo) { this.repo = repo; }
              async getProfile(id) {
                const user = await this.repo.findById(id);
                if (!user) throw new NotFoundError('user ' + id + ' not found');
                return { id: user.id, email: user.email }; // never expose password_hash
              }
            }

            // Controller: HTTP translation
            const makeUserController = (service) => ({
              async show(req) {
                try {
                  return { status: 200, body: await service.getProfile(Number(req.params.id)) };
                } catch (e) {
                  if (e instanceof NotFoundError) return { status: 404, body: { error: e.message } };
                  throw e;
                }
              },
            });

            // Route wiring (composition)
            const controller = makeUserController(new UserService(new UserRepository()));
            (async () => {
              const ok = await controller.show({ params: { id: '1' } });
              const missing = await controller.show({ params: { id: '9' } });
              console.log(ok.status, JSON.stringify(ok.body));
              console.log(missing.status, JSON.stringify(missing.body));
            })();
          `),
          expectedOutput: '200 {"id":1,"email":"ada@example.com"}\n404 {"error":"user 9 not found"}',
          explanation: [
            'The service throws a domain error; only the controller knows that means HTTP 404.',
            'The service maps the row to a safe shape — `password_hash` never leaves the layer.',
            'Each layer receives the one below via its constructor, so tests can swap the repository.',
          ],
          runnable: true,
        }),
        code({
          title: 'Folder structure',
          language: 'text',
          code: dedent(`
            src/
              routes/users.routes.js
              controllers/users.controller.js
              services/users.service.js
              repositories/users.repository.js
              errors/
              app.js         # wiring
          `),
          explanation: ['Some teams group by feature instead (`src/users/{routes,controller,service,repository}.js`) — same layers, better cohesion.'],
        }),
      ),
      section('real-world', 'In a real backend',
        bullets(
          'Transactions are started in the service (the use-case boundary) and passed to repositories.',
          'Queue workers call the same services as controllers.',
          'Feature-based folders scale better than one giant `services/` directory.',
        ),
      ),
      section('mistakes', 'Common mistakes',
        code({
          title: 'Leaking HTTP into the service',
          code: dedent(`
            // ❌ service tied to Express
            async function createUser(req, res) {
              if (!req.body.email) return res.status(400).send('email');
            }
            // ✅ service takes data, throws domain errors
            async function createUser({ email }) {
              if (!email) throw new ValidationError('email required');
            }
          `),
          explanation: ['A service that needs `res` cannot be called from a worker or a test without faking Express.'],
        }),
        bullets(
          'Anemic "pass-through" layers that add nothing — keep layers meaningful.',
          'Controllers calling the ORM directly for "just this one query".',
          'Returning ORM entities straight to clients.',
        ),
      ),
      section('interview', 'Interview angle',
        interviewTip('State what each layer may and may not know, the downward dependency direction, and how errors are translated at the boundary.'),
      ),
      section('practice', 'Practice',
        text('Add `updateEmail(id, email)` to the example: the service must reject duplicate emails with a `ConflictError` that the controller maps to 409.'),
      ),
      section('summary', 'Summary',
        bullets(
          'Routes → controllers → services → repositories → DB.',
          'Each layer has one responsibility and depends only downward.',
          'Domain errors in services; HTTP codes at the edge.',
          'Pass DTOs, not req/res or ORM instances.',
        ),
      ),
    ],
    revisionNotes: [
      'Controller = HTTP; service = business rules; repository = data access.',
      'Dependencies point downward; no upward calls.',
      'Services must not use req/res or status codes.',
      'Transactions begin in the service.',
      'Group by feature for large apps.',
    ],
    quiz: [
      {
        kind: 'find-bug', difficulty: 'intermediate',
        prompt: 'What violates layered architecture here?',
        code: "class OrderService {\n  async cancel(req, res) {\n    const order = await this.repo.find(req.params.id);\n    if (!order) return res.status(404).end();\n    await this.repo.markCancelled(order.id);\n    res.json({ ok: true });\n  }\n}",
        options: [
          'The repository is injected',
          'The service depends on HTTP (req/res, status codes) instead of taking data and throwing domain errors',
          'cancel is async',
          'It uses a class',
        ],
        answer: 1,
        explanation: 'Services must be HTTP-agnostic so workers, CLIs and tests can call them. Status codes belong in the controller.',
      },
      {
        kind: 'mcq', difficulty: 'beginner',
        prompt: 'In which layer should SQL queries live?',
        options: ['Controller', 'Route', 'Repository / data access layer', 'Error middleware'],
        answer: 2,
        explanation: 'The repository encapsulates data access so services deal with domain objects only.',
      },
    ],
    interview: [
      {
        category: 'advanced', kind: 'concept', difficulty: 'intermediate', topic: 'Architecture',
        question: 'Describe the responsibilities of controllers, services and repositories in a layered Node.js backend.',
        shortAnswer: 'Controllers translate HTTP into calls and results into responses, services implement use cases and business rules, and repositories encapsulate data access and mapping.',
        detailedAnswer: [
          'Controller: parse/validate input, call service, map errors to status codes.',
          'Service: rules, orchestration, transactions; no HTTP.',
          'Repository: queries/ORM, returns domain objects or plain data.',
          'Dependencies point downward; each layer testable in isolation.',
        ],
        followUp: 'Where do you start and commit a transaction that spans two repositories?',
        trap: 'Describing services as thin wrappers that just forward to repositories.',
      },
      {
        category: 'advanced', kind: 'concept', difficulty: 'advanced', topic: 'Architecture',
        question: 'What are the weaknesses of a classic layered architecture, and how do newer styles address them?',
        shortAnswer: 'Business logic depends on the concrete data layer and frameworks, layers can become pass-through boilerplate, and code for one feature is scattered; clean/hexagonal architecture inverts dependencies around the domain and feature-based modules improve cohesion.',
        detailedAnswer: [
          'Service → repository dependency means the domain knows about persistence choices.',
          'Database-first design: domain shaped by tables.',
          'Horizontal slicing scatters one feature across many folders.',
          'Hexagonal/clean: domain defines ports, adapters implement them.',
          'Vertical slices/modular monolith: group by feature, layer inside.',
        ],
        followUp: 'When is a simple layered structure still the right choice?',
        trap: 'Claiming layered architecture is obsolete — it is fine for many CRUD-heavy services.',
      },
    ],
  },

  'clean-architecture': {
    summary: 'Clean architecture arranges code in concentric rings — entities, use cases, interface adapters, frameworks/drivers — with the dependency rule that source code dependencies only point inward toward business rules.',
    topics: ['entities', 'use cases', 'interface adapters', 'frameworks and drivers', 'dependency rule', 'ports and adapters', 'hexagonal architecture'],
    sections: [
      section('introduction', undefined,
        text('Frameworks, databases and delivery mechanisms change; core business rules change for business reasons only. Clean architecture protects those rules so you can swap Express for Fastify or Postgres for an API without touching them.'),
      ),
      section('definition', 'The rings',
        table('From inside out', ['Ring', 'Contains', 'Example'], [
          ['Entities', 'Enterprise-wide business objects and rules', '`Order` with `addItem`, `total()` invariant checks'],
          ['Use cases', 'Application-specific workflows; define ports (interfaces) they need', '`PlaceOrder`, needs `OrderRepository`, `PaymentGateway`'],
          ['Interface adapters', 'Convert between use cases and the outside: controllers, presenters, repository implementations', '`PostgresOrderRepository`, Express controller'],
          ['Frameworks & drivers', 'Express, ORM, DB driver, message broker SDKs', '`express`, `pg`, `stripe`'],
        ]),
        bullets(
          '**Dependency rule**: inner rings know nothing about outer rings — no imports of Express, pg or ORMs in entities/use cases.',
          'Closely related: **hexagonal architecture** (ports and adapters) and onion architecture — same core idea.',
        ),
      ),
      section('why', 'Why bother',
        bullets(
          'Use cases are testable with in-memory fakes — no DB, no HTTP.',
          'Frameworks become details you can upgrade or replace.',
          'Business rules are explicit and in one place.',
          'Cost: more files, interfaces and mapping code — worth it for complex domains, overkill for simple CRUD.',
        ),
      ),
      section('internals', 'How dependencies get inverted',
        steps(
          'The use case declares what it needs as a **port** (in JS: a documented shape; in TS: an `interface`).',
          'An outer-ring **adapter** implements the port (`PostgresOrderRepository implements OrderRepository`).',
          'The **composition root** (main) creates the adapter and injects it into the use case.',
          'At runtime calls go inward → outward (use case → Postgres), but source dependencies point inward (adapter imports the port).',
          'Data crossing boundaries is simple structures (DTOs), never framework objects.',
        ),
      ),
      section('visual', 'Dependency rule',
        flow(['Frameworks & drivers: Express, pg', 'Interface adapters: controllers, repositories', 'Use cases: PlaceOrder (defines ports)', 'Entities: Order'],
          { title: 'Source dependencies point inward', caption: 'Each arrow means "depends on". Nothing points outward.' }),
      ),
      section('example', 'A use case with ports',
        code({
          title: 'Entity, use case, adapters (runnable)',
          code: dedent(`
            // ── Entities ──────────────────────────────
            class Order {
              constructor(id, items) {
                if (items.length === 0) throw new Error('order needs at least one item');
                this.id = id;
                this.items = items;
              }
              total() { return this.items.reduce((s, i) => s + i.price * i.qty, 0); }
            }

            // ── Use case (depends only on ports) ──────
            class PlaceOrder {
              constructor({ orders, payments, ids }) { Object.assign(this, { orders, payments, ids }); }
              async execute({ items, cardToken }) {
                const order = new Order(this.ids.next(), items);
                await this.payments.charge(cardToken, order.total());
                await this.orders.save(order);
                return { orderId: order.id, total: order.total() };
              }
            }

            // ── Adapters (outer ring) ─────────────────
            class InMemoryOrderRepo { constructor() { this.data = []; } async save(o) { this.data.push(o); } }
            class FakePayments { async charge(token, amount) { console.log('charged', token, amount); } }
            const seqIds = { n: 100, next() { return 'ord_' + ++this.n; } };

            // ── Composition root ──────────────────────
            const placeOrder = new PlaceOrder({ orders: new InMemoryOrderRepo(), payments: new FakePayments(), ids: seqIds });
            placeOrder.execute({ items: [{ price: 20, qty: 2 }, { price: 5, qty: 1 }], cardToken: 'tok_visa' })
              .then((r) => console.log(JSON.stringify(r)));
            placeOrder.execute({ items: [], cardToken: 'tok_visa' })
              .catch((e) => console.log('rejected:', e.message));
          `),
          expectedOutput: 'charged tok_visa 45\nrejected: order needs at least one item\n{"orderId":"ord_101","total":45}',
          explanation: [
            'The entity enforces its invariant regardless of who calls it.',
            '`PlaceOrder` knows nothing about Express, Postgres or Stripe — only the shapes it was given.',
            'Output order: the first call logs `charged` synchronously, then pauses at `await`. The second call\'s entity throws immediately, so its rejection is handled before the first call finishes its remaining awaits.',
            'Swap `FakePayments` for a `StripePayments` adapter in production without changing the use case.',
          ],
          runnable: true,
        }),
        code({
          title: 'TypeScript port + adapter',
          language: 'typescript',
          code: dedent(`
            // core/ports/order-repository.ts  (inner ring)
            export interface OrderRepository {
              save(order: Order): Promise<void>;
              findById(id: string): Promise<Order | null>;
            }

            // adapters/postgres-order-repository.ts  (outer ring imports inner)
            import type { OrderRepository } from '../core/ports/order-repository';
            export class PostgresOrderRepository implements OrderRepository {
              constructor(private readonly pool: Pool) {}
              async save(order: Order) { await this.pool.query('INSERT INTO orders ...', [order.id]); }
              async findById(id: string) { /* map row → Order */ return null; }
            }
          `),
          explanation: ['The import arrow goes from adapter → core; the core never imports `pg`.'],
        }),
      ),
      section('real-world', 'In a real backend',
        bullets(
          'Folder layout: `src/core/{entities,use-cases,ports}`, `src/adapters/{http,persistence,messaging}`, `src/main.ts`.',
          'ESLint rules (e.g. `import/no-restricted-paths`, dependency-cruiser) enforce that `core/` never imports from `adapters/`.',
          'The same use case is exposed through REST, GraphQL and a queue consumer.',
        ),
      ),
      section('mistakes', 'Common mistakes',
        code({
          title: 'Framework leaking inward',
          code: dedent(`
            // ❌ entity depends on the ORM
            const { Model } = require('sequelize');
            class Order extends Model {}
            // ✅ plain entity; the repository maps it to/from the ORM model
            class Order { constructor(id, items) { /* rules */ } }
          `),
          explanation: ['Once entities extend ORM classes, the core depends on the outermost ring.'],
        }),
        bullets(
          'Creating an interface for everything in a 5-endpoint CRUD service.',
          'Use cases returning HTTP responses.',
          'Passing ORM entities across boundaries.',
        ),
      ),
      section('interview', 'Interview angle',
        interviewTip('State the dependency rule precisely, explain how a use case reaches a database without depending on it (ports + adapters + composition root), and acknowledge the cost.'),
      ),
      section('practice', 'Practice',
        text('Add a `Notifier` port to `PlaceOrder` that sends a confirmation, implement a console adapter, and write a test using an in-memory fake that records calls.'),
      ),
      section('summary', 'Summary',
        bullets(
          'Entities → use cases → adapters → frameworks.',
          'Dependencies point inward only.',
          'Use cases define ports; adapters implement them.',
          'Wire everything in a composition root.',
          'Great for complex domains; heavy for simple CRUD.',
        ),
      ),
    ],
    revisionNotes: [
      'Dependency rule: inner rings never import outer rings.',
      'Use cases own the ports (interfaces); adapters implement.',
      'Hexagonal = ports and adapters; onion; clean — same idea.',
      'Composition root wires concrete adapters.',
      'Enforce with lint rules on import paths.',
    ],
    quiz: [
      {
        kind: 'mcq', difficulty: 'intermediate',
        prompt: 'Which import breaks the dependency rule of clean architecture?',
        options: [
          'An Express controller importing the PlaceOrder use case',
          'A Postgres repository importing the OrderRepository interface',
          'The PlaceOrder use case importing the `pg` driver',
          'main.ts importing both adapters and use cases',
        ],
        answer: 2,
        explanation: 'Use cases are an inner ring and must not depend on frameworks/drivers. The other imports point inward or are the composition root.',
      },
      {
        kind: 'scenario', difficulty: 'advanced',
        prompt: 'A 6-endpoint internal CRUD API with no business rules is being built with entities, use cases, ports, adapters and mappers for every table. What is the best feedback?',
        options: [
          'Perfect — always use full clean architecture',
          'The structure costs more than it buys here; a simple layered design is enough, and you can extract ports later if complexity grows',
          'Remove all layering and put SQL in routes',
          'Add more interfaces for future flexibility',
        ],
        answer: 1,
        explanation: 'Architecture should match domain complexity. Clean architecture pays off with rich rules and multiple adapters; for thin CRUD it is ceremony.',
      },
    ],
    interview: [
      {
        category: 'advanced', kind: 'concept', difficulty: 'advanced', topic: 'Architecture',
        question: 'Explain the dependency rule in clean architecture and how a use case can save to a database without depending on it.',
        shortAnswer: 'Source dependencies may only point inward toward business rules; the use case defines a repository port, an outer adapter implements it with the real database, and the composition root injects that adapter.',
        detailedAnswer: [
          'Runtime flow goes outward (use case calls repository).',
          'Compile-time dependency is inverted: adapter imports the port.',
          'Composition root is the only place that knows concrete classes.',
          'Enables in-memory fakes in tests and swapping infrastructure.',
          'Same principle as DIP at the architecture level.',
        ],
        followUp: 'Where do transactions belong in this model?',
        trap: 'Thinking the rule is about runtime call direction rather than source-code dependencies.',
      },
      {
        category: 'advanced', kind: 'concept', difficulty: 'intermediate', topic: 'Architecture',
        question: 'How does hexagonal (ports and adapters) architecture relate to clean architecture?',
        shortAnswer: 'They share the same core idea — business logic in the centre with ports, and adapters on the outside for UI, databases and services; clean architecture adds explicit rings for entities and use cases.',
        detailedAnswer: [
          'Hexagonal: driving adapters (HTTP, CLI) call into the app; driven adapters (DB, mail) are called by it via ports.',
          'Clean: entities, use cases, adapters, frameworks rings.',
          'Both enforce inward dependencies and testability.',
          'Naming differs more than the principles.',
        ],
        followUp: 'Give an example of a driving and a driven adapter in a Node service.',
        trap: 'Treating them as competing, incompatible architectures.',
      },
    ],
  },
};

export default content;
