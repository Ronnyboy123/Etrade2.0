import { useRef, useState } from 'react';
import { AlertTriangle, FileSpreadsheet, UploadCloud, X } from 'lucide-react';
import * as XLSX from 'xlsx';
import {
  buildGroupedImportPlan,
  mapImportedHeaders,
  resolveGroupedImportReview as resolveImportReview,
  worksheetImportRange
} from '../lib/importer.js';
import { groupImportedShipmentRows, parseSheetRows } from '../lib/importGrouping.js';
import { loadShipmentImportLines } from '../lib/dataApi.js';

function readWorkbook(file) {
  return file.arrayBuffer().then((buffer) => {
    const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
    if (!workbook.SheetNames?.length) throw new Error('The workbook does not contain any sheets.');

    const sheets = workbook.SheetNames.map((name) => {
      const worksheet = workbook.Sheets[name];
      const matrix = XLSX.utils.sheet_to_json(worksheet, {
        header: 1,
        defval: '',
        raw: true,
        blankrows: false,
        range: worksheetImportRange(worksheet)
      });
      try {
        const parsed = parseSheetRows(matrix, name);
        return {
          name,
          headers: parsed.headers,
          sourceRows: parsed.rows,
          rowCount: parsed.rows.length,
          headerIndex: parsed.headerIndex,
          isEmpty: parsed.rows.length === 0,
          parseError: ''
        };
      } catch (error) {
        return {
          name,
          headers: [],
          sourceRows: [],
          rowCount: 0,
          headerIndex: -1,
          isEmpty: true,
          parseError: error?.message || 'No credible shipment header row was found.'
        };
      }
    });

    if (!sheets.some((sheet) => sheet.rowCount > 0)) {
      throw new Error('No selected worksheet contains a credible shipment header and shipment rows.');
    }
    return sheets;
  });
}

const REVIEW_PAGE_SIZE = 100;
const GROUP_PAGE_SIZE = 25;
const CONFLICT_PAGE_SIZE = 50;

function ReviewPager({ page, setPage, total, pageSize, label }) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  if (total <= pageSize) return null;
  return (
    <div className="import-pager">
      <button type="button" className="ghost-button" disabled={page <= 0} onClick={() => setPage((old) => Math.max(0, old - 1))}>Previous</button>
      <span>{label} page {page + 1} of {pageCount}</span>
      <button type="button" className="ghost-button" disabled={page >= pageCount - 1} onClick={() => setPage((old) => Math.min(pageCount - 1, old + 1))}>Next</button>
    </div>
  );
}

function canonicalSelectedHeaders(sheets) {
  const headers = [];
  const seen = new Set();
  for (const sheet of sheets) {
    for (const header of sheet.headers || []) {
      const key = String(header || '').trim().toLowerCase();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      headers.push(header);
    }
  }
  return headers;
}

function GroupReviewCard({ change }) {
  const detailCount = change.group?.details?.length || 0;
  const diff = change.detailDiff || { added: 0, changed: 0, removed: 0 };
  const label = change.type === 'create'
    ? 'New shipment'
    : change.type === 'archived_match'
      ? 'Archived match'
      : change.type === 'needs_review'
        ? 'Needs review'
        : change.type === 'unchanged'
          ? 'Unchanged'
          : 'Update';
  return (
    <div className="import-group-card">
      <div className="import-group-card-heading">
        <strong>{change.row?.shipment_code || change.group?.shipmentCodeHint || 'Shipment group'}</strong>
        <span>{label}</span>
      </div>
      <p>{(change.sourceSheets || change.group?.sourceSheets || []).join(', ') || 'Selected workbook'} · {detailCount} detail row{detailCount === 1 ? '' : 's'}</p>
      <div className="import-group-diff">
        <span><strong>{diff.added || 0}</strong> will be added</span>
        <span><strong>{diff.changed || 0}</strong> will change</span>
        <span><strong>{diff.removed || 0}</strong> will be removed</span>
      </div>
    </div>
  );
}

export default function ImportShipmentModal({ allRows, assignedTo, onConfirm, onClose }) {
  const inputRef = useRef(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isReading, setIsReading] = useState(false);
  const [error, setError] = useState('');
  const [fileName, setFileName] = useState('');
  const [workbookSheets, setWorkbookSheets] = useState([]);
  const [selectedSheetNames, setSelectedSheetNames] = useState([]);
  const [importSnapshotAt, setImportSnapshotAt] = useState(null);
  const [plan, setPlan] = useState(null);
  const [resolutions, setResolutions] = useState({});
  const [archivedResolutions, setArchivedResolutions] = useState({});
  const [tracePage, setTracePage] = useState(0);
  const [groupPage, setGroupPage] = useState(0);
  const [archivedPage, setArchivedPage] = useState(0);
  const [conflictPage, setConflictPage] = useState(0);
  const [isReviewing, setIsReviewing] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState(null);

  const importableSheetNames = workbookSheets.filter((sheet) => sheet.rowCount > 0 && !sheet.parseError).map((sheet) => sheet.name);
  const allSheetsSelected = importableSheetNames.length > 0 && importableSheetNames.every((name) => selectedSheetNames.includes(name));
  const visibleTraceRows = (plan?.rowTrace || []).slice(tracePage * REVIEW_PAGE_SIZE, (tracePage + 1) * REVIEW_PAGE_SIZE);
  const visibleGroups = (plan?.changes || []).slice(groupPage * GROUP_PAGE_SIZE, (groupPage + 1) * GROUP_PAGE_SIZE);
  const visibleArchivedConflicts = (plan?.archivedConflicts || []).slice(archivedPage * CONFLICT_PAGE_SIZE, (archivedPage + 1) * CONFLICT_PAGE_SIZE);
  const allReviewConflicts = [...(plan?.fieldConflicts || []), ...(plan?.masterConflicts || [])];
  const visibleReviewConflicts = allReviewConflicts.slice(conflictPage * CONFLICT_PAGE_SIZE, (conflictPage + 1) * CONFLICT_PAGE_SIZE);

  function resetReviewState() {
    setPlan(null);
    setResolutions({});
    setArchivedResolutions({});
    setTracePage(0);
    setGroupPage(0);
    setArchivedPage(0);
    setConflictPage(0);
    setSyncProgress(null);
  }

  function chooseAnotherFile() {
    resetReviewState();
    setFileName('');
    setWorkbookSheets([]);
    setSelectedSheetNames([]);
    setImportSnapshotAt(null);
    setError('');
    if (inputRef.current) inputRef.current.value = '';
  }

  async function handleFile(file) {
    if (!file) return;
    if (!/\.(xlsx|xls|csv)$/i.test(file.name)) {
      setError('Please upload an Excel (.xlsx/.xls) or CSV file.');
      return;
    }
    setIsReading(true);
    setError('');
    resetReviewState();
    try {
      const sheets = await readWorkbook(file);
      const selectable = sheets.filter((sheet) => sheet.rowCount > 0 && !sheet.parseError).map((sheet) => sheet.name);
      setFileName(file.name);
      setWorkbookSheets(sheets);
      setSelectedSheetNames(selectable);
      setImportSnapshotAt(file.lastModified ? new Date(file.lastModified).toISOString() : null);
    } catch (err) {
      setError(err?.message || 'Unable to read this file.');
      setWorkbookSheets([]);
      setSelectedSheetNames([]);
    } finally {
      setIsReading(false);
    }
  }

  async function reviewSelectedSheets() {
    if (isReviewing) return;
    const selectedSheets = workbookSheets.filter((sheet) => selectedSheetNames.includes(sheet.name) && sheet.rowCount > 0 && !sheet.parseError);
    const sourceRows = selectedSheets.flatMap((sheet) => sheet.sourceRows || []);
    if (!sourceRows.length) {
      setError('Select at least one sheet that contains shipment rows.');
      return;
    }
    setIsReviewing(true);
    setError('');
    resetReviewState();
    try {
      const headers = canonicalSelectedHeaders(selectedSheets);
      const groups = groupImportedShipmentRows(sourceRows, headers, assignedTo);
      if (!groups.length) throw new Error('No shipment groups with a usable Job File, Entry No., House B/L, or Master B/L were found.');
      const existingRows = (allRows || []).filter((row) => !row.archived_at);
      const archivedRows = (allRows || []).filter((row) => Boolean(row.archived_at));
      const sheetBreakdown = selectedSheets.map((sheet) => ({ name: sheet.name, rowCount: sheet.rowCount }));
      const preliminary = buildGroupedImportPlan({ existingRows, archivedRows, groups, importSnapshotAt, sheetBreakdown });
      const matchedIds = [...new Set((preliminary.changes || []).map((change) => change.row?.id).filter(Boolean))];
      const existingDetailsByShipmentId = new Map();
      await Promise.all(matchedIds.map(async (shipmentId) => {
        existingDetailsByShipmentId.set(shipmentId, await loadShipmentImportLines(shipmentId));
      }));
      const groupedPlan = buildGroupedImportPlan({ existingRows, archivedRows, groups, importSnapshotAt, existingDetailsByShipmentId, sheetBreakdown });
      const mapping = mapImportedHeaders(headers);
      setPlan({ ...groupedPlan, ...mapping });
    } catch (err) {
      setError(err?.message || 'Unable to prepare the grouped import review.');
    } finally {
      setIsReviewing(false);
    }
  }

  function toggleAllSheets() { setSelectedSheetNames(allSheetsSelected ? [] : importableSheetNames); }
  function toggleSheet(name) {
    setSelectedSheetNames((current) => current.includes(name) ? current.filter((sheetName) => sheetName !== name) : [...current, name]);
  }
  function drop(event) { event.preventDefault(); setIsDragging(false); void handleFile(event.dataTransfer.files?.[0]); }

  async function syncReviewedChanges() {
    if (!plan || isSyncing) return;
    const reviewed = resolveImportReview(plan, resolutions, archivedResolutions);
    if (reviewed.unresolvedConflicts > 0) {
      setError('Review every potential outdated or mixed master value before syncing.');
      return;
    }
    setIsSyncing(true);
    setSyncProgress(null);
    setError('');
    try {
      await onConfirm(reviewed, (progress) => setSyncProgress(progress));
    } catch (err) {
      setError(err?.message || 'Unable to sync this imported file.');
    } finally {
      setIsSyncing(false);
    }
  }

  const unresolvedCount = plan ? resolveImportReview(plan, resolutions, archivedResolutions).unresolvedConflicts : 0;

  return (
    <div className="modal-backdrop">
      <div className="import-modal">
        <div className="modal-header">
          <div><h3>Import Shipment File</h3><p>One shipment group stays one Relora shipment; repeated Excel rows are preserved as read-only details.</p></div>
          <button className="icon-button" onClick={onClose} disabled={isSyncing}><X size={20} /></button>
        </div>
        <div className="modal-body">
          {error && <div className="import-error"><AlertTriangle size={17} />{error}</div>}

          {!fileName && (
            <div
              className={`upload-dropzone ${isDragging ? 'dragging' : ''}`}
              onDragOver={(event) => { event.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={drop}
              onClick={() => inputRef.current?.click()}
            >
              <UploadCloud size={34} />
              <strong>{isReading ? 'Reading file…' : 'Drop Excel file here or click to browse'}</strong>
              <span>.xlsx, .xls, or .csv</span>
              <input ref={inputRef} type="file" accept=".xlsx,.xls,.csv" hidden onChange={(event) => void handleFile(event.target.files?.[0])} />
            </div>
          )}

          {fileName && !plan && (
            <>
              <div className="import-file-card"><FileSpreadsheet size={24} /><div><strong>{fileName}</strong><span>{workbookSheets.length} worksheet{workbookSheets.length === 1 ? '' : 's'} detected</span></div><button className="ghost-button" onClick={chooseAnotherFile}>Change File</button></div>
              <div className="sheet-selection-panel">
                <div className="mapping-heading"><div><h4>Select worksheets</h4><p>Relora detects the credible shipment header row in each sheet automatically.</p></div><button type="button" className="ghost-button" onClick={toggleAllSheets}>All Sheets</button></div>
                <div className="sheet-option-list">
                  {workbookSheets.map((sheet) => (
                    <label className={`sheet-option ${sheet.parseError ? 'disabled' : ''}`} key={sheet.name}>
                      <input type="checkbox" checked={selectedSheetNames.includes(sheet.name)} disabled={Boolean(sheet.parseError) || sheet.rowCount === 0} onChange={() => toggleSheet(sheet.name)} />
                      <span><strong>{sheet.name}</strong><small>{sheet.parseError || `${sheet.rowCount} shipment detail rows · header row ${sheet.headerIndex + 1}`}</small></span>
                    </label>
                  ))}
                </div>
              </div>
              <div className="modal-actions"><button className="primary-button" disabled={!selectedSheetNames.length || isReviewing} onClick={() => void reviewSelectedSheets()}>{isReviewing ? 'Preparing Review…' : 'Review Selected Sheets'}</button></div>
            </>
          )}

          {plan && (
            <>
              <div className="import-file-card"><FileSpreadsheet size={24} /><div><strong>{fileName}</strong><span>{plan.sheetBreakdown?.length || 0} selected sheet{plan.sheetBreakdown?.length === 1 ? '' : 's'}</span></div></div>
              <div className="import-summary-grid">
                <div><span>Shipment groups</span><strong>{plan.summary.shipmentGroups}</strong></div>
                <div><span>Detail rows</span><strong>{plan.summary.detailRows}</strong></div>
                <div className="success"><span>New</span><strong>{plan.summary.created}</strong></div>
                <div className="info"><span>Updates</span><strong>{plan.summary.safeUpdates}</strong></div>
                <div className="danger"><span>Needs Review</span><strong>{plan.summary.reviewConflicts}</strong></div>
                <div className="warning"><span>Archived Matches</span><strong>{plan.summary.archivedMatches || 0}</strong></div>
                <div><span>Unchanged</span><strong>{plan.summary.unchanged}</strong></div>
              </div>

              <div className="mapping-section">
                <div className="mapping-heading"><div><h4>Shipment group review</h4><p>Exact sync applies only to shipment groups present in this selected import.</p></div><span>{plan.changes?.length || 0} groups</span></div>
                <div className="import-group-list">{visibleGroups.map((change, index) => <GroupReviewCard change={change} key={`${change.group?.groupKey || 'group'}-${groupPage * GROUP_PAGE_SIZE + index}`} />)}</div>
                <ReviewPager page={groupPage} setPage={setGroupPage} total={plan.changes?.length || 0} pageSize={GROUP_PAGE_SIZE} label="Shipment groups" />
              </div>

              <div className="mapping-section">
                <div className="mapping-heading"><div><h4>Import row trace</h4><p>Source Sheet, section, and Excel row stay attached to every detail row.</p></div><span>{plan.rowTrace?.length || 0} rows</span></div>
                <div className="mapping-table-wrap import-trace-wrap"><table className="mapping-table"><thead><tr><th>Source Sheet</th><th>Section</th><th>Excel Row</th><th>Shipment</th><th>Preview Result</th></tr></thead><tbody>
                  {visibleTraceRows.map((trace, index) => <tr key={`${trace.sourceSheet || 'sheet'}-${trace.sourceRowNumber || index}-${tracePage}`}><td>{trace.sourceSheet || '—'}</td><td>{trace.sourceSection || '—'}</td><td>{trace.sourceRowNumber || '—'}</td><td>{trace.shipmentCode || '—'}</td><td>{trace.result}</td></tr>)}
                </tbody></table></div>
                <ReviewPager page={tracePage} setPage={setTracePage} total={plan.rowTrace?.length || 0} pageSize={REVIEW_PAGE_SIZE} label="Trace" />
              </div>

              <div className="mapping-section"><div className="mapping-heading"><div><h4>Column mapping</h4><p>Unknown columns are preserved in imported detail rows.</p></div><span>{plan.columns?.length || 0} columns</span></div><div className="mapping-table-wrap"><table className="mapping-table"><thead><tr><th>Uploaded Column</th><th>Website Column</th><th>Type</th></tr></thead><tbody>
                {(plan.columns || []).map((column, index) => <tr key={`${column.field}-${index}`}><td>{column.originalHeader}</td><td>{column.label}</td><td><span className={`mapping-pill ${column.isCustom ? 'custom' : 'mapped'}`}>{column.isCustom ? 'Detail/Custom' : 'Mapped'}</span></td></tr>)}
              </tbody></table></div></div>

              {plan.archivedConflicts?.length > 0 && <div className="import-conflict-review"><div className="import-conflict-heading"><div><h4>Archived shipment already exists</h4><p>Skip is the safe default. Use Restore & Update only when you want the archived shipment and its details exact-synced from this import.</p></div><span>{plan.archivedConflicts.length}</span></div>
                {visibleArchivedConflicts.map((conflict) => { const choice = archivedResolutions[conflict.id] || 'skip'; return <div className="import-conflict-card" key={conflict.id}><div className="import-conflict-meta"><strong>{conflict.shipmentCode || 'Archived shipment'}</strong><span>{conflict.sourceSheet ? `Source Sheet: ${conflict.sourceSheet}` : 'Archived'}</span></div><p className="import-conflict-reason">{conflict.reason}</p><div className="import-conflict-actions"><button type="button" className={choice === 'skip' ? 'selected' : ''} onClick={() => setArchivedResolutions((old) => ({ ...old, [conflict.id]: 'skip' }))}>Skip</button><button type="button" className={choice === 'restore_update' ? 'selected' : ''} onClick={() => setArchivedResolutions((old) => ({ ...old, [conflict.id]: 'restore_update' }))}>Restore &amp; Update</button></div></div>; })}
                <ReviewPager page={archivedPage} setPage={setArchivedPage} total={plan.archivedConflicts.length} pageSize={CONFLICT_PAGE_SIZE} label="Archived matches" />
              </div>}

              {allReviewConflicts.length > 0 && <div className="import-conflict-review"><div className="import-conflict-heading"><div><h4>Review Potential Outdated Values</h4><p>Potential outdated value detected. Relora will not overwrite a newer or mixed master value until you choose what to keep.</p></div><span>{allReviewConflicts.length}</span></div>
                {visibleReviewConflicts.map((conflict) => {
                  const isMaster = Array.isArray(conflict.values);
                  return <div className="import-conflict-card" key={conflict.id}><div className="import-conflict-meta"><strong>{conflict.shipmentCode || 'Matched shipment'}</strong><span>{conflict.label || conflict.field}</span></div>{isMaster ? <><p className="import-conflict-reason">This shipment has different values across selected Excel detail rows.</p><div className="import-conflict-actions">{conflict.values.map((value, index) => <button type="button" key={`${conflict.id}-${index}`} className={resolutions[conflict.id] === `value:${index}` ? 'selected' : ''} onClick={() => setResolutions((old) => ({ ...old, [conflict.id]: `value:${index}` }))}>Use {String(value || 'blank')}</button>)}</div></> : <><p className="import-conflict-reason">{conflict.reason}</p><div className="import-conflict-values"><div><span>Relora</span><strong>{String(conflict.serverValue || '—')}</strong></div><div><span>Imported file</span><strong>{String(conflict.importedValue || '—')}</strong></div></div><div className="import-conflict-actions"><button type="button" className={resolutions[conflict.id] === 'server' ? 'selected' : ''} onClick={() => setResolutions((old) => ({ ...old, [conflict.id]: 'server' }))}>Keep Relora</button><button type="button" className={resolutions[conflict.id] === 'import' ? 'selected' : ''} onClick={() => setResolutions((old) => ({ ...old, [conflict.id]: 'import' }))}>Use Imported</button></div></> }</div>;
                })}
                <ReviewPager page={conflictPage} setPage={setConflictPage} total={allReviewConflicts.length} pageSize={CONFLICT_PAGE_SIZE} label="Review values" />
              </div>}

              {plan.summary.conflicts > 0 && <div className="import-warning-message"><AlertTriangle size={17} />{plan.summary.conflicts} matching shipment(s) belong to another employee and will not be overwritten.</div>}

              {isSyncing && <div className="import-progress-panel" aria-live="polite"><div className="import-progress-copy"><strong>{syncProgress ? `Importing batch ${syncProgress.batch} of ${syncProgress.batches}` : 'Preparing import batches…'}</strong><span>{syncProgress ? `${syncProgress.processedGroups} of ${syncProgress.totalGroups} shipment groups · ${syncProgress.processedDetails} of ${syncProgress.totalDetails} detail rows processed` : 'Relora will sync complete shipment groups in bounded database transactions.'}</span></div><progress value={syncProgress?.processedDetails || 0} max={Math.max(1, syncProgress?.totalDetails || 1)} /></div>}

              <div className="modal-actions"><button className="ghost-button" type="button" disabled={isSyncing} onClick={() => { resetReviewState(); setError(''); }}>Change Sheet Selection</button><button className="primary-button" disabled={isSyncing || unresolvedCount > 0} onClick={() => void syncReviewedChanges()}>{isSyncing ? 'Syncing in batches…' : unresolvedCount > 0 ? `Review ${unresolvedCount} Value(s)` : 'Sync Reviewed Changes'}</button></div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
