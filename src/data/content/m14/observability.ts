import type { ModuleContent } from '../../../types';
import { bullets, code, dedent, diagram, flow, interviewTip, note, section, steps, table, text, warn } from '../helpers';

const content: Partial<ModuleContent> = {
  'application-monitoring': {
    summary: 'Monitoring collects numeric time-series metrics — request rate, errors, latency percentiles, saturation — exposes them (e.g. via prom-client for Prometheus), visualises them in dashboards and alerts on symptoms users feel.',
    topics: ['RED method', 'USE method', 'golden signals', 'prom-client', 'Prometheus', 'histogram', 'p95', 'p99', 'event loop lag', 'SLO', 'alerting'],
    sections: [
      section('introduction', undefined,
        text('Logs tell you what happened to one request; metrics tell you how the whole system is behaving right now. Without them you learn about outages from your users.'),
      ),
      section('definition', 'What to measure',
        table('RED vs USE', ['Method', 'For', 'Signals'], [
          ['RED', 'Request-driven services (APIs)', '**R**ate (req/s), **E**rrors (failed req/s or %), **D**uration (latency distribution)'],
          ['USE', 'Resources (CPU, memory, pools, queues)', '**U**tilisation, **S**aturation (queued work), **E**rrors'],
          ['Golden signals', 'Any user-facing system', 'Latency, traffic, errors, saturation'],
        ]),
        bullets(
          'Node-specific: event loop lag/utilisation, heap used, GC pauses, active handles, DB pool waiting count, queue depth.',
          'Metric types: **counter** (only goes up), **gauge** (goes up/down), **histogram** (bucketed distribution), **summary** (client-side quantiles).',
        ),
      ),
      section('why', 'Why percentiles, not averages',
        bullets(
          'Averages hide outliers: 99 requests at 10 ms + 1 at 5 s average ~60 ms but one user waited 5 s.',
          '**p95/p99** = 95%/99% of requests were faster than this value — the tail users actually feel.',
          'Fan-out amplifies tails: a page calling 10 services hits *some* service\'s p99 often.',
          'Alert on SLO burn (e.g. "99.9% of requests under 300 ms") rather than on CPU.',
        ),
      ),
      section('internals', 'How Prometheus-style monitoring works',
        steps(
          'The app keeps metrics in memory (prom-client, third-party) and exposes them at `GET /metrics` in text format.',
          'Prometheus **scrapes** each instance every N seconds and stores time series labelled by `job`, `instance`, `route`, `status`…',
          'Histograms export cumulative bucket counters; `histogram_quantile(0.95, …)` computes p95 *server-side* across instances.',
          'Grafana dashboards query Prometheus; Alertmanager routes alerts.',
          'Alternatives: push-based (StatsD, OpenTelemetry metrics → OTLP collector), hosted APMs (Datadog, New Relic).',
        ),
        warn('Label cardinality: never use user ids, raw URLs or request ids as labels — each unique value creates a new time series and can overwhelm the metrics store. Use the route *pattern* (`/users/:id`).'),
      ),
      section('visual', 'Metrics pipeline',
        flow(['Node app: prom-client registry', 'GET /metrics', 'Prometheus scrape + store', 'Grafana dashboards', 'Alertmanager → on-call'],
          { title: 'Pull-based monitoring', direction: 'horizontal' }),
      ),
      section('example', 'Instrumenting an Express app',
        code({
          title: 'prom-client RED metrics (third-party)',
          code: dedent(`
            const client = require('prom-client');
            const register = new client.Registry();
            client.collectDefaultMetrics({ register }); // heap, GC, event loop lag, CPU...

            const httpDuration = new client.Histogram({
              name: 'http_request_duration_seconds',
              help: 'HTTP request duration',
              labelNames: ['method', 'route', 'status'],
              buckets: [0.01, 0.05, 0.1, 0.3, 0.5, 1, 2, 5],
              registers: [register],
            });

            app.use((req, res, next) => {
              const end = httpDuration.startTimer();
              res.on('finish', () => {
                end({ method: req.method, route: req.route?.path ?? 'unmatched', status: res.statusCode });
              });
              next();
            });

            app.get('/metrics', async (req, res) => {
              res.set('Content-Type', register.contentType);
              res.end(await register.metrics());
            });
          `),
          expectedOutput: dedent(`
            # HELP http_request_duration_seconds HTTP request duration
            # TYPE http_request_duration_seconds histogram
            http_request_duration_seconds_bucket{le="0.05",method="GET",route="/users/:id",status="200"} 941
            http_request_duration_seconds_bucket{le="0.1",method="GET",route="/users/:id",status="200"} 987
            http_request_duration_seconds_sum{method="GET",route="/users/:id",status="200"} 31.7
            http_request_duration_seconds_count{method="GET",route="/users/:id",status="200"} 1000
          `),
          explanation: [
            'One histogram gives all three RED signals: count → rate, status label → errors, buckets → duration percentiles.',
            '`req.route.path` is the pattern, keeping label cardinality low.',
            'Default metrics include `nodejs_eventloop_lag_seconds` and heap sizes.',
            'Protect `/metrics` (network policy or auth) — it reveals internals.',
          ],
        }),
        code({
          title: 'Why p99 matters (runnable)',
          code: dedent(`
            const latencies = [12, 15, 11, 14, 13, 250, 16, 12, 14, 900];
            const sorted = [...latencies].sort((a, b) => a - b);
            const pct = (p) => sorted[Math.max(0, Math.ceil((p / 100) * sorted.length) - 1)];
            const avg = latencies.reduce((a, b) => a + b, 0) / latencies.length;

            console.log('avg=' + avg + 'ms p50=' + pct(50) + 'ms p90=' + pct(90) + 'ms p99=' + pct(99) + 'ms');
          `),
          expectedOutput: 'avg=125.7ms p50=14ms p90=250ms p99=900ms',
          explanation: [
            'Nearest-rank percentile: sort, take the value at rank ⌈p·n⌉.',
            'Median is 14 ms, yet the average (125.7 ms) describes nobody\'s experience.',
            'p99 exposes the 900 ms outlier that a real user waited for.',
          ],
          runnable: true,
        }),
        code({
          title: 'PromQL queries',
          language: 'text',
          code: dedent(`
            # Rate
            sum(rate(http_request_duration_seconds_count[5m]))
            # Error ratio
            sum(rate(http_request_duration_seconds_count{status=~"5.."}[5m]))
              / sum(rate(http_request_duration_seconds_count[5m]))
            # p95 latency per route
            histogram_quantile(0.95, sum by (le, route) (rate(http_request_duration_seconds_bucket[5m])))
          `),
          explanation: ['Histograms aggregate across instances; client-side summaries cannot be averaged meaningfully.'],
        }),
      ),
      section('real-world', 'In a real backend',
        bullets(
          'Dashboards per service: RED top row, then saturation (event loop lag, pool waiters, queue depth), then dependencies.',
          'Alerts: error ratio > 2% for 5 min; p99 > SLO; queue age growing — not "CPU > 80%".',
          'Business metrics (orders/min, signups) catch bugs that return 200 but do nothing.',
        ),
      ),
      section('mistakes', 'Common mistakes',
        code({
          title: 'High-cardinality labels',
          code: dedent(`
            // ❌ one series per URL / user — memory explosion
            end({ route: req.originalUrl, userId: req.user.id });
            // ✅ bounded label values
            end({ route: req.route?.path ?? 'unmatched', status: res.statusCode });
          `),
          explanation: ['`/users/1`, `/users/2`, … each become a separate time series with raw URLs.'],
        }),
        bullets(
          'Alerting on averages.',
          'Monitoring only infrastructure, not user-facing symptoms.',
          'Alert fatigue: many noisy, non-actionable alerts.',
        ),
      ),
      section('interview', 'Interview angle',
        interviewTip('Name RED and USE, explain why p99 beats averages, and warn about label cardinality. Mention event loop lag as a Node-specific saturation signal.'),
      ),
      section('practice', 'Practice',
        text('Instrument an Express app with prom-client, run Prometheus via Docker Compose, load-test with autocannon and graph p95 per route.'),
      ),
      section('summary', 'Summary',
        bullets(
          'RED for services, USE for resources.',
          'Histograms → percentiles across instances.',
          'Low-cardinality labels.',
          'Alert on user-visible symptoms and SLOs.',
          'Node: watch event loop lag, heap, GC, pool saturation.',
        ),
      ),
    ],
    revisionNotes: [
      'RED: rate, errors, duration. USE: utilisation, saturation, errors.',
      'Counter ↑ only; gauge ↑↓; histogram buckets; summary client quantiles.',
      'p99 = 99% faster than this; averages hide tails.',
      'histogram_quantile over rate(..._bucket) aggregates across instances.',
      'Labels: route pattern, method, status — never ids/raw URLs.',
      'prom-client is third-party; collectDefaultMetrics gives event loop lag/heap.',
    ],
    quiz: [
      {
        kind: 'predict-output', difficulty: 'intermediate',
        prompt: 'Using nearest-rank, what is p90 of these 10 latencies?',
        code: "const s = [5, 6, 7, 8, 9, 10, 11, 12, 13, 400];\nconst p = 90;\nconsole.log(s[Math.ceil(p / 100 * s.length) - 1]);",
        options: ['400', '13', '12', '46.1'],
        answer: 1,
        explanation: 'ceil(0.9 × 10) − 1 = 8 → s[8] = 13. 46.1 would be the average.',
      },
      {
        kind: 'find-bug', difficulty: 'advanced',
        prompt: 'Prometheus memory usage explodes after this change. Why?',
        code: "httpDuration.observe({ route: req.originalUrl, status: res.statusCode }, secs);",
        options: [
          'observe cannot take labels',
          'originalUrl includes ids and query strings, creating an unbounded number of time series',
          'status must be a string',
          'Histograms must be reset every minute',
        ],
        answer: 1,
        explanation: 'Each distinct label combination is a separate series. Use the route pattern instead.',
      },
      {
        kind: 'mcq', difficulty: 'beginner',
        prompt: 'In the RED method, what does "D" stand for?',
        options: ['Downtime', 'Duration', 'Dependencies', 'Deployments'],
        answer: 1,
        explanation: 'Rate, Errors, Duration — the distribution of request latency.',
      },
    ],
    interview: [
      {
        category: 'advanced', kind: 'concept', difficulty: 'intermediate', topic: 'Monitoring',
        question: 'Which metrics would you track for a Node.js REST API, and why?',
        shortAnswer: 'RED per route (request rate, error ratio, latency percentiles) plus saturation signals such as event loop lag, heap usage, DB pool waiters and queue depth, and a few business metrics.',
        detailedAnswer: [
          'Histogram of request duration labelled by method/route/status.',
          'p95/p99 for SLOs and alerts.',
          'Event loop lag reveals CPU-bound blocking.',
          'Pool waiting count shows DB saturation before errors.',
          'Business counters catch silent failures.',
        ],
        followUp: 'How would you alert on these without causing alert fatigue?',
        trap: 'Listing only CPU and memory.',
      },
      {
        category: 'advanced', kind: 'concept', difficulty: 'advanced', topic: 'Monitoring',
        question: 'Why are histograms preferred over summaries for latency in a horizontally scaled service?',
        shortAnswer: 'Histograms export bucket counters that can be summed across instances and turned into percentiles at query time, while summary quantiles are precomputed per instance and cannot be meaningfully aggregated.',
        detailedAnswer: [
          'Averaging per-instance p99s is mathematically wrong.',
          'Histogram buckets are counters → `sum(rate(...)) by (le)` then `histogram_quantile`.',
          'Accuracy depends on bucket boundaries — put buckets around your SLO.',
          'Summaries are fine for a single process when exact quantiles matter.',
          'Native/exponential histograms reduce bucket tuning in newer systems.',
        ],
        followUp: 'How do you choose histogram bucket boundaries?',
        trap: 'Averaging p99 values from each pod to get the fleet p99.',
      },
    ],
  },

  'logging-and-observability': {
    summary: 'Observability is the ability to understand a system from its outputs: structured logs, metrics and distributed traces, tied together by correlation/trace ids — commonly instrumented with OpenTelemetry.',
    topics: ['three pillars', 'structured logging', 'correlation id', 'AsyncLocalStorage', 'OpenTelemetry', 'traces and spans', 'W3C traceparent', 'log levels', 'sampling'],
    sections: [
      section('introduction', undefined,
        text('Monitoring tells you *that* something is wrong; observability lets you ask *why* — even for questions you did not anticipate. That requires rich, correlated telemetry.'),
      ),
      section('definition', 'The three pillars',
        table('Logs, metrics, traces', ['Signal', 'What it is', 'Best for', 'Cost driver'], [
          ['Logs', 'Timestamped events, ideally JSON', 'Details of a specific failure', 'Volume (bytes/day)'],
          ['Metrics', 'Aggregated numeric time series', 'Trends, alerts, dashboards', 'Cardinality (series count)'],
          ['Traces', 'Tree of spans for one request across services', 'Where time is spent, which hop failed', 'Spans/sec (use sampling)'],
        ]),
        bullets(
          '**Correlation id / trace id**: a value attached to every log line and span of one request, so you can jump between them.',
          '**OpenTelemetry (OTel)**: vendor-neutral standard + SDKs for traces, metrics and logs, exporting via OTLP to any backend (Jaeger, Tempo, Datadog, Honeycomb…).',
        ),
      ),
      section('why', 'Why structured, correlated telemetry',
        bullets(
          '`console.log("user " + id + " failed")` cannot be filtered or aggregated; `{"msg":"login failed","userId":42}` can.',
          'In microservices one click touches many services — only a shared trace id connects their logs.',
          'Traces show the slow span instantly instead of guessing from timestamps.',
        ),
      ),
      section('internals', 'How context propagates',
        steps(
          'Incoming request: read `traceparent` (W3C Trace Context) or `x-request-id`, or generate a new id.',
          'Store it in **AsyncLocalStorage** (`node:async_hooks`) so every async continuation of that request can read it without passing it around.',
          'Logger (pino child / mixin) adds the id to every line.',
          'Outgoing HTTP calls and queue messages forward the header — the next service continues the same trace.',
          'OTel auto-instrumentation patches http, express, pg, redis… to create spans and propagate context automatically.',
        ),
        note('Logs go to stdout as JSON; the platform (Docker, Kubernetes, a log agent) ships them. The app should not manage log files in containers.'),
      ),
      section('visual', 'One request, correlated',
        flow(['Gateway: traceparent=00-4bf9…-01', 'Orders service: span + logs with traceId', 'Payments service: child span + logs', 'Backend: search traceId → logs + trace waterfall'],
          { title: 'Trace context across services' }),
      ),
      section('example', 'Correlation ids and OpenTelemetry',
        code({
          title: 'Child loggers carry context (runnable)',
          code: dedent(`
            function createLogger(base = {}) {
              return {
                info: (msg, fields = {}) =>
                  console.log(JSON.stringify({ level: 'info', msg, ...base, ...fields })),
                child: (extra) => createLogger({ ...base, ...extra }),
              };
            }

            const log = createLogger({ service: 'orders' });
            const reqLog = log.child({ reqId: 'r-1', traceId: 't-9' });
            reqLog.info('order created', { orderId: 42 });
          `),
          expectedOutput: '{"level":"info","msg":"order created","service":"orders","reqId":"r-1","traceId":"t-9","orderId":42}',
          explanation: [
            'Same idea as pino\'s `logger.child()`: bound fields appear on every line.',
            'Searching `traceId:"t-9"` returns every line of that request.',
          ],
          runnable: true,
        }),
        code({
          title: 'AsyncLocalStorage request context',
          code: dedent(`
            const { AsyncLocalStorage } = require('node:async_hooks');
            const { randomUUID } = require('node:crypto');
            const pino = require('pino'); // third-party

            const als = new AsyncLocalStorage();
            const logger = pino({ mixin: () => als.getStore() ?? {} });

            app.use((req, res, next) => {
              const reqId = req.get('x-request-id') ?? randomUUID();
              res.set('x-request-id', reqId);
              als.run({ reqId }, next);
            });

            app.get('/orders/:id', async (req, res) => {
              logger.info({ orderId: req.params.id }, 'loading order'); // reqId added automatically
              res.json(await orders.find(req.params.id));
            });
          `),
          expectedOutput: '{"level":30,"time":1730000000000,"reqId":"5b0e…","orderId":"7","msg":"loading order"}',
          explanation: [
            '`als.run(store, next)` makes the store visible to everything that request triggers asynchronously.',
            'pino\'s `mixin` merges the store into each log line.',
            'Returning `x-request-id` lets clients and support quote it.',
          ],
        }),
        code({
          title: 'OpenTelemetry auto-instrumentation (third-party packages)',
          language: 'javascript',
          code: dedent(`
            // instrumentation.js — load before the app: node --import ./instrumentation.js dist/server.js
            // (or node -r ./instrumentation.js for CommonJS)
            const { NodeSDK } = require('@opentelemetry/sdk-node');
            const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node');
            const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-http');

            const sdk = new NodeSDK({
              serviceName: 'orders-api',
              traceExporter: new OTLPTraceExporter({ url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT + '/v1/traces' }),
              instrumentations: [getNodeAutoInstrumentations()],
            });
            sdk.start();
            process.on('SIGTERM', () => sdk.shutdown());
          `),
          expectedOutput: 'GET /orders/7            182ms\n ├─ pg.query SELECT      141ms\n └─ GET payments/7        28ms',
          explanation: [
            'Instrumentation must load before `express`, `pg` etc. are required so they can be patched.',
            'Spans for HTTP in/out, Express routes and DB queries are created automatically.',
            'The output is the trace waterfall you would see in the tracing backend.',
            'Configure sampling (e.g. `OTEL_TRACES_SAMPLER=parentbased_traceidratio`) in high-traffic systems.',
          ],
        }),
      ),
      section('real-world', 'In a real backend',
        bullets(
          'Log levels: `error` (needs action), `warn` (unexpected but handled), `info` (business events), `debug` (off in prod or sampled).',
          'Redact secrets and PII in the logger config (`pino({ redact: [\'req.headers.authorization\'] })`).',
          'An OTel Collector sidecar/agent receives OTLP and fans out to multiple backends.',
          'Error tracking (Sentry etc.) is linked to the trace id for one-click context.',
        ),
      ),
      section('mistakes', 'Common mistakes',
        code({
          title: 'Unstructured vs structured',
          code: dedent(`
            // ❌ string concatenation, no context, unsearchable
            console.log('payment failed for ' + userId + ': ' + err);
            // ✅ structured, with error object and correlation id via child/mixin
            logger.error({ err, userId, amount }, 'payment failed');
          `),
          explanation: ['pino serialises `err` with message, type and stack.'],
        }),
        bullets(
          'Logging full request bodies with passwords or tokens.',
          'Synchronous file logging in the request path.',
          'Generating a new id per service instead of propagating the incoming one.',
          'Initialising OTel after importing the libraries it should instrument.',
        ),
      ),
      section('interview', 'Interview angle',
        interviewTip('Explain the three pillars with what each is best at, how a correlation id flows (header → AsyncLocalStorage → logs → outgoing calls), and what OpenTelemetry standardises.'),
      ),
      section('practice', 'Practice',
        steps(
          'Add an `x-request-id` middleware with AsyncLocalStorage and pino mixin.',
          'Call a second service, forward the header, and grep both services\' logs by the id.',
          'Add OTel auto-instrumentation and view the trace in Jaeger (Docker image `jaegertracing/all-in-one`).',
        ),
      ),
      section('summary', 'Summary',
        bullets(
          'Logs (events), metrics (aggregates), traces (request paths).',
          'JSON logs to stdout; the platform ships them.',
          'Correlate with trace/request ids via AsyncLocalStorage.',
          'OpenTelemetry: vendor-neutral instrumentation + OTLP.',
          'Redact sensitive data; sample traces.',
        ),
      ),
    ],
    revisionNotes: [
      'Monitoring = known questions; observability = new questions.',
      'Logs → volume cost; metrics → cardinality; traces → sampling.',
      'AsyncLocalStorage carries request context across awaits.',
      'W3C traceparent header propagates trace context.',
      'Load OTel instrumentation first (--import / -r).',
      'Log JSON to stdout; redact secrets.',
    ],
    quiz: [
      {
        kind: 'mcq', difficulty: 'intermediate',
        prompt: 'Which Node core API lets a logger read the current request id without passing it through every function?',
        options: ['process.env', 'AsyncLocalStorage', 'global variables', 'EventEmitter.captureRejections'],
        answer: 1,
        explanation: 'AsyncLocalStorage keeps a store per async execution context. A global would be overwritten by concurrent requests.',
      },
      {
        kind: 'scenario', difficulty: 'advanced',
        prompt: 'You added OpenTelemetry but no Postgres spans appear. instrumentation.js is required at the bottom of server.js. Why?',
        options: [
          'OpenTelemetry does not support Postgres',
          'The pg module was already loaded before instrumentation could patch it — load instrumentation first with --import/-r',
          'Spans only appear for HTTP',
          'The OTLP exporter must be gRPC',
        ],
        answer: 1,
        explanation: 'Auto-instrumentation hooks module loading. Libraries required earlier are not patched.',
      },
    ],
    interview: [
      {
        category: 'advanced', kind: 'concept', difficulty: 'intermediate', topic: 'Observability',
        question: 'What are the three pillars of observability and what is each best at?',
        shortAnswer: 'Logs record discrete events with detail, metrics give cheap aggregated trends for dashboards and alerts, and traces show the path and timing of one request across services.',
        detailedAnswer: [
          'Logs: debugging a specific failure; costly at volume.',
          'Metrics: alerting and SLOs; constrained by cardinality.',
          'Traces: latency breakdown and dependency failures; sampled.',
          'Correlation ids connect all three.',
        ],
        followUp: 'If you could only afford one in a microservice system, which and why?',
        trap: 'Saying observability is just "having logs".',
      },
      {
        category: 'advanced', kind: 'scenario', difficulty: 'advanced', topic: 'Observability',
        question: 'A request through four services is slow intermittently. How would you instrument the system to find out where the time goes?',
        shortAnswer: 'Add distributed tracing with OpenTelemetry so each service creates spans and propagates W3C trace context, attach trace ids to structured logs, and use per-route latency histograms to spot the slow hop, then drill into its trace.',
        detailedAnswer: [
          'OTel auto-instrumentation for http/express/db clients in each service.',
          'Propagate `traceparent` across HTTP and message queues.',
          'Tail-based sampling keeps slow/error traces.',
          'Logs include traceId for context around the slow span.',
          'Metrics exemplars can link a latency spike directly to a trace.',
        ],
        followUp: 'How do you propagate trace context through a message queue?',
        trap: 'Comparing timestamps in unconnected logs from four services.',
      },
    ],
  },

  'zero-downtime-deployment': {
    summary: 'Zero-downtime deployment replaces running versions without failing requests, using rolling, blue-green or canary strategies combined with readiness checks, graceful shutdown, connection draining and backward-compatible database changes.',
    topics: ['rolling update', 'blue-green', 'canary', 'graceful shutdown', 'connection draining', 'readiness', 'pm2 reload', 'feature flags', 'backward compatibility'],
    sections: [
      section('introduction', undefined,
        text('Stopping the old version and starting the new one leaves a gap where requests fail. Zero-downtime deploys overlap the versions and move traffic carefully, so users never notice.'),
      ),
      section('definition', 'Strategies',
        table('Rolling vs blue-green vs canary', ['', 'Rolling', 'Blue-green', 'Canary'], [
          ['How', 'Replace instances a few at a time', 'Start full new env (green), switch all traffic at once', 'Send a small % of traffic to new version, increase gradually'],
          ['Extra capacity', 'Small (surge)', '2× during switch', 'Small'],
          ['Rollback', 'Roll back again (minutes)', 'Flip traffic back (seconds)', 'Route 0% to canary'],
          ['Versions coexist', 'Yes, during rollout', 'Briefly (switch moment) — DB still shared', 'Yes, for the whole canary period'],
          ['Risk exposure', 'Grows as rollout proceeds', 'All users at switch', 'Limited to canary %'],
          ['Needs', 'Readiness + draining', 'Router/LB switch, duplicate env', 'Weighted routing + good metrics'],
        ]),
      ),
      section('why', 'What has to be true',
        bullets(
          '**New instances** only get traffic when ready (readiness probe).',
          '**Old instances** stop receiving new traffic, finish in-flight requests, then exit (graceful shutdown).',
          '**Schema** works with both versions (expand-and-contract).',
          '**API contracts** stay backward compatible for clients and other services during overlap.',
          '**Sessions/state** are external, so moving users between instances is harmless.',
        ),
      ),
      section('internals', 'Graceful shutdown sequence',
        steps(
          'Orchestrator sends SIGTERM (and starts removing the instance from endpoints — this propagation is asynchronous).',
          'App flips readiness to 503 and keeps serving for a few seconds so load balancers notice.',
          '`server.close()` stops accepting new connections; idle keep-alive connections are closed (`server.closeIdleConnections()`, Node 18.2+).',
          'In-flight requests finish; workers stop taking new jobs.',
          'Close DB pools, Redis, message consumers; flush telemetry.',
          'Exit 0 before the grace period ends (Kubernetes `terminationGracePeriodSeconds`, default 30 s), or be SIGKILLed.',
        ),
        warn('Without a short delay after SIGTERM, a Kubernetes pod can exit before the endpoint removal reaches every proxy, and some requests still arrive at a closed socket. A `preStop` sleep or an in-app delay of a few seconds covers this.'),
      ),
      section('visual', 'Rolling update',
        diagram('ci-cd-pipeline', 'The pipeline ends with a health-gated rollout; new pods become ready before old ones drain.'),
        flow(['v2 pod starts', 'readyz 200 → added to LB', 'v1 pod gets SIGTERM', 'readyz 503, drain in-flight', 'v1 exits', 'repeat until all v2'],
          { title: 'Rolling update with maxUnavailable: 0', direction: 'horizontal' }),
      ),
      section('example', 'Drain, then exit',
        code({
          title: 'Readiness flip + drain (runnable simulation)',
          code: dedent(`
            let ready = true;
            let inFlight = 0;

            function handle(id, ms) {
              inFlight++;
              setTimeout(() => { inFlight--; console.log('done', id); }, ms);
            }
            const readyz = () => (ready ? 200 : 503);

            handle('req-1', 50);
            handle('req-2', 80);

            // SIGTERM arrives
            ready = false;
            console.log('readyz ->', readyz());
            const timer = setInterval(() => {
              if (inFlight === 0) { clearInterval(timer); console.log('drained, exit'); }
            }, 10);
          `),
          expectedOutput: 'readyz -> 503\ndone req-1\ndone req-2\ndrained, exit',
          explanation: [
            'Readiness flips first, so the load balancer stops sending new requests.',
            'In-flight requests are allowed to complete.',
            'Only when the counter reaches 0 does the process exit.',
          ],
          runnable: true,
        }),
        code({
          title: 'Real shutdown handler',
          code: dedent(`
            let shuttingDown = false;
            app.get('/readyz', (req, res) => res.sendStatus(shuttingDown ? 503 : 200));

            process.on('SIGTERM', async () => {
              shuttingDown = true;
              await new Promise((r) => setTimeout(r, 5_000)); // let LBs notice
              server.close(async () => {
                await Promise.allSettled([pool.end(), redis.quit(), worker.close()]);
                process.exit(0);
              });
              server.closeIdleConnections();
              setTimeout(() => process.exit(1), 20_000).unref(); // hard stop < grace period
            });
          `),
          expectedOutput: '{"msg":"SIGTERM, draining"}\n{"msg":"http server closed"}\n{"msg":"resources closed, exit 0"}',
          explanation: [
            'Timings must fit inside the orchestrator grace period.',
            'See Module 11 "Graceful shutdown" for more detail.',
          ],
        }),
        code({
          title: 'Kubernetes rolling update settings',
          language: 'yaml',
          code: dedent(`
            spec:
              replicas: 4
              strategy:
                type: RollingUpdate
                rollingUpdate:
                  maxSurge: 1
                  maxUnavailable: 0
              template:
                spec:
                  terminationGracePeriodSeconds: 30
                  containers:
                    - name: api
                      image: ghcr.io/acme/api:9c3e1f2
                      readinessProbe:
                        httpGet: { path: /readyz, port: 3000 }
          `),
          expectedOutput: '$ kubectl rollout status deploy/api\nWaiting for deployment "api" rollout to finish: 2 of 4 updated replicas are available...\ndeployment "api" successfully rolled out',
          explanation: [
            '`maxUnavailable: 0` → capacity never drops below 4 ready pods.',
            '`maxSurge: 1` → one extra pod during the rollout.',
          ],
        }),
        code({
          title: 'On a single VM with pm2 (third-party)',
          language: 'bash',
          code: 'pm2 reload api',
          expectedOutput: '[PM2] Applying action reloadProcessId on app [api](ids: [ 0, 1, 2, 3 ])\n[PM2] [api](0) ✓\n[PM2] [api](1) ✓\n[PM2] [api](2) ✓\n[PM2] [api](3) ✓',
          explanation: [
            '`reload` restarts cluster-mode workers one by one (`restart` kills all at once).',
            'Pair it with `wait_ready`/`process.send(\'ready\')` and `kill_timeout` for proper readiness and draining.',
          ],
        }),
      ),
      section('real-world', 'In a real backend',
        bullets(
          'Canary with automated analysis: 5% → compare error rate and p99 to baseline → 25% → 100%, or auto-rollback.',
          'Feature flags decouple deploy from release — code ships dark, then is enabled gradually.',
          'Blue-green for risky infrastructure changes where instant rollback matters.',
          'Long-lived WebSockets: clients must reconnect; drain by closing with a "going away" code and letting them reconnect elsewhere.',
        ),
      ),
      section('mistakes', 'Common mistakes',
        bullets(
          'Breaking schema change shipped with the code — old pods fail mid-rollout.',
          'No readiness probe — traffic hits pods still booting.',
          'Exiting immediately on SIGTERM.',
          'Removing an API field that older mobile clients still read.',
          'Blue-green with a DB migration that green needs but blue cannot tolerate.',
        ),
        code({
          title: 'Wrong vs right SIGTERM handling',
          code: dedent(`
            // ❌ drops every in-flight request
            process.on('SIGTERM', () => process.exit(0));
            // ✅ stop taking traffic, drain, close resources, then exit
            process.on('SIGTERM', gracefulShutdown);
          `),
          explanation: ['Graceful shutdown is what turns a restart into a non-event for users.'],
        }),
      ),
      section('interview', 'Interview angle',
        interviewTip('Compare rolling, blue-green and canary on rollback speed, cost and risk, then explain the four enablers: readiness, graceful shutdown, backward-compatible schema, and stateless instances.'),
      ),
      section('practice', 'Practice',
        text('Run an Express app under load (`autocannon -d 30`) while redeploying it with Docker Compose or pm2. Count failed requests before and after adding a SIGTERM handler and readiness flip.'),
      ),
      section('summary', 'Summary',
        bullets(
          'Rolling (cheap), blue-green (instant rollback), canary (limited blast radius).',
          'Readiness gates new instances; graceful shutdown drains old ones.',
          'Versions overlap → schema and API must be backward compatible.',
          '`pm2 reload` for single-host clusters.',
          'Feature flags separate deploy from release.',
        ),
      ),
    ],
    revisionNotes: [
      'Rolling: maxSurge/maxUnavailable; blue-green: switch + instant rollback; canary: % traffic + metrics.',
      'SIGTERM → readiness 503 → short delay → server.close → close pools → exit.',
      'Finish before terminationGracePeriodSeconds (default 30 s).',
      'Expand-and-contract migrations; never break the running version.',
      'pm2 reload = one-by-one; pm2 restart = all at once.',
    ],
    quiz: [
      {
        kind: 'mcq', difficulty: 'intermediate',
        prompt: 'Which strategy offers the fastest rollback by switching traffic back to the previous full environment?',
        options: ['Rolling update', 'Canary', 'Blue-green', 'Recreate'],
        answer: 2,
        explanation: 'Blue-green keeps the old environment running, so rollback is a router flip. Rolling needs another rollout; recreate has downtime.',
      },
      {
        kind: 'predict-output', difficulty: 'intermediate',
        prompt: 'What is printed first?',
        code: "let ready = true;\nsetTimeout(() => console.log('request finished'), 20);\nready = false;\nconsole.log('ready:', ready);",
        options: ['request finished', 'ready: false', 'ready: true', 'Nothing'],
        answer: 1,
        explanation: 'Synchronous code runs first: readiness flips and logs immediately; the in-flight request completes later.',
      },
      {
        kind: 'scenario', difficulty: 'advanced',
        prompt: 'During every Kubernetes rollout a handful of requests get "connection refused", even though the app handles SIGTERM with server.close(). What is a likely fix?',
        options: [
          'Remove the readiness probe',
          'Add a short delay (preStop sleep or in-app wait) before closing, so endpoint removal propagates to all proxies',
          'Set terminationGracePeriodSeconds to 0',
          'Use pm2 inside the pod',
        ],
        answer: 1,
        explanation: 'Endpoint removal and SIGTERM happen concurrently. Closing the listener instantly means some proxies still route to the pod for a moment.',
      },
    ],
    interview: [
      {
        category: 'advanced', kind: 'concept', difficulty: 'advanced', topic: 'Deployment',
        question: 'Compare rolling, blue-green and canary deployments.',
        shortAnswer: 'Rolling replaces instances gradually with little extra capacity; blue-green runs a full parallel environment and switches traffic at once for instant rollback; canary sends a small slice of traffic to the new version and expands it based on metrics.',
        detailedAnswer: [
          'Rolling: default in Kubernetes/ECS, versions coexist, rollback = another rollout.',
          'Blue-green: 2× resources during switch, instant flip, shared DB still needs compatibility.',
          'Canary: limited blast radius, requires weighted routing and good metrics, longer coexistence.',
          'All need readiness, graceful shutdown, backward-compatible schema.',
          'Feature flags complement all three.',
        ],
        followUp: 'Which metrics would you use to automatically promote or abort a canary?',
        trap: 'Thinking blue-green avoids database compatibility concerns.',
      },
      {
        category: 'advanced', kind: 'scenario', difficulty: 'advanced', topic: 'Deployment',
        question: 'Walk through exactly what a Node.js process should do between receiving SIGTERM and exiting during a rolling deploy.',
        shortAnswer: 'Mark itself not-ready, wait briefly for load balancers to stop routing, stop accepting connections with server.close and close idle keep-alives, let in-flight requests and jobs finish, close pools and consumers, flush telemetry, and exit before the grace period.',
        detailedAnswer: [
          'Readiness → 503 immediately.',
          'Delay a few seconds to cover endpoint propagation.',
          '`server.close()` + `closeIdleConnections()`; optionally `Connection: close` on responses.',
          'Stop queue consumers from taking new jobs; finish current ones.',
          '`pool.end()`, `redis.quit()`, OTel `sdk.shutdown()`.',
          'Hard-exit timer shorter than terminationGracePeriodSeconds.',
        ],
        followUp: 'How do you handle long-lived WebSocket connections in this sequence?',
        trap: 'Calling process.exit() immediately, or waiting forever for keep-alive connections that never close.',
      },
    ],
  },
};

export default content;
