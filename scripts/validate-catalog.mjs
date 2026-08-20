import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export const ALLOWED_CATEGORIES = new Set([
  'sentinel', 'environmental', 'digital-io', 'motion', 'light', 'presence',
  'pressure', 'airflow', 'air-quality', 'energy', 'composite-air-quality',
  'level', 'distance', 'actuator', 'composite-thermal', 'power'
]);

export const ALLOWED_DEVICE_TYPES = new Set([
  'sentinel', 'sensor', 'composite', 'actuator', 'digital-io', 'auxiliary'
]);

export const ALLOWED_STATUSES = new Set([
  'active', 'incomplete', 'declared-only', 'ui-only', 'unsupported',
  'reserved', 'auxiliary', 'actuator', 'unresolved'
]);

export const ALLOWED_EVIDENCE_TYPES = new Set(['firmware', 'header', 'hardware', 'manual']);

// Documented exceptions: official product pages that only serve http (no https)
const HTTPS_URL_EXCEPTIONS = new Set([
  'http://www.worldsemi.com/Certifications/WS2812B.html'
]);

export const CATALOG_PATH = join(__dirname, '../data/catalog.json');

export function validateCatalog(catalog) {
  const errors = [];
  function fail(path, msg) {
    errors.push(`${path}: ${msg}`);
  }

  // 1. Top-level schema
  if (catalog.schemaVersion !== 1) fail('schemaVersion', 'Must be 1');
  const gf = catalog.generatedFrom;
  if (!gf || typeof gf !== 'object') {
    fail('generatedFrom', 'Missing generatedFrom object');
  } else {
    if (typeof gf.repository !== 'string' || !/^https:\/\//.test(gf.repository)) {
      fail('generatedFrom.repository', 'Must be https URL string');
    }
    if (!/^[0-9a-f]{40}$/.test(gf.commit || '')) fail('generatedFrom.commit', 'Must be 40-char SHA');
    if (!gf.auditedAt) fail('generatedFrom.auditedAt', 'Missing auditedAt date');
  }

  // 2. Variants
  const knownVariants = new Set();
  if (!Array.isArray(catalog.variants) || catalog.variants.length === 0) {
    fail('variants', 'Must be non-empty array');
  } else {
    catalog.variants.forEach((v, i) => {
      if (!v || typeof v !== 'object') fail(`variants[${i}]`, 'Variant must be an object');
      else {
        if (typeof v.key !== 'string' || !v.key) fail(`variants[${i}].key`, 'Missing key');
        else if (knownVariants.has(v.key)) fail(`variants[${i}].key`, `Duplicate variant key ${v.key}`);
        else knownVariants.add(v.key);
        if (typeof v.name !== 'string' || !v.name) fail(`variants[${i}].name`, 'Missing name');
        if (typeof v.description !== 'string' || !v.description) fail(`variants[${i}].description`, 'Missing description');
      }
    });
  }

  // 3. Secrets scan - narrow policy only (no false positives on legitimate words)
  const jsonString = JSON.stringify(catalog);
  const secretPatterns = [
    { re: /"api[_-]?key"\s*:\s*"[^"]+"/i, why: 'API key value' },
    { re: /"access[_-]?token"\s*:\s*"[^"]+"/i, why: 'access token value' },
    { re: /"password"\s*:\s*"[^"]+"/i, why: 'password value' },
    { re: /"secret"\s*:\s*"[^"]+"/i, why: 'secret value' }
  ];
  for (const p of secretPatterns) {
    if (p.re.test(jsonString)) fail('catalog.json', `Contains suspicious keyword: ${p.why}`);
  }

  // 4. Devices
  if (!Array.isArray(catalog.devices)) {
    fail('devices', 'Must be an array');
    return finalize(catalog, errors);
  }
  const ids = new Set();
  const slugs = new Set();
  let lastId = -1;

  catalog.devices.forEach((d, i) => {
    const path = `devices[${i}]`;
    if (!d || typeof d !== 'object') { fail(path, 'Device must be an object'); return; }

    // Required fields consumed by renderer
    const required = {
      id: 'number', slug: 'string', displayName: 'string', softwareName: 'string',
      category: 'string', summary: 'string', deviceType: 'string'
    };
    for (const [field, type] of Object.entries(required)) {
      if (typeof d[field] !== type || (type === 'string' && d[field].length === 0)) {
        fail(`${path}.${field}`, `Missing required ${type} field`);
      }
    }

    if (typeof d.id === 'number') {
      if (ids.has(d.id)) fail(path, `Duplicate ID ${d.id}`);
      else ids.add(d.id);
      if (d.id < lastId) fail(path, `IDs are not strictly ascending: ${lastId} -> ${d.id}`);
      lastId = d.id;
    }

    if (typeof d.slug === 'string' && d.slug) {
      if (slugs.has(d.slug)) fail(path, `Duplicate slug ${d.slug}`);
      else slugs.add(d.slug);
    }

    if (typeof d.category === 'string' && !ALLOWED_CATEGORIES.has(d.category)) {
      fail(`${path}.category`, `Unknown category ${d.category}`);
    }
    if (typeof d.deviceType === 'string' && !ALLOWED_DEVICE_TYPES.has(d.deviceType)) {
      fail(`${path}.deviceType`, `Unknown deviceType ${d.deviceType}`);
    }

    // pcb
    if (!d.pcb || typeof d.pcb !== 'object') {
      fail(`${path}.pcb`, 'Missing PCB mapping object');
    } else {
      if (!['confirmed', 'probable', 'unresolved'].includes(d.pcb.confidence)) {
        fail(`${path}.pcb.confidence`, `Invalid PCB confidence ${d.pcb.confidence}`);
      }
      if (d.pcb.number !== null && !/^#\d{2,3}$/.test(d.pcb.number)) {
        fail(`${path}.pcb.number`, 'Must be null or format #NN/#NNN');
      }
      if (d.pcb.number !== null && (!d.pcb.name || !d.pcb.sourcePath)) {
        fail(`${path}.pcb`, 'Numbered PCB requires name and sourcePath');
      }
      if (d.pcb.sourcePath && (d.pcb.sourcePath.includes(':\\') || d.pcb.sourcePath.startsWith('/'))) {
        fail(`${path}.pcb.sourcePath`, 'Absolute paths forbidden');
      }
    }

    // physicalParts
    if (d.physicalParts !== undefined && !Array.isArray(d.physicalParts)) {
      fail(`${path}.physicalParts`, 'Must be an array');
    } else if (Array.isArray(d.physicalParts)) {
      d.physicalParts.forEach((p, j) => {
        const pp = `${path}.physicalParts[${j}]`;
        if (!p || typeof p !== 'object') fail(pp, 'Part must be an object');
        else {
          if (typeof p.part !== 'string' || !p.part) fail(pp, 'Missing part name');
          if (typeof p.manufacturer !== 'string') fail(pp, 'Missing manufacturer');
          if (typeof p.role !== 'string' || !p.role) fail(pp, 'Missing role');
          if (p.officialUrl !== undefined && p.officialUrl !== null && !/^https:\/\//.test(p.officialUrl) && !HTTPS_URL_EXCEPTIONS.has(p.officialUrl)) {
            fail(pp, 'officialUrl must be null or https URL (http only via documented exception)');
          }
        }
      });
    }

    // measurements
    if (d.measurements !== undefined && !Array.isArray(d.measurements)) {
      fail(`${path}.measurements`, 'Must be an array');
    } else if (Array.isArray(d.measurements)) {
      d.measurements.forEach((m, j) => {
        const mp = `${path}.measurements[${j}]`;
        if (!m || typeof m !== 'object') fail(mp, 'Measurement must be an object');
        else {
          if (typeof m.label !== 'string' || !m.label) fail(mp, 'Missing label');
          if (typeof m.unit !== 'string') fail(mp, 'Missing unit (use empty string for dimensionless)');
        }
      });
    }

    // conflicts
    if (d.conflicts !== undefined && !Array.isArray(d.conflicts)) {
      fail(`${path}.conflicts`, 'Must be an array');
    } else if (Array.isArray(d.conflicts)) {
      d.conflicts.forEach((c, j) => {
        if (typeof c !== 'string') fail(`${path}.conflicts[${j}]`, 'Conflict must be a string');
      });
    }

    // aliases
    if (d.aliases !== undefined && !Array.isArray(d.aliases)) {
      fail(`${path}.aliases`, 'Must be an array');
    } else if (Array.isArray(d.aliases)) {
      d.aliases.forEach((a, j) => {
        if (typeof a !== 'string') fail(`${path}.aliases[${j}]`, 'Alias must be a string');
      });
    }

    // variantSupport
    if (!d.variantSupport || typeof d.variantSupport !== 'object') {
      fail(`${path}.variantSupport`, 'Missing variantSupport');
    } else {
      knownVariants.forEach(vk => {
        if (!d.variantSupport[vk]) {
          fail(`${path}.variantSupport.${vk}`, 'Missing variant status object');
        }
      });
      Object.keys(d.variantSupport).forEach(vk => {
        if (!knownVariants.has(vk)) {
          fail(`${path}.variantSupport.${vk}`, `Unknown variant key ${vk}`);
          return;
        }
        const vs = d.variantSupport[vk];
        const vp = `${path}.variantSupport.${vk}`;
        if (!vs || typeof vs !== 'object') fail(vp, 'Missing variant status object');
        else {
          if (typeof vs.status !== 'string' || !ALLOWED_STATUSES.has(vs.status)) {
            fail(`${vp}.status`, `Invalid status ${vs.status}`);
          }
          if (vs.status === 'active' && !vs.task && d.id !== 0) {
            fail(vp, 'Active device missing task/component evidence');
          }
          if (vs.interfaces !== undefined) {
            if (!Array.isArray(vs.interfaces)) fail(vp, 'interfaces must be an array');
            else {
              vs.interfaces.forEach((iface, k) => {
                const ip = `${vp}.interfaces[${k}]`;
                if (!iface || typeof iface !== 'object') fail(ip, 'Interface must be an object');
                else {
                  if (typeof iface.bus !== 'string' || !iface.bus) fail(ip, 'Missing bus');
                  if (typeof iface.address !== 'string' || !iface.address) fail(ip, 'Missing address');
                }
              });
            }
          }
        }
      });
    }

    // evidence
    if (d.evidence !== undefined && !Array.isArray(d.evidence)) {
      fail(`${path}.evidence`, 'Must be an array');
    } else if (Array.isArray(d.evidence)) {
      d.evidence.forEach((ev, j) => {
        const ep = `${path}.evidence[${j}]`;
        if (!ev || typeof ev !== 'object') fail(ep, 'Evidence must be an object');
        else {
          if (typeof ev.path !== 'string' || !ev.path) fail(ep, 'Missing path');
          else if (ev.path.includes(':\\') || ev.path.startsWith('/')) fail(ep, `Absolute paths forbidden: ${ev.path}`);
          if (typeof ev.lines !== 'string' || !/^\d+(-\d+)?$/.test(ev.lines)) {
            fail(ep, `Invalid lines format ${ev.lines} (expected "N" or "N-M")`);
          }
          if (ev.type && !ALLOWED_EVIDENCE_TYPES.has(ev.type)) {
            fail(ep, `Unknown evidence type ${ev.type}`);
          }
        }
      });
    }
  });

  // 5. Auxiliary systems
  if (catalog.auxiliarySystems !== undefined) {
    if (!Array.isArray(catalog.auxiliarySystems)) {
      fail('auxiliarySystems', 'Must be an array');
    } else {
      catalog.auxiliarySystems.forEach((d, i) => {
        const path = `auxiliarySystems[${i}]`;
        if (!d || typeof d !== 'object') { fail(path, 'Aux system must be an object'); return; }
        if (typeof d.id !== 'number' || !Number.isInteger(d.id)) fail(path, 'Missing integer id');
        if (typeof d.slug !== 'string' || !d.slug) fail(path, 'Missing slug');
        if (typeof d.displayName !== 'string' || !d.displayName) fail(path, 'Missing displayName');
        if (typeof d.category === 'string' && !ALLOWED_CATEGORIES.has(d.category)) fail(`${path}.category`, `Unknown category ${d.category}`);
        if (d.variantSupport) {
          Object.entries(d.variantSupport).forEach(([vk, vs]) => {
            if (typeof vs?.status === 'string' && !ALLOWED_STATUSES.has(vs.status)) {
              fail(`${path}.variantSupport.${vk}.status`, `Invalid status ${vs.status}`);
            }
          });
        }
      });
    }
  }

  return finalize(catalog, errors);
}

function finalize(catalog, errors) {
  return {
    ok: errors.length === 0,
    errors,
    deviceCount: Array.isArray(catalog.devices) ? catalog.devices.length : 0,
    variantCount: Array.isArray(catalog.variants) ? catalog.variants.length : 0
  };
}

// CLI entry
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  let catalog;
  try {
    catalog = JSON.parse(readFileSync(CATALOG_PATH, 'utf8'));
  } catch (e) {
    console.error('Fatal: Could not read or parse data/catalog.json');
    console.error(e.message);
    process.exit(1);
  }
  const result = validateCatalog(catalog);
  if (!result.ok) {
    console.error('\nValidation Failed:');
    result.errors.forEach(e => console.error(`- ${e}`));
    process.exit(1);
  } else {
    console.log(`Validated ${result.deviceCount} devices and ${result.variantCount} variants successfully.`);
  }
}