insert into public.sources (name, url, source_type)
values
  ('The Verge', 'https://www.theverge.com/rss/index.xml', 'rss'),
  ('Ars Technica', 'https://feeds.arstechnica.com/arstechnica/index', 'rss'),
  ('Hacker News', 'https://hnrss.org/frontpage', 'rss'),
  ('Google AI Blog', 'https://blog.research.google/feeds/posts/default', 'blog'),
  ('OpenAI News', 'https://openai.com/news/rss.xml', 'blog')
on conflict (url) do nothing;
