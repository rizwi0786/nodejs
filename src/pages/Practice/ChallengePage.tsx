import { ArrowLeft, ArrowRight } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { PageHeader } from '../../components/common/PageHeader';
import { ChallengeRunner } from '../../components/quizzes/ChallengeRunner';
import { useBanks } from '../../hooks/useContent';
import { paths } from '../../routes/paths';
import NotFoundPage from '../NotFoundPage';

export default function ChallengePage() {
  const { id } = useParams();
  const banks = useBanks();
  if (!banks) return <div className="py-16 text-center text-sm text-faint">Loading challenge…</div>;
  const i = banks.challenges.findIndex((c) => c.id === id);
  if (i < 0) return <NotFoundPage />;
  const ch = banks.challenges[i];
  const prev = banks.challenges[i - 1];
  const next = banks.challenges[i + 1];

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title={ch.title}
        crumbs={[
          { label: 'Coding Practice', to: paths.practice },
          { label: 'Challenges', to: `${paths.practice}?tab=challenges` },
          { label: ch.title },
        ]}
      />
      {/* key resets the editor state when moving between challenges */}
      <ChallengeRunner key={ch.id} challenge={ch} />
      <nav className="mt-8 flex justify-between gap-3 border-t border-line pt-4 text-sm" aria-label="Challenge navigation">
        {prev ? (
          <Link to={paths.challenge(prev.id)} className="flex min-w-0 items-center gap-1.5 text-muted hover:text-ink">
            <ArrowLeft size={15} className="shrink-0" /> <span className="truncate">{prev.title}</span>
          </Link>
        ) : (
          <span />
        )}
        {next && (
          <Link to={paths.challenge(next.id)} className="flex min-w-0 items-center gap-1.5 text-muted hover:text-ink">
            <span className="truncate">{next.title}</span> <ArrowRight size={15} className="shrink-0" />
          </Link>
        )}
      </nav>
    </div>
  );
}
