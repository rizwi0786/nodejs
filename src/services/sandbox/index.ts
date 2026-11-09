import type { WorkerRequest, WorkerResponse } from './worker';

export interface OutputLine {
  stream: 'out' | 'err' | 'info';
  text: string;
}

export interface TestResult {
  call: string;
  expected: string;
  actual: string;
  pass: boolean;
  error?: string;
}

const TIMEOUT_MS = 4000;

const spawn = () => new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });

/**
 * Runs JavaScript in a fresh, isolated Web Worker. Lines stream to `onLine`.
 * Finishes when every timer has fired, or after a hard timeout (infinite loops).
 */
export function runCode(code: string, onLine: (l: OutputLine) => void): { done: Promise<void>; cancel: () => void } {
  const worker = spawn();
  let finish!: () => void;
  let finished = false;
  const done = new Promise<void>((r) => (finish = r));
  const end = (info?: string) => {
    if (finished) return;
    finished = true;
    if (info) onLine({ stream: 'info', text: info });
    worker.terminate();
    window.clearTimeout(timer);
    finish();
  };
  const timer = window.setTimeout(
    () => end(`Stopped after ${TIMEOUT_MS / 1000}s — an infinite loop, or a timer that never ends?`),
    TIMEOUT_MS,
  );
  worker.onmessage = (ev: MessageEvent<WorkerResponse>) => {
    const m = ev.data;
    if (m.type === 'line') onLine(m.line);
    else if (m.type === 'done') end();
  };
  worker.onerror = (ev) => {
    ev.preventDefault();
    end(`Error: ${ev.message || 'the code could not be parsed'}`);
  };
  worker.postMessage({ type: 'run', code } satisfies WorkerRequest);
  return { done, cancel: () => end('Stopped.') };
}

/** Runs a challenge's tests against the learner's code. */
export function runTests(
  code: string,
  tests: { call: string; expected: string }[],
): Promise<{ results: TestResult[]; error?: string; logs: OutputLine[] }> {
  return new Promise((resolve) => {
    const worker = spawn();
    const logs: OutputLine[] = [];
    const finish = (r: { results: TestResult[]; error?: string }) => {
      window.clearTimeout(timer);
      worker.terminate();
      resolve({ ...r, logs });
    };
    const timer = window.setTimeout(
      () => finish({ results: [], error: `Timed out after ${TIMEOUT_MS / 1000}s — check for infinite loops or promises that never settle.` }),
      TIMEOUT_MS,
    );
    worker.onmessage = (ev: MessageEvent<WorkerResponse>) => {
      const m = ev.data;
      if (m.type === 'line') logs.push(m.line);
      if (m.type === 'results') finish({ results: m.results, error: m.error });
    };
    worker.onerror = (ev) => {
      ev.preventDefault();
      finish({ results: [], error: ev.message || 'Syntax error' });
    };
    worker.postMessage({ type: 'test', code, tests } satisfies WorkerRequest);
  });
}
