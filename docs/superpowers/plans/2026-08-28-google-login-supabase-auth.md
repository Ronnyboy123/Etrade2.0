# Google Login + Supabase Auth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Require Google authentication and approved-user authorization before showing the shipment application, with role-aware Supabase persistence.

**Architecture:** Add a small auth/data boundary around the existing React UI. Supabase Auth owns Google sessions, `approved_users` controls admission, `profiles` supplies application roles, and a focused data API handles shipment/profile reads and writes without changing spreadsheet-domain logic.

**Tech Stack:** React 19, Vite 7, Supabase JS 2, PostgreSQL RLS, Netlify

**Spec:** `docs/superpowers/specs/2026-08-28-google-login-supabase-auth-design.md`

## Global Constraints
- Google-only sign-in for application users.
- No protected application content before authentication and profile authorization complete.
- Frontend contains no service-role key or Google client secret.
- Existing role behavior and 39 regression tests must remain intact.
- Portal users may edit only `portal_submission`, `broker_representative`, and `portal_ticket_efile`.

---

### Task 1: Auth/domain helpers

**Files:**
- Create: `src/lib/auth.js`
- Test: `tests/auth-v8.test.js`

**Interfaces:**
- Produces: `profileToAppUser(profile)`, `resolveProfileAccess(profile)`, `roleLabel(role)`

- [ ] **Step 1: Write failing tests** for mapping Supabase snake_case profiles into existing camelCase app users and denying a missing/inactive profile.
- [ ] **Step 2: Run `node --test tests/auth-v8.test.js`** and verify RED.
- [ ] **Step 3: Implement minimal pure helpers** in `src/lib/auth.js`.
- [ ] **Step 4: Re-run the auth test** and verify PASS.

### Task 2: Supabase row adapter/data API

**Files:**
- Create: `src/lib/dataApi.js`
- Test: `tests/data-api-v8.test.js`

**Interfaces:**
- Produces: `flattenShipmentRow(row)`, `serializeShipmentRow(row)`, `loadShipments()`, `loadVisibleProfiles()`, `insertShipment(row)`, `updateShipment(row, field, user)`, `deleteShipments(ids)`, `persistImportChanges(changes)`

- [ ] **Step 1: Write failing tests** proving custom imported fields round-trip through `custom_fields` and UI-only fields are excluded from writes.
- [ ] **Step 2: Run the data API test** and verify RED.
- [ ] **Step 3: Implement pure adapters plus Supabase CRUD wrappers**; portal manual edits must call `update_portal_fields`.
- [ ] **Step 4: Re-run the data API test** and verify PASS.

### Task 3: Authentication gate/login UI

**Files:**
- Create: `src/components/AuthGate.jsx`
- Modify: `src/styles.css`
- Test: `tests/auth-ui-v8.test.js`

**Interfaces:**
- Consumes: configured `supabase`, `profileToAppUser`
- Produces: render-prop child `{ currentUser, authUser, signOut }`

- [ ] **Step 1: Write a source-level failing test** that requires `signInWithOAuth`, Google provider, session check, profile lookup, and sign-out controls.
- [ ] **Step 2: Run the auth UI test** and verify RED.
- [ ] **Step 3: Implement `AuthGate.jsx`** with checking, signed-out, denied/error, and authenticated states.
- [ ] **Step 4: Add login/access-state styles** that do not expose the app shell beneath the gate.
- [ ] **Step 5: Re-run the auth UI test** and verify PASS.

### Task 4: Wire authenticated application and persistence

**Files:**
- Modify: `src/App.jsx`
- Modify: `src/components/WorkspaceView.jsx`
- Modify: `src/components/ShipmentGrid.jsx`
- Test: `tests/app-auth-v8.test.js`

**Interfaces:**
- `App` receives auth context from `AuthGate`, loads Supabase rows/profiles, and passes persistence callbacks into workspaces.
- `WorkspaceView` receives async delete/import callbacks.
- `ShipmentGrid` emits `onRowChanged(row, field)` after automation.

- [ ] **Step 1: Write a failing source test** requiring `AuthGate`, real profile-derived navigation, no demo switcher, and persistence callback wiring.
- [ ] **Step 2: Run the app-auth test** and verify RED.
- [ ] **Step 3: Refactor `App.jsx`** so authenticated users load real profiles/shipments; show database loading/error states inside the auth boundary.
- [ ] **Step 4: Wire create/update/delete/import operations** through the data API while retaining optimistic local UI only after successful writes.
- [ ] **Step 5: Re-run the app-auth test** and verify PASS.

### Task 5: Secure Supabase schema + deployment guide

**Files:**
- Replace: `supabase-schema.sql`
- Modify: `.env.example`
- Modify: `README.md`
- Test: `tests/supabase-security-v8.test.js`

**Interfaces:**
- Database creates `approved_users`, `profiles`, `shipments.custom_fields`, helper functions, auth trigger, RLS policies, and restricted portal RPC.

- [ ] **Step 1: Write a failing SQL source test** for allow-list table, auth trigger, helper functions, RLS, custom fields, and restricted portal update function.
- [ ] **Step 2: Run the SQL source test** and verify RED.
- [ ] **Step 3: Replace schema with idempotent secure SQL** and document Google/Supabase/Netlify configuration plus example approved-user inserts.
- [ ] **Step 4: Re-run the SQL source test** and verify PASS.

### Task 6: Full verification

**Files:** all changed files

- [ ] **Step 1: Run `npm test`** and require all old + new tests to pass.
- [ ] **Step 2: Run syntax checks** on JavaScript/JSX source files.
- [ ] **Step 3: Run `npm install` then `npm run build`** if dependency installation completes in the environment.
- [ ] **Step 4: Package `/mnt/data/shipment-timeline-v8.zip`** only after verification results are recorded.
