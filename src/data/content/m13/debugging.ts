import type { ModuleContent } from '../../../types';
import { bullets, code, dedent, flow, interviewTip, note, section, steps, table, text, tip, warn } from '../helpers';

const content: Partial<ModuleContent> = {
  'debugging-in-vs-code': {
    summary: 'VS Code\'s built-in JavaScript debugger attaches to Node via the inspector protocol, letting you set breakpoints (including conditional breakpoints and logpoints), step through code, inspect variables and debug tests — configured with launch.json or Auto Attach.',
    topics: ['VS Code debugger', 'launch.json', 'breakpoints', 'conditional breakpoints', 'logpoints', 'auto attach', 'JavaScript Debug Terminal', 'attach to process', 'source maps'],
    sections: [
      section('introduction', undefined,
        text('`console.log` debugging means edit, restart, read, repeat. A debugger pauses the program at the exact line, shows every variable and the call stack, and lets you step forward one expression at a time.'),
      ),
      section('definition', 'Debugger features',
        table('Breakpoint types', ['Type', 'How to set', 'Use when'], [
          ['Breakpoint', 'Click the gutter (F9)', 'Pause every time a line runs'],
          ['Conditional breakpoint', 'Right-click gutter → "Add Conditional Breakpoint" → expression `user.id === 42`', 'A loop/route runs thousands of times; you need one case'],
          ['Hit count', 'Conditional → "Hit Count" → `> 100`', 'Bug appears only after N iterations'],
          ['Logpoint', 'Right-click → "Add Logpoint" → `order {order.id} total {order.total}`', 'Log without pausing or editing code'],
          ['Exception breakpoint', 'Breakpoints panel → "Caught/Uncaught Exceptions"', 'Find where an error is thrown'],
          ['Function breakpoint', 'Breakpoints panel → "+" → function name', 'Pause when a named function is entered'],
        ]),
        table('Stepping', ['Action', 'Key', 'Effect'], [
          ['Continue', 'F5', 'Run to the next breakpoint'],
          ['Step Over', 'F10', 'Run the current line, stay in this function'],
          ['Step Into', 'F11', 'Enter the function called on this line'],
          ['Step Out', 'Shift+F11', 'Finish this function, pause in the caller'],
          ['Restart / Stop', 'Ctrl+Shift+F5 / Shift+F5', 'Restart or end the session'],
        ]),
      ),
      section('why', 'Why use a debugger',
        bullets(
          'See the **actual** state: variable values, closures, `this`, the async call stack.',
          'Evaluate expressions in the Debug Console while paused (`JSON.stringify(req.body)`).',
          'Logpoints give you `console.log` in production-like runs without touching code.',
          'Debug tests in place to see why an assertion fails.',
        ),
      ),
      section('internals', 'How VS Code talks to Node',
        steps(
          'VS Code (the `js-debug` extension, built in) starts Node with the inspector enabled, or attaches to one already running.',
          'They communicate over WebSocket using the **Chrome DevTools Protocol** (CDP).',
          'Breakpoints are sent as CDP commands; V8 pauses execution when it hits one and reports scopes and the stack.',
          'Source maps let breakpoints in `.ts` files map to the generated JS that V8 actually runs.',
          'Auto Attach (or the JavaScript Debug Terminal) injects a bootloader via `NODE_OPTIONS` so any `node` process started in that terminal is debugged automatically.',
        ),
        flow([
          'VS Code js-debug',
          'CDP over WebSocket',
          'Node inspector (V8)',
          'Pause at breakpoint',
          'Scopes + stack back to VS Code',
        ], { title: 'Debugger architecture', direction: 'horizontal' }),
      ),
      section('example', 'Configurations',
        code({
          title: '.vscode/launch.json',
          language: 'json',
          code: dedent(`
            {
              "version": "0.2.0",
              "configurations": [
                {
                  "type": "node",
                  "request": "launch",
                  "name": "Launch API",
                  "program": "\${workspaceFolder}/src/server.js",
                  "envFile": "\${workspaceFolder}/.env",
                  "skipFiles": ["<node_internals>/**", "**/node_modules/**"]
                },
                {
                  "type": "node",
                  "request": "launch",
                  "name": "Debug npm run dev",
                  "runtimeExecutable": "npm",
                  "runtimeArgs": ["run", "dev"],
                  "console": "integratedTerminal"
                },
                {
                  "type": "node",
                  "request": "attach",
                  "name": "Attach to :9229 (e.g. Docker)",
                  "port": 9229,
                  "address": "localhost",
                  "localRoot": "\${workspaceFolder}",
                  "remoteRoot": "/app"
                },
                {
                  "type": "node",
                  "request": "launch",
                  "name": "Debug current test file",
                  "program": "\${file}",
                  "runtimeArgs": ["--test"]
                }
              ]
            }
          `),
          expectedOutput: 'Debug Console:\nC:\\Program Files\\nodejs\\node.exe .\\src\\server.js\nDebugger attached.\nListening on :3000\n(paused on breakpoint at src/routes/orders.js:27)',
          explanation: [
            '`launch` starts Node under the debugger; `attach` connects to an already-running `node --inspect` process.',
            '`skipFiles` stops "Step Into" from wandering into Node internals and libraries.',
            '`localRoot`/`remoteRoot` map paths when the code runs in a container.',
            'Breakpoints in test files work the same way — run the test config and pause inside `it(...)`.',
          ],
        }),
        code({
          title: 'Where a conditional breakpoint or logpoint helps',
          code: dedent(`
            // src/routes/orders.js
            app.post('/api/orders', async (req, res) => {
              for (const item of req.body.items) {
                const price = await prices.get(item.sku);       // ◆ conditional: price === undefined
                total += price * item.qty;                       // ◇ logpoint: sku={item.sku} price={price} total={total}
              }
              res.json({ total });
            });
          `),
          expectedOutput: 'Debug Console (logpoint output, program not paused):\nsku=A1 price=10 total=10\nsku=B7 price=undefined total=NaN\n(paused: conditional breakpoint "price === undefined" hit at orders.js:4)',
          explanation: [
            'The conditional breakpoint pauses only for the bad SKU — no need to click Continue 500 times.',
            'The logpoint prints interpolated `{expressions}` without editing or redeploying code.',
            'While paused, hover `item` or type `await prices.get("B7")` in the Debug Console.',
          ],
        }),
      ),
      section('real-world', 'Everyday workflows',
        bullets(
          '**JavaScript Debug Terminal** (Command Palette → "Debug: JavaScript Debug Terminal"): any `node`, `npm run`, `npx jest` started there is debugged — zero config.',
          '**Auto Attach** setting (`debug.javascript.autoAttachFilter`): `smart` attaches to your scripts but not to tools like npm itself; `onlyWithFlag` attaches only when `--inspect` is passed.',
          'TypeScript: enable `sourceMap` in tsconfig (or use tsx); breakpoints in `.ts` files then bind correctly.',
          'Docker: run `node --inspect=0.0.0.0:9229` *inside* the container, publish the port only to localhost (`-p 127.0.0.1:9229:9229`), then use an attach config.',
        ),
        tip('Turn on "Uncaught Exceptions" in the Breakpoints panel when chasing a crash — the debugger pauses at the throw with all local state intact.'),
      ),
      section('mistakes', 'Common mistakes',
        bullets(
          'Breakpoints shown as "unbound" (hollow) — usually missing source maps or wrong `outFiles`/path mapping.',
          'Stepping into `node_modules` endlessly instead of using `skipFiles` or Step Out.',
          'Leaving `debugger;` statements in committed code.',
          'Debugging Jest tests in parallel workers — use `--runInBand` (or `-i`) so breakpoints hit in one process.',
        ),
      ),
      section('interview', 'Interview angle',
        interviewTip('Describe a real session: "I set a conditional breakpoint on the failing input, inspected the async call stack, and used a logpoint to trace values in a hot loop." Knowing logpoints and conditional breakpoints stands out.'),
      ),
      section('practice', 'Practice',
        text('Create a launch config for your API. Set a conditional breakpoint in a route for one specific user id, a logpoint in a loop, and enable pause-on-uncaught-exceptions. Trigger each with curl.'),
      ),
      section('summary', 'Summary',
        bullets(
          'VS Code\'s built-in js-debug speaks the Chrome DevTools Protocol to Node\'s inspector.',
          '`launch` vs `attach` configs in `.vscode/launch.json`.',
          'Conditional breakpoints, hit counts, logpoints, exception breakpoints.',
          'JavaScript Debug Terminal / Auto Attach for zero-config debugging.',
          'Source maps for TypeScript; path mapping for containers.',
        ),
      ),
    ],
    revisionNotes: [
      'F5 continue, F10 over, F11 into, Shift+F11 out.',
      'Conditional breakpoint = expression; logpoint = message with `{expr}`, no pause.',
      '`launch` starts Node; `attach` connects to `--inspect` on 9229.',
      '`skipFiles: ["<node_internals>/**"]`.',
      'Jest: `--runInBand` when debugging.',
    ],
    quiz: [
      {
        kind: 'mcq', difficulty: 'beginner',
        prompt: 'You want to print a variable on every loop iteration without pausing or editing code. Which VS Code feature fits?',
        options: ['Conditional breakpoint', 'Logpoint', 'Step Into', 'Watch expression'],
        answer: 1,
        explanation: 'Logpoints log an interpolated message and continue. Conditional breakpoints pause when the condition is true.',
      },
      {
        kind: 'scenario', difficulty: 'intermediate',
        prompt: 'Breakpoints in your TypeScript files appear hollow ("unbound") and never hit, although the code runs. Most likely fix?',
        options: [
          'Reinstall VS Code',
          'Enable source maps in the build (and make sure the debugger can find the generated files, e.g. `outFiles`)',
          'Use `request: "attach"`',
          'Add more breakpoints',
        ],
        answer: 1,
        explanation: 'The debugger needs source maps to map `.ts` lines to the JS that V8 runs. Without them, breakpoints cannot bind.',
      },
    ],
    interview: [
      {
        category: 'nodejs', kind: 'concept', difficulty: 'beginner', topic: 'Debugging',
        question: 'What is the difference between a conditional breakpoint and a logpoint?',
        shortAnswer: 'A conditional breakpoint pauses execution only when an expression is true; a logpoint never pauses and instead logs a message with interpolated expressions.',
        detailedAnswer: [
          'Conditional: `user.id === 42` — pause only in the case you care about.',
          'Hit count variant: pause after N hits.',
          'Logpoint: `total={total}` written to the Debug Console, execution continues.',
          'Neither requires editing or redeploying code.',
        ],
        followUp: 'When would a logpoint be preferable to adding console.log?',
        trap: 'Thinking logpoints modify the source file.',
      },
      {
        category: 'nodejs', kind: 'scenario', difficulty: 'intermediate', topic: 'Debugging',
        question: 'How would you debug a Node.js service running inside a Docker container from VS Code?',
        shortAnswer: 'Start Node in the container with `--inspect=0.0.0.0:9229`, publish 9229 to localhost only, and use a VS Code `attach` configuration with `localRoot`/`remoteRoot` path mapping.',
        detailedAnswer: [
          'Inside a container, binding to 127.0.0.1 is unreachable from the host, so bind to 0.0.0.0 within the container.',
          'Publish as `-p 127.0.0.1:9229:9229` so only your machine can connect.',
          'Attach config: `port: 9229`, `remoteRoot: "/app"`, `localRoot: "${workspaceFolder}"`.',
          'Use `--inspect-brk` if you must debug startup code.',
          'Never expose the inspector port publicly — it allows arbitrary code execution.',
        ],
        followUp: 'Why is an exposed inspector port a critical security risk?',
        trap: 'Publishing `-p 9229:9229` on a shared or public host.',
      },
    ],
  },

  'node-js-inspector': {
    summary: 'The Node.js inspector exposes the V8 debugger over the Chrome DevTools Protocol: start it with `--inspect` (or `--inspect-brk` to pause on the first line), connect with chrome://inspect or an IDE, and use `debugger` statements, CPU profiles and heap snapshots.',
    topics: ['--inspect', '--inspect-brk', '--inspect-wait', 'chrome://inspect', 'debugger statement', 'Chrome DevTools Protocol', 'node inspect', 'CPU profile', 'heap snapshot', 'SIGUSR1'],
    sections: [
      section('introduction', undefined,
        text('Every Node binary contains a full debugger and profiler. A single flag exposes it, and Chrome DevTools (or VS Code) becomes your UI.'),
      ),
      section('definition', 'Flags and tools',
        table('Inspector flags', ['Flag / tool', 'Behaviour'], [
          ['`node --inspect app.js`', 'Start the inspector on `127.0.0.1:9229`; program runs immediately'],
          ['`node --inspect-brk app.js`', 'Start the inspector and **pause before the first line** — for debugging startup'],
          ['`node --inspect-wait app.js`', 'Wait for a debugger to attach, then run without pausing (Node 22.2+)'],
          ['`--inspect=0.0.0.0:9230`', 'Custom host/port — dangerous outside a container'],
          ['`debugger;`', 'Statement that pauses like a breakpoint **only when a debugger is attached**'],
          ['`node inspect app.js`', 'Built-in terminal debugger (`n`, `s`, `c`, `repl`)'],
          ['`kill -USR1 <pid>`', 'Activate the inspector in an already running process (Linux/macOS)'],
          ['`--cpu-prof`, `--heap-prof`, `--heapsnapshot-signal=SIGUSR2`', 'Write profiles/snapshots to disk for DevTools'],
        ]),
      ),
      section('why', 'Why learn the raw inspector',
        bullets(
          'Works everywhere — any machine with Node and Chrome, no IDE needed.',
          'DevTools **Memory** and **Performance** tabs find leaks and hot functions.',
          'Understanding the protocol explains how every Node debugger works.',
        ),
      ),
      section('internals', 'How the inspector works',
        steps(
          '`--inspect` starts an inspector agent thread inside the Node process.',
          'It opens a WebSocket server and prints `ws://127.0.0.1:9229/<uuid>`; `http://127.0.0.1:9229/json/list` lists targets.',
          'Clients speak the Chrome DevTools Protocol: `Debugger.setBreakpointByUrl`, `Runtime.evaluate`, `Profiler.start`, `HeapProfiler.takeHeapSnapshot`…',
          'When V8 hits a breakpoint or `debugger;`, it pauses the JS thread; the inspector thread keeps talking to the client.',
          'The random UUID in the URL is only weak protection — anyone who can reach the port can execute code in your process.',
        ),
        flow([
          'node --inspect',
          'ws://127.0.0.1:9229/<uuid>',
          'chrome://inspect discovers target',
          'DevTools sends CDP commands',
          'V8 pauses / profiles',
        ], { title: 'Inspector connection', direction: 'horizontal' }),
      ),
      section('example', 'Using the inspector',
        code({
          title: 'Pause on startup with --inspect-brk',
          code: dedent(`
            // app.js
            const config = loadConfig();   // bug happens here at startup
            debugger;                      // pauses here only if a debugger is attached
            startServer(config);
          `),
          expectedOutput: dedent(`
            $ node --inspect-brk app.js
            Debugger listening on ws://127.0.0.1:9229/5c1f0a4e-8d0b-4c51-9e5e-6a3b1d2f7c90
            For help, see: https://nodejs.org/en/docs/inspector

            # In Chrome: open chrome://inspect → "Remote Target" → inspect
            Debugger attached.
            (paused at app.js:2 — before any user code ran)
          `),
          explanation: [
            'Without `-brk`, startup code would finish before you could attach.',
            'Press Resume in DevTools; it then stops at `debugger;`.',
            'Without a debugger attached, `debugger;` is a no-op — but still never commit it.',
          ],
        }),
        code({
          title: 'Profiling and heap snapshots',
          language: 'bash',
          code: dedent(`
            # CPU profile of a whole run → open the .cpuprofile in DevTools (Performance tab)
            node --cpu-prof --cpu-prof-dir=./profiles app.js

            # Heap snapshot on demand from a running process
            node --heapsnapshot-signal=SIGUSR2 app.js &
            kill -USR2 $!          # writes Heap.<date>.<pid>.heapsnapshot

            # Built-in CLI debugger
            node inspect app.js
            debug> n               # next line
            debug> repl            # evaluate expressions
          `),
          expectedOutput: '$ ls profiles\nCPU.20261108.101512.4242.0.001.cpuprofile\n$ ls *.heapsnapshot\nHeap.20261108.101530.4242.0.002.heapsnapshot',
          explanation: [
            'CPU profiles show which functions consume time (flame chart).',
            'Compare two heap snapshots taken minutes apart to find objects that keep growing (leaks).',
            'Taking a heap snapshot pauses the process and can need as much memory as the heap — careful in production.',
          ],
        }),
        code({
          title: 'Programmatic inspector (node:inspector)',
          code: dedent(`
            import inspector from 'node:inspector';

            // Open the inspector only when an admin explicitly asks — and only on localhost
            process.on('SIGUSR2', () => {
              if (!inspector.url()) inspector.open(9229, '127.0.0.1');
              console.log('inspector at', inspector.url());
            });
          `),
          expectedOutput: '$ kill -USR2 4242\ninspector at ws://127.0.0.1:9229/1f2e3d4c-...',
          explanation: [
            '`inspector.open()` enables debugging at runtime; `inspector.close()` disables it.',
            '`inspector.Session` lets code send CDP commands to itself (e.g. collect a CPU profile).',
            'Node already reserves `SIGUSR1` for activating the inspector on POSIX systems.',
          ],
        }),
      ),
      section('real-world', 'Production considerations',
        bullets(
          'Never run production with `--inspect=0.0.0.0` on a reachable interface — it is remote code execution.',
          'To debug a live server: SSH in, enable the inspector on localhost (SIGUSR1), and **SSH-tunnel** the port: `ssh -L 9229:127.0.0.1:9229 host`.',
          'Pausing at a breakpoint freezes the event loop — all requests on that instance stall. Prefer logpoints, profiles or a canary instance.',
          'For memory leaks in containers, write heap snapshots to a mounted volume and analyse locally.',
        ),
        warn('An attached debugger can run arbitrary code (`Runtime.evaluate`) with the process\'s privileges. Treat port 9229 like an SSH port.'),
      ),
      section('mistakes', 'Common mistakes',
        bullets(
          'Using `--inspect` and wondering why startup breakpoints never hit — use `--inspect-brk` or `--inspect-wait`.',
          'Port 9229 already in use by another debugged process — pass `--inspect=9230`.',
          'Leaving `debugger;` in code — harmless until someone attaches in production and everything freezes.',
          'Pausing a production instance at a breakpoint behind a load balancer (health checks fail, traffic stalls).',
        ),
        note('`chrome://inspect` → "Open dedicated DevTools for Node" auto-reconnects when your process restarts (e.g. with `node --watch --inspect`).'),
      ),
      section('interview', 'Interview angle',
        interviewTip('Know `--inspect` vs `--inspect-brk`, the default `127.0.0.1:9229`, that `debugger;` only pauses with a client attached, and why exposing the inspector is a security hole.'),
      ),
      section('practice', 'Practice',
        text('Start a small Express app with `node --inspect`, attach from chrome://inspect, set a breakpoint in a route, and take two heap snapshots 1000 requests apart. Use the "Comparison" view to see which objects grew.'),
      ),
      section('summary', 'Summary',
        bullets(
          '`--inspect` (run) / `--inspect-brk` (pause first line) / `--inspect-wait` (wait, no pause).',
          'Default `127.0.0.1:9229`; Chrome DevTools Protocol over WebSocket.',
          'chrome://inspect or VS Code as the client; `node inspect` for CLI.',
          'CPU profiles and heap snapshots for performance and leaks.',
          'Exposed inspector = remote code execution; tunnel over SSH.',
        ),
      ),
    ],
    revisionNotes: [
      '`--inspect` default host 127.0.0.1, port 9229.',
      '`--inspect-brk` pauses before user code.',
      '`debugger;` is a no-op without a client.',
      'SIGUSR1 enables the inspector in a running process (POSIX).',
      '`--cpu-prof`, `--heapsnapshot-signal` for profiling.',
      'Breakpoints freeze the whole event loop.',
    ],
    quiz: [
      {
        kind: 'mcq', difficulty: 'beginner',
        prompt: 'What does `node --inspect-brk app.js` do differently from `--inspect`?',
        options: [
          'Uses a different protocol',
          'Pauses execution before the first line of user code until a debugger resumes it',
          'Disables breakpoints',
          'Binds to 0.0.0.0',
        ],
        answer: 1,
        explanation: '`-brk` breaks at start, so you can debug startup logic. `--inspect` lets code run immediately.',
      },
      {
        kind: 'scenario', difficulty: 'advanced',
        prompt: 'You need to inspect a memory leak on a production VM. Which approach is safest?',
        options: [
          'Restart with --inspect=0.0.0.0:9229 and connect over the internet',
          'Enable the inspector on 127.0.0.1 (e.g. SIGUSR1 or heapsnapshot signal), tunnel via SSH or write a snapshot to disk, and ideally take the instance out of the load balancer first',
          'Add console.log everywhere and redeploy',
          'Set a breakpoint in the request handler on the live instance',
        ],
        answer: 1,
        explanation: 'Keep the inspector on localhost, reach it via an SSH tunnel, and avoid pausing a serving instance. Public inspector ports allow remote code execution.',
      },
      {
        kind: 'predict-output', difficulty: 'intermediate',
        prompt: 'Run with plain `node app.js` (no inspector). What happens?',
        code: "console.log('a');\ndebugger;\nconsole.log('b');",
        options: ['Prints a, then hangs forever', 'Prints a and b', 'Throws SyntaxError', 'Prints only b'],
        answer: 1,
        explanation: 'Without an attached debugger, the `debugger` statement does nothing, so both lines print.',
      },
    ],
    interview: [
      {
        category: 'advanced', kind: 'concept', difficulty: 'advanced', topic: 'Inspector',
        question: 'Why is exposing the Node.js inspector port a critical security risk, and how do you debug remote processes safely?',
        shortAnswer: 'Any client connected to the inspector can evaluate arbitrary JavaScript in the process, so an exposed port is remote code execution; keep it bound to localhost and reach it through an SSH tunnel or container port bound to 127.0.0.1.',
        detailedAnswer: [
          'CDP `Runtime.evaluate` runs code with the process\'s permissions (files, env secrets, network).',
          'The UUID in the WebSocket URL is discoverable via `/json/list` on the same port.',
          'Default binding is 127.0.0.1 — changing it to 0.0.0.0 is the mistake.',
          'Safe path: `ssh -L 9229:127.0.0.1:9229`, or `kubectl port-forward` for pods.',
          'Prefer non-pausing tools (profiles, heap snapshots, logs) on production traffic.',
        ],
        followUp: 'How can you enable the inspector on a process that was started without --inspect?',
        trap: 'Believing the random UUID in the URL protects the port.',
      },
      {
        category: 'nodejs', kind: 'concept', difficulty: 'intermediate', topic: 'Inspector',
        question: 'How would you find which function is making a Node.js API slow using built-in tooling?',
        shortAnswer: 'Capture a CPU profile — with `--cpu-prof` or the DevTools Performance/Profiler tab via `--inspect` — while reproducing the load, then read the flame chart for the functions with the most self time.',
        detailedAnswer: [
          'Reproduce with a load tool (autocannon, k6) against a local or staging instance.',
          'Start with `node --cpu-prof` or attach DevTools and record.',
          'Flame chart width = time; look for wide frames with high self time (e.g. sync JSON, regex, crypto).',
          'Look for event-loop blocking work that should be async, cached or moved to a worker thread.',
          'Verify the fix by profiling again and comparing latency percentiles.',
        ],
        followUp: 'What is the difference between self time and total time in a profile?',
        trap: 'Guessing with console.time everywhere instead of profiling.',
      },
    ],
  },
};

export default content;
