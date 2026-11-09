import type { CodingChallenge } from '../../types';
import { js, md, t } from './helpers';

/** Advanced: caches, resilience patterns, scheduling and distributed-systems building blocks. */
export const advancedChallenges: CodingChallenge[] = [
  {
    id: 'ch-053',
    title: 'LRU cache in O(1)',
    difficulty: 'advanced',
    topic: 'Caching',
    category: 'advanced',
    prompt: md(
      'Implement `class LRUCache` with `new LRUCache(capacity)`:',
      '',
      '- `get(key)` → value or `undefined`; a hit marks the key as most recently used.',
      '- `set(key, value)` → inserts or updates (an update also marks it most recent). When over capacity, evict the **least recently used** key.',
      '- `has(key)` → boolean, does **not** change recency. `delete(key)` → boolean. `size` getter.',
      '- `keys()` → array from least to most recently used.',
      '',
      'All operations must be O(1) on average (100,000 operations should be instant).',
    ),
    starterCode: js`
      class LRUCache {
        constructor(capacity) {
          // TODO
        }
        get(key) {}
        set(key, value) {}
        has(key) {}
        delete(key) {}
        get size() {}
        keys() {}
      }
    `,
    solution: js`
      class LRUCache {
        constructor(capacity) {
          this.capacity = capacity;
          this.map = new Map(); // Map iterates in insertion order: first = least recent
        }

        get(key) {
          if (!this.map.has(key)) return undefined;
          const value = this.map.get(key);
          this.map.delete(key);
          this.map.set(key, value);
          return value;
        }

        set(key, value) {
          if (this.map.has(key)) this.map.delete(key);
          this.map.set(key, value);
          if (this.map.size > this.capacity) {
            const oldest = this.map.keys().next().value;
            this.map.delete(oldest);
          }
          return this;
        }

        has(key) {
          return this.map.has(key);
        }

        delete(key) {
          return this.map.delete(key);
        }

        get size() {
          return this.map.size;
        }

        keys() {
          return [...this.map.keys()];
        }
      }
    `,
    tests: [
      t("(() => { const c = new LRUCache(2); c.set('a', 1); c.set('b', 2); c.get('a'); c.set('c', 3); return [c.has('a'), c.has('b'), c.has('c'), c.size]; })()", [true, false, true, 2]),
      t("(() => { const c = new LRUCache(2); c.set('a', 1); c.set('b', 2); c.set('a', 10); c.set('c', 3); return [c.get('a'), c.get('b') === undefined, c.size]; })()", [10, true, 2]),
      t("(() => { const c = new LRUCache(3); c.set('a', 1); c.set('b', 2); c.set('c', 3); c.get('a'); return c.keys(); })()", ['b', 'c', 'a']),
      t("(() => { const c = new LRUCache(2); c.set('a', 1); c.set('b', 2); c.has('a'); c.set('c', 3); return [c.has('a'), c.has('b')]; })()", [false, true]),
      t("(() => { const c = new LRUCache(2); c.set('a', 1); return [c.delete('a'), c.delete('a'), c.size, c.get('x') === undefined]; })()", [true, false, 0, true]),
      t("(() => { const c = new LRUCache(2); c.set('z', 0); return [c.get('z'), c.has('z')]; })()", [0, true]),
      t('(() => { const c = new LRUCache(1000); for (let i = 0; i < 100000; i++) { c.set(i, i); c.get(i - 500); } return [c.size, c.has(99999), c.has(0)]; })()', [1000, true, false]),
    ],
    hints: [
      'A JavaScript `Map` remembers insertion order — deleting and re-inserting a key moves it to the end.',
      'The least recently used key is `map.keys().next().value`.',
      'Classic language-agnostic answer: hash map + doubly linked list.',
    ],
    explanation: md(
      'A `Map` already is an ordered hash map: delete-and-reinsert moves a key to the "most recent" end in O(1), and the first key from the iterator is the eviction candidate. `get` must check `has` first so a stored `undefined`/`0` is handled correctly.',
      '',
      'In other languages (or if asked to avoid the trick) use a hash map pointing into a doubly linked list. In Node services an LRU (`lru-cache` package) bounds memory for hot lookups; across instances you move to Redis with `maxmemory-policy allkeys-lru`.',
      '',
      'Complexity: O(1) average per operation, O(capacity) memory.',
    ),
    relatedLessonIds: ['m11-caching', 'm01-map-set-weakmap-and-weakset', 'm11-memory-leaks'],
  },
  {
    id: 'ch-054',
    title: 'TTL cache with an injectable clock',
    difficulty: 'advanced',
    topic: 'Caching',
    category: 'advanced',
    prompt: md(
      'Implement `class TTLCache` with `new TTLCache({ ttlMs, now = () => Date.now() })`:',
      '',
      '- `set(key, value, ttlMs?)` — per-entry TTL overrides the default. Setting an existing key resets its expiry.',
      '- An entry set at time `t` with TTL `d` is **expired from `t + d` onwards**.',
      '- `get(key)` → value or `undefined` (expired entries are deleted on access). `has(key)`.',
      '- `size` — number of **non-expired** entries.',
      '- `prune()` — removes all expired entries and returns how many were removed.',
      '- Falsy values (`0`, `""`, `false`) are valid values.',
    ),
    starterCode: js`
      class TTLCache {
        constructor({ ttlMs, now = () => Date.now() }) {
          // TODO
        }
        set(key, value, ttlMs) {}
        get(key) {}
        has(key) {}
        get size() {}
        prune() {}
      }
    `,
    solution: js`
      class TTLCache {
        constructor({ ttlMs, now = () => Date.now() }) {
          this.ttlMs = ttlMs;
          this.now = now;
          this.entries = new Map();
        }

        set(key, value, ttlMs = this.ttlMs) {
          this.entries.set(key, { value, expiresAt: this.now() + ttlMs });
          return this;
        }

        isExpired(entry) {
          return this.now() >= entry.expiresAt;
        }

        get(key) {
          const entry = this.entries.get(key);
          if (!entry) return undefined;
          if (this.isExpired(entry)) {
            this.entries.delete(key);
            return undefined;
          }
          return entry.value;
        }

        has(key) {
          const entry = this.entries.get(key);
          if (!entry) return false;
          if (this.isExpired(entry)) {
            this.entries.delete(key);
            return false;
          }
          return true;
        }

        get size() {
          this.prune();
          return this.entries.size;
        }

        prune() {
          let removed = 0;
          for (const [key, entry] of this.entries) {
            if (this.isExpired(entry)) {
              this.entries.delete(key);
              removed++;
            }
          }
          return removed;
        }
      }
    `,
    tests: [
      t("(() => { let t = 0; const c = new TTLCache({ ttlMs: 1000, now: () => t }); c.set('a', 1); t = 999; const before = c.get('a'); t = 1000; return [before, c.get('a') === undefined, c.has('a')]; })()", [1, true, false]),
      t("(() => { let t = 0; const c = new TTLCache({ ttlMs: 1000, now: () => t }); c.set('short', 1, 10); c.set('long', 2); t = 50; return [c.has('short'), c.has('long')]; })()", [false, true]),
      t("(() => { let t = 0; const c = new TTLCache({ ttlMs: 1000, now: () => t }); c.set('a', 'v1'); t = 900; c.set('a', 'v2'); t = 1500; return c.get('a'); })()", 'v2'),
      t("(() => { let t = 0; const c = new TTLCache({ ttlMs: 1000, now: () => t }); c.set('a', 1); t = 500; c.set('b', 2); t = 1200; return c.size; })()", 1),
      t("(() => { let t = 0; const c = new TTLCache({ ttlMs: 100, now: () => t }); c.set('a', 1); c.set('b', 2); c.set('c', 3, 5000); t = 2000; return [c.prune(), c.prune(), c.size]; })()", [2, 0, 1]),
      t("(() => { let t = 0; const c = new TTLCache({ ttlMs: 100, now: () => t }); c.set('zero', 0); c.set('empty', ''); return [c.get('zero'), c.get('empty'), c.has('zero')]; })()", [0, '', true]),
    ],
    hints: [
      'Store `{ value, expiresAt }` per key.',
      'Check expiry lazily on reads; `prune` is the sweep for memory.',
      'Never call `Date.now()` directly — always use the injected `now`.',
    ],
    explanation: md(
      'Store the absolute expiry time with each value. Reads compare `now() >= expiresAt` and delete stale entries on the spot (lazy expiration). `prune` sweeps everything — run it on an interval (with `timer.unref()` in Node so it does not keep the process alive) to reclaim memory from keys nobody reads again.',
      '',
      'Redis uses the same hybrid: lazy expiry on access plus a periodic random sampling sweep. The injectable clock makes expiry logic testable without real waiting or fake-timer libraries.',
      '',
      'Complexity: `get`/`set`/`has` O(1); `prune`/`size` O(n).',
    ),
    relatedLessonIds: ['m11-caching', 'm11-redis', 'm10-token-expiration'],
  },
  {
    id: 'ch-055',
    title: 'Circuit breaker',
    difficulty: 'advanced',
    topic: 'Resilience patterns',
    category: 'advanced',
    prompt: md(
      'Implement `class CircuitBreaker` with `new CircuitBreaker(fn, { failureThreshold = 5, resetTimeoutMs = 10000, now = () => Date.now() })` and `call(...args)` → promise of `fn(...args)`.',
      '',
      "States (`breaker.state`): `'CLOSED'`, `'OPEN'`, `'HALF_OPEN'`.",
      '- **CLOSED:** calls pass through. `failureThreshold` **consecutive** failures → OPEN. A success resets the count.',
      "- **OPEN:** calls reject immediately — without calling `fn` — with `Error('Circuit is open')` whose `code` is `'EOPENBREAKER'`. Once `resetTimeoutMs` has passed since opening, the next call moves to HALF_OPEN.",
      '- **HALF_OPEN:** exactly **one** trial call is allowed (others reject as open). Success → CLOSED. Failure → OPEN again with a fresh timer.',
      '- `fn` errors are rethrown to the caller unchanged.',
    ),
    starterCode: js`
      class CircuitBreaker {
        constructor(fn, { failureThreshold = 5, resetTimeoutMs = 10000, now = () => Date.now() } = {}) {
          this.state = 'CLOSED';
          // TODO
        }
        async call(...args) {
          // TODO
        }
      }
    `,
    solution: js`
      class CircuitBreaker {
        constructor(fn, { failureThreshold = 5, resetTimeoutMs = 10000, now = () => Date.now() } = {}) {
          this.fn = fn;
          this.failureThreshold = failureThreshold;
          this.resetTimeoutMs = resetTimeoutMs;
          this.now = now;
          this.state = 'CLOSED';
          this.failures = 0;
          this.openedAt = 0;
          this.trialInFlight = false;
        }

        openError() {
          const err = new Error('Circuit is open');
          err.code = 'EOPENBREAKER';
          return err;
        }

        trip() {
          this.state = 'OPEN';
          this.openedAt = this.now();
          this.failures = 0;
          this.trialInFlight = false;
        }

        async call(...args) {
          if (this.state === 'OPEN') {
            if (this.now() - this.openedAt < this.resetTimeoutMs) throw this.openError();
            this.state = 'HALF_OPEN';
          }
          if (this.state === 'HALF_OPEN') {
            if (this.trialInFlight) throw this.openError();
            this.trialInFlight = true;
          }

          try {
            const result = await this.fn(...args);
            this.state = 'CLOSED';
            this.failures = 0;
            this.trialInFlight = false;
            return result;
          } catch (err) {
            if (this.state === 'HALF_OPEN') {
              this.trip();
            } else {
              this.failures++;
              if (this.failures >= this.failureThreshold) this.trip();
            }
            throw err;
          }
        }
      }
    `,
    tests: [
      t("(async () => { let t = 0; let calls = 0; const cb = new CircuitBreaker(async () => { calls++; throw new Error('down'); }, { failureThreshold: 2, resetTimeoutMs: 1000, now: () => t }); const msgs = []; for (let i = 0; i < 4; i++) { try { await cb.call(); } catch (e) { msgs.push(e.message); } } return [msgs, calls, cb.state]; })()", [['down', 'down', 'Circuit is open', 'Circuit is open'], 2, 'OPEN']),
      t("(async () => { let t = 0; let ok = false; const cb = new CircuitBreaker(async () => { if (!ok) throw new Error('down'); return 'up'; }, { failureThreshold: 1, resetTimeoutMs: 1000, now: () => t }); await cb.call().catch(() => {}); const s1 = cb.state; t = 500; const msg = await cb.call().catch((e) => e.message); t = 1000; ok = true; const r = await cb.call(); return [s1, msg, r, cb.state]; })()", ['OPEN', 'Circuit is open', 'up', 'CLOSED']),
      t("(async () => { let t = 0; let calls = 0; const cb = new CircuitBreaker(async () => { calls++; throw new Error('down'); }, { failureThreshold: 1, resetTimeoutMs: 1000, now: () => t }); await cb.call().catch(() => {}); t = 1000; await cb.call().catch(() => {}); t = 1500; const msg = await cb.call().catch((e) => e.message); return [msg, calls, cb.state]; })()", ['Circuit is open', 2, 'OPEN']),
      t("(async () => { const results = [false, false, true, false, false]; const cb = new CircuitBreaker(async () => { if (!results.shift()) throw new Error('x'); return 'ok'; }, { failureThreshold: 3, resetTimeoutMs: 1000, now: () => 0 }); for (let i = 0; i < 5; i++) await cb.call().catch(() => {}); return cb.state; })()", 'CLOSED'),
      t('new CircuitBreaker(async (a, b) => a + b, { failureThreshold: 1 }).call(2, 3)', 5),
      t("(async () => { const cb = new CircuitBreaker(async () => { throw new Error('x'); }, { failureThreshold: 1, resetTimeoutMs: 1000, now: () => 0 }); await cb.call().catch(() => {}); return cb.call().catch((e) => e.code); })()", 'EOPENBREAKER'),
      t("(async () => { let t = 0; let ok = false; const cb = new CircuitBreaker(() => (ok ? new Promise((r) => setTimeout(() => r('up'), 10)) : Promise.reject(new Error('down'))), { failureThreshold: 1, resetTimeoutMs: 1000, now: () => t }); await cb.call().catch(() => {}); t = 1000; ok = true; const p1 = cb.call(); const p2 = cb.call(); return [await p2.catch((e) => e.message), await p1, cb.state]; })()", ['Circuit is open', 'up', 'CLOSED']),
    ],
    hints: [
      'Do the OPEN → HALF_OPEN transition lazily inside `call` by comparing `now()` with `openedAt`.',
      'Use a flag to allow only one in-flight trial in HALF_OPEN.',
      'Any failure in HALF_OPEN trips immediately, regardless of the threshold.',
    ],
    explanation: md(
      'A small state machine evaluated on each call. OPEN rejects fast until the cool-down elapses; the first call after that becomes the single HALF_OPEN probe (guarded by `trialInFlight`). The probe\'s outcome decides: close and reset, or re-open with a new `openedAt`. In CLOSED only **consecutive** failures count, so an occasional error does not trip it.',
      '',
      'Why it matters: when a dependency is down, failing fast protects your event loop, sockets and the struggling dependency from a pile-up of slow requests. Libraries: `opossum` for Node; also built into service meshes. Pair it with timeouts — a hanging call never counts as a failure otherwise.',
      '',
      'Complexity: O(1) per call.',
    ),
    relatedLessonIds: ['m15-microservices', 'm15-distributed-systems-fundamentals', 'm15-api-gateway'],
  },
  {
    id: 'ch-056',
    title: 'Topological sort of task dependencies',
    difficulty: 'advanced',
    topic: 'Graphs',
    category: 'advanced',
    prompt: md(
      'Write `topoSort(tasks)` where `tasks` maps a task to the list of tasks it **depends on**: `{ build: ["compile", "lint"], compile: [], ... }`. Return an execution order in which every task comes after its dependencies.',
      '',
      '- Dependencies not listed as keys are tasks with no dependencies.',
      '- When several tasks are ready at once, pick them in **alphabetical** order (deterministic output).',
      "- On a cycle throw `Error('Cycle detected involving: a, b, c')` listing (alphabetically) every task that could not be scheduled.",
      '',
      'Real uses: build pipelines, DB migrations, service start-up order, monorepo task runners.',
    ),
    starterCode: js`
      function topoSort(tasks) {
        // TODO: Kahn's algorithm
      }
    `,
    solution: js`
      function topoSort(tasks) {
        const deps = new Map();
        for (const [task, list] of Object.entries(tasks)) {
          if (!deps.has(task)) deps.set(task, new Set());
          for (const dep of list) {
            deps.get(task).add(dep);
            if (!deps.has(dep)) deps.set(dep, new Set());
          }
        }

        const dependents = new Map([...deps.keys()].map((k) => [k, []]));
        const remaining = new Map();
        for (const [task, set] of deps) {
          remaining.set(task, set.size);
          for (const dep of set) dependents.get(dep).push(task);
        }

        const ready = [...deps.keys()].filter((k) => remaining.get(k) === 0).sort();
        const order = [];
        while (ready.length > 0) {
          const task = ready.shift();
          order.push(task);
          for (const next of dependents.get(task)) {
            remaining.set(next, remaining.get(next) - 1);
            if (remaining.get(next) === 0) {
              ready.push(next);
              ready.sort();
            }
          }
        }

        if (order.length !== deps.size) {
          const done = new Set(order);
          const stuck = [...deps.keys()].filter((k) => !done.has(k)).sort();
          throw new Error('Cycle detected involving: ' + stuck.join(', '));
        }
        return order;
      }
    `,
    tests: [
      t("topoSort({ build: ['compile', 'lint'], compile: ['install'], lint: ['install'], install: [] })", ['install', 'compile', 'lint', 'build']),
      t('topoSort({ c: [], b: [], a: [] })', ['a', 'b', 'c']),
      t("topoSort({ app: ['db', 'cache'] })", ['cache', 'db', 'app']),
      t("(() => { try { topoSort({ a: ['b'], b: ['c'], c: ['a'], d: [] }); return 'no error'; } catch (e) { return e.message; } })()", 'Cycle detected involving: a, b, c'),
      t("(() => { try { topoSort({ a: ['a'] }); return 'no error'; } catch (e) { return e.message; } })()", 'Cycle detected involving: a'),
      t('topoSort({})', []),
      t("topoSort({ deploy: ['test', 'build'], test: ['build'], build: ['deps'], deps: [] })", ['deps', 'build', 'test', 'deploy']),
    ],
    hints: [
      'Count unmet dependencies per task (in-degree) and keep a reverse map task → dependents.',
      'Start with every task whose count is 0; when you finish a task, decrement its dependents.',
      'If some tasks are never scheduled, they are on (or behind) a cycle.',
    ],
    explanation: md(
      'Kahn\'s algorithm: build the graph (adding implicit nodes), compute in-degrees, repeatedly take a ready task (alphabetically smallest for determinism), and release its dependents. If the output is shorter than the node count, the leftovers are on a cycle or depend on one.',
      '',
      'DFS with a "visiting" colour is the alternative and finds the exact cycle path. Tools like npm (lifecycle scripts across workspaces), Nx/Turborepo and migration runners all do this.',
      '',
      'Complexity: O(V + E) for the graph walk; the sorted ready list adds O(V log V) here (a min-heap makes that cheap at scale).',
    ),
    relatedLessonIds: ['m14-database-migrations', 'm14-ci-cd'],
  },
  {
    id: 'ch-057',
    title: 'Consistent hashing ring',
    difficulty: 'advanced',
    topic: 'Distributed systems',
    category: 'advanced',
    prompt: md(
      'Implement `class HashRing` with `new HashRing({ replicas = 100 })`, `addNode(name)`, `removeNode(name)` and `getNode(key)`.',
      '',
      '- Place `replicas` virtual points per node on a 32-bit ring using the provided `hash` (hash `name + "#" + i`).',
      '- `getNode(key)` returns the node owning the first point **clockwise** from `hash(key)` (wrap around), or `null` when the ring is empty.',
      '- Lookup must be O(log n) — keep points sorted and binary search.',
      '',
      'Properties the tests check: determinism, even-ish distribution, and that adding a node only moves keys **to the new node** (removing a node only moves **its** keys).',
    ),
    starterCode: js`
      function hash(str) {
        // FNV-1a 32-bit with a final avalanche mix
        let h = 0x811c9dc5;
        for (let i = 0; i < str.length; i++) {
          h ^= str.charCodeAt(i);
          h = Math.imul(h, 0x01000193);
        }
        h ^= h >>> 16;
        h = Math.imul(h, 0x85ebca6b);
        h ^= h >>> 13;
        h = Math.imul(h, 0xc2b2ae35);
        h ^= h >>> 16;
        return h >>> 0;
      }

      class HashRing {
        constructor({ replicas = 100 } = {}) {
          // TODO
        }
        addNode(name) {}
        removeNode(name) {}
        getNode(key) {}
      }
    `,
    solution: js`
      function hash(str) {
        // FNV-1a 32-bit with a final avalanche mix
        let h = 0x811c9dc5;
        for (let i = 0; i < str.length; i++) {
          h ^= str.charCodeAt(i);
          h = Math.imul(h, 0x01000193);
        }
        h ^= h >>> 16;
        h = Math.imul(h, 0x85ebca6b);
        h ^= h >>> 13;
        h = Math.imul(h, 0xc2b2ae35);
        h ^= h >>> 16;
        return h >>> 0;
      }

      class HashRing {
        constructor({ replicas = 100 } = {}) {
          this.replicas = replicas;
          this.points = []; // sorted [{ point, node }]
        }

        addNode(name) {
          for (let i = 0; i < this.replicas; i++) {
            this.points.push({ point: hash(name + '#' + i), node: name });
          }
          this.points.sort((a, b) => a.point - b.point);
          return this;
        }

        removeNode(name) {
          this.points = this.points.filter((p) => p.node !== name);
          return this;
        }

        getNode(key) {
          if (this.points.length === 0) return null;
          const h = hash(String(key));
          let lo = 0;
          let hi = this.points.length;
          while (lo < hi) {
            const mid = (lo + hi) >>> 1;
            if (this.points[mid].point < h) lo = mid + 1;
            else hi = mid;
          }
          return this.points[lo === this.points.length ? 0 : lo].node;
        }
      }
    `,
    tests: [
      t("[new HashRing().getNode('x'), new HashRing().addNode('A').getNode('anything')]", [null, 'A']),
      t("(() => { const r = new HashRing(); ['A', 'B', 'C'].forEach((n) => r.addNode(n)); return r.getNode('user:1') === r.getNode('user:1') && ['A', 'B', 'C'].includes(r.getNode('user:1')); })()", true),
      t("(() => { const r = new HashRing(); ['A', 'B', 'C'].forEach((n) => r.addNode(n)); const counts = { A: 0, B: 0, C: 0 }; for (let i = 0; i < 3000; i++) counts[r.getNode('key-' + i)]++; return Object.values(counts).every((c) => c > 3000 * 0.2 && c < 3000 * 0.47); })()", true),
      t("(() => { const r = new HashRing(); ['A', 'B', 'C'].forEach((n) => r.addNode(n)); const keys = Array.from({ length: 2000 }, (_, i) => 'k' + i); const before = keys.map((k) => r.getNode(k)); r.addNode('D'); const after = keys.map((k) => r.getNode(k)); const moved = keys.filter((_, i) => before[i] !== after[i]); return [moved.every((k) => r.getNode(k) === 'D'), moved.length > 0 && moved.length < keys.length * 0.5]; })()", [true, true]),
      t("(() => { const r = new HashRing(); ['A', 'B', 'C'].forEach((n) => r.addNode(n)); const keys = Array.from({ length: 2000 }, (_, i) => 'k' + i); const before = keys.map((k) => r.getNode(k)); r.removeNode('B'); return keys.every((k, i) => before[i] === 'B' ? r.getNode(k) !== 'B' : r.getNode(k) === before[i]); })()", true),
      t("(() => { const r = new HashRing({ replicas: 3 }); r.addNode('only'); return [r.points.length, r.getNode(12345)]; })()", [3, 'only']),
    ],
    hints: [
      'Store virtual points as a sorted array of `{ point, node }`.',
      'Binary search for the first point `>= hash(key)`; if none, wrap to index 0.',
      'More replicas → smoother distribution.',
    ],
    explanation: md(
      'Each node is hashed onto the ring many times (virtual nodes) to even out the load. A key belongs to the next point clockwise. Adding a node inserts new points that only take over keys from the arcs just before them, so roughly 1/n of keys move — and they all move to the new node. With naive `hash(key) % n`, changing n remaps almost every key, which would flush every cache shard.',
      '',
      'Used by: Memcached/Redis client-side sharding, DynamoDB and Cassandra partitioning, sticky load balancing (Nginx `hash ... consistent`).',
      '',
      'Complexity: `getNode` O(log(n·r)); `addNode` O(n·r log(n·r)) with a re-sort.',
    ),
    relatedLessonIds: ['m15-distributed-systems-fundamentals', 'm14-load-balancing', 'm14-horizontal-scaling'],
  },
  {
    id: 'ch-058',
    title: 'Pub/sub with topic wildcards',
    difficulty: 'advanced',
    topic: 'Messaging patterns',
    category: 'advanced',
    prompt: md(
      'Implement `class PubSub` for dot-separated topics such as `order.created`:',
      '',
      '- `subscribe(pattern, handler)` returns an `unsubscribe()` function (safe to call twice).',
      '- Pattern segments: `*` matches **exactly one** segment; `#` (only as the last segment) matches **zero or more** remaining segments.',
      '- `publish(topic, payload)` calls every matching handler as `handler(payload, topic)` in subscription order and returns how many were called.',
      '- A throwing handler must not stop the others — push the error to `bus.errors` and continue.',
      '',
      "- `order.*` matches `order.created`, not `order.item.added`. `order.#` matches `order`, `order.created` and `order.item.added`.",
    ),
    starterCode: js`
      class PubSub {
        constructor() {
          this.errors = [];
          // TODO
        }
        subscribe(pattern, handler) {
          // TODO: return an unsubscribe function
        }
        publish(topic, payload) {
          // TODO
        }
      }
    `,
    solution: js`
      function topicMatches(pattern, topic) {
        const p = pattern.split('.');
        const t = topic.split('.');
        for (let i = 0; i < p.length; i++) {
          if (p[i] === '#') return true;
          if (i >= t.length) return false;
          if (p[i] !== '*' && p[i] !== t[i]) return false;
        }
        return p.length === t.length;
      }

      class PubSub {
        constructor() {
          this.errors = [];
          this.subscriptions = [];
        }

        subscribe(pattern, handler) {
          const sub = { pattern, handler };
          this.subscriptions.push(sub);
          return () => {
            const i = this.subscriptions.indexOf(sub);
            if (i !== -1) this.subscriptions.splice(i, 1);
          };
        }

        publish(topic, payload) {
          let delivered = 0;
          for (const sub of [...this.subscriptions]) {
            if (!topicMatches(sub.pattern, topic)) continue;
            delivered++;
            try {
              sub.handler(payload, topic);
            } catch (err) {
              this.errors.push(err);
            }
          }
          return delivered;
        }
      }
    `,
    tests: [
      t("(() => { const bus = new PubSub(); const log = []; bus.subscribe('order.created', (p) => log.push('exact:' + p.id)); bus.subscribe('order.*', (p, topic) => log.push('star:' + topic)); const n = bus.publish('order.created', { id: 7 }); return [n, log]; })()", [2, ['exact:7', 'star:order.created']]),
      t("(() => { const bus = new PubSub(); bus.subscribe('order.*', () => {}); return [bus.publish('order.item.added'), bus.publish('order'), bus.publish('user.created')]; })()", [0, 0, 0]),
      t("(() => { const bus = new PubSub(); const seen = []; bus.subscribe('order.#', (p, topic) => seen.push(topic)); return [bus.publish('order'), bus.publish('order.a.b'), bus.publish('orders.x'), seen]; })()", [1, 1, 0, ['order', 'order.a.b']]),
      t("(() => { const bus = new PubSub(); let n = 0; const off = bus.subscribe('a', () => n++); bus.publish('a'); off(); off(); return [bus.publish('a'), n]; })()", [0, 1]),
      t("(() => { const bus = new PubSub(); const log = []; bus.subscribe('x', () => { throw new Error('handler failed'); }); bus.subscribe('x', () => log.push('second')); const n = bus.publish('x'); return [n, log, bus.errors.map((e) => e.message)]; })()", [2, ['second'], ['handler failed']]),
      t("(() => { const bus = new PubSub(); const log = []; bus.subscribe('*.created', (p, t) => log.push(t)); bus.subscribe('#', (p, t) => log.push('all:' + t)); bus.publish('user.created'); return log; })()", ['user.created', 'all:user.created']),
    ],
    hints: [
      'Split pattern and topic on `.` and compare segment by segment.',
      'Return a closure from `subscribe` that removes exactly that subscription object.',
      'Iterate over a copy so unsubscribing inside a handler is safe.',
    ],
    explanation: md(
      'Subscriptions are an ordered list; `publish` filters by a segment matcher where `*` consumes one segment and `#` ends the match successfully. Wrapping each handler in `try/catch` isolates subscribers — one buggy consumer must not prevent others from receiving the event.',
      '',
      'These are exactly RabbitMQ **topic exchange** semantics (`*` = one word, `#` = zero or more). In-process pub/sub decouples modules (observer pattern); across services you use a broker (RabbitMQ, Redis pub/sub, Kafka) for durability and fan-out.',
      '',
      'Complexity: `publish` O(s · k) for s subscriptions and k segments (a trie of patterns scales better).',
    ),
    relatedLessonIds: ['m15-observer-pattern', 'm15-event-driven-architecture', 'm11-message-queues'],
  },
  {
    id: 'ch-059',
    title: 'Singleflight: coalesce duplicate requests',
    difficulty: 'advanced',
    topic: 'Concurrency',
    category: 'advanced',
    prompt: md(
      'When a hot cache key expires, hundreds of requests may hit the database at once (a "cache stampede"). Write `createSingleFlight()` returning `{ do(key, fn) }`:',
      '',
      '- While a call for `key` is in flight, further `do(key, ...)` calls return the **same promise** and do not call `fn` again.',
      '- Different keys run independently.',
      '- Once the promise settles (fulfilled **or** rejected), the key is forgotten — the next call runs `fn` again.',
      '- If `fn` throws synchronously, the returned promise rejects (and the key is still cleared).',
    ),
    starterCode: js`
      function createSingleFlight() {
        // TODO
        return {
          do(key, fn) {},
        };
      }
    `,
    solution: js`
      function createSingleFlight() {
        const inflight = new Map();
        return {
          do(key, fn) {
            if (inflight.has(key)) return inflight.get(key);
            const promise = Promise.resolve()
              .then(fn)
              .finally(() => inflight.delete(key));
            inflight.set(key, promise);
            return promise;
          },
        };
      }
    `,
    tests: [
      t("(async () => { const sf = createSingleFlight(); let n = 0; const fn = () => new Promise((r) => setTimeout(() => r(++n), 10)); return Promise.all([sf.do('k', fn), sf.do('k', fn), sf.do('other', fn)]); })()", [1, 1, 2]),
      t("(async () => { const sf = createSingleFlight(); let n = 0; const fn = async () => ++n; const a = await sf.do('k', fn); const b = await sf.do('k', fn); return [a, b]; })()", [1, 2]),
      t("(async () => { const sf = createSingleFlight(); let n = 0; const failing = () => new Promise((_, rej) => setTimeout(() => rej(new Error('fail ' + ++n)), 5)); const results = await Promise.allSettled([sf.do('k', failing), sf.do('k', failing)]); const next = await sf.do('k', async () => 'recovered'); return [results.map((r) => r.reason.message), next, n]; })()", [['fail 1', 'fail 1'], 'recovered', 1]),
      t("(async () => { const sf = createSingleFlight(); const err = await sf.do('k', () => { throw new Error('sync'); }).catch((e) => e.message); const ok = await sf.do('k', () => 'fine'); return [err, ok]; })()", ['sync', 'fine']),
      t("(async () => { const sf = createSingleFlight(); const p1 = sf.do('k', () => new Promise((r) => setTimeout(() => r('v'), 5))); const p2 = sf.do('k', () => 'never'); return [p1 === p2, await p2]; })()", [true, 'v']),
    ],
    hints: ['Keep a `Map` of key → in-flight promise.', 'Delete the key in `.finally()` so both success and failure clear it.', 'Starting with `Promise.resolve().then(fn)` turns synchronous throws into rejections.'],
    explanation: md(
      'A `Map` of in-flight promises: the first caller creates and stores the promise; concurrent callers get the stored one; `finally` removes it when it settles so stale results are never served and failures are retried by the next caller. Wrapping with `Promise.resolve().then(fn)` makes sync throws behave like rejections and still runs `finally`.',
      '',
      'This is Go\'s `singleflight` and a standard defence against cache stampedes (combine with stale-while-revalidate or jittered TTLs). Note it only coalesces within one process — across instances you need a distributed lock or request collapsing at the CDN/proxy.',
      '',
      'Complexity: O(1) per call.',
    ),
    relatedLessonIds: ['m11-caching', 'm05-promises'],
  },
  {
    id: 'ch-060',
    title: 'Binary min-heap priority queue',
    difficulty: 'advanced',
    topic: 'Data structures',
    category: 'advanced',
    prompt: md(
      'Implement `class MinHeap` with `new MinHeap(compare = (a, b) => a - b)`:',
      '',
      '- `push(value)`, `pop()` (removes and returns the smallest, or `undefined` if empty), `peek()`, and a `size` getter.',
      '- `compare(a, b) < 0` means `a` has higher priority (comes out first).',
      '- `push` and `pop` must be O(log n) — use an array-backed binary heap (no sorting).',
      '',
      'Use cases: scheduling delayed jobs by `runAt`, timers, top-k, Dijkstra.',
    ),
    starterCode: js`
      class MinHeap {
        constructor(compare = (a, b) => a - b) {
          // TODO
        }
        push(value) {}
        pop() {}
        peek() {}
        get size() {}
      }
    `,
    solution: js`
      class MinHeap {
        constructor(compare = (a, b) => a - b) {
          this.compare = compare;
          this.items = [];
        }

        get size() {
          return this.items.length;
        }

        peek() {
          return this.items[0];
        }

        push(value) {
          const items = this.items;
          items.push(value);
          let i = items.length - 1;
          while (i > 0) {
            const parent = (i - 1) >> 1;
            if (this.compare(items[i], items[parent]) >= 0) break;
            [items[i], items[parent]] = [items[parent], items[i]];
            i = parent;
          }
          return this;
        }

        pop() {
          const items = this.items;
          if (items.length === 0) return undefined;
          const top = items[0];
          const last = items.pop();
          if (items.length > 0) {
            items[0] = last;
            let i = 0;
            for (;;) {
              const left = 2 * i + 1;
              const right = left + 1;
              let smallest = i;
              if (left < items.length && this.compare(items[left], items[smallest]) < 0) smallest = left;
              if (right < items.length && this.compare(items[right], items[smallest]) < 0) smallest = right;
              if (smallest === i) break;
              [items[i], items[smallest]] = [items[smallest], items[i]];
              i = smallest;
            }
          }
          return top;
        }
      }
    `,
    tests: [
      t('(() => { const h = new MinHeap(); [5, 3, 8, 1, 9, 2].forEach((n) => h.push(n)); const out = []; while (h.size) out.push(h.pop()); return out; })()', [1, 2, 3, 5, 8, 9]),
      t('(() => { const h = new MinHeap(); return [h.pop() === undefined, h.peek() === undefined, h.size]; })()', [true, true, 0]),
      t("(() => { const h = new MinHeap((a, b) => a.runAt - b.runAt); h.push({ id: 'email', runAt: 300 }); h.push({ id: 'report', runAt: 100 }); h.push({ id: 'cleanup', runAt: 200 }); return [h.peek().id, h.pop().id, h.pop().id, h.pop().id, h.size]; })()", ['report', 'report', 'cleanup', 'email', 0]),
      t('(() => { const h = new MinHeap((a, b) => b - a); [1, 5, 3].forEach((n) => h.push(n)); return [h.pop(), h.pop(), h.pop()]; })()', [5, 3, 1]),
      t('(() => { const h = new MinHeap(); [2, 2, 1, 1].forEach((n) => h.push(n)); return [h.pop(), h.pop(), h.pop(), h.pop()]; })()', [1, 1, 2, 2]),
      t('(() => { let seed = 42; const rand = () => (seed = (seed * 1103515245 + 12345) % 2147483648); const nums = Array.from({ length: 50000 }, rand); const h = new MinHeap(); nums.forEach((n) => h.push(n)); const out = []; while (h.size) out.push(h.pop()); const sorted = nums.slice().sort((a, b) => a - b); return out.length === sorted.length && out.every((v, i) => v === sorted[i]); })()', true),
    ],
    hints: [
      'Children of index `i` live at `2i + 1` and `2i + 2`; the parent is `(i - 1) >> 1`.',
      '`push`: append, then sift **up**. `pop`: move the last item to the root, then sift **down**.',
    ],
    explanation: md(
      'An array-backed complete binary tree where every parent is ≤ its children. `push` appends and swaps upward while smaller than the parent; `pop` takes the root, moves the last element to the top and swaps it down with its smaller child. Both walk one root-to-leaf path: O(log n).',
      '',
      'Keeping a sorted array instead costs O(n) per insert. Node itself uses a binary heap of timer lists (`lib/internal/priority_queue.js`) to find the next expiring timer, and job schedulers use one ordered by `runAt`.',
      '',
      'Complexity: `push`/`pop` O(log n), `peek` O(1), O(n) memory.',
    ),
    relatedLessonIds: ['m11-background-jobs', 'm05-settimeout'],
  },
];
