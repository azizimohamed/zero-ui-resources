import { Controller } from "@hotwired/stimulus";

const FETCH_DEBOUNCE_MS = 220;
const BACKDROP_SEL = "[data-admin-search-backdrop]";
const DIALOG_SEL = '[role="dialog"]';

function buildSearchRequestUrl(urlValue, queryTrimmed) {
  const url = new URL(urlValue, window.location.origin);
  url.searchParams.set("q", queryTrimmed);
  return url.toString();
}

function isCmdOrCtrlK(event) {
  return (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k";
}

export default class extends Controller {
  static values = { url: String };

  connect() {
    this.debounceTimer = null;
    this.abortController = null;
    this.onGlobalKeydown = this.onGlobalKeydown.bind(this);
    this.boundBeforeCache = this.beforeCache.bind(this);
    document.addEventListener("keydown", this.onGlobalKeydown);
    document.addEventListener("turbo:before-cache", this.boundBeforeCache);
  }

  disconnect() {
    document.removeEventListener("keydown", this.onGlobalKeydown);
    document.removeEventListener("turbo:before-cache", this.boundBeforeCache);
    this.close();
    clearTimeout(this.debounceTimer);
    if (this.abortController) this.abortController.abort();
  }

  onModalInput = () => {
    clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => this.runFetch(), FETCH_DEBOUNCE_MS);
  };

  refreshDomRefs() {
    if (this.backdropEl && document.body.contains(this.backdropEl)) {
      this.inputEl = this.backdropEl.querySelector("[data-admin-search-input]");
      this.contentEl = this.backdropEl.querySelector("[data-admin-search-content]");
      return;
    }
    this.backdropEl = this.element.querySelector(BACKDROP_SEL);
    this.inputEl = this.backdropEl?.querySelector("[data-admin-search-input]");
    this.contentEl = this.backdropEl?.querySelector("[data-admin-search-content]");
  }

  bindModalInput() {
    this.refreshDomRefs();
    const input = this.inputEl;
    if (!input || this._modalInputBound) return;
    this._modalInputBound = true;
    input.addEventListener("input", this.onModalInput);
  }

  unbindModalInput() {
    this.refreshDomRefs();
    const input = this.inputEl;
    if (!input || !this._modalInputBound) return;
    this._modalInputBound = false;
    input.removeEventListener("input", this.onModalInput);
  }

  onGlobalKeydown(event) {
    if (!isCmdOrCtrlK(event)) return;
    if (event.defaultPrevented || event.altKey || event.shiftKey) return;
    if (this.isTypingTarget(event.target)) return;
    event.preventDefault();
    this.openFromTrigger();
  }

  onDialogKeydown = (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      this.close();
    }
  };

  onBackdropClick = (event) => {
    const dialog = this.backdropEl?.querySelector(DIALOG_SEL);
    if (dialog?.contains(event.target)) return;
    this.close();
  };

  openFromTrigger() {
    this.refreshDomRefs();
    if (!this.backdropEl) return;
    if (!this.backdropEl.classList.contains("hidden")) {
      this.inputEl?.focus();
      this.fetchImmediate();
      return;
    }

    this.teardownDismissListeners();
    this.backdropEl.classList.remove("hidden");
    this.backdropEl.setAttribute("aria-hidden", "false");
    document.body.appendChild(this.backdropEl);
    this.backdropEl.addEventListener("click", this.onBackdropClick);
    document.addEventListener("keydown", this.onDialogKeydown);
    this.bindModalInput();
    requestAnimationFrame(() => {
      this.inputEl?.focus();
      this.fetchImmediate();
    });
  }

  stopPanelClick(event) {
    event.stopPropagation();
  }

  teardownDismissListeners() {
    document.removeEventListener("keydown", this.onDialogKeydown);
    this.backdropEl?.removeEventListener("click", this.onBackdropClick);
  }

  close() {
    this.refreshDomRefs();
    if (!this.backdropEl) return;
    this.teardownDismissListeners();
    this.backdropEl.classList.add("hidden");
    this.backdropEl.setAttribute("aria-hidden", "true");
    if (this.backdropEl.parentElement === document.body) {
      this.element.appendChild(this.backdropEl);
    }
    if (this.inputEl) this.inputEl.value = "";
    if (this.contentEl) this.contentEl.innerHTML = "";
    this.unbindModalInput();
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  }

  beforeCache() {
    this.close();
  }

  fetchImmediate() {
    clearTimeout(this.debounceTimer);
    this.runFetch();
  }

  async runFetch() {
    this.refreshDomRefs();
    const query = this.inputEl?.value?.trim() ?? "";
    if (!this.contentEl) return;
    if (this.abortController) this.abortController.abort();
    this.abortController = new AbortController();
    try {
      const response = await fetch(buildSearchRequestUrl(this.urlValue, query), {
        signal: this.abortController.signal,
        headers: {
          Accept: "text/html",
          "X-Requested-With": "XMLHttpRequest",
        },
        credentials: "same-origin",
        cache: "no-store",
      });
      if (!response.ok) return;
      this.contentEl.innerHTML = await response.text();
    } catch (error) {
      if (error.name !== "AbortError") throw error;
    }
  }

  isTypingTarget(target) {
    if (!(target instanceof HTMLElement)) return false;
    if (target.isContentEditable) return true;
    const tag = target.tagName;
    return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
  }
}
