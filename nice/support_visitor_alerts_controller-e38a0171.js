import { Controller } from "@hotwired/stimulus";
import { playSupportChime, unlockSupportChime } from "lib/support_chime";
import {
  enableVisitorAlerts,
  visitorAlertsEnabled,
  visitorAlertsOffered,
  visitorAlertsBlocked,
} from "lib/support_visitor_alerts";
import { subscribeSupportPush } from "lib/support_push";

// In-panel Desktop alerts tip. Own controller so Turbo frame/stream
// replaces still bind Enable (parent support-chat actions can miss).
export default class extends Controller {
  static values = { url: String, pushUrl: String };

  connect() {
    this.#sync();
    if (visitorAlertsEnabled()) {
      this.#report("on");
      this.#subscribePush();
    } else if (visitorAlertsBlocked()) {
      this.#report("blocked");
    }
  }

  enable(event) {
    event?.preventDefault();
    event?.stopPropagation();
    unlockSupportChime();

    enableVisitorAlerts().then((result) => {
      this.#sync();
      if (result.ok) {
        this.#report("on");
        this.#subscribePush();
        playSupportChime();
        return;
      }

      if (result.reason === "denied") {
        this.#report("blocked");
        window.alert(
          "Notifications are blocked for this site. Allow them in your browser settings, then click Enable again.",
        );
        return;
      }

      if (result.reason === "unsupported") {
        window.alert(
          "Desktop notifications are not available in this browser. You'll still get an in-widget chime when the panel is closed.",
        );
        return;
      }

      if (result.reason === "default") {
        // Prompt dismissed without a choice; leave the tip visible.
        return;
      }

      window.alert("Could not enable desktop alerts. Try again from this chat.");
    });
  }

  #sync() {
    if (visitorAlertsBlocked()) {
      this.element.hidden = false;
      const copy = this.element.querySelector(".sc__notify-copy p");
      if (copy) copy.textContent = "Notifications are blocked in your browser settings.";
      const btn = this.element.querySelector(".sc__notify-btn");
      if (btn) btn.textContent = "Blocked";
      return;
    }
    this.element.hidden = !visitorAlertsOffered();
  }

  #report(state) {
    if (!this.hasUrlValue || !this.urlValue) return;
    if (this._lastReported === state) return;
    this._lastReported = state;

    const token =
      document.querySelector('meta[name="csrf-token"]')?.content ||
      this.element
        .closest("[data-controller~='support-chat']")
        ?.querySelector("[data-support-chat-target='csrf']")?.dataset?.token ||
      "";
    if (!token) return;

    const body = new URLSearchParams({ state });
    fetch(this.urlValue, {
      method: "POST",
      headers: {
        "X-CSRF-Token": token,
        Accept: "text/plain",
        "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
      },
      body,
      credentials: "same-origin",
      keepalive: true,
    }).catch(() => {
      this._lastReported = null;
    });
  }

  #subscribePush() {
    if (!this.hasPushUrlValue || !this.pushUrlValue) return;
    subscribeSupportPush(this.pushUrlValue).catch(() => {});
  }
}
