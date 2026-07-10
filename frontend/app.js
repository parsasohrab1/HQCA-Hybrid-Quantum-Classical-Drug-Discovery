/** HQCA Dashboard — layout, navigation, notifications */

let API = "";
let token = localStorage.getItem("hqca_token") || "";
let notificationsCache = [];
let readIds = new Set(JSON.parse(localStorage.getItem("hqca_read_notifs") || "[]"));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const TYPE_ICON = { prediction: "🧬", dataset: "🧪", system: "⚙️", error: "⚠️" };

function apiCandidates() {
  const origin = window.location.origin;
  const list = ["", localStorage.getItem("hqca_api"), origin.includes("5173") ? "http://127.0.0.1:18080" : null, "http://127.0.0.1:18080", "http://localhost:18080"].filter((v) => v !== null);
  const seen = new Set();
  return list.filter((v) => { const k = v || "__same__"; if (seen.has(k)) return false; seen.add(k); return true; });
}

function apiUrl(path) {
  if (!path.startsWith("/")) path = `/${path}`;
  return API ? `${API}${path}` : path;
}

function setConnectionStatus(state, message) {
  const el = document.getElementById("connection-status");
  el.className = `connection ${state}`;
  el.textContent = message;
}

function showPage(name) {
  document.querySelectorAll(".page").forEach((p) => p.classList.remove("active"));
  document.querySelectorAll(".nav-item[data-page]").forEach((n) => n.classList.remove("active"));
  document.getElementById(`page-${name}`)?.classList.add("active");
  document.querySelector(`.nav-item[data-page="${name}"]`)?.classList.add("active");
  if (name === "notifications") loadNotifications();
}

function updateNotifBadge(unread) {
  const badge = document.getElementById("notif-count");
  if (unread > 0) { badge.textContent = unread; badge.classList.remove("hidden"); }
  else badge.classList.add("hidden");
  document.getElementById("stat-notifications").textContent = unread;
}

async function probeApi(base) {
  const url = base ? `${base}/health` : "/health";
  const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
  return res.ok ? (base || window.location.origin) : null;
}

async function ensureConnection() {
  setConnectionStatus("connecting", "در حال اتصال...");
  for (let i = 1; i <= 40; i++) {
    for (const base of apiCandidates()) {
      try {
        const ok = await probeApi(base);
        if (ok) {
          API = base;
          localStorage.setItem("hqca_api", ok);
          setConnectionStatus("connected", "✓ متصل");
          pushLocalNotif("system", "اتصال برقرار شد", ok, true);
          return;
        }
      } catch { /* retry */ }
    }
    setConnectionStatus("connecting", `اتصال... (${i}/40)`);
    await sleep(1000);
  }
  setConnectionStatus("error", "✗ قطع");
  throw new Error("API unavailable");
}

async function api(path, options = {}) {
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(apiUrl(path), { ...options, headers });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(typeof err.detail === "string" ? err.detail : JSON.stringify(err.detail));
  }
  return res.json();
}

function pushLocalNotif(type, title, message, read = false) {
  const id = `local-${Date.now()}`;
  notificationsCache.unshift({ id, type, title, message, created_at: new Date().toISOString(), read, link: null });
  if (read) readIds.add(id);
}

function showPrediction(item) {
  if (!item) return;
  const html = `
    <strong>SMILES:</strong> ${item.smiles_preview || item.smiles || "—"}<br/>
    <strong>نمره:</strong> ${item.binding_score} / 100<br/>
    <strong>انرژی:</strong> ${Number(item.binding_energy_kcal_mol ?? 0).toFixed(3)} kcal/mol<br/>
    <strong>اطمینان:</strong> ${item.confidence}%<br/>
    <strong>Backend:</strong> ${item.backend || "auto"}`;
  document.getElementById("result-summary").innerHTML = html;
  document.getElementById("overview-latest").innerHTML = html;
  const frame = document.getElementById("viewer-frame");
  if (item.viewer_html_url) frame.src = apiUrl(item.viewer_html_url);
  document.getElementById("download-links").innerHTML = `
    <a href="${apiUrl(item.report_pdf_url)}" target="_blank">PDF</a>
    <a href="${apiUrl(item.report_csv_url)}" target="_blank">CSV</a>
    <a href="${apiUrl(item.pocket_pdb_url)}" target="_blank">PDB</a>`;
}

function renderChart(predictions) {
  const el = document.getElementById("score-chart");
  if (!predictions?.length) { el.innerHTML = "<p class='empty-msg'>داده‌ای نیست</p>"; return; }
  const max = Math.max(...predictions.map((p) => p.binding_score), 1);
  el.innerHTML = predictions.map((p) => `
    <div class="bar-row">
      <span>${(p.smiles_preview || "").slice(0, 10)}</span>
      <div class="bar-track"><div class="bar-fill" style="width:${(p.binding_score / max) * 100}%"></div></div>
      <span class="bar-val">${p.binding_score}</span>
    </div>`).join("");
}

function renderHistory(predictions) {
  const tbody = document.getElementById("history-body");
  tbody.innerHTML = (predictions || []).map((p) => `
    <tr data-id="${p.request_id}" class="history-row">
      <td>${p.smiles_preview}</td><td>${p.binding_score}</td>
      <td>${p.confidence}%</td><td>${(p.created_at || "").slice(0, 16)}</td>
    </tr>`).join("");
  tbody.querySelectorAll(".history-row").forEach((row) => {
    row.onclick = async () => {
      showPage("results");
      showPrediction(await api(`/predictions/${row.dataset.id}`));
    };
  });
}

function renderDataset(datasets) {
  const panel = document.getElementById("dataset-panel");
  if (!datasets?.length) { panel.textContent = "دیتاستی موجود نیست."; return; }
  const d = datasets[0];
  panel.innerHTML = `
    <p><strong>Task:</strong> ${d.task_id}</p>
    <p><strong>نمونه‌ها:</strong> ${d.records_generated} / ${d.num_samples}</p>
    <div class="link-row">
      <a href="${apiUrl(d.output_csv)}" target="_blank">CSV</a>
      <a href="${apiUrl(d.output_json)}" target="_blank">JSON</a>
      <a href="${apiUrl(d.output_pdf)}" target="_blank">PDF</a>
    </div>`;
}

function renderNotificationsList(items) {
  const list = document.getElementById("notifications-list");
  const all = [...items, ...notificationsCache.filter((l) => !items.find((i) => i.id === l.id))];
  all.sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""));

  if (!all.length) {
    list.innerHTML = "<p class='empty-msg'>اعلانی وجود ندارد.</p>";
    updateNotifBadge(0);
    return;
  }

  let unread = 0;
  list.innerHTML = all.map((n) => {
    const isRead = n.read || readIds.has(n.id);
    if (!isRead) unread++;
    const icon = TYPE_ICON[n.type] || "📌";
    return `
    <article class="notif-item ${isRead ? "read" : "unread"}" data-id="${n.id}">
      <div class="notif-icon ${n.type}">${icon}</div>
      <div class="notif-body">
        <h3>${n.title}</h3>
        <p>${n.message}</p>
        <div class="notif-actions">
          ${n.meta?.request_id ? `<button class="notif-open" data-rid="${n.meta.request_id}">مشاهده نتیجه</button>` : ""}
          ${!isRead ? `<button class="notif-read" data-id="${n.id}">علامت خوانده‌شده</button>` : ""}
        </div>
      </div>
      <time class="notif-time">${(n.created_at || "").slice(0, 16).replace("T", " ")}</time>
    </article>`;
  }).join("");

  updateNotifBadge(unread);
  document.getElementById("notif-summary").textContent = `${all.length} اعلان — ${unread} خوانده‌نشده`;

  list.querySelectorAll(".notif-read").forEach((btn) => {
    btn.onclick = () => { readIds.add(btn.dataset.id); localStorage.setItem("hqca_read_notifs", JSON.stringify([...readIds])); loadNotifications(); };
  });
  list.querySelectorAll(".notif-open").forEach((btn) => {
    btn.onclick = async () => {
      showPage("results");
      showPrediction(await api(`/predictions/${btn.dataset.rid}`));
      readIds.add(`pred-${btn.dataset.rid}`);
      localStorage.setItem("hqca_read_notifs", JSON.stringify([...readIds]));
    };
  });
}

async function loadNotifications() {
  try {
    const data = await api("/notifications");
    renderNotificationsList(data.items || []);
  } catch (e) {
    document.getElementById("notifications-list").innerHTML = `<p class="empty-msg">${e.message}</p>`;
  }
}

async function loadDashboard() {
  const data = await api("/dashboard");
  document.getElementById("stat-predictions").textContent = data.stats.total_predictions;
  document.getElementById("stat-datasets").textContent = data.stats.total_synthetic_jobs;
  document.getElementById("stat-avg-score").textContent = data.stats.avg_binding_score;
  if (data.latest_prediction) showPrediction(data.latest_prediction);
  renderChart(data.predictions);
  renderHistory(data.predictions);
  renderDataset(data.synthetic_datasets);
  await loadNotifications();
}

async function autoLogin() {
  const u = document.getElementById("username-visible")?.value || document.getElementById("username").value;
  const p = document.getElementById("password-visible")?.value || document.getElementById("password").value;
  document.getElementById("username").value = u;
  document.getElementById("password").value = p;
  const data = await api("/auth/login", { method: "POST", body: JSON.stringify({ username: u, password: p }) });
  token = data.access_token;
  localStorage.setItem("hqca_token", token);
  document.getElementById("auth-status").textContent = data.role;
  pushLocalNotif("system", "ورود موفق", `نقش: ${data.role}`, true);
  await loadDashboard();
}

/* ── Event listeners ── */
document.querySelectorAll(".nav-item[data-page]").forEach((btn) => {
  btn.onclick = () => showPage(btn.dataset.page);
});
document.getElementById("notif-bell").onclick = () => showPage("notifications");
document.getElementById("notif-refresh").onclick = loadNotifications;
document.getElementById("notif-mark-read").onclick = () => {
  document.querySelectorAll(".notif-item").forEach((el) => readIds.add(el.dataset.id));
  localStorage.setItem("hqca_read_notifs", JSON.stringify([...readIds]));
  loadNotifications();
};
document.getElementById("sidebar-toggle").onclick = () => document.getElementById("sidebar").classList.toggle("open");
document.getElementById("login-btn").onclick = async () => { await ensureConnection(); await autoLogin(); };
document.getElementById("save-auth-btn")?.addEventListener("click", async () => { await ensureConnection(); await autoLogin(); });

document.getElementById("predict-btn").onclick = async () => {
  const body = { smiles: document.getElementById("smiles").value, fasta: document.getElementById("fasta").value, backend: document.getElementById("backend").value };
  const data = await api("/predict", { method: "POST", body: JSON.stringify(body) });
  pushLocalNotif("prediction", `پیش‌بینی جدید: ${data.binding_score}`, data.request_id, false);
  showPage("results");
  showPrediction(data);
  await loadDashboard();
};

document.getElementById("generate-btn").onclick = async () => {
  const num_samples = Number(document.getElementById("num-samples").value);
  const smiles_seed = document.getElementById("seed-smiles").value.split(",").map((s) => s.trim());
  const data = await api("/generate_synthetic", { method: "POST", body: JSON.stringify({ num_samples, smiles_seed }) });
  pushLocalNotif("dataset", "تولید داده شروع شد", data.task_id, false);
  const el = document.getElementById("task-status");
  el.textContent = `Task ${data.task_id}: ${data.status}`;
  const poll = setInterval(async () => {
    const st = await api(`/status/${data.task_id}`);
    el.textContent = JSON.stringify(st, null, 2);
    if (st.status === "completed") { pushLocalNotif("dataset", "تولید داده تکمیل شد", `${st.records_generated} نمونه`, false); clearInterval(poll); await loadDashboard(); }
    if (st.status === "failed") { pushLocalNotif("error", "خطا در تولید", st.error || "", false); clearInterval(poll); }
  }, 2000);
};

document.getElementById("global-search")?.addEventListener("input", (e) => {
  const q = e.target.value.toLowerCase();
  document.querySelectorAll(".history-row").forEach((row) => {
    row.style.display = row.textContent.toLowerCase().includes(q) ? "" : "none";
  });
});

async function bootstrap() {
  await ensureConnection();
  await autoLogin();
}

bootstrap().catch((e) => {
  document.getElementById("auth-status").textContent = "نیاز به ورود";
  document.getElementById("overview-latest").textContent = e.message;
});
