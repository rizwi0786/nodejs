import type { ModuleContent } from '../../../types';
import { bullets, code, dedent, flow, interviewTip, note, section, steps, table, text } from '../helpers';

const content: Partial<ModuleContent> = {
  // ─────────────────────────────────────────────────────────────
  'parameterized-queries': {
    summary: 'Parameterised queries send SQL text with $1, $2 placeholders separately from the values, so user input is always treated as data, never as SQL.',
    topics: ['$1 placeholders', 'bind parameters', 'extended query protocol', 'prepared statements', 'named queries', 'identifiers', 'allowlist', 'ANY($1)', 'pg-format'],
    sections: [
      section('introduction', undefined,
        text('Every query that includes user input has two parts: the **shape** of the query (written by you) and the **values** (from the user). Parameterised queries keep these two parts separate all the way to the database.'),
      ),
      section('definition', 'Definition',
        bullets(
          'In node-postgres, placeholders are `$1`, `$2`, … (1-based) and values are passed as an array: `pool.query(text, [a, b])`.',
          'The driver sends the SQL text and the values in **separate protocol messages** (Parse, then Bind).',
          'The server parses and plans the query **before** it sees the values, so a value can never change the query structure.',
          'Other drivers use `?` (mysql2) or named `:name` / `@name` placeholders — same idea.',
        ),
      ),
      section('why', 'Why not escape strings yourself?',
        bullets(
          'Hand-escaping misses edge cases (encodings, backslashes, numeric contexts without quotes).',
          'Parameters also handle types: Dates, Buffers, arrays and JSON are serialised correctly.',
          'Named prepared statements can be parsed once per connection and reused.',
        ),
      ),
      section('internals', 'What goes over the wire',
        flow([
          'Parse: "SELECT * FROM users WHERE email = $1"',
          'Bind: $1 = "x\' OR 1=1 --" (as data)',
          'Execute: plan runs with the bound value',
          'Result: 0 rows (no user has that literal email)',
        ], { title: 'Extended query protocol', direction: 'horizontal' }),
        table('What can and cannot be a parameter', ['Part of query', 'Parameter?', 'What to do instead'],
          [
            ['Values in WHERE / INSERT / UPDATE', 'Yes', '`$1`'],
            ['LIMIT / OFFSET values', 'Yes', '`LIMIT $2`'],
            ['A list for IN', 'Yes, as an array', '`WHERE id = ANY($1)` with `[ids]`'],
            ['Table / column names', 'No', 'Allowlist map or escape with `pg.escapeIdentifier` / pg-format `%I`'],
            ['ASC / DESC, operators, keywords', 'No', 'Allowlist'],
          ]),
      ),
      section('example', 'Using placeholders correctly',
        code({
          title: 'Values, arrays and JSON',
          code: dedent(`
            // Basic
            await pool.query('SELECT id, email FROM users WHERE email = $1 AND active = $2', [email, true]);

            // IN-list → ANY($1) with a JS array
            const { rows } = await pool.query('SELECT id FROM users WHERE id = ANY($1::bigint[])', [[1, 2, 3]]);
            console.log(rows.map((r) => r.id));

            // Same placeholder used twice
            await pool.query('SELECT * FROM posts WHERE author_id = $1 OR editor_id = $1', [userId]);

            // jsonb value
            await pool.query('INSERT INTO events (payload) VALUES ($1)', [JSON.stringify({ type: 'login' })]);
          `),
          expectedOutput: "[ '1', '2', '3' ]",
          explanation: [
            'A JS array is sent as a Postgres array; `ANY` checks membership — no need to build `IN ($1,$2,$3)` dynamically.',
            'ids are bigint → strings in results.',
            'Stringify objects destined for json/jsonb columns explicitly to avoid ambiguity with arrays.',
          ],
        }),
        code({
          title: 'Dynamic ORDER BY with an allowlist',
          code: dedent(`
            const SORTABLE = { created: 'created_at', price: 'price', name: 'name' };

            function listProductsQuery({ sort = 'created', dir = 'desc', limit = 20 }) {
              const column = SORTABLE[sort];
              if (!column) throw new Error('Invalid sort field');
              const direction = dir === 'asc' ? 'ASC' : 'DESC';
              const safeLimit = Math.min(Number(limit) || 20, 100);
              return {
                text: 'SELECT id, name, price FROM products ORDER BY ' + column + ' ' + direction + ', id LIMIT $1',
                values: [safeLimit],
              };
            }

            console.log(listProductsQuery({ sort: 'price', dir: 'asc', limit: 500 }));
            try { listProductsQuery({ sort: 'price; DROP TABLE products' }); }
            catch (e) { console.log(e.message); }
          `),
          expectedOutput: dedent(`
            {
              text: 'SELECT id, name, price FROM products ORDER BY price ASC, id LIMIT $1',
              values: [ 100 ]
            }
            Invalid sort field
          `),
          explanation: [
            'Identifiers cannot be `$n` parameters, so the user picks a *key* and your code picks the *column*.',
            'Direction is normalised to one of two literals; limit is coerced and capped.',
            'Only values from the allowlist are ever concatenated.',
          ],
          runnable: true,
        }),
        code({
          title: 'Named prepared statement',
          code: dedent(`
            const getUser = {
              name: 'get-user-by-id',          // parsed once per connection, reused after
              text: 'SELECT id, email FROM users WHERE id = $1',
              values: [42],
            };
            const { rows } = await pool.query(getUser);
          `),
          expectedOutput: "[ { id: '42', email: 'ana@example.com' } ]",
          explanation: ['Useful for hot queries; the name must always map to the same text.', 'Behind PgBouncer transaction mode, check named prepared statement support (PgBouncer 1.21+ can track them).'],
        }),
      ),
      section('real-world', 'In a real backend',
        bullets(
          'Search endpoints: `WHERE name ILIKE $1` with value `\'%\' + term + \'%\'` — the wildcards go in the value, not the SQL.',
          'Bulk inserts: `INSERT ... SELECT * FROM unnest($1::text[], $2::int[])` with arrays, instead of building huge VALUES strings.',
          'Query builders (Knex, Kysely) and ORMs generate parameterised SQL for you — but their "raw" escape hatches do not.',
        ),
      ),
      section('mistakes', 'Common mistakes',
        bullets(
          'Quoting the placeholder: `WHERE email = \'$1\'` — that is a literal string "$1", not a parameter.',
          'Trying `ORDER BY $1` — it orders by a constant, silently doing nothing useful.',
          'Using placeholders but concatenating another part of the query from input.',
          '`$0` — numbering starts at 1.',
        ),
        code({
          title: 'Wrong vs right',
          code: dedent(`
            // ❌ Concatenation — injectable
            pool.query("SELECT * FROM users WHERE email = '" + req.query.email + "'");

            // ❌ Quoted placeholder — compares to the literal text $1
            pool.query("SELECT * FROM users WHERE email = '$1'", [req.query.email]);

            // ✅
            pool.query('SELECT * FROM users WHERE email = $1', [req.query.email]);
          `),
          expectedOutput: '(the second form throws: bind message supplies 1 parameters, but prepared statement "" requires 0)',
          explanation: ['Inside quotes, $1 is just characters, so the statement has zero parameters and the extra value is rejected.'],
        }),
      ),
      section('interview', 'Interview angle',
        interviewTip('Say precisely *why* parameters are safe: query text and values travel separately and the query is parsed before values are bound.'),
        interviewTip('Volunteer the limitation: identifiers and keywords cannot be parameters → allowlist.'),
      ),
      section('practice', 'Practice',
        steps(
          'Write a filter endpoint supporting `?minPrice=&maxPrice=&category=` where any filter may be absent. Build the WHERE clause and values array together.',
          'Add `?sort=` with an allowlist and `?ids=1,2,3` using ANY.',
          'Log the final `{ text, values }` and confirm no user input appears in `text`.',
        ),
      ),
      section('summary', 'Summary',
        bullets(
          'Use `$1..$n` + values array for every user-supplied value.',
          'Arrays + `ANY($1)` replace dynamic IN lists.',
          'Identifiers and keywords: allowlist, never parameters or raw input.',
          'Placeholders are never quoted.',
        ),
      ),
    ],
    revisionNotes: [
      'pg placeholders: $1-based; mysql2 uses ?.',
      'Parse (text) and Bind (values) are separate messages → values cannot alter structure.',
      'IN list → `= ANY($1::int[])`.',
      'Table/column/ASC|DESC cannot be parameters → allowlist / escapeIdentifier.',
      '`\'$1\'` in quotes is a literal, not a placeholder.',
      'Named query `{ name, text, values }` = prepared statement per connection.',
    ],
    quiz: [
      {
        kind: 'mcq', difficulty: 'intermediate',
        prompt: 'Why can a value bound to $1 never change the structure of the SQL statement?',
        options: ['pg escapes quotes in the value', 'The server parses the SQL text before it receives the values, which are bound as data', 'Postgres rejects strings containing semicolons', 'Values are base64-encoded'],
        answer: 1,
        explanation: 'Parse and Bind are separate steps; the plan exists before values arrive. pg does not rely on escaping for parameters.',
      },
      {
        kind: 'find-bug', difficulty: 'intermediate',
        prompt: 'The sort does not work. Why?',
        code: "pool.query('SELECT * FROM products ORDER BY $1 LIMIT 20', [req.query.sort]);",
        options: ['LIMIT must be a parameter too', 'Identifiers cannot be parameters; ORDER BY $1 sorts by a constant string', 'ORDER BY needs DESC', 'pg does not support ORDER BY'],
        answer: 1,
        explanation: 'The value is bound as a string literal, so every row has the same sort key. Map the user value through an allowlist of column names.',
      },
      {
        kind: 'complete-code', difficulty: 'beginner',
        prompt: 'Select users whose id is in the JS array ids.',
        code: "pool.query('SELECT * FROM users WHERE id = /* ??? */', [ids]);",
        options: ['IN ($1)', 'ANY($1)', "'$1'", '$ids'],
        answer: 1,
        explanation: 'pg sends a JS array as a Postgres array and = ANY($1) tests membership. IN ($1) would compare id to the whole array.',
      },
    ],
    interview: [
      {
        category: 'express-backend', kind: 'concept', difficulty: 'beginner', topic: 'Parameterized queries',
        question: 'What is a parameterized query?',
        shortAnswer: 'A query whose SQL text contains placeholders like $1, with the actual values supplied separately, so the database treats the values strictly as data.',
        detailedAnswer: [
          'Example: `pool.query(\'SELECT * FROM users WHERE id = $1\', [id])`.',
          'Prevents SQL injection and handles type conversion.',
          'Allows plan reuse via prepared statements.',
          'Supported by every mainstream driver; syntax varies ($1, ?, :name).',
        ],
        followUp: 'Can you parameterize a table name?',
        trap: 'Thinking parameterization is just automatic string escaping.',
      },
      {
        category: 'express-backend', kind: 'scenario', difficulty: 'intermediate', topic: 'Parameterized queries',
        question: 'Your API must support sorting by any of several columns chosen by the client. How do you implement it safely?',
        shortAnswer: 'Map the client\'s sort key through a server-side allowlist to a known column name, normalise direction to ASC/DESC, and concatenate only those trusted strings, while all values still use $n parameters.',
        detailedAnswer: [
          'Identifiers cannot be bound as parameters.',
          'Reject unknown keys with 400 rather than falling back silently, or use a default.',
          'Add a unique tie-breaker (id) for deterministic pagination.',
          'If truly dynamic identifiers are needed, quote with `client.escapeIdentifier` or pg-format `%I` — still prefer allowlists.',
        ],
        followUp: 'How would you allow multi-column sorts like ?sort=-price,name?',
        trap: 'Using `ORDER BY $1`, which silently sorts by a constant.',
      },
    ],
  },

  // ─────────────────────────────────────────────────────────────
  'sql-injection-prevention': {
    summary: 'SQL injection happens when user input is concatenated into SQL and changes its meaning; prevent it with parameters, allowlists for identifiers, least-privilege DB roles and safe ORM usage.',
    topics: ['SQL injection', 'OWASP', 'tautology attack', 'UNION-based injection', 'blind injection', 'second-order injection', 'least privilege', 'ORM raw queries', 'defense in depth'],
    sections: [
      section('introduction', undefined,
        text('SQL injection is one of the oldest and most damaging web vulnerabilities (Injection is in the OWASP Top 10). One concatenated string can let an attacker read every table, bypass login, or delete data.'),
      ),
      section('definition', 'Definition',
        text('**SQL injection** occurs when untrusted input is interpreted as part of a SQL statement instead of as a value.'),
        table('Injection techniques', ['Technique', 'Example payload', 'Effect'],
          [
            ['Tautology', '`\' OR \'1\'=\'1`', 'WHERE always true → login bypass / dump rows'],
            ['Comment truncation', '`admin\'--`', 'Rest of the query (password check) commented out'],
            ['UNION-based', '`\' UNION SELECT email, password_hash FROM users--`', 'Read other tables'],
            ['Stacked queries', '`1; DROP TABLE users`', 'Run extra statements (simple query protocol only)'],
            ['Blind / time-based', '`\' AND pg_sleep(5)--`', 'Infer data from timing'],
            ['Second-order', 'Stored safely, later concatenated in another query', 'Delayed injection'],
          ]),
      ),
      section('why', 'Why it still happens',
        bullets(
          'Dynamic queries built with template literals for "flexibility" (filters, sort, search).',
          'ORM raw-query escape hatches used with interpolation.',
          'Trusting "internal" data (from the DB or another service) — second-order injection.',
        ),
      ),
      section('internals', 'Why concatenation is dangerous',
        flow([
          'Input: email = x\' OR \'1\'=\'1',
          'Concatenate: WHERE email = \'x\' OR \'1\'=\'1\'',
          'Parser: sees an OR condition',
          'Result: every row matches',
        ], { title: 'How the payload rewrites the query', direction: 'horizontal' }),
        note('With parameters, the parser only ever sees `WHERE email = $1`; the payload is just an odd email string.'),
      ),
      section('example', 'Vulnerable vs safe login',
        code({
          title: 'See the injected SQL (pure JS)',
          code: dedent(`
            function buildLoginSql(email, password) {
              return "SELECT id FROM users WHERE email = '" + email + "' AND password = '" + password + "'";
            }
            console.log(buildLoginSql('ana@example.com', 'secret'));
            console.log(buildLoginSql("admin@example.com'--", 'anything'));
            console.log(buildLoginSql("x' OR '1'='1", "x' OR '1'='1"));
          `),
          expectedOutput: dedent(`
            SELECT id FROM users WHERE email = 'ana@example.com' AND password = 'secret'
            SELECT id FROM users WHERE email = 'admin@example.com'--' AND password = 'anything'
            SELECT id FROM users WHERE email = 'x' OR '1'='1' AND password = 'x' OR '1'='1'
          `),
          explanation: [
            'Line 2: `--` starts a SQL comment, so the password check disappears.',
            'Line 3: the trailing `OR \'1\'=\'1\'` is always true, so every row matches.',
            'The attacker controls the query\'s structure, not just a value.',
          ],
          runnable: true,
        }),
        code({
          title: 'The fix with node-postgres',
          code: dedent(`
            import bcrypt from 'bcrypt';

            async function login(email, password) {
              const { rows } = await pool.query(
                'SELECT id, password_hash FROM users WHERE email = $1',
                [email],
              );
              const user = rows[0];
              if (!user || !(await bcrypt.compare(password, user.password_hash))) return null;
              return { id: user.id };
            }

            console.log(await login("admin@example.com'--", 'anything'));
          `),
          expectedOutput: 'null',
          explanation: [
            'The payload is compared as a literal email; no such user exists → null.',
            'Passwords are verified with a hash comparison in code, never in SQL (and never stored in plain text).',
          ],
        }),
        code({
          title: 'ORM raw queries: safe and unsafe forms',
          code: dedent(`
            // Prisma
            await prisma.$queryRaw\`SELECT * FROM users WHERE email = \${email}\`;        // ✅ tagged template → parameter
            await prisma.$queryRawUnsafe('SELECT * FROM users WHERE email = ' + email); // ❌ concatenated

            // Sequelize
            await sequelize.query('SELECT * FROM users WHERE email = :email', {
              replacements: { email }, type: QueryTypes.SELECT,                      // ✅ replacement
            });
            await sequelize.query(\`SELECT * FROM users WHERE email = '\${email}'\`);     // ❌ interpolated
          `),
          expectedOutput: '(safe forms send the value separately; unsafe forms embed it in SQL text)',
          explanation: [
            'Prisma\'s `$queryRaw` tagged template turns each `${}` into a bound parameter.',
            'Anything named "Unsafe", "literal" or "raw" + string concatenation needs review.',
          ],
        }),
      ),
      section('real-world', 'Defense in depth',
        table('Layers of protection', ['Layer', 'Control'],
          [
            ['Query construction', 'Parameters for values; allowlists for identifiers/keywords'],
            ['Input validation', 'Schema validation (zod/joi): types, lengths, formats → reject early'],
            ['Database role', 'App user has only SELECT/INSERT/UPDATE/DELETE on its tables; no DDL, no superuser'],
            ['Errors', 'Generic error messages to clients; details only in logs'],
            ['Detection', 'Static analysis (eslint security rules, Semgrep), code review, WAF as an extra layer'],
          ]),
        bullets(
          'node-postgres with parameters uses the extended protocol, which allows only one statement per query — stacked `; DROP TABLE` cannot ride along in a parameterised call.',
          'Separate migration role (DDL) from runtime role (DML).',
        ),
      ),
      section('mistakes', 'Common mistakes',
        bullets(
          'Believing input validation alone (or escaping quotes) is enough.',
          'Parameterising WHERE values but concatenating `ORDER BY` or table names from input.',
          'Building a `LIKE` pattern via concatenation instead of in the value.',
          'Running the app as the `postgres` superuser.',
        ),
        code({
          title: 'Wrong vs right: search',
          code: dedent(`
            // ❌
            pool.query(\`SELECT * FROM products WHERE name ILIKE '%\${q}%'\`);

            // ✅ wildcards live in the value
            pool.query('SELECT * FROM products WHERE name ILIKE $1', ['%' + q + '%']);
          `),
          expectedOutput: "(q = \"' OR 1=1 --\" returns all products in the first form, none in the second)",
          explanation: ['To match literal % or _ typed by users, escape them in the value (`q.replace(/[%_\\\\]/g, \'\\\\$&\')`).'],
        }),
      ),
      section('interview', 'Interview angle',
        interviewTip('Show the attack (`\' OR \'1\'=\'1`), then the fix, then the extra layers: least privilege, validation, safe error messages.'),
        interviewTip('Mention that ORMs are safe by default but their raw APIs reintroduce the risk.'),
      ),
      section('practice', 'Practice',
        steps(
          'Audit a codebase: grep for template literals containing SELECT/INSERT/UPDATE/DELETE.',
          'Create a Postgres role `app_rw` with only DML privileges and connect the app with it.',
          'Rewrite any dynamic query found using parameters and allowlists.',
        ),
      ),
      section('summary', 'Summary',
        bullets(
          'Injection = input interpreted as SQL.',
          'Fix: parameters always; allowlists for identifiers.',
          'Least-privilege DB roles limit the blast radius.',
          'Watch ORM raw/unsafe APIs and second-order injection.',
        ),
      ),
    ],
    revisionNotes: [
      'Classic payloads: `\' OR \'1\'=\'1`, `admin\'--`, `UNION SELECT`.',
      'Primary defence: parameterised queries. Escaping is not a defence strategy.',
      'Identifiers → allowlist.',
      'Least privilege: no superuser, no DDL for runtime role.',
      'Prisma $queryRaw (tagged) safe; $queryRawUnsafe with concatenation unsafe.',
      'Second-order: data from your own DB is still untrusted input.',
    ],
    quiz: [
      {
        kind: 'predict-output', difficulty: 'beginner',
        prompt: 'What SQL does this build when name = "x\' OR \'1\'=\'1"?',
        code: "const sql = \"SELECT * FROM users WHERE name = '\" + name + \"'\";",
        options: ["SELECT * FROM users WHERE name = 'x'' OR ''1''=''1'", "SELECT * FROM users WHERE name = 'x' OR '1'='1'", 'An error is thrown in JS', "SELECT * FROM users WHERE name = $1"],
        answer: 1,
        explanation: 'String concatenation does no escaping; the quote in the input closes the literal and the OR becomes SQL.',
      },
      {
        kind: 'scenario', difficulty: 'intermediate',
        prompt: 'A team says "we validate that usernames are alphanumeric, so concatenating them into SQL is fine". What is the best response?',
        options: ['Agree; validation is sufficient', 'Use parameterised queries anyway; validation is a second layer and can be bypassed or changed later', 'Base64-encode the username', 'Use a stored procedure with dynamic SQL'],
        answer: 1,
        explanation: 'Validation rules drift and other code paths may skip them. Parameters make injection structurally impossible. Dynamic SQL inside a procedure is just as injectable.',
      },
      {
        kind: 'mcq', difficulty: 'advanced',
        prompt: 'Which Prisma call is vulnerable to SQL injection?',
        options: ['prisma.user.findMany({ where: { email } })', 'prisma.$queryRaw`SELECT * FROM "User" WHERE email = ${email}`', "prisma.$queryRawUnsafe('SELECT * FROM \"User\" WHERE email = \\'' + email + '\\'')", 'prisma.user.findUnique({ where: { id } })'],
        answer: 2,
        explanation: '$queryRawUnsafe executes the concatenated string as-is. The tagged-template $queryRaw converts interpolations into parameters.',
      },
    ],
    interview: [
      {
        category: 'express-backend', kind: 'concept', difficulty: 'beginner', topic: 'SQL injection',
        question: 'What is SQL injection and how do you prevent it in a Node.js API?',
        shortAnswer: 'It is when user input is concatenated into SQL and changes the query\'s meaning; prevent it with parameterized queries (or a query builder/ORM that uses them), allowlists for identifiers, and a least-privilege database user.',
        detailedAnswer: [
          'Example: `\' OR \'1\'=\'1` turns a WHERE into always-true.',
          '`pool.query(\'... WHERE email = $1\', [email])` — values never become SQL.',
          'Validate input shape as an additional layer, not the primary fix.',
          'Restrict DB privileges and hide raw DB errors from clients.',
        ],
        followUp: 'Are ORMs immune to SQL injection?',
        trap: 'Answering "escape single quotes".',
      },
      {
        category: 'express-backend', kind: 'concept', difficulty: 'advanced', topic: 'SQL injection',
        question: 'What is second-order SQL injection?',
        shortAnswer: 'Malicious input is stored safely the first time, then later read back and concatenated into a different query, where it executes — so data from your own database must also be treated as untrusted.',
        detailedAnswer: [
          'Example: a username `bob\'--` saved via a parameterised INSERT, later used in a concatenated admin report query.',
          'Input validation at write time does not catch it if the later query is dynamic.',
          'Fix is the same: parameterise every query regardless of where values come from.',
          'Common in background jobs and reporting scripts that "trust internal data".',
        ],
        followUp: 'How would you detect injection risks systematically in a large codebase?',
        trap: 'Assuming values read from the database are safe to concatenate.',
      },
    ],
  },

  // ─────────────────────────────────────────────────────────────
  'nosql-fundamentals': {
    summary: 'NoSQL databases drop the fixed relational table model in favour of documents, key-value pairs, wide columns or graphs, usually trading joins and strict schemas for flexible data and horizontal scaling.',
    topics: ['NoSQL', 'document store', 'key-value store', 'wide-column store', 'graph database', 'CAP theorem', 'BASE', 'eventual consistency', 'SQL vs NoSQL', 'horizontal scaling'],
    sections: [
      section('introduction', undefined,
        text('"NoSQL" ("not only SQL") is an umbrella for databases that do not store data as relational tables. Each family optimises for a different access pattern — and none of them is a universal replacement for SQL.'),
      ),
      section('definition', 'The four main families',
        table('NoSQL families', ['Family', 'Data model', 'Examples', 'Great for'],
          [
            ['Document', 'JSON-like documents in collections', 'MongoDB, Couchbase, Firestore', 'Varied, nested entities; content, catalogs'],
            ['Key-value', 'key → opaque value', 'Redis, DynamoDB, etcd', 'Caching, sessions, counters, rate limits'],
            ['Wide-column', 'Rows with dynamic columns grouped in families, partitioned by key', 'Cassandra, ScyllaDB, HBase', 'Massive write throughput, time series'],
            ['Graph', 'Nodes + edges with properties', 'Neo4j, Amazon Neptune', 'Social graphs, recommendations, fraud rings'],
          ]),
      ),
      section('why', 'SQL vs NoSQL',
        table('SQL vs NoSQL (typical, not absolute)', ['Aspect', 'Relational (PostgreSQL)', 'Document (MongoDB)'],
          [
            ['Schema', 'Declared, enforced (DDL)', 'Flexible; optional JSON-schema validation'],
            ['Relationships', 'JOINs + foreign keys', 'Embedding or manual references ($lookup)'],
            ['Transactions', 'Full ACID, multi-table', 'Single-document atomic; multi-document ACID since 4.0 (replica sets)'],
            ['Scaling', 'Vertical + read replicas; sharding via extensions', 'Built-in sharding (horizontal)'],
            ['Query language', 'SQL (standard)', 'Driver API / MQL, aggregation pipeline'],
            ['Best fit', 'Strong integrity, complex queries, reporting', 'Evolving shapes, aggregate-oriented reads'],
          ]),
        note('Modern Postgres has `jsonb` with GIN indexes; modern MongoDB has transactions and schema validation. The gap is smaller than old blog posts suggest.'),
      ),
      section('internals', 'CAP theorem and consistency models',
        bullets(
          '**CAP**: in a distributed system, during a network **P**artition you must choose between **C**onsistency (every read sees the latest write or errors) and **A**vailability (every request gets a response).',
          'CP systems refuse some requests during partitions (MongoDB with majority writes, etcd); AP systems keep answering with possibly stale data (Cassandra, DynamoDB with eventual reads).',
          'Without partitions you trade **latency vs consistency** (PACELC).',
          '**BASE** (Basically Available, Soft state, Eventually consistent) describes many AP stores, in contrast with ACID.',
          'Many systems are tunable per operation: MongoDB `writeConcern`/`readConcern`, Cassandra consistency levels.',
        ),
      ),
      section('visual', 'Choosing a family',
        flow([
          'Need joins + strict integrity? → Relational',
          'Entity read/written as one nested unit? → Document',
          'Lookup by key, sub-ms? → Key-value',
          'Huge write volume by partition key? → Wide-column',
          'Queries traverse relationships? → Graph',
        ], { title: 'Rule-of-thumb decision', direction: 'vertical' }),
      ),
      section('example', 'Same data, different models',
        code({
          title: 'Relational vs document vs key-value (pure JS illustration)',
          code: dedent(`
            // Relational: normalised rows
            const users = [{ id: 1, name: 'Ana' }];
            const addresses = [{ id: 10, user_id: 1, city: 'Lisbon' }];

            // Document: one aggregate with nested data
            const userDoc = { _id: 1, name: 'Ana', addresses: [{ city: 'Lisbon' }] };

            // Key-value: opaque value by key
            const kv = new Map([['session:abc123', JSON.stringify({ userId: 1 })]]);

            const joined = users.map((u) => ({ ...u, addresses: addresses.filter((a) => a.user_id === u.id) }));
            console.log(joined[0].addresses[0].city, userDoc.addresses[0].city, JSON.parse(kv.get('session:abc123')).userId);
          `),
          expectedOutput: 'Lisbon Lisbon 1',
          explanation: [
            'Relational needs a join (here simulated) to rebuild the user with addresses.',
            'The document already contains the addresses — one read.',
            'Key-value can only fetch by exact key; the store knows nothing about the value\'s structure.',
          ],
          runnable: true,
        }),
      ),
      section('real-world', 'In a real backend',
        bullets(
          '**Polyglot persistence** is common: Postgres for orders/billing, Redis for cache/sessions/queues, a search engine for full-text, maybe MongoDB for a content service.',
          'Pick by access pattern and consistency needs, not by hype or "web scale".',
          'Operational cost matters: every extra database is another thing to back up, monitor and upgrade.',
        ),
      ),
      section('mistakes', 'Common mistakes',
        bullets(
          'Choosing MongoDB to avoid "designing a schema" — you still have a schema, it is just implicit in code.',
          'Modelling highly relational data (accounting, inventory) in a document store, then rebuilding joins in application code.',
          'Treating CAP as "pick any two" for normal operation — the choice only applies during partitions.',
          'Assuming NoSQL means no transactions or SQL means it cannot scale.',
        ),
      ),
      section('interview', 'Interview angle',
        interviewTip('Answer "SQL or NoSQL?" with questions: access patterns, consistency needs, relationships, scale, team experience — then justify.'),
        interviewTip('State CAP precisely: the trade-off is forced only when a network partition happens.'),
      ),
      section('practice', 'Practice',
        steps(
          'For each, pick a database family and justify: shopping cart cache, bank ledger, product catalog with varied attributes, friend-of-friend suggestions, IoT sensor readings.',
          'Model a blog post with comments both relationally and as a document; list one query that is easier in each.',
        ),
      ),
      section('summary', 'Summary',
        bullets(
          'Families: document, key-value, wide-column, graph.',
          'SQL: schema + joins + ACID; NoSQL: flexible models, built-in horizontal scaling.',
          'CAP: under partition choose C or A; many systems are tunable.',
          'Choose by access pattern; polyglot persistence is normal.',
        ),
      ),
    ],
    revisionNotes: [
      'Document (MongoDB), KV (Redis/DynamoDB), wide-column (Cassandra), graph (Neo4j).',
      'CAP: Partition → Consistency or Availability.',
      'BASE vs ACID.',
      'MongoDB: single-doc atomic always; multi-doc transactions since 4.0 (replica set), 4.2 (sharded).',
      'Postgres jsonb blurs the line for flexible fields.',
    ],
    quiz: [
      {
        kind: 'mcq', difficulty: 'beginner',
        prompt: 'Which NoSQL family is the best fit for storing user sessions looked up by session id?',
        options: ['Graph', 'Key-value', 'Wide-column', 'Relational'],
        answer: 1,
        explanation: 'Sessions are fetched by an exact key and need fast reads/writes with TTL — the key-value sweet spot (e.g. Redis). Graph databases are for relationship traversal.',
      },
      {
        kind: 'mcq', difficulty: 'intermediate',
        prompt: 'According to the CAP theorem, when does a distributed database have to choose between consistency and availability?',
        options: ['Always, on every request', 'Only during a network partition', 'Only when using SQL', 'Only for writes larger than 16MB'],
        answer: 1,
        explanation: 'CAP describes behaviour under partition. Without a partition you can have both; the everyday trade-off is latency vs consistency (PACELC).',
      },
      {
        kind: 'scenario', difficulty: 'intermediate',
        prompt: 'You are building a double-entry accounting ledger with strict invariants across accounts. Which choice is most defensible?',
        options: ['A relational database with transactions and constraints', 'A key-value store with eventual consistency', 'A graph database', 'Plain JSON files in S3'],
        answer: 0,
        explanation: 'Ledgers need multi-row atomicity and enforced constraints. Eventual consistency could temporarily show unbalanced books.',
      },
    ],
    interview: [
      {
        category: 'express-backend', kind: 'concept', difficulty: 'beginner', topic: 'NoSQL',
        question: 'What are the main types of NoSQL databases, with an example use case for each?',
        shortAnswer: 'Document stores (MongoDB — product catalogs), key-value stores (Redis — sessions/cache), wide-column stores (Cassandra — high-volume time series) and graph databases (Neo4j — social or fraud graphs).',
        detailedAnswer: [
          'Document: nested JSON-like records, queryable by any field.',
          'Key-value: fastest by exact key, value is opaque.',
          'Wide-column: partitioned by key, optimised for writes and range scans within a partition.',
          'Graph: first-class edges make multi-hop traversals cheap.',
        ],
        followUp: 'Which would you use for a leaderboard?',
        trap: 'Listing only MongoDB and Redis without explaining the data models.',
      },
      {
        category: 'express-backend', kind: 'scenario', difficulty: 'intermediate', topic: 'NoSQL',
        question: 'A product manager asks you to use MongoDB "because it scales better than SQL". How do you evaluate that?',
        shortAnswer: 'Scale is rarely the deciding factor at first; evaluate data shape, relationships, consistency needs, query patterns and team skills — Postgres scales very far vertically and with replicas, and MongoDB fits best when data is aggregate-oriented and schema varies.',
        detailedAnswer: [
          'Estimate actual volume and throughput; most apps fit comfortably on one Postgres primary.',
          'Highly relational data with integrity rules favours SQL.',
          'Varied, nested, self-contained documents with built-in sharding needs favour MongoDB.',
          'Consider jsonb in Postgres for the flexible parts.',
          'Factor in operations, hosting, and existing expertise.',
        ],
        followUp: 'What signals would make you migrate a part of the system later?',
        trap: 'Accepting "SQL doesn\'t scale" as a fact.',
      },
    ],
  },

  // ─────────────────────────────────────────────────────────────
  'documents-and-collections': {
    summary: 'MongoDB stores BSON documents (typed binary JSON) in collections inside databases; every document has a unique _id, by default an ObjectId.',
    topics: ['document', 'collection', 'database', 'BSON', 'ObjectId', '_id', 'embedded documents', 'arrays', '16MB limit', 'schema validation', 'Extended JSON'],
    sections: [
      section('introduction', undefined,
        text('In MongoDB the unit of data is a **document** — a JSON-like object that can contain nested objects and arrays. Documents live in **collections**, which live in **databases**.'),
      ),
      section('definition', 'Terminology mapping',
        table('Relational → MongoDB', ['Relational', 'MongoDB'],
          [
            ['Database', 'Database'],
            ['Table', 'Collection'],
            ['Row', 'Document'],
            ['Column', 'Field'],
            ['Primary key', '`_id` field (always indexed, unique)'],
            ['JOIN', 'Embedding, or `$lookup` in aggregation'],
          ]),
        bullets(
          '**BSON** (Binary JSON) is the storage and wire format: adds types JSON lacks — `ObjectId`, `Date`, `Decimal128`, `Int32/Int64`, `Binary`.',
          'Maximum document size: **16 MB**.',
          'Collections are created implicitly on first insert; documents in one collection may have different fields.',
        ),
      ),
      section('why', 'Why documents',
        bullets(
          'An aggregate (an order with its line items) is read and written as one unit — no join.',
          'Field order and nesting match the objects in your JavaScript code.',
          'Adding a field does not require a migration — but old documents will not have it (handle defaults in code).',
        ),
      ),
      section('internals', 'ObjectId anatomy',
        table('ObjectId (12 bytes)', ['Bytes', 'Content'],
          [['4', 'Unix timestamp in seconds (creation time)'], ['5', 'Random value unique to the machine + process'], ['3', 'Incrementing counter']]),
        bullets(
          'Generated by the **driver** on the client, so inserts do not wait for the server to allocate ids.',
          'Roughly time-ordered: sorting by `_id` ≈ sorting by creation time.',
          '`id.getTimestamp()` returns the creation Date.',
          'You can use any unique value as `_id` (string, number, compound object) — it just must be unique and immutable.',
        ),
      ),
      section('visual', 'Hierarchy',
        flow(['Cluster / replica set', 'Database: shop', 'Collection: orders', 'Document: { _id, customer, items: [...] }'], { title: 'MongoDB storage hierarchy', direction: 'horizontal' }),
      ),
      section('example', 'A document with BSON types',
        code({
          title: 'Order document (mongosh)',
          language: 'javascript',
          code: dedent(`
            db.orders.insertOne({
              customer: { name: 'Ana', email: 'ana@example.com' },   // embedded document
              items: [                                                // array of subdocuments
                { sku: 'BK-1', qty: 2, price: NumberDecimal('19.99') },
                { sku: 'BK-7', qty: 1, price: NumberDecimal('35.00') },
              ],
              status: 'paid',
              createdAt: new Date('2026-11-08T10:00:00Z'),
            });
            db.orders.findOne({ 'customer.email': 'ana@example.com' }, { status: 1, 'items.sku': 1 });
          `),
          expectedOutput: dedent(`
            { acknowledged: true, insertedId: ObjectId('672de3a0f1c2b84d5e9a1b20') }
            {
              _id: ObjectId('672de3a0f1c2b84d5e9a1b20'),
              items: [ { sku: 'BK-1' }, { sku: 'BK-7' } ],
              status: 'paid'
            }
          `),
          explanation: [
            '`_id` was generated automatically because we did not provide one.',
            'Dot notation (`\'customer.email\'`) queries inside embedded documents.',
            'The projection `{ status: 1, \'items.sku\': 1 }` returns only those fields (plus `_id` unless excluded).',
            '`NumberDecimal` stores exact money values (Decimal128); plain JS numbers would be doubles.',
          ],
        }),
        code({
          title: 'Working with ObjectId in Node',
          code: dedent(`
            import { ObjectId } from 'mongodb';

            const id = new ObjectId('672de3a0f1c2b84d5e9a1b20');
            console.log(id.getTimestamp().toISOString());
            console.log(ObjectId.isValid('not-an-id'), ObjectId.isValid('672de3a0f1c2b84d5e9a1b20'));

            // Querying by id from a URL param: must convert the string!
            await orders.findOne({ _id: new ObjectId(req.params.id) });
          `),
          expectedOutput: '2024-11-08T10:10:40.000Z\nfalse true',
          explanation: [
            'The first 4 bytes `672de3a0` = 1731060640 seconds since epoch.',
            'Validate ids before constructing — `new ObjectId(\'bad\')` throws (BSONError).',
            'A string never equals an ObjectId in a query; `findOne({ _id: \'672d...\' })` returns null.',
          ],
        }),
        code({
          title: 'Optional schema validation on the collection',
          language: 'javascript',
          code: dedent(`
            db.createCollection('users', {
              validator: {
                $jsonSchema: {
                  bsonType: 'object',
                  required: ['email', 'createdAt'],
                  properties: {
                    email: { bsonType: 'string', pattern: '^.+@.+$' },
                    createdAt: { bsonType: 'date' },
                  },
                },
              },
            });
            db.users.insertOne({ email: 'nope' });
          `),
          expectedOutput: 'MongoServerError: Document failed validation',
          explanation: ['Server-side validation enforces rules even for writers that bypass your app or Mongoose.'],
        }),
      ),
      section('real-world', 'In a real backend',
        bullets(
          'Expose `_id` as a string `id` in API responses (`id: doc._id.toHexString()`).',
          'Validate ObjectId params in middleware and return 400 for invalid ones instead of 500.',
          'Store timestamps as BSON `Date`, money as `Decimal128` or integer cents.',
          'Avoid unbounded arrays (e.g. all comments ever) — they push documents toward the 16 MB limit and make updates expensive.',
        ),
      ),
      section('mistakes', 'Common mistakes',
        bullets(
          'Querying `_id` with a plain string.',
          'Storing dates as strings → range queries and sorting break.',
          'Embedding ever-growing arrays.',
          'Typos in field names silently create new fields (no schema to catch them unless you add validation).',
        ),
        code({
          title: 'Wrong vs right: id lookup',
          code: dedent(`
            // ❌ returns null — '672d…' (string) !== ObjectId('672d…')
            await users.findOne({ _id: req.params.id });

            // ✅
            if (!ObjectId.isValid(req.params.id)) return res.status(400).json({ error: 'Bad id' });
            await users.findOne({ _id: new ObjectId(req.params.id) });
          `),
          expectedOutput: 'null\n{ _id: ObjectId(\'672d…\'), email: \'ana@example.com\' }',
          explanation: ['BSON comparison is type-sensitive. (Mongoose casts strings to ObjectId for you; the native driver does not.)'],
        }),
      ),
      section('interview', 'Interview angle',
        interviewTip('Know the ObjectId structure (timestamp + random + counter) and that the driver creates it client-side.'),
        interviewTip('Mention the 16 MB document limit when discussing embedding.'),
      ),
      section('practice', 'Practice',
        steps(
          'Design a `products` document with variable attributes (size for shirts, pages for books).',
          'Write a query using dot notation on a nested field and a projection.',
          'Add a `$jsonSchema` validator requiring `name` and a numeric `price`.',
        ),
      ),
      section('summary', 'Summary',
        bullets(
          'Database → collection → document; documents are BSON.',
          '`_id` is required, unique, indexed; default ObjectId (12 bytes, time-ordered).',
          'Embedded docs and arrays model aggregates; 16 MB max.',
          'Flexible schema ≠ no schema; add validation.',
        ),
      ),
    ],
    revisionNotes: [
      'BSON adds ObjectId, Date, Decimal128, Int32/Int64, Binary.',
      'ObjectId = 4B timestamp + 5B random + 3B counter; generated by driver.',
      'Document max 16 MB.',
      '`_id` immutable, unique, auto-indexed.',
      'Native driver: string ≠ ObjectId; Mongoose casts.',
      'Collections created lazily on first insert.',
    ],
    quiz: [
      {
        kind: 'mcq', difficulty: 'beginner',
        prompt: 'What is the maximum size of a single MongoDB document?',
        options: ['1 MB', '16 MB', '64 MB', 'Unlimited'],
        answer: 1,
        explanation: 'BSON documents are limited to 16 MB; larger files go in GridFS or object storage.',
      },
      {
        kind: 'find-bug', difficulty: 'intermediate',
        prompt: 'Using the native mongodb driver, this always returns null even though the user exists. Why?',
        code: "app.get('/users/:id', async (req, res) => {\n  const user = await db.collection('users').findOne({ _id: req.params.id });\n  res.json(user);\n});",
        options: ['findOne needs a callback', 'req.params.id is a string but _id is stored as an ObjectId', 'Collections must be created first', '_id cannot be queried'],
        answer: 1,
        explanation: 'Convert with new ObjectId(req.params.id) after validating it. Mongoose would cast automatically; the native driver does not.',
      },
      {
        kind: 'mcq', difficulty: 'intermediate',
        prompt: 'Which statement about ObjectId is true?',
        options: ['It is generated by the server after the insert', 'Its first 4 bytes are a timestamp, so ids are roughly ordered by creation time', 'It is a UUID v4', 'It is guaranteed sequential across all clients'],
        answer: 1,
        explanation: 'The driver generates it client-side; the timestamp prefix gives rough time ordering, but it is not strictly sequential across processes.',
      },
    ],
    interview: [
      {
        category: 'express-backend', kind: 'concept', difficulty: 'intermediate', topic: 'MongoDB documents',
        question: 'What is BSON and why does MongoDB use it instead of plain JSON?',
        shortAnswer: 'BSON is a binary, typed serialisation of JSON-like documents; it adds types such as ObjectId, Date, Decimal128 and 32/64-bit integers, and length prefixes that make it fast to traverse and index.',
        detailedAnswer: [
          'JSON has only one number type and no date or binary type.',
          'Length-prefixed fields let the server skip over fields without parsing them.',
          'Drivers convert BSON ↔ native objects (Date ↔ BSON Date, ObjectId class).',
          'mongoexport uses Extended JSON (`{"$oid": "..."}`) to preserve types in text.',
        ],
        followUp: 'How should you store money in MongoDB?',
        trap: 'Saying BSON is "just compressed JSON" — it is often larger, but typed and traversable.',
      },
    ],
  },
};

export default content;
