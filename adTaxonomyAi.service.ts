import { env } from '../config/env.js';
import type { TaxonomyData } from '../models/adTaxonomy.model.js';
import { HttpError } from '../utils/httpError.js';
import { taxonomyDataSchema } from '../utils/taxonomySchema.js';

const API_URL = 'https://api.anthropic.com/v1/messages';
const TIMEOUT_MS = 55_000;

/**
 * The labels already used in frontend/data.json. The model is told to reuse
 * these where they fit, so AI results stay comparable with the existing ones.
 */
const SYSTEM_PROMPT = `You classify paid-social ad creatives (Facebook/Instagram) for a performance-marketing team.
You are given the ad's image (a static ad, or a video's thumbnail/first frame). Classify what you can SEE and READ in it.
Never guess at things that are not visible: use null for the value (and omit its confidence) when a field does not apply
or cannot be read from the creative (e.g. person_age when no person is shown, offer_text when there is no offer).

Return ONLY one JSON object, no prose and no markdown fences, with exactly this shape:
{
  "intention_message": {
    "angle": {"value": "...", "confidence": 0.0},
    "hook": {...}, "hook_type": {...}, "claim": {...},
    "style_primary": {...}, "style_secondary": {...},
    "target_gender": {...}, "target_age": {...},
    "offer_type": {...}, "offer_text": {...}
  },
  "physical_execution": {
    "format": {...}, "header": {...}, "body_copy": {...},
    "cta_text": {...}, "cta_type": {...}, "main_visual": {...},
    "person_gender": {...}, "person_age": {...}
  }
}

Field guide:
- angle: the core persuasion theme, e.g. "Flexibility / Low Commitment", "Savings / Best Value", "Privacy / Embarrassment Avoidance", "Convenience / Time-Saving", "Differentiation / Product Superiority".
- hook: the attention-grabbing line, copied as written in the creative.
- hook_type: e.g. Risk_Reversal, Value_Proposition, Benefit_Led, Pain_Point, Curiosity, Price_Savings, Contrarian / Pattern_Interrupt, Aspirational / Emotional.
- claim: the main promise made, in one short sentence.
- style_primary / style_secondary: e.g. Direct_Response, Direct, Informative, Emotional / Aspirational, Humorous / Witty, UGC / Testimonial, Premium, Lifestyle, Comparative.
- target_gender: Male, Female or Male + Female. target_age: e.g. Adult_35_44, Middle_Aged_45_54, Older_55_Plus.
- offer_type: e.g. No_Offer, Price_Point, Percent_Discount / Limited_Time, Subscription, Bundle / Value_Stack, Price_Comparison. offer_text: the offer wording as written.
- format: "Static" or "Video (...)" with a short description.
- header, body_copy, cta_text: the text exactly as it appears on the creative.
- cta_type: e.g. Claim_Offer, Sign_Up, Learn_More, Qualify / Eligibility_Check, Subscribe, Get_Started.
- main_visual: one sentence describing the dominant image.
- person_gender / person_age: for the person shown (e.g. Male, Female, Male + Female; Young_Adult_25_34, Adult_35_44, Middle_Aged_45_54, Older_55_Plus).

Confidence is a number from 0 to 1 for how sure you are that the value is right:
0.9+ = text read directly off the creative or unambiguous; 0.7-0.9 = clear inference; 0.5-0.7 = a judgement call; below 0.5 = weak guess.
Do not give every field the same score. Prefer the label style above, using Title_Case with underscores for single labels and " / " to combine two.`;

interface AnthropicResponse {
  content?: { type: string; text?: string }[];
  error?: { message?: string };
}

/** Pulls the JSON object out of the model's reply, tolerating stray fences or prose. */
function extractJson(text: string): unknown {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end <= start) throw new HttpError(502, 'The AI reply did not contain a classification');
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    throw new HttpError(502, 'The AI reply was not valid JSON');
  }
}

export function isAiConfigured(): boolean {
  return Boolean(env.anthropicApiKey);
}

/** Classifies one ad's creative image with Claude; the result is a suggestion for an admin to review. */
export async function classifyCreative(input: {
  adName: string;
  imageUrl: string;
  landingUrl?: string | null;
}): Promise<TaxonomyData> {
  if (!env.anthropicApiKey) {
    throw new HttpError(503, 'AI classification is not set up: add ANTHROPIC_API_KEY to the backend environment');
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(API_URL, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'content-type': 'application/json',
        'x-api-key': env.anthropicApiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: env.anthropicModel,
        max_tokens: 2000,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'image', source: { type: 'url', url: input.imageUrl } },
              {
                type: 'text',
                text:
                  `Ad name: ${input.adName}\n` +
                  (input.landingUrl ? `Landing page (for context only): ${input.landingUrl}\n` : '') +
                  'Classify this creative. Reply with the JSON object only.',
              },
            ],
          },
        ],
      }),
    });
  } catch (err) {
    const aborted = err instanceof Error && err.name === 'AbortError';
    throw new HttpError(504, aborted ? 'The AI took too long to answer' : 'Could not reach the AI service');
  } finally {
    clearTimeout(timer);
  }

  const body = (await res.json().catch(() => ({}))) as AnthropicResponse;
  if (!res.ok) {
    // 4xx from the API usually means the image link could not be fetched or the key/model is wrong
    throw new HttpError(502, `AI request failed: ${body.error?.message ?? res.status}`);
  }

  const text = (body.content ?? []).map((c) => (c.type === 'text' ? (c.text ?? '') : '')).join('');
  const parsed = taxonomyDataSchema.safeParse(extractJson(text));
  if (!parsed.success) throw new HttpError(502, 'The AI reply did not match the taxonomy format');
  return parsed.data;
}
