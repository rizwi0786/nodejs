import type { ModuleContent } from '../../../types';
import { bullets, code, dedent, diagram, flow, interviewTip, section, steps, table, text } from '../helpers';

const content: Partial<ModuleContent> = {
  'installing-node-js': {
    summary: 'Install Node with a version manager (nvm, fnm, Volta) so you can switch versions per project, and pin the version with .nvmrc / engines.',
    topics: ['nvm', 'fnm', 'Volta', 'nvm-windows', '.nvmrc', 'engines', 'LTS', 'corepack'],
    sections: [
      section('introduction', undefined,
        text("Different projects need different Node versions. A version manager lets you install several side by side and switch in one command."),
      ),
      section('definition', 'Installation options',
        table('Ways to install', ['Method', 'Good for', 'Notes'], [
          ['Official installer (nodejs.org)', 'Quick single-version setup', 'Hard to switch versions'],
          ['nvm (macOS/Linux)', 'Most popular manager', 'Shell script, per-shell switching'],
          ['nvm-windows', 'Windows', 'Separate project with similar commands'],
          ['fnm', 'All platforms, very fast (Rust)', 'Auto-switches on `cd` with `--use-on-cd`'],
          ['Volta', 'Teams, pinning toolchains in package.json', 'Pins node and npm per project'],
          ['Docker image (`node:22-alpine`)', 'Production/CI', 'Version fixed in the Dockerfile'],
        ]),
      ),
      section('why', 'Why use a version manager',
        bullets(
          "Switch between LTS lines for different projects.",
          "No `sudo` needed for global packages (installs live in your home directory).",
          "Reproduce a bug on the exact Node version CI uses.",
        ),
      ),
      section('internals', 'How a version manager works',
        flow(['Download: prebuilt binary into ~/.nvm/versions', 'Switch: put that version first on PATH', 'Run: `node` resolves to the selected binary'], { title: 'nvm / fnm', direction: 'horizontal' }),
      ),
      section('example', 'Install and pin a version',
        code({
          title: 'nvm workflow',
          language: 'bash',
          code: dedent(`
            nvm install --lts        # install latest LTS
            nvm install 20           # install latest 20.x
            nvm use 20
            node --version
            echo "22" > .nvmrc       # pin project version
            nvm use                  # reads .nvmrc
          `),
          expectedOutput: 'Now using node v20.18.0 (npm v10.8.2)\nv20.18.0\nFound \'/app/.nvmrc\' with version <22>\nNow using node v22.11.0 (npm v10.9.0)',
          explanation: [
            "`--lts` picks the newest LTS line.",
            "`.nvmrc` stores the project's expected version; `nvm use` (or fnm's auto-switch) reads it.",
            "Exact patch numbers you see will differ.",
          ],
        }),
        code({
          title: 'Declare supported versions in package.json',
          language: 'json',
          code: dedent(`
            {
              "name": "my-api",
              "engines": { "node": ">=20.11 <23" }
            }
          `),
          explanation: [
            "`engines` documents the supported range; npm warns (or errors with `engine-strict=true`) on mismatch.",
            "Hosting platforms often read it to choose a runtime.",
          ],
        }),
      ),
      section('real-world', 'Team setup',
        bullets(
          "Commit `.nvmrc` (or `.node-version`) and `engines`.",
          "Use the same major in Docker (`FROM node:22-alpine`) and CI (`actions/setup-node` with `node-version-file: .nvmrc`).",
          "`corepack enable` gives you the pnpm/yarn version pinned in `packageManager`.",
        ),
      ),
      section('mistakes', 'Common mistakes',
        bullets(
          "Using `sudo npm install -g` with a system Node — causes permission problems.",
          "Mixing an official installer and nvm, so `which node` points somewhere unexpected.",
          "Developing on Node 22 while production runs 18.",
        ),
      ),
      section('interview', 'Interview angle',
        interviewTip("Mention version managers plus pinning (`.nvmrc`, `engines`, Docker tag) — interviewers want to hear about reproducibility."),
      ),
      section('practice', 'Practice',
        text("Install fnm or nvm, install two LTS lines, add an `.nvmrc` to a project and confirm `node --version` switches when you enter the folder."),
      ),
      section('summary', 'Summary',
        bullets(
          "Use nvm / fnm / Volta, not only the system installer.",
          "Pin with `.nvmrc` and `engines`; match Docker and CI.",
          "Production = LTS.",
        ),
      ),
    ],
    revisionNotes: [
      "nvm install --lts / nvm use.",
      ".nvmrc pins the version; engines declares supported range.",
      "fnm is a fast cross-platform alternative.",
      "npm ships with Node; check with npm -v.",
    ],
    quiz: [
      {
        kind: 'mcq', difficulty: 'beginner',
        prompt: 'Which file does `nvm use` read when you run it without arguments?',
        options: ['package-lock.json', '.npmrc', '.nvmrc', '.env'],
        answer: 2,
        explanation: "`.nvmrc` holds the expected Node version. `.npmrc` is npm configuration — easy to confuse.",
      },
      {
        kind: 'mcq', difficulty: 'beginner',
        prompt: 'What does the `engines.node` field in package.json do by default?',
        options: ['Installs the listed Node version automatically', 'Makes npm warn when the running Node does not match', 'Prevents the app from starting', 'Downloads the matching V8'],
        answer: 1,
        explanation: "npm only warns by default; set `engine-strict=true` in .npmrc to make it an install error. It never installs Node itself.",
      },
    ],
    interview: [
      {
        category: 'nodejs', kind: 'concept', difficulty: 'beginner', topic: 'Installation',
        question: 'Why use a version manager like nvm or fnm instead of a system installer?',
        shortAnswer: 'It lets you install multiple Node versions side by side and switch per project, without sudo, so each project runs the version it was built and tested with.',
        detailedAnswer: [
          "Projects often target different LTS lines.",
          "Versions live in your home directory, so global installs need no root.",
          "`.nvmrc` makes switching automatic and reproducible.",
        ],
        followUp: 'How do you make CI and Docker use the same version?',
      },
      {
        category: 'nodejs', kind: 'concept', difficulty: 'beginner', topic: 'Installation',
        question: 'How can you pin the Node.js version a project expects?',
        shortAnswer: 'Commit an .nvmrc or .node-version file, declare an engines.node range in package.json, and use the same major in your Docker base image and CI setup.',
        detailedAnswer: [
          "`.nvmrc` is read by nvm/fnm (and setup-node via `node-version-file`).",
          "`engines` warns on mismatch; `engine-strict=true` turns it into an error.",
          "Volta can pin node/npm inside package.json.",
          "Docker `FROM node:22-alpine` fixes production.",
        ],
        trap: "Assuming `engines` installs or enforces the version by itself.",
      },
    ],
  },

  'node-js-runtime': {
    summary: 'The Node runtime is everything around the JS engine: globals (process, Buffer), core modules, the module loader, the event loop and the bootstrap that runs your file.',
    topics: ['runtime', 'engine vs runtime', 'process', 'globals', 'bootstrap', 'module wrapper', 'process.argv', 'process.env'],
    sections: [
      section('introduction', undefined,
        text("V8 alone can only evaluate JavaScript — it cannot read a file or open a socket. The **runtime** wraps V8 with APIs and an event loop so programs can do real work."),
      ),
      section('definition', 'Engine vs runtime',
        table('Engine vs runtime', ['', 'Engine (V8)', 'Runtime (Node.js)'], [
          ['Executes JS', 'Yes', 'Yes (via V8)'],
          ['Provides `setTimeout`, `fs`, `http`', 'No', 'Yes'],
          ['Event loop', 'No (only a microtask queue)', 'Yes (libuv)'],
          ['Module loading from disk', 'No', 'Yes (CJS + ESM loaders)'],
          ['Examples', 'V8, SpiderMonkey, JavaScriptCore', 'Node, Deno, Bun, browsers'],
        ]),
      ),
      section('why', 'Why it matters',
        bullets(
          "Explains why `setTimeout` is not part of the language spec — the host provides it.",
          "Explains why Node and browsers differ despite the same engine.",
        ),
      ),
      section('internals', 'What happens when you run `node app.js`',
        steps(
          "The `node` binary starts, initialises V8, libuv and OpenSSL.",
          "Node runs its internal JavaScript bootstrap, setting up `process`, `globalThis`, timers and the module loaders.",
          "Your entry file is loaded: CommonJS files are wrapped in `(function (exports, require, module, __filename, __dirname) { … })`.",
          "Top-level code runs synchronously to completion.",
          "nextTick and promise microtasks are drained.",
          "The event loop runs while there are pending handles/requests (timers, sockets, file ops).",
          "When nothing is left, the `beforeExit` and `exit` events fire and the process ends.",
        ),
        diagram('node-architecture', 'The runtime layers around V8.'),
      ),
      section('example', 'Key runtime globals',
        code({
          title: 'process and friends',
          code: dedent(`
            // run: NODE_ENV=production node info.js --port=8080
            console.log(process.argv.slice(2));
            console.log(process.env.NODE_ENV);
            console.log(typeof __dirname, typeof require);
            console.log(process.pid > 0);
            process.on('exit', (code) => console.log('exiting with', code));
          `),
          expectedOutput: "[ '--port=8080' ]\nproduction\nstring function\ntrue\nexiting with 0",
          explanation: [
            "`process.argv` = [node path, script path, ...user args]; slicing from 2 gives your args.",
            "`process.env` exposes environment variables (always strings).",
            "`__dirname` and `require` come from the CommonJS module wrapper — not true globals, and absent in ES modules.",
            "The `exit` event fires when the event loop has nothing left to do.",
          ],
        }),
      ),
      section('real-world', 'Real-world usage',
        bullets(
          "Config from `process.env` (12-factor apps); `node --env-file=.env` loads a .env file (Node 20.6+).",
          "Graceful shutdown with `process.on('SIGTERM', …)` in containers.",
          "`process.exitCode = 1` to fail a CLI without cutting off pending output.",
        ),
      ),
      section('mistakes', 'Common mistakes',
        bullets(
          "Using `__dirname` in an ES module — use `import.meta.dirname` (Node 20.11+) or `fileURLToPath(import.meta.url)`.",
          "Calling `process.exit()` while writes are pending — output can be lost.",
          "Treating `process.env.PORT` as a number without converting.",
        ),
      ),
      section('interview', 'Interview angle',
        interviewTip("A crisp 'engine vs runtime' distinction is a favourite opener. Mention that timers and the event loop come from the runtime, not V8."),
      ),
      section('practice', 'Practice',
        text("Write `args.js` that prints each CLI argument and the value of `process.env.HOME` (or `USERPROFILE` on Windows). Run it with a few arguments."),
      ),
      section('summary', 'Summary',
        bullets(
          "Runtime = engine + host APIs + event loop + module loader.",
          "`process`, `Buffer`, timers are runtime globals.",
          "`require`, `__dirname` come from the CJS wrapper.",
          "Process exits when the event loop has no more work.",
        ),
      ),
    ],
    revisionNotes: [
      "V8 = engine; Node = runtime.",
      "CJS wrapper provides exports, require, module, __filename, __dirname.",
      "process.argv[0] = node, [1] = script.",
      "Process exits when no pending handles/requests remain.",
    ],
    quiz: [
      {
        kind: 'predict-output', difficulty: 'beginner',
        prompt: 'Running `node app.js hello world`, what does this print?',
        code: "console.log(process.argv.length, process.argv[2]);",
        options: ["4 hello","2 hello","3 world","4 world"],
        answer: 0,
        explanation: "argv = [node binary, app.js path, 'hello', 'world'] → length 4, index 2 is 'hello'.",
      },
      {
        kind: 'mcq', difficulty: 'intermediate',
        prompt: 'Which of these is provided by V8 itself rather than by the Node runtime?',
        options: ["setTimeout","require","process","Promise"],
        answer: 3,
        explanation: "`Promise` is part of ECMAScript and implemented by V8. Timers, `process` and `require` are host (Node) features.",
      },
    ],
    interview: [
      {
        category: 'nodejs', kind: 'concept', difficulty: 'intermediate', topic: 'Runtime',
        question: 'What is the difference between a JavaScript engine and a JavaScript runtime?',
        shortAnswer: 'An engine (like V8) parses, compiles and executes JavaScript and manages memory. A runtime (like Node) embeds an engine and adds host APIs, an event loop and module loading so programs can interact with the outside world.',
        detailedAnswer: [
          "V8 implements ECMAScript: syntax, Promise, Array, GC.",
          "V8 has no timers, file I/O, network or event loop.",
          "Node adds `fs`, `http`, `process`, timers and libuv's event loop.",
          "Browsers are also runtimes around engines (V8, SpiderMonkey, JavaScriptCore).",
        ],
        followUp: 'Where does setTimeout come from in Node?',
        trap: "Saying setTimeout is part of JavaScript — it is defined by the host (HTML spec in browsers, Node's timers module).",
      },
      {
        category: 'nodejs', kind: 'concept', difficulty: 'beginner', topic: 'Runtime',
        question: 'What does process.argv contain?',
        shortAnswer: 'An array of the command-line arguments: the absolute path of the node executable, the path of the script, then any arguments the user passed.',
        detailedAnswer: [
          "`process.argv.slice(2)` gives just the user arguments.",
          "All entries are strings — parse numbers yourself.",
          "Node flags like `--inspect` go to `process.execArgv`, not argv.",
          "`util.parseArgs` (Node 18.3+) parses flags without a library.",
        ],
        trap: "Expecting the first user argument at index 0 or 1.",
      },
    ],
  },

  'running-javascript-files': {
    summary: 'Run code with `node file.js`; Node picks CommonJS or ESM from the extension and package.json "type"; useful flags include --watch, --env-file, -e/-p and --inspect.',
    topics: ['node file.js', '.mjs', '.cjs', 'type module', '--watch', '--env-file', 'node -e', 'node -p', 'shebang', '--inspect'],
    sections: [
      section('introduction', undefined,
        text("Running a file is one command, but the extension, the nearest package.json and a few flags change how Node treats it."),
      ),
      section('definition', 'Module format rules',
        table('How Node decides the module system', ['File', 'Treated as'], [
          ['`.mjs`', 'ES module, always'],
          ['`.cjs`', 'CommonJS, always'],
          ['`.js` with nearest package.json `"type": "module"`', 'ES module'],
          ['`.js` with `"type": "commonjs"` or no type field', 'CommonJS (Node 22+ can detect ESM syntax automatically)'],
        ]),
      ),
      section('why', 'Why the rules exist',
        text("CommonJS was Node's original module system; ES modules arrived later. Node needs an unambiguous signal per file, so it uses extensions and the `type` field."),
      ),
      section('internals', 'Useful flags',
        table('node CLI flags', ['Command', 'What it does', 'Since'], [
          ['`node app.js`', 'Run a file', '—'],
          ['`node --watch app.js`', 'Restart on file changes (replaces nodemon for simple cases)', 'Stable in Node 22'],
          ['`node --env-file=.env app.js`', 'Load env vars from a file', 'Node 20.6+'],
          ['`node -e "code"`', 'Evaluate a string', '—'],
          ['`node -p "expr"`', 'Evaluate and print the result', '—'],
          ['`node --inspect app.js`', 'Enable the Chrome DevTools debugger', '—'],
          ['`node --test`', 'Run the built-in test runner', 'Stable in Node 20'],
          ['`node --run build`', 'Run a package.json script without npm overhead', 'Node 22'],
        ]),
      ),
      section('example', 'Running and printing',
        code({
          title: 'Quick one-liners',
          language: 'bash',
          code: dedent(`
            node -p "1 + 2"
            node -e "console.log(require('node:os').platform())"
            node -p "process.versions.v8"
          `),
          expectedOutput: '3\nlinux\n12.4.254.21-node.21',
          explanation: [
            "`-p` prints the value of the expression.",
            "`-e` only evaluates; output comes from `console.log`.",
            "Your platform and V8 version will differ.",
          ],
        }),
        code({
          title: 'Executable script with a shebang',
          code: dedent(`
            #!/usr/bin/env node
            // greet.mjs  →  chmod +x greet.mjs && ./greet.mjs Ada
            const name = process.argv[2] ?? 'world';
            console.log('Hello, ' + name + '!');
          `),
          expectedOutput: 'Hello, Ada!',
          explanation: [
            "The shebang tells Unix shells to run the file with the `node` found on PATH.",
            "`.mjs` makes it an ES module regardless of package.json.",
          ],
        }),
      ),
      section('real-world', 'Real-world usage',
        bullets(
          "Dev loop: `node --watch --env-file=.env src/server.js`.",
          "Production: `node dist/server.js` (no watch, env from the platform).",
          "CI scripts and quick data fixes with `node -e`.",
        ),
      ),
      section('mistakes', 'Common mistakes',
        bullets(
          "`SyntaxError: Cannot use import statement outside a module` — add `\"type\": \"module\"` or rename to `.mjs`.",
          "`ReferenceError: require is not defined in ES module scope` — use `import`, or `createRequire`.",
          "Using `--watch` in production.",
        ),
      ),
      section('interview', 'Interview angle',
        interviewTip("Be ready to explain the `.mjs`/`.cjs`/`type` rules — they cause most 'cannot use import' errors."),
      ),
      section('practice', 'Practice',
        text("Create the same two-line module as `a.cjs` (using require) and `b.mjs` (using import). Run both, then try `import` inside a `.cjs` file and read the error."),
      ),
      section('summary', 'Summary',
        bullets(
          "`.mjs` = ESM, `.cjs` = CJS, `.js` follows `type`.",
          "`--watch`, `--env-file`, `-p`, `-e`, `--inspect`, `--test` are everyday flags.",
          "Shebang + chmod makes scripts executable.",
        ),
      ),
    ],
    revisionNotes: [
      ".mjs ESM, .cjs CJS, .js → package.json type.",
      "--watch (stable 22), --env-file (20.6+), --run (22).",
      "-p prints, -e evaluates.",
      "Shebang: #!/usr/bin/env node.",
    ],
    quiz: [
      {
        kind: 'scenario', difficulty: 'beginner',
        prompt: 'Your package.json has `"type": "module"`. Which file is loaded as CommonJS?',
        options: ["server.js","utils.mjs","config.cjs","index.js"],
        answer: 2,
        explanation: "`.cjs` is always CommonJS. With type module, `.js` files are ESM; `.mjs` is always ESM.",
      },
      {
        kind: 'mcq', difficulty: 'beginner',
        prompt: 'Which command prints `6`?',
        options: ['node -e "2 * 3"', 'node -p "2 * 3"', 'node --watch "2 * 3"', 'node --run "2 * 3"'],
        answer: 1,
        explanation: "`-p` evaluates and prints. `-e` evaluates but prints nothing unless you call console.log.",
      },
    ],
    interview: [
      {
        category: 'nodejs', kind: 'concept', difficulty: 'intermediate', topic: 'Module format',
        question: 'How does Node decide whether a .js file is CommonJS or an ES module?',
        shortAnswer: 'It looks at the nearest package.json: "type": "module" makes .js files ESM; otherwise they are CommonJS. .mjs is always ESM and .cjs is always CommonJS.',
        detailedAnswer: [
          "Node walks up from the file to the nearest package.json.",
          "`type` defaults to `commonjs` when absent.",
          "Extensions override `type`.",
          "Newer Node versions can detect ESM syntax in ambiguous `.js` files, but being explicit is better.",
        ],
        followUp: 'Can a CommonJS file load an ES module?',
        trap: "Thinking the presence of `import` statements alone always decides it.",
      },
      {
        category: 'nodejs', kind: 'concept', difficulty: 'beginner', topic: 'CLI flags',
        question: 'What does node --watch do?',
        shortAnswer: 'It runs a script and automatically restarts the process when the entry file or its imported dependencies change, a built-in alternative to nodemon for development.',
        detailedAnswer: [
          "Watches the module graph it loaded.",
          "`--watch-path` adds extra directories.",
          "Stable since Node 22 (experimental from 18.11).",
          "Development only — never in production.",
        ],
      },
    ],
  },

  'repl': {
    summary: 'The REPL (Read-Eval-Print Loop) is an interactive Node shell for quick experiments; key features are `_`, `_error`, top-level await, tab completion and dot commands like .help, .editor, .save and .load.',
    topics: ['REPL', 'Read-Eval-Print Loop', '_', '.help', '.editor', '.save', '.load', '.exit', 'top-level await'],
    sections: [
      section('introduction', undefined,
        text("Type `node` with no arguments and you get an interactive prompt. It is the fastest way to test an API or check how something behaves."),
      ),
      section('definition', 'Read → Eval → Print → Loop',
        flow(['Read: your input line', 'Eval: run it with V8', 'Print: show the result (util.inspect)', 'Loop: wait for the next line'], { title: 'REPL cycle', direction: 'horizontal' }),
      ),
      section('why', 'Why use it',
        bullets(
          "Check API behaviour without creating a file.",
          "Core modules are pre-loaded: type `fs`, `path`, `os` directly.",
          "Top-level `await` works, so you can try async code.",
        ),
      ),
      section('internals', 'Commands and special variables',
        table('REPL commands', ['Command', 'Purpose'], [
          ['`.help`', 'List commands'],
          ['`.editor`', 'Multi-line editor mode; Ctrl+D runs, Ctrl+C cancels'],
          ['`.save file.js`', 'Save the session input to a file'],
          ['`.load file.js`', 'Load and run a file into the session'],
          ['`.break` / `.clear`', 'Abort multi-line input / reset context'],
          ['`.exit` (or Ctrl+D, Ctrl+C twice)', 'Quit'],
          ['`_`', 'Result of the last expression'],
          ['`_error`', 'Last thrown error'],
          ['Tab', 'Autocomplete identifiers and properties'],
        ]),
      ),
      section('example', 'A REPL session',
        code({
          title: 'Interactive session',
          language: 'text',
          code: dedent(`
            $ node
            > 2 + 3
            > _ * 10
            > path.extname('report.pdf')
            > await Promise.resolve('done')
            > .exit
          `),
          expectedOutput: "Welcome to Node.js v22.11.0.\nType \".help\" for more information.\n5\n50\n'.pdf'\n'done'",
          explanation: [
            "`_` holds the previous result (5), so `_ * 10` is 50.",
            "`path` is available without `require` in the REPL only.",
            "Top-level `await` works in the REPL.",
            "Strings are printed with quotes because the REPL uses `util.inspect`.",
          ],
        }),
      ),
      section('real-world', 'Real-world usage',
        bullets(
          "Quick checks: date parsing, regex tests, `crypto.randomUUID()`.",
          "Custom REPLs via `node:repl` to debug a running app's services (with care — never exposed publicly).",
        ),
      ),
      section('mistakes', 'Common mistakes',
        bullets(
          "Assigning to `_` disables its auto-update for the session.",
          "Assuming pre-loaded modules exist in scripts — files must `require`/`import` them.",
        ),
      ),
      section('interview', 'Interview angle',
        interviewTip("Mostly a beginner question: know what REPL stands for, `_`, and a few dot commands."),
      ),
      section('practice', 'Practice',
        text("Start the REPL, use `.editor` to write a function across several lines, call it, then `.save session.js` and inspect the file."),
      ),
      section('summary', 'Summary',
        bullets(
          "`node` with no args starts the REPL.",
          "`_` last result, `_error` last error.",
          "`.help .editor .save .load .exit`.",
          "Core modules pre-loaded; top-level await supported.",
        ),
      ),
    ],
    revisionNotes: [
      "REPL = Read-Eval-Print Loop.",
      "_ = last result; _error = last error.",
      ".editor for multi-line; Ctrl+D to run.",
      ".save / .load to persist sessions.",
    ],
    quiz: [
      {
        kind: 'predict-output', difficulty: 'beginner',
        prompt: 'In the REPL you type these lines. What does the last line print?',
        code: "> 4 * 4\n> _ + 1",
        options: ["17","undefined","'161'","ReferenceError: _ is not defined"],
        answer: 0,
        explanation: "`_` holds the last result (16), so `_ + 1` is 17.",
      },
      {
        kind: 'mcq', difficulty: 'beginner',
        prompt: 'Which REPL command opens a multi-line editing mode?',
        options: [".load",".break",".multi",".editor"],
        answer: 3,
        explanation: "`.editor` opens editor mode; Ctrl+D evaluates the whole block. `.multi` does not exist.",
      },
    ],
    interview: [
      {
        category: 'nodejs', kind: 'concept', difficulty: 'beginner', topic: 'REPL',
        question: 'What is the Node.js REPL and what does the underscore variable hold?',
        shortAnswer: 'The REPL is an interactive Read-Eval-Print Loop started by running node with no arguments; the _ variable holds the result of the last evaluated expression.',
        detailedAnswer: [
          "Reads input, evaluates it, prints via util.inspect, loops.",
          "`_error` holds the last thrown error.",
          "Core modules are pre-loaded; top-level await works.",
        ],
        trap: "Assigning to `_` yourself stops it from tracking results.",
      },
      {
        category: 'nodejs', kind: 'concept', difficulty: 'beginner', topic: 'REPL',
        question: 'How do you write and save multi-line code in the REPL?',
        shortAnswer: 'Use .editor to enter editor mode (Ctrl+D to run), and .save <file> to write the session to disk; .load <file> runs a file into the session.',
        detailedAnswer: [
          "The REPL also continues automatically when a line ends with an open brace.",
          "`.break` aborts a stuck multi-line input.",
          "`.clear` resets the context.",
        ],
      },
    ],
  },
};

export default content;
