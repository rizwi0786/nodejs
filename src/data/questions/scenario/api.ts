import type { InterviewQuestion } from '../../../types';
import { sc } from './helpers';

/** Scenario questions: HTTP APIs, Express, auth and security. */
export const apiScenarioQuestions: InterviewQuestion[] = [
  sc({
    id: 'sc-001',
    category: 'express-backend',
    difficulty: 'beginner',
    topic: 'Body parsing',
    question: 'A new `POST /users` route in Express always sees `req.body` as `undefined`, even though the client sends JSON. What do you check?',
    shortAnswer: 'Express does not parse bodies by itself — make sure `app.use(express.json())` is registered before the route and that the client sends `Content-Type: application/json`.',
    detailedAnswer: [
      'Reproduce with `curl -H "Content-Type: application/json" -d \'{"name":"a"}\'` to rule out the client.',
      'Check that `express.json()` (built in since Express 4.16) is mounted with `app.use` *before* the router — middleware runs in registration order.',
      '`express.json()` only parses requests whose `Content-Type` matches `application/json`; a form post needs `express.urlencoded()`, and file uploads need a multipart parser such as multer.',
      'Set a sensible `limit` (default `100kb`) and return 413 for oversized bodies instead of raising it blindly.',
      'Prevent regressions with an integration test (Supertest) that posts JSON and asserts on the parsed result.',
    ],
    code: {
      language: 'javascript',
      code: `
        const express = require('express');
        const app = express();
        app.use(express.json({ limit: '1mb' })); // must come before the routes
        app.post('/users', (req, res) => {
          res.status(201).json({ received: req.body });
        });
      `,
    },
    followUp: 'Why might `req.body` be an empty object `{}` instead of `undefined`?',
    trap: 'Installing `body-parser` as a fix without noticing the real issue is middleware order or the Content-Type header.',
    relatedLessonIds: ['m08-built-in-middleware', 'm07-request-body', 'm07-content-types'],
  }),
  sc({
    id: 'sc-002',
    category: 'express-backend',
    difficulty: 'beginner',
    topic: 'Hanging requests',
    question: 'Some requests to your Express API never get a response; the client spins until it times out after 30 s. No error is logged. How do you find the cause?',
    shortAnswer: 'A middleware or handler on that path neither sends a response nor calls `next()` (often an async error swallowed in Express 4) — trace which one and make every path end in a response or `next(err)`.',
    detailedAnswer: [
      'Identify the affected routes from access logs/timeouts and reproduce locally.',
      'Add a tiny timing log per middleware (or use the debugger) to find the last middleware that ran.',
      'Typical culprits: an `if` branch that forgets `res.send`/`next()`, a callback that is never invoked, or an `await` that rejects in Express 4 (which does not catch async errors — the promise rejection is lost).',
      'Fix: return a response in every branch; wrap async handlers (or upgrade to Express 5, which forwards rejected promises to `next`).',
      'Add a centralized error handler and a server-side request timeout so a bug produces a 5xx instead of a hang.',
    ],
    code: {
      language: 'javascript',
      code: `
        // Bug: no response when the user is missing
        app.get('/users/:id', async (req, res) => {
          const user = await repo.find(req.params.id);
          if (user) res.json(user);
        });

        // Fix: every branch responds; errors reach the error handler
        app.get('/users/:id', async (req, res, next) => {
          try {
            const user = await repo.find(req.params.id);
            if (!user) return res.status(404).json({ error: 'Not found' });
            res.json(user);
          } catch (err) {
            next(err);
          }
        });
      `,
    },
    followUp: 'What does Express 5 change about async error handling?',
    trap: 'Increasing the client timeout — the request will never complete.',
    relatedLessonIds: ['m08-middleware', 'm08-error-handling-middleware', 'm08-custom-middleware'],
  }),
  sc({
    id: 'sc-003',
    category: 'express-backend',
    difficulty: 'beginner',
    topic: 'HTTP status codes',
    question: 'Your API returns `200 OK` with `{ "error": "User not found" }` for failures. The frontend and monitoring teams complain. What would you change?',
    shortAnswer: 'Use meaningful status codes (4xx for client errors, 5xx for server errors) with a consistent error body, so clients, caches and monitoring can react without parsing messages.',
    detailedAnswer: [
      'Map failures to codes: 400 validation, 401 unauthenticated, 403 forbidden, 404 not found, 409 conflict, 422 semantic validation (if you use it), 429 rate limited, 500/503 server-side.',
      'Use one error shape everywhere, e.g. `{ error: { code, message, details } }` (or RFC 9457 problem details).',
      'Throw typed errors (`NotFoundError`) in services and convert them to responses in a centralized error handler.',
      'Monitoring can now alert on 5xx rates; caches and proxies will not cache error responses as successes.',
      'Roll out carefully: existing clients may rely on `200` — version the change or coordinate with consumers.',
    ],
    followUp: 'When is 404 better than 403 for a resource the user cannot access?',
    trap: 'Returning 500 for every error, including invalid input.',
    relatedLessonIds: ['m07-http-status-codes', 'm08-centralized-error-handling'],
  }),
  sc({
    id: 'sc-004',
    category: 'express-backend',
    difficulty: 'beginner',
    topic: 'Password storage',
    question: 'You join a project and see that the `users` table stores passwords in plain text (some are MD5 hashes). What do you do?',
    shortAnswer: 'Switch to a slow, salted password hash (argon2id or bcrypt), migrate existing users on next login or by wrapping old hashes, and treat it as a potential incident.',
    detailedAnswer: [
      'Use a password-hashing function designed to be slow: argon2id or bcrypt (cost ≥ 10–12). Never MD5/SHA-x alone — they are fast and easy to brute-force.',
      'These functions generate a per-password salt and store it in the hash string; compare with the library\'s `verify/compare` (constant-time).',
      'Migration: for MD5 rows, store `bcrypt(md5)` immediately (wrapped hash), then re-hash with the plain password at next successful login.',
      'For plaintext rows, hash them all right away and force a password reset if a leak is possible.',
      'Check logs, backups and analytics exports for copies of the passwords; rotate and notify according to policy.',
    ],
    code: {
      language: 'javascript',
      code: `
        const bcrypt = require('bcrypt');
        const hash = await bcrypt.hash(password, 12); // salt is generated and embedded
        const ok = await bcrypt.compare(attempt, hash);
      `,
    },
    followUp: 'Why should you use the async bcrypt API in a Node server?',
    trap: 'Encrypting passwords (reversible) instead of hashing them.',
    relatedLessonIds: ['m10-password-hashing', 'm10-bcrypt'],
  }),
  sc({
    id: 'sc-005',
    category: 'express-backend',
    difficulty: 'beginner',
    topic: 'SQL injection',
    question: 'A code review shows `db.query("SELECT * FROM users WHERE email = \'" + req.query.email + "\'")`. What is the risk and the fix?',
    shortAnswer: 'It is SQL-injectable: user input becomes part of the SQL. Use parameterized queries so the driver sends values separately from the statement.',
    detailedAnswer: [
      'Input like `\' OR \'1\'=\'1` changes the query\'s meaning and can dump or modify data.',
      'Use placeholders (`$1` in `pg`, `?` in mysql2) and pass values as an array — the database never parses them as SQL.',
      'Placeholders cannot be used for identifiers (column names in `ORDER BY`); allow-list those instead.',
      'Also validate input shape (e.g. email format) and run the app with a least-privilege DB user.',
      'Prevent recurrence with lint rules, code review checklists, and an ORM/query builder that parameterizes by default.',
    ],
    code: {
      language: 'javascript',
      code: `
        const { rows } = await pool.query('SELECT id, email FROM users WHERE email = $1', [req.query.email]);
      `,
    },
    followUp: 'Can an ORM still be vulnerable to injection? (Yes — raw query helpers and string-built filters.)',
    trap: 'Thinking escaping quotes by hand is enough.',
    relatedLessonIds: ['m09-parameterized-queries', 'm09-sql-injection-prevention', 'm12-sql-injection'],
  }),
  sc({
    id: 'sc-006',
    category: 'express-backend',
    difficulty: 'beginner',
    topic: 'Pagination',
    question: '`GET /orders` returns every order (now 100,000 rows); the response takes 8 s and the server memory spikes. How do you fix it?',
    shortAnswer: 'Paginate: return a bounded page (`limit` with a max) using cursor/keyset pagination, select only needed columns, and index the sort column.',
    detailedAnswer: [
      'Add `limit` (default e.g. 20, max 100) so a single request can never load the whole table.',
      'Offset pagination (`LIMIT 20 OFFSET 10000`) is simple but gets slower for deep pages and can skip/duplicate rows when data changes.',
      'Keyset/cursor pagination (`WHERE created_at < $cursor ORDER BY created_at DESC LIMIT 20`) stays fast and stable; return `nextCursor` in the response.',
      'Index the sort/filter columns and select only the fields the client needs.',
      'For genuine full exports, offer an async export job or a streamed CSV instead of a giant JSON array.',
    ],
    followUp: 'How do you make a cursor opaque and tamper-resistant?',
    trap: 'Paginating in Node after loading all rows from the database.',
    relatedLessonIds: ['m07-pagination', 'm09-indexes'],
  }),
  sc({
    id: 'sc-007',
    category: 'express-backend',
    difficulty: 'intermediate',
    topic: 'CORS',
    question: 'The frontend works locally, but in production the browser console shows "blocked by CORS policy" for API calls. Postman calls work fine. How do you troubleshoot?',
    shortAnswer: 'CORS is enforced by the browser: check the preflight `OPTIONS` response and the `Access-Control-Allow-*` headers for the exact production origin — often the origin list, credentials, or a proxy stripping headers is wrong.',
    detailedAnswer: [
      'Postman ignores CORS, so it proves only that the API is reachable. Inspect the failing request and its preflight in the browser Network tab.',
      'Compare the `Origin` header (scheme + host + port, e.g. `https://app.example.com`) with what the server allows; a dev-only `http://localhost:5173` allow-list is the usual bug.',
      'With cookies/`credentials: "include"`, the server must echo the exact origin (not `*`) and send `Access-Control-Allow-Credentials: true`.',
      'Custom headers (`Authorization`) or methods (`PUT`, `DELETE`) trigger a preflight; the `OPTIONS` route must respond 2xx with `Access-Control-Allow-Headers/Methods`.',
      'Check the path through CDN/Nginx/API gateway: it may answer `OPTIONS` itself, cache responses without `Vary: Origin`, or return a 502 without CORS headers (which looks like a CORS error).',
      'Configure allowed origins via environment variables and add an automated check against the production domain.',
    ],
    code: {
      language: 'javascript',
      code: `
        const cors = require('cors'); // third-party Express middleware
        const allowed = process.env.CORS_ORIGINS.split(',');
        app.use(cors({
          origin: (origin, cb) => cb(null, !origin || allowed.includes(origin)),
          credentials: true,
        }));
      `,
    },
    followUp: 'Why is CORS not a security control for server-to-server requests?',
    trap: 'Fixing it with `Access-Control-Allow-Origin: *` while also using cookies — browsers reject that combination.',
    relatedLessonIds: ['m07-cors', 'm07-headers', 'm14-reverse-proxy'],
  }),
  sc({
    id: 'sc-008',
    category: 'express-backend',
    difficulty: 'intermediate',
    topic: 'Rate limiting behind a proxy',
    question: 'You added IP-based rate limiting, but after deploying behind a load balancer all users get 429 at the same time. Why, and how do you fix it?',
    shortAnswer: 'Behind a proxy `req.ip` is the proxy\'s address, so everyone shares one bucket. Configure `trust proxy` for your exact proxy hops so Express reads the client IP from `X-Forwarded-For`, and store counters in a shared store.',
    detailedAnswer: [
      'Log `req.ip` and `req.headers["x-forwarded-for"]` in production — you will see the LB\'s private IP for every request.',
      'Set `app.set("trust proxy", 1)` (number of trusted hops) or the LB\'s CIDR — not `true`, which lets clients spoof `X-Forwarded-For`.',
      'With multiple app instances, keep counters in Redis (sliding window / token bucket) so limits are global, not per instance.',
      'Rate-limit authenticated traffic by user ID or API key; IP alone penalizes users behind corporate NAT.',
      'Return `429` with `Retry-After` / `RateLimit-*` headers, and consider doing coarse limiting at the edge (Nginx, API gateway, WAF).',
    ],
    followUp: 'What is the difference between fixed-window, sliding-window and token-bucket limiting?',
    trap: 'Setting `trust proxy` to `true` unconditionally, allowing attackers to bypass limits with a fake header.',
    relatedLessonIds: ['m07-rate-limiting', 'm12-rate-limiting', 'm14-reverse-proxy'],
  }),
  sc({
    id: 'sc-009',
    category: 'express-backend',
    difficulty: 'intermediate',
    topic: 'Broken access control (IDOR)',
    question: 'A user reports they can see another customer\'s invoice by changing `/invoices/1041` to `/invoices/1042`. What is the issue and how do you fix it properly?',
    shortAnswer: 'Insecure direct object reference: the endpoint authenticates but does not authorize ownership. Enforce ownership/tenant checks in the data access layer for every object lookup.',
    detailedAnswer: [
      'Treat it as a security incident: check access logs for enumeration patterns and scope the exposure.',
      'Fix the query itself: `WHERE id = $1 AND customer_id = $2` (or tenant ID) using the identity from the verified token, never from the request body.',
      'Return 404 for objects the user may not see, to avoid confirming existence.',
      'Centralize authorization (policy functions or a repository that always scopes by tenant) so one forgotten check cannot recur.',
      'Random IDs (UUIDs) reduce enumeration but are not a fix on their own.',
      'Add tests that call each endpoint as a different user and expect 403/404.',
    ],
    followUp: 'How would you enforce tenant isolation at the database level (e.g. PostgreSQL row-level security)?',
    trap: 'Switching to UUIDs and calling it fixed.',
    relatedLessonIds: ['m12-broken-access-control', 'm10-permission-based-access', 'm10-authentication-vs-authorization'],
  }),
  sc({
    id: 'sc-010',
    category: 'express-backend',
    difficulty: 'intermediate',
    topic: 'JWT logout',
    question: 'Security testing shows that after a user logs out, their JWT still works for 24 hours. How do you design logout properly?',
    shortAnswer: 'Stateless JWTs cannot be "deleted", so use short-lived access tokens (5–15 min) plus a server-side, revocable refresh token; on logout revoke the refresh token and, if needed, denylist the access token\'s `jti` until it expires.',
    detailedAnswer: [
      'Shorten access-token lifetime so a stolen or logged-out token is only useful for minutes.',
      'Store refresh tokens server-side (hashed) with rotation: each refresh issues a new one and invalidates the old; reuse of an old token revokes the whole family.',
      'Logout deletes the refresh token and clears cookies (`HttpOnly`, `Secure`, `SameSite`).',
      'For immediate revocation, keep a Redis denylist of `jti` values with TTL = remaining token lifetime, or a per-user `tokenVersion` checked on each request.',
      'Revoke all sessions on password change or account compromise.',
    ],
    followUp: 'Where should a browser app store the access token and the refresh token?',
    trap: 'Saying "the client deletes the token from localStorage" counts as logout.',
    relatedLessonIds: ['m10-secure-logout', 'm10-refresh-tokens', 'm10-token-expiration'],
  }),
  sc({
    id: 'sc-011',
    category: 'express-backend',
    difficulty: 'intermediate',
    topic: 'Brute-force protection',
    question: 'Monitoring shows thousands of failed logins per minute against many accounts from rotating IPs. What protections do you add?',
    shortAnswer: 'Layer defences: rate limits per account and per IP/ASN in a shared store, progressive delays or temporary lockouts, CAPTCHA/step-up after failures, breached-password checks and MFA — without leaking which accounts exist.',
    detailedAnswer: [
      'Rotating IPs means per-IP limits alone fail; also count failures per username/email (credential stuffing).',
      'Use exponential backoff or short temporary locks rather than permanent lockout (which attackers can abuse for denial of service).',
      'Add CAPTCHA or proof-of-work after N failures, and offer/require MFA for sensitive accounts.',
      'Return the same message and similar timing for "unknown user" and "wrong password".',
      'Reject passwords found in breach lists at signup/reset; alert on anomalies (new geo, many accounts per IP).',
      'Put a WAF or bot management in front for volumetric attacks.',
    ],
    followUp: 'How would you detect credential stuffing versus a single user forgetting their password?',
    trap: 'Locking each account permanently after 5 failures — this lets an attacker lock out every user.',
    relatedLessonIds: ['m10-common-authentication-vulnerabilities', 'm12-rate-limiting'],
  }),
  sc({
    id: 'sc-012',
    category: 'express-backend',
    difficulty: 'intermediate',
    topic: 'File uploads',
    question: 'Users upload profile pictures and PDFs (up to 50 MB). Currently they are saved to the server\'s local disk with multer. You are moving to 4 instances behind a load balancer. How should uploads work?',
    shortAnswer: 'Store files in object storage (e.g. S3) — ideally uploaded directly by the client via short-lived pre-signed URLs — and keep only metadata in the database.',
    detailedAnswer: [
      'Local disk breaks with multiple instances (files exist on one machine only) and with ephemeral containers.',
      'Issue a pre-signed PUT URL from the API after checking auth, size and content type; the client uploads straight to storage, so Node does not proxy 50 MB bodies.',
      'If the server must receive the file, stream it to storage instead of buffering it in memory.',
      'Validate type by magic bytes, not just the extension; generate your own object keys (never use the user-supplied filename as a path).',
      'Process asynchronously (virus scan, thumbnails) via a storage event or job queue; serve via CDN with signed GET URLs for private files.',
    ],
    followUp: 'How do you prevent a user from uploading a 5 GB file to a pre-signed URL meant for avatars?',
    trap: 'Using a shared NFS mount as the "quick fix" and keeping the server in the upload data path.',
    relatedLessonIds: ['m08-file-uploads', 'm14-horizontal-scaling', 'm06-streaming-large-files'],
  }),
  sc({
    id: 'sc-013',
    category: 'express-backend',
    difficulty: 'intermediate',
    topic: 'N+1 queries',
    question: '`GET /posts` takes 2 s for 50 posts. The DB log shows 1 query for posts and then 50 queries for authors and 50 for comment counts. How do you fix and prevent this?',
    shortAnswer: 'It is an N+1 query problem: fetch related data in bulk with a JOIN or an `IN (...)` query (or the ORM\'s eager loading/DataLoader), and add query-count checks to tests.',
    detailedAnswer: [
      'Confirm with query logging / APM traces: count queries per request.',
      'Replace per-row lookups with one query: `JOIN users`, or `SELECT ... WHERE id = ANY($1)` with the collected IDs, then map them in memory.',
      'For counts, use a grouped aggregate (`GROUP BY post_id`) or a maintained counter column.',
      'In ORMs use eager loading (`include` in Prisma/Sequelize, `populate` in Mongoose — which itself issues one extra query per relation, not per row).',
      'In GraphQL resolvers, batch with DataLoader.',
      'Prevent: log/assert the number of queries per request in integration tests and watch slow-query dashboards.',
    ],
    code: {
      language: 'javascript',
      code: `
        const posts = await db.query('SELECT id, title, author_id FROM posts ORDER BY id DESC LIMIT 50');
        const ids = [...new Set(posts.rows.map((p) => p.author_id))];
        const authors = await db.query('SELECT id, name FROM users WHERE id = ANY($1)', [ids]);
        const byId = new Map(authors.rows.map((a) => [a.id, a]));
        const result = posts.rows.map((p) => ({ ...p, author: byId.get(p.author_id) }));
      `,
    },
    followUp: 'When is a JOIN worse than two separate queries?',
    trap: 'Running the 100 queries in parallel with `Promise.all` — it is faster but still hammers the DB and pool.',
    relatedLessonIds: ['m09-joins', 'm09-relationships', 'm11-performance-optimization'],
  }),
  sc({
    id: 'sc-014',
    category: 'express-backend',
    difficulty: 'intermediate',
    topic: 'Logging PII',
    question: 'An audit finds that your request logs contain full request bodies, including passwords, card numbers and email addresses. What do you do?',
    shortAnswer: 'Stop the leak (redact at the logger), purge or restrict existing logs, and move to structured logging that records only allow-listed fields and IDs.',
    detailedAnswer: [
      'Immediately disable body logging or add redaction (e.g. pino\'s `redact` paths for `req.body.password`, `authorization` headers, cookies).',
      'Prefer an allow-list: log method, route, status, latency, user ID and request ID — not raw bodies.',
      'Purge or restrict access to existing logs and backups; assess whether this is a reportable incident (GDPR, PCI DSS).',
      'Secrets in logs (tokens, passwords) must be rotated.',
      'Prevent: logging guidelines, tests that assert redaction, and scanning log pipelines for patterns like card numbers.',
    ],
    code: {
      language: 'javascript',
      code: `
        const pino = require('pino');
        const logger = pino({
          redact: {
            paths: ['req.headers.authorization', 'req.headers.cookie', 'req.body.password', 'req.body.card'],
            censor: '[REDACTED]',
          },
        });
      `,
    },
    followUp: 'How do you debug production issues without logging request bodies?',
    trap: 'Only masking passwords while still logging emails, tokens and addresses.',
    relatedLessonIds: ['m13-logging', 'm13-winston-or-pino', 'm14-logging-and-observability'],
  }),
  sc({
    id: 'sc-015',
    category: 'express-backend',
    difficulty: 'intermediate',
    topic: 'API versioning',
    question: 'You need to rename a response field and change a date format, but older mobile app versions (which users update slowly) depend on the current shape. How do you ship it?',
    shortAnswer: 'Make changes additive when possible; for a real breaking change, introduce a new version (e.g. `/v2`), run both side by side, track usage of the old one, and deprecate it with a timeline.',
    detailedAnswer: [
      'First try a non-breaking path: add the new field alongside the old one and keep both for a while.',
      'If it must break, version explicitly (`/v2/...` or a version header) and share the service layer between versions — only the serialization differs.',
      'Emit `Deprecation`/`Sunset` headers on v1 and log usage per client version.',
      'Coordinate with the mobile team: a minimum supported app version / forced-upgrade flag.',
      'Remove v1 only when traffic is near zero; contract tests protect each version\'s shape.',
    ],
    followUp: 'URL versioning vs header versioning — trade-offs?',
    trap: 'Changing the field in place because "the web app is deployed at the same time".',
    relatedLessonIds: ['m07-api-versioning', 'm07-rest-api-design'],
  }),
  sc({
    id: 'sc-016',
    category: 'express-backend',
    difficulty: 'intermediate',
    topic: 'Long-running requests',
    question: 'Generating a monthly report takes 2–4 minutes. The load balancer cuts requests at 60 s and users retry, creating even more load. How do you redesign the endpoint?',
    shortAnswer: 'Make it asynchronous: `POST /reports` enqueues a job and returns `202 Accepted` with a job ID; a worker builds the report; the client polls `GET /reports/:id` (or gets a webhook/notification) and downloads the result from storage.',
    detailedAnswer: [
      'Do not just raise timeouts — long requests tie up connections and break on deploys.',
      'Enqueue the work (e.g. BullMQ on Redis) and return 202 with a status URL.',
      'Use an idempotency key or "one active job per user+month" so retries do not create duplicate jobs.',
      'Workers run separately from the API, with concurrency limits and retries; store the file in object storage.',
      'Expose job status (`queued`, `running`, `done`, `failed`) and progress; notify via email/WebSocket when done.',
      'Cache finished reports for repeated requests.',
    ],
    followUp: 'How do you avoid a worker running the same job twice if it crashes halfway?',
    trap: 'Increasing the LB timeout to 5 minutes and calling it done.',
    relatedLessonIds: ['m11-background-jobs', 'm11-bullmq', 'm07-http-status-codes'],
  }),
  sc({
    id: 'sc-017',
    category: 'advanced',
    difficulty: 'advanced',
    topic: 'Leaked JWT secret',
    question: 'The HS256 secret used to sign JWTs was accidentally committed to a public repository a week ago. What do you do, now and long term?',
    shortAnswer: 'Treat it as a full auth compromise: rotate the secret (invalidating all tokens), force re-login, purge it from git history, investigate token forgeries, and move to managed secrets with key IDs and ideally asymmetric keys.',
    detailedAnswer: [
      'Anyone with the secret can mint tokens for any user/role — assume forgery is possible.',
      'Generate a new strong secret in a secrets manager and deploy it; all existing tokens become invalid, so users must log in again (and revoke refresh tokens).',
      'Investigate: search logs for tokens with unusual claims, admin actions, or `iat` values that do not match real logins.',
      'Remove it from the repo history (and consider the secret burned anyway — forks and caches exist); enable secret scanning in CI.',
      'Long term: use RS256/EdDSA so services only hold the public key; include a `kid` header so keys can be rotated with overlap; load secrets from a vault, not `.env` files in the repo.',
    ],
    followUp: 'How does a `kid` header plus a JWKS endpoint enable zero-downtime key rotation?',
    trap: 'Only deleting the commit — the secret is already public and still valid.',
    relatedLessonIds: ['m12-secrets-management', 'm10-jwt', 'm12-environment-variables'],
  }),
  sc({
    id: 'sc-018',
    category: 'advanced',
    difficulty: 'advanced',
    topic: 'SSRF',
    question: 'You are building a "fetch preview for this URL" feature (and webhooks with user-provided URLs). Security warns about SSRF. How do you implement it safely in Node?',
    shortAnswer: 'Treat outbound fetches to user URLs as hostile: allow only http(s), resolve the hostname and block private/link-local/metadata ranges (checking the IP actually connected to), disable or re-validate redirects, and run it from an isolated egress with timeouts and size limits.',
    detailedAnswer: [
      'Threat: an attacker points the URL at `http://169.254.169.254/` (cloud metadata), `localhost:6379`, or internal admin services.',
      'Parse with `new URL()`, allow only `http:`/`https:`, and optionally restrict ports.',
      'Resolve DNS and reject private (10/8, 172.16/12, 192.168/16), loopback, link-local and IPv6 equivalents; enforce it at connect time (custom `lookup`) to defeat DNS rebinding.',
      'Do not follow redirects automatically (`redirect: "manual"`), or re-validate each hop.',
      'Apply strict timeouts (`AbortSignal.timeout`), max response size, and no forwarding of internal credentials/headers.',
      'Defence in depth: run fetchers in a separate network segment/egress proxy with an allow/deny list; enable IMDSv2 on cloud hosts.',
    ],
    followUp: 'What is DNS rebinding and why does validating the hostname once not stop it?',
    trap: 'Blocking the string "localhost" and calling it done (`127.1`, `[::1]`, decimal IPs and DNS names bypass it).',
    relatedLessonIds: ['m12-ssrf', 'm12-input-validation', 'm12-owasp-top-10'],
  }),
  sc({
    id: 'sc-019',
    category: 'advanced',
    difficulty: 'advanced',
    topic: 'Idempotency keys',
    question: 'Customers are occasionally charged twice. Logs show the mobile app retried `POST /payments` after a timeout, while the first request had actually succeeded. How do you prevent duplicate charges?',
    shortAnswer: 'Make the endpoint idempotent: the client sends an `Idempotency-Key` per logical payment; the server stores the key with the request hash and result atomically, and replays the stored result for retries.',
    detailedAnswer: [
      'Client generates a UUID per payment attempt and reuses it on every retry of that attempt.',
      'Server inserts the key into an `idempotency_keys` table with a unique constraint *before* doing the work (status `in_progress`).',
      'Concurrent duplicate → unique violation → return 409 "in progress" (or wait); completed duplicate → return the stored status/body.',
      'Store a hash of the request body; reusing a key with a different body is a 422 error.',
      'Pass an idempotency key to the payment provider too, so their side also deduplicates; keep keys for 24 h+ and clean up.',
      'Prevent the root cause from hurting elsewhere: retries with backoff + jitter only on idempotent operations.',
    ],
    code: {
      language: 'sql',
      code: `
        CREATE TABLE idempotency_keys (
          key          text PRIMARY KEY,
          user_id      bigint NOT NULL,
          request_hash text NOT NULL,
          status       text NOT NULL,      -- in_progress | completed
          response     jsonb,
          created_at   timestamptz NOT NULL DEFAULT now()
        );
      `,
    },
    followUp: 'What happens if the server crashes after charging but before saving the response?',
    trap: 'Deduplicating by "same user, same amount within 5 seconds" — it blocks legitimate payments and misses slow retries.',
    relatedLessonIds: ['m07-http-methods', 'm09-transactions', 'm07-rest-api-design'],
  }),
  sc({
    id: 'sc-020',
    category: 'advanced',
    difficulty: 'advanced',
    topic: 'Distributed rate limiter',
    question: 'Design rate limiting for a public API: 1,000 requests/minute per API key, enforced across 20 Node instances, with low latency overhead.',
    shortAnswer: 'Keep counters in Redis with an atomic algorithm (token bucket or sliding window via a Lua script), keyed by API key, return standard 429 headers, and decide in advance whether to fail open or closed if Redis is down.',
    detailedAnswer: [
      'Per-instance in-memory counters give 20× the intended limit — the state must be shared.',
      'Token bucket: store `tokens` and `lastRefill` per key; a Lua script refills and decrements atomically in one round trip.',
      'Sliding-window counter (current + previous window weighted) is a cheap approximation that avoids fixed-window bursts at boundaries.',
      'Return `429` with `Retry-After` and `RateLimit-Limit/Remaining/Reset` headers.',
      'Latency: one Redis call (~sub-ms in-region); optionally use a small local token cache per instance for very hot keys.',
      'Failure policy: fail open (allow) for availability or closed for expensive endpoints; set tight Redis timeouts either way.',
      'Layer it: coarse IP limits at the edge, per-key quotas in the app, per-tenant concurrency limits for expensive jobs.',
    ],
    followUp: 'How would you support different limits per pricing plan and per endpoint?',
    trap: 'Using `GET` then `SET` from Node (two calls, race conditions) instead of an atomic operation.',
    relatedLessonIds: ['m07-rate-limiting', 'm11-redis', 'm14-horizontal-scaling'],
  }),
];
