const norm = (value) => String(value ?? '').trim().toLowerCase();

export const PORTAL_EDITABLE_FIELDS = new Set([
  'portal_submission',
  'broker_representative',
  'portal_ticket_efile'
]);

export function isExecutive(user) {
  return Boolean(user && ['manager', 'assistant_manager', 'admin'].includes(user.role));
}

export function canViewManagement(user) {
  return Boolean(user && ['manager', 'assistant_manager', 'team_lead', 'admin'].includes(user.role));
}

export function canAccessMaster(user) {
  return Boolean(user && ['manager', 'assistant_manager', 'portal', 'admin'].includes(user.role));
}

export function canAccessTeamWorkspaces(user) {
  return Boolean(user && ['manager', 'assistant_manager', 'team_lead', 'admin'].includes(user.role));
}

export function getVisibleRowsForUser(rows, user) {
  if (!user) return [];
  if (['manager', 'assistant_manager', 'portal', 'admin'].includes(user.role)) return rows;

  if (user.role === 'team_lead') {
    const teamId = norm(user.teamId);
    if (!teamId) return [];
    return rows.filter((row) => norm(row.team_id) === teamId);
  }

  const declarant = norm(user.declarantName);
  if (!declarant) return [];

  return rows.filter((row) =>
    norm(row.assigned_to || row.customs_declarant) === declarant
  );
}

export function getRowsForDeclarant(rows, declarantName) {
  const declarant = norm(declarantName);
  if (!declarant) return [];
  return rows.filter((row) =>
    norm(row.assigned_to || row.customs_declarant) === declarant
  );
}

export function getAccessibleWorkers(workers, user) {
  if (!user) return [];
  if (['manager', 'assistant_manager', 'admin'].includes(user.role)) return workers;
  if (user.role === 'team_lead') {
    return workers.filter((worker) => norm(worker.teamId) === norm(user.teamId));
  }
  return workers.filter((worker) => norm(worker.declarantName) === norm(user.declarantName));
}

export function canEditRow(user, row) {
  if (!user || !row) return false;
  if (['manager', 'assistant_manager', 'admin'].includes(user.role)) return true;
  if (user.role === 'portal') return true;
  if (user.role === 'team_lead') return norm(row.team_id) === norm(user.teamId);
  if (user.role === 'employee') {
    return norm(row.assigned_to || row.customs_declarant) === norm(user.declarantName);
  }
  return false;
}

export function canEditField(user, field, row) {
  if (!canEditRow(user, row)) return false;
  if (user?.role === 'portal') return PORTAL_EDITABLE_FIELDS.has(field);
  return true;
}

export function canDeleteRows(user) {
  return Boolean(user && ['manager', 'assistant_manager', 'team_lead', 'employee', 'admin'].includes(user.role));
}

export function canImportRows(user) {
  return Boolean(user && ['manager', 'assistant_manager', 'team_lead', 'employee', 'admin'].includes(user.role));
}

export function canAddRows(user) {
  return canImportRows(user);
}

export function canViewActivity(user) {
  return Boolean(user && ['team_lead', 'manager', 'admin'].includes(user.role));
}

export function canArchiveRows(user) {
  return Boolean(user && ['team_lead', 'manager', 'admin'].includes(user.role));
}

export function canBulkSelectAll(user) {
  return Boolean(user && ['manager', 'admin'].includes(user.role));
}

export function canRestoreRows(user) {
  return canArchiveRows(user);
}

export function canPermanentlyDeleteRows(user) {
  return Boolean(user && user.role === 'admin');
}
