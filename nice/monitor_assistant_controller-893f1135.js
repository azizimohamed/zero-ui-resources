import { Controller } from "@hotwired/stimulus";
import { lockScroll, unlockScroll } from "lib/scroll_lock";

// Chat UX: pin the thread to the latest message, Enter-to-send, starter chips
// that send immediately (or pre-fill when send=false), rail collapse, the
// mobile draft bottom sheet, and the dismissible apply dock.
export default class extends Controller {
  static targets = ["input", "submit", "thread", "desk", "sheet", "sheetToggle", "dock", "ring"];

  connect() {
    this.#ensureCallbacks();
    this.stickToBottom = true;

    document.addEventListener("turbo:before-stream-render", this._onStreamRender);
    document.addEventListener("keydown", this._onKeydown);

    if (this.hasThreadTarget) this.#bindThread(this.threadTarget);
    this.#restoreRailPreference();
    this.#syncDockVisibility();
    this.#queueScroll({ force: true });
    this.#focusComposer();
  }

  disconnect() {
    if (this._onStreamRender) {
      document.removeEventListener("turbo:before-stream-render", this._onStreamRender);
    }
    if (this._onKeydown) {
      document.removeEventListener("keydown", this._onKeydown);
    }
    if (this._boundThread) this.#unbindThread(this._boundThread);
    clearTimeout(this._scrollTimer);
    clearTimeout(this._nudgeTimer);
    cancelAnimationFrame(this._scrollRaf);
    this.#lockBodyScroll(false);
  }

  threadTargetConnected(element) {
    // Can run before connect(); callbacks must exist first.
    this.#ensureCallbacks();
    this.#bindThread(element);
    this.stickToBottom = true;
    this.#queueScroll({ force: true });
  }

  threadTargetDisconnected(element) {
    if (this._boundThread === element) this.#unbindThread(element);
  }

  dockTargetConnected() {
    this.#syncDockVisibility();
  }

  inputTargetConnected(element) {
    this.#ensureCallbacks();
    element.addEventListener("input", this._onInput);
    this.#focusComposer();
    this.autosize();
  }

  inputTargetDisconnected(element) {
    if (this._onInput) element.removeEventListener("input", this._onInput);
  }

  autosize() {
    if (!this.hasInputTarget) return;
    const el = this.inputTarget;
    el.style.height = "auto";
    const max = parseFloat(getComputedStyle(el).maxHeight);
    const next = el.scrollHeight;
    const height = Number.isFinite(max) && max > 0 ? Math.min(next, max) : next;
    el.style.height = `${height}px`;
  }

  disableWhilePending() {
    this.stickToBottom = true;
    this.#lockPending();
    this.#queueScroll({ force: true });
  }

  pressSend(event) {
    if (!this.hasSubmitTarget || this.submitTarget.disabled) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    // Visual only. Disabling here would cancel the forthcoming click/submit.
    this.#setSending(true, { pressed: true });
  }

  // Landing uses a native (non-Turbo) form submit. The submit event fires before
  // the browser builds FormData, so never clear or disable the submit control
  // here: that would drop the first prompt and open a blank thread.
  markSending() {
    this.#setSending(true, { pressed: true });
    if (this.hasInputTarget) this.inputTarget.readOnly = true;
  }

  submitOnEnter(event) {
    if (event.key !== "Enter" || event.shiftKey) return;
    event.preventDefault();
    this.#send();
  }

  useChip(event) {
    const text = event.params.text;
    if (!text || !this.hasInputTarget) return;
    if (this.inputTarget.readOnly) return;
    if (this.hasSubmitTarget && this.submitTarget.disabled) return;

    this.inputTarget.value = text;
    this.stickToBottom = true;
    this.autosize();

    // send=false: pre-fill and focus so the operator finishes the ask (gap chips).
    if (event.params.send === false) {
      this.#focusComposer();
      const el = this.inputTarget;
      const len = el.value.length;
      if (typeof el.setSelectionRange === "function") {
        el.setSelectionRange(len, len);
      }
      return;
    }

    this.#send();
  }

  focusComposer(event) {
    if (event) event.preventDefault();
    this.#focusComposer();
    if (this.hasInputTarget) {
      this.inputTarget.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  }

  toggleRail() {
    const desk = this.#deskEl();
    if (!desk) return;
    this.#setRailOff(!desk.classList.contains("rail-off"));
  }

  #setRailOff(off) {
    const desk = this.#deskEl();
    if (!desk) return;
    desk.classList.toggle("rail-off", off);
    try {
      localStorage.setItem("ma-rail", off ? "off" : "on");
    } catch (_) {
      /* ignore quota / private mode */
    }
    if (this.hasRingTarget && !window.matchMedia("(max-width: 980px)").matches) {
      this.ringTarget.setAttribute("aria-expanded", off ? "false" : "true");
    }
  }

  openReadiness() {
    if (window.matchMedia("(max-width: 980px)").matches) {
      this.toggleSheet();
      return;
    }
    this.toggleRail();
  }

  toggleSheet() {
    if (!this.hasSheetTarget) return;
    const open = !this.sheetTarget.classList.contains("is-open");
    this.#setSheetOpen(open);
  }

  closeSheet() {
    this.#setSheetOpen(false);
  }

  #setSheetOpen(open) {
    if (!this.hasSheetTarget) return;
    this.sheetTarget.classList.toggle("is-open", open);
    if (this.hasSheetToggleTarget) {
      this.sheetToggleTarget.setAttribute("aria-expanded", open ? "true" : "false");
    }
    this.#lockBodyScroll(open);
    this.#queueScroll({ force: true });
  }

  #lockBodyScroll(lock) {
    if (lock) lockScroll(this);
    else unlockScroll(this);
  }

  #syncDockVisibility() {
    if (!this.hasDockTarget) return;
    this.dockTarget.inert = !this.dockTarget.classList.contains("show");
  }

  #restoreRailPreference() {
    let pref = "on";
    try {
      pref = localStorage.getItem("ma-rail") || "on";
    } catch (_) {
      pref = "on";
    }
    this.#setRailOff(pref === "off");
  }

  #deskEl() {
    if (this.hasDeskTarget) return this.deskTarget;
    return this.element.classList.contains("ma-desk") ? this.element : null;
  }

  #ensureCallbacks() {
    if (!this._onThreadScroll) {
      this._onThreadScroll = () => this.#syncStickFromScroll();
    }
    if (!this._onMutate) {
      this._onMutate = () => {
        this.stickToBottom = true;
        this.#queueScroll();
      };
    }
    if (!this._onStreamRender) {
      this._onStreamRender = (event) => this.#wrapStreamRender(event);
    }
    if (!this._onKeydown) {
      this._onKeydown = (event) => {
        if (event.key !== "Escape") return;
        if (this.hasSheetTarget && this.sheetTarget.classList.contains("is-open")) {
          this.closeSheet();
        }
      };
    }
    if (!this._onInput) {
      this._onInput = () => this.autosize();
    }
  }

  #send() {
    if (!this.hasSubmitTarget || this.submitTarget.disabled) return;
    this.#setSending(true, { pressed: true });
    this.submitTarget.click();
  }

  #lockPending() {
    this.#setSending(true);
    if (this.hasSubmitTarget) this.submitTarget.disabled = true;
    if (this.hasInputTarget) {
      this.inputTarget.readOnly = true;
      this.inputTarget.value = "";
      this.autosize();
    }
  }

  #setSending(on, { pressed = false } = {}) {
    if (!this.hasSubmitTarget) return;
    this.submitTarget.classList.toggle("is-sending", on);
    this.submitTarget.classList.toggle("is-pressed", on && pressed);
    this.submitTarget.setAttribute("aria-busy", on ? "true" : "false");
    if (!on) this.submitTarget.classList.remove("is-pressed");
  }

  #focusComposer() {
    if (!this.hasInputTarget) return;
    if (this.inputTarget.readOnly) return;
    requestAnimationFrame(() => {
      if (!this.hasInputTarget || this.inputTarget.readOnly) return;
      this.inputTarget.focus({ preventScroll: true });
    });
  }

  #bindThread(element) {
    this.#ensureCallbacks();
    if (this._boundThread && this._boundThread !== element) {
      this.#unbindThread(this._boundThread);
    }
    this._boundThread = element;
    element.addEventListener("scroll", this._onThreadScroll, { passive: true });
    if (this._observer) this._observer.disconnect();
    this._observer = new MutationObserver(this._onMutate);
    this._observer.observe(element, { childList: true, subtree: false });
  }

  #unbindThread(element) {
    if (this._onThreadScroll) {
      element.removeEventListener("scroll", this._onThreadScroll);
    }
    if (this._boundThread === element) this._boundThread = null;
    if (this._observer) {
      this._observer.disconnect();
      this._observer = null;
    }
  }

  #syncStickFromScroll() {
    const el = this.#scrollEl();
    if (!el) return;
    const gap = el.scrollHeight - el.scrollTop - el.clientHeight;
    this.stickToBottom = gap < 120;
  }

  #wrapStreamRender(event) {
    // Rail / draft-pill Cable updates must not thrash thread scroll or steal focus.
    if (!this.#streamAffectsChat(event.target)) return;

    const original = event.detail?.render;
    if (typeof original !== "function") {
      this.stickToBottom = true;
      this.#queueScroll({ force: true });
      return;
    }

    const focusComposer = this.#streamAffectsComposer(event.target);

    event.detail.render = (streamElement) => {
      this.#reconcilePendingUser(streamElement);
      const result = original(streamElement);
      Promise.resolve(result).finally(() => {
        this.#syncDockVisibility();
        this.stickToBottom = true;
        this.#queueScroll({ force: true });
        if (focusComposer) this.#focusComposer();
      });
      return result;
    };
  }

  // Optimistic user bubble uses a temp id. Before morph, adopt the persisted
  // message id from the incoming template so Idiomorph updates in place.
  #reconcilePendingUser(streamElement) {
    if (this.#streamTargetId(streamElement) !== "monitor_assistant_thread") return;

    const pending = document.getElementById("monitor_assistant_pending_user");
    if (!pending) return;

    const pendingText = this.#userBubbleText(pending);
    if (!pendingText) return;

    const template = streamElement.querySelector?.("template");
    const users = template?.content?.querySelectorAll?.(".ma-msg--me[id]");
    if (!users?.length) return;

    let match = null;
    for (let i = users.length - 1; i >= 0; i -= 1) {
      if (this.#userBubbleText(users[i]) === pendingText) {
        match = users[i];
        break;
      }
    }
    if (!match?.id || match.id === pending.id) return;

    pending.id = match.id;
  }

  #userBubbleText(node) {
    const body = node?.querySelector?.(".ma-bub");
    return (body?.textContent || "").replace(/\s+/g, " ").trim();
  }

  #streamAffectsChat(streamElement) {
    const target = this.#streamTargetId(streamElement);
    if (!target) return true;
    return (
      target === "monitor_assistant_thread" ||
      target === "monitor_assistant_messages" ||
      target === "monitor_assistant_composer" ||
      target === "monitor_assistant_apply_dock"
    );
  }

  #streamAffectsComposer(streamElement) {
    return this.#streamTargetId(streamElement) === "monitor_assistant_composer";
  }

  #streamTargetId(streamElement) {
    if (!streamElement || typeof streamElement.getAttribute !== "function") return null;
    return streamElement.getAttribute("target") || streamElement.getAttribute("targets");
  }

  #queueScroll({ force = false } = {}) {
    if (!force && !this.stickToBottom) return;
    clearTimeout(this._scrollTimer);
    cancelAnimationFrame(this._scrollRaf);
    // Immediate + rAF + short timeout: covers Turbo replace, markdown layout,
    // and Stimulus target reconnect races.
    this.#scrollToBottom();
    this._scrollRaf = requestAnimationFrame(() => {
      this.#scrollToBottom();
      this._scrollTimer = setTimeout(() => this.#scrollToBottom(), 50);
    });
  }

  #scrollEl() {
    if (this.hasThreadTarget) return this.threadTarget;
    return this._boundThread;
  }

  #scrollToBottom() {
    const el = this.#scrollEl();
    if (!el) return;
    // Direct assignment is more reliable than scrollTo after DOM swaps.
    el.scrollTop = el.scrollHeight;
  }
}
