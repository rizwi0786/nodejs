/// <reference lib="webworker" />
// Runs untrusted learner code in a dedicated Web Worker: no DOM, no
// localStorage, no access to the app. The page terminates the worker on timeout.
import { formatLogArgs, inspect } from './inspect';

type Line = { stream: 'out' | 'err'; text: string };
export type WorkerRequest =
  | { type: 'run'; code: string }
  | { type: 'test'; code: string; tests: { call: string; expected: string }[] };
export type WorkerResponse =
  | { type: 'line'; line: Line }
  | { type: 'done' }
  | {
      type: 'results';
      results: { call: string; expected: string; actual: string; pass: boolean; error?: string }[];
      error?: string;
    };

const scope = self as unknown as DedicatedWorkerGlobalScope;
const post = (m: WorkerResponse) => scope.postMessage(m);
const emit = (stream: Line['stream'], args: unknown[]) => post({ type: 'line', line: { stream, text: formatLogArgs(args) } });

const NODE_ONLY: Record<string, string> = {
  require: 'require() is a Node.js API',
  process: 'process is a Node.js global',
  setImmediate: 'setImmediate is a Node.js API',
  Buffer: 'Buffer is a Node.js global',
  __dirname: '__dirname only exists in Node.js CommonJS modules',
  module: 'module is a Node.js CommonJS binding',
};

function describeError(e: unknown): string {
  if (e instanceof Error) {
    const m = /^(\w+) is not defined$/.exec(e.message);
    const hint =
      m && NODE_ONLY[m[1]] ? `\n  ↳ ${NODE_ONLY[m[1]]} — run this example with Node instead of the browser sandbox.` : '';
    return `${e.name}: ${e.message}${hint}`;
  }
  return inspect(e);
}

// ── Timer tracking: a run is "done" once no timers remain ──
let pending = 0;
let onIdle: (() => void) | null = null;
const realSetTimeout = scope.setTimeout.bind(scope);
const realClearTimeout = scope.clearTimeout.bind(scope);
const realSetInterval = scope.setInterval.bind(scope);
const realClearInterval = scope.clearInterval.bind(scope);
const liveTimeouts = new Set<number>();
const liveIntervals = new Set<number>();

function checkIdle() {
  // A macrotask hop lets trailing microtasks settle before declaring the run finished.
  if (pending === 0 && onIdle) realSetTimeout(() => pending === 0 && onIdle?.(), 0);
}

const g = scope as unknown as Record<string, unknown>;
g.setTimeout = (fn: (...a: unknown[]) => void, ms?: number, ...args: unknown[]) => {
  pending++;
  const id = realSetTimeout(() => {
    liveTimeouts.delete(id);
    pending--;
    try {
      fn(...args);
    } catch (e) {
      emit('err', [`Uncaught ${describeError(e)}`]);
    }
    checkIdle();
  }, ms);
  liveTimeouts.add(id);
  return id;
};
g.clearTimeout = (id: number) => {
  if (liveTimeouts.delete(id)) {
    pending--;
    realClearTimeout(id);
    checkIdle();
  }
};
g.setInterval = (fn: (...a: unknown[]) => void, ms?: number, ...args: unknown[]) => {
  pending++;
  const id = realSetInterval(() => {
    try {
      fn(...args);
    } catch (e) {
      emit('err', [`Uncaught ${describeError(e)}`]);
    }
  }, ms);
  liveIntervals.add(id);
  return id;
};
g.clearInterval = (id: number) => {
  if (liveIntervals.delete(id)) {
    pending--;
    realClearInterval(id);
    checkIdle();
  }
};

g.console = {
  log: (...a: unknown[]) => emit('out', a),
  info: (...a: unknown[]) => emit('out', a),
  debug: (...a: unknown[]) => emit('out', a),
  dir: (d: unknown) => emit('out', [d]),
  table: (d: unknown) => emit('out', [d]),
  warn: (...a: unknown[]) => emit('err', a),
  error: (...a: unknown[]) => emit('err', a),
};

scope.addEventListener('unhandledrejection', (ev: PromiseRejectionEvent) => {
  ev.preventDefault();
  emit('err', [`Uncaught (in promise) ${describeError(ev.reason)}`]);
});

// Indirect eval runs the code as a classic (sloppy-mode) global script.
const globalEval = (src: string): unknown => (0, eval)(src);

scope.onmessage = async (ev: MessageEvent<WorkerRequest>) => {
  const msg = ev.data;
  if (msg.type === 'run') {
    try {
      globalEval(msg.code);
    } catch (e) {
      emit('err', [`Uncaught ${describeError(e)}`]);
    }
    onIdle = () => post({ type: 'done' });
    checkIdle();
    return;
  }

  // Challenge tests: define the learner's code, then evaluate each test call.
  try {
    globalEval(msg.code);
  } catch (e) {
    post({ type: 'results', results: [], error: describeError(e) });
    return;
  }
  const results = [];
  for (const t of msg.tests) {
    try {
      const value = await globalEval(`(${t.call})`);
      const actual = value === undefined ? 'undefined' : JSON.stringify(value);
      results.push({ call: t.call, expected: t.expected, actual, pass: actual === t.expected });
    } catch (e) {
      results.push({ call: t.call, expected: t.expected, actual: '', pass: false, error: describeError(e) });
    }
  }
  post({ type: 'results', results });
};
