import { Controller } from "@hotwired/stimulus";

// ChatGPT-style reveal for the latest assistant reply.
// Final markdown stays in the DOM as a fallback so Turbo/Stimulus glitches
// never leave an empty bubble (refresh used to be required).
export default class extends Controller {
  static targets = ["live", "final"];
  static values = {
    text: String,
    cps: { type: Number, default: 72 },
  };

  #cancelled = false;

  connect() {
    if (!this.hasFinalTarget) return;

    // Morph can reconnect without destroying the node; never re-type a finished bubble.
    if (this.element.dataset.maTyped === "1") {
      this.#finish({ animate: false });
      return;
    }

    if (this._typing) return;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      this.#finish({ animate: false });
      return;
    }

    this.#type();
  }

  disconnect() {
    this.#cancelled = true;
    this._typing = false;
    clearTimeout(this._timer);
    // If we die mid-type (hard replace), leave final visible for the next paint.
    if (this.element.dataset.maTyped !== "1") this.#finish({ animate: false });
  }

  async #type() {
    const text = this.textValue || this.finalTarget.innerText || "";
    if (!text || !this.hasLiveTarget) {
      this.#finish({ animate: false });
      return;
    }

    this.#cancelled = false;
    this._typing = true;
    this.finalTarget.hidden = true;
    this.liveTarget.hidden = false;
    this.liveTarget.textContent = "";
    this.element.classList.add("is-typing");

    const delay = Math.max(6, Math.round(1000 / this.cpsValue));
    let i = 0;

    try {
      while (i < text.length) {
        if (this.#cancelled) return;
        const step = text.length > 280 ? 3 : text.length > 120 ? 2 : 1;
        i = Math.min(text.length, i + step);
        this.liveTarget.textContent = text.slice(0, i);
        await this.#sleep(delay);
      }
    } catch (_err) {
      this.#finish({ animate: false });
      return;
    }

    if (this.#cancelled) return;
    this.#finish({ animate: true });
  }

  #finish({ animate: _animate }) {
    this._typing = false;
    if (this.hasLiveTarget) {
      this.liveTarget.hidden = true;
      this.liveTarget.textContent = "";
    }
    if (this.hasFinalTarget) this.finalTarget.hidden = false;
    this.element.classList.remove("is-typing");
    this.element.dataset.maTyped = "1";
  }

  #sleep(ms) {
    return new Promise((resolve) => {
      this._timer = setTimeout(resolve, ms);
    });
  }
}
