# Nexabrick Catalog Hardening Plan

> Execution plan for a lower-capability implementation model. Execute phases in order. Do not implement this document's changes while authoring the plan.

## Goal

Harden the static catalog so every visible control works, all five firmware variants are represented, URL state is safe and reproducible, detail views are keyboard/screen-reader usable, catalog data cannot inject markup, mobile layouts do not overflow, and GitHub Pages cannot deploy invalid catalog data.

## Baseline

- Repository: `juarendra/nexabrick-sensor-catalog`
- Source of truth: `data/catalog.json`
- Frontend: `index.html`, `assets/app.js`, `assets/styles.css`, `404.html`
- Validator: `scripts/validate-catalog.mjs`
- Workflows: `.github/workflows/validate.yml`, `.github/workflows/deploy-pages.yml`
- Baseline command: `node scripts/validate-catalog.mjs`
- Expected baseline after the ID 20 removal: `Validated 44 devices and 5 variants successfully.`
- Local smoke server: `python -m http.server 8080`
- Do not modify or stage unrelated untracked files `add-tibbits.js` and `update-20.js`.

## Non-Goals

- Do not redesign the visual language or change catalog meaning.
- Do not reintroduce device ID 20.
- Do not add a frontend framework or bundler.
- Do not change firmware repository data or generated commit metadata.
- Do not silently change device IDs, variant keys, status semantics, or public URL format.
- Do not use inline event handlers in new or modified markup.

## Guardrails

- Keep each implementation phase in a separate commit.
- Touch only the files listed by the phase unless a test requires a narrowly related fixture.
- Run the phase verification command before starting the next phase.
- Preserve existing query keys `q`, `status`, `cat`, and `id`.
- Preserve repeated query parameters for repeated status/category filters.
- Use allowlists for catalog-controlled enum values; do not trust URL values or catalog strings at runtime.
- Prefer native HTML controls and `addEventListener` over ARIA simulation and inline `onclick`.
- Never use `innerHTML` with untrusted values unless every HTML, attribute, URL, and JavaScript context is safely separated; prefer DOM construction.
- Stop and ask for clarification if a proposed change requires changing catalog meaning, removing modular cards 1001-1006, or changing public URL compatibility.

## Phase 0: Baseline and Test Harness

### Scope

Files: add `tests/catalog.test.mjs` or an equivalent test file; do not alter application behavior yet.

### Tasks

1. Run `git status --short` and confirm unrelated untracked files remain untouched.
2. Run `node scripts/validate-catalog.mjs` and record the device/variant counts.
3. Add lightweight Node tests for pure helpers only if helpers are extracted without behavior changes. Do not add a framework solely for this phase.
4. Document manual browser test commands and target URLs in the test file or plan notes.

### Acceptance Criteria

- Baseline validator passes with 44 devices and 5 variants.
- No unrelated files are staged.
- Test execution has one documented command and a deterministic pass/fail result.

## Phase 1: Core Interaction Bugs

### Scope

Files: `assets/app.js`, `index.html` only.

### Tasks

1. Fix `removeFilter(type, val)` so category chips target `input[name="category"]`, status chips target `input[name="status"]`, and missing controls do not throw.
2. Attach a listener to `btn-reset-filters`; it must call the existing `resetAll()` behavior and clear search, status, category, URL, chips, and results.
3. Decide the variant-plate behavior without inventing a new feature: recommended behavior is to make each plate focus/search the relevant variant or render it as a non-interactive summary. If filtering by variant is implemented, add a URL key only after preserving existing URL compatibility and documenting it.
4. Add `auxiliary` to the status presentation so modular cards are not labeled `Unsupported`; retain `unsupported` for actual unsupported records.
5. Make `parseURL()` strictly validate `id` as the complete decimal string and close/reset the drawer for malformed or unknown IDs.
6. Whitelist `status` against the rendered status filter values and `cat` against `catalog.devices[].category`; ignore unknown values instead of creating phantom chips.

### Acceptance Criteria

- Removing a category chip does not throw and unchecks the category checkbox.
- Reset filter works on desktop and mobile.
- Variant plates either perform their documented action or are not rendered as buttons.
- Auxiliary cards show an auxiliary/known state, never an unsupported state solely because of the UI mapping.
- `?id=1abc`, `?id=999999`, and `?id=-1` do not leave stale detail content open.
- `?status=garbage&cat=garbage` produces no phantom chips and no console error.
- Existing URLs such as `?cat=digital-io` still work.

## Phase 2: Data-Driven Variant Rendering

### Scope

Files: `assets/app.js`, optionally `assets/styles.css` if the fifth indicator needs layout adjustment.

### Tasks

1. Replace the hardcoded variant list in card dots with `state.catalog.variants`.
2. Replace the hardcoded variant list in the detail matrix with `state.catalog.variants`.
3. Resolve each variant's display name from the catalog and each device's `variantSupport[v.key]` safely.
4. Preserve the current order from `catalog.variants`.
5. Add accessible text/title for every variant indicator; color alone must not communicate status.
6. Render missing support data as an explicit unresolved/unknown state rather than throwing.

### Acceptance Criteria

- All five variants, including `micro-modular`, appear in the detail matrix.
- Cards show five indicators in the catalog-defined order.
- A device missing one variant entry still renders the other data and shows a safe fallback.
- No hardcoded four-variant array remains in `assets/app.js`.
- Existing device detail content remains unchanged apart from the additional variant row/dot.

## Phase 3: Search, URL, and Navigation Robustness

### Scope

Files: `assets/app.js`, `index.html`; tests from Phase 0.

### Tasks

1. Extend search to include normalized interface bus/address values from every `variantSupport` entry, including I²C addresses.
2. Normalize search input and searchable values consistently for case and whitespace.
3. Keep URL state canonical: omit empty values, preserve repeated filters, and avoid accepting partial numeric IDs.
4. Ensure `pushState` is used for user actions and `popstate` restores search, filters, selected card, and drawer state.
5. Close the drawer when the URL has no valid `id`; do not retain previous detail content.
6. Store the invoking card/control so closing the drawer restores focus to the opener instead of always focusing search.

### Acceptance Criteria

- Searching an address visible in a detail matrix returns the matching device.
- Search, filters, detail IDs, refresh, back, and forward round-trip correctly.
- Unknown query values are ignored and do not throw selector errors.
- Direct URL `/?cat=digital-io` renders the expected filtered list.
- Closing a detail opened from a card returns focus to that card.

## Phase 4: Accessibility and Modal Behavior

### Scope

Files: `index.html`, `assets/app.js`, `assets/styles.css`.

### Tasks

1. Replace clickable catalog `div[role="button"]` cards with native buttons or implement complete keyboard semantics, including Enter and Space.
2. Make software-name copy control a native button with an accessible label.
3. Make Task/MQTT copy controls native buttons with accessible labels and keyboard support.
4. Set drawer `aria-hidden="false"` only while open and `true` while closed.
5. Implement focus trap while drawer is open, Escape close, backdrop close, and focus restoration to the opener.
6. Prevent background interaction while the drawer is open and lock body scrolling; restore both on close.
7. Add `aria-label` to filter-chip remove buttons and mark decorative SVGs `aria-hidden="true"`.
8. Add `rel="noopener noreferrer"` to every external link opened in a new tab.

### Acceptance Criteria

- Keyboard-only user can open cards with Enter and Space.
- Keyboard focus cannot escape the open drawer.
- Screen readers receive correct open/closed drawer state.
- Every icon-only control has an accessible name.
- Focus returns to the originating card after close.
- External evidence/datasheet links have `noopener noreferrer`.

## Phase 5: Safe Rendering and Clipboard Handling

### Scope

Files: `assets/app.js`, `scripts/validate-catalog.mjs`.

### Tasks

1. Remove inline `onclick` generation from filter chips, card markup, and matrix copy controls.
2. Use DOM creation or a single safe rendering boundary with event listeners and `dataset` values.
3. Escape text consistently, including category/status labels and variant metadata.
4. Validate `officialUrl` and evidence repository/path data before rendering. Allow only `https:` external URLs unless a documented exception exists.
5. Add `rel="noopener noreferrer"` to generated external links.
6. Feature-detect `navigator.clipboard`; handle rejected promises with an accessible error toast/live-region message.
7. Add a fallback copy strategy only if it can be implemented without deprecated unsafe behavior; otherwise provide a clear failure message.

### Acceptance Criteria

- Apostrophes, quotes, angle brackets, and backslashes in fixture values cannot break markup or execute code.
- No catalog value is interpolated into an inline JavaScript handler.
- Invalid/non-HTTPS official URLs fail validation and do not render as links.
- Clipboard success and failure both produce a user-visible accessible result.
- Evidence links remain valid for the current generated firmware repository/commit.

## Phase 6: Responsive and Visual Reliability

### Scope

Files: `assets/styles.css`, only related markup changes in `index.html` if required.

### Tasks

1. Change the grid minimum at narrow widths to prevent horizontal overflow; use `minmax(0, 1fr)` at the mobile breakpoint.
2. Define `--radius-full` or replace it with an explicit supported value.
3. Change the mobile drawer to use `100dvh` with safe-area insets for top/bottom content and controls.
4. Check long display names, PCB paths, manufacturer names, and evidence paths for wrapping without layout expansion.
5. Preserve reduced-motion behavior.

### Acceptance Criteria

- No horizontal page overflow at 320px, 375px, 768px, and 1440px widths.
- Drawer close control and bottom content remain reachable on mobile browser chrome/notch layouts.
- Filter chips have the intended pill radius.
- Long catalog values wrap and do not overlap adjacent controls.
- `prefers-reduced-motion: reduce` remains respected.

## Phase 7: Validator Contract Hardening

### Scope

Files: `scripts/validate-catalog.mjs`, `data/catalog.json`, tests.

### Tasks

1. Validate top-level schema fields and array types before calling `.forEach()`.
2. Validate required device fields consumed by the renderer: id, slug, displayName, softwareName, category, summary, deviceType, variantSupport, pcb, physicalParts, measurements, conflicts, and evidence.
3. Validate variant keys against `catalog.variants` and validate each support object/status.
4. Validate measurement/interface/evidence shapes and evidence line formats.
5. Validate `officialUrl` as nullable HTTPS URL.
6. Validate categories/device types/statuses against explicit allowlists.
7. Validate auxiliary records if `auxiliarySystems` remains in the schema.
8. Replace the broad secret keyword heuristic with a documented, narrow policy. Do not reject legitimate catalog words merely because they contain `token`, `secret`, or `password`.
9. Add malformed fixture tests for missing arrays, invalid URLs, bad evidence lines, unknown variants, unsafe strings, and missing consumed fields.

### Acceptance Criteria

- Current catalog still passes with 44 devices and 5 variants.
- Each malformed fixture fails with a useful path and reason.
- Validator behavior covers every field accessed by `assets/app.js`.
- No valid existing catalog content is rejected by keyword-only false positives.

## Phase 8: Deployment Hardening

### Scope

Files: `.github/workflows/validate.yml`, `.github/workflows/deploy-pages.yml`, optionally a small publish script.

### Tasks

1. Make the deployment job run catalog validation before artifact upload, or make deployment depend on a required validation check that cannot be bypassed.
2. Upload an explicit public-site directory containing only `index.html`, `404.html`, `assets/`, and `data/`.
3. Add a deployment smoke step that checks the generated artifact contains `assets/app.js` and `data/catalog.json`.
4. Pin third-party Actions to reviewed commit SHAs if repository policy permits; document update procedure.
5. Keep workflow permissions least-privilege and preserve Pages deployment functionality.
6. Make the 404 return link work under the repository Pages base path without hardcoding an unrelated deployment path.

### Acceptance Criteria

- A deliberately invalid catalog cannot reach the Pages deployment step.
- Published artifact excludes scripts, plans, and unrelated repository files.
- Pages deployment succeeds from `main`.
- Hosted smoke test confirms the page, app module, catalog JSON, and `?cat=digital-io` load.
- 404 link returns to the catalog under the configured Pages path.

## Verification Matrix

Run after all phases:

| Area | Cases | Expected |
|---|---|---|
| Load | local server, hosted Pages, fetch failure | correct page or clear retry state |
| Search | name, alias, manufacturer, PCB, I²C address, empty search | correct results and URL state |
| Filters | status, category, repeated filters, chip removal, reset | no exceptions; state stays synchronized |
| URL | valid/invalid `id`, `q`, `cat`, `status`, refresh, back/forward | canonical safe state |
| Detail | every device, missing PCB, multiple parts, conflicts, evidence, all five variants | complete safe rendering |
| Keyboard | `/`, Tab, Enter, Space, Escape, drawer focus | usable without pointer |
| Accessibility | dialog state, names, live region, focus return | no contradictory ARIA state |
| Security | quote/HTML/URL fixture values | no markup or script injection |
| Clipboard | success, denial, unsupported API | accessible success/failure feedback |
| Responsive | 320, 375, 768, 1440px; orientation | no overflow or clipped drawer |
| Deployment | invalid catalog, valid main deploy, hosted smoke | invalid build blocked; valid build live |

## Final Review Checklist

- Run `node scripts/validate-catalog.mjs`.
- Run the complete automated test command.
- Run a syntax check for JavaScript and inspect browser console for errors.
- Test the hosted URL after Pages deployment, not only local files.
- Run `git diff --check` and inspect the complete diff.
- Confirm no ID 20 reappeared and cards 1001-1006 remain present.
- Confirm unrelated untracked files were not staged.
- Report any unimplemented item explicitly instead of silently skipping it.
