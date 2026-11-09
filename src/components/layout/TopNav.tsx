import { GraduationCap, Menu, MessagesSquare, Moon, Sun } from 'lucide-react';
import { useMemo } from 'react';
import { useProgress } from '../../context/ProgressContext';
import { useTheme } from '../../context/ThemeContext';
import { modules } from '../../data/modules/curriculum';
import { computeStats } from '../../utils/stats';
import { SearchBox } from '../navigation/SearchBox';
import { ProgressRing } from '../progress/ProgressRing';
import { ProfileMenu } from './ProfileMenu';
import type { LearningMode } from '../../types';

const modes: { id: LearningMode; label: string; short: string; icon: typeof GraduationCap }[] = [
  { id: 'learn', label: 'Detailed Learning', short: 'Learn', icon: GraduationCap },
  { id: 'interview', label: 'Interview & Revision', short: 'Interview', icon: MessagesSquare },
];

export function TopNav({ onMenu }: { onMenu: () => void }) {
  const { theme, toggleTheme } = useTheme();
  const { progress, setMode } = useProgress();
  const stats = useMemo(() => computeStats(modules, progress), [progress]);

  return (
    <header className="sticky top-0 z-20 flex h-14 print:hidden items-center gap-3 border-b border-line bg-bg/85 px-4 backdrop-blur sm:px-6">
      <button className="btn-ghost -ml-1 p-1.5 lg:hidden" onClick={onMenu} aria-label="Open menu">
        <Menu size={20} />
      </button>

      <SearchBox />

      <div className="ml-auto flex items-center gap-2 sm:gap-3">
        {/* Learning mode */}
        <div role="radiogroup" aria-label="Learning mode" className="flex rounded-lg border border-line bg-surface p-0.5">
          {modes.map(({ id, label, short, icon: Icon }) => {
            const active = progress.mode === id;
            return (
              <button
                key={id}
                role="radio"
                aria-checked={active}
                title={label}
                aria-label={label}
                onClick={() => setMode(id)}
                className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                  active ? 'bg-raised text-ink' : 'text-muted hover:text-ink'
                }`}
              >
                <Icon size={13} className={active ? 'text-accent' : ''} aria-hidden />
                <span className="hidden md:inline">{short}</span>
              </button>
            );
          })}
        </div>

        {/* Overall progress */}
        <div className="hidden items-center sm:flex" title={`${stats.completedLessons} of ${stats.totalLessons} lessons complete`}>
          <ProgressRing value={stats.percent} size={32} stroke={3.5}>
            <span className="text-[9px] font-semibold tabular-nums">{stats.percent}%</span>
          </ProgressRing>
        </div>

        <button
          className="btn-ghost p-1.5"
          onClick={toggleTheme}
          aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
        >
          {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
        </button>

        <ProfileMenu />
      </div>
    </header>
  );
}

