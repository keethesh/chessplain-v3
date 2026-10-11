create table public.scans (
  id uuid primary key default gen_random_uuid(),
  share_id text not null unique,
  user_id uuid references auth.users(id) on delete set null,
  ip inet,
  chesscom_username text not null,
  status text not null default 'pending' check (status in ('pending','fetching','analyzing','completed','failed')),
  attempts int not null default 0,
  locked_at timestamptz,
  next_attempt_at timestamptz,
  progress jsonb not null default '{"done":0,"total":0}'::jsonb,
  games jsonb not null default '[]'::jsonb,
  result jsonb,
  example_report_id uuid references public.game_analyses(id) on delete set null,
  checkin jsonb,
  error_message text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
alter table public.scans enable row level security;
create index scans_status_created_idx on public.scans (status, created_at);
create index scans_user_created_idx on public.scans (user_id, created_at desc);
create index scans_ip_created_idx on public.scans (ip, created_at desc);
