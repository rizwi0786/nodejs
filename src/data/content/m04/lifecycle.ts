import type { ModuleContent } from '../../../types';
import { bullets, code, dedent, flow, interviewTip, section, steps, table, text, warn } from '../helpers';

const content: Partial<ModuleContent> = {
  'installing-packages': {
    summary: '`npm install` installs everything in package.json; `npm install <spec>` adds a package by name, version, range, dist-tag, git URL or local path, saving to dependencies (default), -D, -O or with -E for an exact version.',
    topics: ['npm install', 'npm i', '--save-exact', '-D', 'dist-tags', 'git dependencies', 'file: dependencies', '--ignore-scripts', 'workspaces'],
    sections: [
      section('introduction', undefined,
        text("`npm install` does two jobs: install the whole project from its manifest, or add a new package and record it."),
      ),
      section('definition', 'Install forms',
        table('npm install specs', ['Command', 'Result'], [
          ['`npm install` (or `npm i`)', 'Install everything from package.json + lockfile'],
          ['`npm i zod`', 'Latest dist-tag, saved as `^x.y.z` in dependencies'],
          ['`npm i zod@3.23.8`', 'Exact version (saved as `^3.23.8` unless `-E`)'],
          ['`npm i zod@"^3.20"`', 'Highest version matching the range'],
          ['`npm i next@canary`', 'Version pointed to by a dist-tag'],
          ['`npm i -E zod`', 'Save an exact version (`3.23.8`)'],
          ['`npm i -D vitest`', 'devDependencies'],
          ['`npm i -O fsevents`', 'optionalDependencies'],
          ['`npm i github:user/repo#v1.2.0`', 'From a git repository at a tag/commit'],
          ['`npm i ../shared-lib`', 'Local folder, saved as `file:../shared-lib` (symlinked)'],
          ['`npm i -w packages/api zod`', 'Into one workspace of a monorepo'],
        ]),
      ),
      section('why', 'Why the options matter',
        bullets(
          "Exact vs range controls how much drift you allow.",
          "Git and file specs let you test unpublished code.",
          "Workspaces keep monorepo installs in one lockfile.",
        ),
      ),
      section('internals', 'What changes on disk',
        steps(
          "package.json gets the new entry (with the save prefix `^` unless `-E` or `save-exact=true`).",
          "The tree is re-resolved; new packages and transitive deps are fetched and verified.",
          "node_modules is updated, `.bin` links created.",
          "Dependency lifecycle scripts (`preinstall`, `install`, `postinstall`) run.",
          "package-lock.json is rewritten; an audit summary prints.",
        ),
      ),
      section('example', 'Adding packages',
        code({
          title: 'Install with different specs',
          language: 'bash',
          code: dedent(`
            npm install fastify
            npm install -E pino@9.5.0
            npm install -D @types/node
          `),
          expectedOutput: "added 47 packages, and audited 48 packages in 3s\n\n14 packages are looking for funding\n  run `npm fund` for details\n\nfound 0 vulnerabilities\n\nadded 1 package, changed 0 packages, and audited 49 packages in 1s\n\nfound 0 vulnerabilities\n\nadded 2 packages, and audited 51 packages in 1s\n\nfound 0 vulnerabilities",
          explanation: [
            "Each install reports added packages and runs an automatic audit.",
            "`fastify` is saved as `^5.x.y`; `pino` as exactly `9.5.0`.",
            "Counts vary by version.",
          ],
        }),
        code({
          title: 'Project-level defaults (.npmrc)',
          language: 'text',
          code: dedent(`
            save-exact=true
            engine-strict=true
            fund=false
          `),
          explanation: [
            "`save-exact` pins every new dependency.",
            "`engine-strict` turns `engines` mismatches into errors.",
            "`fund=false` hides funding messages.",
          ],
        }),
      ),
      section('real-world', 'Real-world usage',
        bullets(
          "Security-conscious CI: `npm ci --ignore-scripts` then run only trusted build scripts explicitly.",
          "Testing a fix from a fork: `npm i github:you/lib#fix-branch` temporarily.",
          "Monorepo: `npm i -w apps/web react` installs into one workspace.",
        ),
      ),
      section('mistakes', 'Common mistakes',
        bullets(
          "`npm install` in CI instead of `npm ci`.",
          "Typosquatting: `npm i expresss` installs whatever that name is. Double-check names.",
          "Leaving `file:` or git dependencies in production apps.",
        ),
        warn("Installing runs the package's lifecycle scripts with your permissions. `--ignore-scripts` blocks them (some native packages then need an explicit rebuild)."),
      ),
      section('interview', 'Interview angle',
        interviewTip("Know the save flags (-D, -E, -O, -g) and that npm ≥5 saves by default."),
      ),
      section('practice', 'Practice',
        text("Install a package with `-E`, another without, and diff package.json. Then install a dist-tag (e.g. `typescript@next`) and check the saved range."),
      ),
      section('summary', 'Summary',
        bullets(
          "`npm i` installs all; `npm i x` adds x.",
          "Specs: version, range, tag, git, file.",
          "-D dev, -E exact, -O optional, -g global, -w workspace.",
          "Lifecycle scripts run during install.",
        ),
      ),
    ],
    revisionNotes: [
      "npm i = npm install; saves by default (npm 5+).",
      "-E/--save-exact pins exactly.",
      "pkg@tag installs a dist-tag.",
      "--ignore-scripts blocks lifecycle scripts.",
    ],
    quiz: [
      {
        kind: 'mcq', difficulty: 'beginner',
        prompt: 'What is saved to package.json after `npm install --save-exact uuid` (latest is 11.0.3)?',
        options: ["\"uuid\": \"11.0.3\"","\"uuid\": \"~11.0.3\"","\"uuid\": \"^11.0.3\"","\"uuid\": \"latest\""],
        answer: 0,
        explanation: "--save-exact writes the version without a prefix. Without it, npm writes ^11.0.3.",
      },
      {
        kind: 'mcq', difficulty: 'intermediate',
        prompt: 'What does `npm install ../shared-utils` record in package.json?',
        options: ["\"shared-utils\": \"^1.0.0\"","\"shared-utils\": \"link:../shared-utils\"","Nothing — local installs are not saved","\"shared-utils\": \"file:../shared-utils\""],
        answer: 3,
        explanation: "npm saves a file: spec and symlinks the folder into node_modules. link: is a pnpm/Yarn protocol.",
      },
    ],
    interview: [
      {
        category: 'nodejs', kind: 'concept', difficulty: 'beginner', topic: 'Installing',
        question: 'What does npm install --save-exact do, and why might a team prefer it?',
        shortAnswer: 'It records the exact installed version (e.g. 3.23.8) instead of a caret range, so package.json itself pins the version; teams use it with automated update bots to make every change explicit.',
        detailedAnswer: [
          "Shorthand `-E`; project-wide via `save-exact=true` in .npmrc.",
          "The lockfile already pins versions, so the benefit is clarity in package.json.",
          "Ranges are still useful in libraries to allow deduplication.",
        ],
      },
    ],
  },

  'updating-packages': {
    summary: '`npm outdated` shows current/wanted/latest versions; `npm update` upgrades within your ranges and updates the lockfile; major upgrades need `npm install pkg@latest`; `overrides` forces versions of nested dependencies.',
    topics: ['npm outdated', 'npm update', 'wanted vs latest', 'major upgrades', 'overrides', 'npm-check-updates', 'Renovate', 'Dependabot'],
    sections: [
      section('introduction', undefined,
        text("Dependencies age quickly. Updating safely means knowing which updates your ranges already allow and which require deliberate, tested upgrades."),
      ),
      section('definition', 'Commands',
        table('Update tools', ['Command', 'Effect'], [
          ['`npm outdated`', 'Report Current, Wanted (max in range) and Latest'],
          ['`npm update`', 'Upgrade to Wanted; updates lockfile and node_modules (not package.json ranges by default)'],
          ['`npm update --save`', 'Also bumps the ranges in package.json'],
          ['`npm install pkg@latest`', 'Major upgrade; rewrites the range'],
          ['`npx npm-check-updates -u`', 'Third-party: rewrite all ranges to latest, then `npm install`'],
          ['`overrides` field', 'Force a version of a transitive dependency'],
        ]),
      ),
      section('why', 'Why staged updates',
        bullets(
          "Patch/minor updates are usually safe and bring security fixes.",
          "Major updates may break APIs — read changelogs and migrate one at a time.",
          "Bots (Renovate, Dependabot) open small PRs that CI can verify.",
        ),
      ),
      section('internals', 'Wanted vs Latest',
        flow(['package.json: "express": "^4.19.0"', 'Current (lockfile): 4.19.2', 'Wanted (max in ^4): 4.21.2', 'Latest (dist-tag): 5.1.0'], { title: 'npm outdated columns', direction: 'horizontal' }),
        bullets(
          "`npm update` moves Current → Wanted.",
          "Reaching Latest across a major needs `npm install express@5` (or `@latest`).",
          "`overrides` (npm 8.3+) replaces versions anywhere in the tree; nested keys target a path: `{ \"foo\": { \"bar\": \"1.0.2\" } }`.",
          "Use `$name` to make an override follow your direct dependency’s range: `\"react\": \"$react\"`.",
        ),
      ),
      section('example', 'Checking and updating',
        code({
          title: 'npm outdated / update',
          language: 'bash',
          code: dedent(`
            npm outdated
            npm update
            npm install express@latest
          `),
          expectedOutput: "Package   Current   Wanted  Latest  Location               Depended by\nexpress    4.19.2   4.21.2   5.1.0  node_modules/express   my-api\nzod        3.22.4   3.23.8  3.23.8  node_modules/zod       my-api\n\nchanged 9 packages, and audited 120 packages in 2s\n\nfound 0 vulnerabilities\n\nadded 6 packages, removed 4 packages, changed 22 packages, and audited 122 packages in 3s\n\nfound 0 vulnerabilities",
          explanation: [
            "`npm update` moved express to 4.21.2 and zod to 3.23.8 (Wanted).",
            "The major upgrade to Express 5 required an explicit install, which rewrote the range to `^5.1.0`.",
          ],
        }),
        code({
          title: 'Forcing a patched transitive dependency',
          language: 'json',
          code: dedent(`
            {
              "dependencies": { "some-sdk": "^2.4.0" },
              "overrides": {
                "cross-spawn": "^7.0.5",
                "some-sdk": {
                  "axios": "1.7.9"
                }
              }
            }
          `),
          explanation: [
            "Every `cross-spawn` in the tree resolves to `^7.0.5` (e.g. to pick up a security fix).",
            "Only the `axios` under `some-sdk` is forced to 1.7.9.",
            "Run `npm install` after editing; verify with `npm ls cross-spawn`.",
            "`overrides` is npm-specific; Yarn uses `resolutions`, pnpm uses `pnpm.overrides`.",
          ],
        }),
      ),
      section('real-world', 'Real-world workflow',
        steps(
          "Enable Renovate/Dependabot with grouped minor/patch PRs.",
          "Run tests + `npm audit` in CI on every update PR.",
          "Schedule majors: read the migration guide, upgrade one package per PR.",
          "Remove overrides once upstream packages release a fix.",
        ),
      ),
      section('mistakes', 'Common mistakes',
        bullets(
          "Running `npx npm-check-updates -u` across dozens of majors in one commit.",
          "Expecting `npm update` to cross a major version.",
          "Leaving stale overrides that later pin a vulnerable version.",
        ),
      ),
      section('interview', 'Interview angle',
        interviewTip("Explain Wanted vs Latest and show you know `overrides` for transitive security fixes."),
      ),
      section('practice', 'Practice',
        text("Install an old version (`npm i express@4.17.0`), run `npm outdated`, `npm update`, then upgrade to the latest major and compare package.json diffs."),
      ),
      section('summary', 'Summary',
        bullets(
          "`outdated` reports; `update` stays within ranges.",
          "Majors need explicit installs and testing.",
          "`overrides` forces nested versions (npm 8.3+).",
          "Automate with bots + CI.",
        ),
      ),
    ],
    revisionNotes: [
      "Wanted = max satisfying range; Latest = latest dist-tag.",
      "npm update does not cross majors.",
      "npm update --save bumps ranges in package.json.",
      "overrides: npm 8.3+, nested keys scope to a path, $name references a direct dep.",
    ],
    quiz: [
      {
        kind: 'predict-output', difficulty: 'intermediate',
        prompt: 'package.json has "lodash": "^4.17.0"; installed 4.17.15; latest 4.17.21. After `npm update`, which version is installed?',
        options: ["4.17.15","5.0.0","4.17.21","It removes lodash"],
        answer: 2,
        explanation: "4.17.21 satisfies ^4.17.0, so it is the Wanted version that npm update installs.",
      },
      {
        kind: 'scenario', difficulty: 'intermediate',
        prompt: 'A vulnerability is in `minimist`, required by a package you depend on, which has not released a fix. What is the cleanest stopgap?',
        options: ['Edit node_modules/minimist by hand', 'Add an `overrides` entry forcing a patched minimist version, then npm install and run tests', 'Run npm audit fix --force', 'Delete package-lock.json'],
        answer: 1,
        explanation: "overrides changes the resolved version across the tree in a tracked, reproducible way. Editing node_modules is lost on reinstall; --force may jump majors of other packages.",
      },
    ],
    interview: [
      {
        category: 'nodejs', kind: 'concept', difficulty: 'intermediate', topic: 'Updating',
        question: 'What is the difference between npm outdated and npm update?',
        shortAnswer: 'npm outdated only reports each package’s current, wanted (highest in range) and latest versions; npm update actually installs the wanted versions and updates the lockfile, without crossing major boundaries.',
        detailedAnswer: [
          "Wanted is bounded by your package.json range.",
          "By default npm update leaves package.json ranges untouched; `--save` bumps them.",
          "Major upgrades need `npm install pkg@latest`.",
          "Red rows in outdated = update available within range.",
        ],
      },
      {
        category: 'nodejs', kind: 'scenario', difficulty: 'intermediate', topic: 'Updating',
        question: 'How do you force a vulnerable transitive dependency to a fixed version with npm?',
        shortAnswer: 'Add an overrides entry in the root package.json (npm 8.3+) pointing that package to a patched version, reinstall, verify with npm ls, and remove the override once the parent package ships a fix.',
        detailedAnswer: [
          "Global form: `\"overrides\": { \"pkg\": \"^1.2.4\" }`.",
          "Scoped form: `{ \"parent\": { \"pkg\": \"1.2.4\" } }`.",
          "Only the root project's overrides apply.",
          "Test carefully — the parent was not tested against that version.",
        ],
        trap: "Thinking overrides in a library are honoured by its consumers.",
      },
    ],
  },

  'removing-packages': {
    summary: '`npm uninstall <pkg>` (aliases rm, remove, un) removes a package from node_modules, package.json and the lockfile; `npm prune` removes extraneous packages; `-g` removes global ones.',
    topics: ['npm uninstall', 'npm rm', 'npm prune', 'extraneous packages', 'global uninstall', 'depcheck'],
    sections: [
      section('introduction', undefined,
        text("Unused dependencies cost install time, image size and security exposure. Removing them is a small habit with big payoff."),
      ),
      section('definition', 'Commands',
        table('Removal commands', ['Command', 'Effect'], [
          ['`npm uninstall lodash`', 'Remove from node_modules, package.json and lockfile'],
          ['`npm uninstall -D jest`', 'Same (the flag is optional; npm finds the right list)'],
          ['`npm uninstall -g typescript`', 'Remove a global package'],
          ['`npm prune`', 'Remove extraneous packages not in package.json'],
          ['`npm prune --omit=dev`', 'Remove devDependencies from an existing node_modules'],
        ]),
      ),
      section('why', 'Why bother',
        bullets(
          "Fewer packages → fewer vulnerabilities in `npm audit`.",
          "Smaller Docker images and faster CI.",
          "Clearer package.json for teammates.",
        ),
      ),
      section('internals', 'What happens',
        steps(
          "npm removes the entry from package.json.",
          "Arborist recomputes the tree; transitive deps no longer needed are removed too.",
          "The lockfile is rewritten and `.bin` links removed.",
        ),
      ),
      section('example', 'Removing a dependency',
        code({
          title: 'Uninstall and verify',
          language: 'bash',
          code: dedent(`
            npm uninstall moment
            npm ls moment
          `),
          expectedOutput: "removed 1 package, and audited 119 packages in 1s\n\nfound 0 vulnerabilities\nmy-api@1.0.0 /home/ada/my-api\n└── (empty)",
          explanation: [
            "`npm ls moment` showing `(empty)` confirms nothing else depends on it.",
            "If another package still needs it, it remains as a transitive dependency.",
          ],
        }),
        code({
          title: 'Finding unused dependencies',
          language: 'bash',
          code: dedent(`
            npx depcheck
          `),
          expectedOutput: "Unused dependencies\n* lodash\nUnused devDependencies\n* @types/jest\nMissing dependencies\n* dotenv: ./src/config.js",
          explanation: [
            "depcheck (third-party) scans imports vs package.json.",
            "'Missing' entries are phantom dependencies you import without declaring.",
            "Verify results manually — dynamic requires and config-file plugins can be false positives.",
          ],
        }),
      ),
      section('real-world', 'Real-world usage',
        bullets(
          "Quarterly dependency clean-ups with depcheck or knip.",
          "When replacing a library (moment → date-fns/Temporal), uninstall the old one in the same PR.",
        ),
      ),
      section('mistakes', 'Common mistakes',
        bullets(
          "Deleting the folder from node_modules manually — package.json and lockfile still list it.",
          "Editing package.json by hand and forgetting to run `npm install` → lockfile out of sync and `npm ci` fails.",
        ),
      ),
      section('interview', 'Interview angle',
        interviewTip("A light question — mention that uninstall updates both package.json and the lockfile, and `npm prune`."),
      ),
      section('practice', 'Practice',
        text("Run depcheck on a project, uninstall one unused package, and confirm `npm ci` still succeeds and tests pass."),
      ),
      section('summary', 'Summary',
        bullets(
          "`npm uninstall` updates node_modules, package.json and lockfile.",
          "`npm prune` removes extraneous packages.",
          "Find unused deps with depcheck/knip.",
        ),
      ),
    ],
    revisionNotes: [
      "Aliases: uninstall, rm, remove, un, r.",
      "-g for global packages.",
      "npm prune removes extraneous packages.",
      "Never delete from node_modules by hand.",
    ],
    quiz: [
      {
        kind: 'mcq', difficulty: 'beginner',
        prompt: 'What does `npm uninstall axios` change?',
        options: ["node_modules, package.json and package-lock.json","node_modules and package.json, not the lockfile","Only node_modules","Only package-lock.json"],
        answer: 0,
        explanation: "Uninstall keeps all three in sync, so a later `npm ci` works.",
      },
      {
        kind: 'find-bug', difficulty: 'beginner',
        prompt: 'A developer removed "chalk" from package.json by hand and pushed. CI now fails. Why?',
        code: "# CI\nnpm ci",
        options: ["chalk is required by npm itself","npm ci needs --force after removals","CI caches chalk globally","package-lock.json still lists chalk, so it is out of sync with package.json and npm ci fails"],
        answer: 3,
        explanation: "Manual edits leave the lockfile stale. Use `npm uninstall chalk` (or run `npm install`) and commit both files.",
      },
    ],
    interview: [
      {
        category: 'nodejs', kind: 'concept', difficulty: 'beginner', topic: 'Removing packages',
        question: 'How do you remove a package correctly, and what does npm change?',
        shortAnswer: 'Run npm uninstall <pkg>: npm removes it (and any transitive packages no longer needed) from node_modules, deletes it from package.json and updates package-lock.json.',
        detailedAnswer: [
          "Add `-g` for global packages.",
          "`npm prune` removes anything extraneous.",
          "Commit both package.json and the lockfile.",
        ],
      },
    ],
  },

  'npm-scripts': {
    summary: 'The `scripts` field defines commands run with `npm run <name>`; npm adds node_modules/.bin to PATH, supports pre/post hooks and lifecycle scripts (install, prepare, prepublishOnly), and passes extra args after `--`.',
    topics: ['npm run', 'scripts', 'pre/post hooks', 'lifecycle scripts', 'postinstall', 'prepare', 'node_modules/.bin', 'npm_lifecycle_event', 'cross-env', 'node --run'],
    sections: [
      section('introduction', undefined,
        text("Scripts give a project a standard command vocabulary — `npm run dev`, `npm test`, `npm run build` — that works the same on every machine and in CI."),
      ),
      section('definition', 'Scripts and shortcuts',
        table('Running scripts', ['Command', 'Runs'], [
          ['`npm run build`', '`scripts.build`'],
          ['`npm test` / `npm t`', '`scripts.test`'],
          ['`npm start`', '`scripts.start` (defaults to `node server.js` if absent and the file exists)'],
          ['`npm run`', 'Lists all scripts'],
          ['`npm run test -- --watch`', 'Passes `--watch` to the script'],
          ['`npm run lint --workspaces`', 'Run in every workspace'],
          ['`node --run build`', 'Node 22+: run a script directly, faster, no pre/post hooks'],
        ]),
      ),
      section('why', 'Why scripts',
        bullets(
          "Local tool versions: `node_modules/.bin` is on PATH, so `vitest` means *the project's* vitest.",
          "Onboarding: `npm install && npm run dev` is self-documenting.",
          "CI calls the same commands developers use.",
        ),
      ),
      section('internals', 'How npm runs a script',
        steps(
          "npm finds `scripts.<name>`; if `pre<name>` exists it runs first.",
          "It spawns a shell (`sh` on Unix, `cmd.exe` on Windows by default; configurable via `script-shell`).",
          "PATH is prefixed with `node_modules/.bin` (of the package and its ancestors).",
          "Env vars are injected: `npm_lifecycle_event`, `npm_package_name`, `npm_package_version`, `npm_config_*`.",
          "If it exits non-zero, npm stops and exits non-zero; otherwise `post<name>` runs.",
        ),
        table('Lifecycle scripts', ['Script', 'When it runs'], [
          ['`preinstall` / `install` / `postinstall`', 'When the package is installed (including as someone else’s dependency)'],
          ['`prepare`', 'After local `npm install` and before `npm pack`/`publish`; also for git dependencies'],
          ['`prepublishOnly`', 'Only before `npm publish`'],
          ['`prepack` / `postpack`', 'Around tarball creation'],
          ['`pretest`, `postbuild`, …', 'Automatic pre/post hooks for any script name'],
        ]),
      ),
      section('example', 'A typical scripts block',
        code({
          title: 'package.json scripts',
          language: 'json',
          code: dedent(`
            {
              "scripts": {
                "dev": "node --watch --env-file=.env src/server.js",
                "start": "node src/server.js",
                "lint": "eslint .",
                "pretest": "npm run lint",
                "test": "node --test",
                "build": "tsc -p tsconfig.json",
                "prepare": "husky",
                "show": "echo $npm_package_name@$npm_package_version is running $npm_lifecycle_event"
              }
            }
          `),
          explanation: [
            "`npm test` runs `pretest` (lint) first, then the test runner.",
            "`eslint` and `tsc` resolve from `node_modules/.bin` — no global installs.",
            "`prepare` installs git hooks after `npm install` in the repo.",
            "`$npm_package_name` uses Unix shell syntax; on Windows cmd it would be `%npm_package_name%`.",
          ],
        }),
        code({
          title: 'Running them',
          language: 'bash',
          code: dedent(`
            npm run show
            npm test -- --test-reporter=dot
          `),
          expectedOutput: "\n> my-api@1.0.0 show\n> echo $npm_package_name@$npm_package_version is running $npm_lifecycle_event\n\nmy-api@1.0.0 is running show\n\n> my-api@1.0.0 pretest\n> npm run lint\n\n> my-api@1.0.0 lint\n> eslint .\n\n> my-api@1.0.0 test\n> node --test --test-reporter=dot\n\n......\n",
          explanation: [
            "npm echoes each script before running it.",
            "Args after `--` are appended to the command (`--test-reporter=dot`).",
            "`pretest` → `lint` → `test` order is automatic.",
          ],
        }),
      ),
      section('real-world', 'Real-world usage',
        bullets(
          "Cross-platform env vars: `cross-env NODE_ENV=test` (third-party) or set them in code / `--env-file`.",
          "Run tasks in parallel with `npm-run-all2` / `concurrently` (third-party).",
          "Supply-chain hardening: `npm ci --ignore-scripts` in CI, then run needed build steps explicitly.",
        ),
      ),
      section('mistakes', 'Common mistakes',
        bullets(
          "Unix-only syntax (`rm -rf`, `VAR=x cmd`) breaks Windows teammates — use `rimraf`, `cross-env` or Node scripts.",
          "Forgetting `--` so flags go to npm instead of the script.",
          "Heavy `postinstall` scripts in libraries — they run on every consumer's install.",
        ),
        warn("Dependency `preinstall`/`install`/`postinstall` scripts execute arbitrary code at install time. Many supply-chain attacks use them. Review new packages and consider `--ignore-scripts`."),
      ),
      section('interview', 'Interview angle',
        interviewTip("Mention `.bin` on PATH, pre/post hooks, `--` for args, and the security angle of install scripts."),
      ),
      section('practice', 'Practice',
        text("Add `prebuild` (clean dist), `build` and `postbuild` (print size) scripts. Run `npm run build` and observe the order. Then try `node --run build` and note which hooks run."),
      ),
      section('summary', 'Summary',
        bullets(
          "`npm run <name>`; shortcuts for start/test.",
          "`.bin` on PATH; env vars `npm_package_*`, `npm_lifecycle_event`.",
          "pre/post hooks run automatically.",
          "Lifecycle scripts run at install/publish time — a security surface.",
        ),
      ),
    ],
    revisionNotes: [
      "node_modules/.bin added to PATH.",
      "preX / postX run around X.",
      "Args after -- go to the script.",
      "prepare runs after local install and before pack/publish.",
      "prepublishOnly runs only on publish.",
      "node --run (Node 22) skips pre/post hooks.",
    ],
    quiz: [
      {
        kind: 'predict-output', difficulty: 'intermediate',
        prompt: 'Given these scripts, what order runs on `npm run build`?',
        code: '"scripts": {\n  "prebuild": "echo clean",\n  "build": "echo compile",\n  "postbuild": "echo done"\n}',
        options: ["compile","compile, done","clean, compile, done","done, compile, clean"],
        answer: 2,
        explanation: "npm automatically runs pre<name> before and post<name> after a script.",
      },
      {
        kind: 'complete-code', difficulty: 'beginner',
        prompt: 'How do you pass `--watch` to the test runner through npm?',
        code: 'npm test /* ??? */',
        options: ['--watch', '-- --watch', '--script=--watch', '+watch'],
        answer: 1,
        explanation: "Everything after `--` is forwarded to the script. Without it npm may treat the flag as its own config option.",
      },
      {
        kind: 'mcq', difficulty: 'intermediate',
        prompt: 'Which script runs on consumers’ machines when they install your package?',
        options: ["postinstall","prepublishOnly","prepack","pretest"],
        answer: 0,
        explanation: "install-time scripts (preinstall/install/postinstall) run for dependents. prepublishOnly and prepack run only on the publisher's machine.",
      },
    ],
    interview: [
      {
        category: 'nodejs', kind: 'concept', difficulty: 'beginner', topic: 'npm scripts',
        question: 'What are npm scripts and why can they call locally installed tools by name?',
        shortAnswer: 'They are named shell commands in package.json run with npm run; npm prepends node_modules/.bin to PATH while running them, so binaries of local dependencies like eslint or tsc resolve without global installs.',
        detailedAnswer: [
          "Standard names: start, test, build, dev, lint.",
          "npm injects env vars like `npm_package_version`.",
          "Exit code propagates — failing scripts fail CI.",
        ],
      },
      {
        category: 'nodejs', kind: 'concept', difficulty: 'intermediate', topic: 'npm scripts',
        question: 'What are pre and post scripts, and why are install lifecycle scripts a security concern?',
        shortAnswer: 'npm runs pre<name> before and post<name> after any script automatically. Install lifecycle scripts (preinstall, install, postinstall) of every dependency execute arbitrary code during npm install, which attackers abuse in supply-chain attacks.',
        detailedAnswer: [
          "Hooks: `pretest` lint, `postbuild` report, etc.",
          "A compromised package can steal tokens/env vars in postinstall.",
          "Mitigate: `--ignore-scripts`, lockfiles, reviewing new deps, minimal CI secrets during install.",
          "`node --run` runs scripts without pre/post hooks.",
        ],
        trap: "Thinking install scripts only run for your own package, not for dependencies.",
      },
    ],
  },

  'global-packages': {
    summary: 'Global installs (`npm i -g`) put a package’s CLI on your PATH for all projects; use them only for personal tools, and prefer devDependencies + npx for project tooling.',
    topics: ['npm install -g', 'global prefix', 'npm root -g', 'npm ls -g', 'EACCES', 'npx', 'corepack'],
    sections: [
      section('introduction', undefined,
        text("A global package is installed once per Node installation and its commands work in any folder. Convenient — but invisible to your project's package.json."),
      ),
      section('definition', 'Global vs local',
        table('Global vs local', ['', 'Local (default)', 'Global (`-g`)'], [
          ['Location', '`./node_modules`', '`$(npm prefix -g)/lib/node_modules`'],
          ['Recorded in package.json', 'Yes', 'No'],
          ['Version per project', 'Yes', 'One version for everything'],
          ['Use for', 'Libraries, project tools', 'Personal CLIs (e.g. `npm-check-updates`, `serve`)'],
          ['Can be `require`d by projects', 'Yes', 'No (not on the resolution path)'],
        ]),
      ),
      section('why', 'Why prefer local',
        bullets(
          "Reproducibility: CI and teammates get the same tool version.",
          "No 'works on my machine because I have tsc 5.6 globally'.",
          "Different projects can use different versions.",
        ),
      ),
      section('internals', 'Where global packages live',
        bullets(
          "Package files: `npm root -g` (e.g. `~/.nvm/versions/node/v22.11.0/lib/node_modules`).",
          "Binaries: linked into `$(npm prefix -g)/bin` (Unix) or the prefix folder (Windows), which is on PATH.",
          "With nvm/fnm, each Node version has its **own** global packages — switching versions 'loses' them.",
        ),
      ),
      section('example', 'Managing global packages',
        code({
          title: 'Global commands',
          language: 'bash',
          code: dedent(`
            npm install -g npm-check-updates
            npm ls -g --depth=0
            npm root -g
            npm uninstall -g npm-check-updates
          `),
          expectedOutput: "added 1 package in 2s\n/home/ada/.nvm/versions/node/v22.11.0/lib\n├── corepack@0.29.4\n├── npm-check-updates@17.1.11\n└── npm@10.9.0\n/home/ada/.nvm/versions/node/v22.11.0/lib/node_modules\nremoved 1 package in 0.3s",
          explanation: [
            "`npm` and `corepack` themselves are global packages bundled with Node.",
            "`npm root -g` reveals the per-Node-version folder used by nvm.",
          ],
        }),
      ),
      section('real-world', 'Real-world usage',
        bullets(
          "Personal utilities: `serve`, `http-server`, `npm-check-updates`, `vercel`.",
          "pnpm/yarn: prefer `corepack enable` + `packageManager` field over global installs.",
          "Project tooling (eslint, typescript, prisma): devDependencies, run via scripts or npx.",
        ),
      ),
      section('mistakes', 'Common mistakes',
        bullets(
          "`sudo npm install -g` → `EACCES` problems later; use a version manager or a user-owned prefix.",
          "Expecting `require('some-global')` to work inside a project.",
          "Documenting 'install X globally' in a README instead of adding a devDependency.",
        ),
      ),
      section('interview', 'Interview angle',
        interviewTip("The expected answer: globals for personal CLIs only; project tools as devDependencies with npx/scripts."),
      ),
      section('practice', 'Practice',
        text("List your global packages. Move any project-related tool into the relevant project's devDependencies and uninstall it globally."),
      ),
      section('summary', 'Summary',
        bullets(
          "`-g` installs CLIs onto PATH for all projects.",
          "Not recorded in package.json; one version per Node install.",
          "Prefer devDependencies + npx for project tools.",
        ),
      ),
    ],
    revisionNotes: [
      "npm root -g / npm prefix -g show locations.",
      "npm ls -g --depth=0 lists globals.",
      "Globals cannot be required from projects.",
      "Avoid sudo; nvm gives user-owned prefixes.",
    ],
    quiz: [
      {
        kind: 'scenario', difficulty: 'beginner',
        prompt: 'Your README says "install typescript globally". New CI runners fail with `tsc: not found`. Best fix?',
        options: ["Add `npm i -g typescript` to every CI job","Use sudo in CI","Commit the tsc binary","Add typescript as a devDependency and call tsc from an npm script"],
        answer: 3,
        explanation: "A devDependency pins the version in the lockfile and npm scripts find it via node_modules/.bin, so every environment matches.",
      },
      {
        kind: 'mcq', difficulty: 'intermediate',
        prompt: 'You switch Node versions with nvm and a global CLI disappears. Why?',
        options: ["nvm deletes globals on switch","Global packages expire","Each Node version managed by nvm has its own global prefix and node_modules","PATH is reset to system Node"],
        answer: 2,
        explanation: "Globals live under each version's folder. Reinstall them, or use `nvm install <v> --reinstall-packages-from=<old>`.",
      },
    ],
    interview: [
      {
        category: 'nodejs', kind: 'concept', difficulty: 'beginner', topic: 'Global packages',
        question: 'When should you install an npm package globally instead of locally?',
        shortAnswer: 'Only for personal command-line tools you use across many projects. Anything a project depends on — including build and test tools — should be a local (dev) dependency so its version is pinned and reproducible.',
        detailedAnswer: [
          "Globals are not recorded in package.json or the lockfile.",
          "Only one global version exists per Node install.",
          "npx and npm scripts make local CLIs just as convenient.",
          "Global packages cannot be required from project code.",
        ],
      },
    ],
  },
};

export default content;
