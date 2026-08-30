import { Controller } from "@hotwired/stimulus";

const FETCH_DEBOUNCE_MS = 220;
const BACKDROP_SEL = "[data-global-search-backdrop]";
const DIALOG_SEL = '[role="dialog"]';

function buildSearchRequestUrl(urlValue, queryTrimmed) {
  const url = new URL(urlValue, window.location.origin);
  url.searchParams.set("q", queryTrimmed);
  return url.toString();
}

function isCmdOrCtrlK(event) {
  return (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k";
}

/** Match Tailwind `lg` — topbar search is shown at this breakpoint and up. */
function isDesktopSearchViewport() {
  return window.matchMedia("(min-width: 1024px)").matches;
}

export default class extends Controller {
  static values = { url: String };

  connect() {
    this.debounceTimer = null;
    this.abortController = null;
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

  /** Reparented backdrop: input is outside `data-controller`, so Stimulus cannot delegate actions. */
  onModalInput = () => {
    clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => this.runFetch(), FETCH_DEBOUNCE_MS);
  };

  onModalFocus = () => {
    if (!this.modalOpen()) return;
    this.fetchImmediate();
  };

  bindModalInput() {
    this.refreshDomRefs();
    const input = this.inputEl;
    if (!input || this._modalInputBound) return;
    this._modalInputBound = true;
    input.addEventListener("input", this.onModalInput);
    input.addEventListener("focus", this.onModalFocus);
  }

  unbindModalInput() {
    this.refreshDomRefs();
    const input = this.inputEl;
    if (!input || !this._modalInputBound) return;
    this._modalInputBound = false;
    input.removeEventListener("input", this.onModalInput);
    input.removeEventListener("focus", this.onModalFocus);
  }

  refreshDomRefs() {
    if (this.backdropEl && document.body.contains(this.backdropEl)) {
      this.inputEl = this.backdropEl.querySelector("[data-global-search-input]");
      this.contentEl = this.backdropEl.querySelector("[data-global-search-content]");
      return;
    }
    this.backdropEl = this.element.querySelector(BACKDROP_SEL);
    this.inputEl = this.backdropEl?.querySelector("[data-global-search-input]");
    this.contentEl = this.backdropEl?.querySelector("[data-global-search-content]");
  }

  /** After open or when already visible: bind reparented input, focus, fetch (defer once when DOM just updated). */
  activateModalInteraction({ defer = false } = {}) {
    const run = () => {
      this.refreshDomRefs();
      this.bindModalInput();
      this.inputEl?.focus();
      this.fetchImmediate();
    };
    if (defer) queueMicrotask(run);
    else run();
  }

  onGlobalKeydown = (event) => {
    if (!isCmdOrCtrlK(event) || !isDesktopSearchViewport()) return;
    event.preventDefault();
    this.refreshDomRefs();
    if (this.backdropEl && !this.backdropEl.classList.contains("hidden")) {
      this.activateModalInteraction();
      return;
    }
    this.open();
  };

  onDialogKeydown = (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      this.close();
    }
  };

  /** Overlay dimmed hit target (reparented: no Stimulus bubbling from backdrop to controller root). */
  onBackdropClick = (event) => {
    const dialog = this.backdropEl?.querySelector(DIALOG_SEL);
    if (dialog?.contains(event.target)) return;
    this.close();
  };

  /** Dismiss when tapping outside stacking context gaps. */
  onOutsidePointerDown = (event) => {
    const t = event.target;
    if (this.element.contains(t)) return;
    if (this.backdropEl?.contains(t)) return;
    this.close();
  };

  stopPanelClick(event) {
    event.stopPropagation();
  }

  teardownDismissListeners() {
    document.removeEventListener("keydown", this.onDialogKeydown);
    this.backdropEl?.removeEventListener("click", this.onBackdropClick);
    document.removeEventListener("pointerdown", this.onOutsidePointerDown, true);
  }

  open() {
    this.refreshDomRefs();
    if (!this.backdropEl) return;
    if (!this.backdropEl.classList.contains("hidden")) {
      this.activateModalInteraction({ defer: true });
      return;
    }
    this.teardownDismissListeners();
    this.moveBackdropToBody();
    this.refreshDomRefs();
    this.backdropEl.classList.remove("hidden");
    this.backdropEl.removeAttribute("aria-hidden");
    this.backdropEl.addEventListener("click", this.onBackdropClick);
    document.addEventListener("pointerdown", this.onOutsidePointerDown, true);
    document.addEventListener("keydown", this.onDialogKeydown);
    this.activateModalInteraction({ defer: true });
  }

  close() {
    this.refreshDomRefs();
    this.unbindModalInput();
    this.teardownDismissListeners();
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
    if (this.backdropEl) {
      this.backdropEl.classList.add("hidden");
      this.backdropEl.setAttribute("aria-hidden", "true");
    }
    if (this.inputEl) this.inputEl.value = "";
    this.restoreBackdropParent();
    this.refreshDomRefs();
    if (this.contentEl) this.contentEl.innerHTML = "";
  }

  openFromTrigger(event) {
    event.preventDefault();
    this.open();
  }

  moveBackdropToBody() {
    const el = this.backdropEl;
    if (!el || el.parentNode === document.body) return;
    this.backdropOriginalParent = el.parentNode;
    this.backdropOriginalNextSibling = el.nextSibling;
    document.body.appendChild(el);
  }

  restoreBackdropParent() {
    const el = this.backdropEl;
    if (!el || !this.backdropOriginalParent) return;
    const parent = this.backdropOriginalParent;
    const next = this.backdropOriginalNextSibling;
    this.backdropOriginalParent = null;
    this.backdropOriginalNextSibling = null;
    if (next && next.parentNode === parent) parent.insertBefore(el, next);
    else parent.appendChild(el);
  }

  modalOpen() {
    this.refreshDomRefs();
    return !!(this.backdropEl && !this.backdropEl.classList.contains("hidden"));
  }

  fetchImmediate() {
    clearTimeout(this.debounceTimer);
    this.runFetch();
  }

  async runFetch() {
    this.refreshDomRefs();
    if (!this.contentEl || !this.inputEl) return;
    if (this.abortController) this.abortController.abort();
    this.abortController = new AbortController();

    const q = this.inputEl.value.trim();
    const requestUrl = buildSearchRequestUrl(this.urlValue, q);

    try {
      const res = await fetch(requestUrl, {
        cache: "no-store",
        signal: this.abortController.signal,
        headers: { Accept: "text/html", "X-Requested-With": "XMLHttpRequest" },
        credentials: "same-origin",
      });
      if (!res.ok) return;
      const html = await res.text();
      this.contentEl.innerHTML = html;
    } catch (e) {
      if (e.name === "AbortError") return;
    }
  }

  boundBeforeCache = () => {
    this.close();
  };
}
