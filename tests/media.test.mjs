import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { validateMediaFiles } from '../scripts/validate-media.mjs';

function withTemp(t, fn) {
  const dir = mkdtempSync(join(tmpdir(), 'nexabrick-media-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return fn(dir);
}

test('validateMediaFiles passes when all referenced assets exist', (t) => {
  withTemp(t, (dir) => {
    mkdirSync(join(dir, 'media/x'), { recursive: true });
    writeFileSync(join(dir, 'media/x/a.png'), 'x');
    writeFileSync(join(dir, 'media/x/model.glb'), 'x');
    writeFileSync(join(dir, 'media/x/model.step'), 'x');
    const catalog = {
      devices: [{
        id: 3,
        media: [{
          label: 'X',
          variant: 'micro',
          images: [{ src: 'media/x/a.png', alt: 'a' }],
          model: { src: 'media/x/model.glb', poster: 'media/x/a.png' },
          cadDownloads: [{ label: 'STEP', src: 'media/x/model.step', format: 'STEP' }]
        }]
      }]
    };
    const r = validateMediaFiles(catalog, dir);
    assert.equal(r.ok, true, r.missing.join('\n'));
    assert.equal(r.checked, 4); // image, model src, poster, cad
    assert.equal(r.mediaGroups, 1);
  });
});

test('validateMediaFiles reports missing files', (t) => {
  withTemp(t, (dir) => {
    mkdirSync(join(dir, 'media/x'), { recursive: true });
    writeFileSync(join(dir, 'media/x/a.png'), 'x');
    const catalog = {
      devices: [{
        id: 9,
        media: [{
          label: 'X',
          images: [{ src: 'media/x/a.png', alt: 'a' }],
          model: { src: 'media/x/absent.glb', poster: 'media/x/a.png' }
        }]
      }]
    };
    const r = validateMediaFiles(catalog, dir);
    assert.equal(r.ok, false);
    assert.equal(r.missing.length, 1);
    assert.ok(r.missing[0].includes('media/x/absent.glb'));
  });
});

test('validateMediaFiles ignores devices without media', (t) => {
  withTemp(t, (dir) => {
    const catalog = {
      devices: [{ id: 1 }, { id: 2, media: [] }, { id: 3 }]
    };
    const r = validateMediaFiles(catalog, dir);
    assert.equal(r.ok, true);
    assert.equal(r.checked, 0);
    assert.equal(r.mediaGroups, 0);
  });
});

test('validateMediaFiles tolerates a null/empty catalog', (t) => {
  withTemp(t, (dir) => {
    assert.deepEqual(validateMediaFiles(null, dir), { ok: true, checked: 0, mediaGroups: 0, missing: [] });
    assert.deepEqual(validateMediaFiles({}, dir), { ok: true, checked: 0, mediaGroups: 0, missing: [] });
  });
});
