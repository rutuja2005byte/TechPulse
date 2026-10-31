export interface NormalizedArticle {
  title: string;
  description: string | null;
  author: string | null;
  url: string;
  sourceId: string;
  publishedAt: string | null;
  contentHash: string;
}

export interface ArticleNormalizationResult {
  article: NormalizedArticle | null;
  reason: string | null;
}

export interface FeedSource {
  id: string;
  name: string;
  url: string;
  sourceType: string;
}
