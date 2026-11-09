import type { ModuleContent } from '../../../types';
import { bullets, code, dedent, flow, interviewTip, note, section, steps, table, text, warn } from '../helpers';

const content: Partial<ModuleContent> = {
  'development-vs-production': {
    summary: 'Development optimises for fast feedback and rich errors; production optimises for speed, safety, stability and observability — and the same code must behave correctly in both.',
    topics: ['NODE_ENV', 'production mode', 'npm ci --omit=dev', 'Express view cache', 'error verbosity', 'dev vs prod'],
    sections: [
      section('introduction', undefined,
        text('On your laptop you want auto-restart, stack traces in the browser and pretty logs. On a server facing real users you want none of that — you want speed, minimal attack surface and machine-readable logs.'),
      ),
      section('definition', 'What "production" means',
        text('A **production environment** is where the real users and real data live. "Development mode" and "production mode" are *configurations* of the same codebase, usually switched by environment variables such as `NODE_ENV`.'),
        bullets(
          '`NODE_ENV` is a **convention**, not a Node core feature — Node itself ignores it.',
          'Libraries read it: Express, React build tools, many loggers and ORMs change behaviour when `NODE_ENV=production`.',
          'Only use the values `development`, `production` and `test`; invent separate variables (e.g. `APP_ENV=staging`) for deployment stages.',
        ),
      ),
      section('why', 'Why the distinction matters',
        table('Development vs production', ['Concern', 'Development', 'Production'], [
          ['Process', '`node --watch` / nodemon / tsx', 'Plain `node dist/server.js` under a supervisor (container, systemd, pm2)'],
          ['Dependencies', 'All, incl. devDependencies', '`npm ci --omit=dev` — runtime deps only'],
          ['Code', 'TypeScript run directly, unminified', 'Compiled JS (`tsc`), optional bundling, source maps'],
          ['Errors to client', 'Full stack traces', 'Generic message + error id; details only in logs'],
          ['Logging', 'Pretty, colourised, debug level', 'JSON, info level, shipped to a log store'],
          ['Express views', 'Re-read on every render', 'Cached (`view cache` enabled when `NODE_ENV=production`)'],
          ['Secrets', '`.env` file on disk', 'Injected by the platform / secret manager'],
          ['TLS', 'Usually plain HTTP on localhost', 'HTTPS, often terminated at a proxy/load balancer'],
        ]),
      ),
      section('internals', 'What NODE_ENV=production actually changes',
        bullets(
          '**Express** (third-party): enables `app.set(\'view cache\')` by default and its default error handler stops sending stack traces to the client.',
          '**npm**: `npm install` / `npm ci` skip devDependencies when `NODE_ENV=production` is set (same effect as `--omit=dev`). Prefer the explicit flag so builds are predictable.',
          '**Your code**: anything branching on `process.env.NODE_ENV` — keep these branches few; prefer explicit config flags.',
          '**Performance**: some libraries skip expensive dev-only checks (e.g. extra validation/warnings), which is why forgetting it can make an app measurably slower.',
        ),
        warn('If `NODE_ENV=production` is set during a build step that needs dev tools (e.g. `tsc`), `npm ci` will skip them and the build fails. Build with all deps, then prune or install runtime deps in a separate stage.'),
      ),
      section('visual', 'From laptop to production',
        flow(['Dev: node --watch, .env, debug logs', 'CI: npm ci, test, build', 'Artifact: dist/ + prod deps (image)', 'Prod: NODE_ENV=production, JSON logs, secrets injected'],
          { title: 'Same code, different configuration', direction: 'horizontal' }),
      ),
      section('example', 'Environment-aware error handler',
        code({
          title: 'error-handler.js (Express)',
          code: dedent(`
            const isProd = process.env.NODE_ENV === 'production';

            // Express error-handling middleware: 4 arguments
            function errorHandler(err, req, res, next) {
              const status = err.status ?? 500;
              req.log?.error({ err, reqId: req.id }, 'request failed');
              res.status(status).json(
                isProd
                  ? { error: status >= 500 ? 'Internal Server Error' : err.message, reqId: req.id }
                  : { error: err.message, stack: err.stack },
              );
            }

            module.exports = { errorHandler };
          `),
          expectedOutput: dedent(`
            # NODE_ENV=development  → {"error":"db down","stack":"Error: db down\\n    at ..."}
            # NODE_ENV=production   → {"error":"Internal Server Error","reqId":"9f1c2a"}
          `),
          explanation: [
            'The flag is read once at startup — no per-request environment lookups.',
            'In production the client gets a generic message plus a request id it can quote to support.',
            'The full error (with stack) is always logged server-side, so nothing is lost.',
            '4xx messages are usually safe to show (they describe the client\'s mistake); 5xx details are not.',
          ],
        }),
        code({
          title: 'Installing for production',
          language: 'bash',
          code: dedent(`
            npm ci --omit=dev
            NODE_ENV=production node dist/server.js
          `),
          expectedOutput: 'added 87 packages in 3s\n{"level":30,"msg":"listening","port":3000}',
          explanation: [
            '`npm ci` installs exactly what `package-lock.json` says and fails if it disagrees with `package.json`.',
            '`--omit=dev` leaves out test runners, TypeScript, linters — smaller and safer.',
            'The app then starts with plain `node`, not a watcher.',
          ],
          versionNote: '`--omit=dev` is npm 7+; older docs show the deprecated `--production` / `--only=prod`.',
        }),
      ),
      section('real-world', 'In a real backend',
        bullets(
          'Staging mirrors production config (`NODE_ENV=production`) with a separate `APP_ENV=staging` so bugs reproduce.',
          'Dev-only routes (e.g. `/debug/seed`) are mounted only when an explicit `ENABLE_DEV_ROUTES=true` flag is set — never by default.',
          'Pretty logging (`pino-pretty`) is a devDependency piped in only locally: `node app.js | pino-pretty`.',
        ),
      ),
      section('mistakes', 'Common mistakes',
        bullets(
          'Running `nodemon` or `ts-node` in production.',
          'Forgetting `NODE_ENV=production`, leaving Express templates uncached and stack traces exposed.',
          'Using `NODE_ENV=staging` — libraries only recognise `production`, so staging behaves like development.',
          'Sprinkling `if (NODE_ENV === ...)` everywhere instead of central config flags.',
        ),
        code({
          title: 'Wrong vs right',
          code: dedent(`
            // ❌ environment name drives behaviour all over the codebase
            if (process.env.NODE_ENV === 'staging') enableCache();

            // ✅ one explicit flag, read in the config module
            if (config.cache.enabled) enableCache();
          `),
          explanation: ['Feature flags describe *what* to do; environment names only describe *where* you are.'],
        }),
      ),
      section('interview', 'Interview angle',
        interviewTip('Say that `NODE_ENV` is a convention read by libraries, list two concrete effects (Express view cache + error output, npm skipping devDependencies) and mention `npm ci --omit=dev`.'),
      ),
      section('practice', 'Practice',
        steps(
          'Start an Express app with and without `NODE_ENV=production` and throw an error in a route — compare the responses.',
          'Run `npm ci --omit=dev` and check that `node_modules/.bin/tsc` is gone.',
          'Move every `NODE_ENV` check in a project into a single config module.',
        ),
      ),
      section('summary', 'Summary',
        bullets(
          '`NODE_ENV` is a convention; only `development`, `production`, `test`.',
          'Production: compiled code, runtime deps only, generic errors, JSON logs.',
          'Install with `npm ci --omit=dev`; start with plain `node`.',
          'Prefer explicit config flags over environment-name checks.',
        ),
      ),
    ],
    revisionNotes: [
      'Node core ignores NODE_ENV; Express, npm and many libs read it.',
      'Express in production: view cache on, no stack traces from the default error handler.',
      '`npm ci --omit=dev` → reproducible install without devDependencies.',
      'Use APP_ENV (or similar) for staging/preview — keep NODE_ENV=production there.',
      'Never run watchers (nodemon, --watch) in production.',
    ],
    quiz: [
      {
        kind: 'mcq', difficulty: 'beginner',
        prompt: 'Which statement about `NODE_ENV` is correct?',
        options: [
          'Node.js core enables optimisations when NODE_ENV=production',
          'It is a convention that libraries such as Express and npm read',
          'It must be set to "staging" on staging servers',
          'It is only used by browsers',
        ],
        answer: 1,
        explanation: 'Node itself ignores NODE_ENV; libraries choose to read it. "staging" is not recognised by libraries, so staging should still use NODE_ENV=production.',
      },
      {
        kind: 'scenario', difficulty: 'intermediate',
        prompt: 'Your Docker build sets `ENV NODE_ENV=production` at the top, then runs `npm ci` and `npm run build` (tsc). The build fails with "tsc: not found". Best fix?',
        options: [
          'Install TypeScript globally in the image',
          'Remove NODE_ENV entirely from the image',
          'Build in a stage with all dependencies, then install only runtime deps (`npm ci --omit=dev`) in the final stage',
          'Commit the dist folder to git',
        ],
        answer: 2,
        explanation: 'With NODE_ENV=production, npm skips devDependencies such as typescript. A multi-stage build keeps build tools in the builder stage and ships only runtime deps. Removing NODE_ENV would make the running app behave like development.',
      },
      {
        kind: 'mcq', difficulty: 'beginner',
        prompt: 'What does `npm ci --omit=dev` do?',
        options: [
          'Updates all packages to latest and skips tests',
          'Installs exactly the lockfile versions, excluding devDependencies',
          'Deletes package-lock.json and reinstalls',
          'Installs only devDependencies',
        ],
        answer: 1,
        explanation: '`npm ci` is the clean, lockfile-exact install; `--omit=dev` drops devDependencies. It never updates versions.',
      },
    ],
    interview: [
      {
        category: 'advanced', kind: 'concept', difficulty: 'beginner', topic: 'Production',
        question: 'What changes when you set NODE_ENV=production for an Express application?',
        shortAnswer: 'Node itself does nothing with it, but Express caches compiled views and its default error handler stops leaking stack traces, and npm skips devDependencies on install.',
        detailedAnswer: [
          'NODE_ENV is a convention read by libraries, not by the runtime.',
          'Express: `view cache` enabled, less verbose default error responses.',
          'npm: `npm ci`/`npm install` omit devDependencies when it is set.',
          'Other libraries may skip dev-only checks, improving performance.',
        ],
        followUp: 'How would you handle a staging environment?',
        trap: 'Claiming V8 or Node core runs faster because of NODE_ENV.',
      },
      {
        category: 'advanced', kind: 'scenario', difficulty: 'intermediate', topic: 'Production',
        question: 'A teammate wants NODE_ENV=staging on the staging server. What do you recommend and why?',
        shortAnswer: 'Keep NODE_ENV=production on staging so it behaves like production, and add a separate variable such as APP_ENV=staging for anything stage-specific.',
        detailedAnswer: [
          'Libraries only recognise `production`; anything else behaves like development.',
          'Staging exists to catch production-only bugs — it must use production behaviour.',
          'Stage-specific differences (URLs, feature flags) go into explicit config variables.',
          'Central config module maps env vars to typed flags.',
        ],
        followUp: 'Where would you keep the stage-specific values?',
        trap: 'Treating NODE_ENV as a free-form deployment name.',
      },
    ],
  },

  'environment-configuration': {
    summary: 'Keep configuration that varies between deploys in environment variables, load it once into a validated, typed config module, and fail fast on startup when something is missing.',
    topics: ['12-factor config', 'environment variables', '--env-file', 'config validation', 'zod', 'fail fast'],
    sections: [
      section('introduction', undefined,
        text('The same build must run on a laptop, in CI, on staging and in production. What differs — database URL, API keys, ports, feature flags — is **configuration**, and it must live outside the code.'),
      ),
      section('definition', 'The 12-factor rule',
        text('The **12-factor app** methodology says: store config in the environment. Config is everything likely to vary between deploys; code is everything that does not.'),
        bullets(
          'Config examples: `DATABASE_URL`, `REDIS_URL`, `PORT`, `JWT_SECRET`, `LOG_LEVEL`.',
          'Not config: route definitions, business rules, internal constants.',
          'Litmus test: could you open-source the repo right now without leaking a credential?',
        ),
      ),
      section('why', 'Why a config module',
        bullets(
          '`process.env` values are always **strings** (or `undefined`) — `"false"` is truthy.',
          'Reading `process.env.X` all over the codebase hides which settings exist.',
          'A missing variable should crash at boot, not at 3 a.m. when the first payment arrives.',
          'One module = one place to document, validate, type and default every setting.',
        ),
      ),
      section('internals', 'How environment variables reach Node',
        steps(
          'The parent process (shell, Docker, Kubernetes, systemd) passes an environment block when it spawns `node`.',
          'Node exposes it as `process.env` — a plain object of strings.',
          '`node --env-file=.env app.js` (Node 20.6+) loads a dotenv-style file before your code runs; real environment variables already set take precedence.',
          'The config module reads, coerces, validates and freezes values once at startup.',
        ),
        table('Ways to load a .env file', ['Approach', 'Notes'], [
          ['`node --env-file=.env`', 'Built in (Node 20.6+). `--env-file-if-exists` for optional files (Node 22.9+).'],
          ['`process.loadEnvFile()`', 'Programmatic loader in core (Node 21.7+ / 20.12+).'],
          ['`dotenv` package', 'Third-party; still common in older code.'],
          ['Platform-injected', 'Docker `env_file`/`-e`, Kubernetes Secrets/ConfigMaps, PaaS dashboards — the production norm.'],
        ]),
      ),
      section('visual', 'Config flow',
        flow(['Environment: shell / Docker / secret manager', 'process.env: strings only', 'config.ts: parse + validate + defaults', 'App: imports typed, frozen config'],
          { title: 'One entry point for configuration' }),
      ),
      section('example', 'A validated config module',
        code({
          title: 'src/config.ts (zod is third-party)',
          language: 'typescript',
          code: dedent(`
            import { z } from 'zod';

            const schema = z.object({
              NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
              PORT: z.coerce.number().int().positive().default(3000),
              DATABASE_URL: z.string().url(),
              JWT_SECRET: z.string().min(32),
              LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
              CACHE_ENABLED: z.enum(['true', 'false']).default('true').transform((v) => v === 'true'),
            });

            const parsed = schema.safeParse(process.env);
            if (!parsed.success) {
              console.error('Invalid configuration:', parsed.error.flatten().fieldErrors);
              process.exit(1); // fail fast at boot
            }

            export const config = Object.freeze(parsed.data);
          `),
          expectedOutput: "Invalid configuration: { DATABASE_URL: [ 'Required' ], JWT_SECRET: [ 'Required' ] }",
          explanation: [
            '`z.coerce.number()` turns the string `"8080"` into the number `8080`.',
            'Booleans are parsed explicitly — `"false"` would otherwise be truthy.',
            'Missing secrets stop the process before it accepts traffic (output shown when both are unset; exact wording depends on the zod version).',
            '`Object.freeze` prevents code from mutating config at runtime.',
          ],
        }),
        code({
          title: 'Loading a .env file without dotenv',
          language: 'bash',
          code: dedent(`
            # .env (git-ignored)
            # DATABASE_URL=postgres://app:app@localhost:5432/app
            # JWT_SECRET=dev-only-secret-at-least-32-characters

            node --env-file=.env dist/server.js
          `),
          expectedOutput: '{"level":30,"msg":"listening","port":3000}',
          explanation: [
            'The file is parsed before user code runs, so `config.ts` sees the values.',
            'Commit a `.env.example` with keys but fake values; never commit `.env`.',
          ],
          versionNote: '`--env-file` is available since Node 20.6.',
        }),
      ),
      section('real-world', 'In a real backend',
        bullets(
          'Production secrets come from a secret manager (AWS Secrets Manager, GCP Secret Manager, Vault) injected as env vars or mounted files.',
          'The config module also derives values (e.g. `isProd`) so the rest of the code never touches `process.env`.',
          'CI runs the app with a minimal test config to prove the schema is satisfiable.',
        ),
      ),
      section('mistakes', 'Common mistakes',
        code({
          title: 'Booleans from env vars',
          code: dedent(`
            // ❌ "false" is a non-empty string → truthy
            if (process.env.CACHE_ENABLED) enableCache();

            // ✅ parse explicitly, once, in config
            const cacheEnabled = process.env.CACHE_ENABLED === 'true';
          `),
          explanation: ['Environment values are strings; compare or coerce them deliberately.'],
        }),
        bullets(
          'Committing `.env` files or baking secrets into Docker images.',
          'Reading `process.env` lazily deep inside request handlers — failures appear late.',
          'Silent defaults for secrets (`JWT_SECRET || "secret"`).',
        ),
      ),
      section('interview', 'Interview angle',
        interviewTip('Mention 12-factor, that env vars are strings, a validated fail-fast config module, and that secrets are injected by the platform rather than stored in the image or repo.'),
      ),
      section('practice', 'Practice',
        text('Write a `config.js` that requires `DATABASE_URL`, coerces `PORT` to a number with default 3000, and exits with a clear message listing every missing key.'),
      ),
      section('summary', 'Summary',
        bullets(
          'Config varies per deploy → environment, not code.',
          'Validate and coerce once at boot; fail fast.',
          'Use `--env-file` locally (Node 20.6+); platform injection in production.',
          'Never commit secrets; ship a `.env.example`.',
        ),
      ),
    ],
    revisionNotes: [
      '12-factor: store config in the environment.',
      'process.env values are strings or undefined.',
      'Central config module: parse, validate, default, freeze; exit(1) on invalid config.',
      '`node --env-file=.env` (20.6+); real env vars win over file values.',
      'No default values for secrets.',
    ],
    quiz: [
      {
        kind: 'predict-output', difficulty: 'beginner',
        prompt: 'With `CACHE_ENABLED=false` in the environment, what does this print?',
        code: "if (process.env.CACHE_ENABLED) console.log('cache on');\nelse console.log('cache off');",
        options: ['cache off', 'cache on', 'undefined', 'It throws'],
        answer: 1,
        explanation: 'process.env.CACHE_ENABLED is the string "false", which is truthy. You must compare against "true" explicitly.',
      },
      {
        kind: 'mcq', difficulty: 'intermediate',
        prompt: 'Why should the config module call `process.exit(1)` when validation fails at startup?',
        options: [
          'To free memory faster',
          'So the orchestrator sees a failed deploy immediately instead of the app failing later on a real request',
          'Because Node requires it',
          'To restart the process with defaults',
        ],
        answer: 1,
        explanation: 'Failing fast surfaces misconfiguration during deploy, where it can be rolled back, rather than on the first request that touches the missing setting.',
      },
    ],
    interview: [
      {
        category: 'advanced', kind: 'concept', difficulty: 'beginner', topic: 'Configuration',
        question: 'What does the 12-factor app methodology say about configuration?',
        shortAnswer: 'Store anything that varies between deploys in environment variables, strictly separated from code, so the same build runs everywhere.',
        detailedAnswer: [
          'Config = DB URLs, credentials, hostnames, flags; code = logic.',
          'One build artifact promoted through environments.',
          'Env vars are language- and OS-agnostic and hard to commit by accident.',
          'Validate them at boot in a single config module.',
        ],
        followUp: 'How do secrets differ from ordinary config in production?',
        trap: 'Putting per-environment JSON config files with secrets into the repository.',
      },
      {
        category: 'advanced', kind: 'concept', difficulty: 'intermediate', topic: 'Configuration',
        question: 'How would you design a configuration module for a Node.js service?',
        shortAnswer: 'Read process.env once at startup, coerce and validate with a schema, apply safe defaults for non-secrets, freeze the result and exit on invalid config.',
        detailedAnswer: [
          'Schema (zod/envalid/joi) documents every setting and its type.',
          'Coerce strings into numbers/booleans explicitly.',
          'No defaults for secrets — missing means crash.',
          'Export a frozen typed object; the rest of the app never reads process.env.',
          'Locally use `--env-file`; in production the platform injects values.',
        ],
        followUp: 'How would you support rotating a secret without redeploying?',
        trap: 'Reading process.env inside request handlers, which delays failures and spreads config everywhere.',
      },
    ],
  },

  'production-builds': {
    summary: 'A production build turns source (often TypeScript) into plain JavaScript in `dist/`, optionally bundles it, emits source maps, and is started with `node --enable-source-maps` so stack traces point to the original code.',
    topics: ['tsc', 'outDir', 'esbuild', 'bundling', 'source maps', '--enable-source-maps', 'build artifact'],
    sections: [
      section('introduction', undefined,
        text('`tsx src/server.ts` is great in development, but compiling on every start in production wastes CPU and memory and adds a dev tool to the runtime. Production runs pre-built JavaScript.'),
      ),
      section('definition', 'What a build produces',
        bullets(
          '**Compiled output**: `.ts` → `.js` in `dist/` using `tsc` (type-checks and emits).',
          '**Optional bundle**: one file with dependencies inlined using a bundler such as esbuild (third-party).',
          '**Source maps** (`.js.map`): map compiled lines back to original `.ts` lines.',
          'The **artifact** (dist + package.json + lockfile, or a Docker image) is built once and promoted through environments.',
        ),
      ),
      section('why', 'Why build ahead of time',
        table('Runtime transpile vs pre-built', ['', 'tsx / ts-node at runtime', 'Pre-built dist/'], [
          ['Startup', 'Slower (compile on load)', 'Fast'],
          ['Runtime deps', 'Needs TypeScript tooling', 'Only production deps'],
          ['Type errors', 'Not checked (tsx strips types)', '`tsc` fails the build'],
          ['Reproducibility', 'Depends on runtime tool versions', 'Same artifact everywhere'],
        ]),
        note('Node 22.6+ can strip TypeScript types natively (`--experimental-strip-types`, unflagged by default in Node 23.6+/22.18+), but it does not type-check and supports only erasable syntax — CI still runs `tsc --noEmit`.'),
      ),
      section('internals', 'How source maps work',
        steps(
          '`tsc` with `"sourceMap": true` writes `server.js` and `server.js.map`, and appends `//# sourceMappingURL=server.js.map`.',
          'When an error is thrown, V8 records positions in the *compiled* file.',
          'With `node --enable-source-maps`, Node reads the map and rewrites `error.stack` to original file/line/column.',
          'Without the flag you see `dist/server.js:57:13` — hard to correlate with source.',
        ),
        warn('Source-map rewriting has a cost when building stack traces. It is fine for typical error volumes; if you generate huge numbers of errors per second, measure it.'),
      ),
      section('visual', 'Build pipeline',
        flow(['src/*.ts', 'tsc --noEmit: type check', 'tsc or esbuild: emit dist/*.js + .map', 'npm ci --omit=dev', 'node --enable-source-maps dist/server.js'],
          { title: 'From source to running artifact', direction: 'horizontal' }),
      ),
      section('example', 'tsconfig and scripts',
        code({
          title: 'tsconfig.build.json',
          language: 'json',
          code: dedent(`
            {
              "compilerOptions": {
                "target": "ES2022",
                "module": "NodeNext",
                "moduleResolution": "NodeNext",
                "outDir": "dist",
                "rootDir": "src",
                "sourceMap": true,
                "strict": true,
                "skipLibCheck": true
              },
              "include": ["src"],
              "exclude": ["**/*.test.ts"]
            }
          `),
          explanation: [
            '`rootDir`/`outDir` mirror `src/` into `dist/`.',
            '`NodeNext` matches how Node resolves CommonJS/ESM based on package.json `type`.',
            'Tests are excluded from the production output.',
          ],
        }),
        code({
          title: 'package.json scripts + run',
          language: 'bash',
          code: dedent(`
            # "build": "tsc -p tsconfig.build.json"
            # "start": "node --enable-source-maps dist/server.js"
            npm run build && npm start
          `),
          expectedOutput: dedent(`
            > tsc -p tsconfig.build.json
            > node --enable-source-maps dist/server.js
            listening on :3000
          `),
          explanation: [
            'Build once, then start plain Node.',
            'Errors now report `src/server.ts:42:11` instead of compiled positions.',
          ],
        }),
        code({
          title: 'Optional: bundle with esbuild (third-party)',
          language: 'bash',
          code: 'npx esbuild src/server.ts --bundle --platform=node --target=node22 --sourcemap --outfile=dist/server.js --packages=external',
          expectedOutput: '  dist/server.js      12.4kb\n  dist/server.js.map  25.1kb\n\n⚡ Done in 18ms',
          explanation: [
            'esbuild transpiles very fast but does **not** type-check — keep `tsc --noEmit` in CI.',
            '`--packages=external` leaves node_modules out of the bundle (safer for native modules).',
            'Bundling helps serverless cold starts; for long-running containers plain `tsc` is usually enough.',
          ],
        }),
      ),
      section('real-world', 'In a real backend',
        bullets(
          'CI runs lint → `tsc --noEmit` → tests → build → Docker image containing only `dist/` and production deps.',
          'Source maps are kept in the image (server-side only) or uploaded to an error tracker such as Sentry.',
          'The same image tag is deployed to staging and production — never rebuilt per environment.',
        ),
      ),
      section('mistakes', 'Common mistakes',
        bullets(
          'Running `ts-node`/`tsx` in production containers.',
          'Assuming esbuild/swc catch type errors.',
          'Forgetting `--enable-source-maps`, then debugging compiled line numbers.',
          'Rebuilding separately for staging and production, so what you tested is not what you ship.',
        ),
        code({
          title: 'Wrong vs right start command',
          language: 'bash',
          code: dedent(`
            # ❌ compiles on every boot, needs dev deps
            CMD npx ts-node src/server.ts
            # ✅ pre-built JS, exec form
            CMD ["node", "--enable-source-maps", "dist/server.js"]
          `),
          explanation: ['The right version starts faster and needs only runtime dependencies.'],
        }),
      ),
      section('interview', 'Interview angle',
        interviewTip('Distinguish type-checking (`tsc`) from transpiling (esbuild/swc/tsx), and explain "build once, deploy many" plus source maps with `--enable-source-maps`.'),
      ),
      section('practice', 'Practice',
        steps(
          'Add `sourceMap: true`, build, throw an error in a route and compare stack traces with and without `--enable-source-maps`.',
          'Bundle the same app with esbuild and compare startup time and output size.',
        ),
      ),
      section('summary', 'Summary',
        bullets(
          'Production runs compiled JS from `dist/`.',
          '`tsc` type-checks; esbuild/swc only transpile.',
          'Emit source maps and start with `node --enable-source-maps`.',
          'Build once; promote the same artifact.',
        ),
      ),
    ],
    revisionNotes: [
      'tsc = type-check + emit; esbuild/swc/tsx = transpile only.',
      'sourceMap: true + node --enable-source-maps → original TS lines in stack traces.',
      'Build once, deploy the same artifact to every environment.',
      'Bundle mainly for serverless/cold start; --packages=external for native deps.',
      'Native type stripping in recent Node still does not type-check.',
    ],
    quiz: [
      {
        kind: 'mcq', difficulty: 'intermediate',
        prompt: 'Which tool in this list type-checks your TypeScript?',
        options: ['esbuild', 'tsx', 'tsc', 'node --experimental-strip-types'],
        answer: 2,
        explanation: 'Only tsc performs type checking. esbuild, tsx and Node type stripping just remove types and emit JavaScript.',
      },
      {
        kind: 'scenario', difficulty: 'intermediate',
        prompt: 'Production errors show `at dist/server.js:1:48211`. The build uses esbuild with `--sourcemap`. What is the quickest fix?',
        options: [
          'Disable minification and redeploy',
          'Start Node with `--enable-source-maps`',
          'Switch to ts-node in production',
          'Add console.log calls around the failing code',
        ],
        answer: 1,
        explanation: 'The maps exist; Node just is not applying them. --enable-source-maps rewrites stack traces using them. ts-node in production fixes the symptom at a large runtime cost.',
      },
    ],
    interview: [
      {
        category: 'advanced', kind: 'concept', difficulty: 'intermediate', topic: 'Builds',
        question: 'Why should a production Node service run compiled JavaScript instead of ts-node or tsx?',
        shortAnswer: 'Pre-built JS starts faster, needs no TypeScript tooling at runtime, is type-checked at build time, and is the exact artifact you tested.',
        detailedAnswer: [
          'Runtime transpilers add startup latency and memory.',
          'They bring devDependencies into the runtime image.',
          'tsx strips types without checking them.',
          'Build once, deploy many: identical artifact across environments.',
        ],
        followUp: 'How do you keep useful stack traces after compilation?',
        trap: 'Saying "TypeScript runs in Node natively so there is no need to build" — native stripping does not type-check and does not support all syntax.',
      },
      {
        category: 'advanced', kind: 'concept', difficulty: 'advanced', topic: 'Builds',
        question: 'How do source maps work in Node.js, and what are the trade-offs of enabling them in production?',
        shortAnswer: 'The compiler emits .map files linking output positions to source; with --enable-source-maps Node rewrites error.stack to original locations, at some extra cost when stacks are generated.',
        detailedAnswer: [
          'Map file contains VLQ-encoded mappings from generated to original line/column.',
          '`//# sourceMappingURL` comment tells Node where to find it.',
          'Node loads maps for modules and applies them when formatting stack traces.',
          'Costs: memory for parsed maps and slower stack trace generation — measurable only with very high error rates.',
          'Alternative: upload maps to an error tracker and keep stacks raw on the server.',
        ],
        followUp: 'Would you ship source maps to browsers for a backend service? Why does it differ?',
        trap: 'Thinking source maps change how code executes — they only affect stack trace formatting.',
      },
    ],
  },
};

export default content;
