import { readFileSync, existsSync } from 'fs';
import { join, dirname, sep } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// variant key -> firmware slave.cpp (relative to the firmware repo root)
export const VARIANT_SOURCES = {
  'micro': 'Nexabrick Micro/main/slave.cpp',
  'micro-rnd': 'Nexabrick Micro RND/main/slave.cpp',
  'micro-duo': 'Nexabrick Micro Duo/main/slave.cpp',
  'ccu': 'Nexabrick CCU/main/slave.cpp'
};

// Representative sensor selector UI (shared wifi-manager component).
export const WIFI_MANAGER_UI = 'Nexabrick Micro/components/esp32-wifi-manager/src/index.html';

// Modular Tibbit profile block kept verbatim by the audit.
const MODULAR_PROFILE_IDS = Array.from({ length: 16 }, (_, i) => 1001 + i);

const DEFAULT_CATALOG = join(__dirname, '../data/catalog.json');

function readSource(root, rel) {
  const p = join(root, rel.split('/').join(sep));
  return existsSync(p) ? readFileSync(p, 'utf8') : null;
}

// Pull numeric sensor IDs out of the <select id="sensor_select"> block only,
// so unrelated <select> elements (ipMode, apChannel, apMaxConn) are ignored.
export function extractSensorOptionIds(html) {
  if (typeof html !== 'string') return null;
  const marker = html.indexOf('id="sensor_select"');
  if (marker === -1) return null;
  const start = html.lastIndexOf('<select', marker);
  const end = html.indexOf('</select>', marker);
  if (start === -1 || end === -1 || end < start) return null;
  const block = html.slice(start, end);
  const ids = new Set();
  const re = /<option\s+value="(\d+)"/g;
  let m;
  while ((m = re.exec(block)) !== null) ids.add(Number(m[1]));
  return ids;
}

function hasIdentifier(source, ident) {
  return new RegExp('(^|[^A-Za-z0-9_])' + ident + '([^A-Za-z0-9_]|$)').test(source);
}

export function compareFirmwareRegistry(firmwareRoot, catalog) {
  const errors = [];
  const warnings = [];

  const srcs = {};
  for (const [variant, rel] of Object.entries(VARIANT_SOURCES)) {
    srcs[variant] = readSource(firmwareRoot, rel);
    if (srcs[variant] == null) warnings.push(`variant ${variant}: source not found at ${rel} (skipped)`);
  }

  const devices = Array.isArray(catalog.devices) ? catalog.devices : [];
  const deviceIds = new Set(devices.map(d => d.id));

  // 1. Provenance must name a real 40-hex firmware commit.
  const gf = catalog.generatedFrom;
  if (!gf || !/^[0-9a-f]{40}$/.test(gf.firmwareCommit || '')) {
    errors.push('generatedFrom.firmwareCommit must be a 40-hex firmware SHA');
  }

  // 2. Battery Modbus bank per variant must exist in firmware.
  const aux = (Array.isArray(catalog.auxiliarySystems) ? catalog.auxiliarySystems : [])
    .find(a => a && a.variantSupport);
  if (aux) {
    for (const [variant, vs] of Object.entries(aux.variantSupport)) {
      const bank = vs && vs.modbusBank;
      const s = srcs[variant];
      if (bank == null || s == null) continue;
      if (!new RegExp('addRegisterBank\\(\\s*' + String(bank)).test(s)) {
        errors.push(`battery: catalog ${variant} modbusBank ${bank} not found in ${VARIANT_SOURCES[variant]}`);
      }
    }
  }

  // 3. CCU register slot size must match firmware.
  const ccuVariant = (Array.isArray(catalog.variants) ? catalog.variants : []).find(v => v.key === 'ccu');
  const ccuSrc = srcs['ccu'];
  if (ccuVariant && ccuVariant.registerModel && ccuSrc != null) {
    const m = ccuSrc.match(/#define\s+SENSOR_DATA_SLOT_SIZE\s+(\d+)/);
    if (m && Number(m[1]) !== ccuVariant.registerModel.registersPerSlot) {
      errors.push(`ccu.registerModel.registersPerSlot is ${ccuVariant.registerModel.registersPerSlot} but firmware SENSOR_DATA_SLOT_SIZE is ${m[1]}`);
    }
  }

  // 4. Every ESP32 sensor task (id < 1000) claimed active/incomplete must exist in that variant's source.
  for (const dev of devices) {
    if (typeof dev.id !== 'number' || dev.id >= 1000) continue;
    for (const [variant, vs] of Object.entries(dev.variantSupport || {})) {
      if (!(variant in srcs)) continue;
      if (vs.status !== 'active' && vs.status !== 'incomplete') continue;
      if (typeof vs.task !== 'string' || !vs.task) continue;
      const s = srcs[variant];
      if (s == null) continue;
      if (!hasIdentifier(s, vs.task)) {
        errors.push(`device ${dev.id} (${dev.slug || '?'}): task ${vs.task} for ${variant} not found in ${VARIANT_SOURCES[variant]}`);
      }
    }
  }

  // 5. LD2410 must not be active on CCU when firmware refuses it at runtime.
  const ld = devices.find(d => d.id === 11);
  if (ld && ccuSrc != null && /LD2410 refused/.test(ccuSrc)) {
    const ccu = ld.variantSupport && ld.variantSupport.ccu;
    if (ccu && ccu.status === 'active') {
      errors.push('device 11 (LD2410) marked active on ccu but firmware refuses it at runtime');
    }
  }

  // 6. Tibbit parent selector (id 20) must be present.
  if (!deviceIds.has(20)) errors.push('device 20 (Tibbit parent selector) missing from catalog');

  // 7. Modular Tibbit profiles 1001-1016 must all be preserved.
  for (const id of MODULAR_PROFILE_IDS) {
    if (!deviceIds.has(id)) errors.push(`modular profile id ${id} missing from catalog`);
  }

  // 8. Every selectable sensor in the firmware UI must be documented in the catalog.
  const ui = readSource(firmwareRoot, WIFI_MANAGER_UI);
  if (ui != null) {
    const uiIds = extractSensorOptionIds(ui);
    if (uiIds == null) {
      warnings.push(`ui: could not locate <select id="sensor_select"> in ${WIFI_MANAGER_UI}`);
    } else {
      for (const id of [...uiIds].sort((a, b) => a - b)) {
        if (!deviceIds.has(id)) errors.push(`firmware UI selector id ${id} has no catalog device`);
      }
    }
  } else {
    warnings.push(`ui: not found at ${WIFI_MANAGER_UI} (UI selector check skipped)`);
  }

  // 9. Warning: a single MQTT device name shared by 2+ devices on the same variant.
  const byVariantName = {};
  for (const dev of devices) {
    for (const [variant, vs] of Object.entries(dev.variantSupport || {})) {
      const name = vs && vs.mqttDeviceName;
      if (!name) continue;
      const key = variant + '\0' + name;
      const entry = (byVariantName[key] = byVariantName[key] || { variant, name, ids: new Set() });
      entry.ids.add(dev.id);
    }
  }
  for (const { variant, name, ids } of Object.values(byVariantName)) {
    if (ids.size > 1) warnings.push(`MQTT device name "${name}" shared by devices ${[...ids].sort((a, b) => a - b).join(', ')} on ${variant} (collision risk)`);
  }

  return { errors, warnings };
}

// CLI (local regression guard): node scripts/compare-firmware-registry.mjs <firmwareRoot> [catalogPath]
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const firmwareRoot = args[0];
  const catalogPath = args[1] || DEFAULT_CATALOG;
  if (!firmwareRoot) {
    console.error('Usage: node scripts/compare-firmware-registry.mjs <firmwareRoot> [catalogPath]');
    process.exit(2);
  }
  let catalog;
  try {
    catalog = JSON.parse(readFileSync(catalogPath, 'utf8'));
  } catch (e) {
    console.error('Fatal: could not read or parse ' + catalogPath);
    console.error(e.message);
    process.exit(1);
  }
  const { errors, warnings } = compareFirmwareRegistry(firmwareRoot, catalog);
  for (const w of warnings) console.log('WARN: ' + w);
  if (errors.length > 0) {
    console.error('\nConsistency errors:');
    for (const e of errors) console.error('- ' + e);
    process.exit(1);
  }
  console.log(`OK: catalog is consistent with firmware (0 errors, ${warnings.length} warnings).`);
}
