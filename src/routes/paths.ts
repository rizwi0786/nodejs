import type { CourseModule, Lesson } from '../types';
import { moduleById } from '../data/modules/curriculum';

export const paths = {
  dashboard: '/',
  overview: '/overview',
  roadmap: '/roadmap',
  modules: '/modules',
  module: (m: CourseModule) => `/modules/${m.slug}`,
  lesson: (l: Lesson) => `/modules/${moduleById.get(l.moduleId)!.slug}/${l.slug}`,
  interview: '/interview',
  sprint: '/sprint',
  sprintBlock: (id: string) => `/sprint/${id}`,
  practice: '/practice',
  challenge: (id: string) => `/practice/challenges/${id}`,
  projects: '/projects',
  project: (id: string) => `/projects/${id}`,
  bookmarks: '/bookmarks',
  revision: '/revision',
  analytics: '/analytics',
};
