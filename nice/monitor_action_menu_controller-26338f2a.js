import { Controller } from "@hotwired/stimulus";
import {
  clearFixedDropdownStyles,
  positionFixedDropdown,
  restoreDropdownListPortal,
} from "fixed_dropdown_position";

// Shared monitor "..." menu. Desktop: popover. Below breakpoint: bottom sheet + scrim.
// Escape and outside click close; focus returns to the trigger.
//
// The popover portals to <body> while open: listing rows live inside a horizontally
// scrolling table wrap and a scrolling feed, both of which would otherwise clip it.
export default class extends Controller {
  static targets = ["trigger", "menu", "sheet", "scrim"];
  static values = {
    breakpoint: { type: Number, default: 768 },
    menuWidth: { type: Number, default: 244 },
  };

  connect() {
    this.boundOutside = this.onOutside.bind(this);
    this.boundEscape = this.onEscape.bind(this);
    this.boundReposition = this.reposition.bind(this);
    this.open = false;
  }

  disconnect() {
    this.close();
  }

  toggle(event) {
    event.preventDefault();
    event.stopPropagation();
    this.open ? this.close() : this.show();
  }

  keydown(event) {
    if (!this.open) return;
    if (event.key === "Escape") {
      event.preventDefault();
      this.close();
    }
  }

  show() {
    if (this.open) return;
    this.open = true;
    this.mobile = window.matchMedia(`(max-width: ${this.breakpointValue - 1}px)`).matches;

    if (this.mobile) {
      this.showSheet();
    } else {
      this.showMenu();
    }

    this.triggerTarget.setAttribute("aria-expanded", "true");
    document.addEventListener("mousedown", this.boundOutside, true);
    document.addEventListener("keydown", this.boundEscape);
    window.addEventListener("resize", this.boundReposition);
  }

  close() {
    if (!this.open) return;
    this.open = false;
    this.hideMenu();
    this.hideSheet();
    this.triggerTarget.setAttribute("aria-expanded", "false");
    document.removeEventListener("mousedown", this.boundOutside, true);
    document.removeEventListener("keydown", this.boundEscape);
    window.removeEventListener("resize", this.boundReposition);
    this.triggerTarget.focus({ preventScroll: true });
  }

  showMenu() {
    if (!this.hasMenuTarget) return;
    this.menu = this.menuTarget;
    // Portal and place while still hidden: laying the popover out inside the row would
    // grow the table wrap's scroll area and shift the row before we move it to <body>.
    this.reposition();
    this.menu.hidden = false;
    this.menu.classList.remove("hidden");
    this.focusFirstItem(this.menu);
  }

  hideMenu() {
    const menu = this.menu;
    if (!menu) return;
    menu.hidden = true;
    menu.classList.add("hidden");
    restoreDropdownListPortal(menu);
    clearFixedDropdownStyles(menu);
    this.menu = null;
  }

  reposition() {
    if (!this.open || this.mobile || !this.menu) return;

    positionFixedDropdown(this.triggerTarget.getBoundingClientRect(), this.menu, {
      gap: 6,
      margin: 8,
      align: "right",
      width: this.menuWidthValue,
      preferredMaxHeight: 520,
      zIndex: "80",
    });
  }

  showSheet() {
    if (!this.hasSheetTarget) return;
    if (this.hasScrimTarget) {
      this.scrimTarget.hidden = false;
      this.scrimTarget.classList.remove("hidden");
    }
    this.sheetTarget.hidden = false;
    this.sheetTarget.classList.remove("mh-sheet--hidden");
    this.sheetTarget.setAttribute("role", "dialog");
    this.focusFirstItem(this.sheetTarget);
  }

  hideSheet() {
    if (!this.hasSheetTarget) return;
    this.sheetTarget.classList.add("mh-sheet--hidden");
    this.sheetTarget.hidden = true;
    if (this.hasScrimTarget) {
      this.scrimTarget.hidden = true;
      this.scrimTarget.classList.add("hidden");
    }
  }

  focusFirstItem(root) {
    const item = root.querySelector(
      'a:not([disabled]), button:not([disabled]), [role="menuitem"]:not([disabled])',
    );
    if (item) item.focus({ preventScroll: true });
  }

  onOutside(event) {
    if (this.element.contains(event.target)) return;
    // The desktop popover is portaled to <body>, so it is outside this.element.
    if (this.menu?.contains(event.target)) return;

    this.close();
  }

  onEscape(event) {
    if (event.key !== "Escape") return;
    event.preventDefault();
    this.close();
  }
}
