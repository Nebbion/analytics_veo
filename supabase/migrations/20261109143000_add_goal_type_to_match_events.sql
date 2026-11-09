alter table public.match_events
  add column if not exists goal_type text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'match_events_goal_type_check'
      and conrelid = 'public.match_events'::regclass
  ) then
    alter table public.match_events
      add constraint match_events_goal_type_check
      check (goal_type is null or goal_type in ('RIGORE', 'PUNIZIONE'));
  end if;
end
$$;

comment on column public.match_events.goal_type is
  'Tipo esplicito del gol indicato dalla fonte: RIGORE o PUNIZIONE; NULL se non disponibile.';
