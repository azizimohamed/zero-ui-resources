import { Controller } from "@hotwired/stimulus";

const COMPACT_MQ = "(max-width: 820px)";

// Phone-only context sheet for the live support rail. Desktop keeps the grid.
export default class extends Controller {
  static targets = ["panel", "toggle", "closeButton"];

  connect() {
    this.onDocumentKeydown = this.onDocumentKeydown.bind(this);
    this.onMediaChange = this.onMediaChange.bind(this);
    this.boundBeforeCache = this.beforeCache.bind(this);
    this.onFrameLoad = this.onFrameLoad.bind(this);
    this.ensureMq().addEventListener("change", this.onMediaChange);
    document.addEventListener("turbo:before-cache", this.boundBeforeCache);
    this.element.addEventListener("turbo:frame-load", this.onFrameLoad);
    this.syncPanelInteractivity(this.isOpen());
    this.setExpanded(this.isOpen());
  }

  disconnect() {
    this.mq?.removeEventListener("change", this.onMediaChange);
    document.removeEventListener("turbo:before-cache", this.boundBeforeCache);
    this.element.removeEventListener("turbo:frame-load", this.onFrameLoad);
    this.teardownOpenState({ restoreFocus: false });
  }

  beforeCache() {
    this.teardownOpenState({ restoreFocus: false });
  }

  onFrameLoad(event) {
    if (event.target?.id !== "support_desk_thread") return;
    this.teardownOpenState({ restoreFocus: false });
  }

  onMediaChange() {
    if (!this.ensureMq().matches) this.teardownOpenState({ restoreFocus: false });
    else this.syncPanelInteractivity(false);
  }

  toggleTargetConnected() {
    this.setExpanded(this.isOpen());
  }

  panelTargetConnected() {
    this.syncPanelInteractivity(this.isOpen());
  }

  open(event) {
    event?.preventDefault();
    if (!this.ensureMq().matches) return;
    this.element.classList.add("desk--meta-open");
    this.setExpanded(true);
    this.syncPanelInteractivity(true);
    document.addEventListener("keydown", this.onDocumentKeydown);
    queueMicrotask(() => {
      if (this.hasCloseButtonTarget) this.closeButtonTarget.focus();
    });
  }

  close(event) {
    event?.preventDefault();
    this.teardownOpenState({ restoreFocus: true });
  }

  teardownOpenState({ restoreFocus }) {
    const wasOpen = this.isOpen();
    this.element.classList.remove("desk--meta-open");
    document.removeEventListener("keydown", this.onDocumentKeydown);
    this.setExpanded(false);
    this.syncPanelInteractivity(false);
    if (wasOpen && restoreFocus && this.hasToggleTarget) this.toggleTarget.focus();
  }

  isOpen() {
    return this.element.classList.contains("desk--meta-open");
  }

  setExpanded(on) {
    if (!this.hasToggleTarget) return;
    this.toggleTarget.setAttribute("aria-expanded", on ? "true" : "false");
  }

  // Stimulus calls *TargetConnected before connect(), so matchMedia must
  // exist the first time the rail panel lands in the DOM.
  ensureMq() {
    this.mq ||= window.matchMedia(COMPACT_MQ);
    return this.mq;
  }

  syncPanelInteractivity(sheetOpen) {
    if (!this.hasPanelTarget) return;
    if (!this.ensureMq().matches) {
      this.panelTarget.removeAttribute("inert");
      this.panelTarget.removeAttribute("aria-hidden");
      return;
    }
    this.panelTarget.toggleAttribute("inert", !sheetOpen);
    this.panelTarget.setAttribute("aria-hidden", sheetOpen ? "false" : "true");
  }

  onDocumentKeydown(event) {
    if (event.key !== "Escape" || !this.isOpen()) return;
    event.preventDefault();
    this.close();
  }
}
