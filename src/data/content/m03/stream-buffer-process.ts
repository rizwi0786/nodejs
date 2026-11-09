import type { ModuleContent } from '../../../types';
import { bullets, code, dedent, diagram, flow, interviewTip, section, steps, table, text, tip, warn } from '../helpers';

const content: Partial<ModuleContent> = {
  // ───────────────────────────────────────────────────────────
  'stream-module': {
    summary: '`node:stream` processes data piece by piece: Readable, Writable, Duplex and Transform streams with built-in backpressure. Connect them with `pipeline` from `node:stream/promises`.',
    topics: ['streams', 'Readable', 'Writable', 'Duplex', 'Transform', 'PassThrough', 'backpressure', 'highWaterMark', 'pipeline', 'stream/promises', 'object mode', 'async iteration', 'drain'],
    sections: [
      section('introduction', undefined,
        text('A 5 GB CSV, a video upload, a proxied response — loading it all into memory crashes the process. Streams move data in small chunks, so memory stays flat and work starts immediately.'),
      ),
      section('definition', 'Definition',
        table('Stream types', ['Type', 'Role', 'Examples'], [
          ['Readable', 'Source you read from', '`fs.createReadStream`, `req` (server), `process.stdin`'],
          ['Writable', 'Destination you write to', '`fs.createWriteStream`, `res` (server), `process.stdout`'],
          ['Duplex', 'Independent read and write sides', '`net.Socket`, TLS socket'],
          ['Transform', 'Duplex whose output is computed from input', '`zlib.createGzip()`, `crypto.createHash()`, CSV parsers'],
          ['PassThrough', 'Transform that passes data unchanged', 'Tapping/metrics, testing'],
        ]),
        text('Every stream is an EventEmitter. Byte streams carry `Buffer`s (or strings with an encoding); `objectMode: true` streams carry any JS value.'),
      ),
      section('why', 'Why streams',
        bullets(
          'Constant memory regardless of data size.',
          'Lower latency: the first bytes are sent before the last are read.',
          'Composable: read → decompress → parse → transform → write.',
          '**Backpressure** automatically slows a fast producer down to the consumer\'s speed.',
        ),
      ),
      section('internals', 'Buffers and backpressure',
        steps(
          'Each stream has an internal buffer limited by `highWaterMark` (64 KiB for byte streams since Node 22, 16 KiB before; `fs.createReadStream` uses 64 KiB; 16 objects in object mode).',
          '`writable.write(chunk)` returns **false** once the buffer reaches the high-water mark.',
          'A well-behaved producer stops writing and waits for the `\'drain\'` event.',
          'Readable streams stop calling `_read()` when their buffer is full and nobody consumes.',
          '`pipeline()` wires all of this up for you and destroys every stream on error.',
        ),
        diagram('stream-pipeline', 'readable → transform → writable; when the writable is slow, pressure propagates back to the source.'),
      ),
      section('visual', 'Important methods',
        table('stream — important APIs', ['API', 'What it does', 'Style'], [
          ['`pipeline(a, b, c)` (node:stream/promises)', 'Connect streams, propagate errors, clean up', 'async (promise)'],
          ['`stream.pipeline(a, b, cb)`', 'Callback version', 'async (callback)'],
          ['`for await (const chunk of readable)`', 'Consume a Readable with backpressure', 'async iterator'],
          ['`readable.on(\'data\' | \'end\' | \'error\')`', 'Event-based consumption (flowing mode)', 'event'],
          ['`writable.write(chunk)` → boolean', 'Write; false means "wait for drain"', 'stream'],
          ['`writable.end(chunk?)`', 'Finish writing; emits `finish`', 'stream'],
          ['`new Transform({ transform(chunk, enc, cb) {} })`', 'Custom transform', 'stream'],
          ['`Readable.from(iterable)`', 'Create a Readable from an array/generator', 'stream'],
          ['`finished(stream)` (stream/promises)', 'Wait until a stream ends or errors', 'async (promise)'],
          ['`stream.destroy(err?)`', 'Abort and release resources', 'sync'],
          ['`readable.pipe(dest)`', 'Legacy piping (no error propagation)', 'stream'],
          ['`Readable.toWeb` / `fromWeb`', 'Convert to/from Web Streams (fetch bodies)', 'stream'],
        ]),
      ),
      section('example', 'Examples',
        code({
          title: 'Gzip a large file with pipeline',
          code: dedent(`
            import { createReadStream, createWriteStream } from 'node:fs';
            import { createGzip } from 'node:zlib';
            import { pipeline } from 'node:stream/promises';

            await pipeline(
              createReadStream('access.log'),
              createGzip(),
              createWriteStream('access.log.gz'),
            );
            console.log('compressed');
          `),
          expectedOutput: 'compressed',
          explanation: [
            'Memory stays around a few hundred KiB even for multi-GB files.',
            'If any stream fails, `pipeline` destroys all of them and the promise rejects.',
          ],
        }),
        code({
          title: 'A custom Transform in object mode',
          code: dedent(`
            import { Readable, Transform, Writable } from 'node:stream';
            import { pipeline } from 'node:stream/promises';

            const toUpper = new Transform({
              objectMode: true,
              transform(user, _enc, cb) { cb(null, { ...user, name: user.name.toUpperCase() }); },
            });
            const print = new Writable({
              objectMode: true,
              write(user, _enc, cb) { console.log(user.id, user.name); cb(); },
            });

            await pipeline(Readable.from([{ id: 1, name: 'ada' }, { id: 2, name: 'linus' }]), toUpper, print);
            console.log('done');
          `),
          expectedOutput: '1 ADA\n2 LINUS\ndone',
          explanation: [
            '`Readable.from` turns an array (or async generator, e.g. DB cursor) into a stream.',
            'Call `cb()` exactly once per chunk; pass an error as the first argument to fail the pipeline.',
          ],
        }),
        code({
          title: 'Respecting backpressure manually',
          code: dedent(`
            import { createWriteStream } from 'node:fs';
            import { once } from 'node:events';

            const out = createWriteStream('numbers.txt');
            for (let i = 0; i < 1_000_000; i++) {
              if (!out.write(i + '\\n')) await once(out, 'drain');   // pause until flushed
            }
            out.end();
            await once(out, 'finish');
            console.log('written');
          `),
          expectedOutput: 'written',
          explanation: ['Without the `drain` wait, all one million strings would pile up in memory.'],
        }),
      ),
      section('real-world', 'Real-world usage',
        bullets(
          'File downloads: `pipeline(createReadStream(file), res)`.',
          'Uploads straight to S3/disk without buffering (e.g. busboy, an npm package, parses multipart as a stream).',
          'CSV/NDJSON exports: DB cursor → `Readable.from` → Transform to CSV → `res`.',
          'Reverse proxies: `pipeline(clientReq, upstreamReq)`.',
          'On-the-fly compression: `pipeline(source, createGzip(), res)`.',
        ),
      ),
      section('mistakes', 'Common mistakes',
        bullets(
          'Using `.pipe()` chains — an error in the middle does not close the others (fd/memory leaks). Use `pipeline`.',
          'Ignoring the return value of `write()` → unbounded memory.',
          'No `error` listener on a standalone stream → crash.',
          'Mixing `data` events and `for await` on the same stream.',
          'Calling the transform callback twice or never → errors or stalls.',
        ),
        code({
          title: 'Wrong vs right',
          code: dedent(`
            // ✗ if gzip fails, the read stream stays open
            createReadStream(src).pipe(createGzip()).pipe(createWriteStream(dst));

            // ✓ errors propagate, everything is cleaned up
            await pipeline(createReadStream(src), createGzip(), createWriteStream(dst));
          `),
          explanation: ['`pipeline` from `node:stream/promises` (Node 15+) is the default choice.'],
        }),
      ),
      section('interview', 'Interview tips',
        interviewTip('Name the four types, define backpressure as "write() returns false → wait for drain", and say "I use pipeline from stream/promises because pipe does not propagate errors."'),
      ),
      section('practice', 'Practice',
        steps('Write a Transform that converts NDJSON lines to CSV rows.', 'Stream a large file to an HTTP response and kill the client mid-download — confirm the file stream closes.'),
      ),
      section('summary', 'Summary',
        bullets(
          'Readable, Writable, Duplex, Transform (+ PassThrough).',
          'Backpressure: `write()` → false → wait for `drain`.',
          '`pipeline` (stream/promises) for composition and error handling.',
          '`for await` to consume, `Readable.from` to produce.',
        ),
      ),
    ],
    revisionNotes: [
      '4 types: Readable, Writable, Duplex, Transform.',
      'highWaterMark: 64 KiB default since Node 22 (16 KiB before); fs read streams 64 KiB; 16 objects in objectMode.',
      'write() false → await once(stream, "drain").',
      'pipeline destroys all streams on error; pipe does not.',
      'Readable streams are async iterable.',
      'Streams are EventEmitters — handle error.',
    ],
    quiz: [
      {
        kind: 'mcq', difficulty: 'intermediate',
        prompt: 'What does `writable.write(chunk)` returning `false` mean?',
        options: ['The chunk was discarded', 'The stream is closed', 'The internal buffer is full — stop writing until \'drain\'', 'The write failed with an error'],
        answer: 2,
        explanation: 'false is the backpressure signal; the chunk was still buffered. Errors are reported via the error event, not the return value.',
      },
      {
        kind: 'find-bug', difficulty: 'intermediate',
        prompt: 'Under load, this proxy leaks file descriptors when the client disconnects. Why?',
        code: "http.createServer((req, res) => {\n  fs.createReadStream('big.iso').pipe(res);\n});",
        options: ['createReadStream must be awaited', '.pipe() does not destroy the source when the destination errors/closes; use pipeline', 'res is not writable', 'big.iso must be opened with readFile'],
        answer: 1,
        explanation: 'pipe does not propagate errors or destroy the other streams. stream.pipeline cleans up every stream on failure.',
      },
      {
        kind: 'mcq', difficulty: 'beginner',
        prompt: 'Which stream type is `zlib.createGzip()`?',
        options: ['Readable', 'Writable', 'Transform', 'PassThrough'],
        answer: 2,
        explanation: 'It reads uncompressed input and writes compressed output — a Transform. PassThrough would leave data unchanged.',
      },
    ],
    interview: [
      {
        category: 'nodejs', kind: 'concept', difficulty: 'intermediate', topic: 'Streams',
        question: 'What is backpressure in Node.js streams and how is it handled?',
        shortAnswer: 'Backpressure is the mechanism that stops a fast producer from overwhelming a slow consumer: `write()` returns false when the buffer exceeds highWaterMark, and the producer waits for `drain`.',
        detailedAnswer: [
          'Each stream buffers up to `highWaterMark` bytes/objects.',
          'Readables pause reading from the source when nobody consumes.',
          '`pipeline`, `pipe` and `for await` handle it automatically.',
          'Ignoring it leads to unbounded memory growth and GC pauses.',
        ],
        followUp: 'How would you implement backpressure manually in a write loop?',
        trap: 'Thinking `false` means the data was lost.',
      },
      {
        category: 'nodejs', kind: 'concept', difficulty: 'intermediate', topic: 'Streams',
        question: 'Name the four fundamental stream types in Node.js and give a core example of each.',
        shortAnswer: 'Readable (`fs.createReadStream`, server `req`), Writable (`fs.createWriteStream`, server `res`), Duplex (`net.Socket`), and Transform (`zlib.createGzip`, `crypto.createHash`).',
        detailedAnswer: [
          'Duplex has independent read and write sides.',
          'Transform\'s output depends on its input.',
          'PassThrough is a trivial Transform.',
          'All are EventEmitters and support object mode.',
        ],
        followUp: 'When would you use objectMode?',
        trap: 'Calling an HTTP response a Readable stream (on the server it is Writable).',
      },
      {
        category: 'nodejs', kind: 'concept', difficulty: 'advanced', topic: 'Streams',
        question: 'Why should you use stream.pipeline instead of chaining .pipe()?',
        shortAnswer: '`pipe` does not forward errors or destroy the other streams, so failures leak file descriptors and memory and can leave requests hanging. `pipeline` propagates the first error, destroys every stream, and gives you one promise/callback.',
        detailedAnswer: [
          'With pipe you must attach an error handler to every stream.',
          'Client disconnects (ECONNRESET / premature close) are detected by pipeline.',
          '`node:stream/promises` pipeline accepts async generators as transforms.',
          'Supports `{ signal }` to abort via AbortController.',
        ],
        code: { id: 'm03-pipeline-iq', language: 'javascript', code: "import { pipeline } from 'node:stream/promises';\nawait pipeline(\n  fs.createReadStream('in.txt'),\n  async function* (source) {\n    for await (const chunk of source) yield chunk.toString().toUpperCase();\n  },\n  fs.createWriteStream('out.txt'),\n);" },
        followUp: 'How do you cancel a pipeline midway?',
        trap: 'Believing pipe() closes everything automatically on error.',
      },
    ],
  },

  // ───────────────────────────────────────────────────────────
  'buffer-module': {
    summary: '`Buffer` is Node\'s fixed-length binary data type — a `Uint8Array` subclass with encoding helpers. Create it with `Buffer.from`, `Buffer.alloc` or `Buffer.allocUnsafe`; `new Buffer()` is deprecated.',
    topics: ['Buffer', 'Buffer.from', 'Buffer.alloc', 'allocUnsafe', 'encodings', 'utf8', 'base64', 'base64url', 'hex', 'byteLength', 'Buffer.concat', 'subarray', 'Uint8Array', 'buffer pool'],
    sections: [
      section('introduction', undefined,
        text('Files, sockets, images and hashes are bytes, not text. JavaScript strings are UTF-16 text, so Node needs a byte container: `Buffer`.'),
      ),
      section('definition', 'Definition',
        bullets(
          'A `Buffer` is a fixed-size sequence of bytes (0–255), allocated outside the V8 heap.',
          '`Buffer` extends `Uint8Array`, so typed-array methods work.',
          'Global in Node (also `import { Buffer } from \'node:buffer\'`).',
          'Encodings: `utf8` (default), `hex`, `base64`, `base64url`, `latin1`, `ascii`, `utf16le`.',
        ),
      ),
      section('why', 'Why it matters',
        bullets(
          'Every stream chunk from fs/net is a Buffer by default.',
          'Protocol work: reading headers, magic numbers, binary formats.',
          'Encoding conversions: base64 for tokens/JSON, hex for hashes.',
        ),
      ),
      section('internals', 'Memory and allocation',
        steps(
          '`Buffer.alloc(n)` — zero-filled, safe.',
          '`Buffer.allocUnsafe(n)` — not zeroed (faster); may contain old memory, so overwrite it fully.',
          'Small `allocUnsafe`/`from` allocations (< 4 KiB) are sliced from a shared 8 KiB pool (`Buffer.poolSize`).',
          'Buffer memory is counted in `process.memoryUsage().external` / `arrayBuffers`, not the JS heap.',
          '`subarray()` (and the legacy `slice()`) returns a **view** sharing memory — changes affect the original.',
        ),
        warn('`new Buffer(n)` was deprecated (DEP0005) because `new Buffer(number)` could return uninitialized memory. Use `Buffer.alloc` / `Buffer.from`.'),
        code({
          title: 'Bytes vs characters (pure JS, TextEncoder)',
          runnable: true,
          code: dedent(`
            const enc = new TextEncoder();
            for (const s of ['hello', 'héllo', '€', '😀']) {
              console.log(s, 'length', s.length, 'bytes', enc.encode(s).length);
            }
          `),
          expectedOutput: 'hello length 5 bytes 5\nhéllo length 5 bytes 6\n€ length 1 bytes 3\n😀 length 2 bytes 4',
          explanation: [
            '`string.length` counts UTF-16 code units; UTF-8 byte count can be larger.',
            'In Node, `Buffer.byteLength(s)` gives the same numbers as the encoder here.',
            'Content-Length headers must use the byte count, not `length`.',
          ],
        }),
      ),
      section('visual', 'Important methods',
        table('Buffer — important methods', ['Method', 'What it does', 'Style'], [
          ['`Buffer.from(string, enc?)`', 'Encode string to bytes', 'sync'],
          ['`Buffer.from(array | arrayBuffer | buffer)`', 'Copy bytes (ArrayBuffer: shares memory)', 'sync'],
          ['`Buffer.alloc(size, fill?)`', 'Zero-filled buffer', 'sync'],
          ['`Buffer.allocUnsafe(size)`', 'Uninitialized (fast) buffer', 'sync'],
          ['`buf.toString(enc?, start?, end?)`', 'Decode to string', 'sync'],
          ['`Buffer.byteLength(str, enc?)`', 'Byte size of a string', 'sync'],
          ['`Buffer.concat(list, total?)`', 'Join chunks into one buffer', 'sync'],
          ['`buf.subarray(start, end)`', 'View without copy (`slice` is deprecated alias)', 'sync'],
          ['`buf.equals(b)` / `Buffer.compare(a, b)`', 'Compare contents', 'sync'],
          ['`buf.readUInt32BE(off)` / `writeInt16LE(v, off)`', 'Binary numbers at offsets', 'sync'],
          ['`buf.copy(target, tStart)` / `buf.fill(v)`', 'Copy / fill bytes', 'sync'],
          ['`Buffer.isBuffer(x)`', 'Type check', 'sync'],
        ]),
      ),
      section('example', 'Examples',
        code({
          title: 'Encodings',
          code: dedent(`
            const buf = Buffer.from('Hi Node');
            console.log(buf);
            console.log(buf.toString('hex'));
            console.log(buf.toString('base64'));
            console.log(Buffer.from('SGkgTm9kZQ==', 'base64').toString());
            console.log(Buffer.byteLength('€'), '€'.length);
          `),
          expectedOutput: '<Buffer 48 69 20 4e 6f 64 65>\n4869204e6f6465\nSGkgTm9kZQ==\nHi Node\n3 1',
          explanation: [
            'Buffers print as hex bytes: `48` = H, `69` = i.',
            'base64 round-trips back to the original text.',
            '€ is 3 bytes in UTF-8 but 1 UTF-16 code unit.',
          ],
        }),
        code({
          title: 'Collecting stream chunks correctly',
          code: dedent(`
            const chunks = [];
            for await (const chunk of req) chunks.push(chunk);
            const body = Buffer.concat(chunks).toString('utf8');
            console.log(body.length);
          `),
          expectedOutput: '27',
          explanation: [
            'Concatenate Buffers first, decode once. `body += chunk` can split a multi-byte character across chunks and corrupt it (length varies).',
          ],
        }),
        code({
          title: 'Views share memory',
          code: dedent(`
            const a = Buffer.from('hello');
            const view = a.subarray(0, 1);
            view[0] = 0x4a;           // 'J'
            console.log(a.toString());
            const copy = Buffer.from(a);
            copy[0] = 0x59;           // 'Y'
            console.log(a.toString(), copy.toString());
          `),
          expectedOutput: 'Jello\nJello Yello',
          explanation: ['`subarray` is a view; `Buffer.from(buffer)` copies.'],
        }),
      ),
      section('real-world', 'Real-world usage',
        bullets(
          'Basic auth header: `Buffer.from(user + \':\' + pass).toString(\'base64\')`.',
          'URL-safe tokens: `randomBytes(32).toString(\'base64url\')`.',
          'Detect file types by magic bytes: PNG starts with `89 50 4e 47`.',
          'Binary protocols (e.g. Postgres wire protocol) read lengths with `readUInt32BE`.',
        ),
        tip('Node 16+ also has global `atob`/`btoa`, but they are legacy browser APIs working on "binary strings". Prefer `Buffer` in Node code.'),
      ),
      section('mistakes', 'Common mistakes',
        bullets(
          '`new Buffer(...)` — deprecated and unsafe.',
          'Using `str.length` for Content-Length — use `Buffer.byteLength`.',
          '`allocUnsafe` without overwriting every byte → leaks old memory contents.',
          'Decoding each chunk separately (`chunk.toString()`) → broken multi-byte characters.',
          'Mutating a `subarray` and being surprised the original changed.',
        ),
        code({
          title: 'Wrong vs right',
          code: dedent(`
            // ✗
            const b = new Buffer(10);
            res.setHeader('content-length', json.length);

            // ✓
            const b = Buffer.alloc(10);
            res.setHeader('content-length', Buffer.byteLength(json));
          `),
          explanation: ['Safe allocation and byte-accurate lengths.'],
        }),
      ),
      section('interview', 'Interview tips',
        interviewTip('Expect "why was `new Buffer` deprecated?" and "string length vs byte length". Mention `alloc` vs `allocUnsafe` and that Buffer is a Uint8Array subclass.'),
      ),
      section('practice', 'Practice',
        steps('Write `isPng(buf)` that checks the first 8 bytes.', 'Encode a JSON object as base64url and decode it back (like a JWT segment).'),
      ),
      section('summary', 'Summary',
        bullets(
          'Buffer = fixed-length bytes, Uint8Array subclass, off-heap.',
          'Create with `from`, `alloc`, `allocUnsafe`; never `new Buffer`.',
          'Encodings: utf8, hex, base64, base64url.',
          '`byteLength` ≠ `string.length`.',
          '`subarray` shares memory; `Buffer.from(buf)` copies.',
        ),
      ),
    ],
    revisionNotes: [
      'Buffer extends Uint8Array; memory outside V8 heap (external).',
      'alloc = zeroed; allocUnsafe = fast, dirty; pool 8 KiB for small allocs.',
      'new Buffer() deprecated (DEP0005).',
      'Buffer.byteLength("€") = 3; "€".length = 1.',
      'subarray/slice share memory.',
      'Concat chunks, then decode once.',
    ],
    quiz: [
      {
        kind: 'predict-output', difficulty: 'intermediate',
        prompt: 'What is printed?',
        code: "console.log('café'.length, Buffer.byteLength('café'));",
        options: ['4 4', '4 5', '5 5', '5 4'],
        answer: 1,
        explanation: '"é" is one UTF-16 code unit but two UTF-8 bytes, so 4 characters and 5 bytes.',
      },
      {
        kind: 'mcq', difficulty: 'beginner',
        prompt: 'Which is the safe, modern way to create a 1 KiB buffer filled with zeros?',
        options: ['new Buffer(1024)', 'Buffer.allocUnsafe(1024)', 'Buffer.alloc(1024)', 'Buffer(1024)'],
        answer: 2,
        explanation: 'Buffer.alloc zero-fills. allocUnsafe may contain old memory, and the constructor forms are deprecated.',
      },
      {
        kind: 'predict-output', difficulty: 'intermediate',
        prompt: 'What is printed?',
        code: "const a = Buffer.from('abc');\nconst b = a.subarray(1);\nb[0] = 0x58; // 'X'\nconsole.log(a.toString());",
        options: ['abc', 'aXc', 'Xbc', 'Xc'],
        answer: 1,
        explanation: 'subarray creates a view over the same memory starting at index 1, so writing b[0] changes a[1].',
      },
    ],
    interview: [
      {
        category: 'nodejs', kind: 'concept', difficulty: 'beginner', topic: 'Buffer',
        question: 'What is a Buffer in Node.js and why was new Buffer() deprecated?',
        shortAnswer: 'A Buffer is a fixed-length chunk of raw bytes (a Uint8Array subclass) used for binary data. `new Buffer()` was deprecated because `new Buffer(number)` returned uninitialized memory and its overloaded behaviour caused security bugs.',
        detailedAnswer: [
          'Replacement APIs make intent explicit: `Buffer.from`, `Buffer.alloc`, `Buffer.allocUnsafe`.',
          'Buffer memory lives outside the V8 heap.',
          'Streams from fs and net yield Buffers by default.',
          'Encodings convert between bytes and strings.',
        ],
        followUp: 'When is Buffer.allocUnsafe acceptable?',
        trap: 'Describing Buffer as "a string type" or as stored on the JS heap.',
      },
      {
        category: 'nodejs', kind: 'output', difficulty: 'intermediate', topic: 'Buffer',
        question: 'Why can string.length differ from Buffer.byteLength(string), and when does it matter?',
        shortAnswer: '`length` counts UTF-16 code units, while byteLength counts encoded bytes (UTF-8 by default). Non-ASCII characters take 2–4 bytes, so they differ; it matters for Content-Length, DB column limits and binary protocols.',
        detailedAnswer: [
          'ASCII: 1 byte per character, numbers match.',
          '"é" → 2 bytes, "€" → 3 bytes, emoji → 4 bytes (and length 2 as a surrogate pair).',
          'Wrong Content-Length truncates or hangs responses.',
          'Frameworks usually compute it for you from a Buffer.',
        ],
        code: { id: 'm03-bytelength-iq', language: 'javascript', code: "console.log('😀'.length, Buffer.byteLength('😀'));", expectedOutput: '2 4' },
        followUp: 'How do you split a UTF-8 stream into strings safely?',
        trap: 'Assuming one character is always one byte.',
      },
      {
        category: 'nodejs', kind: 'concept', difficulty: 'advanced', topic: 'Buffer',
        question: 'How does Node allocate small Buffers, and what risks come with Buffer.allocUnsafe and buffer views?',
        shortAnswer: 'Small allocUnsafe/from buffers are carved from a shared 8 KiB pool for speed. allocUnsafe memory is not zeroed and may expose old data; views (subarray, pooled slices) share memory, so keeping a tiny slice can retain the whole pool slab and mutations leak across views.',
        detailedAnswer: [
          '`Buffer.poolSize` is 8192; allocations under half of it use the pool.',
          '`buf.buffer` may be the larger pooled ArrayBuffer — mind `byteOffset` when passing to other APIs.',
          'Always overwrite allocUnsafe buffers fully before exposing them.',
          'Copy with `Buffer.from(view)` to release large parents.',
          '`--zero-fill-buffers` forces zeroing for all allocations (slower).',
        ],
        followUp: 'Why might `new Uint8Array(buf.buffer)` give you more bytes than `buf.length`?',
        trap: 'Assuming `buf.buffer.byteLength === buf.length`.',
      },
    ],
  },

  // ───────────────────────────────────────────────────────────
  'process-module': {
    summary: 'The global `process` object describes and controls the running Node process: `argv`, `env`, `cwd()`, exit codes, signals, lifecycle events, memory and timing.',
    topics: ['process', 'process.argv', 'process.env', 'process.exit', 'process.exitCode', 'exit event', 'beforeExit', 'signals', 'SIGTERM', 'uncaughtException', 'unhandledRejection', 'memoryUsage', 'hrtime.bigint', 'graceful shutdown', '--env-file'],
    sections: [
      section('introduction', undefined,
        text('Configuration from env vars, CLI arguments, exit codes for CI, graceful shutdown on deploy — all go through `process`, a global EventEmitter (also `import process from \'node:process\'`).'),
      ),
      section('definition', 'Definition',
        bullets(
          '`process` is the current Node.js process: its inputs (argv, env, stdin), outputs (stdout, stderr, exit code) and lifecycle.',
          'It is an EventEmitter: `exit`, `beforeExit`, `uncaughtException`, `unhandledRejection`, `warning`, signal events.',
        ),
      ),
      section('why', 'Why it matters',
        bullets(
          '12-factor config comes from `process.env`.',
          'Containers stop apps with SIGTERM — you must shut down gracefully.',
          'Exit codes tell CI and orchestrators whether things succeeded.',
        ),
      ),
      section('internals', 'Process lifecycle',
        flow([
          'Start: argv/env populated',
          'Run main module + event loop',
          'Loop empty → beforeExit (may schedule more work)',
          'exit event (sync only)',
          'Process exits with process.exitCode',
        ], { title: 'From start to exit', direction: 'horizontal' }),
        bullets(
          '`process.exit(code)` exits **immediately** — pending I/O (even buffered stdout to a pipe) can be lost.',
          '`process.exitCode = 1` sets the code and lets Node exit naturally when the loop is empty.',
          '`exit` listeners must be synchronous; async work there never completes.',
          'Unhandled promise rejections crash the process by default since Node 15 (`--unhandled-rejections=throw`).',
        ),
      ),
      section('visual', 'Important APIs',
        table('process — important APIs', ['API', 'What it does', 'Style'], [
          ['`process.argv`', '`[nodePath, scriptPath, ...args]`', 'property'],
          ['`process.env`', 'Environment variables (all strings)', 'property'],
          ['`process.cwd()` / `chdir()`', 'Working directory', 'sync'],
          ['`process.exit(code)`', 'Exit now', 'sync'],
          ['`process.exitCode = n`', 'Exit code when the loop drains', 'property'],
          ['`process.on(\'exit\', fn)`', 'Last sync cleanup', 'event (sync handlers)'],
          ['`process.on(\'SIGTERM\' | \'SIGINT\', fn)`', 'Handle signals', 'event'],
          ['`process.on(\'uncaughtException\' | \'unhandledRejection\')`', 'Last-resort error logging', 'event'],
          ['`process.memoryUsage()`', '`{ rss, heapTotal, heapUsed, external, arrayBuffers }`', 'sync'],
          ['`process.hrtime.bigint()`', 'Monotonic nanosecond clock', 'sync'],
          ['`process.uptime()` / `pid` / `platform` / `version`', 'Process facts', 'sync / properties'],
          ['`process.stdin` / `stdout` / `stderr`', 'Standard streams', 'stream'],
          ['`process.nextTick(fn)`', 'Run fn before other queued callbacks', 'async (nextTick queue)'],
          ['`process.loadEnvFile(path?)`', 'Load a .env file (Node 20.12+/21.7+); CLI: `--env-file` (20.6+)', 'sync'],
        ]),
        table('process.exit vs process.exitCode', ['', '`process.exit(1)`', '`process.exitCode = 1`'], [
          ['When it exits', 'Immediately', 'When the event loop is empty'],
          ['Pending writes / I/O', 'May be lost', 'Completed'],
          ['`exit` event', 'Fires', 'Fires'],
          ['Use for', 'Fatal errors after logging (sync)', 'CLIs, scripts, tests'],
        ]),
      ),
      section('example', 'Examples',
        code({
          title: 'argv, env and exitCode',
          code: dedent(`
            // node report.js --month 2026-10
            console.log(process.argv.slice(2));
            const port = Number(process.env.PORT ?? 3000);
            console.log(typeof process.env.DEBUG, port);
            if (!process.env.DATABASE_URL) {
              console.error('DATABASE_URL is required');
              process.exitCode = 1;   // let stderr flush, exit naturally
            }
          `),
          expectedOutput: "[ '--month', '2026-10' ]\nundefined 3000\nDATABASE_URL is required",
          explanation: [
            'The first two argv entries are the node binary and the script path.',
            'Env vars are strings or `undefined` — always convert/validate.',
            'Exit status is 1 (check with `echo $?`).',
          ],
        }),
        code({
          title: 'Measuring time and memory',
          code: dedent(`
            const start = process.hrtime.bigint();
            const arr = Array.from({ length: 1e6 }, (_, i) => i * 2);
            const ms = Number(process.hrtime.bigint() - start) / 1e6;
            const { rss, heapUsed } = process.memoryUsage();
            console.log(ms.toFixed(1) + ' ms', Math.round(heapUsed / 1e6) + ' MB heap', Math.round(rss / 1e6) + ' MB rss');
          `),
          expectedOutput: '18.4 ms 41 MB heap 82 MB rss',
          explanation: ['`hrtime.bigint()` is monotonic — unaffected by clock changes, unlike `Date.now()`. Values vary.'],
        }),
        code({
          title: 'Graceful shutdown',
          code: dedent(`
            import http from 'node:http';
            const server = http.createServer((req, res) => res.end('ok')).listen(3000);

            function shutdown(signal) {
              console.log(signal, 'received, closing');
              server.close(() => {
                // close DB pools, flush logs...
                console.log('closed cleanly');
                process.exitCode = 0;
              });
              setTimeout(() => process.exit(1), 10_000).unref();   // hard deadline
            }
            process.once('SIGTERM', shutdown);
            process.once('SIGINT', shutdown);
          `),
          expectedOutput: 'SIGTERM received, closing\nclosed cleanly',
          explanation: [
            '`server.close` stops accepting connections and waits for in-flight requests.',
            'The unref\'d timer forces exit if something hangs, without keeping the process alive itself.',
            'Idle keep-alive sockets may delay `close` — `server.closeIdleConnections()` (Node 18.2+) helps (Node 19+ does it automatically on close).',
          ],
        }),
      ),
      section('real-world', 'Real-world usage',
        bullets(
          'Config validation at startup; fail fast with a clear message and non-zero exit code.',
          'Kubernetes/Docker: SIGTERM → stop accepting, drain, close pools, exit within the grace period.',
          'Log `uncaughtException`/`unhandledRejection` then exit — state may be corrupt; let the orchestrator restart.',
          'Expose `process.memoryUsage()` in metrics to spot leaks.',
        ),
        code({
          title: 'Last-resort handlers',
          code: dedent(`
            process.on('unhandledRejection', (reason) => {
              logger.fatal({ reason }, 'unhandled rejection');
              process.exit(1);
            });
            process.on('uncaughtException', (err) => {
              logger.fatal({ err }, 'uncaught exception');
              process.exit(1);   // do not keep running in an unknown state
            });
          `),
          explanation: ['`logger` represents your logging library (e.g. pino, an npm package). Use a synchronous destination for fatal logs.'],
        }),
      ),
      section('mistakes', 'Common mistakes',
        bullets(
          'Calling `process.exit()` right after `console.log` to a pipe — output can be truncated; prefer `exitCode`.',
          'Async work inside `exit` handlers — it never runs.',
          'Treating `process.env.FLAG` as a boolean — `\'false\'` is truthy.',
          'Swallowing `uncaughtException` and continuing to serve traffic.',
          'Running under `npm start` in Docker so SIGTERM never reaches Node — use `node` directly or an init (`--init`/tini).',
        ),
        code({
          title: 'Wrong vs right',
          code: dedent(`
            // ✗ async in exit handler — never completes
            process.on('exit', async () => { await db.end(); });

            // ✓ clean up on the signal, before exit
            process.once('SIGTERM', async () => { await db.end(); process.exitCode = 0; });
          `),
          explanation: ['By the time `exit` fires, the event loop is no longer running.'],
        }),
      ),
      section('interview', 'Interview tips',
        interviewTip('A strong graceful-shutdown answer has four parts: handle SIGTERM, stop accepting (`server.close`), drain/close resources, enforce a hard timeout.'),
      ),
      section('practice', 'Practice',
        steps('Write a CLI that exits with code 2 on invalid args using `exitCode`.', 'Add graceful shutdown to an HTTP server and test with `kill -TERM <pid>`.'),
      ),
      section('summary', 'Summary',
        bullets(
          '`argv` for args, `env` for config (strings only).',
          'Prefer `exitCode` over `exit()`.',
          '`exit` handlers are sync-only; do cleanup on signals.',
          'Unhandled rejections crash by default (Node 15+).',
          '`hrtime.bigint()` for timing, `memoryUsage()` for memory.',
        ),
      ),
    ],
    revisionNotes: [
      'argv[0] = node, argv[1] = script.',
      'process.env values are strings | undefined.',
      'exit() = immediate; exitCode = natural exit after loop drains.',
      'exit event: sync only. beforeExit: loop empty, can schedule work (not fired on exit()).',
      'Unhandled rejections → crash since Node 15.',
      'SIGTERM handling = graceful shutdown; --env-file (20.6+), loadEnvFile (20.12+).',
    ],
    quiz: [
      {
        kind: 'predict-output', difficulty: 'intermediate',
        prompt: 'What is printed?',
        code: "process.on('exit', (code) => {\n  setTimeout(() => console.log('timer'), 0);\n  console.log('exit', code);\n});\nprocess.exitCode = 3;",
        options: ['exit 3\ntimer', 'exit 3', 'exit 0', 'timer\nexit 3'],
        answer: 1,
        explanation: 'exit listeners run synchronously after the event loop is finished; the timer is scheduled but never runs. The code is 3 from exitCode.',
      },
      {
        kind: 'scenario', difficulty: 'intermediate',
        prompt: 'During deploys, users see failed requests because pods are killed mid-request. What should the Node app do?',
        options: ['Ignore SIGTERM', 'Call process.exit(0) immediately on SIGTERM', 'On SIGTERM, stop accepting connections with server.close, finish in-flight work, close resources, then exit (with a timeout)', 'Increase UV_THREADPOOL_SIZE'],
        answer: 2,
        explanation: 'That is graceful shutdown. Exiting immediately drops in-flight requests; ignoring SIGTERM gets the pod SIGKILLed after the grace period anyway.',
      },
      {
        kind: 'find-bug', difficulty: 'beginner',
        prompt: 'Why is debug logging always on?',
        code: "// started with DEBUG=false node app.js\nif (process.env.DEBUG) enableDebugLogs();",
        options: ['process.env is undefined in production', 'Env vars are strings; "false" is a non-empty, truthy string', 'DEBUG is a reserved variable', 'enableDebugLogs runs before the if'],
        answer: 1,
        explanation: 'Compare explicitly: process.env.DEBUG === "true".',
      },
    ],
    interview: [
      {
        category: 'nodejs', kind: 'concept', difficulty: 'beginner', topic: 'process',
        question: 'What is the difference between process.exit() and setting process.exitCode?',
        shortAnswer: '`process.exit(code)` terminates immediately, possibly losing pending async work such as buffered stdout writes. `process.exitCode = code` just records the code; Node exits with it once the event loop is empty.',
        detailedAnswer: [
          'Both fire the `exit` event.',
          '`beforeExit` does not fire with explicit exit().',
          'exitCode is preferred in CLIs and libraries.',
          'Use exit() after fatal errors when continuing is unsafe — log synchronously first.',
        ],
        followUp: 'Can you run async cleanup in an exit listener?',
        trap: 'Thinking process.exit waits for pending promises or writes.',
      },
      {
        category: 'nodejs', kind: 'scenario', difficulty: 'intermediate', topic: 'process',
        question: 'How do you implement graceful shutdown for a Node.js HTTP service running in a container?',
        shortAnswer: 'Listen for SIGTERM (and SIGINT), stop accepting new connections with `server.close()`, let in-flight requests finish, close DB pools/queues, then exit — with a hard timeout shorter than the orchestrator\'s grace period.',
        detailedAnswer: [
          'Fail readiness checks first so the load balancer stops sending traffic.',
          'Close idle keep-alive sockets (`closeIdleConnections`, automatic on close in Node 19+).',
          'Use `process.once` to avoid double shutdown.',
          'Run Node as PID 1 correctly (exec form CMD, `--init`) so signals arrive.',
          'Unref the force-exit timer.',
        ],
        followUp: 'What happens if your app ignores SIGTERM in Kubernetes?',
        trap: 'Doing cleanup in the `exit` event with async code.',
      },
      {
        category: 'nodejs', kind: 'concept', difficulty: 'advanced', topic: 'process',
        question: 'What does Node do with an unhandled promise rejection, and how should production code handle uncaughtException?',
        shortAnswer: 'Since Node 15 an unhandled rejection is raised as an uncaught exception and crashes the process (default mode `throw`). In production, log it, flush, and exit — do not keep serving, because state may be inconsistent.',
        detailedAnswer: [
          'Modes via `--unhandled-rejections`: throw (default), strict, warn, none, warn-with-error-code.',
          '`unhandledRejection` listeners prevent the crash — use them for logging then exit.',
          '`uncaughtExceptionMonitor` lets you observe without changing behaviour.',
          'A process manager/orchestrator restarts the process.',
          'Root fix: always await/catch promises; use lint rules (no-floating-promises).',
        ],
        followUp: 'Why is resuming after uncaughtException considered unsafe?',
        trap: 'Saying unhandled rejections only print a warning (true only before Node 15).',
      },
    ],
  },
};

export default content;
