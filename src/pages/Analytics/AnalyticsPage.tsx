import { CalendarDays, Clock, Flame, Trophy } from 'lucide-react';
import { useMemo } from 'react';
import { PageHeader } from '../../components/common/PageHeader';
import { StatTile } from '../../components/common/StatTile';
import { ProgressBar } from '../../components/progress/ProgressBar';
import { StudyChart } from '../../components/progress/StudyChart';
import { useProgress } from '../../context/ProgressContext';
import { useStats } from '../../hooks/useStats';
import { paths } from '../../routes/paths';
import { formatDuration } from '../../utils/date';
import { studySeries } from '../../utils/stats';
import { lessonAccuracy } from '../../utils/practice';

export default function AnalyticsPage() {
  const { progress } = useProgress();
  const { stats } = useStats();
  const series = useMemo(() => studySeries(progress, 30), [progress]);
  const activeIn30 = series.filter((d) => stats.activeDays.has(d.key)).length;
  // Quiz accuracy (latest answer per question) and confidence, per module.
  const perModule = useMemo(() => {
    const m = new Map<string, { answered: number; correct: number }>();
    for (const a of lessonAccuracy(progress)) {
      const mid = a.lessonId.slice(0, 3);
      const e = m.get(mid) ?? { answered: 0, correct: 0 };
      e.answered += a.answered;
      e.correct += a.correct;
      m.set(mid, e);
    }
    return m;
  }, [progress]);
  const confident = (ids: string[]) => ids.filter((id) => progress.revision[id] === 'confident').length;

  return (
    <>
      <PageHeader
        title="Progress & Analytics"
        description="Calculated entirely from your activity in this browser."
        crumbs={[{ label: 'Dashboard', to: paths.dashboard }, { label: 'Progress & Analytics' }]}
      />
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile icon={Clock} label="Total study time" value={formatDuration(stats.totalStudySeconds)} />
        <StatTile icon={CalendarDays} label="Active days (30d)" value={activeIn30} />
        <StatTile icon={Flame} label="Longest streak" value={`${stats.longestStreak} d`} hint={`Current: ${stats.streak} d`} />
        <StatTile
          icon={Trophy}
          label="Quiz accuracy"
          value={stats.quizAccuracy === null ? '—' : `${stats.quizAccuracy}%`}
          hint={`${stats.quizAnswered} answered`}
        />
      </section>

      <section className="card mt-4 p-5">
        <h2 className="font-semibold">Minutes studied — last 30 days</h2>
        <div className="mt-4">
          <StudyChart data={series} height={240} />
        </div>
      </section>

      <section className="card mt-4 overflow-x-auto p-5">
        <h2 className="font-semibold">Completion by module</h2>
        <table className="mt-3 w-full min-w-[640px] text-sm">
          <thead>
            <tr className="text-left text-xs text-faint">
              <th className="pb-2 font-medium">Module</th>
              <th className="pb-2 text-right font-medium">Lessons</th>
              <th className="w-1/3 pb-2 pl-4 font-medium">Progress</th>
              <th className="pb-2 pl-4 text-right font-medium">Quiz accuracy</th>
              <th className="pb-2 pl-4 text-right font-medium">Confident</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {stats.modules.map(({ module: m, done, total, percent }) => (
              <tr key={m.id}>
                <td className="py-2 pr-2">
                  <span className="text-faint tabular-nums">{m.number}.</span> {m.title}
                </td>
                <td className="py-2 text-right text-muted tabular-nums">
                  {done}/{total}
                </td>
                <td className="py-2 pl-4">
                  <div className="flex items-center gap-2">
                    <ProgressBar value={percent} label={`${m.title} progress`} />
                    <span className="w-9 text-right text-xs text-muted tabular-nums">{percent}%</span>
                  </div>
                </td>
                <td className="py-2 pl-4 text-right text-xs tabular-nums">
                  {(() => {
                    const q = perModule.get(m.id);
                    if (!q) return <span className="text-faint">—</span>;
                    const pct = Math.round((q.correct / q.answered) * 100);
                    return (
                      <span className={pct < 60 ? 'text-danger' : pct < 80 ? 'text-warn' : 'text-accent'}>
                        {pct}% <span className="text-faint">({q.answered})</span>
                      </span>
                    );
                  })()}
                </td>
                <td className="py-2 pl-4 text-right text-xs text-muted tabular-nums">
                  {confident(m.lessons.map((l) => l.id))}/{total}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  );
}
