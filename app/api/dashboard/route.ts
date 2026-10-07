import { NextResponse } from 'next/server';
import { createClient } from '../../../lib/supabase/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type PlayerRow = {
  player_id: string;
  nome: string;
};

type MatchRow = Record<string, unknown> & {
  match_id: string;
  data: string | null;
  partita: string;
};

type SeasonRow = Record<string, unknown> & {
  player_id: string; presenze: number|null; minuti: number|null; gol: number|null; gol_per_90: number|null; tiri: number|null; tiri_per_90: number|null; passaggi: number|null; passaggi_per_90: number|null; passaggi_completati: number|null; passaggi_completati_per_90: number|null; passaggi_percento: number|null; distanza_km: number|null; distanza_km_per_90: number|null; sprint: number|null; sprint_per_90: number|null; corse_alta_intensita: number|null; corse_alta_intensita_per_90: number|null; velocita_max_kmh: number|null; velocita_media_kmh: number|null; minuti_per_presenza: number|null; sprint_per_km: number|null; corse_alta_intensita_per_km: number|null; gol_per_tiro: number|null; minuti_per_gol: number|null; minuti_per_tiro: number|null;
};

type StatRow = Record<string, unknown> & {
  match_id: string;
  player_id: string;
  minuti: number | null;
  gol: number | null;
  gol_per_90: number | null;
  tiri: number | null;
  tiri_per_90: number | null;
  passaggi: number | null;
  passaggi_completati: number | null;
  passaggi_percento: number | null;
  distanza_km: number | null;
  distanza_km_per_90: number | null;
  sprint: number | null;
  sprint_per_90: number | null;
  corse_alta_intensita: number | null;
  corse_alta_intensita_per_90: number | null;
  velocita_max_kmh: number | null;
  velocita_media_kmh: number | null;
};

const num = (v: unknown) => Number(v ?? 0) || 0;
const optionalNum = (row: Record<string, unknown> | undefined, keys: string[]) => {
  for (const key of keys) {
    const value = row?.[key];
    if (value !== undefined && value !== null) return num(value);
  }

  return 0;
};
const optionalText = (row: Record<string, unknown> | undefined, keys: string[]) => {
  for (const key of keys) {
    const value = row?.[key];
    if (value !== undefined && value !== null && String(value).trim()) return String(value).trim();
  }

  return '';
};

const competitionLabel = (row: MatchRow | undefined) => {
  const raw = optionalText(row, ['competizione', 'competition', 'torneo', 'tipo', 'tipo_partita', 'categoria']);
  const label = raw || row?.partita || '';
  return /coppa/i.test(label) ? 'COPPA' : 'CAMPIONATO';
};

const assistKeys = ['assist', 'assists', 'assistenze'];
const yellowCardKeys = ['ammonizioni', 'ammonizione', 'cartellini_gialli', 'gialli', 'cartellini_giallo'];
const redCardKeys = ['espulsioni', 'espulsione', 'cartellini_rossi', 'rossi', 'cartellini_rosso'];

const per90 = (value: number, minutes: number) =>
  minutes > 0 ? value * 90 / minutes : 0;

type TacticalKind = 'average' | 'shot' | 'tackle';

type TacticalPoint = {
  id: string;
  kind: TacticalKind;
  matchId: string;
  match: string;
  date: string;
  competition: 'CAMPIONATO' | 'COPPA';
  playerId: string;
  playerName: string;
  x: number;
  y: number;
  minute: number | null;
  outcome: string;
};

type TacticalData = {
  averagePositions: TacticalPoint[];
  shots: TacticalPoint[];
  tackles: TacticalPoint[];
  source: 'supabase' | 'none';
};

const emptyTacticalData = (): TacticalData => ({
  averagePositions: [],
  shots: [],
  tackles: [],
  source: 'none',
});

const normalizeKey = (key: string) =>
  key.toLowerCase().replace(/[^a-z0-9]/g, '');

const rowValue = (row: Record<string, unknown>, keys: string[]) => {
  const normalized = new Map(
    Object.entries(row).map(([key, value]) => [normalizeKey(key), value])
  );

  for (const key of keys) {
    const value = normalized.get(normalizeKey(key));
    if (value !== undefined && value !== null && String(value).trim() !== '') return value;
  }

  return undefined;
};

const rowText = (row: Record<string, unknown>, keys: string[]) => {
  const value = rowValue(row, keys);
  return value === undefined ? '' : String(value).trim();
};

const rowNumber = (row: Record<string, unknown>, keys: string[]) => {
  const value = rowValue(row, keys);
  if (value === undefined) return null;
  const parsed = Number(String(value).replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
};

const rowsFromUnknown = (value: unknown): Record<string, unknown>[] => {
  if (!Array.isArray(value)) return [];
  if (!value.length) return [];

  if (value.every(item => item && typeof item === 'object' && !Array.isArray(item))) {
    return value as Record<string, unknown>[];
  }

  const [headers, ...rows] = value;
  if (!Array.isArray(headers) || !headers.every(header => typeof header === 'string')) return [];

  return rows
    .filter(row => Array.isArray(row))
    .map(row => Object.fromEntries(
      headers.map((header, index) => [header, (row as unknown[])[index]])
    ));
};

const collectRowsByKeys = (
  value: unknown,
  wantedKeys: string[],
  depth = 0
): Record<string, unknown>[] => {
  if (!value || typeof value !== 'object' || depth > 4) return [];
  const rows: Record<string, unknown>[] = [];

  if (Array.isArray(value)) {
    return rowsFromUnknown(value);
  }

  Object.entries(value as Record<string, unknown>).forEach(([key, child]) => {
    const normalized = normalizeKey(key);
    if (wantedKeys.some(wanted => normalizeKey(wanted) === normalized)) {
      rows.push(...rowsFromUnknown(child));
    }

    if (child && typeof child === 'object') {
      rows.push(...collectRowsByKeys(child, wantedKeys, depth + 1));
    }
  });

  return rows;
};

const classifyTacticalKind = (row: Record<string, unknown>, fallback: TacticalKind): TacticalKind => {
  const label = rowText(row, ['kind', 'type', 'tipo', 'evento', 'event', 'categoria', 'azione']).toLowerCase();
  if (/tackle|contrasto|duello/.test(label)) return 'tackle';
  if (/shot|tiro|conclusione/.test(label)) return 'shot';
  if (/media|average|posizione|position/.test(label)) return 'average';
  return fallback;
};

const normalizeTacticalPoints = (
  rows: Record<string, unknown>[],
  fallbackKind: TacticalKind,
  allMatches: MatchRow[],
  playerNameMap: Map<string, string>
) => {
  const matchMap = new Map(allMatches.map(match => [match.match_id, match]));
  const rawPoints = rows.map((row, index) => {
    const matchId = rowText(row, ['match_id', 'matchId', 'id_partita', 'partita_id', 'gara_id']);
    const match = matchMap.get(matchId);
    const playerId = rowText(row, ['player_id', 'playerId', 'Player_ID', 'id_giocatore', 'giocatore_id']);
    const playerName = rowText(row, ['player_name', 'playerName', 'nome_giocatore', 'giocatore', 'player', 'nome']) || playerNameMap.get(playerId) || '';

    return {
      id: `${fallbackKind}-${matchId || 'match'}-${playerId || playerName || 'player'}-${index}`,
      kind: classifyTacticalKind(row, fallbackKind),
      matchId,
      match: match?.partita ?? rowText(row, ['match', 'partita', 'gara', 'avversario', 'opponent']),
      date: match?.data ?? rowText(row, ['date', 'data']),
      competition: (/coppa/i.test(rowText(row, ['competizione', 'competition', 'torneo', 'tipo_partita', 'categoria']))
        ? 'COPPA'
        : competitionLabel(match)) as 'CAMPIONATO' | 'COPPA',
      playerId,
      playerName,
      rawX: rowNumber(row, ['x', 'x_pct', 'x_percent', 'x_percentuale', 'coord_x', 'pos_x', 'x_pos', 'x_position', 'media_x', 'x_media']),
      rawY: rowNumber(row, ['y', 'y_pct', 'y_percent', 'y_percentuale', 'coord_y', 'pos_y', 'y_pos', 'y_position', 'media_y', 'y_media']),
      minute: rowNumber(row, ['minute', 'minuto', 'min']),
      outcome: rowText(row, ['outcome', 'esito', 'risultato', 'result', 'successo']),
    };
  }).filter(point => point.rawX !== null && point.rawY !== null);

  const xLooksMetric = rawPoints.some(point => Number(point.rawX) > 100);
  const yLooksMetric = xLooksMetric && rawPoints.every(point => Number(point.rawY) <= 68);

  return rawPoints.map(point => ({
    id: point.id,
    kind: point.kind,
    matchId: point.matchId,
    match: point.match,
    date: point.date,
    competition: point.competition,
    playerId: point.playerId,
    playerName: point.playerName,
    x: Math.max(0, Math.min(100, xLooksMetric ? Number(point.rawX) / 105 * 100 : Number(point.rawX))),
    y: Math.max(0, Math.min(100, yLooksMetric ? Number(point.rawY) / 68 * 100 : Number(point.rawY))),
    minute: point.minute,
    outcome: point.outcome,
  }));
};

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

const tacticalTableCandidates: { table: string; kind: TacticalKind }[] = [
  { table: 'player_average_positions', kind: 'average' },
  { table: 'tactical_average_positions', kind: 'average' },
  { table: 'average_positions', kind: 'average' },
  { table: 'posizioni_medie', kind: 'average' },
  { table: 'player_shots', kind: 'shot' },
  { table: 'tactical_shots', kind: 'shot' },
  { table: 'shot_map', kind: 'shot' },
  { table: 'mappa_tiri', kind: 'shot' },
  { table: 'player_tackles', kind: 'tackle' },
  { table: 'tactical_tackles', kind: 'tackle' },
  { table: 'tackle_map', kind: 'tackle' },
  { table: 'mappa_contrasti', kind: 'tackle' },
  { table: 'tactical_events', kind: 'average' },
  { table: 'player_tactical_events', kind: 'average' },
  { table: 'eventi_tattici', kind: 'average' },
  { table: 'tattica', kind: 'average' },
];

async function fetchTacticalData(
  supabase: SupabaseServerClient,
  isStaff: boolean,
  ownPlayerId: string,
  allMatches: MatchRow[],
  playerNameMap: Map<string, string>
): Promise<TacticalData> {
  const results = await Promise.all(
    tacticalTableCandidates.map(async candidate => {
      const { data, error } = await supabase
        .from(candidate.table)
        .select('*')
        .limit(2000);

      if (error || !data) return { ...candidate, rows: [] as Record<string, unknown>[] };
      return { ...candidate, rows: data as Record<string, unknown>[] };
    })
  );

  const points = results.flatMap(result =>
    normalizeTacticalPoints(result.rows, result.kind, allMatches, playerNameMap)
  );

  const visiblePoints = isStaff
    ? points
    : points.filter(point => point.playerId === ownPlayerId);

  const dedupedPoints = [
    ...new Map(
      visiblePoints.map(point => [
        `${point.kind}:${point.matchId}:${point.playerId}:${point.x}:${point.y}:${point.minute ?? ''}:${point.outcome}`,
        point,
      ])
    ).values(),
  ];

  const data = {
    averagePositions: dedupedPoints.filter(point => point.kind === 'average'),
    shots: dedupedPoints.filter(point => point.kind === 'shot'),
    tackles: dedupedPoints.filter(point => point.kind === 'tackle'),
    source: 'supabase' as const,
  };

  if (data.averagePositions.length || data.shots.length || data.tackles.length) return data;

  return emptyTacticalData();
}

export async function GET() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      { error: 'Non autenticato.' },
      { status: 401 }
    );
  }

  // Il profilo utente determina ruolo e Player_ID.
  const { data: profile, error: profileError } = await supabase
    .from('utenti')
    .select('player_id,nome,email,ruolo,attivo')
    .eq('id', user.id)
    .single();

  if (profileError || !profile) {
    return NextResponse.json(
      { error: 'Profilo utente non configurato.' },
      { status: 403 }
    );
  }

  if (!profile.attivo) {
    return NextResponse.json(
      { error: 'Utente disattivato.' },
      { status: 403 }
    );
  }

  if (profile.ruolo !== 'STAFF' && profile.ruolo !== 'GIOCATORE') {
    return NextResponse.json(
      { error: 'Ruolo utente non valido.' },
      { status: 403 }
    );
  }

  const isStaff = profile.ruolo === 'STAFF';
  const ownPlayerId = String(profile.player_id ?? '').trim();

  if (!isStaff && !ownPlayerId) {
    return NextResponse.json(
      { error: 'Player_ID non associato al profilo utente.' },
      { status: 403 }
    );
  }

  // RLS fa già il filtraggio:
  // - STAFF: vede tutti i giocatori e tutte le statistiche
  // - GIOCATORE: vede solo il proprio Player_ID
  const [playersResult, matchesResult, statsResult, seasonResult] = await Promise.all([
    supabase
      .from('players')
      .select('player_id,nome')
      .order('nome', { ascending: true }),
    supabase
      .from('matches')
      .select('*')
      .order('data', { ascending: true }),
    supabase
      .from('player_match_stats')
      .select('*'),
    supabase
      .from('player_season_stats')
      .select('*'),
  ]);

  if (playersResult.error) {
    return NextResponse.json(
      { error: `Supabase players: ${playersResult.error.message}` },
      { status: 502 }
    );
  }

  if (matchesResult.error) {
    return NextResponse.json(
      { error: `Supabase matches: ${matchesResult.error.message}` },
      { status: 502 }
    );
  }

  if (statsResult.error) {
    return NextResponse.json(
      { error: `Supabase player_match_stats: ${statsResult.error.message}` },
      { status: 502 }
    );
  }

  if (seasonResult.error) {
    return NextResponse.json(
      { error: `Supabase player_season_stats: ${seasonResult.error.message}` },
      { status: 502 }
    );
  }

  const allPlayers = (playersResult.data ?? []) as PlayerRow[];
  const allMatches = (matchesResult.data ?? []) as MatchRow[];
  const allStats = (statsResult.data ?? []) as StatRow[];
  const allSeason = (seasonResult.data ?? []) as SeasonRow[];
  const seasonMap = new Map(allSeason.map(row => [row.player_id, row]));
  const matchMetricTotals = new Map<string, { assists: number; yellowCards: number; redCards: number }>();

  allStats.forEach(row => {
    const current = matchMetricTotals.get(row.player_id) ?? { assists: 0, yellowCards: 0, redCards: 0 };
    current.assists += optionalNum(row, assistKeys);
    current.yellowCards += optionalNum(row, yellowCardKeys);
    current.redCards += optionalNum(row, redCardKeys);
    matchMetricTotals.set(row.player_id, current);
  });

  if (!isStaff && !allPlayers.some(p => p.player_id === ownPlayerId)) {
    return NextResponse.json(
      { error: 'Player_ID associato ma non presente nella tabella players.' },
      { status: 403 }
    );
  }

  const playerNameMap = new Map(
    allPlayers.map(p => [p.player_id, p.nome])
  );

  const tactics = await fetchTacticalData(
    supabase,
    isStaff,
    ownPlayerId,
    allMatches,
    playerNameMap
  );

  const matchMap = new Map(
    allMatches.map(m => [m.match_id, m])
  );

  // Fonte ufficiale delle statistiche stagionali:
  // player_season_stats, sincronizzata da ANALISI_GIOCATORI.
  const allSeasonalPlayers = allPlayers.map(p => {
    const s = seasonMap.get(p.player_id);
    const matchTotals = matchMetricTotals.get(p.player_id) ?? { assists: 0, yellowCards: 0, redCards: 0 };

    return {
      playerId: p.player_id,
      name: p.nome,
      appearances: num(s?.presenze),
      minutes: num(s?.minuti),
      goals: num(s?.gol),
      assists: optionalNum(s, assistKeys) || matchTotals.assists,
      yellowCards: optionalNum(s, yellowCardKeys) || matchTotals.yellowCards,
      redCards: optionalNum(s, redCardKeys) || matchTotals.redCards,
      goalsPer90: num(s?.gol_per_90),
      shots: num(s?.tiri),
      shotsPer90: num(s?.tiri_per_90),
      passes: num(s?.passaggi),
      passesPer90: num(s?.passaggi_per_90),
      completedPasses: num(s?.passaggi_completati),
      completedPassesPer90: num(s?.passaggi_completati_per_90),
      passSuccess: num(s?.passaggi_percento),
      distanceKm: num(s?.distanza_km),
      distancePer90: num(s?.distanza_km_per_90),
      sprints: num(s?.sprint),
      sprintsPer90: num(s?.sprint_per_90),
      highIntensityRuns: num(s?.corse_alta_intensita),
      highIntensityRunsPer90: num(s?.corse_alta_intensita_per_90),
      maxSpeed: num(s?.velocita_max_kmh),
      averageSpeed: num(s?.velocita_media_kmh),
      minutesPerAppearance: num(s?.minuti_per_presenza),
      sprintsPerKm: num(s?.sprint_per_km),
      highIntensityRunsPerKm: num(s?.corse_alta_intensita_per_km),
      goalsPerShot: num(s?.gol_per_tiro),
      minutesPerGoal: num(s?.minuti_per_gol),
      minutesPerShot: num(s?.minuti_per_tiro),
    };
  });

  const allMatchStats = allStats.map(s => {
    const match = matchMap.get(s.match_id);
    const minutes = num(s.minuti);

    return {
      matchId: s.match_id,
      date: match?.data ?? '',
      match: match?.partita ?? '',
      competition: competitionLabel(match),
      playerId: s.player_id,
      playerName: playerNameMap.get(s.player_id) ?? '',
      minutes,
      goals: num(s.gol),
      assists: optionalNum(s, assistKeys),
      yellowCards: optionalNum(s, yellowCardKeys),
      redCards: optionalNum(s, redCardKeys),
      goalsPer90: num(s.gol_per_90) || per90(num(s.gol), minutes),
      shots: num(s.tiri),
      shotsPer90: num(s.tiri_per_90) || per90(num(s.tiri), minutes),
      passes: num(s.passaggi),
      completedPasses: num(s.passaggi_completati),
      passSuccess: num(s.passaggi_percento),
      distanceKm: num(s.distanza_km),
      distancePer90: num(s.distanza_km_per_90) || per90(num(s.distanza_km), minutes),
      sprints: num(s.sprint),
      sprintsPer90: num(s.sprint_per_90) || per90(num(s.sprint), minutes),
      highIntensityRuns: num(s.corse_alta_intensita),
      highIntensityRunsPer90: num(s.corse_alta_intensita_per_90) || per90(num(s.corse_alta_intensita), minutes),
      maxSpeed: num(s.velocita_max_kmh),
      averageSpeed: num(s.velocita_media_kmh),
    };
  });

  const players = isStaff
    ? allSeasonalPlayers
    : allSeasonalPlayers.filter(p => p.playerId === ownPlayerId);

  const matches = isStaff
    ? allMatchStats
    : allMatchStats.filter(m => m.playerId === ownPlayerId);

  // Tutti gli utenti autenticati possono vedere l'elenco delle partite,
  // mentre le statistiche restano filtrate dal ruolo/RLS.
  const teamMatches = allMatches.map(m => ({
    matchId: m.match_id,
    date: m.data ?? '',
    match: m.partita,
    competition: competitionLabel(m),
  }));

  if (!isStaff && !players.length) {
    return NextResponse.json(
      { error: 'Player_ID non associato ai dati del database.' },
      { status: 403 }
    );
  }

  return NextResponse.json(
    {
      stagione: '2026/2027',
      role: profile.ruolo,
      userName: profile.nome,
      playerId: isStaff ? null : ownPlayerId,
      players,
      matches,
      teamMatches,
      tactics,
      source: 'supabase',
    },
    {
      headers: { 'Cache-Control': 'no-store' },
    }
  );
}
