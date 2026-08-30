import { Controller } from "@hotwired/stimulus";
import { playSupportChime, nudgeSupportElement } from "lib/support_chime";

// In-app toast + chime when a support alert streams in. OS notifications are Web Push
// only (DeliverPushJob); calling Notification.show here duplicated push on every alert.
export default class extends Controller {
  static values = {
    title: String,
    body: String,
    url: String,
    tag: String,
  };

  connect() {
    if (this.#viewingConversation()) {
      this.element.remove();
      return;
    }

    playSupportChime({ urgent: true });
    nudgeSupportElement(this.element);
    nudgeSupportElement(document.getElementById("support_nav_badge"));
    this.timer = window.setTimeout(() => this.dismiss(), 12_000);
  }

  disconnect() {
    if (this.timer) window.clearTimeout(this.timer);
  }

  dismiss() {
    this.element.remove();
  }

  #viewingConversation() {
    if (!this.hasUrlValue || !this.urlValue) return false;
    try {
      const dest = new URL(this.urlValue, window.location.origin);
      return window.location.pathname === dest.pathname;
    } catch {
      return false;
    }
  }
}
