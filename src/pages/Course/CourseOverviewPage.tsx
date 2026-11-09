import { BookOpen, Clock, FolderKanban, GraduationCap, Layers, MessagesSquare } from 'lucide-react';
import { Link } from 'react-router-dom';
import { PageHeader } from '../../components/common/PageHeader';
import { StatTile } from '../../components/common/StatTile';
import { allLessons, modules } from '../../data/modules/curriculum';
import { projects } from '../../data/projects';
import { interviewTargets } from '../../data/questions';
import { paths } from '../../routes/paths';
import { moduleIcon } from '../../utils/icons';

const outcomes = [
  'Understand the JavaScript that Node.js is built on',
  'Explain Node.js internals: V8, libuv and the event loop',
  'Build REST APIs with the http module, then Express',
  'Work with PostgreSQL and MongoDB safely',
  'Implement authentication, authorization and security',
  'Scale with workers, clustering, caching and queues',
  'Test, debug, containerise and deploy to production',
  'Answer beginner-to-advanced interview questions with confidence',
];

export default function CourseOverviewPage() {
  const hours = Math.round(allLessons.reduce((s, l) => s + l.estMinutes, 0) / 60);
  const totalQuestions = interviewTargets.reduce((s, t) => s + t.target, 0);
  return (
    <>
      <PageHeader
        title="Course Overview"
        description="A practical path from zero Node.js knowledge to a job-ready backend developer — with interview preparation built into every module."
        crumbs={[{ label: 'Dashboard', to: paths.dashboard }, { label: 'Course Overview' }]}
      />

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile icon={Layers} label="Modules" value={modules.length} />
        <StatTile icon={BookOpen} label="Lessons" value={allLessons.length} />
        <StatTile icon={Clock} label="Est. learning time" value={`~${hours}h`} hint="excluding projects" />
        <StatTile icon={FolderKanban} label="Projects" value={projects.length} />
      </section>

      <section className="mt-6 grid gap-4 lg:grid-cols-2">
        <div className="card p-5">
          <h2 className="font-semibold">What you will be able to do</h2>
          <ul className="mt-3 space-y-2 text-sm text-muted">
            {outcomes.map((o) => (
              <li key={o} className="flex gap-2">
                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" aria-hidden />
                {o}
              </li>
            ))}
          </ul>
        </div>
        <div className="card p-5">
          <h2 className="font-semibold">Two ways to study</h2>
          <div className="mt-3 space-y-3">
            <div className="rounded-lg border border-line p-3">
              <div className="flex items-center gap-2 text-sm font-medium">
                <GraduationCap size={16} className="text-accent" /> Detailed Learning
              </div>
              <p className="mt-1 text-sm text-muted">
                Concept → why it exists → how it works inside → runnable example with expected output → mistakes → practice.
              </p>
            </div>
            <div className="rounded-lg border border-line p-3">
              <div className="flex items-center gap-2 text-sm font-medium">
                <MessagesSquare size={16} className="text-accent" /> Interview &amp; Revision
              </div>
              <p className="mt-1 text-sm text-muted">
                Definitions, differences, tricky output questions, scenarios and MCQs — about {totalQuestions} questions in total.
              </p>
            </div>
          </div>
          <p className="mt-3 text-xs text-faint">Switch modes any time from the top bar.</p>
        </div>
      </section>

      <section className="card mt-6 p-5">
        <h2 className="font-semibold">Syllabus</h2>
        <ol className="mt-3 grid gap-x-8 gap-y-1 md:grid-cols-2">
          {modules.map((m) => {
            const Icon = moduleIcon(m.icon);
            return (
              <li key={m.id}>
                <Link to={paths.module(m)} className="flex items-center gap-3 rounded-md px-2 py-2 text-sm hover:bg-raised">
                  <Icon size={15} className="text-muted" aria-hidden />
                  <span className="w-5 text-faint tabular-nums">{m.number}</span>
                  <span className="flex-1">{m.title}</span>
                  <span className="text-xs text-faint tabular-nums">{m.lessons.length}</span>
                </Link>
              </li>
            );
          })}
          <li>
            <Link to={paths.projects} className="flex items-center gap-3 rounded-md px-2 py-2 text-sm hover:bg-raised">
              <FolderKanban size={15} className="text-muted" aria-hidden />
              <span className="w-5 text-faint">16</span>
              <span className="flex-1">Real-World Projects</span>
              <span className="text-xs text-faint tabular-nums">{projects.length}</span>
            </Link>
          </li>
          <li>
            <Link to={paths.interview} className="flex items-center gap-3 rounded-md px-2 py-2 text-sm hover:bg-raised">
              <MessagesSquare size={15} className="text-muted" aria-hidden />
              <span className="w-5 text-faint">17</span>
              <span className="flex-1">Interview Preparation</span>
              <span className="text-xs text-faint tabular-nums">{totalQuestions}</span>
            </Link>
          </li>
        </ol>
      </section>
    </>
  );
}
