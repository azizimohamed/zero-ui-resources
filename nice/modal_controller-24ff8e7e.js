import { Controller } from "@hotwired/stimulus";
import { lockScroll, unlockScroll } from "lib/scroll_lock";

// Shared <dialog> wrapper (Ui::ModalComponent, match sheet, product-hub lightbox).
export default class extends Controller {
  static targets = ["dialog"];

  connect() {
    if (!this.hasDialogTarget) return;
    this.boundBackdropClose = (e) => {
      if (e.target === this.dialogTarget) this.close();
    };
    this.boundNativeClose = () => {
      unlockScroll(this);
    };
    this.dialogTarget.addEventListener("click", this.boundBackdropClose);
    this.dialogTarget.addEventListener("close", this.boundNativeClose);
  }

  disconnect() {
    if (!this.hasDialogTarget) return;
    this.dialogTarget.removeEventListener("click", this.boundBackdropClose);
    this.dialogTarget.removeEventListener("close", this.boundNativeClose);
    // Turbo can remove an open <dialog> without firing "close" (e.g. Edit / Snapshot).
    if (this.dialogTarget.open) {
      this.dialogTarget.close();
    }
    unlockScroll(this);
  }

  open(e) {
    if (e) e.preventDefault();
    const dialog = this.dialogElement(e);
    if (!dialog) return;
    lockScroll(this);
    dialog.showModal();
  }

  close(e) {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    const dialog = this.hasDialogTarget ? this.dialogTarget : this.dialogElement(e);
    if (!dialog?.open) return;
    dialog.close();
  }

  dialogElement(e) {
    if (this.hasDialogTarget) return this.dialogTarget;
    const id = e?.currentTarget?.getAttribute?.("aria-controls");
    return id ? document.getElementById(id) : null;
  }
}
