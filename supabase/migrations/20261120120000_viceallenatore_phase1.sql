begin;

-- Canonical match/player IDs are text in the existing Analytics schema. The LND
-- season registry is separate; season_id stays optional until a verified link exists.
create or replace function public.va_staff()
returns boolean language sql stable security definer
set search_path = public, pg_temp
as $$ select exists (select 1 from public.utenti u where u.id = auth.uid() and u.attivo is true and upper(u.ruolo::text) = 'STAFF') $$;
revoke all on function public.va_staff() from public, anon;
grant execute on function public.va_staff() to authenticated, service_role;

create or replace function public.va_touch()
returns trigger language plpgsql set search_path = public, pg_temp
as $$ begin new.updated_at = now(); return new; end $$;
revoke all on function public.va_touch() from public, anon, authenticated;

create or replace function public.va_lock_approved()
returns trigger language plpgsql set search_path = public, pg_temp
as $$ begin
  if tg_op = 'DELETE' or (tg_op = 'UPDATE' and old.status = 'approved') then
    raise exception 'Approved tactical versions are immutable' using errcode = 'integrity_constraint_violation';
  end if;
  return new;
end $$;
revoke all on function public.va_lock_approved() from public, anon, authenticated;

create table public.tactical_models (
  id uuid primary key default gen_random_uuid(),
  season_label text not null,
  season_id uuid references public.lnd_seasons(id) on delete restrict,
  title text not null,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.tactical_model_versions (
  id uuid primary key default gen_random_uuid(),
  model_id uuid not null references public.tactical_models(id) on delete restrict,
  version integer not null check (version > 0),
  status text not null default 'draft' check (status in ('draft','approved','superseded')),
  snapshot jsonb not null default '{}'::jsonb,
  snapshot_sha256 text,
  created_by uuid not null references auth.users(id),
  approved_by uuid references auth.users(id),
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  unique(model_id,version),
  check ((status = 'approved') = (approved_by is not null and approved_at is not null))
);
create table public.match_game_plans (
  id uuid primary key default gen_random_uuid(),
  match_id text not null references public.matches(match_id) on delete restrict,
  model_version_id uuid references public.tactical_model_versions(id) on delete restrict,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique(match_id)
);
create table public.analysis_sources (
  id uuid primary key default gen_random_uuid(),
  match_id text references public.matches(match_id) on delete restrict,
  provider text not null check (provider in ('veo','youcoach','staff','other')),
  kind text not null check (kind in ('video','mhtml','pdf','annotation','clip','other')),
  filename text not null,
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  mime_type text,
  size_bytes bigint check (size_bytes >= 0),
  duration_ms bigint check (duration_ms >= 0),
  width integer check (width > 0),
  height integer check (height > 0),
  source_limits text,
  extracted_metadata jsonb not null default '{}'::jsonb,
  review_status text not null default 'pending' check (review_status in ('pending','reviewed','rejected')),
  imported_by uuid not null references auth.users(id),
  imported_at timestamptz not null default now(),
  unique(match_id,sha256)
);
create table public.source_reconciliations (
  id uuid primary key default gen_random_uuid(),
  match_id text not null references public.matches(match_id) on delete restrict,
  field_name text not null,
  source_a_id uuid not null references public.analysis_sources(id) on delete restrict,
  value_a text not null,
  source_b_id uuid not null references public.analysis_sources(id) on delete restrict,
  value_b text not null,
  approved_value text,
  status text not null default 'pending' check (status in ('pending','approved','unresolved')),
  reason text,
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  unique(match_id,field_name,source_a_id,source_b_id),
  check (source_a_id <> source_b_id)
);
create table public.game_plan_versions (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.match_game_plans(id) on delete restrict,
  model_version_id uuid not null references public.tactical_model_versions(id) on delete restrict,
  version integer not null check (version > 0),
  status text not null default 'draft' check (status in ('draft','approved','superseded')),
  pdf_source_id uuid references public.analysis_sources(id) on delete restrict,
  snapshot_sha256 text,
  created_by uuid not null references auth.users(id),
  approved_by uuid references auth.users(id),
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  unique(plan_id,version),
  check ((status = 'approved') = (approved_by is not null and approved_at is not null))
);
create table public.tactical_principles (
  id uuid primary key default gen_random_uuid(),
  game_plan_version_id uuid not null references public.game_plan_versions(id) on delete restrict,
  title text not null,
  phase text not null,
  conditions text,
  justified_exceptions text,
  zone text,
  roles text[],
  expected_behavior text not null,
  measure_criteria text,
  pdf_page integer check (pdf_page > 0),
  review_status text not null default 'draft' check (review_status in ('draft','reviewed')),
  created_at timestamptz not null default now()
);
create table public.match_tactical_events (
  id uuid primary key default gen_random_uuid(),
  match_id text not null references public.matches(match_id) on delete restrict,
  event_schema_version text not null default '1.0.0',
  analysis_pipeline_version text not null default 'manual-1',
  period text not null default 'unknown' check (period in ('first_half','second_half','extra_time','unknown')),
  video_start_ms bigint check (video_start_ms >= 0),
  video_end_ms bigint check (video_end_ms >= 0),
  game_minute integer check (game_minute >= 0),
  game_stoppage integer check (game_stoppage >= 0),
  clock_mapping_verified boolean not null default false,
  event_type text not null,
  phase text not null default 'unknown',
  zone text,
  player_id text references public.players(player_id) on delete restrict,
  observability text not null default 'not_observable' check (observability in ('observable','partially_observable','not_observable')),
  relevance text not null default 'undetermined' check (relevance in ('relevant','not_relevant','undetermined')),
  source_id uuid references public.analysis_sources(id) on delete restrict,
  description text not null,
  review_status text not null default 'proposed' check (review_status in ('proposed','reviewed')),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (video_start_ms is null or video_end_ms is null or video_start_ms <= video_end_ms),
  check ((video_start_ms is null) = (video_end_ms is null))
);
create table public.video_clock_segments (
  id uuid primary key default gen_random_uuid(),
  match_id text not null references public.matches(match_id) on delete restrict,
  source_id uuid not null references public.analysis_sources(id) on delete restrict,
  video_start_ms bigint not null check (video_start_ms >= 0),
  video_end_ms bigint not null check (video_end_ms >= video_start_ms),
  period text not null check (period in ('first_half','second_half','extra_time')),
  game_start_minute integer not null check (game_start_minute >= 0),
  game_start_stoppage integer not null default 0 check (game_start_stoppage >= 0),
  notes text not null,
  verified_by uuid not null references auth.users(id),
  verified_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique(match_id,source_id,video_start_ms,video_end_ms)
);
create table public.event_evidence (
  event_id uuid not null references public.match_tactical_events(id) on delete restrict,
  source_id uuid not null references public.analysis_sources(id) on delete restrict,
  stance text not null default 'supports' check (stance in ('supports','contradicts','context')),
  start_ms bigint check (start_ms >= 0),
  end_ms bigint check (end_ms >= 0),
  pdf_page integer check (pdf_page > 0),
  field_of_view_limits text,
  primary key(event_id,source_id),
  check (start_ms is null or end_ms is null or start_ms <= end_ms)
);
create table public.tactical_claims (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references public.match_tactical_events(id) on delete restrict,
  principle_id uuid references public.tactical_principles(id) on delete restrict,
  claim_type text not null check (claim_type in ('osservazione','interpretazione','ipotesi')),
  claim_text text not null,
  confidence text not null default 'unknown',
  evidence_quality text not null default 'unknown',
  observability text not null default 'not_observable',
  review_status text not null default 'proposed' check (review_status in ('proposed','reviewed','rejected')),
  valid_from timestamptz,
  valid_until timestamptz,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  check (valid_until is null or valid_from is null or valid_until >= valid_from)
);
create table public.claim_evidence (
  claim_id uuid not null references public.tactical_claims(id) on delete restrict,
  source_id uuid not null references public.analysis_sources(id) on delete restrict,
  stance text not null check (stance in ('supports','contradicts','context')),
  note text,
  primary key(claim_id,source_id)
);
create table public.event_assessments (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.match_tactical_events(id) on delete restrict,
  principle_id uuid not null references public.tactical_principles(id) on delete restrict,
  game_plan_version_id uuid not null references public.game_plan_versions(id) on delete restrict,
  plan_compliance text not null check (plan_compliance in ('conforme','non_conforme','adattamento_giustificato','non_valutabile')),
  technical_quality text not null default 'non_valutabile' check (technical_quality in ('positiva','negativa','mista','non_valutabile')),
  reason text not null,
  principle_condition text,
  observability text not null,
  relevance text not null,
  review_status text not null default 'proposed' check (review_status in ('proposed','reviewed')),
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);
create table public.coach_impressions (
  id uuid primary key default gen_random_uuid(),
  match_id text not null references public.matches(match_id) on delete restrict,
  impression_text text not null,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);
create table public.impression_reviews (
  id uuid primary key default gen_random_uuid(),
  impression_id uuid not null references public.coach_impressions(id) on delete restrict,
  revision integer not null check (revision > 0),
  verdict text not null check (verdict in ('supportata','contraddetta','parzialmente_supportata','evidenza_insufficiente')),
  reasoning text not null,
  supporting_event_ids uuid[] not null default '{}',
  contrary_event_ids uuid[] not null default '{}',
  staff_response text check (staff_response in ('accetto','contesto','rinvio')),
  response_note text,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique(impression_id,revision)
);
create table public.tactical_findings (
  id uuid primary key default gen_random_uuid(),
  match_id text not null references public.matches(match_id) on delete restrict,
  principle_id uuid references public.tactical_principles(id) on delete restrict,
  scope text not null check (scope in ('strength','weakness','opponent_vulnerability')),
  title text not null,
  context text,
  violations integer not null default 0 check (violations >= 0),
  observed_opportunities integer not null default 0 check (observed_opportunities >= violations),
  evidence_quality text not null default 'unknown',
  status text not null default 'ipotizzato' check (status in ('ipotizzato','confermato','archiviato')),
  first_seen_at timestamptz,
  last_seen_at timestamptz,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.finding_evidence (
  finding_id uuid not null references public.tactical_findings(id) on delete restrict,
  event_id uuid not null references public.match_tactical_events(id) on delete restrict,
  stance text not null check (stance in ('supports','contradicts')),
  primary key(finding_id,event_id)
);
create table public.training_interventions (
  id uuid primary key default gen_random_uuid(),
  finding_id uuid not null references public.tactical_findings(id) on delete restrict,
  observable_objective text not null,
  exercise text not null,
  planned_for date,
  approved_by uuid references auth.users(id),
  approved_at timestamptz,
  performed_at timestamptz,
  staff_evaluation text,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);
create table public.followup_checks (
  id uuid primary key default gen_random_uuid(),
  finding_id uuid not null references public.tactical_findings(id) on delete restrict,
  intervention_id uuid references public.training_interventions(id) on delete restrict,
  target_match_id text references public.matches(match_id) on delete restrict,
  comparable_conditions text,
  observed_opportunities integer check (observed_opportunities >= 0),
  observed_incidents integer check (observed_incidents >= 0),
  verdict text check (verdict in ('migliorato','non_migliorato','incerto','non_valutabile')),
  explanation text,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  check (observed_opportunities is null or observed_incidents is null or observed_incidents <= observed_opportunities)
);
create table public.decision_briefings (
  id uuid primary key default gen_random_uuid(),
  match_id text not null references public.matches(match_id) on delete restrict,
  game_plan_version_id uuid references public.game_plan_versions(id) on delete restrict,
  status text not null default 'draft' check (status in ('draft','approved')),
  created_by uuid not null references auth.users(id),
  approved_by uuid references auth.users(id),
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  check ((status = 'approved') = (approved_by is not null and approved_at is not null))
);
create table public.briefing_items (
  id uuid primary key default gen_random_uuid(),
  briefing_id uuid not null references public.decision_briefings(id) on delete restrict,
  position integer not null check (position between 1 and 3),
  decision_text text not null,
  rationale text not null,
  supporting_evidence text not null,
  contrary_evidence text,
  confidence_reason text not null,
  alternatives text,
  expected_impact_hypothesis text,
  next_match_check text not null,
  unique(briefing_id,position)
);
create table public.analysis_jobs (
  id uuid primary key default gen_random_uuid(),
  match_id text not null references public.matches(match_id) on delete restrict,
  source_id uuid references public.analysis_sources(id) on delete restrict,
  job_type text not null,
  status text not null check (status in ('queued','running','completed','failed')),
  pipeline_version text not null,
  diagnostic text,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.analysis_audit_log (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null,
  entity_id uuid not null,
  action text not null,
  old_revision integer,
  new_revision integer,
  reason text,
  actor_id uuid references auth.users(id),
  occurred_at timestamptz not null default now()
);

create index on public.tactical_models(season_id);
create index on public.match_tactical_events(match_id,video_start_ms,video_end_ms);
create index on public.match_tactical_events(player_id);
create index on public.match_tactical_events(source_id);
create index on public.video_clock_segments(match_id,video_start_ms,video_end_ms);
create index on public.event_assessments(game_plan_version_id,plan_compliance);
create index on public.tactical_principles(game_plan_version_id);
create index on public.tactical_findings(match_id,status);
create index on public.followup_checks(target_match_id);
create index on public.analysis_sources(match_id,provider);
create index on public.source_reconciliations(match_id,status);

create trigger va_models_touch before update on public.tactical_models for each row execute function public.va_touch();
create trigger va_events_touch before update on public.match_tactical_events for each row execute function public.va_touch();
create trigger va_findings_touch before update on public.tactical_findings for each row execute function public.va_touch();
create trigger va_jobs_touch before update on public.analysis_jobs for each row execute function public.va_touch();
create trigger va_lock_model_versions before update or delete on public.tactical_model_versions for each row execute function public.va_lock_approved();
create trigger va_lock_plan_versions before update or delete on public.game_plan_versions for each row execute function public.va_lock_approved();

create or replace function public.va_validate_approval()
returns trigger language plpgsql set search_path = public, pg_temp
as $$ declare match_key text; begin
  if new.status <> 'approved' then return new; end if;
  if new.snapshot_sha256 is null or new.snapshot_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception 'Approved version requires a SHA-256 snapshot' using errcode='check_violation';
  end if;
  if tg_table_name = 'tactical_model_versions' then
    if jsonb_typeof(new.snapshot->'principles') is distinct from 'array' then
      raise exception 'Approved model requires structured principles' using errcode='check_violation';
    end if;
    if jsonb_array_length(new.snapshot->'principles') = 0 then
      raise exception 'Approved model requires structured principles' using errcode='check_violation';
    end if;
  else
    if new.pdf_source_id is null or not exists (select 1 from public.tactical_principles where game_plan_version_id = new.id) then
      raise exception 'Approved plan requires PDF and principles' using errcode='check_violation';
    end if;
    select p.match_id into match_key from public.match_game_plans p where p.id = new.plan_id;
    if not exists (select 1 from public.analysis_sources s where s.id = new.pdf_source_id and s.match_id = match_key and s.kind = 'pdf' and s.review_status = 'reviewed') then
      raise exception 'Plan PDF belongs to another match' using errcode='foreign_key_violation';
    end if;
    if not exists (select 1 from public.tactical_model_versions m where m.id = new.model_version_id and m.status = 'approved') then
      raise exception 'Plan requires approved tactical model' using errcode='foreign_key_violation';
    end if;
  end if;
  return new;
end $$;
revoke all on function public.va_validate_approval() from public, anon, authenticated;
create trigger va_validate_model_approval before insert or update on public.tactical_model_versions for each row execute function public.va_validate_approval();
create trigger va_validate_plan_approval before insert or update on public.game_plan_versions for each row execute function public.va_validate_approval();

-- Draft principles also become immutable when their parent version is approved.
create or replace function public.va_lock_principle()
returns trigger language plpgsql set search_path = public, pg_temp
as $$ begin
  if exists (
    select 1 from public.game_plan_versions v
    where v.id = coalesce(new.game_plan_version_id,old.game_plan_version_id) and v.status = 'approved'
  ) then raise exception 'Approved plan principles are immutable' using errcode = 'integrity_constraint_violation'; end if;
  return coalesce(new,old);
end $$;
revoke all on function public.va_lock_principle() from public, anon, authenticated;
create trigger va_lock_principles before update or delete on public.tactical_principles for each row execute function public.va_lock_principle();

create or replace function public.va_lock_briefing()
returns trigger language plpgsql set search_path = public, pg_temp
as $$ begin
  if tg_table_name = 'decision_briefings' then
    if tg_op <> 'INSERT' and old.status = 'approved' then
      raise exception 'Approved briefing is immutable' using errcode='integrity_constraint_violation';
    end if;
  elsif exists (select 1 from public.decision_briefings where id = coalesce(new.briefing_id,old.briefing_id) and status = 'approved') then
    raise exception 'Items in an approved briefing are immutable' using errcode='integrity_constraint_violation';
  end if;
  return coalesce(new,old);
end $$;
revoke all on function public.va_lock_briefing() from public, anon, authenticated;
create trigger va_lock_briefing before update or delete on public.decision_briefings for each row execute function public.va_lock_briefing();
create trigger va_lock_briefing_items before insert or update or delete on public.briefing_items for each row execute function public.va_lock_briefing();

create or replace function public.va_lock_verified_evidence()
returns trigger language plpgsql set search_path = public, pg_temp
as $$ begin
  if tg_table_name = 'analysis_sources' then
    if row(new.match_id,new.provider,new.kind,new.filename,new.sha256,new.size_bytes,new.duration_ms,new.width,new.height)
       is distinct from row(old.match_id,old.provider,old.kind,old.filename,old.sha256,old.size_bytes,old.duration_ms,old.width,old.height)
       or old.review_status = 'reviewed' then
      raise exception 'Source identity and reviewed status are immutable' using errcode='integrity_constraint_violation';
    end if;
  elsif tg_table_name = 'match_tactical_events' then
    if old.review_status = 'reviewed' or exists (select 1 from public.event_assessments a where a.event_id = old.id and a.review_status = 'reviewed') then
      raise exception 'Reviewed event is immutable; create a new revision' using errcode='integrity_constraint_violation';
    end if;
  elsif tg_table_name = 'event_assessments' or tg_table_name = 'tactical_claims' then
    if old.review_status = 'reviewed' then
      raise exception 'Reviewed conclusion is immutable' using errcode='integrity_constraint_violation';
    end if;
  end if;
  return new;
end $$;
revoke all on function public.va_lock_verified_evidence() from public, anon, authenticated;
create trigger va_lock_source before update on public.analysis_sources for each row execute function public.va_lock_verified_evidence();
create trigger va_lock_event before update on public.match_tactical_events for each row execute function public.va_lock_verified_evidence();
create trigger va_lock_assessment before update on public.event_assessments for each row execute function public.va_lock_verified_evidence();
create trigger va_lock_claim before update on public.tactical_claims for each row execute function public.va_lock_verified_evidence();

create or replace function public.va_confirm_finding()
returns trigger language plpgsql set search_path = public, pg_temp
as $$ begin
  if new.status = 'confermato' and old.status is distinct from 'confermato' and not exists (
    select 1 from public.finding_evidence fe
    join public.match_tactical_events e on e.id = fe.event_id
    join public.event_assessments a on a.event_id = e.id and a.review_status = 'reviewed'
    join public.event_evidence ev on ev.event_id = e.id
    join public.analysis_sources s on s.id = ev.source_id and s.kind = 'clip' and s.review_status = 'reviewed'
    where fe.finding_id = new.id and fe.stance = 'supports'
  ) then raise exception 'Finding requires a reviewed episode with a clip' using errcode='integrity_constraint_violation'; end if;
  return new;
end $$;
revoke all on function public.va_confirm_finding() from public, anon, authenticated;
create trigger va_confirm_finding before update on public.tactical_findings for each row execute function public.va_confirm_finding();

create or replace function public.va_check_links()
returns trigger language plpgsql set search_path = public, pg_temp
as $$ declare event_match text; source_match text; begin
  if tg_table_name = 'match_tactical_events' then
    if new.source_id is not null then
      select match_id into source_match from public.analysis_sources where id = new.source_id;
      if source_match is distinct from new.match_id then raise exception 'Event source belongs to another match' using errcode='foreign_key_violation'; end if;
    end if;
  elsif tg_table_name = 'video_clock_segments' then
    select match_id into source_match from public.analysis_sources where id = new.source_id and kind = 'video';
    if source_match is distinct from new.match_id then raise exception 'Clock source must be a video of the match' using errcode='foreign_key_violation'; end if;
  elsif tg_table_name = 'event_evidence' then
    select match_id into event_match from public.match_tactical_events where id = new.event_id;
    select match_id into source_match from public.analysis_sources where id = new.source_id;
    if event_match is distinct from source_match then raise exception 'Evidence belongs to another match' using errcode='foreign_key_violation'; end if;
  elsif tg_table_name = 'source_reconciliations' then
    if not exists (select 1 from public.analysis_sources where id = new.source_a_id and match_id = new.match_id)
      or not exists (select 1 from public.analysis_sources where id = new.source_b_id and match_id = new.match_id)
    then raise exception 'Reconciliation sources belong to another match' using errcode='foreign_key_violation'; end if;
  elsif tg_table_name = 'event_assessments' then
    if not exists (select 1 from public.tactical_principles where id = new.principle_id and game_plan_version_id = new.game_plan_version_id)
    then raise exception 'Principle belongs to another plan version' using errcode='foreign_key_violation'; end if;
  elsif tg_table_name = 'finding_evidence' then
    if not exists (select 1 from public.tactical_findings f join public.match_tactical_events e on e.id = new.event_id where f.id = new.finding_id and f.match_id = e.match_id)
    then raise exception 'Finding evidence belongs to another match' using errcode='foreign_key_violation'; end if;
  elsif tg_table_name = 'claim_evidence' then
    select e.match_id into event_match from public.tactical_claims c join public.match_tactical_events e on e.id = c.event_id where c.id = new.claim_id;
    select match_id into source_match from public.analysis_sources where id = new.source_id;
    if event_match is not null and event_match is distinct from source_match
    then raise exception 'Claim evidence belongs to another match' using errcode='foreign_key_violation'; end if;
  end if;
  return new;
end $$;
revoke all on function public.va_check_links() from public, anon, authenticated;
do $$ declare t text; begin
  foreach t in array array['match_tactical_events','video_clock_segments','event_evidence','source_reconciliations','event_assessments','finding_evidence','claim_evidence'] loop
    execute format('create trigger %I before insert or update on public.%I for each row execute function public.va_check_links()', 'va_links_' || t, t);
  end loop;
end $$;

create or replace function public.va_audit_change()
returns trigger language plpgsql security definer set search_path = public, pg_temp
as $$ begin
  insert into public.analysis_audit_log(entity_type,entity_id,action,old_revision,new_revision,actor_id)
  values (tg_table_name, new.id, lower(tg_op),
          case when tg_op = 'UPDATE' then coalesce((to_jsonb(old)->>'version')::integer,(to_jsonb(old)->>'revision')::integer) else null end,
          coalesce((to_jsonb(new)->>'version')::integer,(to_jsonb(new)->>'revision')::integer), auth.uid());
  return new;
end $$;
revoke all on function public.va_audit_change() from public, anon, authenticated;
do $$ declare t text; begin
  foreach t in array array[
    'tactical_model_versions','game_plan_versions','tactical_principles',
    'analysis_sources','source_reconciliations','match_tactical_events','video_clock_segments',
    'tactical_claims','event_assessments','coach_impressions',
    'impression_reviews','tactical_findings','training_interventions',
    'followup_checks','decision_briefings','briefing_items'
  ] loop
    execute format('create trigger %I after insert or update on public.%I for each row execute function public.va_audit_change()', 'va_audit_' || t, t);
  end loop;
end $$;

-- No access to tactical data for anonymous users or players. API uses user JWT,
-- and staff access is checked by the same active-profile predicate as Analytics.
do $$ declare t text; begin
  foreach t in array array[
    'tactical_models','tactical_model_versions','match_game_plans','analysis_sources','source_reconciliations',
    'game_plan_versions','tactical_principles','match_tactical_events','video_clock_segments','event_evidence',
    'tactical_claims','claim_evidence','event_assessments','coach_impressions',
    'impression_reviews','tactical_findings','finding_evidence','training_interventions',
    'followup_checks','decision_briefings','briefing_items','analysis_jobs','analysis_audit_log'
  ] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from public, anon, authenticated',t);
    execute format('grant select, insert, update on public.%I to authenticated',t);
    execute format('grant all on public.%I to service_role',t);
    execute format('create policy va_staff_select on public.%I for select to authenticated using (public.va_staff())',t);
    execute format('create policy va_staff_insert on public.%I for insert to authenticated with check (public.va_staff())',t);
    execute format('create policy va_staff_update on public.%I for update to authenticated using (public.va_staff()) with check (public.va_staff())',t);
  end loop;
end $$;
-- Evidence and impressions are append-only through the client.
revoke update on public.coach_impressions, public.impression_reviews, public.analysis_audit_log, public.event_evidence, public.claim_evidence, public.finding_evidence from authenticated;
commit;
