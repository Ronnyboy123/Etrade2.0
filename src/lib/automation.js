import { isBlankLike } from './valueSemantics.js';

const DAY_MS = 24 * 60 * 60 * 1000;

function hasValue(value) {
  return !isBlankLike(value);
}

function parseDateOnly(value) {
  if (!hasValue(value)) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return new Date(Date.UTC(value.getFullYear(), value.getMonth(), value.getDate()));
  }

  const text = String(value).trim();
  let match = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (match) {
    const [, y, m, d] = match;
    return new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
  }

  match = text.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
  if (match) {
    const [, m, d, y] = match;
    return new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
  }

  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return null;
  return new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate()));
}

function formatDateOnly(date) {
  if (!date || Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}

export function diffDays(later, earlier) {
  const a = parseDateOnly(later);
  const b = parseDateOnly(earlier);
  if (!a || !b) return 0;
  return Math.round((a.getTime() - b.getTime()) / DAY_MS);
}

export function calculateBocStatus(row = {}) {
  const current = String(row.boc_status || '').trim().toUpperCase();
  if (current === 'EXPORT') return 'EXPORT';
  if (hasValue(row.releasing_date)) return 'RELEASED';
  if (hasValue(row.paid)) return 'PAID';
  if (hasValue(row.assessed)) return 'ASSESSED';
  if (hasValue(row.lodgement)) return 'REGISTERED';
  return 'PENDING';
}

export function calculateWorkflow(row = {}) {
  if (hasValue(row.dispatch)) {
    return { current_stage: 'CLOSED / DISPATCHED', completion: 100, next_action: 'COMPLETE' };
  }
  if (hasValue(row.efile)) {
    return { current_stage: 'EFILE COMPLETED', completion: 96, next_action: 'DISPATCH' };
  }
  if (hasValue(row.billed_date)) {
    return { current_stage: 'BILLING COMPLETED', completion: 93, next_action: 'COMPLETE EFILE' };
  }
  if (hasValue(row.received_folder)) {
    return { current_stage: 'FOLDER RECEIVED', completion: 86, next_action: 'COMPLETE BILLING' };
  }
  if (hasValue(row.endorsement_to_biller)) {
    return { current_stage: 'ENDORSED TO BILLER', completion: 79, next_action: 'RECEIVE FOLDER / BILLING' };
  }
  if (hasValue(row.liquidation_tl)) {
    return { current_stage: 'LIQUIDATION - TL', completion: 71, next_action: 'ENDORSE TO BILLER' };
  }
  if (hasValue(row.liquidation_processor)) {
    return { current_stage: 'LIQUIDATION - PROCESSOR', completion: 64, next_action: 'TL LIQUIDATION REVIEW' };
  }
  if (hasValue(row.releasing_date)) {
    return { current_stage: 'CARGO RELEASED', completion: 57, next_action: 'SEND TO LIQUIDATION PROCESSOR' };
  }
  if (hasValue(row.paid)) {
    return { current_stage: 'PAID / FOR RELEASE', completion: 50, next_action: 'FOLLOW CARGO RELEASE' };
  }
  if (hasValue(row.assessed)) {
    return { current_stage: 'ASSESSED / FAN', completion: 43, next_action: 'PROCESS / FOLLOW PAYMENT' };
  }
  if (hasValue(row.lodgement)) {
    return { current_stage: 'LODGED', completion: 36, next_action: 'FOLLOW ASSESSMENT / FAN' };
  }
  if (hasValue(row.ata)) {
    return { current_stage: 'ARRIVED', completion: 29, next_action: 'LODGE DECLARATION' };
  }
  if (hasValue(row.dt_computation)) {
    return { current_stage: 'DT COMPUTED', completion: 21, next_action: 'MONITOR ARRIVAL / LODGEMENT' };
  }
  if (hasValue(row.pre_alert_shipping_documents)) {
    return { current_stage: 'PRE-ALERT RECEIVED', completion: 14, next_action: 'COMPLETE DUTY & TAX COMPUTATION' };
  }
  return { current_stage: 'PRE-ARRIVAL', completion: 0, next_action: 'RECEIVE PRE-ALERT DOCUMENTS' };
}

export function calculateTimelineMetrics(row = {}) {
  return {
    timeline_duty_tax: diffDays(row.dt_computation, row.eta),
    // Confirmed rule: Lodgement is measured from Validated Manifest Date, not ATA.
    timeline_lodgement: diffDays(row.lodgement, row.validated_manifest_date),
    timeline_fan: diffDays(row.assessed, row.ata),
    timeline_cargo_releasing: diffDays(row.releasing_date, row.ata),
    timeline_liquidation: diffDays(row.liquidation_processor, row.releasing_date),
    timeline_liquidation_tl: diffDays(row.liquidation_tl, row.liquidation_processor),
    timeline_billing: diffDays(row.dispatch, row.releasing_date),
    timeline_closing: diffDays(row.dispatch, row.releasing_date)
  };
}

function latestMilestoneDate(row = {}) {
  const fields = [
    'pre_alert_shipping_documents',
    'validated_manifest_date',
    'dt_computation',
    'eta',
    'ata',
    'lodgement',
    'assessed',
    'paid',
    'portal_submission',
    'releasing_date',
    'liquidation_processor',
    'liquidation_tl',
    'endorsement_to_biller',
    'received_folder',
    'billed_date',
    'dispatch'
  ];

  const dates = fields
    .map((field) => parseDateOnly(row[field]))
    .filter(Boolean)
    .sort((a, b) => b.getTime() - a.getTime());

  return dates.length ? formatDateOnly(dates[0]) : '';
}

function calculateDaysOpen(row, todayValue) {
  const start = parseDateOnly(row.validated_manifest_date);
  if (!start) return 0;
  const end = parseDateOnly(row.dispatch) || parseDateOnly(todayValue) || new Date();
  return Math.max(0, Math.round((end.getTime() - start.getTime()) / DAY_MS));
}

function calculateTimelineStatus(row, metrics, todayValue) {
  if (hasValue(row.dispatch)) return 'CLOSED';

  // Completed SLA breaches based on the targets visible in the source workbook.
  if (hasValue(row.lodgement) && hasValue(row.validated_manifest_date) && metrics.timeline_lodgement > 1) {
    return 'DELAYED';
  }
  if (hasValue(row.dispatch) && hasValue(row.releasing_date) && metrics.timeline_billing > 5) {
    return 'DELAYED';
  }

  const today = parseDateOnly(todayValue) || new Date();
  const validated = parseDateOnly(row.validated_manifest_date);
  const released = parseDateOnly(row.releasing_date);

  if (validated && !hasValue(row.lodgement)) {
    const elapsed = Math.round((today.getTime() - validated.getTime()) / DAY_MS);
    if (elapsed > 1) return 'ACTION DUE';
  }

  if (released && !hasValue(row.dispatch)) {
    const elapsed = Math.round((today.getTime() - released.getTime()) / DAY_MS);
    if (elapsed > 10) return 'DELAYED';
    if (elapsed > 5) return 'ACTION DUE';
  }

  return 'ON TRACK';
}

function autoRemark(row, status, workflow, metrics) {
  if (hasValue(row.delay_action_remarks)) return row.delay_action_remarks;
  if (status === 'CLOSED') return 'Shipment completed / dispatched.';
  if (metrics.timeline_lodgement > 1) return 'Lodgement exceeded the 1-day target from validated manifest.';
  if (status === 'ACTION DUE') return `${workflow.next_action} is due.`;
  if (status === 'DELAYED') return `${workflow.next_action} requires follow-up.`;
  return 'Shipment is within the current target timeline.';
}

export function applyAutomation(row = {}, todayValue = new Date()) {
  const metrics = calculateTimelineMetrics(row);
  const workflow = calculateWorkflow(row);
  const bocStatus = calculateBocStatus(row);
  const overallStatus = calculateTimelineStatus(row, metrics, todayValue);

  return {
    ...row,
    ...metrics,
    ...workflow,
    boc_status: bocStatus,
    overall_status: overallStatus,
    days_open: calculateDaysOpen(row, todayValue),
    last_milestone_date: latestMilestoneDate(row),
    delay_action_remarks: autoRemark(row, overallStatus, workflow, metrics)
  };
}
