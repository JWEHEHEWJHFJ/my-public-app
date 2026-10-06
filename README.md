# Aplikasi Absensi Siswa — Face Recognition + Liveness

Tiga berkas: `Code.gs` (backend Google Apps Script), `index.html` (antarmuka + scan wajah),
`spreadsheet.xlsx` (template struktur sheet).

---

## 1. Siapkan spreadsheet

1. Buka [sheets.google.com](https://sheets.google.com) → **File › Import** → unggah `spreadsheet.xlsx`
   → pilih **Replace spreadsheet**.
2. Beri nama, misalnya `DB Absensi Siswa`.
3. Hapus baris contoh di sheet `siswa`, isi data siswa asli (kolom `descriptor` dan
   `diperbarui` jangan disentuh — diisi otomatis).

## 2. Pasang Apps Script (backend)

1. Dari spreadsheet tadi: **Extensions › Apps Script**.
2. Hapus isi `Code.gs` bawaan, tempel isi `Code.gs` dari paket ini.
3. **File › + › HTML**, beri nama persis `index` (tanpa `.html`), tempel isi `index.html`.
4. Di `Code.gs` ubah `TZ` bila perlu: `Asia/Jakarta`, `Asia/Makassar`, atau `Asia/Jayapura`.
   Biarkan `SS_ID = ''` karena script menempel pada spreadsheet.
5. Pilih fungsi **`setupAwal`** di toolbar → **Run** → izinkan akses.
   Ini membuat sheet `users`, `siswa`, `log`, `datang<bulan>`, `pulang<bulan>`
   dan akun **admin / admin123**.
6. **Deploy › New deployment › Web app**
   - Execute as: **Me**
   - Who has access: **Anyone** — wajib. Kalau dipilih *Anyone with Google account*,
     permintaan dari GitHub Pages akan dibelokkan ke halaman login Google dan gagal.
   - Salin URL `…/exec`.

> **Setiap kali `Code.gs` diubah, URL tidak otomatis ikut terbarui.**
> Buka **Deploy › Manage deployments › ikon pensil › Version: New version › Deploy**.
> Cara ini mempertahankan URL yang sama. Kalau Anda pilih *New deployment*, URL-nya berubah
> dan harus diganti lagi di `index.html`.

URL yang sudah terpasang di `index.html` paket ini:

```
https://script.google.com/macros/s/AKfycbwQfcAsDBpx5ybOp6i6DCRX6Me97oYEvuo-ooKeDQhepKTm2-KI1Lnebykr1S1sEhcqsQ/exec
```

Kalau nanti Anda deploy ulang dan URL berubah, ganti nilai `API_URL` di baris awal blok
`<script>` pada `index.html`.

## 3. Hosting `index.html` di GitHub

1. Buat repository baru di GitHub, misalnya `absensi-siswa`, set **Public**.
2. Unggah `index.html` ke root repository (**Add file › Upload files**).
3. **Settings › Pages** → Source: **Deploy from a branch** → Branch: `main`, folder `/ (root)`
   → **Save**.
4. Tunggu satu sampai dua menit, lalu buka:
   `https://<username>.github.io/absensi-siswa/`

> **Jangan pakai link `raw.githubusercontent.com`.** GitHub menyajikan berkas raw sebagai
> `text/plain`, jadi halamannya tampil sebagai kode mentah, bukan aplikasi. Harus lewat
> GitHub Pages.

Setelah terbuka, masuk ke **Pengaturan › Tes koneksi backend**. Kalau muncul
"✓ Terhubung" beserta jam server, berarti GitHub Pages dan Apps Script sudah tersambung.

### Kenapa bisa lintas domain

`index.html` mengirim permintaan sebagai `POST` dengan `Content-Type: text/plain`, bukan
`application/json`. `text/plain` termasuk tipe yang aman menurut spesifikasi CORS, jadi browser
tidak mengirim permintaan `OPTIONS` pendahuluan — dan itu penting, karena Apps Script memang
tidak bisa menjawab `OPTIONS`. Isi body-nya tetap JSON `{fn, args}` dan dibaca sebagai JSON oleh
`doPost` di `Code.gs`.

Keuntungan lain: di GitHub Pages halaman berjalan sebagai halaman utama, bukan di dalam iframe
sandbox Apps Script, sehingga izin kamera jauh lebih lancar — terutama di Android.

## 4. Pakai

| Menu | Fungsi |
|---|---|
| **Dashboard** | Jumlah siswa, datang/pulang hari ini, antrean sinkron, aktivitas terakhir |
| **Scan Wajah** | Pilih tab DATANG / PULANG → **Mulai Scan** |
| **Data Siswa** | Isi NISN, nama, kelas, tingkatan → **Rekam Wajah & Simpan** (ambil 5 sampel, dirata-ratakan) |
| **Rekap** | Lihat isi sheet bulan mana pun langsung dari aplikasi |
| **Galeri Foto** | Foto absensi tersimpan permanen; tombol **Pilih folder penyimpanan** menyalin ke folder perangkat |
| **Pengaturan** | Interval sinkron, ambang kemiripan, jeda anti-dobel, ganti password |

### Alur liveness (anti-foto)
Empat langkah berurutan yang wajib dilewati sebelum wajah dicocokkan:
**hadap lurus → toleh KANAN → toleh KIRI → hadap lurus lagi.**
Arah dihitung dari posisi hidung relatif terhadap garis rahang (landmark 68 titik), jadi foto
diam di depan kamera tidak akan pernah lolos. Bingkai berubah hijau saat posisi benar.

---

## Struktur sheet absensi

Nama sheet dibuat otomatis: `datang` / `pulang` + nama bulan → `datangoktober`, `pulangoktober`,
`datangnovember`, dan seterusnya. Kalau sheet bulan berjalan belum ada, dibuat saat data pertama
masuk.

```
        A          B                                   C          …   AF
1     KELAS        1                                   2          …   31
2     X            0051234567@07:02#0051234568@07:05   …
3     XI           0049876543@06:58                    …
4     XII          0038765432@07:11                    …
```

- Kolom A: header `KELAS`, lalu tingkatan X / XI / XII di baris 2–4.
- Baris 1 kolom B dan seterusnya: tanggal. Tanggal 1 → kolom B, tanggal 2 → kolom C, dst.
- Isi sel: `nisn@waktu`. Bila beberapa siswa pada tingkatan dan tanggal yang sama:
  `nisn@waktu#nisn@waktu#nisn@waktu`.
- NISN yang sudah ada tidak ditulis ulang — waktu scan pertama yang dipertahankan.

---

## Cara kerja penyimpanan

**Database harian (IndexedDB di perangkat).** Tiap scan berhasil disimpan lokal dulu dengan
kunci `tipe|nisn`, lalu ditandai `terkirim` setelah masuk spreadsheet. Saat tanggal berganti,
seluruh isi tabel absensi dikosongkan otomatis (dicek tiap menit dan tiap kali sinkron).
Galeri foto **tidak** ikut terhapus.

**Sinkronisasi.** Tiap 5 menit (bisa diubah di Pengaturan) aplikasi memeriksa antrean `datang`
dan `pulang` secara terpisah. Kalau tidak ada data baru, tidak ada permintaan yang dikirim sama
sekali. Kalau internet putus, data tetap mengantre dan dikirim ulang pada siklus berikutnya.
Tombol **Kirim sekarang** memaksa sinkron manual.

**Foto.** Setiap absensi berhasil memotret satu frame dan menyimpannya permanen dengan nama
`nama@nisn@kelas@tingkatan.jpg`, di dalam folder `tipe/tanggal/`. Dua lokasi:
IndexedDB (selalu) dan folder perangkat yang dipilih lewat **Pilih folder penyimpanan**
(Chrome/Edge desktop, File System Access API).

---

## Kapasitas & performa

Pencocokan wajah berjalan di perangkat memakai descriptor 128 dimensi — 2.000 wajah hanya
sekitar 256.000 operasi per scan, selesai di bawah satu milidetik, jadi sesi pagi 2.000 siswa
dan sesi sore 2.000 siswa aman. Model `@vladmandic/face-api` gratis, tanpa API key, tanpa kuota.

Agar ringan untuk jumlah besar:

- Pakai beberapa perangkat scan sekaligus; semuanya menulis ke sheet yang sama dan sudah
  dilindungi `LockService`.
- Ambang kemiripan default `0.45`. Turunkan (0.40) bila ada salah kenal, naikkan (0.50) bila
  banyak wajah tidak terdeteksi.
- Pastikan pencahayaan merata dan wajah mengisi sekitar sepertiga layar.

---

## Masalah yang sering muncul

**Kamera tidak muncul.** Kamera hanya diizinkan di HTTPS — GitHub Pages sudah HTTPS. Periksa
ikon gembok di address bar, pastikan izin kamera tidak diblokir untuk domain
`<username>.github.io`.

**"Balasan bukan JSON".** Deployment belum disetel *Who has access: **Anyone***, jadi Google
mengembalikan halaman login alih-alih data. Perbaiki di Manage deployments.

**"Fungsi tidak dikenal" atau tes koneksi gagal setelah ganti Code.gs.** Anda belum membuat
versi deployment baru. Deploy › Manage deployments › pensil › Version: New version › Deploy.

**"Model gagal dimuat".** Model diambil dari CDN jsdelivr saat aplikasi dibuka. Perlu internet
pada pemuatan pertama; setelah itu browser men-cache-nya.

**Wajah tidak dikenali.** Siswa belum direkam wajahnya, atau direkam dalam kondisi cahaya yang
jauh berbeda. Rekam ulang lewat menu Data Siswa — data lama otomatis ditimpa berdasarkan NISN.

**Sheet bulan baru.** Dibuat otomatis. Bila ingin disiapkan di awal bulan, pasang trigger harian
untuk fungsi `siapkanSheetBulanIni` lewat menu **Triggers** di editor Apps Script.

---

## Keamanan

- Password disimpan sebagai hash SHA-256. Password polos di sheet otomatis di-hash saat login
  pertama.
- Token sesi disimpan di `CacheService` server dan berlaku 12 jam.
- **Ganti password `admin123` segera** lewat menu Pengaturan.
- Data biometrik (descriptor wajah) tersimpan di spreadsheet milik sekolah, bukan di layanan
  pihak ketiga. Tetap minta persetujuan wali murid sebelum merekam wajah siswa.
