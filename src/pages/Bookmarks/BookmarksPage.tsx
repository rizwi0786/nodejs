import { Bookmark } from 'lucide-react';
import { EmptyState } from '../../components/common/EmptyState';
import { PageHeader } from '../../components/common/PageHeader';
import { LessonRow } from '../../components/lessons/LessonRow';
import { useProgress } from '../../context/ProgressContext';
import { lessonById } from '../../data/modules/curriculum';
import { paths } from '../../routes/paths';
import type { Lesson } from '../../types';

export default function BookmarksPage() {
  const { progress } = useProgress();
  const items = Object.entries(progress.bookmarks)
    .sort((a, b) => b[1].localeCompare(a[1]))
    .map(([id]) => lessonById.get(id))
    .filter((l): l is Lesson => Boolean(l));

  return (
    <>
      <PageHeader
        title="Bookmarks"
        description="Lessons you saved for later, newest first."
        crumbs={[{ label: 'Dashboard', to: paths.dashboard }, { label: 'Bookmarks' }]}
      />
      {items.length ? (
        <ul className="card divide-y divide-line overflow-hidden">
          {items.map((l) => (
            <LessonRow key={l.id} lesson={l} />
          ))}
        </ul>
      ) : (
        <EmptyState icon={Bookmark} title="No bookmarks yet">
          Use the bookmark icon on any lesson to save it here.
        </EmptyState>
      )}
    </>
  );
}
