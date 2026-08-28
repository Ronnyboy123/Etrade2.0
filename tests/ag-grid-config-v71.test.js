import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const main = fs.readFileSync(new URL('../src/main.jsx', import.meta.url), 'utf8');
const grid = fs.readFileSync(new URL('../src/components/ShipmentGrid.jsx', import.meta.url), 'utf8');

test('uses AG Grid Theming API without legacy CSS theme imports', () => {
  assert.equal(main.includes('ag-grid-community/styles/ag-grid.css'), false);
  assert.equal(main.includes('ag-grid-community/styles/ag-theme-quartz.css'), false);
});

test('configures enableCellChangeFlash as a column option, not a grid option', () => {
  const defaultColDefMatch = grid.match(/const defaultColDef = useMemo\(\(\) => \(\{([\s\S]*?)\}\), \[\]\);/);
  assert.ok(defaultColDefMatch, 'defaultColDef block should exist');
  assert.match(defaultColDefMatch[1], /enableCellChangeFlash:\s*true/);

  const gridTagMatch = grid.match(/<AgGridReact([\s\S]*?)\/>/);
  assert.ok(gridTagMatch, 'AgGridReact tag should exist');
  assert.equal(/\benableCellChangeFlash\b/.test(gridTagMatch[1]), false);
});
