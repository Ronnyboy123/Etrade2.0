const LABELS = {
  saved: 'Saved',
  saving: 'Saving…',
  offline: 'Offline',
  reconnecting: 'Reconnecting…',
  sync_issue: 'Sync issue'
};

export function nextSyncState(current, event) {
  switch (event) {
    case 'SAVE_START': return current === 'offline' ? 'offline' : 'saving';
    case 'SAVE_SUCCESS': return current === 'offline' ? 'offline' : 'saved';
    case 'SAVE_ERROR': return 'sync_issue';
    case 'BROWSER_OFFLINE': return 'offline';
    case 'RECONNECT_START': return 'reconnecting';
    case 'RECONNECT_SUCCESS': return 'saved';
    case 'REALTIME_ERROR': return current === 'offline' ? 'offline' : 'sync_issue';
    case 'REALTIME_HEALTHY': return current === 'reconnecting' || current === 'sync_issue' ? 'saved' : current;
    default: return current;
  }
}

export function syncStateLabel(state) {
  return LABELS[state] || LABELS.saved;
}
