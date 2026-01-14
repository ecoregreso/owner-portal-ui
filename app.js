// owner-portal/app.js

const cfg = window.OWNER_CONFIG || {};
const API = String(cfg.apiBase || "").replace(/\/+$/, "");
const ADMIN_UI_BASE = String(cfg.adminUiBase || "").replace(/\/+$/, "");
const ORDERS_POLL_MS = Number(cfg.ordersPollMs || 0) || 0;

const els = {
  loginCard: document.getElementById("loginCard"),
  loginForm: document.getElementById("loginForm"),
  loginUsername: document.getElementById("loginUsername"),
  loginPassword: document.getElementById("loginPassword"),
  loginError: document.getElementById("loginError"),
  ownerShell: document.getElementById("ownerShell"),
  console: document.getElementById("console"),
  statusBadge: document.getElementById("statusBadge"),
  logoutBtn: document.getElementById("logoutBtn"),

  // Brand
  brandEditor: document.getElementById("brandEditor"),
  brandHint: document.getElementById("brandHint"),
  brandRefresh: document.getElementById("brandRefresh"),
  brandSave: document.getElementById("brandSave"),

  // System config
  systemToggles: document.getElementById("systemToggles"),
  systemHint: document.getElementById("systemHint"),
  systemRefresh: document.getElementById("systemRefresh"),
  systemSave: document.getElementById("systemSave"),

  // Tenants
  tenantsTable: document.getElementById("tenantsTable"),
  tenantsRefresh: document.getElementById("tenantsRefresh"),
  tenantCreateForm: document.getElementById("tenantCreateForm"),
  tenantCreateHint: document.getElementById("tenantCreateHint"),
  tenantName: document.getElementById("tenantName"),
  tenantStatus: document.getElementById("tenantStatus"),
  tenantSeedCredits: document.getElementById("tenantSeedCredits"),
  tenantSeedPool: document.getElementById("tenantSeedPool"),
  tenantAdminUsername: document.getElementById("tenantAdminUsername"),
  tenantAdminEmail: document.getElementById("tenantAdminEmail"),
  tenantAdminPassword: document.getElementById("tenantAdminPassword"),

  // Orders
  ordersTable: document.getElementById("ordersTable"),
  ordersRefresh: document.getElementById("ordersRefresh"),
  ordersAutoToggle: document.getElementById("ordersAutoToggle"),
  ordersHint: document.getElementById("ordersHint"),
  ordersTenantFilter: document.getElementById("ordersTenantFilter"),
  ownerAddressInput: document.getElementById("ownerAddressInput"),
  ownerAddressSave: document.getElementById("ownerAddressSave"),

  // Tenant wipe
  wipeTenantSelect: document.getElementById("wipeTenantSelect"),
  wipeTenantConfirm: document.getElementById("wipeTenantConfirm"),
  wipeTenantPassword: document.getElementById("wipeTenantPassword"),
  wipeTenantBtn: document.getElementById("wipeTenantBtn"),
  wipeTenantHint: document.getElementById("wipeTenantHint"),
  wipeTenantPhrase: document.getElementById("wipeTenantPhrase"),

  // System reset
  wipeAllConfirm: document.getElementById("wipeAllConfirm"),
  wipeAllPassword: document.getElementById("wipeAllPassword"),
  wipeAllBtn: document.getElementById("wipeAllBtn"),
  wipeAllHint: document.getElementById("wipeAllHint"),
};

const STORAGE_KEY = "ptu_owner_auth";
const WIPE_ALL_PHRASE = "ERASE ALL";

let state = {
  token: null,
  staff: null,
  tenants: [],
  wipeTenantId: "",
  systemConfig: null,
  ordersAuto: false,
  ordersTimer: null,
};

function setStatus(text, kind = "ok") {
  els.statusBadge.textContent = text;
  els.statusBadge.classList.remove("warn", "bad");
  if (kind === "warn") els.statusBadge.classList.add("warn");
  if (kind === "bad") els.statusBadge.classList.add("bad");
}

function setHint(el, msg, kind = "") {
  if (!el) return;
  el.textContent = msg || "";
  el.style.color = kind === "bad" ? "var(--danger)" : "";
}

async function apiFetch(path, { method = "GET", body = null, query = null } = {}) {
  if (!API) throw new Error("OWNER_CONFIG.apiBase is missing");
  let url = `${API}${path}`;
  if (query && typeof query === "object") {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) {
      if (v === null || v === undefined || v === "") continue;
      params.set(k, String(v));
    }
    const qs = params.toString();
    if (qs) url += `?${qs}`;
  }

  const headers = { "Content-Type": "application/json" };
  if (state.token) headers.Authorization = `Bearer ${state.token}`;

  const res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : null,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok || data?.ok === false) {
    const msg = data?.error || `Request failed (${res.status})`;
    const err = new Error(msg);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

function saveAuth() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ token: state.token, staff: state.staff }));
}

function loadAuth() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function clearAuth() {
  localStorage.removeItem(STORAGE_KEY);
}

function showLogin() {
  document.body.classList.add("login-active");
  els.loginCard.hidden = false;
  els.ownerShell.hidden = true;
  els.console.hidden = true;
  els.logoutBtn.hidden = true;
  setStatus("Disconnected", "bad");
}

function showConsole() {
  document.body.classList.remove("login-active");
  els.loginCard.hidden = true;
  els.ownerShell.hidden = false;
  els.console.hidden = false;
  els.logoutBtn.hidden = false;
  setStatus(`Connected as ${state.staff?.username || "owner"}`);
}

function htmlEscape(s) {
  return String(s || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function copyText(text) {
  const t = String(text || "");
  if (!t) return false;
  try {
    await navigator.clipboard.writeText(t);
    return true;
  } catch {
    // fallback
    const ta = document.createElement("textarea");
    ta.value = t;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    ta.remove();
    return true;
  }
}

// --------------------
// Login / logout
// --------------------

els.loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  setHint(els.loginError, "");
  const username = String(els.loginUsername.value || "").trim();
  const password = String(els.loginPassword.value || "").trim();
  if (!username || !password) {
    return setHint(els.loginError, "Username and password required", "bad");
  }

  try {
    const data = await apiFetch("/staff/login", {
      method: "POST",
      body: { username, password },
    });
    state.token = data.token;
    state.staff = data.staff;
    saveAuth();
    showConsole();
    await refreshAll();
  } catch (err) {
    setHint(els.loginError, err.message || "Login failed", "bad");
  }
});

els.logoutBtn.addEventListener("click", () => {
  state.token = null;
  state.staff = null;
  state.tenants = [];
  state.systemConfig = null;
  stopOrdersAuto();
  clearAuth();
  showLogin();
});

// --------------------
// Brand
// --------------------

async function loadBrand() {
  setHint(els.brandHint, "Loading...");
  const data = await apiFetch("/owner/brand");
  els.brandEditor.value = JSON.stringify(data.brand || {}, null, 2);
  setHint(els.brandHint, "Loaded.");
}

async function saveBrand() {
  try {
    const brand = JSON.parse(els.brandEditor.value || "{}");
    await apiFetch("/owner/brand", { method: "POST", body: { brand } });
    setHint(els.brandHint, "Saved.");
  } catch (err) {
    setHint(els.brandHint, err.message || "Save failed", "bad");
  }
}

els.brandRefresh.addEventListener("click", () => loadBrand().catch((e) => setHint(els.brandHint, e.message, "bad")));
els.brandSave.addEventListener("click", () => saveBrand());

// --------------------
// System Config
// --------------------

const TOGGLE_SCHEMA = [
  { key: "maintenanceMode", title: "Maintenance mode", desc: "Blocks tenant actions; owner access still works." },
  { key: "purchaseOrdersEnabled", title: "Purchase orders", desc: "Allow tenants to place funcoin orders." },
  { key: "vouchersEnabled", title: "Vouchers", desc: "Enable voucher creation / redemption features." },
  { key: "depositsEnabled", title: "Deposits", desc: "Enable deposits (wallet adds)." },
  { key: "withdrawalsEnabled", title: "Withdrawals", desc: "Enable withdrawals / cash-outs." },
  { key: "messagingEnabled", title: "Messaging", desc: "Enable staff messaging and inbox." },
  { key: "pushEnabled", title: "Push notifications", desc: "Allow push notifications to devices." },
];

function renderToggles(container, config, prefix) {
  container.innerHTML = "";
  for (const item of TOGGLE_SCHEMA) {
    const id = `${prefix}-${item.key}`;
    const wrap = document.createElement("div");
    wrap.className = "toggle";
    wrap.innerHTML = `
      <div class="meta">
        <div class="title">${htmlEscape(item.title)}</div>
        <div class="desc">${htmlEscape(item.desc)}</div>
      </div>
      <input type="checkbox" id="${id}" ${config?.[item.key] ? "checked" : ""} />
    `;
    container.appendChild(wrap);
  }
}

function readToggles(prefix) {
  const out = {};
  for (const item of TOGGLE_SCHEMA) {
    const id = `${prefix}-${item.key}`;
    const el = document.getElementById(id);
    if (!el) continue;
    out[item.key] = !!el.checked;
  }
  return out;
}

async function loadSystemConfig() {
  setHint(els.systemHint, "Loading...");
  const data = await apiFetch("/owner/config/system");
  state.systemConfig = data.config || {};
  renderToggles(els.systemToggles, state.systemConfig, "sys");
  setHint(els.systemHint, "Loaded.");
}

async function saveSystemConfig() {
  try {
    const config = readToggles("sys");
    const data = await apiFetch("/owner/config/system", { method: "POST", body: { config } });
    state.systemConfig = data.config || config;
    setHint(els.systemHint, "Saved.");
  } catch (err) {
    setHint(els.systemHint, err.message || "Save failed", "bad");
  }
}

els.systemRefresh.addEventListener("click", () => loadSystemConfig().catch((e) => setHint(els.systemHint, e.message, "bad")));
els.systemSave.addEventListener("click", () => saveSystemConfig());

// --------------------
// Tenants
// --------------------

function pickBalance(arr, field) {
  if (!Array.isArray(arr) || !arr.length) return 0;
  return Number(arr[0]?.[field] || 0) || 0;
}

function tenantAdminLoginUrl(tenantId) {
  if (!tenantId) return "";
  const base = ADMIN_UI_BASE || "";
  if (base) return `${base}/login?tenantId=${tenantId}`;
  return `/login?tenantId=${tenantId}`;
}

async function loadTenants() {
  const data = await apiFetch("/owner/tenants");
  state.tenants = data.tenants || [];

  // tenant filter for orders
  els.ordersTenantFilter.innerHTML = "";
  const optAll = document.createElement("option");
  optAll.value = "";
  optAll.textContent = "All tenants";
  els.ordersTenantFilter.appendChild(optAll);
  for (const t of state.tenants) {
    const opt = document.createElement("option");
    opt.value = t.id;
    opt.textContent = `${t.name} (${t.id.slice(0, 8)})`;
    els.ordersTenantFilter.appendChild(opt);
  }

  renderTenantsTable();
  renderWipeTenantOptions();
}

function renderTenantsTable() {
  const rows = [];

  for (const t of state.tenants) {
    const wallet = pickBalance(t.TenantWallets, "balanceCents");
    const pool = pickBalance(t.TenantVoucherPools, "poolBalanceCents");
    const root = t.rootAdmin || null;

    const loginUrl = tenantAdminLoginUrl(t.id);

    const row = document.createElement("div");
    row.className = "table-row";

    row.innerHTML = `
      <div class="table-row-header">
        <div>
          <div><strong>${htmlEscape(t.name)}</strong> <span class="status-pill">${htmlEscape(t.status || "")}</span></div>
          <div class="small mono">Tenant ID: ${htmlEscape(t.id)}</div>
        </div>
        <div class="inline-actions">
          <button class="btn ghost" data-action="copy-login" data-tenant="${htmlEscape(t.id)}">Copy admin login URL</button>
          <button class="btn primary" data-action="reset-admin" data-tenant="${htmlEscape(t.id)}">Reset admin password</button>
          <button class="btn danger" data-action="delete-tenant" data-tenant="${htmlEscape(t.id)}">Delete tenant</button>
        </div>
      </div>

      <div class="order-meta">
        <div><span class="mono">Wallet:</span> ${wallet} FUN cents</div>
        <div><span class="mono">Voucher Pool:</span> ${pool} FUN cents</div>
        <div><span class="mono">Root admin:</span> ${root?.username ? htmlEscape(root.username) : "(not set)"} ${root?.email ? `&lt;${htmlEscape(root.email)}&gt;` : ""}</div>
        <div><span class="mono">Admin UI:</span> <a href="${htmlEscape(loginUrl)}" target="_blank" rel="noopener">${htmlEscape(loginUrl)}</a></div>
      </div>

      <details>
        <summary class="small">Credits / Voucher Pool</summary>
        <div class="form inline" style="margin-top:10px;">
          <label>
            Issue credits (cents)
            <input type="number" min="0" step="1" data-field="issue" data-tenant="${htmlEscape(t.id)}" placeholder="0" />
          </label>
          <label>
            Allocate voucher pool (cents)
            <input type="number" min="0" step="1" data-field="alloc" data-tenant="${htmlEscape(t.id)}" placeholder="0" />
          </label>
          <button class="btn primary" data-action="issue" data-tenant="${htmlEscape(t.id)}">Issue credits</button>
          <button class="btn ghost" data-action="alloc" data-tenant="${htmlEscape(t.id)}">Allocate pool</button>
          <span class="hint" data-hint="${htmlEscape(t.id)}"></span>
        </div>
      </details>

      <details>
        <summary class="small">Tenant Configuration</summary>
        <div class="toggles" id="tenant-toggles-${htmlEscape(t.id)}" style="margin-top:10px;"></div>
        <div class="inline-actions" style="margin-top:10px;">
          <button class="btn ghost" data-action="tenant-config-refresh" data-tenant="${htmlEscape(t.id)}">Refresh</button>
          <button class="btn primary" data-action="tenant-config-save" data-tenant="${htmlEscape(t.id)}">Save</button>
          <span class="hint" data-config-hint="${htmlEscape(t.id)}"></span>
        </div>
      </details>
    `;

    rows.push(row);
  }

  els.tenantsTable.innerHTML = "";
  for (const r of rows) els.tenantsTable.appendChild(r);
}

function wipeTenantPhrase(tenantId) {
  if (!tenantId) return "WIPE <tenantId>";
  return `WIPE ${tenantId}`;
}

function updateWipeTenantPhrase() {
  const phrase = wipeTenantPhrase(state.wipeTenantId);
  if (els.wipeTenantPhrase) els.wipeTenantPhrase.textContent = phrase;
  if (els.wipeTenantConfirm) els.wipeTenantConfirm.placeholder = phrase;
}

function renderWipeTenantOptions() {
  if (!els.wipeTenantSelect) return;
  els.wipeTenantSelect.innerHTML = "";

  if (!state.tenants.length) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "No tenants available";
    els.wipeTenantSelect.appendChild(opt);
    state.wipeTenantId = "";
    updateWipeTenantPhrase();
    return;
  }

  for (const t of state.tenants) {
    const opt = document.createElement("option");
    opt.value = t.id;
    opt.textContent = `${t.name} (${t.id.slice(0, 8)})`;
    els.wipeTenantSelect.appendChild(opt);
  }

  if (!state.wipeTenantId || !state.tenants.some((t) => t.id === state.wipeTenantId)) {
    state.wipeTenantId = state.tenants[0].id;
  }
  els.wipeTenantSelect.value = state.wipeTenantId;
  updateWipeTenantPhrase();
}

async function refreshTenantConfig(tenantId) {
  const target = document.getElementById(`tenant-toggles-${tenantId}`);
  const hint = document.querySelector(`[data-config-hint="${tenantId}"]`);
  if (!target) return;
  setHint(hint, "Loading...");
  try {
    const data = await apiFetch(`/owner/tenants/${tenantId}/config`);
    renderToggles(target, data.tenant || {}, `ten-${tenantId}`);
    setHint(hint, "Loaded.");
  } catch (err) {
    setHint(hint, err.message || "Failed", "bad");
  }
}

async function saveTenantConfig(tenantId) {
  const hint = document.querySelector(`[data-config-hint="${tenantId}"]`);
  setHint(hint, "Saving...");
  try {
    const config = readToggles(`ten-${tenantId}`);
    await apiFetch(`/owner/tenants/${tenantId}/config`, { method: "POST", body: { config } });
    setHint(hint, "Saved.");
  } catch (err) {
    setHint(hint, err.message || "Failed", "bad");
  }
}

els.tenantsRefresh.addEventListener("click", () => loadTenants().catch((e) => console.error(e)));

els.tenantCreateForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  setHint(els.tenantCreateHint, "Creating...");

  const name = String(els.tenantName.value || "").trim();
  const status = String(els.tenantStatus.value || "active").trim();
  const seedCreditsCents = Number(els.tenantSeedCredits.value || 0) || 0;
  const seedVoucherPoolCents = Number(els.tenantSeedPool.value || 0) || 0;

  const admin = {
    username: String(els.tenantAdminUsername.value || "").trim() || undefined,
    email: String(els.tenantAdminEmail.value || "").trim() || undefined,
    password: String(els.tenantAdminPassword.value || "").trim() || undefined,
  };

  if (!name) {
    return setHint(els.tenantCreateHint, "Tenant name required", "bad");
  }

  try {
    const data = await apiFetch("/owner/tenants", {
      method: "POST",
      body: {
        name,
        status,
        seedCreditsCents,
        seedVoucherPoolCents,
        admin,
      },
    });

    const bootstrap = data.bootstrap || {};
    if (bootstrap.username) {
      els.tenantAdminUsername.value = bootstrap.username;
    }
    if (bootstrap.password) {
      els.tenantAdminPassword.value = bootstrap.password;
    }
    const msg = `Created. Admin: ${bootstrap.username} / ${bootstrap.password} | ${bootstrap.adminUiUrl || tenantAdminLoginUrl(data.tenant?.id)}`;
    setHint(els.tenantCreateHint, msg);

    // leave credentials visible so they can be copied into admin-ui login

    await loadTenants();
    await refreshOrders();
  } catch (err) {
    setHint(els.tenantCreateHint, err.message || "Create failed", "bad");
  }
});

els.tenantsTable.addEventListener("click", async (e) => {
  const btn = e.target?.closest("button");
  if (!btn) return;
  const action = btn.getAttribute("data-action");
  const tenantId = btn.getAttribute("data-tenant");
  if (!action || !tenantId) return;

  if (action === "copy-login") {
    const url = tenantAdminLoginUrl(tenantId);
    await copyText(url);
    btn.textContent = "Copied";
    setTimeout(() => (btn.textContent = "Copy admin login URL"), 900);
    return;
  }

  if (action === "reset-admin") {
    btn.disabled = true;
    try {
      const data = await apiFetch(`/owner/tenants/${tenantId}/bootstrap/reset-password`, { method: "POST" });
      await copyText(`${data.username}:${data.password}`);
      alert(`New password generated (copied as username:password)\n\nUsername: ${data.username}\nPassword: ${data.password}\n\nAdmin UI: ${data.adminUiUrl}`);
      await loadTenants();
    } catch (err) {
      alert(err.message || "Reset failed");
    } finally {
      btn.disabled = false;
    }
    return;
  }

  if (action === "delete-tenant") {
    const ok = prompt(
      `Type DELETE to disable this tenant.

Tenant: ${tenantId}

This will set status=inactive and deactivate all staff in that tenant.`
    );
    if (String(ok || "").trim().toUpperCase() !== "DELETE") return;

    btn.disabled = true;
    try {
      await apiFetch(`/owner/tenants/${tenantId}`, { method: "DELETE" });
      await loadTenants();
      await refreshOrders();
      alert("Tenant disabled.");
    } catch (err) {
      alert(err.message || "Delete failed");
    } finally {
      btn.disabled = false;
    }
    return;
  }


  if (action === "issue" || action === "alloc") {
    const hint = document.querySelector(`[data-hint="${tenantId}"]`);
    setHint(hint, "Working...");
    try {
      if (action === "issue") {
        const field = document.querySelector(`input[data-field="issue"][data-tenant="${tenantId}"]`);
        const amountCents = Number(field?.value || 0) || 0;
        await apiFetch(`/owner/tenants/${tenantId}/credits`, { method: "POST", body: { amountCents, memo: "owner console" } });
        setHint(hint, "Credits issued.");
      } else {
        const field = document.querySelector(`input[data-field="alloc"][data-tenant="${tenantId}"]`);
        const amountCents = Number(field?.value || 0) || 0;
        await apiFetch(`/owner/tenants/${tenantId}/voucher-pool`, { method: "POST", body: { amountCents, memo: "owner console" } });
        setHint(hint, "Pool allocated.");
      }
      await loadTenants();
    } catch (err) {
      setHint(hint, err.message || "Failed", "bad");
    }
    return;
  }

  if (action === "tenant-config-refresh") {
    return refreshTenantConfig(tenantId);
  }
  if (action === "tenant-config-save") {
    return saveTenantConfig(tenantId);
  }
});

if (els.wipeTenantSelect) {
  els.wipeTenantSelect.addEventListener("change", (e) => {
    state.wipeTenantId = String(e.target.value || "");
    updateWipeTenantPhrase();
  });
}

// --------------------
// Tenant wipe
// --------------------

async function wipeTenantData() {
  setHint(els.wipeTenantHint, "");

  const tenantId = state.wipeTenantId || String(els.wipeTenantSelect?.value || "");
  if (!tenantId) {
    return setHint(els.wipeTenantHint, "Select a tenant first.", "bad");
  }

  const phrase = wipeTenantPhrase(tenantId);
  const confirm = String(els.wipeTenantConfirm?.value || "").trim();
  const password = String(els.wipeTenantPassword?.value || "").trim();

  if (confirm !== phrase) {
    return setHint(els.wipeTenantHint, `Type "${phrase}" to confirm.`, "bad");
  }
  if (!password) {
    return setHint(els.wipeTenantHint, "Password is required.", "bad");
  }

  const proceed = window.confirm(
    "This will permanently delete ALL data and staff accounts for this tenant. This cannot be undone."
  );
  if (!proceed) return;

  if (els.wipeTenantBtn) els.wipeTenantBtn.disabled = true;
  setHint(els.wipeTenantHint, "Wiping...");
  try {
    await apiFetch(`/admin/tenants/${tenantId}/wipe`, {
      method: "POST",
      body: { confirm, password },
    });
    setHint(els.wipeTenantHint, "Tenant data wiped.");
    if (els.wipeTenantConfirm) els.wipeTenantConfirm.value = "";
    if (els.wipeTenantPassword) els.wipeTenantPassword.value = "";
    await loadTenants();
    await refreshOrders();
  } catch (err) {
    setHint(els.wipeTenantHint, err.message || "Wipe failed", "bad");
  } finally {
    if (els.wipeTenantBtn) els.wipeTenantBtn.disabled = false;
  }
}

if (els.wipeTenantBtn) {
  els.wipeTenantBtn.addEventListener("click", () => wipeTenantData().catch((e) => setHint(els.wipeTenantHint, e.message, "bad")));
}

// --------------------
// Orders
// --------------------

async function loadOwnerAddress() {
  const tenantId = String(els.ordersTenantFilter.value || "");
  if (!tenantId) {
    els.ownerAddressInput.value = "";
    return;
  }
  try {
    const data = await apiFetch("/purchase-orders/owner-address", { query: { tenantId } });
    els.ownerAddressInput.value = data.ownerBtcAddress || "";
  } catch (err) {
    console.error(err);
  }
}

async function saveOwnerAddress() {
  const tenantId = String(els.ordersTenantFilter.value || "");
  if (!tenantId) return alert("Select a tenant first.");
  const ownerBtcAddress = String(els.ownerAddressInput.value || "").trim();
  await apiFetch("/purchase-orders/owner-address", {
    method: "POST",
    body: { tenantId, ownerBtcAddress },
  });
  setHint(els.ordersHint, "Owner BTC address saved.");
}

els.ordersTenantFilter.addEventListener("change", async () => {
  await loadOwnerAddress();
  await refreshOrders();
});

els.ownerAddressSave.addEventListener("click", () => saveOwnerAddress().catch((e) => alert(e.message || "Save failed")));
els.ordersRefresh.addEventListener("click", () => refreshOrders().catch((e) => console.error(e)));

function renderOrders(orders) {
  els.ordersTable.innerHTML = "";
  if (!orders.length) {
    els.ordersTable.innerHTML = `<div class="hint">No orders.</div>`;
    return;
  }

  for (const o of orders) {
    const row = document.createElement("div");
    row.className = "table-row";
    row.innerHTML = `
      <div class="table-row-header">
        <div>
          <div><strong>#${o.id}</strong> <span class="status-pill">${htmlEscape(o.status || "")}</span></div>
          <div class="small">Tenant: <span class="mono">${htmlEscape(o.tenantId || "")}</span></div>
        </div>
        <div class="inline-actions">
          <button class="btn ghost" data-action="po-approve" data-id="${o.id}">Approve</button>
          <button class="btn ghost" data-action="po-mark-credited" data-id="${o.id}">Mark credited</button>
          <button class="btn ghost" data-action="po-ack" data-id="${o.id}">Acknowledge</button>
        </div>
      </div>
      <div class="order-meta">
        <div><span class="mono">Requested by:</span> ${htmlEscape(o.requestedBy || "")}</div>
        <div><span class="mono">Amounts:</span> ${o.funAmount} FUN -> ${o.btcAmount} BTC @ ${o.btcRate || "n/a"}</div>
        <div><span class="mono">Owner wallet:</span> ${htmlEscape(o.ownerBtcAddress || "")}</div>
        <div><span class="mono">Note:</span> ${htmlEscape(o.note || "")}</div>
      </div>
    `;
    els.ordersTable.appendChild(row);
  }
}

async function refreshOrders() {
  setHint(els.ordersHint, "Loading...");
  const tenantId = String(els.ordersTenantFilter.value || "");
  const data = await apiFetch("/purchase-orders", { query: { tenantId } });
  const orders = data.orders || [];
  renderOrders(orders);
  setHint(els.ordersHint, `Loaded ${orders.length} orders.`);
}

els.ordersTable.addEventListener("click", async (e) => {
  const btn = e.target?.closest("button");
  if (!btn) return;
  const action = btn.getAttribute("data-action");
  const id = btn.getAttribute("data-id");
  if (!action || !id) return;

  try {
    if (action === "po-approve") {
      const tenantId = String(els.ordersTenantFilter.value || "");
      const ownerBtcAddress = String(els.ownerAddressInput.value || "").trim();
      if (!ownerBtcAddress) return alert("Owner BTC address required (set it above).");
      await apiFetch(`/purchase-orders/${id}/approve`, { method: "POST", body: { tenantId, ownerBtcAddress } });
    }

    if (action === "po-mark-credited") {
      await apiFetch(`/purchase-orders/${id}/mark-credited`, { method: "POST", body: { note: "Credited" } });
    }

    if (action === "po-ack") {
      await apiFetch(`/purchase-orders/${id}/acknowledge`, { method: "POST", body: { note: "Acknowledged" } });
    }

    await refreshOrders();
  } catch (err) {
    alert(err.message || "Action failed");
  }
});

function startOrdersAuto() {
  if (!ORDERS_POLL_MS) return;
  if (state.ordersTimer) return;
  state.ordersTimer = setInterval(() => {
    refreshOrders().catch(() => {});
  }, ORDERS_POLL_MS);
  state.ordersAuto = true;
  els.ordersAutoToggle.textContent = "Auto ✓";
}

function stopOrdersAuto() {
  if (state.ordersTimer) {
    clearInterval(state.ordersTimer);
    state.ordersTimer = null;
  }
  state.ordersAuto = false;
  if (els.ordersAutoToggle) els.ordersAutoToggle.textContent = "Auto";
}

els.ordersAutoToggle.addEventListener("click", () => {
  if (state.ordersAuto) stopOrdersAuto();
  else startOrdersAuto();
});

// --------------------
// System reset
// --------------------

async function wipeAllTenants() {
  setHint(els.wipeAllHint, "");

  const confirm = String(els.wipeAllConfirm?.value || "").trim();
  const password = String(els.wipeAllPassword?.value || "").trim();

  if (confirm !== WIPE_ALL_PHRASE) {
    return setHint(els.wipeAllHint, `Type "${WIPE_ALL_PHRASE}" to confirm.`, "bad");
  }
  if (!password) {
    return setHint(els.wipeAllHint, "Password is required.", "bad");
  }

  const proceed = window.confirm(
    "This will permanently delete ALL tenant data and staff accounts across all tenants. This cannot be undone."
  );
  if (!proceed) return;

  if (els.wipeAllBtn) els.wipeAllBtn.disabled = true;
  setHint(els.wipeAllHint, "Wiping...");
  try {
    await apiFetch("/owner/wipe-all", {
      method: "POST",
      body: { confirm, password },
    });
    setHint(els.wipeAllHint, "All tenant data wiped.");
    if (els.wipeAllConfirm) els.wipeAllConfirm.value = "";
    if (els.wipeAllPassword) els.wipeAllPassword.value = "";
    await loadTenants();
    await refreshOrders();
  } catch (err) {
    setHint(els.wipeAllHint, err.message || "Wipe failed", "bad");
  } finally {
    if (els.wipeAllBtn) els.wipeAllBtn.disabled = false;
  }
}

if (els.wipeAllBtn) {
  els.wipeAllBtn.addEventListener("click", () => wipeAllTenants().catch((e) => setHint(els.wipeAllHint, e.message, "bad")));
}

async function refreshAll() {
  await Promise.allSettled([loadBrand(), loadSystemConfig(), loadTenants()]);
  await loadOwnerAddress();
  await refreshOrders();
  // Preload configs for visible tenant rows (lazy: only first 4)
  for (const t of state.tenants.slice(0, 4)) {
    refreshTenantConfig(t.id);
  }
}

// --------------------
// Boot
// --------------------

(function init() {
  document.body.classList.add("login-active");

  const stored = loadAuth();
  if (stored?.token) {
    state.token = stored.token;
    state.staff = stored.staff || null;
    showConsole();
    refreshAll().catch((e) => {
      console.error(e);
      // token likely invalid
      clearAuth();
      state.token = null;
      state.staff = null;
      showLogin();
    });
    return;
  }

  showLogin();
})();
