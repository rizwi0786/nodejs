import type { ModuleContent } from '../../../types';
import { bullets, code, dedent, diagram, flow, interviewTip, note, section, steps, table, text, warn } from '../helpers';

const content: Partial<ModuleContent> = {
  'horizontal-scaling': {
    summary: 'Horizontal scaling adds more instances of a service behind a load balancer; it requires stateless instances, with sessions, caches, uploads and locks moved to shared stores such as Redis, a database or object storage.',
    topics: ['scale out', 'stateless services', 'sessions in Redis', 'shared state', 'autoscaling', 'sticky sessions', 'Socket.IO adapter'],
    sections: [
      section('introduction', undefined,
        text('When one server is not enough, you can buy a bigger one (vertical) or run more of them (horizontal). Horizontal scaling has no hard ceiling and survives instance failures — but only if any instance can handle any request.'),
      ),
      section('definition', 'Scale out',
        bullets(
          '**Horizontal scaling (scale out)**: N identical instances behind a load balancer.',
          'Within one machine: Node `cluster` or pm2 across CPU cores (Module 11).',
          'Across machines: containers/VMs behind a load balancer, often with **autoscaling** on CPU, request rate or queue depth.',
        ),
      ),
      section('why', 'Horizontal vs vertical',
        table('Scaling approaches', ['', 'Horizontal (out)', 'Vertical (up)'], [
          ['How', 'Add instances', 'Bigger instance (CPU/RAM)'],
          ['Limit', 'Practically very high', 'Largest available machine'],
          ['Availability', 'Survives instance loss', 'Single point of failure'],
          ['App changes', 'Must be stateless', 'Usually none'],
          ['Downtime to scale', 'None (add instances)', 'Often a restart'],
          ['Complexity', 'LB, shared state, distributed concerns', 'Low'],
        ]),
      ),
      section('internals', 'Making a Node service stateless',
        table('Where in-process state must go', ['State', 'Problem if local', 'Move it to'], [
          ['Sessions', 'User logged out when hitting another instance', 'Redis (connect-redis) or stateless JWT'],
          ['In-memory cache', 'Inconsistent across instances', 'Redis / Memcached (or accept per-instance cache with short TTL)'],
          ['Uploaded files', 'File exists on one disk only', 'Object storage (S3, GCS, Azure Blob)'],
          ['Rate-limit counters', 'Limit multiplied by N', 'Redis-backed store'],
          ['Cron jobs / timers', 'Run N times', 'Job queue with a single scheduler or distributed lock'],
          ['WebSocket rooms', 'Broadcast reaches only local clients', 'Socket.IO Redis adapter / pub/sub'],
        ]),
        note('Stateless does not mean "no state" — it means state lives outside the process, so instances are disposable.'),
      ),
      section('visual', 'Scale out',
        diagram('reverse-proxy', 'Load balancer → N identical Node instances → shared Redis + database.'),
      ),
      section('example', 'Sessions in Redis',
        code({
          title: 'express-session + connect-redis (third-party)',
          code: dedent(`
            const express = require('express');
            const session = require('express-session');
            const { RedisStore } = require('connect-redis');
            const { createClient } = require('redis');

            const redis = createClient({ url: process.env.REDIS_URL });
            await redis.connect();

            const app = express();
            app.set('trust proxy', 1);
            app.use(session({
              store: new RedisStore({ client: redis, prefix: 'sess:' }),
              secret: process.env.SESSION_SECRET,
              resave: false,
              saveUninitialized: false,
              cookie: { secure: true, httpOnly: true, sameSite: 'lax', maxAge: 86_400_000 },
            }));

            app.get('/me', (req, res) => {
              req.session.views = (req.session.views ?? 0) + 1;
              res.json({ views: req.session.views, instance: process.env.HOSTNAME });
            });
          `),
          expectedOutput: '{"views":1,"instance":"api-7c9f"}\n{"views":2,"instance":"api-b21d"}\n{"views":3,"instance":"api-7c9f"}',
          explanation: [
            'Three requests hit different instances, yet the counter keeps increasing — the session lives in Redis.',
            'Uses top-level `await`, so this file must be an ES module or wrapped in an async function.',
            'connect-redis v8 exports `{ RedisStore }`; older versions used a different export — check the version you install.',
          ],
        }),
        code({
          title: 'Why local state breaks with N instances',
          code: dedent(`
            class Instance {
              constructor(name) { this.name = name; this.sessions = new Map(); }
              handle(sid) {
                const views = (this.sessions.get(sid) ?? 0) + 1;
                this.sessions.set(sid, views);
                return this.name + ':' + views;
              }
            }
            const pool = [new Instance('A'), new Instance('B')];
            let rr = 0;
            const lb = (sid) => pool[rr++ % pool.length].handle(sid);

            console.log(lb('u1'), lb('u1'), lb('u1'), lb('u1'));
          `),
          expectedOutput: 'A:1 B:1 A:2 B:2',
          explanation: [
            'Each instance keeps its own Map, so the user\'s count is split across instances.',
            'With a shared store the output would be 1, 2, 3, 4 regardless of instance.',
          ],
          runnable: true,
        }),
      ),
      section('real-world', 'In a real backend',
        bullets(
          'Autoscaling rules: target 60% CPU, or scale workers on queue length.',
          'Database becomes the bottleneck next: connection pools × instances can exceed `max_connections` — use a pooler (PgBouncer) or smaller pools.',
          'Socket.IO across instances needs the Redis adapter (and sticky sessions for the HTTP long-polling transport).',
          'Background schedulers run as a separate single-replica deployment or use locks.',
        ),
      ),
      section('mistakes', 'Common mistakes',
        bullets(
          'Default `MemoryStore` for express-session in production (leaks memory, not shared).',
          'Writing uploads to the local disk of a container.',
          '`setInterval` jobs running on every replica.',
          'Ignoring total DB connections: 20 instances × pool of 20 = 400 connections.',
        ),
        code({
          title: 'Wrong vs right: scheduled work',
          code: dedent(`
            // ❌ runs once per replica
            setInterval(sendDailyDigest, 24 * 3600 * 1000);
            // ✅ one repeatable job in a queue (e.g. BullMQ), processed by any worker once
            await queue.add('daily-digest', {}, { repeat: { pattern: '0 8 * * *' } });
          `),
          explanation: ['A queue deduplicates the schedule so the digest is sent once, not N times.'],
        }),
      ),
      section('interview', 'Interview angle',
        interviewTip('List concrete state that must leave the process (sessions, uploads, rate limits, cron, sockets) and where it goes. Mention the DB-connection multiplication problem.'),
      ),
      section('practice', 'Practice',
        text('Run two instances of an Express app behind Nginx with in-memory sessions; observe logins "forgetting" you; switch to a Redis store and confirm it works.'),
      ),
      section('summary', 'Summary',
        bullets(
          'Scale out = more identical instances behind an LB.',
          'Requires stateless processes; state in Redis/DB/object storage.',
          'Watch shared bottlenecks: DB connections, Redis, locks.',
          'Prefer shared stores over sticky sessions.',
        ),
      ),
    ],
    revisionNotes: [
      'Horizontal: more instances, no ceiling, HA; needs statelessness.',
      'Sessions → Redis or JWT; files → object storage; rate limits → Redis.',
      'Cron in N replicas runs N times — use a queue/lock.',
      'Pool size × replicas ≤ DB max_connections.',
      'Socket.IO multi-instance → Redis adapter.',
    ],
    quiz: [
      {
        kind: 'predict-output', difficulty: 'intermediate',
        prompt: 'Two instances, round-robin, each with an in-memory counter per user. What prints?',
        code: "const a = new Map(), b = new Map();\nconst pool = [a, b];\nlet i = 0;\nfunction hit(u) { const m = pool[i++ % 2]; m.set(u, (m.get(u) ?? 0) + 1); return m.get(u); }\nconsole.log(hit('x'), hit('x'), hit('x'));",
        options: ['1 2 3', '1 1 2', '1 1 1', '2 2 2'],
        answer: 1,
        explanation: 'Hits alternate a, b, a → a:1, b:1, a:2. Local state splits across instances.',
      },
      {
        kind: 'scenario', difficulty: 'intermediate',
        prompt: 'After scaling from 1 to 6 API replicas, users report getting rate-limited at 6× the configured limit. Why?',
        options: [
          'The load balancer is broken',
          'Each replica keeps its own in-memory counter, so the effective limit is multiplied by the number of replicas',
          'Rate limiting does not work behind proxies',
          'Redis is too slow',
        ],
        answer: 1,
        explanation: 'In-memory stores are per process. A shared Redis-backed store gives one global counter.',
      },
    ],
    interview: [
      {
        category: 'advanced', kind: 'concept', difficulty: 'intermediate', topic: 'Scaling',
        question: 'What does it mean for a service to be stateless, and why is it required for horizontal scaling?',
        shortAnswer: 'Any instance can serve any request because no request depends on data held in a specific process; state lives in shared stores, so instances can be added, removed or replaced freely.',
        detailedAnswer: [
          'Load balancers may send consecutive requests to different instances.',
          'Sessions, caches, files, counters must live in Redis/DB/object storage.',
          'Instances become disposable — crashes and autoscaling are safe.',
          'Sticky sessions are a fallback that hurts balancing and failover.',
        ],
        followUp: 'How would you handle WebSocket broadcasts across instances?',
        trap: 'Thinking stateless means the application has no state at all.',
      },
      {
        category: 'advanced', kind: 'scenario', difficulty: 'advanced', topic: 'Scaling',
        question: 'You scale an API from 2 to 30 instances and the database starts refusing connections. What happened and what do you do?',
        shortAnswer: 'Each instance opens its own connection pool, so total connections grew 15× past the database limit; reduce per-instance pool size, add a connection pooler such as PgBouncer, and scale reads with replicas or caching.',
        detailedAnswer: [
          'Total = replicas × pool max (e.g. 30 × 10 = 300) vs Postgres `max_connections`.',
          'Each Postgres connection is a process with real memory cost.',
          'Use PgBouncer in transaction mode or a managed proxy (e.g. RDS Proxy).',
          'Tune pool sizes, add caching, offload reads to replicas.',
          'Set autoscaling limits that respect downstream capacity.',
        ],
        followUp: 'What limitations does PgBouncer transaction pooling impose on the application?',
        trap: 'Simply raising max_connections without considering database memory.',
      },
    ],
  },

  'vertical-scaling': {
    summary: 'Vertical scaling gives a single instance more CPU, memory or faster disks; it is simple and needs no code changes, but has a hard ceiling, often requires a restart, and keeps a single point of failure — and Node only benefits from extra cores if you use them.',
    topics: ['scale up', 'instance size', '--max-old-space-size', 'cluster', 'UV_THREADPOOL_SIZE', 'single point of failure'],
    sections: [
      section('introduction', undefined,
        text('The quickest fix for an overloaded server is often a bigger server. It is a legitimate strategy — especially for databases — but you need to know what Node can and cannot take advantage of.'),
      ),
      section('definition', 'Scale up',
        bullets(
          'Increase resources of one machine/container: vCPUs, RAM, network, IOPS.',
          'Typical for stateful systems that are hard to distribute (primary databases, Redis primary).',
          'Usually needs a restart or migration to a new instance type.',
        ),
      ),
      section('why', 'When it makes sense',
        table('Pros and cons', ['Pros', 'Cons'], [
          ['No architecture change', 'Hard ceiling (largest machine)'],
          ['No distributed-systems issues', 'Single point of failure remains'],
          ['Good for databases', 'Cost often rises faster than capacity at the top end'],
          ['Quick to apply', 'Often requires downtime to resize'],
        ]),
      ),
      section('internals', 'What Node can use',
        steps(
          '**CPU**: one Node process runs JavaScript on one main thread. More cores help only with `cluster`/pm2 workers, worker threads, or libuv pool work (fs, crypto, zlib, dns.lookup).',
          '**Memory**: V8\'s old-space heap limit is set by Node based on available memory; raise it with `--max-old-space-size=<MB>` if you really need a larger heap.',
          '**Containers**: modern Node reads cgroup memory limits when computing heap defaults, but explicit settings remove surprises.',
          '**Thread pool**: `UV_THREADPOOL_SIZE` (default 4, max 1024) can be raised for heavy fs/crypto workloads.',
        ),
        warn('Doubling vCPUs on a single-process Node API often changes nothing — the event loop is still on one core. Measure first.'),
      ),
      section('visual', 'Scale up path',
        flow(['2 vCPU / 4 GB: 1 Node process', '8 vCPU / 16 GB: still 1 process → idle cores', '8 vCPU + cluster/pm2: 8 workers'],
          { title: 'More cores need more processes', direction: 'horizontal' }),
      ),
      section('example', 'Using a bigger machine',
        code({
          title: 'Check cores and heap limit',
          language: 'bash',
          code: dedent(`
            node -e "console.log(require('node:os').availableParallelism())"
            node -e "console.log(require('node:v8').getHeapStatistics().heap_size_limit / 1024 / 1024 | 0, 'MB')"
            node --max-old-space-size=3072 -e "console.log(require('node:v8').getHeapStatistics().heap_size_limit / 1024 / 1024 | 0, 'MB')"
          `),
          expectedOutput: '8\n4144 MB\n3120 MB',
          explanation: [
            '`os.availableParallelism()` (Node 18.14+) reports usable cores.',
            'Default heap limit depends on system memory; values shown are illustrative.',
            '`--max-old-space-size` sets old-space in MB; the reported limit includes a little extra for other spaces.',
          ],
        }),
        code({
          title: 'Use all cores with pm2 (third-party)',
          language: 'bash',
          code: 'pm2 start dist/server.js -i max --name api',
          expectedOutput: '[PM2] Starting dist/server.js in cluster_mode (8 instances)\n[PM2] Done.',
          explanation: ['`-i max` forks one worker per core — this is horizontal scaling *inside* one vertically scaled machine.'],
        }),
      ),
      section('real-world', 'In a real backend',
        bullets(
          'Postgres primary scaled up to a larger instance class; API tier scaled out.',
          'Memory-hungry jobs (PDF/image processing) run on larger worker instances separate from the API.',
          'Container platforms: raise CPU/memory requests and limits per task/pod.',
        ),
      ),
      section('mistakes', 'Common mistakes',
        bullets(
          'Throwing RAM at a memory leak — it only delays the crash.',
          'Buying more cores for a single-process Node app.',
          'Setting `--max-old-space-size` above the container memory limit → OOM-killed by the kernel instead of a clean V8 error.',
        ),
        code({
          title: 'Wrong vs right heap setting in a 1 GB container',
          language: 'bash',
          code: dedent(`
            # ❌ heap may grow past the container limit → SIGKILL by OOM killer
            node --max-old-space-size=2048 dist/server.js
            # ✅ leave headroom for buffers, native memory and stacks
            node --max-old-space-size=768 dist/server.js
          `),
          explanation: ['Buffers and native allocations live outside the V8 heap but count toward the container limit.'],
        }),
      ),
      section('interview', 'Interview angle',
        interviewTip('Point out that Node needs multiple processes to use more cores, and that vertical scaling is common for databases while app tiers usually scale out.'),
      ),
      section('practice', 'Practice',
        text('Load-test a CPU-bound endpoint with `autocannon` on 1 process vs `pm2 -i max` on the same machine and compare requests/second.'),
      ),
      section('summary', 'Summary',
        bullets(
          'Scale up = bigger box; simple but capped and single-point-of-failure.',
          'Node uses extra cores only with multiple processes/threads.',
          'Tune heap with `--max-old-space-size` within container limits.',
          'Common for databases; app tiers usually scale out.',
        ),
      ),
    ],
    revisionNotes: [
      'Vertical = more CPU/RAM on one node; ceiling + SPOF.',
      'One Node process ≈ one core for JS.',
      '--max-old-space-size in MB; keep below container memory limit.',
      'UV_THREADPOOL_SIZE default 4.',
      'Databases often scale up; stateless APIs scale out.',
    ],
    quiz: [
      {
        kind: 'scenario', difficulty: 'beginner',
        prompt: 'A single-process Express API is CPU-bound at 100% of one core. You move it from 2 to 16 vCPUs. What happens?',
        options: [
          'Throughput grows about 8×',
          'Little changes — one process still runs JavaScript on one core unless you add workers (cluster/pm2)',
          'Node automatically spawns 16 threads for requests',
          'The app crashes',
        ],
        answer: 1,
        explanation: 'The event loop is single-threaded. Extra cores help only if you run more processes or worker threads.',
      },
      {
        kind: 'mcq', difficulty: 'intermediate',
        prompt: 'Which is a genuine drawback of vertical scaling?',
        options: [
          'It requires rewriting the app to be stateless',
          'It has a hard upper limit and leaves a single point of failure',
          'It cannot increase memory',
          'It always needs a load balancer',
        ],
        answer: 1,
        explanation: 'Vertical scaling needs no code changes, but there is always a largest machine, and one machine can still fail.',
      },
    ],
    interview: [
      {
        category: 'advanced', kind: 'concept', difficulty: 'beginner', topic: 'Scaling',
        question: 'What is vertical scaling and what are its limits for a Node.js application?',
        shortAnswer: 'Giving one instance more CPU or memory; it is simple but capped by the largest machine, keeps a single point of failure, and a single Node process cannot use extra cores for JavaScript without clustering or worker threads.',
        detailedAnswer: [
          'No code change; usually a resize/restart.',
          'Extra RAM helps heap-hungry workloads (raise --max-old-space-size carefully).',
          'Extra cores need cluster/pm2 workers or worker_threads.',
          'Typical for databases; app tiers prefer scaling out.',
        ],
        followUp: 'How would you use all cores on a 16-core machine?',
        trap: 'Believing Node automatically spreads requests over all cores.',
      },
    ],
  },

  'cloud-deployment': {
    summary: 'Node services can be deployed to VMs, container platforms, PaaS or serverless functions; each trades control for convenience differently, and the right choice depends on traffic shape, team skills and operational needs.',
    topics: ['IaaS', 'PaaS', 'containers', 'serverless', 'ECS Fargate', 'Cloud Run', 'Kubernetes', 'cold start', 'managed services'],
    sections: [
      section('introduction', undefined,
        text('"Deploy to the cloud" covers very different models — from renting a raw VM to uploading a function. Knowing the trade-offs lets you pick the simplest option that meets your requirements.'),
      ),
      section('definition', 'Deployment models',
        table('VMs vs containers vs PaaS vs serverless', ['Model', 'You manage', 'Platform manages', 'Examples (generic)'], [
          ['VMs (IaaS)', 'OS, patches, runtime, process manager, scaling', 'Hardware, virtualisation', 'AWS EC2, Google Compute Engine, Azure VMs, DigitalOcean Droplets'],
          ['Containers (CaaS)', 'Image, resources, scaling rules', 'Hosts, scheduling, (often) LB', 'AWS ECS/Fargate, Google Cloud Run, Azure Container Apps, Kubernetes (EKS/GKE/AKS)'],
          ['PaaS', 'Code + config', 'Build, runtime, scaling, TLS', 'Render, Heroku, Railway, Fly.io, App Engine'],
          ['Serverless functions (FaaS)', 'Function handlers', 'Everything else; scale to zero', 'AWS Lambda, Google Cloud Functions, Azure Functions, Vercel/Netlify functions'],
        ]),
      ),
      section('why', 'Choosing',
        table('Trade-offs', ['Concern', 'VMs', 'Containers', 'PaaS', 'Serverless'], [
          ['Control', 'Highest', 'High', 'Medium', 'Lowest'],
          ['Ops effort', 'Highest', 'Medium', 'Low', 'Lowest'],
          ['Long-lived connections (WebSockets)', 'Yes', 'Yes', 'Usually', 'Limited / special services'],
          ['Cold starts', 'No', 'Possible with scale-to-zero', 'Possible on some tiers', 'Yes'],
          ['Execution time limits', 'None', 'None / generous', 'Request timeouts', 'Per-invocation limits'],
          ['Portability', 'High', 'High (OCI images)', 'Medium', 'Lower (provider APIs)'],
        ]),
        note('Pricing models differ (per hour, per vCPU-second, per request) — compare with your own traffic profile using each provider\'s current calculator.'),
      ),
      section('internals', 'What a typical container deployment looks like',
        steps(
          'CI pushes `api:<sha>` to a registry (ECR, Artifact Registry, GHCR).',
          'A service definition says: image, CPU/memory, env vars/secrets, port, desired count, health check.',
          'The platform schedules tasks/containers, registers them with a load balancer, and replaces unhealthy ones.',
          'Managed dependencies: database (RDS/Cloud SQL), cache (ElastiCache/Memorystore), queue (SQS/Pub/Sub), object storage.',
          'Networking: public LB in public subnets, app and DB in private subnets; security groups allow only needed traffic.',
        ),
      ),
      section('visual', 'Typical cloud topology',
        flow(['DNS + CDN', 'Managed load balancer: TLS', 'Container service: N API tasks (private subnet)', 'Managed Postgres + Redis', 'Object storage + logs/metrics'],
          { title: 'Container-based deployment' }),
      ),
      section('example', 'Deploying a container',
        code({
          title: 'Google Cloud Run deploy',
          language: 'bash',
          code: dedent(`
            gcloud run deploy api \\
              --image=europe-docker.pkg.dev/acme/apps/api:9c3e1f2 \\
              --region=europe-west1 \\
              --port=3000 \\
              --min-instances=1 --max-instances=20 \\
              --set-secrets=DATABASE_URL=database-url:latest
          `),
          expectedOutput: 'Deploying container to Cloud Run service [api] in project [acme] region [europe-west1]\nOK Deploying... Done.\nService URL: https://api-xyz-ew.a.run.app',
          explanation: [
            '`--min-instances=1` keeps one warm instance to avoid cold starts.',
            'Secrets come from Secret Manager, not the image.',
            'The container must listen on the port the platform expects (Cloud Run sets `PORT`).',
          ],
        }),
        code({
          title: 'Serverless handler shape (AWS Lambda style)',
          code: dedent(`
            // Initialise expensive clients outside the handler: reused across warm invocations
            const db = createPool(process.env.DATABASE_URL);

            export const handler = async (event) => {
              const id = event.pathParameters?.id;
              const user = await db.query('SELECT id, name FROM users WHERE id = $1', [id]);
              return { statusCode: 200, body: JSON.stringify(user.rows[0] ?? null) };
            };
          `),
          expectedOutput: '{"statusCode":200,"body":"{\\"id\\":\\"42\\",\\"name\\":\\"Ada\\"}"}',
          explanation: [
            'No `app.listen` — the platform invokes the function per event.',
            'Module-scope initialisation runs once per cold start.',
            'Many concurrent instances × DB connections can overwhelm Postgres — use a proxy (e.g. RDS Proxy) or HTTP-based DB drivers.',
            '`createPool` stands in for your DB client factory.',
          ],
        }),
      ),
      section('real-world', 'In a real backend',
        bullets(
          'A typical startup: PaaS or Cloud Run/Fargate + managed Postgres; Kubernetes only once there is a platform team.',
          'Event-driven glue (thumbnails, webhooks) as serverless functions next to a container-based API.',
          'Infrastructure as code (Terraform, Pulumi, CDK) makes environments reproducible.',
        ),
      ),
      section('mistakes', 'Common mistakes',
        bullets(
          'Choosing Kubernetes first for a small team with one service.',
          'Assuming serverless is always cheaper — steady high traffic can cost more than containers.',
          'Hard-coding the port instead of reading `PORT`.',
          'Running the database in the same container as the app.',
        ),
        code({
          title: 'Wrong vs right port binding',
          code: dedent(`
            // ❌ platform routes to $PORT, app listens elsewhere → health checks fail
            app.listen(3000, 'localhost');
            // ✅ honour the platform and listen on all interfaces inside the container
            app.listen(Number(process.env.PORT ?? 3000), '0.0.0.0');
          `),
          explanation: ['Inside a container, `localhost` is not reachable from the platform\'s network.'],
        }),
      ),
      section('interview', 'Interview angle',
        interviewTip('Compare the four models along control, ops effort, cold starts, long-lived connections and portability, then justify a choice for a concrete scenario.'),
      ),
      section('practice', 'Practice',
        text('For (a) a WebSocket chat app, (b) a nightly CSV import, (c) a low-traffic internal admin API — choose a deployment model and justify it in two sentences each.'),
      ),
      section('summary', 'Summary',
        bullets(
          'VMs: most control, most ops.',
          'Containers: portable images, managed scheduling — a strong default.',
          'PaaS: fastest path, fewer knobs.',
          'Serverless: scale to zero, cold starts, time limits, connection challenges.',
          'Use managed databases and secret managers regardless.',
        ),
      ),
    ],
    revisionNotes: [
      'IaaS → CaaS → PaaS → FaaS: decreasing control and ops effort.',
      'Serverless: cold starts, execution limits, DB connection storms.',
      'Listen on process.env.PORT and 0.0.0.0 in containers.',
      'Initialise clients at module scope in functions.',
      'Infra as code; secrets from a secret manager.',
    ],
    quiz: [
      {
        kind: 'scenario', difficulty: 'intermediate',
        prompt: 'A team of three is launching a REST API with Postgres and moderate traffic. Which is usually the most pragmatic start?',
        options: [
          'Self-managed Kubernetes cluster on VMs',
          'A PaaS or managed container service (e.g. Cloud Run, Fargate, Render) with a managed Postgres',
          'Bare-metal servers in a colocation facility',
          'One Lambda function per SQL query',
        ],
        answer: 1,
        explanation: 'Managed platforms minimise ops work for a small team. Kubernetes and bare metal add heavy operational load without clear benefit at this stage.',
      },
      {
        kind: 'mcq', difficulty: 'intermediate',
        prompt: 'Why initialise a database client outside a serverless handler function?',
        options: [
          'Because handlers cannot use await',
          'Module scope runs once per cold start, so warm invocations reuse the client',
          'It makes the function stateless',
          'Serverless platforms forbid network calls inside handlers',
        ],
        answer: 1,
        explanation: 'Reusing clients across warm invocations avoids reconnecting on every request.',
      },
    ],
    interview: [
      {
        category: 'advanced', kind: 'concept', difficulty: 'intermediate', topic: 'Cloud deployment',
        question: 'Compare deploying a Node.js API on VMs, containers, PaaS and serverless functions.',
        shortAnswer: 'They trade control for convenience: VMs give full control and full ops burden, containers give portable images on managed schedulers, PaaS hides infrastructure behind git-push deploys, and serverless scales per request to zero but adds cold starts and execution limits.',
        detailedAnswer: [
          'VMs: patching, process managers, scaling scripts are yours.',
          'Containers: same image locally and in prod; platform handles placement and restarts.',
          'PaaS: buildpacks/Dockerfile, managed TLS and scaling, fewer knobs.',
          'Serverless: per-invocation model, cold starts, connection pooling problems, vendor-specific triggers.',
          'Choose by traffic shape, latency needs, long-lived connections and team expertise.',
        ],
        followUp: 'Which would you pick for a WebSocket-heavy application and why?',
        trap: 'Claiming one model is always cheapest.',
      },
      {
        category: 'advanced', kind: 'scenario', difficulty: 'advanced', topic: 'Cloud deployment',
        question: 'Your serverless Node API exhausts Postgres connections during traffic spikes. How do you fix it?',
        shortAnswer: 'Each concurrent function instance opens its own connections, so spikes multiply them; put a connection pooler or managed DB proxy in front, keep per-instance pools at one connection, cap concurrency, or use an HTTP-based database driver.',
        detailedAnswer: [
          'Concurrency = number of instances; each holds its own pool.',
          'Managed proxies (e.g. RDS Proxy) or PgBouncer multiplex connections.',
          'Set pool max to 1 per function instance and reuse across invocations.',
          'Reserved/maximum concurrency limits protect the database.',
          'Alternatively move the hot path to containers with a fixed pool.',
        ],
        followUp: 'What are the trade-offs of transaction-mode pooling for prepared statements?',
        trap: 'Opening and closing a new connection per invocation, which adds latency and still spikes connection count.',
      },
    ],
  },
};

export default content;
