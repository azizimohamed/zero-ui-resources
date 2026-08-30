import { Controller } from "@hotwired/stimulus";
import { lockScroll, unlockScroll } from "lib/scroll_lock";

export default class extends Controller {
  static targets = ["dialog", "close"];

  connect() {
    this._onEscape = this.onEscape.bind(this);
  }

  disconnect() {
    document.removeEventListener("keydown", this._onEscape);
    unlockScroll(this);
  }

  open(event) {
    event?.preventDefault();
    if (!this.hasDialogTarget || !this.dialogTarget.hidden) return;

    this.dialogTarget.hidden = false;
    this.dialogTarget.setAttribute("aria-hidden", "false");
    lockScroll(this);
    document.addEventListener("keydown", this._onEscape);

    const focusEl = this.hasCloseTarget ? this.closeTarget : this.dialogTarget;
    focusEl.focus({ preventScroll: true });
  }

  close(event) {
    event?.preventDefault();
    if (!this.hasDialogTarget || this.dialogTarget.hidden) return;

    this.dialogTarget.hidden = true;
    this.dialogTarget.setAttribute("aria-hidden", "true");
    unlockScroll(this);
    document.removeEventListener("keydown", this._onEscape);
  }

  keydown(event) {
    if (event.key !== "Escape") return;
    event.preventDefault();
    this.close();
  }

  onEscape(event) {
    if (event.key !== "Escape") return;
    event.preventDefault();
    this.close();
  }
}
