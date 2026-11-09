import type { Project } from '../../types';
import { dedent, entity } from './shared';

export const p01: Project = {
  id: 'p01',
  number: 1,
  level: 'beginner',
  title: 'CLI Task Manager',
  status: 'ready',
  summary: 'A command-line to-do app that parses arguments with `util.parseArgs` and stores tasks in a JSON file written atomically.',
  skills: ['util.parseArgs', 'fs/promises', 'JSON persistence', 'Atomic writes', 'Exit codes', 'node:test'],
  estHours: 4,
  prerequisites: [
    'm02-running-javascript-files',
    'm03-es-modules',
    'm03-fs-module',
    'm03-path-module',
    'm03-process-module',
    'm03-util-module',
    'm01-error-handling',
    'm05-async-await',
  ],
  requirements: {
    functional: [
      '`task add "<title>" [--priority low|medium|high] [--due YYYY-MM-DD]` creates a task.',
      '`task list [--status open|done|all]` prints tasks in a table, sorted by priority then due date.',
      '`task done <id>`, `task undo <id>`, `task edit <id> --title ...`, `task remove <id>`.',
      '`task clear --done` deletes all completed tasks.',
      '`task --help` prints usage; unknown commands/options print an error.',
    ],
    nonFunctional: [
      'Zero dependencies — Node core only (Node 20+).',
      'Data survives a crash mid-write (write to temp file, then `rename`).',
      'Exit code `0` on success, `1` on user error, `2` on unexpected error — scriptable from shell.',
      'Data file location configurable via `TASKS_FILE` env var (default `~/.task-manager/tasks.json`).',
      'Every command finishes in < 100 ms for 10 000 tasks.',
    ],
  },
  architecture: {
    flow: [
      { label: 'Shell', detail: '`task add "Buy milk" -p high`' },
      { label: 'cli.js', detail: '`parseArgs` → command + options' },
      { label: 'commands.js', detail: 'Validate input, call the store' },
      { label: 'store.js', detail: 'Load JSON → mutate → atomic save' },
      { label: 'format.js', detail: 'Render table to stdout' },
      { label: 'Exit code', detail: '0 / 1 / 2' },
    ],
    notes: [
      'Three small modules: parsing (I/O at the edge), commands (logic), store (persistence). Logic is testable without a terminal.',
      'The store reads the whole file per command — fine for a personal CLI; a database is overkill here.',
      'Errors the user can fix (`UserError`) print a friendly message; anything else prints the stack and exits 2.',
    ],
  },
  folderStructure: dedent(`
    task-manager/
    ├── package.json          # "type": "module", "bin": { "task": "./src/cli.js" }
    ├── src/
    │   ├── cli.js            # entry: shebang, parseArgs, exit codes
    │   ├── commands.js       # add / list / done / undo / edit / remove / clear
    │   ├── store.js          # TaskStore: load + atomic save
    │   ├── format.js         # table output, colours via util.styleText
    │   └── errors.js         # UserError
    └── test/
        └── cli.test.js       # node:test, runs the real CLI in a temp dir
  `),
  databaseDesign: [
    entity('tasks.json (root object)', [
      ['version', 'number', 'required, = 1', 'Schema version — lets you migrate the file format later'],
      ['nextId', 'number', 'required, > 0', 'Auto-increment counter; ids are never reused'],
      ['tasks', 'Task[]', 'required', 'All tasks, open and done'],
    ]),
    entity('Task (item in tasks[])', [
      ['id', 'number', 'unique', 'Short numeric id typed by the user (`task done 3`)'],
      ['title', 'string', '1–200 chars, trimmed', ''],
      ['priority', "'low' | 'medium' | 'high'", "default 'medium'", 'Sort key'],
      ['due', 'string | null', 'ISO date YYYY-MM-DD', 'Validated with `Date.parse`'],
      ['done', 'boolean', "default false", ''],
      ['createdAt', 'string', 'ISO timestamp', '`new Date().toISOString()`'],
      ['completedAt', 'string | null', 'ISO timestamp', 'Set by `done`, cleared by `undo`'],
    ]),
  ],
  endpoints: [
    { method: 'CLI', path: 'task add "<title>" [-p high] [--due 2026-12-01]', description: 'Create a task; prints its id.' },
    { method: 'CLI', path: 'task list [--status open|done|all]', description: 'List tasks (default: open).' },
    { method: 'CLI', path: 'task done <id>', description: 'Mark a task complete.' },
    { method: 'CLI', path: 'task undo <id>', description: 'Re-open a completed task.' },
    { method: 'CLI', path: 'task edit <id> [--title ...] [-p ...] [--due ...]', description: 'Update fields of a task.' },
    { method: 'CLI', path: 'task remove <id>', description: 'Delete a task.' },
    { method: 'CLI', path: 'task clear --done', description: 'Delete all completed tasks.' },
    { method: 'CLI', path: 'task --help', description: 'Show usage.' },
  ],
  steps: [
    {
      title: 'Initialise the package',
      bullets: [
        '`npm init -y`, then set `"type": "module"` and a `bin` entry pointing at `src/cli.js`.',
        'Add `"engines": { "node": ">=20" }` — `util.parseArgs` is stable from Node 20.',
        'Scripts: `"test": "node --test"`, `"dev": "node --watch src/cli.js"`.',
      ],
      code: {
        id: 'p01-s1',
        title: 'package.json',
        language: 'json',
        code: dedent(`
          {
            "name": "@you/task-manager",
            "version": "1.0.0",
            "type": "module",
            "bin": { "task": "./src/cli.js" },
            "files": ["src"],
            "engines": { "node": ">=20" },
            "scripts": {
              "test": "node --test",
              "start": "node src/cli.js"
            }
          }
        `),
      },
    },
    {
      title: 'Build the store with atomic writes',
      bullets: [
        'Missing file (`ENOENT`) → return an empty document instead of crashing.',
        'Corrupt JSON → throw a clear error and **never** overwrite the user\'s file.',
        'Write to `tasks.json.<pid>.tmp`, then `rename` — rename is atomic on the same filesystem, so a crash leaves either the old or the new file, never half of one.',
      ],
      code: {
        id: 'p01-s2',
        title: 'src/store.js',
        language: 'javascript',
        code: dedent(`
          import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
          import path from 'node:path';
          import os from 'node:os';

          const DEFAULT_FILE = path.join(os.homedir(), '.task-manager', 'tasks.json');
          const EMPTY = () => ({ version: 1, nextId: 1, tasks: [] });

          export class TaskStore {
            constructor(file = process.env.TASKS_FILE ?? DEFAULT_FILE) {
              this.file = file;
            }

            async load() {
              let raw;
              try {
                raw = await readFile(this.file, 'utf8');
              } catch (err) {
                if (err.code === 'ENOENT') return EMPTY();
                throw err;
              }
              let data;
              try {
                data = JSON.parse(raw);
              } catch (err) {
                throw new Error(\`Corrupted task file: \${this.file}\`, { cause: err });
              }
              if (data.version !== 1 || !Array.isArray(data.tasks)) {
                throw new Error(\`Unsupported task file format in \${this.file}\`);
              }
              return data;
            }

            async save(data) {
              await mkdir(path.dirname(this.file), { recursive: true });
              const tmp = \`\${this.file}.\${process.pid}.tmp\`;
              await writeFile(tmp, JSON.stringify(data, null, 2) + '\\n', 'utf8');
              await rename(tmp, this.file); // atomic replace
            }

            /** Load, let fn mutate the document, save. Returns fn's result. */
            async update(fn) {
              const data = await this.load();
              const result = fn(data);
              await this.save(data);
              return result;
            }
          }
        `),
      },
    },
    {
      title: 'Write the commands (pure logic)',
      bullets: [
        'Each command receives the store and parsed values — no `process.argv` here, so it is easy to test.',
        'Throw `UserError` for anything the user can fix (unknown id, bad date).',
      ],
      code: {
        id: 'p01-s3',
        title: 'src/commands.js',
        language: 'javascript',
        code: dedent(`
          import { UserError } from './errors.js';

          const PRIORITIES = ['low', 'medium', 'high'];
          const RANK = { high: 0, medium: 1, low: 2 };

          function parseId(value) {
            const id = Number(value);
            if (!Number.isInteger(id) || id <= 0) throw new UserError(\`Invalid id: \${value}\`);
            return id;
          }

          function validate({ title, priority, due }) {
            if (title !== undefined && (!title.trim() || title.length > 200)) {
              throw new UserError('Title must be 1-200 characters');
            }
            if (priority !== undefined && !PRIORITIES.includes(priority)) {
              throw new UserError(\`Priority must be one of: \${PRIORITIES.join(', ')}\`);
            }
            if (due !== undefined && (!/^\\d{4}-\\d{2}-\\d{2}$/.test(due) || Number.isNaN(Date.parse(due)))) {
              throw new UserError('Due date must be YYYY-MM-DD');
            }
          }

          function findTask(data, rawId) {
            const id = parseId(rawId);
            const task = data.tasks.find((t) => t.id === id);
            if (!task) throw new UserError(\`Task \${id} not found\`);
            return task;
          }

          export async function add(store, title, { priority = 'medium', due } = {}) {
            validate({ title, priority, due });
            return store.update((data) => {
              const task = {
                id: data.nextId++,
                title: title.trim(),
                priority,
                due: due ?? null,
                done: false,
                createdAt: new Date().toISOString(),
                completedAt: null,
              };
              data.tasks.push(task);
              return task;
            });
          }

          export async function list(store, { status = 'open' } = {}) {
            const { tasks } = await store.load();
            return tasks
              .filter((t) => status === 'all' || (status === 'done' ? t.done : !t.done))
              .sort((a, b) => RANK[a.priority] - RANK[b.priority] || (a.due ?? '9999').localeCompare(b.due ?? '9999'));
          }

          export async function setDone(store, rawId, done) {
            return store.update((data) => {
              const task = findTask(data, rawId);
              task.done = done;
              task.completedAt = done ? new Date().toISOString() : null;
              return task;
            });
          }

          export async function edit(store, rawId, changes) {
            validate(changes);
            return store.update((data) => {
              const task = findTask(data, rawId);
              for (const key of ['title', 'priority', 'due']) {
                if (changes[key] !== undefined) task[key] = key === 'title' ? changes[key].trim() : changes[key];
              }
              return task;
            });
          }

          export async function remove(store, rawId) {
            return store.update((data) => {
              const task = findTask(data, rawId);
              data.tasks = data.tasks.filter((t) => t !== task);
              return task;
            });
          }

          export async function clearDone(store) {
            return store.update((data) => {
              const before = data.tasks.length;
              data.tasks = data.tasks.filter((t) => !t.done);
              return before - data.tasks.length;
            });
          }
        `),
      },
    },
    {
      title: 'Parse arguments with util.parseArgs',
      bullets: [
        '`strict: true` (the default) rejects unknown options with `ERR_PARSE_ARGS_UNKNOWN_OPTION`.',
        '`allowPositionals: true` gives you the command name and its argument.',
        'Set `process.exitCode` instead of calling `process.exit()` so stdout is fully flushed.',
      ],
      code: {
        id: 'p01-s4',
        title: 'src/cli.js',
        language: 'javascript',
        code: dedent(`
          #!/usr/bin/env node
          import { parseArgs } from 'node:util';
          import { TaskStore } from './store.js';
          import * as cmd from './commands.js';
          import { UserError } from './errors.js';
          import { formatTasks } from './format.js';

          const HELP = \`Usage: task <command> [options]

          Commands:
            add "<title>" [-p low|medium|high] [--due YYYY-MM-DD]
            list [--status open|done|all]
            done <id> | undo <id> | remove <id>
            edit <id> [--title "..."] [-p ...] [--due ...]
            clear --done\`;

          async function main(argv) {
            const { values, positionals } = parseArgs({
              args: argv,
              allowPositionals: true,
              options: {
                priority: { type: 'string', short: 'p' },
                due: { type: 'string' },
                title: { type: 'string' },
                status: { type: 'string', default: 'open' },
                done: { type: 'boolean' },
                help: { type: 'boolean', short: 'h' },
              },
            });
            const [command, arg] = positionals;
            const store = new TaskStore();

            if (values.help || !command) return console.log(HELP);

            switch (command) {
              case 'add': {
                if (!arg) throw new UserError('Missing title: task add "<title>"');
                const task = await cmd.add(store, arg, values);
                return console.log(\`Added task \${task.id}: \${task.title}\`);
              }
              case 'list':
                return console.log(formatTasks(await cmd.list(store, values)));
              case 'done':
              case 'undo': {
                const task = await cmd.setDone(store, arg, command === 'done');
                return console.log(\`Task \${task.id} marked \${command === 'done' ? 'done' : 'open'}\`);
              }
              case 'edit':
                await cmd.edit(store, arg, values);
                return console.log(\`Updated task \${arg}\`);
              case 'remove':
                await cmd.remove(store, arg);
                return console.log(\`Removed task \${arg}\`);
              case 'clear': {
                if (!values.done) throw new UserError('Use: task clear --done');
                const n = await cmd.clearDone(store);
                return console.log(\`Removed \${n} completed task(s)\`);
              }
              default:
                throw new UserError(\`Unknown command "\${command}". Run task --help\`);
            }
          }

          try {
            await main(process.argv.slice(2));
          } catch (err) {
            if (err instanceof UserError || err.code?.startsWith('ERR_PARSE_ARGS')) {
              console.error(\`Error: \${err.message}\`);
              process.exitCode = 1;
            } else {
              console.error(err);
              process.exitCode = 2;
            }
          }
        `),
        versionNote: '`util.parseArgs` is stable since Node 20.0. Top-level `await` requires ES modules.',
      },
    },
    {
      title: 'Format output',
      bullets: [
        'Pad columns with `String.prototype.padEnd`; truncate long titles.',
        'Use `util.styleText` (Node 20.12+/21.7+) for colours — it is core, no `chalk` needed.',
        'Respect `NO_COLOR` and non-TTY output (`process.stdout.isTTY`) so piping to a file stays clean.',
      ],
      code: {
        id: 'p01-s5',
        title: 'src/format.js',
        language: 'javascript',
        code: dedent(`
          import { styleText } from 'node:util';

          const useColor = process.stdout.isTTY && !process.env.NO_COLOR;
          const paint = (style, s) => (useColor ? styleText(style, s) : s);
          const COLORS = { high: 'red', medium: 'yellow', low: 'gray' };

          export function formatTasks(tasks) {
            if (tasks.length === 0) return 'No tasks.';
            const rows = tasks.map((t) => [
              String(t.id).padStart(3),
              t.done ? '[x]' : '[ ]',
              paint(COLORS[t.priority], t.priority.padEnd(6)),
              (t.due ?? '').padEnd(10),
              t.title.length > 50 ? t.title.slice(0, 47) + '...' : t.title,
            ].join('  '));
            return [' ID  ST   PRIO    DUE         TITLE', ...rows].join('\\n');
          }
        `),
      },
    },
    {
      title: 'Add the UserError class',
      text: 'A tiny subclass lets `cli.js` tell expected errors (exit 1, short message) from bugs (exit 2, full stack).',
      code: {
        id: 'p01-s6',
        title: 'src/errors.js',
        language: 'javascript',
        code: dedent(`
          export class UserError extends Error {
            constructor(message) {
              super(message);
              this.name = 'UserError';
            }
          }
        `),
      },
    },
    {
      title: 'Install it globally while developing',
      bullets: [
        'On macOS/Linux make the entry executable: `chmod +x src/cli.js` (the shebang does the rest).',
        '`npm link` symlinks the `bin` into your global prefix, so `task` works anywhere.',
        'On Windows npm generates a `task.cmd` shim automatically.',
      ],
      code: {
        id: 'p01-s7',
        title: 'Try it',
        language: 'bash',
        code: dedent(`
          npm link
          task add "Write report" -p high --due 2026-12-01
          task add "Buy milk"
          task list
          task done 1
          task list --status all
          echo $?   # 0 on success
          task done 99; echo $?   # Error: Task 99 not found → 1
        `),
      },
    },
  ],
  testing: {
    bullets: [
      'Use the built-in runner (`node --test`) — no Jest needed for a core-only project.',
      'Black-box tests: spawn the real CLI with `execFile` and a temp `TASKS_FILE`, assert on stdout/stderr/exit code.',
      'Unit-test `commands.js` with a fake in-memory store for edge cases (bad dates, unknown ids).',
      'Test a corrupted JSON file: the CLI must exit 2 and leave the file untouched.',
    ],
    code: {
      id: 'p01-test',
      title: 'test/cli.test.js',
      language: 'javascript',
      code: dedent(`
        import { test, beforeEach, afterEach } from 'node:test';
        import assert from 'node:assert/strict';
        import { execFile } from 'node:child_process';
        import { promisify } from 'node:util';
        import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
        import { tmpdir } from 'node:os';
        import path from 'node:path';

        const run = promisify(execFile);
        let dir, file;

        const cli = (...args) =>
          run(process.execPath, ['src/cli.js', ...args], { env: { ...process.env, TASKS_FILE: file, NO_COLOR: '1' } });

        beforeEach(async () => {
          dir = await mkdtemp(path.join(tmpdir(), 'tasks-'));
          file = path.join(dir, 'tasks.json');
        });
        afterEach(() => rm(dir, { recursive: true, force: true }));

        test('add then list shows the task', async () => {
          const { stdout } = await cli('add', 'Buy milk', '-p', 'high');
          assert.match(stdout, /Added task 1: Buy milk/);
          const list = await cli('list');
          assert.match(list.stdout, /Buy milk/);
        });

        test('done hides the task from the default list', async () => {
          await cli('add', 'Ship it');
          await cli('done', '1');
          const { stdout } = await cli('list');
          assert.equal(stdout.trim(), 'No tasks.');
          const saved = JSON.parse(await readFile(file, 'utf8'));
          assert.equal(saved.tasks[0].done, true);
        });

        test('unknown id exits with code 1', async () => {
          await assert.rejects(cli('done', '42'), (err) => {
            assert.equal(err.code, 1);
            assert.match(err.stderr, /Task 42 not found/);
            return true;
          });
        });

        test('corrupted file exits 2 and is not overwritten', async () => {
          await writeFile(file, '{ not json');
          await assert.rejects(cli('add', 'x'), (err) => err.code === 2);
          assert.equal(await readFile(file, 'utf8'), '{ not json');
        });
      `),
      expectedOutput: '# tests 4\n# pass 4\n# fail 0',
    },
  },
  security: [
    'Never `eval` or `new Function` the data file — always `JSON.parse`.',
    'Validate every value from argv (ids are positive integers, dates match `YYYY-MM-DD`).',
    'Create the data directory under the user\'s home; do not write next to the installed package (it may be read-only or shared).',
    'Print user errors without stack traces; print stacks only for unexpected errors.',
    'Publishing: enable npm 2FA, use `"files"` in package.json so tests/secrets are never published.',
  ],
  deployment: {
    bullets: [
      'Distribute via npm: `npm publish --access public`, users run `npm i -g @you/task-manager` or `npx @you/task-manager list`.',
      'Version with semver (`npm version patch|minor|major`); bump `version` in the data file only for breaking format changes and migrate old files on load.',
      'Optional: build a single executable with Node SEA (`node --experimental-sea-config`) for users without Node.',
    ],
    code: {
      id: 'p01-deploy',
      title: 'Publish a release',
      language: 'bash',
      code: dedent(`
        npm test
        npm version minor          # 1.0.0 -> 1.1.0, creates a git tag
        npm publish --access public
        npx @you/task-manager@latest --help
      `),
    },
  },
  extensions: [
    'Tags and `task list --tag work`.',
    'Recurring tasks (`--every week`) computed on `done`.',
    'Interactive mode with `node:readline/promises`.',
    'File locking (`fs.open(lock, \'wx\')`) so two terminals cannot race on the same file.',
    'Export/import CSV with streams.',
    'Sync to a remote API built in a later project.',
  ],
};
