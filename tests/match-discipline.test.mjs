import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import { doubleYellowExpulsions, isProtestCardReason, withCanonicalDismissals } from '../lib/match-discipline.ts';

const readScript = name => readFileSync(new URL(`../apps-script/${name}`, import.meta.url), 'utf8');

test('YouCoach imports a checked red as a second yellow and preserves booking reasons', () => {
  const script = { Logger: { log: () => {} } };
  runInNewContext(readScript('villanovese_complete.gs'), script);
  const cards = [
    { event_type: 'yellow_card', minutes: 47, notes: '' },
    { event_type: 'red_card', minutes: 70, notes: 'Proteste', double_yellow_card: true },
    { event_type: 'red_card', minutes: 84, notes: '', double_yellow_card: false },
    { event_type: 'yellow_card', minutes: 90, notes: 'Protesta' },
  ];
  const html = cards.map(card =>
    `<tr data-match-event=3D"${JSON.stringify(card).replace(/"/g, '&quot;')}"></tr>`
  ).join('\n');
  const result = script.parseYouCoachMhtml_(html);
  assert.deepEqual(Array.from(result.eventi, card => [card.tipo, card.cardReason]), [
    ['yellow_card', 'Fallo'],
    ['second_yellow_card', 'Proteste'],
    ['red_card', ''],
    ['yellow_card', 'Protesta'],
  ]);
  for (const value of ['1', 1, 'true', true]) {
    assert.equal(script.youCoachOfficialEventType_('red_card', value), 'SECOND_YELLOW_CARD');
  }
  assert.equal(script.youCoachOfficialEventType_('red_card', '0'), 'RED_CARD');
});

test('a legacy red and its corrected second yellow represent one dismissal in the same match', () => {
  const card = (event_type, minuto, match_id = 'm1', player_id = 'p1') =>
    ({ event_type, minuto, match_id, player_id, recupero: false });
  const firstYellow = card('YELLOW_CARD', 47);
  const secondYellow = card('SECOND_YELLOW_CARD', 70);
  const directRed = card('RED_CARD', 70, 'm1', 'p2');
  const nextMatchYellow = card('YELLOW_CARD', 70, 'm2');
  const events = withCanonicalDismissals([firstYellow, card('RED_CARD', 70), secondYellow, directRed, nextMatchYellow]);

  assert.deepEqual(events, [firstYellow, secondYellow, directRed, nextMatchYellow]);
  const hasDoubleYellow = doubleYellowExpulsions(events);
  assert.equal(hasDoubleYellow('m1', 'p1'), true);
  assert.equal(hasDoubleYellow('m1', 'p2'), false);
  assert.equal(hasDoubleYellow('m2', 'p1'), false);
  assert.equal(isProtestCardReason(' Proteste '), true);
  assert.equal(isProtestCardReason('Protesta'), true);
  assert.equal(isProtestCardReason('Fallo'), false);
  assert.equal(isProtestCardReason(null), false);
});
