import { Controller } from "@hotwired/stimulus";

// Live character counter for textarea fields.
export default class extends Controller {
  static targets = ["input", "counter"];
  static values = {
    max: { type: Number, default: 5000 },
    warnAt: { type: Number, default: 4500 },
    warnClass: { type: String, default: "is-warn" },
  };

  connect() {
    this.refresh();
  }

  refresh() {
    if (!this.hasInputTarget || !this.hasCounterTarget) return;
    const len = this.inputTarget.value.length;
    this.counterTarget.textContent = `${len} / ${this.maxValue}`;
    this.counterTarget.classList.toggle(this.warnClassValue, len >= this.warnAtValue);
  }
}
