alter table public.stories
  add column if not exists why_it_matters text not null default '',
  add column if not exists future_implications text not null default '',
  add column if not exists analysis text not null default '',
  add column if not exists verified_facts jsonb not null default '[]'::jsonb,
  add column if not exists source_links jsonb not null default '[]'::jsonb,
  add column if not exists relevance_score numeric(5, 2) not null default 0,
  add column if not exists impact_score numeric(5, 2) not null default 0,
  add column if not exists credibility_score numeric(5, 2) not null default 0,
  add column if not exists rank_score numeric(5, 2) not null default 0,
  add column if not exists story_key text;

alter table public.stories
  drop constraint if exists stories_relevance_score_range,
  drop constraint if exists stories_impact_score_range,
  drop constraint if exists stories_credibility_score_range,
  drop constraint if exists stories_rank_score_range,
  drop constraint if exists stories_verified_facts_array,
  drop constraint if exists stories_source_links_array,
  add constraint stories_relevance_score_range check (relevance_score between 0 and 100),
  add constraint stories_impact_score_range check (impact_score between 0 and 100),
  add constraint stories_credibility_score_range check (credibility_score between 0 and 100),
  add constraint stories_rank_score_range check (rank_score between 0 and 100),
  add constraint stories_verified_facts_array check (jsonb_typeof(verified_facts) = 'array'),
  add constraint stories_source_links_array check (jsonb_typeof(source_links) = 'array');

create unique index if not exists stories_story_key_unique
  on public.stories (story_key);

create table if not exists public.story_articles (
  article_id uuid primary key references public.articles(id) on delete cascade,
  story_id uuid references public.stories(id) on delete cascade,
  is_relevant boolean not null,
  exclusion_reason text,
  created_at timestamptz not null default now(),
  constraint story_articles_disposition_check check (
    (is_relevant and story_id is not null and exclusion_reason is null)
    or (not is_relevant and story_id is null and exclusion_reason is not null)
  )
);

create index if not exists story_articles_story_id_idx
  on public.story_articles (story_id)
  where story_id is not null;

alter table public.story_articles enable row level security;
