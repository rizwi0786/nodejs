import type { ModuleContent } from '../../../types';
import {
  bullets, code, dedent, diagram, flow, interviewTip, note, section, steps, table, text, warn,
} from '../helpers';

const content: Partial<ModuleContent> = {
  // ───────────────────────────────────────────────────────────
  'event-loop': {
    summary: 'The event loop is libuv\'s loop that waits for completed I/O and expired timers and runs their callbacks one at a time on the main thread, draining nextTick and promise microtasks after each one.',
    topics: ['event loop', 'libuv', 'call stack', 'callback queue', 'microtasks', 'process lifetime', 'ref/unref', 'beforeExit'],
    sections: [
      section('introduction', undefined,
        text('Your script finishes in milliseconds, yet a server keeps running for months. What keeps it alive and decides which callback runs next? The **event loop**.'),
      ),
      section('definition', 'Definition',
        bullets(
          'The **event loop** is a loop (implemented by **libuv**, not V8) that repeatedly asks: "which timers have expired, which I/O has completed?" and runs the matching callbacks.',
          'It runs on the **main thread** — the same thread as your JavaScript. Only one callback runs at a time.',
          'Between callbacks, Node drains the **nextTick queue** and the **promise microtask queue**.',
          'The loop keeps going while there are **active, ref\'d handles or requests** (servers, sockets, timers, pending fs operations). When there are none, the process exits.',
        ),
      ),
      section('why', 'Why it exists',
        bullets(
          'It is how one thread serves thousands of connections: never wait, just react to events.',
          'It defines **ordering**: why a promise callback runs before a timer, and why `setImmediate` runs after I/O.',
          'Most performance bugs in Node are "something kept the loop busy".',
        ),
      ),
      section('internals', 'The big picture',
        steps(
          'Node starts: initialises V8 and libuv, loads your entry module, and runs it **synchronously** to the end.',
          'It drains `process.nextTick` callbacks, then promise microtasks.',
          'It enters the loop: **timers → pending callbacks → idle/prepare → poll → check → close callbacks**, then repeats.',
          'After **each** callback in each phase, nextTick + microtask queues are drained again (Node 11+).',
          'In **poll**, if nothing else is scheduled, the loop **blocks** waiting for I/O — which costs no CPU.',
          'When no ref\'d handles/requests remain, Node emits `beforeExit`; if nothing new is scheduled, it emits `exit` and the process ends.',
        ),
        diagram('event-loop-phases', 'One loop iteration. nextTick and promise microtasks drain between every callback.'),
        table('Who does what', ['Component', 'Role'], [
          ['V8', 'Executes JavaScript, owns the call stack, heap and the promise microtask queue'],
          ['libuv', 'The event loop, OS polling (epoll/kqueue/IOCP), timers, the thread pool'],
          ['Node bindings', 'Glue: turn your `fs.readFile` into a libuv request and call back into JS'],
          ['Node JS layer', 'nextTick queue, timers lists, drains microtasks between callbacks'],
        ]),
      ),
      section('visual', 'Try it',
        diagram('event-loop-simulator', 'Step through the call stack, microtask queue and macrotask queues for the examples below.'),
      ),
      section('example', 'Examples',
        code({
          title: 'Sync → microtasks → timers',
          code: dedent(`
            console.log('script start');
            setTimeout(() => console.log('timeout'), 0);
            Promise.resolve().then(() => console.log('promise'));
            queueMicrotask(() => console.log('microtask'));
            console.log('script end');
          `),
          expectedOutput: 'script start\nscript end\npromise\nmicrotask\ntimeout',
          explanation: [
            'The whole script runs first (a single macrotask).',
            'Then the microtask queue drains in FIFO order: `promise`, `microtask`.',
            'Only then does the loop start and run the timers phase.',
          ],
          runnable: true,
        }),
        code({
          title: 'What keeps the process alive: ref and unref',
          code: dedent(`
            const t = setInterval(() => console.log('tick'), 1000);
            t.unref(); // this timer no longer keeps the loop alive

            process.on('exit', (code) => console.log('exit', code));
            console.log('main done');
          `),
          expectedOutput: 'main done\nexit 0',
          explanation: [
            'An unref\'d timer does not count as "work to wait for".',
            'With no other handles, the loop has nothing to do and exits immediately — `tick` never prints.',
            'Remove `unref()` and the process runs forever.',
          ],
        }),
        code({
          title: 'beforeExit: the loop is empty',
          code: dedent(`
            let rounds = 0;
            process.on('beforeExit', () => {
              if (rounds++ < 2) setTimeout(() => console.log('extra work', rounds), 0);
            });
            process.on('exit', () => console.log('exit'));
            console.log('main');
          `),
          expectedOutput: 'main\nextra work 1\nextra work 2\nexit',
          explanation: [
            '`beforeExit` fires when the loop runs out of work.',
            'Scheduling something in it restarts the loop; when it empties again, `beforeExit` fires again.',
            '`exit` handlers must be synchronous — the loop no longer runs.',
          ],
        }),
      ),
      section('real-world', 'Real-world backend usage',
        bullets(
          '`server.listen()` creates a ref\'d handle — that is why HTTP servers do not exit.',
          'Graceful shutdown = close the server and DB pool so no handles remain; the process then exits naturally.',
          'A test runner "hanging" after tests usually means an open handle (DB connection, interval) — `unref()` or close it.',
          'Background intervals (metrics flush) are often `unref()`d so they do not block shutdown.',
        ),
      ),
      section('mistakes', 'Common mistakes',
        bullets(
          'Thinking the event loop runs on a separate thread — it runs on the main JS thread.',
          'Assuming V8 provides the event loop — in Node it is libuv (browsers have their own).',
          'Forgetting to close handles, so CLIs and tests never exit.',
          'Blocking the loop with CPU work and blaming "slow I/O".',
        ),
        code({
          title: 'Wrong vs right: a script that never exits',
          code: dedent(`
            // Wrong: the open pool keeps the loop alive forever
            const pool = new Pool();
            const { rows } = await pool.query('SELECT count(*) FROM users');
            console.log(rows[0].count);

            // Right: release the handle when you are done
            await pool.end();
          `),
          explanation: ['Sockets in the pool are active handles. `pool.end()` closes them so the loop can finish.'],
        }),
      ),
      section('interview', 'Interview angle',
        interviewTip('A strong answer names libuv, lists the phases in order, says microtasks drain between callbacks, and explains that the poll phase *waits* for I/O. Save deep internals (loop lag monitoring) for follow-ups.'),
      ),
      section('practice', 'Practice',
        steps(
          'Write a script with a 5 s `setTimeout` and add `process.on(\'exit\')`. Then `unref()` the timer and observe the difference.',
          'Use the simulator above to predict the output of the first example before running it.',
        ),
      ),
      section('summary', 'Summary',
        bullets(
          'The event loop (libuv) dispatches callbacks one at a time on the main thread.',
          'Order: sync script → nextTick → promises → loop phases.',
          'Microtasks drain between every callback.',
          'The process lives while ref\'d handles/requests exist.',
        ),
      ),
    ],
    revisionNotes: [
      'Event loop = libuv; JS runs on the same main thread.',
      'Phases: timers → pending → idle/prepare → poll → check → close.',
      'nextTick queue, then promise microtasks, drain after the main script and after each callback.',
      'Process exits when no ref\'d handles/requests remain; `unref()` opts a handle out.',
      '`beforeExit` can schedule more work; `exit` handlers must be sync.',
    ],
    quiz: [
      {
        kind: 'predict-output', difficulty: 'beginner',
        prompt: 'What is the output order?',
        code: "setTimeout(() => console.log('T'), 0);\nPromise.resolve().then(() => console.log('P'));\nconsole.log('S');",
        options: ['T P S', 'S T P', 'P S T', 'S P T'],
        answer: 3,
        explanation: 'Synchronous code first (S), then microtasks (P), then the timers phase (T). "S T P" treats promise callbacks and timers as one queue.',
      },
      {
        kind: 'mcq', difficulty: 'intermediate',
        prompt: 'Which component implements the event loop in Node.js?',
        options: ['V8', 'libuv', 'The OS kernel', 'The npm runtime'],
        answer: 1,
        explanation: 'libuv provides the loop, timers, OS polling and the thread pool. V8 executes JS and owns the promise microtask queue but has no event loop of its own in Node.',
      },
      {
        kind: 'predict-output', difficulty: 'intermediate',
        prompt: 'What does this script print, and does it exit?',
        code: "const id = setTimeout(() => console.log('timer'), 1000);\nid.unref();\nconsole.log('main');",
        options: ['main, then timer after 1 s, then exits', 'timer, main', 'main, then exits immediately', 'main, then hangs forever'],
        answer: 2,
        explanation: 'An unref\'d timer does not keep the loop alive. After the script, nothing ref\'d remains, so the process exits before the timer fires.',
      },
    ],
    interview: [
      {
        category: 'nodejs', kind: 'concept', difficulty: 'beginner', topic: 'Event loop',
        question: 'What is the event loop in Node.js?',
        shortAnswer: 'It is the mechanism, implemented by libuv, that lets single-threaded JavaScript handle async work: it waits for timers and I/O to complete and runs their callbacks one at a time on the main thread.',
        detailedAnswer: [
          'Your script runs first; async APIs register callbacks with libuv.',
          'The loop cycles through phases (timers, pending, poll, check, close).',
          'Between callbacks it drains nextTick and promise microtasks.',
          'In the poll phase it can block waiting for I/O without using CPU.',
          'It stops when no active handles or requests remain.',
        ],
        followUp: 'Name the phases in order.',
        trap: 'Describing it as a thread pool or saying it runs JS in parallel.',
      },
      {
        category: 'nodejs', kind: 'concept', difficulty: 'intermediate', topic: 'Event loop',
        question: 'How does the Node.js event loop differ from the browser event loop?',
        shortAnswer: 'Both run tasks one at a time and drain microtasks between them, but Node\'s loop is libuv with explicit phases (timers, poll, check, close…) plus Node-only queues like `process.nextTick` and `setImmediate`, while browsers follow the HTML spec with task sources and a rendering step.',
        detailedAnswer: [
          'Node: libuv phases; browser: task queues chosen by the user agent + rendering opportunities (`requestAnimationFrame`).',
          'Node-only: `process.nextTick` (runs before promises), `setImmediate` (check phase).',
          'Both: promise jobs and `queueMicrotask` drain after each task.',
          'Since Node 11, microtasks drain between individual timers, matching browser behaviour.',
          'Node\'s `setTimeout` returns a `Timeout` object; browsers return a number.',
        ],
        followUp: 'Why did Node 11 change how microtasks run between timers?',
        trap: 'Saying they are identical because both "use the event loop".',
      },
      {
        category: 'nodejs', kind: 'concept', difficulty: 'advanced', topic: 'Event loop',
        question: 'What determines when a Node.js process exits on its own, and why might a script hang after finishing its work?',
        shortAnswer: 'The process exits when the event loop has no active, ref\'d handles or requests left. A script hangs when something still holds the loop open — an open server, DB pool socket, interval or file watcher.',
        detailedAnswer: [
          'Handles (timers, sockets, servers, watchers) and requests (pending fs/dns operations) keep the loop alive while ref\'d.',
          '`handle.unref()` lets the process exit even if the handle is active; `ref()` reverses it.',
          'When the loop empties, `beforeExit` fires and may schedule more work; then `exit` fires (sync handlers only).',
          'Debug hangs with `why-is-node-running` or `process.getActiveResourcesInfo()` (Node 17+).',
          '`process.exit()` forces exit but may cut off pending writes — prefer closing resources.',
        ],
        followUp: 'Why is `process.exit()` inside a request handler dangerous?',
        trap: 'Thinking the process exits when the last line of the script runs.',
      },
    ],
  },

  // ───────────────────────────────────────────────────────────
  'event-loop-phases': {
    summary: 'Each loop iteration runs six phases in order — timers, pending callbacks, idle/prepare, poll, check, close callbacks — and each phase has its own FIFO queue of callbacks.',
    topics: ['timers phase', 'pending callbacks', 'idle/prepare', 'poll phase', 'check phase', 'close callbacks', 'libuv'],
    sections: [
      section('introduction', undefined,
        text('Knowing *that* there is an event loop is not enough to predict output. You need the **phases**: they decide why `setImmediate` runs before a timer inside an I/O callback, and why the process can sleep without burning CPU.'),
      ),
      section('definition', 'The phases',
        table('Event loop phases (in order)', ['#', 'Phase', 'Runs', 'Examples'], [
          ['1', '**timers**', 'Callbacks of expired `setTimeout` / `setInterval`', '`setTimeout(fn, 10)`'],
          ['2', '**pending callbacks**', 'I/O callbacks deferred from the previous iteration (e.g. some TCP errors)', '`ECONNREFUSED` on some systems'],
          ['3', 'idle, prepare', 'Internal libuv use only', '—'],
          ['4', '**poll**', 'Retrieve new I/O events and run their callbacks; may **block** waiting', '`fs.readFile` callback, incoming socket data'],
          ['5', '**check**', '`setImmediate` callbacks', '`setImmediate(fn)`'],
          ['6', '**close callbacks**', '`\'close\'` events of handles closed abruptly', '`socket.on(\'close\')` after `destroy()`'],
        ]),
        note('After **every** callback in any phase, Node drains `process.nextTick` callbacks, then promise microtasks.'),
      ),
      section('why', 'Why phases matter',
        bullets(
          'They explain ordering puzzles: "immediate before timeout inside readFile" is a direct consequence of poll → check → timers.',
          'They explain idle CPU usage: an idle server is parked in poll.',
          'They explain starvation: callbacks added to the *current* phase queue may run before the loop moves on.',
        ),
      ),
      section('internals', 'Phase by phase',
        bullets(
          '**Timers**: timers are kept sorted by expiry. The phase runs every timer whose threshold has passed, in order. A timer never runs *early*, but may run late.',
          '**Pending callbacks**: a small set of system-level callbacks libuv postponed from the previous iteration.',
          '**Poll**: computes how long it may block. If immediates are queued → timeout 0 (don\'t block). Else, block until the nearest timer is due. If there are no timers and nothing else ref\'d, the loop can exit instead. Then it runs I/O callbacks (up to a system-dependent limit) and moves on.',
          '**Check**: runs all `setImmediate` callbacks queued *before* the phase started. Immediates scheduled during the check phase run in the **next** iteration.',
          '**Close callbacks**: `\'close\'` events, e.g. after `socket.destroy()`.',
          'libuv versions differ slightly in exactly when the loop time is updated and timers are re-checked; the documented order above is what you can rely on.',
        ),
        diagram('event-loop-phases', 'timers → pending → idle/prepare → poll → check → close, then back to timers.'),
        flow([
          'poll: anything in check queue? → do not block',
          'poll: timers pending? → block until the nearest one',
          'poll: nothing at all? → loop may exit',
          'poll: I/O ready → run callbacks, then go to check',
        ], { title: 'How the poll phase decides to wait', direction: 'vertical' }),
      ),
      section('example', 'Examples',
        code({
          title: 'Phases seen from inside an I/O callback',
          code: dedent(`
            const fs = require('node:fs');

            fs.readFile(__filename, () => {
              console.log('poll: readFile callback');
              setTimeout(() => console.log('timers: setTimeout'), 0);
              setImmediate(() => console.log('check: setImmediate'));
              process.nextTick(() => console.log('nextTick (right after this callback)'));
            });
          `),
          expectedOutput: 'poll: readFile callback\nnextTick (right after this callback)\ncheck: setImmediate\ntimers: setTimeout',
          explanation: [
            'The readFile callback runs in **poll**.',
            'nextTick drains immediately after the callback.',
            'The loop continues to **check** (setImmediate) before wrapping around to **timers**. This order is guaranteed.',
          ],
        }),
        code({
          title: 'Check before close',
          code: dedent(`
            const net = require('node:net');

            const server = net.createServer();
            server.listen(0, () => {
              const socket = net.connect(server.address().port, () => {
                socket.on('close', () => {
                  console.log('close: socket closed');
                  server.close();
                });
                setImmediate(() => console.log('check: setImmediate'));
                socket.destroy();
              });
            });
          `),
          expectedOutput: 'check: setImmediate\nclose: socket closed',
          explanation: ['`destroy()` closes the handle; libuv delivers the close callback in the close phase, after check.'],
        }),
        code({
          title: 'Timers phase runs expired timers in expiry order',
          code: dedent(`
            setTimeout(() => console.log('50ms'), 50);
            setTimeout(() => console.log('10ms'), 10);
            setTimeout(() => console.log('30ms'), 30);
          `),
          expectedOutput: '10ms\n30ms\n50ms',
          explanation: ['Timers are ordered by when they expire, not by when they were created.'],
          runnable: true,
        }),
      ),
      section('real-world', 'Real-world backend usage',
        bullets(
          'An idle API server sits in **poll**, blocked in `epoll_wait`/`kqueue`/IOCP with ~0% CPU.',
          'Incoming HTTP requests, DB responses and Redis replies are all poll-phase callbacks.',
          '`setImmediate` is the right tool to yield *after* the current batch of I/O callbacks (check phase).',
          'Cleanup of abruptly destroyed sockets surfaces in close callbacks.',
        ),
      ),
      section('mistakes', 'Common mistakes',
        bullets(
          'Listing `process.nextTick` or promises as a phase — they are not phases; they run between callbacks.',
          'Assuming `setTimeout(fn, 0)` runs before `setImmediate` everywhere.',
          'Believing the loop spins in a busy loop when idle — poll blocks.',
          'Thinking every I/O callback runs in "pending callbacks" — most run in poll.',
        ),
        code({
          title: 'Wrong vs right mental model',
          code: dedent(`
            // Wrong: "nextTick is phase 0, promises are phase 7"
            // Right:
            //   [main script] → nextTicks → microtasks
            //   loop: timers → pending → idle/prepare → poll → check → close
            //   and after EVERY callback: nextTicks → microtasks
          `),
          language: 'text',
        }),
      ),
      section('interview', 'Interview angle',
        interviewTip('Recite the phases in order and give one API per phase: timers = `setTimeout`, poll = `fs`/socket callbacks, check = `setImmediate`, close = `\'close\'` events. Then add: "microtasks are not a phase".'),
      ),
      section('practice', 'Practice',
        steps(
          'Inside an `fs.readFile` callback, schedule a timer, an immediate, a nextTick and a promise. Predict the order, then run it.',
          'Do the same inside a `setTimeout` callback and compare.',
        ),
      ),
      section('summary', 'Summary',
        bullets(
          'Order: timers → pending → idle/prepare → poll → check → close.',
          'Poll runs I/O callbacks and can block waiting for I/O.',
          'Check = `setImmediate`; always right after poll.',
          'nextTick/microtasks are not phases; they drain between callbacks.',
        ),
      ),
    ],
    revisionNotes: [
      'timers → pending callbacks → idle/prepare → poll → check → close callbacks.',
      'Poll: I/O callbacks; blocks until the nearest timer if no immediates are queued.',
      'Check: setImmediate; immediates queued during check run next iteration.',
      'Close: `\'close\'` events of destroyed handles.',
      'Inside an I/O callback: setImmediate always fires before setTimeout(0).',
    ],
    quiz: [
      {
        kind: 'mcq', difficulty: 'beginner',
        prompt: 'What is the correct order of the main event loop phases?',
        options: [
          'timers → pending callbacks → poll → check → close callbacks',
          'poll → timers → check → close',
          'timers → poll → close → check',
          'check → timers → poll → close callbacks',
        ],
        answer: 0,
        explanation: 'timers, pending callbacks, (idle/prepare), poll, check, close callbacks — then the loop repeats.',
      },
      {
        kind: 'predict-output', difficulty: 'intermediate',
        prompt: 'What does this print?',
        code: "const fs = require('node:fs');\nfs.readFile(__filename, () => {\n  setTimeout(() => console.log('timeout'), 0);\n  setImmediate(() => console.log('immediate'));\n});",
        options: ['timeout, immediate', 'immediate, timeout', 'Either order, it is random', 'Only immediate'],
        answer: 1,
        explanation: 'The callback runs in the poll phase. The next phase is check (immediate), and only on the next iteration do timers run. "Random" is true only for the main module, not inside I/O callbacks.',
      },
      {
        kind: 'mcq', difficulty: 'intermediate',
        prompt: 'An HTTP server is idle with no timers due. What is the event loop doing?',
        options: [
          'Spinning through all phases continuously at 100% CPU',
          'Blocked in the poll phase, waiting for the OS to report I/O',
          'Exited; it restarts when a request arrives',
          'Running the check phase repeatedly',
        ],
        answer: 1,
        explanation: 'The poll phase blocks in the OS (epoll/kqueue/IOCP) until an event or the next timer is due, so an idle server uses almost no CPU. The listening socket is a ref\'d handle, so the loop does not exit.',
      },
    ],
    interview: [
      {
        category: 'nodejs', kind: 'concept', difficulty: 'intermediate', topic: 'Event loop',
        question: 'List the phases of the Node.js event loop and give an example of a callback that runs in each.',
        shortAnswer: 'timers (setTimeout/setInterval), pending callbacks (deferred system errors), idle/prepare (internal), poll (I/O callbacks like fs.readFile and socket data), check (setImmediate), close callbacks (\'close\' events).',
        detailedAnswer: [
          'Each phase has a FIFO queue; the loop processes it, then moves on.',
          'After every callback: drain nextTick queue, then promise microtasks.',
          'Poll is where most application callbacks run and where the loop waits.',
          'Check exists so you can run code right after I/O callbacks.',
          'nextTick and promises are not phases.',
        ],
        followUp: 'Why does setImmediate inside an I/O callback always run before setTimeout(0)?',
        trap: 'Including "microtask phase" or "nextTick phase" in the list.',
      },
      {
        category: 'nodejs', kind: 'concept', difficulty: 'advanced', topic: 'Event loop',
        question: 'What does the poll phase do, and how does it decide how long to block?',
        shortAnswer: 'Poll asks the OS for completed I/O and runs those callbacks. It blocks for 0 ms if immediates or other work are pending, until the nearest timer otherwise, and indefinitely while only I/O handles are active and no timers exist.',
        detailedAnswer: [
          'libuv computes a poll timeout: 0 if `setImmediate` callbacks, pending or closing handles exist.',
          'Otherwise the time until the nearest timer; `-1` (infinite) if there are no timers.',
          'If there are no active handles or requests at all, the loop exits instead of blocking.',
          'It then runs ready I/O callbacks (bounded per iteration) and continues to check.',
          'This blocking wait in epoll/kqueue/IOCP is why idle Node processes use ~0% CPU.',
        ],
        followUp: 'What happens to a timer whose deadline passes while a long poll callback is running?',
        trap: 'Saying poll "busy-waits" or that timers can interrupt a running callback.',
      },
    ],
  },

  // ───────────────────────────────────────────────────────────
  'microtask-queue': {
    summary: 'The microtask queue holds promise reactions, await continuations and queueMicrotask callbacks; it is drained completely after the current callback, before the event loop continues.',
    topics: ['microtask', 'microtask queue', 'queueMicrotask', 'promise jobs', 'starvation', 'drain'],
    sections: [
      section('introduction', undefined,
        text('Why does a promise callback scheduled *after* a `setTimeout(0)` run *before* it? Because promise callbacks do not go to the event loop at all — they go to the **microtask queue**, which is emptied before the loop moves on.'),
      ),
      section('definition', 'Definition',
        bullets(
          'A **microtask** is a short callback queued to run as soon as the current JavaScript finishes — before any timer, I/O or immediate.',
          'Sources: `.then/.catch/.finally` reactions, `await` continuations, `queueMicrotask(fn)`.',
          'The queue is owned by **V8**. Node also has its own `process.nextTick` queue, drained just **before** the microtask queue (CommonJS).',
          'Draining is **exhaustive**: microtasks added while draining run in the same drain.',
        ),
        table('Microtask vs nextTick vs macrotask', ['', 'process.nextTick', 'Microtask', 'Macrotask (phase callback)'], [
          ['Owner', 'Node', 'V8 (ECMAScript)', 'libuv / Node'],
          ['APIs', '`process.nextTick`', '`then`, `await`, `queueMicrotask`', '`setTimeout`, `setImmediate`, I/O'],
          ['Runs', 'After the current callback, first', 'After the nextTick queue', 'In its loop phase'],
          ['Drain', 'All, including newly added', 'All, including newly added', 'One callback, then microtasks'],
        ]),
      ),
      section('why', 'Why it exists',
        bullets(
          'Promises must call handlers asynchronously but **as soon as possible**, to keep state consistent and latency low.',
          'Batching: many promise steps can complete within one turn without the overhead of going through the loop.',
          '`queueMicrotask` gives libraries a standard (cross-platform) way to defer work.',
        ),
      ),
      section('internals', 'How draining works',
        steps(
          'A callback (or the main script) finishes and the stack is empty.',
          'Node runs every `process.nextTick` callback (including newly added ones).',
          'Node asks V8 to run microtasks; V8 runs jobs until its queue is empty — jobs queued meanwhile run too.',
          'If microtasks queued new nextTicks, Node loops back and drains both again.',
          'Only then does the event loop continue to the next callback or phase.',
        ),
        diagram('event-loop-simulator', 'Watch the microtask queue drain completely before the timer runs.'),
        warn('Because draining is exhaustive, a microtask that always queues another microtask **starves** the event loop: no timers, no I/O, no responses.'),
      ),
      section('example', 'Examples',
        code({
          title: 'Microtasks queued during a drain run in the same drain',
          code: dedent(`
            setTimeout(() => console.log('timeout'), 0);

            queueMicrotask(() => {
              console.log('micro 1');
              queueMicrotask(() => console.log('micro 3 (queued during drain)'));
            });
            Promise.resolve().then(() => console.log('micro 2'));
          `),
          expectedOutput: 'micro 1\nmicro 2\nmicro 3 (queued during drain)\ntimeout',
          explanation: [
            '`queueMicrotask` and promise reactions share one FIFO queue.',
            '`micro 3` joins the back of the queue but still runs before the loop reaches timers.',
          ],
          runnable: true,
        }),
        code({
          title: 'Starvation (bounded so it terminates)',
          code: dedent(`
            let n = 0;
            setTimeout(() => console.log('timeout finally runs after', n, 'microtasks'), 0);

            function spin() {
              if (++n < 100000) queueMicrotask(spin);
            }
            queueMicrotask(spin);
          `),
          expectedOutput: 'timeout finally runs after 100000 microtasks',
          explanation: ['The timer was due long before, but it cannot run until all 100 000 microtasks are done.', 'Without the bound, the timer would never run.'],
          runnable: true,
        }),
        code({
          title: 'await continuations are microtasks',
          code: dedent(`
            async function worker(name) {
              console.log(name, 'step 1');
              await null;
              console.log(name, 'step 2');
              await null;
              console.log(name, 'step 3');
            }
            worker('A');
            worker('B');
            console.log('sync done');
          `),
          expectedOutput: 'A step 1\nB step 1\nsync done\nA step 2\nB step 2\nA step 3\nB step 3',
          explanation: ['Each `await` yields; the two functions interleave one microtask at a time.'],
          runnable: true,
        }),
      ),
      section('real-world', 'Real-world backend usage',
        bullets(
          'Libraries batch work with `queueMicrotask` (e.g. DataLoader-style batching collects all `load(id)` calls made in the same tick, then issues one query).',
          'Long promise chains processing large arrays in one tick can delay I/O just like a sync loop — yield with `setImmediate` periodically.',
        ),
        code({
          title: 'Batching calls made in the same tick',
          code: dedent(`
            function createBatcher(batchFn) {
              let queue = [];
              return (key) => new Promise((resolve) => {
                queue.push({ key, resolve });
                if (queue.length === 1) {
                  queueMicrotask(() => {
                    const batch = queue;
                    queue = [];
                    const results = batchFn(batch.map((b) => b.key));
                    batch.forEach((b, i) => b.resolve(results[i]));
                  });
                }
              });
            }

            const load = createBatcher((ids) => {
              console.log('one query for', ids);
              return ids.map((id) => ({ id }));
            });
            Promise.all([load(1), load(2), load(3)]).then((users) => console.log(users.length, 'users'));
          `),
          expectedOutput: 'one query for [ 1, 2, 3 ]\n3 users',
          explanation: ['All three `load` calls happen synchronously; the microtask runs once after them and sees the full batch.'],
          runnable: true,
        }),
      ),
      section('mistakes', 'Common mistakes',
        bullets(
          'Recursive promise/microtask loops that never yield → frozen server.',
          'Using microtasks to "break up" CPU work — they do not let I/O run; use `setImmediate`.',
          'Throwing inside `queueMicrotask` — it is reported as an **uncaught exception**, not a rejection.',
          'Assuming promises and `setTimeout(0)` share a queue.',
        ),
        code({
          title: 'Wrong vs right: yielding to I/O',
          code: dedent(`
            // Wrong: never lets the event loop run
            async function processAll(items) {
              for (const item of items) {
                await Promise.resolve(); // microtask — I/O still starved
                heavyWork(item);
              }
            }

            // Right: yield to the loop every N items
            const { setImmediate: yieldToLoop } = require('node:timers/promises');
            async function processAllFair(items) {
              for (let i = 0; i < items.length; i++) {
                heavyWork(items[i]);
                if (i % 1000 === 0) await yieldToLoop();
              }
            }
          `),
          explanation: ['`await Promise.resolve()` resumes in the same microtask drain.', '`timers/promises` `setImmediate` resumes in the check phase, after pending I/O.'],
        }),
      ),
      section('interview', 'Interview angle',
        interviewTip('Say "drained completely, including microtasks added during the drain" — that single sentence answers most microtask output questions and explains starvation.'),
      ),
      section('practice', 'Practice',
        steps(
          'Write a script that interleaves two async functions with three awaits each. Predict, then run.',
          'Make a microtask loop that runs 1 s worth of work and observe how late a 10 ms timer fires.',
        ),
      ),
      section('summary', 'Summary',
        bullets(
          'Microtasks: promise reactions, await continuations, queueMicrotask.',
          'Drained fully after each callback, before the loop continues.',
          'Node\'s nextTick queue runs before them (CommonJS).',
          'Endless microtasks starve timers and I/O.',
        ),
      ),
    ],
    revisionNotes: [
      'Microtask sources: then/catch/finally, await, queueMicrotask.',
      'FIFO; drained completely, including newly queued ones.',
      'Order after a callback: nextTick queue → microtask queue → next macrotask.',
      'Microtask loops starve the event loop; use setImmediate to yield.',
      'Errors in queueMicrotask callbacks → uncaughtException.',
    ],
    quiz: [
      {
        kind: 'predict-output', difficulty: 'beginner',
        prompt: 'What is the output?',
        code: "Promise.resolve().then(() => console.log('A'));\nqueueMicrotask(() => console.log('B'));\nconsole.log('C');",
        options: ['A B C', 'C B A', 'C A B', 'B A C'],
        answer: 2,
        explanation: 'Synchronous `C` first. Both callbacks share the microtask queue in FIFO order: A then B.',
      },
      {
        kind: 'predict-output', difficulty: 'intermediate',
        prompt: 'What is the output?',
        code: "setTimeout(() => console.log('T'), 0);\nPromise.resolve().then(() => {\n  console.log('P1');\n  Promise.resolve().then(() => console.log('P2'));\n});",
        options: ['P1 T P2', 'P1 P2 T', 'T P1 P2', 'P1 T, P2 never runs'],
        answer: 1,
        explanation: 'P2 is queued during the drain, so it runs in the same drain, before the loop reaches the timers phase.',
      },
      {
        kind: 'mcq', difficulty: 'intermediate',
        prompt: 'Which of these does NOT schedule a microtask?',
        options: ['`setImmediate(fn)`', '`promise.then(fn)`', '`queueMicrotask(fn)`', 'The code after `await x`'],
        answer: 0,
        explanation: '`setImmediate` queues a callback for the check phase of the event loop — a macrotask. The others are all microtasks.',
      },
    ],
    interview: [
      {
        category: 'javascript', kind: 'concept', difficulty: 'intermediate', topic: 'Microtasks',
        question: 'What is the microtask queue, and when exactly does Node.js drain it?',
        shortAnswer: 'It is V8\'s queue of promise reactions, await continuations and queueMicrotask callbacks. Node drains it right after the main script and after every individual macrotask callback, immediately after the nextTick queue, until it is empty.',
        detailedAnswer: [
          'Draining is exhaustive: new microtasks run in the same drain.',
          'Node 11+ drains after each timer/immediate callback, not once per phase.',
          'nextTick callbacks run first; if microtasks schedule nextTicks, Node alternates until both are empty.',
          'Only then does the event loop advance.',
        ],
        followUp: 'What happens if a microtask keeps scheduling another microtask?',
        trap: 'Saying microtasks run "in the next loop iteration" or "in a microtask phase".',
      },
      {
        category: 'nodejs', kind: 'output', difficulty: 'advanced', topic: 'Microtasks',
        question: 'A recursive function reschedules itself forever. Compare what happens to a pending setTimeout when the recursion uses queueMicrotask versus setImmediate.',
        shortAnswer: 'With `queueMicrotask` the timer never runs — the microtask queue never empties, so the loop cannot advance. With `setImmediate`, each call goes to the next iteration\'s check phase, so timers and I/O keep running in between.',
        detailedAnswer: [
          'Microtasks drain completely, including ones added during the drain → starvation.',
          'Immediates added during the check phase are deferred to the next iteration.',
          'The same starvation applies to recursive `process.nextTick` and to `await`-only loops.',
          'Use `setImmediate` (or `timers/promises` setImmediate) to yield in long-running work.',
        ],
        code: {
          id: 'm05-int-starve-compare',
          language: 'javascript',
          code: "setTimeout(() => console.log('timer'), 0);\n\nfunction viaMicrotask() { queueMicrotask(viaMicrotask); }   // 'timer' never prints\nfunction viaImmediate() { setImmediate(viaImmediate); }     // 'timer' prints\n\nviaImmediate();",
          expectedOutput: 'timer',
        },
        followUp: 'Would wrapping each iteration in `await Promise.resolve()` help?',
        trap: 'Assuming "async" deferral of any kind lets the event loop breathe.',
      },
    ],
  },

  // ───────────────────────────────────────────────────────────
  'macrotasks-and-task-queues': {
    summary: '"Macrotask" is the informal name for callbacks that run from an event-loop phase (timers, I/O, immediates, close events); Node keeps a separate queue per phase and drains microtasks after each one.',
    topics: ['macrotask', 'task queue', 'timers queue', 'check queue', 'Node 11 change', 'microtasks between timers'],
    sections: [
      section('introduction', undefined,
        text('Interviewers say "macrotask queue" as if there were one. In Node there are several — one per loop phase — and how microtasks fit between them changed in Node 11.'),
      ),
      section('definition', 'Definition',
        bullets(
          'A **macrotask** (or just "task") is a callback scheduled to run from the event loop: `setTimeout`, `setInterval`, `setImmediate`, I/O callbacks, `\'close\'` events.',
          'The term comes from browsers; the Node docs talk about **phases** and their queues.',
          'Node runs **one macrotask, then drains nextTick + microtasks**, then the next macrotask.',
        ),
        table('Macrotasks vs microtasks', ['', 'Macrotasks', 'Microtasks'], [
          ['Examples', '`setTimeout`, `setImmediate`, I/O, close events', '`then`, `await`, `queueMicrotask` (+ Node\'s `nextTick` queue)'],
          ['Queue', 'One per phase (timers, poll, check, close…)', 'One V8 queue (+ nextTick queue)'],
          ['When', 'When the loop reaches that phase', 'Right after the current callback'],
          ['Per turn', 'One callback, then microtasks drain', 'All of them'],
          ['Starvation risk', 'Low (immediates queued in check wait for next iteration)', 'High (recursive scheduling)'],
        ]),
      ),
      section('why', 'Why the distinction matters',
        bullets(
          'It is the basis of every execution-order question.',
          'It tells you how to yield: microtasks do **not** let I/O run; macrotasks do.',
          'Node 11 changed microtask timing between timers — older blog posts show different output.',
        ),
      ),
      section('internals', 'Per-phase queues',
        bullets(
          '**Timers**: lists grouped by duration, held in a priority queue by expiry time.',
          '**Poll**: I/O completions reported by the OS / thread pool.',
          '**Check**: a linked list of immediates.',
          '**Close**: handles being closed.',
          '**Node 11+**: after *each* `setTimeout`/`setInterval`/`setImmediate` callback, Node drains nextTick + microtasks. In Node ≤ 10 they drained only after the whole phase queue was processed.',
        ),
        diagram('event-loop-phases', 'Each phase is its own macrotask queue; microtasks drain after every callback.'),
      ),
      section('example', 'Examples',
        code({
          title: 'Microtasks run between timers (Node 11+)',
          code: dedent(`
            setTimeout(() => {
              console.log('timeout 1');
              Promise.resolve().then(() => console.log('promise inside timeout 1'));
            }, 0);
            setTimeout(() => {
              console.log('timeout 2');
              Promise.resolve().then(() => console.log('promise inside timeout 2'));
            }, 0);
          `),
          expectedOutput: 'timeout 1\npromise inside timeout 1\ntimeout 2\npromise inside timeout 2',
          explanation: [
            'Both timers expire in the same timers phase.',
            'After timeout 1\'s callback, the microtask queue drains before timeout 2 runs.',
            'On Node ≤ 10 the output was `timeout 1, timeout 2, promise inside timeout 1, promise inside timeout 2`.',
          ],
          versionNote: 'Node 11+ (matches browser behaviour).',
          runnable: true,
        }),
        code({
          title: 'Same rule for immediates, with nextTick',
          code: dedent(`
            setImmediate(() => {
              console.log('immediate 1');
              process.nextTick(() => console.log('nextTick from immediate 1'));
              Promise.resolve().then(() => console.log('promise from immediate 1'));
            });
            setImmediate(() => console.log('immediate 2'));
          `),
          expectedOutput: 'immediate 1\nnextTick from immediate 1\npromise from immediate 1\nimmediate 2',
          explanation: ['nextTick first, then promise microtasks, then the next immediate in the check queue.'],
        }),
        code({
          title: 'Yielding with a macrotask lets other work in',
          code: dedent(`
            const log = [];
            setTimeout(() => log.push('other timer'), 0);

            function chunked(i) {
              log.push('chunk ' + i);
              if (i < 3) setTimeout(() => chunked(i + 1), 0); // macrotask: yields
              else setTimeout(() => console.log(log.join(' | ')), 0);
            }
            chunked(1);
          `),
          expectedOutput: 'chunk 1 | other timer | chunk 2 | chunk 3',
          explanation: ['Each chunk schedules the next one as a new timer, so the earlier "other timer" gets its turn in between.', 'With `queueMicrotask` instead, all chunks would run before the other timer.'],
          runnable: true,
        }),
      ),
      section('real-world', 'Real-world backend usage',
        bullets(
          'Breaking up a long CPU job: `setImmediate` between chunks so request callbacks (poll) can interleave.',
          'Debounce/throttle timers in services (e.g. flushing a metrics buffer every second).',
          'Understanding why a log statement inside `.then` appears before a response callback in traces.',
        ),
      ),
      section('mistakes', 'Common mistakes',
        bullets(
          'Talking about "the" macrotask queue in Node — there is one per phase.',
          'Relying on pre-Node-11 ordering from old articles.',
          'Assuming `setTimeout(fn, 0)` and `setImmediate(fn)` are interchangeable.',
          'Using microtasks to yield control.',
        ),
        code({
          title: 'Wrong vs right: yielding',
          code: dedent(`
            // Wrong: still blocks I/O between chunks
            Promise.resolve().then(nextChunk);

            // Right: lets the poll phase run between chunks
            setImmediate(nextChunk);
          `),
        }),
      ),
      section('interview', 'Interview angle',
        interviewTip('If asked "macrotask vs microtask", give the table, then mention the Node 11 change unprompted — it shows you know Node, not just browsers.'),
      ),
      section('practice', 'Practice',
        steps(
          'Predict the output of three `setTimeout(0)` callbacks that each schedule a promise and a `nextTick`. Run and compare.',
          'Rewrite the chunked example using `queueMicrotask` and observe the order change.',
        ),
      ),
      section('summary', 'Summary',
        bullets(
          'Macrotasks = phase callbacks (timers, I/O, immediates, close).',
          'One macrotask → drain nextTick + microtasks → next macrotask.',
          'Node 11+ drains microtasks between individual timers and immediates.',
          'Yield with macrotasks (`setImmediate`), not microtasks.',
        ),
      ),
    ],
    revisionNotes: [
      '"Macrotask" is informal; Node has a queue per loop phase.',
      'After each macrotask: nextTick queue, then microtasks.',
      'Node 11 change: microtasks now drain between each timer/immediate callback (was: after the whole phase).',
      'Only macrotasks let I/O and timers interleave with long work.',
    ],
    quiz: [
      {
        kind: 'predict-output', difficulty: 'intermediate',
        prompt: 'On Node 20, what is the output?',
        code: "setTimeout(() => {\n  console.log('t1');\n  Promise.resolve().then(() => console.log('p1'));\n}, 0);\nsetTimeout(() => {\n  console.log('t2');\n  Promise.resolve().then(() => console.log('p2'));\n}, 0);",
        options: ['t1 t2 p1 p2', 't1 p1 t2 p2', 'p1 p2 t1 t2', 't2 p2 t1 p1'],
        answer: 1,
        explanation: 'Since Node 11, microtasks drain after each individual timer callback. "t1 t2 p1 p2" was the Node ≤ 10 behaviour.',
      },
      {
        kind: 'mcq', difficulty: 'beginner',
        prompt: 'Which of these is a macrotask?',
        options: ['A `.then` callback', 'A `queueMicrotask` callback', 'A `setTimeout` callback', 'The code after `await`'],
        answer: 2,
        explanation: 'Timer callbacks run from the timers phase of the event loop. The other three are microtasks.',
      },
      {
        kind: 'predict-output', difficulty: 'advanced',
        prompt: 'What is the output?',
        code: "setTimeout(() => console.log('timeout A'), 0);\nPromise.resolve()\n  .then(() => {\n    console.log('then 1');\n    setTimeout(() => console.log('timeout B'), 0);\n  })\n  .then(() => console.log('then 2'));\nconsole.log('sync');",
        options: [
          'sync, then 1, timeout A, then 2, timeout B',
          'sync, then 1, then 2, timeout B, timeout A',
          'sync, timeout A, then 1, then 2, timeout B',
          'sync, then 1, then 2, timeout A, timeout B',
        ],
        answer: 3,
        explanation: 'Both `.then` steps are microtasks and finish before the loop starts. Timer A was created first, so it fires before timer B in the timers phase.',
      },
    ],
    interview: [
      {
        category: 'javascript', kind: 'concept', difficulty: 'intermediate', topic: 'Task queues',
        question: 'What is the difference between macrotasks and microtasks, with Node.js examples of each?',
        shortAnswer: 'Macrotasks are callbacks run from event-loop phases — setTimeout, setInterval, setImmediate, I/O and close callbacks. Microtasks are promise reactions, await continuations and queueMicrotask; they drain completely after every macrotask, before the next one runs.',
        detailedAnswer: [
          'One macrotask per turn, then the full microtask drain.',
          'Node-specific: `process.nextTick` queue drains before promise microtasks.',
          'Node keeps separate macrotask queues per phase.',
          'Microtasks can starve the loop; macrotasks scheduled in check wait for the next iteration.',
        ],
        followUp: 'Where does process.nextTick fit in this model?',
        trap: 'Calling setImmediate a microtask because its name sounds immediate.',
      },
      {
        category: 'nodejs', kind: 'output', difficulty: 'advanced', topic: 'Task queues',
        question: 'What changed in Node.js 11 about how microtasks run between timer callbacks, and how does it change the output of two timers that each schedule a promise?',
        shortAnswer: 'From Node 11, nextTick and microtask queues drain after every individual setTimeout/setInterval/setImmediate callback, so the output is `t1 p1 t2 p2`. Up to Node 10 they drained only after the whole timers phase, giving `t1 t2 p1 p2`.',
        detailedAnswer: [
          'The change aligned Node with browser semantics.',
          'It affects timers and immediates that expire in the same phase.',
          'Code relying on the old batching (rare) broke subtly.',
          'Old blog posts and Stack Overflow answers still show the pre-11 order.',
        ],
        code: {
          id: 'm05-int-node11',
          language: 'javascript',
          code: "setTimeout(() => { console.log('t1'); Promise.resolve().then(() => console.log('p1')); }, 0);\nsetTimeout(() => { console.log('t2'); Promise.resolve().then(() => console.log('p2')); }, 0);",
          expectedOutput: 't1\np1\nt2\np2',
          runnable: true,
        },
        followUp: 'Does the same apply to setImmediate callbacks in the check phase?',
        trap: 'Answering with the Node ≤ 10 order.',
      },
    ],
  },
};

export default content;
