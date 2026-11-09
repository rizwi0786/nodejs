import type { CodingChallenge, InterviewQuestion } from '../../types';

export interface Banks {
  output: InterviewQuestion[];
  scenario: InterviewQuestion[];
  challenges: CodingChallenge[];
}

let cache: Promise<Banks> | null = null;

/** Lazily loads the stand-alone question banks (separate chunks). */
export function loadBanks(): Promise<Banks> {
  if (!cache) {
    cache = Promise.all([import('./output'), import('./scenario'), import('../challenges')]).then(([o, s, c]) => ({
      output: o.outputQuestions,
      scenario: s.scenarioQuestions,
      challenges: c.challenges,
    }));
  }
  return cache;
}
