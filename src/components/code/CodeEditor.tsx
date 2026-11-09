import { useLayoutEffect, useMemo, useRef, type KeyboardEvent } from 'react';
import type { CodeExample } from '../../types';
import { highlight } from './highlight';

interface Props {
  value: string;
  onChange: (v: string) => void;
  language?: CodeExample['language'];
  onRun?: () => void;
  minRows?: number;
  label?: string;
}

/**
 * Lightweight code editor: a transparent <textarea> over a highlighted <pre>.
 * Tab indents, Shift+Tab outdents, Ctrl/⌘+Enter runs. Global shortcuts are
 * suppressed inside it via data-no-shortcuts.
 */
export function CodeEditor({ value, onChange, language = 'javascript', onRun, minRows = 6, label = 'Code editor' }: Props) {
  const ta = useRef<HTMLTextAreaElement>(null);
  const pre = useRef<HTMLPreElement>(null);
  const pendingSel = useRef<[number, number] | null>(null);
  const html = useMemo(() => highlight(value, language) + '\n', [value, language]);
  const rows = Math.max(minRows, value.split('\n').length);

  useLayoutEffect(() => {
    if (pendingSel.current && ta.current) {
      ta.current.setSelectionRange(...pendingSel.current);
      pendingSel.current = null;
    }
  }, [value]);

  const syncScroll = () => {
    if (pre.current && ta.current) {
      pre.current.scrollLeft = ta.current.scrollLeft;
      pre.current.scrollTop = ta.current.scrollTop;
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    const el = e.currentTarget;
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      onRun?.();
      return;
    }
    if (e.key === 'Escape') {
      el.blur(); // keyboard users can leave the editor (Tab is captured for indentation)
      return;
    }
    if (e.key !== 'Tab') return;
    e.preventDefault();
    const { selectionStart: s, selectionEnd: end } = el;
    const lineStart = value.lastIndexOf('\n', s - 1) + 1;
    if (e.shiftKey) {
      const block = value.slice(lineStart, end);
      const out = block.replace(/^ {1,2}/gm, '');
      const removedFirst = block.length - block.replace(/^ {1,2}/, '').length;
      onChange(value.slice(0, lineStart) + out + value.slice(end));
      pendingSel.current = [Math.max(lineStart, s - removedFirst), end - (block.length - out.length)];
    } else if (s !== end && value.slice(s, end).includes('\n')) {
      const block = value.slice(lineStart, end);
      const out = block.replace(/^/gm, '  ');
      onChange(value.slice(0, lineStart) + out + value.slice(end));
      pendingSel.current = [s + 2, end + (out.length - block.length)];
    } else {
      onChange(value.slice(0, s) + '  ' + value.slice(end));
      pendingSel.current = [s + 2, s + 2];
    }
  };

  return (
    <div data-no-shortcuts className="relative overflow-hidden rounded-lg border border-line bg-code font-mono text-[13px] leading-6">
      <pre
        ref={pre}
        aria-hidden
        className="code-tokens pointer-events-none m-0 overflow-hidden whitespace-pre px-4 py-3"
        style={{ minHeight: `${rows * 1.5 + 1.5}rem` }}
        dangerouslySetInnerHTML={{ __html: html }}
      />
      <textarea
        ref={ta}
        aria-label={label}
        spellCheck={false}
        autoCapitalize="off"
        autoComplete="off"
        autoCorrect="off"
        value={value}
        rows={rows}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        onScroll={syncScroll}
        className="absolute inset-0 h-full w-full resize-none overflow-auto whitespace-pre bg-transparent px-4 py-3 text-transparent caret-ink outline-none selection:bg-accent/30"
      />
    </div>
  );
}
