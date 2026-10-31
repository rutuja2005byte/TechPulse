create table if not exists public.newsletter_test_sends (
  id uuid primary key default gen_random_uuid(),
  newsletter_id uuid not null references public.newsletters(id) on delete restrict,
  request_hash text not null unique,
  recipient_email text not null,
  send_status text not null default 'queued' check (send_status in ('queued', 'sent', 'failed')),
  resend_email_id text unique,
  sent_at timestamptz,
  delivery_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger newsletter_test_sends_set_updated_at
  before update on public.newsletter_test_sends
  for each row execute function public.set_updated_at();

alter table public.newsletter_test_sends enable row level security;
