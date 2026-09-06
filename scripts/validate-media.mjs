import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = join(__dirname, '..');
const CATALOG_PATH = join(ROOT, 'data/catalog.json');

// Collect every on-disk asset path referenced by one media entry.
function collectAssetPaths(mediaArray) {
  const paths = [];
  for (const m of mediaArray) {
    if (!m || typeof m !== 'object') continue;
    (m.images || []).forEach(img => { if (img && typeof img.src === 'string') paths.push(img.src); });
    if (m.model && typeof m.model === 'object') {
      if (typeof m.model.src === 'string') paths.push(m.model.src);
      if (typeof m.model.poster === 'string') paths.push(m.model.poster);
    }
    (m.cadDownloads || []).forEach(dl => { if (dl && typeof dl.src === 'string') paths.push(dl.src); });
  }
  return paths;
}

// Check that every media asset referenced in the catalog actually exists on
// disk under rootDir. Schema rules live in validate-catalog.mjs; this only
// verifies file presence so a broken reference can't ship to the site.
export function validateMediaFiles(catalog, rootDir) {
  const devices = Array.isArray(catalog?.devices) ? catalog.devices : [];
  let checked = 0;
  let mediaGroups = 0;
  const missing = [];
  devices.forEach((d, i) => {
    if (!d || !Array.isArray(d.media) || d.media.length === 0) return;
    d.media.forEach(m => {
      mediaGroups++;
      for (const p of collectAssetPaths([m])) {
        checked++;
        if (!existsSync(join(rootDir, p))) {
          missing.push(`devices[${i}] (id ${d.id ?? '?'}): ${p}`);
        }
      }
    });
  });
  return { ok: missing.length === 0, checked, mediaGroups, missing };
}

// CLI entry
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  let catalog;
  try {
    catalog = JSON.parse(readFileSync(CATALOG_PATH, 'utf8'));
  } catch (e) {
    console.error('Fatal: could not read or parse data/catalog.json');
    console.error(e.message);
    process.exit(1);
  }
  const result = validateMediaFiles(catalog, ROOT);
  if (!result.ok) {
    console.error(`\nMedia validation FAILED: ${result.missing.length} referenced file(s) missing on disk:`);
    result.missing.forEach(m => console.error(`- ${m}`));
    process.exit(1);
  }
  console.log(`Media validation passed: ${result.mediaGroups} media group(s), ${result.checked} asset reference(s) present on disk.`);
}
