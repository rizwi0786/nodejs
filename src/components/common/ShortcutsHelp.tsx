import { Keyboard, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { OPEN_SHORTCUTS_EVENT, useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts';

const groups = [
  {
    title: 'Anywhere',
    keys: [
      ['Ctrl K  or  /', 'Search the course'],
      ['?', 'Show this help'],
    ],
  },
  {
    title: 'On a lesson',
    keys: [
      ['←', 'Previous lesson'],
      ['→', 'Next lesson'],
      ['M', 'Mark complete / incomplete'],
      ['N', 'Mark complete and go to next'],
      ['B', 'Bookmark / remove bookmark'],
      ['O', 'Open or close the course outline'],
    ],
  },
];

/** Keyboard shortcut reference — opened with "?" or by dispatching OPEN_SHORTCUTS_EVENT. */
export function ShortcutsHelp() {
  const [open, setOpen] = useState(false);
  useKeyboardShortcuts({ '?': () => setOpen((o) => !o) });
  useKeyboardShortcuts({ Escape: () => setOpen(false) }, open);

  useEffect(() => {
    const show = () => setOpen(true);
    window.addEventListener(OPEN_SHORTCUTS_EVENT, show);
    return () => window.removeEventListener(OPEN_SHORTCUTS_EVENT, show);
  }, []);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60] grid place-items-center p-4" role="dialog" aria-modal="true" aria-label="Keyboard shortcuts">
      <div className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} />
      <div className="relative w-full max-w-md rounded-xl border border-line bg-surface p-5 shadow-2xl shadow-black/40">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 font-semibold">
            <Keyboard size={16} className="text-accent" aria-hidden /> Keyboard shortcuts
          </h2>
          <button className="btn-ghost p-1" onClick={() => setOpen(false)} aria-label="Close">
            <X size={16} />
          </button>
        </div>
        {groups.map((g) => (
          <div key={g.title} className="mt-4">
            <div className="section-title text-[11px]">{g.title}</div>
            <dl className="mt-2 space-y-1.5">
              {g.keys.map(([k, d]) => (
                <div key={k} className="flex items-center justify-between gap-4 text-sm">
                  <dt className="text-muted">{d}</dt>
                  <dd>
                    <kbd className="rounded border border-line bg-raised px-1.5 py-0.5 font-mono text-xs">{k}</kbd>
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
      </div>
    </div>
  );
}
