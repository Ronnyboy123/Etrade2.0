# Relora v12.0 — Shipment Detail Exact Sync Design

Date: 2026-09-01
Status: Proposed for implementation

## 1. Problem

Relora currently models one imported Excel row as one shipment candidate. `buildImportPlan()` marks a later row as a duplicate whenever it shares the same strong shipment identity key as an earlier row. That is incorrect for the current operations workbook, where one shipment can occupy many Excel rows because each row represents a container, invoice, SKU/material, quantity, or other detail line.

The result is that the website can show the shipment master record while silently dropping legitimate repeated Excel rows. The website therefore does not fully reflect the workbook.

The workbook also contains section labels, template rows, and repeated/grouped shipment rows. Those must not become independent shipments.

## 2. Goals

1. Keep exactly one master `shipments` record per real shipment.
2. Preserve every meaningful Excel detail row that belongs to that shipment.
3. Make a selected Excel import the source of truth for the detail rows of shipments present in that import.
4. Re-importing the workbook must add new details, update changed details, and remove details that are no longer present for those imported shipments.
5. Keep dashboard shipment counts, assignment, workflow, monthly reporting, archive, permissions, activity, and automation based on the master shipment only.
6. Retain v11.3 protections: large-import batching, import progress, archived-match handling, conflict review, placeholder identifier handling, multi-sheet selection, wide-sheet hardening, and date normalization.
7. Preserve raw source values so Relora can display the imported workbook details without losing columns that do not have first-class Relora fields.

## 3. Non-goals

- Do not turn every SKU/material row into a dashboard shipment.
- Do not redesign the entire shipment grid.
- Do not make detail rows directly editable in phase 1. The Excel import remains the source of truth for imported detail rows.
- Do not automatically delete details for shipments that are absent from the selected import. Exact sync applies only to shipment groups actually present in the import being committed.
- Do not delete or overwrite archived shipment masters unless the user explicitly chooses the existing Restore & Update action.

## 4. Shipment identity and grouping

Imported rows are grouped into a shipment using the existing strongest-identifier semantics:

1. Job File No.
2. Entry No.
3. House AWB / BL
4. Master AWB / BL only when no stronger identifier exists

Placeholder identifiers such as `TBA`, `TBD`, `N/A`, `NA`, `NONE`, and `-` are ignored.

Rows that contain no useful shipment identity are not promoted into shipments. Section rows such as `NEW PRE-ALERTS` or `AIR SHIPMENTS`, blank templates, and formula/template-only rows are skipped and reported in the import trace as non-shipment rows.

The frontend groups all rows sharing the same shipment identity before duplicate detection. Repeated rows inside one shipment group are therefore detail lines, not duplicate shipments.

## 5. Parent/master field consolidation

For each shipment group, Relora builds one canonical master row.

- Shipment-level fields use the first nonblank value in source order when all nonblank values agree.
- If multiple nonblank values disagree for a shipment-level field, Relora keeps the first nonblank value for the proposed master but raises an import-review warning showing the mixed values before commit.
- Operational fields already maintained in Relora continue to use the existing safe-update, stale-file, and workflow-regression rules.
- Material/SKU-specific description, quantity, UOM, container, invoice, PO, and other repeated line values are not collapsed into the master shipment. They remain in shipment details.

This prevents a later SKU row from overwriting a shipment-level value merely because it appears later in the workbook.

## 6. New database table

Add `public.shipment_import_lines`:

- `id uuid primary key default gen_random_uuid()`
- `shipment_id uuid not null references public.shipments(id) on delete cascade`
- `line_key text not null`
- `source_sheet text`
- `source_row_number integer`
- `source_section text`
- `raw_cells jsonb not null default '[]'::jsonb`
- `normalized_fields jsonb not null default '{}'::jsonb`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

Indexes:

- `(shipment_id)`
- unique `(shipment_id, line_key)`

`raw_cells` is an ordered JSON array such as:

```json
[
  {"header":"CONTAINER NO.","value":"OOCU7122383"},
  {"header":"MATERIAL","value":"5060781"},
  {"header":"DESCRIPTION","value":"BIBAG 5008 650g"},
  {"header":"QTY","value":"4480"},
  {"header":"UOM","value":"PCE"}
]
```

Using an ordered array preserves the workbook column order. `normalized_fields` stores recognized semantic values for searching/display convenience without discarding unknown workbook columns.

## 7. Detail line identity

Each meaningful detail row gets a deterministic `line_key` generated from normalized source content rather than array position alone.

Preferred components, when available:

- source sheet
- container number
- invoice number
- PO number
- material/SKU
- description
- quantity
- UOM

If those are unavailable, the importer hashes the normalized nonblank raw cells. The source row number may be stored for traceability but is not the sole identity because rows can move between workbook versions.

Two rows with identical business content under the same shipment may still legitimately occur. To preserve duplicates, the frontend adds a deterministic occurrence suffix (`:1`, `:2`, etc.) within that shipment group after sorting in source order.

## 8. Exact-sync semantics

Exact sync is scoped to shipment groups contained in the selected import.

For each imported shipment group, one server transaction will:

1. create/update/restore the shipment master using the existing authorization and version checks;
2. validate that the caller may mutate that shipment;
3. upsert the complete imported detail set for that shipment;
4. delete prior `shipment_import_lines` for that shipment whose `line_key` is not in the newly imported set;
5. write one shipment activity entry describing the import and detail count change.

If a shipment group fails, that group's master and detail changes roll back together.

Shipments not present in the selected workbook/sheet import are untouched. This avoids deleting historical details simply because a user imported only one sheet or a partial workbook.

## 9. Large-import batching

v11.3's fixed 100-master-row batch is replaced with group-aware batching.

A shipment group is atomic and is never split across requests. The frontend packs complete shipment groups into a request until either threshold is reached:

- 25 shipment groups, or
- 250 detail rows

whichever comes first.

A single shipment with more than 250 detail rows is sent alone. The UI continues to show committed progress and clearly identifies the group/batch where a failure occurred.

This keeps exact sync correct while avoiding another large PostgreSQL statement timeout.

## 10. Workbook parsing and section handling

The parser continues to support multi-sheet imports and wide/corrupted worksheet ranges.

Header handling is hardened:

- Prefer row 1 when it contains a credible set of recognized shipment headers.
- Otherwise scan the first 50 nonempty rows and score each candidate by known header aliases and nonblank density.
- Select the strongest credible header row; if none is credible, show a clear import error instead of inventing `Unnamed Column` mappings.

After a header is established, later section rows such as `NEW PRE-ALERTS`, `AIR SHIPMENTS`, and other label-only rows are treated as section markers. Their label can be attached to subsequent detail rows as `source_section` until another section marker appears.

Blank/template rows with no useful shipment identifier and no meaningful detail payload are skipped.

## 11. Import review UX

The import preview changes from row-centric duplicate review to shipment-group review.

Each shipment preview shows:

- shipment identifier
- source sheet(s)
- number of Excel detail rows
- action: New / Update / Unchanged / Archived Match / Needs Review
- parent-field conflicts, if any
- expandable detail preview

The row trace remains available and paginated, but repeated rows under one shipment are labeled `Detail row` instead of `Duplicate in selected sheets`.

Before exact sync, the preview also shows counts such as:

- `8 shipment details will be added`
- `2 will change`
- `1 existing detail will be removed`

where comparison data is available.

## 12. Shipment details UI

The main shipment grid remains one row per shipment.

Add a `Details` action to open a drawer/modal for the selected shipment. The first version is read-only and shows:

- imported source sheet/section
- a dynamic table built from the ordered raw Excel columns
- search/filter within the shipment details
- detail-row count

Columns that are empty for every detail row may be hidden by default. Users can expand/view all imported columns.

No line-item editing is introduced in v12.0; re-importing Excel is the supported synchronization path.

## 13. Security and RLS

Enable RLS on `shipment_import_lines`.

Read access follows the parent shipment's visibility rules:

- manager / assistant manager / admin: visible shipments
- team lead: own team shipments
- employee: own assigned shipments
- portal: same parent shipment visibility as currently permitted

Normal authenticated clients receive SELECT only on the detail table. Inserts, updates, and deletes are performed through the authorized SECURITY DEFINER import RPC so a user cannot mutate details for a shipment they do not control.

Permanent deletion of a shipment cascades its detail rows. Archiving a shipment does not delete details.

## 14. API/data flow

Frontend import flow:

`XLSX workbook -> parsed source rows -> shipment groups -> parent import plan + detail sets -> review -> grouped batch RPC -> refresh shipments/details`

The existing import serialization gains a group payload:

```json
{
  "shipment": {"shipment_code":"...", "...":"..."},
  "details": [
    {"line_key":"...", "source_sheet":"INCOMING", "raw_cells":[...], "normalized_fields":{...}}
  ]
}
```

A new RPC, `persist_import_group_batch(jsonb)`, is preferred over expanding `persist_import_batch` indefinitely. The old RPC remains available for backward compatibility during deployment but v12.0 frontend uses the new group RPC.

## 15. Migration and compatibility

Create `relora-v12.0-migration.sql` containing:

- `shipment_import_lines` table
- indexes
- updated-at trigger
- RLS policies/grants
- new grouped import RPC

No existing shipment rows are deleted or rewritten by the migration.

Existing shipments simply begin with zero detail rows. Their detail rows are populated the next time the relevant Excel shipment is imported.

This makes rollout reversible at the frontend level: v11.3 can still read the same shipment master table even after the new table exists.

## 16. Testing

TDD coverage must include:

1. repeated rows with the same Job File become one shipment group with multiple details;
2. repeated rows with the same House BL but different SKUs are not discarded;
3. dashboard/master output contains one shipment only;
4. placeholder identity values do not create fake groups;
5. section/template rows are skipped;
6. mixed master values produce a review warning;
7. deterministic line keys remain stable when Excel row positions move;
8. truly duplicate detail rows are preserved with occurrence suffixes;
9. re-import adds new details;
10. re-import updates changed details;
11. exact sync removes old details only for shipments present in the current import;
12. partial/single-sheet imports do not delete details for absent shipments;
13. archived shipment behavior remains safe and explicit;
14. group batching never splits a shipment's details;
15. detail RLS mirrors parent visibility;
16. parent + details roll back together on group failure;
17. large workbook regression stays below the previous statement-timeout path;
18. all existing Relora regression tests continue to pass.

## 17. Acceptance criteria

The change is accepted when a workbook containing several Excel rows for one real shipment imports into Relora as exactly one shipment master and all meaningful source rows are visible under Shipment Details. Re-importing a changed workbook makes that shipment's detail list match the latest selected Excel data, while dashboard shipment counts and operational workflow remain one-per-shipment and unchanged.
