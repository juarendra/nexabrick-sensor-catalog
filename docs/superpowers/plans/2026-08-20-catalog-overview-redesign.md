# Nexabrick Catalog Overview Redesign Plan

Date: 2026-08-20

## 1. Objective

Redesign the catalog overview so it looks intentional, clearly communicates useful catalog coverage, and never leaves these labels with an unexplained dash:

- `Sensor didukung`
- `Kategori`
- `Varian perangkat`

The current presentation is not acceptable because the labels are visually weak and the initial `–` values can remain visible when catalog loading or JavaScript rendering fails. The replacement must provide strong visual hierarchy, real data-derived values, explicit loading/error states, and responsive behavior.

This plan is written for a lower-capability implementation model. Follow it in order and do not invent a different visual system.

## 2. Current Problem

The current hero overview consists of three simple vertical text blocks:

```text
– Sensor didukung
– Kategori
– Varian perangkat
```

Problems:

1. The placeholder `–` does not explain whether data is loading, empty, or broken.
2. The numbers depend on JavaScript replacing the placeholders after `catalog.json` loads.
3. If the catalog fetch fails, `renderStats()` is not called, or stale HTML and JavaScript are deployed together, the page can display dashes forever.
4. The labels have insufficient visual hierarchy and look like unfinished metadata.
5. The overview does not explain what “supported” means.
6. There is no active-support percentage or useful catalog context.
7. The overview is not connected visually to the hardware/control-room character of the existing page.

## 3. Required Final Design

Use the existing Nexabrick dark dashboard/control-room aesthetic. Do not introduce a generic white SaaS card design.

Create one cohesive panel named `Catalog Overview`, containing four metrics:

```text
CATALOG OVERVIEW                                      LIVE CATALOG

44                    42                    15                    5
Devices Indexed       Active Support        Categories            Variants
All catalog records   At least 1 active     Sensor & I/O domains  Firmware targets
                      firmware path

Active coverage 95%   [███████████████████░]
```

The exact numbers above are examples. Every displayed value must come from `data/catalog.json` at runtime.

### Required Metrics

1. **Devices Indexed**
   - Source: `catalog.devices.length`
   - This is the total number of primary catalog records.
   - Do not include `auxiliarySystems` in this number.

2. **Active Support**
   - Count a device once when at least one entry in `device.variantSupport` has `status === "active"`.
   - A device active on multiple variants still counts as one supported device.
   - Do not count `incomplete`, `declared-only`, `ui-only`, `auxiliary`, `actuator`, `reserved`, `unresolved`, or `unsupported` as active support.
   - Sentinel ID `0` follows the same rule as other devices.

3. **Categories**
   - Source: unique non-empty values from `catalog.devices[].category`.
   - Use a `Set` so duplicate categories count once.

4. **Variants**
   - Source: `catalog.variants.length`.
   - Include `micro-modular`.

5. **Active Coverage**
   - Formula: `activeSupportedDevices / devicesIndexed * 100`.
   - Round to the nearest whole percentage for display.
   - If total devices is zero, display `0%` and do not divide by zero.

## 4. Visual Specification

### Panel

- One integrated panel, not four unrelated floating cards.
- Background: raised dark surface using existing tokens (`--surface` / `--surface-raised`).
- Border: subtle `1px` existing border color.
- Radius: use existing `--radius-lg`.
- Add one restrained blue radial glow in the upper-right corner.
- Padding: `24px` desktop, `16px` mobile.
- Keep the panel aligned with the hero text and catalog grid.

### Header

Left side:

- Eyebrow: `CATALOG OVERVIEW`
- Small uppercase, mono font, muted text, letter spacing.

Right side:

- Status dot with label `LIVE CATALOG` after data loads.
- During loading, label `LOADING CATALOG` with no pulsing animation when reduced motion is enabled.
- On failure, label `CATALOG UNAVAILABLE` using danger color.

### Metrics

- Four equal metric columns on desktop.
- Each metric has:
  - Icon or short technical glyph in a tinted square.
  - Large number (`2rem` to `2.5rem`) in mono/tabular numerals.
  - Strong primary label.
  - One-line muted explanation.
- Numbers use semantic accents:
  - Devices Indexed: blue.
  - Active Support: green.
  - Categories: cyan.
  - Variants: violet.
- Do not use saturated backgrounds for entire cards.
- Do not use decorative charts that do not represent data.

### Coverage Bar

- Place below the four metrics.
- Left: `Active coverage`.
- Right: percentage such as `95%`.
- Use a horizontal progress track.
- Progress fill uses a low-key blue-to-green gradient.
- Add semantic attributes:
  - `role="progressbar"`
  - `aria-label="Active sensor support coverage"`
  - `aria-valuemin="0"`
  - `aria-valuemax="100"`
  - `aria-valuenow` set from data.

## 5. Loading, Success, Empty, and Error States

The overview must not show bare dashes indefinitely.

### Initial HTML State

Use text placeholders that communicate loading:

```text
Loading…
```

Do not use `–` as the only initial content.

All metric values should initially have:

```html
<span class="overview-value is-loading">Loading…</span>
```

### Success State

After `catalog.json` loads and validates enough for rendering:

1. Replace every loading label with a number.
2. Remove `.is-loading`.
3. Set overview status to `LIVE CATALOG`.
4. Update the coverage percentage and progress width.
5. Update all progress ARIA attributes.

### Empty Catalog State

If `catalog.devices` is an empty array:

- Devices Indexed: `0`
- Active Support: `0`
- Categories: `0`
- Variants: use actual `catalog.variants.length`
- Coverage: `0%`
- Status: `EMPTY CATALOG`
- Do not treat this as a JavaScript crash.

### Fetch/Error State

If fetching or parsing `catalog.json` fails:

1. Set each metric value to `Unavailable`, not `–`.
2. Set overview status to `CATALOG UNAVAILABLE`.
3. Set coverage text to `Unavailable`.
4. Set progress width to `0%` and `aria-valuenow="0"`.
5. Preserve the existing catalog error state.
6. Log the original error to the console once.

## 6. HTML Implementation

### File

`index.html`

### Replace Current Overview Markup

Remove the simple `.hero-stats` three-item block and replace it with this semantic structure. Class names may be adjusted only when required by existing conventions, but IDs must remain exact so the implementation model does not guess.

```html
<section class="catalog-overview" id="catalog-overview" aria-labelledby="catalog-overview-title">
  <div class="overview-header">
    <h2 id="catalog-overview-title">Catalog Overview</h2>
    <div class="overview-status" id="overview-status" data-state="loading">
      <span class="overview-status-dot" aria-hidden="true"></span>
      <span id="overview-status-label">Loading catalog</span>
    </div>
  </div>

  <div class="overview-grid">
    <article class="overview-metric metric-devices">
      <span class="overview-icon" aria-hidden="true">ID</span>
      <span class="overview-value is-loading" id="overview-devices">Loading…</span>
      <h3>Devices Indexed</h3>
      <p>All primary catalog records</p>
    </article>

    <article class="overview-metric metric-active">
      <span class="overview-icon" aria-hidden="true">OK</span>
      <span class="overview-value is-loading" id="overview-active">Loading…</span>
      <h3>Active Support</h3>
      <p>At least one active firmware path</p>
    </article>

    <article class="overview-metric metric-categories">
      <span class="overview-icon" aria-hidden="true">CAT</span>
      <span class="overview-value is-loading" id="overview-categories">Loading…</span>
      <h3>Categories</h3>
      <p>Unique sensor and I/O domains</p>
    </article>

    <article class="overview-metric metric-variants">
      <span class="overview-icon" aria-hidden="true">VAR</span>
      <span class="overview-value is-loading" id="overview-variants">Loading…</span>
      <h3>Variants</h3>
      <p>Firmware and hardware targets</p>
    </article>
  </div>

  <div class="overview-coverage">
    <div class="overview-coverage-label">
      <span>Active coverage</span>
      <strong id="overview-coverage-value">Loading…</strong>
    </div>
    <div
      class="overview-progress"
      id="overview-progress"
      role="progressbar"
      aria-label="Active sensor support coverage"
      aria-valuemin="0"
      aria-valuemax="100"
      aria-valuenow="0"
    >
      <span class="overview-progress-fill" id="overview-progress-fill"></span>
    </div>
  </div>
</section>
```

### External Links

While editing `index.html`, ensure every `target="_blank"` link includes:

```html
rel="noopener noreferrer"
```

## 7. JavaScript Implementation

### Files

- `assets/lib.mjs`
- `assets/app.js`

### Pure Metrics Helper

Add this exported helper to `assets/lib.mjs`:

```js
export function getCatalogOverview(catalog) {
  const devices = Array.isArray(catalog?.devices) ? catalog.devices : [];
  const variants = Array.isArray(catalog?.variants) ? catalog.variants : [];

  const active = devices.filter(device =>
    Object.values(device.variantSupport || {}).some(
      support => support?.status === 'active'
    )
  ).length;

  const categories = new Set(
    devices
      .map(device => device.category)
      .filter(category => typeof category === 'string' && category.length > 0)
  ).size;

  const coverage = devices.length === 0
    ? 0
    : Math.round((active / devices.length) * 100);

  return {
    devices: devices.length,
    active,
    categories,
    variants: variants.length,
    coverage
  };
}
```

Do not calculate these metrics separately inside multiple DOM functions. There must be one source of truth.

### App Import

Import `getCatalogOverview` into `assets/app.js` from `./lib.mjs`.

### Success Renderer

Replace the current `renderStats()` function with `renderCatalogOverview(catalog)`:

1. Call `getCatalogOverview(catalog)`.
2. Populate the four metric IDs.
3. Remove `.is-loading` from all values.
4. Populate coverage percentage.
5. Set progress fill width with an inline CSS custom property or style width.
6. Set `aria-valuenow`.
7. Set status `data-state="success"`.
8. Set status label to `Live catalog`.

Recommended structure:

```js
function renderCatalogOverview(catalog) {
  const metrics = getCatalogOverview(catalog);

  document.getElementById('overview-devices').textContent = metrics.devices;
  document.getElementById('overview-active').textContent = metrics.active;
  document.getElementById('overview-categories').textContent = metrics.categories;
  document.getElementById('overview-variants').textContent = metrics.variants;
  document.getElementById('overview-coverage-value').textContent = `${metrics.coverage}%`;

  const progress = document.getElementById('overview-progress');
  progress.setAttribute('aria-valuenow', String(metrics.coverage));
  document.getElementById('overview-progress-fill').style.width = `${metrics.coverage}%`;

  document.querySelectorAll('.overview-value').forEach(value => {
    value.classList.remove('is-loading');
  });

  const empty = metrics.devices === 0;
  const status = document.getElementById('overview-status');
  status.dataset.state = empty ? 'empty' : 'success';
  document.getElementById('overview-status-label').textContent = empty
    ? 'Empty catalog'
    : 'Live catalog';
}
```

### Error Renderer

Add `renderCatalogOverviewError()` and call it inside the existing `init()` catch block before showing the page error state.

```js
function renderCatalogOverviewError() {
  document.querySelectorAll('.overview-value').forEach(value => {
    value.textContent = 'Unavailable';
    value.classList.remove('is-loading');
  });

  document.getElementById('overview-coverage-value').textContent = 'Unavailable';
  document.getElementById('overview-progress').setAttribute('aria-valuenow', '0');
  document.getElementById('overview-progress-fill').style.width = '0%';

  const status = document.getElementById('overview-status');
  status.dataset.state = 'error';
  document.getElementById('overview-status-label').textContent = 'Catalog unavailable';
}
```

### Initialization Order

The correct order after catalog fetch succeeds is:

```js
state.catalog = await res.json();
renderCatalogOverview(state.catalog);
setupUI();
parseURL();
```

Do not render success metrics before assigning `state.catalog`.

## 8. CSS Implementation

### File

`assets/styles.css`

### Remove Old Styles

Remove or replace:

- `.hero-stats`
- `.hero-stat`
- `.stat-value`
- `.stat-label`

Do not leave dead selectors.

### Required Layout

Desktop (1100px and wider):

- `.catalog-overview` spans the width of the hero content area.
- `.overview-grid` uses four equal columns.
- Coverage bar spans all columns below.

Tablet (768px to 1099px):

- Two columns.
- Metrics remain readable.
- No hidden overview content.

Mobile (below 768px):

- Two columns at 375px when labels fit.
- One column or compact two columns at 320px if required to prevent overflow.
- Never use a fixed metric width.
- No horizontal page overflow.

### Required CSS Properties

Use this as the implementation baseline:

```css
.catalog-overview {
  position: relative;
  margin-top: var(--space-6);
  padding: var(--space-5);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background:
    radial-gradient(circle at 90% 0%, rgba(84, 167, 255, 0.12), transparent 38%),
    var(--surface);
  overflow: hidden;
}

.overview-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
  margin-bottom: var(--space-5);
}

.overview-header h2 {
  margin: 0;
  font-family: var(--font-mono);
  font-size: 0.75rem;
  font-weight: 600;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--text-secondary);
}

.overview-status {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  font-size: 0.7rem;
  font-family: var(--font-mono);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--text-muted);
}

.overview-status-dot {
  width: 7px;
  height: 7px;
  border-radius: var(--radius-full);
  background: var(--text-muted);
}

.overview-status[data-state="success"] .overview-status-dot {
  background: var(--success);
  box-shadow: 0 0 10px rgba(75, 210, 139, 0.45);
}

.overview-status[data-state="error"] .overview-status-dot {
  background: var(--danger);
  box-shadow: 0 0 10px rgba(255, 107, 114, 0.35);
}

.overview-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 1px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--border);
  overflow: hidden;
}

.overview-metric {
  min-width: 0;
  padding: var(--space-4);
  background: rgba(9, 13, 20, 0.72);
}

.overview-value {
  display: block;
  margin-top: var(--space-3);
  font-family: var(--font-mono);
  font-size: clamp(1.75rem, 3vw, 2.5rem);
  font-weight: 600;
  line-height: 1;
  font-variant-numeric: tabular-nums;
}

.overview-value.is-loading {
  font-size: 0.8rem;
  color: var(--text-muted);
}

.overview-metric h3 {
  margin: var(--space-3) 0 var(--space-1);
  font-size: 0.875rem;
}

.overview-metric p {
  margin: 0;
  font-size: 0.75rem;
  color: var(--text-muted);
  overflow-wrap: anywhere;
}

.overview-coverage {
  margin-top: var(--space-5);
}

.overview-coverage-label {
  display: flex;
  justify-content: space-between;
  margin-bottom: var(--space-2);
  font-size: 0.75rem;
  color: var(--text-secondary);
}

.overview-progress {
  height: 7px;
  border-radius: var(--radius-full);
  background: var(--surface-raised);
  overflow: hidden;
}

.overview-progress-fill {
  display: block;
  width: 0;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, var(--accent), var(--success));
  transition: width 300ms var(--ease);
}
```

Add responsive rules:

```css
@media (max-width: 1099px) {
  .overview-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}

@media (max-width: 479px) {
  .catalog-overview { padding: var(--space-4); }
  .overview-grid { grid-template-columns: 1fr; }
  .overview-header { align-items: flex-start; flex-direction: column; }
}
```

Respect the existing reduced-motion media query. Do not add infinite animation.

## 9. Filter Bug Guardrail

The redesign must not regress the category chip fix.

`removeFilter(type, val)` must keep this behavior:

```js
function removeFilter(type, val) {
  const inputName = type === 'category' ? 'category' : 'status';
  state.filters[type] = state.filters[type].filter(value => value !== val);

  const checkbox = els.filterPanel.querySelector(
    `input[name="${inputName}"][value="${val}"]`
  );

  if (checkbox) checkbox.checked = false;
  updateURL();
  render();
}
```

Never restore the old selector `input[name="cat"]` because category checkboxes are named `category`. URL query parameters may remain `cat`; DOM input names must remain `category`.

## 10. Automated Tests

### Pure Helper Tests

File: `tests/lib.test.mjs`

Add tests for `getCatalogOverview()`:

1. Counts all devices.
2. Counts each active device once even when multiple variants are active.
3. Does not count incomplete/declared-only/unsupported as active.
4. Counts unique categories.
5. Counts all variants, including `micro-modular`.
6. Calculates rounded coverage.
7. Returns zeros for missing/empty arrays.
8. Does not throw when a device lacks `variantSupport`.

Required example:

```js
test('getCatalogOverview counts active devices once', () => {
  const overview = getCatalogOverview({
    variants: [{ key: 'micro' }, { key: 'ccu' }],
    devices: [
      {
        category: 'environmental',
        variantSupport: {
          micro: { status: 'active' },
          ccu: { status: 'active' }
        }
      },
      {
        category: 'digital-io',
        variantSupport: {
          micro: { status: 'unsupported' }
        }
      }
    ]
  });

  assert.deepEqual(overview, {
    devices: 2,
    active: 1,
    categories: 2,
    variants: 2,
    coverage: 50
  });
});
```

### Browser Tests

Run with Playwright or the existing browser smoke approach.

Required assertions:

1. `#overview-devices` equals `44` for the current catalog.
2. `#overview-categories` equals `15` for the current catalog.
3. `#overview-variants` equals `5`.
4. `#overview-active` equals the value returned by `getCatalogOverview()` for the current catalog; do not hardcode until calculated.
5. No `.overview-value` contains `–` after load.
6. No `.overview-value` contains `Loading…` after load.
7. Progress width and `aria-valuenow` equal calculated coverage.
8. Status label reads `Live catalog`.
9. Category chip removal still works:
   - Load `?cat=digital-io&cat=environmental`.
   - Click X on Digital I/O chip.
   - Verify Digital I/O chip disappears.
   - Verify Digital I/O checkbox is unchecked.
   - Verify Environmental remains checked.
   - Verify no console error.
10. No horizontal overflow at `320`, `375`, `768`, and `1440` pixels.

### Failure Test

Intercept `data/catalog.json` and return HTTP 500:

- All overview values display `Unavailable`.
- Status displays `Catalog unavailable`.
- Existing catalog error UI remains visible.
- No unhandled promise rejection.

## 11. Implementation Order

Execute exactly in this sequence:

1. Confirm branch is `feat/catalog-hardening` and PR #7 is open.
2. Run baseline:
   - `node scripts/validate-catalog.mjs`
   - `node --test tests/*.test.mjs` on Linux, or quote the glob only in PowerShell where appropriate.
3. Add `getCatalogOverview()` to `assets/lib.mjs`.
4. Add helper tests and make them pass.
5. Replace overview markup in `index.html`.
6. Replace `renderStats()` with `renderCatalogOverview()`.
7. Add `renderCatalogOverviewError()` to the init catch path.
8. Remove old overview CSS and add the new panel CSS.
9. Run syntax check, validator, and all tests.
10. Run browser verification including filter chip removal.
11. Run responsive overflow checks.
12. Run `git diff --check`.
13. Commit only intended files.
14. Push to `feat/catalog-hardening` so PR #7 updates.
15. Confirm GitHub CI is green.
16. Merge only after CI is green and PR state is `CLEAN`.
17. Verify the deployed GitHub Pages page no longer shows dashes.

## 12. Expected Files Changed

- `index.html`
- `assets/app.js`
- `assets/lib.mjs`
- `assets/styles.css`
- `tests/lib.test.mjs`
- Optional browser smoke test file only if the repository adopts it permanently.

Do not modify:

- `data/catalog.json` unless metric verification reveals invalid catalog data.
- `add-tibbits.js`.
- `update-20.js`.
- Device IDs or catalog meanings.

## 13. Acceptance Criteria

The redesign is complete only when all conditions below are true:

- The overview does not consist of plain `–` plus labels.
- After successful load, four real numeric values are visible.
- Current catalog displays `44` devices, `15` categories, and `5` variants.
- Active support is calculated from actual status data and is not hardcoded.
- Active coverage percentage is displayed and accessible.
- Loading, empty, and error states are visually explicit.
- The panel matches the Nexabrick dark hardware dashboard aesthetic.
- Category chips can be removed with X without exceptions.
- Checkboxes, chips, URL state, and results remain synchronized.
- No horizontal overflow at supported widths.
- All automated tests pass.
- CI passes on PR #7.
- Hosted GitHub Pages shows numbers rather than dashes after deployment.

## 14. Final Verification Report Format

The implementation model must report:

```text
Overview:
- Devices Indexed: <number>
- Active Support: <number>
- Categories: <number>
- Variants: <number>
- Coverage: <percentage>

Verification:
- Validator: PASS/FAIL
- Unit tests: <passed>/<total>
- Browser console errors: <count>
- Category chip removal: PASS/FAIL
- 320px overflow: PASS/FAIL
- 375px overflow: PASS/FAIL
- 768px overflow: PASS/FAIL
- 1440px overflow: PASS/FAIL
- GitHub CI: PASS/FAIL
- Hosted page verified: YES/NO
```

Do not claim completion if the hosted page still shows `–`, `Loading…`, or stale overview markup.
