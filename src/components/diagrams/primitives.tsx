import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp } from 'lucide-react';
import type { CSSProperties, ReactNode } from 'react';
import { cx, toneBox, toneDot, toneText, type Tone } from './tokens';

/* Shared building blocks for the diagram set. Everything uses theme tokens so it works in both themes. */

/**
 * Keyframes used by the diagrams. Injected once per diagram (duplicates are harmless) and only
 * defined when the user has not asked for reduced motion, so `animation` declarations become no-ops otherwise.
 */
const KEYFRAMES = `
@media (prefers-reduced-motion: no-preference) {
  @keyframes dg-travel-x { 0% { left: 0%; opacity: 0 } 10% { opacity: 1 } 90% { opacity: 1 } 100% { left: 100%; opacity: 0 } }
  @keyframes dg-travel-x-rev { 0% { left: 100%; opacity: 0 } 10% { opacity: 1 } 90% { opacity: 1 } 100% { left: 0%; opacity: 0 } }
  @keyframes dg-travel-y { 0% { top: 0%; opacity: 0 } 10% { opacity: 1 } 90% { opacity: 1 } 100% { top: 100%; opacity: 0 } }
  @keyframes dg-spot { 0% { opacity: 1 } 15% { opacity: 1 } 18% { opacity: 0 } 100% { opacity: 0 } }
  @keyframes dg-fill { 0% { transform: scaleX(0.1) } 60% { transform: scaleX(1) } 100% { transform: scaleX(1) } }
  @keyframes dg-dash { to { stroke-dashoffset: -16 } }
}
`;

export function DiagramStyles() {
  return <style>{KEYFRAMES}</style>;
}

/** Root wrapper: role="img" + label, consistent padding, theme-aware text colour. */
export function Frame({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div role="img" aria-label={label} className={cx('w-full min-w-0 text-ink', className)}>
      <DiagramStyles />
      {children}
    </div>
  );
}

/** A labelled box. */
export function Box({
  title,
  sub,
  tone = 'neutral',
  icon,
  className,
  children,
  mono,
}: {
  title?: ReactNode;
  sub?: ReactNode;
  tone?: Tone;
  icon?: ReactNode;
  className?: string;
  children?: ReactNode;
  mono?: boolean;
}) {
  return (
    <div className={cx('min-w-0 rounded-lg border px-3 py-2', toneBox[tone], className)}>
      {title != null && (
        <div className={cx('flex items-center gap-1.5 text-sm font-semibold leading-snug', mono && 'font-mono text-[13px]')}>
          {icon && <span className={cx('shrink-0', toneText[tone === 'neutral' ? 'muted' : tone])}>{icon}</span>}
          <span className="min-w-0 break-words">{title}</span>
        </div>
      )}
      {sub != null && <div className="mt-0.5 text-xs leading-snug text-muted">{sub}</div>}
      {children}
    </div>
  );
}

/** Small inline label. */
export function Tag({ children, tone = 'neutral', className }: { children: ReactNode; tone?: Tone; className?: string }) {
  return (
    <span
      className={cx(
        'inline-flex items-center rounded border px-1.5 py-px font-mono text-[11px] leading-4',
        tone === 'neutral' ? 'border-line bg-raised text-muted' : cx(toneBox[tone], toneText[tone]),
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Uppercase mini heading inside diagrams. */
export function Label({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx('text-[11px] font-semibold uppercase tracking-wide text-faint', className)}>{children}</div>;
}

/**
 * Arrow connector. `responsive` arrows point down on small screens and right from the `md` breakpoint,
 * matching layouts that are `flex-col md:flex-row`.
 */
export function Arrow({
  dir = 'responsive',
  label,
  tone = 'muted',
  className,
  bp = 'md',
}: {
  dir?: 'right' | 'down' | 'left' | 'up' | 'responsive';
  /** Breakpoint at which a responsive arrow turns from down to right. */
  bp?: 'md' | 'lg';
  label?: ReactNode;
  tone?: Tone;
  className?: string;
}) {
  const color = toneText[tone];
  const icon =
    dir === 'right' ? <ArrowRight size={16} /> :
    dir === 'left' ? <ArrowLeft size={16} /> :
    dir === 'up' ? <ArrowUp size={16} /> :
    dir === 'down' ? <ArrowDown size={16} /> : (
      <>
        <ArrowDown size={16} className={bp === 'lg' ? 'lg:hidden' : 'md:hidden'} />
        <ArrowRight size={16} className={bp === 'lg' ? 'hidden lg:block' : 'hidden md:block'} />
      </>
    );
  return (
    <div
      aria-hidden
      className={cx(
        'flex shrink-0 items-center justify-center gap-1 self-center',
        dir === 'responsive' ? (bp === 'lg' ? 'flex-row lg:flex-col' : 'flex-row md:flex-col') : dir === 'right' || dir === 'left' ? 'flex-col' : 'flex-row',
        color,
        className,
      )}
    >
      {icon}
      {label && <span className="whitespace-nowrap font-mono text-[10px] leading-3 text-muted">{label}</span>}
    </div>
  );
}

/** A horizontal track with a dot travelling along it (used to show data moving). */
export function Travel({
  tone = 'accent',
  duration = 2.4,
  delay = 0,
  reverse,
  className,
}: {
  tone?: Tone;
  duration?: number;
  delay?: number;
  reverse?: boolean;
  className?: string;
}) {
  const style: CSSProperties = {
    animation: `${reverse ? 'dg-travel-x-rev' : 'dg-travel-x'} ${duration}s linear ${delay}s infinite`,
    opacity: 0,
  };
  return (
    <span aria-hidden className={cx('pointer-events-none absolute inset-y-0 left-0 right-2 block', className)}>
      <span className={cx('absolute top-1/2 -ml-1 h-2 w-2 -translate-y-1/2 rounded-full', toneDot[tone])} style={style} />
    </span>
  );
}

/** Overlay that lights up for 1/n of a cycle — chain several with delays for a "moving highlight". */
export function Spotlight({ index, count, period, tone = 'accent' }: { index: number; count: number; period: number; tone?: Tone }) {
  const style: CSSProperties = {
    animation: `dg-spot ${period}s linear ${(index * period) / count}s infinite`,
    opacity: 0,
  };
  const ring: Record<Tone, string> = {
    neutral: 'ring-line',
    accent: 'ring-accent bg-accent/10',
    info: 'ring-info bg-info/10',
    warn: 'ring-warn bg-warn/10',
    danger: 'ring-danger bg-danger/10',
    muted: 'ring-muted',
  };
  return <span aria-hidden className={cx('pointer-events-none absolute inset-0 rounded-lg ring-2', ring[tone])} style={style} />;
}

/** Legend row. */
export function Legend({ items }: { items: Array<{ tone: Tone; label: string; dashed?: boolean }> }) {
  return (
    <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted">
      {items.map((it) => (
        <span key={it.label} className="inline-flex items-center gap-1.5">
          <span className={cx('h-2.5 w-2.5 rounded-sm border', toneBox[it.tone], it.dashed && 'border-dashed')} />
          {it.label}
        </span>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------------------------------------ */
/* Sequence diagram: lanes (columns) with lifelines and messages between them. Fits at 360px.        */
/* ------------------------------------------------------------------------------------------------ */

export type SeqItem =
  | { kind: 'msg'; from: number; to: number; label: ReactNode; detail?: ReactNode; tone?: Tone; dashed?: boolean; animate?: boolean }
  | { kind: 'note'; lane: number; span?: number; text: ReactNode; tone?: Tone }
  | { kind: 'divider'; text: ReactNode };

export function Sequence({
  lanes,
  items,
}: {
  lanes: Array<{ name: ReactNode; sub?: ReactNode; icon?: ReactNode; tone?: Tone }>;
  items: SeqItem[];
}) {
  const n = lanes.length;
  const cols: CSSProperties = { gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` };
  return (
    <div className="relative">
      {/* lifelines */}
      <div aria-hidden className="pointer-events-none absolute inset-0 grid" style={cols}>
        {lanes.map((_, i) => (
          <div key={i} className="flex justify-center">
            <div className="w-px border-l border-dashed border-line" />
          </div>
        ))}
      </div>
      <div className="relative grid gap-x-1 gap-y-1.5" style={cols}>
        {lanes.map((l, i) => (
          <div
            key={i}
            className={cx('mb-1 flex min-w-0 flex-col items-center rounded-lg border px-1 py-1.5 text-center', toneBox[l.tone ?? 'neutral'])}
          >
            <div className="flex items-center gap-1 text-[12px] font-semibold leading-tight sm:text-sm">
              {l.icon && <span className={cx('hidden shrink-0 sm:inline', toneText[l.tone && l.tone !== 'neutral' ? l.tone : 'muted'])}>{l.icon}</span>}
              <span className="min-w-0 break-words">{l.name}</span>
            </div>
            {l.sub && <div className="mt-0.5 text-[10px] leading-tight text-muted sm:text-[11px]">{l.sub}</div>}
          </div>
        ))}
        {items.map((it, idx) => {
          if (it.kind === 'divider') {
            return (
              <div key={idx} className="my-1 flex items-center gap-2" style={{ gridColumn: `1 / ${n + 1}` }}>
                <div className="h-px flex-1 bg-line" />
                <span className="rounded bg-bg px-1.5 text-[11px] font-medium text-faint">{it.text}</span>
                <div className="h-px flex-1 bg-line" />
              </div>
            );
          }
          if (it.kind === 'note') {
            const span = it.span ?? 1;
            return (
              <div
                key={idx}
                className={cx('rounded-md border px-1.5 py-1 text-center text-[11px] leading-snug text-muted', toneBox[it.tone ?? 'muted'])}
                style={{ gridColumn: `${it.lane + 1} / span ${span}` }}
              >
                {it.text}
              </div>
            );
          }
          const lo = Math.min(it.from, it.to);
          const hi = Math.max(it.from, it.to);
          const k = hi - lo + 1;
          const rightward = it.to > it.from;
          const tone = it.tone ?? 'neutral';
          const lineColor = tone === 'neutral' ? 'text-muted' : toneText[tone];
          return (
            <div
              key={idx}
              className="min-w-0"
              style={{ gridColumn: `${lo + 1} / ${hi + 2}`, paddingLeft: `${50 / k}%`, paddingRight: `${50 / k}%` }}
            >
              <div className="px-1 text-center text-[11px] leading-snug sm:text-xs">
                <span className="font-medium text-ink">{it.label}</span>
                {it.detail && <div className="break-words font-mono text-[10px] leading-snug text-muted sm:text-[11px]">{it.detail}</div>}
              </div>
              <div className={cx('relative mt-0.5 flex h-3 items-center', lineColor)} aria-hidden>
                {!rightward && <span className="h-0 w-0 border-y-[5px] border-r-[7px] border-y-transparent border-r-current" />}
                <span className={cx('flex-1 border-t-2', it.dashed ? 'border-dashed' : 'border-solid', 'border-current')} />
                {rightward && <span className="h-0 w-0 border-y-[5px] border-l-[7px] border-y-transparent border-l-current" />}
                {it.animate && <Travel tone={tone === 'neutral' ? 'accent' : tone} reverse={!rightward} duration={2.2} />}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** A responsive row of nodes joined by arrows: stacks vertically below md. */
export function FlowRow({ children, className, bp = 'md' }: { children: ReactNode; className?: string; bp?: 'md' | 'lg' }) {
  const layout = bp === 'lg' ? 'lg:flex-row lg:items-center lg:gap-2' : 'md:flex-row md:items-center md:gap-2';
  return <div className={cx('flex flex-col items-stretch gap-1.5', layout, className)}>{children}</div>;
}
