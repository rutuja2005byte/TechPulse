insert into public.sources (name, url, source_type)
values
  ('Hacker News', 'https://news.ycombinator.com/rss', 'rss'),
  ('TechCrunch', 'https://techcrunch.com/feed/', 'rss'),
  ('The Verge', 'https://www.theverge.com/rss/index.xml', 'rss'),
  ('Ars Technica', 'https://feeds.arstechnica.com/arstechnica/index', 'rss'),
  ('arXiv CS', 'https://rss.arxiv.org/rss/cs', 'rss')
on conflict (url) do update
set name = excluded.name,
    source_type = excluded.source_type,
    is_active = true,
    updated_at = now();

update public.sources
set is_active = false,
    updated_at = now()
where url in (
  'https://hnrss.org/frontpage',
  'https://blog.research.google/feeds/posts/default',
  'https://openai.com/news/rss.xml'
);
