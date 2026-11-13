#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SCRIPT_DIR = fileURLToPath(new URL('.', import.meta.url));
const DEFAULT_SOURCE = resolve(SCRIPT_DIR, '../lib/championship-calendar.ts');

export const CALENDAR_CONTEXT = Object.freeze({
  seasonCode: '2026/27',
  competitionKey: 'it-veneto:2026-27:prima-categoria-girone-e',
  competitionName: 'Prima Categoria - Girone E',
  competitionKind: 'LEAGUE',
  analyticsCategory: 'CAMPIONATO',
  villanoveseName: 'ASD Villanovese',
  villanoveseTeamKey: 'it-veneto:asd-villanovese',
  region: 'Veneto',
  timezone: 'Europe/Rome',
  sourceSystem: 'REPOSITORY_CALENDAR',
  sourceReference: 'lib/championship-calendar.ts',
});

const ROUND_PATTERN = /\{\s*matchday:\s*(\d+),\s*opponent:\s*'((?:\\.|[^'])*)',\s*firstLegDate:\s*'(\d{4}-\d{2}-\d{2})',\s*firstLegHome:\s*(true|false),\s*secondLegDate:\s*'(\d{4}-\d{2}-\d{2})'\s*\}/g;
const KICKOFF_PATTERN = /date\s*>=\s*'(\d{4}-\d{2}-\d{2})'\s*&&\s*date\s*<=\s*'(\d{4}-\d{2}-\d{2})'\s*\?\s*'(\d{2}:\d{2})'\s*:\s*null/;

const decodeSingleQuotedString = (value) => value
  .replace(/\\'/g, "'")
  .replace(/\\\\/g, '\\');

export const normalizeName = (value) => String(value ?? '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-zA-Z0-9]+/g, ' ')
  .trim()
  .toUpperCase();

export const slugify = (value) => normalizeName(value)
  .toLowerCase()
  .replace(/\s+/g, '-')
  .replace(/^-|-$/g, '');

const assertIsoDate = (value, label) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`${label} non è una data ISO valida: ${value}`);
  }

  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new Error(`${label} non è una data di calendario valida: ${value}`);
  }
};

export function parseCalendarSource(source) {
  const rounds = [];

  for (const match of source.matchAll(ROUND_PATTERN)) {
    const round = {
      matchday: Number(match[1]),
      opponent: decodeSingleQuotedString(match[2]),
      firstLegDate: match[3],
      firstLegHome: match[4] === 'true',
      secondLegDate: match[5],
    };

    assertIsoDate(round.firstLegDate, `Andata giornata ${round.matchday}`);
    assertIsoDate(round.secondLegDate, `Ritorno giornata ${round.matchday}`);
    rounds.push(round);
  }

  if (rounds.length !== 15) {
    throw new Error(`Attese 15 giornate nel calendario TypeScript, trovate ${rounds.length}.`);
  }

  const matchdays = new Set(rounds.map((round) => round.matchday));
  if (matchdays.size !== 15 || Math.min(...matchdays) !== 1 || Math.max(...matchdays) !== 15) {
    throw new Error('Le giornate devono essere univoche e comprese tra 1 e 15.');
  }

  const kickoffMatch = source.match(KICKOFF_PATTERN);
  const kickoffRule = kickoffMatch
    ? { from: kickoffMatch[1], to: kickoffMatch[2], time: kickoffMatch[3] }
    : null;

  return { rounds, kickoffRule };
}

const kickoffForDate = (date, kickoffRule) => {
  if (!kickoffRule) return null;
  return date >= kickoffRule.from && date <= kickoffRule.to
    ? kickoffRule.time
    : null;
};

const buildTeam = (name) => ({
  team_key: name === CALENDAR_CONTEXT.villanoveseName
    ? CALENDAR_CONTEXT.villanoveseTeamKey
    : `it-veneto:${slugify(name)}`,
  official_name: name,
  normalized_name: normalizeName(name),
  region: CALENDAR_CONTEXT.region,
  active: true,
  verification_status: 'UNVERIFIED',
  verification_notes: 'Nome importato dal calendario applicativo; codice e denominazione ufficiale LND non ancora verificati.',
});

export function buildCalendarImport(parsed) {
  const warnings = [];
  if (!parsed.kickoffRule) {
    warnings.push('Regola oraria non riconosciuta: tutti gli orari resteranno NULL.');
  }

  const teamNames = new Set([CALENDAR_CONTEXT.villanoveseName]);
  parsed.rounds.forEach((round) => teamNames.add(round.opponent));
  const teams = [...teamNames].map(buildTeam);
  const teamByName = new Map(teams.map((team) => [team.official_name, team]));
  const villanovese = teamByName.get(CALENDAR_CONTEXT.villanoveseName);

  const fixtures = parsed.rounds.flatMap((round) => {
    const opponent = teamByName.get(round.opponent);
    const common = {
      season_code: CALENDAR_CONTEXT.seasonCode,
      competition_key: CALENDAR_CONTEXT.competitionKey,
      matchday: round.matchday,
      kickoff_timezone: CALENDAR_CONTEXT.timezone,
      status: 'SCHEDULED',
      source_system: CALENDAR_CONTEXT.sourceSystem,
      source_reference: CALENDAR_CONTEXT.sourceReference,
      verification_status: 'UNVERIFIED',
      verification_notes: 'Fixture importata dal calendario applicativo e non ancora verificata con una fonte ufficiale LND.',
    };

    return [
      {
        ...common,
        idempotency_key: `lnd:${CALENDAR_CONTEXT.competitionKey}:andata:${round.matchday}`,
        leg: 'ANDATA',
        home_team_key: round.firstLegHome ? villanovese.team_key : opponent.team_key,
        away_team_key: round.firstLegHome ? opponent.team_key : villanovese.team_key,
        scheduled_date: round.firstLegDate,
        kickoff_time: kickoffForDate(round.firstLegDate, parsed.kickoffRule),
        original_scheduled_date: round.firstLegDate,
        original_kickoff_time: kickoffForDate(round.firstLegDate, parsed.kickoffRule),
      },
      {
        ...common,
        idempotency_key: `lnd:${CALENDAR_CONTEXT.competitionKey}:ritorno:${round.matchday}`,
        leg: 'RITORNO',
        home_team_key: round.firstLegHome ? opponent.team_key : villanovese.team_key,
        away_team_key: round.firstLegHome ? villanovese.team_key : opponent.team_key,
        scheduled_date: round.secondLegDate,
        kickoff_time: kickoffForDate(round.secondLegDate, parsed.kickoffRule),
        original_scheduled_date: round.secondLegDate,
        original_kickoff_time: kickoffForDate(round.secondLegDate, parsed.kickoffRule),
      },
    ];
  });

  if (fixtures.length !== 30) {
    throw new Error(`Attese 30 fixture, prodotte ${fixtures.length}.`);
  }

  const fixtureKeys = new Set(fixtures.map((fixture) => fixture.idempotency_key));
  if (fixtureKeys.size !== fixtures.length) {
    throw new Error('Sono state generate chiavi idempotenti duplicate per le fixture.');
  }

  for (const fixture of fixtures) {
    if (fixture.home_team_key === fixture.away_team_key) {
      throw new Error(`Squadra casa e trasferta coincidono: ${fixture.idempotency_key}`);
    }
  }

  const dates = fixtures.map((fixture) => fixture.scheduled_date).sort();

  return {
    season: {
      code: CALENDAR_CONTEXT.seasonCode,
      starts_on: dates[0],
      ends_on: dates.at(-1),
      active: true,
      verification_status: 'UNVERIFIED',
      verification_notes: 'Intervallo derivato dalle fixture del repository; non rappresenta date federali ufficialmente verificate.',
    },
    competition: {
      competition_key: CALENDAR_CONTEXT.competitionKey,
      official_name: CALENDAR_CONTEXT.competitionName,
      normalized_name: normalizeName(CALENDAR_CONTEXT.competitionName),
      kind: CALENDAR_CONTEXT.competitionKind,
      analytics_category: CALENDAR_CONTEXT.analyticsCategory,
      region: CALENDAR_CONTEXT.region,
      verification_status: 'UNVERIFIED',
      verification_notes: 'Competizione ricavata dal contesto della dashboard; codice ufficiale LND non ancora verificato.',
    },
    teams,
    aliases: teams.map((team) => ({
      alias_key: `${team.team_key}:repository-calendar`,
      team_key: team.team_key,
      alias: team.official_name,
      normalized_alias: team.normalized_name,
      verification_status: 'UNVERIFIED',
    })),
    fixtures,
    warnings,
  };
}

const sqlLiteral = (value) => value === null || value === undefined
  ? 'null'
  : `'${String(value).replace(/'/g, "''")}'`;

export function buildCalendarSeedSql(model) {
  const teamValues = model.teams.map((team) => `(
    ${sqlLiteral(team.team_key)},
    ${sqlLiteral(team.official_name)},
    ${sqlLiteral(team.normalized_name)},
    ${sqlLiteral(team.region)},
    ${team.active ? 'true' : 'false'},
    ${sqlLiteral(team.verification_status)},
    ${sqlLiteral(team.verification_notes)}
  )`).join(',\n');

  const aliasValues = model.aliases.map((alias) => `(
    ${sqlLiteral(alias.alias_key)},
    ${sqlLiteral(alias.team_key)},
    ${sqlLiteral(alias.alias)},
    ${sqlLiteral(alias.normalized_alias)},
    ${sqlLiteral(alias.verification_status)}
  )`).join(',\n');

  const fixtureValues = model.fixtures.map((fixture) => `(
    ${sqlLiteral(fixture.idempotency_key)},
    ${fixture.matchday},
    ${sqlLiteral(fixture.leg)},
    ${sqlLiteral(fixture.home_team_key)},
    ${sqlLiteral(fixture.away_team_key)},
    ${sqlLiteral(fixture.scheduled_date)},
    ${sqlLiteral(fixture.kickoff_time ?? '')},
    ${sqlLiteral(fixture.original_scheduled_date)},
    ${sqlLiteral(fixture.original_kickoff_time ?? '')},
    ${sqlLiteral(fixture.status)},
    ${sqlLiteral(fixture.source_system)},
    ${sqlLiteral(fixture.source_reference)},
    ${sqlLiteral(fixture.verification_status)},
    ${sqlLiteral(fixture.verification_notes)}
  )`).join(',\n');

  return `begin;

insert into public.lnd_seasons (
  code, starts_on, ends_on, active, verification_status, verification_notes
)
values (
  ${sqlLiteral(model.season.code)},
  ${sqlLiteral(model.season.starts_on)}::date,
  ${sqlLiteral(model.season.ends_on)}::date,
  ${model.season.active ? 'true' : 'false'},
  ${sqlLiteral(model.season.verification_status)},
  ${sqlLiteral(model.season.verification_notes)}
)
on conflict (code) do nothing;

insert into public.lnd_competitions (
  season_id, competition_key, official_name, normalized_name, kind,
  analytics_category, region, verification_status, verification_notes
)
select
  s.id,
  ${sqlLiteral(model.competition.competition_key)},
  ${sqlLiteral(model.competition.official_name)},
  ${sqlLiteral(model.competition.normalized_name)},
  ${sqlLiteral(model.competition.kind)},
  ${sqlLiteral(model.competition.analytics_category)},
  ${sqlLiteral(model.competition.region)},
  ${sqlLiteral(model.competition.verification_status)},
  ${sqlLiteral(model.competition.verification_notes)}
from public.lnd_seasons s
where s.code = ${sqlLiteral(model.season.code)}
on conflict (competition_key) do nothing;

insert into public.lnd_teams (
  team_key, official_name, normalized_name, region, active,
  verification_status, verification_notes
)
values
${teamValues}
on conflict (team_key) do nothing;

with aliases(alias_key, team_key, alias, normalized_alias, verification_status) as (
  values
${aliasValues}
)
insert into public.lnd_team_aliases (
  alias_key, team_id, alias, normalized_alias, verification_status
)
select
  a.alias_key,
  t.id,
  a.alias,
  a.normalized_alias,
  a.verification_status
from aliases a
join public.lnd_teams t on t.team_key = a.team_key
on conflict (alias_key) do nothing;

with fixture_values(
  idempotency_key, matchday, leg, home_team_key, away_team_key,
  scheduled_date, kickoff_time, original_scheduled_date,
  original_kickoff_time, status, source_system, source_reference,
  verification_status, verification_notes
) as (
  values
${fixtureValues}
)
insert into public.lnd_fixtures (
  idempotency_key, season_id, competition_id, matchday, leg,
  home_team_id, away_team_id, scheduled_date, kickoff_time,
  kickoff_timezone, original_scheduled_date, original_kickoff_time,
  status, source_system, source_reference, verification_status,
  verification_notes
)
select
  v.idempotency_key,
  s.id,
  c.id,
  v.matchday,
  v.leg,
  home_team.id,
  away_team.id,
  v.scheduled_date::date,
  nullif(v.kickoff_time, '')::time,
  ${sqlLiteral(CALENDAR_CONTEXT.timezone)},
  v.original_scheduled_date::date,
  nullif(v.original_kickoff_time, '')::time,
  v.status,
  v.source_system,
  v.source_reference,
  v.verification_status,
  v.verification_notes
from fixture_values v
join public.lnd_seasons s on s.code = ${sqlLiteral(model.season.code)}
join public.lnd_competitions c
  on c.competition_key = ${sqlLiteral(model.competition.competition_key)}
join public.lnd_teams home_team on home_team.team_key = v.home_team_key
join public.lnd_teams away_team on away_team.team_key = v.away_team_key
on conflict (idempotency_key) do nothing;

commit;

select
  (select count(*) from public.lnd_seasons where code = ${sqlLiteral(model.season.code)}) as seasons,
  (select count(*) from public.lnd_competitions where competition_key = ${sqlLiteral(model.competition.competition_key)}) as competitions,
  (select count(*) from public.lnd_teams where team_key in (${model.teams.map((team) => sqlLiteral(team.team_key)).join(', ')})) as teams,
  (select count(*) from public.lnd_team_aliases where alias_key in (${model.aliases.map((alias) => sqlLiteral(alias.alias_key)).join(', ')})) as aliases,
  (select count(*) from public.lnd_fixtures where competition_id = (
    select id from public.lnd_competitions where competition_key = ${sqlLiteral(model.competition.competition_key)}
  )) as fixtures;
`;
}

const fail = (message, details) => {
  const suffix = details ? `: ${details}` : '';
  throw new Error(`${message}${suffix}`);
};

const getOne = async (client, table, column, value, select = '*') => {
  const { data, error } = await client
    .from(table)
    .select(select)
    .eq(column, value)
    .maybeSingle();

  if (error) fail(`Lettura ${table} fallita`, error.message);
  return data;
};

const insertOne = async (client, table, payload, select = '*') => {
  const { data, error } = await client
    .from(table)
    .insert(payload)
    .select(select)
    .single();

  if (error) fail(`Inserimento ${table} fallito`, error.message);
  return data;
};

const ensureOne = async (client, table, keyColumn, payload, select = '*') => {
  const existing = await getOne(client, table, keyColumn, payload[keyColumn], select);
  if (existing) return { row: existing, inserted: false };
  return { row: await insertOne(client, table, payload, select), inserted: true };
};

export async function persistCalendar(client, model) {
  const summary = {
    inserted: { seasons: 0, competitions: 0, teams: 0, aliases: 0, fixtures: 0 },
    unchanged: { seasons: 0, competitions: 0, teams: 0, aliases: 0, fixtures: 0 },
    updatedUnverifiedFixtures: 0,
    protectedFixtures: 0,
    warnings: [...model.warnings],
  };

  const seasonResult = await ensureOne(
    client,
    'lnd_seasons',
    'code',
    model.season,
    'id,code,verification_status',
  );
  summary[seasonResult.inserted ? 'inserted' : 'unchanged'].seasons += 1;

  const competitionPayload = {
    ...model.competition,
    season_id: seasonResult.row.id,
  };
  const competitionResult = await ensureOne(
    client,
    'lnd_competitions',
    'competition_key',
    competitionPayload,
    'id,competition_key,verification_status',
  );
  summary[competitionResult.inserted ? 'inserted' : 'unchanged'].competitions += 1;

  const teamIds = new Map();
  for (const team of model.teams) {
    const result = await ensureOne(
      client,
      'lnd_teams',
      'team_key',
      team,
      'id,team_key,official_name,verification_status',
    );
    teamIds.set(team.team_key, result.row.id);
    summary[result.inserted ? 'inserted' : 'unchanged'].teams += 1;
  }

  for (const alias of model.aliases) {
    const result = await ensureOne(
      client,
      'lnd_team_aliases',
      'alias_key',
      {
        alias_key: alias.alias_key,
        team_id: teamIds.get(alias.team_key),
        alias: alias.alias,
        normalized_alias: alias.normalized_alias,
        verification_status: alias.verification_status,
      },
      'id,alias_key,verification_status',
    );
    summary[result.inserted ? 'inserted' : 'unchanged'].aliases += 1;
  }

  for (const fixture of model.fixtures) {
    const payload = {
      idempotency_key: fixture.idempotency_key,
      season_id: seasonResult.row.id,
      competition_id: competitionResult.row.id,
      matchday: fixture.matchday,
      leg: fixture.leg,
      home_team_id: teamIds.get(fixture.home_team_key),
      away_team_id: teamIds.get(fixture.away_team_key),
      scheduled_date: fixture.scheduled_date,
      kickoff_time: fixture.kickoff_time,
      kickoff_timezone: fixture.kickoff_timezone,
      original_scheduled_date: fixture.original_scheduled_date,
      original_kickoff_time: fixture.original_kickoff_time,
      status: fixture.status,
      source_system: fixture.source_system,
      source_reference: fixture.source_reference,
      verification_status: fixture.verification_status,
      verification_notes: fixture.verification_notes,
    };

    const existing = await getOne(
      client,
      'lnd_fixtures',
      'idempotency_key',
      fixture.idempotency_key,
      'id,idempotency_key,home_team_id,away_team_id,scheduled_date,kickoff_time,status,source_system,verification_status',
    );

    if (!existing) {
      await insertOne(client, 'lnd_fixtures', payload, 'id,idempotency_key');
      summary.inserted.fixtures += 1;
      continue;
    }

    const currentTime = existing.kickoff_time?.slice(0, 5) ?? null;
    const same =
      existing.home_team_id === payload.home_team_id &&
      existing.away_team_id === payload.away_team_id &&
      existing.scheduled_date === payload.scheduled_date &&
      currentTime === payload.kickoff_time;

    if (same) {
      summary.unchanged.fixtures += 1;
      continue;
    }

    const mayUpdate =
      existing.verification_status === 'UNVERIFIED' &&
      existing.source_system === CALENDAR_CONTEXT.sourceSystem &&
      existing.status === 'SCHEDULED';

    if (!mayUpdate) {
      summary.protectedFixtures += 1;
      summary.warnings.push(
        `Fixture ${fixture.idempotency_key} diversa dal file ma già verificata o rettificata: non sovrascritta.`,
      );
      continue;
    }

    const { error } = await client
      .from('lnd_fixtures')
      .update({
        home_team_id: payload.home_team_id,
        away_team_id: payload.away_team_id,
        scheduled_date: payload.scheduled_date,
        kickoff_time: payload.kickoff_time,
        verification_notes: `${payload.verification_notes} Valore aggiornato da una successiva versione del file sorgente; data/orario originali conservati.`,
      })
      .eq('id', existing.id);

    if (error) fail('Aggiornamento fixture non verificata fallito', error.message);
    summary.updatedUnverifiedFixtures += 1;
  }

  return summary;
}

const parseArgs = (argv) => {
  const options = {
    apply: false,
    applyViaCli: false,
    emitSql: false,
    json: false,
    source: DEFAULT_SOURCE,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--apply') options.apply = true;
    else if (argument === '--apply-via-cli') options.applyViaCli = true;
    else if (argument === '--emit-sql') options.emitSql = true;
    else if (argument === '--json') options.json = true;
    else if (argument === '--source') {
      const value = argv[index + 1];
      if (!value) throw new Error('--source richiede un percorso.');
      options.source = resolve(value);
      index += 1;
    } else if (argument === '--help' || argument === '-h') {
      options.help = true;
    } else {
      throw new Error(`Argomento non riconosciuto: ${argument}`);
    }
  }

  return options;
};

const printHelp = () => {
  process.stdout.write(`Uso:
  node scripts/import-lnd-calendar.mjs [--source FILE] [--json]
  node scripts/import-lnd-calendar.mjs --apply [--source FILE]
  node scripts/import-lnd-calendar.mjs --emit-sql [--source FILE]
  node scripts/import-lnd-calendar.mjs --apply-via-cli [--source FILE]

Senza --apply esegue soltanto parsing e validazione locale.
Con --apply richiede NEXT_PUBLIC_SUPABASE_URL e LND_WATCHER_API_KEY
(oppure SUPABASE_SERVICE_ROLE_KEY per un'esecuzione amministrativa controllata).
--apply-via-cli usa la connessione del progetto Supabase già collegato.
`);
};

export async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  if (options.help) {
    printHelp();
    return;
  }

  const source = await readFile(options.source, 'utf8');
  const parsed = parseCalendarSource(source);
  const model = buildCalendarImport(parsed);

  if (options.emitSql) {
    process.stdout.write(buildCalendarSeedSql(model));
    return;
  }

  if (options.applyViaCli) {
    const sql = buildCalendarSeedSql(model);
    const result = spawnSync(
      'supabase',
      ['db', 'query', '--linked', sql],
      { cwd: resolve(SCRIPT_DIR, '..'), stdio: 'inherit', shell: false },
    );
    if (result.error) throw result.error;
    if (result.status !== 0) {
      throw new Error(`Supabase CLI terminata con codice ${result.status}.`);
    }
    return;
  }

  if (!options.apply) {
    const preview = {
      mode: 'DRY_RUN',
      source: options.source,
      season: model.season,
      competition: model.competition,
      teamCount: model.teams.length,
      fixtureCount: model.fixtures.length,
      fixturesWithKickoff: model.fixtures.filter((fixture) => fixture.kickoff_time).length,
      fixturesWithoutKickoff: model.fixtures.filter((fixture) => !fixture.kickoff_time).length,
      warnings: model.warnings,
      fixtures: options.json ? model.fixtures : undefined,
    };
    process.stdout.write(`${JSON.stringify(preview, null, 2)}\n`);
    return preview;
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const apiKey = process.env.LND_WATCHER_API_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !apiKey) {
    throw new Error('Per --apply servono NEXT_PUBLIC_SUPABASE_URL e LND_WATCHER_API_KEY (o SUPABASE_SERVICE_ROLE_KEY).');
  }

  const { createClient } = await import('@supabase/supabase-js');
  const client = createClient(supabaseUrl, apiKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const summary = await persistCalendar(client, model);
  process.stdout.write(`${JSON.stringify({ mode: 'APPLY', ...summary }, null, 2)}\n`);
  return summary;
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : '';
if (import.meta.url === invokedPath) {
  main().catch((error) => {
    process.stderr.write(`Import calendario LND fallito: ${error.message}\n`);
    process.exitCode = 1;
  });
}
