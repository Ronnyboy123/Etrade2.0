import { useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { loadShipmentImportLines } from '../lib/dataApi.js';

function detailColumns(lines, showAllColumns) {
  const order = [];
  const seen = new Set();
  for (const line of lines || []) {
    for (const cell of line.raw_cells || []) {
      const header = String(cell?.header || '').trim();
      if (!header || seen.has(header)) continue;
      seen.add(header);
      order.push(header);
    }
  }
  return showAllColumns
    ? order
    : order.filter((header) => (lines || []).some((line) =>
      (line.raw_cells || []).some((cell) => cell.header === header && String(cell.value ?? '').trim())
    ));
}

function cellValue(line, header) {
  const cell = (line?.raw_cells || []).find((item) => item.header === header);
  return cell?.value ?? '';
}

export default function ShipmentDetailsDrawer({ shipment, onClose }) {
  const [lines, setLines] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [showAllColumns, setShowAllColumns] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLines([]);
    setSearch('');
    setShowAllColumns(false);
    setError('');
    if (!shipment?.id) return undefined;
    setLoading(true);
    loadShipmentImportLines(shipment.id)
      .then((data) => { if (!cancelled) setLines(data || []); })
      .catch((err) => { if (!cancelled) setError(err?.message || 'Unable to load shipment details.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [shipment?.id]);

  const columns = useMemo(() => detailColumns(lines, showAllColumns), [lines, showAllColumns]);
  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return lines;
    return lines.filter((line) => [
      line.source_sheet,
      line.source_section,
      line.source_row_number,
      ...(line.raw_cells || []).map((cell) => cell.value)
    ].some((value) => String(value ?? '').toLowerCase().includes(query)));
  }, [lines, search]);

  if (!shipment) return null;
  const shipmentLabel = shipment.job_file_number || shipment.entry_no || shipment.house_awb_bl || shipment.master_awb_bl || shipment.shipment_code || 'Shipment';

  return (
    <div className="shipment-details-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose?.(); }}>
      <aside className="shipment-details-drawer" aria-label="Shipment Details">
        <div className="shipment-details-header">
          <div><h3>Shipment Details</h3><p>{shipmentLabel} · imported Excel detail rows</p></div>
          <button type="button" className="icon-button" onClick={onClose}><X size={20} /></button>
        </div>
        <div className="shipment-details-toolbar">
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search shipment details" />
          <label><input type="checkbox" checked={showAllColumns} onChange={(event) => setShowAllColumns(event.target.checked)} /> Show all imported columns</label>
          <span>{filtered.length} of {lines.length} detail rows</span>
        </div>
        {loading && <div className="shipment-details-state">Loading imported details…</div>}
        {error && <div className="shipment-details-state error">{error}</div>}
        {!loading && !error && lines.length === 0 && <div className="shipment-details-state">No imported detail rows are saved for this shipment yet.</div>}
        {!loading && !error && lines.length > 0 && (
          <div className="shipment-details-table-wrap">
            <table className="shipment-details-table">
              <thead><tr><th>Source Sheet</th><th>Section</th><th>Excel Row</th>{columns.map((header) => <th key={header}>{header}</th>)}</tr></thead>
              <tbody>{filtered.map((line) => (
                <tr key={line.id || line.line_key}>
                  <td>{line.source_sheet || '—'}</td><td>{line.source_section || '—'}</td><td>{line.source_row_number || '—'}</td>
                  {columns.map((header) => <td key={`${line.line_key}-${header}`}>{String(cellValue(line, header) ?? '')}</td>)}
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </aside>
    </div>
  );
}
