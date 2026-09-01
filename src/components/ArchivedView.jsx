import { useEffect, useMemo, useState } from 'react';
import { ArchiveRestore, History, Trash2 } from 'lucide-react';
import { canPermanentlyDeleteRows, canRestoreRow, canRestoreRows, canViewActivity } from '../lib/access.js';

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
  const allowBulkSelection = allowPermanentDelete;
  const allowHistory = canViewActivity(currentUser);
  const [selectedIds, setSelectedIds] = useState([]);

  const displayedIds = rows.map((row) => row?.id).filter(Boolean);
  const selectionScopeKey = displayedIds.join('|');
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const allDisplayedSelected = displayedIds.length > 0 && displayedIds.every((id) => selectedSet.has(id));

  useEffect(() => {
    setSelectedIds([]);
  }, [selectionScopeKey]);

  function toggleSelected(id) {
    if (!allowBulkSelection || !id) return;
    setSelectedIds((old) => old.includes(id) ? old.filter((item) => item !== id) : [...old, id]);
  }

  function toggleSelectAll() {
    if (!allowBulkSelection) return;
    if (allDisplayedSelected) setSelectedIds([]);
    else setSelectedIds(displayedIds);
  }

  async function restore(row) {
    if (!allowRestore || !canRestoreRow(currentUser, row)) return;
    const confirmed = window.confirm(`Restore ${row.job_file_number || row.shipment_code || 'this shipment'} to active shipments?`);
    if (confirmed) await onRestore?.([row.id]);
  }

  async function restoreSelected() {
    if (!allowBulkSelection || !selectedIds.length) return;
    const confirmed = window.confirm(`Restore ${selectedIds.length} selected shipments to active shipments?`);
    if (!confirmed) return;
    await onRestore?.(selectedIds);
    setSelectedIds([]);
  }

  async function permanentlyDelete(row) {
    if (!allowPermanentDelete) return;
    const name = row.job_file_number || row.shipment_code || row.id;
    const confirmed = window.confirm(`Delete ${name} permanently? This cannot be undone.`);
    if (confirmed) await onPermanentDelete?.([row.id]);
  }

  async function permanentlyDeleteSelected() {
    if (!allowBulkSelection || !selectedIds.length) return;
    const confirmed = window.confirm(`Permanently delete ${selectedIds.length} selected shipments? This cannot be undone.`);
    if (!confirmed) return;
    await onPermanentDelete?.(selectedIds);
    setSelectedIds([]);
  }

  return (
    <section className="archived-page">
      <div className="section-heading">
        <div><h2>ARCHIVED SHIPMENTS</h2><p>Archived records are hidden from normal workspaces and can be restored by authorized users.</p></div>
      </div>

      {allowBulkSelection && rows.length > 0 && (
        <div className="archived-bulk-toolbar">
          <strong>Selected: {selectedIds.length}</strong>
          <button className="ghost-button compact" disabled={!selectedIds.length} onClick={restoreSelected}>
            <ArchiveRestore size={14} /> Restore Selected
          </button>
          <button className="danger compact" disabled={!selectedIds.length} onClick={permanentlyDeleteSelected}>
            <Trash2 size={14} /> Delete Permanently Selected
          </button>
        </div>
      )}

      {rows.length === 0 ? (
        <div className="data-state">No archived shipments.</div>
      ) : (
        <div className="simple-table-wrap archived-table-wrap">
          <table className="simple-table archived-table">
            <thead>
              <tr>
                {allowBulkSelection && <th className="archived-select-column"><input type="checkbox" aria-label="Select all archived shipments shown" checked={allDisplayedSelected} onChange={toggleSelectAll} /></th>}
                <th>JOB FILE</th><th>CUSTOMER</th><th>DECLARANT</th><th>TEAM</th><th>ARCHIVED</th><th>ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className={selectedSet.has(row.id) ? 'archived-row-selected' : ''}>
                  {allowBulkSelection && <td className="archived-select-column"><input type="checkbox" aria-label={`Select ${row.job_file_number || row.shipment_code || 'archived shipment'}`} checked={selectedSet.has(row.id)} onChange={() => toggleSelected(row.id)} /></td>}
                  <td>{row.job_file_number || row.shipment_code || '—'}</td>
                  <td>{row.customer || '—'}</td>
                  <td>{row.assigned_to || row.customs_declarant || '—'}</td>
                  <td>{row.team_id || '—'}</td>
                  <td>{formatWhen(row.archived_at)}</td>
                  <td>
                    <div className="archived-actions">
                      {allowHistory && <button className="ghost-button compact" onClick={() => onOpenActivity?.(row)}><History size={14} /> History</button>}
                      {allowRestore && canRestoreRow(currentUser, row) && <button className="ghost-button compact" onClick={() => restore(row)}><ArchiveRestore size={14} /> Restore</button>}
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
