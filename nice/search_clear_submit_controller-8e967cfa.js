import { Controller } from "@hotwired/stimulus";

// GET filter search clear: custom clear submits the form; omit blank `q` from the URL.
// Used on Matches and Monitors filter forms.
export default class extends Controller {
  static targets = ["input", "clear"];

  connect() {
    this._onSubmitEnd = () => this._restoreName();
    this.element.addEventListener("turbo:submit-end", this._onSubmitEnd);
    this._syncClear();
  }

  disconnect() {
    this.element.removeEventListener("turbo:submit-end", this._onSubmitEnd);
    this._restoreName();
  }

  onInput() {
    this._syncClear();
  }

  clear(event) {
    event?.preventDefault();
    this.inputTarget.value = "";
    this._syncClear();
    this.element.requestSubmit();
  }

  omitBlankSearch() {
    if (this.hasInputTarget && !this.inputTarget.value.trim()) {
      this.inputTarget.removeAttribute("name");
    }
  }

  _syncClear() {
    if (!this.hasClearTarget) return;
    this.clearTarget.hidden = this.inputTarget.value.trim() === "";
  }

  _restoreName() {
    if (this.hasInputTarget && !this.inputTarget.name) {
      this.inputTarget.setAttribute("name", "q");
    }
  }
}
