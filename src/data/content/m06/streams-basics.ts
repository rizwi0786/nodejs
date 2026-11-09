import type { ModuleContent } from '../../../types';
import { bullets, code, dedent, diagram, flow, interviewTip, note, section, table, text } from '../helpers';

const content: Partial<ModuleContent> = {
  'streams-introduction': {
    summary: 'A stream processes data piece by piece (chunks) instead of loading it all into memory. Node has four types: Readable, Writable, Duplex and Transform.',
    topics: ['streams', 'Readable', 'Writable', 'Duplex', 'Transform', 'object mode', 'chunks', 'memory efficiency'],
    sections: [
      section('introduction', undefined,
        text('Reading a 5 GB log with `fs.readFile` needs 5 GB of RAM (and fails — Buffers max out around 2–4 GB). A stream reads it 64 KiB at a time, so memory stays flat no matter the file size.'),
      ),
      section('definition', 'The four stream types',
        table('Stream types', ['Type', 'Direction', 'Examples'], [
          ['Readable', 'Source — you read from it', '`fs.createReadStream`, HTTP request (server side), `process.stdin`'],
          ['Writable', 'Destination — you write to it', '`fs.createWriteStream`, HTTP response (server side), `process.stdout`'],
          ['Duplex', 'Both, independent sides', '`net.Socket`, TLS socket, WebSocket'],
          ['Transform', 'Duplex where output is computed from input', '`zlib.createGzip()`, `crypto.createHash` (as stream), CSV parser'],
        ]),
        bullets(
          'All streams are `EventEmitter`s, from `node:stream`.',
          'By default chunks are Buffers (or strings with an encoding). **Object mode** (`objectMode: true`) lets chunks be any JS value.',
        ),
      ),
      section('why', 'Why streams',
        table('readFile vs stream', ['', '`fs.readFile`', '`fs.createReadStream`'], [
          ['Memory', 'Whole file', '~highWaterMark per stream'],
          ['Time to first byte', 'After the whole file is read', 'Immediately'],
          ['Max size', 'Limited by buffer max length', 'Unlimited'],
          ['Composability', 'None', 'Pipe into gzip, hash, HTTP response…'],
        ]),
      ),
      section('internals', 'How streams work',
        bullets(
          'Each stream has an internal buffer. Readables fill it from the source; Writables drain it to the destination.',
          '`highWaterMark` is the threshold for that buffer — the basis of **backpressure** (a fast producer is told to pause when the consumer is slow).',
          'Data moves in chunks; you never see the whole payload at once.',
        ),
        diagram('stream-pipeline', 'Readable → Transform → Writable, each with its own buffer; backpressure flows backwards.'),
      ),
      section('example', 'A first stream',
        code({
          title: 'Copy a file with streams',
          code: dedent(`
            const fs = require('node:fs');
            const { pipeline } = require('node:stream/promises');

            async function main() {
              await pipeline(
                fs.createReadStream('input.log'),
                fs.createWriteStream('copy.log'),
              );
              console.log('copied');
            }
            main().catch(console.error);
          `),
          expectedOutput: 'copied',
          explanation: [
            'The read stream emits 64 KiB chunks; the write stream writes them.',
            '`pipeline` wires them up, handles backpressure, and rejects if either side errors.',
            'Memory stays roughly constant even for a multi-gigabyte file.',
          ],
          versionNote: '`node:stream/promises` is available since Node 15.',
        }),
        code({
          title: 'Object mode',
          code: dedent(`
            const { Readable } = require('node:stream');
            const users = Readable.from([{ id: 1 }, { id: 2 }]);
            users.on('data', (u) => console.log(u.id));
            console.log(users.readableObjectMode);
          `),
          expectedOutput: 'true\n1\n2',
          explanation: [
            '`Readable.from` creates an object-mode stream by default.',
            'The synchronous `console.log` runs first; data flows asynchronously after.',
          ],
        }),
      ),
      section('real-world', 'Real-world usage',
        bullets(
          'Serving downloads: `pipeline(fs.createReadStream(file), res)`.',
          'Upload proxy: stream `req` straight to S3 without buffering.',
          'ETL jobs: read CSV → parse (Transform) → batch insert (Writable).',
          'Gzip responses on the fly with `zlib.createGzip()`.',
        ),
      ),
      section('mistakes', 'Common mistakes',
        bullets(
          'Using `readFile` for files whose size you do not control (user uploads, logs).',
          'Ignoring `error` events — an unhandled stream error crashes the process.',
          'Using `.pipe()` without error handling — prefer `pipeline`.',
        ),
      ),
      section('interview', 'Interview angle',
        interviewTip('Name the four types with a concrete example each and mention that a socket is Duplex and gzip is Transform.'),
      ),
      section('practice', 'Practice',
        text('Write a script that streams `big.txt` to `big.txt.gz` using `fs.createReadStream`, `zlib.createGzip()` and `fs.createWriteStream` with `pipeline`.'),
      ),
      section('summary', 'Summary',
        bullets('Streams process data in chunks with bounded memory.', 'Four types: Readable, Writable, Duplex, Transform.', 'Object mode carries arbitrary values.', 'Compose with `pipeline`.'),
      ),
    ],
    revisionNotes: [
      'Readable, Writable, Duplex (both sides independent), Transform (output derived from input).',
      'All streams are EventEmitters.',
      'Default chunks: Buffer; objectMode: any value.',
      'Readable.from(iterable) → object mode by default.',
      'Use streams for large/unknown-size data; readFile loads everything.',
    ],
    quiz: [
      {
        kind: 'mcq', difficulty: 'beginner',
        prompt: 'Which of these is a Duplex stream?',
        options: ['fs.createReadStream()', 'process.stdout', 'net.Socket', 'fs.createWriteStream()'],
        answer: 2,
        explanation: 'A TCP socket can be read from and written to independently, so it is Duplex. The others are one-directional.',
      },
      {
        kind: 'scenario', difficulty: 'intermediate',
        prompt: 'An endpoint returns user-uploaded videos (up to 4 GB) using fs.readFile and res.end(data). Under load the server runs out of memory. Best fix?',
        options: ['Increase --max-old-space-size', 'Stream the file with pipeline(fs.createReadStream(path), res)', 'Use fs.readFileSync instead', 'Convert the file to base64 first'],
        answer: 1,
        explanation: 'Streaming keeps memory per request around the highWaterMark. More heap only delays the crash, and readFileSync also blocks the event loop.',
      },
    ],
    interview: [
      {
        category: 'nodejs', kind: 'concept', difficulty: 'beginner', topic: 'Streams',
        question: 'What are streams in Node.js and what are the four types?',
        shortAnswer: 'Streams are EventEmitters that move data in chunks; the four types are Readable, Writable, Duplex and Transform.',
        detailedAnswer: [
          'Readable: source (file read stream, HTTP request on the server).',
          'Writable: sink (file write stream, HTTP response).',
          'Duplex: independent readable and writable sides (TCP socket).',
          'Transform: a Duplex whose output is computed from its input (gzip).',
          'They give bounded memory and backpressure.',
        ],
        followUp: 'What is object mode?',
        trap: 'Calling Transform a separate base type unrelated to Duplex — it extends Duplex.',
      },
      {
        category: 'nodejs', kind: 'concept', difficulty: 'intermediate', topic: 'Streams',
        question: 'When would you choose streams over fs.readFile, and when is readFile fine?',
        shortAnswer: 'Stream when size is large or unknown, when you want to start sending output before input is complete, or when composing transformations; readFile is fine for small, bounded files like configs.',
        detailedAnswer: [
          'readFile allocates the whole file; concurrent large reads multiply memory.',
          'Streams start producing output immediately (better latency).',
          'Buffers have a maximum size (`buffer.constants.MAX_LENGTH`), so readFile cannot load arbitrarily large files.',
          'For a 2 KB JSON config, readFile is simpler and just as fast.',
        ],
        followUp: 'How do streams stop a fast producer overwhelming a slow consumer?',
        trap: 'Saying streams are always faster — for small files they add overhead; their win is memory and latency.',
      },
    ],
  },

  'readable-streams': {
    summary: 'A Readable produces data. It starts in paused mode and switches to flowing mode when you attach a data listener, call resume() or pipe it; async iteration is the modern way to consume it.',
    topics: ['Readable', 'flowing mode', 'paused mode', 'read()', 'readable event', 'push', 'Readable.from', 'for await', 'async iteration'],
    sections: [
      section('introduction', undefined,
        text('Every source of data — a file, an HTTP request, a DB cursor — can be exposed as a Readable. You need to know how to consume one and how to build one.'),
      ),
      section('definition', 'Two reading modes',
        table('Flowing vs paused', ['', 'Paused (default)', 'Flowing'], [
          ['How data arrives', 'You call `stream.read()` (usually on `readable`)', 'Pushed to `data` listeners automatically'],
          ['Enter by', 'Initial state, `pause()`, `unpipe()`', '`on(\'data\')`, `resume()`, `pipe()`'],
          ['Typical consumer', 'Parsers needing exact byte counts', 'Simple handlers, pipes'],
        ]),
        note('Async iteration (`for await`) handles modes and backpressure for you — prefer it for application code.'),
      ),
      section('why', 'Why two modes',
        bullets(
          'Flowing mode is convenient but data is lost if no one is listening.',
          'Paused mode gives pull-based control: read exactly as much as you can handle.',
          'Async iteration combines both: pull-based, but with simple loop syntax.',
        ),
      ),
      section('internals', 'Inside a Readable',
        bullets(
          'The stream calls your `_read(size)` (or `read` option) when its buffer is below `highWaterMark`.',
          'You call `this.push(chunk)`; `push` returns `false` once the buffer reaches highWaterMark — stop producing until `_read` is called again.',
          '`push(null)` signals end of data → `end` event once the buffer is drained.',
          'The `end` event fires **only** if the data is fully consumed.',
        ),
        flow(['_read() called', 'push(chunk) into buffer', 'buffer ≥ highWaterMark → push returns false', 'consumer reads → _read() called again', 'push(null) → end'], { title: 'Readable lifecycle', direction: 'vertical' }),
      ),
      section('example', 'Consuming and creating Readables',
        code({
          title: 'Async iteration (preferred)',
          code: dedent(`
            const fs = require('node:fs');

            async function countLines(path) {
              let lines = 0;
              for await (const chunk of fs.createReadStream(path)) {
                for (const byte of chunk) if (byte === 10) lines++;
              }
              return lines;
            }
            countLines('three-lines.txt').then((n) => console.log(n));
          `),
          expectedOutput: '3',
          explanation: [
            '`for await` pulls one chunk at a time, so it applies backpressure naturally.',
            'Each chunk is a Buffer; byte 10 is `\\n`.',
            'If the stream errors, the loop throws — use try/catch.',
            'Breaking out of the loop destroys the stream.',
          ],
        }),
        code({
          title: 'Implementing a Readable',
          code: dedent(`
            const { Readable } = require('node:stream');

            class Counter extends Readable {
              constructor(max) { super(); this.n = 0; this.max = max; }
              _read() {
                this.n++;
                if (this.n > this.max) this.push(null);
                else this.push(String(this.n));
              }
            }
            const c = new Counter(3);
            c.setEncoding('utf8');
            c.on('data', (d) => console.log('data', d));
            c.on('end', () => console.log('end'));
          `),
          expectedOutput: 'data 1\ndata 2\ndata 3\nend',
          explanation: [
            'Attaching `data` switches to flowing mode, which calls `_read` repeatedly.',
            '`push(null)` ends the stream.',
            '`setEncoding` makes chunks strings instead of Buffers.',
          ],
        }),
        code({
          title: 'Readable.from with a generator',
          code: dedent(`
            const { Readable } = require('node:stream');

            async function* pages() {
              yield 'page1';
              yield 'page2';
            }
            (async () => {
              for await (const p of Readable.from(pages())) console.log(p);
            })();
          `),
          expectedOutput: 'page1\npage2',
          explanation: ['`Readable.from` wraps any (async) iterable; the generator is only advanced when the consumer wants more data.'],
          versionNote: 'Readable.from: Node 12.3+ / 10.17+.',
        }),
        code({
          title: 'Paused mode with readable/read()',
          code: dedent(`
            const { Readable } = require('node:stream');
            const r = Readable.from(['ab', 'cd']); // object mode
            r.on('readable', () => {
              let chunk;
              while ((chunk = r.read()) !== null) console.log(chunk);
            });
            r.on('end', () => console.log('end'));
          `),
          expectedOutput: 'ab\ncd\nend',
          explanation: ['`read()` returns `null` when the buffer is empty — then wait for the next `readable` event.', 'In object mode each `read()` returns one item; in byte mode `read()` with no size returns **all** buffered bytes concatenated (here it would print `abcd`).', 'Pass a size (`read(2)`) to pull an exact number of bytes — handy for binary parsers.'],
        }),
      ),
      section('real-world', 'Real-world: streaming DB rows',
        code({
          title: 'Turn a paginated API into a Readable',
          code: dedent(`
            const { Readable } = require('node:stream');

            async function* fetchAllUsers() {
              let cursor = null;
              do {
                const res = await fetch('https://api.example.com/users?cursor=' + (cursor ?? ''));
                const { data, next } = await res.json();
                for (const u of data) yield u;
                cursor = next;
              } while (cursor);
            }
            const users = Readable.from(fetchAllUsers());
          `),
          explanation: ['Consumers can process millions of users without loading them all.', 'The next page is fetched only when the consumer asks for more.'],
        }),
      ),
      section('mistakes', 'Common mistakes',
        bullets(
          'Attaching a `data` listener late — in flowing mode, data emitted earlier is lost.',
          'Mixing `data` listeners, `readable` and `for await` on the same stream.',
          'Ignoring the return value of `push()` in custom Readables (no backpressure).',
          'Expecting `end` to fire when you never consumed the data — it won\'t.',
        ),
      ),
      section('interview', 'Interview angle',
        interviewTip('Explain that a Readable starts paused, the three ways it starts flowing, and that `for await` is the modern consumption style with built-in backpressure.'),
      ),
      section('practice', 'Practice',
        text('Implement a Readable that emits the Fibonacci numbers below 1000 as strings, one per chunk, and consume it with `for await`.'),
      ),
      section('summary', 'Summary',
        bullets('Readables start paused.', '`data`/`resume`/`pipe` → flowing.', 'Implement `_read` and `push`; `push(null)` ends.', 'Prefer `for await` and `Readable.from`.'),
      ),
    ],
    revisionNotes: [
      'Initial mode: paused. Flowing via on("data"), resume(), pipe().',
      'push() returns false at highWaterMark → stop until next _read.',
      'push(null) = EOF; "end" fires only after all data is consumed.',
      'for await consumes with backpressure; break destroys the stream.',
      'Readable.from(iterable) defaults to objectMode: true.',
    ],
    quiz: [
      {
        kind: 'mcq', difficulty: 'intermediate',
        prompt: 'Which action does NOT switch a Readable into flowing mode?',
        options: ["Attaching a 'data' listener", 'Calling stream.resume()', 'Calling stream.pipe(dest)', "Attaching an 'end' listener"],
        answer: 3,
        explanation: "Only 'data' listeners, resume() and pipe() start the flow. An 'end' listener alone never starts it — so 'end' would never fire.",
      },
      {
        kind: 'predict-output', difficulty: 'intermediate',
        prompt: 'What is logged?',
        code: "const { Readable } = require('node:stream');\nconst r = Readable.from(['x']);\nr.on('end', () => console.log('end'));\nconsole.log('registered');",
        options: ['registered then end', 'end then registered', 'registered only', 'Nothing'],
        answer: 2,
        explanation: "No one consumes the data, so the stream stays paused and 'end' never fires. Add r.resume() or a 'data' listener.",
      },
      {
        kind: 'complete-code', difficulty: 'beginner',
        prompt: 'Signal the end of a custom Readable.',
        code: '_read() {\n  if (this.done) this.push(/* ??? */);\n}',
        options: ["'end'", 'undefined', 'null', 'false'],
        answer: 2,
        explanation: 'push(null) is the EOF signal. push(undefined) is treated like an empty push in object mode and does not end the stream.',
      },
    ],
    interview: [
      {
        category: 'nodejs', kind: 'concept', difficulty: 'intermediate', topic: 'Readable streams',
        question: 'Explain flowing mode and paused mode in Readable streams.',
        shortAnswer: 'Readables start paused, where you pull with read(); attaching a data listener, calling resume() or pipe() switches to flowing, where chunks are pushed to listeners as fast as possible.',
        detailedAnswer: [
          'Paused: listen for `readable` and call `read()` until it returns null.',
          'Flowing: `data` events; `pause()` returns to paused mode (unless piped).',
          'Data emitted in flowing mode with no listener is lost.',
          'Async iteration is pull-based and the recommended approach.',
        ],
        followUp: 'What happens if you call pause() on a stream that is piped?',
        trap: 'Believing streams start flowing automatically on creation.',
      },
      {
        category: 'nodejs', kind: 'concept', difficulty: 'advanced', topic: 'Async iteration',
        question: 'What are the semantics of consuming a Readable with for await...of — backpressure, errors and early exit?',
        shortAnswer: 'The loop pulls one chunk at a time (natural backpressure), rethrows stream errors inside the loop, and destroys the stream if you break, return or throw out of it.',
        detailedAnswer: [
          'Readables implement `Symbol.asyncIterator`.',
          'The next chunk is not read until the loop body (including awaits) finishes — slow consumers slow the producer.',
          'An `error` event rejects the pending `next()`, so try/catch around the loop catches it.',
          '`break` calls `return()` on the iterator, which destroys the stream and releases file descriptors.',
          'You can pass `{ destroyOnReturn: false }` to `readable.iterator()` to keep it open.',
        ],
        followUp: 'How would you process chunks concurrently while keeping a bound on concurrency?',
        trap: 'Thinking a break leaves the file descriptor open.',
      },
    ],
  },

  'writable-streams': {
    summary: 'A Writable accepts data via write() and end(). write() returns false when the internal buffer exceeds highWaterMark — wait for drain before writing more. finish fires after end() once all data is flushed.',
    topics: ['Writable', 'write()', 'end()', 'drain', 'finish', 'close', '_write', 'cork', 'uncork'],
    sections: [
      section('introduction', undefined,
        text('Writables are destinations: files, HTTP responses, sockets, database bulk inserters. Writing correctly means respecting the signals they send back.'),
      ),
      section('definition', 'The Writable API',
        table('Writable API', ['Member', 'Meaning'], [
          ['`write(chunk, enc?, cb?)`', 'Queue a chunk. Returns `false` when the buffer is at/over highWaterMark.'],
          ['`end(chunk?, cb?)`', 'No more writes. Optional final chunk.'],
          ['`drain` event', 'Buffer emptied — safe to write again after a `false`.'],
          ['`finish` event', 'After `end()`, all data handed to the underlying system.'],
          ['`close` event', 'Underlying resource (fd, socket) closed.'],
          ['`cork()` / `uncork()`', 'Buffer several writes and flush them together (uses `_writev`).'],
          ['`writableLength`, `writableHighWaterMark`', 'Current buffered bytes and the threshold.'],
        ]),
      ),
      section('why', 'Why the return value matters',
        bullets(
          'If you write faster than the destination can accept, the extra data piles up in memory.',
          '`write()` returning `false` is the destination saying "slow down". Ignoring it causes unbounded memory growth.',
          'The data is still accepted — `false` is advice, not rejection.',
        ),
      ),
      section('internals', 'Inside a Writable',
        bullets(
          'Each `write()` either goes straight to `_write` or into an internal buffer if a write is in progress.',
          '`_write(chunk, encoding, callback)` performs the actual I/O and **must** call `callback` (with an error or nothing) to receive the next chunk.',
          'After `end()`, `_final(cb)` runs (if defined), then `finish`, then `close` (with `emitClose: true`, the default).',
          'Writing after `end()` emits an `ERR_STREAM_WRITE_AFTER_END` error.',
        ),
        flow(['write() → buffer', 'length ≥ highWaterMark → returns false', '_write drains buffer', "buffer empty → 'drain'", "end() → _final → 'finish' → 'close'"], { title: 'Writable lifecycle', direction: 'vertical' }),
      ),
      section('example', 'Writing safely',
        code({
          title: 'A custom Writable',
          code: dedent(`
            const { Writable } = require('node:stream');

            const logger = new Writable({
              write(chunk, encoding, callback) {
                console.log('got', chunk.toString());
                callback();
              },
            });
            logger.on('finish', () => console.log('finish'));
            logger.write('a');
            logger.end('b');
          `),
          expectedOutput: 'got a\ngot b\nfinish',
          explanation: ['The `write` option is `_write`.', 'Calling `callback()` tells the stream we are ready for the next chunk.', '`end(\'b\')` writes a last chunk then triggers `finish`.'],
        }),
        code({
          title: 'write() returns false at highWaterMark',
          code: dedent(`
            const { Writable } = require('node:stream');
            const slow = new Writable({
              highWaterMark: 4,
              write(chunk, enc, cb) { setTimeout(cb, 10); },
            });
            console.log(slow.write('ab'));
            console.log(slow.write('cd'));
            slow.on('drain', () => console.log('drain'));
          `),
          expectedOutput: 'true\nfalse\ndrain',
          explanation: [
            'After the first write 2 bytes are buffered (< 4) → `true`.',
            'After the second, 4 bytes are buffered (not < 4) → `false`.',
            'Once both callbacks complete, the buffer empties and `drain` fires.',
          ],
        }),
      ),
      section('real-world', 'Real-world: writing a big CSV export',
        code({
          title: 'Respecting drain with events.once',
          code: dedent(`
            const fs = require('node:fs');
            const { once } = require('node:events');

            async function exportRows(rows, path) {
              const out = fs.createWriteStream(path);
              for (const row of rows) {
                if (!out.write(row.join(',') + '\\n')) {
                  await once(out, 'drain');
                }
              }
              out.end();
              await once(out, 'finish');
            }
          `),
          explanation: ['When `write` returns false we await `drain` before continuing.', 'Waiting for `finish` guarantees the data was flushed before reporting success.'],
        }),
      ),
      section('mistakes', 'Common mistakes',
        bullets(
          'Ignoring `write()` returning false — memory balloons on slow disks/clients.',
          'Forgetting to call the callback in `_write` — the stream stalls forever.',
          'Treating `finish` and `close` as the same — `close` means the fd is released.',
          'Writing after `end()` → `ERR_STREAM_WRITE_AFTER_END`.',
        ),
      ),
      section('interview', 'Interview angle',
        interviewTip('Say clearly: `write()` always accepts the chunk; `false` means "buffer full, wait for drain".'),
      ),
      section('practice', 'Practice',
        text('Write a function `writeMany(stream, n)` that writes `n` lines to a Writable and resolves when finished, awaiting `drain` whenever write returns false.'),
      ),
      section('summary', 'Summary',
        bullets('`write()` → boolean backpressure signal.', '`drain` → resume writing.', '`end()` → `finish` → `close`.', 'Always call the `_write` callback.'),
      ),
    ],
    revisionNotes: [
      'write() returns writableLength < highWaterMark after queuing.',
      'false does not drop data — it asks you to wait for "drain".',
      'Order after end(): _final → finish → close.',
      '_write must call its callback; errors via callback(err).',
      'cork/uncork batch writes into _writev.',
      'write after end → ERR_STREAM_WRITE_AFTER_END.',
    ],
    quiz: [
      {
        kind: 'mcq', difficulty: 'intermediate',
        prompt: 'stream.write(chunk) returned false. What happened to chunk?',
        options: ['It was discarded', 'It was buffered; you should wait for drain before writing more', 'An error event will fire', 'The stream was ended'],
        answer: 1,
        explanation: 'The chunk is still queued. false is a backpressure signal, not a rejection.',
      },
      {
        kind: 'find-bug', difficulty: 'intermediate',
        prompt: 'Why does this Writable process only the first chunk?',
        code: "new Writable({\n  write(chunk, enc, cb) {\n    db.insert(chunk);\n  },\n});",
        options: ['Writables need objectMode', 'The callback cb is never called, so the stream never asks for the next chunk', 'db.insert must be synchronous', 'write must return true'],
        answer: 1,
        explanation: 'The stream waits for cb() before passing the next chunk. Call cb() (or cb(err)) after the insert completes.',
      },
      {
        kind: 'mcq', difficulty: 'beginner',
        prompt: "Which event tells you all data has been flushed after end()?",
        options: ["'end'", "'drain'", "'finish'", "'readable'"],
        answer: 2,
        explanation: "'finish' is the Writable completion event. 'end' belongs to Readables; 'drain' is only about the buffer emptying.",
      },
    ],
    interview: [
      {
        category: 'nodejs', kind: 'concept', difficulty: 'intermediate', topic: 'Writable streams',
        question: 'What does the return value of writable.write() mean and how should you react to it?',
        shortAnswer: 'It returns false when the internal buffer has reached highWaterMark; the chunk is still queued, but you should stop writing until the drain event.',
        detailedAnswer: [
          'Returns `writableLength < writableHighWaterMark` after queuing.',
          'Ignoring it lets buffered data grow without bound.',
          'Pattern: `if (!ws.write(x)) await once(ws, \'drain\')`.',
          '`pipe`/`pipeline` do this automatically.',
        ],
        followUp: 'How does pipe() implement this internally?',
        trap: 'Thinking false means the write failed and retrying the same chunk (duplicates data).',
      },
      {
        category: 'nodejs', kind: 'concept', difficulty: 'beginner', topic: 'Writable streams',
        question: "What is the difference between a Writable's 'finish' and 'close' events?",
        shortAnswer: "'finish' fires after end() once all data has been flushed to the underlying system; 'close' fires afterwards when the underlying resource such as the file descriptor is closed.",
        detailedAnswer: [
          'Order: `end()` → `_final` → `finish` → `close`.',
          '`close` is emitted by default (`emitClose: true`), also after `destroy()` without finish.',
          'If you need the file to be fully closed (e.g. before renaming it), wait for `close`.',
        ],
        followUp: 'Which event should you wait for before telling the client an upload is saved?',
        trap: "Waiting for 'end' on a Writable — that is a Readable event and never fires.",
      },
    ],
  },

  'duplex-streams': {
    summary: 'A Duplex stream has independent readable and writable sides in one object — the classic example is net.Socket, where what you write goes to the peer and what you read comes from it.',
    topics: ['Duplex', 'net.Socket', 'allowHalfOpen', 'readable side', 'writable side', 'Duplex.from'],
    sections: [
      section('introduction', undefined,
        text('Some resources are two-way: a TCP connection sends and receives. A Duplex is a single stream that is both Readable and Writable.'),
      ),
      section('definition', 'Duplex vs Transform',
        table('Duplex vs Transform', ['', 'Duplex', 'Transform'], [
          ['Sides', 'Two independent channels', 'Output derived from input'],
          ['You implement', '`_read` and `_write`', '`_transform` (and optional `_flush`)'],
          ['Example', '`net.Socket`, TLS socket', '`zlib.createGzip()`'],
          ['Write "a", read…', 'Whatever the peer sends', 'f("a")'],
        ]),
      ),
      section('why', 'Why Duplex exists',
        bullets(
          'Network connections naturally have two directions with separate buffers and backpressure.',
          'One object means one lifetime: destroying the socket closes both sides.',
          'Protocol libraries (WebSocket, HTTP/2 sessions) are built on Duplex sockets.',
        ),
      ),
      section('internals', 'How a Duplex works',
        bullets(
          'Duplex inherits from Readable and implements Writable\'s interface: it has both `readableHighWaterMark` and `writableHighWaterMark`.',
          'Each side has its own buffer, backpressure and end: `end()` ends the writable side; `push(null)` ends the readable side.',
          '`allowHalfOpen` (default `true`) keeps the writable side open after the readable side ends. With `false`, the writable side ends automatically.',
          'For sockets, ending the writable side sends a TCP FIN.',
        ),
        flow(['Your code: socket.write()', 'Writable side → network → peer', "Peer → network → Readable side: 'data'"], { title: 'net.Socket as Duplex', direction: 'vertical' }),
      ),
      section('example', 'Duplex streams in code',
        code({
          title: 'A TCP echo server (each socket is a Duplex)',
          code: dedent(`
            const net = require('node:net');
            const { pipeline } = require('node:stream');

            const server = net.createServer((socket) => {
              // readable side → writable side of the same socket
              pipeline(socket, socket, (err) => {
                if (err) console.error('socket error', err.code);
              });
            });
            server.listen(4000, () => console.log('echo on 4000'));
          `),
          expectedOutput: 'echo on 4000',
          explanation: ['Data read from the client is written back to it.', 'Two directions, one object.', 'Test with `nc localhost 4000`.'],
        }),
        code({
          title: 'Implementing a Duplex',
          code: dedent(`
            const { Duplex } = require('node:stream');

            const d = new Duplex({
              read() { this.push('from-readable'); this.push(null); },
              write(chunk, enc, cb) { console.log('written:', chunk.toString()); cb(); },
            });
            d.on('data', (c) => console.log('read:', c.toString()));
            d.write('hello');
          `),
          expectedOutput: 'written: hello\nread: from-readable',
          explanation: [
            'The written data does **not** show up on the readable side — the sides are independent.',
            'The write is processed synchronously; data events are emitted asynchronously.',
          ],
        }),
      ),
      section('real-world', 'Real-world usage',
        bullets(
          'TCP / TLS servers and clients (`net`, `tls`).',
          'Child process stdio combined into one Duplex (`Duplex.from({ readable, writable })`, Node 16.8+).',
          'A Redis or Postgres client: writes commands, reads replies on the same socket.',
        ),
      ),
      section('mistakes', 'Common mistakes',
        bullets(
          'Expecting writes to appear on the readable side (that is Transform/PassThrough behaviour).',
          'Forgetting `allowHalfOpen`: a server that only reads until EOF and then wants to reply needs the writable side to stay open.',
          'Handling `error` on only one side — a Duplex emits one `error` for the whole object.',
        ),
      ),
      section('interview', 'Interview angle',
        interviewTip('Give `net.Socket` as the Duplex example and contrast it with Transform (gzip) in one sentence.'),
      ),
      section('practice', 'Practice',
        text('Build a TCP server that uppercases every line a client sends. (Hint: pipeline(socket, upperTransform, socket).)'),
      ),
      section('summary', 'Summary',
        bullets('Duplex = independent Readable + Writable sides.', '`net.Socket` is the canonical example.', 'Transform is a special Duplex whose output depends on input.', '`allowHalfOpen` controls auto-ending the writable side.'),
      ),
    ],
    revisionNotes: [
      'Duplex: _read + _write, two buffers, two highWaterMarks.',
      'net.Socket, tls.TLSSocket are Duplex.',
      'Transform extends Duplex; PassThrough is the identity Transform.',
      'allowHalfOpen default true.',
      'Duplex.from() builds a Duplex from many inputs (Node 16.8+).',
    ],
    quiz: [
      {
        kind: 'predict-output', difficulty: 'intermediate',
        prompt: "A plain Duplex whose read() pushes nothing until the peer sends data. You call duplex.write('ping'). Will a 'data' event with 'ping' fire?",
        options: ['Yes, immediately', 'Yes, on the next tick', 'No — the writable and readable sides are independent', 'Only in objectMode'],
        answer: 2,
        explanation: 'In a Duplex, what you write goes to the destination (e.g. the network) and is not echoed to the readable side. A PassThrough would echo it.',
      },
      {
        kind: 'mcq', difficulty: 'beginner',
        prompt: 'Which pair is correct?',
        options: ['Duplex: zlib.createGzip; Transform: net.Socket', 'Duplex: net.Socket; Transform: zlib.createGzip', 'Both are Writable only', 'Duplex: fs.createReadStream'],
        answer: 1,
        explanation: 'Sockets have independent directions (Duplex); gzip computes its output from its input (Transform).',
      },
    ],
    interview: [
      {
        category: 'nodejs', kind: 'concept', difficulty: 'intermediate', topic: 'Duplex streams',
        question: 'What is the difference between a Duplex stream and a Transform stream?',
        shortAnswer: 'Both are readable and writable, but a Duplex has two independent channels (a socket), while a Transform computes its readable output from what is written (gzip).',
        detailedAnswer: [
          'Duplex: implement `_read` and `_write` separately.',
          'Transform: implement `_transform(chunk, enc, cb)` and optionally `_flush(cb)`.',
          'Transform extends Duplex and wires the writable input to the readable output.',
          '`PassThrough` is a Transform that outputs input unchanged — handy for testing and tee-ing.',
        ],
        followUp: 'What is allowHalfOpen?',
        trap: 'Saying a socket is a Transform because "it transforms data over the network".',
      },
    ],
  },

  'transform-streams': {
    summary: 'A Transform stream receives chunks, computes new chunks and pushes them out. Implement transform(chunk, encoding, callback) and optionally flush(callback) for the final output.',
    topics: ['Transform', '_transform', '_flush', 'PassThrough', 'line splitter', 'objectMode', 'zlib'],
    sections: [
      section('introduction', undefined,
        text('Transforms are the middle of a pipeline: decompress, parse CSV, uppercase, encrypt, hash, filter. You write a small function; the stream machinery handles buffering and backpressure.'),
      ),
      section('definition', 'The Transform contract',
        bullets(
          '`transform(chunk, encoding, callback)` — called for each input chunk.',
          'Push 0, 1 or many outputs with `this.push(x)`, or pass one via `callback(null, x)`.',
          'Call `callback()` exactly once per chunk (with an error to fail the stream).',
          '`flush(callback)` — called after input ends, before `end` on the readable side; emit any leftover state.',
          'Separate modes per side: `readableObjectMode` / `writableObjectMode`.',
        ),
      ),
      section('why', 'Why Transforms',
        bullets(
          'Reusable steps you can compose: `pipeline(src, parse, validate, toJSON, dest)`.',
          'Bounded memory: each step only holds what it needs (e.g. a partial line).',
          'Backpressure propagates through every stage automatically.',
        ),
      ),
      section('internals', 'How a Transform runs',
        bullets(
          'Written chunks enter the writable buffer; Node calls `_transform` one chunk at a time.',
          'Pushed outputs enter the readable buffer.',
          'If the readable buffer is full (nobody reading), Node stops calling `_transform` → writable buffer fills → upstream `write()` returns false.',
          'On `end()` of the writable side, `_flush` runs, then the readable side ends.',
        ),
        diagram('stream-pipeline', 'A Transform sits between Readable and Writable; when its output buffer is full, it stops accepting input.'),
      ),
      section('example', 'Writing Transforms',
        code({
          title: 'Uppercase transform',
          code: dedent(`
            const { Transform, Readable } = require('node:stream');
            const { pipeline } = require('node:stream/promises');

            const upper = new Transform({
              transform(chunk, encoding, callback) {
                callback(null, chunk.toString().toUpperCase());
              },
            });

            (async () => {
              await pipeline(Readable.from(['hello ', 'world']), upper, process.stdout);
            })();
          `),
          expectedOutput: 'HELLO WORLD',
          explanation: ['`callback(null, data)` is shorthand for `this.push(data); callback()`.', 'Note: piping into `process.stdout` is fine in pipeline; stdout is never closed by it.'],
        }),
        code({
          title: 'Line splitter with flush (object mode output)',
          code: dedent(`
            const { Transform, Readable } = require('node:stream');

            function lines() {
              let rest = '';
              return new Transform({
                readableObjectMode: true,
                transform(chunk, enc, cb) {
                  const parts = (rest + chunk.toString()).split('\\n');
                  rest = parts.pop();
                  for (const line of parts) this.push(line);
                  cb();
                },
                flush(cb) {
                  if (rest) this.push(rest);
                  cb();
                },
              });
            }

            (async () => {
              const src = Readable.from(['a\\nb', 'c\\nd']);
              for await (const line of src.pipe(lines())) console.log(JSON.stringify(line));
            })();
          `),
          expectedOutput: '"a"\n"bc"\n"d"',
          explanation: [
            'Chunk boundaries do not respect lines: `b` and `c` arrive in different chunks.',
            'We keep the incomplete last part in `rest` and prepend it to the next chunk.',
            '`flush` emits `d`, which had no trailing newline.',
            'One input chunk produced 0, 1 or 2 outputs — that is normal.',
          ],
        }),
        code({
          title: 'Filter transform in object mode',
          code: dedent(`
            const { Transform } = require('node:stream');
            const onlyActive = new Transform({
              objectMode: true,
              transform(user, enc, cb) {
                if (user.active) cb(null, user);
                else cb(); // drop it
              },
            });
          `),
          explanation: ['Calling `cb()` with no data drops the chunk.'],
        }),
      ),
      section('real-world', 'Real-world: gzip + hash in one pass',
        code({
          title: 'Compress an upload and compute its checksum',
          code: dedent(`
            const fs = require('node:fs');
            const zlib = require('node:zlib');
            const crypto = require('node:crypto');
            const { Transform } = require('node:stream');
            const { pipeline } = require('node:stream/promises');

            async function store(src, dest) {
              const hash = crypto.createHash('sha256');
              const tap = new Transform({
                transform(chunk, enc, cb) { hash.update(chunk); cb(null, chunk); },
              });
              await pipeline(fs.createReadStream(src), tap, zlib.createGzip(), fs.createWriteStream(dest));
              return hash.digest('hex');
            }
          `),
          explanation: ['`tap` passes data through unchanged while updating the hash.', 'The file is read once, hashed and compressed in a single streaming pass.'],
        }),
      ),
      section('mistakes', 'Common mistakes',
        bullets(
          'Calling the callback twice for one chunk → `ERR_MULTIPLE_CALLBACK`.',
          'Forgetting `flush` → the last partial record is silently lost.',
          'Splitting on `\\n` without keeping the remainder (lines broken at chunk edges).',
          'Using `toString()` per chunk on multi-byte text — use `setEncoding` upstream or a StringDecoder in the transform.',
        ),
      ),
      section('interview', 'Interview angle',
        interviewTip('Interviewers like "write a line-splitting Transform". Remember: keep a remainder, push complete lines, emit the rest in `flush`.'),
      ),
      section('practice', 'Practice',
        text('Write a Transform that parses newline-delimited JSON (NDJSON) into objects, emitting an error for invalid lines via `callback(err)`.'),
      ),
      section('summary', 'Summary',
        bullets('Implement `transform(chunk, enc, cb)`; push 0..n outputs.', 'Call `cb` once per chunk.', '`flush` emits leftovers.', 'Object mode per side for parsers.'),
      ),
    ],
    revisionNotes: [
      'Transform extends Duplex; implement transform + optional flush.',
      'callback(null, data) === push(data) + callback().',
      'cb twice → ERR_MULTIPLE_CALLBACK.',
      'flush runs after writable end, before readable end.',
      'readableObjectMode / writableObjectMode configure each side.',
      'PassThrough = identity transform.',
    ],
    quiz: [
      {
        kind: 'find-bug', difficulty: 'intermediate',
        prompt: 'A CSV line parser loses the last row of every file. Why?',
        code: "new Transform({\n  transform(chunk, enc, cb) {\n    const parts = (this.rest + chunk).split('\\n');\n    this.rest = parts.pop();\n    parts.forEach((p) => this.push(p));\n    cb();\n  },\n});",
        options: ['split is too slow', 'There is no flush() to push the remaining this.rest when input ends', 'push cannot be called in a loop', 'cb must be called before push'],
        answer: 1,
        explanation: 'If the file does not end with a newline, the last row sits in this.rest forever. flush(cb) must push it. (Also initialise this.rest to "".)',
      },
      {
        kind: 'mcq', difficulty: 'beginner',
        prompt: 'How do you drop a chunk in a Transform?',
        options: ['throw an error', 'call callback() without data', 'return false', 'call this.push(null)'],
        answer: 1,
        explanation: 'callback() with no data acknowledges the chunk without output. push(null) would end the whole stream.',
      },
      {
        kind: 'complete-code', difficulty: 'intermediate',
        prompt: 'Emit a final summary line after all input has been processed.',
        code: "new Transform({\n  transform(c, e, cb) { this.count++; cb(null, c); },\n  /* ??? */(cb) { cb(null, `total ${this.count}`); },\n});",
        options: ['final', 'flush', 'end', 'destroy'],
        answer: 1,
        explanation: 'flush runs once after the writable side ends and before the readable side ends. final exists on Writable (_final) but does not push readable output in a Transform.',
      },
    ],
    interview: [
      {
        category: 'nodejs', kind: 'concept', difficulty: 'intermediate', topic: 'Transform streams',
        question: 'How do you implement a custom Transform stream and what is flush for?',
        shortAnswer: 'Provide transform(chunk, encoding, callback) that pushes zero or more outputs and calls callback once; flush(callback) runs after input ends so you can emit buffered leftovers.',
        detailedAnswer: [
          'Extend `Transform` or pass options to `new Transform({...})`.',
          '`callback(err)` errors the stream; `callback(null, data)` pushes one output.',
          'Keep state on the instance or in a closure (e.g. a remainder buffer).',
          '`flush` is where parsers emit the final partial record or a footer.',
        ],
        followUp: 'How does backpressure work through a Transform?',
        trap: 'Assuming one input chunk must produce exactly one output chunk.',
      },
      {
        category: 'nodejs', kind: 'scenario', difficulty: 'advanced', topic: 'Transform streams',
        question: 'Design a streaming pipeline that reads a multi-GB NDJSON file, validates each record, and writes invalid ones to an errors file while sending valid ones to the database in batches of 500.',
        shortAnswer: 'Use pipeline(readStream, lineSplitter, parseValidate (objectMode), batcher (objectMode, flush remainder), dbWriter Writable that awaits inserts before calling its callback), with invalid rows written to a separate write stream respecting drain.',
        detailedAnswer: [
          'Line splitter keeps a remainder and flushes the last line.',
          'Validation Transform pushes valid objects; invalid ones go to an errors Writable (await drain when write returns false).',
          'Batcher collects 500 objects then pushes an array; `flush` pushes the partial last batch.',
          'DB Writable calls `cb()` only after the insert promise resolves — this throttles the whole pipeline to DB speed.',
          '`pipeline` from `stream/promises` gives one error path and destroys every stage on failure.',
        ],
        followUp: 'How would you make DB inserts run with concurrency 4 without losing backpressure?',
        trap: 'Collecting all valid rows in an array and inserting at the end — defeats streaming.',
      },
    ],
  },
};

export default content;
