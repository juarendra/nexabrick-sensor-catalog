import { escape, formatEnum, normalize, filterDevices, parseIdParam, sanitizeCategory, safeUrl, assetUrl, getCatalogOverview } from './lib.mjs';

const MODEL_VIEWER_CDN = 'https://cdn.jsdelivr.net/npm/@google/model-viewer@3.5.0/dist/model-viewer.min.js';
let modelViewerPromise = null;
const modelLoadTimers = new Map();

const state = {
  catalog: null,
  filters: { status: [], category: [] },
  search: '',
  selectedId: null,
  variant: null,
  opener: null
};

// UI Elements
const els = {
  variantPlates: document.getElementById('variant-plates'),
  grid: document.getElementById('catalog-grid'),
  search: document.getElementById('search-input'),
  clearSearch: document.getElementById('btn-clear-search'),
  filterPanel: document.getElementById('filter-panel'),
  filterCats: document.getElementById('filter-categories'),
  activeFilters: document.getElementById('active-filters'),
  summary: document.getElementById('results-summary'),
  empty: document.getElementById('empty-state'),
  error: document.getElementById('error-state'),
  drawer: document.getElementById('detail-drawer'),
  detailMediaSection: document.getElementById('detail-media-section'),
  detailMedia: document.getElementById('detail-media')
};

// Colors matching CSS
const catColors = {
  'environmental': 'var(--cat-env)',
  'composite-air-quality': 'var(--cat-air)',
  'air-quality': 'var(--cat-air)',
  'pressure': 'var(--cat-pressure)',
  'airflow': 'var(--cat-pressure)',
  'level': 'var(--cat-pressure)',
  'motion': 'var(--cat-motion)',
  'presence': 'var(--cat-motion)',
  'distance': 'var(--cat-motion)',
  'energy': 'var(--cat-energy)',
  'digital-io': 'var(--cat-io)',
  'actuator': 'var(--cat-io)',
  'composite-thermal': 'var(--cat-thermal)',
  'smoke': 'var(--cat-air)',
  'light': 'var(--warning)',
  'sentinel': 'var(--text-muted)'
};

async function init() {
  try {
    const res = await fetch('data/catalog.json');
    if (!res.ok) throw new Error('Fetch failed');
    state.catalog = await res.json();
    
    renderCatalogOverview(state.catalog);
    setupUI();
    parseURL();

    // Global keyboard
    document.addEventListener('keydown', (e) => {
      if (e.key === '/' && document.activeElement !== els.search) {
        e.preventDefault();
        els.search.focus();
      }
      if (e.key === 'Escape') {
        if (els.search === document.activeElement && els.search.value) {
          els.search.value = '';
          updateSearch();
        } else if (state.selectedId !== null) {
          closeDetail();
        } else if (els.filterPanel.classList.contains('open')) {
          els.filterPanel.classList.remove('open');
        }
      }
    });

    // Delegated click for dynamic content (cards, chips, matrix copy)
    document.addEventListener('click', (e) => {
      const card = e.target.closest('.card');
      if (card) {
        const id = parseIdParam(card.dataset.id);
        if (id !== null) window.openDetail(id, true, card);
        return;
      }
      const chip = e.target.closest('[data-remove-filter]');
      if (chip) {
        const type = chip.dataset.removeFilter;
        const val = chip.dataset.value;
        if (type && val) removeFilter(type, val);
        return;
      }
      const copy = e.target.closest('[data-copy]');
      if (copy) {
        copyText(copy.dataset.copy);
        return;
      }
    });

    // Keyboard activation for role=button cards
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const card = e.target.closest('.card');
      if (!card) return;
      e.preventDefault();
      const id = parseIdParam(card.dataset.id);
      if (id !== null) window.openDetail(id, true, card);
    });

    // Focus trap while drawer is open
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Tab' || !state.selectedId) return;
      const focusables = els.drawer.querySelectorAll('button, a[href], [tabindex]:not([tabindex="-1"])');
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    });

  } catch (err) {
    console.error(err);
    renderCatalogOverviewError();
    els.grid.innerHTML = '';
    els.error.style.display = 'block';
  }
}

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

function setupUI() {
  // Variant plates
  const visibleVariants = state.catalog.variants.filter(v => v.key !== 'micro-modular');
  els.variantPlates.innerHTML = visibleVariants.map(v => `
    <button class="variant-plate" type="button" data-vk="${escape(v.key)}" aria-pressed="${state.variant === v.key ? 'true' : 'false'}">
      <div class="vp-main">
        <span class="vp-name">${escape(v.name)}</span>
        <span class="vp-desc">${escape(v.description)}</span>
      </div>
      <span class="vp-stat">${v.capacity} dev</span>
    </button>
  `).join('');

  // Variant plate click -> toggle variant filter
  els.variantPlates.addEventListener('click', (e) => {
    const plate = e.target.closest('.variant-plate');
    if (!plate) return;
    const vk = plate.dataset.vk;
    state.variant = state.variant === vk ? null : vk;
    updateURL();
    render();
    document.querySelectorAll('.variant-plate').forEach(p => {
      p.classList.toggle('active', p.dataset.vk === state.variant);
      p.setAttribute('aria-pressed', String(p.dataset.vk === state.variant));
    });
  });

  // Extract unique categories
  const cats = new Set(state.catalog.devices.map(d => d.category));
  els.filterCats.innerHTML = Array.from(cats).sort().map(c => `
    <label class="filter-checkbox">
      <input type="checkbox" name="category" value="${escape(c)}">
      <span class="cat-marker" style="background: ${catColors[c] || 'var(--cat-default)'}"></span>
      ${formatEnum(c)}
    </label>
  `).join('');

  // Events
  els.search.addEventListener('input', updateSearch);
  els.clearSearch.addEventListener('click', () => { els.search.value = ''; updateSearch(); els.search.focus(); });
  
  document.getElementById('btn-explore').addEventListener('click', () => els.search.focus());
  document.getElementById('btn-empty-reset').addEventListener('click', resetAll);
  document.getElementById('btn-reset-filters').addEventListener('click', resetAll);
  
  // Mobile filters
  document.getElementById('btn-open-filters').addEventListener('click', () => els.filterPanel.classList.add('open'));
  document.getElementById('btn-close-filters').addEventListener('click', () => els.filterPanel.classList.remove('open'));
  document.getElementById('btn-apply-filters').addEventListener('click', () => els.filterPanel.classList.remove('open'));
  
  // Filter checkboxes
  els.filterPanel.querySelectorAll('input[type="checkbox"]').forEach(cb => {
    cb.addEventListener('change', updateFilters);
  });
  
  // Drawer
  document.getElementById('btn-close-detail').addEventListener('click', closeDetail);
  document.getElementById('drawer-backdrop').addEventListener('click', closeDetail);

  // Media viewer + image gallery controls (delegated, so re-renders are safe)
  els.detailMedia.addEventListener('click', handleMediaClick);
  els.detailMedia.addEventListener('keydown', handleMediaKeydown);
  els.detailMedia.addEventListener('error', handleMediaImageError, true);

  // Browser back button handling for detail view
  window.addEventListener('popstate', parseURL);
}

function parseURL() {
  const params = new URLSearchParams(window.location.search);
  
  state.search = params.get('q') || '';
  els.search.value = state.search;
  els.clearSearch.style.display = state.search ? 'block' : 'none';
  
  const knownCategories = new Set(state.catalog.devices.map(d => d.category));
  state.filters.status = [];
  state.filters.category = params.getAll('cat').map(c => sanitizeCategory(c, knownCategories)).filter(c => c !== null);
  
  // Variant filter (optional URL key, preserved for backward compat)
  const vParam = params.get('variant');
  state.variant = state.catalog.variants.some(v => v.key === vParam) ? vParam : null;
  
  // Sync checkboxes
  els.filterPanel.querySelectorAll('input[name="category"]').forEach(cb => {
    cb.checked = state.filters.category.includes(cb.value);
  });
  
  // Sync variant plates
  document.querySelectorAll('.variant-plate').forEach(p => {
    p.classList.toggle('active', p.dataset.vk === state.variant);
    p.setAttribute('aria-pressed', String(p.dataset.vk === state.variant));
  });
  
  const idParam = params.get('id');
  const id = parseIdParam(idParam);
  if (id !== null) {
    openDetail(id, false);
  } else {
    clearAllModelTimers();
    state.selectedId = null;
    els.drawer.classList.remove('open');
    els.drawer.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('drawer-open');
    document.querySelectorAll('.card.selected').forEach(c => c.classList.remove('selected'));
  }
  
  render();
}

function updateURL() {
  const params = new URLSearchParams();
  if (state.search) params.set('q', state.search);
  state.filters.category.forEach(c => params.append('cat', c));
  if (state.variant) params.set('variant', state.variant);
  if (state.selectedId !== null) params.set('id', state.selectedId);
  
  const newUrl = `${window.location.pathname}${params.toString() ? '?' + params.toString() : ''}`;
  window.history.pushState({}, '', newUrl);
}

function updateSearch() {
  state.search = normalize(els.search.value);
  els.clearSearch.style.display = state.search ? 'block' : 'none';
  updateURL();
  render();
}

function updateFilters() {
  state.filters.status = [];
  state.filters.category = Array.from(els.filterPanel.querySelectorAll('input[name="category"]:checked')).map(cb => cb.value);
  updateURL();
  render();
}

function resetAll() {
  els.search.value = '';
  state.search = '';
  state.variant = null;
  els.filterPanel.querySelectorAll('input').forEach(cb => cb.checked = false);
  state.filters.status = [];
  state.filters.category = [];
  document.querySelectorAll('.variant-plate').forEach(p => {
    p.classList.remove('active');
    p.setAttribute('aria-pressed', 'false');
  });
  updateURL();
  render();
}

function removeFilter(type, val) {
  const inputName = type === 'category' ? 'category' : 'status';
  state.filters[type] = state.filters[type].filter(v => v !== val);
  const cb = els.filterPanel.querySelector(`input[name="${inputName}"][value="${val}"]`);
  if (cb) cb.checked = false;
  updateURL();
  render();
}

function render() {
  // 1. Filter logic
  let filtered = filterDevices(state.catalog.devices, {
    search: state.search,
    filters: state.filters
  });
  
  // Variant plate filter
  if (state.variant) {
    filtered = filtered.filter(d => d.variantSupport[state.variant]?.status === 'active');
  }

  // 2. Render Cards
  if (filtered.length === 0) {
    els.grid.innerHTML = '';
    els.empty.style.display = 'block';
  } else {
    els.empty.style.display = 'none';
    els.grid.innerHTML = filtered.map(d => {
      const color = catColors[d.category] || 'var(--cat-default)';
      const isSel = d.id === state.selectedId ? 'selected' : '';
      const pcbNumber = d.pcb?.number || '—';
      const pcbClass = d.pcb?.number ? '' : 'unresolved';
      
      // Determine overall support label for badge
      let overall = 'uns'; let oLbl = 'Tidak tersedia';
      const vals = Object.values(d.variantSupport).map(v => v.status);
      if (vals.includes('active') || vals.includes('auxiliary')) { overall = 'act'; oLbl = 'Aktif'; }
      
      // Physical summary
      let phys = 'Generic / Undocumented';
      if (d.physicalParts && d.physicalParts.length === 1) phys = d.physicalParts[0].part;
      else if (d.physicalParts && d.physicalParts.length > 1) phys = `${d.physicalParts.length} components (Composite)`;
      
      // Variant support dots
      const vDots = state.catalog.variants
        .filter(v => v.key !== 'micro-modular')
        .map(vk => {
          const s = d.variantSupport[vk.key]?.status || 'unsupported';
          const on = s === 'active' || s === 'auxiliary';
          const cl = on ? 'on' : 'off';
          const lbl = on ? 'Aktif' : 'Tidak tersedia';
          return `<div class="v-dot ${cl}" role="img" title="${vk.key}: ${lbl}" aria-label="${vk.key}: ${lbl}"></div>`;
        }).join('');

      return `
        <div class="card ${isSel}" data-id="${d.id}" role="button" tabindex="0" aria-label="Detail ${d.id} ${escape(d.displayName)}">
          <div class="card-header">
            <div class="card-id-rail">
              <span class="id-badge">${d.id.toString().padStart(2, '0')}</span>
              <span class="cat-marker" style="background: ${color}" title="${formatEnum(d.category)}"></span>
            </div>
            <div class="card-badges">
              <span class="pcb-badge ${pcbClass}" title="Nomor PCB Tibbit">PCB ${escape(pcbNumber)}</span>
              <span class="badge ${overall}">${oLbl}</span>
            </div>
          </div>
          <div class="card-title">${escape(d.displayName)}</div>
          <div class="card-soft">${escape(d.softwareName)}</div>
          <div class="card-desc">${escape(d.summary)}</div>
          <div class="card-meta">
            <div class="ic-stack">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="2" ry="2"></rect><rect x="9" y="9" width="6" height="6"></rect><line x1="9" y1="1" x2="9" y2="4"></line><line x1="15" y1="1" x2="15" y2="4"></line><line x1="9" y1="20" x2="9" y2="23"></line><line x1="15" y1="20" x2="15" y2="23"></line><line x1="20" y1="9" x2="23" y2="9"></line><line x1="20" y1="14" x2="23" y2="14"></line><line x1="1" y1="9" x2="4" y2="9"></line><line x1="1" y1="14" x2="4" y2="14"></line></svg>
              ${escape(phys)}
            </div>
            <div class="var-dots">${vDots}</div>
          </div>
        </div>
      `;
    }).join('');
  }

  // 3. Render Active Filter Chips
  const chips = [];
  state.filters.category.forEach(c => chips.push(`<div class="filter-chip">Cat: ${formatEnum(c)} <button type="button" data-remove-filter="category" data-value="${c}" aria-label="Hapus filter kategori ${formatEnum(c)}"><svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></button></div>`));
  
  els.activeFilters.innerHTML = chips.join('');
  els.summary.textContent = `Menampilkan ${filtered.length} perangkat dari total ${state.catalog.devices.length}`;
}

// --- 3D viewer + reference image media renderer ---
// All catalog text is escaped. All asset paths are repository-relative and go
// through assetUrl(). The pinned model-viewer module is loaded lazily once and
// never blocks catalog browsing or detail rendering.
const MODEL_STATUS = {
  loading: 'Model sedang dimuat...',
  ready: 'Model 3D tersedia',
  unavailable: 'Penampil 3D tidak tersedia',
  error: 'Model 3D gagal dimuat. Gambar pratinjau tetap tersedia.',
  'no-model': 'Model 3D tidak tersedia'
};

const dlIcon = '<svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>';

function getReducedMotion() {
  return typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function ensureModelViewer() {
  if (modelViewerPromise) return modelViewerPromise;

  modelViewerPromise = new Promise((resolve, reject) => {
    let settled = false;
    const finish = (err = null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (err) reject(err);
      else resolve(true);
    };
    const timer = setTimeout(() => finish(new Error('Model viewer load timeout')), 15000);

    if (typeof customElements !== 'undefined' && customElements.get('model-viewer')) {
      finish();
      return;
    }

    const script = document.createElement('script');
    script.type = 'module';
    script.src = MODEL_VIEWER_CDN;
    script.addEventListener('error', () => finish(new Error('Model viewer CDN failed')));
    script.addEventListener('load', () => {
      if (typeof customElements !== 'undefined' && typeof customElements.whenDefined === 'function') {
        customElements.whenDefined('model-viewer')
          .then(() => finish())
          .catch(() => finish(new Error('Model viewer not defined')));
      } else if (typeof customElements !== 'undefined' && customElements.get('model-viewer')) {
        finish();
      } else {
        finish(new Error('Model viewer not defined'));
      }
    });
    document.head.appendChild(script);
  });

  return modelViewerPromise;
}

function clearModelTimer(key) {
  const timer = modelLoadTimers.get(key);
  if (timer) {
    clearTimeout(timer);
    modelLoadTimers.delete(key);
  }
}

function clearAllModelTimers() {
  modelLoadTimers.forEach(timer => clearTimeout(timer));
  modelLoadTimers.clear();
}

function isCurrentMediaGroup(groupEl, deviceId, groupIndex) {
  return groupEl
    && groupEl.isConnected
    && state.selectedId === deviceId
    && els.detailMedia.dataset.deviceId === String(deviceId)
    && groupEl.dataset.group === String(groupIndex);
}

function updateModelControls(groupEl, ready) {
  groupEl.querySelectorAll('[data-action="reset"], [data-action="rotate"], [data-action="fullscreen"]').forEach(btn => {
    btn.disabled = !ready;
  });
  const rotateBtn = groupEl.querySelector('[data-action="rotate"]');
  if (rotateBtn && ready) {
    rotateBtn.setAttribute('aria-pressed', String(rotateBtn.dataset.on === 'true'));
  }
}

function setModelFallback(groupEl, group, label, stateName) {
  const frame = groupEl.querySelector('.media-3d-frame');
  if (!frame) return;
  const poster = group.model ? assetUrl(group.model.poster) : null;
  const posterHtml = poster
    ? `<img class="media-model-poster" src="${poster}" alt="${escape(label + ' pratinjau model 3D')}" loading="lazy" decoding="async">`
    : '<div class="media-model-empty" aria-hidden="true"></div>';
  frame.dataset.state = stateName;
  frame.innerHTML = `${posterHtml}<span class="media-model-status" role="status">${escape(MODEL_STATUS[stateName] || '')}</span>`;
  updateModelControls(groupEl, false);
}

function setModelReady(groupEl, modelViewer) {
  const frame = groupEl.querySelector('.media-3d-frame');
  if (!frame) return;
  frame.dataset.state = 'ready';
  frame.querySelectorAll('.media-model-poster, .media-model-empty').forEach(node => node.remove());
  if (!frame.contains(modelViewer)) frame.prepend(modelViewer);
  const status = frame.querySelector('.media-model-status');
  if (status) status.textContent = MODEL_STATUS.ready;
  updateModelControls(groupEl, true);
}

function renderMedia(d) {
  const section = els.detailMediaSection;
  const container = els.detailMedia;
  if (!section || !container) return;
  const media = Array.isArray(d.media) ? d.media : [];
  if (media.length === 0) {
    section.style.display = 'none';
    section.setAttribute('aria-hidden', 'true');
    container.innerHTML = '';
    return;
  }
  section.style.display = 'block';
  section.setAttribute('aria-hidden', 'false');
  container.dataset.deviceId = String(d.id);

  clearAllModelTimers();
  container.innerHTML = media.map((g, gi) => renderMediaGroup(g, gi)).join('');

  container.querySelectorAll('.media-group').forEach(groupEl => {
    const gi = Number(groupEl.dataset.group);
    const group = media[gi];
    if (!group) return;
    if (group.model && assetUrl(group.model.src)) {
      setupModelViewer(groupEl, group);
    } else {
      setModelFallback(groupEl, group, group.label || 'Model 3D', 'no-model');
    }
  });
}
function renderModbus(d) {
  const existing = document.getElementById('detail-modbus-section');
  const modbus = d.modbus;
  if (!modbus) {
    if (existing) existing.remove();
    return;
  }

  const section = existing || document.createElement('section');
  section.id = 'detail-modbus-section';
  section.className = 'dossier-section modbus-section';
  if (!existing) els.detailMediaSection.insertAdjacentElement('afterend', section);

  if (modbus.available === false) {
    section.innerHTML = `
      <h3>REGISTER MODBUS (NEXABRICK MICRO)</h3>
      <p class="modbus-note">${escape(modbus.description)}</p>
    `;
    return;
  }

  const registers = Array.isArray(modbus.registers) ? modbus.registers : [];
  const rows = registers.map(reg => `
    <tr>
      <td>${escape(reg.address)}</td>
      <td>${escape(reg.regs)}</td>
      <td>${escape(reg.fc)}</td>
      <td>${escape(reg.name)}</td>
      <td class="modbus-data-type">${escape(reg.dataType)}</td>
      <td>${escape(reg.access)}</td>
      <td>${reg.unit ? escape(reg.unit) : '-'}</td>
      <td>${reg.scale === null || reg.scale === undefined ? '-' : escape(reg.scale)}</td>
    </tr>
  `).join('');

  section.innerHTML = `
    <h3>REGISTER MODBUS (NEXABRICK MICRO)</h3>
    <p class="modbus-intro">Alamat basis ${escape(modbus.base)}, selang antar slot ${escape(modbus.slotStride)} register</p>
    <div class="modbus-table-wrap">
      <table class="modbus-table">
        <thead>
          <tr><th>Alamat</th><th>Reg</th><th>FC</th><th>Nama</th><th>Tipe Data</th><th>Akses</th><th>Unit</th><th>Skala</th></tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}


function renderMediaGroup(g, gi) {
  const label = g.label || '';
  const variant = g.variant || '';
  const description = g.description || '';
  const status = g.hardwareStatus || 'pending';
  const statusCls = status === 'hardware-verified' ? 'ok'
    : (status === 'not-qualified' ? 'bad' : 'pending');
  const note = g.note || '';

  const images = Array.isArray(g.images) ? g.images : [];
  const validImages = [];
  images.forEach(img => {
    const src = assetUrl(img ? img.src : '');
    if (!src) return;
    const alt = (img && img.alt) ? img.alt : label;
    validImages.push({ src, alt });
  });

  const thumbsHtml = validImages.map((img, ii) => `
    <button type="button" class="media-thumb${ii === 0 ? ' active' : ''}" data-action="thumb" data-group="${gi}" data-idx="${ii}" aria-current="${ii === 0 ? 'true' : 'false'}" aria-label="Tampilkan gambar ${ii + 1}: ${escape(img.alt)}">
      <img src="${img.src}" alt="${escape(img.alt)}" loading="lazy" decoding="async">
    </button>`).join('');

  const model = (g.model && typeof g.model === 'object') ? g.model : null;
  const modelSrc = model ? assetUrl(model.src) : null;
  const poster = model ? assetUrl(model.poster) : null;
  const modelFilename = model ? (model.src.split('/').pop() || 'model.glb') : 'model.glb';
  const modelState = modelSrc ? 'loading' : 'unavailable';
  const autoInitial = Boolean(modelSrc) && !getReducedMotion();
  const fullscreenSupported = typeof document !== 'undefined'
    && 'fullscreenEnabled' in document
    && typeof Element !== 'undefined'
    && 'requestFullscreen' in Element.prototype;

  const posterHtml = poster
    ? `<img class="media-model-poster" src="${poster}" alt="${escape(label + ' pratinjau model 3D')}" loading="lazy" decoding="async">`
    : '<div class="media-model-empty" aria-hidden="true"></div>';

  const controlsHtml = `
    <button type="button" class="media-model-btn" data-action="reset" aria-label="Atur ulang tampilan model" disabled>Reset</button>
    <button type="button" class="media-model-btn" data-action="rotate" data-on="${String(autoInitial)}" aria-pressed="${String(autoInitial)}" aria-label="Aktifkan rotasi otomatis" disabled>Rotasi</button>
    ${fullscreenSupported && modelSrc ? '<button type="button" class="media-model-btn" data-action="fullscreen" aria-label="Buka model dalam layar penuh" disabled>Layar Penuh</button>' : ''}
    ${modelSrc ? `<a class="media-model-btn media-dl" href="${modelSrc}" download="${escape(modelFilename)}" aria-label="Unduh model GLB">GLB</a>` : ''}
  `;

  const downloads = Array.isArray(g.cadDownloads) ? g.cadDownloads : [];
  const dlHtml = downloads.map(dl => {
    const url = assetUrl(dl ? dl.src : '');
    if (!url) return '';
    const filename = (dl.src || '').split('/').pop() || '';
    return `<a class="media-dl" href="${url}" download="${escape(filename)}" title="${escape(dl.format || 'CAD file')}">${dlIcon}<span>${escape(dl.label || ('Download ' + (dl.format || 'file')))}</span></a>`;
  }).join('');

  const stageHtml = validImages.length
    ? `<img class="media-gallery-img" src="${validImages[0].src}" alt="${escape(validImages[0].alt)}" loading="eager" decoding="async">`
    : '<div class="media-gallery-empty">Gambar tidak tersedia</div>';

  const countText = validImages.length ? `1 / ${validImages.length}` : '-';

  return `<article class="media-group" data-group="${gi}" data-selected="0">
    <div class="media-group-head">
      <div class="media-group-title">
        <span class="media-group-label">${escape(label)}</span>
        ${description ? `<span class="media-group-desc">${escape(description)}</span>` : ''}
      </div>
      ${variant ? `<span class="media-variant-badge">VARIAN ${escape(formatEnum(variant))}</span>` : ''}
      <span class="media-status ${statusCls}">STATUS HARDWARE: ${escape(formatEnum(status))}</span>
    </div>
    <div class="media-visual-grid">
      <section class="media-model-panel" aria-label="Model 3D ${escape(label)}">
        <h4 class="media-panel-title">MODEL 3D</h4>
        <div class="media-3d-frame" data-state="${modelState}">${posterHtml}<span class="media-model-status" role="status">${escape(MODEL_STATUS[modelState])}</span></div>
        <div class="media-model-controls">${controlsHtml}</div>
      </section>
      <section class="media-gallery-panel" aria-label="Gambar referensi ${escape(label)}">
        <div class="media-gallery-header">
          <h4 class="media-panel-title">GAMBAR REFERENSI</h4>
          <span class="media-gallery-count" data-count>${escape(countText)}</span>
        </div>
        <div class="media-gallery" tabindex="0" role="group" aria-label="Navigasi gambar ${escape(label)}" data-selected="0">
          <div class="media-gallery-stage" data-stage>${stageHtml}</div>
          ${validImages.length ? `
          <div class="media-gallery-controls">
            <button type="button" class="media-nav-btn" data-action="prev" aria-label="Gambar sebelumnya" ${validImages.length <= 1 ? 'disabled' : ''}>&#8249;</button>
            <span class="media-gallery-count" data-count>${escape(countText)}</span>
            <button type="button" class="media-nav-btn" data-action="next" aria-label="Gambar berikutnya" ${validImages.length <= 1 ? 'disabled' : ''}>&#8250;</button>
          </div>` : ''}
          <div class="media-thumbs" role="group" aria-label="Daftar gambar ${escape(label)}">${thumbsHtml}</div>
        </div>
      </section>
    </div>
    ${dlHtml ? `<div class="media-files"><h4 class="media-panel-title">FILE CAD</h4><div class="media-downloads">${dlHtml}</div></div>` : ''}
    ${note ? `<p class="media-note">${escape(note)}</p>` : ''}
  </article>`;
}

function setupModelViewer(groupEl, group) {
  const label = group.label || '';
  const modelSrc = group.model ? assetUrl(group.model.src) : null;
  if (!modelSrc) {
    setModelFallback(groupEl, group, label, 'no-model');
    return;
  }

  const deviceId = Number(els.detailMedia.dataset.deviceId);
  const groupIndex = Number(groupEl.dataset.group);
  const key = `${deviceId}:${groupIndex}`;
  clearModelTimer(key);

  ensureModelViewer().then(() => {
    if (!isCurrentMediaGroup(groupEl, deviceId, groupIndex)) return;

    const frame = groupEl.querySelector('.media-3d-frame');
    if (!frame) return;

    const reduced = getReducedMotion();
    const autoRotate = !reduced;
    const modelViewer = document.createElement('model-viewer');
    modelViewer.setAttribute('src', modelSrc);
    modelViewer.setAttribute('alt', `${label} model 3D interaktif`);
    modelViewer.setAttribute('camera-controls', '');
    modelViewer.setAttribute('loading', 'eager');
    modelViewer.setAttribute('shadow-intensity', '1');
    modelViewer.setAttribute('exposure', '1');
    modelViewer.setAttribute('auto-rotate', String(autoRotate));
    if (group.model && assetUrl(group.model.poster)) {
      modelViewer.setAttribute('poster', assetUrl(group.model.poster));
    }

    frame.querySelectorAll('model-viewer').forEach(node => node.remove());
    frame.appendChild(modelViewer);
    updateModelControls(groupEl, false);

    const timer = setTimeout(() => {
      clearModelTimer(key);
      if (!isCurrentMediaGroup(groupEl, deviceId, groupIndex)) return;
      if (modelViewer.isConnected && modelViewer.getAttribute('data-loaded') !== 'true') {
        setModelFallback(groupEl, group, label, 'error');
      }
    }, 15000);
    modelLoadTimers.set(key, timer);

    modelViewer.addEventListener('load', () => {
      clearModelTimer(key);
      if (!isCurrentMediaGroup(groupEl, deviceId, groupIndex)) return;
      modelViewer.setAttribute('data-loaded', 'true');
      try { modelViewer.autoRotate = autoRotate; } catch (e) { /* no-op */ }
      try {
        modelViewer.dataset.defaultOrbit = modelViewer.cameraOrbit;
        modelViewer.dataset.defaultTarget = modelViewer.cameraTarget;
      } catch (e) { /* no-op */ }
      setModelReady(groupEl, modelViewer);
    }, { once: true });

    modelViewer.addEventListener('error', () => {
      clearModelTimer(key);
      if (!isCurrentMediaGroup(groupEl, deviceId, groupIndex)) return;
      setModelFallback(groupEl, group, label, 'error');
    }, { once: true });
  }).catch(() => {
    if (!isCurrentMediaGroup(groupEl, deviceId, groupIndex)) return;
    setModelFallback(groupEl, group, label, 'unavailable');
  });
}

function getCurrentMedia() {
  if (!state.catalog || state.selectedId === null) return [];
  const d = state.catalog.devices.find(x => x.id === state.selectedId);
  return (d && Array.isArray(d.media)) ? d.media : [];
}

function selectMediaImage(groupEl, idx) {
  const thumbs = Array.from(groupEl.querySelectorAll('.media-thumb'));
  if (!thumbs.length || idx < 0 || idx >= thumbs.length) return;

  groupEl.dataset.selected = String(idx);
  const galleryEl = groupEl.querySelector('.media-gallery');
  if (galleryEl) galleryEl.dataset.selected = String(idx);
  thumbs.forEach((t, i) => {
    const active = i === idx;
    t.classList.toggle('active', active);
    t.setAttribute('aria-current', active ? 'true' : 'false');
  });

  const stage = groupEl.querySelector('[data-stage]');
  const activeImg = thumbs[idx].querySelector('img');
  if (stage && activeImg) {
    const nextImg = document.createElement('img');
    nextImg.className = 'media-gallery-img';
    nextImg.src = activeImg.src;
    nextImg.alt = activeImg.alt || '';
    nextImg.loading = 'eager';
    nextImg.decoding = 'async';
    stage.replaceChildren(nextImg);
  }

  groupEl.querySelectorAll('[data-count]').forEach(el => {
    el.textContent = `${idx + 1} / ${thumbs.length}`;
  });

  const live = document.getElementById('live-region');
  if (live) live.textContent = `Gambar ${idx + 1} dari ${thumbs.length}.`;
}

function handleMediaClick(e) {
  const actionEl = e.target.closest('[data-action]');
  if (!actionEl || !els.detailMedia.contains(actionEl)) return;

  const groupEl = actionEl.closest('.media-group');
  if (!groupEl || !els.detailMedia.contains(groupEl)) return;

  const action = actionEl.dataset.action;
  const groupIndex = Number(groupEl.dataset.group);
  const media = getCurrentMedia();
  const group = media[groupIndex];
  if (!group) return;

  if (action === 'thumb') {
    selectMediaImage(groupEl, Number(actionEl.dataset.idx));
  } else if (action === 'prev' || action === 'next') {
    const count = groupEl.querySelectorAll('.media-thumb').length;
    if (!count) return;
    const current = Number(groupEl.dataset.selected || '0');
    const delta = action === 'prev' ? -1 : 1;
    selectMediaImage(groupEl, (current + delta + count) % count);
  } else if (action === 'reset') {
    const mv = groupEl.querySelector('model-viewer');
    if (!mv) return;
    try {
      if (mv.dataset.defaultOrbit) mv.cameraOrbit = mv.dataset.defaultOrbit;
      if (mv.dataset.defaultTarget) mv.cameraTarget = mv.dataset.defaultTarget;
      if (typeof mv.resetTurntableRotation === 'function') mv.resetTurntableRotation();
    } catch (e) { /* no-op */ }
  } else if (action === 'rotate') {
    const mv = groupEl.querySelector('model-viewer');
    if (!mv) return;
    const next = actionEl.dataset.on !== 'true';
    actionEl.dataset.on = String(next);
    actionEl.setAttribute('aria-pressed', String(next));
    try { mv.autoRotate = next; } catch (err) { /* no-op */ }
  } else if (action === 'fullscreen') {
    const frame = groupEl.querySelector('.media-3d-frame');
    if (!frame) return;
    if (document.fullscreenElement) {
      const p = document.exitFullscreen();
      if (p && p.catch) p.catch(() => {});
    } else if (typeof frame.requestFullscreen === 'function') {
      const p = frame.requestFullscreen();
      if (p && p.catch) p.catch(() => {});
    }
  }
}

function handleMediaKeydown(e) {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
  const groupEl = e.target.closest('.media-group');
  const galleryEl = e.target.closest('.media-gallery');
  if (!groupEl || !galleryEl || !els.detailMedia.contains(galleryEl)) return;

  const count = groupEl.querySelectorAll('.media-thumb').length;
  if (!count) return;

  let idx = Number(groupEl.dataset.selected || '0');
  if (e.key === 'ArrowLeft') idx = (idx - 1 + count) % count;
  else if (e.key === 'Home') idx = 0;
  else if (e.key === 'End') idx = count - 1;

  e.preventDefault();
  selectMediaImage(groupEl, idx);
}

function handleMediaImageError(e) {
  const img = e.target;
  if (!img || img.tagName !== 'IMG' || !els.detailMedia.contains(img)) return;

  if (img.classList.contains('media-gallery-img')) {
    const stage = img.closest('[data-stage]');
    if (stage) stage.innerHTML = '<div class="media-gallery-empty">Gambar tidak tersedia</div>';
  } else if (img.closest('.media-thumb')) {
    const thumb = img.closest('.media-thumb');
    thumb.classList.add('is-error');
    thumb.title = 'Gambar tidak tersedia';
  } else if (img.classList.contains('media-model-poster')) {
    img.remove();
  }
}

window.openDetail = function(id, pushState = true, opener = null) {
  const d = state.catalog.devices.find(x => x.id === id);
  if (!d) return;
  
  state.selectedId = id;
  state.opener = opener;
  if (pushState) updateURL();
  
  // Highlight card
  document.querySelectorAll('.card.selected').forEach(c => c.classList.remove('selected'));
  const card = document.querySelector(`.card[data-id="${id}"]`);
  if (card) card.classList.add('selected');
  
  // Populate Drawer
  document.getElementById('detail-id').textContent = id.toString().padStart(2, '0');
  document.getElementById('detail-category').textContent = formatEnum(d.category);
  document.getElementById('detail-title').textContent = d.displayName;
  
  const swEl = document.getElementById('detail-software-name');
  swEl.textContent = d.softwareName;
  swEl.dataset.copy = d.softwareName;
  
  document.getElementById('detail-purpose').textContent = d.purpose || d.summary;

  renderMedia(d);
  renderModbus(d);

  const pcb = d.pcb || {};
  const pcbResolved = Boolean(pcb.number);
  document.getElementById('detail-pcb').innerHTML = `
    <div class="pcb-number-block ${pcbResolved ? '' : 'unresolved'}">${pcbResolved ? escape(pcb.number) : '—'}</div>
      <div class="pcb-info-block">
        <span class="pcb-name">${pcbResolved ? escape(pcb.name) : 'PCB belum teridentifikasi'}</span>
      </div>
  `;
  
  // Parts
  const partsHtml = (d.physicalParts || []).map(p => `
    <div class="part-row">
      <div class="part-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="2" ry="2"></rect><rect x="9" y="9" width="6" height="6"></rect><line x1="9" y1="1" x2="9" y2="4"></line><line x1="15" y1="1" x2="15" y2="4"></line><line x1="9" y1="20" x2="9" y2="23"></line><line x1="15" y1="20" x2="15" y2="23"></line><line x1="20" y1="9" x2="23" y2="9"></line><line x1="20" y1="14" x2="23" y2="14"></line><line x1="1" y1="9" x2="4" y2="9"></line><line x1="1" y1="14" x2="4" y2="14"></line></svg></div>
      <div class="part-info">
        <span class="part-name">${escape(p.part)}</span>
        <span class="part-mfg">${escape(p.manufacturer)}</span>
      </div>
      <span class="part-role">${escape(p.role)}</span>
      ${safeUrl(p.officialUrl) ? `<a href="${safeUrl(p.officialUrl)}" target="_blank" rel="noopener noreferrer" title="Datasheet/Product Page" class="btn-icon"><svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg></a>` : ''}
    </div>
  `).join('');
  document.getElementById('detail-parts').innerHTML = partsHtml || '<span class="mx-lbl">N/A</span>';
  
  // Measurements
  const msHtml = (d.measurements || []).map(m => `
    <div class="ms-tag">
      <span>${escape(m.label)}</span>
      <span class="ms-unit">${escape(m.unit)}</span>
    </div>
  `).join('');
  document.getElementById('detail-measurements').innerHTML = msHtml || '<span class="mx-lbl">None</span>';
  
  // Variant Matrix
  const mxHtml = state.catalog.variants
    .filter(vk => vk.key !== 'micro-modular')
    .map(vk => {
    const vs = d.variantSupport[vk.key];
    const vName = vk.name;
    if (!vs) {
      return `
        <div class="mx-row">
          <div class="mx-head">
            <span class="mx-name">${escape(vName)}</span>
            <span class="mx-stat uns">Tidak tersedia</span>
          </div>
        </div>
      `;
    }
    const on = vs.status === 'active' || vs.status === 'auxiliary';
    const stCls = on ? 'act' : 'uns';
    const stLbl = on ? 'Aktif' : 'Tidak tersedia';
    
    let details = '';
    if (on) {
      if (vs.mqttDeviceName) details += `<span class="mx-lbl">MQTT</span><span class="mx-val code-badge" type="button" role="button" tabindex="0" data-copy="${escape(vs.mqttDeviceName)}" title="Copy" aria-label="Salin nama MQTT">${escape(vs.mqttDeviceName)}</span>`;
    }
    
    return `
      <div class="mx-row">
        <div class="mx-head">
          <span class="mx-name">${escape(vName)}</span>
            <span class="mx-stat ${stCls}">${stLbl}</span>
        </div>
        ${details ? `<div class="mx-data">${details}</div>` : ''}
      </div>
    `;
  }).join('');
  document.getElementById('detail-matrix').innerHTML = mxHtml;
  
  els.drawer.classList.add('open');
  els.drawer.setAttribute('aria-hidden', 'false');
  document.body.classList.add('drawer-open');
  els.drawer.querySelector('#btn-close-detail').focus();
}

window.closeDetail = function() {
  clearAllModelTimers();
  state.selectedId = null;
  els.drawer.classList.remove('open');
  els.drawer.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('drawer-open');
  document.querySelectorAll('.card.selected').forEach(c => c.classList.remove('selected'));
  updateURL();
  if (state.opener && document.contains(state.opener)) {
    state.opener.focus();
  } else {
    els.search.focus();
  }
  state.opener = null;
}

window.removeFilter = removeFilter;

window.copyText = function(text) {
  const toast = document.getElementById('toast');
  const live = document.getElementById('live-region');
  if (!navigator.clipboard || !navigator.clipboard.writeText) {
    toast.textContent = 'Clipboard tidak tersedia';
    live.textContent = 'Gagal menyalin ke clipboard.';
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 2500);
    return;
  }
  navigator.clipboard.writeText(text).then(() => {
    toast.textContent = `Tersalin: ${text}`;
    live.textContent = `${text} disalin ke clipboard.`;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 2500);
  }).catch(() => {
    toast.textContent = 'Gagal menyalin teks';
    live.textContent = 'Gagal menyalin ke clipboard.';
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 2500);
  });
}

// Start
init();
