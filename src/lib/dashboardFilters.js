export function filterRowsByKpi(rows, key) {
  switch (key) {
    case 'open':
      return rows.filter((row) => row.overall_status !== 'CLOSED');
    case 'delayed':
      return rows.filter((row) => row.overall_status === 'DELAYED');
    case 'action_due':
      return rows.filter((row) => row.overall_status === 'ACTION DUE');
    case 'on_track':
      return rows.filter((row) => row.overall_status === 'ON TRACK');
    case 'closed':
      return rows.filter((row) => row.overall_status === 'CLOSED');
    case 'total':
    default:
      return rows;
  }
}
