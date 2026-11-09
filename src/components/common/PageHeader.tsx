import type { ReactNode } from 'react';
import { Breadcrumbs, type Crumb } from '../navigation/Breadcrumbs';

interface Props {
  title: string;
  description?: ReactNode;
  crumbs?: Crumb[];
  actions?: ReactNode;
  meta?: ReactNode;
}

export function PageHeader({ title, description, crumbs, actions, meta }: Props) {
  return (
    <header className="mb-6">
      {crumbs && <Breadcrumbs items={crumbs} />}
      <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{title}</h1>
          {description && <p className="mt-1 max-w-prose text-sm text-muted">{description}</p>}
          {meta && <div className="mt-3 flex flex-wrap items-center gap-2">{meta}</div>}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </div>
    </header>
  );
}
