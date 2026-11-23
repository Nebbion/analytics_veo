type MatchEvent = {
  match_id: string;
  player_id: string | null;
  event_type: string;
  minuto: number;
  recupero: boolean;
};

const playerMatchKey = (matchId: string, playerId: string) => `${matchId}|${playerId}`;

export function doubleYellowExpulsions(events: MatchEvent[]) {
  const keys = new Set<string>();
  for (const event of events) {
    if (event.event_type === 'SECOND_YELLOW_CARD' && event.player_id) {
      keys.add(playerMatchKey(event.match_id, event.player_id));
    }
  }
  return (matchId: string, playerId: string) => keys.has(playerMatchKey(matchId, playerId));
}

// During a reimport, an older red may coexist with the corrected second yellow.
export function withCanonicalDismissals<T extends MatchEvent>(events: T[]) {
  const dismissalKey = (event: MatchEvent) =>
    [event.match_id, event.player_id, event.minuto, event.recupero].join('|');
  const secondYellows = new Set(events
    .filter(event => event.event_type === 'SECOND_YELLOW_CARD' && event.player_id)
    .map(dismissalKey));

  return events.filter(event =>
    event.event_type !== 'RED_CARD' || !secondYellows.has(dismissalKey(event))
  );
}

export const isProtestCardReason = (reason: string | null) =>
  /^protest[ae]$/i.test(reason?.trim() ?? '');
