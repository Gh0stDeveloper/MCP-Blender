-- Local team access, member tokens and one-time Device Agent pairing codes.

alter table organization_members
  add column if not exists display_name text,
  add column if not exists auth_token_hash text,
  add column if not exists token_created_at timestamptz;

create unique index if not exists idx_org_members_auth_token_hash
  on organization_members(auth_token_hash)
  where auth_token_hash is not null;

create table if not exists device_pairing_codes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  owner_user_id uuid not null,
  created_by uuid not null,
  code_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_device_pairing_active
  on device_pairing_codes(organization_id, expires_at)
  where used_at is null;
