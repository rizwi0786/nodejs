import { CheckCircle2, Eye, EyeOff, Lightbulb, Loader2, Play, RotateCcw, XCircle } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useProgress } from '../../context/ProgressContext';
import { lessonById } from '../../data/modules/curriculum';
import { paths } from '../../routes/paths';
import { runTests, type OutputLine, type TestResult } from '../../services/sandbox';
import { readJSON, writeJSON } from '../../services/storage';
import type { CodingChallenge } from '../../types';
import { CodeLines } from '../code/CodeBlock';
import { CodeEditor } from '../code/CodeEditor';
import { DifficultyBadge } from '../common/Badges';
import { RichText } from '../common/RichText';

const draftKey = (id: string) => `draft:${id}`;

/** "Write a function" challenge: editor, sandboxed test run, hints and solution. */
export function ChallengeRunner({ challenge: ch }: { challenge: CodingChallenge }) {
  const { recordQuiz } = useProgress();
  const [code, setCode] = useState(() => readJSON<string>(draftKey(ch.id), ch.starterCode));
  const [results, setResults] = useState<TestResult[] | null>(null);
  const [error, setError] = useState<string | undefined>();
  const [logs, setLogs] = useState<OutputLine[]>([]);
  const [running, setRunning] = useState(false);
  const [hints, setHints] = useState(0);
  const [showSolution, setShowSolution] = useState(false);

  const update = (v: string) => {
    setCode(v);
    writeJSON(draftKey(ch.id), v); // keep the learner's work across reloads
  };

  const run = async () => {
    setRunning(true);
    const r = await runTests(code, ch.tests);
    setRunning(false);
    setResults(r.results);
    setError(r.error);
    setLogs(r.logs);
    const passed = !r.error && r.results.length > 0 && r.results.every((t) => t.pass);
    recordQuiz(ch.id, passed);
  };

  const passedCount = results?.filter((r) => r.pass).length ?? 0;
  const allPassed = results && !error && results.length > 0 && passedCount === results.length;
  const related = ch.relatedLessonIds?.map((id) => lessonById.get(id)).filter((l) => l !== undefined) ?? [];

  return (
    <div className="space-y-4">
      <div className="card p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-2">
          <DifficultyBadge level={ch.difficulty} />
          <span className="chip">{ch.topic}</span>
        </div>
        <div className="mt-3 space-y-2 text-sm leading-7">
          {ch.prompt.split('\n\n').map((para, i) => (
            <p key={i} className="whitespace-pre-line">
              <RichText text={para} />
            </p>
          ))}
        </div>
        {related.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted">
            Related:
            {related.map((l) => (
              <Link key={l!.id} to={paths.lesson(l!)} className="text-accent hover:underline">
                {l!.title}
              </Link>
            ))}
          </div>
        )}
      </div>

      <div>
        <CodeEditor value={code} onChange={update} onRun={run} minRows={10} label={`Solution editor for ${ch.title}`} />
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <button className="btn-primary" onClick={run} disabled={running}>
            {running ? <Loader2 size={15} className="animate-spin" /> : <Play size={15} />} Run tests
          </button>
          <button className="btn-ghost" onClick={() => update(ch.starterCode)} title="Reset to starter code">
            <RotateCcw size={15} /> Reset
          </button>
          {ch.hints && hints < ch.hints.length && (
            <button className="btn-ghost" onClick={() => setHints((h) => h + 1)}>
              <Lightbulb size={15} /> Hint {hints + 1}/{ch.hints.length}
            </button>
          )}
          <button className="btn-ghost" onClick={() => setShowSolution((s) => !s)}>
            {showSolution ? <EyeOff size={15} /> : <Eye size={15} />} {showSolution ? 'Hide' : 'Show'} solution
          </button>
          <span className="ml-auto hidden text-xs text-faint sm:inline">Ctrl/⌘ + Enter runs the tests</span>
        </div>
      </div>

      {hints > 0 && ch.hints && (
        <ul className="space-y-1.5">
          {ch.hints.slice(0, hints).map((h, i) => (
            <li key={i} className="flex gap-2 rounded-lg border border-warn/30 bg-warn/5 px-3 py-2 text-sm">
              <Lightbulb size={15} className="mt-0.5 shrink-0 text-warn" aria-hidden />
              <RichText text={h} />
            </li>
          ))}
        </ul>
      )}

      {(results || error) && (
        <div className="card overflow-hidden" aria-live="polite">
          <div className={`flex items-center gap-2 border-b border-line px-4 py-2.5 text-sm font-medium ${allPassed ? 'text-accent' : 'text-danger'}`}>
            {allPassed ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
            {error ? 'Your code threw an error' : `${passedCount} / ${results!.length} tests passed`}
          </div>
          {error && <pre className="m-0 overflow-x-auto px-4 py-3 font-mono text-[13px] text-danger">{error}</pre>}
          {results && results.length > 0 && (
            <ul className="divide-y divide-line">
              {results.map((r, i) => (
                <li key={i} className="flex gap-3 px-4 py-2.5 font-mono text-[12.5px]">
                  {r.pass ? (
                    <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-accent" aria-label="pass" />
                  ) : (
                    <XCircle size={15} className="mt-0.5 shrink-0 text-danger" aria-label="fail" />
                  )}
                  <div className="min-w-0 space-y-0.5">
                    <div className="break-all text-ink">{r.call}</div>
                    {!r.pass && (
                      <>
                        <div className="break-all text-muted">expected: {r.expected}</div>
                        <div className="break-all text-danger">{r.error ? r.error : `received: ${r.actual}`}</div>
                      </>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
          {logs.length > 0 && (
            <div className="border-t border-line px-4 py-2">
              <div className="text-[11px] font-medium uppercase tracking-wide text-faint">Console</div>
              <pre className="m-0 max-h-48 overflow-auto font-mono text-[12.5px] leading-6 text-muted">
                {logs.map((l) => l.text).join('\n')}
              </pre>
            </div>
          )}
        </div>
      )}

      {allPassed && (
        <div className="rounded-lg border border-accent/40 bg-accent/5 px-4 py-3 text-sm">
          <div className="font-medium text-accent">Solved!</div>
          <div className="mt-1 text-muted">
            <RichText text={ch.explanation} />
          </div>
        </div>
      )}

      {showSolution && (
        <div className="overflow-hidden rounded-xl border border-line bg-code">
          <div className="border-b border-line bg-surface/60 px-3 py-1.5 text-xs font-medium text-muted">Reference solution</div>
          <CodeLines code={ch.solution} language="javascript" />
          <div className="border-t border-line px-4 py-3 text-sm text-muted">
            <RichText text={ch.explanation} />
          </div>
        </div>
      )}
    </div>
  );
}
