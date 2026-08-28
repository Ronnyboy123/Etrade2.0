import KpiCard from './KpiCard';

export default function ManagementDashboard({ rows, onKpiClick }) {
  const total = rows.length;
  const closed = rows.filter((r) => r.overall_status === 'CLOSED').length;
  const delayed = rows.filter((r) => r.overall_status === 'DELAYED').length;
  const actionDue = rows.filter((r) => r.overall_status === 'ACTION DUE').length;
  const onTrack = rows.filter((r) => r.overall_status === 'ON TRACK').length;
  const open = Math.max(0, total - closed);

  const avgCompletion = total === 0 ? 0 : Math.round(rows.reduce((sum, row) => sum + Number(row.completion || 0), 0) / total);
  const avgDays = total === 0 ? 0 : Math.round((rows.reduce((sum, row) => sum + Number(row.days_open || 0), 0) / total) * 10) / 10;

  const byDeclarant = Object.values(rows.reduce((acc, row) => {
    const name = row.customs_declarant || row.assigned_to || 'Unassigned';
    if (!acc[name]) acc[name] = { name, total: 0, open: 0, delayed: 0, closed: 0, completionTotal: 0, daysTotal: 0 };
    const rec = acc[name];
    rec.total += 1;
    rec.closed += row.overall_status === 'CLOSED' ? 1 : 0;
    rec.open += row.overall_status === 'CLOSED' ? 0 : 1;
    rec.delayed += row.overall_status === 'DELAYED' ? 1 : 0;
    rec.completionTotal += Number(row.completion || 0);
    rec.daysTotal += Number(row.days_open || 0);
    return acc;
  }, {})).map((x) => ({
    ...x,
    avgCompletion: Math.round(x.completionTotal / x.total),
    avgDays: Math.round((x.daysTotal / x.total) * 10) / 10
  }));

  return (
    <section className="dashboard">
      <div className="report-title-row">
        <h1>SHIPMENT TIMELINE – FINAL MANAGEMENT REPORT</h1>
        <span>LIVE DATA</span>
      </div>

      <div className="kpi-grid">
        <KpiCard label="TOTAL SHIPMENTS" value={total} tone="navy" onClick={() => onKpiClick?.('total', 'All Shipments')} />
        <KpiCard label="OPEN SHIPMENTS" value={open} tone="blue" onClick={() => onKpiClick?.('open', 'Open Shipments')} />
        <KpiCard label="DELAYED" value={delayed} tone="red" onClick={() => onKpiClick?.('delayed', 'Delayed Shipments')} />
        <KpiCard label="ACTION DUE" value={actionDue} tone="gold" onClick={() => onKpiClick?.('action_due', 'Action Due Shipments')} />
        <KpiCard label="ON TRACK" value={onTrack} tone="green" onClick={() => onKpiClick?.('on_track', 'On Track Shipments')} />
        <KpiCard label="CLOSED" value={closed} tone="teal" onClick={() => onKpiClick?.('closed', 'Closed Shipments')} />
      </div>

      <div className="kpi-grid secondary">
        <KpiCard label="AVG. COMPLETION" value={`${avgCompletion}%`} tone="teal" />
        <KpiCard label="AVG. DAYS OPEN" value={avgDays} tone="blue" />
        <KpiCard label="ARRIVING NEXT 3 DAYS" value={0} tone="navy" />
        <KpiCard label="RELEASED NOT BILLED" value={0} tone="purple" />
        <KpiCard label="BILLED NOT DISPATCHED" value={0} tone="orange" />
        <KpiCard label="PENDING DT" value={0} tone="olive" />
      </div>

      <div className="dashboard-panels">
        <div className="panel">
          <h3>Declarant Workload / Delay</h3>
          <div className="simple-table-wrap">
            <table className="simple-table">
              <thead><tr><th>DECLARANT</th><th>TOTAL</th><th>OPEN</th><th>DELAYED</th><th>CLOSED</th><th>AVG COMPLETION</th><th>AVG DAYS OPEN</th></tr></thead>
              <tbody>
                {byDeclarant.map((r) => (
                  <tr key={r.name}><td>{r.name}</td><td>{r.total}</td><td>{r.open}</td><td>{r.delayed}</td><td>{r.closed}</td><td>{r.avgCompletion}%</td><td>{r.avgDays}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="panel">
          <h3>Shipment Status</h3>
          <div className="status-bars">
            {[['ON TRACK', onTrack], ['ACTION DUE', actionDue], ['DELAYED', delayed], ['CLOSED', closed]].map(([label, value]) => (
              <div className="bar-row" key={label}>
                <span>{label}</span>
                <div className="bar-track"><div className="bar-fill" style={{ width: `${total ? Math.max(6, (value / total) * 100) : 0}%` }} /></div>
                <strong>{value}</strong>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
