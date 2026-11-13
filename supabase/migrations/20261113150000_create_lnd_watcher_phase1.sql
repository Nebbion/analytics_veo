begin;

create extension if not exists pgcrypto with schema extensions;

do $$
begin
  if not exists (
    select 1
    from pg_roles
    where rolname = 'lnd_watcher_worker'
  ) then
    create role lnd_watcher_worker
      nologin nosuperuser nocreatedb nocreaterole noreplication nobypassrls;
  end if;
end
$$;

create or replace function public.lnd_touch_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  new.updated_at = now();
  return new;
end
$$;

revoke all on function public.lnd_touch_updated_at() from public, anon, authenticated;

create or replace function public.lnd_prevent_audit_delete()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  raise exception 'Deletion is not allowed on audit table %. Use a rectification or status transition.', tg_table_name
    using errcode = 'integrity_constraint_violation';
end
$$;

revoke all on function public.lnd_prevent_audit_delete()
  from public, anon, authenticated;

create or replace function public.lnd_protect_verified_document()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if old.verification_status = 'VERIFIED' and (
    new.verification_status <> old.verification_status or
    row(
      new.document_key,
      new.source_id,
      new.season_id,
      new.competition_id,
      new.document_type,
      new.bulletin_number,
      new.published_at,
      new.canonical_url,
      new.content_sha256,
      new.replaces_document_id
    ) is distinct from row(
      old.document_key,
      old.source_id,
      old.season_id,
      old.competition_id,
      old.document_type,
      old.bulletin_number,
      old.published_at,
      old.canonical_url,
      old.content_sha256,
      old.replaces_document_id
    )
  ) then
    raise exception 'Verified LND document evidence is immutable; insert a replacement document.'
      using errcode = 'integrity_constraint_violation';
  end if;

  return new;
end
$$;

revoke all on function public.lnd_protect_verified_document()
  from public, anon, authenticated;

create or replace function public.lnd_protect_verified_measure()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if old.verification_status = 'VERIFIED' and (
    new.verification_status <> old.verification_status or
    row(
      new.idempotency_key,
      new.document_id,
      new.page_number,
      new.source_excerpt,
      new.excerpt_sha256,
      new.season_id,
      new.competition_id,
      new.team_id,
      new.person_id,
      new.fixture_id,
      new.raw_team_name,
      new.raw_person_name,
      new.measure_type,
      new.quantity,
      new.unit,
      new.gamedays,
      new.effective_from,
      new.supersedes_measure_id
    ) is distinct from row(
      old.idempotency_key,
      old.document_id,
      old.page_number,
      old.source_excerpt,
      old.excerpt_sha256,
      old.season_id,
      old.competition_id,
      old.team_id,
      old.person_id,
      old.fixture_id,
      old.raw_team_name,
      old.raw_person_name,
      old.measure_type,
      old.quantity,
      old.unit,
      old.gamedays,
      old.effective_from,
      old.supersedes_measure_id
    )
  ) then
    raise exception 'Verified LND measure evidence is immutable; insert a superseding measure.'
      using errcode = 'integrity_constraint_violation';
  end if;

  return new;
end
$$;

revoke all on function public.lnd_protect_verified_measure()
  from public, anon, authenticated;

create or replace function public.lnd_protect_verified_ledger_entry()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if old.verification_status = 'VERIFIED' and (
    new.verification_status <> old.verification_status or
    row(
      new.idempotency_key,
      new.measure_id,
      new.person_id,
      new.team_id,
      new.season_id,
      new.competition_id,
      new.fixture_id,
      new.movement_type,
      new.delta_gamedays,
      new.balance_after,
      new.source_document_id,
      new.occurred_on
    ) is distinct from row(
      old.idempotency_key,
      old.measure_id,
      old.person_id,
      old.team_id,
      old.season_id,
      old.competition_id,
      old.fixture_id,
      old.movement_type,
      old.delta_gamedays,
      old.balance_after,
      old.source_document_id,
      old.occurred_on
    )
  ) then
    raise exception 'Verified suspension ledger entries are immutable; append a correction.'
      using errcode = 'integrity_constraint_violation';
  end if;

  return new;
end
$$;

revoke all on function public.lnd_protect_verified_ledger_entry()
  from public, anon, authenticated;

create table public.lnd_seasons (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  starts_on date not null,
  ends_on date not null,
  active boolean not null default false,
  verification_status text not null default 'UNVERIFIED'
    check (verification_status in (
      'UNVERIFIED', 'PARSED', 'VERIFIED', 'AMBIGUOUS',
      'NON_VERIFICABILE', 'REJECTED'
    )),
  verification_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint lnd_seasons_valid_range check (ends_on >= starts_on)
);

create table public.lnd_competitions (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references public.lnd_seasons(id) on delete restrict,
  competition_key text not null unique,
  official_code text,
  official_name text not null,
  normalized_name text not null,
  kind text not null
    check (kind in ('LEAGUE', 'COPPA_VENETO', 'OTHER')),
  analytics_category text
    check (analytics_category is null or analytics_category in (
      'CAMPIONATO', 'COPPA', 'OTHER'
    )),
  region text not null default 'Veneto',
  verification_status text not null default 'UNVERIFIED'
    check (verification_status in (
      'UNVERIFIED', 'PARSED', 'VERIFIED', 'AMBIGUOUS',
      'NON_VERIFICABILE', 'REJECTED'
    )),
  verification_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index lnd_competitions_official_code_uidx
  on public.lnd_competitions (season_id, official_code)
  where official_code is not null;
create index lnd_competitions_season_idx
  on public.lnd_competitions (season_id, kind);

create table public.lnd_teams (
  id uuid primary key default gen_random_uuid(),
  team_key text not null unique,
  official_code text,
  official_name text not null,
  normalized_name text not null,
  region text not null default 'Veneto',
  active boolean not null default true,
  verification_status text not null default 'UNVERIFIED'
    check (verification_status in (
      'UNVERIFIED', 'PARSED', 'VERIFIED', 'AMBIGUOUS',
      'NON_VERIFICABILE', 'REJECTED'
    )),
  verification_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index lnd_teams_official_code_uidx
  on public.lnd_teams (official_code)
  where official_code is not null;
create index lnd_teams_normalized_name_idx
  on public.lnd_teams (normalized_name);

create table public.lnd_sources (
  id uuid primary key default gen_random_uuid(),
  source_key text not null unique,
  name text not null,
  source_type text not null
    check (source_type in ('LISTING', 'PDF', 'API', 'MANUAL')),
  base_url text not null,
  official boolean not null default true,
  active boolean not null default true,
  last_success_at timestamptz,
  last_checked_at timestamptz,
  verification_status text not null default 'UNVERIFIED'
    check (verification_status in (
      'UNVERIFIED', 'PARSED', 'VERIFIED', 'AMBIGUOUS',
      'NON_VERIFICABILE', 'REJECTED'
    )),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.lnd_agent_runs (
  id uuid primary key default gen_random_uuid(),
  run_key text not null unique,
  workflow_name text not null,
  workflow_version text not null,
  scheduled_for timestamptz not null,
  schedule_timezone text not null default 'Europe/Rome',
  started_at timestamptz,
  finished_at timestamptz,
  status text not null default 'SCHEDULED'
    check (status in (
      'SCHEDULED', 'RUNNING', 'SUCCEEDED', 'PARTIAL',
      'FAILED', 'SKIPPED'
    )),
  scope jsonb not null default '{}'::jsonb
    check (jsonb_typeof(scope) = 'object'),
  documents_seen integer not null default 0 check (documents_seen >= 0),
  documents_new integer not null default 0 check (documents_new >= 0),
  measures_new integer not null default 0 check (measures_new >= 0),
  error_code text,
  error_summary text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint lnd_agent_runs_time_order check (
    finished_at is null or started_at is null or finished_at >= started_at
  )
);

create index lnd_agent_runs_schedule_idx
  on public.lnd_agent_runs (scheduled_for desc);
create index lnd_agent_runs_status_idx
  on public.lnd_agent_runs (status, scheduled_for desc);

create table public.lnd_documents (
  id uuid primary key default gen_random_uuid(),
  document_key text not null unique,
  source_id uuid not null references public.lnd_sources(id) on delete restrict,
  season_id uuid not null references public.lnd_seasons(id) on delete restrict,
  competition_id uuid references public.lnd_competitions(id) on delete restrict,
  document_type text not null
    check (document_type in (
      'OFFICIAL_BULLETIN', 'RECTIFICATION', 'ATTACHMENT', 'OTHER'
    )),
  bulletin_number text,
  published_at timestamptz,
  canonical_url text not null,
  content_sha256 text not null unique
    check (content_sha256 ~ '^[0-9a-f]{64}$'),
  http_etag text,
  http_last_modified timestamptz,
  storage_path text,
  mime_type text not null default 'application/pdf',
  size_bytes bigint check (size_bytes is null or size_bytes >= 0),
  extraction_status text not null default 'PENDING'
    check (extraction_status in ('PENDING', 'TEXT', 'OCR', 'FAILED')),
  extracted_text_sha256 text
    check (
      extracted_text_sha256 is null or
      extracted_text_sha256 ~ '^[0-9a-f]{64}$'
    ),
  replaces_document_id uuid references public.lnd_documents(id) on delete restrict,
  discovered_run_id uuid references public.lnd_agent_runs(id) on delete restrict,
  verification_status text not null default 'UNVERIFIED'
    check (verification_status in (
      'UNVERIFIED', 'PARSED', 'VERIFIED', 'AMBIGUOUS',
      'NON_VERIFICABILE', 'REJECTED'
    )),
  verification_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint lnd_documents_not_self_replacing check (
    replaces_document_id is null or replaces_document_id <> id
  )
);

create unique index lnd_documents_single_replacement_uidx
  on public.lnd_documents (replaces_document_id)
  where replaces_document_id is not null;
create index lnd_documents_source_published_idx
  on public.lnd_documents (source_id, published_at desc);
create index lnd_documents_season_competition_idx
  on public.lnd_documents (season_id, competition_id, published_at desc);
create index lnd_documents_extraction_idx
  on public.lnd_documents (extraction_status, verification_status);

create table public.lnd_team_aliases (
  id uuid primary key default gen_random_uuid(),
  alias_key text not null unique,
  team_id uuid not null references public.lnd_teams(id) on delete restrict,
  alias text not null,
  normalized_alias text not null,
  valid_from date,
  valid_to date,
  source_document_id uuid references public.lnd_documents(id) on delete restrict,
  verification_status text not null default 'UNVERIFIED'
    check (verification_status in (
      'UNVERIFIED', 'PARSED', 'VERIFIED', 'AMBIGUOUS',
      'NON_VERIFICABILE', 'REJECTED'
    )),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint lnd_team_aliases_valid_range check (
    valid_to is null or valid_from is null or valid_to >= valid_from
  )
);

create index lnd_team_aliases_normalized_idx
  on public.lnd_team_aliases (normalized_alias);
create index lnd_team_aliases_team_idx
  on public.lnd_team_aliases (team_id);

create table public.lnd_persons (
  id uuid primary key default gen_random_uuid(),
  person_key text not null unique,
  federation_member_id text,
  analytics_player_id text,
  given_name text,
  family_name text,
  display_name text not null,
  normalized_name text not null,
  birth_date date,
  source_document_id uuid references public.lnd_documents(id) on delete restrict,
  verification_status text not null default 'UNVERIFIED'
    check (verification_status in (
      'UNVERIFIED', 'PARSED', 'VERIFIED', 'AMBIGUOUS',
      'NON_VERIFICABILE', 'REJECTED'
    )),
  verification_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index lnd_persons_federation_member_uidx
  on public.lnd_persons (federation_member_id)
  where federation_member_id is not null;
create unique index lnd_persons_analytics_player_uidx
  on public.lnd_persons (analytics_player_id)
  where analytics_player_id is not null;
create index lnd_persons_normalized_name_idx
  on public.lnd_persons (normalized_name);

create table public.lnd_registrations (
  id uuid primary key default gen_random_uuid(),
  registration_key text not null unique,
  person_id uuid not null references public.lnd_persons(id) on delete restrict,
  team_id uuid not null references public.lnd_teams(id) on delete restrict,
  season_id uuid not null references public.lnd_seasons(id) on delete restrict,
  valid_from date,
  valid_to date,
  status text not null default 'ACTIVE'
    check (status in ('ACTIVE', 'ENDED', 'TRANSFERRED', 'UNKNOWN')),
  source_document_id uuid references public.lnd_documents(id) on delete restrict,
  verification_status text not null default 'UNVERIFIED'
    check (verification_status in (
      'UNVERIFIED', 'PARSED', 'VERIFIED', 'AMBIGUOUS',
      'NON_VERIFICABILE', 'REJECTED'
    )),
  verification_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint lnd_registrations_valid_range check (
    valid_to is null or valid_from is null or valid_to >= valid_from
  )
);

create index lnd_registrations_person_season_idx
  on public.lnd_registrations (person_id, season_id, valid_from);
create index lnd_registrations_team_season_idx
  on public.lnd_registrations (team_id, season_id, status);

create table public.lnd_fixtures (
  id uuid primary key default gen_random_uuid(),
  idempotency_key text not null unique,
  season_id uuid not null references public.lnd_seasons(id) on delete restrict,
  competition_id uuid not null references public.lnd_competitions(id) on delete restrict,
  matchday integer check (matchday is null or matchday > 0),
  leg text check (leg is null or leg in ('ANDATA', 'RITORNO', 'OTHER')),
  home_team_id uuid not null references public.lnd_teams(id) on delete restrict,
  away_team_id uuid not null references public.lnd_teams(id) on delete restrict,
  scheduled_date date not null,
  kickoff_time time,
  kickoff_timezone text not null default 'Europe/Rome',
  original_scheduled_date date,
  original_kickoff_time time,
  status text not null default 'SCHEDULED'
    check (status in (
      'SCHEDULED', 'POSTPONED', 'RESCHEDULED',
      'PLAYED', 'CANCELLED', 'UNKNOWN'
    )),
  home_score integer check (home_score is null or home_score >= 0),
  away_score integer check (away_score is null or away_score >= 0),
  official_match_code text,
  source_system text not null,
  source_reference text,
  source_document_id uuid references public.lnd_documents(id) on delete restrict,
  verification_status text not null default 'UNVERIFIED'
    check (verification_status in (
      'UNVERIFIED', 'PARSED', 'VERIFIED', 'AMBIGUOUS',
      'NON_VERIFICABILE', 'REJECTED'
    )),
  verification_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint lnd_fixtures_different_teams check (home_team_id <> away_team_id),
  constraint lnd_fixtures_scores_together check (
    (home_score is null and away_score is null) or
    (home_score is not null and away_score is not null)
  )
);

create unique index lnd_fixtures_official_match_uidx
  on public.lnd_fixtures (season_id, competition_id, official_match_code)
  where official_match_code is not null;
create index lnd_fixtures_schedule_idx
  on public.lnd_fixtures (scheduled_date, kickoff_time, status);
create index lnd_fixtures_home_team_idx
  on public.lnd_fixtures (home_team_id, scheduled_date);
create index lnd_fixtures_away_team_idx
  on public.lnd_fixtures (away_team_id, scheduled_date);

create table public.lnd_disciplinary_measures (
  id uuid primary key default gen_random_uuid(),
  idempotency_key text not null unique,
  document_id uuid not null references public.lnd_documents(id) on delete restrict,
  page_number integer check (page_number is null or page_number > 0),
  source_excerpt text not null,
  excerpt_sha256 text
    check (excerpt_sha256 is null or excerpt_sha256 ~ '^[0-9a-f]{64}$'),
  season_id uuid not null references public.lnd_seasons(id) on delete restrict,
  competition_id uuid not null references public.lnd_competitions(id) on delete restrict,
  team_id uuid references public.lnd_teams(id) on delete restrict,
  person_id uuid references public.lnd_persons(id) on delete restrict,
  fixture_id uuid references public.lnd_fixtures(id) on delete restrict,
  raw_team_name text,
  raw_person_name text,
  measure_type text not null
    check (measure_type in (
      'WARNING', 'DIFFIDA', 'SUSPENSION', 'EXPULSION', 'FINE', 'OTHER'
    )),
  quantity numeric check (quantity is null or quantity >= 0),
  unit text,
  gamedays integer check (gamedays is null or gamedays >= 0),
  effective_from date,
  record_status text not null default 'ACTIVE'
    check (record_status in ('ACTIVE', 'SUPERSEDED', 'REVOKED')),
  verification_status text not null default 'PARSED'
    check (verification_status in (
      'UNVERIFIED', 'PARSED', 'VERIFIED', 'AMBIGUOUS',
      'NON_VERIFICABILE', 'REJECTED'
    )),
  confidence numeric
    check (confidence is null or (confidence >= 0 and confidence <= 1)),
  supersedes_measure_id uuid
    references public.lnd_disciplinary_measures(id) on delete restrict,
  verified_by text,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint lnd_measures_not_self_superseding check (
    supersedes_measure_id is null or supersedes_measure_id <> id
  ),
  constraint lnd_measures_has_subject check (
    team_id is not null or person_id is not null or
    nullif(btrim(coalesce(raw_team_name, '')), '') is not null or
    nullif(btrim(coalesce(raw_person_name, '')), '') is not null
  )
);

create unique index lnd_measures_single_successor_uidx
  on public.lnd_disciplinary_measures (supersedes_measure_id)
  where supersedes_measure_id is not null;
create index lnd_measures_person_context_idx
  on public.lnd_disciplinary_measures (
    person_id, season_id, competition_id, record_status
  );
create index lnd_measures_team_context_idx
  on public.lnd_disciplinary_measures (
    team_id, season_id, competition_id, record_status
  );
create index lnd_measures_document_idx
  on public.lnd_disciplinary_measures (document_id, page_number);
create index lnd_measures_verification_idx
  on public.lnd_disciplinary_measures (verification_status, record_status);

create table public.lnd_suspension_ledger (
  id uuid primary key default gen_random_uuid(),
  idempotency_key text not null unique,
  measure_id uuid not null
    references public.lnd_disciplinary_measures(id) on delete restrict,
  person_id uuid not null references public.lnd_persons(id) on delete restrict,
  team_id uuid not null references public.lnd_teams(id) on delete restrict,
  season_id uuid not null references public.lnd_seasons(id) on delete restrict,
  competition_id uuid not null references public.lnd_competitions(id) on delete restrict,
  fixture_id uuid references public.lnd_fixtures(id) on delete restrict,
  movement_type text not null
    check (movement_type in ('IMPOSED', 'SERVED', 'CORRECTION', 'REVOCATION')),
  delta_gamedays integer not null check (delta_gamedays <> 0),
  balance_after integer check (balance_after is null or balance_after >= 0),
  source_document_id uuid not null
    references public.lnd_documents(id) on delete restrict,
  occurred_on date not null,
  verification_status text not null default 'UNVERIFIED'
    check (verification_status in (
      'UNVERIFIED', 'PARSED', 'VERIFIED', 'AMBIGUOUS',
      'NON_VERIFICABILE', 'REJECTED'
    )),
  verification_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint lnd_ledger_delta_direction check (
    (movement_type = 'IMPOSED' and delta_gamedays > 0) or
    (movement_type = 'SERVED' and delta_gamedays < 0) or
    movement_type in ('CORRECTION', 'REVOCATION')
  ),
  constraint lnd_ledger_served_requires_fixture check (
    movement_type <> 'SERVED' or fixture_id is not null
  )
);

create unique index lnd_ledger_one_verified_served_fixture_uidx
  on public.lnd_suspension_ledger (
    person_id, season_id, competition_id, fixture_id
  )
  where movement_type = 'SERVED' and verification_status = 'VERIFIED';
create index lnd_ledger_balance_context_idx
  on public.lnd_suspension_ledger (
    person_id, season_id, competition_id, occurred_on, created_at
  );
create index lnd_ledger_measure_idx
  on public.lnd_suspension_ledger (measure_id);

create table public.lnd_verifications (
  id uuid primary key default gen_random_uuid(),
  verification_key text not null unique,
  run_id uuid not null references public.lnd_agent_runs(id) on delete restrict,
  source_id uuid not null references public.lnd_sources(id) on delete restrict,
  document_id uuid references public.lnd_documents(id) on delete restrict,
  team_id uuid references public.lnd_teams(id) on delete restrict,
  person_id uuid references public.lnd_persons(id) on delete restrict,
  fixture_id uuid references public.lnd_fixtures(id) on delete restrict,
  result text not null
    check (result in (
      'NEW', 'UNCHANGED', 'NOT_FOUND', 'AMBIGUOUS',
      'SOURCE_UNAVAILABLE', 'ERROR'
    )),
  http_status integer check (
    http_status is null or (http_status >= 100 and http_status <= 599)
  ),
  evidence jsonb not null default '{}'::jsonb
    check (jsonb_typeof(evidence) = 'object'),
  checked_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index lnd_verifications_run_idx
  on public.lnd_verifications (run_id, checked_at);
create index lnd_verifications_source_result_idx
  on public.lnd_verifications (source_id, result, checked_at desc);

create table public.lnd_prematch_reports (
  id uuid primary key default gen_random_uuid(),
  idempotency_key text not null unique,
  fixture_id uuid not null references public.lnd_fixtures(id) on delete restrict,
  source_run_id uuid not null references public.lnd_agent_runs(id) on delete restrict,
  generated_at timestamptz not null default now(),
  data_cutoff_at timestamptz not null,
  content_markdown text not null,
  content_sha256 text not null
    check (content_sha256 ~ '^[0-9a-f]{64}$'),
  verification_status text not null default 'UNVERIFIED'
    check (verification_status in (
      'UNVERIFIED', 'PARSED', 'VERIFIED', 'AMBIGUOUS',
      'NON_VERIFICABILE', 'REJECTED'
    )),
  status text not null default 'DRAFT'
    check (status in ('DRAFT', 'READY', 'SENT', 'FAILED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index lnd_prematch_reports_fixture_idx
  on public.lnd_prematch_reports (fixture_id, generated_at desc);

create table public.lnd_notifications (
  id uuid primary key default gen_random_uuid(),
  dedupe_key text not null unique,
  run_id uuid not null references public.lnd_agent_runs(id) on delete restrict,
  measure_id uuid
    references public.lnd_disciplinary_measures(id) on delete restrict,
  report_id uuid references public.lnd_prematch_reports(id) on delete restrict,
  channel text not null check (channel in ('TELEGRAM', 'OTHER')),
  destination_ref_hash text not null,
  payload_sha256 text not null
    check (payload_sha256 ~ '^[0-9a-f]{64}$'),
  payload_preview text,
  status text not null default 'PENDING'
    check (status in ('PENDING', 'SENT', 'FAILED', 'SKIPPED')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  provider_message_id text,
  sent_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint lnd_notifications_has_subject check (
    measure_id is not null or report_id is not null
  )
);

create index lnd_notifications_status_idx
  on public.lnd_notifications (status, created_at);
create index lnd_notifications_measure_idx
  on public.lnd_notifications (measure_id)
  where measure_id is not null;

create trigger lnd_seasons_touch_updated_at
before update on public.lnd_seasons
for each row execute function public.lnd_touch_updated_at();

create trigger lnd_competitions_touch_updated_at
before update on public.lnd_competitions
for each row execute function public.lnd_touch_updated_at();

create trigger lnd_teams_touch_updated_at
before update on public.lnd_teams
for each row execute function public.lnd_touch_updated_at();

create trigger lnd_sources_touch_updated_at
before update on public.lnd_sources
for each row execute function public.lnd_touch_updated_at();

create trigger lnd_agent_runs_touch_updated_at
before update on public.lnd_agent_runs
for each row execute function public.lnd_touch_updated_at();

create trigger lnd_documents_touch_updated_at
before update on public.lnd_documents
for each row execute function public.lnd_touch_updated_at();

create trigger lnd_documents_protect_verified
before update on public.lnd_documents
for each row execute function public.lnd_protect_verified_document();

create trigger lnd_documents_prevent_delete
before delete on public.lnd_documents
for each row execute function public.lnd_prevent_audit_delete();

create trigger lnd_team_aliases_touch_updated_at
before update on public.lnd_team_aliases
for each row execute function public.lnd_touch_updated_at();

create trigger lnd_persons_touch_updated_at
before update on public.lnd_persons
for each row execute function public.lnd_touch_updated_at();

create trigger lnd_registrations_touch_updated_at
before update on public.lnd_registrations
for each row execute function public.lnd_touch_updated_at();

create trigger lnd_fixtures_touch_updated_at
before update on public.lnd_fixtures
for each row execute function public.lnd_touch_updated_at();

create trigger lnd_measures_touch_updated_at
before update on public.lnd_disciplinary_measures
for each row execute function public.lnd_touch_updated_at();

create trigger lnd_measures_protect_verified
before update on public.lnd_disciplinary_measures
for each row execute function public.lnd_protect_verified_measure();

create trigger lnd_measures_prevent_delete
before delete on public.lnd_disciplinary_measures
for each row execute function public.lnd_prevent_audit_delete();

create trigger lnd_ledger_touch_updated_at
before update on public.lnd_suspension_ledger
for each row execute function public.lnd_touch_updated_at();

create trigger lnd_ledger_protect_verified
before update on public.lnd_suspension_ledger
for each row execute function public.lnd_protect_verified_ledger_entry();

create trigger lnd_ledger_prevent_delete
before delete on public.lnd_suspension_ledger
for each row execute function public.lnd_prevent_audit_delete();

create trigger lnd_verifications_touch_updated_at
before update on public.lnd_verifications
for each row execute function public.lnd_touch_updated_at();

create trigger lnd_prematch_reports_touch_updated_at
before update on public.lnd_prematch_reports
for each row execute function public.lnd_touch_updated_at();

create trigger lnd_notifications_touch_updated_at
before update on public.lnd_notifications
for each row execute function public.lnd_touch_updated_at();

alter table public.lnd_seasons enable row level security;
alter table public.lnd_competitions enable row level security;
alter table public.lnd_teams enable row level security;
alter table public.lnd_team_aliases enable row level security;
alter table public.lnd_fixtures enable row level security;
alter table public.lnd_persons enable row level security;
alter table public.lnd_registrations enable row level security;
alter table public.lnd_sources enable row level security;
alter table public.lnd_documents enable row level security;
alter table public.lnd_disciplinary_measures enable row level security;
alter table public.lnd_suspension_ledger enable row level security;
alter table public.lnd_agent_runs enable row level security;
alter table public.lnd_verifications enable row level security;
alter table public.lnd_notifications enable row level security;
alter table public.lnd_prematch_reports enable row level security;

revoke all on table public.lnd_seasons from public, anon, authenticated;
revoke all on table public.lnd_competitions from public, anon, authenticated;
revoke all on table public.lnd_teams from public, anon, authenticated;
revoke all on table public.lnd_team_aliases from public, anon, authenticated;
revoke all on table public.lnd_fixtures from public, anon, authenticated;
revoke all on table public.lnd_persons from public, anon, authenticated;
revoke all on table public.lnd_registrations from public, anon, authenticated;
revoke all on table public.lnd_sources from public, anon, authenticated;
revoke all on table public.lnd_documents from public, anon, authenticated;
revoke all on table public.lnd_disciplinary_measures from public, anon, authenticated;
revoke all on table public.lnd_suspension_ledger from public, anon, authenticated;
revoke all on table public.lnd_agent_runs from public, anon, authenticated;
revoke all on table public.lnd_verifications from public, anon, authenticated;
revoke all on table public.lnd_notifications from public, anon, authenticated;
revoke all on table public.lnd_prematch_reports from public, anon, authenticated;

grant usage on schema public to lnd_watcher_worker;
grant select, insert, update on table public.lnd_seasons to lnd_watcher_worker;
grant select, insert, update on table public.lnd_competitions to lnd_watcher_worker;
grant select, insert, update on table public.lnd_teams to lnd_watcher_worker;
grant select, insert, update on table public.lnd_team_aliases to lnd_watcher_worker;
grant select, insert, update on table public.lnd_fixtures to lnd_watcher_worker;
grant select, insert, update on table public.lnd_persons to lnd_watcher_worker;
grant select, insert, update on table public.lnd_registrations to lnd_watcher_worker;
grant select, insert, update on table public.lnd_sources to lnd_watcher_worker;
grant select, insert, update on table public.lnd_documents to lnd_watcher_worker;
grant select, insert, update on table public.lnd_disciplinary_measures to lnd_watcher_worker;
grant select, insert, update on table public.lnd_suspension_ledger to lnd_watcher_worker;
grant select, insert, update on table public.lnd_agent_runs to lnd_watcher_worker;
grant select, insert, update on table public.lnd_verifications to lnd_watcher_worker;
grant select, insert, update on table public.lnd_notifications to lnd_watcher_worker;
grant select, insert, update on table public.lnd_prematch_reports to lnd_watcher_worker;

create policy lnd_worker_all on public.lnd_seasons
for all to lnd_watcher_worker using (true) with check (true);
create policy lnd_worker_all on public.lnd_competitions
for all to lnd_watcher_worker using (true) with check (true);
create policy lnd_worker_all on public.lnd_teams
for all to lnd_watcher_worker using (true) with check (true);
create policy lnd_worker_all on public.lnd_team_aliases
for all to lnd_watcher_worker using (true) with check (true);
create policy lnd_worker_all on public.lnd_fixtures
for all to lnd_watcher_worker using (true) with check (true);
create policy lnd_worker_all on public.lnd_persons
for all to lnd_watcher_worker using (true) with check (true);
create policy lnd_worker_all on public.lnd_registrations
for all to lnd_watcher_worker using (true) with check (true);
create policy lnd_worker_all on public.lnd_sources
for all to lnd_watcher_worker using (true) with check (true);
create policy lnd_worker_all on public.lnd_documents
for all to lnd_watcher_worker using (true) with check (true);
create policy lnd_worker_all on public.lnd_disciplinary_measures
for all to lnd_watcher_worker using (true) with check (true);
create policy lnd_worker_all on public.lnd_suspension_ledger
for all to lnd_watcher_worker using (true) with check (true);
create policy lnd_worker_all on public.lnd_agent_runs
for all to lnd_watcher_worker using (true) with check (true);
create policy lnd_worker_all on public.lnd_verifications
for all to lnd_watcher_worker using (true) with check (true);
create policy lnd_worker_all on public.lnd_notifications
for all to lnd_watcher_worker using (true) with check (true);
create policy lnd_worker_all on public.lnd_prematch_reports
for all to lnd_watcher_worker using (true) with check (true);

create or replace function public.lnd_get_analytics_discipline_countercheck()
returns table (
  analytics_player_id text,
  analytics_player_name text,
  analytics_category text,
  analytics_yellow_cards bigint,
  analytics_red_cards bigint,
  analytics_yellow_events bigint,
  analytics_red_events bigint,
  lnd_person_id uuid,
  lnd_season_code text,
  lnd_competition_id uuid,
  lnd_competition_name text,
  official_diffide_count bigint,
  official_suspension_measure_count bigint,
  official_imposed_gamedays bigint,
  official_residual_gamedays bigint,
  comparison_status text,
  review_flag text,
  comparison_note text
)
language sql
stable
security definer
set search_path = ''
set row_security = off
as $$
  with analytics_stats as (
    select
      p.player_id,
      p.nome,
      case
        when m.match_id is null then 'NON_VERIFICABILE'
        when lower(coalesce(m.competizione, '')) like '%coppa%' then 'COPPA'
        when nullif(btrim(coalesce(m.competizione, '')), '') is null
          then 'NON_VERIFICABILE'
        else 'CAMPIONATO'
      end as analytics_category,
      coalesce(sum(coalesce(s.ammonizioni, 0)), 0)::bigint as yellow_cards,
      coalesce(sum(coalesce(s.espulsioni, 0)), 0)::bigint as red_cards
    from public.players p
    left join public.player_match_stats s on s.player_id = p.player_id
    left join public.matches m on m.match_id = s.match_id
    group by p.player_id, p.nome, 3
  ),
  analytics_events as (
    select
      e.player_id,
      case
        when lower(coalesce(m.competizione, '')) like '%coppa%' then 'COPPA'
        when nullif(btrim(coalesce(m.competizione, '')), '') is null
          then 'NON_VERIFICABILE'
        else 'CAMPIONATO'
      end as analytics_category,
      count(*) filter (
        where e.event_type in ('YELLOW_CARD', 'SECOND_YELLOW_CARD')
      )::bigint as yellow_events,
      count(*) filter (
        where e.event_type in ('RED_CARD', 'SECOND_YELLOW_CARD')
      )::bigint as red_events
    from public.match_events e
    join public.matches m on m.match_id = e.match_id
    where e.player_id is not null
    group by e.player_id, 2
  ),
  analytics as (
    select
      s.player_id,
      s.nome,
      s.analytics_category,
      s.yellow_cards,
      s.red_cards,
      coalesce(e.yellow_events, 0)::bigint as yellow_events,
      coalesce(e.red_events, 0)::bigint as red_events
    from analytics_stats s
    left join analytics_events e
      on e.player_id = s.player_id
     and e.analytics_category = s.analytics_category
  ),
  official as (
    select
      dm.person_id,
      dm.season_id,
      dm.competition_id,
      c.analytics_category,
      count(*) filter (where dm.measure_type = 'DIFFIDA')::bigint
        as diffide_count,
      count(*) filter (
        where dm.measure_type in ('SUSPENSION', 'EXPULSION')
      )::bigint as suspension_measure_count,
      coalesce(sum(dm.gamedays) filter (
        where dm.measure_type in ('SUSPENSION', 'EXPULSION')
      ), 0)::bigint as imposed_gamedays
    from public.lnd_disciplinary_measures dm
    join public.lnd_competitions c on c.id = dm.competition_id
    where dm.person_id is not null
      and dm.verification_status = 'VERIFIED'
      and dm.record_status = 'ACTIVE'
    group by dm.person_id, dm.season_id, dm.competition_id, c.analytics_category
  ),
  ledger as (
    select
      sl.person_id,
      sl.season_id,
      sl.competition_id,
      coalesce(sum(sl.delta_gamedays), 0)::bigint as residual_gamedays
    from public.lnd_suspension_ledger sl
    join public.lnd_disciplinary_measures dm on dm.id = sl.measure_id
    where sl.verification_status = 'VERIFIED'
      and dm.record_status = 'ACTIVE'
    group by sl.person_id, sl.season_id, sl.competition_id
  )
  select
    a.player_id::text as analytics_player_id,
    a.nome::text as analytics_player_name,
    a.analytics_category::text,
    a.yellow_cards::bigint as analytics_yellow_cards,
    a.red_cards::bigint as analytics_red_cards,
    a.yellow_events::bigint as analytics_yellow_events,
    a.red_events::bigint as analytics_red_events,
    lp.id as lnd_person_id,
    s.code::text as lnd_season_code,
    c.id as lnd_competition_id,
    c.official_name::text as lnd_competition_name,
    coalesce(o.diffide_count, 0)::bigint as official_diffide_count,
    coalesce(o.suspension_measure_count, 0)::bigint
      as official_suspension_measure_count,
    coalesce(o.imposed_gamedays, 0)::bigint as official_imposed_gamedays,
    l.residual_gamedays::bigint as official_residual_gamedays,
    case
      when lp.id is null then 'NON_VERIFICABILE'
      when o.person_id is null then 'NON_VERIFICABILE'
      when o.analytics_category is null then 'NON_VERIFICABILE'
      when a.analytics_category = 'NON_VERIFICABILE' then 'NON_VERIFICABILE'
      when o.analytics_category <> a.analytics_category then 'NON_VERIFICABILE'
      else 'CONFRONTO_DESCRITTIVO'
    end::text as comparison_status,
    case
      when lp.id is null then 'IDENTITA_NON_MAPPATA'
      when o.person_id is null then 'NESSUN_PROVVEDIMENTO_UFFICIALE_CONFERMATO'
      when a.analytics_category = 'NON_VERIFICABILE'
        then 'COMPETIZIONE_ANALYTICS_NON_VERIFICABILE'
      when o.suspension_measure_count > 0
       and a.yellow_cards = 0
       and a.red_cards = 0
       and a.yellow_events = 0
       and a.red_events = 0
        then 'POSSIBILE_DISALLINEAMENTO_DA_REVISIONARE'
      else 'NESSUNA_EQUIVALENZA_AUTOMATICA'
    end::text as review_flag,
    'I conteggi Analytics sono evidenze interne di partita; diffide, provvedimenti e residui LND restano concetti distinti. Analytics non espone una stagione verificabile nello schema corrente.'::text
      as comparison_note
  from analytics a
  left join public.lnd_persons lp
    on lp.analytics_player_id = a.player_id
  left join official o
    on o.person_id = lp.id
   and (
     o.analytics_category = a.analytics_category or
     a.analytics_category = 'NON_VERIFICABILE'
   )
  left join public.lnd_seasons s on s.id = o.season_id
  left join public.lnd_competitions c on c.id = o.competition_id
  left join ledger l
    on l.person_id = o.person_id
   and l.season_id = o.season_id
   and l.competition_id = o.competition_id
$$;

revoke all on function public.lnd_get_analytics_discipline_countercheck()
  from public, anon, authenticated;
grant execute on function public.lnd_get_analytics_discipline_countercheck()
  to lnd_watcher_worker;

create view public.lnd_analytics_discipline_countercheck
with (security_invoker = true)
as
select *
from public.lnd_get_analytics_discipline_countercheck();

revoke all on table public.lnd_analytics_discipline_countercheck
  from public, anon, authenticated;
grant select on table public.lnd_analytics_discipline_countercheck
  to lnd_watcher_worker;

comment on role lnd_watcher_worker is
  'NOLOGIN role for a separately provisioned n8n PostgreSQL login. Grants access only to LND-WATCHER objects and the constrained Analytics countercheck.';

comment on view public.lnd_analytics_discipline_countercheck is
  'Read-only descriptive countercheck. It never equates Analytics cards with official LND measures or residual suspensions.';

commit;
