import type { Project } from '../../types';
import { dedent, entity } from './shared';

export const p03: Project = {
  id: 'p03',
  number: 3,
  level: 'beginner',
  title: 'Simple HTTP Server',
  status: 'ready',
  summary: 'A static file + JSON API server built only with `node:http`: a hand-written router, body parsing with limits, streaming files, correct status codes and graceful shutdown.',
  skills: ['node:http', 'Routing by hand', 'Content types', 'Status codes', 'Streaming responses', 'Path traversal defence', 'Graceful shutdown'],
  estHours: 6,
  prerequisites: [
    'm03-http-module',
    'm03-url-module',
    'm07-request-and-response-lifecycle',
    'm07-http-status-codes',
    'm07-content-types',
    'm07-request-body',
    'm06-piping',
    'm11-graceful-shutdown',
  ],
  requirements: {
    functional: [
      'Serve files from `public/` (`/` → `index.html`) with the correct `Content-Type`.',
      'JSON API for notes: list, get, create, update, delete (`/api/notes`, `/api/notes/:id`).',
      'Return `404` for unknown routes, `405` with an `Allow` header for wrong methods, `400` for bad JSON, `413` for bodies > 1 MB, `415` for non-JSON bodies.',
      'Conditional GET: send `Last-Modified`, reply `304` when `If-Modified-Since` matches.',
      '`GET /health` returns `{ status: "ok", uptime }`.',
      'Log `method path status duration` for every request.',
    ],
    nonFunctional: [
      'No dependencies — `node:http`, `node:fs`, `node:path`, `node:stream` only.',
      'Files are streamed, never buffered whole into memory.',
      'Path traversal (`/../../etc/passwd`, encoded `%2e%2e`) is impossible.',
      'On `SIGTERM`/`SIGINT` stop accepting connections and finish in-flight requests (max 10 s).',
      'Port and host from environment (`PORT`, `HOST`); `node --env-file=.env` in dev.',
    ],
  },
  architecture: {
    diagramId: 'request-response',
    flow: [
      { label: 'TCP connection', detail: 'http.Server accepts socket' },
      { label: "'request' event", detail: 'req (Readable), res (Writable)' },
      { label: 'Logger wrapper', detail: 'start timer, log on finish' },
      { label: 'Router', detail: 'match method + path → handler' },
      { label: 'Handler', detail: 'static stream or JSON API' },
      { label: 'Response', detail: 'status, headers, body' },
    ],
    notes: [
      'One `createServer` callback; everything else is plain functions — exactly what Express hides from you.',
      'Routes are an array of `{ method, pattern: RegExp, handler }`; named capture groups become `params`.',
      'An `HttpError` class carries a status code; one `try/catch` in the dispatcher turns it into a JSON error.',
      'Notes live in a `Map` (in-memory) — persistence is not the point of this project.',
    ],
  },
  folderStructure: dedent(`
    http-server/
    ├── package.json        # "type": "module", "scripts": { "dev": "node --watch --env-file=.env src/server.js" }
    ├── .env                # PORT=3000
    ├── public/
    │   ├── index.html
    │   └── app.js
    ├── src/
    │   ├── server.js       # createServer, logging, graceful shutdown
    │   ├── app.js          # handler(req, res) — exported for tests
    │   ├── router.js       # tiny router
    │   ├── body.js         # readJson with size limit
    │   ├── static.js       # safe static file streaming
    │   ├── http-error.js
    │   └── routes/
    │       └── notes.js
    └── test/
        └── server.test.js
  `),
  databaseDesign: [
    entity('Note (in-memory Map<string, Note>)', [
      ['id', 'string', 'randomUUID(), key of the Map', 'Never taken from the client'],
      ['title', 'string', 'required, 1–100 chars', ''],
      ['body', 'string', 'optional, ≤ 10 000 chars', ''],
      ['createdAt', 'string', 'ISO timestamp', ''],
      ['updatedAt', 'string', 'ISO timestamp', 'Changed by PUT'],
    ]),
  ],
  endpoints: [
    { method: 'GET', path: '/', description: 'public/index.html', auth: 'public' },
    { method: 'GET', path: '/<file>', description: 'Any file under public/ (streamed, Last-Modified / 304).', auth: 'public' },
    { method: 'GET', path: '/health', description: 'Liveness check.', auth: 'public' },
    { method: 'GET', path: '/api/notes', description: 'List notes.', auth: 'public' },
    { method: 'GET', path: '/api/notes/:id', description: 'Get one note or 404.', auth: 'public' },
    { method: 'POST', path: '/api/notes', description: 'Create; 201 + Location header.', auth: 'public' },
    { method: 'PUT', path: '/api/notes/:id', description: 'Replace title/body.', auth: 'public' },
    { method: 'DELETE', path: '/api/notes/:id', description: '204 No Content.', auth: 'public' },
  ],
  steps: [
    {
      title: 'An HttpError and a JSON helper',
      code: {
        id: 'p03-s1',
        title: 'src/http-error.js',
        language: 'javascript',
        code: dedent(`
          export class HttpError extends Error {
            constructor(status, message, headers = {}) {
              super(message);
              this.status = status;
              this.headers = headers;
            }
          }

          export function sendJson(res, status, data, headers = {}) {
            const body = JSON.stringify(data);
            res.writeHead(status, {
              'Content-Type': 'application/json; charset=utf-8',
              'Content-Length': Buffer.byteLength(body),
              ...headers,
            });
            res.end(body);
          }
        `),
      },
    },
    {
      title: 'A tiny router',
      bullets: [
        'Match the path with a regex; if the path matches but the method does not, answer `405` with `Allow`.',
        'Parse the URL with the WHATWG `URL` class — never the legacy `url.parse`.',
      ],
      code: {
        id: 'p03-s2',
        title: 'src/router.js',
        language: 'javascript',
        code: dedent(`
          import { HttpError } from './http-error.js';

          export class Router {
            #routes = [];

            add(method, path, handler) {
              // '/api/notes/:id' -> ^/api/notes/(?<id>[^/]+)$  (literal segments are plain words)
              const source = path
                .split('/')
                .map((part) => (part.startsWith(':') ? \`(?<\${part.slice(1)}>[^/]+)\` : part))
                .join('/');
              this.#routes.push({ method, pattern: new RegExp(\`^\${source}$\`), handler });
              return this;
            }

            match(method, pathname) {
              const allowed = [];
              for (const route of this.#routes) {
                const m = route.pattern.exec(pathname);
                if (!m) continue;
                if (route.method === method) return { handler: route.handler, params: m.groups ?? {} };
                allowed.push(route.method);
              }
              if (allowed.length) throw new HttpError(405, 'Method Not Allowed', { Allow: allowed.join(', ') });
              return null;
            }
          }
        `),
      },
    },
    {
      title: 'Read JSON bodies with a size limit',
      bullets: [
        '`req` is a Readable stream — collect chunks with `for await`.',
        'Abort early when the limit is exceeded (`413`) instead of buffering an attacker\'s 2 GB upload.',
        'Require `Content-Type: application/json` (`415`), and map `SyntaxError` to `400`.',
      ],
      code: {
        id: 'p03-s3',
        title: 'src/body.js',
        language: 'javascript',
        code: dedent(`
          import { HttpError } from './http-error.js';

          export async function readJson(req, limit = 1024 * 1024) {
            const type = req.headers['content-type'] ?? '';
            if (!type.startsWith('application/json')) throw new HttpError(415, 'Expected application/json');

            const declared = Number(req.headers['content-length'] ?? 0);
            if (declared > limit) throw new HttpError(413, 'Payload Too Large');

            const chunks = [];
            let size = 0;
            for await (const chunk of req) {
              size += chunk.length;
              if (size > limit) throw new HttpError(413, 'Payload Too Large');
              chunks.push(chunk);
            }
            try {
              return JSON.parse(Buffer.concat(chunks).toString('utf8'));
            } catch {
              throw new HttpError(400, 'Invalid JSON');
            }
          }
        `),
      },
    },
    {
      title: 'Serve static files safely',
      bullets: [
        'Decode the path, `path.join` it onto the public root, then verify the result is **still inside** the root.',
        'Stream with `pipeline(createReadStream(file), res)`; set `Content-Length` from `stat`.',
        'Support `If-Modified-Since` → `304` with no body.',
      ],
      code: {
        id: 'p03-s4',
        title: 'src/static.js',
        language: 'javascript',
        code: dedent(`
          import { createReadStream } from 'node:fs';
          import { stat } from 'node:fs/promises';
          import { pipeline } from 'node:stream/promises';
          import path from 'node:path';
          import { HttpError } from './http-error.js';

          const ROOT = path.resolve('public');
          const MIME = {
            '.html': 'text/html; charset=utf-8',
            '.js': 'text/javascript; charset=utf-8',
            '.css': 'text/css; charset=utf-8',
            '.json': 'application/json; charset=utf-8',
            '.png': 'image/png',
            '.jpg': 'image/jpeg',
            '.svg': 'image/svg+xml',
            '.ico': 'image/x-icon',
          };

          export async function serveStatic(req, res, pathname) {
            let decoded;
            try {
              decoded = decodeURIComponent(pathname);
            } catch {
              throw new HttpError(400, 'Bad path encoding');
            }
            if (decoded.includes('\\0')) throw new HttpError(400, 'Bad path');

            const file = path.join(ROOT, decoded === '/' ? 'index.html' : decoded);
            if (file !== ROOT && !file.startsWith(ROOT + path.sep)) throw new HttpError(403, 'Forbidden');

            let info;
            try {
              info = await stat(file);
            } catch {
              return false; // let the caller send 404
            }
            if (!info.isFile()) return false;

            const lastModified = info.mtime.toUTCString();
            const since = req.headers['if-modified-since'];
            if (since && Date.parse(since) >= Math.floor(info.mtimeMs / 1000) * 1000) {
              res.writeHead(304, { 'Last-Modified': lastModified });
              res.end();
              return true;
            }

            res.writeHead(200, {
              'Content-Type': MIME[path.extname(file).toLowerCase()] ?? 'application/octet-stream',
              'Content-Length': info.size,
              'Last-Modified': lastModified,
              'X-Content-Type-Options': 'nosniff',
            });
            if (req.method === 'HEAD') {
              res.end();
            } else {
              await pipeline(createReadStream(file), res);
            }
            return true;
          }
        `),
      },
    },
    {
      title: 'Notes routes',
      code: {
        id: 'p03-s5',
        title: 'src/routes/notes.js',
        language: 'javascript',
        code: dedent(`
          import { randomUUID } from 'node:crypto';
          import { readJson } from '../body.js';
          import { HttpError, sendJson } from '../http-error.js';

          const notes = new Map();

          function validate(input) {
            if (typeof input?.title !== 'string' || !input.title.trim() || input.title.length > 100) {
              throw new HttpError(400, 'title must be a 1-100 character string');
            }
            if (input.body !== undefined && (typeof input.body !== 'string' || input.body.length > 10_000)) {
              throw new HttpError(400, 'body must be a string up to 10000 characters');
            }
            return { title: input.title.trim(), body: input.body ?? '' };
          }

          function find(id) {
            const note = notes.get(id);
            if (!note) throw new HttpError(404, 'Note not found');
            return note;
          }

          export function registerNotes(router) {
            router
              .add('GET', '/api/notes', (req, res) => sendJson(res, 200, [...notes.values()]))
              .add('GET', '/api/notes/:id', (req, res, { id }) => sendJson(res, 200, find(id)))
              .add('POST', '/api/notes', async (req, res) => {
                const data = validate(await readJson(req));
                const now = new Date().toISOString();
                const note = { id: randomUUID(), ...data, createdAt: now, updatedAt: now };
                notes.set(note.id, note);
                sendJson(res, 201, note, { Location: \`/api/notes/\${note.id}\` });
              })
              .add('PUT', '/api/notes/:id', async (req, res, { id }) => {
                const note = find(id);
                Object.assign(note, validate(await readJson(req)), { updatedAt: new Date().toISOString() });
                sendJson(res, 200, note);
              })
              .add('DELETE', '/api/notes/:id', (req, res, { id }) => {
                find(id);
                notes.delete(id);
                res.writeHead(204).end();
              });
          }
        `),
      },
    },
    {
      title: 'The request handler (dispatcher)',
      bullets: [
        'Exported separately from `listen()` so tests can start it on port `0` (random free port).',
        'A single `try/catch` maps `HttpError` to its status and anything else to `500` (logged, never leaked).',
        'If headers are already sent (error mid-stream), just destroy the socket.',
      ],
      code: {
        id: 'p03-s6',
        title: 'src/app.js',
        language: 'javascript',
        code: dedent(`
          import { Router } from './router.js';
          import { HttpError, sendJson } from './http-error.js';
          import { serveStatic } from './static.js';
          import { registerNotes } from './routes/notes.js';

          const router = new Router();
          router.add('GET', '/health', (req, res) => sendJson(res, 200, { status: 'ok', uptime: process.uptime() }));
          registerNotes(router);

          export async function handler(req, res) {
            const started = performance.now();
            res.on('finish', () => {
              const ms = (performance.now() - started).toFixed(1);
              console.log(\`\${req.method} \${req.url} \${res.statusCode} \${ms}ms\`);
            });

            try {
              const { pathname } = new URL(req.url, 'http://localhost');
              const match = router.match(req.method, pathname);
              if (match) return await match.handler(req, res, match.params);
              if ((req.method === 'GET' || req.method === 'HEAD') && (await serveStatic(req, res, pathname))) return;
              throw new HttpError(404, 'Not Found');
            } catch (err) {
              if (res.headersSent) return res.destroy(err);
              if (err instanceof HttpError) return sendJson(res, err.status, { error: err.message }, err.headers);
              console.error(err);
              sendJson(res, 500, { error: 'Internal Server Error' });
            }
          }
        `),
      },
    },
    {
      title: 'Start the server and shut down gracefully',
      bullets: [
        '`server.close()` stops accepting new connections and waits for in-flight requests.',
        '`server.closeIdleConnections()` (Node 18.2+) drops idle keep-alive sockets so `close` can finish.',
        'Force-exit after a timeout so a stuck request cannot block a deploy forever.',
        'Set `requestTimeout`/`headersTimeout` to defend against slowloris clients.',
      ],
      code: {
        id: 'p03-s7',
        title: 'src/server.js',
        language: 'javascript',
        code: dedent(`
          import http from 'node:http';
          import { handler } from './app.js';

          const PORT = Number(process.env.PORT ?? 3000);
          const HOST = process.env.HOST ?? '0.0.0.0';

          const server = http.createServer({ requestTimeout: 30_000, headersTimeout: 10_000 }, handler);
          server.keepAliveTimeout = 5_000;

          server.listen(PORT, HOST, () => console.log(\`Listening on http://\${HOST}:\${PORT}\`));

          function shutdown(signal) {
            console.log(\`\${signal} received, closing server...\`);
            server.close((err) => {
              if (err) console.error(err);
              process.exit(err ? 1 : 0);
            });
            server.closeIdleConnections();
            setTimeout(() => {
              console.error('Forcing shutdown');
              server.closeAllConnections();
              process.exit(1);
            }, 10_000).unref();
          }

          process.once('SIGTERM', shutdown);
          process.once('SIGINT', shutdown);
        `),
        versionNote: '`closeIdleConnections`/`closeAllConnections` need Node 18.2+. `--env-file` needs Node 20.6+.',
      },
    },
  ],
  testing: {
    bullets: [
      'Start the exported `handler` on port `0`, read the real port from `server.address()`, call it with global `fetch`.',
      'Cover: 201 + Location, 400 invalid JSON, 405 + Allow header, 413, 404, traversal attempt → 403/404.',
      'Use `t.after` / `after` hooks to close the server so the test process exits.',
    ],
    code: {
      id: 'p03-test',
      title: 'test/server.test.js',
      language: 'javascript',
      code: dedent(`
        import { test, before, after } from 'node:test';
        import assert from 'node:assert/strict';
        import http from 'node:http';
        import { once } from 'node:events';
        import { handler } from '../src/app.js';

        let server, base;

        before(async () => {
          server = http.createServer(handler).listen(0);
          await once(server, 'listening');
          base = \`http://localhost:\${server.address().port}\`;
        });
        after(() => server.close());

        const post = (path, body, type = 'application/json') =>
          fetch(base + path, { method: 'POST', headers: { 'content-type': type }, body });

        test('creates and fetches a note', async () => {
          const res = await post('/api/notes', JSON.stringify({ title: 'Hello' }));
          assert.equal(res.status, 201);
          const note = await res.json();
          assert.equal(res.headers.get('location'), \`/api/notes/\${note.id}\`);

          const again = await fetch(base + res.headers.get('location'));
          assert.equal((await again.json()).title, 'Hello');
        });

        test('invalid JSON is 400', async () => {
          const res = await post('/api/notes', '{bad');
          assert.equal(res.status, 400);
        });

        test('wrong method is 405 with Allow', async () => {
          const res = await fetch(base + '/api/notes', { method: 'PATCH' });
          assert.equal(res.status, 405);
          assert.match(res.headers.get('allow'), /GET/);
        });

        test('body over 1 MB is 413', async () => {
          const res = await post('/api/notes', JSON.stringify({ title: 'x', body: 'a'.repeat(1_100_000) }));
          assert.equal(res.status, 413);
        });

        test('path traversal is blocked', async () => {
          // %2f is not normalised by the URL parser, so the server sees '/../package.json'
          const res = await fetch(base + '/..%2fpackage.json');
          assert.equal(res.status, 403);
        });
      `),
    },
  },
  security: [
    'Path traversal: decode, join, then check the resolved path starts with `ROOT + path.sep`; reject null bytes.',
    'Body size limit + `requestTimeout`/`headersTimeout` stop memory-exhaustion and slowloris attacks.',
    'Send `X-Content-Type-Options: nosniff` and correct `Content-Type` so browsers do not guess types.',
    'Never return stack traces in 500 responses — log them server-side.',
    'Do not serve dotfiles (`.env`, `.git`) — keep them outside `public/` or reject names starting with `.`.',
  ],
  deployment: {
    bullets: [
      'Run as a non-root user in a small image; `node` directly (not `npm start`) so signals reach the process.',
      'Put Nginx or a cloud load balancer in front for TLS and gzip.',
      'Health check hits `GET /health`.',
    ],
    code: {
      id: 'p03-deploy',
      title: 'Dockerfile',
      language: 'dockerfile',
      code: dedent(`
        FROM node:22-alpine
        WORKDIR /app
        ENV NODE_ENV=production
        COPY package.json ./
        COPY src ./src
        COPY public ./public
        USER node
        EXPOSE 3000
        HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://localhost:3000/health || exit 1
        CMD ["node", "src/server.js"]
      `),
    },
  },
  extensions: [
    'gzip/brotli responses with `zlib.createBrotliCompress()` when `Accept-Encoding` allows.',
    'Range requests (`206 Partial Content`) for video seeking.',
    'Persist notes to a JSON file using p01\'s atomic write store.',
    'ETag based on size + mtime, `If-None-Match` → 304.',
    'Server-Sent Events endpoint that pushes note changes.',
    'Rewrite the router using `URLPattern` once it is stable in your Node version.',
  ],
};
