/**
 * data.js
 * Data awal (seed) & konstanta untuk Aplikasi Pengawas Sekolah.
 * Data sesungguhnya disimpan di localStorage browser (lihat app.js).
 * File ini hanya dipakai untuk mengisi data contoh saat pertama kali dibuka.
 */

const KATEGORI_LAPORAN = [
  "Akademik & Kurikulum",
  "Sarana & Prasarana",
  "Kedisiplinan & Kesiswaan",
  "Keuangan & Administrasi",
  "Kepegawaian",
  "Lainnya"
];

const STATUS_LAPORAN = {
  MENUNGGU: "Menunggu Tinjauan",
  DITINJAU: "Sedang Ditinjau",
  DISETUJUI: "Disetujui / Selesai",
  TINDAK_LANJUT: "Perlu Tindak Lanjut"
};

/* ---------------------------------------------------------------------
 * Konfigurasi penyimpanan data di GitHub.
 * - Laporan disimpan sebagai GitHub Issues pada repository yang dikonfigurasi
 *   pengguna di halaman "Pengaturan GitHub".
 * - Data sekolah disimpan sebagai berkas JSON (SEKOLAH_JSON_PATH) di root
 *   repository yang sama, dibaca/ditulis lewat GitHub Contents API.
 * ------------------------------------------------------------------- */

const SEKOLAH_JSON_PATH = "sekolah.json";
const LABEL_LAPORAN = "laporan";
const LABEL_SEKOLAH_PREFIX = "sekolah:";
const LABEL_KATEGORI_PREFIX = "kategori:";

const STATUS_LABEL = {
  MENUNGGU: "status:menunggu",
  DITINJAU: "status:ditinjau",
  DISETUJUI: "status:disetujui",
  TINDAK_LANJUT: "status:tindak-lanjut"
};

const STATUS_LABEL_TO_KEY = Object.fromEntries(
  Object.entries(STATUS_LABEL).map(([key, label]) => [label, key])
);

const SEED_SEKOLAH = [
  {
    id: "SKL-001",
    nama: "SDN 01 Cempaka Putih",
    npsn: "20104521",
    jenjang: "SD",
    kepalaSekolah: "Hj. Rina Marlina, S.Pd.",
    alamat: "Jl. Cempaka Putih No. 12, Kec. Panakkukang",
    pengawas: "Drs. Andi Wijaya, M.Pd."
  },
  {
    id: "SKL-002",
    nama: "SMPN 3 Tanjung Harapan",
    npsn: "20104778",
    jenjang: "SMP",
    kepalaSekolah: "Muhammad Fauzan, S.Pd., M.M.",
    alamat: "Jl. Tanjung Harapan No. 45, Kec. Mariso",
    pengawas: "Drs. Andi Wijaya, M.Pd."
  },
  {
    id: "SKL-003",
    nama: "SDN 07 Mekar Sari",
    npsn: "20104932",
    jenjang: "SD",
    kepalaSekolah: "Siti Nurhaliza, S.Pd.SD.",
    alamat: "Jl. Mekar Sari Raya No. 8, Kec. Rappocini",
    pengawas: "Dra. Hj. Nurlaela, M.Pd."
  }
];

const SEED_LAPORAN = [
  {
    id: "LAP-0001",
    sekolahId: "SKL-001",
    kategori: "Akademik & Kurikulum",
    periode: "2026-08",
    judul: "Laporan Pelaksanaan Asesmen Tengah Semester Ganjil",
    isi: "Pelaksanaan Asesmen Tengah Semester (ATS) telah berlangsung sesuai jadwal pada tanggal 18-22 Agustus 2026. Seluruh kelas I-VI mengikuti asesmen tanpa kendala berarti. Nilai rata-rata kelulusan indikator capaian pembelajaran mengalami peningkatan 6% dibanding semester sebelumnya.",
    lampiranNama: null,
    lampiranData: null,
    tanggalKirim: "2026-08-23T09:15:00",
    status: "DISETUJUI",
    catatanPengawas: "Laporan lengkap dan tepat waktu. Pertahankan capaian ini pada semester berikutnya.",
    tanggalTinjau: "2026-08-24T10:00:00"
  },
  {
    id: "LAP-0002",
    sekolahId: "SKL-002",
    kategori: "Sarana & Prasarana",
    periode: "2026-08",
    judul: "Kerusakan Atap Ruang Kelas VII-B Akibat Cuaca",
    isi: "Atap ruang kelas VII-B mengalami kebocoran akibat hujan deras pada 20 Agustus 2026. Sementara kegiatan belajar mengajar dipindahkan ke ruang perpustakaan. Sekolah mengajukan permohonan dukungan perbaikan segera mengingat musim hujan masih berlangsung.",
    lampiranNama: null,
    lampiranData: null,
    tanggalKirim: "2026-08-21T14:30:00",
    status: "TINDAK_LANJUT",
    catatanPengawas: "Sudah diteruskan ke Dinas Pendidikan untuk usulan perbaikan darurat. Mohon sekolah kirim foto kondisi terkini.",
    tanggalTinjau: "2026-08-22T08:45:00"
  },
  {
    id: "LAP-0003",
    sekolahId: "SKL-003",
    kategori: "Kedisiplinan & Kesiswaan",
    periode: "2026-08",
    judul: "Rekap Kehadiran Siswa Bulan Agustus",
    isi: "Rata-rata kehadiran siswa bulan Agustus mencapai 96,4%. Terdapat 3 siswa dengan catatan alpa lebih dari 3 hari, telah ditindaklanjuti dengan pemanggilan orang tua/wali oleh guru BK.",
    lampiranNama: null,
    lampiranData: null,
    tanggalKirim: "2026-08-24T11:00:00",
    status: "MENUNGGU",
    catatanPengawas: "",
    tanggalTinjau: null
  },
  {
    id: "LAP-0004",
    sekolahId: "SKL-001",
    kategori: "Keuangan & Administrasi",
    periode: "2026-07",
    judul: "Laporan Realisasi Dana BOS Triwulan III",
    isi: "Realisasi penggunaan Dana BOS Triwulan III mencapai 89% dari total anggaran, digunakan untuk pengadaan buku, honor tenaga kependidikan, dan pemeliharaan ringan. Laporan pertanggungjawaban terlampir.",
    lampiranNama: null,
    lampiranData: null,
    tanggalKirim: "2026-08-10T09:00:00",
    status: "DITINJAU",
    catatanPengawas: "Sedang diverifikasi kesesuaian dengan RKAS.",
    tanggalTinjau: "2026-08-12T13:20:00"
  }
];
