import type { ModuleContent } from '../../../types';
import { bullets, code, dedent, diagram, flow, interviewTip, note, section, steps, table, text, warn } from '../helpers';

const content: Partial<ModuleContent> = {
  'npm-audit': {
    summary: '`npm audit` checks your installed tree against the registry’s advisory database; `npm audit fix` applies semver-compatible upgrades, while `--force` may install breaking major versions; triage by reachability, not just severity.',
    topics: ['npm audit', 'npm audit fix', '--force', '--audit-level', '--omit=dev', 'advisories', 'GHSA', 'npm audit signatures', 'overrides'],
    sections: [
      section('introduction', undefined,
        text("Hundreds of transitive packages mean some will have known vulnerabilities. `npm audit` tells you which, and how to fix them."),
      ),
      section('definition', 'Commands',
        table('npm audit commands', ['Command', 'Effect'], [
          ['`npm audit`', 'Report vulnerabilities in the tree (from the lockfile)'],
          ['`npm audit --omit=dev`', 'Only production dependencies'],
          ['`npm audit --audit-level=high`', 'Exit non-zero only for high/critical (CI gate)'],
          ['`npm audit --json`', 'Machine-readable output'],
          ['`npm audit fix`', 'Upgrade to non-breaking (in-range) fixed versions'],
          ['`npm audit fix --force`', 'Also apply **semver-major** upgrades — may break your app'],
          ['`npm audit fix --dry-run`', 'Show what would change'],
          ['`npm audit signatures`', 'Verify registry signatures and provenance attestations'],
        ]),
      ),
      section('why', 'Why audit',
        bullets(
          "Known CVEs in dependencies are among the most common real-world vulnerabilities (OWASP: vulnerable and outdated components).",
          "Automated checks in CI catch problems on every PR.",
          "Security deep-dive: Module 12 (dependency vulnerabilities).",
        ),
      ),
      section('internals', 'How it works',
        flow(['npm sends the dependency tree (names + versions) to the registry audit endpoint', 'Registry matches against GitHub Advisory Database', 'Report: severity, vulnerable range, patched version, dependency path', 'fix: Arborist computes the smallest in-range upgrades'], { title: 'Audit flow', direction: 'vertical' }),
        table('fix vs fix --force', ['', '`npm audit fix`', '`npm audit fix --force`'], [
          ['Stays within package.json ranges', 'Yes', 'No — can bump majors'],
          ['Risk of breaking changes', 'Low', 'High'],
          ['Can downgrade packages', 'No', 'Yes, sometimes (to a non-vulnerable older major)'],
          ['When to use', 'Routinely', 'Rarely; review the diff and run tests'],
        ]),
      ),
      section('example', 'Reading an audit report',
        code({
          title: 'npm audit',
          language: 'bash',
          code: dedent(`
            npm audit
          `),
          expectedOutput: "# npm audit report\n\ncross-spawn  7.0.0 - 7.0.4\nSeverity: high\nRegular Expression Denial of Service (ReDoS) in cross-spawn - https://github.com/advisories/GHSA-3xgq-45jj-v275\nfix available via `npm audit fix`\nnode_modules/cross-spawn\n\nsemver  7.0.0 - 7.5.1\nSeverity: high\nsemver vulnerable to Regular Expression Denial of Service - https://github.com/advisories/GHSA-c2qf-rxjj-qqgw\nfix available via `npm audit fix --force`\nWill install some-old-cli@3.0.0, which is a breaking change\nnode_modules/some-old-cli/node_modules/semver\n  some-old-cli  <=2.9.0\n  Depends on vulnerable versions of semver\n\n2 high severity vulnerabilities\n\nTo address issues that do not require attention, run:\n  npm audit fix\n\nTo address all issues (including breaking changes), run:\n  npm audit fix --force",
          explanation: [
            "The first issue is fixable within ranges → `npm audit fix`.",
            "The second needs a major upgrade of `some-old-cli` → `--force` would install 3.0.0 (breaking).",
            "Better: check if `some-old-cli` is dev-only, upgrade it deliberately, or use `overrides` for `semver`.",
          ],
        }),
        code({
          title: 'CI gate',
          language: 'yaml',
          code: dedent(`
            - run: npm ci
            - run: npm audit --omit=dev --audit-level=high
          `),
          explanation: [
            "Fails the pipeline only on high/critical issues in production dependencies.",
            "Dev-only issues are still worth fixing but do not block deploys.",
          ],
        }),
      ),
      section('real-world', 'Triage checklist',
        steps(
          "Is it in production code (`--omit=dev`) or only build tooling?",
          "Is the vulnerable function reachable with untrusted input?",
          "Is there an in-range fix (`npm audit fix`)?",
          "Otherwise: upgrade the parent, add an `overrides` entry, or replace the package.",
          "Document accepted risks; recheck regularly.",
        ),
      ),
      section('mistakes', 'Common mistakes',
        bullets(
          "Running `npm audit fix --force` blindly — it can jump majors (or downgrade) and break the app.",
          "Treating every 'high' in a dev-only tool as an emergency (noise fatigue).",
          "Ignoring audit entirely because of noise.",
        ),
        warn("`npm audit fix --force` changes package.json ranges to breaking versions. Always review the diff and run the full test suite."),
      ),
      section('interview', 'Interview angle',
        interviewTip("Show a triage mindset: production vs dev, reachability, in-range fix vs override vs upgrade — and why `--force` is risky."),
      ),
      section('practice', 'Practice',
        text("Install an old package with known advisories (e.g. `npm i lodash@4.17.15`), run `npm audit`, then `npm audit fix --dry-run` and finally fix it."),
      ),
      section('summary', 'Summary',
        bullets(
          "`npm audit` = known vulnerabilities in your tree.",
          "`fix` stays in range; `--force` may break.",
          "Gate CI with `--omit=dev --audit-level=high`.",
          "Triage by reachability; use overrides as a stopgap.",
        ),
      ),
    ],
    revisionNotes: [
      "Data source: GitHub Advisory Database via the registry.",
      "audit fix = in-range; --force = majors/downgrades.",
      "--audit-level sets failing threshold.",
      "npm audit signatures verifies signatures/provenance.",
    ],
    quiz: [
      {
        kind: 'mcq', difficulty: 'intermediate',
        prompt: 'What extra risk does `npm audit fix --force` introduce compared to `npm audit fix`?',
        options: ['It disables integrity checks', 'It may install semver-major (breaking) versions', 'It uploads your source code', 'It deletes the lockfile'],
        answer: 1,
        explanation: "--force ignores your ranges to reach a fixed version, which can be a breaking major — or occasionally an older major.",
      },
      {
        kind: 'scenario', difficulty: 'intermediate',
        prompt: 'CI fails on a moderate vulnerability in a webpack plugin used only at build time. Your API’s production deps are clean. Reasonable CI policy?',
        options: ["Gate on `npm audit --omit=dev --audit-level=high` and track dev-only issues separately","Ignore npm audit forever","Run audit fix --force in CI automatically","Remove the lockfile so audit cannot run"],
        answer: 0,
        explanation: "Gating on production + high severity blocks real risk without noise; dev issues still get fixed through regular updates.",
      },
    ],
    interview: [
      {
        category: 'nodejs', kind: 'scenario', difficulty: 'intermediate', topic: 'npm audit',
        question: 'What does npm audit fix --force do and why is it risky?',
        shortAnswer: 'It applies fixes that require leaving your declared semver ranges, such as installing a new major version of a package, which can introduce breaking changes or even downgrades; plain npm audit fix only applies in-range updates.',
        detailedAnswer: [
          "It rewrites package.json ranges.",
          "The fixed version may have a different API.",
          "Review with `--dry-run` and run tests.",
          "Alternatives: upgrade the parent deliberately or use `overrides`.",
        ],
        trap: "Assuming --force just 'tries harder' with the same safety.",
      },
    ],
  },

  'creating-custom-packages': {
    summary: 'A package is a folder with package.json; design its public API with `exports`, ship only build output with `files`, add CLIs via `bin`, test locally with `npm link` or `npm pack`, and check contents with `npm pack --dry-run`.',
    topics: ['npm init', 'exports', 'files', 'bin', 'types', 'npm link', 'npm pack', '--dry-run', '.npmignore', 'dual package'],
    sections: [
      section('introduction', undefined,
        text("Sharing code between projects — a logger, an SDK, a CLI — starts with turning a folder into a well-shaped package."),
      ),
      section('definition', 'Anatomy of a package',
        table('Important fields for libraries', ['Field', 'Purpose'], [
          ['`name`', 'Unique; scoped `@org/name` avoids collisions'],
          ['`version`', 'SemVer, starts at 0.1.0 or 1.0.0'],
          ['`exports`', 'Public entry points; blocks deep imports'],
          ['`main` / `types`', 'Fallback entry; TypeScript declarations'],
          ['`files`', 'Allow-list of what goes into the tarball'],
          ['`bin`', 'CLI commands: `{ "mycli": "./bin/cli.js" }`'],
          ['`engines`', 'Supported Node versions'],
          ['`sideEffects`', '`false` lets bundlers tree-shake'],
          ['`license`, `repository`', 'Metadata shown on npmjs.com'],
        ]),
        note("Always included regardless of `files`: package.json, README, LICENSE, and the `main` file. Always excluded: `.git`, `node_modules`, `.npmrc`, lockfiles."),
      ),
      section('why', 'Why careful packaging',
        bullets(
          "`files` prevents leaking tests, source maps, `.env` files or secrets.",
          "`exports` makes the public API explicit — you can refactor internals safely.",
          "Smaller tarballs install faster for every consumer.",
        ),
      ),
      section('internals', 'Local development loop',
        table('Testing a package locally', ['Method', 'How', 'Notes'], [
          ['`npm link`', '`npm link` in lib, `npm link my-lib` in app', 'Symlink; fast edits; can cause duplicate deps (e.g. React)'],
          ['`npm pack`', 'Creates `my-lib-1.0.0.tgz`; `npm i ../my-lib/my-lib-1.0.0.tgz`', 'Tests exactly what will be published'],
          ['`file:` dependency', '`npm i ../my-lib`', 'Symlinked like link, recorded in package.json'],
          ['Workspaces', 'Monorepo with `workspaces`', 'Best for long-term multi-package repos'],
        ]),
      ),
      section('example', 'A small CLI + library package',
        code({
          title: 'package.json',
          language: 'json',
          code: dedent(`
            {
              "name": "@ada/slugify",
              "version": "1.0.0",
              "description": "Turn titles into URL slugs",
              "type": "module",
              "exports": {
                ".": { "types": "./dist/index.d.ts", "default": "./dist/index.js" }
              },
              "bin": { "slugify": "./dist/cli.js" },
              "files": ["dist"],
              "engines": { "node": ">=20" },
              "sideEffects": false,
              "license": "MIT",
              "scripts": {
                "build": "tsc",
                "prepublishOnly": "npm run build && node --test"
              }
            }
          `),
          explanation: [
            "Only `dist/` (plus README, LICENSE, package.json) is published.",
            "`bin` links `slugify` into `.bin` for consumers, or onto PATH with `-g`.",
            "The CLI file must start with `#!/usr/bin/env node`.",
          ],
        }),
        code({
          title: 'The library code (pure JS)',
          runnable: true,
          code: dedent(`
            function slugify(title) {
              return title
                .toLowerCase()
                .normalize('NFKD')
                .replace(/[\\u0300-\\u036f]/g, '')
                .replace(/[^a-z0-9]+/g, '-')
                .replace(/^-+|-+$/g, '');
            }

            console.log(slugify('Hello, World!'));
            console.log(slugify('  Crème Brûlée Recipes 2025 '));
          `),
          expectedOutput: 'hello-world\ncreme-brulee-recipes-2025',
          explanation: [
            "`normalize('NFKD')` splits accented letters into base + combining mark; the next regex removes the marks.",
            "Runs of non-alphanumerics become one `-`; leading/trailing dashes are trimmed.",
          ],
        }),
        code({
          title: 'Check the tarball before publishing',
          language: 'bash',
          code: dedent(`
            npm pack --dry-run
          `),
          expectedOutput: "npm notice\nnpm notice package: @ada/slugify@1.0.0\nnpm notice Tarball Contents\nnpm notice 1.1kB LICENSE\nnpm notice 412B README.md\nnpm notice 389B dist/cli.js\nnpm notice 95B dist/index.d.ts\nnpm notice 301B dist/index.js\nnpm notice 612B package.json\nnpm notice Tarball Details\nnpm notice name: @ada/slugify\nnpm notice version: 1.0.0\nnpm notice filename: ada-slugify-1.0.0.tgz\nnpm notice package size: 1.6 kB\nnpm notice unpacked size: 2.9 kB\nnpm notice total files: 6\nnpm notice\nada-slugify-1.0.0.tgz",
          explanation: [
            "Lists exactly what would be published — no `src/`, tests or `.env`.",
            "Without `--dry-run`, `npm pack` writes the `.tgz` file you can install elsewhere.",
          ],
        }),
      ),
      section('real-world', 'Real-world usage',
        bullets(
          "Internal SDKs published to a private registry under `@company/*`.",
          "Shared ESLint/TSConfig presets.",
          "CLIs distributed with `npx @company/tool`.",
        ),
      ),
      section('mistakes', 'Common mistakes',
        bullets(
          "No `files` and no `.npmignore` → publishing tests, fixtures, even `.env`.",
          "Using both `files` and `.npmignore` — `files` wins at the root; keep one strategy.",
          "Missing shebang or wrong line endings in a `bin` file (CRLF breaks `/usr/bin/env node` on Unix).",
          "Framework (React) as a dependency instead of a peer.",
        ),
      ),
      section('interview', 'Interview angle',
        interviewTip("Mention `exports`, `files`, `npm pack --dry-run` and `npm link` vs `npm pack` for local testing."),
      ),
      section('practice', 'Practice',
        text("Package the slugify function with a CLI, run `npm pack`, install the tarball in another project and run `npx slugify \"Hello World\"`."),
      ),
      section('summary', 'Summary',
        bullets(
          "Folder + package.json = package.",
          "`exports` for API, `files` for contents, `bin` for CLIs.",
          "Test with `npm pack` (exact) or `npm link` (fast).",
          "Verify with `npm pack --dry-run`.",
        ),
      ),
    ],
    revisionNotes: [
      "files = allow-list; package.json/README/LICENSE always included.",
      "npm pack --dry-run shows tarball contents.",
      "npm link = global symlink + link into app.",
      "bin files need #!/usr/bin/env node.",
      "sideEffects: false enables tree-shaking.",
    ],
    quiz: [
      {
        kind: 'mcq', difficulty: 'beginner',
        prompt: 'Which command shows the files that would be included in your published package without creating it?',
        options: ["npm ls","npm view files","npm publish --list","npm pack --dry-run"],
        answer: 3,
        explanation: "npm pack --dry-run (also npm publish --dry-run) prints the tarball contents.",
      },
      {
        kind: 'find-bug', difficulty: 'intermediate',
        prompt: 'After publishing, consumers report the package is 40 MB and includes test fixtures. What is missing?',
        code: '{\n  "name": "@acme/pdf",\n  "version": "1.0.0",\n  "main": "dist/index.js"\n}',
        options: ["A \"private\": true field","An \"engines\" field","A \"files\": [\"dist\"] allow-list (or an .npmignore)","A \"bin\" field"],
        answer: 2,
        explanation: "Without files/.npmignore npm publishes everything not ignored by default (roughly what is not in .gitignore). An allow-list is safest.",
      },
    ],
    interview: [
      {
        category: 'nodejs', kind: 'concept', difficulty: 'intermediate', topic: 'Creating packages',
        question: 'What does the files field in package.json do, and how do you check what will be published?',
        shortAnswer: 'files is an allow-list of paths included in the published tarball (package.json, README and LICENSE are always added). Run npm pack --dry-run or npm publish --dry-run to see the exact contents.',
        detailedAnswer: [
          "Prevents leaking tests, source, config or secrets.",
          "Alternative is a deny-list `.npmignore` (falls back to `.gitignore`).",
          "`npm pack` creates the real `.tgz` for local install testing.",
          "Keep tarballs small for faster installs.",
        ],
      },
    ],
  },

  'publishing-packages': {
    summary: 'Publish with `npm login` → `npm version` → `npm publish`; scoped packages are private by default, so use `--access public`; prefer CI publishing with provenance (`--provenance`) and 2FA; use dist-tags for prereleases and `npm deprecate` instead of unpublishing.',
    topics: ['npm publish', 'npm login', 'scoped packages', '--access public', 'dist-tags', '--tag', 'provenance', '2FA', 'npm deprecate', 'unpublish policy', 'trusted publishing'],
    sections: [
      section('introduction', undefined,
        text("Publishing makes your package installable by anyone — or by your organisation. Doing it safely means correct versioning, access settings and supply-chain protections."),
      ),
      section('definition', 'The publish workflow',
        steps(
          "`npm login` (or a CI token / trusted publishing) — check with `npm whoami`.",
          "`npm version patch|minor|major` — bumps version, commits and tags in git.",
          "`npm publish` — runs `prepublishOnly`, `prepack`, `prepare`, packs and uploads.",
          "`git push --follow-tags`.",
        ),
        table('Access rules', ['Package', 'Default visibility', 'Make public'], [
          ['Unscoped (`slugify`)', 'Public', '—'],
          ['Scoped (`@ada/slugify`)', 'Restricted (private; needs paid plan/org)', '`npm publish --access public` or `publishConfig.access`'],
        ]),
      ),
      section('why', 'Why the extra safeguards',
        bullets(
          "Published versions are immutable — the same version number can never be reused.",
          "Stolen npm tokens have been used to push malicious versions of popular packages.",
          "Provenance and 2FA let consumers verify the package came from your CI and source repo.",
        ),
      ),
      section('internals', 'dist-tags, provenance and removal',
        table('Release channels', ['Command', 'Effect'], [
          ['`npm publish`', 'Sets dist-tag `latest` → what `npm i pkg` installs'],
          ['`npm publish --tag beta`', 'Publishes without moving `latest`; install via `pkg@beta`'],
          ['`npm dist-tag add pkg@2.0.0 latest`', 'Promote a version'],
          ['`npm deprecate pkg@"<1.4" "msg"`', 'Warn on install; preferred over unpublish'],
          ['`npm unpublish pkg@1.0.1`', 'Only allowed under registry policy (e.g. within 72 h, or no dependents)'],
        ]),
        bullets(
          "**Provenance**: when publishing from a supported CI (GitHub Actions, GitLab CI) with OIDC, `npm publish --provenance` attaches a signed Sigstore attestation linking the tarball to the source commit and workflow.",
          "Consumers verify with `npm audit signatures`; npmjs.com shows a provenance badge.",
          "**Trusted publishing** (OIDC) lets CI publish without long-lived tokens; configure it on npmjs.com for the package.",
          "Enable **2FA** for your account and require it for publishing.",
        ),
        flow(['git tag v1.2.0 pushed', 'CI: npm ci + tests + build', 'CI: npm publish --provenance --access public', 'Registry: stores tarball + Sigstore attestation', 'Consumer: npm audit signatures'], { title: 'Secure release pipeline', direction: 'horizontal' }),
      ),
      section('example', 'Publishing a scoped package',
        code({
          title: 'Manual publish',
          language: 'bash',
          code: dedent(`
            npm whoami
            npm version minor
            npm publish --access public
          `),
          expectedOutput: "ada\nv1.1.0\nnpm notice\nnpm notice package: @ada/slugify@1.1.0\nnpm notice Tarball Contents\nnpm notice 1.1kB LICENSE\nnpm notice 412B README.md\nnpm notice 389B dist/cli.js\nnpm notice 95B dist/index.d.ts\nnpm notice 301B dist/index.js\nnpm notice 612B package.json\nnpm notice Tarball Details\nnpm notice name: @ada/slugify\nnpm notice version: 1.1.0\nnpm notice total files: 6\nnpm notice\nnpm notice Publishing to https://registry.npmjs.org/ with tag latest and public access\n+ @ada/slugify@1.1.0",
          explanation: [
            "Without `--access public` a scoped package would be published as restricted — failing with a 402/403 if your account cannot host private packages.",
            "`+ @ada/slugify@1.1.0` confirms the upload.",
          ],
        }),
        code({
          title: 'GitHub Actions release with provenance',
          language: 'yaml',
          code: dedent(`
            name: release
            on:
              push:
                tags: ['v*']
            permissions:
              contents: read
              id-token: write   # required for provenance (OIDC)
            jobs:
              publish:
                runs-on: ubuntu-latest
                steps:
                  - uses: actions/checkout@v4
                  - uses: actions/setup-node@v4
                    with:
                      node-version: 22
                      registry-url: https://registry.npmjs.org
                  - run: npm ci
                  - run: npm test
                  - run: npm publish --provenance --access public
                    env:
                      NODE_AUTH_TOKEN: \${{ secrets.NPM_TOKEN }}
          `),
          explanation: [
            "`id-token: write` lets the job obtain an OIDC token used to sign the provenance statement.",
            "`setup-node` with `registry-url` writes an `.npmrc` that reads `NODE_AUTH_TOKEN`.",
            "With trusted publishing configured, the token secret can be dropped entirely.",
          ],
        }),
      ),
      section('real-world', 'Real-world usage',
        bullets(
          "Prereleases: `npm version prerelease --preid=rc` + `npm publish --tag next`.",
          "Monorepos: Changesets or semantic-release automate versioning and changelogs.",
          "Set `\"publishConfig\": { \"access\": \"public\", \"provenance\": true }` so nobody forgets flags.",
        ),
      ),
      section('mistakes', 'Common mistakes',
        bullets(
          "Forgetting `--access public` for a scoped package.",
          "Publishing a beta without `--tag` → it becomes `latest` for everyone.",
          "Trying to republish the same version — `E403 You cannot publish over the previously published versions`.",
          "Long-lived automation tokens with broad scope stored in many places.",
        ),
        warn("Never unpublish to 'fix' a bad release — publish a new patch and `npm deprecate` the broken version."),
      ),
      section('interview', 'Interview angle',
        interviewTip("Cover the workflow, scoped access, dist-tags and supply-chain security (2FA, provenance, trusted publishing)."),
      ),
      section('practice', 'Practice',
        text("Publish a scoped test package publicly, then publish a `beta` under `--tag beta`, confirm `npm view @you/pkg dist-tags`, and deprecate the beta."),
      ),
      section('summary', 'Summary',
        bullets(
          "login → version → publish → push tags.",
          "Scoped = restricted by default → `--access public`.",
          "dist-tags for channels; never reuse versions.",
          "Provenance + 2FA/trusted publishing for supply-chain security.",
          "Deprecate rather than unpublish.",
        ),
      ),
    ],
    revisionNotes: [
      "Scoped packages need --access public (or publishConfig.access).",
      "npm publish --tag beta keeps latest unchanged.",
      "Versions are immutable; unpublish is restricted.",
      "--provenance needs CI OIDC (id-token: write).",
      "Verify with npm audit signatures.",
    ],
    quiz: [
      {
        kind: 'scenario', difficulty: 'beginner',
        prompt: 'You publish `@ada/utils` for the first time with a free account and get a payment-required error. Fix?',
        options: ['Rename it without a scope', 'Run npm publish --access public', 'Use npm publish --force', 'Add "private": false'],
        answer: 1,
        explanation: "Scoped packages default to restricted (private) access, which needs a paid plan. --access public publishes it publicly. Renaming works too but loses the scope.",
      },
      {
        kind: 'find-bug', difficulty: 'intermediate',
        prompt: 'Users installing `npm i @acme/sdk` suddenly get an unstable 3.0.0-beta.1. What went wrong?',
        code: "npm version 3.0.0-beta.1\nnpm publish",
        options: ["npm publish without --tag moved the latest dist-tag to the beta","Prereleases cannot be published","The version string is invalid","Users had ^3 ranges"],
        answer: 0,
        explanation: "Publishing always sets `latest` unless --tag is given. Fix with `npm dist-tag add @acme/sdk@2.x.y latest` and publish betas with --tag beta.",
      },
      {
        kind: 'mcq', difficulty: 'advanced',
        prompt: 'What does an npm provenance attestation prove?',
        options: ["That the code has no vulnerabilities","That the package follows SemVer","That the author passed 2FA","That the tarball was built from a specific source commit by a specific CI workflow"],
        answer: 3,
        explanation: "Provenance (Sigstore-signed, via CI OIDC) links the package to its repo, commit and build workflow. It says nothing about code quality or vulnerabilities.",
      },
    ],
    interview: [
      {
        category: 'nodejs', kind: 'concept', difficulty: 'beginner', topic: 'Publishing',
        question: 'How do you publish a scoped package so that it is publicly installable?',
        shortAnswer: 'Log in, bump the version, and run npm publish --access public (or set publishConfig.access to public), because scoped packages are restricted by default.',
        detailedAnswer: [
          "Scope must be your username or an org you belong to.",
          "Unscoped packages are always public.",
          "Check contents first with `npm publish --dry-run`.",
          "Push the git tag created by `npm version`.",
        ],
      },
      {
        category: 'nodejs', kind: 'concept', difficulty: 'advanced', topic: 'Publishing',
        question: 'What is npm package provenance and how does it improve supply-chain security?',
        shortAnswer: 'Provenance is a signed attestation, generated when publishing from a supported CI with OIDC, that records which source repository, commit and workflow produced the tarball; consumers can verify it, making it harder to pass off a tarball built elsewhere — for example with a stolen token — as legitimate.',
        detailedAnswer: [
          "Enabled with `npm publish --provenance` (or `publishConfig.provenance`).",
          "Requires `id-token: write` in GitHub Actions (or GitLab equivalent).",
          "Signed via Sigstore and recorded in a public transparency log.",
          "Verify with `npm audit signatures`; npmjs.com shows a badge.",
          "Combine with trusted publishing (no long-lived tokens) and 2FA.",
        ],
        followUp: 'What does provenance NOT guarantee?',
        trap: "Thinking provenance means the code is safe — a malicious commit in the real repo still gets valid provenance.",
      },
    ],
  },

  'understanding-node-modules': {
    summary: 'npm (v3+) installs a mostly flat, hoisted node_modules, nesting only conflicting versions; Node’s require walks up parent node_modules folders to find packages, which enables phantom dependencies — pnpm avoids that with a symlinked store.',
    topics: ['node_modules', 'hoisting', 'flat tree', 'nested versions', 'phantom dependencies', 'module resolution', 'npm dedupe', 'npm ls', 'pnpm', '.bin'],
    sections: [
      section('introduction', undefined,
        text("node_modules is often joked about as the heaviest object in the universe. Understanding its layout explains duplicate packages, 'works locally' bugs and why pnpm exists."),
      ),
      section('definition', 'Layouts over time',
        table('node_modules layouts', ['Layout', 'Used by', 'Behaviour'], [
          ['Nested', 'npm 1–2', 'Each package has its own node_modules — deep paths, heavy duplication'],
          ['Flat / hoisted', 'npm 3+, Yarn classic', 'Packages hoisted to top level; only version conflicts nested'],
          ['Symlinked store', 'pnpm', 'Content-addressable store + symlinks; only declared deps visible'],
          ['Plug’n’Play', 'Yarn Berry', 'No node_modules; a resolution map file'],
        ]),
      ),
      section('why', 'Why hoisting',
        bullets(
          "Dedupes shared dependencies → fewer copies, smaller installs.",
          "Avoids Windows path length limits of deep nesting.",
          "Side effect: packages can `require` things they never declared (phantom dependencies).",
        ),
      ),
      section('internals', 'Hoisting and resolution',
        code({
          title: 'Example tree',
          language: 'text',
          code: dedent(`
            my-app/
            └── node_modules/
                ├── .bin/               ← CLI links (eslint, tsc…)
                ├── .package-lock.json  ← hidden lockfile (npm 7+)
                ├── express/            ← direct dependency
                ├── debug/              ← 2.6.9, hoisted (used by express)
                ├── ms/                 ← 2.0.0, hoisted
                └── some-lib/
                    └── node_modules/
                        └── debug/      ← 4.3.7, nested: conflicts with top-level 2.6.9
          `),
          explanation: [
            "The first version npm places at the top wins the hoisted spot; conflicting versions nest under the package that needs them.",
            "`some-lib` requiring `debug` finds its own nested 4.3.7 first.",
            "Your app could `require('ms')` even though you never declared it — a phantom dependency.",
          ],
        }),
        diagram('module-resolution', 'require(): core module → relative path → walk up node_modules folders → cache.'),
        steps(
          "`require('debug')` inside `/app/node_modules/some-lib/index.js`:",
          "Check if `debug` is a core module — no.",
          "Look in `/app/node_modules/some-lib/node_modules/debug` — found 4.3.7.",
          "Otherwise continue upward: `/app/node_modules/debug`, `/node_modules/debug`…",
          "Inside the package folder, use `exports` (or `main`, then `index.js`) to pick the file.",
          "Cache the resolved module by its full path.",
        ),
      ),
      section('example', 'Inspecting the tree',
        code({
          title: 'Why is this version here?',
          language: 'bash',
          code: dedent(`
            npm ls debug
            npm dedupe
            du -sh node_modules
          `),
          expectedOutput: "my-app@1.0.0 /home/ada/my-app\n├─┬ express@4.21.2\n│ └── debug@2.6.9\n└─┬ some-lib@1.2.0\n  └── debug@4.3.7\n\nremoved 3 packages, and audited 180 packages in 2s\n\nfound 0 vulnerabilities\n48M\tnode_modules",
          explanation: [
            "`npm ls` shows each copy and who needs it.",
            "`npm dedupe` re-hoists where ranges allow sharing a single version.",
            "Two copies of the same package are separate module instances — `instanceof` and singletons differ.",
          ],
        }),
      ),
      section('real-world', 'Real-world issues',
        bullets(
          "Phantom dependency: code imports `ms` without declaring it; an upgrade of express removes it → production crash. Fix: declare every import.",
          "Duplicate framework copies (two Reacts, two `graphql`) → peers or `npm dedupe`.",
          "Docker: never `COPY node_modules` from the host — native modules are built for the host OS; run `npm ci` in the image.",
          "pnpm's strict layout catches phantom dependencies and saves disk via hard links.",
        ),
      ),
      section('mistakes', 'Common mistakes',
        bullets(
          "Committing node_modules to git.",
          "Editing files inside node_modules (lost on next install) — use `patch-package` or a fork if you must.",
          "`rm -rf node_modules package-lock.json && npm install` as a habit — it upgrades everything silently.",
        ),
        note("Node's `require` resolution is covered in depth in Module 3 (CommonJS, module caching)."),
      ),
      section('interview', 'Interview angle',
        interviewTip("Explain hoisting, when nesting happens, phantom dependencies, and how pnpm differs. Bonus: two copies = two module instances."),
      ),
      section('practice', 'Practice',
        text("Run `npm ls --all | grep -c deduped` and `npm ls <pkg>` for a package with multiple versions. Try the same project with pnpm and see whether any phantom imports break."),
      ),
      section('summary', 'Summary',
        bullets(
          "npm 3+ hoists to a flat tree; conflicts nest.",
          "require walks up node_modules directories.",
          "Hoisting enables phantom dependencies.",
          "pnpm uses a store + symlinks for strictness.",
          "Inspect with npm ls / npm explain; dedupe with npm dedupe.",
        ),
      ),
    ],
    revisionNotes: [
      "Flat/hoisted since npm 3; conflicting versions nested.",
      "Resolution: core → nearest node_modules upward.",
      "Phantom dependency = using an undeclared hoisted package.",
      "node_modules/.package-lock.json = hidden lockfile (npm 7+).",
      "Duplicate copies = separate instances.",
    ],
    quiz: [
      {
        kind: 'mcq', difficulty: 'intermediate',
        prompt: 'Package A needs lodash@^3 and package B needs lodash@^4. With npm, what does node_modules usually look like?',
        options: ["Install fails with a conflict","Both versions merged into one","One version hoisted to the top level, the other nested under the package that needs it","Both nested; nothing at the top level"],
        answer: 2,
        explanation: "Only peer conflicts cause errors. Regular dependency conflicts are solved by nesting one version.",
      },
      {
        kind: 'scenario', difficulty: 'intermediate',
        prompt: 'Your code does `require(\'qs\')` but qs is not in package.json. It works today. What is the risk?',
        options: ['None — npm guarantees hoisted packages', 'It is a phantom dependency; a parent package upgrade can remove or change qs and break your app', 'qs will be auto-added to package.json', 'Node will refuse to load it in production'],
        answer: 1,
        explanation: "It works only because another package's dependency was hoisted. Declare it explicitly. pnpm would fail fast here.",
      },
    ],
    interview: [
      {
        category: 'nodejs', kind: 'concept', difficulty: 'intermediate', topic: 'node_modules',
        question: 'Why is node_modules flat since npm 3, and what is a phantom dependency?',
        shortAnswer: 'npm hoists dependencies to the top-level node_modules to deduplicate them and avoid deep paths, nesting only conflicting versions. A phantom dependency is a package your code imports without declaring it, which works only because it was hoisted.',
        detailedAnswer: [
          "Placement order and ranges decide which version is hoisted.",
          "Phantom deps break when the parent package changes its own dependencies.",
          "pnpm’s symlinked layout only exposes declared dependencies.",
          "Tools like depcheck/knip or ESLint `import/no-extraneous-dependencies` catch them.",
        ],
        followUp: 'How does pnpm achieve strictness and save disk space?',
      },
      {
        category: 'nodejs', kind: 'concept', difficulty: 'advanced', topic: 'node_modules',
        question: 'How does Node locate a bare package specifier like require("debug") in a nested node_modules tree, and why can two copies of a package cause bugs?',
        shortAnswer: 'Node checks core modules, then looks for node_modules/debug in the requiring file’s directory and each parent directory up to the root, using the package’s exports or main to pick the file. Each resolved path is a separate cached module, so two copies have separate state and classes.',
        detailedAnswer: [
          "The nearest node_modules wins, so nested versions shadow hoisted ones.",
          "Module cache key = resolved absolute filename.",
          "Two copies → `instanceof` fails across them, singletons/registries split (e.g. two React copies breaking hooks).",
          "Symlinks are resolved to real paths by default (`--preserve-symlinks` changes that).",
          "Fix duplicates with peers, `npm dedupe` or `overrides`.",
        ],
        trap: "Thinking Node reads package-lock.json to resolve modules — it only looks at the file system.",
      },
    ],
  },
};

export default content;
