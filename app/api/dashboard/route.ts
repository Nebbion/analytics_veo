import { NextResponse } from 'next/server';
import { createClient } from '../../../lib/supabase/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type PlayerRow = {
  player_id: string;
  nome: string;
};

type MatchRow = {
  match_id: string;
  data: string | null;
  partita: string;
};

type StatRow = {
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
  const [playersResult, matchesResult, statsResult] = await Promise.all([
    supabase
      .from('players')
      .select('player_id,nome')
      .order('nome', { ascending: true }),
    supabase
      .from('matches')
      .select('match_id,data,partita')
      .order('data', { ascending: true }),
    supabase
      .from('player_match_stats')
      .select(`
        match_id,
        player_id,
        minuti,
        gol,
        gol_per_90,
        tiri,
        tiri_per_90,
        passaggi,
        passaggi_completati,
        passaggi_percento,
        distanza_km,
        distanza_km_per_90,
        sprint,
        sprint_per_90,
        corse_alta_intensita,
        corse_alta_intensita_per_90,
        velocita_max_kmh,
        velocita_media_kmh
      `),
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

  const allPlayers = (playersResult.data ?? []) as PlayerRow[];
  const allMatches = (matchesResult.data ?? []) as MatchRow[];
  const allStats = (statsResult.data ?? []) as StatRow[];

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

  // Aggregazione stagionale direttamente dai dati per-partita di Supabase.
  const seasonal = new Map<string, {
    appearances: number;
    minutes: number;
    goals: number;
    shots: number;
    passes: number;
    completedPasses: number;
    distanceKm: number;
    sprints: number;
    highIntensityRuns: number;
    maxSpeed: number;
    averageSpeedWeighted: number;
  }>();

  allStats.forEach(s => {
    const current = seasonal.get(s.player_id) ?? {
      appearances: 0,
      minutes: 0,
      goals: 0,
      shots: 0,
      passes: 0,
      completedPasses: 0,
      distanceKm: 0,
      sprints: 0,
      highIntensityRuns: 0,
      maxSpeed: 0,
      averageSpeedWeighted: 0,
    };

    const minutes = num(s.minuti);

    current.appearances += 1;
    current.minutes += minutes;
    current.goals += num(s.gol);
    current.shots += num(s.tiri);
    current.passes += num(s.passaggi);
    current.completedPasses += num(s.passaggi_completati);
    current.distanceKm += num(s.distanza_km);
    current.sprints += num(s.sprint);
    current.highIntensityRuns += num(s.corse_alta_intensita);
    current.maxSpeed = Math.max(current.maxSpeed, num(s.velocita_max_kmh));
    current.averageSpeedWeighted += num(s.velocita_media_kmh) * minutes;

    seasonal.set(s.player_id, current);
  });

  const allSeasonalPlayers = allPlayers.map(p => {
    const s = seasonal.get(p.player_id) ?? {
      appearances: 0,
      minutes: 0,
      goals: 0,
      shots: 0,
      passes: 0,
      completedPasses: 0,
      distanceKm: 0,
      sprints: 0,
      highIntensityRuns: 0,
      maxSpeed: 0,
      averageSpeedWeighted: 0,
    };

    return {
      playerId: p.player_id,
      name: p.nome,
      appearances: s.appearances,
      minutes: s.minutes,
      goals: s.goals,
      goalsPer90: per90(s.goals, s.minutes),
      shots: s.shots,
      shotsPer90: per90(s.shots, s.minutes),
      passes: s.passes,
      completedPasses: s.completedPasses,
      passSuccess: s.passes > 0 ? s.completedPasses / s.passes * 100 : 0,
      distanceKm: s.distanceKm,
      distancePer90: per90(s.distanceKm, s.minutes),
      sprints: s.sprints,
      sprintsPer90: per90(s.sprints, s.minutes),
      highIntensityRuns: s.highIntensityRuns,
      highIntensityRunsPer90: per90(s.highIntensityRuns, s.minutes),
      maxSpeed: s.maxSpeed,
      averageSpeed: s.minutes > 0 ? s.averageSpeedWeighted / s.minutes : 0,
      minutesPerAppearance: s.appearances > 0 ? s.minutes / s.appearances : 0,
    };
  });

  const allMatchStats = allStats.map(s => {
    const match = matchMap.get(s.match_id);
    const minutes = num(s.minuti);

    return {
      matchId: s.match_id,
      date: match?.data ?? '',
      match: match?.partita ?? '',
      playerId: s.player_id,
      playerName: playerNameMap.get(s.player_id) ?? '',
      minutes,
      goals: num(s.gol),
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
