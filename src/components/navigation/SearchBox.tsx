import { Code2, FileCode, FileText, FolderKanban, Layers, MessagesSquare, Search, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ensureFullIndex, search, type SearchKind } from '../../services/search';

const kindIcon: Record<SearchKind, typeof FileText> = {
  module: Layers,
  lesson: FileText,
  project: FolderKanban,
  question: MessagesSquare,
  code: FileCode,
  challenge: Code2,
};

export function SearchBox() {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [narrow] = useState(() => window.matchMedia('(max-width: 639px)').matches);
  const inputRef = useRef<HTMLInputElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const [indexVersion, setIndexVersion] = useState(0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const results = useMemo(() => search(q), [q, indexVersion]);
  const loadFull = () => {
    ensureFullIndex().then(() => setIndexVersion(1));
  };

  // Ctrl/⌘ + K or "/" focuses search.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement)?.closest('input, textarea, [contenteditable="true"]');
      if ((e.key === 'k' && (e.ctrlKey || e.metaKey)) || (e.key === '/' && !typing)) {
        e.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
        ensureFullIndex();
      }
    };
    const onClick = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('mousedown', onClick);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mousedown', onClick);
    };
  }, []);

  const go = (to: string) => {
    navigate(to);
    setQ('');
    setOpen(false);
    inputRef.current?.blur();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === 'Enter' && results[active]) {
      go(results[active].to);
    } else if (e.key === 'Escape') {
      setOpen(false);
      inputRef.current?.blur();
    }
  };

  return (
    <div ref={boxRef} className="relative w-full max-w-md">
      <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" aria-hidden />
      <input
        ref={inputRef}
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setActive(0);
          setOpen(true);
        }}
        onFocus={() => {
          setOpen(true);
          loadFull();
        }}
        onKeyDown={onKeyDown}
        placeholder={narrow ? 'Search…' : 'Search lessons, code, questions…'}
        size={1}
        aria-label="Search the course"
        role="combobox"
        aria-expanded={open && results.length > 0}
        aria-controls="search-results"
        className="h-9 w-full rounded-lg border border-line bg-surface pl-9 pr-8 text-sm sm:pr-14 placeholder:text-faint focus:border-accent/60"
      />
      {q ? (
        <button
          onClick={() => setQ('')}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-faint hover:text-ink"
          aria-label="Clear search"
        >
          <X size={14} />
        </button>
      ) : (
        <kbd className="pointer-events-none absolute right-2 top-1/2 hidden -translate-y-1/2 rounded border border-line px-1.5 font-mono text-[10px] text-faint sm:block">
          Ctrl K
        </kbd>
      )}

      {open && q.trim() && (
        <div
          id="search-results"
          role="listbox"
          className="absolute left-0 right-0 top-11 z-50 max-h-[60vh] overflow-y-auto rounded-xl border border-line bg-surface p-1 shadow-2xl shadow-black/30"
        >
          {results.length === 0 ? (
            <div className="px-3 py-6 text-center text-sm text-muted">No matches for “{q}”.</div>
          ) : (
            results.map((r, i) => {
              const Icon = kindIcon[r.kind];
              return (
                <button
                  key={r.kind + r.to + r.title}
                  role="option"
                  aria-selected={i === active}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => go(r.to)}
                  className={`flex w-full items-start gap-3 rounded-lg px-3 py-2 text-left ${i === active ? 'bg-raised' : ''}`}
                >
                  <Icon size={15} className="mt-0.5 shrink-0 text-muted" aria-hidden />
                  <span className="min-w-0">
                    <span className="block truncate text-sm">{r.title}</span>
                    <span className="block truncate text-xs text-faint">{r.subtitle}</span>
                  </span>
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
