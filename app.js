/**
 * app.js
 * Logika aplikasi Buku Pengawas. Semua data disimpan di localStorage
 * sehingga aplikasi dapat berjalan penuh sebagai situs statis (GitHub Pages).
 */

const STORAGE_KEY = "buku_pengawas_state_v1";
const ROLE_KEY = "buku_pengawas_role_v1";

/* ------------------------------------------------------------------ */
/* State                                                               */
/* ------------------------------------------------------------------ */

function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw) {
    try { return JSON.parse(raw); } catch (e) { /* fall through to seed */ }
  }
  const seeded = {
    sekolah: SEED_SEKOLAH.slice(),
    laporan: SEED_LAPORAN.slice()
  };
  saveState(seeded);
  return seeded;
}

function saveState(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

let state = loadState();

let session = JSON.parse(localStorage.getItem(ROLE_KEY) || "null") || {
  role: "pengawas",
  sekolahId: (SEED_SEKOLAH[0] && SEED_SEKOLAH[0].id) || null
};

function saveSession() {
  localStorage.setItem(ROLE_KEY, JSON.stringify(session));
}

let currentView = "dashboard";
let activeFilters = { search: "", sekolah: "", kategori: "", status: "" };

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function findSekolah(id) {
  return state.sekolah.find(s => s.id === id);
}

function fmtDate(iso) {
  if (!iso) return "-";
  const d = new Date(iso);
  return d.toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
}

function fmtDateTime(iso) {
  if (!iso) return "-";
  const d = new Date(iso);
  return d.toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" }) +
    ", " + d.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
}

function fmtPeriode(p) {
  if (!p) return "-";
  const [y, m] = p.split("-");
  const bulan = ["Jan","Feb","Mar","Apr","Mei","Jun","Jul","Agu","Sep","Okt","Nov","Des"];
  return `${bulan[parseInt(m,10)-1]} ${y}`;
}

function nextReportId() {
  const n = state.laporan.length + 1;
  return "LAP-" + String(n).padStart(4, "0");
}

function nextSekolahId() {
  const n = state.sekolah.length + 1;
  return "SKL-" + String(n).padStart(3, "0");
}

function statusBadge(statusKey) {
  return `<span class="badge st-${statusKey}">${STATUS_LAPORAN[statusKey]}</span>`;
}

function showToast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => { t.hidden = true; }, 2600);
}

function laporanForSekolahBinaanPengawas() {
  // In this single-supervisor demo, pengawas sees all sekolah / laporan.
  return state.laporan.slice().sort((a, b) => new Date(b.tanggalKirim) - new Date(a.tanggalKirim));
}

/* ------------------------------------------------------------------ */
/* Stamp (signature SVG element)                                       */
/* ------------------------------------------------------------------ */

function stampSVG(dateStr) {
  const uid = "stamppath" + Math.random().toString(36).slice(2, 8);
  return `
  <svg width="86" height="86" viewBox="0 0 86 86" style="transform:rotate(-8deg)">
    <defs>
      <path id="${uid}" d="M 43,43 m -30,0 a 30,30 0 1,1 60,0 a 30,30 0 1,1 -60,0" />
    </defs>
    <circle cx="43" cy="43" r="40" fill="none" stroke="var(--color-green)" stroke-width="1.4"/>
    <circle cx="43" cy="43" r="34" fill="none" stroke="var(--color-green)" stroke-width="1"/>
    <text font-family="JetBrains Mono, monospace" font-size="6.6" fill="var(--color-green)" letter-spacing="1.5">
      <textPath href="#${uid}" startOffset="0%">DIVERIFIKASI • PENGAWAS SEKOLAH •</textPath>
    </text>
    <text x="43" y="40" text-anchor="middle" font-family="Source Serif 4, serif" font-weight="700" font-size="11" fill="var(--color-green)">DISETUJUI</text>
    <text x="43" y="52" text-anchor="middle" font-family="JetBrains Mono, monospace" font-size="7" fill="var(--color-green)">${dateStr}</text>
  </svg>`;
}

/* ------------------------------------------------------------------ */
/* Navigation / view switching                                         */
/* ------------------------------------------------------------------ */

const VIEW_META = {
  dashboard: { eyebrow: "Ringkasan", title: "Ikhtisar pengawasan" },
  laporan:   { eyebrow: "Arsip", title: "Daftar laporan sekolah" },
  kirim:     { eyebrow: "Formulir", title: "Kirim laporan ke pengawas" },
  sekolah:   { eyebrow: "Data induk", title: "Sekolah binaan" }
};

function setView(view) {
  currentView = view;
  document.querySelectorAll(".view").forEach(el => el.hidden = true);
  document.getElementById("view-" + view).hidden = false;
  document.querySelectorAll(".nav-item").forEach(btn => {
    btn.classList.toggle("is-active", btn.dataset.view === view);
  });
  document.getElementById("topbarEyebrow").textContent = VIEW_META[view].eyebrow;
  document.getElementById("topbarTitle").textContent = VIEW_META[view].title;
  renderCurrentView();
}

function renderCurrentView() {
  if (currentView === "dashboard") renderDashboard();
  if (currentView === "laporan") renderLaporanList();
  if (currentView === "kirim") renderKirimForm();
  if (currentView === "sekolah") renderSekolahView();
}

/* ------------------------------------------------------------------ */
/* Role handling                                                       */
/* ------------------------------------------------------------------ */

function applyRoleUI() {
  document.querySelectorAll(".seg-btn").forEach(b => b.classList.toggle("is-active", b.dataset.role === session.role));
  document.getElementById("sekolahLoginWrap").hidden = session.role !== "sekolah";

  const navDashboard = document.querySelector('.nav-item[data-view="dashboard"]');
  const navSekolahMgmt = document.querySelector('.nav-item[data-view="sekolah"]');

  if (session.role === "sekolah") {
    // Sekolah role: focus on sending + own history, hide supervisor-only management.
    navDashboard.hidden = true;
    navSekolahMgmt.hidden = true;
    if (currentView === "dashboard" || currentView === "sekolah") setView("kirim");
  } else {
    navDashboard.hidden = false;
    navSekolahMgmt.hidden = false;
  }
  renderCurrentView();
}

function populateSekolahLoginSelect() {
  const sel = document.getElementById("sekolahLoginSelect");
  sel.innerHTML = state.sekolah.map(s => `<option value="${s.id}">${s.nama}</option>`).join("");
  if (session.sekolahId) sel.value = session.sekolahId;
}

/* ------------------------------------------------------------------ */
/* DASHBOARD                                                            */
/* ------------------------------------------------------------------ */

function renderDashboard() {
  const all = state.laporan;
  const counts = { MENUNGGU: 0, DITINJAU: 0, DISETUJUI: 0, TINDAK_LANJUT: 0 };
  all.forEach(l => counts[l.status]++);

  document.getElementById("statGrid").innerHTML = `
    <div class="stat-card">
      <div class="num">${all.length}</div>
      <div class="lbl">Total laporan diterima</div>
    </div>
    <div class="stat-card accent-gold">
      <div class="num">${counts.MENUNGGU}</div>
      <div class="lbl">Menunggu tinjauan</div>
    </div>
    <div class="stat-card accent-red">
      <div class="num">${counts.TINDAK_LANJUT}</div>
      <div class="lbl">Perlu tindak lanjut</div>
    </div>
    <div class="stat-card accent-green">
      <div class="num">${counts.DISETUJUI}</div>
      <div class="lbl">Disetujui / selesai</div>
    </div>
  `;

  const recent = laporanForSekolahBinaanPengawas().slice(0, 5);
  document.getElementById("recentList").innerHTML = recent.length
    ? recent.map((l, i) => ledgerRowHTML(l, i)).join("")
    : `<p class="empty-state">Belum ada laporan masuk.</p>`;
  attachLedgerHandlers("recentList");

  document.getElementById("schoolSummary").innerHTML = state.sekolah.map(s => {
    const jumlah = state.laporan.filter(l => l.sekolahId === s.id).length;
    return `
      <div class="school-mini">
        <p class="nm">${s.nama}</p>
        <p class="np">NPSN ${s.npsn} &middot; ${s.jenjang}</p>
        <p class="ct">${jumlah} laporan terkirim</p>
      </div>`;
  }).join("") || `<p class="empty-state">Belum ada sekolah binaan.</p>`;
}

/* ------------------------------------------------------------------ */
/* LEDGER (shared row renderer)                                        */
/* ------------------------------------------------------------------ */

function ledgerRowHTML(l, idx) {
  const sekolah = findSekolah(l.sekolahId);
  return `
    <div class="ledger-row" data-id="${l.id}">
      <div class="ledger-num">${String(idx + 1).padStart(2, "0")}</div>
      <div class="ledger-main">
        <div class="title">${escapeHTML(l.judul)}</div>
        <div class="meta">${sekolah ? escapeHTML(sekolah.nama) : "Sekolah tidak ditemukan"} &middot; ${l.kategori} &middot; ${fmtPeriode(l.periode)}</div>
      </div>
      <div class="ledger-date">${fmtDate(l.tanggalKirim)}</div>
      ${statusBadge(l.status)}
    </div>`;
}

function attachLedgerHandlers(containerId) {
  document.querySelectorAll(`#${containerId} .ledger-row`).forEach(row => {
    row.addEventListener("click", () => openDetail(row.dataset.id));
  });
}

function escapeHTML(str) {
  const div = document.createElement("div");
  div.textContent = str == null ? "" : str;
  return div.innerHTML;
}

/* ------------------------------------------------------------------ */
/* VIEW: DAFTAR LAPORAN (with filters)                                 */
/* ------------------------------------------------------------------ */

function populateFilterOptions() {
  const selSekolah = document.getElementById("filterSekolah");
  selSekolah.innerHTML = `<option value="">Semua sekolah</option>` +
    state.sekolah.map(s => `<option value="${s.id}">${s.nama}</option>`).join("");

  const selKategori = document.getElementById("filterKategori");
  selKategori.innerHTML = `<option value="">Semua kategori</option>` +
    KATEGORI_LAPORAN.map(k => `<option value="${k}">${k}</option>`).join("");

  const selStatus = document.getElementById("filterStatus");
  selStatus.innerHTML = `<option value="">Semua status</option>` +
    Object.keys(STATUS_LAPORAN).map(k => `<option value="${k}">${STATUS_LAPORAN[k]}</option>`).join("");
}

function renderLaporanList() {
  populateFilterOptions();
  document.getElementById("filterSekolah").value = activeFilters.sekolah;
  document.getElementById("filterKategori").value = activeFilters.kategori;
  document.getElementById("filterStatus").value = activeFilters.status;
  document.getElementById("filterSearch").value = activeFilters.search;

  const filtered = applyFilters(laporanForSekolahBinaanPengawas());
  const listEl = document.getElementById("fullList");
  const emptyEl = document.getElementById("emptyState");

  if (!filtered.length) {
    listEl.innerHTML = "";
    emptyEl.hidden = false;
  } else {
    emptyEl.hidden = true;
    listEl.innerHTML = filtered.map((l, i) => ledgerRowHTML(l, i)).join("");
    attachLedgerHandlers("fullList");
  }
}

function applyFilters(list) {
  return list.filter(l => {
    if (activeFilters.sekolah && l.sekolahId !== activeFilters.sekolah) return false;
    if (activeFilters.kategori && l.kategori !== activeFilters.kategori) return false;
    if (activeFilters.status && l.status !== activeFilters.status) return false;
    if (activeFilters.search) {
      const hay = (l.judul + " " + l.isi).toLowerCase();
      if (!hay.includes(activeFilters.search.toLowerCase())) return false;
    }
    return true;
  });
}

/* ------------------------------------------------------------------ */
/* VIEW: KIRIM LAPORAN                                                 */
/* ------------------------------------------------------------------ */

let pendingLampiran = null; // {name, dataUrl}

function renderKirimForm() {
  const fSekolah = document.getElementById("fSekolah");
  fSekolah.innerHTML = state.sekolah.map(s => `<option value="${s.id}">${s.nama}</option>`).join("");
  if (session.role === "sekolah" && session.sekolahId) fSekolah.value = session.sekolahId;

  const fKategori = document.getElementById("fKategori");
  fKategori.innerHTML = KATEGORI_LAPORAN.map(k => `<option value="${k}">${k}</option>`).join("");

  const now = new Date();
  document.getElementById("fPeriode").value = now.toISOString().slice(0, 7);
  document.getElementById("formStatus").textContent = "";
}

document.getElementById("fLampiran").addEventListener("change", (e) => {
  const file = e.target.files[0];
  const nameEl = document.getElementById("lampiranPreviewName");
  if (!file) { pendingLampiran = null; nameEl.textContent = ""; return; }
  const reader = new FileReader();
  reader.onload = () => {
    pendingLampiran = { name: file.name, dataUrl: reader.result };
    nameEl.textContent = "Terlampir: " + file.name;
  };
  reader.readAsDataURL(file);
});

document.getElementById("laporanForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const newLaporan = {
    id: nextReportId(),
    sekolahId: document.getElementById("fSekolah").value,
    kategori: document.getElementById("fKategori").value,
    periode: document.getElementById("fPeriode").value,
    judul: document.getElementById("fJudul").value.trim(),
    isi: document.getElementById("fIsi").value.trim(),
    lampiranNama: pendingLampiran ? pendingLampiran.name : null,
    lampiranData: pendingLampiran ? pendingLampiran.dataUrl : null,
    tanggalKirim: new Date().toISOString(),
    status: "MENUNGGU",
    catatanPengawas: "",
    tanggalTinjau: null
  };
  state.laporan.unshift(newLaporan);
  saveState(state);

  e.target.reset();
  pendingLampiran = null;
  document.getElementById("lampiranPreviewName").textContent = "";
  renderKirimForm();
  document.getElementById("formStatus").textContent = "Laporan berhasil dikirim ke pengawas.";
  showToast("Laporan \"" + newLaporan.judul + "\" berhasil dikirim");
});

/* ------------------------------------------------------------------ */
/* VIEW: SEKOLAH BINAAN                                                */
/* ------------------------------------------------------------------ */

function renderSekolahView() {
  const rows = state.sekolah.map(s => `
    <div class="school-row">
      <div><div class="nm">${escapeHTML(s.nama)}</div><div class="np">NPSN ${escapeHTML(s.npsn)}</div></div>
      <div>${escapeHTML(s.jenjang)}</div>
      <div>${escapeHTML(s.kepalaSekolah)}</div>
      <div>${escapeHTML(s.pengawas)}</div>
      <div>${state.laporan.filter(l => l.sekolahId === s.id).length} laporan</div>
    </div>`).join("");

  document.getElementById("schoolTable").innerHTML = `
    <div class="school-row school-row-head">
      <div>Sekolah</div><div>Jenjang</div><div>Kepala sekolah</div><div>Pengawas</div><div>Aktivitas</div>
    </div>` + (rows || `<p class="empty-state">Belum ada sekolah binaan.</p>`);
}

document.getElementById("sekolahForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const s = {
    id: nextSekolahId(),
    nama: document.getElementById("sNama").value.trim(),
    npsn: document.getElementById("sNpsn").value.trim(),
    jenjang: document.getElementById("sJenjang").value,
    kepalaSekolah: document.getElementById("sKepsek").value.trim(),
    pengawas: document.getElementById("sPengawas").value.trim(),
    alamat: document.getElementById("sAlamat").value.trim()
  };
  state.sekolah.push(s);
  saveState(state);
  e.target.reset();
  renderSekolahView();
  showToast("Sekolah \"" + s.nama + "\" ditambahkan");
});

/* ------------------------------------------------------------------ */
/* DETAIL / REVIEW MODAL                                               */
/* ------------------------------------------------------------------ */

function openDetail(id) {
  const l = state.laporan.find(x => x.id === id);
  if (!l) return;
  const sekolah = findSekolah(l.sekolahId);

  const canReview = session.role === "pengawas";

  let bodyHTML = `
    <p class="modal-eyebrow">${l.id} &middot; ${l.kategori}</p>
    <h3>${escapeHTML(l.judul)}</h3>
    <div class="modal-meta">
      <span>${sekolah ? escapeHTML(sekolah.nama) : "Sekolah tidak diketahui"}</span>
      <span>Periode ${fmtPeriode(l.periode)}</span>
      <span>Dikirim ${fmtDateTime(l.tanggalKirim)}</span>
      ${statusBadge(l.status)}
    </div>
    <div class="modal-body-text">${escapeHTML(l.isi)}</div>
    ${l.lampiranData ? `<div class="modal-attach"><img src="${l.lampiranData}" alt="Lampiran laporan"></div>` : ""}
  `;

  if (l.status === "DISETUJUI") {
    bodyHTML += `
      <div class="stamp-wrap">
        ${stampSVG(fmtDate(l.tanggalTinjau))}
        <div class="stamp-caption"><b>Telah diverifikasi</b>Laporan ini telah ditinjau dan disetujui oleh pengawas pembina.</div>
      </div>`;
  }

  bodyHTML += `<div class="modal-divider"></div>`;

  if (canReview) {
    bodyHTML += `
      <div class="review-block">
        <p class="panel-desc" style="margin-bottom:10px;">Tinjauan pengawas</p>
        <select class="status-select" id="reviewStatus">
          ${Object.keys(STATUS_LAPORAN).map(k => `<option value="${k}" ${k === l.status ? "selected" : ""}>${STATUS_LAPORAN[k]}</option>`).join("")}
        </select>
        <textarea id="reviewCatatan" rows="3" placeholder="Tulis catatan atau arahan tindak lanjut untuk sekolah...">${escapeHTML(l.catatanPengawas)}</textarea>
        <div class="form-actions" style="margin-top:12px;">
          <button class="btn-primary" id="saveReviewBtn" type="button">Simpan tinjauan</button>
        </div>
      </div>`;
  } else if (l.catatanPengawas) {
    bodyHTML += `
      <div class="review-existing">
        <b>Catatan pengawas:</b><br>${escapeHTML(l.catatanPengawas)}
      </div>`;
  }

  document.getElementById("modalBody").innerHTML = bodyHTML;
  document.getElementById("modalBackdrop").hidden = false;

  if (canReview) {
    document.getElementById("saveReviewBtn").addEventListener("click", () => {
      l.status = document.getElementById("reviewStatus").value;
      l.catatanPengawas = document.getElementById("reviewCatatan").value.trim();
      l.tanggalTinjau = new Date().toISOString();
      saveState(state);
      closeModal();
      renderCurrentView();
      showToast("Tinjauan untuk \"" + l.judul + "\" tersimpan");
    });
  }
}

function closeModal() {
  document.getElementById("modalBackdrop").hidden = true;
  document.getElementById("modalBody").innerHTML = "";
}

document.getElementById("modalClose").addEventListener("click", closeModal);
document.getElementById("modalBackdrop").addEventListener("click", (e) => {
  if (e.target.id === "modalBackdrop") closeModal();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeModal();
});

/* ------------------------------------------------------------------ */
/* Wiring: nav, role switch, filters                                   */
/* ------------------------------------------------------------------ */

document.querySelectorAll(".nav-item").forEach(btn => {
  btn.addEventListener("click", () => setView(btn.dataset.view));
});
document.querySelectorAll("[data-view].link-btn").forEach(btn => {
  btn.addEventListener("click", () => setView(btn.dataset.view));
});

document.getElementById("roleSegmented").addEventListener("click", (e) => {
  const btn = e.target.closest(".seg-btn");
  if (!btn) return;
  session.role = btn.dataset.role;
  saveSession();
  applyRoleUI();
});

document.getElementById("sekolahLoginSelect").addEventListener("change", (e) => {
  session.sekolahId = e.target.value;
  saveSession();
  renderCurrentView();
});

["filterSearch", "filterSekolah", "filterKategori", "filterStatus"].forEach(id => {
  const el = document.getElementById(id);
  const ev = id === "filterSearch" ? "input" : "change";
  el.addEventListener(ev, () => {
    activeFilters.search = document.getElementById("filterSearch").value;
    activeFilters.sekolah = document.getElementById("filterSekolah").value;
    activeFilters.kategori = document.getElementById("filterKategori").value;
    activeFilters.status = document.getElementById("filterStatus").value;
    renderLaporanList();
  });
});

/* ------------------------------------------------------------------ */
/* Init                                                                 */
/* ------------------------------------------------------------------ */

function init() {
  document.getElementById("topbarDate").textContent = new Date().toLocaleDateString("id-ID", {
    weekday: "long", day: "2-digit", month: "long", year: "numeric"
  });
  populateSekolahLoginSelect();
  applyRoleUI();
  setView(session.role === "sekolah" ? "kirim" : "dashboard");
}

init();
