import { Controller } from "@hotwired/stimulus";
import { MOBILE_BP_SM_PX } from "mobile_shell";
import { workspaceSwitcherBackdropVisibleSelector } from "workspace_switcher_dom";
import { lockScroll, unlockScroll } from "lib/scroll_lock";

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

const OPEN_CLASS = "is-drawer-open";

export default class extends Controller {
  static targets = ["panel", "scrim", "menuButton"];
  static values = {
    desktopMinPx: { type: Number, default: MOBILE_BP_SM_PX },
  };

  connect() {
    this.onDocumentKeydown = this.onDocumentKeydown.bind(this);
    this.onMediaChange = this.onMediaChange.bind(this);
    this.boundBeforeCache = this.beforeCache.bind(this);
    this.mq = window.matchMedia(`(min-width: ${this.desktopMinPxValue}px)`);
    this.mq.addEventListener("change", this.onMediaChange);
    document.addEventListener("turbo:before-cache", this.boundBeforeCache);
    document.body.classList.remove(OPEN_CLASS);
    this.setExpanded(false);
    this.syncPanelInteractivity(false);
  }

  disconnect() {
    this.mq.removeEventListener("change", this.onMediaChange);
    document.removeEventListener("turbo:before-cache", this.boundBeforeCache);
    document.removeEventListener("keydown", this.onDocumentKeydown);
    this.teardownOpenState({ restoreFocus: false });
  }

  beforeCache() {
    this.teardownOpenState({ restoreFocus: false });
  }

  onMediaChange() {
    if (this.mq.matches) this.teardownOpenState({ restoreFocus: false });
    else this.syncPanelInteractivity(false);
  }

  toggle() {
    if (this.isDesktop()) return;
    if (document.body.classList.contains(OPEN_CLASS)) this.close();
    else this.open();
  }

  open() {
    if (this.isDesktop()) return;
    document.body.classList.add(OPEN_CLASS);
    lockScroll(this);
    this.setExpanded(true);
    this.syncPanelInteractivity(true);
    document.addEventListener("keydown", this.onDocumentKeydown);
    queueMicrotask(() => {
      const list = this.focusables();
      (list[0] || this.panelTarget)?.focus?.();
    });
  }

  close() {
    this.teardownOpenState({ restoreFocus: true });
  }

  teardownOpenState({ restoreFocus }) {
    const wasOpen = document.body.classList.contains(OPEN_CLASS);
    document.body.classList.remove(OPEN_CLASS);
    unlockScroll(this);
    document.removeEventListener("keydown", this.onDocumentKeydown);
    this.setExpanded(false);
    this.syncPanelInteractivity(false);
    if (wasOpen && restoreFocus && this.hasMenuButtonTarget) {
      this.menuButtonTarget.focus();
    }
  }

  workspaceSwitcherBackdropOpen() {
    return !!document.querySelector(workspaceSwitcherBackdropVisibleSelector);
  }

  isDesktop() {
    return this.mq.matches;
  }

  setExpanded(on) {
    if (!this.hasMenuButtonTarget) return;
    this.menuButtonTarget.setAttribute("aria-expanded", on ? "true" : "false");
  }

  // Desktop: sidebar is always visible — never inert. Mobile: inert when closed.
  syncPanelInteractivity(drawerOpen) {
    if (!this.hasPanelTarget) return;
    if (this.isDesktop()) {
      this.panelTarget.removeAttribute("inert");
      this.panelTarget.removeAttribute("aria-hidden");
      return;
    }
    this.panelTarget.toggleAttribute("inert", !drawerOpen);
    this.panelTarget.setAttribute("aria-hidden", drawerOpen ? "false" : "true");
  }

  focusables() {
    if (!this.hasPanelTarget) return [];
    return Array.from(this.panelTarget.querySelectorAll(FOCUSABLE)).filter((el) =>
      this.isFocusableNow(el),
    );
  }

  isFocusableNow(el) {
    if (!(el instanceof HTMLElement)) return false;
    const style = window.getComputedStyle(el);
    if (style.visibility === "hidden" || style.display === "none") return false;
    return !el.closest(".hidden, [hidden], [aria-hidden='true']");
  }

  onDocumentKeydown(event) {
    if (!document.body.classList.contains(OPEN_CLASS)) return;
    if (this.workspaceSwitcherBackdropOpen()) return;

    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      this.close();
      return;
    }
    if (event.key !== "Tab" || !this.hasPanelTarget) return;
    const list = this.focusables();
    if (list.length === 0) return;
    const first = list[0];
    const last = list[list.length - 1];
    const active = document.activeElement;
    const inside = active && this.panelTarget.contains(active);
    if (event.shiftKey) {
      if (active === first || !inside) {
        event.preventDefault();
        last.focus();
      }
    } else if (active === last || !inside) {
      event.preventDefault();
      first.focus();
    }
  }
}
