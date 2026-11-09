import type { ModuleContent } from '../../../types';
import { bullets, code, dedent, diagram, flow, interviewTip, note, section, steps, table, text, tip, warn } from '../helpers';

const content: Partial<ModuleContent> = {
  'broken-access-control': {
    summary: 'Broken access control (OWASP A01) means users can act outside their permissions — reading other users\' records (IDOR), escalating roles, or calling admin routes; fix with server-side, deny-by-default authorisation and ownership checks.',
    topics: ['broken access control', 'IDOR', 'BOLA', 'ownership check', 'deny by default', 'privilege escalation', 'mass assignment', 'RBAC'],
    sections: [
      section('introduction', undefined,
        text('Authentication answers "who are you?". Access control answers "are you allowed to do *this* to *this* record?". Forgetting the second question is the most common serious API bug.'),
      ),
      section('definition', 'Definition',
        text('**Broken access control** is any flaw that lets a user perform an action or access data beyond their intended permissions.'),
        table('Forms of broken access control', ['Form', 'Example', 'Fix'], [
          ['IDOR / BOLA', '`GET /api/orders/1002` returns someone else\'s order', 'Scope query by owner / tenant'],
          ['Vertical escalation', 'Regular user calls `DELETE /api/admin/users/5`', 'Role check middleware on the route'],
          ['Mass assignment', '`PATCH /me { "role": "admin" }` saved directly', 'Allowlist updatable fields'],
          ['Missing function-level check', 'Admin button hidden in UI, endpoint unprotected', 'Enforce on the server, never in the UI'],
          ['Tenant leakage', 'Filter by `orgId` from the query string', 'Take tenant from the authenticated token'],
        ]),
        note('IDOR = Insecure Direct Object Reference. The OWASP API Security Top 10 calls the same flaw BOLA — Broken Object Level Authorization — and ranks it #1.'),
      ),
      section('why', 'Why it is #1',
        bullets(
          'Every endpoint with an id in the path is a candidate.',
          'It is logic, not syntax — frameworks, ORMs and scanners do not know your rules.',
          'Sequential ids make enumeration trivial; UUIDs only make guessing harder, they do not authorise.',
        ),
      ),
      section('internals', 'How an IDOR is exploited',
        steps(
          'Attacker logs in as themself and views `GET /api/invoices/1001` — their own invoice.',
          'They change the id to `1000`, `999`, … with a script.',
          'The handler does `Invoice.findById(req.params.id)` with no owner condition → returns every invoice.',
          'Fix: `Invoice.findOne({ _id: id, userId: req.user.id })` and return **404** when missing so existence is not leaked.',
        ),
        flow([
          'Request: GET /invoices/1000',
          'AuthN: token valid → user 42',
          'AuthZ: is invoice 1000 owned by 42?',
          'No → 404 / Yes → 200',
        ], { title: 'Every object access needs an authorisation step', direction: 'horizontal' }),
        diagram('middleware-pipeline', 'Put authentication and coarse role checks in middleware; object ownership belongs in the service/query.'),
      ),
      section('example', 'Vulnerable vs fixed',
        code({
          title: 'Policy function, deny by default (pure JS)',
          runnable: true,
          code: dedent(`
            const policies = {
              'invoice:read':   (user, inv) => user.role === 'admin' || inv.ownerId === user.id,
              'invoice:refund': (user) => user.role === 'admin',
            };
            function can(user, action, resource) {
              const rule = policies[action];
              return rule ? rule(user, resource) === true : false; // unknown action → deny
            }

            const ana = { id: 1, role: 'user' };
            const inv = { id: 1000, ownerId: 2 };
            console.log(can(ana, 'invoice:read', inv));
            console.log(can(ana, 'invoice:read', { id: 1001, ownerId: 1 }));
            console.log(can(ana, 'invoice:refund', inv));
            console.log(can(ana, 'invoice:delete', inv));
          `),
          expectedOutput: 'false\ntrue\nfalse\nfalse',
          explanation: [
            'Ana cannot read invoice 1000 (owned by user 2) but can read her own 1001.',
            'Refund needs the admin role.',
            '`invoice:delete` has no policy, so the default is **deny** — forgotten rules fail closed.',
          ],
        }),
        code({
          title: 'Express: VULNERABLE vs FIXED',
          code: dedent(`
            // ❌ VULNERABLE — IDOR + mass assignment
            app.get('/api/invoices/:id', requireAuth, async (req, res) => {
              res.json(await Invoice.findById(req.params.id));
            });
            app.patch('/api/me', requireAuth, async (req, res) => {
              res.json(await User.findByIdAndUpdate(req.user.id, req.body, { new: true })); // body may contain role
            });

            // ✅ FIXED
            app.get('/api/invoices/:id', requireAuth, async (req, res) => {
              const inv = await Invoice.findOne({ _id: req.params.id, ownerId: req.user.id });
              if (!inv) return res.status(404).json({ error: 'Not found' });
              res.json(inv);
            });

            const requireRole = (...roles) => (req, res, next) =>
              roles.includes(req.user?.role) ? next() : res.status(403).json({ error: 'Forbidden' });
            app.delete('/api/admin/users/:id', requireAuth, requireRole('admin'), deleteUser);

            const UPDATABLE = ['displayName', 'avatarUrl'];
            app.patch('/api/me', requireAuth, async (req, res) => {
              const update = Object.fromEntries(Object.entries(req.body).filter(([k]) => UPDATABLE.includes(k)));
              res.json(await User.findByIdAndUpdate(req.user.id, update, { new: true }));
            });
          `),
          expectedOutput: 'GET /api/invoices/1000 as user 1 → 404 {"error":"Not found"}\nDELETE /api/admin/users/5 as user → 403 {"error":"Forbidden"}\nPATCH /api/me {"role":"admin","displayName":"A"} → role unchanged, displayName "A"',
          explanation: [
            'Ownership is part of the query, so there is no window where the wrong record is loaded.',
            '`requireRole` is a coarse, function-level check; ownership is the fine-grained object-level check — you need both.',
            'The update allowlist stops mass assignment of `role`, `isVerified`, `balance`…',
          ],
        }),
      ),
      section('real-world', 'Patterns that scale',
        bullets(
          'Centralise rules in a policy module (or a library such as CASL — third-party) instead of ad-hoc `if`s in controllers.',
          'Multi-tenant apps: take `tenantId` from the verified token and inject it into every repository query.',
          'Write tests with **two users**: user A must get 404/403 on user B\'s resources for every endpoint.',
          'Log authorisation denials (A09) — enumeration shows up as bursts of 404/403.',
        ),
        tip('Return 404 for "exists but not yours" on object routes; return 403 when the user knows the resource exists but lacks the role.'),
      ),
      section('mistakes', 'Common mistakes',
        bullets(
          'Hiding buttons in the UI and calling it access control.',
          'Trusting ids or roles from the request body or a non-signed cookie.',
          'Checking ownership on `GET` but not on `PUT`/`DELETE` of the same resource.',
          'Thinking UUIDs fix IDOR — they leak via URLs, logs and shared links.',
          'Allow-by-default middleware with a list of "protected" routes — new routes ship unprotected.',
        ),
      ),
      section('interview', 'Interview angle',
        interviewTip('Distinguish authN vs authZ, function-level vs object-level checks, and say "deny by default, ownership in the query, test with two users".'),
      ),
      section('practice', 'Practice',
        text('Take any CRUD API you wrote. For each route list: required role, ownership rule, and allowed fields for writes. Add an integration test that logs in as two users and asserts cross-access returns 404.'),
      ),
      section('summary', 'Summary',
        bullets(
          'A01 = users exceeding their permissions: IDOR/BOLA, escalation, mass assignment.',
          'Enforce on the server; deny by default; unknown action = forbidden.',
          'Object-level: scope queries by owner/tenant. Function-level: role middleware.',
          'Allowlist writable fields. Test cross-user access explicitly.',
        ),
      ),
    ],
    revisionNotes: [
      'AuthN = identity; AuthZ = permission.',
      'IDOR/BOLA: id in URL without owner check → scope query by `userId`.',
      'Deny by default; unknown policy → false.',
      'Mass assignment: allowlist fields, never spread `req.body` into the model.',
      'UUIDs are not authorisation.',
    ],
    quiz: [
      {
        kind: 'find-bug', difficulty: 'intermediate',
        prompt: 'The route requires a valid JWT. What is the flaw?',
        code: "app.delete('/api/posts/:id', requireAuth, async (req, res) => {\n  await Post.deleteOne({ _id: req.params.id });\n  res.status(204).end();\n});",
        options: [
          'It should return 200, not 204',
          'Any logged-in user can delete any post — the query lacks an owner condition (IDOR)',
          '`requireAuth` should come after the handler',
          '`deleteOne` is deprecated',
        ],
        answer: 1,
        explanation: 'Authentication is present but authorisation is not. Add `authorId: req.user.id` (or an admin check) to the filter.',
      },
      {
        kind: 'mcq', difficulty: 'beginner',
        prompt: 'Which change actually fixes an IDOR on `/orders/:id`?',
        options: [
          'Switch numeric ids to UUIDs',
          'Hide the order link in the UI',
          'Query `{ id, userId: req.user.id }` and return 404 when nothing matches',
          'Add rate limiting',
        ],
        answer: 2,
        explanation: 'Only an ownership check enforces permission. UUIDs and rate limits slow enumeration but still let anyone holding an id read the order.',
      },
      {
        kind: 'scenario', difficulty: 'advanced',
        prompt: 'Your SaaS API reads `orgId` from `?orgId=` to filter all queries. What should you do?',
        options: [
          'Validate that orgId is a UUID',
          'Derive orgId from the authenticated token/session and ignore any client-supplied value',
          'Encrypt orgId in the URL',
          'Move orgId to a request header',
        ],
        answer: 1,
        explanation: 'Tenant identity must come from a trusted, verified source. Any client-supplied tenant id — query, header or body — can be changed by the client.',
      },
    ],
    interview: [
      {
        category: 'express-backend', kind: 'concept', difficulty: 'intermediate', topic: 'Access control',
        question: 'What is an IDOR and how do you prevent it in an Express API?',
        shortAnswer: 'An IDOR is when an endpoint uses a client-supplied id to load an object without checking the caller may access it; prevent it by scoping every query by the authenticated owner or tenant.',
        detailedAnswer: [
          'Example: `/api/orders/124` returns any order because the handler uses `findById`.',
          'Fix in the data access: `WHERE id = $1 AND user_id = $2`.',
          'Return 404 to avoid confirming existence.',
          'Cover update/delete routes too, and test with two accounts.',
        ],
        followUp: 'Why are random UUIDs not a fix?',
        trap: 'Saying authentication middleware is enough.',
      },
      {
        category: 'advanced', kind: 'concept', difficulty: 'advanced', topic: 'Access control',
        question: 'How would you design authorisation for a multi-tenant API so that a forgotten check fails safely?',
        shortAnswer: 'Make deny the default: a central policy layer where unknown actions are forbidden, and a repository layer that automatically injects the tenant id from the verified token into every query.',
        detailedAnswer: [
          'Router-level `requireAuth` applied globally; public routes are explicitly opted out.',
          'Repository methods require a `ctx` with `tenantId`; there is no API to query without it.',
          'Postgres Row-Level Security can enforce tenant isolation in the database itself.',
          'Policies (`can(user, action, resource)`) return false for unregistered actions.',
          'Contract tests iterate all routes with a foreign-tenant user and expect 403/404.',
        ],
        followUp: 'How does Postgres Row-Level Security interact with a connection pool?',
        trap: 'Relying on every developer remembering to add `WHERE tenant_id = ?`.',
      },
    ],
  },

  'input-validation': {
    summary: 'Input validation checks every value from outside the process against an allowlist schema — type, length, format, range — at the boundary, and rejects anything else before it reaches business logic.',
    topics: ['input validation', 'allowlist', 'schema validation', 'zod', 'joi', 'type coercion', 'length limits', 'ReDoS'],
    sections: [
      section('introduction', undefined,
        text('Everything in `req.body`, `req.query`, `req.params` and headers is attacker-controlled. Validation turns "anything" into "exactly the shape I expect" — or a 400.'),
      ),
      section('definition', 'Definition',
        text('**Input validation** is checking untrusted data against a strict specification at a trust boundary. Good validation is an **allowlist** (what is allowed) rather than a blocklist (what is forbidden).'),
        table('What to validate', ['Check', 'Example rule', 'Stops'], [
          ['Type', '`age` must be an integer, `email` a string', 'NoSQL operator objects, type confusion'],
          ['Length / size', 'name ≤ 100 chars; body ≤ 100 kb; array ≤ 50 items', 'DoS, buffer abuse, huge DB rows'],
          ['Format', 'email, UUID, ISO date', 'Garbage data, some injection'],
          ['Range', '`1 ≤ quantity ≤ 100`', 'Negative prices, overflows'],
          ['Enum / allowlist', '`sort ∈ {price, name}`', 'SQL identifier injection'],
          ['Unknown fields', 'reject or strip extra keys', 'Mass assignment'],
        ]),
      ),
      section('why', 'Why validation is not the whole defence',
        bullets(
          'Validation reduces attack surface and gives good error messages.',
          'It does **not** replace parameterised queries, output encoding or authorisation — a valid string can still be `O\'Brien` or contain `<`.',
          'Validate on the **server**; client-side validation is a UX feature only.',
        ),
      ),
      section('internals', 'Where validation fits',
        flow([
          'Raw request',
          'Size limits: express.json({ limit })',
          'Schema parse: type/length/format',
          'Typed, trusted object',
          'Authorisation',
          'Business logic / DB (parameterised)',
        ], { title: 'Validate at the boundary', direction: 'horizontal' }),
        steps(
          'Body parser enforces a byte limit (`express.json({ limit: "100kb" })`).',
          'A schema library parses `req.body` → either a typed object or a list of issues.',
          'On failure respond `400` with field-level messages (no stack traces).',
          'Downstream code only ever sees `parsed.data`, never `req.body`.',
        ),
      ),
      section('example', 'Vulnerable vs fixed',
        code({
          title: 'Hand-rolled allowlist validator (pure JS)',
          runnable: true,
          code: dedent(`
            function validateSignup(input) {
              const errors = [];
              const { email, age, plan } = input ?? {};
              if (typeof email !== 'string' || email.length > 254 || !/^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$/.test(email)) errors.push('email');
              if (!Number.isInteger(age) || age < 13 || age > 120) errors.push('age');
              if (!['free', 'pro'].includes(plan)) errors.push('plan');
              const extra = Object.keys(input ?? {}).filter((k) => !['email', 'age', 'plan'].includes(k));
              if (extra.length) errors.push('unknown:' + extra.join(','));
              return errors.length ? { ok: false, errors } : { ok: true, data: { email, age, plan } };
            }
            console.log(JSON.stringify(validateSignup({ email: 'a@b.io', age: 30, plan: 'pro' })));
            console.log(JSON.stringify(validateSignup({ email: { $ne: null }, age: '30', plan: 'enterprise', role: 'admin' })));
          `),
          expectedOutput: '{"ok":true,"data":{"email":"a@b.io","age":30,"plan":"pro"}}\n{"ok":false,"errors":["email","age","plan","unknown:role"]}',
          explanation: [
            'Type checks reject the operator object and the string `"30"`.',
            '`plan` uses an enum allowlist; `enterprise` is not in it.',
            'Unknown keys are rejected — `role` cannot sneak into the model.',
            'In real projects a schema library expresses all this declaratively.',
          ],
        }),
        code({
          title: 'zod middleware (zod is third-party)',
          code: dedent(`
            import { z } from 'zod';

            const CreateOrder = z.object({
              productId: z.string().uuid(),
              quantity: z.number().int().min(1).max(100),
              note: z.string().trim().max(500).optional(),
            }).strict(); // reject unknown keys

            const ListQuery = z.object({
              page: z.coerce.number().int().min(1).default(1),   // query strings are always strings
              sort: z.enum(['price', 'createdAt']).default('createdAt'),
            });

            const validate = (schema, where = 'body') => (req, res, next) => {
              const r = schema.safeParse(req[where]);
              if (!r.success) return res.status(400).json({ errors: r.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) });
              req.valid = { ...req.valid, [where]: r.data };
              next();
            };

            app.use(express.json({ limit: '100kb' }));
            app.post('/orders', requireAuth, validate(CreateOrder), (req, res) => createOrder(req.user, req.valid.body));
            app.get('/products', validate(ListQuery, 'query'), (req, res) => listProducts(req.valid.query));
          `),
          expectedOutput: 'POST /orders {"productId":"x","quantity":0,"isPaid":true}\n→ 400 {"errors":[{"path":"productId","message":"Invalid uuid"},{"path":"quantity","message":"Number must be greater than or equal to 1"},{"path":"","message":"Unrecognized key(s) in object: \'isPaid\'"}]}',
          explanation: [
            '`.strict()` turns unknown keys into errors (default zod behaviour is to strip them).',
            '`z.coerce.number()` is right for query strings; never coerce JSON bodies silently.',
            'Exact message wording differs between zod versions — do not assert on it in tests.',
            'joi, yup, valibot and ajv (JSON Schema) are alternatives — all third-party.',
          ],
        }),
      ),
      section('real-world', 'In production',
        bullets(
          'Share schemas between frontend and backend (zod) or generate them from OpenAPI (ajv).',
          'Validate headers you rely on (`x-request-id` length) and file uploads (size, MIME **and** magic bytes).',
          'Bound regexes; avoid nested quantifiers like `(a+)+` that cause **ReDoS** on crafted input.',
          'Normalise before validating (Unicode NFC, trim) so checks see the same value the logic uses.',
        ),
      ),
      section('mistakes', 'Common mistakes',
        bullets(
          'Validating `req.body` but using `req.query` values unchecked.',
          'Blocklists ("reject strings containing `<script>`") instead of allowlists.',
          'No length limits — a 10 MB "name" string is valid JSON.',
          'Using validated data and then spreading the original `req.body` into the DB anyway.',
        ),
        warn('Do not treat validation as sanitisation for output. A perfectly valid comment can still contain `<`, so output encoding is still required.'),
      ),
      section('interview', 'Interview angle',
        interviewTip('Say "allowlist schema at the boundary: type, length, format, range, unknown keys" and add that it is defence in depth, not a substitute for parameterised queries or encoding.'),
      ),
      section('practice', 'Practice',
        text('Write a zod schema for `PATCH /me` that allows only `displayName` (1–50 chars) and `timezone` (from `Intl.supportedValuesOf("timeZone")`), rejects unknown keys, and returns field errors.'),
      ),
      section('summary', 'Summary',
        bullets(
          'All external input is untrusted: body, query, params, headers, files.',
          'Allowlist: type, length, format, range, enum, no unknown keys.',
          'Use a schema library (zod/joi — third-party) as middleware; only pass parsed data on.',
          'Validation complements, never replaces, query parameterisation and output encoding.',
        ),
      ),
    ],
    revisionNotes: [
      'Allowlist > blocklist.',
      'Check type, length, format, range, enum; reject unknown keys.',
      '`express.json({ limit })` caps body size.',
      'Query strings are strings → coerce explicitly.',
      'Beware ReDoS in validation regexes.',
    ],
    quiz: [
      {
        kind: 'mcq', difficulty: 'beginner',
        prompt: 'Which validation approach is preferred?',
        options: [
          'Blocklist known-bad characters',
          'Allowlist the exact expected type, format and range',
          'Validate only in the browser',
          'Validate after saving to the database',
        ],
        answer: 1,
        explanation: 'Allowlists fail closed: anything not explicitly allowed is rejected. Blocklists always miss a variant, and browser validation is bypassable.',
      },
      {
        kind: 'find-bug', difficulty: 'intermediate',
        prompt: 'What is wrong with this handler?',
        code: "const Body = z.object({ name: z.string().max(50) });\napp.patch('/me', (req, res) => {\n  Body.parse(req.body);\n  await User.update(req.user.id, req.body);\n});",
        options: [
          'zod cannot validate strings',
          'It validates but then writes the original `req.body`, so stripped/unknown keys like `role` still reach the DB',
          '`max(50)` is too small',
          'PATCH cannot have a body',
        ],
        answer: 1,
        explanation: 'zod strips unknown keys only in the *returned* object. Using `req.body` afterwards discards that protection — always use the parsed result. (The handler also needs `async`.)',
      },
    ],
    interview: [
      {
        category: 'express-backend', kind: 'concept', difficulty: 'beginner', topic: 'Input validation',
        question: 'Why must input validation happen on the server even if the frontend already validates?',
        shortAnswer: 'Because anyone can send requests directly with curl or a script, skipping the frontend entirely; client validation is only for user experience.',
        detailedAnswer: [
          'The API is the trust boundary, not the UI.',
          'Attackers replay and modify requests with tools like curl or intercepting proxies.',
          'Server validation protects data integrity for every client (mobile, partners, scripts).',
        ],
        followUp: 'What fields would you validate on a signup endpoint?',
        trap: 'Assuming a SPA is the only client of the API.',
      },
      {
        category: 'express-backend', kind: 'concept', difficulty: 'intermediate', topic: 'Input validation',
        question: 'What does schema validation at the API boundary protect against, and what does it not?',
        shortAnswer: 'It blocks wrong types, oversized values, unknown fields and malformed formats; it does not make valid data safe for SQL, HTML or shell contexts, nor does it check authorisation.',
        detailedAnswer: [
          'Protects: operator injection via objects, mass assignment, DoS via huge fields, logic bugs from bad types.',
          'Does not: `O\'Brien` is valid but must still be parameterised; `<b>` may be valid but must be encoded.',
          'Does not decide whether the user may touch the record.',
          'Hence defence in depth: validate → authorise → parameterise → encode.',
        ],
        followUp: 'How do you avoid ReDoS in validation regexes?',
        trap: 'Claiming validation alone prevents injection.',
      },
    ],
  },

  'output-encoding': {
    summary: 'Output encoding converts data into a safe representation for the exact context it is written into — HTML body, attribute, JavaScript, URL, CSS, shell or SQL — so data is never interpreted as code.',
    topics: ['output encoding', 'context-aware escaping', 'HTML entities', 'encodeURIComponent', 'JSON in script', 'attribute encoding', 'template auto-escaping'],
    sections: [
      section('introduction', undefined,
        text('Injection happens at the **output** — the moment data is placed into HTML, a URL, a shell command or SQL. Encoding for that context is what keeps data as data.'),
      ),
      section('definition', 'Definition',
        text('**Output encoding** (escaping) transforms characters that are special in a target syntax into an inert form for *that* syntax. Different contexts need different encoders.'),
        table('Context → encoder', ['Context', 'Example sink', 'Correct technique'], [
          ['HTML body', '`<p>DATA</p>`', 'HTML entity encode `& < > " \'` (template auto-escaping)'],
          ['HTML attribute (quoted)', '`<input value="DATA">`', 'Attribute encode, always quote the attribute'],
          ['URL parameter', '`/search?q=DATA`', '`encodeURIComponent` / `URLSearchParams`'],
          ['URL in href/src', '`<a href="DATA">`', 'Validate scheme is http/https, then attribute-encode'],
          ['JavaScript in a page', '`<script>const s = DATA</script>`', 'Serialize JSON and escape `<` as `\\u003c`; better: use a data attribute'],
          ['SQL', '`WHERE x = DATA`', 'Not encoding — use parameters'],
          ['Shell', '`exec("convert " + DATA)`', 'Not encoding — `execFile`/`spawn` with an args array'],
        ]),
      ),
      section('why', 'Why "context" is everything',
        bullets(
          'HTML-encoding does nothing inside a JavaScript string: `\'; alert(1); //` contains no `<`.',
          '`encodeURIComponent` does nothing for `javascript:alert(1)` in an `href` — the scheme itself is the danger.',
          'Encoding twice shows `&amp;lt;` to users; encoding in the wrong place leaves a hole. Encode **once, at output**.',
        ),
      ),
      section('internals', 'How a browser decides what is code',
        steps(
          'The HTML parser tokenises: `<` starts a tag, `"` ends an attribute value, `&` starts an entity.',
          'Inside `<script>`, the JS parser takes over — only `</script>` ends it, so `</script><script>…` in a JSON string breaks out.',
          'In `href`, the URL parser looks at the scheme first (`javascript:` executes).',
          'Encoding replaces the characters each parser treats as structure with their inert form.',
        ),
        flow([
          'Untrusted data',
          'Where is it going?',
          'HTML → entities',
          'Attribute → quote + entities',
          'URL → encodeURIComponent + scheme check',
          'Script → JSON + \\u003c',
        ], { title: 'Pick the encoder by sink', direction: 'vertical' }),
      ),
      section('example', 'Encoders per context',
        code({
          title: 'Same value, four contexts (pure JS)',
          runnable: true,
          code: dedent(`
            const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
            const jsonForScript = (v) => JSON.stringify(v).replace(/</g, '\\\\u003c');
            const safeHref = (u) => (/^https?:\\/\\//i.test(u) ? escapeHtml(u) : '#');

            const input = '"/><script>alert(1)</script>';
            console.log('<p>' + escapeHtml(input) + '</p>');
            console.log('/search?q=' + encodeURIComponent(input));
            console.log('<script>window.__DATA__ = ' + jsonForScript({ name: input }) + '</script>');
            console.log('<a href="' + safeHref('javascript:alert(1)') + '">x</a>');
          `),
          expectedOutput: '<p>&quot;/&gt;&lt;script&gt;alert(1)&lt;/script&gt;</p>\n/search?q=%22%2F%3E%3Cscript%3Ealert(1)%3C%2Fscript%3E\n<script>window.__DATA__ = {"name":"\\"/>\\u003cscript>alert(1)\\u003c/script>"}</script>\n<a href="#">x</a>',
          explanation: [
            'HTML context: entities make the markup display as text.',
            'URL context: percent-encoding keeps the value inside the `q` parameter (note `(` and `)` are not encoded by `encodeURIComponent`).',
            'Script context: `JSON.stringify` handles quotes; replacing `<` with `\\u003c` prevents `</script>` breaking out.',
            'href context: a scheme allowlist rejects `javascript:` — encoding alone would not.',
          ],
        }),
        code({
          title: 'Shell and SQL: use APIs, not encoding (VULNERABLE vs FIXED)',
          code: dedent(`
            import { exec, execFile } from 'node:child_process';

            // ❌ VULNERABLE: filename "a.png; rm -rf ~" runs a second command
            exec('convert ' + req.body.file + ' out.webp');

            // ✅ FIXED: no shell; each argument is passed as-is to the program
            execFile('convert', [req.body.file, 'out.webp'], (err) => { /* ... */ });

            // SQL: parameters, not escaping
            await pool.query('INSERT INTO comments(body) VALUES ($1)', [req.body.body]);
          `),
          expectedOutput: 'file = "a.png; rm -rf ~"\n  exec     → shell runs convert AND rm\n  execFile → convert receives the literal filename "a.png; rm -rf ~" (file not found)',
          explanation: [
            '`exec` spawns `/bin/sh -c`, so `;`, `&&`, `$( )` are interpreted.',
            '`execFile`/`spawn` without `shell: true` pass an argv array — no shell parsing at all.',
            'Still validate the filename (path traversal, leading `-` treated as an option).',
          ],
        }),
      ),
      section('real-world', 'In real projects',
        bullets(
          'Rely on auto-escaping engines (EJS `<%= %>`, Handlebars `{{ }}`, Nunjucks autoescape, React JSX).',
          'Grep for raw sinks in review: `<%-`, `{{{`, `| safe`, `dangerouslySetInnerHTML`, `v-html`, `innerHTML`.',
          'For server-rendered initial state, prefer `<script type="application/json" id="data">` + `JSON.parse(el.textContent)` with `<` escaped.',
          'Return JSON with the right `Content-Type` and `nosniff` so browsers never treat it as HTML.',
        ),
      ),
      section('mistakes', 'Common mistakes',
        bullets(
          'Encoding on input and storing entities — then double-encoding or missing the non-HTML contexts.',
          'Unquoted attributes: `<div title=DATA>` breaks out with a space.',
          'Using `escape()` (deprecated) or `encodeURI` instead of `encodeURIComponent` for parameter values.',
          'Putting user data inside inline event handlers (`onclick="go(\'DATA\')"`) — two contexts nested.',
        ),
      ),
      section('interview', 'Interview angle',
        interviewTip('Say "encoding is per context and happens at output", and give one example where HTML encoding is insufficient (JS string or `javascript:` URL).'),
      ),
      section('practice', 'Practice',
        text('Write `renderProfile(user)` returning HTML with the name in a `<h1>`, the website in an `<a href>`, and the user object embedded as JSON for client scripts. Make it safe for name `</h1><script>x()</script>` and website `javascript:x()`.'),
      ),
      section('summary', 'Summary',
        bullets(
          'Encode at output, for the specific context.',
          'HTML entities ≠ URL encoding ≠ JS/JSON escaping.',
          'URL sinks need a scheme allowlist.',
          'SQL and shell: use parameters / argv arrays instead of encoding.',
          'Prefer auto-escaping templates and safe DOM APIs; review every raw sink.',
        ),
      ),
    ],
    revisionNotes: [
      'Encode once, at output, for the sink\'s context.',
      'HTML: `& < > " \'` → entities. URL param: `encodeURIComponent`.',
      'href/src: allow only http(s) schemes.',
      'JSON in `<script>`: escape `<` as `\\u003c`.',
      'Shell: `execFile`/`spawn` with args array, never `exec` with input.',
    ],
    quiz: [
      {
        kind: 'mcq', difficulty: 'intermediate',
        prompt: 'A profile link is rendered as `<a href="<%= user.website %>">`. EJS HTML-escapes the value. Is it safe?',
        options: [
          'Yes, HTML escaping covers every attribute',
          'No — `javascript:alert(1)` contains no special HTML characters; the scheme must be validated',
          'Yes, because the attribute is quoted',
          'No — EJS does not escape attributes',
        ],
        answer: 1,
        explanation: 'The attack needs no `<` or `"`. URL sinks require a scheme allowlist (http/https) in addition to attribute encoding.',
      },
      {
        kind: 'predict-output', difficulty: 'intermediate',
        prompt: 'What does this print?',
        code: "console.log(encodeURIComponent('a b&c=d/e'));",
        options: ['a%20b%26c%3Dd%2Fe', 'a+b&c=d/e', 'a%20b&c=d/e', 'a b%26c%3Dd%2Fe'],
        answer: 0,
        explanation: '`encodeURIComponent` encodes space, `&`, `=` and `/`. `encodeURI` would leave `&`, `=` and `/` alone; `+` for space is form encoding (URLSearchParams).',
      },
      {
        kind: 'find-bug', difficulty: 'advanced',
        prompt: 'Why is this server-rendered state injection unsafe?',
        code: "res.send(`<script>window.STATE = ${JSON.stringify(state)}</script>`);",
        options: [
          'JSON.stringify throws on strings',
          'A string containing `</script>` closes the script tag early; `<` must be escaped (e.g. \\u003c)',
          'window.STATE is read-only',
          'Nothing, JSON is always safe in HTML',
        ],
        answer: 1,
        explanation: 'The HTML parser ends the script at the first `</script>`, regardless of JS string quotes. Escaping `<` keeps the JSON valid and inert.',
      },
    ],
    interview: [
      {
        category: 'express-backend', kind: 'concept', difficulty: 'intermediate', topic: 'Output encoding',
        question: 'What is the difference between input validation and output encoding, and why do you need both?',
        shortAnswer: 'Validation checks that data has the expected shape when it arrives; encoding makes data inert for the specific syntax where it is used. Valid data can still be dangerous in an output context.',
        detailedAnswer: [
          'Validation is at the inbound boundary, context-free.',
          'Encoding is at each outbound sink and depends on the context (HTML, URL, JS).',
          'A valid display name like `<3 Tom` still must be HTML-encoded.',
          'The same value may go to several contexts, each needing its own encoder.',
        ],
        followUp: 'Why not just encode once when saving to the database?',
        trap: 'Storing HTML-encoded data and believing it is safe everywhere.',
      },
      {
        category: 'advanced', kind: 'concept', difficulty: 'advanced', topic: 'Output encoding',
        question: 'Why is `child_process.exec` with user input dangerous even if you escape quotes, and what should you use instead?',
        shortAnswer: '`exec` passes the string to a shell, where many metacharacters (`;`, `|`, `$()`, backticks, newlines) have meaning; use `execFile` or `spawn` with an argument array and no shell.',
        detailedAnswer: [
          'Shell quoting rules differ across sh, bash, cmd.exe and PowerShell.',
          'Escaping quotes misses command substitution and newlines.',
          '`execFile(cmd, args)` calls the program directly; each arg is one argv entry.',
          'Still validate: a leading `-` can be parsed as an option (use `--` where the tool supports it); check paths for traversal.',
          'Avoid `shell: true` with any untrusted data.',
        ],
        followUp: 'What is argument injection, and how does `--` help?',
        trap: 'Believing `spawn` is always safe — it is not when `shell: true` is set.',
      },
    ],
  },
};

export default content;
