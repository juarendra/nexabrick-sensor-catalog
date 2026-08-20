import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  escape,
  formatEnum,
  normalize,
  buildSearchable,
  filterDevices,
  parseIdParam,
  sanitizeCategory,
  sanitizeStatus,
  safeUrl,
  getCatalogOverview
} from '../assets/lib.mjs';

const device = {
  id: 3,
  slug: 'dry-contact',
  displayName: 'Dry Contact Input',
  softwareName: 'Drycontact',
  category: 'digital-io',
  pcb: { number: '#04', name: 'Four Dry Contacts Inputs' },
  aliases: ['Tibbit'],
  physicalParts: [{ manufacturer: 'N/A', part: 'Generic GPIO' }],
  variantSupport: {
    micro: { status: 'active', interfaces: [{ bus: 'GPIO', address: '32' }] },
    'micro-modular': { status: 'unsupported' }
  }
};

test('escape() neutralizes HTML metacharacters', () => {
  assert.equal(escape('<b>"x"&\'y\'</b>'), '&lt;b&gt;&quot;x&quot;&amp;&#39;y&#39;&lt;/b&gt;');
  assert.equal(escape(null), '');
  assert.equal(escape(undefined), '');
  assert.equal(escape(42), '42');
});

test('formatEnum() title-cases kebab segments', () => {
  assert.equal(formatEnum('digital-io'), 'Digital Io');
  assert.equal(formatEnum(''), '');
  assert.equal(formatEnum(null), '');
  assert.equal(formatEnum(5), '');
});

test('normalize() lowercases, trims, collapses whitespace', () => {
  assert.equal(normalize('  Four   3v3  GPIO  '), 'four 3v3 gpio');
  assert.equal(normalize(null), '');
  assert.equal(normalize(7), '');
});

test('buildSearchable() includes interfaces and normalizes', () => {
  const s = buildSearchable(device);
  assert.ok(s.includes('dry-contact'));
  assert.ok(s.includes('32'));
  assert.ok(s.includes('tibbit'));
  assert.ok(s.includes('generic gpio'));
});

test('filterDevices() searches interfaces by address', () => {
  const found = filterDevices([device], { search: '0x', filters: { status: [], category: [] } });
  assert.equal(found.length, 0);
  const byAddr = filterDevices([device], { search: '32', filters: { status: [], category: [] } });
  assert.deepEqual(byAddr.map(d => d.id), [3]);
});

test('filterDevices() filters by category and status', () => {
  const byCat = filterDevices([device], { search: '', filters: { category: ['digital-io'], status: [] } });
  assert.equal(byCat.length, 1);
  const byStatus = filterDevices([device], { search: '', filters: { category: [], status: ['active'] } });
  assert.equal(byStatus.length, 1);
  const none = filterDevices([device], { search: '', filters: { category: ['pressure'], status: [] } });
  assert.equal(none.length, 0);
});

test('parseIdParam() only accepts full decimal strings', () => {
  assert.equal(parseIdParam('3'), 3);
  assert.equal(parseIdParam('3abc'), null);
  assert.equal(parseIdParam(''), null);
  assert.equal(parseIdParam('-3'), null);
  assert.equal(parseIdParam('99999999999999999999'), null);
  assert.equal(parseIdParam(null), null);
  assert.equal(parseIdParam('1001'), 1001);
});

test('sanitize helpers whitelist against known values', () => {
  const cats = new Set(['digital-io', 'pressure']);
  const statuses = new Set(['active', 'incomplete', 'declared-only']);
  assert.equal(sanitizeCategory('digital-io', cats), 'digital-io');
  assert.equal(sanitizeCategory('garbage', cats), null);
  assert.equal(sanitizeStatus('active', statuses), 'active');
  assert.equal(sanitizeStatus('garbage', statuses), null);
});

test('safeUrl() only permits https URLs', () => {
  assert.equal(safeUrl('https://example.com/x'), 'https://example.com/x');
  assert.equal(safeUrl('http://example.com'), null);
  assert.equal(safeUrl('javascript:alert(1)'), null);
  assert.equal(safeUrl(''), null);
  assert.equal(safeUrl('not a url'), null);
});

test('getCatalogOverview counts all devices', () => {
  const overview = getCatalogOverview({
    devices: [device, device],
    variants: [{ key: 'micro' }]
  });
  assert.equal(overview.devices, 2);
});

test('getCatalogOverview counts active devices once even when multiple variants are active', () => {
  const overview = getCatalogOverview({
    variants: [{ key: 'micro' }, { key: 'ccu' }],
    devices: [
      {
        category: 'environmental',
        variantSupport: {
          micro: { status: 'active' },
          ccu: { status: 'active' }
        }
      },
      {
        category: 'digital-io',
        variantSupport: {
          micro: { status: 'unsupported' }
        }
      }
    ]
  });

  assert.deepEqual(overview, {
    devices: 2,
    active: 1,
    categories: 2,
    variants: 2,
    coverage: 50
  });
});

test('getCatalogOverview does not count incomplete/declared-only/unsupported as active', () => {
  const overview = getCatalogOverview({
    variants: [{ key: 'micro' }],
    devices: [
      { category: 'env', variantSupport: { micro: { status: 'incomplete' } } },
      { category: 'env', variantSupport: { micro: { status: 'declared-only' } } },
      { category: 'env', variantSupport: { micro: { status: 'unsupported' } } },
      { category: 'env', variantSupport: { micro: { status: 'auxiliary' } } },
      { category: 'env', variantSupport: { micro: { status: 'unresolved' } } }
    ]
  });
  assert.equal(overview.active, 0);
});

test('getCatalogOverview counts unique categories and all variants including micro-modular', () => {
  const overview = getCatalogOverview({
    variants: [{ key: 'micro' }, { key: 'micro-modular' }, { key: 'ccu' }],
    devices: [
      { category: 'environmental', variantSupport: {} },
      { category: 'environmental', variantSupport: {} },
      { category: 'digital-io', variantSupport: {} }
    ]
  });
  assert.equal(overview.categories, 2);
  assert.equal(overview.variants, 3);
});

test('getCatalogOverview rounds coverage to nearest whole percentage', () => {
  const overview = getCatalogOverview({
    variants: [],
    devices: [
      { category: 'env', variantSupport: { micro: { status: 'active' } } },
      { category: 'env', variantSupport: { micro: { status: 'unsupported' } } },
      { category: 'env', variantSupport: { micro: { status: 'unsupported' } } }
    ]
  });
  assert.equal(overview.coverage, 33);
});

test('getCatalogOverview returns zeros for missing/empty arrays', () => {
  const overview = getCatalogOverview(null);
  assert.deepEqual(overview, { devices: 0, active: 0, categories: 0, variants: 0, coverage: 0 });
  assert.deepEqual(getCatalogOverview({}), { devices: 0, active: 0, categories: 0, variants: 0, coverage: 0 });
  assert.deepEqual(getCatalogOverview({ devices: [], variants: [] }), { devices: 0, active: 0, categories: 0, variants: 0, coverage: 0 });
});

test('getCatalogOverview does not throw when a device lacks variantSupport', () => {
  const overview = getCatalogOverview({
    variants: [{ key: 'micro' }],
    devices: [
      { category: 'environmental' },
      { category: 'digital-io', variantSupport: null }
    ]
  });
  assert.deepEqual(overview, { devices: 2, active: 0, categories: 2, variants: 1, coverage: 0 });
});