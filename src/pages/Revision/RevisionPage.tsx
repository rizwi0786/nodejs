import { AlertCircle, Bookmark, BookOpenCheck, Flame, History, MessagesSquare, NotebookPen, RotateCcw, XCircle } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { EmptyState } from '../../components/common/EmptyState';
import { PageHeader } from '../../components/common/PageHeader';
import { RichText } from '../../components/common/RichText';
import { InterviewCard } from '../../components/interview/InterviewCard';
import { QuizCard } from '../../components/quizzes/QuizCard';
import { useProgress } from '../../context/ProgressContext';
import { allLessons, lessonById, moduleById } from '../../data/modules/curriculum';
import { useAllContent } from '../../hooks/useContent';
import { useInterviewBank } from '../../hooks/useInterviewBank';
import { paths } from '../../routes/paths';
import type { Lesson } from '../../types';
import { relativeTime } from '../../utils/date';
import { weakLessons, wrongQuizIds } from '../../utils/practice';

function Panel({ icon: Icon, title, count, children, action }: { icon: typeof History; title: string; count?: number; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="card min-w-0 p-5">
      <div className="flex items-center gap-2">
        <h2 className="flex items-center gap-2 font-semibold">
          <Icon size={16} className="text-accent" aria-hidden /> {title}
        </h2>
        {count !== undefined && <span className="chip tabular-nums">{count}</span>}
        <div className="ml-auto">{action}</div>
      </div>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function LessonLink({ lesson, right }: { lesson: Lesson; right?: ReactNode }) {
  return (
    <Link to={paths.lesson(lesson)} className="flex items-center justify-between gap-3 rounded-md px-2 py-1.5 hover:bg-raised">
      <span className="min-w-0">
        <span className="block truncate text-sm">{lesson.title}</span>
        <span className="block truncate text-xs text-faint">
          Module {moduleById.get(lesson.moduleId)!.number} · {moduleById.get(lesson.moduleId)!.title}
        </span>
      </span>
      {right && <span className="shrink-0 text-xs text-faint">{right}</span>}
    </Link>
  );
}

const Empty = ({ children }: { children: ReactNode }) => <p className="text-sm text-muted">{children}</p>;

export default function RevisionPage() {
  const { progress } = useProgress();
  const bank = useInterviewBank();
  const content = useAllContent();
  const [showWrong, setShowWrong] = useState(5);

  const recent = progress.recentLessons
    .map((r) => ({ lesson: lessonById.get(r.lessonId), at: r.at }))
    .filter((r): r is { lesson: Lesson; at: string } => Boolean(r.lesson))
    .slice(0, 8);
  const bookmarks = Object.entries(progress.bookmarks)
    .sort((a, b) => b[1].localeCompare(a[1]))
    .map(([id]) => lessonById.get(id))
    .filter((l): l is Lesson => Boolean(l));
  const needsReview = allLessons.filter((l) => progress.revision[l.id] === 'review');
  const weak = useMemo(() => weakLessons(progress), [progress]);
  const wrongIds = useMemo(() => wrongQuizIds(progress), [progress]);
  const quizById = useMemo(() => new Map(bank?.quizzes.map((q) => [q.id, q])), [bank]);
  const wrong = wrongIds.map((id) => quizById.get(id)).filter((q) => q !== undefined);
  const reviewQuestions = bank ? bank.questions.filter((q) => progress.interviewReviewed[q.id] === 'review') : [];
  const critical = allLessons.filter((l) => l.importance === 'critical' && progress.revision[l.id] !== 'confident');

  // Quick notes: the lessons you most need — flagged for review, weak, bookmarked, then recent.
  const noteLessons = useMemo(() => {
    const ids = [...needsReview.map((l) => l.id), ...weak.map((w) => w.lessonId), ...bookmarks.map((l) => l.id), ...recent.map((r) => r.lesson.id)];
    return [...new Set(ids)].map((id) => lessonById.get(id)!).filter(Boolean).slice(0, 12);
  }, [needsReview, weak, bookmarks, recent]);
  const [noteId, setNoteId] = useState<string | null>(null);
  const activeNote = noteId ?? noteLessons[0]?.id ?? null;
  const notes = activeNote ? content?.lessons.get(activeNote)?.revisionNotes : undefined;

  return (
    <>
      <PageHeader
        title="Revision Center"
        description="Everything built from your own activity: wrong answers to retry, weak topics, lessons you flagged and quick notes for the night before an interview."
        crumbs={[{ label: 'Dashboard', to: paths.dashboard }, { label: 'Revision Center' }]}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel icon={AlertCircle} title="Weak topics" count={weak.length}>
          {weak.length ? (
            <ul className="space-y-0.5">
              {weak.slice(0, 8).map((w) => (
                <li key={w.lessonId}>
                  <LessonLink
                    lesson={lessonById.get(w.lessonId)!}
                    right={
                      <span className="text-danger tabular-nums">
                        {w.correct}/{w.answered} · {w.accuracy}%
                      </span>
                    }
                  />
                </li>
              ))}
            </ul>
          ) : (
            <Empty>Lessons where fewer than 60% of your latest quiz answers are correct appear here.</Empty>
          )}
        </Panel>

        <Panel icon={RotateCcw} title="Flagged for review" count={needsReview.length}>
          {needsReview.length ? (
            <ul className="space-y-0.5">
              {needsReview.slice(0, 8).map((l) => (
                <li key={l.id}>
                  <LessonLink lesson={l} />
                </li>
              ))}
            </ul>
          ) : (
            <Empty>At the end of each lesson, choose “Needs review” to queue it here.</Empty>
          )}
        </Panel>
      </div>

      <div className="mt-4">
        <Panel
          icon={XCircle}
          title="Wrong answers to retry"
          count={wrong.length}
          action={
            wrong.length > 0 && (
              <Link to={`${paths.practice}?status=wrong`} className="text-xs text-muted hover:text-ink">
                Open in Practice →
              </Link>
            )
          }
        >
          {!bank ? (
            <Empty>Loading…</Empty>
          ) : wrong.length ? (
            <div className="space-y-3">
              {wrong.slice(0, showWrong).map((q, i) => (
                <QuizCard key={q!.id} question={q!} index={i} showLesson />
              ))}
              {showWrong < wrong.length && (
                <button className="btn-outline mx-auto flex" onClick={() => setShowWrong((n) => n + 5)}>
                  Show more ({wrong.length - showWrong} left)
                </button>
              )}
            </div>
          ) : (
            <EmptyState icon={BookOpenCheck} title="No wrong answers">
              Questions whose most recent answer was wrong land here until you get them right.
            </EmptyState>
          )}
        </Panel>
      </div>

      <div className="mt-4">
        <Panel icon={NotebookPen} title="Quick revision notes">
          {noteLessons.length === 0 ? (
            <Empty>Study, bookmark or flag a few lessons — their key points will be collected here.</Empty>
          ) : (
            <div className="grid gap-4 md:grid-cols-[220px_minmax(0,1fr)]">
              <ul className="flex gap-1.5 overflow-x-auto md:flex-col md:gap-0.5 md:overflow-visible">
                {noteLessons.map((l) => (
                  <li key={l.id} className="shrink-0">
                    <button
                      onClick={() => setNoteId(l.id)}
                      className={`w-full truncate rounded-md px-2 py-1.5 text-left text-sm ${activeNote === l.id ? 'bg-raised font-medium text-ink' : 'text-muted hover:bg-raised/60'}`}
                    >
                      {l.title}
                    </button>
                  </li>
                ))}
              </ul>
              <div className="min-w-0">
                {!content ? (
                  <Empty>Loading…</Empty>
                ) : notes?.length ? (
                  <>
                    <ul className="space-y-1.5">
                      {notes.map((n, i) => (
                        <li key={i} className="flex gap-2.5 leading-7">
                          <span className="mt-[0.7rem] h-1.5 w-1.5 shrink-0 rounded-full bg-accent" aria-hidden />
                          <span className="min-w-0">
                            <RichText text={n} />
                          </span>
                        </li>
                      ))}
                    </ul>
                    <Link to={paths.lesson(lessonById.get(activeNote!)!)} className="mt-3 inline-block text-xs text-accent hover:underline">
                      Open lesson →
                    </Link>
                  </>
                ) : (
                  <Empty>No notes for this lesson yet.</Empty>
                )}
              </div>
            </div>
          )}
        </Panel>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Panel icon={Flame} title="Must-know concepts" count={critical.length}>
          <p className="mb-2 text-xs text-faint">Critical interview topics you haven't marked “Confident” yet.</p>
          <ul className="max-h-80 space-y-0.5 overflow-y-auto">
            {critical.map((l) => (
              <li key={l.id}>
                <LessonLink lesson={l} right={progress.completedLessons[l.id] ? 'studied' : undefined} />
              </li>
            ))}
          </ul>
        </Panel>

        <div className="min-w-0 space-y-4">
          <Panel icon={History} title="Recently studied">
            {recent.length ? (
              <ul className="space-y-0.5">
                {recent.map(({ lesson, at }) => (
                  <li key={lesson.id}>
                    <LessonLink lesson={lesson} right={relativeTime(at)} />
                  </li>
                ))}
              </ul>
            ) : (
              <Empty>Lessons you open will appear here.</Empty>
            )}
          </Panel>
          <Panel icon={Bookmark} title="Bookmarked" count={bookmarks.length}>
            {bookmarks.length ? (
              <ul className="space-y-0.5">
                {bookmarks.slice(0, 6).map((l) => (
                  <li key={l.id}>
                    <LessonLink lesson={l} />
                  </li>
                ))}
              </ul>
            ) : (
              <Empty>Press B on any lesson to bookmark it.</Empty>
            )}
          </Panel>
        </div>
      </div>

      <div className="mt-4">
        <Panel icon={MessagesSquare} title="Interview questions to review" count={reviewQuestions.length}>
          {reviewQuestions.length ? (
            <div className="space-y-2">
              {reviewQuestions.slice(0, 10).map((q, i) => (
                <InterviewCard key={q.id} q={q} index={i} />
              ))}
            </div>
          ) : (
            <Empty>Questions you mark “Review later” in Interview Preparation are collected here.</Empty>
          )}
        </Panel>
      </div>
    </>
  );
}
