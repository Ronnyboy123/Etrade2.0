import { profileToAppUser } from './auth.js';

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

const DATE_FIELDS = new Set([
  'pre_alert_shipping_documents','eta','dt_computation','ata','lodgement','assessed','paid','portal_submission','releasing_date',
  'liquidation_processor','liquidation_tl','endorsement_to_biller','received_folder','billed_date','dispatch',
  'validated_manifest_date','last_milestone_date'
]);

const NUMERIC_FIELDS = new Set([
  'cw_air_cbm_lcl','number_of_container','week_no','completion','days_open','timeline_duty_tax','timeline_lodgement','timeline_fan',
  'timeline_cargo_releasing','timeline_liquidation','timeline_liquidation_tl','timeline_billing','timeline_closing'
]);

async function requireSupabase() {
  const { supabase } = await import('./supabase.js');
  if (!supabase) throw new Error('Supabase is not configured. Add the VITE_SUPABASE_URL and public key environment variables.');
  return supabase;
}

function blankToNull(value) {
  return value === '' || value === undefined || value === null ? null : value;
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

export function serializeShipmentRow(row) {
  const payload = {};
  const customFields = {};

  for (const [field, value] of Object.entries(row || {})) {
    if (field === 'id' || field === 'created_at' || field === 'updated_at') continue;
    if (field.startsWith(CUSTOM_PREFIX)) {
      customFields[field] = value;
      continue;
    }
    if (!DB_FIELDS.has(field) || field === 'custom_fields') continue;
    if (DATE_FIELDS.has(field)) payload[field] = blankToNull(value);
    else if (NUMERIC_FIELDS.has(field)) payload[field] = numericValue(value);
    else payload[field] = value === undefined ? null : value;
  }

  payload.shipment_code = makeShipmentCode(row || payload);
  payload.custom_fields = {
    ...(row?.custom_fields && typeof row.custom_fields === 'object' ? row.custom_fields : {}),
    ...customFields
  };
  return payload;
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
  const { data, error } = await client.from('shipments').select('*').order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []).map(flattenShipmentRow);
}

export async function insertShipment(row) {
  const client = await requireSupabase();
  const payload = serializeShipmentRow(row);
  const { data, error } = await client.from('shipments').insert(payload).select().single();
  if (error) throw error;
  return flattenShipmentRow(data);
}

export async function updateShipment(row, changedField, currentUser) {
  const client = await requireSupabase();
  if (!row?.id) throw new Error('Cannot update a shipment without a database id.');

  if (currentUser?.role === 'portal') {
    const { error } = await client.rpc('update_portal_fields', {
      p_shipment_id: row.id,
      p_portal_submission: blankToNull(row.portal_submission),
      p_broker_representative: row.broker_representative || null,
      p_portal_ticket_efile: row.portal_ticket_efile || null
    });
    if (error) throw error;
    const { data, error: readError } = await client.from('shipments').select('*').eq('id', row.id).single();
    if (readError) throw readError;
    return flattenShipmentRow(data);
  }

  const payload = serializeShipmentRow(row);
  const { data, error } = await client.from('shipments').update(payload).eq('id', row.id).select().single();
  if (error) throw error;
  return flattenShipmentRow(data);
}

export async function deleteShipments(ids) {
  const client = await requireSupabase();
  const cleanIds = (ids || []).filter(Boolean);
  if (!cleanIds.length) return;
  const { error } = await client.from('shipments').delete().in('id', cleanIds);
  if (error) throw error;
}

export async function persistImportChanges(changes, currentUser) {
  const persisted = [];
  for (const change of changes || []) {
    if (change.type === 'conflict') continue;
    if (change.type === 'create') persisted.push(await insertShipment(change.row));
    if (change.type === 'update') persisted.push(await updateShipment(change.row, '', currentUser));
  }
  return persisted;
}
