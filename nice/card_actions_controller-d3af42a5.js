import { Controller } from "@hotwired/stimulus";

const TYPING_SEL = "input, textarea, select, [contenteditable='true']";

/** Keyboard triage on the matches feed: W/S/C, J/K, Enter. */
export default class extends Controller {
  static targets = ["card"];

  connect() {
    this.boundKeydown = this.onKeydown.bind(this);
    this.element.addEventListener("keydown", this.boundKeydown);
  }

  disconnect() {
    this.element.removeEventListener("keydown", this.boundKeydown);
  }

  focusedCard() {
    const active = document.activeElement;
    if (!active) return null;
    if (this.cardTargets.includes(active)) return active;
    return active.closest?.("[data-card-actions-target='card']") || null;
  }

  onKeydown(event) {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    if (event.target?.closest?.(TYPING_SEL)) return;

    const key = event.key;
    const card = this.focusedCard();
    if (!card) return;
    const active = document.activeElement;

    if (key === "Enter" || key === " ") {
      if (active !== card && card.contains(active)) return;
      event.preventDefault();
      this.openDrawer(card);
      return;
    }

    const lower = key.length === 1 ? key.toLowerCase() : key;
    if (lower === "w") {
      event.preventDefault();
      this.clickAction(card, "watchlist");
      return;
    }
    if (lower === "s") {
      event.preventDefault();
      this.clickAction(card, "skip");
      return;
    }
    if (lower === "c") {
      event.preventDefault();
      this.clickContact(card);
      return;
    }

    if (lower === "j" || key === "ArrowDown") {
      event.preventDefault();
      this.moveFocus(1);
      return;
    }
    if (lower === "k" || key === "ArrowUp") {
      event.preventDefault();
      this.moveFocus(-1);
    }
  }

  clickAction(card, kind) {
    const btn = card.querySelector(`[data-action-kind="${kind}"]`);
    btn?.click();
  }

  clickContact(card) {
    const done = card.querySelector(".triage-acts__btn.is-done");
    if (done) return;
    const btn = card.querySelector(".triage-acts__btn--contact");
    btn?.click();
  }

  openDrawer(card) {
    const link = card.querySelector("[data-swipe-actions-target='drawerLink']");
    link?.click();
  }

  moveFocus(delta) {
    const cards = this.cardTargets.filter((el) => el.offsetParent !== null);
    if (!cards.length) return;

    const current = this.focusedCard();
    let idx = cards.indexOf(current);
    if (idx < 0) idx = delta > 0 ? -1 : 0;

    const next = cards[Math.max(0, Math.min(cards.length - 1, idx + delta))];
    if (!next || next === current) return;

    next.focus({ preventScroll: true });
    this.nudgeIntoView(next);
  }

  nudgeIntoView(el) {
    const rect = el.getBoundingClientRect();
    const pad = 24;
    if (rect.top < pad) {
      window.scrollBy({ top: rect.top - pad, left: 0, behavior: "smooth" });
    } else if (rect.bottom > window.innerHeight - pad) {
      window.scrollBy({
        top: rect.bottom - window.innerHeight + pad,
        left: 0,
        behavior: "smooth",
      });
    }
  }
}
