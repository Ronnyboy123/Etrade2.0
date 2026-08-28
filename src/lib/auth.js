function teamNameFromId(teamId) {
  const match = String(teamId || '').match(/^team(\d+)$/i);
  return match ? `Team ${match[1]}` : (teamId || '');
}

export function profileToAppUser(profile) {
  if (!profile) return null;
  return {
    id: profile.id,
    email: profile.email || '',
    name: profile.full_name || profile.declarant_name || profile.email || 'User',
    role: profile.role || 'employee',
    declarantName: profile.declarant_name || '',
    teamId: profile.team_id || '',
    teamName: teamNameFromId(profile.team_id)
  };
}

export function resolveProfileAccess(profile) {
  if (!profile) return { allowed: false, reason: 'not-approved' };
  if (profile.is_active === false) return { allowed: false, reason: 'inactive' };
  return { allowed: true, reason: '' };
}

export function roleLabel(role) {
  return {
    manager: 'Manager',
    assistant_manager: 'Assistant Manager',
    team_lead: 'Team Lead',
    portal: 'Portal / Broker',
    employee: 'Customs Declarant',
    admin: 'Admin'
  }[role] || role || 'User';
}
