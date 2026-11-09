import { Database, Inbox, Server, Skull, Zap } from 'lucide-react';
import { Arrow, Box, FlowRow, Frame, Label, Legend, Tag, Travel } from './primitives';
import { cx } from './tokens';

/* ================================================================================================ */
/* connection-pool                                                                                   */
/* ================================================================================================ */

const CONNS = [
  { id: 1, busy: 'req #1' },
  { id: 2, busy: 'req #3' },
  { id: 3, busy: null },
  { id: 4, busy: 'req #4' },
];

export function ConnectionPool() {
  return (
    <Frame label="Database connection pool. Many concurrent HTTP requests share a fixed set of four open database connections. A request acquires a connection, runs its query and releases it back to the pool. Three connections are busy and one is idle; when all are busy, extra requests wait in a queue until a connection is released or the acquire timeout fires. Opening connections once avoids paying the TCP, TLS and authentication cost on every query.">
      <div className="flex flex-col gap-2 md:flex-row md:items-stretch">
        <div className="md:w-36">
          <Label className="mb-1.5">Incoming requests</Label>
          <div className="grid grid-cols-4 gap-1 md:grid-cols-2">
            {[1, 2, 3, 4, 5, 6, 7, 8].map((r) => (
              <span
                key={r}
                className={cx(
                  'rounded border px-1 py-0.5 text-center font-mono text-[10px]',
                  r >= 6 ? 'border-dashed border-warn/60 text-warn' : 'border-line bg-surface text-muted',
                )}
              >
                #{r}
              </span>
            ))}
          </div>
          <div className="mt-1.5 text-[10px] leading-snug text-warn">#6–#8 wait in the queue (all connections busy or acquiring)</div>
        </div>
        <Arrow label="acquire" />
        <div className="min-w-0 flex-1 rounded-lg border border-accent/50 bg-accent/5 p-2">
          <div className="mb-1.5 flex flex-wrap items-center justify-between gap-1">
            <Label>Pool</Label>
            <span className="flex gap-1">
              <Tag tone="accent">max: 4</Tag>
              <Tag>idleTimeoutMillis</Tag>
            </span>
          </div>
          <div className="space-y-1">
            {CONNS.map((c) => (
              <div key={c.id} className="flex items-center gap-2 rounded-md border border-line bg-surface px-2 py-1">
                <span className="font-mono text-[11px] text-faint">conn {c.id}</span>
                <div className="relative h-1.5 flex-1 rounded-full bg-raised">
                  {c.busy && <Travel tone="accent" duration={1.8 + c.id * 0.3} />}
                </div>
                {c.busy ? <Tag tone="accent">{c.busy}</Tag> : <Tag>idle</Tag>}
              </div>
            ))}
          </div>
          <div className="mt-1.5 text-[10px] text-muted">query done → <span className="font-mono">client.release()</span> → next waiter gets the connection</div>
        </div>
        <Arrow label="TCP" />
        <Box tone="info" icon={<Database size={14} />} className="md:w-32" title="PostgreSQL" sub="max_connections is shared by every app instance" />
      </div>
      <pre className="mt-3 overflow-x-auto rounded-lg border border-line bg-code px-3 py-2 font-mono text-[11px] leading-5 text-muted">
{`const pool = new Pool({ max: 4, idleTimeoutMillis: 30_000, connectionTimeoutMillis: 2_000 });
const { rows } = await pool.query('SELECT * FROM users WHERE id = $1', [id]); // acquire + release`}
      </pre>
    </Frame>
  );
}

/* ================================================================================================ */
/* cache-aside                                                                                       */
/* ================================================================================================ */

export function CacheAside() {
  return (
    <Frame label="Cache-aside (lazy loading) pattern. 1: The app first looks up the key in Redis. On a hit, the cached value is returned in about a millisecond. On a miss: 2, the app queries the database; 3, it writes the result into Redis with a TTL; 4, it returns the value. On writes, the app updates the database and then deletes the cache key so the next read repopulates it.">
      <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] md:items-center">
        <Box tone="accent" icon={<Server size={14} />} title="Node app" sub="getUser(42)" className="md:row-span-2" />
        <div className="flex flex-col gap-1 md:gap-3">
          <div className="flex items-center gap-1.5 text-[11px]">
            <span className="font-mono text-accent">1</span>
            <span className="text-muted">GET user:42</span>
            <span className="relative h-px w-12 flex-1 bg-line md:w-16 md:flex-none">
              <Travel tone="accent" duration={2} />
            </span>
          </div>
          <div className="flex items-center gap-1.5 text-[11px]">
            <span className="font-mono text-info">2</span>
            <span className="text-muted">on miss: SELECT</span>
            <span className="relative h-px w-12 flex-1 bg-line md:w-16 md:flex-none">
              <Travel tone="info" duration={2} delay={1} />
            </span>
          </div>
        </div>
        <div className="space-y-2">
          <Box tone="danger" icon={<Zap size={14} />} title="Redis cache" sub="in-memory · key → JSON · TTL">
            <div className="mt-1 flex flex-wrap gap-1">
              <Tag tone="accent">hit → return (~1 ms)</Tag>
              <Tag tone="warn">miss → go to DB</Tag>
            </div>
          </Box>
          <Box tone="info" icon={<Database size={14} />} title="Database" sub="source of truth (~5–50 ms)" />
        </div>
      </div>
      <ol className="mt-3 grid gap-1.5 text-xs sm:grid-cols-2">
        {[
          ['1', 'GET key from cache', 'hit? return it — done', 'accent'],
          ['2', 'miss → query the database', 'SELECT … WHERE id = 42', 'info'],
          ['3', 'populate the cache', "SET user:42 <json> EX 300", 'danger'],
          ['4', 'return the value', 'next read is a hit until TTL expires', 'accent'],
        ].map(([n, t, d, tone]) => (
          <li key={n} className="flex gap-2 rounded-lg border border-line bg-surface px-2.5 py-1.5">
            <span className={cx('font-mono font-semibold', tone === 'info' ? 'text-info' : tone === 'danger' ? 'text-danger' : 'text-accent')}>{n}</span>
            <div className="min-w-0">
              <div className="font-medium text-ink">{t}</div>
              <div className="break-words font-mono text-[10px] text-muted">{d}</div>
            </div>
          </li>
        ))}
      </ol>
      <div className="mt-2 rounded-lg border border-warn/50 bg-warn/10 px-3 py-1.5 text-[11px] text-muted">
        <span className="font-semibold text-warn">On write:</span> UPDATE the database, then <span className="font-mono">DEL user:42</span> (invalidate, don't update) — the next read repopulates. TTL bounds staleness if an invalidation is missed.
      </div>
    </Frame>
  );
}

/* ================================================================================================ */
/* queue-worker                                                                                      */
/* ================================================================================================ */

export function QueueWorker() {
  return (
    <Frame label="Background job queue. The API (producer) adds a job such as send-email to a Redis-backed queue, for example BullMQ, and responds to the user immediately with 202 Accepted. Jobs wait in the queue. Worker processes pull jobs and process several concurrently. A completed job is marked done. A failed job is retried with exponential backoff, for example 1 second and then 2 seconds later. After the maximum number of attempts it moves to the failed set, the dead-letter queue, for inspection and manual replay.">
      <FlowRow>
        <Box tone="accent" icon={<Server size={14} />} className="md:w-36" title="Producer (API)">
          <div className="mt-1 font-mono text-[10px] leading-snug text-muted">queue.add('send-email', data, {'{ attempts: 3 }'})</div>
          <Tag tone="accent" className="mt-1">202 Accepted</Tag>
        </Box>
        <Arrow label="enqueue" />
        <div className="min-w-0 flex-1 rounded-lg border border-danger/50 bg-danger/5 p-2">
          <div className="mb-1.5 flex items-center gap-1.5">
            <Inbox size={14} className="text-danger" aria-hidden />
            <span className="text-sm font-semibold">Redis queue</span>
            <span className="text-[10px] text-faint">BullMQ</span>
          </div>
          <div className="relative flex gap-1 overflow-hidden rounded-md border border-line bg-surface p-1">
            {['job 9', 'job 8', 'job 7', 'job 6'].map((j) => (
              <span key={j} className="rounded border border-line bg-raised px-1.5 py-0.5 font-mono text-[10px] text-muted">{j}</span>
            ))}
            <Travel tone="danger" duration={2.5} />
          </div>
          <div className="mt-1 text-[10px] text-faint">waiting → active → completed / failed</div>
        </div>
        <Arrow label="pull" />
        <div className="space-y-1 md:w-40">
          {[1, 2].map((w) => (
            <Box key={w} tone="info" title={`Worker ${w}`} sub="concurrency: 5" />
          ))}
        </div>
      </FlowRow>
      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        <Box tone="accent" title="✓ completed" sub="result stored, removed after N jobs" />
        <Box tone="warn" title="↻ retry with backoff" sub="attempt 2 after 1s, attempt 3 after 2s (exponential)" />
        <Box tone="danger" icon={<Skull size={14} />} title="Dead-letter / failed set" sub="attempts exhausted → inspect, alert, replay manually" />
      </div>
      <Legend
        items={[
          { tone: 'warn', label: 'jobs must be idempotent — a retry may repeat side effects' },
        ]}
      />
    </Frame>
  );
}
