import { Compass } from 'lucide-react';
import { Link } from 'react-router-dom';
import { EmptyState } from '../components/common/EmptyState';

export default function NotFoundPage() {
  return (
    <div className="py-16">
      <EmptyState icon={Compass} title="Page not found">
        That page does not exist.{' '}
        <Link to="/" className="text-accent hover:underline">
          Back to the dashboard
        </Link>
      </EmptyState>
    </div>
  );
}
