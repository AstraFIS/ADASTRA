import { useState } from 'react';
import { getAdCreative, mergeCreative } from '@/lib/creatives';
import type { InsightCreative } from '@/types/fbInsights';
import { AdLink, cpaTone, int, Pill, roasTone, times, usd, VERDICT_TONE } from './parts';

/**
 * A Cloudinary video's first frame as an image (…/video/upload/so_1,w_480/<id>.jpg), so a
 * grid of videos shows stills instead of loading every video file.
 */
function videoPoster(url: string | null): string | null {
  if (!url || !/res\.cloudinary\.com\/[^/]+\/video\/upload\//i.test(url)) return null;
  return url.replace('/video/upload/', '/video/upload/so_1,w_480/').replace(/\.(mp4|mov|webm|m4v)(\?.*)?$/i, '.jpg');
}

/** Creative links: the Ad groups page override wins, else frontend/creatives.json (same rule as the ad page). */
function mediaOf(c: InsightCreative) {
  const m = mergeCreative(getAdCreative(c.ad), c.links);
  return { image: m.image_url, video: m.video_url, poster: m.image_url ?? videoPoster(m.video_url) };
}

function Thumb({ c }: { c: InsightCreative }) {
  const { image, video, poster } = mediaOf(c);
  const [playing, setPlaying] = useState(false);
  const [failed, setFailed] = useState(false);
  const box = 'aspect-[4/5] w-full rounded-lg bg-canvas object-contain';

  if (video && playing) {
    return <video src={video} poster={poster ?? undefined} controls autoPlay playsInline className={box} aria-label={`Video creative for ${c.ad}`} />;
  }
  if ((poster || image) && !failed) {
    return (
      <div className="relative">
        <img src={poster ?? image ?? ''} alt={`Creative for ${c.ad}`} loading="lazy" onError={() => setFailed(true)} className={box} />
        {video && (
          <button
            type="button"
            onClick={() => setPlaying(true)}
            aria-label={`Play the video for ${c.ad}`}
            className="absolute inset-0 flex items-center justify-center rounded-lg bg-canvas/10 transition-colors hover:bg-canvas/30"
          >
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-canvas/80 text-lg text-ink ring-1 ring-line-strong">▶</span>
          </button>
        )}
      </div>
    );
  }
  if (video && !failed) {
    // a video with no still: let the browser fetch only its first frame
    return <video src={video} controls preload="metadata" playsInline onError={() => setFailed(true)} className={box} aria-label={`Video creative for ${c.ad}`} />;
  }
  return (
    <div className={`hatch flex items-center justify-center border border-line ${box}`}>
      <span className="rounded bg-surface/90 px-2 py-1 text-center text-xs text-ink-3">{failed ? 'Could not load the creative' : 'No creative stored'}</span>
    </div>
  );
}

/** Creatives as cards (picture or video, name, verdict, key numbers), biggest spend first. */
export default function CreativeGallery({ creatives, breakEven, empty }: { creatives: InsightCreative[]; breakEven: number; empty: string }) {
  if (creatives.length === 0) return <p className="py-6 text-sm text-ink-3">{empty}</p>;
  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-2 2xl:grid-cols-3">
      {creatives.map((c) => (
        <li key={c.ad} className="flex flex-col gap-2 rounded-xl border border-line bg-surface-2/40 p-2.5">
          <Thumb c={c} />
          <div className="min-w-0 px-0.5">
            <p className="truncate text-sm" title={c.ad}>
              <AdLink name={c.ad} />
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              <Pill tone={VERDICT_TONE[c.verdict]}>{c.verdict}</Pill>
              {c.live_last7 && <span className="text-[11px] font-semibold text-revenue">● running</span>}
            </div>
            <dl className="mt-2 grid grid-cols-2 gap-x-2 gap-y-0.5 text-xs tabular-nums">
              <dt className="text-ink-3">Spent</dt>
              <dd className="text-right text-ink">{usd(c.cost)}</dd>
              <dt className="text-ink-3">Sales</dt>
              <dd className="text-right text-ink">{int(c.purchases)}</dd>
              <dt className="text-ink-3">$/sale</dt>
              <dd className={`text-right ${cpaTone(c.cpa, breakEven) || 'text-ink'}`}>{usd(c.cpa)}</dd>
              <dt className="text-ink-3">Return</dt>
              <dd className={`text-right ${roasTone(c.roas, c.purchases) || 'text-ink'}`}>{times(c.roas)}</dd>
            </dl>
          </div>
        </li>
      ))}
    </ul>
  );
}
