import { X } from 'lucide-react';
import { NavLink } from 'react-router-dom';
import { navGroups } from '../../routes/navigation';
import { useProgress } from '../../context/ProgressContext';
import { modules } from '../../data/modules/curriculum';
import { computeStats } from '../../utils/stats';
import { ProgressBar } from '../progress/ProgressBar';
import { useMemo } from 'react';

interface Props {
  open: boolean; // mobile drawer state
  onClose: () => void;
}

export function Logo() {
  return (
    <div className="flex items-center gap-2.5">
      <svg width="26" height="26" viewBox="0 0 32 32" aria-hidden>
        <path d="M16 2 28 9v14l-12 7-12-7V9z" className="fill-accent" />
        <path d="M16 9.5 22 13v6l-6 3.5-6-3.5v-6z" className="fill-bg" />
      </svg>
      <div className="leading-tight">
        <div className="text-sm font-semibold">Node.js Mastery</div>
        <div className="text-[11px] text-faint">Zero to job-ready</div>
      </div>
    </div>
  );
}

export function Sidebar({ open, onClose }: Props) {
  const { progress } = useProgress();
  const stats = useMemo(() => computeStats(modules, progress), [progress]);

  const nav = (
    <nav aria-label="Main" className="flex-1 overflow-y-auto px-3 py-4">
      {navGroups.map((g, gi) => (
        <div key={gi} className={gi ? 'mt-6' : ''}>
          {g.title && <div className="mb-1.5 px-3 text-[11px] font-semibold uppercase tracking-wider text-faint">{g.title}</div>}
          <ul className="space-y-0.5">
            {g.items.map(({ label, to, icon: Icon }) => (
              <li key={to}>
                <NavLink
                  to={to}
                  end={to === '/'}
                  onClick={onClose}
                  className={({ isActive }) =>
                    `flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                      isActive ? 'bg-raised font-medium text-ink' : 'text-muted hover:bg-raised/60 hover:text-ink'
                    }`
                  }
                >
                  {({ isActive }) => (
                    <>
                      <Icon size={16} className={isActive ? 'text-accent' : ''} aria-hidden />
                      {label}
                    </>
                  )}
                </NavLink>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );

  const footer = (
    <div className="border-t border-line p-4">
      <div className="flex items-baseline justify-between text-xs">
        <span className="text-muted">Course progress</span>
        <span className="font-medium tabular-nums">{stats.percent}%</span>
      </div>
      <ProgressBar value={stats.percent} className="mt-2" label="Course progress" />
      <div className="mt-1.5 text-[11px] text-faint tabular-nums">
        {stats.completedLessons} of {stats.totalLessons} lessons
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-line bg-surface lg:flex print:!hidden">
        <div className="flex h-14 items-center border-b border-line px-5">
          <Logo />
        </div>
        {nav}
        {footer}
      </aside>

      {/* Mobile / tablet drawer */}
      <div className={`fixed inset-0 z-50 lg:hidden ${open ? '' : 'pointer-events-none'}`} aria-hidden={!open}>
        <div
          className={`absolute inset-0 bg-black/50 transition-opacity ${open ? 'opacity-100' : 'opacity-0'}`}
          onClick={onClose}
        />
        <aside
          className={`absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col border-r border-line bg-surface transition-transform ${
            open ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          <div className="flex h-14 items-center justify-between border-b border-line px-5">
            <Logo />
            <button className="btn-ghost p-1.5" onClick={onClose} aria-label="Close menu">
              <X size={18} />
            </button>
          </div>
          {nav}
          {footer}
        </aside>
      </div>
    </>
  );
}
