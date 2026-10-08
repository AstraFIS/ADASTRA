import taxonomyData from '../../data.json';
import type { CreativeTaxonomy, TaxonomyField } from '@/types/facebook';

/** One classified field: the label and the classifier's confidence (0–1). */
export interface TaxonomyValue {
  value: string | null;
  /** null / missing = no score */
  confidence?: number | null;
}

/** The `creative_taxonomy` shape of one record in frontend/data.json (also what the database stores). */
export interface TaxonomyData {
  confidence_threshold?: number;
  intention_message: Record<string, TaxonomyValue>;
  physical_execution: Record<string, TaxonomyValue>;
}

/** Where a saved taxonomy came from. */
export type TaxonomySource = 'ai' | 'manual' | 'import';

interface TaxonomyRecord {
  ad_name: string | number;
  creative_taxonomy: TaxonomyData;
}

export const TAXONOMY_VERSION = 'V1';
export const TAXONOMY_SOURCE = 'Classified from creative content directly, per spec Rule 5';
export const DEFAULT_CONFIDENCE_THRESHOLD = 0.7;

/** The standard fields, in display order. Fields outside these lists are kept and shown after them. */
export const INTENTION_KEYS = [
  'angle', 'hook', 'hook_type', 'claim', 'style_primary', 'style_secondary',
  'target_gender', 'target_age', 'offer_type', 'offer_text',
] as const;
export const EXECUTION_KEYS = [
  'format', 'header', 'body_copy', 'cta_text', 'cta_type', 'main_visual', 'person_gender', 'person_age',
] as const;

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

export const labelFor = (key: string) =>
  LABELS[key] ?? key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

const normalise = (name: unknown) => String(name ?? '').trim().toLowerCase();

// Index by normalised ad name. Later records override earlier ones, so a
// duplicated ad name resolves to the last classification in the file.
const INDEX = new Map<string, TaxonomyRecord>();
for (const record of taxonomyData as unknown as TaxonomyRecord[]) {
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

/** Turns stored taxonomy data into what the ad page card displays. */
export function toCreativeTaxonomy(t: TaxonomyData): CreativeTaxonomyWithThreshold {
  return {
    version: TAXONOMY_VERSION,
    source: TAXONOMY_SOURCE,
    threshold: t.confidence_threshold ?? DEFAULT_CONFIDENCE_THRESHOLD,
    intention: toFields(t.intention_message),
    execution: toFields(t.physical_execution),
  };
}

/** The taxonomy for an ad in frontend/data.json, or null when it isn't classified there. */
export function getBaselineTaxonomy(adName: string | number): TaxonomyData | null {
  return INDEX.get(normalise(adName))?.creative_taxonomy ?? null;
}

/**
 * The taxonomy to show for an ad: the one saved from the Ad groups page when
 * there is one, otherwise the one in data.json, otherwise null.
 */
export function getCreativeTaxonomy(
  adName: string | number,
  saved?: TaxonomyData | null,
): CreativeTaxonomyWithThreshold | null {
  const t = saved ?? getBaselineTaxonomy(adName);
  return t ? toCreativeTaxonomy(t) : null;
}

/** Number of ads classified in data.json (handy for a status line). */
export const CLASSIFIED_AD_COUNT = INDEX.size;

export interface ConfidenceSummary {
  /** fields that have a score */
  scored: number;
  /** mean of the scores, 0–1 (null when nothing is scored) */
  average: number | null;
  /** fields scored below the ad's threshold */
  low: number;
  threshold: number;
}

/** Average confidence and the number of low-confidence fields, for the Ad groups table. */
export function summarizeConfidence(t: TaxonomyData): ConfidenceSummary {
  const threshold = t.confidence_threshold ?? DEFAULT_CONFIDENCE_THRESHOLD;
  const scores = [...Object.values(t.intention_message ?? {}), ...Object.values(t.physical_execution ?? {})]
    .map((f) => f?.confidence)
    .filter((c): c is number => typeof c === 'number');
  return {
    scored: scores.length,
    average: scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null,
    low: scores.filter((c) => c < threshold).length,
    threshold,
  };
}

/** Every classified ad in data.json, in file order (used by the bulk export as a starting point). */
export const BASELINE_RECORDS: { ad_name: string; creative_taxonomy: TaxonomyData }[] = (
  taxonomyData as unknown as TaxonomyRecord[]
).map((r) => ({ ad_name: String(r.ad_name), creative_taxonomy: r.creative_taxonomy }));

/** An empty taxonomy with every standard field present, for the editor. */
export function emptyTaxonomy(): TaxonomyData {
  const blank = (keys: readonly string[]) => Object.fromEntries(keys.map((k) => [k, { value: null } as TaxonomyValue]));
  return { confidence_threshold: DEFAULT_CONFIDENCE_THRESHOLD, intention_message: blank(INTENTION_KEYS), physical_execution: blank(EXECUTION_KEYS) };
}

/**
 * Validates one record from a bulk import (data.json format). Returns the cleaned
 * taxonomy, or a message saying what is wrong.
 */
export function parseTaxonomyRecord(raw: unknown): { ok: true; adName: string; taxonomy: TaxonomyData } | { ok: false; error: string } {
  if (typeof raw !== 'object' || raw === null) return { ok: false, error: 'not an object' };
  const r = raw as { ad_name?: unknown; creative_taxonomy?: unknown };
  const adName = String(r.ad_name ?? '').trim();
  if (!adName) return { ok: false, error: 'missing ad_name' };
  const t = r.creative_taxonomy as Partial<TaxonomyData> | undefined;
  if (typeof t !== 'object' || t === null) return { ok: false, error: 'missing creative_taxonomy' };

  const section = (s: unknown): Record<string, TaxonomyValue> | null => {
    if (s === undefined) return {};
    if (typeof s !== 'object' || s === null || Array.isArray(s)) return null;
    const out: Record<string, TaxonomyValue> = {};
    for (const [key, v] of Object.entries(s)) {
      if (!/^[a-z][a-z0-9_]{0,39}$/.test(key)) return null;
      const f = (v ?? {}) as { value?: unknown; confidence?: unknown };
      const value = f.value === null || f.value === undefined ? null : String(f.value).trim().slice(0, 1000);
      const field: TaxonomyValue = { value: value === '' ? null : value };
      if (f.confidence !== undefined && f.confidence !== null) {
        const c = Number(f.confidence);
        if (!Number.isFinite(c) || c < 0 || c > 1) return null;
        field.confidence = c;
      }
      out[key] = field;
    }
    return out;
  };

  const intention = section(t.intention_message);
  const execution = section(t.physical_execution);
  if (!intention || !execution) return { ok: false, error: 'a field name or confidence is invalid (confidence must be 0–1)' };
  if (Object.keys(intention).length + Object.keys(execution).length === 0) return { ok: false, error: 'no fields' };
  const threshold = typeof t.confidence_threshold === 'number' && t.confidence_threshold >= 0 && t.confidence_threshold <= 1 ? t.confidence_threshold : undefined;
  return {
    ok: true,
    adName,
    taxonomy: { ...(threshold !== undefined ? { confidence_threshold: threshold } : {}), intention_message: intention, physical_execution: execution },
  };
}
