import type { ModuleContent } from '../../../types';
import { bullets, code, dedent, flow, interviewTip, section, table, text } from '../helpers';

const content: Partial<ModuleContent> = {
  eventemitter: {
    summary: 'EventEmitter is the publish/subscribe core of Node: on/once register listeners, emit calls them synchronously in registration order, off removes them.',
    topics: ['EventEmitter', 'on', 'once', 'off', 'emit', 'prependListener', 'listenerCount', 'synchronous listeners', 'node:events'],
    sections: [
      section('introduction', undefined,
        text('Streams, HTTP servers, sockets and child processes all tell you what happened by emitting events. They all inherit from one class: `EventEmitter` from `node:events`.'),
      ),
      section('definition', 'The API',
        table('EventEmitter methods', ['Method', 'Does'], [
          ['`on(name, fn)` / `addListener`', 'Append a listener'],
          ['`once(name, fn)`', 'Listener removed after its first call'],
          ['`prependListener(name, fn)`', 'Add to the **front** of the list'],
          ['`off(name, fn)` / `removeListener`', 'Remove one registration of `fn`'],
          ['`removeAllListeners(name?)`', 'Remove all (for one event or all)'],
          ['`emit(name, ...args)`', 'Call listeners synchronously; returns `true` if there were any'],
          ['`listenerCount(name)`, `eventNames()`', 'Introspection'],
          ['`setMaxListeners(n)`', 'Change the leak-warning threshold (default 10)'],
        ]),
      ),
      section('why', 'Why events',
        bullets(
          'Decoupling: the emitter does not know who listens.',
          'Many listeners for one event (logging, metrics, business logic).',
          'Natural fit for things that happen repeatedly over time (data chunks, connections).',
        ),
      ),
      section('internals', 'How emit works',
        bullets(
          'Listeners are stored in an object keyed by event name — a single function or an array.',
          '`emit` copies the array and calls each listener **synchronously**, in registration order, with `this` set to the emitter (for normal functions).',
          'There is no queue or event loop involvement: `emit` returns only after every listener returned.',
          'A listener that throws stops the remaining listeners and the error propagates to the `emit` caller.',
        ),
        flow(["emit('order', o)", 'listener 1(o)', 'listener 2(o)', 'emit returns true'], { title: 'Synchronous dispatch', direction: 'horizontal' }),
      ),
      section('example', 'Using EventEmitter',
        code({
          title: 'Listeners run synchronously, in order',
          code: dedent(`
            const { EventEmitter } = require('node:events');
            const bus = new EventEmitter();

            bus.on('greet', (name) => console.log('A', name));
            bus.on('greet', (name) => console.log('B', name));
            bus.prependListener('greet', () => console.log('first'));
            bus.once('greet', () => console.log('once'));

            console.log('before');
            console.log(bus.emit('greet', 'Ada'));
            console.log('after');
            bus.emit('greet', 'Bob');
            console.log(bus.emit('nobody'));
          `),
          expectedOutput: 'before\nfirst\nA Ada\nB Ada\nonce\ntrue\nafter\nfirst\nA Bob\nB Bob\nfalse',
          explanation: [
            '`prependListener` puts `first` at the front.',
            'All listeners run before `emit` returns → `true` prints after them.',
            'The `once` listener is gone on the second emit.',
            '`emit` returns `false` when nobody listens.',
          ],
        }),
        code({
          title: 'A minimal emitter in plain JS (runnable)',
          runnable: true,
          code: dedent(`
            class MiniEmitter {
              #listeners = new Map();
              on(name, fn) {
                if (!this.#listeners.has(name)) this.#listeners.set(name, []);
                this.#listeners.get(name).push(fn);
                return this;
              }
              off(name, fn) {
                const list = this.#listeners.get(name) || [];
                const i = list.indexOf(fn);
                if (i !== -1) list.splice(i, 1);
                return this;
              }
              once(name, fn) {
                const wrapper = (...args) => { this.off(name, wrapper); fn(...args); };
                return this.on(name, wrapper);
              }
              emit(name, ...args) {
                const list = [...(this.#listeners.get(name) || [])];
                for (const fn of list) fn.apply(this, args);
                return list.length > 0;
              }
            }

            const e = new MiniEmitter();
            e.once('tick', (n) => console.log('once', n));
            e.on('tick', (n) => console.log('on', n));
            e.emit('tick', 1);
            e.emit('tick', 2);
            setTimeout(() => console.log('timer'), 0);
            e.emit('tick', 3);
          `),
          expectedOutput: 'once 1\non 1\non 2\non 3\ntimer',
          explanation: [
            'Copying the array before iterating lets `once` remove itself safely.',
            'All emits are synchronous, so the timer callback runs after the last emit.',
          ],
        }),
      ),
      section('real-world', 'Real-world: domain events',
        code({
          title: 'Decoupling side effects',
          code: dedent(`
            const { EventEmitter } = require('node:events');
            const events = new EventEmitter();

            events.on('user.registered', (user) => mailer.sendWelcome(user.email));
            events.on('user.registered', (user) => metrics.increment('signups'));

            async function register(data) {
              const user = await db.users.insert(data);
              events.emit('user.registered', user);
              return user;
            }
          `),
          explanation: ['The service does not import the mailer or metrics.', 'Remember: listeners run synchronously and in-process — for durable work use a queue.'],
        }),
      ),
      section('mistakes', 'Common mistakes',
        bullets(
          'Assuming listeners are asynchronous — heavy listeners block `emit` and the event loop.',
          'Using arrow functions and expecting `this` to be the emitter.',
          '`off` with a different function reference (e.g. a new arrow) — nothing is removed.',
          'Adding a listener per request to a long-lived emitter and never removing it → leak.',
        ),
        code({
          title: 'Wrong vs right removal',
          code: dedent(`
            // ❌ different function object — not removed
            bus.on('x', () => work());
            bus.off('x', () => work());
            // ✅ keep the reference
            const onX = () => work();
            bus.on('x', onX);
            bus.off('x', onX);
          `),
        }),
      ),
      section('interview', 'Interview angle',
        interviewTip('Classic question: "Are EventEmitter listeners async?" No — synchronous, in order. To defer, use `setImmediate`/`queueMicrotask` inside the listener.'),
      ),
      section('practice', 'Practice',
        text('Extend the MiniEmitter with `prependListener` and `listenerCount`, and make `emit(\'error\')` throw when there are no listeners.'),
      ),
      section('summary', 'Summary',
        bullets('`on`/`once`/`off`/`emit`/`prependListener`.', 'Listeners run synchronously in registration order.', '`emit` returns whether anyone listened.', 'Keep references to remove listeners.'),
      ),
    ],
    revisionNotes: [
      'emit is synchronous; listeners run in registration order.',
      'prependListener / prependOnceListener add to the front.',
      'emit returns boolean: had listeners?',
      'off needs the same function reference.',
      'Normal-function listeners get this === emitter; arrows do not.',
      'A throwing listener stops later listeners and throws from emit.',
    ],
    quiz: [
      {
        kind: 'predict-output', difficulty: 'intermediate',
        prompt: 'What is printed?',
        code: "const e = new EventEmitter();\ne.on('x', () => console.log('1'));\nconsole.log('2');\ne.emit('x');\nconsole.log('3');",
        options: ['2 3 1', '2 1 3', '1 2 3', '2 3 (1 never prints)'],
        answer: 1,
        explanation: "emit calls listeners synchronously, so '1' prints between '2' and '3'. '2 3 1' would be true only if listeners were deferred.",
      },
      {
        kind: 'find-bug', difficulty: 'beginner',
        prompt: 'Why does the listener keep firing after off()?',
        code: "emitter.on('tick', () => update());\n// later\nemitter.off('tick', () => update());",
        options: ['off only works with once', 'The arrow passed to off is a different function object than the one registered', "'tick' is a reserved name", 'off must be called before on'],
        answer: 1,
        explanation: 'off matches by reference. Store the listener in a variable and pass that same reference.',
      },
      {
        kind: 'mcq', difficulty: 'intermediate',
        prompt: 'Which method makes a listener run before all existing listeners?',
        options: ['once', 'prependListener', 'addListener', 'setMaxListeners'],
        answer: 1,
        explanation: 'prependListener inserts at the front. on/addListener append to the end.',
      },
    ],
    interview: [
      {
        category: 'nodejs', kind: 'concept', difficulty: 'beginner', topic: 'EventEmitter',
        question: 'What is the EventEmitter class and where is it used in Node?',
        shortAnswer: 'EventEmitter from node:events implements publish/subscribe: you register listeners with on/once and trigger them with emit; streams, http.Server, sockets and child processes all extend it.',
        detailedAnswer: [
          'Core methods: `on`, `once`, `off`, `emit`, `prependListener`.',
          'Event names are strings or symbols.',
          'Used for things that happen repeatedly: requests, data chunks, connections.',
          'Special event: `error`.',
        ],
        followUp: 'Are listeners called synchronously or asynchronously?',
        trap: 'Confusing EventEmitter with the event loop — emit does not schedule anything.',
      },
      {
        category: 'nodejs', kind: 'output', difficulty: 'intermediate', topic: 'EventEmitter',
        question: 'What does this print, and why?',
        code: {
          id: 'iq-m06-emit-order', language: 'javascript',
          code: "const { EventEmitter } = require('node:events');\nconst e = new EventEmitter();\ne.on('go', () => { console.log('L1'); e.emit('stop'); });\ne.on('stop', () => console.log('stop'));\ne.on('go', () => console.log('L2'));\ne.emit('go');\nconsole.log('done');",
          expectedOutput: 'L1\nstop\nL2\ndone',
        },
        shortAnswer: "L1, stop, L2, done — emit is synchronous, so the nested emit('stop') runs to completion inside L1 before L2 is called.",
        detailedAnswer: [
          'Listeners execute in registration order: L1 then L2.',
          'A nested `emit` is just a function call — it runs immediately.',
          '`done` prints after the outer emit returns.',
        ],
        followUp: 'How would you make the listeners run asynchronously?',
        trap: "Expecting 'stop' after L2 because it was 'emitted later'.",
      },
    ],
  },

  'custom-events': {
    summary: 'Build your own event-driven classes by extending EventEmitter, emitting domain events, and consuming them with listeners, events.once() promises or events.on() async iterators.',
    topics: ['extends EventEmitter', 'custom events', 'events.once', 'events.on', 'async iterator', 'Symbol event names', 'EventTarget'],
    sections: [
      section('introduction', undefined,
        text('Your own modules can be event-driven too: a job runner emitting `progress`, a cache emitting `evicted`, a websocket hub emitting `message`.'),
      ),
      section('definition', 'Patterns',
        bullets(
          '`class Job extends EventEmitter` — call `super()` and `this.emit(...)`.',
          '`await once(emitter, \'ready\')` — promise of the next event (resolves with an **array** of args, rejects on `error`).',
          '`for await (const [msg] of on(emitter, \'message\'))` — async iterator over events.',
          'Both helpers accept `{ signal }` for cancellation.',
        ),
      ),
      section('why', 'Why custom events',
        bullets(
          'Progress and lifecycle reporting without callbacks for every case.',
          'Let consumers opt in to what they care about.',
          'Bridge callback-style emitters into async/await code with `once` / `on`.',
        ),
      ),
      section('internals', 'EventEmitter vs EventTarget',
        table('EventEmitter vs EventTarget', ['', 'EventEmitter (Node)', 'EventTarget (Web standard, global in Node 15+)'], [
          ['Register', '`on(name, fn)`', '`addEventListener(type, fn, { once, signal })`'],
          ['Emit', '`emit(name, ...args)` — any args', '`dispatchEvent(new Event(type))` — one Event object'],
          ['Duplicate listeners', 'Allowed (added twice → called twice)', 'Same fn+type registered once only'],
          ['"error" event', 'Special: throws if unhandled', 'Not special'],
          ['Listener throws', 'Propagates out of `emit`', 'Reported as uncaught exception; other listeners still run'],
          ['Used by', 'Streams, http, net', '`AbortSignal`, Web APIs, `MessagePort`'],
        ]),
      ),
      section('example', 'Custom emitters',
        code({
          title: 'An emitter class with progress events',
          code: dedent(`
            const { EventEmitter, once } = require('node:events');

            class Download extends EventEmitter {
              start() {
                let pct = 0;
                const t = setInterval(() => {
                  pct += 50;
                  this.emit('progress', pct);
                  if (pct === 100) { clearInterval(t); this.emit('done', 'file.zip'); }
                }, 10);
                return this;
              }
            }

            (async () => {
              const d = new Download();
              d.on('progress', (p) => console.log('progress', p));
              const [file] = await once(d.start(), 'done');
              console.log('saved', file);
            })();
          `),
          expectedOutput: 'progress 50\nprogress 100\nsaved file.zip',
          explanation: [
            '`once()` resolves with an array of the emitted args — destructure it.',
            'If the emitter emitted `error` first, the promise would reject.',
          ],
        }),
        code({
          title: 'events.on as an async iterator',
          code: dedent(`
            const { EventEmitter, on } = require('node:events');
            const chat = new EventEmitter();

            (async () => {
              const ac = new AbortController();
              setTimeout(() => ac.abort(), 50);
              try {
                for await (const [msg] of on(chat, 'message', { signal: ac.signal })) console.log('got', msg);
              } catch (err) {
                console.log(err.name);
              }
            })();

            setTimeout(() => { chat.emit('message', 'hi'); chat.emit('message', 'there'); }, 10);
          `),
          expectedOutput: 'got hi\ngot there\nAbortError',
          explanation: ['`on()` buffers events emitted while the loop body is busy.', 'Aborting the signal ends the loop with an `AbortError`.'],
        }),
        code({
          title: 'EventTarget deduplicates listeners',
          code: dedent(`
            const target = new EventTarget();
            const fn = (e) => console.log('got', e.type);
            target.addEventListener('ping', fn);
            target.addEventListener('ping', fn); // ignored: same fn + type
            target.dispatchEvent(new Event('ping'));
          `),
          expectedOutput: 'got ping',
          explanation: ['EventTarget deduplicates listeners; EventEmitter would call `fn` twice.'],
        }),
      ),
      section('real-world', 'Real-world usage',
        bullets(
          'A job queue client emitting `completed`, `failed`, `stalled`.',
          'A graceful shutdown helper: `await once(server, \'close\')`.',
          'Waiting for a DB connection: `await once(pool, \'connect\')`.',
          'Using `Symbol` event names for internal events no one else should emit.',
        ),
      ),
      section('mistakes', 'Common mistakes',
        bullets(
          'Forgetting `super()` in the constructor.',
          'Expecting `once()` to resolve with the value, not an array.',
          'Emitting events in the constructor — listeners are not attached yet. Defer with `process.nextTick`.',
          'Leaving `on()` iterators running forever — always provide an abort signal or break.',
        ),
        code({
          title: 'Wrong vs right: emitting from the constructor',
          code: dedent(`
            const { EventEmitter } = require('node:events');

            class Conn extends EventEmitter {
              constructor() {
                super();
                // ❌ this.emit('ready'); — nobody is listening yet
                process.nextTick(() => this.emit('ready')); // ✅
              }
            }
            new Conn().on('ready', () => console.log('ready'));
          `),
          expectedOutput: 'ready',
        }),
      ),
      section('interview', 'Interview angle',
        interviewTip('Show `extends EventEmitter` plus the nextTick trick for constructor events, then convert to promises with `events.once`.'),
      ),
      section('practice', 'Practice',
        text('Build a `Timer` class extending EventEmitter that emits `tick` every second and `end` after N ticks. Consume it with `for await` over `on(timer, \'tick\')` and stop on `end`.'),
      ),
      section('summary', 'Summary',
        bullets('Extend EventEmitter for domain objects.', '`events.once` → promise; `events.on` → async iterator.', 'Defer constructor emits with nextTick.', 'EventTarget is the Web-standard alternative.'),
      ),
    ],
    revisionNotes: [
      'class X extends EventEmitter { constructor() { super(); } }',
      'await once(em, "x") resolves to an args array; rejects on "error".',
      'on(em, "x") returns an async iterator; supports { signal }.',
      'Emit from constructor via process.nextTick.',
      'EventTarget: addEventListener/dispatchEvent, dedupes listeners, no special error event.',
    ],
    quiz: [
      {
        kind: 'predict-output', difficulty: 'intermediate',
        prompt: "What does `const r = await once(e, 'data')` hold after `e.emit('data', 1, 2)`?",
        options: ['1', '[1, 2]', '{ args: [1, 2] }', 'undefined'],
        answer: 1,
        explanation: 'events.once resolves with an array of all arguments passed to emit.',
      },
      {
        kind: 'find-bug', difficulty: 'intermediate',
        prompt: "The 'ready' listener never runs. Why?",
        code: "class Db extends EventEmitter {\n  constructor() { super(); this.emit('ready'); }\n}\nconst db = new Db();\ndb.on('ready', () => console.log('ready'));",
        options: ["'ready' is reserved", 'The event is emitted synchronously in the constructor before any listener is attached', 'super() must come after emit', 'EventEmitter cannot be extended'],
        answer: 1,
        explanation: 'emit is synchronous; at construction time there are no listeners. Defer with process.nextTick or setImmediate.',
      },
      {
        kind: 'mcq', difficulty: 'advanced',
        prompt: 'Which statement about EventTarget in Node is true?',
        options: ["Emitting 'error' with no listener throws", 'Adding the same listener twice for the same type registers it once', 'dispatchEvent accepts arbitrary arguments', 'It is only available via require("node:events")'],
        answer: 1,
        explanation: "EventTarget deduplicates identical listener registrations. It has no special 'error' behaviour, dispatches a single Event object, and is a global since Node 15.",
      },
    ],
    interview: [
      {
        category: 'nodejs', kind: 'concept', difficulty: 'intermediate', topic: 'Custom events',
        question: 'How do you create a class that emits its own events, and what pitfall exists when emitting from the constructor?',
        shortAnswer: 'Extend EventEmitter, call super(), and use this.emit; events emitted synchronously in the constructor are lost because no listeners are attached yet, so defer them with process.nextTick.',
        detailedAnswer: [
          'Listeners can only be attached after `new` returns.',
          '`process.nextTick(() => this.emit(\'ready\'))` runs after the current synchronous code.',
          'Document events and their payloads like a public API.',
          'Consider Symbols for internal events.',
        ],
        followUp: 'How would you expose a promise for "ready" instead?',
        trap: 'Using setTimeout(…, 1000) "to be safe" instead of nextTick.',
      },
      {
        category: 'nodejs', kind: 'concept', difficulty: 'advanced', topic: 'events.once / events.on',
        question: 'Explain events.once() and events.on(). How do they handle errors and cancellation?',
        shortAnswer: "events.once returns a promise for the next occurrence (resolving to an args array) and events.on returns an async iterator of occurrences; both reject or throw if the emitter emits 'error', and both accept an AbortSignal.",
        detailedAnswer: [
          '`once(emitter, name)` listens to `name` and `error`; whichever comes first settles the promise.',
          '`on(emitter, name)` queues events not yet consumed, so no event is lost while the loop awaits.',
          'Aborting the signal rejects / throws `AbortError` and removes the listeners.',
          'Both also work with EventTarget.',
          'Useful to bridge emitter-based APIs into async/await flows.',
        ],
        followUp: 'What memory risk exists with events.on if the consumer is slower than the producer?',
        trap: "Assuming once() ignores 'error' — it rejects, which is usually what you want.",
      },
    ],
  },

  'error-events': {
    summary: "The 'error' event is special: if emitted with no listener, EventEmitter throws it and the process crashes. Also know the maxListeners leak warning, captureRejections for async listeners, and errorMonitor.",
    topics: ['error event', 'unhandled error', 'ERR_UNHANDLED_ERROR', 'MaxListenersExceededWarning', 'setMaxListeners', 'captureRejections', 'errorMonitor', 'memory leak'],
    sections: [
      section('introduction', undefined,
        text('One event name behaves differently from all others: `error`. Get it wrong and a single failed socket takes down your whole server.'),
      ),
      section('definition', 'The rules',
        bullets(
          '`emit(\'error\', err)` with **no** `error` listener → `err` is thrown from `emit` (if it is not an Error, Node throws `ERR_UNHANDLED_ERROR`).',
          'Thrown inside an async callback, that becomes an uncaught exception → process exits.',
          '`events.errorMonitor` lets you observe errors (logging) without counting as a handler.',
          'More than `defaultMaxListeners` (10) listeners for one event prints `MaxListenersExceededWarning` — a hint of a leak, not an error.',
        ),
      ),
      section('why', 'Why "error" throws',
        bullets(
          'Errors must not be silently ignored. Throwing forces you to handle them.',
          'Every stream, socket and server can emit `error` — always attach a listener (or use `pipeline` / `once` which do).',
        ),
      ),
      section('internals', 'Async listeners and captureRejections',
        bullets(
          'If a listener is `async` and rejects, the rejection is **not** routed to `error` by default — it becomes an unhandled rejection (crash on Node 15+).',
          '`new EventEmitter({ captureRejections: true })` routes listener rejections to `emitter[Symbol.for(\'nodejs.rejection\')]` if defined, else to the `error` event.',
          'Global switch: `EventEmitter.captureRejections = true`.',
          'Do not use `async` functions as `error` listeners (risk of infinite loops).',
        ),
        flow(['async listener rejects', 'captureRejections?', 'yes → emit("error", err)', 'no → unhandledRejection → crash'], { title: 'Async listener failure', direction: 'horizontal' }),
      ),
      section('example', 'Error handling in emitters',
        code({
          title: 'No listener → throw',
          code: dedent(`
            const { EventEmitter } = require('node:events');
            const e = new EventEmitter();
            try {
              e.emit('error', new Error('disk full'));
            } catch (err) {
              console.log('thrown:', err.message);
            }
            e.on('error', (err) => console.log('handled:', err.message));
            e.emit('error', new Error('disk full'));
          `),
          expectedOutput: 'thrown: disk full\nhandled: disk full',
          explanation: ['Without a listener, `emit` throws the error itself.', 'With a listener, it is delivered normally.'],
        }),
        code({
          title: 'errorMonitor observes without handling',
          code: dedent(`
            const { EventEmitter, errorMonitor } = require('node:events');
            const e = new EventEmitter();
            e.on(errorMonitor, (err) => console.log('log:', err.message));
            e.on('error', (err) => console.log('handle:', err.message));
            e.emit('error', new Error('x'));
          `),
          expectedOutput: 'log: x\nhandle: x',
          explanation: ['`errorMonitor` listeners run first; without the `error` listener the error would still be thrown.'],
        }),
        code({
          title: 'captureRejections',
          code: dedent(`
            const { EventEmitter } = require('node:events');
            const e = new EventEmitter({ captureRejections: true });
            e.on('job', async () => { throw new Error('job failed'); });
            e.on('error', (err) => console.log('caught:', err.message));
            e.emit('job');
          `),
          expectedOutput: 'caught: job failed',
          explanation: ['The rejected promise from the async listener is forwarded to `error`.', 'Without `captureRejections`, this is an unhandled rejection that crashes the process.'],
          versionNote: 'captureRejections: Node 13.4+ / 12.16+.',
        }),
        code({
          title: 'MaxListeners warning (a leak)',
          code: dedent(`
            const { EventEmitter } = require('node:events');
            const bus = new EventEmitter();
            function handleRequest() {
              bus.on('config-changed', () => {}); // ❌ added per request, never removed
            }
            for (let i = 0; i < 11; i++) handleRequest();
            console.log(bus.listenerCount('config-changed'));
          `),
          expectedOutput: '11\n(node:1234) MaxListenersExceededWarning: Possible EventEmitter memory leak detected. 11 config-changed listeners added to [EventEmitter]. MaxListeners is 10. Use emitter.setMaxListeners() to increase limit\n(Use `node --trace-warnings ...` to show where the warning was created)',
          explanation: [
            'The warning goes to stderr asynchronously (pid will differ; exact wording varies slightly by version).',
            'The real fix is removing the listener when the request ends, not raising the limit.',
            'Raise the limit only when many listeners are legitimate: `bus.setMaxListeners(50)`.',
          ],
        }),
      ),
      section('real-world', 'Real-world: never-crash servers',
        bullets(
          'Every `net.Socket`, stream and `http.Server` should have an error path — `server.on(\'error\')` for EADDRINUSE, `pipeline` callbacks for streams.',
          'Per-request listeners on shared emitters (e.g. a config watcher) must be removed in `res.on(\'close\')`.',
          'Use `captureRejections: true` when listeners are async.',
        ),
      ),
      section('mistakes', 'Common mistakes',
        bullets(
          'No `error` listener on a socket → one ECONNRESET crashes the server.',
          'Silencing the MaxListeners warning with `setMaxListeners(0)` — hides real leaks.',
          'Async listeners without `captureRejections` → unhandled rejection.',
          'Emitting strings instead of Error objects (no stack trace).',
        ),
      ),
      section('interview', 'Interview angle',
        interviewTip('Three facts: unhandled `error` throws; default max listeners is 10 and the warning means a likely leak; `captureRejections` handles async listener failures.'),
      ),
      section('practice', 'Practice',
        text('Create a request handler that subscribes to a shared emitter and fix it so the listener is removed when the response closes. Verify `listenerCount` stays at 0 after 100 requests.'),
      ),
      section('summary', 'Summary',
        bullets("Unhandled 'error' throws → crash.", 'errorMonitor observes without handling.', 'MaxListenersExceededWarning (10) = likely leak.', 'captureRejections routes async rejections to error.'),
      ),
    ],
    revisionNotes: [
      "emit('error') with no listener throws the error (non-Error → ERR_UNHANDLED_ERROR).",
      'events.errorMonitor: observe only.',
      'defaultMaxListeners = 10 → MaxListenersExceededWarning (warning, not error).',
      'Fix leaks by removing listeners, not by setMaxListeners(Infinity).',
      'captureRejections: true → async listener rejections go to error / Symbol.for("nodejs.rejection").',
    ],
    quiz: [
      {
        kind: 'mcq', difficulty: 'beginner',
        prompt: "What happens when an EventEmitter emits 'error' and no listener is registered?",
        options: ['The error is ignored', 'The error is thrown from emit()', 'A warning is printed', 'The emitter retries'],
        answer: 1,
        explanation: "The 'error' event is special: without a listener it is thrown, which typically crashes the process.",
      },
      {
        kind: 'scenario', difficulty: 'intermediate',
        prompt: "Logs show 'MaxListenersExceededWarning: 11 message listeners added'. Traffic is normal. What should you do first?",
        options: ['Call setMaxListeners(0) to hide it', 'Find where listeners are added per request/connection and make sure they are removed', 'Restart the server periodically', 'Switch to EventTarget'],
        answer: 1,
        explanation: 'The warning usually indicates a listener leak. Hiding it lets memory grow. Fix the removal path first.',
      },
      {
        kind: 'predict-output', difficulty: 'advanced',
        prompt: 'What happens? (Node 20)',
        code: "const e = new EventEmitter();\ne.on('error', () => console.log('handled'));\ne.on('job', async () => { throw new Error('x'); });\ne.emit('job');",
        options: ["'handled' is printed", 'Unhandled promise rejection — the process crashes', 'emit throws synchronously', 'Nothing happens'],
        answer: 1,
        explanation: "Without captureRejections, the async listener's rejected promise is not routed to 'error'; it becomes an unhandled rejection, which crashes Node 15+.",
      },
    ],
    interview: [
      {
        category: 'nodejs', kind: 'concept', difficulty: 'intermediate', topic: 'Error events',
        question: "Why is the 'error' event special in EventEmitter?",
        shortAnswer: "If 'error' is emitted with no listener, emit throws the error, which usually crashes the process; every other event is simply ignored when nobody listens.",
        detailedAnswer: [
          'Design choice: errors should never be silently dropped.',
          'Non-Error values are wrapped in `ERR_UNHANDLED_ERROR`.',
          '`errorMonitor` lets you log without handling.',
          'Streams, sockets, servers: always attach an error handler or use pipeline/once.',
        ],
        followUp: 'What happens with errors thrown inside a listener?',
        trap: "Thinking a try/catch around emitter creation catches later 'error' events.",
      },
      {
        category: 'nodejs', kind: 'concept', difficulty: 'intermediate', topic: 'Memory leaks',
        question: 'What does MaxListenersExceededWarning mean and how do you handle it?',
        shortAnswer: 'It means more than the max (default 10) listeners were added for one event on one emitter, which usually indicates a leak where listeners are added repeatedly and never removed.',
        detailedAnswer: [
          'It is a process warning, not an exception; the listener is still added.',
          'Typical cause: adding a listener per request/connection to a long-lived emitter.',
          'Fix: remove with `off` on cleanup, use `once`, or use AbortSignal with `events.on/once`.',
          'Raise the limit with `setMaxListeners(n)` only for legitimately many listeners.',
          'Run with `--trace-warnings` to see where it was added.',
        ],
        followUp: 'How would you confirm the leak with a heap snapshot?',
        trap: 'Treating it as an error that stops the listener from being added.',
      },
      {
        category: 'nodejs', kind: 'concept', difficulty: 'advanced', topic: 'captureRejections',
        question: 'What happens when an async EventEmitter listener rejects, and what does captureRejections change?',
        shortAnswer: "By default the rejection is unhandled (crashing Node 15+), because emit ignores listener return values; with captureRejections: true, Node attaches a handler and forwards the error to Symbol.for('nodejs.rejection') or the 'error' event.",
        detailedAnswer: [
          'emit calls listeners and discards what they return, including promises.',
          'captureRejections can be set per emitter or globally via `EventEmitter.captureRejections`.',
          'If the emitter defines `[Symbol.for(\'nodejs.rejection\')](err, event, ...args)`, that is used first.',
          'Do not make the `error` listener itself async.',
          'Alternative: wrap each async listener in try/catch.',
        ],
        followUp: 'Why can you not use async functions as error listeners with captureRejections?',
        trap: 'Assuming emit awaits async listeners.',
      },
    ],
  },
};

export default content;
