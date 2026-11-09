import { Bookmark, CheckCircle2, Circle, Clock } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useProgress } from '../../context/ProgressContext';
import { paths } from '../../routes/paths';
import type { Lesson } from '../../types';
import { DifficultyBadge, ImportanceBadge } from '../common/Badges';

export function LessonRow({ lesson, index }: { lesson: Lesson; index?: number }) {
  const { isCompleted, isBookmarked, toggleBookmark, toggleComplete } = useProgress();
  const done = isCompleted(lesson.id);
  const marked = isBookmarked(lesson.id);
  return (
    <li className="group flex items-center gap-3 px-4 py-3 hover:bg-raised/50">
      <button
        onClick={() => toggleComplete(lesson.id)}
        aria-label={done ? `Mark "${lesson.title}" incomplete` : `Mark "${lesson.title}" complete`}
        className="shrink-0 text-faint hover:text-accent"
      >
        {done ? <CheckCircle2 size={18} className="text-accent" /> : <Circle size={18} />}
      </button>
      <Link to={paths.lesson(lesson)} className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          {index !== undefined && <span className="w-6 shrink-0 text-xs text-faint tabular-nums">{index + 1}.</span>}
          <span className={`truncate text-sm ${done ? 'text-muted' : ''}`}>{lesson.title}</span>
        </div>
      </Link>
      <div className="hidden shrink-0 items-center gap-2 sm:flex">
        <ImportanceBadge level={lesson.importance} />
        <DifficultyBadge level={lesson.difficulty} />
        <span className="flex w-14 items-center justify-end gap-1 text-xs text-faint tabular-nums">
          <Clock size={12} aria-hidden /> {lesson.estMinutes}m
        </span>
      </div>
      <button
        onClick={() => toggleBookmark(lesson.id)}
        aria-label={marked ? 'Remove bookmark' : 'Bookmark lesson'}
        className={`shrink-0 ${marked ? 'text-accent' : 'text-faint opacity-60 hover:opacity-100 group-hover:opacity-100'}`}
      >
        <Bookmark size={16} fill={marked ? 'currentColor' : 'none'} />
      </button>
    </li>
  );
}
