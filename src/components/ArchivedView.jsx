import { ArchiveRestore, History, Trash2 } from 'lucide-react';
import { canPermanentlyDeleteRows, canRestoreRows, canViewActivity } from '../lib/access.js';

function formatWhen(value) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString();
}

export default function ArchivedView({
  rows = [],
  currentUser,
  onRestore,
  onPermanentDelete,
  onOpenActivity
}) {
  const allowRestore = canRestoreRows(currentUser);
  const allowPermanentDelete = canPermanentlyDeleteRows(currentUser);
  const allowHistory = canViewActivity(currentUser);

  async function restore(row) {
    if (!allowRestore) return;
    const confirmed = window.confirm(`Restore ${row.job_file_number || row.shipment_code || 'this shipment'} to active shipments?`);
    if (confirmed) await onRestore?.([row.id]);
  }

  async function permanentlyDelete(row) {
    if (!allowPermanentDelete) return;
    const name = row.job_file_number || row.shipment_code || row.id;
    const confirmed = window.confirm(`Delete ${name} permanently? This cannot be undone.`);
    if (confirmed) await onPermanentDelete?.([row.id]);
  }

  return (
    <section className="archived-page">
      <div className="section-heading">
        <div><h2>ARCHIVED SHIPMENTS</h2><p>Archived records are hidden from normal workspaces and can be restored by authorized leadership.</p></div>
      </div>

      {rows.length === 0 ? (
        <div className="data-state">No archived shipments.</div>
      ) : (
        <div className="simple-table-wrap archived-table-wrap">
          <table className="simple-table archived-table">
            <thead>
              <tr><th>JOB FILE</th><th>CUSTOMER</th><th>DECLARANT</th><th>TEAM</th><th>ARCHIVED</th><th>ACTIONS</th></tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>{row.job_file_number || row.shipment_code || '—'}</td>
                  <td>{row.customer || '—'}</td>
                  <td>{row.assigned_to || row.customs_declarant || '—'}</td>
                  <td>{row.team_id || '—'}</td>
                  <td>{formatWhen(row.archived_at)}</td>
                  <td>
                    <div className="archived-actions">
                      {allowHistory && <button className="ghost-button compact" onClick={() => onOpenActivity?.(row)}><History size={14} /> History</button>}
                      {allowRestore && <button className="ghost-button compact" onClick={() => restore(row)}><ArchiveRestore size={14} /> Restore</button>}
                      {allowPermanentDelete && <button className="danger compact" onClick={() => permanentlyDelete(row)}><Trash2 size={14} /> Delete Permanently</button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
