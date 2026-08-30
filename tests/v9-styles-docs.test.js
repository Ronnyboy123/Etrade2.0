import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const css = await readFile(new URL('../src/styles.css', import.meta.url), 'utf8');
const readme = await readFile(new URL('../README.md', import.meta.url), 'utf8');

test('v9 safety UI has styles for sync, conflicts, activity, archive and import review', () => {
  assert.match(css, /\.sync-status/);
  assert.match(css, /\.conflict-dialog/);
  assert.match(css, /\.activity-panel/);
  assert.match(css, /\.archived-page/);
  assert.match(css, /\.import-conflict-review/);
});

test('current README documents preserved v9 safety behavior', () => {
  assert.match(readme, /v9 safety features preserved/i);
  assert.match(readme, /Realtime/i);
  assert.match(readme, /Archive/i);
  assert.match(readme, /Admin-only permanent deletion/i);
  assert.match(readme, /supabase-schema\.sql/);
});
