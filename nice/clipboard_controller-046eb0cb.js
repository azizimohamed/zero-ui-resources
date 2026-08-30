import { Controller } from "@hotwired/stimulus";

const CHECK_ICON_HTML =
  '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>';

// Copies text from a target or data attribute into the clipboard.
export default class extends Controller {
  static targets = ["source"];
  static values = { text: String };

  initialize() {
    this._copiedTimers = new WeakMap();
  }

  disconnect() {
    this.element
      .querySelectorAll("[data-clipboard-original], [data-clipboard-original-html]")
      .forEach((button) => {
        this.#restoreCopied(button);
      });
  }

  async copy(event) {
    event.preventDefault();
    const button = event.currentTarget;
    const value = this.hasSourceTarget
      ? this.sourceTarget.value || this.sourceTarget.textContent
      : this.textValue;
    if (!value) return;

    try {
      await navigator.clipboard.writeText(value.trim());
      this.#flashCopied(button);
      this.dispatch("copied");
    } catch {
      /* clipboard unavailable */
    }
  }

  #flashCopied(button) {
    if (!(button instanceof HTMLElement)) return;

    const prior = this._copiedTimers.get(button);
    if (prior != null) clearTimeout(prior);

    const iconFeedback = button.dataset.clipboardFeedback === "icon";

    if (button.dataset.clipboardOriginal == null && button.dataset.clipboardOriginalHtml == null) {
      if (iconFeedback) {
        button.dataset.clipboardOriginalHtml = button.innerHTML;
      } else {
        button.dataset.clipboardOriginal = button.textContent;
      }
      if (button.hasAttribute("aria-label")) {
        button.dataset.clipboardAriaLabel = button.getAttribute("aria-label");
      }
    }

    if (button.dataset.clipboardOriginalHtml != null) {
      button.innerHTML = CHECK_ICON_HTML;
    } else {
      button.textContent = "Copied";
    }
    if (button.dataset.clipboardAriaLabel != null) {
      button.setAttribute("aria-label", "Copied");
    }
    if (button.hasAttribute("title")) {
      button.dataset.clipboardTitle = button.getAttribute("title");
      button.setAttribute("title", "Copied");
    }
    button.classList.add("is-copied");

    this._copiedTimers.set(
      button,
      setTimeout(() => {
        this.#restoreCopied(button);
      }, 1400),
    );
  }

  #restoreCopied(button) {
    const prior = this._copiedTimers.get(button);
    if (prior != null) {
      clearTimeout(prior);
      this._copiedTimers.delete(button);
    }
    if (button.dataset.clipboardOriginalHtml != null) {
      button.innerHTML = button.dataset.clipboardOriginalHtml;
      delete button.dataset.clipboardOriginalHtml;
    } else if (button.dataset.clipboardOriginal != null) {
      button.textContent = button.dataset.clipboardOriginal;
      delete button.dataset.clipboardOriginal;
    } else {
      return;
    }

    if (button.dataset.clipboardAriaLabel != null) {
      button.setAttribute("aria-label", button.dataset.clipboardAriaLabel);
      delete button.dataset.clipboardAriaLabel;
    }
    if (button.dataset.clipboardTitle != null) {
      button.setAttribute("title", button.dataset.clipboardTitle);
      delete button.dataset.clipboardTitle;
    }
    button.classList.remove("is-copied");
  }
}
