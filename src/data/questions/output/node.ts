import type { InterviewQuestion } from '../../../types';
import { out } from './helpers';

/**
 * Output questions that need the Node runtime (process.nextTick, setImmediate, fs, events,
 * streams, Buffer). Not runnable in the browser sandbox — outputs were verified with Node 20
 * running the snippet as a CommonJS file.
 */
export const nodeOutputQuestions: InterviewQuestion[] = [
  out({
    id: 'out-059',
    category: 'nodejs',
    difficulty: 'advanced',
    topic: 'setTimeout vs setImmediate in the main module',
    question: 'What does this print when run as `node main.js` (CommonJS)? Is the order of every line guaranteed?',
    code: `
      setTimeout(() => console.log('timeout'), 0);
      setImmediate(() => console.log('immediate'));
      process.nextTick(() => console.log('nextTick'));
      Promise.resolve().then(() => console.log('promise'));
      console.log('sync');
    `,
    expectedOutput: 'sync\nnextTick\npromise\ntimeout\nimmediate',
    shortAnswer: '`sync`, `nextTick`, `promise`, then `timeout` and `immediate` — but the last two can swap between runs.',
    detailedAnswer: [
      '`sync` runs first; then Node drains the nextTick queue (`nextTick`) and then the promise microtask queue (`promise`).',
      'The event loop then starts. `setTimeout(fn, 0)` is really 1 ms; whether it has expired when the timers phase is first checked depends on how fast the process booted.',
      'If it has expired → `timeout` then `immediate` (check phase). If not → `immediate` first, and `timeout` on the next loop iteration.',
      'So the first three lines are guaranteed; the order of the last two is not.',
      'Inside an I/O callback the order *is* deterministic: `setImmediate` always wins.',
    ],
    followUp: 'How would you make "run after I/O, before timers" deterministic? (Schedule from an I/O callback, or just use `setImmediate`.)',
    trap: 'Claiming `timeout` always runs before `immediate` because timers are the first phase.',
    relatedLessonIds: ['m05-setimmediate', 'm05-event-loop-phases', 'm05-execution-order'],
    versionNote: 'In an ES module entry the promise callback can run before nextTick, because module evaluation itself happens inside a promise job.',
  }),
  out({
    id: 'out-060',
    category: 'nodejs',
    difficulty: 'intermediate',
    topic: 'Event loop inside an I/O callback',
    question: 'What does this print?',
    code: `
      const fs = require('node:fs');
      fs.readFile(__filename, () => {
        setTimeout(() => console.log('timeout'), 0);
        setImmediate(() => console.log('immediate'));
        process.nextTick(() => console.log('nextTick'));
        console.log('in callback');
      });
    `,
    expectedOutput: 'in callback\nnextTick\nimmediate\ntimeout',
    shortAnswer: '`in callback`, `nextTick`, `immediate`, `timeout` — from the poll phase, the check phase comes before the next timers phase.',
    detailedAnswer: [
      'The `readFile` callback runs in the poll phase of the event loop.',
      'Its synchronous code logs `in callback`; when it returns, the nextTick queue drains → `nextTick`.',
      'After poll comes the check phase, where `setImmediate` callbacks run → `immediate`.',
      'The loop then wraps around to the timers phase → `timeout`.',
      'This order is guaranteed, unlike the same code at the top level of the main module.',
    ],
    followUp: 'Which libuv phase runs `socket.on("close")` callbacks?',
    trap: 'Answering `timeout` before `immediate` because "timers come first".',
    relatedLessonIds: ['m05-event-loop-phases', 'm05-setimmediate', 'm05-asynchronous-i-o'],
  }),
  out({
    id: 'out-061',
    category: 'nodejs',
    difficulty: 'advanced',
    topic: 'nextTick and promise queues',
    question: 'What does this print? Each queue schedules work into the other one.',
    code: `
      Promise.resolve()
        .then(() => {
          console.log('p1');
          process.nextTick(() => console.log('tick inside p1'));
        })
        .then(() => console.log('p2'));
      process.nextTick(() => {
        console.log('t1');
        Promise.resolve().then(() => console.log('promise inside t1'));
      });
      console.log('sync');
    `,
    expectedOutput: 'sync\nt1\np1\npromise inside t1\np2\ntick inside p1',
    shortAnswer: '`sync`, `t1`, `p1`, `promise inside t1`, `p2`, `tick inside p1`.',
    detailedAnswer: [
      'After the script (CommonJS), Node drains the nextTick queue first → `t1`, which appends `promise inside t1` to the microtask queue *after* `p1`.',
      'Then V8 drains the whole microtask queue: `p1` (schedules a tick and queues `p2`), `promise inside t1`, `p2`.',
      'A nextTick scheduled *during* the microtask drain waits until the microtask queue is empty.',
      'Node then checks the tick queue again → `tick inside p1`.',
      'Rule: nextTick queue fully, then microtask queue fully, repeat until both are empty.',
    ],
    followUp: 'Why does Node recommend `queueMicrotask` over `process.nextTick` for most new code?',
    trap: 'Thinking a nextTick always jumps ahead of promise callbacks, even mid-drain.',
    relatedLessonIds: ['m05-process-nexttick', 'm05-microtask-queue'],
  }),
  out({
    id: 'out-062',
    category: 'nodejs',
    difficulty: 'intermediate',
    topic: 'Recursive process.nextTick',
    question: 'What does this print? A nextTick callback re-schedules itself three times.',
    code: `
      let n = 0;
      function tick() {
        if (++n <= 3) {
          console.log('tick', n);
          process.nextTick(tick);
        }
      }
      setTimeout(() => console.log('timeout'), 0);
      Promise.resolve().then(() => console.log('promise'));
      process.nextTick(tick);
    `,
    expectedOutput: 'tick 1\ntick 2\ntick 3\npromise\ntimeout',
    shortAnswer: '`tick 1`, `tick 2`, `tick 3`, `promise`, `timeout` — ticks added while draining run in the same drain.',
    detailedAnswer: [
      'Node drains the nextTick queue until it is empty, including ticks added during the drain.',
      'So all three ticks run back to back before any promise callback.',
      'Then the promise microtask runs, and only then does the loop reach timers.',
      'Without the `n <= 3` guard this would starve the event loop forever — no I/O, no timers.',
    ],
    followUp: 'Would recursive `setImmediate` starve I/O the same way? (No — each immediate added during the check phase runs on the next iteration.)',
    trap: 'Expecting `promise` to interleave between the ticks.',
    relatedLessonIds: ['m05-process-nexttick', 'm05-setimmediate'],
  }),
  out({
    id: 'out-063',
    category: 'nodejs',
    difficulty: 'intermediate',
    topic: 'EventEmitter emit is synchronous',
    question: 'What does this print?',
    code: `
      const EventEmitter = require('node:events');
      const bus = new EventEmitter();
      bus.on('order', (id) => console.log('A', id));
      bus.prependListener('order', (id) => console.log('B', id));
      bus.once('order', (id) => console.log('once', id));
      console.log('before');
      console.log('emit returned', bus.emit('order', 1));
      bus.emit('order', 2);
      console.log('no listeners:', bus.emit('other'));
    `,
    expectedOutput: 'before\nB 1\nA 1\nonce 1\nemit returned true\nB 2\nA 2\nno listeners: false',
    shortAnswer: 'Listeners run synchronously inside `emit`, in registration order (prepended first); `once` fires a single time; `emit` returns whether any listener existed.',
    detailedAnswer: [
      '`emit` calls every listener synchronously, one after another, before it returns.',
      'Order is registration order, except `prependListener` puts its listener at the front.',
      '`once` removes the listener before calling it, so it only sees the first emit.',
      '`emit` returns `true` if the event had listeners, `false` otherwise.',
      'A slow listener therefore blocks the emitter — and the event loop.',
    ],
    followUp: 'How would you make a listener do its work asynchronously without blocking `emit`?',
    trap: 'Assuming events are queued and delivered on a later tick like DOM events or message queues.',
    relatedLessonIds: ['m06-eventemitter', 'm03-events-module'],
  }),
  out({
    id: 'out-064',
    category: 'nodejs',
    difficulty: 'intermediate',
    topic: "EventEmitter 'error' event",
    question: 'What does this print?',
    code: `
      const EventEmitter = require('node:events');
      const ee = new EventEmitter();
      try {
        ee.emit('error', new Error('disk full'));
      } catch (e) {
        console.log('thrown:', e.message);
      }
      ee.on('error', (e) => console.log('handled:', e.message));
      console.log(ee.emit('error', new Error('disk full')));
    `,
    expectedOutput: 'thrown: disk full\nhandled: disk full\ntrue',
    shortAnswer: "`thrown: disk full`, `handled: disk full`, `true` — emitting `'error'` with no listener throws the error.",
    detailedAnswer: [
      "`'error'` is special: if no listener is registered, `emit('error', err)` throws `err`.",
      'Here the throw is caught by the surrounding `try/catch`; in a real stream or socket it would crash the process.',
      'Once a listener is attached, the error is delivered to it like any other event.',
      '`emit` returns `true` because there was a listener.',
    ],
    followUp: "Why must you always attach an `'error'` listener to streams, sockets and child processes?",
    trap: "Thinking an `'error'` event with no listener is silently ignored like other events.",
    relatedLessonIds: ['m06-error-events', 'm06-eventemitter'],
  }),
  out({
    id: 'out-065',
    category: 'nodejs',
    difficulty: 'advanced',
    topic: 'Emitting from a constructor',
    question: 'What does this print? The class emits `ready` from its constructor, once synchronously and once deferred.',
    code: `
      const EventEmitter = require('node:events');
      class Job extends EventEmitter {
        constructor() {
          super();
          this.emit('ready', 'sync');
          process.nextTick(() => this.emit('ready', 'deferred'));
        }
      }
      const job = new Job();
      job.on('ready', (how) => console.log('ready:', how));
      console.log('listener attached');
    `,
    expectedOutput: 'listener attached\nready: deferred',
    shortAnswer: '`listener attached`, then `ready: deferred` — the synchronous emit happens before anyone could subscribe, so it is lost.',
    detailedAnswer: [
      'The caller cannot attach listeners until `new Job()` returns.',
      'The synchronous `emit` inside the constructor has no listeners, so nothing happens (and it is not buffered).',
      'Deferring with `process.nextTick` lets the caller finish wiring up listeners first.',
      'Node core uses this pattern: e.g. `net.connect` reports errors on a later tick so `on("error")` can be attached.',
    ],
    followUp: 'What is "Zalgo" and why should an API never be sometimes-sync, sometimes-async?',
    trap: 'Expecting `ready: sync` to be printed once the listener is attached.',
    relatedLessonIds: ['m06-custom-events', 'm05-process-nexttick'],
  }),
  out({
    id: 'out-066',
    category: 'nodejs',
    difficulty: 'intermediate',
    topic: 'events.once',
    question: 'What does this print?',
    code: `
      const { once, EventEmitter } = require('node:events');
      const ee = new EventEmitter();
      (async () => {
        const args = await once(ee, 'data');
        console.log('got', args);
      })();
      ee.emit('data', 1, 2);
      console.log('emitted');
    `,
    expectedOutput: 'emitted\ngot [ 1, 2 ]',
    shortAnswer: '`emitted`, then `got [ 1, 2 ]` — `events.once` resolves with an *array* of all emitted arguments, and the `await` resumes asynchronously.',
    detailedAnswer: [
      'The async IIFE runs synchronously until `await once(...)`, which registers a one-time listener.',
      '`emit` calls that listener synchronously, resolving the promise with `[1, 2]`.',
      'But the code after `await` resumes in a microtask, so `emitted` prints first.',
      'The resolved value is always an array, because events can carry several arguments.',
      'If the emitter emits `error` first, the promise rejects.',
    ],
    followUp: 'How would you wait for a server to start listening with `events.once`? (`await once(server, "listening")`.)',
    trap: 'Expecting `got 1` — forgetting the arguments come back as an array.',
    relatedLessonIds: ['m03-events-module', 'm06-eventemitter'],
  }),
  out({
    id: 'out-067',
    category: 'nodejs',
    difficulty: 'intermediate',
    topic: 'Readable stream events',
    question: 'What does this print?',
    code: `
      const { Readable } = require('node:stream');
      const r = Readable.from(['a', 'b']);
      r.on('data', (chunk) => console.log('data', chunk));
      r.on('end', () => console.log('end'));
      r.on('close', () => console.log('close'));
      console.log('sync done');
    `,
    expectedOutput: 'sync done\ndata a\ndata b\nend\nclose',
    shortAnswer: '`sync done`, `data a`, `data b`, `end`, `close` — attaching `data` switches to flowing mode, but data starts on a later tick.',
    detailedAnswer: [
      '`Readable.from` creates an object-mode stream, so chunks are the strings themselves (not Buffers).',
      'Adding a `data` listener calls `resume()`, but flowing starts asynchronously — so `sync done` is first.',
      'Each chunk is emitted as `data` in order.',
      '`end` fires when there is no more data; `close` fires afterwards because `autoDestroy` is on by default.',
    ],
    followUp: "What is the difference between `'end'` on a readable and `'finish'` on a writable?",
    trap: 'Expecting `close` before `end`, or `data` events before the synchronous log.',
    relatedLessonIds: ['m06-stream-events', 'm06-readable-streams'],
  }),
  out({
    id: 'out-068',
    category: 'nodejs',
    difficulty: 'advanced',
    topic: 'Writable stream events',
    question: 'What does this print? The `write` implementation calls its callback synchronously.',
    code: `
      const { Writable } = require('node:stream');
      const w = new Writable({
        write(chunk, encoding, callback) {
          console.log('write', chunk.toString());
          callback();
        },
      });
      w.on('finish', () => console.log('finish'));
      w.on('close', () => console.log('close'));
      w.write('a');
      w.write('b');
      w.end('c', () => console.log('end callback'));
      console.log('sync');
    `,
    expectedOutput: 'write a\nwrite b\nwrite c\nsync\nend callback\nfinish\nclose',
    shortAnswer: '`write a`, `write b`, `write c`, `sync`, `end callback`, `finish`, `close`.',
    detailedAnswer: [
      'When the stream is idle, `write()` calls `_write` synchronously — so each chunk is logged immediately.',
      'Because the callback is also called synchronously, the stream is free again for the next write; nothing is buffered.',
      '`end("c")` writes the last chunk synchronously too, then `sync` logs.',
      '`finish` is deferred to a later tick; the `end()` callback is registered as a finish callback and runs just before the `finish` listeners.',
      '`close` comes last because `autoDestroy` destroys the stream after `finish`.',
    ],
    followUp: 'What changes if `_write` calls its callback asynchronously (e.g. after a DB insert)? (Later writes are buffered until the callback; `write()` returns false once `highWaterMark` is reached.)',
    trap: 'Assuming `write()` is always asynchronous, so `sync` would print first.',
    relatedLessonIds: ['m06-writable-streams', 'm06-stream-events'],
    versionNote: 'Verified on Node 20; the end() callback runs right before finish listeners in current Node versions.',
  }),
  out({
    id: 'out-069',
    category: 'nodejs',
    difficulty: 'intermediate',
    topic: 'Buffers and encodings',
    question: 'What does this print?',
    code: `
      const b = Buffer.from('héllo');
      console.log('héllo'.length, b.length);
      console.log(b);
      console.log(b.toString('base64'));
      console.log(Buffer.from([256, -1, 65]));
      console.log(b.subarray(0, 2).toString());
    `,
    expectedOutput: "5 6\n<Buffer 68 c3 a9 6c 6c 6f>\naMOpbGxv\n<Buffer 00 ff 41>\nh�",
    shortAnswer: 'String length is 5 but the UTF-8 buffer is 6 bytes; values outside 0–255 wrap modulo 256; slicing in the middle of a multi-byte character yields the replacement character `�`.',
    detailedAnswer: [
      '`Buffer.from(string)` encodes as UTF-8 by default; `é` takes two bytes (`c3 a9`).',
      '`string.length` counts UTF-16 code units (5), `buffer.length` counts bytes (6) — use `Buffer.byteLength` for `Content-Length`.',
      'Each element of a Buffer is a byte: `256 & 255 = 0`, `-1 & 255 = 255 (ff)`, `65 = 0x41` ("A").',
      '`subarray(0, 2)` contains `h` and only the first byte of `é`, which decodes to U+FFFD.',
      'When decoding chunked streams, use `setEncoding("utf8")` or `StringDecoder` to avoid splitting characters.',
    ],
    followUp: 'Why is `new Buffer(n)` deprecated, and what is the difference between `Buffer.alloc` and `Buffer.allocUnsafe`?',
    trap: 'Setting `Content-Length` to `str.length` for non-ASCII bodies.',
    relatedLessonIds: ['m06-buffer-fundamentals', 'm06-encoding'],
  }),
  out({
    id: 'out-070',
    category: 'nodejs',
    difficulty: 'intermediate',
    topic: "process 'exit' event",
    question: 'What does this print?',
    code: `
      process.on('exit', (code) => {
        console.log('exit', code);
        setTimeout(() => console.log('never'), 0);
      });
      setTimeout(() => console.log('timer'), 0);
      console.log('sync');
    `,
    expectedOutput: 'sync\ntimer\nexit 0',
    shortAnswer: "`sync`, `timer`, `exit 0` — `'exit'` fires when the loop has no more work, and only synchronous code runs inside it.",
    detailedAnswer: [
      'The process stays alive while the timer is pending; `timer` logs, then the loop is empty.',
      "Node emits `'exit'` with the exit code (`0`).",
      "After `'exit'` listeners return, the process terminates — the event loop does not run again, so the new timer never fires.",
      "For async cleanup on shutdown, handle `SIGTERM`/`SIGINT` or `'beforeExit'` instead.",
    ],
    followUp: "What is the difference between `'beforeExit'` and `'exit'`? (`beforeExit` can schedule more work and is not emitted on `process.exit()`.)",
    trap: "Trying to close a DB pool asynchronously inside `process.on('exit')`.",
    relatedLessonIds: ['m03-process-module', 'm11-graceful-shutdown'],
  }),
];
