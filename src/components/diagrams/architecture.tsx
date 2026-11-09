import { Cpu, FileCode2, HardDrive, Network, Package, RefreshCw } from 'lucide-react';
import type { CSSProperties, ReactNode } from 'react';
import { Arrow, Box, Frame, Label, Legend, Tag, Travel } from './primitives';
import { cx } from './tokens';

/* ================================================================================================ */
/* node-architecture                                                                                 */
/* ================================================================================================ */

export function NodeArchitecture() {
  return (
    <Frame label="Node.js architecture. Your JavaScript calls Node's JavaScript APIs such as fs, http and crypto. These call C++ bindings, which sit on V8 (the JavaScript engine that parses, JIT-compiles and garbage-collects) and libuv (the event loop and async I/O library). libuv sends network I/O to the operating system's non-blocking mechanisms (epoll, kqueue, IOCP) and runs file system, dns.lookup, crypto and zlib work on a thread pool of four threads by default.">
      <div className="space-y-1.5">
        <Box tone="accent" icon={<FileCode2 size={14} />} title="Your application code (JavaScript)" sub="app.js, npm packages — runs on a single main thread" />
        <Arrow dir="down" />
        <Box title="Node.js core API (lib/*.js)" sub="fs · http · net · crypto · stream · events · timers · child_process">
          <div className="mt-1.5 flex flex-wrap gap-1">
            {['fs', 'http', 'crypto', 'stream', 'events'].map((m) => (
              <Tag key={m}>{m}</Tag>
            ))}
          </div>
        </Box>
        <Arrow dir="down" />
        <Box tone="muted" title="Node bindings (C++)" sub="Glue that exposes C/C++ functionality to JavaScript" />
        <Arrow dir="down" />
        <div className="grid gap-2 sm:grid-cols-2">
          <Box tone="info" icon={<Cpu size={14} />} title="V8" sub="Parses & JIT-compiles JS, manages the heap and garbage collection, runs microtasks (promises)" />
          <Box tone="warn" icon={<RefreshCw size={14} />} title="libuv" sub="Event loop, timers, async I/O abstraction across platforms">
            <div className="mt-2 grid grid-cols-1 gap-1.5 min-[420px]:grid-cols-2">
              <div className="rounded-md border border-line bg-surface px-2 py-1.5 text-[11px] leading-snug">
                <div className="font-semibold">OS async I/O</div>
                <div className="text-muted">epoll · kqueue · IOCP — TCP/UDP sockets, pipes</div>
              </div>
              <div className="rounded-md border border-line bg-surface px-2 py-1.5 text-[11px] leading-snug">
                <div className="font-semibold">Thread pool (4)</div>
                <div className="text-muted">fs, dns.lookup, crypto, zlib</div>
              </div>
            </div>
          </Box>
        </div>
        <div className="flex flex-wrap items-center gap-1 pt-0.5 text-[11px] text-muted">
          <span>Other bundled libraries:</span>
          {['llhttp', 'OpenSSL', 'zlib', 'c-ares', 'ICU'].map((m) => (
            <Tag key={m}>{m}</Tag>
          ))}
        </div>
        <Arrow dir="down" />
        <Box tone="muted" icon={<HardDrive size={14} />} title="Operating system" sub="Kernel: files, network, processes, threads" />
      </div>
    </Frame>
  );
}

/* ================================================================================================ */
/* thread-pool                                                                                       */
/* ================================================================================================ */

const POOL_TASKS = [
  { name: 'fs.readFile', tone: 'info' as const },
  { name: 'crypto.pbkdf2', tone: 'warn' as const },
  { name: 'zlib.gzip', tone: 'accent' as const },
  { name: 'dns.lookup', tone: 'info' as const },
];

export function ThreadPool() {
  return (
    <Frame label="libuv thread pool. The single main thread runs JavaScript and the event loop. Blocking-style work — fs operations, dns.lookup, crypto.pbkdf2, scrypt and randomBytes, and zlib — is queued to libuv's thread pool, which has 4 threads by default (UV_THREADPOOL_SIZE, up to 1024). A fifth task waits in the queue until a thread frees up. When a worker finishes, its callback is queued back to the event loop. Network sockets do not use the pool; they use the OS kernel's non-blocking APIs (epoll, kqueue, IOCP).">
      <div className="flex flex-col gap-2 md:flex-row md:items-stretch">
        <Box tone="accent" className="md:w-44" title="Main thread" sub="Runs your JS + the event loop">
          <ul className="mt-2 space-y-1 font-mono text-[11px]">
            <li className="text-muted">fs.readFile(…)</li>
            <li className="text-muted">crypto.pbkdf2(…)</li>
            <li className="text-muted">zlib.gzip(…)</li>
            <li className="text-muted">dns.lookup(…)</li>
            <li className="text-muted">crypto.scrypt(…)</li>
          </ul>
        </Box>
        <Arrow label="submit" />
        <Box tone="muted" className="md:w-36" title="Work queue" sub="FIFO">
          <div className="mt-2 rounded border border-dashed border-warn/60 bg-warn/10 px-1.5 py-1 font-mono text-[11px] text-warn">crypto.scrypt — waiting</div>
          <div className="mt-1 text-[10px] text-faint">5th task waits for a free thread</div>
        </Box>
        <Arrow />
        <div className="min-w-0 flex-1 rounded-lg border border-warn/50 bg-warn/5 p-2">
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <Label>libuv thread pool</Label>
            <Tag tone="warn">UV_THREADPOOL_SIZE=4</Tag>
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            {POOL_TASKS.map((t, i) => (
              <div key={t.name} className="rounded-md border border-line bg-surface px-2 py-1.5">
                <div className="text-[10px] text-faint">thread {i + 1}</div>
                <div className="font-mono text-[11px] text-ink">{t.name}</div>
                <div className="mt-1 h-1 overflow-hidden rounded-full bg-raised">
                  <div
                    className="h-full origin-left rounded-full bg-warn/80"
                    style={{ animation: `dg-fill ${2 + i * 0.6}s ease-in-out ${i * 0.3}s infinite`, transform: 'scaleX(0.6)' } as CSSProperties}
                  />
                </div>
              </div>
            ))}
          </div>
          <div className="mt-1.5 text-[10px] text-muted">done → callback queued back to the event loop (poll phase)</div>
        </div>
      </div>
      <div className="mt-3 flex items-start gap-2 rounded-lg border border-info/50 bg-info/10 px-3 py-2 text-xs">
        <Network size={14} className="mt-0.5 shrink-0 text-info" aria-hidden />
        <div className="text-muted">
          <span className="font-semibold text-info">Not in the pool:</span> network I/O (http, net, sockets) is handed to the kernel —
          epoll (Linux), kqueue (macOS/BSD), IOCP (Windows) — so thousands of connections need no extra threads. Timers live in the loop itself.
          Note <span className="font-mono">dns.resolve*</span> uses c-ares over the network, unlike <span className="font-mono">dns.lookup</span>.
        </div>
      </div>
    </Frame>
  );
}

/* ================================================================================================ */
/* module-resolution                                                                                 */
/* ================================================================================================ */

function Decision({ n, q, yes, children }: { n: number; q: string; yes: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5 sm:flex-row sm:items-stretch">
      <div className="min-w-0 flex-1 rounded-lg border border-line bg-surface px-3 py-2">
        <div className="flex items-baseline gap-2">
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-raised font-mono text-[11px] text-muted">{n}</span>
          <span className="text-sm font-semibold">{q}</span>
        </div>
        {children && <div className="mt-1 pl-7 text-xs leading-relaxed text-muted">{children}</div>}
      </div>
      <div className="flex items-center gap-1.5 pl-7 sm:w-48 sm:pl-0">
        <span className="font-mono text-[10px] text-accent">yes →</span>
        <div className="min-w-0 flex-1 rounded-md border border-accent/50 bg-accent/10 px-2 py-1 text-[11px] leading-snug text-ink">{yes}</div>
      </div>
    </div>
  );
}

export function ModuleResolution() {
  return (
    <Frame label="How require(X) resolves a module. Step 1: if X is a core module such as fs or node:path, return the built-in. Step 2: if X starts with ./, ../ or /, try it as a file (exact name, then .js, .json, .node) and then as a directory (package.json main, then index.js, index.json, index.node). Step 3: otherwise walk up the directory tree looking in each node_modules folder, honouring package.json exports. Step 4: the resolved absolute filename is looked up in require.cache; on a hit the cached module.exports is returned, otherwise the file is wrapped, executed and cached. If nothing matches, MODULE_NOT_FOUND is thrown.">
      <div className="mb-2 inline-flex items-center gap-2 rounded-lg border border-line bg-raised px-3 py-1.5 font-mono text-sm">
        <Package size={14} className="text-accent" aria-hidden /> require(X)
      </div>
      <div className="space-y-1.5">
        <Decision n={1} q="Core module?" yes="return built-in (never touches disk)">
          <span className="font-mono">fs</span>, <span className="font-mono">http</span>, <span className="font-mono">node:path</span> — the <span className="font-mono">node:</span> prefix forces core.
        </Decision>
        <Decision n={2} q="Starts with ./  ../  or / ?" yes="resolved file path">
          <div>
            <span className="font-semibold text-ink">As file:</span> <span className="font-mono">X</span> → <span className="font-mono">X.js</span> → <span className="font-mono">X.json</span> → <span className="font-mono">X.node</span>
          </div>
          <div>
            <span className="font-semibold text-ink">As directory:</span> <span className="font-mono">X/package.json "main"</span> → <span className="font-mono">X/index.js</span> → <span className="font-mono">index.json</span> → <span className="font-mono">index.node</span>
          </div>
        </Decision>
        <Decision n={3} q="Bare name → walk up node_modules" yes="resolved file in a package">
          <div className="font-mono text-[11px] leading-5">
            <div>/app/src/node_modules/X</div>
            <div>/app/node_modules/X</div>
            <div>/node_modules/X</div>
          </div>
          <div>Package <span className="font-mono">"exports"</span> takes precedence over <span className="font-mono">"main"</span>; then NODE_PATH / global folders.</div>
        </Decision>
        <div className="flex items-center gap-2 pl-3 text-[11px] text-muted">
          <Arrow dir="down" />
          <span>resolved absolute filename</span>
        </div>
        <Decision n={4} q="In require.cache?" yes="return cached module.exports (same object every time)">
          Miss → wrap in the module function, execute, store in <span className="font-mono">require.cache[filename]</span>, return <span className="font-mono">module.exports</span>.
        </Decision>
        <div className="rounded-lg border border-danger/50 bg-danger/10 px-3 py-1.5 text-xs text-muted">
          <span className="font-mono font-semibold text-danger">Error: Cannot find module 'X'</span> (code MODULE_NOT_FOUND) if steps 1–3 find nothing.
        </div>
      </div>
    </Frame>
  );
}

/* ================================================================================================ */
/* blocking-vs-nonblocking                                                                           */
/* ================================================================================================ */

type Seg = { start: number; len: number; kind: 'cpu' | 'wait' | 'io' | 'cb'; label?: string };

function Track({ label, segs }: { label: string; segs: Seg[] }) {
  const cls: Record<Seg['kind'], string> = {
    cpu: 'bg-accent/80 text-accent-ink',
    wait: 'border border-dashed border-danger/60 bg-danger/10 text-danger',
    io: 'bg-info/25 text-info border border-info/50',
    cb: 'bg-accent/80 text-accent-ink',
  };
  return (
    <div className="flex items-center gap-2">
      <div className="w-16 shrink-0 text-right font-mono text-[10px] leading-tight text-muted sm:w-24 sm:text-[11px]">{label}</div>
      <div className="relative h-6 flex-1 rounded bg-raised/60">
        {segs.map((s, i) => (
          <div
            key={i}
            className={cx('absolute inset-y-0.5 flex items-center justify-center overflow-hidden rounded-sm text-[10px] font-medium', cls[s.kind])}
            style={{ left: `${s.start}%`, width: `${s.len}%` }}
          >
            <span className="truncate px-0.5">{s.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function BlockingVsNonBlocking() {
  return (
    <Frame label="Timeline comparison. Blocking: three readFileSync calls of 100 ms each run one after another; the main thread is stuck waiting for 300 ms and cannot serve other requests. Non-blocking: three fs.readFile calls are started immediately, the reads overlap in the background, and the main thread is free; each callback runs briefly when its read finishes, so all three complete in about 100 ms.">
      <div className="space-y-4">
        <div>
          <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-1">
            <span className="text-sm font-semibold text-danger">Blocking — fs.readFileSync ×3</span>
            <span className="font-mono text-[11px] text-muted">≈ 300 ms, thread frozen</span>
          </div>
          <div className="space-y-1">
            <Track
              label="main thread"
              segs={[
                { start: 0, len: 2, kind: 'cpu' },
                { start: 2, len: 30, kind: 'wait', label: 'wait A' },
                { start: 32, len: 2, kind: 'cpu' },
                { start: 34, len: 30, kind: 'wait', label: 'wait B' },
                { start: 64, len: 2, kind: 'cpu' },
                { start: 66, len: 30, kind: 'wait', label: 'wait C' },
                { start: 96, len: 3, kind: 'cpu' },
              ]}
            />
            <Track label="other reqs" segs={[{ start: 0, len: 99, kind: 'wait', label: 'queued — cannot run' }]} />
          </div>
        </div>
        <div>
          <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-1">
            <span className="text-sm font-semibold text-accent">Non-blocking — fs.readFile ×3</span>
            <span className="font-mono text-[11px] text-muted">≈ 100 ms, thread free</span>
          </div>
          <div className="space-y-1">
            <Track
              label="main thread"
              segs={[
                { start: 0, len: 4, kind: 'cpu', label: 'start' },
                { start: 8, len: 6, kind: 'cpu', label: 'req' },
                { start: 18, len: 6, kind: 'cpu', label: 'req' },
                { start: 31, len: 2, kind: 'cb' },
                { start: 33, len: 2, kind: 'cb' },
                { start: 35, len: 2, kind: 'cb' },
              ]}
            />
            <Track label="I/O A" segs={[{ start: 1, len: 29, kind: 'io', label: 'read A' }]} />
            <Track label="I/O B" segs={[{ start: 2, len: 30, kind: 'io', label: 'read B' }]} />
            <Track label="I/O C" segs={[{ start: 3, len: 31, kind: 'io', label: 'read C' }]} />
          </div>
        </div>
        <div className="flex items-center gap-2 pl-[4.5rem] sm:pl-[6.5rem]">
          <div className="relative h-px flex-1 bg-line">
            <span className="absolute -top-1.5 left-0 font-mono text-[10px] text-faint">0</span>
            <span className="absolute -top-1.5 left-1/3 font-mono text-[10px] text-faint">100ms</span>
            <span className="absolute -top-1.5 left-2/3 font-mono text-[10px] text-faint">200ms</span>
            <span className="absolute -top-1.5 right-0 font-mono text-[10px] text-faint">300ms</span>
          </div>
        </div>
      </div>
      <Legend
        items={[
          { tone: 'accent', label: 'JS running on main thread' },
          { tone: 'danger', label: 'main thread blocked', dashed: true },
          { tone: 'info', label: 'I/O in progress (thread pool / kernel)' },
        ]}
      />
    </Frame>
  );
}

/* ================================================================================================ */
/* heap-stack                                                                                        */
/* ================================================================================================ */

export function HeapStack() {
  return (
    <Frame label="Stack versus heap in V8. The call stack holds frames for main, handleRequest and formatUser, each with local variables: primitives are stored inline and objects are stored as references. The references point to objects on the heap. The heap is split into new space (the young generation, collected often by the fast Scavenge minor GC), old space (objects that survived two scavenges, collected by Mark-Sweep-Compact major GC), plus large object space and code space. Objects with no references from the stack or other roots become garbage.">
      <div className="grid gap-3 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <div className="min-w-0">
          <Label className="mb-1.5">Call stack (LIFO, per thread)</Label>
          <div className="space-y-1">
            {[
              { fn: 'formatUser(user)', vars: [['user', '→ #2'], ['label', '→ #4']] },
              { fn: 'handleRequest(req)', vars: [['req', '→ #1'], ['id', '42']] },
              { fn: 'main()', vars: [['server', '→ #3']] },
            ].map((f, i) => (
              <div key={f.fn} className={cx('rounded-lg border px-2.5 py-1.5', i === 0 ? 'border-accent/60 bg-accent/10' : 'border-line bg-surface')}>
                <div className="font-mono text-xs font-semibold">{f.fn}</div>
                <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 font-mono text-[11px]">
                  {f.vars.map(([k, v]) => (
                    <span key={k} className="text-muted">
                      {k} <span className={v.startsWith('→') ? 'text-info' : 'text-ink'}>{v}</span>
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <p className="mt-1.5 text-[11px] leading-snug text-muted">Primitives are stored inline; objects are references (→) into the heap. Frames pop when functions return.</p>
        </div>
        <div className="min-w-0">
          <Label className="mb-1.5">Heap (garbage-collected)</Label>
          <div className="grid gap-1.5 sm:grid-cols-2">
            <div className="rounded-lg border border-info/50 bg-info/5 p-2">
              <div className="text-xs font-semibold text-info">New space (young)</div>
              <div className="text-[10px] text-muted">Scavenge — minor GC, frequent & fast</div>
              <div className="mt-1.5 flex flex-wrap gap-1">
                <HeapObj id="#1" t="req {…}" />
                <HeapObj id="#2" t="user {…}" />
                <HeapObj id="#4" t="'Ada (42)'" />
                <HeapObj id="#5" t="[tmp]" garbage />
              </div>
            </div>
            <div className="rounded-lg border border-warn/50 bg-warn/5 p-2">
              <div className="text-xs font-semibold text-warn">Old space</div>
              <div className="text-[10px] text-muted">Survived 2 scavenges → Mark-Sweep-Compact (major GC)</div>
              <div className="mt-1.5 flex flex-wrap gap-1">
                <HeapObj id="#3" t="server" />
                <HeapObj id="#6" t="cache Map" />
              </div>
            </div>
            <div className="rounded-lg border border-dashed border-line bg-raised/60 px-2 py-1.5 text-[11px] text-muted sm:col-span-2">
              Also: large object space · code space. Limit set by <span className="font-mono">--max-old-space-size</span>.
            </div>
          </div>
          <div className="mt-1.5 text-[11px] text-muted">
            <span className="font-mono text-danger">#5</span> has no references from any root → collected at the next scavenge.
          </div>
        </div>
      </div>
    </Frame>
  );
}

function HeapObj({ id, t, garbage }: { id: string; t: string; garbage?: boolean }) {
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1 rounded border px-1.5 py-0.5 font-mono text-[11px]',
        garbage ? 'border-dashed border-danger/60 text-danger line-through decoration-danger/50' : 'border-line bg-surface text-ink',
      )}
    >
      <span className="text-faint">{id}</span>
      {t}
    </span>
  );
}

/* ================================================================================================ */
/* cluster                                                                                           */
/* ================================================================================================ */

export function Cluster() {
  return (
    <Frame label="Node.js cluster module. Incoming connections arrive on one shared port, 3000. The primary process listens on that port and hands each connection to a worker in round-robin order (the default on every platform except Windows). The primary forks one worker per CPU core with cluster.fork(); each worker is a separate process with its own V8 heap and event loop, talking to the primary over an IPC channel. If a worker exits, the primary receives an exit event and forks a replacement.">
      <div className="flex flex-col items-stretch gap-2">
        <div className="relative mx-auto flex w-full max-w-sm items-center justify-center gap-2 rounded-lg border border-line bg-raised px-3 py-1.5 text-xs">
          <Network size={14} className="text-muted" aria-hidden />
          <span>Incoming connections</span>
          <Tag tone="info">:3000</Tag>
        </div>
        <Arrow dir="down" />
        <Box tone="accent" className="mx-auto w-full max-w-md text-center" title={<span className="w-full">Primary process</span>}>
          <div className="mt-1 text-xs text-muted">
            <span className="font-mono">cluster.isPrimary</span> · forks <span className="font-mono">os.availableParallelism()</span> workers · owns the listening socket
          </div>
          <div className="mt-1.5 flex flex-wrap justify-center gap-1">
            <Tag tone="accent">round-robin scheduling</Tag>
            <Tag>on 'exit' → cluster.fork()</Tag>
          </div>
        </Box>
        <div className="relative mx-auto h-5 w-full max-w-md" aria-hidden>
          <div className="absolute left-[12.5%] right-[12.5%] top-1/2 border-t border-line" />
          <div className="absolute inset-y-0 left-[12.5%] right-[12.5%]">
            <Travel tone="accent" duration={3} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[1, 2, 3, 4].map((w) => (
            <div key={w} className={cx('rounded-lg border px-2 py-2 text-center', w === 4 ? 'border-dashed border-danger/60 bg-danger/5' : 'border-line bg-surface')}>
              <div className="text-sm font-semibold">Worker {w}</div>
              <div className="font-mono text-[10px] text-faint">pid {4100 + w}</div>
              <div className="mt-1 text-[10px] leading-snug text-muted">own V8 heap + event loop</div>
              {w === 4 ? <Tag tone="danger" className="mt-1">crashed → re-forked</Tag> : <Tag className="mt-1">IPC ↔ primary</Tag>}
            </div>
          ))}
        </div>
      </div>
      <p className="mt-3 text-[11px] leading-snug text-muted">
        Workers share no memory — keep sessions/caches in Redis. On Windows the default policy lets the OS distribute connections instead of round-robin.
        In production, PM2 or one container per core are common alternatives.
      </p>
    </Frame>
  );
}
