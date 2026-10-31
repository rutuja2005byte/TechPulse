alter table public.newsletters
  add column if not exists resend_email_id text,
  add column if not exists recipient_count integer,
  add column if not exists sent_at timestamptz,
  add column if not exists delivery_error text;

create unique index if not exists newsletters_resend_email_id_key
  on public.newsletters (resend_email_id)
  where resend_email_id is not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'newsletters_recipient_count_nonnegative'
      and conrelid = 'public.newsletters'::regclass
  ) then
    alter table public.newsletters
      add constraint newsletters_recipient_count_nonnegative
      check (recipient_count is null or recipient_count >= 0);
  end if;
end
$$;
