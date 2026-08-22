const API_BASE = "https://cradlechain-backend.onrender.com/api";

export async function getCsrfToken() {
  await fetch(`${API_BASE}/auth/csrf/`, { credentials: "include" });
  const match = document.cookie.match(/csrftoken=([^;]+)/);
  return match ? match[1] : "";
}

async function sendJson(method, path, body) {
  const csrfToken = await getCsrfToken();
  const response = await fetch(`${API_BASE}${path}`, {
    method,
    credentials: "include",
    headers: { "Content-Type": "application/json", "X-CSRFToken": csrfToken },
    body: JSON.stringify(body),
  });
  return { ok: response.ok, status: response.status, body: await response.json() };
}

function postJson(path, body) {
  return sendJson("POST", path, body);
}

export function initBackendAuth() {
  document.getElementById("auth-signup-btn").addEventListener("click", () => submit("/auth/signup/"));
  document.getElementById("auth-login-btn").addEventListener("click", () => submit("/auth/login/"));
  document.getElementById("auth-logout-btn").addEventListener("click", async () => {
    await postJson("/auth/logout/", {});
    showLoggedOut();
  });
  document.getElementById("auth-save-profile-btn").addEventListener("click", async (event) => {
    event.preventDefault();
    const displayName = document.getElementById("auth-display-name").value.trim();
    const isAnonymous = document.getElementById("auth-anon-toggle").checked;
    const { ok, body } = await sendJson("PATCH", "/profile/", { displayName, isAnonymous });
    if (ok) applyProfile(body.displayName, body.isAnonymous);
  });
  restoreSession();
}

function shortAddress(address) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

let sessionAddress = null;

async function submit(path) {
  const email = document.getElementById("auth-email").value.trim();
  const password = document.getElementById("auth-password").value;
  const { ok, body } = await postJson(path, { email, password });
  if (!ok) {
    document.dispatchEvent(new CustomEvent("cradlechain:error", { detail: { code: body.error || "auth-failed" } }));
    return;
  }
  showLoggedIn(body.address, body.isAnonymous, body.displayName || "");
}

async function restoreSession() {
  // Backend may simply not be running (frontend works standalone off the chain) —
  // that's a normal state here, not an error worth surfacing.
  try {
    const csrfToken = await getCsrfToken();
    const response = await fetch(`${API_BASE}/auth/me/`, { credentials: "include", headers: { "X-CSRFToken": csrfToken } });
    if (!response.ok) return;
    const body = await response.json();
    showLoggedIn(body.address, body.isAnonymous, body.displayName || "");
  } catch (error) {
    // no backend reachable — leave the signed-out state as-is
  }
}

// A signed-in donor always sees a short address, never the full 42-char string —
// same anonymity model as the rest of the app (DonorProfile.is_anonymous/display_name).
function showLoggedIn(address, isAnonymous, displayName) {
  sessionAddress = address;
  document.getElementById("auth-forms").hidden = true;
  document.getElementById("auth-session").hidden = false;
  applyProfile(displayName, isAnonymous);
  window.dispatchEvent(new CustomEvent("cradlechain:backend-session", { detail: { address, isAnonymous } }));
}

function applyProfile(displayName, isAnonymous) {
  const shown = !isAnonymous && displayName ? `${displayName} · ${shortAddress(sessionAddress)}` : shortAddress(sessionAddress);
  document.getElementById("auth-session-address").textContent = shown;
  document.getElementById("auth-display-name").value = displayName || "";
  document.getElementById("auth-anon-toggle").checked = isAnonymous;
}

function showLoggedOut() {
  sessionAddress = null;
  document.getElementById("auth-forms").hidden = false;
  document.getElementById("auth-session").hidden = true;
  window.dispatchEvent(new CustomEvent("cradlechain:backend-session", { detail: null }));
}
