import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  CALENDAR_CONTEXT,
  buildCalendarImport,
  buildCalendarSeedSql,
  normalizeName,
  parseCalendarSource,
  persistCalendar,
} from '../scripts/import-lnd-calendar.mjs';

const sourcePath = new URL('../lib/championship-calendar.ts', import.meta.url);

test('parses the 15 rounds and the explicit kickoff rule', async () => {
  const source = await readFile(sourcePath, 'utf8');
  const parsed = parseCalendarSource(source);

  assert.equal(parsed.rounds.length, 15);
  assert.deepEqual(parsed.kickoffRule, {
    from: '2026-10-25',
    to: '2027-03-21',
    time: '14:30',
  });
  assert.deepEqual(parsed.rounds[0], {
    matchday: 1,
    opponent: 'Polisportiva Real Terme',
    firstLegDate: '2026-09-13',
    firstLegHome: false,
    secondLegDate: '2027-01-10',
  });
});

test('builds 30 idempotent fixtures without inventing missing kickoff times', async () => {
  const source = await readFile(sourcePath, 'utf8');
  const model = buildCalendarImport(parseCalendarSource(source));

  assert.equal(model.fixtures.length, 30);
  assert.equal(model.teams.length, 16);
  assert.equal(new Set(model.fixtures.map((fixture) => fixture.idempotency_key)).size, 30);
  assert.equal(model.fixtures.filter((fixture) => fixture.kickoff_time === '14:30').length, 20);
  assert.equal(model.fixtures.filter((fixture) => fixture.kickoff_time === null).length, 10);
  assert.ok(model.fixtures.every((fixture) => fixture.verification_status === 'UNVERIFIED'));
  assert.ok(model.fixtures.every((fixture) => fixture.home_team_key !== fixture.away_team_key));
});

test('keeps home and away balanced across the two legs', async () => {
  const source = await readFile(sourcePath, 'utf8');
  const model = buildCalendarImport(parseCalendarSource(source));
  const villanoveseHome = model.fixtures.filter(
    (fixture) => fixture.home_team_key === CALENDAR_CONTEXT.villanoveseTeamKey,
  );
  const villanoveseAway = model.fixtures.filter(
    (fixture) => fixture.away_team_key === CALENDAR_CONTEXT.villanoveseTeamKey,
  );

  assert.equal(villanoveseHome.length, 15);
  assert.equal(villanoveseAway.length, 15);

  for (let matchday = 1; matchday <= 15; matchday += 1) {
    const pair = model.fixtures.filter((fixture) => fixture.matchday === matchday);
    assert.equal(pair.length, 2);
    assert.equal(pair[0].home_team_key, pair[1].away_team_key);
    assert.equal(pair[0].away_team_key, pair[1].home_team_key);
  }
});

test('returns the expected next three opponents on the analysis date', async () => {
  const source = await readFile(sourcePath, 'utf8');
  const model = buildCalendarImport(parseCalendarSource(source));
  const teamNames = new Map(model.teams.map((team) => [team.team_key, team.official_name]));
  const nextThree = model.fixtures
    .filter((fixture) => fixture.scheduled_date >= '2026-11-13')
    .sort((left, right) => left.scheduled_date.localeCompare(right.scheduled_date))
    .slice(0, 3)
    .map((fixture) => teamNames.get(
      fixture.home_team_key === CALENDAR_CONTEXT.villanoveseTeamKey
        ? fixture.away_team_key
        : fixture.home_team_key,
    ));

  assert.deepEqual(nextThree, [
    'Azzurra Due Carrare',
    'Montagnana',
    'PSN Legnaro Polverara',
  ]);
});

test('normalization does not become a uniqueness rule for people', () => {
  assert.equal(normalizeName('Rossi, Mario'), 'ROSSI MARIO');
  assert.equal(normalizeName('Mario Rossi'), 'MARIO ROSSI');
  assert.notEqual(normalizeName('Rossi, Mario'), normalizeName('Mario Rossi'));
});

test('fails closed when the source no longer contains all 15 rounds', () => {
  assert.throws(
    () => parseCalendarSource("const rounds = [{ matchday: 1, opponent: 'A', firstLegDate: '2026-09-13', firstLegHome: true, secondLegDate: '2027-01-10' }];"),
    /Attese 15 giornate/,
  );
});

class MemoryQuery {
  constructor(database, table) {
    this.database = database;
    this.table = table;
    this.mode = 'select';
    this.filters = [];
  }

  select() {
    return this;
  }

  insert(payload) {
    this.mode = 'insert';
    this.payload = { id: `${this.table}-${this.database[this.table].length + 1}`, ...payload };
    return this;
  }

  update(payload) {
    this.mode = 'update';
    this.payload = payload;
    return this;
  }

  eq(column, value) {
    this.filters.push([column, value]);
    return this;
  }

  matchingRows() {
    return this.database[this.table].filter((row) => this.filters.every(
      ([column, value]) => row[column] === value,
    ));
  }

  async maybeSingle() {
    const rows = this.matchingRows();
    assert.ok(rows.length <= 1, `mock maybeSingle duplicate in ${this.table}`);
    return { data: rows[0] ?? null, error: null };
  }

  async single() {
    assert.equal(this.mode, 'insert');
    this.database[this.table].push(this.payload);
    return { data: this.payload, error: null };
  }

  then(resolve, reject) {
    const operation = async () => {
      if (this.mode !== 'update') throw new Error(`Unsupported awaited mode: ${this.mode}`);
      this.matchingRows().forEach((row) => Object.assign(row, this.payload));
      return { data: null, error: null };
    };
    return operation().then(resolve, reject);
  }
}

const memoryClient = () => {
  const database = Object.fromEntries([
    'lnd_seasons',
    'lnd_competitions',
    'lnd_teams',
    'lnd_team_aliases',
    'lnd_fixtures',
  ].map((table) => [table, []]));

  return {
    database,
    from(table) {
      return new MemoryQuery(database, table);
    },
  };
};

test('calendar persistence is idempotent on a second run', async () => {
  const source = await readFile(sourcePath, 'utf8');
  const model = buildCalendarImport(parseCalendarSource(source));
  const client = memoryClient();

  const first = await persistCalendar(client, model);
  const second = await persistCalendar(client, model);

  assert.deepEqual(first.inserted, {
    seasons: 1,
    competitions: 1,
    teams: 16,
    aliases: 16,
    fixtures: 30,
  });
  assert.deepEqual(second.inserted, {
    seasons: 0,
    competitions: 0,
    teams: 0,
    aliases: 0,
    fixtures: 0,
  });
  assert.deepEqual(second.unchanged, {
    seasons: 1,
    competitions: 1,
    teams: 16,
    aliases: 16,
    fixtures: 30,
  });
  assert.equal(client.database.lnd_fixtures.length, 30);
});

test('generated SQL seed is idempotent and isolated from Analytics tables', async () => {
  const source = await readFile(sourcePath, 'utf8');
  const model = buildCalendarImport(parseCalendarSource(source));
  const sql = buildCalendarSeedSql(model);

  assert.match(sql, /on conflict \(code\) do nothing/i);
  assert.match(sql, /on conflict \(competition_key\) do nothing/i);
  assert.match(sql, /on conflict \(team_key\) do nothing/i);
  assert.match(sql, /on conflict \(alias_key\) do nothing/i);
  assert.match(sql, /on conflict \(idempotency_key\) do nothing/i);
  assert.equal((sql.match(/lnd:it-veneto:2026-27:prima-categoria-girone-e:(?:andata|ritorno):\d+/g) ?? []).length, 30);
  assert.doesNotMatch(sql, /\b(?:insert into|update|delete from)\s+public\.(?:players|matches|player_match_stats|match_events)\b/i);
});
