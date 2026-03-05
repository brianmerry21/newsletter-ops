create table if not exists signals (
  id text primary key,
  source text not null check (source in ('hn','reddit','youtube')),
  title text not null,
  url text not null,
  published_at timestamptz null,
  engagement jsonb not null,
  engagement_score numeric not null default 0,
  raw jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists issues (
  id bigserial primary key,
  status text not null,
  chosen_cluster text,
  chosen_topic_title text,
  verified_signal_pack jsonb,
  beehiiv_post_id text,
  beehiiv_post_url text,
  fail_reason text,
  created_at timestamptz not null default now()
);

create table if not exists issue_signals (
  issue_id bigint not null references issues(id) on delete cascade,
  signal_id text not null references signals(id) on delete cascade,
  primary key (issue_id, signal_id)
);

create table if not exists issue_assets (
  id bigserial primary key,
  issue_id bigint not null references issues(id) on delete cascade,
  asset_type text not null,
  content_text text,
  content_json jsonb,
  created_at timestamptz not null default now()
);

create table if not exists runs (
  id bigserial primary key,
  run_type text not null,
  status text not null,
  logs jsonb,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);
