import { NextResponse } from 'next/server';
import { createClient } from '../../../../../lib/supabase/server';
import type {
  Competition,
  MatchReport,
  MatchReportEvent,
  MatchReportMetricKey,
  MatchReportPlayer,
  MatchReportTacticalPoint,
  ZoneDistribution,
} from '../../../../../lib/match-report/types';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type DataRow = Record<string, unknown>;
type PlayerRow = { player_id: string; nome: string };
type MatchRow = DataRow & { match_id: string; data: string | null; partita: string };
type LineupRow = {
  match_id: string;
  player_id: string;
  numero: number | null;
  titolare: boolean;
  ordine: number | null;
};
type SubstitutionRow = {
  match_id: string;
  minuto: number;
  recupero: boolean;
  player_out_id: string | null;
  player_in_id: string | null;
};

const normalizeKey = (key: string) => key.toLowerCase().replace(/[^a-z0-9]/g, '');

const rowValue = (row: DataRow | undefined, keys: string[]) => {
  if (!row) return undefined;
  const normalized = new Map(Object.entries(row).map(([key, value]) => [normalizeKey(key), value]));

  for (const key of keys) {
    const value = normalized.get(normalizeKey(key));
    if (value !== undefined && value !== null && String(value).trim() !== '') return value;
  }

  return undefined;
};

const rowText = (row: DataRow | undefined, keys: string[]) => {
  const value = rowValue(row, keys);
  return value === undefined ? '' : String(value).trim();
};

const rowNumber = (row: DataRow | undefined, keys: string[]) => {
  const value = rowValue(row, keys);
  if (value === undefined) return null;
  const parsed = Number(String(value).replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
};

const competitionLabel = (row: MatchRow | undefined): Competition => {
  const raw = rowText(row, ['competizione', 'competition', 'torneo', 'tipo', 'tipo_partita', 'categoria']);
  const label = raw || row?.partita || '';
  return /coppa/i.test(label) ? 'COPPA' : 'CAMPIONATO';
};

const metricKeys: Record<MatchReportMetricKey, string[]> = {
  goals: ['gol', 'goals'],
  shots: ['tiri', 'shots'],
  totalShots: ['tiri_totali', 'total_shots', 'shots_total', 'conclusioni_totali'],
  passes: ['passaggi', 'passes'],
  completedPasses: ['passaggi_completati', 'completed_passes', 'passes_completed'],
  passSuccess: ['passaggi_percento', 'pass_success', 'pass_accuracy', 'precisione_passaggi'],
  distanceKm: ['distanza_km', 'distance_km', 'distance'],
  sprints: ['sprint', 'sprints'],
  highIntensityRuns: ['corse_alta_intensita', 'high_intensity_runs', 'high_intensity'],
  averageSpeed: ['velocita_media_kmh', 'average_speed', 'avg_speed'],
  maxSpeed: ['velocita_max_kmh', 'max_speed', 'top_speed'],
  tackles: ['contrasti', 'tackles', 'duelli', 'duels'],
  fouls: ['falli', 'fouls'],
  goalInvolvements: ['coinvolgimenti_gol', 'goal_involvements', 'goal_involvement'],
};

const assistKeys = ['assist', 'assists', 'assistenze'];
const yellowCardKeys = ['ammonizioni', 'ammonizione', 'cartellini_gialli', 'gialli', 'cartellini_giallo'];
const redCardKeys = ['espulsioni', 'espulsione', 'cartellini_rossi', 'rossi', 'cartellini_rosso'];

const normalizePercent = (value: number | null) => {
  if (value === null) return null;
  const percent = value >= 0 && value <= 1 ? value * 100 : value;
  return Math.max(0, Math.min(100, percent));
};

const playerKey = (row: DataRow) => rowText(row, ['player_id', 'playerId', 'Player_ID', 'id_giocatore', 'giocatore_id']);

const eventType = (row: DataRow) => rowText(row, ['tipo_evento', 'event_type', 'evento', 'event', 'type', 'azione']);

const eventMatches = (type: string, patterns: RegExp[]) => patterns.some(pattern => pattern.test(type));

const pointLabel = (point: MatchReportTacticalPoint) => {
  const number = point.jerseyNumber !== null ? `#${point.jerseyNumber}` : '';
  if (number && point.playerName) return `${number} - ${point.playerName}`;
  return number || point.playerName || 'Giocatore';
};

const buildZoneDistribution = (sourceLabel: string, points: MatchReportTacticalPoint[]): ZoneDistribution => {
  const total = points.length;
  const verticalLabels = ['Terzo difensivo', 'Terzo centrale', 'Terzo offensivo'];
  const horizontalLabels = ['Fascia sinistra', 'Centro-sinistra', 'Centro', 'Centro-destra', 'Fascia destra'];
  const verticalCounts = [0, 0, 0];
  const horizontalCounts = [0, 0, 0, 0, 0];

  points.forEach(point => {
    verticalCounts[point.x < 33.34 ? 0 : point.x < 66.67 ? 1 : 2] += 1;
    horizontalCounts[Math.min(4, Math.floor(point.y / 20))] += 1;
  });

  const rows = (labels: string[], counts: number[]) => labels.map((label, index) => ({
    label,
    count: counts[index],
    percent: total > 0 ? counts[index] * 100 / total : 0,
  }));

  return {
    sourceLabel,
    total,
    vertical: rows(verticalLabels, verticalCounts),
    horizontal: rows(horizontalLabels, horizontalCounts),
  };
};

const metricSum = (players: MatchReportPlayer[], key: MatchReportMetricKey) => {
  const values = players.map(player => player[key]).filter((value): value is number => value !== null);
  return values.length ? values.reduce((sum, value) => sum + value, 0) : null;
};

const metricMax = (players: MatchReportPlayer[], key: MatchReportMetricKey) => {
  const values = players.map(player => player[key]).filter((value): value is number => value !== null);
  return values.length ? Math.max(...values) : null;
};

const overviewFromPlayers = (players: MatchReportPlayer[]): MatchReport['overview'] => {
  const passes = metricSum(players, 'passes');
  const completedPasses = metricSum(players, 'completedPasses');

  return {
    goals: metricSum(players, 'goals'),
    shots: metricSum(players, 'shots'),
    totalShots: metricSum(players, 'totalShots'),
    passes,
    completedPasses,
    passSuccess: passes !== null && completedPasses !== null && passes > 0 ? completedPasses / passes * 100 : null,
    distanceKm: metricSum(players, 'distanceKm'),
    sprints: metricSum(players, 'sprints'),
    highIntensityRuns: metricSum(players, 'highIntensityRuns'),
    averageSpeed: null,
    maxSpeed: metricMax(players, 'maxSpeed'),
    tackles: metricSum(players, 'tackles'),
    fouls: metricSum(players, 'fouls'),
    goalInvolvements: metricSum(players, 'goalInvolvements'),
  };
};

const buildOfficialEvents = (players: MatchReportPlayer[]) => {
  const events: MatchReportEvent[] = [];
  const pushTotals = (
    player: MatchReportPlayer,
    value: number | null,
    type: MatchReportEvent['type'],
    label: string
  ) => {
    if (!value || value <= 0) return;
    events.push({
      type,
      label,
      playerName: player.name,
      playerId: player.playerId,
      jerseyNumber: player.jerseyNumber,
      minute: null,
      value,
    });
  };

  players.forEach(player => {
    pushTotals(player, player.goals, 'goal', 'Gol');
    pushTotals(player, player.assists, 'assist', 'Assist');
    pushTotals(player, player.yellowCards, 'yellowCard', 'Ammonizione');
    pushTotals(player, player.redCards, 'redCard', 'Espulsione');
  });

  return events;
};

const visibleRowsForRole = (rows: DataRow[], isStaff: boolean, ownPlayerId: string) =>
  isStaff ? rows : rows.filter(row => playerKey(row) === ownPlayerId);

export async function GET(
  _request: Request,
  context: { params: Promise<{ matchId: string }> }
) {
  const { matchId: rawMatchId } = await context.params;
  const matchId = decodeURIComponent(rawMatchId);
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Non autenticato.' }, { status: 401 });
  }

  const { data: profile, error: profileError } = await supabase
    .from('utenti')
    .select('player_id,nome,email,ruolo,attivo')
    .eq('id', user.id)
    .single();

  if (profileError || !profile) {
    return NextResponse.json({ error: 'Profilo utente non configurato.' }, { status: 403 });
  }

  if (!profile.attivo) {
    return NextResponse.json({ error: 'Utente disattivato.' }, { status: 403 });
  }

  if (profile.ruolo !== 'STAFF' && profile.ruolo !== 'GIOCATORE') {
    return NextResponse.json({ error: 'Ruolo utente non valido.' }, { status: 403 });
  }

  const isStaff = profile.ruolo === 'STAFF';
  const ownPlayerId = String(profile.player_id ?? '').trim();

  if (!isStaff && !ownPlayerId) {
    return NextResponse.json({ error: 'Player_ID non associato al profilo utente.' }, { status: 403 });
  }

  const [matchResult, statsResult, playersResult, positionsResult, eventsResult, lineupResult, substitutionsResult] = await Promise.all([
    supabase.from('matches').select('*').eq('match_id', matchId).maybeSingle(),
    supabase.from('player_match_stats').select('*').eq('match_id', matchId),
    supabase.from('players').select('player_id,nome'),
    supabase.from('veo_position_stats').select('*').eq('match_id', matchId),
    supabase.from('veo_event_positions').select('*').eq('match_id', matchId),
    supabase.from('match_lineups').select('match_id,player_id,numero,titolare,ordine').eq('match_id', matchId),
    supabase.from('match_substitutions').select('match_id,minuto,recupero,player_out_id,player_in_id').eq('match_id', matchId),
  ]);

  if (matchResult.error) {
    return NextResponse.json({ error: `Supabase matches: ${matchResult.error.message}` }, { status: 502 });
  }

  if (!matchResult.data) {
    return NextResponse.json({ error: 'Partita non trovata.' }, { status: 404 });
  }

  if (statsResult.error) {
    return NextResponse.json({ error: `Supabase player_match_stats: ${statsResult.error.message}` }, { status: 502 });
  }

  if (playersResult.error) {
    return NextResponse.json({ error: `Supabase players: ${playersResult.error.message}` }, { status: 502 });
  }

  if (positionsResult.error) {
    return NextResponse.json({ error: `Supabase veo_position_stats: ${positionsResult.error.message}` }, { status: 502 });
  }

  if (eventsResult.error) {
    return NextResponse.json({ error: `Supabase veo_event_positions: ${eventsResult.error.message}` }, { status: 502 });
  }

  if (lineupResult.error) {
    return NextResponse.json({ error: `Supabase match_lineups: ${lineupResult.error.message}` }, { status: 502 });
  }

  if (substitutionsResult.error) {
    return NextResponse.json({ error: `Supabase match_substitutions: ${substitutionsResult.error.message}` }, { status: 502 });
  }

  const match = matchResult.data as MatchRow;
  const playerNameMap = new Map((playersResult.data ?? []).map((player: PlayerRow) => [player.player_id, player.nome]));
  const positionRows = visibleRowsForRole((positionsResult.data ?? []) as DataRow[], isStaff, ownPlayerId);
  const eventRows = visibleRowsForRole((eventsResult.data ?? []) as DataRow[], isStaff, ownPlayerId);
  const statsRows = visibleRowsForRole((statsResult.data ?? []) as DataRow[], isStaff, ownPlayerId);
  const lineupRows = (lineupResult.data ?? []) as LineupRow[];
  const substitutionRows = (substitutionsResult.data ?? []) as SubstitutionRow[];

  const jerseyByPlayerId = new Map<string, number>();
  lineupRows.forEach(row => {
    if (row.player_id && row.numero !== null) jerseyByPlayerId.set(row.player_id, row.numero);
  });
  positionRows.forEach(row => {
    const id = playerKey(row);
    const number = rowNumber(row, ['numero', 'numero_maglia', 'jersey_number', 'shirt_number']);
    if (id && number !== null && !jerseyByPlayerId.has(id)) jerseyByPlayerId.set(id, number);
  });
  eventRows.forEach(row => {
    const id = playerKey(row);
    const number = rowNumber(row, ['numero', 'numero_maglia', 'jersey_number', 'shirt_number']);
    if (id && number !== null && !jerseyByPlayerId.has(id)) jerseyByPlayerId.set(id, number);
  });

  const playerName = (row: DataRow) => {
    const id = playerKey(row);
    return rowText(row, ['player_name', 'playerName', 'nome_giocatore', 'giocatore', 'player', 'nome']) || playerNameMap.get(id) || id || '';
  };

  const players = statsRows
    .map((row): MatchReportPlayer => {
      const playerId = playerKey(row);
      return {
        playerId,
        name: playerName(row) || 'Giocatore',
        jerseyNumber: jerseyByPlayerId.get(playerId) ?? null,
        minutes: rowNumber(row, ['minuti', 'minutes']),
        goals: rowNumber(row, metricKeys.goals),
        assists: rowNumber(row, assistKeys),
        yellowCards: rowNumber(row, yellowCardKeys),
        redCards: rowNumber(row, redCardKeys),
        shots: rowNumber(row, metricKeys.shots),
        totalShots: rowNumber(row, metricKeys.totalShots),
        passes: rowNumber(row, metricKeys.passes),
        completedPasses: rowNumber(row, metricKeys.completedPasses),
        passSuccess: rowNumber(row, metricKeys.passSuccess),
        distanceKm: rowNumber(row, metricKeys.distanceKm),
        sprints: rowNumber(row, metricKeys.sprints),
        highIntensityRuns: rowNumber(row, metricKeys.highIntensityRuns),
        averageSpeed: rowNumber(row, metricKeys.averageSpeed),
        maxSpeed: rowNumber(row, metricKeys.maxSpeed),
        tackles: rowNumber(row, metricKeys.tackles),
        fouls: rowNumber(row, metricKeys.fouls),
        goalInvolvements: rowNumber(row, metricKeys.goalInvolvements),
      };
    })
    .sort((a, b) =>
      (a.jerseyNumber ?? Number.MAX_SAFE_INTEGER) - (b.jerseyNumber ?? Number.MAX_SAFE_INTEGER) ||
      a.name.localeCompare(b.name, 'it')
    );

  const lineup = lineupRows
    .map(row => ({
      playerId: row.player_id,
      playerName: playerNameMap.get(row.player_id) || row.player_id,
      jerseyNumber: row.numero,
      starter: row.titolare,
      order: row.ordine,
    }))
    .sort((a, b) =>
      Number(b.starter) - Number(a.starter) ||
      (a.order ?? Number.MAX_SAFE_INTEGER) - (b.order ?? Number.MAX_SAFE_INTEGER) ||
      (a.jerseyNumber ?? Number.MAX_SAFE_INTEGER) - (b.jerseyNumber ?? Number.MAX_SAFE_INTEGER) ||
      a.playerName.localeCompare(b.playerName, 'it')
    );

  const substitutions = substitutionRows
    .map(row => ({
      minute: row.minuto,
      injuryTime: row.recupero,
      playerOutId: row.player_out_id ?? '',
      playerOutName: row.player_out_id ? playerNameMap.get(row.player_out_id) || row.player_out_id : '',
      playerInId: row.player_in_id ?? '',
      playerInName: row.player_in_id ? playerNameMap.get(row.player_in_id) || row.player_in_id : '',
    }))
    .sort((a, b) => a.minute - b.minute || a.playerOutName.localeCompare(b.playerOutName, 'it'));

  const toPoint = (
    row: DataRow,
    source: MatchReportTacticalPoint['source'],
    kind: MatchReportTacticalPoint['kind'],
    index: number,
    xKeys: string[],
    yKeys: string[]
  ): MatchReportTacticalPoint | null => {
    const x = normalizePercent(rowNumber(row, xKeys));
    const y = normalizePercent(rowNumber(row, yKeys));
    if (x === null || y === null) return null;

    const id = playerKey(row);
    const number = rowNumber(row, ['numero', 'numero_maglia', 'jersey_number', 'shirt_number']);
    const type = eventType(row);
    const owner = id || (number !== null ? String(number) : 'player');

    return {
      id: `${source}-${kind}-${owner}-${index}`,
      source,
      kind,
      playerId: id,
      playerName: playerName(row),
      jerseyNumber: number,
      x,
      y,
      minute: rowNumber(row, ['minuto', 'minute', 'min']),
      eventType: type,
    };
  };

  const averagePositions = positionRows
    .map((row, index) => toPoint(row, 'veo_position_stats', 'average', index, ['x_media_pct'], ['y_media_pct']))
    .filter((point): point is MatchReportTacticalPoint => point !== null);

  const eventPoints = eventRows
    .map((row, index) => {
      const type = eventType(row);
      const kind = eventMatches(type, [/gol/i])
        ? 'goal'
        : eventMatches(type, [/tiro/i])
          ? 'shot'
          : eventMatches(type, [/contrasto/i])
            ? 'tackle'
            : 'event';

      return toPoint(row, 'veo_event_positions', kind, index, ['x_pct', 'x'], ['y_pct', 'y']);
    })
    .filter((point): point is MatchReportTacticalPoint => point !== null);

  const shots = eventPoints.filter(point => point.kind === 'shot' || point.kind === 'goal');
  const tackles = eventPoints.filter(point => point.kind === 'tackle');
  const result = rowText(match, ['risultato', 'result', 'score', 'punteggio']) ||
    (() => {
      const homeGoals = rowNumber(match, ['gol_casa', 'home_goals', 'home_score']);
      const awayGoals = rowNumber(match, ['gol_trasferta', 'away_goals', 'away_score']);
      return homeGoals !== null && awayGoals !== null ? `${homeGoals} - ${awayGoals}` : '';
    })();

  const report: MatchReport = {
    match: {
      matchId: match.match_id,
      date: match.data ?? rowText(match, ['date', 'data']),
      match: match.partita ?? rowText(match, ['match', 'partita']),
      competition: competitionLabel(match),
      result,
      homeAway: rowText(match, ['casa_trasferta', 'home_away', 'venue', 'sede']),
    },
    overview: overviewFromPlayers(players),
    lineup,
    substitutions,
    players,
    averagePositions,
    shots,
    tackles,
    zoneDistributions: {
      averagePositions: buildZoneDistribution('Posizione media', averagePositions),
      events: buildZoneDistribution('Eventi Veo', eventPoints),
    },
    officialEvents: buildOfficialEvents(players),
    notes: [
      lineup.length ? 'Formazione e panchina da match_lineups (YouCoach).' : 'Nessuna formazione YouCoach disponibile per questa partita.',
      substitutions.length ? 'Sostituzioni da match_substitutions (YouCoach).' : 'Nessuna sostituzione YouCoach disponibile per questa partita.',
      averagePositions.length ? 'Posizioni medie da veo_position_stats.x_media_pct / y_media_pct.' : 'Nessuna posizione media Veo disponibile per questa partita.',
      eventPoints.length ? 'Mappe eventi da veo_event_positions.' : 'Nessun evento Veo disponibile per questa partita.',
    ],
    generatedAt: new Date().toISOString(),
  };

  return NextResponse.json(report, {
    headers: { 'Cache-Control': 'no-store' },
  });
}
