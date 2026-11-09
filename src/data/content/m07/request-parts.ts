import type { ModuleContent } from '../../../types';
import { bullets, code, dedent, diagram, flow, interviewTip, note, section, steps, table, text } from '../helpers';

const content: Partial<ModuleContent> = {
  headers: {
    summary: 'Headers carry metadata about the request or response: content format (Content-Type, Accept), caching (Cache-Control, ETag), authentication (Authorization) and more.',
    topics: ['headers', 'Content-Type', 'Accept', 'Cache-Control', 'ETag', 'If-None-Match', 'Authorization', 'Bearer', 'Location', 'Vary', 'content negotiation'],
    sections: [
      section('introduction', undefined,
        text('The body is the data; headers describe it. They decide how the body is parsed, whether it may be cached, and who is making the request.'),
      ),
      section('definition', 'Headers you will use daily',
        table('Common headers', ['Header', 'Direction', 'Purpose', 'Example'], [
          ['`Content-Type`', 'Both', 'Format of **this** body', '`application/json; charset=utf-8`'],
          ['`Accept`', 'Request', 'Formats the client wants back', '`application/json`'],
          ['`Content-Length`', 'Both', 'Body size in bytes', '`348`'],
          ['`Authorization`', 'Request', 'Credentials', '`Bearer eyJhbGciOi...`'],
          ['`Cache-Control`', 'Both', 'Caching rules', '`public, max-age=60` / `no-store`'],
          ['`ETag`', 'Response', 'Version identifier of the representation', '`"33a64df5"`'],
          ['`If-None-Match`', 'Request', 'Send body only if ETag changed', '`"33a64df5"`'],
          ['`Location`', 'Response', 'URL of a created/redirect resource', '`/todos/42`'],
          ['`Vary`', 'Response', 'Which request headers changed the response', '`Accept-Encoding, Origin`'],
          ['`Retry-After`', 'Response', 'When to retry (429/503)', '`30`'],
        ]),
      ),
      section('why', 'Why headers matter',
        bullets(
          'Without `Content-Type: application/json` many clients will not parse your JSON.',
          'Correct caching headers cut server load dramatically.',
          'Auth in `Authorization` (not query strings) keeps tokens out of logs and browser history.',
        ),
      ),
      section('internals', 'ETag conditional requests',
        flow(['GET /todos → 200 + ETag: "v1"', 'Client caches body + ETag', 'GET /todos + If-None-Match: "v1"', 'Unchanged → 304, no body', 'Changed → 200 + new ETag'], { title: 'Revalidation with ETag', direction: 'vertical' }),
        bullets(
          'Header names are case-insensitive; Node lowercases them in `req.headers`.',
          'Duplicate headers: most are joined with `, `; `set-cookie` is always an array.',
          '`req.headersDistinct` / `req.rawHeaders` give the unprocessed values (Node 18.3+ for `headersDistinct`).',
        ),
      ),
      section('example', 'Headers in node:http',
        code({
          title: 'Reading request headers, setting response headers',
          code: dedent(`
            const http = require('node:http');
            const crypto = require('node:crypto');

            const todos = [{ id: 1, title: 'Learn headers' }];

            http.createServer((req, res) => {
              if (!(req.headers.accept ?? '*/*').match(/application\\/json|\\*\\/\\*/)) {
                res.writeHead(406).end();
                return;
              }
              const body = JSON.stringify(todos);
              const etag = '"' + crypto.createHash('sha1').update(body).digest('base64url') + '"';
              if (req.headers['if-none-match'] === etag) {
                res.writeHead(304, { ETag: etag }).end();
                return;
              }
              res.writeHead(200, {
                'Content-Type': 'application/json; charset=utf-8',
                'Cache-Control': 'private, max-age=0, must-revalidate',
                ETag: etag,
              });
              res.end(body);
            }).listen(3000);
          `),
          explanation: [
            '406 Not Acceptable when we cannot produce what `Accept` asks for.',
            'The ETag is a hash of the body; same data → same ETag → 304 with no body.',
            '`must-revalidate` + ETag means "cache it, but check with me each time".',
            '`writeHead` returns `res`, so `.end()` can be chained.',
          ],
        }),
        code({
          title: 'Revalidation exchange',
          language: 'http',
          code: dedent(`
            GET /todos HTTP/1.1
            Accept: application/json
            If-None-Match: "q8ZB0gk2ccwZvRsNiYcgVvXqxtA"

            HTTP/1.1 304 Not Modified
            ETag: "q8ZB0gk2ccwZvRsNiYcgVvXqxtA"
          `),
        }),
        code({
          title: 'Parsing a Bearer token (runnable)',
          runnable: true,
          code: dedent(`
            function bearer(headers) {
              const value = headers.authorization || '';
              const [scheme, token] = value.split(' ');
              return scheme && scheme.toLowerCase() === 'bearer' && token ? token : null;
            }
            console.log(bearer({ authorization: 'Bearer abc.def.ghi' }));
            console.log(bearer({ authorization: 'Basic dXNlcjpwYXNz' }));
            console.log(bearer({}));
          `),
          expectedOutput: 'abc.def.ghi\nnull\nnull',
          explanation: ['The scheme comparison is case-insensitive per the spec.', 'Missing or wrong scheme → `null` → respond 401.'],
        }),
      ),
      section('real-world', 'Real-world header recipes',
        table('Cache-Control recipes', ['Content', 'Header'], [
          ['Hashed static assets (app.3f9a.js)', '`public, max-age=31536000, immutable`'],
          ['Public API list that changes rarely', '`public, max-age=60` + ETag'],
          ['Per-user data', '`private, no-cache` + ETag (revalidate every time)'],
          ['Secrets, tokens, banking pages', '`no-store`'],
        ]),
      ),
      section('mistakes', 'Common mistakes',
        bullets(
          'Confusing `Content-Type` (what I am sending) with `Accept` (what I want back).',
          '`no-cache` does **not** mean "do not cache" — it means "revalidate before use". Use `no-store`.',
          'Tokens in query strings (`?token=`) — logged everywhere.',
          'Forgetting `Vary` when the response depends on `Accept-Encoding` or `Origin`.',
        ),
      ),
      section('interview', 'Interview angle',
        interviewTip('Be ready to explain ETag + If-None-Match → 304 and the `no-cache` vs `no-store` difference.'),
      ),
      section('practice', 'Practice',
        text('Add ETag support to `GET /todos/:id` and test with `curl -i -H \'If-None-Match: "..."\'`.'),
      ),
      section('summary', 'Summary',
        bullets('`Content-Type` describes the body; `Accept` requests a format.', 'ETag + If-None-Match → 304.', '`Cache-Control: no-store` for sensitive data.', 'Tokens go in `Authorization: Bearer`.'),
      ),
    ],
    revisionNotes: [
      'Content-Type = format of this body; Accept = desired response format (406 if impossible).',
      'ETag + If-None-Match → 304 Not Modified (no body).',
      'no-cache = revalidate; no-store = never store.',
      'Authorization: Bearer <token>; 401 + WWW-Authenticate when missing.',
      'Node lowercases incoming header names; set-cookie is an array.',
      'Vary lists request headers that change the response.',
    ],
    quiz: [
      {
        kind: 'mcq', difficulty: 'beginner',
        prompt: 'A client sends JSON and wants XML back. Which headers express that?',
        options: ['Accept: application/json, Content-Type: application/xml', 'Content-Type: application/json, Accept: application/xml', 'Content-Type: application/xml only', 'Accept-Encoding: xml'],
        answer: 1,
        explanation: 'Content-Type describes the request body (JSON); Accept asks for the response format (XML).',
      },
      {
        kind: 'mcq', difficulty: 'intermediate',
        prompt: 'Which Cache-Control value ensures a response is never stored by any cache?',
        options: ['no-cache', 'private', 'no-store', 'max-age=0'],
        answer: 2,
        explanation: 'no-store forbids storing. no-cache allows storing but requires revalidation; private only excludes shared caches.',
      },
      {
        kind: 'predict-output', difficulty: 'intermediate',
        prompt: "In node:http, a client sends 'X-Request-ID: 42'. What does req.headers['X-Request-ID'] return?",
        options: ["'42'", 'undefined', "['42']", 'Throws'],
        answer: 1,
        explanation: "Node lowercases header names, so the value is at req.headers['x-request-id'].",
      },
    ],
    interview: [
      {
        category: 'express-backend', kind: 'concept', difficulty: 'beginner', topic: 'Headers',
        question: 'What is the difference between the Content-Type and Accept headers?',
        shortAnswer: 'Content-Type declares the media type of the body being sent in this message; Accept, sent by the client, lists the media types it is willing to receive in the response.',
        detailedAnswer: [
          'Both requests and responses can have Content-Type.',
          'Accept can have quality values: `application/json;q=0.9, */*;q=0.1`.',
          'If the server cannot satisfy Accept it may return 406.',
          'Wrong request Content-Type for the endpoint → 415.',
        ],
        followUp: 'What does Vary: Accept do?',
        trap: 'Sending Content-Type on a GET request without a body and expecting it to select the response format.',
      },
      {
        category: 'express-backend', kind: 'concept', difficulty: 'advanced', topic: 'Caching',
        question: 'How do ETags and conditional requests work, and how would you implement them for a JSON API?',
        shortAnswer: 'The server sends an ETag identifying the representation version; the client later sends If-None-Match with it, and the server returns 304 with no body if the current ETag matches, saving bandwidth; for writes, If-Match enables optimistic concurrency with 412 on mismatch.',
        detailedAnswer: [
          'Strong ETag: hash of the body bytes; weak (`W/"..."`) means semantically equivalent.',
          'Cheaper: derive from `updated_at` or a version column instead of hashing the body.',
          '304 must not have a body; include the ETag and cache headers again.',
          '`If-Match` on PUT/PATCH: mismatch → 412 Precondition Failed (lost-update protection).',
          'Combine with `Cache-Control: no-cache` to force revalidation on every use.',
        ],
        followUp: 'Why can hashing the response body still be expensive for large lists?',
        trap: 'Thinking a 304 saves database work automatically — it only saves bandwidth unless the ETag is computed cheaply.',
      },
    ],
  },

  'query-parameters': {
    summary: 'Query parameters (?page=2&sort=name) modify a request without identifying a different resource. Parse them with new URL(req.url, base).searchParams — values are always strings.',
    topics: ['query string', 'URLSearchParams', 'new URL', 'searchParams.get', 'getAll', 'encoding', 'percent-encoding', 'validation'],
    sections: [
      section('introduction', undefined,
        text('`/todos?done=true&page=2` — the part after `?` filters, sorts and paginates. node:http gives you the raw string in `req.url`; you parse it.'),
      ),
      section('definition', 'Query vs route parameters',
        table('Query vs route parameters', ['', 'Route param', 'Query param'], [
          ['Example', '`/todos/42`', '`/todos?done=true`'],
          ['Identifies', 'Which resource', 'How to view/filter a collection'],
          ['Required?', 'Usually yes (part of path)', 'Usually optional'],
          ['Typical uses', 'IDs, slugs, nesting', 'Filters, sort, pagination, search, fields'],
        ]),
      ),
      section('why', 'Why parse with URL',
        bullets(
          '`new URL(req.url, \'http://localhost\')` handles decoding (`%20`, `+`), repeated keys and edge cases correctly.',
          'The legacy `url.parse()` is deprecated — do not use it.',
          'The base is required because `req.url` is relative (`/todos?x=1`).',
        ),
      ),
      section('internals', 'How a query string is encoded',
        bullets(
          'Pairs separated by `&`, key and value by `=`.',
          'Special characters are percent-encoded (`é` → `%C3%A9`); in query strings `+` means space.',
          'Repeated keys (`tag=a&tag=b`) are allowed — use `getAll`.',
          'Every value is a **string**. `?page=2` gives `\'2\'`, `?done=false` gives `\'false\'` (truthy!).',
        ),
      ),
      section('example', 'Parsing queries',
        code({
          title: 'URL and searchParams (runnable)',
          runnable: true,
          code: dedent(`
            const url = new URL('/todos?done=false&tag=a&tag=b&q=hello+world&page=2', 'http://localhost');
            console.log(url.pathname);
            console.log(url.searchParams.get('done'), typeof url.searchParams.get('done'));
            console.log(url.searchParams.getAll('tag').join(','));
            console.log(url.searchParams.get('q'));
            console.log(Number(url.searchParams.get('page')) + 1);
            console.log(url.searchParams.get('missing'));
            console.log(url.searchParams.has('page'));
          `),
          expectedOutput: '/todos\nfalse string\na,b\nhello world\n3\nnull\ntrue',
          explanation: [
            '`get` returns the first value as a string, or `null` if absent.',
            '`getAll` returns every value for a repeated key.',
            '`+` decodes to a space.',
            'Convert numbers explicitly.',
          ],
        }),
        code({
          title: 'Validating query params (runnable)',
          runnable: true,
          code: dedent(`
            function parseListQuery(searchParams) {
              const errors = [];
              const page = Number(searchParams.get('page') ?? 1);
              if (!Number.isInteger(page) || page < 1) errors.push('page must be a positive integer');
              const doneRaw = searchParams.get('done');
              let done;
              if (doneRaw === 'true') done = true;
              else if (doneRaw === 'false') done = false;
              else if (doneRaw !== null) errors.push('done must be true or false');
              return { errors, page, done };
            }
            const q1 = parseListQuery(new URL('http://x/todos?page=2&done=false').searchParams);
            console.log(JSON.stringify(q1));
            const q2 = parseListQuery(new URL('http://x/todos?page=abc&done=yes').searchParams);
            console.log(q2.errors.join('; '));
          `),
          expectedOutput: '{"errors":[],"page":2,"done":false}\npage must be a positive integer; done must be true or false',
          explanation: ['`"false"` is converted to the boolean `false` explicitly.', 'Invalid input → respond 400 with the error list.'],
        }),
        code({
          title: 'Using it in the Todo API',
          code: dedent(`
            http.createServer((req, res) => {
              const url = new URL(req.url, 'http://localhost');
              if (req.method === 'GET' && url.pathname === '/todos') {
                const { errors, done } = parseListQuery(url.searchParams);
                if (errors.length) return send(res, 400, { error: 'Invalid query', details: errors });
                let list = [...todos.values()];
                if (done !== undefined) list = list.filter((t) => t.done === done);
                return send(res, 200, list);
              }
            });
          `),
        }),
      ),
      section('real-world', 'Real-world',
        bullets(
          'Search: `GET /products?q=shoes&minPrice=50`.',
          'Building URLs safely: `url.searchParams.set(\'q\', userInput)` encodes for you.',
          'Never put secrets in query strings — they end up in access logs, proxies and browser history.',
        ),
      ),
      section('mistakes', 'Common mistakes',
        bullets(
          '`if (query.done)` — the string `\'false\'` is truthy.',
          'Building query strings with string concatenation and no encoding (`&` in a value breaks it).',
          'Using deprecated `url.parse` or `querystring` for new code.',
          'Not limiting values (`limit=1000000`).',
        ),
      ),
      section('interview', 'Interview angle',
        interviewTip('Mention that query values are strings and must be validated/converted, and show `new URL(req.url, base)`.'),
      ),
      section('practice', 'Practice',
        text('Support `GET /todos?q=milk` returning todos whose title contains `q` (case-insensitive), and validate that `q` is at most 100 characters.'),
      ),
      section('summary', 'Summary',
        bullets('Query params modify, route params identify.', 'Parse with `new URL(req.url, base).searchParams`.', 'Values are strings or null; `getAll` for repeats.', 'Validate and convert every value.'),
      ),
    ],
    revisionNotes: [
      'new URL(req.url, "http://localhost") — base required for relative req.url.',
      'searchParams.get → string | null; getAll → string[].',
      '"+" decodes to space; values percent-decoded.',
      '"false" is truthy — convert explicitly.',
      'url.parse is legacy/deprecated.',
      'No secrets in query strings.',
    ],
    quiz: [
      {
        kind: 'predict-output', difficulty: 'beginner',
        prompt: 'What is logged?',
        code: "const u = new URL('http://x/a?active=false');\nconsole.log(u.searchParams.get('active') ? 'yes' : 'no');",
        options: ['no', 'yes', 'false', 'null'],
        answer: 1,
        explanation: "get returns the string 'false', which is truthy, so 'yes' is printed. Convert explicitly.",
      },
      {
        kind: 'complete-code', difficulty: 'intermediate',
        prompt: 'Get every value of a repeated ?tag= parameter.',
        code: "const tags = url.searchParams./* ??? */('tag');",
        options: ['get', 'getAll', 'values', 'entries'],
        answer: 1,
        explanation: 'getAll returns an array of every value; get returns only the first.',
      },
      {
        kind: 'find-bug', difficulty: 'intermediate',
        prompt: 'Why does this throw for every request?',
        code: 'const url = new URL(req.url);',
        options: ['URL is not global in Node', 'req.url is relative (/path?x=1), so new URL needs a base like "http://localhost"', 'req.url is undefined', 'URL is async'],
        answer: 1,
        explanation: 'A relative URL without a base throws "Invalid URL" (ERR_INVALID_URL). URL has been a global since Node 10.',
      },
    ],
    interview: [
      {
        category: 'express-backend', kind: 'concept', difficulty: 'beginner', topic: 'Query parameters',
        question: 'When should you use query parameters versus route parameters?',
        shortAnswer: 'Route parameters identify a specific resource (/users/42); query parameters modify how a resource or collection is returned — filtering, sorting, pagination, search.',
        detailedAnswer: [
          'Route params are part of the resource identity and usually required.',
          'Query params are optional modifiers.',
          'Rule of thumb: if removing it changes *which* thing you get, it is a path segment.',
          'Both arrive as strings and need validation.',
        ],
        followUp: 'How would you design the URL for "comments of post 7 sorted by date"?',
        trap: 'Putting filters in the path (/users/active/sorted-by-name).',
      },
      {
        category: 'express-backend', kind: 'concept', difficulty: 'intermediate', topic: 'Query parameters',
        question: 'How do you parse and validate query strings in a plain node:http server, and what pitfalls exist?',
        shortAnswer: 'Use new URL(req.url, base).searchParams, then convert and validate each value explicitly, because values are strings or null, keys can repeat, and decoding rules (+ as space) apply.',
        detailedAnswer: [
          'Always provide a base to `new URL` since `req.url` is relative.',
          'Numbers: `Number(x)` + `Number.isInteger` + range check.',
          'Booleans: compare against `\'true\'`/`\'false\'`.',
          'Arrays: `getAll`; cap their length.',
          'Return 400 with details for invalid values.',
        ],
        followUp: 'How does Express parse ?a[b]=1 differently from URLSearchParams?',
        trap: 'Using url.parse(req.url, true) in new code.',
      },
    ],
  },

  'route-parameters': {
    summary: 'Route parameters are variable path segments (/todos/:id). Without a framework you match them yourself — with a tiny pattern-based router that also validates the values.',
    topics: ['route parameters', 'path segments', 'router', 'regex', 'URLPattern', 'nested resources', 'decodeURIComponent'],
    sections: [
      section('introduction', undefined,
        text('In Express you write `app.get(\'/todos/:id\')`. Under the hood something has to turn `/todos/42` into `{ id: \'42\' }`. Let us build that.'),
      ),
      section('definition', 'What a router does',
        bullets(
          'Holds a list of routes: method + path pattern + handler.',
          'For each request, finds the first route whose method and pattern match.',
          'Extracts named segments (`:id`) into `params` (decoded strings).',
          'Returns 404 if no path matches, 405 if the path matches but not the method.',
        ),
      ),
      section('why', 'Why build one by hand',
        bullets(
          'You understand what Express routing costs and does.',
          'For a tiny service (health check, webhook receiver) it avoids a dependency.',
          'Debugging framework routing issues becomes easy.',
        ),
      ),
      section('internals', 'Matching algorithm',
        flow(['Pattern /todos/:id', 'Split → ["todos", ":id"]', 'Path /todos/42 → ["todos", "42"]', 'Compare segment by segment', 'params = { id: "42" }'], { title: 'Segment matching', direction: 'vertical' }),
        note('Node 23.8+ has an experimental global `URLPattern` (a Web standard) that does this for you. Frameworks use optimised tries/radix trees.'),
      ),
      section('example', 'A tiny router',
        code({
          title: 'Pattern matcher (runnable)',
          runnable: true,
          code: dedent(`
            function compile(pattern) {
              const parts = pattern.split('/').filter(Boolean);
              return (path) => {
                const segs = path.split('/').filter(Boolean);
                if (segs.length !== parts.length) return null;
                const params = {};
                for (let i = 0; i < parts.length; i++) {
                  if (parts[i].startsWith(':')) params[parts[i].slice(1)] = decodeURIComponent(segs[i]);
                  else if (parts[i] !== segs[i]) return null;
                }
                return params;
              };
            }

            const match = compile('/users/:userId/todos/:todoId');
            console.log(JSON.stringify(match('/users/7/todos/42')));
            console.log(match('/users/7/todos'));
            console.log(JSON.stringify(compile('/tags/:name')('/tags/caf%C3%A9')));
          `),
          expectedOutput: '{"userId":"7","todoId":"42"}\nnull\n{"name":"café"}',
          explanation: [
            'Segment count must match exactly.',
            'Static segments must be equal; `:name` segments are captured.',
            'Values are percent-decoded — and are still strings.',
          ],
        }),
        code({
          title: 'Router with 404 / 405 (Todo API v3)',
          code: dedent(`
            const http = require('node:http');

            const routes = [];
            const route = (method, pattern, handler) => routes.push({ method, match: compile(pattern), handler });

            route('GET', '/todos', (req, res) => send(res, 200, [...todos.values()]));
            route('GET', '/todos/:id', (req, res, { id }) => {
              if (!/^\\d+$/.test(id)) return send(res, 400, { error: 'id must be numeric' });
              const todo = todos.get(Number(id));
              return todo ? send(res, 200, todo) : send(res, 404, { error: 'Todo not found' });
            });
            route('DELETE', '/todos/:id', (req, res, { id }) =>
              todos.delete(Number(id)) ? send(res, 204) : send(res, 404, { error: 'Todo not found' }));

            http.createServer(async (req, res) => {
              const { pathname } = new URL(req.url, 'http://localhost');
              const allowed = [];
              for (const r of routes) {
                const params = r.match(pathname);
                if (!params) continue;
                if (r.method === req.method) {
                  try { return await r.handler(req, res, params); }
                  catch (err) { console.error(err); return send(res, 500, { error: 'Internal Server Error' }); }
                }
                allowed.push(r.method);
              }
              if (allowed.length) return send(res, 405, { error: 'Method not allowed' }, { Allow: allowed.join(', ') });
              send(res, 404, { error: 'Route not found' });
            }).listen(3000);
          `),
          explanation: [
            '`compile` and `send` are the helpers from earlier.',
            'Route params are validated: `/todos/abc` → 400 rather than a confusing 404.',
            'If a path matched but no method did, we answer 405 with `Allow`.',
            'Handler errors are caught centrally → 500.',
          ],
        }),
      ),
      section('real-world', 'Real-world',
        bullets(
          'Nested resources: `/users/:userId/orders/:orderId` — check that the order belongs to the user (authorization!).',
          'Slugs: `/articles/:slug` with a unique index on `slug`.',
          'Validate UUIDs/ObjectIds before hitting the database.',
        ),
      ),
      section('mistakes', 'Common mistakes',
        bullets(
          'Trusting nested IDs: `/users/7/orders/99` returning order 99 even if it belongs to user 8 (IDOR vulnerability).',
          'Forgetting params are strings: `todos.get(\'42\')` on a Map keyed by numbers → undefined.',
          'Route ordering: `/todos/:id` registered before `/todos/stats` swallows `stats` as an id.',
          '`decodeURIComponent` throws on malformed input like `%E0%A4%A` — catch it and return 400.',
        ),
      ),
      section('interview', 'Interview angle',
        interviewTip('If asked "how does routing work without Express?", describe split-and-compare or regex matching, 404 vs 405, and route ordering.'),
      ),
      section('practice', 'Practice',
        text('Add support for optional wildcard routes (`/files/*`) to the matcher, capturing the rest of the path in `params.rest`.'),
      ),
      section('summary', 'Summary',
        bullets('Route params identify resources.', 'Match by segments; capture `:name`.', 'Params are decoded strings — validate and convert.', '404 for unknown path, 405 for wrong method.'),
      ),
    ],
    revisionNotes: [
      'Route param = path segment variable, always a string.',
      'Router: method + pattern → handler; 404 vs 405 + Allow.',
      'Validate params (numeric/UUID) → 400 early.',
      'Specific routes before parameterised ones.',
      'Nested IDs need ownership checks (IDOR).',
      'decodeURIComponent can throw URIError.',
    ],
    quiz: [
      {
        kind: 'find-bug', difficulty: 'intermediate',
        prompt: 'GET /todos/1 always returns 404 even though todo 1 exists. Why?',
        code: "const todos = new Map([[1, { id: 1 }]]);\n// params.id comes from the URL\nconst todo = todos.get(params.id);",
        options: ['Map.get is async', "params.id is the string '1' but the Map key is the number 1", 'The route pattern is wrong', 'Maps cannot hold objects'],
        answer: 1,
        explanation: "Route params are strings. Map uses SameValueZero, so '1' !== 1. Convert with Number(params.id).",
      },
      {
        kind: 'scenario', difficulty: 'advanced',
        prompt: 'GET /users/5/invoices/900 returns invoice 900 even though it belongs to user 6. What is this and how do you fix it?',
        options: ['A routing bug; reorder routes', 'An IDOR/broken object-level authorization bug; query the invoice by both id and owner (and check the authenticated user)', 'A caching bug', 'Expected REST behaviour'],
        answer: 1,
        explanation: 'Insecure Direct Object Reference: the server trusts IDs from the URL. Always scope lookups by the authenticated owner.',
      },
    ],
    interview: [
      {
        category: 'express-backend', kind: 'concept', difficulty: 'intermediate', topic: 'Routing',
        question: 'How would you implement routing with route parameters using only node:http?',
        shortAnswer: 'Keep a list of method + compiled pattern + handler, parse the pathname with new URL, match each pattern segment by segment (capturing :name segments into params), then return 405 with Allow if only the method differs, or 404 if nothing matched.',
        detailedAnswer: [
          'Compile patterns once at startup (split or regex).',
          'Decode captured segments with `decodeURIComponent` (catch URIError → 400).',
          'First match wins, so order specific routes before generic ones.',
          'Wrap handlers in try/catch to send 500 on errors.',
          'Frameworks use radix trees for O(path length) matching.',
        ],
        followUp: 'Why does route order matter for /users/me versus /users/:id?',
        trap: 'Returning 404 for wrong methods on existing paths.',
      },
    ],
  },

  'request-body': {
    summary: 'In node:http the body is a stream: collect the chunks (with a size limit), concatenate once, decode and JSON.parse in a try/catch, and answer 400/413/415 for bad input.',
    topics: ['request body', 'JSON parsing', 'collect chunks', 'body size limit', '413', '415', 'Content-Length', 'for await', 'Todo API POST'],
    sections: [
      section('introduction', undefined,
        text('There is no `req.body` in Node core. The body arrives in chunks over time, and reading it safely is your job — the very thing `express.json()` does for you.'),
      ),
      section('definition', 'Reading a body correctly',
        steps(
          'Check `Content-Type` (else 415).',
          'If `Content-Length` exceeds the limit, reject early (413).',
          'Collect Buffer chunks while counting bytes; abort when over the limit (413).',
          '`Buffer.concat(chunks).toString(\'utf8\')`.',
          '`JSON.parse` inside try/catch (400 on syntax error).',
          'Validate the shape (422/400).',
        ),
      ),
      section('why', 'Why each step',
        bullets(
          'Without a limit, one client can send 5 GB and exhaust memory (DoS).',
          'Decoding once after concatenation avoids split multi-byte characters.',
          '`JSON.parse` throws on invalid input — uncaught in an async handler that is a crash or a hung request.',
        ),
      ),
      section('internals', 'Chunks over time',
        diagram('stream-pipeline', 'req is a Readable: chunks arrive as the network delivers them; the handler accumulates them up to a limit.'),
      ),
      section('example', 'readJson helper and POST /todos',
        code({
          title: 'readJson with size limit',
          code: dedent(`
            class HttpError extends Error {
              constructor(status, message) { super(message); this.status = status; }
            }

            async function readJson(req, limit = 100_000) {
              const type = req.headers['content-type'] ?? '';
              if (!type.startsWith('application/json')) throw new HttpError(415, 'Expected application/json');

              const declared = Number(req.headers['content-length'] ?? 0);
              if (declared > limit) throw new HttpError(413, 'Body too large');

              const chunks = [];
              let size = 0;
              for await (const chunk of req) {
                size += chunk.length;
                if (size > limit) {
                  req.destroy(); // stop reading
                  throw new HttpError(413, 'Body too large');
                }
                chunks.push(chunk);
              }
              const text = Buffer.concat(chunks).toString('utf8');
              if (!text) throw new HttpError(400, 'Empty body');
              try {
                return JSON.parse(text);
              } catch {
                throw new HttpError(400, 'Invalid JSON');
              }
            }
          `),
          explanation: [
            '`for await` reads the request with backpressure.',
            'Byte counting catches chunked bodies that have no Content-Length.',
            '`Buffer.concat` once, then decode — correct for UTF-8.',
            'Errors carry an HTTP status for the central error handler.',
          ],
        }),
        code({
          title: 'POST and PATCH in the Todo API (v4)',
          code: dedent(`
            route('POST', '/todos', async (req, res) => {
              const data = await readJson(req);
              if (typeof data.title !== 'string' || !data.title.trim()) {
                return send(res, 422, { error: 'title is required' });
              }
              const todo = { id: nextId++, title: data.title.trim(), done: false };
              todos.set(todo.id, todo);
              send(res, 201, todo, { Location: '/todos/' + todo.id });
            });

            route('PATCH', '/todos/:id', async (req, res, { id }) => {
              const todo = todos.get(Number(id));
              if (!todo) return send(res, 404, { error: 'Todo not found' });
              const data = await readJson(req);
              if ('title' in data) todo.title = String(data.title);
              if ('done' in data) todo.done = Boolean(data.done);
              send(res, 200, todo);
            });
          `),
          explanation: ['`HttpError`s thrown by `readJson` are turned into responses by the router\'s catch block (use `err.status ?? 500`).', 'Only whitelisted fields are copied — never `Object.assign(todo, data)`.'],
        }),
        code({
          title: 'Exchange',
          language: 'http',
          code: dedent(`
            POST /todos HTTP/1.1
            Content-Type: application/json

            {"title":"Buy milk"}

            HTTP/1.1 201 Created
            Location: /todos/2
            Content-Type: application/json

            {"id":2,"title":"Buy milk","done":false}

            POST /todos HTTP/1.1
            Content-Type: application/json

            {"title":

            HTTP/1.1 400 Bad Request
            Content-Type: application/json

            {"error":"Invalid JSON"}
          `),
        }),
      ),
      section('real-world', 'Real-world',
        bullets(
          'Webhook receivers often need the **raw** body (Buffer) to verify an HMAC signature before parsing.',
          'Typical limits: 100 KB for JSON APIs (Express default), larger only on upload routes.',
          'Set `server.requestTimeout` so slow-drip bodies cannot hold sockets forever.',
        ),
      ),
      section('mistakes', 'Common mistakes',
        bullets(
          'No size limit.',
          '`body += chunk` string concatenation (split characters, implicit toString).',
          '`JSON.parse` without try/catch.',
          'Mass assignment: `Object.assign(user, body)` lets clients set `isAdmin`.',
          'Trusting `Content-Length` alone.',
          'Prototype pollution: be careful when merging parsed JSON containing `__proto__`.',
        ),
      ),
      section('interview', 'Interview angle',
        interviewTip('Describe readJson: content-type check, size limit (both declared and counted), concat once, parse in try/catch, then validate. That shows you know what `express.json()` does.'),
      ),
      section('practice', 'Practice',
        text('Add `PUT /todos/:id` that requires both `title` and `done` (full replacement) and returns 422 listing every missing field.'),
      ),
      section('summary', 'Summary',
        bullets('Body = stream; collect chunks.', 'Limit size (413), check type (415), parse safely (400).', 'Validate and whitelist fields.', 'Concat once, decode once.'),
      ),
    ],
    revisionNotes: [
      'No req.body in core — read the stream.',
      'Check Content-Type → 415; size → 413; JSON.parse in try/catch → 400.',
      'Count bytes while reading (chunked bodies have no Content-Length).',
      'Buffer.concat(chunks).toString() once.',
      'Whitelist fields; avoid mass assignment.',
      'Raw body needed for webhook signatures.',
    ],
    quiz: [
      {
        kind: 'find-bug', difficulty: 'intermediate',
        prompt: 'What is the most serious problem in this body reader?',
        code: "let body = '';\nreq.on('data', (c) => (body += c));\nreq.on('end', () => {\n  const data = JSON.parse(body);\n  handle(data);\n});",
        options: ["'end' fires before 'data'", 'No size limit and no try/catch around JSON.parse — a huge or malformed body crashes or exhausts the server', 'JSON.parse is async', 'body should be an array'],
        answer: 1,
        explanation: 'An attacker can send gigabytes, and invalid JSON throws inside an event handler, crashing the process. (String concatenation also risks split UTF-8 characters.)',
      },
      {
        kind: 'mcq', difficulty: 'beginner',
        prompt: 'Which status code for a request body larger than the allowed limit?',
        options: ['400', '411', '413', '507'],
        answer: 2,
        explanation: '413 Content Too Large (formerly Payload Too Large). 411 is Length Required.',
      },
      {
        kind: 'mcq', difficulty: 'intermediate',
        prompt: 'Why count bytes during reading if you already checked Content-Length?',
        options: ['Content-Length is always wrong', 'Chunked requests have no Content-Length, and the header must not be trusted blindly', 'Node removes Content-Length', 'To compute an ETag'],
        answer: 1,
        explanation: 'With Transfer-Encoding: chunked there is no Content-Length; counting is the only reliable limit.',
      },
    ],
    interview: [
      {
        category: 'express-backend', kind: 'concept', difficulty: 'intermediate', topic: 'Request body',
        question: 'How do you read a JSON request body in a plain node:http server?',
        shortAnswer: 'Iterate the req stream (for await or data/end), push Buffer chunks into an array while enforcing a size limit, Buffer.concat and decode them once at the end, and JSON.parse inside try/catch.',
        detailedAnswer: [
          'Check `content-type` is `application/json` (415 otherwise).',
          'Count bytes; destroy the request and return 413 above the limit.',
          'Invalid JSON → 400; schema violations → 422/400.',
          'This is what `express.json()` (body-parser) does.',
        ],
        followUp: 'When do you need the raw body instead of parsed JSON?',
        trap: 'Saying req.body exists in Node core.',
      },
      {
        category: 'express-backend', kind: 'scenario', difficulty: 'advanced', topic: 'Request body',
        question: 'How would you protect a Node API against clients that send extremely large or extremely slow request bodies?',
        shortAnswer: 'Enforce byte limits while streaming (413 and destroy the request), cap concurrent body reads, and set server.requestTimeout/headersTimeout (and proxy limits such as client_max_body_size) so slow-drip clients are cut off.',
        detailedAnswer: [
          'Large: check declared length early, count actual bytes, `req.destroy()` on overflow.',
          'Slow (slowloris / slow POST): `requestTimeout`, `headersTimeout`, and reverse-proxy timeouts.',
          'Stream uploads to disk/storage instead of buffering.',
          'Rate-limit endpoints that accept bodies.',
          'Limit JSON nesting depth/array lengths in validation to avoid CPU blowups.',
        ],
        followUp: 'Why is it good to enforce limits at the reverse proxy as well?',
        trap: 'Relying only on the Content-Length header.',
      },
    ],
  },

  'content-types': {
    summary: 'Content-Type tells the receiver how to parse the body: application/json for APIs, application/x-www-form-urlencoded for simple HTML forms, multipart/form-data for file uploads, plus text, HTML and binary types.',
    topics: ['Content-Type', 'MIME type', 'application/json', 'application/x-www-form-urlencoded', 'multipart/form-data', 'boundary', 'charset', 'octet-stream', '415'],
    sections: [
      section('introduction', undefined,
        text('The same body bytes mean different things depending on `Content-Type`. Your server must branch on it to parse correctly.'),
      ),
      section('definition', 'The main content types',
        table('Content types', ['Type', 'Body looks like', 'Used for', 'Parse in Node core with'], [
          ['`application/json`', '`{"title":"x","done":true}`', 'APIs', '`JSON.parse`'],
          ['`application/x-www-form-urlencoded`', '`title=Buy+milk&done=true`', 'Default HTML `<form>`', '`new URLSearchParams(text)`'],
          ['`multipart/form-data; boundary=…`', 'Parts separated by a boundary, each with headers', 'File uploads, mixed fields', 'Streaming parser (busboy — third-party), or `Request.formData()` for small bodies'],
          ['`text/plain`, `text/html`, `text/csv`', 'Text', 'Pages, exports', '`toString(\'utf8\')`'],
          ['`application/octet-stream`', 'Raw bytes', 'Binary downloads/uploads', 'Stream it'],
        ]),
      ),
      section('why', 'Why it matters',
        bullets(
          'Parsing JSON as form data (or vice versa) silently produces garbage.',
          'Wrong response type: browsers may download JSON instead of showing it, or sniff and render HTML (XSS risk — send `X-Content-Type-Options: nosniff`).',
          'Respond `415 Unsupported Media Type` for types an endpoint does not accept.',
        ),
      ),
      section('internals', 'What multipart looks like',
        code({
          title: 'A multipart/form-data request',
          language: 'http',
          code: dedent(`
            POST /avatars HTTP/1.1
            Content-Type: multipart/form-data; boundary=----X42

            ------X42
            Content-Disposition: form-data; name="userId"

            7
            ------X42
            Content-Disposition: form-data; name="file"; filename="me.png"
            Content-Type: image/png

            <binary PNG bytes>
            ------X42--
          `),
          explanation: ['Each part has its own headers.', 'The boundary is chosen by the client and declared in the header.', 'The final boundary ends with `--`.'],
        }),
      ),
      section('example', 'Parsing by content type',
        code({
          title: 'Form-urlencoded parsing (runnable)',
          runnable: true,
          code: dedent(`
            const form = new URL('http://x/?' + 'title=Buy+milk&done=true&tags=a&tags=b').searchParams;
            const obj = Object.fromEntries(form);
            console.log(JSON.stringify(obj));
            console.log(form.getAll('tags').length);
          `),
          expectedOutput: '{"title":"Buy milk","done":"true","tags":"b"}\n2',
          explanation: [
            'In Node you would write `new URLSearchParams(bodyText)`; here we reuse `URL` so it runs in the sandbox.',
            '`Object.fromEntries` keeps only the last value of repeated keys — use `getAll` for arrays.',
            'Everything is a string, like query params.',
          ],
        }),
        code({
          title: 'A body parser that branches on Content-Type',
          code: dedent(`
            async function readBody(req, limit = 100_000) {
              const chunks = [];
              let size = 0;
              for await (const c of req) {
                if ((size += c.length) > limit) throw new HttpError(413, 'Body too large');
                chunks.push(c);
              }
              const text = Buffer.concat(chunks).toString('utf8');
              const type = (req.headers['content-type'] ?? '').split(';')[0].trim().toLowerCase();

              switch (type) {
                case 'application/json':
                  try { return JSON.parse(text); } catch { throw new HttpError(400, 'Invalid JSON'); }
                case 'application/x-www-form-urlencoded':
                  return Object.fromEntries(new URLSearchParams(text));
                default:
                  throw new HttpError(415, 'Unsupported Content-Type: ' + (type || 'none'));
              }
            }
          `),
          explanation: ['Strip parameters like `; charset=utf-8` before comparing.', 'Media types are case-insensitive.', 'Multipart is deliberately not handled — use a streaming library for uploads.'],
        }),
        code({
          title: 'Small multipart bodies with the Web Request API',
          code: dedent(`
            // Node 18+: fine for small forms (it buffers everything)
            const { Readable } = require('node:stream');
            async function readFormData(req) {
              const request = new Request('http://localhost' + req.url, {
                method: req.method,
                headers: req.headers,
                body: Readable.toWeb(req),
                duplex: 'half',
              });
              return request.formData(); // FormData with fields and File objects
            }
          `),
          explanation: ['Buffers the whole body — apply a size limit first. For large files use a streaming parser.'],
          versionNote: 'Readable.toWeb: Node 17+; Request/FormData globals: Node 18+.',
        }),
      ),
      section('real-world', 'Real-world',
        bullets(
          'APIs: accept and return `application/json; charset=utf-8`.',
          'Avatar upload: multipart parsed by busboy (third-party), streamed to object storage with size and MIME checks.',
          'Payment provider webhooks: some send form-urlencoded bodies — check their docs.',
          'Always set `X-Content-Type-Options: nosniff` on responses.',
        ),
      ),
      section('mistakes', 'Common mistakes',
        bullets(
          'Comparing `content-type === \'application/json\'` and failing on `; charset=utf-8`.',
          'Trusting the uploaded file\'s declared `Content-Type` — check magic bytes.',
          'Buffering huge multipart uploads in memory.',
          'Forgetting `Content-Type` on responses.',
        ),
      ),
      section('interview', 'Interview angle',
        interviewTip('Compare form-urlencoded vs multipart: urlencoded is a single key=value string (no files), multipart has boundaries and per-part headers (files).'),
      ),
      section('practice', 'Practice',
        text('Make `POST /todos` accept both JSON and form-urlencoded bodies, converting `done=true` to a boolean.'),
      ),
      section('summary', 'Summary',
        bullets('JSON for APIs.', 'urlencoded for simple forms.', 'multipart for files (stream it).', '415 for unsupported types; strip parameters before comparing.'),
      ),
    ],
    revisionNotes: [
      'application/json → JSON.parse; urlencoded → URLSearchParams; multipart → streaming parser.',
      'multipart boundary declared in Content-Type.',
      'Compare the media type without parameters, case-insensitively.',
      '415 Unsupported Media Type.',
      'X-Content-Type-Options: nosniff.',
      'Do not trust uploaded file MIME types.',
    ],
    quiz: [
      {
        kind: 'mcq', difficulty: 'beginner',
        prompt: 'Which content type should a form use to upload a file?',
        options: ['application/json', 'application/x-www-form-urlencoded', 'multipart/form-data', 'text/plain'],
        answer: 2,
        explanation: 'multipart/form-data supports binary file parts with their own headers. urlencoded cannot carry files efficiently.',
      },
      {
        kind: 'find-bug', difficulty: 'intermediate',
        prompt: 'Why do some JSON requests get a 415?',
        code: "if (req.headers['content-type'] !== 'application/json') {\n  return send(res, 415, { error: 'JSON only' });\n}",
        options: ['Header names are uppercase', "Clients often send 'application/json; charset=utf-8', which fails the strict equality", 'JSON needs text/json', '415 is the wrong code'],
        answer: 1,
        explanation: 'Parse the media type: split on ";", trim and lowercase before comparing.',
      },
    ],
    interview: [
      {
        category: 'express-backend', kind: 'concept', difficulty: 'intermediate', topic: 'Content types',
        question: 'Compare application/json, application/x-www-form-urlencoded and multipart/form-data.',
        shortAnswer: 'JSON carries structured data for APIs; form-urlencoded encodes flat key=value pairs like a query string (the HTML form default); multipart/form-data splits the body into boundary-separated parts with their own headers, which is needed for file uploads.',
        detailedAnswer: [
          'JSON supports nesting, numbers, booleans; parse with JSON.parse.',
          'urlencoded values are all strings; parse with URLSearchParams.',
          'multipart is efficient for binary and should be stream-parsed.',
          'In Express: `express.json()`, `express.urlencoded()`, and multer/busboy for multipart (third-party).',
        ],
        followUp: 'Why are urlencoded and multipart "simple" CORS content types while JSON is not?',
        trap: 'Saying you can upload files with JSON "just as well" — base64 inflates size by ~33% and must be buffered.',
      },
    ],
  },
};

export default content;
