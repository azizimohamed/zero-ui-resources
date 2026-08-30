import { Controller } from "@hotwired/stimulus";
import { lockScroll, unlockScroll } from "lib/scroll_lock";
import { clearTurboBusyState } from "turbo_mobile_ux";

/** Matches .cbm leave animation (120ms) plus a small buffer. */
const LEAVE_MS = 140;

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

// Create-monitor leave prompt: Save as draft / Discard / Keep editing.
// Owns nav guards + modal lifecycle so the wizard controller stays under the
// house 1k-line budget. Visual shell matches Ui::ConfirmModal (.cbm).
//
// The overlay is portaled to document.body on connect so position:fixed is not
// clipped by .wiz-shell / #turbo-main-pane overflow:hidden. Button actions are
// wired manually because Stimulus data-action cannot reach a controller that is
// no longer an ancestor after the portal. turbo:before-cache restores the node
// under the form so Turbo snapshots keep a working target on Back/preview.
export default class extends Controller {
  static targets = ["leaveModal"];

  static values = {
    createMode: { type: Boolean, default: false },
    leaveUrl: { type: String, default: "/monitors" },
  };

  connect() {
    this.allowLeave = false;
    this.dirty = false;
    this.pendingLeaveUrl = null;
    this._trigger = null;
    this._focusables = [];
    this.wizardPath = null;
    this.guardEntryPushed = false;
    this.boundLeaveKeydown = this.onLeaveKeydown.bind(this);
    this.boundBeforeCache = this.onBeforeCache.bind(this);
    document.addEventListener("turbo:before-cache", this.boundBeforeCache);

    this.reconcileLeaveModal();
    this.portalLeaveModal();
    this.wireLeaveModalActions();
    this.bindLeaveGuards();
  }

  disconnect() {
    document.removeEventListener("turbo:before-cache", this.boundBeforeCache);
    // Never history.back() here. It races an in-flight wizard POST and surfaces as
    // DELETE /monitors (404) in production logs.
    this.guardEntryPushed = false;
    this.unbindLeaveGuards();
    this.teardownLeaveOpen(false);
    this.clearLeaveTimeout();
    this.unwireLeaveModalActions();
    this.removeOrRestoreLeaveModal();
  }

  // Called from the wizard when a real submit is about to navigate away.
  allowNextLeave() {
    this.allowLeave = true;
    this.dirty = false;
    // Do not history.back() here: it runs during submit and can cancel a
    // turbo:false POST before the browser sends it (404 DELETE /monitors).
    this.clearHistoryGuardState();
  }

  requestLeave(event) {
    if (!this.shouldGuardLeave()) return;

    event.preventDefault();
    clearTurboBusyState();
    this._trigger = event.currentTarget;
    const href = event.currentTarget?.getAttribute?.("href");
    this.pendingLeaveUrl = href || this.leaveUrlValue;
    this.openLeaveModal();
  }

  leaveStay() {
    this.closeLeaveModal();
    this.pendingLeaveUrl = null;
  }

  leaveDiscard() {
    const url = this.pendingLeaveUrl || this.leaveUrlValue;
    this.allowLeave = true;
    this.clearHistoryGuardState();
    this.closeLeaveModal();
    this.navigateAway(url);
  }

  leaveSaveDraft() {
    this.allowLeave = true;
    this.closeLeaveModal();

    const draftButton = this.element.querySelector(
      'button[type="submit"][name="search_profile[submit_kind]"][value="save_draft"]',
    );
    if (draftButton) {
      // Same as allowNextLeave: no history.back() while requestSubmit runs.
      this.clearHistoryGuardState();
      draftButton.setAttribute("formnovalidate", "");
      this.element.requestSubmit(draftButton);
      return;
    }

    this.clearHistoryGuardState();
    this.navigateAway(this.leaveUrlValue);
  }

  bindLeaveGuards() {
    if (!this.createModeValue) return;

    this.wizardPath = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    this.installHistoryGuard();

    this.boundBeforeVisit = this.onBeforeVisit.bind(this);
    this.boundLeaveClick = this.onLeaveClick.bind(this);
    this.boundDocNavClick = this.onDocNavClick.bind(this);
    this.boundPopState = this.onPopState.bind(this);
    this.boundBeforeUnload = this.onBeforeUnload.bind(this);
    this.boundMarkDirty = this.markDirty.bind(this);
    document.addEventListener("turbo:before-visit", this.boundBeforeVisit, true);
    // Form has data-turbo="false", so in-form links skip turbo:before-visit.
    this.element.addEventListener("click", this.boundLeaveClick, true);
    // Bottom nav / sidebar use Turbo Drive; intercept before a cancelled visit
    // leaves mobile main-pane shimmer with no dialog.
    document.addEventListener("click", this.boundDocNavClick, true);
    window.addEventListener("popstate", this.boundPopState, true);
    window.addEventListener("beforeunload", this.boundBeforeUnload);
    this.element.addEventListener("input", this.boundMarkDirty, true);
    this.element.addEventListener("change", this.boundMarkDirty, true);
  }

  markDirty(event) {
    if (!event.isTrusted) return;
    if (event.target?.name === "authenticity_token") return;
    this.dirty = true;
  }

  onBeforeUnload(event) {
    if (!this.createModeValue || this.allowLeave || !this.dirty) return;

    event.preventDefault();
    event.returnValue = "";
  }

  unbindLeaveGuards() {
    if (this.boundBeforeVisit) {
      document.removeEventListener("turbo:before-visit", this.boundBeforeVisit, true);
      this.boundBeforeVisit = null;
    }
    if (this.boundLeaveClick) {
      this.element.removeEventListener("click", this.boundLeaveClick, true);
      this.boundLeaveClick = null;
    }
    if (this.boundDocNavClick) {
      document.removeEventListener("click", this.boundDocNavClick, true);
      this.boundDocNavClick = null;
    }
    if (this.boundPopState) {
      window.removeEventListener("popstate", this.boundPopState, true);
      this.boundPopState = null;
    }
    if (this.boundBeforeUnload) {
      window.removeEventListener("beforeunload", this.boundBeforeUnload);
      this.boundBeforeUnload = null;
    }
    if (this.boundMarkDirty) {
      this.element.removeEventListener("input", this.boundMarkDirty, true);
      this.element.removeEventListener("change", this.boundMarkDirty, true);
      this.boundMarkDirty = null;
    }
  }

  onBeforeVisit(event) {
    if (!this.shouldGuardLeave()) return;

    const nextUrl = event.detail?.url;
    if (!nextUrl) return;
    if (!this.isLeavingWizardUrl(nextUrl)) return;

    event.preventDefault();
    clearTurboBusyState();
    this._trigger = document.activeElement;
    this.pendingLeaveUrl = nextUrl;
    this.openLeaveModal();
  }

  onPopState(event) {
    if (!this.shouldGuardLeave()) return;
    if (event.state?.wizardLeaveGuard) return;

    const intended = this.absoluteUrl(window.location.href);
    event.stopImmediatePropagation();
    clearTurboBusyState();
    this.installHistoryGuard();
    this._trigger = null;
    this.pendingLeaveUrl = intended !== this.wizardPath ? intended : this.leaveUrlValue;
    this.openLeaveModal();
  }

  installHistoryGuard() {
    if (history.state?.wizardLeaveGuard) return;

    history.pushState({ wizardLeaveGuard: true }, "", this.wizardPath);
    this.guardEntryPushed = true;
  }

  clearHistoryGuardState() {
    this.guardEntryPushed = false;
  }

  onDocNavClick(event) {
    if (!this.shouldGuardLeave()) return;
    if (event.defaultPrevented) return;
    if (event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

    const raw = event.target;
    const from = typeof raw?.closest === "function" ? raw : raw?.parentElement;
    const anchor = from?.closest?.("a[href]");
    if (!anchor || this.element.contains(anchor)) return;
    if (!anchor.closest("#app-bottom-nav, #app-sidebar, .topbar--app")) return;

    if (anchor.hasAttribute("download")) return;
    if ((anchor.getAttribute("target") || "").toLowerCase() === "_blank") return;
    if (anchor.dataset.turboMethod) return;

    const href = anchor.getAttribute("href");
    if (!href || href.startsWith("#") || href.startsWith("javascript:")) return;
    if (!this.isLeavingWizardUrl(href)) return;

    event.preventDefault();
    event.stopPropagation();
    clearTurboBusyState();
    this._trigger = anchor;
    this.pendingLeaveUrl = this.absoluteUrl(href);
    this.openLeaveModal();
  }

  onLeaveClick(event) {
    if (!this.shouldGuardLeave()) return;
    if (event.defaultPrevented) return;
    if (event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

    const raw = event.target;
    const from = typeof raw?.closest === "function" ? raw : raw?.parentElement;
    const anchor = from?.closest?.("a[href]");
    if (!anchor || !this.element.contains(anchor)) return;

    // Back / Cancel already call requestLeave via data-action — do not capture-stop them.
    const action = anchor.getAttribute("data-action") || "";
    if (action.includes("wizard-leave#requestLeave")) return;

    if (anchor.hasAttribute("download")) return;
    if ((anchor.getAttribute("target") || "").toLowerCase() === "_blank") return;
    if (anchor.dataset.turboMethod) return;

    const href = anchor.getAttribute("href");
    if (!href || href.startsWith("#") || href.startsWith("javascript:")) return;
    if (!this.isLeavingWizardUrl(href)) return;

    event.preventDefault();
    event.stopPropagation();
    clearTurboBusyState();
    this._trigger = anchor;
    this.pendingLeaveUrl = this.absoluteUrl(href);
    this.openLeaveModal();
  }

  isLeavingWizardUrl(href) {
    try {
      const url = new URL(href, window.location.origin);
      if (url.origin !== window.location.origin) return false;
      return url.pathname !== window.location.pathname;
    } catch {
      return false;
    }
  }

  absoluteUrl(href) {
    try {
      const url = new URL(href, window.location.origin);
      return `${url.pathname}${url.search}${url.hash}`;
    } catch {
      return href;
    }
  }

  shouldGuardLeave() {
    return this.createModeValue && !this.allowLeave;
  }

  reconcileLeaveModal() {
    const modals = Array.from(document.querySelectorAll("#wizard_leave_modal"));
    const inForm = modals.find((el) => this.element.contains(el));

    if (inForm) {
      modals.filter((el) => el !== inForm).forEach((el) => el.remove());
      this.leaveModalEl = inForm;
      return;
    }

    const connected = modals.filter((el) => document.contains(el));
    if (connected.length === 1) {
      this.leaveModalEl = connected[0];
      return;
    }

    if (connected.length > 1) {
      connected.slice(1).forEach((el) => el.remove());
      this.leaveModalEl = connected[0];
      return;
    }

    this.leaveModalEl = this.hasLeaveModalTarget ? this.leaveModalTarget : null;
  }

  openLeaveModal() {
    clearTurboBusyState();
    this.reconcileLeaveModal();
    this.portalLeaveModal();
    this.wireLeaveModalActions();

    const modal = this.leaveModalEl;
    if (!modal || !document.contains(modal)) return;
    if (!modal.hidden && modal.classList.contains("cbm--open")) {
      if (this.pendingLeaveUrl) this._trigger = this._trigger || document.activeElement;
      return;
    }

    this.clearLeaveTimeout();
    modal.hidden = false;
    modal.removeAttribute("aria-hidden");
    modal.classList.remove("cbm--leaving");
    modal.classList.add("cbm--open");
    lockScroll(this);
    this.setAppInert(true);
    document.addEventListener("keydown", this.boundLeaveKeydown, true);

    queueMicrotask(() => {
      this.refreshFocusables();
      modal.querySelector(".cbm__btn--primary")?.focus();
    });
  }

  closeLeaveModal() {
    const modal = this.leaveModalEl;
    if (!modal) return;

    modal.classList.remove("cbm--open");
    modal.classList.add("cbm--leaving");
    this.teardownLeaveOpen(false);

    this.clearLeaveTimeout();
    this.leaveTimeoutId = window.setTimeout(() => {
      this.leaveTimeoutId = null;
      modal.hidden = true;
      modal.classList.remove("cbm--leaving");
      modal.setAttribute("aria-hidden", "true");
      this.restoreFocus();
    }, LEAVE_MS);
  }

  onLeaveKeydown(event) {
    const modal = this.leaveModalEl;
    if (!modal || modal.hidden) return;

    if (event.key === "Escape") {
      event.preventDefault();
      this.leaveStay();
      return;
    }

    if (event.key === "Tab") this.trapFocus(event);
  }

  refreshFocusables() {
    const modal = this.leaveModalEl;
    if (!modal) {
      this._focusables = [];
      return;
    }
    const panel = modal.querySelector(".cbm__panel") || modal;
    this._focusables = Array.from(panel.querySelectorAll(FOCUSABLE)).filter(
      (el) => !el.hasAttribute("disabled") && el.offsetParent !== null,
    );
  }

  trapFocus(event) {
    this.refreshFocusables();
    const list = this._focusables;
    if (!list.length) return;
    const first = list[0];
    const last = list[list.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  teardownLeaveOpen(restoreFocus = true) {
    document.removeEventListener("keydown", this.boundLeaveKeydown, true);
    unlockScroll(this);
    this.setAppInert(false);
    if (restoreFocus) this.restoreFocus();
  }

  restoreFocus() {
    const el = this._trigger;
    this._trigger = null;
    if (el && typeof el.focus === "function" && document.contains(el)) {
      try {
        el.focus({ preventScroll: true });
      } catch (_err) {
        /* ignore */
      }
    }
  }

  clearLeaveTimeout() {
    if (!this.leaveTimeoutId) return;
    window.clearTimeout(this.leaveTimeoutId);
    this.leaveTimeoutId = null;
  }

  navigateAway(url) {
    if (window.Turbo?.visit) {
      window.Turbo.visit(url);
      return;
    }
    window.location.href = url;
  }

  // Same inert fence as Ui::ConfirmModal so the app shell leaves the a11y tree.
  setAppInert(on) {
    const modal = this.leaveModalEl;

    if (on) {
      if (!modal || !document.contains(modal)) return;
      Array.from(document.body.children).forEach((node) => {
        if (node === modal) return;
        if (!node.hasAttribute("data-cbm-inert")) {
          node.setAttribute("data-cbm-inert", node.inert ? "1" : "0");
        }
        node.inert = true;
      });
      return;
    }

    Array.from(document.body.children).forEach((node) => {
      if (node.hasAttribute("data-cbm-inert")) {
        const prev = node.getAttribute("data-cbm-inert");
        node.inert = prev === "1";
        node.removeAttribute("data-cbm-inert");
      }
    });
  }

  portalLeaveModal() {
    const modal = this.leaveModalEl;
    if (!modal || modal.parentElement === document.body) return;
    document.body.appendChild(modal);
  }

  restoreLeaveModalParent() {
    const modal = this.leaveModalEl;
    if (!modal || !this.element.isConnected) return;
    if (this.element.contains(modal)) return;
    this.element.appendChild(modal);
  }

  removeOrRestoreLeaveModal() {
    const modal = this.leaveModalEl;
    if (!modal || modal.parentElement !== document.body) return;
    if (this.element.isConnected) {
      this.element.appendChild(modal);
    } else {
      modal.remove();
    }
  }

  // Snapshot must include the modal under the form, or Back/preview reconnect
  // finds no target after orphan cleanup.
  onBeforeCache() {
    this.clearLeaveTimeout();
    this.teardownLeaveOpen(false);
    const modal = this.leaveModalEl;
    if (modal) {
      modal.hidden = true;
      modal.classList.remove("cbm--open", "cbm--leaving");
      modal.setAttribute("aria-hidden", "true");
    }
    this.restoreLeaveModalParent();
  }

  wireLeaveModalActions() {
    const modal = this.leaveModalEl;
    if (!modal) return;

    this.unwireLeaveModalActions();
    this.boundModalClick = (event) => {
      const action = event.target.closest("[data-wizard-leave-action]")?.dataset?.wizardLeaveAction;
      if (!action) return;
      event.preventDefault();
      if (action === "discard") this.leaveDiscard();
      else if (action === "stay") this.leaveStay();
      else if (action === "draft") this.leaveSaveDraft();
    };
    modal.addEventListener("click", this.boundModalClick);
  }

  unwireLeaveModalActions() {
    if (!this.boundModalClick || !this.leaveModalEl) {
      this.boundModalClick = null;
      return;
    }
    this.leaveModalEl.removeEventListener("click", this.boundModalClick);
    this.boundModalClick = null;
  }
}
