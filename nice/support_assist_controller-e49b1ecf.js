import { Controller } from "@hotwired/stimulus";

// Suggest / Ai rewrite for the live support composer.
export default class extends Controller {
  static targets = ["suggestBtn", "rewriteBtn", "assistStatus"];
  static values = {
    suggestUrl: String,
    rewriteUrl: String,
  };

  async suggest(event) {
    event.preventDefault();
    if (!this.suggestUrlValue || this.busy) return;
    await this.#run({
      url: this.suggestUrlValue,
      body: {},
      busyLabel: "Suggesting…",
    });
  }

  async rewrite(event) {
    event.preventDefault();
    if (!this.rewriteUrlValue || this.busy) return;
    const draft = this.#input()?.value.trim() || "";
    if (!draft) {
      this.#setStatus("Write a draft first.");
      return;
    }
    await this.#run({
      url: this.rewriteUrlValue,
      body: { draft },
      busyLabel: "Rewriting…",
    });
  }

  // Only the composer textarea. Message edit forms also use name="body"
  // earlier in .desk__t and must not be targeted.
  #input() {
    const composer = this.element.classList?.contains("tcomp")
      ? this.element
      : this.element.closest?.(".tcomp") || document.querySelector(".desk__t .tcomp");
    return composer?.querySelector("form textarea[name='body']") || null;
  }

  async #run({ url, body, busyLabel }) {
    const token = document.querySelector('meta[name="csrf-token"]')?.content;
    if (!token) {
      this.#setStatus("Refresh the page and try again.");
      return;
    }

    this.busy = true;
    this.#setBusy(true);
    this.#setStatus(busyLabel);

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          "X-CSRF-Token": token,
        },
        credentials: "same-origin",
        body: JSON.stringify(body),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.ok) {
        this.#setStatus(payload.error || "AI assist failed.");
        return;
      }

      const text = (payload.body || "").toString();
      if (!text.trim()) {
        this.#setStatus("No draft came back. Try again.");
        return;
      }

      const input = this.#input();
      if (!input) {
        this.#setStatus("Composer not found. Refresh and try again.");
        return;
      }

      input.value = text;
      input.focus();
      input.dispatchEvent(new Event("input", { bubbles: true }));
      this.#setStatus("Draft ready. Review before sending.");
    } catch (_error) {
      this.#setStatus("AI assist failed.");
    } finally {
      this.busy = false;
      this.#setBusy(false);
    }
  }

  #setBusy(busy) {
    [
      this.hasSuggestBtnTarget && this.suggestBtnTarget,
      this.hasRewriteBtnTarget && this.rewriteBtnTarget,
    ]
      .filter(Boolean)
      .forEach((button) => {
        button.disabled = busy;
        button.classList.toggle("is-busy", busy);
      });
  }

  #setStatus(message) {
    if (!this.hasAssistStatusTarget) return;
    const text = (message || "").trim();
    if (!text) {
      this.assistStatusTarget.hidden = true;
      this.assistStatusTarget.textContent = "";
      this.assistStatusTarget.classList.remove("is-error");
      return;
    }
    this.assistStatusTarget.hidden = false;
    this.assistStatusTarget.textContent = text;
    this.assistStatusTarget.classList.toggle(
      "is-error",
      /failed|not found|try again|paused|limit|write a draft/i.test(text),
    );
  }
}
