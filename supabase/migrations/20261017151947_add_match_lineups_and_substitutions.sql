create table if not exists public.match_lineups (
  match_id text not null references public.matches(match_id) on delete cascade,
  player_id text not null references public.players(player_id) on delete cascade,
  numero integer,
  titolare boolean not null default false,
  ordine integer,
  created_at timestamptz not null default now(),
  primary key (match_id, player_id)
);

create table if not exists public.match_substitutions (
  id bigint generated always as identity primary key,
  match_id text not null references public.matches(match_id) on delete cascade,
  minuto integer not null,
  recupero boolean not null default false,
  player_out_id text not null references public.players(player_id),
  player_in_id text not null references public.players(player_id),
  created_at timestamptz not null default now(),
  constraint match_substitutions_unique_change
    unique (match_id, minuto, player_out_id, player_in_id)
);

create index if not exists match_lineups_match_id_idx
  on public.match_lineups (match_id);

create index if not exists match_substitutions_match_id_minute_idx
  on public.match_substitutions (match_id, minuto);

alter table public.match_lineups enable row level security;
alter table public.match_substitutions enable row level security;

grant select, insert, update, delete on public.match_lineups to authenticated;
grant select, insert, update, delete on public.match_substitutions to authenticated;
grant usage, select on sequence public.match_substitutions_id_seq to authenticated;
grant all on public.match_lineups to service_role;
grant all on public.match_substitutions to service_role;
grant usage, select on sequence public.match_substitutions_id_seq to service_role;

drop policy if exists "match_lineups_staff_all" on public.match_lineups;
create policy "match_lineups_staff_all"
on public.match_lineups
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

drop policy if exists "match_lineups_player_select_own" on public.match_lineups;
create policy "match_lineups_player_select_own"
on public.match_lineups
for select
to authenticated
using (
  exists (
    select 1
    from public.utenti
    where utenti.id = auth.uid()
      and utenti.attivo is true
      and upper(utenti.ruolo::text) = 'GIOCATORE'
      and utenti.player_id = match_lineups.player_id
  )
);

drop policy if exists "match_substitutions_staff_all" on public.match_substitutions;
create policy "match_substitutions_staff_all"
on public.match_substitutions
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

drop policy if exists "match_substitutions_player_select_own" on public.match_substitutions;
create policy "match_substitutions_player_select_own"
on public.match_substitutions
for select
to authenticated
using (
  exists (
    select 1
    from public.utenti
    where utenti.id = auth.uid()
      and utenti.attivo is true
      and upper(utenti.ruolo::text) = 'GIOCATORE'
      and utenti.player_id in (
        match_substitutions.player_out_id,
        match_substitutions.player_in_id
      )
  )
);

comment on table public.match_lineups is
  'Distinta YouCoach della singola partita: titolari e riserve.';
comment on table public.match_substitutions is
  'Sostituzioni YouCoach della singola partita.';
