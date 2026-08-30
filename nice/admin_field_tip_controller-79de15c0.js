import { Controller } from "@hotwired/stimulus";

const GAP_PX = 8;
const EDGE_INSET_PX = 8;
const HIDE_DELAY_MS = 120;

/**
 * Portals admin-field-tip popups to document.body and places them from the
 * trigger's viewport rect. Needed inside overflow scrollers (ops tables)
 * where absolute tips are clipped.
 *
 * Do not mutate the in-trigger popup node on show (e.g. display:none): that can
 * synthesize mouseleave and immediately tear the portal down.
 */
export default class extends Controller {
  connect() {
    this.portal = null;
    this.activeTrigger = null;
    this.hideTimer = null;

    this.onReposition = () => this.#reposition();
    this.onKeydown = (event) => {
      if (event.key === "Escape") this.hide();
    };
    this.onDocumentPointerdown = (event) => {
      if (event.target.closest?.(".admin-field-tip, .admin-field-tip__popup--portal")) return;
      this.hide();
    };
    this.onCache = () => this.hide();

    window.addEventListener("scroll", this.onReposition, true);
    window.addEventListener("resize", this.onReposition);
    document.addEventListener("keydown", this.onKeydown);
    document.addEventListener("pointerdown", this.onDocumentPointerdown, true);
    document.addEventListener("turbo:before-cache", this.onCache);
  }

  disconnect() {
    window.removeEventListener("scroll", this.onReposition, true);
    window.removeEventListener("resize", this.onReposition);
    document.removeEventListener("keydown", this.onKeydown);
    document.removeEventListener("pointerdown", this.onDocumentPointerdown, true);
    document.removeEventListener("turbo:before-cache", this.onCache);
    this.hide();
  }

  show(event) {
    const trigger = event.currentTarget;
    const popup = trigger.querySelector(".admin-field-tip__popup");
    if (!popup) return;

    this.#clearHideTimer();

    if (this.activeTrigger === trigger && this.portal) {
      this.#reposition();
      return;
    }

    this.#teardownPortal();
    this.activeTrigger = trigger;

    const portal = popup.cloneNode(true);
    portal.removeAttribute("id");
    portal.className = "admin-field-tip__popup admin-field-tip__popup--portal";
    portal.setAttribute("aria-hidden", "true");
    portal.addEventListener("mouseenter", this.#onPortalEnter);
    portal.addEventListener("mouseleave", this.#onPortalLeave);
    document.body.appendChild(portal);
    this.portal = portal;
    this.#reposition();
  }

  hide(event) {
    if (event?.type === "mouseleave" || event?.type === "blur") {
      const related = event.relatedTarget;
      if (related?.closest?.(".admin-field-tip__popup--portal")) return;
      if (this.activeTrigger && related?.closest?.(".admin-field-tip") === this.activeTrigger) {
        return;
      }

      this.#clearHideTimer();
      this.hideTimer = window.setTimeout(() => this.#teardownIfIdle(), HIDE_DELAY_MS);
      return;
    }

    this.#teardownPortal();
  }

  #onPortalEnter = () => {
    this.#clearHideTimer();
  };

  #onPortalLeave = (event) => {
    const related = event.relatedTarget;
    if (this.activeTrigger && related?.closest?.(".admin-field-tip") === this.activeTrigger) {
      return;
    }

    this.#clearHideTimer();
    this.hideTimer = window.setTimeout(() => this.#teardownIfIdle(), HIDE_DELAY_MS);
  };

  #clearHideTimer() {
    if (this.hideTimer != null) {
      window.clearTimeout(this.hideTimer);
      this.hideTimer = null;
    }
  }

  #teardownIfIdle() {
    if (this.activeTrigger?.matches(":hover")) return;
    if (this.portal?.matches(":hover")) return;
    this.#teardownPortal();
  }

  #teardownPortal() {
    this.#clearHideTimer();
    if (this.portal) {
      this.portal.removeEventListener("mouseenter", this.#onPortalEnter);
      this.portal.removeEventListener("mouseleave", this.#onPortalLeave);
      this.portal.remove();
      this.portal = null;
    }
    this.activeTrigger = null;
  }

  #reposition() {
    if (!this.activeTrigger || !this.portal) return;

    const anchor = this.activeTrigger.getBoundingClientRect();
    const { width, height } = this.portal.getBoundingClientRect();

    const maxLeft = window.innerWidth - width - EDGE_INSET_PX;
    let left = anchor.left + anchor.width / 2 - width / 2;
    left =
      maxLeft < EDGE_INSET_PX ? EDGE_INSET_PX : Math.max(EDGE_INSET_PX, Math.min(left, maxLeft));

    let top = anchor.bottom + GAP_PX;
    if (top + height > window.innerHeight - EDGE_INSET_PX) {
      top = Math.max(EDGE_INSET_PX, anchor.top - height - GAP_PX);
    }

    this.portal.style.left = `${left}px`;
    this.portal.style.top = `${top}px`;
  }
}
