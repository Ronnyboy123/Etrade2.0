import { useEffect, useMemo, useRef, useState } from 'react';
import { Archive, BarChart3, FileSpreadsheet, Users } from 'lucide-react';
import AuthGate from './components/AuthGate';
import ActivityPanel from './components/ActivityPanel';
import ArchivedView from './components/ArchivedView';
import ConflictDialog from './components/ConflictDialog';
import ManagementDashboard from './components/ManagementDashboard';
import MonthSelector from './components/MonthSelector';
import SyncStatus from './components/SyncStatus';
import TeamWorkspaces from './components/TeamWorkspaces';
import WorkspaceView from './components/WorkspaceView';
import { applyAutomation } from './lib/automation.js';
import { roleLabel } from './lib/auth.js';
import { getSearchableColumns, resolveSmartSearch } from './lib/search.js';
import {
  canAccessMaster,
  canAccessTeamWorkspaces,
  canArchiveRows,
  canViewActivity,
  canViewManagement,
  getAccessibleWorkers,
  getRowsForDeclarant,
  getVisibleRowsForUser
} from './lib/access.js';
import { filterRowsByKpi } from './lib/dashboardFilters.js';
import {
  archiveShipments,
  insertShipment,
  loadArchivedShipments,
  loadShipmentActivity,
  loadShipments,
  loadVisibleProfiles,
  permanentlyDeleteShipments,
  persistImportChanges,
  restoreShipments,
  ShipmentConflictError,
  updateShipmentField
} from './lib/dataApi.js';
import { applyRealtimeEvent, reconcileRealtimeEvent, subscribeToShipmentChanges } from './lib/realtime.js';
import { nextSyncState } from './lib/syncState.js';
import { ALL_TIME, currentMonthKey, filterRowsByMonth, formatMonthLabel, getAvailableMonthKeys } from './lib/monthly.js';

function newShipment(assignedTo = '', teamId = '', assignedUserId = '', serviceMonth = '') {
  return {
    assigned_user_id: assignedUserId || null,
    assigned_to: assignedTo,
    team_id: teamId,
    validated_manifest_date: '', service_month: serviceMonth, job_file_number: '', customer: '', shipper: '', mode: '',
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

function AuthenticatedApp({ currentUser, authUser, signOut, requestPasswordChange }) {
  const [page, setPage] = useState(() => initialPageFor(currentUser));
  const [selectedMonth, setSelectedMonth] = useState(() => currentMonthKey());
  const [rows, setRows] = useState([]);
  const [archivedRows, setArchivedRows] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [search, setSearch] = useState('');
  const [selectedWorker, setSelectedWorker] = useState(null);
  const [workspaceLayouts, setWorkspaceLayouts] = useState({});
  const [dashboardList, setDashboardList] = useState(null);
  const [dataStatus, setDataStatus] = useState('loading');
  const [dataError, setDataError] = useState('');
  const [mutationError, setMutationError] = useState('');
  const [syncState, setSyncState] = useState(() => navigator.onLine ? 'reconnecting' : 'offline');
  const [activeEdit, setActiveEdit] = useState(null);
  const [pendingRemote, setPendingRemote] = useState(null);
  const [conflict, setConflict] = useState(null);
  const [conflictResolving, setConflictResolving] = useState(false);
  const [activityShipment, setActivityShipment] = useState(null);
  const [activityRows, setActivityRows] = useState([]);
  const [activityLoading, setActivityLoading] = useState(false);
  const [activityError, setActivityError] = useState('');
  const [accountNotice, setAccountNotice] = useState('');

  const activeEditRef = useRef(null);
  const pendingRemoteRef = useRef(null);
  const recoveryRef = useRef(false);

  const showDashboard = canViewManagement(currentUser);
  const showMaster = canAccessMaster(currentUser);
  const showTeams = canAccessTeamWorkspaces(currentUser);
  const showArchived = canArchiveRows(currentUser);
  const showActivity = canViewActivity(currentUser);

  async function handlePasswordChangeRequest() {
    setAccountNotice('');
    try {
      const message = await requestPasswordChange();
      setAccountNotice(message);
    } catch (error) {
      setAccountNotice(error?.message || 'Unable to send password-change email.');
    }
  }

  function markSync(event) {
    setSyncState((old) => nextSyncState(old, event));
  }

  function requireOnline() {
    if (navigator.onLine) return;
    markSync('BROWSER_OFFLINE');
    throw new Error('Relora is offline. Reconnect before making changes.');
  }

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
      return true;
    } catch (error) {
      setDataError(error?.message || 'Unable to load shipment data.');
      setDataStatus('error');
      return false;
    }
  }

  async function refreshArchived() {
    if (!showArchived) return;
    try {
      const items = await loadArchivedShipments();
      setArchivedRows(items.map((row) => applyAutomation(row)));
    } catch (error) {
      setMutationError(error?.message || 'Unable to load archived shipments.');
    }
  }

  useEffect(() => {
    void refreshData();
  }, [currentUser.id]);

  useEffect(() => {
    let cancelled = false;
    let unsubscribe = null;

    void subscribeToShipmentChanges(
      (event) => {
        if (cancelled) return;
        setRows((old) => {
          const result = reconcileRealtimeEvent(old, event, activeEditRef.current);
          if (result.pendingRemote) {
            pendingRemoteRef.current = result.pendingRemote;
            setPendingRemote(result.pendingRemote);
          }
          return result.rows.map((row) => applyAutomation(row));
        });

        if (showArchived && (event?.eventType === 'UPDATE' || event?.eventType === 'DELETE')) {
          setArchivedRows((old) => applyRealtimeEvent(old, event).map((row) => applyAutomation(row)));
        }
      },
      (status) => {
        if (cancelled) return;
        if (status === 'SUBSCRIBED') {
          if (!recoveryRef.current && navigator.onLine) markSync('REALTIME_HEALTHY');
        } else if (['CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED'].includes(status)) {
          markSync('REALTIME_ERROR');
        }
      }
    ).then((cleanup) => {
      if (cancelled) cleanup?.();
      else unsubscribe = cleanup;
    }).catch(() => {
      if (!cancelled) markSync('REALTIME_ERROR');
    });

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [currentUser.id, showArchived]);

  useEffect(() => {
    const goOffline = () => markSync('BROWSER_OFFLINE');
    const goOnline = async () => {
      recoveryRef.current = true;
      markSync('RECONNECT_START');
      const reloaded = await refreshData();
      if (showArchived) await refreshArchived();
      recoveryRef.current = false;
      markSync(reloaded ? 'RECONNECT_SUCCESS' : 'SAVE_ERROR');
    };

    window.addEventListener('offline', goOffline);
    window.addEventListener('online', goOnline);
    return () => {
      window.removeEventListener('offline', goOffline);
      window.removeEventListener('online', goOnline);
    };
  }, [currentUser.id, showArchived]);

  useEffect(() => {
    const validPages = new Set();
    if (showDashboard) validPages.add('dashboard');
    if (showMaster) validPages.add('shipments');
    if (showTeams) validPages.add('team');
    if (showArchived) validPages.add('archived');
    if (currentUser.role === 'employee') validPages.add('my-workspace');
    if (!validPages.has(page) && page !== 'team-workspace' && page !== 'dashboard-list') {
      setPage(initialPageFor(currentUser));
      setSelectedWorker(null);
      setSearch('');
    }
  }, [currentUser, page, showDashboard, showMaster, showTeams, showArchived]);

  const monthKeys = useMemo(() => getAvailableMonthKeys(rows), [rows]);
  const monthScopedRows = useMemo(() => filterRowsByMonth(rows, selectedMonth), [rows, selectedMonth]);
  const monthScopedArchivedRows = useMemo(() => filterRowsByMonth(archivedRows, selectedMonth), [archivedRows, selectedMonth]);
  const reportingPeriodLabel = formatMonthLabel(selectedMonth);
  const workers = useMemo(() => profiles.filter((user) => user.role === 'employee'), [profiles]);
  const teamLeaders = useMemo(() => profiles.filter((user) => user.role === 'team_lead'), [profiles]);
  const dashboardRows = useMemo(() => getVisibleRowsForUser(monthScopedRows, currentUser), [monthScopedRows, currentUser]);
  const myRows = useMemo(() => getVisibleRowsForUser(monthScopedRows, currentUser), [monthScopedRows, currentUser]);
  const teamWorkspaceRows = useMemo(
    () => selectedWorker ? getRowsForDeclarant(monthScopedRows, selectedWorker.declarantName) : [],
    [monthScopedRows, selectedWorker]
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

  function handleEditingChange(edit) {
    activeEditRef.current = edit;
    setActiveEdit(edit);
    if (edit) {
      pendingRemoteRef.current = null;
      setPendingRemote(null);
      return;
    }

    const queued = pendingRemoteRef.current;
    if (queued) {
      setRows((old) => applyRealtimeEvent(old, queued).map((row) => applyAutomation(row)));
      pendingRemoteRef.current = null;
      setPendingRemote(null);
    }
  }

  async function addShipmentFor(declarantName = '', teamId = '', assignedUserId = '') {
    setMutationError('');
    try {
      requireOnline();
      markSync('SAVE_START');
      const monthForNewShipment = selectedMonth === ALL_TIME ? currentMonthKey() : selectedMonth;
      const saved = await insertShipment(applyAutomation(newShipment(declarantName, teamId, assignedUserId, formatMonthLabel(monthForNewShipment))));
      setRows((old) => [applyAutomation(saved), ...old.filter((row) => row.id !== saved.id)]);
      markSync('SAVE_SUCCESS');
    } catch (error) {
      if (navigator.onLine) markSync('SAVE_ERROR');
      setMutationError(error?.message || 'Unable to create the shipment.');
    }
  }

  async function handleRowChanged(row, field, editContext = {}) {
    setMutationError('');
    try {
      requireOnline();
      markSync('SAVE_START');
      const saved = await updateShipmentField(row, field, currentUser, editContext);
      const automated = applyAutomation(saved);
      setRows((old) => old.map((item) => item.id === automated.id ? automated : item));
      pendingRemoteRef.current = null;
      setPendingRemote(null);
      markSync('SAVE_SUCCESS');
      return automated;
    } catch (error) {
      if (error instanceof ShipmentConflictError) {
        setConflict({
          field: error.field,
          baseValue: error.baseValue,
          proposedValue: error.proposedValue,
          serverValue: error.serverValue,
          serverVersion: error.serverVersion,
          serverRow: error.serverRow
        });
        markSync('SAVE_SUCCESS');
        setMutationError('This shipment changed elsewhere. Review the conflicting value before continuing.');
      } else {
        if (navigator.onLine) markSync('SAVE_ERROR');
        setMutationError(error?.message || 'Unable to save this change.');
      }
      throw error;
    }
  }

  function keepServerConflictValue() {
    if (conflict?.serverRow?.id) {
      const serverRow = applyAutomation(conflict.serverRow);
      setRows((old) => old.map((row) => row.id === serverRow.id ? serverRow : row));
    }
    setConflict(null);
    setMutationError('');
    pendingRemoteRef.current = null;
    setPendingRemote(null);
  }

  async function useMyConflictValue() {
    if (!conflict?.serverRow?.id || !conflict.field) return;
    setConflictResolving(true);
    setMutationError('');
    try {
      requireOnline();
      markSync('SAVE_START');
      const proposed = applyAutomation({
        ...conflict.serverRow,
        [conflict.field]: conflict.proposedValue
      });
      const saved = await updateShipmentField(
        proposed,
        conflict.field,
        currentUser,
        { baseVersion: conflict.serverVersion, baseValue: conflict.serverValue },
        { force: true }
      );
      const automated = applyAutomation(saved);
      setRows((old) => old.map((row) => row.id === automated.id ? automated : row));
      setConflict(null);
      pendingRemoteRef.current = null;
      setPendingRemote(null);
      markSync('SAVE_SUCCESS');
    } catch (error) {
      if (navigator.onLine) markSync('SAVE_ERROR');
      setMutationError(error?.message || 'Unable to resolve the conflicting edit.');
    } finally {
      setConflictResolving(false);
    }
  }

  async function handleArchiveRows(ids) {
    setMutationError('');
    try {
      requireOnline();
      markSync('SAVE_START');
      await archiveShipments(ids);
      const archived = new Set(ids);
      setRows((old) => old.filter((row) => !archived.has(row.id)));
      markSync('SAVE_SUCCESS');
    } catch (error) {
      if (navigator.onLine) markSync('SAVE_ERROR');
      setMutationError(error?.message || 'Unable to archive the selected shipment(s).');
      throw error;
    }
  }

  async function handleRestoreRows(ids) {
    setMutationError('');
    try {
      requireOnline();
      markSync('SAVE_START');
      await restoreShipments(ids);
      await Promise.all([refreshData(), refreshArchived()]);
      markSync('SAVE_SUCCESS');
    } catch (error) {
      if (navigator.onLine) markSync('SAVE_ERROR');
      setMutationError(error?.message || 'Unable to restore the shipment.');
      throw error;
    }
  }

  async function handlePermanentDeleteRows(ids) {
    setMutationError('');
    try {
      requireOnline();
      markSync('SAVE_START');
      await permanentlyDeleteShipments(ids);
      const deleted = new Set(ids);
      setArchivedRows((old) => old.filter((row) => !deleted.has(row.id)));
      markSync('SAVE_SUCCESS');
    } catch (error) {
      if (navigator.onLine) markSync('SAVE_ERROR');
      setMutationError(error?.message || 'Unable to permanently delete the shipment.');
      throw error;
    }
  }

  async function openActivity(row) {
    if (!showActivity || !row?.id) return;
    setActivityShipment(row);
    setActivityRows([]);
    setActivityError('');
    setActivityLoading(true);
    try {
      setActivityRows(await loadShipmentActivity(row.id));
    } catch (error) {
      setActivityError(error?.message || 'Unable to load shipment activity.');
    } finally {
      setActivityLoading(false);
    }
  }

  async function handleImport(plan, layoutKey) {
    setMutationError('');
    try {
      requireOnline();
      if (plan.unresolvedConflicts > 0) throw new Error('Review every outdated imported value before syncing.');
      markSync('SAVE_START');
      await persistImportChanges(plan.changes, currentUser);
      const shipmentRows = await loadShipments();
      setRows(shipmentRows.map((row) => applyAutomation(row)));
      setWorkspaceLayouts((old) => ({
        ...old,
        [layoutKey]: { displayOrder: plan.displayOrder, columns: plan.columns }
      }));
      markSync('SAVE_SUCCESS');
    } catch (error) {
      if (navigator.onLine) markSync('SAVE_ERROR');
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
        selectionScopeKey={`${selectedMonth}:${layoutKey}:${search}`}
        searchTargetField={searchResolution.type === 'column' ? searchResolution.field : ''}
        searchTargetLabel={searchResolution.type === 'column' ? searchResolution.label : ''}
        onRowChanged={handleRowChanged}
        onDeleteRows={handleArchiveRows}
        onArchiveRows={handleArchiveRows}
        onEditingChange={handleEditingChange}
        onOpenActivity={showActivity ? openActivity : undefined}
        onImportConfirmed={(plan) => handleImport(plan, layoutKey)}
      />
    );
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div><div className="brand">RELORA</div><div className="subtitle">Shipment & Customs Operations</div></div>
        <div className="topbar-actions">
          <SyncStatus state={syncState} />
          <div className="user-pill">
            <strong>{currentUser.name}</strong>
            <span>{roleLabel(currentUser.role)}{authUser?.email ? ` • ${authUser.email}` : ''}</span>
          </div>
          <button className="password-button" onClick={() => void handlePasswordChangeRequest()}>Password</button>
          <button className="signout-button" onClick={signOut}>Sign Out</button>
        </div>
      </header>

      <nav className="navtabs">
        {showDashboard && <button className={page === 'dashboard' || page === 'dashboard-list' ? 'active' : ''} onClick={() => { setPage('dashboard'); setDashboardList(null); setSearch(''); }}><BarChart3 size={16} /> Dashboard</button>}
        {showMaster && <button className={page === 'shipments' ? 'active' : ''} onClick={() => { setPage('shipments'); setSearch(''); }}><FileSpreadsheet size={16} /> Master Shipments</button>}
        {showTeams && <button className={page === 'team' || page === 'team-workspace' ? 'active' : ''} onClick={() => { setPage('team'); setSelectedWorker(null); setSearch(''); }}><Users size={16} /> Team Workspaces</button>}
        {showArchived && <button className={page === 'archived' ? 'active' : ''} onClick={() => { setPage('archived'); setSearch(''); void refreshArchived(); }}><Archive size={16} /> Archived</button>}
        {currentUser.role === 'employee' && <button className="active" onClick={() => setPage('my-workspace')}><FileSpreadsheet size={16} /> My Workspace</button>}
      </nav>

      <MonthSelector
        value={selectedMonth}
        monthKeys={monthKeys}
        allowAllTime={showDashboard}
        onChange={(value) => { setSelectedMonth(value); setSearch(''); setDashboardList(null); }}
      />

      {accountNotice && <div className="account-notice">{accountNotice}</div>}
      {mutationError && <div className="mutation-error">{mutationError}</div>}
      {pendingRemote && activeEdit && (
        <div className="remote-edit-warning">This shipment changed elsewhere while you were editing. Relora will check the latest server value when you save.</div>
      )}

      {dataStatus === 'loading' && <div className="data-state">Loading your authorized shipment data…</div>}
      {dataStatus === 'error' && <div className="data-state error"><strong>Unable to load data.</strong><br />{dataError}<br /><button className="ghost-button" onClick={() => void refreshData()}>Try again</button></div>}

      {dataStatus === 'ready' && (
        <main>
          {page === 'dashboard' && showDashboard && (
            <ManagementDashboard
              rows={dashboardRows}
              periodLabel={reportingPeriodLabel}
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
            sourceRows: monthScopedRows,
            assignedTo: '',
            assignedUserId: '',
            teamId: '',
            layoutKey: 'master'
          })}

          {page === 'team' && showTeams && (
            <TeamWorkspaces workers={accessibleWorkers} leaders={accessibleLeaders} rows={monthScopedRows} onOpenWorkspace={openTeamWorkspace} />
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

          {page === 'archived' && showArchived && (
            <ArchivedView
              rows={monthScopedArchivedRows}
              currentUser={currentUser}
              onRestore={handleRestoreRows}
              onPermanentDelete={handlePermanentDeleteRows}
              onOpenActivity={showActivity ? openActivity : undefined}
            />
          )}
        </main>
      )}

      <ConflictDialog
        conflict={conflict}
        resolving={conflictResolving}
        onKeepServer={keepServerConflictValue}
        onUseMine={useMyConflictValue}
        onClose={keepServerConflictValue}
      />

      <ActivityPanel
        shipment={activityShipment}
        activities={activityRows}
        loading={activityLoading}
        error={activityError}
        onClose={() => { setActivityShipment(null); setActivityRows([]); setActivityError(''); }}
      />
    </div>
  );
}

export default function App() {
  return (
    <AuthGate>
      {({ currentUser, authUser, signOut, requestPasswordChange }) => (
        <AuthenticatedApp currentUser={currentUser} authUser={authUser} signOut={signOut} requestPasswordChange={requestPasswordChange} />
      )}
    </AuthGate>
  );
}
