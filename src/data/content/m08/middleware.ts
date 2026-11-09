import type { ModuleContent } from '../../../types';
import {
  bullets, code, dedent, diagram, flow, interviewTip, note, section, steps, table, text, warn,
} from '../helpers';

const content: Partial<ModuleContent> = {
  // ───────────────────────────────────────────────────────────
  'application-middleware': {
    summary: 'Application-level middleware is bound to the `app` with `app.use()` or `app.METHOD()`; it runs for every matching request in registration order and can be mounted on a path prefix.',
    topics: ['app.use', 'mount path', 'req.baseUrl', 'req.originalUrl', 'middleware order', 'global middleware', 'route-level middleware'],
    sections: [
      section('introduction', undefined,
        text('Some logic belongs to the whole application: security headers, body parsing, logging. Application-level middleware is how you attach it.'),
      ),
      section('definition', 'Definition',
        bullets(
          '`app.use(fn)` — runs for every request (path defaults to `/`).',
          '`app.use("/admin", fn)` — runs for `/admin` and everything below it.',
          '`app.get("/x", mw1, mw2, handler)` — route-level middleware, only for that route.',
          '`app.use([mw1, mw2])` — arrays (and nested arrays) are flattened.',
        ),
      ),
      section('why', 'Why order matters',
        table('Order decides behaviour', ['Order', 'Result'], [
          ['`express.json()` → routes', '`req.body` parsed in routes'],
          ['routes → `express.json()`', '`req.body` undefined in routes'],
          ['`express.static` → auth', 'Static files are public'],
          ['auth → `express.static`', 'Static files require login'],
          ['rate limiter → login route', 'Login is protected from brute force'],
        ]),
      ),
      section('internals', 'Mount paths and URLs',
        steps(
          'For `app.use("/admin", fn)`, Express checks that `req.url` starts with `/admin` on a segment boundary (`/administrator` does **not** match).',
          'Before calling `fn`, Express strips the mount path: inside, `req.url` is `/users` for `/admin/users`.',
          '`req.baseUrl` becomes `/admin`; `req.originalUrl` keeps `/admin/users?x=1`.',
          'After `fn` calls `next()`, Express restores `req.url` for the next layer.',
        ),
        table('URL properties for GET /admin/users?x=1 inside app.use("/admin")', ['Property', 'Value'], [
          ['`req.originalUrl`', '`/admin/users?x=1`'],
          ['`req.baseUrl`', '`/admin`'],
          ['`req.url`', '`/users?x=1`'],
          ['`req.path`', '`/users`'],
        ]),
      ),
      section('example', 'Global and mounted middleware',
        code({
          title: 'Application-level middleware',
          code: dedent(`
            const express = require('express');
            const app = express();

            app.use((req, res, next) => {
              console.log('[global]', req.method, req.originalUrl);
              next();
            });

            app.use('/admin', (req, res, next) => {
              console.log('[admin] baseUrl=' + req.baseUrl + ' url=' + req.url);
              if (req.get('x-admin-key') !== process.env.ADMIN_KEY) return res.sendStatus(403);
              next();
            });

            app.get('/admin/stats', (req, res) => res.json({ users: 42 }));
            app.get('/public', (req, res) => res.send('hello'));

            app.listen(3000);
          `),
          expectedOutput: '[global] GET /public\n[global] GET /admin/stats\n[admin] baseUrl=/admin url=/stats',
          explanation: [
            'The global logger sees every request.',
            'The admin guard only runs under `/admin`, and sees the stripped `req.url`.',
            'Requests without the right key get `403 Forbidden` and never reach the route.',
          ],
        }),
        code({
          title: 'Route-level middleware',
          code: dedent(`
            const requireJson = (req, res, next) =>
              req.is('application/json') ? next() : res.status(415).json({ error: 'JSON required' });

            app.post('/orders', requireJson, express.json(), createOrder);
          `),
          explanation: ['Middleware listed before the handler runs only for this route.'],
        }),
      ),
      section('real-world', 'Real-world usage',
        bullets(
          'Put cheap rejections (rate limit, CORS preflight) early to save work.',
          'Mount health checks before auth so load balancers do not need credentials.',
          'Apply heavy middleware (e.g. large body limits) only to the routes that need it.',
        ),
      ),
      section('mistakes', 'Common mistakes',
        code({
          title: 'Wrong vs right: auth registered too late',
          code: dedent(`
            // ✗ routes registered before auth are public
            app.use('/api/users', usersRouter);
            app.use(requireAuth);

            // ✓ auth first (or attach it to the router)
            app.use('/api', requireAuth);
            app.use('/api/users', usersRouter);
          `),
        }),
        bullets(
          'Relying on `req.url` for logging inside mounted middleware — use `req.originalUrl`.',
          'Applying a 10 MB JSON limit globally instead of on the one upload route.',
        ),
      ),
      section('interview', 'Interview angle',
        interviewTip('Give a concrete order-matters example (body parser before routes, static before/after auth). Mention `req.originalUrl` vs `req.url` vs `req.baseUrl` to show depth.'),
      ),
      section('practice', 'Practice',
        text('Add a middleware mounted at `/api` that sets `Cache-Control: no-store` on every API response, and verify that `/public` responses do not get it.'),
      ),
      section('summary', 'Summary',
        bullets(
          '`app.use` for global/prefix middleware; extra route arguments for route-level.',
          'Mount path is stripped from `req.url`; `req.baseUrl`/`req.originalUrl` keep context.',
          'Prefix matching respects segment boundaries.',
          'Order is behaviour.',
        ),
      ),
    ],
    revisionNotes: [
      '`app.use("/admin")` matches `/admin`, `/admin/x`, not `/administrator`.',
      'Inside mounted middleware: `req.url` stripped, `req.baseUrl` = mount, `req.originalUrl` = full.',
      'Route-level middleware: `app.get(path, mw1, mw2, handler)`.',
      'Middleware order decides public vs protected and parsed vs unparsed.',
    ],
    quiz: [
      {
        kind: 'predict-output', difficulty: 'intermediate',
        prompt: 'For `GET /api/users?x=1`, what does this log?',
        code: "app.use('/api', (req, res, next) => {\n  console.log(req.baseUrl, req.url);\n  next();\n});",
        options: ['/api /api/users?x=1', '/api /users?x=1', '/ /api/users', '/api/users ?x=1'],
        answer: 1,
        explanation: 'The mount path moves into `req.baseUrl` and is stripped from `req.url`, which keeps the query string.',
      },
      {
        kind: 'mcq', difficulty: 'beginner',
        prompt: 'Does `app.use("/admin", fn)` run for `/administrator`?',
        options: ['Yes, it is a string prefix', 'No, matching is on path segment boundaries', 'Only for GET', 'Only if `strict` routing is enabled'],
        answer: 1,
        explanation: 'Express matches whole segments: `/admin` and `/admin/...` only.',
      },
    ],
    interview: [
      {
        category: 'express-backend', kind: 'scenario', difficulty: 'intermediate', topic: 'Middleware order',
        question: 'A teammate added authentication middleware but some API routes are still reachable without a token. What would you check?',
        shortAnswer: 'Registration order: any router or route registered before the auth middleware (or outside its mount path) is unaffected, because Express runs layers top-down.',
        detailedAnswer: [
          'Check whether `app.use(requireAuth)` comes after `app.use("/api/x", router)`.',
          'Check the mount path: `app.use("/api/v1", requireAuth)` does not cover `/api/v2`.',
          'Check `express.static` or health routes intentionally placed before auth.',
          'Prefer attaching auth at the router level (`router.use(requireAuth)`) so it travels with the routes.',
          'Add an integration test that hits every route without a token and expects 401.',
        ],
        followUp: 'How would you make some routes in the same router public?',
        trap: 'Assuming `app.use` applies retroactively to routes registered earlier.',
      },
      {
        category: 'express-backend', kind: 'concept', difficulty: 'intermediate', topic: 'Mount paths',
        question: 'What are req.originalUrl, req.baseUrl, req.url and req.path inside mounted middleware?',
        shortAnswer: '`originalUrl` is the full request URL, `baseUrl` is the mount path, `url` is the URL with the mount path stripped (query included), and `path` is `url` without the query.',
        detailedAnswer: [
          'Express rewrites `req.url` while inside a mounted layer and restores it afterwards.',
          'Use `originalUrl` for logging and redirects back to the same page.',
          'Use `baseUrl` to build links relative to a router\'s mount.',
          '`req.url` is the Node core property Express mutates; `req.path`/`baseUrl`/`originalUrl` are Express additions.',
        ],
        followUp: 'Why might logging `req.url` in an error handler give misleading results?',
        trap: 'Assuming `req.url` is always the full path.',
      },
    ],
  },

  // ───────────────────────────────────────────────────────────
  'router-middleware': {
    summary: '`express.Router()` creates a mini-app with its own middleware stack and routes; mount it with `app.use(path, router)` and use `mergeParams` to access parent route params.',
    topics: ['express.Router', 'router.use', 'router.route', 'mergeParams', 'next("router")', 'modular routes', 'nested routers'],
    sections: [
      section('introduction', undefined,
        text('A single file with 200 routes is unmaintainable. Routers split an API into feature modules that each own their middleware.'),
      ),
      section('definition', 'Definition',
        bullets(
          '`const router = express.Router(options)` — an isolated stack of middleware and routes.',
          'Options: `mergeParams` (inherit parent params), `caseSensitive`, `strict` (trailing slash).',
          '`router.use(mw)` applies only to requests that entered this router.',
          'A router is itself middleware: `app.use("/users", router)`.',
        ),
        table('Application vs router middleware', ['', 'app.use', 'router.use'], [
          ['Scope', 'Whole app (or prefix)', 'Only requests routed into this router'],
          ['Settings (`app.set`)', 'Yes', 'No — routers have no settings or `listen`'],
          ['Typical use', 'Parsing, security headers', 'Feature-specific auth, param loading'],
        ]),
      ),
      section('why', 'Why routers',
        bullets(
          'Feature modules: `users.routes.js`, `orders.routes.js` each export a router.',
          'Middleware travels with routes — moving a router keeps its auth.',
          'Versioning: mount `v1Router` and `v2Router` under different prefixes.',
        ),
      ),
      section('internals', 'Nested routers and params',
        steps(
          '`app.use("/projects/:projectId/tasks", tasksRouter)` — the app layer captures `projectId`.',
          'The request enters `tasksRouter` with `req.params` reset to only the child\'s params.',
          'With `mergeParams: true`, Express merges the parent\'s params (child wins on name conflicts).',
          '`next("router")` from inside a router skips the rest of it and continues in the parent stack.',
        ),
        flow(['app', 'app.use("/projects/:projectId/tasks")', 'tasksRouter (mergeParams)', 'router.get("/:taskId")', 'req.params = { projectId, taskId }'], { direction: 'horizontal' }),
      ),
      section('example', 'Feature router with its own middleware',
        code({
          title: 'routes/tasks.routes.js',
          code: dedent(`
            const express = require('express');
            const router = express.Router({ mergeParams: true });

            router.use((req, res, next) => {
              console.log('tasks router, project', req.params.projectId);
              next();
            });

            router.get('/', (req, res) => {
              res.json({ projectId: req.params.projectId, tasks: [] });
            });

            router.get('/:taskId', (req, res) => {
              res.json({ projectId: req.params.projectId, taskId: req.params.taskId });
            });

            module.exports = router;
          `),
        }),
        code({
          title: 'app.js',
          code: dedent(`
            const express = require('express');
            const tasksRouter = require('./routes/tasks.routes');

            const app = express();
            app.use('/projects/:projectId/tasks', tasksRouter);
            app.listen(3000);
          `),
          expectedOutput: 'tasks router, project p1\ntasks router, project p1',
          explanation: ['Logged once per request for the two requests below; `router.use` runs only inside this router.'],
        }),
        code({
          title: 'Responses',
          language: 'http',
          code: 'GET /projects/p1/tasks HTTP/1.1\n\nGET /projects/p1/tasks/t9 HTTP/1.1',
          expectedOutput: 'HTTP/1.1 200 OK\n{"projectId":"p1","tasks":[]}\n\nHTTP/1.1 200 OK\n{"projectId":"p1","taskId":"t9"}',
          explanation: ['Without `mergeParams: true`, `projectId` would be `undefined` in both responses.'],
        }),
      ),
      section('real-world', 'Real-world patterns',
        bullets(
          '`router.use(requireAuth)` at the top of an admin router.',
          'Public + private in one router: declare public routes first, then `router.use(requireAuth)`, then private routes.',
          'An `api/index.js` router that mounts all feature routers, then `app.use("/api/v1", apiRouter)`.',
        ),
        warn('A router mounted at `/` with `router.use(requireAuth)` runs that auth check for **every** request that enters it — including requests meant for routers mounted later. Mount routers on specific prefixes.'),
      ),
      section('mistakes', 'Common mistakes',
        code({
          title: 'Wrong vs right: router-wide middleware leaking',
          code: dedent(`
            // ✗ adminRouter mounted at "/" → requireAdmin runs for /public too
            adminRouter.use(requireAdmin);
            app.use('/', adminRouter);
            app.use('/', publicRouter);

            // ✓ mount on a prefix
            app.use('/admin', adminRouter);
            app.use('/', publicRouter);
          `),
        }),
        bullets(
          'Forgetting `mergeParams` in nested routers.',
          'Calling `router.listen` — routers cannot listen; only the app (via Node `http`) can.',
        ),
      ),
      section('interview', 'Interview angle',
        interviewTip('Expect "how do you structure routes in a big app?" Talk about one router per feature, mounted under versioned prefixes, with router-level auth and `mergeParams` for nesting.'),
      ),
      section('practice', 'Practice',
        text('Create `/orgs/:orgId/members` and `/orgs/:orgId/members/:memberId` with a nested router. Add `router.param("memberId")` that 404s unknown members and logs both ids.'),
      ),
      section('summary', 'Summary',
        bullets(
          'Routers are mini-apps without settings or `listen`.',
          '`router.use` scopes middleware to the router.',
          '`mergeParams: true` exposes parent params.',
          'Mount routers on prefixes to avoid middleware leaking.',
        ),
      ),
    ],
    revisionNotes: [
      '`express.Router({ mergeParams: true })` for nested params.',
      'Routers have no `app.set` settings or `listen`.',
      '`next("router")` exits the current router.',
      'Router mounted at `/` runs its `router.use` middleware for every request entering it.',
    ],
    quiz: [
      {
        kind: 'find-bug', difficulty: 'intermediate',
        prompt: 'Why is `req.params.orgId` undefined in the child router?',
        code: "const members = express.Router();\nmembers.get('/', (req, res) => res.json({ org: req.params.orgId }));\napp.use('/orgs/:orgId/members', members);",
        options: [
          'Param names cannot contain uppercase letters',
          'The router was created without `{ mergeParams: true }`',
          'Mounted routers cannot have params in their path',
          'You must use `req.query.orgId`',
        ],
        answer: 1,
        explanation: 'Each router\'s `req.params` contains only its own captures unless `mergeParams` is enabled.',
      },
      {
        kind: 'scenario', difficulty: 'advanced',
        prompt: 'After adding `app.use(adminRouter)` (no path) whose first line is `router.use(requireAdmin)`, the public `/health` route registered later returns 403. Best fix?',
        options: [
          'Move `/health` above `app.use(adminRouter)` and leave the rest',
          'Mount the router on a prefix: `app.use("/admin", adminRouter)`',
          'Call `next("route")` in requireAdmin',
          'Make requireAdmin async',
        ],
        answer: 1,
        explanation: 'An unprefixed router catches every request and its router-level middleware runs for all of them. Moving `/health` only patches one route; `next("route")` does nothing in `use` middleware.',
      },
    ],
    interview: [
      {
        category: 'express-backend', kind: 'concept', difficulty: 'intermediate', topic: 'express.Router',
        question: 'What does the mergeParams option on express.Router do?',
        shortAnswer: 'It makes the router\'s `req.params` include params captured by the parent mount path, e.g. `:projectId` from `/projects/:projectId/tasks`.',
        detailedAnswer: [
          'By default each router sees only params from its own route paths.',
          'With `mergeParams: true`, parent params are merged in; child names take precedence on conflict.',
          'Needed for nested REST resources implemented as nested routers.',
          'Other options: `caseSensitive`, `strict`.',
        ],
        followUp: 'Would you rather nest routers or flatten routes for deeply nested resources?',
        trap: 'Thinking params automatically propagate through `app.use`.',
      },
      {
        category: 'express-backend', kind: 'scenario', difficulty: 'advanced', topic: 'Router scoping',
        question: 'How would you design a router where a few routes are public and the rest require authentication, without leaking the auth check to other routers?',
        shortAnswer: 'Mount the router on its own prefix, declare public routes first, then `router.use(requireAuth)`, then the protected routes — or attach `requireAuth` per route/sub-router explicitly.',
        detailedAnswer: [
          'Router-level `router.use` affects only requests entering that router, but a router mounted at `/` receives every request.',
          'Order inside the router: public routes → `router.use(requireAuth)` → private routes.',
          'Alternative: two routers (`publicRouter`, `privateRouter`) mounted on the same prefix, with auth only on the private one.',
          'For clarity in reviews, explicit `router.get("/x", requireAuth, handler)` is the most obvious form.',
          'Back it with a test that enumerates routes and asserts which return 401 without a token.',
        ],
        followUp: 'How could you list all registered routes to build that test?',
        trap: 'Mounting several routers at `/` and being surprised that one router\'s middleware runs for another router\'s paths.',
      },
    ],
  },

  // ───────────────────────────────────────────────────────────
  'built-in-middleware': {
    summary: 'Express ships five built-in middleware factories — `express.json`, `express.urlencoded`, `express.raw`, `express.text` (body parsers) and `express.static` — each configurable with limits and type filters.',
    topics: ['express.json', 'express.urlencoded', 'express.raw', 'express.text', 'express.static', 'body limit', 'entity.parse.failed', 'webhook signatures'],
    sections: [
      section('introduction', undefined,
        text('Node core gives you the request body as a stream of chunks. Express\'s built-in parsers buffer, decode and parse it into `req.body` for you.'),
      ),
      section('definition', 'The built-ins',
        table('Built-in middleware', ['Factory', 'Parses', 'Default type', 'req.body'], [
          ['`express.json()`', 'JSON', '`application/json`', 'Object/array'],
          ['`express.urlencoded()`', 'HTML form posts', '`application/x-www-form-urlencoded`', 'Object (strings)'],
          ['`express.raw()`', 'Anything as bytes', '`application/octet-stream`', 'Buffer'],
          ['`express.text()`', 'Plain text', '`text/plain`', 'String'],
          ['`express.static(root)`', 'Serves files', '—', '—'],
        ]),
        bullets(
          'Common options: `limit` (default `"100kb"`), `type` (which Content-Types to parse), `inflate` (gzip/deflate bodies), `verify(req, res, buf)`.',
          '`express.json({ strict: true })` (default) accepts only objects and arrays at the top level.',
          '`express.urlencoded({ extended })` — Express 5 default `false` (Node `querystring`); `true` uses `qs` for nested objects.',
        ),
        note('Everything else (cookie-parser, cors, helmet, morgan, compression, multer) is a separate package. The body parsers come from the `body-parser` package bundled with Express.'),
      ),
      section('why', 'Why built in',
        bullets(
          'Almost every API needs JSON parsing — re-exported since Express 4.16 so no extra install is required.',
          'Size limits protect memory: without them a client could stream gigabytes into `JSON.parse`.',
        ),
      ),
      section('internals', 'What a body parser does',
        steps(
          'Checks `Content-Type` against `type`; if it does not match, calls `next()` and leaves `req.body` undefined.',
          'Reads the Node core request stream, enforcing `limit` as bytes arrive.',
          'Decompresses gzip/deflate/br if `inflate` is on, decodes the charset.',
          'Parses and sets `req.body`; errors become `next(err)` with `err.status` and `err.type`.',
        ),
        table('Parser errors', ['Situation', 'err.status', 'err.type'], [
          ['Malformed JSON', '400', '`entity.parse.failed`'],
          ['Body over limit', '413', '`entity.too.large`'],
          ['Unsupported charset', '415', '`charset.unsupported`'],
          ['Unsupported encoding', '415', '`encoding.unsupported`'],
        ]),
      ),
      section('example', 'Using the parsers',
        code({
          title: 'JSON, forms and a raw webhook route',
          code: dedent(`
            const express = require('express');
            const crypto = require('node:crypto');
            const app = express();

            // Raw body only for the webhook (must come before express.json for this path)
            app.post('/webhooks/payments', express.raw({ type: 'application/json', limit: '1mb' }), (req, res) => {
              const expected = crypto.createHmac('sha256', process.env.WEBHOOK_SECRET).update(req.body).digest('hex');
              const given = req.get('x-signature') ?? '';
              const ok = given.length === expected.length &&
                crypto.timingSafeEqual(Buffer.from(given), Buffer.from(expected));
              if (!ok) return res.sendStatus(401);
              const event = JSON.parse(req.body.toString('utf8'));
              res.json({ received: event.type });
            });

            app.use(express.json({ limit: '100kb' }));
            app.use(express.urlencoded({ extended: false }));

            app.post('/echo', (req, res) => res.json({ body: req.body }));

            app.use((err, req, res, next) => {
              if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON' });
              if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Payload too large' });
              next(err);
            });

            app.listen(3000);
          `),
          explanation: [
            'Signature checks need the **exact bytes** — parsing then re-stringifying changes them, hence `express.raw`.',
            'Route-level parsers run only for that route; the global `express.json` after it handles the rest.',
            'Parser errors have a `type` you can map to clean API responses.',
          ],
        }),
        code({
          title: 'Responses',
          language: 'http',
          code: 'POST /echo HTTP/1.1\nContent-Type: application/json\n\n{"a":1}\n\nPOST /echo HTTP/1.1\nContent-Type: application/json\n\n{"a":\n\nPOST /echo HTTP/1.1\nContent-Type: application/x-www-form-urlencoded\n\nname=Ada&role=admin\n\nPOST /echo HTTP/1.1\nContent-Type: text/plain\n\nhello',
          expectedOutput: 'HTTP/1.1 200 OK\n{"body":{"a":1}}\n\nHTTP/1.1 400 Bad Request\n{"error":"Invalid JSON"}\n\nHTTP/1.1 200 OK\n{"body":{"name":"Ada","role":"admin"}}\n\nHTTP/1.1 200 OK\n{}',
          explanation: [
            'The last request has `text/plain`, which no registered parser handles, so `req.body` stays `undefined` and `res.json({ body: undefined })` serialises to `{}`.',
          ],
          versionNote: 'In Express 4, an unparsed `req.body` was `{}`, so the last response would be `{"body":{}}`.',
        }),
      ),
      section('real-world', 'Real-world usage',
        bullets(
          'Stripe/GitHub webhooks: `express.raw` (or `verify` callback that stores `req.rawBody`).',
          'Server-rendered forms: `express.urlencoded`.',
          'Raise `limit` only on routes that need it (bulk import), never globally.',
        ),
      ),
      section('mistakes', 'Common mistakes',
        code({
          title: 'Wrong vs right: webhook body already parsed',
          code: dedent(`
            // ✗ express.json runs first → req.body is an object; signature check fails
            app.use(express.json());
            app.post('/webhooks', express.raw({ type: '*/*' }), verifySignature);

            // ✓ register the raw route before the global JSON parser
            app.post('/webhooks', express.raw({ type: 'application/json' }), verifySignature);
            app.use(express.json());
          `),
          explanation: ['Once a parser consumes the stream, the next parser sees `req._body` set and skips.'],
        }),
        bullets(
          'Client forgets `Content-Type: application/json` → body silently not parsed.',
          'Using `bodyParser` package imports in new code — `express.json()` is the same thing.',
        ),
      ),
      section('interview', 'Interview angle',
        interviewTip('Know the five built-ins, the default 100kb limit, the Content-Type gate, and the webhook raw-body pattern. That last one signals real production experience.'),
      ),
      section('practice', 'Practice',
        text('Add `express.text({ type: "text/csv", limit: "2mb" })` to `POST /import` and return the number of lines. Send a 3 MB file and handle the 413 cleanly.'),
      ),
      section('summary', 'Summary',
        bullets(
          'Built-ins: `json`, `urlencoded`, `raw`, `text`, `static`.',
          'Parsers are gated by Content-Type and limited to 100kb by default.',
          'Errors carry `status` + `type` (`entity.parse.failed`, `entity.too.large`).',
          'Use `express.raw` when you need exact bytes (signatures).',
        ),
      ),
    ],
    revisionNotes: [
      'Built-ins: `express.json/urlencoded/raw/text/static`; everything else is third-party.',
      'Default `limit` 100kb; malformed JSON → 400 `entity.parse.failed`; too big → 413 `entity.too.large`.',
      'Parser runs only when Content-Type matches `type`.',
      'Express 5: `urlencoded` `extended` defaults to false; `req.body` undefined when unparsed.',
      'Webhook signatures need the raw Buffer.',
    ],
    quiz: [
      {
        kind: 'scenario', difficulty: 'intermediate',
        prompt: 'Stripe webhook signature verification always fails even with the right secret. The app has `app.use(express.json())` at the top. What is wrong?',
        options: [
          'Webhooks must be GET requests',
          'The body was parsed to an object, so the raw bytes needed for the HMAC are gone',
          'The secret must be base64 encoded',
          'express.json strips headers',
        ],
        answer: 1,
        explanation: 'HMAC must be computed over the exact raw bytes. Use `express.raw()` for that route before the global JSON parser (or a `verify` callback).',
      },
      {
        kind: 'mcq', difficulty: 'beginner',
        prompt: 'What status does Express\'s JSON parser assign to a body larger than its `limit`?',
        options: ['400', '411', '413', '500'],
        answer: 2,
        explanation: '413 Payload Too Large with `err.type === "entity.too.large"`. 400 is for malformed JSON.',
      },
      {
        kind: 'predict-output', difficulty: 'intermediate',
        prompt: 'Express 5, only `app.use(express.json())` registered. A client POSTs `name=Ada` with `Content-Type: application/x-www-form-urlencoded`. What is `req.body`?',
        options: ['{ name: "Ada" }', '{}', 'undefined', '"name=Ada"'],
        answer: 2,
        explanation: 'The JSON parser ignores non-JSON content types; no other parser runs, so `req.body` is undefined in Express 5 (it was `{}` in Express 4).',
      },
    ],
    interview: [
      {
        category: 'express-backend', kind: 'concept', difficulty: 'beginner', topic: 'Built-in middleware',
        question: 'Which middleware is built into Express itself?',
        shortAnswer: '`express.json`, `express.urlencoded`, `express.raw`, `express.text` and `express.static` — the first four are body parsers from the bundled `body-parser`, the last serves files via `serve-static`.',
        detailedAnswer: [
          '`express.static` has always been built in; `json`/`urlencoded` were re-exported in Express 4.16 and `raw`/`text` in 4.17.',
          'Cookie parsing, CORS, security headers, logging, compression and multipart uploads are separate packages.',
          'Each parser takes `limit`, `type`, `inflate`, `verify` options.',
          'Express 4 removed the old Connect middleware bundle; Express 5 keeps the same five.',
        ],
        followUp: 'Why is multipart/form-data not handled by a built-in parser?',
        trap: 'Listing `cors` or `cookie-parser` as built-ins.',
      },
      {
        category: 'express-backend', kind: 'concept', difficulty: 'intermediate', topic: 'Body parsing errors',
        question: 'What happens when express.json() receives malformed JSON or an oversized body, and how should an API respond?',
        shortAnswer: 'The parser calls `next(err)` with `status` 400 (`type: "entity.parse.failed"`) or 413 (`type: "entity.too.large"`); your error middleware should map these to clean JSON error responses instead of leaking a stack trace.',
        detailedAnswer: [
          'The limit is enforced while streaming, so huge bodies are rejected early.',
          'Errors skip routes and go to error middleware.',
          'Check `err.type` or `err.status` and respond with a stable error shape.',
          'The default Express error handler would send an HTML page — not ideal for APIs.',
        ],
        followUp: 'How would you allow a larger body only on one route?',
        trap: 'Wrapping `JSON.parse` in route handlers — parsing already happened (and failed) in middleware.',
      },
    ],
  },

  // ───────────────────────────────────────────────────────────
  'custom-middleware': {
    summary: 'Custom middleware are your own `(req, res, next)` functions — usually built with a factory that takes options — for logging, timing, request ids, auth, feature flags and more.',
    topics: ['middleware factory', 'configurable middleware', 'res.on("finish")', 'request id', 'res.locals', 'async middleware', 'AsyncLocalStorage'],
    sections: [
      section('introduction', undefined,
        text('Built-ins cover parsing. Everything specific to your app — request ids, timing, tenant resolution — is custom middleware.'),
      ),
      section('definition', 'Patterns',
        bullets(
          '**Plain middleware**: `function logger(req, res, next) { ...; next(); }`.',
          '**Factory**: `function rateLimit(opts) { return (req, res, next) => {...} }` — configuration via closure.',
          '**Async middleware**: `async (req, res, next) => { req.user = await load(); next(); }` — Express 5 forwards rejections.',
        ),
      ),
      section('why', 'Why factories',
        bullets(
          'Options are validated once at startup, not per request.',
          'Same middleware, different configs per router: `requireRole("admin")`, `requireRole("editor")`.',
          'Matches how third-party middleware is used (`cors(options)`, `express.json(options)`).',
        ),
      ),
      section('internals', 'Running code after the response',
        steps(
          'Code after `next()` runs when downstream **returns**, which for async handlers is before the response finishes.',
          'Node core `ServerResponse` emits `finish` when the last byte is handed to the OS, and `close` when the connection ends.',
          'Use `res.on("finish")` for access logs/metrics; check `res.writableFinished` on `close` to detect aborted requests.',
          'High-resolution timing: `process.hrtime.bigint()` or `performance.now()` (Node core).',
        ),
      ),
      section('example', 'Request id + access log middleware',
        code({
          title: 'middleware/requestLogger.js',
          code: dedent(`
            const { randomUUID } = require('node:crypto');

            function requestLogger({ header = 'x-request-id', log = console.log } = {}) {
              return (req, res, next) => {
                const start = process.hrtime.bigint();
                const id = req.get(header) || randomUUID();
                res.locals.requestId = id;
                res.set(header, id);

                res.on('finish', () => {
                  const ms = Number(process.hrtime.bigint() - start) / 1e6;
                  log(JSON.stringify({ id, method: req.method, url: req.originalUrl, status: res.statusCode, ms: Math.round(ms) }));
                });
                next();
              };
            }

            module.exports = { requestLogger };
          `),
          explanation: [
            'Factory pattern: options with defaults, returns the real middleware.',
            'The id is set as a response header so clients can quote it in bug reports.',
            '`finish` gives the final status code and full duration.',
          ],
        }),
        code({
          title: 'Using it',
          code: dedent(`
            const app = express();
            app.use(requestLogger());
            app.get('/slow', async (req, res) => {
              await new Promise((r) => setTimeout(r, 120));
              res.json({ ok: true });
            });
            app.listen(3000);
            // curl -H "x-request-id: abc" localhost:3000/slow
          `),
          expectedOutput: '{"id":"abc","method":"GET","url":"/slow","status":200,"ms":121}',
          explanation: ['The duration varies slightly per run; the id is echoed from the request header.'],
        }),
        code({
          title: 'Pure-JS: a configurable middleware factory',
          runnable: true,
          code: dedent(`
            function requireHeader(name, expected) {
              if (!name) throw new Error('header name required');
              return (req, res, next) => {
                if (req.headers[name] !== expected) return res.status(403);
                next();
              };
            }

            const mw = requireHeader('x-feature', 'beta');
            const res = { code: 200, status(c) { this.code = c; console.log('status', c); return this; } };
            mw({ headers: { 'x-feature': 'beta' } }, res, () => console.log('next called'));
            mw({ headers: {} }, res, () => console.log('next called'));
          `),
          expectedOutput: 'next called\nstatus 403',
          explanation: ['Configuration is captured in a closure; each call returns an independent middleware.'],
        }),
      ),
      section('real-world', 'Real-world custom middleware',
        bullets(
          'Tenant resolution from subdomain → `req.tenant`.',
          'Request context with Node core `AsyncLocalStorage` so loggers can read the request id anywhere.',
          'Maintenance mode / feature flags returning 503.',
          'Idempotency keys for POST payments.',
        ),
      ),
      section('mistakes', 'Common mistakes',
        code({
          title: 'Wrong vs right: timing in the wrong place',
          code: dedent(`
            // ✗ measures only until downstream returns (async handlers return immediately)
            app.use((req, res, next) => {
              const t = Date.now();
              next();
              console.log('took', Date.now() - t);
            });

            // ✓ measure on finish
            app.use((req, res, next) => {
              const t = Date.now();
              res.on('finish', () => console.log('took', Date.now() - t));
              next();
            });
          `),
        }),
        bullets(
          'Setting headers inside `finish` — too late, they are already sent.',
          'Storing per-request data in module-level variables — shared across concurrent requests.',
          'Doing heavy sync work (e.g. `bcrypt.hashSync`) in middleware — blocks every request.',
        ),
      ),
      section('interview', 'Interview angle',
        interviewTip('Write the factory form, use `res.on("finish")` for timing, and mention that module-level state is shared between concurrent requests — use `req`, `res.locals` or AsyncLocalStorage instead.'),
      ),
      section('practice', 'Practice',
        text('Write `maintenanceMode({ enabled, allowIps })` that returns 503 with a `Retry-After: 120` header unless `req.ip` is in `allowIps`.'),
      ),
      section('summary', 'Summary',
        bullets(
          'Custom middleware is just a function; factories make it configurable.',
          'Use `res.on("finish")` for post-response work.',
          'Keep per-request state on `req`/`res.locals`, never in module variables.',
          'Async middleware is safe in Express 5.',
        ),
      ),
    ],
    revisionNotes: [
      'Factory = function returning `(req, res, next)`; configure once, use many times.',
      '`res.on("finish")` (Node core event) for logs/metrics; headers must be set before.',
      'Per-request data on `req` or `res.locals`; never module-level variables.',
      '`AsyncLocalStorage` (node:async_hooks) gives request context without passing `req` around.',
    ],
    quiz: [
      {
        kind: 'find-bug', difficulty: 'advanced',
        prompt: 'Under load, users sometimes see each other\'s data. What is wrong?',
        code: "let currentUser;\napp.use(async (req, res, next) => {\n  currentUser = await loadUser(req.get('authorization'));\n  next();\n});\napp.get('/me', async (req, res) => {\n  const prefs = await loadPrefs();\n  res.json({ user: currentUser, prefs });\n});",
        options: [
          'loadUser should be synchronous',
          'A module-level variable is shared by all concurrent requests; another request overwrites it during the await',
          'next() must be awaited',
          'res.json cannot serialise users',
        ],
        answer: 1,
        explanation: 'Node handles many requests concurrently on one thread. Store request data on `req` (e.g. `req.user`) or in AsyncLocalStorage.',
      },
      {
        kind: 'mcq', difficulty: 'intermediate',
        prompt: 'Where should a middleware measure total response time?',
        options: ['Right after `next()` returns', 'In a `res.on("finish")` listener', 'In `process.on("exit")`', 'In the error handler'],
        answer: 1,
        explanation: '`finish` fires after the response is fully handed off. Code after `next()` runs as soon as downstream returns, which for async handlers is almost immediately.',
      },
    ],
    interview: [
      {
        category: 'express-backend', kind: 'concept', difficulty: 'intermediate', topic: 'Custom middleware',
        question: 'How do you write configurable middleware in Express?',
        shortAnswer: 'Write a factory function that takes options and returns a `(req, res, next)` function that closes over them — the same pattern used by `cors()` or `express.json()`.',
        detailedAnswer: [
          'Validate options at creation time and fail fast at startup.',
          'Return a new middleware per call so different routers can have different configs.',
          'Keep the returned function small and fast; it runs on every matching request.',
          'Export it from `middleware/` and unit test it with fake `req`/`res` objects.',
        ],
        followUp: 'How would you unit test such a middleware without Express?',
        trap: 'Re-reading config or creating clients on every request inside the middleware.',
      },
      {
        category: 'express-backend', kind: 'scenario', difficulty: 'advanced', topic: 'Request context',
        question: 'You want every log line, even deep in services, to include the current request id without passing req through every function. How?',
        shortAnswer: 'Use Node core `AsyncLocalStorage`: a middleware calls `als.run({ requestId }, next)`, and the logger reads `als.getStore()` anywhere in the same async call chain.',
        detailedAnswer: [
          'AsyncLocalStorage (node:async_hooks) propagates a store through promises, timers and callbacks.',
          'Middleware: generate/read `x-request-id`, then `als.run(store, () => next())`.',
          'Logger (e.g. pino mixin) adds `requestId` from `als.getStore()`.',
          'Overhead is low in modern Node; it is the standard approach for tracing (OpenTelemetry uses it).',
          'Contrast with module-level variables, which are shared across concurrent requests.',
        ],
        followUp: 'What can cause the async context to be lost?',
        trap: 'Using a global variable — it gets overwritten by concurrent requests.',
      },
    ],
  },

  // ───────────────────────────────────────────────────────────
  'error-handling-middleware': {
    summary: 'Error-handling middleware has four parameters `(err, req, res, next)`, must be registered after routes, and receives errors from `next(err)`, sync throws and — in Express 5 — rejected promises.',
    topics: ['(err, req, res, next)', 'next(err)', 'async errors', 'Express 4 vs 5', 'express-async-errors', 'default error handler', 'res.headersSent'],
    sections: [
      section('introduction', undefined,
        text('Errors will happen: invalid input, DB timeouts, bugs. Error middleware gives you one place to turn them into consistent HTTP responses.'),
      ),
      section('definition', 'Definition',
        bullets(
          'Express identifies error middleware by **arity**: `fn.length === 4`. You must declare all four params, even if `next` is unused.',
          'Errors reach it via `next(err)`, a synchronous `throw` in a handler, or (Express 5) a rejected promise returned by a handler.',
          'You can chain several error middleware; call `next(err)` to pass along.',
          'If none responds, Express\'s **default error handler** sends 500 (or `err.status`).',
        ),
        table('How async errors reach error middleware', ['Situation', 'Express 4', 'Express 5'], [
          ['`throw` in sync handler', 'Caught → error middleware', 'Caught → error middleware'],
          ['`async` handler rejects', 'Unhandled rejection; request hangs', 'Caught → `next(err)` automatically'],
          ['Error in a callback (`setTimeout`, `fs.readFile` cb)', 'Not caught — crash/hang', 'Not caught — call `next(err)` yourself'],
          ['Fix in Express 4', '`try/catch` + `next(err)`, wrapper, or `express-async-errors`', 'Not needed for promises'],
        ]),
      ),
      section('why', 'Why centralize',
        bullets(
          'Consistent JSON error shape for clients.',
          'Never leak stack traces or SQL errors to users in production.',
          'One place for logging, metrics and alerting.',
        ),
      ),
      section('internals', 'How Express routes errors',
        steps(
          'Express wraps each handler call in try/catch; in Express 5 it also checks if the return value is a promise and attaches `.catch(next)`.',
          'Once `next(err)` is called, the router skips every layer whose handler has fewer than 4 params.',
          'The first 4-arity layer that matches the path runs.',
          'If it calls `next()` (no arg), normal processing resumes — rarely what you want.',
          'Default handler: uses `err.status`/`err.statusCode`, sends stack in development (`NODE_ENV !== "production"`), and if headers were already sent it closes the connection.',
        ),
        diagram('middleware-pipeline', 'An error skips normal middleware and lands in the first error handler.'),
      ),
      section('example', 'Error middleware in Express 5',
        code({
          title: 'Async errors with no try/catch',
          code: dedent(`
            const express = require('express');
            const app = express();

            app.get('/users/:id', async (req, res) => {
              const user = await db.findUser(req.params.id); // rejects: connection refused
              res.json(user);
            });

            app.get('/boom', (req, res) => {
              throw new Error('sync failure');
            });

            // eslint-disable-next-line no-unused-vars
            app.use((err, req, res, next) => {
              console.error('[error]', req.method, req.originalUrl, err.message);
              if (res.headersSent) return next(err);
              res.status(err.status ?? 500).json({ error: err.expose ? err.message : 'Internal Server Error' });
            });

            app.listen(3000);
          `),
          expectedOutput: '[error] GET /users/1 connect ECONNREFUSED 127.0.0.1:5432\n[error] GET /boom sync failure',
          explanation: [
            'In Express 5 the rejected `await` is forwarded automatically.',
            '`res.headersSent` check delegates to the default handler, which closes the connection when a response was already streaming.',
            '`err.expose` is set by `http-errors` (used by body parsers) for 4xx errors safe to show.',
          ],
        }),
        code({
          title: 'Response',
          language: 'http',
          code: 'GET /users/1 HTTP/1.1',
          expectedOutput: 'HTTP/1.1 500 Internal Server Error\nContent-Type: application/json; charset=utf-8\n\n{"error":"Internal Server Error"}',
        }),
        code({
          title: 'Express 4 equivalent',
          code: dedent(`
            // Express 4: must forward async errors manually
            const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

            app.get('/users/:id', asyncHandler(async (req, res) => {
              res.json(await db.findUser(req.params.id));
            }));
            // or: require('express-async-errors') once at startup (third-party patch)
          `),
          versionNote: 'Express 4 only. Remove these wrappers when upgrading to Express 5.',
        }),
      ),
      section('real-world', 'Real-world shape',
        bullets(
          'One error handler at the very end of `app.js`, after the 404 handler.',
          'Map known error classes (validation, not found, auth) to 4xx; everything else 500.',
          'Log with request id, never send internals to clients.',
        ),
      ),
      section('mistakes', 'Common mistakes',
        code({
          title: 'Wrong vs right: three params',
          code: dedent(`
            // ✗ only 3 params → treated as normal middleware, never receives errors
            app.use((err, req, res) => res.status(500).json({ error: err.message }));

            // ✓ four params, registered last
            app.use((err, req, res, next) => res.status(500).json({ error: 'Internal Server Error' }));
          `),
        }),
        bullets(
          'Registering the error handler before routes.',
          'Throwing inside a `setTimeout` or event callback — not caught by Express in any version.',
          'Sending `err.message`/`err.stack` for 500s in production.',
          'Defining parameters with default values or rest syntax — that changes `fn.length` and breaks detection.',
        ),
      ),
      section('interview', 'Interview angle',
        interviewTip('The classic questions: "how does Express know it is an error handler?" (arity 4) and "how do you handle async errors?" — answer for both Express 4 and Express 5.'),
      ),
      section('practice', 'Practice',
        text('Create routes that (1) throw synchronously, (2) reject asynchronously, (3) throw inside `setTimeout`. Observe which reach your error handler in Express 5, then fix (3) by wrapping with a promise.'),
      ),
      section('summary', 'Summary',
        bullets(
          'Error middleware = exactly 4 declared params, registered last.',
          'Express 5 forwards rejected promises; Express 4 needs wrappers.',
          'Callback-based errors still need manual `next(err)`.',
          'Check `res.headersSent` and never leak internals.',
        ),
      ),
    ],
    revisionNotes: [
      'Error middleware detected by `fn.length === 4`.',
      'Express 5: async rejections → error middleware automatically; Express 4: try/catch, wrapper, or express-async-errors.',
      'Errors in raw callbacks/timers are never caught automatically.',
      'Default handler uses `err.status`, shows stack only outside production, closes connection if headers sent.',
      'Register after routes and after the 404 handler.',
    ],
    quiz: [
      {
        kind: 'find-bug', difficulty: 'beginner',
        prompt: 'Errors never reach this handler. Why?',
        code: "app.get('/x', () => { throw new Error('x'); });\napp.use((err, req, res) => {\n  res.status(500).json({ error: 'oops' });\n});",
        options: [
          'Errors must be thrown asynchronously',
          'The handler declares only 3 parameters, so Express treats it as normal middleware',
          'app.use cannot handle errors; use app.error',
          'The route must call next() first',
        ],
        answer: 1,
        explanation: 'Express checks the function\'s declared parameter count. With 3 params it is regular middleware and is skipped while an error is pending.',
      },
      {
        kind: 'predict-output', difficulty: 'intermediate',
        prompt: 'Express 5. What does the client receive for `GET /a`?',
        code: "app.get('/a', async (req, res) => {\n  await Promise.reject(new Error('db down'));\n  res.send('ok');\n});\napp.use((err, req, res, next) => res.status(503).send('retry later'));",
        options: ['ok', 'The request hangs forever', '503 retry later', '500 with HTML stack trace'],
        answer: 2,
        explanation: 'Express 5 catches the rejected promise and calls the error handler. In Express 4 the request would hang (and log an unhandled rejection).',
      },
      {
        kind: 'scenario', difficulty: 'advanced',
        prompt: 'In Express 5, an error thrown inside `fs.readFile(path, (err, data) => { throw err; })` in a handler crashes the process. Why and what is the fix?',
        options: [
          'Express 5 only catches errors in GET routes',
          'The throw happens later in a callback outside Express\'s try/catch and promise chain; use `fs/promises` with await, or call `next(err)` in the callback',
          'fs.readFile errors cannot be caught',
          'Add a second error middleware',
        ],
        answer: 1,
        explanation: 'Express can only catch synchronous throws and returned rejected promises. A callback fires on a later tick with no Express frame on the stack.',
      },
    ],
    interview: [
      {
        category: 'express-backend', kind: 'concept', difficulty: 'intermediate', topic: 'Error middleware',
        question: 'How does Express distinguish error-handling middleware from regular middleware?',
        shortAnswer: 'By the function\'s declared arity: a function with exactly four parameters `(err, req, res, next)` is treated as error middleware.',
        detailedAnswer: [
          'Express reads `fn.length`; three or fewer means regular middleware.',
          'While an error is pending, regular middleware is skipped; when no error is pending, error middleware is skipped.',
          'Default values or rest params change `fn.length`, so avoid them in the signature.',
          'Error middleware must be registered after the routes it should cover.',
        ],
        followUp: 'What happens if an error handler calls next() without an argument?',
        trap: 'Omitting the unused `next` parameter (lint auto-fix) silently turns it into normal middleware.',
      },
      {
        category: 'express-backend', kind: 'concept', difficulty: 'advanced', topic: 'Async errors',
        question: 'How are errors from async route handlers handled in Express 4 versus Express 5?',
        shortAnswer: 'Express 4 ignores the promise a handler returns, so rejections become unhandled and the request hangs unless you try/catch and call `next(err)`; Express 5 attaches a catch to returned promises and forwards rejections to error middleware.',
        detailedAnswer: [
          'Express 4 workarounds: `asyncHandler` wrapper, `express-async-errors` (monkey-patches the router), or manual try/catch.',
          'Express 5 behaviour applies to route handlers and middleware (`app.use`, `router.param` callbacks too).',
          'Neither version catches errors thrown in later callbacks (`setTimeout`, event emitters, callback APIs).',
          'Node 15+ crashes the process on unhandled rejections by default — so in Express 4 an async bug could take down the server.',
        ],
        followUp: 'If you migrate to Express 5, can you delete express-async-errors immediately?',
        trap: 'Claiming Express 5 catches every asynchronous error, including in callbacks.',
      },
      {
        category: 'express-backend', kind: 'concept', difficulty: 'advanced', topic: 'Default error handler',
        question: 'What does Express\'s built-in default error handler do, and why do you check res.headersSent in your own handler?',
        shortAnswer: 'It sets the status from `err.status`/`err.statusCode` (default 500), sends an HTML page with the stack outside production, and if headers were already sent it destroys the connection; your handler should delegate to it in that case.',
        detailedAnswer: [
          'It is added implicitly at the end of the stack.',
          'In production (`NODE_ENV=production`) it sends only the status message, not the stack.',
          'If a response is mid-stream (e.g. streaming a file) you cannot change status or headers.',
          '`if (res.headersSent) return next(err)` lets Express close the socket so the client sees a truncated response instead of a corrupt one.',
          'It also copies `err.headers` onto the response for some errors.',
        ],
        followUp: 'How does NODE_ENV affect Express beyond error output?',
        trap: 'Trying to send a JSON error after streaming already began — you get ERR_HTTP_HEADERS_SENT.',
      },
    ],
  },
};

export default content;
