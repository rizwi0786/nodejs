import type { ModuleContent } from '../../../types';
import { bullets, code, dedent, diagram, flow, interviewTip, note, section, steps, table, text, warn } from '../helpers';

const content: Partial<ModuleContent> = {
  // ───────────────────────────────────────────────────────────
  'require-and-import': {
    summary: '`require()` is CommonJS\'s synchronous, dynamic loader; `import` is the static, asynchronous ESM syntax, with `import()` for dynamic loading. Node lets the two systems interoperate with a few rules.',
    topics: ['require', 'import', 'dynamic import()', 'interop', 'require(esm)', 'createRequire', 'ERR_REQUIRE_ESM', 'dual packages', 'exports field'],
    sections: [
      section('introduction', undefined,
        text('Real projects mix both worlds: your app may be ESM while a dependency is CJS, or the reverse. Knowing exactly what each loader can do saves hours of `ERR_REQUIRE_ESM` debugging.'),
      ),
      section('definition', 'Definition',
        bullets(
          '`require(x)` — a **function call** that synchronously resolves, runs and returns `module.exports`.',
          '`import x from \'x\'` — a **declaration**, hoisted and resolved before the module runs.',
          '`import(\'x\')` — an **expression** that returns a promise of the module namespace; works in both CJS and ESM.',
        ),
      ),
      section('why', 'Why the difference matters',
        bullets(
          'Static `import` lets tools tree-shake and catch missing exports early.',
          '`require` allows conditional and computed loading but blocks the thread while loading.',
          'Interop rules decide whether your app can use a given package at all.',
        ),
      ),
      section('visual', 'Comparison',
        table('require vs import', ['', '`require()`', '`import` / `import()`'], [
          ['System', 'CommonJS', 'ES Modules'],
          ['Timing', 'Synchronous, at the call', 'Static: before evaluation; `import()` async'],
          ['Placement', 'Anywhere, any expression', 'Top level only (`import()` anywhere)'],
          ['Result', '`module.exports` object (copies on destructure)', 'Live bindings / namespace object'],
          ['File extension', 'Optional', 'Required for relative paths'],
          ['JSON', '`require(\'./a.json\')`', '`import a from \'./a.json\' with { type: \'json\' }`'],
          ['Top-level await', 'No', 'Yes'],
          ['Cache access', '`require.cache` (deletable)', 'Internal, not exposed'],
          ['`this` at top', '`module.exports`', '`undefined`'],
        ]),
        table('CommonJS vs ES Modules — interop', ['From → To', 'How', 'Notes'], [
          ['ESM → CJS', '`import pkg from \'cjs-pkg\'`', 'Default = `module.exports`; named exports best-effort via static analysis'],
          ['CJS → ESM (async)', '`const m = await import(\'esm-pkg\')`', 'Works in every supported Node version'],
          ['CJS → ESM (sync)', '`require(\'esm-pkg\')`', 'Node 22.0 behind `--experimental-require-module`; on by default in Node 23+ and backported unflagged to 22.12 and 20.19. Fails with `ERR_REQUIRE_ASYNC_MODULE` if the graph uses top-level await'],
          ['ESM needing require', '`createRequire(import.meta.url)`', 'For JSON, native addons, `require.resolve`'],
        ]),
      ),
      section('internals', 'What happens under the hood',
        flow([
          'require(): resolve → cache → read → wrap → run sync',
          'import: parse graph → load async → link → evaluate',
          'import(): returns Promise → same ESM pipeline',
        ], { title: 'Three ways to load', direction: 'vertical' }),
        bullets(
          'When ESM imports CJS, Node runs the CJS module and exposes `module.exports` as the default export.',
          'Named exports from CJS come from **cjs-module-lexer**, which scans for patterns like `exports.foo =` without running code.',
          'Before require(esm) support, `require()` of an ESM file always threw `ERR_REQUIRE_ESM`.',
        ),
      ),
      section('example', 'Examples',
        code({
          title: 'Dynamic import() in CommonJS',
          code: dedent(`
            // report.cjs — needs an ESM-only package
            async function main() {
              const { default: chalk } = await import('chalk');
              console.log(chalk.green('ok'));
            }
            main();
          `),
          expectedOutput: 'ok',
          explanation: [
            '`import()` returns a promise for the **namespace object**; the default export is under `.default`.',
            'chalk 5 is ESM-only — this pattern works in every supported Node version (text is green in a terminal).',
          ],
        }),
        code({
          title: 'Conditional / lazy loading',
          code: dedent(`
            // ESM
            const driver = process.env.DB === 'pg'
              ? await import('./drivers/pg.js')
              : await import('./drivers/sqlite.js');
            console.log(driver.name);
          `),
          expectedOutput: 'sqlite',
          explanation: ['Static `import` cannot be inside a condition; `import()` can. Output depends on the `DB` env var.'],
        }),
        code({
          title: 'createRequire inside ESM',
          code: dedent(`
            import { createRequire } from 'node:module';
            const require = createRequire(import.meta.url);

            const pkg = require('./package.json');
            console.log(pkg.name, require.resolve('express'));
          `),
          expectedOutput: 'orders-api /srv/app/node_modules/express/index.js',
          explanation: ['`createRequire` builds a real CommonJS `require` relative to this file (paths vary).'],
        }),
      ),
      section('real-world', 'Real-world usage: publishing a dual package',
        code({
          title: 'package.json "exports" with conditions',
          language: 'json',
          code: dedent(`
            {
              "name": "@acme/money",
              "exports": {
                ".": {
                  "import": "./dist/index.mjs",
                  "require": "./dist/index.cjs"
                }
              }
            }
          `),
          explanation: [
            '`import` users get the ESM build; `require` users get the CJS build.',
            'Beware the **dual package hazard**: if both builds load in one app, you get two copies of module state.',
          ],
        }),
      ),
      section('mistakes', 'Common mistakes',
        bullets(
          'Forgetting `.default` when dynamically importing a default export.',
          'Mixing `require` and `import` in one `.js` file — a file is one or the other.',
          'Assuming `require(esm)` works on Node 18 — it does not; use `import()`.',
          'Using `import()` with user input as the path — it executes code; never load untrusted specifiers.',
        ),
        code({
          title: 'Wrong vs right',
          code: dedent(`
            // ✗ ESM file
            const express = require('express');   // ReferenceError: require is not defined

            // ✓ ESM file
            import express from 'express';
          `),
          explanation: ['`require` is a wrapper parameter in CJS — it simply does not exist in ESM scope.'],
        }),
      ),
      section('interview', 'Interview tips',
        interviewTip('State versions precisely: "require(esm) shipped flagged in 22.0, unflagged in 23 and backported to 22.12/20.19, and it cannot load graphs with top-level await." Precision here impresses more than hand-waving.'),
      ),
      section('practice', 'Practice',
        steps(
          'In a CJS project, load an ESM-only package with `await import()`.',
          'In an ESM project, use `createRequire` to load a JSON file, then rewrite it with an import attribute.',
        ),
      ),
      section('summary', 'Summary',
        bullets(
          '`require` = sync, dynamic, CJS. `import` = static, async, ESM.',
          '`import()` works everywhere and returns a promise.',
          'ESM can import CJS (default = module.exports).',
          'CJS can load ESM with `import()`; synchronous `require(esm)` only on newer Node.',
        ),
      ),
    ],
    revisionNotes: [
      'import declarations are hoisted; `import()` is an async expression.',
      'ESM importing CJS: default export = module.exports; named exports via cjs-module-lexer.',
      'require(esm): flag in 22.0, default in 23+, backported 22.12 / 20.19; not with top-level await.',
      'createRequire(import.meta.url) gives require inside ESM.',
      'package.json "exports" conditions: import / require / default.',
    ],
    quiz: [
      {
        kind: 'mcq', difficulty: 'beginner',
        prompt: 'Which can be used inside an `if` block to load a module only when needed, in an ES module?',
        options: ['import x from \'./x.js\'', 'export * from \'./x.js\'', 'await import(\'./x.js\')', 'import.meta.require(\'./x.js\')'],
        answer: 2,
        explanation: 'Dynamic `import()` is an expression and can be used anywhere. Static import/export declarations must be at the top level; `import.meta.require` does not exist.',
      },
      {
        kind: 'predict-output', difficulty: 'intermediate',
        prompt: 'greet.mjs has `export default function greet() { return "hi"; }`. What does this CJS code print?',
        code: "import('./greet.mjs').then((m) => {\n  console.log(typeof m, typeof m.default);\n});",
        options: ['function undefined', 'object function', 'object undefined', 'function function'],
        answer: 1,
        explanation: 'import() resolves to the module namespace object; the default export lives on `.default`. Calling `m()` directly would throw.',
      },
      {
        kind: 'scenario', difficulty: 'intermediate',
        prompt: 'Your CommonJS service on Node 18 must use a new ESM-only SDK. What is the correct approach?',
        options: ['Use require() — Node will convert it', 'Load it with `await import(\'sdk\')` inside an async function', 'Delete "type" from the SDK\'s package.json', 'Rename your files to .mjs one by one inside node_modules'],
        answer: 1,
        explanation: 'Dynamic import() is the supported bridge in every version. require(esm) is not available on Node 18, and editing node_modules is fragile and gets overwritten.',
      },
    ],
    interview: [
      {
        category: 'nodejs', kind: 'concept', difficulty: 'beginner', topic: 'Modules',
        question: 'What are the main differences between require and import?',
        shortAnswer: '`require` is CommonJS: a synchronous function callable anywhere, returning module.exports. `import` is ESM: a static declaration resolved before execution, giving live bindings and supporting top-level await.',
        detailedAnswer: [
          'require can take computed paths; static import needs a string literal.',
          'import is hoisted; require runs when reached.',
          'ESM requires file extensions for relative paths.',
          'Dynamic `import()` is the async, anywhere-usable ESM equivalent.',
          'They differ in `this`, available globals (__dirname) and cache access.',
        ],
        followUp: 'How can a CommonJS file load an ES module?',
        trap: 'Saying the difference is "only syntax" or that Babel-style interop is what Node does natively.',
      },
      {
        category: 'nodejs', kind: 'concept', difficulty: 'advanced', topic: 'Modules',
        question: 'Can CommonJS require an ES module, and what are the limitations?',
        shortAnswer: 'Asynchronously, always, via `import()`. Synchronously via `require()` only on newer Node (default in 23+, backported to 22.12 and 20.19), and only if the ESM graph has no top-level await.',
        detailedAnswer: [
          'Older versions throw `ERR_REQUIRE_ESM`.',
          'If the module graph contains top-level await, require throws `ERR_REQUIRE_ASYNC_MODULE`.',
          'require(esm) returns the namespace object; default export is `.default` unless the module exports `"module.exports"` name.',
          'The other direction (ESM importing CJS) has always worked: default = module.exports.',
        ],
        followUp: 'What is the dual package hazard?',
        trap: 'Stating flatly "you can never require ESM" — outdated since Node 22.12/20.19.',
      },
      {
        category: 'nodejs', kind: 'concept', difficulty: 'intermediate', topic: 'Modules',
        question: 'When would you use dynamic import() instead of a static import in a backend?',
        shortAnswer: 'For conditional or lazy loading — optional drivers, plugins, rarely used heavy modules — and to load ESM from CommonJS.',
        detailedAnswer: [
          'Reduces startup time by deferring heavy modules until first use.',
          'Lets configuration choose an implementation at runtime.',
          'Returns a promise for the namespace object; result is cached like any module.',
          'Errors (missing module) become promise rejections you can catch.',
          'Never pass unvalidated user input as the specifier.',
        ],
        followUp: 'Does a second import() of the same module re-execute it?',
        trap: 'Forgetting that the default export is under `.default`.',
      },
    ],
  },

  // ───────────────────────────────────────────────────────────
  'module-exports-and-exports': {
    summary: '`module.exports` is the object `require()` returns; `exports` is just a local variable that initially points to it. Mutate `exports`, but reassign only `module.exports`.',
    topics: ['module.exports', 'exports', 'reference', 'reassignment', 'export default', 'named exports'],
    sections: [
      section('introduction', undefined,
        text('Two names, one object — until you reassign one of them. This is one of the most common CommonJS bugs and a favourite interview question.'),
      ),
      section('definition', 'Definition',
        bullets(
          '`module.exports` — the value returned to whoever calls `require()` for this file.',
          '`exports` — a wrapper parameter initialized as `exports = module.exports` (a shortcut reference).',
          'Adding properties to either changes the same object. Reassigning `exports` breaks the link.',
        ),
      ),
      section('why', 'Why both exist',
        bullets(
          '`exports.x = ...` is a short way to add named exports.',
          '`module.exports = ...` is needed to export a single function, class or value.',
        ),
      ),
      section('internals', 'Reference semantics',
        steps(
          'Node creates `module = { exports: {} }`.',
          'The wrapper receives `exports` = the same object reference.',
          '`exports.a = 1` mutates that shared object → visible to require.',
          '`exports = { a: 1 }` points the local variable to a **new** object → `module.exports` is still `{}`.',
          'At the end, `require` returns `module.exports` — never the `exports` variable.',
        ),
        flow(['module.exports → {}', 'exports → same {}', 'exports = {…}: exports now → new object', 'require returns module.exports (old {})'], { title: 'Breaking the reference', direction: 'horizontal' }),
      ),
      section('visual', 'Comparison',
        table('module.exports vs exports', ['', '`module.exports`', '`exports`'], [
          ['What it is', 'Property of the module object', 'Local alias to `module.exports`'],
          ['Returned by require', 'Yes', 'Only while it still points to module.exports'],
          ['Add property (`.x = `)', 'Works', 'Works'],
          ['Reassign (`= value`)', 'Works — exports that value', 'Silently does nothing for callers'],
          ['Export a function/class', '`module.exports = fn`', 'Not possible'],
        ]),
        table('ESM equivalents', ['CommonJS', 'ES Modules'], [
          ['`exports.add = add`', '`export function add() {}`'],
          ['`module.exports = Server`', '`export default class Server {}`'],
          ['`module.exports = { a, b }`', '`export { a, b }`'],
        ]),
      ),
      section('example', 'Examples',
        code({
          title: 'Simulating the reference (pure JS)',
          runnable: true,
          code: dedent(`
            function load(body) {
              const module = { exports: {} };
              body(module.exports, module);
              return module.exports;
            }
            const a = load((exports) => { exports.hello = 'hi'; });
            const b = load((exports) => { exports = { hello: 'hi' }; });
            const c = load((exports, module) => { module.exports = { hello: 'hi' }; });
            console.log(a.hello, b.hello, c.hello);
          `),
          expectedOutput: 'hi undefined hi',
          explanation: [
            '`a`: mutating the shared object works.',
            '`b`: reassigning the local `exports` variable is invisible to the loader → `undefined`.',
            '`c`: replacing `module.exports` is what the loader returns.',
          ],
        }),
        code({
          title: 'Exporting a class',
          code: dedent(`
            // logger.js
            class Logger {
              info(msg) { console.log('[info]', msg); }
            }
            module.exports = Logger;

            // app.js
            const Logger = require('./logger');
            new Logger().info('started');
          `),
          expectedOutput: '[info] started',
          explanation: ['Single-value exports need `module.exports = ...`.'],
        }),
        code({
          title: 'Mixing both — the trap',
          code: dedent(`
            // utils.js
            exports.slugify = (s) => s.toLowerCase().replace(/\\s+/g, '-');
            module.exports = { capitalize: (s) => s[0].toUpperCase() + s.slice(1) };

            // app.js
            const utils = require('./utils');
            console.log(Object.keys(utils));
          `),
          expectedOutput: "[ 'capitalize' ]",
          explanation: ['`slugify` was added to the original object, which was then replaced — it is lost.'],
        }),
      ),
      section('real-world', 'Real-world usage',
        code({
          title: 'A service module pattern',
          code: dedent(`
            // user-service.js
            const db = require('./db');

            async function findById(id) { return db.query('SELECT * FROM users WHERE id = $1', [id]); }
            async function create(data) { /* ... */ }

            module.exports = { findById, create };   // one explicit public API at the bottom
          `),
          explanation: ['Assigning one object at the end makes the public API obvious and avoids mixing styles.'],
        }),
      ),
      section('mistakes', 'Common mistakes',
        bullets(
          '`exports = function () {}` — exports nothing.',
          'Mixing `exports.x` with a later `module.exports = {}` — earlier properties vanish.',
          'Reassigning `module.exports` asynchronously (inside a callback) — callers already got the old object.',
        ),
        code({
          title: 'Wrong vs right',
          code: dedent(`
            // ✗
            exports = function auth(req, res, next) { next(); };
            // ✓
            module.exports = function auth(req, res, next) { next(); };
          `),
          explanation: ['Only `module.exports` reassignment is seen by `require()`.'],
        }),
      ),
      section('interview', 'Interview tips',
        interviewTip('Answer in one sentence: "`exports` is a reference to `module.exports`; require returns `module.exports`, so reassigning `exports` breaks the reference." Then show the 3-line demo.'),
      ),
      section('practice', 'Practice',
        steps('Write a module that exports a function and also attaches helper properties to it (`module.exports = fn; module.exports.helper = ...`).', 'Predict and verify what `require` returns for each of the three `load` cases above.'),
      ),
      section('summary', 'Summary',
        bullets(
          '`exports === module.exports` initially.',
          'require returns `module.exports`.',
          'Mutate either; reassign only `module.exports`.',
          'Pick one style per file.',
        ),
      ),
    ],
    revisionNotes: [
      'exports = module.exports (same reference) at start.',
      'require() returns module.exports, always.',
      'exports = {...} → silently breaks; module.exports = {...} → works.',
      'Export a function/class → module.exports = X.',
      'Assign exports synchronously; late assignment is missed.',
    ],
    quiz: [
      {
        kind: 'predict-output', difficulty: 'beginner',
        prompt: 'math.js contains the code below. What does `console.log(require(\'./math\'))` print?',
        code: "exports = { add: (a, b) => a + b };",
        options: ['{ add: [Function: add] }', 'undefined', '{}', 'TypeError'],
        answer: 2,
        explanation: 'Reassigning the local `exports` does not change `module.exports`, which is still the empty object returned by require. It is not undefined.',
      },
      {
        kind: 'find-bug', difficulty: 'intermediate',
        prompt: 'Why is `helpers.format` undefined in app.js?',
        code: "// helpers.js\nexports.format = (n) => n.toFixed(2);\nmodule.exports = { parse: Number };\n\n// app.js\nconst helpers = require('./helpers');",
        options: ['toFixed is not allowed in modules', '`module.exports` was replaced after `format` was added to the old object', 'exports must be declared with const', 'Number cannot be exported'],
        answer: 1,
        explanation: 'format was attached to the original object, then module.exports was pointed at a new object. Combine them in one assignment.',
      },
    ],
    interview: [
      {
        category: 'nodejs', kind: 'concept', difficulty: 'beginner', topic: 'CommonJS',
        question: 'What is the difference between module.exports and exports?',
        shortAnswer: '`exports` is a variable that starts as a reference to `module.exports`. `require()` returns `module.exports`, so adding properties to either works, but reassigning `exports` does nothing.',
        detailedAnswer: [
          'Both are provided by the module wrapper.',
          'Mutation goes through the shared reference.',
          'Reassignment rebinds only the local variable.',
          'To export a single value use `module.exports = value`.',
        ],
        followUp: 'What is the ESM equivalent of `module.exports = fn`?',
        trap: 'Saying they are interchangeable in every case.',
      },
      {
        category: 'nodejs', kind: 'output', difficulty: 'intermediate', topic: 'CommonJS',
        question: 'A module sets exports.a = 1, then module.exports = { b: 2 }, then exports.c = 3. What does require return?',
        shortAnswer: '`{ b: 2 }`. `a` and `c` were both added to the original object, which is no longer `module.exports`.',
        detailedAnswer: [
          '`exports.a = 1` → original object `{ a: 1 }`.',
          '`module.exports = { b: 2 }` → module.exports now points elsewhere.',
          '`exports` still points to the original object, so `exports.c = 3` goes there too.',
          'require returns the current `module.exports` → `{ b: 2 }`.',
        ],
        code: { id: 'm03-exports-iq', language: 'javascript', code: "exports.a = 1;\nmodule.exports = { b: 2 };\nexports.c = 3;\n// other file:\nconsole.log(require('./m'));", expectedOutput: '{ b: 2 }' },
        followUp: 'How would you keep `a` and `c`?',
        trap: 'Answering `{ b: 2, c: 3 }` because "exports is module.exports".',
      },
    ],
  },

  // ───────────────────────────────────────────────────────────
  'module-caching': {
    summary: 'Node runs a module once and caches it by its resolved filename; every later `require`/`import` gets the same instance. That makes modules natural singletons — and makes "reloading" tricky.',
    topics: ['require.cache', 'module cache', 'singleton', 'require.resolve', 'cache invalidation', 'ESM cache', 'case sensitivity'],
    sections: [
      section('introduction', undefined,
        text('If ten files `require(\'./db\')`, the database pool is created once, not ten times. That is module caching — and it is why a module behaves like a singleton.'),
      ),
      section('definition', 'Definition',
        bullets(
          'CommonJS cache: `require.cache`, an object keyed by **resolved absolute filename**.',
          'A cached module\'s code never runs again; `require` returns its existing `module.exports`.',
          'ESM has its own internal cache (keyed by URL) that is **not** exposed or deletable.',
          'Core modules are cached internally and are not in `require.cache`.',
        ),
      ),
      section('why', 'Why caching exists',
        bullets(
          'Performance: no re-reading and re-compiling files.',
          'Shared state: one DB pool, one config object, one logger.',
          'Correct cycles: a module in progress must be found in the cache.',
        ),
      ),
      section('internals', 'How the cache is consulted',
        steps(
          '`require(\'./db\')` → `Module._resolveFilename` produces `/srv/app/db.js`.',
          'If `require.cache[\'/srv/app/db.js\']` exists → return its `exports`.',
          'Otherwise create the Module, store it in the cache, run it, return exports.',
          'Different specifiers resolving to the same file (`./db`, `./db.js`, `../app/db`) share one entry.',
        ),
        diagram('module-resolution', 'The cache check happens after resolution and before loading.'),
        warn('Different resolved paths = different instances. Two copies of a package in different `node_modules` folders, or a symlinked path, give you two singletons.'),
      ),
      section('example', 'Examples',
        code({
          title: 'Modules run once',
          code: dedent(`
            // counter.js
            console.log('counter loaded');
            let n = 0;
            module.exports = { next: () => ++n };

            // main.js
            const a = require('./counter');
            const b = require('./counter.js');
            console.log(a === b, a.next(), b.next());
          `),
          expectedOutput: 'counter loaded\ntrue 1 2',
          explanation: [
            '"counter loaded" prints once — the second require hits the cache.',
            '`./counter` and `./counter.js` resolve to the same filename → same object.',
            'The state (`n`) is shared.',
          ],
        }),
        code({
          title: 'Clearing a CJS cache entry',
          code: dedent(`
            const key = require.resolve('./config');
            const first = require('./config');
            delete require.cache[key];
            const second = require('./config');   // re-executes config.js
            console.log(first === second);
          `),
          expectedOutput: 'false',
          explanation: [
            'Deleting the entry forces a fresh load on the next require.',
            'Modules that already hold `first` keep the old object — this is why hot-reloading by cache deletion leaks and confuses state.',
          ],
        }),
        code({
          title: 'ESM: a new URL means a new instance',
          code: dedent(`
            const a = await import('./plugin.js');
            const b = await import('./plugin.js?v=2');
            console.log(a === b);
          `),
          expectedOutput: 'false',
          explanation: ['The ESM cache is keyed by full URL including the query string. The old instance stays in memory forever — only for dev tooling, not production.'],
        }),
      ),
      section('real-world', 'Real-world usage',
        code({
          title: 'Singleton database pool',
          code: dedent(`
            // db.js
            const { Pool } = require('pg');            // npm package, not core
            const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 10 });
            module.exports = pool;

            // anywhere
            const pool = require('./db');   // same pool everywhere
          `),
          explanation: ['Caching guarantees one pool per process. In tests, prefer exporting a factory (`createPool()`) so each test can build its own.'],
        }),
        note('Tools like `node --watch` (Node 18.11+, stable 22) restart the whole process instead of clearing caches — the reliable way to reload code.'),
      ),
      section('mistakes', 'Common mistakes',
        bullets(
          'Expecting a module to re-run on each require (e.g., to get a fresh timestamp) — export a function instead.',
          'Deleting `require.cache` in production for "hot reload" — causes duplicate state and memory leaks.',
          'On case-insensitive file systems, `require(\'./DB\')` and `require(\'./db\')` can create two instances.',
          'Mutating a cached config object in one request handler affects every other caller.',
        ),
      ),
      section('interview', 'Interview tips',
        interviewTip('Say "cached by resolved filename" — not "by the string you passed". Then mention that ESM has a separate, unexposed cache, and that `node --watch` restarts instead of invalidating.'),
      ),
      section('practice', 'Practice',
        steps('Log `Object.keys(require.cache)` at the end of an app and identify each entry.', 'Turn a singleton module into a factory and inject it into two services.'),
      ),
      section('summary', 'Summary',
        bullets(
          'A module executes once per process per resolved path.',
          '`require.cache` is keyed by absolute filename and can be deleted (CJS only).',
          'ESM cache is internal; a new URL (query string) creates a new instance.',
          'Caching = free singletons, but beware duplicates from different paths.',
        ),
      ),
    ],
    revisionNotes: [
      'Cache key = resolved absolute filename (CJS) / URL (ESM).',
      '`delete require.cache[require.resolve(p)]` forces reload; old references survive.',
      'ESM cache cannot be cleared; `?v=` query creates a new instance (leaks).',
      'Duplicate packages / symlinks / case differences → multiple instances.',
      'Use `node --watch` for reloads.',
    ],
    quiz: [
      {
        kind: 'predict-output', difficulty: 'beginner',
        prompt: 'log.js contains `console.log(\'loaded\'); module.exports = {};`. What does main.js print?',
        code: "require('./log');\nrequire('./log');\nrequire('./log.js');",
        options: ['loaded', 'loaded\nloaded', 'loaded\nloaded\nloaded', 'nothing'],
        answer: 0,
        explanation: 'All three specifiers resolve to the same file, so it executes once and the rest hit the cache.',
      },
      {
        kind: 'mcq', difficulty: 'intermediate',
        prompt: 'What is the key of an entry in `require.cache`?',
        options: ['The specifier string passed to require', 'The package name', 'The resolved absolute filename', 'A hash of the file contents'],
        answer: 2,
        explanation: 'Node resolves the specifier first, then uses the absolute filename as the key — so different specifiers for the same file share one entry.',
      },
      {
        kind: 'scenario', difficulty: 'advanced',
        prompt: 'An app installs two versions of a logger library in different node_modules folders. Logs configured in one part of the app do not apply in another. Why?',
        options: ['require.cache is cleared between files', 'Each copy has a different resolved path, so each is a separate cached instance with its own state', 'Logger libraries cannot be singletons', 'ESM and CJS share no cache'],
        answer: 1,
        explanation: 'The cache is per resolved path; two physical copies mean two instances. Deduplicate with `npm dedupe` or align versions. The cache is never auto-cleared.',
      },
    ],
    interview: [
      {
        category: 'nodejs', kind: 'concept', difficulty: 'intermediate', topic: 'Module caching',
        question: 'What happens when the same module is required from many files, and why can that create singletons?',
        shortAnswer: 'It is executed once; afterwards require returns the cached `module.exports`. Any state created at module top level is therefore shared process-wide.',
        detailedAnswer: [
          'Cached in `require.cache` by resolved filename.',
          'Different specifiers for the same file share the entry.',
          'Two physical copies (different node_modules) are different instances.',
          'Caching is per process: cluster workers each have their own.',
        ],
        followUp: 'How would you make such a module testable?',
        trap: 'Thinking the cache is shared across worker threads or cluster processes.',
      },
      {
        category: 'nodejs', kind: 'concept', difficulty: 'advanced', topic: 'Module caching',
        question: 'How can you force a module to reload, and why is that problematic, especially with ES modules?',
        shortAnswer: 'In CJS delete `require.cache[require.resolve(path)]` and require again; in ESM you cannot clear the cache, only import a different URL. Both leave old instances referenced and leak memory.',
        detailedAnswer: [
          'Old references held by other modules still point to the old exports.',
          'Child modules stay cached unless you delete them too.',
          'ESM cache is internal; `import(\'./x.js?t=\' + Date.now())` creates new instances forever.',
          'Timers/sockets opened by the old instance keep running.',
          'Safer: restart the process (`node --watch`, nodemon) or design plugins with explicit dispose().',
        ],
        followUp: 'How does `node --watch` decide what to watch?',
        trap: 'Recommending cache deletion as a production hot-reload strategy.',
      },
    ],
  },
};

export default content;
