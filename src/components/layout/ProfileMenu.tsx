import { Download, RotateCcw, Upload, User } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useProgress } from '../../context/ProgressContext';

/** Profile menu: back up, restore or reset local progress (no backend in v1). */
export function ProfileMenu() {
  const [open, setOpen] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const { progress, importProgress, resetProgress } = useProgress();

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) {
        setOpen(false);
        setConfirmReset(false);
      }
    };
    window.addEventListener('mousedown', onClick);
    return () => window.removeEventListener('mousedown', onClick);
  }, []);

  const exportProgress = () => {
    const blob = new Blob([JSON.stringify(progress, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `nodejs-mastery-progress-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      importProgress(JSON.parse(await file.text()));
      setMsg('Progress restored.');
    } catch {
      setMsg('That file is not a valid progress backup.');
    }
    e.target.value = '';
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="grid h-8 w-8 place-items-center rounded-full border border-line bg-raised text-muted hover:text-ink"
        aria-label="Profile menu"
        aria-expanded={open}
      >
        <User size={16} />
      </button>
      {open && (
        <div className="absolute right-0 top-10 z-50 w-64 rounded-xl border border-line bg-surface p-1.5 shadow-2xl shadow-black/30">
          <div className="px-3 py-2">
            <div className="text-sm font-medium">Learner</div>
            <div className="text-xs text-faint">Progress is saved in this browser only.</div>
          </div>
          <div className="my-1 border-t border-line" />
          <button className="btn-ghost w-full justify-start" onClick={exportProgress}>
            <Download size={15} /> Export progress (.json)
          </button>
          <button className="btn-ghost w-full justify-start" onClick={() => fileRef.current?.click()}>
            <Upload size={15} /> Import progress
          </button>
          <input ref={fileRef} type="file" accept="application/json" className="hidden" onChange={onFile} />
          {confirmReset ? (
            <div className="m-1 rounded-lg border border-danger/40 p-2 text-xs">
              <div className="text-muted">Erase all progress, bookmarks and study time?</div>
              <div className="mt-2 flex gap-2">
                <button
                  className="btn bg-danger px-2 py-1 text-xs text-white"
                  onClick={() => {
                    resetProgress();
                    setConfirmReset(false);
                    setMsg('Progress reset.');
                  }}
                >
                  Erase
                </button>
                <button className="btn-ghost px-2 py-1 text-xs" onClick={() => setConfirmReset(false)}>
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button className="btn-ghost w-full justify-start hover:text-danger" onClick={() => setConfirmReset(true)}>
              <RotateCcw size={15} /> Reset progress
            </button>
          )}
          {msg && <div className="px-3 pb-1 pt-2 text-xs text-accent">{msg}</div>}
        </div>
      )}
    </div>
  );
}
