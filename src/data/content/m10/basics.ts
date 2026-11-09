import type { ModuleContent } from '../../../types';
import {
  bullets, code, dedent, diagram, flow, interviewTip, note, section, steps, table, text,
} from '../helpers';

const SAMPLE_JWT =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI0MiIsInJvbGUiOiJ1c2VyIiwiaWF0IjoxNzY3MjI1NjAwLCJleHAiOjE3NjcyMjY1MDAsImlzcyI6ImFwaS5leGFtcGxlLmNvbSIsImF1ZCI6IndlYiJ9.nLgbPB4d3rmtdYOiI0JZODQ1YY2jxVKHnIf3tnxo3fE';

const content: Partial<ModuleContent> = {
  // ───────────────────────────────────────────────────────────
  'authentication-vs-authorization': {
    summary: 'Authentication (authN) proves who the caller is; authorization (authZ) decides what that identity may do. AuthN failures are 401, authZ failures are 403.',
    topics: ['authentication', 'authorization', '401 Unauthorized', '403 Forbidden', 'identity', 'credentials', 'WWW-Authenticate'],
    sections: [
      section('introduction', undefined,
        text('Logging in and being allowed to delete another user\'s data are two different checks. Mixing them up is the root of many security bugs.'),
      ),
      section('definition', 'Definitions',
        table('AuthN vs AuthZ', ['', 'Authentication (authN)', 'Authorization (authZ)'], [
          ['Question', 'Who are you?', 'What are you allowed to do?'],
          ['Input', 'Credentials: password, token, cookie, certificate, passkey', 'Identity + roles/permissions + resource'],
          ['Output', 'An identity (`req.user = { id, roles }`)', 'Allow / deny'],
          ['Failure status', '**401 Unauthorized** (+ `WWW-Authenticate` header)', '**403 Forbidden** (or 404 to hide existence)'],
          ['Happens', 'First, once per request', 'After authN, per action/resource'],
          ['Examples', 'Login, JWT verification, session lookup', 'RBAC, ownership checks, scopes'],
        ]),
        note('The status name "401 Unauthorized" is historically confusing — it really means **unauthenticated**.'),
      ),
      section('why', 'Why separate them',
        bullets(
          'A valid token says nothing about permission — broken access control is the #1 OWASP Top 10 (2021) risk.',
          'Different layers: authN is usually global middleware; authZ often needs the resource (owner id) so it lives in route middleware or services.',
        ),
      ),
      section('internals', 'Where each check runs',
        flow([
          'Request with Authorization header / cookie',
          'authN middleware: verify token → req.user',
          'authZ middleware: role/permission check',
          'service: ownership check on the loaded resource',
          'handler responds',
        ], { direction: 'horizontal', title: 'Typical pipeline' }),
      ),
      section('example', 'Both checks in Express',
        code({
          title: 'authN then authZ',
          code: dedent(`
            const express = require('express');
            const app = express();

            function authenticate(req, res, next) {
              const user = sessions.get(req.get('authorization')?.replace('Bearer ', ''));
              if (!user) return res.status(401).set('WWW-Authenticate', 'Bearer').json({ error: 'Not authenticated' });
              req.user = user;
              next();
            }

            const authorize = (...roles) => (req, res, next) =>
              roles.includes(req.user.role) ? next() : res.status(403).json({ error: 'Forbidden' });

            app.get('/me', authenticate, (req, res) => res.json(req.user));
            app.delete('/users/:id', authenticate, authorize('admin'), (req, res) => res.sendStatus(204));

            app.listen(3000);
          `),
        }),
        code({
          title: 'Responses',
          language: 'http',
          code: 'GET /me HTTP/1.1\n\nGET /me HTTP/1.1\nAuthorization: Bearer tok-user\n\nDELETE /users/7 HTTP/1.1\nAuthorization: Bearer tok-user\n\nDELETE /users/7 HTTP/1.1\nAuthorization: Bearer tok-admin',
          expectedOutput: 'HTTP/1.1 401 Unauthorized\nWWW-Authenticate: Bearer\n{"error":"Not authenticated"}\n\nHTTP/1.1 200 OK\n{"id":1,"role":"user"}\n\nHTTP/1.1 403 Forbidden\n{"error":"Forbidden"}\n\nHTTP/1.1 204 No Content',
          explanation: [
            'No credentials → 401: the client should log in.',
            'Valid user without the role → 403: logging in again will not help.',
          ],
        }),
      ),
      section('real-world', 'Real-world',
        bullets(
          'Identity providers (Auth0, Cognito, Keycloak, Entra ID) handle authN; your API still owns authZ.',
          'Microservices: the gateway may authenticate, but each service must still authorize.',
          'Return 404 instead of 403 when revealing that a resource exists is itself a leak (e.g. `/invoices/123` of another tenant).',
        ),
      ),
      section('mistakes', 'Common mistakes',
        code({
          title: 'Wrong vs right: authenticated is not authorized',
          code: dedent(`
            // ✗ any logged-in user can read any invoice (IDOR)
            app.get('/invoices/:id', authenticate, async (req, res) => {
              res.json(await invoices.findById(req.params.id));
            });

            // ✓ scope the query to the caller
            app.get('/invoices/:id', authenticate, async (req, res) => {
              const inv = await invoices.findOne({ id: req.params.id, ownerId: req.user.id });
              if (!inv) return res.sendStatus(404);
              res.json(inv);
            });
          `),
        }),
        bullets(
          'Returning 403 for missing tokens (should be 401) or 401 for insufficient role (should be 403).',
          'Doing authorization only in the frontend (hiding buttons).',
        ),
      ),
      section('interview', 'Interview angle',
        interviewTip('Use the table: question, input, output, status code. Then give an IDOR example to show you know authentication alone does not protect data.'),
      ),
      section('practice', 'Practice',
        text('For each of these, say authN or authZ and the status on failure: expired JWT; user tries `/admin`; wrong password; editor edits another team\'s doc; missing cookie.'),
      ),
      section('summary', 'Summary',
        bullets(
          'AuthN = identity, AuthZ = permission.',
          '401 = not authenticated; 403 = authenticated but not allowed.',
          'AuthN first, AuthZ per action and resource.',
          'Always check ownership on the server.',
        ),
      ),
    ],
    revisionNotes: [
      'AuthN: who are you → 401 + WWW-Authenticate. AuthZ: may you → 403 (or 404 to hide).',
      'Broken access control = OWASP Top 10 #1 (2021).',
      'Valid token ≠ permission; check ownership per resource (IDOR).',
      'Gateway authN does not remove per-service authZ.',
    ],
    quiz: [
      {
        kind: 'mcq', difficulty: 'beginner',
        prompt: 'A logged-in user with role "viewer" calls `DELETE /posts/5`, which requires "editor". Which status fits best?',
        options: ['400 Bad Request', '401 Unauthorized', '403 Forbidden', '500 Internal Server Error'],
        answer: 2,
        explanation: 'The user is authenticated, so 401 is wrong; they lack permission, so 403.',
      },
      {
        kind: 'scenario', difficulty: 'intermediate',
        prompt: 'Any logged-in user can download any other user\'s invoice by changing the id in the URL. What is missing?',
        options: ['Authentication', 'Object-level authorization (ownership check)', 'HTTPS', 'Rate limiting'],
        answer: 1,
        explanation: 'This is IDOR / broken object level authorization. AuthN works — the server never checks the invoice belongs to the caller.',
      },
    ],
    interview: [
      {
        category: 'express-backend', kind: 'concept', difficulty: 'beginner', topic: 'AuthN vs AuthZ',
        question: 'What is the difference between authentication and authorization?',
        shortAnswer: 'Authentication verifies the caller\'s identity (who you are); authorization decides whether that identity may perform an action on a resource (what you can do).',
        detailedAnswer: [
          'AuthN consumes credentials (password, token, session cookie) and produces an identity.',
          'AuthZ consumes identity + roles/permissions + resource and produces allow/deny.',
          'AuthN happens first; authZ happens per action.',
          'In Express: `authenticate` middleware sets `req.user`; `authorize(...)` middleware or service checks use it.',
        ],
        followUp: 'Which HTTP status codes correspond to each failure?',
        trap: 'Using the terms interchangeably.',
      },
      {
        category: 'express-backend', kind: 'concept', difficulty: 'intermediate', topic: '401 vs 403',
        question: 'When should an API return 401 versus 403, and when might 404 be better than 403?',
        shortAnswer: '401 when the request lacks valid authentication (with a `WWW-Authenticate` header), 403 when the identity is known but not permitted; 404 when even confirming the resource exists would leak information.',
        detailedAnswer: [
          '401: missing, expired or invalid token/cookie — client should (re)authenticate.',
          '403: valid identity, insufficient role/scope/ownership — re-authenticating does not help.',
          '404 for other tenants\' resources prevents enumeration of ids.',
          'Be consistent and document it; clients often trigger a token refresh on 401.',
        ],
        followUp: 'What should a client do when it receives 401 with an expired access token?',
        trap: 'Returning 403 for an expired token, which breaks client refresh logic.',
      },
    ],
  },

  // ───────────────────────────────────────────────────────────
  'password-hashing': {
    summary: 'Store passwords as slow, salted, one-way hashes from a dedicated password-hashing function — Argon2id, scrypt or bcrypt — never as plaintext, encrypted values or fast hashes like SHA-256.',
    topics: ['password hashing', 'salt', 'pepper', 'work factor', 'SHA-256', 'Argon2id', 'scrypt', 'bcrypt', 'rainbow tables', 'GPU cracking'],
    sections: [
      section('introduction', undefined,
        text('Databases leak. When yours does, the only thing standing between attackers and your users\' passwords (reused on other sites) is how you stored them.'),
      ),
      section('definition', 'Key terms',
        bullets(
          '**Hash**: one-way function; you can verify a password but not recover it.',
          '**Salt**: random per-user value (16+ bytes) mixed in, so equal passwords produce different hashes and precomputed rainbow tables are useless.',
          '**Work factor**: tunable cost (iterations, memory) that makes each guess slow.',
          '**Pepper** (optional): a secret key stored outside the DB (e.g. in a KMS), mixed in via HMAC.',
        ),
        table('Choosing an algorithm', ['Algorithm', 'Type', 'Tunable', 'Notes'], [
          ['**Argon2id**', 'Memory-hard', 'memory, iterations, parallelism', 'First choice (OWASP). e.g. m=19 MiB, t=2, p=1. `argon2` npm package'],
          ['**scrypt**', 'Memory-hard', 'N, r, p', 'In Node core: `crypto.scrypt`'],
          ['**bcrypt**', 'CPU-hard', 'cost (log2 rounds)', 'Battle-tested; 72-byte input limit; cost ≥ 10'],
          ['PBKDF2', 'CPU-hard', 'iterations', 'For FIPS needs; 600k iterations with SHA-256 (OWASP)'],
          ['SHA-256 / MD5', 'Fast hash', 'none', '**Never** for passwords'],
        ]),
      ),
      section('why', 'Why SHA-256 is not enough',
        bullets(
          'SHA-256 is designed to be **fast** — a single modern GPU computes billions per second.',
          'Even salted, a leaked hash can be brute-forced against common passwords quickly.',
          'Password hashes are deliberately slow (~50–250 ms) so offline cracking costs attackers millions of times more.',
          'Memory-hard functions (Argon2id, scrypt) also defeat cheap GPU/ASIC parallelism.',
          'Encryption is wrong too: whoever gets the key gets every password.',
        ),
        table('Approaches compared', ['Storage', 'Leak impact'], [
          ['Plaintext', 'All passwords exposed instantly'],
          ['Encrypted', 'All exposed if key leaks (often stored nearby)'],
          ['SHA-256 unsalted', 'Rainbow tables + identical hashes reveal reused passwords'],
          ['SHA-256 salted', 'Fast GPU brute force of weak passwords'],
          ['Argon2id / bcrypt / scrypt', 'Each guess expensive; strong passwords stay safe'],
        ]),
      ),
      section('internals', 'Verification flow',
        steps(
          'Register: generate salt → `hash = H(password, salt, cost)` → store algorithm + params + salt + hash (one encoded string).',
          'Login: load the stored string → recompute with the same salt/params → constant-time compare.',
          'Rehash on login when you raise the cost or change algorithm (the encoded string tells you the old params).',
        ),
      ),
      section('example', 'Fast hash vs password hash (Node core only)',
        code({
          title: 'SHA-256 vs scrypt',
          code: dedent(`
            const crypto = require('node:crypto');
            const { promisify } = require('node:util');
            const scrypt = promisify(crypto.scrypt);

            // ✗ fast, unsalted: same input → same output, every time
            console.log(crypto.createHash('sha256').update('correct horse').digest('hex'));

            async function hashPassword(password) {
              const salt = crypto.randomBytes(16);
              const key = await scrypt(password, salt, 64, { N: 2 ** 17, r: 8, p: 1, maxmem: 256 * 1024 * 1024 });
              return 'scrypt$17$8$1$' + salt.toString('base64') + '$' + key.toString('base64');
            }

            async function verifyPassword(password, stored) {
              const [, logN, r, p, saltB64, keyB64] = stored.split('$');
              const expected = Buffer.from(keyB64, 'base64');
              const key = await scrypt(password, Buffer.from(saltB64, 'base64'), expected.length,
                { N: 2 ** Number(logN), r: Number(r), p: Number(p), maxmem: 256 * 1024 * 1024 });
              return crypto.timingSafeEqual(key, expected);
            }

            (async () => {
              const stored = await hashPassword('correct horse');
              console.log(stored.startsWith('scrypt$17$8$1$'));
              console.log(await verifyPassword('correct horse', stored));
              console.log(await verifyPassword('wrong', stored));
            })();
          `),
          expectedOutput: '4104d36f8da2c254349f85836793ebe029e0c957063a34c91c2e9203187b5631\ntrue\ntrue\nfalse',
          explanation: [
            'The SHA-256 digest is identical for every user with this password — exactly what attackers exploit.',
            'scrypt uses a random salt, so the stored string differs on every run (only the prefix is stable).',
            'Parameters are stored with the hash so they can be raised later.',
            '`crypto.scrypt` runs on the libuv thread pool, so it does not block the event loop.',
          ],
          versionNote: 'N=2^17, r=8, p=1 is the OWASP scrypt baseline and needs ~128 MiB, hence the raised `maxmem`.',
        }),
      ),
      section('real-world', 'Real-world guidance',
        bullets(
          'Use a well-maintained library (`argon2`, `bcrypt`/`bcryptjs`) or Node core `crypto.scrypt` — never roll your own construction.',
          'Benchmark on production hardware: target well under a second per hash, typically ~100–250 ms.',
          'Hashing is CPU/memory heavy — rate-limit login endpoints to avoid self-inflicted DoS.',
          'Allow long passwords and passphrases (NIST: at least 8, accept 64+ characters); check against breached-password lists.',
        ),
      ),
      section('mistakes', 'Common mistakes',
        code({
          title: 'Wrong vs right',
          code: dedent(`
            // ✗ fast hash with a global salt
            const hash = crypto.createHash('sha256').update(SALT + password).digest('hex');

            // ✓ dedicated password hashing (argon2 package, third-party)
            const argon2 = require('argon2');
            const hash = await argon2.hash(password, { type: argon2.argon2id });
            const ok = await argon2.verify(hash, password);
          `),
        }),
        bullets(
          'One global salt — users with the same password still share a hash.',
          'Comparing hashes with `===` (timing leak) instead of the library\'s verify or `timingSafeEqual`.',
          'Logging request bodies on `/login` — plaintext passwords end up in logs.',
        ),
      ),
      section('interview', 'Interview angle',
        interviewTip('Say "slow, salted, memory-hard": Argon2id first, scrypt/bcrypt acceptable. Explain *why* SHA-256 fails (speed) rather than just that it does.'),
      ),
      section('practice', 'Practice',
        text('Time `crypto.scrypt` with N=2^14, 2^15, 2^16 and 2^17 on your machine and pick parameters giving ~100 ms. Add a "needs rehash" check that upgrades old hashes on successful login.'),
      ),
      section('summary', 'Summary',
        bullets(
          'Never plaintext, never encryption, never fast hashes.',
          'Unique random salt per password; store params with the hash.',
          'Argon2id > scrypt ≈ bcrypt > PBKDF2.',
          'Tune the work factor and rehash on login when it rises.',
        ),
      ),
    ],
    revisionNotes: [
      'Password storage = slow, salted, one-way. Argon2id first (OWASP m=19MiB, t=2, p=1).',
      'SHA-256 is fast → GPU brute force; salt alone does not fix speed.',
      'Salt defeats rainbow tables and identical-hash detection; pepper = secret kept outside DB.',
      'Node core has `crypto.scrypt` and `crypto.pbkdf2`; bcrypt/argon2 are npm packages.',
      'Store algorithm + params in the hash string; rehash on login after upgrades.',
    ],
    quiz: [
      {
        kind: 'mcq', difficulty: 'intermediate',
        prompt: 'Why is a salted SHA-256 hash still a poor choice for passwords?',
        options: [
          'SHA-256 is reversible',
          'It is extremely fast, so attackers can test billions of guesses per second offline',
          'Salts make hashes predictable',
          'SHA-256 output is too short',
        ],
        answer: 1,
        explanation: 'The salt stops rainbow tables but not brute force. Password hashes are intentionally slow (and ideally memory-hard).',
      },
      {
        kind: 'mcq', difficulty: 'beginner',
        prompt: 'What does a per-user salt protect against?',
        options: [
          'SQL injection',
          'Precomputed rainbow tables and spotting users who share a password',
          'Phishing',
          'Slow login times',
        ],
        answer: 1,
        explanation: 'With unique salts, the same password produces different hashes, so precomputed tables and duplicate detection fail.',
      },
      {
        kind: 'scenario', difficulty: 'advanced',
        prompt: 'You must raise the bcrypt cost from 10 to 12 for millions of existing users without forcing resets. What do you do?',
        options: [
          'Rehash all stored hashes offline with cost 12',
          'On each successful login, check the stored cost and rehash the plaintext with the new cost',
          'Ask all users to reset passwords',
          'Store a second SHA-256 hash',
        ],
        answer: 1,
        explanation: 'You only have the plaintext at login time. Hashes cannot be "re-costed" offline (except by wrapping, which is more complex). Inactive accounts keep the old cost until they log in.',
      },
    ],
    interview: [
      {
        category: 'express-backend', kind: 'concept', difficulty: 'beginner', topic: 'Password storage',
        question: 'Why should passwords be hashed rather than encrypted?',
        shortAnswer: 'Hashing is one-way: the server only needs to verify a password, never recover it, so there is no key that could leak and expose every password at once.',
        detailedAnswer: [
          'Encrypted passwords can be decrypted by anyone with the key — insiders or attackers who also breach config.',
          'A password hash lets you verify by recomputing with the same salt/params.',
          'Use a slow, salted password hash (Argon2id, scrypt, bcrypt).',
          'Password recovery should be a reset flow, never "email me my password".',
        ],
        followUp: 'What is a salt and why must it be unique per user?',
        trap: 'Saying "encrypt with AES" is secure enough.',
      },
      {
        category: 'express-backend', kind: 'concept', difficulty: 'advanced', topic: 'Hash algorithms',
        question: 'Compare bcrypt, scrypt and Argon2id for password hashing. Which would you choose for a new Node.js service?',
        shortAnswer: 'Argon2id is the modern first choice because it is memory-hard and tunable in memory, time and parallelism; scrypt is also memory-hard and built into Node core; bcrypt is CPU-hard only, battle-tested, but limited to 72 bytes of input.',
        detailedAnswer: [
          'Argon2id: winner of the Password Hashing Competition; OWASP baseline m=19 MiB, t=2, p=1; `argon2` npm package (native).',
          'scrypt: `crypto.scrypt` in Node core, no dependency; OWASP baseline N=2^17, r=8, p=1.',
          'bcrypt: cost factor 10–12+, ~4 KB memory so GPUs/FPGAs parallelise it better; truncates input over 72 bytes.',
          'PBKDF2 only when FIPS compliance requires it, with high iteration counts.',
          'All run off the main thread in Node (libuv pool / native threads) when using async APIs — never use the sync variants in request handlers.',
        ],
        followUp: 'How would you migrate existing bcrypt hashes to Argon2id?',
        trap: 'Saying the choice does not matter as long as there is a salt.',
      },
    ],
  },

  // ───────────────────────────────────────────────────────────
  bcrypt: {
    summary: '`bcrypt` (native) and `bcryptjs` (pure JS) are third-party npm packages exposing `hash(password, cost)` and `compare(password, hash)`; use cost 10–12, the async API, and mind the 72-byte input limit.',
    topics: ['bcrypt', 'bcryptjs', 'hash', 'compare', 'salt rounds', 'cost factor', '$2b$', '72-byte limit', 'getRounds'],
    sections: [
      section('introduction', undefined,
        text('bcrypt is the most widely deployed password hash in Node apps. It is easy to use correctly — if you know its three gotchas: cost, async, and the 72-byte limit.'),
      ),
      section('definition', 'The API',
        table('bcrypt (native) vs bcryptjs (pure JS)', ['', '`bcrypt`', '`bcryptjs`'], [
          ['Implementation', 'C++ addon (node-gyp / prebuilt)', 'Pure JavaScript'],
          ['Speed', 'Faster', '~30% slower'],
          ['Install issues', 'Native build on some platforms', 'None'],
          ['Async work', 'libuv thread pool', 'Chunks work on the main thread (yields via setImmediate)'],
          ['API', '`hash`, `compare`, `genSalt`, `getRounds`', 'Same API'],
        ]),
        bullets(
          '`await bcrypt.hash(password, 12)` — generates a salt internally with cost 12.',
          '`await bcrypt.compare(password, storedHash)` → `true`/`false` (internally constant time).',
          '`bcrypt.getRounds(hash)` reads the cost from a stored hash.',
        ),
      ),
      section('internals', 'Anatomy of a bcrypt hash',
        table('$2b$12$R9h/cIPz0gi.URNNX3kh2OPST9/PgBkqquzi.Ss7KIUgO2t0jWMUW', ['Part', 'Value', 'Meaning'], [
          ['Version', '`$2b$`', 'Algorithm revision (`2a`, `2b`, `2y`)'],
          ['Cost', '`12$`', '2^12 = 4096 rounds of the expensive key setup'],
          ['Salt', '22 chars', '16 random bytes, bcrypt-base64'],
          ['Hash', '31 chars', '23-byte digest'],
          ['Total', '60 chars', 'Store in a `VARCHAR(60)`/`TEXT` column'],
        ]),
        bullets(
          'Each +1 in cost **doubles** the time.',
          'bcrypt only uses the first **72 bytes** of the password (UTF-8 bytes, not characters). Most implementations silently ignore the rest.',
          'Emoji and non-Latin scripts use 3–4 bytes per character, so the limit can be hit at ~18 characters.',
        ),
      ),
      section('example', 'Register and login with bcrypt',
        code({
          title: 'Hashing and comparing',
          code: dedent(`
            const bcrypt = require('bcrypt'); // or require('bcryptjs') — same API
            const COST = 12;

            async function register(email, password) {
              if (Buffer.byteLength(password, 'utf8') > 72) throw new Error('Password too long (max 72 bytes)');
              const passwordHash = await bcrypt.hash(password, COST);
              console.log(passwordHash.length, passwordHash.slice(0, 7));
              return passwordHash;
            }

            async function login(password, passwordHash) {
              const ok = await bcrypt.compare(password, passwordHash);
              if (ok && bcrypt.getRounds(passwordHash) < COST) {
                console.log('rehash needed');
              }
              return ok;
            }

            (async () => {
              const h = await register('ada@example.com', 'correct horse battery staple');
              console.log(await login('correct horse battery staple', h));
              console.log(await login('Correct horse battery staple', h));
            })();
          `),
          expectedOutput: '60 $2b$12$\ntrue\nfalse',
          explanation: [
            'Every hash is 60 characters and starts with version + cost.',
            'The salt is embedded, so `compare` needs only the stored string.',
            'Comparison is case-sensitive — it is a different password.',
          ],
        }),
        code({
          title: 'The 72-byte truncation',
          code: dedent(`
            const bcrypt = require('bcrypt');
            const base = 'a'.repeat(72);

            (async () => {
              const h = await bcrypt.hash(base + 'SECRET-SUFFIX', 10);
              console.log(await bcrypt.compare(base + 'anything-else', h));
            })();
          `),
          expectedOutput: 'true',
          explanation: [
            'Only the first 72 bytes matter, so two different long passwords verify equally.',
            'Mitigate by rejecting >72-byte inputs, or switch to Argon2id. Pre-hashing (e.g. HMAC-SHA-256 → base64 before bcrypt) works but must avoid raw binary output containing NUL bytes.',
          ],
          versionNote: 'Behaviour of the native `bcrypt` package; check your library — newer `bcryptjs` versions document the same truncation.',
        }),
      ),
      section('real-world', 'Production tips',
        bullets(
          'Cost 10 is the minimum; 12 is common today. Measure — aim for ~100–250 ms per hash.',
          'Login endpoints become CPU-heavy: rate-limit them and size the libuv thread pool (`UV_THREADPOOL_SIZE`, default 4) for native bcrypt.',
          'To prevent user enumeration by timing, run `compare` against a dummy hash when the email does not exist.',
        ),
      ),
      section('mistakes', 'Common mistakes',
        code({
          title: 'Wrong vs right: sync API in a request handler',
          code: dedent(`
            // ✗ blocks the event loop ~250 ms per login → every other request waits
            app.post('/login', (req, res) => {
              const ok = bcrypt.compareSync(req.body.password, user.passwordHash);
              res.json({ ok });
            });

            // ✓ async version runs off the main thread (native bcrypt)
            app.post('/login', async (req, res) => {
              const ok = await bcrypt.compare(req.body.password, user.passwordHash);
              res.json({ ok });
            });
          `),
        }),
        bullets(
          'Comparing `await bcrypt.hash(input) === stored` — a new salt makes it always false. Use `compare`.',
          'Using a cost of 4–8 copied from tests into production.',
          'Silently accepting >72-byte passwords and assuming the whole thing is checked.',
        ),
      ),
      section('interview', 'Interview angle',
        interviewTip('Name the three gotchas: cost factor doubling, async vs sync (event loop), and the 72-byte limit. Knowing the hash format ($2b$cost$salt+hash) is a nice bonus.'),
      ),
      section('practice', 'Practice',
        text('Benchmark `bcrypt.hash` with costs 10–14 and plot the time. Implement login that always runs `compare` (against a dummy hash for unknown emails) and measure that timings are similar.'),
      ),
      section('summary', 'Summary',
        bullets(
          '`hash(pw, cost)` + `compare(pw, hash)`; salt is embedded.',
          'Cost 10–12+; each +1 doubles time.',
          'Always async in servers.',
          'Max 72 bytes of input — enforce it or use Argon2id.',
        ),
      ),
    ],
    revisionNotes: [
      'bcrypt hash: `$2b$12$` + 22-char salt + 31-char hash = 60 chars.',
      'Cost is log2: 12 → 4096 rounds; +1 doubles time.',
      'Use `compare`, never re-hash and `===`.',
      'Only first 72 bytes are used — reject longer or use Argon2id.',
      '`bcrypt` (native, thread pool) vs `bcryptjs` (pure JS); both third-party.',
      'Never `hashSync`/`compareSync` in request handlers.',
    ],
    quiz: [
      {
        kind: 'find-bug', difficulty: 'intermediate',
        prompt: 'Why does login always fail?',
        code: "const hash = await bcrypt.hash(req.body.password, 12);\nif (hash !== user.passwordHash) return res.sendStatus(401);",
        options: [
          'Cost 12 is too high',
          'Each hash uses a new random salt, so the strings never match; use bcrypt.compare',
          'bcrypt.hash is synchronous',
          'passwordHash must be base64 decoded',
        ],
        answer: 1,
        explanation: '`compare` extracts the salt and cost from the stored hash and recomputes. A fresh `hash` call generates a different salt.',
      },
      {
        kind: 'mcq', difficulty: 'intermediate',
        prompt: 'Going from cost 10 to cost 12 makes hashing roughly…',
        options: ['20% slower', '2× slower', '4× slower', '100× slower'],
        answer: 2,
        explanation: 'Cost is an exponent of 2: each step doubles the work, so two steps = 4×.',
      },
      {
        kind: 'scenario', difficulty: 'advanced',
        prompt: 'A user sets an 80-character passphrase made of emoji. Later, a different string sharing the first 18 emoji also logs in. Why?',
        options: [
          'bcrypt is case-insensitive',
          'bcrypt only processes the first 72 bytes and each emoji is 4 UTF-8 bytes',
          'The salt was reused',
          'compare is not constant-time',
        ],
        answer: 1,
        explanation: '18 × 4 = 72 bytes. Everything after is ignored. Enforce a byte limit or use Argon2id.',
      },
    ],
    interview: [
      {
        category: 'express-backend', kind: 'concept', difficulty: 'beginner', topic: 'bcrypt',
        question: 'What is the bcrypt cost factor (salt rounds) and how do you choose it?',
        shortAnswer: 'It is the base-2 logarithm of the number of key-setup rounds; each +1 doubles hashing time. Pick the highest value that keeps a hash around 100–250 ms on your servers — 10 minimum, 12 is typical.',
        detailedAnswer: [
          'Cost 12 = 2^12 rounds; it is stored in the hash (`$2b$12$`).',
          'Higher cost slows attackers proportionally.',
          'Too high hurts login latency and invites CPU exhaustion — combine with rate limiting.',
          'Raise over time and rehash on successful login.',
        ],
        followUp: 'How do you read the cost from an existing hash?',
        trap: 'Thinking "salt rounds" means the number of salts generated.',
      },
      {
        category: 'express-backend', kind: 'concept', difficulty: 'intermediate', topic: 'bcrypt format',
        question: 'What information is stored inside a bcrypt hash string, and why do you not need a separate salt column?',
        shortAnswer: 'The string encodes the algorithm version, cost and 16-byte salt followed by the digest (`$2b$12$<22-char salt><31-char hash>`), so `compare` can recompute from the stored value alone.',
        detailedAnswer: [
          '`$2b$` version, `12` cost, 22 chars of salt, 31 chars of hash — 60 chars total.',
          'Self-describing format lets you change cost without schema changes.',
          'Same pattern in Argon2 (`$argon2id$v=19$m=19456,t=2,p=1$salt$hash`).',
          'Store as a string column; never truncate.',
        ],
        followUp: 'How do you detect hashes that need upgrading?',
        trap: 'Generating and storing salts manually alongside bcrypt hashes.',
      },
      {
        category: 'express-backend', kind: 'concept', difficulty: 'advanced', topic: 'bcrypt limits',
        question: 'What is the bcrypt 72-byte limit, and how would you handle it?',
        shortAnswer: 'bcrypt only uses the first 72 bytes of input, so longer passwords are effectively truncated; enforce a 72-byte maximum, or pre-hash safely, or use Argon2id which has no such limit.',
        detailedAnswer: [
          'Bytes, not characters — multi-byte UTF-8 hits it sooner.',
          'Many libraries silently truncate; two passwords with the same 72-byte prefix verify equally.',
          'Pre-hashing: `bcrypt(base64(HMAC-SHA256(pepper, password)))` — base64 avoids NUL bytes that some implementations stop at.',
          'Pre-hashing with plain SHA-256 risks "password shucking" if unsalted fast hashes of the same password leaked elsewhere — an HMAC with a secret pepper avoids that.',
          'Simplest modern answer: use Argon2id for new systems.',
        ],
        followUp: 'What is password shucking?',
        trap: 'Assuming bcrypt hashes the full input of any length.',
      },
    ],
  },

  // ───────────────────────────────────────────────────────────
  jwt: {
    summary: 'A JWT is `base64url(header).base64url(payload).signature` — signed (tamper-evident) but not encrypted — verified with a pinned algorithm list and checked claims (`exp`, `nbf`, `iss`, `aud`).',
    topics: ['JWT', 'JWS', 'base64url', 'header', 'payload', 'signature', 'HS256', 'RS256', 'ES256', 'alg none', 'algorithm confusion', 'claims', 'jsonwebtoken', 'jose', 'JWKS'],
    sections: [
      section('introduction', undefined,
        text('JWTs let a server verify a token without a database lookup: the token itself carries claims and a signature. That power comes with sharp edges.'),
      ),
      section('definition', 'Structure',
        bullets(
          '**Header**: `{"alg":"HS256","typ":"JWT"}` — signing algorithm (and optional `kid` key id).',
          '**Payload**: claims like `sub`, `exp`, plus your own (`role`).',
          '**Signature**: `HMAC/RSA/ECDSA(base64url(header) + "." + base64url(payload), key)`.',
          'Each part is base64url (URL-safe, no padding). Anyone can **decode** it — it is **signed, not encrypted**. (Encrypted JWTs are JWE, rarely used.)',
        ),
        table('Registered claims', ['Claim', 'Meaning', 'Verify?'], [
          ['`sub`', 'Subject (user id)', 'Use as identity'],
          ['`exp`', 'Expiry (seconds since epoch)', 'Reject if past'],
          ['`nbf`', 'Not before', 'Reject if future'],
          ['`iat`', 'Issued at', 'Optional max-age checks'],
          ['`iss`', 'Issuer', 'Must equal expected issuer'],
          ['`aud`', 'Audience (intended API)', 'Must include this API'],
          ['`jti`', 'Unique token id', 'Used for revocation lists'],
        ]),
        table('HS256 vs RS256', ['', 'HS256 (HMAC)', 'RS256 / ES256 (asymmetric)'], [
          ['Keys', 'One shared secret', 'Private key signs, public key verifies'],
          ['Who can sign', 'Anyone with the secret (all verifiers!)', 'Only the issuer'],
          ['Distribution', 'Secret copied to each service', 'Public keys via JWKS endpoint'],
          ['Use when', 'Single service issues and verifies', 'Many services / third parties verify; IdPs'],
          ['Secret strength', '≥ 256 random bits', 'RSA ≥ 2048 bits, or P-256 for ES256'],
        ]),
      ),
      section('why', 'Why JWTs (and why not)',
        bullets(
          'Stateless verification — good for APIs and microservices.',
          'Standard format, libraries everywhere, used by OAuth/OIDC.',
          'Downside: hard to revoke before `exp`, size grows with claims, and misconfigured verification is catastrophic.',
        ),
      ),
      section('internals', 'Verification steps',
        steps(
          'Split on `.`; must be exactly 3 parts.',
          'Decode header; **ignore its `alg` for key choice** — use the algorithms you configured.',
          'Recompute the signature with the expected key; compare in constant time.',
          'Check `exp`/`nbf` (with small clock tolerance), `iss`, `aud`.',
          'Only then trust `sub` and other claims.',
        ),
        diagram('jwt-flow', 'Login issues tokens; every API call verifies the signature and claims.'),
      ),
      section('visual', 'The alg attacks',
        table('Classic JWT attacks', ['Attack', 'How', 'Defence'], [
          ['`alg: none`', 'Attacker sets header `{"alg":"none"}` and drops the signature', 'Whitelist algorithms; modern libs reject `none` by default'],
          ['Algorithm confusion', 'Server expects RS256; attacker sends HS256 signed with the **public key** as the HMAC secret', 'Pin `algorithms: ["RS256"]`; keep key types separate'],
          ['Weak HS256 secret', 'Offline brute force of `"secret"`/`"changeme"`', '≥ 32 random bytes from a secrets manager'],
          ['`kid`/`jku` injection', 'Header points to attacker key or path', 'Only resolve `kid` against your own JWKS'],
        ]),
      ),
      section('example', 'Signing and verifying with jsonwebtoken (third-party)',
        code({
          title: 'Decode is not verify',
          code: dedent(`
            const token = '${SAMPLE_JWT}';
            const [h, p] = token.split('.');
            console.log(Buffer.from(h, 'base64url').toString());
            console.log(Buffer.from(p, 'base64url').toString());
          `),
          expectedOutput: '{"alg":"HS256","typ":"JWT"}\n{"sub":"42","role":"user","iat":1767225600,"exp":1767226500,"iss":"api.example.com","aud":"web"}',
          explanation: [
            'No key needed to read a JWT — never put secrets or PII you would not show the user in the payload.',
            '`exp - iat` = 900 s → a 15-minute token issued 2026-01-01T00:00:00Z.',
          ],
        }),
        code({
          title: 'sign + verify safely',
          code: dedent(`
            const jwt = require('jsonwebtoken');
            const SECRET = process.env.JWT_SECRET; // ≥ 32 random bytes

            const token = jwt.sign({ role: 'user' }, SECRET, {
              algorithm: 'HS256',
              subject: '42',
              expiresIn: '15m',
              issuer: 'api.example.com',
              audience: 'web',
            });

            function verify(t) {
              try {
                const claims = jwt.verify(t, SECRET, {
                  algorithms: ['HS256'],          // pin the algorithm
                  issuer: 'api.example.com',
                  audience: 'web',
                  clockTolerance: 5,              // seconds of clock skew
                });
                return 'ok sub=' + claims.sub;
              } catch (err) {
                return err.name + ': ' + err.message;
              }
            }

            console.log(verify(token));
            console.log(verify(token.slice(0, -2) + 'xx'));                 // tampered signature
            console.log(verify(jwt.sign({ sub: '42' }, SECRET, { expiresIn: -10 })));
            console.log(verify('eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.' + token.split('.')[1] + '.'));
          `),
          expectedOutput: 'ok sub=42\nJsonWebTokenError: invalid signature\nTokenExpiredError: jwt expired\nJsonWebTokenError: jwt signature is required',
          explanation: [
            'Tampering with any byte breaks the signature.',
            'An already-expired token raises `TokenExpiredError` (map it to 401 `TOKEN_EXPIRED`).',
            'The forged `alg: none` token is rejected because a secret was supplied and `none` is not in `algorithms`.',
          ],
          versionNote: 'jsonwebtoken v9 behaviour. `jose` (third-party, zero-dependency, also works in edge runtimes) is a popular alternative.',
        }),
      ),
      section('real-world', 'Real-world usage',
        bullets(
          'Identity providers sign with RS256/ES256 and publish keys at a JWKS URL; APIs cache and rotate by `kid`.',
          'Keep payloads small: `sub`, roles/scopes, `exp`. Load the rest from the DB if needed.',
          'Use JWTs mainly as short-lived access tokens; pair with refresh tokens or sessions.',
        ),
      ),
      section('mistakes', 'Common mistakes',
        code({
          title: 'Wrong vs right',
          code: dedent(`
            // ✗ decode() does NOT check the signature
            const user = jwt.decode(req.get('authorization').slice(7));

            // ✗ no algorithm pinning, no iss/aud checks
            const user2 = jwt.verify(token, publicKeyOrSecret);

            // ✓
            const user3 = jwt.verify(token, publicKey, { algorithms: ['RS256'], issuer: ISS, audience: AUD });
          `),
        }),
        bullets(
          'Putting passwords, emails or internal ids you consider secret in the payload — it is readable.',
          'Long-lived (days/weeks) access JWTs with no revocation strategy.',
          'Hard-coded weak secrets checked into git.',
        ),
      ),
      section('interview', 'Interview angle',
        interviewTip('Draw the three parts, say "signed not encrypted", then go straight to verification hygiene: pinned algorithms, iss/aud/exp, strong keys, short expiry. Mentioning alg-confusion shows depth.'),
      ),
      section('practice', 'Practice',
        text('Generate an RSA key pair with `crypto.generateKeyPairSync("rsa", { modulusLength: 2048 })`, sign an RS256 token, and verify it. Then try verifying with `algorithms: ["HS256"]` and observe the error.'),
      ),
      section('summary', 'Summary',
        bullets(
          'JWT = header.payload.signature, base64url, readable by anyone.',
          'Verify with pinned `algorithms`, plus `exp`, `iss`, `aud`.',
          'HS256 = shared secret; RS256/ES256 = private signs, public verifies.',
          'Short-lived, small, never secret content.',
        ),
      ),
    ],
    revisionNotes: [
      'JWT parts base64url-encoded; signature covers `header.payload`; payload is NOT encrypted.',
      'Always `jwt.verify(token, key, { algorithms: [...], issuer, audience })`; `jwt.decode` does not verify.',
      '`alg: none` and RS256→HS256 confusion are prevented by algorithm pinning.',
      'Claims: `sub`, `exp`, `nbf`, `iat`, `iss`, `aud`, `jti`; times in seconds.',
      'HS256 secret ≥ 256 bits; asymmetric keys published via JWKS with `kid` rotation.',
      'jsonwebtoken errors: `TokenExpiredError`, `JsonWebTokenError`, `NotBeforeError`.',
    ],
    quiz: [
      {
        kind: 'mcq', difficulty: 'beginner',
        prompt: 'Who can read the payload of a standard (JWS) JWT?',
        options: ['Only the server with the secret', 'Anyone who has the token', 'Only the issuer', 'Nobody — it is encrypted'],
        answer: 1,
        explanation: 'The payload is base64url-encoded JSON. The signature prevents modification, not reading.',
      },
      {
        kind: 'find-bug', difficulty: 'advanced',
        prompt: 'This API uses RS256 tokens from an identity provider. What is the vulnerability?',
        code: "const claims = jwt.verify(token, PUBLIC_KEY_PEM);\nreq.user = { id: claims.sub };",
        options: [
          'RS256 is insecure',
          'No `algorithms` whitelist (and no iss/aud checks) — enables algorithm confusion and accepting tokens meant for other audiences',
          'The public key should be secret',
          'sub is not a valid claim',
        ],
        answer: 1,
        explanation: 'Always pin algorithms. Modern jsonwebtoken refuses HS256 with an RSA key by default, but relying on library defaults is fragile, and missing `aud` lets tokens issued for another app work here.',
      },
      {
        kind: 'predict-output', difficulty: 'intermediate',
        prompt: 'What does this print?',
        code: "const token = jwt.sign({ sub: '1' }, 's3cret', { expiresIn: '1h' });\nconst parts = token.split('.');\nconsole.log(parts.length, JSON.parse(Buffer.from(parts[1], 'base64url')).sub);",
        options: ['2 1', '3 1', '3 undefined', 'Throws: payload is encrypted'],
        answer: 1,
        explanation: 'Three dot-separated parts; the payload decodes to JSON without any key.',
      },
    ],
    interview: [
      {
        category: 'express-backend', kind: 'concept', difficulty: 'beginner', topic: 'JWT',
        question: 'What are the three parts of a JWT and what does each contain?',
        shortAnswer: 'A base64url header (algorithm, type, optional key id), a base64url payload of claims, and a signature over `header.payload` made with the issuer\'s key.',
        detailedAnswer: [
          'Header: `{"alg":"HS256","typ":"JWT"}`.',
          'Payload: registered claims (`sub`, `exp`, `iss`, `aud`) and custom claims.',
          'Signature: HMAC or RSA/ECDSA signature — tamper evidence.',
          'Encoded parts are joined with dots and safe to put in an Authorization header.',
        ],
        followUp: 'Is the payload encrypted?',
        trap: 'Calling base64url "encryption".',
      },
      {
        category: 'express-backend', kind: 'concept', difficulty: 'intermediate', topic: 'JWT signing',
        question: 'When would you use HS256 versus RS256 for JWTs?',
        shortAnswer: 'HS256 when the same trusted service both issues and verifies (one shared secret); RS256/ES256 when many services or third parties verify, because they only need the public key and cannot mint tokens.',
        detailedAnswer: [
          'HS256: symmetric; every verifier can also sign — risky in microservices.',
          'RS256/ES256: asymmetric; publish public keys via JWKS, rotate with `kid`.',
          'ES256 tokens are smaller and faster to sign than RS256.',
          'Whatever you pick, pin it in `verify({ algorithms })`.',
        ],
        followUp: 'How do you rotate signing keys without logging everyone out?',
        trap: 'Thinking RS256 encrypts the payload.',
      },
      {
        category: 'express-backend', kind: 'concept', difficulty: 'advanced', topic: 'JWT attacks',
        question: 'Explain the "alg: none" and algorithm-confusion attacks on JWTs and how to prevent them.',
        shortAnswer: 'Both abuse servers that trust the token\'s own `alg` header: `none` removes the signature entirely, and confusion makes an RS256 verifier treat its public key as an HS256 secret the attacker can also use; prevent both by pinning allowed algorithms and binding keys to algorithms.',
        detailedAnswer: [
          '`alg: none`: unsigned token accepted by naive libraries — patched in modern libs, but still test for it.',
          'Confusion: attacker signs HMAC with the public RSA key (which is public) → naive `verify(token, publicKey)` accepts it.',
          'Defence: `algorithms: ["RS256"]`, typed key objects (`crypto.createPublicKey`), libraries that refuse mismatched key types.',
          'Also validate `iss`, `aud`, `exp`; restrict `kid` to your JWKS; never fetch `jku` URLs from the token.',
          'Keep libraries updated — jsonwebtoken v9 tightened several defaults.',
        ],
        followUp: 'Why is the `kid` header a potential injection point?',
        trap: 'Believing that verifying "the signature" is enough without pinning algorithms.',
      },
    ],
  },
};

export default content;
