import type { ModuleContent } from '../../../types';
import { bullets, code, dedent, flow, interviewTip, section, table, text, warn } from '../helpers';

const content: Partial<ModuleContent> = {
  'rate-limiting': {
    summary: 'Rate limiting caps how many requests a client may make per time window to protect availability and stop abuse. Common algorithms: fixed window, sliding window and token bucket; reject with 429 and Retry-After.',
    topics: ['rate limiting', 'fixed window', 'sliding window', 'token bucket', 'leaky bucket', '429 Too Many Requests', 'Retry-After', 'RateLimit headers', 'Redis', 'distributed rate limiting'],
    sections: [
      section('introduction', undefined,
        text('One buggy client looping on `POST /login`, or a credential-stuffing bot, can take down an API. A rate limiter says "100 requests per minute per key" and rejects the rest cheaply.'),
      ),
      section('definition', 'Algorithms',
        table('Rate-limiting algorithms', ['Algorithm', 'How it works', 'Pros', 'Cons'], [
          ['Fixed window', 'Counter per key per window (e.g. per minute); reset at boundary', 'Simplest, O(1) memory', 'Bursts at boundaries: 2× limit across two windows'],
          ['Sliding window log', 'Store timestamps of requests; count those within the last N seconds', 'Exact', 'Memory grows with limit'],
          ['Sliding window counter', 'Weighted mix of current and previous window counts', 'Smooth, O(1) memory', 'Approximate'],
          ['Token bucket', 'Bucket of capacity C refills at R tokens/s; each request takes a token', 'Allows controlled bursts, smooth average', 'Two parameters to tune'],
          ['Leaky bucket', 'Queue drained at a constant rate', 'Smooth output rate', 'Adds latency; queue can fill'],
        ]),
      ),
      section('why', 'Why rate limit',
        bullets(
          'Availability: protect CPU, DB and downstream APIs from overload.',
          'Security: slow brute-force and credential stuffing on auth endpoints.',
          'Fairness and cost: per-plan quotas for paying customers.',
          'Keys: API key, user id, or IP (careful with NAT and proxies).',
        ),
      ),
      section('internals', 'Token bucket step by step',
        flow(['Bucket: capacity 5, refill 1 token/s', 'Request arrives: refill by elapsed time × rate', 'tokens ≥ 1? take one → allow', 'else → 429 + Retry-After = time until 1 token'], { title: 'Token bucket', direction: 'vertical' }),
        bullets(
          'No timer needed: compute the refill lazily from the time since the last request.',
          'Fixed window boundary problem: 100 requests at 12:00:59 and 100 at 12:01:00 → 200 in two seconds.',
        ),
      ),
      section('example', 'In-memory implementations',
        code({
          title: 'Fixed window vs token bucket with a fake clock (runnable)',
          runnable: true,
          code: dedent(`
            function fixedWindow(limit, windowMs) {
              const counters = new Map();
              return (key, now) => {
                const windowStart = Math.floor(now / windowMs) * windowMs;
                const c = counters.get(key);
                if (!c || c.windowStart !== windowStart) {
                  counters.set(key, { windowStart, count: 1 });
                  return { allowed: true };
                }
                if (c.count < limit) { c.count++; return { allowed: true }; }
                return { allowed: false, retryAfterS: Math.ceil((windowStart + windowMs - now) / 1000) };
              };
            }

            function tokenBucket(capacity, refillPerSec) {
              const buckets = new Map();
              return (key, now) => {
                const b = buckets.get(key) || { tokens: capacity, last: now };
                b.tokens = Math.min(capacity, b.tokens + ((now - b.last) / 1000) * refillPerSec);
                b.last = now;
                buckets.set(key, b);
                if (b.tokens >= 1) { b.tokens -= 1; return { allowed: true }; }
                return { allowed: false, retryAfterS: Math.ceil((1 - b.tokens) / refillPerSec) };
              };
            }

            const fw = fixedWindow(2, 1000);
            console.log([0, 100, 200, 1000].map((t) => fw('ip1', t).allowed).join(' '));
            console.log(JSON.stringify(fw('ip1', 1500)), JSON.stringify(fw('ip1', 1600)));

            const tb = tokenBucket(3, 1);
            console.log([0, 0, 0, 0].map((t) => tb('ip2', t).allowed).join(' '));
            console.log(JSON.stringify(tb('ip2', 500)));
            console.log(tb('ip2', 2000).allowed);
          `),
          expectedOutput: 'true true false true\n{"allowed":true} {"allowed":false,"retryAfterS":1}\ntrue true true false\n{"allowed":false,"retryAfterS":1}\ntrue',
          explanation: [
            'Fixed window: the 3rd request at t=200 is rejected; at t=1000 a new window starts.',
            'At t=1500 the window has its 2nd request (allowed), the 3rd at 1600 is rejected; it resets in 0.4 s → `Retry-After: 1` (rounded up).',
            'Token bucket: a burst of 3 is allowed, the 4th fails.',
            'After 0.5 s only half a token has refilled → still rejected.',
            'By t=2000 enough tokens have refilled to allow a request.',
          ],
        }),
        code({
          title: 'Using it in node:http with 429 + Retry-After',
          code: dedent(`
            const http = require('node:http');
            const limiter = tokenBucket(10, 5); // burst 10, 5 req/s sustained

            http.createServer((req, res) => {
              const key = req.headers['x-api-key'] ?? req.socket.remoteAddress;
              const result = limiter(key, Date.now());
              if (!result.allowed) {
                res.writeHead(429, {
                  'Content-Type': 'application/json',
                  'Retry-After': String(result.retryAfterS),
                });
                return res.end(JSON.stringify({ error: 'Too many requests' }));
              }
              router(req, res);
            }).listen(3000);
          `),
          explanation: [
            'The limiter runs before any expensive work.',
            'Behind a proxy `remoteAddress` is the proxy — use a trusted `X-Forwarded-For` value instead.',
            'Remember to evict idle keys from the Map (or use an LRU), otherwise memory grows.',
          ],
        }),
        code({
          title: 'The 429 exchange',
          language: 'http',
          code: dedent(`
            GET /todos HTTP/1.1
            X-Api-Key: demo

            HTTP/1.1 429 Too Many Requests
            Retry-After: 1
            Content-Type: application/json

            {"error":"Too many requests"}
          `),
        }),
      ),
      section('real-world', 'Real-world: distributed limits',
        bullets(
          'In-memory limits are per process: 4 instances × 100/min = 400/min total. Use a shared store (Redis `INCR` + `EXPIRE`, or a Lua script for token buckets) for global limits.',
          'Many APIs also send informational headers like `RateLimit-Limit`, `RateLimit-Remaining`, `RateLimit-Reset` (IETF draft) or `X-RateLimit-*`.',
          'Layer limits: coarse IP limits at the edge (Nginx/CDN/WAF), fine per-user limits in the app.',
          'In Express (Module 8) packages like express-rate-limit (third-party) wrap this logic.',
        ),
      ),
      section('mistakes', 'Common mistakes',
        bullets(
          'Limiting by IP behind a proxy without configuring trusted proxies → every user shares one IP.',
          'Trusting `X-Forwarded-For` from untrusted clients → trivially spoofed.',
          'Per-instance memory limits in a horizontally scaled deployment.',
          'No `Retry-After` → clients retry immediately in a tight loop.',
          'Unbounded Maps of keys → memory leak.',
        ),
      ),
      section('interview', 'Interview angle',
        interviewTip('Expect "design a rate limiter": compare fixed window vs sliding window vs token bucket, then move state to Redis with atomic operations for multiple instances.'),
      ),
      section('practice', 'Practice',
        text('Implement a sliding window log limiter (array of timestamps per key, drop entries older than the window) and compare its behaviour at window boundaries with the fixed window.'),
      ),
      section('summary', 'Summary',
        bullets('Fixed window: simple, bursty at edges.', 'Sliding window: smoother/exact.', 'Token bucket: bursts + average rate.', '429 + Retry-After; shared store for multiple instances.'),
      ),
    ],
    revisionNotes: [
      'Fixed window allows up to 2× limit across a boundary.',
      'Sliding log = exact, memory O(limit); sliding counter = approximate O(1).',
      'Token bucket: capacity (burst) + refill rate; lazy refill on each request.',
      '429 Too Many Requests + Retry-After (seconds or HTTP date).',
      'Distributed: Redis INCR/EXPIRE or Lua for atomicity.',
      'Key by API key/user; IP only with trusted proxy config.',
    ],
    quiz: [
      {
        kind: 'mcq', difficulty: 'intermediate',
        prompt: 'Which algorithm allows a short burst above the average rate while enforcing a long-term rate?',
        options: ['Fixed window', 'Token bucket', 'Sliding window log', 'Round robin'],
        answer: 1,
        explanation: 'The bucket capacity permits bursts; the refill rate bounds the average.',
      },
      {
        kind: 'scenario', difficulty: 'advanced',
        prompt: 'An API runs 6 instances behind a load balancer, each with an in-memory limit of 100 req/min per key. Customers on a 100 req/min plan get ~600. Best fix?',
        options: ['Divide the limit by 6 in each instance', 'Store counters in a shared store like Redis with atomic increments', 'Use sticky sessions only', 'Disable rate limiting'],
        answer: 1,
        explanation: 'A shared, atomic store enforces one global limit. Dividing by 6 breaks when traffic is unevenly balanced or instances scale.',
      },
      {
        kind: 'predict-output', difficulty: 'intermediate',
        prompt: 'Fixed window limiter: 3 requests per 60 s window starting at :00. Requests arrive at :58, :59, :59, :00, :01, :01 (next minute). How many are allowed?',
        options: ['3', '4', '6', '5'],
        answer: 2,
        explanation: 'Each window sees exactly 3, so all 6 pass within 4 seconds — the boundary-burst weakness of fixed windows.',
      },
    ],
    interview: [
      {
        category: 'express-backend', kind: 'concept', difficulty: 'intermediate', topic: 'Rate limiting',
        question: 'Compare fixed window, sliding window and token bucket rate limiting.',
        shortAnswer: 'Fixed window counts requests per fixed interval (simple but bursty at boundaries), sliding window counts over the last N seconds (smoother, exact with a log or approximate with weighted counters), and token bucket refills tokens at a steady rate and allows bursts up to its capacity.',
        detailedAnswer: [
          'Fixed: `INCR key:minute` + expiry; worst case 2× limit across edges.',
          'Sliding log: timestamps per key, exact but O(limit) memory.',
          'Sliding counter: current + previous window × overlap fraction.',
          'Token bucket: lazy refill `tokens = min(cap, tokens + elapsed × rate)`.',
          'Respond 429 with Retry-After.',
        ],
        followUp: 'How would you implement token bucket atomically in Redis?',
        trap: 'Saying rate limiting should just return 503.',
      },
      {
        category: 'express-backend', kind: 'scenario', difficulty: 'advanced', topic: 'Rate limiting',
        question: 'Design rate limiting for a public API running on many Node instances, with per-plan limits and protection for the login endpoint.',
        shortAnswer: 'Use a shared store such as Redis with atomic scripts implementing a sliding window or token bucket keyed by API key/user and plan, add stricter limits keyed by IP and username on /login, put coarse IP limits at the edge, and return 429 with Retry-After and rate-limit headers.',
        detailedAnswer: [
          'Atomicity: Lua script or `MULTI` so check-and-increment cannot race.',
          'Plan limits loaded from config/DB and cached in-process.',
          'Login: per-IP and per-account limits plus exponential backoff/lockout to stop credential stuffing.',
          'Fail-open vs fail-closed decision if Redis is down (usually fail-open with local fallback).',
          'Correct client IP: trusted proxy hops only.',
          'Observability: metrics for 429s per key to detect abuse or limits that are too tight.',
        ],
        followUp: 'Would you fail open or fail closed when Redis is unreachable, and why?',
        trap: 'Keeping per-instance memory counters and assuming the load balancer spreads traffic evenly.',
      },
    ],
  },

  cors: {
    summary: 'CORS is a browser security mechanism: a page from one origin can only read cross-origin responses if the server opts in with Access-Control-* headers; non-simple requests trigger an OPTIONS preflight first.',
    topics: ['CORS', 'same-origin policy', 'origin', 'preflight', 'OPTIONS', 'Access-Control-Allow-Origin', 'Access-Control-Allow-Credentials', 'Access-Control-Allow-Methods', 'Access-Control-Allow-Headers', 'Access-Control-Max-Age', 'Vary: Origin'],
    sections: [
      section('introduction', undefined,
        text('Your React app on `http://localhost:5173` calls your API on `http://localhost:3000` and gets "blocked by CORS policy". The request reached the server — the **browser** refused to let your JavaScript read the response.'),
      ),
      section('definition', 'Key terms',
        bullets(
          '**Origin** = scheme + host + port. `http://localhost:5173` and `http://localhost:3000` are different origins.',
          '**Same-origin policy**: browser scripts cannot read responses from other origins by default.',
          '**CORS** (Cross-Origin Resource Sharing): headers by which a server allows specific origins.',
          'CORS is **enforced by browsers**, not servers. curl, Postman and server-to-server calls ignore it — it is not an authentication mechanism.',
        ),
      ),
      section('why', 'Simple vs preflighted requests',
        table('Simple vs preflight', ['', 'Simple request', 'Preflighted request'], [
          ['Methods', 'GET, HEAD, POST', 'Any other (PUT, PATCH, DELETE…)'],
          ['Headers', 'Only CORS-safelisted (Accept, Accept-Language, Content-Language, Content-Type with limits)', 'Any custom header, e.g. `Authorization`, `X-Api-Key`'],
          ['Content-Type', '`text/plain`, `application/x-www-form-urlencoded`, `multipart/form-data`', '`application/json` and others'],
          ['Flow', 'Sent directly; browser checks response headers', 'Browser first sends `OPTIONS` with `Access-Control-Request-*`'],
        ]),
      ),
      section('internals', 'The preflight dance',
        flow(['Browser: OPTIONS /todos + Origin + Access-Control-Request-Method: PATCH', 'Server: 204 + Allow-Origin / Allow-Methods / Allow-Headers / Max-Age', 'Browser: sends real PATCH', 'Server: response + Access-Control-Allow-Origin', 'Browser: lets JS read it'], { title: 'Preflight', direction: 'vertical' }),
        table('Response headers', ['Header', 'Meaning'], [
          ['`Access-Control-Allow-Origin`', 'Allowed origin, or `*` (not with credentials)'],
          ['`Access-Control-Allow-Methods`', 'Methods allowed (preflight)'],
          ['`Access-Control-Allow-Headers`', 'Request headers allowed (preflight)'],
          ['`Access-Control-Allow-Credentials: true`', 'Allow cookies/Authorization-bearing credentialed requests'],
          ['`Access-Control-Max-Age`', 'Seconds the preflight may be cached'],
          ['`Access-Control-Expose-Headers`', 'Response headers JS may read beyond the safelisted ones'],
          ['`Vary: Origin`', 'Required when the Allow-Origin value depends on the request origin'],
        ]),
        warn('**Credentials rule**: with `Access-Control-Allow-Credentials: true`, `Access-Control-Allow-Origin` must be the exact origin — `*` is rejected by browsers (and `*` in Allow-Headers/Methods is treated literally).'),
      ),
      section('example', 'CORS in node:http',
        code({
          title: 'CORS header logic (runnable)',
          runnable: true,
          code: dedent(`
            const ALLOWED = new Set(['http://localhost:5173', 'https://app.example.com']);

            function corsHeaders(method, headers) {
              const origin = headers.origin;
              if (!origin || !ALLOWED.has(origin)) return {};
              const h = {
                'Access-Control-Allow-Origin': origin,
                'Access-Control-Allow-Credentials': 'true',
                Vary: 'Origin',
              };
              if (method === 'OPTIONS' && headers['access-control-request-method']) {
                h['Access-Control-Allow-Methods'] = 'GET, POST, PATCH, DELETE';
                h['Access-Control-Allow-Headers'] = 'Content-Type, Authorization';
                h['Access-Control-Max-Age'] = '600';
              }
              return h;
            }

            console.log(JSON.stringify(corsHeaders('GET', { origin: 'https://evil.example' })));
            console.log(corsHeaders('GET', { origin: 'http://localhost:5173' })['Access-Control-Allow-Origin']);
            const pre = corsHeaders('OPTIONS', { origin: 'https://app.example.com', 'access-control-request-method': 'PATCH' });
            console.log(pre['Access-Control-Allow-Methods'], '|', pre['Access-Control-Max-Age']);
          `),
          expectedOutput: '{}\nhttp://localhost:5173\nGET, POST, PATCH, DELETE | 600',
          explanation: [
            'Unknown origins get no CORS headers → the browser blocks the read.',
            'The exact origin is echoed (required with credentials) and `Vary: Origin` keeps caches correct.',
            'Preflight-only headers are added for OPTIONS with `Access-Control-Request-Method`.',
          ],
        }),
        code({
          title: 'Wiring it into the server',
          code: dedent(`
            http.createServer((req, res) => {
              const headers = corsHeaders(req.method, req.headers);
              for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
              if (req.method === 'OPTIONS') {
                res.writeHead(204);
                return res.end(); // preflight answered, no routing
              }
              router(req, res);
            }).listen(3000);
          `),
          explanation: ['Answer preflights before auth checks — browsers never send credentials on OPTIONS preflights.'],
        }),
        code({
          title: 'A preflight on the wire',
          language: 'http',
          code: dedent(`
            OPTIONS /todos/1 HTTP/1.1
            Origin: http://localhost:5173
            Access-Control-Request-Method: PATCH
            Access-Control-Request-Headers: content-type, authorization

            HTTP/1.1 204 No Content
            Access-Control-Allow-Origin: http://localhost:5173
            Access-Control-Allow-Credentials: true
            Access-Control-Allow-Methods: GET, POST, PATCH, DELETE
            Access-Control-Allow-Headers: Content-Type, Authorization
            Access-Control-Max-Age: 600
            Vary: Origin
          `),
        }),
      ),
      section('real-world', 'Real-world',
        bullets(
          'Public read-only APIs: `Access-Control-Allow-Origin: *` without credentials is fine.',
          'Apps with cookies: allowlist exact origins + `Allow-Credentials: true`; cookies also need `SameSite=None; Secure` cross-site.',
          'Avoid CORS entirely in production by serving the SPA and API from the same origin via a reverse proxy; in dev, use the Vite proxy.',
          'In Express, the `cors` package (third-party) implements this.',
        ),
      ),
      section('mistakes', 'Common mistakes',
        bullets(
          'Reflecting any `Origin` with credentials enabled → any site can read users\' data.',
          'Thinking CORS protects the server from non-browser clients — it does not.',
          'Requiring auth on OPTIONS preflights → preflight fails with 401.',
          'Forgetting `Vary: Origin` when echoing origins.',
          '`*` together with `Allow-Credentials: true` (browsers reject it).',
          'CORS does not stop CSRF on simple requests — the request is still sent.',
        ),
      ),
      section('interview', 'Interview angle',
        interviewTip('Say "CORS is enforced by the browser; the server only declares policy". Then explain preflight triggers and the credentials + `*` rule.'),
      ),
      section('practice', 'Practice',
        text('Serve a static HTML page on port 5500 that calls `fetch(\'http://localhost:3000/todos\', { method: \'PATCH\' })`. Watch the preflight in DevTools, then make it succeed.'),
      ),
      section('summary', 'Summary',
        bullets('Origin = scheme + host + port.', 'Simple requests vs OPTIONS preflight.', 'Credentials → exact origin, never `*`.', 'Browser-enforced; not a security boundary for servers.'),
      ),
    ],
    revisionNotes: [
      'CORS relaxes the same-origin policy; enforced by browsers only.',
      'Simple: GET/HEAD/POST + safelisted headers + text/plain, urlencoded, multipart.',
      'JSON content type or Authorization header → preflight OPTIONS.',
      'Preflight response: Allow-Origin, Allow-Methods, Allow-Headers, Max-Age.',
      'Credentials: exact origin + Allow-Credentials: true; no "*".',
      'Vary: Origin when echoing origin.',
    ],
    quiz: [
      {
        kind: 'mcq', difficulty: 'beginner',
        prompt: 'Who enforces CORS?',
        options: ['The Node.js server', 'The browser', 'The DNS resolver', 'The database'],
        answer: 1,
        explanation: 'The server only sends headers; the browser decides whether page JavaScript may read the response. curl ignores CORS.',
      },
      {
        kind: 'scenario', difficulty: 'intermediate',
        prompt: 'fetch("/todos", { method: "POST", headers: { "Content-Type": "application/json" } }) from another origin fails, but a form-urlencoded POST works. Why?',
        options: ['JSON is blocked by browsers', 'application/json is not a simple content type, so the browser sends a preflight OPTIONS that the server does not answer with CORS headers', 'POST is not allowed cross-origin', 'The server must use HTTP/2'],
        answer: 1,
        explanation: 'JSON triggers a preflight. Handle OPTIONS with Allow-Methods/Allow-Headers (including Content-Type).',
      },
      {
        kind: 'find-bug', difficulty: 'advanced',
        prompt: 'What is wrong with this CORS configuration for a cookie-authenticated API?',
        code: "res.setHeader('Access-Control-Allow-Origin', req.headers.origin);\nres.setHeader('Access-Control-Allow-Credentials', 'true');",
        options: ['Nothing — echoing is required', 'It reflects every origin with credentials, so any website can make authenticated requests and read the responses', 'Allow-Credentials must be a boolean', 'Origin header does not exist'],
        answer: 1,
        explanation: 'Echoing is only safe against an allowlist. Unconditional reflection with credentials is equivalent to disabling the same-origin policy for your users\' data. Also add Vary: Origin.',
      },
    ],
    interview: [
      {
        category: 'express-backend', kind: 'concept', difficulty: 'intermediate', topic: 'CORS',
        question: 'What is CORS and what triggers a preflight request?',
        shortAnswer: 'CORS is a browser mechanism that lets servers allow specific cross-origin reads via Access-Control-* headers; a preflight OPTIONS request is sent when the request is not simple — methods other than GET/HEAD/POST, non-safelisted headers like Authorization, or content types like application/json.',
        detailedAnswer: [
          'Origin = scheme + host + port.',
          'Preflight carries `Access-Control-Request-Method/Headers`.',
          'Server answers with Allow-Methods/Allow-Headers/Max-Age.',
          'Then the actual request is sent and must include Allow-Origin.',
          'Non-browser clients ignore all of this.',
        ],
        followUp: 'How do you reduce the number of preflights?',
        trap: 'Saying CORS protects your API from unauthorised clients.',
      },
      {
        category: 'express-backend', kind: 'concept', difficulty: 'advanced', topic: 'CORS',
        question: 'Why can you not use Access-Control-Allow-Origin: * with credentials, and how do you configure CORS for a cookie-based SPA safely?',
        shortAnswer: 'Browsers reject * for credentialed requests because it would let any site read authenticated responses; instead echo the request Origin only if it is in an allowlist, send Access-Control-Allow-Credentials: true and Vary: Origin, and use SameSite cookies.',
        detailedAnswer: [
          'Credentialed = cookies, HTTP auth or TLS client certs (`credentials: \'include\'` in fetch).',
          'Allow-Origin must be the exact origin; Allow-Headers/Methods `*` also lose their wildcard meaning.',
          'Never reflect arbitrary origins; match exact strings, not `endsWith` tricks that allow `evil-example.com`.',
          'Cookies cross-site require `SameSite=None; Secure`; prefer same-origin deployments to avoid this.',
          'CORS does not replace CSRF protection.',
        ],
        followUp: 'What attack does a regex like /example\\.com$/ allow?',
        trap: 'Reflecting req.headers.origin unconditionally to "make CORS work".',
      },
    ],
  },

  'api-documentation': {
    summary: 'Document APIs with an OpenAPI specification (YAML/JSON describing paths, parameters, schemas, responses and auth), rendered by tools like Swagger UI or Redoc, and kept in sync with code.',
    topics: ['OpenAPI', 'Swagger', 'Swagger UI', 'Redoc', 'schemas', 'components', 'securitySchemes', 'contract-first', 'code-first'],
    sections: [
      section('introduction', undefined,
        text('An undocumented API is a support ticket factory. OpenAPI is the standard, machine-readable way to describe a REST API — from which you can generate docs, clients, mocks and tests.'),
      ),
      section('definition', 'OpenAPI in one picture',
        bullets(
          '**OpenAPI Specification (OAS)** — formerly Swagger; current versions 3.0 and 3.1 (3.1 aligns schemas with JSON Schema).',
          '`paths`: endpoints and methods.',
          '`components.schemas`: reusable data models.',
          '`parameters`, `requestBody`, `responses` per operation.',
          '`components.securitySchemes`: bearer tokens, API keys, OAuth2.',
          '"Swagger" now usually refers to the tooling (Swagger UI, Swagger Editor).',
        ),
      ),
      section('why', 'Why a spec, not just a wiki',
        bullets(
          'Single source of truth for frontend, mobile and partner teams.',
          'Generate typed clients and server stubs.',
          'Validate requests/responses against the schema in tests.',
          'Interactive "Try it out" docs.',
        ),
        table('Contract-first vs code-first', ['', 'Contract-first', 'Code-first'], [
          ['Start with', 'Write the OpenAPI file', 'Write code; generate spec from annotations/schemas'],
          ['Good for', 'Public APIs, parallel frontend/backend work', 'Fast-moving internal APIs'],
          ['Risk', 'Spec and code drift unless validated', 'Docs shaped by implementation details'],
        ]),
      ),
      section('internals', 'Workflow',
        flow(['Write/generate openapi.yaml', 'Lint (e.g. Spectral)', 'Serve Swagger UI / Redoc', 'Validate requests in tests', 'Generate clients'], { title: 'Docs pipeline', direction: 'horizontal' }),
      ),
      section('example', 'Documenting the Todo API',
        code({
          title: 'openapi.yaml (excerpt)',
          language: 'yaml',
          code: dedent(`
            openapi: 3.1.0
            info:
              title: Todo API
              version: 1.0.0
            servers:
              - url: http://localhost:3000
            paths:
              /todos:
                get:
                  summary: List todos
                  parameters:
                    - in: query
                      name: done
                      schema: { type: boolean }
                    - in: query
                      name: limit
                      schema: { type: integer, minimum: 1, maximum: 100, default: 20 }
                  responses:
                    '200':
                      description: A page of todos
                      content:
                        application/json:
                          schema:
                            type: object
                            properties:
                              data: { type: array, items: { $ref: '#/components/schemas/Todo' } }
                              nextCursor: { type: [string, 'null'] }
                post:
                  summary: Create a todo
                  security: [{ bearerAuth: [] }]
                  requestBody:
                    required: true
                    content:
                      application/json:
                        schema: { $ref: '#/components/schemas/NewTodo' }
                  responses:
                    '201': { description: Created }
                    '422': { description: Validation failed }
            components:
              schemas:
                Todo:
                  type: object
                  required: [id, title, done]
                  properties:
                    id: { type: integer, readOnly: true }
                    title: { type: string, minLength: 1 }
                    done: { type: boolean }
                NewTodo:
                  type: object
                  required: [title]
                  properties:
                    title: { type: string, minLength: 1 }
              securitySchemes:
                bearerAuth:
                  type: http
                  scheme: bearer
                  bearerFormat: JWT
          `),
          explanation: [
            '`$ref` reuses schemas.',
            '`type: [string, \'null\']` is OAS 3.1 / JSON Schema syntax (3.0 used `nullable: true`).',
            'Security is declared per operation or globally.',
          ],
        }),
        code({
          title: 'Serving the spec from node:http',
          code: dedent(`
            const fs = require('node:fs');
            const spec = fs.readFileSync('./openapi.yaml', 'utf8'); // small file, read once at startup

            route('GET', '/openapi.yaml', (req, res) => {
              res.writeHead(200, { 'Content-Type': 'application/yaml' });
              res.end(spec);
            });
            // Point Swagger UI or Redoc (static HTML from a CDN) at /openapi.yaml
          `),
        }),
      ),
      section('real-world', 'Real-world',
        bullets(
          'Run a request/response validator in integration tests so the spec cannot drift.',
          'Generate a TypeScript client for the frontend from the spec.',
          'Document errors (4xx/5xx shapes), auth, rate limits and pagination — not just happy paths.',
          'Include realistic `example` values.',
        ),
      ),
      section('mistakes', 'Common mistakes',
        bullets(
          'Docs written once and never updated.',
          'Only 200 responses documented.',
          'No examples; vague field descriptions.',
          'Exposing internal/admin endpoints in public docs.',
        ),
      ),
      section('interview', 'Interview angle',
        interviewTip('Explain what OpenAPI is (machine-readable contract), what it enables (docs, clients, validation), and how you keep it in sync (generation or contract tests).'),
      ),
      section('practice', 'Practice',
        text('Write the OpenAPI entries for `PATCH /todos/{id}` and `DELETE /todos/{id}`, including path parameters and the 404 response.'),
      ),
      section('summary', 'Summary',
        bullets('OpenAPI = standard machine-readable API contract.', 'paths + components (schemas, securitySchemes).', 'Render with Swagger UI/Redoc.', 'Keep it in sync with tests or generation.'),
      ),
    ],
    revisionNotes: [
      'OpenAPI (ex-Swagger) 3.0 / 3.1; 3.1 = full JSON Schema.',
      'paths → operations → parameters, requestBody, responses.',
      'components.schemas + $ref for reuse.',
      'securitySchemes: http bearer, apiKey, oauth2.',
      'Contract-first vs code-first.',
      'Validate against the spec in tests to prevent drift.',
    ],
    quiz: [
      {
        kind: 'mcq', difficulty: 'beginner',
        prompt: 'In an OpenAPI document, where do reusable data models live?',
        options: ['paths', 'servers', 'components.schemas', 'info'],
        answer: 2,
        explanation: 'components.schemas holds reusable schemas referenced with $ref.',
      },
      {
        kind: 'scenario', difficulty: 'intermediate',
        prompt: 'Your OpenAPI docs keep falling out of date with the implementation. Best long-term fix?',
        options: ['Review docs quarterly', 'Validate requests/responses against the spec in automated tests (or generate the spec from code)', 'Delete the docs', 'Move docs to a wiki'],
        answer: 1,
        explanation: 'Automation makes drift fail the build; manual reviews do not scale.',
      },
    ],
    interview: [
      {
        category: 'express-backend', kind: 'concept', difficulty: 'beginner', topic: 'API documentation',
        question: 'What is OpenAPI and how is it different from Swagger?',
        shortAnswer: 'OpenAPI is the vendor-neutral specification format for describing REST APIs (paths, parameters, schemas, responses, security); Swagger was its original name and now refers to the tooling around it, such as Swagger UI and Swagger Editor.',
        detailedAnswer: [
          'Swagger 2.0 was donated and became OpenAPI 3.0 (2017); 3.1 aligns with JSON Schema.',
          'One spec drives docs, client generation, mocks and validation.',
          'Written in YAML or JSON.',
        ],
        followUp: 'Contract-first or code-first — which would you choose for a public API?',
        trap: 'Treating Swagger UI (a renderer) as the specification itself.',
      },
    ],
  },

  'postman-testing': {
    summary: 'Postman lets you send requests, organise them in collections, switch environments with variables, and write pm.test assertions that can run in CI via Newman.',
    topics: ['Postman', 'collections', 'environments', 'variables', 'pm.test', 'pm.expect', 'pre-request scripts', 'Newman', 'collection runner'],
    sections: [
      section('introduction', undefined,
        text('Before (and alongside) automated tests, you need to poke your API by hand. Postman is a popular GUI client; collections make those manual checks repeatable.'),
      ),
      section('definition', 'Key concepts',
        table('Postman concepts', ['Concept', 'What it is'], [
          ['Request', 'Method, URL, headers, body'],
          ['Collection', 'Folder of requests for an API, shareable/exportable as JSON'],
          ['Environment', 'Set of variables (e.g. `baseUrl`, `token`) per stage: local, staging'],
          ['Variables', '`{{baseUrl}}/todos` — scopes: global, collection, environment, local'],
          ['Pre-request script', 'JS run before sending (e.g. compute a signature)'],
          ['Tests (post-response script)', 'JS assertions with `pm.test` and `pm.expect`'],
          ['Newman', 'CLI runner for collections (CI)'],
        ]),
      ),
      section('why', 'Why it helps',
        bullets(
          'Quick exploration while building the node:http API.',
          'Shared collections onboard teammates fast.',
          'Chained requests: save the created id/token and reuse it.',
          'Alternatives: curl, HTTPie, VS Code REST Client, Bruno, Insomnia — automated tests (Module on testing) are still required.',
        ),
      ),
      section('internals', 'A collection run',
        flow(['Select environment (local)', 'POST {{baseUrl}}/todos → test + save id', 'GET {{baseUrl}}/todos/{{todoId}} → test', 'DELETE → expect 204'], { title: 'Chained collection', direction: 'vertical' }),
      ),
      section('example', 'Tests for the Todo API',
        code({
          title: 'Post-response script for POST /todos',
          code: dedent(`
            pm.test('status is 201', () => {
              pm.response.to.have.status(201);
            });

            pm.test('returns the created todo', () => {
              const body = pm.response.json();
              pm.expect(body).to.have.property('id');
              pm.expect(body.title).to.eql('Buy milk');
              pm.expect(body.done).to.be.false;
            });

            pm.test('Location header points to the new resource', () => {
              const id = pm.response.json().id;
              pm.expect(pm.response.headers.get('Location')).to.eql('/todos/' + id);
            });

            pm.collectionVariables.set('todoId', pm.response.json().id);
          `),
          explanation: [
            'Runs inside Postman\'s sandbox (not Node) — `pm` is Postman\'s API, assertions use Chai syntax.',
            'Saving `todoId` lets the next request use `{{todoId}}`.',
          ],
        }),
        code({
          title: 'Running a collection in CI with Newman',
          language: 'bash',
          code: dedent(`
            npx newman run todo-api.postman_collection.json -e local.postman_environment.json
          `),
          expectedOutput: '→ Create todo\n  POST http://localhost:3000/todos [201 Created, 312B, 15ms]\n  ✓  status is 201\n  ✓  returns the created todo\n  ✓  Location header points to the new resource',
          explanation: ['Newman exits non-zero when a test fails, so CI fails.', 'Output abbreviated.'],
        }),
      ),
      section('real-world', 'Real-world',
        bullets(
          'Keep environment files without secrets in git; inject tokens from CI secrets.',
          'Import your OpenAPI spec into Postman to generate a collection.',
          'Use Postman for exploration/smoke tests; use `node --test` + supertest-style tests for regression suites.',
        ),
      ),
      section('mistakes', 'Common mistakes',
        bullets(
          'Committing environments containing real tokens.',
          'Collections that depend on run order without documenting it.',
          'Treating a manual Postman check as test coverage.',
        ),
      ),
      section('interview', 'Interview angle',
        interviewTip('Briefly: collections + environments + `pm.test` + Newman in CI. Then say automated code-level tests remain the main safety net.'),
      ),
      section('practice', 'Practice',
        text('Create a collection for the Todo API with create → read → update → delete, chaining `todoId`, and run it with Newman.'),
      ),
      section('summary', 'Summary',
        bullets('Collections group requests.', 'Environments hold `{{variables}}`.', '`pm.test` + `pm.expect` assertions.', 'Newman runs collections in CI.'),
      ),
    ],
    revisionNotes: [
      'Collection = grouped requests; environment = variables per stage.',
      '{{baseUrl}} variable syntax.',
      'pm.test(name, fn); pm.response.to.have.status(201); pm.expect (Chai).',
      'pm.collectionVariables.set / pm.environment.set to chain requests.',
      'Newman = CLI runner for CI.',
    ],
    quiz: [
      {
        kind: 'complete-code', difficulty: 'beginner',
        prompt: 'Assert the response status in a Postman test.',
        code: "pm.test('created', () => {\n  pm.response.to.have./* ??? */(201);\n});",
        options: ['code', 'status', 'statusCode', 'header'],
        answer: 1,
        explanation: 'pm.response.to.have.status(201) is the Postman assertion for the status code.',
      },
      {
        kind: 'mcq', difficulty: 'beginner',
        prompt: 'What is a Postman environment used for?',
        options: ['Running Node.js code', 'Holding variables like baseUrl and tokens for a given stage (local, staging)', 'Hosting the API', 'Generating OpenAPI specs'],
        answer: 1,
        explanation: 'Switching environments swaps variable values without editing requests.',
      },
    ],
    interview: [
      {
        category: 'express-backend', kind: 'concept', difficulty: 'beginner', topic: 'API testing',
        question: 'How do you use Postman collections and environments to test an API, and how do you run them in CI?',
        shortAnswer: 'Group requests in a collection, put stage-specific values like baseUrl and tokens in environments, write pm.test assertions in post-response scripts, chain values with collection variables, and run the collection in CI with Newman.',
        detailedAnswer: [
          'Variables use `{{name}}` syntax.',
          'Assertions use Chai via `pm.expect`.',
          'Newman returns a non-zero exit code on failure.',
          'Keep secrets out of exported environments.',
          'Complement, do not replace, code-level automated tests.',
        ],
        followUp: 'What are the limits of Postman tests compared with tests written in code?',
        trap: 'Claiming Postman tests run inside Node.js with access to your modules.',
      },
    ],
  },
};

export default content;
