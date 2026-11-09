import type { ModuleContent } from '../../../types';
import { bullets, code, dedent, diagram, flow, interviewTip, note, section, steps, table, text, tip, warn } from '../helpers';

const content: Partial<ModuleContent> = {
  supertest: {
    summary: 'Supertest is a third-party library that sends HTTP requests to an Express (or any Node `http`) app in-process — `request(app).get("/x").expect(200)` — binding an ephemeral port itself so you never call `app.listen()` in tests.',
    topics: ['Supertest', 'request(app)', 'HTTP assertions', 'expect status', 'app factory', 'auth in tests', 'agent cookies'],
    sections: [
      section('introduction', undefined,
        text('To test an API you want to send real HTTP requests and check status codes, headers and JSON — without deploying, without picking a port, and fast. Supertest does exactly that.'),
      ),
      section('definition', 'What it is',
        text('`supertest` (npm) wraps the `superagent` HTTP client. You pass it your app (a request handler function or `http.Server`) and chain request builders and assertions.'),
        table('Supertest API', ['Call', 'Purpose'], [
          ['`request(app)`', 'Target an app/server (no `listen` needed)'],
          ['`.get/.post/.put/.patch/.delete(path)`', 'HTTP method and path'],
          ['`.set(header, value)`', 'Request headers, e.g. Authorization'],
          ['`.query({ ... })`', 'Query string'],
          ['`.send(body)`', 'JSON (objects) or raw body'],
          ['`.attach(field, path)`', 'Multipart file upload'],
          ['`.expect(200)` / `.expect("Content-Type", /json/)` / `.expect(body)`', 'Built-in assertions'],
          ['`request.agent(app)`', 'Persist cookies between requests (sessions)'],
        ]),
      ),
      section('why', 'Why it is the standard for Express integration tests',
        bullets(
          'Exercises the real middleware chain: body parsing, auth, validation, error handler.',
          'No port conflicts — tests can run in parallel.',
          'Works with any test runner (Jest, Vitest, `node:test`).',
        ),
      ),
      section('internals', 'How it works without app.listen()',
        steps(
          '`request(app)` checks: if `app` is a function (Express apps are `(req, res) => …` handlers), it creates `http.createServer(app)`.',
          'On the first request it calls `server.listen(0)` — port 0 asks the OS for any free ephemeral port.',
          'It sends the HTTP request to `127.0.0.1:<port>` and buffers the response; JSON is parsed into `res.body`.',
          '`.expect(...)` assertions run against the response; failures reject the promise.',
          'The ephemeral server is closed after the request ends.',
        ),
        flow([
          'request(app)',
          'http.createServer(app)',
          'listen(0) → random port',
          'send HTTP request',
          'assert status/headers/body',
          'close server',
        ], { title: 'Supertest lifecycle', direction: 'horizontal' }),
        diagram('middleware-pipeline', 'The request goes through every middleware exactly as in production.'),
      ),
      section('example', 'Testing an Express API',
        code({
          title: 'App factory (no listen) + tests',
          code: dedent(`
            // src/app.js
            import express from 'express';
            export function createApp({ todos }) {
              const app = express();
              app.use(express.json());
              app.get('/api/todos', async (req, res) => res.json(await todos.list()));
              app.post('/api/todos', async (req, res) => {
                if (typeof req.body.title !== 'string' || !req.body.title.trim()) {
                  return res.status(400).json({ error: 'title required' });
                }
                res.status(201).json(await todos.create(req.body.title));
              });
              return app;
            }

            // src/server.js — the ONLY place that listens
            // createApp({ todos: realRepo }).listen(process.env.PORT ?? 3000);

            // test/todos.test.js
            import { test } from 'node:test';
            import assert from 'node:assert/strict';
            import request from 'supertest';
            import { createApp } from '../src/app.js';

            const memoryTodos = () => {
              const items = [];
              return { list: async () => items, create: async (title) => { const t = { id: items.length + 1, title }; items.push(t); return t; } };
            };

            test('POST then GET', async () => {
              const app = createApp({ todos: memoryTodos() });
              const created = await request(app).post('/api/todos').send({ title: 'Ship it' })
                .expect('Content-Type', /json/)
                .expect(201);
              assert.deepEqual(created.body, { id: 1, title: 'Ship it' });

              const list = await request(app).get('/api/todos').expect(200);
              assert.equal(list.body.length, 1);
            });

            test('validation error', async () => {
              const res = await request(createApp({ todos: memoryTodos() })).post('/api/todos').send({}).expect(400);
              assert.deepEqual(res.body, { error: 'title required' });
            });
          `),
          expectedOutput: '$ node --test\n✔ POST then GET (24.1ms)\n✔ validation error (3.2ms)\nℹ tests 2\nℹ pass 2\nℹ fail 0',
          explanation: [
            'Separating `createApp` from `server.js` is what makes the app testable without a port.',
            '`.send(obj)` sets `Content-Type: application/json` automatically.',
            'Here an in-memory repo is injected; in a full integration test you would pass a real test DB repo.',
          ],
        }),
        code({
          title: 'Auth headers, cookies with agent',
          code: dedent(`
            test('session login persists across requests', async () => {
              const agent = request.agent(app);               // stores Set-Cookie and resends it
              await agent.post('/login').send({ email: 'ana@x.io', password: 'pw' }).expect(204);
              const me = await agent.get('/api/me').expect(200);
              assert.equal(me.body.email, 'ana@x.io');
            });

            test('JWT-protected route', async () => {
              const token = signTestToken({ sub: 1, role: 'user' });   // helper using the test secret
              await request(app).get('/api/admin/stats').set('Authorization', \`Bearer \${token}\`).expect(403);
              await request(app).get('/api/admin/stats').expect(401);
            });
          `),
          expectedOutput: '✔ session login persists across requests (31ms)\n✔ JWT-protected route (5ms)',
          explanation: [
            '`request.agent` behaves like a browser cookie jar for session-based auth tests.',
            'Testing both 401 (no token) and 403 (wrong role) checks authN and authZ separately.',
          ],
        }),
      ),
      section('real-world', 'Patterns',
        bullets(
          'One `createApp(deps)` factory; tests inject fakes or test-DB repositories.',
          'Write an access-control matrix test: loop over routes × roles and assert expected statuses.',
          'Snapshot the error shape once; assert specific fields elsewhere.',
          'For a server that must listen (WebSockets), start it on port 0 in `before` and close it in `after`.',
        ),
        tip('Use `.expect(fn)` for custom checks: `.expect((res) => assert.ok(res.headers["x-request-id"]))`.'),
      ),
      section('mistakes', 'Common mistakes',
        bullets(
          'Calling `app.listen(3000)` in `app.js` — tests then collide on the port and hang the runner.',
          'Forgetting `await` (or `return`) on the request chain — assertions never run.',
          'Mixing `.end(cb)` callbacks with `await`.',
          'Asserting exact error messages from libraries that change between versions.',
        ),
      ),
      section('interview', 'Interview angle',
        interviewTip('Explain *how* Supertest avoids a fixed port (`listen(0)`), and why you separate app creation from `listen()`. That shows test-friendly architecture.'),
      ),
      section('practice', 'Practice',
        text('Add Supertest tests for `DELETE /api/todos/:id`: 204 on success, 404 for an unknown id, 401 without a token. Run them in parallel with another test file to confirm there are no port clashes.'),
      ),
      section('summary', 'Summary',
        bullets(
          'Supertest (third-party) = in-process HTTP testing for Node/Express.',
          '`request(app).verb(path).set().send().expect()`.',
          'Uses an ephemeral port internally — never `listen()` in the app module.',
          '`request.agent` keeps cookies; test 401 vs 403 separately.',
        ),
      ),
    ],
    revisionNotes: [
      '`request(app)` → `http.createServer(app).listen(0)` internally.',
      'Export the app; listen only in `server.js`.',
      '`.expect(status)`, `.expect(header, regex)`, `.expect(body)`.',
      '`request.agent(app)` for cookie sessions.',
      'Always await the chain.',
    ],
    quiz: [
      {
        kind: 'find-bug', difficulty: 'intermediate',
        prompt: 'Test files fail with `EADDRINUSE` when run in parallel. What is the cause?',
        code: "// app.js\nconst app = express();\napp.get('/health', (req, res) => res.send('ok'));\napp.listen(3000);\nmodule.exports = app;",
        options: [
          'Supertest needs a different port',
          'The module itself calls `listen(3000)`; every test process importing it tries to bind the same port',
          'res.send must be res.json',
          'Express cannot be exported',
        ],
        answer: 1,
        explanation: 'Importing app.js starts a server. Export the app and call `listen` only in a separate entry file; Supertest binds an ephemeral port itself.',
      },
      {
        kind: 'mcq', difficulty: 'beginner',
        prompt: 'What does `request.agent(app)` add over `request(app)`?',
        options: [
          'It runs requests in parallel',
          'It persists cookies between requests, like a browser session',
          'It mocks the database',
          'It disables middleware',
        ],
        answer: 1,
        explanation: 'An agent keeps a cookie jar, so a login followed by authenticated requests works with session cookies.',
      },
    ],
    interview: [
      {
        category: 'express-backend', kind: 'concept', difficulty: 'intermediate', topic: 'Supertest',
        question: 'How does Supertest test an Express app without you starting the server on a port?',
        shortAnswer: 'It wraps the app in `http.createServer`, listens on port 0 so the OS assigns a free ephemeral port, sends the request, runs assertions, then closes the server.',
        detailedAnswer: [
          'An Express app is a request handler function, so it can be passed to `http.createServer`.',
          'Port 0 = OS chooses a free port, so parallel test files never clash.',
          'Response is buffered; JSON bodies are parsed into `res.body`.',
          'Requires the app module not to call `listen()` itself.',
        ],
        followUp: 'How would you structure the app to support this?',
        trap: 'Thinking Supertest mocks HTTP — it makes real HTTP requests over loopback.',
      },
      {
        category: 'express-backend', kind: 'scenario', difficulty: 'advanced', topic: 'Supertest',
        question: 'How would you automatically verify that every protected route in an Express API rejects unauthenticated and unauthorised requests?',
        shortAnswer: 'Build a route/permission matrix (from the router stack or an explicit list), then generate Supertest cases that call each route with no token, a low-privilege token and the right token, asserting 401, 403/404 and success.',
        detailedAnswer: [
          'Keep a declarative table: method, path, allowed roles, sample params/body.',
          'Optionally walk `app.router.stack` (Express internals — version dependent) to detect routes missing from the table and fail the test.',
          'Use helper tokens per role signed with the test secret.',
          'Include cross-tenant users to catch IDOR (expect 404).',
          'Run in CI so new routes cannot ship without an entry.',
        ],
        followUp: 'How do you keep this matrix maintainable as the API grows?',
        trap: 'Testing only the happy path with an admin token.',
      },
    ],
  },

  mocking: {
    summary: 'Mocking replaces a real dependency with a test double so a test can control its behaviour and verify how it was used; mocks, stubs, spies and fakes are related but distinct kinds of test double.',
    topics: ['mocking', 'test doubles', 'mock vs stub vs spy', 'fake', 'dummy', 'jest.fn', 'vi.fn', 'mock.fn', 'over-mocking', 'interaction testing'],
    sections: [
      section('introduction', undefined,
        text('Your code sends emails, charges cards and calls APIs. Tests must not. Test doubles stand in for those dependencies — and mocks also let you check that the right call was made.'),
      ),
      section('definition', 'Kinds of test doubles',
        table('Mock vs stub vs spy (and friends)', ['Double', 'What it does', 'You assert on', 'Example'], [
          ['Dummy', 'Fills a parameter; never used', 'Nothing', '`createService({ logger: {} })`'],
          ['Stub', 'Returns canned answers', 'The **result** of the code under test', '`repo.findById = async () => ({ id: 1 })`'],
          ['Spy', 'Wraps a real (or stub) function and records calls', 'Calls, while real behaviour may still run', '`jest.spyOn(console, "error")`'],
          ['Mock', 'Pre-programmed double whose **interactions** are verified', 'That it was called with the right args/times', '`expect(mailer.send).toHaveBeenCalledWith("a@b.io")`'],
          ['Fake', 'Working lightweight implementation', 'Results (behaves like the real thing)', 'In-memory repository, fake SMTP server'],
        ]),
        note('In everyday tooling `jest.fn()`, `vi.fn()` and `mock.fn()` create objects that can act as stub, spy or mock depending on how you use them. The *role* is what matters.'),
      ),
      section('why', 'Why and when to mock',
        bullets(
          'Speed and determinism: no network, no real time.',
          'Simulate hard-to-reproduce cases: timeouts, 500s from Stripe, disk full.',
          'Verify side effects that have no return value: "an email was sent", "an event was published".',
          '**Mock at the boundaries you do not own** (HTTP APIs, email, payment). Avoid mocking your own internals.',
        ),
      ),
      section('internals', 'How a mock function works',
        steps(
          'A mock is a function that closes over a `calls` array.',
          'Every invocation pushes its arguments (and `this`, result or thrown error) into that array.',
          'Its implementation is swappable: default returns `undefined`; you can set a return value, a resolved promise, or a sequence (`…Once`).',
          'Assertions inspect the recorded calls.',
          'Module mocking goes one step further: the test framework swaps what `require`/`import` returns for a given path.',
        ),
        flow([
          'Test creates mock',
          'Injects into code under test',
          'Code calls mock(args)',
          'Mock records + returns canned value',
          'Test asserts on result and calls',
        ], { title: 'Mock lifecycle', direction: 'horizontal' }),
      ),
      section('example', 'Mocks in practice',
        code({
          title: 'Build a mock function from scratch (pure JS)',
          runnable: true,
          code: dedent(`
            function fn(impl = () => undefined) {
              const queue = [];
              const mock = (...args) => {
                mock.calls.push(args);
                const next = queue.length ? queue.shift() : impl;
                return next(...args);
              };
              mock.calls = [];
              mock.mockReturnValueOnce = (v) => (queue.push(() => v), mock);
              mock.mockImplementation = (f) => ((impl = f), mock);
              return mock;
            }

            // code under test
            function checkout(cart, payments, mailer) {
              const charge = payments.charge(cart.userId, cart.total);
              if (!charge.ok) return 'declined';
              mailer.send(cart.email, 'Receipt ' + charge.id);
              return 'paid';
            }

            const payments = { charge: fn().mockReturnValueOnce({ ok: false }).mockImplementation(() => ({ ok: true, id: 'ch_1' })) };
            const mailer = { send: fn() };
            const cart = { userId: 7, total: 42, email: 'ana@x.io' };

            console.log(checkout(cart, payments, mailer), mailer.send.calls.length);
            console.log(checkout(cart, payments, mailer), JSON.stringify(mailer.send.calls));
            console.log(JSON.stringify(payments.charge.calls));
          `),
          expectedOutput: 'declined 0\npaid [["ana@x.io","Receipt ch_1"]]\n[[7,42],[7,42]]',
          explanation: [
            'First call: the queued "once" value `{ ok: false }` → declined, no email sent.',
            'Second call: falls back to the implementation → paid, one email with the right args.',
            '`calls` is exactly what `toHaveBeenCalledWith` and `mock.calls` inspect in real tools.',
          ],
        }),
        code({
          title: 'Mock vs stub vs spy with real APIs',
          code: dedent(`
            // ---- Jest ----
            const repo = { findById: jest.fn().mockResolvedValue({ id: 1, name: 'Ana' }) }; // STUB role
            const mailer = { send: jest.fn() };                                             // MOCK role
            const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});      // SPY (silenced)

            await greetUser(1, { repo, mailer });
            expect(mailer.send).toHaveBeenCalledWith('ana@x.io', expect.stringContaining('Hello Ana'));
            expect(errSpy).not.toHaveBeenCalled();
            errSpy.mockRestore();

            // ---- Vitest ---- same, with vi.fn() / vi.spyOn()

            // ---- node:test ----
            import { mock } from 'node:test';
            const send = mock.fn();
            const spy = mock.method(console, 'error', () => {});
            // ...
            assert.deepEqual(send.mock.calls[0].arguments, ['ana@x.io', 'Hello Ana']);
            spy.mock.restore();
          `),
          expectedOutput: '✓ greets the user by email (2 ms)',
          explanation: [
            '`repo.findById` only supplies data — we never assert on it (stub).',
            '`mailer.send` is the behaviour under test — we verify the interaction (mock).',
            '`console.error` is spied on to check *no* errors were logged, then restored.',
          ],
        }),
        code({
          title: 'Mocking HTTP at the boundary (Node 18+ fetch)',
          code: dedent(`
            // Inject the HTTP client instead of calling global fetch deep inside
            export const createWeather = ({ fetch }) => ({
              async tempC(city) {
                const r = await fetch(\`https://api.weather.example/v1?q=\${encodeURIComponent(city)}\`);
                if (!r.ok) throw new Error('weather unavailable');
                return (await r.json()).temp_c;
              },
            });

            test('handles upstream 503', async () => {
              const fakeFetch = mock.fn(async () => new Response('busy', { status: 503 }));
              await assert.rejects(createWeather({ fetch: fakeFetch }).tempC('Oslo'), /unavailable/);
              assert.match(fakeFetch.mock.calls[0].arguments[0], /q=Oslo/);
            });
          `),
          expectedOutput: '✔ handles upstream 503 (0.8ms)',
          explanation: [
            '`Response` is a global in Node 18+, so building fake responses is easy.',
            'Simulating a 503 is trivial with a mock and nearly impossible with the real API.',
            'Network-level tools (nock, msw, undici MockAgent) are alternatives when injection is not possible.',
          ],
        }),
      ),
      section('real-world', 'Guidelines',
        bullets(
          'Mock what you do not own (third-party HTTP, email, payment, clock); use real code or fakes for what you do own.',
          'Prefer **fakes** (in-memory repo) for complex collaborators — they survive refactors better than call-by-call mocks.',
          'Keep interaction assertions for meaningful side effects only.',
          'Reset mocks between tests (`clearMocks`/`restoreMocks` config, or `t.mock` auto-restore).',
        ),
      ),
      section('mistakes', 'Common mistakes',
        bullets(
          '**Over-mocking**: mocking every collaborator so the test only verifies the implementation\'s call sequence — any refactor breaks it, real bugs slip through.',
          'Mocks drifting from reality (the real API changed shape; the mock did not) — back them with contract/integration tests.',
          'Leaking mock state between tests.',
          'Mocking the unit under test itself.',
        ),
        warn('A suite where everything is mocked can be 100% green while production is broken. Pair unit tests with integration tests against real infrastructure.'),
      ),
      section('interview', 'Interview angle',
        interviewTip('Have the mock/stub/spy/fake table ready with one example each, and state your rule: "mock at architectural boundaries I do not own; prefer fakes; verify interactions only for side effects."'),
      ),
      section('practice', 'Practice',
        text('Write a `notifyOverdueInvoices({ repo, mailer, clock })` service. Test it with a fake in-memory repo, a mock mailer and a stub clock. Assert both the returned count and the emails sent.'),
      ),
      section('summary', 'Summary',
        bullets(
          'Test doubles: dummy, stub (answers), spy (records), mock (verified interactions), fake (lightweight impl).',
          '`jest.fn`/`vi.fn`/`mock.fn` can play any role.',
          'Mock boundaries you do not own; avoid over-mocking.',
          'Reset/restore between tests.',
        ),
      ),
    ],
    revisionNotes: [
      'Stub → canned return; assert on result.',
      'Mock → assert on interactions (called with/times).',
      'Spy → record calls of a real method (`spyOn`), restore after.',
      'Fake → working simplified implementation (in-memory DB).',
      'Mock what you don\'t own; prefer DI.',
    ],
    quiz: [
      {
        kind: 'mcq', difficulty: 'intermediate',
        prompt: 'A test replaces `repo.findUser` with a function returning `{ id: 1 }` and only asserts on the function\'s return value. What role does the replacement play?',
        options: ['Mock', 'Spy', 'Stub', 'Dummy'],
        answer: 2,
        explanation: 'It provides canned data and is not verified — a stub. If the test asserted on how it was called, it would be acting as a mock.',
      },
      {
        kind: 'scenario', difficulty: 'advanced',
        prompt: 'After a harmless refactor (merging two private helpers), 30 unit tests fail although behaviour is unchanged. What is the likely root cause?',
        options: [
          'The refactor introduced a bug',
          'Tests are over-mocked and assert on internal call sequences instead of observable behaviour',
          'The test runner cache is stale',
          'Coverage is too high',
        ],
        answer: 1,
        explanation: 'Tests coupled to implementation details break on refactor. Assert on outputs and boundary side effects; use fakes for internal collaborators.',
      },
      {
        kind: 'predict-output', difficulty: 'intermediate',
        prompt: 'What does this log?',
        code: "const f = jest.fn().mockReturnValueOnce('a').mockReturnValue('b');\nconsole.log(f(), f(), f());",
        options: ['a a a', 'a b b', 'b b b', 'a b undefined'],
        answer: 1,
        explanation: 'The "once" value is used for the first call; afterwards the default `mockReturnValue` applies.',
      },
    ],
    interview: [
      {
        category: 'advanced', kind: 'concept', difficulty: 'intermediate', topic: 'Mocking',
        question: 'What is the difference between a mock, a stub, a spy and a fake?',
        shortAnswer: 'A stub returns canned data, a spy records calls (often to a real function), a mock is a double whose interactions you verify, and a fake is a simplified working implementation.',
        detailedAnswer: [
          'Stub: `findById → { id: 1 }`; you assert on the result of the code under test.',
          'Spy: `spyOn(console, "error")`; real or replaced behaviour, plus call recording.',
          'Mock: `expect(mailer.send).toHaveBeenCalledWith(...)` — interaction is the assertion.',
          'Fake: in-memory repository implementing the same interface.',
          'Tools like `jest.fn()` can serve all roles; the distinction is how you use them.',
        ],
        followUp: 'When would you prefer a fake over a mock?',
        trap: 'Saying they are all the same thing.',
      },
      {
        category: 'advanced', kind: 'concept', difficulty: 'advanced', topic: 'Mocking',
        question: 'What are the risks of over-mocking, and how do you decide what to mock?',
        shortAnswer: 'Over-mocked tests verify implementation details, break on refactors and pass while real integrations are broken; mock only boundaries you do not own or that are slow/non-deterministic, and cover real wiring with integration tests.',
        detailedAnswer: [
          'Mocks encode assumptions about collaborators; if those assumptions are wrong, tests still pass.',
          'Interaction-heavy tests fail on every refactor → developers stop trusting them.',
          'Mock: third-party APIs, email, payments, clock, randomness.',
          'Do not mock: your own pure logic, value objects, simple internal collaborators.',
          'Use contract tests or recorded fixtures to keep mocks honest.',
        ],
        followUp: 'What is a contract test?',
        trap: 'Believing higher mock usage means better isolation and therefore better tests.',
      },
    ],
  },

  stubbing: {
    summary: 'Stubbing replaces a dependency with a version that returns predetermined answers — values, errors or sequences — so a test can drive the code under test down a specific path deterministically.',
    topics: ['stubbing', 'stub', 'canned responses', 'mockResolvedValue', 'mockRejectedValue', 'error paths', 'sinon', 'time stubbing'],
    sections: [
      section('introduction', undefined,
        text('How do you test what happens when the database times out, or when the third call to an API fails? You **stub** the dependency to answer exactly that way.'),
      ),
      section('definition', 'Definition',
        text('A **stub** is a test double that supplies indirect inputs to the code under test. You assert on the code\'s output, not on the stub.'),
        table('Stub behaviours', ['Need', 'Jest / Vitest', 'node:test'], [
          ['Return a value', '`fn.mockReturnValue(v)`', '`mock.fn(() => v)`'],
          ['Resolve a promise', '`fn.mockResolvedValue(v)`', '`mock.fn(async () => v)`'],
          ['Reject / throw', '`fn.mockRejectedValue(err)`', '`mock.fn(async () => { throw err })`'],
          ['Different value per call', '`mockReturnValueOnce(a).mockReturnValueOnce(b)`', '`fn.mock.mockImplementationOnce(impl, n)`'],
          ['Replace a method on an object', '`jest.spyOn(obj, "m").mockReturnValue(v)`', '`mock.method(obj, "m", impl)`'],
          ['Control time', '`jest.useFakeTimers().setSystemTime(d)`', '`mock.timers.enable({ apis: ["Date"], now: d })`'],
        ]),
      ),
      section('why', 'Why stubs',
        bullets(
          'Force error branches that are hard to trigger for real (timeouts, 429s, constraint violations).',
          'Make inputs deterministic (fixed time, fixed random ids).',
          'Keep unit tests fast and independent of infrastructure.',
        ),
      ),
      section('internals', 'Stub-driven test flow',
        steps(
          'Decide which path you want to test (success, retry, failure).',
          'Program the stub with the answers that produce that path.',
          'Call the code under test.',
          'Assert on its return value, thrown error or state — the stub just fed it data.',
        ),
        flow([
          'Stub: 1st call rejects (timeout)',
          'Stub: 2nd call resolves',
          'Code under test retries',
          'Assert: returns data after 1 retry',
        ], { title: 'Testing a retry path with a sequenced stub', direction: 'horizontal' }),
      ),
      section('example', 'Stubbing in action',
        code({
          title: 'Sequenced stub drives a retry helper (pure JS)',
          runnable: true,
          code: dedent(`
            function stubSequence(...answers) {
              let i = 0;
              return async () => {
                const a = answers[Math.min(i++, answers.length - 1)];
                if (a instanceof Error) throw a;
                return a;
              };
            }

            async function withRetry(fn, attempts = 3) {
              let lastErr;
              for (let n = 1; n <= attempts; n++) {
                try { return { value: await fn(), attempts: n }; }
                catch (e) { lastErr = e; }
              }
              throw lastErr;
            }

            (async () => {
              const flaky = stubSequence(new Error('ETIMEDOUT'), new Error('ETIMEDOUT'), { id: 1 });
              console.log(JSON.stringify(await withRetry(flaky)));
              const down = stubSequence(new Error('ECONNREFUSED'));
              try { await withRetry(down); } catch (e) { console.log('gave up:', e.message); }
            })();
          `),
          expectedOutput: '{"value":{"id":1},"attempts":3}\ngave up: ECONNREFUSED',
          explanation: [
            'The stub fails twice then succeeds — the exact scenario you want to test, on demand.',
            'The second stub always fails, so the helper exhausts its attempts and rethrows.',
            'Assertions target `withRetry`\'s output, not the stub — that is what makes it a stub, not a mock.',
          ],
        }),
        code({
          title: 'Stubbing a DB error and the clock',
          code: dedent(`
            // Jest / Vitest
            test('maps unique-violation to 409', async () => {
              const repo = { create: jest.fn().mockRejectedValue(Object.assign(new Error('dup'), { code: '23505' })) };
              const res = await createUserHandler({ repo })({ body: { email: 'a@b.io' } });
              expect(res).toEqual({ status: 409, body: { error: 'Email already registered' } });
            });

            test('token expires after 15 minutes', () => {
              jest.useFakeTimers().setSystemTime(new Date('2026-01-01T10:00:00Z'));
              const t = issueToken({ sub: 1 });
              jest.setSystemTime(new Date('2026-01-01T10:15:01Z'));
              expect(isExpired(t)).toBe(true);
              jest.useRealTimers();
            });

            // node:test
            test('uses a fixed date', (t) => {
              t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-01-01T00:00:00Z') });
              assert.equal(new Date().toISOString(), '2026-01-01T00:00:00.000Z');
            });
          `),
          expectedOutput: '✓ maps unique-violation to 409 (1 ms)\n✓ token expires after 15 minutes (1 ms)\n✔ uses a fixed date (0.3ms)',
          explanation: [
            'Postgres error code `23505` (unique_violation) is stubbed — no need to insert a real duplicate.',
            'Fake system time makes expiry tests exact and instant.',
            '`mock.timers` with the `Date` API is supported in recent Node versions (20.x/21.2+ — check your release).',
          ],
        }),
      ),
      section('real-world', 'Real-world use',
        bullets(
          'Stub upstream HTTP errors (429/503) to test backoff and circuit breakers.',
          'Stub `crypto.randomUUID` (or inject an id generator) for stable snapshots.',
          'Sinon (third-party) is a standalone stub/spy/mock library often paired with Mocha.',
          'Keep stub data realistic — copy real response shapes from API docs or recorded fixtures.',
        ),
        tip('If you need many stubs to test one function, the function probably has too many dependencies — consider splitting it.'),
      ),
      section('mistakes', 'Common mistakes',
        bullets(
          'Asserting on how the stub was called when you only care about the output (turns it into a brittle mock).',
          'Stubbing with unrealistic shapes (`{ ok: true }` when the real API returns `{ status: "succeeded" }`).',
          'Forgetting to restore stubs on shared objects (`console`, `fs`, `Date`).',
          'Stubbing a sync function with `mockResolvedValue` (returns a promise) or vice versa.',
        ),
      ),
      section('interview', 'Interview angle',
        interviewTip('Describe a concrete error-path test: "I stub the repository to reject with a unique-violation code and assert the handler returns 409." That demonstrates why stubs matter.'),
      ),
      section('practice', 'Practice',
        text('Write tests for a `getExchangeRate()` that caches results for 60 s. Stub the HTTP client and fake the clock: assert one upstream call for two lookups within 60 s and two calls when 61 s have passed.'),
      ),
      section('summary', 'Summary',
        bullets(
          'Stubs feed predetermined answers to drive specific paths.',
          'Return values, resolved/rejected promises, per-call sequences, fake time.',
          'Assert on the code under test, not on the stub.',
          'Keep stubbed data realistic; restore after use.',
        ),
      ),
    ],
    revisionNotes: [
      'Stub = indirect input; assert on output.',
      '`mockResolvedValue` / `mockRejectedValue` / `…Once` sequences.',
      'Fake time: `jest.setSystemTime`, `mock.timers.enable({ apis: ["Date"] })`.',
      'Realistic shapes; restore global stubs.',
    ],
    quiz: [
      {
        kind: 'complete-code', difficulty: 'intermediate',
        prompt: 'Make the stub reject so the error branch is tested.',
        code: "const repo = { save: jest.fn()./* ??? */ };\nawait expect(service.create({})).rejects.toThrow('db down');",
        options: [
          "mockReturnValue('db down')",
          "mockRejectedValue(new Error('db down'))",
          "mockResolvedValue(new Error('db down'))",
          'mockClear()',
        ],
        answer: 1,
        explanation: '`mockRejectedValue` returns a rejected promise. `mockResolvedValue(new Error(...))` resolves with an Error object, so nothing is thrown.',
      },
      {
        kind: 'find-bug', difficulty: 'advanced',
        prompt: 'Later tests in the file start failing with weird timestamps. Why?',
        code: "test('formats today', () => {\n  jest.useFakeTimers().setSystemTime(new Date('2020-01-01'));\n  expect(formatToday()).toBe('2020-01-01');\n});",
        options: [
          'setSystemTime only accepts numbers',
          'Fake timers are never restored, so every following test still sees 2020-01-01 and frozen timers',
          'formatToday is async',
          'Jest does not support Date',
        ],
        answer: 1,
        explanation: 'Global stubs leak across tests. Call `jest.useRealTimers()` in `afterEach` (or configure fake timers per test).',
      },
    ],
    interview: [
      {
        category: 'advanced', kind: 'scenario', difficulty: 'advanced', topic: 'Stubbing',
        question: 'How would you test a function that retries an HTTP call with exponential backoff, without the test taking seconds?',
        shortAnswer: 'Inject or stub the HTTP client to fail a set number of times then succeed, and use fake timers to advance through the backoff delays instantly while asserting on attempt counts and the final result.',
        detailedAnswer: [
          'Stub sequence: reject, reject, resolve (and a separate test with always-reject).',
          'Fake timers (`jest.useFakeTimers`, `t.mock.timers`) so `setTimeout` delays advance manually.',
          'With async code, interleave `await` and timer advances (e.g. `jest.advanceTimersByTimeAsync`) so promises settle between ticks.',
          'Inject jitter/random source to make delays deterministic.',
          'Assert: number of calls, delays used (spy on the sleep function), final value or error.',
        ],
        followUp: 'Why can fake timers deadlock with promises if used naively?',
        trap: 'Using real timers and small delays, making the suite slow and flaky.',
      },
    ],
  },

  'code-coverage': {
    summary: 'Code coverage measures which statements, branches, functions and lines ran during tests — collected via V8 (c8, `node --experimental-test-coverage`, Vitest v8) or Istanbul instrumentation — and is a tool for finding untested code, not a quality score to max out.',
    topics: ['code coverage', 'statement coverage', 'branch coverage', 'function coverage', 'line coverage', 'c8', 'istanbul', 'nyc', 'V8 coverage', 'coverage thresholds'],
    sections: [
      section('introduction', undefined,
        text('Coverage answers "which code did my tests execute?" It is excellent at revealing untested branches — and terrible at proving tests are good.'),
      ),
      section('definition', 'The four metrics',
        table('Coverage metrics', ['Metric', 'Counts', 'Example gap'], [
          ['Statement', 'Executed statements / all statements', 'An early `return` never hit'],
          ['Branch', 'Each side of every `if`, `?:`, `&&`, `||`, `??`, `switch` case', '`if (x)` tested only when x is truthy'],
          ['Function', 'Functions called at least once', 'An error handler never invoked'],
          ['Line', 'Lines with at least one executed statement', 'Like statements, but per line'],
        ]),
        table('Tools', ['Tool', 'How', 'Notes'], [
          ['Istanbul / nyc', 'Instruments source with counters (Babel)', 'Jest default (`coverageProvider: "babel"`)'],
          ['c8', 'Uses V8\'s native coverage, maps to source', 'No instrumentation; works with ESM'],
          ['`node --experimental-test-coverage`', 'V8 coverage built into node:test', 'Experimental'],
          ['Vitest', '`@vitest/coverage-v8` or `-istanbul`', 'Pick provider in config'],
        ]),
      ),
      section('why', 'Why measure it (and why 100% is not the goal)',
        bullets(
          'Finds code no test touches — especially error paths and rarely-used branches.',
          'A threshold in CI prevents coverage from silently eroding.',
          'But executed ≠ verified: a test without assertions still produces coverage.',
          'Chasing 100% leads to tests of trivial getters and generated code, and to tests coupled to implementation. Diminishing returns start well before 100%.',
        ),
      ),
      section('internals', 'How coverage is collected',
        steps(
          '**Instrumentation (Istanbul)**: code is rewritten before running — a counter increment is inserted before every statement, branch and function: `cov.s[3]++; if (cov.b[1][0]++, x) …`.',
          '**Native (V8)**: V8 already tracks execution counts for functions and blocks; with `NODE_V8_COVERAGE=dir`, Node writes raw coverage JSON on exit.',
          'Reports map byte ranges back to source lines (using source maps for TypeScript/bundled code).',
          'Reporters render text, HTML, lcov (for CI services) and JSON summaries.',
        ),
        flow([
          'Source code',
          'Instrument (Istanbul) or V8 counters',
          'Run tests',
          'Raw counts',
          'Source-map remap',
          'Reports: text / html / lcov',
        ], { title: 'Coverage pipeline', direction: 'horizontal' }),
      ),
      section('example', 'Seeing the difference between metrics',
        code({
          title: 'Hand-instrumented branch coverage (pure JS)',
          runnable: true,
          code: dedent(`
            const hits = { s1: 0, s2: 0, s3: 0, bIfTrue: 0, bIfFalse: 0 };
            function shipping(total, isMember) {
              hits.s1++;
              let fee = 5;
              if (isMember || total > 100) { hits.bIfTrue++; hits.s2++; fee = 0; }
              else { hits.bIfFalse++; }
              hits.s3++;
              return fee;
            }

            // "test suite" with a single case
            console.log(shipping(150, false) === 0 ? 'test passed' : 'test failed');
            const statements = ['s1', 's2', 's3'].filter((k) => hits[k] > 0).length;
            const branches = ['bIfTrue', 'bIfFalse'].filter((k) => hits[k] > 0).length;
            console.log('statements: ' + statements + '/3 = ' + Math.round(statements / 3 * 100) + '%');
            console.log('branches:   ' + branches + '/2 = ' + Math.round(branches / 2 * 100) + '%');
          `),
          expectedOutput: 'test passed\nstatements: 3/3 = 100%\nbranches:   1/2 = 50%',
          explanation: [
            'One test executes every statement → 100% statement coverage.',
            'But the "else" path (non-member, small order → fee 5) never ran → 50% branch coverage.',
            'Real tools also count `||` operands as branches, so a real report would show even more gaps.',
            'This is why branch coverage is the more informative metric.',
          ],
        }),
        code({
          title: 'Running coverage with different tools',
          language: 'bash',
          code: dedent(`
            # Built-in (node:test)
            node --test --experimental-test-coverage

            # c8 (third-party) around any command
            npx c8 --reporter=text --reporter=lcov --check-coverage --branches 80 node --test

            # Jest
            npx jest --coverage

            # Vitest (needs @vitest/coverage-v8)
            npx vitest run --coverage
          `),
          expectedOutput: dedent(`
            ----------------|---------|----------|---------|---------|-------------------
            File            | % Stmts | % Branch | % Funcs | % Lines | Uncovered Line #s
            ----------------|---------|----------|---------|---------|-------------------
            All files       |   91.3  |    72.0  |   88.9  |   91.3  |
             shipping.js    |  100    |    50.0  |  100    |  100    | 4
             orders.js      |   86.7  |    80.0  |   83.3  |   86.7  | 41-44
            ----------------|---------|----------|---------|---------|-------------------
            ERROR: Coverage for branches (72%) does not meet global threshold (80%)
          `),
          explanation: [
            '`--check-coverage` (c8) or `coverageThreshold` (Jest) fails CI under the limit.',
            '"Uncovered Line #s" tells you exactly where to look.',
            'lcov output feeds services that comment coverage diffs on pull requests.',
          ],
        }),
      ),
      section('real-world', 'Using coverage well',
        bullets(
          'Set a realistic threshold (e.g. 80% lines, 70–80% branches) and ratchet it up, rather than demanding 100%.',
          'Review **uncovered branches in changed code** on each PR — more useful than a global number.',
          'Exclude generated code, migrations and config files from the denominator.',
          'Complement with **mutation testing** (e.g. Stryker — third-party), which checks that tests *fail* when code is changed.',
        ),
        note('V8-based coverage (c8, node:test, Vitest v8) needs no code transformation and is fast; Istanbul instrumentation can be more precise for some constructs. Both are acceptable.'),
      ),
      section('mistakes', 'Common mistakes',
        bullets(
          'Treating coverage as a quality metric and gaming it with assertion-less tests.',
          'Only tracking line coverage — branches hide most untested logic.',
          'Requiring 100% and forcing tests for unreachable defensive code.',
          'Forgetting source maps for TypeScript, producing reports on compiled JS.',
        ),
      ),
      section('interview', 'Interview angle',
        interviewTip('Say: "Coverage shows what is *not* tested; it cannot show that what is executed is verified. I gate on branch coverage for changed code and use mutation testing for critical modules."'),
      ),
      section('practice', 'Practice',
        text('Run coverage on one of your projects, find the file with the lowest branch coverage, and add tests until each uncovered branch is exercised *and* asserted. Then delete an assertion and observe that coverage does not drop.'),
      ),
      section('summary', 'Summary',
        bullets(
          'Metrics: statement, branch, function, line — branch is the most revealing.',
          'Tools: Istanbul/nyc (instrumentation), c8 / node:test / Vitest v8 (native V8).',
          'Use thresholds to prevent decline; focus on changed code.',
          'Coverage ≠ test quality; 100% is not the goal.',
        ),
      ),
    ],
    revisionNotes: [
      'Branch coverage counts both sides of if/?:/&&/||/??.',
      'Istanbul instruments; c8 uses V8 native coverage (`NODE_V8_COVERAGE`).',
      '`node --test --experimental-test-coverage`.',
      'Thresholds in CI; review uncovered branches in diffs.',
      'Executed ≠ asserted → mutation testing.',
    ],
    quiz: [
      {
        kind: 'predict-output', difficulty: 'intermediate',
        prompt: 'The only test calls `discount(200)`. What is the branch coverage of this function?',
        code: "function discount(total) {\n  if (total > 100) return total * 0.9;\n  return total;\n}",
        options: ['100% branches', '50% branches', '0% branches', '75% branches'],
        answer: 1,
        explanation: 'Only the `true` side of `total > 100` runs; the false side is never taken → 1 of 2 branches. Statement coverage would be 2/3.',
      },
      {
        kind: 'mcq', difficulty: 'intermediate',
        prompt: 'A module has 100% line coverage. What can you conclude?',
        options: [
          'It has no bugs',
          'Every line was executed by some test — not that results were asserted correctly or that all branches/inputs were tested',
          'Branch coverage is also 100%',
          'Mutation score is 100%',
        ],
        answer: 1,
        explanation: 'Coverage measures execution only. Lines with `a || b` can be fully "covered" while one operand never decides the result.',
      },
    ],
    interview: [
      {
        category: 'advanced', kind: 'concept', difficulty: 'intermediate', topic: 'Code coverage',
        question: 'What is the difference between statement, branch, function and line coverage, and which is most useful?',
        shortAnswer: 'Statement and line coverage count executed code, function coverage counts called functions, and branch coverage counts each decision outcome; branch coverage is usually most useful because it exposes untested conditions.',
        detailedAnswer: [
          'Statement: each statement executed at least once.',
          'Line: each line with an executed statement (one line may hold several statements).',
          'Function: each function invoked at least once.',
          'Branch: both outcomes of `if`, ternaries, logical operators, switch cases.',
          'High statement coverage with low branch coverage is common and hides bugs.',
        ],
        followUp: 'How does mutation testing complement coverage?',
        trap: 'Treating line coverage as sufficient.',
      },
      {
        category: 'advanced', kind: 'concept', difficulty: 'advanced', topic: 'Code coverage',
        question: 'How do Istanbul-style instrumentation and V8 native coverage differ in how they collect data?',
        shortAnswer: 'Istanbul rewrites the source to insert counters before running it; V8 coverage uses counters the engine already maintains and dumps them (e.g. via `NODE_V8_COVERAGE`), which tools like c8 map back to source.',
        detailedAnswer: [
          'Instrumentation requires a transform step (Babel), slightly slows execution, and needs care with ESM loaders.',
          'V8 coverage works on unmodified code, including native ESM, and is fast.',
          'V8 reports byte ranges per function/block; mapping to lines and branches relies on source maps for transpiled code.',
          'Results can differ slightly for edge constructs; pick one provider and keep it consistent.',
          'Jest supports both (`coverageProvider: "babel" | "v8"`), Vitest too.',
        ],
        followUp: 'Why do TypeScript projects need source maps for accurate coverage?',
        trap: 'Assuming all tools produce identical numbers.',
      },
    ],
  },
};

export default content;
