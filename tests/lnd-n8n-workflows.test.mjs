import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const files = [
  new URL('../n8n/LND_WATCHER_2_0_COLLECTOR.json', import.meta.url),
  new URL('../n8n/LND_WATCHER_2_0_PREMATCH_REPORT.json', import.meta.url),
];

const load = async (url) => JSON.parse(await readFile(url, 'utf8'));

test('n8n exports are valid, inactive, credential-free workflows', async () => {
  for (const file of files) {
    const workflow = await load(file);
    assert.equal(workflow.active, false);
    assert.equal(workflow.settings.timezone, 'Europe/Rome');
    assert.ok(workflow.nodes.length > 0);

    const names = new Set(workflow.nodes.map((node) => node.name));
    const ids = new Set(workflow.nodes.map((node) => node.id));
    assert.equal(names.size, workflow.nodes.length);
    assert.equal(ids.size, workflow.nodes.length);

    for (const [source, ports] of Object.entries(workflow.connections)) {
      assert.ok(names.has(source), `Sorgente inesistente: ${source}`);
      for (const group of ports.main ?? []) {
        for (const edge of group ?? []) {
          assert.ok(names.has(edge.node), `Destinazione inesistente: ${edge.node}`);
        }
      }
    }

    const serialized = JSON.stringify(workflow);
    assert.doesNotMatch(serialized, /"credentials"\s*:/i);
    assert.doesNotMatch(serialized, /sb_secret_|eyJ[A-Za-z0-9_-]{20,}|postgres(?:ql)?:\/\//i);
  }
});

test('collector has the required schedule, official source and safe AI gates', async () => {
  const workflow = await load(files[0]);
  const byName = new Map(workflow.nodes.map((node) => [node.name, node]));
  const schedule = byName.get('Schedule L-M-V 15-20');
  const expressions = schedule.parameters.rule.interval.map((rule) => rule.expression);

  assert.deepEqual(expressions, [
    '0 0,30 15-19 * * 1,3,5',
    '0 0 20 * * 1,3,5',
  ]);
  assert.match(
    byName.get('Collector Config').parameters.jsCode,
    /https:\/\/www\.figcvenetocalcio\.it\/archivio-comunicati/,
  );
  assert.match(byName.get('Validate AI Output').parameters.jsCode, /personId:\s*null/);
  assert.doesNotMatch(
    byName.get('Validate AI Output').parameters.jsCode,
    /allowedStatuses[^\n]*VERIFIED/,
  );
  assert.ok(byName.has('SHA256 PDF'));
  assert.ok(byName.has('Structured Measure Parser'));
  assert.ok(byName.has('Queue Telegram Measure'));
});

test('prematch workflow runs after the Friday collector window', async () => {
  const workflow = await load(files[1]);
  const schedule = workflow.nodes.find((node) => node.name === 'Friday 20:05');
  assert.deepEqual(
    schedule.parameters.rule.interval.map((rule) => rule.expression),
    ['0 5 20 * * 5'],
  );
  const reportQuery = workflow.nodes.find((node) => node.name === 'Get Prematch Data')
    .parameters.query;
  assert.match(reportQuery, /dm\.verification_status = 'VERIFIED'/);
  assert.match(reportQuery, /sl\.verification_status = 'VERIFIED'/);
});

test('workflow SQL mutates only lnd-prefixed tables and parameterizes writes', async () => {
  for (const file of files) {
    const workflow = await load(file);
    for (const node of workflow.nodes.filter((candidate) => candidate.type === 'n8n-nodes-base.postgres')) {
      const query = node.parameters.query ?? '';
      const mutationTargets = [
        ...query.matchAll(/\b(?:insert\s+into|update|delete\s+from)\s+public\.([a-z_][a-z0-9_]*)/gi),
      ].map((match) => match[1]);

      for (const table of mutationTargets) {
        assert.match(table, /^lnd_/, `${node.name} muta ${table}`);
      }
      if (mutationTargets.length > 0) {
        assert.match(query, /\$1::jsonb/);
        assert.ok(node.parameters.options?.queryReplacement);
      }
      assert.doesNotMatch(query, /\bexecute\s+format\b/i);
    }
  }
});

