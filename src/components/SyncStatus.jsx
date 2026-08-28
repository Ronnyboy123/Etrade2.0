import { Cloud, CloudOff, RefreshCw, TriangleAlert } from 'lucide-react';
import { syncStateLabel } from '../lib/syncState.js';

const STATUS_HELP = {
  saved: 'Saved',
  saving: 'Saving changes',
  offline: 'Offline — changes are blocked until connection returns',
  reconnecting: 'Reconnecting and refreshing authorized data',
  sync_issue: 'Sync issue — your latest change may not be saved'
};

export default function SyncStatus({ state = 'saved' }) {
  const label = syncStateLabel(state);
  const Icon = state === 'offline'
    ? CloudOff
    : state === 'sync_issue'
      ? TriangleAlert
      : state === 'saving' || state === 'reconnecting'
        ? RefreshCw
        : Cloud;

  return (
    <div className={`sync-status sync-status-${state}`} title={STATUS_HELP[state] || label}>
      <Icon size={14} className={state === 'saving' || state === 'reconnecting' ? 'sync-spin' : ''} />
      <span>{label}</span>
    </div>
  );
}
