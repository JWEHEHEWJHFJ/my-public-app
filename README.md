# Buku Pengawas — Aplikasi Pengawas Sekolah

Aplikasi web statis untuk laporan sekolah kepada pengawas sekolah. Dibangun
dengan HTML, CSS, dan JavaScript murni sehingga bisa langsung di-hosting di
**GitHub Pages** — dan sekarang **data laporan & data sekolah benar-benar
tersimpan di GitHub**, bukan hanya di localStorage, sehingga pihak sekolah dan
pengawas dapat saling melihat data yang sama dari perangkat berbeda.

## Isi folder
- `index.html` — struktur halaman & seluruh tampilan
- `style.css` — tampilan visual
- `data.js` — data contoh (mode demo) & konstanta label GitHub
- `app.js` — logika aplikasi, termasuk pemanggilan GitHub API
- `README.md` — panduan ini

## Bagaimana data disimpan di GitHub

Karena GitHub Pages hanya menyajikan file statis (tidak ada server/database),
aplikasi ini memanggil **GitHub REST API langsung dari peramban** pengguna:

| Data | Disimpan sebagai | Dibaca lewat | Ditulis lewat |
|---|---|---|---|
| Laporan sekolah | **GitHub Issue** (1 laporan = 1 issue) | Issues API (publik) | Issues API (perlu token) |
| Status & catatan tinjauan pengawas | Label + isi issue | Issues API | Issues API (perlu token) |
| Data sekolah binaan | Berkas `sekolah.json` di root repo | Contents API (publik) | Contents API (perlu token) |
| Lampiran foto laporan | Berkas di folder `lampiran/` di repo | raw.githubusercontent.com | Contents API (perlu token) |

Karena itu, **setiap pengguna** (baik pengawas maupun operator sekolah) perlu
memasukkan **token GitHub miliknya sendiri** di menu **Pengaturan GitHub**
supaya bisa mengirim laporan atau menyimpan tinjauan. Token hanya tersimpan di
`localStorage` peramban orang tersebut dan panggilan API dikirim langsung dari
peramban ke `api.github.com` — tidak pernah melewati server pihak ketiga
mana pun.

Membaca data (melihat daftar laporan/sekolah) **tidak wajib** memakai token
jika repository bersifat publik, tetapi tanpa token jumlah permintaan API
dibatasi lebih ketat oleh GitHub (±60 permintaan/jam per alamat IP,
dibanding 5000/jam jika memakai token).

## Cara deploy & menyiapkan repository

1. Buat repository baru di GitHub (publik atau privat), misalnya
   `buku-pengawas`.
2. Unggah keempat file (`index.html`, `style.css`, `data.js`, `app.js`) ke
   root repository tersebut.
3. Tambahkan berkas baru bernama **`sekolah.json`** di root repository berisi:
   ```json
   []
   ```
   (array kosong sebagai data sekolah awal — bisa juga diisi contoh data
   sekolah jika mau).
4. Buka **Settings → General → Features**, pastikan kotak **Issues** dicentang
   (aktif). Laporan disimpan sebagai Issues, jadi fitur ini wajib aktif.
5. Buka **Settings → Pages**, pilih **Source: Deploy from a branch**, branch
   `main`, folder `/ (root)`, lalu **Save**. Tunggu 1–2 menit hingga situs
   aktif di `https://<username>.github.io/buku-pengawas/`.
6. Buka situs tersebut → menu **Pengaturan GitHub** → isi *Pemilik*, *Nama
   repository*, dan *Branch* (`main`), lalu klik **Simpan & sambungkan**.

## Membuat token akses (wajib untuk mengirim/meninjau laporan)

Setiap pengawas dan setiap operator sekolah yang akan mengirim/meninjau
laporan perlu membuat token miliknya sendiri:

1. Buka [github.com/settings/tokens?type=beta](https://github.com/settings/tokens?type=beta)
   (Fine-grained personal access token) sambil login dengan akun GitHub yang
   punya akses ke repository tersebut.
2. Klik **Generate new token**.
3. Pada **Repository access**, pilih **Only select repositories** → pilih
   repository `buku-pengawas` (atau nama repo Anda). Jangan beri akses ke
   repo lain.
4. Pada **Permissions**, atur:
   - **Issues: Read and write**
   - **Contents: Read and write**
   - (izin lain biarkan default/No access)
5. Klik **Generate token**, lalu salin token tersebut (formatnya diawali
   `github_pat_...`).
6. Tempel token itu di menu **Pengaturan GitHub** pada aplikasi, kolom
   *Personal Access Token*, lalu simpan.

> **Peringatan keamanan.** Ini adalah situs statis tanpa server, sehingga
> token tersimpan di localStorage peramban pengguna dan dipakai langsung dari
> sana. Selalu gunakan **fine-grained token** yang dibatasi hanya ke satu
> repository ini dengan izin minimum (Issues & Contents saja). **Jangan**
> pernah memakai *classic token* dengan akses penuh ke seluruh akun/repo,
> dan jangan membagikan token ke orang lain — setiap pengguna sebaiknya
> membuat tokennya sendiri. Siapa pun yang mendapatkan akses ke perangkat/
> peramban seseorang berpotensi membaca token yang tersimpan di sana.

## Cara pakai aplikasi

1. Pilih peran di sidebar: **Pengawas** atau **Sekolah**.
2. Sebagai **Sekolah**: pilih nama sekolah, isi dan kirim formulir laporan —
   laporan langsung tersimpan sebagai GitHub Issue baru.
3. Sebagai **Pengawas**: buka **Daftar Laporan**, klik salah satu laporan
   untuk membaca detail, memberi catatan, dan mengubah status (Menunggu
   Tinjauan / Sedang Ditinjau / Disetujui / Perlu Tindak Lanjut). Perubahan
   ini memperbarui issue yang bersangkutan di GitHub (menutup issue saat
   status "Disetujui"). Laporan yang disetujui menampilkan tanda "stempel"
   verifikasi.
4. Menu **Sekolah Binaan** (khusus pengawas) untuk menambah data sekolah baru
   — tersimpan ke `sekolah.json` di repository.
5. Menu **Pengaturan GitHub** untuk melihat/mengubah repository yang
   tersambung, atau beralih ke **mode demo** (data lokal, tanpa GitHub) untuk
   sekadar mencoba tampilan aplikasi.

## Mode demo

Jika belum menyambungkan ke GitHub (atau memilih "Gunakan data contoh"),
aplikasi berjalan dalam **mode demo**: data disimpan di localStorage
peramban masing-masing, hanya untuk mencoba tampilan — data ini tidak
tersinkron ke pengguna lain.

## Batasan yang perlu diketahui

- **Rate limit GitHub API**: 5.000 permintaan/jam per token, cukup untuk
  penggunaan wajar sekolah/UPT. Jika sangat ramai, pertimbangkan membatasi
  jumlah pemuatan ulang otomatis.
- **Setiap penulisan data (kirim laporan, tinjauan, tambah sekolah)
  memerlukan token** milik pengguna yang sedang membuka aplikasi.
- Karena token disimpan di sisi klien, ini cocok untuk lingkup internal
  (misalnya satu UPT/koordinator wilayah) yang saling percaya, bukan untuk
  aplikasi publik berskala besar. Untuk kebutuhan yang lebih ketat dari sisi
  keamanan/skala, solusi jangka panjang yang lebih tepat adalah menambahkan
  backend sungguhan (mis. Firebase/Supabase) dengan autentikasi pengguna —
  beri tahu saya jika ingin dibantu ke arah itu.
