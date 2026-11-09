import type { ModuleContent } from '../../../types';
import { bullets, code, dedent, diagram, flow, interviewTip, section, steps, table, text } from '../helpers';

const content: Partial<ModuleContent> = {
  'http-fundamentals': {
    summary: 'HTTP is a stateless, text-framed request/response protocol on top of TCP (or QUIC for HTTP/3): a client sends a method, path, headers and optional body; the server answers with a status, headers and optional body.',
    topics: ['HTTP', 'request', 'response', 'stateless', 'TCP', 'HTTP/1.1', 'HTTP/2', 'HTTP/3', 'node:http', 'keep-alive'],
    sections: [
      section('introduction', undefined,
        text('Every REST API, website and webhook speaks HTTP. Before using Express (Module 8) you will build APIs with the raw `node:http` module, so you see exactly what frameworks do for you.'),
      ),
      section('definition', 'Anatomy of an HTTP exchange',
        code({
          title: 'A request and its response',
          language: 'http',
          code: dedent(`
            POST /api/todos HTTP/1.1
            Host: localhost:3000
            Content-Type: application/json
            Content-Length: 24

            {"title":"Learn HTTP"}

            HTTP/1.1 201 Created
            Content-Type: application/json
            Location: /api/todos/1

            {"id":1,"title":"Learn HTTP","done":false}
          `),
          explanation: [
            'Request line: method, target (path + query), version.',
            'Headers: `Name: value` lines, then a blank line.',
            'Optional body (length given by `Content-Length` or chunked encoding).',
            'Status line: version, status code, reason phrase.',
          ],
        }),
      ),
      section('why', 'Key properties',
        bullets(
          '**Stateless**: each request carries everything needed; the server does not remember previous requests. State lives in tokens, cookies or the DB.',
          '**Client–server**: the client always initiates.',
          '**Extensible** through headers.',
          '**Cacheable**: responses can declare how long they may be reused.',
        ),
        table('HTTP versions', ['Version', 'Transport', 'Key feature'], [
          ['HTTP/1.1', 'TCP', 'Text format, keep-alive connections, one request at a time per connection'],
          ['HTTP/2', 'TCP (+TLS in browsers)', 'Binary frames, multiplexing many requests over one connection, header compression'],
          ['HTTP/3', 'QUIC over UDP', 'No TCP head-of-line blocking, faster handshakes'],
        ]),
      ),
      section('internals', 'What happens on the wire',
        diagram('request-response', 'DNS lookup → TCP (+TLS) handshake → request → server handler → response.'),
        bullets(
          '`node:http` parses bytes from the TCP socket with llhttp (a fast C parser).',
          'It gives you `req` (an `IncomingMessage`, a Readable) and `res` (a `ServerResponse`, a Writable).',
          'With keep-alive (default in HTTP/1.1) the same TCP connection serves the next request.',
        ),
      ),
      section('example', 'Your first server',
        code({
          title: 'Hello HTTP with node:http',
          code: dedent(`
            const http = require('node:http');

            const server = http.createServer((req, res) => {
              res.statusCode = 200;
              res.setHeader('Content-Type', 'text/plain; charset=utf-8');
              res.end('Hello ' + req.method + ' ' + req.url + '\\n');
            });

            server.listen(3000, () => console.log('http://localhost:3000'));
          `),
          expectedOutput: 'http://localhost:3000',
          explanation: [
            'The callback runs once per request.',
            '`req.url` is the path **plus** query string, e.g. `/hi?x=1`.',
            '`res.end()` sends the body and finishes the response — forgetting it leaves the client hanging.',
          ],
        }),
        code({
          title: 'Calling it',
          language: 'bash',
          code: dedent(`
            curl -i "http://localhost:3000/hi?x=1"
          `),
          expectedOutput: 'HTTP/1.1 200 OK\nContent-Type: text/plain; charset=utf-8\nDate: Sun, 08 Nov 2026 10:00:00 GMT\nConnection: keep-alive\nKeep-Alive: timeout=5\nContent-Length: 18\n\nHello GET /hi?x=1',
          explanation: ['`-i` shows response headers.', 'Node added `Date`, `Connection` and `Content-Length` automatically (the body was passed in one `end()` call).'],
        }),
      ),
      section('real-world', 'Real-world',
        bullets(
          'Express, Fastify and Koa are all wrappers around `http.createServer`.',
          'Health checks (`GET /health`) are often plain node:http for zero dependencies.',
          'Node 18+ ships `fetch` as an HTTP client.',
        ),
      ),
      section('mistakes', 'Common mistakes',
        bullets(
          'Assuming the server remembers the client between requests (stateless!).',
          'Forgetting `res.end()`.',
          'Treating `req.url` as only the path — it includes the query string.',
        ),
      ),
      section('interview', 'Interview angle',
        interviewTip('Define "stateless" precisely: no client context stored on the server between requests — authentication must be sent each time.'),
      ),
      section('practice', 'Practice',
        text('Create a server that responds with JSON `{ method, url, userAgent }` echoing the request. Test with curl and a browser.'),
      ),
      section('summary', 'Summary',
        bullets('Request: method + target + headers + body.', 'Response: status + headers + body.', 'Stateless, client-initiated.', '`node:http` gives you `req` (Readable) and `res` (Writable).'),
      ),
    ],
    revisionNotes: [
      'HTTP is stateless request/response over TCP (QUIC for HTTP/3).',
      'Headers end with a blank line; body length via Content-Length or chunked.',
      'HTTP/1.1 keep-alive; HTTP/2 multiplexing + binary + HPACK; HTTP/3 QUIC.',
      'req = IncomingMessage (Readable); res = ServerResponse (Writable).',
      'req.url includes the query string.',
    ],
    quiz: [
      {
        kind: 'mcq', difficulty: 'beginner',
        prompt: 'What does "HTTP is stateless" mean?',
        options: ['Responses cannot have bodies', 'The server keeps no memory of previous requests; each request must carry its own context', 'Connections close after each request', 'Cookies are not allowed'],
        answer: 1,
        explanation: 'Statelessness is about application context, not connections — keep-alive reuses TCP connections while HTTP stays stateless.',
      },
      {
        kind: 'predict-output', difficulty: 'beginner',
        prompt: 'A client requests GET /users?page=2. What is req.url in node:http?',
        options: ['/users', '/users?page=2', 'http://localhost/users?page=2', 'page=2'],
        answer: 1,
        explanation: 'req.url is the request target from the request line: path plus query string, without scheme or host.',
      },
      {
        kind: 'mcq', difficulty: 'intermediate',
        prompt: 'What is the main improvement of HTTP/2 over HTTP/1.1?',
        options: ['JSON-only bodies', 'Multiplexing many concurrent requests over one connection', 'It uses UDP', 'It removes headers'],
        answer: 1,
        explanation: 'HTTP/2 multiplexes streams over one TCP connection with binary framing. UDP/QUIC is HTTP/3.',
      },
    ],
    interview: [
      {
        category: 'express-backend', kind: 'concept', difficulty: 'beginner', topic: 'HTTP',
        question: 'What does it mean that HTTP is stateless, and how do web apps keep users logged in anyway?',
        shortAnswer: 'Each request is independent and the server keeps no conversational state; apps send identity on every request via cookies (session IDs) or tokens like JWTs in the Authorization header.',
        detailedAnswer: [
          'Stateless servers scale horizontally — any instance can handle any request.',
          'Session cookie: the server looks up session data in a store (Redis) by ID.',
          'JWT: the token itself carries signed claims.',
          'Keep-alive is about connection reuse, not application state.',
        ],
        followUp: 'What are the trade-offs between server sessions and JWTs?',
        trap: 'Confusing statelessness with closing the TCP connection after each request.',
      },
      {
        category: 'express-backend', kind: 'concept', difficulty: 'intermediate', topic: 'HTTP versions',
        question: 'Compare HTTP/1.1, HTTP/2 and HTTP/3.',
        shortAnswer: 'HTTP/1.1 is text-based with one in-flight request per connection; HTTP/2 adds binary framing, multiplexing and header compression over TCP; HTTP/3 runs over QUIC (UDP) to remove TCP head-of-line blocking.',
        detailedAnswer: [
          'HTTP/1.1 browsers open ~6 connections per host to parallelise.',
          'HTTP/2 multiplexes streams on one connection; HPACK compresses headers.',
          'TCP packet loss stalls all HTTP/2 streams (head-of-line blocking).',
          'HTTP/3 (QUIC) has per-stream loss recovery and 0-RTT/1-RTT handshakes.',
          'Node: `node:http` (1.1), `node:http2`; HTTP/3 is usually terminated at a proxy/CDN.',
        ],
        followUp: 'Why do many Node apps still serve HTTP/1.1 behind a proxy that speaks HTTP/2 to browsers?',
        trap: 'Saying HTTP/2 changes methods, status codes or REST semantics — it does not.',
      },
    ],
  },

  'request-and-response-lifecycle': {
    summary: 'In node:http, each request flows: TCP connection → header parsing → your handler gets req (Readable) and res (Writable) → you read the body, route, set status/headers, write and end the response.',
    topics: ['IncomingMessage', 'ServerResponse', 'writeHead', 'setHeader', 'res.end', 'headersSent', 'request event', 'keep-alive', 'timeouts', 'chunked encoding'],
    sections: [
      section('introduction', undefined,
        text('Frameworks hide the lifecycle behind `req.body` and `res.json()`. Knowing the raw steps helps you debug hanging requests, "headers already sent" errors and slow clients.'),
      ),
      section('definition', 'The two objects',
        table('req vs res', ['', '`req` (IncomingMessage)', '`res` (ServerResponse)'], [
          ['Stream type', 'Readable (the body)', 'Writable (the body)'],
          ['Key fields', '`method`, `url`, `headers` (lowercased), `httpVersion`, `socket`', '`statusCode`, `headersSent`, `writableEnded`'],
          ['Key methods', '`on(\'data\')`, `for await`', '`setHeader`, `writeHead`, `write`, `end`'],
        ]),
      ),
      section('why', 'Why it matters',
        bullets(
          'Headers must be sent before the body — after the first `write`, they are locked (`res.headersSent === true`).',
          'Every request must end with exactly one `res.end()` — or the client waits until a timeout.',
          'The body arrives as a stream; it is not available when the handler starts.',
        ),
      ),
      section('internals', 'Step by step',
        diagram('request-response', 'Client → TCP/TLS → node:http parser → your handler → response bytes back over the same socket.'),
        steps(
          'A TCP connection is accepted (`connection` event on the server).',
          'llhttp parses the request line and headers → `request` event → your handler `(req, res)`.',
          'The body (if any) streams in as `req` `data` chunks.',
          'You set status and headers (`res.statusCode`, `setHeader`, or `writeHead`).',
          'First `write`/`end` flushes the headers; then the body.',
          'Without `Content-Length`, Node uses `Transfer-Encoding: chunked` for HTTP/1.1.',
          '`res` emits `finish`; with keep-alive the socket waits for the next request.',
        ),
        table('Server timeouts (Node 18+ defaults)', ['Setting', 'Default', 'Protects against'], [
          ['`server.requestTimeout`', '300000 ms', 'Slow full requests'],
          ['`server.headersTimeout`', '60000 ms', 'Slowloris-style slow headers'],
          ['`server.keepAliveTimeout`', '5000 ms', 'Idle keep-alive sockets'],
        ]),
      ),
      section('example', 'Our in-memory Todo API, version 1',
        code({
          title: 'A JSON helper and a first route',
          code: dedent(`
            const http = require('node:http');

            const todos = [{ id: 1, title: 'Learn HTTP', done: false }];

            function sendJson(res, status, data) {
              const body = JSON.stringify(data);
              res.writeHead(status, {
                'Content-Type': 'application/json; charset=utf-8',
                'Content-Length': Buffer.byteLength(body),
              });
              res.end(body);
            }

            const server = http.createServer((req, res) => {
              console.log(req.method, req.url, req.headers['user-agent']);
              if (req.method === 'GET' && req.url === '/todos') return sendJson(res, 200, todos);
              sendJson(res, 404, { error: 'Not found' });
            });

            server.listen(3000);
          `),
          expectedOutput: 'GET /todos curl/8.5.0',
          explanation: [
            'Header names in `req.headers` are always lowercase.',
            '`Buffer.byteLength` gives the correct byte length for non-ASCII JSON.',
            'Every branch ends the response exactly once (`return` prevents falling through).',
            'The log line appears when you run `curl localhost:3000/todos`.',
          ],
        }),
        code({
          title: 'The "headers already sent" error',
          code: dedent(`
            const http = require('node:http');
            http.createServer((req, res) => {
              res.write('partial');
              try {
                res.setHeader('X-Late', '1');
              } catch (err) {
                console.log(err.code);
              }
              res.end();
            }).listen(3001);
          `),
          expectedOutput: 'ERR_HTTP_HEADERS_SENT',
          explanation: ['After the first `write`, the headers are on the wire and cannot change.'],
        }),
      ),
      section('real-world', 'Real-world: logging response time',
        code({
          title: "Using res 'finish'",
          code: dedent(`
            http.createServer((req, res) => {
              const start = process.hrtime.bigint();
              res.on('finish', () => {
                const ms = Number(process.hrtime.bigint() - start) / 1e6;
                console.log(req.method + ' ' + req.url + ' ' + res.statusCode + ' ' + ms.toFixed(1) + 'ms');
              });
              handle(req, res);
            });
          `),
          explanation: ['This is what logging middleware like morgan does in Express.', "Use 'close' instead to also catch aborted requests."],
        }),
      ),
      section('mistakes', 'Common mistakes',
        bullets(
          'Code paths that never call `res.end()` (missing `return`, unhandled promise).',
          'Calling `res.end()` twice or setting headers after writing → `ERR_HTTP_HEADERS_SENT` / `ERR_STREAM_WRITE_AFTER_END`.',
          'Reading `req.headers[\'Content-Type\']` (capitalised) → `undefined`.',
          'Async handler throwing → unhandled rejection; wrap with try/catch and send 500.',
        ),
      ),
      section('interview', 'Interview angle',
        interviewTip('Walk through: parse → handler → body stream → headers → body → finish → keep-alive. Mention `headersSent` and the default timeouts.'),
      ),
      section('practice', 'Practice',
        text('Add a `/slow` route that waits 2 s before responding, then set `server.requestTimeout = 1000` and observe what curl receives.'),
      ),
      section('summary', 'Summary',
        bullets('`req` Readable, `res` Writable.', 'Headers before body; locked after first write.', 'Exactly one `res.end()` per request.', 'Set timeouts to resist slow clients.'),
      ),
    ],
    revisionNotes: [
      'req.headers keys are lowercase.',
      'writeHead(status, headers) or statusCode + setHeader.',
      'Headers flush on first write/end → res.headersSent.',
      'No Content-Length → Transfer-Encoding: chunked.',
      'Defaults: requestTimeout 300 s, headersTimeout 60 s, keepAliveTimeout 5 s.',
      "res 'finish' = response handed to OS; 'close' also on abort.",
    ],
    quiz: [
      {
        kind: 'find-bug', difficulty: 'intermediate',
        prompt: 'Requests to /todos with a bad id hang until timeout. Why?',
        code: "if (req.url.startsWith('/todos/')) {\n  const todo = todos.find((t) => t.id === id);\n  if (todo) sendJson(res, 200, todo);\n}\n// end of handler",
        options: ['find is synchronous', 'When todo is undefined no response is sent, so res.end() is never called', 'sendJson must be awaited', 'IDs must be strings'],
        answer: 1,
        explanation: 'Every code path must end the response. Add an else branch sending 404.',
      },
      {
        kind: 'mcq', difficulty: 'beginner',
        prompt: 'How do you read the Content-Type request header in node:http?',
        options: ["req.headers['Content-Type']", "req.headers['content-type']", "req.getHeader('Content-Type') only", 'req.contentType'],
        answer: 1,
        explanation: 'Node lowercases incoming header names. The capitalised key is undefined.',
      },
      {
        kind: 'predict-output', difficulty: 'intermediate',
        prompt: "What happens? res.end('a'); res.setHeader('X', '1');",
        options: ['Header is sent', 'Throws ERR_HTTP_HEADERS_SENT', 'Header ignored silently', 'Response is re-sent'],
        answer: 1,
        explanation: 'Once the response has been ended (or written), headers are already sent; setHeader throws ERR_HTTP_HEADERS_SENT.',
      },
    ],
    interview: [
      {
        category: 'express-backend', kind: 'concept', difficulty: 'intermediate', topic: 'Request lifecycle',
        question: 'Walk through the lifecycle of a request in a node:http server, from TCP connection to response.',
        shortAnswer: 'The server accepts a TCP connection, llhttp parses the request line and headers, the request event calls your handler with req (Readable body) and res (Writable), you read the body, set status and headers, write/end the body, and the socket is kept alive for the next request.',
        detailedAnswer: [
          'Headers are parsed before your handler runs; the body has not necessarily arrived yet.',
          'Headers flush on first write/end (`headersSent`).',
          'Chunked transfer encoding is used when no Content-Length is set.',
          '`finish` when the response is flushed; keep-alive timeout closes idle sockets.',
          'Timeouts (`headersTimeout`, `requestTimeout`) guard against slow clients.',
        ],
        followUp: 'Where would TLS termination happen in production?',
        trap: 'Saying the body is available as a property when the handler starts.',
      },
      {
        category: 'express-backend', kind: 'scenario', difficulty: 'advanced', topic: 'Request lifecycle',
        question: "Clients occasionally get socket hang-ups behind a load balancer with keep-alive. What is a likely cause in a Node server and how do you fix it?",
        shortAnswer: "Node's keepAliveTimeout (5 s) is shorter than the load balancer's idle timeout, so Node closes idle sockets the LB thinks are still open and the LB sends a request into a closing socket; set server.keepAliveTimeout above the LB idle timeout and headersTimeout slightly higher.",
        detailedAnswer: [
          'Race: Node closes the idle connection at the same moment the LB reuses it.',
          'Typical LB idle timeout: 60 s (e.g. many cloud load balancers).',
          'Fix: `server.keepAliveTimeout = 65_000; server.headersTimeout = 66_000;`.',
          'Also ensure handlers always end responses and errors produce 5xx instead of hanging.',
        ],
        followUp: 'Which other server timeouts would you tune and why?',
        trap: 'Disabling keep-alive entirely — it hurts latency and throughput.',
      },
    ],
  },

  'http-methods': {
    summary: 'HTTP methods express intent: GET reads, POST creates/acts, PUT replaces, PATCH partially updates, DELETE removes; know which are safe and which are idempotent.',
    topics: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS', 'safe methods', 'idempotency', '405 Method Not Allowed', 'Allow header'],
    sections: [
      section('introduction', undefined,
        text('The same URL `/todos/1` can be read, replaced, updated or deleted — the **method** tells the server which.'),
      ),
      section('definition', 'Safe and idempotent',
        bullets(
          '**Safe**: does not change server state (read-only). Clients and crawlers may call it freely.',
          '**Idempotent**: doing it N times has the same effect on the server as doing it once. Safe to retry after a network error.',
        ),
        table('Method properties', ['Method', 'Purpose', 'Safe', 'Idempotent', 'Request body'], [
          ['GET', 'Read a resource', 'Yes', 'Yes', 'No (semantics undefined)'],
          ['HEAD', 'GET without body (headers only)', 'Yes', 'Yes', 'No'],
          ['OPTIONS', 'Ask allowed methods / CORS preflight', 'Yes', 'Yes', 'Rare'],
          ['POST', 'Create / trigger an action', 'No', '**No**', 'Yes'],
          ['PUT', 'Replace the whole resource (or create at a known URL)', 'No', 'Yes', 'Yes'],
          ['PATCH', 'Partial update', 'No', 'Not guaranteed', 'Yes'],
          ['DELETE', 'Remove', 'No', 'Yes', 'Usually no'],
        ]),
      ),
      section('why', 'Why it matters',
        bullets(
          'Proxies, browsers and HTTP clients retry idempotent requests automatically on connection failure.',
          'Caches only cache safe methods (GET/HEAD).',
          'A GET that deletes data can be triggered by a link prefetcher or crawler.',
        ),
      ),
      section('internals', 'Idempotent ≠ same response',
        bullets(
          '`DELETE /todos/1` twice: first 204, then 404 — but the server state (todo gone) is the same. Still idempotent.',
          '`PATCH { "increment": 1 }` is not idempotent; `PATCH { "title": "x" }` happens to be.',
          'Make POST safe to retry with an `Idempotency-Key` header stored server-side.',
        ),
        flow(['Client: POST /payments + Idempotency-Key: abc', 'Server: key seen? return stored response', 'Else: process, store response under key'], { title: 'Idempotency keys', direction: 'vertical' }),
      ),
      section('example', 'Routing by method in node:http',
        code({
          title: 'Todo API v2: GET, POST, DELETE + 405',
          code: dedent(`
            const http = require('node:http');
            let nextId = 2;
            const todos = new Map([[1, { id: 1, title: 'Learn HTTP', done: false }]]);

            const send = (res, status, data, headers = {}) => {
              const body = data === undefined ? '' : JSON.stringify(data);
              res.writeHead(status, { 'Content-Type': 'application/json', ...headers });
              res.end(body);
            };

            http.createServer(async (req, res) => {
              const { pathname } = new URL(req.url, 'http://localhost');
              if (pathname === '/todos') {
                if (req.method === 'GET') return send(res, 200, [...todos.values()]);
                if (req.method === 'POST') {
                  const todo = { id: nextId++, title: 'New todo', done: false }; // body parsing comes later
                  todos.set(todo.id, todo);
                  return send(res, 201, todo, { Location: '/todos/' + todo.id });
                }
                return send(res, 405, { error: 'Method not allowed' }, { Allow: 'GET, POST' });
              }
              const match = pathname.match(/^\\/todos\\/(\\d+)$/);
              if (match && req.method === 'DELETE') {
                const deleted = todos.delete(Number(match[1]));
                return deleted ? send(res, 204) : send(res, 404, { error: 'Not found' });
              }
              send(res, 404, { error: 'Not found' });
            }).listen(3000);
          `),
          explanation: [
            '405 must include an `Allow` header listing supported methods.',
            '201 Created comes with a `Location` header pointing at the new resource.',
            '204 No Content has no body.',
            'Second DELETE of the same id → 404, yet the method is still idempotent.',
          ],
        }),
        code({
          title: 'The exchange',
          language: 'http',
          code: dedent(`
            DELETE /todos/1 HTTP/1.1

            HTTP/1.1 204 No Content

            PUT /todos HTTP/1.1

            HTTP/1.1 405 Method Not Allowed
            Allow: GET, POST
            Content-Type: application/json

            {"error":"Method not allowed"}
          `),
        }),
      ),
      section('real-world', 'Real-world',
        bullets(
          'Payment APIs require `Idempotency-Key` on POST so retries never double-charge.',
          'HEAD is used by CDNs and download managers to check size (`Content-Length`) without downloading.',
          'OPTIONS is sent automatically by browsers for CORS preflight.',
        ),
      ),
      section('mistakes', 'Common mistakes',
        bullets(
          'State-changing GET endpoints (`GET /deleteUser?id=1`).',
          'Using POST for everything ("RPC over HTTP").',
          'Returning 404 instead of 405 for a known path with an unsupported method.',
          'Assuming PATCH is idempotent.',
        ),
      ),
      section('interview', 'Interview angle',
        interviewTip('Expect the table: safe vs idempotent per method. The trap is DELETE returning 404 the second time — still idempotent, because idempotency is about server state.'),
      ),
      section('practice', 'Practice',
        text('Add `HEAD /todos` support that returns the same headers as GET (including Content-Length) but no body.'),
      ),
      section('summary', 'Summary',
        bullets('Safe: GET, HEAD, OPTIONS.', 'Idempotent: safe methods + PUT, DELETE.', 'POST (and usually PATCH) are not idempotent.', '405 + Allow for unsupported methods.'),
      ),
    ],
    revisionNotes: [
      'Safe: GET, HEAD, OPTIONS (also TRACE).',
      'Idempotent: GET, HEAD, OPTIONS, PUT, DELETE.',
      'Not idempotent: POST; PATCH not guaranteed.',
      'Idempotency is about server state, not identical responses.',
      '405 Method Not Allowed must include Allow.',
      'Idempotency-Key header makes POST retry-safe.',
    ],
    quiz: [
      {
        kind: 'mcq', difficulty: 'beginner',
        prompt: 'Which method is idempotent but NOT safe?',
        options: ['GET', 'POST', 'PUT', 'HEAD'],
        answer: 2,
        explanation: 'PUT changes state (not safe) but repeating the same PUT leaves the same state (idempotent). GET/HEAD are safe; POST is neither.',
      },
      {
        kind: 'scenario', difficulty: 'intermediate',
        prompt: 'A mobile app retries POST /orders when the network drops, and some users get duplicate orders. Best fix?',
        options: ['Switch to GET', 'Require an Idempotency-Key header and return the stored result for repeated keys', 'Disable retries server-side', 'Use PATCH'],
        answer: 1,
        explanation: 'POST is not idempotent; an idempotency key makes retries return the original result instead of creating a second order.',
      },
      {
        kind: 'predict-output', difficulty: 'intermediate',
        prompt: 'DELETE /todos/7 returns 204. The client sends the same DELETE again. What is the most appropriate response and is DELETE still idempotent?',
        options: ['204, and yes', '404, and yes', '404, so DELETE is not idempotent', '500'],
        answer: 1,
        explanation: 'The resource no longer exists, so 404 (or 204 by policy) is fine. Idempotency concerns the resulting server state, which is unchanged by the second call.',
      },
    ],
    interview: [
      {
        category: 'express-backend', kind: 'concept', difficulty: 'beginner', topic: 'HTTP methods',
        question: 'What is the difference between safe and idempotent HTTP methods?',
        shortAnswer: 'Safe methods do not modify server state (GET, HEAD, OPTIONS); idempotent methods can be repeated with the same effect as one call (safe methods plus PUT and DELETE).',
        detailedAnswer: [
          'All safe methods are idempotent, not vice versa.',
          'POST is neither; PATCH is not guaranteed idempotent.',
          'Clients/proxies may retry idempotent requests automatically.',
          'Only safe methods are cacheable by default.',
        ],
        followUp: 'Is DELETE still idempotent if the second call returns 404?',
        trap: 'Defining idempotent as "returns the same response every time".',
      },
      {
        category: 'express-backend', kind: 'scenario', difficulty: 'advanced', topic: 'Idempotency',
        question: 'How would you implement idempotency keys for a POST /payments endpoint?',
        shortAnswer: 'Require an Idempotency-Key header, atomically reserve it in a shared store (e.g. Redis SET NX or a unique DB row) before processing, store the final status and body under the key with a TTL, and replay the stored response for repeats with the same key.',
        detailedAnswer: [
          'Scope keys per client/user to prevent collisions.',
          'Store a request fingerprint; same key with a different body → 422/409.',
          'Concurrent duplicate while the first is in flight → 409 or wait.',
          'Keep the reservation and the side effect consistent (same DB transaction or an outbox).',
          'Expire keys after e.g. 24 h.',
        ],
        followUp: 'What happens if the process crashes after charging but before storing the response?',
        trap: 'Checking "if key exists" and inserting later in two separate steps — race condition.',
      },
    ],
  },

  'http-status-codes': {
    summary: 'Status codes tell the client what happened: 2xx success, 3xx redirection, 4xx client error, 5xx server error. Choosing precisely (201 vs 200, 401 vs 403, 400 vs 422) makes APIs predictable.',
    topics: ['status codes', '200', '201', '204', '301', '302', '304', '400', '401', '403', '404', '409', '422', '429', '500', '502', '503'],
    sections: [
      section('introduction', undefined,
        text('Clients branch on the status code before reading the body. A precise code means less guesswork: retry? re-authenticate? show a validation error?'),
      ),
      section('definition', 'The classes',
        table('Status classes', ['Range', 'Meaning'], [
          ['1xx', 'Informational (100 Continue, 101 Switching Protocols for WebSockets)'],
          ['2xx', 'Success'],
          ['3xx', 'Redirection / use cached copy'],
          ['4xx', 'Client error — fix the request before retrying'],
          ['5xx', 'Server error — may succeed later'],
        ]),
        table('Success and redirects', ['Code', 'Name', 'Use when'], [
          ['200', 'OK', 'GET success; PUT/PATCH returning the updated resource'],
          ['201', 'Created', 'POST created a resource — add `Location` header'],
          ['204', 'No Content', 'DELETE success, or update with no body to return'],
          ['301', 'Moved Permanently', 'URL changed forever (SEO, old API path)'],
          ['302', 'Found', 'Temporary redirect (use 307/308 to preserve method + body)'],
          ['304', 'Not Modified', 'Conditional GET: client cache (ETag/Last-Modified) still valid — no body'],
        ]),
        table('Client errors', ['Code', 'Name', 'Use when'], [
          ['400', 'Bad Request', 'Malformed syntax: invalid JSON, wrong types, missing required query'],
          ['401', 'Unauthorized', 'Not authenticated: missing/invalid/expired credentials (send `WWW-Authenticate`)'],
          ['403', 'Forbidden', 'Authenticated but not allowed'],
          ['404', 'Not Found', 'Resource does not exist (or hide existence from unauthorised users)'],
          ['405', 'Method Not Allowed', 'Path exists, method not supported (+ `Allow`)'],
          ['409', 'Conflict', 'State conflict: duplicate email, version mismatch'],
          ['413', 'Content Too Large', 'Body exceeds limit'],
          ['415', 'Unsupported Media Type', 'Wrong `Content-Type`'],
          ['422', 'Unprocessable Content', 'Well-formed but semantically invalid (validation errors)'],
          ['429', 'Too Many Requests', 'Rate limited (+ `Retry-After`)'],
        ]),
        table('Server errors', ['Code', 'Name', 'Use when'], [
          ['500', 'Internal Server Error', 'Unexpected bug / unhandled exception'],
          ['502', 'Bad Gateway', 'Proxy/gateway got an invalid response from upstream'],
          ['503', 'Service Unavailable', 'Overloaded or in maintenance (+ `Retry-After`)'],
          ['504', 'Gateway Timeout', 'Upstream did not respond in time'],
        ]),
      ),
      section('why', 'Why precision matters',
        bullets(
          'Clients automate behaviour: 401 → refresh token; 429/503 → back off; 4xx → do not retry blindly.',
          'Monitoring: 5xx rate is a key alert; returning 200 with `{ error }` hides outages.',
          'Caches and browsers act on 301/304.',
        ),
      ),
      section('internals', 'Decision flow for errors',
        flow(['Body parse fails? → 400', 'No/invalid credentials? → 401', 'Not permitted? → 403', 'Resource missing? → 404', 'Conflicts with state? → 409', 'Fails validation? → 422', 'Our bug? → 500'], { title: 'Choosing a 4xx/5xx', direction: 'vertical' }),
      ),
      section('example', 'Status codes in the Todo API',
        code({
          title: 'A consistent error format',
          code: dedent(`
            const http = require('node:http');

            class HttpError extends Error {
              constructor(status, message, details) {
                super(message);
                this.status = status;
                this.details = details;
              }
            }

            function sendError(res, err) {
              const status = err instanceof HttpError ? err.status : 500;
              const message = status === 500 ? 'Internal Server Error' : err.message; // never leak internals
              if (status === 500) console.error(err);
              res.writeHead(status, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: { status, message, details: err.details } }));
            }

            http.createServer(async (req, res) => {
              try {
                await route(req, res); // throws HttpError(404, 'Todo not found') etc.
              } catch (err) {
                sendError(res, err);
              }
            }).listen(3000);
          `),
          explanation: [
            'One place converts exceptions to responses — exactly what Express error middleware will do in Module 8.',
            'Unknown errors become 500 with a generic message; the stack goes to logs, not to clients.',
          ],
        }),
        code({
          title: 'Validation error vs conflict',
          language: 'http',
          code: dedent(`
            POST /users HTTP/1.1
            Content-Type: application/json

            {"email":"not-an-email"}

            HTTP/1.1 422 Unprocessable Content
            Content-Type: application/json

            {"error":{"status":422,"message":"Validation failed","details":[{"field":"email","message":"must be a valid email"}]}}

            POST /users HTTP/1.1
            Content-Type: application/json

            {"email":"ada@example.com"}

            HTTP/1.1 409 Conflict
            Content-Type: application/json

            {"error":{"status":409,"message":"Email already registered"}}
          `),
        }),
        code({
          title: 'Status helpers (runnable)',
          runnable: true,
          code: dedent(`
            const classify = (s) =>
              s >= 500 ? 'server error' : s >= 400 ? 'client error' : s >= 300 ? 'redirect' : s >= 200 ? 'success' : 'info';
            const retryable = (s) => s === 429 || s === 502 || s === 503 || s === 504;
            for (const s of [201, 304, 422, 429, 503]) {
              console.log(s, classify(s), retryable(s) ? 'retry' : 'no-retry');
            }
          `),
          expectedOutput: '201 success no-retry\n304 redirect no-retry\n422 client error no-retry\n429 client error retry\n503 server error retry',
          explanation: ['Client retry logic usually retries 429 and transient 5xx with backoff, never 400/422.'],
        }),
      ),
      section('real-world', 'Real-world conventions',
        bullets(
          'Return 404 instead of 403 for resources a user must not even know exist (e.g. other tenants\' invoices).',
          'Health check returns 503 while the app is draining during shutdown, so the load balancer stops routing to it.',
          '502/504 usually come from Nginx or the load balancer, not your Node code.',
        ),
      ),
      section('mistakes', 'Common mistakes',
        bullets(
          '200 with `{ success: false }` for errors.',
          '401 for "logged in but not allowed" (that is 403).',
          '500 for validation errors (client\'s fault → 4xx).',
          '201 without `Location`, or a body with 204/304.',
          'Leaking stack traces in 500 responses.',
        ),
      ),
      section('interview', 'Interview angle',
        interviewTip('Common pairs to differentiate: 401 vs 403, 400 vs 422, 200 vs 201 vs 204, 301 vs 302 vs 304, 502 vs 503 vs 504.'),
      ),
      section('practice', 'Practice',
        text('For each Todo endpoint, list every status it can return. Make sure each has a test case.'),
      ),
      section('summary', 'Summary',
        bullets('2xx success, 3xx redirect/cache, 4xx client, 5xx server.', '201 + Location on create; 204 has no body.', '401 = who are you? 403 = I know you, no.', '429/503 + Retry-After.'),
      ),
    ],
    revisionNotes: [
      '201 Created + Location; 204 No Content (no body).',
      '304 Not Modified answers conditional GET (If-None-Match / If-Modified-Since).',
      '401 = unauthenticated (+WWW-Authenticate); 403 = authenticated but forbidden.',
      '400 malformed; 422 semantically invalid; 409 state conflict.',
      '429 + Retry-After for rate limits; 503 + Retry-After for overload.',
      '502 bad upstream response; 504 upstream timeout.',
    ],
    quiz: [
      {
        kind: 'mcq', difficulty: 'beginner',
        prompt: 'A logged-in user tries to delete another user\'s post. Which status fits best?',
        options: ['401 Unauthorized', '403 Forbidden', '400 Bad Request', '409 Conflict'],
        answer: 1,
        explanation: 'The user is authenticated (so not 401) but lacks permission → 403. (404 is also acceptable if you want to hide existence.)',
      },
      {
        kind: 'scenario', difficulty: 'intermediate',
        prompt: 'POST /users with valid JSON but the "age" field is -5. Which response is most precise?',
        options: ['400 with a generic message', '422 with field-level validation details', '500', '200 with { ok: false }'],
        answer: 1,
        explanation: 'The JSON is well-formed but semantically invalid → 422 with details. 400 is commonly used too, but 422 is more specific; 200/500 are wrong.',
      },
      {
        kind: 'mcq', difficulty: 'intermediate',
        prompt: 'Which status should a conditional GET receive when the client\'s ETag still matches?',
        options: ['200', '204', '304', '412'],
        answer: 2,
        explanation: '304 Not Modified tells the client to use its cached copy, with no body. 412 is for failed preconditions on unsafe methods (If-Match).',
      },
    ],
    interview: [
      {
        category: 'express-backend', kind: 'concept', difficulty: 'beginner', topic: 'Status codes',
        question: 'What is the difference between 401 and 403?',
        shortAnswer: '401 means the request lacks valid authentication (who are you?); 403 means the server knows who you are but you are not allowed (you may not).',
        detailedAnswer: [
          '401 should include a `WWW-Authenticate` header describing the scheme.',
          'Clients typically refresh tokens or redirect to login on 401.',
          '403 should not be retried with the same credentials.',
          'Some APIs return 404 instead of 403 to avoid revealing existence.',
        ],
        followUp: 'When would you return 404 instead of 403?',
        trap: 'Using 401 for every auth-related failure because of its misleading name "Unauthorized".',
      },
      {
        category: 'express-backend', kind: 'concept', difficulty: 'intermediate', topic: 'Status codes',
        question: 'When do you use 400, 409 and 422?',
        shortAnswer: '400 for malformed requests (bad JSON, wrong types), 422 for well-formed requests that fail validation rules, and 409 when the request conflicts with the current state of the resource (duplicates, version mismatch).',
        detailedAnswer: [
          '400: the server cannot even parse/understand the request.',
          '422: parsed fine, but rules fail — return field-level details.',
          '409: valid request, but e.g. email already taken or optimistic locking conflict.',
          'Be consistent and document the choice; many APIs use 400 for validation too.',
        ],
        followUp: 'Which status for an optimistic-locking failure with If-Match?',
        trap: 'Returning 500 for validation errors thrown by the ORM.',
      },
      {
        category: 'express-backend', kind: 'concept', difficulty: 'intermediate', topic: 'Status codes',
        question: 'Explain 502, 503 and 504. Which would your Node app return itself?',
        shortAnswer: '502 Bad Gateway means a proxy got an invalid response from upstream, 503 Service Unavailable means the server is temporarily unable to handle requests, and 504 Gateway Timeout means the proxy gave up waiting; a Node app typically returns 503 itself (overload, draining) while 502/504 come from proxies.',
        detailedAnswer: [
          '502 often means the Node process crashed or closed the connection.',
          '504 often means a handler took longer than the proxy timeout.',
          'Return 503 + `Retry-After` during shutdown/maintenance or when a dependency circuit breaker is open.',
          'A Node service acting as a gateway to another API may itself return 502/504.',
        ],
        followUp: 'How do 502s show up during deployments and how do you avoid them?',
        trap: 'Using 500 for everything that goes wrong on the server side.',
      },
    ],
  },
};

export default content;
