import { Controller } from "@hotwired/stimulus";

// Live "110,000 mi" readout under the max-mileage number field.
// Warns when the value is below 1000 (common "110" vs "110000" typo).
export default class extends Controller {
  static targets = ["input", "output", "warning"];
  static values = { lowThreshold: { type: Number, default: 1000 } };

  connect() {
    this.refresh();
  }

  refresh() {
    if (!this.hasInputTarget || !this.hasOutputTarget) return;

    const raw = this.inputTarget.value?.toString().trim() ?? "";
    const n = raw ? Number.parseInt(raw.replace(/[^\d]/g, ""), 10) : NaN;
    const valid = Number.isFinite(n) && n > 0;

    if (!valid) {
      this.outputTarget.textContent = "";
      this.outputTarget.hidden = true;
      this.hideWarning();
      return;
    }

    this.outputTarget.textContent = `${n.toLocaleString("en-US")} mi`;
    this.outputTarget.hidden = false;

    if (n < this.lowThresholdValue) {
      this.showWarning(`Looks low. Did you mean ${(n * 1000).toLocaleString("en-US")}?`);
    } else {
      this.hideWarning();
    }
  }

  showWarning(text) {
    if (!this.hasWarningTarget) return;
    this.warningTarget.textContent = text;
    this.warningTarget.hidden = false;
  }

  hideWarning() {
    if (!this.hasWarningTarget) return;
    this.warningTarget.textContent = "";
    this.warningTarget.hidden = true;
  }
}
