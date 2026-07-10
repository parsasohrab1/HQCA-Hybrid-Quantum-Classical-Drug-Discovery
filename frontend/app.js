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
  if (name === "showcase") loadShowcase();
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

function formatStepData(key, data) {
  if (!data) return "";
  if (key === "input") {
    return `<dl class="step-dl">
      <dt>پروتئین هدف</dt><dd>${data.target_protein} (${data.target_protein_gene}, UniProt ${data.target_protein_uniprot})</dd>
      <dt>بافت هدف</dt><dd>${data.tissue}</dd>
      <dt>اندیکاسیون</dt><dd>${data.tissue_indication}</dd>
      <dt>دوز مصرف</dt><dd>${data.dose_amount} — ${data.dose_route}</dd>
      <dt>تکرار</dt><dd>${data.dose_frequency} (حداکثر روزانه ${data.dose_max_daily})</dd>
      <dt>SMILES</dt><dd><code>${data.smiles}</code></dd>
      <dt>طول توالی پروتئین</dt><dd>${data.fasta_length} اسید آمینه</dd>
      <dt>پیش‌نمایش FASTA</dt><dd><code>${data.fasta_preview}</code></dd>
      <dt>وضعیت</dt><dd class="ok">✓ ${data.status === "valid" ? "معتبر" : data.status}</dd>
    </dl>`;
  }
  if (key === "descriptors") {
    return `<dl class="step-dl">
      <dt>MW</dt><dd>${data.MW}</dd>
      <dt>LogP</dt><dd>${data.LogP}</dd>
      <dt>HBD / HBA</dt><dd>${data.HBD} / ${data.HBA}</dd>
      <dt>پیوند چرخان / حلقه آروماتیک</dt><dd>${data.RotatableBonds} / ${data.AromaticRings}</dd>
      <dt>TPSA</dt><dd>${data.TPSA}</dd>
    </dl>`;
  }
  if (key === "quantum") {
    return `<dl class="step-dl">
      <dt>Backend</dt><dd>${data.backend}</dd>
      <dt>کیوبیت</dt><dd>${data.n_qubits}</dd>
      <dt>Embedding</dt><dd>${data.embedding}</dd>
      <dt>مدار</dt><dd>${data.circuit}</dd>
      <dt>عمق گیت</dt><dd>${data.gate_depth}</dd>
    </dl>`;
  }
  if (key === "simulation") {
    return `<dl class="step-dl">
      <dt>الگوریتم</dt><dd>${data.algorithm}</dd>
      <dt>انرژی اتصال</dt><dd>${data.binding_energy_kcal_mol} kcal/mol</dd>
      <dt>اندازه‌گیری</dt><dd>${data.measurement}</dd>
    </dl>`;
  }
  if (key === "pockets") {
    const centers = (data.centers || []).map((c, i) => `جیب ${i + 1}: (${c.x}, ${c.y}, ${c.z})`).join("<br/>");
    return `<dl class="step-dl">
      <dt>تعداد جیب</dt><dd>${data.count}</dd>
      <dt>طول هر جیب</dt><dd>${(data.pocket_lengths || []).join(", ")}</dd>
      <dt>مراکز</dt><dd>${centers}</dd>
    </dl>`;
  }
  if (key === "prediction") {
    return `<dl class="step-dl">
      <dt>نمره اتصال</dt><dd class="score">${data.binding_score} / 100</dd>
      <dt>انرژی</dt><dd>${Number(data.binding_energy_kcal_mol).toFixed(3)} kcal/mol</dd>
      <dt>اطمینان</dt><dd>${data.confidence_pct}%</dd>
      <dt>تفسیر</dt><dd>${data.interpretation}</dd>
    </dl>`;
  }
  if (key === "output") {
    return `<dl class="step-dl">
      <dt>نمره نهایی</dt><dd class="score">${data.binding_score} / 100</dd>
      <dt>اطمینان</dt><dd>${data.confidence_pct}%</dd>
      <dt>فایل‌ها</dt><dd>PDF، CSV، PDB، HTML ۳D</dd>
    </dl>`;
  }
  return `<pre>${JSON.stringify(data, null, 2)}</pre>`;
}

function renderShowcase(data) {
  const drug = data.drug;
  const res = data.result;
  const tp = drug.target_protein || {};
  const ti = drug.tissue || {};
  const dose = drug.dose || {};
  document.getElementById("showcase-header").innerHTML = `
    <div class="showcase-hero">
      <div>
        <h2>${drug.name_fa} <span class="muted">(${drug.name_en})</span></h2>
        <p>${drug.description}</p>
        <div class="clinical-grid">
          <div class="clinical-item">
            <label>پروتئین هدف</label>
            <strong>${tp.name_fa || "—"}</strong>
            <span>${tp.name || ""} · ژن ${tp.gene || "—"} · ${tp.uniprot || ""}</span>
            <span class="muted">${tp.role_fa || ""}</span>
          </div>
          <div class="clinical-item">
            <label>بافت هدف</label>
            <strong>${ti.name_fa || "—"}</strong>
            <span>${ti.indication_fa || ""}</span>
          </div>
          <div class="clinical-item">
            <label>دوز مصرف</label>
            <strong>${dose.amount || "—"} ${dose.unit_fa || dose.unit || "mg"}</strong>
            <span>${dose.route_fa || ""} — ${dose.frequency_fa || ""}</span>
            <span class="muted">حداکثر روزانه: ${dose.max_daily_mg || "—"} ${dose.unit_fa || "mg"} · ${dose.note_fa || ""}</span>
          </div>
        </div>
        <p><strong>SMILES:</strong> <code>${drug.smiles}</code></p>
      </div>
      <div class="showcase-scores">
        <div class="score-ring"><span>${res.binding_score}</span><label>نمره اتصال</label></div>
        <div class="score-ring alt"><span>${res.confidence_pct}%</span><label>اطمینان</label></div>
      </div>
    </div>`;

  document.getElementById("pipeline-steps").innerHTML = (data.pipeline || []).map((step) => `
    <article class="pipeline-step completed">
      <div class="step-marker">${step.icon}<span>${step.step}</span></div>
      <div class="step-content">
        <header><h3>${step.title}</h3><span class="step-status">✓ تکمیل</span></header>
        ${formatStepData(step.key, step.data)}
      </div>
    </article>`).join("");

  const frame = document.getElementById("showcase-viewer");
  if (res.viewer_html_url) frame.src = apiUrl(res.viewer_html_url);
  document.getElementById("showcase-downloads").innerHTML = `
    <a href="${apiUrl(res.report_pdf_url)}" target="_blank">📄 گزارش PDF</a>
    <a href="${apiUrl(res.report_csv_url)}" target="_blank">📊 CSV</a>
    <a href="${apiUrl(res.pocket_pdb_url)}" target="_blank">🧬 PDB</a>`;
}

async function loadShowcase() {
  const header = document.getElementById("showcase-header");
  const steps = document.getElementById("pipeline-steps");
  try {
    header.innerHTML = "<p class='empty-msg'>در حال اجرای شبیه‌سازی...</p>";
    steps.innerHTML = "";
    const data = await api("/demo/showcase");
    renderShowcase(data);
  } catch (e) {
    header.innerHTML = `<p class="empty-msg">خطا: ${e.message}</p>`;
  }
}

function renderMolecularData(data) {
  if (!data?.primary) {
    document.getElementById("primary-smiles").textContent = "—";
    document.getElementById("primary-protein").textContent = "—";
    return;
  }
  const p = data.primary;
  const target = data.screening_target || {};
  document.getElementById("molecular-primary-label").textContent =
    `${p.label || "جفت اصلی"} · منبع: ${p.source || "—"}`;
  document.getElementById("molecular-stored-count").textContent =
    `${data.stored_count || 0} جفت ذخیره‌شده`;
  document.getElementById("primary-smiles").textContent = p.smiles || "—";
  document.getElementById("primary-protein").textContent = p.protein_sequence || "—";
  document.getElementById("primary-protein-len").textContent =
    p.protein_length ? `${p.protein_length} اسید آمینه` : "";
  document.getElementById("screening-target-protein").textContent =
    target.protein_sequence || "—";

  const pairs = data.pairs || [];
  document.getElementById("molecular-pairs-body").innerHTML = pairs.map((m) => `
    <tr class="molecular-pair-row">
      <td>${m.label || m.id?.slice(0, 10) || "—"}</td>
      <td><code>${m.smiles}</code></td>
      <td><code class="protein-seq">${m.protein_preview || m.protein_sequence?.slice(0, 40) || "—"}</code></td>
      <td>${m.protein_length ?? "—"}</td>
      <td>${m.binding_score ?? "—"}</td>
    </tr>`).join("");

  document.getElementById("molecular-catalog-download").innerHTML = data.catalog_url
    ? `<a href="${apiUrl(data.catalog_url)}" target="_blank">دانلود کاتالوگ JSON</a>`
    : "";
}

function renderScreening(screening) {
  if (!screening?.available) {
    document.getElementById("screening-text").textContent = screening?.message_fa || "داده غربالگری موجود نیست.";
    document.getElementById("screening-hit-rate").textContent = "—";
    document.getElementById("screening-criteria").innerHTML = "";
    document.getElementById("screening-distribution").innerHTML = "";
    document.getElementById("screening-body").innerHTML =
      `<tr><td colspan="7" class="empty-msg">${screening?.message_fa || "—"}</td></tr>`;
    document.getElementById("screening-downloads").innerHTML = "";
    document.getElementById("stat-screened").textContent = "0";
    document.getElementById("stat-hits").textContent = "0";
    return;
  }

  const s = screening.summary;
  document.getElementById("stat-screened").textContent = s.total_screened;
  document.getElementById("stat-hits").textContent = s.hits;
  document.getElementById("screening-hit-rate").textContent = `${s.hit_rate_pct}% کاندید`;
  document.getElementById("screening-text").innerHTML = `
    <strong>${s.total_screened}</strong> مولکول غربال شد —
    <strong class="hit">${s.hits}</strong> کاندید برتر ·
    <strong>${s.rejected}</strong> رد شده ·
    بهترین نمره: <strong>${s.best_binding_score}</strong> ·
    میانگین: <strong>${s.avg_binding_score}</strong>`;

  const labels = screening.criteria_labels_fa || {};
  const crit = screening.criteria || {};
  document.getElementById("screening-criteria").innerHTML = Object.entries(crit).map(([k, v]) =>
    `<span class="criteria-chip">${labels[k] || k}: <strong>${v}</strong></span>`
  ).join("");

  const dist = screening.score_distribution || [];
  const maxCount = Math.max(...dist.map((d) => d.count), 1);
  document.getElementById("screening-distribution").innerHTML = `
    <p class="chart-label">توزیع نمرات اتصال</p>
    ${dist.map((d) => `
    <div class="dist-row">
      <span>${d.range}</span>
      <div class="bar-track"><div class="bar-fill" style="width:${(d.count / maxCount) * 100}%"></div></div>
      <span class="bar-val">${d.count}</span>
    </div>`).join("")}`;

  const rows = screening.leaderboard || [];
  document.getElementById("screening-body").innerHTML = rows.map((m) => `
    <tr class="screening-row ${m.is_hit ? "hit" : "reject"}">
      <td>${m.rank}</td>
      <td><code>${m.smiles_preview || m.smiles}</code></td>
      <td><code class="protein-seq">${m.protein_preview || m.protein_sequence?.slice(0, 36) || "—"}</code></td>
      <td class="score-cell">${m.binding_score}</td>
      <td>${m.MW}</td>
      <td>${m.LogP}</td>
      <td><span class="status-pill ${m.is_hit ? "hit" : "reject"}">${m.status_fa}</span></td>
    </tr>`).join("");

  document.getElementById("screening-downloads").innerHTML = screening.source_csv
    ? `<a href="${apiUrl(screening.source_csv)}" target="_blank">دانلود CSV دیتاست</a>`
    : "";
}

function showPrediction(item) {
  if (!item) return;
  const html = `
    <strong>SMILES:</strong> <code>${item.smiles || item.smiles_preview || "—"}</code><br/>
    <strong>توالی پروتئین:</strong> <code class="protein-inline">${item.protein_sequence || item.protein_preview || "—"}</code><br/>
    <strong>طول توالی:</strong> ${item.protein_length || (item.protein_sequence?.length ?? "—")} اسید آمینه<br/>
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
      <td><code>${p.smiles_preview || p.smiles}</code></td>
      <td><code class="protein-seq">${p.protein_preview || p.protein_sequence?.slice(0, 28) || "—"}</code></td>
      <td>${p.binding_score}</td>
      <td>${p.confidence}%</td>
      <td>${(p.created_at || "").slice(0, 16)}</td>
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
  document.getElementById("stat-avg-score").textContent = data.stats.avg_binding_score;
  if (data.latest_prediction) showPrediction(data.latest_prediction);
  renderMolecularData(data.molecular_data);
  renderScreening(data.molecular_screening);
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

document.getElementById("goto-showcase")?.addEventListener("click", () => showPage("showcase"));
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
  document.querySelectorAll(".history-row, .screening-row, .molecular-pair-row").forEach((row) => {
    row.style.display = row.textContent.toLowerCase().includes(q) ? "" : "none";
  });
});

async function bootstrap() {
  await ensureConnection();
  await autoLogin();
  if (!localStorage.getItem("hqca_showcase_seen")) {
    localStorage.setItem("hqca_showcase_seen", "1");
    showPage("showcase");
  }
}

bootstrap().catch((e) => {
  document.getElementById("auth-status").textContent = "نیاز به ورود";
  document.getElementById("overview-latest").textContent = e.message;
});
