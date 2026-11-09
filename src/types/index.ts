// ─────────────────────────────────────────────────────────────
// Core domain types. Course content (src/data) depends only on
// these types — never on React components — so lessons can be
// added or edited without touching the UI.
// ─────────────────────────────────────────────────────────────

export type Difficulty = 'beginner' | 'intermediate' | 'advanced';
export type Importance = 'low' | 'medium' | 'high' | 'critical';
export type LearningMode = 'learn' | 'interview';

/** Authoring status of a lesson — lets the UI show outlined vs written lessons. */
export type ContentStatus = 'outline' | 'draft' | 'ready';

export interface CodeExample {
  id: string;
  title?: string;
  language: 'javascript' | 'typescript' | 'bash' | 'json' | 'sql' | 'http' | 'yaml' | 'dockerfile' | 'text';
  code: string;
  /** Exact console output the learner should expect. */
  expectedOutput?: string;
  /** Why the output occurs / line-by-line notes. */
  explanation?: string[];
  /** Node.js version notes, e.g. "Requires Node 18+". */
  versionNote?: string;
  /** Can this example run in the in-browser playground? */
  runnable?: boolean;
}

export interface ComparisonTable {
  title: string;
  columns: string[];
  rows: string[][];
}

/**
 * Hand-built diagram components (src/components/diagrams). Content refers to
 * them by id; the union makes a typo a compile error.
 */
export type DiagramId =
  | 'node-architecture' // JS → V8 + Node bindings → libuv → OS; thread pool
  | 'event-loop-phases' // timers → pending → poll → check → close, microtasks between
  | 'event-loop-simulator' // interactive: step through call stack / microtasks / macrotasks
  | 'blocking-vs-nonblocking' // timeline: sync waits vs async overlapping I/O
  | 'thread-pool' // main thread offloads fs/crypto/dns.lookup/zlib to libuv workers
  | 'module-resolution' // require() algorithm: core → relative path → node_modules walk → cache
  | 'request-response' // client → DNS/TCP/TLS → server → handler → response
  | 'middleware-pipeline' // Express: req → mw → mw → route → error handler → res
  | 'layered-architecture' // route → controller → service → repository → DB
  | 'stream-pipeline' // readable → transform → writable, buffers + backpressure
  | 'connection-pool' // requests share a fixed set of DB connections
  | 'jwt-flow' // login → access + refresh token → API calls → refresh
  | 'oauth-flow' // authorization code + PKCE
  | 'cluster' // primary process forks workers sharing one port
  | 'heap-stack' // stack frames vs heap objects, new/old space GC
  | 'cache-aside' // check cache → miss → DB → populate
  | 'queue-worker' // producer → Redis queue → workers, retries, DLQ
  | 'reverse-proxy' // client → Nginx (TLS, LB) → Node instances
  | 'ci-cd-pipeline' // push → lint/test → build image → deploy
  | 'microservices'; // gateway → services → message broker → databases

/** A step in a data-defined flowchart. */
export interface FlowStep {
  label: string;
  detail?: string;
}

/** A block inside a lesson section. Lessons are composed of these. */
export type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'bullets'; items: string[] }
  | { type: 'steps'; items: string[] } // numbered list (walkthroughs)
  | { type: 'code'; example: CodeExample }
  | { type: 'table'; table: ComparisonTable }
  | { type: 'diagram'; diagramId: DiagramId; caption?: string }
  /** A simple flowchart defined in data: boxes joined by arrows. */
  | { type: 'flow'; title?: string; direction?: 'horizontal' | 'vertical'; steps: FlowStep[]; caption?: string }
  | { type: 'callout'; variant: 'tip' | 'warning' | 'interview' | 'note'; text: string };

/** The 13 lesson section kinds from the curriculum spec. */
export type SectionKind =
  | 'introduction'
  | 'definition'
  | 'why'
  | 'internals'
  | 'visual'
  | 'example'
  | 'output'
  | 'walkthrough'
  | 'real-world'
  | 'mistakes'
  | 'interview'
  | 'practice'
  | 'summary';

export interface LessonSection {
  kind: SectionKind;
  title?: string;
  blocks: ContentBlock[];
}

/** A searchable concept/keyword inside a lesson. */
export interface Topic {
  id: string;
  title: string;
  keywords?: string[];
}

export interface Lesson {
  id: string; // globally unique, e.g. "m05-event-loop-phases"
  moduleId: string;
  slug: string;
  title: string;
  summary?: string; // one-line definition for the concept card
  difficulty: Difficulty;
  importance: Importance; // importance in interviews
  estMinutes: number;
  prerequisites: string[]; // lesson ids
  topics: Topic[];
  status: ContentStatus;
  sections: LessonSection[];
  /** Quick-revision notes shown in Interview & Revision mode. */
  revisionNotes?: string[];
  quizIds?: string[];
  interviewQuestionIds?: string[];
}

export interface CourseModule {
  id: string; // e.g. "m05"
  number: number;
  slug: string;
  title: string;
  description: string;
  difficulty: Difficulty;
  priority?: 'high';
  icon: string; // lucide icon name, resolved in the UI layer
  lessons: Lesson[];
}

export type QuizKind = 'mcq' | 'predict-output' | 'find-bug' | 'complete-code' | 'scenario';

/** Option-based practice question (every kind has options and one correct index). */
export interface QuizQuestion {
  id: string;
  lessonId?: string;
  moduleId: string;
  kind: QuizKind;
  difficulty: Difficulty;
  prompt: string;
  code?: string;
  options: string[];
  /** Index into options. */
  answer: number;
  explanation: string;
}

/** A "write a function" challenge, graded by running tests in the browser sandbox. */
export interface ChallengeTest {
  /** Expression evaluated after the learner's code, e.g. "chunk([1,2,3], 2)". May return a Promise. */
  call: string;
  /** JSON.stringify of the expected (awaited) value, e.g. "[[1,2],[3]]". */
  expected: string;
}

export interface CodingChallenge {
  id: string;
  title: string;
  difficulty: Difficulty;
  topic: string;
  category: InterviewCategory;
  prompt: string;
  starterCode: string;
  solution: string;
  tests: ChallengeTest[];
  hints?: string[];
  explanation: string;
  relatedLessonIds?: string[];
}

export type InterviewCategory = 'javascript' | 'nodejs' | 'express-backend' | 'advanced';
export type InterviewKind = 'concept' | 'output' | 'scenario';

export interface InterviewQuestion {
  id: string;
  category: InterviewCategory;
  kind: InterviewKind;
  difficulty: Difficulty;
  topic: string;
  question: string;
  shortAnswer: string;
  detailedAnswer: string[];
  code?: CodeExample;
  followUp?: string;
  trap?: string; // common interviewer trap
  relatedLessonIds?: string[];
}

// ── Authored lesson content (src/data/content) ───────────────

/** Quiz question as written inside a lesson; ids are generated by the loader. */
export type QuizSpec = Omit<QuizQuestion, 'id' | 'moduleId' | 'lessonId'>;
/** Interview question as written inside a lesson; id and relatedLessonIds are generated. */
export type InterviewSpec = Omit<InterviewQuestion, 'id' | 'relatedLessonIds'>;

export interface LessonContent {
  /** One-line definition for the concept card. */
  summary: string;
  /** Search keywords / concepts covered. */
  topics: string[];
  sections: LessonSection[];
  /** Quick-revision bullet notes (Interview & Revision mode). */
  revisionNotes: string[];
  quiz: QuizSpec[];
  interview: InterviewSpec[];
}

/** Lesson slug → content, one map per module. */
export type ModuleContent = Record<string, LessonContent>;

export interface ProjectEndpoint {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'WS' | 'CLI';
  path: string;
  description: string;
  auth?: string; // e.g. "admin", "user", "public"
}

export interface ProjectStep {
  title: string;
  text?: string;
  bullets?: string[];
  code?: CodeExample;
}

export interface Project {
  id: string;
  number: number;
  title: string;
  level: Difficulty;
  summary: string;
  skills: string[];
  status: ContentStatus;
  estHours?: number;
  /** Lesson ids the learner should finish first. */
  prerequisites?: string[];
  requirements?: { functional: string[]; nonFunctional: string[] };
  architecture?: { diagramId?: DiagramId; flow?: FlowStep[]; notes?: string[] };
  folderStructure?: string;
  databaseDesign?: ComparisonTable[];
  endpoints?: ProjectEndpoint[];
  steps?: ProjectStep[];
  testing?: { bullets: string[]; code?: CodeExample };
  security?: string[];
  deployment?: { bullets: string[]; code?: CodeExample };
  extensions?: string[]; // stretch goals
}

// ── User progress (persisted in localStorage) ────────────────

export interface QuizAttempt {
  quizId: string;
  correct: boolean;
  answeredAt: string; // ISO
}

export type RevisionStatus = 'new' | 'review' | 'confident';

export interface UserProgress {
  version: 1;
  completedLessons: Record<string, string>; // lessonId -> ISO completed at
  bookmarks: Record<string, string>; // lessonId -> ISO bookmarked at
  quizAttempts: QuizAttempt[];
  revision: Record<string, RevisionStatus>; // lessonId -> status
  interviewReviewed: Record<string, 'known' | 'review'>; // questionId -> status
  studyLog: Record<string, number>; // 'YYYY-MM-DD' -> seconds studied
  recentLessons: { lessonId: string; at: string }[]; // most recent first
  mode: LearningMode;
  /** 24-hour interview sprint. */
  sprint: SprintState;
}

export interface SprintState {
  startedAt: string | null; // ISO; null = not started
  /** Manually ticked items, e.g. "js:m01-hoisting" (notes reviewed) → ISO. */
  done: Record<string, string>;
}
