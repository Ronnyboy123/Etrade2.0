export default function KpiCard({ label, value, tone = 'blue', onClick }) {
  const content = (
    <>
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">{value}</div>
      {onClick && <div className="kpi-hint">View list</div>}
    </>
  );

  if (onClick) {
    return <button type="button" className={`kpi-card kpi-clickable tone-${tone}`} onClick={onClick}>{content}</button>;
  }

  return <div className={`kpi-card tone-${tone}`}>{content}</div>;
}
