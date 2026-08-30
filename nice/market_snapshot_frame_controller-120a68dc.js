import { Controller } from "@hotwired/stimulus";

/**
 * Busy overlay for Market Snapshot Turbo Frame navigations (facets, year, sample window).
 * Shows when Turbo marks the frame busy; clears on frame-load / fetch error / safety timer.
 * Does not clear when [busy] drops mid-flight (aborted prior request).
 */
export default class extends Controller {
  static targets = ["shell", "frame", "overlay"];

  static values = {
    safetyMs: { type: Number, default: 12_000 },
  };

  connect() {
    this._generation = 0;
    this._safetyTimer = null;
    this._onClick = this.onClick.bind(this);
    this._onFrameLoad = this.onFrameSettled.bind(this);
    this._onFetchError = this.onFrameSettled.bind(this);
    this._onBusyAttr = this.onBusyAttr.bind(this);

    this.element.addEventListener("click", this._onClick, true);
    document.addEventListener("turbo:frame-load", this._onFrameLoad);
    document.addEventListener("turbo:fetch-request-error", this._onFetchError);

    if (this.frameEl) {
      this._busyObserver = new MutationObserver(this._onBusyAttr);
      this._busyObserver.observe(this.frameEl, {
        attributes: true,
        attributeFilter: ["busy"],
      });
    }
  }

  disconnect() {
    this.element.removeEventListener("click", this._onClick, true);
    document.removeEventListener("turbo:frame-load", this._onFrameLoad);
    document.removeEventListener("turbo:fetch-request-error", this._onFetchError);
    this._busyObserver?.disconnect();
    this._busyObserver = null;
    this.clearSafetyTimer();
    this.clearBusy();
  }

  get frameEl() {
    if (this.hasFrameTarget) return this.frameTarget;
    return this.element.querySelector("#market_snapshot");
  }

  onClick(event) {
    if (!this.isSignificantClick(event)) return;

    const control = event.target.closest?.("[data-ms-frame-nav]");
    if (!control || !this.element.contains(control)) return;

    const href = control.getAttribute?.("href") || control.dataset?.href;
    if (!href) return;

    if (this.sameLocation(href)) {
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }

    this.markPending(control);
    this.showBusy();
  }

  onBusyAttr() {
    // Only show when Turbo arms busy. Never clear here — an aborted prior
    // request removes [busy] while the next fetch is already in flight.
    if (this.frameEl?.hasAttribute("busy")) this.showBusy();
  }

  onFrameSettled(event) {
    if (!this.isOurFrameEvent(event)) return;
    this.clearBusy();
  }

  isOurFrameEvent(event) {
    const target = event.target;
    if (!(target instanceof Element)) return false;
    if (target.id === "market_snapshot") return true;
    return this.frameEl != null && target === this.frameEl;
  }

  isSignificantClick(event) {
    if (event.defaultPrevented) return false;
    if (event.button != null && event.button !== 0) return false;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return false;
    return true;
  }

  showBusy() {
    if (!this.hasShellTarget) return;
    this._generation += 1;
    this.shellTarget.classList.add("is-loading");
    this.shellTarget.setAttribute("aria-busy", "true");
    if (this.hasOverlayTarget) {
      this.overlayTarget.hidden = false;
      this.overlayTarget.setAttribute("aria-hidden", "false");
    }
    this.armSafetyTimer(this._generation);
  }

  clearBusy() {
    this.clearSafetyTimer();
    if (!this.hasShellTarget) return;
    this.shellTarget.classList.remove("is-loading");
    this.shellTarget.removeAttribute("aria-busy");
    this.shellTarget.querySelectorAll(".is-pending").forEach((el) => {
      el.classList.remove("is-pending");
    });
    if (this.hasOverlayTarget) {
      this.overlayTarget.hidden = true;
      this.overlayTarget.setAttribute("aria-hidden", "true");
    }
  }

  armSafetyTimer(generation) {
    this.clearSafetyTimer();
    this._safetyTimer = window.setTimeout(() => {
      if (generation !== this._generation) return;
      this.clearBusy();
    }, this.safetyMsValue);
  }

  clearSafetyTimer() {
    if (this._safetyTimer != null) {
      window.clearTimeout(this._safetyTimer);
      this._safetyTimer = null;
    }
  }

  markPending(control) {
    this.shellTarget?.querySelectorAll(".is-pending").forEach((el) => {
      el.classList.remove("is-pending");
    });
    control.classList.add("is-pending");
  }

  sameLocation(href) {
    try {
      const next = new URL(href, window.location.origin);
      const cur = new URL(window.location.href);
      return next.pathname === cur.pathname && next.search === cur.search;
    } catch {
      return false;
    }
  }
}
