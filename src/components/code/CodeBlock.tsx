import { Check, Copy, Info, Pencil, Play, RotateCcw, Square, Terminal } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import type { CodeExample } from '../../types';
import { RichText } from '../common/RichText';
import { runCode, type OutputLine } from '../../services/sandbox';
import { CodeEditor } from './CodeEditor';
import { highlightLines, languageLabel } from './highlight';

function useCopy() {
  const [copied, setCopied] = useState(false);
  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable (insecure context) */
    }
  };
  return { copied, copy };
}

export function CodeLines({ code, language }: { code: string; language: CodeExample['language'] }) {
  const lines = useMemo(() => highlightLines(code, language), [code, language]);
  const showNumbers = lines.length > 1;
  return (
    <pre className="code-tokens m-0 overflow-x-auto py-3 font-mono text-[13px] leading-6">
      <code className="grid min-w-max" style={{ gridTemplateColumns: showNumbers ? 'auto 1fr' : '1fr' }}>
        {lines.map((html, i) => (
          <div key={i} className="contents">
            {showNumbers && (
              <span className="select-none pl-4 pr-4 text-right text-faint/70 tabular-nums" aria-hidden>
                {i + 1}
              </span>
            )}
            <span className={showNumbers ? 'pr-4' : 'px-4'} dangerouslySetInnerHTML={{ __html: html || ' ' }} />
          </div>
        ))}
      </code>
    </pre>
  );
}

export function OutputPanel({ title, lines, tone = 'expected' }: { title: string; lines: OutputLine[] | string; tone?: 'expected' | 'actual' }) {
  const list: OutputLine[] = typeof lines === 'string' ? lines.split('\n').map((text) => ({ stream: 'out', text })) : lines;
  return (
    <div className="border-t border-line">
      <div className="flex items-center gap-1.5 px-4 pt-2 text-[11px] font-medium uppercase tracking-wide text-faint">
        <Terminal size={12} aria-hidden /> {title}
      </div>
      <pre
        className={`m-0 overflow-x-auto px-4 pb-3 pt-1 font-mono text-[13px] leading-6 ${tone === 'actual' ? 'text-ink' : 'text-muted'}`}
        aria-live={tone === 'actual' ? 'polite' : undefined}
      >
        {list.length === 0 ? (
          <span className="italic text-faint">(no output)</span>
        ) : (
          list.map((l, i) => (
            <div key={i} className={l.stream === 'err' ? 'text-danger' : l.stream === 'info' ? 'italic text-warn' : undefined}>
              {l.text || ' '}
            </div>
          ))
        )}
      </pre>
    </div>
  );
}

const norm = (s: string) =>
  s
    .replace(/\r/g, '')
    .split('\n')
    .map((l) => l.trimEnd())
    .join('\n')
    .trim();

interface Props {
  example: CodeExample;
  /** Hide the explanation list (e.g. compact interview view). */
  compact?: boolean;
}

export function CodeBlock({ example, compact }: Props) {
  const { copied, copy } = useCopy();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(example.code);
  const [output, setOutput] = useState<OutputLine[] | null>(null);
  const [running, setRunning] = useState(false);
  const cancelRef = useRef<(() => void) | null>(null);
  const runnable = example.runnable && (example.language === 'javascript' || example.language === 'typescript');

  const run = () => {
    if (running) {
      cancelRef.current?.();
      return;
    }
    const lines: OutputLine[] = [];
    setOutput([]);
    setRunning(true);
    const { done, cancel } = runCode(editing ? draft : example.code, (l) => {
      lines.push(l);
      setOutput([...lines]);
    });
    cancelRef.current = cancel;
    done.then(() => {
      setRunning(false);
      setOutput([...lines]);
    });
  };

  const actualText = output ? norm(output.filter((l) => l.stream !== 'info').map((l) => l.text).join('\n')) : '';
  const matches = output && !running && example.expectedOutput != null && actualText === norm(example.expectedOutput);
  const modified = editing && draft !== example.code;

  return (
    <figure className="my-4 overflow-hidden rounded-xl border border-line bg-code">
      <figcaption className="flex flex-wrap items-center gap-2 border-b border-line bg-surface/60 px-3 py-1.5">
        <span className="min-w-0 flex-1 truncate text-xs font-medium text-muted">
          {example.title ?? languageLabel[example.language]}
        </span>
        {example.title && <span className="hidden text-[11px] text-faint sm:inline">{languageLabel[example.language]}</span>}
        <div className="flex items-center gap-0.5">
          {runnable && (
            <>
              <button
                className="btn-ghost px-2 py-1 text-xs"
                onClick={() => {
                  setEditing((e) => !e);
                  setOutput(null);
                }}
                aria-pressed={editing}
                title={editing ? 'Back to the original example' : 'Edit this example'}
              >
                <Pencil size={13} aria-hidden /> <span className="hidden sm:inline">{editing ? 'Editing' : 'Edit'}</span>
              </button>
              {modified && (
                <button className="btn-ghost px-2 py-1 text-xs" onClick={() => setDraft(example.code)} title="Reset to original code">
                  <RotateCcw size={13} aria-hidden /> <span className="hidden sm:inline">Reset</span>
                </button>
              )}
              <button className="btn-ghost px-2 py-1 text-xs text-accent" onClick={run} title="Run in the browser sandbox">
                {running ? <Square size={13} aria-hidden /> : <Play size={13} aria-hidden />} {running ? 'Stop' : 'Run'}
              </button>
            </>
          )}
          <button
            className="btn-ghost px-2 py-1 text-xs"
            onClick={() => copy(editing ? draft : example.code)}
            aria-label="Copy code"
            title="Copy code"
          >
            {copied ? <Check size={13} className="text-accent" aria-hidden /> : <Copy size={13} aria-hidden />}
            <span className="hidden sm:inline">{copied ? 'Copied' : 'Copy'}</span>
          </button>
        </div>
      </figcaption>

      {editing ? (
        <div className="p-2">
          <CodeEditor value={draft} onChange={setDraft} language={example.language} onRun={run} minRows={3} />
          <div className="mt-1 px-1 text-[11px] text-faint">Ctrl/⌘ + Enter to run · Esc to leave the editor</div>
        </div>
      ) : (
        <CodeLines code={example.code} language={example.language} />
      )}

      {output && (
        <OutputPanel
          title={running ? 'Running…' : matches ? 'Your output ✓ matches expected' : 'Your output'}
          lines={output}
          tone="actual"
        />
      )}
      {example.expectedOutput != null && (!output || !matches || modified) && (
        <OutputPanel title="Expected output" lines={example.expectedOutput} />
      )}

      {example.versionNote && (
        <div className="flex items-start gap-2 border-t border-line px-4 py-2 text-xs text-muted">
          <Info size={13} className="mt-0.5 shrink-0 text-info" aria-hidden />
          <RichText text={example.versionNote} />
        </div>
      )}

      {!compact && example.explanation && example.explanation.length > 0 && (
        <div className="border-t border-line bg-surface/40 px-4 py-3">
          <div className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-faint">Why</div>
          <ol className="space-y-1 text-sm text-muted">
            {example.explanation.map((e, i) => (
              <li key={i} className="flex gap-2">
                <span className="mt-0.5 h-5 w-5 shrink-0 rounded-full bg-raised text-center text-[11px] leading-5 text-faint tabular-nums">
                  {i + 1}
                </span>
                <span className="min-w-0">
                  <RichText text={e} />
                </span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </figure>
  );
}
