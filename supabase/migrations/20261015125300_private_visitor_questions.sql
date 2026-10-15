create table if not exists public.visitor_questions (
  id uuid primary key default gen_random_uuid(),
  reply_code text not null unique check (char_length(reply_code) = 10),
  question text not null check (char_length(question) between 1 and 1500),
  visitor_token_hash text not null check (visitor_token_hash ~ '^[0-9a-f]{64}$'),
  reply text check (reply is null or char_length(reply) <= 4000),
  created_at timestamptz not null default now(),
  answered_at timestamptz
);

create index if not exists visitor_questions_created_at_idx
  on public.visitor_questions (created_at desc);

alter table public.visitor_questions enable row level security;
revoke all privileges on table public.visitor_questions from public, anon, authenticated;
grant all privileges on table public.visitor_questions to service_role;

create table if not exists public.telegram_bot_config (
  id boolean primary key default true check (id = true),
  owner_chat_id text,
  owner_linked_at timestamptz,
  updated_at timestamptz not null default now()
);

insert into public.telegram_bot_config (id)
values (true)
on conflict (id) do nothing;

alter table public.telegram_bot_config enable row level security;
revoke all privileges on table public.telegram_bot_config from public, anon, authenticated;
grant all privileges on table public.telegram_bot_config to service_role;
