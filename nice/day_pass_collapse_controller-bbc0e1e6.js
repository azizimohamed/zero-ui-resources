import { Controller } from "@hotwired/stimulus";

const STORAGE_KEY = "crawlbench:day-pass-banner:collapsed";

// Collapses the Day Pass checklist into a one-line strip; preference survives Turbo navigations.
export default class extends Controller {
  static targets = ["toggle", "label"];

  connect() {
    this.apply(this.readCollapsed());
  }

  toggle() {
    this.apply(!this.element.classList.contains("is-collapsed"));
  }

  apply(collapsed) {
    this.element.classList.toggle("is-collapsed", collapsed);

    if (this.hasToggleTarget) {
      const completed = this.toggleTarget.dataset.completed;
      const total = this.toggleTarget.dataset.total;
      const progress = completed && total ? `, ${completed} of ${total} complete` : "";

      this.toggleTarget.setAttribute("aria-expanded", collapsed ? "false" : "true");
      this.toggleTarget.setAttribute(
        "aria-label",
        `${collapsed ? "Show" : "Hide"} Day Pass checklist${progress}`,
      );
    }

    if (this.hasLabelTarget) {
      this.labelTarget.textContent = collapsed ? "Show" : "Hide";
    }

    try {
      localStorage.setItem(STORAGE_KEY, collapsed ? "1" : "0");
    } catch (_error) {
      // Private mode / quota: collapse still works for this page view.
    }
  }

  readCollapsed() {
    try {
      return localStorage.getItem(STORAGE_KEY) !== "0";
    } catch (_error) {
      return true;
    }
  }
}
