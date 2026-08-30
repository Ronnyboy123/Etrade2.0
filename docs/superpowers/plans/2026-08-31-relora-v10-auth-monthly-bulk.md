# Relora v10 Authentication, Monthly Reporting, and Bulk Actions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add secure email/password authentication, year-aware monthly shipment reporting/history, password recovery/change email flow, and Manager/Admin bulk selection without regressing v9 reliability safeguards.

**Architecture:** Add focused month and auth helpers, keep month selection in the app shell, pass already-filtered rows into existing dashboard/workspace components, and extend grid selection only for leadership. Supabase Auth owns passwords; the current approved-user/profile/RLS gate continues to authorize application access.

**Tech Stack:** React 19, Supabase Auth/Postgres/RLS, AG Grid 34, Node test runner, Vite.

**Spec:** `docs/superpowers/specs/2026-08-31-relora-v10-auth-monthly-bulk-design.md`

## Global Constraints
- Google OAuth must be removed from the Relora UI and runtime auth calls.
- No public signup flow.
- Official month is Service Month, falling back to ETA.
- Current month is default; upcoming months must not count in current-month KPIs.
- Manager/Admin bulk selection is limited to current filtered/month results.
- Active deletion means Archive; permanent deletion remains Admin-only.
- Preserve all v9 realtime/conflict/activity/archive behavior.

---

### Task 1: Month classification and filtering
**Files:** Create `src/lib/monthly.js`; Test `tests/v10-monthly.test.js`.
- [ ] Write failing tests for service-month precedence, ETA fallback, year inference, current/upcoming separation, available month options, and all-time handling.
- [ ] Run targeted tests and verify failure.
- [ ] Implement month-key helpers and row filtering.
- [ ] Run targeted and full tests.

### Task 2: Email/password and recovery auth
**Files:** Modify `src/components/AuthGate.jsx`, `src/lib/auth.js`, `src/styles.css`; Test `tests/v10-password-auth.test.js`.
- [ ] Write failing tests proving Google OAuth is absent and password/recovery APIs are used.
- [ ] Run targeted tests and verify failure.
- [ ] Implement email/password sign-in, forgot-password email, recovery password update, and signed-in reset-email action.
- [ ] Run targeted and full tests.

### Task 3: Global month selector and scoped reporting
**Files:** Create `src/components/MonthSelector.jsx`; Modify `src/App.jsx`, `src/components/ManagementDashboard.jsx`, `src/styles.css`; Test `tests/v10-month-integration.test.js`.
- [ ] Write failing integration tests for current-month default, filtered dashboard/workspaces, month switching, and leadership All Time.
- [ ] Run targeted tests and verify failure.
- [ ] Wire selected month into active row views and KPI drilldowns.
- [ ] Run targeted and full tests.

### Task 4: Manager/Admin select-all results
**Files:** Modify `src/components/ShipmentGrid.jsx`, `src/components/WorkspaceView.jsx`, `src/lib/access.js`, `src/styles.css`; Test `tests/v10-bulk-actions.test.js`.
- [ ] Write failing tests for leadership select-all visibility and current-results selection semantics.
- [ ] Run targeted tests and verify failure.
- [ ] Add explicit select-all-results action and ensure archive remains the active-table destructive action.
- [ ] Run targeted and full tests.

### Task 5: Schema/docs/version hardening
**Files:** Modify `supabase-schema.sql`, `README.md`, `package.json`; Create `relora-v10-migration.sql`; Test `tests/v10-schema-docs.test.js`.
- [ ] Write failing tests for password-auth documentation, unchanged approved-user/RLS gate, and v10 version.
- [ ] Run targeted tests and verify failure.
- [ ] Update schema comments/docs/deployment steps and migration guidance without storing passwords in public tables.
- [ ] Run full tests, syntax checks, and production build when dependencies are available.
