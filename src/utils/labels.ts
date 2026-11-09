import type { InterviewQuestion, QuizKind, SectionKind } from '../types';

// Display labels shared by several components (kept out of component files for fast refresh).

export const categoryLabel: Record<InterviewQuestion['category'], string> = {
  javascript: 'JavaScript',
  nodejs: 'Node.js',
  'express-backend': 'Express & Backend',
  advanced: 'Advanced',
};

export const kindLabel: Record<InterviewQuestion['kind'], string> = {
  concept: 'Concept',
  output: 'Output',
  scenario: 'Scenario',
};

export const quizKindLabel: Record<QuizKind, string> = {
  mcq: 'Multiple choice',
  'predict-output': 'Predict the output',
  'find-bug': 'Find the bug',
  'complete-code': 'Complete the code',
  scenario: 'Scenario',
};

export const sectionTitle: Record<SectionKind, string> = {
  introduction: 'Introduction',
  definition: 'Definition',
  why: 'Why it matters',
  internals: 'How it works internally',
  visual: 'Visual explanation',
  example: 'Code example',
  output: 'Expected output',
  walkthrough: 'Step-by-step',
  'real-world': 'Real-world use',
  mistakes: 'Common mistakes',
  interview: 'Interview focus',
  practice: 'Practice exercise',
  summary: 'Summary',
};
