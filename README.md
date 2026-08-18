# Nexabrick Sensor Catalog

Katalog interaktif dan dokumentasi sensor hardware untuk firmware Nexabrick, yang diekstrak langsung dari sumber kode ESP-IDF.

🔗 **[Lihat Katalog Interaktif](https://juarendra.github.io/nexabrick-sensor-catalog/)**

## Overview
Repositori ini adalah _source-of-truth_ publik yang memetakan modul IC fisik dengan representasi perangkat lunaknya dalam firmware Nexabrick (Micro, Micro RND, Micro Duo, CCU, Modular). 

Website dibangun tanpa frontend framework (pure HTML/CSS/JS) agar mudah dikembangkan dan diaudit. Sumber data tunggalnya berada di `data/catalog.json`.

## Cara Kerja Update Data

Katalog ini mencerminkan snapshot kode firmware yang sebenarnya. Aturan untuk berkontribusi:

1. **Firmware-First**: Jika firmware belum memiliki dukungan (bahkan deklaratif), sensor tidak diizinkan masuk katalog ini.
2. **Validasi Lokal**: Setiap ada PR perubahan `catalog.json`, jalankan perintah ini sebelum commmit:
   ```bash
   node scripts/validate-catalog.mjs
   ```
3. Data akan divalidasi CI GitHub Actions, lalu otomatis di-deploy ke GitHub Pages saat masuk ke branch `main`.

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

---

_Terkoneksi pada: [GSPETech/Nexabrick_Firmware](https://github.com/GSPETech/Nexabrick_Firmware)_