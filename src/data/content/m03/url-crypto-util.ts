import type { ModuleContent } from '../../../types';
import { bullets, code, dedent, diagram, flow, interviewTip, section, steps, table, text, tip } from '../helpers';

const content: Partial<ModuleContent> = {
  // ───────────────────────────────────────────────────────────
  'url-module': {
    summary: 'Use the WHATWG `URL` class (global, also exported by `node:url`) and `URLSearchParams` to parse and build URLs; `node:url` adds `fileURLToPath`/`pathToFileURL`. Legacy `url.parse()` is deprecated.',
    topics: ['URL', 'URLSearchParams', 'WHATWG URL', 'url.parse deprecated', 'fileURLToPath', 'pathToFileURL', 'URL.canParse', 'query strings', 'encoding'],
    sections: [
      section('introduction', undefined,
        text('Query strings, redirects, OAuth callbacks, webhook URLs — string slicing them is a bug factory. The `URL` class parses and builds URLs exactly as browsers do.'),
      ),
      section('definition', 'Definition',
        bullets(
          '`new URL(input, base?)` — parses an absolute URL, or a relative one against `base`. Throws `TypeError` (`ERR_INVALID_URL`) if invalid.',
          '`url.searchParams` — a live `URLSearchParams` object for the query string.',
          '`URL` and `URLSearchParams` are globals in Node 10+ — no import needed.',
          '`url.parse()` / `url.format(urlObject)` are the **legacy** API: deprecated (DEP0169), inconsistent with browsers and with known security pitfalls. Do not use them in new code.',
        ),
      ),
      section('why', 'Why WHATWG URL',
        bullets(
          'Same behaviour as browsers and `fetch`.',
          'Correct percent-encoding when you set components.',
          'Normalizes host names, default ports, `..` in paths.',
        ),
      ),
      section('internals', 'Anatomy of a URL',
        flow([
          'protocol: https:',
          'username:password@ (rare)',
          'hostname: api.shop.com',
          'port: 8443',
          'pathname: /v1/orders',
          'search: ?status=paid&page=2',
          'hash: #top',
        ], { title: 'https://api.shop.com:8443/v1/orders?status=paid&page=2#top', direction: 'horizontal' }),
        bullets(
          '`host` = hostname + port; `origin` = protocol + host.',
          'Default ports are dropped: `https://x.com:443` → `port === \'\'`.',
          'Node\'s implementation (Ada, a C++ parser since Node 18.17/20) is very fast.',
        ),
      ),
      section('visual', 'Important APIs',
        table('url — important APIs', ['API', 'What it does', 'Style'], [
          ['`new URL(input, base?)`', 'Parse/resolve; throws on invalid input', 'sync'],
          ['`URL.canParse(input, base?)`', 'Validate without try/catch (Node 19.9 / 18.17+)', 'sync'],
          ['`URL.parse(input, base?)`', 'Returns `null` instead of throwing (Node 22.1+)', 'sync'],
          ['`url.searchParams.get/getAll/set/append/delete/has`', 'Read/modify the query string', 'sync'],
          ['`new URLSearchParams(obj | string)`', 'Build `a=1&b=2` with correct encoding', 'sync'],
          ['`url.href` / `url.toString()` / `JSON.stringify(url)`', 'Serialize', 'sync'],
          ['`fileURLToPath(url)` (node:url)', '`file:///a/b.js` → `/a/b.js` (platform-correct)', 'sync'],
          ['`pathToFileURL(path)` (node:url)', 'Path → `file://` URL (for dynamic `import()`)', 'sync'],
          ['`url.parse()` (legacy)', 'Deprecated — do not use', 'sync'],
        ]),
      ),
      section('example', 'Examples',
        code({
          title: 'Parse and modify a URL',
          runnable: true,
          code: dedent(`
            const u = new URL('https://api.shop.com:8443/v1/orders?status=paid&page=2#top');
            console.log(u.hostname, u.port, u.pathname);
            console.log(u.searchParams.get('status'), u.searchParams.get('page'));

            u.searchParams.set('page', '3');
            u.searchParams.append('tag', 'black friday');
            console.log(u.search);

            const rel = new URL('../users?id=7', 'https://api.shop.com/v1/orders/');
            console.log(rel.href);
          `),
          expectedOutput: 'api.shop.com 8443 /v1/orders\npaid 2\n?status=paid&page=3&tag=black+friday\nhttps://api.shop.com/v1/users?id=7',
          explanation: [
            'All values are strings — `page` is `\'2\'`, not a number.',
            'Setting params re-encodes the query; spaces become `+` in `searchParams`.',
            'Relative URLs are resolved against the base like a browser would.',
          ],
        }),
        code({
          title: 'Validate untrusted input',
          runnable: true,
          code: dedent(`
            function safeRedirect(target) {
              let u;
              try { u = new URL(target, 'https://myapp.com'); } catch { return '/'; }
              return u.origin === 'https://myapp.com' ? u.pathname + u.search : '/';
            }
            console.log(safeRedirect('/dashboard?tab=2'));
            console.log(safeRedirect('https://evil.com/phish'));
            console.log(safeRedirect('//evil.com'));
          `),
          expectedOutput: '/dashboard?tab=2\n/\n/',
          explanation: [
            'Open-redirect protection: compare the parsed `origin`, not a string prefix.',
            '`//evil.com` is protocol-relative — it resolves to `https://evil.com`, so it is rejected.',
          ],
        }),
        code({
          title: 'File URLs in ESM',
          code: dedent(`
            import { fileURLToPath, pathToFileURL } from 'node:url';
            console.log(fileURLToPath(import.meta.url));
            console.log(pathToFileURL('/srv/app/plugins/a.js').href);
          `),
          expectedOutput: '/srv/app/index.mjs\nfile:///srv/app/plugins/a.js',
          explanation: ['On Windows `fileURLToPath` returns `C:\\srv\\app\\index.mjs`. Never do `new URL(import.meta.url).pathname` — it breaks on Windows and with encoded characters (paths vary).'],
        }),
      ),
      section('real-world', 'Real-world usage',
        code({
          title: 'Building a paginated API link',
          code: dedent(`
            function nextLink(reqUrl, page) {
              const u = new URL(reqUrl, 'https://api.shop.com');
              u.searchParams.set('page', String(page + 1));
              return u.href;
            }
            console.log(nextLink('/v1/orders?status=paid&page=1', 1));
          `),
          expectedOutput: 'https://api.shop.com/v1/orders?status=paid&page=2',
          explanation: ['In a raw `http` server, `req.url` is only `/path?query`, so a base is required.'],
        }),
      ),
      section('mistakes', 'Common mistakes',
        bullets(
          'Using deprecated `url.parse(req.url, true).query` — switch to `new URL(req.url, base).searchParams`.',
          'Building query strings by hand without encoding → `&` or `#` in values breaks the URL.',
          'Forgetting the base: `new URL(\'/path\')` throws `Invalid URL`.',
          'Comparing URLs as strings for security checks — compare `origin`/`hostname` after parsing.',
          'Expecting numbers from `searchParams.get` — it returns strings or `null`.',
        ),
        code({
          title: 'Legacy vs modern',
          code: dedent(`
            // ✗ legacy, deprecated
            const { query } = require('node:url').parse(req.url, true);

            // ✓ WHATWG
            const { searchParams } = new URL(req.url, 'http://localhost');
            const page = Number(searchParams.get('page') ?? 1);
          `),
          explanation: ['Same result, browser-compatible parsing, no deprecation warning.'],
        }),
      ),
      section('interview', 'Interview tips',
        interviewTip('Say "WHATWG URL, `url.parse` is legacy/deprecated", show `searchParams`, and mention `fileURLToPath(import.meta.url)` for ESM — three signals of modern Node knowledge.'),
      ),
      section('practice', 'Practice',
        steps('Write `withQuery(url, obj)` that merges an object into a URL\'s query string.', 'Extend `safeRedirect` to allow a list of trusted origins.'),
      ),
      section('summary', 'Summary',
        bullets(
          '`URL` and `URLSearchParams` are global and browser-compatible.',
          '`url.parse` is legacy and deprecated.',
          'Always pass a base for relative input (e.g. `req.url`).',
          '`fileURLToPath` / `pathToFileURL` bridge URLs and paths.',
        ),
      ),
    ],
    revisionNotes: [
      'new URL(input, base) throws TypeError on invalid input.',
      'URL.canParse (18.17+), URL.parse returns null (22.1+).',
      'searchParams values are strings; spaces encode as +.',
      'url.parse legacy, DEP0169 — avoid.',
      'fileURLToPath(import.meta.url) for paths in ESM.',
      'Security: compare parsed origin, not string prefixes.',
    ],
    quiz: [
      {
        kind: 'predict-output', difficulty: 'beginner',
        prompt: 'What is printed?',
        code: "const u = new URL('https://shop.com/items?page=2');\nconsole.log(typeof u.searchParams.get('page'), u.searchParams.get('size'));",
        options: ['number null', 'string undefined', 'string null', 'number undefined'],
        answer: 2,
        explanation: 'searchParams.get always returns a string, or null (not undefined) when the key is missing.',
      },
      {
        kind: 'mcq', difficulty: 'beginner',
        prompt: 'What is the recommended replacement for `url.parse(req.url, true)`?',
        options: ['querystring.parse(req.url)', 'new URL(req.url, \'http://localhost\')', 'JSON.parse(req.url)', 'path.parse(req.url)'],
        answer: 1,
        explanation: 'The WHATWG URL class with a base handles path-only req.url values. querystring only parses the query part and path.parse is for file paths.',
      },
      {
        kind: 'find-bug', difficulty: 'intermediate',
        prompt: 'This ESM code works on macOS but fails on Windows. Why?',
        code: "const dir = new URL('.', import.meta.url).pathname;\nconst data = await readFile(dir + 'data.json');",
        options: ['readFile cannot read JSON', 'pathname gives "/C:/..." and keeps percent-encoding; use fileURLToPath', 'import.meta.url is undefined on Windows', 'The . base is invalid'],
        answer: 1,
        explanation: 'URL pathnames are not file paths. fileURLToPath converts correctly per platform and decodes characters such as %20.',
      },
    ],
    interview: [
      {
        category: 'nodejs', kind: 'concept', difficulty: 'beginner', topic: 'url',
        question: 'Why is url.parse() discouraged and what should you use instead?',
        shortAnswer: '`url.parse` is the legacy, Node-specific parser — deprecated and inconsistent with browsers, with known hostname-spoofing pitfalls. Use the WHATWG `URL` class and `URLSearchParams`.',
        detailedAnswer: [
          'WHATWG URL follows the same spec as browsers and fetch.',
          '`new URL(req.url, base)` works for path-only inputs.',
          '`searchParams` gives get/set/append/has with correct encoding.',
          'Validation: `URL.canParse` or try/catch around `new URL`.',
        ],
        followUp: 'How would you prevent open redirects using URL?',
        trap: 'Assuming `url.parse` and `new URL` produce identical results for every input.',
      },
      {
        category: 'nodejs', kind: 'concept', difficulty: 'intermediate', topic: 'url',
        question: 'How do you correctly turn import.meta.url into a file system path, and why not use .pathname?',
        shortAnswer: 'Use `fileURLToPath(import.meta.url)` from `node:url` (or `import.meta.filename` on Node 20.11+). `.pathname` is a URL path: it keeps percent-encoding and produces `/C:/…` on Windows.',
        detailedAnswer: [
          'import.meta.url is a `file://` URL string.',
          'fileURLToPath decodes `%20` etc. and applies platform separators.',
          'The reverse, `pathToFileURL`, is needed for `import()` of absolute Windows paths.',
          '`import.meta.dirname` removes the need for the conversion on new Node versions.',
        ],
        followUp: 'Why does `import(\'C:\\\\app\\\\x.js\')` fail on Windows?',
        trap: 'Using `new URL(import.meta.url).pathname` and only testing on Linux.',
      },
    ],
  },

  // ───────────────────────────────────────────────────────────
  'crypto-module': {
    summary: '`node:crypto` provides hashing (`createHash`), message authentication (`createHmac`), secure randomness (`randomBytes`, `randomUUID`), password hashing (`scrypt`), constant-time comparison (`timingSafeEqual`) and encryption (`createCipheriv`).',
    topics: ['crypto', 'createHash', 'createHmac', 'randomBytes', 'randomUUID', 'scrypt', 'pbkdf2', 'timingSafeEqual', 'createCipheriv', 'AES-256-GCM', 'webcrypto', 'password hashing', 'webhook signatures'],
    sections: [
      section('introduction', undefined,
        text('Passwords, API tokens, webhook signatures, session IDs, file checksums — security-critical code that should use well-tested primitives from OpenSSL, not homemade tricks.'),
      ),
      section('definition', 'Definition',
        bullets(
          '**Hash** (`sha256`): one-way fingerprint of data. Same input → same output; no key.',
          '**HMAC**: hash with a secret key — proves the sender knows the key (signatures).',
          '**KDF / password hash** (`scrypt`, `pbkdf2`): deliberately slow, salted hash for passwords.',
          '**Cipher** (`aes-256-gcm`): reversible encryption with a key.',
          '**CSPRNG** (`randomBytes`, `randomUUID`, `randomInt`): unpredictable random values.',
        ),
      ),
      section('why', 'Why it matters',
        bullets(
          '`Math.random()` is predictable — never use it for tokens.',
          'Fast hashes (sha256) are wrong for passwords: attackers try billions per second.',
          'String `===` on secrets leaks timing information.',
        ),
      ),
      section('internals', 'Where the work happens',
        bullets(
          'Backed by OpenSSL (BoringSSL-compatible APIs) compiled into Node.',
          '`createHash`/`createHmac` run synchronously on the main thread (fast, small data).',
          'Async `scrypt`, `pbkdf2`, `randomBytes(n, cb)`, `generateKeyPair` run on the **libuv thread pool** — the `*Sync` versions block the event loop.',
          '`crypto.webcrypto` / `globalThis.crypto` provide the browser-compatible Web Crypto API (global since Node 19 — Node 17.6+ via import).',
        ),
        diagram('thread-pool', 'scrypt/pbkdf2 run on libuv threads, so 4 concurrent logins can saturate the default pool.'),
      ),
      section('visual', 'Important methods',
        table('crypto — important methods', ['Method', 'What it does', 'Style'], [
          ['`createHash(\'sha256\').update(d).digest(\'hex\')`', 'Hash / checksum', 'sync (also a Transform stream)'],
          ['`createHmac(\'sha256\', key).update(d).digest()`', 'Keyed signature', 'sync (stream)'],
          ['`randomBytes(32)`', 'Secure random bytes', 'sync, or async with callback'],
          ['`randomUUID()`', 'RFC 4122 v4 UUID (Node 14.17+)', 'sync'],
          ['`randomInt(min, max)`', 'Unbiased secure integer', 'sync / async'],
          ['`scrypt(pw, salt, 64, cb)`', 'Memory-hard password hash', 'async (thread pool) · `scryptSync`'],
          ['`pbkdf2(pw, salt, iter, len, digest, cb)`', 'Iterated password hash', 'async (thread pool) · `pbkdf2Sync`'],
          ['`timingSafeEqual(a, b)`', 'Constant-time compare of equal-length buffers', 'sync'],
          ['`createCipheriv(\'aes-256-gcm\', key, iv)`', 'Authenticated encryption', 'sync (stream)'],
          ['`generateKeyPair(\'ed25519\', opts, cb)`', 'Asymmetric keys', 'async · sync variant'],
          ['`sign` / `verify`', 'Digital signatures', 'sync / async'],
          ['`crypto.subtle`', 'Web Crypto API (promise-based)', 'async (promise)'],
        ]),
        table('Hash vs HMAC vs password hash vs encryption', ['', 'Key?', 'Reversible?', 'Speed', 'Use for'], [
          ['sha256 hash', 'No', 'No', 'Very fast', 'Checksums, cache keys, ETags'],
          ['HMAC-sha256', 'Secret key', 'No', 'Very fast', 'Webhook signatures, signed cookies'],
          ['scrypt / argon2', 'Per-user salt', 'No', 'Deliberately slow', 'Passwords'],
          ['AES-256-GCM', 'Secret key + IV', 'Yes', 'Fast', 'Encrypting data at rest'],
        ]),
      ),
      section('example', 'Examples',
        code({
          title: 'Hash, random, UUID',
          code: dedent(`
            import { createHash, randomBytes, randomUUID } from 'node:crypto';

            console.log(createHash('sha256').update('hello').digest('hex'));
            console.log(randomBytes(16).toString('hex'));
            console.log(randomUUID());
          `),
          expectedOutput: '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824\n9f86d081884c7d659a2feaa0c55ad015\n3b241101-e2bb-4255-8caf-4136c566a962',
          explanation: [
            'The sha256 of "hello" is always the same value.',
            'Random bytes and UUIDs differ every run (values vary).',
          ],
        }),
        code({
          title: 'Password hashing with scrypt',
          code: dedent(`
            import { scrypt, randomBytes, timingSafeEqual } from 'node:crypto';
            import { promisify } from 'node:util';
            const scryptAsync = promisify(scrypt);

            async function hashPassword(password) {
              const salt = randomBytes(16);
              const key = await scryptAsync(password, salt, 64);
              return salt.toString('hex') + ':' + key.toString('hex');
            }

            async function verifyPassword(password, stored) {
              const [saltHex, keyHex] = stored.split(':');
              const expected = Buffer.from(keyHex, 'hex');
              const actual = await scryptAsync(password, Buffer.from(saltHex, 'hex'), 64);
              return timingSafeEqual(actual, expected);
            }

            const stored = await hashPassword('s3cret!');
            console.log(await verifyPassword('s3cret!', stored));
            console.log(await verifyPassword('wrong', stored));
          `),
          expectedOutput: 'true\nfalse',
          explanation: [
            'A unique random salt per user defeats rainbow tables.',
            'Async scrypt runs on the thread pool; the event loop stays free.',
            'Both buffers are 64 bytes, so `timingSafeEqual` is safe to call (it throws on length mismatch).',
          ],
        }),
        code({
          title: 'Verifying a webhook signature (HMAC)',
          code: dedent(`
            import { createHmac, timingSafeEqual } from 'node:crypto';

            function isValidSignature(rawBody, header, secret) {
              const expected = createHmac('sha256', secret).update(rawBody).digest();
              const received = Buffer.from(header, 'hex');
              return received.length === expected.length && timingSafeEqual(received, expected);
            }
            console.log(isValidSignature('{"id":1}', 'deadbeef', 'whsec_123'));
          `),
          expectedOutput: 'false',
          explanation: [
            'Sign the **raw** body bytes, not re-serialized JSON.',
            'Check the length first: `timingSafeEqual` throws a RangeError for different lengths.',
          ],
        }),
      ),
      section('real-world', 'Real-world usage',
        bullets(
          'Session/reset tokens: `randomBytes(32).toString(\'base64url\')`; store only a sha256 of the token in the DB.',
          'Idempotency keys and request IDs: `randomUUID()`.',
          'ETags / dedup: `createHash(\'sha1\')` over the content (non-security use).',
          'Field-level encryption: AES-256-GCM with a random 12-byte IV per message; store IV + auth tag.',
          'Many teams use `argon2` or `bcrypt` npm packages for passwords; built-in `scrypt` is a solid zero-dependency choice.',
        ),
      ),
      section('mistakes', 'Common mistakes',
        bullets(
          'Hashing passwords with sha256/md5 — too fast; use scrypt/argon2/bcrypt with a salt.',
          'Using `scryptSync`/`pbkdf2Sync` in a login route — blocks every request for ~50–100 ms.',
          'Comparing signatures with `===` → timing attacks.',
          'Reusing an IV with AES-GCM — catastrophic; generate a fresh one each time.',
          'Using `Math.random()` or `Date.now()` for tokens.',
          'Using deprecated `crypto.createCipher` (no IV) — removed; always `createCipheriv`.',
        ),
        code({
          title: 'Wrong vs right',
          code: dedent(`
            // ✗
            const token = Math.random().toString(36).slice(2);
            if (req.headers['x-signature'] === expectedSig) {}

            // ✓
            const token = randomBytes(32).toString('base64url');
            if (timingSafeEqual(Buffer.from(sig, 'hex'), expectedBuf)) {}
          `),
          explanation: ['Secure randomness and constant-time comparison (after a length check).'],
        }),
      ),
      section('interview', 'Interview tips',
        interviewTip('Know the four categories — hash, HMAC, password KDF, cipher — and which to use when. Mentioning salts, timing-safe comparison and the thread pool for scrypt shows depth.'),
      ),
      section('practice', 'Practice',
        steps('Implement `encrypt(text, key)` / `decrypt` with AES-256-GCM, returning `iv.tag.ciphertext` in base64url.', 'Benchmark `scryptSync` vs async `scrypt` with 20 concurrent calls and explain the difference.'),
      ),
      section('summary', 'Summary',
        bullets(
          'Hash for fingerprints, HMAC for signatures, scrypt for passwords, AES-GCM for encryption.',
          'Randomness: `randomBytes`, `randomUUID`, `randomInt` — never Math.random.',
          '`timingSafeEqual` for secret comparisons (equal-length buffers).',
          'Async KDFs use the thread pool; avoid `*Sync` in servers.',
        ),
      ),
    ],
    revisionNotes: [
      'sha256("hello") = 2cf24dba…9824 (deterministic).',
      'HMAC = hash + secret key → authenticity.',
      'Passwords: scrypt/pbkdf2/argon2 + random salt; never fast hashes.',
      'timingSafeEqual throws RangeError on different lengths.',
      'scrypt/pbkdf2/randomBytes(cb) run on libuv thread pool.',
      'AES-GCM: unique IV per encryption, store auth tag.',
      'randomUUID: Node 14.17+; Web Crypto global since 19.',
    ],
    quiz: [
      {
        kind: 'mcq', difficulty: 'intermediate',
        prompt: 'Which is the best built-in choice for storing user passwords?',
        options: ['createHash(\'sha256\') of the password', 'createHmac with a global secret', 'scrypt with a random per-user salt', 'AES-256 encryption of the password'],
        answer: 2,
        explanation: 'scrypt is a slow, memory-hard KDF; the salt defeats precomputed tables. sha256/HMAC are too fast to brute-force-resist, and encryption is reversible if the key leaks.',
      },
      {
        kind: 'find-bug', difficulty: 'advanced',
        prompt: 'What can go wrong in this signature check?',
        code: "const expected = createHmac('sha256', secret).update(body).digest();\nconst received = Buffer.from(req.headers['x-sig'] ?? '', 'hex');\nif (!timingSafeEqual(received, expected)) return res.end('bad');",
        options: ['createHmac requires a callback', 'timingSafeEqual throws a RangeError when an attacker sends a shorter signature — check lengths first', 'digest() must be called twice', 'Buffers cannot be compared'],
        answer: 1,
        explanation: 'timingSafeEqual only accepts equal-length inputs and throws otherwise, turning a bad header into a 500/crash. Compare lengths first, then call it.',
      },
      {
        kind: 'scenario', difficulty: 'intermediate',
        prompt: 'Your login endpoint uses scryptSync. Under 50 concurrent logins, all API latency spikes. Why?',
        options: ['scrypt is broken', 'scryptSync blocks the single JS thread for every call', 'scrypt uses too much disk', 'The salt is too short'],
        answer: 1,
        explanation: 'Sync KDFs run on the main thread and block all other requests. Async scrypt runs on the thread pool (raise UV_THREADPOOL_SIZE if logins are frequent).',
      },
    ],
    interview: [
      {
        category: 'nodejs', kind: 'concept', difficulty: 'intermediate', topic: 'crypto',
        question: 'How would you securely store and verify passwords using only Node.js core modules?',
        shortAnswer: 'Use async `crypto.scrypt` with a random 16-byte salt per user, store salt + derived key, and verify by re-deriving and comparing with `crypto.timingSafeEqual`.',
        detailedAnswer: [
          'Never store plaintext or fast hashes.',
          'Salt from `randomBytes(16)`; store e.g. `salt:hash` or a structured format including parameters (N, r, p).',
          'Async scrypt runs on the libuv thread pool; avoid scryptSync in request handlers.',
          'Tune cost so a hash takes ~50–100 ms on your hardware.',
          'Alternatives via npm: argon2id, bcrypt.',
        ],
        followUp: 'How would you upgrade hashing parameters for existing users?',
        trap: 'Saying "sha256 with a salt is enough".',
      },
      {
        category: 'nodejs', kind: 'concept', difficulty: 'intermediate', topic: 'crypto',
        question: 'What is crypto.timingSafeEqual for, and what is its main gotcha?',
        shortAnswer: 'It compares two buffers in constant time so attackers cannot learn how many leading bytes matched. Gotcha: it throws if the buffers have different lengths, so check length first.',
        detailedAnswer: [
          '`===` stops at the first differing character — measurable over many requests.',
          'Use it for HMAC signatures, API keys, password-derived keys.',
          'Inputs must be Buffer/TypedArray/DataView of equal byteLength.',
          'Comparing hashes of both values (fixed length) is another way to avoid the length issue.',
        ],
        followUp: 'How do you verify a webhook signature end to end?',
        trap: 'Calling it directly on attacker-controlled input of arbitrary length.',
      },
      {
        category: 'nodejs', kind: 'concept', difficulty: 'advanced', topic: 'crypto',
        question: 'Explain the difference between a hash, an HMAC, a password KDF and encryption, with a backend use case for each.',
        shortAnswer: 'Hash: keyless one-way fingerprint (checksums). HMAC: keyed hash proving authenticity (webhooks). KDF: slow salted hash for passwords. Encryption: reversible with a key (protecting stored PII).',
        detailedAnswer: [
          'sha256 → ETags, dedup, integrity of downloads.',
          'HMAC-sha256 → signed cookies, webhook verification, JWT HS256.',
          'scrypt/argon2 → passwords; slowness and memory cost resist brute force.',
          'AES-256-GCM → encrypting tokens or PII at rest; needs unique IV and stores an auth tag.',
          'Asymmetric (ed25519/RSA) signatures → JWT RS256/EdDSA, verify without sharing the private key.',
        ],
        followUp: 'Why does AES-GCM require a unique IV per message?',
        trap: 'Calling hashing "encryption" or suggesting you can "decrypt" a hash.',
      },
    ],
  },

  // ───────────────────────────────────────────────────────────
  'util-module': {
    summary: '`node:util` is a toolbox: `promisify` callback APIs, `inspect` objects for logging, `format` strings, `types` checks, `isDeepStrictEqual`, `parseArgs` for CLIs and `styleText` for colored output.',
    topics: ['util', 'promisify', 'callbackify', 'inspect', 'util.inspect.custom', 'format', 'util.types', 'isDeepStrictEqual', 'parseArgs', 'styleText', 'deprecate', 'debuglog'],
    sections: [
      section('introduction', undefined,
        text('Many small but daily problems — turning a callback API into a promise, printing a nested object, parsing CLI flags — are solved by `util` without adding dependencies.'),
      ),
      section('definition', 'Definition',
        text('`node:util` is a collection of helper functions used by Node itself and available to you. Most are synchronous and pure.'),
      ),
      section('why', 'Why it matters',
        bullets(
          'Modernize legacy callback code with `promisify`.',
          'Readable logs: `console.log` uses `util.inspect` under the hood.',
          'Zero-dependency CLIs with `parseArgs` and `styleText`.',
        ),
      ),
      section('internals', 'How promisify works',
        steps(
          '`promisify(fn)` returns a function that calls `fn(...args, callback)`.',
          'The callback must follow the Node convention `(err, value)`.',
          'If `err` is truthy, the promise rejects; otherwise it resolves with `value`.',
          'If `fn[util.promisify.custom]` exists, that function is returned instead (e.g. `setTimeout` → promise version).',
        ),
        code({
          title: 'promisify, re-implemented in pure JS',
          runnable: true,
          code: dedent(`
            function promisify(fn) {
              return (...args) => new Promise((resolve, reject) => {
                fn(...args, (err, value) => (err ? reject(err) : resolve(value)));
              });
            }
            function getUser(id, cb) {
              setTimeout(() => (id > 0 ? cb(null, { id, name: 'Ada' }) : cb(new Error('bad id'))), 10);
            }
            const getUserAsync = promisify(getUser);
            getUserAsync(1).then((u) => console.log(u.name));
            getUserAsync(-1).catch((e) => console.log('error:', e.message));
          `),
          expectedOutput: 'Ada\nerror: bad id',
          explanation: ['Error-first callbacks map naturally to resolve/reject. Both timers fire after ~10 ms in order.'],
        }),
      ),
      section('visual', 'Important methods',
        table('util — important methods', ['Method', 'What it does', 'Style'], [
          ['`promisify(fn)`', 'Callback API → promise API', 'sync (returns async fn)'],
          ['`callbackify(asyncFn)`', 'Promise API → callback API', 'sync (returns fn)'],
          ['`inspect(obj, { depth, colors, compact })`', 'String representation (default depth 2)', 'sync'],
          ['`inspect.custom` symbol', 'Customize how your class is printed (e.g. hide secrets)', 'protocol'],
          ['`format(\'%s has %d items\', a, b)`', 'printf-style formatting (used by console.log)', 'sync'],
          ['`types.isPromise / isDate / isRegExp / …`', 'Reliable type checks', 'sync'],
          ['`isDeepStrictEqual(a, b)`', 'Deep equality (same algorithm as assert)', 'sync'],
          ['`parseArgs({ options })`', 'Parse CLI flags (Node 18.3+/16.17+, stable 20)', 'sync'],
          ['`styleText(format, text)`', 'ANSI colors/styles (Node 20.12+/21.7+)', 'sync'],
          ['`deprecate(fn, msg, code)`', 'Wrap fn to emit a DeprecationWarning once', 'sync'],
          ['`debuglog(\'section\')`', 'Logs only when `NODE_DEBUG=section`', 'sync'],
          ['`inherits(Ctor, Super)`', 'Legacy prototype inheritance — use `class extends`', 'sync (legacy)'],
        ]),
      ),
      section('example', 'Examples',
        code({
          title: 'inspect depth and custom inspect',
          code: dedent(`
            import util from 'node:util';
            const deep = { a: { b: { c: { d: 1 } } } };
            console.log(deep);
            console.log(util.inspect(deep, { depth: null }));

            class User {
              constructor(email, password) { this.email = email; this.password = password; }
              [util.inspect.custom]() { return 'User<' + this.email + '>'; }
            }
            console.log(new User('ada@x.io', 'hunter2'));
          `),
          expectedOutput: "{ a: { b: { c: [Object] } } }\n{\n  a: { b: { c: { d: 1 } } }\n}\nUser<ada@x.io>",
          explanation: [
            'console.log uses inspect with depth 2, so the third nested level shows `[Object]`.',
            '`depth: null` prints everything (inspect may break lines when nesting is deep).',
            '`inspect.custom` keeps the password out of logs.',
          ],
        }),
        code({
          title: 'A CLI with parseArgs and styleText',
          code: dedent(`
            // node migrate.js --env prod -v up
            import { parseArgs, styleText } from 'node:util';

            const { values, positionals } = parseArgs({
              options: {
                env: { type: 'string', short: 'e', default: 'dev' },
                verbose: { type: 'boolean', short: 'v' },
              },
              allowPositionals: true,
            });
            console.log(values, positionals);
            console.log(styleText('green', 'migrations applied'));
          `),
          expectedOutput: "[Object: null prototype] { env: 'prod', verbose: true } [ 'up' ]\nmigrations applied",
          explanation: [
            '`parseArgs` reads `process.argv.slice(2)` by default and throws on unknown options (strict mode).',
            '`values` has a null prototype, which is why inspect labels it.',
            'The second line is green in a color terminal.',
          ],
          versionNote: '`parseArgs` Node 18.3+ (stable in 20). `styleText` Node 20.12+/21.7+ (stable in 22.13/23.5).',
        }),
      ),
      section('real-world', 'Real-world usage',
        bullets(
          'Wrap old callback libraries: `const execAsync = util.promisify(require(\'node:child_process\').exec)`.',
          'Hide tokens/passwords in logs with `inspect.custom` on domain classes.',
          'Internal ops scripts without commander/yargs: `parseArgs` + `styleText`.',
          'Mark old library functions with `util.deprecate`.',
        ),
        tip('Many core APIs already have promise versions: `fs/promises`, `timers/promises`, `stream/promises`, `dns/promises`. Prefer them over promisify.'),
      ),
      section('mistakes', 'Common mistakes',
        bullets(
          'Promisifying a function whose callback is not `(err, value)` — results are wrong.',
          'Promisifying a method and losing `this`: use `promisify(obj.method).bind(obj)` or `promisify(obj.method.bind(obj))`.',
          'Using `util.inherits` in new code — use `class extends`.',
          'Logging with `JSON.stringify` and losing Maps, Sets, errors — `inspect` handles them.',
          'Using `styleText` on an older Node — it throws `TypeError: styleText is not a function`.',
        ),
      ),
      section('interview', 'Interview tips',
        interviewTip('Be ready to implement `promisify` in five lines — it proves you understand error-first callbacks and promise construction.'),
      ),
      section('practice', 'Practice',
        steps('Promisify `fs.stat` manually and compare with `fs/promises.stat`.', 'Write a CLI with `parseArgs` that prints `--help` when asked.'),
      ),
      section('summary', 'Summary',
        bullets(
          '`promisify`/`callbackify` bridge callback and promise styles.',
          '`inspect` controls how objects print; `inspect.custom` customizes it.',
          '`parseArgs` (18.3+) and `styleText` (20.12+) for CLIs.',
          '`types` and `isDeepStrictEqual` for checks.',
        ),
      ),
    ],
    revisionNotes: [
      'promisify expects (err, value) callback as last arg; honors util.promisify.custom.',
      'console.log → util.inspect, default depth 2 → [Object].',
      'inspect.custom symbol customizes output.',
      'parseArgs: Node 18.3+/16.17+, stable 20; strict by default.',
      'styleText: Node 20.12+/21.7+.',
      'util.inherits is legacy.',
    ],
    quiz: [
      {
        kind: 'complete-code', difficulty: 'beginner',
        prompt: 'Complete the code to use `fs.readFile` with await (without fs/promises).',
        code: "const fs = require('node:fs');\nconst util = require('node:util');\nconst readFileAsync = /* ??? */;\nconst text = await readFileAsync('a.txt', 'utf8');",
        options: ['util.inspect(fs.readFile)', 'util.promisify(fs.readFile)', 'util.callbackify(fs.readFile)', 'util.format(fs.readFile)'],
        answer: 1,
        explanation: 'promisify converts an error-first callback function into a promise-returning one. callbackify does the opposite.',
      },
      {
        kind: 'predict-output', difficulty: 'intermediate',
        prompt: 'What does console.log print?',
        code: "console.log({ l1: { l2: { l3: { l4: true } } } });",
        options: ['{ l1: { l2: { l3: { l4: true } } } }', '{ l1: { l2: { l3: [Object] } } }', '{ l1: [Object] }', '[object Object]'],
        answer: 1,
        explanation: 'console.log uses util.inspect with depth 2: l1 (0), l2 (1), l3 (2) are shown; l3\'s contents become [Object].',
      },
    ],
    interview: [
      {
        category: 'nodejs', kind: 'concept', difficulty: 'beginner', topic: 'util',
        question: 'What does util.promisify do and what does it require from the wrapped function?',
        shortAnswer: 'It converts a function that takes an error-first callback `(err, value)` as its last argument into one that returns a promise.',
        detailedAnswer: [
          'Rejects when err is truthy, resolves with value otherwise.',
          'Respects `fn[util.promisify.custom]` for functions with non-standard callbacks.',
          'Methods need binding to keep `this`.',
          'Prefer native promise APIs (`fs/promises`, `timers/promises`) when available.',
        ],
        followUp: 'Implement promisify yourself.',
        trap: 'Using it on callbacks with multiple success values — only the first is kept (unless custom).',
      },
      {
        category: 'nodejs', kind: 'concept', difficulty: 'intermediate', topic: 'util',
        question: 'How do you control how an object appears in console.log output, for example to hide secrets?',
        shortAnswer: 'Implement a `[util.inspect.custom](depth, options, inspect)` method on the class; console.log uses util.inspect, which calls it.',
        detailedAnswer: [
          'console.log → util.format → util.inspect for non-strings.',
          'Return a string or another object to be inspected.',
          '`toJSON()` controls JSON.stringify, which is separate.',
          'Structured loggers (pino) use JSON serialization, so add redaction there too.',
        ],
        followUp: 'How do you print an object with unlimited depth?',
        trap: 'Thinking overriding `toString` changes console.log output for objects.',
      },
    ],
  },
};

export default content;
