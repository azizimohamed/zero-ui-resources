import { Controller } from "@hotwired/stimulus";
import { CHANGED_EVENT } from "cookie_consent";

const STORAGE_KEY = "crawlbench:a2hs:dismissed-at";
const SNOOZE_MS = 30 * 24 * 60 * 60 * 1000;
const SHOW_DELAY_MS = 1800;
const STACK_GAP_PX = 8;
const BANNER_EVENT = "cookie-consent:banner-change";
const PANEL_EVENT = "cookie-consent:panel-change";

// Mobile-only Home Screen / install prompt. Stacks above the cookie banner
// when both are open so the two bottom docks never collide.
// Shown for signed-in members only (partial is not rendered for anonymous).
// `force` is set once after signup so a prior marketing dismiss does not hide it.
export default class extends Controller {
  static targets = ["sheet", "iosSteps", "androidSteps", "installBtn", "gotItBtn"];
  static values = { force: Boolean };

  connect() {
    this.deferredPrompt = null;
    this.showTimer = null;
    this.resizeObserver = null;
    this.#clearSnoozeIfForced();
    this.boundBeforeInstall = (event) => {
      // Only claim the prompt when this overlay will actually offer Install.
      // preventDefault on desktop (or when snoozed) kills Chrome's native UI.
      if (!this.#isAndroid() || this.#blockedReason()) return;
      event.preventDefault();
      this.deferredPrompt = event;
      this.#syncPlatformUi();
      this.#scheduleShow();
    };
    this.boundInstalled = () => {
      this.deferredPrompt = null;
      this.#dismiss(true);
    };
    this.boundBannerChange = () => this.#restack();
    this.boundPanelChange = () => this.#syncVisibility();
    this.boundConsentChanged = () => this.#restack();
    this.boundResize = () => this.#restack();

    window.addEventListener("beforeinstallprompt", this.boundBeforeInstall);
    window.addEventListener("appinstalled", this.boundInstalled);
    window.addEventListener(BANNER_EVENT, this.boundBannerChange);
    window.addEventListener(PANEL_EVENT, this.boundPanelChange);
    window.addEventListener(CHANGED_EVENT, this.boundConsentChanged);
    window.addEventListener("resize", this.boundResize);

    this.#observeCookieBanner();
    this.#syncPlatformUi();
    this.#scheduleShow();
  }

  disconnect() {
    window.clearTimeout(this.showTimer);
    window.removeEventListener("beforeinstallprompt", this.boundBeforeInstall);
    window.removeEventListener("appinstalled", this.boundInstalled);
    window.removeEventListener(BANNER_EVENT, this.boundBannerChange);
    window.removeEventListener(PANEL_EVENT, this.boundPanelChange);
    window.removeEventListener(CHANGED_EVENT, this.boundConsentChanged);
    window.removeEventListener("resize", this.boundResize);
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
  }

  dismiss(event) {
    event?.preventDefault();
    this.#dismiss(false);
  }

  async install(event) {
    event?.preventDefault();
    if (!this.deferredPrompt) return;
    const promptEvent = this.deferredPrompt;
    this.deferredPrompt = null;
    promptEvent.prompt();
    let outcome = "dismissed";
    try {
      outcome = (await promptEvent.userChoice)?.outcome || "dismissed";
    } catch (_) {
      /* noop */
    }
    if (outcome === "accepted") {
      this.#dismiss(true);
      return;
    }
    // User cancelled the native chooser — keep the sheet, swap back to Got it.
    this.#syncPlatformUi();
  }

  #scheduleShow() {
    window.clearTimeout(this.showTimer);
    if (!this.#eligible()) return;
    this.showTimer = window.setTimeout(() => this.#syncVisibility(), SHOW_DELAY_MS);
  }

  #syncVisibility() {
    if (!this.hasSheetTarget) return;
    const show = this.#eligible() && !this.#cookiePanelOpen();
    this.#setVisible(this.sheetTarget, show);
    if (show) this.#restack();
  }

  #syncPlatformUi() {
    const ios = this.#isIos();
    const canInstall = !ios && Boolean(this.deferredPrompt);
    if (this.hasIosStepsTarget) this.iosStepsTarget.hidden = !ios;
    if (this.hasAndroidStepsTarget) this.androidStepsTarget.hidden = ios;
    if (this.hasInstallBtnTarget) {
      this.installBtnTarget.hidden = !canInstall;
      this.installBtnTarget.classList.toggle("hidden", !canInstall);
    }
    if (this.hasGotItBtnTarget) {
      this.gotItBtnTarget.hidden = canInstall;
      this.gotItBtnTarget.classList.toggle("hidden", canInstall);
    }
  }

  #eligible() {
    return !this.#blockedReason() && this.#isMobileOs();
  }

  // Single gate for BIP claiming + sheet visibility. Force bypasses dismiss
  // snooze only; already-installed / standalone stay blocked.
  #blockedReason() {
    if (this.#isStandalone()) return "standalone";
    if (this.#storageRaw() === "installed") return "installed";
    if (!this.forceValue && this.#snoozed()) return "snoozed";
    return null;
  }

  #dismiss(permanent) {
    window.clearTimeout(this.showTimer);
    try {
      localStorage.setItem(STORAGE_KEY, permanent ? "installed" : String(Date.now()));
    } catch (_) {
      /* noop */
    }
    // Force is one-shot for this page render; clear so dismiss sticks.
    if (this.forceValue) this.forceValue = false;
    if (this.hasSheetTarget) this.#setVisible(this.sheetTarget, false);
  }

  #clearSnoozeIfForced() {
    if (!this.forceValue) return;
    try {
      if (localStorage.getItem(STORAGE_KEY) === "installed") return;
      localStorage.removeItem(STORAGE_KEY);
    } catch (_) {
      /* noop */
    }
  }

  #storageRaw() {
    try {
      return localStorage.getItem(STORAGE_KEY);
    } catch (_) {
      return null;
    }
  }

  #snoozed() {
    const raw = this.#storageRaw();
    if (!raw) return false;
    if (raw === "installed") return true;
    const at = Number(raw);
    if (!Number.isFinite(at)) return true;
    return Date.now() - at < SNOOZE_MS;
  }

  #isStandalone() {
    if (typeof navigator !== "undefined" && navigator.standalone === true) return true;
    return (
      window.matchMedia("(display-mode: standalone)").matches ||
      window.matchMedia("(display-mode: fullscreen)").matches ||
      window.matchMedia("(display-mode: minimal-ui)").matches
    );
  }

  #isIos() {
    const ua = navigator.userAgent || "";
    if (/iPad|iPhone|iPod/.test(ua)) return true;
    return navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
  }

  #isAndroid() {
    return /Android/i.test(navigator.userAgent || "");
  }

  #isMobileOs() {
    return this.#isIos() || this.#isAndroid();
  }

  #cookieBannerEl() {
    return document.querySelector("#cookie-consent [data-cookie-consent-target='banner']");
  }

  #cookiePanelEl() {
    return document.querySelector("#cookie-consent [data-cookie-consent-target='panel']");
  }

  #isOpen(el) {
    if (!el) return false;
    if (el.hidden) return false;
    return !el.classList.contains("hidden");
  }

  #cookiePanelOpen() {
    return this.#isOpen(this.#cookiePanelEl());
  }

  #observeCookieBanner() {
    const banner = this.#cookieBannerEl();
    if (!banner || typeof ResizeObserver === "undefined") return;
    this.resizeObserver = new ResizeObserver(() => this.#restack());
    this.resizeObserver.observe(banner);
  }

  #restack() {
    if (!this.hasSheetTarget || !this.#isOpen(this.sheetTarget)) return;

    let offset = 0;
    let stack = "base";
    const banner = this.#cookieBannerEl();
    if (this.#isOpen(banner)) {
      // Cookie already owns the safe-area inset; lift clear of its card.
      offset = Math.ceil(banner.getBoundingClientRect().height) + STACK_GAP_PX;
      stack = "cookie";
    } else {
      const bottomNav = document.querySelector(".bottom-nav");
      if (bottomNav) {
        const style = window.getComputedStyle(bottomNav);
        if (style.display !== "none" && style.visibility !== "hidden") {
          offset = Math.ceil(bottomNav.getBoundingClientRect().height);
          stack = "nav";
        }
      }
    }

    this.sheetTarget.dataset.stack = stack;
    this.sheetTarget.style.setProperty("--a2hs-stack-offset", `${offset}px`);
  }

  #setVisible(el, visible) {
    el.classList.toggle("hidden", !visible);
    el.hidden = !visible;
    el.setAttribute("aria-hidden", visible ? "false" : "true");
    if (!visible) {
      el.style.removeProperty("--a2hs-stack-offset");
      delete el.dataset.stack;
    }
  }
}
