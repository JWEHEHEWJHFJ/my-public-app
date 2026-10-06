/**************************************************************
 * APLIKASI ABSENSI SISWA - FACE RECOGNITION + LIVENESS
 * Backend Google Apps Script
 *
 * Struktur sheet otomatis:
 *   datangoktober / pulangoktober / datangnovember / dst.
 *   A1 = KELAS, A2 = X, A3 = XI, A4 = XII
 *   B1 = 1, C1 = 2, ... (tanggal)
 *   Isi sel = nisn@waktu#nisn@waktu#...
 **************************************************************/

/*************** KONFIGURASI ***************/
// Kosongkan jika script dibuat dari menu Extensions > Apps Script di spreadsheet.
// Isi dengan ID spreadsheet jika script berdiri sendiri (standalone).
const SS_ID = '';

const TZ      = 'Asia/Makassar';   // ganti sesuai lokasi: Asia/Jakarta | Asia/Makassar | Asia/Jayapura
const TOLERAN = 0.45;              // ambang kemiripan wajah (dipakai di client)
const SESI_JAM = 12;               // masa berlaku token login (jam)

const BULAN = ['januari','februari','maret','april','mei','juni',
               'juli','agustus','september','oktober','november','desember'];
const TINGKATAN = ['X', 'XI', 'XII'];   // baris 2, 3, 4

const SH_USER  = 'users';
const SH_SISWA = 'siswa';
const SH_LOG   = 'log';


/*************** ENTRY POINT ***************/
/**
 * doGet melayani dua hal:
 *  1. ?fn=namaFungsi&args=[...]  -> balasan JSON (dipakai saat index.html di-hosting
 *     di luar Apps Script, misal GitHub Pages)
 *  2. tanpa parameter            -> menyajikan index.html (bila file 'index' ada di proyek)
 */
function doGet(e) {
  if (e && e.parameter && e.parameter.fn) {
    var argsG = [];
    try { argsG = e.parameter.args ? JSON.parse(e.parameter.args) : []; } catch (x) {}
    return jalankanApi(e.parameter.fn, argsG);
  }
  try {
    return HtmlService.createTemplateFromFile('index')
      .evaluate()
      .setTitle('Absensi Siswa')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1, maximum-scale=1')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  } catch (err) {
    // Proyek tanpa file index (backend murni) -> tampilkan status singkat.
    return ContentService.createTextOutput(
      'Backend Absensi Siswa aktif. Panggil lewat POST JSON {fn, args}.'
    );
  }
}

/**
 * doPost adalah pintu utama saat index.html di-hosting di GitHub Pages.
 * Body dikirim sebagai text/plain berisi JSON {fn: 'login', args: [...]}
 * supaya browser tidak melakukan preflight OPTIONS (Apps Script tidak bisa
 * menjawab OPTIONS). Balasan ContentService sudah mengizinkan akses lintas domain.
 */
function doPost(e) {
  var req = {};
  try {
    req = JSON.parse((e && e.postData && e.postData.contents) || '{}');
  } catch (err) {
    return jsonOut({ ok: false, pesan: 'Body bukan JSON yang sah.' });
  }
  return jalankanApi(req.fn, req.args || []);
}

/** Daftar fungsi yang boleh dipanggil dari luar. */
function fungsiApi() {
  return {
    ping: ping,
    jamServer: jamServer,
    login: login,
    logout: logout,
    gantiPassword: gantiPassword,
    getSiswa: getSiswa,
    simpanSiswa: simpanSiswa,
    hapusSiswa: hapusSiswa,
    submitAbsensi: submitAbsensi,
    getRekap: getRekap,
    getStatistik: getStatistik
  };
}

function jalankanApi(nama, args) {
  var daftar = fungsiApi();
  var fn = Object.prototype.hasOwnProperty.call(daftar, nama) ? daftar[nama] : null;
  if (!fn) return jsonOut({ ok: false, pesan: 'Fungsi tidak dikenal: ' + nama });
  try {
    return jsonOut({ ok: true, hasil: fn.apply(null, args) });
  } catch (err) {
    return jsonOut({ ok: false, pesan: String((err && err.message) || err) });
  }
}

function jsonOut(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function ping() {
  return { ok: true, waktu: Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH:mm:ss') };
}

function include(nama) {
  return HtmlService.createHtmlOutputFromFile(nama).getContent();
}

function getSS() {
  return SS_ID ? SpreadsheetApp.openById(SS_ID) : SpreadsheetApp.getActiveSpreadsheet();
}


/*************** SETUP AWAL ***************/
/**
 * Jalankan SEKALI dari editor Apps Script.
 * Membuat sheet users + siswa + log, dan akun admin default.
 * Login default: admin / admin123  (SEGERA GANTI)
 */
function setupAwal() {
  const ss = getSS();

  // --- users ---
  let shU = ss.getSheetByName(SH_USER);
  if (!shU) {
    shU = ss.insertSheet(SH_USER);
    shU.getRange('A1:E1').setValues([['username', 'password', 'nama', 'role', 'aktif']]);
    shU.getRange('A2:E2').setValues([['admin', hashPw('admin123'), 'Administrator', 'admin', 'YA']]);
    shU.getRange('A2:E2').setNumberFormat('@');
    shU.setFrozenRows(1);
    shU.getRange('A1:E1').setFontWeight('bold').setBackground('#F6C445');
  }

  // --- siswa ---
  let shS = ss.getSheetByName(SH_SISWA);
  if (!shS) {
    shS = ss.insertSheet(SH_SISWA);
    shS.getRange('A1:F1').setValues([['nisn', 'nama', 'kelas', 'tingkatan', 'descriptor', 'diperbarui']]);
    shS.getRange('A2:F4').setValues([
      ['0051234567', 'Contoh Siswa X',   'X IPA 1',   'X',   '', ''],
      ['0049876543', 'Contoh Siswa XI',  'XI IPA 2',  'XI',  '', ''],
      ['0038765432', 'Contoh Siswa XII', 'XII IPS 1', 'XII', '', '']
    ]);
    shS.getRange('A:A').setNumberFormat('@');   // NISN harus teks agar 0 di depan tidak hilang
    shS.setFrozenRows(1);
    shS.getRange('A1:F1').setFontWeight('bold').setBackground('#F6C445');
    shS.setColumnWidth(5, 120);
  }

  // --- log ---
  let shL = ss.getSheetByName(SH_LOG);
  if (!shL) {
    shL = ss.insertSheet(SH_LOG);
    shL.getRange('A1:G1').setValues([['waktu_server', 'tipe', 'tanggal', 'nisn', 'nama', 'tingkatan', 'jam']]);
    shL.setFrozenRows(1);
    shL.getRange('A1:G1').setFontWeight('bold').setBackground('#F6C445');
  }

  // Sheet bulan berjalan
  sheetBulan('datang', new Date());
  sheetBulan('pulang', new Date());

  return 'Setup selesai. Login: admin / admin123';
}


/*************** AUTENTIKASI ***************/
function hashPw(teks) {
  const raw = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(teks), Utilities.Charset.UTF_8);
  return raw.map(function (b) { return ('0' + (b & 0xFF).toString(16)).slice(-2); }).join('');
}

function login(username, password) {
  const ss = getSS();
  const sh = ss.getSheetByName(SH_USER);
  if (!sh) return { ok: false, pesan: 'Sheet "users" belum ada. Jalankan setupAwal() dulu.' };

  const data = sh.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    const u = String(data[i][0]).trim();
    if (!u || u.toLowerCase() !== String(username).trim().toLowerCase()) continue;
    if (String(data[i][4]).toUpperCase() === 'TIDAK') return { ok: false, pesan: 'Akun dinonaktifkan.' };

    const simpan = String(data[i][1]).trim();
    const cocok = (simpan.length === 64)
      ? (simpan === hashPw(password))
      : (simpan === String(password));            // dukung password polos lalu di-upgrade

    if (!cocok) return { ok: false, pesan: 'Password salah.' };

    if (simpan.length !== 64) {                   // upgrade otomatis ke hash
      sh.getRange(i + 1, 2).setNumberFormat('@').setValue(hashPw(password));
    }

    const user = { username: u, nama: data[i][2] || u, role: data[i][3] || 'user' };
    const token = Utilities.getUuid();
    CacheService.getScriptCache().put('sesi_' + token, JSON.stringify(user), SESI_JAM * 3600);
    return { ok: true, token: token, user: user };
  }
  return { ok: false, pesan: 'Username tidak ditemukan.' };
}

function cekSesi(token) {
  const v = CacheService.getScriptCache().get('sesi_' + token);
  if (!v) throw new Error('SESI_HABIS');
  return JSON.parse(v);
}

function logout(token) {
  CacheService.getScriptCache().remove('sesi_' + token);
  return { ok: true };
}

function gantiPassword(token, lama, baru) {
  const user = cekSesi(token);
  const sh = getSS().getSheetByName(SH_USER);
  const data = sh.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]).toLowerCase() !== user.username.toLowerCase()) continue;
    const simpan = String(data[i][1]).trim();
    const cocok = (simpan.length === 64) ? (simpan === hashPw(lama)) : (simpan === String(lama));
    if (!cocok) return { ok: false, pesan: 'Password lama salah.' };
    sh.getRange(i + 1, 2).setNumberFormat('@').setValue(hashPw(baru));
    return { ok: true, pesan: 'Password berhasil diganti.' };
  }
  return { ok: false, pesan: 'User tidak ditemukan.' };
}


/*************** SHEET BULANAN ***************/
/**
 * Ambil / buat sheet "datangoktober" atau "pulangoktober".
 * @param {string} tipe 'datang' | 'pulang'
 * @param {Date}   tgl  tanggal acuan (menentukan bulan)
 */
function sheetBulan(tipe, tgl) {
  const ss = getSS();
  const d = tgl || new Date();
  const namaBulan = BULAN[Number(Utilities.formatDate(d, TZ, 'M')) - 1];
  const nama = String(tipe).toLowerCase() + namaBulan;   // contoh: datangoktober

  let sh = ss.getSheetByName(nama);
  if (sh) return sh;

  // belum ada -> buat baru lengkap dengan kerangkanya
  sh = ss.insertSheet(nama);
  const tahun  = Number(Utilities.formatDate(d, TZ, 'yyyy'));
  const bulanN = Number(Utilities.formatDate(d, TZ, 'M'));
  const jmlHari = new Date(tahun, bulanN, 0).getDate();   // jumlah hari bulan tsb

  // Kolom A: header + tingkatan
  sh.getRange(1, 1).setValue('KELAS');
  for (let i = 0; i < TINGKATAN.length; i++) {
    sh.getRange(i + 2, 1).setValue(TINGKATAN[i]);
  }

  // Baris 1 kolom B..: tanggal 1..jmlHari
  const headerTgl = [];
  for (let t = 1; t <= jmlHari; t++) headerTgl.push(t);
  sh.getRange(1, 2, 1, jmlHari).setValues([headerTgl]);

  // Rapikan tampilan
  sh.getRange(1, 1, 1, jmlHari + 1).setFontWeight('bold')
    .setBackground('#F6C445').setHorizontalAlignment('center');
  sh.getRange('A2:A4').setFontWeight('bold').setBackground('#FFF3D6')
    .setHorizontalAlignment('center');
  sh.getRange(2, 2, 3, jmlHari).setNumberFormat('@').setVerticalAlignment('top')
    .setWrap(true).setFontSize(9);
  sh.setColumnWidth(1, 80);
  for (let c = 2; c <= jmlHari + 1; c++) sh.setColumnWidth(c, 190);
  sh.setFrozenRows(1);
  sh.setFrozenColumns(1);
  sh.setRowHeights(2, 3, 120);

  return sh;
}

function barisTingkatan(tingkatan) {
  const idx = TINGKATAN.indexOf(String(tingkatan).toUpperCase().trim());
  return idx === -1 ? -1 : idx + 2;   // X->2, XI->3, XII->4
}


/*************** PENULISAN ABSENSI ***************/
/**
 * Gabungkan isi sel lama dengan data baru tanpa duplikat NISN.
 * Format: nisn@waktu#nisn@waktu#...
 */
function gabungSel(isiLama, baru) {
  const urut = [];
  const map  = {};

  String(isiLama || '').split('#').forEach(function (p) {
    p = p.trim();
    if (!p) return;
    const bagian = p.split('@');
    const nisn = String(bagian[0] || '').trim();
    if (!nisn) return;
    if (!(nisn in map)) urut.push(nisn);
    map[nisn] = String(bagian[1] || '').trim();
  });

  baru.forEach(function (it) {
    const nisn = String(it.nisn).trim();
    if (!nisn) return;
    if (!(nisn in map)) { urut.push(nisn); map[nisn] = String(it.waktu).trim(); }
    // kalau NISN sudah ada, waktu pertama dipertahankan (anti dobel scan)
  });

  return urut.map(function (n) { return n + '@' + map[n]; }).join('#');
}

/**
 * Kirim batch absensi dari client.
 * @param {string} token
 * @param {string} tipe  'datang' | 'pulang'
 * @param {Array}  items [{nisn, nama, tingkatan, waktu:'07:12', tanggal:'2026-10-06'}, ...]
 */
function submitAbsensi(token, tipe, items) {
  cekSesi(token);
  tipe = String(tipe).toLowerCase();
  if (tipe !== 'datang' && tipe !== 'pulang') return { ok: false, pesan: 'Tipe tidak valid.' };
  if (!items || !items.length) return { ok: true, tersimpan: 0, idOk: [] };

  const lock = LockService.getScriptLock();
  try { lock.waitLock(30000); }
  catch (e) { return { ok: false, pesan: 'Server sibuk, coba lagi.' }; }

  try {
    // Kelompokkan: tanggal -> tingkatan -> daftar
    const grup = {};
    items.forEach(function (it) {
      const tgl = String(it.tanggal);                       // yyyy-MM-dd
      const tk  = String(it.tingkatan).toUpperCase().trim();
      if (barisTingkatan(tk) === -1) return;
      grup[tgl] = grup[tgl] || {};
      grup[tgl][tk] = grup[tgl][tk] || [];
      grup[tgl][tk].push(it);
    });

    let tersimpan = 0;
    const idOk = [];
    const barisLog = [];

    Object.keys(grup).forEach(function (tgl) {
      const bagian = tgl.split('-');
      const dObj = new Date(Number(bagian[0]), Number(bagian[1]) - 1, Number(bagian[2]));
      const sh = sheetBulan(tipe, dObj);
      const kolom = Number(bagian[2]) + 1;                  // tanggal 1 -> kolom B (2)

      // pastikan kolom header tanggal tersedia
      if (sh.getMaxColumns() < kolom) sh.insertColumnsAfter(sh.getMaxColumns(), kolom - sh.getMaxColumns());
      if (!sh.getRange(1, kolom).getValue()) sh.getRange(1, kolom).setValue(Number(bagian[2]));

      Object.keys(grup[tgl]).forEach(function (tk) {
        const baris = barisTingkatan(tk);
        const sel = sh.getRange(baris, kolom);
        const hasil = gabungSel(sel.getDisplayValue(), grup[tgl][tk]);
        sel.setNumberFormat('@').setValue(hasil);

        grup[tgl][tk].forEach(function (it) {
          tersimpan++;
          idOk.push(it.id || (tipe + '|' + it.nisn));
          barisLog.push([new Date(), tipe, tgl, "'" + it.nisn, it.nama || '', tk, it.waktu]);
        });
      });
    });

    // catat ke sheet log (jejak audit)
    if (barisLog.length) {
      const shL = getSS().getSheetByName(SH_LOG);
      if (shL) shL.getRange(shL.getLastRow() + 1, 1, barisLog.length, 7).setValues(barisLog);
    }

    SpreadsheetApp.flush();
    return { ok: true, tersimpan: tersimpan, idOk: idOk };

  } catch (err) {
    return { ok: false, pesan: String(err) };
  } finally {
    lock.releaseLock();
  }
}


/*************** DATA SISWA ***************/
function getSiswa(token) {
  cekSesi(token);
  const sh = getSS().getSheetByName(SH_SISWA);
  if (!sh || sh.getLastRow() < 2) return [];

  const data = sh.getRange(2, 1, sh.getLastRow() - 1, 6).getDisplayValues();
  const hasil = [];
  data.forEach(function (r) {
    const nisn = String(r[0]).trim();
    if (!nisn) return;
    let desc = null;
    if (r[4]) {
      try {
        const arr = JSON.parse(r[4]);
        if (Array.isArray(arr) && arr.length === 128) desc = arr;
      } catch (e) {}
    }
    hasil.push({
      nisn: nisn,
      nama: String(r[1]).trim(),
      kelas: String(r[2]).trim(),
      tingkatan: String(r[3]).toUpperCase().trim(),
      descriptor: desc
    });
  });
  return hasil;
}

function simpanSiswa(token, siswa) {
  cekSesi(token);
  const sh = getSS().getSheetByName(SH_SISWA);
  const nisn = String(siswa.nisn).trim();
  if (!nisn) return { ok: false, pesan: 'NISN wajib diisi.' };

  const kol = sh.getLastRow() > 1 ? sh.getRange(2, 1, sh.getLastRow() - 1, 1).getDisplayValues() : [];
  let baris = -1;
  for (let i = 0; i < kol.length; i++) {
    if (String(kol[i][0]).trim() === nisn) { baris = i + 2; break; }
  }
  if (baris === -1) baris = sh.getLastRow() + 1;

  sh.getRange(baris, 1).setNumberFormat('@').setValue(nisn);
  sh.getRange(baris, 2).setValue(siswa.nama || '');
  sh.getRange(baris, 3).setValue(siswa.kelas || '');
  sh.getRange(baris, 4).setValue(String(siswa.tingkatan || '').toUpperCase());
  if (siswa.descriptor && siswa.descriptor.length === 128) {
    sh.getRange(baris, 5).setValue(JSON.stringify(siswa.descriptor.map(function (v) {
      return Math.round(v * 100000) / 100000;
    })));
    sh.getRange(baris, 6).setValue(Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH:mm'));
  }
  return { ok: true, pesan: 'Data siswa tersimpan.' };
}

function hapusSiswa(token, nisn) {
  cekSesi(token);
  const sh = getSS().getSheetByName(SH_SISWA);
  const kol = sh.getRange(2, 1, Math.max(sh.getLastRow() - 1, 1), 1).getDisplayValues();
  for (let i = 0; i < kol.length; i++) {
    if (String(kol[i][0]).trim() === String(nisn).trim()) {
      sh.deleteRow(i + 2);
      return { ok: true, pesan: 'Siswa dihapus.' };
    }
  }
  return { ok: false, pesan: 'NISN tidak ditemukan.' };
}


/*************** REKAP / DASHBOARD ***************/
/**
 * Ambil isi sheet bulan tertentu untuk ditampilkan di dashboard.
 * @param {string} bulanKey format 'yyyy-MM' (opsional, default bulan ini)
 */
function getRekap(token, tipe, bulanKey) {
  cekSesi(token);
  let d = new Date();
  if (bulanKey) {
    const p = String(bulanKey).split('-');
    d = new Date(Number(p[0]), Number(p[1]) - 1, 1);
  }
  const nama = String(tipe).toLowerCase() + BULAN[d.getMonth()];
  const sh = getSS().getSheetByName(nama);
  if (!sh) return { sheet: nama, header: [], baris: [] };

  const lastCol = sh.getLastColumn();
  const header = sh.getRange(1, 2, 1, Math.max(lastCol - 1, 1)).getDisplayValues()[0];
  const isi = sh.getRange(2, 1, 3, Math.max(lastCol, 1)).getDisplayValues();

  const baris = isi.map(function (r) {
    return {
      tingkatan: r[0],
      jumlah: r.slice(1).map(function (sel) {
        if (!sel) return 0;
        return sel.split('#').filter(function (x) { return x.trim(); }).length;
      }),
      isi: r.slice(1)
    };
  });
  return { sheet: nama, header: header, baris: baris };
}

function getStatistik(token) {
  cekSesi(token);
  const hari = Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd');
  const tglKe = Number(Utilities.formatDate(new Date(), TZ, 'd'));
  const out = { tanggal: hari, totalSiswa: 0, datang: 0, pulang: 0, perTingkatan: {} };

  const shS = getSS().getSheetByName(SH_SISWA);
  if (shS && shS.getLastRow() > 1) out.totalSiswa = shS.getLastRow() - 1;

  ['datang', 'pulang'].forEach(function (tipe) {
    const sh = getSS().getSheetByName(tipe + BULAN[new Date().getMonth()]);
    if (!sh) return;
    const kolom = tglKe + 1;
    if (kolom > sh.getLastColumn()) return;
    const sel = sh.getRange(2, kolom, 3, 1).getDisplayValues();
    let total = 0;
    TINGKATAN.forEach(function (tk, i) {
      const n = sel[i][0] ? sel[i][0].split('#').filter(function (x) { return x.trim(); }).length : 0;
      total += n;
      out.perTingkatan[tipe + '_' + tk] = n;
    });
    out[tipe] = total;
  });

  return out;
}

function jamServer() {
  return {
    tanggal: Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd'),
    jam: Utilities.formatDate(new Date(), TZ, 'HH:mm:ss'),
    bulan: BULAN[new Date().getMonth()]
  };
}

/** Dipanggil trigger harian (opsional) agar sheet bulan baru sudah siap. */
function siapkanSheetBulanIni() {
  sheetBulan('datang', new Date());
  sheetBulan('pulang', new Date());
}
