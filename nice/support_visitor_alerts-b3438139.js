import { playSupportChime, unlockSupportChime } from "lib/support_chime";

const STORAGE_KEY = "crawlbench:support-visitor-alerts";
const seenTags = new Set();

export function visitorAlertsEnabled() {
  try {
    if (window.localStorage.getItem(STORAGE_KEY) !== "1") return false;
  } catch (_) {
    return false;
  }
  if (!("Notification" in window)) return false;
  return Notification.permission === "granted";
}

export function visitorAlertsOffered() {
  if (!window.isSecureContext) return false;
  if (!("Notification" in window)) return false;
  if (Notification.permission === "denied") {
    return false;
  }
  return !visitorAlertsEnabled();
}

export function visitorAlertsBlocked() {
  return window.isSecureContext && "Notification" in window && Notification.permission === "denied";
}

export function enableVisitorAlerts() {
  unlockSupportChime();

  return new Promise((resolve) => {
    if (!window.isSecureContext || !("Notification" in window)) {
      resolve({ ok: false, reason: "unsupported" });
      return;
    }

    let settled = false;
    const finish = (permission) => {
      if (settled) return;
      settled = true;

      if (permission !== "granted") {
        resolve({ ok: false, reason: permission || "default" });
        return;
      }

      try {
        window.localStorage.setItem(STORAGE_KEY, "1");
      } catch (_) {
        resolve({ ok: false, reason: "storage" });
        return;
      }

      showVisitorNotification({
        title: "Crawlbench support",
        body: "We'll notify you when someone replies.",
        tag: "support-visitor-enabled",
      });

      resolve({ ok: true, reason: "granted" });
    };

    if (Notification.permission === "granted") {
      finish("granted");
      return;
    }

    // Keep requestPermission on the user-gesture stack. Support both the
    // promise API and the older callback form (and guard double-settle).
    try {
      const result = Notification.requestPermission(finish);
      if (result && typeof result.then === "function") {
        result.then(finish).catch(() => finish("denied"));
      }
    } catch (_) {
      finish("error");
    }
  });
}

export function notifyVisitorReply({ title, body, onClick, tag, url } = {}) {
  if (!visitorAlertsEnabled()) return;
  if (!("Notification" in window) || Notification.permission !== "granted") return;

  const noteTag = tag || "support-visitor-reply";
  if (seenTags.has(noteTag)) return;
  seenTags.add(noteTag);
  window.setTimeout(() => seenTags.delete(noteTag), 30_000);

  showVisitorNotification({
    title: title || "Crawlbench support",
    body: body || "You have a new reply.",
    tag: noteTag,
    url: url || `${window.location.pathname}${window.location.search}#support-chat`,
    onClick,
  });
}

async function showVisitorNotification({ title, body, tag, url, onClick }) {
  const payload = {
    body,
    tag,
    renotify: true,
    data: { url },
  };

  try {
    if ("serviceWorker" in navigator) {
      const reg = await navigator.serviceWorker.ready;
      if (reg?.showNotification) {
        await reg.showNotification(title, payload);
        return;
      }
    }

    const note = new Notification(title, payload);
    note.onclick = () => {
      window.focus();
      onClick?.();
      if (url) window.location.hash = "support-chat";
      note.close();
    };
  } catch (_) {
    // Chime / launcher nudge still ran from the caller.
  }
}
