create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.sources (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  url text not null unique,
  source_type text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.articles (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  url text not null unique,
  source_id uuid not null references public.sources(id) on delete restrict,
  published_at timestamptz,
  content_hash text not null,
  created_at timestamptz not null default now(),
  unique (source_id, content_hash)
);

create table if not exists public.stories (
  id uuid primary key default gen_random_uuid(),
  headline text not null,
  summary text not null,
  detailed_content text not null,
  importance_score numeric(5, 2) not null default 0 check (importance_score >= 0 and importance_score <= 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.newsletters (
  id uuid primary key default gen_random_uuid(),
  newsletter_date date not null unique,
  subject text not null,
  html_content text not null,
  delivery_status text not null default 'draft' check (delivery_status in ('draft', 'queued', 'sent', 'failed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger sources_set_updated_at before update on public.sources
for each row execute function public.set_updated_at();
create trigger stories_set_updated_at before update on public.stories
for each row execute function public.set_updated_at();
create trigger newsletters_set_updated_at before update on public.newsletters
for each row execute function public.set_updated_at();
