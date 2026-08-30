import { Controller } from "@hotwired/stimulus";
import {
  attachDropdownListToBody,
  clearFixedDropdownStyles,
  positionFixedDropdown,
  restoreDropdownListPortal,
} from "fixed_dropdown_position";

// Lightweight menus (mobile topbar account, monitor snooze, match assignee).
// Capture-phase outside click so sibling controls that stopPropagation still
// dismiss the menu. Optional portalValue escapes overflow:hidden ancestors
// (tables, dashboard rows). Keep an explicit menu element ref while portaled —
// Stimulus targets only resolve inside the controller element, so a
// body-portaled menu would otherwise leak.
//
// Portaled menus dismiss on nested scroll (feed, drawer) so they do not float
// over sticky chrome. Resize still repositions while open.
export default class extends Controller {
  static targets = ["menu", "toggle"];
  static values = {
    portal: { type: Boolean, default: false },
    menuWidth: { type: Number, default: 176 },
    // Portaled menus need an explicit stack above fixed overlays (bulk sheet is z-200).
    zIndex: { type: String, default: "60" },
    // Optional: toggle a class on a closest ancestor while open (e.g. table row-actions).
    hostOpenSelector: { type: String, default: "" },
    hostOpenClass: { type: String, default: "" },
  };

  connect() {
    this.boundOutside = this.clickOutside.bind(this);
    this.boundEscape = this.onEscape.bind(this);
    this.boundReposition = this.reposition.bind(this);
    this.boundScrollDismiss = this.onScrollDismiss.bind(this);
    this.boundSubmitEnd = this.onSubmitEnd.bind(this);
  }

  disconnect() {
    this.hide();
  }

  toggle(event) {
    event.preventDefault();
    this.isOpen() ? this.hide() : this.show();
  }

  menuElement() {
    return this._menu || (this.hasMenuTarget ? this.menuTarget : null);
  }

  isOpen() {
    const menu = this.menuElement();
    return Boolean(menu && !menu.classList.contains("hidden"));
  }

  show() {
    if (!this.hasMenuTarget || !this.hasToggleTarget) return;
    if (this.isOpen()) return;

    this._menu = this.menuTarget;
    this.unbindDismiss();
    // Portal while still hidden so the in-flow menu does not shove the rail
    // before we read the toggle's rect for fixed placement.
    if (this.portalValue) attachDropdownListToBody(this._menu);
    this._menu.classList.remove("hidden");
    this.setExpanded(true);
    this.setHostMenuOpen(true);
    this.reposition();
    document.addEventListener("click", this.boundOutside, true);
    document.addEventListener("keydown", this.boundEscape);
    this._menu.addEventListener("turbo:submit-end", this.boundSubmitEnd);
    if (this.portalValue) {
      document.addEventListener("scroll", this.boundScrollDismiss, true);
      window.addEventListener("resize", this.boundReposition);
    }
  }

  hide() {
    const menu = this.menuElement();
    if (!menu) return;

    menu.classList.add("hidden");
    this.setExpanded(false);
    this.setHostMenuOpen(false);
    this.teardownPortal(menu);
    this.unbindDismiss(menu);
    this._menu = null;
  }

  setHostMenuOpen(open) {
    const selector = this.hostOpenSelectorValue;
    const className = this.hostOpenClassValue;
    if (!selector || !className) return;

    this.element.closest(selector)?.classList.toggle(className, open);
  }

  reposition() {
    const menu = this.menuElement();
    if (!this.portalValue || !this.isOpen() || !this.hasToggleTarget || !menu) return;

    const rect = this.toggleTarget.getBoundingClientRect();
    // Compact anchor placement (same helper as refine/combobox), not the
    // wide topbar RightAligned panel geometry.
    positionFixedDropdown(rect, menu, {
      gap: 4,
      margin: 8,
      align: "right",
      width: this.menuWidthValue,
      preferredMaxHeight: 280,
      zIndex: this.zIndexValue,
    });
  }

  teardownPortal(menu) {
    if (!menu || !this.portalValue) return;

    restoreDropdownListPortal(menu);
    clearFixedDropdownStyles(menu);
  }

  clickOutside(event) {
    if (!(event.target instanceof Node)) return;
    if (this.element.contains(event.target)) return;
    const menu = this.menuElement();
    if (menu?.contains(event.target)) return;
    this.hide();
  }

  onEscape(event) {
    if (event.key !== "Escape" || !this.isOpen()) return;
    event.preventDefault();
    this.hide();
  }

  onScrollDismiss(event) {
    if (!this.isOpen()) return;

    const menu = this.menuElement();
    // Keep open while the user scrolls a long member list inside the menu.
    if (menu && (menu === event.target || menu.contains(event.target))) return;

    // iOS chrome show/hide emits scroll on document/html/body — not a dismiss.
    const target = event.target;
    if (target === document || target === document.documentElement || target === document.body) {
      return;
    }

    this.hide();
  }

  onSubmitEnd() {
    this.hide();
  }

  unbindDismiss(menu = this.menuElement()) {
    document.removeEventListener("click", this.boundOutside, true);
    document.removeEventListener("keydown", this.boundEscape);
    document.removeEventListener("scroll", this.boundScrollDismiss, true);
    window.removeEventListener("resize", this.boundReposition);
    menu?.removeEventListener("turbo:submit-end", this.boundSubmitEnd);
  }

  setExpanded(expanded) {
    if (!this.hasToggleTarget) return;
    this.toggleTarget.setAttribute("aria-expanded", expanded ? "true" : "false");
  }
}
