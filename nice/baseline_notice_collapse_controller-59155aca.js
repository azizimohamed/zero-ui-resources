import { Controller } from "@hotwired/stimulus";

// Collapses the first-fill tip body; preference is per monitor (public_id).
export default class extends Controller {
  static targets = ["toggle", "label"];

  static values = {
    storageKey: String,
  };

  connect() {
    this.apply(this.readCollapsed());
  }

  toggle() {
    this.apply(!this.element.classList.contains("is-collapsed"));
  }

  apply(collapsed) {
    this.element.classList.toggle("is-collapsed", collapsed);

    if (this.hasToggleTarget) {
      this.toggleTarget.setAttribute("aria-expanded", collapsed ? "false" : "true");
      this.toggleTarget.setAttribute("aria-label", `${collapsed ? "Show" : "Hide"} first fill tip`);
    }

    if (this.hasLabelTarget) {
      this.labelTarget.textContent = collapsed ? "Show" : "Hide";
    }

    try {
      localStorage.setItem(this.storageKeyValue, collapsed ? "1" : "0");
    } catch (_error) {
      // Private mode / quota: collapse still works for this page view.
    }
  }

  readCollapsed() {
    try {
      const stored = localStorage.getItem(this.storageKeyValue);
      if (stored === null) return true;
      return stored === "1";
    } catch (_error) {
      return true;
    }
  }
}
