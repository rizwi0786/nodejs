import type { InterviewQuestion } from '../../types';
import { asyncOutputQuestions } from './output/async';
import { jsCoreOutputQuestions } from './output/js-core';
import { nodeOutputQuestions } from './output/node';

/** Output-based interview questions (kind: 'output'). */
export const outputQuestions: InterviewQuestion[] = [
  ...jsCoreOutputQuestions,
  ...asyncOutputQuestions,
  ...nodeOutputQuestions,
];
