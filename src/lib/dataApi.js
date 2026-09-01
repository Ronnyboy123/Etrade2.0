import { profileToAppUser } from './auth.js';
import { isBlankLike } from './valueSemantics.js';

const CUSTOM_PREFIX = 'custom__';

const DB_FIELDS = new Set([
  'shipment_code','assigned_user_id','assigned_to','team_id','service_month','job_file_number','customer','shipper','mode',
  'house_awb_bl','master_awb_bl','pre_alert_shipping_documents','eta','cw_air_cbm_lcl','number_of_container','description',
  'dt_computation','week_no','fundcast','ata','port_of_entry','location_of_goods','lodgement','assessed','paid','entry_no',
  'selectivity_color','portal_submission','broker_representative','portal_ticket_efile','releasing_date','liquidation_processor',
  'liquidation_tl','endorsement_to_biller','team_leader','customs_declarant','received_folder','billed_date','efile','dispatch',
  'validated_manifest_date','current_stage','completion','next_action','overall_status','boc_status','days_open','last_milestone_date',
  'delay_action_remarks','timeline_duty_tax','timeline_lodgement','timeline_fan','timeline_cargo_releasing','timeline_liquidation',
  'timeline_liquidation_tl','timeline_billing','timeline_closing','custom_fields'
]);

export const DATE_FIELDS = new Set([
  'pre_alert_shipping_documents','eta','dt_computation','ata','lodgement','assessed','paid','portal_submission','releasing_date',
  'liquidation_processor','liquidation_tl','endorsement_to_biller','received_folder','billed_date','dispatch',
  'validated_manifest_date','last_milestone_date'
]);

const NUMERIC_FIELDS = new Set([
  'cw_air_cbm_lcl','number_of_container','week_no','completion','days_open','timeline_duty_tax','timeline_lodgement','timeline_fan',
  'timeline_cargo_releasing','timeline_liquidation','timeline_liquidation_tl','timeline_billing','timeline_closing'
]);

const AUTOMATION_PATCH_FIELDS = [
  'current_stage','completion','next_action','overall_status','boc_status','days_open','last_milestone_date',
  'delay_action_remarks','timeline_duty_tax','timeline_lodgement','timeline_fan','timeline_cargo_releasing','timeline_liquidation',
  'timeline_liquidation_tl','timeline_billing','timeline_closing'
];

async function requireSupabase() {
  const { supabase } = await import('./supabase.js');
  if (!supabase) throw new Error('Supabase is not configured. Add the VITE_SUPABASE_URL and public key environment variables.');
  return supabase;
}

function blankToNull(value) {
  return value === '' || value === undefined || value === null ? null : value;
}

function pad2(value) {
  return String(value).padStart(2, '0');
}

function formatCalendarDate(year, month, day) {
  const date = new Date(year, month - 1, day);
  if (
    Number.isNaN(date.getTime()) ||
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) return null;
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

function inferredYear(row = {}) {
  const serviceMonth = String(row.service_month ?? '').trim();
  const compact = serviceMonth.match(/^(\d{4})(?:0[1-9]|1[0-2])$/);
  if (compact) return Number(compact[1]);

  const explicit = serviceMonth.match(/\b(20\d{2}|19\d{2})\b/);
  if (explicit) return Number(explicit[1]);

  for (const field of DATE_FIELDS) {
    const value = row[field];
    if (value instanceof Date && !Number.isNaN(value.getTime())) return value.getFullYear();
    const match = String(value ?? '').match(/^(20\d{2}|19\d{2})[-/]/);
    if (match) return Number(match[1]);
  }

  return new Date().getFullYear();
}

const MONTHS = new Map([
  ['jan', 1], ['feb', 2], ['mar', 3], ['apr', 4], ['may', 5], ['jun', 6],
  ['jul', 7], ['aug', 8], ['sep', 9], ['sept', 9], ['oct', 10], ['nov', 11], ['dec', 12]
]);

export function normalizeDateValue(value, row = {}) {
  if (isBlankLike(value)) return null;
  const normalized = value;

  if (normalized instanceof Date) {
    if (Number.isNaN(normalized.getTime())) return null;
    return formatCalendarDate(
      normalized.getFullYear(),
      normalized.getMonth() + 1,
      normalized.getDate()
    );
  }

  const text = String(normalized).trim();

  const iso = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s].*)?$/);
  if (iso) return formatCalendarDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));

  const slash = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (slash) return formatCalendarDate(Number(slash[3]), Number(slash[2]), Number(slash[1]));

  const named = text.match(/^(\d{1,2})[-\s]([A-Za-z]{3,4})(?:[-\s](\d{2}|\d{4}))?$/);
  if (named) {
    const month = MONTHS.get(named[2].toLowerCase());
    if (!month) return null;
    let year = named[3] ? Number(named[3]) : inferredYear(row);
    if (year < 100) year += year >= 70 ? 1900 : 2000;
    return formatCalendarDate(year, month, Number(named[1]));
  }

  return null;
}

function numericValue(value) {
  const normalized = blankToNull(value);
  if (normalized === null) return null;
  const number = Number(normalized);
  return Number.isFinite(number) ? number : null;
}

function safeCodePart(value) {
  return String(value ?? '').trim().replace(/\s+/g, '-').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40);
}

export function makeShipmentCode(row) {
  if (String(row?.shipment_code || '').trim()) return String(row.shipment_code).trim();
  const job = String(row?.job_file_number || '').trim();
  if (job && !['TBA','TBD','N/A','NA','-'].includes(job.toUpperCase())) return job;
  const entry = String(row?.entry_no || '').trim();
  if (entry) return `ENTRY-${safeCodePart(entry)}`;
  const house = String(row?.house_awb_bl || '').trim();
  if (house) return `BL-${safeCodePart(house)}`;
  const uuid = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return `WEB-${uuid}`;
}

export function flattenShipmentRow(row) {
  if (!row) return row;
  const custom = row.custom_fields && typeof row.custom_fields === 'object' ? row.custom_fields : {};
  const { custom_fields, ...base } = row;
  return { ...base, ...custom };
}

export function serializeFieldValue(field, value, row = {}) {
  if (field?.startsWith(CUSTOM_PREFIX)) return value === undefined ? null : value;
  if (DATE_FIELDS.has(field)) return normalizeDateValue(value, row);
  if (NUMERIC_FIELDS.has(field)) return numericValue(value);
  return value === undefined ? null : value;
}

export function buildAutomationPatch(row = {}) {
  return Object.fromEntries(
    AUTOMATION_PATCH_FIELDS
      .filter((field) => Object.prototype.hasOwnProperty.call(row, field))
      .map((field) => [field, serializeFieldValue(field, row[field], row)])
  );
}

export function serializeShipmentRow(row) {
  const payload = {};
  const customFields = {};

  for (const [field, value] of Object.entries(row || {})) {
    if (field === 'id' || field === 'created_at' || field === 'updated_at' || field === 'version' || field === 'archived_at' || field === 'archived_by') continue;
    if (field.startsWith(CUSTOM_PREFIX)) {
      customFields[field] = value;
      continue;
    }
    if (!DB_FIELDS.has(field) || field === 'custom_fields') continue;
    payload[field] = serializeFieldValue(field, value, row);
  }

  payload.shipment_code = makeShipmentCode(row || payload);
  payload.custom_fields = {
    ...(row?.custom_fields && typeof row.custom_fields === 'object' ? row.custom_fields : {}),
    ...customFields
  };
  return payload;
}

export class ShipmentConflictError extends Error {
  constructor(result, context = {}) {
    super('This shipment changed elsewhere while you were editing.');
    this.name = 'ShipmentConflictError';
    this.field = context.field || '';
    this.baseValue = context.baseValue;
    this.proposedValue = context.proposedValue;
    this.serverValue = result?.current_value;
    this.serverVersion = result?.server_version;
    this.serverRow = flattenShipmentRow(result?.row || null);
  }
}

export function isShipmentConflictResult(result) {
  return result?.status === 'conflict';
}

export async function loadVisibleProfiles() {
  const client = await requireSupabase();
  const { data, error } = await client
    .from('profiles')
    .select('id,email,full_name,role,declarant_name,team_id,is_active')
    .eq('is_active', true)
    .order('full_name', { ascending: true });
  if (error) throw error;
  return (data || []).map(profileToAppUser);
}

export async function loadShipments() {
  const client = await requireSupabase();
  const { data, error } = await client
    .from('shipments')
    .select('*')
    .is('archived_at', null)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []).map(flattenShipmentRow);
}

export async function loadArchivedShipments() {
  const client = await requireSupabase();
  const { data, error } = await client
    .from('shipments')
    .select('*')
    .not('archived_at', 'is', null)
    .order('archived_at', { ascending: false });
  if (error) throw error;
  return (data || []).map(flattenShipmentRow);
}

export async function insertShipment(row) {
  const client = await requireSupabase();
  const payload = serializeShipmentRow(row);
  const { data, error } = await client.rpc('create_shipment', { p_row: payload });
  if (error) throw error;
  return flattenShipmentRow(data);
}

export async function updateShipmentField(row, changedField, currentUser, editContext = {}, options = {}) {
  const client = await requireSupabase();
  if (!row?.id) throw new Error('Cannot update a shipment without a database id.');
  if (!changedField) throw new Error('Cannot update a shipment without a field name.');

  const proposedValue = serializeFieldValue(changedField, row[changedField], row);
  const baseValue = serializeFieldValue(changedField, editContext.baseValue, row);
  const { data, error } = await client.rpc('update_shipment_field', {
    p_shipment_id: row.id,
    p_field_name: changedField,
    p_new_value: proposedValue,
    p_base_version: Number(editContext.baseVersion ?? row.version ?? 1),
    p_base_value: baseValue,
    p_force: Boolean(options.force),
    p_derived: buildAutomationPatch(row)
  });

  if (error) throw error;
  if (isShipmentConflictResult(data)) {
    throw new ShipmentConflictError(data, {
      field: changedField,
      baseValue: editContext.baseValue,
      proposedValue: row[changedField]
    });
  }
  return flattenShipmentRow(data?.row || data);
}

// Compatibility wrapper for existing callers during the v9 transition.
export async function updateShipment(row, changedField, currentUser, editContext = {}) {
  return updateShipmentField(row, changedField, currentUser, editContext);
}

export async function archiveShipments(ids) {
  const client = await requireSupabase();
  const cleanIds = (ids || []).filter(Boolean);
  if (!cleanIds.length) return 0;
  const { data, error } = await client.rpc('archive_shipments', { p_ids: cleanIds });
  if (error) throw error;
  return Number(data || 0);
}

export async function restoreShipments(ids) {
  const client = await requireSupabase();
  const cleanIds = (ids || []).filter(Boolean);
  if (!cleanIds.length) return 0;
  const { data, error } = await client.rpc('restore_shipments', { p_ids: cleanIds });
  if (error) throw error;
  return Number(data || 0);
}

export async function permanentlyDeleteShipments(ids) {
  const client = await requireSupabase();
  const cleanIds = (ids || []).filter(Boolean);
  if (!cleanIds.length) return 0;
  const { data, error } = await client.rpc('admin_delete_shipments', { p_ids: cleanIds });
  if (error) throw error;
  return Number(data || 0);
}

// v8 name retained only so older components fail safe into Archive rather than Delete.
export async function deleteShipments(ids) {
  return archiveShipments(ids);
}

export async function loadShipmentActivity(shipmentId) {
  const client = await requireSupabase();
  const { data, error } = await client
    .from('shipment_activity')
    .select('id,shipment_id,changed_by,action_type,actor_email,actor_name,field_name,old_value,new_value,source,created_at')
    .eq('shipment_id', shipmentId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export function prepareImportPayloads(changes) {
  return (changes || [])
    .filter((change) => change && !['conflict', 'skip', 'archived_match'].includes(change.type) && change.row)
    .map((change) => {
      const payload = serializeShipmentRow(change.row);
      payload._relora_import_intent = change.type;
      if (['update', 'restore_update'].includes(change.type) && Number.isFinite(Number(change.row?.version))) {
        payload._relora_expected_version = Number(change.row.version);
      }
      return payload;
    });
}

export async function persistImportChanges(changes, currentUser) {
  const client = await requireSupabase();
  const payloads = prepareImportPayloads(changes);
  if (!payloads.length) return [];

  const { data, error } = await client.rpc('persist_import_batch', { p_rows: payloads });
  if (error) {
    if (error.code === '23505' || /duplicate key value/i.test(error.message || '')) {
      throw new Error('A shipment with the same unique shipment code already exists. Refresh the data and retry the import.');
    }
    throw error;
  }

  return (data || []).map(flattenShipmentRow);
}
