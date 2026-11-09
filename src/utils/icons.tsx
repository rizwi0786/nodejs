import {
  Boxes, Braces, Cpu, Database, FlaskConical, Globe, Hexagon, KeyRound, Network, Package, Rocket, Route,
  ShieldCheck, Waves, Workflow, BookOpen, type LucideIcon,
} from 'lucide-react';

// Course data stores icon *names*; the UI resolves them here so data never imports React.
const map: Record<string, LucideIcon> = {
  Boxes, Braces, Cpu, Database, FlaskConical, Globe, Hexagon, KeyRound, Network, Package, Rocket, Route,
  ShieldCheck, Waves, Workflow,
};

export function moduleIcon(name: string): LucideIcon {
  return map[name] ?? BookOpen;
}
