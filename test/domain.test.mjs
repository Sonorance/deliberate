import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scoreClass, SCORE_GOOD, SCORE_OK } from 'sonorance/plugins/deliberate/domain.mjs';

// The CLI (deliberate.mjs) colours scores through domain.scoreClass; the UI has a
// parallel `sccls` helper. Both must agree on the 0–10 score bands
// (>=7 green, >=5 amber, else red) so a case looks the same everywhere.
test('scoreClass uses the 0–10 score bands (matches the UI sccls helper)', () => {
  assert.equal(SCORE_GOOD, 7);
  assert.equal(SCORE_OK, 5);
  assert.equal(scoreClass(8), 'g');
  assert.equal(scoreClass(7), 'g', 'the advance band starts at 7');
  assert.equal(scoreClass(6.9), 'y');
  assert.equal(scoreClass(5), 'y', 'the shelve band starts at 5');
  assert.equal(scoreClass(4.9), 'r');
  assert.equal(scoreClass(2), 'r', 'a low 0–10 score is red, not green');
  assert.equal(scoreClass(null), null, 'an unscored case has no colour');
});
