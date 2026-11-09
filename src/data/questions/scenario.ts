import type { InterviewQuestion } from '../../types';
import { apiScenarioQuestions } from './scenario/api';
import { designScenarioQuestions } from './scenario/design';
import { runtimeScenarioQuestions } from './scenario/runtime';

/** Scenario-based interview questions (kind: 'scenario'). */
export const scenarioQuestions: InterviewQuestion[] = [
  ...apiScenarioQuestions,
  ...runtimeScenarioQuestions,
  ...designScenarioQuestions,
];
