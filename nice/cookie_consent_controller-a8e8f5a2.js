import { Controller } from "@hotwired/stimulus";
import { analyticsPreference, readConsent, writeConsent } from "cookie_consent";
import { lockScroll, unlockScroll } from "lib/scroll_lock";

// Banner + preferences UI. Toggle is cosmetic for now; analytics stays on.
export default class extends Controller {
  static targets = ["banner", "panel", "analyticsToggle"];

  connect() {
    this.boundOpenClick = (event) => {
      const trigger = event.target.closest("[data-cookie-consent-open]");
      if (!trigger) return;
      event.preventDefault();
      this.openPreferences();
    };
    this.boundKeydown = (event) => {
      if (event.key === "Escape" && this.#panelOpen()) this.closePreferences(event);
    };
    document.addEventListener("click", this.boundOpenClick);
    document.addEventListener("keydown", this.boundKeydown);
    this.#syncUi();
  }

  disconnect() {
    document.removeEventListener("click", this.boundOpenClick);
    document.removeEventListener("keydown", this.boundKeydown);
    unlockScroll(this);
  }

  acceptAll(event) {
    event?.preventDefault();
    writeConsent({ analytics: true });
    this.#afterChoice();
  }

  rejectNonEssential(event) {
    event?.preventDefault();
    writeConsent({ analytics: false });
    this.#afterChoice();
  }

  openPreferences(event) {
    event?.preventDefault();
    this.#syncToggleFromStore();
    if (this.hasBannerTarget) this.#setVisible(this.bannerTarget, false);
    if (this.hasPanelTarget) this.#setVisible(this.panelTarget, true);
  }

  closePreferences(event) {
    event?.preventDefault();
    if (this.hasPanelTarget) this.#setVisible(this.panelTarget, false);
    this.#syncUi();
  }

  savePreferences(event) {
    event?.preventDefault();
    const analytics = this.hasAnalyticsToggleTarget
      ? Boolean(this.analyticsToggleTarget.checked)
      : true;
    writeConsent({ analytics });
    this.#afterChoice();
  }

  #afterChoice() {
    if (this.hasPanelTarget) this.#setVisible(this.panelTarget, false);
    this.#syncUi();
  }

  #syncUi() {
    if (!this.hasBannerTarget) return;
    this.#setVisible(this.bannerTarget, !readConsent());
    this.#syncToggleFromStore();
  }

  #syncToggleFromStore() {
    if (!this.hasAnalyticsToggleTarget) return;
    this.analyticsToggleTarget.checked = analyticsPreference();
  }

  #panelOpen() {
    return this.hasPanelTarget && !this.panelTarget.classList.contains("hidden");
  }

  #setVisible(el, visible) {
    if (!el) return;
    el.classList.toggle("hidden", !visible);
    el.hidden = !visible;
    el.setAttribute("aria-hidden", visible ? "false" : "true");
    if (el === this.panelTarget) {
      if (visible) lockScroll(this);
      else unlockScroll(this);
      window.dispatchEvent(
        new CustomEvent("cookie-consent:panel-change", { detail: { open: visible } }),
      );
    }
    if (this.hasBannerTarget && el === this.bannerTarget) {
      window.dispatchEvent(
        new CustomEvent("cookie-consent:banner-change", { detail: { open: visible } }),
      );
    }
  }
}
