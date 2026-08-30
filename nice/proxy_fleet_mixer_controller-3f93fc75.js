import { Controller } from "@hotwired/stimulus";

// Debounced weight PATCH from inline proxy desk row controls (Turbo Stream response).
export default class extends Controller {
  static targets = ["weight", "form"];
  static values = { debounceMs: { type: Number, default: 350 } };

  connect() {
    this._timer = null;
    this._saving = false;
    this._pending = false;
  }

  disconnect() {
    this._clearTimer();
  }

  adjust(event) {
    event.preventDefault();
    event.stopPropagation();

    const delta = Number.parseInt(event.currentTarget.dataset.delta, 10);
    if (!this.hasWeightTarget || !Number.isFinite(delta)) return;

    const next = Math.max(1, (Number.parseInt(this.weightTarget.value, 10) || 1) + delta);
    this.weightTarget.value = String(next);
    this.queueSave();
  }

  queueSave() {
    this._pending = true;
    this._clearTimer();
    this._timer = window.setTimeout(() => this.submitForm(), this.debounceMsValue);
  }

  submitForm() {
    if (!this._pending || !this.hasFormTarget) return;

    if (this._saving) return;

    if (!this.formTarget.reportValidity()) {
      this._pending = false;
      return;
    }

    this._saving = true;
    this._pending = false;
    this.formTarget.requestSubmit();
  }

  saved(event) {
    this._saving = false;
    if (!event.detail?.success) return;

    if (this._pending) {
      this.submitForm();
    }
  }

  stopNav(event) {
    event.stopPropagation();
  }

  _clearTimer() {
    if (this._timer) {
      window.clearTimeout(this._timer);
      this._timer = null;
    }
  }
}
