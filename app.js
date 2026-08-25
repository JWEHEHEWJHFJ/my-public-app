/**
 * app.js — Buku Pengawas
 *
 * Dua mode penyimpanan data:
 *  - MODE "github": laporan disimpan sebagai GitHub Issues, data sekolah
 *    disimpan sebagai berkas sekolah.json di repository (lewat GitHub API).
 *    Ini membuat data benar-benar dapat diakses bersama oleh pihak sekolah
 *    dan pengawas dari perangkat berbeda.
 *  - MODE "demo": fallback memakai localStorage peramban saja (untuk
 *    mencoba aplikasi sebelum menyambungkan ke GitHub).
 *
 * Konfigurasi (owner/repo/branch/token) & peran pengguna disimpan di
 * localStorage MASING-MASING peramban — tidak pernah dikirim ke server lain
 * selain langsung ke api.github.com.
 */

const CONFIG_KEY = "buku_pengawas_gh_config_v1";
const ROLE_KEY = "buku_pengawas_role_v1";
const DEMO_STATE_KEY = "buku_pengawas_demo_state_v1";

/* ------------------------------------------------------------------ */
/* Konfigurasi & sesi                                                  */
/* ------------------------------------------------------------------ */

function loadConfig() {
  const raw = localStorage.getItem(CONFIG_KEY);
  if (raw) {
    try { return JSON.parse(raw); } catch (e) { /* fall through */ }
  }
  return { mode: "demo", owner: "", repo: "", branch: "main", token: "" };
}
let config = loadConfig();
function saveConfig() { localStorage.setItem(CONFIG_KEY, JSON.stringify(config)); }
function isGithubMode() { return config.mode === "github" && config.owner && config.repo; }

let session = JSON.parse(localStorage.getItem(ROLE_KEY) || "null") || { role: "pengawas", sekolahId: null };
function saveSession() { localStorage.setItem(ROLE_KEY, JSON.stringify(session)); }

/* Demo-mode local state (fallback only) */
function loadDemoState() {
  const raw = localStorage.getItem(DEMO_STATE_KEY);
  if (raw) { try { return JSON.parse(raw); } catch (e) { /* fall through */ } }
  const seeded = { sekolah: SEED_SEKOLAH.slice(), laporan: SEED_LAPORAN.slice() };
  localStorage.setItem(DEMO_STATE_KEY, JSON.stringify(seeded));
  return seeded;
}
let demoState = loadDemoState();
function saveDemoState() { localStorage.setItem(DEMO_STATE_KEY, JSON.stringify(demoState)); }

let currentView = "dashboard";
let activeFilters = { search: "", sekolah: "", kategori: "", status: "" };
let cachedSekolah = [];
let cachedLaporan = [];
let sekolahSha = null;
let dataLoading = false;

/* ------------------------------------------------------------------ */
/* GitHub API helpers                                                  */
/* ------------------------------------------------------------------ */

function ghApiBase() { return `https://api.github.com/repos/${config.owner}/${config.repo}`; }

function ghHeaders(hasBody) {
  const h = { "Accept": "application/vnd.github+json" };
  if (hasBody) h["Content-Type"] = "application/json";
  if (config.token) h["Authorization"] = "Bearer " + config.token;
  return h;
}

async function ghFetch(url, opts = {}) {
  const res = await fetch(url, { ...opts, headers: { ...ghHeaders(!!opts.body), ...(opts.headers || {}) } });
  if (!res.ok) {
    let msg = res.status + " " + res.statusText;
    try { const j = await res.json(); if (j.message) msg = j.message; } catch (e) { /* ignore */ }
    if (res.status === 401 || res.status === 403) {
      msg += " — periksa token Anda di Pengaturan GitHub (butuh izin Issues & Contents: Read and write).";
    }
    throw new Error(msg);
  }
  if (res.status === 204) return null;
  return res.json();
}

function b64DecodeUnicode(str) {
  return decodeURIComponent(
    atob(str).split("").map(c => "%" + c.charCodeAt(0).toString(16).padStart(2, "0")).join("")
  );
}
function b64EncodeUnicode(str) {
  return btoa(encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, (m, p1) => String.fromCharCode("0x" + p1)));
}
function slugify(str) {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 40);
}

/* ---- Sekolah: berkas sekolah.json lewat Contents API ---- */

async function fetchSekolahGithub() {
  const url = `${ghApiBase()}/contents/${SEKOLAH_JSON_PATH}?ref=${encodeURIComponent(config.branch)}`;
  try {
    const data = await ghFetch(url);
    const decoded = b64DecodeUnicode(data.content.replace(/\n/g, ""));
    let arr = [];
    try { arr = JSON.parse(decoded); } catch (e) { /* keep empty */ }
    return { list: Array.isArray(arr) ? arr : [], sha: data.sha };
  } catch (e) {
    if (String(e.message).toLowerCase().includes("not found")) return { list: [], sha: null };
    throw e;
  }
}

async function writeSekolahGithub(list, sha) {
  const url = `${ghApiBase()}/contents/${SEKOLAH_JSON_PATH}`;
  const body = {
    message: "Perbarui data sekolah binaan",
    content: b64EncodeUnicode(JSON.stringify(list, null, 2)),
    branch: config.branch
  };
  if (sha) body.sha = sha;
  const res = await ghFetch(url, { method: "PUT", body: JSON.stringify(body) });
  return res.content ? res.content.sha : null;
}

async function uploadLampiranGithub(lampiran) {
  const path = `lampiran/${Date.now()}-${slugify(lampiran.name || "foto")}`;
  const base64 = lampiran.dataUrl.split(",")[1];
  const url = `${ghApiBase()}/contents/${path}`;
  await ghFetch(url, {
    method: "PUT",
    body: JSON.stringify({ message: "Unggah lampiran laporan", content: base64, branch: config.branch })
  });
  return `https://raw.githubusercontent.com/${config.owner}/${config.repo}/${config.branch}/${path}`;
}

/* ---- Laporan: GitHub Issues API ---- */

function buildIssueBody({ sekolahNama, sekolahId, kategori, periode, isi, lampiranUrl, catatanPengawas }) {
  let body = `**Sekolah:** ${sekolahNama} (${sekolahId})\n`;
  body += `**Kategori:** ${kategori}\n`;
  body += `**Periode:** ${periode}\n\n---\n\n`;
  body += (isi || "").trim() + "\n";
  if (lampiranUrl) body += `\n![Lampiran](${lampiranUrl})\n`;
  body += `\n---\n**Catatan Pengawas:**\n${catatanPengawas && catatanPengawas.trim() ? catatanPengawas.trim() : "_Belum ada catatan._"}\n`;
  return body;
}

function parseIssueBody(rawBody) {
  const body = rawBody || "";
  const sekolahMatch = body.match(/\*\*Sekolah:\*\*\s*(.+?)\s*\(([^)]+)\)/);
  const kategoriMatch = body.match(/\*\*Kategori:\*\*\s*(.+)/);
  const periodeMatch = body.match(/\*\*Periode:\*\*\s*(\S+)/);
  const lampiranMatch = body.match(/!\[Lampiran\]\(([^)]+)\)/);
  const catatanMatch = body.match(/\*\*Catatan Pengawas:\*\*\s*\n?([\s\S]*)$/);

  const parts = body.split(/\n---\n/);
  let isi = "";
  if (parts.length >= 2) isi = parts[1].replace(/!\[Lampiran\]\([^)]+\)/, "").trim();

  let catatan = catatanMatch ? catatanMatch[1].trim() : "";
  if (catatan === "_Belum ada catatan._") catatan = "";

  return {
    sekolahNama: sekolahMatch ? sekolahMatch[1].trim() : "",
    sekolahId: sekolahMatch ? sekolahMatch[2].trim() : "",
    kategori: kategoriMatch ? kategoriMatch[1].trim() : "",
    periode: periodeMatch ? periodeMatch[1].trim() : "",
    isi,
    lampiranUrl: lampiranMatch ? lampiranMatch[1] : null,
    catatanPengawas: catatan
  };
}

function issueToLaporan(issue) {
  const parsed = parseIssueBody(issue.body);
  const labelNames = (issue.labels || []).map(l => (typeof l === "string" ? l : l.name));
  const sekolahLabel = labelNames.find(l => l.startsWith(LABEL_SEKOLAH_PREFIX));
  const kategoriLabel = labelNames.find(l => l.startsWith(LABEL_KATEGORI_PREFIX));
  const statusLabel = labelNames.find(l => STATUS_LABEL_TO_KEY[l]);
  const status = statusLabel ? STATUS_LABEL_TO_KEY[statusLabel] : "MENUNGGU";

  return {
    id: String(issue.number),
    number: issue.number,
    sekolahId: sekolahLabel ? sekolahLabel.slice(LABEL_SEKOLAH_PREFIX.length) : parsed.sekolahId,
    kategori: kategoriLabel ? kategoriLabel.slice(LABEL_KATEGORI_PREFIX.length) : parsed.kategori,
    periode: parsed.periode,
    judul: issue.title,
    isi: parsed.isi,
    lampiranNama: parsed.lampiranUrl ? "lampiran" : null,
    lampiranData: parsed.lampiranUrl,
    tanggalKirim: issue.created_at,
    status,
    catatanPengawas: parsed.catatanPengawas,
    tanggalTinjau: issue.updated_at && issue.updated_at !== issue.created_at ? issue.updated_at : null,
    htmlUrl: issue.html_url
  };
}

async function fetchLaporanGithub() {
  const url = `${ghApiBase()}/issues?labels=${encodeURIComponent(LABEL_LAPORAN)}&state=all&per_page=100&sort=created&direction=desc`;
  const issues = await ghFetch(url);
  return issues.filter(i => !i.pull_request).map(issueToLaporan);
}

async function createLaporanGithub(input) {
  let lampiranUrl = null;
  if (input.lampiran) lampiranUrl = await uploadLampiranGithub(input.lampiran);

  const body = buildIssueBody({
    sekolahNama: input.sekolahNama, sekolahId: input.sekolahId, kategori: input.kategori,
    periode: input.periode, isi: input.isi, lampiranUrl, catatanPengawas: ""
  });
  const labels = [LABEL_LAPORAN, LABEL_KATEGORI_PREFIX + input.kategori, LABEL_SEKOLAH_PREFIX + input.sekolahId];
  const issue = await ghFetch(`${ghApiBase()}/issues`, {
    method: "POST",
    body: JSON.stringify({ title: input.judul, body, labels })
  });
  return issueToLaporan(issue);
}

async function updateLaporanReviewGithub(laporan, newStatus, catatan) {
  const sekolah = findSekolah(laporan.sekolahId);
  const body = buildIssueBody({
    sekolahNama: sekolah ? sekolah.nama : laporan.sekolahId,
    sekolahId: laporan.sekolahId, kategori: laporan.kategori, periode: laporan.periode,
    isi: laporan.isi, lampiranUrl: laporan.lampiranData, catatanPengawas: catatan
  });
  const labels = [LABEL_LAPORAN, LABEL_KATEGORI_PREFIX + laporan.kategori, LABEL_SEKOLAH_PREFIX + laporan.sekolahId, STATUS_LABEL[newStatus]];
  const state = newStatus === "DISETUJUI" ? "closed" : "open";
  const issue = await ghFetch(`${ghApiBase()}/issues/${laporan.number}`, {
    method: "PATCH",
    body: JSON.stringify({ body, labels, state })
  });
  return issueToLaporan(issue);
}

/* ------------------------------------------------------------------ */
/* Data layer (routes to GitHub or demo/local storage)                 */
/* ------------------------------------------------------------------ */

async function loadAllData() {
  if (isGithubMode()) {
    const [sekolahRes, laporanRes] = await Promise.all([fetchSekolahGithub(), fetchLaporanGithub()]);
    cachedSekolah = sekolahRes.list;
    sekolahSha = sekolahRes.sha;
    cachedLaporan = laporanRes;
  } else {
    cachedSekolah = demoState.sekolah;
    cachedLaporan = demoState.laporan.slice().sort((a, b) => new Date(b.tanggalKirim) - new Date(a.tanggalKirim));
  }
}

async function addSekolah(sekolah) {
  if (isGithubMode()) {
    const fresh = await fetchSekolahGithub();
    fresh.list.push(sekolah);
    const newSha = await writeSekolahGithub(fresh.list, fresh.sha);
    cachedSekolah = fresh.list;
    sekolahSha = newSha;
  } else {
    demoState.sekolah.push(sekolah);
    saveDemoState();
    cachedSekolah = demoState.sekolah;
  }
}

async function submitLaporan(input) {
  if (isGithubMode()) {
    const created = await createLaporanGithub(input);
    cachedLaporan.unshift(created);
    return created;
  } else {
    const newLaporan = {
      id: "LAP-" + String(demoState.laporan.length + 1).padStart(4, "0"),
      sekolahId: input.sekolahId,
      kategori: input.kategori,
      periode: input.periode,
      judul: input.judul,
      isi: input.isi,
      lampiranNama: input.lampiran ? input.lampiran.name : null,
      lampiranData: input.lampiran ? input.lampiran.dataUrl : null,
      tanggalKirim: new Date().toISOString(),
      status: "MENUNGGU",
      catatanPengawas: "",
      tanggalTinjau: null
    };
    demoState.laporan.unshift(newLaporan);
    saveDemoState();
    cachedLaporan = demoState.laporan.slice().sort((a, b) => new Date(b.tanggalKirim) - new Date(a.tanggalKirim));
    return newLaporan;
  }
}

async function saveReview(laporan, newStatus, catatan) {
  if (isGithubMode()) {
    const updated = await updateLaporanReviewGithub(laporan, newStatus, catatan);
    const idx = cachedLaporan.findIndex(l => l.id === laporan.id);
    if (idx >= 0) cachedLaporan[idx] = updated;
    return updated;
  } else {
    const target = demoState.laporan.find(l => l.id === laporan.id);
    target.status = newStatus;
    target.catatanPengawas = catatan;
    target.tanggalTinjau = new Date().toISOString();
    saveDemoState();
    cachedLaporan = demoState.laporan.slice().sort((a, b) => new Date(b.tanggalKirim) - new Date(a.tanggalKirim));
    return target;
  }
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function findSekolah(id) { return cachedSekolah.find(s => s.id === id); }

function fmtDate(iso) {
  if (!iso) return "-";
  return new Date(iso).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
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
  const idx = parseInt(m, 10) - 1;
  return (bulan[idx] || m) + " " + y;
}
function statusBadge(statusKey) {
  return `<span class="badge st-${statusKey}">${STATUS_LAPORAN[statusKey] || statusKey}</span>`;
}
function escapeHTML(str) {
  const div = document.createElement("div");
  div.textContent = str == null ? "" : str;
  return div.innerHTML;
}
function showToast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => { t.hidden = true; }, 2800);
}
function showError(msg) {
  const el = document.getElementById("errorBanner");
  el.textContent = msg;
  el.hidden = !msg;
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
  dashboard:   { eyebrow: "Ringkasan", title: "Ikhtisar pengawasan" },
  laporan:     { eyebrow: "Arsip", title: "Daftar laporan sekolah" },
  kirim:       { eyebrow: "Formulir", title: "Kirim laporan ke pengawas" },
  sekolah:     { eyebrow: "Data induk", title: "Sekolah binaan" },
  pengaturan:  { eyebrow: "Konfigurasi", title: "Pengaturan GitHub" }
};

async function setView(view) {
  currentView = view;
  document.querySelectorAll(".view").forEach(el => el.hidden = true);
  document.getElementById("view-" + view).hidden = false;
  document.querySelectorAll(".nav-item").forEach(btn => btn.classList.toggle("is-active", btn.dataset.view === view));
  document.getElementById("topbarEyebrow").textContent = VIEW_META[view].eyebrow;
  document.getElementById("topbarTitle").textContent = VIEW_META[view].title;

  if (view === "pengaturan") {
    fillConfigForm();
    return;
  }
  await refreshAndRender();
}

async function refreshAndRender() {
  showError("");
  try {
    await loadAllData();
  } catch (e) {
    showError("Gagal memuat data dari GitHub: " + e.message);
  }
  renderCurrentView();
}

function renderCurrentView() {
  if (currentView === "dashboard") renderDashboard();
  if (currentView === "laporan") renderLaporanList();
  if (currentView === "kirim") renderKirimForm();
  if (currentView === "sekolah") renderSekolahView();
}

/* ------------------------------------------------------------------ */
/* Role & connection status UI                                         */
/* ------------------------------------------------------------------ */

function applyRoleUI() {
  document.querySelectorAll(".seg-btn").forEach(b => b.classList.toggle("is-active", b.dataset.role === session.role));
  document.getElementById("sekolahLoginWrap").hidden = session.role !== "sekolah";

  const navDashboard = document.querySelector('.nav-item[data-view="dashboard"]');
  const navSekolahMgmt = document.querySelector('.nav-item[data-view="sekolah"]');

  if (session.role === "sekolah") {
    navDashboard.hidden = true;
    navSekolahMgmt.hidden = true;
    if (currentView === "dashboard" || currentView === "sekolah") { setView("kirim"); return; }
  } else {
    navDashboard.hidden = false;
    navSekolahMgmt.hidden = false;
  }
  renderCurrentView();
}

function populateSekolahLoginSelect() {
  const sel = document.getElementById("sekolahLoginSelect");
  sel.innerHTML = cachedSekolah.map(s => `<option value="${s.id}">${escapeHTML(s.nama)}</option>`).join("");
  if (session.sekolahId) sel.value = session.sekolahId;
}

function updateConnStatus() {
  const el = document.getElementById("connStatus");
  const banner = document.getElementById("setupBanner");
  if (isGithubMode()) {
    el.textContent = `Terhubung: ${config.owner}/${config.repo}`;
    banner.hidden = true;
  } else {
    el.textContent = "Mode demo — data tersimpan lokal di peramban ini.";
    banner.hidden = false;
  }
}

/* ------------------------------------------------------------------ */
/* DASHBOARD                                                            */
/* ------------------------------------------------------------------ */

function renderDashboard() {
  const all = cachedLaporan;
  const counts = { MENUNGGU: 0, DITINJAU: 0, DISETUJUI: 0, TINDAK_LANJUT: 0 };
  all.forEach(l => { if (counts[l.status] !== undefined) counts[l.status]++; });

  document.getElementById("statGrid").innerHTML = `
    <div class="stat-card"><div class="num">${all.length}</div><div class="lbl">Total laporan diterima</div></div>
    <div class="stat-card accent-gold"><div class="num">${counts.MENUNGGU}</div><div class="lbl">Menunggu tinjauan</div></div>
    <div class="stat-card accent-red"><div class="num">${counts.TINDAK_LANJUT}</div><div class="lbl">Perlu tindak lanjut</div></div>
    <div class="stat-card accent-green"><div class="num">${counts.DISETUJUI}</div><div class="lbl">Disetujui / selesai</div></div>
  `;

  const recent = all.slice(0, 5);
  document.getElementById("recentList").innerHTML = recent.length
    ? recent.map((l, i) => ledgerRowHTML(l, i)).join("")
    : `<p class="empty-state">Belum ada laporan masuk.</p>`;
  attachLedgerHandlers("recentList");

  document.getElementById("schoolSummary").innerHTML = cachedSekolah.map(s => {
    const jumlah = cachedLaporan.filter(l => l.sekolahId === s.id).length;
    return `
      <div class="school-mini">
        <p class="nm">${escapeHTML(s.nama)}</p>
        <p class="np">NPSN ${escapeHTML(s.npsn)} &middot; ${escapeHTML(s.jenjang)}</p>
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
        <div class="meta">${sekolah ? escapeHTML(sekolah.nama) : "Sekolah #" + escapeHTML(l.sekolahId)} &middot; ${escapeHTML(l.kategori)} &middot; ${fmtPeriode(l.periode)}</div>
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

/* ------------------------------------------------------------------ */
/* VIEW: DAFTAR LAPORAN (with filters)                                 */
/* ------------------------------------------------------------------ */

function populateFilterOptions() {
  const selSekolah = document.getElementById("filterSekolah");
  selSekolah.innerHTML = `<option value="">Semua sekolah</option>` +
    cachedSekolah.map(s => `<option value="${s.id}">${escapeHTML(s.nama)}</option>`).join("");

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

  const filtered = applyFilters(cachedLaporan);
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

document.getElementById("refreshLaporanBtn").addEventListener("click", refreshAndRender);
document.getElementById("refreshSekolahBtn").addEventListener("click", refreshAndRender);

/* ------------------------------------------------------------------ */
/* VIEW: KIRIM LAPORAN                                                 */
/* ------------------------------------------------------------------ */

let pendingLampiran = null; // {name, dataUrl}

function renderKirimForm() {
  const fSekolah = document.getElementById("fSekolah");
  fSekolah.innerHTML = cachedSekolah.map(s => `<option value="${s.id}">${escapeHTML(s.nama)}</option>`).join("");
  if (session.role === "sekolah" && session.sekolahId) fSekolah.value = session.sekolahId;

  const fKategori = document.getElementById("fKategori");
  fKategori.innerHTML = KATEGORI_LAPORAN.map(k => `<option value="${k}">${k}</option>`).join("");

  document.getElementById("fPeriode").value = new Date().toISOString().slice(0, 7);
  document.getElementById("formStatus").textContent = "";

  if (session.role === "sekolah" && isGithubMode() && !config.token) {
    document.getElementById("formStatus").textContent = "Token GitHub belum diisi — buka Pengaturan GitHub untuk bisa mengirim laporan.";
  }
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

document.getElementById("laporanForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const sekolahId = document.getElementById("fSekolah").value;
  const sekolah = findSekolah(sekolahId);
  if (!sekolah) { showToast("Pilih sekolah terlebih dahulu"); return; }

  const btn = document.getElementById("submitLaporanBtn");
  const statusEl = document.getElementById("formStatus");
  btn.disabled = true;
  statusEl.textContent = isGithubMode() ? "Mengirim ke GitHub..." : "Menyimpan...";

  try {
    const created = await submitLaporan({
      sekolahId, sekolahNama: sekolah.nama,
      kategori: document.getElementById("fKategori").value,
      periode: document.getElementById("fPeriode").value,
      judul: document.getElementById("fJudul").value.trim(),
      isi: document.getElementById("fIsi").value.trim(),
      lampiran: pendingLampiran
    });
    e.target.reset();
    pendingLampiran = null;
    document.getElementById("lampiranPreviewName").textContent = "";
    renderKirimForm();
    statusEl.textContent = "Laporan berhasil dikirim ke pengawas.";
    showToast("Laporan \"" + created.judul + "\" berhasil dikirim");
  } catch (err) {
    statusEl.textContent = "Gagal mengirim: " + err.message;
  } finally {
    btn.disabled = false;
  }
});

/* ------------------------------------------------------------------ */
/* VIEW: SEKOLAH BINAAN                                                */
/* ------------------------------------------------------------------ */

function renderSekolahView() {
  const rows = cachedSekolah.map(s => `
    <div class="school-row">
      <div><div class="nm">${escapeHTML(s.nama)}</div><div class="np">NPSN ${escapeHTML(s.npsn)}</div></div>
      <div>${escapeHTML(s.jenjang)}</div>
      <div>${escapeHTML(s.kepalaSekolah)}</div>
      <div>${escapeHTML(s.pengawas)}</div>
      <div>${cachedLaporan.filter(l => l.sekolahId === s.id).length} laporan</div>
    </div>`).join("");

  document.getElementById("schoolTable").innerHTML = `
    <div class="school-row school-row-head">
      <div>Sekolah</div><div>Jenjang</div><div>Kepala sekolah</div><div>Pengawas</div><div>Aktivitas</div>
    </div>` + (rows || `<p class="empty-state">Belum ada sekolah binaan.</p>`);
}

document.getElementById("sekolahForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const btn = document.getElementById("submitSekolahBtn");
  btn.disabled = true;
  const s = {
    id: "SKL-" + Date.now().toString(36).toUpperCase(),
    nama: document.getElementById("sNama").value.trim(),
    npsn: document.getElementById("sNpsn").value.trim(),
    jenjang: document.getElementById("sJenjang").value,
    kepalaSekolah: document.getElementById("sKepsek").value.trim(),
    pengawas: document.getElementById("sPengawas").value.trim(),
    alamat: document.getElementById("sAlamat").value.trim()
  };
  try {
    await addSekolah(s);
    e.target.reset();
    renderSekolahView();
    showToast("Sekolah \"" + s.nama + "\" ditambahkan");
  } catch (err) {
    showToast("Gagal menambah sekolah: " + err.message);
  } finally {
    btn.disabled = false;
  }
});

/* ------------------------------------------------------------------ */
/* VIEW: PENGATURAN GITHUB                                             */
/* ------------------------------------------------------------------ */

function fillConfigForm() {
  document.getElementById("cfgOwner").value = config.owner || "";
  document.getElementById("cfgRepo").value = config.repo || "";
  document.getElementById("cfgBranch").value = config.branch || "main";
  document.getElementById("cfgToken").value = "";
  document.getElementById("cfgToken").placeholder = config.token
    ? "•••••••• (token tersimpan — kosongkan jika tidak ingin mengubah)"
    : "github_pat_xxxxxxxxxxxx";
  document.getElementById("configStatus").textContent = "";
}

document.getElementById("configForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const owner = document.getElementById("cfgOwner").value.trim();
  const repo = document.getElementById("cfgRepo").value.trim();
  const branch = document.getElementById("cfgBranch").value.trim() || "main";
  const tokenInput = document.getElementById("cfgToken").value.trim();
  const statusEl = document.getElementById("configStatus");

  if (!owner || !repo) { statusEl.textContent = "Isi pemilik dan nama repository."; return; }

  statusEl.textContent = "Menyambungkan...";
  const token = tokenInput || config.token || "";
  try {
    const headers = { Accept: "application/vnd.github+json" };
    if (token) headers.Authorization = "Bearer " + token;
    const res = await fetch(`https://api.github.com/repos/${owner}/${repo}`, { headers });
    if (!res.ok) throw new Error("Repository tidak ditemukan atau token tidak valid (HTTP " + res.status + ")");

    config = { mode: "github", owner, repo, branch, token };
    saveConfig();
    statusEl.textContent = "Berhasil tersambung ke " + owner + "/" + repo;
    showToast("Tersambung ke GitHub: " + owner + "/" + repo);
    updateConnStatus();
    await setView(session.role === "sekolah" ? "kirim" : "dashboard");
  } catch (err) {
    statusEl.textContent = "Gagal: " + err.message;
  }
});

document.getElementById("useDemoBtn").addEventListener("click", async () => {
  config.mode = "demo";
  saveConfig();
  updateConnStatus();
  showToast("Beralih ke mode demo (data lokal)");
  await setView(session.role === "sekolah" ? "kirim" : "dashboard");
});

/* ------------------------------------------------------------------ */
/* DETAIL / REVIEW MODAL                                               */
/* ------------------------------------------------------------------ */

function openDetail(id) {
  const l = cachedLaporan.find(x => x.id === id);
  if (!l) return;
  const sekolah = findSekolah(l.sekolahId);
  const canReview = session.role === "pengawas";

  let bodyHTML = `
    <p class="modal-eyebrow">${l.number ? "#" + l.number : l.id} &middot; ${escapeHTML(l.kategori)}</p>
    <h3>${escapeHTML(l.judul)}</h3>
    <div class="modal-meta">
      <span>${sekolah ? escapeHTML(sekolah.nama) : "Sekolah tidak diketahui"}</span>
      <span>Periode ${fmtPeriode(l.periode)}</span>
      <span>Dikirim ${fmtDateTime(l.tanggalKirim)}</span>
      ${statusBadge(l.status)}
    </div>
    <div class="modal-body-text">${escapeHTML(l.isi)}</div>
    ${l.lampiranData ? `<div class="modal-attach"><img src="${l.lampiranData}" alt="Lampiran laporan"></div>` : ""}
    ${l.htmlUrl ? `<p class="hint-text" style="margin-top:10px;"><a href="${l.htmlUrl}" target="_blank" rel="noopener">Lihat issue di GitHub &rarr;</a></p>` : ""}
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
          <span class="form-status" id="reviewStatusMsg"></span>
        </div>
      </div>`;
  } else if (l.catatanPengawas) {
    bodyHTML += `<div class="review-existing"><b>Catatan pengawas:</b><br>${escapeHTML(l.catatanPengawas)}</div>`;
  }

  document.getElementById("modalBody").innerHTML = bodyHTML;
  document.getElementById("modalBackdrop").hidden = false;

  if (canReview) {
    document.getElementById("saveReviewBtn").addEventListener("click", async () => {
      const btn = document.getElementById("saveReviewBtn");
      const msgEl = document.getElementById("reviewStatusMsg");
      const newStatus = document.getElementById("reviewStatus").value;
      const catatan = document.getElementById("reviewCatatan").value.trim();
      btn.disabled = true;
      msgEl.textContent = isGithubMode() ? "Menyimpan ke GitHub..." : "Menyimpan...";
      try {
        await saveReview(l, newStatus, catatan);
        closeModal();
        renderCurrentView();
        showToast("Tinjauan untuk \"" + l.judul + "\" tersimpan");
      } catch (err) {
        msgEl.textContent = "Gagal: " + err.message;
        btn.disabled = false;
      }
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
document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeModal(); });

/* ------------------------------------------------------------------ */
/* Wiring: nav, role switch, filters                                   */
/* ------------------------------------------------------------------ */

document.querySelectorAll(".nav-item").forEach(btn => btn.addEventListener("click", () => setView(btn.dataset.view)));
document.querySelectorAll("[data-view].link-btn").forEach(btn => btn.addEventListener("click", () => setView(btn.dataset.view)));

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

async function init() {
  document.getElementById("topbarDate").textContent = new Date().toLocaleDateString("id-ID", {
    weekday: "long", day: "2-digit", month: "long", year: "numeric"
  });
  updateConnStatus();
  applyRoleUI();
  await setView(session.role === "sekolah" ? "kirim" : "dashboard");
  populateSekolahLoginSelect();
}

init();
