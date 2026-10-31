export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      sources: {
        Row: { id: string; name: string; url: string; source_type: string; is_active: boolean; created_at: string; updated_at: string };
        Insert: { id?: string; name: string; url: string; source_type: string; is_active?: boolean; created_at?: string; updated_at?: string };
        Update: { id?: string; name?: string; url?: string; source_type?: string; is_active?: boolean; created_at?: string; updated_at?: string };
        Relationships: [];
      };
      articles: {
        Row: { id: string; title: string; description: string | null; author: string | null; url: string; source_id: string; published_at: string | null; content_hash: string; created_at: string };
        Insert: { id?: string; title: string; description?: string | null; author?: string | null; url: string; source_id: string; published_at?: string | null; content_hash: string; created_at?: string };
        Update: { id?: string; title?: string; description?: string | null; author?: string | null; url?: string; source_id?: string; published_at?: string | null; content_hash?: string; created_at?: string };
        Relationships: [{ foreignKeyName: 'articles_source_id_fkey'; columns: ['source_id']; isOneToOne: false; referencedRelation: 'sources'; referencedColumns: ['id'] }];
      };
      stories: {
        Row: { id: string; headline: string; summary: string; detailed_content: string; importance_score: number; why_it_matters: string; future_implications: string; analysis: string; verified_facts: Json; source_links: Json; relevance_score: number; impact_score: number; credibility_score: number; rank_score: number; story_key: string | null; created_at: string; updated_at: string };
        Insert: { id?: string; headline: string; summary: string; detailed_content: string; importance_score?: number; why_it_matters?: string; future_implications?: string; analysis?: string; verified_facts?: Json; source_links?: Json; relevance_score?: number; impact_score?: number; credibility_score?: number; rank_score?: number; story_key?: string | null; created_at?: string; updated_at?: string };
        Update: { id?: string; headline?: string; summary?: string; detailed_content?: string; importance_score?: number; why_it_matters?: string; future_implications?: string; analysis?: string; verified_facts?: Json; source_links?: Json; relevance_score?: number; impact_score?: number; credibility_score?: number; rank_score?: number; story_key?: string | null; created_at?: string; updated_at?: string };
        Relationships: [];
      };
      story_articles: {
        Row: { article_id: string; story_id: string | null; is_relevant: boolean; exclusion_reason: string | null; created_at: string };
        Insert: { article_id: string; story_id?: string | null; is_relevant: boolean; exclusion_reason?: string | null; created_at?: string };
        Update: { article_id?: string; story_id?: string | null; is_relevant?: boolean; exclusion_reason?: string | null; created_at?: string };
        Relationships: [
          { foreignKeyName: 'story_articles_article_id_fkey'; columns: ['article_id']; isOneToOne: true; referencedRelation: 'articles'; referencedColumns: ['id'] },
          { foreignKeyName: 'story_articles_story_id_fkey'; columns: ['story_id']; isOneToOne: false; referencedRelation: 'stories'; referencedColumns: ['id'] }
        ];
      };
      newsletters: {
        Row: { id: string; newsletter_date: string; subject: string; html_content: string; delivery_status: string; resend_email_id: string | null; recipient_count: number | null; sent_at: string | null; delivery_error: string | null; created_at: string; updated_at: string };
        Insert: { id?: string; newsletter_date: string; subject: string; html_content: string; delivery_status?: string; resend_email_id?: string | null; recipient_count?: number | null; sent_at?: string | null; delivery_error?: string | null; created_at?: string; updated_at?: string };
        Update: { id?: string; newsletter_date?: string; subject?: string; html_content?: string; delivery_status?: string; resend_email_id?: string | null; recipient_count?: number | null; sent_at?: string | null; delivery_error?: string | null; created_at?: string; updated_at?: string };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
