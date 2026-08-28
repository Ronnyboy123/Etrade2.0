function flattenRealtimeRow(row) {
  if (!row) return row;
  const custom = row.custom_fields && typeof row.custom_fields === 'object' ? row.custom_fields : {};
  const { custom_fields, ...base } = row;
  return { ...base, ...custom };
}

function sameValue(left, right) {
  if (left === right) return true;
  return JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
}

export function applyRealtimeEvent(rows, event) {
  const current = Array.isArray(rows) ? rows : [];
  const type = event?.eventType;

  if (type === 'DELETE') {
    const id = event?.old?.id;
    return id ? current.filter((row) => row.id !== id) : current;
  }

  if (type !== 'INSERT' && type !== 'UPDATE') return current;
  const incoming = flattenRealtimeRow(event?.new);
  if (!incoming?.id) return current;

  if (incoming.archived_at) {
    return current.filter((row) => row.id !== incoming.id);
  }

  const index = current.findIndex((row) => row.id === incoming.id);
  if (index < 0) return [incoming, ...current];
  const next = [...current];
  next[index] = { ...current[index], ...incoming };
  return next;
}

export function reconcileRealtimeEvent(rows, event, activeEdit) {
  if (!activeEdit?.rowId || event?.eventType !== 'UPDATE' || event?.new?.id !== activeEdit.rowId) {
    return { rows: applyRealtimeEvent(rows, event), pendingRemote: null };
  }

  if (event.new?.archived_at) {
    return { rows: applyRealtimeEvent(rows, event), pendingRemote: event };
  }

  const incoming = flattenRealtimeRow(event.new);
  const current = Array.isArray(rows) ? rows : [];
  const index = current.findIndex((row) => row.id === activeEdit.rowId);
  if (index < 0) return { rows: current, pendingRemote: null };

  const local = current[index];
  const remoteChangedActiveField = !sameValue(incoming?.[activeEdit.field], activeEdit.baseValue);
  const merged = { ...local, ...incoming, [activeEdit.field]: local[activeEdit.field] };
  const next = [...current];
  next[index] = merged;

  return {
    rows: next,
    pendingRemote: remoteChangedActiveField ? event : null
  };
}

export async function subscribeToShipmentChanges(onEvent, onStatus) {
  const { supabase } = await import('./supabase.js');
  if (!supabase) throw new Error('Supabase is not configured.');

  const channel = supabase
    .channel(`relora-shipments-${globalThis.crypto?.randomUUID?.() || Date.now()}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'shipments' },
      (payload) => onEvent?.(payload)
    )
    .subscribe((status) => onStatus?.(status));

  return () => {
    void supabase.removeChannel(channel);
  };
}
