import type { ModuleContent } from '../../../types';
import { bullets, code, dedent, diagram, flow, interviewTip, section, steps, table, text, warn } from '../helpers';

const content: Partial<ModuleContent> = {
  // ───────────────────────────────────────────────────────────
  'what-are-core-modules': {
    summary: 'Core modules are the libraries compiled into the Node.js binary (fs, path, http, crypto, stream…) — available without installing anything, best imported with the `node:` prefix.',
    topics: ['core modules', 'built-in modules', 'node: prefix', 'module.builtinModules', 'standard library', 'prefix-only modules'],
    sections: [
      section('introduction', undefined,
        text('Every backend needs to read files, open sockets, hash passwords and spawn processes. Node ships these capabilities as **core modules** — its standard library — so you never `npm install` them.'),
      ),
      section('definition', 'Definition',
        text('A **core module** (also called a built-in module) is a module whose source is compiled into the `node` executable. It is loaded by name, not by path, and it is always available.'),
        bullets(
          'Load with `require(\'node:fs\')` or `import fs from \'node:fs\'`.',
          'The `node:` prefix (Node 14.18+/16+) tells Node "this is a core module" — it skips `node_modules` lookups and the cache key is unambiguous.',
          'Some newer modules exist **only** with the prefix: `node:test`, `node:sqlite`, `node:sea`.',
          '`require(\'node:module\').builtinModules` lists all of them.',
        ),
      ),
      section('why', 'Why core modules exist',
        bullets(
          'V8 only understands JavaScript — it has no files, sockets or processes. Core modules expose those OS capabilities.',
          'They are maintained by the Node project, versioned with Node, and security-patched with each release.',
          'Most npm packages (Express, pg, ws…) are built on top of `net`, `http`, `stream`, `events` and `crypto`.',
        ),
      ),
      section('internals', 'How a core module is wired',
        steps(
          'The JavaScript part lives in Node\'s `lib/` folder (e.g. `lib/fs.js`) and is compiled into the binary (often as a V8 snapshot for fast startup).',
          'It calls C++ **bindings** (`internalBinding(\'fs\')`) that wrap libuv, OpenSSL, zlib, llhttp, etc.',
          'libuv performs the actual I/O — on the OS directly (sockets) or on its thread pool (file system, crypto, zlib, dns.lookup).',
          'Results come back as callbacks/promises queued on the event loop.',
        ),
        diagram('node-architecture', 'Your code → core module JS → C++ bindings → libuv / OpenSSL → operating system.'),
      ),
      section('visual', 'The core modules you will use most',
        table('Core module map', ['Module', 'Purpose', 'Typical backend use'], [
          ['`node:fs` / `node:fs/promises`', 'Files and directories', 'Read config, write uploads, stream logs'],
          ['`node:path`', 'Build and parse file paths', 'Cross-platform paths to assets'],
          ['`node:os`', 'Operating-system info', 'Size worker pools, health endpoints'],
          ['`node:http` / `node:https`', 'HTTP server and client', 'Every web framework sits on these'],
          ['`node:events`', 'EventEmitter', 'Pub/sub inside a process'],
          ['`node:url`', 'WHATWG `URL`, file URLs', 'Parse query strings, `import.meta.url`'],
          ['`node:crypto`', 'Hashing, HMAC, random, ciphers', 'Passwords, tokens, webhook signatures'],
          ['`node:util`', 'promisify, inspect, parseArgs', 'Utility glue, CLIs'],
          ['`node:stream`', 'Readable/Writable/Transform', 'Large files, proxies, CSV processing'],
          ['`node:buffer`', 'Binary data', 'Protocols, file bytes, base64'],
          ['`process` (global)', 'Current process', 'env vars, exit codes, signals'],
          ['`node:child_process`', 'Run other programs', 'ffmpeg, git, scripts'],
          ['`node:worker_threads`', 'JS on other threads', 'CPU-heavy work off the main thread'],
        ]),
      ),
      section('example', 'Loading core modules',
        code({
          title: 'CommonJS and ESM forms',
          code: dedent(`
            // CommonJS (index.cjs)
            const fs = require('node:fs/promises');
            const path = require('node:path');

            // ES module (index.mjs)
            // import { readFile } from 'node:fs/promises';
            // import path from 'node:path';

            const { builtinModules } = require('node:module');
            console.log(builtinModules.includes('fs'));
            console.log(typeof path.join);
          `),
          expectedOutput: 'true\nfunction',
          explanation: [
            '`node:fs/promises` is the promise-based fs API — preferred for new code.',
            '`builtinModules` is an array of core module names (without the `node:` prefix for most entries).',
            'Not runnable in the browser playground — it uses `require`.',
          ],
        }),
        code({
          title: 'Prefix-only modules',
          code: dedent(`
            const test = require('node:test');   // works
            console.log(typeof test);

            require('test');                     // looks in node_modules instead
          `),
          expectedOutput: "function\nError: Cannot find module 'test'",
          explanation: [
            '`node:test` (Node 18+) is only reachable with the prefix, so the name `test` stays free for npm packages.',
            'Without the prefix Node searches `node_modules` and fails if no `test` package is installed (message abbreviated).',
          ],
          versionNote: '`node:test` stable since Node 20.',
        }),
      ),
      section('real-world', 'Real-world usage',
        text('A health-check endpoint built from core modules only — no dependencies:'),
        code({
          title: 'GET /health with http + os + process',
          code: dedent(`
            import http from 'node:http';
            import os from 'node:os';

            http.createServer((req, res) => {
              if (req.url !== '/health') { res.statusCode = 404; return res.end(); }
              res.setHeader('content-type', 'application/json');
              res.end(JSON.stringify({
                status: 'ok',
                uptimeSec: Math.round(process.uptime()),
                rssMb: Math.round(process.memoryUsage().rss / 1e6),
                cpus: os.availableParallelism(),
              }));
            }).listen(3000);
          `),
          expectedOutput: '{"status":"ok","uptimeSec":42,"rssMb":48,"cpus":8}',
          explanation: ['Response of `curl localhost:3000/health` — values vary per machine and uptime.'],
          versionNote: '`os.availableParallelism()` needs Node 18.14+.',
        }),
      ),
      section('mistakes', 'Common mistakes',
        bullets(
          'Running `npm install fs` or `npm install path` — these npm packages are unrelated placeholders; the core modules are already there.',
          'Omitting `node:` and accidentally picking up a same-named package for prefix-only modules such as `test`.',
          'Using callback `fs` APIs in new code when `fs/promises` exists.',
          'Assuming browser globals (`window`, `document`) exist — they are not core modules.',
        ),
      ),
      section('interview', 'Interview tips',
        interviewTip('Say "core modules are compiled into the binary and resolved before `node_modules`". Mentioning the `node:` prefix and prefix-only modules signals you track modern Node.'),
      ),
      section('practice', 'Practice',
        steps(
          'Print `require(\'node:module\').builtinModules.length` on your Node version.',
          'Rewrite a script that uses `require(\'fs\')` to use `node:fs/promises` with `await`.',
        ),
      ),
      section('summary', 'Summary',
        bullets(
          'Core modules ship inside the Node binary — no install.',
          'Prefer the `node:` prefix; some modules require it.',
          'They wrap C++ bindings over libuv, OpenSSL, zlib.',
          'Frameworks like Express are built on `http`, `stream` and `events`.',
        ),
      ),
    ],
    revisionNotes: [
      'Core module = built into node binary; loaded by name.',
      '`node:` prefix: bypasses node_modules, unambiguous; required for node:test, node:sqlite, node:sea.',
      'Core modules always win over a same-named package when required without a path.',
      '`module.builtinModules` lists them.',
      'Stack: JS lib → C++ bindings → libuv/OpenSSL → OS.',
    ],
    quiz: [
      {
        kind: 'mcq', difficulty: 'beginner',
        prompt: 'What does the `node:` prefix in `import fs from \'node:fs\'` do?',
        options: ['Downloads the module from the npm registry', 'Forces Node to load the built-in core module, never a package', 'Enables experimental features of fs', 'Makes the import asynchronous'],
        answer: 1,
        explanation: 'The prefix marks the specifier as a core module so resolution never looks in node_modules. It has nothing to do with npm or async loading.',
      },
      {
        kind: 'scenario', difficulty: 'beginner',
        prompt: 'A teammate added `"fs": "^0.0.1"` to dependencies "so the server can read files". What do you advise?',
        options: ['Keep it — fs must be installed', 'Upgrade it to the latest version', 'Remove it — fs is a core module built into Node', 'Replace it with fs-extra, which is required for reading files'],
        answer: 2,
        explanation: 'fs ships with Node. The npm "fs" package is an empty placeholder; fs-extra is optional convenience, not required.',
      },
      {
        kind: 'mcq', difficulty: 'intermediate',
        prompt: 'Which module can ONLY be loaded with the `node:` prefix?',
        options: ['path', 'events', 'crypto', 'test'],
        answer: 3,
        explanation: '`node:test` was added as prefix-only so the bare name `test` stays available to npm packages. The others work with or without the prefix.',
      },
    ],
    interview: [
      {
        category: 'nodejs', kind: 'concept', difficulty: 'beginner', topic: 'Core modules',
        question: 'What are core modules in Node.js, and why is the node: prefix recommended?',
        shortAnswer: 'Core modules are built-in libraries compiled into the Node binary (fs, http, crypto…). The `node:` prefix makes it explicit and guaranteed that you get the built-in, never a package.',
        detailedAnswer: [
          'They are loaded by name and need no installation.',
          'Implemented in JS (`lib/`) over C++ bindings to libuv, OpenSSL, zlib.',
          'The prefix skips node_modules resolution and makes intent clear to readers and bundlers.',
          'Some modules (`node:test`, `node:sqlite`) exist only with the prefix.',
        ],
        followUp: 'Which core operations use the libuv thread pool?',
        trap: 'Saying core modules are "installed globally with Node via npm" — they are part of the binary.',
      },
      {
        category: 'nodejs', kind: 'concept', difficulty: 'intermediate', topic: 'Core modules',
        question: 'If node_modules contains a package named "http", what does require("http") return?',
        shortAnswer: 'The core `http` module. Core modules are checked first and cannot be shadowed by a package of the same bare name.',
        detailedAnswer: [
          'Resolution order: core module → relative/absolute path → node_modules walk.',
          'To load the npm package you would need a path such as `require(\'./node_modules/http\')`.',
          'Prefix-only modules (`test`) are the exception: bare `test` resolves to node_modules.',
          'ESM follows the same rule for bare core names.',
        ],
        followUp: 'Walk me through the rest of the require() resolution algorithm.',
        trap: 'Assuming the nearest node_modules package wins as it does for normal names.',
      },
    ],
  },

  // ───────────────────────────────────────────────────────────
  'commonjs-modules': {
    summary: 'CommonJS is Node\'s original module system: each file is wrapped in a function, `require()` loads modules synchronously, and `module.exports` is what callers receive.',
    topics: ['CommonJS', 'require', 'module wrapper', '__dirname', '__filename', 'circular dependencies', 'synchronous loading', '.cjs'],
    sections: [
      section('introduction', undefined,
        text('Before JavaScript had `import`, Node needed a way to split code into files without leaking variables. CommonJS (CJS) solved it with `require()` and `module.exports` — and most of npm still ships CJS.'),
      ),
      section('definition', 'Definition',
        bullets(
          'Every file is its own **module** with private scope.',
          '`require(specifier)` loads, executes (once) and returns another module\'s `module.exports`.',
          '`module.exports` (or its alias `exports`) defines the public API.',
          'A `.js` file is CJS unless the nearest `package.json` has `"type": "module"`; `.cjs` is always CJS.',
        ),
      ),
      section('why', 'Why it matters',
        bullets(
          'Huge amounts of production code and npm packages are CommonJS.',
          'Loading is synchronous and dynamic — `require` can appear inside `if` blocks or take computed paths.',
          'Understanding the wrapper explains where `__dirname`, `require` and `module` "come from".',
        ),
      ),
      section('internals', 'The module wrapper and the require() algorithm',
        text('Node never runs your file\'s code directly. It wraps it in a function and calls that function:'),
        code({
          title: 'What Node actually executes',
          language: 'javascript',
          code: dedent(`
            (function (exports, require, module, __filename, __dirname) {
              // ← your file's code goes here
            });
          `),
          explanation: [
            'Top-level `const`/`function` become locals of this function — that is why they do not leak.',
            '`exports`, `require`, `module`, `__filename`, `__dirname` are parameters, not globals.',
            '`this` at the top level equals `module.exports`.',
          ],
        }),
        steps(
          '**Resolve** the specifier to an absolute filename (core → path → node_modules walk, trying `.js`, `.json`, `.node`, then `index.js`/`package.json` `"main"`/`"exports"`).',
          '**Check the cache** (`require.cache[filename]`) — if present, return its `exports` immediately.',
          '**Create** a `Module` object and store it in the cache *before* running it.',
          '**Wrap and run** the code synchronously.',
          '**Return** `module.exports`.',
        ),
        diagram('module-resolution', 'require(): core module → relative path → node_modules walk → cache.'),
      ),
      section('example', 'Examples',
        code({
          title: 'A mini require() — the wrapper in pure JS',
          runnable: true,
          code: dedent(`
            const files = {
              '/app/math.js': "const secret = 42; exports.add = (a, b) => a + b;",
              '/app/main.js': "const math = require('/app/math.js'); console.log(math.add(2, 3)); console.log(typeof secret);",
            };
            const cache = {};
            function myRequire(filename) {
              if (cache[filename]) return cache[filename].exports;
              const module = { exports: {} };
              cache[filename] = module;              // cached BEFORE running
              const wrapper = new Function('exports', 'require', 'module', files[filename]);
              wrapper(module.exports, myRequire, module);
              return module.exports;
            }
            myRequire('/app/main.js');
            console.log(Object.keys(cache).length);
          `),
          expectedOutput: '5\nundefined\n2',
          explanation: [
            '`math.js` runs inside a function, so `secret` is local — `typeof secret` in main.js is `undefined`.',
            '`add` was attached to `exports`, which is `module.exports`, so main.js can call it → `5`.',
            'Both files end up in the cache → `2`. Real Node does the same with `require.cache`.',
          ],
        }),
        code({
          title: 'Circular dependencies return a partially filled exports object',
          code: dedent(`
            // a.js
            console.log('a starting');
            exports.done = false;
            const b = require('./b.js');
            console.log('in a, b.done =', b.done);
            exports.done = true;
            console.log('a done');

            // b.js
            console.log('b starting');
            exports.done = false;
            const a = require('./a.js');   // a.js is mid-execution!
            console.log('in b, a.done =', a.done);
            exports.done = true;
            console.log('b done');

            // main.js
            const a = require('./a.js');
            const b = require('./b.js');
            console.log('main:', a.done, b.done);
          `),
          expectedOutput: 'a starting\nb starting\nin b, a.done = false\nb done\nin a, b.done = true\na done\nmain: true true',
          explanation: [
            'main requires a → a sets `done=false` and requires b.',
            'b requires a. a is already in the cache (unfinished), so b receives a\'s **current** exports: `{ done: false }`.',
            'b finishes, a resumes and sees `b.done === true`.',
            'The second `require(\'./b.js\')` in main hits the cache — b does not run again.',
          ],
        }),
      ),
      section('real-world', 'Real-world usage',
        code({
          title: 'Config module loaded once, shared everywhere',
          code: dedent(`
            // config.js
            const path = require('node:path');
            module.exports = {
              port: Number(process.env.PORT ?? 3000),
              uploadsDir: path.join(__dirname, '..', 'uploads'),
            };

            // server.js
            const config = require('./config');
            console.log(config.port, config.uploadsDir);
          `),
          expectedOutput: '3000 /srv/app/uploads',
          explanation: ['`__dirname` is the folder of config.js, so the path is correct no matter where you start Node from (path varies).'],
        }),
      ),
      section('mistakes', 'Common mistakes',
        bullets(
          'Relying on `process.cwd()` instead of `__dirname` for file paths — breaks when started from another folder.',
          'Destructuring from a module in a cycle: `const { fn } = require(\'./a\')` captures `undefined` if a has not assigned `fn` yet.',
          'Calling `require` in a hot request path with a computed path — it is synchronous and blocks on first load.',
          'Expecting `__dirname` in an ES module — it does not exist there.',
        ),
        warn('Fix cycles by moving shared code into a third module, or by requiring lazily inside the function that needs it.'),
      ),
      section('interview', 'Interview tips',
        interviewTip('Drawing the wrapper function on the whiteboard answers four questions at once: scope isolation, where `__dirname` comes from, why `exports = {}` fails, and why `this === module.exports`.'),
      ),
      section('practice', 'Practice',
        steps(
          'Log `arguments.length` at the top of a CJS file — explain why it prints 5.',
          'Create the a/b cycle above, then refactor it so neither file depends on the other.',
        ),
      ),
      section('summary', 'Summary',
        bullets(
          'Each file is wrapped in `(exports, require, module, __filename, __dirname) => {}`.',
          '`require` is synchronous: resolve → cache check → run → return `module.exports`.',
          'Modules are cached before they run, which is how cycles get partial exports.',
          '`.cjs` is always CommonJS; `.js` depends on package.json `"type"`.',
        ),
      ),
    ],
    revisionNotes: [
      'Wrapper params: exports, require, module, __filename, __dirname.',
      'require is sync and cached by resolved absolute filename.',
      'Module is cached before execution → cycles see partially-filled exports.',
      'Top-level `this === module.exports` in CJS.',
      'Extensions tried: .js, .json, .node; then directory index / package.json main/exports.',
    ],
    quiz: [
      {
        kind: 'predict-output', difficulty: 'intermediate',
        prompt: 'In a CommonJS file, what is printed?',
        code: "console.log(this === module.exports, typeof __dirname);",
        options: ['false string', 'true undefined', 'true string', 'false undefined'],
        answer: 2,
        explanation: 'The wrapper is called with `this` bound to `module.exports`, and `__dirname` is a string parameter. In ESM both would differ (`this` is undefined, no __dirname).',
      },
      {
        kind: 'find-bug', difficulty: 'intermediate',
        prompt: 'user.js and order.js require each other. Why does `getUser` throw "is not a function" in order.js?',
        code: "// order.js\nconst { getUser } = require('./user');\nexports.getOrder = (id) => ({ id, user: getUser(1) });\n\n// user.js\nconst { getOrder } = require('./order');\nexports.getUser = (id) => ({ id });",
        options: ['require cannot load files without the .js extension', 'Destructuring copied `undefined` from user.js\'s partially-filled exports during the cycle', 'exports.getUser must be module.exports.getUser', 'CommonJS does not support arrow functions'],
        answer: 1,
        explanation: 'When order.js runs inside the cycle, user.js has not yet assigned getUser; destructuring captures undefined forever. Extensions are optional and `exports.x =` is valid.',
      },
    ],
    interview: [
      {
        category: 'nodejs', kind: 'concept', difficulty: 'intermediate', topic: 'CommonJS',
        question: 'What is the CommonJS module wrapper function and what does it give each module?',
        shortAnswer: 'Node wraps every CJS file in `function (exports, require, module, __filename, __dirname)` before running it, giving the file private scope and those five locals.',
        detailedAnswer: [
          'Top-level variables become function locals, so they never leak into the global object.',
          '`exports` starts as a reference to `module.exports`.',
          '`__filename`/`__dirname` are computed per file from its resolved path.',
          'The wrapper is called with `this = module.exports`.',
          'Visible via `require(\'node:module\').wrap` (legacy) or by logging `arguments`.',
        ],
        followUp: 'Why does `exports = { a: 1 }` not export anything?',
        trap: 'Claiming `require` and `__dirname` are globals — they are wrapper parameters.',
      },
      {
        category: 'nodejs', kind: 'output', difficulty: 'advanced', topic: 'CommonJS',
        question: 'How does CommonJS handle circular dependencies, and what does the second module see?',
        shortAnswer: 'It does not deadlock: the module currently loading is already cached, so the second module receives its partially-filled `module.exports` as it exists at that moment.',
        detailedAnswer: [
          'Node caches a Module object before executing it.',
          'A require() that hits a module mid-execution returns the incomplete exports — no error, no wait.',
          'Properties assigned later appear on that same object (if you kept the object, not destructured values).',
          'Reassigning `module.exports` after the cycle point means the other side holds the old object.',
          'Fixes: extract shared code, lazy require inside functions, or dependency injection.',
        ],
        code: { id: 'm03-cjs-cycle-iq', language: 'javascript', code: "// a.js\nexports.x = 1;\nrequire('./b');\nexports.y = 2;\n// b.js\nconst a = require('./a');\nconsole.log(a.x, a.y);\nsetTimeout(() => console.log(a.x, a.y));", expectedOutput: '1 undefined\n1 2' },
        followUp: 'How do ES modules behave in the same cycle?',
        trap: 'Saying Node throws a "circular dependency" error or loops forever.',
      },
    ],
  },

  // ───────────────────────────────────────────────────────────
  'es-modules': {
    summary: 'ES Modules (ESM) are JavaScript\'s standard module system: `import`/`export` are statically analyzed, bindings are live, top-level await works, and Node enables them via `.mjs` or `"type": "module"`.',
    topics: ['ES Modules', 'import', 'export', 'live bindings', 'top-level await', 'import.meta.url', 'import.meta.dirname', '"type": "module"', '.mjs', 'static analysis', 'import attributes'],
    sections: [
      section('introduction', undefined,
        text('ES Modules are the module system built into the JavaScript language itself — the same syntax runs in browsers, Deno, Bun and Node. New Node projects should default to ESM.'),
      ),
      section('definition', 'Definition',
        bullets(
          '`export` declares a module\'s public bindings; `import` brings them in.',
          'Imports are **static**: they must be at the top level with string-literal specifiers, so the dependency graph is known before any code runs.',
          'Imported names are **live bindings** — read-only views of the exporter\'s variables, not copies.',
          'ESM code is always in strict mode, and top-level `this` is `undefined`.',
        ),
      ),
      section('why', 'Why ESM',
        bullets(
          'One standard for browser and server code.',
          'Static structure enables tree-shaking, early errors for missing exports, and tooling.',
          'Top-level `await` simplifies startup code (connect DB, then export).',
          'Loading is asynchronous, so it can load from URLs and run in parallel.',
        ),
      ),
      section('internals', 'How Node loads an ES module',
        flow([
          'Parse: read file, find import/export statically',
          'Resolve & fetch: load the whole graph, recursively',
          'Link (instantiate): wire live bindings between modules',
          'Evaluate: run module bodies, dependencies first (may await)',
        ], { title: 'ESM loading phases', direction: 'horizontal' }),
        table('How Node decides the module type', ['File', 'Treated as'], [
          ['`.mjs`', 'Always ESM'],
          ['`.cjs`', 'Always CommonJS'],
          ['`.js` with nearest package.json `"type": "module"`', 'ESM'],
          ['`.js` with `"type": "commonjs"` or no field', 'CommonJS (Node 22.7+/20.19+ also detects ESM syntax in ambiguous files)'],
          ['`--input-type=module` with `-e`/stdin', 'ESM'],
        ]),
        bullets(
          'Relative specifiers need the **full extension**: `import x from \'./x.js\'` (no automatic `.js` / `index.js`).',
          'JSON needs an import attribute: `import data from \'./data.json\' with { type: \'json\' }`.',
          'No `require`, `module`, `exports`, `__filename`, `__dirname` — use `import.meta` instead.',
        ),
      ),
      section('visual', 'ESM replacements for CJS globals',
        table('CJS → ESM', ['CommonJS', 'ES module equivalent'], [
          ['`__filename`', '`import.meta.filename` (Node 20.11+) or `fileURLToPath(import.meta.url)`'],
          ['`__dirname`', '`import.meta.dirname` (Node 20.11+) or `path.dirname(fileURLToPath(import.meta.url))`'],
          ['`require(\'x\')`', '`import x from \'x\'` or `await import(\'x\')`'],
          ['`require.resolve(\'x\')`', '`import.meta.resolve(\'x\')` (returns a URL string)'],
          ['`require(\'./data.json\')`', '`import data from \'./data.json\' with { type: \'json\' }`'],
          ['need `require` anyway', '`createRequire(import.meta.url)` from `node:module`'],
        ]),
      ),
      section('example', 'Examples',
        code({
          title: 'Live bindings',
          code: dedent(`
            // counter.mjs
            export let count = 0;
            export function increment() { count++; }

            // main.mjs
            import { count, increment } from './counter.mjs';
            console.log(count);
            increment();
            console.log(count);
            // count = 10;  // TypeError: Assignment to constant variable.
          `),
          expectedOutput: '0\n1',
          explanation: [
            '`count` in main.mjs is a live view of counter.mjs\'s variable, so it shows `1` after `increment()`.',
            'In CommonJS, `const { count } = require(...)` copies the value and would print `0` twice.',
            'Importers cannot reassign an imported binding — only the exporting module can.',
          ],
        }),
        code({
          title: 'Top-level await and import.meta',
          code: dedent(`
            // config.mjs  (package.json: "type": "module" not needed for .mjs)
            import { readFile } from 'node:fs/promises';
            import path from 'node:path';

            const file = path.join(import.meta.dirname, 'config.json');
            export const config = JSON.parse(await readFile(file, 'utf8'));

            console.log(import.meta.url);
            console.log(Object.keys(config));
          `),
          expectedOutput: "file:///srv/app/config.mjs\n[ 'port', 'db' ]",
          explanation: [
            '`await` at the top level pauses evaluation of this module (and modules importing it) until the file is read.',
            '`import.meta.url` is a `file://` URL, not a path (value varies).',
            '`import.meta.dirname` gives the directory as a plain path.',
          ],
          versionNote: '`import.meta.dirname`/`filename` need Node 20.11+ (21.2+ on the 21 line). Top-level await: Node 14.8+.',
        }),
      ),
      section('real-world', 'Real-world usage',
        code({
          title: 'package.json for an ESM service',
          language: 'json',
          code: dedent(`
            {
              "name": "orders-api",
              "type": "module",
              "engines": { "node": ">=20.11" },
              "scripts": { "start": "node src/server.js", "dev": "node --watch src/server.js" }
            }
          `),
          explanation: [
            'All `.js` files under this package are ESM.',
            'Legacy scripts that must stay CJS can be renamed `.cjs`.',
          ],
        }),
      ),
      section('mistakes', 'Common mistakes',
        bullets(
          'Omitting the extension: `import { db } from \'./db\'` → `ERR_MODULE_NOT_FOUND`. Write `./db.js`.',
          'Using `__dirname` → `ReferenceError: __dirname is not defined in ES module scope`.',
          'Named import from a CJS package whose exports Node cannot statically detect → `SyntaxError: Named export \'x\' not found`. Use a default import and destructure.',
          'Putting `import` inside an `if` — use dynamic `await import()` for conditional loading.',
        ),
        code({
          title: 'Wrong vs right: CJS package named import',
          code: dedent(`
            // ✗ may fail if the CJS module builds exports dynamically
            import { something } from 'legacy-cjs-pkg';

            // ✓ always works
            import legacy from 'legacy-cjs-pkg';
            const { something } = legacy;
          `),
          explanation: ['Importing CJS gives `module.exports` as the default export; named exports are a best-effort static guess (cjs-module-lexer).'],
        }),
      ),
      section('interview', 'Interview tips',
        interviewTip('The two phrases interviewers listen for: "statically analyzed" (graph known before execution) and "live bindings" (not copies). Contrast both with CommonJS.'),
      ),
      section('practice', 'Practice',
        steps(
          'Convert a small CJS project to ESM: add `"type": "module"`, add file extensions, replace `__dirname`.',
          'Create the live-binding counter and compare with the CJS destructuring version.',
        ),
      ),
      section('summary', 'Summary',
        bullets(
          'ESM = standard `import`/`export`, static and async.',
          'Enabled by `.mjs` or `"type": "module"`; `.cjs` stays CommonJS.',
          'Live bindings, strict mode, top-level await.',
          'Use `import.meta.url` / `import.meta.dirname` instead of `__dirname`.',
          'Relative imports need file extensions.',
        ),
      ),
    ],
    revisionNotes: [
      'ESM phases: parse → load graph → link → evaluate.',
      'Imports are hoisted and static; dynamic loading = `import()` (returns a promise).',
      'Live, read-only bindings; CJS gives value copies on destructure.',
      'No __dirname/require in ESM; `import.meta.dirname` (20.11+), `createRequire`.',
      'Type rules: .mjs ESM, .cjs CJS, .js → package.json "type".',
      'JSON import needs `with { type: \'json\' }`.',
    ],
    quiz: [
      {
        kind: 'predict-output', difficulty: 'intermediate',
        prompt: 'counter.mjs exports `let n = 0` and `inc()` which does `n++`. What does main.mjs print?',
        code: "import { n, inc } from './counter.mjs';\ninc(); inc();\nconsole.log(n);",
        options: ['0', '2', 'undefined', 'TypeError'],
        answer: 1,
        explanation: 'ESM imports are live bindings, so `n` reflects the exporter\'s current value (2). Printing 0 would be the CommonJS destructuring behaviour.',
      },
      {
        kind: 'find-bug', difficulty: 'beginner',
        prompt: 'package.json has `"type": "module"`. Why does this fail with ERR_MODULE_NOT_FOUND?',
        code: "import { connect } from './db';\nawait connect();",
        options: ['Top-level await is not allowed', 'ESM requires the full file extension: ./db.js', 'connect must be a default export', 'The node: prefix is missing'],
        answer: 1,
        explanation: 'ESM resolution does not guess extensions or index files. Top-level await is valid in ESM; the node: prefix is only for core modules.',
      },
      {
        kind: 'complete-code', difficulty: 'intermediate',
        prompt: 'Complete the line to get the current directory in an ES module on Node 18.',
        code: "import path from 'node:path';\nimport { fileURLToPath } from 'node:url';\nconst dir = /* ??? */;",
        options: ['__dirname', 'process.cwd()', 'path.dirname(fileURLToPath(import.meta.url))', 'path.dirname(import.meta.url)'],
        answer: 2,
        explanation: '`import.meta.url` is a file:// URL, so convert it first. `__dirname` does not exist in ESM; `process.cwd()` is where Node was launched, not the file\'s folder.',
      },
    ],
    interview: [
      {
        category: 'nodejs', kind: 'concept', difficulty: 'intermediate', topic: 'ES Modules',
        question: 'What are live bindings in ES modules and how do they differ from CommonJS exports?',
        shortAnswer: 'An ESM import is a read-only reference to the exporter\'s variable, so later changes are visible. CommonJS returns an object; destructured values are copies taken at require time.',
        detailedAnswer: [
          'Bindings are wired during the link phase, before code runs.',
          'Reassigning an imported name throws a TypeError in the importer.',
          'Live bindings let ESM handle cycles better: functions declared in a cyclic module are already initialized.',
          'In CJS, reading `mod.value` (not destructured) also sees updates because it reads the shared object.',
        ],
        followUp: 'What happens if you access a `let` export before the exporting module has evaluated it?',
        trap: 'Saying imports are copies "just like require" — or that importers can mutate the binding.',
      },
      {
        category: 'nodejs', kind: 'concept', difficulty: 'intermediate', topic: 'ES Modules',
        question: 'How does Node.js decide whether a .js file is an ES module or CommonJS?',
        shortAnswer: 'It looks at the nearest package.json: `"type": "module"` makes .js files ESM; otherwise they are CommonJS. `.mjs` and `.cjs` override this regardless.',
        detailedAnswer: [
          'Node walks up from the file to the nearest package.json.',
          '`"type": "commonjs"` or no field → CJS.',
          'Node 22.7+ (and 20.19+) can detect ESM syntax in ambiguous .js files, but explicit "type" is recommended.',
          '`--input-type` controls `-e` and stdin code.',
          'Each package in node_modules is judged by its own package.json.',
        ],
        followUp: 'How would you publish a package that supports both require and import?',
        trap: 'Thinking the presence of `import` statements alone has always switched a file to ESM.',
      },
      {
        category: 'nodejs', kind: 'concept', difficulty: 'advanced', topic: 'ES Modules',
        question: 'Why does ES module loading happen in separate parse, link and evaluate phases, and what does that enable?',
        shortAnswer: 'Because imports are static, Node can build and link the entire dependency graph before running anything. That enables early errors, live bindings, async loading and top-level await.',
        detailedAnswer: [
          'Parse: find import/export declarations without executing code.',
          'Load: fetch all dependencies (asynchronously; can be files or URLs via loaders).',
          'Link: create module environment records and connect exports to imports.',
          'Evaluate: run bodies in post-order; a module with top-level await makes its importers wait.',
          'A missing named export is a SyntaxError at link time, before any side effects run.',
        ],
        followUp: 'Why can\'t `require()` load an ESM graph that uses top-level await?',
        trap: 'Describing ESM as "require with different syntax".',
      },
    ],
  },
};

export default content;
