import { Controller } from "@hotwired/stimulus";
import {
  attachDropdownListToBody,
  clearFixedDropdownStyles,
  restoreDropdownListPortal,
} from "fixed_dropdown_position";

/** Fixed teaser tip for disabled “coming soon” sidebar items (escapes overflow clipping). */
export default class extends Controller {
  static targets = ["tip"];

  connect() {
    this.open = false;
    this.hovered = false;
    this.focused = false;
    this.tipEl = this.hasTipTarget ? this.tipTarget : null;
    this.boundReposition = () => this.reposition();
    this.boundBeforeCache = () => this.forceHide();
    this.boundEscape = (event) => this.onEscape(event);
    document.addEventListener("turbo:before-cache", this.boundBeforeCache);
  }

  disconnect() {
    document.removeEventListener("turbo:before-cache", this.boundBeforeCache);
    this.forceHide();
    this.tipEl = null;
  }

  showFromHover() {
    this.hovered = true;
    this.openTip();
  }

  hideFromHover() {
    this.hovered = false;
    this.closeIfIdle();
  }

  showFromFocus() {
    // Pointer click also focuses tabindex items; that pins the tip after mouseleave.
    // Only keyboard focus-visible should keep the teaser open.
    if (!this.element.matches(":focus-visible")) return;

    this.focused = true;
    this.openTip();
  }

  hideFromFocus() {
    this.focused = false;
    this.closeIfIdle();
  }

  /** Drop click-induced focus so tips stay hover-driven for pointer users. */
  dismissPointerFocus() {
    this.focused = false;
    if (document.activeElement === this.element) this.element.blur();
    this.closeIfIdle();
  }

  onEscape(event) {
    if (event.key !== "Escape" || !this.open) return;
    event.preventDefault();
    this.forceHide();
    this.element.blur();
  }

  openTip() {
    const tip = this.tipEl;
    if (!tip) return;

    if (this.open) {
      this.reposition();
      return;
    }

    tip.hidden = false;
    attachDropdownListToBody(tip);
    this.open = true;
    this.reposition();
    requestAnimationFrame(() => {
      if (!this.open) return;
      this.reposition();
      tip.classList.add("is-visible");
    });

    window.addEventListener("scroll", this.boundReposition, true);
    window.addEventListener("resize", this.boundReposition);
    document.addEventListener("keydown", this.boundEscape);
  }

  closeIfIdle() {
    if (!this.hovered && !this.focused) this.hide();
  }

  forceHide() {
    this.hovered = false;
    this.focused = false;
    this.hide();
  }

  hide() {
    const tip = this.tipEl;
    if (!tip || !this.open) return;

    tip.classList.remove("is-visible");
    tip.hidden = true;
    restoreDropdownListPortal(tip);
    clearFixedDropdownStyles(tip);
    this.open = false;

    window.removeEventListener("scroll", this.boundReposition, true);
    window.removeEventListener("resize", this.boundReposition);
    document.removeEventListener("keydown", this.boundEscape);
  }

  reposition() {
    const tip = this.tipEl;
    if (!tip || !this.open) return;

    const anchor = this.element.getBoundingClientRect();
    const tipRect = tip.getBoundingClientRect();
    const gap = 10;
    const margin = 8;
    const tipW = tipRect.width || 240;
    const tipH = tipRect.height || 96;

    let left = anchor.right + gap;
    if (left + tipW > window.innerWidth - margin) {
      left = Math.max(margin, anchor.left - tipW - gap);
    }

    let top = anchor.top + anchor.height / 2 - tipH / 2;
    top = Math.max(margin, Math.min(top, window.innerHeight - tipH - margin));

    tip.style.position = "fixed";
    tip.style.top = `${top}px`;
    tip.style.left = `${left}px`;
    tip.style.right = "auto";
    tip.style.bottom = "auto";
    tip.style.zIndex = "80";
    tip.style.margin = "0";
  }
}
