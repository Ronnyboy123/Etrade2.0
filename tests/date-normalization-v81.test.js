import test from 'node:test';
import assert from 'node:assert/strict';
import { serializeShipmentRow } from '../src/lib/dataApi.js';

test('Excel Date objects are serialized as PostgreSQL date-only values', () => {
  const db = serializeShipmentRow({
    shipment_code: 'SHP-DATE-1',
    service_month: '202607',
    eta: new Date(Date.UTC(2026, 6, 1))
  });

  assert.equal(db.eta, '2026-07-01');
});

test('display-formatted d-mmm dates inherit the year from service month', () => {
  const db = serializeShipmentRow({
    shipment_code: 'SHP-DATE-2',
    service_month: '202608',
    pre_alert_shipping_documents: '1-Jul'
  });

  assert.equal(db.pre_alert_shipping_documents, '2026-07-01');
});
