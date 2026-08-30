import { CalendarDays } from 'lucide-react';
import { ALL_TIME, formatMonthLabel } from '../lib/monthly.js';

export default function MonthSelector({ value, monthKeys, onChange, allowAllTime = false }) {
  const keys = [...new Set([...(monthKeys || []), ...(value && value !== ALL_TIME ? [value] : [])])].sort();

  return (
    <div className="month-selector-bar">
      <div className="month-selector-label">
        <CalendarDays size={17} />
        <div><span>Reporting month</span><strong>{formatMonthLabel(value)}</strong></div>
      </div>
      <select className="month-selector" value={value} onChange={(event) => onChange?.(event.target.value)} aria-label="Reporting month">
        {allowAllTime && <option value={ALL_TIME}>All Time</option>}
        {keys.map((key) => <option key={key} value={key}>{formatMonthLabel(key)}</option>)}
      </select>
    </div>
  );
}
