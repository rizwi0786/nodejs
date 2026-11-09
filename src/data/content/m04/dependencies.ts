import type { ModuleContent } from '../../../types';
import { bullets, code, dedent, flow, interviewTip, note, section, table, text } from '../helpers';

const content: Partial<ModuleContent> = {
  'dependencies': {
    summary: '`dependencies` lists packages your code needs at runtime; npm installs them for your project and, when your package is installed by others, for them too. Related lists: devDependencies, peerDependencies, optionalDependencies, bundleDependencies.',
    topics: ['dependencies', 'transitive dependencies', 'optionalDependencies', 'bundleDependencies', '--save', 'dependency types'],
    sections: [
      section('introduction', undefined,
        text("Your app uses Express at runtime, Jest only while testing, and a React plugin expects the host app's React. npm has a separate list for each of those relationships."),
      ),
      section('definition', 'Dependency types',
        table('Dependency fields', ['Field', 'Installed in your project', 'Installed for consumers of your package', 'Example'], [
          ['`dependencies`', 'Yes', 'Yes', 'express, zod, pg'],
          ['`devDependencies`', 'Yes (unless `--omit=dev`)', 'No', 'jest, typescript, eslint'],
          ['`peerDependencies`', 'Yes (auto since npm 7)', 'Expected from the host; npm 7+ installs if missing', 'react for a React component lib'],
          ['`optionalDependencies`', 'Tried; failure is not fatal', 'Tried', 'fsevents (macOS only)'],
          ['`bundleDependencies`', 'Packed into your tarball', 'Shipped inside the tarball', 'Rare: offline/private deps'],
        ]),
      ),
      section('why', 'Why the distinction matters',
        bullets(
          "Production images install only what runs — smaller, faster, smaller attack surface.",
          "Library consumers do not get your test tooling.",
          "Correct categories avoid duplicate copies of frameworks (peers).",
        ),
      ),
      section('internals', 'Direct vs transitive',
        flow(['Your app', 'express (direct)', 'body-parser (transitive)', 'raw-body (transitive)'], { title: 'Dependency chain', direction: 'horizontal' }),
        bullets(
          "You declare **direct** dependencies; npm resolves their **transitive** ones.",
          "A typical API has ~10–30 direct and hundreds of transitive packages.",
          "`npm ls express` and `npm explain body-parser` show why something is installed.",
        ),
      ),
      section('example', 'Adding runtime dependencies',
        code({
          title: 'Install and inspect',
          language: 'bash',
          code: dedent(`
            npm install express zod
            npm ls --depth=0
            npm explain raw-body
          `),
          expectedOutput: "added 67 packages, and audited 68 packages in 2s\n\nfound 0 vulnerabilities\nmy-api@1.0.0 /home/ada/my-api\n├── express@4.21.2\n└── zod@3.23.8\nraw-body@2.5.2\nnode_modules/raw-body\n  raw-body@\"2.5.2\" from body-parser@1.20.3\n  node_modules/body-parser\n    body-parser@\"1.20.3\" from express@4.21.2\n    node_modules/express\n      express@\"^4.21.2\" from the root project",
          explanation: [
            "Since npm 5, `npm install <pkg>` saves to `dependencies` by default (no `--save` needed).",
            "Two direct packages pulled in 67 in total.",
            "`npm explain` walks the chain back to your root project.",
          ],
        }),
      ),
      section('real-world', 'Real-world usage',
        bullets(
          "Keep direct dependencies few and well maintained; each adds transitive risk.",
          "Check package health (maintenance, downloads, open issues, license) before adding.",
          "Prefer built-ins when available: `fetch`, `node:test`, `crypto.randomUUID()`, `util.parseArgs`.",
        ),
      ),
      section('mistakes', 'Common mistakes',
        bullets(
          "Putting runtime packages in devDependencies — app crashes in production with `Cannot find module`.",
          "Importing a transitive dependency directly without declaring it (a phantom dependency).",
          "Adding a package for a one-liner (left-pad style).",
        ),
      ),
      section('interview', 'Interview angle',
        interviewTip("Explain each dependency type by *who installs it and when*. That framing handles every follow-up."),
      ),
      section('practice', 'Practice',
        text("Install `express`, then run `npm ls --all | wc -l` to count the full tree. Use `npm explain` on two random transitive packages."),
      ),
      section('summary', 'Summary',
        bullets(
          "dependencies = needed at runtime, installed for consumers too.",
          "dev = tooling; peer = provided by host; optional = may fail.",
          "Direct vs transitive; `npm ls` / `npm explain` to inspect.",
        ),
      ),
    ],
    revisionNotes: [
      "npm install <pkg> saves to dependencies by default (npm 5+).",
      "optionalDependencies failures do not fail the install.",
      "npm explain <pkg> shows why it is installed.",
      "Declare everything you import directly.",
    ],
    quiz: [
      {
        kind: 'scenario', difficulty: 'beginner',
        prompt: 'The app works locally but crashes in production with `Cannot find module \'dayjs\'`. Production runs `npm ci --omit=dev`. Most likely cause?',
        options: ['dayjs is not compatible with Node 22', 'dayjs was installed as a devDependency', 'The lockfile is corrupt', 'dayjs needs a global install'],
        answer: 1,
        explanation: "`--omit=dev` skips devDependencies. Anything the running code imports must be in `dependencies`.",
      },
      {
        kind: 'mcq', difficulty: 'intermediate',
        prompt: 'Which dependency type lets the install continue even if the package fails to build on the current OS?',
        options: ["optionalDependencies","bundleDependencies","peerDependencies","devDependencies"],
        answer: 0,
        explanation: "optionalDependencies are attempted but their failure is tolerated — used for platform-specific packages like fsevents.",
      },
    ],
    interview: [
      {
        category: 'nodejs', kind: 'concept', difficulty: 'beginner', topic: 'Dependencies',
        question: 'What is the difference between dependencies and devDependencies?',
        shortAnswer: 'dependencies are needed when the code runs and are installed for anyone who installs your package; devDependencies are only needed for development tasks like testing, building and linting, and are not installed for consumers or with --omit=dev.',
        detailedAnswer: [
          "`npm install x` → dependencies; `npm install -D x` → devDependencies.",
          "Production installs: `npm ci --omit=dev`.",
          "Consumers of a library never get its devDependencies.",
          "Misclassification causes production crashes or bloated images.",
        ],
        followUp: 'Where would TypeScript go in an app that is compiled before deployment?',
      },
    ],
  },

  'devdependencies': {
    summary: 'devDependencies hold build, test and lint tooling; install with `-D`, skip them in production with `npm ci --omit=dev` (or NODE_ENV=production), and remember compiled apps need them in the build stage.',
    topics: ['devDependencies', '-D', '--save-dev', '--omit=dev', 'NODE_ENV=production', 'multi-stage Docker', '@types'],
    sections: [
      section('introduction', undefined,
        text("Tests, compilers, linters and type definitions are needed to *produce* your app, not to *run* it. devDependencies keep them out of production installs."),
      ),
      section('definition', 'What belongs in devDependencies',
        bullets(
          "Test runners and helpers: jest, vitest, supertest.",
          "Build tools: typescript, tsup, esbuild, vite.",
          "Linters/formatters: eslint, prettier.",
          "Type packages: `@types/node`, `@types/express`.",
          "Dev servers: nodemon (or use `node --watch`).",
        ),
      ),
      section('why', 'Why separate them',
        bullets(
          "Production images can be hundreds of MB smaller.",
          "Fewer packages = fewer vulnerabilities reachable in production.",
          "Library consumers do not download your tooling.",
        ),
      ),
      section('internals', 'How npm decides to skip them',
        table('Installing without devDependencies', ['Command', 'Installs dev?'], [
          ['`npm install` / `npm ci`', 'Yes'],
          ['`npm ci --omit=dev`', 'No'],
          ['`NODE_ENV=production npm ci`', 'No (omit defaults to dev when NODE_ENV=production)'],
          ['`npm install --production`', 'No — deprecated alias, use `--omit=dev`'],
          ['Installed as someone else’s dependency', 'Never'],
        ]),
        note("Packages marked `\"dev\": true` in the lockfile are the ones that are only reachable through devDependencies."),
      ),
      section('example', 'Multi-stage Docker build',
        code({
          title: 'Dockerfile for a TypeScript API',
          language: 'dockerfile',
          code: dedent(`
            FROM node:22-alpine AS build
            WORKDIR /app
            COPY package*.json ./
            RUN npm ci                     # includes devDependencies (typescript)
            COPY . .
            RUN npm run build              # tsc → dist/

            FROM node:22-alpine
            WORKDIR /app
            ENV NODE_ENV=production
            COPY package*.json ./
            RUN npm ci --omit=dev          # runtime deps only
            COPY --from=build /app/dist ./dist
            CMD ["node", "dist/server.js"]
          `),
          explanation: [
            "The build stage needs TypeScript, so it installs everything.",
            "The runtime stage installs only `dependencies`.",
            "Only compiled `dist/` is copied — no source, no dev tooling.",
          ],
        }),
        code({
          title: 'Adding dev tooling',
          language: 'bash',
          code: dedent(`
            npm install -D typescript @types/node vitest
            npm pkg get devDependencies
          `),
          expectedOutput: 'added 52 packages, and audited 120 packages in 4s\n\nfound 0 vulnerabilities\n{\n  "@types/node": "^22.9.0",\n  "typescript": "^5.6.3",\n  "vitest": "^2.1.4"\n}',
          explanation: [
            "`-D` is short for `--save-dev`.",
            "npm writes caret ranges by default.",
          ],
        }),
      ),
      section('real-world', 'Real-world usage',
        bullets(
          "Platforms like Heroku or Vercel run the build with devDependencies, then may prune them.",
          "Monorepos often keep shared tooling as root devDependencies.",
        ),
      ),
      section('mistakes', 'Common mistakes',
        bullets(
          "Setting `NODE_ENV=production` in the build stage and then `tsc` is missing.",
          "Putting `@types/*` in dependencies for an app (harmless but bloats production).",
          "For a **library** whose public types depend on `@types/x`, `@types/x` may need to be a dependency so consumers' TypeScript compiles.",
        ),
      ),
      section('interview', 'Interview angle',
        interviewTip("Mention `--omit=dev`, the deprecated `--production`, and the multi-stage build pattern."),
      ),
      section('practice', 'Practice',
        text("Build a two-stage Dockerfile for a small TypeScript app and compare image sizes with and without `--omit=dev`."),
      ),
      section('summary', 'Summary',
        bullets(
          "devDependencies = tooling to build/test/lint.",
          "`-D` to add; `--omit=dev` to skip.",
          "Compiled apps need them in the build stage only.",
        ),
      ),
    ],
    revisionNotes: [
      "-D = --save-dev.",
      "--omit=dev replaces deprecated --production.",
      "NODE_ENV=production makes npm omit dev by default.",
      "Multi-stage Docker: full install to build, --omit=dev to run.",
    ],
    quiz: [
      {
        kind: 'find-bug', difficulty: 'intermediate',
        prompt: 'The Docker build fails with `sh: tsc: not found`. Why?',
        code: "FROM node:22-alpine\nENV NODE_ENV=production\nCOPY package*.json ./\nRUN npm ci\nCOPY . .\nRUN npm run build   # runs tsc",
        options: ["tsc must be installed globally in Docker","COPY order is wrong","npm ci cannot run in Alpine","NODE_ENV=production makes npm ci skip devDependencies, so typescript is not installed"],
        answer: 3,
        explanation: "With NODE_ENV=production npm omits dev dependencies by default. Set it only in the runtime stage, or use a multi-stage build.",
      },
      {
        kind: 'mcq', difficulty: 'beginner',
        prompt: 'Which flag adds a package to devDependencies?',
        options: ["-g","-E","-D","-P"],
        answer: 2,
        explanation: "-D / --save-dev. -g is global, -E is exact version, -P (--save-prod) is dependencies.",
      },
    ],
    interview: [
      {
        category: 'nodejs', kind: 'concept', difficulty: 'intermediate', topic: 'Dependencies',
        question: 'What does npm install --omit=dev do and when do you use it?',
        shortAnswer: 'It installs the dependency tree without packages reachable only through devDependencies; you use it for production images and deployments where build and test tooling is not needed.',
        detailedAnswer: [
          "Replaces the deprecated `--production` flag.",
          "Also the default when `NODE_ENV=production`.",
          "Typically `npm ci --omit=dev` in the final Docker stage.",
          "Compile/build steps must happen before, with dev deps present.",
        ],
        trap: "Setting NODE_ENV=production before the build step and losing the compiler.",
      },
    ],
  },

  'peer-dependencies': {
    summary: 'peerDependencies declare that a package must share the host project’s copy of another package (e.g. a React component library needs the app’s React); npm 7+ installs missing peers automatically and errors with ERESOLVE on conflicts.',
    topics: ['peerDependencies', 'peerDependenciesMeta', 'ERESOLVE', '--legacy-peer-deps', '--force', 'plugins', 'singleton packages'],
    sections: [
      section('introduction', undefined,
        text("A React component library must not bring its own React — two copies break hooks. Peer dependencies say: 'I work with *your* React, version 18 or 19'."),
      ),
      section('definition', 'Definition',
        bullets(
          "`peerDependencies`: packages the host must provide, with a compatible range.",
          "Used by plugins and libraries that extend a framework: eslint plugins, Babel presets, React/Vue component libraries, `@nestjs/*` modules.",
          "`peerDependenciesMeta: { \"x\": { \"optional\": true } }` marks a peer as optional.",
        ),
      ),
      section('why', 'Why not just a normal dependency',
        bullets(
          "A normal dependency may install a **second copy** nested under the library.",
          "Frameworks with global state or `instanceof` checks (React, GraphQL, Mongoose plugins) break with two copies.",
          "A peer forces a single shared copy at the host level.",
        ),
      ),
      section('internals', 'npm behaviour by version',
        table('Peer dependency handling', ['npm version', 'Behaviour'], [
          ['npm 3–6', 'Warn only; never install peers'],
          ['npm 7+', 'Install missing peers automatically; **fail with ERESOLVE** if a peer conflicts with what the project has'],
          ['`--legacy-peer-deps`', 'Ignore peers entirely (npm 6 behaviour) — no auto-install, no conflict check'],
          ['`--force`', 'Proceed despite conflicts, possibly installing incompatible versions'],
        ]),
        flow(['Read library peers: react@^18 || ^19', 'Check host tree: react@19.0.0', 'Compatible → share host copy', 'Incompatible → ERESOLVE error'], { title: 'Peer resolution', direction: 'horizontal' }),
      ),
      section('example', 'Declaring and resolving peers',
        code({
          title: 'Library package.json',
          language: 'json',
          code: dedent(`
            {
              "name": "@acme/react-table",
              "version": "3.0.0",
              "peerDependencies": {
                "react": "^18.0.0 || ^19.0.0",
                "react-dom": "^18.0.0 || ^19.0.0",
                "@tanstack/react-virtual": "^3.0.0"
              },
              "peerDependenciesMeta": {
                "@tanstack/react-virtual": { "optional": true }
              },
              "devDependencies": { "react": "^19.0.0", "react-dom": "^19.0.0" }
            }
          `),
          explanation: [
            "A wide range (`^18 || ^19`) reduces conflicts for consumers.",
            "Optional peers are not auto-installed; the library should feature-detect them.",
            "The library also lists React in devDependencies so its own tests can run.",
          ],
        }),
        code({
          title: 'An ERESOLVE conflict',
          language: 'bash',
          code: dedent(`
            npm install old-react-widget   # peer: react@^16
          `),
          expectedOutput: "npm error code ERESOLVE\nnpm error ERESOLVE unable to resolve dependency tree\nnpm error\nnpm error While resolving: my-app@1.0.0\nnpm error Found: react@19.0.0\nnpm error node_modules/react\nnpm error   react@\"^19.0.0\" from the root project\nnpm error\nnpm error Could not resolve dependency:\nnpm error peer react@\"^16.8.0\" from old-react-widget@2.3.1\nnpm error\nnpm error Fix the upstream dependency conflict, or retry\nnpm error this command with --force or --legacy-peer-deps\nnpm error to accept an incorrect (and potentially broken) dependency resolution.",
          explanation: [
            "The widget only supports React 16; the app has React 19.",
            "Best fix: upgrade or replace the widget.",
            "`--legacy-peer-deps` installs it anyway but the widget may break at runtime.",
          ],
        }),
      ),
      section('real-world', 'Real-world usage',
        bullets(
          "ESLint configs/plugins declare `eslint` as a peer.",
          "NestJS modules declare `@nestjs/common` and `@nestjs/core` as peers.",
          "If a team must use `--legacy-peer-deps`, put `legacy-peer-deps=true` in the project `.npmrc` so everyone and CI agree — and track it as tech debt.",
        ),
      ),
      section('mistakes', 'Common mistakes',
        bullets(
          "Library authors listing React in `dependencies` → duplicate React → 'Invalid hook call'.",
          "Over-narrow peer ranges (`react@18.2.0`) causing needless conflicts.",
          "Reaching for `--force` by reflex; it hides real incompatibilities.",
        ),
      ),
      section('interview', 'Interview angle',
        interviewTip("Show you know the npm 7 change (auto-install + ERESOLVE) and the difference between `--legacy-peer-deps` and `--force`."),
      ),
      section('practice', 'Practice',
        text("Create a tiny plugin package with `peerDependencies: { lodash: '^3' }`, `npm link` it into an app with lodash 4, and observe the ERESOLVE error."),
      ),
      section('summary', 'Summary',
        bullets(
          "Peers = 'use the host’s copy'.",
          "npm 7+ auto-installs peers and errors on conflicts.",
          "`--legacy-peer-deps` ignores peers; `--force` overrides conflicts.",
          "Use wide ranges; mark optional peers in peerDependenciesMeta.",
        ),
      ),
    ],
    revisionNotes: [
      "peerDependencies → single shared copy at host.",
      "npm 7+ installs peers automatically.",
      "ERESOLVE = unresolvable peer conflict.",
      "--legacy-peer-deps = npm 6 behaviour (ignore peers).",
      "peerDependenciesMeta.optional for optional peers.",
    ],
    quiz: [
      {
        kind: 'mcq', difficulty: 'intermediate',
        prompt: 'What changed about peer dependencies in npm 7?',
        options: ['They were removed', 'npm began installing missing peers automatically and failing on conflicts', 'They became the same as devDependencies', 'They are now only warnings'],
        answer: 1,
        explanation: "npm 3–6 only warned. npm 7+ installs peers and raises ERESOLVE on conflicts.",
      },
      {
        kind: 'scenario', difficulty: 'intermediate',
        prompt: 'You maintain a React component library. A user reports "Invalid hook call" errors. package.json has react under dependencies. Fix?',
        options: ['Move react to peerDependencies (and devDependencies for your own tests)', 'Pin react to an exact version in dependencies', 'Add react to bundleDependencies', 'Tell users to run npm dedupe'],
        answer: 0,
        explanation: "As a dependency, a second React copy can be installed under your package. A peer ensures the app's single React is used.",
      },
    ],
    interview: [
      {
        category: 'nodejs', kind: 'concept', difficulty: 'intermediate', topic: 'Peer dependencies',
        question: 'What are peer dependencies and when should a package use them?',
        shortAnswer: 'Peer dependencies declare that a package needs the host project to provide a compatible version of another package, so both share one copy. Plugins and framework extensions use them — e.g. a React component library peers on react.',
        detailedAnswer: [
          "Prevents duplicate copies of singleton-like frameworks.",
          "npm 7+ installs missing peers automatically.",
          "Conflicts produce ERESOLVE errors.",
          "Use wide ranges and `peerDependenciesMeta` for optional peers.",
        ],
        followUp: 'How do you handle an ERESOLVE error?',
      },
      {
        category: 'nodejs', kind: 'scenario', difficulty: 'advanced', topic: 'Peer dependencies',
        question: 'What does an ERESOLVE error mean, and what are the trade-offs of --legacy-peer-deps versus --force?',
        shortAnswer: 'ERESOLVE means npm cannot build a tree that satisfies all peer dependency ranges. --legacy-peer-deps ignores peer dependencies entirely; --force keeps checking but overrides conflicts. Both can produce a tree where a package runs against a version it does not support.',
        detailedAnswer: [
          "Root fix: upgrade/replace the package or align versions.",
          "`--legacy-peer-deps` also stops auto-installing peers you may actually need.",
          "`--force` may install conflicting peer versions and also bypasses other safety checks.",
          "If you must, set it in `.npmrc` so CI and teammates match, and document why.",
          "`overrides` can sometimes align a transitive package instead.",
        ],
        trap: "Treating the flags as fixes rather than as suppressing a real incompatibility.",
      },
    ],
  },

  'semantic-versioning': {
    summary: 'SemVer versions are MAJOR.MINOR.PATCH; npm ranges like ^1.2.3 (<2.0.0), ~1.2.3 (<1.3.0) and exact 1.2.3 control what updates are allowed, with caret becoming stricter for 0.x versions.',
    topics: ['semver', 'MAJOR.MINOR.PATCH', 'caret', 'tilde', 'exact version', '0.x', 'prerelease', 'ranges', 'npm version'],
    sections: [
      section('introduction', undefined,
        text("A version number is a promise. SemVer says what kind of change each part signals, and npm ranges decide which future versions you accept automatically."),
      ),
      section('definition', 'MAJOR.MINOR.PATCH',
        table('Version parts', ['Part', 'Bump when', 'Example'], [
          ['MAJOR', 'Breaking API change', '4.21.2 → 5.0.0'],
          ['MINOR', 'New backwards-compatible feature', '4.21.2 → 4.22.0'],
          ['PATCH', 'Backwards-compatible bug fix', '4.21.2 → 4.21.3'],
          ['Prerelease', 'Unstable preview', '5.0.0-beta.1'],
          ['Build metadata', 'Ignored for precedence', '1.0.0+sha.abc'],
        ]),
      ),
      section('why', 'Why ranges',
        bullets(
          "Accept bug and security fixes without editing package.json.",
          "Let npm deduplicate: two packages wanting `^1.2.0` and `^1.4.0` can share 1.4.x.",
          "The lockfile still pins exact versions for reproducibility.",
        ),
      ),
      section('internals', 'Range syntax',
        table('npm range operators', ['Range', 'Means', 'Accepts', 'Rejects'], [
          ['`1.2.3`', 'Exact', '1.2.3', '1.2.4'],
          ['`^1.2.3`', '>=1.2.3 <2.0.0', '1.9.0', '2.0.0'],
          ['`~1.2.3`', '>=1.2.3 <1.3.0', '1.2.9', '1.3.0'],
          ['`^0.2.3`', '>=0.2.3 <0.3.0', '0.2.9', '0.3.0'],
          ['`^0.0.3`', '>=0.0.3 <0.0.4', '0.0.3 only', '0.0.4'],
          ['`>=1.2.0 <1.5.0`', 'Explicit bounds', '1.4.9', '1.5.0'],
          ['`1.x` / `1.*`', '>=1.0.0 <2.0.0', '1.7.0', '2.0.0'],
          ['`^1.2.3 || ^2.0.0`', 'Either range', '2.1.0', '3.0.0'],
          ['`*` / `latest`', 'Anything / dist-tag', '—', 'Avoid in apps'],
        ]),
        bullets(
          "Caret = 'do not change the left-most non-zero part'. For 0.x, the minor acts like a major.",
          "Prereleases are only matched if a range explicitly contains a prerelease of the same `major.minor.patch` (e.g. `^5.0.0-beta.1` matches `5.0.0-beta.3`).",
          "npm saves `^` by default; change with `save-prefix` or `--save-exact`.",
        ),
      ),
      section('example', 'Computing caret ranges',
        code({
          title: 'Caret upper bounds (pure JS)',
          runnable: true,
          code: dedent(`
            function caretRange(version) {
              const [major, minor, patch] = version.split('.').map(Number);
              let upper;
              if (major > 0) upper = (major + 1) + '.0.0';
              else if (minor > 0) upper = '0.' + (minor + 1) + '.0';
              else upper = '0.0.' + (patch + 1);
              return '^' + version + ' → >=' + version + ' <' + upper;
            }

            for (const v of ['1.2.3', '0.2.3', '0.0.3']) console.log(caretRange(v));
          `),
          expectedOutput: '^1.2.3 → >=1.2.3 <2.0.0\n^0.2.3 → >=0.2.3 <0.3.0\n^0.0.3 → >=0.0.3 <0.0.4',
          explanation: [
            "For 1.x and above the caret allows minor and patch updates.",
            "For 0.x the caret allows only patches — the minor is treated as breaking.",
            "For 0.0.x the caret allows nothing beyond the exact version.",
          ],
        }),
        code({
          title: 'Bumping your own version',
          language: 'bash',
          code: dedent(`
            npm version patch    # 1.4.2 → 1.4.3
            npm version minor    # 1.4.3 → 1.5.0
            npm version major    # 1.5.0 → 2.0.0
            npm version prerelease --preid=beta
          `),
          expectedOutput: 'v1.4.3\nv1.5.0\nv2.0.0\nv2.0.1-beta.0',
          explanation: [
            "`npm version` updates package.json and the lockfile; in a git repo it also commits and creates a tag.",
            "`prerelease --preid=beta` from 2.0.0 produces 2.0.1-beta.0.",
          ],
        }),
      ),
      section('real-world', 'Real-world usage',
        bullets(
          "Apps: caret ranges + committed lockfile is the common default.",
          "Some teams pin exact versions (`save-exact=true`) and rely on Renovate/Dependabot for updates.",
          "Libraries: wide ranges for dependencies to avoid duplicates in consumers.",
          "Treat 0.x packages as unstable: any minor can break.",
        ),
      ),
      section('mistakes', 'Common mistakes',
        bullets(
          "Assuming `^0.3.1` accepts 0.4.0.",
          "Trusting that every author follows SemVer — patches can still break; tests and lockfiles protect you.",
          "Using `*` or `latest` in package.json.",
        ),
      ),
      section('interview', 'Interview angle',
        interviewTip("Expect 'what does ^ mean?' then 'what about ^0.2.3?'. The 0.x caret rule is the trap."),
      ),
      section('practice', 'Practice',
        text("For each range, write the highest accepted version among [1.2.3, 1.2.9, 1.3.0, 2.0.0, 0.2.5, 0.3.0]: `^1.2.3`, `~1.2.3`, `^0.2.3`, `1.x`."),
      ),
      section('summary', 'Summary',
        bullets(
          "MAJOR breaking, MINOR feature, PATCH fix.",
          "^ allows minor+patch (for >=1.0.0); ~ allows patch.",
          "^0.x allows patch only; ^0.0.x exact.",
          "Lockfile pins exact versions regardless of range.",
        ),
      ),
    ],
    revisionNotes: [
      "^1.2.3 = >=1.2.3 <2.0.0.",
      "~1.2.3 = >=1.2.3 <1.3.0.",
      "^0.2.3 = >=0.2.3 <0.3.0; ^0.0.3 = exactly 0.0.3.",
      "Prereleases only match same major.minor.patch with a prerelease range.",
      "npm saves ^ by default; --save-exact / save-exact=true to pin.",
    ],
    quiz: [
      {
        kind: 'mcq', difficulty: 'beginner',
        prompt: 'Which version satisfies `~2.4.1`?',
        options: ["2.5.0","2.4.0","3.0.0","2.4.9"],
        answer: 3,
        explanation: "Tilde allows patch updates only: >=2.4.1 <2.5.0. 2.4.0 is below the lower bound.",
      },
      {
        kind: 'mcq', difficulty: 'intermediate',
        prompt: 'Which is the highest version allowed by `^0.8.2`?',
        options: ['0.9.0', '1.0.0', '0.8.x (any 0.8 patch)', '0.8.2 exactly'],
        answer: 2,
        explanation: "For 0.x versions the caret locks the minor: >=0.8.2 <0.9.0.",
      },
      {
        kind: 'scenario', difficulty: 'beginner',
        prompt: 'A library removes a public function. Which version bump does SemVer require?',
        options: ["Patch","Major","Minor","None, if documented"],
        answer: 1,
        explanation: "Removing API is a breaking change → MAJOR.",
      },
    ],
    interview: [
      {
        category: 'nodejs', kind: 'concept', difficulty: 'beginner', topic: 'SemVer',
        question: 'What do the ^ and ~ prefixes mean in an npm version range?',
        shortAnswer: 'Caret (^1.2.3) accepts any version below the next major (>=1.2.3 <2.0.0); tilde (~1.2.3) accepts patch updates only (>=1.2.3 <1.3.0).',
        detailedAnswer: [
          "npm writes ^ by default when saving.",
          "No prefix means exact.",
          "Lockfile still pins one exact version.",
          "`npm update` moves within these ranges.",
        ],
        followUp: 'How does ^ behave with 0.x versions?',
      },
      {
        category: 'nodejs', kind: 'concept', difficulty: 'intermediate', topic: 'SemVer',
        question: 'How does the caret range behave for 0.x and 0.0.x versions, and why?',
        shortAnswer: 'Caret never changes the left-most non-zero digit: ^0.2.3 means >=0.2.3 <0.3.0 and ^0.0.3 means only 0.0.3. SemVer treats 0.x as unstable, so a minor bump may be breaking.',
        detailedAnswer: [
          "SemVer: 'Major version zero is for initial development. Anything may change.'",
          "npm therefore treats the minor in 0.x like a major.",
          "Upgrading 0.2 → 0.3 needs an explicit install.",
          "Tilde on 0.x behaves the same as caret for 0.y.z where y > 0.",
        ],
        trap: "Assuming ^0.2.3 accepts 0.9.0.",
      },
    ],
  },
};

export default content;
