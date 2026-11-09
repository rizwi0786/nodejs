import type { ModuleContent } from '../../../types';
import { bullets, code, dedent, flow, interviewTip, note, section, steps, table, text, tip, warn } from '../helpers';

const content: Partial<ModuleContent> = {
  'secrets-management': {
    summary: 'Secrets management means keeping credentials (DB passwords, API keys, signing keys) out of code and git, storing them in a vault or secret manager, granting least-privilege access, and rotating them.',
    topics: ['secrets management', 'vault', 'AWS Secrets Manager', 'rotation', 'git leaks', 'gitleaks', 'least privilege', 'redaction'],
    sections: [
      section('introduction', undefined,
        text('A leaked database password or cloud key often hurts more than any code bug. Secrets management is the discipline of storing, distributing, using and rotating those values safely.'),
      ),
      section('definition', 'What counts as a secret',
        bullets(
          'Credentials: DB passwords, Redis URLs with passwords, SMTP logins.',
          'API keys and OAuth client secrets for third parties (Stripe, SendGrid…).',
          'Cryptographic material: JWT signing keys, session secrets, TLS private keys, encryption keys.',
          'Not secrets: feature flags, public URLs, port numbers — config, but not sensitive.',
        ),
        table('Where secrets can live', ['Option', 'Pros', 'Cons'], [
          ['Hard-coded in source', '—', 'Leaks with every clone, fork and log of the repo. Never.'],
          ['`.env` file (git-ignored)', 'Simple for local dev', 'Plain text on disk; easy to commit by mistake; no audit/rotation'],
          ['Platform env vars (CI, PaaS)', 'Not in git; easy', 'Visible to anyone with project access; may show in process listings/crash dumps'],
          ['Secret manager / vault (AWS Secrets Manager, GCP Secret Manager, Azure Key Vault, HashiCorp Vault)', 'Encryption at rest, IAM access control, audit log, rotation, versioning', 'More moving parts, network dependency'],
          ['Kubernetes Secrets', 'Native to the cluster', 'Only base64 by default — enable encryption at rest and RBAC'],
        ]),
      ),
      section('why', 'Why it matters',
        bullets(
          'Public repos are scanned for keys by bots within minutes of a push.',
          'Git history is forever: deleting the line in a new commit does not remove it.',
          'Secrets in logs, error trackers and screenshots are a common silent leak.',
        ),
      ),
      section('internals', 'A healthy secret lifecycle',
        flow([
          'Create: generated, high entropy',
          'Store: vault, encrypted at rest',
          'Grant: IAM role per service (least privilege)',
          'Deliver: injected at runtime (env/file/SDK)',
          'Use: never logged',
          'Rotate: scheduled + on suspicion',
          'Revoke: old version disabled',
        ], { title: 'Secret lifecycle', direction: 'vertical' }),
        steps(
          'The app\'s runtime identity (IAM role, Kubernetes service account) is allowed to read only *its* secrets.',
          'At startup the app fetches secrets (SDK call) or the platform injects them as env vars or mounted files.',
          'Rotation creates a new version; apps pick it up (refresh or redeploy) while the old one is still valid; then the old one is revoked.',
          'Every read is in the audit log, so a leak can be scoped.',
        ),
      ),
      section('example', 'Vulnerable vs fixed',
        code({
          title: 'Redacting secrets before logging (pure JS)',
          runnable: true,
          code: dedent(`
            const SENSITIVE = /pass(word)?|secret|token|api[-_]?key|authorization|cookie/i;
            function redact(obj) {
              if (Array.isArray(obj)) return obj.map(redact);
              if (obj && typeof obj === 'object') {
                return Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, SENSITIVE.test(k) ? '[REDACTED]' : redact(v)]));
              }
              return obj;
            }
            const config = { port: 3000, db: { host: 'db.internal', password: 'hunter2' }, stripeApiKey: 'sk_live_123', headers: { authorization: 'Bearer x' } };
            console.log(JSON.stringify(redact(config)));
          `),
          expectedOutput: '{"port":3000,"db":{"host":"db.internal","password":"[REDACTED]"},"stripeApiKey":"[REDACTED]","headers":{"authorization":"[REDACTED]"}}',
          explanation: [
            'Key-name matching catches the common cases before an object reaches a log line.',
            'Logging libraries (Pino `redact`, Winston formats) offer the same idea built in.',
            'Redaction is a backstop — the primary rule is never to log config or auth headers at all.',
          ],
        }),
        code({
          title: 'VULNERABLE vs FIXED',
          code: dedent(`
            // ❌ VULNERABLE
            const stripe = new Stripe('sk_live_51H...');            // committed to git
            console.log('config', process.env);                    // dumps every secret into logs

            // ✅ FIXED — injected at runtime, fetched from a secret manager (AWS SDK v3)
            import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';

            const sm = new SecretsManagerClient({});                // credentials from the instance/pod IAM role
            async function loadSecrets() {
              const out = await sm.send(new GetSecretValueCommand({ SecretId: 'prod/payments-api' }));
              return JSON.parse(out.SecretString);                  // { STRIPE_KEY, DB_PASSWORD }
            }
            const secrets = await loadSecrets();
            const stripe = new Stripe(secrets.STRIPE_KEY);
            logger.info({ secretKeys: Object.keys(secrets) }, 'secrets loaded'); // names only, never values
          `),
          expectedOutput: '{"level":30,"msg":"secrets loaded","secretKeys":["STRIPE_KEY","DB_PASSWORD"]}',
          explanation: [
            'No secret is in the repository or image; the IAM role controls who may read it.',
            'Logging only the key names confirms loading without exposing values.',
            'Cache the values in memory and refresh periodically to support rotation.',
          ],
        }),
        code({
          title: 'Preventing and responding to commits of secrets',
          language: 'bash',
          code: dedent(`
            # .gitignore
            .env
            .env.*
            !.env.example

            # Pre-commit / CI scanning (gitleaks is a third-party tool)
            gitleaks detect --source . --redact

            # If a secret was pushed: ROTATE FIRST, then clean history
            # 1. Revoke/rotate the key at the provider (the leak already happened)
            # 2. Optionally purge history (git filter-repo) and force-push; tell collaborators to re-clone
          `),
          expectedOutput: 'Finding:     STRIPE_KEY=REDACTED\nRuleID:      stripe-access-token\nFile:        src/config.js\nLine:        4\n\nWRN leaks found: 1',
          explanation: [
            'Commit a `.env.example` with names but no values so others know what to set.',
            'Rewriting history does not un-leak a key — forks, clones and caches may have it. Rotation is mandatory.',
            'GitHub push protection / secret scanning can block known key formats at push time.',
          ],
        }),
      ),
      section('real-world', 'Production practices',
        bullets(
          'One secret per service per environment — staging never shares prod keys.',
          'Prefer short-lived, automatically issued credentials (IAM roles, Vault dynamic DB credentials, OIDC from CI) over long-lived static keys.',
          'Support **two valid versions** during rotation (e.g. JWT `kid` header with current + previous key).',
          'Mounted files (`/run/secrets/db_password`) avoid env-var leakage into child processes and crash dumps.',
        ),
        tip('In CI (e.g. GitHub Actions), use OIDC to assume a cloud role instead of storing a long-lived cloud access key as a repository secret.'),
      ),
      section('mistakes', 'Common mistakes',
        bullets(
          'Committing `.env` "just once" — it is in history forever.',
          'Baking secrets into Docker images via `ENV` or `COPY .env` — anyone with the image can read them (`docker history`).',
          'Sending secrets to the frontend bundle (`VITE_` / `NEXT_PUBLIC_` variables are public by design).',
          'Logging `req.headers` or full config objects.',
          'Never rotating because "nothing has leaked yet".',
        ),
      ),
      section('interview', 'Interview angle',
        interviewTip('If asked "a key was committed to GitHub, what now?", the first word must be **rotate** — then scope the blast radius with audit logs, then clean history and add scanning.'),
      ),
      section('practice', 'Practice',
        text('Run `gitleaks detect` (or GitHub secret scanning) on one of your repos. Add a pre-commit hook and a `.env.example`. Then refactor one hard-coded key into an environment variable validated at startup.'),
      ),
      section('summary', 'Summary',
        bullets(
          'Secrets never go in code, images, logs or frontend bundles.',
          'Use a secret manager with IAM, audit logs and rotation in production.',
          'Prefer short-lived credentials; support overlapping versions during rotation.',
          'Leaked? Rotate first, then investigate and clean up.',
        ),
      ),
    ],
    revisionNotes: [
      'Leak response order: rotate → audit → purge history → prevent (scanning).',
      'Secret managers: encryption at rest, IAM, audit, versioning, rotation.',
      'K8s Secrets are base64, not encrypted, unless encryption at rest is enabled.',
      'No secrets in Docker `ENV`/layers or `VITE_`/`NEXT_PUBLIC_` vars.',
      'Redact sensitive keys in logs.',
    ],
    quiz: [
      {
        kind: 'scenario', difficulty: 'intermediate',
        prompt: 'A developer pushed a production Stripe key to a public repo 10 minutes ago and immediately deleted it in a new commit. What is the first thing to do?',
        options: [
          'Nothing — it was deleted',
          'Force-push to remove it from history',
          'Revoke/rotate the key at Stripe immediately',
          'Make the repository private',
        ],
        answer: 2,
        explanation: 'Bots scan public pushes within minutes; assume it is compromised. Rotation stops the damage; history cleanup and making it private do not invalidate copies already taken.',
      },
      {
        kind: 'find-bug', difficulty: 'intermediate',
        prompt: 'What is the security problem in this Dockerfile?',
        code: "FROM node:22-alpine\nWORKDIR /app\nCOPY . .\nENV DB_PASSWORD=supersecret\nRUN npm ci --omit=dev\nCMD [\"node\", \"server.js\"]",
        options: [
          'alpine images cannot run Node',
          'The password is baked into the image metadata and `COPY . .` may also copy a local `.env`',
          'npm ci needs --force',
          'CMD must use shell form',
        ],
        answer: 1,
        explanation: '`ENV` values are visible via `docker inspect`/`docker history` to anyone who pulls the image. Inject at runtime and add `.env` to `.dockerignore`.',
      },
    ],
    interview: [
      {
        category: 'advanced', kind: 'scenario', difficulty: 'advanced', topic: 'Secrets management',
        question: 'How would you rotate a JWT signing key without logging out every user?',
        shortAnswer: 'Publish keys with ids (`kid`): start signing with the new key while still accepting tokens signed by the previous key until they expire, then retire the old key.',
        detailedAnswer: [
          'Store keys as versions in a secret manager or JWKS: `{ kid: "2026-11", key }`.',
          'Sign new tokens with the current key, putting its `kid` in the JWT header.',
          'Verifier selects the key by `kid`; accepts current and previous.',
          'After max token lifetime (e.g. refresh-token TTL) passes, remove the old key.',
          'For an emergency (key leaked), drop the old key immediately and accept forced re-login.',
        ],
        followUp: 'How does a JWKS endpoint help other services verify tokens?',
        trap: 'Swapping the key in place, which invalidates all tokens at once (or, worse, never rotating).',
      },
      {
        category: 'express-backend', kind: 'concept', difficulty: 'intermediate', topic: 'Secrets management',
        question: 'Why is a dedicated secret manager better than plain environment variables for production secrets?',
        shortAnswer: 'It adds encryption at rest, fine-grained access control, audit logs, versioning and rotation; plain env vars are just strings visible to anyone who can inspect the process or deployment config.',
        detailedAnswer: [
          'Env vars are inherited by child processes and can appear in crash reports and `/proc/<pid>/environ`.',
          'Deployment configs holding env vars are often readable by many people.',
          'Secret managers tie access to workload identity (IAM role) and log every read.',
          'Rotation can be automated (e.g. DB password rotation lambdas, Vault dynamic credentials).',
          'Env vars remain fine as the *delivery* mechanism if injected from the manager at runtime.',
        ],
        followUp: 'What are dynamic secrets in HashiCorp Vault?',
        trap: 'Saying env vars are encrypted.',
      },
    ],
  },

  'environment-variables': {
    summary: 'Environment variables carry per-environment configuration into `process.env`; load them with `--env-file` (Node 20.6+), `process.loadEnvFile()` (Node 21.7+/20.12+) or dotenv, and validate them at startup so the app fails fast.',
    topics: ['environment variables', 'process.env', '--env-file', 'process.loadEnvFile', 'dotenv', 'config validation', '12-factor', 'NODE_ENV'],
    sections: [
      section('introduction', undefined,
        text('The same code runs on your laptop, in CI and in production — with different databases and keys. Environment variables let the environment supply those values without changing the code.'),
      ),
      section('definition', 'Definition',
        text('`process.env` is an object of string key/value pairs inherited from the parent process. The **12-factor** approach stores config in the environment rather than in code.'),
        table('Ways to load a .env file', ['Method', 'Since', 'Notes'], [
          ['`node --env-file=.env app.js`', 'Node 20.6', 'Built-in; multiple `--env-file` flags allowed; later files override earlier'],
          ['`node --env-file-if-exists=.env app.js`', 'Node 22.9', 'Does not error if the file is missing'],
          ['`process.loadEnvFile(".env")`', 'Node 21.7 / 20.12', 'Programmatic; default path `./.env`'],
          ['`util.parseEnv(str)`', 'Node 21.7 / 20.12', 'Parse .env text into an object without touching process.env'],
          ['`dotenv` (`import "dotenv/config"`)', 'third-party', 'Works on any Node version; widely used'],
        ]),
      ),
      section('why', 'Why validate at startup',
        bullets(
          'Every value is a **string** — `PORT="3000"`, `DEBUG="false"` (which is truthy!).',
          'A missing `DATABASE_URL` should crash on boot, not on the first request at 3 a.m.',
          'Centralising config in one typed module stops `process.env.X` being scattered and misspelled.',
        ),
      ),
      section('internals', 'How it works',
        steps(
          'When a process starts, the OS copies the parent\'s environment block into it.',
          'Node exposes it as `process.env`; assignments coerce values to strings (`process.env.N = 1` → `"1"`).',
          'Built-in `--env-file` parses the file before your code runs; variables already set in the real environment win over the file.',
          'Child processes (`spawn`) inherit `process.env` unless you pass `env` explicitly.',
        ),
        flow([
          'Shell / platform env',
          '--env-file / loadEnvFile',
          'process.env (strings)',
          'config.js: parse + validate',
          'Typed frozen config object',
          'App code imports config',
        ], { title: 'Config flow', direction: 'horizontal' }),
      ),
      section('example', 'Loading and validating',
        code({
          title: 'Parsing string env values safely (pure JS)',
          runnable: true,
          code: dedent(`
            function loadConfig(env) {
              const errors = [];
              const req = (k) => (env[k] ? env[k] : (errors.push('missing ' + k), undefined));
              const port = Number(env.PORT ?? '3000');
              if (!Number.isInteger(port) || port < 1 || port > 65535) errors.push('invalid PORT');
              const config = {
                port,
                databaseUrl: req('DATABASE_URL'),
                debug: env.DEBUG === 'true',            // strings! "false" is truthy
                nodeEnv: env.NODE_ENV ?? 'development',
              };
              if (errors.length) throw new Error('Config error: ' + errors.join(', '));
              return Object.freeze(config);
            }
            console.log(JSON.stringify(loadConfig({ PORT: '8080', DATABASE_URL: 'postgres://db/app', DEBUG: 'false' })));
            try { loadConfig({ PORT: 'abc' }); } catch (e) { console.log(e.message); }
            console.log(Boolean('false'));
          `),
          expectedOutput: '{"port":8080,"databaseUrl":"postgres://db/app","debug":false,"nodeEnv":"development"}\nConfig error: invalid PORT, missing DATABASE_URL\ntrue',
          explanation: [
            'Values are parsed and checked once; the frozen object is the only thing the app uses.',
            'Errors are collected so the operator sees every problem in one crash.',
            '`Boolean("false")` is `true` — compare to the string `"true"` explicitly.',
          ],
        }),
        code({
          title: 'Built-in .env loading + zod validation',
          code: dedent(`
            // .env  (git-ignored)
            // PORT=3000
            // DATABASE_URL=postgres://localhost/app
            // JWT_SECRET=dev-only-change-me-please-32-chars-min

            // config.js
            import { z } from 'zod'; // third-party
            // Option A: node --env-file=.env server.js   (nothing to import)
            // Option B: process.loadEnvFile();           (reads ./.env, Node 21.7+/20.12+)

            const Env = z.object({
              NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
              PORT: z.coerce.number().int().positive().default(3000),
              DATABASE_URL: z.string().url(),
              JWT_SECRET: z.string().min(32),
            });

            const parsed = Env.safeParse(process.env);
            if (!parsed.success) {
              console.error('Invalid environment:', parsed.error.flatten().fieldErrors);
              process.exit(1);
            }
            export const config = Object.freeze(parsed.data);
          `),
          expectedOutput: "$ node --env-file=.env server.js        # JWT_SECRET too short\nInvalid environment: { JWT_SECRET: [ 'String must contain at least 32 character(s)' ] }\n$ echo $?\n1",
          explanation: [
            '`--env-file` needs no dependency; dotenv is only required for older Node versions or extra features.',
            'Fail fast with exit code 1 so orchestrators (Kubernetes, systemd) report a crash loop immediately.',
            'Error wording comes from zod and varies by version.',
          ],
          versionNote: '`--env-file` Node 20.6+; `process.loadEnvFile` Node 21.7+ (also 20.12+).',
        }),
      ),
      section('real-world', 'Real-world notes',
        bullets(
          'Production values come from the platform/secret manager, not a committed `.env` file.',
          'Keep `.env.example` in git listing every variable with dummy values.',
          '`NODE_ENV=production` changes library behaviour (Express caches views, less verbose errors) — always set it in prod.',
          'Frontend build tools inline `VITE_*` / `NEXT_PUBLIC_*` vars into public JS — never put secrets there.',
        ),
        note('dotenv does not override variables already present in the environment by default — the same precedence as Node\'s `--env-file`. Real environment beats file.'),
      ),
      section('mistakes', 'Common mistakes',
        bullets(
          '`if (process.env.FEATURE_X)` when the value is `"false"`.',
          '`process.env.PORT + 1` → `"30001"` (string concatenation).',
          'Reading `process.env` deep inside modules everywhere instead of one config module.',
          'Committing `.env` or printing `process.env` in a debug log.',
        ),
        warn('Mutating `process.env` at runtime to "configure" later code is fragile — values are global, stringly typed and inherited by child processes.'),
      ),
      section('interview', 'Interview angle',
        interviewTip('Mention three things: values are strings, validate once at startup and fail fast, and know the built-in `--env-file` (Node 20.6+) so dotenv is optional on modern Node.'),
      ),
      section('practice', 'Practice',
        text('Replace dotenv in a project with `node --env-file=.env`, add a `config.js` that validates with zod (or by hand), and confirm the app refuses to start when `DATABASE_URL` is missing.'),
      ),
      section('summary', 'Summary',
        bullets(
          '`process.env` values are always strings.',
          'Built-ins: `--env-file` (20.6+), `process.loadEnvFile` (21.7+/20.12+); dotenv is third-party.',
          'Validate and type config once at startup; exit non-zero on error.',
          'Real environment variables take precedence over .env files.',
        ),
      ),
    ],
    revisionNotes: [
      '`--env-file=.env` Node 20.6+; `process.loadEnvFile()` 21.7+/20.12+.',
      'All env values are strings: `"false"` is truthy.',
      'Existing env vars win over `.env` values.',
      'Validate with a schema at boot; `process.exit(1)` on failure.',
      'Commit `.env.example`, never `.env`.',
    ],
    quiz: [
      {
        kind: 'predict-output', difficulty: 'beginner',
        prompt: 'Started with `PORT=3000 node app.js`. What prints?',
        code: "console.log(process.env.PORT + 1);",
        options: ['3001', '30001', 'NaN', 'undefined'],
        answer: 1,
        explanation: 'Environment values are strings, so `+` concatenates: `"3000" + 1 === "30001"`. Use `Number(process.env.PORT)`.',
      },
      {
        kind: 'mcq', difficulty: 'intermediate',
        prompt: 'Which built-in way of loading a `.env` file is available starting in Node 20.6?',
        options: ['require("dotenv").config()', 'node --env-file=.env app.js', 'process.env.load(".env")', 'node --dotenv app.js'],
        answer: 1,
        explanation: '`--env-file` landed in Node 20.6. dotenv is a third-party package; the other two do not exist.',
      },
      {
        kind: 'find-bug', difficulty: 'intermediate',
        prompt: 'Debug logging is enabled in production even though `DEBUG=false`. Why?',
        code: "const debug = Boolean(process.env.DEBUG);\nif (debug) logger.level = 'debug';",
        options: [
          'process.env is undefined in production',
          '`Boolean("false")` is `true` — any non-empty string is truthy',
          'logger.level is read-only',
          'DEBUG is reserved by Node',
        ],
        answer: 1,
        explanation: 'Env values are strings; only the empty string is falsy. Compare `process.env.DEBUG === "true"`.',
      },
    ],
    interview: [
      {
        category: 'nodejs', kind: 'concept', difficulty: 'beginner', topic: 'Environment variables',
        question: 'How do you load a .env file in modern Node.js without a third-party package?',
        shortAnswer: 'Run `node --env-file=.env app.js` (Node 20.6+) or call `process.loadEnvFile()` in code (Node 21.7+, backported to 20.12).',
        detailedAnswer: [
          '`--env-file` can be passed multiple times; later files override earlier ones.',
          'Variables already set in the real environment are not overwritten.',
          '`--env-file-if-exists` (Node 22.9+) avoids an error when the file is absent.',
          'dotenv remains useful for older Node or features like variable expansion (`dotenv-expand`).',
        ],
        followUp: 'Why should production not rely on a .env file at all?',
        trap: 'Saying dotenv is part of Node core.',
      },
      {
        category: 'express-backend', kind: 'concept', difficulty: 'intermediate', topic: 'Environment variables',
        question: 'Why should an application validate its configuration at startup instead of when values are first used?',
        shortAnswer: 'Fail-fast: a misconfigured deploy crashes immediately and visibly (and rollouts stop) rather than failing later on a specific request path.',
        detailedAnswer: [
          'Orchestrators detect crash loops and halt a rolling deploy before traffic shifts.',
          'Errors list all problems at once, at a known moment.',
          'Parsing turns strings into typed values (numbers, booleans, URLs) once.',
          'Code reads one frozen config object — no scattered `process.env` lookups.',
        ],
        followUp: 'How would you handle a config value that changes at runtime (feature flags)?',
        trap: 'Using defaults for required secrets "so the app still starts".',
      },
    ],
  },

  'dependency-vulnerabilities': {
    summary: 'Most of a Node app\'s code is in node_modules; manage that risk with lockfiles, `npm ci`, `npm audit`, automated update PRs (Dependabot/Renovate), and supply-chain defences against typosquatting and malicious install scripts.',
    topics: ['npm audit', 'lockfile', 'npm ci', 'Dependabot', 'supply chain attack', 'typosquatting', '--ignore-scripts', 'overrides', 'CVE', 'provenance'],
    sections: [
      section('introduction', undefined,
        text('A typical Express app has a few dozen direct dependencies and hundreds of transitive ones. Any of them can contain a known vulnerability — or be deliberately malicious.'),
      ),
      section('definition', 'Two kinds of risk',
        table('Vulnerable vs malicious', ['', 'Known vulnerability (CVE)', 'Supply-chain attack'], [
          ['What', 'An honest bug, e.g. prototype pollution, ReDoS', 'Code written to steal or damage'],
          ['How it arrives', 'You depend on an affected version', 'Typosquat, hijacked maintainer account, malicious update, dependency confusion'],
          ['Detection', '`npm audit`, Dependabot, Snyk', 'Harder: install-script analysis, provenance, behaviour monitoring'],
          ['Typical fix', 'Upgrade / override the version', 'Remove, rotate any exposed secrets, pin known-good versions'],
        ]),
      ),
      section('why', 'Why it matters',
        bullets(
          'OWASP A06:2021 Vulnerable and Outdated Components; A08 Software and Data Integrity Failures.',
          'npm install scripts (`preinstall`, `postinstall`) run arbitrary code on developer machines and CI with their credentials.',
          'Real incidents have included hijacked popular packages publishing credential-stealing versions.',
        ),
      ),
      section('internals', 'How the defences work',
        steps(
          '**Lockfile** (`package-lock.json`) records the exact resolved version and integrity hash (`sha512-…`) of every package in the tree.',
          '**`npm ci`** installs exactly the lockfile, verifies integrity hashes, and fails if `package.json` and the lockfile disagree.',
          '**`npm audit`** sends the dependency tree to the registry\'s advisory database and reports matching advisories with severity.',
          '**Dependabot/Renovate** open PRs that bump versions; CI tests them before merge.',
          '**`--ignore-scripts`** skips lifecycle scripts, removing the most common malware execution path.',
        ),
        flow([
          'PR opened',
          'npm ci --ignore-scripts',
          'npm audit --audit-level=high',
          'Tests',
          'Merge',
          'Dependabot: weekly update PRs',
        ], { title: 'Dependency hygiene in CI', direction: 'horizontal' }),
      ),
      section('example', 'Tools and commands',
        code({
          title: 'Detecting likely typosquats (pure JS)',
          runnable: true,
          code: dedent(`
            function distance(a, b) {
              const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
              for (let j = 1; j <= b.length; j++) dp[0][j] = j;
              for (let i = 1; i <= a.length; i++)
                for (let j = 1; j <= b.length; j++)
                  dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
              return dp[a.length][b.length];
            }
            const popular = ['express', 'lodash', 'react', 'axios'];
            for (const name of ['expresss', 'lodash', 'axois', 'left-pad']) {
              const near = popular.find((p) => p !== name && distance(p, name) <= 2);
              console.log(name + ': ' + (near ? 'suspicious, looks like ' + near : 'ok'));
            }
          `),
          expectedOutput: 'expresss: suspicious, looks like express\nlodash: ok\naxois: suspicious, looks like axios\nleft-pad: ok',
          explanation: [
            'Typosquats differ from popular names by one or two edits (extra letter, swapped letters).',
            'Edit distance ≤ 2 flags them for human review before `npm install`.',
            'Also check download counts, publish date, repository link and maintainers before adding any dependency.',
          ],
        }),
        code({
          title: 'npm audit and friends',
          language: 'bash',
          code: dedent(`
            npm audit                         # full report
            npm audit --omit=dev              # only production dependencies
            npm audit --audit-level=high      # exit 1 only for high/critical (CI gate)
            npm audit fix                     # apply semver-compatible upgrades
            npm audit signatures              # verify registry signatures / provenance attestations

            npm ci --ignore-scripts           # reproducible install, no lifecycle scripts
            npm ls minimist                   # who pulls in this transitive dep?
          `),
          expectedOutput: dedent(`
            # npm audit report

            semver  7.0.0 - 7.5.1
            Severity: high
            semver vulnerable to Regular Expression Denial of Service - https://github.com/advisories/GHSA-c2qf-rxjj-qqgw
            fix available via \`npm audit fix\`
            node_modules/semver

            1 high severity vulnerability
          `),
          explanation: [
            '`--audit-level` makes the command a CI gate without failing on low-severity noise.',
            '`npm audit fix --force` may install breaking major versions — review it, do not run it blindly.',
            'Not every advisory is exploitable in your app (e.g. a dev-only tool); triage, then document exceptions.',
          ],
        }),
        code({
          title: 'Overrides and Dependabot config',
          language: 'json',
          code: dedent(`
            // package.json — force a patched transitive version (npm 8.3+)
            {
              "overrides": {
                "semver": "^7.5.2"
              }
            }

            // .github/dependabot.yml (YAML shown as comments for brevity)
            // version: 2
            // updates:
            //   - package-ecosystem: "npm"
            //     directory: "/"
            //     schedule: { interval: "weekly" }
            //     groups: { minor-and-patch: { update-types: ["minor", "patch"] } }
          `),
          expectedOutput: '$ npm ls semver\napp@1.0.0\n└─┬ some-lib@2.3.0\n  └── semver@7.6.3 overridden',
          explanation: [
            '`overrides` patches a vulnerable transitive dependency before its parent publishes an update.',
            'Grouped Dependabot PRs reduce noise; keep major bumps as separate PRs.',
          ],
        }),
      ),
      section('real-world', 'Supply-chain checklist',
        bullets(
          'Commit the lockfile; use `npm ci` in CI and Docker builds.',
          'Run CI installs with `--ignore-scripts` where possible; allow scripts only for packages that need them (native builds).',
          'Scope internal packages (`@myco/…`) and configure the registry per scope to block **dependency confusion**.',
          'Review new dependencies: maintenance, popularity, permissions, size; prefer fewer, well-known packages.',
          'Publish your own packages with **provenance** (`npm publish --provenance` from CI) and 2FA on npm accounts.',
          'Minimise `GITHUB_TOKEN`/cloud permissions in CI so a malicious script cannot do much.',
        ),
      ),
      section('mistakes', 'Common mistakes',
        bullets(
          'Using `npm install` in CI — it can update the lockfile and pull new versions.',
          'Deleting the lockfile to "fix" install errors.',
          'Ignoring audit output forever because "it is always red" — triage and gate on high/critical.',
          'Blindly running `npm audit fix --force`.',
          'Adding a dependency for a 5-line function.',
        ),
        warn('A malicious `postinstall` script runs during `npm install` — before any of your tests. Scanning after install is too late for credentials on that machine.'),
      ),
      section('interview', 'Interview angle',
        interviewTip('Separate "known vulnerable" from "malicious" packages and give a defence for each: audit + update bots for CVEs; lockfile + `npm ci` + `--ignore-scripts` + scoped registries + provenance for supply chain.'),
      ),
      section('practice', 'Practice',
        text('In a project: run `npm audit --omit=dev`, fix one advisory using `overrides`, add a Dependabot config, and change your CI to `npm ci --ignore-scripts`. Note which packages break without scripts.'),
      ),
      section('summary', 'Summary',
        bullets(
          'Lockfile + `npm ci` = reproducible, integrity-checked installs.',
          '`npm audit` finds known advisories; gate CI on high/critical.',
          'Dependabot/Renovate keep dependencies current.',
          'Supply-chain risks: typosquatting, hijacked packages, dependency confusion, install scripts.',
          'Defences: `--ignore-scripts`, scoped registries, provenance, least-privilege CI.',
        ),
      ),
    ],
    revisionNotes: [
      '`npm ci` fails if lockfile and package.json disagree; verifies integrity.',
      '`npm audit --omit=dev --audit-level=high` as a CI gate.',
      '`overrides` (npm 8.3+) pins transitive versions.',
      '`--ignore-scripts` blocks postinstall malware.',
      'Dependency confusion → scoped packages + registry config.',
    ],
    quiz: [
      {
        kind: 'mcq', difficulty: 'intermediate',
        prompt: 'Why use `npm ci` instead of `npm install` in CI?',
        options: [
          'It is the only command that runs tests',
          'It installs exactly what the lockfile specifies, verifies integrity and fails on mismatch',
          'It skips all devDependencies automatically',
          'It updates packages to the latest versions',
        ],
        answer: 1,
        explanation: '`npm ci` is reproducible: exact lockfile versions, integrity checks, clean `node_modules`. `npm install` may modify the lockfile.',
      },
      {
        kind: 'scenario', difficulty: 'advanced',
        prompt: 'Your company\'s private package `billing-utils` is unscoped and installed from an internal registry. An identically named package appears on the public npm registry with a higher version. What is the risk and fix?',
        options: [
          'No risk — npm always prefers private registries',
          'Dependency confusion: the build may pull the public malicious version; use a scoped name (`@company/billing-utils`) mapped to the internal registry',
          'Typosquatting: rename it with a typo',
          'Run npm audit fix',
        ],
        answer: 1,
        explanation: 'Dependency confusion exploits resolvers that pick the highest version across registries. Scoping and per-scope registry config ensures it only comes from your registry.',
      },
      {
        kind: 'find-bug', difficulty: 'intermediate',
        prompt: 'What is wrong with this CI step?',
        code: "- run: rm -f package-lock.json && npm install\n- run: npm test",
        options: [
          'npm test must come first',
          'Deleting the lockfile and using npm install makes builds non-reproducible and may pull new (possibly compromised) versions',
          'npm install requires --save',
          'Nothing',
        ],
        answer: 1,
        explanation: 'Without a lockfile every run resolves fresh versions. Use `npm ci` with the committed lockfile.',
      },
    ],
    interview: [
      {
        category: 'advanced', kind: 'concept', difficulty: 'advanced', topic: 'Supply chain',
        question: 'What is a software supply-chain attack in the npm ecosystem, and what controls reduce the risk?',
        shortAnswer: 'An attacker gets malicious code into your dependency tree — via typosquatting, a hijacked maintainer account, dependency confusion or a compromised build — and controls include lockfiles, `npm ci`, ignoring install scripts, scoped registries, provenance and least-privilege CI.',
        detailedAnswer: [
          'Execution often happens in `postinstall`, on developer laptops and CI runners with secrets.',
          'Lockfile + integrity hashes stop silent version drift.',
          '`--ignore-scripts` removes the main execution hook (allow-list native builds).',
          'Scoped package names stop dependency confusion.',
          'Provenance/signatures (`npm audit signatures`) tie packages to a source repo and CI build.',
          'Short-lived, minimal CI credentials limit the blast radius.',
        ],
        followUp: 'How would you respond if a dependency you use was found to publish a credential stealer?',
        trap: 'Saying `npm audit` detects malicious packages reliably — it only reports published advisories.',
      },
      {
        category: 'nodejs', kind: 'concept', difficulty: 'intermediate', topic: 'Dependencies',
        question: 'How do you fix a vulnerability in a transitive dependency when the direct dependency has not released a fix?',
        shortAnswer: 'Use `overrides` in package.json (npm 8.3+) to force a patched version of the transitive package, test it, and track the upstream fix to remove the override later.',
        detailedAnswer: [
          'Find the path with `npm ls <pkg>` or `npm explain <pkg>`.',
          'Add `"overrides": { "<pkg>": "<patched range>" }` (Yarn: `resolutions`, pnpm: `pnpm.overrides`).',
          'Run tests — the parent may rely on behaviour of the old major version.',
          'Alternatively assess exploitability; if not reachable, document and accept temporarily.',
        ],
        followUp: 'What are the risks of overriding across a major version?',
        trap: 'Editing files inside node_modules by hand.',
      },
    ],
  },
};

export default content;
