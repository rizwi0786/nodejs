import { lazy, Suspense } from 'react';
import { Route, Routes } from 'react-router-dom';
import { AppLayout } from '../components/layout/AppLayout';
import DashboardPage from '../pages/Dashboard/DashboardPage';
import NotFoundPage from '../pages/NotFoundPage';

// Secondary pages are code-split so the dashboard loads fast.
const CourseOverviewPage = lazy(() => import('../pages/Course/CourseOverviewPage'));
const RoadmapPage = lazy(() => import('../pages/Course/RoadmapPage'));
const ModulesPage = lazy(() => import('../pages/Course/ModulesPage'));
const ModulePage = lazy(() => import('../pages/Course/ModulePage'));
const LessonPage = lazy(() => import('../pages/Lesson/LessonPage'));
const InterviewPage = lazy(() => import('../pages/Interview/InterviewPage'));
const SprintPage = lazy(() => import('../pages/Sprint/SprintPage'));
const SprintBlockPage = lazy(() => import('../pages/Sprint/SprintBlockPage'));
const PracticePage = lazy(() => import('../pages/Practice/PracticePage'));
const ProjectsPage = lazy(() => import('../pages/Projects/ProjectsPage'));
const ProjectPage = lazy(() => import('../pages/Projects/ProjectPage'));
const ChallengePage = lazy(() => import('../pages/Practice/ChallengePage'));
const BookmarksPage = lazy(() => import('../pages/Bookmarks/BookmarksPage'));
const RevisionPage = lazy(() => import('../pages/Revision/RevisionPage'));
const AnalyticsPage = lazy(() => import('../pages/Analytics/AnalyticsPage'));

function Loading() {
  return <div className="py-20 text-center text-sm text-faint">Loading…</div>;
}

export function AppRoutes() {
  return (
    <Suspense fallback={<Loading />}>
      <Routes>
        <Route element={<AppLayout />}>
          <Route index element={<DashboardPage />} />
          <Route path="overview" element={<CourseOverviewPage />} />
          <Route path="roadmap" element={<RoadmapPage />} />
          <Route path="modules" element={<ModulesPage />} />
          <Route path="modules/:moduleSlug" element={<ModulePage />} />
          <Route path="modules/:moduleSlug/:lessonSlug" element={<LessonPage />} />
          <Route path="interview" element={<InterviewPage />} />
          <Route path="sprint" element={<SprintPage />} />
          <Route path="sprint/:blockId" element={<SprintBlockPage />} />
          <Route path="practice" element={<PracticePage />} />
          <Route path="practice/challenges/:id" element={<ChallengePage />} />
          <Route path="projects" element={<ProjectsPage />} />
          <Route path="projects/:id" element={<ProjectPage />} />
          <Route path="bookmarks" element={<BookmarksPage />} />
          <Route path="revision" element={<RevisionPage />} />
          <Route path="analytics" element={<AnalyticsPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </Suspense>
  );
}
