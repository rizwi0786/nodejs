import {
  LayoutDashboard, BookOpenText, Map, Layers, MessagesSquare, Code2, FolderKanban, Bookmark, RotateCcw, BarChart3, Timer,
  type LucideIcon,
} from 'lucide-react';
import { paths } from './paths';

export interface NavItem {
  label: string;
  to: string;
  icon: LucideIcon;
}

export const navGroups: { title?: string; items: NavItem[] }[] = [
  {
    items: [
      { label: 'Dashboard', to: paths.dashboard, icon: LayoutDashboard },
      { label: 'Course Overview', to: paths.overview, icon: BookOpenText },
      { label: 'Learning Roadmap', to: paths.roadmap, icon: Map },
      { label: 'Modules', to: paths.modules, icon: Layers },
    ],
  },
  {
    title: 'Practice',
    items: [
      { label: '24-Hour Sprint', to: paths.sprint, icon: Timer },
      { label: 'Interview Preparation', to: paths.interview, icon: MessagesSquare },
      { label: 'Coding Practice', to: paths.practice, icon: Code2 },
      { label: 'Projects', to: paths.projects, icon: FolderKanban },
    ],
  },
  {
    title: 'You',
    items: [
      { label: 'Bookmarks', to: paths.bookmarks, icon: Bookmark },
      { label: 'Revision Center', to: paths.revision, icon: RotateCcw },
      { label: 'Progress & Analytics', to: paths.analytics, icon: BarChart3 },
    ],
  },
];
