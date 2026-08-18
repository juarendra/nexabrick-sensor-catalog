import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const catalogPath = join(__dirname, '../data/catalog.json');
let catalog;

try {
  const data = readFileSync(catalogPath, 'utf8');
  catalog = JSON.parse(data);
} catch (e) {
  console.error('Fatal: Could not read or parse data/catalog.json');
  console.error(e.message);
  process.exit(1);
}

const errors = [];
function fail(path, msg) {
  errors.push(`${path}: ${msg}`);
}

// 1. Top level
if (catalog.schemaVersion !== 1) fail('schemaVersion', 'Must be 1');
if (!/^[0-9a-f]{40}$/.test(catalog.generatedFrom?.commit)) fail('generatedFrom.commit', 'Must be 40-char SHA');

// 2. Validate Variants
const knownVariants = new Set();
if (!Array.isArray(catalog.variants) || catalog.variants.length === 0) {
  fail('variants', 'Must be non-empty array');
} else {
  catalog.variants.forEach((v, i) => {
    if (!v.key) fail(`variants[${i}].key`, 'Missing key');
    else knownVariants.add(v.key);
  });
}

// 3. Secrets scan
const secretsRegex = /password|appkey|token|secret/i;
const jsonString = JSON.stringify(catalog);
if (secretsRegex.test(jsonString)) {
  fail('catalog.json', 'Contains suspicious keywords like password/token');
}

// 4. Validate Devices
const ids = new Set();
const slugs = new Set();

catalog.devices.forEach((d, i) => {
  const path = `devices[${i}]`;
  
  if (typeof d.id !== 'number') fail(path, 'Missing or invalid ID');
  else if (ids.has(d.id)) fail(path, `Duplicate ID ${d.id}`);
  else ids.add(d.id);

  if (!d.slug) fail(path, 'Missing slug');
  else if (slugs.has(d.slug)) fail(path, `Duplicate slug ${d.slug}`);
  else slugs.add(d.slug);

  if (!d.summary) fail(path, 'Missing Indonesian summary');

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
  
  if (!['sentinel', 'sensor', 'digital-io', 'composite'].includes(d.deviceType)) {
    fail(path, `Invalid deviceType ${d.deviceType}`);
  }

  if (d.deviceType !== 'sentinel' && d.deviceType !== 'digital-io') {
    if (!Array.isArray(d.physicalParts) || d.physicalParts.length === 0) {
      fail(`${path}.physicalParts`, 'Missing manufacturer/part/role');
    }
  }

  if (!d.variantSupport) fail(`${path}.variantSupport`, 'Missing variantSupport');
  else {
    knownVariants.forEach(vk => {
      const vs = d.variantSupport[vk];
      if (!vs) fail(`${path}.variantSupport.${vk}`, 'Missing variant status');
      else {
        if (!['active', 'incomplete', 'declared-only', 'ui-only', 'unsupported', 'reserved', 'auxiliary', 'actuator', 'unresolved'].includes(vs.status)) {
          fail(`${path}.variantSupport.${vk}.status`, `Invalid status ${vs.status}`);
        }
        if (vs.status === 'active' && !vs.task && d.id !== 0) {
          fail(`${path}.variantSupport.${vk}`, 'Active device missing task/component evidence');
        }
      }
    });
  }

  if (Array.isArray(d.evidence)) {
    d.evidence.forEach((ev, j) => {
      if (ev.path && (ev.path.includes(':\\') || ev.path.startsWith('/'))) {
        fail(`${path}.evidence[${j}]`, `Absolute paths forbidden: ${ev.path}`);
      }
    });
  }
});

// Check if IDs are sorted
let lastId = -1;
catalog.devices.forEach((d) => {
  if (d.id < lastId) fail('devices', `IDs are not strictly ascending: ${lastId} -> ${d.id}`);
  lastId = d.id;
});

if (errors.length > 0) {
  console.error('\nValidation Failed:');
  errors.forEach(e => console.error(`- ${e}`));
  process.exit(1);
} else {
  console.log(`Validated ${catalog.devices.length} devices and ${catalog.variants.length} variants successfully.`);
}
