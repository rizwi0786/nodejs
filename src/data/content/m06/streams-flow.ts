import type { ModuleContent } from '../../../types';
import { bullets, code, dedent, diagram, flow, interviewTip, note, section, steps, table, text } from '../helpers';

const content: Partial<ModuleContent> = {
  piping: {
    summary: 'Connect streams with stream.pipeline (or stream/promises pipeline), which forwards errors, applies backpressure and destroys every stream on failure; plain .pipe() handles backpressure but not errors or cleanup.',
    topics: ['pipe', 'pipeline', 'stream/promises', 'error propagation', 'cleanup', 'AbortSignal', 'finished'],
    sections: [
      section('introduction', undefined,
        text('Piping connects the output of one stream to the input of the next. It is how you build `file → gzip → response` in one line — but which piping API you use decides whether errors leak.'),
      ),
      section('definition', 'pipe vs pipeline',
        table('.pipe() vs pipeline()', ['', '`src.pipe(dest)`', '`pipeline(src, ...transforms, dest)`'], [
          ['Backpressure', 'Yes', 'Yes'],
          ['Error forwarding', '**No** — each stream needs its own `error` handler', 'Yes — one callback / rejected promise'],
          ['Cleanup on error', '**No** — other streams stay open (fd leaks)', 'Destroys all streams'],
          ['Async generators as stages', 'No', 'Yes'],
          ['Cancellation', 'Manual', '`{ signal }` option (AbortSignal)'],
          ['Return', 'The destination (chainable)', 'Last stream (callback form) / Promise (`stream/promises`)'],
        ]),
      ),
      section('why', 'Why pipeline exists',
        bullets(
          'With `a.pipe(b).pipe(c)`, if `a` errors, `b` and `c` are never closed. If `c` errors, `a` keeps reading.',
          'In HTTP servers, a client disconnecting mid-download errors the response; with `.pipe()` the file stream stays open → file-descriptor leak.',
          '`pipeline` (Node 10+) and its promise version (Node 15+) fix all of this.',
        ),
      ),
      section('internals', 'What pipeline does',
        steps(
          'Pipes each stream into the next (same backpressure as `.pipe()`).',
          'Uses `finished()` (eos) to watch every stream for errors and premature close.',
          'On the first error, calls `destroy(err)` on every stream.',
          'Calls the callback / settles the promise once, with the first error or success.',
        ),
        flow(['readable', 'gzip', 'writable', 'error anywhere → destroy all → reject once'], { title: 'pipeline', direction: 'horizontal' }),
      ),
      section('example', 'Using pipeline',
        code({
          title: 'Promise pipeline with a generator stage',
          code: dedent(`
            const fs = require('node:fs');
            const zlib = require('node:zlib');
            const { pipeline } = require('node:stream/promises');

            async function compressUpper(src, dest) {
              await pipeline(
                fs.createReadStream(src),
                async function* (source) {
                  for await (const chunk of source) yield chunk.toString().toUpperCase();
                },
                zlib.createGzip(),
                fs.createWriteStream(dest),
              );
              console.log('done');
            }
            compressUpper('in.txt', 'out.txt.gz').catch((err) => console.error('failed:', err.message));
          `),
          expectedOutput: 'done',
          explanation: [
            'An async generator function can be a Transform stage: it receives the previous stream as `source`.',
            'If `in.txt` does not exist, the promise rejects (`ENOENT`) and the write stream is destroyed.',
          ],
        }),
        code({
          title: 'Cancellation with AbortSignal',
          code: dedent(`
            const { pipeline } = require('node:stream/promises');
            const fs = require('node:fs');

            const ac = new AbortController();
            pipeline(fs.createReadStream('big.bin'), fs.createWriteStream('copy.bin'), { signal: ac.signal })
              .then(() => console.log('ok'))
              .catch((err) => console.log(err.name));
            ac.abort();
          `),
          expectedOutput: 'AbortError',
          explanation: ['Aborting the signal destroys all streams and the promise rejects with an `AbortError`.', 'The options object (last argument) is supported by the promise API; the callback version takes only streams + callback.'],
        }),
      ),
      section('real-world', 'Real-world: file download with cleanup',
        code({
          title: 'node:http download handler',
          code: dedent(`
            const http = require('node:http');
            const fs = require('node:fs');
            const { pipeline } = require('node:stream');

            http.createServer((req, res) => {
              res.setHeader('Content-Type', 'application/octet-stream');
              pipeline(fs.createReadStream('./report.csv'), res, (err) => {
                if (err) console.error('download aborted:', err.code);
              });
            }).listen(3000);
          `),
          explanation: ['If the client disconnects, `res` errors with `ERR_STREAM_PREMATURE_CLOSE`; pipeline destroys the file stream, closing the fd.'],
        }),
      ),
      section('mistakes', 'Common mistakes',
        code({
          title: 'Wrong vs right',
          code: dedent(`
            // ❌ errors from the read stream or gzip are unhandled; nothing is cleaned up
            fs.createReadStream(src).pipe(zlib.createGzip()).pipe(fs.createWriteStream(dest));

            // ✅
            await pipeline(fs.createReadStream(src), zlib.createGzip(), fs.createWriteStream(dest));
          `),
          explanation: ['`.pipe()` returns the destination, so `.on(\'error\')` chained at the end catches only the last stream\'s errors.'],
        }),
        bullets('Adding `.on(\'error\')` only to the last stream in a `.pipe()` chain.', 'Forgetting that `pipeline`\'s callback/promise is the only error handler you need.'),
      ),
      section('interview', 'Interview angle',
        interviewTip('The one-liner: "`.pipe()` handles backpressure but not error propagation or cleanup; `pipeline` handles all three".'),
      ),
      section('practice', 'Practice',
        text('Rewrite `a.pipe(b).pipe(c)` code from an existing project using `stream/promises` pipeline and add an AbortSignal timeout with `AbortSignal.timeout(5000)`.'),
      ),
      section('summary', 'Summary',
        bullets('Prefer `pipeline` over `.pipe()`.', 'Promise version: `node:stream/promises`.', 'Async generators work as stages.', 'Supports AbortSignal.'),
      ),
    ],
    revisionNotes: [
      '.pipe(): backpressure yes, error forwarding no, cleanup no.',
      'pipeline: backpressure + errors + destroy all streams.',
      'require("node:stream/promises").pipeline returns a Promise (Node 15+).',
      'Async generator functions can be pipeline stages.',
      '{ signal } option aborts → AbortError.',
      'stream.finished(stream) detects end/error/premature close.',
    ],
    quiz: [
      {
        kind: 'mcq', difficulty: 'intermediate',
        prompt: 'In a.pipe(b).pipe(c).on("error", handler), which errors does handler receive?',
        options: ['Errors from a, b and c', 'Only errors from c', 'Only errors from a', 'None — pipe swallows errors'],
        answer: 1,
        explanation: '.pipe() returns the destination, so the chained .on attaches to c only. Errors from a or b are unhandled and crash the process.',
      },
      {
        kind: 'scenario', difficulty: 'intermediate',
        prompt: 'Your download server slowly runs out of file descriptors (EMFILE). It uses fs.createReadStream(file).pipe(res). Most likely cause?',
        options: ['Too many concurrent users', 'Clients that disconnect leave the read streams open because pipe does not destroy the source', 'The highWaterMark is too low', 'Missing Content-Type header'],
        answer: 1,
        explanation: 'When res closes early, .pipe() unpipes but does not destroy the source. pipeline destroys every stream on error or premature close.',
      },
      {
        kind: 'complete-code', difficulty: 'beginner',
        prompt: 'Import the promise-based pipeline.',
        code: "const { pipeline } = require(/* ??? */);",
        options: ["'node:stream'", "'node:stream/promises'", "'node:util'", "'node:events'"],
        answer: 1,
        explanation: "node:stream/promises exports the Promise version. node:stream's pipeline uses a callback.",
      },
    ],
    interview: [
      {
        category: 'nodejs', kind: 'concept', difficulty: 'intermediate', topic: 'pipeline',
        question: 'Why should you use stream.pipeline instead of .pipe()?',
        shortAnswer: 'pipeline forwards errors from every stream to one callback or promise and destroys all streams on failure, while .pipe() only handles backpressure.',
        detailedAnswer: [
          'With .pipe(), each stream needs its own `error` listener or the process crashes.',
          'An erroring destination does not stop the source → leaks.',
          'pipeline uses `finished()` on each stream and calls `destroy()` on all of them.',
          'Promise form integrates with async/await; supports AbortSignal and generator stages.',
        ],
        followUp: 'How do you cancel a pipeline?',
        trap: 'Believing .pipe() propagates errors down the chain.',
      },
      {
        category: 'nodejs', kind: 'scenario', difficulty: 'advanced', topic: 'pipeline',
        question: 'A client aborts a large download halfway. Walk through what happens with .pipe() versus pipeline in a node:http handler.',
        shortAnswer: 'The response emits close/error early; with .pipe() the read stream is merely unpiped and stays open, leaking an fd, while pipeline sees the premature close and destroys the read stream and reports ERR_STREAM_PREMATURE_CLOSE.',
        detailedAnswer: [
          'The socket closes → `res` emits `close` before `finish`.',
          '.pipe(): the source is unpiped; it pauses with its fd open until GC (or forever if referenced).',
          'pipeline: `finished(res)` reports premature close → `destroy()` on the file stream → fd closed.',
          'The callback receives an error you can log at debug level (aborts are normal).',
        ],
        followUp: 'How would you stop doing expensive upstream work (e.g. a DB query) when the client aborts?',
        trap: 'Assuming the OS closes the file automatically when the socket closes.',
      },
    ],
  },

  'stream-events': {
    summary: "Streams communicate through events: Readables emit data, readable, end, error and close; Writables emit drain, finish, pipe/unpipe, error and close. Knowing the order is key to correct cleanup.",
    topics: ['data', 'end', 'error', 'close', 'finish', 'drain', 'readable', 'pause', 'resume', 'finished()'],
    sections: [
      section('introduction', undefined,
        text('Every stream is an EventEmitter. The events tell you when data is available, when the writer can continue, when everything is done — and when something broke.'),
      ),
      section('definition', 'Event reference',
        table('Stream events', ['Event', 'Emitted by', 'Meaning'], [
          ['`data`', 'Readable', 'A chunk is available (flowing mode)'],
          ['`readable`', 'Readable', 'Data can be read with `read()` (or end is reached)'],
          ['`end`', 'Readable', 'No more data **and** it has all been consumed'],
          ['`drain`', 'Writable', 'Buffer emptied after `write()` returned false'],
          ['`finish`', 'Writable', '`end()` called and all data flushed'],
          ['`error`', 'Both', 'Failure — stream is usually destroyed afterwards'],
          ['`close`', 'Both', 'Resource released; no more events (except maybe error before it)'],
          ['`pause` / `resume`', 'Readable', 'Mode changes'],
          ['`pipe` / `unpipe`', 'Writable', 'A Readable was piped / unpiped into it'],
        ]),
      ),
      section('why', 'Why event order matters',
        bullets(
          'Respond to the client only after the upload stream has `finish`ed — not on `end` of the request.',
          'Release resources on `close`, which fires on success **and** after `destroy()`.',
          '`end` does not fire if the stream errored or was destroyed — cleanup code in `end` alone can leak.',
        ),
      ),
      section('internals', 'Typical orders',
        flow(['Readable: data … data', 'end', 'close'], { title: 'Readable (success)', direction: 'horizontal' }),
        flow(['Writable: write() … end()', 'finish', 'close'], { title: 'Writable (success)', direction: 'horizontal' }),
        flow(['Any stream: destroy(err)', 'error', 'close'], { title: 'Failure', direction: 'horizontal' }),
        note('`stream.finished(stream, cb)` (or `finished` from `node:stream/promises`) wraps these rules: it resolves on end/finish and rejects on error or premature close.'),
      ),
      section('example', 'Watching events',
        code({
          title: 'Readable event order',
          code: dedent(`
            const { Readable } = require('node:stream');
            const r = Readable.from(['a', 'b']);
            r.on('data', (c) => console.log('data', c));
            r.on('end', () => console.log('end'));
            r.on('close', () => console.log('close'));
          `),
          expectedOutput: 'data a\ndata b\nend\nclose',
          explanation: ['`close` follows `end` because `autoDestroy` (default true) destroys the stream after it ends.'],
        }),
        code({
          title: 'Error then close',
          code: dedent(`
            const { Readable } = require('node:stream');
            const r = new Readable({ read() {} });
            r.on('error', (e) => console.log('error', e.message));
            r.on('end', () => console.log('end'));
            r.on('close', () => console.log('close'));
            r.destroy(new Error('boom'));
          `),
          expectedOutput: 'error boom\nclose',
          explanation: ['`end` never fires on failure.', '`close` always fires last (with `emitClose: true`).'],
        }),
        code({
          title: 'finished() for robust completion',
          code: dedent(`
            const { finished } = require('node:stream/promises');
            const fs = require('node:fs');

            async function save(req, path) {
              const out = fs.createWriteStream(path);
              req.pipe(out);
              await finished(out); // resolves on finish, rejects on error / premature close
              return 'saved';
            }
          `),
          explanation: ['`finished` normalises all the event combinations into one promise.', 'Still prefer `pipeline` here so request errors are handled too.'],
        }),
      ),
      section('real-world', 'Real-world: upload endpoint',
        bullets(
          'Respond 201 when the file stream emits `finish` (data on disk), not when `req` emits `end`.',
          'On `error` from either side, delete the partial file and respond 500 (if headers not sent).',
          'Use `req.on(\'close\')` / `res.on(\'close\')` to detect client aborts.',
        ),
      ),
      section('mistakes', 'Common mistakes',
        bullets(
          'Listening for `end` on a Writable (it is `finish`).',
          'Doing cleanup only in `end`/`finish` — skipped on errors. Use `close` or `finished()`.',
          'No `error` listener on a stream → crash on the first failure.',
        ),
      ),
      section('interview', 'Interview angle',
        interviewTip('Draw the success and failure orders: `data… → end → close` and `error → close`. Say "`end` is not guaranteed; `close` is".'),
      ),
      section('practice', 'Practice',
        text('Log every event (data, end, finish, close, error, drain) of a file copy using `.pipe()`, then make the source fail (bad path) and compare the order.'),
      ),
      section('summary', 'Summary',
        bullets('Readable success: data → end → close.', 'Writable success: finish → close.', 'Failure: error → close (no end/finish).', 'Use `finished()` / `pipeline` to avoid hand-rolling these rules.'),
      ),
    ],
    revisionNotes: [
      'end = readable fully consumed; finish = writable flushed after end().',
      'close comes last; also after destroy().',
      'error → close; end/finish skipped.',
      'autoDestroy (default true) emits close after end/finish.',
      'stream/promises finished() resolves/rejects on completion.',
    ],
    quiz: [
      {
        kind: 'predict-output', difficulty: 'intermediate',
        prompt: 'A Readable is destroyed with an error. Which listeners run?',
        code: "r.on('error', () => console.log('error'));\nr.on('end', () => console.log('end'));\nr.on('close', () => console.log('close'));\nr.destroy(new Error('x'));",
        options: ['error, end, close', 'error, close', 'end, close', 'close, error'],
        answer: 1,
        explanation: "On failure 'end' is skipped; 'error' is emitted and then 'close'.",
      },
      {
        kind: 'mcq', difficulty: 'beginner',
        prompt: 'Which event means a Writable has flushed all data after end()?',
        options: ["'end'", "'finish'", "'drain'", "'data'"],
        answer: 1,
        explanation: "'finish' is the Writable completion event. 'drain' only signals the buffer emptied during writing.",
      },
    ],
    interview: [
      {
        category: 'nodejs', kind: 'concept', difficulty: 'beginner', topic: 'Stream events',
        question: "Which events signal completion for a Readable and for a Writable?",
        shortAnswer: "A Readable emits 'end' when all data has been consumed; a Writable emits 'finish' after end() once everything is flushed; both emit 'close' when the resource is released.",
        detailedAnswer: [
          'Readable: `data` (chunks) → `end` → `close`.',
          'Writable: `drain` (as needed) → `finish` → `close`.',
          'Errors: `error` → `close`, without end/finish.',
        ],
        followUp: 'Why might end never fire on a Readable?',
        trap: "Waiting for 'end' on a write stream.",
      },
      {
        category: 'nodejs', kind: 'scenario', difficulty: 'intermediate', topic: 'Stream events',
        question: "Your upload handler cleans up temp files in the write stream's 'finish' handler, but temp files accumulate on disk. What's wrong?",
        shortAnswer: "'finish' is not emitted when a stream errors or is destroyed (e.g. client aborts), so cleanup must also happen on error/close — or use pipeline/finished and handle the rejection.",
        detailedAnswer: [
          'Aborted uploads produce `error` / premature `close`, never `finish`.',
          'Put cleanup in a `close` handler with a flag, or in the pipeline callback\'s error branch.',
          '`finished()` rejects on premature close, giving one place to unlink the file.',
        ],
        followUp: 'How do you distinguish a client abort from a disk error?',
        trap: 'Adding a timer-based cleanup job instead of fixing the event handling.',
      },
    ],
  },

  backpressure: {
    summary: 'Backpressure is the mechanism that slows a fast producer down to the speed of a slow consumer: write() returns false when the buffer is full and the producer waits for drain.',
    topics: ['backpressure', 'drain', 'write return value', 'pause', 'resume', 'memory', 'pipeline', 'highWaterMark'],
    sections: [
      section('introduction', undefined,
        text('Reading a file from SSD is far faster than sending it to a mobile client. Without a brake, the read data accumulates in RAM. **Backpressure** is that brake.'),
      ),
      section('definition', 'Definition',
        text('Backpressure is a feedback signal from consumer to producer: "my buffer is full, stop until I tell you". In Node it is the `write()` → `false` / `drain` handshake, plus `push()` returning `false` inside Readables.'),
      ),
      section('why', 'Why it matters',
        bullets(
          'Without it, memory grows with (producer speed − consumer speed) × time.',
          'GC pressure rises and latency for every other request increases.',
          'Eventually: out-of-memory crash.',
        ),
      ),
      section('internals', 'How .pipe() / pipeline implement it',
        steps(
          'Source emits `data` → `dest.write(chunk)`.',
          'If `write` returns `false`, the source is `pause()`d.',
          'Destination drains its buffer to the OS → emits `drain`.',
          'On `drain`, the source is `resume()`d.',
          'Inside the source, not reading means its buffer fills to highWaterMark, so `push()` returns false and `_read` is not called → the fd is not read.',
        ),
        diagram('stream-pipeline', 'When the Writable buffer passes highWaterMark, the pressure travels back up the chain.'),
      ),
      section('example', 'Manual backpressure',
        code({
          title: 'Ignoring backpressure (memory grows)',
          code: dedent(`
            const fs = require('node:fs');
            const out = fs.createWriteStream('big.txt');
            for (let i = 0; i < 1e7; i++) {
              out.write('line ' + i + '\\n'); // ❌ return value ignored
            }
            out.end();
            console.log(out.writableLength > 100_000_000);
          `),
          expectedOutput: 'true',
          explanation: ['The loop is synchronous: no data can reach the disk until it finishes, so all ~129 MB (`line 0` … `line 9999999`) sits in memory.', 'Scale `n` up and the process eventually runs out of memory.'],
        }),
        code({
          title: 'Respecting backpressure',
          code: dedent(`
            const fs = require('node:fs');
            const { once } = require('node:events');

            async function writeLines(n) {
              const out = fs.createWriteStream('big.txt');
              let maxBuffered = 0;
              for (let i = 0; i < n; i++) {
                if (!out.write('line ' + i + '\\n')) await once(out, 'drain');
                maxBuffered = Math.max(maxBuffered, out.writableLength);
              }
              out.end();
              await once(out, 'finish');
              console.log('max buffered <= highWaterMark + one line:', maxBuffered <= out.writableHighWaterMark + 20);
            }
            writeLines(1e6);
          `),
          expectedOutput: 'max buffered <= highWaterMark + one line: true',
          explanation: ['Waiting for `drain` keeps the buffer near highWaterMark.', 'Memory stays flat regardless of `n`.'],
        }),
        code({
          title: 'Backpressure inside a custom Readable',
          code: dedent(`
            const { Readable } = require('node:stream');

            class Rows extends Readable {
              constructor(db) { super({ objectMode: true }); this.db = db; }
              async _read() {
                const rows = await this.db.nextBatch();
                if (!rows.length) return this.push(null);
                for (const row of rows) this.push(row); // stream calls _read again only when needed
              }
            }
          `),
          explanation: ['Node calls `_read` only when the buffer is below highWaterMark — that is how the DB is throttled.'],
        }),
      ),
      section('real-world', 'Real-world: proxying uploads',
        text('An API receives a 2 GB upload and forwards it to object storage. With `pipeline(req, uploadStream)`, when storage is slow, `req` is paused, TCP receive windows fill, and the **client** slows down — backpressure all the way to the uploader\'s network stack.'),
      ),
      section('mistakes', 'Common mistakes',
        bullets(
          'Writing in a loop and ignoring the return value.',
          'Using `data` events to forward to a slower async sink without pausing.',
          'Calling `await` inside a `data` handler — the stream does not wait for it.',
          'Raising highWaterMark to "fix" memory issues — it raises the ceiling, it does not add a brake.',
        ),
        code({
          title: 'Wrong vs right',
          code: dedent(`
            // ❌ data keeps flowing while the awaits pile up
            readable.on('data', async (chunk) => { await slowDb.insert(chunk); });

            // ✅ pull-based: next chunk only after insert
            for await (const chunk of readable) await slowDb.insert(chunk);
          `),
        }),
      ),
      section('interview', 'Interview angle',
        interviewTip('Interviewers want the concrete mechanism: write() → false, pause, drain, resume. Mention that `for await` and `pipeline` give you this automatically.'),
      ),
      section('practice', 'Practice',
        text('Write a slow Writable (setTimeout 50 ms per chunk) and pipe a fast Readable into it. Log `writableLength` every 100 ms with `.pipe()` versus manual `data` → `write` without pausing.'),
      ),
      section('summary', 'Summary',
        bullets('Backpressure = consumer tells producer to slow down.', 'Signal: `write()` false → wait for `drain`.', '`pipe`, `pipeline` and `for await` handle it.', 'Async `data` handlers do not.'),
      ),
    ],
    revisionNotes: [
      'write() false → pause producer → drain → resume.',
      'Readable side: push() false → stop until _read is called.',
      'pipe/pipeline/for-await implement backpressure automatically.',
      'async data listeners ignore backpressure.',
      'Bigger highWaterMark ≠ backpressure fix.',
    ],
    quiz: [
      {
        kind: 'find-bug', difficulty: 'intermediate',
        prompt: 'Memory climbs when importing a large file into a slow database. Why?',
        code: "fs.createReadStream('big.ndjson').on('data', async (chunk) => {\n  await db.insertMany(parse(chunk));\n});",
        options: ['insertMany is not async', "The 'data' handler's await does not pause the stream; chunks keep arriving while inserts queue up", 'createReadStream has no backpressure', 'parse() is synchronous'],
        answer: 1,
        explanation: "EventEmitter does not await listeners. Use for await...of or a Writable whose callback fires after the insert. createReadStream does support backpressure when consumed correctly.",
      },
      {
        kind: 'mcq', difficulty: 'beginner',
        prompt: 'Which event tells a producer it can start writing again?',
        options: ["'resume'", "'drain'", "'finish'", "'readable'"],
        answer: 1,
        explanation: "'drain' fires when the writable buffer has emptied after write() returned false.",
      },
      {
        kind: 'scenario', difficulty: 'advanced',
        prompt: 'A WebSocket broadcast loop writes to 10,000 sockets. A few clients on bad networks cause server memory to grow. Best approach?',
        options: ['Increase writableHighWaterMark', 'Check write() / bufferedAmount per client and drop or disconnect clients whose buffers exceed a limit', 'Use setImmediate between writes', 'Switch to UDP'],
        answer: 1,
        explanation: 'Slow consumers must be detected per connection. Raising highWaterMark just lets more memory accumulate; yielding does not make the slow client faster.',
      },
    ],
    interview: [
      {
        category: 'nodejs', kind: 'concept', difficulty: 'beginner', topic: 'Backpressure',
        question: 'What is backpressure in Node.js streams?',
        shortAnswer: "It is the feedback mechanism that stops a fast producer from overwhelming a slow consumer: write() returns false when the buffer is full and the producer waits for 'drain'.",
        detailedAnswer: [
          'Every stream buffers up to highWaterMark.',
          'Above it, `write()` returns false / `push()` returns false.',
          'pipe/pipeline pause the source and resume on `drain`.',
          'Without it, memory grows unbounded.',
        ],
        followUp: 'How does backpressure reach the TCP layer?',
        trap: 'Defining backpressure as "an error when the buffer is full".',
      },
      {
        category: 'nodejs', kind: 'concept', difficulty: 'advanced', topic: 'Backpressure',
        question: 'How does backpressure propagate from a slow HTTP client all the way back to a file read or an upstream TCP sender?',
        shortAnswer: "The socket's kernel send buffer fills, so res.write() returns false; pipeline pauses the source, whose internal buffer fills so it stops issuing reads; for a network source, not reading fills the kernel receive buffer and TCP flow control shrinks the sender's window.",
        detailedAnswer: [
          'Kernel send buffer full → libuv write requests queue → `writableLength` exceeds highWaterMark.',
          '`pipe` sees `false` and calls `src.pause()`.',
          'Paused Readable stops calling `_read` once its buffer reaches highWaterMark → no more `fs.read` calls.',
          'For a socket source, libuv stops reading (`readStop`) → kernel receive buffer fills → TCP advertises a zero window.',
          'Net effect: end-to-end flow control with bounded memory at each hop.',
        ],
        followUp: 'What breaks this chain in a typical hand-written proxy?',
        trap: 'Thinking Node must poll the client speed; it is all buffer-threshold driven.',
      },
    ],
  },

  highwatermark: {
    summary: "highWaterMark is a stream's buffer threshold — the point at which write()/push() start returning false. Byte streams default to 16 KiB (64 KiB since Node 22), fs read streams use 64 KiB, and object mode counts 16 objects.",
    topics: ['highWaterMark', 'readableHighWaterMark', 'writableHighWaterMark', 'getDefaultHighWaterMark', 'setDefaultHighWaterMark', 'objectMode', 'buffer size'],
    sections: [
      section('introduction', undefined,
        text('Every stream buffer needs a size target. `highWaterMark` sets it — trading memory for throughput.'),
      ),
      section('definition', 'Defaults',
        table('highWaterMark defaults', ['Stream', 'Default'], [
          ['Generic byte stream (`new Readable()`, `new Writable()`)', '16 KiB (16384) before Node 22; **64 KiB (65536) in Node 22+**'],
          ['`fs.createReadStream`', '64 KiB'],
          ['`fs.createWriteStream`', 'Generic default (16 KiB; 64 KiB on Node 22+)'],
          ['Object mode', '16 objects'],
          ['Duplex/Transform', 'Separate values per side (`readableHighWaterMark`, `writableHighWaterMark`)'],
        ]),
        note('Inspect at runtime with `stream.readableHighWaterMark` / `writableHighWaterMark`, or `stream.getDefaultHighWaterMark(objectMode)` (Node 19.9+ / 18.17+).'),
      ),
      section('why', 'Why tune it',
        bullets(
          'Larger: fewer syscalls and events → higher throughput for big sequential I/O, more memory per stream.',
          'Smaller: less memory per stream — matters with 10,000 concurrent sockets.',
          'Object mode: one "unit" is an object regardless of size; lower it when objects are large.',
        ),
      ),
      section('internals', 'It is a threshold, not a limit',
        bullets(
          '`write()` returns `writableLength < highWaterMark` — you can still write past it; it just returns false.',
          'A single `push()` or `write()` of a chunk larger than highWaterMark is accepted whole.',
          'For fs read streams, highWaterMark is also the size of each `fs.read` — chunks are up to 64 KiB.',
          'Readable: `_read(size)` receives highWaterMark as the advisory size.',
        ),
      ),
      section('visual', 'Buffer level vs signal',
        flow(['buffer 0 → write() true', 'buffer < hwm → true', 'buffer ≥ hwm → false', 'drained to 0 → drain'], { title: 'Writable buffer level', direction: 'horizontal' }),
      ),
      section('example', 'Seeing and setting highWaterMark',
        code({
          title: 'Defaults',
          code: dedent(`
            const fs = require('node:fs');
            const { Readable, Writable } = require('node:stream');
            console.log(new Readable({ read() {} }).readableHighWaterMark);
            console.log(new Readable({ read() {}, objectMode: true }).readableHighWaterMark);
            console.log(fs.createReadStream(__filename).readableHighWaterMark);
          `),
          expectedOutput: '65536\n16\n65536',
          explanation: [
            'Node 22+: generic byte streams default to 65536. On Node 20 and earlier the first line prints 16384.',
            'Object mode counts objects: 16.',
            'File read streams always default to 64 KiB.',
          ],
          versionNote: 'Default byte highWaterMark changed from 16 KiB to 64 KiB in Node 22.0.0.',
        }),
        code({
          title: 'Custom highWaterMark for chunk size',
          code: dedent(`
            const fs = require('node:fs');
            (async () => {
              const sizes = [];
              for await (const c of fs.createReadStream('ten-kb.bin', { highWaterMark: 4096 })) sizes.push(c.length);
              console.log(sizes.join(','));
            })();
          `),
          expectedOutput: '4096,4096,2048',
          explanation: ['A 10,240-byte file read with 4 KiB chunks → two full chunks and a 2 KiB remainder.'],
        }),
        code({
          title: 'Threshold, not hard limit',
          code: dedent(`
            const { Writable } = require('node:stream');
            const w = new Writable({ highWaterMark: 10, write(c, e, cb) { setTimeout(cb, 5); } });
            console.log(w.write(Buffer.alloc(100)), w.writableLength);
          `),
          expectedOutput: 'false 100',
          explanation: ['The 100-byte chunk is accepted even though hwm is 10 — the return value only advises you to wait.'],
        }),
      ),
      section('real-world', 'Real-world tuning',
        bullets(
          'Bulk file copies / backups: 256 KiB–1 MiB read chunks can increase throughput.',
          'Chat servers with many idle sockets: keep defaults or lower them.',
          'Object-mode DB row streams: lower to e.g. 4 when each row is large.',
          'Change globally with `stream.setDefaultHighWaterMark(false, bytes)` — rarely needed.',
        ),
      ),
      section('mistakes', 'Common mistakes',
        bullets(
          'Thinking highWaterMark caps memory — a single huge write still goes in.',
          'Setting giant values to "stop backpressure" — memory per stream explodes.',
          'Assuming the default is 16 KiB on every version — Node 22 changed it.',
          'Forgetting object mode counts items, not bytes.',
        ),
      ),
      section('interview', 'Interview angle',
        interviewTip('Give the numbers (16 KiB → 64 KiB in Node 22, fs read 64 KiB, 16 objects) and stress "threshold, not a hard limit".'),
      ),
      section('practice', 'Practice',
        text('Measure the time to copy a 1 GB file with highWaterMark 16 KiB, 64 KiB and 1 MiB. Plot throughput vs memory (`process.memoryUsage().arrayBuffers`).'),
      ),
      section('summary', 'Summary',
        bullets('highWaterMark = buffer threshold for backpressure.', 'Defaults: 64 KiB bytes (Node 22+, 16 KiB before), 64 KiB fs read, 16 objects.', 'It is advisory: writes above it are accepted.', 'Tune for throughput vs memory.'),
      ),
    ],
    revisionNotes: [
      'Byte streams: 16 KiB default; Node 22+ raised to 64 KiB.',
      'fs.createReadStream: 64 KiB (also its read chunk size).',
      'objectMode: 16 objects.',
      'write() returns writableLength < highWaterMark.',
      'Not a hard cap: oversized chunks are accepted.',
      'stream.getDefaultHighWaterMark / setDefaultHighWaterMark.',
    ],
    quiz: [
      {
        kind: 'mcq', difficulty: 'intermediate',
        prompt: 'What is the default highWaterMark for an objectMode stream?',
        options: ['16 KiB', '64 KiB', '16 objects', '1 object'],
        answer: 2,
        explanation: 'In object mode, highWaterMark counts objects, and the default is 16.',
      },
      {
        kind: 'predict-output', difficulty: 'advanced',
        prompt: 'highWaterMark is 10 bytes. What does w.write(Buffer.alloc(50)) do on an idle stream?',
        options: ['Throws ERR_OUT_OF_RANGE', 'Accepts the chunk and returns false', 'Accepts 10 bytes and drops 40', 'Splits it into 5 writes of 10 bytes and returns true'],
        answer: 1,
        explanation: 'highWaterMark is a threshold. The whole chunk is queued and write returns false because writableLength (50) ≥ 10.',
      },
      {
        kind: 'mcq', difficulty: 'beginner',
        prompt: 'What is the default chunk size of fs.createReadStream?',
        options: ['4 KiB', '16 KiB', '64 KiB', '1 MiB'],
        answer: 2,
        explanation: 'fs read streams default to a 64 KiB highWaterMark, which is also the size of each read.',
      },
    ],
    interview: [
      {
        category: 'nodejs', kind: 'concept', difficulty: 'intermediate', topic: 'highWaterMark',
        question: 'What is highWaterMark and what are its default values?',
        shortAnswer: 'It is the buffer threshold at which a stream signals backpressure; byte streams default to 16 KiB (64 KiB since Node 22), fs read streams to 64 KiB, and object-mode streams to 16 objects.',
        detailedAnswer: [
          'Writable: `write()` returns false when buffered ≥ hwm.',
          'Readable: `push()` returns false and `_read` is not called while buffered ≥ hwm.',
          'Duplex/Transform: separate readable and writable values.',
          'Configurable per stream, or globally with `setDefaultHighWaterMark`.',
        ],
        followUp: 'Is it a hard memory limit?',
        trap: 'Quoting 16 KiB as universal and forgetting fs read streams and Node 22.',
      },
      {
        category: 'nodejs', kind: 'concept', difficulty: 'advanced', topic: 'highWaterMark',
        question: 'Why is highWaterMark not a hard memory limit, and how would you actually bound memory in a streaming service?',
        shortAnswer: 'Writes and pushes above it are still accepted — it only flips the return value — so bounding memory requires producers to honour the signal, plus limits on chunk sizes, concurrency and number of streams.',
        detailedAnswer: [
          'A single 100 MB `write()` is buffered whole even with hwm 16 KiB.',
          'Ignoring `false` lets buffers grow without limit.',
          'Bound memory: honour backpressure (pipeline/for await), cap chunk/object sizes, cap concurrent requests, and set body size limits.',
          'Total memory ≈ streams × (hwm per side) × stages, so concurrency matters as much as hwm.',
        ],
        followUp: 'How would you monitor stream buffer growth in production?',
        trap: 'Saying the stream rejects data over the highWaterMark.',
      },
    ],
  },
};

export default content;
