import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('app shell owns a current-month default and scopes rows before dashboards/workspaces', () => {
  const app = fs.readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
  assert.match(app, /currentMonthKey/);
  assert.match(app, /selectedMonth/);
  assert.match(app, /filterRowsByMonth/);
  assert.match(app, /monthScopedRows/);
  assert.match(app, /<MonthSelector/);
});

test('month selector exposes data months and optional All Time management view', () => {
  const selector = fs.readFileSync(new URL('../src/components/MonthSelector.jsx', import.meta.url), 'utf8');
  assert.match(selector, /Reporting month/i);
  assert.match(selector, /allowAllTime/);
  assert.match(selector, /ALL_TIME/);
  assert.match(selector, /formatMonthLabel/);
});

test('management dashboard identifies the selected reporting period', () => {
  const source = fs.readFileSync(new URL('../src/components/ManagementDashboard.jsx', import.meta.url), 'utf8');
  assert.match(source, /periodLabel/);
  assert.match(source, /Viewing:/);
});

test('team workspace counts and archived rows receive month-scoped data', () => {
  const app = fs.readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
  assert.match(app, /<TeamWorkspaces[^>]*[\s\S]*rows=\{monthScopedRows\}/);
  assert.match(app, /monthScopedArchivedRows/);
});
