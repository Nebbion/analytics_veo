-- Tutti gli utenti applicativi attivi possono leggere i dati di squadra,
-- i report partita completi e la tattica completa. Le sezioni Minuti e
-- Confronto restano riservate allo staff nell'applicazione.
do $$
declare
  table_name text;
  readable_tables text[] := array[
    'players',
    'matches',
    'player_match_stats',
    'player_season_stats',
    'match_lineups',
    'match_substitutions',
    'veo_position_stats',
    'veo_event_positions',
    'player_average_positions',
    'tactical_average_positions',
    'average_positions',
    'posizioni_medie',
    'player_shots',
    'tactical_shots',
    'shot_map',
    'mappa_tiri',
    'player_tackles',
    'tactical_tackles',
    'tackle_map',
    'mappa_contrasti',
    'tactical_events',
    'player_tactical_events',
    'eventi_tattici',
    'tattica'
  ];
begin
  foreach table_name in array readable_tables loop
    if exists (
      select 1
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relname = table_name
        and c.relkind in ('r', 'p')
    ) then
      execute format('grant select on table public.%I to authenticated', table_name);
      execute format('drop policy if exists "active_users_read_full_reports" on public.%I', table_name);
      execute format(
        'create policy "active_users_read_full_reports" on public.%I for select to authenticated using (exists (select 1 from public.utenti where utenti.id = auth.uid() and utenti.attivo is true and upper(utenti.ruolo::text) in (''STAFF'', ''GIOCATORE'')))',
        table_name
      );
    end if;
  end loop;
end
$$;
