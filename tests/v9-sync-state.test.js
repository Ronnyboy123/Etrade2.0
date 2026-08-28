import test from 'node:test';
import assert from 'node:assert/strict';
import { nextSyncState, syncStateLabel } from '../src/lib/syncState.js';

test('save transitions show saving then saved or sync issue', () => {
  assert.equal(nextSyncState('saved', 'SAVE_START'), 'saving');
  assert.equal(nextSyncState('saving', 'SAVE_SUCCESS'), 'saved');
  assert.equal(nextSyncState('saving', 'SAVE_ERROR'), 'sync_issue');
});

test('offline and reconnect transitions do not report saved before recovery completes', () => {
  assert.equal(nextSyncState('saved', 'BROWSER_OFFLINE'), 'offline');
  assert.equal(nextSyncState('offline', 'RECONNECT_START'), 'reconnecting');
  assert.equal(nextSyncState('reconnecting', 'RECONNECT_SUCCESS'), 'saved');
  assert.equal(nextSyncState('reconnecting', 'REALTIME_ERROR'), 'sync_issue');
});

test('sync state labels are user-readable', () => {
  assert.equal(syncStateLabel('saved'), 'Saved');
  assert.equal(syncStateLabel('saving'), 'Saving…');
  assert.equal(syncStateLabel('offline'), 'Offline');
  assert.equal(syncStateLabel('sync_issue'), 'Sync issue');
  assert.equal(syncStateLabel('reconnecting'), 'Reconnecting…');
});
