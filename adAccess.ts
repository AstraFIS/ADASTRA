import { api } from '@/lib/api';
import type { CreativeOverride } from '@/lib/creatives';
import type { TaxonomyData, TaxonomySource } from '@/lib/creativeTaxonomy';

export type AdGroup = 'Meta1' | 'Meta2';

export interface AdAssignment {
  adName: string;
  group: AdGroup | null;
  hasReports: boolean;
  /** Saved overrides only (null = none); merged over creatives.json by the page. */
  links: CreativeOverride;
  /** Taxonomy saved from the Ad groups page (null = none; data.json is used). */
  taxonomy: (TaxonomyData & { source: TaxonomySource }) | null;
}

export interface AdAssignmentInput {
  adName: string;
  group: AdGroup | null;
}

export interface AdLinksInput extends CreativeOverride {
  adName: string;
}

/** taxonomy: null removes the saved taxonomy, so the ad falls back to data.json. */
export interface AdTaxonomyInput {
  adName: string;
  taxonomy: TaxonomyData | null;
  source: TaxonomySource;
}

export interface ClassifyResult {
  adName: string;
  taxonomy: TaxonomyData | null;
  error: string | null;
}

export const adAccessApi = {
  list: () => api.get<{ groups: AdGroup[]; ads: AdAssignment[] }>('/ad-access'),
  save: (body: { assignments: AdAssignmentInput[]; links: AdLinksInput[]; taxonomies: AdTaxonomyInput[] }) =>
    api.put<{ groupsSaved: number; linksSaved: number; taxonomiesSaved: number; ads: AdAssignment[] }>('/ad-access', body),
  aiStatus: () => api.get<{ enabled: boolean }>('/ad-access/ai-status'),
  classify: (ads: { adName: string; imageUrl: string; landingUrl?: string | null }[]) =>
    api.post<{ results: ClassifyResult[] }>('/ad-access/classify', { ads }),
};

/** Taxonomy saved from the Ad groups page for one ad (null = none; data.json is used). */
export const fetchTaxonomyOverride = (adName: string) =>
  api.get<{ taxonomy: TaxonomyData | null }>(`/platforms/facebook/ads/${encodeURIComponent(adName)}/taxonomy`);

/** Saved link overrides for one ad (any signed-in user who may see the ad). */
export const fetchCreativeOverride = (adName: string) =>
  api.get<CreativeOverride>(`/platforms/facebook/ads/${encodeURIComponent(adName)}/creative`);
