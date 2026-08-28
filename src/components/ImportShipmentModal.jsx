import { useRef, useState } from 'react';
import { AlertTriangle, FileSpreadsheet, UploadCloud, X } from 'lucide-react';
import * as XLSX from 'xlsx';
import { buildImportPlan } from '../lib/importer.js';

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

    try {
      const parsed = await readSheet(file);
      const nextPlan = buildImportPlan({
        existingRows: allRows,
        importedRows: parsed.rows,
        headers: parsed.headers,
        assignedTo
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
              <div className="info"><span>Existing Updated</span><strong>{plan.summary.updated}</strong></div>
              <div className="warning"><span>Duplicates</span><strong>{plan.summary.duplicates}</strong></div>
              <div className="danger"><span>Assignment conflicts</span><strong>{plan.summary.conflicts}</strong></div>
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

            {plan.summary.conflicts > 0 && (
              <div className="import-warning-message">
                <AlertTriangle size={17} />
                {plan.summary.conflicts} matching shipment(s) belong to another employee and
                will not be overwritten.
              </div>
            )}

            <div className="modal-actions">
              <button className="ghost-button" onClick={() => setPlan(null)}>Choose another file</button>
              <button className="primary-button" onClick={() => onConfirm(plan)}>
                Sync {plan.summary.created + plan.summary.updated} Changes
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
