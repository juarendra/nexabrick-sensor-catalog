import { escape, formatEnum, normalize, filterDevices, parseIdParam, sanitizeCategory } from './lib.mjs';

const state = {
  catalog: null,
  filters: { status: [], category: [] },
  search: '',
  selectedId: null,
  variant: null
};

// UI Elements
const els = {
  sourceRev: document.getElementById('source-revision'),
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
  drawer: document.getElementById('detail-drawer')
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

  } catch (err) {
    console.error(err);
    els.grid.innerHTML = '';
    els.error.style.display = 'block';
  }
}

const VALID_STATUSES = new Set(['active', 'incomplete', 'declared-only', 'ui-only', 'unsupported', 'reserved', 'auxiliary', 'actuator', 'unresolved']);
const BADGE_STATUS = {
  active: ['act', 'Active'],
  incomplete: ['warn', 'Incomplete'],
  'declared-only': ['warn', 'Declared Only'],
  auxiliary: ['aux', 'Auxiliary']
};

function setupUI() {
  // Source badge
  if (state.catalog.generatedFrom) {
    const sha = state.catalog.generatedFrom.commit.substring(0, 7);
    els.sourceRev.textContent = `FW: ${sha} (${state.catalog.generatedFrom.auditedAt})`;
    els.sourceRev.title = `Commit ${state.catalog.generatedFrom.commit}`;
  }

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
  
  // Browser back button handling for detail view
  window.addEventListener('popstate', parseURL);
}

function parseURL() {
  const params = new URLSearchParams(window.location.search);
  
  state.search = params.get('q') || '';
  els.search.value = state.search;
  els.clearSearch.style.display = state.search ? 'block' : 'none';
  
  // Whitelist filter values against catalog data
  const knownCategories = new Set(state.catalog.devices.map(d => d.category));
  state.filters.status = params.getAll('status').filter(s => VALID_STATUSES.has(s));
  state.filters.category = params.getAll('cat').map(c => sanitizeCategory(c, knownCategories)).filter(c => c !== null);
  
  // Variant filter (optional URL key, preserved for backward compat)
  const vParam = params.get('variant');
  state.variant = state.catalog.variants.some(v => v.key === vParam) ? vParam : null;
  
  // Sync checkboxes
  els.filterPanel.querySelectorAll('input').forEach(cb => {
    if (cb.name === 'status') cb.checked = state.filters.status.includes(cb.value);
    if (cb.name === 'category') cb.checked = state.filters.category.includes(cb.value);
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
    state.selectedId = null;
    els.drawer.classList.remove('open');
    els.drawer.setAttribute('aria-hidden', 'true');
    document.querySelectorAll('.card.selected').forEach(c => c.classList.remove('selected'));
  }
  
  render();
}

function updateURL() {
  const params = new URLSearchParams();
  if (state.search) params.set('q', state.search);
  state.filters.status.forEach(s => params.append('status', s));
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
  state.filters.status = Array.from(els.filterPanel.querySelectorAll('input[name="status"]:checked')).map(cb => cb.value);
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
      
      // Determine overall best status for badge
      let overall = 'uns'; let oLbl = 'Unsupported';
      const vals = Object.values(d.variantSupport).map(v => v.status);
      if (vals.includes('active')) { overall = 'act'; oLbl = 'Active'; }
      else if (vals.includes('incomplete')) { overall = 'warn'; oLbl = 'Incomplete'; }
      else if (vals.includes('auxiliary')) { overall = 'aux'; oLbl = 'Auxiliary'; }
      else if (vals.includes('declared-only')) { overall = 'warn'; oLbl = 'Declared Only'; }
      
      // Physical summary
      let phys = 'Generic / Undocumented';
      if (d.physicalParts && d.physicalParts.length === 1) phys = d.physicalParts[0].part;
      else if (d.physicalParts && d.physicalParts.length > 1) phys = `${d.physicalParts.length} components (Composite)`;
      
      // Active variants dots
      const vDots = state.catalog.variants
        .filter(v => v.key !== 'micro-modular')
        .map(vk => {
          const s = d.variantSupport[vk.key]?.status;
          const cl = s === 'active' ? 'on' : (s === 'incomplete' || s === 'declared-only' ? 'inc' : 'off');
          return `<div class="v-dot ${cl}" title="${vk.key}: ${s}"></div>`;
        }).join('');

      return `
        <div class="card ${isSel}" data-id="${d.id}" role="button" tabindex="0" onclick="window.openDetail(${d.id}, true)" onkeydown="if(event.key==='Enter') window.openDetail(${d.id}, true)">
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
  state.filters.status.forEach(s => chips.push(`<div class="filter-chip">Status: ${formatEnum(s)} <button onclick="window.removeFilter('status', '${s}')"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></button></div>`));
  state.filters.category.forEach(c => chips.push(`<div class="filter-chip">Cat: ${formatEnum(c)} <button onclick="window.removeFilter('category', '${c}')"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></button></div>`));
  
  els.activeFilters.innerHTML = chips.join('');
  els.summary.textContent = `Menampilkan ${filtered.length} perangkat dari total ${state.catalog.devices.length}`;
}

window.openDetail = function(id, pushState = true) {
  const d = state.catalog.devices.find(x => x.id === id);
  if (!d) return;
  
  state.selectedId = id;
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
  swEl.onclick = () => copyText(d.softwareName);
  
  document.getElementById('detail-purpose').textContent = d.purpose || d.summary;

  const pcb = d.pcb || {};
  const pcbResolved = Boolean(pcb.number);
  document.getElementById('detail-pcb').innerHTML = `
    <div class="pcb-number-block ${pcbResolved ? '' : 'unresolved'}">${pcbResolved ? escape(pcb.number) : '—'}</div>
    <div class="pcb-info-block">
      <span class="pcb-name">${pcbResolved ? escape(pcb.name) : 'PCB belum teridentifikasi'}</span>
      <span class="pcb-confidence">${escape(pcb.confidence || 'unresolved')}</span>
      ${pcb.note ? `<span class="pcb-note">${escape(pcb.note)}</span>` : ''}
      ${pcb.sourcePath ? `<span class="pcb-note"><strong>Evidence:</strong> ${escape(pcb.sourcePath)}</span>` : ''}
    </div>
  `;
  
  // Conflicts
  const confEl = document.getElementById('detail-conflicts');
  if (d.conflicts && d.conflicts.length > 0) {
    confEl.style.display = 'block';
    document.getElementById('detail-conflicts-list').innerHTML = d.conflicts.map(c => `<li>${escape(c)}</li>`).join('');
  } else {
    confEl.style.display = 'none';
  }
  
  // Parts
  const partsHtml = (d.physicalParts || []).map(p => `
    <div class="part-row">
      <div class="part-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="2" ry="2"></rect><rect x="9" y="9" width="6" height="6"></rect><line x1="9" y1="1" x2="9" y2="4"></line><line x1="15" y1="1" x2="15" y2="4"></line><line x1="9" y1="20" x2="9" y2="23"></line><line x1="15" y1="20" x2="15" y2="23"></line><line x1="20" y1="9" x2="23" y2="9"></line><line x1="20" y1="14" x2="23" y2="14"></line><line x1="1" y1="9" x2="4" y2="9"></line><line x1="1" y1="14" x2="4" y2="14"></line></svg></div>
      <div class="part-info">
        <span class="part-name">${escape(p.part)}</span>
        <span class="part-mfg">${escape(p.manufacturer)}</span>
      </div>
      <span class="part-role">${escape(p.role)}</span>
      ${p.officialUrl ? `<a href="${p.officialUrl}" target="_blank" title="Datasheet/Product Page" class="btn-icon"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg></a>` : ''}
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
  const mxHtml = state.catalog.variants.map(vk => {
    const vs = d.variantSupport[vk.key];
    if (!vs) return '';
    const stCls = vs.status === 'active' ? 'act' : (vs.status === 'unsupported' ? 'uns' : (vs.status === 'incomplete' || vs.status === 'declared-only' ? 'inc' : 'uns'));
    
    let details = '';
    if (vs.status === 'active' || vs.status === 'incomplete' || vs.status === 'declared-only') {
      if (vs.task) details += `<span class="mx-lbl">Task</span><span class="mx-val code-badge" onclick="window.copyText('${vs.task}')" title="Copy">${escape(vs.task)}</span>`;
      if (vs.mqttDeviceName) details += `<span class="mx-lbl">MQTT</span><span class="mx-val code-badge" onclick="window.copyText('${vs.mqttDeviceName}')" title="Copy">${escape(vs.mqttDeviceName)}</span>`;
      if (vs.interfaces && vs.interfaces.length > 0) {
        details += `<span class="mx-lbl">I/F</span><span class="mx-val">${escape(vs.interfaces[0].bus)} ${escape(vs.interfaces[0].address)}</span>`;
      }
    }
    
    const vName = vk.name;
    
    return `
      <div class="mx-row">
        <div class="mx-head">
          <span class="mx-name">${escape(vName)}</span>
          <span class="mx-stat ${stCls}">${formatEnum(vs.status)}</span>
        </div>
        ${details ? `<div class="mx-data">${details}</div>` : ''}
      </div>
    `;
  }).join('');
  document.getElementById('detail-matrix').innerHTML = mxHtml;
  
  // Evidence
  const evHtml = (d.evidence || []).map(ev => {
    const repoUrl = state.catalog.generatedFrom.repository;
    const commit = state.catalog.generatedFrom.commit;
    const url = `${repoUrl}/blob/${commit}/${ev.path}#L${ev.lines.split('-')[0]}`;
    return `
      <a href="${url}" target="_blank" class="ev-link">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
        <span style="flex:1; overflow:hidden; text-overflow:ellipsis;">${escape(ev.path)}</span>
        <span class="ev-line">L${escape(ev.lines)}</span>
      </a>
    `;
  }).join('');
  document.getElementById('detail-evidence').innerHTML = evHtml || '<span class="mx-lbl">No source cited</span>';

  els.drawer.classList.add('open');
  els.drawer.setAttribute('aria-hidden', 'false');
  els.drawer.querySelector('#btn-close-detail').focus();
}

window.closeDetail = function() {
  state.selectedId = null;
  els.drawer.classList.remove('open');
  els.drawer.setAttribute('aria-hidden', 'true');
  document.querySelectorAll('.card.selected').forEach(c => c.classList.remove('selected'));
  updateURL();
  els.search.focus();
}

window.removeFilter = removeFilter;

window.copyText = function(text) {
  navigator.clipboard.writeText(text).then(() => {
    const toast = document.getElementById('toast');
    const live = document.getElementById('live-region');
    toast.textContent = `Tersalin: ${text}`;
    live.textContent = `${text} disalin ke clipboard.`;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 2500);
  });
}

// Start
init();
