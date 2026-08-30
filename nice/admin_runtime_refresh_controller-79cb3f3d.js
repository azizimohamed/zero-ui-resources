import { Controller } from "@hotwired/stimulus";

const STORAGE_KEY = "admin-runtime-auto-refresh";

// Soft Turbo reload for the staff Runtime desk while the tab is visible.
// Samples land every minute; 60s is enough without hammering the desk.
export default class extends Controller {
  static values = {
    interval: { type: Number, default: 60_000 },
    enabled: { type: Boolean, default: true },
  };

  static targets = ["switch", "label"];

  connect() {
    this._timer = null;
    this._onVisibility = () => this.sync();
    this.enabledValue = this.readStoredEnabled();
    this.renderSwitch();
    document.addEventListener("visibilitychange", this._onVisibility);
    this.sync();
  }

  disconnect() {
    this.stop();
    document.removeEventListener("visibilitychange", this._onVisibility);
  }

  toggle(event) {
    event?.preventDefault();
    this.enabledValue = !this.enabledValue;
    this.persist();
    this.renderSwitch();
    this.sync();
  }

  sync() {
    if (!this.enabledValue || document.hidden) {
      this.stop();
      return;
    }
    this.start();
  }

  start() {
    if (this._timer) return;
    this._timer = window.setInterval(() => this.refresh(), this.intervalValue);
  }

  stop() {
    if (!this._timer) return;
    window.clearInterval(this._timer);
    this._timer = null;
  }

  refresh() {
    if (!this.enabledValue || document.hidden) return;

    if (window.Turbo?.visit) {
      window.Turbo.visit(window.location.href, { action: "replace" });
      return;
    }

    window.location.reload();
  }

  readStoredEnabled() {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw === null) return this.enabledValue;
      return raw === "1" || raw === "true";
    } catch {
      return this.enabledValue;
    }
  }

  persist() {
    try {
      window.localStorage.setItem(STORAGE_KEY, this.enabledValue ? "1" : "0");
    } catch {
      // private mode / quota
    }
  }

  renderSwitch() {
    if (this.hasSwitchTarget) {
      this.switchTarget.classList.toggle("on", this.enabledValue);
      this.switchTarget.setAttribute("aria-checked", this.enabledValue ? "true" : "false");
    }
    if (this.hasLabelTarget) {
      this.labelTarget.textContent = this.enabledValue ? "Auto-refresh 60s" : "Auto-refresh off";
    }
  }
}
