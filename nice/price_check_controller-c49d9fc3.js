import { Controller } from "@hotwired/stimulus";

// AJAX ask-vs-median check on public Price Index leaf pages (no full reload).
export default class extends Controller {
  static targets = ["input", "verdict", "button"];
  static values = { url: String };

  connect() {
    this.abortController = null;
    this.busy = false;
  }

  disconnect() {
    if (this.abortController) this.abortController.abort();
  }

  // Keep the ask field focused so the accent ring does not flash off on click.
  keepFocus(event) {
    event.preventDefault();
  }

  async submit(event) {
    event.preventDefault();
    event.stopPropagation();
    const ask = this.inputTarget.value?.trim();
    if (!ask) {
      this.verdictTarget.replaceChildren();
      return;
    }
    if (this.busy) return;

    if (this.abortController) this.abortController.abort();
    this.abortController = new AbortController();
    this.busy = true;
    if (this.hasButtonTarget) this.buttonTarget.setAttribute("aria-busy", "true");
    this.inputTarget.focus({ preventScroll: true });

    try {
      const url = new URL(this.urlValue, window.location.origin);
      url.searchParams.set("ask", ask);
      const res = await fetch(url.toString(), {
        headers: {
          Accept: "text/html",
          "X-Requested-With": "XMLHttpRequest",
        },
        credentials: "same-origin",
        signal: this.abortController.signal,
      });
      const html = await res.text();
      if (res.ok || res.status === 422 || res.status === 429) {
        this.#swapVerdict(html);
      } else {
        this.#showError();
      }
    } catch (error) {
      if (error?.name === "AbortError") return;
      this.#showError();
    } finally {
      this.busy = false;
      if (this.hasButtonTarget) this.buttonTarget.removeAttribute("aria-busy");
    }
  }

  #swapVerdict(html) {
    const next = document.createElement("div");
    next.innerHTML = html;
    this.verdictTarget.replaceChildren(...next.childNodes);
  }

  #showError() {
    this.#swapVerdict(
      '<div class="pi-cardish pi-check-msg" role="status"><p class="pi-micro">Could not check that price. Try again.</p></div>',
    );
  }
}
