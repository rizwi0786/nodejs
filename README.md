# Node.js Mastery

An interactive Node.js learning and interview-preparation platform — React + TypeScript + Vite, no backend.

- **15 modules, 290 lessons**, from JavaScript foundations to production architecture, each with concept card,
  internals, diagrams, code with expected output, common mistakes, practice questions and interview questions.
- **Two modes**: *Detailed Learning* (full lesson) and *Interview & Revision* (key points, comparisons, tricky outputs, questions).
- **Interview bank**: lesson concept questions + output-based + scenario-based questions, with hidden answers,
  follow-ups, interviewer traps, self-rating and a timed mock-interview mode.
- **Practice**: MCQ / predict-the-output / find-the-bug / complete-the-code / scenario quizzes, and coding challenges
  graded by running tests in a sandboxed Web Worker.
- **12 real-world projects** with requirements, architecture, data design, endpoints, implementation steps, tests,
  security and deployment.
- **Runnable examples**: pure-JS examples run in the browser with Node-style `console.log` formatting.
- **24-Hour Interview Sprint** (`/sprint`): an hour-by-hour plan for the day before an interview — diagnostic,
  six study blocks (cheat sheet of must-know lessons + their interview, output and scenario questions + quick quiz),
  a coding round, system design, sleep, an auto-built weak-spot review, a timed mock interview and a printable
  final cheat sheet. Live clock, "now" block and on-track indicator; progress comes from real activity.
  The plan is data in `src/data/sprint/plan.ts`; items are selected from course content at runtime (`useSprint`).
- **Revision Center, dashboard and analytics** are computed from your own activity (localStorage).

## Run

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # type-check + production build into dist/
npm run preview    # serve the production build
npm run validate   # check course content (see below)
```

## Deploy (GitHub Pages)

`.github/workflows/deploy.yml` builds and deploys on every push to `main`.
In the repo: **Settings → Pages → Source: GitHub Actions**. Routing uses `HashRouter`
and `base: './'`, so it works under any repo name without server rewrites.

## Structure

```
src/
  components/
    code/          CodeBlock (highlighting, line numbers, copy, run/edit), CodeEditor, Prism setup
    diagrams/      20 hand-built diagrams + the interactive event-loop simulator (registry: index.ts)
    lessons/       LessonBody (Learn / Revision views), BlockRenderer, FlowChart, outline, nav
    quizzes/       QuizCard, ChallengeRunner
    interview/     InterviewCard (hidden answer, follow-up, trap, known/review)
    layout/ navigation/ progress/ common/
  context/         ThemeContext, ProgressContext (localStorage-backed)
  data/            course content — pure data, no React
    modules/       curriculum.ts — outline: 15 modules / 290 lessons, ids & prerequisites
    content/       mNN/ — lesson bodies per module (lazy-loaded chunks) + helpers.ts authoring helpers
    questions/     output.ts, scenario.ts interview banks; banks.ts lazy loader
    challenges/    coding challenges with tests
    projects/      12 project walkthroughs
  hooks/           useContent (lazy content), useInterviewBank, useStats, …
  pages/           one folder per route
  services/        sandbox/ (Web Worker runner + util.inspect port), search, storage, progress
  types/           Module, Lesson, LessonContent, CodeExample, QuizQuestion, InterviewQuestion, CodingChallenge, Project, UserProgress
  utils/           stats, practice (weak topics, wrong answers), labels, dates, icons
docs/
  CONTENT_GUIDE.md authoring rules + exemplar lesson
  lesson-slugs.md  every lesson key per module
scripts/
  validate-content.ts
```

## Adding or editing content

Lessons are data in `src/data/content/mNN/*.ts`, keyed by lesson slug (`docs/lesson-slugs.md`).
Follow `docs/CONTENT_GUIDE.md`, then run `npm run validate`. The validator checks that:

- every lesson in the outline has content and no unknown slugs exist;
- quiz answers point at a real option and options are unique;
- interview questions have answers and are not duplicated anywhere in the course;
- every `runnable: true` example **actually prints its `expectedOutput`** when executed;
- every coding-challenge solution passes its tests;
- the sprint plan covers exactly 24 h and references real lessons and challenges.

`npm run validate m05 m06` checks only those modules; `npm run validate banks` checks the question banks and challenges.

## Code sandbox

Runnable examples and challenges execute in a fresh dedicated Web Worker (no DOM, no storage, terminated after 4 s).
Output is formatted with a port of Node's `util.inspect`, so arrays, objects, Maps etc. print as Node prints them.
Node-only APIs (`require`, `process`, `setImmediate`, `fs` …) are not available in the browser; those examples show
their expected output instead of a Run button.

## Progress data

Saved in `localStorage` under `nm:progress` (completions, bookmarks, quiz & challenge attempts, lesson confidence,
interview self-ratings, study time per day, recent lessons, learning mode). Challenge drafts are saved under `nm:draft:*`.
Use the profile menu to export, import or reset.

## Keyboard shortcuts

| Key | Action |
|---|---|
| `Ctrl K` / `/` | Search the course (lessons, code examples, questions, challenges, projects) |
| `?` | Shortcut help |
| `←` / `→` | Previous / next lesson |
| `M` | Mark lesson complete / incomplete |
| `N` | Mark complete and go to next |
| `B` | Bookmark |
| `O` | Course outline |
| `Ctrl/⌘ Enter` | Run code in an editor |

Shortcuts are ignored while typing and inside code editors / the event-loop simulator (`data-no-shortcuts`).
