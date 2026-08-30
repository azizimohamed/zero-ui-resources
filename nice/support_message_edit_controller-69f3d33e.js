import { Controller } from "@hotwired/stimulus";

// Inline edit for own staff bubbles. Reveal Edit when desk viewerId matches authorId.
export default class extends Controller {
  static targets = ["trigger", "form", "body", "input"];
  static values = {
    authorId: Number,
  };

  connect() {
    if (this.hasInputTarget) this.originalBody = this.inputTarget.value;
    this.#syncGate();
  }

  start(event) {
    event?.preventDefault();
    if (!this.hasFormTarget) return;
    this.formTarget.hidden = false;
    if (this.hasBodyTarget) this.bodyTarget.hidden = true;
    if (this.hasTriggerTarget) this.triggerTarget.hidden = true;
    if (this.hasInputTarget) {
      this.inputTarget.focus();
      const len = this.inputTarget.value.length;
      this.inputTarget.setSelectionRange(len, len);
    }
  }

  cancel(event) {
    event?.preventDefault();
    if (this.hasInputTarget && this.originalBody != null) {
      this.inputTarget.value = this.originalBody;
    }
    this.#close();
  }

  #close() {
    if (this.hasFormTarget) this.formTarget.hidden = true;
    if (this.hasBodyTarget) this.bodyTarget.hidden = false;
    this.#syncGate();
  }

  #syncGate() {
    if (!this.hasTriggerTarget) return;
    const desk = this.element.closest("[data-support-chat-admin-viewer-id-value]");
    const viewerId = Number(desk?.dataset.supportChatAdminViewerIdValue || 0);
    this.triggerTarget.hidden = !(viewerId > 0 && viewerId === this.authorIdValue);
  }
}
