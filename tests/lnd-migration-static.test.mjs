import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const migrationPath = new URL(
  '../supabase/migrations/20261113150000_create_lnd_watcher_phase1.sql',
  import.meta.url,
);
const queriesPath = new URL('../sql/lnd_watcher_n8n_queries.sql', import.meta.url);

const requiredTables = [
  'lnd_seasons',
  'lnd_competitions',
  'lnd_teams',
  'lnd_team_aliases',
  'lnd_fixtures',
  'lnd_persons',
  'lnd_registrations',
  'lnd_sources',
  'lnd_documents',
  'lnd_disciplinary_measures',
  'lnd_suspension_ledger',
  'lnd_agent_runs',
  'lnd_verifications',
  'lnd_notifications',
  'lnd_prematch_reports',
];

test('migration creates every required LND table exactly once', async () => {
  const sql = await readFile(migrationPath, 'utf8');

  for (const table of requiredTables) {
    const matches = sql.match(new RegExp(`create table public\\.${table}\\s*\\(`, 'gi')) ?? [];
    assert.equal(matches.length, 1, table);
  }
});

test('every LND table enables RLS and revokes web roles', async () => {
  const sql = await readFile(migrationPath, 'utf8');

  for (const table of requiredTables) {
    assert.match(
      sql,
      new RegExp(`alter table public\\.${table} enable row level security;`, 'i'),
      `RLS ${table}`,
    );
    assert.match(
      sql,
      new RegExp(`revoke all on table public\\.${table} from public, anon, authenticated;`, 'i'),
      `REVOKE ${table}`,
    );
    assert.match(
      sql,
      new RegExp(`create policy lnd_worker_all on public\\.${table}`, 'i'),
      `policy ${table}`,
    );
  }
});

test('worker role is NOLOGIN and receives no DELETE grant', async () => {
  const sql = await readFile(migrationPath, 'utf8');

  assert.match(
    sql,
    /create role lnd_watcher_worker\s+nologin nosuperuser nocreatedb nocreaterole noreplication nobypassrls;/i,
  );
  assert.doesNotMatch(
    sql,
    /grant\s+[^;]*delete[^;]*to\s+lnd_watcher_worker/gi,
  );
});

test('migration never mutates Analytics tables', async () => {
  const sql = await readFile(migrationPath, 'utf8');
  const analyticsTables = [
    'players',
    'matches',
    'player_match_stats',
    'player_season_stats',
    'match_events',
  ];

  for (const table of analyticsTables) {
    assert.doesNotMatch(
      sql,
      new RegExp(`(?:insert\\s+into|update|delete\\s+from|alter\\s+table)\\s+public\\.${table}\\b`, 'i'),
      table,
    );
  }
});

test('idempotent and rectification keys are enforced', async () => {
  const sql = await readFile(migrationPath, 'utf8');

  assert.match(sql, /content_sha256 text not null unique/i);
  assert.match(sql, /lnd_documents_single_replacement_uidx/i);
  assert.match(sql, /lnd_measures_single_successor_uidx/i);
  assert.match(sql, /lnd_fixtures \([\s\S]*?idempotency_key text not null unique/i);
  assert.match(sql, /lnd_disciplinary_measures \([\s\S]*?idempotency_key text not null unique/i);
  assert.match(sql, /lnd_suspension_ledger \([\s\S]*?idempotency_key text not null unique/i);
  assert.match(sql, /lnd_notifications \([\s\S]*?dedupe_key text not null unique/i);
});

test('countercheck remains read-only and explicitly non-equivalent', async () => {
  const sql = await readFile(migrationPath, 'utf8');

  assert.match(sql, /security definer/i);
  assert.match(sql, /NESSUNA_EQUIVALENZA_AUTOMATICA/);
  assert.match(sql, /NON_VERIFICABILE/);
  assert.match(sql, /Read-only descriptive countercheck/i);
});

test('n8n query pack contains all requested operations and no dynamic execute', async () => {
  const sql = await readFile(queriesPath, 'utf8');

  for (let query = 1; query <= 7; query += 1) {
    assert.match(sql, new RegExp(`-- Q${query}\\.`), `Q${query}`);
  }
  assert.match(sql, /on conflict \(content_sha256\) do nothing/i);
  assert.match(sql, /on conflict \(idempotency_key\) do nothing/i);
  assert.doesNotMatch(sql, /\bexecute\s+format\b/i);
});
