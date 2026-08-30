import { useEffect, useMemo, useState } from 'react';
import { Archive, ArrowLeft, Download, Plus, Upload } from 'lucide-react';
import ImportShipmentModal from './ImportShipmentModal';
import ShipmentGrid from './ShipmentGrid';
import { canAddRows, canArchiveRows, canBulkSelectAll, canImportRows } from '../lib/access.js';
import { AUTOMATED_FIELDS } from '../lib/importer.js';
import { downloadRowsAsExcel } from '../lib/exporter.js';

function safeFilename(value) {
  return String(value || 'shipments')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'shipments';
}

export default function WorkspaceView({
  title,
  subtitle,
  rows,
  allRows,
  setRows,
  search,
  setSearch,
  onAddShipment,
  onBack,
  assignedTo,
  assignedUserId,
  teamId,
  layout,
  onImportConfirmed,
  searchTargetField,
  searchTargetLabel,
  currentUser,
  onRowChanged,
  onDeleteRows,
  onArchiveRows,
  onEditingChange,
  onOpenActivity,
  suppressCreateActions = false,
  selectionScopeKey = ''
}) {
  const [showImport, setShowImport] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);
  const [displayedIds, setDisplayedIds] = useState(rows.map((row) => row.id));

  const allowArchive = canArchiveRows(currentUser);
  const allowBulkSelectAll = canBulkSelectAll(currentUser);
  const allowImport = !suppressCreateActions && canImportRows(currentUser);
  const allowAdd = !suppressCreateActions && canAddRows(currentUser);

  useEffect(() => {
    const valid = new Set(allRows.map((row) => row.id));
    setSelectedIds((old) => old.filter((id) => valid.has(id)));
  }, [allRows]);

  useEffect(() => {
    setSelectedIds([]);
  }, [selectionScopeKey]);

  const displayedRows = useMemo(() => {
    const byId = new Map(rows.map((row) => [row.id, row]));
    return displayedIds.map((id) => byId.get(id)).filter(Boolean);
  }, [rows, displayedIds]);

  const actionDue = rows.filter((row) => row.overall_status === 'ACTION DUE').length;
  const delayed = rows.filter((row) => row.overall_status === 'DELAYED').length;
  const closed = rows.filter((row) => row.overall_status === 'CLOSED').length;

  async function archiveSelected() {
    if (!selectedIds.length || !allowArchive) return;
    const count = selectedIds.length;
    const confirmed = window.confirm(`Archive ${count} selected shipment${count === 1 ? '' : 's'}? You can restore archived shipments later.`);
    if (!confirmed) return;
    try {
      const archiveAction = onArchiveRows || onDeleteRows;
      if (archiveAction) await archiveAction(selectedIds);
      else {
        const archived = new Set(selectedIds);
        setRows((old) => old.filter((row) => !archived.has(row.id)));
      }
      setSelectedIds([]);
    } catch (error) {
      window.alert(error?.message || 'Unable to archive the selected shipment(s).');
    }
  }

  async function downloadCurrentView() {
    const exportFields = layout?.displayOrder?.length
      ? [...AUTOMATED_FIELDS, ...layout.displayOrder]
      : undefined;
    await downloadRowsAsExcel(
      displayedRows,
      `${safeFilename(title)}.xlsx`,
      exportFields,
      layout?.columns || [],
      { sheetName: assignedTo || title.replace(/\s*workspace\s*/i, '').replace(/[’']/g, '').trim() || 'Shipments' }
    );
  }

  return (
    <section className="workspace">
      <div className="workspace-toolbar">
        <div className="workspace-heading">
          {onBack && <button className="icon-button" onClick={onBack} title="Back"><ArrowLeft size={18} /></button>}
          <div><h2>{title}</h2><p>{subtitle}</p></div>
        </div>

        <div className="actions">
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search columns or shipments..." />
          {searchTargetField && <span className="column-jump-pill">Column: {searchTargetLabel}</span>}
          {allowBulkSelectAll && displayedIds.length > 0 && selectedIds.length < displayedIds.length && (
            <button className="secondary bulk-select-button" onClick={() => setSelectedIds(displayedIds)}>Select all {displayedIds.length} results</button>
          )}
          {allowBulkSelectAll && displayedIds.length > 0 && selectedIds.length === displayedIds.length && (
            <button className="secondary bulk-select-button" onClick={() => setSelectedIds([])}>Clear selection</button>
          )}
          {selectedIds.length > 0 && allowArchive && (
            <>
              <span className="selected-count">{selectedIds.length} selected</span>
              <button className="danger" onClick={archiveSelected}><Archive size={16} /> Archive Selected</button>
            </>
          )}
          <button className="download-button" onClick={downloadCurrentView}><Download size={16} /> Download Excel</button>
          {allowAdd && <button onClick={onAddShipment}><Plus size={16} /> New Shipment</button>}
          {allowImport && <button className="secondary" onClick={() => setShowImport(true)}><Upload size={16} /> Import File</button>}
        </div>
      </div>

      <div className="workspace-status-strip">
        <div><span>Visible Shipments</span><strong>{rows.length}</strong></div>
        <div className="status-mini action"><span>Action Due</span><strong>{actionDue}</strong></div>
        <div className="status-mini delayed"><span>Delayed</span><strong>{delayed}</strong></div>
        <div className="status-mini closed"><span>Closed</span><strong>{closed}</strong></div>
        {currentUser?.role === 'portal' && (
          <div className="access-note">Portal access: only Portal Submission, Broker Representative, and Portal Ticket / eFile are editable.</div>
        )}
        {layout?.displayOrder?.length > 0 && <div className="layout-note">Column order follows the latest imported file.</div>}
      </div>

      <ShipmentGrid
        rows={rows}
        setRows={setRows}
        layout={layout}
        currentUser={currentUser}
        selectedIds={selectedIds}
        setSelectedIds={setSelectedIds}
        allowSelection={allowArchive}
        searchTargetField={searchTargetField}
        onDisplayedIdsChange={setDisplayedIds}
        onRowChanged={onRowChanged}
        onEditingChange={onEditingChange}
        onOpenActivity={onOpenActivity}
      />

      {showImport && allowImport && (
        <ImportShipmentModal
          allRows={allRows}
          assignedTo={assignedTo}
          onClose={() => setShowImport(false)}
          onConfirm={async (plan) => {
            const normalizeAssignedRow = (row) => {
              if (!assignedTo) return row;
              const rowDeclarant = String(row.assigned_to || row.customs_declarant || assignedTo);
              if (rowDeclarant !== assignedTo) return row;
              return {
                ...row,
                assigned_to: assignedTo,
                customs_declarant: row.customs_declarant || assignedTo,
                team_id: row.team_id || teamId || '',
                assigned_user_id: row.assigned_user_id || assignedUserId || null
              };
            };

            const finalRows = plan.finalRows.map(normalizeAssignedRow);
            const changes = plan.changes.map((change) => ({
              ...change,
              row: change.row ? normalizeAssignedRow(change.row) : change.row,
              incoming: change.incoming ? normalizeAssignedRow(change.incoming) : change.incoming
            }));

            try {
              await onImportConfirmed({ ...plan, finalRows, changes });
              setShowImport(false);
            } catch (error) {
              window.alert(error?.message || 'Unable to sync this imported file.');
            }
          }}
        />
      )}
    </section>
  );
}
