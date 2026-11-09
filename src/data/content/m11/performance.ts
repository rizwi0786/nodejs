import type { ModuleContent } from '../../../types';
import {
  bullets, code, dedent, diagram, flow, interviewTip, note, section, steps, table, text, warn,
} from '../helpers';

const content: Partial<ModuleContent> = {
  // ───────────────────────────────────────────────────────────
  'performance-profiling': {
    summary: 'Profiling means measuring before optimizing: drive realistic load (autocannon), record CPU profiles (--cpu-prof, --prof, DevTools, clinic.js) and read flame graphs to find the functions that actually consume time.',
    topics: ['--cpu-prof', '--prof', '--prof-process', 'Chrome DevTools', '--inspect', 'flame graph', 'clinic.js', '0x', 'autocannon', 'load testing', '--heap-prof'],
    sections: [
      section('introduction', undefined,
        text("Guessing where time goes is almost always wrong. A profile under realistic load shows the two or three functions worth optimizing — and proves whether your change helped."),
      ),
      section('definition', 'Definition',
        table('Profiling toolbox', ['Tool', 'Core / third-party', 'Output', 'Best for'], [
          ['node --cpu-prof', 'Core (Node 12+)', '.cpuprofile file', 'CPU profile of a whole run; open in DevTools'],
          ['node --prof + --prof-process', 'Core (V8 tick profiler)', 'isolate-*.log → text report', 'Low-level ticks incl. C++/GC'],
          ['--inspect + Chrome DevTools', 'Core', 'Interactive profiler, heap tools', 'Ad-hoc profiling of a running process'],
          ['node --heap-prof', 'Core', '.heapprofile', 'Allocation sampling'],
          ['clinic doctor / flame / bubbleprof', 'Third-party (clinic.js)', 'HTML reports', 'Guided diagnosis, flame graphs'],
          ['0x', 'Third-party', 'Interactive flame graph', 'Quick flame graphs'],
          ['autocannon', 'Third-party', 'Req/s, latency percentiles', 'Generating HTTP load'],
        ]),
        note("clinic.js development has slowed in recent years; it still works for many apps, but the core `--cpu-prof` + DevTools path is always available."),
      ),
      section('why', 'Why',
        bullets(
          "Optimizations without a profile often target code that is 1% of runtime.",
          "Profiles reveal surprises: a logging serializer, a regex, `JSON.stringify` of huge objects, a validation library.",
          "Before/after measurements turn opinions into numbers for code review.",
        ),
      ),
      section('internals', 'How sampling profilers work',
        steps(
          "The profiler interrupts the thread at a fixed interval (≈1 ms by default) and records the current JS stack.",
          "Functions that appear in many samples are where time is spent (**self time**: on top of the stack; **total time**: anywhere in the stack).",
          "A **flame graph** stacks these samples: x-axis = share of samples (width = time, not chronological), y-axis = call depth.",
          "Look for **wide plateaus at the top** — functions burning CPU themselves.",
          "Sampling has low overhead (a few %), so you can profile under load — but very short functions can be missed.",
        ),
        flow(['Reproduce: load test with autocannon', 'Record: --cpu-prof or DevTools', 'Read: flame graph / bottom-up', 'Fix: the widest self-time frame', 'Re-measure: same load, compare p99 + req/s'], { title: 'Profiling loop', direction: 'horizontal' }),
      ),
      section('example', 'Recording profiles',
        code({
          title: 'CPU profile under load',
          language: 'bash',
          code: dedent(`
            # terminal 1: profile is written when the process exits
            node --cpu-prof --cpu-prof-dir=./profiles server.js

            # terminal 2: realistic load (autocannon — third-party)
            npx autocannon -c 50 -d 30 http://localhost:3000/api/search?q=node

            # stop the server with Ctrl+C, then open profiles/*.cpuprofile in
            # Chrome DevTools → Performance (or Sources → JavaScript Profiler)
          `),
          expectedOutput: "Running 30s test @ http://localhost:3000/api/search?q=node\n50 connections\n\nLatency  p50 18 ms  p97.5 61 ms  p99 88 ms\nReq/Sec  avg 2,710\n81k requests in 30.02s, 40 MB read\n\nprofiles/CPU.20261108.101500.4242.0.001.cpuprofile\n(illustrative numbers)",
          explanation: [
            'The server must exit cleanly (SIGINT handled) for the profile to be written.',
            'autocannon reports latency percentiles — always compare p99, not only averages.',
            'In DevTools, use **Bottom-Up** sorted by Self Time to find the hottest functions.',
          ],
        }),
        code({
          title: 'V8 tick profiler',
          language: 'bash',
          code: dedent(`
            node --prof server.js           # writes isolate-0x...-v8.log
            node --prof-process isolate-0x*-v8.log > profile.txt
            head -20 profile.txt
          `),
          expectedOutput: " [Summary]:\n   ticks  total  nonlib   name\n   8123   61.2%   64.0%  JavaScript\n   3011   22.7%   23.7%  C++\n    912    6.9%    7.2%  GC\n\n [Bottom up (heavy) profile]:\n   ticks parent  name\n   4210   31.7%  JS: *escapeHtml /app/src/render.js:12:20\n(illustrative)",
          explanation: [
            'The summary splits time between JS, C++ (Node/V8 internals, native modules) and GC.',
            'High GC share → reduce allocations; high C++ share → look at sync APIs, crypto, zlib.',
            '`*` before a name means optimized code (TurboFan); `~` means interpreted.',
          ],
        }),
        code({
          title: 'clinic.js (third-party)',
          language: 'bash',
          code: dedent(`
            npx clinic doctor --autocannon [ -c 50 /api/search ] -- node server.js
            npx clinic flame  --autocannon [ -c 50 /api/search ] -- node server.js
          `),
          explanation: ['`doctor` classifies the problem (event-loop blocking, I/O, GC); `flame` then produces a flame graph to pinpoint functions.'],
        }),
      ),
      section('real-world', 'Real-world backend usage',
        bullets(
          "Profile a staging replica with production-like data volume — small datasets hide O(n²) code.",
          "Attach to a live process: `kill -USR1 <pid>` enables the inspector on Linux/macOS, then connect DevTools via an SSH tunnel to port 9229 (never expose it publicly).",
          "Keep benchmark scripts in the repo (`npm run bench`) and run them in CI on hot endpoints.",
        ),
        warn("`--inspect=0.0.0.0` on a public interface gives remote code execution to anyone who can reach the port."),
      ),
      section('mistakes', 'Common mistakes',
        bullets(
          "Profiling without load — idle profiles show startup code, not the hot path.",
          "Comparing averages instead of p95/p99.",
          "Benchmarking on a laptop with other apps running, or with the load generator on the same cores as the server.",
          "Reading a flame graph as a timeline (x-axis is not time order).",
        ),
        code({
          title: 'Wrong vs right: micro-benchmark',
          code: dedent(`
            // Wrong: JIT may optimize away the unused result; one run; no warm-up
            console.time('x'); for (let i = 0; i < 1e6; i++) parse(input); console.timeEnd('x');

            // Right: measure the real endpoint under concurrency, multiple runs
            // npx autocannon -c 50 -d 30 http://localhost:3000/api/parse  (×3, compare p99)
          `),
        }),
      ),
      section('interview', 'Interview angle',
        interviewTip("Describe a loop: reproduce with load → profile → fix the widest self-time frame → re-measure p99. Naming `--cpu-prof`, DevTools and a load tool shows practical experience."),
      ),
      section('practice', 'Practice',
        text("Add a route that escapes HTML with a chain of 10 `.replace()` calls on a 1 MB string. Profile it, find it in the flame graph, replace with a single regex + map, and compare."),
      ),
      section('summary', 'Summary',
        bullets(
          "Measure first: load test + CPU profile.",
          "Core tools: --cpu-prof, --prof/--prof-process, --inspect + DevTools, --heap-prof.",
          "Third-party: clinic.js, 0x, autocannon.",
          "Flame graph width = time; look for wide top frames.",
        ),
      ),
    ],
    revisionNotes: [
      '--cpu-prof writes .cpuprofile on exit (Node 12+).',
      '--prof → isolate-*.log; analyze with node --prof-process.',
      'Flame graph: width = samples (time), y = stack depth, not chronological.',
      'Self time vs total time.',
      'autocannon -c <conns> -d <secs> for HTTP load (third-party).',
      'Never expose --inspect publicly.',
    ],
    quiz: [
      {
        kind: 'mcq', difficulty: 'intermediate',
        prompt: 'In a flame graph, what does the width of a frame represent?',
        options: ['When the function was called', 'The proportion of samples in which it was on the stack (time spent)', 'Memory allocated', 'Number of arguments'],
        answer: 1,
        explanation: 'Width is aggregated sample count. The x-axis is sorted (often alphabetically), not chronological.',
      },
      {
        kind: 'scenario', difficulty: 'advanced',
        prompt: 'The --prof-process summary shows GC at 35% of ticks. What is the most promising direction?',
        options: ['Increase UV_THREADPOOL_SIZE', 'Reduce allocation rate on the hot path (fewer temp objects/strings, streaming)', 'Add cluster workers', 'Disable the GC'],
        answer: 1,
        explanation: 'High GC share means the code allocates heavily. Fewer short-lived objects reduce scavenges. More processes would multiply the waste rather than fix it.',
      },
    ],
    interview: [
      {
        category: 'advanced', kind: 'scenario', difficulty: 'advanced', topic: 'Profiling',
        question: 'An endpoint\'s p99 latency doubled after a release. How do you find the cause?',
        shortAnswer: 'Reproduce with a load test against both versions, record CPU profiles under that load (--cpu-prof or DevTools), compare flame graphs to find the new hot frames, and confirm with before/after p99 measurements.',
        detailedAnswer: [
          'Check loop delay and GC metrics first to classify the problem.',
          'Diff the release for dependencies or new middleware (validation, logging).',
          'autocannon with the same concurrency against old and new builds.',
          'Bottom-up view sorted by self time; look for new wide frames.',
          'If it is I/O, use tracing/APM spans instead of a CPU profile.',
        ],
        followUp: 'How would you profile without restarting the production process?',
        trap: 'Jumping to "add more servers" without measuring.',
      },
      {
        category: 'advanced', kind: 'concept', difficulty: 'advanced', topic: 'Profiling',
        question: 'How do you read a flame graph, and what is the difference between self time and total time?',
        shortAnswer: 'Each bar is a stack frame, width proportional to how often it was sampled and children stacked above callers; self time counts samples where the function itself was executing on top, total time includes everything it called.',
        detailedAnswer: [
          'x-axis is not time order; it is merged samples.',
          'Wide frames at the top = high self time = optimization targets.',
          'Wide frames lower down with narrow children = time spread across callees.',
          'Use Bottom-Up for self time, Top-Down/Call Tree for total time.',
        ],
        followUp: 'Why might a very fast function never show up in a sampling profile?',
        trap: 'Reading left-to-right as chronological execution.',
      },
    ],
  },

  // ───────────────────────────────────────────────────────────
  'performance-optimization': {
    summary: 'The biggest Node wins are usually architectural: keep sync work out of the request path, stream large data, cache, reuse connections, send less JSON, compress, and paginate.',
    topics: ['sync APIs', 'streaming', 'caching', 'keep-alive', 'connection pooling', 'JSON payload size', 'compression', 'pagination', 'cursor pagination', 'N+1 queries'],
    sections: [
      section('introduction', undefined,
        text("After profiling tells you *where*, this lesson is the catalogue of *what* usually fixes it in a Node backend — ordered roughly by impact."),
      ),
      section('definition', 'Definition',
        table('Optimization checklist', ['Technique', 'Fixes', 'Typical gain'], [
          ['No sync APIs in request path', 'Blocked loop', 'Removes latency spikes for all users'],
          ['Streaming', 'Memory spikes, time-to-first-byte', 'Flat memory for any file/export size'],
          ['Caching', 'Repeated expensive reads', 'ms instead of 10s of ms per hit'],
          ['Connection reuse (keep-alive, DB pools)', 'TCP/TLS handshake per call', 'Saves 1–3 round trips per request'],
          ['Smaller JSON (select fields)', 'Serialization CPU + bandwidth', 'Often 2–10× smaller responses'],
          ['Compression (gzip/br)', 'Bandwidth', '70–90% for text; costs CPU'],
          ['Pagination', 'Unbounded queries', 'Stable latency as data grows'],
          ['Batching / avoid N+1', 'Many small queries', '1 query instead of N'],
        ]),
      ),
      section('why', 'Why',
        bullets(
          "Node's single loop makes per-request CPU and blocking calls expensive for *everyone*.",
          "Most API latency is I/O; reducing round trips and payload size beats micro-optimizing JS.",
        ),
      ),
      section('internals', 'Where the time goes in a typical request',
        flow(['TLS/TCP setup: avoid with keep-alive', 'Parse + validate body: CPU', 'DB/HTTP calls: round trips, N+1', 'Serialize JSON: CPU ∝ size', 'Compress: CPU', 'Send: bandwidth'], { title: 'Request cost breakdown', direction: 'horizontal' }),
        bullets(
          "`JSON.stringify` is synchronous and O(size): a 20 MB response blocks the loop for tens of ms.",
          "Node 19+ `http.globalAgent` uses `keepAlive: true` by default; global `fetch` (undici) pools connections automatically.",
          "Offset pagination (`OFFSET 100000`) makes the DB scan and discard rows; cursor (keyset) pagination uses an index.",
        ),
      ),
      section('example', 'Common fixes',
        code({
          title: 'Stream a large export instead of buffering',
          code: dedent(`
            import { pipeline } from 'node:stream/promises';
            import { Transform } from 'node:stream';

            app.get('/export.csv', async (req, res) => {
              res.setHeader('Content-Type', 'text/csv');
              const rows = db.query(new QueryStream('SELECT id, email FROM users')); // pg-query-stream
              const toCsv = new Transform({
                objectMode: true,
                transform(row, _enc, cb) { cb(null, \`\${row.id},\${row.email}\\n\`); },
              });
              await pipeline(rows, toCsv, res);   // backpressure + cleanup on error
            });
          `),
          explanation: [
            'Memory stays flat regardless of row count; the first bytes reach the client immediately.',
            '`pipeline` propagates errors and destroys all streams if the client disconnects.',
            '`pg-query-stream` is third-party (for the `pg` driver).',
          ],
        }),
        code({
          title: 'Cursor (keyset) pagination',
          code: dedent(`
            app.get('/orders', async (req, res) => {
              const limit = Math.min(Number(req.query.limit) || 50, 100);   // cap page size
              const after = req.query.after ?? 0;
              const { rows } = await db.query(
                'SELECT id, total, created_at FROM orders WHERE id > $1 ORDER BY id LIMIT $2',
                [after, limit + 1],
              );
              const hasMore = rows.length > limit;
              const page = rows.slice(0, limit);
              res.json({ data: page, nextCursor: hasMore ? page.at(-1).id : null });
            });
          `),
          expectedOutput: '{"data":[{"id":51,"total":"19.99","created_at":"2026-11-01T10:00:00.000Z"}, ...],"nextCursor":100}',
          explanation: [
            '`WHERE id > $1` uses the primary-key index — page 1000 costs the same as page 1.',
            'Fetching `limit + 1` rows tells you if there is a next page without a `COUNT(*)`.',
            'Only needed columns are selected → smaller JSON, faster serialization.',
          ],
        }),
        code({
          title: 'Avoid N+1',
          code: dedent(`
            // Wrong: 1 query for posts + 1 per post for author
            for (const p of posts) p.author = await db.users.findById(p.authorId);

            // Right: one batched query
            const ids = [...new Set(posts.map((p) => p.authorId))];
            const authors = new Map((await db.users.findMany({ where: { id: { in: ids } } })).map((u) => [u.id, u]));
            for (const p of posts) p.author = authors.get(p.authorId);
          `),
        }),
      ),
      section('real-world', 'Real-world backend usage',
        bullets(
          "Compression is usually best done at the reverse proxy/CDN (nginx, Cloudflare) to save Node CPU; if in Node, use `compression` middleware (Express, third-party) with a size threshold.",
          "Reuse one DB pool per process and one HTTP agent/undici dispatcher per upstream.",
          "Precompute expensive aggregates in background jobs; serve from cache.",
          "Set `Cache-Control` / `ETag` so clients and CDNs avoid hitting you at all.",
          "Fast serializers (`fast-json-stringify`, Fastify's response schemas — third-party) speed up JSON for known shapes.",
        ),
      ),
      section('mistakes', 'Common mistakes',
        code({
          title: 'Wrong vs right: sync APIs in request path',
          code: dedent(`
            // Wrong: blocks the loop for every request
            app.get('/template', (req, res) => res.send(fs.readFileSync('./tpl.html', 'utf8')));

            // Right: read once at startup (sync is fine during boot) or use async + cache
            const tpl = fs.readFileSync('./tpl.html', 'utf8');
            app.get('/template', (req, res) => res.send(tpl));
          `),
        }),
        bullets(
          "Creating a new DB client / HTTP agent per request.",
          "Returning entire ORM entities with relations when the client needs 3 fields.",
          "Compressing already-compressed content (images, zip) or tiny responses.",
          "Optimizing JS loops while the request does 40 sequential queries.",
        ),
      ),
      section('interview', 'Interview angle',
        interviewTip("Structure your answer: measure → reduce I/O round trips (N+1, keep-alive, caching) → reduce bytes (fields, pagination, compression) → reduce CPU on the loop (no sync, offload, streaming)."),
      ),
      section('practice', 'Practice',
        text("Take an endpoint returning 10k rows as JSON. Apply: field selection, cursor pagination, and an `ETag`. Measure response size and p99 before and after."),
      ),
      section('summary', 'Summary',
        bullets(
          "Never block the loop in the request path.",
          "Stream big data; paginate with cursors.",
          "Reuse connections; batch queries; cache.",
          "Send less: select fields, compress text at the edge.",
        ),
      ),
    ],
    revisionNotes: [
      'Sync fs/crypto/zlib only at startup, never per request.',
      'stream.pipeline for exports: flat memory, error cleanup.',
      'Keyset pagination: WHERE id > cursor ORDER BY id LIMIT n.',
      'Node 19+ globalAgent keepAlive true; fetch pools by default.',
      'N+1 → batch with IN (...) / DataLoader.',
      'Compression best at proxy/CDN.',
    ],
    quiz: [
      {
        kind: 'mcq', difficulty: 'intermediate',
        prompt: 'Why does OFFSET pagination slow down on deep pages?',
        options: ['JSON gets bigger', 'The database must scan and discard all skipped rows', 'Node caches old pages', 'Indexes are disabled with OFFSET'],
        answer: 1,
        explanation: 'OFFSET 100000 still reads 100000 rows before returning the page. Keyset pagination seeks directly via the index.',
      },
      {
        kind: 'find-bug', difficulty: 'intermediate',
        prompt: 'What is the main performance problem?',
        code: "app.get('/feed', async (req, res) => {\n  const posts = await Post.findAll({ limit: 50 });\n  for (const p of posts) p.likes = await Like.count({ where: { postId: p.id } });\n  res.json(posts);\n});",
        options: ['limit 50 is too high', 'N+1 queries: one count query per post', 'res.json is slow', 'findAll should be findOne'],
        answer: 1,
        explanation: '51 sequential round trips. Use one GROUP BY query (or a join/denormalized counter) to fetch all counts at once.',
      },
      {
        kind: 'scenario', difficulty: 'advanced',
        prompt: 'An admin "download all orders" endpoint OOM-crashes the API at 2M rows. Best fix?',
        options: ['Raise --max-old-space-size to 8 GB', 'Stream rows from a DB cursor through a CSV transform into the response with pipeline (or generate as a background job)', 'Use JSON instead of CSV', 'Cache the result in Redis'],
        answer: 1,
        explanation: 'Streaming keeps memory constant; a background job additionally removes the long request. A bigger heap only moves the limit.',
      },
    ],
    interview: [
      {
        category: 'advanced', kind: 'concept', difficulty: 'intermediate', topic: 'Optimization',
        question: 'What are the most effective ways to reduce latency of a Node.js REST API?',
        shortAnswer: 'Measure first, then cut I/O round trips (fix N+1, batch, cache, keep-alive), cut payload size (select fields, paginate, compress), and keep CPU and sync calls off the event loop (stream, offload heavy work).',
        detailedAnswer: [
          'Parallelize independent awaits with Promise.all.',
          'Connection reuse: one DB pool, keep-alive agents.',
          'Cache hot reads in memory/Redis with TTLs; HTTP caching headers.',
          'Cursor pagination and field selection.',
          'Avoid sync APIs and large JSON.stringify on the hot path.',
        ],
        followUp: 'How do you decide what to cache?',
        trap: 'Starting with micro-optimizations of loops before looking at I/O.',
      },
      {
        category: 'advanced', kind: 'scenario', difficulty: 'advanced', topic: 'Optimization',
        question: 'A /dashboard endpoint returns a 15 MB JSON response and the whole service slows down whenever it is called. Why, and what do you change?',
        shortAnswer: 'JSON.stringify of 15 MB is synchronous and blocks the event loop (plus big heap allocations and compression CPU); return only what the UI needs with pagination or precomputed aggregates, cache the result, and stream if large output is unavoidable.',
        detailedAnswer: [
          'Serialization is O(size) and runs on the main thread.',
          'The string plus the object both live in heap → GC pressure.',
          'Aggregate in the DB or a background job; serve summary data.',
          'Paginate or lazy-load widgets.',
          'Cache with a TTL and ETag; consider a streaming JSON serializer if needed.',
        ],
        followUp: 'How would you confirm serialization is the hot spot?',
        trap: 'Only enabling gzip — compression adds CPU and does not fix serialization cost.',
      },
    ],
  },

  // ───────────────────────────────────────────────────────────
  caching: {
    summary: 'Caching stores results closer to the consumer — in-process LRU, Redis, or HTTP caches — chosen by strategy (cache-aside, write-through, write-behind), bounded by TTL and invalidation, and protected against stampedes.',
    topics: ['in-memory cache', 'LRU', 'TTL', 'cache-aside', 'read-through', 'write-through', 'write-behind', 'invalidation', 'cache stampede', 'single-flight', 'HTTP caching', 'ETag', 'Cache-Control'],
    sections: [
      section('introduction', undefined,
        text("The fastest database query is the one you don't make. Caching trades freshness and memory for latency — and the hard part is not storing data but knowing when it's stale."),
      ),
      section('definition', 'Definition',
        table('Cache layers', ['Layer', 'Latency', 'Shared across instances?', 'Example'], [
          ['In-process (Map/LRU)', '~µs', 'No — per process', 'lru-cache (third-party)'],
          ['Distributed (Redis/Memcached)', '~0.2–1 ms', 'Yes', 'ioredis / node-redis (third-party)'],
          ['HTTP / CDN', '0 to client, edge ms', 'Yes, at edge', 'Cache-Control, ETag'],
        ]),
        table('Write strategies', ['Strategy', 'Read path', 'Write path', 'Pros', 'Cons'], [
          ['Cache-aside (lazy)', 'App checks cache → miss → DB → populate', 'Write DB, delete cache key', 'Simple, only caches what is read', 'First read is slow; stale window'],
          ['Read-through', 'Cache library loads from DB on miss', 'Same as cache-aside', 'Loader logic in one place', 'Needs a cache layer that supports loaders'],
          ['Write-through', 'Read from cache', 'Write cache and DB synchronously', 'Cache always fresh', 'Slower writes; caches unread data'],
          ['Write-behind (write-back)', 'Read from cache', 'Write cache, flush to DB async', 'Very fast writes, batching', 'Data loss risk if cache dies; complex'],
        ]),
      ),
      section('why', 'Why',
        bullets(
          "Cut p99 latency and DB load for read-heavy data (product catalog, config, user profiles).",
          "Absorb traffic spikes without scaling the database.",
        ),
      ),
      section('internals', 'Cache-aside, TTL and stampedes',
        diagram('cache-aside', 'Check cache → miss → load from DB → populate with TTL → return.'),
        bullets(
          "**TTL** bounds staleness and memory. Add **jitter** (e.g. TTL ± 10%) so many keys don't expire at once.",
          "**Invalidation**: on write, delete the key (safer than updating it — avoids races writing an older value).",
          "**Stampede (dogpile)**: a hot key expires and 1,000 concurrent requests all miss and hit the DB.",
          "Stampede defenses: **single-flight** (one loader per key per process), a **distributed lock** (`SET lock NX PX`), **stale-while-revalidate** (serve old value while one request refreshes), **probabilistic early refresh**.",
          "LRU eviction: when full, drop the least-recently-used entry. A `Map` keeps insertion order, which makes a simple LRU easy.",
        ),
      ),
      section('example', 'In-process LRU and single-flight',
        code({
          title: 'Tiny LRU using Map order',
          code: dedent(`
            class LRU {
              constructor(max) { this.max = max; this.map = new Map(); }
              get(k) {
                if (!this.map.has(k)) return undefined;
                const v = this.map.get(k);
                this.map.delete(k); this.map.set(k, v);       // mark as most recent
                return v;
              }
              set(k, v) {
                this.map.delete(k); this.map.set(k, v);
                if (this.map.size > this.max) this.map.delete(this.map.keys().next().value); // evict oldest
              }
            }
            const c = new LRU(2);
            c.set('a', 1); c.set('b', 2);
            c.get('a');          // 'a' becomes most recent
            c.set('c', 3);       // evicts 'b'
            console.log([...c.map.keys()]);
            console.log(c.get('b'));
          `),
          expectedOutput: "[ 'a', 'c' ]\nundefined",
          explanation: [
            '`Map` iterates in insertion order; re-inserting on access moves a key to the end.',
            'The first key from `keys()` is therefore the least recently used.',
            'In production use `lru-cache` (third-party) which adds TTL, size-based limits and stale-while-revalidate.',
          ],
          runnable: true,
        }),
        code({
          title: 'Single-flight: 100 concurrent misses, 1 DB call',
          code: dedent(`
            const inflight = new Map();
            let dbCalls = 0;
            function loadFromDb(key) {
              dbCalls++;
              return new Promise((r) => setTimeout(() => r('value-of-' + key), 50));
            }
            function singleFlight(key) {
              if (inflight.has(key)) return inflight.get(key);
              const p = loadFromDb(key).finally(() => inflight.delete(key));
              inflight.set(key, p);
              return p;
            }
            Promise.all(Array.from({ length: 100 }, () => singleFlight('user:1'))).then((r) => {
              console.log(r.length, r[0]);
              console.log('db calls:', dbCalls);
            });
          `),
          expectedOutput: '100 value-of-user:1\ndb calls: 1',
          explanation: [
            'The first caller stores the pending promise; the other 99 receive the same promise.',
            '`finally` removes it so later requests can refresh.',
            'This protects one process; across many instances combine it with a Redis lock or stale-while-revalidate.',
          ],
          runnable: true,
        }),
        code({
          title: 'Cache-aside with Redis and jittered TTL',
          code: dedent(`
            async function getProduct(id) {
              const key = \`product:\${id}\`;
              const hit = await redis.get(key);
              if (hit) return JSON.parse(hit);

              const product = await db.products.findById(id);
              const ttl = 300 + Math.floor(Math.random() * 60);   // 300–359 s
              await redis.set(key, JSON.stringify(product), 'EX', ttl);
              return product;
            }

            async function updateProduct(id, patch) {
              await db.products.update(id, patch);
              await redis.del(\`product:\${id}\`);                 // invalidate, don't overwrite
            }
          `),
          explanation: ['Deleting on write avoids a race where a slow reader writes an older value after a newer update.'],
        }),
      ),
      section('real-world', 'Real-world backend usage',
        bullets(
          "HTTP: `Cache-Control: public, max-age=60, stale-while-revalidate=300` for public catalog pages; `private, no-store` for account data.",
          "`ETag` + `If-None-Match` → `304 Not Modified` saves bandwidth even when content must be revalidated (Express sets weak ETags automatically).",
          "Two-level cache: small in-process LRU (seconds) in front of Redis (minutes).",
          "Never cache per-user responses under a shared key — classic data-leak bug.",
        ),
      ),
      section('mistakes', 'Common mistakes',
        code({
          title: 'Wrong vs right: cache key',
          code: dedent(`
            // Wrong: every user sees the first user's dashboard
            const key = 'dashboard';

            // Right: include every input that changes the result
            const key2 = \`dashboard:\${user.id}:\${locale}:v3\`;
          `),
        }),
        bullets(
          "No TTL → stale forever and unbounded memory.",
          "Same TTL for millions of keys created together → synchronized expiry → stampede.",
          "Caching errors or `null` results without a short TTL (negative caching done wrong).",
          "In-process caches in a cluster: each worker has its own copy and invalidations don't propagate.",
        ),
      ),
      section('interview', 'Interview angle',
        interviewTip("Mention a strategy (cache-aside), invalidation on write (delete), TTL with jitter, and stampede protection. That combination signals real production experience."),
      ),
      section('practice', 'Practice',
        text("Add cache-aside to a `GET /products/:id` route with Redis, invalidate on `PATCH`, and prove with autocannon that 500 concurrent requests on a cold key produce only one DB query (single-flight)."),
      ),
      section('summary', 'Summary',
        bullets(
          "Layers: in-process LRU, Redis, HTTP/CDN.",
          "Strategies: cache-aside (default), read-through, write-through, write-behind.",
          "TTL + jitter, delete on write, key includes all inputs.",
          "Prevent stampedes with single-flight, locks or stale-while-revalidate.",
        ),
      ),
    ],
    revisionNotes: [
      'Cache-aside: read cache → miss → DB → set with TTL; on write: DB then DEL key.',
      'Write-through = sync both; write-behind = cache now, DB later (loss risk).',
      'Stampede fixes: single-flight, lock (SET NX PX), stale-while-revalidate, jitter.',
      'Map insertion order → simple LRU.',
      'HTTP: Cache-Control, ETag/If-None-Match → 304.',
      'Per-process caches diverge in clusters.',
    ],
    quiz: [
      {
        kind: 'mcq', difficulty: 'intermediate',
        prompt: 'In cache-aside, what should happen to the cache when a record is updated?',
        options: ['Nothing, the TTL handles it', 'Delete (invalidate) the key after writing the database', 'Write the new value to the cache before the database', 'Flush the entire cache'],
        answer: 1,
        explanation: 'Deleting after the DB write lets the next read repopulate with fresh data and avoids races where an older value overwrites a newer one. Flushing everything causes a stampede.',
      },
      {
        kind: 'scenario', difficulty: 'advanced',
        prompt: 'Every hour at :00, DB CPU spikes to 100% for a few seconds. All product keys are cached with EX 3600 set during a nightly warm-up. Fix?',
        options: ['Increase DB size', 'Add random jitter to TTLs and protect hot keys with single-flight / stale-while-revalidate', 'Remove the TTL', 'Use write-behind'],
        answer: 1,
        explanation: 'Keys set together expire together and every miss hits the DB — a stampede. Jitter spreads expirations; single-flight caps concurrent loads.',
      },
      {
        kind: 'predict-output', difficulty: 'intermediate',
        prompt: 'With the LRU above (max 2): set x, set y, get x, set z, get y. What does the last get return?',
        options: ['the value of y', 'undefined', 'the value of x', 'throws'],
        answer: 1,
        explanation: 'Accessing x made y the least recently used, so adding z evicted y.',
      },
    ],
    interview: [
      {
        category: 'advanced', kind: 'concept', difficulty: 'intermediate', topic: 'Caching',
        question: 'Compare cache-aside, write-through and write-behind caching.',
        shortAnswer: 'Cache-aside lets the app load on miss and invalidate on write; write-through writes cache and DB together so reads are always fresh; write-behind writes the cache immediately and persists to the DB asynchronously, trading durability for write speed.',
        detailedAnswer: [
          'Cache-aside: simple, lazy, stale window between write and invalidation.',
          'Write-through: slower writes, may cache data nobody reads.',
          'Write-behind: batching and speed, but data loss if the cache fails before flush.',
          'Most Node APIs use cache-aside with TTL + delete-on-write.',
        ],
        followUp: 'Why delete the key on update instead of setting the new value?',
        trap: 'Saying write-behind is safe for financial data.',
      },
      {
        category: 'advanced', kind: 'concept', difficulty: 'advanced', topic: 'Caching',
        question: 'What is a cache stampede and how do you prevent it?',
        shortAnswer: 'When a hot key expires, many concurrent requests miss simultaneously and overload the database recomputing it; prevent it with request coalescing (single-flight), a distributed lock so one request rebuilds, stale-while-revalidate, early probabilistic refresh, and jittered TTLs.',
        detailedAnswer: [
          'Single-flight: share one in-flight promise per key per process.',
          'Distributed lock: SET lock:key token NX PX 5000; others wait or serve stale.',
          'Stale-while-revalidate: keep a soft and hard TTL; refresh in background.',
          'Jitter prevents synchronized expirations of many keys.',
          'Pre-warm critical keys after deploys.',
        ],
        followUp: 'How does single-flight behave in a cluster of 10 instances?',
        trap: 'Thinking a longer TTL alone solves it — it just makes it rarer.',
      },
    ],
  },

  // ───────────────────────────────────────────────────────────
  redis: {
    summary: 'Redis is an in-memory data-structure server used by Node backends for caching, sessions, rate limiting, locks, pub/sub and queues; you talk to it through clients like ioredis or node-redis (third-party).',
    topics: ['Redis', 'strings', 'hashes', 'lists', 'sets', 'sorted sets', 'streams', 'SET EX NX', 'INCR', 'EXPIRE', 'pub/sub', 'ioredis', 'node-redis', 'pipelining', 'rate limiting', 'distributed lock'],
    sections: [
      section('introduction', undefined,
        text("Once you run more than one Node process, you need somewhere to share fast, short-lived state. Redis is the default answer: sub-millisecond operations on rich data types, all atomic."),
      ),
      section('definition', 'Definition',
        table('Core data types', ['Type', 'Commands', 'Backend use'], [
          ['String', 'GET, SET key val EX 60 NX, INCR, MGET', 'Cache entries, counters, locks'],
          ['Hash', 'HSET, HGET, HGETALL, HINCRBY', 'Objects (session, user profile fields)'],
          ['List', 'LPUSH, RPOP, BLMOVE, LRANGE', 'Simple queues, recent-items feeds'],
          ['Set', 'SADD, SISMEMBER, SMEMBERS', 'Unique visitors, tags, online users'],
          ['Sorted set', 'ZADD, ZRANGE ... BYSCORE, ZINCRBY', 'Leaderboards, sliding-window rate limits, delayed jobs'],
          ['Stream', 'XADD, XREADGROUP, XACK', 'Durable event log with consumer groups'],
          ['Pub/Sub', 'PUBLISH, SUBSCRIBE', 'Fire-and-forget broadcast (no persistence)'],
        ]),
        note("Clients: **ioredis** and **node-redis** (`redis` package) — both third-party. Redis executes commands on a single thread, so each command is atomic; MULTI/EXEC and Lua scripts make multi-step operations atomic. Valkey is a BSD-licensed fork compatible with the same clients."),
      ),
      section('why', 'Why Redis in a Node backend',
        bullets(
          "Shared state across cluster workers and containers (sessions, rate limits, Socket.IO adapter).",
          "Atomic counters and locks without DB round trips.",
          "Backing store for job queues (BullMQ requires Redis).",
        ),
      ),
      section('internals', 'How it behaves',
        bullets(
          "All data is in RAM; persistence via RDB snapshots and/or AOF (append-only log). Configure `maxmemory` and an eviction policy (`allkeys-lru` for pure caches, `noeviction` for queues).",
          "Commands are processed one at a time → no race between `INCR`s; but a slow command (`KEYS *`, huge `HGETALL`) blocks everyone — use `SCAN`.",
          "**Pipelining** sends many commands without waiting for each reply — ioredis auto-pipelines with `enableAutoPipelining`.",
          "A connection in **SUBSCRIBE** mode can only run pub/sub commands → use a dedicated connection for subscribers.",
          "Pub/Sub is at-most-once: subscribers offline at publish time miss the message. Use Streams for durability.",
        ),
      ),
      section('example', 'Common patterns with ioredis',
        code({
          title: 'Connection, cache entry, counter',
          code: dedent(`
            import Redis from 'ioredis';               // third-party
            const redis = new Redis(process.env.REDIS_URL);

            await redis.set('greeting', 'hello', 'EX', 60);       // expires in 60 s
            console.log(await redis.get('greeting'));
            console.log(await redis.ttl('greeting'));
            console.log(await redis.incr('page:views'));
            console.log(await redis.incr('page:views'));
          `),
          expectedOutput: 'hello\n60\n1\n2',
          explanation: [
            '`SET key value EX seconds` sets value and TTL atomically.',
            '`TTL` returns remaining seconds (-1 = no TTL, -2 = missing key).',
            '`INCR` is atomic, creating the key at 0 first — safe across all processes.',
            'node-redis equivalent: `await client.set(\'greeting\', \'hello\', { EX: 60 })`.',
          ],
        }),
        code({
          title: 'Fixed-window rate limit',
          code: dedent(`
            async function allow(ip, limit = 100, windowSec = 60) {
              const key = \`rl:\${ip}:\${Math.floor(Date.now() / 1000 / windowSec)}\`;
              const [[, count]] = await redis.multi().incr(key).expire(key, windowSec).exec();
              return count <= limit;
            }
          `),
          explanation: [
            '`MULTI/EXEC` runs INCR + EXPIRE together; ioredis returns `[[err, result], ...]`.',
            'For smoother limits use a sorted-set sliding window or a Lua token bucket.',
          ],
        }),
        code({
          title: 'Pub/Sub for cache invalidation across instances',
          code: dedent(`
            const sub = redis.duplicate();              // dedicated subscriber connection
            await sub.subscribe('cache:invalidate');
            sub.on('message', (channel, key) => localLru.delete(key));

            // on any instance after a write:
            await redis.publish('cache:invalidate', 'product:42');
          `),
          explanation: ['Every instance drops its in-process copy; Redis Pub/Sub does not store messages, which is fine for invalidation hints.'],
        }),
        code({
          title: 'Simple distributed lock',
          code: dedent(`
            import { randomUUID } from 'node:crypto';
            const token = randomUUID();
            const ok = await redis.set('lock:report', token, 'PX', 30_000, 'NX');
            if (ok === 'OK') {
              try { await buildReport(); }
              finally {
                // release only if we still own it (atomic compare-and-delete)
                await redis.eval(
                  "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end",
                  1, 'lock:report', token);
              }
            }
          `),
          explanation: [
            '`NX` = only set if absent; `PX` = TTL in ms so a crashed holder cannot block forever.',
            'Checking the token prevents deleting a lock another process acquired after ours expired.',
            'Locks like this are best-effort; for correctness-critical work also use idempotent writes or DB constraints.',
          ],
        }),
      ),
      section('real-world', 'Real-world backend usage',
        bullets(
          "Sessions (`connect-redis` for express-session — third-party).",
          "Rate limiting for login/API routes shared across instances.",
          "Leaderboards with sorted sets; online presence with sets + TTL.",
          "BullMQ job queues; Socket.IO Redis adapter.",
          "Use separate logical databases or, better, separate instances for cache vs queue so cache eviction never deletes jobs.",
        ),
      ),
      section('mistakes', 'Common mistakes',
        code({
          title: 'Wrong vs right: listing keys',
          code: dedent(`
            // Wrong: O(N) and blocks Redis for all clients
            const keys = await redis.keys('session:*');

            // Right: incremental, non-blocking iteration
            const stream = redis.scanStream({ match: 'session:*', count: 500 });
            for await (const batch of stream) { /* process batch */ }
          `),
        }),
        bullets(
          "`SET` then `EXPIRE` as two calls — a crash in between leaves a key with no TTL. Use `SET ... EX`.",
          "Using Pub/Sub for jobs that must not be lost.",
          "No `maxmemory` policy → Redis OOM; or `allkeys-lru` on a queue instance → jobs evicted.",
          "Opening a new Redis connection per request.",
        ),
      ),
      section('interview', 'Interview angle',
        interviewTip("Pick the right data type for the use case and mention atomicity (single-threaded execution, MULTI/Lua) and durability limits (in-memory, Pub/Sub not persisted)."),
      ),
      section('practice', 'Practice',
        text("Implement a leaderboard: `ZINCRBY scores 10 user:1`, top 10 with `ZRANGE scores 0 9 REV WITHSCORES`, and a user's rank with `ZREVRANK`."),
      ),
      section('summary', 'Summary',
        bullets(
          "In-memory, single-threaded, atomic commands, rich types.",
          "SET EX NX for cache/locks, INCR for counters, sorted sets for rankings and windows.",
          "Pub/Sub is fire-and-forget; Streams are durable.",
          "Use SCAN not KEYS; configure maxmemory + eviction per role.",
        ),
      ),
    ],
    revisionNotes: [
      'SET key val EX 60 NX — atomic set + TTL + only-if-absent.',
      'INCR atomic; TTL -1 no expiry, -2 missing.',
      'Pub/Sub at-most-once; subscriber needs dedicated connection.',
      'Streams + consumer groups for durable messaging.',
      'KEYS blocks → use SCAN.',
      'Clients: ioredis, node-redis (third-party).',
    ],
    quiz: [
      {
        kind: 'mcq', difficulty: 'intermediate',
        prompt: 'Which Redis data type fits a "top 10 players by score" leaderboard best?',
        options: ['List', 'Set', 'Sorted set', 'Hash'],
        answer: 2,
        explanation: 'Sorted sets keep members ordered by score with O(log N) updates and range queries. Sets have no order; lists would require sorting on every read.',
      },
      {
        kind: 'find-bug', difficulty: 'advanced',
        prompt: 'What can go wrong with this lock?',
        code: "if (await redis.setnx('lock:job', '1')) {\n  await redis.expire('lock:job', 30);\n  await runJob();\n  await redis.del('lock:job');\n}",
        options: ['setnx is not a Redis command', 'Crash between SETNX and EXPIRE leaves a lock forever; DEL can also remove another holder\'s lock', 'DEL is too slow', 'Nothing'],
        answer: 1,
        explanation: 'Use SET key token NX PX ttl in one atomic command and release with a compare-and-delete script using your token.',
      },
    ],
    interview: [
      {
        category: 'advanced', kind: 'concept', difficulty: 'intermediate', topic: 'Redis',
        question: 'What are typical uses of Redis in a Node.js backend, and which data types do they use?',
        shortAnswer: 'Caching (strings with EX), sessions (strings/hashes), rate limiting (INCR or sorted sets), leaderboards (sorted sets), presence (sets), locks (SET NX PX), pub/sub broadcast, and job queues (lists/streams/sorted sets via BullMQ).',
        detailedAnswer: [
          'All operations are atomic thanks to single-threaded execution.',
          'Shared across cluster workers and containers.',
          'Sub-millisecond latency because data lives in memory.',
          'Configure persistence and eviction according to the role.',
        ],
        followUp: 'Why should cache and queue workloads use separate Redis instances?',
        trap: 'Treating Redis as a durable primary database by default.',
      },
      {
        category: 'advanced', kind: 'concept', difficulty: 'advanced', topic: 'Redis',
        question: 'Redis Pub/Sub vs Redis Streams — when do you use each?',
        shortAnswer: 'Pub/Sub broadcasts messages only to currently connected subscribers with no storage (at-most-once); Streams append messages to a persistent log consumed via consumer groups with acknowledgements and replay, suitable for reliable processing.',
        detailedAnswer: [
          'Pub/Sub: cache invalidation hints, Socket.IO adapter fan-out, live notifications.',
          'Streams: XADD, XREADGROUP, XACK, pending entries list for retries (XAUTOCLAIM).',
          'Streams support multiple consumer groups reading the same data.',
          'Pub/Sub subscribers need a dedicated connection.',
        ],
        followUp: 'How do you recover messages a crashed stream consumer never acknowledged?',
        trap: 'Using Pub/Sub for work that must not be lost when a subscriber restarts.',
      },
    ],
  },
};

export default content;
