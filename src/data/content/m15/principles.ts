import type { ModuleContent } from '../../../types';
import { bullets, code, dedent, flow, interviewTip, note, section, steps, table, text } from '../helpers';

const content: Partial<ModuleContent> = {
  'solid-principles': {
    summary: 'SOLID is five object-oriented design principles — Single responsibility, Open/closed, Liskov substitution, Interface segregation, Dependency inversion — that keep modules small, replaceable and easy to change.',
    topics: ['single responsibility', 'open/closed', 'Liskov substitution', 'interface segregation', 'dependency inversion', 'cohesion', 'coupling'],
    sections: [
      section('introduction', undefined,
        text('Most "this change broke something unrelated" bugs come from code that does too much or depends on too much. SOLID gives five concrete heuristics to avoid that, and they apply to JS modules and functions as much as to classes.'),
      ),
      section('definition', 'The five principles',
        table('SOLID at a glance', ['Letter', 'Principle', 'One-liner', 'Node smell it prevents'], [
          ['S', 'Single Responsibility', 'A module should have one reason to change', '`UserService` that validates, hashes, queries, emails and logs'],
          ['O', 'Open/Closed', 'Open for extension, closed for modification', 'A growing `switch (provider)` in payment code'],
          ['L', 'Liskov Substitution', 'Subtypes must be usable wherever the base type is expected', 'A `ReadOnlyRepo` subclass whose `save()` throws'],
          ['I', 'Interface Segregation', 'Clients should not depend on methods they do not use', 'A 20-method `Storage` interface every adapter must implement'],
          ['D', 'Dependency Inversion', 'Depend on abstractions, not concretions', 'Services that `require(\'pg\')` and `new Pool()` internally'],
        ]),
      ),
      section('why', 'Why they matter',
        bullets(
          'Changes stay local: one feature, one module.',
          'Components can be replaced (new payment provider, new database) without rewrites.',
          'Unit tests become easy because dependencies can be faked.',
          'They are heuristics, not laws — apply them where change is likely.',
        ),
      ),
      section('internals', 'Each principle, violation → fix',
        steps(
          '**S** — split `UserService.register` (validate + hash + insert + email) into a validator, a password hasher, a repository and a mailer; the service only orchestrates.',
          '**O** — replace `if (type === "stripe") … else if (type === "paypal")` with a map/registry of provider objects; adding a provider adds a file, not an `else if`.',
          '**L** — if `Square extends Rectangle` changes the meaning of `setWidth`, code written for rectangles breaks. Prefer composition or separate types.',
          '**I** — split `Storage` into `Reader` and `Writer`; a report generator only needs `Reader`.',
          '**D** — inject `userRepo` into the service; the service depends on "something with `findByEmail`", not on `pg`.',
        ),
      ),
      section('visual', 'Coupling before and after',
        flow(['Before: OrderService → pg, nodemailer, stripe (concretes)', 'After: OrderService → OrderRepo, Mailer, Payments (abstractions)', 'Adapters implement abstractions', 'Composition root wires them'],
          { title: 'Applying S, O and D together' }),
      ),
      section('example', 'SOLID in code',
        code({
          title: 'O: extend by adding, not editing (runnable)',
          code: dedent(`
            const discounts = {
              none: (total) => total,
              percent10: (total) => total * 0.9,
              blackFriday: (total) => Math.max(0, total - 50),
            };

            function checkout(total, kind) {
              const apply = discounts[kind];
              if (!apply) throw new Error('unknown discount ' + kind);
              return apply(total);
            }

            discounts.loyalty = (total) => total - 5; // new rule: no change to checkout()
            console.log(checkout(200, 'percent10'), checkout(200, 'blackFriday'), checkout(200, 'loyalty'));
          `),
          expectedOutput: '180 150 195',
          explanation: [
            '`checkout` is closed for modification; the registry is open for extension.',
            'Each rule is tiny, independently testable (also S).',
          ],
          runnable: true,
        }),
        code({
          title: 'L: the classic violation (runnable)',
          code: dedent(`
            class Rectangle {
              constructor(w, h) { this.w = w; this.h = h; }
              setWidth(w) { this.w = w; }
              setHeight(h) { this.h = h; }
              area() { return this.w * this.h; }
            }
            class Square extends Rectangle {
              setWidth(w) { this.w = this.h = w; }
              setHeight(h) { this.w = this.h = h; }
            }

            function resize(rect) {   // written for Rectangle
              rect.setWidth(5);
              rect.setHeight(4);
              return rect.area();
            }
            console.log(resize(new Rectangle(1, 1)), resize(new Square(1, 1)));
          `),
          expectedOutput: '20 16',
          explanation: [
            '`resize` expects width and height to be independent — Square breaks that contract.',
            'Substituting the subtype silently changes behaviour: a Liskov violation.',
            'Fix: do not model Square as a mutable Rectangle subtype; use separate immutable shapes sharing an `area()` interface.',
          ],
          runnable: true,
        }),
        code({
          title: 'S + D: violation → fix',
          code: dedent(`
            // ❌ one class, five reasons to change, hard-wired dependencies
            class UserService {
              async register(email, password) {
                if (!email.includes('@')) throw new Error('bad email');
                const hash = await require('bcrypt').hash(password, 12);
                const { Pool } = require('pg');
                await new Pool().query('INSERT INTO users(email, hash) VALUES ($1, $2)', [email, hash]);
                await require('nodemailer').createTransport({}).sendMail({ to: email, subject: 'Welcome' });
              }
            }

            // ✅ orchestrates collaborators it receives (S + D)
            class UserService {
              constructor({ validator, hasher, users, mailer }) {
                Object.assign(this, { validator, hasher, users, mailer });
              }
              async register(email, password) {
                this.validator.assertEmail(email);
                const user = await this.users.create({ email, hash: await this.hasher.hash(password) });
                await this.mailer.sendWelcome(user);
                return user;
              }
            }
          `),
          explanation: [
            'Each collaborator has one job and can be faked in tests.',
            'Changing from bcrypt to argon2 touches only the hasher.',
          ],
        }),
        code({
          title: 'I: segregated interfaces (TypeScript)',
          language: 'typescript',
          code: dedent(`
            // ❌ every adapter must implement everything
            interface Storage { get(k: string): Promise<string | null>; put(k: string, v: string): Promise<void>; delete(k: string): Promise<void>; list(prefix: string): Promise<string[]>; }

            // ✅ small role interfaces
            interface Reader { get(k: string): Promise<string | null>; }
            interface Writer { put(k: string, v: string): Promise<void>; }
            class ReportGenerator { constructor(private readonly store: Reader) {} }
          `),
          explanation: ['ReportGenerator can now be given a read-only CDN adapter that has no `put`.'],
        }),
      ),
      section('real-world', 'In a real backend',
        bullets(
          'Payment/notification providers behind a common interface (O + D).',
          'Repository interfaces kept small per use case (I).',
          'Feature modules with one responsibility each (S).',
          'Linting for max file length/complexity flags SRP violations early.',
        ),
      ),
      section('mistakes', 'Common mistakes',
        bullets(
          'Over-applying: an interface and factory for a function that will never change.',
          'Reading SRP as "one method per class" — it is about one *reason to change* (one actor).',
          'Using inheritance for code reuse and breaking LSP; prefer composition.',
        ),
        code({
          title: 'LSP violation via throwing override',
          code: dedent(`
            // ❌ callers of Repository.save now crash
            class ReadOnlyUserRepo extends UserRepo { save() { throw new Error('read only'); } }
            // ✅ model capabilities separately
            class UserReader { findById(id) { /* ... */ } }
            class UserRepo extends UserReader { save(user) { /* ... */ } }
          `),
          explanation: ['A subtype must honour the base contract; narrowing it with throws breaks substitutability.'],
        }),
      ),
      section('interview', 'Interview angle',
        interviewTip('Give each principle with a concrete Node example rather than shape/animal analogies, and mention when *not* to apply them (simple scripts, stable code).'),
      ),
      section('practice', 'Practice',
        text('Take a `NotificationService` with a `switch(channel)` for email/SMS/push. Refactor it so adding Slack requires a new file only, and unit-test it with a fake channel.'),
      ),
      section('summary', 'Summary',
        bullets(
          'S: one reason to change.',
          'O: extend via new code, not edits.',
          'L: subtypes honour the base contract.',
          'I: small, role-specific interfaces.',
          'D: depend on abstractions; inject concretions.',
        ),
      ),
    ],
    revisionNotes: [
      'SRP = one actor/reason to change, not one method.',
      'OCP via registries/strategies instead of growing switch statements.',
      'LSP: Square/Rectangle; throwing overrides violate it.',
      'ISP: split fat interfaces into roles.',
      'DIP: high-level policy depends on abstractions; details implement them.',
      'Heuristics — apply where change is likely.',
    ],
    quiz: [
      {
        kind: 'predict-output', difficulty: 'intermediate',
        prompt: 'What does this print, and which principle does it illustrate?',
        code: "class Rect { constructor(){ this.w=1; this.h=1; } setW(w){ this.w=w; } setH(h){ this.h=h; } area(){ return this.w*this.h; } }\nclass Sq extends Rect { setW(w){ this.w=this.h=w; } setH(h){ this.w=this.h=h; } }\nconst s = new Sq(); s.setW(3); s.setH(2);\nconsole.log(s.area());",
        options: ['6 — Open/closed', '4 — Liskov substitution', '9 — Interface segregation', '6 — Single responsibility'],
        answer: 1,
        explanation: 'setH(2) also sets w to 2, so area is 4 instead of the 6 a Rect user expects — a Liskov violation.',
      },
      {
        kind: 'scenario', difficulty: 'intermediate',
        prompt: 'Every new payment provider requires editing a 200-line `switch` inside `PaymentService.charge`. Which principle is violated and what is the fix?',
        options: [
          'Liskov — use inheritance',
          'Open/closed — define a provider interface and register implementations so new providers are added without editing charge()',
          'Interface segregation — split charge() into two methods',
          'None — switch statements are always fine',
        ],
        answer: 1,
        explanation: 'The service should be closed for modification. A strategy registry lets you extend with new providers.',
      },
      {
        kind: 'mcq', difficulty: 'beginner',
        prompt: 'What does the "S" in SOLID mean?',
        options: ['Stateless services', 'Single responsibility', 'Separation of storage', 'Singleton'],
        answer: 1,
        explanation: 'Single Responsibility Principle: a module should have one reason to change.',
      },
    ],
    interview: [
      {
        category: 'advanced', kind: 'concept', difficulty: 'intermediate', topic: 'Design principles',
        question: 'Explain the SOLID principles with examples from a Node.js backend.',
        shortAnswer: 'Single responsibility (split validation, persistence and email), open/closed (provider registries instead of switches), Liskov (subtypes keep base contracts), interface segregation (small role interfaces), dependency inversion (services depend on injected abstractions).',
        detailedAnswer: [
          'S: `UserService` orchestrates; hasher, repo and mailer each do one thing.',
          'O: add a `PaypalProvider` file rather than editing `PaymentService`.',
          'L: a read-only repo that throws on `save` breaks callers.',
          'I: `Reader`/`Writer` instead of one big `Storage`.',
          'D: inject `userRepo`; do not `new Pool()` inside the service.',
        ],
        followUp: 'Which principle do you find most often violated in Express codebases?',
        trap: 'Reciting definitions without concrete examples, or defining SRP as "a class should have one method".',
      },
      {
        category: 'advanced', kind: 'concept', difficulty: 'advanced', topic: 'Design principles',
        question: 'Can you over-apply SOLID? What does that look like?',
        shortAnswer: 'Yes — interfaces, factories and layers for code that never varies add indirection without benefit; apply the principles where change or testing pressure actually exists.',
        detailedAnswer: [
          'Speculative abstractions: one implementation forever behind an interface.',
          'Class explosions: dozens of single-method classes for a simple flow.',
          'Harder navigation and debugging.',
          'Rule of three: abstract after a second or third variation appears.',
          'In JS, functions and plain objects often satisfy the principles without classes.',
        ],
        followUp: 'How do you decide when an abstraction is justified?',
        trap: 'Claiming SOLID always improves code regardless of context.',
      },
    ],
  },

  'dependency-injection': {
    summary: 'Dependency injection means a component receives its collaborators from outside (usually through the constructor) instead of creating them, with all wiring done in one composition root — by hand or with a container such as awilix, tsyringe or InversifyJS.',
    topics: ['constructor injection', 'composition root', 'manual DI', 'DI container', 'awilix', 'tsyringe', 'InversifyJS', 'lifetimes', 'testing with fakes'],
    sections: [
      section('introduction', undefined,
        text('If `OrderService` does `new PostgresOrderRepository()` itself, you cannot test it without Postgres or reuse it with another store. Dependency injection moves that decision out of the class.'),
      ),
      section('definition', 'Forms of injection',
        table('Injection styles', ['Style', 'How', 'Notes'], [
          ['Constructor injection', '`new OrderService({ orders, payments })`', 'Preferred: dependencies explicit and required'],
          ['Function/parameter injection', '`makeHandler({ db })` returns a function', 'Idiomatic in functional JS'],
          ['Property/setter injection', '`service.mailer = mailer`', 'Optional deps; easy to forget'],
          ['Module mocking', '`jest.mock(\'./db\')`', 'Not DI — patches the module system; useful but couples tests to file paths'],
        ]),
      ),
      section('why', 'Why use DI',
        bullets(
          'Tests pass fakes/in-memory implementations — fast and deterministic.',
          'Swap implementations per environment (real SMTP vs console mailer).',
          'Dependencies are visible in the constructor signature.',
          'Lifetimes (singleton pool, per-request context) are managed in one place.',
        ),
      ),
      section('internals', 'Composition root and lifetimes',
        steps(
          'The **composition root** (e.g. `src/main.js` / `container.js`) is the only place that knows concrete classes.',
          'It builds the graph bottom-up: config → pool → repositories → services → controllers → app.',
          'Lifetimes: **singleton** (one DB pool per process), **scoped** (one per request, e.g. with the current user/transaction), **transient** (new each time).',
          'Containers automate resolution by name (awilix) or by decorators/metadata (tsyringe, InversifyJS — need `reflect-metadata` and TS decorator settings).',
        ),
        table('Manual DI vs container', ['', 'Manual (pure DI)', 'Container (awilix/tsyringe/InversifyJS — third-party)'], [
          ['Setup', 'Plain code', 'Library + registration'],
          ['Visibility', 'Explicit; "go to definition" works', 'More magic; resolution at runtime'],
          ['Errors', 'Compile/startup time', 'Runtime "cannot resolve X"'],
          ['Scales to', 'Small–medium apps comfortably', 'Large graphs, scoped lifetimes, plugins'],
        ]),
      ),
      section('visual', 'Wiring',
        flow(['config', 'pg Pool (singleton)', 'UserRepository(pool)', 'UserService(repo, mailer)', 'UserController(service)', 'Express routes'],
          { title: 'Composition root builds the graph bottom-up', direction: 'horizontal' }),
      ),
      section('example', 'Constructor injection and a tiny container',
        code({
          title: 'Service with injected collaborators + test fakes (runnable)',
          code: dedent(`
            class UserService {
              constructor({ userRepo, mailer, clock }) {
                this.userRepo = userRepo;
                this.mailer = mailer;
                this.clock = clock;
              }
              async register(email) {
                if (await this.userRepo.findByEmail(email)) throw new Error('email taken');
                const user = { email, createdAt: this.clock.now() };
                await this.userRepo.save(user);
                await this.mailer.send(email, 'Welcome!');
                return user;
              }
            }

            // In a test: fakes instead of Postgres/SMTP/real time
            const sent = [];
            const userRepo = {
              users: [],
              async findByEmail(e) { return this.users.find((u) => u.email === e) ?? null; },
              async save(u) { this.users.push(u); },
            };
            const service = new UserService({
              userRepo,
              mailer: { async send(to, subject) { sent.push(to + ':' + subject); } },
              clock: { now: () => '2025-01-01T00:00:00Z' },
            });

            (async () => {
              console.log(JSON.stringify(await service.register('ada@example.com')));
              console.log(sent);
              await service.register('ada@example.com').catch((e) => console.log(e.message));
            })();
          `),
          expectedOutput: '{"email":"ada@example.com","createdAt":"2025-01-01T00:00:00Z"}\n[ \'ada@example.com:Welcome!\' ]\nemail taken',
          explanation: [
            'Injecting a `clock` makes time deterministic in tests.',
            'No module mocking needed — the test just passes objects.',
            'Production wiring passes a Postgres repo, SMTP mailer and `{ now: () => new Date().toISOString() }`.',
          ],
          runnable: true,
        }),
        code({
          title: 'A minimal DI container (runnable)',
          code: dedent(`
            class Container {
              constructor() { this.providers = new Map(); this.instances = new Map(); }
              register(name, factory, { singleton = true } = {}) {
                this.providers.set(name, { factory, singleton });
                return this;
              }
              resolve(name) {
                const p = this.providers.get(name);
                if (!p) throw new Error('No provider for ' + name);
                if (!p.singleton) return p.factory(this);
                if (!this.instances.has(name)) this.instances.set(name, p.factory(this));
                return this.instances.get(name);
              }
            }

            const c = new Container()
              .register('config', () => ({ dbUrl: 'postgres://db' }))
              .register('db', (c) => ({ url: c.resolve('config').dbUrl }))
              .register('userService', (c) => ({ db: c.resolve('db') }), { singleton: false });

            const a = c.resolve('userService');
            const b = c.resolve('userService');
            console.log(a === b, a.db === b.db, a.db.url);
            try { c.resolve('mailer'); } catch (e) { console.log(e.message); }
          `),
          expectedOutput: 'false true postgres://db\nNo provider for mailer',
          explanation: [
            '`userService` is transient (new each resolve) but shares the singleton `db`.',
            'Missing registrations fail at resolve time — one reason to resolve the root graph at startup.',
            'Real containers add scopes, auto-wiring and disposal.',
          ],
          runnable: true,
        }),
        code({
          title: 'awilix (third-party) equivalent',
          code: dedent(`
            const { createContainer, asClass, asValue, asFunction, Lifetime } = require('awilix');

            const container = createContainer({ injectionMode: 'PROXY' });
            container.register({
              config: asValue(config),
              pool: asFunction(({ config }) => new Pool({ connectionString: config.dbUrl })).singleton()
                .disposer((pool) => pool.end()),
              userRepo: asClass(UserRepository).singleton(),
              mailer: asClass(SmtpMailer).singleton(),
              clock: asValue({ now: () => new Date().toISOString() }),
              userService: asClass(UserService, { lifetime: Lifetime.SCOPED }),
            });

            // per request scope (awilix-express offers middleware for this)
            app.use((req, res, next) => { req.scope = container.createScope(); next(); });
          `),
          explanation: [
            'PROXY mode passes a `{ userRepo, mailer, clock }` object — matching our constructor.',
            'Scoped lifetimes give each request its own instance (e.g. with the current user).',
            '`.disposer` closes the pool on `container.dispose()` during shutdown.',
          ],
        }),
      ),
      section('real-world', 'In a real backend',
        bullets(
          'NestJS (third-party framework) has DI built in via decorators and modules.',
          'Express apps commonly use manual DI in `app.js` or awilix for larger codebases.',
          'Integration tests build the real container but override one registration (e.g. a fake payment gateway).',
        ),
      ),
      section('mistakes', 'Common mistakes',
        code({
          title: 'Service locator inside the class',
          code: dedent(`
            // ❌ hidden dependency: the class reaches into a global container
            class OrderService { place() { const repo = container.resolve('orderRepo'); } }
            // ✅ declare it; let the root provide it
            class OrderService { constructor({ orderRepo }) { this.orderRepo = orderRepo; } }
          `),
          explanation: ['A service locator hides dependencies and makes tests depend on global state.'],
        }),
        bullets(
          'Constructors with 12 dependencies — a sign the class violates SRP.',
          'Injecting a scoped (per-request) object into a singleton, leaking one user\'s data into others.',
          'Adding a container to a 10-file app.',
        ),
      ),
      section('interview', 'Interview angle',
        interviewTip('Explain constructor injection, the composition root, lifetimes, and the trade-off between manual DI and containers. Mention that `jest.mock` is module patching, not DI.'),
      ),
      section('practice', 'Practice',
        text('Convert a service that `require`s its DB and mailer into constructor injection, add a composition root, and write a unit test with fakes and an injected clock.'),
      ),
      section('summary', 'Summary',
        bullets(
          'Receive dependencies; do not construct them.',
          'Constructor injection is the default.',
          'One composition root knows concrete classes.',
          'Manage lifetimes: singleton, scoped, transient.',
          'Containers are optional tools (third-party).',
        ),
      ),
    ],
    revisionNotes: [
      'DI = dependencies passed in (constructor, params).',
      'Composition root: the only place with `new ConcreteThing()`.',
      'Lifetimes: singleton (pool), scoped (request), transient.',
      'Never inject scoped into singleton.',
      'awilix (name-based), tsyringe/InversifyJS (decorators + reflect-metadata).',
      'Service locator ≠ DI.',
    ],
    quiz: [
      {
        kind: 'predict-output', difficulty: 'intermediate',
        prompt: 'What does this print?',
        code: "const cache = new Map();\nconst singleton = (k, f) => { if (!cache.has(k)) cache.set(k, f()); return cache.get(k); };\nconst a = singleton('db', () => ({}));\nconst b = singleton('db', () => ({}));\nconst t1 = (() => ({}))(), t2 = (() => ({}))();\nconsole.log(a === b, t1 === t2);",
        options: ['true true', 'false false', 'true false', 'false true'],
        answer: 2,
        explanation: 'The singleton factory runs once and is cached; transient factories create a new object every time.',
      },
      {
        kind: 'scenario', difficulty: 'advanced',
        prompt: 'A singleton `ReportService` receives a per-request `currentUser` object at construction. Users start seeing each other\'s reports. What went wrong?',
        options: [
          'The database is caching queries',
          'A scoped dependency was captured by a singleton, so the first request\'s user is reused for everyone',
          'Constructor injection is unsafe in Node',
          'The container is too slow',
        ],
        answer: 1,
        explanation: 'Lifetime mismatch: a longer-lived object holding a shorter-lived one keeps stale data. Make ReportService scoped or pass the user per call.',
      },
    ],
    interview: [
      {
        category: 'advanced', kind: 'concept', difficulty: 'intermediate', topic: 'Dependency injection',
        question: 'What is dependency injection and why is it useful in Node.js?',
        shortAnswer: 'A component receives its collaborators from outside rather than creating or requiring them, which makes dependencies explicit, lets tests pass fakes, and allows swapping implementations without changing the component.',
        detailedAnswer: [
          'Constructor or factory-function parameters carry dependencies.',
          'Composition root wires concrete implementations once.',
          'Tests inject in-memory fakes and a fixed clock.',
          'Avoids reliance on module-mocking tools.',
        ],
        followUp: 'Do you need a DI container to do DI?',
        trap: 'Equating DI with using a framework or container.',
      },
      {
        category: 'advanced', kind: 'concept', difficulty: 'advanced', topic: 'Dependency injection',
        question: 'Compare manual DI with DI containers like awilix, tsyringe or InversifyJS. What are lifetimes and what goes wrong with them?',
        shortAnswer: 'Manual DI wires the graph in plain code — explicit and checked early; containers automate resolution and lifetimes for large graphs at the cost of runtime magic. Lifetimes (singleton, scoped, transient) go wrong when a longer-lived object captures a shorter-lived one.',
        detailedAnswer: [
          'Manual: easy to read, no library, errors surface at startup.',
          'awilix: name-based resolution, scopes, disposers; no decorators.',
          'tsyringe/InversifyJS: decorator metadata, needs reflect-metadata and TS config.',
          'Captive dependency: scoped request context inside a singleton → data leaks across requests.',
          'Resolve the root graph at startup to catch missing registrations early.',
        ],
        followUp: 'How would you implement request-scoped dependencies without a container?',
        trap: 'Thinking containers are required for testability.',
      },
    ],
  },

  'dependency-inversion': {
    summary: 'The Dependency Inversion Principle says high-level policy and low-level details should both depend on abstractions owned by the policy; it is a design principle, DI is a technique to achieve it, and IoC is the broader idea that a framework or container controls the flow.',
    topics: ['DIP', 'abstractions', 'high-level vs low-level modules', 'interface ownership', 'IoC', 'DI vs DIP vs IoC', 'ports'],
    sections: [
      section('introduction', undefined,
        text('In naive code, business logic imports the database driver, so business logic changes when the driver changes. DIP flips that arrow: the database code adapts to an interface defined by the business logic.'),
      ),
      section('definition', 'The principle',
        bullets(
          '1. High-level modules should not depend on low-level modules. Both should depend on abstractions.',
          '2. Abstractions should not depend on details. Details should depend on abstractions.',
          'The abstraction is **owned by the high-level module** — it describes what the policy needs (`OrderRepository.save`), not what the database offers.',
        ),
        table('DIP vs DI vs IoC', ['Term', 'What it is', 'Example'], [
          ['DIP (Dependency Inversion Principle)', 'A design *principle* about dependency direction', '`OrderService` depends on `OrderRepository` interface; `PgOrderRepository` implements it'],
          ['DI (Dependency Injection)', 'A *technique* for supplying dependencies from outside', '`new OrderService({ orders: new PgOrderRepository(pool) })`'],
          ['IoC (Inversion of Control)', 'A broad *idea*: the framework calls your code, not vice versa', 'Express calls your middleware; a container constructs your classes'],
        ]),
      ),
      section('why', 'Why invert',
        bullets(
          'Business rules stay stable when infrastructure changes.',
          'Multiple implementations (Postgres, in-memory, HTTP API) plug into the same policy.',
          'You can build and test the core before choosing a database.',
        ),
      ),
      section('internals', 'What actually gets inverted',
        steps(
          'Without DIP: `OrderService` → imports → `PgOrderRepository` → imports → `pg`. Source and runtime arrows point the same way.',
          'With DIP: `OrderService` → depends on → `OrderRepository` (port). `PgOrderRepository` → implements → `OrderRepository`.',
          'Runtime calls still go service → Postgres, but the **source-code** dependency of the detail now points toward the policy.',
          'In JavaScript there is no `interface` keyword; the abstraction is a documented shape (duck typing), a JSDoc typedef, or a TS interface.',
          'DI (often in a composition root) is how the concrete detail reaches the policy at runtime.',
        ),
        note('You can use DI without DIP (injecting a concrete `PgPool` whose API leaks everywhere), and DIP without a container (manual wiring).'),
      ),
      section('visual', 'Inverted arrows',
        flow(['OrderNotifier (policy)', 'Channel abstraction: send(to, msg)', 'EmailChannel / SmsChannel (details) implement it'],
          { title: 'Both sides depend on the abstraction', direction: 'horizontal' }),
      ),
      section('example', 'Policy owns the abstraction',
        code({
          title: 'Swappable details behind a policy-owned interface (runnable)',
          code: dedent(`
            // High-level policy: knows only "a channel has send(to, message)"
            class OrderNotifier {
              constructor(channel) { this.channel = channel; }
              orderShipped(order) {
                return this.channel.send(order.customer, 'Order ' + order.id + ' shipped');
              }
            }

            // Low-level details adapt to the policy's abstraction
            class EmailChannel { send(to, msg) { return 'email -> ' + to + ': ' + msg; } }
            class SmsChannel { send(to, msg) { return 'sms -> ' + to + ': ' + msg.slice(0, 20); } }

            const order = { id: 7, customer: 'ada' };
            for (const channel of [new EmailChannel(), new SmsChannel()]) {
              console.log(new OrderNotifier(channel).orderShipped(order));
            }
          `),
          expectedOutput: 'email -> ada: Order 7 shipped\nsms -> ada: Order 7 shipped',
          explanation: [
            '`OrderNotifier` never changes when channels are added.',
            'Each channel conforms to the shape the policy defined.',
            'The SMS channel truncates to 20 chars — the message is short enough to be unaffected.',
          ],
          runnable: true,
        }),
        code({
          title: 'Violation → fix',
          language: 'typescript',
          code: dedent(`
            // ❌ policy depends on a detail (and its API shape)
            import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
            export class InvoiceService {
              private s3 = new S3Client({});
              async archive(inv: Invoice) {
                await this.s3.send(new PutObjectCommand({ Bucket: 'invoices', Key: inv.id, Body: inv.pdf }));
              }
            }

            // ✅ policy owns the abstraction; detail implements it
            export interface InvoiceArchive { store(id: string, pdf: Buffer): Promise<void>; }
            export class InvoiceService {
              constructor(private readonly archive: InvoiceArchive) {}
              archiveInvoice(inv: Invoice) { return this.archive.store(inv.id, inv.pdf); }
            }
            export class S3InvoiceArchive implements InvoiceArchive {
              constructor(private readonly s3: S3Client, private readonly bucket: string) {}
              async store(id: string, pdf: Buffer) {
                await this.s3.send(new PutObjectCommand({ Bucket: this.bucket, Key: id, Body: pdf }));
              }
            }
          `),
          explanation: [
            'The interface speaks the domain\'s language (`store` an invoice), not S3\'s (`PutObjectCommand`).',
            'A `LocalDiskArchive` or in-memory fake can replace S3 in tests and dev.',
          ],
        }),
      ),
      section('real-world', 'In a real backend',
        bullets(
          'Ports for payments, email, storage, search — each with a production adapter and a fake.',
          'Shared libraries define small interfaces their consumers implement (e.g. a logger interface instead of hard-coding pino).',
          'Express itself is IoC: you register handlers; Express decides when to call them.',
        ),
      ),
      section('mistakes', 'Common mistakes',
        bullets(
          'Abstractions that mirror the vendor API (`S3Like` with `putObject`) — the policy still depends on vendor concepts.',
          'Defining the interface next to the implementation, owned by the detail.',
          'Calling any injection "DIP" even when the concrete type leaks through.',
        ),
        code({
          title: 'Leaky abstraction',
          code: dedent(`
            // ❌ "abstraction" exposes SQL concepts to the service
            orders.query('SELECT * FROM orders WHERE status = $1', ['open']);
            // ✅ intention-revealing method owned by the domain
            orders.findOpen();
          `),
          explanation: ['If the abstraction leaks the detail, swapping the detail still breaks the policy.'],
        }),
      ),
      section('interview', 'Interview angle',
        interviewTip('Interviewers love "what is the difference between DIP, DI and IoC?" — answer: principle vs technique vs broad control-flow idea, with one example each.'),
      ),
      section('practice', 'Practice',
        text('Define a `Clock` and `IdGenerator` abstraction owned by an `OrderService`, implement a real and a fake version of each, and show the service is fully deterministic in tests.'),
      ),
      section('summary', 'Summary',
        bullets(
          'High- and low-level modules both depend on abstractions.',
          'The policy owns the abstraction, in domain language.',
          'DIP = principle; DI = technique; IoC = broader idea.',
          'Runtime calls are unchanged; source dependencies are inverted.',
        ),
      ),
    ],
    revisionNotes: [
      'DIP: details depend on abstractions owned by policy.',
      'DI: pass dependencies in. IoC: framework/container controls flow.',
      'DI without DIP is possible (injecting leaky concretes).',
      'Abstractions in domain language, not vendor API.',
      'Express middleware/handlers are an IoC example.',
    ],
    quiz: [
      {
        kind: 'mcq', difficulty: 'intermediate',
        prompt: 'Which statement best distinguishes DIP from DI?',
        options: [
          'They are synonyms',
          'DIP is a principle about which way source dependencies point; DI is a technique for supplying dependencies from outside',
          'DI is a principle; DIP is a library',
          'DIP only applies to TypeScript',
        ],
        answer: 1,
        explanation: 'DIP says depend on abstractions owned by policy; DI is one way to wire concrete implementations into that policy.',
      },
      {
        kind: 'find-bug', difficulty: 'advanced',
        prompt: 'The team says this follows DIP. What is wrong?',
        code: "// owned by the infra package\ninterface PgLike { query(sql: string, params: unknown[]): Promise<{ rows: any[] }> }\nclass BillingService {\n  constructor(private db: PgLike) {}\n  overdue() { return this.db.query('SELECT * FROM invoices WHERE due < now()', []); }\n}",
        options: [
          'Nothing — it uses an interface',
          'The abstraction mirrors the database API and is owned by the infrastructure, so the policy still depends on SQL details',
          'BillingService should extend PgLike',
          'Interfaces cannot be injected',
        ],
        answer: 1,
        explanation: 'DIP requires an abstraction in the policy\'s terms (e.g. InvoiceRepository.findOverdue()). An interface shaped like pg is DI of a detail, not inversion.',
      },
    ],
    interview: [
      {
        category: 'advanced', kind: 'concept', difficulty: 'advanced', topic: 'Design principles',
        question: 'What is the difference between Dependency Inversion, Dependency Injection and Inversion of Control?',
        shortAnswer: 'Dependency Inversion is the principle that policy and details depend on abstractions owned by the policy; Dependency Injection is the technique of passing dependencies in from outside; Inversion of Control is the broader idea that a framework or container, not your code, controls the flow and object creation.',
        detailedAnswer: [
          'DIP: about source-code dependency direction and interface ownership.',
          'DI: constructor/parameter injection, often in a composition root.',
          'IoC: Express calling your handlers, a container constructing classes, template-method hooks.',
          'DI is one form of IoC and a common way to realise DIP.',
          'You can have DI without DIP if the injected type is a leaky concrete.',
        ],
        followUp: 'Show how Express middleware demonstrates IoC.',
        trap: 'Using the three terms interchangeably.',
      },
    ],
  },
};

export default content;
