-- Nexora Forge Cloud control-plane schema.
-- Designed for PostgreSQL. Provider secrets are referenced, never stored in plaintext.

create extension if not exists pgcrypto;

create table if not exists organizations (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists organization_members (
  organization_id uuid not null references organizations(id) on delete cascade,
  user_id uuid not null,
  role text not null check (role in ('owner','admin','lead','artist','reviewer','viewer')),
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

create table if not exists projects (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  slug text not null,
  description text not null default '',
  created_by uuid not null,
  created_at timestamptz not null default now(),
  unique (organization_id, slug)
);

create table if not exists devices (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  owner_user_id uuid not null,
  name text not null,
  enrollment_public_id text not null unique,
  status text not null default 'offline' check (status in ('offline','online','busy','revoked')),
  blender_version text,
  agent_version text,
  last_seen_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists assets (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  asset_type text not null,
  name text not null,
  created_by uuid not null,
  created_at timestamptz not null default now()
);

create table if not exists asset_versions (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references assets(id) on delete cascade,
  version_number integer not null,
  storage_key text not null,
  checksum_sha256 text not null,
  created_by uuid not null,
  source_job_id uuid,
  created_at timestamptz not null default now(),
  unique (asset_id, version_number)
);

create table if not exists asset_locks (
  asset_id uuid primary key references assets(id) on delete cascade,
  locked_by uuid not null,
  device_id uuid references devices(id) on delete set null,
  lease_expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table if not exists provider_connections (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  provider text not null,
  connection_mode text not null check (connection_mode in ('direct','gateway')),
  secret_ref text not null,
  base_url text,
  created_by uuid not null,
  created_at timestamptz not null default now()
);

create table if not exists agent_profiles (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  name text not null,
  role text not null,
  provider text not null,
  connection_mode text not null check (connection_mode in ('direct','gateway')),
  model text not null,
  enabled boolean not null default true,
  system_instructions text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists jobs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  requested_by uuid not null,
  target_device_id uuid references devices(id) on delete set null,
  status text not null default 'queued' check (status in ('queued','planning','waiting_device','running','review','completed','failed','cancelled')),
  task text not null,
  coordinator_plan text,
  final_review text,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz
);

do $
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'asset_versions_source_job_fk'
  ) then
    alter table asset_versions
      add constraint asset_versions_source_job_fk
      foreign key (source_job_id) references jobs(id) on delete set null;
  end if;
end
$;

create table if not exists job_agent_runs (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references jobs(id) on delete cascade,
  agent_profile_id uuid references agent_profiles(id) on delete set null,
  role text not null,
  provider text not null,
  model text not null,
  status text not null check (status in ('queued','running','completed','failed')),
  output text,
  duration_ms bigint,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);

create table if not exists audit_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  project_id uuid references projects(id) on delete cascade,
  actor_user_id uuid,
  actor_device_id uuid references devices(id) on delete set null,
  event_type text not null,
  entity_type text,
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_projects_org on projects(organization_id);
create index if not exists idx_devices_org_status on devices(organization_id, status);
create index if not exists idx_assets_project on assets(project_id);
create index if not exists idx_jobs_project_status on jobs(project_id, status);
create index if not exists idx_job_agent_runs_job on job_agent_runs(job_id);
create index if not exists idx_audit_events_org_created on audit_events(organization_id, created_at desc);
