import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateCatalog } from '../scripts/validate-catalog.mjs';

function baseCatalog() {
  return {
    schemaVersion: 1,
    generatedFrom: {
      repository: 'https://github.com/GSPETech/Nexabrick_Firmware',
      firmwareCommit: 'a'.repeat(40),
      commit: 'a'.repeat(40),
      auditedAt: '2026-09-06',
      catalogRepository: 'https://github.com/juarendra/nexabrick-sensor-catalog',
      catalogCommit: 'b'.repeat(40)
    },
    variants: [
      { key: 'micro', name: 'Micro', description: 'Micro variant', capacity: 40 },
      { key: 'ccu', name: 'CCU', description: 'CCU variant', capacity: 20 }
    ],
    devices: [{
      id: 1,
      slug: 'test-device',
      displayName: 'Test Device',
      softwareName: 'test_device',
      category: 'environmental',
      summary: 'Ringkasan',
      deviceType: 'sensor',
      pcb: { number: '#01', name: 'TEST PCB', confidence: 'confirmed', sourcePath: 'main/test.cpp' },
      physicalParts: [{ manufacturer: 'N/A', part: 'Chip', role: 'sensor', officialUrl: null }],
      measurements: [{ key: 'temp', label: 'Temperature', unit: 'C' }],
      conflicts: [],
      aliases: ['alias1'],
      variantSupport: {
        micro: { status: 'active', task: 'components/test', interfaces: [{ bus: 'I2C', address: '0x77' }] },
        ccu: { status: 'unsupported' }
      },
      evidence: [{ type: 'firmware', path: 'main/test.cpp', lines: '10-20' }]
    }],
    auxiliarySystems: []
  };
}

test('valid catalog passes', () => {
  const r = validateCatalog(baseCatalog());
  assert.equal(r.ok, true, r.errors.join('\n'));
  assert.equal(r.deviceCount, 1);
  assert.equal(r.variantCount, 2);
});

test('missing devices array fails', () => {
  const c = baseCatalog();
  delete c.devices;
  const r = validateCatalog(c);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some(e => e.startsWith('devices:')));
});

test('missing required renderer field fails', () => {
  const c = baseCatalog();
  delete c.devices[0].displayName;
  const r = validateCatalog(c);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some(e => e.includes('displayName')));
});

test('unknown variant key in support fails', () => {
  const c = baseCatalog();
  c.devices[0].variantSupport.ghost = { status: 'active' };
  const r = validateCatalog(c);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some(e => e.includes('variantSupport.ghost')));
});

test('invalid variant status fails', () => {
  const c = baseCatalog();
  c.devices[0].variantSupport.micro.status = 'not-a-status';
  const r = validateCatalog(c);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some(e => e.includes('Invalid status')));
});

test('invalid evidence lines format fails', () => {
  const c = baseCatalog();
  c.devices[0].evidence[0].lines = 'abc-xyz';
  const r = validateCatalog(c);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some(e => e.includes('Invalid lines format')));
});

test('absolute evidence path fails', () => {
  const c = baseCatalog();
  c.devices[0].evidence[0].path = 'C:\\Users\\x\\main.cpp';
  const r = validateCatalog(c);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some(e => e.includes('Absolute paths forbidden')));
});

test('non-https officialUrl fails (not in exceptions)', () => {
  const c = baseCatalog();
  c.devices[0].physicalParts[0].officialUrl = 'http://example.com/part';
  const r = validateCatalog(c);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some(e => e.includes('officialUrl')));
});

test('unknown category fails', () => {
  const c = baseCatalog();
  c.devices[0].category = 'nonsense-category';
  const r = validateCatalog(c);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some(e => e.includes('Unknown category')));
});

test('duplicate ids fail', () => {
  const c = baseCatalog();
  c.devices.push({ ...c.devices[0] });
  const r = validateCatalog(c);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some(e => e.includes('Duplicate ID')));
});

test('secret keyword scan only flags key/value patterns', () => {
  const c = baseCatalog();
  c.devices[0].summary = 'Komponen uses a secret pin and password token word';
  const r1 = validateCatalog(c);
  assert.equal(r1.ok, true, r1.errors.join('\n'));

  c.devices[0].access_token = 'abc123';
  const r2 = validateCatalog(c);
  assert.equal(r2.ok, false);
  assert.ok(r2.errors.some(e => e.includes('suspicious keyword')));
});

test('dimensionless measurement (empty unit) passes', () => {
  const c = baseCatalog();
  c.devices[0].measurements[0].unit = '';
  const r = validateCatalog(c);
  assert.equal(r.ok, true, r.errors.join('\n'));
});

test('active variant without task fails', () => {
  const c = baseCatalog();
  delete c.devices[0].variantSupport.micro.task;
  const r = validateCatalog(c);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some(e => e.includes('Active device missing task')));
});

test('missing firmwareCommit fails', () => {
  const c = baseCatalog();
  delete c.generatedFrom.firmwareCommit;
  const r = validateCatalog(c);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some(e => e.includes('generatedFrom.firmwareCommit')));
});

test('legacy commit mirror mismatch fails', () => {
  const c = baseCatalog();
  c.generatedFrom.commit = 'c'.repeat(40);
  const r = validateCatalog(c);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some(e => e.includes('generatedFrom.commit')));
});

test('invalid catalogCommit fails', () => {
  const c = baseCatalog();
  c.generatedFrom.catalogCommit = 'not-a-sha';
  const r = validateCatalog(c);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some(e => e.includes('generatedFrom.catalogCommit')));
});

test('non-https catalogRepository fails', () => {
  const c = baseCatalog();
  c.generatedFrom.catalogRepository = 'http://example.com/repo';
  const r = validateCatalog(c);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some(e => e.includes('generatedFrom.catalogRepository')));
});

function validMedia() {
  return [{
    label: 'Test Model',
    variant: 'micro',
    images: [{ src: 'media/test/a.png', alt: 'view 1' }],
    model: { src: 'media/test/model.glb', poster: 'media/test/a.png' },
    cadDownloads: [{ label: 'Download STEP', src: 'media/test/model.step', format: 'STEP' }],
    confidence: 'unresolved',
    hardwareStatus: 'pending'
  }];
}

test('valid media block passes', () => {
  const c = baseCatalog();
  c.devices[0].media = validMedia();
  const r = validateCatalog(c);
  assert.equal(r.ok, true, r.errors.join('\n'));
});

test('media non-array fails', () => {
  const c = baseCatalog();
  c.devices[0].media = { label: 'x' };
  const r = validateCatalog(c);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some(e => e.includes('devices[0].media')));
});

test('media entry non-object fails', () => {
  const c = baseCatalog();
  c.devices[0].media = ['nope'];
  const r = validateCatalog(c);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some(e => e.includes('media[0]')));
});

test('media missing label fails', () => {
  const c = baseCatalog();
  c.devices[0].media = validMedia();
  delete c.devices[0].media[0].label;
  const r = validateCatalog(c);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some(e => e.includes('Missing label')));
});

test('media unknown variant fails', () => {
  const c = baseCatalog();
  c.devices[0].media = validMedia();
  c.devices[0].media[0].variant = 'ghost-variant';
  const r = validateCatalog(c);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some(e => e.includes('Unknown variant key')));
});

test('media image with bad extension fails', () => {
  const c = baseCatalog();
  c.devices[0].media = validMedia();
  c.devices[0].media[0].images[0].src = 'media/test/a.gif';
  const r = validateCatalog(c);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some(e => e.includes('Not an allowed image type')));
});

test('media image absolute path fails', () => {
  const c = baseCatalog();
  c.devices[0].media = validMedia();
  c.devices[0].media[0].images[0].src = '/abs/a.png';
  const r = validateCatalog(c);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some(e => e.includes('repo-relative')));
});

test('media image external URL fails', () => {
  const c = baseCatalog();
  c.devices[0].media = validMedia();
  c.devices[0].media[0].images[0].src = 'https://cdn.example.com/a.png';
  const r = validateCatalog(c);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some(e => e.includes('repo-relative')));
});

test('media image missing alt fails', () => {
  const c = baseCatalog();
  c.devices[0].media = validMedia();
  delete c.devices[0].media[0].images[0].alt;
  const r = validateCatalog(c);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some(e => e.includes('alt')));
});

test('media model with bad extension fails', () => {
  const c = baseCatalog();
  c.devices[0].media = validMedia();
  c.devices[0].media[0].model.src = 'media/test/model.obj';
  const r = validateCatalog(c);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some(e => e.includes('Not an allowed 3D model type')));
});

test('media model external URL fails', () => {
  const c = baseCatalog();
  c.devices[0].media = validMedia();
  c.devices[0].media[0].model.src = 'http://example.com/model.glb';
  const r = validateCatalog(c);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some(e => e.includes('repo-relative')));
});

test('media cad download with bad extension fails', () => {
  const c = baseCatalog();
  c.devices[0].media = validMedia();
  c.devices[0].media[0].cadDownloads[0].src = 'media/test/model.zip';
  const r = validateCatalog(c);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some(e => e.includes('Not an allowed CAD type')));
});

test('media invalid hardwareStatus fails', () => {
  const c = baseCatalog();
  c.devices[0].media = validMedia();
  c.devices[0].media[0].hardwareStatus = 'shiny';
  const r = validateCatalog(c);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some(e => e.includes('Invalid hardwareStatus')));
});

test('media invalid confidence fails', () => {
  const c = baseCatalog();
  c.devices[0].media = validMedia();
  c.devices[0].media[0].confidence = 'certain';
  const r = validateCatalog(c);
  assert.equal(r.ok, false);
  assert.ok(r.errors.some(e => e.includes('Invalid confidence')));
});