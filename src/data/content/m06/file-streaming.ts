import type { ModuleContent } from '../../../types';
import { bullets, code, dedent, diagram, flow, interviewTip, section, steps, table, text } from '../helpers';

const content: Partial<ModuleContent> = {
  'practical-file-streaming': {
    summary: 'Real file-streaming tasks: serving downloads over node:http with correct headers, range requests, gzip, and saving uploads to disk with size limits and cleanup on abort.',
    topics: ['fs.createReadStream', 'fs.createWriteStream', 'Content-Length', 'Content-Disposition', 'Range requests', '206 Partial Content', 'gzip', 'upload to disk', 'client abort'],
    sections: [
      section('introduction', undefined,
        text('Theory meets practice: here are the patterns you will actually write — stream a file to an HTTP client, stream an upload to disk, compress on the fly — and how to keep them safe.'),
      ),
      section('definition', 'Building blocks',
        table('File stream options', ['Option', 'Applies to', 'Use'], [
          ['`start`, `end` (inclusive)', 'createReadStream', 'Read a byte range (Range requests, tailing logs)'],
          ['`highWaterMark`', 'both', 'Chunk size / buffer threshold'],
          ['`encoding`', 'createReadStream', 'Emit strings instead of Buffers'],
          ['`flags: \'a\'`', 'createWriteStream', 'Append instead of truncate'],
          ['`flags: \'wx\'`', 'createWriteStream', 'Fail if the file already exists'],
        ]),
      ),
      section('why', 'Why stream files over HTTP',
        bullets(
          'Constant memory per download, regardless of file size.',
          'The first bytes leave immediately — better time to first byte.',
          'Backpressure adapts to each client\'s network speed.',
        ),
      ),
      section('internals', 'Download flow',
        diagram('request-response', 'The handler stats the file, writes headers, then pipes the read stream into the response.'),
        steps(
          '`fs.promises.stat` → size and mtime (404 if missing).',
          'Set `Content-Type`, `Content-Length`, optionally `Content-Disposition: attachment`.',
          '`pipeline(fs.createReadStream(path), res, cb)`.',
          'On error before headers are sent → 500; after → just destroy (the client sees a truncated response).',
        ),
      ),
      section('example', 'Download and upload handlers',
        code({
          title: 'Serving a file download',
          code: dedent(`
            const http = require('node:http');
            const fs = require('node:fs');
            const path = require('node:path');
            const { pipeline } = require('node:stream');

            const FILES = path.resolve('files');

            http.createServer(async (req, res) => {
              const url = new URL(req.url, 'http://localhost');
              const name = path.basename(url.pathname); // blocks ../ traversal
              const file = path.join(FILES, name);
              try {
                const { size } = await fs.promises.stat(file);
                res.writeHead(200, {
                  'Content-Type': 'application/octet-stream',
                  'Content-Length': size,
                  'Content-Disposition': 'attachment; filename="' + name + '"',
                });
                pipeline(fs.createReadStream(file), res, (err) => {
                  if (err) console.error('stream failed', err.code);
                });
              } catch {
                res.writeHead(404, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Not found' }));
              }
            }).listen(3000, () => console.log('listening on 3000'));
          `),
          expectedOutput: 'listening on 3000',
          explanation: [
            '`path.basename` prevents `GET /../../etc/passwd` path traversal.',
            '`Content-Length` from `stat` lets clients show progress.',
            '`pipeline` closes the file if the client disconnects.',
          ],
        }),
        code({
          title: 'Range request (video seeking)',
          language: 'http',
          code: dedent(`
            GET /files/movie.mp4 HTTP/1.1
            Range: bytes=1000-1999

            HTTP/1.1 206 Partial Content
            Content-Range: bytes 1000-1999/50000
            Content-Length: 1000
            Accept-Ranges: bytes
          `),
          explanation: ['Serve it with `fs.createReadStream(file, { start: 1000, end: 1999 })` — `end` is inclusive.', 'Invalid ranges → `416 Range Not Satisfiable`.'],
        }),
        code({
          title: 'Saving an upload with a size limit',
          code: dedent(`
            const fs = require('node:fs');
            const { Transform } = require('node:stream');
            const { pipeline } = require('node:stream/promises');

            function limit(maxBytes) {
              let seen = 0;
              return new Transform({
                transform(chunk, enc, cb) {
                  seen += chunk.length;
                  if (seen > maxBytes) return cb(Object.assign(new Error('Too large'), { status: 413 }));
                  cb(null, chunk);
                },
              });
            }

            async function handleUpload(req, res) {
              const dest = 'uploads/' + crypto.randomUUID();
              try {
                await pipeline(req, limit(10 * 1024 * 1024), fs.createWriteStream(dest, { flags: 'wx' }));
                res.writeHead(201, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ id: dest.split('/')[1] }));
              } catch (err) {
                await fs.promises.rm(dest, { force: true }); // remove partial file
                res.writeHead(err.status ?? 500).end();
              }
            }
          `),
          explanation: [
            'The size check runs while streaming — no need to buffer 10 MB to find out it is too big.',
            'Respond 201 only after the write stream finished (pipeline resolved).',
            'On any error (abort, too large, disk) the partial file is deleted.',
            '`crypto.randomUUID()` is a global in Node 19+; import from `node:crypto` on older versions.',
          ],
        }),
      ),
      section('real-world', 'Real-world: gzip when the client accepts it',
        code({
          title: 'Content negotiation for compression',
          code: dedent(`
            const zlib = require('node:zlib');
            const accepts = req.headers['accept-encoding'] ?? '';
            if (/\\bgzip\\b/.test(accepts)) {
              res.writeHead(200, { 'Content-Type': 'text/csv', 'Content-Encoding': 'gzip', Vary: 'Accept-Encoding' });
              pipeline(fs.createReadStream('report.csv'), zlib.createGzip(), res, onDone);
            } else {
              res.writeHead(200, { 'Content-Type': 'text/csv' });
              pipeline(fs.createReadStream('report.csv'), res, onDone);
            }
          `),
          explanation: ['Do not send `Content-Length` with on-the-fly gzip (size unknown) — Node uses chunked transfer encoding.', '`Vary: Accept-Encoding` keeps caches correct.'],
        }),
      ),
      section('mistakes', 'Common mistakes',
        bullets(
          'Joining user input into paths without `basename`/validation → path traversal.',
          'Responding success on `req` `end` instead of after the file write finished.',
          'Leaving partial files after aborted uploads.',
          'Setting `Content-Length` and then gzipping (length mismatch).',
          'Calling `res.writeHead` in the error handler after headers were already sent (`res.headersSent`).',
        ),
      ),
      section('interview', 'Interview angle',
        interviewTip('A strong answer to "serve a large file" mentions: stat for headers, `pipeline`, path traversal protection, client abort handling, and optionally Range/206.'),
      ),
      section('practice', 'Practice',
        text('Add Range support to the download handler: parse `bytes=start-end`, respond 206 with `Content-Range`, and 416 for invalid ranges.'),
      ),
      section('summary', 'Summary',
        bullets('stat → headers → pipeline(readStream, res).', 'Validate file names; never trust the path.', 'Uploads: pipeline(req, limiter, writeStream) and delete on failure.', 'Range requests use start/end (inclusive) and 206.'),
      ),
    ],
    revisionNotes: [
      'createReadStream({ start, end }) — end inclusive.',
      'Range → 206 + Content-Range; bad range → 416.',
      'Content-Disposition: attachment for downloads.',
      'Size-limit uploads while streaming → 413.',
      'Delete partial files on error; respond after write finish.',
      'gzip on the fly → no Content-Length, add Vary: Accept-Encoding.',
    ],
    quiz: [
      {
        kind: 'scenario', difficulty: 'intermediate',
        prompt: 'An upload endpoint responds 201 as soon as req emits "end", but sometimes the file on disk is incomplete when the client immediately downloads it. Fix?',
        options: ['Add a 1-second delay', "Respond after the write stream finishes (pipeline promise resolves / 'finish' event)", 'Use fs.writeFileSync', "Listen for 'drain'"],
        answer: 1,
        explanation: "The request ending only means all bytes were received; the write stream may still be flushing. Wait for pipeline/'finish'.",
      },
      {
        kind: 'find-bug', difficulty: 'intermediate',
        prompt: 'What is the security bug?',
        code: "const file = path.join('files', url.searchParams.get('name'));\npipeline(fs.createReadStream(file), res, done);",
        options: ['pipeline is unsafe', 'Path traversal: name=../../.env reads files outside the folder', 'Missing highWaterMark', 'searchParams is undefined'],
        answer: 1,
        explanation: 'path.join resolves "..", so a crafted name escapes the directory. Use path.basename or verify the resolved path starts with the base directory.',
      },
      {
        kind: 'mcq', difficulty: 'beginner',
        prompt: 'Which status code answers a valid Range request?',
        options: ['200 OK', '204 No Content', '206 Partial Content', '416 Range Not Satisfiable'],
        answer: 2,
        explanation: '206 with Content-Range answers a satisfiable range. 416 is for ranges outside the file.',
      },
    ],
    interview: [
      {
        category: 'nodejs', kind: 'scenario', difficulty: 'intermediate', topic: 'File streaming',
        question: 'How would you implement a file download endpoint for large files using only node:http?',
        shortAnswer: 'Validate the requested name, stat the file for size, write Content-Type/Content-Length/Content-Disposition headers, then pipeline(fs.createReadStream(file), res) with an error callback.',
        detailedAnswer: [
          'Prevent path traversal (`path.basename` or prefix check on the resolved path).',
          '404 if `stat` fails; 500 if streaming fails before headers are sent.',
          '`pipeline` gives backpressure and destroys the file stream if the client aborts.',
          'Optional: Range/206 for resumable downloads, ETag/Last-Modified for caching, gzip for text.',
        ],
        followUp: 'How do you support resumable downloads?',
        trap: 'Using fs.readFile and res.end(buffer) — fine for 10 KB, fatal for 4 GB.',
      },
      {
        category: 'nodejs', kind: 'scenario', difficulty: 'advanced', topic: 'Uploads',
        question: 'Design a streaming upload endpoint that enforces a 10 MB limit, never buffers the whole file and cleans up after aborted uploads.',
        shortAnswer: 'Reject early if Content-Length exceeds the limit, then pipeline(req, byteCountingTransform, createWriteStream(tempPath)); the transform errors with 413 when bytes exceed the limit, and the catch block deletes the temp file and responds with the right status.',
        detailedAnswer: [
          'Check `Content-Length` first (fast 413), but still count bytes — the header can lie or be absent (chunked).',
          'Write to a unique temp path (`randomUUID`, flag `wx`), then rename into place after success (atomic).',
          'Client abort → `req` errors / premature close → pipeline rejects → unlink temp file.',
          'Respond only after pipeline resolves.',
          'For multipart uploads use a streaming parser (e.g. busboy — third-party).',
        ],
        followUp: 'Why rename from a temp file instead of writing to the final path?',
        trap: 'Trusting the Content-Length header as the only limit.',
      },
    ],
  },

  'streaming-large-files': {
    summary: 'Process files larger than RAM — multi-GB logs and CSVs — line by line with readline or Transform streams, keeping memory flat and respecting backpressure end to end.',
    topics: ['large files', 'readline', 'createInterface', 'line-by-line', 'memory usage', 'kMaxLength', 'CSV processing', 'aggregation'],
    sections: [
      section('introduction', undefined,
        text('A 20 GB access log cannot be loaded with `readFile` — it exceeds the max Buffer size and your RAM. Streaming lets a 50 MB process handle it.'),
      ),
      section('definition', 'Tools for large files',
        table('Approaches', ['Approach', 'Good for'], [
          ['`readline.createInterface({ input })` + `for await`', 'Line-by-line text (logs, CSV without quoted newlines)'],
          ['Custom line-splitting Transform', 'Lines inside a bigger pipeline'],
          ['Raw chunk processing', 'Byte counting, hashing, copying'],
          ['Third-party streaming parsers (csv-parse, stream-json)', 'Quoted CSV, huge JSON documents'],
        ]),
      ),
      section('why', 'Why not readFile',
        bullets(
          'Buffers have a max length (`buffer.constants.MAX_LENGTH`, ~4 GB on 64-bit for recent versions) and strings have a smaller limit (~512 MB–1 GB) — `readFile(path, \'utf8\')` on a big file throws `ERR_STRING_TOO_LONG`.',
          'Even under the limits, memory = file size × concurrent jobs.',
          'Streaming gives results progressively and allows early exit.',
        ),
      ),
      section('internals', 'Memory profile',
        bullets(
          'Read stream: ~64 KiB buffered.',
          'readline: holds one partial line plus the queue of lines not yet consumed.',
          'Your aggregation state: keep it small (counters, maps of bounded size) — that is usually where memory goes.',
        ),
        flow(['File (20 GB)', 'createReadStream: 64 KiB chunks', 'readline: lines', 'aggregate: Map counts', 'result: small JSON'], { title: 'Constant-memory processing', direction: 'horizontal' }),
      ),
      section('example', 'Processing a huge log',
        code({
          title: 'Count status codes in a big access log',
          code: dedent(`
            const fs = require('node:fs');
            const readline = require('node:readline');

            async function statusCounts(path) {
              const rl = readline.createInterface({
                input: fs.createReadStream(path),
                crlfDelay: Infinity,
              });
              const counts = {};
              for await (const line of rl) {
                const status = line.split(' ')[8]; // common log format
                counts[status] = (counts[status] ?? 0) + 1;
              }
              return counts;
            }

            statusCounts('access.log').then((c) => console.log(c));
          `),
          expectedOutput: "{ '200': 1200000, '404': 3400, '500': 12 }",
          explanation: [
            '`crlfDelay: Infinity` treats `\\r\\n` as a single line break.',
            'Memory is flat: only the counters grow, and there are few distinct statuses.',
            'Output shown is illustrative for a sample log.',
          ],
        }),
        code({
          title: 'Filter a big CSV into a smaller one with backpressure',
          code: dedent(`
            const fs = require('node:fs');
            const readline = require('node:readline');
            const { once } = require('node:events');

            async function filterCsv(src, dest, country) {
              const rl = readline.createInterface({ input: fs.createReadStream(src), crlfDelay: Infinity });
              const out = fs.createWriteStream(dest);
              let kept = 0;
              for await (const line of rl) {
                if (line.split(',')[2] !== country) continue;
                kept++;
                if (!out.write(line + '\\n')) await once(out, 'drain');
              }
              out.end();
              await once(out, 'finish');
              console.log('kept', kept);
            }
          `),
          expectedOutput: 'kept 48213',
          explanation: ['Each write respects backpressure.', 'The loop only pulls the next line after the write is accepted.', 'Count is illustrative.'],
        }),
        code({
          title: 'Measuring memory while streaming',
          code: dedent(`
            const fs = require('node:fs');
            let bytes = 0;
            const t = setInterval(() => {
              const m = process.memoryUsage();
              console.log('rss MB', Math.round(m.rss / 1e6), 'read MB', Math.round(bytes / 1e6));
            }, 1000);
            fs.createReadStream('20gb.log')
              .on('data', (c) => { bytes += c.length; })
              .on('end', () => clearInterval(t));
          `),
          explanation: ['RSS stays roughly constant (tens of MB) while `read MB` climbs into the thousands.'],
        }),
      ),
      section('real-world', 'Real-world jobs',
        bullets(
          'Nightly ETL: S3 object stream → gunzip → CSV parse → batch inserts.',
          'Log analytics: count errors per endpoint from rotated logs.',
          'Data export: DB cursor stream → CSV Transform → gzip → HTTP response.',
          'Use worker threads if per-line CPU work is heavy, to keep the event loop free.',
        ),
      ),
      section('mistakes', 'Common mistakes',
        bullets(
          'Collecting all lines in an array "to process later" — back to readFile memory.',
          'Unbounded aggregation maps (e.g. count per user id on billions of users).',
          'Splitting CSV on commas when fields contain quoted commas/newlines — use a real parser.',
          'Running CPU-heavy parsing on the main thread of an API server — move it to a worker or a separate process.',
        ),
      ),
      section('interview', 'Interview angle',
        interviewTip('For "process a 50 GB file", say: stream + readline/Transform, bounded aggregation, backpressure on outputs, and parallelism via byte-range splitting or worker threads if CPU-bound.'),
      ),
      section('practice', 'Practice',
        text('Generate a 1 GB file of random log lines, then write a script that finds the top 10 most frequent IPs. Keep RSS under 100 MB and report the runtime.'),
      ),
      section('summary', 'Summary',
        bullets('Never readFile unbounded files.', '`readline` + `for await` for line processing.', 'Respect `write()` backpressure on outputs.', 'Keep aggregation state bounded.'),
      ),
    ],
    revisionNotes: [
      'readline.createInterface({ input, crlfDelay: Infinity }) + for await.',
      'Max string length → ERR_STRING_TOO_LONG for huge readFile(…, "utf8").',
      'Memory ≈ hwm + partial line + your aggregation state.',
      'Await drain on output writes.',
      'CPU-heavy per-line work → worker threads.',
    ],
    quiz: [
      {
        kind: 'mcq', difficulty: 'beginner',
        prompt: 'Which built-in module reads a stream line by line?',
        options: ['node:lines', 'node:readline', 'node:string_decoder', 'node:fs/lines'],
        answer: 1,
        explanation: 'readline.createInterface({ input }) emits lines and supports for await. string_decoder only decodes bytes to text.',
      },
      {
        kind: 'scenario', difficulty: 'advanced',
        prompt: 'A job parses a 30 GB NDJSON file with readline but takes 4 hours; the CPU is pegged at 100% on one core while disk usage is low. Best improvement?',
        options: ['Increase highWaterMark to 10 MB', 'Split the file into byte ranges and process ranges in parallel worker threads (aligning to line boundaries)', 'Switch to fs.readFile', 'Use .pipe() instead of for await'],
        answer: 1,
        explanation: 'The job is CPU-bound (JSON.parse), so parallelism across cores helps. Bigger chunks do not reduce parse work; readFile cannot even load the file.',
      },
    ],
    interview: [
      {
        category: 'nodejs', kind: 'scenario', difficulty: 'advanced', topic: 'Large files',
        question: 'How would you process a 50 GB CSV file in Node.js on a machine with 2 GB of RAM?',
        shortAnswer: 'Stream it: createReadStream → a streaming CSV parser (or readline for simple CSV) → processing with bounded state → outputs written with backpressure, optionally parallelised across worker threads by byte range.',
        detailedAnswer: [
          'readFile is impossible (max string/Buffer size) and would exceed RAM anyway.',
          'Use `for await` or `pipeline` so each stage pulls only what it can handle.',
          'Keep aggregation bounded (counters, top-K heaps), or spill to a DB.',
          'Batch DB writes (e.g. 1,000 rows) and await each batch.',
          'CPU-bound parsing: split by byte ranges aligned to newlines and use worker threads.',
          'Make it resumable: record the byte offset processed so a crash can restart with `start`.',
        ],
        followUp: 'How do you handle quoted fields that contain newlines?',
        trap: "Answering 'increase --max-old-space-size' — Buffers are off-heap and the file is still larger than RAM.",
      },
      {
        category: 'nodejs', kind: 'concept', difficulty: 'intermediate', topic: 'Large files',
        question: "What happens if you call fs.readFile on a 6 GB file with 'utf8' encoding?",
        shortAnswer: "It fails: the data exceeds the maximum string length (and possibly the maximum Buffer length), so Node throws an error such as ERR_STRING_TOO_LONG or ERR_FS_FILE_TOO_LARGE instead of returning the content.",
        detailedAnswer: [
          'V8 strings max out around 512 MB–1 GB characters depending on version.',
          'Buffers max out at `buffer.constants.MAX_LENGTH` (several GB on 64-bit).',
          'readFile for files over 2 GiB historically throws `ERR_FS_FILE_TOO_LARGE`.',
          'Even smaller files multiply memory under concurrency — stream instead.',
        ],
        followUp: 'Where does Buffer memory show up in process.memoryUsage()?',
        trap: 'Saying it works but is slow.',
      },
    ],
  },
};

export default content;
