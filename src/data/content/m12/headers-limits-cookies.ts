import type { ModuleContent } from '../../../types';
import { bullets, code, dedent, diagram, flow, interviewTip, note, section, steps, table, text, tip, warn } from '../helpers';

const content: Partial<ModuleContent> = {
  helmet: {
    summary: 'Helmet is a third-party Express middleware that sets a bundle of security-related HTTP response headers (CSP, HSTS, nosniff, frame protection…) with sensible defaults you can tune.',
    topics: ['Helmet', 'security headers', 'Content-Security-Policy', 'Strict-Transport-Security', 'X-Content-Type-Options', 'X-Frame-Options', 'X-Powered-By'],
    sections: [
      section('introduction', undefined,
        text('Browsers have many built-in protections that switch on only when the server asks via a response header. Helmet sets those headers for you in one line.'),
      ),
      section('definition', 'What Helmet is',
        text('`helmet` is an npm package (not part of Node or Express) that exports a middleware composed of ~a dozen smaller header middlewares. `app.use(helmet())` enables its defaults.'),
        table('Headers Helmet sets by default (Helmet 7/8)', ['Header', 'Default value', 'Protects against'], [
          ['Content-Security-Policy', "`default-src 'self'; script-src 'self'; object-src 'none'; …`", 'XSS, data injection, clickjacking (`frame-ancestors`)'],
          ['Strict-Transport-Security', '`max-age=31536000; includeSubDomains`', 'SSL stripping / downgrade (HTTPS only)'],
          ['X-Content-Type-Options', '`nosniff`', 'MIME sniffing (JSON/text treated as HTML/JS)'],
          ['X-Frame-Options', '`SAMEORIGIN`', 'Clickjacking in old browsers'],
          ['Referrer-Policy', '`no-referrer`', 'Leaking URLs (tokens in query) to other sites'],
          ['Cross-Origin-Opener-Policy', '`same-origin`', 'Cross-window attacks (e.g. XS-Leaks)'],
          ['Cross-Origin-Resource-Policy', '`same-origin`', 'Other sites embedding your resources'],
          ['Origin-Agent-Cluster', '`?1`', 'Process isolation hint'],
          ['X-DNS-Prefetch-Control', '`off`', 'Privacy leak via DNS prefetch'],
          ['X-Permitted-Cross-Domain-Policies', '`none`', 'Legacy Flash/PDF cross-domain'],
          ['X-XSS-Protection', '`0`', 'Disables the buggy legacy XSS auditor'],
          ['X-Powered-By', '*removed*', 'Fingerprinting ("Express")'],
        ]),
        note('Exact defaults change between major versions (e.g. HSTS max-age was 180 days in Helmet 7, one year in Helmet 8). Check the README for your installed version.'),
      ),
      section('why', 'Why use it',
        bullets(
          'Headers are cheap, one-time configuration with large impact (A05 Security Misconfiguration).',
          'Easy to forget individually; Helmet makes the secure choice the default.',
          'It does **not** fix vulnerable code — it adds browser-side safety nets.',
        ),
      ),
      section('internals', 'How it works',
        steps(
          '`helmet(options)` returns one middleware that calls each sub-middleware in order.',
          'Each sub-middleware calls `res.setHeader(...)` (or `res.removeHeader("X-Powered-By")`) and then `next()`.',
          'Headers are sent with whatever response your route produces — including error pages if Helmet runs first.',
          'Each sub-middleware can be disabled (`helmet({ crossOriginEmbedderPolicy: false })`) or configured.',
        ),
        diagram('middleware-pipeline', 'Mount Helmet early so every response — including 404s and errors — gets the headers.'),
      ),
      section('example', 'Configuring Helmet',
        code({
          title: 'Before vs after (curl -I)',
          code: dedent(`
            import express from 'express';
            import helmet from 'helmet'; // third-party: npm i helmet

            const app = express();
            app.use(helmet());
            app.get('/', (req, res) => res.send('ok'));
            app.listen(3000);
          `),
          expectedOutput: dedent(`
            $ curl -sI http://localhost:3000/
            HTTP/1.1 200 OK
            Content-Security-Policy: default-src 'self';base-uri 'self';font-src 'self' https: data:;form-action 'self';frame-ancestors 'self';img-src 'self' data:;object-src 'none';script-src 'self';script-src-attr 'none';style-src 'self' https: 'unsafe-inline';upgrade-insecure-requests
            Cross-Origin-Opener-Policy: same-origin
            Cross-Origin-Resource-Policy: same-origin
            Origin-Agent-Cluster: ?1
            Referrer-Policy: no-referrer
            Strict-Transport-Security: max-age=31536000; includeSubDomains
            X-Content-Type-Options: nosniff
            X-DNS-Prefetch-Control: off
            X-Download-Options: noopen
            X-Frame-Options: SAMEORIGIN
            X-Permitted-Cross-Domain-Policies: none
            X-XSS-Protection: 0
            Content-Type: text/html; charset=utf-8
          `),
          explanation: [
            'Without Helmet you would see `X-Powered-By: Express` and none of the security headers.',
            'The default CSP is strict: only same-origin scripts; inline `<script>` blocks are refused.',
            'HSTS is ignored by browsers over plain HTTP; it takes effect once served over HTTPS.',
          ],
        }),
        code({
          title: 'Custom CSP with a per-request nonce',
          code: dedent(`
            import crypto from 'node:crypto';

            app.use((req, res, next) => {
              res.locals.cspNonce = crypto.randomBytes(16).toString('base64');
              next();
            });

            app.use(helmet({
              contentSecurityPolicy: {
                directives: {
                  defaultSrc: ["'self'"],
                  scriptSrc: ["'self'", (req, res) => \`'nonce-\${res.locals.cspNonce}'\`],
                  connectSrc: ["'self'", 'https://api.example.com'],
                  imgSrc: ["'self'", 'data:', 'https://cdn.example.com'],
                  frameAncestors: ["'none'"],
                },
                // reportOnly: true,   // roll out safely first
              },
              crossOriginEmbedderPolicy: false, // example of disabling one header
            }));

            // In the template: <script nonce="<%= cspNonce %>">...</script>
          `),
          expectedOutput: "Content-Security-Policy: default-src 'self';script-src 'self' 'nonce-3q2+7w==...';connect-src 'self' https://api.example.com;img-src 'self' data: https://cdn.example.com;frame-ancestors 'none';...",
          explanation: [
            'Directive values can be functions, so the nonce changes on every response.',
            'Only `<script>` tags carrying the matching nonce run; injected ones are blocked.',
            '`frame-ancestors \'none\'` is the modern replacement for X-Frame-Options DENY.',
            'Start with `reportOnly: true` to collect violations before enforcing.',
          ],
        }),
      ),
      section('real-world', 'Real-world notes',
        bullets(
          'A pure JSON API benefits most from `nosniff`, HSTS, removing `X-Powered-By`, and a restrictive CSP (`default-src \'none\'`).',
          'If Nginx or a CDN already sets headers, avoid sending conflicting duplicates — pick one layer.',
          'Swagger UI / admin dashboards often need a looser CSP on just their route: mount a separate `helmet()` config there.',
        ),
        tip('`app.disable("x-powered-by")` alone removes the Express banner if you cannot add Helmet.'),
      ),
      section('mistakes', 'Common mistakes',
        bullets(
          'Thinking Helmet "secures Express" — it sets headers; injection, auth and access control are still your job.',
          'Adding `\'unsafe-inline\'` to `script-src` to silence CSP errors, which defeats XSS protection.',
          'Setting HSTS `preload` on a domain where some subdomains are still HTTP-only.',
          'Mounting Helmet after routes, so early responses miss the headers.',
        ),
      ),
      section('interview', 'Interview angle',
        interviewTip('Name 4–5 headers with what each blocks (CSP → XSS, HSTS → downgrade, nosniff → MIME sniffing, frame-ancestors → clickjacking) and stress that Helmet is third-party and defence in depth.'),
      ),
      section('practice', 'Practice',
        text('Add Helmet to an Express app serving an HTML page with an inline script. Observe the CSP error in DevTools, then fix it with a nonce instead of `unsafe-inline`.'),
      ),
      section('summary', 'Summary',
        bullets(
          'Helmet (third-party) sets security headers with one middleware.',
          'Key headers: CSP, HSTS, nosniff, frame protection, Referrer-Policy; removes X-Powered-By.',
          'Configure CSP deliberately; use nonces, avoid `unsafe-inline`.',
          'It complements, not replaces, secure code.',
        ),
      ),
    ],
    revisionNotes: [
      '`app.use(helmet())` early in the chain.',
      'CSP → XSS; HSTS → force HTTPS; nosniff → no MIME sniffing.',
      '`frame-ancestors` (CSP) supersedes X-Frame-Options.',
      'X-XSS-Protection is set to 0 (legacy auditor disabled).',
      'Defaults differ by Helmet major version.',
    ],
    quiz: [
      {
        kind: 'mcq', difficulty: 'beginner',
        prompt: 'Which header tells browsers never to treat a response as a different MIME type than declared?',
        options: ['Strict-Transport-Security', 'X-Content-Type-Options: nosniff', 'Referrer-Policy', 'Cross-Origin-Opener-Policy'],
        answer: 1,
        explanation: '`nosniff` disables MIME sniffing, so a JSON or text upload cannot be executed as script/HTML. HSTS is about HTTPS.',
      },
      {
        kind: 'scenario', difficulty: 'intermediate',
        prompt: 'After adding Helmet, your page\'s inline analytics `<script>` stops running. What is the best fix?',
        options: [
          "Add 'unsafe-inline' to script-src",
          'Disable Helmet',
          'Move the script to a file served from your origin, or add a per-request nonce to the tag and the CSP',
          'Set X-XSS-Protection: 1',
        ],
        answer: 2,
        explanation: "Nonces or external same-origin files keep CSP effective. 'unsafe-inline' or disabling Helmet removes the XSS protection; X-XSS-Protection is obsolete.",
      },
    ],
    interview: [
      {
        category: 'express-backend', kind: 'concept', difficulty: 'beginner', topic: 'Helmet',
        question: 'What does the Helmet middleware do in an Express application?',
        shortAnswer: 'It is a third-party package that sets security-related HTTP response headers — such as CSP, HSTS and nosniff — and removes X-Powered-By.',
        detailedAnswer: [
          'Composed of small middlewares, each responsible for one header.',
          'Defaults are secure; individual headers can be configured or disabled.',
          'Mitigates XSS impact, clickjacking, MIME sniffing and protocol downgrade.',
          'Does not validate input or enforce authentication.',
        ],
        followUp: 'Which Helmet header would you customise first for a React SPA, and how?',
        trap: 'Claiming Helmet prevents SQL injection or makes the app "secure".',
      },
      {
        category: 'express-backend', kind: 'concept', difficulty: 'intermediate', topic: 'Helmet',
        question: 'What is HSTS, and what risk does the preload option introduce?',
        shortAnswer: 'HSTS tells the browser to use only HTTPS for the domain for max-age seconds; preload bakes that into browsers, so any subdomain without HTTPS becomes unreachable and removal is slow.',
        detailedAnswer: [
          'Header: `Strict-Transport-Security: max-age=31536000; includeSubDomains; preload`.',
          'Only honoured when received over HTTPS.',
          'Prevents SSL-stripping on subsequent visits; preload also protects the very first visit.',
          'Removing a domain from the preload list takes months to reach users.',
        ],
        followUp: 'What is a safe rollout plan for HSTS?',
        trap: 'Thinking HSTS sent over plain HTTP has any effect.',
      },
    ],
  },

  'rate-limiting': {
    summary: 'Rate limiting caps how many requests a client may make in a time window to stop brute force, scraping and resource exhaustion; in clusters, the counters must live in a shared store like Redis.',
    topics: ['rate limiting', 'express-rate-limit', 'fixed window', 'sliding window', 'token bucket', 'Redis store', 'trust proxy', '429 Too Many Requests', 'Retry-After'],
    sections: [
      section('introduction', undefined,
        text('Without limits, one client can try a million passwords, scrape your whole catalogue or melt your database. Rate limiting says "no more than N requests per window" and answers `429` beyond that.'),
      ),
      section('definition', 'Algorithms',
        table('Common algorithms', ['Algorithm', 'How', 'Trade-off'], [
          ['Fixed window', 'Counter per key per minute; reset at window boundary', 'Simple; allows 2× burst around the boundary'],
          ['Sliding window log', 'Store each timestamp; count those in last N s', 'Accurate; memory per request'],
          ['Sliding window counter', 'Weighted mix of current and previous window', 'Good accuracy, cheap'],
          ['Token bucket', 'Bucket refills at r tokens/s up to capacity b; each request takes 1', 'Allows controlled bursts; common in gateways'],
          ['Leaky bucket', 'Queue drained at constant rate', 'Smooths traffic; adds latency'],
        ]),
      ),
      section('why', 'Why you need it',
        bullets(
          'Brute force / credential stuffing on `/login`, `/reset-password`, OTP verification (A07).',
          'Cost control: expensive endpoints (search, exports, LLM calls).',
          'Fair use between tenants; protects downstream services.',
          'It is **not** a DDoS solution — volumetric attacks must be absorbed upstream (CDN/WAF).',
        ),
      ),
      section('internals', 'How a limiter decides',
        steps(
          'Derive a **key**: IP address, user id, API key, or a combination (`login:<ip>:<email>`).',
          'Atomically increment the counter for the key in the store (memory, Redis `INCR` + `EXPIRE`).',
          'If the count exceeds the limit → respond `429` with `Retry-After` and `RateLimit-*` headers.',
          'Otherwise call `next()`.',
        ),
        flow([
          'Request',
          'Key = user id or client IP',
          'Redis INCR key (+ EXPIRE)',
          'count ≤ limit → next()',
          'count > limit → 429 + Retry-After',
        ], { title: 'Distributed rate limiting', direction: 'horizontal' }),
        warn('**Trust proxy gotcha**: behind Nginx/a load balancer, `req.ip` is the proxy\'s IP unless you set `app.set("trust proxy", 1)` (number of hops). Then *every* user shares one bucket. Setting `trust proxy` to `true` blindly is also wrong — clients can spoof `X-Forwarded-For` and get a fresh bucket per request.'),
      ),
      section('example', 'Implementations',
        code({
          title: 'Token bucket (pure JS, simulated clock)',
          runnable: true,
          code: dedent(`
            function createBucket({ capacity, refillPerSec }) {
              const buckets = new Map();
              return function take(key, nowMs) {
                const b = buckets.get(key) ?? { tokens: capacity, last: nowMs };
                b.tokens = Math.min(capacity, b.tokens + ((nowMs - b.last) / 1000) * refillPerSec);
                b.last = nowMs;
                const allowed = b.tokens >= 1;
                if (allowed) b.tokens -= 1;
                buckets.set(key, b);
                return allowed;
              };
            }

            const take = createBucket({ capacity: 3, refillPerSec: 1 });
            const results = [0, 100, 200, 300, 400, 1500].map((t) => t + 'ms:' + (take('ip-1', t) ? 'ok' : '429'));
            console.log(results.join(' '));
          `),
          expectedOutput: '0ms:ok 100ms:ok 200ms:ok 300ms:429 400ms:429 1500ms:ok',
          explanation: [
            'A full bucket of 3 allows a burst of three requests.',
            'At 300 ms and 400 ms only ~0.3–0.4 tokens have refilled → rejected.',
            'By 1500 ms more than one token has refilled → allowed again.',
          ],
        }),
        code({
          title: 'express-rate-limit with Redis (both third-party)',
          code: dedent(`
            import rateLimit from 'express-rate-limit';      // npm i express-rate-limit
            import { RedisStore } from 'rate-limit-redis';   // npm i rate-limit-redis
            import { createClient } from 'redis';

            const redis = createClient({ url: process.env.REDIS_URL });
            await redis.connect();

            app.set('trust proxy', 1); // exactly one proxy (e.g. the load balancer) in front of us

            const apiLimiter = rateLimit({
              windowMs: 60_000,
              limit: 100,                       // 'max' in older versions
              standardHeaders: 'draft-7',       // RateLimit-* headers
              legacyHeaders: false,             // no X-RateLimit-*
              keyGenerator: (req) => req.user?.id ?? req.ip, // per-user when authenticated
              store: new RedisStore({ sendCommand: (...args) => redis.sendCommand(args) }),
            });

            const loginLimiter = rateLimit({
              windowMs: 15 * 60_000,
              limit: 5,
              skipSuccessfulRequests: true,     // only failed attempts count
              message: { error: 'Too many login attempts, try later' },
              store: new RedisStore({ prefix: 'rl:login:', sendCommand: (...args) => redis.sendCommand(args) }),
            });

            app.use('/api', apiLimiter);
            app.post('/login', loginLimiter, loginHandler);
          `),
          expectedOutput: 'HTTP/1.1 429 Too Many Requests\nRateLimit: limit=5, remaining=0, reset=842\nRetry-After: 842\n\n{"error":"Too many login attempts, try later"}',
          explanation: [
            'The default memory store is per process: 4 instances = 4× the limit. Redis shares one counter.',
            'Authenticated routes key by user id (fair, not shared behind NAT); anonymous routes fall back to IP.',
            'Login limiter counts only failures, so legitimate users are not locked out by success.',
            'Option names (`limit` vs `max`, header formats) vary across express-rate-limit versions.',
          ],
        }),
      ),
      section('real-world', 'Design choices',
        table('Per-IP vs per-user', ['Key', 'Good for', 'Weakness'], [
          ['IP', 'Anonymous routes, login, signup', 'Many users behind one NAT/office; attackers rotate IPs'],
          ['User / API key', 'Authenticated APIs, quotas, billing', 'Does not protect pre-auth endpoints'],
          ['IP + account', 'Login: limit per target account and per source', 'More keys to store'],
        ]),
        bullets(
          'Layer limits: CDN/WAF (volumetric) → gateway/Nginx `limit_req` → app (business rules).',
          'For login, also add per-account backoff and CAPTCHA after N failures rather than hard lockout (lockout enables DoS of victims).',
          'Return `429` with `Retry-After`; clients should back off exponentially.',
        ),
      ),
      section('mistakes', 'Common mistakes',
        bullets(
          'Memory store in a multi-instance deployment.',
          'Missing or wrong `trust proxy` → everyone shares the proxy IP, or IPs are spoofable.',
          'Rate limiting only `/login` but not `/forgot-password` or OTP verification.',
          'Non-atomic read-then-write counters in Redis (use `INCR`, Lua, or the store library).',
        ),
      ),
      section('interview', 'Interview angle',
        interviewTip('Interviewers love: "Your API runs on 6 pods — how do you rate limit?" Answer: shared store (Redis INCR/EXPIRE or token bucket in Lua), key choice, trust proxy, and 429 + Retry-After.'),
      ),
      section('practice', 'Practice',
        text('Implement a fixed-window limiter with Redis: `INCR key`; if the result is 1 set `EXPIRE key 60`; reject when > limit. Then explain why using a `MULTI` transaction or Lua script matters.'),
      ),
      section('summary', 'Summary',
        bullets(
          'Limit by key (IP, user, API key) per window; reply 429 + Retry-After.',
          'Token bucket allows bursts; fixed window is simplest.',
          'Multiple instances → shared store (Redis).',
          'Configure `trust proxy` to the exact hop count.',
          'express-rate-limit / rate-limit-redis are third-party packages.',
        ),
      ),
    ],
    revisionNotes: [
      '429 Too Many Requests + `Retry-After`.',
      'Memory store is per process → Redis for clusters.',
      '`app.set("trust proxy", 1)` behind one proxy; never blindly `true`.',
      'Per-user for authenticated APIs; per-IP (+account) for login.',
      'Rate limiting ≠ DDoS protection.',
    ],
    quiz: [
      {
        kind: 'scenario', difficulty: 'intermediate',
        prompt: 'Behind an AWS load balancer, your rate limiter blocks all users after 100 total requests per minute. Why?',
        options: [
          'Redis is down',
          '`trust proxy` is not set, so `req.ip` is the load balancer\'s IP for every request',
          'The window is too short',
          'express-rate-limit only supports one user',
        ],
        answer: 1,
        explanation: 'Without `trust proxy`, Express ignores `X-Forwarded-For` and every request appears to come from the balancer, sharing one bucket.',
      },
      {
        kind: 'find-bug', difficulty: 'advanced',
        prompt: 'The app runs on 4 instances. What is wrong?',
        code: "app.use(rateLimit({ windowMs: 60_000, limit: 60 }));",
        options: [
          'windowMs must be in seconds',
          'Default memory store is per process — the effective limit is up to 240/min and resets on deploy',
          'limit must be a string',
          'rateLimit must be mounted after routes',
        ],
        answer: 1,
        explanation: 'Each instance keeps its own in-memory counters. Use a shared store (Redis/Memcached) so all instances see the same count.',
      },
      {
        kind: 'predict-output', difficulty: 'intermediate',
        prompt: 'A token bucket has capacity 2 and refills 1 token/second. Requests arrive at t=0s, 0.1s, 0.2s, 1.3s. Which are allowed?',
        options: ['All four', 'First two and the last', 'Only the first', 'First three'],
        answer: 1,
        explanation: 'Two tokens allow the burst at 0 and 0.1 s; at 0.2 s only 0.2 tokens refilled → rejected; by 1.3 s about 1.3 tokens have refilled → allowed.',
      },
    ],
    interview: [
      {
        category: 'advanced', kind: 'scenario', difficulty: 'advanced', topic: 'Rate limiting',
        question: 'Design rate limiting for a public API running on many stateless instances behind a load balancer.',
        shortAnswer: 'Keep counters in a shared low-latency store such as Redis using an atomic algorithm (token bucket or sliding window in a Lua script), key by API key or user with IP fallback, configure trust proxy correctly, and return 429 with Retry-After.',
        detailedAnswer: [
          'Atomicity: `INCR`+`EXPIRE` in `MULTI`, or a Lua script for token bucket so check-and-decrement is one operation.',
          'Key: API key/user id for quotas; IP (from a trusted X-Forwarded-For hop) for anonymous traffic.',
          'Layering: edge/WAF for volumetric floods, gateway for coarse limits, app for business limits.',
          'Failure mode: decide fail-open vs fail-closed if Redis is unavailable (often fail-open with alerting).',
          'Expose `RateLimit-*` headers so clients can self-throttle.',
        ],
        followUp: 'How does a sliding window counter approximate a true sliding window?',
        trap: 'Using in-memory counters per instance.',
      },
      {
        category: 'express-backend', kind: 'concept', difficulty: 'intermediate', topic: 'Rate limiting',
        question: 'Why can rate limiting by IP alone be both too strict and too weak?',
        shortAnswer: 'Too strict because many legitimate users share an IP behind NAT or corporate proxies; too weak because attackers rotate through botnets or proxies to get fresh IPs.',
        detailedAnswer: [
          'Mobile carriers use carrier-grade NAT; a university may present one IP.',
          'Credential stuffing tools distribute attempts across thousands of IPs.',
          'Combine keys: per-account failure counters, per-IP, device fingerprint, CAPTCHA.',
          'IPv6 users can get many addresses — limit on a /64 prefix.',
        ],
        followUp: 'How would you protect a login endpoint from distributed credential stuffing?',
        trap: 'Assuming one IP equals one user.',
      },
    ],
  },

  'secure-cookies': {
    summary: 'Secure session cookies combine HttpOnly (no JS access), Secure (HTTPS only), SameSite (cross-site control), tight scope (Path/Domain or the __Host- prefix) and sensible expiry.',
    topics: ['cookies', 'HttpOnly', 'Secure', 'SameSite', '__Host- prefix', 'signed cookies', 'Max-Age', 'session fixation'],
    sections: [
      section('introduction', undefined,
        text('A session cookie is a bearer credential: whoever holds it *is* the user. Cookie attributes decide who can read it, when it is sent and how long it lives.'),
      ),
      section('definition', 'Cookie attributes',
        table('Security attributes', ['Attribute', 'Effect', 'Protects against'], [
          ['HttpOnly', 'Not readable from `document.cookie`', 'Token theft via XSS (not XSS itself)'],
          ['Secure', 'Only sent over HTTPS', 'Sniffing on plain HTTP / downgrade'],
          ['SameSite=Lax/Strict', 'Not sent on cross-site subrequests', 'CSRF'],
          ['Path / Domain', 'Where the cookie is sent; omitting Domain = host-only', 'Leaking to other subdomains'],
          ['Max-Age / Expires', 'Lifetime; absent = session cookie (until browser closes… usually)', 'Long-lived stolen sessions'],
          ['`__Host-` prefix', 'Browser requires Secure, Path=/, no Domain', 'Subdomain cookie overwrite (cookie tossing)'],
          ['`__Secure-` prefix', 'Browser requires Secure', 'Setting from HTTP pages'],
        ]),
      ),
      section('why', 'Why each attribute matters',
        bullets(
          'Without `Secure`, one HTTP request on café Wi-Fi exposes the cookie.',
          'Without `HttpOnly`, any XSS can exfiltrate the session for later use from anywhere.',
          'With `Domain=example.com`, every subdomain (including a forgotten marketing site) receives it.',
        ),
      ),
      section('internals', 'How the browser handles a cookie',
        steps(
          'Server sends `Set-Cookie: __Host-sid=abc; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=3600`.',
          'Browser validates prefix rules and stores the cookie in its jar keyed by host + path.',
          'On every later request it checks: scheme (Secure), host/path match, SameSite context, expiry.',
          'If all pass, it adds `Cookie: __Host-sid=abc` — the server never sees attributes, only the name/value.',
        ),
        flow([
          'Login OK',
          'Regenerate session id',
          'Set-Cookie with HttpOnly; Secure; SameSite',
          'Browser stores',
          'Sends only on matching HTTPS same-site requests',
        ], { title: 'Session cookie lifecycle', direction: 'horizontal' }),
      ),
      section('example', 'Vulnerable vs fixed',
        code({
          title: 'Serialising a Set-Cookie header (pure JS)',
          runnable: true,
          code: dedent(`
            function serialize(name, value, o = {}) {
              const parts = [name + '=' + encodeURIComponent(value)];
              if (o.maxAge != null) parts.push('Max-Age=' + Math.floor(o.maxAge));
              if (o.domain) parts.push('Domain=' + o.domain);
              parts.push('Path=' + (o.path ?? '/'));
              if (o.secure) parts.push('Secure');
              if (o.httpOnly) parts.push('HttpOnly');
              if (o.sameSite) parts.push('SameSite=' + o.sameSite);
              return parts.join('; ');
            }
            console.log(serialize('sid', 'abc123'));
            console.log(serialize('__Host-sid', 'abc123', { maxAge: 3600, secure: true, httpOnly: true, sameSite: 'Lax' }));
          `),
          expectedOutput: 'sid=abc123; Path=/\n__Host-sid=abc123; Max-Age=3600; Path=/; Secure; HttpOnly; SameSite=Lax',
          explanation: [
            'The first cookie is readable by JS, sent over HTTP, and relies on browser SameSite defaults.',
            'The second satisfies the `__Host-` prefix rules (Secure, Path=/, no Domain).',
            'Note `Max-Age` in the header is **seconds**.',
          ],
        }),
        code({
          title: 'Express: VULNERABLE vs FIXED',
          code: dedent(`
            // ❌ VULNERABLE
            res.cookie('token', jwt);                                  // readable by JS, HTTP allowed
            res.cookie('role', 'admin');                               // trusting a client-editable value

            // ✅ FIXED
            app.set('trust proxy', 1); // so req.secure is true behind a TLS-terminating proxy
            res.cookie('__Host-sid', sessionId, {
              httpOnly: true,
              secure: true,
              sameSite: 'lax',
              path: '/',
              maxAge: 60 * 60 * 1000,     // Express: milliseconds → header Max-Age=3600
            });

            // express-session (third-party): regenerate id on login to prevent session fixation
            app.post('/login', async (req, res, next) => {
              const user = await authenticate(req.body);
              req.session.regenerate((err) => {
                if (err) return next(err);
                req.session.userId = user.id;
                res.json({ ok: true });
              });
            });

            // Logout: destroy server-side and clear with the SAME attributes
            res.clearCookie('__Host-sid', { path: '/', secure: true, httpOnly: true, sameSite: 'lax' });
          `),
          expectedOutput: 'Set-Cookie: __Host-sid=s%3Aabc...; Max-Age=3600; Path=/; Expires=Sun, 08 Nov 2026 13:00:00 GMT; HttpOnly; Secure; SameSite=Lax',
          explanation: [
            'Express `maxAge` is in milliseconds, unlike the header — a classic off-by-1000 bug.',
            'Never store authorisation data (role) in a plain cookie; keep it server-side or in a signed/verified token.',
            '`regenerate` issues a new session id after login so a pre-planted id becomes useless.',
            '`clearCookie` must match path/domain or the browser keeps the original cookie.',
          ],
        }),
      ),
      section('real-world', 'Real-world guidance',
        bullets(
          'Session id cookie: random ≥128 bits, `__Host-`, HttpOnly, Secure, SameSite=Lax, idle + absolute timeouts.',
          'Signed cookies (`cookie-parser` with a secret — third-party) detect tampering but are **not encrypted**; do not put secrets in them.',
          'For a SPA + API on different sites you may need `SameSite=None; Secure` — then add CSRF protection.',
          'Rotate the session on privilege change (login, password change, role elevation).',
        ),
        note('Cookie storage vs localStorage for tokens: HttpOnly cookies cannot be read by XSS but need CSRF defences; localStorage tokens are CSRF-proof but fully exposed to XSS.'),
      ),
      section('mistakes', 'Common mistakes',
        bullets(
          'Passing `maxAge: 3600` to Express thinking it is seconds (that is 3.6 s).',
          'Setting `secure: true` behind a proxy without `trust proxy` — express-session then refuses to set the cookie because `req.secure` is false.',
          '`Domain=.example.com` when a host-only cookie would do.',
          'Not invalidating the server-side session on logout.',
        ),
      ),
      section('interview', 'Interview angle',
        interviewTip('List the attributes and what each defends, then add the nuance: "HttpOnly stops token theft, not XSS; SameSite helps CSRF; __Host- prevents subdomain overwrites; regenerate on login."'),
      ),
      section('practice', 'Practice',
        text('Inspect cookies on three sites you use in DevTools → Application → Cookies. Note which use HttpOnly, Secure, SameSite and prefixes, and which session cookie you would harden first.'),
      ),
      section('summary', 'Summary',
        bullets(
          'HttpOnly + Secure + SameSite are the baseline for session cookies.',
          'Prefer host-only cookies; use the `__Host-` prefix.',
          'Express `maxAge` is milliseconds.',
          'Regenerate session ids on login; destroy on logout.',
          'Signed ≠ encrypted.',
        ),
      ),
    ],
    revisionNotes: [
      'HttpOnly → no JS read; Secure → HTTPS only; SameSite → cross-site control.',
      '`__Host-`: Secure + Path=/ + no Domain.',
      'Express `res.cookie` maxAge = ms; header Max-Age = s.',
      'Session fixation → `req.session.regenerate()` after login.',
      '`clearCookie` needs matching path/domain.',
    ],
    quiz: [
      {
        kind: 'find-bug', difficulty: 'intermediate',
        prompt: 'The session should last one hour. What is wrong?',
        code: "res.cookie('sid', id, { httpOnly: true, secure: true, sameSite: 'lax', maxAge: 3600 });",
        options: [
          'sameSite must be uppercase',
          'Express maxAge is in milliseconds, so this cookie lasts 3.6 seconds',
          'httpOnly blocks the cookie from being sent',
          'secure cookies cannot have maxAge',
        ],
        answer: 1,
        explanation: 'Express converts `maxAge` (ms) to the header `Max-Age` (s). Use `60 * 60 * 1000`.',
      },
      {
        kind: 'mcq', difficulty: 'beginner',
        prompt: 'Which attribute ensures a cookie is never sent over plain HTTP?',
        options: ['HttpOnly', 'SameSite=Strict', 'Secure', 'Path=/'],
        answer: 2,
        explanation: '`Secure` restricts sending to HTTPS. `HttpOnly` only hides it from JavaScript.',
      },
      {
        kind: 'mcq', difficulty: 'advanced',
        prompt: 'What does the `__Host-` cookie name prefix guarantee?',
        options: [
          'The cookie is encrypted',
          'The cookie was set with Secure, Path=/ and no Domain, so subdomains cannot set or overwrite it',
          'The cookie is HttpOnly',
          'The cookie never expires',
        ],
        answer: 1,
        explanation: 'Browsers reject `__Host-` cookies that are not Secure, have a Domain attribute, or a Path other than `/`. It says nothing about HttpOnly or encryption.',
      },
    ],
    interview: [
      {
        category: 'express-backend', kind: 'concept', difficulty: 'beginner', topic: 'Cookies',
        question: 'What do the HttpOnly, Secure and SameSite cookie attributes each do?',
        shortAnswer: 'HttpOnly hides the cookie from JavaScript, Secure sends it only over HTTPS, and SameSite controls whether it is sent on cross-site requests.',
        detailedAnswer: [
          'HttpOnly limits the damage of XSS (no `document.cookie` theft).',
          'Secure prevents exposure on unencrypted connections.',
          'SameSite Strict/Lax/None mitigates CSRF.',
          'Use all three for session cookies.',
        ],
        followUp: 'Does HttpOnly prevent XSS?',
        trap: 'Saying HttpOnly encrypts the cookie or prevents XSS.',
      },
      {
        category: 'advanced', kind: 'concept', difficulty: 'advanced', topic: 'Cookies',
        question: 'What is session fixation and how do you prevent it in an Express app?',
        shortAnswer: 'The attacker gets the victim to use a session id the attacker already knows, then waits for them to log in; prevent it by issuing a brand-new session id at login (`req.session.regenerate`).',
        detailedAnswer: [
          'Attack vector: planting a cookie via a subdomain, URL-based session ids, or a shared machine.',
          'If the id is not rotated on login, the attacker\'s known id becomes authenticated.',
          'Regenerate on every privilege change; destroy on logout.',
          '`__Host-` prefix stops subdomains from planting the cookie.',
        ],
        followUp: 'How would you implement absolute and idle session timeouts?',
        trap: 'Only rotating ids on logout.',
      },
    ],
  },
};

export default content;
