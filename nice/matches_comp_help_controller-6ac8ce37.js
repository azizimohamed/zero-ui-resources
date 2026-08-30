import { Controller } from "@hotwired/stimulus";

const SESSION_SHOWN_KEY = "cb.compHelp.shown";

// Ask-vs-comp How-it-works pill — panel opens on click only.
export default class extends Controller {
  static targets = ["button", "tooltip"];

  connect() {
    this._onDocClick = this.onDocClick.bind(this);
    this._onKeydown = this.onKeydown.bind(this);
    document.addEventListener("click", this._onDocClick);
    document.addEventListener("keydown", this._onKeydown);

    if (!this.sessionShown()) {
      this.element.classList.add("help--sparkle");
    }
  }

  disconnect() {
    document.removeEventListener("click", this._onDocClick);
    document.removeEventListener("keydown", this._onKeydown);
  }

  toggle(event) {
    event.preventDefault();
    event.stopPropagation();
    this.closeOthers();
    if (this.element.classList.contains("open")) {
      this.close();
    } else {
      this.open();
    }
  }

  open() {
    this.rememberSessionShown();
    this.element.classList.add("open");
    this.element.classList.remove("help--sparkle");
    this.buttonTarget.setAttribute("aria-expanded", "true");
    this.tooltipTarget.hidden = false;
  }

  close() {
    this.element.classList.remove("open");
    this.buttonTarget.setAttribute("aria-expanded", "false");
    this.tooltipTarget.hidden = true;
  }

  gotIt(event) {
    event.preventDefault();
    event.stopPropagation();
    this.close();
  }

  onDocClick(event) {
    if (event.target.closest(".help")) return;
    this.close();
  }

  onKeydown(event) {
    if (event.key === "Escape") this.close();
  }

  closeOthers() {
    document.querySelectorAll(".help.open").forEach((el) => {
      if (el === this.element) return;
      el.classList.remove("open");
      const btn = el.querySelector(".help__b");
      const tip = el.querySelector(".help__t");
      if (btn) btn.setAttribute("aria-expanded", "false");
      if (tip) tip.hidden = true;
    });
  }

  sessionShown() {
    try {
      return sessionStorage.getItem(SESSION_SHOWN_KEY) === "1";
    } catch (_err) {
      return false;
    }
  }

  rememberSessionShown() {
    try {
      sessionStorage.setItem(SESSION_SHOWN_KEY, "1");
    } catch (_err) {
      /* private mode */
    }
  }
}
