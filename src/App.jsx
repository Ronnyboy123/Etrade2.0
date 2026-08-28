import { useEffect, useMemo, useState } from 'react';
import { BarChart3, FileSpreadsheet, Users } from 'lucide-react';
import AuthGate from './components/AuthGate';
import ManagementDashboard from './components/ManagementDashboard';
import TeamWorkspaces from './components/TeamWorkspaces';
import WorkspaceView from './components/WorkspaceView';
import { applyAutomation } from './lib/automation.js';
import { roleLabel } from './lib/auth.js';
import { getSearchableColumns, resolveSmartSearch } from './lib/search.js';
import {
  canAccessMaster,
  canAccessTeamWorkspaces,
  canViewManagement,
  getAccessibleWorkers,
  getRowsForDeclarant,
  getVisibleRowsForUser
} from './lib/access.js';
import { filterRowsByKpi } from './lib/dashboardFilters.js';
import {
  deleteShipments,
  insertShipment,
  loadShipments,
  loadVisibleProfiles,
  persistImportChanges,
  updateShipment
} from './lib/dataApi.js';

function newShipment(assignedTo = '', teamId = '', assignedUserId = '') {
  return {
    assigned_user_id: assignedUserId || null,
    assigned_to: assignedTo,
    team_id: teamId,
    validated_manifest_date: '', service_month: '', job_file_number: '', customer: '', shipper: '', mode: '',
    house_awb_bl: '', master_awb_bl: '', pre_alert_shipping_documents: '', eta: '', cw_air_cbm_lcl: '',
    number_of_container: 0, description: '', dt_computation: '', week_no: '', fundcast: '', ata: '', port_of_entry: '',
    location_of_goods: '', lodgement: '', assessed: '', paid: '', entry_no: '', selectivity_color: '', portal_submission: '',
    broker_representative: '', portal_ticket_efile: '', releasing_date: '', liquidation_processor: '', liquidation_tl: '',
    endorsement_to_biller: '', team_leader: '', customs_declarant: assignedTo, received_folder: '', billed_date: '', efile: '', dispatch: '',
    timeline_duty_tax: 0, timeline_lodgement: 0, timeline_fan: 0, timeline_cargo_releasing: 0, timeline_liquidation: 0,
    timeline_liquidation_tl: 0, timeline_billing: 0, timeline_closing: 0, current_stage: 'PRE-ARRIVAL', completion: 0,
    next_action: '', overall_status: 'ON TRACK', boc_status: 'PENDING', days_open: 0, last_milestone_date: '', delay_action_remarks: ''
  };
}

function filterRows(rows, search) {
  const q = search.trim().toLowerCase();
  if (!q) return rows;
  return rows.filter((row) => Object.values(row).some((value) => String(value ?? '').toLowerCase().includes(q)));
}

function initialPageFor(user) {
  if (canViewManagement(user)) return 'dashboard';
  if (canAccessMaster(user)) return 'shipments';
  return 'my-workspace';
}

function AuthenticatedApp({ currentUser, authUser, signOut }) {
  const [page, setPage] = useState(() => initialPageFor(currentUser));
  const [rows, setRows] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [search, setSearch] = useState('');
  const [selectedWorker, setSelectedWorker] = useState(null);
  const [workspaceLayouts, setWorkspaceLayouts] = useState({});
  const [dashboardList, setDashboardList] = useState(null);
  const [dataStatus, setDataStatus] = useState('loading');
  const [dataError, setDataError] = useState('');
  const [mutationError, setMutationError] = useState('');

  const showDashboard = canViewManagement(currentUser);
  const showMaster = canAccessMaster(currentUser);
  const showTeams = canAccessTeamWorkspaces(currentUser);

  async function refreshData() {
    setDataStatus('loading');
    setDataError('');
    try {
      const [shipmentRows, visibleProfiles] = await Promise.all([
        loadShipments(),
        loadVisibleProfiles()
      ]);
      setRows(shipmentRows.map((row) => applyAutomation(row)));
      setProfiles(visibleProfiles);
      setDataStatus('ready');
    } catch (error) {
      setDataError(error?.message || 'Unable to load shipment data.');
      setDataStatus('error');
    }
  }

  useEffect(() => {
    void refreshData();
  }, [currentUser.id]);

  useEffect(() => {
    const validPages = new Set();
    if (showDashboard) validPages.add('dashboard');
    if (showMaster) validPages.add('shipments');
    if (showTeams) validPages.add('team');
    if (currentUser.role === 'employee') validPages.add('my-workspace');
    if (!validPages.has(page) && page !== 'team-workspace' && page !== 'dashboard-list') {
      setPage(initialPageFor(currentUser));
      setSelectedWorker(null);
      setSearch('');
    }
  }, [currentUser, page, showDashboard, showMaster, showTeams]);

  const workers = useMemo(() => profiles.filter((user) => user.role === 'employee'), [profiles]);
  const teamLeaders = useMemo(() => profiles.filter((user) => user.role === 'team_lead'), [profiles]);
  const dashboardRows = useMemo(() => getVisibleRowsForUser(rows, currentUser), [rows, currentUser]);
  const myRows = useMemo(() => getVisibleRowsForUser(rows, currentUser), [rows, currentUser]);
  const teamWorkspaceRows = useMemo(
    () => selectedWorker ? getRowsForDeclarant(rows, selectedWorker.declarantName) : [],
    [rows, selectedWorker]
  );
  const accessibleWorkers = useMemo(() => getAccessibleWorkers(workers, currentUser), [workers, currentUser]);
  const accessibleLeaders = useMemo(() => {
    if (currentUser.role === 'team_lead') return teamLeaders.filter((lead) => lead.teamId === currentUser.teamId);
    return teamLeaders;
  }, [teamLeaders, currentUser]);

  function openTeamWorkspace(worker) {
    if (!showTeams || !accessibleWorkers.some((item) => item.id === worker.id)) return;
    setSelectedWorker(worker);
    setSearch('');
    setPage('team-workspace');
  }

  async function addShipmentFor(declarantName = '', teamId = '', assignedUserId = '') {
    setMutationError('');
    try {
      const saved = await insertShipment(applyAutomation(newShipment(declarantName, teamId, assignedUserId)));
      setRows((old) => [applyAutomation(saved), ...old]);
    } catch (error) {
      setMutationError(error?.message || 'Unable to create the shipment.');
    }
  }

  async function handleRowChanged(row, field) {
    setMutationError('');
    try {
      const saved = await updateShipment(row, field, currentUser);
      const automated = applyAutomation(saved);
      setRows((old) => old.map((item) => item.id === automated.id ? automated : item));
      return automated;
    } catch (error) {
      setMutationError(error?.message || 'Unable to save this change.');
      throw error;
    }
  }

  async function handleDeleteRows(ids) {
    setMutationError('');
    try {
      await deleteShipments(ids);
      const deleting = new Set(ids);
      setRows((old) => old.filter((row) => !deleting.has(row.id)));
    } catch (error) {
      setMutationError(error?.message || 'Unable to delete the selected shipment(s).');
      throw error;
    }
  }

  async function handleImport(plan, layoutKey) {
    setMutationError('');
    try {
      await persistImportChanges(plan.changes, currentUser);
      const shipmentRows = await loadShipments();
      setRows(shipmentRows.map((row) => applyAutomation(row)));
      setWorkspaceLayouts((old) => ({
        ...old,
        [layoutKey]: { displayOrder: plan.displayOrder, columns: plan.columns }
      }));
    } catch (error) {
      setMutationError(error?.message || 'Unable to sync this imported file.');
      try {
        const shipmentRows = await loadShipments();
        setRows(shipmentRows.map((row) => applyAutomation(row)));
      } catch {
        // Keep the current UI state if a recovery reload also fails.
      }
      throw error;
    }
  }

  function renderWorkspace({
    title,
    subtitle,
    sourceRows,
    assignedTo,
    assignedUserId,
    teamId,
    layoutKey,
    onBack,
    suppressCreateActions = false
  }) {
    const layout = workspaceLayouts[layoutKey] || null;
    const searchableColumns = getSearchableColumns(layout);
    const searchResolution = resolveSmartSearch(search, searchableColumns);
    const visibleRows = searchResolution.type === 'rows' ? filterRows(sourceRows, searchResolution.query) : sourceRows;

    return (
      <WorkspaceView
        title={title}
        subtitle={subtitle}
        rows={visibleRows}
        allRows={rows}
        setRows={setRows}
        search={search}
        setSearch={setSearch}
        onAddShipment={suppressCreateActions ? undefined : () => addShipmentFor(assignedTo, teamId, assignedUserId)}
        onBack={onBack}
        assignedTo={assignedTo}
        assignedUserId={assignedUserId}
        teamId={teamId}
        layout={layout}
        currentUser={currentUser}
        suppressCreateActions={suppressCreateActions}
        searchTargetField={searchResolution.type === 'column' ? searchResolution.field : ''}
        searchTargetLabel={searchResolution.type === 'column' ? searchResolution.label : ''}
        onRowChanged={handleRowChanged}
        onDeleteRows={handleDeleteRows}
        onImportConfirmed={(plan) => handleImport(plan, layoutKey)}
      />
    );
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div><div className="brand">RELORA</div><div className="subtitle">Shipment & Customs Operations</div></div>
        <div className="topbar-actions">
          <div className="user-pill">
            <strong>{currentUser.name}</strong>
            <span>{roleLabel(currentUser.role)}{authUser?.email ? ` • ${authUser.email}` : ''}</span>
          </div>
          <button className="signout-button" onClick={signOut}>Sign Out</button>
        </div>
      </header>

      <nav className="navtabs">
        {showDashboard && <button className={page === 'dashboard' || page === 'dashboard-list' ? 'active' : ''} onClick={() => { setPage('dashboard'); setDashboardList(null); setSearch(''); }}><BarChart3 size={16} /> Dashboard</button>}
        {showMaster && <button className={page === 'shipments' ? 'active' : ''} onClick={() => { setPage('shipments'); setSearch(''); }}><FileSpreadsheet size={16} /> Master Shipments</button>}
        {showTeams && <button className={page === 'team' || page === 'team-workspace' ? 'active' : ''} onClick={() => { setPage('team'); setSelectedWorker(null); setSearch(''); }}><Users size={16} /> Team Workspaces</button>}
        {currentUser.role === 'employee' && <button className="active" onClick={() => setPage('my-workspace')}><FileSpreadsheet size={16} /> My Workspace</button>}
      </nav>

      {mutationError && <div className="mutation-error">{mutationError}</div>}

      {dataStatus === 'loading' && <div className="data-state">Loading your authorized shipment data…</div>}
      {dataStatus === 'error' && <div className="data-state error"><strong>Unable to load data.</strong><br />{dataError}<br /><button className="ghost-button" onClick={() => void refreshData()}>Try again</button></div>}

      {dataStatus === 'ready' && (
        <main>
          {page === 'dashboard' && showDashboard && (
            <ManagementDashboard
              rows={dashboardRows}
              onKpiClick={(key, label) => { setDashboardList({ key, label }); setSearch(''); setPage('dashboard-list'); }}
            />
          )}

          {page === 'dashboard-list' && showDashboard && dashboardList && renderWorkspace({
            title: dashboardList.label.toUpperCase(),
            subtitle: 'Shipment list behind the selected dashboard KPI. You can search, filter, and download this view.',
            sourceRows: filterRowsByKpi(dashboardRows, dashboardList.key),
            assignedTo: '',
            assignedUserId: '',
            teamId: currentUser.teamId || '',
            layoutKey: `dashboard:${dashboardList.key}`,
            onBack: () => { setPage('dashboard'); setDashboardList(null); setSearch(''); },
            suppressCreateActions: true
          })}

          {page === 'shipments' && showMaster && renderWorkspace({
            title: 'MASTER SHIPMENTS',
            subtitle: currentUser.role === 'portal'
              ? 'Master view with limited Portal / Broker editing access.'
              : 'All shipment records you are authorized to view.',
            sourceRows: rows,
            assignedTo: '',
            assignedUserId: '',
            teamId: '',
            layoutKey: 'master'
          })}

          {page === 'team' && showTeams && (
            <TeamWorkspaces workers={accessibleWorkers} leaders={accessibleLeaders} rows={rows} onOpenWorkspace={openTeamWorkspace} />
          )}

          {page === 'team-workspace' && showTeams && selectedWorker && renderWorkspace({
            title: `${selectedWorker.name.toUpperCase()}'S WORKSPACE`,
            subtitle: `${selectedWorker.name}'s assigned shipments. Changes update the master data automatically.`,
            sourceRows: teamWorkspaceRows,
            assignedTo: selectedWorker.declarantName,
            assignedUserId: selectedWorker.id,
            teamId: selectedWorker.teamId,
            layoutKey: `worker:${selectedWorker.declarantName}`,
            onBack: () => { setPage('team'); setSelectedWorker(null); setSearch(''); }
          })}

          {page === 'my-workspace' && currentUser.role === 'employee' && renderWorkspace({
            title: `${currentUser.name.toUpperCase()}'S WORKSPACE`,
            subtitle: 'Only shipments assigned to your account are shown here.',
            sourceRows: myRows,
            assignedTo: currentUser.declarantName,
            assignedUserId: currentUser.id,
            teamId: currentUser.teamId,
            layoutKey: `worker:${currentUser.declarantName}`
          })}
        </main>
      )}
    </div>
  );
}

export default function App() {
  return (
    <AuthGate>
      {({ currentUser, authUser, signOut }) => (
        <AuthenticatedApp currentUser={currentUser} authUser={authUser} signOut={signOut} />
      )}
    </AuthGate>
  );
}
