import type { ModuleContent } from '../../../types';
import { bullets, code, dedent, flow, interviewTip, section, steps, table, text, warn } from '../helpers';

const content: Partial<ModuleContent> = {
  'buffer-fundamentals': {
    summary: 'A Buffer is a fixed-length chunk of raw bytes living outside the V8 heap, used whenever Node handles binary data: files, sockets, crypto, compression.',
    topics: ['Buffer', 'binary data', 'Uint8Array', 'bytes', 'ArrayBuffer', 'buffer printing'],
    sections: [
      section('introduction', undefined,
        text("JavaScript strings are text. But files, TCP packets, images and hashes are **bytes**. Node needs a way to hold raw bytes efficiently — that is the `Buffer`."),
      ),
      section('definition', 'What is a Buffer?',
        text('A `Buffer` is a fixed-size sequence of bytes (integers 0–255). It is a subclass of `Uint8Array`, so every typed-array method works on it.'),
        bullets(
          'Fixed length: you cannot grow a Buffer after it is created.',
          'Each element is one byte: `buf[0]` is a number between 0 and 255.',
          'Global in Node (`Buffer`), also importable as `import { Buffer } from \'node:buffer\'`.',
          'Printed as hex bytes: `<Buffer 68 69>` is the two bytes for the string `hi`.',
        ),
      ),
      section('why', 'Why Node needs Buffers',
        bullets(
          'The OS hands Node bytes, not strings — `fs.read`, sockets and pipes all deliver raw memory.',
          'Not all bytes are valid text: a PNG or gzip file would be corrupted if forced into a string.',
          'Buffers avoid copying: the memory can be passed straight to libuv/OS calls.',
          'Encoding is explicit: you decide when bytes become text (`toString(\'utf8\')`).',
        ),
      ),
      section('internals', 'How a Buffer is stored',
        bullets(
          'Every Buffer is a *view* over an `ArrayBuffer` (`buf.buffer`), starting at `buf.byteOffset` for `buf.length` bytes.',
          'The memory is allocated outside the JS heap ("external memory") — it shows up in `process.memoryUsage().arrayBuffers`, not `heapUsed`.',
          'Small buffers created with `Buffer.allocUnsafe` / `Buffer.from` may share one pre-allocated 8 KiB pool slab.',
          'Integers written into a Buffer are truncated to one byte: `buf[0] = 300` stores `300 & 255 = 44`.',
        ),
        flow(['String "hi": text in JS', 'Encode (utf8): 0x68 0x69', 'Buffer: <Buffer 68 69>', 'OS / socket / file: raw bytes'],
          { title: 'Text ⇄ bytes', direction: 'horizontal' }),
      ),
      section('example', 'Looking inside a Buffer',
        code({
          title: 'Buffers print as hex bytes',
          code: dedent(`
            const buf = Buffer.from('hi');
            console.log(buf);
            console.log(buf.length, buf[0], buf[1]);
            console.log(buf instanceof Uint8Array);
            console.log(buf.toString());
            console.log(buf.toJSON());
          `),
          expectedOutput: "<Buffer 68 69>\n2 104 105\ntrue\nhi\n{ type: 'Buffer', data: [ 104, 105 ] }",
          explanation: [
            '`Buffer.from(\'hi\')` encodes the string as UTF-8 (the default): `h` = 0x68, `i` = 0x69.',
            'Inspecting shows hex; indexing shows decimal (0x68 = 104).',
            'Buffer extends `Uint8Array`, so `instanceof` is `true`.',
            '`toString()` decodes as UTF-8 back to `hi`.',
            '`toJSON()` (used by `JSON.stringify`) returns `{ type, data }` with decimal bytes.',
          ],
        }),
        code({
          title: 'Bytes wrap at 256',
          code: dedent(`
            const b = Buffer.alloc(2);
            b[0] = 300;
            b[1] = -1;
            console.log(b);
          `),
          expectedOutput: '<Buffer 2c ff>',
          explanation: ['300 mod 256 = 44 = 0x2c.', '-1 wraps to 255 = 0xff — values are stored as unsigned 8-bit integers.'],
        }),
      ),
      section('real-world', 'Where you meet Buffers in a backend',
        bullets(
          '`fs.readFile(path)` without an encoding resolves to a Buffer.',
          'HTTP request body chunks (`req.on(\'data\')`) are Buffers.',
          '`crypto.randomBytes(32)` and `crypto.createHash(\'sha256\').digest()` return Buffers.',
          'Image uploads, PDF generation and gzip (`zlib`) all work on Buffers.',
        ),
      ),
      section('mistakes', 'Common mistakes',
        bullets(
          'Concatenating chunks as strings (`body += chunk`) — breaks multi-byte characters split across chunks.',
          'Using `new Buffer(n)` — deprecated and unsafe; use `Buffer.alloc` / `Buffer.from`.',
          'Thinking `buf.length` is the number of characters — it is the number of **bytes**.',
        ),
      ),
      section('interview', 'Interview angle',
        interviewTip('Say "Buffer is a Uint8Array subclass for raw bytes, allocated outside the V8 heap". Then mention encodings and that streams deliver Buffers by default.'),
      ),
      section('practice', 'Practice',
        steps('Create a Buffer from your name and print it.', 'Print each byte in decimal with a `for...of` loop.', 'Set one byte to 256 and explain the result.'),
      ),
      section('summary', 'Summary',
        bullets('Buffer = fixed-length raw bytes, a `Uint8Array` subclass.', 'Memory is external to the V8 heap.', 'Printed as hex: `<Buffer 68 69>`.', 'Convert to text only with an explicit (or default utf8) encoding.'),
      ),
    ],
    revisionNotes: [
      'Buffer extends Uint8Array; each element is 0–255.',
      'Fixed size; stored outside the V8 heap (arrayBuffers in memoryUsage).',
      'Inspect format: <Buffer 68 69>; toJSON → { type: "Buffer", data: [...] }.',
      'Default encoding everywhere is utf8.',
      'new Buffer() is deprecated — use Buffer.alloc / Buffer.from.',
    ],
    quiz: [
      {
        kind: 'predict-output', difficulty: 'beginner',
        prompt: 'What is printed?',
        code: "console.log(Buffer.from('AB'));",
        options: ['<Buffer A B>', '<Buffer 65 66>', '<Buffer 41 42>', "[ 'A', 'B' ]"],
        answer: 2,
        explanation: "'A' is 65 decimal = 0x41 and 'B' is 0x42. Buffers print in hex, so 65 66 (decimal) is the tempting but wrong choice.",
      },
      {
        kind: 'mcq', difficulty: 'beginner',
        prompt: 'Which statement about Buffer is true?',
        options: ['It can grow like an array with push()', 'It is a subclass of Uint8Array', 'It stores UTF-16 characters', 'It lives inside the V8 heap like strings'],
        answer: 1,
        explanation: 'Buffer extends Uint8Array. It is fixed-length (no push), stores bytes not characters, and its memory is external to the V8 heap.',
      },
      {
        kind: 'predict-output', difficulty: 'intermediate',
        prompt: 'What does this print?',
        code: 'const b = Buffer.alloc(1);\nb[0] = 257;\nconsole.log(b[0]);',
        options: ['257', '255', '0', '1'],
        answer: 3,
        explanation: 'Values are stored modulo 256: 257 & 255 = 1. It does not clamp to 255 (that is Uint8ClampedArray behaviour).',
      },
    ],
    interview: [
      {
        category: 'nodejs', kind: 'concept', difficulty: 'beginner', topic: 'Buffer',
        question: 'What is a Buffer in Node.js and why does it exist?',
        shortAnswer: 'A Buffer is a fixed-length container of raw bytes, used for binary data such as files, sockets and crypto output, which JavaScript strings cannot represent safely.',
        detailedAnswer: [
          'It is a `Uint8Array` subclass; each element is a byte (0–255).',
          'Memory is allocated outside the V8 heap, so large binary data does not pressure the JS garbage collector the same way.',
          'The OS and libuv deliver bytes; Buffers let Node pass them around without converting to text.',
          'Conversion to text is explicit via an encoding (`utf8`, `base64`, `hex`…).',
        ],
        followUp: 'How do you convert a Buffer to a base64 string?',
        trap: 'Saying a Buffer is "an array of characters" — it is bytes; one character can be several bytes.',
      },
      {
        category: 'nodejs', kind: 'concept', difficulty: 'intermediate', topic: 'Buffer',
        question: 'How is Buffer related to Uint8Array and ArrayBuffer?',
        shortAnswer: 'Buffer is a subclass of Uint8Array, and like every typed array it is a view over an underlying ArrayBuffer at some byteOffset.',
        detailedAnswer: [
          '`buf.buffer` is the backing ArrayBuffer; `buf.byteOffset` and `buf.length` define the visible window.',
          'Pooled Buffers share one ArrayBuffer, so `buf.buffer.byteLength` can be 8192 for a 5-byte Buffer.',
          'Any API accepting Uint8Array (TextDecoder, Web Streams, fetch) accepts a Buffer.',
          'Difference: `Buffer.prototype.slice` shares memory while `Uint8Array.prototype.slice` copies.',
        ],
        followUp: 'Why is it dangerous to pass `buf.buffer` directly to another API?',
        trap: 'Assuming `buf.buffer` contains only your bytes — with pooling it may contain other data.',
      },
    ],
  },

  'creating-buffers': {
    summary: 'Create buffers with Buffer.alloc (zero-filled, safe), Buffer.allocUnsafe (fast, uninitialised, may use the shared pool) or Buffer.from (copy from string, array or other buffer).',
    topics: ['Buffer.alloc', 'Buffer.allocUnsafe', 'Buffer.from', 'buffer pool', 'poolSize', 'new Buffer deprecated'],
    sections: [
      section('introduction', undefined,
        text('There are three factory functions. Picking the right one matters for both speed and security.'),
      ),
      section('definition', 'The three factories',
        table('Creating buffers', ['API', 'Contents', 'Speed', 'Use when'], [
          ['`Buffer.alloc(size, fill?)`', 'Zero-filled (or `fill`)', 'Slower (must zero memory)', 'Default choice'],
          ['`Buffer.allocUnsafe(size)`', '**Uninitialised** — old memory', 'Fast; small sizes come from a shared pool', 'You overwrite every byte immediately'],
          ['`Buffer.allocUnsafeSlow(size)`', 'Uninitialised, never pooled', 'Fast', 'Long-lived small buffers you do not want sharing a slab'],
          ['`Buffer.from(string, enc?)`', 'Encoded string', '—', 'Text → bytes'],
          ['`Buffer.from(array \\| buffer)`', 'Copy of the bytes', '—', 'Copying data'],
          ['`Buffer.from(arrayBuffer, off?, len?)`', 'Shares memory (no copy)', '—', 'Wrapping existing memory'],
        ]),
      ),
      section('why', 'Why allocUnsafe exists',
        bullets(
          'Zero-filling memory costs time. If you are about to `fs.read` into the buffer, zeroing is wasted work.',
          'The risk: uninitialised memory may contain old data — passwords, tokens, other users\' requests. Sending it uncleared is a data leak.',
          '`new Buffer(n)` (deprecated) behaved like `allocUnsafe` and caused real security bugs — that is why it was replaced.',
        ),
      ),
      section('internals', 'The buffer pool',
        bullets(
          '`Buffer.poolSize` is 8192 bytes (8 KiB). Node pre-allocates one slab of that size.',
          '`Buffer.allocUnsafe(n)` and `Buffer.from(string)` carve small buffers (n < `poolSize >>> 1`, i.e. under 4 KiB) out of the current slab.',
          'Pooled buffers share one ArrayBuffer: `buf.buffer.byteLength` is 8192 even for a 5-byte buffer.',
          '`Buffer.alloc` never uses the pool.',
        ),
        flow(['allocUnsafe(5): size < 4096?', 'Yes: slice of shared 8 KiB slab', 'No: dedicated allocation'], { title: 'Pool decision', direction: 'horizontal' }),
      ),
      section('example', 'Creating buffers',
        code({
          title: 'alloc, from and fill',
          code: dedent(`
            console.log(Buffer.alloc(4));
            console.log(Buffer.alloc(3, 'a'));
            console.log(Buffer.from([1, 2, 255]));
            console.log(Buffer.from('héllo').length);
            const unsafe = Buffer.allocUnsafe(4).fill(0);
            console.log(unsafe);
          `),
          expectedOutput: '<Buffer 00 00 00 00>\n<Buffer 61 61 61>\n<Buffer 01 02 ff>\n6\n<Buffer 00 00 00 00>',
          explanation: [
            '`alloc(4)` gives four zero bytes.',
            '`alloc(3, \'a\')` fills with the byte for `a` (0x61).',
            '`from([1, 2, 255])` copies numbers as bytes.',
            '`é` takes two bytes in UTF-8, so `héllo` is 6 bytes, not 5.',
            'Always fill or overwrite an `allocUnsafe` buffer before using it.',
          ],
        }),
        code({
          title: 'Pooling is visible through buf.buffer',
          code: dedent(`
            const a = Buffer.allocUnsafe(5);
            const b = Buffer.alloc(5);
            console.log(Buffer.poolSize);
            console.log(a.buffer.byteLength, b.buffer.byteLength);
          `),
          expectedOutput: '8192\n8192 5',
          explanation: [
            '`a` was carved out of the shared 8 KiB pool slab.',
            '`b` (alloc) got its own 5-byte ArrayBuffer.',
          ],
          versionNote: 'Pool behaviour is an implementation detail; the 8 KiB poolSize has been stable for many major versions.',
        }),
        code({
          title: 'Buffer.from(arrayBuffer) shares memory',
          code: dedent(`
            const ab = new ArrayBuffer(4);
            const view = Buffer.from(ab);
            new Uint8Array(ab)[0] = 9;
            console.log(view[0]);
          `),
          expectedOutput: '9',
          explanation: ['Passing an ArrayBuffer creates a view, not a copy — writes through either reference are visible in both.'],
        }),
      ),
      section('real-world', 'Real-world usage',
        bullets(
          'Building a binary protocol header: `const header = Buffer.alloc(8); header.writeUInt32BE(len, 0);`.',
          'Reading a file chunk: `fs.read(fd, Buffer.allocUnsafe(65536), ...)` — overwritten by the read, and you only use the `bytesRead` part.',
          'Decoding an incoming base64 token: `Buffer.from(token, \'base64url\')`.',
        ),
      ),
      section('mistakes', 'Common mistakes',
        code({
          title: 'Wrong vs right',
          code: dedent(`
            // ❌ deprecated + uninitialised memory
            const a = new Buffer(10);
            // ❌ sending unsafe memory you did not fully overwrite
            res.end(Buffer.allocUnsafe(1024));

            // ✅
            const b = Buffer.alloc(10);
            const c = Buffer.from('text', 'utf8');
          `),
          explanation: ['`new Buffer()` prints a DeprecationWarning (DEP0005).', 'Unsafe memory sent to a client can leak secrets from previous allocations.'],
        }),
        warn('If you use only `bytesRead` bytes of an `allocUnsafe` buffer, slice to that length — the tail is garbage.'),
      ),
      section('interview', 'Interview angle',
        interviewTip('The key words are **uninitialised memory** and **pool**. Explain why `allocUnsafe` is faster and when it is still safe.'),
      ),
      section('practice', 'Practice',
        text('Write `makeHeader(type, length)` returning a 5-byte Buffer: byte 0 = type, bytes 1–4 = length as big-endian uint32. Use `Buffer.alloc` and `writeUInt32BE`.'),
      ),
      section('summary', 'Summary',
        bullets(
          '`Buffer.alloc` = safe, zero-filled — the default.',
          '`Buffer.allocUnsafe` = fast, uninitialised, pooled under 4 KiB.',
          '`Buffer.from` copies from strings/arrays/buffers; shares memory with an ArrayBuffer.',
          'Never use `new Buffer()`.',
        ),
      ),
    ],
    revisionNotes: [
      'alloc → zero-filled, never pooled.',
      'allocUnsafe → uninitialised, uses the 8 KiB pool when size < 4 KiB.',
      'Buffer.poolSize = 8192.',
      'Buffer.from(string) defaults to utf8; Buffer.from(arrayBuffer) is a view (no copy).',
      'new Buffer() deprecated (DEP0005) because of uninitialised memory leaks.',
    ],
    quiz: [
      {
        kind: 'mcq', difficulty: 'beginner',
        prompt: 'Which call is guaranteed to return a zero-filled buffer?',
        options: ['Buffer.allocUnsafe(16)', 'Buffer.alloc(16)', 'Buffer.allocUnsafeSlow(16)', 'new Buffer(16) in every Node version'],
        answer: 1,
        explanation: 'Only Buffer.alloc zero-fills. allocUnsafe and allocUnsafeSlow return uninitialised memory; new Buffer(n) was historically uninitialised too.',
      },
      {
        kind: 'scenario', difficulty: 'intermediate',
        prompt: 'A log line shows fragments of another user\'s JSON appearing in a binary response. The code builds the response with Buffer.allocUnsafe(1024) and writes 600 bytes into it, then sends the whole buffer. Best fix?',
        options: ['Increase Buffer.poolSize', 'Send only the written part (buf.subarray(0, written)) or use Buffer.alloc', 'Call buf.toString() before sending', 'Switch to Buffer.allocUnsafeSlow'],
        answer: 1,
        explanation: 'The unwritten 424 bytes are uninitialised memory containing old data. Send only the bytes you wrote, or zero-fill. allocUnsafeSlow is still uninitialised.',
      },
      {
        kind: 'predict-output', difficulty: 'advanced',
        prompt: 'What is printed?',
        code: 'const x = Buffer.allocUnsafe(10);\nconsole.log(x.buffer.byteLength > 10);',
        options: ['false', 'true', 'It throws', 'undefined'],
        answer: 1,
        explanation: 'A 10-byte allocUnsafe buffer comes from the shared 8 KiB pool, so its backing ArrayBuffer is 8192 bytes.',
      },
    ],
    interview: [
      {
        category: 'nodejs', kind: 'concept', difficulty: 'intermediate', topic: 'Buffer',
        question: 'What is the difference between Buffer.alloc and Buffer.allocUnsafe?',
        shortAnswer: 'Buffer.alloc returns zero-filled memory; Buffer.allocUnsafe skips zeroing so it is faster but may contain old, possibly sensitive data.',
        detailedAnswer: [
          'Zeroing costs time proportional to size.',
          '`allocUnsafe` is safe only if you overwrite every byte before reading or sending it.',
          'Small `allocUnsafe` buffers are carved from a shared 8 KiB pool.',
          '`new Buffer(n)` was deprecated precisely because it behaved like `allocUnsafe` by default.',
        ],
        followUp: 'When is the pool used, and what does that mean for `buf.buffer`?',
        trap: 'Claiming allocUnsafe is "unsafe" because it can crash — the risk is information leakage, not crashes.',
      },
      {
        category: 'nodejs', kind: 'concept', difficulty: 'advanced', topic: 'Buffer pool',
        question: 'Explain the Buffer pool. Which APIs use it and what are the consequences?',
        shortAnswer: 'Node pre-allocates an 8 KiB slab (Buffer.poolSize) and serves small allocUnsafe/from(string) requests (under 4 KiB) as slices of it, avoiding many tiny allocations.',
        detailedAnswer: [
          'Threshold: size < `Buffer.poolSize >>> 1` (4096 bytes).',
          'Used by `Buffer.allocUnsafe` and `Buffer.from` for strings/arrays; never by `Buffer.alloc` or `allocUnsafeSlow`.',
          'Pooled buffers share one ArrayBuffer — `buf.buffer` is the whole slab, so always respect `byteOffset`/`length`.',
          'A long-lived tiny pooled buffer keeps the whole 8 KiB slab alive; use `allocUnsafeSlow` + copy for long-retained small buffers.',
        ],
        followUp: 'How would you safely pass a pooled Buffer to an API that takes an ArrayBuffer?',
        trap: 'Passing `buf.buffer` to a worker or WASM and accidentally exposing the whole 8 KiB slab.',
      },
    ],
  },

  'buffer-operations': {
    summary: 'Read, write, slice, copy, compare and concatenate Buffers — remembering that subarray/slice share memory while copy and Buffer.concat create new bytes.',
    topics: ['subarray', 'slice', 'Buffer.concat', 'copy', 'compare', 'equals', 'indexOf', 'readUInt32BE', 'writeUInt16LE', 'endianness'],
    sections: [
      section('introduction', undefined,
        text('Once you have bytes you need to cut them up, join them, search them and read numbers out of them — the bread and butter of parsing binary protocols and file formats.'),
      ),
      section('definition', 'Core operations',
        table('Buffer operations', ['Operation', 'API', 'Copies?'], [
          ['View a range', '`buf.subarray(start, end)`', 'No — shares memory'],
          ['View a range (legacy)', '`buf.slice(start, end)`', 'No — shares memory (deprecated since Node 17.5; use subarray)'],
          ['Join', '`Buffer.concat([a, b], totalLength?)`', 'Yes'],
          ['Copy into another', '`src.copy(target, targetStart, srcStart, srcEnd)`', 'Yes'],
          ['Compare / sort', '`Buffer.compare(a, b)`, `a.equals(b)`', '—'],
          ['Search', '`buf.indexOf(value)`, `buf.includes(value)`', '—'],
          ['Numbers', '`readUInt16BE`, `writeInt32LE`, `readBigUInt64LE`…', '—'],
          ['Write text', '`buf.write(string, offset, encoding)` → bytes written', '—'],
        ]),
      ),
      section('why', 'Why these matter',
        bullets(
          'Binary protocols (Postgres wire format, WebSocket frames, image headers) are fixed-offset fields — you read numbers at offsets.',
          'Network data arrives in chunks; you join them with `Buffer.concat`.',
          'Knowing which operations copy avoids both memory bloat and surprising mutations.',
        ),
      ),
      section('internals', 'Shared memory vs copies',
        bullets(
          '`subarray` creates a new Buffer object pointing at the **same** ArrayBuffer with a different offset/length.',
          '`Buffer.prototype.slice` behaves exactly like `subarray` — unlike `Uint8Array.prototype.slice`, which copies. This mismatch is why `buf.slice` is doc-deprecated.',
          '`Buffer.concat` allocates a new buffer (may use the pool if small) and copies every input.',
          'Endianness: `BE` = most significant byte first (network order), `LE` = least significant first (x86 memory order).',
        ),
        flow(['ArrayBuffer: 68 65 6c 6c 6f', 'buf: offset 0, length 5', 'buf.subarray(1,3): offset 1, length 2 → 65 6c'], { title: 'subarray is a window', direction: 'vertical' }),
      ),
      section('example', 'Operations in action',
        code({
          title: 'subarray shares memory',
          code: dedent(`
            const buf = Buffer.from('hello');
            const part = buf.subarray(0, 2);
            part[0] = 0x4a; // 'J'
            console.log(part.toString(), buf.toString());
            const copy = Buffer.from(buf.subarray(0, 2));
            copy[0] = 0x59; // 'Y'
            console.log(copy.toString(), buf.toString());
          `),
          expectedOutput: 'Je Jello\nYe Jello',
          explanation: [
            'Writing through `part` changed `buf` too — they share memory.',
            '`Buffer.from(buffer)` copies, so changing `copy` leaves `buf` alone.',
          ],
        }),
        code({
          title: 'concat, compare, indexOf',
          code: dedent(`
            const a = Buffer.from('ab');
            const b = Buffer.from('cd');
            const joined = Buffer.concat([a, b]);
            console.log(joined, joined.length);
            console.log(Buffer.compare(a, b), a.equals(Buffer.from('ab')));
            console.log(joined.indexOf('c'), joined.includes('z'));
          `),
          expectedOutput: '<Buffer 61 62 63 64> 4\n-1 true\n2 false',
          explanation: [
            '`concat` returns a new 4-byte buffer.',
            '`compare` returns -1/0/1 like a sort comparator (`ab` < `cd`).',
            '`equals` compares bytes, not references.',
            '`indexOf` accepts strings, numbers or buffers.',
          ],
        }),
        code({
          title: 'Reading and writing numbers',
          code: dedent(`
            const header = Buffer.alloc(6);
            header.writeUInt16BE(0x0102, 0);
            header.writeUInt32LE(1, 2);
            console.log(header);
            console.log(header.readUInt16BE(0), header.readUInt32LE(2));
          `),
          expectedOutput: '<Buffer 01 02 01 00 00 00>\n258 1',
          explanation: [
            'Big-endian writes 0x01 then 0x02.',
            'Little-endian puts the least significant byte first: 01 00 00 00.',
            'Reading with the same endianness gets the numbers back (0x0102 = 258).',
            'Out-of-range offsets throw `ERR_OUT_OF_RANGE`.',
          ],
        }),
      ),
      section('real-world', 'Real-world: length-prefixed messages',
        code({
          title: 'Framing messages over TCP',
          code: dedent(`
            function frame(payload) {
              const body = Buffer.from(JSON.stringify(payload));
              const len = Buffer.alloc(4);
              len.writeUInt32BE(body.length, 0);
              return Buffer.concat([len, body]);
            }
            const f = frame({ ok: true });
            console.log(f.readUInt32BE(0), f.subarray(4).toString());
          `),
          expectedOutput: '11 {"ok":true}',
          explanation: ['A 4-byte length prefix lets the receiver know where each message ends in a byte stream.', '`{"ok":true}` is 11 bytes.'],
        }),
      ),
      section('mistakes', 'Common mistakes',
        bullets(
          'Expecting `buf.slice()` to copy (as `Array.prototype.slice` does) — it shares memory.',
          'Calling `Buffer.concat` inside a loop for every chunk — O(n²) copying. Collect chunks in an array and concat once.',
          'Keeping a tiny `subarray` of a huge buffer alive — it retains the whole underlying memory. Copy it if you keep it long-term.',
          'Mixing up BE/LE when reading protocol fields.',
        ),
        code({
          title: 'Wrong vs right',
          code: dedent(`
            // ❌ quadratic
            let all = Buffer.alloc(0);
            for (const c of chunks) all = Buffer.concat([all, c]);
            // ✅ linear
            const all2 = Buffer.concat(chunks);
          `),
        }),
      ),
      section('interview', 'Interview angle',
        interviewTip('A classic probe: "Does `buf.slice()` copy?" Answer no, explain shared memory, and mention `subarray` is the preferred name.'),
      ),
      section('practice', 'Practice',
        text('Write `parse(buf)` for a format: 1 byte version, 2 bytes big-endian length, then `length` bytes of UTF-8 text. Return `{ version, text }`.'),
      ),
      section('summary', 'Summary',
        bullets('`subarray`/`slice` = views (shared memory).', '`Buffer.from(buf)`, `copy`, `concat` = new bytes.', 'Read numbers with `readUInt*BE/LE`.', 'Collect chunks and concat once.'),
      ),
    ],
    revisionNotes: [
      'buf.slice === buf.subarray behaviour (shares memory); prefer subarray.',
      'Uint8Array.prototype.slice copies — the reason buf.slice is deprecated.',
      'Buffer.concat(list) copies; do it once, not per chunk.',
      'Buffer.compare returns -1/0/1; equals compares bytes.',
      'BE = network byte order.',
      'A small view retains the whole backing ArrayBuffer.',
    ],
    quiz: [
      {
        kind: 'predict-output', difficulty: 'intermediate',
        prompt: 'What is printed?',
        code: "const b = Buffer.from('cat');\nconst s = b.slice(0, 1);\ns[0] = 0x62; // 'b'\nconsole.log(b.toString());",
        options: ['cat', 'bat', 'b', 'Throws TypeError'],
        answer: 1,
        explanation: 'Buffer slice shares memory with the original, so writing to s changes b to "bat". "cat" would be right only if slice copied (as Uint8Array.prototype.slice does).',
      },
      {
        kind: 'find-bug', difficulty: 'intermediate',
        prompt: 'What is wrong with this body collector?',
        code: "let body = Buffer.alloc(0);\nreq.on('data', (c) => { body = Buffer.concat([body, c]); });\nreq.on('end', () => handle(body));",
        options: ['Buffer.concat cannot take two arguments', "Re-concatenating on every chunk copies all previous bytes each time (quadratic)", "'end' never fires", 'Buffers cannot be concatenated'],
        answer: 1,
        explanation: 'Each concat copies the whole accumulated body again. Push chunks into an array and call Buffer.concat(chunks) once on end.',
      },
      {
        kind: 'complete-code', difficulty: 'beginner',
        prompt: 'Read a 2-byte big-endian unsigned integer at offset 0.',
        code: 'const port = buf./* ??? */(0);',
        options: ['readUInt16LE', 'readUInt16BE', 'readInt8', 'readUInt32BE'],
        answer: 1,
        explanation: 'readUInt16BE reads 2 bytes in network (big-endian) order. LE would swap the bytes.',
      },
    ],
    interview: [
      {
        category: 'nodejs', kind: 'output', difficulty: 'intermediate', topic: 'Buffer slicing',
        question: 'Does Buffer.prototype.slice copy the bytes? What does this code print?',
        code: { id: 'iq-m06-slice', language: 'javascript', code: "const a = Buffer.from('node');\nconst b = a.subarray(1);\nb[0] = 0x4f; // 'O'\nconsole.log(a.toString());", expectedOutput: 'nOde' },
        shortAnswer: "It prints 'nOde': subarray (and the legacy slice) return views over the same memory, so writes are visible in the original.",
        detailedAnswer: [
          'The new Buffer has its own offset/length but the same ArrayBuffer.',
          '`buf.slice` was doc-deprecated (Node 17.5) because typed-array `slice` copies and the inconsistency confuses people.',
          'To copy: `Buffer.from(view)` or `Buffer.copyBytesFrom` (Node 19.8+).',
        ],
        followUp: 'What memory issue can a long-lived small view cause?',
        trap: 'Assuming Array/TypedArray slice semantics (copy).',
      },
      {
        category: 'nodejs', kind: 'scenario', difficulty: 'advanced', topic: 'Buffer memory',
        question: 'Your service parses 10 MB uploads and caches only the first 16 bytes of each (a file signature) in a Map. Memory keeps growing by ~10 MB per upload. Why, and how do you fix it?',
        shortAnswer: 'The cached 16-byte subarray is a view that keeps the entire 10 MB backing ArrayBuffer alive; copy the bytes (Buffer.from(view) or Buffer.copyBytesFrom) before caching.',
        detailedAnswer: [
          'A view references its parent ArrayBuffer; GC cannot free the parent while any view lives.',
          '`process.memoryUsage().arrayBuffers` grows while `heapUsed` stays flat — a hint the leak is external memory.',
          'Fix: `cache.set(id, Buffer.from(buf.subarray(0, 16)))` — a real copy of 16 bytes.',
          'Also consider caching a hex string instead of bytes.',
        ],
        followUp: 'How would you confirm this with heap snapshots?',
        trap: 'Blaming the Map or GC tuning rather than shared backing memory.',
      },
    ],
  },

  encoding: {
    summary: 'Encodings define how bytes map to text: utf8 (default), hex, base64, base64url, latin1, utf16le. Byte length differs from string length for multi-byte characters, and chunks can split a character.',
    topics: ['utf8', 'hex', 'base64', 'base64url', 'latin1', 'utf16le', 'Buffer.byteLength', 'StringDecoder', 'TextDecoder', 'multi-byte characters'],
    sections: [
      section('introduction', undefined,
        text('The same bytes can be displayed many ways: as text, as hex, as base64. An **encoding** is the rule for converting between a Buffer and a string.'),
      ),
      section('definition', 'Supported encodings',
        table('Buffer encodings', ['Encoding', 'What it is', 'Typical use'], [
          ['`utf8` (default)', 'Unicode, 1–4 bytes per character', 'Text, JSON, HTML'],
          ['`hex`', 'Two hex digits per byte', 'Hashes, debugging'],
          ['`base64`', '`A–Z a–z 0–9 + /` with `=` padding', 'Email, data URLs, Basic auth'],
          ['`base64url`', 'base64 with `- _`, no padding', 'JWTs, URL-safe tokens'],
          ['`latin1` (alias `binary`)', 'One byte per char, code points 0–255', 'Legacy protocols'],
          ['`utf16le` (alias `ucs2`)', '2 or 4 bytes per char, little-endian', 'Windows APIs'],
          ['`ascii`', '7-bit; high bit stripped on decode', 'Rarely needed'],
        ]),
      ),
      section('why', 'Why byte length is not string length',
        bullets(
          'JS `string.length` counts UTF-16 code units. `Buffer.byteLength(str)` counts UTF-8 bytes.',
          '`a` = 1 byte, `é` = 2 bytes, `€` = 3 bytes, `👍` = 4 bytes (and `\'👍\'.length` is 2).',
          '`Content-Length` must be bytes — using `str.length` truncates responses with non-ASCII text.',
        ),
      ),
      section('internals', 'Split characters across chunks',
        bullets(
          'Streams deliver arbitrary byte boundaries. A 3-byte `€` can arrive as 1 byte in chunk A and 2 bytes in chunk B.',
          '`chunk.toString()` on each half produces `\\ufffd` replacement characters (�).',
          '`StringDecoder` (`node:string_decoder`) and `TextDecoder` with `{ stream: true }` buffer incomplete sequences until the rest arrives.',
          '`readable.setEncoding(\'utf8\')` uses a StringDecoder internally — the safe way to get strings from a stream.',
        ),
        flow(['Chunk 1: e2', 'Chunk 2: 82 ac', 'StringDecoder: holds e2, waits', 'Output: €'], { title: 'Decoding a split character', direction: 'horizontal' }),
      ),
      section('example', 'Encodings in practice',
        code({
          title: 'One string, many encodings',
          code: dedent(`
            const buf = Buffer.from('hello');
            console.log(buf.toString('hex'));
            console.log(buf.toString('base64'));
            console.log(buf.toString('base64url'));
            console.log(Buffer.from('68656c6c6f', 'hex').toString());
            console.log(Buffer.from('aGVsbG8=', 'base64').toString('utf8'));
          `),
          expectedOutput: '68656c6c6f\naGVsbG8=\naGVsbG8\nhello\nhello',
          explanation: [
            'hex: two characters per byte.',
            'base64 pads to a multiple of 4 with `=`; base64url drops the padding.',
            'Decoding uses `Buffer.from(string, encoding)`.',
          ],
        }),
        code({
          title: 'Bytes vs characters',
          code: dedent(`
            for (const s of ['a', 'é', '€', '👍']) {
              console.log(s, s.length, Buffer.byteLength(s));
            }
          `),
          expectedOutput: 'a 1 1\né 1 2\n€ 1 3\n👍 2 4',
          explanation: ['`length` counts UTF-16 code units; the emoji is a surrogate pair (2 units).', 'UTF-8 uses 1–4 bytes depending on the code point.'],
        }),
        code({
          title: 'TextDecoder handles split characters (runs in the browser too)',
          runnable: true,
          code: dedent(`
            const bytes = new TextEncoder().encode('€');
            console.log(bytes.length);
            const naive = new TextDecoder();
            console.log(naive.decode(bytes.subarray(0, 1)) === '\\uFFFD');
            const dec = new TextDecoder();
            let out = dec.decode(bytes.subarray(0, 1), { stream: true });
            out += dec.decode(bytes.subarray(1), { stream: true });
            out += dec.decode();
            console.log(out);
          `),
          expectedOutput: '3\ntrue\n€',
          explanation: [
            '`€` encodes to 3 UTF-8 bytes.',
            'Decoding an incomplete sequence without streaming gives the replacement character U+FFFD.',
            'With `{ stream: true }` the decoder keeps the partial bytes; the final `decode()` flushes.',
          ],
        }),
        code({
          title: 'StringDecoder (Node API)',
          code: dedent(`
            const { StringDecoder } = require('node:string_decoder');
            const euro = Buffer.from('€');
            const d = new StringDecoder('utf8');
            console.log(JSON.stringify(d.write(euro.subarray(0, 1))));
            console.log(d.write(euro.subarray(1)));
          `),
          expectedOutput: '""\n€',
          explanation: ['The first write returns an empty string and remembers the partial byte.', 'The second write completes the character.'],
        }),
      ),
      section('real-world', 'Real-world usage',
        bullets(
          'Basic auth header: `Buffer.from(\'user:pass\').toString(\'base64\')`.',
          'Decode a JWT payload: `JSON.parse(Buffer.from(part, \'base64url\').toString())`.',
          'Hash display: `createHash(\'sha256\').update(data).digest(\'hex\')`.',
          'Correct `Content-Length`: `Buffer.byteLength(body)`.',
        ),
      ),
      section('mistakes', 'Common mistakes',
        bullets(
          'Setting `Content-Length: str.length` for non-ASCII content.',
          'Decoding stream chunks individually with `toString()` — use `setEncoding` or a decoder.',
          'Using `base64` in URLs — `+`, `/`, `=` need escaping; use `base64url`.',
          'Treating base64 as encryption — it is only an encoding.',
        ),
      ),
      section('interview', 'Interview angle',
        interviewTip('Show the `\'€\'.length === 1` but `Buffer.byteLength(\'€\') === 3` contrast, then explain split characters across chunks.'),
      ),
      section('practice', 'Practice',
        text('Decode the middle part of a JWT (`header.payload.signature`) to a JS object using `base64url`. Then compute the byte length of the string `naïve café`.'),
      ),
      section('summary', 'Summary',
        bullets('Default encoding is utf8.', 'base64url is URL-safe and unpadded.', 'Bytes ≠ characters: use `Buffer.byteLength`.', 'Use StringDecoder / TextDecoder({stream}) / setEncoding for chunked text.'),
      ),
    ],
    revisionNotes: [
      'utf8 is the default for Buffer.from and toString.',
      'hello → hex 68656c6c6f, base64 aGVsbG8=, base64url aGVsbG8.',
      'latin1 === binary; utf16le === ucs2.',
      "'€'.length 1, byteLength 3; '👍'.length 2, byteLength 4.",
      'Split multi-byte chars → U+FFFD unless you use StringDecoder/TextDecoder stream mode.',
      'Content-Length must be Buffer.byteLength(body).',
    ],
    quiz: [
      {
        kind: 'predict-output', difficulty: 'beginner',
        prompt: 'What does this print?',
        code: "console.log(Buffer.byteLength('café'), 'café'.length);",
        options: ['4 4', '5 4', '4 5', '8 4'],
        answer: 1,
        explanation: "'é' is 2 bytes in UTF-8, so 5 bytes, while the string has 4 UTF-16 code units.",
      },
      {
        kind: 'mcq', difficulty: 'intermediate',
        prompt: 'Which encoding should you use for a token placed in a URL path?',
        options: ['base64', 'hex or base64url', 'latin1', 'utf16le'],
        answer: 1,
        explanation: 'base64url (or hex) only uses URL-safe characters. Plain base64 contains +, / and = which must be escaped in URLs.',
      },
      {
        kind: 'find-bug', difficulty: 'advanced',
        prompt: 'Users report occasional "�" characters in uploaded UTF-8 text. What is the bug?',
        code: "let text = '';\nreq.on('data', (chunk) => { text += chunk.toString('utf8'); });",
        options: ["'data' fires only once", 'Each chunk is decoded separately, so characters split between chunks become replacement chars', 'utf8 cannot represent accents', 'toString needs a length argument'],
        answer: 1,
        explanation: 'Chunk boundaries can fall inside a multi-byte character. Use req.setEncoding("utf8"), a StringDecoder, or concat the Buffers and decode once.',
      },
    ],
    interview: [
      {
        category: 'nodejs', kind: 'concept', difficulty: 'beginner', topic: 'Encoding',
        question: 'Why can string.length differ from Buffer.byteLength(string)?',
        shortAnswer: 'length counts UTF-16 code units while byteLength counts the encoded bytes (UTF-8 by default), and non-ASCII characters use 2–4 bytes.',
        detailedAnswer: [
          'ASCII characters: 1 byte each, so the numbers match.',
          '`é` = 2 bytes, `€` = 3 bytes, emoji = 4 bytes (and length 2 because of surrogate pairs).',
          'HTTP `Content-Length` is in bytes — always use `Buffer.byteLength`.',
        ],
        followUp: 'What goes wrong if you set Content-Length to str.length?',
        trap: 'Saying they are always equal for "normal" text — any accent or emoji breaks it.',
      },
      {
        category: 'nodejs', kind: 'concept', difficulty: 'advanced', topic: 'StringDecoder',
        question: 'How do you correctly convert a stream of Buffer chunks into UTF-8 text?',
        shortAnswer: 'Use readable.setEncoding("utf8"), a StringDecoder, or TextDecoder with {stream: true}, which hold incomplete multi-byte sequences until the next chunk; or concat all Buffers and decode once.',
        detailedAnswer: [
          'Chunk boundaries are arbitrary byte positions; a character may be split.',
          'Per-chunk `toString()` turns partial sequences into U+FFFD.',
          'StringDecoder keeps up to 3 trailing bytes and prepends them to the next write; `end()` flushes.',
          'For huge payloads prefer incremental decoding over concatenation to bound memory.',
        ],
        followUp: 'Does the same problem exist with base64 output?',
        trap: 'Believing a 64 KiB highWaterMark makes chunks "line up" with characters.',
      },
    ],
  },
};

export default content;
