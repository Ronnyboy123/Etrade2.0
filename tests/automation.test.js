import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateBocStatus,
  calculateTimelineMetrics,
  calculateWorkflow,
  applyAutomation
} from '../src/lib/automation.js';

test('BOC status follows customs milestones in order', () => {
  assert.equal(calculateBocStatus({}), 'PENDING');
  assert.equal(calculateBocStatus({ lodgement: '2026-08-10' }), 'REGISTERED');
  assert.equal(calculateBocStatus({ lodgement: '2026-08-10', assessed: '2026-08-11' }), 'ASSESSED');
  assert.equal(calculateBocStatus({ lodgement: '2026-08-10', assessed: '2026-08-11', paid: '2026-08-12' }), 'PAID');
  assert.equal(calculateBocStatus({ lodgement: '2026-08-10', assessed: '2026-08-11', paid: '2026-08-12', releasing_date: '2026-08-13' }), 'RELEASED');
});

test('BOC EXPORT special status is preserved', () => {
  assert.equal(calculateBocStatus({ boc_status: 'EXPORT' }), 'EXPORT');
});

test('lodgement lead time is calculated from validated manifest date, not ATA', () => {
  const metrics = calculateTimelineMetrics({
    validated_manifest_date: '2026-08-01',
    ata: '2026-08-10',
    lodgement: '2026-08-03'
  });
  assert.equal(metrics.timeline_lodgement, 2);
});

test('workflow provides a next action from the current milestone', () => {
  assert.deepEqual(calculateWorkflow({ lodgement: '2026-08-10' }), {
    current_stage: 'LODGED',
    completion: 36,
    next_action: 'FOLLOW ASSESSMENT / FAN'
  });

  assert.deepEqual(calculateWorkflow({
    lodgement: '2026-08-10',
    assessed: '2026-08-11',
    paid: '2026-08-12',
    releasing_date: '2026-08-13',
    liquidation_processor: '2026-08-14'
  }), {
    current_stage: 'LIQUIDATION - PROCESSOR',
    completion: 64,
    next_action: 'TL LIQUIDATION REVIEW'
  });
});

test('applyAutomation adds BOC status and calculated workflow fields', () => {
  const result = applyAutomation({
    validated_manifest_date: '2026-08-01',
    lodgement: '2026-08-02',
    assessed: '2026-08-03'
  }, '2026-08-04');

  assert.equal(result.boc_status, 'ASSESSED');
  assert.equal(result.current_stage, 'ASSESSED / FAN');
  assert.equal(result.next_action, 'PROCESS / FOLLOW PAYMENT');
  assert.equal(result.timeline_lodgement, 1);
});
