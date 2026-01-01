const config = window.OWNER_PORTAL_CONFIG || {};
const API_BASE = config.apiBase || "https://playtimeusa-backend-v2.onrender.com";
const TOKEN_KEY = "ptu_owner_token";

const statusBadge = document.getElementById("statusBadge");
const loginCard = document.getElementById("loginCard");
const loginForm = document.getElementById("loginForm");
const loginError = document.getElementById("loginError");
const consoleSection = document.getElementById("console");
const brandEditor = document.getElementById("brandEditor");
const brandHint = document.getElementById("brandHint");
const brandRefresh = document.getElementById("brandRefresh");
const brandSave = document.getElementById("brandSave");
const tenantsRefresh = document.getElementById("tenantsRefresh");
const tenantsTable = document.getElementById("tenantsTable");
const tenantCreateForm = document.getElementById("tenantCreateForm");

let authToken = localStorage.getItem(TOKEN_KEY) || "";

function setStatus(text, ok) {
  statusBadge.textContent = text;
  statusBadge.style.color = ok ? "var(--accent)" : "var(--danger)";
  statusBadge.style.borderColor = ok ? "var(--accent-soft)" : "rgba(255, 71, 97, 0.4)";
}

function setAuthed(isAuthed) {
  loginCard.hidden = isAuthed;
  consoleSection.hidden = !isAuthed;
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
    const row = document.createElement("div");
    row.className = "table-row";
    row.innerHTML = `
      <div>
        <strong>${tenant.name}</strong>
        <div class="hint">${tenant.id}</div>
      </div>
      <div class="row-actions">
        <label>
          Issue credits (FUN)
          <input type="number" min="0" step="0.01" data-action="credits" data-tenant="${tenant.id}" />
        </label>
        <label>
          Add to voucher pool (FUN)
          <input type="number" min="0" step="0.01" data-action="pool" data-tenant="${tenant.id}" />
        </label>
        <label>
          Memo
          <input type="text" placeholder="Optional" data-action="memo" data-tenant="${tenant.id}" />
        </label>
        <button class="btn ghost" data-action="issue" data-tenant="${tenant.id}">Apply</button>
      </div>
    `;
    tenantsTable.appendChild(row);
  });
}

async function loadTenants() {
  try {
    const res = await apiFetch("/api/v1/owner/tenants");
    renderTenants(res?.tenants || []);
  } catch (err) {
    tenantsTable.innerHTML = `<div class=\"hint\">${err.message}</div>`;
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

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  loginError.textContent = "";

  const username = document.getElementById("loginUsername").value.trim();
  const password = document.getElementById("loginPassword").value;
  if (!username || !password) {
    loginError.textContent = "Username and password are required.";
    return;
  }

  try {
    const res = await apiFetch("/api/v1/staff/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    });
    const token = res?.token || res?.tokens?.accessToken;
    if (!token) throw new Error("Invalid login response");
    authToken = token;
    localStorage.setItem(TOKEN_KEY, token);
    setAuthed(true);
    await Promise.all([loadBrand(), loadTenants()]);
  } catch (err) {
    loginError.textContent = err.message;
  }
});

brandRefresh.addEventListener("click", loadBrand);
brandSave.addEventListener("click", saveBrand);
tenantsRefresh.addEventListener("click", loadTenants);

tenantCreateForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const name = document.getElementById("tenantName").value.trim();
  const status = document.getElementById("tenantStatus").value;
  if (!name) return;

  await apiFetch("/api/v1/owner/tenants", {
    method: "POST",
    body: JSON.stringify({ name, status }),
  });

  document.getElementById("tenantName").value = "";
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

setAuthed(!!authToken);
if (authToken) {
  loadBrand();
  loadTenants();
}
