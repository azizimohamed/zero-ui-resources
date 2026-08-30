import { Controller } from "@hotwired/stimulus";

// Matches filter panel form (desktop Filters popover + mobile Filters sheet).
// Selections stay pending until "Show matches", so chip state and the selected count
// are client-side until submit. Mounted on the form; the count badge lives on the
// panel trigger outside the form, hence the id lookup.
export default class extends Controller {
  static values = { badge: String };

  connect() {
    this._onSubmitEnd = () => this.restoreStripped();
    this.element.addEventListener("turbo:submit-end", this._onSubmitEnd);
    this.refresh();
  }

  disconnect() {
    this.element.removeEventListener("turbo:submit-end", this._onSubmitEnd);
    this.restoreStripped();
  }

  refresh() {
    this.syncChips();
    this.syncBadge();
  }

  syncChips() {
    this.element.querySelectorAll("label.fm__chip, label.fm-assignee__chip").forEach((chip) => {
      chip.classList.toggle("is-on", Boolean(chip.querySelector("input")?.checked));
    });
    this.element.querySelectorAll("label.cchip, label.noise").forEach((chip) => {
      chip.classList.toggle("on", Boolean(chip.querySelector("input")?.checked));
    });
  }

  syncBadge() {
    const badge = this.hasBadgeValue ? document.getElementById(this.badgeValue) : null;
    if (!badge) return;

    const count = this.selectedCount();
    badge.textContent = count > 0 ? String(count) : "";
    badge.hidden = count === 0;
  }

  // Price min/max read as one band; hidden fields carry surrounding scope, not selections.
  selectedCount() {
    let count = 0;
    let bandSet = false;

    this.fields().forEach((field) => {
      if (field.type === "checkbox" || field.type === "radio") {
        if (field.checked && field.value !== "") count += 1;
        return;
      }
      if (field.value.trim() === "") return;
      if (field.name === "price_min" || field.name === "price_max") {
        bandSet = true;
        return;
      }
      count += 1;
    });

    return count + (bandSet ? 1 : 0);
  }

  // Blank price inputs and the "All" comp radio must drop out of the URL entirely.
  stripBlank() {
    this._stripped = this.fields().filter((field) => {
      if (field.value !== "") return false;
      if (field.type === "checkbox" || field.type === "radio") return field.checked;
      return true;
    });
    this._stripped.forEach((field) => {
      field.disabled = true;
    });
  }

  restoreStripped() {
    (this._stripped || []).forEach((field) => {
      field.disabled = false;
    });
    this._stripped = [];
  }

  fields() {
    return [...this.element.querySelectorAll("input, select")].filter(
      (field) => field.type !== "hidden" && field.type !== "submit" && !field.disabled,
    );
  }
}
