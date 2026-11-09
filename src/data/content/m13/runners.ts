import type { ModuleContent } from '../../../types';
import { bullets, code, dedent, flow, interviewTip, note, section, steps, table, text, tip, warn } from '../helpers';

const content: Partial<ModuleContent> = {
  jest: {
    summary: 'Jest is a popular third-party, all-in-one JavaScript test framework: test runner, `expect` matchers, mocking (`jest.fn`, `jest.mock`), fake timers, snapshots and coverage — with CommonJS as its comfort zone and ESM support still behind a flag.',
    topics: ['Jest', 'describe', 'it', 'test', 'expect', 'matchers', 'jest.fn', 'jest.mock', 'beforeEach', 'async tests', 'ESM', 'fake timers'],
    sections: [
      section('introduction', undefined,
        text('Jest bundles everything you need to test JavaScript in one package. For years it was the default choice for Node and React projects, so you will meet it in most existing codebases.'),
      ),
      section('definition', 'Core API',
        table('Jest building blocks', ['API', 'Purpose', 'Example'], [
          ['`describe(name, fn)`', 'Group related tests', '`describe("cart", () => { … })`'],
          ['`it` / `test`', 'Define a test (aliases)', '`it("adds items", () => { … })`'],
          ['`expect(x).matcher()`', 'Assertion', '`expect(sum(1, 2)).toBe(3)`'],
          ['`beforeEach` / `afterEach`', 'Run around every test in scope', 'Reset state, clear mocks'],
          ['`beforeAll` / `afterAll`', 'Run once per scope', 'Open/close a DB connection'],
          ['`jest.fn()`', 'Create a mock function', '`const send = jest.fn()`'],
          ['`jest.spyOn(obj, "m")`', 'Spy on an existing method', '`jest.spyOn(console, "error")`'],
          ['`jest.mock("./mod")`', 'Replace a whole module', 'Auto-mock or factory'],
          ['`jest.useFakeTimers()`', 'Control setTimeout/Date', '`jest.advanceTimersByTime(1000)`'],
        ]),
        table('Common matchers', ['Matcher', 'Checks'], [
          ['`toBe(v)`', '`Object.is` identity — primitives, same reference'],
          ['`toEqual(v)`', 'Recursive equality (ignores `undefined` properties)'],
          ['`toStrictEqual(v)`', 'Like toEqual but also checks `undefined` props and class types'],
          ['`toThrow(msg?)`', 'Function throws (wrap in arrow: `expect(() => fn()).toThrow()`)'],
          ['`resolves` / `rejects`', 'Promise outcome: `await expect(p).rejects.toThrow("x")`'],
          ['`toHaveBeenCalledWith(...)`', 'A mock was called with args'],
          ['`toMatchObject(obj)`', 'Object contains these properties'],
          ['`toContain(item)`', 'Array/string contains item'],
        ]),
      ),
      section('why', 'Why teams pick Jest',
        bullets(
          'Zero-config for CommonJS projects; huge ecosystem and documentation.',
          'Runs test files in parallel worker processes, each in an isolated module registry.',
          'Built-in mocking of modules, timers and snapshots.',
          'Downsides: slower startup than Vitest/`node:test`; ESM support is experimental; TypeScript needs `ts-jest` or Babel.',
        ),
      ),
      section('internals', 'How Jest runs your tests',
        steps(
          'Jest finds test files (`**/__tests__/**`, `*.test.js`, `*.spec.js`) and spreads them across worker processes.',
          'Each file runs in its own sandboxed module registry (`vm` context) — modules are re-evaluated per file.',
          'Code is transformed first (Babel by default) — this is where `jest.mock()` calls are **hoisted** above imports.',
          'When code requires a mocked module, Jest\'s module registry returns the mock instead.',
          'Results are collected and reported; exit code 1 if any test fails.',
        ),
        flow([
          'Find test files',
          'Workers (parallel)',
          'Transform + hoist jest.mock',
          'Run hooks + tests',
          'Report + exit code',
        ], { title: 'Jest pipeline', direction: 'horizontal' }),
      ),
      section('example', 'Writing Jest tests',
        code({
          title: 'toBe vs toEqual — what they compare (pure JS)',
          runnable: true,
          code: dedent(`
            const a = { id: 1, tags: ['x'] };
            const b = { id: 1, tags: ['x'] };
            const deepEqual = (x, y) => JSON.stringify(x) === JSON.stringify(y); // simplified
            console.log('toBe     ->', Object.is(a, b));
            console.log('toEqual  ->', deepEqual(a, b));
            console.log('toBe same ref ->', Object.is(a, a));
            console.log('NaN toBe NaN ->', Object.is(NaN, NaN), '| NaN === NaN ->', NaN === NaN);
          `),
          expectedOutput: 'toBe     -> false\ntoEqual  -> true\ntoBe same ref -> true\nNaN toBe NaN -> true | NaN === NaN -> false',
          explanation: [
            '`toBe` uses `Object.is`: two different objects are never "the same".',
            '`toEqual` walks the structure recursively (Jest\'s real algorithm handles cycles, Maps, Sets, Dates…).',
            '`Object.is` treats `NaN` as equal to itself, unlike `===`.',
          ],
        }),
        code({
          title: 'Mocking a module + async test',
          code: dedent(`
            // src/signup.js (CommonJS)
            const mailer = require('./mailer');
            const users = require('./users-repo');
            async function signup(email) {
              if (await users.findByEmail(email)) throw new Error('email taken');
              const user = await users.create({ email });
              await mailer.sendWelcome(user.email);
              return user;
            }
            module.exports = { signup };

            // test/signup.test.js
            jest.mock('../src/mailer');          // auto-mock: every export becomes jest.fn()
            jest.mock('../src/users-repo');
            const mailer = require('../src/mailer');
            const users = require('../src/users-repo');
            const { signup } = require('../src/signup');

            describe('signup', () => {
              beforeEach(() => jest.clearAllMocks());

              it('creates the user and sends a welcome email', async () => {
                users.findByEmail.mockResolvedValue(null);
                users.create.mockResolvedValue({ id: 1, email: 'a@b.io' });

                await expect(signup('a@b.io')).resolves.toEqual({ id: 1, email: 'a@b.io' });
                expect(mailer.sendWelcome).toHaveBeenCalledWith('a@b.io');
                expect(mailer.sendWelcome).toHaveBeenCalledTimes(1);
              });

              it('rejects duplicates without sending email', async () => {
                users.findByEmail.mockResolvedValue({ id: 9 });
                await expect(signup('a@b.io')).rejects.toThrow('email taken');
                expect(mailer.sendWelcome).not.toHaveBeenCalled();
              });
            });
          `),
          expectedOutput: ' PASS  test/signup.test.js\n  signup\n    ✓ creates the user and sends a welcome email (3 ms)\n    ✓ rejects duplicates without sending email (1 ms)\n\nTests:       2 passed, 2 total',
          explanation: [
            '`jest.mock` is hoisted above the `require` calls by Jest\'s transform, so `signup.js` receives the mocks.',
            '`mockResolvedValue` makes the mock return a resolved promise.',
            '`clearAllMocks` resets call history between tests so counts do not leak.',
            'Always `await` (or return) `expect(...).resolves/rejects` — otherwise the assertion is skipped.',
          ],
        }),
        code({
          title: 'Fake timers',
          code: dedent(`
            function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }

            test('debounce calls once after the delay', () => {
              jest.useFakeTimers();
              const fn = jest.fn();
              const d = debounce(fn, 300);
              d('a'); d('b'); d('c');
              expect(fn).not.toHaveBeenCalled();
              jest.advanceTimersByTime(300);
              expect(fn).toHaveBeenCalledTimes(1);
              expect(fn).toHaveBeenLastCalledWith('c');
              jest.useRealTimers();
            });
          `),
          expectedOutput: '✓ debounce calls once after the delay (2 ms)',
          explanation: [
            'Fake timers replace `setTimeout` so time moves only when the test says so — fast and deterministic.',
            'Restore real timers afterwards (or configure `fakeTimers` in Jest config).',
          ],
        }),
      ),
      section('real-world', 'Configuration and ESM caveats',
        code({
          title: 'jest.config.js and running ESM',
          code: dedent(`
            // jest.config.js
            module.exports = {
              testEnvironment: 'node',          // not jsdom for backend code
              clearMocks: true,                 // auto jest.clearAllMocks() before each test
              collectCoverageFrom: ['src/**/*.js'],
              coverageThreshold: { global: { branches: 80, lines: 85 } },
            };

            // Native ESM ("type": "module") is experimental in Jest:
            //   node --experimental-vm-modules node_modules/jest/bin/jest.js
            // and jest.mock() is NOT hoisted over static imports — use:
            //   jest.unstable_mockModule('../src/mailer.js', () => ({ sendWelcome: jest.fn() }));
            //   const { signup } = await import('../src/signup.js');
          `),
          expectedOutput: '$ npx jest --coverage\n...\nJest: "global" coverage threshold for branches (80%) not met: 72.5%',
          explanation: [
            'Backend tests should use the `node` environment (faster, no fake DOM).',
            'Coverage thresholds make CI fail when coverage drops.',
            'For ESM/TypeScript-first projects, Vitest or `node:test` are often simpler.',
          ],
        }),
      ),
      section('mistakes', 'Common mistakes',
        bullets(
          '`expect(fn()).toThrow()` — the function throws before `expect` runs. Use `expect(() => fn()).toThrow()`.',
          'Using `toBe` for objects/arrays.',
          'Not awaiting `resolves`/`rejects`.',
          'Mixing `clearAllMocks` (history), `resetAllMocks` (history + implementations) and `restoreAllMocks` (restore spied originals) without knowing the difference.',
          'Forgetting to close servers/DB → "Jest did not exit one second after the test run has completed".',
        ),
      ),
      section('interview', 'Interview angle',
        interviewTip('Expect questions on `toBe` vs `toEqual`, how `jest.mock` hoisting works, and the clear/reset/restore trio. Mention ESM limitations to show you have used it on modern code.'),
      ),
      section('practice', 'Practice',
        text('Write Jest tests for a `retry(fn, times)` helper: it should resolve when `fn` eventually succeeds and reject after `times` failures. Use `jest.fn().mockRejectedValueOnce(...).mockResolvedValue(...)`.'),
      ),
      section('summary', 'Summary',
        bullets(
          'Jest (third-party) = runner + `expect` + mocks + timers + coverage.',
          '`describe/it/expect`, hooks, `jest.fn`, `jest.spyOn`, `jest.mock`.',
          '`toBe` = identity; `toEqual` = deep equality.',
          '`jest.mock` is hoisted in CJS/Babel; ESM needs `--experimental-vm-modules` and `unstable_mockModule`.',
        ),
      ),
    ],
    revisionNotes: [
      '`toBe` uses Object.is; `toEqual` deep; `toStrictEqual` also checks undefined props/types.',
      '`expect(() => fn()).toThrow()` — wrap in a function.',
      '`await expect(p).rejects.toThrow()`.',
      'clearAllMocks (calls) < resetAllMocks (+impl) < restoreAllMocks (+originals for spies).',
      'ESM: experimental; `jest.unstable_mockModule` + dynamic import.',
    ],
    quiz: [
      {
        kind: 'predict-output', difficulty: 'intermediate',
        prompt: 'Which assertion fails?',
        code: "expect([1, 2]).toEqual([1, 2]);   // A\nexpect({ a: 1 }).toBe({ a: 1 });   // B\nexpect('x').toBe('x');             // C",
        options: ['A', 'B', 'C', 'None'],
        answer: 1,
        explanation: '`toBe` uses `Object.is`; two separate object literals are different references. Strings are primitives, so C passes; A compares deeply.',
      },
      {
        kind: 'find-bug', difficulty: 'intermediate',
        prompt: 'Why does this test error out instead of passing?',
        code: "test('throws on bad input', () => {\n  expect(parse('{bad')).toThrow(SyntaxError);\n});",
        options: [
          'SyntaxError cannot be matched',
          '`parse` runs and throws before `expect` receives anything — wrap it: `expect(() => parse("{bad")).toThrow(SyntaxError)`',
          'toThrow needs a string',
          'The test must be async',
        ],
        answer: 1,
        explanation: 'Arguments are evaluated first, so the exception escapes the test. `toThrow` needs a function it can call inside a try/catch.',
      },
      {
        kind: 'mcq', difficulty: 'advanced',
        prompt: 'What does `jest.restoreAllMocks()` do that `jest.clearAllMocks()` does not?',
        options: [
          'Deletes all test files',
          'Restores original implementations of methods replaced with `jest.spyOn`',
          'Clears the call history only',
          'Re-runs failed tests',
        ],
        answer: 1,
        explanation: '`clearAllMocks` resets `mock.calls`/`mock.results`. `restoreAllMocks` puts back the real methods that `spyOn` replaced.',
      },
    ],
    interview: [
      {
        category: 'nodejs', kind: 'concept', difficulty: 'intermediate', topic: 'Jest',
        question: 'How does `jest.mock()` manage to replace a module that is imported at the top of the file?',
        shortAnswer: 'Jest\'s Babel transform hoists `jest.mock()` calls above the imports, and its custom module registry returns the mock whenever that path is required.',
        detailedAnswer: [
          'babel-plugin-jest-hoist moves `jest.mock` calls to the top of the file.',
          'Jest implements its own `require` with a per-test-file registry.',
          'When a mocked path is required (by the test or the code under test), the registry returns the auto-mock or factory result.',
          'Factories cannot reference out-of-scope variables unless prefixed `mock`, because of hoisting.',
          'Native ESM imports are linked before code runs, so hoisting does not work; use `jest.unstable_mockModule` + `await import()`.',
        ],
        followUp: 'How would you mock a module in Vitest or node:test instead?',
        trap: 'Thinking `jest.mock` patches the module at runtime after import.',
      },
      {
        category: 'nodejs', kind: 'concept', difficulty: 'advanced', topic: 'Jest',
        question: 'Why does Jest sometimes report "did not exit one second after the test run has completed", and how do you fix it properly?',
        shortAnswer: 'Something keeps the event loop alive — an open server, DB pool, socket, interval or unref-less timer; find it with `--detectOpenHandles` and close it in `afterAll` rather than using `--forceExit`.',
        detailedAnswer: [
          'Node exits only when no active handles remain.',
          'Common culprits: `app.listen()` in tests, pg/mongoose connections, Redis clients, `setInterval`.',
          '`jest --detectOpenHandles` prints stack traces where handles were created.',
          'Fix: export the app without listening (Supertest), close pools in `afterAll`, clear intervals or `unref()` them.',
          '`--forceExit` hides leaks that may also exist in production code.',
        ],
        followUp: 'What is the difference between `ref()` and `unref()` on a timer?',
        trap: 'Adding `--forceExit` as the fix.',
      },
    ],
  },

  vitest: {
    summary: 'Vitest is a fast, third-party test framework built on Vite with a Jest-compatible API (`describe/it/expect`, `vi.fn`, `vi.mock`) and native ESM and TypeScript support out of the box.',
    topics: ['Vitest', 'vi.fn', 'vi.mock', 'vi.spyOn', 'vi.useFakeTimers', 'ESM', 'TypeScript', 'watch mode', 'Jest compatibility'],
    sections: [
      section('introduction', undefined,
        text('If your project uses ES modules or TypeScript, Jest needs extra configuration. Vitest runs that code directly — with the same API you already know from Jest — and is usually much faster in watch mode.'),
      ),
      section('definition', 'What it is',
        text('Vitest is a test runner powered by **Vite**\'s transform pipeline (esbuild). It reuses your `vite.config` (aliases, plugins), understands ESM and TS natively, and exposes a Jest-like API through the `vi` object.'),
        table('Jest vs Vitest', ['', 'Jest', 'Vitest'], [
          ['Module system', 'CJS first; ESM experimental', 'ESM native; CJS supported'],
          ['TypeScript', 'ts-jest or Babel', 'Built in (esbuild transpile, no type-check)'],
          ['Mock API', '`jest.fn`, `jest.mock`, `jest.spyOn`', '`vi.fn`, `vi.mock`, `vi.spyOn`'],
          ['Globals', '`describe/it/expect` global by default', 'Import from `vitest` (or `globals: true`)'],
          ['Watch mode', 'Re-runs related tests', 'Vite module graph → instant HMR-like reruns'],
          ['Config', '`jest.config.js`', '`vitest.config.ts` / `vite.config.ts` `test` key'],
          ['Coverage', 'Built-in (istanbul/v8)', '`@vitest/coverage-v8` or `-istanbul`'],
        ]),
      ),
      section('why', 'Why choose it',
        bullets(
          'Modern stacks (ESM, TS, Vite frontends) work with zero transform config.',
          'Jest API compatibility makes migration mostly a find-and-replace (`jest.` → `vi.`).',
          'Fast startup and smart watch mode improve the feedback loop.',
          'Note: like Jest it is third-party; `node:test` is the zero-dependency alternative.',
        ),
      ),
      section('internals', 'How it works',
        steps(
          'Vitest starts a Vite dev server internally (no browser).',
          'Each test file is transformed through Vite plugins/esbuild and executed in a worker (threads or forks pool).',
          '`vi.mock(path, factory)` calls are **hoisted** to the top of the file by Vitest\'s transform, so they apply before static imports — this works with ESM.',
          'Watch mode tracks the module graph and reruns only tests that import changed files.',
        ),
        flow([
          'vitest',
          'Vite transform (TS/ESM)',
          'Hoist vi.mock',
          'Worker pool runs files',
          'Watch: module graph reruns',
        ], { title: 'Vitest pipeline', direction: 'horizontal' }),
      ),
      section('example', 'Writing Vitest tests',
        code({
          title: 'TypeScript test with vi.mock and vi.fn',
          language: 'typescript',
          code: dedent(`
            // src/price.ts
            import { getRate } from './fx.js';
            export async function toEUR(usd: number): Promise<number> {
              const rate = await getRate('USD', 'EUR');
              return Math.round(usd * rate * 100) / 100;
            }

            // src/price.test.ts
            import { describe, it, expect, vi, beforeEach } from 'vitest';
            import { toEUR } from './price.js';
            import { getRate } from './fx.js';

            vi.mock('./fx.js', () => ({ getRate: vi.fn() })); // hoisted above the imports

            describe('toEUR', () => {
              beforeEach(() => vi.mocked(getRate).mockReset());

              it('converts using the current rate', async () => {
                vi.mocked(getRate).mockResolvedValue(0.9);
                await expect(toEUR(10)).resolves.toBe(9);
                expect(getRate).toHaveBeenCalledWith('USD', 'EUR');
              });

              it('propagates FX errors', async () => {
                vi.mocked(getRate).mockRejectedValue(new Error('fx down'));
                await expect(toEUR(10)).rejects.toThrow('fx down');
              });
            });
          `),
          expectedOutput: ' ✓ src/price.test.ts (2 tests) 4ms\n   ✓ toEUR > converts using the current rate\n   ✓ toEUR > propagates FX errors\n\n Test Files  1 passed (1)\n      Tests  2 passed (2)',
          explanation: [
            'ESM + TypeScript with no Babel or ts-jest configuration.',
            '`vi.mocked()` is a type helper that tells TypeScript the import is a mock.',
            'Same matcher names as Jest (`resolves.toBe`, `toHaveBeenCalledWith`).',
          ],
        }),
        code({
          title: 'Config, spies and timers',
          language: 'typescript',
          code: dedent(`
            // vitest.config.ts
            import { defineConfig } from 'vitest/config';
            export default defineConfig({
              test: {
                environment: 'node',
                restoreMocks: true,                 // restore spies after each test
                coverage: { provider: 'v8', reporter: ['text', 'html'], thresholds: { lines: 80 } },
              },
            });

            // a test
            import { it, expect, vi } from 'vitest';
            it('logs a warning after 5 s', () => {
              vi.useFakeTimers();
              const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
              setTimeout(() => console.warn('slow'), 5000);
              vi.advanceTimersByTime(5000);
              expect(warn).toHaveBeenCalledWith('slow');
              vi.useRealTimers();
            });
          `),
          expectedOutput: '$ npx vitest run --coverage\n ✓ src/slow.test.ts (1 test) 3ms\n % Coverage report from v8\nAll files |   86.2 |   78.9 |   90.0 |   86.2',
          explanation: [
            '`vitest` alone starts watch mode in a terminal; `vitest run` runs once (CI).',
            '`mockImplementation(() => {})` silences the real console while still recording calls.',
            'Coverage requires installing `@vitest/coverage-v8`.',
          ],
        }),
      ),
      section('real-world', 'Migration and usage notes',
        bullets(
          'Migrating from Jest: replace `jest.` with `vi.`, import test APIs from `vitest` (or set `globals: true`), check `vi.mock` factory differences (ESM modules need a `default` key for default exports).',
          'esbuild strips types without checking them — run `tsc --noEmit` separately in CI.',
          'Works for backend code too: set `environment: "node"`.',
          'Use `pool: "forks"` if native addons or `process.chdir` misbehave in worker threads.',
        ),
        note('Vitest is not tied to frontend apps — any Node project can use it, with or without a `vite.config`.'),
      ),
      section('mistakes', 'Common mistakes',
        bullets(
          'Expecting `describe`/`it` to be global without `globals: true`.',
          'Relying on Vitest to catch type errors (it does not type-check by default).',
          'Using `vi.mock` inside a test body expecting it to be scoped — it is hoisted to the top of the file.',
          'Running `vitest` (watch) in CI instead of `vitest run`.',
        ),
      ),
      section('interview', 'Interview angle',
        interviewTip('Position it: "Jest-compatible API, but native ESM/TS via Vite, faster watch. For zero dependencies I would consider `node:test`." Mention that both Jest and Vitest are third-party.'),
      ),
      section('practice', 'Practice',
        text('Take a small Jest test file and port it to Vitest. Note every change you needed (imports, `vi.` prefix, mock factory default export) and compare cold-run and watch-mode timings.'),
      ),
      section('summary', 'Summary',
        bullets(
          'Vitest (third-party) = Jest-like API on Vite.',
          'Native ESM and TypeScript; hoisted `vi.mock` works with ESM.',
          '`vitest` = watch, `vitest run` = once.',
          'Type-check separately; coverage via a plugin package.',
        ),
      ),
    ],
    revisionNotes: [
      '`vi.fn`, `vi.spyOn`, `vi.mock` (hoisted), `vi.useFakeTimers`.',
      'Import APIs from `vitest` unless `globals: true`.',
      'esbuild transpiles TS — no type-checking.',
      '`vitest run` for CI.',
      'Coverage: `@vitest/coverage-v8`.',
    ],
    quiz: [
      {
        kind: 'mcq', difficulty: 'beginner',
        prompt: 'Which is the Vitest equivalent of `jest.fn()`?',
        options: ['vitest.fn()', 'vi.fn()', 'mock.fn()', 'spy()'],
        answer: 1,
        explanation: 'Vitest exposes its mocking utilities on the `vi` object. `mock.fn()` is the `node:test` API.',
      },
      {
        kind: 'scenario', difficulty: 'intermediate',
        prompt: 'Your Vitest suite is green, but production build fails with a TypeScript error in a tested file. Why?',
        options: [
          'Vitest runs a different TypeScript version',
          'Vitest transpiles TS with esbuild and does not type-check; run `tsc --noEmit` in CI as well',
          'The test file was skipped',
          'Coverage is too low',
        ],
        answer: 1,
        explanation: 'esbuild strips types for speed. Type errors only surface with the TypeScript compiler (or Vitest\'s optional typecheck mode).',
      },
    ],
    interview: [
      {
        category: 'nodejs', kind: 'concept', difficulty: 'intermediate', topic: 'Vitest',
        question: 'When would you choose Vitest over Jest for a Node.js backend?',
        shortAnswer: 'When the codebase is ESM and/or TypeScript-first, or already uses Vite: Vitest runs it natively with a Jest-compatible API and faster feedback, without Babel or ts-jest.',
        detailedAnswer: [
          'Jest\'s ESM support is still experimental and `jest.mock` hoisting does not apply to native ESM.',
          'Vitest hoists `vi.mock` in its own transform, so ESM mocking works.',
          'Shared Vite config (aliases) for monorepos with frontend code.',
          'Trade-off: newer ecosystem; some Jest plugins or custom environments may not exist.',
          'Alternative with zero deps: `node:test`.',
        ],
        followUp: 'What changes when migrating a Jest suite to Vitest?',
        trap: 'Claiming Vitest only works for frontend/Vite apps.',
      },
    ],
  },

  'node-js-test-runner': {
    summary: 'Node.js ships a built-in test runner — `node:test` with `node:assert/strict`, run via `node --test` — stable since Node 20, with mocking (`mock.fn`, `mock.method`, `mock.timers`), watch mode, reporters and experimental coverage.',
    topics: ['node:test', 'node --test', 'node:assert/strict', 'mock.fn', 'mock.method', 'mock.timers', '--experimental-test-coverage', 'reporters', 'subtests'],
    sections: [
      section('introduction', undefined,
        text('You no longer need a dependency to test Node code. `node:test` provides `describe/it`, hooks, mocks and reporters, and `node --test` finds and runs your test files.'),
      ),
      section('definition', 'The API',
        table('node:test essentials', ['API', 'Purpose'], [
          ['`test(name, fn)` / `it`', 'Define a test (`fn` may be async or take `t`)'],
          ['`describe(name, fn)` / `suite`', 'Group tests'],
          ['`before`, `after`, `beforeEach`, `afterEach`', 'Hooks'],
          ['`t.test(...)`', 'Subtests (await them)'],
          ['`mock.fn(impl?)`', 'Mock function; inspect `fn.mock.calls`, `fn.mock.callCount()`'],
          ['`mock.method(obj, "name", impl?)`', 'Replace/spy a method; `.mock.restore()`'],
          ['`mock.timers.enable({ apis: ["setTimeout"] })`', 'Fake timers; `mock.timers.tick(ms)`'],
          ['`test.skip`, `test.todo`, `test.only` (+ `--test-only`)', 'Control what runs'],
          ['`assert` from `node:assert/strict`', '`equal`, `deepEqual`, `throws`, `rejects`, `match`'],
        ]),
        table('CLI flags', ['Flag', 'Effect', 'Version note'], [
          ['`node --test`', 'Discover and run test files', 'Stable since Node 20'],
          ['`--watch`', 'Re-run on change', 'Node 18.11+/20 (stable 22)'],
          ['`--test-reporter=spec|tap|dot|junit|lcov`', 'Output format', 'Node 19.6+/18.15+'],
          ['`--test-name-pattern="regex"`', 'Run matching tests only', ''],
          ['`--experimental-test-coverage`', 'Line/branch/function coverage report', 'Experimental'],
          ['`--test-concurrency=n`', 'Parallel test files', ''],
        ]),
      ),
      section('why', 'Why use it',
        bullets(
          'Zero dependencies — nothing to install, update or audit.',
          'Runs native ESM and CommonJS without transforms; with type stripping (Node 22.6+ flag, default in newer releases) it can run simple `.ts` tests too.',
          'Each test file runs in its own child process by default — good isolation.',
          'Trade-offs: no built-in module mocking as ergonomic as `jest.mock` (`mock.module` is experimental), smaller matcher set.',
        ),
      ),
      section('internals', 'How `node --test` works',
        steps(
          'Without arguments, Node searches for files matching default patterns such as `**/*.test.{js,mjs,cjs}`, `**/*-test.*`, `**/*_test.*`, and files in `test/` directories (exact globs vary slightly by version).',
          'Each file is executed in a separate child process (configurable with `--test-isolation` in newer versions).',
          'Tests report results as events to the parent via a TAP-like stream; reporters format them.',
          'The process exits with code 1 if any test fails.',
        ),
        flow([
          'node --test',
          'Glob test files',
          'Child process per file',
          'Run tests + hooks',
          'Stream events → reporter',
          'Exit code',
        ], { title: 'Built-in runner', direction: 'horizontal' }),
      ),
      section('example', 'Using node:test',
        code({
          title: 'Tests, mocks and timers',
          code: dedent(`
            // test/notifier.test.js
            import { describe, it, beforeEach, mock } from 'node:test';
            import assert from 'node:assert/strict';

            function createNotifier(mailer) {
              return {
                async notify(user) {
                  if (!user.email) return false;
                  await mailer.send(user.email, 'Hi ' + user.name);
                  return true;
                },
                remindLater(user, ms) { setTimeout(() => mailer.send(user.email, 'Reminder'), ms); },
              };
            }

            describe('notifier', () => {
              let mailer;
              beforeEach(() => { mailer = { send: mock.fn(async () => 'ok') }; });

              it('sends an email', async () => {
                const ok = await createNotifier(mailer).notify({ name: 'Ana', email: 'ana@x.io' });
                assert.equal(ok, true);
                assert.equal(mailer.send.mock.callCount(), 1);
                assert.deepEqual(mailer.send.mock.calls[0].arguments, ['ana@x.io', 'Hi Ana']);
              });

              it('skips users without email', async () => {
                assert.equal(await createNotifier(mailer).notify({ name: 'Bo' }), false);
                assert.equal(mailer.send.mock.callCount(), 0);
              });

              it('sends a reminder after the delay', (t) => {
                t.mock.timers.enable({ apis: ['setTimeout'] });
                createNotifier(mailer).remindLater({ email: 'a@x.io' }, 60_000);
                t.mock.timers.tick(59_999);
                assert.equal(mailer.send.mock.callCount(), 0);
                t.mock.timers.tick(1);
                assert.equal(mailer.send.mock.callCount(), 1);
              });
            });
          `),
          expectedOutput: '$ node --test\n▶ notifier\n  ✔ sends an email (0.9ms)\n  ✔ skips users without email (0.2ms)\n  ✔ sends a reminder after the delay (0.6ms)\n▶ notifier (2.4ms)\nℹ tests 3\nℹ suites 1\nℹ pass 3\nℹ fail 0',
          explanation: [
            '`mock.fn` records each call in `mock.calls[i].arguments` (and `.result`, `.error`).',
            '`t.mock` mocks are automatically restored when that test finishes.',
            '`mock.timers.tick` advances fake time synchronously — the 60 s reminder is tested instantly.',
          ],
          versionNote: '`node:test` stable since Node 20; `mock.timers` added in Node 20.4.',
        }),
        code({
          title: 'mock.method and coverage',
          code: dedent(`
            import { test, mock } from 'node:test';
            import assert from 'node:assert/strict';
            import fs from 'node:fs/promises';
            import { loadConfig } from '../src/config.js'; // reads ./config.json with fs.readFile

            test('loadConfig parses the file', async (t) => {
              const read = t.mock.method(fs, 'readFile', async () => '{"port":8080}');
              assert.deepEqual(await loadConfig(), { port: 8080 });
              assert.equal(read.mock.calls[0].arguments[0], './config.json');
            }); // method restored automatically

            // $ node --test --experimental-test-coverage
          `),
          expectedOutput: dedent(`
            ✔ loadConfig parses the file (1.4ms)
            ℹ start of coverage report
            ℹ file          | line % | branch % | funcs % | uncovered lines
            ℹ src/config.js |  85.71 |    66.67 |  100.00 | 9
            ℹ end of coverage report
          `),
          explanation: [
            '`mock.method` replaces a method on an object (here the `fs/promises` default export) and spies on it.',
            'This only works if the code under test calls `fs.readFile` through the same object — destructured imports (`import { readFile }`) are bound earlier and are not affected.',
            'Coverage uses V8\'s built-in coverage; output format may change while it is experimental.',
          ],
        }),
      ),
      section('real-world', 'Project setup',
        code({
          title: 'package.json scripts',
          language: 'json',
          code: dedent(`
            {
              "type": "module",
              "scripts": {
                "test": "node --test",
                "test:watch": "node --test --watch",
                "test:ci": "node --test --test-reporter=spec --test-reporter=junit --test-reporter-destination=stdout --test-reporter-destination=junit.xml",
                "coverage": "node --test --experimental-test-coverage"
              }
            }
          `),
          expectedOutput: '$ npm test\nℹ tests 42\nℹ pass 42\nℹ fail 0\nℹ duration_ms 812',
          explanation: [
            'Multiple reporters can write to different destinations — human output plus JUnit XML for CI dashboards.',
            'Node 21+ also accepts glob patterns as arguments: `node --test "src/**/*.test.js"`.',
          ],
        }),
        tip('Use `node:assert/strict`, not `node:assert` — the legacy mode uses loose `==` for `equal`/`deepEqual`.'),
      ),
      section('mistakes', 'Common mistakes',
        bullets(
          'Importing `assert` from `node:assert` and getting loose equality (`assert.equal(1, "1")` passes).',
          'Not awaiting subtests (`t.test(...)`) — they may be cancelled when the parent finishes.',
          'Expecting `mock.method` to affect named imports that were already destructured.',
          'Forgetting `--test-only` when using `test.only` (outside of watch mode, `only` needs the flag).',
        ),
        warn('Module mocking (`mock.module`) exists but is experimental and behind a flag in current releases — prefer dependency injection for testability.'),
      ),
      section('interview', 'Interview angle',
        interviewTip('Knowing that Node has a stable built-in runner (Node 20+), how to mock with `mock.fn`/`mock.method`/`mock.timers`, and that strict assert matters signals you keep up with modern Node.'),
      ),
      section('practice', 'Practice',
        text('Convert a small Jest suite to `node:test`. Replace `jest.fn` with `mock.fn`, `expect(...).toEqual` with `assert.deepEqual`, fake timers with `t.mock.timers`, and run it with `--watch` and coverage.'),
      ),
      section('summary', 'Summary',
        bullets(
          '`node:test` + `node:assert/strict`, run by `node --test` — stable since Node 20.',
          'Mocks: `mock.fn`, `mock.method`, `mock.timers`; `t.mock` auto-restores.',
          'Watch mode, multiple reporters, experimental coverage.',
          'Zero dependencies; module mocking is limited → design for injection.',
        ),
      ),
    ],
    revisionNotes: [
      '`import { test, describe, mock } from "node:test"`.',
      '`import assert from "node:assert/strict"`.',
      '`node --test`, `--watch`, `--test-reporter`, `--experimental-test-coverage`.',
      '`fn.mock.calls[i].arguments`, `fn.mock.callCount()`.',
      '`t.mock.timers.enable({ apis: ["setTimeout"] })` + `tick(ms)`.',
      'Stable since Node 20; each file in its own process.',
    ],
    quiz: [
      {
        kind: 'complete-code', difficulty: 'beginner',
        prompt: 'Complete the import for strict assertions with the built-in runner.',
        code: "import { test } from 'node:test';\nimport assert from /* ??? */;",
        options: ["'assert'", "'node:assert/strict'", "'node:test/assert'", "'chai'"],
        answer: 1,
        explanation: '`node:assert/strict` gives strict `equal`/`deepEqual`. Plain `assert` uses legacy loose equality; `node:test/assert` does not exist; chai is third-party.',
      },
      {
        kind: 'predict-output', difficulty: 'intermediate',
        prompt: 'What is `fn.mock.callCount()` at the end?',
        code: "const fn = mock.fn((x) => x * 2);\nfn(1); fn(2);\n[3, 4].map(fn);",
        options: ['2', '3', '4', '0'],
        answer: 2,
        explanation: 'Two direct calls plus two calls from `map` = 4. Every invocation is recorded in `fn.mock.calls`.',
      },
      {
        kind: 'mcq', difficulty: 'intermediate',
        prompt: 'Since which Node.js major version is the built-in test runner considered stable?',
        options: ['Node 14', 'Node 16', 'Node 18', 'Node 20'],
        answer: 3,
        explanation: '`node:test` was added experimentally in Node 18 (and backported to 16.17) and marked stable in Node 20.',
      },
    ],
    interview: [
      {
        category: 'nodejs', kind: 'concept', difficulty: 'intermediate', topic: 'node:test',
        question: 'What does Node\'s built-in test runner offer, and when would you choose it over Jest?',
        shortAnswer: 'It offers describe/it, hooks, subtests, `mock.fn`/`mock.method`/`mock.timers`, watch mode, reporters and coverage with zero dependencies; I choose it for libraries and services where minimal dependencies and native ESM matter more than Jest\'s module mocking and matcher ecosystem.',
        detailedAnswer: [
          'Stable since Node 20, run with `node --test`.',
          'Native ESM/CJS, no transform step; each file isolated in a child process.',
          'Assertions via `node:assert/strict` (fewer matchers than `expect`).',
          'Module mocking is experimental, so code should use dependency injection.',
          'Removes supply-chain and upgrade burden of a large test framework.',
        ],
        followUp: 'How would you fake time with node:test?',
        trap: 'Saying Node has no built-in test runner.',
      },
      {
        category: 'nodejs', kind: 'concept', difficulty: 'advanced', topic: 'node:test',
        question: 'Why does `mock.method(fs, "readFile")` sometimes have no effect on the code under test?',
        shortAnswer: 'Because the code captured a direct reference — e.g. `import { readFile } from "node:fs/promises"` — before the mock replaced the property on the object; only calls made through the object property see the replacement.',
        detailedAnswer: [
          '`mock.method` swaps `obj[name]` at runtime.',
          'ESM named imports are live bindings to the module\'s export, not to a property on the default object you patched.',
          'Destructuring in CJS (`const { readFile } = require(...)`) copies the function reference at load time.',
          'Fixes: call `fs.readFile` via the namespace/default object, inject the dependency, or use (experimental) module mocking.',
        ],
        followUp: 'How does dependency injection make this a non-issue?',
        trap: 'Assuming spies patch every reference to a function globally.',
      },
    ],
  },
};

export default content;
