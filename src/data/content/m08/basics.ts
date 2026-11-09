import type { ModuleContent } from '../../../types';
import {
  bullets, code, dedent, diagram, flow, interviewTip, note, section, steps, table, text, warn,
} from '../helpers';

const content: Partial<ModuleContent> = {
  // ───────────────────────────────────────────────────────────
  'what-is-express': {
    summary: 'Express is a minimal, unopinionated web framework that sits on top of the Node `http` module and adds routing, middleware and response helpers.',
    topics: ['Express', 'web framework', 'node:http', 'Express 5', 'Express 4', 'unopinionated'],
    sections: [
      section('introduction', undefined,
        text('Writing an API with only `node:http` means parsing URLs, matching methods, reading bodies and setting headers by hand for every route. Express removes that boilerplate while keeping you close to Node.'),
      ),
      section('definition', 'Definition',
        text('**Express** is a third-party npm package (`express`) that wraps Node\'s core `http.Server`. It gives you three things:'),
        bullets(
          '**Routing** — map `METHOD + path` to handler functions (`app.get(\'/users/:id\', ...)`).',
          '**Middleware** — a pipeline of `(req, res, next)` functions that every request flows through.',
          '**Helpers** — `req.params`, `req.query`, `res.json()`, `res.status()`, `res.redirect()` and more, added on top of Node\'s `IncomingMessage` and `ServerResponse`.',
        ),
        note('Express is **not** part of Node core. `req` and `res` are still the Node core objects — Express only extends their prototypes.'),
      ),
      section('why', 'Why it exists',
        table('node:http vs Express', ['Task', 'node:http (core)', 'Express'], [
          ['Match a route', 'Manual `if (req.method === "GET" && url === ...)`', '`app.get("/path", handler)`'],
          ['Path params', 'Parse the URL yourself', '`req.params.id`'],
          ['JSON body', 'Collect chunks, `JSON.parse`', '`express.json()` → `req.body`'],
          ['Send JSON', '`setHeader` + `JSON.stringify` + `end`', '`res.json(obj)`'],
          ['Cross-cutting logic', 'Wrap every handler', 'Middleware with `app.use()`'],
          ['Error handling', 'try/catch everywhere', 'Error middleware `(err, req, res, next)`'],
        ]),
        bullets(
          'It is the most widely used Node web framework, so most tutorials, middleware and job postings assume it.',
          'It is **unopinionated**: no ORM, no folder structure, no DI container. You choose — which is why later lessons cover controllers, services and route organization.',
          'Alternatives: Fastify (schema-first, faster), Koa (async middleware from the Express team), NestJS (opinionated, often runs on Express underneath).',
        ),
      ),
      section('internals', 'How it sits on Node',
        steps(
          '`express()` returns `app` — a plain function `(req, res) => ...` with extra methods.',
          '`app.listen(3000)` calls Node core `http.createServer(app).listen(3000)`.',
          'For every request, Node core emits `request`; the handler is `app` itself.',
          'Express swaps the prototypes of `req`/`res` to add helpers, then runs the router.',
          'The router walks its stack of middleware and routes in **registration order** until one sends a response.',
        ),
        diagram('request-response', 'Node core owns the TCP/HTTP work; Express runs inside the request handler.'),
      ),
      section('example', 'Same endpoint, two ways',
        code({
          title: 'Node core only',
          code: dedent(`
            const http = require('node:http');

            const server = http.createServer((req, res) => {
              if (req.method === 'GET' && req.url === '/health') {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ status: 'ok' }));
                return;
              }
              res.writeHead(404, { 'Content-Type': 'text/plain' });
              res.end('Not found');
            });

            server.listen(3000, () => console.log('core server on 3000'));
          `),
          expectedOutput: 'core server on 3000',
          explanation: [
            'Method and path matching is a manual `if`.',
            'You must set the status, the `Content-Type` and stringify the body yourself.',
            'Every new route grows the `if/else` chain.',
          ],
        }),
        code({
          title: 'Express',
          code: dedent(`
            const express = require('express');
            const app = express();

            app.get('/health', (req, res) => {
              res.json({ status: 'ok' });
            });

            app.listen(3000, () => console.log('express server on 3000'));
          `),
          expectedOutput: 'express server on 3000',
          explanation: [
            '`app.get` registers a route for GET `/health` only.',
            '`res.json` sets `Content-Type: application/json; charset=utf-8`, stringifies and ends the response.',
            'Unmatched paths automatically get Express\'s default 404 (`Cannot GET /x`).',
          ],
          versionNote: 'Express 5 requires Node 18+. Express 4 supports much older Node versions.',
        }),
        code({
          title: 'Calling it',
          language: 'http',
          code: 'GET /health HTTP/1.1\nHost: localhost:3000',
          expectedOutput: 'HTTP/1.1 200 OK\nX-Powered-By: Express\nContent-Type: application/json; charset=utf-8\nContent-Length: 15\n\n{"status":"ok"}',
          explanation: [
            '`X-Powered-By: Express` is added by default — disable it with `app.disable("x-powered-by")`.',
            '`Content-Length` and an `ETag` header (omitted here) are computed by `res.send` under the hood.',
          ],
        }),
      ),
      section('real-world', 'Where Express shows up',
        bullets(
          'JSON REST APIs behind a React/mobile frontend.',
          'Backend-for-frontend (BFF) layers that aggregate microservices.',
          'Webhook receivers (Stripe, GitHub) — often needing `express.raw()` for signature checks.',
          'Server-rendered apps with a view engine, and as the HTTP adapter under NestJS.',
        ),
      ),
      section('mistakes', 'Common mistakes',
        bullets(
          'Thinking Express replaces Node — it runs **inside** a Node `http.Server`.',
          'Following Express 4 tutorials blindly on Express 5 (wildcard `*` routes, `req.param()`, `res.send(200)` no longer work).',
          'Forgetting `express.json()` and wondering why `req.body` is `undefined`.',
        ),
        code({
          title: 'Wrong vs right (Express 5)',
          code: dedent(`
            // ✗ Express 4 style — throws at startup in Express 5 (unnamed wildcard)
            app.get('*', (req, res) => res.sendStatus(404));

            // ✓ Express 5: wildcards must be named
            app.get('/*splat', (req, res) => res.sendStatus(404));
          `),
          explanation: ['Express 5 uses path-to-regexp v8, which requires named wildcards like `*splat`.'],
        }),
      ),
      section('interview', 'Interview angle',
        interviewTip('Say clearly that Express is a thin layer over `node:http`: `app` is a request listener, and `req`/`res` are Node\'s objects with extra methods. Then mention one or two Express 5 changes to show you are current.'),
      ),
      section('practice', 'Practice',
        steps(
          'Build `GET /time` returning `{ now: <ISO string> }` with `node:http` only.',
          'Rebuild it with Express and compare line counts.',
          'Add `app.disable("x-powered-by")` and confirm the header disappears with `curl -i`.',
        ),
      ),
      section('summary', 'Summary',
        bullets(
          'Express = routing + middleware + helpers on top of Node core `http`.',
          'It is third-party and unopinionated — structure is your job.',
          'Express 5 (stable since late 2024) needs Node 18+ and forwards async errors automatically.',
          '`req`/`res` are still Node `IncomingMessage`/`ServerResponse` objects.',
        ),
      ),
    ],
    revisionNotes: [
      'Express is an npm package, not Node core; `app` is a `(req, res)` listener passed to `http.createServer`.',
      '`app.listen()` = `http.createServer(app).listen()`; it returns the Node `http.Server`.',
      'Express 5: Node 18+, async errors auto-forwarded, named wildcards (`/*splat`), `req.body` undefined without a parser.',
      'Disable `X-Powered-By` in production with `app.disable("x-powered-by")` (or Helmet).',
    ],
    quiz: [
      {
        kind: 'mcq', difficulty: 'beginner',
        prompt: 'What does `app.listen(3000)` do under the hood?',
        options: [
          'Starts a custom Express HTTP parser written in C++',
          'Calls `http.createServer(app).listen(3000)` and returns the Node server',
          'Spawns a worker thread per request',
          'Registers a route for port 3000',
        ],
        answer: 1,
        explanation: 'Express reuses Node core `http`. `app` is just the request listener. Express does not parse HTTP itself — that is Node core\'s llhttp parser.',
      },
      {
        kind: 'scenario', difficulty: 'beginner',
        prompt: 'An Express 5 app logs `req.body` in a POST handler and prints `undefined`. The client sends valid JSON. What is the most likely cause?',
        options: [
          'The client must send `Content-Type: text/plain`',
          'Express 5 removed `req.body`',
          '`express.json()` is not registered before the route',
          'POST handlers must be async',
        ],
        answer: 2,
        explanation: 'Body parsing is middleware. Without `app.use(express.json())` before the route nothing populates `req.body`; in Express 5 it stays `undefined` (Express 4 often showed `{}`).',
      },
      {
        kind: 'mcq', difficulty: 'intermediate',
        prompt: 'Which statement about `req` in an Express handler is true?',
        options: [
          'It is a Node `IncomingMessage` with Express helpers added via its prototype',
          'It is a plain object created by Express with no relation to Node',
          'It is a `fetch` `Request` object',
          'It is only available when using `express.Router()`',
        ],
        answer: 0,
        explanation: 'Express sets the prototype of Node\'s request object to its own `req` prototype (which inherits from `http.IncomingMessage`). It is still a readable stream.',
      },
    ],
    interview: [
      {
        category: 'express-backend', kind: 'concept', difficulty: 'beginner', topic: 'Express basics',
        question: 'What is Express and how does it relate to the Node.js http module?',
        shortAnswer: 'Express is a third-party minimal web framework that runs as the request listener of a Node core `http.Server`, adding routing, middleware and request/response helpers.',
        detailedAnswer: [
          '`express()` returns a function `(req, res)` that you pass to `http.createServer` — `app.listen` does this for you.',
          'Node core still parses HTTP; Express adds `req.params`, `req.query`, `res.json`, etc. by extending the prototypes.',
          'Its core abstractions are the router and the middleware pipeline.',
          'It is unopinionated: no ORM, validation or folder structure is imposed.',
        ],
        followUp: 'How would you attach Express to an existing HTTPS server?',
        trap: 'Saying Express "replaces" Node or has its own HTTP parser.',
      },
      {
        category: 'express-backend', kind: 'concept', difficulty: 'intermediate', topic: 'Express 5',
        question: 'What are the most important changes when migrating from Express 4 to Express 5?',
        shortAnswer: 'Rejected promises from async handlers go to error middleware automatically, path matching moved to path-to-regexp v8 (named wildcards, `{}` for optional parts), and several deprecated APIs were removed.',
        detailedAnswer: [
          'Async errors: a returned rejected promise calls `next(err)` for you — no more `express-async-errors`.',
          'Paths: `*` must be named (`/*splat`), optional segments use braces (`/users{/:id}`), regex characters in strings are not allowed.',
          'Removed: `req.param()`, `res.send(status)`, `res.json(obj, status)`, `app.del`, `res.redirect("back")`, `res.sendfile` (use `sendFile`).',
          '`req.query` uses the "simple" parser by default; `req.body` is `undefined` without a body parser; `express.urlencoded` defaults to `extended: false`.',
          'Requires Node 18+ and `res.status()` only accepts integer codes 100–999.',
        ],
        followUp: 'How would you find routes that break under the new path syntax?',
        trap: 'Claiming Express 5 is still beta — it became the stable `latest` release in late 2024.',
      },
    ],
  },

  // ───────────────────────────────────────────────────────────
  'express-architecture': {
    summary: 'Internally an Express app is a router holding an ordered stack of layers (middleware and routes); each request walks that stack until something responds.',
    topics: ['Router', 'Layer', 'stack', 'Route', 'dispatch', 'next', 'request lifecycle'],
    sections: [
      section('introduction', undefined,
        text('To debug "why did my middleware not run?" you need a mental model of how Express decides what runs. That model is one ordered list.'),
      ),
      section('definition', 'Building blocks',
        table('Express internals', ['Piece', 'What it is', 'Created by'], [
          ['Application', 'The `app` function + settings + a root router', '`express()`'],
          ['Router', 'An ordered `stack` of Layers', '`app` internally, or `express.Router()`'],
          ['Layer', 'A path matcher + a handler function', '`app.use()`, `app.get()`, `router.use()`'],
          ['Route', 'A Layer whose handler dispatches by HTTP method to its own sub-stack', '`app.get()`, `app.route()`'],
        ]),
      ),
      section('why', 'Why this matters',
        bullets(
          'Order of registration **is** the order of execution. There is no priority system.',
          '`app.use()` layers match a path **prefix** for any method; route layers match the **full** path and a method.',
          'A Router is itself middleware, so apps compose from many small routers.',
        ),
      ),
      section('internals', 'Dispatch step by step',
        steps(
          'Node core calls `app(req, res)`; Express extends `req`/`res` and calls the root router\'s `handle()`.',
          'The router keeps an index `idx = 0` and a `next()` function.',
          '`next()` advances through `stack` looking for the next Layer whose path matches `req.url`.',
          'If the Layer is a Route, it also checks the HTTP method; if no method matches it is skipped.',
          'The matching Layer\'s handler is called with `(req, res, next)`. Calling `next()` resumes the scan.',
          'If `next(err)` was called, normal layers are skipped and only 4-argument error layers are considered.',
          'If the stack ends with no response, Express\'s **final handler** sends 404 (or 500 for an error).',
        ),
        diagram('middleware-pipeline', 'One request walks the stack in order; errors jump to error middleware.'),
      ),
      section('visual', 'The stack for a small app',
        flow([
          'Layer 0: app.use(express.json())',
          'Layer 1: app.use(logger)',
          'Layer 2: Route GET /users',
          'Layer 3: Route POST /users',
          'Layer 4: app.use(notFound)',
          'Layer 5: app.use(errorHandler) (4 args)',
        ], { title: 'app._router.stack (conceptually)', direction: 'vertical', caption: 'A POST /users request runs layers 0, 1, then skips 2 (wrong method) and runs 3.' }),
      ),
      section('example', 'A tiny pure-JS model of the dispatcher',
        code({
          title: 'Simulating the Express stack',
          runnable: true,
          code: dedent(`
            function createApp() {
              const stack = [];
              const app = {
                use(fn) { stack.push({ method: null, fn }); },
                get(path, fn) { stack.push({ method: 'GET', path, fn }); },
                handle(req) {
                  let i = 0;
                  const next = () => {
                    while (i < stack.length) {
                      const layer = stack[i++];
                      if (layer.method && (layer.method !== req.method || layer.path !== req.url)) continue;
                      return layer.fn(req, next);
                    }
                    console.log('final handler: 404');
                  };
                  next();
                },
              };
              return app;
            }

            const app = createApp();
            app.use((req, next) => { console.log('logger', req.method, req.url); next(); });
            app.get('/users', (req) => console.log('handler: list users'));

            app.handle({ method: 'GET', url: '/users' });
            app.handle({ method: 'POST', url: '/users' });
          `),
          expectedOutput: 'logger GET /users\nhandler: list users\nlogger POST /users\nfinal handler: 404',
          explanation: [
            'Each registration pushes a layer — order is preserved.',
            'The logger has no method, so it matches every request (like `app.use`).',
            'The POST request skips the GET route and falls off the end of the stack → 404.',
            'Real Express adds prefix matching, params, error layers and async handling, but the loop is the same idea.',
          ],
        }),
        code({
          title: 'Real Express: what runs for each request',
          code: dedent(`
            const express = require('express');
            const app = express();

            app.use((req, res, next) => { console.log('A', req.method, req.path); next(); });
            app.get('/users', (req, res) => { console.log('B list'); res.json([]); });
            app.post('/users', (req, res) => { console.log('C create'); res.status(201).json({}); });
            app.use((req, res) => { console.log('D 404'); res.status(404).json({ error: 'Not found' }); });

            app.listen(3000);
            // curl localhost:3000/users ; curl -X POST localhost:3000/users ; curl localhost:3000/nope
          `),
          expectedOutput: 'A GET /users\nB list\nA POST /users\nC create\nA GET /nope\nD 404',
          explanation: [
            'Middleware A runs for every request because `app.use` without a path matches `/`.',
            'Only the route whose method and path both match runs.',
            'The last `app.use` catches anything not handled earlier — a custom 404.',
          ],
        }),
      ),
      section('real-world', 'Real-world shape',
        bullets(
          'Global middleware first (security headers, CORS, body parsing, request id, logging).',
          'Then feature routers: `app.use("/api/users", usersRouter)`.',
          'Then a 404 handler, then one error handler — always last.',
        ),
      ),
      section('mistakes', 'Common mistakes',
        bullets(
          'Registering a router **before** the middleware it depends on (auth, body parser).',
          'Registering the error handler before routes — it never sees their errors.',
          'Forgetting that each layer must either respond or call `next()`; otherwise the request hangs.',
        ),
        code({
          title: 'Wrong vs right order',
          code: dedent(`
            // ✗ body parser registered after the route
            app.post('/items', (req, res) => res.json(req.body)); // req.body is undefined
            app.use(express.json());

            // ✓ parser first
            app.use(express.json());
            app.post('/items', (req, res) => res.json(req.body));
          `),
          explanation: ['The stack is scanned top-down; a layer added later cannot affect a layer that already responded.'],
        }),
      ),
      section('interview', 'Interview angle',
        interviewTip('Describe the stack of Layers and the `next()` cursor. Interviewers like hearing that route matching is a **linear scan** — with thousands of routes, grouping into routers keeps the scan short.'),
      ),
      section('practice', 'Practice',
        text('Extend the pure-JS dispatcher above so that `next(err)` skips to layers registered with `useError(fn)`. Print which layers run for a route that throws.'),
      ),
      section('summary', 'Summary',
        bullets(
          'An app is a router with an ordered stack of layers.',
          '`app.use` = prefix match, any method; `app.get` = exact path + method.',
          '`next()` moves the cursor; `next(err)` jumps to error layers.',
          'No response by the end of the stack → Express final handler (404/500).',
        ),
      ),
    ],
    revisionNotes: [
      'Execution order = registration order; there is no route priority.',
      'Router stack holds Layers; a Route layer has its own per-method sub-stack.',
      'Route matching is a linear scan of the stack.',
      'Express\'s final handler sends 404 `Cannot GET /x` or 500 when nothing responds.',
    ],
    quiz: [
      {
        kind: 'predict-output', difficulty: 'intermediate',
        prompt: 'A client sends `GET /a`. What is logged?',
        code: "app.use((req, res, next) => { console.log('1'); next(); });\napp.get('/b', (req, res) => { console.log('2'); res.end(); });\napp.get('/a', (req, res, next) => { console.log('3'); next(); });\napp.use((req, res) => { console.log('4'); res.end(); });",
        options: ['1 3', '1 2 3 4', '1 3 4', '3 4'],
        answer: 2,
        explanation: 'Layer 1 runs for every path, `/b` is skipped, `/a` runs and calls `next()`, so the trailing `app.use` runs too. It is not "1 3" because `next()` continues the scan.',
      },
      {
        kind: 'mcq', difficulty: 'beginner',
        prompt: 'What decides which of two matching middleware functions runs first?',
        options: ['Alphabetical order of paths', 'The more specific path', 'The order they were registered', 'Async functions run last'],
        answer: 2,
        explanation: 'Express scans its stack in registration order. There is no specificity ranking like in some other frameworks.',
      },
    ],
    interview: [
      {
        category: 'express-backend', kind: 'concept', difficulty: 'intermediate', topic: 'Express internals',
        question: 'How does Express decide which middleware and route handlers run for a request?',
        shortAnswer: 'The router holds an ordered stack of layers and scans it from the top; each layer whose path (and, for routes, method) matches is called, and `next()` resumes the scan.',
        detailedAnswer: [
          '`app.use` layers match a path prefix for any method; `app.METHOD` route layers match the full path and method.',
          'A layer must respond or call `next()`; otherwise the request hangs.',
          '`next(err)` switches the scan to only 4-argument error middleware.',
          'If the end is reached, the final handler sends 404 or a 500 for an error.',
          'Because it is a linear scan, mounting feature routers under prefixes keeps lookups cheap and readable.',
        ],
        followUp: 'What does `next("route")` skip?',
        trap: 'Assuming more specific routes win regardless of order.',
      },
    ],
  },

  // ───────────────────────────────────────────────────────────
  'creating-an-express-application': {
    summary: 'Install `express`, create `app` in its own module, register middleware and routes, and start the server from a separate entry file so the app stays testable.',
    topics: ['npm install express', 'app.listen', 'app.js vs server.js', 'graceful shutdown', 'node --watch', '--env-file'],
    sections: [
      section('introduction', undefined,
        text('A clean starting skeleton saves pain later: tests can import the app without opening a port, and shutdown is handled from day one.'),
      ),
      section('definition', 'What you need',
        bullets(
          '`npm install express` — installs Express 5 by default (`latest`).',
          '`app.js` — builds and exports the `app` (no `listen`).',
          '`server.js` — imports `app`, calls `listen`, handles signals.',
          'Run with `node --watch server.js` in development (Node core, 18.11+ / stable in 22).',
        ),
      ),
      section('why', 'Why split app and server',
        table('app.js vs server.js', ['', 'app.js', 'server.js'], [
          ['Responsibility', 'Middleware, routes, error handler', 'Port, process signals, startup'],
          ['Imported by tests', 'Yes (e.g. Supertest)', 'No'],
          ['Side effects on import', 'None', 'Opens a socket'],
        ]),
      ),
      section('internals', 'What happens at startup',
        steps(
          '`require("express")` loads the package from `node_modules`.',
          '`express()` creates the app with default settings (`env` from `NODE_ENV`, `etag`, `x-powered-by`…).',
          '`app.use`/`app.get` push layers onto the router stack — nothing runs yet.',
          '`app.listen(port, cb)` creates a Node `http.Server`, binds the port and calls `cb` on `listening`.',
          'Each incoming request then runs through the stack built in step 3.',
        ),
      ),
      section('example', 'A production-ready skeleton',
        code({
          title: 'src/app.js',
          code: dedent(`
            const express = require('express');

            function createApp() {
              const app = express();
              app.disable('x-powered-by');
              app.use(express.json({ limit: '100kb' }));

              app.get('/health', (req, res) => res.json({ status: 'ok' }));

              app.use((req, res) => res.status(404).json({ error: 'Not found' }));
              app.use((err, req, res, next) => {
                console.error(err);
                res.status(500).json({ error: 'Internal Server Error' });
              });
              return app;
            }

            module.exports = { createApp };
          `),
          explanation: [
            'A factory makes it easy to create fresh apps in tests with different dependencies.',
            'The 404 handler and error handler are registered last.',
          ],
        }),
        code({
          title: 'src/server.js',
          code: dedent(`
            const { createApp } = require('./app');

            const port = Number(process.env.PORT) || 3000;
            const server = createApp().listen(port, () => {
              console.log('listening on http://localhost:' + port);
            });

            function shutdown(signal) {
              console.log(signal + ' received, closing server');
              server.close(() => {
                console.log('all connections closed');
                process.exit(0);
              });
              setTimeout(() => process.exit(1), 10_000).unref();
            }
            process.on('SIGTERM', () => shutdown('SIGTERM'));
            process.on('SIGINT', () => shutdown('SIGINT'));
          `),
          expectedOutput: 'listening on http://localhost:3000\n^CSIGINT received, closing server\nall connections closed',
          explanation: [
            '`listen` returns the Node core `http.Server`, which has `close()` — Express does not add its own shutdown.',
            '`server.close()` stops accepting new connections and waits for in-flight requests.',
            'The `unref()`ed timeout forces exit if keep-alive connections never close.',
          ],
          versionNote: '`node --env-file=.env src/server.js` (Node 20.6+) loads env vars without the `dotenv` package. Node 18.2+ also has `server.closeIdleConnections()`.',
        }),
        code({
          title: 'package.json scripts',
          language: 'json',
          code: dedent(`
            {
              "name": "my-api",
              "type": "commonjs",
              "scripts": {
                "dev": "node --watch --env-file=.env src/server.js",
                "start": "node src/server.js"
              },
              "dependencies": { "express": "^5.1.0" }
            }
          `),
          explanation: ['`--watch` restarts on file changes, replacing nodemon for most projects.'],
        }),
      ),
      section('real-world', 'In real projects',
        bullets(
          'Containers send `SIGTERM` on deploy — graceful shutdown avoids dropped requests.',
          'Health endpoints (`/health`, `/ready`) are added first so load balancers can probe the app.',
          'Config (port, DB URL) comes from environment variables, validated at startup.',
        ),
      ),
      section('mistakes', 'Common mistakes',
        bullets(
          'Calling `app.listen` inside `app.js` — every test import opens a port (`EADDRINUSE`).',
          'Hard-coding the port instead of reading `process.env.PORT`.',
          'No `SIGTERM` handling, so deploys cut off in-flight requests.',
        ),
        code({
          title: 'Wrong vs right',
          code: dedent(`
            // ✗ app.js
            const app = express();
            app.listen(3000);          // side effect on import
            module.exports = app;

            // ✓ app.js exports the app; server.js listens
            module.exports = app;
          `),
        }),
      ),
      section('interview', 'Interview angle',
        interviewTip('When asked "how would you structure a new Express service", mention the app/server split, env-based config, a health route, 404 + error handler last, and graceful shutdown on SIGTERM.'),
      ),
      section('practice', 'Practice',
        steps(
          'Scaffold `app.js`/`server.js` as above.',
          'Add `GET /version` returning the `version` from package.json.',
          'Start with `npm run dev`, then press Ctrl+C and verify the shutdown logs.',
        ),
      ),
      section('summary', 'Summary',
        bullets(
          '`express()` builds the app; `app.listen` returns a Node `http.Server`.',
          'Export the app, listen in a separate file.',
          'Handle SIGTERM/SIGINT with `server.close()`.',
          'Use `node --watch` and `--env-file` (Node core) in development.',
        ),
      ),
    ],
    revisionNotes: [
      '`app.listen()` returns `http.Server`; shut down with `server.close()`.',
      'Keep `listen` out of `app.js` so tests can import the app.',
      'Register 404 and error handlers last.',
      '`node --watch` and `--env-file` are Node core features (no nodemon/dotenv needed).',
    ],
    quiz: [
      {
        kind: 'find-bug', difficulty: 'intermediate',
        prompt: 'Integration tests fail with `EADDRINUSE` when two test files import the app. Why?',
        code: "// app.js\nconst express = require('express');\nconst app = express();\napp.get('/health', (req, res) => res.json({ ok: true }));\napp.listen(3000);\nmodule.exports = app;",
        options: [
          '`res.json` cannot be used in tests',
          'The module calls `listen` on import, so each test worker tries to bind port 3000',
          'Express apps cannot be exported',
          '`/health` must be async',
        ],
        answer: 1,
        explanation: 'Importing `app.js` has a side effect: opening a port. Export the app and call `listen` only in `server.js`; Supertest can bind an ephemeral port itself.',
      },
      {
        kind: 'mcq', difficulty: 'beginner',
        prompt: 'What does `server.close()` do?',
        options: [
          'Immediately kills all open sockets',
          'Stops accepting new connections and calls back once existing ones finish',
          'Removes all Express routes',
          'Exits the Node process',
        ],
        answer: 1,
        explanation: '`close` is Node core `net.Server` behaviour: no new connections, callback after existing ones end. It does not exit the process or force-close keep-alive sockets.',
      },
    ],
    interview: [
      {
        category: 'express-backend', kind: 'concept', difficulty: 'beginner', topic: 'App structure',
        question: 'Why do many Express projects separate app.js from server.js?',
        shortAnswer: 'So the app can be imported by tests and other entry points without side effects; only `server.js` opens a port and handles process signals.',
        detailedAnswer: [
          '`app.js` builds middleware/routes and exports the app (or a `createApp()` factory).',
          'Supertest can run requests against the exported app on an ephemeral port.',
          '`server.js` owns `listen`, port config and graceful shutdown.',
          'A factory lets tests inject fake services or config.',
        ],
        followUp: 'How does Supertest send requests to an app that is not listening?',
        trap: 'Saying it is only "for cleanliness" — the real reason is testability and side-effect-free imports.',
      },
      {
        category: 'express-backend', kind: 'scenario', difficulty: 'intermediate', topic: 'Graceful shutdown',
        question: 'Your Express service drops requests during every Kubernetes deploy. How do you fix it?',
        shortAnswer: 'Handle `SIGTERM`: stop accepting new connections with `server.close()`, let in-flight requests finish, close DB pools, then exit — with a hard timeout as a safety net.',
        detailedAnswer: [
          'Kubernetes sends SIGTERM, waits `terminationGracePeriodSeconds`, then SIGKILL.',
          'Mark the readiness probe as failing first so the load balancer stops routing new traffic.',
          '`server.close()` (Node core) waits for active requests; idle keep-alive sockets can be closed with `server.closeIdleConnections()` (Node 18.2+).',
          'Close database pools, queues and other resources after the server closes.',
          'Force `process.exit(1)` after a timeout if something hangs.',
        ],
        followUp: 'Why is `process.exit()` right after `server.close()` wrong?',
        trap: 'Calling `process.exit(0)` immediately on SIGTERM, which kills in-flight requests.',
      },
    ],
  },

  // ───────────────────────────────────────────────────────────
  routing: {
    summary: 'Routing maps an HTTP method and path to handlers; Express 5 uses path-to-regexp v8 syntax with named wildcards and brace-delimited optional segments.',
    topics: ['app.get', 'app.route', 'app.all', 'path patterns', 'path-to-regexp v8', 'wildcards', 'optional segments', 'app.use vs app.get'],
    sections: [
      section('introduction', undefined,
        text('Routing answers one question for every request: **which function should handle `POST /orders/42/items`?**'),
      ),
      section('definition', 'Definition',
        text('A route is `app.METHOD(path, ...handlers)`. `METHOD` is a lowercase HTTP verb (`get`, `post`, `put`, `patch`, `delete`, `options`, `head`) or `all`.'),
        table('Route path syntax (Express 5)', ['Pattern', 'Matches', 'Notes'], [
          ['`/users`', '`/users` (and `/users/`)', 'Trailing slash allowed unless `strict` routing'],
          ['`/users/:id`', '`/users/42`', '`req.params.id === "42"` (always a string)'],
          ['`/files/*path`', '`/files/a/b.txt`', 'Named wildcard; `req.params.path` is `["a","b.txt"]`'],
          ['`/users{/:id}`', '`/users` and `/users/42`', 'Optional segment in braces (replaces `:id?`)'],
          ['`/:file{.:ext}`', '`/report` and `/report.pdf`', 'Optional extension'],
        ]),
        warn('Express 5 removed Express 4 patterns: bare `*`, `:id?`, `+`, `()` groups and inline regex in strings. Use a real `RegExp` object if you need regex.'),
      ),
      section('why', 'app.use vs app.METHOD',
        table('Path matching', ['', '`app.use(path, fn)`', '`app.get(path, fn)`'], [
          ['Methods', 'All', 'Only GET (and HEAD)'],
          ['Path match', 'Prefix: `/api` matches `/api/users`', 'Whole path: `/api` does not match `/api/users`'],
          ['`req.url` inside', 'Mount path stripped (`/users`)', 'Unchanged'],
          ['Typical use', 'Middleware, routers', 'Endpoints'],
        ]),
        note('`app.get` also answers `HEAD` requests automatically if no explicit `app.head` route exists.'),
      ),
      section('internals', 'How a path is matched',
        steps(
          'At registration, Express compiles the path string to a regular expression via `path-to-regexp`.',
          'Per request, the router tests `req.path` against each layer\'s regex in order.',
          'Captured groups become `req.params` (decoded with `decodeURIComponent`).',
          'Matching is case-insensitive and ignores a trailing slash by default (`caseSensitive`/`strict` options change this).',
          'path-to-regexp v8 removed ambiguous patterns to avoid catastrophic backtracking (ReDoS).',
        ),
      ),
      section('example', 'Routes in practice',
        code({
          title: 'Common route shapes',
          code: dedent(`
            const express = require('express');
            const app = express();

            app.get('/users', (req, res) => res.json([{ id: 1 }]));
            app.get('/users/:id', (req, res) => res.json({ id: req.params.id }));

            // Chainable route: one path, several methods
            app.route('/books/:isbn')
              .get((req, res) => res.json({ isbn: req.params.isbn }))
              .delete((req, res) => res.sendStatus(204));

            // Express 5 optional segment and named wildcard
            app.get('/docs{/:page}', (req, res) => res.json({ page: req.params.page ?? 'index' }));
            app.get('/assets/*filepath', (req, res) => res.json({ parts: req.params.filepath }));

            app.listen(3000);
          `),
          explanation: [
            '`app.route()` avoids repeating the path string for each method.',
            '`{/:page}` makes the whole `/:page` part optional; `req.params.page` is `undefined` when absent.',
            'The wildcard captures the rest of the path as an **array** of segments in Express 5.',
          ],
          versionNote: 'Express 4 equivalents were `/docs/:page?` and `/assets/*` (`req.params[0]` as a string).',
        }),
        code({
          title: 'Responses',
          language: 'http',
          code: 'GET /docs HTTP/1.1\n\nGET /docs/install HTTP/1.1\n\nGET /assets/img/logo.png HTTP/1.1\n\nPUT /users HTTP/1.1',
          expectedOutput: 'HTTP/1.1 200 OK\n{"page":"index"}\n\nHTTP/1.1 200 OK\n{"page":"install"}\n\nHTTP/1.1 200 OK\n{"parts":["img","logo.png"]}\n\nHTTP/1.1 404 Not Found\nCannot PUT /users',
          explanation: [
            'The PUT request matches no route (there is only GET /users), so Express\'s final handler returns 404 with an HTML body containing `Cannot PUT /users`.',
            'Express does not send 405 Method Not Allowed automatically — add it yourself if your API needs it.',
          ],
        }),
      ),
      section('real-world', 'Real-world routing',
        bullets(
          'Version prefixes: `app.use("/api/v1", v1Router)`.',
          'Define specific routes before parameterised ones: `/users/me` before `/users/:id`.',
          'SPA fallback in Express 5: `app.get("/*splat", sendIndexHtml)` after API routes.',
        ),
      ),
      section('mistakes', 'Common mistakes',
        code({
          title: 'Wrong vs right: order of overlapping routes',
          code: dedent(`
            // ✗ "/users/me" is captured by ":id" first → req.params.id === "me"
            app.get('/users/:id', getUserById);
            app.get('/users/me', getCurrentUser);

            // ✓ static segment first
            app.get('/users/me', getCurrentUser);
            app.get('/users/:id', getUserById);
          `),
          explanation: ['Express does not rank routes by specificity — first match wins.'],
        }),
        bullets(
          'Using Express 4 `:id?` syntax in Express 5 — it throws `TypeError: Unexpected ? ...` at startup.',
          'Expecting `app.use("/api", fn)` to match only `/api` — it matches every path under it.',
        ),
      ),
      section('interview', 'Interview angle',
        interviewTip('Expect "what is the difference between `app.use` and `app.get`?" Answer with prefix vs exact match, all methods vs one method, and the mount path being stripped from `req.url`.'),
      ),
      section('practice', 'Practice',
        steps(
          'Create `/products`, `/products/:id` and `/products/:id/reviews{/:reviewId}`.',
          'Add a 405 handler with `app.all("/products", ...)` registered after the GET route.',
          'Log `req.params` for each and confirm the optional segment behaviour.',
        ),
      ),
      section('summary', 'Summary',
        bullets(
          '`app.METHOD(path, ...handlers)`; first match wins.',
          'Express 5: `/*name` wildcards, `{...}` optional parts, no inline regex in strings.',
          '`app.use` matches prefixes for all methods; routes match whole paths.',
          'No automatic 405 — unmatched method falls through to 404.',
        ),
      ),
    ],
    revisionNotes: [
      'First matching route wins — put `/users/me` before `/users/:id`.',
      'Express 5 wildcard: `/*splat` (array of segments); optional: `/users{/:id}`.',
      '`app.use("/api")` = prefix match + strips mount path; `app.get("/api")` = exact.',
      '`app.get` also serves HEAD; unmatched method → 404 not 405.',
      'path-to-regexp v8 removed ambiguous syntax partly to prevent ReDoS.',
    ],
    quiz: [
      {
        kind: 'complete-code', difficulty: 'intermediate',
        prompt: 'In Express 5, make `/:id` optional so both `/orders` and `/orders/7` match one route.',
        code: "app.get(/* ??? */, (req, res) => res.json({ id: req.params.id ?? null }));",
        options: ["'/orders/:id?'", "'/orders{/:id}'", "'/orders/(:id)'", "'/orders/*id'"],
        answer: 1,
        explanation: 'Express 5 (path-to-regexp v8) uses braces for optional parts. `:id?` was Express 4 syntax and now throws. `*id` would require at least one segment and capture an array.',
      },
      {
        kind: 'predict-output', difficulty: 'intermediate',
        prompt: 'What does `GET /users/me` return?',
        code: "app.get('/users/:id', (req, res) => res.send('id=' + req.params.id));\napp.get('/users/me', (req, res) => res.send('me'));",
        options: ['me', 'id=me', '404', 'Both responses are sent'],
        answer: 1,
        explanation: 'First match wins. `:id` matches `me`, the handler responds, and the second route is never reached.',
      },
      {
        kind: 'mcq', difficulty: 'beginner',
        prompt: 'Which request is matched by `app.use("/api", fn)` but NOT by `app.get("/api", fn)`?',
        options: ['GET /api', 'GET /api/', 'GET /api/users', 'None — they are identical'],
        answer: 2,
        explanation: '`app.use` matches the `/api` prefix (any path segment-boundary below it). Routes match the whole path.',
      },
    ],
    interview: [
      {
        category: 'express-backend', kind: 'concept', difficulty: 'beginner', topic: 'Routing',
        question: 'What is the difference between app.use() and app.get() in Express?',
        shortAnswer: '`app.use` registers middleware that matches any HTTP method on a path prefix; `app.get` registers a route handler for GET (and HEAD) on an exact path.',
        detailedAnswer: [
          '`app.use("/api", fn)` runs for `/api`, `/api/users`, `/api/x/y` — and strips `/api` from `req.url` inside.',
          '`app.get("/api", fn)` runs only for GET `/api` (trailing slash tolerated by default).',
          '`app.use` is for cross-cutting logic and mounting routers; `app.METHOD` is for endpoints.',
          '`next("route")` only works in route handlers, not in `app.use` middleware.',
        ],
        followUp: 'What are `req.baseUrl` and `req.originalUrl` inside a mounted router?',
        trap: 'Saying `app.use` only handles GET or that it matches exact paths.',
      },
      {
        category: 'express-backend', kind: 'concept', difficulty: 'advanced', topic: 'Express 5 paths',
        question: 'Why did Express 5 change its route path syntax, and how do you write wildcards and optional parameters now?',
        shortAnswer: 'Express 5 upgraded to path-to-regexp v8, which removed ambiguous constructs that could cause catastrophic regex backtracking; wildcards must be named (`/*splat`) and optional parts use braces (`/users{/:id}`).',
        detailedAnswer: [
          'Old patterns like `/:a-:b?` or nested optional groups compiled to regexes vulnerable to ReDoS (a known path-to-regexp CVE in 2024).',
          'v8 drops `?`, `+`, `*` modifiers and `()` groups in strings; `*name` captures one or more segments as an array.',
          'Optional: wrap in braces — `{/:id}`, `/:file{.:ext}`.',
          'For true regex needs, pass a `RegExp` object instead of a string.',
          'Catch-all for SPAs: `/*splat`, or `/{*splat}` to also match the root.',
        ],
        followUp: 'How would you audit a large Express 4 codebase for incompatible route strings?',
        trap: 'Claiming `app.get("*")` still works in Express 5 — it throws at startup.',
      },
    ],
  },
};

export default content;
