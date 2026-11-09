import type { ModuleContent } from '../../../types';
import { bullets, code, dedent, diagram, interviewTip, section, steps, table, text, warn } from '../helpers';

const content: Partial<ModuleContent> = {
  'ci-cd': {
    summary: 'Continuous Integration automatically builds and tests every change; Continuous Delivery keeps the main branch always deployable, and Continuous Deployment ships every passing change to production automatically.',
    topics: ['continuous integration', 'continuous delivery', 'continuous deployment', 'pipeline stages', 'build once deploy many', 'rollback'],
    sections: [
      section('introduction', undefined,
        text('Manual releases are slow, scary and inconsistent. CI/CD turns "build, test, package, deploy" into an automated pipeline triggered by git events, so every change follows the same path.'),
      ),
      section('definition', 'CI vs CD vs CD',
        table('The three terms', ['Term', 'Meaning', 'Ends with'], [
          ['Continuous Integration', 'Every push/PR is merged often, built and tested automatically', 'A green build + artifact'],
          ['Continuous Delivery', 'Every green main build is releasable; production deploy is a button/approval', 'Ready-to-deploy artifact, manual gate'],
          ['Continuous Deployment', 'Every green main build goes to production automatically', 'Code in production'],
        ]),
      ),
      section('why', 'Why it matters',
        bullets(
          'Bugs are caught minutes after they are written, not weeks later.',
          'Small, frequent deploys are easier to review and to roll back.',
          'Deploys become routine and auditable (who/what/when).',
          'Enforces quality gates: lint, types, tests, security scans.',
        ),
      ),
      section('internals', 'Typical Node.js pipeline stages',
        steps(
          '**Trigger**: push / pull_request / tag.',
          '**Install**: `npm ci` with dependency cache.',
          '**Static checks**: lint, `tsc --noEmit`, `npm audit` or similar scan.',
          '**Test**: unit + integration (often with service containers: Postgres, Redis).',
          '**Build**: compile, build Docker image tagged with the commit SHA, push to registry.',
          '**Deploy staging**: run migrations, roll out, smoke tests.',
          '**Promote to production**: same image, approval gate or automatic; monitor; roll back on failure.',
        ),
        warn('Build once, deploy many: never rebuild the image for production. Promote the exact artifact that passed tests on staging.'),
      ),
      section('visual', 'Pipeline',
        diagram('ci-cd-pipeline', 'Push → lint/test → build image → deploy staging → production.'),
      ),
      section('example', 'A pipeline as scripts',
        code({
          title: 'package.json scripts used by CI',
          language: 'json',
          code: dedent(`
            {
              "scripts": {
                "lint": "eslint .",
                "typecheck": "tsc --noEmit",
                "test": "node --test",
                "build": "tsc -p tsconfig.build.json",
                "ci": "npm run lint && npm run typecheck && npm test && npm run build"
              }
            }
          `),
          explanation: [
            'CI calls the same scripts developers run locally — no "CI-only" magic.',
            '`&&` stops at the first failing step, failing the job.',
          ],
        }),
        code({
          title: 'Running it',
          language: 'bash',
          code: 'npm ci && npm run ci',
          expectedOutput: dedent(`
            > eslint .
            > tsc --noEmit
            > node --test
            ℹ tests 42
            ℹ pass 42
            ℹ fail 0
            > tsc -p tsconfig.build.json
          `),
          explanation: ['A non-zero exit code anywhere makes the CI job red and blocks the merge.'],
        }),
      ),
      section('real-world', 'In a real backend',
        bullets(
          'Branch protection requires the CI check to pass before merging to `main`.',
          'Merges to `main` deploy to staging automatically; production requires approval (Continuous Delivery).',
          'Database migrations run as a pipeline step before the new version receives traffic.',
          'Deploy step records the image SHA so rollback = redeploy the previous SHA.',
        ),
      ),
      section('mistakes', 'Common mistakes',
        bullets(
          'Flaky tests that people retry until green — they erode trust in the pipeline.',
          'Secrets echoed into logs.',
          'Using `npm install` in CI (lockfile drift).',
          'Building separate images per environment.',
          'No rollback plan.',
        ),
        code({
          title: 'Wrong vs right',
          language: 'bash',
          code: dedent(`
            # ❌ may change the lockfile, non-reproducible
            npm install
            # ✅ exact lockfile install, fails on mismatch
            npm ci
          `),
          explanation: ['`npm ci` deletes node_modules and installs exactly what the lockfile pins.'],
        }),
      ),
      section('interview', 'Interview angle',
        interviewTip('Define all three terms precisely (delivery has a manual gate, deployment does not) and describe stages of a real pipeline including migrations and rollback.'),
      ),
      section('practice', 'Practice',
        text('Sketch the pipeline for an API with Postgres: which stages run on a PR, which on merge to main, where migrations run and how you roll back.'),
      ),
      section('summary', 'Summary',
        bullets(
          'CI = build + test every change automatically.',
          'Delivery = always releasable; Deployment = auto-release.',
          'Same scripts locally and in CI; `npm ci`.',
          'Build once, promote the same artifact; keep rollback cheap.',
        ),
      ),
    ],
    revisionNotes: [
      'Continuous Delivery: manual approval to prod. Continuous Deployment: none.',
      'Stages: install → lint/typecheck → test → build/push image → migrate → deploy → verify.',
      'Tag images with the git SHA; promote, never rebuild.',
      'Rollback = redeploy previous artifact (migrations must be backward compatible).',
    ],
    quiz: [
      {
        kind: 'mcq', difficulty: 'beginner',
        prompt: 'What distinguishes Continuous Deployment from Continuous Delivery?',
        options: [
          'Continuous Deployment skips tests',
          'Continuous Deployment releases every passing change to production automatically; Delivery keeps a manual release step',
          'They are identical terms',
          'Continuous Delivery only applies to mobile apps',
        ],
        answer: 1,
        explanation: 'Both run the full pipeline; the difference is whether the final production release needs a human decision.',
      },
      {
        kind: 'scenario', difficulty: 'intermediate',
        prompt: 'Staging passed, but production is built from the same commit with a fresh `docker build` and fails because a transitive base image changed. What principle was violated?',
        options: ['Shift-left testing', 'Build once, deploy many', 'Trunk-based development', 'Infrastructure as code'],
        answer: 1,
        explanation: 'Rebuilding per environment means production runs a different artifact than the tested one. Promote the exact image digest instead.',
      },
    ],
    interview: [
      {
        category: 'advanced', kind: 'concept', difficulty: 'beginner', topic: 'CI/CD',
        question: 'Explain CI, Continuous Delivery and Continuous Deployment.',
        shortAnswer: 'CI builds and tests every change automatically; Continuous Delivery keeps every green build releasable with a manual production gate; Continuous Deployment removes the gate and ships every green build.',
        detailedAnswer: [
          'CI: frequent merges, automated build/test, fast feedback.',
          'Delivery: artifact ready, deploy on approval.',
          'Deployment: fully automatic to production.',
          'All rely on a reliable test suite and fast rollback.',
        ],
        followUp: 'What do you need in place before turning on Continuous Deployment?',
        trap: 'Using "CD" without saying which one you mean.',
      },
      {
        category: 'advanced', kind: 'scenario', difficulty: 'advanced', topic: 'CI/CD',
        question: 'Design a CI/CD pipeline for a Node.js API backed by PostgreSQL, including how you would roll back a bad release.',
        shortAnswer: 'PRs run lint, typecheck and tests with service containers; main builds a SHA-tagged image, runs backward-compatible migrations, deploys to staging with smoke tests, then promotes the same image to production with health-gated rolling deploys; rollback redeploys the previous image.',
        detailedAnswer: [
          'PR: `npm ci`, lint, `tsc --noEmit`, unit + integration tests (Postgres service).',
          'Main: build + push image `api:<sha>`, scan it.',
          'Migrations run as a separate job, expand-only, before the new code.',
          'Staging deploy + smoke tests → approval → production with readiness gates.',
          'Rollback: redeploy previous SHA; schema stays compatible because contract steps come later.',
          'Observability: compare error rate/latency after deploy, alert on regression.',
        ],
        followUp: 'How do you handle a migration that cannot be rolled back?',
        trap: 'Relying on down migrations in production as the rollback strategy.',
      },
    ],
  },

  'github-actions': {
    summary: 'GitHub Actions runs CI/CD workflows defined in `.github/workflows/*.yml`: triggers (`on`), jobs on runners, steps that use actions or run shell commands, matrices, caches, secrets and environments.',
    topics: ['workflow', 'jobs', 'steps', 'matrix', 'actions/checkout@v4', 'actions/setup-node@v4', 'cache: npm', 'secrets', 'environments', 'GITHUB_TOKEN'],
    sections: [
      section('introduction', undefined,
        text('GitHub Actions is GitHub\'s built-in automation platform. A YAML file in the repo describes what runs on each push or pull request — tests on several Node versions, image builds, deploys.'),
      ),
      section('definition', 'Building blocks',
        table('Vocabulary', ['Term', 'Meaning'], [
          ['Workflow', 'A YAML file in `.github/workflows/`'],
          ['Event (`on`)', 'What triggers it: `push`, `pull_request`, `workflow_dispatch`, `schedule`, `release`…'],
          ['Job', 'A set of steps on one runner; jobs run in parallel unless `needs:` orders them'],
          ['Runner', 'VM/container executing the job (`ubuntu-latest`, or self-hosted)'],
          ['Step', '`uses:` an action or `run:` a shell command'],
          ['Action', 'Reusable unit, e.g. `actions/checkout@v4`'],
          ['Matrix', 'Runs the same job for each combination (e.g. Node 20, 22, 24)'],
          ['Secrets / Environments', 'Encrypted values; environments add protection rules and scoped secrets'],
        ]),
      ),
      section('why', 'Why it is popular',
        bullets(
          'Lives next to the code; reviewed in PRs.',
          'Huge marketplace of actions (setup-node, docker/build-push-action…).',
          'Free minutes for public repos; hosted runners need no maintenance.',
        ),
      ),
      section('internals', 'How a run executes',
        steps(
          'An event fires; GitHub finds workflows whose `on:` matches (branch/path filters apply).',
          'Each job is queued on a fresh runner — no state carries over between jobs except via artifacts/caches.',
          'Steps run sequentially in the job; a failing step fails the job (unless `continue-on-error`).',
          '`needs:` builds a DAG of jobs; outputs and artifacts pass data between them.',
          'Secrets are masked in logs; PRs from forks do not receive secrets by default.',
        ),
        warn('Pin third-party actions to a tag you trust or, for maximum safety, a full commit SHA — an action runs with your workflow\'s permissions. Set minimal `permissions:` for `GITHUB_TOKEN`.'),
      ),
      section('visual', 'Workflow DAG',
        diagram('ci-cd-pipeline', 'test (matrix) → build-and-push → deploy (environment: production).'),
      ),
      section('example', 'CI + image build + deploy',
        code({
          title: '.github/workflows/ci.yml',
          language: 'yaml',
          code: dedent(`
            name: CI

            on:
              push:
                branches: [main]
              pull_request:

            permissions:
              contents: read

            jobs:
              test:
                runs-on: ubuntu-latest
                strategy:
                  matrix:
                    node-version: [20, 22, 24]
                services:
                  postgres:
                    image: postgres:16-alpine
                    env:
                      POSTGRES_PASSWORD: postgres
                    ports: ["5432:5432"]
                    options: >-
                      --health-cmd "pg_isready -U postgres"
                      --health-interval 5s --health-retries 10
                steps:
                  - uses: actions/checkout@v4
                  - uses: actions/setup-node@v4
                    with:
                      node-version: \${{ matrix.node-version }}
                      cache: npm
                  - run: npm ci
                  - run: npm run lint
                  - run: npm run typecheck
                  - run: npm test
                    env:
                      DATABASE_URL: postgres://postgres:postgres@localhost:5432/postgres

              build-and-push:
                needs: test
                if: github.ref == 'refs/heads/main'
                runs-on: ubuntu-latest
                permissions:
                  contents: read
                  packages: write
                steps:
                  - uses: actions/checkout@v4
                  - uses: docker/login-action@v3
                    with:
                      registry: ghcr.io
                      username: \${{ github.actor }}
                      password: \${{ secrets.GITHUB_TOKEN }}
                  - uses: docker/build-push-action@v6
                    with:
                      push: true
                      tags: ghcr.io/\${{ github.repository }}:\${{ github.sha }}

              deploy:
                needs: build-and-push
                runs-on: ubuntu-latest
                environment: production
                steps:
                  - run: ./scripts/deploy.sh "ghcr.io/\${{ github.repository }}:\${{ github.sha }}"
                    env:
                      DEPLOY_TOKEN: \${{ secrets.DEPLOY_TOKEN }}
          `),
          expectedOutput: dedent(`
            ✓ test (20)        1m12s
            ✓ test (22)        1m08s
            ✓ test (24)        1m10s
            ✓ build-and-push   2m03s
            ⏸ deploy           Waiting for review (production)
          `),
          explanation: [
            '`on`: runs for pushes to main and every pull request.',
            'The matrix creates three parallel `test` jobs, one per Node version.',
            '`cache: npm` in setup-node caches the npm download cache keyed by the lockfile hash.',
            'Here jobs run directly on the runner, so the Postgres service is reached at `localhost:5432` via the mapped port.',
            '`needs` + `if` restrict image builds to main after tests pass.',
            '`environment: production` can require reviewers and holds production-only secrets.',
            '`deploy.sh` is a placeholder for your platform CLI (kubectl, aws ecs, gcloud run deploy…).',
          ],
          versionNote: 'Action major versions change over time — check each action\'s README for the current major.',
        }),
      ),
      section('real-world', 'In a real backend',
        bullets(
          'Path filters (`paths: ["api/**"]`) avoid running backend CI for docs-only changes in a monorepo.',
          'OIDC (`permissions: id-token: write`) lets the workflow get short-lived cloud credentials instead of storing long-lived keys.',
          '`concurrency: { group: deploy-production, cancel-in-progress: false }` prevents two deploys running at once.',
          'Reusable workflows (`workflow_call`) share a standard pipeline across services.',
        ),
      ),
      section('mistakes', 'Common mistakes',
        code({
          title: 'Leaking or hard-coding secrets',
          language: 'yaml',
          code: dedent(`
            # ❌ secret in the repo
            - run: curl -H "Authorization: Bearer abc123" https://deploy.example.com
            # ✅ secret from the store, masked in logs
            - run: curl -H "Authorization: Bearer $DEPLOY_TOKEN" https://deploy.example.com
              env:
                DEPLOY_TOKEN: \${{ secrets.DEPLOY_TOKEN }}
          `),
          explanation: ['Passing the secret through `env` and referencing the shell variable avoids inlining it into the script text.'],
        }),
        bullets(
          'Using `pull_request_target` with checkout of untrusted PR code — gives forks access to secrets.',
          'Forgetting `cache: npm`, making each run download everything.',
          'Overly broad default `GITHUB_TOKEN` permissions.',
          'Deploying from PR workflows.',
        ),
      ),
      section('interview', 'Interview angle',
        interviewTip('Be ready to write a minimal workflow from memory: `on`, `jobs`, `runs-on`, `actions/checkout@v4`, `actions/setup-node@v4` with `cache: npm`, `npm ci`, `npm test`, a matrix, and `needs`.'),
      ),
      section('practice', 'Practice',
        steps(
          'Add a workflow that runs `npm test` on Node 20 and 22 for pull requests.',
          'Add a job that only runs on tags `v*` and publishes a Docker image.',
          'Protect a `production` environment with a required reviewer.',
        ),
      ),
      section('summary', 'Summary',
        bullets(
          'Workflow → jobs (parallel, on runners) → steps (uses/run).',
          'Matrix for Node versions; setup-node with `cache: npm`.',
          '`needs` for ordering; `environment` for gated deploys and scoped secrets.',
          'Least-privilege permissions, pinned actions, no secrets for fork PRs.',
        ),
      ),
    ],
    revisionNotes: [
      'Files live in .github/workflows/*.yml.',
      'Jobs run in parallel on fresh runners; `needs` creates dependencies.',
      'actions/setup-node@v4 with cache: npm caches ~/.npm keyed on the lockfile.',
      'Secrets are masked; fork PRs get no secrets by default.',
      'Environments: protection rules + environment-scoped secrets.',
      'Prefer OIDC to long-lived cloud keys.',
    ],
    quiz: [
      {
        kind: 'complete-code', difficulty: 'intermediate',
        prompt: 'Complete the step so npm downloads are cached between runs.',
        code: '- uses: actions/setup-node@v4\n  with:\n    node-version: 22\n    /* ??? */',
        options: ['cache: npm', 'persist: node_modules', 'npm-cache: true', 'restore: lockfile'],
        answer: 0,
        explanation: 'setup-node supports `cache: npm` (or yarn/pnpm), keyed on the lockfile. The other keys do not exist.',
      },
      {
        kind: 'mcq', difficulty: 'intermediate',
        prompt: 'Two jobs `test` and `build` are defined without `needs`. How do they run?',
        options: ['test then build', 'build then test', 'In parallel on separate runners', 'In the same runner sequentially'],
        answer: 2,
        explanation: 'Jobs are independent and parallel by default; `needs: test` would order them. Each job gets its own runner.',
      },
      {
        kind: 'find-bug', difficulty: 'advanced',
        prompt: 'What is risky about this workflow?',
        code: 'on: pull_request_target\njobs:\n  test:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n        with:\n          ref: ${{ github.event.pull_request.head.sha }}\n      - run: npm ci && npm test',
        options: [
          'pull_request_target cannot check out code',
          'It runs untrusted fork code in a context that has access to repository secrets and write tokens',
          'npm ci is not allowed in workflows',
          'ubuntu-latest has no Node installed',
        ],
        answer: 1,
        explanation: 'pull_request_target runs with the base repo\'s privileges. Checking out and executing the PR head lets a malicious fork exfiltrate secrets. Use pull_request for running untrusted code.',
      },
    ],
    interview: [
      {
        category: 'advanced', kind: 'concept', difficulty: 'intermediate', topic: 'GitHub Actions',
        question: 'Walk through a GitHub Actions workflow that tests a Node.js app on multiple Node versions.',
        shortAnswer: 'Trigger on push and pull_request, define a job with a matrix of node-version values, check out code, set up Node with npm caching, then npm ci and npm test.',
        detailedAnswer: [
          '`on: [push, pull_request]` (with branch filters as needed).',
          '`strategy.matrix.node-version: [20, 22, 24]` creates parallel jobs.',
          '`actions/checkout@v4`, `actions/setup-node@v4` with `node-version: ${{ matrix.node-version }}` and `cache: npm`.',
          '`npm ci` for reproducible installs; `npm test`.',
          'Optional `services:` for Postgres/Redis in integration tests.',
        ],
        followUp: 'How would you make a deploy job run only after all matrix jobs pass on main?',
        trap: 'Caching node_modules directly across Node versions — native modules may be built for a different version; caching the npm download cache is safer.',
      },
      {
        category: 'advanced', kind: 'concept', difficulty: 'advanced', topic: 'GitHub Actions',
        question: 'How do you secure secrets and credentials in GitHub Actions deployments?',
        shortAnswer: 'Store them as repository or environment secrets, scope them with protected environments, give GITHUB_TOKEN least-privilege permissions, prefer OIDC short-lived cloud credentials, and never expose secrets to untrusted fork code.',
        detailedAnswer: [
          'Environment secrets only available to jobs referencing that environment, after approvals.',
          '`permissions:` block restricts GITHUB_TOKEN scopes.',
          'OIDC federation: cloud trusts GitHub\'s token → no stored cloud keys.',
          'Avoid `pull_request_target` + checkout of PR code.',
          'Pin third-party actions (SHA for highest assurance); review updates.',
        ],
        followUp: 'What is the blast radius if a third-party action is compromised?',
        trap: 'Assuming masking in logs makes it safe to pass secrets to any step or action.',
      },
    ],
  },
};

export default content;
