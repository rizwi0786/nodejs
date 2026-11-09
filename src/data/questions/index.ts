// Question banks live in separate lazily-loaded chunks:
//   lesson quizzes & concept questions → src/data/content/mNN (loadAllContent)
//   output / scenario questions        → ./output.ts, ./scenario.ts
//   coding challenges                   → ../challenges
export { loadBanks, type Banks } from './banks';

/** Target sizes for the interview bank (Module 17 spec). */
export const interviewTargets = [
  { key: 'beginner', label: 'Beginner questions', target: 100 },
  { key: 'intermediate', label: 'Intermediate questions', target: 150 },
  { key: 'advanced', label: 'Advanced questions', target: 150 },
  { key: 'output', label: 'Output-based questions', target: 50 },
  { key: 'scenario', label: 'Scenario-based questions', target: 50 },
  { key: 'coding', label: 'Coding challenges', target: 50 },
] as const;
