import { useMemo } from 'react';
import { useProgress } from '../context/ProgressContext';
import { allLessons, lessonById, modules } from '../data/modules/curriculum';
import { computeStats, continueLesson, recommendedLesson } from '../utils/stats';

/** Everything the dashboard/analytics need, derived from real progress. */
export function useStats() {
  const { progress } = useProgress();
  return useMemo(
    () => ({
      stats: computeStats(modules, progress),
      recommended: recommendedLesson(allLessons, progress),
      continueWith: continueLesson(lessonById, progress),
    }),
    [progress],
  );
}
