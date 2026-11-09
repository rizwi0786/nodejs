import { ChevronLeft, ChevronRight, Pause, Play, RefreshCw, RotateCcw } from 'lucide-react';
import { useEffect, useState } from 'react';
import { DiagramStyles, Frame, Label, Spotlight, Tag } from './primitives';
import { cx } from './tokens';

/* ================================================================================================ */
/* event-loop-phases                                                                                 */
/* ================================================================================================ */

const PHASES = [
  { name: 'timers', runs: 'Expired setTimeout / setInterval callbacks', ex: 'setTimeout(fn, 0)' },
  { name: 'pending callbacks', runs: 'I/O callbacks deferred from the previous iteration', ex: 'some TCP errors (ECONNREFUSED)' },
  { name: 'idle, prepare', runs: 'Internal libuv housekeeping', ex: 'not user-facing' },
  { name: 'poll', runs: 'Wait for new I/O events and run their callbacks (may block here)', ex: 'fs.readFile cb, socket data' },
  { name: 'check', runs: 'setImmediate callbacks', ex: 'setImmediate(fn)' },
  { name: 'close callbacks', runs: "'close' event handlers", ex: "socket.on('close', fn)" },
];

export function EventLoopPhases() {
  const period = 9;
  return (
    <Frame label="The Node.js event loop: six phases run in order — timers, pending callbacks, idle/prepare, poll, check, close callbacks — then the loop repeats while work remains. After every single callback, Node drains the process.nextTick queue and then the promise microtask queue.">
      <div className="mb-2 rounded-lg border border-line bg-raised/60 px-3 py-2 text-xs text-muted">
        <span className="font-semibold text-ink">Start:</span> run the main script synchronously, drain microtasks, then enter the loop.
      </div>
      <div className="flex gap-2 sm:gap-3">
        {/* loop-back rail */}
        <div aria-hidden className="relative w-5 shrink-0 sm:w-6">
          <div className="absolute inset-y-4 left-1/2 w-3 -translate-x-1/2 rounded-l-lg border-y-2 border-l-2 border-dashed border-accent/50" />
          <div className="absolute left-1/2 top-2 -translate-x-[1px] text-accent">
            <svg width="12" height="12" viewBox="0 0 12 12" className="fill-current">
              <path d="M12 6 4 1v10z" />
            </svg>
          </div>
        </div>
        <ol className="min-w-0 flex-1 space-y-0">
          {PHASES.map((p, i) => (
            <li key={p.name}>
              <div className="relative rounded-lg border border-line bg-surface px-3 py-2">
                <Spotlight index={i} count={PHASES.length} period={period} />
                <div className="relative flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                  <span className="font-mono text-[11px] text-faint">{i + 1}</span>
                  <span className="font-mono text-sm font-semibold text-accent">{p.name}</span>
                  <span className="text-xs text-muted">— {p.runs}</span>
                </div>
                <div className="relative mt-0.5 pl-4 font-mono text-[11px] text-faint">{p.ex}</div>
              </div>
              {i < PHASES.length - 1 && <MicroCheckpoint />}
            </li>
          ))}
        </ol>
      </div>
      <MicroCheckpoint last />
      <div className="mt-1 flex flex-col gap-2 text-xs sm:flex-row">
        <div className="flex-1 rounded-lg border border-line bg-raised/60 px-3 py-2 text-muted">
          <span className="font-semibold text-ink">Loop alive?</span> Pending timers, I/O handles or immediates → next iteration (back to timers). Otherwise the process exits.
        </div>
        <div className="flex-1 rounded-lg border border-warn/50 bg-warn/10 px-3 py-2 text-muted">
          <span className="font-semibold text-warn">Microtasks are not a phase:</span> they run between callbacks, and starving the loop with recursive nextTick is possible.
        </div>
      </div>
    </Frame>
  );
}

function MicroCheckpoint({ last }: { last?: boolean }) {
  return (
    <div className={cx('flex items-center gap-2 py-1', last ? 'pl-7 sm:pl-9' : 'pl-3')}>
      <div className="h-3 w-px bg-line" aria-hidden />
      <span className="inline-flex flex-wrap items-center gap-1 text-[10px] text-muted sm:text-[11px]">
        after each callback:
        <Tag tone="warn">nextTick queue</Tag>
        <span aria-hidden>→</span>
        <Tag tone="info">promise microtasks</Tag>
      </span>
    </div>
  );
}

/* ================================================================================================ */
/* event-loop-simulator                                                                              */
/* ================================================================================================ */

interface SimState {
  line: number | null;
  phase: string;
  stack: string[];
  ticks: string[];
  micro: string[];
  timers: string[];
  checks: string[];
  io: string | null;
  output: string[];
  note: string;
}

type Patch = Partial<Omit<SimState, 'output' | 'note'>> & { log?: string; note: string };

/** Each patch carries forward unspecified fields (except `line`, which resets to none). */
function build(patches: Patch[]): SimState[] {
  let cur: SimState = {
    line: null, phase: 'Main script', stack: [], ticks: [], micro: [], timers: [], checks: [], io: null, output: [], note: '',
  };
  return patches.map(({ log, ...rest }) => {
    cur = { ...cur, line: null, ...rest, output: log ? [...cur.output, log] : cur.output };
    return cur;
  });
}

interface Preset {
  id: string;
  title: string;
  code: string[];
  steps: SimState[];
}

const MAIN = '(main module)';

const PRESETS: Preset[] = [
  {
    id: 'basic',
    title: 'setTimeout vs Promise',
    code: [
      "console.log('A');",
      "setTimeout(() => console.log('B'), 0);",
      "Promise.resolve().then(() => console.log('C'));",
      "console.log('D');",
    ],
    steps: build([
      { stack: [MAIN], note: "Node starts running the file: the module's top-level code is pushed onto the call stack." },
      { line: 1, stack: [MAIN, "console.log('A')"], log: 'A', note: 'Synchronous code runs immediately: A is printed.' },
      { line: 2, stack: [MAIN, 'setTimeout()'], timers: ["() => log('B')  ·1ms"], note: 'setTimeout registers a timer (0 is coerced to 1 ms); its callback waits for the timers phase.' },
      { line: 3, stack: [MAIN, 'Promise.then()'], micro: ["() => log('C')"], note: 'The promise is already resolved, so .then() puts its callback on the microtask queue right away.' },
      { line: 4, stack: [MAIN, "console.log('D')"], log: 'D', note: 'Still synchronous: D is printed before any queued callback.' },
      { stack: [], phase: 'Microtasks', note: 'Top-level code finished and the stack is empty — Node drains nextTick (empty) and then the microtask queue.' },
      { line: 3, stack: ['then callback'], micro: [], log: 'C', note: 'The promise callback runs: C. Microtasks always run before the event loop moves on.' },
      { stack: [], phase: 'Timers phase', note: 'The event loop starts; in the timers phase the 1 ms timer has expired.' },
      { line: 2, stack: ['timeout callback'], timers: [], log: 'B', note: 'The timer callback runs: B.' },
      { stack: [], phase: 'Done', note: 'No timers, I/O or immediates remain, so the loop exits. Final output: A, D, C, B.' },
    ]),
  },
  {
    id: 'io',
    title: 'Inside an I/O callback',
    code: [
      "const fs = require('fs');",
      '',
      'fs.readFile(__filename, () => {',
      "  setTimeout(() => console.log('timeout'), 0);",
      "  setImmediate(() => console.log('immediate'));",
      "  process.nextTick(() => console.log('nextTick'));",
      "  Promise.resolve().then(() => console.log('promise'));",
      '});',
    ],
    steps: build([
      { stack: [MAIN], note: "Node starts running the file's top-level code." },
      { line: 1, stack: [MAIN, "require('fs')"], note: "require('fs') returns the built-in fs module (core modules resolve first)." },
      { line: 3, stack: [MAIN, 'fs.readFile()'], io: 'readFile → libuv thread pool', note: 'fs.readFile hands the read to a libuv thread-pool worker and returns immediately.' },
      { stack: [], phase: 'Microtasks', note: 'Main script done; nextTick and microtask queues are empty, so the event loop starts.' },
      { phase: 'Timers → pending → idle', note: 'No timers are due and nothing is pending, so the loop moves on to poll.' },
      { line: 3, phase: 'Poll phase', io: null, stack: ['readFile callback'], note: 'Poll: the loop waits for I/O; when the read completes, its callback runs.' },
      { line: 4, stack: ['readFile callback', 'setTimeout()'], timers: ["() => log('timeout')"], note: 'A timer is scheduled — it can only run in the timers phase of the next iteration.' },
      { line: 5, stack: ['readFile callback', 'setImmediate()'], checks: ["() => log('immediate')"], note: 'An immediate is scheduled for the check phase, which comes right after poll.' },
      { line: 6, stack: ['readFile callback', 'process.nextTick()'], ticks: ["() => log('nextTick')"], note: 'process.nextTick goes to the nextTick queue.' },
      { line: 7, stack: ['readFile callback', 'Promise.then()'], micro: ["() => log('promise')"], note: 'The .then callback goes to the microtask queue.' },
      { stack: [], phase: 'Microtasks (after callback)', note: 'The callback returned. Before continuing, Node drains the nextTick queue, then microtasks.' },
      { line: 6, stack: ['nextTick callback'], ticks: [], log: 'nextTick', note: 'nextTick callbacks always run before promise callbacks.' },
      { line: 7, stack: ['then callback'], micro: [], log: 'promise', note: 'Then the promise microtask runs.' },
      { line: 5, phase: 'Check phase', stack: ['immediate callback'], checks: [], log: 'immediate', note: 'Check follows poll, so inside an I/O callback setImmediate always beats setTimeout(0).' },
      { line: 4, phase: 'Timers phase (next iteration)', stack: ['timeout callback'], timers: [], log: 'timeout', note: 'After close callbacks the loop wraps around to timers, where the expired timer finally runs.' },
      { stack: [], phase: 'Done', note: 'Nothing left to do. Final output: nextTick, promise, immediate, timeout.' },
    ]),
  },
  {
    id: 'async',
    title: 'async / await',
    code: [
      'async function foo() {',
      "  console.log('foo start');",
      '  await bar();',
      "  console.log('foo end');",
      '}',
      'async function bar() {',
      "  console.log('bar');",
      '}',
      '',
      "console.log('script start');",
      "setTimeout(() => console.log('timeout'), 0);",
      'foo();',
      "Promise.resolve().then(() => console.log('promise'));",
      "console.log('script end');",
    ],
    steps: build([
      { stack: [MAIN], note: 'The function declarations are hoisted; execution starts at the first statement.' },
      { line: 10, stack: [MAIN, 'console.log()'], log: 'script start', note: 'Synchronous log.' },
      { line: 11, stack: [MAIN, 'setTimeout()'], timers: ["() => log('timeout')"], note: 'A timer is registered for the timers phase.' },
      { line: 12, stack: [MAIN, 'foo()'], note: 'Calling an async function runs its body synchronously until the first await.' },
      { line: 2, stack: [MAIN, 'foo()', 'console.log()'], log: 'foo start', note: "foo's first line runs right away." },
      { line: 3, stack: [MAIN, 'foo()', 'bar()'], note: 'bar() is called; its body also runs synchronously.' },
      { line: 7, stack: [MAIN, 'foo()', 'bar()', 'console.log()'], log: 'bar', note: 'bar logs, then returns an already-resolved promise.' },
      { line: 3, stack: [MAIN, 'foo()'], micro: ['resume foo after await'], note: 'await suspends foo and queues its continuation as a microtask; foo() returns a pending promise to the caller.' },
      { line: 13, stack: [MAIN, 'Promise.then()'], micro: ['resume foo after await', "() => log('promise')"], note: 'The .then callback is queued behind the foo continuation.' },
      { line: 14, stack: [MAIN, 'console.log()'], log: 'script end', note: 'The last synchronous statement.' },
      { stack: [], phase: 'Microtasks', note: 'Stack empty: the microtask queue is drained in FIFO order.' },
      { line: 4, stack: ['foo() (resumed)'], micro: ["() => log('promise')"], log: 'foo end', note: 'foo resumes after the await — code after await behaves like a .then callback.' },
      { line: 13, stack: ['then callback'], micro: [], log: 'promise', note: 'Next microtask.' },
      { line: 11, phase: 'Timers phase', stack: ['timeout callback'], timers: [], log: 'timeout', note: 'Only now does the event loop reach the timers phase.' },
      { stack: [], phase: 'Done', note: 'Final output: script start, foo start, bar, script end, foo end, promise, timeout.' },
    ]),
  },
  {
    id: 'nested',
    title: 'Nested microtasks',
    code: [
      'process.nextTick(() => {',
      "  console.log('tick 1');",
      "  Promise.resolve().then(() => console.log('promise in tick'));",
      "  process.nextTick(() => console.log('tick 2'));",
      '});',
      'Promise.resolve().then(() => {',
      "  console.log('promise 1');",
      "  process.nextTick(() => console.log('tick in promise'));",
      "  Promise.resolve().then(() => console.log('promise 2'));",
      '});',
    ],
    steps: build([
      { stack: [MAIN], note: 'Top-level code starts (CommonJS module).' },
      { line: 1, stack: [MAIN, 'process.nextTick()'], ticks: ['tick 1 callback'], note: 'The first callback goes on the nextTick queue.' },
      { line: 6, stack: [MAIN, 'Promise.then()'], micro: ['promise 1 callback'], note: 'The second goes on the promise microtask queue.' },
      { stack: [], phase: 'nextTick queue', note: 'Main script done. Node drains the nextTick queue first.' },
      { line: 2, stack: ['tick 1 callback'], ticks: [], log: 'tick 1', note: 'tick 1 runs.' },
      { line: 3, stack: ['tick 1 callback', 'Promise.then()'], micro: ['promise 1 callback', "log('promise in tick')"], note: 'A promise callback is queued behind promise 1.' },
      { line: 4, stack: ['tick 1 callback', 'process.nextTick()'], ticks: ["log('tick 2')"], note: 'A nextTick scheduled from a nextTick joins the same queue — it runs before any promise.' },
      { line: 4, stack: ['nextTick callback'], ticks: [], log: 'tick 2', note: 'The nextTick queue is drained completely, including newly added items.' },
      { line: 7, phase: 'Microtask queue', stack: ['promise 1 callback'], micro: ["log('promise in tick')"], log: 'promise 1', note: 'nextTick queue empty → V8 drains the promise microtask queue in FIFO order.' },
      { line: 8, stack: ['promise 1 callback', 'process.nextTick()'], ticks: ["log('tick in promise')"], note: 'This nextTick must wait: the microtask queue is still being drained.' },
      { line: 9, stack: ['promise 1 callback', 'Promise.then()'], micro: ["log('promise in tick')", "log('promise 2')"], note: 'A new microtask is appended to the queue being drained.' },
      { line: 3, stack: ['then callback'], micro: ["log('promise 2')"], log: 'promise in tick', note: 'FIFO: the earlier-queued microtask runs first.' },
      { line: 9, stack: ['then callback'], micro: [], log: 'promise 2', note: 'Microtasks added while draining also run in the same drain.' },
      { line: 8, phase: 'nextTick queue', stack: ['nextTick callback'], ticks: [], log: 'tick in promise', note: 'Microtasks empty — Node re-checks the nextTick queue and runs it.' },
      { stack: [], phase: 'Done', note: 'Final output: tick 1, tick 2, promise 1, promise in tick, promise 2, tick in promise.' },
    ]),
  },
  {
    id: 'timers',
    title: 'Promise chain + timers',
    code: [
      "setTimeout(() => console.log('timeout 1'), 0);",
      'setTimeout(() => {',
      "  console.log('timeout 2');",
      "  Promise.resolve().then(() => console.log('promise in timeout 2'));",
      "  setImmediate(() => console.log('immediate'));",
      '}, 0);',
      "setTimeout(() => console.log('timeout 3'), 0);",
      'Promise.resolve()',
      "  .then(() => console.log('then 1'))",
      "  .then(() => console.log('then 2'));",
    ],
    steps: build([
      { stack: [MAIN], note: 'Top-level code starts.' },
      { line: 1, stack: [MAIN, 'setTimeout()'], timers: ['timeout 1'], note: 'Timer 1 registered (1 ms).' },
      { line: 2, stack: [MAIN, 'setTimeout()'], timers: ['timeout 1', 'timeout 2'], note: 'Timer 2 registered with the same delay.' },
      { line: 7, stack: [MAIN, 'setTimeout()'], timers: ['timeout 1', 'timeout 2', 'timeout 3'], note: 'Timer 3 registered — all three expire together.' },
      { line: 9, stack: [MAIN, 'Promise.then()'], micro: ['then 1'], note: 'Only the first .then is queued; the second waits for the promise the first one returns.' },
      { stack: [], phase: 'Microtasks', note: 'Main script finished; drain microtasks before the loop starts.' },
      { line: 9, stack: ['then 1 callback'], micro: [], log: 'then 1', note: 'then 1 runs.' },
      { line: 10, stack: [], micro: ['then 2'], note: "then 1's returned promise fulfils, which queues then 2 — still in the same drain." },
      { line: 10, stack: ['then 2 callback'], micro: [], log: 'then 2', note: 'The whole chain finishes before any timer.' },
      { line: 1, phase: 'Timers phase', stack: ['timeout 1 callback'], timers: ['timeout 2', 'timeout 3'], log: 'timeout 1', note: 'The loop enters the timers phase and runs the first expired timer.' },
      { line: 3, stack: ['timeout 2 callback'], timers: ['timeout 3'], log: 'timeout 2', note: 'The second timer runs.' },
      { line: 4, stack: ['timeout 2 callback', 'Promise.then()'], micro: ['promise in timeout 2'], note: 'It queues a microtask…' },
      { line: 5, stack: ['timeout 2 callback', 'setImmediate()'], checks: ['immediate'], note: '…and an immediate for the check phase.' },
      { line: 4, phase: 'Microtasks (between timers)', stack: ['then callback'], micro: [], log: 'promise in timeout 2', note: 'Since Node 11, microtasks drain after each timer callback — before timeout 3.' },
      { line: 7, phase: 'Timers phase', stack: ['timeout 3 callback'], timers: [], log: 'timeout 3', note: 'The last expired timer runs.' },
      { line: 5, phase: 'Check phase', stack: ['immediate callback'], checks: [], log: 'immediate', note: 'Timers → (poll) → check: the immediate runs.' },
      { stack: [], phase: 'Done', note: 'Final output: then 1, then 2, timeout 1, timeout 2, promise in timeout 2, timeout 3, immediate.' },
    ]),
  },
];

function Column({
  title,
  items,
  tone,
  hint,
  stack,
}: {
  title: string;
  items: string[];
  tone: string;
  hint: string;
  stack?: boolean;
}) {
  const shown = stack ? [...items].reverse() : items;
  return (
    <div className="flex min-w-0 flex-col rounded-lg border border-line bg-surface">
      <div className="border-b border-line px-2 py-1.5">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-muted">{title}</div>
        <div className="text-[10px] text-faint">{hint}</div>
      </div>
      <ul className="flex min-h-[4.5rem] flex-1 flex-col gap-1 p-1.5" aria-label={title}>
        {shown.length === 0 ? (
          <li className="py-2 text-center text-[11px] text-faint">empty</li>
        ) : (
          shown.map((it, i) => (
            <li key={`${it}-${i}`} className={cx('break-words rounded border px-1.5 py-1 font-mono text-[11px] leading-snug', tone)}>
              {it}
            </li>
          ))
        )}
      </ul>
    </div>
  );
}

export function EventLoopSimulator() {
  const [presetIdx, setPresetIdx] = useState(0);
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);
  const preset = PRESETS[presetIdx];
  const last = preset.steps.length - 1;
  const s = preset.steps[step];

  useEffect(() => {
    if (!playing) return;
    if (step >= last) {
      setPlaying(false);
      return;
    }
    const t = window.setTimeout(() => setStep((x) => Math.min(x + 1, last)), 1200);
    return () => window.clearTimeout(t);
  }, [playing, step, last]);

  const choose = (i: number) => {
    setPresetIdx(i);
    setStep(0);
    setPlaying(false);
  };

  const prevOutputLen = step > 0 ? preset.steps[step - 1].output.length : 0;

  return (
    <div data-no-shortcuts role="group" aria-label="Interactive event loop simulator" className="w-full min-w-0 text-ink">
      <DiagramStyles />
      {/* preset tabs */}
      <div role="tablist" aria-label="Code examples" className="-mx-1 mb-3 flex gap-1 overflow-x-auto px-1 pb-1">
        {PRESETS.map((p, i) => (
          <button
            key={p.id}
            role="tab"
            type="button"
            aria-selected={i === presetIdx}
            onClick={() => choose(i)}
            className={cx(
              'shrink-0 whitespace-nowrap rounded-md border px-2.5 py-1 text-xs font-medium transition-colors',
              i === presetIdx ? 'border-accent/60 bg-accent/10 text-accent' : 'border-line text-muted hover:bg-raised hover:text-ink',
            )}
          >
            {p.title}
          </button>
        ))}
      </div>

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        {/* code */}
        <div className="min-w-0 overflow-hidden rounded-lg border border-line bg-code">
          <div className="flex items-center justify-between border-b border-line px-3 py-1.5">
            <span className="font-mono text-[11px] text-faint">example.js</span>
            <Tag tone="info">{s.phase}</Tag>
          </div>
          <pre className="overflow-x-auto py-2 font-mono text-[12px] leading-5" aria-label="Code">
            {preset.code.map((ln, i) => {
              const active = s.line === i + 1;
              return (
                <div
                  key={i}
                  aria-current={active ? 'step' : undefined}
                  className={cx('flex border-l-2 pr-3', active ? 'border-accent bg-accent/15' : 'border-transparent')}
                >
                  <span className="w-8 shrink-0 select-none pr-2 text-right text-faint">{i + 1}</span>
                  <code className={cx('whitespace-pre', active ? 'text-ink' : 'text-muted')}>{ln || ' '}</code>
                </div>
              );
            })}
          </pre>
        </div>

        {/* explanation + output */}
        <div className="flex min-w-0 flex-col gap-3">
          <div className="rounded-lg border border-accent/40 bg-accent/5 px-3 py-2" aria-live="polite">
            <div className="flex items-center justify-between gap-2">
              <Label>
                Step {step + 1} / {last + 1}
              </Label>
              {s.io && <Tag tone="warn">{s.io}</Tag>}
            </div>
            <p className="mt-1 text-sm leading-relaxed text-ink">{s.note}</p>
          </div>
          <div className="flex min-h-[6rem] flex-1 flex-col rounded-lg border border-line bg-code">
            <div className="border-b border-line px-3 py-1.5 font-mono text-[11px] text-faint">Console output</div>
            <ol className="flex-1 space-y-0.5 px-3 py-2 font-mono text-[12px]" aria-label="Console output">
              {s.output.length === 0 && <li className="text-faint">—</li>}
              {s.output.map((o, i) => (
                <li key={i} className={cx('flex gap-2', i >= prevOutputLen ? 'text-accent' : 'text-ink')}>
                  <span className="select-none text-faint">&gt;</span>
                  {o}
                </li>
              ))}
            </ol>
          </div>
        </div>
      </div>

      {/* queues */}
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        <Column title="Call stack" hint="top first" items={s.stack} stack tone="border-line bg-raised text-ink" />
        <Column title="nextTick queue" hint="process.nextTick" items={s.ticks} tone="border-warn/50 bg-warn/10 text-ink" />
        <Column title="Microtask queue" hint="promises, await" items={s.micro} tone="border-info/50 bg-info/10 text-ink" />
        <Column title="Timers" hint="macrotask · timers phase" items={s.timers} tone="border-accent/50 bg-accent/10 text-ink" />
        <Column title="Check" hint="setImmediate" items={s.checks} tone="border-danger/40 bg-danger/10 text-ink" />
      </div>

      {/* controls */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button type="button" className="btn-outline" onClick={() => { setPlaying(false); setStep((x) => Math.max(0, x - 1)); }} disabled={step === 0} aria-label="Previous step">
          <ChevronLeft size={16} aria-hidden /> Prev
        </button>
        <button type="button" className="btn-primary" onClick={() => { setPlaying(false); setStep((x) => Math.min(last, x + 1)); }} disabled={step === last} aria-label="Next step">
          Next <ChevronRight size={16} aria-hidden />
        </button>
        <button
          type="button"
          className="btn-outline"
          onClick={() => {
            if (step === last) setStep(0);
            setPlaying((p) => !p);
          }}
          aria-pressed={playing}
          aria-label={playing ? 'Pause' : 'Play'}
        >
          {playing ? <Pause size={16} aria-hidden /> : step === last ? <RefreshCw size={16} aria-hidden /> : <Play size={16} aria-hidden />}
          {playing ? 'Pause' : 'Play'}
        </button>
        <button type="button" className="btn-ghost" onClick={() => { setPlaying(false); setStep(0); }} aria-label="Reset">
          <RotateCcw size={16} aria-hidden /> Reset
        </button>
        <div className="ml-auto h-1.5 w-24 overflow-hidden rounded-full bg-raised" aria-hidden>
          <div className="h-full rounded-full bg-accent transition-[width] duration-300" style={{ width: `${(step / last) * 100}%` }} />
        </div>
      </div>
    </div>
  );
}
