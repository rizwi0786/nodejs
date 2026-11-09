import { BedDouble, Code2, Coffee, FileText, Layers3, MessagesSquare, Network, Stethoscope, Target, type LucideIcon } from 'lucide-react';
import type { SprintBlockKind } from '../data/sprint/plan';

export const kindIcon: Record<SprintBlockKind, LucideIcon> = {
  diagnostic: Stethoscope,
  study: Layers3,
  coding: Code2,
  design: Network,
  break: Coffee,
  sleep: BedDouble,
  weak: Target,
  mock: MessagesSquare,
  final: FileText,
};

export const fmtOffset = (min: number) => `${Math.floor(min / 60)}:${String(Math.round(min % 60)).padStart(2, '0')}`;
export const fmtDuration = (min: number) => (min >= 60 ? `${Math.floor(min / 60)} h${min % 60 ? ` ${min % 60} min` : ''}` : `${min} min`);
export const clockAt = (startedAt: string, offsetMin: number) =>
  new Date(new Date(startedAt).getTime() + offsetMin * 60000).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', weekday: 'short' });

