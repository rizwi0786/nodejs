import type { ModuleContent } from '../../../types';
import { bullets, code, dedent, diagram, flow, interviewTip, note, section, steps, table, text, tip, warn } from '../helpers';

const content: Partial<ModuleContent> = {
  'secure-api-design': {
    summary: 'Secure API design applies security by default across every endpoint: authenticate, authorise per object, validate input, limit resources, return minimal data and errors, use TLS, and log security events.',
    topics: ['secure API design', 'OWASP API Security Top 10', 'least privilege', 'pagination limits', 'error handling', 'CORS', 'idempotency', 'audit logging'],
    sections: [
      section('introduction', undefined,
        text('Individual fixes (parameterised queries, Helmet, rate limits) only work if they are applied *everywhere*. Secure API design turns them into defaults and a checklist so no endpoint is forgotten.'),
      ),
      section('definition', 'Principles',
        bullets(
          '**Deny by default** — every route requires auth unless explicitly public.',
          '**Least privilege** — tokens, DB users and service accounts get only what they need.',
          '**Defence in depth** — validation, authorisation, parameterisation and encoding each catch what others miss.',
          '**Minimise exposure** — return only fields the client needs; generic errors.',
          '**Fail safely** — on error, deny and log; never fall through to "allowed".',
        ),
        note('OWASP also publishes an **API Security Top 10** (2023 edition) — BOLA is #1, followed by broken authentication and broken object *property* level authorisation (mass assignment + excessive data exposure).'),
      ),
      section('why', 'Why a checklist',
        bullets(
          'APIs expose business logic directly; there is no UI to "hide" anything.',
          'Teams add endpoints quickly; security must be the path of least resistance.',
          'Consistent patterns are reviewable and testable.',
        ),
      ),
      section('internals', 'The secure request path',
        flow([
          'TLS (HTTPS only, HSTS)',
          'Size limits + rate limit',
          'Authenticate (token/session)',
          'Validate input (schema)',
          'Authorise (role + ownership)',
          'Business logic (parameterised DB)',
          'Serialise allowlisted fields',
          'Log security event',
        ], { title: 'Every request, in this order', direction: 'vertical' }),
        diagram('layered-architecture', 'Put cross-cutting checks in middleware; ownership and field filtering in services/repositories.'),
      ),
      section('example', 'Vulnerable vs fixed',
        code({
          title: 'Response DTO and safe pagination (pure JS)',
          runnable: true,
          code: dedent(`
            const toPublicUser = ({ id, displayName, avatarUrl }) => ({ id, displayName, avatarUrl });
            function pageParams(q) {
              const limit = Math.min(Math.max(parseInt(q.limit, 10) || 20, 1), 100); // clamp 1..100
              const page = Math.max(parseInt(q.page, 10) || 1, 1);
              return { limit, offset: (page - 1) * limit };
            }
            const row = { id: 7, displayName: 'Ana', avatarUrl: '/a.png', email: 'ana@x.io', passwordHash: '$2b$...', isAdmin: false };
            console.log(JSON.stringify(toPublicUser(row)));
            console.log(JSON.stringify(pageParams({ limit: '1000000', page: '3' })));
            console.log(JSON.stringify(pageParams({ limit: 'abc', page: '-5' })));
          `),
          expectedOutput: '{"id":7,"displayName":"Ana","avatarUrl":"/a.png"}\n{"limit":100,"offset":200}\n{"limit":20,"offset":0}',
          explanation: [
            'An explicit DTO means new DB columns (e.g. `passwordHash`) never leak by accident.',
            'Clamping `limit` stops `?limit=1000000` from dumping the table or exhausting memory.',
            'Garbage input falls back to safe defaults instead of throwing or passing NaN to SQL.',
          ],
        }),
        code({
          title: 'Express app skeleton: VULNERABLE vs FIXED',
          code: dedent(`
            // ❌ VULNERABLE patterns
            app.use(cors({ origin: true, credentials: true }));         // reflects ANY origin with cookies
            app.use(express.json());                                    // default 100kb ok, but no rate limit
            app.get('/api/users/:id', async (req, res) => res.json(await User.findById(req.params.id))); // no auth, full doc
            app.use((err, req, res, next) => res.status(500).json(err)); // leaks internals

            // ✅ FIXED
            app.disable('x-powered-by');
            app.use(helmet());
            app.use(cors({ origin: ['https://app.example.com'], credentials: true }));
            app.use(express.json({ limit: '50kb' }));
            app.use('/api', apiLimiter);
            app.use('/api', requireAuth);                                // deny by default; public routes mounted before

            app.get('/api/users/:id', validate(IdParam, 'params'), async (req, res) => {
              const user = await users.findVisibleTo(req.user, req.valid.params.id); // ownership/visibility in service
              if (!user) return res.status(404).json({ error: 'Not found' });
              res.json(toPublicUser(user));                              // allowlisted fields
            });

            app.use((err, req, res, next) => {
              req.log.error({ err, reqId: req.id }, 'request failed');
              res.status(err.status ?? 500).json({ error: err.expose ? err.message : 'Internal error', requestId: req.id });
            });
          `),
          expectedOutput: 'GET /api/users/9 (no token)          → 401 {"error":"Unauthorized"}\nGET /api/users/9 (other tenant)      → 404 {"error":"Not found"}\nGET /api/users/7 (allowed)           → 200 {"id":7,"displayName":"Ana","avatarUrl":"/a.png"}\nGET /api/users/x (DB throws)         → 500 {"error":"Internal error","requestId":"b3f1..."}',
          explanation: [
            '`origin: true` with `credentials: true` lets any website read authenticated responses — a CORS misconfiguration.',
            'Global `requireAuth` on `/api` makes new routes protected automatically.',
            'The error handler logs details with a request id and returns only the id to the client for support.',
          ],
        }),
      ),
      section('real-world', 'Checklist for every endpoint',
        table('Secure API checklist', ['Area', 'Check'], [
          ['Transport', 'HTTPS only, HSTS, TLS 1.2+'],
          ['AuthN', 'Short-lived access tokens; refresh rotation; no tokens in URLs'],
          ['AuthZ', 'Role check + object ownership; tenant from token; deny by default'],
          ['Input', 'Schema for body/query/params/headers; size limits; strict unknown-key handling'],
          ['Output', 'Response DTOs; no stack traces; consistent error shape'],
          ['Resources', 'Rate limits, pagination caps, timeouts, upload limits'],
          ['CORS', 'Explicit origin allowlist; never reflect arbitrary origins with credentials'],
          ['Idempotency', '`Idempotency-Key` for payments/POSTs that must not double-apply'],
          ['Logging', 'Auth failures, permission denials, admin actions — without secrets'],
          ['Inventory', 'Documented (OpenAPI), versioned; old versions retired'],
        ]),
        tip('Add an automated test that enumerates the router and asserts every non-public route returns 401 without a token.'),
      ),
      section('mistakes', 'Common mistakes',
        bullets(
          'Returning whole DB documents and filtering on the client.',
          'Putting tokens or PII in query strings — they end up in logs, proxies and browser history.',
          'Different error messages for "user not found" vs "wrong password" (account enumeration).',
          'Forgetting old API versions (`/v1`) that lack newer checks.',
          '`cors({ origin: "*" })` thinking it is harmless — fine for public data, wrong for authenticated APIs.',
        ),
      ),
      section('interview', 'Interview angle',
        interviewTip('Walk the request path out loud: TLS → limits → authN → validate → authZ (object level) → parameterised data access → DTO → log. Mention BOLA as the #1 API risk.'),
      ),
      section('practice', 'Practice',
        text('Audit one of your APIs against the checklist table. For each row write "done / missing / N/A" and fix the two highest-risk gaps.'),
      ),
      section('summary', 'Summary',
        bullets(
          'Make security the default: global auth, deny by default, strict schemas.',
          'Object-level authorisation and response DTOs prevent most data leaks.',
          'Limit resources: rate limits, pagination caps, body limits, timeouts.',
          'Generic errors to clients; detailed, secret-free logs with request ids.',
        ),
      ),
    ],
    revisionNotes: [
      'Order: TLS → limits → authN → validate → authZ → data → DTO → log.',
      'OWASP API Top 10 (2023): #1 BOLA.',
      'Clamp pagination; cap body size.',
      'CORS: explicit origin allowlist with credentials.',
      'Same error for unknown user / bad password.',
    ],
    quiz: [
      {
        kind: 'find-bug', difficulty: 'intermediate',
        prompt: 'What is the security problem in this CORS setup for an API that uses session cookies?',
        code: "app.use(cors({ origin: true, credentials: true }));",
        options: [
          'credentials must be a string',
          '`origin: true` reflects any requesting origin, so any website can read authenticated responses',
          'CORS must be mounted after routes',
          'Nothing — this is the recommended setting',
        ],
        answer: 1,
        explanation: 'Reflecting every Origin while allowing credentials lets evil.example make cookie-authenticated requests *and read the results*. Use an explicit allowlist.',
      },
      {
        kind: 'mcq', difficulty: 'beginner',
        prompt: 'Why return a DTO (selected fields) instead of the full database record?',
        options: [
          'It makes responses faster to parse only',
          'It prevents accidental exposure of sensitive fields like password hashes or internal flags',
          'JSON cannot serialise database records',
          'It is required by Express',
        ],
        answer: 1,
        explanation: 'Excessive data exposure is a top API risk; an allowlist of output fields keeps new or sensitive columns private by default.',
      },
    ],
    interview: [
      {
        category: 'express-backend', kind: 'scenario', difficulty: 'intermediate', topic: 'Secure API design',
        question: 'You are reviewing a new REST endpoint before release. What security checks do you go through?',
        shortAnswer: 'Auth required, role and object-level authorisation, input schema with limits, parameterised data access, response field allowlist, rate limiting, generic errors and audit logging.',
        detailedAnswer: [
          'Is it behind the global auth middleware, or explicitly and intentionally public?',
          'Does the query scope by owner/tenant? Are writes field-allowlisted (mass assignment)?',
          'Are body, params and query validated with size/length limits?',
          'Does the response leak fields or internal errors?',
          'Is it rate limited and paginated? Are security-relevant actions logged?',
        ],
        followUp: 'How would you automate parts of this review?',
        trap: 'Stopping at "it requires a JWT".',
      },
      {
        category: 'advanced', kind: 'concept', difficulty: 'advanced', topic: 'Secure API design',
        question: 'How do idempotency keys make a payment API safer, and how would you implement them?',
        shortAnswer: 'Clients send a unique `Idempotency-Key`; the server stores the first result for that key and replays it for retries, so network retries cannot charge twice.',
        detailedAnswer: [
          'Store `(key, userId) → status, response, request hash` with a TTL (e.g. 24 h).',
          'Insert the key atomically before doing work (unique constraint or Redis `SET NX`) to handle concurrent duplicates.',
          'If the same key arrives with a different body → 422 to catch client bugs.',
          'While in progress, respond 409 or wait; after completion, replay the saved response.',
          'Scope keys per user so one client cannot read another\'s cached result.',
        ],
        followUp: 'What happens if the server crashes after charging but before storing the response?',
        trap: 'Relying on the client never retrying.',
      },
    ],
  },

  'https-and-tls-fundamentals': {
    summary: 'HTTPS is HTTP over TLS: TLS authenticates the server with a CA-signed certificate and encrypts traffic using keys agreed in a handshake (one round trip in TLS 1.3); in production, TLS is usually terminated at a proxy and enforced with HSTS.',
    topics: ['HTTPS', 'TLS 1.3', 'TLS handshake', 'certificates', 'certificate authority', 'chain of trust', 'HSTS', 'https.createServer', 'TLS termination', 'SNI'],
    sections: [
      section('introduction', undefined,
        text('Plain HTTP sends passwords, cookies and tokens as readable text that anyone on the path can read or modify. TLS gives three guarantees: **confidentiality**, **integrity** and **server authentication**.'),
      ),
      section('definition', 'Key terms',
        table('TLS vocabulary', ['Term', 'Meaning'], [
          ['TLS', 'Transport Layer Security; SSL is its obsolete predecessor (all SSL versions are broken)'],
          ['Certificate', 'Public key + identity (domain names in SAN) signed by a CA, with validity dates'],
          ['CA', 'Certificate Authority; trusted roots ship with OSes/browsers (Node bundles Mozilla\'s list)'],
          ['Chain of trust', 'Leaf cert ← signed by intermediate ← signed by root in the trust store'],
          ['SNI', 'Client sends the hostname in ClientHello so one IP can serve many certificates'],
          ['ECDHE', 'Ephemeral key exchange → forward secrecy: stolen server key cannot decrypt past traffic'],
          ['HSTS', 'Header telling browsers to use HTTPS only for this host for max-age seconds'],
          ['mTLS', 'Mutual TLS: client presents a certificate too (service-to-service)'],
        ]),
      ),
      section('why', 'Why every API needs it',
        bullets(
          'Bearer tokens and session cookies are credentials; without TLS they are visible on any shared network.',
          'Integrity: without TLS, proxies/ISPs can inject scripts or modify JSON.',
          'Browsers restrict features (Secure cookies, HTTP/2, service workers, geolocation) to HTTPS.',
        ),
      ),
      section('internals', 'TLS 1.3 handshake, step by step',
        steps(
          '**ClientHello**: supported cipher suites, a key share (ECDHE public value), SNI hostname, ALPN (`h2`, `http/1.1`).',
          '**ServerHello**: chosen suite + server key share. Both sides now compute the same shared secret; everything after is encrypted.',
          'Server sends (encrypted) **Certificate** chain, **CertificateVerify** (signature proving it holds the private key) and **Finished**.',
          'Client verifies: chain to a trusted root, hostname matches the certificate SAN, dates valid, signature valid.',
          'Client sends **Finished**; application data (HTTP) flows. Total: **1 round trip** (TLS 1.2 needed 2). Resumption can allow 0-RTT (with replay caveats).',
        ),
        flow([
          'Client → ClientHello + key share + SNI',
          'Server → ServerHello + key share',
          'Server → {Certificate, CertificateVerify, Finished}',
          'Client: verify chain + hostname',
          'Client → {Finished}',
          'Encrypted HTTP request/response',
        ], { title: 'TLS 1.3 full handshake (1-RTT)', direction: 'vertical' }),
        diagram('request-response', 'TLS sits between the TCP connection and the HTTP request.'),
      ),
      section('example', 'TLS in Node',
        code({
          title: 'Chain-of-trust check (pure JS model)',
          runnable: true,
          code: dedent(`
            const trustStore = new Set(['ISRG Root X1']);
            const chain = [
              { subject: 'api.example.com', issuer: 'R11', san: ['api.example.com'], notAfter: '2027-01-30' },
              { subject: 'R11', issuer: 'ISRG Root X1' },
            ];
            function verify(chain, host, today) {
              const leaf = chain[0];
              if (!leaf.san.includes(host)) return 'ERR_TLS_CERT_ALTNAME_INVALID';
              if (today > leaf.notAfter) return 'CERT_HAS_EXPIRED';
              for (let i = 0; i < chain.length - 1; i++) {
                if (chain[i].issuer !== chain[i + 1].subject) return 'UNABLE_TO_VERIFY_LEAF_SIGNATURE';
              }
              return trustStore.has(chain[chain.length - 1].issuer) ? 'OK' : 'SELF_SIGNED_CERT_IN_CHAIN';
            }
            console.log(verify(chain, 'api.example.com', '2026-11-08'));
            console.log(verify(chain, 'evil.example', '2026-11-08'));
            console.log(verify(chain.slice(0, 1), 'api.example.com', '2026-11-08'));
          `),
          expectedOutput: 'OK\nERR_TLS_CERT_ALTNAME_INVALID\nSELF_SIGNED_CERT_IN_CHAIN',
          explanation: [
            'Real verification checks signatures cryptographically; this model shows the order of checks.',
            'Hostname must match a SAN entry — a valid cert for another domain is rejected.',
            'The last case shows a server that forgot to send its intermediate: the client cannot reach a trusted root. (Node reports a missing intermediate as `UNABLE_TO_VERIFY_LEAF_SIGNATURE`; the model simplifies.)',
          ],
        }),
        code({
          title: 'https.createServer with key and cert',
          code: dedent(`
            import https from 'node:https';
            import { readFileSync } from 'node:fs';
            import express from 'express';

            const app = express();
            app.get('/', (req, res) => res.json({ secure: req.secure, protocol: req.socket.getProtocol() }));

            https.createServer({
              key: readFileSync('/etc/tls/privkey.pem'),
              cert: readFileSync('/etc/tls/fullchain.pem'),  // leaf + intermediates
              minVersion: 'TLSv1.2',
            }, app).listen(443);

            // Local dev: mkcert (third-party) creates a locally trusted cert
            //   mkcert localhost  →  localhost.pem, localhost-key.pem
          `),
          expectedOutput: '$ curl -s https://api.example.com/\n{"secure":true,"protocol":"TLSv1.3"}',
          explanation: [
            '`fullchain.pem` must include intermediates; forgetting them works in some browsers (they cache/fetch) but fails in Node/curl.',
            '`minVersion` refuses TLS 1.0/1.1.',
            'Keep the private key readable only by the service user; never commit it.',
          ],
        }),
        code({
          title: 'TLS terminated at a proxy (the common production setup)',
          code: dedent(`
            // Nginx / load balancer handles TLS on :443 and forwards plain HTTP to Node on :3000
            const app = express();
            app.set('trust proxy', 1);              // trust X-Forwarded-Proto from exactly one proxy

            app.use((req, res, next) => {
              if (!req.secure) return res.redirect(301, 'https://' + req.hostname + req.originalUrl);
              res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
              next();
            });

            // ❌ Never "fix" certificate errors like this:
            // process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
            // ✅ Instead trust your private CA explicitly:
            // node --use-system-ca app.js   or   NODE_EXTRA_CA_CERTS=/etc/ssl/corp-ca.pem node app.js
          `),
          expectedOutput: '$ curl -sI http://api.example.com/users\nHTTP/1.1 301 Moved Permanently\nLocation: https://api.example.com/users\n\n$ curl -sI https://api.example.com/users\nHTTP/2 200\nstrict-transport-security: max-age=31536000; includeSubDomains',
          explanation: [
            'With `trust proxy`, `req.secure` reflects `X-Forwarded-Proto: https` set by the proxy.',
            'HSTS makes the browser skip the insecure redirect on future visits.',
            '`NODE_TLS_REJECT_UNAUTHORIZED=0` disables verification for the whole process — any man-in-the-middle succeeds.',
            '`NODE_EXTRA_CA_CERTS` adds a private CA safely; `--use-system-ca` exists in recent Node versions (check your version).',
          ],
        }),
      ),
      section('real-world', 'Production practice',
        bullets(
          'Certificates from Let\'s Encrypt (ACME, 90-day lifetime) or a cloud provider — automate renewal; expiry outages are common.',
          'Terminate TLS at the load balancer/ingress; re-encrypt to backends (or use mTLS / a service mesh) when the internal network is not trusted.',
          'Test configuration with SSL Labs or `openssl s_client -connect host:443 -servername host`.',
          'Prefer TLS 1.3 and allow 1.2 for older clients; disable 1.0/1.1.',
        ),
        diagram('reverse-proxy', 'The proxy holds the certificate; Node instances speak HTTP behind it.'),
      ),
      section('mistakes', 'Common mistakes',
        bullets(
          'Setting `NODE_TLS_REJECT_UNAUTHORIZED=0` or `rejectUnauthorized: false` to get past a cert error.',
          'Serving only the leaf certificate without intermediates.',
          'Forgetting `trust proxy`, causing redirect loops or `Secure` cookies not being set.',
          'Mixed content: HTTPS page loading HTTP scripts.',
          'Assuming TLS protects data at rest or hides the destination hostname (SNI is visible unless ECH is used).',
        ),
        warn('TLS proves you are talking to *the holder of the certificate for this name*. It does not prove the server is honest or that the data is safe once it arrives.'),
      ),
      section('interview', 'Interview angle',
        interviewTip('Be able to narrate the TLS 1.3 handshake in four lines, explain forward secrecy (ephemeral ECDHE), and describe why TLS usually terminates at a proxy and how Express learns the original scheme (`trust proxy`, `X-Forwarded-Proto`).'),
      ),
      section('practice', 'Practice',
        text('Run `openssl s_client -connect example.com:443 -servername example.com` and identify: the protocol version, cipher, certificate chain depth and SAN names. Then create a local cert with mkcert and serve an Express app with `https.createServer`.'),
      ),
      section('summary', 'Summary',
        bullets(
          'TLS = confidentiality + integrity + server authentication.',
          'TLS 1.3: 1-RTT handshake, ephemeral key exchange (forward secrecy).',
          'Clients verify chain → trusted root, hostname (SAN), validity dates.',
          'Node: `https.createServer({ key, cert })`; production: terminate at proxy + `trust proxy` + HSTS.',
          'Never disable certificate verification.',
        ),
      ),
    ],
    revisionNotes: [
      'TLS 1.3 = 1 RTT; 1.2 = 2 RTT; 0-RTT resumption has replay risk.',
      'Verify: chain to root, SAN hostname, dates, signature.',
      'Serve fullchain (leaf + intermediates).',
      'Forward secrecy from ephemeral (EC)DHE keys.',
      'Behind proxy: `trust proxy` + `X-Forwarded-Proto`; HSTS.',
      '`NODE_EXTRA_CA_CERTS` — never `NODE_TLS_REJECT_UNAUTHORIZED=0`.',
    ],
    quiz: [
      {
        kind: 'mcq', difficulty: 'intermediate',
        prompt: 'How many round trips does a full TLS 1.3 handshake add before the first HTTP request can be sent?',
        options: ['Zero', 'One', 'Two', 'Three'],
        answer: 1,
        explanation: 'TLS 1.3 completes the full handshake in one round trip (TLS 1.2 needed two). Zero-RTT is only possible on resumption.',
      },
      {
        kind: 'scenario', difficulty: 'intermediate',
        prompt: 'Your Node service calls an internal API with a certificate from your company\'s private CA and fails with `UNABLE_TO_GET_ISSUER_CERT_LOCALLY`. Best fix?',
        options: [
          'Set NODE_TLS_REJECT_UNAUTHORIZED=0',
          'Use HTTP instead',
          'Add the corporate CA via NODE_EXTRA_CA_CERTS (or the `ca` option) so verification succeeds',
          'Pass rejectUnauthorized: false',
        ],
        answer: 2,
        explanation: 'Adding the CA keeps full verification. The other options disable authentication and make man-in-the-middle attacks trivial.',
      },
      {
        kind: 'find-bug', difficulty: 'advanced',
        prompt: 'Behind an HTTPS load balancer, this middleware causes an infinite redirect loop. Why?',
        code: "app.use((req, res, next) => {\n  if (!req.secure) return res.redirect('https://' + req.hostname + req.url);\n  next();\n});",
        options: [
          'redirect needs a 301 status',
          '`trust proxy` is not set, so req.secure is false for traffic forwarded over HTTP by the balancer',
          'req.hostname is undefined behind proxies',
          'HTTPS cannot redirect',
        ],
        answer: 1,
        explanation: 'The balancer talks HTTP to Node and sets `X-Forwarded-Proto: https`. Without `app.set("trust proxy", 1)` Express ignores that header and keeps redirecting.',
      },
    ],
    interview: [
      {
        category: 'advanced', kind: 'concept', difficulty: 'advanced', topic: 'TLS',
        question: 'Walk through a TLS 1.3 handshake and explain what forward secrecy means.',
        shortAnswer: 'Client and server exchange ephemeral ECDHE key shares in ClientHello/ServerHello, derive session keys, then the server proves its identity with its certificate and a signature; forward secrecy means recorded traffic stays safe even if the server\'s long-term key later leaks.',
        detailedAnswer: [
          'ClientHello: suites, key share, SNI, ALPN. ServerHello: chosen suite, key share.',
          'Both derive handshake keys; server sends Certificate, CertificateVerify, Finished encrypted.',
          'Client validates chain, hostname and signature, sends Finished.',
          'Long-term key is only used for signing, not key transport; ephemeral keys are discarded.',
          'TLS 1.3 removed static RSA key exchange, so all suites are forward-secret.',
        ],
        followUp: 'What are the security trade-offs of 0-RTT?',
        trap: 'Saying the certificate\'s public key encrypts the session key (that was RSA key exchange in TLS ≤1.2).',
      },
      {
        category: 'express-backend', kind: 'concept', difficulty: 'intermediate', topic: 'TLS',
        question: 'What does TLS termination at a reverse proxy mean, and what must the Node app configure because of it?',
        shortAnswer: 'The proxy decrypts HTTPS and forwards plain HTTP to Node; the app must trust the proxy\'s forwarded headers (`trust proxy`) to know the original protocol and client IP.',
        detailedAnswer: [
          'Proxy holds certificates, handles renewal, HTTP/2 and offloads crypto.',
          'It sets `X-Forwarded-For` and `X-Forwarded-Proto`.',
          'Express `app.set("trust proxy", n)` makes `req.ip`, `req.secure` and `req.protocol` reflect them.',
          'Secure cookies, HTTPS redirects and rate limiting all depend on this setting.',
          'If the internal network is untrusted, re-encrypt (proxy → Node over TLS or mTLS).',
        ],
        followUp: 'Why is `trust proxy: true` risky when Node is directly reachable?',
        trap: 'Thinking the app still needs its own certificate in the common setup.',
      },
    ],
  },
};

export default content;
