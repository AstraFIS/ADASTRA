import taxonomyData from '../../data.json';
import type { CreativeTaxonomy, TaxonomyField } from '@/types/facebook';

/** Shape of one record in frontend/data.json. */
interface TaxonomyValue {
  value: string;
  confidence?: number;
}
interface TaxonomyRecord {
  ad_name: string | number;
  creative_taxonomy: {
    confidence_threshold?: number;
    intention_message: Record<string, TaxonomyValue>;
    physical_execution: Record<string, TaxonomyValue>;
  };
}

export const TAXONOMY_VERSION = 'V1';
export const TAXONOMY_SOURCE = 'Classified from creative content directly, per spec Rule 5';
export const DEFAULT_CONFIDENCE_THRESHOLD = 0.7;

/** Display labels for the known field keys; anything else falls back to a title-cased key. */
const LABELS: Record<string, string> = {
  angle: 'Angle',
  hook: 'Hook',
  hook_type: 'Hook Type',
  claim: 'Claim',
  style_primary: 'Style (Primary)',
  style_secondary: 'Style (Secondary)',
  target_gender: 'Target Gender',
  target_age: 'Target Age',
  offer_type: 'Offer Type',
  offer_text: 'Offer Text',
  format: 'Format',
  header: 'Header',
  body_copy: 'Body Copy',
  cta_text: 'CTA Text',
  cta_type: 'CTA Type',
  main_visual: 'Main Visual',
  person_gender: 'Person Gender',
  person_age: 'Person Age',
};

const labelFor = (key: string) =>
  LABELS[key] ?? key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

const normalise = (name: unknown) => String(name ?? '').trim().toLowerCase();

// Index by normalised ad name. Later records override earlier ones, so a
// duplicated ad name resolves to the last classification in the file.
const INDEX = new Map<string, TaxonomyRecord>();
for (const record of taxonomyData as TaxonomyRecord[]) {
  INDEX.set(normalise(record.ad_name), record);
}

function toFields(section: Record<string, TaxonomyValue> | undefined): TaxonomyField[] {
  return Object.entries(section ?? {}).map(([key, v]) => ({
    key,
    label: labelFor(key),
    value: String(v?.value ?? ''),
    confidence: typeof v?.confidence === 'number' ? v.confidence : null,
  }));
}

export interface CreativeTaxonomyWithThreshold extends CreativeTaxonomy {
  threshold: number;
}

/** The creative taxonomy for an ad from data.json, or null when the ad isn't classified. */
export function getCreativeTaxonomy(adName: string | number): CreativeTaxonomyWithThreshold | null {
  const record = INDEX.get(normalise(adName));
  if (!record?.creative_taxonomy) return null;
  const t = record.creative_taxonomy;
  return {
    version: TAXONOMY_VERSION,
    source: TAXONOMY_SOURCE,
    threshold: t.confidence_threshold ?? DEFAULT_CONFIDENCE_THRESHOLD,
    intention: toFields(t.intention_message),
    execution: toFields(t.physical_execution),
  };
}

/** Number of ads classified in data.json (handy for a status line). */
export const CLASSIFIED_AD_COUNT = INDEX.size;
