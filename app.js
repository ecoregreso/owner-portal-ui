const config = window.OWNER_PORTAL_CONFIG || {};
const API_BASE = config.apiBase || "https://playtimeusa-backend-v2.onrender.com";
const TOKEN_KEY = "ptu_owner_token";

const statusBadge = document.getElementById("statusBadge");
const logoutBtn = document.getElementById("logoutBtn");
const hero = document.getElementById("hero");
const loginCard = document.getElementById("loginCard");
const loginForm = document.getElementById("loginForm");
const loginError = document.getElementById("loginError");
const loginSubmit = document.getElementById("loginSubmit");
const consoleSection = document.getElementById("console");
const brandEditor = document.getElementById("brandEditor");
const brandHint = document.getElementById("brandHint");
const brandRefresh = document.getElementById("brandRefresh");
const brandSave = document.getElementById("brandSave");

const tenantsRefresh = document.getElementById("tenantsRefresh");
const tenantsTable = document.getElementById("tenantsTable");
const tenantCreateForm = document.getElementById("tenantCreateForm");
const tenantDistributor = document.getElementById("tenantDistributor");

const distributorsRefresh = document.getElementById("distributorsRefresh");
const distributorsTable = document.getElementById("distributorsTable");
const distributorCreateForm = document.getElementById("distributorCreateForm");

const ordersRefresh = document.getElementById("ordersRefresh");
const ordersTable = document.getElementById("ordersTable");
const ordersHint = document.getElementById("ordersHint");
const ordersTenantFilter = document.getElementById("ordersTenantFilter");
const ownerAddressInput = document.getElementById("ownerAddressInput");
const ownerAddressSave = document.getElementById("ownerAddressSave");

let authToken = localStorage.getItem(TOKEN_KEY) || "";
let tenantsCache = [];
let distributorsCache = [];
let ordersCache = [];
let selectedTenantId = "all";
let loginSubmitting = false;

function setStatus(text, ok) {
  statusBadge.textContent = text;
  statusBadge.style.color = ok ? "var(--accent)" : "var(--danger)";
  statusBadge.style.borderColor = ok ? "var(--accent-soft)" : "rgba(255, 71, 97, 0.4)";
}

function setAuthed(isAuthed) {
  loginCard.hidden = isAuthed;
  consoleSection.hidden = !isAuthed;
  if (hero) hero.hidden = !isAuthed;
  document.body.classList.toggle("login-active", !isAuthed);
  if (logoutBtn) logoutBtn.hidden = !isAuthed;
  setStatus(isAuthed ? "Connected" : "Disconnected", isAuthed);
}

async function apiFetch(path, options = {}) {
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
  };
  if (authToken) {
    headers.Authorization = `Bearer ${authToken}`;
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }

  if (!response.ok) {
    const message = data?.error || data?.message || `Request failed (${response.status})`;
    throw new Error(message);
  }

  return data;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatAmount(value, digits = 2) {
  const num = Number(value);
  if (!Number.isFinite(num)) return "0";
  return num.toFixed(digits);
}

function formatCents(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return "0.00";
  return formatAmount(num / 100);
}

function formatDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString();
}

function tenantNameById(id) {
  const tenant = tenantsCache.find((t) => t.id === id);
  return tenant ? tenant.name : "Unknown";
}

function distributorNameById(id) {
  if (!id) return "Unassigned";
  const distributor = distributorsCache.find((d) => d.id === id);
  return distributor ? distributor.name : "Unassigned";
}

function renderTenantOptions() {
  if (!ordersTenantFilter) return;
  ordersTenantFilter.innerHTML = "";
  const allOption = document.createElement("option");
  allOption.value = "all";
  allOption.textContent = "All tenants";
  ordersTenantFilter.appendChild(allOption);

  tenantsCache.forEach((tenant) => {
    const option = document.createElement("option");
    option.value = tenant.id;
    option.textContent = tenant.name;
    ordersTenantFilter.appendChild(option);
  });

  ordersTenantFilter.value = selectedTenantId;
}

function renderDistributorOptions() {
  if (!tenantDistributor) return;
  tenantDistributor.innerHTML = "";

  const emptyOption = document.createElement("option");
  emptyOption.value = "";
  emptyOption.textContent = "None";
  tenantDistributor.appendChild(emptyOption);

  distributorsCache.forEach((distributor) => {
    const option = document.createElement("option");
    option.value = distributor.id;
    option.textContent = distributor.name;
    tenantDistributor.appendChild(option);
  });
}

async function loadBrand() {
  brandHint.textContent = "";
  try {
    const res = await apiFetch("/api/v1/owner/brand");
    const payload = res?.brand || {};
    brandEditor.value = JSON.stringify(payload, null, 2);
  } catch (err) {
    brandHint.textContent = err.message;
  }
}

async function saveBrand() {
  brandHint.textContent = "";
  let parsed;
  try {
    parsed = JSON.parse(brandEditor.value || "{}");
  } catch {
    brandHint.textContent = "Brand JSON is invalid.";
    return;
  }

  try {
    await apiFetch("/api/v1/owner/brand", {
      method: "POST",
      body: JSON.stringify({ brand: parsed }),
    });
    brandHint.textContent = "Brand saved.";
  } catch (err) {
    brandHint.textContent = err.message;
  }
}

function renderTenants(tenants = []) {
  tenantsTable.innerHTML = "";
  if (!tenants.length) {
    tenantsTable.innerHTML = "<div class=\"hint\">No tenants yet.</div>";
    return;
  }

  tenants.forEach((tenant) => {
    const wallet = tenant.TenantWallets?.[0] || {};
    const pool = tenant.TenantVoucherPools?.[0] || {};
    const distributorLabel = tenant.Distributor?.name || distributorNameById(tenant.distributorId);
    const statusLabel = tenant.status || "active";
    const row = document.createElement("div");
    row.className = "table-row";
    row.innerHTML = `
      <div class="tenant-meta">
        <div class="tenant-name">
          <strong>${escapeHtml(tenant.name)}</strong>
          <span class="status-pill">${escapeHtml(statusLabel)}</span>
        </div>
        <div class="tenant-labels">
          <span class="hint">Distributor: ${escapeHtml(distributorLabel)}</span>
        </div>
        <div class="tenant-balance">
          Wallet: ${escapeHtml(formatCents(wallet.balanceCents))} FUN • Voucher pool:
          ${escapeHtml(formatCents(pool.poolBalanceCents))} FUN
        </div>
        <div class="hint">${escapeHtml(tenant.id)}</div>
      </div>
      <div class="row-actions">
        <label>
          Issue credits (FUN)
          <input type="number" min="0" step="0.01" data-action="credits" data-tenant="${escapeHtml(tenant.id)}" />
        </label>
        <label>
          Add to voucher pool (FUN)
          <input type="number" min="0" step="0.01" data-action="pool" data-tenant="${escapeHtml(tenant.id)}" />
        </label>
        <label>
          Memo
          <input type="text" placeholder="Optional" data-action="memo" data-tenant="${escapeHtml(tenant.id)}" />
        </label>
        <button class="btn ghost" data-action="issue" data-tenant="${escapeHtml(tenant.id)}">Apply</button>
      </div>
    `;
    tenantsTable.appendChild(row);
  });
}

async function loadTenants() {
  try {
    const res = await apiFetch("/api/v1/owner/tenants");
    tenantsCache = res?.tenants || [];
    renderTenants(tenantsCache);
    renderTenantOptions();
  } catch (err) {
    tenantsTable.innerHTML = `<div class=\"hint\">${escapeHtml(err.message)}</div>`;
  }
}

function renderDistributors(distributors = []) {
  distributorsTable.innerHTML = "";
  if (!distributors.length) {
    distributorsTable.innerHTML = "<div class=\"hint\">No distributors yet.</div>";
    return;
  }

  distributors.forEach((distributor) => {
    const row = document.createElement("div");
    row.className = "table-row";
    row.innerHTML = `
      <div>
        <strong>${escapeHtml(distributor.name)}</strong>
        <div class="hint">${escapeHtml(distributor.id)}</div>
      </div>
    `;
    distributorsTable.appendChild(row);
  });
}

async function loadDistributors() {
  try {
    const res = await apiFetch("/api/v1/owner/distributors");
    distributorsCache = res?.distributors || [];
    renderDistributors(distributorsCache);
    renderDistributorOptions();
    if (tenantsCache.length) {
      renderTenants(tenantsCache);
    }
  } catch (err) {
    distributorsTable.innerHTML = `<div class=\"hint\">${escapeHtml(err.message)}</div>`;
  }
}

function toCents(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  return Math.round(num * 100);
}

async function issueTenantFunds(tenantId, credits, pool, memo) {
  if (credits > 0) {
    await apiFetch(`/api/v1/owner/tenants/${tenantId}/credits`, {
      method: "POST",
      body: JSON.stringify({ amountCents: credits, memo }),
    });
  }

  if (pool > 0) {
    await apiFetch(`/api/v1/owner/tenants/${tenantId}/voucher-pool`, {
      method: "POST",
      body: JSON.stringify({ amountCents: pool, memo }),
    });
  }
}

async function loadOwnerAddress(tenantId) {
  if (!tenantId || tenantId === "all") {
    ownerAddressInput.value = "";
    return;
  }
  try {
    const res = await apiFetch(`/api/v1/purchase-orders/owner-address?tenantId=${encodeURIComponent(tenantId)}`);
    ownerAddressInput.value = res?.ownerBtcAddress || "";
  } catch (err) {
    ordersHint.textContent = err.message;
  }
}

async function saveOwnerAddress() {
  const tenantId = selectedTenantId;
  if (!tenantId || tenantId === "all") {
    ordersHint.textContent = "Select a tenant before saving the owner address.";
    return;
  }
  const ownerBtcAddress = ownerAddressInput.value.trim();
  try {
    await apiFetch("/api/v1/purchase-orders/owner-address", {
      method: "POST",
      body: JSON.stringify({ ownerBtcAddress, tenantId }),
    });
    ordersHint.textContent = "Owner address saved.";
  } catch (err) {
    ordersHint.textContent = err.message;
  }
}

function renderOrders(orders = []) {
  ordersTable.innerHTML = "";
  if (!orders.length) {
    ordersTable.innerHTML = "<div class=\"hint\">No purchase orders yet.</div>";
    return;
  }

  orders.forEach((order) => {
    const row = document.createElement("div");
    row.className = "table-row";
    row.dataset.orderId = order.id;

    const tenantLabel = tenantNameById(order.tenantId);
    const status = order.status || "pending";

    row.innerHTML = `
      <div class="table-row-header">
        <div class="order-meta">
          <strong>Order #${escapeHtml(order.id)}</strong>
          <div class="hint">Tenant: ${escapeHtml(tenantLabel)} • Requested by ${escapeHtml(order.requestedBy)}</div>
          <div class="hint">${escapeHtml(formatDate(order.createdAt))}</div>
        </div>
        <span class="status-pill">${escapeHtml(status)}</span>
      </div>
      <div class="order-actions">
        <button class="btn ghost" data-action="toggle">Details</button>
        <button class="btn primary" data-action="approve">Approve</button>
        <button class="btn ghost" data-action="mark-credited">Mark credited</button>
      </div>
      <div class="order-details" hidden>
        <div class="order-meta">
          <div>FUN: ${escapeHtml(formatAmount(order.funAmount))} • BTC: ${escapeHtml(formatAmount(order.btcAmount, 8))}</div>
          <div>BTC rate: ${escapeHtml(order.btcRate || "-")}</div>
          <div>Confirmation: ${escapeHtml(order.confirmationCode || "-")}</div>
          <div>Owner wallet: ${escapeHtml(order.ownerBtcAddress || "-")}</div>
        </div>
        <label>
          Wallet address for approval
          <input type="text" data-action="approve-address" value="${escapeHtml(order.ownerBtcAddress || ownerAddressInput.value || "")}" />
        </label>
        <div class="order-messages" data-action="messages"></div>
        <label>
          Reply / note
          <textarea rows="3" data-action="message-body" placeholder="Reply to this order"></textarea>
        </label>
        <button class="btn ghost" data-action="send-message">Send message</button>
      </div>
    `;
    ordersTable.appendChild(row);
  });
}

async function loadOrders() {
  ordersHint.textContent = "";
  const tenantId = selectedTenantId && selectedTenantId !== "all" ? selectedTenantId : null;
  const query = tenantId ? `?tenantId=${encodeURIComponent(tenantId)}` : "";
  try {
    const res = await apiFetch(`/api/v1/purchase-orders${query}`);
    ordersCache = res?.orders || [];
    renderOrders(ordersCache);
  } catch (err) {
    ordersTable.innerHTML = `<div class=\"hint\">${escapeHtml(err.message)}</div>`;
  }
}

async function loadOrderMessages(orderId, container) {
  if (!container) return;
  container.innerHTML = "<div class=\"message-entry\">Loading messages...</div>";
  try {
    const res = await apiFetch(`/api/v1/purchase-orders/${orderId}/messages`);
    const messages = res?.messages || [];
    if (!messages.length) {
      container.innerHTML = "<div class=\"message-entry\">No messages yet.</div>";
      return;
    }
    container.innerHTML = messages
      .map(
        (m) =>
          `<div class=\"message-entry\"><strong>${escapeHtml(m.sender || "staff")}:</strong> ${escapeHtml(
            m.body || ""
          )} <span class=\"hint\">${escapeHtml(formatDate(m.createdAt))}</span></div>`
      )
      .join("");
  } catch (err) {
    container.innerHTML = `<div class=\"message-entry\">${escapeHtml(err.message)}</div>`;
  }
}

async function approveOrder(orderId, address) {
  await apiFetch(`/api/v1/purchase-orders/${orderId}/approve`, {
    method: "POST",
    body: JSON.stringify({ ownerBtcAddress: address }),
  });
}

async function markCredited(orderId) {
  await apiFetch(`/api/v1/purchase-orders/${orderId}/mark-credited`, {
    method: "POST",
    body: JSON.stringify({ note: "Credited from owner portal" }),
  });
}

async function sendOrderMessage(orderId, body) {
  await apiFetch(`/api/v1/purchase-orders/${orderId}/messages`, {
    method: "POST",
    body: JSON.stringify({ body }),
  });
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (loginSubmitting) return;
  loginError.textContent = "";

  const username = document.getElementById("loginUsername").value.trim();
  const password = document.getElementById("loginPassword").value;
  if (!username || !password) {
    loginError.textContent = "Username and password are required.";
    return;
  }

  try {
    loginSubmitting = true;
    if (loginSubmit) {
      loginSubmit.disabled = true;
      loginSubmit.value = "Logging in...";
    }
    const res = await apiFetch("/api/v1/staff/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    });
    const token = res?.token || res?.tokens?.accessToken;
    if (!token) throw new Error("Invalid login response");
    authToken = token;
    localStorage.setItem(TOKEN_KEY, token);
    setAuthed(true);
    await loadDistributors();
    await loadTenants();
    await Promise.all([loadBrand(), loadOrders()]);
  } catch (err) {
    loginError.textContent = err.message;
  } finally {
    loginSubmitting = false;
    if (loginSubmit) {
      loginSubmit.disabled = false;
      loginSubmit.value = "Login";
    }
  }
});

if (logoutBtn) {
  logoutBtn.addEventListener("click", () => {
    authToken = "";
    localStorage.removeItem(TOKEN_KEY);
    setAuthed(false);
  });
}

brandRefresh.addEventListener("click", loadBrand);
brandSave.addEventListener("click", saveBrand);
tenantsRefresh.addEventListener("click", loadTenants);

tenantCreateForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const name = document.getElementById("tenantName").value.trim();
  const status = document.getElementById("tenantStatus").value;
  const distributorId = tenantDistributor?.value || null;
  if (!name) return;

  await apiFetch("/api/v1/owner/tenants", {
    method: "POST",
    body: JSON.stringify({ name, status, distributorId }),
  });

  document.getElementById("tenantName").value = "";
  if (tenantDistributor) tenantDistributor.value = "";
  await loadTenants();
});

tenantsTable.addEventListener("click", async (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  if (target.dataset.action !== "issue") return;

  const tenantId = target.dataset.tenant;
  if (!tenantId) return;

  const creditsInput = tenantsTable.querySelector(`input[data-action=\"credits\"][data-tenant=\"${tenantId}\"]`);
  const poolInput = tenantsTable.querySelector(`input[data-action=\"pool\"][data-tenant=\"${tenantId}\"]`);
  const memoInput = tenantsTable.querySelector(`input[data-action=\"memo\"][data-tenant=\"${tenantId}\"]`);

  const creditsCents = toCents(creditsInput?.value || 0) || 0;
  const poolCents = toCents(poolInput?.value || 0) || 0;
  const memo = memoInput?.value || null;

  if (creditsCents <= 0 && poolCents <= 0) {
    alert("Enter a credit or pool amount.");
    return;
  }

  try {
    await issueTenantFunds(tenantId, creditsCents, poolCents, memo);
    if (creditsInput) creditsInput.value = "";
    if (poolInput) poolInput.value = "";
    if (memoInput) memoInput.value = "";
    await loadTenants();
  } catch (err) {
    alert(err.message);
  }
});

distributorsRefresh.addEventListener("click", loadDistributors);

distributorCreateForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const name = document.getElementById("distributorName").value.trim();
  const status = document.getElementById("distributorStatus").value;
  if (!name) return;

  await apiFetch("/api/v1/owner/distributors", {
    method: "POST",
    body: JSON.stringify({ name, status }),
  });

  document.getElementById("distributorName").value = "";
  await loadDistributors();
});

ordersRefresh.addEventListener("click", loadOrders);
ownerAddressSave.addEventListener("click", saveOwnerAddress);

ordersTenantFilter.addEventListener("change", async () => {
  selectedTenantId = ordersTenantFilter.value || "all";
  await loadOwnerAddress(selectedTenantId);
  await loadOrders();
});

ordersTable.addEventListener("click", async (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  const row = target.closest(".table-row");
  if (!row) return;
  const orderId = row.dataset.orderId;
  if (!orderId) return;

  if (target.dataset.action === "toggle") {
    const details = row.querySelector(".order-details");
    if (!details) return;
    const isHidden = details.hasAttribute("hidden");
    if (isHidden) {
      details.removeAttribute("hidden");
      const messagesContainer = details.querySelector('[data-action="messages"]');
      await loadOrderMessages(orderId, messagesContainer);
    } else {
      details.setAttribute("hidden", "");
    }
  }

  if (target.dataset.action === "approve") {
    const addressInput = row.querySelector('[data-action="approve-address"]');
    const address = addressInput ? addressInput.value.trim() : ownerAddressInput.value.trim();
    try {
      await approveOrder(orderId, address);
      await loadOrders();
    } catch (err) {
      alert(err.message);
    }
  }

  if (target.dataset.action === "mark-credited") {
    try {
      await markCredited(orderId);
      await loadOrders();
    } catch (err) {
      alert(err.message);
    }
  }

  if (target.dataset.action === "send-message") {
    const messageInput = row.querySelector('[data-action="message-body"]');
    const body = messageInput ? messageInput.value.trim() : "";
    if (!body) {
      alert("Enter a message.");
      return;
    }
    try {
      await sendOrderMessage(orderId, body);
      if (messageInput) messageInput.value = "";
      const messagesContainer = row.querySelector('[data-action="messages"]');
      await loadOrderMessages(orderId, messagesContainer);
    } catch (err) {
      alert(err.message);
    }
  }
});

setAuthed(!!authToken);
if (authToken) {
  loadDistributors();
  loadTenants().then(() => loadOwnerAddress(selectedTenantId));
  loadBrand();
  loadOrders();
}
