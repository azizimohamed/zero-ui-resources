import { Controller } from "@hotwired/stimulus";
import { playSupportChime, unlockSupportChime } from "lib/support_chime";
import { subscribeSupportPush, unsubscribeSupportPush } from "lib/support_push";

const STORAGE_KEY = "crawlbench:support-desk-alerts";
const seenTags = new Set();

// Opt-in browser notifications for the live support desk.
export default class extends Controller {
  static targets = ["label"];
  static values = { pushUrl: String };

  connect() {
    this.#syncLabel();
    if (this.constructor.enabled()) {
      unlockSupportChime();
    }
  }

  enable(event) {
    event?.preventDefault();
    unlockSupportChime();

    if (!("Notification" in window)) {
      // Still keep in-app toasts + chime without the OS API.
      window.localStorage.setItem(STORAGE_KEY, "1");
      this.#syncLabel();
      playSupportChime({ urgent: true });
      window.alert("Desktop notifications are not available here. In-app alerts and sound are on.");
      return;
    }

    const finish = (permission) => {
      if (permission !== "granted") {
        this.#syncLabel();
        if (permission === "denied") {
          window.alert(
            "Notifications are blocked for this site. Allow them in your browser settings, then click Enable alerts again.",
          );
        }
        return;
      }
      window.localStorage.setItem(STORAGE_KEY, "1");
      this.#syncLabel();
      playSupportChime({ urgent: true });
      this.#subscribePush();
      SupportDeskAlertsController.notify(
        "Crawlbench support",
        "Desktop alerts are on for live chat.",
        window.location.pathname,
        "support-desk-enabled",
      );
    };

    if (Notification.permission === "granted") {
      finish("granted");
      return;
    }

    Notification.requestPermission()
      .then(finish)
      .catch(() => this.#syncLabel());
  }

  static enabled() {
    if (window.localStorage.getItem(STORAGE_KEY) !== "1") return false;
    if (!("Notification" in window)) return true;
    return Notification.permission === "granted";
  }

  static notify(title, body, url, tag) {
    playSupportChime({ urgent: true });
    if (!this.enabled()) return;
    if (!("Notification" in window) || Notification.permission !== "granted") return;

    const noteTag = tag || url || title;
    if (seenTags.has(noteTag)) return;
    seenTags.add(noteTag);
    window.setTimeout(() => seenTags.delete(noteTag), 30_000);

    showDeskNotification({ title, body, tag: noteTag, url });
  }

  #syncLabel() {
    if (!this.hasLabelTarget) return;
    this.labelTarget.textContent = this.constructor.enabled() ? "Alerts on" : "Enable alerts";
  }

  #subscribePush() {
    if (!this.hasPushUrlValue || !this.pushUrlValue) return;
    subscribeSupportPush(this.pushUrlValue).catch(() => {});
  }
}

async function showDeskNotification({ title, body, tag, url }) {
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
      if (url) window.location.href = url;
      note.close();
    };
  } catch (_) {
    // Ignore Notification constructor failures; toast + chime still ran.
  }
}
