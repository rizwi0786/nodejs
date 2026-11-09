import type { Project } from '../../types';
import { dedent, entity } from './shared';

export const p02: Project = {
  id: 'p02',
  number: 2,
  level: 'beginner',
  title: 'File Management Application',
  status: 'ready',
  summary: 'A CLI that lists, searches, organises (with undo), batch-renames, copies and de-duplicates files using `fs/promises`, `path` and streams.',
  skills: ['fs/promises', 'path', 'Async generators', 'Streams + pipeline', 'crypto hashing', 'Cross-device moves'],
  estHours: 6,
  prerequisites: [
    'm03-fs-module',
    'm03-path-module',
    'm03-crypto-module',
    'm06-streams-introduction',
    'm06-piping',
    'm06-transform-streams',
    'm06-streaming-large-files',
    'm05-error-handling-in-asynchronous-code',
  ],
  requirements: {
    functional: [
      '`fm list <dir>` — files with size and modified time, sortable by `name|size|mtime`.',
      '`fm search <dir> --ext .jpg --min-size 1MB --name report` — recursive search.',
      '`fm organize <dir> [--dry-run]` — move files into `images/`, `documents/`, `audio/`, `video/`, `archives/`, `other/` by extension.',
      '`fm undo <dir>` — reverse the last organize using a history file.',
      '`fm rename <dir> --match "IMG_" --to "holiday-" ` — batch rename with preview.',
      '`fm duplicates <dir>` — group files with identical SHA-256 content.',
      '`fm copy <src> <dest>` — stream-copy large files with a progress indicator.',
    ],
    nonFunctional: [
      'Node core only; works on Windows, macOS and Linux (always build paths with `path.join`).',
      'Constant memory: files are hashed/copied as streams, directories walked lazily with `fs.opendir`.',
      'Never overwrite an existing file — add a numeric suffix (`photo (1).jpg`).',
      'Destructive commands support `--dry-run` and print exactly what would change.',
      'Moves across drives/filesystems work (`EXDEV` fallback to copy + unlink).',
    ],
  },
  architecture: {
    diagramId: 'stream-pipeline',
    flow: [
      { label: 'cli.js', detail: 'parseArgs → command' },
      { label: 'walk()', detail: 'async generator over fs.opendir' },
      { label: 'filters', detail: 'ext / size / name predicates' },
      { label: 'operation', detail: 'move · rename · hash · copy' },
      { label: 'history.js', detail: 'append undo entries' },
      { label: 'stdout', detail: 'report / progress' },
    ],
    notes: [
      'The walker yields one file at a time, so a 1 000 000-file tree never sits in memory as an array.',
      'Hashing and copying use `stream.pipeline` from `node:stream/promises` — it propagates errors and destroys streams on failure.',
      'Each organize run writes its moves to `.fm-history.json` before reporting success; `undo` replays it backwards.',
    ],
  },
  folderStructure: dedent(`
    file-manager/
    ├── package.json            # "bin": { "fm": "./src/cli.js" }
    ├── src/
    │   ├── cli.js              # argument parsing + dispatch
    │   ├── walk.js             # recursive async generator
    │   ├── categories.js       # extension → folder map
    │   ├── move.js             # safeMove (collision + EXDEV handling)
    │   ├── commands/
    │   │   ├── list.js
    │   │   ├── search.js
    │   │   ├── organize.js
    │   │   ├── undo.js
    │   │   ├── rename.js
    │   │   ├── duplicates.js
    │   │   └── copy.js
    │   └── history.js          # read/write .fm-history.json
    └── test/
        └── organize.test.js
  `),
  databaseDesign: [
    entity('.fm-history.json (root, inside the organised folder)', [
      ['version', 'number', '= 1', 'File format version'],
      ['runs', 'Run[]', 'newest last', 'One entry per organize/rename run'],
    ]),
    entity('Run', [
      ['id', 'string', 'randomUUID()', ''],
      ['command', "'organize' | 'rename'", 'required', ''],
      ['at', 'string', 'ISO timestamp', ''],
      ['moves', '{ from: string, to: string }[]', 'paths relative to the root', 'Relative so the folder can be moved and undo still works'],
    ]),
    entity('Category map (src/categories.js)', [
      ['images', 'string[]', 'lower-case extensions', '.jpg .jpeg .png .gif .webp .svg .heic'],
      ['documents', 'string[]', '', '.pdf .doc .docx .txt .md .xlsx .csv .pptx'],
      ['audio / video', 'string[]', '', '.mp3 .wav .flac / .mp4 .mov .mkv .webm'],
      ['archives', 'string[]', '', '.zip .tar .gz .7z .rar'],
      ['other', '—', 'fallback', 'Anything unmatched'],
    ]),
  ],
  endpoints: [
    { method: 'CLI', path: 'fm list <dir> [--sort name|size|mtime]', description: 'List files in a directory (non-recursive).' },
    { method: 'CLI', path: 'fm search <dir> [--ext .pdf] [--name text] [--min-size 10MB]', description: 'Recursive search with filters.' },
    { method: 'CLI', path: 'fm organize <dir> [--dry-run]', description: 'Move files into category folders.' },
    { method: 'CLI', path: 'fm undo <dir>', description: 'Reverse the last organize/rename run.' },
    { method: 'CLI', path: 'fm rename <dir> --match <text> --to <text> [--dry-run]', description: 'Batch rename by substring.' },
    { method: 'CLI', path: 'fm duplicates <dir>', description: 'Find files with identical content (SHA-256).' },
    { method: 'CLI', path: 'fm copy <src> <dest>', description: 'Stream-copy with progress.' },
  ],
  steps: [
    {
      title: 'Walk directories lazily with an async generator',
      bullets: [
        '`fs.opendir` returns a `Dir` you can `for await` — entries are read in batches, not all at once.',
        'Skip symlinks to avoid infinite loops; skip `node_modules` and dot-folders by default.',
        'Note: `fs.readdir(dir, { recursive: true })` (Node 20+) is simpler but builds the whole array in memory.',
      ],
      code: {
        id: 'p02-s1',
        title: 'src/walk.js',
        language: 'javascript',
        code: dedent(`
          import { opendir } from 'node:fs/promises';
          import path from 'node:path';

          const SKIP = new Set(['node_modules', '.git']);

          export async function* walk(dir, { recursive = true } = {}) {
            const handle = await opendir(dir);
            for await (const entry of handle) {
              const full = path.join(dir, entry.name);
              if (entry.isSymbolicLink()) continue;
              if (entry.isDirectory()) {
                if (recursive && !SKIP.has(entry.name) && !entry.name.startsWith('.')) {
                  yield* walk(full, { recursive });
                }
              } else if (entry.isFile()) {
                yield full;
              }
            }
          }
        `),
      },
    },
    {
      title: 'Search with composable filters',
      bullets: [
        'Turn each option into a predicate and keep only files that pass all of them.',
        'Parse sizes like `10MB` into bytes; compare extensions in lower case (`.JPG` = `.jpg`).',
        'Call `stat` only if a size filter is present — it is the expensive part.',
      ],
      code: {
        id: 'p02-s2',
        title: 'src/commands/search.js',
        language: 'javascript',
        code: dedent(`
          import { stat } from 'node:fs/promises';
          import path from 'node:path';
          import { walk } from '../walk.js';

          const UNITS = { B: 1, KB: 1024, MB: 1024 ** 2, GB: 1024 ** 3 };

          export function parseSize(text) {
            const m = /^(\\d+(?:\\.\\d+)?)\\s*(B|KB|MB|GB)?$/i.exec(text);
            if (!m) throw new Error(\`Invalid size: \${text}\`);
            return Math.round(Number(m[1]) * UNITS[(m[2] ?? 'B').toUpperCase()]);
          }

          export async function* search(root, { ext, name, minSize }) {
            const wantExt = ext?.toLowerCase();
            const wantName = name?.toLowerCase();
            const min = minSize ? parseSize(minSize) : 0;

            for await (const file of walk(root)) {
              const base = path.basename(file).toLowerCase();
              if (wantExt && path.extname(base) !== wantExt) continue;
              if (wantName && !base.includes(wantName)) continue;
              if (min) {
                const { size } = await stat(file);
                if (size < min) continue;
                yield { file, size };
              } else {
                yield { file };
              }
            }
          }
        `),
      },
    },
    {
      title: 'Move files safely (collisions + cross-device)',
      bullets: [
        '`rename` fails with `EXDEV` when source and target are on different drives — fall back to `copyFile` + `unlink`.',
        'Find a free name by appending ` (1)`, ` (2)`… Use the `COPYFILE_EXCL` flag so a race cannot overwrite a file.',
      ],
      code: {
        id: 'p02-s3',
        title: 'src/move.js',
        language: 'javascript',
        code: dedent(`
          import { rename, copyFile, unlink, mkdir, access, constants } from 'node:fs/promises';
          import path from 'node:path';

          async function exists(p) {
            try {
              await access(p);
              return true;
            } catch {
              return false;
            }
          }

          export async function freePath(target) {
            const { dir, name, ext } = path.parse(target);
            let candidate = target;
            for (let i = 1; await exists(candidate); i++) {
              candidate = path.join(dir, \`\${name} (\${i})\${ext}\`);
            }
            return candidate;
          }

          export async function safeMove(from, to) {
            await mkdir(path.dirname(to), { recursive: true });
            const target = await freePath(to);
            try {
              await rename(from, target);
            } catch (err) {
              if (err.code !== 'EXDEV') throw err;
              await copyFile(from, target, constants.COPYFILE_EXCL);
              await unlink(from);
            }
            return target;
          }
        `),
      },
    },
    {
      title: 'Map extensions to categories',
      bullets: ['A plain lookup table — lower-case the extension so `.JPG` and `.jpg` match.'],
      code: {
        id: 'p02-s3b',
        title: 'src/categories.js',
        language: 'javascript',
        code: dedent(`
          import path from 'node:path';

          const CATEGORIES = {
            images: ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.heic'],
            documents: ['.pdf', '.doc', '.docx', '.txt', '.md', '.xlsx', '.csv', '.pptx'],
            audio: ['.mp3', '.wav', '.flac', '.m4a'],
            video: ['.mp4', '.mov', '.mkv', '.webm'],
            archives: ['.zip', '.tar', '.gz', '.7z', '.rar'],
          };

          const BY_EXT = new Map(
            Object.entries(CATEGORIES).flatMap(([category, exts]) => exts.map((ext) => [ext, category])),
          );

          export function categoryFor(fileName) {
            return BY_EXT.get(path.extname(fileName).toLowerCase()) ?? 'other';
          }
        `),
      },
    },
    {
      title: 'Organize by category and record history',
      bullets: [
        'Only top-level files are organised (non-recursive walk) — otherwise already-sorted folders get re-sorted.',
        '`--dry-run` prints the plan without touching disk.',
        'History stores **relative** paths, written after the moves succeed.',
      ],
      code: {
        id: 'p02-s4',
        title: 'src/commands/organize.js',
        language: 'javascript',
        code: dedent(`
          import path from 'node:path';
          import { walk } from '../walk.js';
          import { categoryFor } from '../categories.js';
          import { safeMove } from '../move.js';
          import { appendRun } from '../history.js';

          export async function organize(root, { dryRun = false } = {}) {
            const moves = [];
            for await (const file of walk(root, { recursive: false })) {
              const base = path.basename(file);
              if (base === '.fm-history.json') continue;
              const dest = path.join(root, categoryFor(base), base);
              if (dryRun) {
                console.log(\`[dry-run] \${base} -> \${path.relative(root, dest)}\`);
                continue;
              }
              const finalPath = await safeMove(file, dest);
              moves.push({ from: path.relative(root, file), to: path.relative(root, finalPath) });
            }
            if (!dryRun && moves.length) await appendRun(root, 'organize', moves);
            return moves;
          }
        `),
      },
    },
    {
      title: 'Undo the last run',
      bullets: [
        'Pop the newest run and move each file back in **reverse** order.',
        'If a file was deleted since, report it and continue — never abort half way.',
      ],
      code: {
        id: 'p02-s5',
        title: 'src/history.js + src/commands/undo.js',
        language: 'javascript',
        code: dedent(`
          // history.js
          import { readFile, writeFile, rename } from 'node:fs/promises';
          import { randomUUID } from 'node:crypto';
          import path from 'node:path';

          const fileFor = (root) => path.join(root, '.fm-history.json');

          export async function readHistory(root) {
            try {
              return JSON.parse(await readFile(fileFor(root), 'utf8'));
            } catch (err) {
              if (err.code === 'ENOENT') return { version: 1, runs: [] };
              throw err;
            }
          }

          export async function writeHistory(root, history) {
            const tmp = fileFor(root) + '.tmp';
            await writeFile(tmp, JSON.stringify(history, null, 2));
            await rename(tmp, fileFor(root));
          }

          export async function appendRun(root, command, moves) {
            const history = await readHistory(root);
            history.runs.push({ id: randomUUID(), command, at: new Date().toISOString(), moves });
            await writeHistory(root, history);
          }

          // commands/undo.js
          import { safeMove } from '../move.js';

          export async function undo(root) {
            const history = await readHistory(root);
            const run = history.runs.pop();
            if (!run) return console.log('Nothing to undo.');
            for (const { from, to } of [...run.moves].reverse()) {
              try {
                await safeMove(path.join(root, to), path.join(root, from));
              } catch (err) {
                console.error(\`Skipped \${to}: \${err.code ?? err.message}\`);
              }
            }
            await writeHistory(root, history);
            console.log(\`Undid \${run.command} from \${run.at} (\${run.moves.length} files)\`);
          }
        `),
      },
    },
    {
      title: 'Find duplicates by hashing streams',
      bullets: [
        'Group by size first — files with a unique size cannot be duplicates, so most files are never hashed.',
        'Hash with `pipeline(createReadStream(file), hash)` — constant memory even for 10 GB videos.',
      ],
      code: {
        id: 'p02-s6',
        title: 'src/commands/duplicates.js',
        language: 'javascript',
        code: dedent(`
          import { createReadStream } from 'node:fs';
          import { stat } from 'node:fs/promises';
          import { createHash } from 'node:crypto';
          import { pipeline } from 'node:stream/promises';
          import { walk } from '../walk.js';

          async function hashFile(file) {
            const hash = createHash('sha256');
            await pipeline(createReadStream(file), hash);
            return hash.digest('hex');
          }

          export async function findDuplicates(root) {
            const bySize = new Map();
            for await (const file of walk(root)) {
              const { size } = await stat(file);
              if (size === 0) continue;
              if (!bySize.has(size)) bySize.set(size, []);
              bySize.get(size).push(file);
            }

            const byHash = new Map();
            for (const files of bySize.values()) {
              if (files.length < 2) continue;
              for (const file of files) {
                const digest = await hashFile(file);
                if (!byHash.has(digest)) byHash.set(digest, []);
                byHash.get(digest).push(file);
              }
            }
            return [...byHash.values()].filter((group) => group.length > 1);
          }
        `),
      },
    },
    {
      title: 'Copy large files with progress',
      bullets: [
        'A `Transform` that counts bytes sits in the middle of the pipeline; backpressure is handled by `pipeline`.',
        'Write progress with `\\r` on a TTY so it updates one line.',
      ],
      code: {
        id: 'p02-s7',
        title: 'src/commands/copy.js',
        language: 'javascript',
        code: dedent(`
          import { createReadStream, createWriteStream } from 'node:fs';
          import { stat } from 'node:fs/promises';
          import { Transform } from 'node:stream';
          import { pipeline } from 'node:stream/promises';

          export async function copyWithProgress(src, dest) {
            const { size } = await stat(src);
            let copied = 0;
            let lastPct = -1;

            const progress = new Transform({
              transform(chunk, _enc, callback) {
                copied += chunk.length;
                const pct = Math.floor((copied / size) * 100);
                if (pct !== lastPct && process.stdout.isTTY) {
                  process.stdout.write(\`\\rCopying... \${pct}%\`);
                  lastPct = pct;
                }
                callback(null, chunk);
              },
            });

            // flags 'wx' fails if dest already exists instead of overwriting it
            await pipeline(createReadStream(src), progress, createWriteStream(dest, { flags: 'wx' }));
            if (process.stdout.isTTY) process.stdout.write('\\n');
            return copied;
          }
        `),
      },
    },
    {
      title: 'Wire up the CLI',
      bullets: [
        'Same `parseArgs` pattern as p01; resolve `<dir>` with `path.resolve` so relative paths work.',
        'Check the directory exists (`stat(dir).isDirectory()`) before running any command.',
        'Search streams results: print each match as it is found instead of collecting an array.',
      ],
    },
  ],
  testing: {
    bullets: [
      'Create a throw-away tree in `os.tmpdir()` with `mkdtemp`, run the command, assert on the resulting files.',
      'Test collision handling: two `photo.jpg` sources must end up as `photo.jpg` and `photo (1).jpg`.',
      'Test `organize` → `undo` round-trip returns the exact original layout.',
      'Test duplicates with same-size-different-content files (must not be reported).',
    ],
    code: {
      id: 'p02-test',
      title: 'test/organize.test.js',
      language: 'javascript',
      code: dedent(`
        import { test } from 'node:test';
        import assert from 'node:assert/strict';
        import { mkdtemp, writeFile, readdir, rm } from 'node:fs/promises';
        import { tmpdir } from 'node:os';
        import path from 'node:path';
        import { organize } from '../src/commands/organize.js';
        import { undo } from '../src/commands/undo.js';

        test('organize moves files into categories and undo restores them', async (t) => {
          const root = await mkdtemp(path.join(tmpdir(), 'fm-'));
          t.after(() => rm(root, { recursive: true, force: true }));
          await writeFile(path.join(root, 'cat.JPG'), 'img');
          await writeFile(path.join(root, 'notes.pdf'), 'pdf');
          await writeFile(path.join(root, 'data.xyz'), '???');

          const moves = await organize(root);
          assert.equal(moves.length, 3);
          assert.deepEqual(await readdir(path.join(root, 'images')), ['cat.JPG']);
          assert.deepEqual(await readdir(path.join(root, 'documents')), ['notes.pdf']);
          assert.deepEqual(await readdir(path.join(root, 'other')), ['data.xyz']);

          await undo(root);
          const top = (await readdir(root, { withFileTypes: true }))
            .filter((e) => e.isFile() && e.name !== '.fm-history.json')
            .map((e) => e.name)
            .sort();
          assert.deepEqual(top, ['cat.JPG', 'data.xyz', 'notes.pdf']);
        });

        test('dry run changes nothing', async (t) => {
          const root = await mkdtemp(path.join(tmpdir(), 'fm-'));
          t.after(() => rm(root, { recursive: true, force: true }));
          await writeFile(path.join(root, 'a.png'), 'x');
          await organize(root, { dryRun: true });
          assert.deepEqual(await readdir(root), ['a.png']);
        });
      `),
    },
  },
  security: [
    'Resolve every user path with `path.resolve` and refuse to operate on `/`, the home directory root or system folders.',
    'Undo paths come from a file on disk — verify each resolved path stays inside the root (`!path.relative(root, p).startsWith(\'..\')`).',
    'Skip symbolic links: following them can escape the target folder or loop forever.',
    'Never overwrite: `COPYFILE_EXCL` / `flags: \'wx\'` turn a silent data loss into an error.',
    'Default to `--dry-run` output in docs and README so users preview destructive operations.',
  ],
  deployment: {
    bullets: [
      'Publish to npm with a `bin` entry like p01, or install from git: `npm i -g github:you/file-manager`.',
      'Schedule `fm organize ~/Downloads` nightly with cron (Linux/macOS) or Task Scheduler (Windows).',
      'Test on all three OSes in CI with a GitHub Actions matrix.',
    ],
    code: {
      id: 'p02-deploy',
      title: '.github/workflows/test.yml',
      language: 'yaml',
      code: dedent(`
        name: test
        on: [push, pull_request]
        jobs:
          test:
            strategy:
              matrix:
                os: [ubuntu-latest, windows-latest, macos-latest]
                node: [20, 22]
            runs-on: \${{ matrix.os }}
            steps:
              - uses: actions/checkout@v4
              - uses: actions/setup-node@v4
                with:
                  node-version: \${{ matrix.node }}
              - run: npm test
      `),
    },
  },
  extensions: [
    'Watch mode: `fs.watch` a folder and organise new downloads automatically (debounce events).',
    'Organise by date taken (`YYYY/MM`) using `stat.mtime`.',
    'Compress old files with `zlib.createGzip()` in a pipeline.',
    'Parallel hashing with a small concurrency limit (e.g. 4 at a time).',
    'Glob patterns via `fs.glob` (experimental in Node 22).',
  ],
};
