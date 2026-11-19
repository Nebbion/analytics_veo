import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('dashboard attributes opponent goals to the goalkeeper timeline', async () => {
  const source = await read('app/api/dashboard/route.ts');

  assert.match(source, /row\.event_type !== 'OPPONENT_GOAL'/);
  assert.match(source, /change\.minute < num\(goal\.minuto\)/);
  assert.match(source, /goal\.goal_type === 'RIGORE'/);
  assert.match(source, /goal\.goal_type === 'PUNIZIONE'/);
  assert.match(source, /cleanSheet: score\.opponentGoals === 0/);
  assert.match(source, /goalkeeperStats,/);
});

test('both YouCoach importers preserve goal type for opponent goals', async () => {
  const [completeSource, moduleSource] = await Promise.all([
    read('apps-script/villanovese_complete.gs'),
    read('apps-script/youcoach_lineups_substitutions.gs'),
  ]);
  const goalTypeForBothTeams = /eventType === 'GOAL' \|\| eventType === 'OPPONENT_GOAL'/;

  assert.match(completeSource, goalTypeForBothTeams);
  assert.match(moduleSource, goalTypeForBothTeams);
  assert.match(moduleSource, /player_id: youCoachText_\(row\.Player_ID\) \|\| null/);
});

test('goalkeeper UI exposes requested totals and set-piece breakdown', async () => {
  const source = await read('app/page.tsx');

  assert.match(source, />Portieri<\/button>/);
  assert.match(source, /label="Gol subiti"/);
  assert.match(source, /label="Clean sheet"/);
  assert.match(source, /label="Gol subiti su rigore"/);
  assert.match(source, /label="Gol subiti su punizione"/);
});
