import type { ModuleContent } from '../../../types';
import {
  bullets, code, dedent, diagram, flow, interviewTip, note, section, steps, table, text,
} from '../helpers';

const content: Partial<ModuleContent> = {
  // ───────────────────────────────────────────────────────────
  'centralized-error-handling': {
    summary: 'Centralized error handling uses an `AppError` hierarchy for expected (operational) failures, a 404 handler, and one final error middleware that logs, maps errors to status codes and returns a consistent JSON shape.',
    topics: ['AppError', 'operational errors', 'programmer errors', '404 handler', 'error shape', 'unhandledRejection', 'uncaughtException', 'logging'],
    sections: [
      section('introduction', undefined,
        text('If every route formats errors its own way, clients cannot handle them and logs are useless. Centralizing means: throw anywhere, handle in one place.'),
      ),
      section('definition', 'Operational vs programmer errors',
        table('Two kinds of errors', ['', 'Operational', 'Programmer (bug)'], [
          ['Examples', 'Validation failed, not found, conflict, DB timeout, third-party 503', '`undefined is not a function`, wrong argument, failed assertion'],
          ['Expected?', 'Yes — part of normal operation', 'No'],
          ['Response', 'Specific 4xx/5xx with a safe message', 'Generic 500, log with stack, alert'],
          ['Process', 'Keep running', 'In an Express request: respond 500. Outside a request (uncaughtException): log and restart'],
          ['Marked by', '`isOperational = true` on `AppError`', 'Anything else'],
        ]),
      ),
      section('why', 'Why centralize',
        bullets(
          'One stable error contract: `{ error: { code, message, details? } }`.',
          'No stack traces or SQL leaking to clients.',
          'Every error is logged once, with the request id.',
        ),
      ),
      section('internals', 'The pieces',
        flow([
          'Service throws: new NotFoundError("User 9 not found")',
          'Express 5 catches rejection → next(err)',
          'notFound handler (only for unmatched routes)',
          'errorHandler: normalize → log → respond',
        ], { direction: 'vertical', title: 'Error flow' }),
        steps(
          '`AppError extends Error` with `statusCode`, `code`, `isOperational`, optional `details`.',
          'Subclasses: `BadRequestError`, `UnauthorizedError`, `ForbiddenError`, `NotFoundError`, `ConflictError`.',
          'A 404 middleware after all routes: `next(new NotFoundError(...))`.',
          'The error handler normalizes known third-party errors (body-parser, JWT, multer, DB unique violation) into `AppError`s.',
          'Process-level: `process.on("unhandledRejection")` and `uncaughtException` log and exit so the supervisor restarts the process.',
        ),
      ),
      section('example', 'AppError hierarchy',
        code({
          title: 'errors/AppError.js (pure JS)',
          runnable: true,
          code: dedent(`
            class AppError extends Error {
              constructor(message, { statusCode = 500, code = 'INTERNAL', details, cause } = {}) {
                super(message, { cause });
                this.name = new.target.name;
                this.statusCode = statusCode;
                this.code = code;
                this.details = details;
                this.isOperational = true;
              }
            }
            class NotFoundError extends AppError {
              constructor(message = 'Resource not found') { super(message, { statusCode: 404, code: 'NOT_FOUND' }); }
            }
            class ConflictError extends AppError {
              constructor(message) { super(message, { statusCode: 409, code: 'CONFLICT' }); }
            }

            function toResponse(err) {
              if (err instanceof AppError) {
                return { status: err.statusCode, body: { error: { code: err.code, message: err.message } } };
              }
              return { status: 500, body: { error: { code: 'INTERNAL', message: 'Internal Server Error' } } };
            }

            const errors = [new NotFoundError('User 9 not found'), new ConflictError('Email taken'), new TypeError('x is undefined')];
            for (const e of errors) {
              const r = toResponse(e);
              console.log(e.name, e.isOperational === true, r.status, JSON.stringify(r.body));
            }
          `),
          expectedOutput: 'NotFoundError true 404 {"error":{"code":"NOT_FOUND","message":"User 9 not found"}}\nConflictError true 409 {"error":{"code":"CONFLICT","message":"Email taken"}}\nTypeError false 500 {"error":{"code":"INTERNAL","message":"Internal Server Error"}}',
          explanation: [
            '`new.target.name` gives each subclass its own `name` automatically.',
            'The TypeError is a programmer error: its message is hidden behind a generic 500.',
            '`cause` (ES2022) keeps the original low-level error for logs.',
          ],
        }),
        code({
          title: 'middleware/notFound.js + errorHandler.js',
          code: dedent(`
            const { AppError, NotFoundError, ConflictError, BadRequestError } = require('../errors/AppError');

            function notFound(req, res, next) {
              next(new NotFoundError('Route ' + req.method + ' ' + req.originalUrl + ' not found'));
            }

            function normalize(err) {
              if (err instanceof AppError) return err;
              if (err.type === 'entity.parse.failed') return new BadRequestError('Malformed JSON');
              if (err.code === '23505') return new ConflictError('Resource already exists'); // Postgres unique_violation
              return err; // unknown → programmer error
            }

            // eslint-disable-next-line no-unused-vars
            function errorHandler(err, req, res, next) {
              const e = normalize(err);
              const operational = e instanceof AppError;
              const status = operational ? e.statusCode : 500;

              const log = status >= 500 ? console.error : console.warn;
              log(JSON.stringify({ requestId: res.locals.requestId, status, name: err.name, message: err.message, stack: status >= 500 ? err.stack : undefined }));

              if (res.headersSent) return next(err);
              res.status(status).json({
                error: {
                  code: operational ? e.code : 'INTERNAL',
                  message: operational ? e.message : 'Internal Server Error',
                  ...(operational && e.details ? { details: e.details } : {}),
                  requestId: res.locals.requestId,
                },
              });
            }

            module.exports = { notFound, errorHandler };
          `),
          explanation: [
            'Third-party errors are translated into AppErrors at one place.',
            '4xx logged as warnings, 5xx as errors with stack.',
            '`requestId` lets support correlate a user report with logs.',
          ],
        }),
        code({
          title: 'Responses',
          language: 'http',
          code: 'GET /api/v1/nope HTTP/1.1\n\nGET /api/v1/users/9 HTTP/1.1\n\nGET /api/v1/buggy HTTP/1.1',
          expectedOutput: 'HTTP/1.1 404 Not Found\n{"error":{"code":"NOT_FOUND","message":"Route GET /api/v1/nope not found","requestId":"r-101"}}\n\nHTTP/1.1 404 Not Found\n{"error":{"code":"NOT_FOUND","message":"User 9 not found","requestId":"r-102"}}\n\nHTTP/1.1 500 Internal Server Error\n{"error":{"code":"INTERNAL","message":"Internal Server Error","requestId":"r-103"}}',
        }),
        code({
          title: 'Process-level safety net (server.js)',
          code: dedent(`
            process.on('unhandledRejection', (reason) => {
              logger.fatal({ reason }, 'unhandledRejection');
              shutdown(1);
            });
            process.on('uncaughtException', (err) => {
              logger.fatal({ err }, 'uncaughtException');
              shutdown(1); // state may be corrupt: close server, then exit; PM2/K8s restarts
            });
          `),
          explanation: ['These are Node core process events. They are a last resort, not a replacement for error middleware.'],
        }),
      ),
      section('real-world', 'Real-world practice',
        bullets(
          'Send 5xx to an error tracker (Sentry etc.) with the request id; skip 4xx noise.',
          'Consider RFC 9457 Problem Details (`application/problem+json`) as a standard error format.',
          'Map DB constraint errors (unique, foreign key) to 409/422 instead of 500.',
        ),
      ),
      section('mistakes', 'Common mistakes',
        code({
          title: 'Wrong vs right: leaking internals',
          code: dedent(`
            // ✗ leaks SQL, file paths and stack traces
            app.use((err, req, res, next) => res.status(500).json({ message: err.message, stack: err.stack }));

            // ✓ safe message for unknown errors; details only in logs
            app.use((err, req, res, next) => {
              logger.error({ err, requestId: res.locals.requestId });
              res.status(500).json({ error: { code: 'INTERNAL', message: 'Internal Server Error' } });
            });
          `),
        }),
        bullets(
          'Catching errors in every controller and responding manually.',
          'Swallowing `uncaughtException` and continuing — the process may be in an undefined state.',
          'Forgetting the 404 handler, so unknown routes return Express\'s HTML `Cannot GET`.',
          'Treating all errors as 500 — validation and not-found are client errors.',
        ),
      ),
      section('interview', 'Interview angle',
        interviewTip('Name the two error classes (operational vs programmer), show an AppError, and say what happens at process level. Interviewers like the nuance that a bug inside a request is handled with 500, while an uncaught exception outside should restart the process.'),
      ),
      section('practice', 'Practice',
        text('Add `UnauthorizedError` and `ForbiddenError`, map `TokenExpiredError` from jsonwebtoken to a 401 with code `TOKEN_EXPIRED`, and write tests that assert the JSON shape for 400, 401, 404 and 500.'),
      ),
      section('summary', 'Summary',
        bullets(
          'AppError subclasses for expected failures; everything else is a bug → 500.',
          '404 handler after routes; error handler last.',
          'Normalize third-party errors in one place.',
          'Log with request id; never leak internals.',
          'Process-level handlers log and restart.',
        ),
      ),
    ],
    revisionNotes: [
      'Operational errors = expected (404, 409, timeouts); programmer errors = bugs.',
      '`AppError` carries `statusCode`, `code`, `isOperational`, optional `details`/`cause`.',
      'Order: routes → 404 handler → error handler.',
      'Unknown errors → generic 500 message; details only in logs.',
      '`uncaughtException`/`unhandledRejection` → log, graceful shutdown, let supervisor restart.',
      'Postgres unique violation code `23505` → map to 409.',
    ],
    quiz: [
      {
        kind: 'mcq', difficulty: 'beginner',
        prompt: 'Where should the 404 "route not found" handler be registered?',
        options: ['Before all routes', 'After all routes but before the error handler', 'After the error handler', 'Inside every router'],
        answer: 1,
        explanation: 'It must only run when no route matched (so after them) and it forwards to the error handler (so before it).',
      },
      {
        kind: 'scenario', difficulty: 'intermediate',
        prompt: 'Which of these is a programmer error rather than an operational error?',
        options: ['User submits an invalid email', 'Database times out', 'Calling `user.profile.name` when `profile` is undefined', 'Payment provider returns 503'],
        answer: 2,
        explanation: 'A TypeError from a missing null check is a bug. The others are expected conditions the system must handle gracefully.',
      },
      {
        kind: 'find-bug', difficulty: 'intermediate',
        prompt: 'What is the security problem in this handler?',
        code: "app.use((err, req, res, next) => {\n  res.status(err.statusCode || 500).json({ error: err.message, stack: err.stack });\n});",
        options: [
          'It should use res.send',
          'It exposes stack traces and raw messages (SQL, paths) of unexpected errors to clients',
          'statusCode should be status',
          'It must call next() first',
        ],
        answer: 1,
        explanation: 'Unknown errors can contain internals. Only operational errors\' messages are safe; others get a generic message, with details in logs.',
      },
    ],
    interview: [
      {
        category: 'express-backend', kind: 'concept', difficulty: 'intermediate', topic: 'Error handling',
        question: 'What is the difference between operational errors and programmer errors, and how should a Node.js API treat each?',
        shortAnswer: 'Operational errors are expected runtime conditions (invalid input, not found, timeouts) and get specific responses; programmer errors are bugs and get a generic 500, full logging and — if they escape request handling — a process restart.',
        detailedAnswer: [
          'Mark operational errors (`AppError`, `isOperational: true`) with status and code.',
          'Unknown errors are treated as bugs: generic message, stack in logs, alert.',
          'Inside a request, Express catches the bug and you return 500 — the process can continue.',
          '`uncaughtException` means state may be corrupt: log, close gracefully, exit; a supervisor restarts.',
          'Retry/backoff is appropriate for some operational errors (DB timeout), never for bugs.',
        ],
        followUp: 'Why not just keep running after an uncaughtException?',
        trap: 'Treating every error as 500, or crashing the process on validation errors.',
      },
      {
        category: 'express-backend', kind: 'concept', difficulty: 'beginner', topic: '404 handling',
        question: 'How do you return a JSON 404 for unknown routes in Express?',
        shortAnswer: 'Register a middleware after all routes that responds with 404 JSON (or calls `next(new NotFoundError())`), because only unmatched requests reach it.',
        detailedAnswer: [
          'Without it, Express\'s final handler sends an HTML `Cannot GET /x` page.',
          'It must be after every router and before the error handler.',
          'Include method and path in the message for debugging.',
          'Resource-level 404s (id not found) come from services, not this handler.',
        ],
        followUp: 'How do you also return 405 for a known path with the wrong method?',
        trap: 'Putting the 404 handler first, which makes every route return 404.',
      },
      {
        category: 'express-backend', kind: 'scenario', difficulty: 'advanced', topic: 'Process errors',
        question: 'Your Express service occasionally logs an unhandledRejection and then keeps serving requests. What would you change and why?',
        shortAnswer: 'Treat it as a bug: find the un-awaited promise, and make the process log, stop accepting traffic, drain, and exit so the orchestrator restarts a clean instance — continuing risks leaked resources and inconsistent state.',
        detailedAnswer: [
          'Since Node 15 the default is to crash on unhandled rejections (`--unhandled-rejections=throw`); a handler that just logs overrides that.',
          'Common causes: fire-and-forget promises (`sendEmail()` without await/catch), event handlers calling async functions.',
          'Fix the source: await it or attach `.catch(logError)` deliberately.',
          'Process handler: log with context, `server.close()`, close pools, exit with code 1 after a timeout.',
          'Run multiple instances so restarts do not cause downtime.',
        ],
        followUp: 'How do you safely run fire-and-forget work in a request?',
        trap: 'Assuming Express 5 catches promises that the handler never returned or awaited.',
      },
    ],
  },

  // ───────────────────────────────────────────────────────────
  'file-uploads': {
    summary: 'Express has no multipart parser; multer (third-party) parses `multipart/form-data` with memory or disk storage, size limits and a fileFilter — and you must never trust the client-provided mimetype or filename.',
    topics: ['multer', 'multipart/form-data', 'memoryStorage', 'diskStorage', 'limits', 'fileFilter', 'magic bytes', 'MulterError', 'S3 presigned URLs'],
    sections: [
      section('introduction', undefined,
        text('Avatars, PDFs and CSV imports arrive as `multipart/form-data`. That format is not handled by `express.json()` — you need a streaming multipart parser.'),
      ),
      section('definition', 'multer basics',
        bullets(
          '`multer` (third-party, built on `busboy`) is Express middleware that only processes `multipart/form-data`.',
          '`upload.single("avatar")` → `req.file`; `upload.array("photos", 5)` → `req.files`; `upload.fields([...])`; `upload.none()` for text-only forms.',
          'Text fields land in `req.body`.',
        ),
        table('Storage engines', ['', '`multer.memoryStorage()`', '`multer.diskStorage({...})`'], [
          ['Where', '`req.file.buffer` in RAM', 'File on disk: `req.file.path`'],
          ['Good for', 'Small files you forward (S3, image processing)', 'Larger files, later processing'],
          ['Risk', 'Memory exhaustion without `limits`', 'Disk filling, path traversal via filenames, cleanup'],
          ['Default filename', '—', 'Random hex name **without** extension (if `filename` not given)'],
        ]),
        table('req.file fields', ['Field', 'Trust it?'], [
          ['`fieldname`', 'Yes (your form field)'],
          ['`originalname`', 'No — client-controlled, may contain `../` or scripts'],
          ['`mimetype`', 'No — just the client\'s Content-Type header for that part'],
          ['`size`', 'Yes (measured by multer)'],
          ['`buffer` / `path`', 'The real bytes — inspect these'],
        ]),
      ),
      section('why', 'Why care',
        bullets(
          'Uploads are one of the most common sources of RCE, stored XSS and DoS.',
          'An attacker can name a file `avatar.png` with `Content-Type: image/png` and upload HTML or an executable.',
        ),
      ),
      section('internals', 'How multer processes a request',
        steps(
          'Checks `Content-Type: multipart/form-data; boundary=...`; otherwise calls `next()`.',
          'Streams the body through busboy, splitting parts at the boundary.',
          'For each file part: runs `fileFilter`, then pipes bytes into the storage engine while counting against `limits.fileSize`.',
          'Exceeding a limit aborts with a `MulterError` (`LIMIT_FILE_SIZE`, `LIMIT_FILE_COUNT`, `LIMIT_UNEXPECTED_FILE`…) passed to `next(err)`.',
          'On success sets `req.file(s)` and `req.body`, then `next()`.',
        ),
      ),
      section('example', 'Secure avatar upload',
        code({
          title: 'routes/avatar.js',
          code: dedent(`
            const express = require('express');
            const multer = require('multer');
            const crypto = require('node:crypto');
            const { BadRequestError } = require('../errors/AppError');

            const ALLOWED = new Set(['image/png', 'image/jpeg', 'image/webp']);

            const upload = multer({
              storage: multer.memoryStorage(),
              limits: { fileSize: 2 * 1024 * 1024, files: 1, fields: 5 },
              fileFilter(req, file, cb) {
                // cheap first check only — the client controls file.mimetype
                if (!ALLOWED.has(file.mimetype)) return cb(new BadRequestError('Only PNG, JPEG or WebP'));
                cb(null, true);
              },
            });

            function sniffImageType(buf) {
              if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
              if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
              if (buf.subarray(0, 4).toString('ascii') === 'RIFF' && buf.subarray(8, 12).toString('ascii') === 'WEBP') return 'webp';
              return null;
            }

            const router = express.Router();
            router.post('/me/avatar', requireAuth, upload.single('avatar'), async (req, res) => {
              if (!req.file) throw new BadRequestError('avatar file is required');
              const ext = sniffImageType(req.file.buffer);           // trust the bytes, not the header
              if (!ext) throw new BadRequestError('File content is not a supported image');
              const key = 'avatars/' + req.user.id + '/' + crypto.randomUUID() + '.' + ext; // never originalname
              await storage.put(key, req.file.buffer, { contentType: 'image/' + (ext === 'jpg' ? 'jpeg' : ext) });
              res.status(201).json({ data: { key, size: req.file.size } });
            });

            module.exports = router;
          `),
          explanation: [
            '`limits.fileSize` stops a 5 GB upload from filling memory — multer aborts mid-stream.',
            'Magic-byte sniffing verifies the actual content (libraries like `file-type` cover many formats).',
            'Server-generated names avoid path traversal and overwrites.',
          ],
          versionNote: 'Use multer 2.x — 1.x had denial-of-service vulnerabilities fixed in 2.0 (2025).',
        }),
        code({
          title: 'Handling multer errors in the error handler',
          code: dedent(`
            const multer = require('multer');

            app.use((err, req, res, next) => {
              if (err instanceof multer.MulterError) {
                const status = err.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
                return res.status(status).json({ error: { code: err.code, message: err.message } });
              }
              next(err);
            });
          `),
        }),
        code({
          title: 'Responses',
          language: 'http',
          code: 'POST /me/avatar HTTP/1.1\nContent-Type: multipart/form-data; boundary=X\n\n(3 MB PNG)\n\nPOST /me/avatar HTTP/1.1\nContent-Type: multipart/form-data; boundary=X\n\n(HTML file sent as image/png)\n\nPOST /me/avatar HTTP/1.1\nContent-Type: multipart/form-data; boundary=X\n\n(valid 200 KB PNG)',
          expectedOutput: 'HTTP/1.1 413 Payload Too Large\n{"error":{"code":"LIMIT_FILE_SIZE","message":"File too large"}}\n\nHTTP/1.1 400 Bad Request\n{"error":{"code":"BAD_REQUEST","message":"File content is not a supported image"}}\n\nHTTP/1.1 201 Created\n{"data":{"key":"avatars/42/3f2c9a8e-1d4b-4c7e-9f00-6a1b2c3d4e5f.png","size":204800}}',
          explanation: ['The HTML file passed the mimetype filter (client lied) but failed the magic-byte check.'],
        }),
      ),
      section('real-world', 'Real-world upload architecture',
        bullets(
          'For large files, skip your server: issue an S3/GCS **presigned URL**, let the browser upload directly, then verify via event/callback.',
          'Store uploads outside the web root, or in object storage; serve with `Content-Disposition: attachment` and `X-Content-Type-Options: nosniff` for user content.',
          'Scan for malware asynchronously (queue + ClamAV or provider scanning) before making files public.',
          'Re-encode images (e.g. with `sharp`) to strip metadata and embedded payloads.',
        ),
      ),
      section('mistakes', 'Common mistakes',
        code({
          title: 'Wrong vs right: trusting client metadata',
          code: dedent(`
            // ✗ trusts originalname and mimetype; no size limit
            const upload = multer({ storage: multer.diskStorage({
              destination: 'public/uploads',
              filename: (req, file, cb) => cb(null, file.originalname),
            }) });

            // ✓ limit size, random name, private dir, verify bytes after upload
            const upload = multer({
              storage: multer.diskStorage({
                destination: '/var/app/uploads',
                filename: (req, file, cb) => cb(null, crypto.randomUUID()),
              }),
              limits: { fileSize: 5 * 1024 * 1024, files: 1 },
            });
          `),
          explanation: ['`originalname` like `../../server.js` or `x.html` in a public folder enables overwrites and stored XSS.'],
        }),
        bullets(
          'Registering `upload.any()` globally — accepts unlimited files on every route.',
          'Not deleting temp files when later validation fails (disk storage).',
          'Using `express.json()` and expecting it to parse multipart.',
        ),
      ),
      section('interview', 'Interview angle',
        interviewTip('Hit the security points: limits, never trust mimetype/originalname, verify magic bytes, random names, store outside web root/object storage, and presigned URLs for big files.'),
      ),
      section('practice', 'Practice',
        text('Build `POST /imports` accepting one CSV up to 10 MB with disk storage. Reject anything whose first line does not match the expected header, and delete the temp file in a `finally` block.'),
      ),
      section('summary', 'Summary',
        bullets(
          'Multipart needs multer (or busboy) — not built into Express.',
          'Memory storage for small forwarded files; disk for larger; presigned URLs for huge.',
          'Always set `limits`; handle `MulterError`.',
          'Never trust `mimetype` or `originalname`; check the bytes.',
        ),
      ),
    ],
    revisionNotes: [
      'multer = third-party multipart parser; `single` → `req.file`, `array/fields` → `req.files`.',
      'memoryStorage → `buffer`; diskStorage → `path` (default name random, no extension).',
      '`limits: { fileSize, files, fields }` — exceeding → `MulterError` (`LIMIT_FILE_SIZE`).',
      '`file.mimetype` and `originalname` are client-supplied — verify magic bytes, generate names.',
      'Large files: presigned upload URLs to object storage.',
    ],
    quiz: [
      {
        kind: 'scenario', difficulty: 'intermediate',
        prompt: 'An attacker uploads `profile.png` with `Content-Type: image/png`, but it is an HTML page with a script. Your fileFilter checks `file.mimetype`. What else is needed?',
        options: [
          'Nothing — mimetype is verified by multer',
          'Check the file extension of originalname',
          'Inspect the actual bytes (magic numbers) and serve user files with nosniff / from a separate origin',
          'Increase fileSize limit',
        ],
        answer: 2,
        explanation: 'Both mimetype and originalname come from the client. Only the content tells you what the file is, and serving safely limits impact.',
      },
      {
        kind: 'mcq', difficulty: 'beginner',
        prompt: 'With `upload.single("avatar")` and memory storage, where are the file bytes?',
        options: ['req.body.avatar', 'req.file.buffer', 'req.files[0].path', 'res.locals.file'],
        answer: 1,
        explanation: 'Memory storage puts a Buffer on `req.file.buffer`. Disk storage would give `req.file.path`.',
      },
      {
        kind: 'mcq', difficulty: 'intermediate',
        prompt: 'What happens when a file exceeds `limits.fileSize` in multer?',
        options: [
          'The file is truncated silently and saved',
          'Multer stops processing and passes a `MulterError` with code `LIMIT_FILE_SIZE` to `next(err)`',
          'Express returns 413 automatically with no error handler',
          'The server crashes',
        ],
        answer: 1,
        explanation: 'You map that error to 413 in your error handler. Without one, the default Express handler responds 500.',
      },
    ],
    interview: [
      {
        category: 'express-backend', kind: 'concept', difficulty: 'intermediate', topic: 'File uploads',
        question: 'When would you use multer memory storage versus disk storage?',
        shortAnswer: 'Memory storage for small files you immediately process or forward (e.g. to S3 or an image resizer); disk storage for larger files or batch processing — always with size limits, and presigned direct-to-storage uploads for very large files.',
        detailedAnswer: [
          'Memory: simple, no cleanup, but each concurrent upload consumes RAM up to `fileSize`.',
          'Disk: lower memory, but you must manage temp files, cleanup and safe filenames.',
          'Concurrency matters: 100 parallel 10 MB uploads = 1 GB RAM with memory storage.',
          'Streaming engines (e.g. multer-s3) pipe straight to object storage.',
          'Presigned URLs offload bandwidth from your API servers entirely.',
        ],
        followUp: 'How would you limit total concurrent upload memory?',
        trap: 'Using memory storage without `limits.fileSize`.',
      },
      {
        category: 'express-backend', kind: 'concept', difficulty: 'advanced', topic: 'Upload security',
        question: 'How do you securely handle user file uploads in an Express API?',
        shortAnswer: 'Limit size and count, allowlist types by inspecting the actual bytes (not the client mimetype or filename), generate server-side names, store outside the web root or in object storage, scan asynchronously, and serve with safe headers from a separate origin.',
        detailedAnswer: [
          'multer `limits` (fileSize, files, fields) to prevent DoS.',
          '`file.mimetype`/`originalname` are attacker-controlled; sniff magic bytes (e.g. `file-type`) after upload.',
          'Random names (UUID) prevent path traversal and overwrite.',
          'Re-encode images to strip EXIF/GPS data and polyglot payloads.',
          'Serve with `Content-Disposition: attachment`, `X-Content-Type-Options: nosniff`, ideally from a sandbox domain/CDN.',
          'Authorization: check who may read each object; use short-lived signed URLs.',
        ],
        followUp: 'Why serve user uploads from a different domain than your app?',
        trap: 'Relying on the file extension check alone.',
      },
    ],
  },

  // ───────────────────────────────────────────────────────────
  'static-files': {
    summary: '`express.static(root, options)` serves files from a directory with ETag/Last-Modified, Range support and configurable Cache-Control — use long immutable caching for hashed assets and no-cache for HTML.',
    topics: ['express.static', 'serve-static', 'maxAge', 'immutable', 'Cache-Control', 'ETag', '304 Not Modified', 'dotfiles', 'SPA fallback', 'CDN'],
    sections: [
      section('introduction', undefined,
        text('Images, CSS, JS bundles and downloads are just files. `express.static` serves them safely and efficiently without you writing `fs` code.'),
      ),
      section('definition', 'Definition',
        bullets(
          '`app.use(express.static(path.join(__dirname, "public")))` — serves `public/logo.png` at `/logo.png`.',
          '`app.use("/static", express.static(dir))` — adds a URL prefix.',
          'Built on the `serve-static` and `send` packages (bundled with Express).',
          'Prevents path traversal (`/../server.js` is rejected) and by default ignores dotfiles in Express 5.',
        ),
        table('Useful options', ['Option', 'Default', 'Meaning'], [
          ['`maxAge`', '`0`', 'Cache-Control max-age (ms or string like `"1y"`)'],
          ['`immutable`', '`false`', 'Adds `immutable` directive (needs maxAge)'],
          ['`etag` / `lastModified`', '`true`', 'Validators for 304 responses'],
          ['`index`', '`"index.html"`', 'File served for directory requests'],
          ['`dotfiles`', '`"ignore"`', '`"allow"`, `"deny"` or `"ignore"` (404)'],
          ['`fallthrough`', '`true`', 'Call `next()` when file missing (vs 404 error)'],
          ['`setHeaders(res, path)`', '—', 'Per-file custom headers'],
        ]),
      ),
      section('why', 'Caching strategy',
        table('What to cache how', ['File', 'Example', 'Cache-Control'], [
          ['Hashed build asset', '`app.3f9a1c.js`', '`public, max-age=31536000, immutable`'],
          ['HTML entry', '`index.html`', '`no-cache` (always revalidate)'],
          ['User-specific / private', 'Invoices', '`private, no-store` and auth check'],
        ]),
        note('`no-cache` does not mean "do not cache" — it means "revalidate before use" (ETag → 304). `no-store` means do not store at all.'),
      ),
      section('internals', 'Serving a file',
        steps(
          'Only GET and HEAD are handled; other methods fall through (`next()`).',
          'Decode the URL path, join with root, reject traversal outside root.',
          '`fs.stat` the file (Node core). Missing → `next()` (fallthrough).',
          'Compute ETag (from size + mtime) and Last-Modified.',
          'If the request has matching `If-None-Match`/`If-Modified-Since` → **304** with no body.',
          'Otherwise stream the file with `fs.createReadStream` (supports `Range` → 206 Partial Content).',
        ),
      ),
      section('example', 'Static assets with the right cache headers',
        code({
          title: 'Serving a built SPA',
          code: dedent(`
            const path = require('node:path');
            const express = require('express');
            const app = express();
            const dist = path.join(__dirname, 'dist');

            app.use('/assets', express.static(path.join(dist, 'assets'), {
              maxAge: '1y',
              immutable: true,
              fallthrough: false,      // missing asset → 404 error, not the SPA page
            }));

            app.use(express.static(dist, {
              index: false,
              setHeaders(res, filePath) {
                if (filePath.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache');
              },
            }));

            app.use('/api', apiRouter);

            // SPA fallback (Express 5 wildcard syntax) — after API and static
            app.get('/*splat', (req, res) => {
              res.set('Cache-Control', 'no-cache').sendFile(path.join(dist, 'index.html'));
            });

            app.listen(3000);
          `),
          explanation: [
            'Hashed filenames change when content changes, so they can be cached for a year.',
            '`index.html` must revalidate so users pick up new bundle names after a deploy.',
            '`fallthrough: false` avoids returning HTML for a missing `.js` file (which causes confusing MIME errors).',
          ],
        }),
        code({
          title: 'Responses',
          language: 'http',
          code: 'GET /assets/app.3f9a1c.js HTTP/1.1\n\nGET /assets/app.3f9a1c.js HTTP/1.1\nIf-None-Match: W/"1a2b-18c3f"\n\nGET /settings/profile HTTP/1.1',
          expectedOutput: 'HTTP/1.1 200 OK\nCache-Control: public, max-age=31536000, immutable\nETag: W/"1a2b-18c3f"\nContent-Type: application/javascript; charset=UTF-8\n\n(file bytes)\n\nHTTP/1.1 304 Not Modified\nCache-Control: public, max-age=31536000, immutable\nETag: W/"1a2b-18c3f"\n\nHTTP/1.1 200 OK\nCache-Control: no-cache\nContent-Type: text/html; charset=UTF-8\n\n<!doctype html>...',
          explanation: [
            'Second request: the browser sent the ETag; the server answers 304 with no body.',
            'Client-side routes like `/settings/profile` get `index.html` via the fallback.',
          ],
        }),
      ),
      section('real-world', 'Real-world setup',
        bullets(
          'In production, put a CDN or Nginx in front for static files; Node then mostly serves APIs.',
          'Register static before heavy middleware (sessions, body parsers) to avoid wasted work.',
          'Use `res.sendFile` with `root` option or `res.download` for single files; validate any user-supplied filename.',
        ),
      ),
      section('mistakes', 'Common mistakes',
        code({
          title: 'Wrong vs right: relative paths',
          code: dedent(`
            // ✗ relative to process.cwd(), breaks when started from another folder
            app.use(express.static('public'));

            // ✓ absolute path relative to this file
            app.use(express.static(path.join(__dirname, 'public')));
          `),
        }),
        bullets(
          'Long `max-age` on `index.html` — users stay on old builds after deploys.',
          'Serving the project root (`express.static(__dirname)`) — exposes source and `.env` if dotfiles allowed.',
          'Express 4 SPA fallback `app.get("*")` breaks in Express 5 — use `/*splat`.',
        ),
      ),
      section('interview', 'Interview angle',
        interviewTip('Explain cache busting: hashed filenames + `immutable` for assets, `no-cache` for HTML, ETag/304 for revalidation. Mention offloading static to a CDN.'),
      ),
      section('practice', 'Practice',
        text('Serve a `downloads/` folder where `.pdf` files get `Content-Disposition: attachment` via `setHeaders`, and check with `curl -I` that a second request with `If-None-Match` returns 304.'),
      ),
      section('summary', 'Summary',
        bullets(
          '`express.static` = built-in, safe file serving with ETag and Range.',
          'Absolute paths with `path.join(__dirname, ...)`.',
          'Hashed assets: 1 year + immutable; HTML: no-cache.',
          'SPA fallback after API routes, using `/*splat` in Express 5.',
        ),
      ),
    ],
    revisionNotes: [
      '`express.static(root, { maxAge, immutable, etag, index, dotfiles, fallthrough, setHeaders })`.',
      'Hashed assets → `max-age=31536000, immutable`; HTML → `no-cache`.',
      '`no-cache` = revalidate; `no-store` = never store.',
      'ETag/If-None-Match → 304 Not Modified (no body).',
      'Express 5 static: dotfiles ignored by default; SPA fallback `/*splat`.',
    ],
    quiz: [
      {
        kind: 'scenario', difficulty: 'intermediate',
        prompt: 'After each deploy, some users get a blank page because their browser loads old JS bundle names that no longer exist. Which caching setup fixes it?',
        options: [
          'Cache index.html for 1 year',
          'Serve index.html with `no-cache` and hashed assets with long `max-age` + `immutable`',
          'Disable ETags',
          'Use `no-store` for all JS files',
        ],
        answer: 1,
        explanation: 'HTML must be revalidated so it references the new hashed files; the hashed files themselves never change and can be cached forever. `no-store` for JS wastes bandwidth.',
      },
      {
        kind: 'mcq', difficulty: 'beginner',
        prompt: 'What does a 304 response from express.static mean?',
        options: ['File moved permanently', 'The client\'s cached copy (by ETag/Last-Modified) is still valid; no body sent', 'Partial content', 'File is forbidden'],
        answer: 1,
        explanation: '304 Not Modified tells the client to use its cached copy. 206 would be partial content (Range).',
      },
    ],
    interview: [
      {
        category: 'express-backend', kind: 'concept', difficulty: 'beginner', topic: 'Static files',
        question: 'How do you serve static files in Express, and how do you make it safe?',
        shortAnswer: 'Use the built-in `express.static(path.join(__dirname, "public"))`; it prevents path traversal and ignores dotfiles by default, and you should only point it at a dedicated public folder.',
        detailedAnswer: [
          'Mount with or without a prefix: `app.use("/static", express.static(dir))`.',
          'Never serve the project root — source code and `.env` could leak.',
          'Use absolute paths so the working directory does not matter.',
          'Put it early in the stack and behind a CDN in production.',
        ],
        followUp: 'What does `fallthrough: false` change?',
        trap: 'Using a relative path that depends on where `node` was started.',
      },
      {
        category: 'express-backend', kind: 'concept', difficulty: 'intermediate', topic: 'HTTP caching',
        question: 'What Cache-Control strategy would you use for a single-page app served by Express?',
        shortAnswer: 'Content-hashed assets get `public, max-age=31536000, immutable`; `index.html` gets `no-cache` so browsers revalidate it (ETag → 304) and always discover the latest asset names.',
        detailedAnswer: [
          'Hash in filename = cache busting; a new build produces new URLs.',
          '`immutable` tells browsers not to revalidate even on reload.',
          '`no-cache` still allows caching, but requires revalidation every time.',
          'API responses usually `no-store` or `private` depending on content.',
          'A CDN honours the same headers; purge only HTML on deploy.',
        ],
        followUp: 'What is the difference between no-cache and no-store?',
        trap: 'Thinking `no-cache` disables caching entirely.',
      },
    ],
  },

  // ───────────────────────────────────────────────────────────
  'rest-api-development': {
    summary: 'A production-ready Express REST API combines layered structure, validation, centralized errors, consistent responses, security middleware and tests — shown here as one small, complete "tasks" API.',
    topics: ['REST API', 'layered architecture', 'CRUD', 'status codes', 'pagination', 'helmet', 'cors', 'supertest', 'dependency injection'],
    sections: [
      section('introduction', undefined,
        text('This lesson ties the module together: a small but complete `tasks` API with routes, controllers, services, a repository, validation, error handling and tests.'),
      ),
      section('definition', 'What "production-ready" means here',
        bullets(
          'Resources and verbs: `GET/POST /tasks`, `GET/PATCH/DELETE /tasks/:id`.',
          'Correct status codes: 200, 201 + Location, 204, 400, 401, 404, 409.',
          'Layered: route → controller → service → repository.',
          'Input validated with zod (third-party); errors as `{ error: { code, message } }`.',
          'Security: `helmet` and `cors` (third-party), body size limit, no `X-Powered-By`.',
        ),
        table('Endpoints', ['Method', 'Path', 'Success', 'Errors'], [
          ['GET', '`/api/v1/tasks?page=&limit=&done=`', '200 `{ data, page, limit }`', '400'],
          ['POST', '`/api/v1/tasks`', '201 + `Location`', '400'],
          ['GET', '`/api/v1/tasks/:id`', '200', '400, 404'],
          ['PATCH', '`/api/v1/tasks/:id`', '200', '400, 404'],
          ['DELETE', '`/api/v1/tasks/:id`', '204', '404'],
        ]),
      ),
      section('visual', 'Architecture',
        diagram('layered-architecture', 'Each layer depends only on the one below it.'),
      ),
      section('internals', 'Request journey for POST /api/v1/tasks',
        flow([
          'helmet / cors / express.json',
          'tasks router: validate({ body })',
          'controller.create',
          'service.create (business rules)',
          'repository.insert',
          '201 + Location',
        ], { direction: 'horizontal' }),
      ),
      section('example', 'The complete API',
        code({
          title: 'Folder structure',
          language: 'text',
          code: dedent(`
            src/
              app.js  server.js  container.js
              errors.js
              middleware/validate.js  middleware/errorHandler.js
              tasks/tasks.schemas.js  tasks/tasks.repository.js
              tasks/tasks.service.js  tasks/tasks.controller.js  tasks/tasks.routes.js
              tasks/tasks.test.js
          `),
        }),
        code({
          title: 'tasks/tasks.repository.js (in-memory; swap for SQL later)',
          code: dedent(`
            function createTasksRepository() {
              const rows = new Map();
              let nextId = 1;
              return {
                async list({ offset, limit, done }) {
                  let all = [...rows.values()];
                  if (done !== undefined) all = all.filter((t) => t.done === done);
                  return all.slice(offset, offset + limit);
                },
                async findById(id) { return rows.get(id) ?? null; },
                async insert(data) {
                  const task = { id: nextId++, done: false, createdAt: new Date().toISOString(), ...data };
                  rows.set(task.id, task);
                  return task;
                },
                async update(id, patch) {
                  const task = rows.get(id);
                  if (!task) return null;
                  Object.assign(task, patch);
                  return task;
                },
                async remove(id) { return rows.delete(id); },
              };
            }
            module.exports = { createTasksRepository };
          `),
        }),
        code({
          title: 'tasks/tasks.schemas.js + tasks.service.js',
          code: dedent(`
            // tasks.schemas.js
            const { z } = require('zod');
            const idParam = z.object({ id: z.coerce.number().int().positive() });
            const listQuery = z.object({
              page: z.coerce.number().int().min(1).default(1),
              limit: z.coerce.number().int().min(1).max(100).default(20),
              done: z.enum(['true', 'false']).transform((v) => v === 'true').optional(),
            });
            const createTask = z.object({ title: z.string().trim().min(1).max(200) });
            const updateTask = z.object({ title: z.string().trim().min(1).max(200), done: z.boolean() })
              .partial()
              .refine((v) => Object.keys(v).length > 0, 'At least one field is required');
            module.exports = { idParam, listQuery, createTask, updateTask };

            // tasks.service.js
            const { NotFoundError } = require('../errors');
            function createTasksService({ tasksRepo }) {
              const getOrThrow = async (id) => {
                const task = await tasksRepo.findById(id);
                if (!task) throw new NotFoundError('Task ' + id + ' not found');
                return task;
              };
              return {
                list: ({ page, limit, done }) => tasksRepo.list({ offset: (page - 1) * limit, limit, done }),
                get: getOrThrow,
                create: ({ title }) => tasksRepo.insert({ title }),
                async update(id, patch) { await getOrThrow(id); return tasksRepo.update(id, patch); },
                async remove(id) { await getOrThrow(id); await tasksRepo.remove(id); },
              };
            }
            module.exports = { createTasksService };
          `),
        }),
        code({
          title: 'tasks/tasks.controller.js + tasks.routes.js',
          code: dedent(`
            // tasks.controller.js
            function createTasksController(service) {
              return {
                async list(req, res) {
                  const q = res.locals.query;
                  res.json({ data: await service.list(q), page: q.page, limit: q.limit });
                },
                async get(req, res) { res.json({ data: await service.get(res.locals.params.id) }); },
                async create(req, res) {
                  const task = await service.create(req.body);
                  res.status(201).location(req.baseUrl + '/' + task.id).json({ data: task });
                },
                async update(req, res) { res.json({ data: await service.update(res.locals.params.id, req.body) }); },
                async remove(req, res) { await service.remove(res.locals.params.id); res.sendStatus(204); },
              };
            }
            module.exports = { createTasksController };

            // tasks.routes.js
            const express = require('express');
            const { validate } = require('../middleware/validate');
            const s = require('./tasks.schemas');
            function createTasksRouter(ctrl) {
              const r = express.Router();
              r.get('/', validate({ query: s.listQuery }), ctrl.list);
              r.post('/', validate({ body: s.createTask }), ctrl.create);
              r.get('/:id', validate({ params: s.idParam }), ctrl.get);
              r.patch('/:id', validate({ params: s.idParam, body: s.updateTask }), ctrl.update);
              r.delete('/:id', validate({ params: s.idParam }), ctrl.remove);
              return r;
            }
            module.exports = { createTasksRouter };
          `),
        }),
        code({
          title: 'container.js + app.js',
          code: dedent(`
            // container.js — composition root
            const { createTasksRepository } = require('./tasks/tasks.repository');
            const { createTasksService } = require('./tasks/tasks.service');
            const { createTasksController } = require('./tasks/tasks.controller');
            const { createTasksRouter } = require('./tasks/tasks.routes');
            function buildContainer({ tasksRepo = createTasksRepository() } = {}) {
              const service = createTasksService({ tasksRepo });
              return { tasksRouter: createTasksRouter(createTasksController(service)) };
            }
            module.exports = { buildContainer };

            // app.js
            const express = require('express');
            const helmet = require('helmet');
            const cors = require('cors');
            const { buildContainer } = require('./container');
            const { notFound, errorHandler } = require('./middleware/errorHandler');
            function createApp(container = buildContainer()) {
              const app = express();
              app.disable('x-powered-by');
              app.use(helmet());
              app.use(cors({ origin: ['https://app.example.com'] }));
              app.use(express.json({ limit: '50kb' }));
              app.get('/health', (req, res) => res.json({ status: 'ok' }));
              app.use('/api/v1/tasks', container.tasksRouter);
              app.use(notFound);
              app.use(errorHandler);
              return app;
            }
            module.exports = { createApp };
          `),
          explanation: [
            'No try/catch anywhere: Express 5 forwards service errors (NotFoundError) to `errorHandler`.',
            'Swapping the in-memory repository for a Postgres one only changes `container.js`.',
          ],
        }),
        code({
          title: 'A session with the API',
          language: 'http',
          code: 'POST /api/v1/tasks HTTP/1.1\nContent-Type: application/json\n\n{"title":"Write tests"}\n\nPATCH /api/v1/tasks/1 HTTP/1.1\nContent-Type: application/json\n\n{"done":true}\n\nGET /api/v1/tasks?done=true HTTP/1.1\n\nGET /api/v1/tasks/abc HTTP/1.1\n\nDELETE /api/v1/tasks/1 HTTP/1.1\n\nGET /api/v1/tasks/1 HTTP/1.1',
          expectedOutput: 'HTTP/1.1 201 Created\nLocation: /api/v1/tasks/1\n{"data":{"id":1,"done":false,"createdAt":"2026-11-08T10:00:00.000Z","title":"Write tests"}}\n\nHTTP/1.1 200 OK\n{"data":{"id":1,"done":true,"createdAt":"2026-11-08T10:00:00.000Z","title":"Write tests"}}\n\nHTTP/1.1 200 OK\n{"data":[{"id":1,"done":true,"createdAt":"2026-11-08T10:00:00.000Z","title":"Write tests"}],"page":1,"limit":20}\n\nHTTP/1.1 400 Bad Request\n{"error":{"code":"VALIDATION_FAILED","details":[{"in":"params","path":"id","message":"Invalid input: expected number, received NaN"}]}}\n\nHTTP/1.1 204 No Content\n\nHTTP/1.1 404 Not Found\n{"error":{"code":"NOT_FOUND","message":"Task 1 not found","requestId":"r-6"}}',
          explanation: [
            '201 includes a `Location` header built from `req.baseUrl`.',
            'Invalid id → 400 from validation, before any service code runs.',
            'After DELETE, the same id returns 404 from the service.',
            'Timestamps and request ids vary per run; zod messages vary slightly by version.',
          ],
        }),
        code({
          title: 'tasks/tasks.test.js (node:test + supertest)',
          code: dedent(`
            const { test } = require('node:test');
            const assert = require('node:assert/strict');
            const request = require('supertest');
            const { createApp } = require('../app');

            test('create then fetch a task', async () => {
              const app = createApp();
              const created = await request(app).post('/api/v1/tasks').send({ title: 'A' }).expect(201);
              assert.equal(created.headers.location, '/api/v1/tasks/1');
              const got = await request(app).get('/api/v1/tasks/1').expect(200);
              assert.equal(got.body.data.title, 'A');
            });

            test('rejects empty title', async () => {
              const res = await request(createApp()).post('/api/v1/tasks').send({ title: '' }).expect(400);
              assert.equal(res.body.error.code, 'VALIDATION_FAILED');
            });
          `),
          expectedOutput: '✔ create then fetch a task (35ms)\n✔ rejects empty title (4ms)\nℹ tests 2\nℹ pass 2\nℹ fail 0',
          explanation: [
            '`node --test` is Node core; `supertest` (third-party) starts the app on an ephemeral port per request.',
            'A fresh `createApp()` per test gives a fresh in-memory repository — no shared state.',
          ],
        }),
      ),
      section('real-world', 'Taking it further',
        bullets(
          'Replace the repository with Postgres (parameterized queries) — see the database module.',
          'Add auth (`requireAuth`) and ownership checks: tasks belong to `req.user.id`.',
          'Rate limiting, request logging with ids, OpenAPI docs generated from zod schemas.',
          'Graceful shutdown and health/readiness endpoints for deployment.',
        ),
      ),
      section('mistakes', 'Common mistakes',
        bullets(
          'Returning 200 for everything and putting `success: false` in the body.',
          'POST without `Location` or returning 200 instead of 201.',
          'DELETE returning the deleted object with 204 (204 must have no body).',
          'Validation errors returned as 500 because the service threw a generic `Error`.',
          'Using PUT for partial updates — PUT replaces the whole resource; PATCH modifies parts.',
        ),
        code({
          title: 'Wrong vs right: status codes',
          code: dedent(`
            // ✗
            res.status(200).json({ success: false, error: 'not found' });

            // ✓
            throw new NotFoundError('Task 9 not found'); // → 404 via error handler
          `),
        }),
      ),
      section('interview', 'Interview angle',
        interviewTip('Be ready to whiteboard this exact structure. Walk one request through every layer, name each status code, and explain how you would test it without a real port or database.'),
      ),
      section('practice', 'Practice',
        steps(
          'Add `?sort=createdAt|-createdAt` with a whitelist in the schema.',
          'Add `requireAuth` and an `ownerId` on tasks; return 404 (not 403) for other users\' tasks to avoid leaking existence.',
          'Write tests for PATCH with an empty body (400) and for DELETE twice (204 then 404).',
        ),
      ),
      section('summary', 'Summary',
        bullets(
          'Routes declare; controllers translate; services decide; repositories store.',
          'Validation in middleware; errors as typed exceptions; one error handler.',
          'Correct status codes and a consistent response envelope.',
          'Composition root + app factory make the API testable with supertest.',
        ),
      ),
    ],
    revisionNotes: [
      'POST → 201 + Location; DELETE → 204 no body; PATCH = partial, PUT = replace.',
      'Layer flow: route → validate → controller → service → repository.',
      'Express 5: no try/catch in controllers; throw AppErrors.',
      'App factory + composition root = easy tests (supertest + node:test).',
      'helmet, cors, body limit, disable x-powered-by.',
    ],
    quiz: [
      {
        kind: 'mcq', difficulty: 'beginner',
        prompt: 'Which response is correct for a successful `DELETE /tasks/5`?',
        options: ['200 with `{ success: true }` is the only valid option', '204 No Content with no body', '201 Created', '202 with the deleted task in the body is required'],
        answer: 1,
        explanation: '204 is the common choice for deletions; it must not carry a body. 200 with a body is also acceptable, but 201 means a resource was created.',
      },
      {
        kind: 'scenario', difficulty: 'intermediate',
        prompt: 'Service code throws `new Error("Task not found")` and clients receive 500. What is the best fix?',
        options: [
          'Catch in the controller and send 404',
          'Throw a typed `NotFoundError` (AppError, statusCode 404) and let the central handler map it',
          'Return null from the service and check in every route',
          'Change the default error handler status to 404',
        ],
        answer: 1,
        explanation: 'Typed errors keep services HTTP-agnostic while giving the error handler enough information to choose the status.',
      },
      {
        kind: 'mcq', difficulty: 'intermediate',
        prompt: 'Why does the example pass a container into `createApp()`?',
        options: [
          'Express requires it',
          'So tests can inject fake or fresh dependencies (e.g. an in-memory repository) without touching production wiring',
          'To improve request throughput',
          'To enable HTTPS',
        ],
        answer: 1,
        explanation: 'Dependency injection via a composition root is about testability and swapping implementations; it has no runtime performance effect.',
      },
    ],
    interview: [
      {
        category: 'express-backend', kind: 'scenario', difficulty: 'advanced', topic: 'API design',
        question: 'Walk me through how you would build a production-ready REST endpoint in Express, from request to response.',
        shortAnswer: 'Global security and parsing middleware, a feature router with validation middleware, a thin controller, a service with business rules throwing typed errors, a repository for data access, and a central error handler that returns a consistent JSON shape — all wired in a composition root and covered by supertest tests.',
        detailedAnswer: [
          'Global: helmet, CORS allowlist, JSON body limit, request id/logging, rate limit.',
          'Router: auth where needed, zod/express-validator for params, query and body; strip unknown fields.',
          'Controller: call service, set 201 + Location / 204, shape DTO.',
          'Service: rules, transactions, domain errors; no HTTP objects.',
          'Repository: parameterized SQL, mapping rows.',
          'Errors: AppError mapping, 404 handler, generic 500, logs with request id; tests via app factory + supertest.',
        ],
        followUp: 'How would you add pagination and version the API later?',
        trap: 'Describing only route handlers with inline SQL and ad-hoc error responses.',
      },
      {
        category: 'express-backend', kind: 'concept', difficulty: 'intermediate', topic: 'Testing Express',
        question: 'How do you integration-test an Express app without starting it on a fixed port?',
        shortAnswer: 'Export the app (or an app factory) and use supertest, which binds it to an ephemeral port internally and lets you make HTTP requests and assert on status, headers and body.',
        detailedAnswer: [
          '`request(app).get("/x").expect(200)` — no `listen` in the app module.',
          'Use `node --test`, Jest or Vitest as the runner.',
          'Inject in-memory repositories or a test database via the factory.',
          'Reset state per test by creating a fresh app/container.',
          'Test error paths (400, 401, 404) as well as happy paths.',
        ],
        followUp: 'How would you test against a real database in CI?',
        trap: 'Starting the real server in tests and hitting `localhost:3000`, causing port clashes.',
      },
    ],
  },
};

export default content;
