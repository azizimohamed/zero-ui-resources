import { Controller } from "@hotwired/stimulus";
import {
  attachDropdownListToBody,
  clearFixedDropdownStyles,
  positionFixedDropdownRightAligned,
  restoreDropdownListPortal,
} from "fixed_dropdown_position";

const PANEL_WIDTH = 360;
const PANEL_GAP = 10;
const VIEWPORT_MARGIN = 12;
const CLOSE_MS = 240;

export default class extends Controller {
  static targets = ["panel", "toggle", "backdrop", "badge"];

  connect() {
    this.boundReposition = this.repositionPanel.bind(this);
    this.boundBeforeCache = () => this.closeImmediate();
    document.addEventListener("turbo:before-cache", this.boundBeforeCache);
    this._panel = this.hasPanelTarget ? this.panelTarget : null;
  }

  badgeTargetConnected(element) {
    const count = parseInt(element.textContent) || 0;
    if (this.lastCount !== undefined && count > this.lastCount) {
      const now = Date.now();
      if (!this.lastPopTime || now - this.lastPopTime >= 1500) {
        element.classList.remove("new-matches-badge--pop");
        void element.offsetWidth; // Force layout reflow
        element.classList.add("new-matches-badge--pop");
        this.lastPopTime = now;
      }
    }
    this.lastCount = count;
  }

  disconnect() {
    document.removeEventListener("turbo:before-cache", this.boundBeforeCache);
    this.unbindReposition();
    document.removeEventListener("click", this.handleClickOutside);
    document.removeEventListener("keydown", this.handleEscape);
    this.closeImmediate();
  }

  toggle(event) {
    event.preventDefault();
    event.stopPropagation();
    if (!this._panel) return;

    const isOpen = this.isOpen();
    isOpen ? this.close() : this.open();
  }

  isOpen() {
    return this._panel && !this._panel.classList.contains("hidden");
  }

  open() {
    const panel = this._panel;
    if (!panel) return;

    attachDropdownListToBody(panel);
    this.portalBackdrop();
    this.repositionPanel();
    panel.classList.remove("hidden");
    void panel.offsetHeight;
    panel.classList.add("notification-panel--open");
    this.showBackdrop();
    this.setExpanded(true);
    requestAnimationFrame(() => this.repositionPanel());
    this.bindReposition();
    window.setTimeout(() => {
      document.addEventListener("click", this.handleClickOutside);
    }, 0);
    document.addEventListener("keydown", this.handleEscape);
  }

  close() {
    const panel = this._panel;
    if (!panel || panel.classList.contains("hidden")) return;
    if (panel.dataset.notificationClosing === "true") return;

    panel.dataset.notificationClosing = "true";
    panel.classList.remove("notification-panel--open");
    this.hideBackdrop();
    this.setExpanded(false);
    document.removeEventListener("click", this.handleClickOutside);
    document.removeEventListener("keydown", this.handleEscape);
    this.unbindReposition();

    window.setTimeout(() => this.finishClose(), CLOSE_MS);
  }

  closeImmediate() {
    const panel = this._panel;
    if (!panel) return;

    panel.classList.remove("notification-panel--open");
    panel.classList.add("hidden");
    delete panel.dataset.notificationClosing;
    restoreDropdownListPortal(panel);
    clearFixedDropdownStyles(panel);
    this.hideBackdrop(true);
    this.restoreBackdropParent();
    this.setExpanded(false);
  }

  finishClose() {
    const panel = this._panel;
    if (!panel) return;

    panel.classList.add("hidden");
    delete panel.dataset.notificationClosing;
    restoreDropdownListPortal(panel);
    clearFixedDropdownStyles(panel);
    this.restoreBackdropParent();
  }

  handleClickOutside = (event) => {
    const path = event.composedPath?.() ?? [];
    if (path.includes(this.element) || (this._panel && path.includes(this._panel))) return;
    if (this.hasBackdropTarget && this.backdropTarget.contains(event.target)) {
      this.close();
      return;
    }
    this.close();
  };

  handleEscape = (event) => {
    if (event.key !== "Escape" || !this.isOpen()) return;
    event.preventDefault();
    this.close();
  };

  repositionPanel() {
    const panel = this._panel;
    const button = this.hasToggleTarget ? this.toggleTarget : this.element.querySelector("button");
    if (!panel || !button) return;

    const rect = button.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return;

    positionFixedDropdownRightAligned(rect, panel, {
      gap: PANEL_GAP,
      margin: VIEWPORT_MARGIN,
      width: PANEL_WIDTH,
      zIndex: "72",
    });
  }

  portalBackdrop() {
    if (!this.hasBackdropTarget) return;
    const backdrop = this.backdropTarget;
    if (backdrop.parentNode === document.body) return;
    this.backdropOriginalParent = backdrop.parentNode;
    this.backdropOriginalNext = backdrop.nextSibling;
    document.body.appendChild(backdrop);
  }

  restoreBackdropParent() {
    if (!this.hasBackdropTarget || !this.backdropOriginalParent) return;
    const backdrop = this.backdropTarget;
    const { backdropOriginalParent: parent, backdropOriginalNext: next } = this;
    delete this.backdropOriginalParent;
    delete this.backdropOriginalNext;
    if (next && next.parentNode === parent) parent.insertBefore(backdrop, next);
    else parent.appendChild(backdrop);
  }

  showBackdrop() {
    if (!this.hasBackdropTarget) return;
    const backdrop = this.backdropTarget;
    backdrop.classList.remove("hidden");
    backdrop.removeAttribute("aria-hidden");
    requestAnimationFrame(() => backdrop.classList.add("notification-backdrop--visible"));
  }

  hideBackdrop(immediate = false) {
    if (!this.hasBackdropTarget) return;
    const backdrop = this.backdropTarget;
    backdrop.classList.remove("notification-backdrop--visible");
    const hide = () => {
      backdrop.classList.add("hidden");
      backdrop.setAttribute("aria-hidden", "true");
    };
    immediate ? hide() : window.setTimeout(hide, CLOSE_MS);
  }

  bindReposition() {
    window.addEventListener("resize", this.boundReposition);
    window.addEventListener("scroll", this.boundReposition, true);
  }

  unbindReposition() {
    window.removeEventListener("resize", this.boundReposition);
    window.removeEventListener("scroll", this.boundReposition, true);
  }

  setExpanded(expanded) {
    if (!this.hasToggleTarget) return;
    this.toggleTarget.setAttribute("aria-expanded", expanded ? "true" : "false");
  }
}
