import { Controller } from "@hotwired/stimulus";
import {
  clearFixedDropdownStyles,
  attachDropdownListToBody,
  positionFixedDropdown,
  positionFixedDropdownRightAligned,
  restoreDropdownListPortal,
} from "fixed_dropdown_position";

const PANEL_SELECTOR = ".m-profile-pop, .m-mobile-refine__panel, .qhead__menu-panel";
const PORTAL_Z_INDEX = "50";

const registry = new Set();
let globalListenersBound = false;

function bindGlobalListeners() {
  if (globalListenersBound) return;
  globalListenersBound = true;
  document.addEventListener("click", onGlobalClick, true);
  document.addEventListener("keydown", onGlobalKeyDown);
  document.addEventListener("scroll", onGlobalScroll, true);
  window.addEventListener("resize", onGlobalResize);
}

function unbindGlobalListeners() {
  if (!globalListenersBound || registry.size > 0) return;
  globalListenersBound = false;
  document.removeEventListener("click", onGlobalClick, true);
  document.removeEventListener("keydown", onGlobalKeyDown);
  document.removeEventListener("scroll", onGlobalScroll, true);
  window.removeEventListener("resize", onGlobalResize);
}

function openControllers() {
  return [...registry].filter((c) => c.element.open);
}

function onGlobalClick(event) {
  openControllers().forEach((controller) => {
    if (controller.ignoreNextOutsideClick) return;
    if (controller.isInsideDropdown(event.target)) return;
    controller.dismiss();
  });
}

function onGlobalKeyDown(event) {
  if (event.key !== "Escape") return;
  openControllers().forEach((controller) => controller.dismiss());
}

function isRootScrollTarget(target) {
  // iOS shows/hides the browser chrome while scrolling nested overflow panels;
  // that emits scroll on document/html/body and is not a user dismiss gesture.
  return target === document || target === document.documentElement || target === document.body;
}

function onGlobalScroll(event) {
  if (isRootScrollTarget(event.target)) return;

  openControllers().forEach((controller) => {
    const panel = controller.activePanel();
    if (!panel) return;

    // Opt out via data-scroll-dismiss="false" (mobile filters sheet): inner drags
    // also scroll-chain to #turbo-main-pane / the feed and would false-dismiss.
    if (panel.dataset.scrollDismiss === "false") return;

    if (panel === event.target || panel.contains(event.target)) return;
    controller.dismiss();
  });
}

function onGlobalResize() {
  openControllers().forEach((controller) => controller.repositionPanel());
}

/** `<details>` menus for monitor picker + mobile filters; portal panel to escape overflow ancestors. */
export default class extends Controller {
  connect() {
    this.onToggle = this.handleToggle.bind(this);
    registry.add(this);
    bindGlobalListeners();
    this.element.addEventListener("toggle", this.onToggle);
  }

  disconnect() {
    this.element.removeEventListener("toggle", this.onToggle);
    registry.delete(this);
    this.dismiss();
    unbindGlobalListeners();
  }

  handleToggle() {
    if (this.element.open) {
      this.closeOtherDropdowns();
      this.ignoreNextOutsideClick = true;
      requestAnimationFrame(() => {
        this.ignoreNextOutsideClick = false;
      });
      this.openPanel();
    } else {
      this.closePanel();
    }
  }

  isInsideDropdown(target) {
    if (!(target instanceof Node)) return false;
    if (this.element.contains(target)) return true;

    const panel = this.activePanel();
    return Boolean(panel?.contains(target));
  }

  closeOtherDropdowns() {
    openControllers().forEach((controller) => {
      if (controller !== this) controller.dismiss();
    });
  }

  panelElement() {
    return this.element.querySelector(PANEL_SELECTOR);
  }

  activePanel() {
    if (this._panel?.isConnected) return this._panel;
    return this.panelElement();
  }

  anchor() {
    return this.element.querySelector("summary");
  }

  openPanel() {
    const panel = this.panelElement();
    const anchor = this.anchor();
    if (!panel || !anchor) return;

    this._panel = panel;
    this.loadLazyFrames(panel);
    this.repositionPanel();
  }

  loadLazyFrames(panel) {
    panel.querySelectorAll("turbo-frame[data-lazy-src]").forEach((frame) => {
      const src = frame.dataset.lazySrc;
      if (!src || frame.getAttribute("src")) return;
      frame.setAttribute("src", src);
      frame.addEventListener("turbo:frame-load", () => this.repositionPanel(), { once: true });
    });
  }

  repositionPanel() {
    const panel = this.activePanel();
    const anchor = this.anchor();
    if (!panel || !anchor || !this.element.open) return;

    const rect = anchor.getBoundingClientRect();

    if (panel.classList.contains("m-mobile-refine__panel")) {
      this.positionRefinePanel(panel, rect);
      return;
    }

    if (panel.classList.contains("qhead__menu-panel")) {
      this.positionQheadMenuPanel(panel, rect);
      return;
    }

    positionFixedDropdown(rect, panel, { preferredMaxHeight: 448, gap: 6 });
    const width = Math.min(Math.max(320, rect.width), window.innerWidth - 16);
    panel.style.width = `${width}px`;
    panel.style.zIndex = PORTAL_Z_INDEX;
  }

  positionRefinePanel(panel, anchorRect) {
    // Let the helper size max-height from visualViewport (no innerHeight / 400px cap).
    positionFixedDropdownRightAligned(anchorRect, panel, {
      gap: 6,
      margin: 8,
      width: Math.min(288, window.innerWidth - 24),
      zIndex: PORTAL_Z_INDEX,
    });
  }

  positionQheadMenuPanel(panel, anchorRect) {
    positionFixedDropdown(anchorRect, panel, {
      preferredMaxHeight: 320,
      gap: 4,
      margin: 8,
      align: "right",
      width: Math.min(168, window.innerWidth - 16),
      zIndex: PORTAL_Z_INDEX,
    });
  }

  dismiss() {
    if (!this.element.open) {
      this.closePanel();
      return;
    }

    this.element.removeAttribute("open");
    this.closePanel();
  }

  closePanel() {
    const panel = this.activePanel();
    this._panel = null;
    if (!panel) return;

    restoreDropdownListPortal(panel);
    clearFixedDropdownStyles(panel);
  }
}
