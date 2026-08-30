import { Controller } from "@hotwired/stimulus";
import {
  clearFixedDropdownStyles,
  positionFixedDropdown,
  restoreDropdownListPortal,
} from "fixed_dropdown_position";

const GAP = 6;
const MARGIN = 8;
const MENU_WIDTH = 168;
const PREFERRED_MAX_HEIGHT = 280;
const Z_INDEX = "70";
const MENU_SELECTOR = ".admin-signup-actions__menu";

const registry = new Set();
let activeController = null;
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

function onGlobalClick(event) {
  const controller = activeController;
  if (!controller) return;
  if (controller.ignoreNextOutsideClick) return;
  if (controller.isInsideDropdown(event.target)) return;
  controller.forceHide();
}

function onGlobalKeyDown(event) {
  if (event.key !== "Escape") return;
  activeController?.forceHide();
}

function onGlobalScroll(event) {
  const controller = activeController;
  if (!controller) return;
  // Keep open while scrolling inside the menu itself; dismiss on page/table scroll.
  if (controller.activeMenu()?.contains(event.target)) return;
  controller.forceHide();
}

function onGlobalResize() {
  activeController?.forceHide();
}

function sweepOrphanMenus(keep = null) {
  document.querySelectorAll(`body > ${MENU_SELECTOR}`).forEach((menu) => {
    if (menu === keep) return;
    menu.classList.add("hidden");
    restoreDropdownListPortal(menu);
    clearFixedDropdownStyles(menu);
  });
}

/**
 * Signup row actions menu: portaled + fixed so table overflow does not clip the menu.
 * Only one menu may be open; Menu is cached because Stimulus drops targets once portaled.
 */
export default class extends Controller {
  static targets = ["menu", "toggle"];

  connect() {
    this._open = false;
    this._menu = this.hasMenuTarget ? this.menuTarget : null;
    registry.add(this);
    bindGlobalListeners();
  }

  disconnect() {
    registry.delete(this);
    this.forceHide();
    unbindGlobalListeners();
  }

  menuTargetConnected(element) {
    this._menu = element;
  }

  menuTargetDisconnected(element) {
    // Portaling moves the node under body; keep the cached reference while open.
    if (this._menu === element && !this._open) this._menu = null;
  }

  toggle(event) {
    event.preventDefault();
    event.stopPropagation();
    this.isOpen() ? this.forceHide() : this.show();
  }

  isOpen() {
    return this._open === true && activeController === this;
  }

  activeMenu() {
    if (this._menu?.isConnected) return this._menu;
    return this.hasMenuTarget ? this.menuTarget : null;
  }

  isInsideDropdown(target) {
    if (!(target instanceof Node)) return false;
    if (this.element.contains(target)) return true;
    return Boolean(this.activeMenu()?.contains(target));
  }

  show() {
    const menu = this.activeMenu();
    if (!menu || !this.hasToggleTarget) return;
    if (this.isOpen()) return;

    if (activeController && activeController !== this) activeController.forceHide();
    registry.forEach((controller) => {
      if (controller !== this) controller.forceHide();
    });
    sweepOrphanMenus(menu);

    this._menu = menu;
    this._open = true;
    activeController = this;
    // Portal and position while hidden so the menu never paints in table flow.
    this.positionMenu();
    menu.classList.remove("hidden");
    this.setExpanded(true);
    this.ignoreNextOutsideClick = true;
    requestAnimationFrame(() => {
      this.ignoreNextOutsideClick = false;
    });
  }

  forceHide() {
    const menu = this.activeMenu() || this._menu;
    const wasActive = activeController === this;

    this._open = false;
    this.ignoreNextOutsideClick = false;
    this.setExpanded(false);
    if (wasActive) activeController = null;

    if (menu) {
      menu.classList.add("hidden");
      restoreDropdownListPortal(menu);
      clearFixedDropdownStyles(menu);
    }

    if (wasActive) sweepOrphanMenus();
  }

  positionMenu() {
    const menu = this.activeMenu();
    if (!menu || !this.hasToggleTarget || !this.isOpen()) return;

    const rect = this.toggleTarget.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return;

    positionFixedDropdown(rect, menu, {
      align: "right",
      width: MENU_WIDTH,
      preferredMaxHeight: PREFERRED_MAX_HEIGHT,
      gap: GAP,
      margin: MARGIN,
      zIndex: Z_INDEX,
    });
  }

  setExpanded(expanded) {
    if (!this.hasToggleTarget) return;
    this.toggleTarget.setAttribute("aria-expanded", expanded ? "true" : "false");
  }
}
