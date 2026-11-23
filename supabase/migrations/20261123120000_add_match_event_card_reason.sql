alter table public.match_events
  add column if not exists card_reason text;

comment on column public.match_events.card_reason is
  'Motivazione del cartellino dal report YouCoach. NULL indica una motivazione non importata o non disponibile.';
