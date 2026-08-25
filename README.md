# Buku Pengawas — Aplikasi Pengawas Sekolah

Aplikasi web statis untuk laporan sekolah kepada pengawas sekolah. Dibangun murni
dengan HTML, CSS, dan JavaScript (tanpa server/backend) sehingga bisa langsung
di-hosting di **GitHub Pages**.

## Isi folder
- `index.html` — struktur halaman & seluruh tampilan (dashboard, daftar laporan, form kirim laporan, data sekolah)
- `style.css` — tampilan visual
- `data.js` — data contoh awal (sekolah & laporan) dan daftar kategori/status
- `app.js` — logika aplikasi (navigasi, form, filter, penyimpanan data)

## Cara kerja data
Karena GitHub Pages hanya melayani file statis (tidak ada database), semua data
laporan dan sekolah yang ditambahkan pengguna disimpan di **localStorage**
peramban masing-masing pengguna. Artinya:
- Data akan tetap ada selama pengguna membuka aplikasi dari peramban yang sama.
- Data **tidak otomatis tersinkron** antar perangkat/pengguna yang berbeda,
  karena tidak ada server pusat.
- Jika Anda butuh data laporan benar-benar terpusat (semua sekolah mengirim
  laporan dan pengawas melihatnya dari perangkat lain), Anda perlu menambahkan
  backend/database sederhana (misalnya Google Sheets API, Firebase, atau
  Supabase) — beri tahu saya jika ingin dibantu menyambungkannya.

## Cara pakai aplikasi
1. Pilih peran di sidebar: **Pengawas** atau **Sekolah**.
2. Sebagai **Sekolah**: pilih nama sekolah, lalu isi dan kirim formulir laporan.
3. Sebagai **Pengawas**: lihat ringkasan, buka **Daftar Laporan**, klik salah
   satu laporan untuk membaca detail, memberi catatan, dan mengubah status
   (Menunggu Tinjauan / Sedang Ditinjau / Disetujui / Perlu Tindak Lanjut).
   Laporan yang disetujui akan menampilkan tanda "stempel" verifikasi.
4. Menu **Sekolah Binaan** (khusus pengawas) untuk menambah data sekolah baru.

## Cara deploy ke GitHub Pages
1. Buat repository baru di GitHub, misalnya `buku-pengawas`.
2. Unggah keempat file (`index.html`, `style.css`, `data.js`, `app.js`) ke
   root repository tersebut (bisa lewat web GitHub: "Add file" → "Upload files").
3. Buka **Settings → Pages** pada repository.
4. Pada bagian **Build and deployment**, pilih **Source: Deploy from a branch**,
   lalu pilih branch `main` dan folder `/ (root)`. Klik **Save**.
5. Tunggu 1-2 menit, GitHub akan menampilkan URL situs, biasanya berbentuk:
   `https://<username-anda>.github.io/buku-pengawas/`
6. Buka URL tersebut — aplikasi siap digunakan.

Atau lewat terminal:
```bash
git init
git add index.html style.css data.js app.js README.md
git commit -m "Buku Pengawas: aplikasi laporan sekolah untuk pengawas"
git branch -M main
git remote add origin https://github.com/<username-anda>/buku-pengawas.git
git push -u origin main
```
Kemudian aktifkan GitHub Pages seperti langkah 3-4 di atas.

## Mengubah data contoh
Buka `data.js` untuk mengganti daftar sekolah binaan awal (`SEED_SEKOLAH`) dan
kategori laporan (`KATEGORI_LAPORAN`) sesuai kebutuhan wilayah/UPT Anda. Data
ini hanya dipakai sebagai isian awal — setelah aplikasi dibuka sekali, data
aktif akan tersimpan di localStorage dan perubahan pada `data.js` tidak lagi
memengaruhi pengguna yang sudah pernah membuka aplikasi tersebut.
