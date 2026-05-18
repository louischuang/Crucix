create table if not exists api_usage_logs (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  request_id text not null,
  method text not null,
  path text not null,
  status_code integer,
  duration_ms integer,
  client_ip text,
  user_agent text,
  api_key_hash text,
  error text
);

create index if not exists idx_api_usage_logs_created_at
  on api_usage_logs (created_at desc);

create index if not exists idx_api_usage_logs_path_created_at
  on api_usage_logs (path, created_at desc);

create index if not exists idx_api_usage_logs_api_key_hash_created_at
  on api_usage_logs (api_key_hash, created_at desc);
