-- Production pipeline: device auth, durable job leases, artifacts, previews and human approval.

alter table devices
  add column if not exists auth_token_hash text,
  add column if not exists capabilities jsonb not null default '{}'::jsonb,
  add column if not exists last_heartbeat_at timestamptz,
  add column if not exists revoked_at timestamptz;

create unique index if not exists idx_devices_auth_token_hash
  on devices(auth_token_hash)
  where auth_token_hash is not null;

alter table jobs
  add column if not exists asset_id uuid references assets(id) on delete set null,
  add column if not exists execution_plan jsonb not null default '[]'::jsonb,
  add column if not exists operation_results jsonb not null default '[]'::jsonb,
  add column if not exists require_approval boolean not null default true,
  add column if not exists leased_by_device_id uuid references devices(id) on delete set null,
  add column if not exists lease_token_hash text,
  add column if not exists lease_expires_at timestamptz,
  add column if not exists attempt_count integer not null default 0,
  add column if not exists result_summary text,
  add column if not exists error_message text;

alter table jobs drop constraint if exists jobs_status_check;
alter table jobs
  add constraint jobs_status_check check (
    status in (
      'queued','planning','waiting_device','running','awaiting_approval',
      'changes_requested','completed','failed','rejected','cancelled'
    )
  );

alter table asset_versions
  add column if not exists preview_storage_key text;

create table if not exists job_artifacts (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references jobs(id) on delete cascade,
  asset_id uuid references assets(id) on delete set null,
  kind text not null check (kind in ('preview','blend','export','log')),
  storage_key text not null unique,
  content_type text not null,
  checksum_sha256 text not null,
  size_bytes bigint not null check (size_bytes >= 0),
  filename text not null,
  created_at timestamptz not null default now()
);

create table if not exists job_reviews (
  job_id uuid primary key references jobs(id) on delete cascade,
  decision text not null check (decision in ('approved','rejected','changes_requested')),
  notes text not null default '',
  reviewer_user_id uuid not null,
  reviewed_at timestamptz not null default now()
);

create index if not exists idx_asset_locks_expiry on asset_locks(lease_expires_at);
create index if not exists idx_jobs_device_lease on jobs(status, target_device_id, lease_expires_at);
create index if not exists idx_jobs_asset on jobs(asset_id, created_at desc);
create index if not exists idx_job_artifacts_job_kind on job_artifacts(job_id, kind, created_at desc);
