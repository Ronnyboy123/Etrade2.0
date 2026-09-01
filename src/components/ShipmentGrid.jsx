import { useEffect, useMemo, useRef, useState } from 'react';
import { AgGridReact } from 'ag-grid-react';
import { AllCommunityModule, ModuleRegistry, themeQuartz } from 'ag-grid-community';
import { AUTOMATED_FIELDS, FIELD_DEFINITIONS } from '../lib/importer.js';
import { buildDisplaySegments, GROUP_META } from '../lib/columnLayout.js';
import {
  getSpreadsheetRowNumber,
  getSelectionState,
  toggleAllVisibleIds,
  toggleSelectedId
} from '../lib/selection.js';
import { applyAutomation } from '../lib/automation.js';
import { canEditField, canViewActivity } from '../lib/access.js';

ModuleRegistry.registerModules([AllCommunityModule]);

const DATE_FIELDS = new Set([
  'validated_manifest_date','last_milestone_date','pre_alert_shipping_documents','eta',
  'dt_computation','ata','lodgement','assessed','paid','portal_submission',
  'releasing_date','liquidation_processor','liquidation_tl','endorsement_to_biller',
  'received_folder','billed_date','dispatch'
]);

const STANDARD_ORDER = [
  'service_month','job_file_number','customer','shipper','mode','house_awb_bl','master_awb_bl',
  'pre_alert_shipping_documents','eta','cw_air_cbm_lcl','number_of_container','description',
  'dt_computation','week_no','fundcast','ata','port_of_entry','validated_manifest_date','location_of_goods','lodgement',
  'assessed','paid','entry_no','selectivity_color','portal_submission','broker_representative',
  'portal_ticket_efile','releasing_date','liquidation_processor','liquidation_tl','endorsement_to_biller',
  'team_leader','customs_declarant','received_folder','billed_date','efile','dispatch',
  'timeline_duty_tax','timeline_lodgement','timeline_fan','timeline_cargo_releasing',
  'timeline_liquidation','timeline_liquidation_tl','timeline_billing','timeline_closing'
];

function CompletionRenderer({ value }) {
  const percentage = Math.max(0, Math.min(100, Number(value || 0)));
  return <div className="completion-cell"><div className="completion-track"><div className="completion-fill" style={{ width: `${percentage}%` }} /></div><span>{percentage}%</span></div>;
}

function StatusRenderer({ value }) {
  const status = String(value || '').toUpperCase();
  return <span className={`status-badge status-${status.replace(/\s+/g, '-').toLowerCase()}`}>{value || '—'}</span>;
}

function SelectivityRenderer({ value }) {
  const label = String(value || '').toUpperCase();
  return <span className={`selectivity-badge selectivity-${label.toLowerCase()}`}>{value || '—'}</span>;
}

function Checkbox({ checked, indeterminate = false, onChange, ariaLabel }) {
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate;
  }, [indeterminate]);
  return (
    <input
      ref={ref}
      className="shipment-checkbox"
      type="checkbox"
      checked={checked}
      onChange={(event) => onChange(event.target.checked)}
      aria-label={ariaLabel}
    />
  );
}

function fieldMeta(field, importMeta) {
  if (FIELD_DEFINITIONS[field]) return FIELD_DEFINITIONS[field];
  return importMeta.get(field) || { label: field.replace(/^custom__/, '').replaceAll('_', ' '), group: 'imported' };
}

function makeColumn(field, importMeta, currentUser) {
  const meta = fieldMeta(field, importMeta);
  const group = meta.group || 'imported';
  const autoEditable = ['delay_action_remarks', 'boc_status'].includes(field);
  const column = {
    field,
    headerName: meta.label,
    headerClass: `col-${group}`,
    editable: (params) => {
      if (group === 'auto' && !autoEditable) return false;
      return canEditField(currentUser, field, params.data);
    },
    cellClassRules: {
      'cell-readonly': (params) => {
        if (group === 'auto' && !autoEditable) return true;
        return !canEditField(currentUser, field, params.data);
      },
      'cell-manual-edit': (params) => {
        if (group === 'auto' && !autoEditable) return false;
        return canEditField(currentUser, field, params.data);
      }
    },
    minWidth: field === 'delay_action_remarks' ? 235 : 135
  };

  if (DATE_FIELDS.has(field)) {
    column.filter = 'agDateColumnFilter';
    column.cellEditor = 'agDateStringCellEditor';
  }
  if (field === 'completion') { column.cellRenderer = CompletionRenderer; column.minWidth = 135; }
  if (field === 'overall_status' || field === 'boc_status') { column.cellRenderer = StatusRenderer; column.minWidth = 145; }
  if (field === 'boc_status') {
    column.cellEditor = 'agSelectCellEditor';
    column.cellEditorParams = { values: ['PENDING', 'REGISTERED', 'ASSESSED', 'PAID', 'RELEASED', 'EXPORT'] };
  }
  if (field === 'selectivity_color') column.cellRenderer = SelectivityRenderer;
  if (field === 'days_open' || field === 'number_of_container' || field === 'week_no') column.type = 'numericColumn';
  return column;
}

function makeGroup(groupKey, fields, importMeta, currentUser, keySuffix = '') {
  const meta = GROUP_META[groupKey] || GROUP_META.imported;
  return {
    headerName: meta.label,
    headerClass: meta.className,
    marryChildren: true,
    groupId: `${groupKey}-${keySuffix || fields[0]}`,
    children: fields.map((field) => makeColumn(field, importMeta, currentUser))
  };
}

export default function ShipmentGrid({
  rows,
  setRows,
  layout,
  searchTargetField,
  currentUser,
  selectedIds,
  setSelectedIds,
  allowSelection = true,
  onDisplayedIdsChange,
  onRowChanged,
  onEditingChange,
  onOpenActivity
}) {
  const gridApiRef = useRef(null);
  const editContextRef = useRef(new Map());
  const [gridReadyVersion, setGridReadyVersion] = useState(0);
  const [displayedIds, setDisplayedIds] = useState(rows.map((row) => row.id));

  const importMeta = useMemo(() => new Map((layout?.columns || []).map((column) => [column.field, column])), [layout]);
  const selectionState = getSelectionState(selectedIds, displayedIds);

  function syncDisplayedIds(api = gridApiRef.current) {
    if (!api) return;
    const ids = [];
    api.forEachNodeAfterFilterAndSort((node) => { if (node.data?.id) ids.push(node.data.id); });
    setDisplayedIds(ids);
    onDisplayedIdsChange?.(ids);
  }

  useEffect(() => {
    syncDisplayedIds();
  }, [rows]);

  useEffect(() => {
    gridApiRef.current?.redrawRows();
  }, [selectedIds]);

  const columnDefs = useMemo(() => {
    const automated = makeGroup('auto', AUTOMATED_FIELDS, importMeta, currentUser, 'fixed');
    const requestedOrder = layout?.displayOrder?.length ? [...layout.displayOrder] : [...STANDARD_ORDER];
    if (!requestedOrder.includes('validated_manifest_date')) {
      const lodgementIndex = requestedOrder.indexOf('lodgement');
      requestedOrder.splice(lodgementIndex >= 0 ? lodgementIndex : 0, 0, 'validated_manifest_date');
    }
    const segments = buildDisplaySegments(requestedOrder, layout?.columns || []);

    const leading = [];
    if (allowSelection) {
      leading.push({
        colId: 'explicitSelection',
        headerName: '',
        editable: false,
        sortable: false,
        filter: false,
        resizable: false,
        pinned: 'left',
        lockPinned: true,
        lockPosition: 'left',
        suppressMovable: true,
        width: 52,
        minWidth: 52,
        maxWidth: 52,
        headerClass: 'selection-header custom-selection-header',
        cellClass: 'selection-cell custom-selection-cell',
        headerComponent: () => (
          <Checkbox
            checked={selectionState.checked}
            indeterminate={selectionState.indeterminate}
            ariaLabel="Select all visible shipments"
            onChange={(checked) => setSelectedIds(toggleAllVisibleIds(selectedIds, displayedIds, checked))}
          />
        ),
        cellRenderer: (params) => (
          <Checkbox
            checked={selectedIds.includes(params.data.id)}
            ariaLabel={`Select shipment ${params.data.job_file_number || params.data.id}`}
            onChange={() => setSelectedIds(toggleSelectedId(selectedIds, params.data.id))}
          />
        )
      });
    }

    if (canViewActivity(currentUser) && onOpenActivity) {
      leading.push({
        colId: 'historyAction',
        headerName: 'History',
        editable: false,
        sortable: false,
        filter: false,
        resizable: false,
        pinned: 'left',
        lockPinned: true,
        suppressMovable: true,
        width: 88,
        minWidth: 88,
        maxWidth: 88,
        cellRenderer: (params) => (
          <button className="grid-history-button" onClick={() => onOpenActivity(params.data)}>History</button>
        )
      });
    }

    leading.push({
      colId: 'rowNumber',
      headerName: '#',
      valueGetter: (params) => getSpreadsheetRowNumber(params.node.rowIndex),
      editable: false,
      sortable: false,
      filter: false,
      resizable: false,
      pinned: 'left',
      lockPinned: true,
      lockPosition: 'left',
      suppressMovable: true,
      width: 58,
      minWidth: 58,
      maxWidth: 58,
      headerClass: 'row-number-header',
      cellClass: 'row-number-cell'
    });

    return [
      ...leading,
      automated,
      ...segments.map((segment, index) => makeGroup(segment.group, segment.fields, importMeta, currentUser, String(index)))
    ];
  }, [importMeta, layout, currentUser, allowSelection, selectedIds, displayedIds, selectionState.checked, selectionState.indeterminate, onOpenActivity]);

  const defaultColDef = useMemo(() => ({
    editable: true,
    sortable: true,
    filter: true,
    resizable: true,
    minWidth: 125,
    wrapHeaderText: true,
    autoHeaderHeight: true,
    enableCellChangeFlash: true
  }), []);

  useEffect(() => {
    const api = gridApiRef.current;
    if (!api || !searchTargetField) return;
    try {
      api.ensureColumnVisible(searchTargetField, 'middle');
      api.flashCells({ columns: [searchTargetField], flashDuration: 900, fadeDuration: 700 });
    } catch {
      // Column is not part of this workspace layout.
    }
  }, [searchTargetField, gridReadyVersion]);

  function editKey(rowId, field) {
    return `${rowId || ''}:${field || ''}`;
  }

  function handleCellEditingStarted(event) {
    const field = event.colDef?.field || '';
    const editContext = {
      rowId: event.data?.id,
      field,
      baseValue: event.value,
      baseVersion: Number(event.data?.version ?? 1)
    };
    editContextRef.current.set(editKey(editContext.rowId, field), editContext);
    onEditingChange?.(editContext);
  }

  function handleCellEditingStopped(event) {
    onEditingChange?.(null);
    const key = editKey(event.data?.id, event.colDef?.field || '');
    setTimeout(() => editContextRef.current.delete(key), 0);
  }

  async function onCellValueChanged(event) {
    const field = event.colDef?.field || '';
    const found = rows.find((row) => row.id === event.data?.id);
    const previous = found ? { ...found, [field]: event.oldValue } : null;
    const key = editKey(event.data?.id, field);
    const editContext = editContextRef.current.get(key) || {
      rowId: event.data?.id,
      field,
      baseValue: event.oldValue,
      baseVersion: Number(previous?.version ?? event.data?.version ?? 1)
    };
    const automated = applyAutomation(event.data);
    event.api.applyTransaction({ update: [automated] });

    if (!onRowChanged) {
      setRows((old) => old.map((row) => (row.id === automated.id ? automated : row)));
      editContextRef.current.delete(key);
      return;
    }

    try {
      const saved = await onRowChanged(automated, event.colDef?.field || '', editContext);
      if (saved) event.api.applyTransaction({ update: [saved] });
    } catch {
      if (previous) {
        event.api.applyTransaction({ update: [previous] });
        setRows((old) => old.map((row) => (row.id === previous.id ? previous : row)));
      }
    } finally {
      editContextRef.current.delete(key);
    }
  }

  return (
    <div className="grid-wrap">
      <AgGridReact
        theme={themeQuartz}
        onGridReady={(event) => {
          gridApiRef.current = event.api;
          setGridReadyVersion((v) => v + 1);
          syncDisplayedIds(event.api);
        }}
        rowData={rows}
        columnDefs={columnDefs}
        defaultColDef={defaultColDef}
        onCellEditingStarted={handleCellEditingStarted}
        onCellEditingStopped={handleCellEditingStopped}
        onCellValueChanged={onCellValueChanged}
        onFilterChanged={(event) => {
          syncDisplayedIds(event.api);
          event.api.refreshCells({ columns: ['rowNumber'], force: true });
        }}
        onSortChanged={(event) => {
          syncDisplayedIds(event.api);
          event.api.refreshCells({ columns: ['rowNumber'], force: true });
        }}
        getRowClass={(params) => selectedIds.includes(params.data?.id) ? 'explicit-selected-row' : ''}
        animateRows
        pagination
        paginationPageSize={20}
        getRowId={(params) => params.data.id}
        rowHeight={42}
        headerHeight={58}
        groupHeaderHeight={34}
      />
    </div>
  );
}
