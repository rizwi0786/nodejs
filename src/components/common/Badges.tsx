import { Flame, Gauge } from 'lucide-react';
import type { Difficulty, Importance } from '../../types';

const diffStyle: Record<Difficulty, string> = {
  beginner: 'text-accent border-accent/40',
  intermediate: 'text-info border-info/40',
  advanced: 'text-warn border-warn/40',
};

export function DifficultyBadge({ level }: { level: Difficulty }) {
  return (
    <span className={`chip capitalize ${diffStyle[level]}`}>
      <Gauge size={12} aria-hidden />
      {level}
    </span>
  );
}

const impLabel: Record<Importance, string> = {
  low: 'Low interview weight',
  medium: 'Asked sometimes',
  high: 'Frequently asked',
  critical: 'Must know',
};

export function ImportanceBadge({ level }: { level: Importance }) {
  if (level === 'low' || level === 'medium') return null;
  return (
    <span className={`chip ${level === 'critical' ? 'text-danger border-danger/40' : 'text-warn border-warn/40'}`}>
      <Flame size={12} aria-hidden />
      {impLabel[level]}
    </span>
  );
}
