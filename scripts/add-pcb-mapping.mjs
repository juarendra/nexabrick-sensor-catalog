import { readFileSync, writeFileSync } from 'node:fs';

const path = new URL('../data/catalog.json', import.meta.url);
const catalog = JSON.parse(readFileSync(path, 'utf8'));

const mappings = new Map([
  [3, {
    number: '#04',
    name: 'Four Dry Contacts Inputs',
    confidence: 'probable',
    sourcePath: '#04 [1A SLOT] FOUR DRY CONTACTS INPUTS/doc/registers.md'
  }],
  [5, {
    number: '#30',
    name: 'Data Center Water Leak Rope Sensor',
    confidence: 'probable',
    sourcePath: '#30 [1A SLOT] DATA CENTER WATER LEAK ROPE SENSOR/doc/registers.md'
  }],
  [9, {
    number: '#92',
    name: 'Data Center Temp Hum Sensor',
    confidence: 'probable',
    sourcePath: '#92 [1B SLOT ]  DATA CENTER TEMP HUM SENSOR/sch-pcb/BOM/[BOM] #92 DATA CENTER TEMP HUM SENSOR.csv'
  }],
  [10, {
    number: '#51',
    name: 'Ambient Humidity Onboard Sensor',
    confidence: 'probable',
    sourcePath: '#51 [1B SLOT ] AMBIENT HUMIDITY ONBOARD SENSOR/sch-pcb/BOM/Bill Of Materials #51 AMBIENT HUMIDITY ONBOARD SENSOR.csv'
  }],
  [15, {
    number: '#94',
    name: 'Data Center Air Quality PM Sensor',
    confidence: 'probable',
    sourcePath: '#94 [1B SLOT ]  DATA CENTER AIR QUALITY SENSORS PARTICULATE MATTER (PM) SENSOR/sch-pcb/BOM/[BOM] #94 DATA CENTER AIR QUALITY SENSORS PARTICULATE MATTER (PM)SENSOR.csv'
  }],
  [16, {
    number: '#96',
    name: 'Data Center Air Pressure Sensor',
    confidence: 'probable',
    sourcePath: '#96 [1A+1B SLOT] DATA CENTER AIR PRESSURE SENSOR/sch-pcb/BOM/[BOM] #96 [1A+1B SLOT] DATA CENTER AIR PRESSURE SENSOR.csv'
  }],
  [18, {
    number: '#95',
    name: 'Data Center Air Flow Sensor',
    confidence: 'probable',
    sourcePath: '#95 [1B SLOT ]  DATA CENTER AIR FLOW SENSOR/sch-pcb/BOM/[BOM] #95 DATA CENTER AIR FLOW SENSOR.csv'
  }],
  [19, {
    number: '#52',
    name: 'Ambient Pressure Onboard Sensor',
    confidence: 'probable',
    sourcePath: '#52 [1B SLOT ] AMBIENT PRESSURE ONBOARD SENSOR/sch-pcb/BOM/Bill Of Materials #52 AMBIENT PRESSURE ONBOARD SENSOR.csv'
  }],
  [21, {
    number: '#48',
    name: 'Ambient Light Onboard Sensor',
    confidence: 'probable',
    sourcePath: '#48 [1B SLOT] AMBIENT LIGHT ONBOARD SENSOR/sch-pcb/BOM/Bill Of Materials #48 AMBIENT LIGHT SENSOR.csv'
  }],
  [25, {
    number: '#110',
    name: 'TVOC Indoor Air Quality Combo',
    confidence: 'probable',
    sourcePath: '#110 [1A+1B SLOT] TVOC  Indoor Air Quality (IAQ) Combo/sch-pcb/BOM/[BOM] #110 [1A+1B SLOT] TVOC  Indoor Air Quality (IAQ) Combo.csv',
    note: 'BOM PCB memuat SHT4x dan SGP41; SPS30 pada kontrak firmware kemungkinan perangkat eksternal.'
  }],
  [38, {
    number: '#118',
    name: 'Thermal Sensor for Busbar',
    confidence: 'confirmed',
    sourcePath: '#118 [1A+1B SLOT] THERMAL SENSOR FOR BUSBAR/sch-pcb/KICAD/Modular PCB Tipe AB.kicad_sch'
  }]
]);

for (const device of catalog.devices) {
  device.pcb = mappings.get(device.id) ?? {
    number: null,
    name: null,
    confidence: 'unresolved',
    sourcePath: null,
    note: 'Belum ditemukan PCB bernomor yang dapat dipetakan secara andal.'
  };
}

writeFileSync(path, `${JSON.stringify(catalog, null, 2)}\n`);
