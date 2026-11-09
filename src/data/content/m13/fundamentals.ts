import type { ModuleContent } from '../../../types';
import { bullets, code, dedent, diagram, flow, interviewTip, note, section, steps, table, text, tip, warn } from '../helpers';

const content: Partial<ModuleContent> = {
  'testing-fundamentals': {
    summary: 'Automated tests are code that checks code; a healthy suite follows the testing pyramid — many fast unit tests, fewer integration tests, a handful of end-to-end tests — and each test follows Arrange-Act-Assert.',
    topics: ['testing pyramid', 'unit test', 'integration test', 'E2E test', 'Arrange-Act-Assert', 'test doubles', 'flaky tests', 'regression'],
    sections: [
      section('introduction', undefined,
        text('Every change can break something that used to work. Automated tests let you change code confidently: they re-check behaviour in seconds, every time, on every commit.'),
      ),
      section('definition', 'Kinds of tests',
        table('Unit vs integration vs E2E', ['', 'Unit', 'Integration', 'End-to-end (E2E)'], [
          ['Scope', 'One function/class in isolation', 'Several units + real infrastructure (DB, HTTP layer)', 'The whole system as a user sees it'],
          ['Dependencies', 'Replaced with test doubles', 'Real DB/queue (often in Docker), external APIs faked', 'Everything real (or staging)'],
          ['Speed', 'Milliseconds', 'Tens to hundreds of ms', 'Seconds to minutes'],
          ['Failure tells you', 'Exactly which logic is wrong', 'Wiring/SQL/serialisation is wrong', 'Something in the user journey is broken'],
          ['Typical tools', 'node:test, Jest, Vitest', '+ Supertest, Testcontainers', 'Playwright, Cypress, API scripts'],
          ['How many', 'Many', 'Some', 'Few'],
        ]),
      ),
      section('why', 'Why tests pay off',
        bullets(
          'Catch regressions before users do; CI blocks broken merges.',
          'Enable refactoring — the tests define the behaviour that must not change.',
          'Act as executable documentation of edge cases.',
          'Writing tests pushes design towards small, injectable, pure functions.',
        ),
      ),
      section('internals', 'Anatomy of a test',
        steps(
          '**Arrange** — build inputs, fakes and state.',
          '**Act** — call the one thing under test.',
          '**Assert** — check the result or the observable side effect.',
          'A runner discovers files (`*.test.js`), runs each test, catches thrown assertion errors and reports pass/fail with an exit code (0 = all passed).',
        ),
        flow([
          'E2E: few, slow, high confidence',
          'Integration: some, real DB/HTTP',
          'Unit: many, fast, isolated',
        ], { title: 'Testing pyramid (top → bottom)', direction: 'vertical', caption: 'The base is widest: most tests should be cheap and fast.' }),
        note('Some teams prefer the "testing trophy" (more integration tests). For backend APIs, integration tests through the HTTP layer often give the best confidence per test. The principle is the same: cheap tests for logic, a few expensive ones for wiring.'),
        diagram('ci-cd-pipeline', 'Tests run on every push; a failing test stops the pipeline before deploy.'),
      ),
      section('example', 'A test from scratch',
        code({
          title: 'A tiny test runner (pure JS)',
          runnable: true,
          code: dedent(`
            const results = [];
            function test(name, fn) {
              try { fn(); results.push('✓ ' + name); }
              catch (e) { results.push('✗ ' + name + ' — ' + e.message); }
            }
            function expectEqual(actual, expected) {
              if (actual !== expected) throw new Error('expected ' + expected + ', got ' + actual);
            }

            // code under test
            const applyDiscount = (price, pct) => Math.round(price * (1 - pct / 100) * 100) / 100;

            test('10% off 50 is 45', () => {
              const price = 50, pct = 10;            // Arrange
              const result = applyDiscount(price, pct); // Act
              expectEqual(result, 45);               // Assert
            });
            test('rounds to cents', () => expectEqual(applyDiscount(19.99, 15), 16.99));
            test('0% returns same price', () => expectEqual(applyDiscount(10, 0), 11));

            console.log(results.join('\\n'));
            console.log(results.filter((r) => r.startsWith('✗')).length + ' failed');
          `),
          expectedOutput: '✓ 10% off 50 is 45\n✓ rounds to cents\n✗ 0% returns same price — expected 11, got 10\n1 failed',
          explanation: [
            'A test is just a function that throws when an expectation fails.',
            'The runner catches the error and records the failure — this is all Jest or `node:test` fundamentally do.',
            'The third test is deliberately wrong to show a failure message: a good message says expected vs actual.',
          ],
        }),
      ),
      section('real-world', 'What to test in a backend',
        bullets(
          'Unit: pure business rules — pricing, permissions (`can(user, action)`), parsers, validators.',
          'Integration: each HTTP route against a real test DB — status codes, response shape, auth, DB side effects.',
          'E2E: a few critical journeys — signup → login → checkout — against a deployed environment.',
          'Contract tests when other teams consume your API.',
        ),
        tip('Test **behaviour**, not implementation: assert on outputs and observable effects, not on which private helper was called.'),
      ),
      section('mistakes', 'Common mistakes',
        bullets(
          'Inverted pyramid ("ice-cream cone"): mostly slow E2E tests → slow, flaky CI.',
          'Tests that depend on each other\'s order or shared mutable state.',
          'Testing private internals so every refactor breaks tests.',
          'Ignoring flaky tests — they train the team to ignore red builds.',
          'No assertions (a test that cannot fail).',
        ),
      ),
      section('interview', 'Interview angle',
        interviewTip('Draw the pyramid, give one Node example per level, and explain the trade-off: confidence vs speed vs isolation of failures.'),
      ),
      section('practice', 'Practice',
        text('Pick one feature of an app (e.g. "create order"). List one unit test, two integration tests and one E2E test you would write, and what each would catch that the others would not.'),
      ),
      section('summary', 'Summary',
        bullets(
          'Unit → isolated logic; integration → real wiring; E2E → user journeys.',
          'Pyramid: many fast tests at the bottom, few slow ones at the top.',
          'Arrange-Act-Assert; one behaviour per test.',
          'Tests must be independent, deterministic and fast.',
        ),
      ),
    ],
    revisionNotes: [
      'Pyramid: unit (many) → integration (some) → E2E (few).',
      'AAA: Arrange, Act, Assert.',
      'Runner = discover → run → catch thrown assertions → exit code.',
      'Test behaviour, not implementation.',
      'Flaky tests destroy trust — fix or quarantine.',
    ],
    quiz: [
      {
        kind: 'mcq', difficulty: 'beginner',
        prompt: 'Which test type should be the most numerous according to the testing pyramid?',
        options: ['End-to-end tests', 'Manual tests', 'Unit tests', 'Load tests'],
        answer: 2,
        explanation: 'Unit tests are fast and pinpoint failures, so they form the wide base. E2E tests give high confidence but are slow and brittle, so there are few.',
      },
      {
        kind: 'scenario', difficulty: 'intermediate',
        prompt: 'Your CI takes 40 minutes, mostly browser E2E tests, and fails randomly twice a week. What is the best long-term move?',
        options: [
          'Add retries to every E2E test and move on',
          'Push most checks down to unit/integration tests, keep a few E2E tests for critical journeys, and fix flakiness root causes',
          'Delete all tests',
          'Run tests only before releases',
        ],
        answer: 1,
        explanation: 'An inverted pyramid causes slow, flaky pipelines. Moving coverage to cheaper layers keeps confidence; blanket retries hide real bugs.',
      },
    ],
    interview: [
      {
        category: 'express-backend', kind: 'concept', difficulty: 'beginner', topic: 'Testing',
        question: 'What is the difference between unit, integration and end-to-end tests?',
        shortAnswer: 'Unit tests check one piece of logic in isolation, integration tests check that pieces work together with real infrastructure, and E2E tests check a full user journey through the whole system.',
        detailedAnswer: [
          'Unit: fast, dependencies replaced by doubles, precise failures.',
          'Integration: e.g. route + service + real test database via Supertest.',
          'E2E: real deployment or browser automation; slow and most realistic.',
          'Balance them with the testing pyramid.',
        ],
        followUp: 'Which layer would you invest in most for a REST API and why?',
        trap: 'Calling any test that uses Jest a "unit test".',
      },
      {
        category: 'advanced', kind: 'concept', difficulty: 'intermediate', topic: 'Testing',
        question: 'What makes a test flaky, and how do you eliminate flakiness?',
        shortAnswer: 'A flaky test passes and fails without code changes, usually due to timing, shared state, test order, real network or time/randomness; fix it by making tests deterministic and isolated.',
        detailedAnswer: [
          'Timing: arbitrary `sleep`s instead of awaiting events → await the condition or use fake timers.',
          'Shared state: DB rows or module singletons leaking between tests → reset in `beforeEach`, unique data per test.',
          'External services: real HTTP calls → fake them at the boundary.',
          'Time and randomness: `Date.now()`, `Math.random()` → inject clocks/seeds.',
          'Track flaky tests, quarantine temporarily, and fix root causes rather than adding retries.',
        ],
        followUp: 'How do fake timers work?',
        trap: 'Treating retries as the fix.',
      },
    ],
  },

  'unit-testing': {
    summary: 'A unit test exercises one small unit of code — usually a function or class — in isolation from I/O, so it is fast, deterministic and pinpoints exactly what broke.',
    topics: ['unit testing', 'pure functions', 'dependency injection', 'edge cases', 'test isolation', 'table-driven tests', 'assertions'],
    sections: [
      section('introduction', undefined,
        text('Unit tests are the cheapest tests to write and run. They answer one question: "given this input, does this function produce this output?"'),
      ),
      section('definition', 'Definition',
        text('A **unit test** calls a unit of code with controlled inputs and asserts on its output or effects, replacing slow or non-deterministic collaborators (DB, network, clock) with test doubles.'),
        bullets(
          'Fast: thousands per second.',
          'Deterministic: same result every run.',
          'Isolated: no shared state; any order.',
          'Focused: one behaviour per test; a clear name like `"rejects negative quantity"`.',
        ),
      ),
      section('why', 'Why design for unit testing',
        bullets(
          'Code that mixes logic with I/O (`req`, `db`, `fetch`) is hard to unit test.',
          'Extract **pure** business rules and **inject** dependencies — the code gets easier to test *and* to reuse.',
          'Unit tests are the best place for edge cases: empty, zero, negative, huge, unicode, null.',
        ),
      ),
      section('internals', 'Making code testable',
        steps(
          'Identify logic buried in a route handler.',
          'Move it into a function that takes plain values (or injected collaborators) and returns a value.',
          'Keep the handler thin: parse request → call function → send response.',
          'Unit test the function with many inputs; integration test the handler with a few.',
        ),
        flow([
          'Route handler (thin)',
          'Service function (logic)',
          'Injected repo / clock / mailer',
        ], { title: 'Dependencies flow inward and are injectable', direction: 'horizontal' }),
      ),
      section('example', 'Unit testing with node:test',
        code({
          title: 'Table-driven tests (pure JS harness)',
          runnable: true,
          code: dedent(`
            function shippingCost({ weightKg, express }) {
              if (weightKg <= 0) throw new RangeError('weight must be positive');
              const base = weightKg <= 1 ? 5 : 5 + Math.ceil(weightKg - 1) * 2;
              return express ? base * 2 : base;
            }

            const cases = [
              { input: { weightKg: 0.5, express: false }, expected: 5 },
              { input: { weightKg: 1, express: false }, expected: 5 },
              { input: { weightKg: 1.2, express: false }, expected: 7 },
              { input: { weightKg: 3, express: true }, expected: 18 },
            ];
            for (const { input, expected } of cases) {
              const got = shippingCost(input);
              console.log((got === expected ? 'pass' : 'FAIL') + ' ' + JSON.stringify(input) + ' -> ' + got);
            }
            try { shippingCost({ weightKg: 0 }); } catch (e) { console.log('pass throws ' + e.name); }
          `),
          expectedOutput: 'pass {"weightKg":0.5,"express":false} -> 5\npass {"weightKg":1,"express":false} -> 5\npass {"weightKg":1.2,"express":false} -> 7\npass {"weightKg":3,"express":true} -> 18\npass throws RangeError',
          explanation: [
            'Boundary values (exactly 1 kg, just over 1 kg) are where bugs hide.',
            'A table of cases keeps many checks readable.',
            'Error paths are behaviour too — test that invalid input throws the right error type.',
          ],
        }),
        code({
          title: 'Same tests with node:test + dependency injection',
          code: dedent(`
            // src/orders.js
            export function createOrderService({ repo, clock }) {
              return {
                async create(userId, items) {
                  if (!items.length) throw new Error('empty order');
                  const total = items.reduce((s, i) => s + i.price * i.qty, 0);
                  return repo.insert({ userId, total, createdAt: clock.now() });
                },
              };
            }

            // test/orders.test.js
            import { test } from 'node:test';
            import assert from 'node:assert/strict';
            import { createOrderService } from '../src/orders.js';

            test('computes total and timestamps the order', async () => {
              const repo = { insert: async (o) => ({ id: 1, ...o }) };     // fake repository
              const clock = { now: () => new Date('2026-01-01T00:00:00Z') }; // fixed time
              const svc = createOrderService({ repo, clock });

              const order = await svc.create(7, [{ price: 10, qty: 2 }, { price: 5, qty: 1 }]);

              assert.deepEqual(order, { id: 1, userId: 7, total: 25, createdAt: new Date('2026-01-01T00:00:00Z') });
            });

            test('rejects empty orders', async () => {
              const svc = createOrderService({ repo: {}, clock: {} });
              await assert.rejects(svc.create(7, []), /empty order/);
            });
          `),
          expectedOutput: '$ node --test\n✔ computes total and timestamps the order (1.2ms)\n✔ rejects empty orders (0.4ms)\nℹ tests 2\nℹ pass 2\nℹ fail 0',
          explanation: [
            'The service never imports the DB or `Date` directly — they are passed in, so tests control them.',
            '`assert.deepEqual` from `node:assert/strict` compares structure strictly (including Date values).',
            '`assert.rejects` awaits a promise and checks it rejects with a matching error.',
          ],
        }),
      ),
      section('real-world', 'What makes a good unit test',
        bullets(
          'Name describes behaviour: `it("returns 0 for an empty cart")`.',
          'One reason to fail; arrange only what that case needs.',
          'No network, file system or real time — inject them.',
          'Fast enough to run on every save (`node --test --watch`, `vitest`).',
        ),
      ),
      section('mistakes', 'Common mistakes',
        bullets(
          'Mocking everything, including the logic you meant to test.',
          'Asserting on log output or call order instead of results.',
          'Only testing the happy path.',
          'Forgetting `await` — the test finishes before the assertion runs and passes falsely.',
        ),
        code({
          title: 'Missing await: WRONG vs RIGHT',
          code: dedent(`
            // ❌ passes even though create() rejects — the rejection is never awaited
            test('rejects empty orders', () => {
              assert.rejects(svc.create(7, []), /empty/);
            });
            // ✅
            test('rejects empty orders', async () => {
              await assert.rejects(svc.create(7, []), /empty/);
            });
          `),
          expectedOutput: 'WRONG: test reports ✔ even if the assertion would fail (or fails later, outside the test)\nRIGHT: test result reflects the assertion',
          explanation: ['Async assertions return promises; the test must return or await them.'],
        }),
      ),
      section('interview', 'Interview angle',
        interviewTip('Show how you would refactor a fat Express handler into a pure, injectable service so it can be unit tested — that is the real skill being probed.'),
      ),
      section('practice', 'Practice',
        text('Write unit tests for a `passwordStrength(pw)` function returning `weak|medium|strong`. Include boundary lengths, unicode characters and an empty string.'),
      ),
      section('summary', 'Summary',
        bullets(
          'Unit = one unit, isolated, fast, deterministic.',
          'Extract pure logic; inject I/O (repo, clock, HTTP).',
          'Cover boundaries and error paths; table-driven tests help.',
          'Always await async assertions.',
        ),
      ),
    ],
    revisionNotes: [
      'Unit tests avoid real I/O and time.',
      'Dependency injection → easy fakes.',
      'Boundaries + error paths.',
      '`await assert.rejects(...)` for async errors.',
      'One behaviour per test, descriptive names.',
    ],
    quiz: [
      {
        kind: 'find-bug', difficulty: 'intermediate',
        prompt: 'This test always passes, even when `fetchUser` is broken. Why?',
        code: "test('fetches user', () => {\n  fetchUser(1).then((u) => assert.equal(u.name, 'Ana'));\n});",
        options: [
          'assert.equal is deprecated',
          'The promise is neither returned nor awaited, so the test ends before the assertion runs',
          'fetchUser must be mocked',
          'Tests cannot use .then',
        ],
        answer: 1,
        explanation: 'The test function returns `undefined` synchronously, so the runner marks it passed. Return the promise or make the function `async` and `await` it.',
      },
      {
        kind: 'mcq', difficulty: 'beginner',
        prompt: 'Which function is easiest to unit test?',
        options: [
          'A route handler that queries Postgres and sends an email',
          'A pure function `calculateTax(amount, region)`',
          'A function that reads `Date.now()` and a global config file',
          'A cron job that calls three external APIs',
        ],
        answer: 1,
        explanation: 'Pure functions depend only on their arguments, so tests need no setup or doubles. The others need I/O or time to be faked.',
      },
    ],
    interview: [
      {
        category: 'express-backend', kind: 'concept', difficulty: 'beginner', topic: 'Unit testing',
        question: 'What properties should a good unit test have?',
        shortAnswer: 'It should be fast, isolated, deterministic, focused on one behaviour and readable — often summarised as FIRST: Fast, Independent, Repeatable, Self-validating, Timely.',
        detailedAnswer: [
          'Fast: no network, disk or real timers.',
          'Independent: no shared state; runs in any order.',
          'Repeatable: same result anywhere — control time and randomness.',
          'Self-validating: passes or fails automatically via assertions.',
          'Clear name and Arrange-Act-Assert structure.',
        ],
        followUp: 'How do you unit test code that uses the current time?',
        trap: 'Thinking more assertions per test is always better.',
      },
    ],
  },

  'integration-testing': {
    summary: 'Integration tests verify that components work together with real infrastructure — typically an Express route, its services and a real (test) database — catching wiring, SQL and serialisation bugs that unit tests miss.',
    topics: ['integration testing', 'test database', 'Testcontainers', 'Docker', 'transactions', 'test isolation', 'seeding', 'Supertest'],
    sections: [
      section('introduction', undefined,
        text('Your unit tests pass, but the SQL has a typo and the route forgets to call `express.json()`. Integration tests run the real pieces together and catch exactly that class of bug.'),
      ),
      section('definition', 'Definition',
        text('An **integration test** exercises two or more real components across a boundary — HTTP layer + service + database, or service + message queue — while still faking things you do not control (third-party APIs, email).'),
        table('Real vs faked in integration tests', ['Component', 'Usually', 'Why'], [
          ['Express app / routes / middleware', 'Real', 'That is what you are testing'],
          ['Your database', 'Real (test instance)', 'SQL, constraints, migrations must be exercised'],
          ['Redis / queue', 'Real or in-memory equivalent', 'Behaviour differences matter'],
          ['Stripe, SendGrid, external APIs', 'Faked (nock/msw/stub server)', 'Not yours; slow; costs money; flaky'],
          ['Time', 'Controlled when relevant', 'Determinism'],
        ]),
      ),
      section('why', 'Why integration tests matter for backends',
        bullets(
          'Most backend bugs live at the seams: queries, transactions, JSON shape, middleware order, auth.',
          'Mocks can lie — a mocked repository happily returns data a real query never would.',
          'They test the contract clients rely on: status codes, headers, response bodies.',
        ),
      ),
      section('internals', 'Running against a real database',
        steps(
          'Start a disposable DB — `docker compose` service or **Testcontainers** (third-party) per test run.',
          'Run migrations once before the suite (`before`/`globalSetup`).',
          'Isolate each test: wrap it in a transaction and roll back, or truncate tables in `beforeEach`, or use unique data per test.',
          'Exercise the app in-process (Supertest) — no port, no deployment.',
          'Tear down connections in `after` so the runner can exit.',
        ),
        flow([
          'globalSetup: start Postgres container',
          'migrate schema',
          'beforeEach: truncate / begin tx',
          'test: request(app) → assert DB + response',
          'afterEach: rollback',
          'after: close pool, stop container',
        ], { title: 'Integration test lifecycle', direction: 'vertical' }),
        diagram('layered-architecture', 'An integration test drives the route and lets every layer down to the database run for real.'),
      ),
      section('example', 'Route + real Postgres',
        code({
          title: 'Integration test with node:test, Supertest and pg',
          code: dedent(`
            import { describe, it, before, after, beforeEach } from 'node:test';
            import assert from 'node:assert/strict';
            import request from 'supertest';               // third-party
            import { createApp } from '../src/app.js';
            import { pool, migrate } from '../src/db.js';  // DATABASE_URL points at the test DB

            describe('POST /api/todos', () => {
              let app;
              before(async () => { await migrate(); app = createApp({ pool }); });
              beforeEach(async () => { await pool.query('TRUNCATE todos RESTART IDENTITY CASCADE'); });
              after(async () => { await pool.end(); });

              it('creates a todo and persists it', async () => {
                const res = await request(app)
                  .post('/api/todos')
                  .set('Authorization', 'Bearer test-token-user-1')
                  .send({ title: 'Write tests' })
                  .expect(201);

                assert.equal(res.body.title, 'Write tests');
                const { rows } = await pool.query('SELECT title, user_id FROM todos');
                assert.deepEqual(rows, [{ title: 'Write tests', user_id: 1 }]);
              });

              it('rejects an empty title with 400', async () => {
                await request(app).post('/api/todos').set('Authorization', 'Bearer test-token-user-1')
                  .send({ title: '' }).expect(400);
              });
            });
          `),
          expectedOutput: '$ DATABASE_URL=postgres://localhost:5433/app_test node --test test/todos.int.test.js\n▶ POST /api/todos\n  ✔ creates a todo and persists it (38ms)\n  ✔ rejects an empty title with 400 (6ms)\n▶ POST /api/todos (52ms)\nℹ tests 2\nℹ pass 2',
          explanation: [
            'The app is built by a factory (`createApp`) so tests can inject the pool and avoid `listen()`.',
            'Asserting on the database row proves the full write path, not just the response.',
            'TRUNCATE in `beforeEach` keeps tests independent; `pool.end()` lets the process exit.',
          ],
        }),
        code({
          title: 'docker-compose test database',
          language: 'yaml',
          code: dedent(`
            services:
              db-test:
                image: postgres:16
                environment:
                  POSTGRES_PASSWORD: test
                  POSTGRES_DB: app_test
                ports: ["5433:5432"]
                tmpfs: /var/lib/postgresql/data   # in-memory: fast, disposable
          `),
          expectedOutput: '$ docker compose up -d db-test\n[+] Running 1/1\n ✔ Container app-db-test-1  Started',
          explanation: [
            'A separate port and database name make it impossible to wipe your dev data by accident.',
            '`tmpfs` keeps data in RAM — fast and reset on restart.',
          ],
        }),
      ),
      section('real-world', 'Real-world tips',
        bullets(
          'Use the **same database engine** as production. SQLite in tests and Postgres in prod hides real bugs.',
          'Seed with small factories (`makeUser({ role: "admin" })`) rather than giant shared fixtures.',
          'Fake third-party HTTP at the network level (nock, msw — third-party) or with a local stub server.',
          'Run integration tests in CI with a service container; parallelise by giving each worker its own schema.',
        ),
        warn('Never point tests at a shared or production database. Guard in code: refuse to run if `DATABASE_URL` does not contain `_test`.'),
      ),
      section('mistakes', 'Common mistakes',
        bullets(
          'Forgetting to close DB pools/servers → the runner hangs after tests finish.',
          'Tests depending on rows created by earlier tests.',
          'Mocking the database in "integration" tests — then it is a unit test with extra steps.',
          'Calling real payment/email APIs from tests.',
        ),
      ),
      section('interview', 'Interview angle',
        interviewTip('Explain your isolation strategy (transactions vs truncation vs unique data) and why you use the real DB engine. That shows practical experience.'),
      ),
      section('practice', 'Practice',
        text('Add an integration test for `PATCH /api/todos/:id` that checks a user cannot update another user\'s todo (expect 404) and that the row is unchanged in the database.'),
      ),
      section('summary', 'Summary',
        bullets(
          'Integration tests run real components together — app + DB.',
          'Fake only what you do not own (external APIs).',
          'Isolate per test: truncate, rollback, or unique data.',
          'Same DB engine as production; disposable instance.',
          'Close resources so the runner exits.',
        ),
      ),
    ],
    revisionNotes: [
      'Real DB, faked third parties.',
      'Testcontainers / docker compose for disposable DBs.',
      'Isolation: TRUNCATE in beforeEach or tx rollback.',
      'App factory + Supertest → no port.',
      'Close pools in `after` to avoid hanging.',
    ],
    quiz: [
      {
        kind: 'scenario', difficulty: 'intermediate',
        prompt: 'Integration tests pass locally with SQLite, but production (Postgres) fails on a JSON query. What change helps most?',
        options: [
          'Mock the repository in all tests',
          'Run integration tests against Postgres (e.g. a Docker/Testcontainers instance) — the same engine as production',
          'Add more unit tests',
          'Disable the JSON query',
        ],
        answer: 1,
        explanation: 'Dialect differences (JSON operators, types, constraints) are exactly what integration tests should catch, which requires the same engine.',
      },
      {
        kind: 'find-bug', difficulty: 'intermediate',
        prompt: 'All tests pass but `node --test` never exits. What is the likely cause?',
        code: "before(async () => { await migrate(); });\nit('lists users', async () => {\n  await request(app).get('/users').expect(200);\n});",
        options: [
          'Supertest is still listening on port 3000',
          'The pg pool (open sockets) is never closed — add `after(() => pool.end())`',
          '`expect(200)` is wrong',
          'migrate() must be synchronous',
        ],
        answer: 1,
        explanation: 'Open handles such as idle pool connections keep the event loop alive. Supertest closes its ephemeral server after each request.',
      },
    ],
    interview: [
      {
        category: 'express-backend', kind: 'concept', difficulty: 'intermediate', topic: 'Integration testing',
        question: 'How do you keep database-backed integration tests isolated from each other?',
        shortAnswer: 'Reset state per test — truncate tables or wrap each test in a transaction that is rolled back — or give each test unique data, and use a dedicated disposable database.',
        detailedAnswer: [
          'Transaction rollback: fastest, but the app must use the same connection/transaction as the test.',
          'TRUNCATE ... RESTART IDENTITY in `beforeEach`: simple and reliable.',
          'Unique data (random emails, ids) allows parallel tests without cleanup.',
          'Parallel workers: separate schema or database per worker.',
          'Never share the DB with development or production.',
        ],
        followUp: 'Why can transaction-rollback isolation break with a connection pool?',
        trap: 'Relying on test order to set up data.',
      },
    ],
  },

  'end-to-end-testing': {
    summary: 'End-to-end tests drive the whole deployed system the way a user or client would — through a browser (Playwright, Cypress) or real HTTP calls — to verify critical journeys work across every layer.',
    topics: ['end-to-end testing', 'E2E', 'Playwright', 'Cypress', 'smoke test', 'staging', 'test data', 'flakiness'],
    sections: [
      section('introduction', undefined,
        text('Unit and integration tests check parts. E2E tests ask the final question: "can a user actually sign up and pay?" — with the real frontend, API, database and configuration.'),
      ),
      section('definition', 'Definition',
        text('An **end-to-end (E2E) test** exercises a complete flow through the running system from the outside, with no internal mocking. For APIs this can be scripted HTTP calls; for web apps it is browser automation.'),
        table('E2E tool landscape (all third-party)', ['Tool', 'Type', 'Notes'], [
          ['Playwright', 'Browser automation', 'Chromium/Firefox/WebKit, auto-waiting, parallel, trace viewer'],
          ['Cypress', 'Browser automation', 'Runs in the browser, great DX, time-travel debugging'],
          ['Postman/Newman, k6, plain fetch scripts', 'API E2E', 'Hit a deployed API with real tokens'],
        ]),
      ),
      section('why', 'Why (and why not too many)',
        bullets(
          'Catch problems only visible in the full system: CORS, cookies, env config, reverse proxy rules, migrations.',
          'Smoke tests after deploy confirm the release is alive.',
          'But they are slow, harder to debug and prone to flakiness — keep them to critical paths.',
        ),
      ),
      section('internals', 'How a browser E2E test runs',
        steps(
          'The test runner launches a real browser (headless in CI).',
          'It navigates to the app URL (local stack via docker compose, or staging).',
          'It finds elements by role/label/test id, types, clicks — auto-waiting for elements to be actionable.',
          'It asserts on visible results (text, URL) and optionally on API/DB state.',
          'On failure it captures screenshots, videos or traces for debugging.',
        ),
        flow([
          'CI: build + start stack',
          'Seed test data',
          'Playwright: run journeys',
          'Collect traces on failure',
          'Tear down',
        ], { title: 'E2E in CI', direction: 'horizontal' }),
      ),
      section('example', 'Examples',
        code({
          title: 'Playwright: signup → dashboard',
          code: dedent(`
            // e2e/signup.spec.js — Playwright (third-party): npx playwright test
            import { test, expect } from '@playwright/test';

            test('new user can sign up and see the dashboard', async ({ page }) => {
              const email = \`e2e+\${Date.now()}@example.test\`;      // unique data, no cleanup clash
              await page.goto('/signup');
              await page.getByLabel('Email').fill(email);
              await page.getByLabel('Password').fill('CorrectHorse!42');
              await page.getByRole('button', { name: 'Create account' }).click();

              await expect(page).toHaveURL(/\\/dashboard/);
              await expect(page.getByRole('heading', { name: 'Welcome' })).toBeVisible();
            });
          `),
          expectedOutput: 'Running 1 test using 1 worker\n  ✓  1 [chromium] › signup.spec.js:4:1 › new user can sign up and see the dashboard (2.1s)\n\n  1 passed (3.0s)',
          explanation: [
            'Role/label selectors match what users see and survive CSS refactors.',
            '`expect(...).toBeVisible()` auto-retries until timeout — no manual sleeps.',
            'A unique email per run avoids "user already exists" flakiness.',
          ],
        }),
        code({
          title: 'API smoke test after deploy (Node 18+ fetch)',
          code: dedent(`
            // scripts/smoke.js — run in CI after deploying to staging
            const BASE = process.env.BASE_URL;
            const res = await fetch(BASE + '/health');
            if (res.status !== 200) throw new Error('health failed: ' + res.status);

            const login = await fetch(BASE + '/api/login', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ email: process.env.SMOKE_USER, password: process.env.SMOKE_PASSWORD }),
            });
            const { token } = await login.json();
            const me = await fetch(BASE + '/api/me', { headers: { authorization: 'Bearer ' + token } });
            console.log('smoke ok:', me.status);
          `),
          expectedOutput: '$ BASE_URL=https://staging.example.com node scripts/smoke.js\nsmoke ok: 200',
          explanation: [
            'Runs against the real deployment with a dedicated test account.',
            'A failed smoke test can trigger an automatic rollback.',
            'Top-level `await` works because this file is an ES module (`.mjs` or `"type": "module"`).',
          ],
        }),
      ),
      section('real-world', 'Keeping E2E reliable',
        bullets(
          'Test only critical journeys: auth, checkout, the main CRUD flow.',
          'Create data through the API in setup instead of clicking through the UI every time.',
          'Isolate environments; never run destructive E2E tests against production.',
          'Use `data-testid` or accessible roles, never brittle CSS paths.',
          'Collect traces/videos for failed runs only.',
        ),
      ),
      section('mistakes', 'Common mistakes',
        bullets(
          '`await page.waitForTimeout(3000)` sleeps — use auto-waiting assertions.',
          'Sharing one test user across parallel runs.',
          'Covering every validation edge case in E2E instead of unit tests.',
          'Relying on third-party sandboxes that are down half the time — stub them in the test environment.',
        ),
      ),
      section('interview', 'Interview angle',
        interviewTip('Show judgement: E2E for a few critical flows and smoke tests after deploy; everything else lower in the pyramid. Mention how you fight flakiness.'),
      ),
      section('practice', 'Practice',
        text('Write one Playwright test for your app\'s login flow, run it headless, then break the API route on purpose and open the trace viewer (`npx playwright show-trace`) to see how the failure looks.'),
      ),
      section('summary', 'Summary',
        bullets(
          'E2E = whole system from outside, no internal mocks.',
          'Few and focused on critical journeys; smoke-test every deploy.',
          'Playwright/Cypress (third-party) for browsers; scripted HTTP for APIs.',
          'Unique data, auto-waiting, accessible selectors → less flakiness.',
        ),
      ),
    ],
    revisionNotes: [
      'E2E: slow, realistic, few.',
      'Smoke tests verify a deploy is alive.',
      'Auto-waiting assertions, not sleeps.',
      'Unique test data per run.',
      'Never destructive E2E against production.',
    ],
    quiz: [
      {
        kind: 'find-bug', difficulty: 'intermediate',
        prompt: 'This Playwright test is flaky in CI. What is the problem?',
        code: "await page.click('#save');\nawait page.waitForTimeout(2000);\nexpect(await page.textContent('.toast')).toBe('Saved');",
        options: [
          'click must be awaited twice',
          'A fixed sleep races the app; use an auto-retrying assertion like `await expect(page.locator(".toast")).toHaveText("Saved")`',
          'textContent does not exist',
          '#save is not a valid selector',
        ],
        answer: 1,
        explanation: 'On a slow CI runner 2 s may not be enough (and on a fast one it wastes time). Web-first assertions retry until the condition holds or times out.',
      },
      {
        kind: 'mcq', difficulty: 'beginner',
        prompt: 'What is a smoke test?',
        options: [
          'A load test at maximum traffic',
          'A small set of quick E2E checks that the deployed system\'s key functions work',
          'A test that checks for memory leaks',
          'A unit test for error handling',
        ],
        answer: 1,
        explanation: 'Smoke tests are shallow but broad: health endpoint, login, one key read — run after each deploy.',
      },
    ],
    interview: [
      {
        category: 'express-backend', kind: 'scenario', difficulty: 'intermediate', topic: 'E2E testing',
        question: 'Your team wants to cover every feature with browser E2E tests. How do you respond?',
        shortAnswer: 'Keep E2E for a handful of critical user journeys and post-deploy smoke tests, and push detailed behaviour and edge cases down to unit and integration tests, which are faster and more reliable.',
        detailedAnswer: [
          'E2E failures are expensive to diagnose and runs are slow.',
          'Each extra E2E test adds flakiness risk to every pipeline.',
          'Edge cases (validation rules, permission matrix) are cheaper at unit/integration level.',
          'Define a short list of "must never break" flows for E2E.',
          'Measure suite time and flake rate; set a budget.',
        ],
        followUp: 'How do you set up test data for E2E tests efficiently?',
        trap: 'Equating more E2E tests with more confidence regardless of cost.',
      },
    ],
  },
};

export default content;
