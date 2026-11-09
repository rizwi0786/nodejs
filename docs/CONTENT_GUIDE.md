# Content Authoring Guide

Lesson content is **pure data** (no React). Types: `src/types/index.ts`
(`LessonContent`, `ModuleContent`, `ContentBlock`, `QuizSpec`, `InterviewSpec`, `DiagramId`).
Helpers: `src/data/content/helpers.ts`. Lesson keys (slugs): `docs/lesson-slugs.md`.

## Files

```
src/data/content/m05/index.ts      default export: ModuleContent  (slug → LessonContent)
src/data/content/m05/*.ts          split lessons across files as you like, e.g. one file per 3–6 lessons,
                                   each exporting a Partial map that index.ts spreads together
```

`index.ts` must `export default` an object whose keys are **exactly** the module's lesson slugs (all of them).

## Lesson shape (proportional, never superficial)

Use the 13 section kinds in this order, skipping or merging those that add nothing for a small topic:

| kind | Typical content |
|---|---|
| `introduction` | 1–3 sentences: what problem this solves, in plain words |
| `definition` | one crisp definition (often a `text` + `bullets`) |
| `why` | why it exists / when you need it |
| `internals` | how it works under the hood — step by step, `flow`/`diagram` welcome |
| `visual` | a `diagram` (registered id) or `flow` chart — only when it explains behaviour |
| `example` | 1–3 `code` blocks, each with `expectedOutput` and `explanation[]` |
| `walkthrough` | `steps(...)` explaining the code line by line (can be folded into `explanation`) |
| `real-world` | a realistic backend use (API, worker, CLI…) |
| `mistakes` | common mistakes as `bullets`, ideally with a wrong/right `code` pair |
| `interview` | `interviewTip(...)` callouts: what interviewers probe here (the Q&A themselves go in `interview: []`) |
| `practice` | a short exercise prompt (text/steps) — graded questions go in `quiz: []` |
| `summary` | 3–6 bullet takeaways |

`output` kind exists but prefer putting expected output on the code block itself.

**Style rules**
- Short sentences, bullets, tables. No paragraph longer than ~3 sentences.
- Inline code in text with backticks: `` `fs.readFile` `` (the renderer formats it). `**bold**` also works.
- Every concept gets a working code example. Every example that prints shows the exact `expectedOutput` and *why*.
- `runnable: true` only for code that runs in a **browser Web Worker** (pure JS: console.log, Promise, setTimeout,
  queueMicrotask, classes, Map/Set…). Anything using `require`, `import`, `process`, `fs`, `setImmediate`,
  `Buffer`, `__dirname`, network, etc. is **not** runnable — still show expectedOutput.
- Mark version-specific behaviour with `versionNote` (e.g. "Node 18+", "Stable since Node 20").
- Teach current APIs (`fs/promises`, `node:` prefix, `AbortController`, `stream.pipeline`, `fetch` in Node 18+,
  `node --watch`, `node --test`, `--env-file` Node 20.6+). Mention deprecated APIs only to say *don't use* (`new Buffer()`, `url.parse` legacy, `domain`).
- Say clearly when behaviour is Express / a third-party package, not Node core.
- Never claim a question is "asked at <Company>".
- Comparison tables whenever two similar concepts appear (require vs import, PUT vs PATCH…).
- Code must be syntactically valid. Use `dedent` + template literals; escape backticks and `${` inside code as `\``
  and `\${`.

## Diagrams

`diagram('event-loop-phases', 'caption')` — only the ids in the `DiagramId` union (they are built by hand).
For anything else use a data-defined flowchart:

```ts
flow(['Client: sends POST /login', 'Server: verifies password', 'Server: signs JWT', 'Client: stores token'],
     { title: 'Login flow', direction: 'horizontal' })
```

## Quiz (`quiz: QuizSpec[]`) — 2–4 per lesson

All kinds are option-based with one correct `answer` index. Kinds:
`mcq`, `predict-output` (code + options of possible outputs), `find-bug` (code + options describing the bug),
`complete-code` (code with `/* ??? */` + options to fill it), `scenario` (situation + best action).
`explanation` says why the answer is right **and** why the tempting wrong option is wrong.
Vary the index of the correct answer (don't always use 0).

## Interview questions (`interview: InterviewSpec[]`)

- `kind: 'concept'` (or `'output'` / `'scenario'` when that fits), `category`: `javascript | nodejs | express-backend | advanced`.
- `difficulty` reflects the *question*, not the lesson.
- `shortAnswer`: 1–2 sentences, what you'd say first in an interview.
- `detailedAnswer`: 3–6 bullets with the internals.
- `code` optional (`CodeExample` object — needs `id`, `language`, `code`).
- `followUp`: the natural next question. `trap`: the common wrong answer / gotcha.
- No duplicates or reworded duplicates within or across lessons.

## Revision notes (`revisionNotes`)

4–8 terse bullets: the facts you'd re-read the night before an interview.

## Exemplar

```ts
import type { ModuleContent } from '../../../types';
import { bullets, code, dedent, diagram, interviewTip, section, table, text, warn } from '../helpers';

const content: Partial<ModuleContent> = {
  'process-nexttick': {
    summary: 'Schedules a callback to run right after the current operation, before promises and before the event loop continues.',
    topics: ['process.nextTick', 'nextTick queue', 'microtasks', 'starvation'],
    sections: [
      section('introduction', undefined,
        text('Sometimes you need code to run *after* the current function finishes but *before* any I/O or timer. `process.nextTick` does exactly that.'),
      ),
      section('internals', 'How it works',
        bullets(
          'Node keeps a dedicated **nextTick queue**, separate from the promise microtask queue.',
          'After every macrotask callback, Node drains the whole nextTick queue, then the promise queue.',
          'Ticks added while draining run in the same drain — so recursive nextTick can starve I/O.',
        ),
        diagram('event-loop-phases', 'nextTick and microtasks run between every phase callback.'),
      ),
      section('example', 'Order of execution',
        code({
          title: 'nextTick beats Promise.then',
          code: dedent(`
            console.log('start');
            setTimeout(() => console.log('timeout'), 0);
            Promise.resolve().then(() => console.log('promise'));
            process.nextTick(() => console.log('nextTick'));
            console.log('end');
          `),
          expectedOutput: 'start\nend\nnextTick\npromise\ntimeout',
          explanation: [
            'Synchronous logs run first: `start`, `end`.',
            'When the main script finishes, Node drains the nextTick queue → `nextTick`.',
            'Then the promise microtask queue → `promise`.',
            'Only then does the event loop reach the timers phase → `timeout`.',
          ],
          versionNote: 'Order is the same in all supported Node versions (CommonJS entry). In an ES module entry, promises can run first because the module itself is evaluated inside a promise job.',
        }),
      ),
      section('mistakes', 'Common mistakes',
        warn('Recursive `process.nextTick` never yields to the event loop — timers and I/O starve.'),
      ),
      section('summary', 'Summary',
        table('nextTick vs Promise.then', ['', 'process.nextTick', 'Promise.then'],
          [['Queue', 'nextTick queue', 'Promise microtask queue'], ['Runs', 'First', 'After nextTick queue'], ['Standard', 'Node only', 'ECMAScript']]),
      ),
    ],
    revisionNotes: ['nextTick queue drains before the promise queue.', 'Both drain completely before the loop moves on.'],
    quiz: [
      {
        kind: 'predict-output', difficulty: 'intermediate',
        prompt: 'What does this print?',
        code: "setTimeout(() => console.log('A'));\nprocess.nextTick(() => console.log('B'));\nPromise.resolve().then(() => console.log('C'));",
        options: ['A B C', 'B C A', 'C B A', 'B A C'],
        answer: 1,
        explanation: 'nextTick queue first (B), then promise microtasks (C), then the timers phase (A).',
      },
    ],
    interview: [
      {
        category: 'nodejs', kind: 'concept', difficulty: 'intermediate', topic: 'Event loop',
        question: 'What is the difference between process.nextTick and setImmediate?',
        shortAnswer: 'nextTick runs before the event loop continues (even before promises); setImmediate runs in the check phase of the next loop iteration.',
        detailedAnswer: ['…'],
        followUp: 'Can process.nextTick starve the event loop?',
        trap: 'The names are backwards: "nextTick" runs sooner than "immediate".',
      },
    ],
  },
};
export default content;
```
