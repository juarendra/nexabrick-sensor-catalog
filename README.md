# Nexabrick Sensor Catalog

Katalog interaktif dan dokumentasi sensor hardware untuk firmware Nexabrick, yang diekstrak langsung dari sumber kode ESP-IDF.

🔗 **[Lihat Katalog Interaktif](https://juarendra.github.io/nexabrick-sensor-catalog/)**

## Overview
Repositori ini adalah _source-of-truth_ publik yang memetakan modul IC fisik dengan representasi perangkat lunaknya dalam firmware Nexabrick (Micro, Micro RND, Micro Duo, CCU, Modular). 

Website dibangun tanpa frontend framework (pure HTML/CSS/JS) agar mudah dikembangkan dan diaudit. Sumber data tunggalnya berada di `data/catalog.json`.

Setiap perangkat juga memiliki identitas PCB Tibbit bila dapat dibuktikan dari schematic/BOM pada arsip hardware. Nomor PCB bukan sensor ID: sebagai contoh, sensor ID 21 OPT3007 menggunakan PCB `#48`. Mapping yang belum dapat dibuktikan ditampilkan sebagai `PCB —`, bukan ditebak dari kesamaan angka.

## Cara Kerja Update Data

Katalog ini mencerminkan snapshot kode firmware yang sebenarnya. Aturan untuk berkontribusi:

1. **Firmware-First**: Jika firmware belum memiliki dukungan (bahkan deklaratif), sensor tidak diizinkan masuk katalog ini.
2. **Validasi Lokal**: Setiap ada PR perubahan `catalog.json`, jalankan perintah ini sebelum commmit:
   ```bash
   node scripts/validate-catalog.mjs
   ```
3. **Konsistensi Firmware (lokal)**: Untuk memastikan katalog selaras dengan pohon sumber firmware (task, bank Modbus baterai, ukuran slot CCU, parent Tibbit id `20`, profil modular `1001`-`1016`, selector UI), jalankan tool ini dari lokal dengan path checkout firmware:
   ```bash
   node scripts/compare-firmware-registry.mjs <path-ke-repo-Nexabrick_Firmware>
   ```
   Tool ini hanya dijalankan secara lokal (fixture diuji CI), sehingga CI tidak bergantung pada checkout firmware terbaru yang tidak dipin.
4. Data akan divalidasi CI GitHub Actions, lalu otomatis di-deploy ke GitHub Pages saat masuk ke branch `main`.

## Provenance

Blok `generatedFrom` di `catalog.json` merekam asal audit:

- `firmwareCommit`: SHA 40-digit commit firmware Nexabrick yang menjadi sumber audit. Ini adalah sumber kebenaran; badge website dan link bukti (`evidence`) menunjuk ke commit ini.
- `commit`: mirror legasi, hanya boleh ada bila nilainya sama dengan `firmwareCommit`.
- `catalogRepository` / `catalogCommit`: repo dan commit katalog saat audit dilakukan (bukan commit hasil PR).

Validator menolak `firmwareCommit` non-hex, mirror `commit` yang tidak sama, `catalogRepository` non-HTTPS, atau `catalogCommit` non-hex.

## Jalankan Website Lokal

Katalog berjalan murni statis tanpa Node server. Jalankan sembarang HTTP server di root repository ini:

```bash
python -m http.server 8080
```
Lalu buka: `http://localhost:8080/`

## Status dan Konfidensi

Di dalam `catalog.json`, status implementasi diatur dengan flag:
- `active`: Telah didispatch oleh launcher dan ditangani.
- `incomplete`: Dijalankan, tetapi interface Modbus/MQTT rusak atau belum diimplementasi sempurna.
- `declared-only`: Nama sensor dideklarasikan, tetapi tidak di-loop dalam program.
- `ui-only`: Hanya tersedia dalam dropdown UI portal configurasi namun tak memiliki representasi C++.
- `unsupported`: Tidak ditujukan untuk variant ini.

Level konfidensi komponen:
- `confirmed`: Firmware dan vendor datasheet selaras.
- `firmware-confirmed`: Fungsional firmware terkonfirmasi, komponen IC tidak tercatat.
- `unresolved`: Konflik resolusi data ditemukan antara nama web, implementasi macro C, atau hardware modulnya.

## Media Hardware

Setiap perangkat **bisa** punya blok `media` opsional di `catalog.json` yang menampilkan referensi visual (gambar) dan model 3D interaktif di panel detail. Media bersifat **referensi saja** — bukan PCB produksi dan bukan bukti kualifikasi hardware. Saat ini hanya sensor ID `3` (Dry Contact Input) yang memiliki media.

### Skema
```json
"media": [
  {
    "label": "Nama varian",
    "variant": "micro",
    "images": [{ "src": "media/<folder>/foto.png", "alt": "Deskripsi" }],
    "model": { "src": "media/<folder>/model.glb", "poster": "media/<folder>/foto.png" },
    "cadDownloads": [{ "label": "Download STEP", "src": "media/<folder>/file.step", "format": "STEP" }],
    "confidence": "unresolved",
    "hardwareStatus": "pending"
  }
]
```

- `src` harus path relatif dari root repo (tanpa `http(s)://`, tanpa path absolut). Folder boleh mengandung spasi — URL di-encode otomatis per-segmen saat dirender.
- Format gambar: `.png .jpg .jpeg .webp`. Format model 3D: `.glb .gltf`. Format CAD download: `.step .stp .skp .iges`.
- `hardwareStatus`: `pending | not-qualified | hardware-verified | unresolved`. Media tidak boleh mengklaim `hardware-verified` tanpa bukti hardware.
- Viewer 3D memakai `<model-viewer>` (CDN, versi di-pin) dengan fallback ke poster + download bila CDN tak tersedia.

### Menghasilkan model GLB dari CAD
Browser tidak bisa merender `.step`/`.skp` secara langsung, jadi file CAD diproses menjadi `model.glb` (self-contained, < 10 MB disarankan) yang dipakai viewer, sementara file CAD asli tetap disediakan sebagai download. Pipeline referensi (cadquery/OCP + Blender headless):
1. `cadquery` membaca STEP → tessellate → OBJ (dipusatkan di origin).
2. Blender headless: import OBJ → merge + decimate agar ringan → material netral → export GLB.

### Validasi
```bash
node scripts/validate-catalog.mjs   # skema + aturan media (path relatif, ekstensi, status)
node scripts/validate-media.mjs     # semua file yang dirujuk benar-benar ada di disk
```
CI menjalankan keduanya plus suite test. `validate-media.mjs` memastikan tidak ada referensi media mati yang ter-deploy.

---

_Terkoneksi pada: [GSPETech/Nexabrick_Firmware](https://github.com/GSPETech/Nexabrick_Firmware)_
