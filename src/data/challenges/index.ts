import type { CodingChallenge } from '../../types';
import { advancedChallenges } from './advanced';
import { backendChallenges } from './backend';
import { javascriptChallenges } from './javascript';
import { nodejsChallenges } from './nodejs';

/** "Write a function" coding challenges, graded in the browser sandbox. */
export const challenges: CodingChallenge[] = [
  ...javascriptChallenges,
  ...nodejsChallenges,
  ...backendChallenges,
  ...advancedChallenges,
];
