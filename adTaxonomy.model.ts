import { Schema, model } from 'mongoose';

/** One classified field: the label and how sure the classifier was (0–1). */
export interface ITaxonomyField {
  value: string | null;
  confidence?: number | null;
}

/** Same shape as one record's `creative_taxonomy` in frontend/data.json. */
export interface TaxonomyData {
  confidence_threshold?: number;
  intention_message: Record<string, ITaxonomyField>;
  physical_execution: Record<string, ITaxonomyField>;
}

export const TAXONOMY_SOURCES = ['ai', 'manual', 'import'] as const;
export type TaxonomySource = (typeof TAXONOMY_SOURCES)[number];

export interface IAdTaxonomy extends TaxonomyData {
  ad_name: string;
  source: TaxonomySource;
  updated_at: Date;
}

/**
 * Creative taxonomy saved from the "Ad groups" page. One row per ad in the
 * `ad_taxonomies` collection. A row wins over the matching record in
 * frontend/data.json; deleting the row goes back to data.json.
 */
const adTaxonomySchema = new Schema<IAdTaxonomy>(
  {
    ad_name: { type: String, required: true, trim: true, index: true },
    confidence_threshold: { type: Number, min: 0, max: 1 },
    intention_message: { type: Schema.Types.Mixed, default: {} },
    physical_execution: { type: Schema.Types.Mixed, default: {} },
    source: { type: String, enum: TAXONOMY_SOURCES, default: 'manual' },
    updated_at: { type: Date, default: () => new Date() },
  },
  { collection: 'ad_taxonomies', versionKey: false, minimize: false },
);

export const AdTaxonomy = model<IAdTaxonomy>('AdTaxonomy', adTaxonomySchema);
