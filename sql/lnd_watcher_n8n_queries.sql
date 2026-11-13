-- LND-WATCHER 2.0 - Query parametrizzate per il nodo PostgreSQL di n8n.
--
-- Queste query presuppongono un login PostgreSQL server-side membro del ruolo
-- NOLOGIN lnd_watcher_worker. Non usare credenziali anon/authenticated e non
-- interpolare testo prodotto da AI nei frammenti SQL.
--
-- Timezone del workflow n8n: Europe/Rome.
-- Schedule consigliati:
--   0,30 15-19 * * 1,3,5
--   0    20    * * 1,3,5


-- ============================================================================
-- Q0. APERTURA IDEMPOTENTE DI UN RUN
-- Parametri:
--   $1 run_key              es. lnd-watcher:2026-11-13T15:00:00+01:00
--   $2 workflow_version
--   $3 scheduled_for        timestamptz
--   $4 scope                jsonb
-- ============================================================================
with inserted as (
  insert into public.lnd_agent_runs (
    run_key,
    workflow_name,
    workflow_version,
    scheduled_for,
    schedule_timezone,
    started_at,
    status,
    scope
  )
  values (
    $1,
    'LND-WATCHER 2.0',
    $2,
    $3::timestamptz,
    'Europe/Rome',
    now(),
    'RUNNING',
    $4::jsonb
  )
  on conflict (run_key) do nothing
  returning *
)
select * from inserted
union all
select *
from public.lnd_agent_runs
where run_key = $1
  and not exists (select 1 from inserted)
limit 1;


-- ============================================================================
-- Q1. VILLANOVESE E PROSSIME TRE AVVERSARIE
-- Non include fixture POSTPONED/CANCELLED/UNKNOWN.
-- Usa la data locale Europe/Rome e restituisce Villanovese una sola volta.
-- ============================================================================
with villanovese as (
  select id, team_key, official_name, verification_status
  from public.lnd_teams
  where team_key = 'it-veneto:asd-villanovese'
),
next_three as (
  select
    f.id as fixture_id,
    f.scheduled_date,
    f.kickoff_time,
    f.kickoff_timezone,
    f.competition_id,
    f.verification_status as fixture_verification_status,
    case
      when f.home_team_id = v.id then f.away_team_id
      else f.home_team_id
    end as opponent_team_id,
    row_number() over (
      order by f.scheduled_date, f.kickoff_time nulls last, f.id
    ) as fixture_order
  from public.lnd_fixtures f
  cross join villanovese v
  where v.id in (f.home_team_id, f.away_team_id)
    and f.status in ('SCHEDULED', 'RESCHEDULED')
    and f.scheduled_date >= (now() at time zone 'Europe/Rome')::date
  order by f.scheduled_date, f.kickoff_time nulls last, f.id
  limit 3
),
monitor_set as (
  select
    0::bigint as monitor_order,
    v.id as team_id,
    v.team_key,
    v.official_name,
    v.verification_status as team_verification_status,
    null::uuid as fixture_id,
    null::date as scheduled_date,
    null::time as kickoff_time,
    null::text as kickoff_timezone,
    null::uuid as competition_id,
    null::text as fixture_verification_status
  from villanovese v

  union all

  select
    n.fixture_order,
    t.id,
    t.team_key,
    t.official_name,
    t.verification_status,
    n.fixture_id,
    n.scheduled_date,
    n.kickoff_time,
    n.kickoff_timezone,
    n.competition_id,
    n.fixture_verification_status
  from next_three n
  join public.lnd_teams t on t.id = n.opponent_team_id
)
select *
from monitor_set
order by monitor_order;


-- ============================================================================
-- Q2. COMUNICATI GIA REGISTRATI/ANALIZZATI
-- Parametri:
--   $1 season_code          es. 2026/27
--   $2 source_id            uuid oppure NULL
-- ============================================================================
select
  d.id,
  d.document_key,
  d.bulletin_number,
  d.published_at,
  d.canonical_url,
  d.content_sha256,
  d.http_etag,
  d.http_last_modified,
  d.extraction_status,
  d.verification_status,
  d.replaces_document_id,
  d.updated_at
from public.lnd_documents d
join public.lnd_seasons s on s.id = d.season_id
where s.code = $1
  and ($2::uuid is null or d.source_id = $2::uuid)
order by d.published_at desc nulls last, d.created_at desc;


-- ============================================================================
-- Q3. REGISTRAZIONE IDEMPOTENTE DI UN NUOVO COMUNICATO TRAMITE SHA-256
-- Una rettifica deve avere document_key e hash propri e valorizzare
-- replaces_document_id. Un hash già noto restituisce il record esistente.
-- Parametri:
--   $1  document_key
--   $2  source_id
--   $3  season_id
--   $4  competition_id nullable
--   $5  document_type
--   $6  bulletin_number nullable
--   $7  published_at nullable
--   $8  canonical_url
--   $9  content_sha256 lowercase hex
--   $10 http_etag nullable
--   $11 http_last_modified nullable
--   $12 storage_path nullable
--   $13 mime_type
--   $14 size_bytes nullable
--   $15 replaces_document_id nullable
--   $16 discovered_run_id nullable
-- ============================================================================
with inserted as (
  insert into public.lnd_documents (
    document_key,
    source_id,
    season_id,
    competition_id,
    document_type,
    bulletin_number,
    published_at,
    canonical_url,
    content_sha256,
    http_etag,
    http_last_modified,
    storage_path,
    mime_type,
    size_bytes,
    replaces_document_id,
    discovered_run_id,
    extraction_status,
    verification_status
  )
  values (
    $1,
    $2::uuid,
    $3::uuid,
    $4::uuid,
    $5,
    $6,
    $7::timestamptz,
    $8,
    lower($9),
    $10,
    $11::timestamptz,
    $12,
    coalesce($13, 'application/pdf'),
    $14::bigint,
    $15::uuid,
    $16::uuid,
    'PENDING',
    'UNVERIFIED'
  )
  on conflict (content_sha256) do nothing
  returning *
)
select * from inserted
union all
select d.*
from public.lnd_documents d
where d.content_sha256 = lower($9)
  and not exists (select 1 from inserted)
limit 1;


-- ============================================================================
-- Q4. INSERIMENTO IDEMPOTENTE DI UN PROVVEDIMENTO
-- L'output AI deve essere validato contro valori enumerati prima del bind.
-- Non aggiornare il record originale: una rettifica usa una nuova chiave e
-- supersedes_measure_id.
-- Parametri:
--   $1  idempotency_key
--   $2  document_id
--   $3  page_number nullable
--   $4  source_excerpt
--   $5  excerpt_sha256 nullable
--   $6  season_id
--   $7  competition_id
--   $8  team_id nullable
--   $9  person_id nullable
--   $10 fixture_id nullable
--   $11 raw_team_name nullable
--   $12 raw_person_name nullable
--   $13 measure_type
--   $14 quantity nullable
--   $15 unit nullable
--   $16 gamedays nullable
--   $17 effective_from nullable
--   $18 verification_status
--   $19 confidence nullable
--   $20 supersedes_measure_id nullable
-- ============================================================================
with inserted as (
  insert into public.lnd_disciplinary_measures (
    idempotency_key,
    document_id,
    page_number,
    source_excerpt,
    excerpt_sha256,
    season_id,
    competition_id,
    team_id,
    person_id,
    fixture_id,
    raw_team_name,
    raw_person_name,
    measure_type,
    quantity,
    unit,
    gamedays,
    effective_from,
    verification_status,
    confidence,
    supersedes_measure_id
  )
  values (
    $1,
    $2::uuid,
    $3::integer,
    $4,
    $5,
    $6::uuid,
    $7::uuid,
    $8::uuid,
    $9::uuid,
    $10::uuid,
    $11,
    $12,
    $13,
    $14::numeric,
    $15,
    $16::integer,
    $17::date,
    $18,
    $19::numeric,
    $20::uuid
  )
  on conflict (idempotency_key) do nothing
  returning *
)
select * from inserted
union all
select dm.*
from public.lnd_disciplinary_measures dm
where dm.idempotency_key = $1
  and not exists (select 1 from inserted)
limit 1;


-- ============================================================================
-- Q4B. INSERIMENTO IDEMPOTENTE DI UN MOVIMENTO DEL LEDGER
-- Parametri:
--   $1  idempotency_key
--   $2  measure_id
--   $3  person_id
--   $4  team_id
--   $5  season_id
--   $6  competition_id
--   $7  fixture_id nullable (obbligatoria per SERVED)
--   $8  movement_type
--   $9  delta_gamedays
--   $10 balance_after nullable
--   $11 source_document_id
--   $12 occurred_on
--   $13 verification_status
--   $14 verification_notes nullable
-- ============================================================================
with inserted as (
  insert into public.lnd_suspension_ledger (
    idempotency_key,
    measure_id,
    person_id,
    team_id,
    season_id,
    competition_id,
    fixture_id,
    movement_type,
    delta_gamedays,
    balance_after,
    source_document_id,
    occurred_on,
    verification_status,
    verification_notes
  )
  values (
    $1,
    $2::uuid,
    $3::uuid,
    $4::uuid,
    $5::uuid,
    $6::uuid,
    $7::uuid,
    $8,
    $9::integer,
    $10::integer,
    $11::uuid,
    $12::date,
    $13,
    $14
  )
  on conflict (idempotency_key) do nothing
  returning *
)
select * from inserted
union all
select sl.*
from public.lnd_suspension_ledger sl
where sl.idempotency_key = $1
  and not exists (select 1 from inserted)
limit 1;


-- ============================================================================
-- Q4C. MARCA L'ORIGINALE COME SUPERSEDED DOPO LA RETTIFICA
-- Parametri:
--   $1 original_measure_id
-- Non opera se non esiste un successore già registrato.
-- ============================================================================
update public.lnd_disciplinary_measures original
set record_status = 'SUPERSEDED'
where original.id = $1::uuid
  and original.record_status = 'ACTIVE'
  and exists (
    select 1
    from public.lnd_disciplinary_measures replacement
    where replacement.supersedes_measure_id = original.id
      and replacement.verification_status in ('PARSED', 'VERIFIED')
  )
returning original.*;


-- ============================================================================
-- Q5. RICOSTRUZIONE DELLE GIORNATE RESIDUE
-- Parametri opzionali:
--   $1 season_id nullable
--   $2 competition_id nullable
--   $3 team_id nullable
-- Restituisce NON_VERIFICABILE se il ledger verificato produce saldo negativo.
-- ============================================================================
select
  sl.person_id,
  p.display_name,
  sl.team_id,
  t.official_name as team_name,
  sl.season_id,
  s.code as season_code,
  sl.competition_id,
  c.official_name as competition_name,
  sum(sl.delta_gamedays)::integer as residual_gamedays,
  max(sl.occurred_on) as last_movement_on,
  case
    when sum(sl.delta_gamedays) < 0 then 'NON_VERIFICABILE'
    else 'VERIFIED_LEDGER'
  end as balance_status
from public.lnd_suspension_ledger sl
join public.lnd_persons p on p.id = sl.person_id
join public.lnd_teams t on t.id = sl.team_id
join public.lnd_seasons s on s.id = sl.season_id
join public.lnd_competitions c on c.id = sl.competition_id
join public.lnd_disciplinary_measures dm on dm.id = sl.measure_id
where sl.verification_status = 'VERIFIED'
  and dm.record_status = 'ACTIVE'
  and ($1::uuid is null or sl.season_id = $1::uuid)
  and ($2::uuid is null or sl.competition_id = $2::uuid)
  and ($3::uuid is null or sl.team_id = $3::uuid)
group by
  sl.person_id,
  p.display_name,
  sl.team_id,
  t.official_name,
  sl.season_id,
  s.code,
  sl.competition_id,
  c.official_name
order by residual_gamedays desc, p.display_name;


-- ============================================================================
-- Q6. DATI PER IL REPORT TELEGRAM DELLA PROSSIMA PARTITA
-- Include Villanovese e avversaria, persone registrate, misure ufficiali
-- verificate e saldo ledger. Nessun dato Analytics viene modificato.
-- ============================================================================
with villanovese as (
  select id
  from public.lnd_teams
  where team_key = 'it-veneto:asd-villanovese'
),
next_fixture as (
  select f.*
  from public.lnd_fixtures f
  cross join villanovese v
  where v.id in (f.home_team_id, f.away_team_id)
    and f.status in ('SCHEDULED', 'RESCHEDULED')
    and f.scheduled_date >= (now() at time zone 'Europe/Rome')::date
  order by f.scheduled_date, f.kickoff_time nulls last, f.id
  limit 1
),
relevant_teams as (
  select nf.home_team_id as team_id, 'HOME'::text as venue
  from next_fixture nf
  union all
  select nf.away_team_id, 'AWAY'::text
  from next_fixture nf
),
measure_summary as (
  select
    dm.team_id,
    dm.person_id,
    count(*) filter (where dm.measure_type = 'DIFFIDA')::integer as diffide,
    count(*) filter (
      where dm.measure_type in ('SUSPENSION', 'EXPULSION')
    )::integer as suspension_measures,
    coalesce(sum(dm.gamedays) filter (
      where dm.measure_type in ('SUSPENSION', 'EXPULSION')
    ), 0)::integer as imposed_gamedays,
    max(d.published_at) as latest_source_at
  from public.lnd_disciplinary_measures dm
  join public.lnd_documents d on d.id = dm.document_id
  join next_fixture nf
    on nf.season_id = dm.season_id
   and nf.competition_id = dm.competition_id
  where dm.record_status = 'ACTIVE'
    and dm.verification_status = 'VERIFIED'
  group by dm.team_id, dm.person_id
),
ledger_balance as (
  select
    sl.team_id,
    sl.person_id,
    sum(sl.delta_gamedays)::integer as residual_gamedays
  from public.lnd_suspension_ledger sl
  join public.lnd_disciplinary_measures dm on dm.id = sl.measure_id
  join next_fixture nf
    on nf.season_id = sl.season_id
   and nf.competition_id = sl.competition_id
  where sl.verification_status = 'VERIFIED'
    and dm.record_status = 'ACTIVE'
  group by sl.team_id, sl.person_id
)
select
  nf.id as fixture_id,
  nf.scheduled_date,
  nf.kickoff_time,
  nf.kickoff_timezone,
  nf.status as fixture_status,
  nf.verification_status as fixture_verification_status,
  rt.venue,
  t.id as team_id,
  t.official_name as team_name,
  t.verification_status as team_verification_status,
  p.id as person_id,
  p.display_name,
  p.verification_status as person_verification_status,
  coalesce(ms.diffide, 0) as diffide,
  coalesce(ms.suspension_measures, 0) as suspension_measures,
  coalesce(ms.imposed_gamedays, 0) as imposed_gamedays,
  lb.residual_gamedays,
  ms.latest_source_at,
  case
    when nf.verification_status <> 'VERIFIED' then 'NON_VERIFICABILE'
    when p.id is null then 'NON_VERIFICABILE'
    when p.id is not null and p.verification_status <> 'VERIFIED'
      then 'NON_VERIFICABILE'
    when lb.residual_gamedays is not null and lb.residual_gamedays < 0
      then 'NON_VERIFICABILE'
    else 'OK'
  end as report_data_status
from next_fixture nf
join relevant_teams rt on true
join public.lnd_teams t on t.id = rt.team_id
left join public.lnd_registrations r
  on r.team_id = t.id
 and r.season_id = nf.season_id
 and r.status = 'ACTIVE'
 and (r.valid_from is null or r.valid_from <= nf.scheduled_date)
 and (r.valid_to is null or r.valid_to >= nf.scheduled_date)
left join public.lnd_persons p on p.id = r.person_id
left join measure_summary ms
  on ms.team_id = t.id
 and ms.person_id = p.id
left join ledger_balance lb
  on lb.team_id = t.id
 and lb.person_id = p.id
order by rt.venue, p.display_name nulls last;


-- ============================================================================
-- Q6B. ACCODA UNA NOTIFICA TELEGRAM SENZA DUPLICAZIONI
-- Parametri:
--   $1 dedupe_key
--   $2 run_id
--   $3 measure_id nullable
--   $4 report_id nullable
--   $5 destination_ref_hash
--   $6 payload_sha256
--   $7 payload_preview nullable
-- ============================================================================
with inserted as (
  insert into public.lnd_notifications (
    dedupe_key,
    run_id,
    measure_id,
    report_id,
    channel,
    destination_ref_hash,
    payload_sha256,
    payload_preview,
    status
  )
  values (
    $1,
    $2::uuid,
    $3::uuid,
    $4::uuid,
    'TELEGRAM',
    $5,
    lower($6),
    $7,
    'PENDING'
  )
  on conflict (dedupe_key) do nothing
  returning *
)
select * from inserted
union all
select n.*
from public.lnd_notifications n
where n.dedupe_key = $1
  and not exists (select 1 from inserted)
limit 1;


-- ============================================================================
-- Q7. CONTROCHECK READ-ONLY CON ANALYTICS
-- La view espone soltanto aggregati e non modifica le tabelle Analytics.
-- CONFRONTO_DESCRITTIVO non significa equivalenza regolamentare.
-- ============================================================================
select
  analytics_player_id,
  analytics_player_name,
  analytics_category,
  analytics_yellow_cards,
  analytics_red_cards,
  analytics_yellow_events,
  analytics_red_events,
  lnd_person_id,
  lnd_season_code,
  lnd_competition_id,
  lnd_competition_name,
  official_diffide_count,
  official_suspension_measure_count,
  official_imposed_gamedays,
  official_residual_gamedays,
  comparison_status,
  review_flag,
  comparison_note
from public.lnd_analytics_discipline_countercheck
where comparison_status = 'NON_VERIFICABILE'
   or review_flag = 'POSSIBILE_DISALLINEAMENTO_DA_REVISIONARE'
order by analytics_player_name, lnd_season_code, lnd_competition_name;


-- ============================================================================
-- Q8. CODA NOTIFICHE TELEGRAM NON ANCORA INVIATE
-- L'effettivo token Telegram vive nel credential store n8n, non nel database.
-- ============================================================================
select
  n.id,
  n.dedupe_key,
  n.measure_id,
  n.report_id,
  n.payload_preview,
  n.attempt_count,
  n.created_at
from public.lnd_notifications n
where n.channel = 'TELEGRAM'
  and n.status in ('PENDING', 'FAILED')
  and n.attempt_count < 5
order by n.created_at
for update skip locked;
