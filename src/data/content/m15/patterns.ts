import type { ModuleContent } from '../../../types';
import { bullets, code, dedent, diagram, flow, interviewTip, note, section, steps, table, text, warn } from '../helpers';

const content: Partial<ModuleContent> = {
  'design-patterns': {
    summary: 'Design patterns are named, reusable solutions to recurring design problems, grouped into creational, structural and behavioral families; in Node many appear natively (module singletons, EventEmitter observers, stream pipelines, middleware chains).',
    topics: ['Gang of Four', 'creational patterns', 'structural patterns', 'behavioral patterns', 'adapter', 'decorator', 'facade', 'proxy', 'middleware chain'],
    sections: [
      section('introduction', undefined,
        text('Patterns give a shared vocabulary: saying "wrap it in an adapter" or "use a strategy" communicates a whole design in two words. They are tools for specific problems, not goals in themselves.'),
      ),
      section('definition', 'The three families',
        table('Patterns you meet in Node backends', ['Family', 'Pattern', 'Problem it solves', 'Node example'], [
          ['Creational', 'Factory', 'Choose/construct the right implementation', '`createPaymentGateway(type)`, `http.createServer()`'],
          ['Creational', 'Singleton', 'Exactly one shared instance', 'Module exporting a DB pool (module cache)'],
          ['Creational', 'Builder', 'Construct complex objects step by step', 'Knex/Prisma query builders'],
          ['Structural', 'Adapter', 'Make an incompatible interface fit', 'Wrapping a callback SDK into a promise-based port; `util.promisify`'],
          ['Structural', 'Decorator', 'Add behaviour without changing the object', 'Retry/logging/caching wrappers'],
          ['Structural', 'Facade', 'Simple interface over a complex subsystem', 'A `storage` module hiding S3 multipart details'],
          ['Structural', 'Proxy', 'Control access to an object', 'Lazy clients, caching proxies, JS `Proxy`'],
          ['Behavioral', 'Strategy', 'Swap algorithms at runtime', 'Payment/notification providers, passport strategies'],
          ['Behavioral', 'Observer', 'Notify subscribers of events', '`EventEmitter`'],
          ['Behavioral', 'Chain of responsibility', 'Pass a request along handlers', 'Express/Koa middleware'],
          ['Behavioral', 'Iterator', 'Traverse without exposing internals', 'Async iterators over streams/paginated APIs'],
          ['Behavioral', 'Command', 'Encapsulate a request as an object', 'Job payloads in a queue'],
        ]),
      ),
      section('why', 'Why learn them',
        bullets(
          'Communication: reviewers instantly know the intent.',
          'Proven trade-offs: you inherit decades of experience.',
          'Recognition: you see the pattern in libraries (Express = chain of responsibility) and use them better.',
        ),
        warn('Patterns applied without the problem they solve add indirection. JavaScript\'s first-class functions often make a pattern a one-liner (a strategy is just a function).'),
      ),
      section('internals', 'How to pick one',
        steps(
          'Name the force: "I need to vary *how* something is done" → Strategy. "Vary *what* gets created" → Factory. "Incompatible interface" → Adapter. "Add cross-cutting behaviour" → Decorator. "React to something happening" → Observer.',
          'Check whether a plain function or object already solves it.',
          'Implement the smallest version; extract more structure only when a second variation appears.',
        ),
      ),
      section('visual', 'Chain of responsibility in Express',
        diagram('middleware-pipeline', 'Each middleware handles the request or passes it on with next().'),
      ),
      section('example', 'Structural patterns in plain JS',
        code({
          title: 'Decorator: add logging without touching the function (runnable)',
          code: dedent(`
            const withLogging = (fn, name) => (...args) => {
              console.log('->', name, args.join(','));
              const result = fn(...args);
              console.log('<-', name, result);
              return result;
            };

            const add = withLogging((a, b) => a + b, 'add');
            add(2, 3);
          `),
          expectedOutput: '-> add 2,3\n<- add 5',
          explanation: [
            'The original function is unchanged; behaviour is layered on top.',
            'Same idea powers retry, caching and timing wrappers.',
          ],
          runnable: true,
        }),
        code({
          title: 'Adapter: callback SDK → promise-based port (runnable)',
          code: dedent(`
            // third-party style SDK with a callback API
            const legacySms = {
              sendText(number, body, cb) { setTimeout(() => cb(null, { sid: 'SM1', number }), 5); },
            };

            // our port: async send(to, message) → message id
            class LegacySmsAdapter {
              constructor(sdk) { this.sdk = sdk; }
              send(to, message) {
                return new Promise((resolve, reject) =>
                  this.sdk.sendText(to, message, (err, res) => (err ? reject(err) : resolve(res.sid))));
              }
            }

            new LegacySmsAdapter(legacySms).send('+441234', 'hi').then((id) => console.log('sent', id));
          `),
          expectedOutput: 'sent SM1',
          explanation: [
            'The rest of the app only knows `send(to, message)`.',
            'Replacing the vendor means writing another adapter, nothing else.',
            '`util.promisify` is Node\'s built-in adapter for error-first callbacks.',
          ],
          runnable: true,
        }),
      ),
      section('real-world', 'In a real backend',
        bullets(
          'Facade: `billing.chargeCustomer()` hiding the provider SDK, retries and idempotency keys.',
          'Proxy: a caching proxy in front of a slow HTTP client.',
          'Command: each BullMQ job is a serialised command with a handler.',
        ),
      ),
      section('mistakes', 'Common mistakes',
        bullets(
          'Pattern-first design ("let\'s use the visitor pattern") instead of problem-first.',
          'Java-style class hierarchies where a function map would do.',
          'Confusing Decorator (adds behaviour, same interface) with Adapter (changes interface).',
        ),
        code({
          title: 'Over-engineered vs idiomatic strategy',
          code: dedent(`
            // ❌ abstract class + subclass per algorithm for two lines of logic
            class ShippingStrategy { cost() { throw new Error('abstract'); } }
            class Standard extends ShippingStrategy { cost(w) { return 5 + w; } }
            // ✅ functions are first-class
            const shipping = { standard: (w) => 5 + w, express: (w) => 15 + 2 * w };
          `),
          explanation: ['In JS the pattern is the idea; the implementation can be tiny.'],
        }),
      ),
      section('interview', 'Interview angle',
        interviewTip('Pick 2–3 patterns and show where Node itself uses them: EventEmitter (observer), middleware (chain of responsibility), module cache (singleton), `util.promisify` (adapter).'),
      ),
      section('practice', 'Practice',
        text('Write a `withRetry(fn, { retries })` decorator for async functions and a `withCache(fn, ttlMs)` decorator, and compose them around a fake HTTP call.'),
      ),
      section('summary', 'Summary',
        bullets(
          'Creational: how objects are made. Structural: how they are composed. Behavioral: how they interact.',
          'Node uses many natively: observer, chain, singleton, adapter, iterator.',
          'Solve the problem first; name the pattern second.',
          'Functions make many patterns lightweight in JS.',
        ),
      ),
    ],
    revisionNotes: [
      'Creational: factory, singleton, builder. Structural: adapter, decorator, facade, proxy. Behavioral: strategy, observer, chain, command, iterator.',
      'Express middleware = chain of responsibility; EventEmitter = observer.',
      'Adapter changes interface; decorator keeps it and adds behaviour.',
      'util.promisify is an adapter.',
    ],
    quiz: [
      {
        kind: 'mcq', difficulty: 'beginner',
        prompt: 'Express middleware calling `next()` to pass control is an example of which pattern?',
        options: ['Singleton', 'Chain of responsibility', 'Factory', 'Builder'],
        answer: 1,
        explanation: 'Each handler either handles the request or passes it along the chain.',
      },
      {
        kind: 'mcq', difficulty: 'intermediate',
        prompt: 'You wrap a vendor SDK with callback methods so your code can call `await notifier.send(to, msg)`. Which pattern is this?',
        options: ['Decorator', 'Observer', 'Adapter', 'Singleton'],
        answer: 2,
        explanation: 'An adapter converts one interface into another. A decorator would keep the same interface and add behaviour.',
      },
      {
        kind: 'predict-output', difficulty: 'intermediate',
        prompt: 'What does this print?',
        code: "const twice = (fn) => (x) => fn(fn(x));\nconst inc = (x) => x + 1;\nconsole.log(twice(twice(inc))(0));",
        options: ['2', '4', '3', '1'],
        answer: 1,
        explanation: 'twice(inc) adds 2; twice of that adds 4. Decorators compose.',
      },
    ],
    interview: [
      {
        category: 'advanced', kind: 'concept', difficulty: 'beginner', topic: 'Design patterns',
        question: 'What are the three categories of classic design patterns? Give a Node.js example of each.',
        shortAnswer: 'Creational (how objects are created, e.g. a factory or the module-cache singleton), structural (how objects are composed, e.g. an adapter like util.promisify), and behavioral (how objects interact, e.g. EventEmitter as observer).',
        detailedAnswer: [
          'Creational: factory, singleton, builder (query builders).',
          'Structural: adapter, decorator, facade, proxy.',
          'Behavioral: strategy, observer, chain of responsibility (middleware), iterator, command.',
          'Patterns are vocabulary for recurring problems.',
        ],
        followUp: 'Which pattern does Express middleware implement?',
        trap: 'Listing pattern names without examples or problems they solve.',
      },
      {
        category: 'advanced', kind: 'concept', difficulty: 'advanced', topic: 'Design patterns',
        question: 'What is the difference between the adapter, decorator, facade and proxy patterns?',
        shortAnswer: 'Adapter converts an interface into another the client expects; decorator keeps the interface and adds behaviour; facade offers a simpler interface over a whole subsystem; proxy keeps the interface and controls access (lazy loading, caching, auth).',
        detailedAnswer: [
          'Adapter: callback SDK → promise port.',
          'Decorator: `withRetry(fetchUser)` — same signature, extra behaviour, stackable.',
          'Facade: `storage.upload(file)` hiding multipart S3 calls.',
          'Proxy: caching or lazy client with identical API; JS `Proxy` object.',
          'Decorator and proxy look alike structurally; intent differs (add behaviour vs control access).',
        ],
        followUp: 'How would you implement a caching proxy with the JavaScript Proxy object?',
        trap: 'Calling every wrapper an "adapter".',
      },
    ],
  },

  'repository-pattern': {
    summary: 'The repository pattern presents persistence as a collection-like interface in domain terms (`findActiveByDomain`, `add`), hiding queries and ORM details so domain and service code do not know how data is stored.',
    topics: ['repository', 'collection-like interface', 'domain mapping', 'persistence ignorance', 'unit of work', 'in-memory repository', 'testability'],
    sections: [
      section('introduction', undefined,
        text('Module 9 showed the practical side — writing a Postgres/Mongo repository. Here we look at it as a **design pattern**: what the abstraction promises, who owns it, and how it supports clean architecture and testing.'),
      ),
      section('definition', 'What a repository is',
        bullets(
          'A mediator between the domain and data mapping layers that acts like an **in-memory collection of domain objects**.',
          'Methods use domain language: `findById`, `findOverdueInvoices`, `add`, `remove` — not `query(sql)`.',
          'Usually one repository per **aggregate root** (e.g. `OrderRepository` manages orders and their line items).',
          'Returns domain objects or plain data, never raw rows/cursors/ORM query builders.',
        ),
        table('Repository vs DAO vs ORM', ['', 'Repository', 'DAO', 'ORM'], [
          ['Speaks', 'Domain language', 'Table/CRUD language', 'Object-relational mapping API'],
          ['Granularity', 'Aggregate', 'Table', 'Whole database'],
          ['Owned by', 'Domain (interface)', 'Data layer', 'Library'],
          ['Example', '`orders.findOpenForCustomer(id)`', '`orderDao.selectByCustomerId(id)`', '`prisma.order.findMany({...})`'],
        ]),
      ),
      section('why', 'Why use it',
        bullets(
          '**Persistence ignorance**: services do not care if data lives in Postgres, Mongo or an API.',
          '**Testability**: an in-memory implementation makes service tests instant.',
          '**Single place for queries**: indexes, N+1 fixes and caching live in one file per aggregate.',
          '**DIP**: the interface belongs to the domain; the database implementation is a detail.',
        ),
      ),
      section('internals', 'Design rules',
        steps(
          'Define the interface from the use cases\' needs (not from the table columns).',
          'Map storage representation ↔ domain object inside the repository (snake_case rows → camelCase entity).',
          'Return copies or immutable objects so callers cannot mutate internal state accidentally.',
          'Transactions: either pass a transaction/unit-of-work object into repository methods, or let a unit of work coordinate several repositories.',
          'Avoid generic `findWhere(anyFilter)` that leaks query semantics; add intention-revealing methods.',
        ),
        note('Wrapping an ORM that already gives you a repository-like API (e.g. Prisma) in another generic repository adds little. The pattern pays off when it speaks *your* domain and enables fakes.'),
      ),
      section('visual', 'Where it sits',
        diagram('layered-architecture', 'Services talk to repository interfaces; implementations talk to the database.'),
      ),
      section('example', 'Interface, in-memory and SQL implementations',
        code({
          title: 'In-memory repository for tests (runnable)',
          code: dedent(`
            class InMemoryUserRepository {
              #rows = new Map();
              #seq = 0;
              async add(user) {
                const saved = { ...user, id: ++this.#seq };
                this.#rows.set(saved.id, saved);
                return { ...saved };
              }
              async findById(id) {
                const row = this.#rows.get(id);
                return row ? { ...row } : null;   // return a copy
              }
              async findActiveByDomain(domain) {
                return [...this.#rows.values()]
                  .filter((u) => u.active && u.email.endsWith('@' + domain))
                  .map((u) => ({ ...u }));
              }
            }

            (async () => {
              const repo = new InMemoryUserRepository();
              await repo.add({ email: 'ada@acme.io', active: true });
              await repo.add({ email: 'bob@acme.io', active: false });
              await repo.add({ email: 'eve@other.io', active: true });

              console.log((await repo.findActiveByDomain('acme.io')).map((u) => u.email));
              const u = await repo.findById(1);
              u.email = 'changed';                         // mutate the copy
              console.log((await repo.findById(1)).email);  // store unaffected
            })();
          `),
          expectedOutput: "[ 'ada@acme.io' ]\nada@acme.io",
          explanation: [
            'Intention-revealing query: `findActiveByDomain`, not `find({ where })`.',
            'Private fields (`#rows`) keep storage internal.',
            'Returning copies mimics a real DB: changing an object does not persist until you save it.',
          ],
          runnable: true,
        }),
        code({
          title: 'Postgres implementation of the same interface',
          language: 'typescript',
          code: dedent(`
            export interface UserRepository {
              add(user: NewUser): Promise<User>;
              findById(id: number): Promise<User | null>;
              findActiveByDomain(domain: string): Promise<User[]>;
            }

            export class PgUserRepository implements UserRepository {
              constructor(private readonly db: Pool) {}

              async findActiveByDomain(domain: string) {
                const { rows } = await this.db.query(
                  'SELECT id, email, is_active FROM users WHERE is_active AND email LIKE $1',
                  ['%@' + domain],
                );
                return rows.map(toUser);
              }
              // add, findById ...
            }

            const toUser = (r: { id: number; email: string; is_active: boolean }): User =>
              ({ id: r.id, email: r.email, active: r.is_active });
          `),
          explanation: [
            'Mapping `is_active` → `active` keeps database naming out of the domain.',
            'Parameterised query (`$1`) — see Module 9 on SQL injection.',
            'Services depend on `UserRepository`, so both implementations are interchangeable.',
          ],
        }),
      ),
      section('real-world', 'In a real backend',
        bullets(
          'Service unit tests use in-memory repos; integration tests run the Pg implementation against a real Postgres container.',
          'Caching decorator: `CachedUserRepository` wraps `PgUserRepository` with the same interface (cache-aside).',
          'Unit of work: `await uow.run(async ({ orders, payments }) => { ... })` shares one transaction across repositories.',
        ),
      ),
      section('mistakes', 'Common mistakes',
        code({
          title: 'Leaky repository',
          code: dedent(`
            // ❌ the service builds queries — the abstraction leaks
            repo.find({ where: { status: 'open', createdAt: { gt: date } }, include: ['items'] });
            // ✅ repository owns the query
            repo.findOpenSince(date);
          `),
          explanation: ['If callers write query objects, swapping storage still breaks them.'],
        }),
        bullets(
          'Generic `BaseRepository<T>` with `findAll()` used everywhere, loading whole tables.',
          'Returning ORM entities with lazy-loading that fire queries from the controller.',
          'Business rules inside repositories ("if balance < 0 throw") — those belong to entities/services.',
        ),
      ),
      section('interview', 'Interview angle',
        interviewTip('Explain the repository as a domain-owned, collection-like interface, how it enables in-memory fakes and DIP, and when it is redundant over an ORM.'),
      ),
      section('practice', 'Practice',
        text('Write an `OrderRepository` interface with `add`, `findById` and `findUnpaidOlderThan(days)`; implement it in memory and with SQL; run the same contract test suite against both.'),
      ),
      section('summary', 'Summary',
        bullets(
          'Collection-like, domain-language persistence interface.',
          'Owned by the domain; implementations are details.',
          'One per aggregate root; maps rows ↔ entities.',
          'Enables in-memory fakes and contract tests.',
          'Avoid leaky generic query methods.',
        ),
      ),
    ],
    revisionNotes: [
      'Repository = collection of domain objects; DAO = table CRUD.',
      'Domain owns the interface (DIP); infra implements.',
      'Intention-revealing methods, not query builders.',
      'Map storage naming to domain naming inside the repository.',
      'Contract tests run against in-memory and real implementations.',
      'Practical DB implementation: Module 9 "Repository pattern".',
    ],
    quiz: [
      {
        kind: 'mcq', difficulty: 'intermediate',
        prompt: 'Which method signature best fits the repository pattern?',
        options: [
          'orders.query("SELECT * FROM orders WHERE paid = false")',
          'orders.findUnpaidOlderThan(30)',
          'orders.getConnection()',
          'orders.render(res)',
        ],
        answer: 1,
        explanation: 'Repositories expose intention-revealing, domain-language methods. Raw SQL or connections leak the storage detail.',
      },
      {
        kind: 'predict-output', difficulty: 'intermediate',
        prompt: 'What does this print?',
        code: "const store = new Map([[1, { name: 'a' }]]);\nconst find = (id) => ({ ...store.get(id) });\nconst x = find(1);\nx.name = 'b';\nconsole.log(store.get(1).name, x.name);",
        options: ['b b', 'a b', 'a a', 'b a'],
        answer: 1,
        explanation: 'find returns a shallow copy, so mutating x does not change the stored object.',
      },
    ],
    interview: [
      {
        category: 'advanced', kind: 'concept', difficulty: 'intermediate', topic: 'Design patterns',
        question: 'What problem does the repository pattern solve, and how is it different from a DAO?',
        shortAnswer: 'It hides persistence behind a collection-like interface in domain language so business code is storage-agnostic and testable; a DAO is a lower-level, table-oriented CRUD wrapper.',
        detailedAnswer: [
          'Repository per aggregate; DAO per table.',
          'Repository methods express use-case needs (`findOverdue`).',
          'Repository interface owned by the domain (DIP).',
          'Enables in-memory fakes for fast service tests.',
          'A repository implementation may use several DAOs or an ORM internally.',
        ],
        followUp: 'Would you wrap Prisma in a repository? Why or why not?',
        trap: 'Describing a generic CRUD wrapper with findAll/findWhere as a repository.',
      },
      {
        category: 'advanced', kind: 'scenario', difficulty: 'advanced', topic: 'Design patterns',
        question: 'A use case must update an order and insert a payment atomically, but they live in two repositories. How do you design this?',
        shortAnswer: 'Use a unit of work: the service starts a transaction and passes a transaction-bound context to both repositories (or creates repositories bound to that transaction), committing once at the end.',
        detailedAnswer: [
          'Transaction boundary = use case, not repository.',
          '`uow.run(async ({ orders, payments }) => {...})` creates tx-bound repos.',
          'Alternatively pass `tx` as a parameter to repository methods.',
          'Commit on success, roll back on any throw.',
          'Across services/databases, use a saga or outbox instead of a distributed transaction.',
        ],
        followUp: 'How would you implement the same guarantee if payments were a separate microservice?',
        trap: 'Opening a separate transaction inside each repository method.',
      },
    ],
  },

  'factory-pattern': {
    summary: 'A factory centralises object creation behind a function or method that decides which concrete implementation to build and how to configure it, so callers depend only on the resulting interface.',
    topics: ['factory function', 'simple factory', 'factory method', 'abstract factory', 'registry', 'configuration-driven creation', 'closures'],
    sections: [
      section('introduction', undefined,
        text('`new StripeGateway(process.env.STRIPE_KEY)` scattered across the code ties every caller to Stripe and its configuration. A factory puts the "which one, configured how" decision in one place.'),
      ),
      section('definition', 'Variants',
        table('Factory flavours', ['Variant', 'What it is', 'Node example'], [
          ['Factory function', 'A function returning a new object (often with closures)', '`createLogger({ level })`, `express()`'],
          ['Simple factory', 'One function choosing among implementations by a key', '`createPaymentGateway("stripe")`'],
          ['Factory method', 'Subclasses/hooks decide what to create', 'A base `Exporter` with `createWriter()` overridden by CSV/JSON exporters'],
          ['Abstract factory', 'Creates families of related objects', '`createCloudProvider("aws")` → storage + queue + secrets clients'],
        ]),
      ),
      section('why', 'Why use a factory',
        bullets(
          'Callers depend on an interface, not on concrete classes (supports DIP).',
          'Configuration-driven selection (`PAYMENT_PROVIDER=fake` in tests).',
          'Validation and defaults in one place.',
          'Hide complex setup (retries, timeouts, auth) behind one call.',
          'Factory functions give real privacy through closures without classes.',
        ),
      ),
      section('internals', 'Design steps',
        steps(
          'Define the common interface (e.g. `charge(amount, token)`).',
          'Register implementations in a map keyed by type — adding one never edits the factory body (open/closed).',
          'Throw a clear error for unknown types.',
          'Call the factory from the composition root with config values.',
        ),
      ),
      section('visual', 'Factory decision',
        flow(['config.PAYMENT_PROVIDER', 'createPaymentGateway(type, cfg)', 'registry lookup', 'new StripeGateway | PaypalGateway | FakeGateway', 'caller uses charge()'],
          { title: 'Configuration-driven creation', direction: 'horizontal' }),
      ),
      section('example', 'Factories in practice',
        code({
          title: 'Registry-based simple factory (runnable)',
          code: dedent(`
            class StripeGateway { constructor(cfg) { this.name = 'stripe'; this.key = cfg.key; } }
            class PaypalGateway { constructor(cfg) { this.name = 'paypal'; this.clientId = cfg.clientId; } }
            class FakeGateway { constructor() { this.name = 'fake'; } }

            const registry = { stripe: StripeGateway, paypal: PaypalGateway, fake: FakeGateway };

            function createPaymentGateway(type, cfg = {}) {
              const Impl = registry[type];
              if (!Impl) throw new Error('Unsupported gateway: ' + type);
              return new Impl(cfg);
            }

            console.log(createPaymentGateway('stripe', { key: 'sk_test' }).name);
            console.log(createPaymentGateway('fake').name);
            try { createPaymentGateway('bitcoin'); } catch (e) { console.log(e.message); }
          `),
          expectedOutput: 'stripe\nfake\nUnsupported gateway: bitcoin',
          explanation: [
            'Adding a provider = one class + one registry entry.',
            'Unknown types fail loudly at startup when called from the composition root.',
          ],
          runnable: true,
        }),
        code({
          title: 'Factory function with private state (runnable)',
          code: dedent(`
            function createRateCounter({ limit }) {
              let count = 0;                       // private via closure
              return {
                hit() { count += 1; return count <= limit; },
                get remaining() { return Math.max(0, limit - count); },
              };
            }

            const counter = createRateCounter({ limit: 2 });
            console.log(counter.hit(), counter.hit(), counter.hit(), counter.remaining);
            console.log(counter.count);
          `),
          expectedOutput: 'true true false 0\nundefined',
          explanation: [
            'No `new`, no `this` binding issues; `count` is truly private.',
            'This is the style of `express()`, `createClient()`, `pino()`.',
          ],
          runnable: true,
        }),
      ),
      section('real-world', 'In a real backend',
        bullets(
          '`createStorage(config)` returns an S3, GCS or local-disk adapter.',
          '`createApp({ services })` factory builds an Express app — tests create fresh apps per suite.',
          'Abstract factory for multi-cloud: one call returns matching queue, storage and secret clients.',
        ),
      ),
      section('mistakes', 'Common mistakes',
        code({
          title: 'Growing switch vs registry',
          code: dedent(`
            // ❌ every provider edits this function
            function create(type) {
              switch (type) { case 'stripe': return new Stripe(); case 'paypal': return new Paypal(); /* ... */ }
            }
            // ✅ registration keeps the factory closed for modification
            const registry = new Map();
            const register = (type, Impl) => registry.set(type, Impl);
          `),
          explanation: ['Both are factories; the registry scales without edits.'],
        }),
        bullets(
          'Factories that silently return `undefined` for unknown types.',
          'Calling factories deep inside business logic instead of the composition root.',
          'Creating a factory for a class that has exactly one implementation and trivial construction.',
        ),
      ),
      section('interview', 'Interview angle',
        interviewTip('Show a registry factory, explain how it supports open/closed and DIP, and contrast factory functions (closures) with classes.'),
      ),
      section('practice', 'Practice',
        text('Build `createNotifier(channel, config)` for email, SMS and console channels with a registry, and make it throw a helpful error listing supported channels.'),
      ),
      section('summary', 'Summary',
        bullets(
          'Factories centralise "what to build and how".',
          'Registry-based factories follow open/closed.',
          'Factory functions give closure privacy.',
          'Call them from the composition root with config.',
        ),
      ),
    ],
    revisionNotes: [
      'Simple factory, factory method, abstract factory, factory function.',
      'Registry map > switch for extensibility.',
      'Throw on unknown types.',
      'Closures give real privacy (no #fields needed).',
      'express(), pino(), redis.createClient() are factory functions.',
    ],
    quiz: [
      {
        kind: 'predict-output', difficulty: 'beginner',
        prompt: 'What does this print?',
        code: "function make() { let n = 0; return { inc: () => ++n }; }\nconst a = make(), b = make();\na.inc(); a.inc();\nconsole.log(a.inc(), b.inc());",
        options: ['3 1', '3 4', '1 1', '2 1'],
        answer: 0,
        explanation: 'Each factory call creates its own closure, so a and b have independent counters: a reaches 3, b starts at 1.',
      },
      {
        kind: 'mcq', difficulty: 'intermediate',
        prompt: 'Which pattern creates families of related objects (e.g. storage, queue and secrets clients for one cloud)?',
        options: ['Simple factory', 'Abstract factory', 'Singleton', 'Observer'],
        answer: 1,
        explanation: 'An abstract factory returns a consistent set of related products for one family.',
      },
    ],
    interview: [
      {
        category: 'advanced', kind: 'concept', difficulty: 'intermediate', topic: 'Design patterns',
        question: 'When would you use a factory in a Node.js backend, and how do you keep it extensible?',
        shortAnswer: 'When the concrete implementation depends on configuration or environment (payment, storage, notification providers) or construction is complex; keep it extensible with a registry of implementations rather than a growing switch.',
        detailedAnswer: [
          'Callers depend on the interface returned.',
          'Registry: `register(type, Impl)` — open/closed.',
          'Validation, defaults and clear errors in one place.',
          'Called from the composition root, not deep in services.',
          'Factory functions are idiomatic JS (express(), pino()).',
        ],
        followUp: 'How does a factory differ from a DI container?',
        trap: 'Using a factory everywhere instead of injecting what it creates.',
      },
    ],
  },

  'singleton-pattern': {
    summary: 'A singleton guarantees one shared instance; in Node, a module that exports an instance is effectively a singleton thanks to the module cache — with caveats around testing, multiple package copies, ESM/CJS duplication and multiple processes.',
    topics: ['singleton', 'module caching', 'require.cache', 'shared DB pool', 'testing problems', 'duplicate packages', 'dual package hazard', 'Symbol.for'],
    sections: [
      section('introduction', undefined,
        text('Some things should exist once per process: a database pool, a config object, a logger. Node makes this almost free — but the "once" has more exceptions than people expect.'),
      ),
      section('definition', 'Singleton in Node',
        bullets(
          '**Classic singleton**: a class that controls its own instantiation (`static getInstance()`).',
          '**Node module singleton**: `module.exports = new Pool()` — the module runs once and every `require` returns the cached export (Module 3 "Module caching").',
          'The cache key is the **resolved absolute filename**, not the string passed to `require`.',
          'ES modules are also evaluated once per URL, so `export const pool = new Pool()` behaves similarly.',
        ),
      ),
      section('why', 'When it is reasonable',
        bullets(
          'Expensive shared resources: DB pools, HTTP agents, Redis clients.',
          'Process-wide config and logger.',
          'Avoiding accidental multiple pools (each with its own connections).',
        ),
      ),
      section('internals', 'Caveats',
        table('When "one instance" is not one', ['Situation', 'Why', 'Mitigation'], [
          ['Two copies of a package in node_modules', 'Different resolved paths → two cache entries', 'Dedupe (`npm dedupe`), peerDependencies, or `globalThis[Symbol.for(...)]`'],
          ['CJS and ESM builds of the same package', 'Separate loaders/caches (dual package hazard)', 'Single entry for state, or stateless wrappers'],
          ['Path case differences on case-insensitive FS', '`./DB` vs `./db` resolve to different keys', 'Consistent imports, lint rules'],
          ['cluster / worker_threads / multiple containers', 'Each process/thread has its own module cache', 'Shared state must live in Redis/DB'],
          ['Tests', 'State leaks between tests; hard to replace', 'Inject the instance; `jest.resetModules()`; export a factory too'],
        ]),
        warn('A singleton is global mutable state. Prefer creating the instance in the composition root and injecting it — you still get "one per process" without hidden coupling.'),
      ),
      section('visual', 'Module cache',
        flow(['a.js: require("./db")', 'Module._load: resolve → /app/src/db.js', 'Not cached → execute, store in require.cache', 'b.js: require("./db") → cache hit → same object'],
          { title: 'Why modules are singletons' }),
      ),
      section('example', 'Module and class singletons',
        code({
          title: 'Module singleton',
          code: dedent(`
            // db.js
            const { Pool } = require('pg');
            console.log('creating pool');
            module.exports = new Pool({ connectionString: process.env.DATABASE_URL, max: 10 });

            // app.js
            const a = require('./db');
            const b = require('./db');
            console.log(a === b);
          `),
          expectedOutput: 'creating pool\ntrue',
          explanation: [
            'The module body runs once; the second require hits `require.cache`.',
            'Pool creation is a side effect at import time — convenient, but makes tests and startup ordering harder.',
          ],
        }),
        code({
          title: 'Class singleton (runnable)',
          code: dedent(`
            class Config {
              static #instance = null;
              static loads = 0;
              static get() {
                if (!Config.#instance) Config.#instance = new Config();
                return Config.#instance;
              }
              constructor() { Config.loads += 1; this.port = 3000; }
            }

            const c1 = Config.get();
            const c2 = Config.get();
            console.log(c1 === c2, Config.loads);
          `),
          expectedOutput: 'true 1',
          explanation: [
            'The private static field holds the only instance.',
            'Nothing stops `new Config()` from elsewhere — JS has no private constructors, so the guarantee is by convention.',
          ],
          runnable: true,
        }),
        code({
          title: 'Duplicate package copies break it (runnable simulation)',
          code: dedent(`
            const cache = {};
            let created = 0;
            function fakeRequire(resolvedPath) {
              if (!(resolvedPath in cache)) cache[resolvedPath] = { id: ++created };
              return cache[resolvedPath];
            }

            const a = fakeRequire('/app/node_modules/db-lib/index.js');
            const b = fakeRequire('/app/node_modules/db-lib/index.js');
            const c = fakeRequire('/app/node_modules/plugin/node_modules/db-lib/index.js');
            console.log(a === b, a === c, created);
          `),
          expectedOutput: 'true false 2',
          explanation: [
            'Same resolved path → same instance.',
            'A nested copy (different version required by `plugin`) is a different file → a second "singleton".',
            'Real-world symptom: `instanceof` checks fail or two registries exist.',
          ],
          runnable: true,
        }),
      ),
      section('real-world', 'In a real backend',
        bullets(
          'Create the pool in `main.js`, inject it into repositories, close it on shutdown.',
          'Libraries that must be process-global (e.g. metrics registries) sometimes store state on `globalThis[Symbol.for(\'lib.registry\')]` so duplicate copies share it.',
          'prom-client\'s default registry is a module-level singleton — duplicate copies mean missing metrics.',
        ),
      ),
      section('mistakes', 'Common mistakes',
        code({
          title: 'Hidden singleton vs injected instance',
          code: dedent(`
            // ❌ service reaches for a global; tests must patch the module
            const db = require('../db');
            exports.getUser = (id) => db.query('SELECT ...', [id]);

            // ✅ one instance created in main.js and passed in
            exports.makeUserRepo = (db) => ({ getUser: (id) => db.query('SELECT ...', [id]) });
          `),
          explanation: ['Still one pool per process — but explicit, replaceable and closeable.'],
        }),
        bullets(
          'Expecting a singleton to be shared across cluster workers or containers.',
          'Storing per-request data on a singleton (leaks between users).',
          'Import-time side effects (connecting to DB) that crash tests just by importing a file.',
        ),
      ),
      section('interview', 'Interview angle',
        interviewTip('Say "modules are cached by resolved filename, so exported instances are singletons per process", then list the caveats: duplicate packages, ESM/CJS, multiple processes, testability.'),
      ),
      section('practice', 'Practice',
        text('Create two folders each with its own copy of a tiny `counter` package, require both from one script and observe two independent counters. Then fix it with `globalThis[Symbol.for(...)]`.'),
      ),
      section('summary', 'Summary',
        bullets(
          'Module cache makes exported instances per-process singletons.',
          'Cache key = resolved filename.',
          'Breaks with duplicate copies, ESM/CJS duplication, multiple processes.',
          'Prefer creating once in the composition root and injecting.',
        ),
      ),
    ],
    revisionNotes: [
      'require caches by resolved absolute path; ESM by URL.',
      'Singleton per process/thread, not per cluster or fleet.',
      'Duplicate node_modules copies → multiple instances, failed instanceof.',
      'Dual package hazard: CJS + ESM copies.',
      'Singleton = global state → hurts tests; inject instead.',
    ],
    quiz: [
      {
        kind: 'mcq', difficulty: 'intermediate',
        prompt: 'Why does `require(\'./db\')` in two files return the same Pool?',
        options: [
          'Node detects the Pool class and shares it',
          'The module is executed once and cached by its resolved filename',
          'Pools are always global in pg',
          'V8 deduplicates identical objects',
        ],
        answer: 1,
        explanation: 'require.cache stores module.exports keyed by the resolved path; later requires return the cached value.',
      },
      {
        kind: 'scenario', difficulty: 'advanced',
        prompt: '`err instanceof AppError` returns false for errors thrown by a plugin, even though both import `@acme/errors`. What is the likely cause?',
        options: [
          'instanceof never works with classes',
          'Two copies (different versions/paths) of @acme/errors are installed, so there are two different AppError classes',
          'The plugin uses async functions',
          'Errors lose their prototype when thrown',
        ],
        answer: 1,
        explanation: 'Each copy has its own module cache entry and class identity. Dedupe or declare the package as a peerDependency.',
      },
      {
        kind: 'predict-output', difficulty: 'intermediate',
        prompt: 'What does this print?',
        code: "let made = 0;\nconst cache = {};\nconst load = (p) => cache[p] ??= { n: ++made };\nload('/a'); load('/a'); load('/b');\nconsole.log(made);",
        options: ['1', '2', '3', '0'],
        answer: 1,
        explanation: 'The ??= assignment only runs on a cache miss: /a once, /b once → 2.',
      },
    ],
    interview: [
      {
        category: 'advanced', kind: 'concept', difficulty: 'intermediate', topic: 'Design patterns',
        question: 'How do you implement a singleton in Node.js, and what are the pitfalls?',
        shortAnswer: 'Export an instance from a module — the module cache returns the same object to every importer in that process; pitfalls are duplicate package copies, CJS/ESM duplication, one-instance-per-process only, and hidden global state that complicates tests.',
        detailedAnswer: [
          'Cache key is the resolved filename.',
          'Nested node_modules copies create separate instances.',
          'cluster/worker_threads/containers each get their own.',
          'Tests share state across cases unless modules are reset.',
          'Better: create once in the composition root and inject.',
        ],
        followUp: 'How would a library guarantee one registry even if installed twice?',
        trap: 'Assuming a module singleton is shared across all cluster workers.',
      },
      {
        category: 'advanced', kind: 'concept', difficulty: 'advanced', topic: 'Design patterns',
        question: 'Why is the singleton pattern often called an anti-pattern, and what would you use instead for a database pool?',
        shortAnswer: 'It is global mutable state with hidden dependencies, making tests, lifecycle control and substitution hard; instead create the pool once in the composition root, inject it, and close it during shutdown.',
        detailedAnswer: [
          'Hidden coupling: callers do not declare they need the DB.',
          'Order-dependent tests and leaked state.',
          'Import-time side effects (connecting on require).',
          'Hard to have two instances when you legitimately need them (read replica).',
          'DI gives "one per process" explicitly with controllable lifetime.',
        ],
        followUp: 'How do you make sure the pool is closed during graceful shutdown?',
        trap: 'Saying singletons are always wrong — one shared pool per process is correct; the problem is hidden global access.',
      },
    ],
  },
};

export default content;
