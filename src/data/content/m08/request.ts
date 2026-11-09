import type { ModuleContent } from '../../../types';
import {
  bullets, code, dedent, diagram, flow, interviewTip, note, section, steps, table, text,
} from '../helpers';

const content: Partial<ModuleContent> = {
  // ───────────────────────────────────────────────────────────
  'route-parameters': {
    summary: 'Route parameters are named URL segments (`/users/:id`) that Express captures into `req.params` as decoded strings.',
    topics: ['req.params', ':param', 'app.param', 'router.param', 'mergeParams', 'string params', 'optional params'],
    sections: [
      section('introduction', undefined,
        text('Resource URLs carry identifiers: `/users/42`, `/orgs/acme/repos/api`. Route parameters pull those identifiers out without manual string parsing.'),
      ),
      section('definition', 'Definition',
        bullets(
          'A parameter is `:name` in the route path. Names use word characters (`[A-Za-z0-9_]`).',
          'Captured values land in `req.params.name` — **always strings** (or arrays for Express 5 wildcards).',
          'Values are URL-decoded: `/users/J%C3%BCrgen` → `"Jürgen"`.',
          'Separators `-` and `.` can split params: `/flights/:from-:to` matches `/flights/LAX-SFO`.',
        ),
        table('params vs query vs body', ['', '`req.params`', '`req.query`', '`req.body`'], [
          ['Source', 'Path segments', 'After `?` in URL', 'Request body'],
          ['Example', '`/users/42`', '`?page=2`', '`{"name":"Ada"}`'],
          ['Populated by', 'Router (built in)', 'Query parser (built in)', 'Body-parser middleware'],
          ['Use for', 'Identify a resource', 'Filter / sort / paginate', 'Create / update data'],
        ]),
      ),
      section('why', 'Why it matters',
        bullets(
          'REST identifies resources by path; params are how handlers read that identity.',
          'Because they are strings, you must convert and validate them (`Number("abc")` is `NaN`).',
        ),
      ),
      section('internals', 'Under the hood',
        steps(
          'The path string compiles to a regex with one capture group per `:param`.',
          'On match, the router decodes each capture and builds `req.params` for that layer.',
          '`req.params` is **reset per layer**: a router mounted at `/users/:id` cannot see `:id` unless created with `mergeParams: true`.',
          '`app.param("id", fn)` / `router.param` runs `fn(req, res, next, value)` once per request before routes that use `:id`.',
        ),
      ),
      section('example', 'Reading and preloading params',
        code({
          title: 'Params with validation and router.param',
          code: dedent(`
            const express = require('express');
            const app = express();
            const users = new Map([[1, { id: 1, name: 'Ada' }]]);

            app.param('userId', (req, res, next, value) => {
              const id = Number(value);
              if (!Number.isInteger(id) || id <= 0) {
                return res.status(400).json({ error: 'userId must be a positive integer' });
              }
              const user = users.get(id);
              if (!user) return res.status(404).json({ error: 'User not found' });
              req.user = user;
              next();
            });

            app.get('/users/:userId', (req, res) => res.json(req.user));
            app.get('/users/:userId/posts/:postId', (req, res) => {
              res.json({ user: req.user.name, postId: req.params.postId, type: typeof req.params.postId });
            });

            app.listen(3000);
          `),
          explanation: [
            '`app.param` centralises "load the user or 404" for every route with `:userId`.',
            '`req.params.postId` is a string — note `type: "string"`.',
          ],
        }),
        code({
          title: 'Responses',
          language: 'http',
          code: 'GET /users/1 HTTP/1.1\n\nGET /users/1/posts/9 HTTP/1.1\n\nGET /users/abc HTTP/1.1\n\nGET /users/7 HTTP/1.1',
          expectedOutput: 'HTTP/1.1 200 OK\n{"id":1,"name":"Ada"}\n\nHTTP/1.1 200 OK\n{"user":"Ada","postId":"9","type":"string"}\n\nHTTP/1.1 400 Bad Request\n{"error":"userId must be a positive integer"}\n\nHTTP/1.1 404 Not Found\n{"error":"User not found"}',
          explanation: ['The param callback short-circuits with 400/404 before the route handler runs.'],
        }),
      ),
      section('real-world', 'Real-world usage',
        bullets(
          'Nested resources: `/orgs/:orgId/members/:memberId` with authorization checks that the member belongs to the org.',
          'Slug URLs: `/articles/:slug` looked up by unique index.',
          'Always validate UUIDs/ints before hitting the DB — Postgres throws on invalid UUID input, which would become a 500.',
        ),
      ),
      section('mistakes', 'Common mistakes',
        code({
          title: 'Wrong vs right: comparing string params',
          code: dedent(`
            // ✗ strict comparison with a number never matches
            const user = users.find((u) => u.id === req.params.id);

            // ✓ convert (and validate) first
            const id = Number(req.params.id);
            const user = users.find((u) => u.id === id);
          `),
        }),
        bullets(
          'Expecting nested routers to see parent params without `mergeParams: true`.',
          'Trusting `req.params.id` for authorization — "user can access id 42" must be checked, not assumed (IDOR).',
        ),
      ),
      section('interview', 'Interview angle',
        interviewTip('Mention three facts: params are strings, they are per-layer (hence `mergeParams`), and `app.param` exists for preloading. Bonus: tie params to IDOR and ownership checks.'),
      ),
      section('practice', 'Practice',
        text('Add `GET /orders/:orderId/items/:itemId` that returns 400 for non-numeric ids, 404 when missing, and 200 with the item. Use `router.param` for `orderId`.'),
      ),
      section('summary', 'Summary',
        bullets(
          '`:name` → `req.params.name` (decoded string).',
          'Validate and convert every param.',
          '`app.param`/`router.param` preloads resources once per request.',
          'Nested routers need `mergeParams: true` to read parent params.',
        ),
      ),
    ],
    revisionNotes: [
      'Params are strings; wildcard params in Express 5 are arrays.',
      '`req.params` is scoped to the matching layer — use `mergeParams` for parent params.',
      '`app.param(name, (req, res, next, value) => ...)` preloads per request.',
      'Params identify resources; query strings filter; bodies carry data.',
    ],
    quiz: [
      {
        kind: 'predict-output', difficulty: 'beginner',
        prompt: 'What is logged for `GET /items/5`?',
        code: "app.get('/items/:id', (req, res) => {\n  console.log(req.params.id === 5, typeof req.params.id);\n  res.end();\n});",
        options: ['true number', 'false string', 'true string', 'false number'],
        answer: 1,
        explanation: 'Route params are always strings, so `"5" === 5` is false. Convert with `Number()` and validate.',
      },
      {
        kind: 'scenario', difficulty: 'intermediate',
        prompt: 'A router mounted at `/projects/:projectId/tasks` logs `req.params.projectId` as `undefined`. Fix?',
        options: [
          'Use `req.query.projectId` instead',
          'Create the router with `express.Router({ mergeParams: true })`',
          'Rename the param to `:id`',
          'Add `express.json()`',
        ],
        answer: 1,
        explanation: 'Each router has its own `req.params`. `mergeParams: true` merges the parent layer\'s params into the child router.',
      },
    ],
    interview: [
      {
        category: 'express-backend', kind: 'concept', difficulty: 'beginner', topic: 'Request data',
        question: 'Explain the difference between req.params, req.query and req.body.',
        shortAnswer: '`req.params` holds named path segments, `req.query` holds the parsed query string, and `req.body` holds the parsed request body — populated only by body-parsing middleware.',
        detailedAnswer: [
          'Params identify a resource: `/users/:id` → `req.params.id`.',
          'Query carries optional modifiers: filters, sorting, pagination.',
          'Body carries the payload for POST/PUT/PATCH; requires `express.json()`/`express.urlencoded()`.',
          'All three are client-controlled strings/objects — validate them all.',
        ],
        followUp: 'Which of these may be logged in access logs or browser history, and why does that matter for secrets?',
        trap: 'Assuming `req.body` exists without a parser, or that params are numbers.',
      },
      {
        category: 'express-backend', kind: 'concept', difficulty: 'intermediate', topic: 'app.param',
        question: 'What does app.param() / router.param() do and when would you use it?',
        shortAnswer: 'It registers a callback that runs before any route containing that parameter, once per request, typically to validate the value and preload the resource onto `req`.',
        detailedAnswer: [
          'Signature: `(req, res, next, value, name)`.',
          'Runs only for routes on the same router that declare the param.',
          'Even if several matching routes use the param, the callback runs once per request.',
          'Good for "load or 404" logic, but keep heavy business rules in services.',
        ],
        followUp: 'Does a param callback on the app fire for routes defined in a mounted router?',
        trap: 'Thinking it applies globally across all routers — it is local to the router it is defined on.',
      },
    ],
  },

  // ───────────────────────────────────────────────────────────
  'query-parameters': {
    summary: 'Express parses the URL query string into `req.query`; Express 5 defaults to the "simple" parser (Node `querystring`), so nested `a[b]=1` syntax is not expanded unless you opt in.',
    topics: ['req.query', 'query parser', 'simple vs extended', 'qs', 'type coercion', 'arrays in query', 'pagination params'],
    sections: [
      section('introduction', undefined,
        text('Lists need filtering, sorting and pagination: `GET /products?category=books&sort=-price&page=2`. Express hands you those values in `req.query`.'),
      ),
      section('definition', 'Definition',
        bullets(
          '`req.query` is an object built from everything after `?`.',
          'Values are strings; repeated keys become arrays (`?tag=a&tag=b` → `["a","b"]`).',
          'The parser is configurable: `app.set("query parser", "simple" | "extended" | false | fn)`.',
        ),
        table('Query parser settings', ['Setting', 'Library', '`?a[b]=1&x=1&x=2`', 'Default in'], [
          ['`"simple"`', 'Node core `querystring`', '`{ "a[b]": "1", x: ["1","2"] }`', 'Express 5'],
          ['`"extended"`', '`qs` package', '`{ a: { b: "1" }, x: ["1","2"] }`', 'Express 4'],
          ['`false`', 'none', '`{}`', '—'],
        ]),
        note('In Express 5 `req.query` is a getter that re-parses from the URL; you cannot reassign it. Store validated values elsewhere (e.g. `res.locals`).'),
      ),
      section('why', 'Why the default changed',
        bullets(
          'The extended `qs` syntax lets clients send nested objects — handy, but it surprises code that expects strings.',
          'Unexpected objects enable bugs like NoSQL operator injection: `?user[$ne]=x` → `{ user: { $ne: "x" } }` passed into a Mongo query.',
          'Simple parsing gives only strings and arrays, which are easier to validate.',
        ),
      ),
      section('internals', 'How it works',
        steps(
          'Express reads the raw query from `req.url` (Node core gives only the full URL string).',
          'The configured parser function turns it into an object on first access of `req.query`.',
          'Percent-encoding is decoded and `+` becomes a space.',
          'Nothing is converted to numbers or booleans — `?active=false` gives the **string** `"false"` (truthy!).',
        ),
      ),
      section('example', 'Pagination and filters',
        code({
          title: 'Parsing and coercing query values',
          code: dedent(`
            const express = require('express');
            const app = express();

            app.get('/products', (req, res) => {
              const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
              const limit = Math.min(100, Number.parseInt(req.query.limit, 10) || 20);
              const tags = [].concat(req.query.tag ?? []);          // string | string[] → string[]
              const inStock = req.query.inStock === 'true';
              res.json({ page, limit, tags, inStock, raw: req.query });
            });

            app.listen(3000);
          `),
          explanation: [
            '`parseInt` + fallback guards against `NaN`; `Math.min` caps abuse like `limit=1000000`.',
            '`[].concat(x)` normalises one-or-many into an array.',
            'Booleans are compared as strings.',
          ],
        }),
        code({
          title: 'Responses (Express 5 default parser)',
          language: 'http',
          code: 'GET /products?page=2&tag=js&tag=node&inStock=false HTTP/1.1\n\nGET /products?limit=5000&filter[price]=10 HTTP/1.1',
          expectedOutput: 'HTTP/1.1 200 OK\n{"page":2,"limit":20,"tags":["js","node"],"inStock":false,"raw":{"page":"2","tag":["js","node"],"inStock":"false"}}\n\nHTTP/1.1 200 OK\n{"page":1,"limit":100,"tags":[],"inStock":false,"raw":{"limit":"5000","filter[price]":"10"}}',
          explanation: [
            'All raw values are strings; repeated `tag` became an array.',
            'With the simple parser, `filter[price]` is a flat key — set `"query parser"` to `"extended"` if you want nested objects.',
          ],
          versionNote: 'In Express 4 (extended by default) the second request would show `"filter":{"price":"10"}`.',
        }),
      ),
      section('real-world', 'Real-world usage',
        bullets(
          'Validate query with a schema (zod / express-validator) and coerce types once.',
          'Whitelist sort fields (`sort=price` ok, `sort=password` rejected) to avoid leaking or slow queries.',
          'Never put secrets or tokens in query strings — they end up in logs, proxies and browser history.',
        ),
      ),
      section('mistakes', 'Common mistakes',
        code({
          title: 'Wrong vs right: boolean flags',
          code: dedent(`
            // ✗ "false" is a non-empty string → truthy
            if (req.query.archived) showArchived();

            // ✓ compare explicitly
            if (req.query.archived === 'true') showArchived();
          `),
        }),
        bullets(
          'Assuming a key is a string — `?id=1&id=2` makes it an array and `.toLowerCase()` throws.',
          'Assigning `req.query = parsed` in Express 5 — it is a getter, so the assignment is silently ignored or throws in strict mode.',
          'Passing `req.query` straight into a database filter.',
        ),
      ),
      section('interview', 'Interview angle',
        interviewTip('Show you know the type problem: everything is a string or array, and with the extended parser possibly an object. Link it to injection and to schema validation.'),
      ),
      section('practice', 'Practice',
        text('Write `parseListQuery(query)` returning `{ page, limit, sort }` where `sort` must be one of `name`, `-name`, `price`, `-price`. Invalid input should fall back to defaults. Test with arrays and missing values.'),
      ),
      section('summary', 'Summary',
        bullets(
          '`req.query` values are strings or arrays (objects only with the extended parser).',
          'Express 5 default: "simple"; Express 4 default: "extended" (`qs`).',
          'Coerce, cap and whitelist every query value.',
          '`req.query` is read-only in Express 5 — keep validated data elsewhere.',
        ),
      ),
    ],
    revisionNotes: [
      'Express 5 query parser default = "simple" (no nested objects); Express 4 = "extended" (`qs`).',
      'Repeated keys → array; `?x=false` → string `"false"` (truthy).',
      'Extended parsing can create objects like `{ $ne: "" }` → NoSQL injection risk.',
      'Cap `limit`, whitelist `sort`, never put secrets in query strings.',
      '`req.query` is a getter in Express 5 — not assignable.',
    ],
    quiz: [
      {
        kind: 'predict-output', difficulty: 'intermediate',
        prompt: 'Express 5 with default settings. Request: `GET /s?q=a&q=b&opt[x]=1`. What is `req.query`?',
        options: [
          '{ q: "b", opt: { x: "1" } }',
          '{ q: ["a","b"], "opt[x]": "1" }',
          '{ q: ["a","b"], opt: { x: "1" } }',
          '{ q: "a,b", "opt[x]": 1 }',
        ],
        answer: 1,
        explanation: 'The simple parser keeps repeated keys as an array and does not expand brackets. The nested object form is the Express 4 / extended behaviour.',
      },
      {
        kind: 'find-bug', difficulty: 'beginner',
        prompt: 'Why does `GET /orders?paid=false` still return only paid orders?',
        code: "app.get('/orders', (req, res) => {\n  const orders = req.query.paid ? getPaid() : getAll();\n  res.json(orders);\n});",
        options: [
          'Query params are only available in POST',
          '`req.query.paid` is the string "false", which is truthy',
          '`req.query` is undefined without express.json()',
          'The route path must be `/orders?paid`',
        ],
        answer: 1,
        explanation: 'Query values are strings. Any non-empty string is truthy. Compare with `=== "true"`.',
      },
    ],
    interview: [
      {
        category: 'express-backend', kind: 'concept', difficulty: 'advanced', topic: 'Query parsing security',
        question: 'How does the choice of query parser in Express affect security, and why did Express 5 change the default?',
        shortAnswer: 'The extended `qs` parser turns bracket syntax into nested objects and arrays, letting attackers smuggle objects (e.g. `{ $ne: "" }`) into code expecting strings; Express 5 defaults to the simple parser, which yields only strings and arrays.',
        detailedAnswer: [
          '`?password[$ne]=x` with extended parsing becomes `{ password: { $ne: "x" } }` — passed to Mongo it bypasses the check.',
          'Type confusion: code calling `.trim()` on what it thinks is a string crashes on an object or array → DoS-style 500s.',
          '`qs` has had prototype-pollution and array-limit issues historically; it now has depth/array limits.',
          'Express 5 sets `"query parser"` to `"simple"` (Node `querystring`); you can opt back into `"extended"`.',
          'Whatever parser you use, validate with a schema and never pass raw query objects to a DB driver.',
        ],
        followUp: 'Arrays still appear with the simple parser — how do you handle `?id=1&id=2` safely?',
        trap: 'Believing the simple parser makes validation unnecessary.',
      },
      {
        category: 'express-backend', kind: 'scenario', difficulty: 'intermediate', topic: 'Pagination input',
        question: 'A client calls GET /items?limit=1000000 and your database spikes. How should the API handle pagination parameters?',
        shortAnswer: 'Parse and validate `page`/`limit` as integers with sane defaults and a hard maximum (e.g. 100), and reject or clamp anything outside the range.',
        detailedAnswer: [
          'Query values arrive as strings; use `parseInt` or a schema with `coerce`.',
          'Apply defaults (page 1, limit 20) and clamp `limit` to a max.',
          'Prefer cursor pagination for deep pages; `OFFSET 1000000` is slow even with a small limit.',
          'Return pagination metadata (`nextCursor`, `total` if cheap).',
        ],
        followUp: 'Why does deep OFFSET pagination get slower, and how does keyset pagination fix it?',
        trap: 'Trusting the client-supplied limit.',
      },
    ],
  },

  // ───────────────────────────────────────────────────────────
  'request-and-response-objects': {
    summary: '`req` and `res` are Node core `IncomingMessage` and `ServerResponse` objects extended by Express with helpers like `req.get`, `req.ip`, `res.status`, `res.json`, `res.send`, `res.sendStatus` and `res.redirect`.',
    topics: ['req.get', 'req.ip', 'req.path', 'res.status', 'res.json', 'res.send', 'res.sendStatus', 'res.redirect', 'res.locals', 'ERR_HTTP_HEADERS_SENT', 'trust proxy'],
    sections: [
      section('introduction', undefined,
        text('Every handler reads from `req` and writes to `res`. Knowing which helpers are Express and which are Node core avoids subtle bugs like sending two responses.'),
      ),
      section('definition', 'The most used members',
        table('req (request)', ['Member', 'Source', 'Meaning'], [
          ['`req.method`, `req.url`, `req.headers`', 'Node core', 'Raw request line and lowercase header map'],
          ['`req.params`, `req.query`, `req.body`', 'Express (+ body parser)', 'Parsed input'],
          ['`req.get("content-type")`', 'Express', 'Case-insensitive header lookup'],
          ['`req.path`, `req.originalUrl`, `req.baseUrl`', 'Express', 'Path without query / full URL / mount path'],
          ['`req.ip`, `req.ips`, `req.protocol`, `req.secure`', 'Express', 'Respect `trust proxy` setting'],
          ['`req.is("json")`', 'Express', 'Checks the Content-Type'],
        ]),
        table('res (response)', ['Member', 'Source', 'Meaning'], [
          ['`res.statusCode`, `res.setHeader`, `res.write`, `res.end`', 'Node core', 'Low-level response API'],
          ['`res.status(201)`', 'Express', 'Sets status, returns `res` for chaining'],
          ['`res.json(obj)`', 'Express', 'JSON body + `application/json` header'],
          ['`res.send(x)`', 'Express', 'String → HTML, Buffer → octet-stream, object → JSON; sets ETag'],
          ['`res.sendStatus(404)`', 'Express', 'Status + status text body ("Not Found")'],
          ['`res.redirect(301, url)`', 'Express', 'Location header; default 302'],
          ['`res.set`, `res.cookie`, `res.type`, `res.locals`', 'Express', 'Headers, cookies, content type, per-request data'],
        ]),
      ),
      section('why', 'Why it matters',
        bullets(
          'An HTTP response can be sent **once**. Headers go first; after `res.end()` you cannot change them.',
          'Proxies change `req.ip`/`req.protocol` — without `trust proxy` you log the load balancer\'s IP.',
        ),
      ),
      section('internals', 'Headers already sent',
        steps(
          '`res.json()` → `res.send()` → sets `Content-Type`, `Content-Length`, `ETag` → calls Node core `res.end(body)`.',
          'Node core writes the status line and headers on the first `write`/`end`; `res.headersSent` becomes `true`.',
          'Any later `setHeader` (e.g. a second `res.json`) throws `ERR_HTTP_HEADERS_SENT` — a **Node core** error.',
          'Calling `res.end()` twice does not throw but the second write is lost (and may emit `ERR_STREAM_WRITE_AFTER_END`).',
        ),
        flow(['Handler calls res.json()', 'Headers + body written (headersSent = true)', 'Handler calls res.json() again', 'Error: ERR_HTTP_HEADERS_SENT'], { direction: 'horizontal' }),
      ),
      section('example', 'Helpers in action',
        code({
          title: 'Status, headers, locals, redirects',
          code: dedent(`
            const express = require('express');
            const app = express();
            app.set('trust proxy', 1); // behind one reverse proxy

            app.use((req, res, next) => {
              res.locals.requestId = req.get('x-request-id') ?? crypto.randomUUID();
              res.set('X-Request-Id', res.locals.requestId);
              next();
            });

            app.post('/users', express.json(), (req, res) => {
              if (!req.is('application/json')) return res.sendStatus(415);
              res.status(201).location('/users/7').json({ id: 7, ...req.body });
            });

            app.get('/old-docs', (req, res) => res.redirect(301, '/docs'));
            app.get('/whoami', (req, res) => res.json({ ip: req.ip, protocol: req.protocol, path: req.path }));

            app.listen(3000);
          `),
          explanation: [
            '`crypto.randomUUID()` is the global Web Crypto API in Node 19+ (use `require("node:crypto")` on older).',
            '`res.status().location().json()` chains because Express helpers return `res`.',
            '`return res.sendStatus(415)` — the `return` stops the rest of the handler.',
          ],
        }),
        code({
          title: 'Responses',
          language: 'http',
          code: 'POST /users HTTP/1.1\nContent-Type: application/json\n\n{"name":"Ada"}\n\nGET /old-docs HTTP/1.1',
          expectedOutput: 'HTTP/1.1 201 Created\nX-Request-Id: 1b4e28ba-2fa1-11d2-883f-0016d3cca427\nLocation: /users/7\nContent-Type: application/json; charset=utf-8\n\n{"id":7,"name":"Ada"}\n\nHTTP/1.1 301 Moved Permanently\nLocation: /docs\n\nMoved Permanently. Redirecting to /docs',
          explanation: ['The request id is random per request; redirect bodies are generated by Express.'],
        }),
      ),
      section('real-world', 'Real-world usage',
        bullets(
          '`res.locals` carries request-scoped data (request id, authenticated user) to later middleware and views.',
          '`trust proxy` must match your topology (number of hops or subnet), otherwise `X-Forwarded-For` can be spoofed.',
          'Use `res.headersSent` in error handlers to avoid double responses.',
        ),
      ),
      section('mistakes', 'Common mistakes',
        code({
          title: 'Wrong vs right: missing return',
          code: dedent(`
            // ✗ falls through and sends a second response → ERR_HTTP_HEADERS_SENT
            app.get('/items/:id', async (req, res) => {
              const item = await repo.find(req.params.id);
              if (!item) res.status(404).json({ error: 'Not found' });
              res.json(item);
            });

            // ✓ return after responding
            app.get('/items/:id', async (req, res) => {
              const item = await repo.find(req.params.id);
              if (!item) return res.status(404).json({ error: 'Not found' });
              res.json(item);
            });
          `),
          expectedOutput: 'Error [ERR_HTTP_HEADERS_SENT]: Cannot set headers after they are sent to the client',
          explanation: ['The error text comes from Node core `http`, not Express.'],
        }),
        bullets(
          '`res.status(404)` alone sends nothing — it only sets the code.',
          '`res.send(200)` was removed in Express 5 — use `res.sendStatus(200)`.',
          'Using `req.headers["Content-Type"]` — Node lowercases header names; use `req.get()` or lowercase keys.',
        ),
      ),
      section('interview', 'Interview angle',
        interviewTip('If asked about "Cannot set headers after they are sent", explain that the response is a stream: headers flush on the first write, and the fix is to `return` after responding and check `res.headersSent` in error handlers.'),
      ),
      section('practice', 'Practice',
        text('Write `GET /download/report` that sets `Content-Disposition: attachment; filename="report.csv"`, `Content-Type: text/csv`, and sends two CSV lines. Use `res.attachment()` and `res.type()`.'),
      ),
      section('summary', 'Summary',
        bullets(
          '`req`/`res` = Node core objects + Express helpers.',
          '`res.status` sets; `res.json`/`send`/`sendStatus`/`redirect`/`end` send.',
          'One response per request — `return` after sending.',
          'Configure `trust proxy` correctly for `req.ip`/`req.protocol`.',
        ),
      ),
    ],
    revisionNotes: [
      '`ERR_HTTP_HEADERS_SENT` is a Node core error from writing headers twice.',
      '`res.status()` does not send; chain it with `json`/`send`.',
      '`res.sendStatus(404)` sends body "Not Found"; `res.redirect` defaults to 302.',
      '`res.send(object)` → JSON; `res.send(string)` → text/html; Buffer → octet-stream.',
      '`res.locals` = request-scoped data; `req.get()` = case-insensitive header.',
      '`trust proxy` controls `req.ip`, `req.protocol`, `req.secure`.',
    ],
    quiz: [
      {
        kind: 'find-bug', difficulty: 'intermediate',
        prompt: 'This handler sometimes crashes with `ERR_HTTP_HEADERS_SENT`. Why?',
        code: "app.get('/a', (req, res) => {\n  if (!req.query.id) {\n    res.status(400).json({ error: 'id required' });\n  }\n  res.json({ id: req.query.id });\n});",
        options: [
          '`res.status` must come after `json`',
          'Missing `return` — the handler sends a second response when id is missing',
          '`req.query.id` is undefined in Express 5',
          'Two `res.json` calls are allowed only with `res.flush()`',
        ],
        answer: 1,
        explanation: 'After the 400 response is sent, execution continues and `res.json` tries to set headers again. Always `return res...`.',
      },
      {
        kind: 'mcq', difficulty: 'beginner',
        prompt: 'What does `res.sendStatus(204)` do?',
        options: [
          'Sets the status but sends nothing',
          'Sets 204 and ends the response (204 has no body)',
          'Throws because 204 is not allowed',
          'Sends JSON `{ status: 204 }`',
        ],
        answer: 1,
        explanation: '`sendStatus` sets the code and sends the status text as body — except for 204/304 where no body is allowed, so Express sends none.',
      },
      {
        kind: 'scenario', difficulty: 'intermediate',
        prompt: 'Behind an AWS load balancer, every `req.ip` logs as `10.0.x.x`. What is the fix?',
        options: [
          'Read `req.socket.remoteAddress`',
          "Configure `app.set('trust proxy', 1)` (or the proxy subnet) so Express uses X-Forwarded-For",
          'Use `req.headers.host`',
          'Disable keep-alive',
        ],
        answer: 1,
        explanation: 'Without `trust proxy`, Express reports the socket peer (the load balancer). `socket.remoteAddress` is the same value. Trust only the proxies you control to avoid spoofing.',
      },
    ],
    interview: [
      {
        category: 'express-backend', kind: 'concept', difficulty: 'intermediate', topic: 'Response lifecycle',
        question: 'What causes "Cannot set headers after they are sent to the client" and how do you prevent it?',
        shortAnswer: 'It is Node core\'s `ERR_HTTP_HEADERS_SENT`, thrown when code tries to set headers or send a response after the first response already flushed headers; prevent it by returning after responding and guarding with `res.headersSent`.',
        detailedAnswer: [
          'The first `res.json/send/end/write` flushes the status line and headers.',
          'Typical causes: missing `return` after an early response, calling `next()` after responding, callbacks firing twice, or an error handler responding after a stream started.',
          'In error middleware: `if (res.headersSent) return next(err)` lets Express close the connection.',
          'Linting for "respond then continue" and consistent `return res...` style avoids it.',
        ],
        followUp: 'What does Express\'s default error handler do if headers were already sent?',
        trap: 'Blaming Express — the error is thrown by Node core `http`.',
      },
      {
        category: 'express-backend', kind: 'concept', difficulty: 'beginner', topic: 'Response helpers',
        question: 'What is the difference between res.send(), res.json() and res.end()?',
        shortAnswer: '`res.end()` is Node core and just finishes the response; `res.send()` is Express and picks a Content-Type based on the value and sets ETag/Content-Length; `res.json()` always JSON-serialises and sets `application/json`.',
        detailedAnswer: [
          '`res.end(data)` writes raw bytes, no headers added.',
          '`res.send("text")` → `text/html`; Buffer → `application/octet-stream`; object → delegates to `res.json`.',
          '`res.json(value)` uses `JSON.stringify` with app settings (`json spaces`, `json replacer`).',
          '`res.json(null)` and numbers are valid JSON bodies; `res.send(number)` is not a status code in Express 5.',
        ],
        followUp: 'Why would you set `app.set("etag", false)` on some APIs?',
        trap: 'Saying `res.send` and `res.json` are identical for strings — a string sent with `res.json` is quoted JSON.',
      },
    ],
  },

  // ───────────────────────────────────────────────────────────
  middleware: {
    summary: 'Middleware are functions `(req, res, next)` that run in order for matching requests; each one can read/modify the request, end the response, or pass control with `next()`, `next("route")` or `next(err)`.',
    topics: ['middleware', 'next()', 'next("route")', 'next(err)', 'pipeline', 'short-circuit', 'async middleware'],
    sections: [
      section('introduction', undefined,
        text('Logging, auth, body parsing and CORS apply to many routes. Middleware lets you write that logic once and plug it into the request pipeline.'),
      ),
      section('definition', 'Definition',
        bullets(
          'A middleware is any function with the signature `(req, res, next)`.',
          'Error middleware has **four** parameters: `(err, req, res, next)`.',
          'Each middleware must either **end the response** or **call `next`** — otherwise the request hangs until the client times out.',
        ),
        table('Ways to call next', ['Call', 'Effect'], [
          ['`next()`', 'Continue to the next matching layer'],
          ['`next("route")`', 'Skip the remaining handlers of the current route; continue with the next route (route handlers only)'],
          ['`next("router")`', 'Exit the current router entirely; continue in the parent'],
          ['`next(err)`', 'Skip all normal middleware; jump to the next error middleware'],
        ]),
      ),
      section('why', 'Why middleware',
        bullets(
          'Separation of concerns: each function does one job.',
          'Reuse: the same `requireAuth` applies to many routers.',
          'Composition: `app.get("/admin", requireAuth, requireRole("admin"), handler)`.',
        ),
      ),
      section('internals', 'Pipeline mechanics',
        steps(
          'Express keeps the current position in the stack and passes a `next` closure to each middleware.',
          'Code after `next()` runs **after** downstream middleware returned synchronously — not after the response is sent.',
          'Express 5: if a middleware returns a rejected promise, Express calls `next(err)` for you.',
          'To run code after the response, listen for `res.on("finish")` (Node core event).',
        ),
        diagram('middleware-pipeline', 'Request flows through middleware; any layer may respond or forward an error.'),
      ),
      section('example', 'Seeing the order',
        code({
          title: 'Pure-JS simulation of next() ordering',
          runnable: true,
          code: dedent(`
            function run(middlewares, req) {
              let i = 0;
              function next(err) {
                const mw = middlewares[i++];
                if (!mw) return console.log('end of stack', err ? 'with error: ' + err.message : '');
                if (err) return next(err); // simplified: skip normal middleware on error
                mw(req, next);
              }
              next();
            }

            run([
              (req, next) => { console.log('A before'); next(); console.log('A after'); },
              (req, next) => { console.log('B'); req.user = 'ada'; next(); },
              (req, next) => { console.log('C sees', req.user); },
            ], {});
          `),
          expectedOutput: 'A before\nB\nC sees ada\nA after',
          explanation: [
            '`next()` calls the next function synchronously, so "A after" prints once B and C returned.',
            'B mutates `req`; C sees the change — that is how auth middleware passes `req.user`.',
            'C does not call `next()`, so the "end of stack" message never prints (in Express, C would send the response).',
          ],
        }),
        code({
          title: 'next("route") in Express',
          code: dedent(`
            const express = require('express');
            const app = express();

            app.get('/reports/:id',
              (req, res, next) => {
                if (req.query.format === 'csv') return next('route');
                next();
              },
              (req, res) => res.json({ id: req.params.id, format: 'json' }),
            );

            app.get('/reports/:id', (req, res) => {
              res.type('text/csv').send('id\\n' + req.params.id);
            });

            app.listen(3000);
          `),
          explanation: [
            '`next("route")` skips the second handler of the first route and jumps to the next matching route.',
            'It only works in `app.METHOD`/`router.METHOD` handlers, not in `app.use`.',
          ],
        }),
        code({
          title: 'Responses',
          language: 'http',
          code: 'GET /reports/5 HTTP/1.1\n\nGET /reports/5?format=csv HTTP/1.1',
          expectedOutput: 'HTTP/1.1 200 OK\nContent-Type: application/json; charset=utf-8\n\n{"id":"5","format":"json"}\n\nHTTP/1.1 200 OK\nContent-Type: text/csv; charset=utf-8\n\nid\n5',
        }),
      ),
      section('real-world', 'Typical middleware stack',
        flow(['helmet: security headers', 'cors', 'express.json', 'request id + logger', 'rate limiter', 'routers (with auth per route)', '404', 'error handler'], { direction: 'vertical', title: 'Production order' }),
      ),
      section('mistakes', 'Common mistakes',
        code({
          title: 'Wrong vs right: forgetting next()',
          code: dedent(`
            // ✗ request hangs: neither responds nor calls next
            app.use((req, res, next) => {
              console.log(req.method, req.url);
            });

            // ✓
            app.use((req, res, next) => {
              console.log(req.method, req.url);
              next();
            });
          `),
        }),
        bullets(
          'Calling `next()` **and** sending a response → headers-sent errors downstream.',
          'Assuming code after `next()` runs after the response — use `res.on("finish")` for timing/logging.',
          'Using `next("route")` inside `app.use` — it has no effect there.',
        ),
      ),
      section('interview', 'Interview angle',
        interviewTip('Interviewers often ask you to write a tiny middleware live (logger or timer). Remember: call `next()`, measure on `res.on("finish")`, and know the four `next` variants.'),
      ),
      section('practice', 'Practice',
        text('Write `responseTime()` middleware that sets an `X-Response-Time` header. Hint: headers must be set before they are flushed — wrap `res.writeHead` or use the third-party `on-headers` package, and explain why `res.on("finish")` is too late for a header.'),
      ),
      section('summary', 'Summary',
        bullets(
          'Middleware = `(req, res, next)`; error middleware = 4 args.',
          'Respond or call `next` — never neither, rarely both.',
          '`next()`, `next("route")`, `next("router")`, `next(err)` each move differently.',
          'Order of registration defines the pipeline.',
        ),
      ),
    ],
    revisionNotes: [
      'Signature `(req, res, next)`; error middleware `(err, req, res, next)`.',
      '`next("route")` works only in route handlers; `next("router")` exits the router.',
      '`next(err)` skips non-error middleware.',
      'Code after `next()` runs when downstream returns, not when the response finishes.',
      'Express 5 auto-forwards rejected promises from middleware to error handlers.',
    ],
    quiz: [
      {
        kind: 'predict-output', difficulty: 'intermediate',
        prompt: 'What is logged for `GET /x`?',
        code: "app.use((req, res, next) => { console.log(1); next(); console.log(2); });\napp.get('/x', (req, res) => { console.log(3); res.end(); });",
        options: ['1 2 3', '1 3 2', '3 1 2', '1 3'],
        answer: 1,
        explanation: '`next()` invokes the route handler synchronously, which logs 3, then control returns and logs 2.',
      },
      {
        kind: 'mcq', difficulty: 'intermediate',
        prompt: 'What does `next("route")` do when called from the first of two handlers in `app.get("/a", h1, h2)`?',
        options: [
          'Runs h2',
          'Skips h2 and continues to the next route that matches `/a`',
          'Jumps to error middleware',
          'Ends the response with 404 immediately',
        ],
        answer: 1,
        explanation: 'It bypasses the rest of the current route\'s handlers. If no further route matches, the final 404 handler responds.',
      },
      {
        kind: 'scenario', difficulty: 'beginner',
        prompt: 'Requests to every endpoint hang forever after you add a new `app.use` logger. What is the likely bug?',
        options: ['The logger is async', 'The logger does not call `next()`', 'The logger is registered first', 'console.log blocks the event loop'],
        answer: 1,
        explanation: 'A middleware that neither responds nor calls `next()` leaves the request pending. Being first is fine; async is fine in Express 5.',
      },
    ],
    interview: [
      {
        category: 'express-backend', kind: 'concept', difficulty: 'beginner', topic: 'Middleware',
        question: 'What is middleware in Express?',
        shortAnswer: 'A function `(req, res, next)` in the request pipeline that can inspect or modify the request and response, end the response, or pass control to the next function with `next()`.',
        detailedAnswer: [
          'Registered with `app.use`, `router.use` or as extra arguments to a route.',
          'Runs in registration order for matching paths.',
          'Used for parsing, auth, logging, validation, CORS, rate limiting.',
          'Error middleware takes four arguments and handles errors passed via `next(err)` or thrown/rejected.',
        ],
        followUp: 'How would you share data between two middleware functions?',
        trap: 'Forgetting that a middleware must either respond or call next.',
      },
      {
        category: 'express-backend', kind: 'concept', difficulty: 'intermediate', topic: 'next()',
        question: 'Compare next(), next("route"), next("router") and next(err).',
        shortAnswer: '`next()` continues; `next("route")` skips the remaining handlers of the current route; `next("router")` leaves the current router; `next(err)` (any other argument) skips to error middleware.',
        detailedAnswer: [
          '`next("route")` only has effect in `app.METHOD`/`router.METHOD` handlers.',
          '`next("router")` returns control to the parent app/router after this router.',
          'Any value other than `"route"`/`"router"` is treated as an error.',
          'In Express 5, throwing or rejecting in a handler is equivalent to `next(err)`.',
        ],
        followUp: 'Give a use case for next("route").',
        trap: 'Calling `next("some message")` expecting a log — it triggers the error handler with a string as the error.',
      },
    ],
  },
};

export default content;
