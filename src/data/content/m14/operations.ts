import type { ModuleContent } from '../../../types';
import { bullets, code, dedent, flow, interviewTip, note, section, steps, table, text, warn } from '../helpers';

const content: Partial<ModuleContent> = {
  'database-migrations': {
    summary: 'Migrations are versioned, ordered scripts that evolve the database schema; in production they run automatically before deploys and follow expand-and-contract so old and new code versions both work during rollout.',
    topics: ['migration up/down', 'schema versioning', 'expand and contract', 'backfill', 'Prisma migrate', 'Knex', 'node-pg-migrate', 'locking'],
    sections: [
      section('introduction', undefined,
        text('Code changes go through git and CI; schema changes must too. Running `ALTER TABLE` by hand in production is how environments drift and outages happen.'),
      ),
      section('definition', 'What a migration is',
        bullets(
          'A file with an **up** (apply) and usually a **down** (revert) step, named with a timestamp or sequence number.',
          'The tool records applied migrations in a table (e.g. `knex_migrations`, `pgmigrations`, `_prisma_migrations`).',
          'Running migrations applies only the pending ones, in order, typically inside a transaction (Postgres supports transactional DDL).',
          'Tools (third-party): Prisma Migrate, Knex, node-pg-migrate, TypeORM, Sequelize CLI, Flyway/Liquibase.',
        ),
      ),
      section('why', 'Why discipline matters in production',
        bullets(
          'During a rolling deploy, **old and new app versions run at the same time** against one database.',
          'A migration that renames or drops a column breaks the old version immediately.',
          'Long table locks (e.g. adding a column with a volatile default on old Postgres versions, creating an index without `CONCURRENTLY`) block traffic.',
          'Rollback of code must be possible without rolling back the schema.',
        ),
      ),
      section('internals', 'Expand and contract (parallel change)',
        steps(
          '**Expand**: add new structures in a backward-compatible way — new nullable column, new table, new index (`CREATE INDEX CONCURRENTLY`).',
          '**Migrate code**: deploy app that writes to both old and new, reads new with fallback.',
          '**Backfill**: copy old data into new structure in batches (a job, not one giant UPDATE).',
          '**Switch**: deploy app that reads/writes only the new structure.',
          '**Contract**: in a later release, once no running version uses it, drop the old column.',
        ),
        table('Safe vs dangerous changes', ['Change', 'Safe approach'], [
          ['Rename column', 'Add new column → dual-write → backfill → switch reads → drop old'],
          ['Add NOT NULL column', 'Add nullable (or with constant default) → backfill → add constraint (`NOT VALID` then `VALIDATE`)'],
          ['Add index on big table', '`CREATE INDEX CONCURRENTLY` (cannot run inside a transaction)'],
          ['Drop column', 'Stop using it in code first; drop in a later release'],
          ['Change column type', 'New column + backfill, not in-place `ALTER TYPE` on a hot table'],
        ]),
        warn('`down` migrations are useful in development, but in production a roll-forward fix is usually safer — a down that drops a column destroys data written since the up.'),
      ),
      section('visual', 'Migrations in the pipeline',
        flow(['CI: tests run migrations on a fresh DB', 'Deploy step: migrate (one job, with lock)', 'Rolling deploy of new code', 'Later release: contract migration'],
          { title: 'Migrate before the new code receives traffic', direction: 'horizontal' }),
      ),
      section('example', 'Migration files',
        code({
          title: 'Knex migration: expand step (third-party)',
          code: dedent(`
            // migrations/20250301120000_add_full_name.js
            exports.up = async (knex) => {
              await knex.schema.alterTable('users', (t) => {
                t.string('full_name').nullable(); // expand: nullable, old code unaffected
              });
            };

            exports.down = async (knex) => {
              await knex.schema.alterTable('users', (t) => t.dropColumn('full_name'));
            };
          `),
          expectedOutput: '$ npx knex migrate:latest\nBatch 7 run: 1 migrations',
          explanation: [
            'Old code ignores the new column; new code can start writing it.',
            'Knex records the file in `knex_migrations` so it never runs twice.',
          ],
        }),
        code({
          title: 'Concurrent index with node-pg-migrate (third-party)',
          code: dedent(`
            // migrations/1740830400000_orders-created-at-idx.js
            exports.shorthands = undefined;
            exports.up = (pgm) => {
              pgm.noTransaction(); // CONCURRENTLY cannot run in a transaction
              pgm.createIndex('orders', 'created_at', { concurrently: true, ifNotExists: true });
            };
            exports.down = (pgm) => {
              pgm.noTransaction();
              pgm.dropIndex('orders', 'created_at', { concurrently: true, ifExists: true });
            };
          `),
          expectedOutput: '> Migrating files:\n> - 1740830400000_orders-created-at-idx\n### MIGRATION 1740830400000_orders-created-at-idx (UP) ###\nCREATE INDEX CONCURRENTLY IF NOT EXISTS "orders_created_at_index" ON "orders" ("created_at");\nMigrations complete!',
          explanation: ['Building the index concurrently avoids blocking writes on a large table.'],
        }),
        code({
          title: 'Dual-read during expand-and-contract (runnable simulation)',
          code: dedent(`
            const rows = [
              { id: 1, name: 'Ada Lovelace', full_name: null },     // old row
              { id: 2, name: 'Alan Turing', full_name: 'Alan Turing' }, // written by new code
            ];
            const readOld = (r) => r.name;                    // version 1 still running
            const readNew = (r) => r.full_name ?? r.name;     // version 2 with fallback

            // backfill in batches
            for (const r of rows) if (r.full_name === null) r.full_name = r.name;

            console.log(rows.map(readOld).join(', '));
            console.log(rows.map(readNew).join(', '));
          `),
          expectedOutput: 'Ada Lovelace, Alan Turing\nAda Lovelace, Alan Turing',
          explanation: [
            'Both app versions return correct data at every phase.',
            'Only after no version reads `name` can it be dropped (contract).',
          ],
          runnable: true,
        }),
        code({
          title: 'Prisma (third-party): dev vs deploy',
          language: 'bash',
          code: dedent(`
            npx prisma migrate dev --name add_full_name   # dev: create + apply + generate client
            npx prisma migrate deploy                      # CI/prod: apply pending only, never generates new ones
          `),
          expectedOutput: '1 migration found in prisma/migrations\nApplying migration `20250301120000_add_full_name`\nAll migrations have been successfully applied.',
          explanation: ['Never run `migrate dev` against production — it can prompt to reset the database.'],
        }),
      ),
      section('real-world', 'In a real backend',
        bullets(
          'A dedicated pipeline job (or Kubernetes Job / ECS one-off task) runs `migrate deploy` once, before the rolling update.',
          'Tools take an advisory lock so two concurrent deploys do not run migrations simultaneously.',
          'Set `lock_timeout` / `statement_timeout` in migrations so a blocked DDL fails fast instead of queueing all traffic behind it.',
          'Large backfills run as background jobs in batches with progress tracking.',
        ),
      ),
      section('mistakes', 'Common mistakes',
        code({
          title: 'Renaming in one step',
          language: 'sql',
          code: dedent(`
            -- ❌ old pods still SELECT name → errors during rollout
            ALTER TABLE users RENAME COLUMN name TO full_name;

            -- ✅ expand now, contract in a later release
            ALTER TABLE users ADD COLUMN full_name text;
            -- ...dual-write, backfill, switch reads...
            -- later: ALTER TABLE users DROP COLUMN name;
          `),
          explanation: ['Every schema change must be compatible with the version currently running.'],
        }),
        bullets(
          'Running migrations on app startup in every replica (races; slow boots).',
          'Editing a migration that has already run in production.',
          'Relying on `down` to recover from a bad deploy.',
        ),
      ),
      section('interview', 'Interview angle',
        interviewTip('Walk through renaming a column with zero downtime using expand-and-contract, and say where migrations run in your pipeline.'),
      ),
      section('practice', 'Practice',
        text('Plan the migrations and app releases to split `users.address` (text) into `street`, `city`, `postcode` without downtime. List each release and what it deploys.'),
      ),
      section('summary', 'Summary',
        bullets(
          'Versioned, ordered, recorded schema changes.',
          'Run once per deploy in CI/CD, before new code takes traffic.',
          'Expand → migrate code → backfill → switch → contract.',
          'Avoid long locks; prefer roll-forward over down in production.',
        ),
      ),
    ],
    revisionNotes: [
      'Old and new code share one DB during rollout → backward-compatible schema.',
      'Expand-and-contract for renames/type changes/NOT NULL.',
      'CREATE INDEX CONCURRENTLY (no transaction).',
      'prisma migrate deploy in prod; migrate dev only locally.',
      'Never edit applied migrations; roll forward.',
      'One migration job per deploy, with a lock and lock_timeout.',
    ],
    quiz: [
      {
        kind: 'scenario', difficulty: 'advanced',
        prompt: 'You must rename `users.name` to `users.full_name` with a rolling deploy. What is the safest first release?',
        options: [
          'ALTER TABLE ... RENAME COLUMN and deploy new code at the same time',
          'Add `full_name` as a nullable column and deploy code that writes both columns',
          'Drop `name` and recreate it as `full_name`',
          'Take the site down and rename',
        ],
        answer: 1,
        explanation: 'Expand first: old instances keep using name while new ones dual-write. Renaming immediately breaks old instances still running mid-rollout.',
      },
      {
        kind: 'mcq', difficulty: 'intermediate',
        prompt: 'Where should production migrations run?',
        options: [
          'In every app replica on startup',
          'Manually from a developer laptop',
          'As a single pipeline/job step before the new version receives traffic',
          'After all replicas are updated',
        ],
        answer: 2,
        explanation: 'A single controlled step avoids races between replicas and ensures the expanded schema exists before new code needs it.',
      },
    ],
    interview: [
      {
        category: 'advanced', kind: 'scenario', difficulty: 'advanced', topic: 'Migrations',
        question: 'How would you rename a heavily used database column without downtime?',
        shortAnswer: 'Use expand-and-contract: add the new column, deploy code that writes both and reads new-with-fallback, backfill in batches, switch reads and writes to the new column, then drop the old column in a later release.',
        detailedAnswer: [
          'Rolling deploys mean two code versions coexist.',
          'Expand: nullable new column (or view/trigger for sync).',
          'Dual-write release; batched backfill job.',
          'Switch release: only new column used.',
          'Contract release: drop old column after verifying no reads.',
          'Each step is independently rollback-safe.',
        ],
        followUp: 'How would you keep both columns in sync if writes also come from other services?',
        trap: 'Doing a single RENAME COLUMN in the same deploy as the code change.',
      },
      {
        category: 'advanced', kind: 'concept', difficulty: 'advanced', topic: 'Migrations',
        question: 'Why are down migrations rarely used to roll back production, and what do you do instead?',
        shortAnswer: 'Down migrations can destroy data written since the up and may lock tables, so production failures are handled by rolling the code back to a version compatible with the current schema and rolling forward with a fix.',
        detailedAnswer: [
          'Dropping a column added by `up` loses new data.',
          'Schema changes are designed to be backward compatible, so code rollback alone works.',
          'Fix-forward migrations are reviewed and tested like any change.',
          'Downs remain useful locally and in CI to test reversibility.',
        ],
        followUp: 'What makes a migration impossible to reverse?',
        trap: 'Treating `migrate:rollback` as the standard incident response.',
      },
    ],
  },

  'health-checks': {
    summary: 'Health endpoints let orchestrators and load balancers decide whether to restart a process (liveness, `/healthz`) and whether to send it traffic (readiness, `/readyz`); readiness checks dependencies with timeouts, liveness stays cheap.',
    topics: ['liveness', 'readiness', 'startup probe', '/healthz', '/readyz', 'dependency checks', 'timeouts', 'Kubernetes probes'],
    sections: [
      section('introduction', undefined,
        text('A process can be running yet useless — stuck event loop, lost DB connection, still warming up. Health checks expose that so the platform can stop routing traffic or restart the instance automatically.'),
      ),
      section('definition', 'Liveness vs readiness',
        table('Probe types', ['', 'Liveness (`/healthz`, `/livez`)', 'Readiness (`/readyz`)', 'Startup'], [
          ['Question', 'Is the process alive / not deadlocked?', 'Can it serve traffic right now?', 'Has it finished booting?'],
          ['On failure', 'Restart the container', 'Remove from load balancer (no restart)', 'Delay other probes; restart if never ready'],
          ['Checks', 'Event loop responds; no dependencies', 'DB, cache, required downstreams (with timeouts)', 'Initial migrations/warm-up done'],
          ['Cost', 'Trivial', 'Small, bounded by timeouts', 'Small'],
        ]),
      ),
      section('why', 'Why separate them',
        bullets(
          'If liveness checked the database, a DB outage would make every pod restart in a loop — making recovery worse.',
          'Readiness turning false during shutdown drains traffic before the process exits.',
          'Load balancers use readiness-style checks to pick healthy targets.',
        ),
      ),
      section('internals', 'Designing the checks',
        steps(
          'Liveness: return 200 immediately; if the event loop is blocked, the request simply times out → probe fails.',
          'Readiness: run dependency checks **in parallel**, each with a short timeout (e.g. 500 ms).',
          'Return `503` with a JSON body naming the failing dependency.',
          'Cache results for a second or two if probes are frequent.',
          'Set readiness to false as the first step of graceful shutdown.',
          'Do not include optional dependencies (e.g. analytics) — degrade instead.',
        ),
        note('Docker `HEALTHCHECK` only marks a container unhealthy (Compose/Swarm can act on it); Kubernetes ignores it and uses `livenessProbe`/`readinessProbe`/`startupProbe`.'),
      ),
      section('visual', 'Probe decisions',
        flow(['Probe GET /readyz', 'Check DB + Redis in parallel (timeout 500ms)', '200: keep in rotation | 503: remove from LB', 'GET /healthz fails repeatedly → restart'],
          { title: 'What the platform does with each probe' }),
      ),
      section('example', 'Endpoints and probes',
        code({
          title: 'Readiness with parallel checks and timeouts (runnable simulation)',
          code: dedent(`
            const withTimeout = (p, ms, name) =>
              Promise.race([p, new Promise((_, reject) =>
                setTimeout(() => reject(new Error(name + ' timeout')), ms))]);

            const checks = {
              db: () => new Promise((resolve) => setTimeout(resolve, 10)),     // healthy
              redis: () => new Promise((resolve) => setTimeout(resolve, 500)), // hanging
            };

            async function readiness() {
              const names = Object.keys(checks);
              const results = await Promise.allSettled(names.map((n) => withTimeout(checks[n](), 100, n)));
              const status = {};
              names.forEach((n, i) => {
                status[n] = results[i].status === 'fulfilled' ? 'up' : 'down: ' + results[i].reason.message;
              });
              const ok = Object.values(status).every((s) => s === 'up');
              console.log(ok ? 200 : 503, JSON.stringify(status));
            }
            readiness();
          `),
          expectedOutput: '503 {"db":"up","redis":"down: redis timeout"}',
          explanation: [
            '`Promise.allSettled` runs all checks in parallel and never short-circuits.',
            '`Promise.race` with a timer bounds each check at 100 ms — a hanging dependency cannot hang the probe.',
            'The response body explains *which* dependency failed.',
          ],
          runnable: true,
        }),
        code({
          title: 'Express endpoints',
          code: dedent(`
            let shuttingDown = false;

            app.get('/healthz', (req, res) => res.status(200).send('ok'));

            app.get('/readyz', async (req, res) => {
              if (shuttingDown) return res.status(503).json({ status: 'shutting down' });
              const [db, redis] = await Promise.allSettled([
                withTimeout(pool.query('SELECT 1'), 500, 'db'),
                withTimeout(redisClient.ping(), 500, 'redis'),
              ]);
              const ok = db.status === 'fulfilled' && redis.status === 'fulfilled';
              res.status(ok ? 200 : 503).json({ db: db.status, redis: redis.status });
            });

            process.on('SIGTERM', () => { shuttingDown = true; /* then drain + close */ });
          `),
          expectedOutput: '$ curl -s -w " %{http_code}" localhost:3000/readyz\n{"db":"fulfilled","redis":"fulfilled"} 200',
          explanation: [
            'Liveness has no dependencies.',
            'Readiness reports 503 while shutting down so the LB drains this instance.',
            'Keep these routes out of auth middleware and out of request logs (noise).',
          ],
        }),
        code({
          title: 'Kubernetes probes',
          language: 'yaml',
          code: dedent(`
            livenessProbe:
              httpGet: { path: /healthz, port: 3000 }
              periodSeconds: 10
              failureThreshold: 3
            readinessProbe:
              httpGet: { path: /readyz, port: 3000 }
              periodSeconds: 5
              failureThreshold: 2
            startupProbe:
              httpGet: { path: /healthz, port: 3000 }
              periodSeconds: 2
              failureThreshold: 30   # up to 60s to boot
          `),
          explanation: [
            'Startup probe protects slow-booting apps from being killed by liveness.',
            'Readiness fails fast (2 × 5 s) to pull an instance from rotation quickly.',
          ],
        }),
      ),
      section('real-world', 'In a real backend',
        bullets(
          'Cloud load balancer target groups use `/readyz` with a healthy/unhealthy threshold.',
          'Deep diagnostics (`/health/details` with versions, queue depth) live behind auth for operators.',
          'Some teams add an event-loop-lag check to readiness (e.g. fail if lag > 1 s).',
        ),
      ),
      section('mistakes', 'Common mistakes',
        code({
          title: 'Dependency checks in liveness',
          code: dedent(`
            // ❌ DB blip → every pod restarts → thundering herd on recovery
            app.get('/healthz', async (req, res) => { await pool.query('SELECT 1'); res.send('ok'); });
            // ✅ liveness is trivial; dependencies belong in readiness
            app.get('/healthz', (req, res) => res.send('ok'));
          `),
          explanation: ['Restarting does not fix a database outage; it adds load when the DB comes back.'],
        }),
        bullets(
          'No timeouts — a hung dependency makes the probe hang and time out unpredictably.',
          'Always returning 200 from a static route.',
          'Health routes behind authentication, so probes get 401.',
        ),
      ),
      section('interview', 'Interview angle',
        interviewTip('Explain liveness vs readiness by *what the platform does on failure* (restart vs stop routing), and why DB checks never go in liveness.'),
      ),
      section('practice', 'Practice',
        text('Add `/healthz` and `/readyz` to an Express app; stop the Postgres container and confirm readiness returns 503 within one second while liveness stays 200.'),
      ),
      section('summary', 'Summary',
        bullets(
          'Liveness → restart; readiness → routing; startup → boot grace.',
          'Liveness trivial; readiness checks dependencies in parallel with timeouts.',
          'Readiness false first during shutdown.',
          'Return 503 + JSON details on failure.',
        ),
      ),
    ],
    revisionNotes: [
      'Liveness failure = restart; readiness failure = removed from LB.',
      'Never check the DB in liveness.',
      'Promise.allSettled + per-check timeout.',
      'Startup probe for slow boots.',
      'Docker HEALTHCHECK ignored by Kubernetes.',
    ],
    quiz: [
      {
        kind: 'scenario', difficulty: 'intermediate',
        prompt: 'During a 2-minute database outage, all API pods restart repeatedly and recovery is slow. What is the likely cause?',
        options: [
          'The readiness probe checks the database',
          'The liveness probe checks the database, so pods are killed instead of just removed from rotation',
          'The database has too many indexes',
          'Probes are disabled',
        ],
        answer: 1,
        explanation: 'Failing liveness triggers restarts; failing readiness only stops traffic. Dependency checks belong in readiness.',
      },
      {
        kind: 'predict-output', difficulty: 'intermediate',
        prompt: 'What does this print?',
        code: "const t = (ms, v) => new Promise(r => setTimeout(() => r(v), ms));\nconst timeout = (ms) => new Promise((_, j) => setTimeout(() => j(new Error('timeout')), ms));\nPromise.race([t(200, 'ok'), timeout(50)]).then(console.log, (e) => console.log(e.message));",
        options: ['ok', 'timeout', 'undefined', 'ok then timeout'],
        answer: 1,
        explanation: 'The 50 ms rejection settles first, so race rejects with "timeout". The later resolve is ignored.',
      },
    ],
    interview: [
      {
        category: 'advanced', kind: 'concept', difficulty: 'intermediate', topic: 'Health checks',
        question: 'What is the difference between liveness and readiness probes?',
        shortAnswer: 'Liveness answers "should this process be restarted?" and stays dependency-free; readiness answers "should this instance receive traffic now?" and checks critical dependencies.',
        detailedAnswer: [
          'Liveness failure → container restart.',
          'Readiness failure → removed from Service/LB endpoints, not restarted.',
          'Readiness is false during boot and shutdown.',
          'Startup probe delays liveness for slow initialisation.',
        ],
        followUp: 'Should readiness fail if an optional downstream like a recommendation service is down?',
        trap: 'Using the same endpoint with DB checks for both probes.',
      },
      {
        category: 'advanced', kind: 'scenario', difficulty: 'advanced', topic: 'Health checks',
        question: 'Design the readiness endpoint for an API that depends on Postgres, Redis and an optional third-party email service.',
        shortAnswer: 'Check Postgres and Redis in parallel with short timeouts, return 503 with details if either fails, exclude the optional email service (degrade and alert instead), and return 503 immediately once shutdown begins.',
        detailedAnswer: [
          'Critical deps only — an instance without email can still serve most requests.',
          '`Promise.allSettled` + per-check timeout (e.g. 300–500 ms).',
          'Small cache of results to avoid hammering deps with frequent probes.',
          'Shutdown flag flips readiness first, then drain.',
          'Expose richer diagnostics separately behind auth.',
          'Consider: if *all* instances fail readiness because the DB is down, the LB has no targets — still preferable to serving errors slowly? Decide per system.',
        ],
        followUp: 'What happens if every instance reports not ready at the same time?',
        trap: 'Making readiness depend on third-party APIs, so their outage takes your whole fleet out of rotation.',
      },
    ],
  },
};

export default content;
