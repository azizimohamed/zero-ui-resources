const SYNC_PREFIX = "cb_push_sync:";
let cachedVapidKey = null;

function sameApplicationServerKey(subscription, expected) {
  const current = new Uint8Array(subscription.options?.applicationServerKey || []);
  if (current.length !== expected.length) return false;
  return current.every((byte, index) => byte === expected[index]);
}

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i);
  return output;
}

function csrfToken(explicit) {
  return (
    explicit ||
    document.querySelector('meta[name="csrf-token"]')?.content ||
    document.querySelector("[data-support-chat-target='csrf']")?.dataset?.token ||
    ""
  );
}

function pushOwnerKey(explicit) {
  if (explicit) return String(explicit);
  const widget = document.querySelector("[data-controller~='support-chat']");
  if (widget?.dataset?.supportChatPushOwnerValue) {
    return widget.dataset.supportChatPushOwnerValue;
  }
  return "guest";
}

function pushSyncKey(endpoint, ownerKey) {
  return `${SYNC_PREFIX}${ownerKey}:${endpoint.slice(-48)}`;
}

function pushAlreadySynced(endpoint, ownerKey) {
  try {
    return sessionStorage.getItem(pushSyncKey(endpoint, ownerKey)) === "1";
  } catch {
    return false;
  }
}

function markPushSynced(endpoint, ownerKey) {
  try {
    sessionStorage.setItem(pushSyncKey(endpoint, ownerKey), "1");
  } catch {
    // Private mode / quota: next paint may re-POST; server upsert is idempotent.
  }
}

async function fetchVapidPublicKey(url) {
  if (cachedVapidKey) return cachedVapidKey;

  const keyRes = await fetch(`${url}/vapid_public_key`, {
    headers: { Accept: "application/json" },
    credentials: "same-origin",
  });
  if (!keyRes.ok) return null;
  const { public_key: publicKey } = await keyRes.json();
  if (!publicKey) return null;

  cachedVapidKey = publicKey;
  return publicKey;
}

export async function subscribeSupportPush(url, { csrf, ownerKey } = {}) {
  if (!url || !("serviceWorker" in navigator) || !("PushManager" in window)) return false;

  const owner = pushOwnerKey(ownerKey);
  const reg = await navigator.serviceWorker.ready;
  const publicKey = await fetchVapidPublicKey(url);
  if (!publicKey) return false;

  const applicationServerKey = urlBase64ToUint8Array(publicKey);
  let subscription = await reg.pushManager.getSubscription();
  if (subscription && !sameApplicationServerKey(subscription, applicationServerKey)) {
    await subscription.unsubscribe();
    subscription = null;
  }
  const hadSubscription = Boolean(subscription);
  if (!subscription) {
    subscription = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey,
    });
  }

  if (hadSubscription && pushAlreadySynced(subscription.endpoint, owner)) {
    return true;
  }

  const token = csrfToken(csrf);
  const body = JSON.stringify(subscription.toJSON());
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "X-CSRF-Token": token,
    },
    credentials: "same-origin",
    body,
  });
  if (res.ok) markPushSynced(subscription.endpoint, owner);
  return res.ok;
}

export async function unsubscribeSupportPush(url, { csrf } = {}) {
  if (!url || !("serviceWorker" in navigator)) return false;
  const reg = await navigator.serviceWorker.ready;
  const subscription = await reg.pushManager.getSubscription();
  if (!subscription) return true;

  await fetch(url, {
    method: "DELETE",
    headers: {
      Accept: "application/json",
      "X-CSRF-Token": csrfToken(csrf),
      "Content-Type": "application/json",
    },
    credentials: "same-origin",
    body: JSON.stringify({ endpoint: subscription.endpoint }),
  }).catch(() => {});

  try {
    sessionStorage.removeItem(pushSyncKey(subscription.endpoint, pushOwnerKey()));
  } catch {
    // ignore
  }

  return subscription.unsubscribe();
}
