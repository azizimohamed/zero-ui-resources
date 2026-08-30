import { Controller } from "@hotwired/stimulus";

// Shows a dirty-state bar when tracked fields diverge from their initial values.
export default class extends Controller {
  static targets = ["field", "bar", "summary"];

  connect() {
    this.initial = new Map();
    this.fieldTargets.forEach((field) => {
      this.initial.set(field, this.valueOf(field));
    });
    this.refresh();
  }

  mark() {
    this.refresh();
  }

  discard(event) {
    event.preventDefault();
    this.fieldTargets.forEach((field) => {
      const value = this.initial.get(field);
      if (value === undefined) return;
      field.value = value;
      field.dispatchEvent(new Event("change", { bubbles: true }));
      field.dispatchEvent(new Event("input", { bubbles: true }));
    });
    this.refresh();
  }

  refresh() {
    const dirtyNames = this.fieldTargets
      .filter((field) => this.valueOf(field) !== this.initial.get(field))
      .map((field) => field.dataset.dirtyLabel || field.name);

    const dirty = dirtyNames.length > 0;
    if (this.hasBarTarget) {
      this.barTarget.hidden = !dirty;
    }
    if (this.hasSummaryTarget && dirty) {
      const labels = [...new Set(dirtyNames)].join(", ");
      this.summaryTarget.innerHTML = `Unsaved changes to <b>${this.escape(labels)}</b>.`;
    }
  }

  valueOf(field) {
    return field.value;
  }

  escape(text) {
    return text
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  }
}
