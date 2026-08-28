import { useRef, useState } from 'react';
import { AlertTriangle, FileSpreadsheet, UploadCloud, X } from 'lucide-react';
import * as XLSX from 'xlsx';
import { buildImportPlan, resolveImportConflicts } from '../lib/importer.js';

function readSheet(file) {
  return file.arrayBuffer().then((buffer) => {
    const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) throw new Error('The workbook does not contain any sheets.');

    const worksheet = workbook.Sheets[sheetName];
    const matrix = XLSX.utils.sheet_to_json(worksheet, {
      header: 1,
      defval: '',
      raw: true,
      blankrows: false
    });

    if (!matrix.length) throw new Error('The selected sheet is empty.');

    const width = Math.max(...matrix.map((row) => row.length));
    const rawHeaders = Array.from({ length: width }, (_, index) => matrix[0]?.[index] ?? '');
    const headers = rawHeaders.map((value, index) => {
      const text = String(value ?? '').trim();
      return text || `Unnamed Column ${index + 1}`;
    });

    const rows = matrix
      .slice(1)
      .filter((row) => row.some((value) => String(value ?? '').trim() !== ''))
      .map((row) =>
        Object.fromEntries(headers.map((header, index) => [header, row[index] ?? '']))
      );

    return { headers, rows, sheetName };
  });
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
  const [sheetName, setSheetName] = useState('');
  const [plan, setPlan] = useState(null);
  const [resolutions, setResolutions] = useState({});

  async function handleFile(file) {
    if (!file) return;
    const allowed = /\.(xlsx|xls|csv)$/i.test(file.name);
    if (!allowed) {
      setError('Please upload an Excel (.xlsx/.xls) or CSV file.');
      return;
    }

    setIsReading(true);
    setError('');
    setPlan(null);
    setResolutions({});

    try {
      const parsed = await readSheet(file);
      const nextPlan = buildImportPlan({
        existingRows: allRows,
        importedRows: parsed.rows,
        headers: parsed.headers,
        assignedTo,
        importSnapshotAt: file.lastModified ? new Date(file.lastModified).toISOString() : null
      });

      setFileName(file.name);
      setSheetName(parsed.sheetName);
      setPlan(nextPlan);
    } catch (err) {
      setError(err?.message || 'Unable to read this file.');
    } finally {
      setIsReading(false);
    }
  }

  function drop(event) {
    event.preventDefault();
    setIsDragging(false);
    handleFile(event.dataTransfer.files?.[0]);
  }

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="import-modal" onMouseDown={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h3>Import Shipment File</h3>
            <p>
              This works like a sync: matching shipments are updated, new shipments are added,
              and imported columns keep the same order as your Excel/CSV file.
            </p>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Close import">
            <X size={18} />
          </button>
        </div>

        {!plan && (
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

        {plan && (
          <>
            <div className="import-file-card">
              <FileSpreadsheet size={24} />
              <div>
                <strong>{fileName}</strong>
                <span>Sheet: {sheetName}</span>
              </div>
            </div>

            <div className="import-summary-grid">
              <div><span>Rows found</span><strong>{plan.summary.total}</strong></div>
              <div className="success"><span>New</span><strong>{plan.summary.created}</strong></div>
              <div className="info"><span>Safe Updates</span><strong>{plan.summary.safeUpdates}</strong></div>
              <div className="danger"><span>Needs Review</span><strong>{plan.summary.reviewConflicts}</strong></div>
              <div><span>Unchanged</span><strong>{plan.summary.unchanged}</strong></div>
              <div><span>Missing match key</span><strong>{plan.summary.missingKey}</strong></div>
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

            {plan.fieldConflicts?.length > 0 && (
              <div className="import-conflict-review">
                <div className="import-conflict-heading">
                  <div>
                    <h4>Review Potential Outdated Values</h4>
                    <p>Potential outdated value detected. Relora will not overwrite a newer value until you choose what to keep.</p>
                  </div>
                  <span>{plan.fieldConflicts.length} value{plan.fieldConflicts.length === 1 ? '' : 's'}</span>
                </div>

                {plan.fieldConflicts.map((conflict) => (
                  <div className="import-conflict-card" key={conflict.id}>
                    <div className="import-conflict-meta">
                      <strong>{conflict.shipmentCode || 'Matched shipment'}</strong>
                      <span>{conflict.label}</span>
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
              </div>
            )}

            {plan.summary.conflicts > 0 && (
              <div className="import-warning-message">
                <AlertTriangle size={17} />
                {plan.summary.conflicts} matching shipment(s) belong to another employee and
                will not be overwritten.
              </div>
            )}

            <div className="modal-actions">
              <button className="ghost-button" onClick={() => { setPlan(null); setResolutions({}); }}>Choose another file</button>
              <button
                className="primary-button"
                disabled={(plan.fieldConflicts || []).some((conflict) => !resolutions[conflict.id])}
                onClick={() => onConfirm(resolveImportConflicts(plan, resolutions))}
              >
                {(plan.fieldConflicts || []).some((conflict) => !resolutions[conflict.id])
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
