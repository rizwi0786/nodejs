import type { ModuleContent } from '../../../types';
import { bullets, code, dedent, flow, interviewTip, note, section, steps, table, text, tip, warn } from '../helpers';

const content: Partial<ModuleContent> = {
  logging: {
    summary: 'Production logging means structured (JSON) log events with levels, timestamps and context such as a correlation/request id, written to stdout and shipped to a central store — and never containing secrets or raw personal data.',
    topics: ['logging', 'log levels', 'structured logging', 'JSON logs', 'correlation id', 'request id', 'AsyncLocalStorage', 'redaction', 'stdout'],
    sections: [
      section('introduction', undefined,
        text('At 3 a.m. the logs are all you have. Good logs let you answer "what happened to request X?" in seconds; bad logs are walls of unsearchable text — or a data leak.'),
      ),
      section('definition', 'Building blocks',
        table('Log levels (typical meaning)', ['Level', 'Use for', 'Example'], [
          ['fatal', 'Process cannot continue', 'Cannot connect to DB at startup'],
          ['error', 'An operation failed and needs attention', 'Payment provider returned 500'],
          ['warn', 'Unexpected but handled', 'Retrying after timeout; deprecated API used'],
          ['info', 'Normal significant events', 'Server started; order created; request completed'],
          ['debug', 'Diagnostic detail for developers', 'Cache miss for key X'],
          ['trace', 'Very fine-grained', 'Entering function with args'],
        ]),
        table('Unstructured vs structured', ['', 'Text log', 'Structured (JSON) log'], [
          ['Example', '`User 42 bought 3 items for $99`', '`{"level":"info","msg":"order created","userId":42,"items":3,"total":99}`'],
          ['Search', 'Regex over text', 'Query fields: `userId:42 AND level:error`'],
          ['Aggregation', 'Hard', 'Dashboards and alerts on fields'],
          ['Humans in dev', 'Easy to read', 'Pipe through a pretty-printer'],
        ]),
      ),
      section('why', 'Why structure and context',
        bullets(
          'Many instances write logs concurrently; only a **request id** ties one request\'s lines together.',
          'Fields make logs queryable and alertable (error rate per route).',
          'Levels let production run at `info` while you can turn on `debug` temporarily.',
          '12-factor apps write logs to **stdout**; the platform (Docker, Kubernetes, a log agent) ships them.',
        ),
      ),
      section('internals', 'Correlation ids across a request',
        steps(
          'Incoming request: reuse a trusted upstream `X-Request-Id` (validated), or generate one with `crypto.randomUUID()`.',
          'Create a **child logger** bound to `{ reqId }` and attach it to `req` (or store it in `AsyncLocalStorage` so deep code can find it).',
          'Every log line in that request includes `reqId` automatically.',
          'Forward the id in outgoing HTTP calls and queue messages so downstream services log the same id.',
          'Return it in the response header — users and support can quote it.',
        ),
        flow([
          'Client request',
          'Middleware: reqId = header or randomUUID()',
          'Child logger { reqId }',
          'Service logs → same reqId',
          'Outgoing call: X-Request-Id',
          'Log store: filter reqId',
        ], { title: 'Request correlation', direction: 'horizontal' }),
      ),
      section('example', 'Structured logging',
        code({
          title: 'Minimal structured logger with levels, child context and redaction (pure JS)',
          runnable: true,
          code: dedent(`
            const LEVELS = { trace: 10, debug: 20, info: 30, warn: 40, error: 50, fatal: 60 };
            const SECRET_KEYS = new Set(['password', 'authorization', 'token']);

            function createLogger({ level = 'info', bindings = {}, now = () => '2026-11-08T10:00:00.000Z' } = {}) {
              const min = LEVELS[level];
              const write = (lvl, fields, msg) => {
                if (LEVELS[lvl] < min) return;
                const safe = Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, SECRET_KEYS.has(k) ? '[Redacted]' : v]));
                console.log(JSON.stringify({ level: lvl, time: now(), ...bindings, ...safe, msg }));
              };
              const api = Object.fromEntries(Object.keys(LEVELS).map((l) => [l, (fields, msg) => write(l, fields, msg)]));
              api.child = (extra) => createLogger({ level, bindings: { ...bindings, ...extra }, now });
              return api;
            }

            const log = createLogger({ level: 'info', bindings: { service: 'orders' } });
            const reqLog = log.child({ reqId: 'b3f1' });
            reqLog.debug({ sql: 'SELECT ...' }, 'query');                // below level → dropped
            reqLog.info({ userId: 42, password: 'hunter2' }, 'login ok');
            reqLog.error({ err: 'ETIMEDOUT', route: '/pay' }, 'payment failed');
          `),
          expectedOutput: '{"level":"info","time":"2026-11-08T10:00:00.000Z","service":"orders","reqId":"b3f1","userId":42,"password":"[Redacted]","msg":"login ok"}\n{"level":"error","time":"2026-11-08T10:00:00.000Z","service":"orders","reqId":"b3f1","err":"ETIMEDOUT","route":"/pay","msg":"payment failed"}',
          explanation: [
            'The debug line is filtered out because the logger level is `info`.',
            'The child logger adds `reqId` to every line without repeating it at each call site.',
            'Sensitive keys are redacted before serialisation — Pino and Winston offer the same feature.',
            'One JSON object per line ("NDJSON") is what log shippers expect.',
          ],
        }),
        code({
          title: 'Express request logging with a request id (Pino — third-party)',
          code: dedent(`
            import express from 'express';
            import crypto from 'node:crypto';
            import { AsyncLocalStorage } from 'node:async_hooks';
            import pino from 'pino';

            const logger = pino({ level: process.env.LOG_LEVEL ?? 'info', redact: ['req.headers.authorization', '*.password'] });
            const als = new AsyncLocalStorage();
            export const log = () => als.getStore() ?? logger;     // usable anywhere in the request

            const app = express();
            app.use((req, res, next) => {
              const incoming = req.get('x-request-id');
              const reqId = incoming && /^[\\w-]{8,64}$/.test(incoming) ? incoming : crypto.randomUUID();
              res.setHeader('x-request-id', reqId);
              const child = logger.child({ reqId });
              const start = process.hrtime.bigint();
              res.on('finish', () => child.info({
                method: req.method, url: req.originalUrl, status: res.statusCode,
                ms: Number(process.hrtime.bigint() - start) / 1e6,
              }, 'request completed'));
              als.run(child, next);
            });

            app.post('/orders', async (req, res) => {
              log().info({ items: req.body?.items?.length }, 'creating order'); // has reqId automatically
              res.status(201).json({ ok: true });
            });
          `),
          expectedOutput: '{"level":30,"time":1794132000000,"pid":4242,"hostname":"api-1","reqId":"0b6e2c1a-...","items":3,"msg":"creating order"}\n{"level":30,"time":1794132000004,"pid":4242,"hostname":"api-1","reqId":"0b6e2c1a-...","method":"POST","url":"/orders","status":201,"ms":4.21,"msg":"request completed"}',
          explanation: [
            'Incoming ids are validated — never log arbitrary header values verbatim (log injection, huge strings).',
            '`AsyncLocalStorage` carries the child logger through `await` chains without passing it explicitly.',
            '`res.on("finish")` logs one summary line per request with status and duration.',
            'In practice `pino-http` (third-party) does this middleware for you.',
          ],
        }),
      ),
      section('real-world', 'Production rules',
        bullets(
          'Log to stdout as JSON; let the platform collect (Fluent Bit, Vector, CloudWatch, Loki, Elasticsearch).',
          '**Never log secrets**: passwords, tokens, API keys, `Authorization`/`Cookie` headers, full card numbers. Minimise PII (emails, IPs) per your privacy rules.',
          'Log errors with the error object (`{ err }`) so stack traces are serialised as fields.',
          'Make the level configurable via env (`LOG_LEVEL`) so you can raise detail temporarily.',
          'Keep one "request completed" line per request; avoid log spam inside hot loops.',
        ),
        tip('Use consistent field names across services (`reqId`, `userId`, `durationMs`) so queries work everywhere.'),
      ),
      section('mistakes', 'Common mistakes',
        bullets(
          '`console.log(req)` or `logger.info(req.headers)` — leaks cookies and tokens.',
          'String concatenation: `"user " + id + " failed"` instead of fields.',
          'Logging an error as `err.message` only — the stack is lost.',
          'Writing log files inside containers (lost on restart, fill the disk).',
          'Logging at `error` for expected client mistakes (404, validation) → alert fatigue.',
        ),
        warn('Unvalidated user input in logs can forge entries (newline injection in text logs) or exploit log viewers. JSON encoding and length limits mitigate this.'),
      ),
      section('interview', 'Interview angle',
        interviewTip('Hit the four keywords: **structured JSON, levels, correlation id, no secrets** — and mention `AsyncLocalStorage` for propagating context.'),
      ),
      section('practice', 'Practice',
        text('Add request-id middleware to your API, return the id in a response header, include it in every log line (child logger), and forward it on an outgoing `fetch`. Then grep one request across two services.'),
      ),
      section('summary', 'Summary',
        bullets(
          'Structured JSON logs to stdout; one event per line.',
          'Levels: fatal, error, warn, info, debug, trace — configurable via env.',
          'Correlation ids via child loggers / AsyncLocalStorage, propagated downstream.',
          'Redact and avoid secrets and sensitive personal data.',
        ),
      ),
    ],
    revisionNotes: [
      'JSON logs → queryable fields.',
      'Log to stdout (12-factor); the platform ships logs.',
      'Request id: validate incoming or `randomUUID()`; echo in response; propagate.',
      '`AsyncLocalStorage` to access the request logger anywhere.',
      'Never log passwords, tokens, auth headers, cookies.',
      'Log `{ err }` objects to keep stack traces.',
    ],
    quiz: [
      {
        kind: 'find-bug', difficulty: 'intermediate',
        prompt: 'What is wrong with this middleware?',
        code: "app.use((req, res, next) => {\n  logger.info({ headers: req.headers, body: req.body }, 'incoming');\n  next();\n});",
        options: [
          'logger.info takes only a string',
          'It logs Authorization/Cookie headers and request bodies (passwords) — secrets end up in the log store',
          'next() must be called before logging',
          'Headers are not JSON',
        ],
        answer: 1,
        explanation: 'Logs are widely accessible and long-lived. Log selected fields and configure redaction for sensitive paths.',
      },
      {
        kind: 'mcq', difficulty: 'beginner',
        prompt: 'Why add a request (correlation) id to logs?',
        options: [
          'It makes logs smaller',
          'It lets you find every log line belonging to one request across instances and services',
          'It encrypts logs',
          'It is required by HTTP',
        ],
        answer: 1,
        explanation: 'Concurrent requests interleave in log streams; a shared id groups them, even across services when propagated.',
      },
      {
        kind: 'scenario', difficulty: 'intermediate',
        prompt: 'Your error-level alert fires hundreds of times a day for 404s and validation failures. What should change?',
        options: [
          'Disable alerts',
          'Log expected client errors at info/warn and reserve error for server-side failures needing action',
          'Stop logging 404s and 400s entirely',
          'Increase the alert threshold to 10,000',
        ],
        answer: 1,
        explanation: 'Levels should express severity for operators. 4xx responses are normal behaviour; 5xx and failed dependencies are errors.',
      },
    ],
    interview: [
      {
        category: 'express-backend', kind: 'concept', difficulty: 'beginner', topic: 'Logging',
        question: 'Why do production Node.js services usually log JSON instead of plain text?',
        shortAnswer: 'JSON logs are machine-parseable, so log platforms can index fields for search, dashboards and alerts; plain text needs fragile regex parsing.',
        detailedAnswer: [
          'Each line is one object: level, time, msg, plus context fields.',
          'Query by `reqId`, `userId`, `status` instead of grepping text.',
          'Errors serialise with stack traces as fields.',
          'In development, a pretty-printer makes JSON readable.',
        ],
        followUp: 'What fields would you include on every log line?',
        trap: 'Thinking JSON logs are only for big companies.',
      },
      {
        category: 'advanced', kind: 'concept', difficulty: 'advanced', topic: 'Logging',
        question: 'How do you propagate a correlation id through async code and across services in Node.js?',
        shortAnswer: 'Create or accept a request id in middleware, store a child logger/context in AsyncLocalStorage for the request, read it anywhere in the async call chain, and forward it as a header (or W3C traceparent) on outgoing calls and messages.',
        detailedAnswer: [
          '`als.run(context, next)` binds the context to everything that request\'s async continuations do.',
          'Deep code calls `als.getStore()` instead of threading `req` through every function.',
          'Outgoing HTTP: add `x-request-id` / `traceparent`; queues: put it in message metadata.',
          'Downstream services adopt the incoming id (after validation).',
          'OpenTelemetry automates this with trace and span ids.',
        ],
        followUp: 'What is the performance cost of AsyncLocalStorage?',
        trap: 'Using a module-level global variable for the current request id (overwritten by concurrent requests).',
      },
    ],
  },

  'winston-or-pino': {
    summary: 'Winston and Pino are the two most popular third-party Node.js loggers: Winston is highly configurable with formats and many transports; Pino is built for speed, emits JSON by default, and pushes formatting/shipping out of the main thread (pino-pretty for development).',
    topics: ['Winston', 'Pino', 'pino-pretty', 'transports', 'formats', 'child loggers', 'redaction', 'logging performance', 'pino-http'],
    sections: [
      section('introduction', undefined,
        text('`console.log` has no levels, no structure and is synchronous to terminals/files in some cases. Real services pick a logging library — almost always Winston or Pino.'),
      ),
      section('definition', 'Comparison',
        table('Winston vs Pino (both third-party)', ['', 'Winston', 'Pino'], [
          ['Philosophy', 'Flexible, batteries included', 'Minimal overhead, do less in-process'],
          ['Default output', 'Configurable via `format` (JSON, printf, colorize…)', 'NDJSON (`{"level":30,"time":…,"msg":…}`)'],
          ['Levels', 'npm levels: error 0 … silly 6 (lower = more severe)', 'fatal 60, error 50, warn 40, info 30, debug 20, trace 10'],
          ['Performance', 'Slower — formatting pipeline runs in-process', 'Among the fastest; formatting/transports can run in worker threads'],
          ['Transports', 'Many built in and community (file, HTTP, cloud services)', '`pino.transport()` targets run in a worker thread (pino-pretty, pino/file, community)'],
          ['Pretty dev output', '`format.colorize()` + `format.simple()`', '`pino-pretty` (dev only)'],
          ['Child loggers', '`logger.child({ reqId })`', '`logger.child({ reqId })`'],
          ['Redaction', 'Custom format', 'Built-in `redact` paths (fast)'],
          ['HTTP middleware', 'express-winston (community)', 'pino-http'],
        ]),
      ),
      section('why', 'Why the choice matters',
        bullets(
          'Logging is on the hot path of every request; a slow logger adds latency and CPU cost.',
          'Pino\'s design: serialise quickly to JSON, write to stdout, and let another process/thread do transport and formatting.',
          'Winston shines when you need custom formats or to send logs directly to several destinations from the app.',
          'Either works if you log JSON to stdout and ship centrally.',
        ),
      ),
      section('internals', 'Why Pino is fast',
        steps(
          'Fast JSON serialisation of the bindings and message (pre-serialised child bindings).',
          'Writes are done through `sonic-boom`, a fast destination stream.',
          '`pino.transport()` moves formatting/shipping to a **worker thread**, keeping the main event loop free.',
          'Level checks are cheap: disabled levels become no-op functions.',
          'Winston instead runs each log through a chain of format functions and transport streams in the main thread.',
        ),
        flow([
          'logger.info(obj, msg)',
          'Level check (noop if disabled)',
          'Fast JSON serialise',
          'stdout / sonic-boom',
          'Optional worker-thread transport',
        ], { title: 'Pino write path', direction: 'horizontal' }),
      ),
      section('example', 'Setting each up',
        code({
          title: 'Pino with pretty output in development only',
          code: dedent(`
            import pino from 'pino'; // npm i pino ; npm i -D pino-pretty

            const isDev = process.env.NODE_ENV !== 'production';
            export const logger = pino({
              level: process.env.LOG_LEVEL ?? 'info',
              redact: { paths: ['req.headers.authorization', 'req.headers.cookie', '*.password'], censor: '[Redacted]' },
              ...(isDev && { transport: { target: 'pino-pretty', options: { colorize: true } } }),
            });

            logger.info({ port: 3000 }, 'server started');
            const reqLog = logger.child({ reqId: 'b3f1' });
            reqLog.error({ err: new Error('db timeout') }, 'query failed');
          `),
          expectedOutput: dedent(`
            # production (NODE_ENV=production): NDJSON
            {"level":30,"time":1794132000000,"pid":4242,"hostname":"api-1","port":3000,"msg":"server started"}
            {"level":50,"time":1794132000010,"pid":4242,"hostname":"api-1","reqId":"b3f1","err":{"type":"Error","message":"db timeout","stack":"Error: db timeout\\n    at ..."},"msg":"query failed"}

            # development: pino-pretty
            [10:00:00.000] INFO (4242): server started
                port: 3000
            [10:00:00.010] ERROR (4242): query failed
                reqId: "b3f1"
                err: { "type": "Error", "message": "db timeout", ... }
          `),
          explanation: [
            'Production writes raw JSON for the log pipeline; pretty printing is a dev-only transport.',
            'Pino\'s standard `err` serializer turns Error objects into `type`, `message`, `stack` fields.',
            'Do not ship pino-pretty in production — it costs CPU and produces unparsable output.',
          ],
        }),
        code({
          title: 'Winston equivalent',
          code: dedent(`
            import winston from 'winston'; // npm i winston
            const { combine, timestamp, errors, json, colorize, simple } = winston.format;

            const isDev = process.env.NODE_ENV !== 'production';
            export const logger = winston.createLogger({
              level: process.env.LOG_LEVEL ?? 'info',
              format: isDev
                ? combine(errors({ stack: true }), colorize(), simple())
                : combine(errors({ stack: true }), timestamp(), json()),
              defaultMeta: { service: 'orders' },
              transports: [new winston.transports.Console()],
            });

            logger.info('server started', { port: 3000 });
            logger.child({ reqId: 'b3f1' }).error('query failed', { err: new Error('db timeout') });
          `),
          expectedOutput: '{"level":"info","message":"server started","port":3000,"service":"orders","timestamp":"2026-11-08T10:00:00.000Z"}\n{"level":"error","message":"query failed","reqId":"b3f1","service":"orders","err":{},"timestamp":"2026-11-08T10:00:00.010Z"}',
          explanation: [
            'Winston\'s call signature is `(message, meta)`; Pino\'s is `(mergingObject, message)` — a common migration slip.',
            'Formats are composed with `combine`; `errors({ stack: true })` handles errors passed as the main argument.',
            'Gotcha shown: an Error nested inside meta (`{ err }`) serialises as `{}` with plain `json()` because Error properties are non-enumerable — pass the error as the message/first meta or add a custom format.',
          ],
        }),
      ),
      section('real-world', 'Which to choose',
        bullets(
          'New high-throughput API → **Pino** + `pino-http`, JSON to stdout, collected by the platform.',
          'Existing Winston codebase, or app must push logs directly to several sinks with custom formats → **Winston** is fine.',
          'Whichever you choose: a single shared logger module, child loggers for context, redaction, env-configured level.',
          'Benchmark claims vary by version and setup; the architectural difference (work off the main thread) is the durable point.',
        ),
        note('Both are third-party packages. Node core has no structured logger; `console` methods and `util.debuglog` (NODE_DEBUG) are the built-ins.'),
      ),
      section('mistakes', 'Common mistakes',
        bullets(
          'Using pino-pretty or Winston colorize in production.',
          'Swapping the argument order between libraries (`logger.info("msg", obj)` in Pino ignores `obj` unless the message has format placeholders).',
          'Creating a new logger per request instead of a child logger.',
          'Synchronous file transports on the hot path.',
        ),
        warn('Pino: `logger.info("user", { id: 1 })` does **not** add `id` as a field — the object is treated as an interpolation argument. Use `logger.info({ id: 1 }, "user")`.'),
      ),
      section('interview', 'Interview angle',
        interviewTip('Do not just say "Pino is faster" — explain *why* (cheap serialisation, transports in worker threads, no in-process formatting chain) and when Winston\'s flexibility is worth it.'),
      ),
      section('practice', 'Practice',
        text('Implement the same request-logging middleware with both libraries. Use autocannon to send 20k requests and compare p99 latency and CPU with logging on/off.'),
      ),
      section('summary', 'Summary',
        bullets(
          'Winston: flexible formats/transports, in-process pipeline.',
          'Pino: JSON by default, very low overhead, worker-thread transports, pino-pretty for dev.',
          'Argument order differs: Pino `(obj, msg)`, Winston `(msg, meta)`.',
          'Both support child loggers and levels; Pino has built-in redaction.',
        ),
      ),
    ],
    revisionNotes: [
      'Pino levels: 10 trace … 60 fatal; Winston npm levels: 0 error … 6 silly.',
      'Pino `(mergingObject, msg)`; Winston `(msg, meta)`.',
      'pino-pretty / colorize only in development.',
      'Pino transports run in worker threads.',
      'Both third-party; Node has no built-in structured logger.',
    ],
    quiz: [
      {
        kind: 'find-bug', difficulty: 'intermediate',
        prompt: 'With Pino, why does `userId` not appear as a field in the log?',
        code: "logger.info('user logged in', { userId: 42 });",
        options: [
          'Pino strips numbers',
          'Pino expects the object first: `logger.info({ userId: 42 }, "user logged in")`; extra args are format interpolation values',
          'info level is disabled',
          'userId is a reserved key',
        ],
        answer: 1,
        explanation: 'In Pino the first argument may be a merging object and later arguments fill `%s`-style placeholders. Winston uses the opposite order.',
      },
      {
        kind: 'mcq', difficulty: 'intermediate',
        prompt: 'What is the main architectural reason Pino has lower overhead than Winston?',
        options: [
          'Pino is written in C++',
          'Pino does minimal work in-process (fast JSON serialisation) and runs transports/formatting in worker threads or separate processes',
          'Pino drops half the logs',
          'Pino compresses logs',
        ],
        answer: 1,
        explanation: 'Pino keeps the hot path cheap and pushes transport work off the main event loop. It is JavaScript, and it does not drop logs.',
      },
    ],
    interview: [
      {
        category: 'advanced', kind: 'concept', difficulty: 'advanced', topic: 'Logging libraries',
        question: 'Compare Winston and Pino. Which would you choose for a high-throughput API and why?',
        shortAnswer: 'Pino, because it serialises JSON with minimal overhead and moves transports and pretty-printing off the main thread; Winston is more flexible with formats and in-process transports but costs more CPU per log line.',
        detailedAnswer: [
          'Both third-party; both support levels, child loggers and JSON.',
          'Pino: NDJSON default, `redact`, `pino-http`, `pino.transport()` in worker threads, `pino-pretty` for dev.',
          'Winston: composable `format` pipeline, many transports, executed in the main thread.',
          'For containers: log JSON to stdout and let the platform ship it — Pino\'s model fits naturally.',
          'Choose Winston when you need complex formatting or direct multi-destination shipping and throughput is modest.',
        ],
        followUp: 'Why should pretty-printing never run in production?',
        trap: 'Claiming Pino is faster without being able to explain why.',
      },
    ],
  },

  'error-monitoring': {
    summary: 'Error monitoring tools (Sentry-style services) capture unhandled and reported exceptions with stack traces, context and release info, group them into issues, de-minify using source maps, and alert the team — complementing logs and metrics.',
    topics: ['error monitoring', 'Sentry', 'unhandledRejection', 'uncaughtException', 'source maps', 'release tracking', 'alerting', 'error grouping', 'graceful shutdown'],
    sections: [
      section('introduction', undefined,
        text('Logs tell you what happened if you go looking. Error monitoring *tells you* — "new error in release 1.4.2, 230 users affected, here is the stack trace and the request that caused it".'),
      ),
      section('definition', 'What an error monitor does',
        bullets(
          '**Capture**: SDK hooks into the runtime and framework to report exceptions (unhandled and manual `captureException`).',
          '**Enrich**: stack trace, request data (scrubbed), user id, release version, environment, breadcrumbs (recent logs/HTTP calls).',
          '**Group**: fingerprints errors by type + stack so 10,000 events become one issue.',
          '**Symbolicate**: uses uploaded **source maps** to show original TypeScript/source lines.',
          '**Alert**: notify on new issues, regressions, or spikes; link to the release that introduced them.',
        ),
        table('Logs vs metrics vs error monitoring', ['', 'Logs', 'Metrics', 'Error monitoring'], [
          ['Answers', 'What happened in detail?', 'How much / how fast / how often?', 'What is broken, since when, for whom?'],
          ['Unit', 'Event lines', 'Aggregated numbers', 'Grouped issues with stack traces'],
          ['Alerting', 'Possible, noisy', 'Thresholds/SLOs', 'New/regressed issues, spikes'],
          ['Examples', 'Pino → Loki/ELK', 'Prometheus, CloudWatch', 'Sentry, Rollbar, Bugsnag, Honeybadger (third-party)'],
        ]),
      ),
      section('why', 'Why you need it',
        bullets(
          'Unhandled errors in production are otherwise silent until users complain.',
          'Grouping and counts show priority; release tracking shows which deploy broke it.',
          'Context (request, user, breadcrumbs) cuts debugging time drastically.',
        ),
      ),
      section('internals', 'How capture works in Node',
        steps(
          'The SDK is initialised **before** the rest of the app (so it can instrument modules) — e.g. `node --import ./instrument.mjs server.js`.',
          'It registers `process.on("uncaughtException")` and `process.on("unhandledRejection")` handlers.',
          'Framework integration adds an Express error-handling middleware that reports errors passed to `next(err)`.',
          'Each event is serialised with the stack, scrubbed of sensitive data, and sent asynchronously (batched) to the service.',
          'On fatal errors the SDK **flushes** pending events before the process exits.',
          'Server side: the service maps minified/compiled frames back to source using the source maps uploaded for that release, then groups by fingerprint.',
        ),
        flow([
          'Error thrown',
          'SDK handler / Express error mw',
          'Scrub + enrich (release, user, breadcrumbs)',
          'Send to service',
          'Source maps → original lines',
          'Group into issue → alert',
        ], { title: 'Error monitoring pipeline', direction: 'horizontal' }),
      ),
      section('example', 'Setting it up',
        code({
          title: 'Fingerprinting errors into issues (pure JS)',
          runnable: true,
          code: dedent(`
            function fingerprint(err) {
              const frames = err.stack.split('\\n').slice(1, 3).map((l) => l.trim().replace(/:\\d+:\\d+\\)?$/, ''));
              return err.name + '|' + frames.join('|');
            }
            const events = [
              { name: 'TypeError', stack: 'TypeError: x is undefined\\n    at total (cart.js:10:5)\\n    at checkout (orders.js:44:12)' },
              { name: 'TypeError', stack: 'TypeError: y is undefined\\n    at total (cart.js:10:9)\\n    at checkout (orders.js:44:12)' },
              { name: 'Error', stack: 'Error: ETIMEDOUT\\n    at pay (stripe.js:3:1)\\n    at checkout (orders.js:50:3)' },
            ];
            const issues = new Map();
            for (const e of events) issues.set(fingerprint(e), (issues.get(fingerprint(e)) ?? 0) + 1);
            for (const [fp, count] of issues) console.log(count + 'x ' + fp);
          `),
          expectedOutput: '2x TypeError|at total (cart.js|at checkout (orders.js\n1x Error|at pay (stripe.js|at checkout (orders.js',
          explanation: [
            'Messages differ (`x` vs `y`) and columns differ, but type + top frames match → one issue.',
            'Real services use smarter grouping (in-app frames, normalised messages) and let you override fingerprints.',
            'Grouping is what turns an event flood into a short, prioritised issue list.',
          ],
        }),
        code({
          title: 'Sentry-style setup for Express (API varies by SDK version)',
          code: dedent(`
            // instrument.mjs — loaded first: node --import ./instrument.mjs server.mjs
            import * as Sentry from '@sentry/node'; // third-party
            Sentry.init({
              dsn: process.env.SENTRY_DSN,
              environment: process.env.NODE_ENV,
              release: process.env.GIT_SHA,           // ties errors to a deploy + its source maps
              tracesSampleRate: 0.1,                  // optional performance sampling
              sendDefaultPii: false,
              beforeSend(event) {                     // last chance to scrub
                if (event.request?.headers) delete event.request.headers.authorization;
                return event;
              },
            });

            // server.mjs
            import express from 'express';
            import * as Sentry from '@sentry/node';
            const app = express();
            app.get('/boom', () => { throw new Error('boom'); });
            Sentry.setupExpressErrorHandler(app);     // after routes, before your own error handler
            app.use((err, req, res, next) => res.status(500).json({ error: 'Internal error' }));
            app.listen(3000);
          `),
          expectedOutput: '$ curl localhost:3000/boom\n{"error":"Internal error"}\n\nMonitoring dashboard:\n  Error: boom   ·  server.mjs in <anonymous> at line 5\n  release 3f9c2a1 · environment production · 1 event · 1 user',
          explanation: [
            'Initialising first lets the SDK instrument http, Express and DB modules for breadcrumbs.',
            '`release` + uploaded source maps produce readable stack traces for TypeScript/bundled builds.',
            'Scrub sensitive data in `beforeSend`; keep `sendDefaultPii` off unless you have a privacy basis.',
            'Function names (`setupExpressErrorHandler`) are from recent Sentry SDK versions; older versions used different middleware APIs.',
          ],
        }),
        code({
          title: 'Process-level safety net (no SDK)',
          code: dedent(`
            process.on('unhandledRejection', (reason) => {
              logger.error({ err: reason }, 'unhandledRejection');
              throw reason; // escalate to uncaughtException → crash (Node's default since v15)
            });

            process.on('uncaughtException', async (err, origin) => {
              logger.fatal({ err, origin }, 'uncaughtException — shutting down');
              await errorReporter.flush(2000).catch(() => {});      // send pending events
              server.close(() => process.exit(1));                  // stop accepting, then exit
              setTimeout(() => process.exit(1), 5000).unref();      // hard timeout
            });
          `),
          expectedOutput: '{"level":60,"err":{"type":"TypeError","message":"Cannot read properties of undefined (reading \'id\')","stack":"..."},"origin":"uncaughtException","msg":"uncaughtException — shutting down"}\n(process exits with code 1; orchestrator restarts it)',
          explanation: [
            'After an uncaught exception the process state is unknown — log, flush, exit, and let the supervisor restart it.',
            'Do not "swallow" errors in these handlers and keep serving.',
            'Since Node 15 an unhandled rejection crashes the process by default (`--unhandled-rejections=throw`).',
          ],
        }),
      ),
      section('real-world', 'Operating it well',
        bullets(
          'Upload source maps in CI for each release; do not serve them publicly if you do not want source exposed.',
          'Alert on **new** and **regressed** issues and on spikes — not on every event.',
          'Attach `reqId` as a tag so you can jump from an issue to its logs.',
          'Mark expected errors (validation, 404) as non-reportable to keep signal high.',
          'Respect privacy: scrub PII, set data retention, consider self-hosting if required.',
        ),
        tip('Link releases to commits: the monitoring tool can then suggest which commit introduced a regression.'),
      ),
      section('mistakes', 'Common mistakes',
        bullets(
          'Initialising the SDK after importing the app → missing instrumentation.',
          'Registering the error handler before routes, or after a handler that already sent the response without calling `next(err)`.',
          'No source maps → stack traces point at `dist/index.js:1:48213`.',
          'Reporting every 4xx → noise, quota exhaustion, ignored alerts.',
          'Process handlers that log and continue running after `uncaughtException`.',
        ),
        warn('Error events can contain request bodies, headers and local variables. Scrub secrets and personal data before they leave your process.'),
      ),
      section('interview', 'Interview angle',
        interviewTip('Cover the loop: capture (process + framework hooks), context (release, reqId, user), source maps, grouping, alerting on new/regressed issues — and that the process should exit after an uncaught exception.'),
      ),
      section('practice', 'Practice',
        text('Create a free-tier project in an error monitoring service (or run a self-hosted one), add the SDK to an Express app, throw an error in a TypeScript route, and confirm the stack trace shows TypeScript lines after uploading source maps.'),
      ),
      section('summary', 'Summary',
        bullets(
          'Error monitoring = capture + enrich + group + symbolicate + alert.',
          'Initialise the SDK first; add the framework error handler after routes.',
          'Upload source maps per release; tag with release and reqId.',
          'On uncaughtException: log, flush, exit; let the orchestrator restart.',
          'Scrub sensitive data; alert on new/regressed issues, not every event.',
        ),
      ),
    ],
    revisionNotes: [
      'Hooks: `uncaughtException`, `unhandledRejection`, Express error middleware.',
      'Unhandled rejections crash by default since Node 15.',
      'Source maps + release → readable stack traces.',
      'Grouping by fingerprint (type + top frames).',
      'Flush before exit; never keep running after uncaughtException.',
      'Scrub PII/secrets (`beforeSend`).',
    ],
    quiz: [
      {
        kind: 'mcq', difficulty: 'intermediate',
        prompt: 'Your monitor shows stack traces like `dist/main.js:1:93841`. What is missing?',
        options: [
          'A higher sample rate',
          'Source maps uploaded for that release, so frames can be mapped back to original source',
          'The uncaughtException handler',
          'HTTPS',
        ],
        answer: 1,
        explanation: 'Compiled/minified output needs source maps (matched by release) for symbolication.',
      },
      {
        kind: 'find-bug', difficulty: 'advanced',
        prompt: 'What is dangerous about this handler?',
        code: "process.on('uncaughtException', (err) => {\n  logger.error({ err }, 'oops');\n  // keep serving requests\n});",
        options: [
          'logger.error is async',
          'It keeps the process running in an unknown, possibly corrupted state; it should report, flush and exit so a supervisor restarts it',
          'uncaughtException is not a real event',
          'It should use console.error',
        ],
        answer: 1,
        explanation: 'After an uncaught exception, invariants (open transactions, half-updated state) may be broken. Node docs recommend using it only for synchronous cleanup before exiting.',
      },
    ],
    interview: [
      {
        category: 'advanced', kind: 'concept', difficulty: 'advanced', topic: 'Error monitoring',
        question: 'How should a Node.js service handle uncaught exceptions and unhandled promise rejections in production?',
        shortAnswer: 'Treat them as fatal: report them (logs + error monitor), flush pending telemetry, stop accepting new work, and exit non-zero so the process manager restarts a clean instance.',
        detailedAnswer: [
          'Since Node 15, unhandled rejections throw and crash by default — do not downgrade that to a warning.',
          '`uncaughtException` handler: log fatal, `await reporter.flush(timeout)`, `server.close()`, exit with a hard timeout.',
          'Run multiple instances behind a load balancer so a restart is invisible to users.',
          'Fix root causes: every promise awaited or `.catch`-ed; Express 5 forwards rejected async handlers to error middleware (Express 4 needs a wrapper).',
          'Alert on crash loops via the orchestrator (restart counts).',
        ],
        followUp: 'How does Express 5 differ from Express 4 in handling errors from async route handlers?',
        trap: 'Catching the error globally and continuing to serve traffic.',
      },
      {
        category: 'express-backend', kind: 'concept', difficulty: 'intermediate', topic: 'Error monitoring',
        question: 'What is the difference between logging and error monitoring, and why use both?',
        shortAnswer: 'Logs are a detailed, searchable event stream you query when investigating; error monitoring groups exceptions into issues with stack traces, release info and alerts, so you are notified about what is broken and its impact.',
        detailedAnswer: [
          'Logs: every request/event, context fields, retention-limited, query-driven.',
          'Error monitor: deduplicated issues, counts, affected users, first/last seen, regression detection.',
          'Source-mapped stacks and breadcrumbs make the monitor faster for triage.',
          'Linking via request id lets you pivot from an issue to the full log trail.',
          'Metrics complete the picture (rates, latency, SLOs).',
        ],
        followUp: 'Which errors would you deliberately not send to the error monitor?',
        trap: 'Thinking an error monitor replaces logs.',
      },
    ],
  },
};

export default content;
