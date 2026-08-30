import { Controller } from "@hotwired/stimulus";

/** Mobile admin user cards: whole-card navigation with press feedback. */
export default class extends Controller {
  static values = { url: String };

  navigate(event) {
    if (event.target.closest("[data-admin-signup-card-ignore]")) return;

    const selection = window.getSelection?.();
    if (selection && !selection.isCollapsed) return;

    event.preventDefault();
    window.Turbo?.visit(this.urlValue);
  }

  press() {
    this.element.classList.add("admin-signup-card--pressed");
  }

  release() {
    this.element.classList.remove("admin-signup-card--pressed");
  }
}
