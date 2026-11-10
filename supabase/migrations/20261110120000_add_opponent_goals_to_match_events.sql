alter table public.match_events
  alter column player_id drop not null;

alter table public.match_events
  drop constraint if exists match_events_supported_type;

alter table public.match_events
  add constraint match_events_supported_type check (
    event_type in (
      'GOAL',
      'OPPONENT_GOAL',
      'YELLOW_CARD',
      'RED_CARD',
      'SECOND_YELLOW_CARD'
    )
  );

drop index if exists public.match_events_unique_event_idx;

create unique index match_events_unique_event_idx
  on public.match_events (
    match_id,
    event_type,
    minuto,
    coalesce(player_id, ''),
    coalesce(related_player_id, '')
  );

comment on column public.match_events.event_type is
  'Tipo evento ufficiale YouCoach. OPPONENT_GOAL identifica un gol subito.';
