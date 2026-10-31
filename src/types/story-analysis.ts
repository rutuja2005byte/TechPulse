import { z } from 'zod';
import { Type, type Schema } from '@google/genai';

const ArticleRefSchema = z.string().regex(/^A[1-9]\d*$/);

const GeminiStoryGroupSchema = z.object({
  article_refs: z.array(ArticleRefSchema).min(1),
  existing_story_id: z.string().uuid().nullable(),
  headline: z.string().trim().min(8),
  summary: z.string().trim().min(20),
  why_it_matters: z.string().trim().min(20),
  future_implications: z.string().trim().min(20),
  analysis: z.string().trim().min(20),
  verified_facts: z.array(z.object({
    claim: z.string().trim().min(8),
    article_refs: z.array(ArticleRefSchema).min(1),
  }).strict()),
  importance_score: z.number().min(0).max(100),
  relevance_score: z.number().min(0).max(100),
  impact_score: z.number().min(0).max(100),
  credibility_score: z.number().min(0).max(100),
}).strict();

const GeminiExcludedArticleSchema = z.object({
  article_ref: ArticleRefSchema,
  reason: z.string().trim().min(8),
}).strict();

export const StoryAnalysisResponseSchema = z.object({
  groups: z.array(GeminiStoryGroupSchema),
  excluded_articles: z.array(GeminiExcludedArticleSchema),
}).strict();

export interface StoryGroup {
  article_ids: string[];
  existing_story_id: string | null;
  headline: string;
  summary: string;
  why_it_matters: string;
  future_implications: string;
  analysis: string;
  verified_facts: Array<{ claim: string; article_ids: string[] }>;
  importance_score: number;
  relevance_score: number;
  impact_score: number;
  credibility_score: number;
}

export interface StoryAnalysisResponse {
  groups: StoryGroup[];
  excluded_articles: Array<{ article_id: string; reason: string }>;
}

export const STORY_ANALYSIS_RESPONSE_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    groups: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          article_refs: { type: Type.ARRAY, items: { type: Type.STRING } },
          existing_story_id: { type: Type.STRING, nullable: true },
          headline: { type: Type.STRING },
          summary: { type: Type.STRING },
          why_it_matters: { type: Type.STRING },
          future_implications: { type: Type.STRING },
          analysis: { type: Type.STRING },
          verified_facts: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                claim: { type: Type.STRING },
                article_refs: { type: Type.ARRAY, items: { type: Type.STRING } },
              },
              required: ['claim', 'article_refs'],
              propertyOrdering: ['claim', 'article_refs'],
            },
          },
          importance_score: { type: Type.NUMBER, minimum: 0, maximum: 100 },
          relevance_score: { type: Type.NUMBER, minimum: 0, maximum: 100 },
          impact_score: { type: Type.NUMBER, minimum: 0, maximum: 100 },
          credibility_score: { type: Type.NUMBER, minimum: 0, maximum: 100 },
        },
        required: [
          'article_refs', 'existing_story_id', 'headline', 'summary', 'why_it_matters',
          'future_implications', 'analysis', 'verified_facts', 'importance_score',
          'relevance_score', 'impact_score', 'credibility_score',
        ],
        propertyOrdering: [
          'article_refs', 'existing_story_id', 'headline', 'summary', 'why_it_matters',
          'future_implications', 'analysis', 'verified_facts', 'importance_score',
          'relevance_score', 'impact_score', 'credibility_score',
        ],
      },
    },
    excluded_articles: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          article_ref: { type: Type.STRING },
          reason: { type: Type.STRING },
        },
        required: ['article_ref', 'reason'],
        propertyOrdering: ['article_ref', 'reason'],
      },
    },
  },
  required: ['groups', 'excluded_articles'],
  propertyOrdering: ['groups', 'excluded_articles'],
};
