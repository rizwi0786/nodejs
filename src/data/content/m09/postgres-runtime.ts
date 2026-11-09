import type { ModuleContent } from '../../../types';
import { bullets, code, dedent, diagram, flow, interviewTip, note, section, steps, table, text, warn } from '../helpers';

const content: Partial<ModuleContent> = {
  // ─────────────────────────────────────────────────────────────
  indexes: {
    summary: 'An index is an extra sorted data structure (B-tree by default) that lets Postgres find rows without scanning the table, at the cost of slower writes and extra storage.',
    topics: ['B-tree', 'composite index', 'leftmost prefix', 'partial index', 'unique index', 'GIN', 'EXPLAIN ANALYZE', 'Seq Scan', 'Index Scan', 'Index Only Scan', 'write amplification', 'CREATE INDEX CONCURRENTLY'],
    sections: [
      section('introduction', undefined,
        text('Without an index, `WHERE email = $1` reads every row of the table — fine at 1,000 rows, a disaster at 50 million. An index is like a book\'s index: look up the term, jump to the page.'),
      ),
      section('definition', 'Definition',
        text('An **index** maps column values to row locations (TIDs). Postgres keeps it updated on every INSERT/UPDATE/DELETE and the planner decides when using it is cheaper than a sequential scan.'),
        table('Index types', ['Type', 'Supports', 'Use for'],
          [
            ['B-tree (default)', '=, <, >, BETWEEN, ORDER BY, prefix LIKE \'abc%\'', 'Almost everything'],
            ['GIN', 'Containment: @>, ?, full-text @@, array &&', 'jsonb, arrays, tsvector search'],
            ['GiST / SP-GiST', 'Geometric, ranges, nearest neighbour', 'PostGIS, exclusion constraints'],
            ['BRIN', 'Ranges over physically ordered data', 'Huge append-only time-series'],
            ['Hash', 'Equality only', 'Rarely better than B-tree'],
          ]),
      ),
      section('why', 'Why (and why not)',
        bullets(
          '**Reads**: O(log n) lookups, sorted output without a sort step, index-only scans.',
          '**Writes**: every index must be updated on insert/update/delete — 8 indexes ≈ 9 writes per row.',
          '**Storage & memory**: indexes compete for shared buffers/RAM with table data.',
          'Rule: index for the queries you actually run (check `pg_stat_statements`), not for every column.',
        ),
      ),
      section('internals', 'B-tree and composite indexes',
        steps(
          'A B-tree is a balanced tree of pages; leaf pages hold sorted keys + pointers to heap rows.',
          'A lookup descends root → internal → leaf: ~3–4 page reads even for millions of rows.',
          'A **composite** index `(a, b)` is sorted by `a`, then by `b` within each `a` — like a phone book (last name, first name).',
          '**Leftmost prefix rule**: `(a, b)` helps `WHERE a = ?` and `WHERE a = ? AND b = ?`, but not `WHERE b = ?` alone (well, only via a much slower full-index scan).',
          'Column order: put equality columns first, then range/sort columns: `(user_id, created_at)` for `WHERE user_id = $1 ORDER BY created_at DESC`.',
        ),
        table('Does index (user_id, created_at) help?', ['Query', 'Uses index efficiently?'],
          [
            ['WHERE user_id = 5', 'Yes (prefix)'],
            ['WHERE user_id = 5 AND created_at > now() - interval \'7 days\'', 'Yes'],
            ['WHERE user_id = 5 ORDER BY created_at DESC LIMIT 20', 'Yes — no sort needed'],
            ['WHERE created_at > ...', 'No — leading column missing'],
          ]),
      ),
      section('visual', 'Seq scan vs index scan',
        flow([
          'Query: WHERE email = $1',
          'Planner: estimates rows via statistics',
          'Index Scan: descend B-tree → TID',
          'Heap fetch: read the row page',
        ], { title: 'Index lookup path', direction: 'horizontal', caption: 'A Seq Scan instead reads every page of the table.' }),
      ),
      section('example', 'Measuring with EXPLAIN ANALYZE',
        code({
          title: 'Before the index',
          language: 'sql',
          code: dedent(`
            EXPLAIN ANALYZE SELECT * FROM orders WHERE customer_id = 42;
          `),
          expectedOutput: dedent(`
                                                       QUERY PLAN
            -------------------------------------------------------------------------------------------------
             Seq Scan on orders  (cost=0.00..21846.00 rows=98 width=40) (actual time=0.031..112.507 rows=101 loops=1)
               Filter: (customer_id = 42)
               Rows Removed by Filter: 999899
             Planning Time: 0.080 ms
             Execution Time: 112.540 ms
          `),
          explanation: [
            '`EXPLAIN` shows the plan and estimates; `ANALYZE` actually runs the query and adds real timings.',
            '`Rows Removed by Filter: 999899` — we read a million rows to keep 101.',
            '`cost=start..total` is in arbitrary planner units, not milliseconds.',
          ],
        }),
        code({
          title: 'After CREATE INDEX',
          language: 'sql',
          code: dedent(`
            CREATE INDEX CONCURRENTLY orders_customer_id_idx ON orders (customer_id);
            EXPLAIN ANALYZE SELECT * FROM orders WHERE customer_id = 42;
          `),
          expectedOutput: dedent(`
            CREATE INDEX
                                                       QUERY PLAN
            ---------------------------------------------------------------------------------------------------------------------
             Index Scan using orders_customer_id_idx on orders  (cost=0.42..12.15 rows=98 width=40) (actual time=0.020..0.081 rows=101 loops=1)
               Index Cond: (customer_id = 42)
             Planning Time: 0.110 ms
             Execution Time: 0.102 ms
          `),
          explanation: [
            '~1000× faster: the B-tree jumps straight to the 101 matching entries.',
            '`CONCURRENTLY` builds without blocking writes (slower, cannot run inside a transaction block) — use it in production migrations.',
            'Your exact numbers will differ; the shape of the plan is what matters.',
          ],
        }),
        code({
          title: 'Partial, unique, expression and GIN indexes',
          language: 'sql',
          code: dedent(`
            -- Partial: only index the rows you query (small + fast)
            CREATE INDEX orders_pending_idx ON orders (created_at) WHERE status = 'pending';

            -- Unique (case-insensitive email via expression index)
            CREATE UNIQUE INDEX users_email_lower_key ON users (lower(email));

            -- Unique among non-deleted rows only (soft delete)
            CREATE UNIQUE INDEX users_username_live_key ON users (username) WHERE deleted_at IS NULL;

            -- GIN for jsonb containment
            CREATE INDEX products_attrs_gin ON products USING gin (attributes);
            SELECT id FROM products WHERE attributes @> '{"color": "red"}';
          `),
          expectedOutput: dedent(`
            CREATE INDEX
            CREATE INDEX
            CREATE INDEX
            CREATE INDEX
             id
            ----
              3
             17
            (2 rows)
          `),
          explanation: [
            'A partial index is used only when the query\'s WHERE implies the index predicate (`status = \'pending\'`).',
            'An expression index on `lower(email)` is used only by queries that also write `lower(email) = ...`.',
            'GIN indexes every key/element inside the jsonb document, making `@>` lookups fast.',
          ],
        }),
      ),
      section('real-world', 'In a real backend',
        bullets(
          'Index every FK used in joins/deletes and every column in hot WHERE / ORDER BY clauses.',
          'Job queues: partial index `WHERE status = \'queued\'` keeps the index tiny as finished jobs pile up.',
          'Find slow queries with `pg_stat_statements`; find unused indexes with `pg_stat_user_indexes.idx_scan = 0`.',
          'Always `CREATE INDEX CONCURRENTLY` on live tables; a plain CREATE INDEX blocks writes for the whole build.',
        ),
      ),
      section('mistakes', 'Common mistakes',
        bullets(
          'Wrapping the column in a function: `WHERE date(created_at) = ...` cannot use an index on `created_at` — use a range instead.',
          'Wrong column order in a composite index (range column first).',
          'Indexing low-selectivity columns alone (e.g. boolean `is_active`) — the planner will still seq-scan.',
          'Adding indexes "just in case" — every one slows writes.',
          '`LIKE \'%term\'` (leading wildcard) cannot use a B-tree; use trigram (pg_trgm GIN) or full-text search.',
        ),
        code({
          title: 'Wrong vs right: function on an indexed column',
          language: 'sql',
          code: dedent(`
            -- ❌ Seq Scan: the index stores created_at, not date(created_at)
            SELECT * FROM orders WHERE date(created_at) = '2026-11-08';

            -- ✅ Sargable range predicate uses the index on created_at
            SELECT * FROM orders
            WHERE created_at >= '2026-11-08' AND created_at < '2026-11-09';
          `),
          expectedOutput: '(first plan: Seq Scan; second plan: Index Scan using orders_created_at_idx)',
          explanation: ['A predicate is "sargable" when the indexed column appears bare on one side of the comparison.'],
        }),
      ),
      section('interview', 'Interview angle',
        interviewTip('Explain the leftmost prefix rule with an example and justify column order (equality first, then range/sort).'),
        interviewTip('Always mention the write cost of indexes, and that you verify with EXPLAIN ANALYZE rather than guessing.'),
      ),
      section('practice', 'Practice',
        steps(
          'Design an index for `SELECT * FROM messages WHERE room_id = $1 ORDER BY sent_at DESC LIMIT 50`.',
          'Run EXPLAIN ANALYZE before and after; confirm no Sort node remains.',
          'Add a partial index for unread messages and write a query that uses it.',
        ),
      ),
      section('summary', 'Summary',
        bullets(
          'B-tree is the default; GIN for jsonb/arrays/full-text.',
          'Composite indexes follow the leftmost prefix rule; equality columns first.',
          'Partial and expression indexes target exactly the queries you run.',
          'Indexes speed reads but cost writes and storage.',
          'Verify with EXPLAIN ANALYZE; build with CONCURRENTLY in production.',
        ),
      ),
    ],
    revisionNotes: [
      'Index (a,b): helps a, a+b; not b alone.',
      'Equality columns first, then range/ORDER BY column.',
      'Partial index: `WHERE status = \'pending\'`; query must imply predicate.',
      'GIN: jsonb @>, arrays, tsvector.',
      'EXPLAIN = plan; EXPLAIN ANALYZE = runs it, real times.',
      'Function on column (`date(col)`) defeats a plain index → use range or expression index.',
      'CREATE INDEX CONCURRENTLY avoids blocking writes; not inside a transaction.',
    ],
    quiz: [
      {
        kind: 'mcq', difficulty: 'intermediate',
        prompt: 'An index exists on (country, city). Which query cannot use it efficiently?',
        options: ["WHERE country = 'DE'", "WHERE country = 'DE' AND city = 'Berlin'", "WHERE city = 'Berlin'", "WHERE country = 'DE' ORDER BY city"],
        answer: 2,
        explanation: 'The index is sorted by country first; without the leading column the B-tree cannot be seeked. The other three use the leftmost prefix.',
      },
      {
        kind: 'scenario', difficulty: 'advanced',
        prompt: 'A table receives 20k inserts/sec and has 14 indexes. Inserts are slow. What do you do first?',
        options: ['Add another index on the insert timestamp', 'Check pg_stat_user_indexes for unused/duplicate indexes and drop them', 'Switch every index to GIN', 'Run VACUUM FULL every minute'],
        answer: 1,
        explanation: 'Every index is maintained on every insert. Removing unused ones directly reduces write cost. VACUUM FULL locks the table and does not address index maintenance.',
      },
      {
        kind: 'find-bug', difficulty: 'intermediate',
        prompt: 'There is a B-tree index on users(email). Why does this query still do a Seq Scan?',
        code: 'SELECT * FROM users WHERE lower(email) = lower($1);',
        options: ['B-trees do not support text', 'The index stores email, not lower(email); create an expression index on lower(email)', '$1 placeholders disable indexes', 'SELECT * prevents index usage'],
        answer: 1,
        explanation: 'The planner can only use an index whose indexed expression matches the predicate. Placeholders do not disable indexes.',
      },
    ],
    interview: [
      {
        category: 'express-backend', kind: 'concept', difficulty: 'intermediate', topic: 'Indexes',
        question: 'Explain the leftmost prefix rule for composite indexes and how you decide column order.',
        shortAnswer: 'A composite B-tree index (a, b, c) is sorted by a, then b, then c, so it can be seeked only using a leading prefix (a), (a, b), (a, b, c); put equality-filtered columns first and range or sort columns last.',
        detailedAnswer: [
          'Think of a phone book sorted by last name then first name — you cannot find all "Annas" quickly.',
          '`(user_id, created_at)` serves `WHERE user_id = ? ORDER BY created_at DESC LIMIT n` with no sort.',
          'A range on the first column stops the second column from narrowing the seek.',
          'Among equality columns, order matters less for lookups; choose the one that also serves other queries.',
          'Verify with EXPLAIN that the index is used and that no Sort node appears.',
        ],
        followUp: 'When would you prefer two single-column indexes over one composite (bitmap AND)?',
        trap: 'Saying "the most selective column must always come first" — equality vs range and query shape matter more.',
      },
      {
        category: 'express-backend', kind: 'concept', difficulty: 'advanced', topic: 'Indexes',
        question: 'What is a partial index and when would you use one?',
        shortAnswer: 'An index with a WHERE predicate that only covers matching rows; it is smaller and cheaper to maintain, and is used when the query condition implies the predicate.',
        detailedAnswer: [
          'Example: `CREATE INDEX ON jobs (run_at) WHERE status = \'queued\'` — finished jobs never enter the index.',
          'Partial UNIQUE index enforces uniqueness among live rows: `UNIQUE (email) WHERE deleted_at IS NULL`.',
          'The planner uses it only if the query WHERE logically implies the index predicate.',
          'Parameterised predicates like `status = $1` may not match a generic plan — keep the literal in the query when relying on it.',
        ],
        followUp: 'How does a partial unique index help implement soft delete?',
        trap: 'Expecting the planner to use it for queries that do not include the predicate.',
      },
      {
        category: 'express-backend', kind: 'scenario', difficulty: 'intermediate', topic: 'Indexes',
        question: 'An endpoint got slow after the table grew. Walk through how you investigate.',
        shortAnswer: 'Capture the exact SQL, run EXPLAIN (ANALYZE, BUFFERS) on production-like data, look for Seq Scans, large Rows Removed by Filter, Sort nodes and bad estimates, then add or adjust an index and re-measure.',
        detailedAnswer: [
          'Find the query via logs or pg_stat_statements (total and mean time).',
          'Compare estimated vs actual rows; huge gaps suggest stale statistics → ANALYZE the table.',
          'Check that predicates are sargable (no functions on indexed columns).',
          'Create the index CONCURRENTLY; confirm the new plan and latency.',
          'Also check for N+1 query patterns in the Node code.',
        ],
        followUp: 'What does BUFFERS add to EXPLAIN output?',
        trap: 'Adding indexes blindly without reading the plan.',
      },
    ],
  },

  // ─────────────────────────────────────────────────────────────
  transactions: {
    summary: 'A transaction groups statements into one atomic unit (BEGIN … COMMIT/ROLLBACK); isolation levels control which concurrency anomalies are possible, and row locks (FOR UPDATE) serialise conflicting writes.',
    topics: ['BEGIN', 'COMMIT', 'ROLLBACK', 'SAVEPOINT', 'isolation levels', 'READ COMMITTED', 'REPEATABLE READ', 'SERIALIZABLE', 'dirty read', 'non-repeatable read', 'phantom read', 'lost update', 'SELECT FOR UPDATE', 'deadlock', 'MVCC', 'pool.connect'],
    sections: [
      section('introduction', undefined,
        text('Transferring money is two updates. If the server crashes between them, or another request reads in the middle, money appears or vanishes. Transactions make multi-step changes **all-or-nothing** and control what concurrent requests see.'),
      ),
      section('definition', 'Definition',
        bullets(
          '`BEGIN` starts a transaction; `COMMIT` makes all changes durable and visible; `ROLLBACK` discards them.',
          'Any error inside a Postgres transaction puts it in an **aborted** state — every further statement fails until ROLLBACK.',
          '`SAVEPOINT name` / `ROLLBACK TO name` undo part of a transaction.',
          'Outside an explicit BEGIN, each statement is its own transaction (autocommit).',
        ),
      ),
      section('why', 'Why you need them',
        bullets(
          'Atomic multi-row changes: order + order_items + stock decrement.',
          'Consistent reads across several queries (REPEATABLE READ).',
          'Preventing lost updates when two requests read-modify-write the same row.',
        ),
      ),
      section('internals', 'Isolation levels and anomalies',
        text('Postgres uses **MVCC** (multi-version concurrency control): each write creates a new row version, and each transaction reads from a snapshot. Readers never block writers and vice versa.'),
        table('Anomalies by isolation level (PostgreSQL behaviour)', ['Level', 'Dirty read', 'Non-repeatable read', 'Phantom read', 'Serialization anomaly'],
          [
            ['READ UNCOMMITTED*', 'Not possible in PG', 'Possible', 'Possible', 'Possible'],
            ['READ COMMITTED (default)', 'No', 'Possible', 'Possible', 'Possible'],
            ['REPEATABLE READ', 'No', 'No', 'No in PG (allowed by the standard)', 'Possible'],
            ['SERIALIZABLE', 'No', 'No', 'No', 'No'],
          ]),
        note('*Postgres accepts READ UNCOMMITTED but treats it as READ COMMITTED. Its default level is **READ COMMITTED**: each *statement* sees a fresh snapshot.'),
        table('Anomaly glossary', ['Anomaly', 'Meaning'],
          [
            ['Dirty read', 'Reading another transaction\'s uncommitted changes'],
            ['Non-repeatable read', 'Same row read twice returns different values (someone committed in between)'],
            ['Phantom read', 'Same WHERE query returns a different set of rows'],
            ['Lost update', 'Two read-modify-write cycles overwrite each other'],
            ['Serialization anomaly (write skew)', 'Result impossible under any serial order (two doctors both go off-call)'],
          ]),
        bullets(
          'In REPEATABLE READ and SERIALIZABLE, conflicts raise `40001 serialization_failure` — the app must **retry** the whole transaction.',
          '`SELECT ... FOR UPDATE` locks selected rows until the transaction ends; other writers (and other FOR UPDATE readers) wait.',
          '**Deadlock**: T1 locks A then wants B; T2 locks B then wants A. Postgres detects it (after `deadlock_timeout`, 1s default) and aborts one with `40P01`.',
        ),
      ),
      section('visual', 'Lost update vs FOR UPDATE',
        flow([
          'T1: SELECT balance → 100',
          'T2: SELECT balance → 100',
          'T1: UPDATE balance = 100 - 30',
          'T2: UPDATE balance = 100 - 50',
          'Result: 50 (T1\'s debit lost)',
        ], { title: 'Lost update under READ COMMITTED (read-then-write in JS)', direction: 'vertical', caption: 'With SELECT ... FOR UPDATE, T2 blocks at its SELECT until T1 commits, then reads 70.' }),
      ),
      section('example', 'Transactions in SQL',
        code({
          title: 'Atomic transfer with row locks',
          language: 'sql',
          code: dedent(`
            BEGIN;
            SELECT id, balance FROM accounts WHERE id IN (1, 2) ORDER BY id FOR UPDATE;
            UPDATE accounts SET balance = balance - 30 WHERE id = 1;
            UPDATE accounts SET balance = balance + 30 WHERE id = 2;
            COMMIT;
          `),
          expectedOutput: dedent(`
            BEGIN
             id | balance
            ----+---------
              1 |  100.00
              2 |   20.00
            (2 rows)

            UPDATE 1
            UPDATE 1
            COMMIT
          `),
          explanation: [
            '`FOR UPDATE` locks both rows; a concurrent transfer touching them waits.',
            '`ORDER BY id` locks rows in a consistent order — the standard way to avoid deadlocks.',
            'If anything fails before COMMIT, ROLLBACK leaves both balances unchanged.',
          ],
        }),
        code({
          title: 'An error aborts the transaction',
          language: 'sql',
          code: dedent(`
            BEGIN;
            INSERT INTO users (email) VALUES ('ana@example.com');  -- duplicate
            SELECT 1;
            ROLLBACK;
          `),
          expectedOutput: dedent(`
            BEGIN
            ERROR:  duplicate key value violates unique constraint "users_email_key"
            ERROR:  current transaction is aborted, commands ignored until end of transaction block
            ROLLBACK
          `),
          explanation: ['After an error, Postgres refuses everything until ROLLBACK (or ROLLBACK TO SAVEPOINT).'],
        }),
      ),
      section('walkthrough', 'Transactions in Node with node-postgres',
        warn('In `pg` (node-postgres, a third-party package), `pool.query()` may run each call on a **different** connection. BEGIN on one connection and UPDATE on another is not a transaction. Always check out one client with `pool.connect()`.'),
        code({
          title: 'Correct transaction helper',
          code: dedent(`
            import pg from 'pg';
            const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

            export async function withTransaction(fn) {
              const client = await pool.connect();      // one dedicated connection
              try {
                await client.query('BEGIN');
                const result = await fn(client);        // all queries use this client
                await client.query('COMMIT');
                return result;
              } catch (err) {
                await client.query('ROLLBACK');
                throw err;
              } finally {
                client.release();                       // ALWAYS return it to the pool
              }
            }

            await withTransaction(async (c) => {
              await c.query('UPDATE accounts SET balance = balance - $1 WHERE id = $2', [30, 1]);
              await c.query('UPDATE accounts SET balance = balance + $1 WHERE id = $2', [30, 2]);
            });
            console.log('transfer committed');
          `),
          expectedOutput: 'transfer committed',
          explanation: [
            '`pool.connect()` returns a client bound to one physical connection — BEGIN/COMMIT apply to it.',
            'Any throw inside `fn` triggers ROLLBACK and re-throws so the caller (e.g. Express error middleware) sees it.',
            '`finally` releases the client even on error; forgetting it leaks connections until the pool is exhausted.',
          ],
        }),
        code({
          title: 'Retrying serialization failures',
          code: dedent(`
            async function withRetry(fn, attempts = 3) {
              for (let i = 1; ; i++) {
                try {
                  return await withTransaction(async (c) => {
                    await c.query('SET TRANSACTION ISOLATION LEVEL SERIALIZABLE');
                    return fn(c);
                  });
                } catch (err) {
                  const retryable = err.code === '40001' || err.code === '40P01';
                  if (!retryable || i >= attempts) throw err;
                }
              }
            }
          `),
          expectedOutput: '(retries up to 3 times on serialization_failure or deadlock_detected, then rethrows)',
          explanation: [
            '`SET TRANSACTION` must be the first statement after BEGIN.',
            'Retry the *whole* transaction function, not just the failing statement.',
          ],
        }),
      ),
      section('real-world', 'In a real backend',
        bullets(
          'Checkout: lock stock rows `FOR UPDATE`, decrement, insert order + items, commit — or use a conditional `UPDATE stock SET qty = qty - $1 WHERE id = $2 AND qty >= $1` and check rowCount.',
          'Job queue workers: `SELECT ... FOR UPDATE SKIP LOCKED LIMIT 1` lets many workers grab different jobs without waiting.',
          'Keep transactions **short**: never call external HTTP APIs (payment provider, email) while holding locks.',
        ),
      ),
      section('mistakes', 'Common mistakes',
        bullets(
          'Using `pool.query(\'BEGIN\')` then `pool.query(...)` — statements land on different connections.',
          'Not releasing the client in `finally`.',
          'Long transactions holding locks while awaiting slow I/O → blocked requests, bloat (old row versions cannot be vacuumed).',
          'Read in JS, compute, write back without a lock — lost updates. Use `SET x = x - 1` or FOR UPDATE.',
          'Assuming SERIALIZABLE "just works" without retry logic.',
        ),
        code({
          title: 'Wrong vs right',
          code: dedent(`
            // ❌ Not a transaction: each pool.query may use a different connection
            await pool.query('BEGIN');
            await pool.query('UPDATE accounts SET balance = balance - 30 WHERE id = 1');
            await pool.query('COMMIT');

            // ✅ One client for the whole transaction
            const client = await pool.connect();
            try {
              await client.query('BEGIN');
              await client.query('UPDATE accounts SET balance = balance - 30 WHERE id = 1');
              await client.query('COMMIT');
            } catch (e) { await client.query('ROLLBACK'); throw e; }
            finally { client.release(); }
          `),
          expectedOutput: '(first version may leave a connection stuck "idle in transaction"; second is atomic)',
          explanation: ['A BEGIN sent on a pooled connection that is then returned to the pool leaks an open transaction to the next borrower.'],
        }),
      ),
      section('interview', 'Interview angle',
        interviewTip('State Postgres\'s default (READ COMMITTED) and which anomalies it allows; then explain how you would prevent a lost update.'),
        interviewTip('In Node interviews, the `pool.connect()` vs `pool.query()` distinction for transactions is a classic check.'),
      ),
      section('practice', 'Practice',
        steps(
          'Open two psql sessions; reproduce a non-repeatable read under READ COMMITTED, then show it disappears under REPEATABLE READ.',
          'Write a `reserveSeat(eventId, userId)` function using `withTransaction` and FOR UPDATE.',
          'Cause a deadlock deliberately by locking rows in opposite orders; read the error.',
        ),
      ),
      section('summary', 'Summary',
        bullets(
          'BEGIN / COMMIT / ROLLBACK; an error aborts the whole transaction.',
          'Postgres default: READ COMMITTED; REPEATABLE READ and SERIALIZABLE need retry on 40001.',
          'FOR UPDATE locks rows; lock in consistent order to avoid deadlocks (40P01).',
          'node-postgres: one client from `pool.connect()`, release in `finally`.',
          'Keep transactions short; no external calls inside.',
        ),
      ),
    ],
    revisionNotes: [
      'PG default isolation: READ COMMITTED (snapshot per statement).',
      'REPEATABLE READ: snapshot per transaction; SERIALIZABLE: SSI, may throw 40001 → retry.',
      'PG never allows dirty reads, even at READ UNCOMMITTED.',
      'FOR UPDATE row lock; FOR UPDATE SKIP LOCKED for job queues.',
      'Deadlock → 40P01; prevent by consistent lock ordering.',
      'Transaction in pg: `const c = await pool.connect()`; BEGIN…COMMIT; ROLLBACK in catch; `c.release()` in finally.',
      'Error inside txn → "current transaction is aborted" until ROLLBACK.',
    ],
    quiz: [
      {
        kind: 'mcq', difficulty: 'intermediate',
        prompt: 'What is PostgreSQL\'s default transaction isolation level?',
        options: ['READ UNCOMMITTED', 'READ COMMITTED', 'REPEATABLE READ', 'SERIALIZABLE'],
        answer: 1,
        explanation: 'Postgres defaults to READ COMMITTED. (MySQL InnoDB defaults to REPEATABLE READ — a common mix-up.)',
      },
      {
        kind: 'find-bug', difficulty: 'intermediate',
        prompt: 'Why is this not a real transaction?',
        code: "await pool.query('BEGIN');\nawait pool.query('INSERT INTO orders ...');\nawait pool.query('UPDATE stock ...');\nawait pool.query('COMMIT');",
        options: ['BEGIN must be lowercase', 'pool.query can use a different pooled connection for each call', 'COMMIT is implicit', 'INSERT cannot run in a transaction'],
        answer: 1,
        explanation: 'Transactions are per connection. Check out one client with pool.connect(), use it for every statement, and release it in finally.',
      },
      {
        kind: 'scenario', difficulty: 'advanced',
        prompt: 'Two concurrent requests each read stock = 1, check > 0 in JS, then set stock = 0 and create an order. You oversell. Which fix is correct?',
        options: ['Raise the isolation level to READ UNCOMMITTED', 'Use UPDATE stock SET qty = qty - 1 WHERE id = $1 AND qty > 0 and check rowCount', 'Add an index on stock.qty', 'Wrap only the SELECT in a transaction'],
        answer: 1,
        explanation: 'The conditional UPDATE is atomic: only one request can decrement from 1 to 0; the other sees rowCount 0. SELECT ... FOR UPDATE is the other valid approach.',
      },
      {
        kind: 'predict-output', difficulty: 'advanced',
        prompt: 'In one psql session, what does the SELECT return?',
        code: "BEGIN;\nINSERT INTO t VALUES (1);\nINSERT INTO t VALUES (1); -- violates PK\nSELECT count(*) FROM t;",
        options: ['1', '2', '0', 'ERROR: current transaction is aborted'],
        answer: 3,
        explanation: 'After any error, Postgres ignores all commands until ROLLBACK. It does not silently continue as some other databases do.',
      },
    ],
    interview: [
      {
        category: 'express-backend', kind: 'concept', difficulty: 'intermediate', topic: 'Transactions',
        question: 'Describe the SQL isolation levels and the anomalies each prevents, with PostgreSQL specifics.',
        shortAnswer: 'READ COMMITTED (PG default) prevents dirty reads; REPEATABLE READ also prevents non-repeatable and, in PG, phantom reads; SERIALIZABLE prevents all anomalies including write skew, at the cost of retryable serialization failures.',
        detailedAnswer: [
          'Postgres implements isolation with MVCC snapshots, so readers do not block writers.',
          'READ COMMITTED: new snapshot per statement.',
          'REPEATABLE READ: one snapshot for the whole transaction; concurrent update of the same row raises 40001.',
          'SERIALIZABLE: Serializable Snapshot Isolation detects dangerous dependency cycles and aborts one transaction.',
          'READ UNCOMMITTED behaves as READ COMMITTED in Postgres.',
        ],
        followUp: 'Give an example of write skew and how SERIALIZABLE or explicit locking fixes it.',
        trap: 'Claiming Postgres default is REPEATABLE READ (that is MySQL InnoDB).',
      },
      {
        category: 'express-backend', kind: 'concept', difficulty: 'beginner', topic: 'Transactions',
        question: 'How do you run a transaction with node-postgres, and why not with pool.query?',
        shortAnswer: 'Check out a single client with `await pool.connect()`, run BEGIN, the statements and COMMIT on that client, ROLLBACK on error, and release it in finally — because pool.query may send each statement on a different connection.',
        detailedAnswer: [
          'A transaction belongs to one database connection (session).',
          '`pool.query` borrows any idle connection per call and returns it immediately.',
          'Wrap the pattern in a `withTransaction(fn)` helper so routes cannot get it wrong.',
          'Forgetting `release()` leaks the client and eventually exhausts the pool.',
        ],
        followUp: 'What happens if you release a client while a transaction is still open?',
        trap: 'Assuming `pool.query(\'BEGIN\')` starts a transaction for subsequent pool.query calls.',
      },
      {
        category: 'express-backend', kind: 'concept', difficulty: 'advanced', topic: 'Transactions',
        question: 'What causes deadlocks in Postgres and how do you prevent and handle them?',
        shortAnswer: 'Two transactions each hold a lock the other needs; Postgres detects the cycle and aborts one with error 40P01. Prevent by acquiring locks in a consistent order and keeping transactions short; handle by retrying the aborted transaction.',
        detailedAnswer: [
          'Classic case: transfer A→B locks A then B while a transfer B→A locks B then A.',
          'Fix: always lock rows ordered by id (`SELECT ... WHERE id IN (...) ORDER BY id FOR UPDATE`).',
          'The deadlock detector runs after `deadlock_timeout` (1s default).',
          'Use `lock_timeout` / `statement_timeout` to avoid waiting forever on ordinary lock waits.',
          'Retry logic should rerun the whole transaction with backoff.',
        ],
        followUp: 'What is the difference between a deadlock and simple lock contention?',
        trap: 'Thinking deadlocks mean the database is broken — they are an expected concurrency outcome to handle.',
      },
      {
        category: 'express-backend', kind: 'scenario', difficulty: 'advanced', topic: 'Transactions',
        question: 'How would you build a Postgres-backed job queue where many workers pull jobs concurrently without processing the same job twice?',
        shortAnswer: 'Each worker runs a short transaction with `SELECT ... FROM jobs WHERE status = \'queued\' ORDER BY run_at LIMIT 1 FOR UPDATE SKIP LOCKED`, marks the job as running, and commits; SKIP LOCKED makes workers skip rows another worker has locked instead of waiting.',
        detailedAnswer: [
          'FOR UPDATE alone would make every worker queue up behind the first locked row.',
          'SKIP LOCKED returns the next unlocked row — natural work distribution.',
          'Add a partial index on (run_at) WHERE status = \'queued\'.',
          'Track attempts and a lease/heartbeat so crashed workers\' jobs become visible again.',
          'Do the actual work outside the claiming transaction to keep locks short.',
        ],
        followUp: 'When would you move from a Postgres queue to Redis/BullMQ or a message broker?',
        trap: 'Using SELECT then UPDATE without locking — two workers claim the same job.',
      },
    ],
  },

  // ─────────────────────────────────────────────────────────────
  'connection-pooling': {
    summary: 'A connection pool keeps a fixed set of open database connections and lends them to requests, avoiding per-request connect cost and protecting the database from too many connections.',
    topics: ['pg.Pool', 'max', 'idleTimeoutMillis', 'connectionTimeoutMillis', 'client.release', 'pool exhaustion', 'PgBouncer', 'max_connections', 'serverless'],
    sections: [
      section('introduction', undefined,
        text('Opening a Postgres connection costs a TCP (and often TLS) handshake, authentication and a new server process — several milliseconds and a few MB of server memory. A **pool** opens connections once and reuses them.'),
      ),
      section('definition', 'Definition',
        text('A **connection pool** is a client-side cache of open connections. Callers borrow a connection, run queries and return it. If all are busy, callers wait in a queue.'),
        table('pg.Pool options (node-postgres)', ['Option', 'Default', 'Meaning'],
          [
            ['max', '10', 'Maximum connections this pool will open'],
            ['idleTimeoutMillis', '10000', 'Close a connection idle for this long (0 = never)'],
            ['connectionTimeoutMillis', '0 (wait forever)', 'How long to wait for a free/new connection before erroring'],
            ['maxUses', 'Infinity', 'Recycle a connection after N uses (helps with load balancers)'],
            ['allowExitOnIdle', 'false', 'Let the process exit when all clients are idle (scripts/tests)'],
          ]),
      ),
      section('why', 'Why pool',
        bullets(
          '**Latency**: reuse avoids a 5–50 ms connect on every request.',
          '**Protection**: Postgres has a hard `max_connections` (default 100); each connection is a process using memory.',
          '**Backpressure**: when the database is saturated, requests queue in Node instead of overwhelming it.',
        ),
      ),
      section('internals', 'How pg.Pool lends connections',
        diagram('connection-pool', 'Many concurrent requests share a small, fixed set of database connections.'),
        steps(
          '`pool.query(sql, values)` = connect → query → release, in one call.',
          '`pool.connect()` returns a client you must `release()` yourself (needed for transactions).',
          'If no idle client and `count < max`, the pool opens a new connection.',
          'If `count === max`, the request waits; after `connectionTimeoutMillis` it rejects with "timeout exceeded when trying to connect".',
          'Idle connections are closed after `idleTimeoutMillis`.',
          'Errors on idle clients are emitted as `pool.on(\'error\')` — without a listener the process crashes.',
        ),
        table('Sizing: total connections', ['Deployment', 'Connections opened'],
          [['4 pods × 1 process × max 10', '40'], ['4 pods × 4 cluster workers × max 20', '320 — exceeds default max_connections 100!'], ['Serverless, 500 concurrent invocations × 1', '500 → needs PgBouncer / a proxy']]),
      ),
      section('example', 'Configuring a pool',
        code({
          title: 'db.js — one pool per process',
          code: dedent(`
            import pg from 'pg';

            export const pool = new pg.Pool({
              connectionString: process.env.DATABASE_URL,
              max: 10,                        // per process
              idleTimeoutMillis: 30_000,
              connectionTimeoutMillis: 2_000, // fail fast instead of hanging
            });

            pool.on('error', (err) => {
              console.error('idle client error', err.message); // e.g. DB restarted
            });

            const { rows } = await pool.query('SELECT now() AS now');
            console.log(pool.totalCount, pool.idleCount, pool.waitingCount);
          `),
          expectedOutput: '1 1 0',
          explanation: [
            'One connection was opened for the query and returned → total 1, idle 1, waiting 0.',
            'Create the pool **once** at module level and import it everywhere — not per request.',
            '`connectionTimeoutMillis` turns pool exhaustion into a fast, visible error instead of hung requests.',
          ],
        }),
        code({
          title: 'Releasing in finally',
          code: dedent(`
            app.get('/report', async (req, res, next) => {
              const client = await pool.connect();
              try {
                const a = await client.query('SELECT count(*) FROM orders');
                const b = await client.query('SELECT count(*) FROM users');
                res.json({ orders: a.rows[0].count, users: b.rows[0].count });
              } catch (err) {
                next(err);
              } finally {
                client.release();
              }
            });
          `),
          expectedOutput: '{"orders":"1520","users":"842"}',
          explanation: [
            '`count(*)` returns `bigint`, which node-postgres returns as a **string** by default to avoid precision loss.',
            'If `release()` were inside `try` only, any thrown error would leak the client.',
            '`client.release(err)` (passing a truthy value) destroys a broken connection instead of reusing it.',
          ],
        }),
      ),
      section('real-world', 'In a real backend',
        bullets(
          '**PgBouncer** (or a cloud proxy) sits between apps and Postgres, multiplexing thousands of client connections onto a few dozen server connections.',
          'PgBouncer **transaction mode** reassigns server connections between transactions — session state (SET, advisory locks, LISTEN, and, on older versions, named prepared statements) does not survive.',
          'Size the pool from the database\'s capacity: often 2–4 × CPU cores of the DB server in total, divided among app processes.',
          'Expose `totalCount/idleCount/waitingCount` as metrics; rising `waitingCount` = pool saturation.',
        ),
      ),
      section('mistakes', 'Common mistakes',
        bullets(
          'Creating `new Pool()` inside a request handler — a new pool (and connections) per request.',
          'Forgetting `client.release()` → after `max` leaks, every request hangs.',
          'Setting `max: 100` "for performance" on 10 instances → database out of connections.',
          'Holding a client while awaiting a slow external API.',
          'No `pool.on(\'error\')` listener → an idle connection drop crashes the process.',
        ),
        code({
          title: 'Wrong vs right: pool lifetime',
          code: dedent(`
            // ❌ New pool per request
            app.get('/users', async (req, res) => {
              const pool = new pg.Pool();
              const { rows } = await pool.query('SELECT id, email FROM users');
              res.json(rows);
            });

            // ✅ Module-level singleton
            import { pool } from './db.js';
            app.get('/users', async (req, res) => {
              const { rows } = await pool.query('SELECT id, email FROM users');
              res.json(rows);
            });
          `),
          expectedOutput: '(first version opens a new connection per request and never closes the pools)',
          explanation: ['Pools are meant to be long-lived; close them only on shutdown with `await pool.end()`.'],
        }),
      ),
      section('interview', 'Interview angle',
        interviewTip('Explain pool exhaustion: symptoms (requests hang/time out, DB idle), causes (leaked clients, long transactions, max too small) and fixes.'),
        interviewTip('Do the multiplication: instances × workers × max must stay under `max_connections` minus admin headroom.'),
      ),
      section('practice', 'Practice',
        steps(
          'Create a pool with `max: 2` and fire 5 concurrent `SELECT pg_sleep(1)` queries; log `waitingCount` and total time.',
          'Remove a `release()` call and observe the third request time out with `connectionTimeoutMillis: 1000`.',
          'Add graceful shutdown: on SIGTERM, stop the HTTP server, then `await pool.end()`.',
        ),
      ),
      section('summary', 'Summary',
        bullets(
          'Pools reuse connections: lower latency, bounded DB load.',
          'Key options: max, idleTimeoutMillis, connectionTimeoutMillis.',
          '`pool.query` for single statements; `pool.connect()` + `release()` in finally for multi-statement work.',
          'Total connections = instances × processes × max — use PgBouncer when that grows.',
        ),
      ),
    ],
    revisionNotes: [
      'pg.Pool defaults: max 10, idleTimeoutMillis 10000, connectionTimeoutMillis 0 (forever).',
      'Postgres default max_connections = 100; each connection = a backend process.',
      'Always `client.release()` in finally; `release(err)` to destroy a bad client.',
      'Add `pool.on(\'error\')` listener.',
      'PgBouncer transaction mode: session state not preserved.',
      'pg returns bigint/numeric as strings by default.',
    ],
    quiz: [
      {
        kind: 'scenario', difficulty: 'intermediate',
        prompt: 'After a deploy, the API works for a few minutes then every request hangs, while the database CPU is idle. What is the most likely cause?',
        options: ['The database is out of disk', 'A code path checks out clients with pool.connect() and never releases them', 'Too many indexes', 'JSON responses are too large'],
        answer: 1,
        explanation: 'Leaked clients exhaust the pool; new requests wait forever (default connectionTimeoutMillis is 0). The idle DB rules out query load.',
      },
      {
        kind: 'mcq', difficulty: 'beginner',
        prompt: 'What does the pg.Pool option connectionTimeoutMillis control?',
        options: ['How long a query may run', 'How long to wait to acquire a connection before failing', 'How long idle connections stay open', 'TCP keep-alive interval'],
        answer: 1,
        explanation: 'It bounds the wait for a client. Query duration is statement_timeout/query_timeout; idle lifetime is idleTimeoutMillis.',
      },
      {
        kind: 'predict-output', difficulty: 'intermediate',
        prompt: 'A pool has max: 3. Five requests each hold a client for 1 second, all starting together. Roughly how long until all five finish?',
        options: ['1 second', '2 seconds', '5 seconds', 'They fail immediately'],
        answer: 1,
        explanation: 'Three run in the first second; the remaining two wait in the queue and run in the second second. They only fail if connectionTimeoutMillis is shorter than the wait.',
      },
    ],
    interview: [
      {
        category: 'express-backend', kind: 'concept', difficulty: 'beginner', topic: 'Connection pooling',
        question: 'Why do Node.js apps use a database connection pool instead of opening a connection per request?',
        shortAnswer: 'Opening a connection is slow and each one consumes database memory and a process slot; a pool reuses a bounded set of connections, cutting latency and protecting the database.',
        detailedAnswer: [
          'Connect cost: TCP + TLS + auth + backend process fork in Postgres.',
          'Postgres has a hard max_connections limit; unbounded connections crash or refuse clients.',
          'The pool queues excess work, providing natural backpressure.',
          'Create one pool per process at startup; end it on shutdown.',
        ],
        followUp: 'How would you size the pool?',
        trap: 'Thinking a bigger pool is always faster — beyond the DB\'s core count, more connections add contention.',
      },
      {
        category: 'express-backend', kind: 'scenario', difficulty: 'advanced', topic: 'Connection pooling',
        question: 'You are moving a Postgres-backed API to serverless functions and start seeing "too many clients already". What do you do?',
        shortAnswer: 'Each function instance holds its own connections, so concurrency multiplies them; put a connection pooler/proxy (PgBouncer, a managed proxy, or the provider\'s pooled endpoint) in front of Postgres and keep each instance\'s pool tiny (max 1–2).',
        detailedAnswer: [
          'Serverless scales to hundreds of instances, each opening its own pool.',
          'PgBouncer in transaction mode multiplexes many clients onto few server connections.',
          'Transaction mode breaks session features: SET, LISTEN/NOTIFY, advisory session locks; check prepared statement support.',
          'Create the pool outside the handler so warm invocations reuse it.',
          'Alternatively use an HTTP-based driver offered by some managed Postgres providers.',
        ],
        followUp: 'What is the difference between PgBouncer session, transaction and statement pooling modes?',
        trap: 'Raising max_connections to thousands — each connection costs memory and degrades the server.',
      },
    ],
  },

  // ─────────────────────────────────────────────────────────────
  'node-js-postgresql-integration': {
    summary: 'The `pg` package (node-postgres, third-party) connects Node to PostgreSQL: configure a Pool from env vars, run parameterised queries, map rows and errors, and shut down cleanly.',
    topics: ['pg', 'node-postgres', 'Pool', 'Client', 'result.rows', 'rowCount', 'type parsing', 'error codes', 'graceful shutdown', 'Express integration', 'migrations'],
    sections: [
      section('introduction', undefined,
        text('Node has no built-in Postgres driver. The de-facto standard is **`pg`** (node-postgres), a third-party package that speaks the Postgres wire protocol over TCP. ORMs like Sequelize and many query builders use it underneath.'),
      ),
      section('definition', 'Key APIs',
        table('node-postgres building blocks', ['API', 'What it does'],
          [
            ['new pg.Pool(config)', 'Pool of connections (use in apps)'],
            ['new pg.Client(config)', 'Single connection (scripts, LISTEN/NOTIFY)'],
            ['pool.query(text, values)', 'Run one parameterised query on any free connection'],
            ['pool.query({ text, values, name })', 'Named prepared statement (parsed once per connection)'],
            ['result.rows / rowCount / fields', 'Row objects, affected rows, column metadata'],
            ['pg.types.setTypeParser(oid, fn)', 'Customise how a Postgres type converts to JS'],
          ]),
        note('Install with `npm install pg`. The pool also reads standard libpq env vars (PGHOST, PGUSER, PGPASSWORD, PGDATABASE, PGPORT) when no config is given.'),
      ),
      section('why', 'Why use pg directly',
        bullets(
          'Full SQL power, minimal abstraction, very predictable performance.',
          'Small dependency surface; easy to read what hits the database.',
          'Trade-off: you write mapping, migrations and validation yourself (or add a query builder like Kysely/Knex).',
        ),
      ),
      section('internals', 'What happens on pool.query',
        flow([
          'pool.query(text, values)',
          'Acquire client: idle or new TCP connection',
          'Extended protocol: Parse → Bind (values) → Execute',
          'Rows streamed back: parsed by type OID',
          'Client released: result promise resolves',
        ], { title: 'node-postgres query path', direction: 'horizontal' }),
        table('Default type mapping', ['Postgres type', 'JS value', 'Why'],
          [
            ['int4, float8, bool, text', 'number / boolean / string', 'Fits safely'],
            ['int8 (bigint), count(*)', 'string', 'Could exceed Number.MAX_SAFE_INTEGER'],
            ['numeric', 'string', 'Exact decimals; JS floats would round'],
            ['timestamptz / timestamp', 'Date', 'Parsed to a JS Date'],
            ['json / jsonb', 'object', 'JSON.parse applied'],
          ]),
      ),
      section('visual', 'Where pg sits in your app',
        diagram('layered-architecture', 'Routes → controllers → services → repositories → pg Pool → PostgreSQL.'),
      ),
      section('example', 'A minimal Express + pg API',
        code({
          title: 'db.js',
          code: dedent(`
            import pg from 'pg';

            export const pool = new pg.Pool({
              connectionString: process.env.DATABASE_URL, // postgres://user:pass@host:5432/app
              max: 10,
              connectionTimeoutMillis: 2000,
              ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: true } : false,
            });
            pool.on('error', (err) => console.error('pg idle error', err));
          `),
          expectedOutput: '(no output — module exports a configured pool)',
          explanation: ['Run with `node --env-file=.env server.js` (Node 20.6+) to load DATABASE_URL without dotenv.'],
          versionNote: '`--env-file` requires Node 20.6+.',
        }),
        code({
          title: 'routes/users.js',
          code: dedent(`
            import { pool } from '../db.js';

            app.get('/users/:id', async (req, res, next) => {
              try {
                const { rows } = await pool.query(
                  'SELECT id, email, created_at FROM users WHERE id = $1',
                  [req.params.id],
                );
                if (rows.length === 0) return res.status(404).json({ error: 'Not found' });
                res.json(rows[0]);
              } catch (err) { next(err); }
            });

            app.post('/users', async (req, res, next) => {
              try {
                const { rows } = await pool.query(
                  'INSERT INTO users (email) VALUES ($1) RETURNING id, email, created_at',
                  [req.body.email],
                );
                res.status(201).json(rows[0]);
              } catch (err) {
                if (err.code === '23505') return res.status(409).json({ error: 'Email taken' });
                next(err);
              }
            });
          `),
          expectedOutput: dedent(`
            GET /users/1   → 200 {"id":"1","email":"ana@example.com","created_at":"2026-11-08T10:15:02.310Z"}
            POST /users    → 201 {"id":"2","email":"ben@example.com","created_at":"2026-11-08T10:20:44.002Z"}
            POST /users    → 409 {"error":"Email taken"}   (same email again)
          `),
          explanation: [
            '`id` is a bigint, so it arrives as the string "1".',
            '`created_at` is a JS Date; `res.json` serialises it to ISO 8601.',
            'Map known SQLSTATE codes (23505 unique, 23503 FK, 23502 not null, 22P02 invalid input) to 4xx; everything else → 500 via `next(err)`.',
            'Express 5 forwards rejected promises to error middleware automatically, so the try/catch can be dropped there.',
          ],
        }),
        code({
          title: 'Graceful shutdown',
          code: dedent(`
            const server = app.listen(3000);

            process.on('SIGTERM', () => {
              server.close(async () => {   // stop accepting new requests, finish in-flight ones
                await pool.end();          // then close all DB connections
                process.exit(0);
              });
            });
          `),
          expectedOutput: '(on SIGTERM: in-flight requests finish, pool closes, process exits 0)',
          explanation: ['Ending the pool before the server closes would make in-flight queries fail.'],
        }),
      ),
      section('real-world', 'In a real backend',
        bullets(
          'Keep SQL in a repository/data-access layer, not in route handlers.',
          'Manage schema with migration files (node-pg-migrate, Knex, Prisma Migrate, plain SQL + a runner) checked into git.',
          'Use `snake_case` columns and map to camelCase at the repository boundary (`SELECT created_at AS "createdAt"`).',
          'Set `statement_timeout` (per role or via `options: \'-c statement_timeout=5000\'`) so runaway queries cannot hold connections forever.',
        ),
      ),
      section('mistakes', 'Common mistakes',
        bullets(
          'Building SQL with template literals and user input (SQL injection) — use `$1` placeholders.',
          'Doing arithmetic on bigint/numeric strings: `"5" + 1 === "51"`.',
          'Leaking DB error messages (table names, constraint names) to API clients.',
          'Disabling TLS verification (`rejectUnauthorized: false`) in production.',
        ),
        code({
          title: 'Wrong vs right: bigint handling',
          language: 'javascript',
          code: dedent(`
            const { rows } = await pool.query('SELECT count(*) AS n FROM users');
            console.log(rows[0].n + 1);          // ❌ "8421" (string concatenation)
            console.log(Number(rows[0].n) + 1);  // ✅ 843 (safe for counts)

            // Or cast in SQL for small values:
            // SELECT count(*)::int AS n FROM users
          `),
          expectedOutput: '8421\n843',
          explanation: ['`count(*)` is bigint → string "842". Convert explicitly, or use `::int` when values are guaranteed to fit.'],
        }),
      ),
      section('interview', 'Interview angle',
        interviewTip('Interviewers like hearing that `pg` returns bigint and numeric as strings and why.'),
        interviewTip('Show you map database errors by SQLSTATE code rather than parsing messages.'),
      ),
      section('practice', 'Practice',
        steps(
          'Build `GET /products?category=` and `POST /products` with pg, returning 400 for invalid input and 409 for duplicate SKU.',
          'Add a `statement_timeout` of 3 s and test with `SELECT pg_sleep(5)`.',
          'Implement graceful shutdown and verify with `kill -TERM`.',
        ),
      ),
      section('summary', 'Summary',
        bullets(
          '`pg` (node-postgres) is the standard third-party Postgres driver.',
          'One Pool per process, config from env, TLS in production.',
          'Use `$n` parameters, `RETURNING`, and SQLSTATE codes for error mapping.',
          'bigint/numeric come back as strings; timestamptz as Date; jsonb as objects.',
          'Close the pool after the HTTP server on shutdown.',
        ),
      ),
    ],
    revisionNotes: [
      '`npm i pg`; `new pg.Pool({ connectionString })`.',
      'result.rows (array of objects), result.rowCount (affected rows).',
      'int8 & numeric → string by default; override with pg.types.setTypeParser.',
      'SQLSTATE: 23505 unique, 23503 FK, 23502 not-null, 22P02 invalid text representation, 40001 serialization.',
      'Shutdown: server.close() → pool.end().',
      'pg.Client for single connection / LISTEN; Pool for apps.',
    ],
    quiz: [
      {
        kind: 'predict-output', difficulty: 'intermediate',
        prompt: 'With default node-postgres settings, what is logged?',
        code: "const { rows } = await pool.query('SELECT 41::bigint AS n');\nconsole.log(typeof rows[0].n, rows[0].n + 1);",
        options: ['number 42', 'string 411', 'bigint 42n', 'string 42'],
        answer: 1,
        explanation: 'int8 is returned as a string to avoid precision loss, so + 1 concatenates to "411".',
      },
      {
        kind: 'mcq', difficulty: 'beginner',
        prompt: 'Which statement about the `pg` package is correct?',
        options: ['It is built into Node.js core as node:pg', 'It is a third-party package (node-postgres) installed from npm', 'It only works with MongoDB', 'It requires an ORM to function'],
        answer: 1,
        explanation: 'Node core has no database drivers; pg is installed with npm install pg and works without any ORM.',
      },
      {
        kind: 'complete-code', difficulty: 'intermediate',
        prompt: 'Return the generated id from the insert in a single round trip.',
        code: "const { rows } = await pool.query(\n  'INSERT INTO posts (title) VALUES ($1) /* ??? */',\n  [title],\n);\nconsole.log(rows[0].id);",
        options: ['OUTPUT id', 'RETURNING id', 'SELECT LAST_INSERT_ID()', 'GET id'],
        answer: 1,
        explanation: 'Postgres uses RETURNING. OUTPUT is SQL Server and LAST_INSERT_ID() is MySQL.',
      },
    ],
    interview: [
      {
        category: 'express-backend', kind: 'concept', difficulty: 'intermediate', topic: 'PostgreSQL in Node',
        question: 'Why does node-postgres return bigint and numeric columns as strings, and how do you deal with it?',
        shortAnswer: 'JavaScript numbers are 64-bit floats that lose precision above 2^53 − 1 and cannot represent exact decimals, so pg returns them as strings; convert deliberately (Number for safe ranges, BigInt, or a decimal library) or cast in SQL.',
        detailedAnswer: [
          'int8 max is 9.2e18, beyond Number.MAX_SAFE_INTEGER (9.0e15).',
          'numeric(12,2) money values would gain float rounding errors as numbers.',
          'Options: `count(*)::int`, `pg.types.setTypeParser(20, BigInt)`, or a decimal library for money.',
          'APIs often send ids as strings anyway to stay safe in JS clients.',
        ],
        followUp: 'How would you return money values in a JSON API safely?',
        trap: 'Globally parsing int8 with parseInt — silently corrupts large ids.',
      },
      {
        category: 'express-backend', kind: 'concept', difficulty: 'intermediate', topic: 'PostgreSQL in Node',
        question: 'How should an Express API translate PostgreSQL errors into HTTP responses?',
        shortAnswer: 'Inspect `err.code` (SQLSTATE) in the data layer or error middleware: map constraint violations like 23505 to 409 and invalid input like 22P02/23502 to 400, and send everything else as a generic 500 while logging details server-side.',
        detailedAnswer: [
          'SQLSTATE codes are stable; error message text is not.',
          '`err.constraint` tells you which constraint failed, e.g. users_email_key.',
          'Wrap them in domain errors (ConflictError) so controllers stay DB-agnostic.',
          'Never echo raw DB messages to clients — they reveal schema details.',
        ],
        followUp: 'Where in the layered architecture should this mapping live?',
        trap: 'Matching on error message strings, which change between versions and locales.',
      },
    ],
  },
};

export default content;
