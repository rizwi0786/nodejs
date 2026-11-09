import { AlertTriangle, ArrowDown, ArrowRight, Lightbulb, MessagesSquare, StickyNote } from 'lucide-react';
import { Component, type ReactNode } from 'react';
import { diagrams } from '../../components/diagrams';
import type { ComparisonTable, ContentBlock, DiagramId, FlowStep } from '../../types';
import { CodeBlock } from '../code/CodeBlock';
import { RichText } from '../common/RichText';

const calloutStyle = {
  tip: { icon: Lightbulb, label: 'Tip', cls: 'border-accent/40 bg-accent/5', iconCls: 'text-accent' },
  warning: { icon: AlertTriangle, label: 'Watch out', cls: 'border-warn/40 bg-warn/5', iconCls: 'text-warn' },
  interview: { icon: MessagesSquare, label: 'Interview focus', cls: 'border-info/40 bg-info/5', iconCls: 'text-info' },
  note: { icon: StickyNote, label: 'Note', cls: 'border-line bg-raised/40', iconCls: 'text-muted' },
} as const;

export function Callout({ variant, text }: { variant: keyof typeof calloutStyle; text: string }) {
  const s = calloutStyle[variant];
  const Icon = s.icon;
  return (
    <div className={`my-3 flex gap-3 rounded-lg border px-4 py-3 text-sm ${s.cls}`} role="note">
      <Icon size={16} className={`mt-0.5 shrink-0 ${s.iconCls}`} aria-hidden />
      <div className="min-w-0">
        <span className="sr-only">{s.label}: </span>
        <RichText text={text} />
      </div>
    </div>
  );
}

export function TableBlock({ table }: { table: ComparisonTable }) {
  return (
    <figure className="my-4">
      {table.title && <figcaption className="mb-2 text-sm font-medium">{table.title}</figcaption>}
      <div className="overflow-x-auto rounded-lg border border-line">
        <table className="w-full border-collapse text-sm">
          <thead className="bg-raised/60 text-left">
            <tr>
              {table.columns.map((c, i) => (
                <th key={i} scope="col" className="whitespace-nowrap border-b border-line px-3 py-2 font-medium text-ink">
                  <RichText text={c} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.rows.map((row, r) => (
              <tr key={r} className="border-b border-line last:border-0">
                {row.map((cell, c) =>
                  c === 0 ? (
                    <th key={c} scope="row" className="px-3 py-2 text-left align-top font-medium text-ink">
                      <RichText text={cell} />
                    </th>
                  ) : (
                    <td key={c} className="px-3 py-2 align-top text-muted">
                      <RichText text={cell} />
                    </td>
                  ),
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  );
}

export function FlowChart({
  steps,
  title,
  direction = 'horizontal',
  caption,
}: {
  steps: FlowStep[];
  title?: string;
  direction?: 'horizontal' | 'vertical';
  caption?: string;
}) {
  const horizontal = direction === 'horizontal' && steps.length <= 6;
  return (
    <figure className="my-5" role="img" aria-label={`${title ?? 'Flow'}: ${steps.map((s) => s.label).join(', then ')}`}>
      {title && <div className="mb-2 text-sm font-medium">{title}</div>}
      <ol
        className={
          horizontal
            ? 'flex flex-col items-stretch gap-1 md:flex-row md:items-stretch md:gap-0'
            : 'flex flex-col items-stretch gap-1'
        }
      >
        {steps.map((s, i) => (
          <li key={i} className={`flex ${horizontal ? 'flex-col md:flex-1 md:flex-row md:items-center' : 'flex-col'}`}>
            <div className="flex-1 rounded-lg border border-line bg-surface px-3 py-2">
              <div className="flex items-baseline gap-2">
                <span className="text-[11px] font-semibold text-accent tabular-nums">{i + 1}</span>
                <span className="text-sm font-medium">
                  <RichText text={s.label} />
                </span>
              </div>
              {s.detail && (
                <div className="mt-0.5 text-xs text-muted">
                  <RichText text={s.detail} />
                </div>
              )}
            </div>
            {i < steps.length - 1 && (
              <div className={`flex items-center justify-center text-faint ${horizontal ? 'py-0.5 md:px-1 md:py-0' : 'py-0.5'}`} aria-hidden>
                <ArrowDown size={14} className={horizontal ? 'md:hidden' : ''} />
                {horizontal && <ArrowRight size={14} className="hidden md:block" />}
              </div>
            )}
          </li>
        ))}
      </ol>
      {caption && <figcaption className="mt-2 text-xs text-muted"><RichText text={caption} /></figcaption>}
    </figure>
  );
}

/** A broken diagram must never take the whole lesson down. */
class DiagramBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? <div className="p-4 text-sm text-faint">Diagram unavailable.</div> : this.props.children;
  }
}

export function DiagramBlock({ id, caption }: { id: DiagramId; caption?: string }) {
  const D = diagrams[id];
  return (
    <figure className="my-5">
      <div className="overflow-x-auto rounded-xl border border-line bg-surface p-3 sm:p-4">
        <DiagramBoundary>{D ? <D /> : <div className="p-4 text-sm text-faint">Diagram “{id}” is not available.</div>}</DiagramBoundary>
      </div>
      {caption && (
        <figcaption className="mt-2 text-xs text-muted">
          <RichText text={caption} />
        </figcaption>
      )}
    </figure>
  );
}

export function BlockRenderer({ block }: { block: ContentBlock }) {
  switch (block.type) {
    case 'text':
      return (
        <p className="my-3 leading-7 text-ink/90">
          <RichText text={block.text} />
        </p>
      );
    case 'bullets':
      return (
        <ul className="my-3 space-y-1.5 pl-1">
          {block.items.map((item, i) => (
            <li key={i} className="flex gap-2.5 leading-7 text-ink/90">
              <span className="mt-[0.7rem] h-1.5 w-1.5 shrink-0 rounded-full bg-accent/70" aria-hidden />
              <span className="min-w-0">
                <RichText text={item} />
              </span>
            </li>
          ))}
        </ul>
      );
    case 'steps':
      return (
        <ol className="my-3 space-y-2">
          {block.items.map((item, i) => (
            <li key={i} className="flex gap-3 leading-7 text-ink/90">
              <span className="mt-1 h-5 w-5 shrink-0 rounded-full border border-line text-center text-[11px] leading-[1.15rem] text-muted tabular-nums">
                {i + 1}
              </span>
              <span className="min-w-0">
                <RichText text={item} />
              </span>
            </li>
          ))}
        </ol>
      );
    case 'code':
      return <CodeBlock example={block.example} />;
    case 'table':
      return <TableBlock table={block.table} />;
    case 'callout':
      return <Callout variant={block.variant} text={block.text} />;
    case 'flow':
      return <FlowChart steps={block.steps} title={block.title} direction={block.direction} caption={block.caption} />;
    case 'diagram':
      return <DiagramBlock id={block.diagramId} caption={block.caption} />;
  }
}
