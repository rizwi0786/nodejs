import { Fragment, type ReactNode } from 'react';

/**
 * Minimal inline formatting for authored content:
 * `code`, **bold**, *italic*. Everything else is plain text (no HTML injection).
 */
export function RichText({ text }: { text: string }) {
  return <>{parse(text)}</>;
}

const TOKEN_SOURCE = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\*[^*\s][^*]*\*)/.source;

function parse(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  // A fresh regex per call: parse() recurses for **bold**, so a shared /g regex's lastIndex would be clobbered.
  const TOKEN = new RegExp(TOKEN_SOURCE, 'g');
  while ((m = TOKEN.exec(text))) {
    if (m.index > last) out.push(<Fragment key={i++}>{text.slice(last, m.index)}</Fragment>);
    const tok = m[0];
    if (m[1]) {
      out.push(
        <code key={i++} className="break-words rounded bg-raised px-1 py-px font-mono text-[0.88em] text-ink [overflow-wrap:anywhere]">
          {tok.slice(1, -1)}
        </code>,
      );
    } else if (m[2]) {
      out.push(
        <strong key={i++} className="font-semibold text-ink">
          {parse(tok.slice(2, -2))}
        </strong>,
      );
    } else {
      out.push(<em key={i++}>{tok.slice(1, -1)}</em>);
    }
    last = m.index + tok.length;
  }
  if (last < text.length) out.push(<Fragment key={i++}>{text.slice(last)}</Fragment>);
  return out;
}
