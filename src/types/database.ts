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
        Row: { id: string; title: string; description: string | null; url: string; source_id: string; published_at: string | null; content_hash: string; created_at: string };
        Insert: { id?: string; title: string; description?: string | null; url: string; source_id: string; published_at?: string | null; content_hash: string; created_at?: string };
        Update: { id?: string; title?: string; description?: string | null; url?: string; source_id?: string; published_at?: string | null; content_hash?: string; created_at?: string };
        Relationships: [];
      };
      stories: {
        Row: { id: string; headline: string; summary: string; detailed_content: string; importance_score: number; created_at: string; updated_at: string };
        Insert: { id?: string; headline: string; summary: string; detailed_content: string; importance_score?: number; created_at?: string; updated_at?: string };
        Update: { id?: string; headline?: string; summary?: string; detailed_content?: string; importance_score?: number; created_at?: string; updated_at?: string };
        Relationships: [];
      };
      newsletters: {
        Row: { id: string; newsletter_date: string; subject: string; html_content: string; delivery_status: string; created_at: string; updated_at: string };
        Insert: { id?: string; newsletter_date: string; subject: string; html_content: string; delivery_status?: string; created_at?: string; updated_at?: string };
        Update: { id?: string; newsletter_date?: string; subject?: string; html_content?: string; delivery_status?: string; created_at?: string; updated_at?: string };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
