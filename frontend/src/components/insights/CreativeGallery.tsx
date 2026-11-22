import { useState } from 'react';
import { getAdCreative, mergeCreative } from '@/lib/creatives';
import type { InsightCreative } from '@/types/fbInsights';
import { AdLink, cpaTone, int, Pill, roasTone, times, usd, VERDICT_TONE } from './parts';

const CLOUDINARY_VIDEO = /^(https?:\/\/res\.cloudinary\.com\/[^/]+\/video\/upload\/)(.+?)(\.(mp4|mov|webm|m4v|avi|mkv))?(\?.*)?$/i;

/** A link to a video file rather than a picture (some ads store the video in the image field too). */
const isVideoUrl = (url: string) => /\/video\/upload\//i.test(url) || /\.(mp4|mov|webm|m4v|avi|mkv)(\?.*)?$/i.test(url);

/**
 * A Cloudinary video delivered through a transformation: `so_1,w_480` + .jpg gives its first
 * frame as a picture; `vc_h264` + .mp4 re-encodes it so every browser can play it (.mov files
 * are often HEVC / ProRes, which Chrome and Firefox can't play as uploaded).
 */
function cloudinaryVideo(url: string | null, transform: string, ext: string): string | null {
  const m = url ? CLOUDINARY_VIDEO.exec(url) : null;
  return m ? `${m[1]}${transform}/${m[2]}.${ext}` : null;
}

/** Creative links: the Ad groups page override wins, else frontend/creatives.json (same rule as the ad page). */
function mediaOf(c: InsightCreative) {
  const m = mergeCreative(getAdCreative(c.ad), c.links);
  const image = m.image_url && !isVideoUrl(m.image_url) ? m.image_url : null;
  // a video stored only in the image field still counts as the video
  const video = m.video_url ?? (m.image_url && isVideoUrl(m.image_url) ? m.image_url : null);
  return {
    image,
    video,
    play: video ? (cloudinaryVideo(video, 'vc_h264,q_auto', 'mp4') ?? video) : null,
    poster: image ?? cloudinaryVideo(video, 'so_1,w_480', 'jpg'),
  };
}

function Thumb({ c }: { c: InsightCreative }) {
  const { video, play, poster } = mediaOf(c);
  const [playing, setPlaying] = useState(false);
  const [posterFailed, setPosterFailed] = useState(false);
  const [videoFailed, setVideoFailed] = useState(false);
  // the re-encoded .mp4 first; if Cloudinary can't serve it, the file as uploaded
  const [original, setOriginal] = useState(false);
  const src = original ? video : play;
  const box = 'aspect-[4/5] w-full rounded-lg bg-canvas object-contain';

  if (play && !videoFailed && (playing || !poster || posterFailed)) {
    // playing, or no still to show: the browser loads only the first frame until ▶ is pressed
    return (
      <video
        key={src}
        src={src ?? undefined}
        poster={poster && !posterFailed ? poster : undefined}
        controls
        autoPlay={playing}
        preload="metadata"
        playsInline
        onError={() => (!original && video && video !== play ? setOriginal(true) : setVideoFailed(true))}
        className={box}
        aria-label={`Video creative for ${c.ad}`}
      />
    );
  }
  if (poster && !posterFailed) {
    return (
      <div className="relative">
        <img src={poster} alt={`Creative for ${c.ad}`} loading="lazy" onError={() => setPosterFailed(true)} className={box} />
        {play && !videoFailed && (
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
  return (
    <div className={`hatch flex flex-col items-center justify-center gap-2 border border-line ${box}`}>
      <span className="rounded bg-surface/90 px-2 py-1 text-center text-xs text-ink-3">{video ? 'This video can’t play here' : poster ? 'The picture could not be loaded' : 'No creative stored'}</span>
      {(video || poster) && (
        <a href={video ?? poster ?? undefined} target="_blank" rel="noopener noreferrer" className="rounded bg-surface/90 px-2 py-1 text-xs font-semibold text-revenue hover:underline">
          Open the file ↗
        </a>
      )}
    </div>
  );
}

/** One card: a creative, plus the same creative under other capitals ("Ad_static_1" / "ad_static_1"). */
export interface CreativeCard {
  main: InsightCreative;
  twins: InsightCreative[];
  cost: number;
  purchases: number;
  revenue: number;
  add_to_carts: number;
  cpa: number | null;
  roas: number | null;
  live: boolean;
  verdict: string;
}

const ED = ['DirectMax (ED)', 'MEDVi QUAD (ED)'];
/** Same rules as the backend's verdict (fbInsights.service.ts), for the merged numbers. */
function verdictOf(product: string, cost: number, pur: number, atc: number, be: number): string {
  if (!ED.includes(product)) return 'No purchase data yet';
  const cpa = pur ? cost / pur : Infinity;
  if (pur >= 3 && cpa <= be) return 'Scale';
  if (pur >= 1 && cpa <= be * 1.25) return 'Keep & watch';
  if (cost >= 2 * be && pur === 0) return 'Cut';
  if (pur >= 1 && cpa > 2 * be) return 'Cut';
  if (pur === 0 && atc >= 2 && cost / atc <= be / 4) return 'Promising';
  if (cost < be) return 'Still testing';
  return pur >= 1 ? 'Over break-even' : 'Near cut';
}

/**
 * One card per creative. Names that differ only in capital letters are merged when they show the
 * same picture / video (or one of them has none), with their numbers added up; names with different
 * media stay separate cards, since the data treats them as different ads.
 */
export function mergeTwins(creatives: InsightCreative[], be: number): CreativeCard[] {
  const groups: { key: string; media: string | null; items: InsightCreative[] }[] = [];
  for (const c of [...creatives].sort((a, b) => b.cost - a.cost)) {
    const key = c.ad.toLowerCase();
    const m = mediaOf(c);
    const media = m.video ?? m.image;
    const g = groups.find((x) => x.key === key && (!x.media || !media || x.media === media));
    if (g) {
      g.items.push(c);
      g.media ??= media;
    } else groups.push({ key, media, items: [c] });
  }
  return groups.map(({ items }) => {
    const [main, ...twins] = items as [InsightCreative, ...InsightCreative[]];
    if (twins.length === 0) {
      return {
        main,
        twins,
        cost: main.cost,
        purchases: main.purchases,
        revenue: main.revenue,
        add_to_carts: main.add_to_carts,
        cpa: main.cpa,
        roas: main.roas,
        live: main.live_last7,
        verdict: main.verdict,
      };
    }
    const sum = (k: 'cost' | 'purchases' | 'revenue' | 'add_to_carts') => items.reduce((s, c) => s + c[k], 0);
    const cost = sum('cost');
    const purchases = sum('purchases');
    const revenue = sum('revenue');
    const add_to_carts = sum('add_to_carts');
    return {
      main,
      twins,
      cost,
      purchases,
      revenue,
      add_to_carts,
      cpa: purchases ? cost / purchases : null,
      roas: cost ? revenue / cost : null,
      live: items.some((c) => c.live_last7),
      verdict: verdictOf(main.product, cost, purchases, add_to_carts, be),
    };
  });
}

/** Creatives as cards (picture or video, name, verdict, key numbers), biggest spend first. */
export default function CreativeGallery({ creatives, breakEven, empty }: { creatives: InsightCreative[]; breakEven: number; empty: string }) {
  const cards = mergeTwins(creatives, breakEven);
  if (cards.length === 0) return <p className="py-6 text-sm text-ink-3">{empty}</p>;
  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-3">
      {cards.map((k) => (
        <li key={k.main.ad} className="flex flex-col gap-2 rounded-xl border border-line bg-surface-2/40 p-2.5">
          <Thumb c={k.main} />
          <div className="min-w-0 px-0.5">
            <p className="truncate text-sm" title={k.main.ad}>
              <AdLink name={k.main.ad} />
            </p>
            {k.twins.length > 0 && (
              <p className="truncate text-[11px] text-ink-3" title={`Also ran as ${k.twins.map((t) => t.ad).join(', ')}; numbers are added up`}>
                + also ran as{' '}
                {k.twins.map((t, i) => (
                  <span key={t.ad}>
                    {i > 0 && ', '}
                    <AdLink name={t.ad} />
                  </span>
                ))}
              </p>
            )}
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              <Pill tone={VERDICT_TONE[k.verdict]}>{k.verdict}</Pill>
              {k.live && <span className="text-[11px] font-semibold text-revenue">● running</span>}
            </div>
            <dl className="mt-2 grid grid-cols-2 gap-x-2 gap-y-0.5 text-xs tabular-nums">
              <dt className="text-ink-3">Spent</dt>
              <dd className="text-right text-ink">{usd(k.cost)}</dd>
              <dt className="text-ink-3">Sales</dt>
              <dd className="text-right text-ink">{int(k.purchases)}</dd>
              <dt className="text-ink-3">$/sale</dt>
              <dd className={`text-right ${cpaTone(k.cpa, breakEven) || 'text-ink'}`}>{usd(k.cpa)}</dd>
              <dt className="text-ink-3">Return</dt>
              <dd className={`text-right ${roasTone(k.roas, k.purchases) || 'text-ink'}`}>{times(k.roas)}</dd>
            </dl>
          </div>
        </li>
      ))}
    </ul>
  );
}
