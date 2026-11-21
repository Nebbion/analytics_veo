begin;
-- One setting per season. A model is reused, while approved versions remain immutable.
create table public.tactical_season_settings (
  season_label text primary key,
  model_id uuid not null references public.tactical_models(id) on delete restrict,
  updated_by uuid not null references auth.users(id),
  updated_at timestamptz not null default now()
);
create table public.tactical_analysis_drafts (
  id uuid primary key default gen_random_uuid(),
  match_id text not null references public.matches(match_id) on delete restrict,
  input_sha256 text not null check (input_sha256 ~ '^[a-f0-9]{64}$'),
  pipeline_version text not null default 'draft-rules-1',
  model_version_id uuid references public.tactical_model_versions(id) on delete restrict,
  input_snapshot jsonb not null,
  items jsonb not null check (jsonb_typeof(items) = 'array'),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique(match_id,input_sha256)
);
create table public.tactical_analysis_reviews (
  id uuid primary key default gen_random_uuid(),
  draft_id uuid not null references public.tactical_analysis_drafts(id) on delete restrict,
  item_key text not null,
  evidence_key text not null,
  verdict text not null check (verdict in ('accepted','corrected','dismissed')),
  corrected_text text,
  note text,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  check (verdict <> 'corrected' or (corrected_text is not null and length(trim(corrected_text)) > 0))
);
create index on public.tactical_analysis_drafts(match_id,created_at desc);
create index on public.tactical_analysis_reviews(draft_id,item_key,created_at desc);
-- Reject fabricated evidence references and actor spoofing at the persistence boundary.
create function public.va_validate_draft_review() returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
  if auth.uid() is distinct from new.created_by then raise exception 'Review actor does not match session' using errcode='42501'; end if;
  if not exists (select 1 from public.tactical_analysis_drafts d, jsonb_array_elements(d.items) item
    where d.id=new.draft_id and item->>'key'=new.item_key and item->>'evidence_key'=new.evidence_key)
  then raise exception 'Review item not in saved draft' using errcode='23503'; end if;
  return new;
end $$;
revoke all on function public.va_validate_draft_review() from public,anon,authenticated;
create trigger va_validate_draft_review before insert on public.tactical_analysis_reviews for each row execute function public.va_validate_draft_review();
create function public.va_validate_season_model() returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
  if not exists(select 1 from public.tactical_models m where m.id=new.model_id and
    regexp_replace(m.season_label,'^(\d{4})/(\d{2})$','\1/20\2')=new.season_label)
  then raise exception 'Model belongs to another season' using errcode='23503'; end if;
  new.updated_at=now(); return new;
end $$;
revoke all on function public.va_validate_season_model() from public,anon,authenticated;
create trigger va_validate_season_model before insert or update on public.tactical_season_settings for each row execute function public.va_validate_season_model();
do $$ declare t text; begin
  foreach t in array array['tactical_season_settings','tactical_analysis_drafts','tactical_analysis_reviews'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from public,anon,authenticated',t);
    execute format('grant select,insert on public.%I to authenticated',t);
    execute format('grant all on public.%I to service_role',t);
    execute format('create policy va_staff_select on public.%I for select to authenticated using(public.va_staff())',t);
    execute format('create policy va_staff_insert on public.%I for insert to authenticated with check(public.va_staff())',t);
  end loop;
end $$;
grant update on public.tactical_season_settings to authenticated;
create policy va_staff_update on public.tactical_season_settings for update to authenticated using(public.va_staff()) with check(public.va_staff());
create trigger va_audit_draft after insert on public.tactical_analysis_drafts for each row execute function public.va_audit_change();
create trigger va_audit_draft_review after insert on public.tactical_analysis_reviews for each row execute function public.va_audit_change();
commit;
