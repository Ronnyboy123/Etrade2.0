import { AlertTriangle, X } from 'lucide-react';
import { FIELD_DEFINITIONS } from '../lib/importer.js';

function display(value) {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

export default function ConflictDialog({ conflict, onKeepServer, onUseMine, onClose, resolving = false }) {
  if (!conflict) return null;
  const label = FIELD_DEFINITIONS[conflict.field]?.label || conflict.field || 'Field';

  return (
    <div className="modal-backdrop conflict-backdrop" onMouseDown={onClose}>
      <div className="conflict-dialog" onMouseDown={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <div className="conflict-title">
            <AlertTriangle size={22} />
            <div>
              <h3>This shipment changed elsewhere</h3>
              <p>Another user changed the same field while you were editing it. Relora did not overwrite either value.</p>
            </div>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Close conflict"><X size={18} /></button>
        </div>

        <div className="conflict-field-name">{label}</div>
        <div className="conflict-values">
          <div><span>When you started</span><strong>{display(conflict.baseValue)}</strong></div>
          <div><span>Current server value</span><strong>{display(conflict.serverValue)}</strong></div>
          <div><span>Your value</span><strong>{display(conflict.proposedValue)}</strong></div>
        </div>

        <div className="modal-actions conflict-actions">
          <button className="ghost-button" disabled={resolving} onClick={onKeepServer}>Keep Server Value</button>
          <button className="primary-button" disabled={resolving} onClick={onUseMine}>{resolving ? 'Saving…' : 'Use My Value'}</button>
        </div>
      </div>
    </div>
  );
}
