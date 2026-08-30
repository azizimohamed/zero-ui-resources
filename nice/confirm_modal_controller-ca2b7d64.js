import { Controller } from "@hotwired/stimulus";
import { setConfirmActionImpl, resetConfirmActionImpl } from "lib/confirm";
import { lockScroll, unlockScroll } from "lib/scroll_lock";

const LEAVE_MS = 140;
const ICON_VARIANTS = ["default", "warning", "danger"];

export default class extends Controller {
  static targets = [
    "scrim",
    "panel",
    "icon",
    "iconDefault",
    "iconWarning",
    "iconDanger",
    "title",
    "message",
    "subject",
    "subjectDot",
    "subjectName",
    "subjectMeta",
    "subjectStatWrap",
    "subjectStat",
    "subjectStatLabel",
    "consequences",
    "field",
    "fieldLabel",
    "input",
    "hint",
    "cancelButton",
    "confirmButton",
    "closeButton",
  ];

  connect() {
    setConfirmActionImpl((opts) => this.openPromise(opts));
    this._onDocKeydown = (e) => this.onDocKeydown(e);
    this._focusables = [];
  }

  disconnect() {
    if (this._resolve) {
      this.finish(false);
    } else {
      this.teardownOpen();
      this.element.hidden = true;
      this.element.classList.remove("cbm--open", "cbm--leaving");
      this.element.setAttribute("aria-hidden", "true");
    }
    resetConfirmActionImpl();
  }

  cancel() {
    this.finish(false);
  }

  confirm() {
    if (!this.actionEnabled()) return;
    const prompt = this._opts?.prompt;
    if (prompt) {
      this.finish(this.inputTarget.value);
      return;
    }
    this.enterBusy();
    this.finish(true);
  }

  onFieldInput() {
    this.syncActionEnabled();
    this.syncHint();
  }

  onFieldKeydown(e) {
    if (e.key === "Enter") {
      e.preventDefault();
      this.confirm();
    }
  }

  openPromise(opts) {
    return new Promise((resolve) => {
      if (this._resolve) this._resolve(false);
      this.clearLeaveTimeout();
      this._resolve = resolve;
      this._opts = opts;
      this._trigger = document.activeElement;
      this.applyOptions(opts);
      this.show();
    });
  }

  applyOptions(opts) {
    const variant = opts.variant || "default";
    this.applyVariant(variant);

    this.titleTarget.textContent = opts.title || "Continue?";
    if (opts.message) {
      this.messageTarget.hidden = false;
      this.messageTarget.classList.add("cbm__msg--prose");
      this.messageTarget.innerHTML = formatMessage(opts.message);
    } else {
      this.messageTarget.hidden = true;
      this.messageTarget.classList.remove("cbm__msg--prose");
      this.messageTarget.textContent = "";
    }

    this.applySubject(opts.subject);
    this.applyConsequences(opts.consequences, variant);
    this.applyField(opts);
    this.cancelButtonTarget.textContent = opts.cancelLabel || "Cancel";
    this.confirmButtonTarget.textContent = opts.confirmLabel || "Continue";
    this.confirmButtonTarget.classList.remove("cbm__btn--busy");
    this.confirmButtonTarget.disabled = false;
    this.syncActionEnabled();
    this.syncHint();
  }

  applyVariant(variant) {
    const v = ICON_VARIANTS.includes(variant) ? variant : "default";
    this.iconTarget.className = `cbm__icon cbm__icon--${v}`;
    this.iconDefaultTarget.classList.toggle("hidden", v !== "default");
    this.iconWarningTarget.classList.toggle("hidden", v !== "warning");
    this.iconDangerTarget.classList.toggle("hidden", v !== "danger");

    this.confirmButtonTarget.className =
      v === "danger" ? "cbm__btn cbm__btn--danger" : "cbm__btn cbm__btn--primary";
  }

  applySubject(subject) {
    if (!subject || !subject.name) {
      this.subjectTarget.hidden = true;
      return;
    }
    this.subjectTarget.hidden = false;
    this.subjectNameTarget.textContent = subject.name;
    this.subjectMetaTarget.textContent = subject.meta || "";
    this.subjectMetaTarget.hidden = !subject.meta;

    const status = subject.status || "live";
    this.subjectDotTarget.className = `cbm__sdot cbm__sdot--${status}`;

    if (subject.stat != null && subject.stat !== "") {
      this.subjectStatWrapTarget.hidden = false;
      this.subjectStatTarget.textContent = formatStat(subject.stat);
      this.subjectStatLabelTarget.textContent = subject.statLabel || subject.stat_label || "";
    } else {
      this.subjectStatWrapTarget.hidden = true;
    }
  }

  applyConsequences(list, variant) {
    const items = Array.isArray(list) ? list.filter(Boolean) : [];
    if (!items.length) {
      this.consequencesTarget.hidden = true;
      this.consequencesTarget.innerHTML = "";
      return;
    }
    this.consequencesTarget.hidden = false;
    this.consequencesTarget.innerHTML = items
      .map(
        (text) =>
          `<li><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg><span>${escapeHtml(
            String(text),
          )}</span></li>`,
      )
      .join("");
  }

  applyField(opts) {
    const requireTyped = opts.requireTyped;
    const prompt = opts.prompt;
    if (!requireTyped && !prompt) {
      this.fieldTarget.hidden = true;
      this.inputTarget.value = "";
      this._requireTyped = null;
      return;
    }
    this.fieldTarget.hidden = false;
    this._requireTyped = requireTyped ? String(requireTyped) : null;
    if (requireTyped) {
      this.fieldLabelTarget.innerHTML = `Type <code>${escapeHtml(String(requireTyped))}</code> to confirm`;
      this.inputTarget.placeholder = String(requireTyped);
      this.inputTarget.value = "";
    } else {
      this.fieldLabelTarget.textContent = prompt.label || "Value";
      this.inputTarget.placeholder = prompt.placeholder || "";
      this.inputTarget.value = prompt.value || "";
      this.inputTarget.name = prompt.name || "prompt";
    }
  }

  show() {
    this.element.hidden = false;
    this.element.removeAttribute("aria-hidden");
    this.element.classList.remove("cbm--leaving");
    this.element.classList.add("cbm--open");
    lockScroll(this);
    this.setAppInert(true);
    document.addEventListener("keydown", this._onDocKeydown, true);

    queueMicrotask(() => {
      this.refreshFocusables();
      this.focusInitial();
    });
  }

  focusInitial() {
    const opts = this._opts || {};
    if (!this.fieldTarget.hidden && this.hasInputTarget) {
      this.inputTarget.focus();
    } else if (opts.variant === "danger") {
      this.cancelButtonTarget.focus();
    } else {
      this.confirmButtonTarget.focus();
    }
  }

  actionEnabled() {
    if (this.confirmButtonTarget.classList.contains("cbm__btn--busy")) return false;
    if (!this._requireTyped) return true;
    return this.inputTarget.value.trim() === this._requireTyped;
  }

  syncActionEnabled() {
    const ok = this.actionEnabled();
    this.confirmButtonTarget.disabled = !ok;
    if (this.hasInputTarget && this._requireTyped) {
      this.inputTarget.classList.toggle(
        "cbm__input--match",
        ok && this.inputTarget.value.length > 0,
      );
    }
  }

  syncHint() {
    if (this._requireTyped && !this.actionEnabled()) {
      this.hintTarget.innerHTML = `confirm text required`;
    } else {
      this.hintTarget.innerHTML = `<span class="cbm__kbd">Esc</span> cancel`;
    }
  }

  enterBusy() {
    this.confirmButtonTarget.classList.add("cbm__btn--busy");
    this.confirmButtonTarget.disabled = true;
    const label = this.confirmButtonTarget.textContent;
    this.confirmButtonTarget.innerHTML = `<span class="cbm__spin" aria-hidden="true"></span>${escapeHtml(label)}`;
  }

  finish(result) {
    if (!this._resolve) return;
    const res = this._resolve;
    this._resolve = null;
    res(result);
    this.hide();
  }

  hide() {
    this.element.classList.remove("cbm--open");
    this.element.classList.add("cbm--leaving");
    this.teardownOpen(false);
    this.clearLeaveTimeout();
    this._leaveTimeoutId = window.setTimeout(() => {
      this._leaveTimeoutId = null;
      this.element.hidden = true;
      this.element.classList.remove("cbm--leaving");
      this.element.setAttribute("aria-hidden", "true");
      this.restoreFocus();
    }, LEAVE_MS);
  }

  teardownOpen(restoreFocus = true) {
    document.removeEventListener("keydown", this._onDocKeydown, true);
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

  onDocKeydown(e) {
    if (this.element.hidden) return;
    if (e.key === "Escape") {
      e.preventDefault();
      this.cancel();
      return;
    }
    if (e.key === "Tab") {
      this.trapFocus(e);
      return;
    }
    if (e.key === "Enter" && !e.target.matches("textarea")) {
      // Cancel/Close must activate themselves — never force-confirm over them.
      if (
        e.target === this.cancelButtonTarget ||
        e.target === this.closeButtonTarget ||
        e.target === this.scrimTarget
      ) {
        return;
      }
      if (this.hasInputTarget && e.target === this.inputTarget) return;
      if (!this.actionEnabled()) return;
      e.preventDefault();
      this.confirm();
    }
  }

  refreshFocusables() {
    const sel =
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
    this._focusables = Array.from(this.panelTarget.querySelectorAll(sel)).filter(
      (el) => !el.hasAttribute("disabled") && el.offsetParent !== null,
    );
  }

  trapFocus(e) {
    this.refreshFocusables();
    const list = this._focusables;
    if (!list.length) return;
    const first = list[0];
    const last = list[list.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  setAppInert(on) {
    Array.from(document.body.children).forEach((node) => {
      if (node === this.element) return;
      if (on) {
        if (!node.hasAttribute("data-cbm-inert")) {
          node.setAttribute("data-cbm-inert", node.inert ? "1" : "0");
        }
        node.inert = true;
      } else if (node.hasAttribute("data-cbm-inert")) {
        const prev = node.getAttribute("data-cbm-inert");
        node.inert = prev === "1";
        node.removeAttribute("data-cbm-inert");
      }
    });
  }

  clearLeaveTimeout() {
    if (this._leaveTimeoutId == null) return;
    window.clearTimeout(this._leaveTimeoutId);
    this._leaveTimeoutId = null;
  }
}

function formatMessage(message) {
  const escaped = escapeHtml(String(message));
  return escaped.replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");
}

function formatStat(stat) {
  const n = Number(stat);
  if (Number.isFinite(n)) return n.toLocaleString();
  return String(stat);
}

function escapeHtml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
