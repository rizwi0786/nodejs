import type { ModuleContent } from '../../../types';
import { bullets, code, dedent, flow, interviewTip, note, section, steps, table, text, warn } from '../helpers';

const content: Partial<ModuleContent> = {
  // ─────────────────────────────────────────────────────────────
  'database-fundamentals': {
    summary: 'A database is durable, concurrent, structured storage; relational databases model data as tables of rows linked by keys and guarantee ACID transactions.',
    topics: ['database', 'DBMS', 'relational model', 'ACID', 'primary key', 'foreign key', 'natural vs surrogate key', 'schema'],
    sections: [
      section('introduction', undefined,
        text('A Node process forgets everything when it restarts, and two servers cannot share a JavaScript array. A **database** gives your app storage that survives crashes, can be queried efficiently, and stays correct while many requests write at once.'),
      ),
      section('definition', 'Definition',
        text('A **database management system (DBMS)** stores data durably and answers queries about it. A **relational** DBMS such as PostgreSQL organises data into **tables** (relations) of **rows** (tuples) with typed **columns** (attributes).'),
        bullets(
          '**Schema** — the declared shape: tables, column types, constraints.',
          '**Primary key (PK)** — column(s) that uniquely identify a row; never NULL.',
          '**Foreign key (FK)** — a column that must match a PK in another table, enforcing referential integrity.',
          '**Candidate / unique key** — any other column set that must be unique (e.g. `email`).',
          '**Surrogate key** — a meaningless generated id (`bigint` identity, UUID). **Natural key** — a real-world value (ISBN, email).',
        ),
      ),
      section('why', 'Why not just a JSON file?',
        table('File vs database', ['Concern', 'JSON file', 'PostgreSQL'],
          [
            ['Concurrent writers', 'Last write wins, data lost', 'Row locks + MVCC'],
            ['Crash mid-write', 'Corrupted/half file', 'Write-ahead log (WAL) replays or discards'],
            ['Find one record', 'Read + parse whole file', 'Index lookup, O(log n)'],
            ['Integrity rules', 'Your code, hopefully', 'Constraints enforced by the engine'],
            ['Multiple app servers', 'Not shareable safely', 'Network server, many clients'],
          ]),
      ),
      section('internals', 'ACID — the four guarantees of a transaction',
        table('ACID', ['Letter', 'Guarantee', 'How PostgreSQL achieves it'],
          [
            ['A — Atomicity', 'All statements in a transaction apply, or none do', 'Rollback discards the transaction\'s row versions'],
            ['C — Consistency', 'Constraints (PK, FK, CHECK, NOT NULL) hold before and after', 'Constraint checks; a violation aborts the transaction'],
            ['I — Isolation', 'Concurrent transactions do not see each other\'s partial work', 'MVCC snapshots + locks; configurable isolation level'],
            ['D — Durability', 'Once COMMIT returns, data survives a crash', 'WAL is flushed (fsync) to disk before COMMIT returns'],
          ]),
        note('"Consistency" in ACID means *your declared rules hold*. It is a different idea from the "C" in the CAP theorem (all replicas agree).'),
      ),
      section('visual', 'From request to disk',
        flow([
          'Node app: sends SQL over TCP',
          'Postgres backend process: parses, plans, executes',
          'Shared buffers: pages cached in memory',
          'WAL: change logged + fsync on COMMIT',
          'Data files: written later by checkpointer',
        ], { title: 'How a write becomes durable', direction: 'horizontal' }),
      ),
      section('example', 'Keys and constraints in a schema',
        code({
          title: 'A users table with PK, unique key and CHECK',
          language: 'sql',
          code: dedent(`
            CREATE TABLE users (
              id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,  -- surrogate key
              email      text NOT NULL UNIQUE,                              -- candidate key
              age        int  CHECK (age >= 13),
              created_at timestamptz NOT NULL DEFAULT now()
            );

            INSERT INTO users (email, age) VALUES ('ana@example.com', 30);
            INSERT INTO users (email, age) VALUES ('ana@example.com', 25);
          `),
          expectedOutput: dedent(`
            CREATE TABLE
            INSERT 0 1
            ERROR:  duplicate key value violates unique constraint "users_email_key"
            DETAIL:  Key (email)=(ana@example.com) already exists.
          `),
          explanation: [
            '`GENERATED ALWAYS AS IDENTITY` is the modern replacement for `serial`: Postgres generates the id.',
            '`UNIQUE` creates a unique index named `users_email_key` automatically.',
            'The second insert violates the unique constraint, so the *database* rejects it — even if two app servers race.',
            '`INSERT 0 1` means: OID 0 (legacy, always 0), 1 row inserted.',
          ],
        }),
      ),
      section('real-world', 'In a real backend',
        bullets(
          'Put invariants in the database (`UNIQUE(email)`, `CHECK (balance >= 0)`, FKs). App-level checks alone race under concurrency.',
          'Use surrogate keys for PKs; keep natural keys as `UNIQUE` columns so they can change without rewriting FKs.',
          'Use `timestamptz` (timestamp with time zone) for event times, `numeric` for money — never `float`.',
        ),
      ),
      section('mistakes', 'Common mistakes',
        bullets(
          'Checking "does this email exist?" in JS, then inserting — two concurrent signups both pass the check.',
          'Using `float`/`real` for currency: `0.1 + 0.2` rounding errors end up in invoices.',
          'Thinking ACID means "fast" or "distributed" — it is about correctness of one database\'s transactions.',
        ),
        code({
          title: 'Wrong vs right: uniqueness',
          language: 'javascript',
          code: dedent(`
            // ❌ Race: two requests can both see "no rows" and both insert
            const { rows } = await pool.query('SELECT 1 FROM users WHERE email = $1', [email]);
            if (rows.length === 0) await pool.query('INSERT INTO users (email) VALUES ($1)', [email]);

            // ✅ Let the UNIQUE constraint decide; map the error code
            try {
              await pool.query('INSERT INTO users (email) VALUES ($1)', [email]);
            } catch (err) {
              if (err.code === '23505') throw new ConflictError('Email already registered');
              throw err;
            }
          `),
          expectedOutput: '(second concurrent signup gets ConflictError instead of a duplicate row)',
          explanation: ['`23505` is the SQLSTATE code for `unique_violation`.', 'The constraint is checked atomically inside the engine, so no race window exists.'],
        }),
      ),
      section('interview', 'Interview angle',
        interviewTip('Be able to explain each ACID letter with a concrete failure it prevents (e.g. Atomicity: a transfer that debits but never credits).'),
        interviewTip('Know the difference between a primary key and a unique constraint: PK is NOT NULL + unique and there is only one per table.'),
      ),
      section('practice', 'Practice',
        steps(
          'Design a `products` table with a surrogate PK, a unique `sku`, a `price numeric(10,2)` that cannot be negative.',
          'Try inserting a negative price and read the error message.',
          'Explain which ACID property the CHECK constraint supports.',
        ),
      ),
      section('summary', 'Summary',
        bullets(
          'Relational model: tables, rows, typed columns, linked by keys.',
          'PK uniquely identifies a row; FK enforces references; UNIQUE guards candidate keys.',
          'ACID = Atomicity, Consistency, Isolation, Durability; WAL provides durability in Postgres.',
          'Enforce invariants with constraints, not only in application code.',
        ),
      ),
    ],
    revisionNotes: [
      'ACID: all-or-nothing, constraints hold, concurrent txns isolated, committed = survives crash.',
      'Postgres durability = WAL fsync before COMMIT returns.',
      'PK = UNIQUE + NOT NULL, one per table. UNIQUE allows multiple NULLs by default.',
      'Prefer `bigint GENERATED ALWAYS AS IDENTITY` over `serial`.',
      'SQLSTATE 23505 = unique_violation, 23503 = foreign_key_violation.',
      'Money: `numeric`, times: `timestamptz`.',
    ],
    quiz: [
      {
        kind: 'mcq', difficulty: 'beginner',
        prompt: 'Which ACID property guarantees that a committed transaction survives a power loss?',
        options: ['Atomicity', 'Consistency', 'Isolation', 'Durability'],
        answer: 3,
        explanation: 'Durability: Postgres flushes the WAL to disk before COMMIT returns. Atomicity is about all-or-nothing, not surviving crashes after commit.',
      },
      {
        kind: 'scenario', difficulty: 'intermediate',
        prompt: 'Two signup requests with the same email arrive within 1 ms on two different servers. Your code SELECTs to check for the email, then INSERTs. What is the robust fix?',
        options: ['Add a 100 ms sleep between the SELECT and INSERT', 'Add a UNIQUE constraint on email and handle error 23505', 'Cache existing emails in a JS Set', 'Run the SELECT twice'],
        answer: 1,
        explanation: 'Only the database sees both writes atomically; a UNIQUE constraint rejects the second. A JS Set is per-process and does not help across two servers.',
      },
      {
        kind: 'mcq', difficulty: 'beginner',
        prompt: 'What is a surrogate key?',
        options: ['A key made of two columns', 'A generated, meaningless identifier such as an identity bigint or UUID', 'A foreign key pointing to the same table', 'A backup copy of the primary key'],
        answer: 1,
        explanation: 'Surrogate keys carry no business meaning, so they never need to change. A composite key (two columns) can be either natural or surrogate.',
      },
    ],
    interview: [
      {
        category: 'express-backend', kind: 'concept', difficulty: 'beginner', topic: 'Database fundamentals',
        question: 'What does ACID stand for, and what does each property protect against?',
        shortAnswer: 'Atomicity (no partial transactions), Consistency (constraints always hold), Isolation (concurrent transactions do not see each other\'s in-progress work), Durability (committed data survives crashes).',
        detailedAnswer: [
          'Atomicity: a money transfer cannot debit one account without crediting the other — ROLLBACK undoes everything.',
          'Consistency: PK, FK, UNIQUE, CHECK and NOT NULL rules are true at every commit.',
          'Isolation: controlled by isolation levels; Postgres uses MVCC so readers do not block writers.',
          'Durability: Postgres writes the change to the WAL and fsyncs before acknowledging COMMIT.',
        ],
        followUp: 'How does isolation level affect which anomalies you can see?',
        trap: 'Confusing ACID consistency with CAP consistency (replica agreement).',
      },
      {
        category: 'express-backend', kind: 'concept', difficulty: 'intermediate', topic: 'Database fundamentals',
        question: 'Natural key or surrogate key for a primary key — which do you choose and why?',
        shortAnswer: 'Usually a surrogate key (identity bigint or UUID) as the PK, with the natural key kept as a UNIQUE column, because natural values can change and are often wide.',
        detailedAnswer: [
          'Natural keys (email, SKU) change in the real world; changing a PK means rewriting every FK that references it.',
          'Surrogate integers are small and fast to index and join.',
          'UUIDs (v4 random) avoid exposing counts and can be generated client-side, but random inserts fragment B-tree indexes; UUIDv7 (time-ordered) mitigates this.',
          'Keep the natural key as UNIQUE so the business rule is still enforced.',
        ],
        followUp: 'What are the trade-offs between bigint identity and UUID primary keys?',
        trap: 'Saying email is a good PK because it is unique — uniqueness is not the only requirement; stability matters.',
      },
    ],
  },

  // ─────────────────────────────────────────────────────────────
  'tables-and-relationships': {
    summary: 'Relationships between tables are expressed with foreign keys: 1:1 (unique FK), 1:N (FK on the "many" side) and N:M (junction table with two FKs).',
    topics: ['one-to-one', 'one-to-many', 'many-to-many', 'junction table', 'foreign key', 'ON DELETE CASCADE', 'ON DELETE SET NULL', 'RESTRICT', 'referential integrity'],
    sections: [
      section('introduction', undefined,
        text('Real data is connected: users write posts, posts have tags, a user has one profile. Instead of duplicating data, relational databases store each fact once and **link** rows with foreign keys.'),
      ),
      section('definition', 'The three relationship shapes',
        table('Relationship types', ['Type', 'Example', 'How to model'],
          [
            ['1:1', 'user ↔ profile', 'FK on one side with a `UNIQUE` constraint (often the FK is also the PK)'],
            ['1:N', 'user → many posts', 'FK column on the "many" table: `posts.user_id`'],
            ['N:M', 'posts ↔ tags', 'Junction table `post_tags(post_id, tag_id)` with composite PK'],
          ]),
      ),
      section('why', 'Why foreign keys matter',
        bullets(
          'They prevent **orphans**: a post pointing to a user that does not exist.',
          'They document the model — tools and teammates can read relationships from the schema.',
          '`ON DELETE` rules decide automatically what happens to children when a parent is deleted.',
        ),
      ),
      section('internals', 'ON DELETE / ON UPDATE actions',
        table('Referential actions', ['Action', 'When the parent row is deleted', 'Typical use'],
          [
            ['NO ACTION (default)', 'Error if children exist (checked at end of statement; deferrable)', 'Safe default'],
            ['RESTRICT', 'Error immediately if children exist (not deferrable)', 'Must never orphan'],
            ['CASCADE', 'Children are deleted too', 'Owned data: order → order_items'],
            ['SET NULL', 'Child FK set to NULL (column must be nullable)', 'Optional link: post.editor_id'],
            ['SET DEFAULT', 'Child FK set to its default', 'Rare'],
          ]),
        warn('Postgres does **not** automatically index foreign key columns (only the referenced PK is indexed). Add an index on `posts.user_id` or deletes and joins will scan.'),
      ),
      section('visual', 'Schema diagram',
        flow([
          'users: id PK',
          'profiles: user_id PK+FK → users (1:1)',
          'posts: user_id FK → users (1:N)',
          'post_tags: (post_id, tag_id) PK',
          'tags: id PK (N:M via post_tags)',
        ], { title: 'Blog schema', direction: 'vertical' }),
      ),
      section('example', 'Building the schema',
        code({
          title: '1:1, 1:N and N:M with referential actions',
          language: 'sql',
          code: dedent(`
            CREATE TABLE users (
              id    bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
              email text NOT NULL UNIQUE
            );

            -- 1:1  (PK is also the FK, so at most one profile per user)
            CREATE TABLE profiles (
              user_id bigint PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
              bio     text
            );

            -- 1:N
            CREATE TABLE posts (
              id      bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
              user_id bigint NOT NULL REFERENCES users(id) ON DELETE CASCADE,
              title   text NOT NULL
            );
            CREATE INDEX posts_user_id_idx ON posts(user_id);

            -- N:M
            CREATE TABLE tags (id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, name text UNIQUE NOT NULL);
            CREATE TABLE post_tags (
              post_id bigint REFERENCES posts(id) ON DELETE CASCADE,
              tag_id  bigint REFERENCES tags(id)  ON DELETE RESTRICT,
              PRIMARY KEY (post_id, tag_id)
            );

            INSERT INTO posts (user_id, title) VALUES (999, 'Orphan?');
          `),
          expectedOutput: dedent(`
            ERROR:  insert or update on table "posts" violates foreign key constraint "posts_user_id_fkey"
            DETAIL:  Key (user_id)=(999) is not present in table "users".
          `),
          explanation: [
            'The composite PK on `post_tags` prevents tagging the same post twice with the same tag.',
            'Deleting a post cascades to its `post_tags` rows; deleting a tag still in use is refused (`RESTRICT`).',
            'Inserting a post for a non-existent user fails with SQLSTATE 23503 (foreign_key_violation).',
          ],
        }),
        code({
          title: 'CASCADE in action',
          language: 'sql',
          code: dedent(`
            DELETE FROM users WHERE id = 1;   -- user 1 had a profile and 3 posts
            SELECT count(*) FROM posts WHERE user_id = 1;
          `),
          expectedOutput: dedent(`
            DELETE 1
             count
            -------
                 0
            (1 row)
          `),
          explanation: ['`DELETE 1` reports only the user row, but the profile and posts were removed by cascade.'],
        }),
      ),
      section('real-world', 'In a real backend',
        bullets(
          'E-commerce: `orders` 1:N `order_items` (CASCADE), `order_items` N:1 `products` (RESTRICT — never delete a sold product; soft-delete it).',
          'Junction tables often carry data of their own: `enrollments(student_id, course_id, enrolled_at, grade)`.',
          'For GDPR deletions, CASCADE makes "delete my account" one statement — but review what it removes.',
        ),
      ),
      section('mistakes', 'Common mistakes',
        bullets(
          'Storing N:M as an array/CSV column (`tag_ids text`) — no FK integrity, hard to query and index.',
          'Forgetting the index on the FK column.',
          'Blanket `ON DELETE CASCADE` everywhere — one delete can wipe financial history.',
        ),
        code({
          title: 'Wrong vs right: many-to-many',
          language: 'sql',
          code: dedent(`
            -- ❌ No integrity, cannot JOIN or index properly
            CREATE TABLE posts_bad (id bigint PRIMARY KEY, tag_ids text);  -- '1,4,9'

            -- ✅ Junction table
            CREATE TABLE post_tags (
              post_id bigint REFERENCES posts(id) ON DELETE CASCADE,
              tag_id  bigint REFERENCES tags(id),
              PRIMARY KEY (post_id, tag_id)
            );
          `),
          expectedOutput: 'CREATE TABLE\nCREATE TABLE',
          explanation: ['The junction table makes each link a row the database can validate, index and join.'],
        }),
      ),
      section('interview', 'Interview angle',
        interviewTip('When asked to design a schema, say where every FK lives and which ON DELETE rule you chose and why.'),
        interviewTip('Mention that Postgres does not auto-index FK columns — it shows practical experience.'),
      ),
      section('practice', 'Practice',
        steps(
          'Model students, courses and enrollments (with a grade) for a school.',
          'Choose ON DELETE rules: what should happen to enrollments when a student is deleted? When a course is deleted?',
          'Add the indexes you need for "list courses for a student" and "list students for a course".',
        ),
      ),
      section('summary', 'Summary',
        bullets(
          '1:1 → unique FK; 1:N → FK on the many side; N:M → junction table with composite PK.',
          'FKs prevent orphans; ON DELETE chooses CASCADE / SET NULL / RESTRICT / NO ACTION.',
          'Index FK columns yourself.',
        ),
      ),
    ],
    revisionNotes: [
      '1:N FK goes on the "many" side.',
      'N:M = junction table, composite PK (a_id, b_id), plus index on (b_id) for reverse lookups.',
      'Default referential action is NO ACTION (error).',
      'CASCADE for owned children; SET NULL for optional links; RESTRICT to protect history.',
      'Postgres indexes the referenced PK but not the referencing FK column.',
    ],
    quiz: [
      {
        kind: 'mcq', difficulty: 'beginner',
        prompt: 'Where does the foreign key go in a one-to-many relationship between authors and books?',
        options: ['authors.book_id', 'books.author_id', 'A junction table is always required', 'Both tables'],
        answer: 1,
        explanation: 'The "many" side (books) references the "one" side (authors). Putting book_id on authors would allow only one book per author.',
      },
      {
        kind: 'scenario', difficulty: 'intermediate',
        prompt: 'Deleting a product must never silently remove historical order_items that reference it. Which ON DELETE action fits order_items.product_id?',
        options: ['CASCADE', 'SET NULL', 'RESTRICT', 'No FK at all'],
        answer: 2,
        explanation: 'RESTRICT refuses the delete while order items exist; you would soft-delete products instead. CASCADE would erase sales history.',
      },
      {
        kind: 'find-bug', difficulty: 'intermediate',
        prompt: 'Deleting a user takes seconds on a big table. What is the likely bug?',
        code: 'CREATE TABLE comments (\n  id bigint PRIMARY KEY,\n  user_id bigint REFERENCES users(id) ON DELETE CASCADE,\n  body text\n);',
        options: ['CASCADE is not supported in Postgres', 'comments.user_id has no index, so each delete scans comments', 'bigint is too large', 'The PK should be on user_id'],
        answer: 1,
        explanation: 'To find child rows to cascade, Postgres searches comments by user_id; without an index that is a sequential scan.',
      },
    ],
    interview: [
      {
        category: 'express-backend', kind: 'concept', difficulty: 'beginner', topic: 'Relationships',
        question: 'How do you model a many-to-many relationship in a relational database?',
        shortAnswer: 'With a junction (join) table holding two foreign keys, one to each side, usually with a composite primary key on the pair.',
        detailedAnswer: [
          'Example: `post_tags(post_id FK, tag_id FK, PRIMARY KEY(post_id, tag_id))`.',
          'The composite PK prevents duplicate links and indexes lookups by post_id.',
          'Add a separate index on tag_id for "posts with this tag" queries.',
          'The junction table can carry extra attributes (created_at, role, grade).',
        ],
        followUp: 'When would the junction table need its own surrogate id?',
        trap: 'Storing an array of ids in one column — loses FK integrity.',
      },
      {
        category: 'express-backend', kind: 'scenario', difficulty: 'intermediate', topic: 'Relationships',
        question: 'A teammate set ON DELETE CASCADE on every foreign key. What risks do you raise in review?',
        shortAnswer: 'A single delete can silently remove large amounts of related or historical data; CASCADE should be used only for truly owned children.',
        detailedAnswer: [
          'Deleting a customer could cascade to orders, invoices and payments — a compliance and audit problem.',
          'Large cascades take many row locks and can be slow, blocking other transactions.',
          'Prefer RESTRICT for references to shared/historical data and soft deletes (`deleted_at`).',
          'Use CASCADE for composition: order → order_items, post → post_tags.',
        ],
        followUp: 'How would you implement soft delete and keep unique constraints working?',
        trap: 'Assuming CASCADE is just "cleanup" with no downside.',
      },
    ],
  },

  // ─────────────────────────────────────────────────────────────
  'sql-queries': {
    summary: 'SQL reads data with SELECT (filter, sort, paginate, aggregate) and changes it with INSERT/UPDATE/DELETE; Postgres adds RETURNING and ON CONFLICT upserts.',
    topics: ['SELECT', 'WHERE', 'ORDER BY', 'LIMIT', 'OFFSET', 'GROUP BY', 'HAVING', 'INSERT RETURNING', 'UPDATE', 'DELETE', 'upsert', 'ON CONFLICT', 'logical query order'],
    sections: [
      section('introduction', undefined,
        text('SQL is a **declarative** language: you describe the rows you want, and the planner decides how to fetch them. A handful of clauses cover almost every API endpoint you will build.'),
      ),
      section('definition', 'Statement families',
        table('Core SQL', ['Family', 'Statements', 'Purpose'],
          [
            ['DQL', 'SELECT', 'Read'],
            ['DML', 'INSERT, UPDATE, DELETE, MERGE', 'Change rows'],
            ['DDL', 'CREATE, ALTER, DROP', 'Change schema'],
            ['TCL', 'BEGIN, COMMIT, ROLLBACK', 'Transactions'],
          ]),
      ),
      section('why', 'Why learn raw SQL if you use an ORM?',
        bullets(
          'ORMs generate SQL — debugging slow endpoints means reading that SQL and `EXPLAIN` output.',
          'Aggregations, upserts and reports are often clearer and faster in SQL.',
          'Interviews routinely ask you to write GROUP BY / HAVING / JOIN queries by hand.',
        ),
      ),
      section('internals', 'Logical order of a SELECT',
        text('Clauses are *written* in one order but *evaluated* in another. This explains why you cannot use a SELECT alias in WHERE, but can in ORDER BY.'),
        flow(['FROM / JOIN', 'WHERE: filters rows', 'GROUP BY', 'HAVING: filters groups', 'SELECT: computes columns + aliases', 'ORDER BY', 'LIMIT / OFFSET'],
          { title: 'Logical evaluation order', direction: 'horizontal' }),
        table('WHERE vs HAVING', ['', 'WHERE', 'HAVING'],
          [['Filters', 'Individual rows', 'Groups'], ['Runs', 'Before GROUP BY', 'After GROUP BY'], ['Aggregates allowed?', 'No', 'Yes (`HAVING count(*) > 5`)']]),
      ),
      section('example', 'Reading data',
        code({
          title: 'Filter, sort, paginate',
          language: 'sql',
          code: dedent(`
            SELECT id, name, price
            FROM products
            WHERE category = 'books' AND price < 30
            ORDER BY price DESC, id
            LIMIT 3;
          `),
          expectedOutput: dedent(`
             id |      name       | price
            ----+-----------------+-------
             12 | Node Patterns   | 29.00
              7 | SQL Basics      | 24.50
             31 | Clean Code JS   | 24.50
            (3 rows)
          `),
          explanation: [
            '`WHERE` filters rows before sorting.',
            '`ORDER BY price DESC, id` — the `id` tie-breaker makes pagination deterministic (7 before 31 at equal price).',
            'Without ORDER BY, row order is undefined; `LIMIT` alone returns arbitrary rows.',
          ],
        }),
        code({
          title: 'Aggregate with GROUP BY and HAVING',
          language: 'sql',
          code: dedent(`
            SELECT customer_id, count(*) AS orders, sum(total) AS revenue
            FROM orders
            WHERE status = 'paid'
            GROUP BY customer_id
            HAVING count(*) >= 2
            ORDER BY revenue DESC;
          `),
          expectedOutput: dedent(`
             customer_id | orders | revenue
            -------------+--------+---------
                       3 |      4 |  410.00
                       1 |      2 |  150.00
            (2 rows)
          `),
          explanation: [
            'WHERE keeps only paid orders, GROUP BY makes one row per customer, HAVING drops customers with fewer than 2 orders.',
            '`ORDER BY revenue` can use the alias because ORDER BY runs after SELECT.',
            'Every selected non-aggregate column must appear in GROUP BY (or be functionally dependent on the grouped PK).',
          ],
        }),
      ),
      section('walkthrough', 'Writing data',
        code({
          title: 'INSERT ... RETURNING, UPDATE, DELETE',
          language: 'sql',
          code: dedent(`
            INSERT INTO products (name, price, category)
            VALUES ('Streams Deep Dive', 35.00, 'books')
            RETURNING id, created_at;

            UPDATE products SET price = price * 0.9 WHERE category = 'books' RETURNING id, price;

            DELETE FROM products WHERE id = 40;
          `),
          expectedOutput: dedent(`
             id |          created_at
            ----+-------------------------------
             40 | 2026-11-08 10:15:02.31+00
            (1 row)

            INSERT 0 1
             id | price
            ----+-------
             12 | 26.10
              7 | 22.05
             31 | 22.05
             40 | 31.50
            (4 rows)

            UPDATE 4
            DELETE 1
          `),
          explanation: [
            '`RETURNING` gives back generated values (id, defaults) in the same round trip — no second SELECT.',
            'UPDATE without WHERE changes **every** row; always double-check the WHERE clause.',
            'The command tag (`UPDATE 4`, `DELETE 1`) is the affected row count — node-postgres exposes it as `result.rowCount`.',
          ],
        }),
        code({
          title: 'Upsert with ON CONFLICT',
          language: 'sql',
          code: dedent(`
            -- product_views(product_id PK, views int)
            INSERT INTO product_views (product_id, views)
            VALUES (12, 1)
            ON CONFLICT (product_id)
            DO UPDATE SET views = product_views.views + EXCLUDED.views
            RETURNING product_id, views;
          `),
          expectedOutput: dedent(`
             product_id | views
            ------------+-------
                     12 |    58
            (1 row)

            INSERT 0 1
          `),
          explanation: [
            '`ON CONFLICT (product_id)` needs a unique index or constraint on that column.',
            '`EXCLUDED` is the row you tried to insert; `product_views.views` is the existing row.',
            'The whole upsert is atomic — no race between "check exists" and "insert".',
            '`ON CONFLICT DO NOTHING` skips the row instead (returns 0 rows from RETURNING).',
          ],
        }),
      ),
      section('real-world', 'In a real backend',
        bullets(
          'List endpoints: `WHERE` from query filters, `ORDER BY` a whitelisted column, `LIMIT` capped (e.g. max 100).',
          'Large tables: prefer **keyset pagination** `WHERE (created_at, id) < ($1, $2) ORDER BY created_at DESC, id DESC LIMIT 20` over big OFFSETs, which still read and discard skipped rows.',
          'Counters, "last seen", idempotency keys → `INSERT ... ON CONFLICT`.',
        ),
      ),
      section('mistakes', 'Common mistakes',
        bullets(
          '`WHERE col = NULL` is never true — use `IS NULL`.',
          'Using an aggregate in WHERE (`WHERE count(*) > 2`) — use HAVING.',
          'Paginating with `LIMIT/OFFSET` without a unique ORDER BY → duplicates/missing rows across pages.',
          '`SELECT *` in APIs — leaks columns (password_hash) and breaks when columns are added.',
        ),
        code({
          title: 'Wrong vs right: NULL comparison',
          language: 'sql',
          code: dedent(`
            SELECT count(*) FROM users WHERE deleted_at = NULL;   -- ❌ always 0
            SELECT count(*) FROM users WHERE deleted_at IS NULL;  -- ✅
          `),
          expectedOutput: dedent(`
             count
            -------
                 0
            (1 row)

             count
            -------
               842
            (1 row)
          `),
          explanation: ['Any comparison with NULL yields NULL (unknown), which WHERE treats as false.'],
        }),
      ),
      section('interview', 'Interview angle',
        interviewTip('Expect "write a query for the top N customers by revenue having at least K orders" — practise GROUP BY + HAVING + ORDER BY + LIMIT.'),
        interviewTip('Explain the logical evaluation order to justify why aliases work in ORDER BY but not WHERE.'),
      ),
      section('practice', 'Practice',
        steps(
          'Write a query returning categories with an average price above 20, sorted by average descending.',
          'Write an upsert that records a user\'s last login time (`user_logins(user_id PK, last_login_at)`).',
          'Rewrite an OFFSET-based page 500 query as keyset pagination.',
        ),
      ),
      section('summary', 'Summary',
        bullets(
          'Logical order: FROM → WHERE → GROUP BY → HAVING → SELECT → ORDER BY → LIMIT.',
          'WHERE filters rows; HAVING filters groups.',
          '`RETURNING` returns generated values from writes.',
          '`ON CONFLICT ... DO UPDATE` is an atomic upsert (requires a unique index).',
          'NULL needs `IS NULL`; pagination needs a deterministic ORDER BY.',
        ),
      ),
    ],
    revisionNotes: [
      'FROM → WHERE → GROUP BY → HAVING → SELECT → ORDER BY → LIMIT.',
      'HAVING can use aggregates; WHERE cannot.',
      '`EXCLUDED.col` = the proposed row in ON CONFLICT DO UPDATE.',
      'ON CONFLICT target needs a unique constraint/index.',
      'OFFSET n still scans n rows — use keyset pagination for deep pages.',
      '`= NULL` is never true; use IS NULL / IS DISTINCT FROM.',
    ],
    quiz: [
      {
        kind: 'mcq', difficulty: 'beginner',
        prompt: 'Which clause filters groups after aggregation?',
        options: ['WHERE', 'HAVING', 'ORDER BY', 'LIMIT'],
        answer: 1,
        explanation: 'HAVING runs after GROUP BY and can reference aggregates. WHERE runs before grouping on individual rows.',
      },
      {
        kind: 'complete-code', difficulty: 'intermediate',
        prompt: 'Complete the upsert so the existing counter is incremented by the inserted value.',
        code: "INSERT INTO counters (key, n) VALUES ('hits', 1)\nON CONFLICT (key)\nDO UPDATE SET n = counters.n + /* ??? */;",
        options: ['NEW.n', 'EXCLUDED.n', 'INSERTED.n', 'VALUES(n)'],
        answer: 1,
        explanation: 'Postgres exposes the proposed row as EXCLUDED. NEW is for triggers; VALUES(n) is MySQL syntax.',
      },
      {
        kind: 'predict-output', difficulty: 'intermediate',
        prompt: 'Table t has 3 rows with col values 1, NULL, 3. What does this return?',
        code: 'SELECT count(*), count(col) FROM t;',
        options: ['3 | 3', '3 | 2', '2 | 2', 'Error'],
        answer: 1,
        explanation: 'count(*) counts rows (3); count(col) skips NULLs (2).',
      },
      {
        kind: 'find-bug', difficulty: 'intermediate',
        prompt: 'Users report seeing the same item on page 2 and page 3. Why?',
        code: 'SELECT * FROM items ORDER BY created_at DESC LIMIT 20 OFFSET $1;',
        options: ['OFFSET must be a literal', 'created_at is not unique, so ties have no stable order across queries', 'DESC is not allowed with OFFSET', 'LIMIT must come after OFFSET'],
        answer: 1,
        explanation: 'Rows with equal created_at can be returned in any order on each query. Add a unique tie-breaker: ORDER BY created_at DESC, id DESC.',
      },
    ],
    interview: [
      {
        category: 'express-backend', kind: 'concept', difficulty: 'beginner', topic: 'SQL queries',
        question: 'What is the difference between WHERE and HAVING?',
        shortAnswer: 'WHERE filters individual rows before grouping; HAVING filters groups after GROUP BY and can use aggregate functions.',
        detailedAnswer: [
          'Logical order: FROM → WHERE → GROUP BY → HAVING → SELECT.',
          '`WHERE status = \'paid\'` reduces rows cheaply, ideally using an index.',
          '`HAVING count(*) > 5` needs the groups to exist first.',
          'Put non-aggregate conditions in WHERE for performance.',
        ],
        followUp: 'Why can you use a SELECT alias in ORDER BY but not in WHERE?',
        trap: 'Putting row-level filters in HAVING — it works but filters later and slower.',
      },
      {
        category: 'express-backend', kind: 'concept', difficulty: 'intermediate', topic: 'SQL queries',
        question: 'How does INSERT ... ON CONFLICT work in PostgreSQL and why is it better than SELECT-then-INSERT?',
        shortAnswer: 'It attempts the insert and, if a unique constraint conflicts, either does nothing or updates the existing row — atomically, so there is no race window.',
        detailedAnswer: [
          'Requires a conflict target backed by a unique index/constraint: `ON CONFLICT (email)`.',
          '`DO UPDATE SET col = EXCLUDED.col` — EXCLUDED is the proposed row.',
          '`DO NOTHING` ignores duplicates (useful for idempotent event ingestion).',
          'SELECT-then-INSERT lets two concurrent requests both see "missing" and both insert (or one fails).',
          'A WHERE on DO UPDATE can make the update conditional.',
        ],
        followUp: 'How would you know whether the upsert inserted or updated? (hint: `RETURNING (xmax = 0) AS inserted`)',
        trap: 'Forgetting the unique index — Postgres errors: "there is no unique or exclusion constraint matching the ON CONFLICT specification".',
      },
      {
        category: 'express-backend', kind: 'scenario', difficulty: 'advanced', topic: 'SQL queries',
        question: 'A feed endpoint using LIMIT 20 OFFSET 100000 is slow. How do you fix it?',
        shortAnswer: 'Switch to keyset (cursor) pagination: remember the last row\'s sort key and query `WHERE (created_at, id) < ($1, $2) ORDER BY created_at DESC, id DESC LIMIT 20`, backed by an index on (created_at, id).',
        detailedAnswer: [
          'OFFSET still produces and throws away 100000 rows on every request.',
          'Keyset pagination seeks directly into the index — constant cost per page.',
          'It is also stable when new rows are inserted (no shifting pages).',
          'Trade-off: no "jump to page 500"; the API returns an opaque cursor instead.',
          'Row-value comparison `(a, b) < (x, y)` can use a composite index.',
        ],
        followUp: 'How would you encode the cursor in the API response?',
        trap: 'Adding an index on created_at alone without fixing OFFSET — the skipped rows are still read.',
      },
    ],
  },

  // ─────────────────────────────────────────────────────────────
  joins: {
    summary: 'Joins combine rows from tables by a condition: INNER keeps matches, LEFT/RIGHT keep all rows from one side, FULL keeps both, CROSS makes every pair, a self join relates a table to itself.',
    topics: ['INNER JOIN', 'LEFT JOIN', 'RIGHT JOIN', 'FULL OUTER JOIN', 'CROSS JOIN', 'self join', 'anti-join', 'join conditions', 'NULL padding'],
    sections: [
      section('introduction', undefined,
        text('Normalised data lives in separate tables. A **join** stitches them back together for one response: "orders with customer names", "users and their post counts".'),
      ),
      section('definition', 'Join types',
        table('Join types', ['Join', 'Keeps', 'Non-matching rows'],
          [
            ['INNER JOIN', 'Only rows that match on both sides', 'Dropped'],
            ['LEFT [OUTER] JOIN', 'All left rows', 'Right columns = NULL'],
            ['RIGHT [OUTER] JOIN', 'All right rows', 'Left columns = NULL'],
            ['FULL [OUTER] JOIN', 'All rows from both', 'NULL on the missing side'],
            ['CROSS JOIN', 'Every combination (Cartesian product)', 'No condition'],
            ['Self join', 'A table joined to itself via aliases', 'Depends on join type used'],
          ]),
      ),
      section('why', 'Why joins matter',
        bullets(
          'One query with a join replaces N+1 queries from your Node code.',
          'Choosing LEFT vs INNER changes results: INNER silently drops users with no orders.',
          'Anti-joins (`LEFT JOIN ... WHERE right.id IS NULL`) answer "who has never ordered?".',
        ),
      ),
      section('internals', 'How Postgres executes a join',
        table('Join algorithms (chosen by the planner)', ['Algorithm', 'Good when', 'Notes'],
          [
            ['Nested loop', 'Small outer side + index on inner join column', 'Cost ≈ outer rows × index lookup'],
            ['Hash join', 'Large unsorted inputs, equality conditions', 'Builds a hash table of the smaller side in memory (work_mem)'],
            ['Merge join', 'Both inputs sorted on the join key', 'Walks both in order'],
          ]),
        note('You write *what* to join; `EXPLAIN` shows *which* algorithm the planner picked.'),
      ),
      section('visual', 'Sample data used below',
        table('customers', ['id', 'name'], [['1', 'Ana'], ['2', 'Ben'], ['3', 'Chen']]),
        table('orders', ['id', 'customer_id', 'total'], [['10', '1', '50.00'], ['11', '1', '20.00'], ['12', '3', '99.00'], ['13', 'NULL', '15.00']]),
        flow(['INNER: Ana, Ana, Chen', 'LEFT: + Ben (NULL order)', 'RIGHT: + order 13 (NULL customer)', 'FULL: + Ben + order 13'], { title: 'What each join adds', direction: 'horizontal' }),
      ),
      section('example', 'Joins with result tables',
        code({
          title: 'INNER JOIN',
          language: 'sql',
          code: dedent(`
            SELECT c.name, o.id AS order_id, o.total
            FROM customers c
            INNER JOIN orders o ON o.customer_id = c.id
            ORDER BY o.id;
          `),
          expectedOutput: dedent(`
             name | order_id | total
            ------+----------+-------
             Ana  |       10 | 50.00
             Ana  |       11 | 20.00
             Chen |       12 | 99.00
            (3 rows)
          `),
          explanation: ['Ben has no orders and order 13 has no customer — both disappear.'],
        }),
        code({
          title: 'LEFT JOIN + aggregate (keep customers with zero orders)',
          language: 'sql',
          code: dedent(`
            SELECT c.name, count(o.id) AS orders, coalesce(sum(o.total), 0) AS spent
            FROM customers c
            LEFT JOIN orders o ON o.customer_id = c.id
            GROUP BY c.id, c.name
            ORDER BY c.id;
          `),
          expectedOutput: dedent(`
             name | orders | spent
            ------+--------+-------
             Ana  |      2 | 70.00
             Ben  |      0 |     0
             Chen |      1 | 99.00
            (3 rows)
          `),
          explanation: [
            'Ben is kept with NULL order columns; `count(o.id)` ignores NULLs → 0.',
            '`count(*)` would wrongly report 1 for Ben (it counts the padded row).',
            '`coalesce` turns the NULL sum into 0.',
          ],
        }),
        code({
          title: 'RIGHT and FULL OUTER JOIN',
          language: 'sql',
          code: dedent(`
            SELECT c.name, o.id AS order_id
            FROM customers c
            FULL OUTER JOIN orders o ON o.customer_id = c.id
            ORDER BY o.id NULLS LAST;
          `),
          expectedOutput: dedent(`
             name | order_id
            ------+----------
             Ana  |       10
             Ana  |       11
             Chen |       12
                  |       13
             Ben  |
            (5 rows)
          `),
          explanation: [
            'FULL keeps unmatched rows from both sides: order 13 (no customer) and Ben (no order).',
            'A RIGHT JOIN here would return the first four rows only (all orders). Most teams rewrite RIGHT JOINs as LEFT JOINs with tables swapped for readability.',
          ],
        }),
        code({
          title: 'Anti-join, CROSS JOIN and self join',
          language: 'sql',
          code: dedent(`
            -- Customers who never ordered
            SELECT c.name FROM customers c
            LEFT JOIN orders o ON o.customer_id = c.id
            WHERE o.id IS NULL;

            -- Every size × colour combination
            SELECT s.size, k.colour FROM sizes s CROSS JOIN colours k;

            -- employees(id, name, manager_id) → each employee with their manager
            SELECT e.name AS employee, m.name AS manager
            FROM employees e
            LEFT JOIN employees m ON m.id = e.manager_id;
          `),
          expectedOutput: dedent(`
             name
            ------
             Ben
            (1 row)

             size | colour
            ------+--------
             S    | red
             S    | blue
             M    | red
             M    | blue
            (4 rows)

             employee | manager
            ----------+---------
             Dana     |
             Eli      | Dana
             Fay      | Dana
            (3 rows)
          `),
          explanation: [
            'Anti-join: the padded NULL row identifies customers with no match. `NOT EXISTS (...)` is an equivalent, often clearer form.',
            'CROSS JOIN of 2 sizes × 2 colours = 4 rows; on big tables this explodes.',
            'Self join needs two aliases of the same table; LEFT keeps Dana, who has no manager.',
          ],
        }),
      ),
      section('real-world', 'In a real backend',
        bullets(
          'Order detail endpoint: orders JOIN order_items JOIN products in one query instead of a loop of queries.',
          'Admin "inactive users" report: anti-join users to sessions in the last 30 days.',
          'Org charts and category trees: self join for one level, recursive CTE (`WITH RECURSIVE`) for arbitrary depth.',
        ),
      ),
      section('mistakes', 'Common mistakes',
        bullets(
          'Putting a filter on the right table in WHERE after a LEFT JOIN — it turns the LEFT JOIN into an INNER JOIN.',
          'Joining two 1:N children at once (posts and comments of a user) — rows multiply and sums double-count.',
          'Forgetting the ON condition (or old comma syntax without WHERE) → accidental Cartesian product.',
        ),
        code({
          title: 'Wrong vs right: filtering the right side of a LEFT JOIN',
          language: 'sql',
          code: dedent(`
            -- ❌ WHERE removes customers whose orders are NULL → Ben disappears
            SELECT c.name, o.id FROM customers c
            LEFT JOIN orders o ON o.customer_id = c.id
            WHERE o.total > 30;

            -- ✅ Move the right-side filter into ON
            SELECT c.name, o.id FROM customers c
            LEFT JOIN orders o ON o.customer_id = c.id AND o.total > 30;
          `),
          expectedOutput: dedent(`
             name | id
            ------+----
             Ana  | 10
             Chen | 12
            (2 rows)

             name | id
            ------+----
             Ana  | 10
             Ben  |
             Chen | 12
            (3 rows)
          `),
          explanation: ['`NULL > 30` is unknown, so WHERE discards the padded rows; conditions in ON only decide what matches.'],
        }),
      ),
      section('interview', 'Interview angle',
        interviewTip('Draw (or describe) the result of each join on tiny tables — interviewers check whether you know where NULLs appear.'),
        interviewTip('Mention the LEFT JOIN + WHERE trap and count(*) vs count(col) after an outer join.'),
      ),
      section('practice', 'Practice',
        steps(
          'Using customers/orders above, list every order with the customer name or "guest" when missing (hint: RIGHT/LEFT + coalesce).',
          'Find customers whose total spend exceeds 60.',
          'Write the anti-join with NOT EXISTS and compare EXPLAIN plans.',
        ),
      ),
      section('summary', 'Summary',
        bullets(
          'INNER = matches only; LEFT/RIGHT = keep one side; FULL = keep both; CROSS = all pairs.',
          'Outer joins pad missing columns with NULL.',
          'Right-side filters of a LEFT JOIN belong in ON.',
          'Use `count(col)` not `count(*)` after outer joins.',
        ),
      ),
    ],
    revisionNotes: [
      'LEFT JOIN + `WHERE right.id IS NULL` = anti-join (or NOT EXISTS).',
      'WHERE on right table after LEFT JOIN → effectively INNER.',
      'CROSS JOIN rows = |A| × |B|.',
      'Self join = same table, two aliases (employee/manager).',
      'Planner picks nested loop / hash / merge join; see EXPLAIN.',
      'Joining two 1:N children multiplies rows — aggregate in subqueries first.',
    ],
    quiz: [
      {
        kind: 'predict-output', difficulty: 'intermediate',
        prompt: 'customers has 3 rows; only 2 customers have orders (3 orders total). How many rows does this return?',
        code: 'SELECT c.id FROM customers c LEFT JOIN orders o ON o.customer_id = c.id;',
        options: ['2', '3', '4', '6'],
        answer: 2,
        explanation: '3 order rows matched to their customers + 1 padded row for the customer with no orders = 4. INNER would give 3.',
      },
      {
        kind: 'mcq', difficulty: 'beginner',
        prompt: 'Which join returns every combination of rows from two tables?',
        options: ['FULL OUTER JOIN', 'CROSS JOIN', 'Self join', 'NATURAL JOIN'],
        answer: 1,
        explanation: 'CROSS JOIN is the Cartesian product. FULL OUTER keeps unmatched rows but still uses a join condition.',
      },
      {
        kind: 'find-bug', difficulty: 'advanced',
        prompt: 'The goal is "all users, with their posts from 2026 if any". Users without 2026 posts are missing. Why?',
        code: "SELECT u.name, p.title\nFROM users u\nLEFT JOIN posts p ON p.user_id = u.id\nWHERE p.created_at >= '2026-01-01';",
        options: ['LEFT JOIN cannot be used with dates', 'The WHERE filter on p removes NULL-padded rows; it belongs in the ON clause', 'p.user_id needs an index', 'You need RIGHT JOIN'],
        answer: 1,
        explanation: 'For users without matching posts, p.created_at is NULL and the comparison is unknown, so WHERE drops them. Move it into ON.',
      },
    ],
    interview: [
      {
        category: 'express-backend', kind: 'concept', difficulty: 'beginner', topic: 'Joins',
        question: 'Explain the difference between INNER JOIN and LEFT JOIN.',
        shortAnswer: 'INNER JOIN returns only rows with a match in both tables; LEFT JOIN returns every row of the left table, filling the right table\'s columns with NULL when there is no match.',
        detailedAnswer: [
          'Use INNER when the relationship is required (order items with their product).',
          'Use LEFT when the right side is optional (users and maybe their profile).',
          'With LEFT JOIN, count matched rows with `count(right.id)`, not `count(*)`.',
          'RIGHT JOIN is the mirror image; FULL keeps both sides.',
        ],
        followUp: 'How do you find left rows that have no match?',
        trap: 'Filtering on the right table in WHERE, which silently converts LEFT into INNER.',
      },
      {
        category: 'express-backend', kind: 'scenario', difficulty: 'advanced', topic: 'Joins',
        question: 'A report joins users to both orders and support_tickets, and the order totals come out doubled or tripled. What happened and how do you fix it?',
        shortAnswer: 'Joining two independent one-to-many children creates a row for every order × ticket combination (fan-out), so sums are multiplied; aggregate each child separately first, then join the aggregates.',
        detailedAnswer: [
          'A user with 3 orders and 2 tickets yields 6 rows; sum(total) counts each order twice.',
          'Fix: `LEFT JOIN (SELECT user_id, sum(total) s FROM orders GROUP BY user_id) o USING (user_id)` and the same for tickets.',
          'Alternatives: correlated subqueries or LATERAL joins per child.',
          '`count(DISTINCT ...)` fixes counts but not sums.',
        ],
        code: {
          id: 'm09-join-fanout', language: 'sql',
          code: dedent(`
            SELECT u.id, coalesce(o.revenue, 0) AS revenue, coalesce(t.tickets, 0) AS tickets
            FROM users u
            LEFT JOIN (SELECT user_id, sum(total) AS revenue FROM orders GROUP BY user_id) o ON o.user_id = u.id
            LEFT JOIN (SELECT user_id, count(*) AS tickets FROM support_tickets GROUP BY user_id) t ON t.user_id = u.id;
          `),
        },
        followUp: 'When would a LATERAL join be a better fit?',
        trap: 'Slapping DISTINCT on the SELECT — it hides duplicates but sums stay wrong.',
      },
    ],
  },
};

export default content;
