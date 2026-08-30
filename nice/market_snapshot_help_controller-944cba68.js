import { Controller } from "@hotwired/stimulus";
import {
  attachDropdownListToBody,
  clearFixedDropdownStyles,
  restoreDropdownListPortal,
  visualLayout,
} from "fixed_dropdown_position";

const GAP_PX = 8;
const EDGE_INSET_PX = 8;
const HIDE_DELAY_MS = 120;

/**
 * Snapshot KPI / chart help tips. Portals the real tip to body (same pattern as
 * nav-teaser) and clamps to the visual viewport so mobile 2-col KPIs do not clip.
 *
 * Keep tipEl / triggerEl refs: after attachDropdownListToBody the tip leaves the
 * controller element, so Stimulus tipTarget throws "Missing target element".
 */
export default class extends Controller {
  static targets = ["trigger", "tip"];

  connect() {
    this.open = false;
    this.hideTimer = null;
    this.tipEl = this.hasTipTarget ? this.tipTarget : null;
    this.triggerEl = this.hasTriggerTarget ? this.triggerTarget : null;
    this.boundReposition = () => this.#reposition();
    this.boundEscape = (event) => {
      if (event.key === "Escape") this.hide();
    };
    this.boundPointerdown = (event) => {
      if (!this.open) return;
      const t = event.target;
      if (this.element.contains(t) || this.tipEl?.contains(t)) return;
      this.hide();
    };
    this.boundBeforeCache = () => this.hide();

    document.addEventListener("turbo:before-cache", this.boundBeforeCache);
  }

  disconnect() {
    document.removeEventListener("turbo:before-cache", this.boundBeforeCache);
    this.#clearHideTimer();
    this.hide();
    this.tipEl = null;
    this.triggerEl = null;
  }

  show() {
    // Touch / coarse: open only via click toggle (focus+click would open then close).
    if (this.#coarsePointer()) return;

    this.#clearHideTimer();
    this.#openTip();
  }

  hide(event) {
    if (event?.type === "mouseleave" || event?.type === "blur") {
      const related = event.relatedTarget;
      if (related && (this.element.contains(related) || this.tipEl?.contains(related))) {
        return;
      }
      this.#clearHideTimer();
      this.hideTimer = window.setTimeout(() => this.#teardownIfIdle(), HIDE_DELAY_MS);
      return;
    }

    this.#closeTip();
  }

  toggle(event) {
    if (!this.#coarsePointer()) return;
    event.preventDefault();
    if (this.open) this.#closeTip();
    else this.#openTip();
  }

  #coarsePointer() {
    return window.matchMedia("(hover: none), (pointer: coarse)").matches;
  }

  #openTip() {
    const tip = this.tipEl;
    if (!tip) return;

    if (this.open) {
      this.#reposition();
      return;
    }

    tip.hidden = false;
    tip.classList.remove("is-visible");
    attachDropdownListToBody(tip);
    this.open = true;
    this.#reposition();
    requestAnimationFrame(() => {
      if (!this.open) return;
      this.#reposition();
      tip.classList.add("is-visible");
    });

    window.addEventListener("scroll", this.boundReposition, true);
    window.addEventListener("resize", this.boundReposition);
    document.addEventListener("keydown", this.boundEscape);
    document.addEventListener("pointerdown", this.boundPointerdown, true);
    const vv = window.visualViewport;
    if (vv) {
      vv.addEventListener("resize", this.boundReposition);
      vv.addEventListener("scroll", this.boundReposition);
    }
  }

  #closeTip() {
    this.#clearHideTimer();
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
    document.removeEventListener("pointerdown", this.boundPointerdown, true);
    const vv = window.visualViewport;
    if (vv) {
      vv.removeEventListener("resize", this.boundReposition);
      vv.removeEventListener("scroll", this.boundReposition);
    }
  }

  #teardownIfIdle() {
    if (this.triggerEl?.matches(":hover")) return;
    if (this.tipEl?.matches(":hover")) return;
    this.#closeTip();
  }

  #clearHideTimer() {
    if (this.hideTimer != null) {
      window.clearTimeout(this.hideTimer);
      this.hideTimer = null;
    }
  }

  #reposition() {
    const tip = this.tipEl;
    const trigger = this.triggerEl;
    if (!this.open || !tip || !trigger) return;

    const anchor = trigger.getBoundingClientRect();
    const tipRect = tip.getBoundingClientRect();
    const width = tipRect.width || 280;
    const height = tipRect.height || 96;
    const { offsetTop, offsetLeft, height: vpHeight, width: vpWidth } = visualLayout();

    const maxLeft = offsetLeft + vpWidth - width - EDGE_INSET_PX;
    let left = offsetLeft + anchor.left + anchor.width / 2 - width / 2;
    left =
      maxLeft < offsetLeft + EDGE_INSET_PX
        ? offsetLeft + EDGE_INSET_PX
        : Math.max(offsetLeft + EDGE_INSET_PX, Math.min(left, maxLeft));

    let top = offsetTop + anchor.bottom + GAP_PX;
    const bottomLimit = offsetTop + vpHeight - EDGE_INSET_PX;
    if (top + height > bottomLimit) {
      top = Math.max(offsetTop + EDGE_INSET_PX, offsetTop + anchor.top - height - GAP_PX);
    }

    tip.style.position = "fixed";
    tip.style.left = `${left}px`;
    tip.style.top = `${top}px`;
    tip.style.right = "auto";
    tip.style.bottom = "auto";
    tip.style.zIndex = "80";
    tip.style.margin = "0";
    tip.style.width = `${Math.min(280, vpWidth - 24)}px`;
  }
}
