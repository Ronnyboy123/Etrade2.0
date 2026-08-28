import { History, X } from 'lucide-react';

function displayValue(value) {
  return value === null || value === undefined || value === '' ? '—' : String(value);
}

function formatWhen(value) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString();
}

export default function ActivityPanel({ shipment, activities = [], loading = false, error = '', onClose }) {
  if (!shipment) return null;
  return (
    <div className="modal-backdrop activity-backdrop" onMouseDown={onClose}>
      <aside className="activity-panel" onMouseDown={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <div className="activity-heading">
            <History size={20} />
            <div>
              <h3>Activity History</h3>
              <p>{shipment.job_file_number || shipment.shipment_code || 'Shipment'}</p>
            </div>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Close activity history"><X size={18} /></button>
        </div>

        {loading && <div className="activity-state">Loading history…</div>}
        {error && <div className="activity-state error">{error}</div>}
        {!loading && !error && activities.length === 0 && <div className="activity-state">No recorded activity yet.</div>}

        <div className="activity-list">
          {activities.map((item) => (
            <article className="activity-item" key={item.id}>
              <div className="activity-item-top">
                <strong>{item.actor_name || item.actor_email || 'Relora User'}</strong>
                <time>{formatWhen(item.created_at)}</time>
              </div>
              <div className="activity-action">{String(item.action_type || 'update').replaceAll('_', ' ')}</div>
              {item.field_name && <div className="activity-field">Field: <strong>{item.field_name}</strong></div>}
              {(item.old_value !== null || item.new_value !== null) && (
                <div className="activity-change">
                  <span>{displayValue(item.old_value)}</span><span>→</span><span>{displayValue(item.new_value)}</span>
                </div>
              )}
              <small>Source: {item.source || 'system'}</small>
            </article>
          ))}
        </div>
      </aside>
    </div>
  );
}
