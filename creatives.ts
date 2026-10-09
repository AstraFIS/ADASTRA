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

/** Links saved from the Ad groups page. null = no override (use creatives.json); "" = cleared on purpose. */
export interface CreativeOverride {
  image: string | null;
  video: string | null;
  landing: string | null;
}

/** creatives.json values for an ad as plain strings ("" when missing), for the Ad groups editor. */
export function getBaselineLinks(adName: string | number): { image: string; video: string; landing: string } {
  const c = getAdCreative(adName);
  return { image: c.image_url ?? '', video: c.video_url ?? '', landing: c.landing_page_url ?? '' };
}

const pick = (override: string | null | undefined, base: string | null): string | null =>
  override === null || override === undefined ? base : webUrl(override);

/** creatives.json merged with the saved overrides; an override wins, "" clears the field. */
export function mergeCreative(base: AdCreative, override: CreativeOverride | null): AdCreative {
  if (!override) return base;
  return {
    image_url: pick(override.image, base.image_url),
    video_url: pick(override.video, base.video_url),
    landing_page_url: pick(override.landing, base.landing_page_url),
  };
}
