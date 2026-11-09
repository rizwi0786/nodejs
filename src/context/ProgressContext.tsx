import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, type ReactNode } from 'react';
import type { LearningMode, QuizAttempt, RevisionStatus, UserProgress } from '../types';
import { readJSON, writeJSON } from '../services/storage';
import { dayKey } from '../utils/date';
import { emptyProgress, normalizeProgress } from '../services/progress';

const STORAGE_KEY = 'progress';
const RECENT_LIMIT = 20;
const TICK_SECONDS = 15;
const IDLE_AFTER_MS = 2 * 60 * 1000; // stop counting study time after 2 min without interaction

type Action =
  | { type: 'toggleComplete'; lessonId: string }
  | { type: 'toggleBookmark'; lessonId: string }
  | { type: 'visitLesson'; lessonId: string }
  | { type: 'recordQuiz'; attempt: QuizAttempt }
  | { type: 'setRevision'; lessonId: string; status: RevisionStatus }
  | { type: 'setInterview'; questionId: string; status: 'known' | 'review' | null }
  | { type: 'addStudyTime'; seconds: number }
  | { type: 'setMode'; mode: LearningMode }
  | { type: 'startSprint' }
  | { type: 'resetSprint' }
  | { type: 'toggleSprintItem'; key: string }
  | { type: 'replace'; progress: UserProgress };

function toggleKey(rec: Record<string, string>, key: string): Record<string, string> {
  const next = { ...rec };
  if (next[key]) delete next[key];
  else next[key] = new Date().toISOString();
  return next;
}

function reducer(state: UserProgress, action: Action): UserProgress {
  switch (action.type) {
    case 'toggleComplete':
      return { ...state, completedLessons: toggleKey(state.completedLessons, action.lessonId) };
    case 'toggleBookmark':
      return { ...state, bookmarks: toggleKey(state.bookmarks, action.lessonId) };
    case 'visitLesson': {
      const rest = state.recentLessons.filter((r) => r.lessonId !== action.lessonId);
      return {
        ...state,
        recentLessons: [{ lessonId: action.lessonId, at: new Date().toISOString() }, ...rest].slice(0, RECENT_LIMIT),
      };
    }
    case 'recordQuiz':
      return { ...state, quizAttempts: [...state.quizAttempts, action.attempt] };
    case 'setRevision':
      return { ...state, revision: { ...state.revision, [action.lessonId]: action.status } };
    case 'setInterview': {
      const next = { ...state.interviewReviewed };
      if (action.status) next[action.questionId] = action.status;
      else delete next[action.questionId];
      return { ...state, interviewReviewed: next };
    }
    case 'addStudyTime': {
      const k = dayKey();
      return { ...state, studyLog: { ...state.studyLog, [k]: (state.studyLog[k] ?? 0) + action.seconds } };
    }
    case 'setMode':
      return { ...state, mode: action.mode };
    case 'startSprint':
      return { ...state, sprint: { startedAt: new Date().toISOString(), done: {} } };
    case 'resetSprint':
      return { ...state, sprint: { startedAt: null, done: {} } };
    case 'toggleSprintItem':
      return { ...state, sprint: { ...state.sprint, done: toggleKey(state.sprint.done, action.key) } };
    case 'replace':
      return action.progress;
  }
}

interface ProgressApi {
  progress: UserProgress;
  isCompleted: (lessonId: string) => boolean;
  isBookmarked: (lessonId: string) => boolean;
  toggleComplete: (lessonId: string) => void;
  toggleBookmark: (lessonId: string) => void;
  visitLesson: (lessonId: string) => void;
  recordQuiz: (quizId: string, correct: boolean) => void;
  setRevision: (lessonId: string, status: RevisionStatus) => void;
  setInterview: (questionId: string, status: 'known' | 'review' | null) => void;
  setMode: (mode: LearningMode) => void;
  startSprint: () => void;
  resetSprint: () => void;
  toggleSprintItem: (key: string) => void;
  importProgress: (raw: unknown) => void;
  resetProgress: () => void;
}

const ProgressContext = createContext<ProgressApi | null>(null);

export function ProgressProvider({ children }: { children: ReactNode }) {
  const [progress, dispatch] = useReducer(reducer, undefined, () => normalizeProgress(readJSON(STORAGE_KEY, null)));

  // Persist every change.
  useEffect(() => writeJSON(STORAGE_KEY, progress), [progress]);

  // Study-time tracker: counts time only while the tab is visible AND the learner
  // has interacted recently, so an idle open tab does not inflate the numbers.
  const lastActivity = useRef(Date.now());
  useEffect(() => {
    const mark = () => (lastActivity.current = Date.now());
    const events = ['pointerdown', 'keydown', 'scroll', 'mousemove', 'touchstart'] as const;
    events.forEach((e) => window.addEventListener(e, mark, { passive: true }));
    const id = window.setInterval(() => {
      const active = document.visibilityState === 'visible' && Date.now() - lastActivity.current < IDLE_AFTER_MS;
      if (active) dispatch({ type: 'addStudyTime', seconds: TICK_SECONDS });
    }, TICK_SECONDS * 1000);
    return () => {
      events.forEach((e) => window.removeEventListener(e, mark));
      window.clearInterval(id);
    };
  }, []);

  const toggleComplete = useCallback((lessonId: string) => dispatch({ type: 'toggleComplete', lessonId }), []);
  const toggleBookmark = useCallback((lessonId: string) => dispatch({ type: 'toggleBookmark', lessonId }), []);
  const visitLesson = useCallback((lessonId: string) => dispatch({ type: 'visitLesson', lessonId }), []);
  const recordQuiz = useCallback(
    (quizId: string, correct: boolean) =>
      dispatch({ type: 'recordQuiz', attempt: { quizId, correct, answeredAt: new Date().toISOString() } }),
    [],
  );
  const setRevision = useCallback(
    (lessonId: string, status: RevisionStatus) => dispatch({ type: 'setRevision', lessonId, status }),
    [],
  );
  const setInterview = useCallback(
    (questionId: string, status: 'known' | 'review' | null) => dispatch({ type: 'setInterview', questionId, status }),
    [],
  );
  const setMode = useCallback((mode: LearningMode) => dispatch({ type: 'setMode', mode }), []);
  const startSprint = useCallback(() => dispatch({ type: 'startSprint' }), []);
  const resetSprint = useCallback(() => dispatch({ type: 'resetSprint' }), []);
  const toggleSprintItem = useCallback((key: string) => dispatch({ type: 'toggleSprintItem', key }), []);
  const importProgress = useCallback(
    (raw: unknown) => dispatch({ type: 'replace', progress: normalizeProgress(raw) }),
    [],
  );
  const resetProgress = useCallback(() => dispatch({ type: 'replace', progress: emptyProgress() }), []);

  const api = useMemo<ProgressApi>(
    () => ({
      progress,
      isCompleted: (id) => Boolean(progress.completedLessons[id]),
      isBookmarked: (id) => Boolean(progress.bookmarks[id]),
      toggleComplete,
      toggleBookmark,
      visitLesson,
      recordQuiz,
      setRevision,
      setInterview,
      setMode,
      startSprint,
      resetSprint,
      toggleSprintItem,
      importProgress,
      resetProgress,
    }),
    [progress, toggleComplete, toggleBookmark, visitLesson, recordQuiz, setRevision, setInterview, setMode, startSprint, resetSprint, toggleSprintItem, importProgress, resetProgress],
  );

  return <ProgressContext.Provider value={api}>{children}</ProgressContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useProgress(): ProgressApi {
  const ctx = useContext(ProgressContext);
  if (!ctx) throw new Error('useProgress must be used inside <ProgressProvider>');
  return ctx;
}
