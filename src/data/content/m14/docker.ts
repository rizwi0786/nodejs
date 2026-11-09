import type { ModuleContent } from '../../../types';
import { bullets, code, dedent, flow, interviewTip, note, section, steps, table, text, warn } from '../helpers';

const content: Partial<ModuleContent> = {
  'docker-fundamentals': {
    summary: 'Docker packages an application and its runtime into an immutable image built from cached layers; a container is a running, isolated instance of that image.',
    topics: ['image', 'container', 'layers', 'build cache', 'registry', 'Dockerfile', 'namespaces', 'cgroups'],
    sections: [
      section('introduction', undefined,
        text('"Works on my machine" happens because machines differ: OS, Node version, system libraries. Docker ships the machine-level dependencies *with* the app so every environment runs the same thing.'),
      ),
      section('definition', 'Core vocabulary',
        table('Image vs container', ['', 'Image', 'Container'], [
          ['What', 'Read-only template: filesystem layers + metadata (CMD, ENV, USER)', 'Running (or stopped) instance of an image'],
          ['Mutability', 'Immutable, identified by digest', 'Thin writable layer on top, discarded on removal'],
          ['Analogy', 'Class / executable file', 'Object / running process'],
          ['Created by', '`docker build`', '`docker run`'],
        ]),
        bullets(
          '**Dockerfile** — recipe of instructions (`FROM`, `COPY`, `RUN`, `CMD`).',
          '**Registry** — server storing images (Docker Hub, GitHub Container Registry, AWS ECR, Google Artifact Registry).',
          '**Tag** — mutable human label (`api:1.4.2`, `api:latest`); **digest** — immutable content hash (`sha256:…`).',
        ),
      ),
      section('why', 'Why containers',
        bullets(
          'Reproducible: the image built in CI is byte-for-byte what runs in production.',
          'Isolated: own filesystem, process tree and network namespace — but shares the host kernel (lighter than a VM).',
          'Portable: any container runtime (Docker, containerd, ECS, Kubernetes, Cloud Run) can run it.',
          'Fast to start compared to booting a VM.',
        ),
        table('Container vs virtual machine', ['', 'Container', 'VM'], [
          ['Kernel', 'Shares host kernel', 'Own guest kernel'],
          ['Startup', 'Milliseconds–seconds', 'Seconds–minutes'],
          ['Size', 'MBs', 'GBs'],
          ['Isolation', 'Process-level (namespaces, cgroups)', 'Hardware-level (hypervisor)'],
        ]),
      ),
      section('internals', 'Layers and the build cache',
        steps(
          'Each `RUN`, `COPY` and `ADD` instruction produces a new filesystem **layer** (a diff).',
          'Layers are stacked with a union filesystem; the container adds one writable layer on top.',
          'On rebuild Docker reuses a cached layer if the instruction **and its inputs** (for `COPY`: file checksums) are unchanged.',
          'Once one layer is invalidated, **every layer after it** is rebuilt.',
          'Hence: put rarely-changing steps (install deps) before frequently-changing ones (copy source).',
        ),
        note('Linux **namespaces** isolate what a process can see (PIDs, mounts, network); **cgroups** limit what it can use (CPU, memory). Docker orchestrates both.'),
      ),
      section('visual', 'Build, ship, run',
        flow(['Dockerfile', 'docker build: layered image', 'docker push: registry', 'docker pull: server', 'docker run: container'],
          { title: 'Image lifecycle', direction: 'horizontal' }),
      ),
      section('example', 'Essential commands',
        code({
          title: 'Build, run, inspect',
          language: 'bash',
          code: dedent(`
            docker build -t my-api:1.0.0 .
            docker run -d --name api -p 3000:3000 -e NODE_ENV=production my-api:1.0.0
            docker ps
            docker logs -f api
            docker exec -it api sh
            docker stop api && docker rm api
          `),
          expectedOutput: dedent(`
            CONTAINER ID   IMAGE          COMMAND                  STATUS         PORTS                    NAMES
            3f2a9c1b7d4e   my-api:1.0.0   "docker-entrypoint.s…"   Up 5 seconds   0.0.0.0:3000->3000/tcp   api
          `),
          explanation: [
            '`-p host:container` publishes the port; without it the app is unreachable from the host.',
            '`-d` runs detached; `docker logs -f` follows stdout/stderr.',
            '`docker exec` opens a shell inside the running container for debugging.',
            '`docker stop` sends SIGTERM, then SIGKILL after a grace period (10s default).',
          ],
        }),
        code({
          title: 'Pushing to a registry',
          language: 'bash',
          code: dedent(`
            docker tag my-api:1.0.0 ghcr.io/acme/my-api:1.0.0
            docker push ghcr.io/acme/my-api:1.0.0
          `),
          expectedOutput: '1.0.0: digest: sha256:4b1c…e9 size: 1786',
          explanation: [
            'The registry prefix in the tag decides where the image is pushed.',
            'Deploy by **digest** (or an immutable version tag) — `latest` can change under you.',
          ],
        }),
      ),
      section('real-world', 'In a real backend',
        bullets(
          'CI builds an image per commit, tags it with the git SHA and pushes to a private registry.',
          'The deploy step tells the orchestrator (ECS, Kubernetes, Cloud Run) to run that exact tag/digest.',
          'Local dev uses the same base image so Node and OS library versions match production.',
        ),
      ),
      section('mistakes', 'Common mistakes',
        bullets(
          'Treating containers as pets: SSH-ing in and editing files — changes vanish on restart.',
          'Writing persistent data inside the container filesystem instead of a volume or managed database.',
          'Deploying `:latest` — rollbacks become guesswork.',
          'Thinking containers are as isolated as VMs; a container running as root with extra privileges is a real risk.',
        ),
        code({
          title: 'Wrong vs right',
          language: 'bash',
          code: dedent(`
            # ❌ mutable tag, no idea what is running
            docker run my-api:latest
            # ✅ immutable tag tied to a commit
            docker run my-api:9c3e1f2
          `),
          explanation: ['Immutable tags make deployments auditable and rollbacks trivial.'],
        }),
      ),
      section('interview', 'Interview angle',
        interviewTip('Explain image vs container precisely, describe layer caching and why instruction order matters, and mention that containers share the host kernel.'),
      ),
      section('practice', 'Practice',
        steps(
          'Run `docker history <image>` on a Node image and identify which instruction created each layer.',
          'Change one source file and rebuild — note which steps say `CACHED`.',
        ),
      ),
      section('summary', 'Summary',
        bullets(
          'Image = immutable layered template; container = running instance + writable layer.',
          'Cache invalidation cascades to all later layers.',
          'Registries store images; deploy immutable tags or digests.',
          'Containers share the kernel; VMs do not.',
        ),
      ),
    ],
    revisionNotes: [
      'Image: read-only layers + metadata. Container: image + writable layer + process.',
      'RUN/COPY/ADD create layers; a changed layer rebuilds everything after it.',
      'Namespaces isolate, cgroups limit.',
      'docker stop: SIGTERM then SIGKILL after 10s.',
      'Tag mutable, digest immutable.',
    ],
    quiz: [
      {
        kind: 'mcq', difficulty: 'beginner',
        prompt: 'What is the relationship between an image and a container?',
        options: [
          'They are the same thing',
          'A container is a running instance of an image with a writable layer on top',
          'An image is a running container saved to disk automatically',
          'A container contains several images',
        ],
        answer: 1,
        explanation: 'Images are immutable templates; containers are instances that add a thin writable layer and a process.',
      },
      {
        kind: 'scenario', difficulty: 'intermediate',
        prompt: 'Every rebuild reinstalls all npm packages even when only `src/app.js` changed. The Dockerfile does `COPY . .` and then `RUN npm ci`. Why?',
        options: [
          'npm ci never uses cache',
          'Docker disables caching for RUN instructions',
          'Any source change invalidates the COPY layer, so every layer after it — including npm ci — is rebuilt',
          'The base image is pulled again each time',
        ],
        answer: 2,
        explanation: 'COPY layers are cached by file checksums. Copy package*.json first, run npm ci, then copy the source so dependency installation stays cached.',
      },
    ],
    interview: [
      {
        category: 'advanced', kind: 'concept', difficulty: 'beginner', topic: 'Docker',
        question: 'What is the difference between a Docker image and a container?',
        shortAnswer: 'An image is an immutable, layered filesystem template plus metadata; a container is a running instance of it with its own writable layer, process and network namespace.',
        detailedAnswer: [
          'Images are built from a Dockerfile and stored in registries.',
          'Many containers can run from one image.',
          'Container changes live in a writable layer and disappear when the container is removed.',
          'Persistent data belongs in volumes or external services.',
        ],
        followUp: 'Where should a containerised app store uploaded files?',
        trap: 'Saying a container is a lightweight VM with its own kernel.',
      },
      {
        category: 'advanced', kind: 'concept', difficulty: 'intermediate', topic: 'Docker',
        question: 'How does Docker layer caching work and how do you order Dockerfile instructions to benefit from it?',
        shortAnswer: 'Each instruction creates a layer that is reused if the instruction and its inputs are unchanged; a cache miss rebuilds all later layers, so put slow, stable steps (dependency install) before fast-changing ones (source copy).',
        detailedAnswer: [
          'COPY/ADD cache keys include checksums of the copied files.',
          'RUN cache keys are the command string (not its network results).',
          'Copy package.json + lockfile, run npm ci, then COPY the source.',
          'BuildKit cache mounts (`--mount=type=cache`) can also persist the npm cache between builds.',
        ],
        followUp: 'Why might a cached `RUN apt-get update` become a problem?',
        trap: 'Believing Docker detects that a remote package changed for a RUN step — it only compares the command text.',
      },
    ],
  },

  'dockerizing-node-js-applications': {
    summary: 'A production Node image uses a multi-stage build on a small official base, installs dependencies with cached layers, runs as the non-root `node` user, uses exec-form CMD so signals reach Node, and declares a healthcheck.',
    topics: ['multi-stage build', 'node:22-alpine', '.dockerignore', 'USER node', 'exec form CMD', 'PID 1', 'tini', '--init', 'HEALTHCHECK'],
    sections: [
      section('introduction', undefined,
        text('A naive `FROM node` + `COPY . .` + `npm start` image works, but it is large, runs as root, rebuilds dependencies on every change and may ignore shutdown signals. A few deliberate lines fix all four.'),
      ),
      section('definition', 'A production-grade Node Dockerfile',
        bullets(
          '**Multi-stage**: a `build` stage with dev tooling; a slim `runtime` stage with only `dist/` and production deps.',
          '**Small base**: `node:22-alpine` (musl libc, tiny) or `node:22-slim` (Debian, glibc — safer for native modules).',
          '**Cache-friendly order**: `COPY package*.json` → `npm ci` → `COPY` source.',
          '**Least privilege**: `USER node` (the official images ship a `node` user).',
          '**Signals**: `CMD ["node", "dist/server.js"]` in exec form, optionally with an init process.',
        ),
      ),
      section('why', 'Why each choice matters',
        table('Naive vs production image', ['Concern', 'Naive', 'Production'], [
          ['Size', '1 GB+ (full image, dev deps, sources)', '~150 MB or less'],
          ['Rebuild time', 'Reinstalls deps on every change', 'Deps layer cached'],
          ['Security', 'Root user, compilers, git in image', 'Non-root, no build tools'],
          ['Shutdown', '`npm start`/shell form may swallow SIGTERM', 'Node receives SIGTERM, drains, exits'],
        ]),
      ),
      section('internals', 'PID 1 and signal handling',
        steps(
          'The container\'s main process runs as **PID 1** inside its PID namespace.',
          'Linux gives PID 1 special treatment: signals with no installed handler are **ignored** instead of applying the default action (terminate). Node installs no SIGTERM handler by default.',
          '**Shell form** `CMD node dist/server.js` runs `/bin/sh -c "…"`: the shell is PID 1 and may not forward SIGTERM to Node.',
          '`npm start` adds another layer (npm → sh → node) and historically did not forward signals reliably.',
          'Result: `docker stop` waits 10 s and SIGKILLs — in-flight requests are cut off.',
          'Fix: exec-form `CMD ["node", …]` so Node is PID 1 **and** handle SIGTERM in code; add `docker run --init` (or `tini` in the image) to forward signals and reap zombie child processes.',
        ),
        warn('Even with exec form, Node as PID 1 ignores SIGTERM unless you register `process.on(\'SIGTERM\', …)`. An init process (tini / `--init`) restores default signal behaviour and reaps zombies.'),
      ),
      section('visual', 'Multi-stage build',
        flow(['Stage deps: package*.json → npm ci', 'Stage build: copy src → npm run build', 'Stage runtime: node:22-alpine, npm ci --omit=dev', 'Copy dist/ from build', 'USER node → CMD ["node","dist/server.js"]'],
          { title: 'Only the last stage ships' }),
      ),
      section('example', 'Dockerfile, .dockerignore, signal handler',
        code({
          title: 'Dockerfile',
          language: 'dockerfile',
          code: dedent(`
            # syntax=docker/dockerfile:1
            FROM node:22-alpine AS build
            WORKDIR /app
            COPY package.json package-lock.json ./
            RUN npm ci
            COPY tsconfig*.json ./
            COPY src ./src
            RUN npm run build

            FROM node:22-alpine AS runtime
            ENV NODE_ENV=production
            WORKDIR /app
            RUN apk add --no-cache tini
            COPY package.json package-lock.json ./
            RUN npm ci --omit=dev && npm cache clean --force
            COPY --from=build --chown=node:node /app/dist ./dist
            USER node
            EXPOSE 3000
            HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \\
              CMD wget -qO- http://127.0.0.1:3000/healthz || exit 1
            ENTRYPOINT ["/sbin/tini", "--"]
            CMD ["node", "--enable-source-maps", "dist/server.js"]
          `),
          expectedOutput: dedent(`
            $ docker build -t api:1.0.0 .
             => CACHED [runtime 4/6] RUN npm ci --omit=dev && npm cache clean --force
             => [build 6/6] RUN npm run build
             => exporting to image
            $ docker images api
            REPOSITORY   TAG     SIZE
            api          1.0.0   148MB
          `),
          explanation: [
            'The build stage has TypeScript and dev deps; none of it reaches the final image.',
            'Copying only the manifests before `npm ci` keeps that layer cached when source changes.',
            '`--chown=node:node` + `USER node` → the process cannot write to system paths.',
            'tini is PID 1, forwards SIGTERM to Node and reaps zombies; `docker run --init` is the runtime alternative.',
            '`HEALTHCHECK` uses `wget` because alpine has it via busybox; with `slim` images use `node -e` or install curl. Kubernetes ignores HEALTHCHECK and uses its own probes.',
            'Image size is indicative and varies with dependencies.',
          ],
        }),
        code({
          title: '.dockerignore',
          language: 'text',
          code: dedent(`
            node_modules
            dist
            .git
            .env
            *.log
            coverage
            Dockerfile
            docker-compose*.yml
          `),
          explanation: [
            'Keeps the build context small (faster builds).',
            'Prevents host `node_modules` (wrong platform binaries) from overwriting the container install.',
            'Keeps secrets such as `.env` out of the image.',
          ],
        }),
        code({
          title: 'Handle SIGTERM in the app',
          code: dedent(`
            const server = app.listen(3000);

            process.on('SIGTERM', () => {
              console.log('SIGTERM received, draining');
              server.close(() => {
                console.log('closed, exiting');
                process.exit(0);
              });
              setTimeout(() => process.exit(1), 10_000).unref(); // hard deadline
            });
          `),
          expectedOutput: 'SIGTERM received, draining\nclosed, exiting',
          explanation: [
            '`server.close` stops accepting new connections and calls back when existing ones finish.',
            'The `unref`ed timer forces exit if draining takes longer than the orchestrator\'s grace period.',
            'See Module 11 "Graceful shutdown" for closing DB pools and queues too.',
          ],
        }),
      ),
      section('real-world', 'In a real backend',
        bullets(
          'Pin the base image to a major version (`node:22-alpine`) and rebuild regularly to pick up security patches; pin a digest for maximum reproducibility.',
          'Scan images in CI (Docker Scout, Trivy, Grype).',
          'Use `node:22-slim` if you depend on native modules compiled against glibc (e.g. some image or crypto libraries).',
          'Distroless images (`gcr.io/distroless/nodejs22-debian12`) remove even the shell — smaller attack surface, harder debugging.',
        ),
      ),
      section('mistakes', 'Common mistakes',
        code({
          title: 'Shell form vs exec form',
          language: 'dockerfile',
          code: dedent(`
            # ❌ sh is PID 1; SIGTERM may never reach node
            CMD npm start
            # ✅ node receives signals directly
            CMD ["node", "dist/server.js"]
          `),
          explanation: ['Exec form (JSON array) runs the binary directly without a shell wrapper.'],
        }),
        bullets(
          'No `.dockerignore` → host `node_modules` and `.env` copied in.',
          '`COPY . .` before `npm ci` → no dependency caching.',
          'Running as root.',
          'Using `npm install` instead of `npm ci` (non-reproducible).',
          'Shipping devDependencies and TypeScript in the runtime image.',
        ),
      ),
      section('interview', 'Interview angle',
        interviewTip('The PID 1 question is a favourite: explain why shell-form CMD or `npm start` can cause 10-second shutdowns with SIGKILL, and how exec form, a SIGTERM handler and tini/`--init` fix it.'),
      ),
      section('practice', 'Practice',
        steps(
          'Write a single-stage Dockerfile, measure image size, then convert to multi-stage and compare.',
          'Run `time docker stop` with `CMD npm start` vs exec form plus a SIGTERM handler.',
          'Run `docker exec api whoami` to confirm the process runs as `node`.',
        ),
      ),
      section('summary', 'Summary',
        bullets(
          'Multi-stage: build tools stay in the builder.',
          'Manifests → `npm ci` → source, for cache hits.',
          '`USER node`, `.dockerignore`, no secrets in the image.',
          'Exec-form CMD + SIGTERM handler + tini/`--init`.',
          'HEALTHCHECK for Docker/Compose; orchestrators use their own probes.',
        ),
      ),
    ],
    revisionNotes: [
      'PID 1 ignores signals without handlers; shell form puts sh at PID 1.',
      'Exec form CMD ["node","dist/server.js"]; avoid npm start as CMD.',
      'tini or docker run --init: forwards signals, reaps zombies.',
      'COPY package*.json → RUN npm ci → COPY src.',
      'Runtime stage: npm ci --omit=dev, USER node, copy dist from build stage.',
      'alpine = musl (native module caveats); slim = glibc.',
    ],
    quiz: [
      {
        kind: 'find-bug', difficulty: 'intermediate',
        prompt: 'What is the main problem with this Dockerfile?',
        code: 'FROM node:22-alpine\nWORKDIR /app\nCOPY . .\nRUN npm ci --omit=dev\nCMD npm start',
        options: [
          'WORKDIR must be /usr/src/app',
          'alpine images cannot run Node',
          'Dependency layer is never cached and shell-form npm start can keep SIGTERM from reaching Node; it also runs as root',
          'npm ci cannot be used in Docker',
        ],
        answer: 2,
        explanation: 'COPY . . before npm ci busts the cache on every change; shell-form npm start wraps Node in sh/npm; there is no USER node. WORKDIR path is arbitrary.',
      },
      {
        kind: 'complete-code', difficulty: 'intermediate',
        prompt: 'Complete the final instruction so that Node runs directly as the main process.',
        code: 'USER node\n/* ??? */',
        options: [
          'CMD node dist/server.js',
          'CMD ["node", "dist/server.js"]',
          'RUN node dist/server.js',
          'CMD ["npm", "run", "dev"]',
        ],
        answer: 1,
        explanation: 'Exec form runs node without a shell. RUN executes at build time, not at container start; the shell form puts sh in front of node.',
      },
      {
        kind: 'mcq', difficulty: 'advanced',
        prompt: 'Why add tini (or `docker run --init`) even when using exec-form CMD?',
        options: [
          'It makes Node faster',
          'It forwards signals with default behaviour and reaps zombie processes, which Node as PID 1 does not do',
          'It is required for HEALTHCHECK',
          'It compresses the image',
        ],
        answer: 1,
        explanation: 'As PID 1, Node ignores unhandled signals and does not reap orphaned children. A tiny init process fixes both.',
      },
    ],
    interview: [
      {
        category: 'advanced', kind: 'scenario', difficulty: 'advanced', topic: 'Docker',
        question: 'Your Node container always takes about 10 seconds to stop and in-flight requests fail during deploys. What is happening and how do you fix it?',
        shortAnswer: 'SIGTERM is not reaching or not handled by Node (shell-form CMD/npm start, or Node as PID 1 with no handler), so Docker SIGKILLs after the grace period; use exec form, handle SIGTERM with server.close, and add tini/--init.',
        detailedAnswer: [
          '`docker stop` sends SIGTERM, waits 10 s, then SIGKILL.',
          'Shell form makes sh PID 1; it may not forward signals.',
          'PID 1 ignores signals with no handler — Node has no default SIGTERM handler.',
          'Fix: `CMD ["node","dist/server.js"]`, `process.on("SIGTERM")` → stop accepting, drain, close pools, exit.',
          'Add an init (tini / `--init`) and align the app\'s drain timeout with the orchestrator grace period.',
        ],
        followUp: 'How does readiness interact with graceful shutdown behind a load balancer?',
        trap: 'Just increasing the stop timeout — requests still get killed, only later.',
      },
      {
        category: 'advanced', kind: 'concept', difficulty: 'intermediate', topic: 'Docker',
        question: 'Why use a multi-stage Dockerfile for a TypeScript Node.js service?',
        shortAnswer: 'The build stage holds compilers and devDependencies to produce dist/, and the runtime stage copies only dist/ plus production dependencies — a smaller, faster, more secure image.',
        detailedAnswer: [
          'Each FROM starts a new stage; only the last stage is the output image (by default).',
          '`COPY --from=build` pulls artifacts between stages.',
          'Removes TypeScript, test tools, source and caches from production.',
          'Reduces attack surface and pull time.',
        ],
        followUp: 'How would you share a node_modules install between stages?',
        trap: 'Thinking deleting files in a later RUN shrinks the image — earlier layers still contain them.',
      },
      {
        category: 'advanced', kind: 'concept', difficulty: 'advanced', topic: 'Docker',
        question: 'Should you choose node:alpine or node:slim as a base image? What are the trade-offs?',
        shortAnswer: 'Alpine is smallest but uses musl libc, which can break or slow native modules expecting glibc; slim is Debian-based with glibc and better compatibility at a somewhat larger size.',
        detailedAnswer: [
          'Alpine: tiny, busybox tools, apk; prebuilt binaries must target musl.',
          'Slim: Debian minus extras, glibc, apt.',
          'Native deps (e.g. some image/crypto/DB drivers) may need rebuilding on alpine.',
          'Distroless: no shell or package manager — minimal surface, harder to debug.',
          'Whatever you choose: pin the major version and rebuild for security updates.',
        ],
        followUp: 'How would you debug a distroless container with no shell?',
        trap: 'Assuming smaller is always better regardless of native module compatibility.',
      },
    ],
  },

  'docker-compose': {
    summary: 'Docker Compose defines a multi-container application (API, Postgres, Redis) in one YAML file with services, networks, volumes, env files and health-aware start ordering.',
    topics: ['compose.yaml', 'services', 'depends_on', 'condition: service_healthy', 'volumes', 'networks', 'env_file', 'docker compose up'],
    sections: [
      section('introduction', undefined,
        text('An API rarely runs alone. Starting Postgres, Redis and the app by hand with the right ports, networks and env vars is error-prone. Compose describes the whole stack declaratively and starts it with one command.'),
      ),
      section('definition', 'What Compose is',
        bullets(
          'A YAML file (`compose.yaml` or `docker-compose.yml`) describing **services**, **networks** and **volumes**.',
          '`docker compose up` creates a default network where services reach each other **by service name** (`postgres:5432`).',
          'Mostly used for local development, integration tests in CI and small single-host deployments.',
          'For multi-host production, an orchestrator (Kubernetes, ECS, Nomad) or PaaS takes over.',
        ),
      ),
      section('why', 'Why use it',
        bullets(
          'Onboarding becomes `git clone && docker compose up`.',
          'Integration tests in CI get real Postgres/Redis instead of mocks.',
          'Version-controlled infrastructure for local dev.',
        ),
      ),
      section('internals', 'How start order and networking work',
        steps(
          'Compose creates a project network; each service gets a DNS name equal to its service key.',
          '`depends_on` alone only waits for the dependency **container to start**, not to be ready.',
          '`depends_on: { postgres: { condition: service_healthy } }` waits until the dependency\'s `healthcheck` passes.',
          'Named volumes persist data across `down`/`up`; `docker compose down -v` deletes them.',
          '`env_file` and `environment` inject variables; `${VAR}` in the YAML is interpolated from the shell or a `.env` file next to it.',
        ),
        warn('Even with health conditions, the app must retry DB connections — dependencies can restart at any time in real environments.'),
      ),
      section('visual', 'Compose stack',
        flow(['api: build ., port 3000', 'postgres: postgres:16, volume pgdata', 'redis: redis:7'],
          { title: 'One network, services resolve by name', direction: 'horizontal', caption: 'api connects to postgres:5432 and redis:6379 via Compose DNS.' }),
      ),
      section('example', 'API + Postgres + Redis',
        code({
          title: 'compose.yaml',
          language: 'yaml',
          code: dedent(`
            services:
              api:
                build: .
                ports:
                  - "3000:3000"
                env_file: .env
                environment:
                  DATABASE_URL: postgres://app:app@postgres:5432/app
                  REDIS_URL: redis://redis:6379
                depends_on:
                  postgres:
                    condition: service_healthy
                  redis:
                    condition: service_started
                restart: unless-stopped
                networks: [backend]

              postgres:
                image: postgres:16-alpine
                environment:
                  POSTGRES_USER: app
                  POSTGRES_PASSWORD: app
                  POSTGRES_DB: app
                volumes:
                  - pgdata:/var/lib/postgresql/data
                healthcheck:
                  test: ["CMD-SHELL", "pg_isready -U app -d app"]
                  interval: 5s
                  timeout: 3s
                  retries: 10
                networks: [backend]

              redis:
                image: redis:7-alpine
                networks: [backend]

            volumes:
              pgdata:

            networks:
              backend:
          `),
          expectedOutput: dedent(`
            $ docker compose up -d
             ✔ Network app_backend      Created
             ✔ Volume "app_pgdata"      Created
             ✔ Container app-redis-1    Started
             ✔ Container app-postgres-1 Healthy
             ✔ Container app-api-1      Started
          `),
          explanation: [
            'The API uses hostnames `postgres` and `redis` — Compose DNS resolves them on the shared network.',
            '`condition: service_healthy` delays the API until `pg_isready` succeeds.',
            'Only the API publishes a port; databases stay private to the network.',
            '`pgdata` survives `docker compose down` (but not `down -v`).',
            'Credentials here are for local dev only — production uses secrets.',
          ],
        }),
        code({
          title: 'Everyday commands',
          language: 'bash',
          code: dedent(`
            docker compose up -d --build
            docker compose logs -f api
            docker compose exec postgres psql -U app
            docker compose down
          `),
          expectedOutput: 'app-api-1  | {"level":30,"msg":"connected to postgres"}\napp-api-1  | {"level":30,"msg":"listening","port":3000}',
          explanation: ['`--build` rebuilds the api image when the Dockerfile or context changed.'],
        }),
      ),
      section('real-world', 'In a real backend',
        bullets(
          'A `compose.override.yaml` (merged automatically) mounts source code and runs `node --watch` for dev, while the base file stays production-like.',
          'CI: `docker compose up -d postgres redis` → run migrations → run integration tests → `down -v`.',
          'Profiles (`profiles: [tools]`) keep optional services like pgAdmin off by default.',
        ),
      ),
      section('mistakes', 'Common mistakes',
        code({
          title: 'Using localhost between containers',
          language: 'yaml',
          code: dedent(`
            # ❌ localhost inside the api container is the api container itself
            DATABASE_URL: postgres://app:app@localhost:5432/app
            # ✅ use the service name
            DATABASE_URL: postgres://app:app@postgres:5432/app
          `),
          explanation: ['Each container has its own network namespace; `localhost` never refers to another service.'],
        }),
        bullets(
          'Plain `depends_on` and expecting the DB to be ready.',
          'Publishing database ports to `0.0.0.0` on shared machines.',
          'Losing data with `docker compose down -v` unintentionally.',
          'Committing real secrets in `compose.yaml`.',
        ),
      ),
      section('interview', 'Interview angle',
        interviewTip('Highlight that `depends_on` without a health condition only orders container start, and that apps must still retry connections.'),
      ),
      section('practice', 'Practice',
        text('Add a `worker` service that reuses the API image with `command: ["node", "dist/worker.js"]`, depends on healthy Redis, and has no published ports.'),
      ),
      section('summary', 'Summary',
        bullets(
          'Compose = declarative multi-container stack.',
          'Services talk by name on a shared network.',
          'Use healthchecks + `condition: service_healthy`.',
          'Named volumes persist data; `down -v` removes them.',
          'Great for dev and CI; orchestrators for multi-host prod.',
        ),
      ),
    ],
    revisionNotes: [
      'Service name = DNS hostname on the Compose network.',
      'depends_on default waits for start, not readiness; use condition: service_healthy.',
      'Named volumes survive down; down -v deletes them.',
      '${VAR} interpolation from shell / .env; env_file injects into the container.',
      'localhost inside a container is that container.',
    ],
    quiz: [
      {
        kind: 'scenario', difficulty: 'intermediate',
        prompt: 'The API container crashes on `docker compose up` with "ECONNREFUSED postgres:5432", but works if restarted a few seconds later. Best fix?',
        options: [
          'Add `sleep 10` to the API command',
          'Add a Postgres healthcheck, use `depends_on: { postgres: { condition: service_healthy } }`, and retry connections in the app',
          'Change the host to localhost',
          'Publish port 5432 on the host',
        ],
        answer: 1,
        explanation: 'Plain depends_on only waits for the container to start. A health condition plus connection retries handles readiness properly; sleep is fragile.',
      },
      {
        kind: 'mcq', difficulty: 'beginner',
        prompt: 'Inside the `api` service, how do you reach the `redis` service on the same Compose network?',
        options: ['redis://localhost:6379', 'redis://127.0.0.1:6379', 'redis://redis:6379', 'redis://host.docker.internal:6379 only'],
        answer: 2,
        explanation: 'Compose registers each service name in its internal DNS. localhost refers to the api container itself.',
      },
    ],
    interview: [
      {
        category: 'advanced', kind: 'concept', difficulty: 'intermediate', topic: 'Docker Compose',
        question: 'What does depends_on guarantee in Docker Compose, and how do you wait for a database to be ready?',
        shortAnswer: 'By default only that the dependency container has started; to wait for readiness add a healthcheck to the database and use condition: service_healthy, while still retrying connections in the app.',
        detailedAnswer: [
          'Start order ≠ readiness: Postgres needs seconds to initialise.',
          'Healthcheck example: `pg_isready`.',
          '`condition: service_healthy` / `service_completed_successfully` (for one-off migration jobs).',
          'Production orchestrators do not honour Compose ordering — retries with backoff are mandatory anyway.',
        ],
        followUp: 'How would you run migrations before the API starts in Compose?',
        trap: 'Adding a fixed sleep and calling it solved.',
      },
      {
        category: 'advanced', kind: 'scenario', difficulty: 'advanced', topic: 'Docker Compose',
        question: 'Would you use Docker Compose to run your production API? When is it reasonable and when not?',
        shortAnswer: 'It is reasonable for a single host with modest availability needs, but it lacks multi-host scheduling, rolling updates and self-healing across machines, so larger production setups use an orchestrator or PaaS.',
        detailedAnswer: [
          'Compose runs on one Docker host — that host is a single point of failure.',
          'No built-in zero-downtime rolling deploys across nodes.',
          'Restart policies give basic self-healing only.',
          'Good fits: internal tools, small apps, dev, CI.',
          'Alternatives: Kubernetes, ECS/Fargate, Cloud Run, Nomad, PaaS.',
        ],
        followUp: 'What would you need to add for zero-downtime deploys on a single host?',
        trap: 'Saying Compose is "only for development" — it can run production on a single host, with limits.',
      },
    ],
  },
};

export default content;
