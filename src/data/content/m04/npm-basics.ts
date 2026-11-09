import type { ModuleContent } from '../../../types';
import { bullets, code, dedent, flow, interviewTip, note, section, steps, table, text, warn } from '../helpers';

const content: Partial<ModuleContent> = {
  'npm-architecture': {
    summary: 'npm is three things — the CLI, the public registry and the website; the CLI resolves a dependency tree (Arborist), fetches tarballs through a content-addressable cache, verifies integrity and writes node_modules plus the lockfile.',
    topics: ['npm CLI', 'npm registry', 'Arborist', 'pacote', 'cacache', 'tarball', 'integrity', 'packument', '.npmrc'],
    sections: [
      section('introduction', undefined,
        text("Every `npm install` talks to a remote registry, a local cache and your file system. Knowing the moving parts helps you debug slow installs, broken lockfiles and private registries."),
      ),
      section('definition', 'The three parts of npm',
        table('npm components', ['Part', 'What it is'], [
          ['CLI (`npm`)', 'Command-line tool bundled with Node; installs, runs scripts, publishes'],
          ['Registry (`registry.npmjs.org`)', 'Public database of package metadata and tarballs'],
          ['Website (npmjs.com)', 'Search, docs, account and org management'],
        ]),
        bullets(
          "A **package** is a folder (or tarball) with a `package.json`.",
          "A **packument** is the registry's JSON document listing all versions of a package and their metadata.",
          "Alternative clients (pnpm, Yarn, Bun) use the same registry with different install strategies.",
        ),
      ),
      section('why', 'Why it matters',
        bullets(
          "Explains why the lockfile, cache and registry config (`.npmrc`) affect reproducibility.",
          "Companies run private registries (GitHub Packages, Artifactory, Verdaccio) by changing the registry URL or a scope's registry.",
        ),
      ),
      section('internals', 'What `npm install` does',
        flow([
          'Read: package.json + package-lock.json',
          'Build ideal tree: Arborist resolves versions (from lockfile or registry packuments)',
          'Diff: compare ideal tree with actual node_modules',
          'Fetch: pacote downloads tarballs via cacache (~/.npm/_cacache)',
          'Verify: check sha512 integrity from the lockfile',
          'Reify: extract into node_modules, link bins into node_modules/.bin',
          'Scripts: run preinstall/install/postinstall, then root prepare',
          'Save: write package-lock.json (and package.json if adding)',
        ], { title: 'Install pipeline', direction: 'vertical' }),
        table('Config sources (highest priority first)', ['Source', 'Example'], [
          ['Command line', '`npm install --registry=https://npm.mycorp.dev`'],
          ['Environment', '`npm_config_registry=...`'],
          ['Project `.npmrc`', '`@mycorp:registry=https://npm.pkg.github.com`'],
          ['User `~/.npmrc`', 'Auth tokens: `//registry.npmjs.org/:_authToken=${NPM_TOKEN}`'],
          ['Global / built-in', 'npm defaults'],
        ]),
      ),
      section('example', 'Inspecting the registry and cache',
        code({
          title: 'Querying metadata',
          language: 'bash',
          code: dedent(`
            npm view express version
            npm view express dist-tags
            npm config get registry
            npm cache verify
          `),
          expectedOutput: "5.1.0\n{ latest: '5.1.0', next: '5.0.0-beta.3', 'latest-4': '4.21.2' }\nhttps://registry.npmjs.org/\nCache verified and compressed (~/.npm/_cacache)\nContent verified: 1843 (151249281 bytes)\nIndex entries: 1843\nFinished in 3.112s",
          explanation: [
            "`npm view` reads the packument from the registry.",
            "dist-tags map names like `latest` to versions — `npm install express` uses `latest`.",
            "`npm cache verify` checks the content-addressable cache; you rarely need `npm cache clean --force`.",
            "Version numbers will differ when you run it.",
          ],
        }),
      ),
      section('real-world', 'Real-world usage',
        bullets(
          "Scoped private packages: `@mycorp:registry=...` in the project `.npmrc`, token from a CI secret.",
          "CI caches `~/.npm` (not node_modules) and runs `npm ci` for fast, reproducible installs.",
        ),
      ),
      section('mistakes', 'Common mistakes',
        bullets(
          "Committing an `.npmrc` that contains a literal auth token — reference an env var instead.",
          "Running `npm cache clean --force` as a cure-all; the cache self-verifies.",
          "Deleting the lockfile to 'fix' installs — you lose reproducibility.",
        ),
      ),
      section('interview', 'Interview angle',
        interviewTip("Walk through the install pipeline: resolve → fetch → verify integrity → extract → link bins → run scripts → write lockfile."),
      ),
      section('practice', 'Practice',
        text("Run `npm view react versions --json | tail`, then `npm config list` and identify where each setting comes from."),
      ),
      section('summary', 'Summary',
        bullets(
          "npm = CLI + registry + website.",
          "Install resolves a tree, fetches via cache, verifies integrity, reifies node_modules.",
          "`.npmrc` controls registries and auth.",
        ),
      ),
    ],
    revisionNotes: [
      "Registry default: https://registry.npmjs.org/.",
      "Cache: ~/.npm/_cacache (content-addressable).",
      "Arborist builds the tree; lockfile integrity = sha512.",
      "dist-tags: latest, next, beta…",
      ".npmrc: project > user > global.",
    ],
    quiz: [
      {
        kind: 'mcq', difficulty: 'beginner',
        prompt: 'Which version does `npm install lodash` pick when no lockfile exists?',
        options: ["The highest version ever published, including prereleases","The oldest stable version","The version the `latest` dist-tag points to","A random version compatible with Node"],
        answer: 2,
        explanation: "Without a range, npm installs the `latest` dist-tag and saves `^<version>` to package.json. Prereleases are only picked via explicit tags like `next`.",
      },
      {
        kind: 'scenario', difficulty: 'intermediate',
        prompt: 'Your company publishes `@acme/*` packages to a private registry. How should the project be configured?',
        options: ['Set the global registry to the private one for all packages', 'Add `@acme:registry=<private url>` to the project .npmrc and supply the token via an env var', 'Commit the auth token into package.json', 'Copy the packages into node_modules manually'],
        answer: 1,
        explanation: "A scoped registry routes only `@acme` packages to the private registry; everything else still comes from npmjs. Tokens belong in env vars or user config, never in git.",
      },
    ],
    interview: [
      {
        category: 'nodejs', kind: 'concept', difficulty: 'beginner', topic: 'npm',
        question: 'What are the main components of npm?',
        shortAnswer: 'The npm CLI that installs and publishes packages, the public registry that stores package metadata and tarballs, and the npmjs.com website for discovery and account management.',
        detailedAnswer: [
          "The CLI ships with Node.js.",
          "The registry serves packuments (metadata) and tarballs.",
          "Other clients — pnpm, Yarn, Bun — use the same registry.",
          "Private registries mirror or extend the public one.",
        ],
      },
      {
        category: 'nodejs', kind: 'concept', difficulty: 'intermediate', topic: 'npm',
        question: 'What happens step by step when you run npm install in a project with a lockfile?',
        shortAnswer: 'npm reads package.json and the lockfile, builds the ideal dependency tree, diffs it against node_modules, fetches missing tarballs through its cache, verifies their integrity hashes, extracts them, links binaries, runs lifecycle scripts and updates the lockfile if needed.',
        detailedAnswer: [
          "Lockfile versions are used when they satisfy package.json ranges.",
          "Tarballs come from `~/.npm/_cacache` or the registry.",
          "Integrity (sha512) mismatch aborts the install.",
          "Binaries are linked into `node_modules/.bin`.",
          "`preinstall`/`install`/`postinstall` scripts of dependencies run unless `--ignore-scripts`.",
        ],
        followUp: 'How does npm ci differ?',
      },
    ],
  },

  'npm-vs-npx': {
    summary: 'npm manages packages and runs scripts; npx (npm exec) runs a package binary — from local node_modules/.bin, then PATH, otherwise downloading it temporarily into the npx cache.',
    topics: ['npx', 'npm exec', 'node_modules/.bin', 'npx cache', 'create-* initializers', 'npm init', '--yes', '-p'],
    sections: [
      section('introduction', undefined,
        text("`npm` installs things; `npx` executes things. npx lets you run a CLI without installing it globally — handy for scaffolding tools and one-off commands."),
      ),
      section('definition', 'npm vs npx',
        table('npm vs npx', ['', 'npm', 'npx'], [
          ['Main job', 'Install, update, publish, run scripts', 'Execute a package binary'],
          ['Installs permanently?', 'Yes (to node_modules or global)', 'No — temporary cache if missing'],
          ['Typical use', '`npm install express`', '`npx create-vite@latest my-app`'],
          ['Since npm 7', '—', 'npx is a wrapper around `npm exec`'],
        ]),
      ),
      section('why', 'Why npx exists',
        bullets(
          "Run project-local tools (`npx eslint .`) without global installs or long paths.",
          "Always get the newest scaffolder: `npx create-next-app@latest`.",
          "Try a CLI once without polluting your global packages.",
        ),
      ),
      section('internals', 'How npx resolves a command',
        steps(
          "Look for the binary in the local project's `node_modules/.bin`.",
          "Otherwise, check whether the command is available on your `PATH` (e.g. a global install).",
          "Otherwise, ask to install the package into the npx cache (`~/.npm/_npx/<hash>`), then run it.",
          "With an explicit version (`pkg@1.2.3`) or `-p/--package`, npm makes sure that exact package is used.",
        ),
        note("`npm init <initializer>` maps to `npx create-<initializer>`: `npm init vite@latest` runs `create-vite`."),
      ),
      section('example', 'Using npx',
        code({
          title: 'Common commands',
          language: 'bash',
          code: dedent(`
            npx eslint src/                  # local devDependency
            npx cowsay "hi"                  # not installed → prompt
            npx --yes cowsay "hi"            # skip the prompt (CI)
            npx -p typescript tsc --version  # package name differs from bin name
          `),
          expectedOutput: "Need to install the following packages:\ncowsay@1.6.0\nOk to proceed? (y) y\n ____\n< hi >\n ----\n        \\   ^__^\n         \\  (oo)\\_______\n            (__)\\       )\\/\\\n                ||----w |\n                ||     ||\nVersion 5.7.2",
          explanation: [
            "`npx eslint` uses the version pinned in your project — consistent with CI.",
            "Missing packages trigger an install prompt; `--yes` answers it automatically.",
            "`-p typescript tsc` installs the `typescript` package and runs its `tsc` bin.",
          ],
        }),
      ),
      section('real-world', 'Real-world usage',
        bullets(
          "Scaffolding: `npx create-vite@latest`, `npx nest new api`.",
          "In package.json scripts you do not need npx — `npm run` already adds `node_modules/.bin` to PATH.",
          "One-off DB tooling: `npx prisma migrate deploy` in a deploy step.",
        ),
      ),
      section('mistakes', 'Common mistakes',
        bullets(
          "Typos: `npx expres` could download and run a malicious look-alike package. Check the prompt.",
          "Using unpinned `npx some-tool` in CI — the version can change between runs; pin `some-tool@x.y.z` or add it as a devDependency.",
          "Writing `npx` inside npm scripts — unnecessary.",
        ),
        warn("npx runs code from the registry with your user permissions. Treat the 'Ok to proceed?' prompt as a security check."),
      ),
      section('interview', 'Interview angle',
        interviewTip("Mention the resolution order (local .bin → PATH → temporary download) and that npx is `npm exec` since npm 7."),
      ),
      section('practice', 'Practice',
        text("Install `prettier` as a devDependency, then run it with `npx prettier --version` and with an npm script. Confirm both use the same version."),
      ),
      section('summary', 'Summary',
        bullets(
          "npm installs; npx executes.",
          "npx prefers local bins, then PATH, then a temporary download.",
          "`npm init x` = `npx create-x`.",
          "Pin versions in CI.",
        ),
      ),
    ],
    revisionNotes: [
      "npx = npm exec (npm 7+).",
      "Resolution: ./node_modules/.bin → PATH → npx cache download.",
      "--yes skips prompt; -p specifies package.",
      "npm scripts already have .bin on PATH.",
    ],
    quiz: [
      {
        kind: 'mcq', difficulty: 'beginner',
        prompt: 'Your project has `typescript` in devDependencies. Which `tsc` does `npx tsc` run?',
        options: ["The project’s node_modules/.bin/tsc","A freshly downloaded latest TypeScript","A global tsc if one exists, even if older","None — npx only runs packages not installed locally"],
        answer: 0,
        explanation: "npx checks the local node_modules/.bin first, so you get the project-pinned version.",
      },
      {
        kind: 'mcq', difficulty: 'beginner',
        prompt: 'What does `npm init vite@latest` actually run?',
        options: ["npm install vite@latest","node vite.js","vite init","npx create-vite@latest"],
        answer: 3,
        explanation: "`npm init <name>` is sugar for running the `create-<name>` initializer via npm exec.",
      },
    ],
    interview: [
      {
        category: 'nodejs', kind: 'concept', difficulty: 'beginner', topic: 'npx',
        question: 'What is the difference between npm and npx?',
        shortAnswer: 'npm is the package manager — it installs, updates and publishes packages and runs scripts. npx executes a package’s binary, using a local install if present or temporarily downloading it otherwise.',
        detailedAnswer: [
          "npx avoids global installs for one-off tools.",
          "Since npm 7, npx is implemented as `npm exec`.",
          "Typical uses: scaffolders and project-local CLIs.",
        ],
      },
      {
        category: 'nodejs', kind: 'concept', difficulty: 'intermediate', topic: 'npx',
        question: 'How does npx find the binary it runs, and what are the security implications?',
        shortAnswer: 'It looks in the project’s node_modules/.bin, then on PATH, and otherwise offers to download the package into its cache and run it. Because that executes registry code, a typo can run a malicious look-alike package.',
        detailedAnswer: [
          "Cache lives under `~/.npm/_npx`.",
          "An explicit `pkg@version` ensures that version.",
          "`--yes` skips the confirmation — avoid it for untrusted names.",
          "In CI, pin versions or use devDependencies for determinism.",
        ],
        trap: "Thinking npx always downloads the latest version.",
      },
    ],
  },

  'package-json': {
    summary: 'package.json is the manifest of a Node project: identity (name, version), entry points (main, exports, bin, type), scripts, dependency lists, engines and publishing metadata (files, private, publishConfig).',
    topics: ['package.json', 'name', 'version', 'main', 'exports', 'type', 'scripts', 'bin', 'engines', 'private', 'workspaces'],
    sections: [
      section('introduction', undefined,
        text("Every Node project and npm package starts with `package.json`. It tells npm what to install and tells Node how to load your code."),
      ),
      section('definition', 'Key fields',
        table('package.json fields', ['Field', 'Purpose'], [
          ['`name`, `version`', 'Identity; required to publish. Name lowercase, may be scoped (`@org/name`)'],
          ['`type`', '`"module"` → `.js` files are ESM; default `"commonjs"`'],
          ['`main`', 'Legacy entry point for `require(\'pkg\')`'],
          ['`exports`', 'Modern entry map; restricts and conditions what can be imported'],
          ['`bin`', 'CLI commands to link into `.bin`'],
          ['`scripts`', 'Commands for `npm run`'],
          ['`dependencies` / `devDependencies` / `peerDependencies` / `optionalDependencies`', 'What to install and when'],
          ['`engines`', 'Supported Node/npm versions'],
          ['`files`', 'Allow-list of files to publish'],
          ['`private: true`', 'Prevents accidental `npm publish`'],
          ['`workspaces`', 'Monorepo package folders'],
          ['`overrides`', 'Force versions of nested dependencies'],
        ]),
      ),
      section('why', 'Why it matters',
        bullets(
          "Single source of truth for dependencies and scripts.",
          "Node itself reads it (`type`, `exports`, `imports`, `main`) when resolving modules.",
          "Tools (TypeScript, bundlers, hosting platforms) read it too.",
        ),
      ),
      section('internals', 'How Node uses `exports`',
        bullets(
          "When present, `exports` **replaces** `main` for modern Node and blocks deep imports not listed (`ERR_PACKAGE_PATH_NOT_EXPORTED`).",
          "Conditions pick a file per environment: `import`, `require`, `node`, `default`, `types` (TypeScript).",
          "Condition keys are matched in object order — put `types` first and `default` last.",
          "Subpaths (`\"./utils\"`) and patterns (`\"./features/*\"`) expose extra entry points.",
        ),
      ),
      section('example', 'A realistic package.json',
        code({
          title: 'Dual CJS/ESM library',
          language: 'json',
          code: dedent(`
            {
              "name": "@acme/money",
              "version": "2.1.0",
              "type": "module",
              "exports": {
                ".": {
                  "types": "./dist/index.d.ts",
                  "import": "./dist/index.js",
                  "require": "./dist/index.cjs"
                },
                "./format": "./dist/format.js",
                "./package.json": "./package.json"
              },
              "main": "./dist/index.cjs",
              "files": ["dist"],
              "scripts": {
                "build": "tsup src/index.ts --format esm,cjs --dts",
                "test": "node --test",
                "prepublishOnly": "npm run build && npm test"
              },
              "engines": { "node": ">=20" },
              "devDependencies": { "tsup": "^8.3.0", "typescript": "^5.6.3" }
            }
          `),
          explanation: [
            "`import '@acme/money'` loads `dist/index.js`; `require('@acme/money')` loads `dist/index.cjs`.",
            "`@acme/money/format` is allowed; `@acme/money/dist/internal.js` throws `ERR_PACKAGE_PATH_NOT_EXPORTED`.",
            "`main` stays as a fallback for old tools.",
            "`prepublishOnly` guarantees a fresh build before publishing.",
          ],
        }),
        code({
          title: 'Create and inspect',
          language: 'bash',
          code: dedent(`
            npm init -y
            npm pkg set type=module
            npm pkg get name type
          `),
          expectedOutput: 'Wrote to /home/ada/my-app/package.json:\n\n{\n  "name": "my-app",\n  "version": "1.0.0",\n  "main": "index.js",\n  "scripts": {\n    "test": "echo \\"Error: no test specified\\" && exit 1"\n  },\n  "keywords": [],\n  "author": "",\n  "license": "ISC",\n  "description": ""\n}\n\n{\n  "name": "my-app",\n  "type": "module"\n}',
          explanation: [
            "`npm init -y` accepts defaults (folder name, version 1.0.0).",
            "`npm pkg set/get` edits fields without opening an editor — handy in scripts.",
          ],
        }),
      ),
      section('real-world', 'Real-world usage',
        bullets(
          "Apps: `private: true`, `engines`, scripts for dev/build/start/test/lint.",
          "Libraries: `exports`, `files`, `types`, `sideEffects: false` for tree-shaking.",
          "Monorepos: root `workspaces: [\"packages/*\"]`.",
        ),
      ),
      section('mistakes', 'Common mistakes',
        bullets(
          "Adding `exports` to an existing package without listing old deep paths — a breaking change for consumers.",
          "Putting `default` before `import`/`require` in conditions — later keys never match.",
          "Forgetting `private: true` on an app and publishing it by accident.",
        ),
      ),
      section('interview', 'Interview angle',
        interviewTip("Expect questions on `main` vs `exports`, `type`, and the dependency fields. Knowing `ERR_PACKAGE_PATH_NOT_EXPORTED` shows real experience."),
      ),
      section('practice', 'Practice',
        text("Create a package with `exports` exposing `.` and `./utils`. Try importing an unexported file from another project and read the error."),
      ),
      section('summary', 'Summary',
        bullets(
          "Manifest: identity, entry points, scripts, dependencies.",
          "`type` controls ESM/CJS for .js files.",
          "`exports` defines the public API and conditional entries.",
          "`files` + `private` control publishing.",
        ),
      ),
    ],
    revisionNotes: [
      "exports overrides main and blocks unlisted subpaths.",
      "Conditions: types first, default last.",
      "type: module → .js is ESM.",
      "private: true prevents publishing.",
      "npm pkg get/set edits fields from CLI.",
    ],
    quiz: [
      {
        kind: 'find-bug', difficulty: 'intermediate',
        prompt: 'Consumers using `require()` always get the ESM file and crash. Why?',
        code: '"exports": {\n  ".": {\n    "default": "./dist/index.js",\n    "require": "./dist/index.cjs"\n  }\n}',
        options: ["require is not a valid condition","exports cannot point into dist/","\"default\" comes first and matches before \"require\" is checked","main is missing"],
        answer: 2,
        explanation: "Conditions are tried in object order and the first match wins. `default` matches everything, so it must be last.",
      },
      {
        kind: 'mcq', difficulty: 'beginner',
        prompt: 'What does `"private": true` do in package.json?',
        options: ['Hides the package from npm search', 'Makes npm refuse to publish the package', 'Encrypts the source code', 'Installs dependencies from a private registry'],
        answer: 1,
        explanation: "It is a safety switch against accidental publishing. Private scoped packages on the registry are a different concept (`--access restricted`).",
      },
    ],
    interview: [
      {
        category: 'nodejs', kind: 'concept', difficulty: 'beginner', topic: 'package.json',
        question: 'What is the purpose of package.json?',
        shortAnswer: 'It is the project manifest: it names and versions the project, lists dependencies and scripts, and tells Node and tools how to load it (type, main, exports, bin).',
        detailedAnswer: [
          "npm reads it to install dependencies and run scripts.",
          "Node reads `type`, `main`, `exports` and `imports` during module resolution.",
          "Publishing uses `name`, `version`, `files` and `publishConfig`.",
          "Created with `npm init` (or `npm init -y`).",
        ],
      },
      {
        category: 'nodejs', kind: 'concept', difficulty: 'intermediate', topic: 'package.json',
        question: 'What does the exports field in package.json do, and how is it different from main?',
        shortAnswer: 'exports defines a package’s public entry points, can provide different files per condition (import, require, types, node), and blocks imports of any path not listed; main only defines a single entry for require and allows deep imports.',
        detailedAnswer: [
          "Supported since Node 12.7; it takes precedence over `main` when present.",
          "Unlisted subpaths throw `ERR_PACKAGE_PATH_NOT_EXPORTED`.",
          "Conditions are matched in key order; `default` should be last.",
          "Enables dual CJS/ESM packages cleanly.",
          "Adding it later can be a breaking change.",
        ],
        trap: "Assuming `main` is still used when `exports` exists.",
      },
    ],
  },

  'package-lock-json': {
    summary: 'package-lock.json records the exact resolved version, tarball URL and integrity hash of every package in the tree so installs are reproducible; commit it for apps, and use `npm ci` in CI.',
    topics: ['package-lock.json', 'lockfileVersion', 'integrity', 'resolved', 'npm ci', 'npm install', 'npm-shrinkwrap.json', 'reproducible builds'],
    sections: [
      section('introduction', undefined,
        text("package.json says `\"express\": \"^4.19.0\"` — a range. The lockfile says *exactly* which 4.x version, and which version of each of its 60+ transitive dependencies, you got."),
      ),
      section('definition', 'What it contains',
        bullets(
          "`lockfileVersion: 3` (npm 9+) — a `packages` map keyed by install path (`\"\"` is the root, `\"node_modules/express\"` etc.).",
          "For each package: `version`, `resolved` (tarball URL), `integrity` (sha512), `dependencies`, and flags like `dev`, `optional`, `peer`.",
          "It mirrors the shape of `node_modules`, so npm can rebuild the same tree.",
        ),
      ),
      section('why', 'Why lockfiles exist',
        bullets(
          "Ranges let different machines install different versions over time — 'works on my machine'.",
          "The lockfile pins the whole tree, including transitive dependencies you never chose.",
          "Integrity hashes detect tampered or corrupted tarballs.",
        ),
      ),
      section('internals', 'npm install vs npm ci',
        table('npm install vs npm ci', ['', '`npm install`', '`npm ci`'], [
          ['Needs a lockfile', 'No', 'Yes (or npm-shrinkwrap.json)'],
          ['Lockfile out of sync with package.json', 'Updates the lockfile', 'Fails with an error'],
          ['Writes package.json / lockfile', 'Can write both', 'Never'],
          ['Existing node_modules', 'Updates in place', 'Deletes it first'],
          ['Install single packages', 'Yes (`npm install x`)', 'No'],
          ['Use in', 'Development', 'CI, Docker builds, deploys'],
        ]),
        bullets(
          "`npm install` keeps locked versions as long as they still satisfy package.json ranges.",
          "Libraries: the lockfile is **not** published and does not affect consumers. `npm-shrinkwrap.json` is the publishable variant (rarely appropriate — mostly for CLIs).",
          "npm also writes a hidden `node_modules/.package-lock.json` to speed up later installs.",
        ),
      ),
      section('example', 'Lockfile entry and npm ci',
        code({
          title: 'Excerpt of package-lock.json',
          language: 'json',
          code: dedent(`
            {
              "name": "my-api",
              "version": "1.0.0",
              "lockfileVersion": 3,
              "requires": true,
              "packages": {
                "": {
                  "name": "my-api",
                  "dependencies": { "express": "^4.19.0" }
                },
                "node_modules/express": {
                  "version": "4.21.2",
                  "resolved": "https://registry.npmjs.org/express/-/express-4.21.2.tgz",
                  "integrity": "sha512-28HqgMZAmih1Czt9ny7qr6ek2qddF4FclbMzwhCREB6OFfH+rXAnuNCwo1/wFvrtbgsQDb4kSbX9de9lFbrXnA==",
                  "dependencies": { "body-parser": "1.20.3", "cookie": "0.7.1" }
                }
              }
            }
          `),
          explanation: [
            "The root entry repeats your declared ranges.",
            "`node_modules/express` pins version 4.21.2 within `^4.19.0`.",
            "`integrity` is verified on every install; a mismatch aborts with `EINTEGRITY`.",
          ],
        }),
        code({
          title: 'npm ci refuses an out-of-sync lockfile',
          language: 'bash',
          code: dedent(`
            # package.json was edited by hand to add "zod": "^3.23.0"
            npm ci
          `),
          expectedOutput: "npm error code EUSAGE\nnpm error\nnpm error `npm ci` can only install packages when your package.json and package-lock.json or npm-shrinkwrap.json are in sync. Please update your lock file with `npm install` before continuing.\nnpm error\nnpm error Missing: zod@3.23.8 from lock file",
          explanation: [
            "CI fails fast instead of silently resolving new versions.",
            "Fix by running `npm install` locally and committing the updated lockfile.",
          ],
        }),
      ),
      section('real-world', 'Real-world usage',
        bullets(
          "Commit the lockfile for applications and for library repos (dev reproducibility).",
          "Dockerfile: `COPY package*.json ./` then `RUN npm ci --omit=dev` for layer caching.",
          "Review lockfile diffs in PRs — unexpected new packages can signal supply-chain issues.",
          "Merge conflicts: resolve package.json first, then run `npm install` to regenerate the lockfile.",
        ),
      ),
      section('mistakes', 'Common mistakes',
        bullets(
          "Adding `package-lock.json` to `.gitignore`.",
          "Using `npm install` in CI — it may modify the lockfile and hide drift.",
          "Mixing package managers (npm + yarn) — two lockfiles that disagree.",
          "Deleting the lockfile to fix a conflict, which silently upgrades the whole tree.",
        ),
      ),
      section('interview', 'Interview angle',
        interviewTip("The `npm ci` vs `npm install` table is a common question. Mention 'fails on mismatch, never writes, deletes node_modules'."),
      ),
      section('practice', 'Practice',
        text("Install a package, inspect its lockfile entry, then edit package.json by hand and run `npm ci` to see the error. Fix it with `npm install`."),
      ),
      section('summary', 'Summary',
        bullets(
          "Lockfile pins exact versions + integrity for the whole tree.",
          "Commit it; not published with libraries.",
          "`npm ci` = clean, strict, read-only install for CI.",
          "Shrinkwrap is the publishable variant.",
        ),
      ),
    ],
    revisionNotes: [
      "lockfileVersion 3 since npm 9 (packages map).",
      "npm ci: requires lock, fails if out of sync, deletes node_modules, never writes.",
      "npm install keeps lock versions that still satisfy ranges.",
      "Lockfile not published; shrinkwrap is.",
      "integrity = sha512 SRI hash.",
    ],
    quiz: [
      {
        kind: 'mcq', difficulty: 'intermediate',
        prompt: 'What does `npm ci` do if package.json and package-lock.json disagree?',
        options: ["Exits with an error","Ignores package.json and uses the lockfile","Updates the lockfile to match package.json","Installs the latest versions of everything"],
        answer: 0,
        explanation: "npm ci is strict: it never writes the lockfile and fails on mismatch. `npm install` is the command that updates the lockfile.",
      },
      {
        kind: 'scenario', difficulty: 'beginner',
        prompt: 'A teammate wants to add package-lock.json to .gitignore because it causes merge conflicts. Best response?',
        options: ["Agree — lockfiles are optional","Delete node_modules on every pull","Switch to npm-shrinkwrap.json instead","Keep committing it; resolve package.json conflicts then regenerate the lockfile with npm install"],
        answer: 3,
        explanation: "Without a committed lockfile, every machine and CI run may resolve different versions. Conflicts are solved by regenerating, not by dropping the file.",
      },
      {
        kind: 'mcq', difficulty: 'intermediate',
        prompt: 'You publish a library with a package-lock.json in the repo. What effect does it have on apps that install your library?',
        options: ["Their installs use your locked transitive versions","npm warns them about version mismatch","None — package-lock.json is not published or honoured for dependencies","It overrides their own lockfile"],
        answer: 2,
        explanation: "Only the root project's lockfile matters. npm-shrinkwrap.json is the variant that would be published and honoured.",
      },
    ],
    interview: [
      {
        category: 'nodejs', kind: 'concept', difficulty: 'beginner', topic: 'Lockfile',
        question: 'Should package-lock.json be committed to version control, and why?',
        shortAnswer: 'Yes. It pins the exact versions and integrity hashes of the whole dependency tree, so every developer, CI run and deployment installs the same packages.',
        detailedAnswer: [
          "Ranges in package.json allow drift over time.",
          "Transitive dependencies are otherwise uncontrolled.",
          "Lockfile diffs make dependency changes reviewable.",
          "Libraries commit it too, even though it is not published.",
        ],
      },
      {
        category: 'nodejs', kind: 'concept', difficulty: 'intermediate', topic: 'Lockfile',
        question: 'What is the difference between npm ci and npm install?',
        shortAnswer: 'npm ci performs a clean, exact install from the lockfile: it requires one, fails if it is out of sync with package.json, removes node_modules first and never modifies package.json or the lockfile. npm install may resolve new versions and update the lockfile.',
        detailedAnswer: [
          "Use `npm ci` in CI/Docker for reproducibility and speed.",
          "`npm install` is for development and adding packages.",
          "`npm ci` cannot install individual packages.",
          "Both verify integrity hashes.",
          "`npm ci --omit=dev` for production images.",
        ],
        trap: "Thinking npm ci is just a faster npm install — it is stricter (its alias is `npm clean-install`) and will not fix an out-of-sync lockfile.",
      },
    ],
  },
};

export default content;
