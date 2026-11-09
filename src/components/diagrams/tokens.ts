/* Tone → class maps shared by the diagrams (literal strings so Tailwind's JIT picks them up). */

export type Tone = 'neutral' | 'accent' | 'info' | 'warn' | 'danger' | 'muted';

/** Full literal class strings (Tailwind JIT needs to see them verbatim). */
export const toneBox: Record<Tone, string> = {
  neutral: 'border-line bg-surface',
  accent: 'border-accent/50 bg-accent/10',
  info: 'border-info/50 bg-info/10',
  warn: 'border-warn/50 bg-warn/10',
  danger: 'border-danger/50 bg-danger/10',
  muted: 'border-dashed border-line bg-raised/60',
};

export const toneText: Record<Tone, string> = {
  neutral: 'text-ink',
  accent: 'text-accent',
  info: 'text-info',
  warn: 'text-warn',
  danger: 'text-danger',
  muted: 'text-muted',
};

export const toneDot: Record<Tone, string> = {
  neutral: 'bg-faint',
  accent: 'bg-accent',
  info: 'bg-info',
  warn: 'bg-warn',
  danger: 'bg-danger',
  muted: 'bg-muted',
};

export function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(' ');
}
