import type { ModuleContent } from '../../../types';
import {
  bullets, code, dedent, diagram, flow, interviewTip, section, steps, table, text,
} from '../helpers';

const content: Partial<ModuleContent> = {
  // ───────────────────────────────────────────────────────────
  'access-tokens': {
    summary: 'An access token is a short-lived credential (often a JWT, sometimes opaque) sent on every API request — usually as `Authorization: Bearer <token>` — that the API verifies to identify the caller and their scopes.',
    topics: ['access token', 'Bearer', 'Authorization header', 'opaque token', 'self-contained token', 'token introspection', 'scopes', 'short-lived'],
    sections: [
      section('introduction', undefined,
        text('After login, the client needs something to prove identity on each request without resending the password. That something is the access token.'),
      ),
      section('definition', 'Definition',
        bullets(
          'A **bearer** credential: whoever holds it can use it — like cash.',
          'Short lifetime (typically 5–15 minutes) to limit damage if stolen.',
          'Sent as `Authorization: Bearer eyJ...` (RFC 6750) or in an HttpOnly cookie for browser apps.',
          'Carries or references: subject, scopes/roles, audience, expiry.',
        ),
        table('Self-contained (JWT) vs opaque', ['', 'JWT access token', 'Opaque token'], [
          ['Format', 'Signed claims', 'Random string (e.g. 32 bytes)'],
          ['Verification', 'Locally with key — no DB call', 'Lookup in DB/Redis or introspection endpoint (RFC 7662)'],
          ['Revocation', 'Hard before `exp`', 'Delete the record — instant'],
          ['Size', 'Hundreds of bytes+', 'Small'],
          ['Best for', 'Distributed APIs, microservices', 'Single backend, strong revocation needs'],
        ]),
      ),
      section('why', 'Why short-lived',
        bullets(
          'Stateless tokens cannot easily be revoked, so short expiry bounds the risk window.',
          'Permissions change (role removed, user banned) — a fresh token picks them up.',
          'Pair with a refresh token (next lesson) so users are not logged out every 15 minutes.',
        ),
      ),
      section('internals', 'Lifecycle',
        diagram('jwt-flow', 'Login returns an access token (short) and a refresh token (long).'),
        steps(
          'Login succeeds → server signs an access token with `sub`, `scope`, `aud`, `exp`.',
          'Client stores it (memory for SPAs, or HttpOnly cookie) and attaches it to each request.',
          'API middleware verifies signature + claims → `req.user`.',
          'On 401 `TOKEN_EXPIRED`, the client calls the refresh endpoint and retries once.',
        ),
      ),
      section('example', 'Issuing and using an access token',
        code({
          title: 'Issue on login',
          code: dedent(`
            const jwt = require('jsonwebtoken');

            function issueAccessToken(user) {
              return jwt.sign(
                { scope: user.scopes.join(' '), role: user.role },
                process.env.JWT_SECRET,
                { algorithm: 'HS256', subject: String(user.id), audience: 'api', issuer: 'auth.example.com', expiresIn: '10m' },
              );
            }

            app.post('/auth/login', async (req, res) => {
              const user = await authService.verifyCredentials(req.body.email, req.body.password);
              res.json({ accessToken: issueAccessToken(user), tokenType: 'Bearer', expiresIn: 600 });
            });
          `),
        }),
        code({
          title: 'Using it',
          language: 'http',
          code: 'POST /auth/login HTTP/1.1\nContent-Type: application/json\n\n{"email":"ada@example.com","password":"correct horse battery staple"}\n\nGET /api/orders HTTP/1.1\nAuthorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzY29wZSI6Im9yZGVyczpyZWFkIi...\n\nGET /api/orders HTTP/1.1\nAuthorization: Bearer <expired token>',
          expectedOutput: 'HTTP/1.1 200 OK\nCache-Control: no-store\n{"accessToken":"eyJhbGciOi...","tokenType":"Bearer","expiresIn":600}\n\nHTTP/1.1 200 OK\n{"data":[{"id":1,"total":42}]}\n\nHTTP/1.1 401 Unauthorized\nWWW-Authenticate: Bearer error="invalid_token", error_description="The access token expired"\n{"error":{"code":"TOKEN_EXPIRED"}}',
          explanation: [
            'Token responses should carry `Cache-Control: no-store` so proxies never cache them.',
            'The `WWW-Authenticate` error format follows RFC 6750.',
            '`expiresIn` lets clients refresh proactively.',
          ],
        }),
      ),
      section('real-world', 'Real-world notes',
        bullets(
          'Mobile/native apps: Bearer header + secure OS storage (Keychain/Keystore).',
          'SPAs: keep the access token in memory (not localStorage) or use a BFF that holds tokens server-side and gives the browser a cookie.',
          'Microservices: validate `aud` so a token for service A cannot be replayed against service B.',
          'Sender-constrained tokens (DPoP, mTLS) bind a token to a client key so a stolen token is useless elsewhere.',
        ),
      ),
      section('mistakes', 'Common mistakes',
        code({
          title: 'Wrong vs right: tokens in URLs',
          code: dedent(`
            // ✗ ends up in access logs, browser history, Referer headers
            fetch('/api/orders?access_token=' + token);

            // ✓ Authorization header
            fetch('/api/orders', { headers: { Authorization: 'Bearer ' + token } });
          `),
        }),
        bullets(
          'Access tokens valid for days.',
          'Stuffing the whole user profile into the token.',
          'Not checking `aud` — tokens from one app accepted by another.',
        ),
      ),
      section('interview', 'Interview angle',
        interviewTip('Compare JWT vs opaque access tokens on verification cost and revocation. Interviewers like the trade-off framing more than a single "right" answer.'),
      ),
      section('practice', 'Practice',
        text('Implement an opaque-token version: generate `crypto.randomBytes(32).toString("base64url")`, store its SHA-256 in Redis with a 10-minute TTL, and verify by hashing the incoming token and looking it up.'),
      ),
      section('summary', 'Summary',
        bullets(
          'Access token = short-lived bearer credential for API calls.',
          'JWT: local verification, hard revocation. Opaque: lookup, easy revocation.',
          'Send in `Authorization: Bearer`, never in URLs.',
          'Validate audience and expiry on every request.',
        ),
      ),
    ],
    revisionNotes: [
      'Bearer token = possession is enough → keep short-lived (5–15 min).',
      '`Authorization: Bearer <token>` (RFC 6750); never in query strings.',
      'JWT = stateless verify; opaque = DB/introspection lookup (RFC 7662), instant revocation.',
      'Token responses: `Cache-Control: no-store`.',
      'Check `aud` to prevent cross-service replay.',
    ],
    quiz: [
      {
        kind: 'mcq', difficulty: 'beginner',
        prompt: 'Where should a client send an access token on API requests?',
        options: ['In the URL query string', 'In the `Authorization: Bearer` header', 'In the request body of GET requests', 'In a custom `X-Password` header'],
        answer: 1,
        explanation: 'Query strings are logged and leak via Referer. The Authorization header is the standard place.',
      },
      {
        kind: 'scenario', difficulty: 'intermediate',
        prompt: 'Compliance requires that disabling a user cuts off API access within seconds. Your access tokens are 1-hour JWTs. Best change?',
        options: [
          'Make tokens 24 hours',
          'Use short-lived tokens plus a revocation check (opaque tokens or a denylist / user "tokensValidAfter" check)',
          'Rotate the signing key whenever a user is disabled',
          'Nothing — JWTs revoke automatically',
        ],
        answer: 1,
        explanation: 'Stateless JWTs stay valid until `exp`. Rotating the global key logs everyone out. A per-user or per-token check gives fast revocation.',
      },
    ],
    interview: [
      {
        category: 'express-backend', kind: 'concept', difficulty: 'intermediate', topic: 'Access tokens',
        question: 'Why should access tokens be short-lived?',
        shortAnswer: 'Because they are bearer credentials that are usually verified statelessly, so they cannot be cheaply revoked; a short lifetime limits how long a stolen token or stale permissions remain valid.',
        detailedAnswer: [
          'Anyone holding the token can use it until `exp`.',
          'Role changes and bans take effect when the next token is issued.',
          'Refresh tokens keep the UX smooth despite short access lifetimes.',
          'Typical lifetimes: 5–15 minutes for access, days to weeks for refresh.',
        ],
        followUp: 'What do you do if you need instant revocation anyway?',
        trap: 'Saying long-lived tokens are fine because they are signed.',
      },
      {
        category: 'express-backend', kind: 'concept', difficulty: 'advanced', topic: 'Opaque vs JWT',
        question: 'Compare opaque access tokens with JWT access tokens. When would you choose each?',
        shortAnswer: 'JWTs are self-contained and verified locally (fast, scalable, hard to revoke); opaque tokens are random references validated by lookup or introspection (one round-trip, but instantly revocable and leak no data). Choose JWTs for distributed verification at scale, opaque when revocation and privacy matter more.',
        detailedAnswer: [
          'JWT: no DB hit per request, works across services with JWKS; payload visible; revocation needs denylists or short exp.',
          'Opaque: store hashed token → user/scopes in Redis/DB; or RFC 7662 introspection at the auth server.',
          'Hybrid: gateway introspects opaque token and forwards an internal short-lived JWT ("phantom token" pattern).',
          'Opaque tokens reveal nothing if logged or leaked to the browser.',
          'Caching introspection results trades revocation latency for speed.',
        ],
        followUp: 'How does the phantom token pattern work?',
        trap: 'Claiming JWTs are always more secure because they are signed.',
      },
    ],
  },

  // ───────────────────────────────────────────────────────────
  'refresh-tokens': {
    summary: 'A refresh token is a long-lived, single-purpose credential exchanged for new access tokens; store only its hash server-side, rotate it on every use, and treat reuse of an old token as theft that revokes the whole token family.',
    topics: ['refresh token', 'rotation', 'reuse detection', 'token family', 'hashed storage', 'HttpOnly cookie', 'sliding expiry', 'absolute expiry'],
    sections: [
      section('introduction', undefined,
        text('Short access tokens are secure but would force a login every few minutes. Refresh tokens fix the UX — and because they live long, they need the strongest protection.'),
      ),
      section('definition', 'Definition',
        table('Access vs refresh tokens', ['', 'Access token', 'Refresh token'], [
          ['Lifetime', 'Minutes', 'Days / weeks (with absolute cap)'],
          ['Sent to', 'Every API request', 'Only the refresh endpoint'],
          ['Format', 'JWT or opaque', 'Opaque random string (recommended)'],
          ['Server state', 'Often none', 'Stored (hashed) for rotation and revocation'],
          ['Browser storage', 'Memory', 'HttpOnly, Secure, SameSite cookie scoped to `/auth`'],
        ]),
      ),
      section('why', 'Why rotation and reuse detection',
        bullets(
          '**Rotation**: every refresh returns a new refresh token and invalidates the old one.',
          '**Reuse detection**: if an already-used token shows up again, either the attacker or the user is replaying a stolen copy → revoke the entire family and force re-login.',
          '**Hashed storage**: a DB leak must not hand out working refresh tokens — store `SHA-256(token)` (fast hash is fine: the token is high-entropy random, not a password).',
        ),
      ),
      section('internals', 'Rotation flow',
        flow([
          'Login: issue RT1 (family F), store hash(RT1)',
          'Refresh with RT1: mark RT1 used, issue RT2 (family F)',
          'Refresh with RT2: mark RT2 used, issue RT3',
          'Attacker replays RT1 (already used)',
          'Reuse detected: revoke all of family F → user must log in',
        ], { direction: 'vertical', title: 'Refresh token rotation with reuse detection' }),
        diagram('jwt-flow', 'Access token expires → client calls /auth/refresh with the refresh cookie.'),
      ),
      section('example', 'Rotation in Express',
        code({
          title: 'auth/refresh.service.js',
          code: dedent(`
            const crypto = require('node:crypto');
            const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
            const DAY = 24 * 60 * 60 * 1000;

            function createRefreshService({ repo, issueAccessToken }) {
              async function issue(userId, familyId = crypto.randomUUID()) {
                const token = crypto.randomBytes(32).toString('base64url');
                await repo.insert({ hash: sha256(token), userId, familyId, usedAt: null, expiresAt: new Date(Date.now() + 30 * DAY) });
                return token;
              }

              async function rotate(presented) {
                const row = await repo.findByHash(sha256(presented ?? ''));
                if (!row || row.expiresAt < new Date()) throw new UnauthorizedError('Invalid refresh token');
                if (row.usedAt || row.revokedAt) {
                  await repo.revokeFamily(row.familyId);                 // reuse → theft
                  console.log('reuse detected, family revoked', row.familyId);
                  throw new UnauthorizedError('Refresh token reuse');
                }
                await repo.markUsed(row.hash);                           // must be atomic (UPDATE ... WHERE used_at IS NULL)
                return {
                  accessToken: issueAccessToken(row.userId),
                  refreshToken: await issue(row.userId, row.familyId),
                };
              }

              return { issue, rotate };
            }
            module.exports = { createRefreshService };
          `),
          explanation: [
            'Only hashes are stored — a leaked table cannot be replayed.',
            'All tokens from one login share a `familyId`, so reuse revokes just that session (other devices stay logged in).',
            '`markUsed` must be a conditional update so two parallel refreshes cannot both succeed.',
          ],
        }),
        code({
          title: 'auth/refresh.routes.js',
          code: dedent(`
            const cookieOpts = { httpOnly: true, secure: true, sameSite: 'strict', path: '/auth', maxAge: 30 * 24 * 60 * 60 * 1000 };

            router.post('/auth/refresh', async (req, res) => {
              const { accessToken, refreshToken } = await refreshService.rotate(req.cookies.rt); // cookie-parser
              res.cookie('rt', refreshToken, cookieOpts);
              res.set('Cache-Control', 'no-store').json({ accessToken, expiresIn: 600 });
            });
          `),
        }),
        code({
          title: 'Responses',
          language: 'http',
          code: 'POST /auth/refresh HTTP/1.1\nCookie: rt=RT1\n\nPOST /auth/refresh HTTP/1.1\nCookie: rt=RT2\n\nPOST /auth/refresh HTTP/1.1\nCookie: rt=RT1',
          expectedOutput: 'HTTP/1.1 200 OK\nSet-Cookie: rt=RT2; Max-Age=2592000; Path=/auth; Expires=...; HttpOnly; Secure; SameSite=Strict\n{"accessToken":"eyJ...","expiresIn":600}\n\nHTTP/1.1 200 OK\nSet-Cookie: rt=RT3; Max-Age=2592000; Path=/auth; Expires=...; HttpOnly; Secure; SameSite=Strict\n{"accessToken":"eyJ...","expiresIn":600}\n\nHTTP/1.1 401 Unauthorized\n{"error":{"code":"UNAUTHORIZED","message":"Refresh token reuse"}}',
          explanation: [
            'Server log for the third call: `reuse detected, family revoked <familyId>`.',
            'After that, RT3 (held by the legitimate user) is also revoked — they must log in again, which is the point.',
          ],
        }),
      ),
      section('real-world', 'Real-world tips',
        bullets(
          'Add an **absolute** lifetime (e.g. 30–90 days from login) on top of the rolling expiry.',
          'Allow a short grace window (a few seconds) for legitimate concurrent refreshes from multiple tabs, or serialise refreshes client-side.',
          'Show users their active sessions (one family per device) with a "log out other devices" button.',
          'Native apps store refresh tokens in Keychain/Keystore; SPAs ideally via a BFF cookie.',
        ),
      ),
      section('mistakes', 'Common mistakes',
        code({
          title: 'Wrong vs right: storing refresh tokens',
          code: dedent(`
            // ✗ plaintext in DB and in localStorage
            await db.insert('refresh_tokens', { token, userId });
            localStorage.setItem('refreshToken', token);

            // ✓ hash in DB, HttpOnly cookie limited to the refresh path
            await db.insert('refresh_tokens', { hash: sha256(token), userId, familyId });
            res.cookie('rt', token, { httpOnly: true, secure: true, sameSite: 'strict', path: '/auth' });
          `),
        }),
        bullets(
          'Using a JWT refresh token with no server state — cannot rotate or revoke.',
          'Same refresh token valid forever.',
          'Sending the refresh cookie to every API path (no `Path` scoping).',
        ),
      ),
      section('interview', 'Interview angle',
        interviewTip('Describe rotation + reuse detection + families + hashed storage as one design. Then mention the race condition with parallel refreshes — that is the follow-up most people miss.'),
      ),
      section('practice', 'Practice',
        text('Implement `repo.markUsed` with a Postgres `UPDATE refresh_tokens SET used_at = now() WHERE hash = $1 AND used_at IS NULL RETURNING *` and treat zero rows as reuse. Write a test that fires two refreshes in parallel.'),
      ),
      section('summary', 'Summary',
        bullets(
          'Refresh tokens are long-lived; protect them hardest.',
          'Opaque, hashed at rest, HttpOnly cookie scoped to `/auth`.',
          'Rotate on every use; reuse → revoke the family.',
          'Rolling + absolute expiry.',
        ),
      ),
    ],
    revisionNotes: [
      'Refresh token: long-lived, only sent to the refresh endpoint.',
      'Store SHA-256(token) — high-entropy random tokens do not need bcrypt.',
      'Rotation: new RT each refresh; old marked used.',
      'Reuse of a used RT → revoke whole family (theft signal).',
      'Atomic "mark used" prevents double refresh races.',
      'Cookie: HttpOnly, Secure, SameSite=Strict, Path=/auth.',
    ],
    quiz: [
      {
        kind: 'mcq', difficulty: 'intermediate',
        prompt: 'Why is it acceptable to store refresh tokens with SHA-256 instead of bcrypt?',
        options: [
          'SHA-256 is slower than bcrypt',
          'Refresh tokens are 256-bit random values, so brute-forcing the hash is infeasible regardless of hash speed',
          'Refresh tokens are not sensitive',
          'bcrypt cannot hash strings',
        ],
        answer: 1,
        explanation: 'Slow hashes protect low-entropy secrets (passwords). A 32-byte random token has 2^256 possibilities — speed does not help an attacker.',
      },
      {
        kind: 'scenario', difficulty: 'advanced',
        prompt: 'A refresh token that was already rotated is presented again. What should the server do?',
        options: [
          'Accept it and issue new tokens',
          'Ignore it and return the same tokens as last time',
          'Reject it and revoke all refresh tokens in that token family',
          'Ban the user account permanently',
        ],
        answer: 2,
        explanation: 'Reuse means one of two parties has a stolen copy. Revoking the family stops the attacker; the real user just logs in again.',
      },
    ],
    interview: [
      {
        category: 'express-backend', kind: 'concept', difficulty: 'advanced', topic: 'Refresh rotation',
        question: 'Explain refresh token rotation with reuse detection. What problem does it solve?',
        shortAnswer: 'Each refresh returns a new refresh token and invalidates the old one; if an old token is ever presented again, the server assumes theft and revokes the whole token family — limiting a stolen refresh token to at most one use before detection.',
        detailedAnswer: [
          'Without rotation, a stolen long-lived refresh token works silently for weeks.',
          'Family id links all tokens descending from one login.',
          'Reuse → revoke family → both attacker and user lose access; user re-authenticates.',
          'Implement "mark used" atomically; consider a small grace period for concurrent tabs.',
          'Recommended by the OAuth 2.0 Security BCP (RFC 9700) for public clients.',
        ],
        followUp: 'How do you avoid false positives when two browser tabs refresh at the same time?',
        trap: 'Rotating tokens but never checking for reuse, which gives no theft detection.',
      },
      {
        category: 'express-backend', kind: 'concept', difficulty: 'intermediate', topic: 'Refresh storage',
        question: 'How should refresh tokens be stored on the server and on the client?',
        shortAnswer: 'Server: only a hash (e.g. SHA-256) with user, family, expiry and used/revoked flags. Browser: an HttpOnly, Secure, SameSite cookie scoped to the refresh path — never localStorage; native apps: OS secure storage.',
        detailedAnswer: [
          'Hashing means a DB leak does not yield usable tokens.',
          'HttpOnly prevents JavaScript (and XSS) from reading it.',
          '`Path=/auth` keeps it off normal API requests.',
          'SameSite=Strict stops other sites from triggering refreshes; CORS stops them from reading the new access token.',
          'Record device/user agent for a sessions page.',
        ],
        followUp: 'Why not just make the refresh token a JWT?',
        trap: 'Storing refresh tokens in localStorage "because the access token is there too".',
      },
    ],
  },

  // ───────────────────────────────────────────────────────────
  cookies: {
    summary: 'Cookies are small name=value pairs the server sets with `Set-Cookie` and the browser sends back automatically; auth cookies must be `HttpOnly`, `Secure`, have a deliberate `SameSite`, and tight `Path`/`Domain`/`Max-Age`.',
    topics: ['Set-Cookie', 'HttpOnly', 'Secure', 'SameSite', 'Lax', 'Strict', 'None', 'Max-Age', 'Expires', 'Domain', 'Path', '__Host- prefix', 'cookie-parser', 'signed cookies', 'res.cookie', 'res.clearCookie'],
    sections: [
      section('introduction', undefined,
        text('Browsers attach cookies to requests automatically. That makes them great for sessions — and dangerous if attributes are wrong.'),
      ),
      section('definition', 'Cookie attributes',
        table('Attributes', ['Attribute', 'Effect', 'Auth cookie setting'], [
          ['`HttpOnly`', 'Not readable from `document.cookie` (blocks XSS theft)', 'Always'],
          ['`Secure`', 'Only sent over HTTPS', 'Always (major browsers treat `http://localhost` as secure for development)'],
          ['`SameSite=Strict`', 'Never sent on cross-site requests', 'Highest CSRF protection; links from other sites arrive "logged out"'],
          ['`SameSite=Lax`', 'Sent on top-level GET navigations from other sites, not on cross-site POST/iframes/fetch', 'Good default (browser default when unset)'],
          ['`SameSite=None`', 'Sent cross-site; **requires `Secure`**', 'Only for genuine cross-site needs (embedded widgets) + CSRF tokens'],
          ['`Max-Age` / `Expires`', 'Persistent cookie lifetime (seconds / date); omitted → session cookie', 'Match token/session lifetime'],
          ['`Domain`', 'Share with subdomains when set; host-only when omitted', 'Omit unless subdomains need it'],
          ['`Path`', 'Only sent for URLs under this path', '`/` for session, `/auth` for refresh'],
        ]),
        table('Name prefixes (enforced by browsers)', ['Prefix', 'Requirements'], [
          ['`__Secure-`', 'Must have `Secure`'],
          ['`__Host-`', 'Must have `Secure`, `Path=/`, and **no** `Domain` → locked to exactly this host'],
        ]),
      ),
      section('why', 'Why attributes matter',
        bullets(
          'Without `HttpOnly`, any XSS steals the session.',
          'Without `Secure`, a network attacker on HTTP sees it.',
          'Without SameSite, other sites can make the browser send it (CSRF).',
          'A broad `Domain=.example.com` lets a compromised `blog.example.com` read/overwrite it.',
        ),
      ),
      section('internals', 'In Express',
        bullets(
          '`res.cookie(name, value, options)` and `res.clearCookie(name, options)` are Express helpers that write `Set-Cookie`.',
          'Express `maxAge` is in **milliseconds**; it emits both `Max-Age` (seconds) and `Expires`.',
          'Reading cookies needs `cookie-parser` (separate package from the Express team) → `req.cookies`, and `req.signedCookies` with a secret.',
          'Signed cookies (`signed: true`) add an HMAC — tamper-evident, **not** encrypted.',
          '`clearCookie` must use the same `path`/`domain` as when set, or the browser keeps the original.',
        ),
      ),
      section('example', 'Setting a secure session cookie',
        code({
          title: 'Express + cookie-parser',
          code: dedent(`
            const express = require('express');
            const cookieParser = require('cookie-parser');
            const app = express();
            app.use(cookieParser(process.env.COOKIE_SECRET));

            app.post('/login', express.json(), async (req, res) => {
              const sessionId = await sessions.create(req.body);
              res.cookie('__Host-sid', sessionId, {
                httpOnly: true,
                secure: true,
                sameSite: 'lax',
                path: '/',
                maxAge: 2 * 60 * 60 * 1000, // 2 hours, in ms
              });
              res.sendStatus(204);
            });

            app.get('/me', (req, res) => res.json({ sid: req.cookies['__Host-sid'] ?? null }));

            app.post('/logout', (req, res) => {
              res.clearCookie('__Host-sid', { httpOnly: true, secure: true, sameSite: 'lax', path: '/' });
              res.sendStatus(204);
            });

            app.listen(3000);
          `),
        }),
        code({
          title: 'Headers on the wire',
          language: 'http',
          code: 'POST /login HTTP/1.1\nContent-Type: application/json\n\n{"email":"ada@example.com","password":"..."}\n\nGET /me HTTP/1.1\nCookie: __Host-sid=s_9f8e7d\n\nPOST /logout HTTP/1.1\nCookie: __Host-sid=s_9f8e7d',
          expectedOutput: 'HTTP/1.1 204 No Content\nSet-Cookie: __Host-sid=s_9f8e7d; Max-Age=7200; Path=/; Expires=Sun, 08 Nov 2026 12:00:00 GMT; HttpOnly; Secure; SameSite=Lax\n\nHTTP/1.1 200 OK\n{"sid":"s_9f8e7d"}\n\nHTTP/1.1 204 No Content\nSet-Cookie: __Host-sid=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; Secure; SameSite=Lax',
          explanation: [
            '`maxAge: 7200000` ms became `Max-Age=7200` seconds.',
            'Clearing sets an expiry in the past with the same path.',
            'The `__Host-` prefix makes the browser reject the cookie if it lacked Secure, had a Domain, or Path ≠ `/`.',
          ],
          versionNote: 'Express 5 `res.clearCookie` ignores `maxAge`/`expires` options (Express 4 could accidentally keep the cookie alive if you passed them).',
        }),
      ),
      section('real-world', 'Real-world',
        bullets(
          'Same-site SPA + API (`app.example.com` → `api.example.com` is same-site): `SameSite=Lax` or `Strict` works.',
          'Cross-site (API on a different registrable domain) needs `SameSite=None; Secure` and CSRF defences — and third-party cookie restrictions may block it; prefer same-site deployments or a BFF.',
          'Behind a TLS-terminating proxy, set `app.set("trust proxy", 1)` so `req.secure` is true (express-session refuses to set Secure cookies otherwise).',
        ),
      ),
      section('mistakes', 'Common mistakes',
        code({
          title: 'Wrong vs right',
          code: dedent(`
            // ✗ readable by JS, sent over HTTP, maxAge mistaken for seconds (7.2 s!)
            res.cookie('sid', id, { maxAge: 7200 });

            // ✓
            res.cookie('__Host-sid', id, { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 7200 * 1000 });
          `),
        }),
        bullets(
          '`SameSite=None` without `Secure` — browsers reject the cookie.',
          'Thinking signed cookies hide the value — they only detect tampering.',
          'Clearing with a different `path` than used to set it.',
        ),
      ),
      section('interview', 'Interview angle',
        interviewTip('Recite the trio — HttpOnly (XSS), Secure (network), SameSite (CSRF) — and explain Lax vs Strict vs None. `__Host-` prefix is a strong signal of depth.'),
      ),
      section('practice', 'Practice',
        text('Set three cookies (SameSite Strict, Lax, None). Serve a second page from a different registrable domain (e.g. via a tunnel) that links to, form-POSTs to and fetches your app. Record in DevTools which cookies each request carries. Note: subdomains of one site are same-site, so they will not show the difference.'),
      ),
      section('summary', 'Summary',
        bullets(
          'Auth cookies: HttpOnly + Secure + SameSite (Lax/Strict) + tight Path, no Domain.',
          '`__Host-` prefix locks a cookie to one host.',
          'Express `maxAge` is milliseconds.',
          'cookie-parser (separate package) for `req.cookies`; signed ≠ encrypted.',
        ),
      ),
    ],
    revisionNotes: [
      'HttpOnly → no JS access; Secure → HTTPS only; SameSite → cross-site sending policy.',
      'Lax (default when unset) sends on top-level GET navigation; Strict never cross-site; None requires Secure.',
      '`__Host-` = Secure + Path=/ + no Domain.',
      'Express `res.cookie` `maxAge` in ms → emits Max-Age seconds + Expires.',
      '`clearCookie` must match path/domain; Express 5 ignores maxAge there.',
      '`req.cookies` needs cookie-parser; signed cookies are HMAC-protected, not encrypted.',
    ],
    quiz: [
      {
        kind: 'mcq', difficulty: 'intermediate',
        prompt: 'Which SameSite value still sends the cookie when a user clicks a link from another site to your page (top-level GET)?',
        options: ['Strict', 'Lax', 'Both Strict and Lax', 'Neither'],
        answer: 1,
        explanation: 'Lax allows top-level safe navigations. Strict withholds the cookie for any cross-site request, so the first page load appears logged out.',
      },
      {
        kind: 'find-bug', difficulty: 'beginner',
        prompt: 'The session cookie expires after a few seconds. Why?',
        code: "res.cookie('sid', id, { httpOnly: true, secure: true, maxAge: 3600 });",
        options: [
          'httpOnly shortens expiry',
          'Express maxAge is in milliseconds — 3600 ms is 3.6 seconds',
          'secure cookies expire quickly',
          'maxAge must be a string',
        ],
        answer: 1,
        explanation: 'Use `3600 * 1000` for one hour. Express converts to `Max-Age=3` seconds here.',
      },
      {
        kind: 'scenario', difficulty: 'advanced',
        prompt: 'Your app runs on `app.example.com`; a marketing site on `blog.example.com` is less secure. How do you stop the blog from setting or overwriting the app\'s session cookie?',
        options: [
          'Set `Domain=.example.com`',
          'Use a `__Host-` prefixed cookie (Secure, Path=/, no Domain)',
          'Use SameSite=None',
          'Sign the cookie',
        ],
        answer: 1,
        explanation: 'Subdomains can set cookies for the parent domain that may shadow yours. A `__Host-` cookie can only be set by the exact host over HTTPS without Domain. Signing detects tampering but not cookie tossing of another valid value.',
      },
    ],
    interview: [
      {
        category: 'express-backend', kind: 'concept', difficulty: 'intermediate', topic: 'Cookie security',
        question: 'Explain the HttpOnly, Secure and SameSite cookie attributes.',
        shortAnswer: 'HttpOnly hides the cookie from JavaScript (mitigates XSS token theft), Secure restricts it to HTTPS (mitigates network sniffing), and SameSite controls whether it is sent on cross-site requests (mitigates CSRF).',
        detailedAnswer: [
          'HttpOnly does not stop XSS from making requests as the user — it only stops reading the cookie.',
          'Secure cookies are never sent over plain HTTP.',
          'SameSite: Strict (never cross-site), Lax (top-level GET navigations only; default when unset), None (always; requires Secure).',
          'Combine with tight Path/Domain and a sensible Max-Age.',
        ],
        followUp: 'Does SameSite=Lax fully replace CSRF tokens?',
        trap: 'Saying HttpOnly prevents XSS.',
      },
      {
        category: 'express-backend', kind: 'concept', difficulty: 'advanced', topic: 'Cross-site cookies',
        question: 'Your SPA on one domain calls an API on a completely different domain using cookies. What is required and what are the risks?',
        shortAnswer: 'The cookie needs `SameSite=None; Secure`, the API needs CORS with a specific origin and `credentials: true`, and the client must send `credentials: "include"` — but that re-opens CSRF risk and is increasingly blocked by third-party-cookie restrictions, so a same-site setup or BFF is preferred.',
        detailedAnswer: [
          'Different registrable domains are cross-site; Lax/Strict cookies will not be sent on fetch.',
          'CORS: `Access-Control-Allow-Origin: https://app.com` (not `*`) and `Access-Control-Allow-Credentials: true`.',
          'CSRF: add anti-CSRF tokens or check `Origin` header on state-changing requests.',
          'Safari/Firefox and Chrome policies restrict third-party cookies — test thoroughly.',
          'Better: host API at `api.app.com` (same-site) or proxy through a BFF on the app\'s origin.',
        ],
        followUp: 'What is the difference between "same-site" and "same-origin"?',
        trap: 'Using `Access-Control-Allow-Origin: *` with credentials — browsers reject it.',
      },
    ],
  },

  // ───────────────────────────────────────────────────────────
  sessions: {
    summary: 'Server-side sessions store user state on the server (e.g. Redis) keyed by a random session id in a cookie; with `express-session` (third-party) you must use a real store, regenerate the id on login to prevent session fixation, and destroy it on logout.',
    topics: ['express-session', 'session store', 'connect-redis', 'MemoryStore', 'session fixation', 'regenerate', 'destroy', 'saveUninitialized', 'resave', 'rolling', 'sessions vs JWT'],
    sections: [
      section('introduction', undefined,
        text('Sessions are the classic web login: the browser holds only an opaque id, the server holds everything else. Easy to revoke, easy to reason about.'),
      ),
      section('definition', 'Definition',
        bullets(
          'A **session** is server-side data (`{ userId, roles, csrfSecret }`) addressed by a random id.',
          'The id travels in a cookie (`connect.sid` by default with express-session — rename it).',
          '`express-session` (third-party, maintained by the Express team) provides `req.session`, with methods `regenerate`, `destroy`, `save`, `reload`.',
        ),
        table('Sessions vs JWT', ['', 'Server-side session', 'JWT (stateless)'], [
          ['State', 'In store (Redis/DB)', 'In the token'],
          ['Revocation', 'Delete session — instant', 'Wait for exp or maintain denylist'],
          ['Per-request cost', 'Store lookup', 'Signature verification'],
          ['Scaling', 'Shared store across instances', 'Any instance with the key'],
          ['Best for', 'Browser apps on one domain', 'APIs, mobile, service-to-service'],
          ['CSRF', 'Cookie-based → needs SameSite/CSRF tokens', 'Header-based → not CSRF-prone'],
        ]),
      ),
      section('why', 'Why sessions are still popular',
        bullets(
          'Instant logout and "log out everywhere".',
          'Small cookie, no sensitive data leaves the server.',
          'Mature tooling; easy to store CSRF secrets and flash messages.',
        ),
      ),
      section('internals', 'How express-session works',
        steps(
          'On each request it reads the signed session cookie, verifies the HMAC with `secret`, and loads the session from the store.',
          'No cookie or unknown id → a new empty session object.',
          'After the response, if the session was modified (or `resave: true`), it is saved back.',
          'The cookie is only set when the session is initialised (or every response with `rolling: true`).',
          '`saveUninitialized: false` avoids creating sessions for anonymous visitors (and helps with cookie consent laws).',
        ),
        flow(['Browser: Cookie sid=abc', 'express-session: verify signature', 'Store (Redis): GET sess:abc', 'req.session = { userId: 42 }', 'Handler', 'Save if modified'], { direction: 'horizontal' }),
      ),
      section('example', 'Production setup with Redis',
        code({
          title: 'app.js',
          code: dedent(`
            const express = require('express');
            const session = require('express-session');
            const { RedisStore } = require('connect-redis');
            const { createClient } = require('redis');

            async function buildApp() {
              const redis = createClient({ url: process.env.REDIS_URL });
              await redis.connect();

              const app = express();
              app.set('trust proxy', 1);
              app.use(session({
                store: new RedisStore({ client: redis, prefix: 'sess:' }),
                name: '__Host-sid',
                secret: [process.env.SESSION_SECRET_NEW, process.env.SESSION_SECRET_OLD], // rotation
                resave: false,
                saveUninitialized: false,
                rolling: true,
                cookie: { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 30 * 60 * 1000 },
              }));
              return app;
            }
          `),
          explanation: [
            'An array of secrets: the first signs new cookies, all are accepted — allows key rotation.',
            '`rolling: true` + 30-minute `maxAge` = idle timeout that resets on activity.',
            'The default MemoryStore leaks memory and is per-process — never use it in production.',
          ],
          versionNote: 'connect-redis v8 uses the named export `{ RedisStore }`; older versions exported a factory or default class.',
        }),
        code({
          title: 'Login and logout with fixation protection',
          code: dedent(`
            app.post('/login', express.json(), async (req, res, next) => {
              const user = await authService.verifyCredentials(req.body.email, req.body.password);
              req.session.regenerate((err) => {          // new id → defeats session fixation
                if (err) return next(err);
                req.session.userId = user.id;
                req.session.save((err2) => (err2 ? next(err2) : res.json({ id: user.id })));
              });
            });

            app.post('/logout', (req, res, next) => {
              req.session.destroy((err) => {            // removes it from the store
                if (err) return next(err);
                res.clearCookie('__Host-sid', { path: '/', secure: true, httpOnly: true, sameSite: 'lax' });
                res.sendStatus(204);
              });
            });
          `),
          explanation: [
            '`regenerate` discards any pre-login session id an attacker may have planted.',
            '`save` before responding guarantees the session exists when the next request arrives.',
            'These methods are callback-based; Express will not catch errors inside them, so call `next(err)`.',
          ],
        }),
        code({
          title: 'Responses',
          language: 'http',
          code: 'POST /login HTTP/1.1\nCookie: __Host-sid=s%3Aattacker-fixed-id.sig\nContent-Type: application/json\n\n{"email":"ada@example.com","password":"..."}\n\nPOST /logout HTTP/1.1\nCookie: __Host-sid=s%3AnewId.sig',
          expectedOutput: 'HTTP/1.1 200 OK\nSet-Cookie: __Host-sid=s%3AnewId.sig; Path=/; Expires=...; HttpOnly; Secure; SameSite=Lax\n{"id":42}\n\nHTTP/1.1 204 No Content\nSet-Cookie: __Host-sid=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; Secure; SameSite=Lax',
          explanation: ['The id after login differs from the one the attacker planted, so their copy is useless.'],
        }),
      ),
      section('real-world', 'Real-world',
        bullets(
          'Keep an index `user:42:sessions` in Redis to implement "log out all devices" and admin revocation.',
          'Regenerate on privilege changes too (role elevation, password change).',
          'Absolute session lifetime (e.g. 12 hours) plus idle timeout.',
          'Use SameSite=Lax/Strict and CSRF tokens for state-changing forms.',
        ),
      ),
      section('mistakes', 'Common mistakes',
        code({
          title: 'Wrong vs right: session fixation',
          code: dedent(`
            // ✗ keeps the pre-login session id
            req.session.userId = user.id;
            res.json({ ok: true });

            // ✓ new id on login
            req.session.regenerate((err) => {
              if (err) return next(err);
              req.session.userId = user.id;
              res.json({ ok: true });
            });
          `),
        }),
        bullets(
          'MemoryStore in production (memory leak; sessions lost on restart; not shared across instances).',
          'Weak or committed `secret`.',
          'Behind a proxy without `trust proxy` → Secure cookie never set.',
          'Storing large objects in the session — every request loads them.',
        ),
      ),
      section('interview', 'Interview angle',
        interviewTip('Explain session fixation precisely: the attacker gets the victim to use an id the attacker knows; after login, that id is authenticated. The fix is `regenerate()` at login. Then compare sessions vs JWT honestly.'),
      ),
      section('practice', 'Practice',
        text('Add a "sessions" page listing active sessions for the current user from a Redis set, with a button that destroys a selected session id.'),
      ),
      section('summary', 'Summary',
        bullets(
          'Session id in cookie, data on server.',
          'Use Redis/DB store; never MemoryStore in production.',
          '`regenerate` on login, `destroy` on logout.',
          '`resave: false`, `saveUninitialized: false`, secure cookie options.',
        ),
      ),
    ],
    revisionNotes: [
      'express-session (third-party) → `req.session`; methods regenerate/destroy/save/reload (callback-based).',
      'MemoryStore is for development only.',
      'Session fixation → `req.session.regenerate()` on login and privilege change.',
      '`resave: false`, `saveUninitialized: false`; `rolling: true` for idle timeout.',
      '`secret` can be an array for rotation; set `trust proxy` behind TLS proxies.',
      'Sessions: instant revocation; JWT: stateless, hard to revoke.',
    ],
    quiz: [
      {
        kind: 'scenario', difficulty: 'intermediate',
        prompt: 'An attacker sends a victim a link that sets a known session id; after the victim logs in, the attacker uses that id and is logged in as the victim. What prevents this?',
        options: [
          'Using HttpOnly cookies',
          'Calling `req.session.regenerate()` on successful login',
          'Using MemoryStore',
          'Longer session secrets',
        ],
        answer: 1,
        explanation: 'This is session fixation. A fresh id at login invalidates the attacker\'s known id. HttpOnly prevents reading, not planting.',
      },
      {
        kind: 'mcq', difficulty: 'beginner',
        prompt: 'Why should you not use express-session\'s default MemoryStore in production?',
        options: [
          'It is slower than Redis',
          'It leaks memory, is lost on restart and is not shared between instances',
          'It encrypts sessions',
          'It requires HTTPS',
        ],
        answer: 1,
        explanation: 'The package itself warns that MemoryStore is not designed for production.',
      },
    ],
    interview: [
      {
        category: 'express-backend', kind: 'concept', difficulty: 'intermediate', topic: 'Sessions vs JWT',
        question: 'Compare server-side sessions with JWT-based authentication. When would you choose sessions?',
        shortAnswer: 'Sessions keep state on the server behind an opaque cookie id — instantly revocable, small, but need a shared store; JWTs are self-contained and stateless — scalable across services but hard to revoke. Choose sessions for first-party browser apps on one site where control and revocation matter.',
        detailedAnswer: [
          'Sessions: Redis lookup per request; logout = delete.',
          'JWT: verify signature only; logout needs denylist or short expiry + refresh tokens.',
          'Cookie sessions need CSRF protection (SameSite + tokens); Bearer JWTs in headers do not.',
          'Many systems combine both: session for the browser via a BFF, JWTs between services.',
        ],
        followUp: 'How would you scale sessions across multiple Node instances?',
        trap: 'Claiming JWTs are always better because they are "stateless and modern".',
      },
      {
        category: 'express-backend', kind: 'concept', difficulty: 'advanced', topic: 'Session fixation',
        question: 'What is session fixation and how does express-session help you prevent it?',
        shortAnswer: 'Session fixation is when an attacker makes the victim use a session id the attacker already knows, then waits for the victim to log in; you prevent it by issuing a brand-new id at authentication with `req.session.regenerate()`.',
        detailedAnswer: [
          'Attack vectors: planting a cookie via a subdomain, URL-based ids, or an XSS.',
          '`regenerate` destroys the old session and creates a new id; copy any needed data explicitly.',
          'Also regenerate on privilege elevation and after password change.',
          '`__Host-` cookie prefix blocks subdomain cookie planting.',
          'Never accept session ids from query strings.',
        ],
        followUp: 'Why do you call req.session.save() before responding after regenerate?',
        trap: 'Thinking HttpOnly or Secure cookies prevent fixation.',
      },
    ],
  },
};

export default content;
