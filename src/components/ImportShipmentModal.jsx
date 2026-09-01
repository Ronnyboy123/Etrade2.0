import { useRef, useState } from 'react';
import { AlertTriangle, FileSpreadsheet, UploadCloud, X } from 'lucide-react';
import * as XLSX from 'xlsx';
import {
  buildImportPlan,
  combineWorkbookSheets,
  extractWorkbookSheets,
  resolveImportReview,
  worksheetImportRange
} from '../lib/importer.js';

function readWorkbook(file) {
  return file.arrayBuffer().then((buffer) => {
    const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
    if (!workbook.SheetNames?.length) {
      throw new Error('The workbook does not contain any sheets.');
    }

    const sheets = extractWorkbookSheets(workbook, (worksheet) =>
      XLSX.utils.sheet_to_json(worksheet, {
        header: 1,
        defval: '',
        raw: true,
        blankrows: false,
        range: worksheetImportRange(worksheet)
      })
    );

    if (!sheets.some((sheet) => sheet.rowCount > 0)) {
      throw new Error('The workbook does not contain any shipment rows.');
    }

    return sheets;
  });
}


const REVIEW_PAGE_SIZE = 100;
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

export default function ImportShipmentModal({
  allRows,
  assignedTo,
  onConfirm,
  onClose
}) {
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
  const [archivedPage, setArchivedPage] = useState(0);
  const [conflictPage, setConflictPage] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState(null);

  const importableSheetNames = workbookSheets
    .filter((sheet) => sheet.rowCount > 0)
    .map((sheet) => sheet.name);
  const allSheetsSelected = importableSheetNames.length > 0
    && importableSheetNames.every((name) => selectedSheetNames.includes(name));
  const traceStart = tracePage * REVIEW_PAGE_SIZE;
  const visibleTraceRows = (plan?.rowTrace || []).slice(traceStart, traceStart + REVIEW_PAGE_SIZE);
  const archivedStart = archivedPage * CONFLICT_PAGE_SIZE;
  const visibleArchivedConflicts = (plan?.archivedConflicts || []).slice(archivedStart, archivedStart + CONFLICT_PAGE_SIZE);
  const conflictStart = conflictPage * CONFLICT_PAGE_SIZE;
  const visibleFieldConflicts = (plan?.fieldConflicts || []).slice(conflictStart, conflictStart + CONFLICT_PAGE_SIZE);

  function resetReviewState() {
    setPlan(null);
    setResolutions({});
    setArchivedResolutions({});
    setTracePage(0);
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
    const allowed = /\.(xlsx|xls|csv)$/i.test(file.name);
    if (!allowed) {
      setError('Please upload an Excel (.xlsx/.xls) or CSV file.');
      return;
    }

    setIsReading(true);
    setError('');
    resetReviewState();

    try {
      const sheets = await readWorkbook(file);
      const selectable = sheets.filter((sheet) => sheet.rowCount > 0).map((sheet) => sheet.name);
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

  function reviewSelectedSheets() {
    const combined = combineWorkbookSheets(workbookSheets, selectedSheetNames);
    if (!combined.rows.length) {
      setError('Select at least one sheet that contains shipment rows.');
      return;
    }

    setError('');
    setResolutions({});
    setArchivedResolutions({});
    setTracePage(0);
    setArchivedPage(0);
    setConflictPage(0);
    setSyncProgress(null);
    setPlan(buildImportPlan({
      existingRows: allRows,
      importedRows: combined.rows,
      headers: combined.headers,
      assignedTo,
      importSnapshotAt,
      sheetBreakdown: combined.sheetBreakdown
    }));
  }

  function toggleAllSheets() {
    setSelectedSheetNames(allSheetsSelected ? [] : importableSheetNames);
  }

  function toggleSheet(name) {
    setSelectedSheetNames((current) =>
      current.includes(name)
        ? current.filter((sheetName) => sheetName !== name)
        : [...current, name]
    );
  }

  function drop(event) {
    event.preventDefault();
    setIsDragging(false);
    handleFile(event.dataTransfer.files?.[0]);
  }

  async function syncReviewedChanges() {
    if (!plan || isSyncing) return;
    const unresolved = (plan.fieldConflicts || []).filter((conflict) => !resolutions[conflict.id]);
    if (unresolved.length > 0) return;

    setIsSyncing(true);
    setSyncProgress(null);
    setError('');
    try {
      await onConfirm(
        resolveImportReview(plan, resolutions, archivedResolutions),
        (progress) => setSyncProgress(progress)
      );
    } catch (err) {
      setError(err?.message || 'Unable to sync this imported file.');
    } finally {
      setIsSyncing(false);
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={isSyncing ? undefined : onClose}>
      <div className="import-modal" onMouseDown={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h3>Import Shipment File</h3>
            <p>
              This works like a sync: matching shipments are updated, new shipments are added,
              and imported columns keep the same order as your selected Excel/CSV sheets.
            </p>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Close import" disabled={isSyncing}>
            <X size={18} />
          </button>
        </div>

        {!workbookSheets.length && !plan && (
          <div
            className={`drop-zone ${isDragging ? 'dragging' : ''}`}
            onDragOver={(event) => {
              event.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={drop}
            onClick={() => inputRef.current?.click()}
          >
            <UploadCloud size={38} />
            <strong>{isReading ? 'Reading file…' : 'Drop Excel or CSV here'}</strong>
            <span>or click to browse</span>
            <small>.xlsx, .xls, .csv</small>
            <input
              ref={inputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              hidden
              onChange={(event) => handleFile(event.target.files?.[0])}
            />
          </div>
        )}

        {error && (
          <div className="import-error">
            <AlertTriangle size={17} /> {error}
          </div>
        )}

        {workbookSheets.length > 0 && !plan && (
          <>
            <div className="import-file-card">
              <FileSpreadsheet size={24} />
              <div>
                <strong>{fileName}</strong>
                <span>{workbookSheets.length} sheet{workbookSheets.length === 1 ? '' : 's'} detected</span>
              </div>
            </div>

            <div className="sheet-selection-panel">
              <div className="mapping-heading">
                <div>
                  <h4>Select sheets to import</h4>
                  <p>Review the workbook tabs first. Empty or reference sheets can be left out.</p>
                </div>
                <span>{selectedSheetNames.length} selected</span>
              </div>

              <label className="sheet-option sheet-option-all">
                <input
                  type="checkbox"
                  checked={allSheetsSelected}
                  onChange={toggleAllSheets}
                />
                <span>
                  <strong>All Sheets</strong>
                  <small>Select every sheet that contains rows</small>
                </span>
              </label>

              <div className="sheet-option-list">
                {workbookSheets.map((sheet) => (
                  <label className={`sheet-option ${sheet.rowCount === 0 ? 'empty' : ''}`} key={sheet.name}>
                    <input
                      type="checkbox"
                      checked={selectedSheetNames.includes(sheet.name)}
                      disabled={sheet.rowCount === 0}
                      onChange={() => toggleSheet(sheet.name)}
                    />
                    <span>
                      <strong>{sheet.name}</strong>
                      <small>{sheet.rowCount} row{sheet.rowCount === 1 ? '' : 's'}</small>
                    </span>
                  </label>
                ))}
              </div>
            </div>

            <div className="modal-actions">
              <button className="ghost-button" type="button" onClick={chooseAnotherFile}>Choose another file</button>
              <button
                className="primary-button"
                type="button"
                disabled={selectedSheetNames.length === 0}
                onClick={reviewSelectedSheets}
              >
                Review Selected Sheets
              </button>
            </div>
          </>
        )}

        {plan && (
          <>
            <div className="import-file-card">
              <FileSpreadsheet size={24} />
              <div>
                <strong>{fileName}</strong>
                <span>{plan.sheetBreakdown?.length || 0} selected sheet{plan.sheetBreakdown?.length === 1 ? '' : 's'}</span>
              </div>
            </div>

            <div className="import-summary-grid">
              <div><span>Rows found</span><strong>{plan.summary.total}</strong></div>
              <div className="success"><span>New</span><strong>{plan.summary.created}</strong></div>
              <div className="info"><span>Safe Updates</span><strong>{plan.summary.safeUpdates}</strong></div>
              <div className="danger"><span>Needs Review</span><strong>{plan.summary.reviewConflicts}</strong></div>
              <div className="warning"><span>Archived Matches</span><strong>{plan.summary.archivedMatches || 0}</strong></div>
              <div><span>Unchanged</span><strong>{plan.summary.unchanged}</strong></div>
              <div><span>Missing match key</span><strong>{plan.summary.missingKey}</strong></div>
            </div>

            <div className="mapping-section">
              <div className="mapping-heading">
                <div>
                  <h4>Selected sheet summary</h4>
                  <p>Use Source Sheet to trace where imported shipment rows came from.</p>
                </div>
                <span>{plan.sheetBreakdown?.length || 0} sheets</span>
              </div>
              <div className="mapping-table-wrap compact-import-table">
                <table className="mapping-table">
                  <thead>
                    <tr>
                      <th>Source Sheet</th>
                      <th>Rows</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(plan.sheetBreakdown || []).map((sheet) => (
                      <tr key={sheet.name}>
                        <td>{sheet.name}</td>
                        <td>{sheet.rowCount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="mapping-section">
              <div className="mapping-heading">
                <div>
                  <h4>Import row trace</h4>
                  <p>Each reviewed shipment keeps the worksheet name that supplied it.</p>
                </div>
                <span>{plan.rowTrace?.length || 0} rows</span>
              </div>
              <div className="mapping-table-wrap import-trace-wrap">
                <table className="mapping-table">
                  <thead>
                    <tr>
                      <th>Source Sheet</th>
                      <th>Shipment</th>
                      <th>Preview Result</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleTraceRows.map((trace, index) => (
                      <tr key={`${trace.sourceSheet || 'sheet'}-${trace.shipmentCode || 'row'}-${traceStart + index}`}>
                        <td>{trace.sourceSheet || '—'}</td>
                        <td>{trace.shipmentCode || 'No match key'}</td>
                        <td>{trace.result}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <ReviewPager
                page={tracePage}
                setPage={setTracePage}
                total={plan.rowTrace?.length || 0}
                pageSize={REVIEW_PAGE_SIZE}
                label="Trace"
              />
            </div>

            <div className="mapping-section">
              <div className="mapping-heading">
                <div>
                  <h4>Column mapping</h4>
                  <p>Unknown columns are kept instead of being discarded.</p>
                </div>
                <span>{plan.columns.length} columns</span>
              </div>

              <div className="mapping-table-wrap">
                <table className="mapping-table">
                  <thead>
                    <tr>
                      <th>Uploaded Column</th>
                      <th>Website Column</th>
                      <th>Type</th>
                    </tr>
                  </thead>
                  <tbody>
                    {plan.columns.map((column, index) => (
                      <tr key={`${column.field}-${index}`}>
                        <td>{column.originalHeader}</td>
                        <td>{column.label}</td>
                        <td>
                          <span className={`mapping-pill ${column.isCustom ? 'custom' : 'mapped'}`}>
                            {column.isCustom ? 'Custom' : 'Mapped'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {plan.archivedConflicts?.length > 0 && (
              <div className="import-conflict-review">
                <div className="import-conflict-heading">
                  <div>
                    <h4>Archived shipment already exists</h4>
                    <p>Relora found shipment(s) already in Archived. Skip is the safe default, or restore the shipment and update it from this import.</p>
                  </div>
                  <span>{plan.archivedConflicts.length} shipment{plan.archivedConflicts.length === 1 ? '' : 's'}</span>
                </div>

                {visibleArchivedConflicts.map((conflict) => {
                  const choice = archivedResolutions[conflict.id] || 'skip';
                  return (
                    <div className="import-conflict-card" key={conflict.id}>
                      <div className="import-conflict-meta">
                        <strong>{conflict.shipmentCode || 'Archived shipment'}</strong>
                        <span>{conflict.sourceSheet ? `Source Sheet: ${conflict.sourceSheet}` : 'Archived'}</span>
                      </div>
                      <p className="import-conflict-reason">{conflict.reason}</p>
                      <div className="import-conflict-actions">
                        <button
                          type="button"
                          className={choice === 'skip' ? 'selected' : ''}
                          onClick={() => setArchivedResolutions((old) => ({ ...old, [conflict.id]: 'skip' }))}
                        >
                          Skip
                        </button>
                        <button
                          type="button"
                          className={choice === 'restore_update' ? 'selected' : ''}
                          onClick={() => setArchivedResolutions((old) => ({ ...old, [conflict.id]: 'restore_update' }))}
                        >
                          {'Restore & Update'}
                        </button>
                      </div>
                    </div>
                  );
                })}
                <ReviewPager
                  page={archivedPage}
                  setPage={setArchivedPage}
                  total={plan.archivedConflicts.length}
                  pageSize={CONFLICT_PAGE_SIZE}
                  label="Archived matches"
                />
              </div>
            )}

            {plan.fieldConflicts?.length > 0 && (
              <div className="import-conflict-review">
                <div className="import-conflict-heading">
                  <div>
                    <h4>Review Potential Outdated Values</h4>
                    <p>Potential outdated value detected. Relora will not overwrite a newer value until you choose what to keep.</p>
                  </div>
                  <span>{plan.fieldConflicts.length} value{plan.fieldConflicts.length === 1 ? '' : 's'}</span>
                </div>

                {visibleFieldConflicts.map((conflict) => (
                  <div className="import-conflict-card" key={conflict.id}>
                    <div className="import-conflict-meta">
                      <strong>{conflict.shipmentCode || 'Matched shipment'}</strong>
                      <span>{conflict.sourceSheet ? `${conflict.label} · Source Sheet: ${conflict.sourceSheet}` : conflict.label}</span>
                    </div>
                    <p className="import-conflict-reason">{conflict.reason}</p>
                    <div className="import-conflict-values">
                      <div><span>Relora</span><strong>{String(conflict.serverValue || '—')}</strong></div>
                      <div><span>Imported file</span><strong>{String(conflict.importedValue || '—')}</strong></div>
                    </div>
                    <div className="import-conflict-actions">
                      <button
                        type="button"
                        className={resolutions[conflict.id] === 'server' ? 'selected' : ''}
                        onClick={() => setResolutions((old) => ({ ...old, [conflict.id]: 'server' }))}
                      >
                        Keep Relora
                      </button>
                      <button
                        type="button"
                        className={resolutions[conflict.id] === 'import' ? 'selected' : ''}
                        onClick={() => setResolutions((old) => ({ ...old, [conflict.id]: 'import' }))}
                      >
                        Use Imported
                      </button>
                    </div>
                  </div>
                ))}
                <ReviewPager
                  page={conflictPage}
                  setPage={setConflictPage}
                  total={plan.fieldConflicts.length}
                  pageSize={CONFLICT_PAGE_SIZE}
                  label="Review values"
                />
              </div>
            )}

            {plan.summary.conflicts > 0 && (
              <div className="import-warning-message">
                <AlertTriangle size={17} />
                {plan.summary.conflicts} matching shipment(s) belong to another employee and
                will not be overwritten.
              </div>
            )}

            {isSyncing && (
              <div className="import-progress-panel" aria-live="polite">
                <div className="import-progress-copy">
                  <strong>
                    {syncProgress
                      ? `Importing batch ${syncProgress.batch} of ${syncProgress.batches}`
                      : 'Preparing import batches…'}
                  </strong>
                  <span>
                    {syncProgress
                      ? `${syncProgress.processed} of ${syncProgress.total} changes processed`
                      : 'Relora will sync the file in smaller database transactions.'}
                  </span>
                </div>
                <progress
                  value={syncProgress?.processed || 0}
                  max={Math.max(1, syncProgress?.total || 1)}
                />
              </div>
            )}

            <div className="modal-actions">
              <button
                className="ghost-button"
                type="button"
                disabled={isSyncing}
                onClick={() => {
                  resetReviewState();
                  setError('');
                }}
              >
                Change Sheet Selection
              </button>
              <button
                className="primary-button"
                disabled={isSyncing || (plan.fieldConflicts || []).some((conflict) => !resolutions[conflict.id])}
                onClick={syncReviewedChanges}
              >
                {isSyncing
                  ? 'Syncing in batches…'
                  : (plan.fieldConflicts || []).some((conflict) => !resolutions[conflict.id])
                    ? `Review ${plan.fieldConflicts.filter((conflict) => !resolutions[conflict.id]).length} Value(s)`
                    : 'Sync Reviewed Changes'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
