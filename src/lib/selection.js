export function getSpreadsheetRowNumber(rowIndex) {
  return Number(rowIndex) + 1;
}

export function deleteRowsByIds(rows, selectedIds) {
  if (!selectedIds?.length) return rows;
  const selected = new Set(selectedIds);
  return rows.filter((row) => !selected.has(row.id));
}

export function toggleSelectedId(selectedIds, id) {
  const selected = new Set(selectedIds || []);
  if (selected.has(id)) selected.delete(id);
  else selected.add(id);
  return [...selected];
}

export function toggleAllVisibleIds(selectedIds, visibleIds, checked) {
  const selected = new Set(selectedIds || []);
  for (const id of visibleIds || []) {
    if (checked) selected.add(id);
    else selected.delete(id);
  }
  return [...selected];
}

export function getSelectionState(selectedIds, visibleIds) {
  const visible = visibleIds || [];
  if (!visible.length) return { checked: false, indeterminate: false };
  const selected = new Set(selectedIds || []);
  const count = visible.filter((id) => selected.has(id)).length;
  return {
    checked: count === visible.length,
    indeterminate: count > 0 && count < visible.length
  };
}
