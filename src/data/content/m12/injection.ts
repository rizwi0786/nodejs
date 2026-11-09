import type { ModuleContent } from '../../../types';
import { bullets, code, dedent, flow, interviewTip, note, section, steps, table, text } from '../helpers';

const content: Partial<ModuleContent> = {
  'owasp-top-10': {
    summary: 'The OWASP Top 10 is a consensus list of the most critical web application security risk categories — a shared vocabulary for threat modelling and code review.',
    topics: ['OWASP Top 10', 'A01 Broken Access Control', 'A03 Injection', 'A10 SSRF', 'security risk categories', 'threat modelling'],
    sections: [
      section('introduction', undefined,
        text('Security is huge. The **OWASP Top 10** narrows it to the ten risk categories that cause the most real-world breaches, so teams know where to look first.'),
      ),
      section('definition', 'What it is',
        text('OWASP (Open Worldwide Application Security Project) is a non-profit. Its **Top 10** is a periodically updated awareness document ranking web risk *categories* by incidence and impact.'),
        bullets(
          'It is a list of **categories**, not individual bugs — "Injection" covers SQL, NoSQL, OS command and LDAP injection.',
          'It is an awareness document, not a full standard. For a verifiable checklist use **OWASP ASVS**.',
          'This lesson uses the **2021** edition, which most courses, tools and interviews still reference.',
        ),
      ),
      section('why', 'Why backend developers care',
        bullets(
          'Most items are **server-side** problems: access control, injection, misconfiguration, outdated dependencies.',
          'It gives code reviewers and interviewers a shared vocabulary ("that is an IDOR, A01").',
          'Security scanners, pentest reports and compliance audits map findings to these IDs.',
        ),
      ),
      section('internals', 'The 2021 list with Node.js examples',
        table('OWASP Top 10 — 2021', ['ID', 'Category', 'Node / Express example', 'Primary defence'], [
          ['A01', 'Broken Access Control', '`GET /api/orders/42` returns another user\'s order (IDOR)', 'Ownership checks, deny by default'],
          ['A02', 'Cryptographic Failures', 'Passwords hashed with MD5; data sent over plain HTTP', 'bcrypt/argon2/scrypt, TLS everywhere'],
          ['A03', 'Injection (incl. XSS)', '`db.query("... WHERE id = " + req.query.id)`', 'Parameterised queries, output encoding'],
          ['A04', 'Insecure Design', 'Password reset with no rate limit and guessable codes', 'Threat modelling, secure design patterns'],
          ['A05', 'Security Misconfiguration', 'Stack traces in production responses; `cors({ origin: "*" })` with credentials', 'Hardened defaults, Helmet, no debug in prod'],
          ['A06', 'Vulnerable and Outdated Components', 'An old package version with a known CVE', '`npm audit`, Dependabot, lockfiles'],
          ['A07', 'Identification and Authentication Failures', 'No brute-force protection on `/login`; JWT never expires', 'Rate limiting, MFA, short-lived tokens'],
          ['A08', 'Software and Data Integrity Failures', 'Unsigned auto-updates; unsafe deserialisation; compromised CI', 'Signatures, `npm ci`, pinned CI actions'],
          ['A09', 'Security Logging and Monitoring Failures', 'Failed logins are not logged; no alerts', 'Structured audit logs + alerting'],
          ['A10', 'Server-Side Request Forgery', '`fetch(req.body.url)` hits `169.254.169.254`', 'URL allowlist, block private IPs'],
        ]),
        note('A **2025 edition** of the Top 10 has been published. Notable changes reported by OWASP include a new *Software Supply Chain Failures* category, a new *Mishandling of Exceptional Conditions* category, and SSRF being folded into Broken Access Control. Check owasp.org for the final wording — this course teaches the 2021 IDs because they remain the most widely cited.'),
      ),
      section('visual', 'Where the risks sit in a request',
        flow([
          'Client: sends request',
          'TLS: A02 — encrypt in transit',
          'Auth: A07 — who are you?',
          'Access control: A01 — may you do this?',
          'Input handling: A03 / A10 — validate, parameterise',
          'Dependencies: A06 / A08 — trusted code only',
          'Logging: A09 — record and alert',
        ], { title: 'Top 10 categories along the request path', direction: 'vertical' }),
      ),
      section('example', 'Spotting categories in code',
        code({
          title: 'One route, three OWASP categories (VULNERABLE)',
          code: dedent(`
            // ❌ VULNERABLE — do not copy
            app.get('/api/invoices/:id', async (req, res) => {
              // A03 Injection: user input concatenated into SQL
              const rows = await db.query('SELECT * FROM invoices WHERE id = ' + req.params.id);
              // A01 Broken Access Control: no check that the invoice belongs to req.user
              res.json(rows[0]);
            });

            app.use((err, req, res, next) => {
              // A05 Misconfiguration: leaks stack traces and SQL to the client
              res.status(500).json({ error: err.stack });
            });
          `),
          expectedOutput: 'GET /api/invoices/1%20OR%201=1  → 200 with the first invoice of ANY user\nGET /api/invoices/abc            → 500 {"error":"error: column \\"abc\\" does not exist\\n    at ..."}',
          explanation: [
            'Concatenating `req.params.id` lets an attacker change the SQL itself (A03).',
            'Even with a safe query, nothing checks `invoice.user_id === req.user.id` (A01).',
            'Returning `err.stack` tells an attacker your table names and library versions (A05).',
          ],
        }),
        code({
          title: 'Same route, FIXED',
          code: dedent(`
            // ✅ FIXED
            app.get('/api/invoices/:id', requireAuth, async (req, res) => {
              const { rows } = await db.query(
                'SELECT * FROM invoices WHERE id = $1 AND user_id = $2', // parameterised + scoped
                [req.params.id, req.user.id],
              );
              if (!rows[0]) return res.status(404).json({ error: 'Not found' }); // no existence leak
              res.json(rows[0]);
            });

            app.use((err, req, res, next) => {
              req.log.error({ err }, 'unhandled error');      // A09: log server-side
              res.status(500).json({ error: 'Internal error' }); // A05: generic to client
            });
          `),
          expectedOutput: 'GET /api/invoices/1%20OR%201=1  → 404 {"error":"Not found"}\nGET /api/invoices/7 (owned)     → 200 {"id":7,...}',
          explanation: [
            '`$1`/`$2` placeholders send values separately from the SQL text, so input can never become syntax.',
            '`AND user_id = $2` makes ownership part of the query — another user\'s id simply matches nothing.',
            'Returning 404 (not 403) avoids confirming that the invoice exists.',
          ],
        }),
      ),
      section('real-world', 'Using the list in a team',
        bullets(
          'Add a "Security" section to the PR template that lists A01, A03, A05 — the three most common in API code.',
          'Map scanner findings (Snyk, Semgrep, ZAP) to Top 10 IDs to prioritise them.',
          'Use OWASP ASVS Level 1/2 as the actual checklist; the Top 10 is the summary.',
        ),
      ),
      section('mistakes', 'Common mistakes',
        bullets(
          'Treating the Top 10 as a complete checklist — it is a starting point, not a standard.',
          'Thinking XSS has its own category in 2021 — it was merged into **A03 Injection**.',
          'Believing a framework makes you immune: Express does not do access control or input validation for you.',
        ),
      ),
      section('interview', 'Interview angle',
        interviewTip('Name a few categories *with a concrete Node example and fix* each. "A01 — IDOR: always scope queries by `user_id`" is far stronger than reciting all ten names.'),
      ),
      section('practice', 'Practice',
        steps(
          'Pick one of your Express projects.',
          'For each Top 10 category write one sentence: "where could this happen in my app?"',
          'Fix the top two findings and note which category each belonged to.',
        ),
      ),
      section('summary', 'Summary',
        bullets(
          'Top 10 = risk categories ranked by prevalence and impact.',
          '2021: A01 Broken Access Control is #1; A03 Injection includes XSS; A10 is SSRF.',
          'Use ASVS for verification; use the Top 10 for awareness and vocabulary.',
          'A 2025 edition exists; know that it adds supply-chain and exception-handling categories.',
        ),
      ),
    ],
    revisionNotes: [
      'A01 Broken Access Control, A02 Crypto Failures, A03 Injection, A04 Insecure Design, A05 Misconfiguration.',
      'A06 Vulnerable Components, A07 AuthN Failures, A08 Integrity Failures, A09 Logging/Monitoring, A10 SSRF.',
      'XSS is inside A03 Injection in 2021.',
      'Top 10 = awareness; ASVS = verification standard.',
      '2025 edition: new Supply Chain + Exceptional Conditions categories; SSRF merged into A01.',
    ],
    quiz: [
      {
        kind: 'mcq', difficulty: 'beginner',
        prompt: 'In the OWASP Top 10 (2021), which category is ranked #1?',
        options: ['Injection', 'Cryptographic Failures', 'Broken Access Control', 'Server-Side Request Forgery'],
        answer: 2,
        explanation: 'A01:2021 is Broken Access Control. Injection dropped from #1 (2017) to #3 in 2021; SSRF is A10.',
      },
      {
        kind: 'scenario', difficulty: 'intermediate',
        prompt: 'A pentest shows that your production API returns full stack traces with SQL text on errors. Which category and fix fit best?',
        options: [
          'A03 Injection — switch to an ORM',
          'A05 Security Misconfiguration — log details server-side and return a generic error message',
          'A09 Logging Failures — stop logging errors',
          'A02 Cryptographic Failures — encrypt the stack trace',
        ],
        answer: 1,
        explanation: 'Leaking internals is a misconfiguration (A05). Logging is still required (A09), just not to the client; encryption or an ORM does not address the leak.',
      },
      {
        kind: 'mcq', difficulty: 'intermediate',
        prompt: 'Where does Cross-Site Scripting (XSS) sit in the 2021 list?',
        options: ['Its own category, A07', 'Inside A03 Injection', 'Inside A05 Security Misconfiguration', 'It was removed from the list'],
        answer: 1,
        explanation: 'In 2021 XSS was merged into A03 Injection: both are "untrusted data interpreted as code". A07 is authentication failures.',
      },
    ],
    interview: [
      {
        category: 'express-backend', kind: 'concept', difficulty: 'beginner', topic: 'OWASP Top 10',
        question: 'What is the OWASP Top 10 and how would you use it on a Node.js project?',
        shortAnswer: 'A ranked list of the ten most critical web application risk categories; I use it as a review checklist and vocabulary, then go deeper with ASVS.',
        detailedAnswer: [
          'Published by OWASP; the 2021 edition starts with A01 Broken Access Control and ends with A10 SSRF.',
          'Categories are broad — A03 Injection covers SQL, NoSQL, command injection and XSS.',
          'In practice: add the top categories to PR review, map scanner findings to IDs, prioritise fixes.',
          'It is awareness material; OWASP ASVS is the testable standard.',
        ],
        followUp: 'Which three categories are most relevant to a JSON REST API, and why?',
        trap: 'Saying "Injection is #1" — that was the 2017 list.',
      },
      {
        category: 'advanced', kind: 'concept', difficulty: 'advanced', topic: 'OWASP Top 10',
        question: 'Why did Broken Access Control move to the top of the OWASP list, and why is it hard to catch with automated tools?',
        shortAnswer: 'It was found in the highest share of tested apps; it is business-logic specific, so scanners cannot know which user should see which record.',
        detailedAnswer: [
          'Access rules are application semantics ("only the owner or an admin may refund"), not a syntax pattern.',
          'A scanner sees `200 OK` for `/orders/43` and cannot tell it belonged to someone else without two test identities.',
          'Injection is easier to detect: payloads produce recognisable errors or timing changes.',
          'Defence needs design: central authorisation layer, deny by default, ownership in queries, and tests with multiple users.',
        ],
        followUp: 'How would you write automated tests that catch an IDOR?',
        trap: 'Assuming authentication (being logged in) implies authorisation.',
      },
    ],
  },

  'sql-injection': {
    summary: 'SQL injection happens when user input is concatenated into a SQL string, letting an attacker change the query; parameterised queries fix it by sending data separately from code.',
    topics: ['SQL injection', 'tautology', 'UNION-based', 'blind SQLi', 'parameterized queries', 'prepared statements', 'ORM raw queries'],
    sections: [
      section('introduction', undefined,
        text('If you build SQL by gluing strings together, a user can type SQL instead of data. The database cannot tell the difference — it just runs the new query.'),
      ),
      section('definition', 'Definition',
        text('**SQL injection (SQLi)** is an injection flaw where untrusted input becomes part of the SQL *syntax* rather than a *value*.'),
        table('Main SQLi techniques', ['Technique', 'Payload idea', 'What the attacker gets'], [
          ['Tautology', "`' OR '1'='1`", 'WHERE clause always true → bypass login or dump all rows'],
          ['UNION-based', "`' UNION SELECT email, password_hash FROM users --`", 'Rows from other tables appended to the normal result'],
          ['Error-based', 'Input that triggers a type error', 'Data leaked inside DB error messages'],
          ['Blind (boolean)', "`' AND substring(pw,1,1)='a' --`", 'One bit per request from true/false page differences'],
          ['Blind (time)', "`'; SELECT pg_sleep(5) --`", 'One bit per request from response timing'],
          ['Stacked queries', "`'; DROP TABLE users; --`", 'Arbitrary statements (if the driver allows multiple statements)'],
        ]),
      ),
      section('why', 'Why it still happens',
        bullets(
          'Template literals make concatenation look harmless: `` `... WHERE id = ${id}` ``.',
          'Dynamic parts — column names in `ORDER BY`, table names — cannot be parameterised, so people concatenate them.',
          'ORMs are safe by default, but every ORM has a raw-query escape hatch that is just as dangerous as plain SQL.',
        ),
      ),
      section('internals', 'How the attack works, step by step',
        steps(
          'The server builds a string: `"SELECT * FROM users WHERE email = \'" + email + "\'"`.',
          "The attacker sends `email = ' OR '1'='1' --`.",
          "The final SQL is `SELECT * FROM users WHERE email = '' OR '1'='1' --'` — the quote closed the string, `OR` added logic, `--` commented out the rest.",
          'The database parses and plans this new query and returns every user.',
          'With a **parameterised** query the SQL text `WHERE email = $1` is parsed first; the value is bound later as data, so quotes inside it are just characters.',
        ),
        flow([
          'Input: \' OR \'1\'=\'1',
          'String concat: input becomes SQL syntax',
          'DB parser: sees OR clause',
          'Result: all rows returned',
        ], { title: 'Concatenation path (vulnerable)', direction: 'horizontal' }),
        flow([
          'SQL text: WHERE email = $1',
          'DB parses + plans query',
          'Bind $1 = literal string',
          'Result: no match',
        ], { title: 'Parameterised path (safe)', direction: 'horizontal' }),
      ),
      section('example', 'Vulnerable vs fixed',
        code({
          title: 'Seeing the injected query (pure JS simulation)',
          runnable: true,
          code: dedent(`
            function buildQuery(email) {
              // ❌ string concatenation — what vulnerable code does
              return "SELECT id FROM users WHERE email = '" + email + "'";
            }
            console.log(buildQuery('ana@example.com'));
            console.log(buildQuery("' OR '1'='1' --"));
            console.log(buildQuery("' UNION SELECT password_hash FROM users --"));
          `),
          expectedOutput: "SELECT id FROM users WHERE email = 'ana@example.com'\nSELECT id FROM users WHERE email = '' OR '1'='1' --'\nSELECT id FROM users WHERE email = '' UNION SELECT password_hash FROM users --'",
          explanation: [
            'The first call is the intended query.',
            'The tautology payload closes the quote and adds `OR \'1\'=\'1\'`, which is true for every row.',
            'The UNION payload appends a second SELECT, leaking hashes in the same response.',
          ],
        }),
        code({
          title: 'node-postgres (pg): VULNERABLE vs FIXED',
          code: dedent(`
            // ❌ VULNERABLE: template literal = concatenation
            const r1 = await pool.query(\`SELECT * FROM users WHERE email = '\${req.body.email}'\`);

            // ✅ FIXED: placeholders + values array
            const r2 = await pool.query('SELECT * FROM users WHERE email = $1', [req.body.email]);

            // mysql2 uses ? placeholders and execute() for server-side prepared statements
            const [rows] = await conn.execute('SELECT * FROM users WHERE email = ?', [req.body.email]);
          `),
          expectedOutput: "email = \"' OR '1'='1' --\"\nr1.rows.length → 1500 (every user)\nr2.rows.length → 0",
          explanation: [
            '`pg` sends the SQL text and the values separately (extended query protocol).',
            'The payload is compared as a literal string, which matches no email.',
            '`mysql2` `execute()` uses prepared statements; `query()` with `?` escapes client-side — both avoid concatenation.',
          ],
        }),
        code({
          title: 'ORMs are not automatically safe',
          code: dedent(`
            // Sequelize — ❌ raw query with interpolation
            await sequelize.query(\`SELECT * FROM users WHERE name = '\${name}'\`);
            // ✅ replacements / bind
            await sequelize.query('SELECT * FROM users WHERE name = :name', { replacements: { name } });

            // Prisma — ❌ $queryRawUnsafe with concatenation
            await prisma.$queryRawUnsafe('SELECT * FROM "User" WHERE name = \\'' + name + '\\'');
            // ✅ $queryRaw tagged template turns \${} into parameters
            await prisma.$queryRaw\`SELECT * FROM "User" WHERE name = \${name}\`;

            // Identifiers can't be bound → allowlist them
            const SORTABLE = new Set(['created_at', 'name']);
            const sort = SORTABLE.has(req.query.sort) ? req.query.sort : 'created_at';
            await pool.query(\`SELECT * FROM users ORDER BY \${sort} LIMIT $1\`, [20]);
          `),
          expectedOutput: "?sort=name;DROP TABLE users  → falls back to ORDER BY created_at\n?sort=name                   → ORDER BY name",
          explanation: [
            'Prisma\'s `$queryRaw` is a **tagged template**: interpolations become bound parameters. `$queryRawUnsafe` does not.',
            'Sequelize `replacements` escape values; `bind` uses real DB parameters.',
            'Column/table names cannot be placeholders, so they must come from a fixed allowlist.',
          ],
        }),
      ),
      section('real-world', 'In a real backend',
        bullets(
          'Use a query builder (Knex, Kysely) or ORM for most queries; grep for `queryRawUnsafe`, `sequelize.literal`, `knex.raw` in reviews.',
          'Give the app DB user **least privilege** — no `DROP`, no access to other schemas — to limit damage.',
          'Disable multiple statements in the driver (`multipleStatements: false` is the mysql2 default).',
          'Validate input types first: an `id` that must be an integer can be rejected before it reaches SQL.',
        ),
      ),
      section('mistakes', 'Common mistakes',
        bullets(
          'Escaping quotes by hand (`replace(/\'/g, "\'\'")`) — encodings and edge cases break it. Use placeholders.',
          'Assuming numeric fields are safe: `WHERE id = ` + `1 OR 1=1` needs no quotes at all.',
          'Using placeholders for values but concatenating `ORDER BY` or `LIMIT` from the query string.',
          'Believing a WAF is the fix — it is a speed bump; the code must be correct.',
        ),
      ),
      section('interview', 'Interview angle',
        interviewTip('Explain *why* parameterisation works (parse first, bind later), not just "use prepared statements". Then mention identifiers needing an allowlist and ORM raw-query escape hatches.'),
      ),
      section('practice', 'Practice',
        text('Write a `searchProducts({ q, sort, dir })` repository function using `pg`. `q` must be bound, `sort` must be one of `price|name`, `dir` one of `asc|desc`. Try the payload `price; DELETE FROM products` and confirm it is ignored.'),
      ),
      section('summary', 'Summary',
        bullets(
          'SQLi = input becomes SQL syntax. Techniques: tautology, UNION, error-based, blind (boolean/time).',
          'Fix: parameterised queries / prepared statements — data is bound after parsing.',
          'Identifiers cannot be bound → allowlist.',
          'ORMs are safe until you use raw/unsafe APIs with interpolation.',
          'Defence in depth: input validation, least-privilege DB user, no error details to clients.',
        ),
      ),
    ],
    revisionNotes: [
      "Tautology: `' OR '1'='1` · UNION: append SELECT · Blind: boolean or time (`pg_sleep`).",
      'pg uses `$1`, mysql2 uses `?`; pass values as an array.',
      'Placeholders cannot replace table/column names → allowlist.',
      'Prisma `$queryRaw` (tagged) is safe; `$queryRawUnsafe` + concat is not.',
      'Least-privilege DB user limits blast radius.',
    ],
    quiz: [
      {
        kind: 'find-bug', difficulty: 'intermediate',
        prompt: 'This code uses a placeholder. What is still vulnerable?',
        code: "const { sort = 'id' } = req.query;\nawait pool.query(`SELECT * FROM users WHERE org_id = $1 ORDER BY ${sort}`, [req.user.orgId]);",
        options: [
          'Nothing — the placeholder protects the whole query',
          '`$1` should be `?` for pg',
          '`sort` is interpolated into the SQL text; it must be checked against an allowlist',
          '`req.user.orgId` must be escaped manually',
        ],
        answer: 2,
        explanation: 'Placeholders protect only the bound values. `sort` is pasted into the SQL text, so `id; DROP TABLE users` would change the query. `$1` is correct for pg.',
      },
      {
        kind: 'mcq', difficulty: 'intermediate',
        prompt: 'An attacker cannot see query results or errors, but the page responds 5 seconds slower for some inputs. What is this?',
        options: ['UNION-based SQLi', 'Time-based blind SQLi', 'Stored XSS', 'Tautology login bypass'],
        answer: 1,
        explanation: 'Time-based blind SQLi extracts one bit per request through a deliberate delay (e.g. `pg_sleep`). UNION requires visible results.',
      },
      {
        kind: 'complete-code', difficulty: 'beginner',
        prompt: 'Complete the safe pg query.',
        code: "await pool.query('SELECT * FROM users WHERE email = /* ??? */', [email]);",
        options: ["'\" + email + \"'", '$1', '${email}', ':email'],
        answer: 1,
        explanation: 'node-postgres uses numbered placeholders `$1, $2…` with a values array. `:email` is Sequelize-style replacements; the others concatenate.',
      },
    ],
    interview: [
      {
        category: 'express-backend', kind: 'concept', difficulty: 'intermediate', topic: 'SQL injection',
        question: 'Why do parameterised queries prevent SQL injection, while manual escaping is discouraged?',
        shortAnswer: 'The SQL text is parsed before values are bound, so values can never change the query structure; escaping tries to make data safe inside the syntax and is easy to get wrong.',
        detailedAnswer: [
          'With placeholders the driver sends query text and values separately (or the server prepares, then executes).',
          'The parser has already built the plan; a bound value is always a literal.',
          'Manual escaping depends on charset, quoting context, DB dialect and numeric vs string fields.',
          'Numeric contexts need no quote at all, so escaping quotes does nothing for `id = 1 OR 1=1`.',
        ],
        followUp: 'How do you safely make the ORDER BY column dynamic?',
        trap: 'Saying "prepared statements escape the input" — they do not escape, they separate.',
      },
      {
        category: 'advanced', kind: 'scenario', difficulty: 'advanced', topic: 'SQL injection',
        question: 'Your team uses Prisma everywhere. A security review still flags SQL injection risk. Where would you look?',
        shortAnswer: 'At the raw-query escape hatches — `$queryRawUnsafe`/`$executeRawUnsafe` or `Prisma.raw` built with concatenation — and at any dynamic identifiers.',
        detailedAnswer: [
          'Tagged `$queryRaw` turns interpolations into parameters; the `Unsafe` variants take a plain string.',
          'Helper functions that build WHERE fragments with string concatenation and pass them to `Prisma.raw`.',
          'Dynamic sort/filter fields mapped straight from the query string.',
          'Fix with tagged templates, `Prisma.sql`/`Prisma.join`, and allowlists; add a lint rule banning `Unsafe` APIs.',
        ],
        followUp: 'How would you prevent this regression in CI?',
        trap: 'Assuming "we use an ORM" closes the topic.',
      },
    ],
  },

  'nosql-injection': {
    summary: 'NoSQL injection abuses query operators: when a JSON body like `{ "$ne": null }` reaches a MongoDB filter, it changes the query logic. Fix it by validating types and stripping operator keys.',
    topics: ['NoSQL injection', 'MongoDB operator injection', '$ne', '$gt', '$where', '$regex', 'type validation', 'sanitize'],
    sections: [
      section('introduction', undefined,
        text('MongoDB has no SQL strings, so people assume injection is impossible. But Mongo queries are **objects**, and JSON request bodies are objects too — an attacker can send operators instead of values.'),
      ),
      section('definition', 'Definition',
        text('**NoSQL operator injection** happens when user-controlled objects are used as query filters, letting the attacker inject operators such as `$ne`, `$gt`, `$regex`, `$where` or `$expr`.'),
        table('Typical injected operators', ['Payload', 'Effect when used as a filter value'], [
          ['`{ "$ne": null }`', 'Matches any document where the field is not null → login bypass'],
          ['`{ "$gt": "" }`', 'Matches every non-empty string'],
          ['`{ "$regex": "^a" }`', 'Enumerates values character by character'],
          ['`{ "$where": "sleep(5000)" }`', 'Runs server-side JS (if enabled) → DoS / timing attacks'],
        ]),
      ),
      section('why', 'Why it happens in Express',
        bullets(
          '`express.json()` parses `{"password": {"$ne": null}}` into a real nested object.',
          'The `qs` parser (Express\'s default "extended" query parser in Express 4) turns `?password[$ne]=x` into `{ password: { $ne: "x" } }`.',
          'Code like `User.findOne({ email: req.body.email, password: req.body.password })` trusts the shape of the input.',
        ),
      ),
      section('internals', 'Attack step by step',
        steps(
          'Login handler: `users.findOne({ username: req.body.username, password: req.body.password })`.',
          'Attacker POSTs `{ "username": "admin", "password": { "$ne": null } }`.',
          'The filter becomes `{ username: "admin", password: { $ne: null } }` — "admin whose password is anything".',
          'MongoDB returns the admin document → the attacker is logged in without the password.',
          'Fix: ensure `password` is a **string** before it is used, and compare hashes in application code (bcrypt), never in the filter.',
        ),
        flow([
          'Body: {"password":{"$ne":null}}',
          'express.json(): nested object',
          'findOne(filter): operator interpreted',
          'Match: first admin document',
          'Result: auth bypass',
        ], { title: 'Operator injection', direction: 'horizontal' }),
      ),
      section('example', 'Vulnerable vs fixed',
        code({
          title: 'Stripping keys that start with $ (pure JS)',
          runnable: true,
          code: dedent(`
            function stripOperators(value) {
              if (Array.isArray(value)) return value.map(stripOperators);
              if (value !== null && typeof value === 'object') {
                const out = {};
                for (const [k, v] of Object.entries(value)) {
                  if (k.startsWith('$') || k.includes('.')) continue; // drop operators and dotted paths
                  out[k] = stripOperators(v);
                }
                return out;
              }
              return value;
            }

            const body = { username: 'admin', password: { $ne: null }, profile: { 'a.b': 1, name: 'x' } };
            console.log(JSON.stringify(stripOperators(body)));
            console.log(typeof body.password === 'string' ? 'ok' : 'reject: password must be a string');
          `),
          expectedOutput: '{"username":"admin","password":{},"profile":{"name":"x"}}\nreject: password must be a string',
          explanation: [
            'Keys beginning with `$` are operators; keys containing `.` can target nested paths — both are dropped.',
            'Stripping alone leaves `password: {}`, which is still the wrong **type** — that is why a type check is the real fix.',
            'Sanitising is defence in depth; schema validation (string, length) is the primary control.',
          ],
        }),
        code({
          title: 'Login: VULNERABLE vs FIXED',
          code: dedent(`
            // ❌ VULNERABLE — password compared inside the query, shape not checked
            app.post('/login', async (req, res) => {
              const user = await User.findOne({ email: req.body.email, password: req.body.password });
              if (!user) return res.status(401).end();
              res.json({ token: sign(user) });
            });

            // ✅ FIXED — validate types, look up by email only, compare hash in code
            import { z } from 'zod'; // third-party
            const Login = z.object({ email: z.string().email().max(254), password: z.string().min(1).max(128) });

            app.post('/login', async (req, res) => {
              const parsed = Login.safeParse(req.body);
              if (!parsed.success) return res.status(400).json({ error: 'Invalid input' });
              const { email, password } = parsed.data;
              const user = await User.findOne({ email: { $eq: email } });
              const ok = user && (await bcrypt.compare(password, user.passwordHash));
              if (!ok) return res.status(401).json({ error: 'Invalid credentials' });
              res.json({ token: sign(user) });
            });
          `),
          expectedOutput: 'POST {"email":"admin@x.io","password":{"$ne":null}}\n  vulnerable → 200 {"token":"eyJ..."}\n  fixed      → 400 {"error":"Invalid input"}',
          explanation: [
            'zod rejects the object because `password` must be a string.',
            '`{ $eq: email }` forces equality even if a non-string slipped through.',
            'Passwords are never stored or compared in plain text; `bcrypt.compare` runs in application code.',
          ],
        }),
      ),
      section('real-world', 'Production hardening',
        bullets(
          'Validate every body/query/params with a schema (zod, joi, ajv — third-party) before it touches the DB.',
          'Mongoose: `mongoose.set("sanitizeFilter", true)` (Mongoose 6+) wraps `$`-keys in filters with `$eq`. Mongoose also casts to schema types, which helps — but do not rely on it alone.',
          'Middleware packages that strip `$` keys exist (the classic one is `express-mongo-sanitize`); check a package\'s maintenance status and Express 5 compatibility before adopting it — or write the small function above.',
          'Disable server-side JavaScript (`$where`, `mapReduce`) on the MongoDB server if you do not need it.',
        ),
      ),
      section('mistakes', 'Common mistakes',
        bullets(
          'Believing "no SQL means no injection".',
          'Validating only `req.body` and forgetting `req.query` (`?role[$ne]=user`).',
          'Building `$where` or `$expr` clauses from user strings.',
          'Putting user input straight into `$regex` — also enables ReDoS. Escape it or use exact match.',
        ),
      ),
      section('interview', 'Interview angle',
        interviewTip('The killer detail is `{ "$ne": null }` in a login body and the fix "**validate that it is a string**". Mentioning `?a[$ne]=1` via the query-string parser shows depth.'),
      ),
      section('practice', 'Practice',
        text('Extend `stripOperators` to also remove `__proto__` and `constructor` keys (prototype-pollution guard), then write a zod schema for a `GET /users?role=` filter that only accepts `admin|user`.'),
      ),
      section('summary', 'Summary',
        bullets(
          'Mongo filters are objects; JSON/qs input can carry operators.',
          '`{ "$ne": null }` turns "password equals X" into "password is anything".',
          'Primary fix: schema/type validation. Secondary: strip `$`/dotted keys, `sanitizeFilter`, `$eq`.',
          'Never compare passwords inside the query.',
        ),
      ),
    ],
    revisionNotes: [
      'Login bypass payload: `{"password": {"$ne": null}}`.',
      'Query string too: `?password[$ne]=x` with the extended (qs) parser.',
      'Fix = check `typeof === "string"` / schema validation first.',
      'Strip keys starting with `$` or containing `.`; Mongoose `sanitizeFilter`.',
      'Avoid `$where`, user-built `$regex` (ReDoS).',
    ],
    quiz: [
      {
        kind: 'predict-output', difficulty: 'intermediate',
        prompt: 'A collection has one user `{ user: "admin", pass: "s3cret" }`. What does this return?',
        code: "db.users.findOne({ user: 'admin', pass: { $ne: null } })",
        options: ['null', 'The admin document', 'A MongoServerError', 'An empty object'],
        answer: 1,
        explanation: '`$ne: null` matches any non-null password, so the admin document is returned. That is exactly the login-bypass attack.',
      },
      {
        kind: 'find-bug', difficulty: 'intermediate',
        prompt: 'Why is this still injectable even though the body is validated?',
        code: "app.get('/orders', async (req, res) => {\n  const orders = await Order.find({ status: req.query.status, userId: req.user.id });\n  res.json(orders);\n});",
        options: [
          '`req.user.id` should be a string',
          '`req.query.status` is never validated; `?status[$ne]=x` becomes an operator object',
          '`find` should be `findOne`',
          'It needs `await` twice',
        ],
        answer: 1,
        explanation: 'The extended query parser turns `status[$ne]=x` into `{ $ne: "x" }`, returning all statuses. Query params need validation too.',
      },
      {
        kind: 'mcq', difficulty: 'beginner',
        prompt: 'What is the most reliable fix for operator injection on a login endpoint?',
        options: [
          'Use HTTPS',
          'Validate that email and password are strings, then compare the password hash in code',
          'Rename the password field',
          'Use a longer JWT secret',
        ],
        answer: 1,
        explanation: 'Type validation blocks operator objects entirely, and comparing a bcrypt hash in code removes the password from the filter. HTTPS protects transport, not query logic.',
      },
    ],
    interview: [
      {
        category: 'express-backend', kind: 'concept', difficulty: 'intermediate', topic: 'NoSQL injection',
        question: 'How can an attacker bypass a MongoDB login without knowing the password?',
        shortAnswer: 'By sending an operator object such as `{ "$ne": null }` as the password, which the filter interprets as "any non-null value".',
        detailedAnswer: [
          '`express.json()` parses nested objects, so the operator reaches `findOne` intact.',
          'The filter `{ email, password: { $ne: null } }` matches the user regardless of password.',
          'Same via query string with `qs`: `?password[$ne]=`.',
          'Fix: schema-validate types, query by email only, `bcrypt.compare` in code, optionally strip `$` keys.',
        ],
        followUp: 'What other Mongo operators are dangerous with user input?',
        trap: 'Saying MongoDB is immune to injection because it has no query language strings.',
      },
      {
        category: 'advanced', kind: 'concept', difficulty: 'advanced', topic: 'NoSQL injection',
        question: 'Why is stripping `$`-prefixed keys considered defence in depth rather than the primary fix for NoSQL injection?',
        shortAnswer: 'Because the root problem is accepting the wrong type; stripping still lets objects, arrays or unexpected shapes through, while schema validation rejects them outright.',
        detailedAnswer: [
          'After stripping, `{ "$ne": null }` becomes `{}` — still an object where a string was expected.',
          'Arrays can trigger implicit `$in`-like matching on array fields.',
          'Stripping does not cover `$regex` built from a string, `$where` strings, or ReDoS.',
          'Schema validation (type, length, format, allowlist) fails closed; sanitisation is a safety net for missed routes.',
        ],
        followUp: 'How does Mongoose `sanitizeFilter` differ from stripping keys?',
        trap: 'Recommending a sanitising package as the complete solution without checking its maintenance status or validating types.',
      },
    ],
  },
};

export default content;
