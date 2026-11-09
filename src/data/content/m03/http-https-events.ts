import type { ModuleContent } from '../../../types';
import { bullets, code, dedent, diagram, flow, interviewTip, note, section, steps, table, text } from '../helpers';

const content: Partial<ModuleContent> = {
  // ───────────────────────────────────────────────────────────
  'http-module': {
    summary: '`node:http` creates HTTP servers and clients. A server gets `(req, res)` per request — `req` is a readable stream, `res` a writable stream — and every Node framework is built on it.',
    topics: ['http', 'createServer', 'IncomingMessage', 'ServerResponse', 'request body', 'status codes', 'headers', 'keep-alive', 'http.request', 'fetch', 'timeouts', 'Agent'],
    sections: [
      section('introduction', undefined,
        text('Express, Fastify, Koa and NestJS all end up calling `http.createServer`. Knowing the raw module shows you what frameworks do for you — routing, body parsing, error handling.'),
      ),
      section('definition', 'Definition',
        bullets(
          '`http.createServer(handler)` returns an `http.Server` (an EventEmitter on top of a `net.Server`).',
          'For each request the handler receives `req` (`http.IncomingMessage`, **Readable**) and `res` (`http.ServerResponse`, **Writable**).',
          '`http.request` / `http.get` make outbound requests; since Node 18 the global `fetch` (built on undici) is the simpler client.',
        ),
      ),
      section('why', 'Why learn the raw module',
        bullets(
          'Debug framework behaviour (headers already sent, hanging requests, timeouts).',
          'Write tiny services (health checks, webhooks) without dependencies.',
          'Understand streaming responses, keep-alive and backpressure.',
        ),
      ),
      section('internals', 'Request lifecycle',
        steps(
          'The OS accepts a TCP connection; libuv notifies the event loop (no thread pool involved).',
          'Node\'s HTTP parser (**llhttp**, C) parses the request line and headers.',
          'The `request` event fires with `req`/`res` — the body has **not** been read yet.',
          'You read the body from the `req` stream (`data`/`end` or `for await`).',
          '`res.writeHead`/`setHeader` + `res.write` + `res.end` send the response.',
          'With keep-alive the socket stays open for the next request (`server.keepAliveTimeout`, default 5 s).',
        ),
        diagram('request-response', 'Client → TCP → llhttp parser → request event → your handler → response stream.'),
      ),
      section('visual', 'Important APIs',
        table('http — important methods', ['API', 'What it does', 'Style'], [
          ['`http.createServer((req, res) => {})`', 'Create a server', 'event-based'],
          ['`server.listen(port, host?, cb?)`', 'Start accepting connections', 'async (callback / `listening` event)'],
          ['`server.close(cb)` / `closeAllConnections()`', 'Stop accepting / force-close sockets (Node 18.2+)', 'async'],
          ['`req.method` / `req.url` / `req.headers`', 'Request line and lower-cased headers', 'properties'],
          ['`req` (body)', 'Read with `for await (const chunk of req)`', 'stream (Readable)'],
          ['`res.statusCode` / `res.setHeader()` / `res.writeHead()`', 'Status and headers', 'sync'],
          ['`res.write(chunk)` / `res.end(data?)`', 'Send body / finish response', 'stream (Writable)'],
          ['`http.request(opts, cb)` / `http.get(url, cb)`', 'Outbound request (low-level)', 'stream'],
          ['`fetch(url, init)`', 'Global client (Node 18+, stable in 21)', 'async (promise)'],
          ['`new http.Agent({ keepAlive: true })`', 'Socket pooling for outbound requests', 'config'],
          ['`server.requestTimeout` / `headersTimeout` / `keepAliveTimeout`', 'Protection timeouts (300 s / 60 s / 5 s defaults in Node 18+)', 'config'],
        ]),
      ),
      section('example', 'Examples',
        code({
          title: 'A JSON API without a framework',
          code: dedent(`
            import http from 'node:http';

            const users = [{ id: 1, name: 'Ada' }];

            const server = http.createServer(async (req, res) => {
              const url = new URL(req.url, 'http://localhost');
              res.setHeader('content-type', 'application/json');

              if (req.method === 'GET' && url.pathname === '/users') {
                return res.end(JSON.stringify(users));
              }
              if (req.method === 'POST' && url.pathname === '/users') {
                let body = '';
                for await (const chunk of req) body += chunk;
                const user = { id: users.length + 1, ...JSON.parse(body) };
                users.push(user);
                res.statusCode = 201;
                return res.end(JSON.stringify(user));
              }
              res.statusCode = 404;
              res.end(JSON.stringify({ error: 'Not found' }));
            });

            server.listen(3000, () => console.log('listening on 3000'));
          `),
          expectedOutput: 'listening on 3000\n\n$ curl -X POST localhost:3000/users -d \'{"name":"Linus"}\'\n{"id":2,"name":"Linus"}',
          explanation: [
            '`req.url` is only the path + query, so build a `URL` with a base to parse it.',
            'The body arrives as a stream — `for await` collects the chunks.',
            'Production code must cap body size and catch `JSON.parse` errors (frameworks do this).',
          ],
        }),
        code({
          title: 'Outbound request with fetch',
          code: dedent(`
            const res = await fetch('https://api.github.com/repos/nodejs/node', {
              headers: { 'user-agent': 'demo' },
              signal: AbortSignal.timeout(5000),
            });
            console.log(res.status, (await res.json()).full_name);
          `),
          expectedOutput: '200 nodejs/node',
          explanation: ['`fetch` is global in Node 18+. Always set a timeout — fetch has no short default.'],
        }),
      ),
      section('real-world', 'Real-world usage',
        bullets(
          'Behind a load balancer, set `server.keepAliveTimeout` **higher** than the LB idle timeout (e.g. 65 s for a 60 s AWS ALB) to avoid sporadic 502s.',
          'On SIGTERM call `server.close()` so in-flight requests finish (graceful shutdown).',
          'Reuse sockets for outbound calls with a keep-alive Agent (the global agent keeps alive by default since Node 19).',
        ),
        code({
          title: 'Streaming a file response',
          code: dedent(`
            import { createReadStream } from 'node:fs';
            import { pipeline } from 'node:stream/promises';

            http.createServer(async (req, res) => {
              res.writeHead(200, { 'content-type': 'video/mp4' });
              try { await pipeline(createReadStream('intro.mp4'), res); }
              catch (err) { console.error('stream failed', err.code); }
            }).listen(3000);
          `),
          explanation: ['Constant memory per download; `pipeline` destroys the file stream if the client disconnects.'],
        }),
      ),
      section('mistakes', 'Common mistakes',
        bullets(
          'Calling `res.setHeader` after `res.end`/`write` → `ERR_HTTP_HEADERS_SENT`.',
          'Forgetting `res.end()` on some branch → client hangs until timeout.',
          'Reading `req.body` — it does not exist in raw Node; that is Express middleware.',
          'No body-size limit → memory-exhaustion DoS.',
          'Throwing inside an async handler without try/catch → unhandled rejection crashes the process.',
        ),
        code({
          title: 'Wrong vs right',
          code: dedent(`
            // ✗ responds twice
            if (!user) res.end('not found');
            res.end(JSON.stringify(user));

            // ✓ return after responding
            if (!user) return res.end('not found');
            res.end(JSON.stringify(user));
          `),
          explanation: ['The second `end` triggers `ERR_STREAM_WRITE_AFTER_END`.'],
        }),
      ),
      section('interview', 'Interview tips',
        interviewTip('Emphasize that `req` and `res` are streams. It explains body parsing, streaming responses, backpressure and why `req.body` needs middleware.'),
      ),
      section('practice', 'Practice',
        steps('Add `DELETE /users/:id` to the example using `url.pathname.split(\'/\')`.', 'Reject bodies larger than 1 MB with status 413.'),
      ),
      section('summary', 'Summary',
        bullets(
          '`createServer` handler gets `req` (Readable) and `res` (Writable).',
          'Body must be read from the stream; frameworks do it for you.',
          'Use `fetch` (Node 18+) for outbound requests.',
          'Tune keep-alive/timeouts and close gracefully.',
        ),
      ),
    ],
    revisionNotes: [
      'Server = EventEmitter over net.Server; parser = llhttp.',
      'req = IncomingMessage (Readable); res = ServerResponse (Writable).',
      'req.url is path+query only; parse with new URL(req.url, base).',
      'Defaults: keepAliveTimeout 5 s, headersTimeout 60 s, requestTimeout 300 s (18+).',
      'ERR_HTTP_HEADERS_SENT = headers set after body started.',
      'fetch global in 18+, built on undici.',
    ],
    quiz: [
      {
        kind: 'find-bug', difficulty: 'beginner',
        prompt: 'Why does this server never respond to requests that are not /ping?',
        code: "http.createServer((req, res) => {\n  if (req.url === '/ping') {\n    res.end('pong');\n  }\n}).listen(3000);",
        options: ['/ping must be uppercase', 'Nothing ends the response for other URLs, so the client waits until timeout', 'listen needs a callback', 'res.end cannot send strings'],
        answer: 1,
        explanation: 'Every branch must call res.end (e.g. 404). listen callbacks are optional and res.end accepts strings.',
      },
      {
        kind: 'mcq', difficulty: 'intermediate',
        prompt: 'In raw Node.js, how do you get a POST request body?',
        options: ['req.body', 'req.getBody()', 'Read the req stream (data/end events or for await)', 'res.body'],
        answer: 2,
        explanation: 'req is a Readable stream. req.body is added by framework middleware such as express.json().',
      },
      {
        kind: 'scenario', difficulty: 'advanced',
        prompt: 'Behind a load balancer with a 60 s idle timeout, users see occasional 502 errors on reused connections. What is the most likely fix?',
        options: ['Lower server.keepAliveTimeout to 1 s', 'Set server.keepAliveTimeout above 60 s (and headersTimeout above that)', 'Disable HTTP entirely', 'Increase UV_THREADPOOL_SIZE'],
        answer: 1,
        explanation: 'Node closes idle sockets after 5 s by default; the LB may reuse a socket Node just closed. Keep Node\'s timeout longer than the LB\'s. The thread pool is irrelevant to sockets.',
      },
    ],
    interview: [
      {
        category: 'nodejs', kind: 'concept', difficulty: 'beginner', topic: 'http',
        question: 'How do you create a basic HTTP server in Node.js without Express?',
        shortAnswer: 'Call `http.createServer((req, res) => { ... })`, set status/headers on `res`, end it with `res.end(body)`, and call `server.listen(port)`.',
        detailedAnswer: [
          'Routing is manual: inspect `req.method` and `new URL(req.url, base).pathname`.',
          'Read the body from the `req` stream.',
          'Every code path must end the response.',
          'Express adds routing, middleware, body parsing and error handling on top.',
        ],
        followUp: 'What does Express add on top of this?',
        trap: 'Referencing `req.body` or `res.json` — those are Express, not Node core.',
      },
      {
        category: 'nodejs', kind: 'concept', difficulty: 'intermediate', topic: 'http',
        question: 'Why are req and res described as streams, and what practical consequences does that have?',
        shortAnswer: '`req` is a Readable stream of the request body and `res` is a Writable stream of the response body. You must consume the body explicitly, and you can stream large responses with backpressure.',
        detailedAnswer: [
          'Body chunks arrive as the client sends them — parsing waits for `end`.',
          'Unconsumed bodies hold the socket; frameworks drain or parse them.',
          '`res.write` returns false when the socket buffer is full → wait for `drain`.',
          'You can `pipeline(fileStream, res)` or proxy `req` to another server.',
          'Headers are sent with the first write — afterwards they are immutable.',
        ],
        followUp: 'How would you limit request body size?',
        trap: 'Thinking the whole body is already available when the handler runs.',
      },
      {
        category: 'nodejs', kind: 'concept', difficulty: 'advanced', topic: 'http',
        question: 'Which http.Server timeouts exist and how do they protect a production server?',
        shortAnswer: '`headersTimeout` and `requestTimeout` bound how long a client may take to send headers/the full request (Slowloris protection); `keepAliveTimeout` closes idle keep-alive sockets; `server.timeout` covers socket inactivity.',
        detailedAnswer: [
          'Node 18+ defaults: requestTimeout 300 s, headersTimeout 60 s, keepAliveTimeout 5 s; server.timeout 0 (disabled).',
          'Slow clients holding many sockets can exhaust file descriptors without them.',
          'Behind a proxy, keepAliveTimeout must exceed the proxy\'s idle timeout to avoid 502s.',
          'These are server-side; outbound requests need their own timeouts (AbortSignal.timeout).',
        ],
        followUp: 'How would you implement graceful shutdown with keep-alive connections open?',
        trap: 'Assuming Node has no default protection, or that keepAliveTimeout limits request duration.',
      },
    ],
  },

  // ───────────────────────────────────────────────────────────
  'https-module': {
    summary: '`node:https` is `http` over TLS: same API plus certificate options. Use it to serve HTTPS directly or make verified outbound TLS requests; in production TLS is often terminated at a proxy.',
    topics: ['https', 'TLS', 'certificates', 'createServer', 'key and cert', 'rejectUnauthorized', 'CA', 'NODE_EXTRA_CA_CERTS', 'mTLS', 'TLS termination'],
    sections: [
      section('introduction', undefined,
        text('Any data crossing a network should be encrypted. `https` wraps the `http` API in TLS (from `node:tls`, backed by OpenSSL).'),
      ),
      section('definition', 'Definition',
        bullets(
          '`https.createServer({ key, cert }, handler)` — identical handler signature to `http`.',
          '`https.request` / `https.get` — outbound TLS requests that **verify certificates by default**.',
          'Global `fetch` handles `https://` URLs without importing this module.',
        ),
      ),
      section('why', 'Why it matters',
        bullets(
          'Confidentiality and integrity of passwords, tokens and personal data.',
          'Server identity: certificates prove you are talking to the right host.',
          'Calls to payment providers, OAuth servers and internal services with mutual TLS.',
        ),
      ),
      section('internals', 'TLS handshake (simplified)',
        flow([
          'TCP connect',
          'ClientHello: TLS versions, ciphers, SNI hostname',
          'ServerHello + certificate chain',
          'Client verifies chain against trusted CAs + hostname',
          'Key exchange → shared session keys',
          'Encrypted HTTP request/response',
        ], { title: 'TLS 1.3 handshake', direction: 'vertical' }),
        bullets(
          'Node bundles Mozilla\'s CA list; add corporate CAs with `NODE_EXTRA_CA_CERTS=/path/ca.pem` or the `ca` option.',
          'Handshakes are CPU work on the main thread — another reason TLS is often terminated at Nginx/a load balancer.',
        ),
      ),
      section('visual', 'Important APIs and http vs https',
        table('https — important methods', ['API', 'What it does', 'Style'], [
          ['`https.createServer({ key, cert }, handler)`', 'TLS server', 'event-based'],
          ['`https.request(url, opts, cb)` / `https.get()`', 'Outbound TLS request', 'stream'],
          ['`new https.Agent({ keepAlive, ca, cert, key })`', 'Pool + TLS config (custom CA, client cert)', 'config'],
          ['options `ca`, `cert`, `key`, `pfx`, `passphrase`', 'Certificates and keys', 'config'],
          ['option `minVersion: \'TLSv1.2\'`', 'Restrict protocol versions', 'config'],
          ['option `requestCert` / `rejectUnauthorized`', 'Mutual TLS on the server / verification toggle', 'config'],
        ]),
        table('http vs https', ['', '`http`', '`https`'], [
          ['Transport', 'Plain TCP', 'TLS over TCP'],
          ['Default port', '80', '443'],
          ['Server options', 'none required', '`key` + `cert` (or `pfx`)'],
          ['Handler', '`(req, res)`', 'same'],
          ['Outbound verification', 'n/a', 'On by default'],
        ]),
      ),
      section('example', 'Examples',
        code({
          title: 'HTTPS server',
          code: dedent(`
            import https from 'node:https';
            import { readFileSync } from 'node:fs';

            const options = {
              key: readFileSync('certs/server.key'),     // sync is fine at startup
              cert: readFileSync('certs/server.crt'),
              minVersion: 'TLSv1.2',
            };
            https.createServer(options, (req, res) => {
              res.end('secure hello');
            }).listen(8443, () => console.log('https on 8443'));
          `),
          expectedOutput: 'https on 8443\n\n$ curl --cacert certs/ca.crt https://localhost:8443\nsecure hello',
          explanation: ['Same handler as `http`. For local dev, create certs with mkcert or openssl.'],
        }),
        code({
          title: 'Trusting an internal CA (the right way)',
          code: dedent(`
            import https from 'node:https';
            import { readFileSync } from 'node:fs';

            const agent = new https.Agent({ ca: readFileSync('certs/internal-ca.pem'), keepAlive: true });
            https.get('https://billing.internal/health', { agent }, (res) => {
              console.log(res.statusCode, res.socket.authorized);
            });
          `),
          expectedOutput: '200 true',
          explanation: ['The chain is verified against your CA, and `authorized` is `true`. Verification stays on.'],
        }),
      ),
      section('real-world', 'Real-world usage',
        bullets(
          'Most deployments: client → HTTPS → Nginx / ALB (TLS termination) → plain HTTP → Node on a private network.',
          'Run HTTPS in Node directly for end-to-end encryption requirements or small deployments.',
          'Mutual TLS between services: server sets `requestCert: true` and `ca`; client sends `cert` + `key`.',
        ),
        diagram('reverse-proxy', 'TLS is frequently terminated at the proxy, and Node speaks plain HTTP behind it.'),
      ),
      section('mistakes', 'Common mistakes',
        bullets(
          'Setting `rejectUnauthorized: false` or `NODE_TLS_REJECT_UNAUTHORIZED=0` to "fix" certificate errors — disables protection against MITM.',
          'Committing private keys to git.',
          'Forgetting to reload certificates when they renew (use `server.setSecureContext()` to swap them without restart).',
          'Serving HTTPS behind a proxy and generating `http://` redirect URLs — trust `X-Forwarded-Proto` (framework setting).',
        ),
        code({
          title: 'Wrong vs right',
          code: dedent(`
            // ✗ silently accepts ANY certificate
            https.get(url, { rejectUnauthorized: false }, onRes);

            // ✓ trust the specific CA you need
            https.get(url, { ca: readFileSync('internal-ca.pem') }, onRes);
          `),
          explanation: ['Fix the trust chain, never disable verification.'],
        }),
      ),
      section('interview', 'Interview tips',
        interviewTip('If asked about self-signed certs, the answer that scores is "add the CA via `ca` or `NODE_EXTRA_CA_CERTS`", never "set rejectUnauthorized to false".'),
      ),
      section('practice', 'Practice',
        steps('Generate a local CA + cert with mkcert and run the HTTPS server.', 'Call it with `https.get` once without `ca` (observe the error code) and once with it.'),
      ),
      section('summary', 'Summary',
        bullets(
          '`https` = `http` + TLS options.',
          'Server needs `key` + `cert`; clients verify by default.',
          'Trust private CAs explicitly; never disable verification.',
          'TLS is often terminated at a reverse proxy.',
        ),
      ),
    ],
    revisionNotes: [
      'https.createServer(options, handler) — handler identical to http.',
      'Outbound TLS verifies chain + hostname by default.',
      'Custom CA: `ca` option or NODE_EXTRA_CA_CERTS.',
      'rejectUnauthorized:false = MITM risk.',
      'setSecureContext() rotates certs without restart.',
      'mTLS: requestCert + ca on server; cert + key on client.',
    ],
    quiz: [
      {
        kind: 'mcq', difficulty: 'beginner',
        prompt: 'What must you pass to https.createServer that http.createServer does not need?',
        options: ['A port number', 'A private key and certificate', 'A request timeout', 'A thread-pool size'],
        answer: 1,
        explanation: 'TLS requires the server\'s key and certificate (or pfx). Ports are passed to listen() for both.',
      },
      {
        kind: 'scenario', difficulty: 'intermediate',
        prompt: 'Calls to an internal service fail with UNABLE_TO_VERIFY_LEAF_SIGNATURE because it uses the company CA. What should you do?',
        options: ['Set NODE_TLS_REJECT_UNAUTHORIZED=0', 'Switch the call to http://', 'Provide the company CA via the `ca` option or NODE_EXTRA_CA_CERTS', 'Pin a random cipher suite'],
        answer: 2,
        explanation: 'Adding the CA keeps verification on. Disabling verification or downgrading to HTTP removes the protection TLS provides.',
      },
    ],
    interview: [
      {
        category: 'nodejs', kind: 'concept', difficulty: 'beginner', topic: 'https',
        question: 'What is the difference between the http and https modules?',
        shortAnswer: '`https` runs the same HTTP API over TLS. The server requires a key and certificate, and outbound requests verify the server certificate by default.',
        detailedAnswer: [
          'Default ports 80 vs 443.',
          'TLS provides encryption, integrity and server authentication.',
          'Built on `node:tls`, backed by OpenSSL.',
          'Handler code is identical.',
        ],
        followUp: 'Where would you terminate TLS in production and why?',
        trap: 'Saying https is "a different protocol from HTTP" — it is HTTP inside TLS.',
      },
      {
        category: 'nodejs', kind: 'scenario', difficulty: 'intermediate', topic: 'https',
        question: 'How do you call an HTTPS service that uses a self-signed or internal CA certificate safely?',
        shortAnswer: 'Trust that CA explicitly with the `ca` option on the request/agent or the `NODE_EXTRA_CA_CERTS` env var — keeping certificate verification enabled.',
        detailedAnswer: [
          '`rejectUnauthorized: false` would accept any certificate, allowing MITM attacks.',
          'NODE_EXTRA_CA_CERTS is read once at startup and adds to the bundled CAs.',
          'For fetch (undici), pass a custom dispatcher/Agent with `connect: { ca }` (undici API, not core http).',
          'Consider certificate pinning for highly sensitive integrations.',
        ],
        followUp: 'How would you set up mutual TLS between two Node services?',
        trap: 'Recommending NODE_TLS_REJECT_UNAUTHORIZED=0 "just for now".',
      },
    ],
  },

  // ───────────────────────────────────────────────────────────
  'events-module': {
    summary: '`node:events` provides `EventEmitter`: objects that emit named events and call registered listeners synchronously in order. Streams, servers and sockets are all EventEmitters.',
    topics: ['EventEmitter', 'on', 'once', 'emit', 'off', 'error event', 'maxListeners', 'events.once', 'events.on', 'captureRejections', 'synchronous listeners'],
    sections: [
      section('introduction', undefined,
        text('`server.on(\'request\')`, `stream.on(\'data\')`, `process.on(\'SIGTERM\')` — the observer pattern is everywhere in Node, and it all comes from one class: `EventEmitter`.'),
      ),
      section('definition', 'Definition',
        bullets(
          '`emitter.on(name, fn)` registers a listener; `emit(name, ...args)` calls all listeners for that name.',
          'Listeners run **synchronously**, in registration order, on the emitting call stack.',
          '`emit` returns `true` if there were listeners.',
          'The `\'error\'` event is special: emitting it with no listener **throws**.',
        ),
      ),
      section('why', 'Why it exists',
        bullets(
          'Decouples producers from consumers (one event, many listeners).',
          'Models things that happen many times: data chunks, connections, signals.',
          'Promises model one result; emitters model a series of events.',
        ),
      ),
      section('internals', 'How emit works',
        steps(
          'The emitter stores `_events`: a map of event name → listener or array of listeners.',
          '`emit` copies the listener array (so adding/removing during emit does not affect this round).',
          'Each listener is called with `this` = the emitter (unless it is an arrow function).',
          'If a listener throws, `emit` throws — remaining listeners do not run.',
          'More than `maxListeners` (default 10) for one event prints `MaxListenersExceededWarning` — a leak hint, not an error.',
        ),
        code({
          title: 'Listeners are synchronous — a tiny emitter in pure JS',
          runnable: true,
          code: dedent(`
            class MiniEmitter {
              #events = new Map();
              on(name, fn) { (this.#events.get(name) ?? this.#events.set(name, []).get(name)).push(fn); return this; }
              emit(name, ...args) {
                const list = [...(this.#events.get(name) ?? [])];
                for (const fn of list) fn.apply(this, args);
                return list.length > 0;
              }
            }
            const e = new MiniEmitter();
            e.on('order', (id) => console.log('email for', id));
            e.on('order', (id) => console.log('invoice for', id));
            console.log('before');
            console.log(e.emit('order', 42));
            console.log('after');
            console.log(e.emit('nobody-listens'));
          `),
          expectedOutput: 'before\nemail for 42\ninvoice for 42\ntrue\nafter\nfalse',
          explanation: [
            'Both listeners run inside `emit`, before `after` — exactly like Node\'s EventEmitter.',
            '`emit` returns whether any listener existed.',
          ],
        }),
      ),
      section('visual', 'Important methods',
        table('events — important methods', ['Method', 'What it does', 'Style'], [
          ['`on(name, fn)` / `addListener`', 'Register a listener', 'sync'],
          ['`once(name, fn)`', 'Listener removed after first call', 'sync'],
          ['`prependListener(name, fn)`', 'Register at the front', 'sync'],
          ['`off(name, fn)` / `removeListener`', 'Remove a specific listener (same function reference)', 'sync'],
          ['`removeAllListeners(name?)`', 'Remove all', 'sync'],
          ['`emit(name, ...args)`', 'Call listeners synchronously; returns boolean', 'sync'],
          ['`listenerCount(name)` / `eventNames()`', 'Introspection', 'sync'],
          ['`setMaxListeners(n)`', 'Change the leak-warning threshold (default 10)', 'sync'],
          ['`events.once(emitter, name, { signal })`', 'Promise resolving on the next event', 'async (promise)'],
          ['`events.on(emitter, name)`', 'Async iterator of events', 'async (iterator)'],
          ['`new EventEmitter({ captureRejections: true })`', 'Route async listener rejections to `error`', 'config'],
        ]),
        flow(['emit("order", data)', 'listener 1 runs', 'listener 2 runs', 'emit returns true'], { title: 'One synchronous emit', direction: 'horizontal' }),
      ),
      section('example', 'Examples',
        code({
          title: 'Extending EventEmitter',
          code: dedent(`
            import { EventEmitter } from 'node:events';

            class OrderService extends EventEmitter {
              place(order) {
                // ...save to DB
                this.emit('placed', order);
              }
            }
            const orders = new OrderService();
            orders.on('placed', (o) => console.log('send email', o.id));
            orders.once('placed', (o) => console.log('first order ever!', o.id));

            orders.place({ id: 1 });
            orders.place({ id: 2 });
          `),
          expectedOutput: 'send email 1\nfirst order ever! 1\nsend email 2',
          explanation: ['`once` fires only for the first emit. Order follows registration.'],
        }),
        code({
          title: 'The error event',
          code: dedent(`
            import { EventEmitter } from 'node:events';
            const e = new EventEmitter();
            try {
              e.emit('error', new Error('disk full'));
            } catch (err) {
              console.log('thrown:', err.message);
            }
            e.on('error', (err) => console.log('handled:', err.message));
            e.emit('error', new Error('disk full'));
          `),
          expectedOutput: 'thrown: disk full\nhandled: disk full',
          explanation: ['Without an `error` listener, emit throws the error — in real code this usually crashes the process.'],
        }),
        code({
          title: 'Awaiting an event',
          code: dedent(`
            import { once } from 'node:events';
            import http from 'node:http';

            const server = http.createServer().listen(0);
            await once(server, 'listening');
            console.log('port', server.address().port);
            server.close();
          `),
          expectedOutput: 'port 53817',
          explanation: ['`events.once` turns an event into a promise; it rejects if `error` is emitted first. Port 0 = random free port (value varies).'],
        }),
      ),
      section('real-world', 'Real-world usage',
        bullets(
          'Domain events inside one process: `user.registered` → send welcome email, update analytics.',
          'Waiting for readiness in tests: `await once(server, \'listening\')`.',
          'Graceful shutdown: `process.on(\'SIGTERM\', ...)` — `process` is an EventEmitter.',
        ),
        note('An EventEmitter only works **inside one process**. Across instances use a broker (Redis pub/sub, Kafka, RabbitMQ).'),
      ),
      section('mistakes', 'Common mistakes',
        bullets(
          'No `error` listener on emitters that can fail (streams, sockets) → crash.',
          'Expecting async behaviour — heavy listeners block `emit` and the event loop.',
          'Adding a listener per request to a long-lived emitter and never removing it → memory leak + MaxListenersExceededWarning.',
          '`off(name, () => {...})` with a new arrow function — it never matches the original.',
          'Async listeners that reject → unhandled rejection unless `captureRejections` is on.',
        ),
        code({
          title: 'Leak vs fix',
          code: dedent(`
            // ✗ a new listener on a global emitter for every request
            app.get('/stream', (req, res) => {
              bus.on('tick', (t) => res.write(t));
            });

            // ✓ remove it when the client goes away
            app.get('/stream', (req, res) => {
              const onTick = (t) => res.write(t);
              bus.on('tick', onTick);
              req.on('close', () => bus.off('tick', onTick));
            });
          `),
          explanation: ['Keep a reference to the listener so `off` can remove it.'],
        }),
      ),
      section('interview', 'Interview tips',
        interviewTip('Interviewers love asking "are EventEmitter listeners async?" The answer is no — they run synchronously in order. Then add: the `error` event throws if unhandled.'),
      ),
      section('practice', 'Practice',
        steps('Build a `JobQueue extends EventEmitter` emitting `queued`, `done`, `failed`.', 'Use `events.on(queue, \'done\')` in a `for await` loop to log completions.'),
      ),
      section('summary', 'Summary',
        bullets(
          'EventEmitter = named events + synchronous listeners.',
          'Unhandled `error` event throws.',
          'Default max 10 listeners per event → warning, not error.',
          '`events.once` / `events.on` bridge to promises and async iterators.',
          'In-process only; use a broker across services.',
        ),
      ),
    ],
    revisionNotes: [
      'emit() calls listeners synchronously in registration order; returns boolean.',
      'error event without listener → throws.',
      'MaxListenersExceededWarning at > 10 listeners per event (leak hint).',
      'off() needs the same function reference.',
      'events.once(emitter, name) → promise; events.on → async iterator.',
      'captureRejections routes async listener rejections to error.',
    ],
    quiz: [
      {
        kind: 'predict-output', difficulty: 'intermediate',
        prompt: 'What is printed?',
        code: "const { EventEmitter } = require('node:events');\nconst e = new EventEmitter();\ne.on('x', () => console.log('listener'));\nconsole.log('A');\ne.emit('x');\nconsole.log('B');",
        options: ['A B listener', 'A listener B', 'listener A B', 'A B'],
        answer: 1,
        explanation: 'emit calls listeners synchronously, so "listener" prints before emit returns. It is not deferred to a later tick.',
      },
      {
        kind: 'mcq', difficulty: 'beginner',
        prompt: 'What happens when you `emit(\'error\', err)` on an EventEmitter with no error listener?',
        options: ['Nothing — the event is ignored', 'A warning is printed', 'The error is thrown', 'It is queued until a listener is added'],
        answer: 2,
        explanation: '\'error\' is special: with no listener, emit throws err (crashing the process if uncaught). Other event names are silently ignored.',
      },
      {
        kind: 'find-bug', difficulty: 'intermediate',
        prompt: 'Why is the listener never removed?',
        code: "bus.on('tick', () => console.log('tick'));\n// later\nbus.off('tick', () => console.log('tick'));",
        options: ['off only works with once', 'The second arrow function is a different function object, so it does not match', 'off requires removeAllListeners first', 'tick is a reserved event name'],
        answer: 1,
        explanation: 'Listener removal compares function references. Store the function in a variable and pass that same reference to off.',
      },
    ],
    interview: [
      {
        category: 'nodejs', kind: 'concept', difficulty: 'beginner', topic: 'events',
        question: 'What is EventEmitter and which core Node objects are built on it?',
        shortAnswer: 'EventEmitter is the class in `node:events` that implements named events with listeners (`on`, `emit`). Streams, HTTP servers/requests, sockets, child processes and `process` all inherit from it.',
        detailedAnswer: [
          'Implements the observer pattern inside one process.',
          'Listeners are stored per event name and called in order.',
          'Classes extend it to expose lifecycle events.',
          'Bridges to promises via `events.once` and to async iteration via `events.on`.',
        ],
        followUp: 'Are listeners called synchronously or asynchronously?',
        trap: 'Confusing EventEmitter with the event loop — emitting does not schedule anything.',
      },
      {
        category: 'nodejs', kind: 'output', difficulty: 'intermediate', topic: 'events',
        question: 'Are EventEmitter listeners executed synchronously or asynchronously? Show the evidence.',
        shortAnswer: 'Synchronously, in registration order, during the `emit()` call. Code after `emit` runs only after every listener returns.',
        detailedAnswer: [
          'emit iterates a copy of the listener array and calls each one.',
          'A slow listener blocks the emitter and the event loop.',
          'To defer work, call `setImmediate`/`queueMicrotask` inside the listener.',
          'A throwing listener aborts emit — later listeners do not run.',
        ],
        code: { id: 'm03-events-sync-iq', language: 'javascript', code: "const e = new (require('node:events'))();\ne.on('go', () => console.log('1'));\ne.on('go', () => setImmediate(() => console.log('3')));\ne.emit('go');\nconsole.log('2');", expectedOutput: '1\n2\n3' },
        followUp: 'How do you handle errors thrown by async listeners?',
        trap: 'Assuming emit queues listeners like setTimeout.',
      },
      {
        category: 'nodejs', kind: 'concept', difficulty: 'advanced', topic: 'events',
        question: 'What does MaxListenersExceededWarning mean, and how do you fix it properly?',
        shortAnswer: 'More than 10 listeners (default) were added for one event on one emitter — usually a leak where listeners are added per request/operation and never removed. Fix the leak; raise the limit only when many listeners are intentional.',
        detailedAnswer: [
          'It is a warning, not an error; the listener is still added.',
          'Find the source with `node --trace-warnings`.',
          'Remove listeners on cleanup (`off`, `once`, `AbortSignal` with `events.once`/`addEventListener`).',
          '`emitter.setMaxListeners(n)` or `events.defaultMaxListeners` when the count is legitimate.',
          'Leaked listeners also retain closures → heap growth.',
        ],
        followUp: 'How would you find the leaking code in a heap snapshot?',
        trap: 'Silencing it with setMaxListeners(0) without investigating.',
      },
    ],
  },
};

export default content;
