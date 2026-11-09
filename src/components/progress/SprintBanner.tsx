import { ArrowRight, Timer } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useProgress } from '../../context/ProgressContext';
import { SPRINT_MINUTES } from '../../data/sprint/plan';
import { useNow } from '../../hooks/useNow';
import { sprintClock } from '../../hooks/useSprint';
import { paths } from '../../routes/paths';
import { fmtOffset } from '../../utils/sprint';

/** Dashboard entry point to the 24-hour sprint: a call to action, or the live block. */
export function SprintBanner() {
  const { progress } = useProgress();
  const now = useNow();
  const clock = sprintClock(progress.sprint.startedAt, now);
  const active = clock && !clock.finished;

  return (
    <Link
      to={active && clock.current ? paths.sprintBlock(clock.current.id) : paths.sprint}
      className={`card flex items-center gap-3 px-4 py-3 transition-colors hover:bg-raised/40 ${active ? 'border-accent/50' : ''}`}
    >
      <Timer size={18} className="shrink-0 text-accent" aria-hidden />
      <div className="min-w-0 flex-1 text-sm">
        {active ? (
          <>
            <span className="font-medium">24-hour sprint · {fmtOffset(Math.min(clock.elapsedMin, SPRINT_MINUTES))} / 24:00</span>
            <span className="text-muted"> — now: {clock.current?.title ?? 'between blocks'}</span>
          </>
        ) : (
          <>
            <span className="font-medium">Interview in 24 hours?</span>
            <span className="text-muted"> Follow the hour-by-hour sprint: must-know concepts, top questions, coding round, mock interview.</span>
          </>
        )}
      </div>
      <ArrowRight size={16} className="shrink-0 text-muted" aria-hidden />
    </Link>
  );
}
