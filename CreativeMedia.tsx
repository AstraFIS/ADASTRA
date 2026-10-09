import { useState } from 'react';
import type { AdCreative } from '@/lib/creatives';

const pill = 'inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold';
// keeps its own aspect ratio; a tall (9:16) creative is capped so it does not stretch the card
const media = 'mx-auto block max-h-[380px] w-auto max-w-full rounded-lg bg-canvas';

export function CreativeMedia({ adName, creative }: { adName: string; creative: AdCreative }) {
  // a stored URL can still be dead; fall back to the placeholder instead of a broken image
  const [failed, setFailed] = useState(false);

  if (creative.video_url && !failed) {
    return (
      <video
        controls
        preload="metadata"
        poster={creative.image_url ?? undefined}
        src={creative.video_url}
        onError={() => setFailed(true)}
        aria-label={`Video creative for ${adName}`}
        className={media}
      />
    );
  }
  if (creative.image_url && !failed) {
    return (
      <img
        src={creative.image_url}
        alt={`Creative for ${adName}`}
        onError={() => setFailed(true)}
        className={media}
      />
    );
  }
  return (
    <div className="hatch flex aspect-square w-full items-center justify-center rounded-lg border border-line">
      <span className="rounded bg-surface/90 px-3 py-1 text-sm text-ink-3">
        {failed ? 'The creative could not be loaded' : 'No creative stored for this ad yet'}
      </span>
    </div>
  );
}

export function LandingPageLink({ url }: { url: string | null }) {
  if (!url) {
    return (
      <span
        aria-disabled="true"
        title="No landing page URL is stored for this ad yet"
        className={`${pill} cursor-not-allowed border-line bg-surface-2 text-ink-3`}
      >
        <span aria-hidden="true">🔗</span>
        Open landing page
      </span>
    );
  }
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className={`${pill} border-revenue/40 bg-revenue/10 text-revenue transition-colors hover:bg-revenue/20`}
    >
      <span aria-hidden="true">🔗</span>
      Open landing page
      <span aria-hidden="true">↗</span>
    </a>
  );
}
