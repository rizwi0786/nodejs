// ─────────────────────────────────────────────────────────────
// 24-Hour Interview Sprint — the plan. Pure data: which lessons,
// questions and challenges each time block draws from. Concrete items
// are selected at runtime from the course content (see useSprint).
// ─────────────────────────────────────────────────────────────
import type { Importance, InterviewCategory } from '../../types';

export type SprintBlockKind = 'diagnostic' | 'study' | 'coding' | 'design' | 'break' | 'sleep' | 'weak' | 'mock' | 'final';

export interface SprintBlockDef {
  id: string;
  title: string;
  kind: SprintBlockKind;
  /** Minutes from sprint start. */
  start: number;
  duration: number;
  goal: string;
  /** "By the end of this block you can explain…" */
  outcomes?: string[];
  /** Lessons whose revision notes form the block's cheat sheet. */
  lessons?: { modules: string[]; importance: Importance[]; max: number; include?: string[] };
  /** Concept/lesson interview questions taken from the block's lessons. */
  interview?: number;
  /** Practice quiz questions taken from the block's lessons. */
  quiz?: number;
  /** Output-based bank questions related to the block's modules (or categories). */
  output?: { max: number; categories?: InterviewCategory[] };
  /** Scenario bank questions related to the block's modules (or categories). */
  scenario?: { max: number; categories?: InterviewCategory[] };
  challenges?: string[];
  tips: string[];
}

const C: Importance[] = ['critical'];
const CH: Importance[] = ['critical', 'high'];

export const SPRINT_MINUTES = 24 * 60;

export const sprintPlan: SprintBlockDef[] = [
  {
    id: 'diagnostic',
    title: 'Diagnostic: find your gaps',
    kind: 'diagnostic',
    start: 0,
    duration: 45,
    goal: 'Answer 20 quick questions across every critical area. Your mistakes decide where the extra time goes.',
    tips: [
      'Don’t look anything up — the point is an honest baseline.',
      'Wrong answers automatically land in the Weak-spot block (hour 21).',
      'Skim the explanation after each answer; that alone fixes many gaps.',
    ],
  },
  {
    id: 'js',
    title: 'JavaScript core',
    kind: 'study',
    start: 45,
    duration: 105,
    goal: 'The JavaScript every Node interview opens with: scope, closures, hoisting, `this`, coercion and async.',
    outcomes: [
      'Explain closures with a real use (private state, memoize) and the loop + var trap',
      'Predict hoisting/TDZ output and `this` in methods, callbacks and arrow functions',
      'Explain == vs ===, and promise states, chaining and async/await error handling',
      'Describe the call stack, task queue and microtask queue',
    ],
    lessons: { modules: ['m01'], importance: CH, max: 11 },
    interview: 22,
    quiz: 8,
    output: { max: 14, categories: ['javascript'] },
    tips: [
      'Output questions: trace line by line out loud — interviewers grade the reasoning, not just the answer.',
      'For “what is a closure?” give the one-line definition, then a 3-line example, then a use case.',
    ],
  },
  {
    id: 'node',
    title: 'Node internals & the event loop',
    kind: 'study',
    start: 150,
    duration: 120,
    goal: 'The most-asked Node topic. Be able to draw the event loop and predict any ordering question.',
    outcomes: [
      'Explain Node’s architecture: V8 + libuv + bindings, single JS thread, non-blocking I/O',
      'Name the event loop phases and where nextTick and promise microtasks run',
      'Predict setTimeout vs setImmediate vs nextTick vs Promise ordering, incl. inside I/O callbacks',
      'Say what uses the libuv thread pool (fs, dns.lookup, crypto, zlib) and what doesn’t (sockets)',
    ],
    lessons: { modules: ['m02', 'm05'], importance: C, max: 16, include: ['m05-promise-all', 'm05-async-await'] },
    interview: 26,
    quiz: 8,
    output: { max: 12, categories: ['nodejs'] },
    tips: [
      'Draw the loop: timers → pending → poll → check → close, with “nextTick, then promises” after every callback.',
      'Trap: “Node is single-threaded” — JS runs on one thread, but libuv uses a thread pool and the OS.',
      'Use the event-loop simulator in the Event loop lesson if ordering still feels shaky.',
    ],
  },
  {
    id: 'break-1',
    title: 'Break',
    kind: 'break',
    start: 270,
    duration: 30,
    goal: 'Step away from the screen. Water, food, a short walk.',
    tips: ['Recall the event loop phases from memory while walking — retrieval beats re-reading.'],
  },
  {
    id: 'core',
    title: 'Modules, streams, buffers & events',
    kind: 'study',
    start: 300,
    duration: 75,
    goal: 'How Node code is organised and how it moves data efficiently.',
    outcomes: [
      'Compare CommonJS vs ES modules, module.exports vs exports, and module caching',
      'Explain the four stream types, pipeline(), backpressure and highWaterMark',
      'Explain Buffer vs string, and EventEmitter (sync listeners, the error event, leaks)',
      'Choose between child_process and worker_threads',
    ],
    lessons: {
      modules: ['m03', 'm06'],
      importance: C,
      max: 14,
      include: ['m03-es-modules', 'm03-commonjs-modules', 'm03-stream-module', 'm03-worker-threads-module', 'm03-child-process-module', 'm06-streams-introduction', 'm06-transform-streams', 'm06-error-events', 'm06-buffer-fundamentals', 'm06-streaming-large-files'],
    },
    interview: 18,
    quiz: 6,
    tips: [
      'Classic: “How do you process a 5 GB file?” → streams + pipeline, never readFile.',
      'Know why `.pipe()` alone is risky (no error propagation / cleanup) and that pipeline() fixes it.',
    ],
  },
  {
    id: 'api',
    title: 'HTTP, REST & Express',
    kind: 'study',
    start: 375,
    duration: 105,
    goal: 'Building and reasoning about APIs: the bread and butter of a backend interview.',
    outcomes: [
      'Explain the request lifecycle, methods (safe/idempotent), status codes and PUT vs PATCH',
      'Design REST resources with pagination, filtering, versioning and rate limiting',
      'Explain CORS (simple vs preflight) and why it is a browser rule',
      'Explain Express middleware order, next(err), error middleware and async errors (Express 5)',
    ],
    lessons: {
      modules: ['m07', 'm08'],
      importance: C,
      max: 14,
      include: ['m07-http-methods', 'm07-http-status-codes', 'm07-pagination', 'm07-rate-limiting', 'm07-request-and-response-lifecycle', 'm08-routing', 'm08-application-middleware', 'm08-request-validation', 'm08-controllers', 'm08-services'],
    },
    interview: 22,
    quiz: 6,
    scenario: { max: 6, categories: ['express-backend'] },
    tips: [
      'Middleware answers: say order matters, show the 4-argument error handler, mention it is registered last.',
      'For API design questions, structure: resources → endpoints → status codes → pagination → auth → errors.',
    ],
  },
  {
    id: 'data',
    title: 'Databases & authentication',
    kind: 'study',
    start: 480,
    duration: 90,
    goal: 'Persisting data safely and knowing who the user is and what they may do.',
    outcomes: [
      'Explain connection pooling, transactions/isolation and when to add an index',
      'Explain SQL injection and why parameterized queries prevent it; SQL vs NoSQL',
      'Explain hashing (bcrypt/argon2, salt, cost) vs encryption',
      'Explain JWT structure, access vs refresh tokens, rotation, cookies vs headers, RBAC',
    ],
    lessons: {
      modules: ['m09', 'm10'],
      importance: C,
      max: 13,
      include: ['m09-indexes', 'm09-transactions', 'm09-orm-vs-odm', 'm10-cookies', 'm10-sessions', 'm10-role-based-access-control'],
    },
    interview: 20,
    quiz: 6,
    scenario: { max: 5, categories: ['express-backend'] },
    tips: [
      'Trap: “JWTs are encrypted” — they are signed (base64url), anyone can read the payload.',
      'Transactions in node-postgres need ONE client from pool.connect(), not pool.query().',
    ],
  },
  {
    id: 'break-2',
    title: 'Dinner break',
    kind: 'break',
    start: 570,
    duration: 30,
    goal: 'Eat properly. No screens.',
    tips: ['Explain JWT refresh rotation to an imaginary interviewer while you eat.'],
  },
  {
    id: 'advanced',
    title: 'Performance, scaling & security',
    kind: 'study',
    start: 600,
    duration: 90,
    goal: 'Senior-level questions: CPU vs I/O work, scaling across cores, memory, caching and the OWASP basics.',
    outcomes: [
      'Choose worker threads vs cluster vs child processes for a given workload',
      'Find and fix a memory leak; explain V8 garbage collection at a high level',
      'Explain caching strategies (cache-aside, TTL, invalidation, stampede)',
      'Implement graceful shutdown',
      'Explain XSS, CSRF, injection, SSRF and broken access control with fixes',
    ],
    lessons: { modules: ['m11', 'm12'], importance: C, max: 12, include: ['m11-redis', 'm11-message-queues'] },
    interview: 22,
    quiz: 6,
    scenario: { max: 6, categories: ['nodejs', 'advanced'] },
    tips: [
      'Rule of thumb: I/O-bound → async + scale out; CPU-bound → worker threads / separate service.',
      'Security answers: name the attack, show the vulnerable line, show the fix, add defence-in-depth.',
    ],
  },
  {
    id: 'coding',
    title: 'Coding round',
    kind: 'coding',
    start: 690,
    duration: 90,
    goal: 'The functions interviewers most often ask Node developers to write live. About 10 minutes each.',
    outcomes: ['Implement Promise.all, debounce, an EventEmitter, a concurrency limiter and an LRU cache from scratch'],
    challenges: ['ch-024', 'ch-014', 'ch-031', 'ch-034', 'ch-053', 'ch-033', 'ch-050', 'ch-013'],
    tips: [
      'Talk first: restate the problem, list edge cases, then code.',
      'Write the happy path, run the tests, then handle the edge cases.',
      'Stuck for 3 minutes? Use a hint — in an interview you would ask a clarifying question.',
    ],
  },
  {
    id: 'design',
    title: 'System design & production',
    kind: 'design',
    start: 780,
    duration: 60,
    goal: 'Design and operations questions: how your service runs, scales and survives failure.',
    outcomes: [
      'Explain horizontal vs vertical scaling, load balancing and stateless services',
      'Describe a Docker + CI/CD + zero-downtime deployment',
      'Compare monolith vs microservices; explain idempotency, retries and circuit breakers',
    ],
    lessons: { modules: ['m14', 'm15'], importance: C, max: 6, include: ['m14-dockerizing-node-js-applications', 'm14-health-checks', 'm15-solid-principles', 'm15-dependency-injection'] },
    interview: 10,
    scenario: { max: 10, categories: ['advanced'] },
    tips: ['Design answers: clarify requirements → high-level boxes → data → bottlenecks → trade-offs.'],
  },
  {
    id: 'sleep',
    title: 'Sleep',
    kind: 'sleep',
    start: 840,
    duration: 420,
    goal: 'Seven hours. Sleep is when today’s studying is consolidated into memory — skipping it costs more than it gains.',
    tips: ['Set two alarms.', 'No new material after this point — only review tomorrow.'],
  },
  {
    id: 'weak',
    title: 'Weak-spot review',
    kind: 'weak',
    start: 1260,
    duration: 75,
    goal: 'Built from your own sprint: wrong answers, questions you flagged “Review later” and your weakest lessons.',
    tips: ['Retry each wrong question before reading the explanation.', 'If a topic is still unclear, open its lesson in Interview mode.'],
  },
  {
    id: 'mock',
    title: 'Mock interview',
    kind: 'mock',
    start: 1335,
    duration: 60,
    goal: 'Fifteen mixed questions, timed. Answer out loud before revealing.',
    tips: ['Aim for ~2 minutes per answer: definition → how it works → example → trade-off.', 'Rate yourself honestly — it updates your readiness score.'],
  },
  {
    id: 'final',
    title: 'Final cheat sheet',
    kind: 'final',
    start: 1395,
    duration: 45,
    goal: 'One last skim of every must-know concept, then interview-day tactics. Printable.',
    tips: [],
  },
];

/** Interview-day tactics shown in the final block. */
export const interviewTactics = [
  'Answer shape: one-line definition → how it works internally → short example → trade-off or gotcha.',
  'Think out loud. For output questions, narrate the call stack and queues step by step.',
  'Clarify before coding: inputs, outputs, edge cases, constraints. Then write the simplest correct version first.',
  'Don’t know? Say what you do know, how you would find out, and reason from first principles.',
  'Tie answers to real work: “In an API I built, we hit this with…” — even a small project counts.',
  'Prepare 2 stories: a hard bug you fixed and a performance improvement you made (situation → action → result).',
  'Have 2 questions for them: how they deploy and monitor, and what a typical week looks like for the team.',
];
