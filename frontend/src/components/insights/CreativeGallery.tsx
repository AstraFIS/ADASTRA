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
      <span className="rounded bg-surface/90 px-2 py-1 text-center text-xs text-ink-3">{video ? 'This video can’t play here' : 'No creative stored'}</span>
      {video && (
        <a href={video} target="_blank" rel="noopener noreferrer" className="rounded bg-surface/90 px-2 py-1 text-xs font-semibold text-revenue hover:underline">
          Open the file ↗
        </a>
      )}
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
