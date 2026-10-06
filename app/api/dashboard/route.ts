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
      source: 'supabase',
    },
    {
      headers: { 'Cache-Control': 'no-store' },
    }
  );
}
