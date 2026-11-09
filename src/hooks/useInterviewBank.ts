import { useMemo } from 'react';
import type { CodingChallenge, InterviewQuestion, QuizQuestion } from '../types';
import { useAllContent, useBanks } from './useContent';

export interface InterviewBank {
  /** Lesson concept questions + output bank + scenario bank. */
  questions: InterviewQuestion[];
  quizzes: QuizQuestion[];
  challenges: CodingChallenge[];
  byId: Map<string, InterviewQuestion>;
}

/** Everything in Module 17, assembled from the lazily-loaded chunks. null while loading. */
export function useInterviewBank(): InterviewBank | null {
  const all = useAllContent();
  const banks = useBanks();
  return useMemo(() => {
    if (!all || !banks) return null;
    const questions = [...all.interviewQuestions, ...banks.output, ...banks.scenario];
    return { questions, quizzes: all.quizQuestions, challenges: banks.challenges, byId: new Map(questions.map((q) => [q.id, q])) };
  }, [all, banks]);
}
