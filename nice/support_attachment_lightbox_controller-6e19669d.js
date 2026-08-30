import { Controller } from "@hotwired/stimulus";
import { lockScroll, unlockScroll } from "lib/scroll_lock";

// Opens the shared support attachment lightbox (visitor widget + staff desk).
export default class extends Controller {
  static targets = ["dialog", "image"];

  open(event) {
    event.preventDefault();
    const src = event.params.src || event.currentTarget?.dataset?.src;
    if (!src || !this.hasImageTarget || !this.hasDialogTarget) return;

    if (this.imageTarget.src !== src) {
      this.imageTarget.src = src;
    }
    lockScroll(this);
    this.dialogTarget.showModal();
  }

  close() {
    if (!this.hasDialogTarget || !this.dialogTarget.open) return;
    this.dialogTarget.close();
    unlockScroll(this);
  }
}
