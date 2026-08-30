import { Controller } from "@hotwired/stimulus";

/** Blocks Snapshot Card download when the selected cohort is low-sample. */
export default class extends Controller {
  static targets = ["link"];

  guard(event) {
    const el = this.hasLinkTarget ? this.linkTarget : this.element;
    if (el.getAttribute("aria-disabled") !== "true") return;
    event.preventDefault();
    event.stopPropagation();
  }
}
