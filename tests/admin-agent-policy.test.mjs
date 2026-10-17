import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { aggregateMetrics, validGoal, planAction, METRIC_KEYS } from '../supabase/functions/library-admin-agent/policy.mjs';
test('provider receives only allowlisted aggregate integers, never records or identities', () => {
  const metrics = aggregateMetrics({ titles: 4, missing_author: 1, missing_classification: -1, missing_isbn: NaN, whitespace_candidates: 2, library_id: 'private', names: ['private'], history: ['private'], students: ['private'] });
  assert.deepEqual(Object.keys(metrics), [...METRIC_KEYS]);
  assert.deepEqual(metrics, { titles: 4, missing_author: 1, missing_classification: 0, missing_isbn: 0, whitespace_candidates: 2 });
  assert.equal(JSON.stringify(metrics).includes('private'), false);
});
test('untrusted AI output cannot select SQL, delete, publishing or permissions', () => {
  assert.equal(planAction('normalize_catalog'), 'normalize_catalog');
  assert.equal(planAction('review'), 'review');
  for (const goal of ['delete', 'publish', 'sql', '', 'change_role', 'DROP TABLE']) {
    assert.equal(validGoal(goal), false);
    assert.throws(() => planAction(goal));
  }
});
test('analysis endpoint is authenticated, origin-limited, consented and read-only', () => {
  const code = readFileSync(new URL('../supabase/functions/library-admin-agent/index.ts', import.meta.url), 'utf8');
  assert.match(code, /auth\.getUser\(/);
  assert.match(code, /body\.consent !== true/);
  assert.match(code, /p_action: "review"/);
  assert.match(code, /JSON\.stringify\(\{ goal, metrics \}\)/);
  assert.match(code, /Object\.keys\(body\)\.some/);
  assert.match(code, /action: planAction\(goal\)/);
  assert.doesNotMatch(code, /\.from\("(?:patrons|loans|visitors|reservations)"\)|\.update\(|\.delete\(|\.insert\(/);
});
