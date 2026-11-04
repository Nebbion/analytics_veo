create table if not exists public.match_events (
  id bigint generated always as identity primary key,
  match_id text not null references public.matches(match_id) on delete cascade,
  event_type text not null,
  minuto integer not null check (minuto >= 0),
  recupero boolean not null default false,
  player_id text not null references public.players(player_id),
  player_name text not null,
  related_player_id text references public.players(player_id),
  related_player_name text,
  fonte text not null default 'YOUCOACH',
  created_at timestamptz not null default now(),
  constraint match_events_supported_type check (
    event_type in ('GOAL', 'YELLOW_CARD', 'RED_CARD', 'SECOND_YELLOW_CARD')
  )
);

create index if not exists match_events_match_id_minute_idx
  on public.match_events (match_id, minuto);

create unique index if not exists match_events_unique_event_idx
  on public.match_events (
    match_id,
    event_type,
    minuto,
    player_id,
    coalesce(related_player_id, '')
  );

alter table public.match_events enable row level security;

grant select, insert, update, delete on public.match_events to authenticated;
grant usage, select on sequence public.match_events_id_seq to authenticated;
grant all on public.match_events to service_role;
grant usage, select on sequence public.match_events_id_seq to service_role;

drop policy if exists "match_events_staff_all" on public.match_events;
create policy "match_events_staff_all"
on public.match_events
for all
to authenticated
using (
  exists (
    select 1
    from public.utenti
    where utenti.id = auth.uid()
      and utenti.attivo is true
      and upper(utenti.ruolo::text) = 'STAFF'
  )
)
with check (
  exists (
    select 1
    from public.utenti
    where utenti.id = auth.uid()
      and utenti.attivo is true
      and upper(utenti.ruolo::text) = 'STAFF'
  )
);

drop policy if exists "active_users_read_full_reports" on public.match_events;
create policy "active_users_read_full_reports"
on public.match_events
for select
to authenticated
using (
  exists (
    select 1
    from public.utenti
    where utenti.id = auth.uid()
      and utenti.attivo is true
      and upper(utenti.ruolo::text) in ('STAFF', 'GIOCATORE')
  )
);

comment on table public.match_events is
  'Eventi ufficiali YouCoach della partita, inclusi gol, assist associato e cartellini.';
