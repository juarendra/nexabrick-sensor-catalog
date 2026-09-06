import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { compareFirmwareRegistry, extractSensorOptionIds } from '../scripts/compare-firmware-registry.mjs';

const SHA = 'a'.repeat(40);

function uiHtml() {
  return [
    '<select id="apChannel">',
    '  <option value="1">C1</option>',
    '  <option value="6">C6</option>',
    '</select>',
    '<select id="sensor_select">',
    '  <option value="1">BME680</option>',
    '  <option value="11">LD2410</option>',
    '  <option value="20">Tibbit</option>',
    '</select>'
  ].join('\n');
}

function writeTree(root) {
  const files = {
    'Nexabrick Micro/main/slave.cpp': [
      'if (addRegisterBank(40051, &dataBattery[0], 4) != ESP_OK) {}',
      'void readingSensorBME680(void *p) {}',
      'void readingSensorLD2410(void *p) {}',
      'void readingSensorTibbitIO(void *p) {}'
    ].join('\n'),
    'Nexabrick Micro RND/main/slave.cpp': [
      'if (addRegisterBank(40051, &dataBattery[0], 4) != ESP_OK) {}'
    ].join('\n'),
    'Nexabrick Micro Duo/main/slave.cpp': [
      'if (addRegisterBank(40051, &dataBattery[0], 4) != ESP_OK) {}'
    ].join('\n'),
    'Nexabrick CCU/main/slave.cpp': [
      '#define SENSOR_DATA_SLOT_SIZE 11',
      'if (addRegisterBank(40151, &dataBattery[0], 4) != ESP_OK) {}',
      'void readingSensorLD2410(void *p) {}',
      'void readingSensorTibbitIO(void *p) {}',
      'ESP_LOGE("X", "LD2410 refused: UART TX/RX GPIO33/32 conflict with CCU I2C SDA/SCL");'
    ].join('\n'),
    'Nexabrick Micro/components/esp32-wifi-manager/src/index.html': uiHtml()
  };
  for (const [rel, content] of Object.entries(files)) {
    const p = join(root, rel);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, content);
  }
}

function baseCatalog() {
  const devices = [
    { id: 1, slug: 'bme680', variantSupport: { micro: { status: 'active', task: 'readingSensorBME680', mqttDeviceName: 'BME680_Sensor' }, ccu: { status: 'unsupported' } } },
    { id: 11, slug: 'ld2410', variantSupport: { micro: { status: 'active', task: 'readingSensorLD2410', mqttDeviceName: 'LD2410_Radar' }, ccu: { status: 'unsupported', task: 'readingSensorLD2410' } } },
    { id: 20, slug: 'tibbit-io', variantSupport: { micro: { status: 'active', task: 'readingSensorTibbitIO' } } }
  ];
  for (let i = 0; i < 16; i++) {
    devices.push({ id: 1001 + i, slug: 'tibbit-' + String(i + 1).padStart(2, '0'), variantSupport: { micro: { status: 'active', task: 'task_digital_io' }, ccu: { status: 'auxiliary' } } });
  }
  return {
    generatedFrom: { repository: 'https://github.com/GSPETech/Nexabrick_Firmware', firmwareCommit: SHA, auditedAt: '2026-09-06' },
    variants: [
      { key: 'micro', name: 'Micro' },
      { key: 'micro-rnd', name: 'RND' },
      { key: 'micro-duo', name: 'Duo' },
      { key: 'ccu', name: 'CCU', registerModel: { slotCount: 10, registersPerSlot: 11 } },
      { key: 'micro-modular', name: 'Modular' }
    ],
    auxiliarySystems: [
      {
        id: 999, slug: 'battery-monitor', variantSupport: {
          micro: { status: 'auxiliary', modbusBank: 40051 },
          'micro-rnd': { status: 'auxiliary', modbusBank: 40051 },
          'micro-duo': { status: 'auxiliary', modbusBank: 40051 },
          ccu: { status: 'auxiliary', modbusBank: 40151 }
        }
      }
    ],
    devices
  };
}

// Build a temp firmware tree, optionally mutate the catalog, run the compare.
function run(mutate) {
  const root = mkdtempSync(join(tmpdir(), 'fwreg-'));
  writeTree(root);
  const catalog = baseCatalog();
  if (mutate) mutate(catalog);
  const result = compareFirmwareRegistry(root, catalog);
  rmSync(root, { recursive: true, force: true });
  return result;
}

test('extractSensorOptionIds reads only the sensor_select block', () => {
  const ids = extractSensorOptionIds(uiHtml());
  assert.deepEqual([...ids].sort((a, b) => a - b), [1, 11, 20]);
});

test('extractSensorOptionIds returns null when no sensor_select present', () => {
  assert.equal(extractSensorOptionIds('<select id="apChannel"><option value="6"></select>'), null);
  assert.equal(extractSensorOptionIds(null), null);
});

test('consistent catalog + firmware yields zero errors and zero warnings', () => {
  const r = run();
  assert.equal(r.errors.length, 0, r.errors.join('; '));
  assert.equal(r.warnings.length, 0, r.warnings.join('; '));
});

test('missing modular profile id errors', () => {
  const r = run(c => { c.devices = c.devices.filter(d => d.id !== 1001); });
  assert.ok(r.errors.some(e => e.includes('1001')));
});

test('missing tibbit parent id 20 errors', () => {
  const r = run(c => { c.devices = c.devices.filter(d => d.id !== 20); });
  assert.ok(r.errors.some(e => e.includes('device 20')));
});

test('invalid firmwareCommit errors', () => {
  const r = run(c => { c.generatedFrom.firmwareCommit = 'xyz'; });
  assert.ok(r.errors.some(e => e.includes('firmwareCommit')));
});

test('ccu registersPerSlot mismatch errors', () => {
  const r = run(c => { c.variants.find(v => v.key === 'ccu').registerModel.registersPerSlot = 10; });
  assert.ok(r.errors.some(e => e.includes('registersPerSlot')));
});

test('battery bank not present in firmware errors', () => {
  const r = run(c => { c.auxiliarySystems[0].variantSupport.ccu.modbusBank = 40999; });
  assert.ok(r.errors.some(e => e.includes('40999')));
});

test('LD2410 active on ccu (firmware refuses at runtime) errors', () => {
  const r = run(c => { c.devices.find(d => d.id === 11).variantSupport.ccu.status = 'active'; });
  assert.ok(r.errors.some(e => e.includes('LD2410')));
});

test('task not present in firmware source errors', () => {
  const r = run(c => { c.devices.find(d => d.id === 1).variantSupport.micro.task = 'readingSensorNonexistent'; });
  assert.ok(r.errors.some(e => e.includes('readingSensorNonexistent')));
});

test('UI selector id with no catalog device errors', () => {
  const root = mkdtempSync(join(tmpdir(), 'fwreg-'));
  writeTree(root);
  const uiPath = join(root, 'Nexabrick Micro/components/esp32-wifi-manager/src/index.html');
  const html = readFileSync(uiPath, 'utf8');
  writeFileSync(uiPath, html.replace('<option value="20">Tibbit</option>', '<option value="20">Tibbit</option>\n  <option value="99">Ghost</option>'));
  const r = compareFirmwareRegistry(root, baseCatalog());
  rmSync(root, { recursive: true, force: true });
  assert.ok(r.errors.some(e => e.includes('id 99')));
});

test('same-variant MQTT name collision warns', () => {
  const r = run(c => {
    c.devices.push({ id: 2, slug: 'sht21', variantSupport: { micro: { status: 'active', task: 'readingSensorBME680', mqttDeviceName: 'BME680_Sensor' } } });
  });
  assert.ok(r.warnings.some(w => w.includes('BME680_Sensor') && w.includes('micro')));
  assert.equal(r.errors.length, 0, r.errors.join('; '));
});

test('missing variant source warns without erroring', () => {
  const root = mkdtempSync(join(tmpdir(), 'fwreg-'));
  writeTree(root);
  rmSync(join(root, 'Nexabrick CCU/main/slave.cpp'));
  const r = compareFirmwareRegistry(root, baseCatalog());
  rmSync(root, { recursive: true, force: true });
  assert.ok(r.warnings.some(w => w.includes('ccu')));
  assert.equal(r.errors.length, 0, r.errors.join('; '));
});
