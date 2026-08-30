import { Controller } from "@hotwired/stimulus";

// Mega-dropdown navigation for the public landing page header.
// Triggers carry data-landing-nav-key-param; panels carry data-landing-nav-panel-key.
export default class extends Controller {
  static targets = ["trigger", "panel"];

  connect() {
    this._activeKey = null;
    this._onVisit = () => this._closeAll();
    document.addEventListener("turbo:before-visit", this._onVisit);
  }

  toggle(event) {
    const key = event.params.key;
    if (this._activeKey === key) {
      this._closeAll();
    } else {
      this._closeAll();
      this._openPanel(key);
    }
  }

  _openPanel(key) {
    const trigger = this.triggerTargets.find((t) => t.dataset.landingNavKeyParam === key);
    const panel = this.panelTargets.find((p) => p.dataset.landingNavPanelKey === key);
    if (!trigger || !panel) return;

    trigger.setAttribute("aria-expanded", "true");
    panel.classList.remove("hidden");
    this._activeKey = key;

    document.addEventListener("keydown", this._handleKey);
    document.addEventListener("mousedown", this._handleOutsideClick);
  }

  _closeAll() {
    this.triggerTargets.forEach((t) => t.setAttribute("aria-expanded", "false"));
    this.panelTargets.forEach((p) => p.classList.add("hidden"));
    this._activeKey = null;
    document.removeEventListener("keydown", this._handleKey);
    document.removeEventListener("mousedown", this._handleOutsideClick);
  }

  _handleKey = (event) => {
    if (event.key === "Escape") this._closeAll();
  };

  _handleOutsideClick = (event) => {
    if (!this.element.contains(event.target)) this._closeAll();
  };

  disconnect() {
    document.removeEventListener("turbo:before-visit", this._onVisit);
    this._closeAll();
  }
}
