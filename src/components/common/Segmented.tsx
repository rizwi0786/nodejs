interface Option<T extends string> {
  value: T;
  label: string;
  count?: number;
}

interface Props<T extends string> {
  label: string; // accessible group name
  value: T;
  options: Option<T>[];
  onChange: (v: T) => void;
}

/** Compact segmented filter control (radio group semantics). */
export function Segmented<T extends string>({ label, value, options, onChange }: Props<T>) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex flex-wrap rounded-lg border border-line bg-surface p-0.5">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
              active ? 'bg-raised text-ink' : 'text-muted hover:text-ink'
            }`}
          >
            {o.label}
            {o.count !== undefined && <span className="text-faint tabular-nums">{o.count}</span>}
          </button>
        );
      })}
    </div>
  );
}
