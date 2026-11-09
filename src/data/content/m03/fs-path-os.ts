import type { ModuleContent } from '../../../types';
import { bullets, code, dedent, diagram, flow, interviewTip, section, steps, table, text, tip } from '../helpers';

const content: Partial<ModuleContent> = {
  // ───────────────────────────────────────────────────────────
  'fs-module': {
    summary: '`node:fs` reads, writes and watches files and directories. Use `fs/promises` for async code, streams for large files, and sync methods only at startup or in CLIs.',
    topics: ['fs', 'fs/promises', 'readFile', 'writeFile', 'createReadStream', 'mkdir recursive', 'stat', 'FileHandle', 'sync vs async', 'thread pool', 'ENOENT'],
    sections: [
      section('introduction', undefined,
        text('Config files, uploads, logs, static assets, CSV imports — almost every backend touches the disk. `fs` gives you three styles for the same operations: callback, promise and synchronous.'),
      ),
      section('definition', 'Definition',
        bullets(
          '`node:fs` — callback API (`fs.readFile(p, cb)`), sync API (`fs.readFileSync`) and streams (`fs.createReadStream`).',
          '`node:fs/promises` — promise API (`await readFile(p)`) plus `FileHandle` objects.',
          'Errors carry a `code`: `ENOENT` (not found), `EACCES` (permission), `EEXIST`, `EISDIR`, `EMFILE` (too many open files).',
        ),
      ),
      section('why', 'Why three styles',
        bullets(
          'Async (promise/callback) keeps the event loop free while libuv does the I/O on its thread pool.',
          'Sync blocks the entire process — acceptable only before the server starts or in short scripts.',
          'Streams process data chunk by chunk, so memory stays flat for multi-GB files.',
        ),
      ),
      section('internals', 'How a file read works',
        steps(
          '`await readFile(p)` calls a C++ binding that queues a request to libuv.',
          'Most file system work has no portable async OS API, so libuv runs it on its **thread pool** (default 4 threads, `UV_THREADPOOL_SIZE` up to 1024).',
          'The worker thread performs blocking `open`/`read`/`close` calls.',
          'When done, the result is queued back to the event loop, and your promise resolves.',
        ),
        diagram('thread-pool', 'fs operations run on libuv worker threads; the main thread keeps serving requests.'),
      ),
      section('visual', 'Important methods',
        table('fs — important methods', ['Method', 'What it does', 'Style'], [
          ['`readFile(path, \'utf8\')`', 'Read whole file into memory', 'async (promise/cb) · `readFileSync` sync'],
          ['`writeFile(path, data)`', 'Create/overwrite a file', 'async · sync variant'],
          ['`appendFile(path, data)`', 'Append to a file', 'async · sync variant'],
          ['`mkdir(path, { recursive: true })`', 'Create nested directories, no error if exists', 'async · sync variant'],
          ['`readdir(path, { withFileTypes: true })`', 'List entries as `Dirent`s (`recursive: true` Node 20.1+)', 'async · sync variant'],
          ['`stat(path)`', 'Size, mtime, isFile(), isDirectory()', 'async · sync variant'],
          ['`access(path, constants.R_OK)`', 'Check permissions', 'async · sync variant'],
          ['`rename(a, b)` / `copyFile(a, b)` / `cp(a, b, { recursive })`', 'Move / copy files or trees', 'async · sync variant'],
          ['`rm(path, { recursive: true, force: true })`', 'Delete files or directories', 'async · sync variant'],
          ['`open(path, flags)` → `FileHandle`', 'Low-level reads/writes at positions', 'async'],
          ['`createReadStream(path)` / `createWriteStream(path)`', 'Chunked I/O with backpressure', 'stream'],
          ['`watch(path)`', 'Notify on changes (platform-dependent)', 'async (event/async iterator)'],
          ['`existsSync(path)`', 'Boolean existence check (`fs.exists` is deprecated)', 'sync'],
        ]),
      ),
      section('example', 'Examples',
        code({
          title: 'Read, modify, write JSON with fs/promises',
          code: dedent(`
            import { readFile, writeFile, mkdir } from 'node:fs/promises';
            import path from 'node:path';

            const dir = path.join(import.meta.dirname, 'data');
            await mkdir(dir, { recursive: true });

            const file = path.join(dir, 'settings.json');
            let settings = { visits: 0 };
            try {
              settings = JSON.parse(await readFile(file, 'utf8'));
            } catch (err) {
              if (err.code !== 'ENOENT') throw err;   // missing file is fine, others are not
            }
            settings.visits++;
            await writeFile(file, JSON.stringify(settings, null, 2));
            console.log('visits:', settings.visits);
          `),
          expectedOutput: 'visits: 1',
          explanation: [
            'First run: the file does not exist → `ENOENT` is handled → prints `visits: 1`; later runs print 2, 3…',
            'Pass an encoding (`\'utf8\'`) to get a string; without it you get a `Buffer`.',
            'Checking `err.code` is the idiomatic way to branch on fs errors (no `existsSync` race).',
          ],
        }),
        code({
          title: 'Stream a large file instead of buffering it',
          code: dedent(`
            import { createReadStream } from 'node:fs';
            import { createInterface } from 'node:readline';

            const rl = createInterface({ input: createReadStream('access.log') });
            let errors = 0;
            for await (const line of rl) {
              if (line.includes(' 500 ')) errors++;
            }
            console.log('5xx lines:', errors);
          `),
          expectedOutput: '5xx lines: 37',
          explanation: [
            'Reads 64 KiB chunks and yields lines; memory stays constant even for a 10 GB log (count varies).',
            '`readFile` would load the entire file into one Buffer and could exceed memory.',
          ],
        }),
        code({
          title: 'Sync vs async ordering',
          code: dedent(`
            const fs = require('node:fs');
            fs.readFile(__filename, () => console.log('async done'));
            fs.readFileSync(__filename);
            console.log('sync done');
          `),
          expectedOutput: 'sync done\nasync done',
          explanation: ['The sync call blocks until finished; the async callback can only run after the current script completes.'],
        }),
      ),
      section('real-world', 'Real-world usage',
        bullets(
          'Load config/certificates synchronously **at startup**, before `listen()`.',
          'Serve downloads by piping `createReadStream` to the response (see the stream lesson).',
          'Write uploads to a temp file, then `rename` atomically into place.',
          'Use `fs.watch` in dev tooling only — production config reloads usually come from signals or env.',
        ),
        code({
          title: 'Atomic write (avoid half-written files)',
          code: dedent(`
            import { writeFile, rename } from 'node:fs/promises';
            async function saveAtomic(file, data) {
              const tmp = file + '.' + process.pid + '.tmp';
              await writeFile(tmp, data);
              await rename(tmp, file);   // rename is atomic on the same filesystem
            }
          `),
          explanation: ['Readers either see the old file or the new one — never a partially written file after a crash.'],
        }),
      ),
      section('mistakes', 'Common mistakes',
        bullets(
          'Using `readFileSync` inside a request handler — blocks every other request.',
          '`if (existsSync(p)) await readFile(p)` — race condition (TOCTOU); just try and handle `ENOENT`.',
          'Relative paths resolved from `process.cwd()`, not the file — use `path.join(__dirname, ...)` / `import.meta.dirname`.',
          'Reading huge files with `readFile` — use streams.',
          'Opening thousands of files concurrently → `EMFILE`; limit concurrency.',
        ),
        code({
          title: 'Wrong vs right',
          code: dedent(`
            // ✗ blocks the event loop on every request
            app.get('/terms', (req, res) => res.send(fs.readFileSync('terms.html', 'utf8')));

            // ✓ read once at startup, or use async
            const terms = fs.readFileSync('terms.html', 'utf8');
            app.get('/terms', (req, res) => res.send(terms));
          `),
          explanation: ['Express is used for brevity — the point applies to any handler.'],
        }),
      ),
      section('interview', 'Interview tips',
        interviewTip('Mention the thread pool: "fs calls are async from JS but run blocking syscalls on libuv\'s 4-thread pool." Then contrast readFile (buffer all) vs createReadStream (constant memory).'),
      ),
      section('practice', 'Practice',
        steps(
          'Write `du(dir)` that sums file sizes recursively using `readdir({ withFileTypes: true })` and `stat`.',
          'Rewrite a `readFile`-based CSV import to use `createReadStream` + `readline`.',
        ),
      ),
      section('summary', 'Summary',
        bullets(
          'Prefer `node:fs/promises` for async work.',
          'Sync methods only at startup or in CLIs.',
          'Streams for large files.',
          'Handle errors by `err.code` (ENOENT, EACCES…).',
          'fs work runs on the libuv thread pool.',
        ),
      ),
    ],
    revisionNotes: [
      'Three APIs: callback, promises (fs/promises), sync (*Sync).',
      'fs uses libuv thread pool (default 4, UV_THREADPOOL_SIZE).',
      'readFile buffers everything; createReadStream = 64 KiB chunks.',
      'mkdir/rm recursive options; readdir recursive Node 20.1+.',
      'fs.exists deprecated; existsSync fine; avoid check-then-act races.',
      'Errors: ENOENT, EACCES, EEXIST, EMFILE.',
    ],
    quiz: [
      {
        kind: 'predict-output', difficulty: 'beginner',
        prompt: 'What is printed?',
        code: "const fs = require('node:fs');\nfs.readFile(__filename, () => console.log('B'));\nconsole.log('A');",
        options: ['B A', 'A B', 'A', 'B'],
        answer: 1,
        explanation: 'readFile is asynchronous; its callback runs on a later event-loop turn, after the synchronous `A`.',
      },
      {
        kind: 'scenario', difficulty: 'intermediate',
        prompt: 'An endpoint lets users download 2 GB video files. Memory spikes and the process crashes. What is the fix?',
        options: ['Increase --max-old-space-size', 'Use readFileSync to avoid concurrency', 'Pipe fs.createReadStream(file) to the response with stream.pipeline', 'Convert the file to base64 first'],
        answer: 2,
        explanation: 'Streaming sends chunks with backpressure, so memory stays flat. More heap only delays the crash; base64 makes data 33% bigger.',
      },
      {
        kind: 'find-bug', difficulty: 'intermediate',
        prompt: 'What is wrong with this code?',
        code: "import { readFile } from 'node:fs/promises';\nimport { existsSync } from 'node:fs';\nif (existsSync(path)) {\n  const data = await readFile(path, 'utf8');\n}",
        options: ['existsSync cannot be imported in ESM', 'Race condition: the file can be deleted between the check and the read; just try readFile and handle ENOENT', 'readFile needs a callback', 'utf8 must be uppercase'],
        answer: 1,
        explanation: 'Check-then-act is a TOCTOU race. existsSync is importable, and the promise API needs no callback.',
      },
    ],
    interview: [
      {
        category: 'nodejs', kind: 'concept', difficulty: 'beginner', topic: 'fs',
        question: 'What is the difference between fs.readFile and fs.createReadStream?',
        shortAnswer: '`readFile` loads the entire file into memory and gives it to you at once; `createReadStream` emits it in chunks (64 KiB by default) so memory stays constant and processing can start immediately.',
        detailedAnswer: [
          'readFile is fine for small files (config, templates).',
          'Streams support backpressure and piping to sockets, gzip, parsers.',
          'readFile has a hard size limit (~2 GB on 64-bit, `buffer.constants.MAX_LENGTH`).',
          'Both run I/O on the libuv thread pool.',
        ],
        followUp: 'How would you count lines in a 20 GB file?',
        trap: 'Saying streams are "faster" in all cases — for small files readFile is simpler and just as fast.',
      },
      {
        category: 'nodejs', kind: 'concept', difficulty: 'intermediate', topic: 'fs',
        question: 'When is it acceptable to use synchronous fs methods in a Node.js application?',
        shortAnswer: 'At startup before serving traffic (loading config, TLS certs), in CLIs and build scripts — never in request handlers or anywhere concurrent work is happening.',
        detailedAnswer: [
          'Sync calls block the single JS thread: no other requests, timers or callbacks run.',
          'At startup there is nothing else to block, and sync code is simpler.',
          '`require()` itself does sync fs reads — another reason to load modules at startup.',
          'Sync methods also throw directly, which suits fail-fast startup.',
        ],
        followUp: 'How would you detect event-loop blocking in production?',
        trap: 'Saying sync methods should never be used under any circumstances.',
      },
      {
        category: 'nodejs', kind: 'concept', difficulty: 'advanced', topic: 'fs',
        question: 'Why can heavy fs usage slow down unrelated crypto or DNS operations in Node.js?',
        shortAnswer: 'fs, crypto.pbkdf2/scrypt, zlib and dns.lookup all share libuv\'s thread pool, which has only 4 threads by default. If they are busy with slow disk I/O, other tasks queue behind them.',
        detailedAnswer: [
          'The pool is per process and shared by all of these APIs.',
          'Network sockets do NOT use the pool (they use epoll/kqueue/IOCP).',
          'Raise `UV_THREADPOOL_SIZE` (max 1024) before the pool is first used — usually set as an env var.',
          'Measure: long tail latencies on `dns.lookup` or hashing under file load are a typical symptom.',
          'Alternatives: `dns.resolve*` (c-ares, no pool), limiting concurrent fs ops.',
        ],
        followUp: 'Why does setting UV_THREADPOOL_SIZE inside the code sometimes not work?',
        trap: 'Assuming each async call gets its own thread, or that HTTP requests use the thread pool.',
      },
    ],
  },

  // ───────────────────────────────────────────────────────────
  'path-module': {
    summary: '`node:path` builds and parses file paths correctly on every OS: `join` concatenates, `resolve` produces an absolute path, `parse`/`basename`/`extname` take paths apart.',
    topics: ['path', 'path.join', 'path.resolve', 'path.parse', 'basename', 'extname', 'dirname', 'relative', 'normalize', 'path.sep', 'posix vs win32', 'path traversal'],
    sections: [
      section('introduction', undefined,
        text('`\'uploads/\' + name` works on your Mac, breaks on Windows and opens a path-traversal hole. `path` handles separators, `..` segments and absolute paths for you.'),
      ),
      section('definition', 'Definition',
        bullets(
          'Pure string manipulation — `path` never touches the disk.',
          'Uses the current OS rules by default; `path.posix` and `path.win32` force a style.',
          'All methods are synchronous (no I/O needed).',
        ),
      ),
      section('why', 'Why use it',
        bullets(
          'Separators differ: `/` on POSIX, `\\` on Windows (`path.sep`).',
          'Normalizes `.`, `..` and duplicate slashes.',
          'Builds absolute paths from `__dirname` / `import.meta.dirname` reliably.',
        ),
      ),
      section('internals', 'join vs resolve',
        flow([
          'path.join(a, b, c): concatenate with sep, then normalize',
          'path.resolve(a, b, c): process right→left until absolute; prepend cwd if needed',
        ], { title: 'Two different algorithms', direction: 'vertical' }),
        table('path.join vs path.resolve', ['', '`path.join`', '`path.resolve`'], [
          ['Result', 'Normalized, may be relative', 'Always absolute'],
          ['Uses `process.cwd()`', 'No', 'Yes, if no segment is absolute'],
          ['`join(\'/a\', \'/b\')`', '`/a/b`', '`resolve(\'/a\', \'/b\')` → `/b`'],
          ['Typical use', 'Combine known parts', 'Turn user/CLI input into an absolute path'],
        ]),
      ),
      section('visual', 'Important methods',
        table('path — important methods', ['Method', 'What it does', 'Style'], [
          ['`join(...parts)`', 'Join with separator and normalize', 'sync (pure)'],
          ['`resolve(...parts)`', 'Absolute path, cwd-based', 'sync (pure)'],
          ['`normalize(p)`', 'Resolve `.`/`..`, collapse slashes', 'sync (pure)'],
          ['`dirname(p)` / `basename(p, ext?)` / `extname(p)`', 'Directory / filename / extension', 'sync (pure)'],
          ['`parse(p)` / `format(obj)`', 'Split into `{ root, dir, base, name, ext }` and back', 'sync (pure)'],
          ['`relative(from, to)`', 'Relative path between two paths', 'sync (pure)'],
          ['`isAbsolute(p)`', 'Is it absolute?', 'sync (pure)'],
          ['`sep` / `delimiter`', '`/` or `\\` · `:` or `;` (PATH separator)', 'constants'],
          ['`path.posix` / `path.win32`', 'Force one platform\'s rules', 'namespaces'],
        ]),
      ),
      section('example', 'Examples',
        code({
          title: 'The essentials (POSIX output)',
          code: dedent(`
            const path = require('node:path');
            console.log(path.join('/srv', 'app', '../uploads', 'a.png'));
            console.log(path.resolve('config', 'app.json'));
            console.log(path.basename('/srv/app/report.pdf', '.pdf'));
            console.log(path.extname('archive.tar.gz'));
            console.log(path.parse('/srv/app/index.js'));
          `),
          expectedOutput: "/srv/uploads/a.png\n/home/dev/project/config/app.json\nreport\n.gz\n{\n  root: '/',\n  dir: '/srv/app',\n  base: 'index.js',\n  ext: '.js',\n  name: 'index'\n}",
          explanation: [
            '`join` normalizes `app/..` away.',
            '`resolve` prepends `process.cwd()` (here `/home/dev/project` — value varies).',
            '`extname` returns only the **last** extension.',
            'On Windows, separators would be `\\` and root like `C:\\`.',
          ],
        }),
        code({
          title: 'Same code, explicit platform',
          code: dedent(`
            const path = require('node:path');
            console.log(path.win32.join('C:\\\\data', 'logs', 'app.log'));
            console.log(path.posix.join('data', 'logs', 'app.log'));
          `),
          expectedOutput: 'C:\\data\\logs\\app.log\ndata/logs/app.log',
          explanation: ['Use `path.posix` for URL-like or archive paths that must always use `/`.'],
        }),
      ),
      section('real-world', 'Real-world usage: safe file serving',
        code({
          title: 'Prevent path traversal',
          code: dedent(`
            import path from 'node:path';
            const ROOT = path.resolve(import.meta.dirname, 'public');

            function safePath(userPath) {
              const full = path.resolve(ROOT, '.' + path.sep + userPath);
              if (full !== ROOT && !full.startsWith(ROOT + path.sep)) {
                throw Object.assign(new Error('Forbidden'), { status: 403 });
              }
              return full;
            }
            console.log(safePath('img/logo.png'));
            console.log(safePath('../../etc/passwd'));
          `),
          expectedOutput: '/srv/app/public/img/logo.png\nError: Forbidden',
          explanation: [
            'Resolve first, **then** check the prefix — checking the raw string misses `..` tricks.',
            'Compare with `ROOT + path.sep` so `/public-secret` does not pass as `/public` (paths vary).',
          ],
        }),
      ),
      section('mistakes', 'Common mistakes',
        bullets(
          'String concatenation with `/` — breaks on Windows and skips normalization.',
          'Using `path.join` for URLs — use the `URL` class instead.',
          'Expecting `resolve` to behave like `join` when a later segment starts with `/`.',
          'Using `path.dirname(import.meta.url)` — that is a URL, convert with `fileURLToPath` first.',
          'Validating user paths before resolving them.',
        ),
      ),
      section('interview', 'Interview tips',
        interviewTip('The classic: "`join` vs `resolve`?" Give the `/a` + `/b` example and the cwd point. Bonus: mention path traversal and the resolve-then-check pattern.'),
      ),
      section('practice', 'Practice',
        steps('Write `changeExt(file, ext)` using `parse` + `format` (hint: delete `base`).', 'Break `safePath` with an input and then fix it.'),
      ),
      section('summary', 'Summary',
        bullets(
          '`path` is pure string logic — no I/O.',
          '`join` concatenates; `resolve` returns absolute paths using cwd.',
          '`parse`, `basename`, `extname`, `dirname` take paths apart.',
          'Resolve then prefix-check to block traversal.',
        ),
      ),
    ],
    revisionNotes: [
      'join normalizes; resolve → absolute, right-to-left, cwd fallback.',
      'resolve(\'/a\', \'/b\') === \'/b\'; join(\'/a\', \'/b\') === \'/a/b\'.',
      'extname returns last extension only (.gz).',
      'path.sep / path.delimiter; path.posix / path.win32.',
      'Traversal guard: resolve, then startsWith(ROOT + sep).',
    ],
    quiz: [
      {
        kind: 'predict-output', difficulty: 'beginner',
        prompt: 'On Linux, what does this print?',
        code: "const path = require('node:path');\nconsole.log(path.join('/a', '/b', '../c'));",
        options: ['/b/c', '/a/c', '/c', '/a/b/../c'],
        answer: 1,
        explanation: 'join concatenates to `/a/b/../c` then normalizes `b/..` away → `/a/c`. `/c` would be resolve-like behaviour.',
      },
      {
        kind: 'predict-output', difficulty: 'intermediate',
        prompt: 'What does this print?',
        code: "const path = require('node:path');\nconsole.log(path.resolve('/a', '/b', 'c'));",
        options: ['/a/b/c', '/b/c', 'c', '/a/c'],
        answer: 1,
        explanation: 'resolve works right to left until it builds an absolute path: `c` + `/b` is absolute, so `/a` is ignored.',
      },
      {
        kind: 'mcq', difficulty: 'beginner',
        prompt: 'What does `path.extname(\'backup.tar.gz\')` return?',
        options: ['.tar.gz', 'gz', '.gz', 'tar.gz'],
        answer: 2,
        explanation: 'extname returns from the last dot, including the dot.',
      },
    ],
    interview: [
      {
        category: 'nodejs', kind: 'concept', difficulty: 'beginner', topic: 'path',
        question: 'What is the difference between path.join and path.resolve?',
        shortAnswer: '`join` concatenates segments and normalizes the result, which may stay relative. `resolve` processes segments right-to-left until it has an absolute path, falling back to `process.cwd()`.',
        detailedAnswer: [
          '`join(\'/a\', \'/b\')` → `/a/b`; `resolve(\'/a\', \'/b\')` → `/b`.',
          'resolve always returns an absolute path without a trailing slash.',
          'Use join with `__dirname` for files relative to code.',
          'Both are pure string operations.',
        ],
        followUp: 'Why is `path.join(process.cwd(), x)` often a bug?',
        trap: 'Thinking either function checks whether the path exists.',
      },
      {
        category: 'nodejs', kind: 'scenario', difficulty: 'intermediate', topic: 'path',
        question: 'How do you safely serve user-requested files from a directory without allowing path traversal?',
        shortAnswer: 'Resolve the user path against the root, then verify the result is still inside the root (`startsWith(root + path.sep)`), rejecting anything else.',
        detailedAnswer: [
          'Never concatenate raw input into a path.',
          'Decode URL encoding first (`%2e%2e%2f` is `../`).',
          'Reject null bytes; Node throws on them, but validate explicitly.',
          'Watch symlinks: use `fs.realpath` if the directory may contain them.',
          'Frameworks (e.g. Express `res.sendFile` with `root`) implement this check for you.',
        ],
        followUp: 'Why compare with root + path.sep instead of just root?',
        trap: 'Checking `input.includes(\'..\')` — easily bypassed and also blocks legitimate names.',
      },
    ],
  },

  // ───────────────────────────────────────────────────────────
  'os-module': {
    summary: '`node:os` reports facts about the machine — CPUs, memory, platform, network interfaces, temp/home directories and line endings — used for sizing pools, diagnostics and cross-platform code.',
    topics: ['os', 'os.cpus', 'os.availableParallelism', 'os.totalmem', 'os.freemem', 'os.platform', 'os.EOL', 'os.tmpdir', 'os.loadavg', 'containers', 'constrainedMemory'],
    sections: [
      section('introduction', undefined,
        text('How many workers should you start? Where is the temp folder? Is this Windows? `os` answers these without shelling out.'),
      ),
      section('definition', 'Definition',
        text('`node:os` exposes operating-system information and constants. Almost every function is synchronous and fast (reads cached kernel data).'),
      ),
      section('why', 'Why it matters',
        bullets(
          'Size cluster/worker pools by available CPUs.',
          'Health and metrics endpoints (load, memory, uptime).',
          'Cross-platform code: `os.EOL`, `os.tmpdir()`, `os.homedir()`.',
        ),
      ),
      section('internals', 'Where the data comes from',
        bullets(
          'Values come from libuv wrappers around OS calls (`/proc` on Linux, sysctl on macOS, Win32 APIs).',
          '`os.totalmem()`/`freemem()` report **host** memory — inside a container they ignore cgroup limits. Use `process.constrainedMemory()` (Node 19.6+/18.15+) for the limit.',
          '`os.availableParallelism()` (Node 18.14+) respects CPU affinity; prefer it over `os.cpus().length`.',
          '`os.loadavg()` always returns `[0, 0, 0]` on Windows.',
        ),
        flow(['Node os.* call', 'libuv uv_* function', 'Kernel data (/proc, sysctl, Win32)'], { direction: 'horizontal' }),
      ),
      section('visual', 'Important methods',
        table('os — important methods', ['Method / property', 'What it does', 'Style'], [
          ['`availableParallelism()`', 'Recommended number of parallel tasks (Node 18.14+)', 'sync'],
          ['`cpus()`', 'Array of CPU core info (model, speed, times)', 'sync'],
          ['`totalmem()` / `freemem()`', 'System memory in bytes (host, not container)', 'sync'],
          ['`platform()` / `type()` / `release()` / `arch()`', '`linux`/`win32`/`darwin`, kernel name/version, `x64`/`arm64`', 'sync'],
          ['`hostname()`', 'Machine name — useful in logs', 'sync'],
          ['`uptime()`', 'System uptime in seconds (not process uptime)', 'sync'],
          ['`loadavg()`', '1/5/15-minute load (0s on Windows)', 'sync'],
          ['`networkInterfaces()`', 'IP addresses per interface', 'sync'],
          ['`tmpdir()` / `homedir()`', 'Temp and home directories', 'sync'],
          ['`userInfo()`', 'Current user name, uid, shell', 'sync'],
          ['`EOL`', '`\\n` on POSIX, `\\r\\n` on Windows', 'constant'],
          ['`constants.signals`', 'Signal numbers (SIGTERM = 15)', 'constant'],
        ]),
      ),
      section('example', 'Examples',
        code({
          title: 'Machine snapshot',
          code: dedent(`
            import os from 'node:os';
            console.log(os.platform(), os.arch());
            console.log('cpus:', os.availableParallelism());
            console.log('mem GB:', (os.totalmem() / 1024 ** 3).toFixed(1));
            console.log('tmp:', os.tmpdir());
            console.log(JSON.stringify(os.EOL));
          `),
          expectedOutput: 'linux x64\ncpus: 8\nmem GB: 15.5\ntmp: /tmp\n"\\n"',
          explanation: ['Values vary per machine. On Windows you would see `win32 x64`, a `C:\\Users\\…\\AppData\\Local\\Temp` folder and `"\\r\\n"`.'],
        }),
        code({
          title: 'Container-aware memory',
          code: dedent(`
            const limit = process.constrainedMemory?.() || 0;
            const host = require('node:os').totalmem();
            console.log({ hostMb: Math.round(host / 1e6), limitMb: Math.round(limit / 1e6) });
          `),
          expectedOutput: '{ hostMb: 16654, limitMb: 536 }',
          explanation: ['In a container with a 512 MiB limit, `os.totalmem()` still reports the host\'s 16 GB. `constrainedMemory()` returns the cgroup limit (0 / undefined if none). Values vary.'],
          versionNote: '`process.constrainedMemory()` added in Node 19.6 / 18.15.',
        }),
      ),
      section('real-world', 'Real-world usage',
        code({
          title: 'Sizing a worker pool',
          code: dedent(`
            import os from 'node:os';
            const size = Math.max(1, os.availableParallelism() - 1);   // leave one core for the main thread
            console.log('starting', size, 'workers');
          `),
          expectedOutput: 'starting 7 workers',
          explanation: ['On an 8-core machine (varies). Used with `worker_threads` or `cluster`.'],
        }),
        tip('Write CSV/log output with `os.EOL` when files are meant for humans on that OS; use `\\n` for protocols and JSON lines.'),
      ),
      section('mistakes', 'Common mistakes',
        bullets(
          'Using `os.freemem()` to decide container health — it reports host memory.',
          'Confusing `os.uptime()` (machine) with `process.uptime()` (this process).',
          'Relying on `os.loadavg()` on Windows.',
          'Hard-coding `/tmp` instead of `os.tmpdir()`.',
        ),
      ),
      section('interview', 'Interview tips',
        interviewTip('If asked how many workers to start, answer `os.availableParallelism()` and add the container caveat — CPU quotas may be lower than the visible core count.'),
      ),
      section('practice', 'Practice',
        steps('Build a `/metrics` JSON endpoint with hostname, load, free memory and process RSS.', 'Run it inside Docker with `--memory=256m` and compare `os.totalmem()` and `process.constrainedMemory()`.'),
      ),
      section('summary', 'Summary',
        bullets(
          '`os` = machine facts, all synchronous.',
          'Use `availableParallelism()` for pool sizes.',
          'Host vs container: `totalmem` ignores cgroup limits.',
          '`EOL`, `tmpdir`, `homedir` for portable code.',
        ),
      ),
    ],
    revisionNotes: [
      'os.availableParallelism() (18.14+) > os.cpus().length.',
      'os.totalmem/freemem = host memory; containers → process.constrainedMemory().',
      'os.uptime = machine; process.uptime = process.',
      'loadavg is [0,0,0] on Windows.',
      'os.EOL: \\n vs \\r\\n.',
    ],
    quiz: [
      {
        kind: 'mcq', difficulty: 'beginner',
        prompt: 'Which call is the recommended way to decide how many worker threads to start?',
        options: ['os.loadavg()[0]', 'os.availableParallelism()', 'os.freemem() / 1e9', 'os.uptime()'],
        answer: 1,
        explanation: 'availableParallelism returns the number of CPUs the process can use. loadavg measures load, not capacity.',
      },
      {
        kind: 'scenario', difficulty: 'intermediate',
        prompt: 'In a Kubernetes pod limited to 512 MiB, your health check says "16 GB total memory, plenty free" just before an OOM kill. Why?',
        options: ['Node caches memory values at startup', 'os.totalmem/freemem report host memory, not the container limit', 'Kubernetes hides memory from Node', 'freemem is in kilobytes'],
        answer: 1,
        explanation: 'os reads host-level values; use process.constrainedMemory() and process.memoryUsage().rss for the pod view.',
      },
    ],
    interview: [
      {
        category: 'nodejs', kind: 'concept', difficulty: 'beginner', topic: 'os',
        question: 'What kind of information does the os module provide and where would you use it in a backend?',
        shortAnswer: 'Machine-level facts: CPU count, memory, platform/arch, hostname, network interfaces, temp/home dirs, EOL. Used for pool sizing, metrics/health endpoints and cross-platform code.',
        detailedAnswer: [
          'All functions are synchronous and cheap.',
          '`availableParallelism()` for cluster/worker counts.',
          '`hostname()` in structured logs to identify instances.',
          '`tmpdir()` for scratch files, `EOL` for text output.',
        ],
        followUp: 'How is os.uptime different from process.uptime?',
        trap: 'Using os data as if it described only the current process.',
      },
      {
        category: 'nodejs', kind: 'concept', difficulty: 'intermediate', topic: 'os',
        question: 'Why can os.totalmem() and os.cpus() be misleading inside a Docker container?',
        shortAnswer: 'They report the host\'s resources, not the container\'s cgroup limits, so you may size pools or caches for a machine you do not actually have.',
        detailedAnswer: [
          'Memory limit: use `process.constrainedMemory()` (19.6+/18.15+).',
          'CPU quotas are not reflected in `os.cpus().length`; `availableParallelism` respects CPU affinity, but CFS quotas are only considered by newer libuv versions — verify on your Node version.',
          'Pass limits explicitly via env vars (e.g. WORKERS=2) when in doubt.',
          'V8 heap limits may also need `--max-old-space-size` tuned to the container.',
        ],
        followUp: 'How does Node pick its default heap size?',
        trap: 'Assuming Node automatically sizes everything to the container.',
      },
    ],
  },
};

export default content;
