export interface NormalizedArticle {
  title: string;
  description: string | null;
  url: string;
  publishedAt: string | null;
  contentHash: string;
}

export interface FeedSource {
  id: string;
  name: string;
  url: string;
}
