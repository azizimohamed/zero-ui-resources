import { Controller } from "@hotwired/stimulus";

const TIP_CLASS = "pricing-tip";
const GAP_PX = 10;
const EDGE_INSET_PX = 8;

/**
 * Hover / focus tips for the pricing compare table.
 * The table scrolls horizontally, so an absolutely positioned tip would be
 * clipped by the scroll container. The node is hoisted to the .landing-page
 * element instead (which redefines the surface tokens the tip uses) and placed
 * from the trigger's viewport rect.
 */
export default class extends Controller {
  connect() {
    this.tip = null;
    this.activeTrigger = null;

    this.onReposition = () => this.#reposition();
    this.onKeydown = (event) => {
      if (event.key === "Escape") this.hide();
    };
    // Safari does not focus a button on tap, so blur never fires there.
    this.onDocumentPointerdown = (event) => {
      if (!event.target.closest?.("[data-pricing-tip]")) this.hide();
    };
    this.onCache = () => this.#destroy();

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
    this.#destroy();
  }

  show(event) {
    const trigger = event.currentTarget;
    const text = this.#tipText(trigger);
    if (!text) return;

    this.activeTrigger = trigger;
    const tip = this.#node();
    tip.textContent = text;
    this.#reposition();
    tip.classList.add(`${TIP_CLASS}--on`);
  }

  hide() {
    this.activeTrigger = null;
    this.tip?.classList.remove(`${TIP_CLASS}--on`);
  }

  // The visible tip mirrors the trigger's accessible description, so the copy
  // lives in the DOM once rather than in a parallel data attribute.
  #tipText(trigger) {
    const id = trigger?.getAttribute("aria-describedby");
    return id ? document.getElementById(id)?.textContent?.trim() : null;
  }

  #node() {
    if (this.tip) return this.tip;

    const tip = document.createElement("div");
    tip.className = TIP_CLASS;
    tip.setAttribute("aria-hidden", "true");
    // .landing-page overrides the surface tokens with !important, so a tip
    // parked on <body> would render in app-shell colors instead.
    const host = this.element.closest(".landing-page") || document.body;
    host.appendChild(tip);
    this.tip = tip;
    return tip;
  }

  // Scroll repositions rather than dismisses: tabbing to an off-screen trigger
  // scrolls it into view, and a blind hide would race the focus that opened it.
  #reposition() {
    if (!this.activeTrigger || !this.tip) return;

    const anchor = this.activeTrigger.getBoundingClientRect();
    const { width, height } = this.tip.getBoundingClientRect();

    const maxLeft = window.innerWidth - width - EDGE_INSET_PX;
    let left = anchor.left + anchor.width / 2 - width / 2;
    left =
      maxLeft < EDGE_INSET_PX ? EDGE_INSET_PX : Math.max(EDGE_INSET_PX, Math.min(left, maxLeft));

    let top = anchor.bottom + GAP_PX;
    if (top + height > window.innerHeight - EDGE_INSET_PX) {
      top = Math.max(EDGE_INSET_PX, anchor.top - height - GAP_PX);
    }

    this.tip.style.left = `${left}px`;
    this.tip.style.top = `${top}px`;
  }

  #destroy() {
    this.tip?.remove();
    this.tip = null;
    this.activeTrigger = null;
  }
}
