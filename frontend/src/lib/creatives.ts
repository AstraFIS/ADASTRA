import creativesData from '../../creatives.json';

/** Shape of one record in frontend/creatives.json. */
interface CreativeRecord {
  ad: string | number;
  type?: string | null;
  image?: string | null; // the static creative, or a video's thumbnail
  video?: string | null;
  landing?: string | null;
}

/** An ad's creative assets; null when creatives.json has none. */
export interface AdCreative {
  image_url: string | null;
  video_url: string | null;
  landing_page_url: string | null;
}

const NO_CREATIVE: AdCreative = { image_url: null, video_url: null, landing_page_url: null };

const nameKey = (name: unknown) => String(name ?? '').trim();

// Only http(s) links are passed on, since the card uses them as media sources and an href.
const webUrl = (value: unknown): string | null =>
  typeof value === 'string' && /^https?:\/\//i.test(value.trim()) ? value.trim() : null;

// Index by exact ad name: names that differ only in case are different ads here
// ("DM5" and "dm5_011302" are separate creatives). Later records override earlier ones.
const INDEX = new Map<string, CreativeRecord>();
for (const record of creativesData as CreativeRecord[]) {
  INDEX.set(nameKey(record.ad), record);
}

/** The creative for an ad from creatives.json; every field is null when the ad isn't listed. */
export function getAdCreative(adName: string | number): AdCreative {
  const record = INDEX.get(nameKey(adName));
  if (!record) return NO_CREATIVE;
  return {
    image_url: webUrl(record.image),
    video_url: webUrl(record.video),
    landing_page_url: webUrl(record.landing),
  };
}
