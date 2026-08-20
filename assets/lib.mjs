export function escape(str) {
  if (str === null || str === undefined) return '';
  return String(str).replace(/[&<>"']/g, function(m) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m];
  });
}

export function formatEnum(str) {
  if (typeof str !== 'string' || str.length === 0) return '';
  return str.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
}

export function normalize(str) {
  if (typeof str !== 'string') return '';
  return str.toLowerCase().trim().replace(/\s+/g, ' ');
}

export function buildSearchable(d) {
  const parts = [];
  parts.push(String(d.id));
  parts.push(d.slug || '');
  parts.push(d.displayName || '');
  parts.push(d.softwareName || '');
  parts.push(d.category || '');
  parts.push((d.pcb && d.pcb.number) || '');
  parts.push((d.pcb && d.pcb.name) || '');
  (d.aliases || []).forEach(a => parts.push(a));
  (d.physicalParts || []).forEach(p => {
    parts.push(p.part || '');
    parts.push(p.manufacturer || '');
  });
  Object.keys(d.variantSupport || {}).forEach(vk => {
    const vs = d.variantSupport[vk];
    (vs && vs.interfaces || []).forEach(i => {
      parts.push(i.bus || '');
      parts.push(i.address || '');
    });
  });
  return normalize(parts.join(' '));
}

export function filterDevices(devices, { search = '', filters = { status: [], category: [] } } = {}) {
  const term = normalize(search);
  return devices.filter(d => {
    if (term && !buildSearchable(d).includes(term)) return false;
    if (filters.category.length > 0 && !filters.category.includes(d.category)) return false;
    if (filters.status.length > 0) {
      const hasStatus = Object.values(d.variantSupport || {}).some(vs => vs && filters.status.includes(vs.status));
      if (!hasStatus) return false;
    }
    return true;
  });
}

export function parseIdParam(raw) {
  if (typeof raw !== 'string') return null;
  if (!/^\d+$/.test(raw)) return null;
  const id = Number(raw);
  return Number.isSafeInteger(id) ? id : null;
}

export function sanitizeCategory(value, knownCategories) {
  return knownCategories.has(value) ? value : null;
}

export function sanitizeStatus(value, knownStatuses) {
  return knownStatuses.has(value) ? value : null;
}

export function safeUrl(url) {
  if (typeof url !== 'string' || url.length === 0) return null;
  let parsed;
  try {
    parsed = new URL(url);
  } catch (e) {
    return null;
  }
  if (parsed.protocol !== 'https:') return null;
  return parsed.href;
}