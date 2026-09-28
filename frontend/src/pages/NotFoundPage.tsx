import { Link } from 'react-router-dom';

export default function NotFoundPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 px-4 text-center">
      <p className="text-5xl font-bold tracking-tight text-ink">404</p>
      <p className="text-sm text-ink-2">This page does not exist.</p>
      <Link to="/" className="text-sm font-medium text-revenue underline">
        Back to overview
      </Link>
    </div>
  );
}
