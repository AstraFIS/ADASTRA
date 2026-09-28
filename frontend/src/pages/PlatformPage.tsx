import { Link, useParams } from 'react-router-dom';
import { PLATFORM_ICONS, type PlatformId } from '@/types/platforms';

const NAMES: Record<PlatformId, string> = {
  facebook: 'Facebook',
  google: 'Google',
  microsoft: 'Microsoft (Bing)',
};

function isPlatformId(value: string | undefined): value is PlatformId {
  return value === 'facebook' || value === 'google' || value === 'microsoft';
}

export default function PlatformPage() {
  const { slug } = useParams();

  if (!isPlatformId(slug)) {
    return (
      <div className="rounded-xl border border-line bg-surface p-7">
        <p className="font-semibold text-ink">Unknown platform</p>
        <Link to="/" className="mt-3 inline-block text-sm text-revenue underline">
          Back to overview
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Link to="/" className="text-sm text-ink-2 hover:text-ink">
        ← All Platforms
      </Link>
      <h1 className="flex items-center gap-3 text-4xl font-extrabold tracking-tight text-ink">
        <span aria-hidden="true">{PLATFORM_ICONS[slug]}</span>
        {NAMES[slug]} Dashboard
      </h1>
      <div className="hatch flex h-64 items-center justify-center rounded-xl border border-line">
        <span className="rounded bg-surface/90 px-3 py-1 text-sm text-ink-3">
          Full {NAMES[slug]} dashboard coming next
        </span>
      </div>
    </div>
  );
}
